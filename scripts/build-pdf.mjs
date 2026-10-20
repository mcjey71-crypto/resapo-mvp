import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const worker = await build({ entryPoints: ['src/pdf-worker.js'], bundle: true, minify: true, format: 'iife', write: false, target: ['es2020'], legalComments: 'inline' });
await build({ entryPoints: ['src/pdf-app.js'], outfile: 'web/pdf-app.js', bundle: true, minify: true, format: 'iife', target: ['es2020'], define: { __PDF_WORKER_SOURCE__: JSON.stringify(worker.outputFiles[0].text) }, legalComments: 'inline' });
const notices = await readFile('THIRD_PARTY_NOTICES.md', 'utf8');
const bundled = await readFile('web/pdf-app.js', 'utf8');
await writeFile('web/pdf-app.js', '/*!\n' + notices.replaceAll('*/', '* /') + '\n*/\n' + bundled);
let html = await readFile('src/pdf-template.html', 'utf8');
const logo = await readFile('web/logo.svg', 'utf8');
html = html.replace('{{LOGO}}', logo);
await writeFile('web/pdf.html', html);
// One self-contained file: downloadable, usable offline, and publishable with Pages.
let portable = html
  .replace(/<link rel="icon"[^>]+>/, `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(logo)}" type="image/svg+xml">`)
  .replace(/<!-- SERVER-NAV -->.*?<!-- \/SERVER-NAV -->/s, '');
for (const css of ['styles.css', 'pdf-styles.css', 'studio.css']) {
  portable = portable.replace(`<link rel="stylesheet" href="/static/${css}">`, `<style>${await readFile(`web/${css}`, 'utf8')}</style>`);
}
const js = (await readFile('web/pdf-app.js', 'utf8')).replace(/<\/script/gi, '<\\/script');
portable = portable.replace('<script src="/static/pdf-app.js" defer></script>', '');
portable = portable.replace('</body>', `<script>${js}</script></body>`);
await mkdir('docs', { recursive: true });
await writeFile('docs/index.html', portable);
await writeFile('docs/.nojekyll', '');
console.log('PDF: aplicación web y versión autónoma generadas.');
