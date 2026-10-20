#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec .venv-streamlit/bin/python -m streamlit run cloud/streamlit_app.py --server.address "${RESAPO_HOST:-127.0.0.1}" --server.port "${RESAPO_STREAMLIT_PORT:-8501}" --server.headless true
