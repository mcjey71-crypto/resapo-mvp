"""Re-SAPO: bounded, temporary uploads and a single local Whisper worker."""
from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
import logging
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import time
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).parent
MAX_BYTES = int(os.getenv("RESAPO_MAX_MB", "200")) * 1024 * 1024
MAX_SECONDS = int(os.getenv("RESAPO_MAX_MINUTES", "60")) * 60
MODEL_NAME = os.getenv("RESAPO_MODEL", "base")
MODEL_REVISION = os.getenv("RESAPO_MODEL_REVISION", "ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66" if MODEL_NAME == "base" else "") or None
CACHE_DIR = Path(os.getenv("RESAPO_MODEL_CACHE", str(ROOT / ".cache" / "models")))
RETENTION = 3600
EXTENSIONS = {".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac", ".mp4", ".mov", ".mkv", ".webm", ".opus"}
LANGUAGES = {"auto", "es", "en", "pt", "fr", "it", "de"}
TERMINAL = {"completed", "failed", "cancelled"}
logger = logging.getLogger("resapo")


@dataclass
class Job:
    id: str
    folder: Path
    language: str
    state: str = "queued"
    message: str = "Esperando turno…"
    progress: float = 0
    text: str = ""
    detected_language: str = ""
    duration: float = 0
    updated: float = field(default_factory=time.monotonic)
    cancel: threading.Event = field(default_factory=threading.Event)


def model_location():
    if Path(MODEL_NAME).is_dir():
        return Path(MODEL_NAME)
    from faster_whisper.utils import download_model
    return Path(download_model(MODEL_NAME, cache_dir=str(CACHE_DIR),
                               revision=MODEL_REVISION, local_files_only=True))


class TranscriptionError(Exception):
    pass


class TranscriptionService:
    def __init__(self):
        self.jobs: dict[str, Job] = {}
        self.lock = threading.Lock()
        self.slots = threading.BoundedSemaphore(3)
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="whisper")
        self.model = None

    def change(self, job, **values):
        with self.lock:
            for key, value in values.items():
                setattr(job, key, value)
            job.updated = time.monotonic()

    def prune(self):
        with self.lock:
            for key, job in list(self.jobs.items()):
                if job.state in TERMINAL and time.monotonic() - job.updated > RETENTION:
                    del self.jobs[key]

    def get(self, job_id):
        self.prune()
        with self.lock:
            job = self.jobs.get(job_id)
            if not job:
                raise HTTPException(404, "La transcripción no existe o ya expiró.")
            return job

    def snapshot(self, job):
        with self.lock:
            return {"id": job.id, "state": job.state, "message": job.message,
                    "progress": job.progress, "text": job.text,
                    "language": job.detected_language, "duration": job.duration}

    def load_model(self):
        if self.model is None:
            from faster_whisper import WhisperModel
            # Download explicitly during setup. Requests must not hang on network downloads.
            self.model = WhisperModel(
                str(model_location()), device="cpu", compute_type="int8", cpu_threads=4,
                download_root=str(CACHE_DIR), local_files_only=True,
            )
        return self.model

    def run(self, job: Job, source: Path):
        try:
            if job.cancel.is_set():
                return
            self.change(job, state="processing", message="Preparando el audio…")
            wav = job.folder / "audio.wav"
            # Decode actual media, not the claimed MIME type. Cap output duration and memory.
            proc = subprocess.run([
                "ffmpeg", "-nostdin", "-v", "error", "-protocol_whitelist", "file,pipe",
                "-format_whitelist", "mp3,wav,mov,matroska,webm,ogg,flac,aac",
                "-i", str(source), "-map", "0:a:0", "-vn", "-t", str(MAX_SECONDS + 1),
                "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-y", str(wav),
            ], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=180)
            if proc.returncode:
                raise TranscriptionError("No pudimos leer el audio. Comprueba que el archivo no esté dañado y que el video tenga sonido.")
            import wave
            with wave.open(str(wav)) as audio:
                duration = audio.getnframes() / audio.getframerate()
            if duration <= 0:
                raise TranscriptionError("El archivo no contiene audio.")
            if duration > MAX_SECONDS:
                raise TranscriptionError(f"El límite es de {MAX_SECONDS // 60} minutos por archivo.")
            if job.cancel.is_set():
                return
            self.change(job, duration=duration, message="Cargando el modelo de voz…")
            try:
                model = self.load_model()
            except Exception:
                logger.exception("Model could not be loaded")
                raise TranscriptionError("El modelo de transcripción no está disponible. El administrador debe ejecutar scripts/download_model.py.") from None
            if job.cancel.is_set():
                return
            self.change(job, message="Transcribiendo tu archivo…")
            segments, info = model.transcribe(
                str(wav), language=None if job.language == "auto" else job.language,
                task="transcribe", beam_size=5, vad_filter=True,
                condition_on_previous_text=False,
            )
            self.change(job, detected_language=info.language)
            lines = []
            for segment in segments:
                if job.cancel.is_set():
                    return
                text = segment.text.strip()
                if text:
                    lines.append(text)
                self.change(job, progress=min(0.99, segment.end / duration))
            self.change(job, state="completed", progress=1, text="\n\n".join(lines),
                        message="Transcripción lista." if lines else "No se detectó voz en el archivo.")
        except TranscriptionError as exc:
            self.change(job, state="failed", message=str(exc))
        except subprocess.TimeoutExpired:
            self.change(job, state="failed", message="La preparación del audio tardó demasiado. Prueba con un archivo más corto.")
        except Exception:
            logger.exception("Transcription failed")
            self.change(job, state="failed", message="No pudimos completar la transcripción. Prueba con otro archivo.")
        finally:
            if job.cancel.is_set():
                self.change(job, state="cancelled", text="", message="Transcripción cancelada.")
            shutil.rmtree(job.folder, ignore_errors=True)
            self.slots.release()

    def close(self):
        with self.lock:
            for job in self.jobs.values():
                if job.state not in TERMINAL:
                    job.cancel.set()
        self.executor.shutdown(wait=True)


