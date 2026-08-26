# Artifinancial - multi-stage build (PLAN section 11).
# Stage 1 builds the Next.js static export; stage 2 runs FastAPI and serves it.

FROM node:20-slim AS frontend

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build


FROM python:3.12-slim AS runtime

COPY --from=ghcr.io/astral-sh/uv:0.9 /uv /usr/local/bin/uv

ENV PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Dependencies first so application edits do not invalidate the layer.
COPY backend/pyproject.toml backend/uv.lock backend/README.md ./
RUN uv sync --frozen --no-dev --no-install-project

COPY backend/app ./app
RUN uv sync --frozen --no-dev

# app/main.py serves the static export from <backend root>/static, which is /app/static.
COPY --from=frontend /build/out ./static

# The SQLite file lives at /app/db/artifinancial.db (working directory + db/),
# backed by the named volume artifinancial-data. Nothing in the image needs /app/db.
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
