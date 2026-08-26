# Interface Contracts

The interface between team members. Each section is owned by one agent and
filled in by them **before** their implementation is finished, so others can
build in parallel. See `planning/TEAM.md`.

Additions are free. Changing something already published means telling everyone
who depends on it.

---

## Database repository functions

_Owner: database-engineer. Consumed by: backend-api-engineer, llm-engineer._

Everything is imported from the package root. No other module writes raw SQL.

```python
from app.db import (
    DEFAULT_USER_ID, init_db, db_path, set_db_path,
    get_cash_balance, set_cash_balance, adjust_cash_balance,
    list_watchlist, add_watchlist_ticker, remove_watchlist_ticker,
    list_positions, get_position, upsert_position, delete_position, apply_buy, apply_sell,
    append_trade, list_trades,
    append_snapshot, list_snapshots,
    append_chat_message, list_chat_messages,
)
```

`DEFAULT_USER_ID == "default"`. Every function takes `user_id: str = DEFAULT_USER_ID`
as its last argument; callers can ignore it. Rows come back as plain `dict`s with
the column names of PLAN section 7. Timestamps are ISO-8601 UTC strings, ids are
UUID4 strings.

### Lifecycle

```python
def init_db() -> None            # create file + tables + seed if missing; idempotent
def db_path() -> Path            # resolved SQLite file path
def set_db_path(path: Path | str) -> None   # test hook; resets the init flag
```

Initialization is **lazy** — the first repository call creates and seeds the
database. Calling `init_db()` from FastAPI startup is optional and safe.

Path resolution: `ARTIFINANCIAL_DB_PATH` env var if set, otherwise
`db/artifinancial.db` relative to the process working directory (`/app/db` in the
container). Parent directories are created automatically.

### Cash

```python
def get_cash_balance(user_id: str = DEFAULT_USER_ID) -> float
def set_cash_balance(cash: float, user_id: str = DEFAULT_USER_ID) -> None
def adjust_cash_balance(delta: float, user_id: str = DEFAULT_USER_ID) -> float
```

`adjust_cash_balance` applies the delta in one UPDATE and returns the new balance.
Negative deltas are fine; it does not check for sufficient funds — that is the
API layer's job (PLAN section 8).

### Watchlist

```python
def list_watchlist(user_id: str = DEFAULT_USER_ID) -> list[str]        # oldest added first
def add_watchlist_ticker(ticker: str, user_id: str = DEFAULT_USER_ID) -> dict
def remove_watchlist_ticker(ticker: str, user_id: str = DEFAULT_USER_ID) -> bool
```

`add_watchlist_ticker` raises `sqlite3.IntegrityError` on a duplicate
`(user_id, ticker)` — map it to `409`. It stores the ticker as given; uppercase
and format-validate before calling. Returns
`{"id", "user_id", "ticker", "added_at"}`.
`remove_watchlist_ticker` returns `True` if a row was deleted, `False` if absent.

### Positions

Row shape: `{"id", "user_id", "ticker", "quantity", "avg_cost", "updated_at"}`.

```python
def list_positions(user_id: str = DEFAULT_USER_ID) -> list[dict]       # by ticker
def get_position(ticker: str, user_id: str = DEFAULT_USER_ID) -> dict | None
def upsert_position(ticker: str, quantity: float, avg_cost: float,
                    user_id: str = DEFAULT_USER_ID) -> dict | None
def delete_position(ticker: str, user_id: str = DEFAULT_USER_ID) -> bool
def apply_buy(ticker: str, quantity: float, price: float,
              user_id: str = DEFAULT_USER_ID) -> dict
def apply_sell(ticker: str, quantity: float,
               user_id: str = DEFAULT_USER_ID) -> dict | None
```

Prefer `apply_buy` / `apply_sell` — they carry the PLAN section 8 position rules:

- `apply_buy` recomputes `avg_cost` as the weighted average of the existing and
  new lots, and creates the position if absent.
