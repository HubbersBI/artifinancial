"""Structured output schema: strict-mode shape and parsing of valid payloads."""

import pytest
from pydantic import ValidationError

from app.llm.schema import ChatResponse


def test_all_three_fields_are_required():
    """Strict mode drops defaulted fields from required, which breaks compliance."""
    schema = ChatResponse.model_json_schema()
    assert set(schema["required"]) == {"message", "trades", "watchlist_changes"}


def test_every_object_forbids_extra_keys():
    schema = ChatResponse.model_json_schema()
    assert schema["additionalProperties"] is False
    for definition in schema["$defs"].values():
        assert definition["additionalProperties"] is False


def test_parses_reply_with_no_actions():
    parsed = ChatResponse.model_validate_json(
        '{"message": "hello", "trades": [], "watchlist_changes": []}'
    )
    assert parsed.message == "hello"
    assert parsed.trades == []
    assert parsed.watchlist_changes == []


def test_parses_reply_with_trade_and_watchlist_change():
    parsed = ChatResponse.model_validate_json(
        '{"message": "done", '
        '"trades": [{"ticker": "AAPL", "side": "buy", "quantity": 10}], '
        '"watchlist_changes": [{"ticker": "PYPL", "action": "add"}]}'
    )
    assert parsed.trades[0].ticker == "AAPL"
    assert parsed.trades[0].quantity == 10.0
    assert parsed.watchlist_changes[0].action == "add"


@pytest.mark.parametrize(
    "payload",
    [
        "not json at all",
        '{"message": "hi"}',
        '{"message": "hi", "trades": [], "watchlist_changes": null}',
        '{"message": "hi", "trades": [{"ticker": "AAPL", "side": "hold", "quantity": 1}],'
        ' "watchlist_changes": []}',
        '{"message": "hi", "trades": [], "watchlist_changes": [], "extra": 1}',
    ],
)
def test_malformed_payloads_raise_validation_error(payload):
    with pytest.raises(ValidationError):
        ChatResponse.model_validate_json(payload)
