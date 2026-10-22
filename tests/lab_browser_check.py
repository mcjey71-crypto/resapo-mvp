"""Real browser engines; independently inspect downloaded PNG/ICO/PDF/text/SVG."""
from pathlib import Path
from io import BytesIO
from PIL import Image
from pypdf import PdfReader
from playwright.sync_api import sync_playwright, expect
import xml.etree.ElementTree as ET
OUT=Path('test-results/lab');OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1100},accept_downloads=True)
 errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda r:requests.append((r.method,r.url)))
 page.goto('http://127.0.0.1:8000/herramientas')
 expect(page.locator('#guide-title')).to_have_text('Cambiar tamaño')
 page.locator('#guide-next').click();expect(page.locator('#guide-count')).to_have_text('PASO 2 DE 3')
 page.locator('#guide-prev').click();expect(page.locator('#guide-count')).to_have_text('PASO 1 DE 3')
 def choose(group,tool):
  page.get_by_role('button',name=group,exact=True).click();page.locator('#lab-tool').select_option(tool)
 def sample():
  page.locator('#lab-sample').click();expect(page.locator('#lab-run')).to_be_enabled(timeout=30000)
  expect(page.locator('#lab-status')).not_to_have_attribute('data-error','true')
 def run():
  page.locator('#lab-run').click()
  expect(page.locator('#lab-run')).to_be_enabled(timeout=30000)
  assert page.locator('#lab-status').get_attribute('data-error')!='true',(page.locator('#lab-status').inner_text(),page.locator('#lab-options').inner_html(),page.locator('#lab-tool').input_value())
 def download(name):
  expect(page.locator('.lab-download').first).to_be_visible()
  with page.expect_download() as ev:page.locator('.lab-download').first.click()
  path=OUT/name;ev.value.save_as(path);return path
 sample();page.locator('#width').fill('400');run();assert Image.open(download('resize.png')).size==(400,300)
 page.locator('#width').fill('300');expect(page.locator('.lab-download')).to_have_count(0)
 choose('Imágenes','crop');sample();page.locator('#left').fill('100');page.locator('#top').fill('100');page.locator('#width').fill('200');page.locator('#height').fill('150');run();im=Image.open(download('crop.png'));assert im.size==(200,150);assert im.convert('RGB').getpixel((50,50))==(35,70,56)
 page.locator('#left').fill('790');page.locator('#lab-run').click();expect(page.locator('#lab-status')).to_contain_text('sale de la imagen');expect(page.locator('.lab-download')).to_have_count(0)
 choose('Imágenes','rotate');sample();run();assert Image.open(download('rotate.png')).size==(600,800)
 choose('Imágenes','compress');sample();run();assert Image.open(download('compress.webp')).format=='WEBP'
 choose('Imágenes','imageText');sample();run();im=Image.open(download('watermark.png'));assert im.size==(800,600)
 choose('Imágenes','palette');sample();run();assert page.locator('.lab-swatch').count()>=3;assert '#' in download('palette.txt').read_text()
 choose('Imágenes','favicon');sample();run();im=Image.open(download('favicon.ico'));assert im.format=='ICO' and im.size==(32,32)
 choose('Texto','count');sample();run();expect(page.locator('.lab-stats')).to_contain_text('palabras')
 choose('Texto','clean');sample();run();assert '  ' not in download('clean.txt').read_text()
 choose('Texto','replace');sample();run();assert 'lección' in download('replace.txt').read_text()
 choose('Texto','compare');sample();run();expect(page.locator('.lab-diff ins')).to_contain_text('recordar');expect(page.locator('.lab-diff del')).to_contain_text('repasar')
 choose('Colores SVG','svg');sample();page.locator('#svg-color-0').fill('#ff0000');run();root=ET.parse(download('variant.svg')).getroot();assert root.find('{http://www.w3.org/2000/svg}rect').get('fill')=='#ff0000'
 for bad in ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>','<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/x.png"/></svg>']:
  page.locator('#lab-file').set_input_files({'name':'bad.svg','mimeType':'image/svg+xml','buffer':bad.encode()});expect(page.locator('#lab-status')).to_have_attribute('data-error','true');expect(page.locator('#lab-run')).to_be_disabled()
 choose('PDF extra','number');sample();page.locator('#start').fill('5');run();reader=PdfReader(download('numbered.pdf'));assert '5 / 6' in reader.pages[0].extract_text() and '6 / 6' in reader.pages[1].extract_text()
 choose('PDF extra','watermark');sample();run();reader=PdfReader(download('watermark.pdf'));assert all('BORRADOR' in x.extract_text() for x in reader.pages)
 choose('PDF extra','forms');sample();page.get_by_label('Nombre',exact=True).fill('José Pérez');page.get_by_label('Acepto',exact=True).check();page.get_by_label('Tema',exact=True).select_option('Trabajo');run();fields=PdfReader(download('filled.pdf')).get_fields();assert fields['Nombre']['/V']=='José Pérez' and fields['Tema']['/V']=='Trabajo' and fields['Acepto']['/V']!='/Off'
 choose('PDF extra','extractImages');sample();run();im=Image.open(download('extracted.png'));assert im.size==(800,600) and im.convert('RGB').getpixel((150,150))==(35,70,56)
 choose('PDF extra','signature');sample();page.locator('#page').fill('2');page.locator('#page').dispatch_event('change');expect(page.locator('#signature-overlay')).to_be_visible();pad=page.locator('#signature');pad.scroll_into_view_if_needed();box=pad.bounding_box();page.mouse.move(box['x']+30,box['y']+30);page.mouse.down();page.mouse.move(box['x']+150,box['y']+75,steps=8);page.mouse.up();run();reader=PdfReader(download('signed.pdf'));assert len(reader.pages[1].images)==1
 page.screenshot(path=str(OUT/'desktop.png'))
 page.set_viewport_size({'width':390,'height':844});page.locator('#guide-title').scroll_into_view_if_needed();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(OUT/'mobile.png'))
 assert not errors,errors
 assert not [r for r in requests if r[0] not in ['GET','HEAD']],requests
 # The portable build needs no server or external library request, including PDF.js worker.
 portable=browser.new_page(accept_downloads=True);portable.goto('about:blank');portable.context.set_offline(True);portable.set_content(Path('docs/herramientas.html').read_text(),wait_until='load')
 portable.get_by_role('button',name='PDF extra',exact=True).click();portable.locator('#lab-sample').click();expect(portable.locator('#lab-run')).to_be_enabled(timeout=30000);portable.locator('#lab-run').click();expect(portable.locator('.lab-download')).to_be_visible(timeout=30000)
 browser.close()
print('PASS: 17 tools, independent downloads, PDF form values and signatures, SVG rejection, guide, mobile and offline PDF worker.')
