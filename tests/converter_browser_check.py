"""Real Streamlit and FastAPI file conversion; validate downloads independently."""
import io
import json
from pathlib import Path
import subprocess
from PIL import Image
from pypdf import PdfReader
from playwright.sync_api import sync_playwright, expect

OUT = Path('test-results/converter-browser')
OUT.mkdir(parents=True, exist_ok=True)
fixture = io.BytesIO()
Image.new('RGBA', (80, 60), (50, 100, 70, 0)).save(fixture, format='PNG')
text = 'Re-SAPO: acción, corazón y una nueva idea.\nTexto convertido de verdad.'


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1440, 'height':1100}, accept_downloads=True)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:8501')
    page.get_by_role('button', name='Ingresar al estudio →').first.click()
    page.get_by_role('tab', name='Convertir archivos', exact=True).click()
    expect(page.get_by_role('button', name='Convertir archivo', exact=True)).to_be_disabled()

    def idle():
        # A Streamlit widget can appear before the rerun has finished; wait for
        # the framework's explicit ready state before opening a transient menu.
        page.wait_for_function("""() => {
          const idle=document.querySelector('[data-testid=stApp]')?.dataset.testScriptState === 'notRunning';
          if(!idle){window.lastReady=null;return false;}
          window.lastReady ??= performance.now();
          return performance.now()-window.lastReady>300;
        }""")
        page.evaluate('window.lastReady=null')

    def choose_category(name):
        idle()
        page.get_by_role('combobox', name='¿Qué tipo de archivo quieres convertir?', exact=True).click()
        page.get_by_role('option', name=name, exact=True).click()
        kind = {'Audio': 'audio', 'Video': 'video', 'Imágenes': 'image', 'Documentos de texto': 'document'}[name]
        upload = page.locator(f'.st-key-conversion_upload_{kind} input[type=file]')
        expect(upload).to_have_count(1)
        idle()
        return upload

    def choose_target(name):
        expect(page.get_by_role('combobox', name='Formato de salida', exact=True)).to_be_enabled()
        idle()
        page.get_by_role('combobox', name='Formato de salida', exact=True).click()
        page.get_by_role('option', name=name, exact=True).click()
        idle()

    def convert_download(name):
        page.get_by_role('button', name='Convertir archivo', exact=True).click()
        button = page.get_by_role('button', name='Descargar archivo convertido', exact=True)
        expect(button).to_be_visible(timeout=60000)
        with page.expect_download() as event:
            button.click()
        path = OUT / name
        event.value.save_as(path)
        return path

    upload = choose_category('Video')
    upload.set_input_files('.cache/fixtures/jfk.mp4')
    choose_target('MP3')
    path = convert_download('video-audio.mp3')
    probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-of', 'json', str(path)]))
    assert probe['streams'][0]['codec_name'] == 'mp3'
    assert len(probe['streams']) == 1
    page.screenshot(path=str(OUT / 'streamlit-mp3.png'))

    upload = choose_category('Documentos de texto')
    upload.set_input_files({'name':'apuntes.txt','mimeType':'text/plain','buffer':text.encode()})
    choose_target('PDF')
    path = convert_download('document.pdf')
    assert 'corazón' in PdfReader(path).pages[0].extract_text()
    choose_target('DOCX')
    expect(page.get_by_role('button', name='Descargar archivo convertido')).to_have_count(0)
    page.screenshot(path=str(OUT / 'streamlit-document.png'))
    upload = choose_category('Imágenes')
    upload.set_input_files({'name':'foto.png','mimeType':'image/png','buffer':fixture.getvalue()})
    choose_target('JPG')
    path = convert_download('photo.jpg')
    with Image.open(path) as image:
        assert image.format == 'JPEG' and image.size == (80, 60)
        assert min(image.getpixel((0, 0))) > 245
    page.set_viewport_size({'width':390, 'height':844})
    page.screenshot(path=str(OUT / 'streamlit-mobile.png'))
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert page.locator('.transcription-heading p').first.evaluate('el => parseFloat(getComputedStyle(el).fontSize)') >= 16
    assert page.locator('[data-testid=stCaptionContainer] p').first.evaluate('el => parseFloat(getComputedStyle(el).fontSize)') >= 14
    # Also exercise the HTTP uploader and download headers in the regular web UI.
    web = browser.new_page(viewport={'width':1440, 'height':1100}, accept_downloads=True)
    web.goto('http://127.0.0.1:8000/convertir')
    expect(web.locator('#convert-formats')).to_contain_text('MP3')
    web.locator('#convert-category').select_option('document')
    web.locator('#convert-input').set_input_files({'name':'apuntes.txt','mimeType':'text/plain','buffer':text.encode()})
    web.locator('#convert-target').select_option('pdf')
    web.locator('#convert-run').click()
    expect(web.locator('#convert-result')).to_be_visible(timeout=60000)
    with web.expect_download() as event:
        web.locator('#convert-download').click()
    assert 'acción' in PdfReader(event.value.path()).pages[0].extract_text()
    web.screenshot(path=str(OUT / 'web-desktop.png'), full_page=True)
    web.set_viewport_size({'width':390, 'height':844})
    assert web.evaluate('document.documentElement.scrollWidth <= innerWidth')
    web.screenshot(path=str(OUT / 'web-mobile.png'), full_page=True)
    assert not errors, errors
    browser.close()
print('PASS: Streamlit MP4→MP3, TXT→PDF, PNG→JPG, stale-result removal, larger mobile text and real FastAPI upload/download.')
