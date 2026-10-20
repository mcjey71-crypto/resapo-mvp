"""Real tracer/worker, download and rendered geometry checks. No mocked conversion.
Start FastAPI on port 8000; run npm test first for the ring fixture.
"""
from pathlib import Path
import xml.etree.ElementTree as ET
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/vector-browser'
OUT.mkdir(parents=True, exist_ok=True)


def valid_svg(path):
    root = ET.parse(path).getroot()
    assert root.tag == '{http://www.w3.org/2000/svg}svg'
    assert root.attrib['viewBox'].startswith('0 0 ')
    assert len(root.findall('{http://www.w3.org/2000/svg}path')) > 0
    assert root.findall('.//{http://www.w3.org/2000/svg}image') == []
    assert root.findall('.//{http://www.w3.org/2000/svg}script') == []
    return root


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width':1440, 'height':1100}, accept_downloads=True)
    page = context.new_page()
    errors, writes = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    context.on('request', lambda request: writes.append(request.url) if request.method in ('POST', 'PUT') else None)
    page.goto('http://127.0.0.1:8000/vectorizar')
    expect(page.locator('#v-run')).to_be_disabled()
    # Browser operations must continue with all network access disabled.
    context.set_offline(True)
    page.locator('#v-sample').click()
    expect(page.locator('#v-run')).to_be_enabled()
    page.locator('#v-run').click()
    expect(page.locator('#v-download')).to_be_visible(timeout=45000)
    with page.expect_download() as event:
        page.locator('#v-download').click()
    event.value.save_as(OUT / 'color.svg')
    root = valid_svg(OUT / 'color.svg')
    assert len(set(path.attrib['fill'] for path in root.findall('{http://www.w3.org/2000/svg}path'))) > 2
    assert page.locator('#v-output').evaluate("""async img => {
      await img.decode();const c=document.createElement('canvas');c.width=480;c.height=360;
      const ctx=c.getContext('2d');ctx.drawImage(img,0,0,480,360);
      const p=ctx.getImageData(240,244,1,1).data;
      return Math.abs(p[0]-231)<25 && Math.abs(p[1]-188)<25 && Math.abs(p[2]-103)<25;
    }"""), 'A small yellow accent must survive default color tracing'
    page.screenshot(path=str(OUT / 'desktop.png'), full_page=True)
    # Render the generated SVG independently and inspect actual pixels.
    alpha = page.evaluate("""async svg => {
      const blob = new Blob([svg], {type:'image/svg+xml'}), url=URL.createObjectURL(blob);
      const img=new Image(); img.src=url; await img.decode();
      const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
      const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,64,64);URL.revokeObjectURL(url);
      return [ctx.getImageData(32,32,1,1).data[3],ctx.getImageData(32,12,1,1).data[3],ctx.getImageData(1,1,1,1).data[3]];
    }""", (ROOT / 'test-results/vector-fixtures/ring.svg').read_text())
    assert alpha == [0, 255, 0], f'Transparent hole or contour lost: {alpha}'
    page.locator('#v-mode').select_option('mono')
    expect(page.locator('#v-download')).to_be_hidden()
    expect(page.locator('#v-threshold-row')).to_be_visible()
    page.locator('#v-run').click()
    expect(page.locator('#v-download')).to_be_visible(timeout=45000)
    with page.expect_download() as event:
        page.locator('#v-download').click()
    root = valid_svg(event.value.path())
    assert all(el.attrib['fill'] in ('rgb(0,0,0)', 'rgb(255,255,255)') for el in root.findall('{http://www.w3.org/2000/svg}path'))
    page.locator('#v-zoom').fill('300')
    expect(page.locator('#v-zoom-value')).to_have_text('300%')
    # Invalid input does not erase the selected image or enable an unsafe format.
    page.locator('#v-input').set_input_files({'name':'malicioso.svg', 'mimeType':'image/svg+xml', 'buffer':b'<svg onload="alert(1)"/>'})
    expect(page.locator('#v-message')).to_contain_text('PNG, JPG o WebP')
    expect(page.locator('#v-filename')).to_contain_text('sapo-ejemplo.png')
    page.locator('#v-input').set_input_files({'name':'corrupt.png', 'mimeType':'image/png', 'buffer':b'not a picture'})
    expect(page.locator('#v-message')).to_be_visible()
    expect(page.locator('#v-run')).to_be_enabled()
    page.locator('#v-drop').evaluate("""el => {
      const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(15*1024*1024+1)],'too-large.png',{type:'image/png'}));
      el.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));
    }""")
    expect(page.locator('#v-message')).to_contain_text('15 MB')
    # Both additional advertised raster formats are decoded and traced for real.
    for mime, ext in [('image/jpeg', 'jpg'), ('image/webp', 'webp')]:
        page.locator('#v-drop').evaluate("""async (el, format) => {
          const c=document.createElement('canvas');c.width=100;c.height=60;
          const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,100,60);
          ctx.fillStyle='#000';ctx.fillRect(20,10,50,40);
          const blob=await new Promise(resolve=>c.toBlob(resolve,format[0]));
          const dt=new DataTransfer();dt.items.add(new File([blob],'sample.'+format[1],{type:format[0]}));
          el.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));
        }""", [mime, ext])
        expect(page.locator('#v-filename')).to_contain_text('sample.' + ext)
        page.locator('#v-run').click()
        expect(page.locator('#v-download')).to_be_visible(timeout=45000)
    # File name is text, never HTML; PNG decoding, drag-and-drop, resizing.
    page.locator('#v-drop').evaluate("""async el => {
      const c=document.createElement('canvas');c.width=1600;c.height=800;
      const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1600,800);
      ctx.fillStyle='#000';ctx.fillRect(200,200,400,400);
      const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
      const dt=new DataTransfer();dt.items.add(new File([blob],'<img src=x onerror=alert(1)>.png',{type:'image/png'}));
      el.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));
    }""")
    expect(page.locator('#v-filename')).to_contain_text('<img')
    assert page.locator('#v-filename img').count() == 0
    expect(page.locator('#v-resolution')).to_contain_text('1200 × 600')
    page.locator('#v-white').check()
    page.locator('#v-run').click()
    expect(page.locator('#v-download')).to_be_visible(timeout=45000)
    with page.expect_download() as event:
        page.locator('#v-download').click()
    root = valid_svg(event.value.path())
    assert all(el.attrib['fill'] == 'rgb(0,0,0)' for el in root.findall('{http://www.w3.org/2000/svg}path'))
    assert '<' not in event.value.suggested_filename
    # Cancellation while real worker is active, followed by a successful retry.
    page.evaluate("document.getElementById('v-run').click();document.getElementById('v-cancel').click()")
    expect(page.locator('#v-message')).to_contain_text('cancelada')
    expect(page.locator('#v-run')).to_be_enabled()
    expect(page.locator('#v-download')).to_be_hidden()
    page.locator('#v-run').click()
    expect(page.locator('#v-download')).to_be_visible(timeout=45000)
    # Mobile layout and keyboard-reachable controls.
    page.set_viewport_size({'width':390, 'height':844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(OUT / 'mobile.png'), full_page=True)
    page.locator('#v-clear').click()
    expect(page.locator('#v-run')).to_be_disabled()
    expect(page.locator('#v-download')).to_be_hidden()
    # The exact portable artifact embedded in Streamlit also works offline.
    portable = context.new_page()
    portable.set_content((ROOT / 'docs/vectorizar.html').read_text())
    portable.locator('#v-sample').click()
    expect(portable.locator('#v-run')).to_be_enabled()
    portable.locator('#v-run').click()
    expect(portable.locator('#v-download')).to_be_visible(timeout=45000)
    with portable.expect_download() as event:
        portable.locator('#v-download').click()
    valid_svg(event.value.path())
    assert not errors, errors
    assert not writes, writes
    browser.close()
print('PASS: real color/mono SVG, rendered transparent holes, downloads, local/offline worker, invalid files, drag/drop, resize, cancel/retry, mobile and portable HTML.')
