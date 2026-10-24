# Validación del MVP

Comprobaciones realizadas el 18 de octubre de 2026 en el entorno de desarrollo. Python 3.12, FFmpeg, Whisper `base` multilingüe, CPU/int8 y dependencias fijadas en los archivos requirements.

| Comprobación | Resultado |
| --- | --- |
| `bash scripts/setup.sh` | Instalación repetible, modelo descargado, SHA-256 correcto y 13 pruebas aprobadas. |
| `python -m pytest -q` | 13 pruebas aprobadas. Reconocedor controlado; FFmpeg real. Se verificaron errores, límites de bytes y duración, cola, cancelación, expiración, limpieza y respuestas del servidor. |
| `node --check web/app.js` | Sintaxis válida. |
| `tests/browser_check.py` en Chromium | Selección, arrastre, validación, estados, edición, copia, TXT, errores y cancelación aprobados. Reconocimiento simulado expresamente en esta prueba de interfaz. |
| Diseño adaptable | Sin desbordamiento horizontal a 1440 px y 390 px. Sin errores de JavaScript en la prueba de navegador. |
| Audio FLAC real, 11 segundos | Whisper devolvió la frase esperada: “ask not what your country can do for you”. |
| Video MP4 real, 11 segundos | FFmpeg extrajo el audio y Whisper devolvió la misma frase esperada. |
| Navegador con MP4 y motor reales | Carga, reconocimiento, aparición del texto y descarga TXT comprobados de extremo a extremo. |
| WAV silencioso, motor real | Resultado vacío y mensaje “No se detectó voz en el archivo.” |
| MP4 sin pista de audio | Rechazado con un mensaje comprensible; sin texto inventado. |
| Reinicio mediante `bash scripts/start.sh` | API disponible y prueba real de video repetida correctamente después del reinicio. |

La muestra de voz es el archivo público `tests/jfk.flac` del repositorio de OpenAI Whisper, descargado en `.cache/fixtures/`. El video de prueba se generó a partir de esa misma voz con un fondo de color. Ambos contienen inglés. Estos resultados demuestran la integración, no la precisión para clases largas, acentos en español o grabaciones ruidosas: esa evaluación requiere muestras representativas del producto.

Se corrigió una incompatibilidad descubierta en la prueba real: `faster-whisper` 1.2.1 usa `metadata_errors`, eliminado en PyAV 17+. El proyecto fija `av<17` y el lockfile instala 16.1.0.

Los pesos base corresponden a la revisión `ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66`. SHA-256 del archivo `model.bin`, contrastado con los metadatos Git LFS del proveedor: `d01c3014881c9c6f3133c182f3d2887eb6ca1c789a7538c5c007196857a0a6a9`.

Las capturas están en `test-results/desktop.png`, `mobile.png`, `mobile-result.png` y `real-transcription.png`. Esta carpeta se excluye de Git.

La preparación actual está comprobada y la configuración reutilizable se guardó en borrador. No se ha publicado un despliegue web ni se ha comprobado una restauración en otra tarea. El repositorio remoto estaba vacío al iniciar el trabajo. Publicar el código en GitHub es un paso independiente del despliegue de la aplicación web.

## Ampliación PDF y Streamlit — 19 de octubre de 2026 (Lima)

- **14 pruebas de API aprobadas**, incluyendo la ruta PDF y su política de seguridad para workers.
- **13 pruebas de motor PDF aprobadas**: rangos, orden, unión, extracción, eliminación, rotaciones relativas, ZIP, imágenes, documentos cifrados/dañados y conservación visual de formularios aplanados.
- **Navegador con motor PDF real**: las seis herramientas produjeron archivos descargables. Se leyeron con `pypdf`, independientemente de `pdf-lib`, para comprobar texto, número/orden de páginas, rotación, tamaños e imágenes incrustadas. Se verificaron también errores, reinicio tras cancelación y ausencia de peticiones POST/PUT.
- **Sin conexión**: las operaciones PDF continuaron funcionando con la red desactivada después de cargar la app. El HTML autónomo se probó en un documento aislado sin backend; las políticas del navegador administrado bloquearon `file://`, así que no se afirma haber probado ese esquema aquí.
- **Móvil**: sin desbordamiento horizontal a 390 px; capturas en `test-results/pdf-browser/`.
- **Streamlit real**: se subió el MP4 de voz en inglés, Whisper produjo la frase esperada, se descargó el TXT y se creó/descargó un PDF de seis páginas desde el componente embebido. No se simuló el motor en esta prueba.
- **Instalación repetida**: `scripts/setup.sh` reproduce npm/compilación/pruebas, dependencias Python y verificación del modelo. `scripts/setup-streamlit.sh` instala la entrada de Cloud por separado.

