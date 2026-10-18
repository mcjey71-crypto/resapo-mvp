#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec .venv/bin/python -m uvicorn server:app --host "${RESAPO_HOST:-127.0.0.1}" --port "${RESAPO_PORT:-8000}"
