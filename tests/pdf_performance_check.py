"""Real PDF reorder benchmark and regression, including the embedded Streamlit UI.
Run with --baseline before editing to record the old behavior without new assertions.
Timings are diagnostic; stable nodes, focus, order and downloads are asserted.
"""
import io
import json
import sys
from pathlib import Path
from pypdf import PdfReader, PdfWriter
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/pdf-performance'
OUT.mkdir(parents=True, exist_ok=True)
BASELINE = '--baseline' in sys.argv

def pdf(width, pages):
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=width, height=400)
    stream = io.BytesIO()
    writer.write(stream)
    return stream.getvalue()

FILES = [{'name': f'Documento-{i:02}.pdf', 'mimeType': 'application/pdf',
          'buffer': pdf(300 + i, 50)} for i in range(10)]
LARGE = {'name': '500-paginas.pdf', 'mimeType': 'application/pdf', 'buffer': pdf(420, 500)}

MEASURE = '''async ({kind}) => {
 const list = document.getElementById(kind === 'files' ? 'pdf-files' : 'pdf-pages');
 const original = [...list.children], target = original[5];
 const timings = []; let lostFocus = 0, replacements = 0;
 const observer = new MutationObserver(records => {
   for (const r of records) for (const n of r.addedNodes)
     if (n.nodeType === 1 && !original.includes(n)) replacements++;
 });
 observer.observe(list, {childList:true});
 const workerCallsBefore = window.pdfWorkerCalls;
 for (let i=0; i<24; i++) {
   const row = [...list.children].find(n => kind === 'files'
     ? n.querySelector('strong').textContent === 'Documento-05.pdf'
     : n.querySelector('input').getAttribute('aria-label') === 'Seleccionar página 6');
   const b = row.querySelectorAll('button')[i%2 === 0 ? (kind === 'files' ? 1 : 2) : 0];
   b.focus({preventScroll:true});
   const start = performance.now(); b.click();
   list.getBoundingClientRect();
   timings.push(performance.now()-start);
   if (document.activeElement !== b) lostFocus++;
   await new Promise(requestAnimationFrame);
 }
 observer.disconnect();
 return {maxMs:Math.max(...timings),meanMs:timings.reduce((a,b)=>a+b)/timings.length,
   retained:original.filter(n=>n.isConnected).length, count:original.length,
   lostFocus, replacements, workerCalls:window.pdfWorkerCalls-workerCallsBefore};
}'''

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1100}, accept_downloads=True)
    context.add_init_script('''window.pdfWorkerCalls=0; const post=Worker.prototype.postMessage;
      Worker.prototype.postMessage=function(...args){window.pdfWorkerCalls++;return post.apply(this,args);};''')
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    cdp = context.new_cdp_session(page)
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
    page.goto('http://127.0.0.1:8000/pdf')
    page.locator('#pdf-input').set_input_files(FILES)
    expect(page.locator('#pdf-files > li')).to_have_count(10)
    expect(page.locator('#pdf-working')).to_be_hidden(timeout=60000)
    results = {'files10': page.evaluate(MEASURE, {'kind': 'files'})}
    # A reorder after output must invalidate that output and use the new order.
    page.get_by_role('button', name='Bajar Documento-00.pdf', exact=True).click()
    page.locator('#pdf-run').click()
    expect(page.locator('#pdf-result')).to_be_visible(timeout=60000)
    with page.expect_download() as event:
        page.locator('#pdf-download').click()
    output = OUT / 'merged-500.pdf'
    event.value.save_as(output)
    widths = [int(p.mediabox.width) for p in PdfReader(output).pages]
    assert widths == [301]*50+[300]*50+[300+i for i in range(2,10) for _ in range(50)]
    page.get_by_role('button', name='Subir Documento-00.pdf', exact=True).click()
    expect(page.locator('#pdf-result')).to_be_hidden()
    page.locator('[data-tool="organize"]').click()
    page.locator('#pdf-input').set_input_files(LARGE)
    expect(page.locator('#pdf-pages > li')).to_have_count(500, timeout=60000)
    expect(page.locator('#pdf-working')).to_be_hidden(timeout=60000)
    results['pages500'] = page.evaluate(MEASURE, {'kind':'pages'})
    # Select, rotate, remove, reset and verify remaining page identities/order.
    page.get_by_role('checkbox', name='Seleccionar página 6', exact=True).check()
    page.locator('#pdf-rotate').click()
    expect(page.locator('#pdf-pages > li').nth(5)).to_contain_text('90°')
    page.locator('#pdf-delete-pages').click()
    expect(page.locator('#pdf-pages > li')).to_have_count(499)
    page.locator('#pdf-reset-order').click()
    expect(page.locator('#pdf-pages > li')).to_have_count(500)
    # Exercise the actual Streamlit iframe at desktop and mobile sizes.
    page.goto('http://127.0.0.1:8501')
    page.get_by_role('button', name='Ingresar al estudio →').first.click()
    page.get_by_role('tab', name='Herramientas PDF', exact=True).click()
    frame = page.frame_locator('iframe').nth(0)
    frame.locator('#pdf-input').set_input_files(FILES)
    expect(frame.locator('#pdf-files > li')).to_have_count(10)
    expect(frame.locator('#pdf-working')).to_be_hidden(timeout=60000)
    results['streamlit10'] = frame.locator('html').evaluate('(el, arg) => ('+MEASURE+')(arg)', {'kind':'files'})
    for tab in ['Vectorizar imágenes','Herramientas creativas','Convertir archivos','Transcripción','Herramientas PDF']:
        page.get_by_role('tab', name=tab, exact=True).click()
    expect(frame.locator('#pdf-files > li')).to_have_count(10)
    page.set_viewport_size({'width':390,'height':844})
    results['mobile10'] = frame.locator('html').evaluate('(el, arg) => ('+MEASURE+')(arg)', {'kind':'files'})
    assert frame.locator('html').evaluate('el => el.scrollWidth <= innerWidth')
    frame.get_by_role('button', name='Bajar Documento-00.pdf', exact=True).click()
    frame.locator('#pdf-run').click()
    expect(frame.locator('#pdf-result')).to_be_visible(timeout=60000)
    with page.expect_download() as event:
        frame.locator('#pdf-download').click()
    event.value.save_as(OUT / 'streamlit-merged.pdf')
    assert [int(p.mediabox.width) for p in PdfReader(OUT / 'streamlit-merged.pdf').pages] == widths
    (OUT / ('before.json' if BASELINE else 'after.json')).write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))
    if not BASELINE:
        for result in results.values():
            assert result['retained'] == result['count'], result
            assert result['lostFocus'] == result['replacements'] == result['workerCalls'] == 0, result
    assert not errors, errors
    browser.close()
print('PASS: 10 documents / 500 pages, order, focus, stale download, worker isolation, Streamlit navigation and mobile.')
