#!/usr/bin/env bash
# Stop Artifinancial (macOS/Linux). Safe to run repeatedly. Keeps the data volume.

set -euo pipefail

CONTAINER_NAME="artifinancial"
VOLUME_NAME="artifinancial-data"

if [ -n "$(docker ps -aq -f "name=^${CONTAINER_NAME}$")" ]; then
  docker rm -f "$CONTAINER_NAME" >/dev/null
  echo "Stopped and removed container ${CONTAINER_NAME}"
else
  echo "No container named ${CONTAINER_NAME}"
fi

echo "Data volume ${VOLUME_NAME} kept. Delete it with: docker volume rm ${VOLUME_NAME}"
