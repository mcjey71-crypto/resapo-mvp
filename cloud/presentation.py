"""Presentation only. Entering the studio is navigation, not authentication."""
from pathlib import Path
import base64
import re
import streamlit as st

ROOT = Path(__file__).resolve().parents[1]


def asset(name):
    content = (ROOT / 'web' / name).read_text()
    # Streamlit's HTML sanitizer removes inline SVG tags. A data-URI image keeps
    # the original vector paths intact and sharp at any zoom (no rasterization).
    def vector_image(match):
        svg = match.group()
        if 'xmlns=' not in svg:
            svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"', 1)
        return '<img alt="" src="data:image/svg+xml;base64,' + base64.b64encode(svg.encode()).decode() + '">'
    return re.sub(r'<svg\b.*?</svg>', vector_image, content, flags=re.S)


def apply_design():
    st.html('<style>' + asset('intro.css') + (ROOT / 'cloud/design.css').read_text() + '</style>')


def header(entered):
    logo, navigation = st.columns([4, 1], vertical_alignment='center')
    with logo:
        st.html('<div class="studio-brand">' + asset('logo.svg') +
                '<div><strong>Re-SAPO</strong><small>EL ESTUDIO DE TUS IDEAS</small></div></div>')
    with navigation:
        if entered:
            if st.button('← Inicio', width='stretch'):
                st.session_state.entered = False
                st.rerun()
        else:
            st.html('<div class="studio-nav-note">Estudio abierto · Sin registro</div>')
    st.html('<div class="studio-rule"></div>')


def footer():
    st.html('<footer class="studio-footer"><div><strong>Re-SAPO</strong><br>Dale un repaso. Dale forma a tus ideas.</div>'
            '<span>Edición gratuita · Sin registro<br>Hecho para dar el siguiente salto.</span></footer>')


def enter_button(key):
    if st.button('Ingresar al estudio →', type='primary', key=key):
        st.session_state.entered = True
        st.rerun()


def landing():
    copy, art = st.columns([1.1, 1], gap='large', vertical_alignment='center')
    with copy:
        st.html(asset('intro-copy.html'))
        enter_button('enter_top')
        st.caption('Empieza gratis. Sin correo, contraseña ni tarjeta.')
    with art:
        st.html(asset('intro-art.html'))
    st.html(asset('intro-details.html'))
    enter_button('enter_bottom')
    footer()


def studio_intro():
    st.html('<div class="studio-intro-head"><div><span class="studio-kicker">BIENVENIDO A TU ESPACIO</span>'
            '<h1>¿Qué idea movemos hoy?</h1></div><p>Elige una herramienta.<br>Nosotros te ayudamos con el siguiente paso.</p></div>')


def transcription_note():
    st.html('''<aside class="studio-note"><span class="studio-kicker">BUEN OÍDO. BUENOS APUNTES.</span>
    <h3>Tú escucha.<br>El sapo toma nota.</h3>
    <p>De una clase grabada a tus próximos apuntes. De una conversación a las ideas que quieres conservar.</p>
    <ul><li><b>01 / ELIGE</b>Sube un audio o video y selecciona el idioma.</li>
    <li><b>02 / REVISA</b>Lee el resultado y corrige lo que necesites.</li>
    <li><b>03 / GUARDA</b>Descarga el texto antes de cerrar la sesión.</li></ul>
    <p class="note-end">Lo importante merece quedarse.</p></aside>''')
