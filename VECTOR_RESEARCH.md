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

- PNG, JPEG y WebP; hasta 15 MB y 25 megapíxeles. Se descodifican con `createImageBitmap` y se ajustan proporcionalmente a un máximo seleccionable de 600/1200/2400 px por lado antes del trazado.
- Worker separado para mantener los controles utilizables; cancelación real por terminación del worker y límite de ejecución de 90 segundos. No hay estimaciones de porcentaje ficticias.
- Paletas automáticas de 2 a 32 colores visibles (2, 3, 4, 6, 8, 16, 24 o 32 en la interfaz). Nuestra selección inicial usa un histograma ponderado por presencia y distancia de color, evitando que el muestreo espacial del motor omita acentos pequeños de un logo. La cuantización posterior pertenece a ImageTracer.
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


## Mejoras para logos y visor — 22 de octubre de 2026

- Ajustes de inicio para logos planos, letras/logotipos a una tinta, sellos y logos con muchos matices. Los controles siguen siendo editables; no hay una calidad universal que sirva para todos los originales.
- Resolución seleccionable: 600 px para prueba, 1200 equilibrada, 2400 para detalles. Se conserva una copia de trabajo de hasta 2400 px; seleccionar 2400 no vuelve a ampliar la copia de 1200. Nunca se amplían originales pequeños artificialmente. Las imágenes fuente siguen limitadas a 15 MB/25 MP y el trabajador a 90 segundos; mayor resolución consume memoria del dispositivo.
- Paleta de marca: hasta 16 HEX de seis dígitos. Los píxeles visibles se asignan a los colores opacos más próximos antes del trazado, sin ciclos que promedien y alteren esos colores. La transparencia se mantiene separada para no convertir colores alejados en agujeros accidentales. La paleta fija puede cambiar colores del original deliberadamente.
- Fondo por color: conservar, quitar únicamente regiones conectadas al perímetro (inundación con conectividad de cuatro vecinos), o quitar el color en toda la imagen. Tolerancia configurable. El modo borde conserva los blancos interiores cerrados; si existe una abertura hacia el exterior, la eliminación puede entrar. La opción independiente «Quitar blancos» elimina todos los casi blancos, también interiores.
- Curvas: tolerancias de 0,1 a 5; limpieza de trayectos pequeños; conservación de ángulos rectos; corte de alfa entre 1 y 255. La salida sigue siendo opaca/transparente, sin conservar alfa parcial. Limpiar demasiado puede perder puntos, acentos o detalles.
- Modo de una tinta: umbral, color HEX y opción «Solo tinta» que también hace transparentes los blancos producidos por el umbral, evitando halos blancos sobre fondos oscuros. Los textos se trazan como formas, no se reconocen ni se recupera la tipografía original.
- Se muestran los colores usados. Original y vector comparten zoom de hasta 800 % y desplazamiento; fondos de vista previa blanco, oscuro y cuadriculado. Los fondos de vista previa no se incorporan a la descarga.
- Visor independiente en la misma página, con acceso directo arriba: SVG importado o recién creado, zoom 50–800 %, ajuste a vista y fondos. Acepta hasta 12 MB/100 000 elementos estáticos, formas, degradados, estilos locales y metadatos. Informa si contiene imágenes rasterizadas. No vuelve a vectorizar ni modifica el archivo original.
- SVG importado: validación XML y rechazo de scripts/eventos, animaciones, HTML, entidades, hojas de estilo y recursos externos. Se muestra como una imagen Blob aislada, nunca insertando el SVG del usuario en el DOM. No se promete compatibilidad con todo SVG exportado; las fuentes no instaladas pueden cambiar el aspecto, por lo que se recomiendan letras convertidas a contornos. No hay descargas de fuentes ni decodificadores externos.

No se agregaron servicios de pago, dependencias ni procesamiento en el servidor. Los resultados siguen aproximando el mapa de píxeles: un original borroso no permite recuperar detalles que ya no existen. Los degradados trazados se aproximan mediante regiones de color, no como degradados vectoriales editables.