@asynccontextmanager
async def lifespan(app):
    app.state.service = TranscriptionService()
    async def cleanup():
        while True:
            await asyncio.sleep(60)
            app.state.service.prune()
    cleaner = asyncio.create_task(cleanup())
    yield
    cleaner.cancel()
    app.state.service.close()


app = FastAPI(title="Re-SAPO", lifespan=lifespan, docs_url=None, redoc_url=None)


@app.middleware("http")
async def headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/health")
def health():
    try:
        model_path = model_location()
        model_cached = all((model_path / name).is_file() for name in
                           ("model.bin", "config.json", "tokenizer.json"))
    except Exception:
        model_cached = False
    return {"status": "ok", "ffmpeg": shutil.which("ffmpeg") is not None,
            "model": MODEL_NAME, "model_cached": model_cached,
            "max_bytes": MAX_BYTES, "max_minutes": MAX_SECONDS // 60,
            "extensions": sorted(EXTENSIONS)}


@app.post("/api/transcriptions", status_code=202)
async def transcribe(request: Request, filename: str, language: str = "es"):
    # Fetch sends the file as a raw body; bounded streaming avoids unbounded multipart spooling.
    if Path(filename).suffix.lower() not in EXTENSIONS:
        raise HTTPException(415, "Elige un archivo de audio o video compatible.")
    if language not in LANGUAGES:
        raise HTTPException(422, "El idioma seleccionado no está disponible.")
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            size = int(content_length)
        except ValueError:
            raise HTTPException(400, "Tamaño de archivo inválido.") from None
        if size > MAX_BYTES:
            raise HTTPException(413, f"El archivo supera los {MAX_BYTES // 1024 // 1024} MB.")
    service = request.app.state.service
    service.prune()
    if not service.slots.acquire(blocking=False):
        raise HTTPException(429, "Hay varias transcripciones en curso. Inténtalo en unos minutos.", headers={"Retry-After": "30"})
    folder = None
    submitted = False
    try:
        folder = Path(tempfile.mkdtemp(prefix="resapo-"))
        source = folder / "source"
        total = 0
        with source.open("wb") as target:
            async for chunk in request.stream():
                total += len(chunk)
                if total > MAX_BYTES:
                    raise HTTPException(413, f"El archivo supera los {MAX_BYTES // 1024 // 1024} MB.")
                target.write(chunk)
        if not total:
            raise HTTPException(400, "El archivo está vacío.")
        job = Job(uuid4().hex, folder, language)
        with service.lock:
            service.jobs[job.id] = job
        service.executor.submit(service.run, job, source)
        submitted = True
        return {"id": job.id}
    finally:
        if not submitted:
            if folder:
                shutil.rmtree(folder, ignore_errors=True)
            service.slots.release()


@app.get("/api/transcriptions/{job_id}")
def result(job_id: str, request: Request):
    service = request.app.state.service
    return service.snapshot(service.get(job_id))


@app.delete("/api/transcriptions/{job_id}", status_code=204)
def cancel(job_id: str, request: Request):
    service = request.app.state.service
    job = service.get(job_id)
    with service.lock:
        if job.state in TERMINAL:
            del service.jobs[job.id]
        else:
            job.cancel.set()
            job.message = "Cancelando…"


@app.get("/")
def index():
    return FileResponse(ROOT / "web" / "index.html")


@app.get("/pdf")
def pdf_tools():
    return FileResponse(ROOT / "web" / "pdf.html")


app.mount("/static", StaticFiles(directory=ROOT / "web"), name="static")