La fuente de voz sigue siendo la muestra pública JFK; no se evaluó todavía precisión con clases en español, horas de contenido o múltiples usuarios. La evaluación PDF cubre documentos de muestra, imágenes y formularios sencillos, no todos los PDF existentes. La app completa está preparada para Streamlit Community Cloud, pero la publicación y el rendimiento en ese alojamiento no se han verificado. GitHub Pages no está activo y el repositorio permanece privado.

## Estudio y vectorización — 20 de octubre de 2026 (Lima)

El usuario confirmó que transcripción y PDF funcionan en su despliegue de Streamlit. La API de GitHub muestra ahora el repositorio público, rama `main`, y Pages desactivado; esta implementación no cambió la visibilidad.

- `scripts/setup.sh` y `scripts/setup-streamlit.sh` ejecutados de nuevo: dependencias reproducibles, build completo y hash del modelo verificado.
- **14 pruebas de API aprobadas**, sin cambios al motor de reconocimiento.
- **19 pruebas Node aprobadas**: las 13 PDF y 6 de vectorización. Cubren SVG geométrico sin raster incrustado, preservación del original, blanco/negro, eliminación de blancos, huecos, límites de entrada al trazador, paleta determinista y conservación de un pequeño color de acento.
- `tests/vector_browser_check.py`: worker y descargas reales en color y monocromo; PNG, JPEG y WebP; entrada inválida, corrupta y de más de 15 MB; nombre tratado como texto; arrastre, reducción proporcional a 1200 px, zoom, cancelación y reintento. SVG leído con un parser XML independiente. Se renderizó un SVG con hueco para comprobar alfa transparente/opaco en píxeles conocidos; también se comprobó que el amarillo del ejemplo conserva su color.
- La misma prueba funciona sin conexión y sin POST/PUT, incluido el HTML autónomo que usa Streamlit. No se afirma haber probado `file://` en el navegador administrado.
- `tests/studio_browser_check.py`: portada a 1440 y 390 px, logo e ilustraciones SVG descodificables, ambos botones de ingreso, ausencia de campos de credenciales, navegación de vuelta al inicio y vectorización/descarga desde el iframe real de Streamlit.
- `tests/streamlit_browser_check.py`: nueva portada → ingreso → MP4 real → Whisper → edición/TXT; después PDF de seis páginas descargable. Motor real, sin simulaciones.
- `tests/pdf_browser_check.py`: seis herramientas, contenidos comprobados con `pypdf`, móvil, cancelación y funcionamiento sin conexión siguen aprobados. `tests/browser_check.py`: interfaz FastAPI de transcripción aprobada con reconocedor explícitamente simulado.
- `npm audit --omit=dev`: cero vulnerabilidades informadas para las dependencias runtime en esta consulta; no es una auditoría completa del producto.

Capturas: `test-results/studio/`, `test-results/vector-browser/`, `test-results/streamlit-transcription.png`. No se midió carga multiusuario ni precisión en fotos complejas; no se promete equivalencia con servicios comerciales de vectorización.

El acceso HTTP desde este entorno a `resapo-mvp.streamlit.app` fue bloqueado por la política de red (`403` del túnel), antes de alcanzar la aplicación. Se añadió el destino al borrador del entorno para revisión; guardar ese borrador no demuestra que la regla esté aplicada. Las pruebas anteriores son locales. La actualización pública debe distinguirse del push de código y de estas pruebas.

