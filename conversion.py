"""Bounded, real file conversion shared by Streamlit and FastAPI.

Each conversion runs in an isolated child process with a deadline and temporary
directory. The worker never fetches URLs or executes document macros.
"""
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
import json
import os
import signal
import subprocess
import sys
import tempfile
import threading

ROOT = Path(__file__).resolve().parent
MAX_INPUT = 50 * 1024 * 1024
MAX_OUTPUT = 50 * 1024 * 1024
TIMEOUT = 180
SOURCES = {
    'audio': ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wma', 'aiff', 'aif', 'amr', 'ac3'],
    'video': ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'mpeg', 'mpg', 'wmv', '3gp', 'ts', 'mts'],
    'image': ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff', 'gif'],
    'document': ['txt', 'md', 'docx', 'pdf'],
}
AUDIO_TARGETS = ['mp3', 'm4a', 'wav', 'flac', 'ogg', 'opus']
TARGETS = {
    'audio': AUDIO_TARGETS,
    'video': ['mp4', 'webm', 'mkv', *AUDIO_TARGETS],
    'image': ['png', 'jpg', 'webp', 'bmp', 'tiff', 'pdf'],
    'document': ['pdf', 'txt', 'docx'],
}
MIME = {
    'mp3': 'audio/mpeg', 'm4a': 'audio/mp4', 'wav': 'audio/wav', 'flac': 'audio/flac',
    'ogg': 'audio/ogg', 'opus': 'audio/ogg', 'mp4': 'video/mp4', 'webm': 'video/webm',
    'mkv': 'video/x-matroska', 'png': 'image/png', 'jpg': 'image/jpeg',
    'webp': 'image/webp', 'bmp': 'image/bmp', 'tiff': 'image/tiff',
    'pdf': 'application/pdf', 'txt': 'text/plain; charset=utf-8',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}


class ConversionError(ValueError):
    pass


class ConversionBusy(ConversionError):
    pass


def category(filename):
    extension = Path(filename).suffix.lower().lstrip('.')
    for name, extensions in SOURCES.items():
        if extension in extensions:
            return name
    raise ConversionError('Este formato aún no es compatible. Consulta la lista de formatos.')


def targets_for(filename):
    extension = Path(filename).suffix.lower().lstrip('.')
    extension = {'jpeg': 'jpg', 'tif': 'tiff'}.get(extension, extension)
    return [target for target in TARGETS[category(filename)] if target != extension]


def validate(filename, size, target):
    kind = category(filename)
    if target not in targets_for(filename):
        raise ConversionError('Esta combinación de formatos no es compatible.')
    maximum = {'audio': MAX_INPUT, 'video': MAX_INPUT, 'image': 15 * 1024 * 1024, 'document': 5 * 1024 * 1024}[kind]
    if size <= 0 or size > maximum:
        raise ConversionError(f'El archivo debe pesar entre 1 byte y {maximum // 1024 // 1024} MB.')
    return kind


@dataclass
class Converted:
    data: bytes
    name: str
    mime: str
    note: str


class ConversionService:
    def __init__(self):
        self.gate = threading.BoundedSemaphore(1)

    @contextmanager
    def reserve(self):
        if not self.gate.acquire(blocking=False):
            raise ConversionBusy('El convertidor está ocupado. Espera un momento y vuelve a intentarlo.')
        try:
            yield
        finally:
            self.gate.release()

    def convert(self, filename, data, target):
        with self.reserve():
            return self.convert_reserved(filename, data, target)

    def convert_reserved(self, filename, data, target):
        validate(filename, len(data), target)
        extension = Path(filename).suffix.lower().lstrip('.')
        # TemporaryDirectory removes input, result and worker reports on every exit.
        with tempfile.TemporaryDirectory(prefix='resapo-convert-') as folder:
            folder = Path(folder)
            source = folder / ('input.' + extension)
            result = folder / ('result.' + target)
            report = folder / 'report.json'
            source.write_bytes(data)
            command = [sys.executable, str(ROOT / 'scripts/convert_file.py'), str(source), str(result), str(report)]
            process = subprocess.Popen(command, cwd=ROOT, stdout=subprocess.DEVNULL,
                                       stderr=subprocess.DEVNULL, start_new_session=True,
                                       env={**os.environ, 'MALLOC_ARENA_MAX': '2',
                                            'OPENBLAS_NUM_THREADS': '1', 'OMP_NUM_THREADS': '1'})
            try:
                process.wait(timeout=TIMEOUT)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
                raise ConversionError('La conversión tardó demasiado. Prueba con un archivo más corto o más pequeño.') from None
            info = json.loads(report.read_text()) if report.is_file() else {}
            if process.returncode or not result.is_file():
                raise ConversionError(info.get('error', 'No se pudo convertir el archivo dentro de los límites disponibles. Prueba con uno más pequeño.'))
            if result.stat().st_size <= 0 or result.stat().st_size >= MAX_OUTPUT:
                raise ConversionError('El resultado supera 50 MB o está vacío. Elige un formato comprimido o un archivo más pequeño.')
            name = Path(filename.replace('\\', '/')).stem[:100]
            name = ''.join(c if c.isalnum() or c in ' -_.' else '_' for c in name).strip(' .') or 'archivo'
            return Converted(result.read_bytes(), f'{name}-resapo.{target}', MIME[target], info.get('note', ''))