- `apply_sell` reduces quantity and leaves `avg_cost` unchanged. Reaching zero
  (or below) **deletes** the row and returns `None`; there are never zero rows.
- `upsert_position` with `quantity <= 0` deletes and returns `None`, for the same
  reason.

Neither checks cash or share sufficiency; that is the API layer's job.

### Trades (append-only)

Row shape: `{"id", "user_id", "ticker", "side", "quantity", "price", "executed_at"}`.

```python
def append_trade(ticker: str, side: str, quantity: float, price: float,
                 user_id: str = DEFAULT_USER_ID) -> dict
def list_trades(limit: int = 50, ticker: str | None = None,
                user_id: str = DEFAULT_USER_ID) -> list[dict]          # newest first
```

`side` is `"buy"` or `"sell"`. There is no update or delete.

### Portfolio snapshots

Row shape: `{"id", "user_id", "total_value", "recorded_at"}`.

```python
def append_snapshot(total_value: float, user_id: str = DEFAULT_USER_ID) -> dict
def list_snapshots(limit: int = 500, user_id: str = DEFAULT_USER_ID) -> list[dict]
```

`list_snapshots` returns the most recent `limit` rows in **oldest-first** order,
ready to plot.

### Chat messages

Row shape: `{"id", "user_id", "role", "content", "actions", "created_at"}`.

```python
def append_chat_message(role: str, content: str, actions: dict | list | None = None,
                        user_id: str = DEFAULT_USER_ID) -> dict
def list_chat_messages(limit: int = 50, user_id: str = DEFAULT_USER_ID) -> list[dict]
```

`role` is `"user"` or `"assistant"`. `actions` is stored as JSON TEXT and comes
back already deserialized (`None` when not set) — callers never touch
`json.dumps`. `list_chat_messages` returns the most recent `limit` rows in
**oldest-first** order.

### Seed

First initialization writes one `users_profile` row (`id="default"`,
`cash_balance=10000.0`) and the ten default watchlist tickers: AAPL, GOOGL, MSFT,
AMZN, TSLA, NVDA, META, JPM, V, NFLX. Re-running `init_db()` never restores rows
the user has since deleted.

DDL and seed values live next to the code, in `backend/app/db/schema.sql` and
`backend/app/db/seed.json`, and ship inside the wheel.

**Note for devops**: they are deliberately *not* in a top-level `backend/db/`
directory. That path becomes `/app/db` in the image, which the named volume
mounts over at runtime, so a fresh volume would hide the schema file and the app
would fail to start. Nothing in the image's `/app/db` is needed - the container
only has to leave the working directory at `/app`, or set
`ARTIFINANCIAL_DB_PATH`.

---

## REST endpoint shapes

_Owner: backend-api-engineer. Consumed by: frontend-engineer, integration-tester._

All paths are same-origin under `/api`. Request and response bodies are JSON.
Errors always come back as FastAPI's `{"detail": "<message>"}` — the message is
written to be shown to the user verbatim.

Money and quantity fields are plain JSON numbers, rounded server-side to 2
decimals for money and 6 for share quantities.

Rows that come straight from the database (`trades`) also carry a `user_id`
field, always `"default"`. Ignore it.

### `GET /api/health` -> 200

```json
{"status": "ok"}
```

### `GET /api/portfolio` -> 200

```json
{
  "cash_balance": 8095.00,
  "positions": [
    {
      "ticker": "AAPL",
      "quantity": 10.0,
      "avg_cost": 190.50,
      "current_price": 191.20,
      "market_value": 1912.00,
      "cost_basis": 1905.00,
      "unrealized_pnl": 7.00,
      "unrealized_pnl_percent": 0.37
    }
  ],
  "positions_value": 1912.00,
  "total_value": 10007.00,
  "unrealized_pnl": 7.00,
  "unrealized_pnl_percent": 0.37
}
```

