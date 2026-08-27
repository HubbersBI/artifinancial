# Artifinancial — AI Trading Workstation

### [Open the live terminal](https://hubbersbi.github.io/artifinancial/)

No install and no key. The published build runs entirely in your browser - the
price simulator, the portfolio and the assistant - so nothing you do leaves your
machine. Every price is simulated; see below.

![Artifinancial screenshot](artifinancial.png)

An AI-powered trading workstation that streams live market data, simulates portfolio trading, and integrates an LLM chat assistant that can analyze positions and execute trades via natural language.

Built by a team of six specialist coding agents — each owning a slice of the stack and working in parallel against a shared written interface contract — under my direction as architect and orchestrator

## Features

- **Live price streaming** via SSE with green/red flash animations
- **Simulated portfolio** — $10k virtual cash, market orders, instant fills
- **Portfolio visualizations** — heatmap (treemap), P&L chart, positions table
- **AI chat assistant** — analyzes holdings, suggests and auto-executes trades
- **Watchlist management** — track tickers manually or via AI
- **Dark terminal aesthetic** — Bloomberg-inspired, data-dense layout

## Architecture

Single Docker container serving everything on port 8000:

- **Frontend**: Next.js (static export) with TypeScript and Tailwind CSS
- **Backend**: FastAPI (Python/uv) with SSE streaming
- **Database**: SQLite with lazy initialization
- **AI**: LiteLLM → Groq (`gpt-oss-120b`, free tier) with structured outputs
- **Market data**: Built-in GBM simulator (default) or Massive API (optional)

For the published build the whole of that stack is replaced by
`frontend/src/lib/engine/`, a TypeScript port of the simulator and the trade
rules that runs in the browser. It is pinned to the Python it came from by
`engine/__tests__/parity.test.ts`, so the two cannot quietly diverge.


## Quick Start

Copy the env template and add your Groq key (free, no card: https://console.groq.com).
Set `LLM_MOCK=true` instead to run without a key.

```bash
cp .env.example .env
```

Then start it. The scripts build the image if it is missing, run the container
with the named data volume, wait for health, and open the browser. They are safe
to run repeatedly.

macOS / Linux:

```bash
./scripts/start_mac.sh          # add --build to force a rebuild, --no-open to skip the browser
./scripts/stop_mac.sh           # stops the container, keeps your data
```

Windows (PowerShell):

```powershell
.\scripts\start_windows.ps1     # add -Build to force a rebuild, -NoOpen to skip the browser
.\scripts\stop_windows.ps1
```

Or drive Docker directly:

```bash
docker build -t artifinancial .
docker run -d --name artifinancial \
  -v artifinancial-data:/app/db -p 8000:8000 --env-file .env artifinancial
```

`docker compose up -d` works too. The app is at http://localhost:8000.

Your portfolio lives in the named volume `artifinancial-data`, so it survives
restarts and `docker rm`. Wipe it with `docker volume rm artifinancial-data`.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes | Groq API key for AI chat (free tier, no card: [console.groq.com](https://console.groq.com)). Not needed when `LLM_MOCK=true` |
| `MASSIVE_API_KEY` | No | Massive (Polygon.io) key for real market data; omit to use simulator |
| `LLM_MOCK` | No | Set `true` for deterministic mock LLM responses (testing) |

## Project Structure

```
artifinancial/
├── frontend/    # Next.js static export
├── backend/     # FastAPI uv project
├── planning/    # Project documentation and agent contracts
├── test/        # Playwright E2E tests
├── db/          # SQLite volume mount (runtime)
└── scripts/     # Start/stop helpers
```

## About the live demo

**<https://hubbersbi.github.io/artifinancial/>**

No install and no key. The published build has **no backend at all**: the price
simulator, the portfolio and the assistant all run in your browser, so the market
starts fresh on your machine and your positions never leave it.

Everything on that screen is simulated. The tickers are real companies, the prices
are a random walk, the $10,000 is imaginary and the assistant is a scripted mock
rather than a model. The site says so before it lets you in, and keeps saying so
in the header, because real symbols at realistic prices beside the word LIVE is
the one way a portfolio piece about markets could mislead someone.
