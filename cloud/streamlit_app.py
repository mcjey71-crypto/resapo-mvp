"""Free-hosting entry point. Shares the real Whisper service with the web app."""
from pathlib import Path
import os
import shutil
import subprocess
import sys
import tempfile
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault('RESAPO_MAX_MB', '50')
os.environ.setdefault('RESAPO_MAX_MINUTES', '15')

import streamlit as st
import streamlit.components.v1 as components
from server import EXTENSIONS, MAX_BYTES, MAX_SECONDS, Job, TranscriptionService, TERMINAL, model_location

st.set_page_config(page_title='Re-SAPO · Transcripción y PDF', page_icon=str(ROOT / 'web/logo.svg'), layout='wide')


@st.cache_resource(show_spinner='Preparando el motor de voz. La primera vez puede tardar unos minutos…')
def engine():
    if not shutil.which('ffmpeg'):
        raise RuntimeError('FFmpeg no está instalado. Revisa packages.txt en el despliegue.')
    try:
        location = model_location()
        if not (location / 'model.bin').is_file():
            raise FileNotFoundError()
    except Exception:
        download = subprocess.run([sys.executable, str(ROOT / 'scripts/download_model.py')],
                                  cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=240)
        if download.returncode:
            raise RuntimeError('No se pudo descargar el modelo. Revisa la conexión del alojamiento y vuelve a intentarlo.')
    service = TranscriptionService()
    service.load_model()
    return service


@st.cache_data
def pdf_page(asset_version):
    return (ROOT / 'docs/index.html').read_text()


def submit(service, upload, language):
    if Path(upload.name).suffix.lower() not in EXTENSIONS:
        raise ValueError('Elige un archivo de audio o video compatible.')
    if not upload.size or upload.size > MAX_BYTES:
        raise ValueError(f'El archivo debe pesar entre 1 byte y {MAX_BYTES // 1024 // 1024} MB.')
    service.prune()
    if not service.slots.acquire(blocking=False):
        raise ValueError('Hay varias transcripciones en curso. Inténtalo en unos minutos.')
    folder = None
    submitted = False
    try:
        folder = Path(tempfile.mkdtemp(prefix='resapo-'))
        source = folder / 'source'
        source.write_bytes(upload.getbuffer())
        job = Job(uuid4().hex, folder, language)
        with service.lock:
            service.jobs[job.id] = job
        service.executor.submit(service.run, job, source)
        submitted = True
        return job.id
    finally:
        if not submitted:
            if folder:
                shutil.rmtree(folder, ignore_errors=True)
            service.slots.release()


for name, default in [('job_id', None), ('result', None), ('transcript', ''), ('output_name', 'transcripcion.txt'), ('notice', None)]:
    if name not in st.session_state:
        st.session_state[name] = default

brand, title = st.columns([1, 12])
with brand:
    st.image(str(ROOT / 'web/logo.svg'), width=65)
with title:
    st.title('Re-SAPO')
    st.caption('Tu voz por escrito. Tus documentos en orden.')

transcription_tab, pdf_tab = st.tabs(['Transcribir audio o video', 'Herramientas PDF'])
with transcription_tab:
    st.subheader('Tú escucha. El sapo toma nota.')
    st.write('Convierte clases, entrevistas y videos en texto que puedes revisar y descargar.')
    active = st.session_state.job_id is not None
    upload = st.file_uploader('Elige tu audio o video', type=sorted(ext.lstrip('.') for ext in EXTENSIONS),
                             disabled=active, help=f'Hasta {MAX_BYTES // 1024 // 1024} MB y {MAX_SECONDS // 60} minutos por archivo.')
    languages = {'Español': 'es', 'Detectar automáticamente': 'auto', 'Inglés': 'en', 'Portugués': 'pt', 'Francés': 'fr', 'Italiano': 'it', 'Alemán': 'de'}
    selected = st.selectbox('Idioma del audio', list(languages), disabled=active)
    if st.button('Transcribir archivo', type='primary', disabled=active or upload is None):
        try:
            service = engine()
            st.session_state.job_id = submit(service, upload, languages[selected])
            st.session_state.result = None
            st.session_state.transcript = ''
            st.session_state.notice = None
            st.session_state.output_name = Path(upload.name).stem + '-resapo.txt'
            st.rerun()
        except Exception as error:
            st.error(str(error))
    st.caption(f'En esta versión: {MAX_BYTES // 1024 // 1024} MB · {MAX_SECONDS // 60} minutos por archivo. El audio se procesa en el servidor y se elimina al terminar. Los PDF se procesan en tu navegador.')

    @st.fragment(run_every=1 if active else None)
    def progress():
        if not st.session_state.job_id:
            return
        service = engine()
        try:
            job = service.get(st.session_state.job_id)
        except Exception:
            st.session_state.job_id = None
            st.session_state.notice = ('error', 'El trabajo ya no está disponible. Vuelve a subir el archivo.')
            st.rerun()
        status = service.snapshot(job)
        if status['state'] in TERMINAL:
            st.session_state.job_id = None
            if status['state'] == 'completed':
                st.session_state.result = status
                st.session_state.transcript = status['text']
            else:
                st.session_state.notice = ('error' if status['state'] == 'failed' else 'info', status['message'])
            with service.lock:
                service.jobs.pop(job.id, None)
            st.rerun()
        st.info(status['message'])
        if status['progress']:
            st.progress(status['progress'])
        if st.button('Cancelar transcripción', disabled=job.cancel.is_set()):
            job.cancel.set()
            service.change(job, message='Cancelando…')
            st.rerun(scope='fragment')
    progress()
    if st.session_state.notice:
        kind, text = st.session_state.notice
        (st.error if kind == 'error' else st.info)(text)
    if st.session_state.result:
        result = st.session_state.result
        st.success(result['message'])
        st.text_area('Tu transcripción — puedes editarla', key='transcript', height=280)
        st.download_button('Descargar texto (.txt)', st.session_state.transcript,
                           file_name=st.session_state.output_name, mime='text/plain; charset=utf-8',
                           disabled=not st.session_state.transcript.strip())
        st.caption('Descarga el texto antes de cerrar la sesión. Revisa nombres y datos importantes: la transcripción automática puede cometer errores.')
with pdf_tab:
    st.caption('Unir, dividir, extraer, eliminar, ordenar, girar e imágenes a PDF. Tus documentos no se suben al servidor.')
    components.html(pdf_page((ROOT / 'docs/index.html').stat().st_mtime_ns), height=1300, scrolling=True)
