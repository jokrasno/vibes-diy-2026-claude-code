#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -d "$ROOT/backend/.venv" ]; then
  python3 -m venv "$ROOT/backend/.venv"
fi
"$ROOT/backend/.venv/bin/pip" install -q -r "$ROOT/backend/requirements.txt"

( cd "$ROOT/backend" && . .venv/bin/activate && uvicorn app:app --host 127.0.0.1 --port 8000 ) &
BACKEND_PID=$!
trap 'kill $BACKEND_PID 2>/dev/null || true' EXIT

cd "$ROOT/frontend"
if [ ! -d node_modules ]; then npm install; fi
npm run dev -- --port 5173
