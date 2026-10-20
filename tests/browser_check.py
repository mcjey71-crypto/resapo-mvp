"""UI checks with explicitly mocked recognition responses; not an accuracy test.
Run the actual server first, then: .venv/bin/python tests/browser_check.py
"""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json

BASE = 'http://127.0.0.1:8000'
ARTIFACTS = Path('test-results')
ARTIFACTS.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1100}, permissions=['clipboard-read','clipboard-write'])
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    # Only recognition and availability are stubbed; HTML, CSS, JS use the real server.
    page.route('**/api/health', lambda route: route.fulfill(json={
        'ffmpeg': True, 'model_cached': True, 'max_bytes': 209715200, 'max_minutes': 60,
        'extensions': ['.wav', '.mp4', '.mp3'],
    }))
    page.goto(BASE + '/transcribir')
    expect(page.locator('#system-text')).to_have_text('Listo para escuchar')
    expect(page.locator('#transcribe')).to_be_disabled()
    page.screenshot(path=str(ARTIFACTS / 'desktop.png'), full_page=True)
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    page.locator('#file-input').set_input_files({'name': 'notes.txt', 'mimeType': 'text/plain', 'buffer': b'test'})
    expect(page.locator('#error')).to_contain_text('audio o video')
    expect(page.locator('#transcribe')).to_be_disabled()
    page.locator('#file-input').set_input_files({'name': 'clase.wav', 'mimeType': 'audio/wav', 'buffer': b'fixture'})
    expect(page.locator('#file-name')).to_have_text('clase.wav')
    expect(page.locator('#transcribe')).to_be_enabled()
    page.locator('#remove-file').click()
    expect(page.locator('#transcribe')).to_be_disabled()
    # A real browser DataTransfer exercises drag-and-drop wiring.
    page.locator('#dropzone').evaluate("""el => {
      const dt = new DataTransfer(); dt.items.add(new File(['fixture'], 'entrevista.mp4', {type: 'video/mp4'}));
      el.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true}));
    }""")
    expect(page.locator('#file-name')).to_have_text('entrevista.mp4')
    calls = []
    def route_jobs(route):
        if route.request.method == 'POST':
            calls.append(route.request.url)
            route.fulfill(status=202, json={'id': 'test-job'})
        elif route.request.method == 'DELETE':
            route.fulfill(status=204)
        else:
            route.fulfill(json={'id': 'test-job', 'state': 'completed', 'message': 'Transcripción lista.',
                               'progress': 1, 'text': 'Hola, esta es una prueba de la interfaz.', 'language': 'es', 'duration': 9.2})
    page.route('**/api/transcriptions**', route_jobs)
    page.locator('#transcribe').click()
    expect(page.locator('#transcript')).to_have_value('Hola, esta es una prueba de la interfaz.')
    expect(page.locator('#download')).to_be_enabled()
    assert len(calls) == 1 and 'language=es' in calls[0]
    edited = 'Texto revisado: <script>esto es texto, no código</script>.'
    page.locator('#transcript').fill(edited)
    page.locator('#copy').click()
    expect(page.locator('#toast')).to_have_text('Texto copiado.')
    assert page.evaluate('navigator.clipboard.readText()') == edited
    with page.expect_download() as download_info:
        page.locator('#download').click()
    download = download_info.value
    assert download.suggested_filename == 'entrevista-resapo.txt'
    assert Path(download.path()).read_text() == edited
    page.set_viewport_size({'width': 390, 'height': 844})
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    page.screenshot(path=str(ARTIFACTS / 'mobile-result.png'), full_page=True)
    page.reload()
    expect(page.locator('#system-text')).to_have_text('Listo para escuchar')
    page.screenshot(path=str(ARTIFACTS / 'mobile.png'), full_page=True)
    # Confirm server-reported errors are visible and controls recover.
    page.unroute('**/api/transcriptions**', route_jobs)
    page.route('**/api/transcriptions**', lambda route: route.fulfill(status=429, json={'detail': 'Hay varias transcripciones en curso.'}))
    page.locator('#file-input').set_input_files({'name': 'audio.wav', 'mimeType': 'audio/wav', 'buffer': b'fixture'})
    page.locator('#transcribe').click()
    expect(page.locator('#error')).to_contain_text('varias transcripciones')
    expect(page.locator('#transcribe')).to_be_enabled()
    # Cancel a queued job and check that stale responses do not populate the output.
    page.unroute('**/api/transcriptions**')
    def queued(route):
        if route.request.method == 'POST': route.fulfill(status=202, json={'id': 'queued-job'})
        elif route.request.method == 'DELETE': route.fulfill(status=204)
        else: route.fulfill(json={'state': 'queued', 'message': 'Esperando turno…', 'progress': 0})
    page.route('**/api/transcriptions**', queued)
    page.locator('#transcribe').click()
    expect(page.locator('#progress-text')).to_have_text('Esperando turno…')
    page.locator('#cancel').click()
    expect(page.locator('#processing')).to_be_hidden()
    expect(page.locator('#transcribe')).to_be_enabled()
    expect(page.locator('#transcript')).to_have_value('')
    assert not errors, errors
    browser.close()
print('OK: escritorio, móvil, selección, arrastre, edición, copia, TXT, errores y cancelación. Motor simulado solo en esta prueba de interfaz.')
