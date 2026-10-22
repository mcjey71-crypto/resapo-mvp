# Herramientas creativas

17 herramientas nuevas en la quinta pestaña de Streamlit, `/herramientas` en FastAPI y `docs/herramientas.html` sin servidor. No usan APIs, almacenamiento remoto ni servicios de pago. El motor PDF.js y las demás bibliotecas se incluyen en el HTML autónomo; no se cargan desde CDN. Utiliza un navegador actualizado (Chrome/Edge, Firefox o Safari moderno).

Cada herramienta incluye una guía interactiva con qué hace, qué problema resuelve, tres pasos, navegación anterior/siguiente y un ejemplo sintético. Los ejemplos se generan localmente; no usan archivos del cliente. Cambiar de herramienta limpia la selección, los resultados y la guía. Cambiar opciones invalida la descarga anterior.

| Área | Herramientas |
| --- | --- |
| Imágenes | Cambiar tamaño (proporción opcional), recortar por coordenadas, girar, comprimir JPG/WebP, añadir texto/marca de agua, extraer hasta 8 colores, crear favicon PNG/ICO |
| PDF extra | Numerar, añadir marca de agua, extraer imágenes rasterizadas, completar campos AcroForm y colocar firma dibujada o PNG |
| Colores SVG | Editar colores y descargar variantes sucesivas |
| Texto | Contar palabras/caracteres/líneas, limpiar espacios, reemplazar texto literal y comparar versiones por líneas |

## Límites y fidelidad

- Imágenes: PNG/JPG/WebP hasta 15 MB y 16 MP. Resultado hasta 16 MP. Exportación estática, sin conservar metadatos/perfiles de color. JPG usa fondo blanco. No se garantiza una reducción de bytes al recomprimir: se comparan ambos tamaños. Recorte por píxeles con vista previa al crear el resultado. El favicon centra la imagen sin deformarla; ICO contiene PNG de hasta 256 px.
- PDF: 20 MB, 50 páginas, sin contraseña. XFA y campos de firma digital se rechazan. Los PDF originales no se modifican. Numeración y marca de agua se superponen: conviene revisar que no tapen contenido. La vista previa muestra el original y, para firma, su posición. Descarga y revisa el PDF final.
- Formularios: campos de texto, casillas, listas y botones de opción; se respetan campos de solo lectura. Se conservan editables. PDF escaneado o sin campos no es rellenable con esta función. No incluye OCR ni modificación del texto existente. La fuente de las apariencias admite texto latino, no todos los alfabetos/emojis.
- Firma: dibujo con ratón/táctil o PNG hasta 2 MB. Se elige una página y posición/tamaño porcentual. Es una imagen, no una firma digital certificada ni una verificación de identidad.
- Extracción: hasta 40 imágenes, 40 MP acumulados y 50 MB de salida. No extrae dibujos vectoriales, máscaras como imágenes separadas ni reconstruye cada página. El PNG extraído puede diferir de su aspecto con recortes/máscaras/efectos en el PDF. PDFs con formatos de imagen o fuentes no compatibles con la versión local pueden fallar; no se descargan decodificadores externos.
- SVG: 2 MB, 20 000 elementos, 64 colores; formas estáticas y atributos de presentación compatibles. Se rechazan scripts, recursos externos, imágenes incrustadas, CSS global y elementos no admitidos. Incluye SVG de ImageTracer generado por Re-SAPO. Se conservan trazados; cambiar un color con el selector produce un color opaco.
- Texto: hasta 100 000 caracteres. Comparación: 100 000 entre ambas versiones, 2000 líneas y un segundo de cálculo. Reemplazo literal y sensible a mayúsculas. La limpieza puede cambiar sangrías. No incluye IA, corrección gramatical ni reescritura.

El navegador necesita memoria para decodificar archivos. Los límites reducen el riesgo de bloquear dispositivos pequeños, pero no garantizan rendimiento idéntico en todos los móviles. Cancelar/limpiar invalida resultados pendientes y cierra el trabajador PDF. Los enlaces Blob se revocan al limpiar o cambiar de herramienta. No hay historial persistente.

## Desarrollo

Fuentes: `src/lab-app.js`, `lab-core.js`, `lab-svg.js`, `lab-catalog.js`, `lab-template.html`, `web/lab.css`. Ejecutar `npm run build` tras editar. El build incluye PDF.js 6.4.299 (Apache-2.0) y jsdiff 9.0.0 (BSD-3-Clause), además de pdf-lib existente; licencias en `LAB_LICENSES.txt`, `THIRD_PARTY_NOTICES.md` y bundles. Construir con Node 22.13+ o Node 24; el alojamiento Python usa los assets ya compilados.

Pruebas: `npm test`; `.venv/bin/python tests/lab_browser_check.py` con FastAPI iniciado. Comprobar también la quinta pestaña de Streamlit y las regresiones de transcripción, conversión, PDF y vectorización antes de publicar.