`positions` is sorted by ticker. `current_price` is `null` when the price cache
has no tick for that ticker yet; in that case valuation falls back to `avg_cost`
so the totals stay sane, and `unrealized_pnl` for that row is `0.0`. Render such
a row as "waiting for price".

`unrealized_pnl_percent` at the top level is P&L over total cost basis; it is
`0.0` when there are no positions.

### `POST /api/portfolio/trade` -> 200

Request:

```json
{"ticker": "AAPL", "quantity": 10, "side": "buy"}
```

`ticker` is uppercased server-side. `side` is `"buy"` or `"sell"`.

Response:

```json
{
  "trade": {
    "id": "3f2c...",
    "ticker": "AAPL",
    "side": "buy",
    "quantity": 10.0,
    "price": 190.50,
    "executed_at": "2026-08-25T12:00:00.123456+00:00"
  },
  "position": {"ticker": "AAPL", "quantity": 10.0, "avg_cost": 190.50},
  "cash_balance": 8095.00,
  "total_value": 10000.00
}
```

`position` is `null` when a sell closed the position (quantity reached 0 and the
row was deleted).

Rejections — all `400` with `{"detail": ...}`:

| Cause | Message |
|---|---|
| No cached price | `No price available for PYPL yet` |
| Quantity <= 0 | `Quantity must be greater than 0` |
| Insufficient cash | `Insufficient cash: need $1905.00, have $500.00 (short $1405.00)` |
| Insufficient shares | `Insufficient shares: cannot sell 10 AAPL, holding 4` |
| No position at all on a sell | `Insufficient shares: cannot sell 10 AAPL, holding 0` |
| Bad side | `Side must be 'buy' or 'sell'` |

A non-numeric `quantity` or a missing field is rejected by validation as `422`
with FastAPI's standard error body.

Treat "No price available for X yet" as a transient waiting state, not an error
state: the simulator fills it within ~500ms, the Massive free tier within ~15s.

### `GET /api/portfolio/history?limit=500` -> 200

```json
{"snapshots": [{"total_value": 10000.00, "recorded_at": "2026-08-25T12:00:00+00:00"}]}
```

Oldest first, ready to plot. `limit` defaults to 500, max 2000.

### `GET /api/trades?limit=50&ticker=AAPL` -> 200

```json
{
  "trades": [
    {
      "id": "3f2c...",
      "ticker": "AAPL",
      "side": "buy",
      "quantity": 10.0,
      "price": 190.50,
      "executed_at": "2026-08-25T12:00:00.123456+00:00"
    }
  ]
}
```

Newest first. `limit` defaults to 50, max 500. `ticker` is an optional filter and
is uppercased server-side.

### `GET /api/watchlist` -> 200

```json
{
  "watchlist": [
    {
      "ticker": "AAPL",
      "price": 190.50,
      "previous_price": 190.42,
      "change": 0.08,
      "change_percent": 0.042,
      "direction": "up",
      "timestamp": 1756000000.123,
      "position_quantity": 10.0
    },
    {
      "ticker": "PYPL",
      "price": null,
      "previous_price": null,
      "change": null,
      "change_percent": null,
      "direction": null,
      "timestamp": null,
      "position_quantity": 0.0
    }
  ]
}
```

Order is the order tickers were added. The price fields are all `null` together
until the first tick arrives — that is the "waiting for price" state. Live
updates come from the SSE stream, not from polling this endpoint.

### `POST /api/watchlist` -> 201

Request `{"ticker": "pypl"}`. Response:

```json
{"ticker": "PYPL", "added_at": "2026-08-25T12:00:00+00:00"}
```

- `400` — `Invalid ticker: 'ABCDEF'` (must match `^[A-Z]{1,5}$` after uppercasing;
  there is no symbol-existence check)
- `409` — `PYPL is already on the watchlist`

The ticker is added to the market data source immediately, so a price appears on
the next tick.

### `DELETE /api/watchlist/{ticker}` -> 200

```json
{"ticker": "PYPL", "removed": true}
```

