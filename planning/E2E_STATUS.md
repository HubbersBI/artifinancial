# E2E Status

Owner: integration-tester. Suite lives in `test/`, run with `LLM_MOCK=true`.

## Last run

24 passed / 0 failed (backend 259, frontend 83), against a fresh container
(`artifinancial` image, `--tmpfs /app/db`, `LLM_MOCK=true`, simulator prices).

| Spec | Covers | Result |
|---|---|---|
| 01-fresh-start | seeded watchlist, 10,000 cash, live stream | pass |
| 02-watchlist | add, remove, duplicate rejection | pass |
| 03-ticker-sync | removing a held ticker keeps it priced and sellable | pass |
| 04-trading | buy, sell, rejected sell | pass |
| 05-visualization | heatmap sizing/colour, P&L chart points | pass |
| 06-chat | plain reply, executed trade, rejected trade, watchlist change | pass |
| 07-chat-persistence | conversation and inline actions survive reload | pass |
| 08-trade-history | a buy appears in the recent-trades tab | pass |
| 09-sse-resilience | dropped stream reconnects, hard close freezes prices | pass |
| 10-chat-failure | a 502 from the assistant renders in the panel | pass |

`01-fresh-start` asserts seeded state and only passes against an untouched
database. Every other spec resets through the API in `beforeEach`.

## Open issues

| # | Issue | Owner | State |
|---|---|---|---|
| 1 | `/api/health` did not report mock mode, so the guard could only warn. | backend-api-engineer | fixed - health returns `llm_mock`, guard verified blocking |
| 2 | `litellm.JSONSchemaValidationError` fell into the `openai.APIError` branch and dumped the whole schema into the panel. | llm-engineer | fixed - own branch, reads as an unreadable response |
| 3 | No request timeout, so a hung provider held the request for LiteLLM's 600s default. | llm-engineer | fixed - 30s `TIMEOUT_SECONDS` |

## Guard against running on the user's app

The suite's default `BASE_URL` is `http://localhost:8000`, the same port
`scripts/start_windows.ps1` uses. Run against a throwaway container instead:

```
docker run -d --name artifinancial-e2e -p 8010:8000 --tmpfs /app/db \
  -e LLM_MOCK=true -e MASSIVE_API_KEY= -e GROQ_API_KEY=unused artifinancial
BASE_URL=http://localhost:8010 npx playwright test
```

or `npm run docker:test`, which builds and wires both containers itself.
