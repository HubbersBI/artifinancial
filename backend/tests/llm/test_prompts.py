"""Prompt assembly and the history cap that keeps requests inside the token budget."""

from app.llm.prompts import HISTORY_LIMIT, SYSTEM_PROMPT, build_messages


def _history(count: int) -> list[dict]:
    return [
        {"role": "user" if i % 2 == 0 else "assistant", "content": f"msg {i}"}
        for i in range(count)
    ]


def test_system_prompt_demands_empty_arrays_rather_than_omitted_keys():
    assert '"trades": []' in SYSTEM_PROMPT
    assert '"watchlist_changes": []' in SYSTEM_PROMPT
    assert "REQUIRED" in SYSTEM_PROMPT


def test_message_order_is_system_context_history_then_user():
    messages = build_messages("CASH: $100.00", _history(2), "hello")
    assert messages[0] == {"role": "system", "content": SYSTEM_PROMPT}
    assert messages[1]["role"] == "system"
    assert "CASH: $100.00" in messages[1]["content"]
    assert [m["content"] for m in messages[2:]] == ["msg 0", "msg 1", "hello"]


def test_history_is_capped_at_the_ten_most_recent():
    messages = build_messages("ctx", _history(40), "hello")
    assert len(messages) == 2 + HISTORY_LIMIT + 1
    assert messages[2]["content"] == "msg 30"
    assert messages[-2]["content"] == "msg 39"


def test_short_history_is_not_padded():
    assert len(build_messages("ctx", [], "hello")) == 3
