"""LiteLLM call to Groq with strict structured output.

Strict mode is incompatible with streaming and tool use; neither is used here.
"""

import litellm
from litellm import completion
from pydantic import ValidationError

from .schema import ChatResponse

MODEL = "groq/openai/gpt-oss-120b"

# LiteLLM defaults to 600s. Groq answers this model in seconds, so a call still
# running after this is hung, and the user is staring at a loading indicator.
TIMEOUT_SECONDS = 30

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
        timeout=TIMEOUT_SECONDS,
    )
    return ChatResponse.model_validate_json(response.choices[0].message.content)
