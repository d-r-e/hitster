#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-mail}"
REMOTE_DIR="${REMOTE_DIR:-/home/david/hitster}"

rsync -az --delete \
  --exclude '.git' \
  --exclude '.github' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '*.log' \
  ./ "${REMOTE_HOST}:${REMOTE_DIR}/"

ssh "${REMOTE_HOST}" \
  "cd '${REMOTE_DIR}' && docker compose up -d --build && docker compose ps"
