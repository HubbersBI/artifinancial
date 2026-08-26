"""Chat message history."""

from app.db import append_chat_message, list_chat_messages


def test_user_message_has_no_actions():
    message = append_chat_message("user", "buy 10 AAPL")

    assert message["role"] == "user"
    assert message["content"] == "buy 10 AAPL"
    assert message["actions"] is None


def test_actions_round_trip_as_objects():
    actions = {"trades": [{"ticker": "AAPL", "side": "buy", "quantity": 10}]}
    append_chat_message("assistant", "Bought 10 AAPL.", actions)

    stored = list_chat_messages()[-1]

    assert stored["actions"] == actions


def test_history_is_oldest_first():
    append_chat_message("user", "one")
    append_chat_message("assistant", "two")
    append_chat_message("user", "three")

    assert [m["content"] for m in list_chat_messages()] == ["one", "two", "three"]


def test_limit_keeps_the_most_recent_still_in_order():
    for text in ("one", "two", "three"):
        append_chat_message("user", text)

    assert [m["content"] for m in list_chat_messages(limit=2)] == ["two", "three"]


def test_no_messages_yet():
    assert list_chat_messages() == []
