"""The chat turn: auto-execution, rejection surfacing, persistence, history cap."""

import pytest
from pydantic import ValidationError

from app.db import append_chat_message, apply_buy, list_chat_messages
from app.llm import ChatService
from app.llm.schema import ChatResponse, Trade, WatchlistChange
from app.portfolio import TradeError, WatchlistError


@pytest.fixture
def service(recorder):
    return ChatService(recorder.execute_trade, recorder.change_watchlist)


def _reply(service, monkeypatch, response: ChatResponse):
    """Force the model layer to return a fixed structured response."""
    monkeypatch.setattr("app.llm.service.complete", lambda messages: response)
    return service


def test_plain_reply_persists_both_messages_with_empty_actions(service, monkeypatch):
    _reply(service, monkeypatch, ChatResponse(message="hi", trades=[], watchlist_changes=[]))
    result = service.handle("what is my cash?")

    assert result["message"] == "hi"
    assert result["trades"] == []
    assert result["watchlist_changes"] == []
    assert result["created_at"]

    stored = list_chat_messages()
    assert [(m["role"], m["content"]) for m in stored] == [
        ("user", "what is my cash?"),
        ("assistant", "hi"),
    ]
    assert stored[0]["actions"] is None
    assert stored[1]["actions"] == {"trades": [], "watchlist_changes": []}


def test_trade_is_auto_executed_and_reported(service, recorder, monkeypatch):
    _reply(
        service,
        monkeypatch,
        ChatResponse(
            message="bought",
            trades=[Trade(ticker="aapl", side="buy", quantity=3)],
            watchlist_changes=[],
        ),
    )
    result = service.handle("buy 3 AAPL")

    assert recorder.trades == [("AAPL", "buy", 3.0)]
    assert result["trades"] == [
        {
            "ticker": "AAPL",
            "side": "buy",
            "quantity": 3.0,
            "price": 190.50,
            "status": "executed",
            "error": None,
        }
    ]


def test_rejected_trade_surfaces_its_error_instead_of_raising(service, recorder, monkeypatch):
    recorder.trade_error = TradeError("No price available for PYPL yet")
    _reply(
        service,
        monkeypatch,
        ChatResponse(
            message="trying",
            trades=[Trade(ticker="PYPL", side="buy", quantity=1)],
            watchlist_changes=[],
        ),
    )
    trade = service.handle("buy PYPL")["trades"][0]

    assert trade["status"] == "rejected"
    assert trade["error"] == "No price available for PYPL yet"
    assert trade["price"] is None
    assert list_chat_messages()[1]["actions"]["trades"][0]["status"] == "rejected"


def test_insufficient_cash_rejection_is_captured(service, recorder, monkeypatch):
    recorder.trade_error = TradeError("Insufficient cash: short by $500.00")
    _reply(
        service,
        monkeypatch,
        ChatResponse(
            message="trying",
            trades=[Trade(ticker="AAPL", side="buy", quantity=1000)],
            watchlist_changes=[],
        ),
    )
    assert service.handle("buy 1000 AAPL")["trades"][0]["error"] == (
        "Insufficient cash: short by $500.00"
    )


def test_watchlist_changes_execute_and_report(service, recorder, monkeypatch):
    _reply(
        service,
        monkeypatch,
        ChatResponse(
            message="done",
            trades=[],
            watchlist_changes=[
                WatchlistChange(ticker="pypl", action="add"),
                WatchlistChange(ticker="TSLA", action="remove"),
            ],
        ),
    )
    result = service.handle("add PYPL and drop TSLA")

    assert recorder.changes == [("PYPL", "add"), ("TSLA", "remove")]
    assert [c["status"] for c in result["watchlist_changes"]] == ["executed", "executed"]


def test_rejected_watchlist_change_surfaces_its_error(service, recorder, monkeypatch):
    recorder.change_error = WatchlistError("AAPL is already on the watchlist", status=409)
    _reply(
        service,
        monkeypatch,
        ChatResponse(
            message="done", trades=[], watchlist_changes=[WatchlistChange(ticker="AAPL", action="add")]
        ),
    )
    change = service.handle("watch AAPL")["watchlist_changes"][0]
    assert (change["status"], change["error"]) == ("rejected", "AAPL is already on the watchlist")


def test_one_failed_trade_does_not_stop_the_turn(service, recorder, monkeypatch):
    recorder.trade_error = TradeError("nope")
    _reply(
        service,
        monkeypatch,
        ChatResponse(
            message="done",
            trades=[Trade(ticker="AAPL", side="buy", quantity=1)],
            watchlist_changes=[WatchlistChange(ticker="PYPL", action="add")],
        ),
    )
    result = service.handle("buy AAPL and watch PYPL")
    assert result["trades"][0]["status"] == "rejected"
    assert result["watchlist_changes"][0]["status"] == "executed"


def test_prompt_carries_at_most_ten_history_messages(service, monkeypatch):
    for i in range(40):
        append_chat_message("user" if i % 2 == 0 else "assistant", f"old {i}")

    captured = {}

    def fake_complete(messages):
        captured["messages"] = messages
        return ChatResponse(message="ok", trades=[], watchlist_changes=[])

    monkeypatch.setattr("app.llm.service.complete", fake_complete)
    service.handle("new question")

    history = captured["messages"][2:-1]
    assert len(history) == 10
    assert history[0]["content"] == "old 30"
    assert captured["messages"][-1]["content"] == "new question"


def test_portfolio_context_is_included_and_compact(service, monkeypatch):
    apply_buy("AAPL", 5, 180.0)
    captured = {}

    def fake_complete(messages):
        captured["messages"] = messages
        return ChatResponse(message="ok", trades=[], watchlist_changes=[])

    monkeypatch.setattr("app.llm.service.complete", fake_complete)
    service.handle("how am I doing?")

    context = captured["messages"][1]["content"]
    assert "CASH:" in context
    assert "TOTAL PORTFOLIO VALUE:" in context
    assert "AAPL 5 @ avg $180.00" in context
    assert len(context) < 2000


def test_mock_mode_skips_the_model_call_entirely(recorder, monkeypatch):
    monkeypatch.setenv("LLM_MOCK", "true")

    def explode(messages):
        raise AssertionError("the model must not be called in mock mode")

    monkeypatch.setattr("app.llm.service.complete", explode)
    service = ChatService(recorder.execute_trade, recorder.change_watchlist)
    result = service.handle("buy 5 AAPL")

    assert recorder.trades == [("AAPL", "buy", 5.0)]
    assert result["trades"][0]["status"] == "executed"


def test_a_malformed_model_response_propagates_as_a_validation_error(service, monkeypatch):
    def bad(messages):
        return ChatResponse.model_validate_json('{"message": "hi"}')

    monkeypatch.setattr("app.llm.service.complete", bad)
    with pytest.raises(ValidationError):
        service.handle("hello")
