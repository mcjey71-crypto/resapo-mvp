#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v ffmpeg >/dev/null || { echo 'Instala FFmpeg antes de continuar.' >&2; exit 1; }
export UV_CACHE_DIR="${UV_CACHE_DIR:-$PWD/.cache/uv}"
if [ ! -x .venv-streamlit/bin/python ]; then
  uv venv --python 3.12 .venv-streamlit
fi
uv pip sync --python .venv-streamlit/bin/python --require-hashes cloud/requirements.txt
.venv-streamlit/bin/python scripts/download_model.py
