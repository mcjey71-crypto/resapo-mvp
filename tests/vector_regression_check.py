"""Navigation stays in srcdoc; rendered comparisons against the pre-fix output."""
from pathlib import Path
import json, subprocess
from playwright.sync_api import sync_playwright,expect
subprocess.run(['node','tests/vector_quality_fixtures.mjs'],check=True)
OUT=Path('test-results/vector-quality');OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1100},accept_downloads=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 metrics={}
 for case in ['alpha','opaque','circle']:
  metrics[case]={}
  for version in ['before','after']:
   text=(OUT/f'{case}-{version}.svg').read_text()
   metrics[case][version]=page.evaluate('''async ({svg,circle})=>{const im=new Image(),u=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));im.src=u;await im.decode();const c=document.createElement('canvas'),scale=circle?8:4;c.width=c.height=160*scale;const ctx=c.getContext('2d');ctx.drawImage(im,0,0,c.width,c.height);const d=ctx.getImageData(0,0,c.width,c.height).data;let gaps=0;for(let y=6*scale;y<154*scale;y++)for(let x=6*scale;x<154*scale;x++)if(d[(y*c.width+x)*4+3]<250)gaps++;const radii=[];if(circle)for(let k=0;k<720;k++){const a=k*Math.PI/360;let radius=0;for(let r=53;r<=57;r+=.025){const x=Math.floor((80+Math.cos(a)*r)*scale),y=Math.floor((80+Math.sin(a)*r)*scale);if(d[(y*c.width+x)*4+3]>127)radius=r;}radii.push(radius);}URL.revokeObjectURL(u);return {gaps,center:Array.from(ctx.getImageData(80*scale,80*scale,1,1).data),rms:circle?Math.sqrt(radii.reduce((s,r)=>s+(r-55)**2,0)/720):0,peak:circle?Math.max(...radii)-55:0};}''',{'svg':text,'circle':case=='circle'})
 assert metrics['alpha']['before']['center'][3]==0 and metrics['alpha']['after']['center'][3]==255,metrics
 assert metrics['opaque']['before']['gaps']>100 and metrics['opaque']['after']['gaps']==0,metrics
 assert metrics['circle']['after']['rms']<metrics['circle']['before']['rms']*.8,metrics
 assert metrics['circle']['after']['peak']<metrics['circle']['before']['peak']*.6,metrics
 (OUT/'metrics.json').write_text(json.dumps(metrics,indent=2))
 page.goto('http://127.0.0.1:8501');page.get_by_role('button',name='Ingresar al estudio →').first.click();page.get_by_role('tab',name='Vectorizar imágenes',exact=True).click();frame=page.frame_locator('iframe').nth(1)
 # This reproduces the user's exact interaction, which earlier tests skipped.
 for iteration in range(2):
  frame.get_by_role('button',name='Abrir un archivo SVG ↓',exact=True).click()
  frame.locator('#svg-input').set_input_files('tests/fixtures/vector-quality/opaque-before.svg');expect(frame.locator('#svg-preview')).to_be_visible()
  expect(page.get_by_role('heading',name='¿Qué idea movemos hoy?')).to_be_visible()
  frame.get_by_role('button',name='Vectorizar una imagen',exact=True).click()
  frame.locator('#v-sample').click();expect(frame.locator('#v-run')).to_be_enabled();frame.locator('#v-run').click();expect(frame.locator('#v-download')).to_be_visible(timeout=45000)
  with page.expect_download() as event:frame.locator('#v-download').click()
  event.value.save_as(OUT/f'continued-{iteration}.svg')
  assert page.frames[2].url=='about:srcdoc',page.frames[2].url
 # Header / skip anchors cannot reload the embedded app either.
 frame.locator('.brand').click();expect(frame.locator('#v-download')).to_be_visible();assert page.frames[2].url=='about:srcdoc'
 assert 'logo' not in frame.locator('main').inner_text().lower()
 frame.locator('#v-show-viewer').click();page.screenshot(path=str(OUT/'streamlit-viewer.png'))
 page.set_viewport_size({'width':390,'height':844});assert frame.locator('html').evaluate('el=>el.scrollWidth<=innerWidth');page.screenshot(path=str(OUT/'mobile.png'))
 assert not errors,errors
 b.close()
print('PASS: viewer navigation never reloads Streamlit, reopen and trace/download twice; opaque pixels and seams fixed; reduced circular contour error/peaks; mobile.')
