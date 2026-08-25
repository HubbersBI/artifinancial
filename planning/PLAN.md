# Artifinancial — AI Trading Workstation

## Project Specification

## 1. Vision

Artifinancial is a visually stunning AI-powered trading workstation that streams live market data, lets users trade a simulated portfolio, and integrates an LLM chat assistant that can analyze positions and execute trades on the user's behalf. It looks and feels like a modern Bloomberg terminal with an AI copilot.

This is the capstone project for an agentic AI coding course. It is built entirely by Coding Agents demonstrating how orchestrated AI agents can produce a production-quality full-stack application. Agents interact through files in `planning/`.

## 2. User Experience

### First Launch

The user runs a single Docker command (or a provided start script). A browser opens to `http://localhost:8000`. No login, no signup. They immediately see:

- A watchlist of 10 default tickers with live-updating prices in a grid
- $10,000 in virtual cash
- A dark, data-rich trading terminal aesthetic
- An AI chat panel ready to assist

### What the User Can Do

- **Watch prices stream** — prices flash green (uptick) or red (downtick) with subtle CSS animations that fade
- **View sparkline mini-charts** — price action beside each ticker in the watchlist, accumulated on the frontend from the SSE stream since page load (sparklines fill in progressively)
- **Click a ticker** to see a larger detailed chart in the main chart area (also accumulated from the stream since page load)
- **Buy and sell shares** — market orders only, instant fill at current price, no fees, no confirmation dialog
- **Monitor their portfolio** — a heatmap (treemap) showing positions sized by weight and colored by P&L, plus a P&L chart tracking total portfolio value over time
- **View a positions table** — ticker, quantity, average cost, current price, unrealized P&L, % change
- **Chat with the AI assistant** — ask about their portfolio, get analysis, and have the AI execute trades and manage the watchlist through natural language
- **Manage the watchlist** — add/remove tickers manually or via the AI chat

### Visual Design

- **Dark theme**: backgrounds around `#0d1117` or `#1a1a2e`, muted gray borders, no pure black
- **Price flash animations**: brief green/red background highlight on price change, fading over ~500ms via CSS transitions
- **Connection status indicator**: a small colored dot (green = connected, yellow = reconnecting, red = disconnected) visible in the header
- **Professional, data-dense layout**: inspired by Bloomberg/trading terminals — every pixel earns its place
- **Responsive but desktop-first**: optimized for wide screens, functional on tablet

### Color Scheme
- Accent Yellow: `#ecad0a`
- Blue Primary: `#209dd7`
- Purple Secondary: `#753991` (submit buttons)

## 3. Architecture Overview

### Single Container, Single Port

```
┌─────────────────────────────────────────────────┐
│  Docker Container (port 8000)                   │
│                                                 │
│  FastAPI (Python/uv)                            │
│  ├── /api/*          REST endpoints             │
│  ├── /api/stream/*   SSE streaming              │
│  └── /*              Static file serving         │
│                      (Next.js export)            │
│                                                 │
│  SQLite database (volume-mounted)               │
│  Background task: market data polling/sim        │
└─────────────────────────────────────────────────┘
```

- **Frontend**: Next.js with TypeScript, built as a static export (`output: 'export'`), served by FastAPI as static files
- **Backend**: FastAPI (Python), managed as a `uv` project
- **Database**: SQLite, single file at `db/artifinancial.db`, volume-mounted for persistence
- **Real-time data**: Server-Sent Events (SSE) — simpler than WebSockets, one-way server→client push, works everywhere
- **AI integration**: LiteLLM → Groq (`gpt-oss-120b`, free tier), with structured outputs for trade execution
- **Market data**: Environment-variable driven — simulator by default, real data via Massive API if key provided

### Why These Choices

