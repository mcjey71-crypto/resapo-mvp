# Cómo abrir y publicar Re-SAPO

## La opción recomendada: Streamlit Community Cloud

Permite usar **transcripción, PDF y vectorización en una misma app**. El propietario ya confirmó que su despliegue de transcripción y PDF funciona. La portada da acceso mediante **Ingresar al estudio**, sin cuenta en esta edición. Los pasos siguientes sirven también para recrear el despliegue.

1. Entra en <https://share.streamlit.io/> e inicia sesión con GitHub.
2. Autoriza a Streamlit a leer `mcjey71-crypto/resapo-mvp` y elige **Create app / New app → Deploy a public app from GitHub** (el nombre del botón puede variar). La app puede compartirse aunque el código esté en un repositorio privado.
3. Completa estos campos:

   | Campo | Valor |
   | --- | --- |
   | Repository | `mcjey71-crypto/resapo-mvp` |
   | Branch | `main` |
   | Main file path | `cloud/streamlit_app.py` |
   | Advanced settings → Python | `3.12` |

4. Pulsa **Deploy**. No necesitas añadir claves de OpenAI. El instalador lee `cloud/requirements.txt` y `packages.txt`.
5. Cuando termine, Streamlit mostrará la dirección `…streamlit.app`. Ese es el enlace para abrirla y compartirla. La primera transcripción prepara el modelo y puede tardar más.
6. Abre **Herramientas PDF → Probar con un ejemplo → Unir documentos → Descargar** para comprobarla. Para transcripción, usa primero un audio corto, elige su idioma y pulsa **Transcribir archivo**.

La versión para alojamiento gratuito admite audio/video de **50 MB y 15 minutos** por archivo para moderar el uso de recursos. Los PDF conservan sus límites de 50 MB por archivo, 100 MB en total y 500 páginas. El reconocimiento se ejecuta en CPU y puede tardar; una instancia gratuita puede entrar en reposo o alcanzar los límites del servicio. No se han evaluado cargas de muchos usuarios concurrentes.

La versión Streamlit se prueba localmente con Whisper real, PDF y vectorización. El propietario confirmó el despliegue original en Community Cloud; esa confirmación no sustituye una validación de cada nueva versión. No se necesitan credenciales en este chat.

## Actualizaciones automáticas

Streamlit sigue la rama **main** de este repositorio. Un cambio local no aparece en la app hasta hacer **commit y push** a esa rama. Al recibirlo, Streamlit actualiza la aplicación automáticamente. Si cambian las dependencias de Python o `packages.txt`, hace un despliegue completo y puede tardar más.

Para modificar portada, PDF o vectorización:

```bash
npm ci --ignore-scripts
npm run build
npm test
```

Incluye también los archivos compilados de `web/` y `docs/` en el commit. Streamlit no ejecuta npm en producción. Después del push, recarga la misma URL. Si sigue mostrando una versión anterior, revisa los logs en **Manage app** y usa **Reboot app** si es necesario; no necesitas crear una segunda app.

