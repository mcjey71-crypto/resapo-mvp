# Vectorización en Re-SAPO

Consulta e implementación: 20 de octubre de 2026 (Lima).

## Cómo funciona

Un archivo PNG/JPG contiene una cuadrícula de píxeles. Un vectorizador agrupa colores, encuentra las fronteras entre regiones, simplifica esos contornos y aproxima líneas y curvas. El SVG resultante contiene trazados geométricos; cambiar la extensión de una fotografía a `.svg` o incrustarla dentro de un SVG no hace ese trabajo.

ImageTracer documenta seis pasos: cuantización de color, separación de capas y detección de bordes, búsqueda de cadenas de contorno, interpolación, ajuste de líneas/splines cuadráticas y escritura de trazados SVG. Este es el motor usado; no se presenta como un algoritmo original de Re-SAPO.

## Opciones examinadas

| Motor | Enfoque | Ajuste al producto |
| --- | --- | --- |
| Potrace | Trazado de bitmaps y salida SVG/PDF/EPS, entre otros formatos. Incluye `mkbitmap` para preparar imágenes y filtros. | Buena referencia de contornos; el flujo básico es de bitmap y requiere preprocesamiento para color. Añadirlo como binario aumentaría el trabajo del servidor. |
| ImageTracerJS 1.2.6 | Colores, contornos y curvas en JavaScript, con API sobre `ImageData`, paletas y tolerancias configurables. Licencia Unlicense. | Elegido: puede procesar dentro del navegador sin un servicio de pago ni instalación en Streamlit. |

## Nuestra implementación

- PNG, JPEG y WebP; hasta 15 MB y 25 megapíxeles. Se descodifican con `createImageBitmap` y se ajustan proporcionalmente a un máximo de 1200 px por lado antes del trazado.
- Worker separado para mantener los controles utilizables; cancelación real por terminación del worker y límite de ejecución de 90 segundos. No hay estimaciones de porcentaje ficticias.
- Paletas de hasta 4, 8, 16 o 24 colores visibles. Nuestra selección inicial usa un histograma ponderado por presencia y distancia de color, evitando que el muestreo espacial del motor omita acentos pequeños de un logo. La cuantización posterior pertenece a ImageTracer.
- Blanco y negro con umbral ajustable; detalle suave, equilibrado o preciso.
- Conserva regiones transparentes y los huecos. La transparencia se simplifica a opaco/transparente con umbral de alfa 128; no se promete preservar semitransparencias o sombras exactamente.
- “Quitar blancos” elimina todos los píxeles casi blancos (cada canal ≥245), incluso blancos interiores. No es eliminación inteligente del fondo.
- Comparación original/vector, zoom de hasta 400%, descarga de SVG y ejemplo de un sapo creado con Canvas.
- Los nombres se muestran como texto. Solo se procesan píxeles: no se aceptan archivos SVG externos ni se inserta marcado del usuario. El resultado se previsualiza como imagen desde un Blob.
- Se revocan URLs al cambiar/limpiar la selección y al salir. Ningún archivo se envía al servidor. Las bibliotecas se incluyen en el artefacto, sin CDN.

## Límites de calidad

Es una primera herramienta para logos, iconos y dibujos de colores planos. No es OCR, no reconoce fuentes ni reconstruye texto editable. Las fotos se simplifican en áreas de color. Puede perder detalles pequeños, generar muchos trazados o producir un SVG mayor que el original. La ampliación del SVG no recupera información perdida en la imagen fuente. Inkscape, Figma o Illustrator permiten continuar la edición.

## Fuentes consultadas

- [ImageTracerJS: API y licencia](https://github.com/jankovicsandras/imagetracerjs)
- [Explicación del proceso y limitaciones del motor](https://github.com/jankovicsandras/imagetracerjs/blob/master/process_overview.md)
- [Opciones, tolerancias y paletas](https://github.com/jankovicsandras/imagetracerjs/blob/master/options.md)
- [Potrace: descripción, formatos y preprocesamiento](https://github.com/skyrpex/potrace/blob/master/README) — espejo del código del proyecto; documentación leída en este repositorio.

Las instrucciones de compilación de estas fuentes se trataron como documentación técnica, no como instrucciones para modificar el proyecto o instalar software sin evaluar.