| Decision | Rationale |
|---|---|
| SSE over WebSockets | One-way push is all we need; simpler, no bidirectional complexity, universal browser support |
| Static Next.js export | Single origin, no CORS issues, one port, one container, simple deployment |
| SQLite over Postgres | No auth = no multi-user = no need for a database server; self-contained, zero config |
| Single Docker container | Students run one command; no docker-compose for production, no service orchestration |
| uv for Python | Fast, modern Python project management; reproducible lockfile; what students should learn |
| Market orders only | Eliminates order book, limit order logic, partial fills — dramatically simpler portfolio math |

---

## 4. Directory Structure

```
artifinancial/
├── frontend/                 # Next.js TypeScript project (static export)
├── backend/                  # FastAPI uv project (Python)
│   └── db/                   # Schema definitions, seed data, migration logic
├── planning/                 # Project-wide documentation for agents
│   ├── PLAN.md               # This document
│   └── ...                   # Additional agent reference docs
├── scripts/
│   ├── start_mac.sh          # Launch Docker container (macOS/Linux)
│   ├── stop_mac.sh           # Stop Docker container (macOS/Linux)
│   ├── start_windows.ps1     # Launch Docker container (Windows PowerShell)
│   └── stop_windows.ps1      # Stop Docker container (Windows PowerShell)
├── test/                     # Playwright E2E tests + docker-compose.test.yml
├── db/                       # SQLite file lives here when running outside Docker
│   └── .gitkeep              # Directory is committed; db/*.db is gitignored
├── Dockerfile                # Multi-stage build (Node → Python)
├── docker-compose.yml        # Optional convenience wrapper
├── .env                      # Environment variables (gitignored, .env.example committed)
└── .gitignore
```

### Key Boundaries

- **`frontend/`** is a self-contained Next.js project. It knows nothing about Python. It talks to the backend via `/api/*` endpoints and `/api/stream/*` SSE endpoints. Internal structure is up to the Frontend Engineer agent.
- **`backend/`** is a self-contained uv project with its own `pyproject.toml`. It owns all server logic including database initialization, schema, seed data, API routes, SSE streaming, market data, and LLM integration. Internal structure is up to the Backend/Market Data agents.
- **`backend/db/`** contains schema SQL definitions and seed logic. The backend lazily initializes the database on first request — creating tables and seeding default data if the SQLite file doesn't exist or is empty.
- **`db/`** at the top level is where the backend writes `artifinancial.db` when run directly (outside Docker). In the container the same relative path resolves to `/app/db`, which is backed by a named Docker volume — see §11. The two are separate stores; the project-root `db/` is not mounted into the container.
- **`planning/`** contains project-wide documentation, including this plan. All agents reference files here as the shared contract.
- **`test/`** contains Playwright E2E tests and supporting infrastructure (e.g., `docker-compose.test.yml`). Unit tests live within `frontend/` and `backend/` respectively, following each framework's conventions.
- **`scripts/`** contains start/stop scripts that wrap Docker commands.

---

## 5. Environment Variables

```bash
# Required: Groq API key for the LLM chat assistant
GROQ_API_KEY=your-groq-api-key-here

# Optional: Massive (Polygon.io) API key for real market data
# If not set, the built-in market simulator is used (recommended for most users)
MASSIVE_API_KEY=

# Optional: Set to "true" for deterministic mock LLM responses (testing)
LLM_MOCK=false
```

`.env.example` is committed with these keys and placeholder values; `.env` is gitignored. Copy one to the other and fill in the key.

### Behavior

- If `MASSIVE_API_KEY` is set and non-empty → backend uses Massive REST API for market data
- If `MASSIVE_API_KEY` is absent or empty → backend uses the built-in market simulator
- If `LLM_MOCK=true` → backend returns deterministic mock LLM responses (for E2E tests) and `GROQ_API_KEY` is not required
- The backend reads `.env` from the project root (mounted into the container or read via docker `--env-file`)

---

## 6. Market Data

### Two Implementations, One Interface

Both the simulator and the Massive client implement the same abstract interface. The backend selects which to use based on the environment variable. All downstream code (SSE streaming, price cache, frontend) is agnostic to the source.

### Simulator (Default)

