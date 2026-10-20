import io
import math
from pathlib import Path
import struct
import threading
import time
from types import SimpleNamespace
import wave

from fastapi.testclient import TestClient
import pytest
import server


def audio_bytes(seconds=0.4):
    output = io.BytesIO()
    with wave.open(output, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(b''.join(struct.pack('<h', int(1000 * math.sin(i / 10))) for i in range(int(16000 * seconds))))
    return output.getvalue()


class FakeModel:
    def transcribe(self, path, **kwargs):
        assert Path(path).is_file()
        assert kwargs['task'] == 'transcribe'
        assert kwargs['vad_filter'] is True
        return iter([SimpleNamespace(text=' Hola, Re-SAPO. ', end=0.4)]), SimpleNamespace(language='es')


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(server.TranscriptionService, 'load_model', lambda self: FakeModel())
    with TestClient(server.app) as test_client:
        yield test_client


def test_converter_api_real_pdf_and_incompatible_format(client):
    from pypdf import PdfReader
    result = client.post('/api/conversions', params={'filename': 'acción.txt', 'target': 'pdf'},
                         content='Acción y corazón, en un PDF real.'.encode())
    assert result.status_code == 200
    assert result.headers['content-type'] == 'application/pdf'
    assert result.headers['cache-control'] == 'no-store'
    assert "filename*=UTF-8''" in result.headers['content-disposition']
    assert 'corazón' in PdfReader(io.BytesIO(result.content)).pages[0].extract_text()
    assert client.post('/api/conversions', params={'filename': 'x.mp3', 'target': 'pdf'}, content=b'x').status_code == 422
    assert client.get('/convertir').status_code == 200


def test_converter_api_releases_busy_slot_after_bad_upload(client):
    with server.converter.reserve():
        response = client.post('/api/conversions', params={'filename': 'x.txt', 'target': 'pdf'}, content=b'hello')
        assert response.status_code == 429
    response = client.post('/api/conversions', params={'filename': 'x.txt', 'target': 'pdf'}, content=b'')
    assert response.status_code in (413, 422)
    assert client.post('/api/conversions', params={'filename': 'x.txt', 'target': 'pdf'}, content=b'hello').status_code == 200


def submit(client, data=None, filename='audio.wav', language='es'):
    return client.post('/api/transcriptions', params={'filename': filename, 'language': language},
                       content=audio_bytes() if data is None else data)


def finish(client, job_id):
    for _ in range(150):
        job = client.get(f'/api/transcriptions/{job_id}').json()
        if job['state'] in server.TERMINAL:
            return job
        time.sleep(0.02)
    pytest.fail('Job did not finish')


def test_audio_result_and_temporary_file_cleanup(client):
    response = submit(client, filename='../../not-a-real-path.wav')
    assert response.status_code == 202
    job_id = response.json()['id']
    internal = server.app.state.service.get(job_id)
    result = finish(client, job_id)
    assert result['state'] == 'completed'
    assert result['text'] == 'Hola, Re-SAPO.'
    assert result['language'] == 'es'
    assert result['progress'] == 1
    for _ in range(50):
        if not internal.folder.exists(): break
        time.sleep(.01)
    assert not internal.folder.exists()
    assert client.get(f'/api/transcriptions/{job_id}').headers['cache-control'] == 'no-store'
    assert client.delete(f'/api/transcriptions/{job_id}').status_code == 204
    assert client.get(f'/api/transcriptions/{job_id}').status_code == 404


@pytest.mark.parametrize('filename,data,language,status', [
    ('file.txt', b'hello', 'es', 415),
    ('audio.wav', b'', 'es', 400),
    ('audio.wav', b'audio', 'invalid', 422),
])
def test_invalid_uploads(client, filename, data, language, status):
    assert submit(client, data, filename, language).status_code == status


def test_size_limit(client, monkeypatch):
    monkeypatch.setattr(server, 'MAX_BYTES', 20)
    assert submit(client, b'x' * 21).status_code == 413
    assert submit(client, b'x' * 21).status_code == 413
    # Failed submissions do not leak capacity.
    assert all(server.app.state.service.slots.acquire(False) for _ in range(3))
    for _ in range(3): server.app.state.service.slots.release()


def test_streaming_size_limit_without_content_length(client, monkeypatch):
    monkeypatch.setattr(server, 'MAX_BYTES', 20)
    response = client.post('/api/transcriptions?filename=test.wav', content=iter([b'x' * 10, b'x' * 11]))
    assert response.status_code == 413


def test_corrupted_audio(client):
    job = finish(client, submit(client, b'not audio').json()['id'])
    assert job['state'] == 'failed'
    assert 'No pudimos leer el audio' in job['message']


def test_duration_limit(client, monkeypatch):
    monkeypatch.setattr(server, 'MAX_SECONDS', 0.2)
    job = finish(client, submit(client).json()['id'])
    assert job['state'] == 'failed'
    assert 'límite' in job['message']


def test_model_failure_has_actionable_message(client, monkeypatch):
    def fail(self): raise RuntimeError('missing weights')
    monkeypatch.setattr(server.TranscriptionService, 'load_model', fail)
    job = finish(client, submit(client).json()['id'])
    assert job['state'] == 'failed'
    assert 'download_model.py' in job['message']


def test_silence_is_not_fabricated(client, monkeypatch):
    model = SimpleNamespace(transcribe=lambda *a, **k: (iter([]), SimpleNamespace(language='es')))
    monkeypatch.setattr(server.TranscriptionService, 'load_model', lambda self: model)
    job = finish(client, submit(client).json()['id'])
    assert job['state'] == 'completed'
    assert job['text'] == ''
    assert 'No se detectó voz' in job['message']


def test_queue_limit_and_cancellation(client, monkeypatch):
    started, unblock = threading.Event(), threading.Event()
    class SlowModel:
        def transcribe(self, *a, **k):
            started.set()
            unblock.wait(5)
            return iter([]), SimpleNamespace(language='es')
    monkeypatch.setattr(server.TranscriptionService, 'load_model', lambda self: SlowModel())
    try:
        first = submit(client).json()['id']
        assert started.wait(3)
        second = submit(client).json()['id']
        third = submit(client).json()['id']
        assert submit(client).status_code == 429
        assert client.delete(f'/api/transcriptions/{second}').status_code == 204
        assert client.delete(f'/api/transcriptions/{first}').status_code == 204
    finally:
        unblock.set()
    assert finish(client, first)['state'] == 'cancelled'
    assert finish(client, second)['state'] == 'cancelled'
    assert finish(client, third)['state'] == 'completed'


def test_expired_result_is_removed(client):
    job_id = submit(client).json()['id']
    finish(client, job_id)
    service = server.app.state.service
    service.change(service.get(job_id), updated=time.monotonic())
    with service.lock:
        service.jobs[job_id].updated = time.monotonic() - server.RETENTION - 1
    assert client.get(f'/api/transcriptions/{job_id}').status_code == 404


def test_frontend_and_security_headers(client):
    response = client.get('/')
    assert response.status_code == 200
    assert '<svg' in response.text
    assert 'SAPO24' not in response.text
    assert "script-src 'self'" in response.headers['content-security-policy']
    assert client.get('/static/app.js').status_code == 200
    assert client.get('/static/../server.py').status_code == 404
    assert client.get('/api/transcriptions/unknown').status_code == 404


def test_pdf_tools_route_and_worker_policy(client):
    response = client.get('/pdf')
    assert response.status_code == 200
    assert 'Unir PDF' in response.text
    assert '/static/pdf-app.js' in response.text
    assert "worker-src 'self' blob:" in response.headers['content-security-policy']
    assert "unsafe-eval" not in response.headers['content-security-policy']
    assert client.get('/static/pdf-app.js').status_code == 200
