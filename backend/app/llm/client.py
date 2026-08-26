"""LiteLLM call to Groq with strict structured output.

Strict mode is incompatible with streaming and tool use; neither is used here.
"""

import litellm
from litellm import completion
from pydantic import ValidationError

from .schema import ChatResponse

MODEL = "groq/openai/gpt-oss-120b"

litellm.enable_json_schema_validation = True


def complete(messages: list[dict]) -> ChatResponse:
    """Call the model and parse the structured reply, retrying once on a bad parse."""
    try:
        return _call(messages)
    except ValidationError:
        return _call(messages)


def _call(messages: list[dict]) -> ChatResponse:
    response = completion(
        model=MODEL,
        messages=messages,
        response_format=ChatResponse,
        reasoning_effort="low",
    )
    return ChatResponse.model_validate_json(response.choices[0].message.content)