- Generates prices using geometric Brownian motion (GBM) with configurable drift and volatility per ticker
- Updates at ~500ms intervals
- Correlated moves across tickers (e.g., tech stocks move together)
- Occasional random "events" — sudden 2-5% moves on a ticker for drama
- Starts from realistic seed prices (e.g., AAPL ~$190, GOOGL ~$175, etc.)
- Runs as an in-process background task — no external dependencies

### Massive API (Optional)

- REST API polling (not WebSocket) — simpler, works on all tiers
- Polls for the union of all watched tickers on a configurable interval
- Free tier (5 calls/min): poll every 15 seconds
- Paid tiers: poll every 2-15 seconds depending on tier
- Parses REST response into the same format as the simulator

### Shared Price Cache

- A single background task (simulator or Massive poller) writes to an in-memory price cache
- The cache holds the latest price, previous price, and timestamp for each ticker
- Which tickers get tracked is driven by the API layer, not by the market data subsystem: it is the union of the watchlist and any ticker with an open position (see §8, Tracked Ticker Set)
- SSE streams read from this cache and push updates to connected clients
- This architecture supports future multi-user scenarios without changes to the data layer

### SSE Streaming

- Endpoint: `GET /api/stream/prices`
- Long-lived SSE connection; client uses native `EventSource` API
- Server pushes price updates for all tickers known to the system at a regular cadence (~500ms) — in the single-user model this is equivalent to the user's watchlist
- Each event carries **every** tracked ticker in a single JSON object keyed by symbol — not one event per ticker:

  ```
  data: {"AAPL": {"ticker": "AAPL", "price": 190.50, "previous_price": 190.42, "timestamp": 1756000000.123, "change": 0.08, "change_percent": 0.042, "direction": "up"}, "GOOGL": {...}}
  ```

  `timestamp` is Unix seconds (float). `direction` is `"up"`, `"down"`, or `"flat"`.
- An event is sent only when the price cache has changed since the last send (version-based change detection), so an idle stream stays quiet
- The stream opens with a `retry: 1000` directive; the client reconnects automatically (EventSource has built-in retry)

### No Price History

There is no historical price API and no stored price series — the price cache holds only the latest and previous tick per ticker. Every chart in the UI (sparklines and the main chart alike) accumulates points on the frontend from SSE since page load, and resets on reload. Fetching intraday bars from Massive is deliberately out of scope: it would not work in simulator mode, which is the default experience.

The one exception is the P&L chart, which is backed by real persisted data in `portfolio_snapshots` (§7) and therefore survives reloads.

---

## 7. Database

### SQLite with Lazy Initialization

The backend checks for the SQLite database on startup (or first request). If the file doesn't exist or tables are missing, it creates the schema and seeds default data. This means:

- No separate migration step
- No manual database setup
- Fresh Docker volumes start with a clean, seeded database automatically

### Schema

All tables include a `user_id` column defaulting to `"default"`. This is hardcoded for now (single-user) but enables future multi-user support without schema migration.

**users_profile** — User state (cash balance)
- `id` TEXT PRIMARY KEY (default: `"default"`)
- `cash_balance` REAL (default: `10000.0`)
- `created_at` TEXT (ISO timestamp)

**watchlist** — Tickers the user is watching
- `id` TEXT PRIMARY KEY (UUID)
- `user_id` TEXT (default: `"default"`)
- `ticker` TEXT
- `added_at` TEXT (ISO timestamp)
- UNIQUE constraint on `(user_id, ticker)`

**positions** — Current holdings (one row per ticker per user)
- `id` TEXT PRIMARY KEY (UUID)
- `user_id` TEXT (default: `"default"`)
- `ticker` TEXT
- `quantity` REAL (fractional shares supported)
- `avg_cost` REAL
- `updated_at` TEXT (ISO timestamp)
- UNIQUE constraint on `(user_id, ticker)`

