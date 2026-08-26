"""Chat endpoints: POST /api/chat and GET /api/chat/history."""

import json
import logging

from fastapi import APIRouter, HTTPException
from litellm.exceptions import JSONSchemaValidationError, RateLimitError
from openai import APIError
from pydantic import BaseModel, ValidationError

from app.db import list_chat_messages
from app.llm import ChatService
from app.portfolio import change_watchlist, execute_trade

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])
service = ChatService(execute_trade, change_watchlist)


class ChatRequest(BaseModel):
    """A single user turn."""

    message: str


@router.post("")
def send_message(request: ChatRequest) -> dict:
    """Run one chat turn, auto-executing any actions the assistant returns."""
    message = request.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message must not be empty")
    try:
        return service.handle(message)
    except RateLimitError:
        raise HTTPException(
            status_code=429, detail="The assistant is rate limited, try again shortly"
        ) from None
    except JSONSchemaValidationError:
        # Subclasses openai.APIError, so it must be caught before the branch
        # below - otherwise the panel shows the whole serialised JSON schema.
        raise HTTPException(
            status_code=502, detail="The assistant returned an unreadable response"
        ) from None
    except APIError as exc:
        # Every provider failure - bad key, network drop, upstream outage - lands
        # here. Groq reports an invalid key as a 400, so catching the base class
        # is what keeps a misconfiguration from surfacing as a bare 500.
        #
        # The base is openai.APIError, not litellm.exceptions.APIError: LiteLLM
        # subclasses the openai exceptions, and its own APIError is a separate
        # class that none of the others inherit from.
        logger.warning("LLM call failed: %s", exc)
        raise HTTPException(
            status_code=502, detail=f"The assistant is unavailable: {provider_reason(exc)}"
        ) from None
    except ValidationError:
        raise HTTPException(
            status_code=502, detail="The assistant returned an unreadable response"
        ) from None


def provider_reason(exc: APIError) -> str:
    """The provider's own error text, unwrapped from LiteLLM's envelope.

    LiteLLM stringifies upstream errors as `... - {"error": {"message": ...}}`.
    The envelope is noise to a user, so pull the message out when it is there
    and fall back to the raw text when the provider used another shape.
    """
    text = str(exc)
    start = text.find("{")
    if start != -1:
        try:
            return json.loads(text[start:])["error"]["message"]
        except (ValueError, KeyError, TypeError):
            pass
    return text


@router.get("/history")
def history(limit: int = 50) -> dict:
    """Past conversation, oldest first, with stored actions for inline rendering."""
    return {"messages": list_chat_messages(limit=limit)}
