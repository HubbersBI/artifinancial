"""Client behaviour around a malformed model response. No network is used."""

from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.llm import client

GOOD = '{"message": "hi", "trades": [], "watchlist_changes": []}'
BAD = '{"message": "hi"}'


def _response(content: str):
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])


def _fake_completion(payloads, calls):
    def call(**kwargs):
        calls.append(kwargs)
        return _response(payloads[len(calls) - 1])

    return call


def test_valid_response_is_parsed_in_one_call(monkeypatch):
    calls = []
    monkeypatch.setattr(client, "completion", _fake_completion([GOOD], calls))

    result = client.complete([{"role": "user", "content": "hi"}])

    assert result.message == "hi"
    assert len(calls) == 1
    assert calls[0]["model"] == "groq/openai/gpt-oss-120b"
    assert calls[0]["response_format"] is client.ChatResponse
    assert calls[0]["reasoning_effort"] == "low"
    assert "stream" not in calls[0] and "tools" not in calls[0]


def test_malformed_response_is_retried_once(monkeypatch):
    calls = []
    monkeypatch.setattr(client, "completion", _fake_completion([BAD, GOOD], calls))

    assert client.complete([]).message == "hi"
    assert len(calls) == 2


def test_two_malformed_responses_raise(monkeypatch):
    calls = []
    monkeypatch.setattr(client, "completion", _fake_completion([BAD, BAD], calls))

    with pytest.raises(ValidationError):
        client.complete([])
    assert len(calls) == 2


def test_the_model_call_carries_a_request_timeout(monkeypatch):
    """Without it a hung provider holds the request for LiteLLM's 600s default."""
    captured = {}

    def fake_completion(**kwargs):
        captured.update(kwargs)
        raise RuntimeError("stop here - only the kwargs matter")

    monkeypatch.setattr("app.llm.client.completion", fake_completion)
    with pytest.raises(RuntimeError):
        client._call([{"role": "user", "content": "hi"}])

    assert captured["timeout"] == client.TIMEOUT_SECONDS
    assert client.TIMEOUT_SECONDS <= 60
