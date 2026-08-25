---
name: groq-inference
description: Use this to write code that calls an LLM using LiteLLM with Groq as the inference provider, including strict structured outputs for the Artifinancial chat assistant
---

# Calling an LLM via Groq

All LLM calls in this project go through LiteLLM to Groq, running `gpt-oss-120b`.
Groq serves this model on a free developer tier and supports strict structured
outputs on it, which is what makes auto-executing trades from the response safe.

## Setup

`GROQ_API_KEY` must be set in the project-root `.env` and loaded into the
environment. LiteLLM reads it automatically; do not pass it explicitly.

The uv project must include litellm and pydantic:

```bash
uv add litellm pydantic
```

## Constants

```python
from litellm import completion

MODEL = "groq/openai/gpt-oss-120b"
```

There is no provider-routing config. Groq is called directly, so the
`extra_body` provider ordering used with aggregator APIs does not apply.

## Text response

```python
response = completion(model=MODEL, messages=messages, reasoning_effort="low")
result = response.choices[0].message.content
```

`reasoning_effort="low"` is the default choice here. Reasoning tokens count
against the free tier's tokens-per-minute budget, and this project's prompts
do not need deep reasoning.

## Structured outputs

Pass a Pydantic model as `response_format`. LiteLLM converts it to a JSON
schema and Groq enforces it.

```python
response = completion(model=MODEL, messages=messages, response_format=MySchema, reasoning_effort="low")
result = MySchema.model_validate_json(response.choices[0].message.content)
```

### Strict mode rules

Groq guarantees schema compliance only in strict mode, and strict mode imposes
two constraints that shape how the Pydantic models must be written:

1. **Every field must be required.** A field with a default value is omitted
   from the schema's `required` list, which breaks strict mode. Give fields no
   defaults, and instruct the model in the system prompt to return empty lists
   rather than omitting keys.
2. **Objects must forbid extra keys.** Set `model_config = ConfigDict(extra="forbid")`
   on every model so the generated schema carries `"additionalProperties": false`.

Strict structured outputs are incompatible with streaming and with tool use.
Neither is used in this project.

To validate the schema client-side as well, set this once at startup:

```python
import litellm
litellm.enable_json_schema_validation = True
```

## The chat response schema

The chat assistant returns one object describing its reply plus any actions to
execute. Note that `trades` and `watchlist_changes` are required, not optional:
the model returns `[]` when it has no action to take.

```python
from typing import Literal
from pydantic import BaseModel, ConfigDict


class Trade(BaseModel):
    """A single market order for the backend to execute."""

    model_config = ConfigDict(extra="forbid")

    ticker: str
    side: Literal["buy", "sell"]
    quantity: float


class WatchlistChange(BaseModel):
    """An addition to or removal from the watchlist."""

    model_config = ConfigDict(extra="forbid")

    ticker: str
    action: Literal["add", "remove"]


class ChatResponse(BaseModel):
    """Structured reply from the trading assistant."""

    model_config = ConfigDict(extra="forbid")

    message: str
    trades: list[Trade]
    watchlist_changes: list[WatchlistChange]
```

Every trade returned still goes through the Trade Execution Rules in PLAN.md
section 8. A schema-valid trade is not necessarily a legal one; validation
rejects it if cash, share count, or price availability do not permit it, and
the error goes back into the chat response.

## Mock mode

When `LLM_MOCK=true`, return a deterministic `ChatResponse` without calling
Groq. Check this before building the prompt so tests consume no quota and need
no API key.

## Free tier budget

Roughly 30 requests/min, 1,000 requests/day, 8,000 tokens/min, 200,000
tokens/day. Tokens per minute binds first, so keep each request small:

- Cap conversation history at the ~10 most recent messages.
- Send aggregated portfolio context, not raw table dumps.
- Keep `reasoning_effort="low"`.

## Errors

Let LiteLLM exceptions propagate rather than wrapping every call. The two worth
handling explicitly at the chat endpoint are `RateLimitError`, which should
return a message telling the user to retry shortly, and a validation failure on
`model_validate_json`, which should be retried once before surfacing an error.