## Legibilidad y conversión de archivos — 20 de octubre de 2026 (Lima)

- Tipografía ampliada en Streamlit, portada, PDF, vectorización y web principal. El navegador comprobó texto de descripción de al menos 16 px y notas de al menos 14 px. Capturas de escritorio y móvil sin desbordamiento horizontal.
- **22 pruebas de conversión con motores reales**: MP4 a las seis salidas de audio; MP4/MKV/WebM con codecs comprobados por ffprobe; duración de audio más corta que el video; proporción de píxeles no cuadrados; JPG/WebP/BMP/TIFF/PNG con dimensiones y transparencia; imagen a PDF; TXT/PDF/DOCX con acentos y paginación; documentos cifrados o escaneados; animaciones; límites; exclusión mutua; plazo de ejecución y limpieza.
- **16 pruebas de API**: las anteriores más la conversión real TXT a PDF, descarga sin caché, combinaciones inválidas, exclusión concurrente y recuperación tras error.
- **19 pruebas Node** de PDF/vectorización siguen aprobadas.
- `tests/converter_browser_check.py`: desde Streamlit se subió MP4 y descargó MP3, TXT y descargó PDF con texto verificado, y PNG y descargó JPG con dimensiones y fondo blanco comprobados. Cambiar el formato invalida la descarga anterior. La misma prueba sube texto al endpoint FastAPI y descarga un PDF legible.
- `tests/streamlit_browser_check.py`: transcripción real de MP4 con Whisper, TXT descargable y PDF de seis páginas siguen funcionando con la cuarta pestaña presente.
- Pruebas de navegador de portada, seis herramientas PDF, vectorización y transcripción FastAPI completadas. El reconocedor solo se simula en `tests/browser_check.py`, no en la prueba Streamlit.

Se detectó y corrigió un caso real: un video puede durar más que su pista de audio. La validación de extracción compara la duración de la pista seleccionada, cuando está disponible, y no exige que el MP3 dure lo mismo que el video. También se ajustaron arenas de memoria y pila de los subprocesos para que FFmpeg pueda crear sus hilos bajo el límite de memoria sin reservar espacio virtual excesivo.

La prueba automatizada espera a que termine cada rerun de Streamlit antes de abrir el menú de salida. Esto evita confundir el cierre normal de un menú durante un rerun con un fallo del convertidor.

Capturas y descargas: `test-results/converter-browser/`. Se probaron codecs y documentos sintéticos/pequeños; no todos los archivos posibles, tiempos máximos de cada formato ni carga multiusuario. El convertidor es intencionalmente de formatos comunes, y la conversión de documentos es de texto, no de maquetación. No se afirma que acepte cualquier extensión existente.

## Herramientas creativas — 22 de octubre de 2026 (Lima)

- 17 herramientas locales y guía interactiva por herramienta (qué hace, problema que resuelve, tres pasos, ejemplo sintético). Quinta pestaña de Streamlit y ruta `/herramientas`.
- 24 pruebas Node aprobadas: las 19 existentes y cinco pruebas nuevas de texto, reemplazo literal/límites, cabecera ICO, formularios y radio buttons, límites/contraseña de PDF.
- 38 pruebas Python de transcripción/API/conversión siguen aprobadas.
- `tests/lab_browser_check.py`: se ejecutaron las 17 herramientas con motores reales. Descargas leídas con Pillow, pypdf y XML: dimensiones/píxeles, favicon ICO, marcas y numeración, valores AcroForm con acentos, extracción de imágenes y firma en la página seleccionada. Se verifican invalidación de resultados, errores de recorte, rechazo de SVG con scripts/referencias externas, navegación de la guía y ausencia de POST/PUT. El HTML autónomo crea PDF con su worker sin conexión.
- `tests/lab_streamlit_check.py`: guía y formulario PDF real dentro del iframe de Streamlit; descarga con acentos; edición de un SVG previamente generado por el vectorizador; escritorio y móvil sin desbordamiento.
- Regresiones aprobadas: portada/ingreso/vectorización en Streamlit, convertidor MP4→MP3/TXT→PDF/PNG→JPG y transcripción real con Whisper/TXT/PDF local. También pasaron las seis herramientas PDF anteriores, con contenido, rotación, imágenes, móvil y HTML autónomo comprobados.
- `npm audit --omit=dev`: cero vulnerabilidades informadas para las dependencias runtime en esta consulta; no equivale a una auditoría completa.

