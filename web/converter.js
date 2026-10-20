const el = id => document.getElementById(id);
const limits = {
  audio: 'Hasta 50 MB y 15 minutos. Se convierte la primera pista de audio, en estéreo. MP3/M4A a 192 kbps y Opus a 128 kbps.',
  video: 'Hasta 50 MB. Extraer audio: hasta 15 minutos. Convertir video: hasta 5 minutos, entrada hasta 4K, salida hasta 720p/30 fps. Se omiten subtítulos y pistas adicionales.',
  image: 'Hasta 15 MB y 16 megapíxeles. Imágenes estáticas de una página. JPG, BMP y PDF reemplazan la transparencia por blanco.',
  document: 'Hasta 5 MB y 100 000 caracteres. PDF de hasta 100 páginas, sin contraseña. TXT/MD en UTF-8 o UTF-16 con BOM.',
};
let formats, file, url, processing = false;
function clear() {
  if (url) URL.revokeObjectURL(url);
  url = null;
  el('convert-result').hidden = true;
  el('convert-download').removeAttribute('href');
  el('convert-error').hidden = true;
  el('convert-status').textContent = '';
}
function configure() {
  if (!formats) return;
  clear(); file = null; el('convert-input').value = '';
  const category = el('convert-category').value;
  el('convert-formats').textContent = formats.sources[category].join(', ').toUpperCase();
  el('convert-input').accept = formats.sources[category].map(ext => '.' + ext).join(',');
  el('convert-limits').textContent = limits[category];
  el('convert-document-note').hidden = category !== 'document';
  el('convert-target').replaceChildren();
  el('convert-target').disabled = true;
  el('convert-run').disabled = true;
  el('convert-selected').textContent = 'Ningún archivo seleccionado.';
}
el('convert-category').onchange = configure;
el('convert-target').onchange = clear;
el('convert-input').onchange = () => {
  clear(); file = el('convert-input').files[0]; el('convert-target').replaceChildren();
  el('convert-run').disabled = true; el('convert-target').disabled = true;
  if (!file) { el('convert-selected').textContent = 'Ningún archivo seleccionado.'; return; }
  const category = el('convert-category').value;
  const ext = file.name.split('.').pop().toLowerCase();
  const maximum = { audio: 50, video: 50, image: 15, document: 5 }[category] * 1024 * 1024;
  if (!formats.sources[category].includes(ext) || !file.size || file.size > maximum) {
    el('convert-error').textContent = 'Elige un archivo compatible dentro del límite de tamaño.';
    el('convert-error').hidden = false; file = null; return;
  }
  el('convert-selected').textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`;
  for (const target of formats.targets[category]) {
    if (target === ({ jpeg: 'jpg', tif: 'tiff' }[ext] || ext)) continue;
    el('convert-target').add(new Option(target.toUpperCase(), target));
  }
  el('convert-target').disabled = false; el('convert-run').disabled = false;
};
el('convert-run').onclick = async () => {
  if (!file || processing) return;
  clear(); processing = true;
  document.querySelectorAll('[data-convert-lock]').forEach(node => { node.disabled = true; });
  el('convert-run').disabled = true;
  el('convert-workspace').setAttribute('aria-busy', 'true');
  el('convert-status').textContent = 'Convirtiendo tu archivo… Mantén esta pestaña abierta.';
  try {
    const target = el('convert-target').value;
    const response = await fetch('/api/conversions?' + new URLSearchParams({ filename: file.name, target }),
      { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
    if (!response.ok) throw new Error((await response.json()).detail || 'No se pudo convertir el archivo.');
    const blob = await response.blob();
    url = URL.createObjectURL(blob);
    el('convert-download').href = url;
    const filename = response.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''(.+)$/)?.[1];
    el('convert-download').download = filename ? decodeURIComponent(filename) : 'resapo.' + target;
    el('convert-note').textContent = decodeURIComponent(response.headers.get('X-Conversion-Note') || '');
    el('convert-result').hidden = false;
    el('convert-status').textContent = `Conversión completada · ${(blob.size / 1024 / 1024).toFixed(2)} MB`;
  } catch (error) {
    el('convert-status').textContent = '';
    el('convert-error').textContent = error.message || 'Revisa tu conexión y vuelve a intentarlo.';
    el('convert-error').hidden = false;
  } finally {
    processing = false;
    document.querySelectorAll('[data-convert-lock]').forEach(node => { node.disabled = false; });
    el('convert-run').disabled = !file;
    el('convert-workspace').setAttribute('aria-busy', 'false');
  }
};
fetch('/api/conversions/formats').then(response => {
  if (!response.ok) throw new Error('No se pudo conectar con el convertidor.');
  return response.json();
}).then(data => { formats = data; configure(); }).catch(error => {
  el('convert-error').textContent = error.message; el('convert-error').hidden = false;
});
window.addEventListener('pagehide', () => { if (url) URL.revokeObjectURL(url); });
