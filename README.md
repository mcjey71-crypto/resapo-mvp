# Re-SAPO

MVP web para convertir audio y video en texto con Whisper. Conserva la identidad verde y crema y el logo SVG del avance original. La transcripción se ejecuta en el servidor, con `faster-whisper` sobre CPU; no necesita una clave de OpenAI ni Google Colab.

## Ejecutar

Requisitos: Python 3.12, [uv](https://docs.astral.sh/uv/) y FFmpeg en el PATH. En este entorno ya están instalados.

Desde la carpeta del proyecto (`/workspace/resapo-mvp` en el entorno de desarrollo):

```bash
bash scripts/setup.sh
bash scripts/start.sh
```

El servidor escucha en el puerto 8000 de la máquina. Abre la aplicación mediante el acceso a ese servidor que proporcione tu entorno. Abrir `web/index.html` directamente no inicia el motor de transcripción.

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

No hay traducción, resumen, identificación de hablantes, grabación de micrófono ni cobros en esta versión. El reconocimiento puede omitir o confundir palabras, especialmente con ruido, música o varias voces simultáneas. Revisa el resultado.

## Límites y datos

- 200 MB y 60 minutos por archivo. Se pueden ajustar con `RESAPO_MAX_MB` y `RESAPO_MAX_MINUTES` al iniciar.
- Un trabajador de transcripción y hasta tres solicitudes admitidas entre subida, espera y procesamiento. El resto recibe HTTP 429.
- La duración se comprueba sobre el audio decodificado; FFmpeg se detiene al superar el máximo. Los videos deben contener una pista de audio.
- Solo se aceptan contenedores multimedia concretos. FFmpeg no puede utilizar protocolos de red ni listas de reproducción de entrada.
- El archivo y el WAV intermedio se eliminan al terminar o fallar. La cancelación es cooperativa: espera a que concluya el paso de decodificación/inferencia en curso antes de liberar sus recursos.
- El texto queda en memoria del servidor durante una hora desde la finalización, con limpieza periódica cada minuto. No hay base de datos, historial ni guardado en `localStorage`. Al cerrar o recargar la página se pierde la copia del navegador. Al reiniciar el servidor se pierden los trabajos y resultados.
- Un cierre abrupto de la máquina puede dejar carpetas temporales `resapo-*` en el directorio temporal del sistema. No hay garantía de borrado ante un corte forzado.
- Los IDs de trabajo son aleatorios. Las respuestas de la API llevan `Cache-Control: no-store`. No se incluye publicidad, analítica ni recursos externos en la interfaz.

## Comprobaciones

```bash
.venv/bin/python -m pytest -q
.venv/bin/python tests/browser_check.py
.venv/bin/python scripts/smoke_test.py ruta/a/una-clase.mp4 --language es
```

Las pruebas de API usan FFmpeg real y un reconocedor controlado para verificar los flujos, límites, errores y limpieza. **No miden precisión de Whisper.** La prueba de navegador usa Chromium en `/usr/bin/chromium`, requiere el servidor encendido y simula únicamente las respuestas del reconocedor y su disponibilidad. Guarda capturas en `test-results/`.

`smoke_test.py` utiliza el servidor y Whisper reales. Puede comprobar una frase mediante `--expect`. Las pruebas reales realizadas durante la preparación se documentan en `VALIDATION.md`.

## Archivos

- `web/index.html`, `web/styles.css`, `web/app.js`: interfaz accesible, adaptable a móvil y sin compilación de JavaScript.
- `web/logo.svg`: trazos vectoriales originales, con fondo transparente. El mismo SVG está integrado en el HTML para el encabezado y la ilustración.
- `server.py`: carga temporal, cola, FFmpeg y motor Whisper.
- `scripts/`: instalación, arranque, descarga verificada y prueba real.
- `tests/`: verificaciones de API e interfaz.
- `REVIEW.md`: diagnóstico de los archivos que compartiste y decisiones del MVP.

## Antes de vender acceso

Esta versión prepara y valida la transcripción. Para abrir un servicio de pago faltan cuentas de usuario, autorización por trabajo, cuotas y minutos consumidos verificados en servidor, pagos confirmados por el proveedor, HTTPS y límites en el proxy de entrada. Evita ejecutar varias instancias de Uvicorn con esta cola en memoria; para escalar se necesita una cola y almacenamiento compartidos.

El costo de alojar Whisper depende del equipo y los minutos procesados. Conviene medirlo antes de prometer un pase ilimitado de S/ 1. Los códigos visibles en JavaScript y las marcas de `localStorage` del prototipo no sirven para proteger ingresos. El notebook es una referencia de uso de Whisper; una sesión de Colab no sustituye un servidor disponible para clientes.