La prueba encontró y permitió corregir la limpieza al cambiar de PDF con la API actual de PDF.js. También se corrigió el empaquetado HTML autónomo para conservar literalmente los caracteres de reemplazo de JavaScript. Capturas: `test-results/lab/streamlit-desktop.png` y `streamlit-mobile.png`.

Las comprobaciones son locales, no verifican el despliegue público de Streamlit. No se midió rendimiento en todos los móviles ni compatibilidad con todo PDF/SVG existente; formatos, memoria, fidelidad y límites están documentados en LOCAL_TOOLS.md y en la interfaz. Las nuevas herramientas no usan servicios facturados ni suben archivos al servidor.

## Vectorización para logos y visor SVG — 22 de octubre de 2026

- 29 pruebas Node aprobadas: se mantienen PDF y herramientas creativas; nuevas verificaciones de paleta HEX exacta, transparencia independiente de la distancia de color, fondo conectado al borde, conservación de interiores blancos, controles inválidos, límite de 2400 px, recolor de tinta y eliminación de halos generados por el umbral.
- `tests/vector_logo_browser_check.py`: motor real en navegador; píxeles del SVG renderizado comprueban alfa exterior 0, blanco interior opaco y color de marca; descarga XML con colores exactos; imagen de 2000×500 produce un viewBox de 2000×500 en calidad alta y mantiene tinta personalizada. Se comprueba zoom compartido, invalidación de resultados y fondos de inspección.
- Visor: SVG con degradado, clases CSS y metadatos; colores renderizados comprobados; zoom/ajuste; rechazo de eventos, scripts, recursos externos y XML corrupto. Pruebas sin conexión, sin peticiones externas, a 390 px y con el HTML autónomo exacto. Vectorización y apertura del SVG también pasaron dentro del iframe real de Streamlit.
- `tests/vector_browser_check.py`: regresión completa del vectorizador (color/mono, pequeños acentos, huecos, errores, descarga, cancelación/reintento, móvil y HTML autónomo) aprobada. `tests/studio_browser_check.py`: portada, entrada, retorno y SVG generado en Streamlit aprobados.

Capturas: `test-results/vector-logos/`. Son comprobaciones locales con logos sintéticos; no equivalen a una evaluación de todos los logos, navegadores o dispositivos ni a validar el despliegue público. No se cambió el motor de transcripción ni el convertidor del servidor. Se mantiene ImageTracerJS, con más resolución, control de geometría y tratamiento específico de paleta/fondo.


## Correcciones de vectorización y regresión general — 22 de octubre de 2026 (Lima)

- **31 pruebas Node y 38 pruebas Python aprobadas**. Las nuevas pruebas verifican que la paleta automática no convierte píxeles opacos en transparentes y que la limpieza de regiones no crea huecos ni rellena transparencias reales.
- `tests/vector_regression_check.py`: abre el visor con el botón exacto que reportó el usuario dentro de Streamlit, carga SVG, vuelve a vectorizar y descarga; repite el recorrido dos veces. El componente permanece en `about:srcdoc`, conserva su funcionamiento y también evita navegación accidental desde los enlaces internos. Comprueba texto general de imágenes y ausencia de desbordamiento a 390 px.
- Comparación renderizada contra salidas del commit `77aa396`: en una muestra desapareció el hueco opaco central; en otra, los píxeles interiores con alfa inferior a 250 pasaron de 1438 a 0 al renderizar a escala 4. En un círculo sintético de radio 55 px, el error radial RMS pasó de 0,291 a 0,170 px y el pico saliente máximo de 0,500 a 0,225 px. Estas medidas describen esas muestras, no todas las imágenes. Fixtures anteriores guardados en `tests/fixtures/vector-quality/`; resultados y métricas en `test-results/vector-quality/`.
- Regresiones de navegador aprobadas: vectorizador, paleta exacta/fondo/visor SVG, portada e ingreso, las seis herramientas PDF, las 17 herramientas creativas y su guía, edición de SVG en Streamlit, conversión MP4→MP3/TXT→PDF/PNG→JPG y transcripción real de video con Whisper y descarga TXT. La prueba de interfaz FastAPI mantiene su reconocedor simulado explícitamente; la de Streamlit usa el motor real.
- `npm run build` genera los artefactos estáticos actualizados. No se agregaron dependencias ni servicios facturados.

