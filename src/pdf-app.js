import { LIMITS, TOOLS, parsePages, parseGroups, validateFiles } from './pdf-options.js';
const $ = id => document.getElementById(id);
const state = { tool: 'merge', files: [], pages: [], busy: false, output: null, selected: new Set(), generation: 0 };
let worker, requestId = 0;
const requests = new Map();
const workerURL = URL.createObjectURL(new Blob([__PDF_WORKER_SOURCE__], { type: 'text/javascript' }));
function startWorker() {
  worker = new Worker(workerURL);
  worker.onmessage = ({ data }) => {
    const request = requests.get(data.id);
    if (!request) return;
    requests.delete(data.id);
    data.error ? request.reject(new Error(data.error)) : request.resolve(data.result);
  };
  worker.onerror = () => {
    for (const request of requests.values()) request.reject(new Error('No pudimos procesar estos archivos. Prueba con documentos más pequeños.'));
    requests.clear();
    worker.terminate(); worker = null;
  };
}
function run(action, payload) {
  return new Promise((resolve, reject) => {
    if (!worker) startWorker();
    const id = ++requestId;
    requests.set(id, { resolve, reject });
    worker.postMessage({ id, action, payload });
  });
}
function message(text = '', kind = 'error') {
  $('pdf-message').textContent = text;
  $('pdf-message').hidden = !text;
  $('pdf-message').className = `pdf-message ${kind}`;
}
function clearOutput() {
  if (state.output) URL.revokeObjectURL(state.output.url);
  state.output = null;
  $('pdf-result').hidden = true;
}
function releaseFiles() {
  state.files.forEach(file => URL.revokeObjectURL(file.url));
  state.files = []; state.pages = []; state.selected.clear();
}
function busy(value, label = 'Preparando tu documento…') {
  state.busy = value;
  $('pdf-status').textContent = label;
  $('pdf-working').hidden = !value;
  $('pdf-workspace').setAttribute('aria-busy', String(value));
  document.querySelectorAll('[data-lock]').forEach(el => { el.disabled = value; });
  controls();
}
function controls() {
  $('pdf-run').disabled = state.busy || !state.files.length || (state.tool === 'merge' && state.files.length < 2) || (state.tool === 'organize' && !state.pages.length);
  $('pdf-run-label').textContent = TOOLS[state.tool].label;
  $('pdf-clear').disabled = state.busy || !state.files.length;
  $('pdf-sample').disabled = state.busy;
  $('pdf-ranges').disabled = state.busy || (state.tool === 'split' && $('pdf-each-page').checked);
  $('pdf-orientation').disabled = state.busy || $('pdf-size').value === 'original';
  $('pdf-file-count').textContent = `${state.files.length} ${state.files.length === 1 ? 'archivo' : 'archivos'}`;
  $('pdf-empty').hidden = state.files.length > 0;
  $('pdf-organizer').hidden = state.tool !== 'organize' || !state.pages.length;
  $('pdf-selection-count').textContent = `${state.selected.size} seleccionadas`;
  for (const id of ['pdf-rotate','pdf-delete-pages']) $(id).disabled = state.busy || !state.selected.size;
  $('pdf-reset-order').disabled = state.busy || !state.files.length;
  updateMoveButtons();
}
function switchTool(tool) {
  if (state.busy || !TOOLS[tool]) return;
  if (tool !== state.tool) { releaseFiles(); clearOutput(); }
  state.tool = tool;
  $('pdf-input').value = '';
  message();
  document.querySelectorAll('[data-tool]').forEach(button => {
    const active = button.dataset.tool === tool;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('pdf-tool-title').textContent = TOOLS[tool].title;
  $('pdf-tool-description').textContent = TOOLS[tool].description;
  $('pdf-input').accept = tool === 'images' ? '.jpg,.jpeg,.png' : '.pdf';
  $('pdf-input').multiple = Boolean(TOOLS[tool].multiple);
  $('pdf-drop-title').textContent = tool === 'images' ? 'Suelta tus imágenes aquí' : TOOLS[tool].multiple ? 'Suelta tus archivos PDF aquí' : 'Suelta tu archivo PDF aquí';
  $('pdf-formats').textContent = tool === 'images' ? 'JPG y PNG · hasta 20 imágenes' : 'PDF · hasta 500 páginas';
  $('pdf-range-options').hidden = !['extract','remove','split'].includes(tool);
  $('pdf-image-options').hidden = tool !== 'images';
  $('pdf-range-label').textContent = tool === 'remove' ? 'Páginas que quieres eliminar' : tool === 'split' ? 'Grupos de páginas' : 'Páginas que quieres extraer';
  $('pdf-ranges').value = '';
  $('pdf-each-page').checked = false;
  $('pdf-ranges').placeholder = tool === 'split' ? '1-3; 4-6' : '1-3, 5';
  $('pdf-range-hint').textContent = tool === 'split' ? 'Separa los grupos con ;. Cada grupo se guarda en un PDF dentro del ZIP. Las páginas no indicadas se omiten.' : tool === 'remove' ? 'Ejemplo: 2, 4-6. Las demás páginas se conservan.' : 'Ejemplo: 1-3, 5. El PDF nuevo seguirá el orden que escribas.';
  $('pdf-split-each').hidden = tool !== 'split';
  $('pdf-sample').hidden = tool === 'images';
  render();
}
function button(text, title, callback, disabled = false) {
  const el = document.createElement('button'); el.type = 'button'; el.textContent = text; el.className = 'pdf-mini';
  el.setAttribute('aria-label', title); el.title = title; el.dataset.lock = '';
  el.disabled = state.busy || disabled; el.addEventListener('click', callback); return el;
}
function move(list, from, to) {
  if (state.busy || to < 0 || to >= list.length) return;
  list.splice(to, 0, list.splice(from, 1)[0]); clearOutput(); render();
}
function resetPages(redraw = true) {
  state.pages = state.files[0]?.info.map((_, page) => ({ source: 0, page, rotation: 0 })) || [];
  state.selected.clear(); clearOutput(); if (redraw) render();
}
// Views are keyed by the actual item, not its name or position. Reordering must
// keep DOM nodes, decoded thumbnails, keyboard focus and scroll position intact.
const fileViews = new WeakMap(), pageViews = new WeakMap();
function disabled(el, value) { if (el && el.disabled !== value) el.disabled = value; }
function updateMoveButtons() {
  for (const [items, views] of [[state.files, fileViews], [state.pages, pageViews]]) {
    items.forEach((item, i) => {
      const view = views.get(item);
      if (!view) return;
      disabled(view.before, state.busy || i === 0);
      disabled(view.after, state.busy || i === items.length - 1);
    });
  }
}
function reconcile(container, nodes) {
  const wanted = new Set(nodes), focus = document.activeElement;
  const scrollTop = container.scrollTop, scrollLeft = container.scrollLeft;
  for (const child of [...container.children]) if (!wanted.has(child)) child.remove();
  let cursor = container.firstElementChild;
  for (const node of nodes) {
    if (node !== cursor) container.insertBefore(node, cursor);
    else cursor = cursor.nextElementSibling;
  }
  // insertBefore may blur a moved node in older browsers. Restore without scroll.
  if (focus?.isConnected && document.activeElement !== focus && !focus.disabled)
    focus.focus({ preventScroll: true });
  container.scrollTop = scrollTop; container.scrollLeft = scrollLeft;
}
function fileView(file) {
  let view = fileViews.get(file);
  if (view) return view;
  const row = document.createElement('li'); row.className = 'pdf-file';
  const icon = document.createElement('span'); icon.className = 'pdf-file-icon';
  if (state.tool === 'images') { const image = document.createElement('img'); image.src = file.url; image.alt = ''; icon.append(image); }
  else icon.textContent = 'PDF';
  const details = document.createElement('div'); details.className = 'pdf-file-detail';
  const name = document.createElement('strong'); name.textContent = file.name;
  const meta = document.createElement('span'); meta.textContent = `${state.tool === 'images' ? 'Imagen' : `${file.info.length} páginas`} · ${(file.size / 1024 / 1024).toFixed(2)} MB`;
  const preview = document.createElement('a'); preview.href = file.url; preview.target = '_blank'; preview.rel = 'noopener'; preview.textContent = 'Ver original'; preview.className = 'pdf-original';
  details.append(name, meta, preview);
  const actions = document.createElement('div'); actions.className = 'pdf-file-actions';
  view = { row };
  if (TOOLS[state.tool].multiple) {
    view.before = button('↑', `Subir ${file.name}`, () => { const i = state.files.indexOf(file); move(state.files, i, i - 1); });
    view.after = button('↓', `Bajar ${file.name}`, () => { const i = state.files.indexOf(file); move(state.files, i, i + 1); });
    actions.append(view.before, view.after);
  }
  actions.append(button('×', `Quitar ${file.name}`, () => {
    URL.revokeObjectURL(file.url); state.files.splice(state.files.indexOf(file), 1); state.pages = []; state.selected.clear(); clearOutput(); render();
  }));
  row.append(icon, details, actions);
  fileViews.set(file, view);
  return view;
}
function updatePage(item, view) {
  const selected = state.selected.has(item.page);
  if (view.checkbox.checked !== selected) view.checkbox.checked = selected;
  if (view.selected !== selected) {
    view.card.classList.toggle('selected', selected); view.selected = selected;
  }
  const angle = ((state.files[0].info[item.page].rotation + item.rotation) % 360 + 360) % 360;
  if (view.angle !== angle) {
    view.paper.className = `pdf-page-paper angle-${angle}`;
    view.caption.textContent = `Original ${item.page + 1} · ${angle}°`;
    view.angle = angle;
  }
}
function pageView(item) {
  let view = pageViews.get(item);
  if (view) { updatePage(item, view); return view; }
  const card = document.createElement('li'); card.className = 'pdf-page-card';
  const label = document.createElement('label');
  const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.dataset.lock = ''; checkbox.disabled = state.busy;
  checkbox.setAttribute('aria-label', `Seleccionar página ${item.page + 1}`);
  checkbox.addEventListener('change', () => {
    checkbox.checked ? state.selected.add(item.page) : state.selected.delete(item.page);
    updatePage(item, view); controls();
  });
  const paper = document.createElement('span'); paper.textContent = String(item.page + 1);
  const caption = document.createElement('span'); caption.className = 'pdf-page-caption';
  label.append(checkbox, paper, caption);
  const actions = document.createElement('div'); actions.className = 'pdf-page-actions';
  const before = button('←', `Mover página ${item.page + 1} antes`, () => { const i = state.pages.indexOf(item); move(state.pages, i, i - 1); });
  const after = button('→', `Mover página ${item.page + 1} después`, () => { const i = state.pages.indexOf(item); move(state.pages, i, i + 1); });
  actions.append(before, button('↻', `Girar página ${item.page + 1}`, () => { item.rotation = (item.rotation + 90) % 360; clearOutput(); updatePage(item, view); }), after);
  const preview = document.createElement('a'); preview.href = `${state.files[0].url}#page=${item.page + 1}`; preview.target = '_blank'; preview.rel = 'noopener'; preview.textContent = 'Ver página'; preview.className = 'pdf-original';
  card.append(label, actions, preview);
  view = { card, checkbox, paper, caption, before, after };
  pageViews.set(item, view); updatePage(item, view);
  return view;
}
function render() {
  reconcile($('pdf-files'), state.files.map(file => fileView(file).row));
  reconcile($('pdf-pages'), state.tool === 'organize' ? state.pages.map(item => pageView(item).card) : []);
  const total = `${state.pages.length} páginas en el resultado`;
  if ($('pdf-page-total').textContent !== total) $('pdf-page-total').textContent = total;
  controls();
}
async function normalizeImage(file) {
  let bitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error(`No pudimos leer «${file.name}». Usa un JPG o PNG válido.`); }
  try {
    if (bitmap.width * bitmap.height > LIMITS.pixels) throw new Error('Una imagen supera los 25 megapíxeles. Reduce su tamaño para continuar.');
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, /\.png$/i.test(file.name) ? 'image/png' : 'image/jpeg', .95));
    canvas.width = canvas.height = 0;
    if (!blob) throw new Error('No pudimos preparar la imagen. Prueba con una más pequeña.');
    return new Uint8Array(await blob.arrayBuffer());
  } finally { bitmap.close(); }
}
async function addFiles(files) {
  if (state.busy || !files.length) return;
  const generation = state.generation;
  const added = [];
  try {
    validateFiles(state.files, files, state.tool); message(); busy(true, 'Leyendo tus archivos…');
    for (const file of files) {
      let bytes, info = [];
      if (state.tool === 'images') bytes = await normalizeImage(file);
      else { bytes = new Uint8Array(await file.arrayBuffer()); info = await run('inspect', bytes); }
      if (generation !== state.generation) throw new DOMException('Cancelado', 'AbortError');
      const count = [...state.files, ...added].reduce((n, f) => n + f.info.length, 0) + info.length;
      if (count > LIMITS.pages) throw new Error('Los documentos suman más de 500 páginas. Trabaja en grupos más pequeños.');
      added.push({ name: file.name, size: file.size, bytes, info, url: URL.createObjectURL(file) });
    }
    state.files.push(...added); clearOutput();
    if (state.tool === 'organize') resetPages(false);
  } catch (error) {
    added.forEach(file => URL.revokeObjectURL(file.url));
    if (error.name !== 'AbortError') message(error.message);
  } finally { if (generation === state.generation) { busy(false); render(); } }
}
async function generate() {
  if (state.busy || !state.files.length) return;
  const generation = state.generation;
  try {
    message(); clearOutput(); busy(true, 'Creando tu archivo…');
    let bytes, name = 'resapo.pdf', mime = 'application/pdf', summary;
    const sources = state.files.map(f => f.bytes);
    const base = state.files[0].name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_');
    if (state.tool === 'merge') {
      if (sources.length < 2) throw new Error('Añade al menos dos PDF para unirlos.');
      const plan = state.files.flatMap((file, source) => file.info.map((_, page) => ({ source, page })));
      bytes = await run('compose', { sources, plan }); name = 'resapo-unido.pdf'; summary = `${sources.length} documentos · ${plan.length} páginas`;
    } else if (state.tool === 'split') {
      const groups = $('pdf-each-page').checked ? state.files[0].info.map((_, i) => [i]) : parseGroups($('pdf-ranges').value, state.files[0].info.length);
      bytes = await run('split', { bytes: sources[0], groups }); name = `${base}-dividido.zip`; mime = 'application/zip'; summary = `${groups.length} archivos PDF dentro del ZIP`;
    } else if (state.tool === 'images') {
      bytes = await run('images', { images: sources, options: { size: $('pdf-size').value, orientation: $('pdf-orientation').value, margin: Number($('pdf-margin').value) } });
      name = 'resapo-imagenes.pdf'; summary = `${sources.length} imágenes · una por página`;
    } else {
      let plan;
      if (state.tool === 'organize') plan = state.pages;
      else {
        let indexes = parsePages($('pdf-ranges').value, state.files[0].info.length);
        if (state.tool === 'remove') { const removed = new Set(indexes); indexes = state.files[0].info.map((_, i) => i).filter(i => !removed.has(i)); }
        plan = indexes.map(page => ({ source: 0, page }));
      }
      bytes = await run('compose', { sources, plan });
      name = `${base}-${state.tool === 'extract' ? 'extraido' : state.tool === 'remove' ? 'recortado' : 'organizado'}.pdf`;
      summary = `${plan.length} ${plan.length === 1 ? 'página' : 'páginas'} en tu documento`;
    }
    if (generation !== state.generation) return;
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    state.output = { url, name };
    $('pdf-download').href = url; $('pdf-download').download = name;
    $('pdf-result-summary').textContent = `${summary} · ${(bytes.length / 1024).toFixed(1)} KB`;
    $('pdf-view-result').href = url; $('pdf-view-result').hidden = mime !== 'application/pdf';
    $('pdf-result').hidden = false; $('pdf-download').focus({ preventScroll: true });
  } catch (error) { if (error.name !== 'AbortError') message(error.message); }
  finally { if (generation === state.generation) busy(false); }
}
document.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click', () => {
  switchTool(button.dataset.tool); $('pdf-workspace').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
}));
$('pdf-drop').addEventListener('click', () => { $('pdf-input').value = ''; $('pdf-input').click(); });
$('pdf-input').addEventListener('change', event => addFiles([...event.target.files]));
for (const event of ['dragenter','dragover']) $('pdf-drop').addEventListener(event, e => { e.preventDefault(); if (!state.busy) $('pdf-drop').classList.add('dragover'); });
for (const event of ['dragleave','drop']) $('pdf-drop').addEventListener(event, e => { e.preventDefault(); $('pdf-drop').classList.remove('dragover'); if (event === 'drop') addFiles([...e.dataTransfer.files]); });
window.addEventListener('dragover', e => e.preventDefault()); window.addEventListener('drop', e => e.preventDefault());
$('pdf-run').addEventListener('click', generate);
$('pdf-clear').addEventListener('click', () => { releaseFiles(); clearOutput(); message(); render(); });
$('pdf-cancel').addEventListener('click', () => {
  ++state.generation; worker?.terminate(); worker = null;
  for (const request of requests.values()) request.reject(new DOMException('Cancelado', 'AbortError'));
  requests.clear(); busy(false); render(); message('Operación cancelada. Tus archivos originales siguen intactos.', 'info');
});
$('pdf-rotate').addEventListener('click', () => { state.pages.filter(p => state.selected.has(p.page)).forEach(p => { p.rotation = (p.rotation + 90) % 360; }); clearOutput(); render(); });
$('pdf-delete-pages').addEventListener('click', () => {
  if (state.selected.size >= state.pages.length) return message('Conserva al menos una página.');
  state.pages = state.pages.filter(p => !state.selected.has(p.page)); state.selected.clear(); clearOutput(); message(); render();
});
$('pdf-reset-order').addEventListener('click', resetPages);
$('pdf-each-page').addEventListener('change', () => { $('pdf-ranges').disabled = $('pdf-each-page').checked; clearOutput(); });
for (const id of ['pdf-ranges', 'pdf-size', 'pdf-orientation', 'pdf-margin']) $(id).addEventListener('input', clearOutput);
$('pdf-size').addEventListener('change', () => { $('pdf-orientation').disabled = $('pdf-size').value === 'original'; });
$('pdf-sample').addEventListener('click', async () => {
  const generation = state.generation;
  busy(true, 'Preparando el ejemplo…');
  try {
    const bytes = await run('demo');
    if (generation !== state.generation) return;
    const files = state.tool === 'merge' ? [new File([bytes], 'Apuntes.pdf', { type: 'application/pdf' }), new File([bytes], 'Ideas.pdf', { type: 'application/pdf' })] : [new File([bytes], 'Ejemplo-Re-SAPO.pdf', { type: 'application/pdf' })];
    busy(false);
    await addFiles(files);
  } catch (error) {
    if (error.name !== 'AbortError') message(error.message);
  } finally { if (generation === state.generation) busy(false); }
});
window.addEventListener('beforeunload', e => { if (state.busy) { e.preventDefault(); e.returnValue = ''; } });
switchTool('merge');
