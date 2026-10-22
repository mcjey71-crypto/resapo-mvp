# Re-SAPO

**Dale un repaso. Dale forma a tus ideas.** Un estudio con transcripción, herramientas PDF, vectorización de imágenes y conversión de archivos. La portada presenta el producto y permite ingresar sin correo ni contraseña. Este acceso es navegación, no autenticación.

El propietario confirmó que la transcripción y los PDF funcionan en su despliegue de Streamlit. Consulta [HOSTING.md](HOSTING.md) para actualizarlo y entender sus costos y límites. Para usar las herramientas locales por separado están `docs/index.html` (PDF) y `docs/vectorizar.html` (imagen a SVG), con ejemplos incluidos.

MVP web para convertir audio y video en texto con Whisper. Conserva la identidad verde y crema y el logo SVG del avance original. La transcripción se ejecuta en el servidor, con `faster-whisper` sobre CPU; no necesita una clave de OpenAI ni Google Colab.

## Ejecutar

Requisitos: Node.js 22.13 o posterior (recomendado: 24), Python 3.12, [uv](https://docs.astral.sh/uv/) y FFmpeg en el PATH. En este entorno ya están instalados.

Desde la carpeta del proyecto (`/workspace/resapo-mvp` en el entorno de desarrollo):

```bash
bash scripts/setup.sh
bash scripts/start.sh
```

El servidor escucha en el puerto 8000 de la máquina. Abre la aplicación mediante el acceso a ese servidor que proporcione tu entorno. Abrir `web/index.html` directamente no inicia el motor de transcripción.

Rutas: `/` portada, `/transcribir` audio/video, `/pdf` documentos, `/vectorizar` imágenes, `/convertir` conversión de archivos y `/herramientas` herramientas creativas. Streamlit presenta cinco áreas de herramientas después de **Ingresar al estudio**.

La instalación usa versiones fijas y hashes en `requirements-dev.txt`. Descarga Whisper `base` multilingüe una vez (~145 MB), verifica su SHA-256 y ejecuta las pruebas de servicio. La caché de pesos queda en `.cache/models/`. Los procesos deben iniciarse de nuevo en cada sesión.

`base` permite desarrollar en CPU con consumo moderado. El notebook original usaba `medium`, que puede mejorar la precisión a cambio de más memoria y tiempo. Para cambiarlo, configura **el mismo valor** durante la instalación y el arranque:

```bash
RESAPO_MODEL=medium .venv/bin/python scripts/download_model.py
RESAPO_MODEL=medium bash scripts/start.sh
```

Para el modelo predeterminado se fija la revisión `ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66`. `RESAPO_MODEL_REVISION` permite fijar otra revisión. `RESAPO_MODEL_CACHE` cambia la carpeta de caché. Nunca desactives la verificación TLS ni la de integridad para descargar pesos.

En una red restringida, permite `huggingface.co`, `cas-server.xethub.hf.co`, `cas-bridge.xethub.hf.co`, `transfer.xethub.hf.co` y `us.aws.cdn.hf.co`, además de los registros de paquetes. No se requieren credenciales para el modelo público. No se descargan modelos durante una petición de transcripción: deben estar preparados antes de arrancar el flujo.

## Flujo incluido

1. Seleccionar o arrastrar un audio/video: MP3, WAV, M4A, OGG, FLAC, AAC, MP4, MOV, MKV, WebM u Opus.
2. Elegir el idioma original o la detección automática. Español es el valor inicial.
3. Transcribir y consultar el estado real del trabajo. El avance de subida se mide por bytes; el de reconocimiento, por la posición de los segmentos. La preparación y las esperas usan un indicador sin porcentaje inventado.
4. Revisar y editar el texto, copiarlo o descargarlo como `.txt`.

No hay traducción, resumen, identificación de hablantes, grabación de micrófono ni cobros en esta versión. La sección **Herramientas PDF**, disponible en `/pdf`, permite unir, dividir, extraer, eliminar, ordenar/girar páginas y convertir imágenes a PDF. **Vectorizar imágenes**, en `/vectorizar`, transforma PNG/JPG/WebP en SVG con trazados reales. Estas dos herramientas se procesan en el navegador. **Convertir archivos**, en `/convertir`, transforma audio, video, imágenes y documentos compatibles temporalmente en el servidor. Consulta [CONVERSIONS.md](CONVERSIONS.md) para formatos, límites y conservación del contenido. El reconocimiento puede omitir o confundir palabras, especialmente con ruido, música o varias voces simultáneas. Revisa el resultado.

## Límites y datos de la transcripción

- 200 MB y 60 minutos por archivo. Se pueden ajustar con `RESAPO_MAX_MB` y `RESAPO_MAX_MINUTES` al iniciar.
- Un trabajador de transcripción y hasta tres solicitudes admitidas entre subida, espera y procesamiento. El resto recibe HTTP 429.
- La duración se comprueba sobre el audio decodificado; FFmpeg se detiene al superar el máximo. Los videos deben contener una pista de audio.
- Solo se aceptan contenedores multimedia concretos. FFmpeg no puede utilizar protocolos de red ni listas de reproducción de entrada.
- El archivo y el WAV intermedio se eliminan al terminar o fallar. La cancelación es cooperativa: espera a que concluya el paso de decodificación/inferencia en curso antes de liberar sus recursos.
- El texto queda en memoria del servidor durante una hora desde la finalización, con limpieza periódica cada minuto. No hay base de datos, historial ni guardado en `localStorage`. Al cerrar o recargar la página se pierde la copia del navegador. Al reiniciar el servidor se pierden los trabajos y resultados.
- Un cierre abrupto de la máquina puede dejar carpetas temporales `resapo-*` en el directorio temporal del sistema. No hay garantía de borrado ante un corte forzado.
- Los IDs de trabajo son aleatorios. Las respuestas de la API llevan `Cache-Control: no-store`. No se incluye publicidad, analítica ni recursos externos en la interfaz.

## Desarrollo del estudio y herramientas locales

El código editable está en `src/`. El HTML de la herramienta se genera desde `src/pdf-template.html`; sus estilos están en `web/pdf-styles.css`.

```bash
npm ci --ignore-scripts
npm run build
npm test
```

El build genera la portada `web/landing.html`, `web/converter.html`, `web/pdf.html`, `web/pdf-app.js`, `web/vector.html`, `web/vector-app.js` y los HTML autónomos `docs/index.html` y `docs/vectorizar.html`. Estos archivos compilados se incluyen en Git para que el despliegue de Python y los sitios estáticos no requieran Node en producción. Cada modificación a fuentes, estilos o plantillas debe acompañarse de un nuevo build.

La portada comparte los fragmentos `web/intro-*.html` y `web/intro.css`. La presentación nativa de Streamlit está en `cloud/presentation.py` y `cloud/design.css`. Streamlit filtra las etiquetas SVG en `st.html`, por lo que allí se conservan como imágenes SVG en URI de datos; no se rasteriza el logo ni el arte.

Límites PDF: 50 MB por archivo, 100 MB por operación, 20 archivos y 500 páginas. JPG y PNG hasta 25 megapíxeles. Los PDF con contraseña se rechazan. Los formularios se aplanan; las firmas digitales no se conservan como válidas. No incluye OCR ni edición del texto existente. Consulta [PDF_RESEARCH.md](PDF_RESEARCH.md).

Límites de vectorización: 15 MB y 25 MP de entrada, trazado seleccionable a 600/1200/2400 px por lado, hasta 32 colores y tiempo máximo de 90 segundos. Ajustes para logos planos, letras y sellos; paleta de marca de hasta 16 HEX exactos; tinta, curvas, esquinas, manchas y fondo por borde. Comparación con zoom y visor SVG local de hasta 12 MB, con fondos claro/oscuro/transparente. Adecuado para dibujos y logos; no reconstruye detalles de una foto. Investigación y decisiones en [VECTOR_RESEARCH.md](VECTOR_RESEARCH.md).

## Comprobaciones

```bash
.venv/bin/python -m pytest -q
.venv/bin/python tests/browser_check.py
npm test
PDF_TEST_URL=http://127.0.0.1:8000/pdf .venv/bin/python tests/pdf_browser_check.py
.venv/bin/python tests/vector_browser_check.py
.venv/bin/python tests/studio_browser_check.py
.venv/bin/python tests/converter_browser_check.py
.venv/bin/python scripts/smoke_test.py ruta/a/una-clase.mp4 --language es
```

Las pruebas de API usan FFmpeg real y un reconocedor controlado para verificar los flujos, límites, errores y limpieza. **No miden precisión de Whisper.** La prueba de navegador usa Chromium en `/usr/bin/chromium`, requiere el servidor encendido y simula únicamente las respuestas del reconocedor y su disponibilidad. Guarda capturas en `test-results/`.

`tests/pdf_browser_check.py` usa el motor PDF real y verifica los resultados con `pypdf`, incluyendo funcionamiento sin conexión y cancelación. `tests/streamlit_browser_check.py` comprueba transcripción y PDF reales con la entrada Streamlit encendida.

`tests/vector_browser_check.py` prueba el worker real, SVG descargable, transparencias renderizadas, paletas, archivos inválidos, cancelación, móvil y HTML sin conexión. `tests/studio_browser_check.py` comprueba la portada, el logo vectorial, ambos botones de ingreso y la vectorización dentro de Streamlit. No simulan la conversión.

`smoke_test.py` utiliza el servidor y Whisper reales. Puede comprobar una frase mediante `--expect`. Las pruebas reales realizadas durante la preparación se documentan en `VALIDATION.md`.

## Archivos

- `web/index.html`, `web/styles.css`, `web/app.js`: interfaz accesible, adaptable a móvil y sin compilación de JavaScript.
- `web/logo.svg`: trazos vectoriales originales, con fondo transparente. El mismo SVG está integrado en el HTML para el encabezado y la ilustración.
- `server.py`: carga temporal, cola, FFmpeg y motor Whisper.
- `cloud/streamlit_app.py`: entrada para probar la app completa en Streamlit Community Cloud.
- `src/pdf-*`: motor, interfaz y plantilla de las herramientas PDF.
- `src/vector-*`: motor, worker, interfaz y plantilla de vectorización.
- `conversion.py`, `scripts/convert_file.py`, `cloud/converter.py`: convertidor del servidor e interfaz Streamlit.
- `CONVERSIONS.md`: matriz de formatos, límites y detalles de conversión.
- `assets/fonts/`: fuente DejaVu para PDF y su licencia.
- `docs/index.html`: aplicación PDF autónoma, sin backend.
- `docs/vectorizar.html`: vectorizador autónomo, sin backend.
- `HOSTING.md`: instrucciones de publicación y comparación de opciones gratuitas.
- `scripts/`: instalación, arranque, descarga verificada y prueba real.
- `tests/`: verificaciones de API e interfaz.
- `REVIEW.md`: diagnóstico de los archivos que compartiste y decisiones del MVP.

## Antes de vender acceso

Esta versión prepara y valida la transcripción. Para abrir un servicio de pago faltan cuentas de usuario, autorización por trabajo, cuotas y minutos consumidos verificados en servidor, pagos confirmados por el proveedor, HTTPS y límites en el proxy de entrada. Evita ejecutar varias instancias de Uvicorn con esta cola en memoria; para escalar se necesita una cola y almacenamiento compartidos.

El costo de alojar Whisper depende del equipo y los minutos procesados. Conviene medirlo antes de prometer un pase ilimitado de S/ 1. Los códigos visibles en JavaScript y las marcas de `localStorage` del prototipo no sirven para proteger ingresos. El notebook es una referencia de uso de Whisper; una sesión de Colab no sustituye un servidor disponible para clientes.

## Herramientas creativas y guía interactiva

La quinta pestaña añade 17 herramientas locales para imágenes, PDF, colores SVG y texto. Cada una explica qué hace y qué problema resuelve, con una guía de tres pasos y un ejemplo. No usan APIs facturadas ni suben los archivos al servidor. Consulta [LOCAL_TOOLS.md](LOCAL_TOOLS.md) para funciones y límites. Versión autónoma: `docs/herramientas.html`; fuentes: `src/lab-*`; compilación: `scripts/build-lab.mjs`.
