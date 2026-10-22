import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const worker = await build({ entryPoints: ['src/vector-worker.js'], bundle: true, minify: true, format: 'iife', write: false, target: ['es2020'], legalComments: 'inline' });
await build({ entryPoints: ['src/vector-app.js'], outfile: 'web/vector-app.js', bundle: true, minify: true, format: 'iife', target: ['es2020'], define: { __VECTOR_WORKER_SOURCE__: JSON.stringify(worker.outputFiles[0].text) }, legalComments: 'inline' });
const notices = await readFile('THIRD_PARTY_NOTICES.md', 'utf8');
const js = '/*!\n' + notices.replaceAll('*/', '* /') + '\n*/\n' + await readFile('web/vector-app.js', 'utf8');
await writeFile('web/vector-app.js', js);
const logo = await readFile('web/logo.svg', 'utf8');
const html = (await readFile('src/vector-template.html', 'utf8')).replace('{{LOGO}}', logo);
await writeFile('web/vector.html', html);
let portable = html.replace(/<!-- SERVER-NAV -->.*?<!-- \/SERVER-NAV -->/s, '')
  .replace(/<link rel="icon"[^>]+>/, `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(logo)}" type="image/svg+xml">`);
for (const css of ['styles.css', 'studio.css', 'vector-styles.css']) {
  portable = portable.replace(`<link rel="stylesheet" href="/static/${css}">`, `<style>${await readFile(`web/${css}`, 'utf8')}</style>`);
}
portable = portable.replace('<script src="/static/vector-app.js" defer></script>', '')
  .replace('</body>', () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script></body>`);
await mkdir('docs', { recursive: true });
await writeFile('docs/vectorizar.html', portable);
console.log('Vectorización: aplicación web y versión autónoma generadas.');
