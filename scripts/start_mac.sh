#!/usr/bin/env bash
# Start Artifinancial in Docker (macOS/Linux). Safe to run repeatedly.
#   ./scripts/start_mac.sh [--build] [--no-open]

set -euo pipefail

IMAGE_NAME="artifinancial"
CONTAINER_NAME="artifinancial"
VOLUME_NAME="artifinancial-data"
PORT=8000
URL="http://localhost:${PORT}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BUILD=0
OPEN_BROWSER=1
for arg in "$@"; do
  case "$arg" in
    --build) BUILD=1 ;;
    --no-open) OPEN_BROWSER=0 ;;
    *) echo "Usage: $0 [--build] [--no-open]"; exit 1 ;;
  esac
done

if [ ! -f .env ]; then
  echo "No .env found - creating one from .env.example"
  cp .env.example .env
  echo "Add your GROQ_API_KEY to .env, or set LLM_MOCK=true to run without one."
fi

if [ "$BUILD" -eq 1 ] || [ -z "$(docker images -q "$IMAGE_NAME")" ]; then
  echo "Building image ${IMAGE_NAME}"
  docker build -t "$IMAGE_NAME" .
fi

# Replace any container left over from a previous run. The volume is untouched.
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

docker run -d \
  --name "$CONTAINER_NAME" \
  -p "${PORT}:8000" \
  -v "${VOLUME_NAME}:/app/db" \
  --env-file .env \
  "$IMAGE_NAME" >/dev/null

printf "Waiting for the app to start"
for _ in $(seq 1 30); do
  if curl -fsS "${URL}/api/health" >/dev/null 2>&1; then
    printf "\nArtifinancial is running at %s\n" "$URL"
    echo "Stop it with: ./scripts/stop_mac.sh"
    if [ "$OPEN_BROWSER" -eq 1 ]; then
      if command -v open >/dev/null 2>&1; then
        open "$URL"
      elif command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$URL" >/dev/null 2>&1 || true
      fi
    fi
    exit 0
  fi
  printf "."
  sleep 1
done

printf "\nThe app did not become healthy within 30 seconds. Container logs:\n"
docker logs "$CONTAINER_NAME"
exit 1
