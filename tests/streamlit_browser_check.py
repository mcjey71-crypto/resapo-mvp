"""Actual video transcription and PDF conversion in Streamlit; no mocked engine.
Start Streamlit on port 8501. Uses the public JFK video fixture from setup validation.
"""
import os
from pathlib import Path
import re
from playwright.sync_api import sync_playwright, expect
from pypdf import PdfReader

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1440,'height':1000}, accept_downloads=True)
    page.goto(os.getenv('STREAMLIT_TEST_URL','http://127.0.0.1:8501'))
    expect(page.get_by_role('heading',name='Dale un repaso.',exact=False)).to_be_visible()
    page.get_by_role('button',name='Ingresar al estudio →',exact=True).first.click()
    def idle():
        # The uploader can appear before the initial Streamlit rerun finishes.
        # Do not race a new upload or language change against that rerun.
        page.wait_for_function('''() => {
            if (document.querySelector('[data-testid=stApp]')?.dataset.testScriptState !== 'notRunning') {
                window.transcriptionReady = null; return false;
            }
            window.transcriptionReady ??= performance.now();
            return performance.now() - window.transcriptionReady > 300;
        }''')
        page.evaluate('window.transcriptionReady=null')
    idle()
    page.locator('input[type=file]').first.set_input_files('.cache/fixtures/jfk.mp4')
    expect(page.get_by_role('button',name='Transcribir archivo',exact=True)).to_be_enabled()
    idle()
    page.get_by_role('combobox').first.click()
    page.get_by_role('option',name='Inglés',exact=True).click()
    idle()
    page.get_by_role('button',name='Transcribir archivo',exact=True).click()
    expect(page.get_by_role('textbox',name='Tu transcripción — puedes editarla')).to_have_value(re.compile('ask not what your country'),timeout=120000)
    page.screenshot(path='test-results/streamlit-transcription.png',full_page=True)
    with page.expect_download() as event:
        page.get_by_role('button',name='Descargar texto (.txt)',exact=True).click()
    assert 'ask not what your country' in Path(event.value.path()).read_text()
    page.get_by_role('tab',name='Herramientas PDF',exact=True).click()
    frame=page.frame_locator('iframe').nth(0)
    frame.locator('#pdf-sample').click()
    expect(frame.locator('#pdf-files .pdf-file')).to_have_count(2)
    frame.locator('#pdf-run').click()
    expect(frame.locator('#pdf-result')).to_be_visible(timeout=30000)
    with page.expect_download() as event:
        frame.locator('#pdf-download').click()
    assert len(PdfReader(event.value.path()).pages)==6
    page.screenshot(path='test-results/streamlit-pdf.png',full_page=True)
    browser.close()
print('PASS: Streamlit real video -> text -> TXT; embedded local PDF tool -> downloadable PDF.')