Las comprobaciones son locales. No se afirma que todos los archivos posibles produzcan resultados perfectos ni que estas pruebas verifiquen el despliegue público de Streamlit. La calidad final sigue dependiendo de la imagen y los ajustes seleccionados.


## Respuesta al reordenar PDF — 24 de octubre de 2026 (Lima)

Se reprodujo el escenario indicado por el usuario con 10 PDFs de 50 páginas cada uno, además de un documento de 500 páginas para el organizador. Antes, cada movimiento eliminaba y recreaba toda la lista, perdiendo el foco. Ahora las filas y tarjetas se reutilizan por identidad del documento/página (no por nombre), se actualizan sus posiciones y límites, y se restaura el foco sin desplazar la vista cuando el navegador lo pierde al mover un nodo. Seleccionar o girar una página actualiza su tarjeta sin reconstruir las demás. Se eliminaron renderizados duplicados después de cargar y generar documentos.

`tests/pdf_performance_check.py` mide 24 movimientos alternados por escenario en Chromium con CPU ralentizada 4×. Tiempo medio del manejador más el cálculo inmediato del diseño, en ms:

| Escenario | Antes (`c3f5893`) | Después |
| --- | ---: | ---: |
| 10 PDFs en la ruta web | 14,73 | 4,75 |
| Organizador de 500 páginas | 517,93 | 16,93 |
| 10 PDFs dentro de Streamlit | 13,40 | 5,53 |
| 10 PDFs en Streamlit, ancho móvil | 12,14 | 6,53 |

Las nuevas listas conservan todos sus nodos, sin reemplazos ni pérdidas de foco en esos movimientos. Reordenar no envía mensajes al motor PDF. La prueba también comprueba con `pypdf` las 500 páginas descargadas en el orden esperado, invalidación del resultado anterior, selección/giro/eliminación/restablecimiento, cambio entre las cinco pestañas sin perder archivos y ausencia de desbordamiento móvil. Los tiempos son medidas locales orientativas, no una garantía para todos los equipos o archivos; las aserciones de regresión verifican comportamiento y conservación de nodos, no un umbral de tiempo dependiente del equipo. Métricas en `test-results/pdf-performance/before.json` y `after.json`.

Además, el worker PDF se inicia al necesitarlo (no al abrir el estudio), y los PDF/ZIP resultantes se transfieren desde el worker sin duplicar su búfer. Cancelar sigue terminando el worker y permite reintentar con los archivos originales. La compilación autónoma conserva literalmente el JavaScript insertado en HTML.

Regresión completada: 31 pruebas Node y 38 Python, seis herramientas PDF con descargas verificadas y cancelación/reintento, portada e ingreso, visor/vectorización dentro de Streamlit, las 17 herramientas creativas, conversión multimedia/documentos/imágenes y transcripción real con Whisper. La prueba de transcripción necesitó esperar a que Streamlit terminara sus recargas antes de cargar el archivo y cambiar el idioma; sin esa sincronización el automatismo podía perder la carga inicial. Con la espera explícita pasó con motor real. No se modificó el motor de reconocimiento ni el convertidor. La prueba FastAPI de interfaz usa su reconocedor simulado como antes. Estas verificaciones no confirman el despliegue público ni miden la espera al despertar Streamlit Community Cloud.
