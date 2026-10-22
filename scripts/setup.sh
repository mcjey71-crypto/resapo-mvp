#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v ffmpeg >/dev/null || { echo 'Instala FFmpeg y vuelve a ejecutar este script.' >&2; exit 1; }
command -v uv >/dev/null || { echo 'Instala uv (https://docs.astral.sh/uv/) y vuelve a intentarlo.' >&2; exit 1; }
command -v npm >/dev/null || { echo 'Instala Node.js 22.13 o posterior (recomendado: 24) para construir las herramientas PDF.' >&2; exit 1; }
export npm_config_cache="${npm_config_cache:-$PWD/.cache/npm}"
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm test
export UV_CACHE_DIR="${UV_CACHE_DIR:-$PWD/.cache/uv}"
if [ ! -x .venv/bin/python ]; then
  uv venv --python 3.12 .venv
fi
uv pip sync --python .venv/bin/python --require-hashes requirements-dev.txt
.venv/bin/python scripts/download_model.py
.venv/bin/python -m pytest -q
