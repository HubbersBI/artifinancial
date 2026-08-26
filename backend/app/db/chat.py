"""Chat message history."""

from __future__ import annotations

import json

from .connection import DEFAULT_USER_ID, connection, row_to_dict
from .util import new_id, now_iso


def append_chat_message(
    role: str,
    content: str,
    actions: dict | list | None = None,
    user_id: str = DEFAULT_USER_ID,
) -> dict:
    """Store a message. Actions are serialized to JSON for the caller."""
    with connection() as conn:
        row = (
            new_id(),
            user_id,
            role,
            content,
            json.dumps(actions) if actions is not None else None,
            now_iso(),
        )
        conn.execute(
            "INSERT INTO chat_messages (id, user_id, role, content, actions, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            row,
        )
        message = conn.execute("SELECT * FROM chat_messages WHERE id = ?", (row[0],)).fetchone()
    return _decode(message)


def list_chat_messages(limit: int = 50, user_id: str = DEFAULT_USER_ID) -> list[dict]:
    """The most recent messages, oldest first, for repopulating the chat panel."""
    with connection() as conn:
        rows = conn.execute(
            "SELECT * FROM chat_messages WHERE user_id = ? "
            "ORDER BY created_at DESC, rowid DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
    return [_decode(row) for row in reversed(rows)]


def _decode(row) -> dict:
    """Row to dict with the actions column deserialized."""
    message = row_to_dict(row)
    message["actions"] = json.loads(message["actions"]) if message["actions"] else None
    return message