- `404` — `PYPL is not on the watchlist`

Removing a ticker you hold a position in is allowed. The position keeps its live
price and stays sellable — the market source keeps tracking held tickers.

### `GET /api/stream/prices`

Unchanged from PLAN section 6, owned by the market package. `text/event-stream`,
one `data:` event per change carrying every tracked ticker keyed by symbol.

---

## Trade execution function

_Owner: backend-api-engineer. Consumed by: llm-engineer._

LLM-initiated trades and manual trades go through the same function. There is no
second code path and no second set of rules.

```python
from app.portfolio import TradeError, execute_trade

fill = execute_trade("AAPL", "buy", 10)      # ticker, side, quantity
```

```python
def execute_trade(ticker: str, side: str, quantity: float) -> dict:
    """Fill a market order at the ticker's latest cached price.

    Raises TradeError if the order violates any PLAN section 8 rule.
    """
```

- `ticker` is uppercased and stripped internally; pass it however the model
  produced it.
- `side` is `"buy"` or `"sell"` (case-insensitive).
- `quantity` is a float; fractional is allowed.
- Synchronous — call it directly, no `await`.

### Return value

```python
{
    "trade": {"id": ..., "user_id": "default", "ticker": "AAPL", "side": "buy",
              "quantity": 10.0, "price": 190.50, "executed_at": "..."},
    "position": {"ticker": "AAPL", "quantity": 10.0, "avg_cost": 190.50},  # or None
    "cash_balance": 8095.00,
    "total_value": 10007.00,
}
```

`position` is `None` when a sell closed the position. `price` on the trade is the
fill price, which is what you want in the chat confirmation.

### Rejections

Every rule violation raises `app.portfolio.TradeError`. It carries a
user-facing message:

```python
try:
    fill = execute_trade(t.ticker, t.side, t.quantity)
except TradeError as exc:
    errors.append(str(exc))     # e.g. "No price available for PYPL yet"
```

`str(exc)` is exactly the string this engineer's REST layer puts in the `400`
`detail`, so chat errors and trade-bar errors read identically. The messages are
listed in the "REST endpoint shapes" section above.

`TradeError` is raised before any state changes, so a rejected trade leaves the
database untouched — a failed trade inside a multi-trade chat response does not
need rolling back, and the remaining trades can still be attempted.

### Watchlist changes from chat

The same helpers back `watchlist_changes`, and they keep the Tracked Ticker Set
invariant (PLAN section 8) for you. These are `async` because the market data
source is:

```python
from app.portfolio import WatchlistError, add_ticker, remove_ticker

await add_ticker("PYPL")      # -> {"ticker": "PYPL", "added_at": "..."}
await remove_ticker("PYPL")   # -> {"ticker": "PYPL", "removed": True}
```

`WatchlistError` on an invalid format, a duplicate add, or removing a ticker that
is not on the list. `str(exc)` is again the user-facing message.

### Portfolio context for the prompt

```python
from app.portfolio import build_portfolio, watchlist_view

build_portfolio()   # the GET /api/portfolio body, as a dict
watchlist_view()    # the GET /api/watchlist "watchlist" list
```

Both are synchronous and read the live price cache. Use them for step 1 of PLAN
section 9 rather than reassembling the numbers.

### Mounting the chat router

`app/main.py` mounts your router with:

```python
from app.api.chat import router as chat_router
app.include_router(chat_router)
```

So `app/api/chat.py` exposes a module-level `router` that already carries its own
`/api/chat` prefix. It is imported lazily inside `create_app()`.

---

## Chat response shape and mock triggers

_Owner: llm-engineer. Consumed by: frontend-engineer, integration-tester._

### `POST /api/chat`

Request:

```json
{"message": "buy 5 shares of AAPL"}
```

Response `200` — always this shape, even when actions were rejected:

