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
