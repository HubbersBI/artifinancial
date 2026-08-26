# Artifinancial Build Team

`planning/PLAN.md` is the specification and the single source of truth. This
file says who builds what, who owns which files, and how the team stays in
sync. Read it before you start work.

## Members

| Agent | Owns | Contract in PLAN.md |
|---|---|---|
| `database-engineer` | `backend/db/`, `backend/app/db/`, `backend/tests/db/` | section 7 |
| `backend-api-engineer` | `backend/app/main.py`, `backend/app/api/`, `backend/app/portfolio/`, their tests | sections 6, 8 |
| `llm-engineer` | `backend/app/llm/`, `backend/app/api/chat.py`, `backend/tests/llm/` | section 9 |
| `frontend-engineer` | `frontend/` | sections 2, 10 |
| `devops-engineer` | `Dockerfile`, `docker-compose.yml`, `scripts/`, `.env.example` | section 11 |
| `integration-tester` | `test/` | section 12 |

`backend/app/market/` is **already built and working**. Nobody rewrites it.
Read `backend/CLAUDE.md` for its API and use it as-is.

## File ownership is strict

Edit only what you own. Agents run in parallel, and two agents editing one file
lose work. If you need something changed in another member's code, message
them and keep going on something else while you wait.

Shared files nobody owns outright — `planning/*.md`, `README.md`, root config —
are append-and-coordinate: say what you changed.

## The shared contract: `planning/CONTRACTS.md`

This is the interface between members, and it is what unblocks parallel work.
Write your side of it **before** you have finished implementing, so others can
build against it:

- **database-engineer** — repository function signatures
- **backend-api-engineer** — endpoint request/response shapes and status codes
- **llm-engineer** — chat response shape and the mock's trigger phrases
- **frontend-engineer** — the `data-testid` values E2E depends on

Changing something already in CONTRACTS.md means telling everyone who depends
on it. Additions are free; changes are not.

## Build order

Dependencies are real but shallow. Roughly:

1. `database-engineer` publishes repository signatures — everything backend
   waits on this
2. `backend-api-engineer` and `llm-engineer` build against those signatures in
   parallel; the API engineer publishes endpoint shapes early
3. `frontend-engineer` starts on layout and design immediately, wires to real
   endpoints once shapes are published
4. `devops-engineer` builds the Dockerfile as soon as both sides have a
   buildable skeleton
5. `integration-tester` writes tests against the contract early, runs them once
   the container builds

Nobody sits idle waiting for a dependency. There is always design, scaffolding,
or test-writing to do against a published contract.

## House rules (from CLAUDE.md, and they are not optional)

- **Work incrementally.** Small steps. Validate each one before the next.
- **Do not overengineer.** No defensive programming. Exception handling only
  where it earns its place.
- **Find the root cause before fixing.** Reproduce it, prove it, then fix it.
  No guessing, no workarounds.
- **Use `uv`** — `uv run xxx`, `uv add xxx`. Never `python3` or `pip`.
- **No emojis** in code, print statements, or logs.
- Clear docstrings; sparse comments elsewhere. Short modules and functions.
- Use current library APIs — reach for Context7 rather than memory.

## Quality gates

Backend, from `backend/`:

```bash
uv run --extra dev pytest -v
uv run --extra dev ruff check app/ tests/
```

Frontend, from `frontend/`:

```bash
npm run build
npm test
```

Your work is not done until your own tests pass **and** you have not broken
anyone else's.

## Reporting

Say what you built, what you verified, and what you left undone. If something
is blocked, name the blocker and who owns it. Do not report completion for work
that is partially done — scaling scope down is the user's call, not yours.