**trades** — Trade history (append-only log)
- `id` TEXT PRIMARY KEY (UUID)
- `user_id` TEXT (default: `"default"`)
- `ticker` TEXT
- `side` TEXT (`"buy"` or `"sell"`)
- `quantity` REAL (fractional shares supported)
- `price` REAL
- `executed_at` TEXT (ISO timestamp)

**portfolio_snapshots** — Portfolio value over time (for P&L chart). Recorded every 30 seconds by a background task, and immediately after each trade execution.
- `id` TEXT PRIMARY KEY (UUID)
- `user_id` TEXT (default: `"default"`)
- `total_value` REAL
- `recorded_at` TEXT (ISO timestamp)

**chat_messages** — Conversation history with LLM
- `id` TEXT PRIMARY KEY (UUID)
- `user_id` TEXT (default: `"default"`)
- `role` TEXT (`"user"` or `"assistant"`)
- `content` TEXT
- `actions` TEXT (JSON — trades executed, watchlist changes made; null for user messages)
- `created_at` TEXT (ISO timestamp)

### Default Seed Data

- One user profile: `id="default"`, `cash_balance=10000.0`
- Ten watchlist entries: AAPL, GOOGL, MSFT, AMZN, TSLA, NVDA, META, JPM, V, NFLX

---

## 8. API Endpoints

### Market Data
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/stream/prices` | SSE stream of live price updates |

### Portfolio
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/portfolio` | Current positions, cash balance, total value, unrealized P&L |
| POST | `/api/portfolio/trade` | Execute a trade: `{ticker, quantity, side}` |
| GET | `/api/portfolio/history` | Portfolio value snapshots over time (for P&L chart) |
| GET | `/api/trades` | Trade history, newest first. Query params: `limit` (default 50), `ticker` (optional filter) |

### Watchlist
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/watchlist` | Current watchlist tickers with latest prices |
| POST | `/api/watchlist` | Add a ticker: `{ticker}` |
| DELETE | `/api/watchlist/{ticker}` | Remove a ticker |

### Chat
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat` | Send a message, receive complete JSON response (message + executed actions) |
| GET | `/api/chat/history` | Past conversation, oldest first, for repopulating the chat panel on page load. Query param: `limit` (default 50). Each message includes its stored `actions` JSON so executed trades render inline on reload |

### System
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check (for Docker/deployment) |

### Trade Execution Rules

Market orders fill instantly at the ticker's latest price in the shared price cache. The same rules apply to manual trades and to trades the LLM auto-executes (§9).

- **No cached price → reject.** A ticker with no entry in the price cache cannot be traded: return `400` with a message like `"No price available for PYPL yet"`. This is a real case, not a corner case — a ticker added to the watchlist has no price until the next tick, which is ~500ms in simulator mode but up to 15s on the Massive free tier. The frontend should surface this as "waiting for price" rather than as an error state.
- **Quantity must be > 0.** Reject `0`, negatives, and non-numeric values with `400`. Fractional quantities are allowed.
- **Buys require sufficient cash**: `quantity * price <= cash_balance`. Otherwise `400` with the shortfall in the message.
- **Sells require sufficient shares**: `quantity <= position.quantity`. No shorting. Otherwise `400`.
- **Buys update `avg_cost`** as a weighted average of the existing and new lots. **Sells do not change `avg_cost`** — realized P&L is not tracked separately in this build.
- **A position reaching quantity 0 is deleted**, not left as a zero row.
- **Every fill** appends to `trades` and writes a `portfolio_snapshots` row immediately (§7).

### Watchlist Rules

- **Format validation only.** A ticker is uppercased and must match `^[A-Z]{1,5}$`. There is no symbol-existence check.
- **Simulator mode**: any well-formed symbol is accepted and starts at a default seed price with `DEFAULT_PARAMS` volatility/drift.
- **Massive mode**: an unknown symbol is accepted but simply never receives a price. It stays in the watchlist showing "waiting for price" and cannot be traded (see above). This is the deliberate trade-off for not calling a symbol-lookup endpoint.
- **Duplicates** are rejected with `409` (the `(user_id, ticker)` UNIQUE constraint).
- **Removing a ticker with an open position** is allowed — the position and its live price remain in the portfolio. The watchlist is a display list, not a constraint on holdings. See Tracked Ticker Set below for what this means for the data source.

