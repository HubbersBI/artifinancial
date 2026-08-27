# Artifinancial Project - your AI Finance Ally

All project documentation is in the `planning` directory.

The key document is PLAN.md included in full below; the market data component has been completed and is summarized in the file `planning/MARKET_DATA_SUMMARY.md` with more details in the `planning/archive` folder. Consult these docs only when required. The remainder of the platform is still to be developed.

@planning/PLAN.md

## Hosting

Two builds from one codebase.

- **Docker** — FastAPI serving `/api`, the SSE stream and the export on one port.
  The development path, unchanged. `GROQ_API_KEY` may be set here for a real model.
- **Static** — `NEXT_PUBLIC_ARTIFINANCIAL_STATIC=true`. No backend at all: the
  simulator, the portfolio and the assistant run in the browser
  (`frontend/src/lib/engine/`). This is what is published.

The static build is possible because nothing in this app was ever real or shared.
Prices come from a generator, the $10,000 is virtual, and no visitor could see
another's portfolio. The server was hosting a private sandbox per person, which is
what a browser already is.

Rules for the engine, which are not preferences:

- **The engine mirrors the Python, and is pinned to it.** `simulator.ts` is a port
  of `market/simulator.py`; `state.ts` carries the PLAN section 8 trade rules;
  `chat.ts` is `llm/mock.py`. `engine/__tests__/parity.test.ts` holds the port to
  reference values computed by the Python's own formula. If the two drift, the
  container and the published site are simulating different worlds.
- **The assistant says it is a mock in every reply.** The static build has nowhere
  to keep a key, so it runs the `LLM_MOCK=true` path the backend already shipped.
  "Mock assistant:" is the honest signal that no model is involved; do not remove
  it to make the demo look cleverer.
- **The published site says the market is simulated before it is used.** Real
  ticker symbols at realistic prices beside the word LIVE is the one way a
  portfolio piece about markets can mislead. A modal on first visit, a badge in
  the header after that (`SimulatedNotice.tsx`).
- **State is per browser and never leaves it.** localStorage, flushed on
  `pagehide` because writes are debounced. Nothing is uploaded, and there is
  nothing to upload it to.

## Gitignore

`lib/` in the Python template matched `frontend/src/lib/` and silently excluded
every file in it, so the project could not be built from a clone. The root-level
rules are anchored with a leading slash for that reason. Do not unanchor them.
