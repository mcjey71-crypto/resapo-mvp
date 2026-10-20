# Convertir archivos

Conversión real del contenido, disponible en Streamlit y en `/convertir` con FastAPI. No se limita a cambiar una extensión.

| Categoría | Entradas | Salidas |
| --- | --- | --- |
| Audio | MP3, WAV, M4A, AAC, FLAC, OGG, Opus, WMA, AIFF/AIF, AMR, AC3 | MP3, M4A, WAV, FLAC, OGG, Opus |
| Video | MP4, MOV, MKV, WebM, AVI, M4V, MPEG/MPG, WMV, 3GP, TS/MTS | MP4, WebM, MKV; o extracción a cualquiera de las salidas de audio |
| Imagen estática | PNG, JPG/JPEG, WebP, BMP, TIFF/TIF, GIF | PNG, JPG, WebP, BMP, TIFF, PDF |
| Documento de texto | TXT, MD, DOCX, PDF con texto seleccionable | PDF, TXT, DOCX |

La interfaz ofrece solo combinaciones compatibles y omite el mismo formato de entrada. JPEG/JPG y TIFF/TIF son equivalentes. Un contenedor admitido puede contener un codec ilegible o datos dañados; se informa el error sin entregar un archivo falso.

## Contenido y calidad

- **Audio:** primera pista, en estéreo. MP3/M4A a 192 kbps y 44,1 kHz; WAV/FLAC a 44,1 kHz; Opus a 128 kbps y 48 kHz; OGG/Vorbis con calidad 5 y 44,1 kHz. Pasar de un formato con pérdidas a WAV/FLAC no recupera calidad.
- **Video:** primera pista de video y primera de audio si existe; hasta 1280 × 720 y 30 fps. Se respetan proporciones de visualización y rotación reconocida por FFmpeg, normalizando píxeles no cuadrados. MP4/MKV usan H.264/AAC; WebM usa VP9/Opus. Se omiten subtítulos, pistas adicionales, capítulos y metadatos.
- **Imágenes:** se conservan dimensiones y se aplica orientación EXIF. PNG/WebP/TIFF mantienen transparencia compatible; JPG/BMP/PDF usan fondo blanco. Se rechazan animaciones y TIFF multipágina, sin perder fotogramas silenciosamente. No se promete conservar perfiles de color ni metadatos.
- **Documentos:** se extrae texto y se crea un documento nuevo; no se conserva maquetación, imágenes, estilos, enlaces, firmas ni formularios. DOCX incluye párrafos y tablas del cuerpo, no necesariamente encabezados, pies o cuadros de texto. PDF escaneado requiere OCR, no incluido. Markdown se trata como texto. TXT/MD admiten UTF-8 y UTF-16 con BOM. Los caracteres que la fuente PDF no puede representar producen un error, sin omitirlos silenciosamente.

## Límites y privacidad

- Audio/video: 50 MB de entrada. Audio: hasta 15 minutos. Video: hasta 5 minutos y 8,3 megapíxeles por fotograma (4K UHD).
- Imagen: 15 MB, 16 megapíxeles, una sola página estática.
- Documento: 5 MB, 100 000 caracteres; PDF hasta 100 páginas y sin contraseña; DOCX hasta 20 MB descomprimido y 1000 entradas ZIP.
- Salida menor de 50 MB. Un WAV grande puede superar este límite; en ese caso se recomienda una salida comprimida.
- Una conversión simultánea por proceso de aplicación. Cada trabajador tiene un límite de 180 segundos de reloj, 150 de CPU, 640 MiB de espacio de direcciones y tamaño de archivo. Se controlan hilos y arenas de memoria.
- Al vencer el plazo se termina el grupo de procesos, incluido FFmpeg, y se limpian los archivos. Un cierre forzado de la máquina puede dejar temporales.

**El convertidor sube los archivos al servidor**, a diferencia de Herramientas PDF y Vectorizar imágenes. Los archivos de trabajo y reportes temporales se eliminan al terminar o fallar. Streamlit mantiene el archivo subido en su widget y el resultado en la sesión para permitir la descarga; cambiar de conversión invalida el resultado anterior. No hay base de datos ni historial permanente implementado.

No usa una API facturada por conversión. Sí consume los recursos del alojamiento gratuito.

## Implementación

- `conversion.py`: formatos, límites, exclusión mutua, ejecución y limpieza.
- `scripts/convert_file.py`: trabajador con FFmpeg/ffprobe, Pillow, python-docx, pypdf y fpdf2.
- `cloud/converter.py`: interfaz Streamlit.
- `GET /api/conversions/formats`: formatos disponibles.
- `POST /api/conversions?filename=archivo.mp4&target=mp3`: cuerpo binario directo, respuesta descargable con `Cache-Control: no-store`.
- `src/converter-template.html`, `web/converter.js` y `web/converter.css`: interfaz FastAPI.
- `assets/fonts/DejaVuSans.ttf`: fuente para PDF, con licencia en `assets/fonts/LICENSE.txt`.

Reproducir con `scripts/setup.sh` y `scripts/setup-streamlit.sh`. No requiere LibreOffice. El convertidor requiere servidor; los HTML autónomos en `docs/` siguen siendo solo PDF y vectorización.

Pruebas: `tests/test_conversion.py` verifica codecs, duración, proporciones, transparencia, texto, paginación, errores y limpieza. `tests/converter_browser_check.py` verifica conversiones y descargas reales en Streamlit y FastAPI.