### Tracked Ticker Set

The watchlist table and the market data source are two separate pieces of state, and the API layer is responsible for keeping them in sync. The invariant:

> **The set of tickers tracked by the market data source is the union of the watchlist and all tickers with an open position.**

Positions are included because a position needs a live price for valuation, and §8 forbids trading a ticker with no cached price. A held ticker must stay tracked even after it leaves the watchlist.

- **On startup**, compute that union from SQLite and pass it to `source.start(tickers)`.
- **`POST /api/watchlist`** — after the DB insert, `await source.add_ticker(ticker)`.
- **`DELETE /api/watchlist/{ticker}`** — after the DB delete, call `await source.remove_ticker(ticker)` **only if no open position remains** for that ticker. If a position is held, leave it tracked.

**Why the conditional matters**: `remove_ticker()` also evicts the ticker from the shared price cache (`simulator.py:254`, `massive_client.py:75`). Calling it unconditionally on a held ticker drops its price, which makes the position value as stale or zero in `GET /api/portfolio` and makes it impossible to sell — the §8 no-cached-price rule would reject the closing trade. That is the bug this invariant exists to prevent.

**Add latency differs by source**, which is what the "waiting for price" state in §8 is for: the simulator seeds the cache inside `add_ticker()` so a price exists immediately, while the Massive poller only picks the ticker up on its next cycle (up to 15s on the free tier).

---

## 9. LLM Integration

All LLM calls go through **LiteLLM to Groq**, using the `groq/openai/gpt-oss-120b` model. Structured Outputs are used to interpret the results.

```python
from litellm import completion

completion(model="groq/openai/gpt-oss-120b", messages=[...])  # reads GROQ_API_KEY from env
```

`GROQ_API_KEY` lives in the `.env` file in the project root (see §5).

When writing the LLM code, use the **`groq` skill** (`.claude/skills/groq/SKILL.md`). It carries the call patterns, the strict-mode Pydantic rules, and the response schema as working code.

**Why Groq**: `gpt-oss-120b` is served free on Groq's developer tier — no credit card, no credit balance, rate-limited only — and Groq supports `json_schema` with `strict: true` on the GPT-OSS models, which guarantees the response matches the schema below. That guarantee is what makes auto-execution (below) safe to build on.

### Free Tier Limits and What They Imply

Groq's free tier for this model is roughly **30 requests/min, 1,000 requests/day, 8,000 tokens/min, 200,000 tokens/day**. Tokens per minute is the binding constraint, not requests: a chat turn carrying portfolio context plus history runs 2-3K tokens, so the practical ceiling is a couple of turns per minute and roughly 50-60 turns per day. Two consequences, both load-bearing:

- **Cap conversation history** at the ~10 most recent messages when building the prompt (step 2 below). Unbounded history is what silently exhausts the token budget.
- **Send compact portfolio context** — aggregate figures and positions, not a raw dump of every table row. This helps response quality as well as quota.

Development and E2E tests should run with `LLM_MOCK=true` so no quota is consumed while building.

> **Note**: `strict: true` structured outputs on Groq are incompatible with streaming and with tool use. Neither affects this design — §9 deliberately returns a complete response rather than streaming tokens, and trades are expressed through the response schema rather than tool calls.

### How It Works

When the user sends a chat message, the backend:

1. Loads the user's current portfolio context (cash, positions with P&L, watchlist with live prices, total portfolio value)
2. Loads recent conversation history from the `chat_messages` table
3. Constructs a prompt with a system message, portfolio context, conversation history, and the user's new message
4. Calls the LLM via LiteLLM → Groq, requesting structured output with `strict: true`
5. Parses the complete structured JSON response
6. Auto-executes any trades or watchlist changes specified in the response
7. Stores the message and executed actions in `chat_messages`
8. Returns the complete JSON response to the frontend (no token-by-token streaming — Groq's inference is fast enough that a loading indicator is sufficient, and strict structured outputs cannot be streamed anyway)

### Structured Output Schema

The LLM is instructed to respond with JSON matching this schema:

```json
{
  "message": "Your conversational response to the user",
  "trades": [
    {"ticker": "AAPL", "side": "buy", "quantity": 10}
  ],
  "watchlist_changes": [
    {"ticker": "PYPL", "action": "add"}
  ]
}
```

All three fields are **required** — none is optional. Strict structured outputs omit any field carrying a default value from the schema's `required` list, which breaks the compliance guarantee, so the model returns `[]` for the action arrays rather than omitting them. The system prompt must say so explicitly.

- `message`: The conversational text shown to the user
- `trades`: Trades to auto-execute, or `[]`. Each goes through the Trade Execution Rules in §8 — identical validation to manual trades, including the no-cached-price rejection
- `watchlist_changes`: Watchlist modifications, or `[]`

### Auto-Execution

Trades specified by the LLM execute automatically — no confirmation dialog. This is a deliberate design choice:
- It's a simulated environment with fake money, so the stakes are zero
- It creates an impressive, fluid demo experience
- It demonstrates agentic AI capabilities — the core theme of the course

If a trade fails validation (e.g., insufficient cash), the error is included in the chat response so the LLM can inform the user.

### System Prompt Guidance

The LLM should be prompted as "Artifinancial, an AI trading assistant" with instructions to:
- Analyze portfolio composition, risk concentration, and P&L
- Suggest trades with reasoning
- Execute trades when the user asks or agrees
- Manage the watchlist proactively
- Be concise and data-driven in responses
- Always respond with valid structured JSON

### LLM Mock Mode

When `LLM_MOCK=true`, the backend returns deterministic mock responses instead of calling Groq. This enables:
- Fast, free, reproducible E2E tests
- Development without an API key
- CI/CD pipelines

---

## 10. Frontend Design

### Layout

The frontend is a single-page application with a dense, terminal-inspired layout. The specific component architecture and layout system is up to the Frontend Engineer, but the UI should include these elements:

- **Watchlist panel** — grid/table of watched tickers with: ticker symbol, current price (flashing green/red on change), daily change %, and a sparkline mini-chart (accumulated from SSE since page load)
- **Main chart area** — larger chart for the currently selected ticker, price over time. Clicking a ticker in the watchlist selects it here. Like the sparklines, this chart is built from SSE ticks accumulated since page load — there is no historical price API (see §6). It starts empty and fills in, so render an explicit "collecting data" state rather than a blank panel.
- **Portfolio heatmap** — treemap visualization where each rectangle is a position, sized by portfolio weight, colored by P&L (green = profit, red = loss)
- **P&L chart** — line chart showing total portfolio value over time, using data from `portfolio_snapshots`
- **Positions table** — tabular view of all positions: ticker, quantity, avg cost, current price, unrealized P&L, % change. A second tab shows **recent trades** from `GET /api/trades` — time, ticker, side, quantity, fill price.
- **Trade bar** — simple input area: ticker field, quantity field, buy button, sell button. Market orders, instant fill. Rejected trades (§8) surface their error message inline.
- **AI chat panel** — docked/collapsible sidebar. Message input, scrolling conversation history, loading indicator while waiting for LLM response. Trade executions and watchlist changes shown inline as confirmations. On mount, the panel loads prior messages from `GET /api/chat/history` so the conversation survives a page reload.
- **Header** — portfolio total value (updating live), connection status indicator, cash balance

### Technical Notes

- Use `EventSource` for SSE connection to `/api/stream/prices`
- Canvas-based charting library preferred (Lightweight Charts or Recharts) for performance
- Price flash effect: on receiving a new price, briefly apply a CSS class with background color transition, then remove it
- All API calls go to the same origin (`/api/*`) — no CORS configuration needed
- Tailwind CSS for styling with a custom dark theme

---

## 11. Docker & Deployment

### Multi-Stage Dockerfile

```
Stage 1: Node 20 slim
  - Copy frontend/
  - npm install && npm run build (produces static export)

Stage 2: Python 3.12 slim
  - Install uv
  - Copy backend/
  - uv sync (install Python dependencies from lockfile)
  - Copy frontend build output into a static/ directory
  - Expose port 8000
  - CMD: uvicorn serving FastAPI app
```

FastAPI serves the static frontend files and all API routes on port 8000.

### Docker Volume

The SQLite database persists via a named Docker volume:

```bash
docker run -v artifinancial-data:/app/db -p 8000:8000 --env-file .env artifinancial
```

The volume is mounted at `/app/db` inside the container, where the backend writes `artifinancial.db`. Docker manages this volume: it survives `docker rm` and is removed only by `docker volume rm artifinancial-data`. It is **not** the project-root `db/` directory, which is used only when running the backend outside Docker.

A named volume is used rather than a bind mount of `./db` because SQLite file locking is unreliable over Docker Desktop bind mounts on Windows and macOS.

### Start/Stop Scripts

**`scripts/start_mac.sh`** (macOS/Linux):
- Builds the Docker image if not already built (or if `--build` flag passed)
- Runs the container with the volume mount, port mapping, and `.env` file
- Prints the URL to access the app
- Optionally opens the browser

**`scripts/stop_mac.sh`** (macOS/Linux):
- Stops and removes the running container
- Does NOT remove the volume (data persists)

**`scripts/start_windows.ps1`** / **`scripts/stop_windows.ps1`**: PowerShell equivalents for Windows.

All scripts should be idempotent — safe to run multiple times.

### Optional Cloud Deployment

The container is designed to deploy to AWS App Runner, Render, or any container platform. A Terraform configuration for App Runner may be provided in a `deploy/` directory as a stretch goal, but is not part of the core build.

---

## 12. Testing Strategy

### Unit Tests (within `frontend/` and `backend/`)

**Backend (pytest)**:
- Market data: simulator generates valid prices, GBM math is correct, Massive API response parsing works, both implementations conform to the abstract interface
- Portfolio: trade execution logic, P&L calculations, and every rejection path in §8 (selling more than owned, buying with insufficient cash, zero/negative quantity, trading a ticker with no cached price, selling at a loss); weighted `avg_cost` on repeat buys; position deleted at quantity 0
- LLM: structured output parsing handles all valid schemas, graceful handling of malformed responses, trade validation within chat flow
- API routes: correct status codes, response shapes, error handling
- Ticker sync: watchlist add calls `add_ticker`, watchlist delete calls `remove_ticker` only when no position is held, and startup tracks the watchlist-plus-positions union (§8)

**Frontend (React Testing Library or similar)**:
- Component rendering with mock data
- Price flash animation triggers correctly on price changes
- Watchlist CRUD operations
- Portfolio display calculations
- Chat message rendering and loading state

### E2E Tests (in `test/`)

**Infrastructure**: A separate `docker-compose.test.yml` in `test/` that spins up the app container plus a Playwright container. This keeps browser dependencies out of the production image.

**Environment**: Tests run with `LLM_MOCK=true` by default for speed and determinism.

**Key Scenarios**:
- Fresh start: default watchlist appears, $10k balance shown, prices are streaming
- Add and remove a ticker from the watchlist; a newly added ticker starts streaming a price
- Remove a watchlist ticker while holding a position in it: the position keeps its live price and can still be sold
- Buy shares: cash decreases, position appears, portfolio updates
- Sell shares: cash increases, position updates or disappears
- Portfolio visualization: heatmap renders with correct colors, P&L chart has data points
- AI chat (mocked): send a message, receive a response, trade execution appears inline
- Chat persistence: send a message, reload the page, verify the conversation reappears from `/api/chat/history`
- Trade history: after a buy, the trade appears in the recent-trades tab
- SSE resilience: disconnect and verify reconnection