```json
{
  "message": "Bought 5 AAPL. Your cash is now $9,047.50.",
  "trades": [
    {"ticker": "AAPL", "side": "buy", "quantity": 5.0,
     "price": 190.50, "status": "executed", "error": null}
  ],
  "watchlist_changes": [
    {"ticker": "PYPL", "action": "add", "status": "executed", "error": null}
  ],
  "created_at": "2026-08-25T12:00:00.000000+00:00"
}
```

- `trades` and `watchlist_changes` are **always arrays** — `[]` when the model
  took no action. Never `null`, never absent.
- `status` is `"executed"` or `"rejected"`. On `"rejected"`, `error` carries the
  validation message from PLAN section 8 (`"No price available for PYPL yet"`,
  insufficient cash, insufficient shares, bad quantity) and `price` is `null`.
  A rejected action is **not** an HTTP error — the turn still returns `200` and
  the assistant's `message` explains what happened.
- `price` on an executed trade is the fill price from the price cache.

Status codes: `400` for an empty `message`; `429` if Groq rate-limits (body
`{"detail": "..."}`); `502` if the model returns an unparseable response after
one retry. Mock mode never returns `429` or `502`.

### `GET /api/chat/history?limit=50`

Oldest first, ready to replay into the panel:

```json
{
  "messages": [
    {"id": "uuid", "role": "user", "content": "buy 5 AAPL",
     "actions": null, "created_at": "..."},
    {"id": "uuid", "role": "assistant", "content": "Bought 5 AAPL.",
     "actions": {"trades": [...], "watchlist_changes": [...]},
     "created_at": "..."}
  ]
}
```

`actions` is `null` for user messages. For assistant messages it is exactly the
`{"trades": [...], "watchlist_changes": [...]}` pair from the `POST /api/chat`
response, so the same renderer draws inline confirmations on reload.

### Mock triggers (`LLM_MOCK=true`)

Deterministic, no API key, no network. The user's message is matched
case-insensitively in this **precedence order** — first match wins:

| # | Trigger substring | Mock response |
|---|---|---|
| 1 | `sell` | one trade: `sell` QTY TICKER |
| 2 | `buy` | one trade: `buy` QTY TICKER |
| 3 | `remove` | one watchlist change: `remove` TICKER |
| 4 | `watch` or `add` | one watchlist change: `add` TICKER |
| 5 | anything else | plain reply, `trades: []`, `watchlist_changes: []` |

TICKER is the first uppercase 1-5 letter token in the message; default `AAPL`
for trades and `PYPL` for watchlist changes. QTY is the first number in the
message; default `1`.

Worked examples:

| Message | Mock result |
|---|---|
| `What is my portfolio worth?` | plain reply, both arrays `[]` |
| `buy 5 AAPL` | trade `buy 5 AAPL` |
| `sell 2 NVDA` | trade `sell 2 NVDA` |
| `add PYPL to my watchlist` | watchlist `add PYPL` |
| `remove TSLA from the watchlist` | watchlist `remove TSLA` |

Mock actions execute for real through the same validation as live ones, so
`buy 100000 AAPL` in mock mode returns a `rejected` trade with an
insufficient-cash error. That is the intended way to E2E-test the rejection path.

### Caveat for test authors

TICKER is the first uppercase 1-5 letter run in the message, so a stray capital
matches too - `I want to buy AAPL` picks the ticker `I`, not `AAPL`. Write mock
prompts with the ticker as the only capitalized token, as in the examples above.

### Wiring (already done with backend-api-engineer)

`app/api/chat.py` exposes a module-level `router` carrying its own `/api/chat`
prefix, mounted by `app/main.py`. It calls `app.portfolio.execute_trade` and
`app.portfolio.change_watchlist` directly, so LLM actions take the same code
path as manual ones. Nothing further is needed from other members.

---

## Frontend test IDs

_Owner: frontend-engineer. Consumed by: integration-tester._

Every value below is a `data-testid`. `{TICKER}` is the uppercase symbol
(`watchlist-row-AAPL`). `{i}` is a zero-based index in render order.

