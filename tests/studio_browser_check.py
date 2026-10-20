"""Landing, guest navigation and vectorization inside actual Streamlit iframes."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright, expect
from xml.etree import ElementTree as ET

OUT = Path('test-results/studio')
OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1440, 'height':1100}, accept_downloads=True)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(os.getenv('STREAMLIT_TEST_URL', 'http://127.0.0.1:8501'))
    expect(page.get_by_role('heading', name='Dale un repaso.', exact=False)).to_be_visible()
    expect(page.get_by_role('button', name='Ingresar al estudio →')).to_have_count(2)
    assert page.locator('input[type=email], input[type=password]').count() == 0
    expect(page.locator('.studio-brand img')).to_be_visible()
    assert page.locator('.studio-brand img').evaluate('(el) => el.complete && el.naturalWidth > 0')
    assert page.locator('.intro-art img').count() == 2
    page.locator('.intro-art').evaluate("async el => { await Promise.all([...el.querySelectorAll('img')].map(img => img.decode())); }")
    page.screenshot(path=str(OUT / 'landing-desktop.png'))
    page.locator('.intro-story').scroll_into_view_if_needed()
    page.screenshot(path=str(OUT / 'landing-story.png'))
    page.set_viewport_size({'width':390, 'height':844})
    page.get_by_role('heading', name='Dale un repaso.', exact=False).scroll_into_view_if_needed()
    page.screenshot(path=str(OUT / 'landing-mobile.png'))
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.get_by_role('button', name='Ingresar al estudio →').first.click()
    expect(page.get_by_role('heading', name='¿Qué idea movemos hoy?')).to_be_visible()
    expect(page.get_by_role('tab')).to_have_count(3)
    page.screenshot(path=str(OUT / 'studio-mobile.png'))
    page.set_viewport_size({'width':1440, 'height':1100})
    page.get_by_role('tab', name='Vectorizar imágenes', exact=True).click()
    frame = page.frame_locator('iframe').nth(1)
    expect(frame.locator('#v-run')).to_be_disabled()
    frame.locator('#v-sample').click()
    expect(frame.locator('#v-run')).to_be_enabled()
    frame.locator('#v-run').click()
    expect(frame.locator('#v-download')).to_be_visible(timeout=45000)
    with page.expect_download() as event:
        frame.locator('#v-download').click()
    assert ET.parse(event.value.path()).getroot().find('{http://www.w3.org/2000/svg}path') is not None
    page.screenshot(path=str(OUT / 'vector-streamlit.png'))
    page.set_viewport_size({'width':390, 'height':844})
    assert frame.locator('html').evaluate('el => el.scrollWidth <= innerWidth')
    frame.locator('#v-run').scroll_into_view_if_needed()
    page.screenshot(path=str(OUT / 'vector-streamlit-mobile.png'))
    page.get_by_role('button', name='← Inicio', exact=True).click()
    expect(page.get_by_role('heading', name='Dale un repaso.', exact=False)).to_be_visible()
    page.get_by_role('button', name='Ingresar al estudio →').last.click()
    expect(page.get_by_role('tab', name='Herramientas PDF', exact=True)).to_be_visible()
    assert not errors, errors
    browser.close()
print('PASS: SVG branding, responsive landing, both guest entry buttons, home/return, real Streamlit vectorization and SVG download.')
