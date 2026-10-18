'use strict';
const $ = (id) => document.getElementById(id);
const ui = Object.fromEntries(['file-input','dropzone','selected-file','file-name','file-size','remove-file','language','limits','transcribe','processing','progress','progress-text','cancel','error','system-status','system-text','empty-result','empty-title','empty-description','result-content','result-badge','transcript','word-count','result-info','edit-hint','copy','download','toast'].map(id => [id, $(id)]));
let file = null;
let resultFilename = "transcripcion";
let busy = false;
let connected = false;
let jobId = null;
let upload = null;
let runId = 0;
let limit = 200 * 1024 * 1024;
let extensions = ['.mp3','.wav','.m4a','.ogg','.flac','.aac','.mp4','.mov','.mkv','.webm','.opus'];
let toastTimer;
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function error(message = '') {
  ui.error.textContent = message;
  ui.error.hidden = !message;
}
function toast(message) {
  clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.hidden = false;
  toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 4000);
}
function controls() {
  ui.transcribe.disabled = busy || !file || !connected;
  for (const name of ['dropzone','file-input','remove-file','language']) ui[name].disabled = busy;
  ui.processing.hidden = !busy;
  document.querySelector('.result-panel').setAttribute('aria-busy', String(busy));
  const noText = !ui.transcript.value.trim();
  ui.copy.disabled = busy || noText;
  ui.download.disabled = busy || noText;
}
function resetResult() {
  ui.transcript.value = '';
  ui['result-content'].hidden = true;
  ui['result-badge'].hidden = true;
  ui['empty-result'].hidden = false;
  ui['empty-title'].textContent = 'Aquí aterrizan tus ideas.';
  ui['empty-description'].textContent = 'Sube un archivo y deja que Re-SAPO lo convierta en palabras.';
  ui['edit-hint'].textContent = 'Un espacio para lo que vale la pena recordar.';
  controls();
}
function selectFile(candidate) {
  if (busy || !candidate) return;
  const extension = '.' + candidate.name.split('.').pop().toLowerCase();
  if (!extensions.includes(extension)) return error('Elige un archivo de audio o video compatible, como MP3, WAV o MP4.');
  if (!candidate.size) return error('El archivo está vacío. Elige otro.');
  if (candidate.size > limit) return error(`El archivo supera los ${Math.round(limit / 1024 / 1024)} MB. Elige uno más pequeño.`);
  file = candidate;
  error();
  ui['file-name'].textContent = file.name;
  ui['file-size'].textContent = file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(1)} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`;
  ui['selected-file'].hidden = false;
  controls();
}
ui.dropzone.addEventListener('click', () => { ui['file-input'].value = ''; ui['file-input'].click(); });
ui['file-input'].addEventListener('change', event => selectFile(event.target.files[0]));
for (const type of ['dragenter','dragover']) ui.dropzone.addEventListener(type, event => {
  event.preventDefault();
  if (!busy) ui.dropzone.classList.add('dragover');
});
for (const type of ['dragleave','drop']) ui.dropzone.addEventListener(type, event => {
  event.preventDefault();
  ui.dropzone.classList.remove('dragover');
  if (type === 'drop') {
    if (event.dataTransfer.files.length > 1) error('Transcribe un archivo a la vez.');
    else selectFile(event.dataTransfer.files[0]);
  }
});
// Prevent an accidental drop outside the target from replacing the page.
window.addEventListener('dragover', event => event.preventDefault());
window.addEventListener('drop', event => event.preventDefault());
ui['remove-file'].addEventListener('click', () => {
  file = null;
  ui['file-input'].value = '';
  ui['selected-file'].hidden = true;
  error(); controls();
});

async function health() {
  try {
    const response = await fetch('/api/health', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error();
    const info = await response.json();
    connected = info.ffmpeg && info.model_cached;
    limit = info.max_bytes;
    extensions = info.extensions;
    ui.limits.textContent = `Hasta ${Math.round(limit / 1024 / 1024)} MB · ${info.max_minutes} minutos por archivo`;
    ui['system-text'].textContent = connected ? 'Listo para escuchar' : 'Motor pendiente de configurar';
  } catch {
    connected = false;
    ui['system-text'].textContent = 'Sin conexión al servidor';
  }
  ui['system-status'].classList.toggle('unavailable', !connected);
  controls();
}

function sendFile(source, language) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    upload = xhr;
    xhr.open('POST', '/api/transcriptions?' + new URLSearchParams({ filename: source.name, language }));
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.timeout = 10 * 60 * 1000;
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) {
        const progress = Math.round(event.loaded / event.total * 100);
        ui.progress.value = progress;
        ui['progress-text'].textContent = progress === 100 ? 'Archivo enviado. Preparando…' : `Subiendo archivo… ${progress}%`;
      }
    };
    xhr.onload = () => {
      upload = null;
      let body;
      try { body = JSON.parse(xhr.responseText); } catch { return reject(new Error('El servidor devolvió una respuesta inesperada.')); }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(typeof body.detail === 'string' ? body.detail : 'No pudimos subir el archivo. Inténtalo de nuevo.'));
    };
    xhr.onerror = () => { upload = null; reject(new Error('Se perdió la conexión al subir el archivo. Inténtalo de nuevo.')); };
    xhr.ontimeout = () => { upload = null; reject(new Error('La subida tardó demasiado. Revisa tu conexión.')); };
    xhr.onabort = () => { upload = null; reject(new DOMException('Cancelado', 'AbortError')); };
    xhr.send(source);
  });
}
function updateWordCount() {
  const count = ui.transcript.value.trim().split(/\s+/).filter(Boolean).length;
  ui['word-count'].textContent = `${count} ${count === 1 ? 'palabra' : 'palabras'}`;
  controls();
}
ui.transcript.addEventListener('input', updateWordCount);
ui.transcribe.addEventListener('click', async () => {
  if (!file || busy || !connected) return;
  const currentRun = ++runId;
  busy = true;
  jobId = null;
  error(); resetResult();
  ui.cancel.disabled = false;
  ui.progress.removeAttribute('value');
  ui['progress-text'].textContent = 'Subiendo archivo…';
  ui['empty-title'].textContent = 'El sapo está escuchando.';
  ui['empty-description'].textContent = 'Estamos convirtiendo tu archivo en texto. El tiempo depende de su duración.';
  try {
    const created = await sendFile(file, ui.language.value);
    if (currentRun !== runId) {
      await fetch(`/api/transcriptions/${created.id}`, { method: 'DELETE' });
      return;
    }
    jobId = created.id;
    let failures = 0;
    while (currentRun === runId) {
      let response;
      try {
        response = await fetch(`/api/transcriptions/${jobId}`, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(response.status === 404 ? 'La transcripción ya no está disponible. Vuelve a subir tu archivo.' : 'No pudimos consultar la transcripción.');
        failures = 0;
      } catch (failure) {
        if (++failures >= 5 || response?.status === 404) throw failure;
        ui['progress-text'].textContent = 'Reconectando con el servidor…';
        await wait(2000);
        continue;
      }
      const job = await response.json();
      if (currentRun !== runId) break;
      ui['progress-text'].textContent = job.message;
      if (job.progress > 0) ui.progress.value = Math.round(job.progress * 100);
      else ui.progress.removeAttribute('value');
      if (job.state === 'failed') throw new Error(job.message);
      if (job.state === 'cancelled') { resetResult(); toast('Transcripción cancelada.'); break; }
      if (job.state === 'completed') {
        ui.transcript.value = job.text;
        resultFilename = file.name.replace(/\.[^.]+$/, '');
        ui['empty-result'].hidden = true;
        ui['result-content'].hidden = false;
        ui['result-badge'].hidden = false;
        ui['result-badge'].textContent = job.text ? 'LISTO' : 'SIN VOZ';
        ui['result-info'].textContent = `${Math.floor(job.duration / 60)}:${String(Math.floor(job.duration % 60)).padStart(2, '0')} min · ${(job.language || '').toUpperCase()}`;
        ui['edit-hint'].textContent = 'Puedes editar el texto antes de guardarlo.';
        updateWordCount();
        toast(job.message);
        ui.transcript.focus({ preventScroll: true });
        break;
      }
      await wait(1000);
    }
  } catch (failure) {
    if (currentRun === runId && failure.name !== 'AbortError') {
      error(failure.message || 'No pudimos completar la transcripción.');
      resetResult();
    }
  } finally {
    if (currentRun === runId) { busy = false; jobId = null; controls(); }
  }
});
ui.cancel.addEventListener('click', async () => {
  ui.cancel.disabled = true;
  try {
    if (jobId) {
      const response = await fetch(`/api/transcriptions/${jobId}`, { method: 'DELETE', signal: AbortSignal.timeout(10000) });
      if (!response.ok && response.status !== 404) throw new Error();
    } else if (upload) upload.abort();
    ++runId;
    jobId = null;
    busy = false;
    resetResult();
    toast('Transcripción cancelada.');
  } catch {
    error('No pudimos confirmar la cancelación. Revisa tu conexión e inténtalo de nuevo.');
    ui.cancel.disabled = false;
  }
});
ui.copy.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(ui.transcript.value); toast('Texto copiado.'); }
  catch { ui.transcript.focus(); ui.transcript.select(); toast('Seleccionamos el texto. Usa Ctrl+C o ⌘C para copiarlo.'); }
});
ui.download.addEventListener('click', () => {
  const blob = new Blob([ui.transcript.value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = resultFilename + '-resapo.txt';
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Descarga preparada.');
});
window.addEventListener('beforeunload', event => {
  if (busy) { event.preventDefault(); event.returnValue = ''; }
});
health();
setInterval(() => { if (!busy) health(); }, 15000);
