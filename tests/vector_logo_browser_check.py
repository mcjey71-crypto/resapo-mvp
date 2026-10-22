"""Logo settings, SVG viewer and rendered fidelity; no mocked tracing."""
from pathlib import Path
from io import BytesIO
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright,expect
import xml.etree.ElementTree as ET
OUT=Path('test-results/vector-logos');OUT.mkdir(parents=True,exist_ok=True)
def file(image,name='logo.png'):
 b=BytesIO();image.save(b,format='PNG');return {'name':name,'mimeType':'image/png','buffer':b.getvalue()}
def pixels(page,selector,points,size):
 return page.locator(selector).evaluate('''async (img,args)=>{await img.decode();const c=document.createElement('canvas');c.width=args.size[0];c.height=args.size[1];const ctx=c.getContext('2d');ctx.drawImage(img,0,0,c.width,c.height);return args.points.map(([x,y])=>Array.from(ctx.getImageData(x,y,1,1).data));}''',{'points':points,'size':size})
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=b.new_context(viewport={'width':1440,'height':1100},accept_downloads=True);page=context.new_page();errors=[];external=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:external.append(r.url) if r.url.startswith('https://') else None)
 page.goto('http://127.0.0.1:8000/vectorizar');context.set_offline(True)
 im=Image.new('RGB',(200,200),'white');d=ImageDraw.Draw(im);d.rectangle((30,30,170,170),fill='#123456');d.rectangle((80,80,120,120),fill='white')
 page.locator('#v-input').set_input_files(file(im));expect(page.locator('#v-run')).to_be_enabled()
 page.locator('#v-preset').select_option('flat');expect(page.locator('#v-colors')).to_have_value('4');expect(page.locator('#v-speckles')).to_have_value('0')
 page.locator('#v-background').select_option('edge');page.locator('#v-run').click();expect(page.locator('#v-download')).to_be_visible(timeout=45000)
 px=pixels(page,'#v-output',[(0,0),(100,100),(50,50)],(200,200));assert px[0][3]==0 and px[1]==[255,255,255,255] and px[2]==[18,52,86,255],px
 page.locator('#v-palette').fill('#abcdef, #123456');expect(page.locator('#v-download')).to_be_hidden();page.locator('#v-run').click();expect(page.locator('#v-download')).to_be_visible(timeout=45000)
 with page.expect_download() as ev:page.locator('#v-download').click()
 ev.value.save_as(OUT/'brand.svg');root=ET.parse(ev.value.path()).getroot();assert all(n.attrib['fill'] in ['rgb(171,205,239)','rgb(18,52,86)'] for n in root.findall('{http://www.w3.org/2000/svg}path'))
 page.locator('#svg-result').click();expect(page.locator('#svg-preview')).to_be_visible();page.locator('#svg-zoom').fill('400');expect(page.locator('#svg-zoom-value')).to_have_text('400%');page.locator('#svg-background').select_option('dark');page.locator('#svg-fit').click();expect(page.locator('#svg-zoom-value')).to_have_text('100%')
 # Real imported SVG with gradients, CSS classes and Illustrator-like metadata.
 svg='''<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 100 100"><metadata>logo</metadata><defs><linearGradient id="paint"><stop stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient><style>.logo { fill: url(#paint); }</style></defs><rect class="logo" width="100" height="100"/></svg>'''
 page.locator('#svg-input').set_input_files({'name':'marca.svg','mimeType':'image/svg+xml','buffer':svg.encode()});expect(page.locator('#svg-info')).to_contain_text('marca.svg');px=pixels(page,'#svg-preview',[(10,50),(90,50)],(100,100));assert px[0][0]>px[0][2] and px[1][2]>px[1][0],px
 page.screenshot(path=str(OUT/'viewer-desktop.png'))
 for bad in ['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>','<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>','<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/x.png"/></svg>','<svg xmlns="http://www.w3.org/2000/svg"><style>@import "https://example.com/x.css";</style></svg>','<svg']:
  page.locator('#svg-input').set_input_files({'name':'bad.svg','mimeType':'image/svg+xml','buffer':bad.encode()});expect(page.locator('#svg-info')).not_to_be_empty();expect(page.locator('#svg-preview')).to_be_hidden()
 page.locator('#svg-result').click();expect(page.locator('#svg-preview')).to_be_visible()
 # 2400px mode really retains 2000px original detail; the default reduces to 1200.
 big=Image.new('RGB',(2000,500),'white');d=ImageDraw.Draw(big);d.rectangle((300,100,1700,400),fill='black');d.rectangle((950,200,1050,300),fill='white')
 page.locator('#v-input').set_input_files(file(big,'grande.png'));expect(page.locator('#v-resolution')).to_contain_text('1200 × 300');page.locator('#v-preset').select_option('letters');expect(page.locator('#v-resolution')).to_contain_text('2000 × 500');page.locator('#v-ink').fill('#004488');page.locator('#v-run').click();expect(page.locator('#v-download')).to_be_visible(timeout=45000)
 with page.expect_download() as ev:page.locator('#v-download').click()
 root=ET.parse(ev.value.path()).getroot();assert root.attrib['viewBox']=='0 0 2000 500';assert all(n.attrib['fill']=='rgb(0,68,136)' for n in root.findall('{http://www.w3.org/2000/svg}path'))
 page.locator('#v-zoom').fill('300');assert page.locator('#v-original').evaluate("el=>el.style.width")=='300%';page.locator('#v-preview-bg').select_option('dark')
 page.locator('#v-preset').scroll_into_view_if_needed();page.screenshot(path=str(OUT/'controls-desktop.png'))
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.locator('#svg-result').click();page.screenshot(path=str(OUT/'viewer-mobile.png'))
 # Importing into the exact self-contained Streamlit iframe works offline too.
 portable=context.new_page();portable.set_content(Path('docs/vectorizar.html').read_text());portable.locator('#svg-input').set_input_files({'name':'portable.svg','mimeType':'image/svg+xml','buffer':svg.encode()});expect(portable.locator('#svg-preview')).to_be_visible();assert not errors,errors;assert not external,external
 # Same controls and viewer in the actual Streamlit iframe.
 cloud=b.new_page(viewport={'width':1440,'height':1100},accept_downloads=True);cloud.goto('http://127.0.0.1:8501');cloud.get_by_role('button',name='Ingresar al estudio →').first.click();cloud.get_by_role('tab',name='Vectorizar imágenes',exact=True).click();frame=cloud.frame_locator('iframe').nth(1)
 frame.locator('#v-preset').select_option('flat');frame.locator('#v-sample').click();expect(frame.locator('#v-run')).to_be_enabled();frame.locator('#v-run').click();expect(frame.locator('#v-download')).to_be_visible(timeout=45000);frame.locator('#svg-result').click();expect(frame.locator('#svg-preview')).to_be_visible();frame.locator('#svg-input').set_input_files({'name':'streamlit.svg','mimeType':'image/svg+xml','buffer':svg.encode()});expect(frame.locator('#svg-info')).to_contain_text('streamlit.svg');cloud.screenshot(path=str(OUT/'streamlit-viewer.png'));b.close()
print('PASS: exact brand palette, enclosed whites/transparent perimeter, 2000px output, ink color, synchronized zoom, gradient/CSS SVG viewer, blocked active/external SVG, mobile and offline.')
