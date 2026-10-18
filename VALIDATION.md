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
