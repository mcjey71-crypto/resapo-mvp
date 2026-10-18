"""Download public Whisper weights once, with standard HTTPS verification."""
import hashlib
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import CACHE_DIR, MODEL_NAME, MODEL_REVISION
os.environ.setdefault("HF_HOME", str(CACHE_DIR.parent / "huggingface"))
from faster_whisper.utils import download_model

print(f"Descargando Whisper {MODEL_NAME}…", flush=True)
path = Path(MODEL_NAME) if Path(MODEL_NAME).is_dir() else Path(
    download_model(MODEL_NAME, cache_dir=str(CACHE_DIR), revision=MODEL_REVISION))
if MODEL_NAME == "base" and MODEL_REVISION == "ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66":
    # SHA-256 published in Hugging Face's Git LFS metadata for this exact revision.
    expected = "d01c3014881c9c6f3133c182f3d2887eb6ca1c789a7538c5c007196857a0a6a9"
    with (path / "model.bin").open("rb") as weights:
        actual = hashlib.file_digest(weights, "sha256").hexdigest()
    if actual != expected:
        raise RuntimeError("La verificación del modelo falló. No utilices estos pesos.")
    print("Integridad SHA-256 verificada.")
print("Modelo guardado. Puedes iniciar Re-SAPO.")
