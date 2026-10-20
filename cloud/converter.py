"""Native Streamlit interface for bounded server-side file conversion."""
import hashlib
import streamlit as st
from conversion import ConversionService, ConversionError, SOURCES, targets_for


@st.cache_resource
def converter():
    return ConversionService()


def render_converter():
    st.html('<div class="transcription-heading"><span class="studio-kicker">ESTUDIO DE FORMATOS / 04</span>'
            '<h2>El mismo contenido.<br><em>Nuevas posibilidades.</em></h2>'
            '<p>Convierte audio, video, imágenes y texto a un formato compatible. Elige, convierte y descarga.</p></div>')
    categories = {'Audio': 'audio', 'Video': 'video', 'Imágenes': 'image', 'Documentos de texto': 'document'}
    choice = st.selectbox('¿Qué tipo de archivo quieres convertir?', list(categories), key='conversion_category')
    kind = categories[choice]
    left, right = st.columns([2.1, 1], gap='large')
    with right:
        st.info('Estos archivos se procesan en el servidor. Los temporales se eliminan al terminar y el resultado queda en tu sesión hasta cambiar de conversión o cerrarla.')
        st.markdown('**Formatos de entrada**\n\n' + ', '.join(ext.upper() for ext in SOURCES[kind]))
        st.caption({
            'audio': 'Hasta 50 MB y 15 minutos. Salida MP3/M4A a 192 kbps; Opus a 128 kbps. Se usa la primera pista de audio, en estéreo.',
            'video': 'Hasta 50 MB. Para extraer audio: 15 minutos. Para convertir video: 5 minutos, entrada hasta 4K y salida hasta 720p/30 fps. Se omiten subtítulos y pistas adicionales.',
            'image': 'Hasta 15 MB y 16 megapíxeles. Solo imágenes estáticas de una página; no se admiten animaciones. JPG, BMP y PDF usan fondo blanco donde había transparencia.',
            'document': 'Hasta 5 MB y 100 000 caracteres; PDF de hasta 100 páginas y sin contraseña. TXT/MD en UTF-8 o UTF-16 con BOM.',
        }[kind])
        st.caption('Máximo 50 MB de salida. Una conversión a la vez en el servidor compartido. Si tarda más de 3 minutos, se detiene para liberar recursos.')
    with left:
        upload = st.file_uploader('Selecciona el archivo que quieres convertir',
                                  type=SOURCES[kind], key=f'conversion_upload_{kind}',
                                  max_upload_size={'audio': 50, 'video': 50, 'image': 15, 'document': 5}[kind])
        if kind == 'document':
            st.warning('Se convierte el texto, no el diseño original. DOCX y PDF pueden perder imágenes, estilos y distribución; no incluye OCR. Markdown se trata como texto.')
        target = st.selectbox('Formato de salida', targets_for(upload.name) if upload else [],
                              format_func=str.upper, disabled=upload is None, key=f'conversion_target_{kind}')
        signature = (kind, upload.name, upload.size, hashlib.sha256(upload.getbuffer()).hexdigest(), target) if upload else None
        if st.session_state.get('conversion_signature') != signature:
            st.session_state.conversion_signature = signature
            st.session_state.pop('conversion_result', None)
        if st.button('Convertir archivo', type='primary', disabled=upload is None or target is None, key='convert_file'):
            st.session_state.pop('conversion_result', None)
            try:
                with st.spinner('Convirtiendo tu archivo… Mantén esta pestaña abierta.'):
                    st.session_state.conversion_result = converter().convert(upload.name, upload.getbuffer(), target)
            except ConversionError as error:
                st.error(str(error))
        result = st.session_state.get('conversion_result')
        if result:
            st.success(f'Archivo listo: {result.name} · {len(result.data) / 1024 / 1024:.2f} MB')
            st.download_button('Descargar archivo convertido', result.data, file_name=result.name, mime=result.mime,
                               key='converted_download', type='primary')
            st.caption(result.note)
        else:
            st.caption('Elige un archivo para ver sus formatos de salida. Creamos una copia; el original no cambia.')
