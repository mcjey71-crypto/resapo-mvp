import { MAX_TRACE_EDGE, MAX_IMAGE_PIXELS, MAX_IMAGE_BYTES } from './vector-core.js';

const $ = (id) => document.getElementById(id);
let selected = null, sourceURL = null, resultURL = null, worker = null, timer = null, generation = 0;
const workerURL = URL.createObjectURL(new Blob([__VECTOR_WORKER_SOURCE__], { type: 'text/javascript' }));
function message(text, error = false) {
  $('v-message').textContent = text;
  $('v-message').className = error ? 'vector-message error' : 'vector-message';
  $('v-message').hidden = !text;
}
function clearResult() {
  if (resultURL) URL.revokeObjectURL(resultURL);
  resultURL = null;
  $('v-output').removeAttribute('src');
  $('v-download').removeAttribute('href');
  $('v-download').hidden = true;
  $('v-result-empty').hidden = false;
  $('v-output').hidden = true;
  $('v-stats').textContent = 'Tu SVG aparecerá aquí.';
}
function busy(value) {
  document.querySelectorAll('[data-v-lock]').forEach(el => { el.disabled = value; });
  $('v-run').disabled = value || !selected;
  $('v-cancel').hidden = !value;
  $('v-working').hidden = !value;
  $('vector-workspace').setAttribute('aria-busy', String(value));
}
function stop() {
  generation++;
  worker?.terminate();
  worker = null;
  clearTimeout(timer);
  busy(false);
}
function reset() {
  stop();
  selected = null;
  if (sourceURL) URL.revokeObjectURL(sourceURL);
  sourceURL = null;
  $('v-original').removeAttribute('src');
  $('v-original').hidden = true;
  $('v-source-empty').hidden = false;
  $('v-filename').textContent = 'Ninguna imagen seleccionada';
  $('v-resolution').textContent = 'Las imágenes grandes se ajustan a un máximo de 1200 px por lado para crear los contornos.';
  $('v-input').value = '';
  clearResult();
  message('');
  busy(false);
}
async function load(file) {
  stop();
  const token = generation;
  message('');
  let bitmap;
  busy(true);
  try {
    if (!file || !/\.(png|jpe?g|webp)$/i.test(file.name) || !file.size || file.size > MAX_IMAGE_BYTES) {
      throw new Error('Elige un PNG, JPG o WebP de hasta 15 MB.');
    }
    // Decode before replacing the current selection, so an invalid upload does not lose work.
    bitmap = await createImageBitmap(file);
    if (token !== generation) return;
    if (bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) throw new Error('La imagen supera los 25 megapíxeles. Reduce su tamaño antes de subirla.');
    const ratio = Math.min(1, MAX_TRACE_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    selected = { name: file.name, image: ctx.getImageData(0, 0, canvas.width, canvas.height) };
    if (sourceURL) URL.revokeObjectURL(sourceURL);
    sourceURL = URL.createObjectURL(file);
    $('v-original').src = sourceURL;
    $('v-original').hidden = false;
    $('v-source-empty').hidden = true;
    $('v-filename').textContent = `${file.name} · ${bitmap.width} × ${bitmap.height} px`;
    $('v-resolution').textContent = ratio < 1
      ? `Para agilizar el trazado trabajamos a ${canvas.width} × ${canvas.height} px. El SVG se puede ampliar.`
      : `Resolución de trazado: ${canvas.width} × ${canvas.height} px.`;
    clearResult();
  } catch (error) {
    if (token === generation) message(error.message.includes('image') && error.name === 'InvalidStateError'
      ? 'No pudimos leer la imagen. Comprueba que el archivo no esté dañado.' : error.message, true);
  } finally {
    bitmap?.close();
    if (token === generation) busy(false);
  }
}
function run() {
  if (!selected) return;
  stop();
  clearResult();
  message('');
  busy(true);
  const token = generation;
  worker = new Worker(workerURL);
  const fail = (text) => { if (token !== generation) return; stop(); message(text, true); };
  worker.onerror = () => fail('No pudimos completar el trazado. Reduce el detalle o prueba una imagen más pequeña.');
  timer = setTimeout(() => fail('Esta imagen tardó demasiado. Prueba menos colores o una imagen más sencilla.'), 90000);
  worker.onmessage = ({ data }) => {
    if (token !== generation) return;
    stop();
    if (!data.ok) { message(data.message, true); return; }
    resultURL = URL.createObjectURL(new Blob([data.svg], { type: 'image/svg+xml' }));
    $('v-output').src = resultURL;
    $('v-output').hidden = false;
    $('v-result-empty').hidden = true;
    $('v-download').href = resultURL;
    $('v-download').download = selected.name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') + '-resapo.svg';
    $('v-download').hidden = false;
    $('v-stats').textContent = `${data.paths} trazados · ${Math.ceil(new Blob([data.svg]).size / 1024)} KB · SVG escalable`;
    message('Listo. Compara el resultado y descarga tu vector.');
  };
  worker.postMessage({
    image: { width: selected.image.width, height: selected.image.height, data: selected.image.data },
    settings: { mode: $('v-mode').value, colors: Number($('v-colors').value), detail: $('v-detail').value,
      threshold: Number($('v-threshold').value), removeWhite: $('v-white').checked },
  });
}
$('v-input').addEventListener('change', event => { if (event.target.files[0]) load(event.target.files[0]); event.target.value = ''; });
$('v-drop').onclick = () => $('v-input').click();
$('v-drop').ondragover = event => { event.preventDefault(); if (!$('v-drop').disabled) $('v-drop').classList.add('dragover'); };
$('v-drop').ondragleave = () => $('v-drop').classList.remove('dragover');
$('v-drop').ondrop = event => {
  event.preventDefault(); $('v-drop').classList.remove('dragover');
  if (!$('v-drop').disabled && event.dataTransfer.files[0]) load(event.dataTransfer.files[0]);
};
$('v-run').onclick = run;
$('v-clear').onclick = reset;
$('v-cancel').onclick = () => { stop(); message('Conversión cancelada. Puedes ajustar las opciones y volver a probar.'); };
document.querySelectorAll('.vector-controls input, .vector-controls select').forEach(el => el.addEventListener('change', () => {
  clearResult(); message('');
  $('v-color-row').hidden = $('v-mode').value === 'mono';
  $('v-threshold-row').hidden = $('v-mode').value !== 'mono';
}));
$('v-threshold').oninput = () => { $('v-threshold-value').textContent = $('v-threshold').value; };
$('v-zoom').oninput = () => {
  $('v-output').style.width = `${$('v-zoom').value}%`;
  $('v-output').parentElement.classList.toggle('is-zoomed', Number($('v-zoom').value) > 100);
  $('v-zoom-value').textContent = `${$('v-zoom').value}%`;
};
$('v-sample').onclick = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 480; canvas.height = 360;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f6f2e8'; ctx.fillRect(0, 0, 480, 360);
  ctx.fillStyle = '#254c3e'; ctx.beginPath(); ctx.arc(240, 194, 110, 0, Math.PI * 2); ctx.fill();
  for (const x of [180, 300]) {
    ctx.fillStyle = '#a3b96b'; ctx.beginPath(); ctx.arc(x, 105, 42, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, 103, 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#172e26'; ctx.beginPath(); ctx.arc(x + 4, 103, 11, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = '#e7bc67'; ctx.lineWidth = 10; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(240, 190, 55, .15, Math.PI - .15); ctx.stroke();
  canvas.toBlob(blob => load(new File([blob], 'sapo-ejemplo.png', { type: 'image/png' })), 'image/png');
};
window.addEventListener('pagehide', () => { reset(); URL.revokeObjectURL(workerURL); });
reset();