Fuente: [Streamlit: actualizar tu app desde GitHub](https://docs.streamlit.io/deploy/streamlit-community-cloud/manage-your-app#update-your-app).

## Qué se consume y quién paga

- La app actual no cobra a sus visitantes. No hay pagos, cuentas, tarjetas ni una API de transcripción facturada por minuto.
- Whisper corre en la CPU del alojamiento. Consume memoria, tiempo de proceso y capacidad del servidor compartido. En Community Cloud gratuito esto se traduce en límites, esperas, suspensión o falta de capacidad, no en un cobro implementado por Re-SAPO.
- Los PDF y la vectorización usan el procesador y la memoria del dispositivo del visitante. Los archivos no se envían al backend de Re-SAPO.
- Los créditos utilizados para desarrollar la app en un asistente de programación son independientes del uso de las herramientas publicadas.
- Si en el futuro se contrata un servidor de pago o una API facturada, el titular de ese servicio asumiría esos cargos. Para vender acceso todavía faltan cuentas reales, pagos y cuotas verificadas en servidor; el botón **Ingresar** no aporta esas funciones.

Los límites de la transcripción siguen siendo 50 MB/15 minutos en Streamlit. Vectorización: hasta 15 MB/25 MP; se reduce a 1200 px por lado para trazar. La disponibilidad gratuita no equivale a capacidad ilimitada.

## Probar solamente PDF sin instalar herramientas

El archivo **`docs/index.html` es la aplicación PDF completa**, con sus bibliotecas incluidas:

1. En GitHub abre `docs/index.html` y usa **Download raw file**; abrir el archivo dentro de GitHub muestra su código, no ejecuta la app.
2. Guarda el HTML en tu computadora y ábrelo con un navegador moderno.
3. Pulsa **Probar con un ejemplo**, o selecciona tus propios PDF o imágenes.

No necesita Python, Whisper ni un servidor para las operaciones PDF. Si tu navegador administrado prohíbe abrir HTML local, usa la versión publicada en Streamlit o un servidor estático. La prueba automatizada verificó el HTML autónomo en un documento aislado sin conexión; el navegador administrado de este entorno bloquea las direcciones `file://`, por lo que ese modo concreto no pudo comprobarse aquí.

## GitHub Pages: alternativa solo para PDF

GitHub Pages sirve sitios estáticos. **En GitHub Free, Pages se ofrece para repositorios públicos**; los repositorios privados requieren un plan compatible. Al comprobarlo el 20 de octubre de 2026, el repositorio ya es público; este cambio de visibilidad lo hizo el propietario fuera de esta implementación. Pages sigue desactivado.

Con el repositorio público puedes activar Pages:

1. Abre el repositorio → **Settings → Pages**.
2. En **Build and deployment**, selecciona **Deploy from a branch**.
3. Elige la rama **main** y la carpeta **/docs**; pulsa **Save**.
4. Espera a que GitHub muestre el enlace publicado. La transcripción seguirá necesitando Streamlit o el servidor Python.

La integración de esta sesión pudo subir código, pero la API de Pages respondió `403 Resource not accessible by integration`. Por eso la activación debe hacerla el propietario en GitHub. No se ha activado Pages ni se proporciona una dirección como si estuviera disponible.

## Comparación de alojamiento gratuito

Consulta de la documentación oficial: 19 de octubre de 2026, hora de Lima.

| Servicio | Qué permite en este proyecto | Condiciones observadas | Decisión |
| --- | --- | --- | --- |
| GitHub Pages | Herramientas PDF y página estática | Gratis con GitHub Free para repositorios públicos; no ejecuta el servidor Python. | Build autónomo listo en `/docs`; el repositorio actual es público. |
| Streamlit Community Cloud | Transcripción en Python y herramientas PDF embebidas | Documentación indica despliegue gratuito y conexión a repositorios públicos o privados. Está sujeto a recursos disponibles. | Adaptador implementado y probado localmente. Opción recomendada para probar todo. |
| Hugging Face Spaces | La arquitectura FastAPI podría alojarse como Docker Space | La documentación actual dice que CPU Basic no tiene costo por hora, **pero crear un Space con cómputo Docker/Gradio requiere plan de pago**. Los Static Spaces son gratuitos. | No se recomienda como opción de costo cero para la transcripción en una cuenta nueva. |

Fuentes:

- [GitHub: qué es GitHub Pages y disponibilidad por plan](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages)
- [Streamlit Community Cloud](https://docs.streamlit.io/deploy/streamlit-community-cloud)
- [Dependencias de una app Streamlit: ubicación de requirements y packages.txt](https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/app-dependencies)
- [Hugging Face Spaces: requisitos de plan y recursos](https://huggingface.co/docs/hub/spaces-overview)
- [Hugging Face: tabla de hardware y condición para CPU Basic](https://huggingface.co/docs/hub/spaces-gpus)

## Ejecutar Streamlit en desarrollo

Desde la raíz del proyecto, con FFmpeg en el PATH:

```bash
bash scripts/setup-streamlit.sh
bash scripts/start-streamlit.sh
```

Esta entrada comparte el servicio de Whisper de `server.py`. La cola y el modelo se comparten entre sesiones; el texto editado vive en la sesión del usuario. No usa claves de API de terceros. Los controles de pago, cuentas y cuotas comerciales aún no están implementados.