The app is a single route at `/`. There is no loading screen and no router.

### Header

| testid | Notes |
|---|---|
| `header` | The header bar |
| `total-value` | Live total value, marked to the stream. Formatted `12,345.67`, no currency symbol |
| `cash-balance` | Cash, same formatting |
| `connection-status` | The status dot. Read `data-status`: `connected` \| `reconnecting` \| `disconnected` |

### Watchlist

| testid | Notes |
|---|---|
| `watchlist-panel` | Panel root |
| `watchlist-row-{TICKER}` | One row. `data-selected="true"` when it drives the main chart. Click to select |
| `watchlist-ticker-{TICKER}` | Symbol text |
| `watchlist-price-{TICKER}` | Price cell. Before the first tick it carries `data-waiting="true"` and reads `waiting for price` |
| `watchlist-change-{TICKER}` | Daily change, e.g. `+0.42%`. Absent while waiting for price |
| `watchlist-sparkline-{TICKER}` | `data-state="collecting"` with under two points, `data-state="live"` once drawing |
| `watchlist-remove-{TICKER}` | Remove button. Hidden until row hover, still clickable via Playwright `force` or `hover()` first |
| `watchlist-add-input` | Add-symbol field. Uppercases as you type |
| `watchlist-add-submit` | Add button |
| `watchlist-error` | Rendered only when an add/remove is rejected; carries the backend message |

### Main chart

| testid | Notes |
|---|---|
| `main-chart-panel` | Panel root |
| `main-chart-ticker` | Selected symbol, `--` when none |
| `main-chart-price` | Live price for the selection |
| `main-chart` | Present only once two or more ticks have accumulated |
| `main-chart-collecting` | The explicit "collecting data" state. Present until two ticks exist. Exactly one of `main-chart` / `main-chart-collecting` is in the DOM |

### Trade bar

| testid | Notes |
|---|---|
| `trade-bar` | Bar root |
| `trade-ticker-input` | Prefilled from the watchlist selection |
| `trade-quantity-input` | Defaults to `1` |
| `trade-buy-button` | |
| `trade-sell-button` | |
| `trade-status` | Fill confirmation, e.g. `BUY 5 AAPL filled`. Present only after a successful trade |
| `trade-error` | Backend rejection message, inline. Present only after a rejection. `trade-status` and `trade-error` are mutually exclusive |

### Book (positions and trades)

| testid | Notes |
|---|---|
| `positions-panel` | Panel root, holds both tabs |
| `positions-tab-positions` | Tab button, `data-active="true"` when showing. Default tab |
| `positions-tab-trades` | Tab button |
| `positions-table` | Present when at least one position exists |
| `positions-empty` | Present when there are none |
| `position-row-{TICKER}` | Click to select the ticker |
| `position-qty-{TICKER}` | |
| `position-avg-cost-{TICKER}` | |
| `position-price-{TICKER}` | Live price, or `waiting` if the ticker has no price yet |
| `position-pnl-{TICKER}` | Unrealized, signed: `+12.34` / `-12.34` |
| `position-pnl-percent-{TICKER}` | Signed percent: `+1.23%` |
| `trades-table` | Present on the trades tab when at least one trade exists |
| `trades-empty` | Present when there are none |
| `trade-row-{i}` | Newest first, so `trade-row-0` is the most recent fill |

### Allocation heatmap

| testid | Notes |
|---|---|
| `heatmap-panel` | Panel root |
| `heatmap-tile-{TICKER}` | One rectangle per position. `data-weight` is portfolio weight as a percentage string, e.g. `"31.40"`. Sized by weight, coloured by P&L. Click to select |
| `heatmap-empty` | Present when there are no positions |

### Portfolio value chart

| testid | Notes |
|---|---|
| `pnl-panel` | Panel root |
| `pnl-chart` | Present once `/api/portfolio/history` returns two or more snapshots |
| `pnl-empty` | Present below that. Exactly one of the two is in the DOM |

### Assistant chat

| testid | Notes |
|---|---|
| `chat-panel` | Present only when expanded; carries `data-open="true"` |
| `chat-toggle` | Always present. `data-open` says whether the panel is currently expanded. Collapsed, this button is the whole rail |
| `chat-messages` | Scroll container |
| `chat-empty` | Placeholder when there is no history and nothing pending |
| `chat-message-{i}` | One message. `data-role` is `user` or `assistant`. Index counts restored history first, then the live conversation |
| `chat-actions-{i}` | Action list attached to message `{i}`. Present only when that message executed something |
| `chat-action` | One executed action inside the list. `data-rejected="true"` when the backend refused it |
| `chat-loading` | Present only while awaiting `/api/chat` |
| `chat-input` | |
| `chat-send` | Disabled while loading |
| `chat-error` | Present when the `/api/chat` call itself failed |

### Notes for E2E

- Sparklines and the main chart accumulate from SSE since page load and reset on
  reload, so assert on `main-chart-collecting` first and wait for `main-chart`.
  The P&L chart is the only chart backed by persisted data.
- A ticker with no price yet is a normal state, not an error: `data-waiting="true"`
  on the price cell, up to 15s on the Massive free tier.
- Numbers render without a currency symbol and with grouping separators.
- `connection-status` transitions: `reconnecting` on load until the stream opens,
  `connected` on open or on the first event, `reconnecting` on the first one or
  two stream errors, and `disconnected` after three consecutive failed retries
  (about three seconds, since the stream sends `retry: 1000`). Killing the
  backend turns the dot red within ~5s; restarting it returns to green without a
  page reload, and tick accumulation resumes.

---

## Container and image

_Owner: devops-engineer. Consumed by: integration-tester._

One image serves the API and the built frontend on port 8000. No other services.

| | |
|---|---|
| Image name | `artifinancial` (tag `latest`) |
| Build context | repository root, `Dockerfile` at the root |
| Build args | none - `docker build -t artifinancial .` is the whole command |
| Container name used by the scripts | `artifinancial` |
| Port | `8000` - API and UI on the same origin |
| Volume | named volume `artifinancial-data` mounted at `/app/db` |
| Working directory | `/app` |
| Command | `uvicorn app.main:app --host 0.0.0.0 --port 8000` |

Multi-stage: `node:20-slim` builds the Next.js static export, `python:3.12-slim`
installs from `backend/uv.lock` with `uv sync --frozen --no-dev` and serves the
export from `/app/static`.

### Run it

```bash
docker build -t artifinancial .
docker run -d --name artifinancial \
  -v artifinancial-data:/app/db -p 8000:8000 --env-file .env artifinancial
```

`docker compose up -d` is equivalent - same image name, container name, named
volume and port.

### Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `GROQ_API_KEY` | none | Required for live chat; not needed when `LLM_MOCK=true` |
| `MASSIVE_API_KEY` | empty | Empty selects the built-in simulator, which is the default |
| `LLM_MOCK` | `false` | `true` gives deterministic mock chat responses, no network |
| `ARTIFINANCIAL_DB_PATH` | unset | Overrides the SQLite path. Leave unset in the container |

Passed with `--env-file .env`; `.env.example` at the root is the committed
template. In compose, an `environment:` entry overrides `env_file`, so a test
stack can pin `LLM_MOCK=true` without touching the user's `.env`.

### Notes for the integration tester

- Nothing in the image lives under `/app/db`, so the volume may be empty or
  fresh. A fresh volume seeds $10,000 cash and the ten default watchlist tickers
  on first use.
- Readiness: poll `GET /api/health` for `{"status": "ok"}`. Startup takes roughly
  8-12 seconds.
- The image carries no browser and no dev dependencies - put the Playwright
  container alongside it in `test/docker-compose.test.yml`.
- Data survives `docker rm`; the stop scripts never remove the volume. Reset
  state with `docker volume rm artifinancial-data`.
