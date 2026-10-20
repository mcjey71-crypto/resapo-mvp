# Herramientas PDF: investigación y primera versión

Se consultaron las páginas oficiales el 19 de octubre de 2026, hora de Lima. Se tomaron como referencia los tipos de tarea y la claridad del flujo; el diseño, los textos y la implementación de Re-SAPO son propios.

| Referencia | Funciones observadas | Qué aprovechamos para el producto |
| --- | --- | --- |
| [iLovePDF](https://www.ilovepdf.com/es) | Unir, dividir, extraer, eliminar, ordenar y JPG a PDF, entre otras. | Una herramienta por tarea, con selección de archivos y descarga del resultado. |
| [Smallpdf](https://smallpdf.com/es) | Unir, dividir, girar, eliminar, extraer, organizar e imágenes a PDF; también edición y conversión a formatos de oficina. | Separar operaciones sobre páginas de la edición de texto; ofrecer un resultado descargable. |
| [PDF24](https://tools.pdf24.org/es/) | Unir, dividir, imágenes a PDF, girar, eliminar, extraer y ordenar; también OCR, compresión y otras utilidades. | Un catálogo sencillo que permita crecer sin mezclar todas las opciones en un solo editor. |
| [pdf-lib](https://pdf-lib.js.org/) | Crear y modificar PDF desde JavaScript, copiar páginas e incrustar imágenes. | Motor local del MVP; no requiere subir documentos a un servidor. |

## Funciones entregadas

- **Unir PDF:** combina entre 2 y 20 documentos, con orden ajustable.
- **Extraer páginas:** números y rangos, por ejemplo `3, 1-2`; conserva ese orden en un nuevo PDF.
- **Dividir PDF:** grupos separados por `;`, por ejemplo `1-3; 4-6`, o un PDF por página. Entrega un ZIP.
- **Eliminar páginas:** guarda las restantes; impide producir un documento sin páginas.
- **Ordenar y girar:** páginas identificadas por su número original, flechas para moverlas, giros de 90°, selección múltiple para girar/eliminar y restablecimiento del orden. El visor nativo permite consultar originales y resultados; no se incluyen miniaturas renderizadas del contenido.
- **Imágenes a PDF:** JPG/JPEG y PNG, orden ajustable, A4 vertical/horizontal o tamaño según imagen, márgenes opcionales y proporción conservada. Se normaliza la orientación de las fotos en el navegador.
- **Probar con un ejemplo:** crea documentos de muestra localmente.

En esta versión, “cortar PDF” significa extraer o separar páginas. No se implementó recorte de los márgenes de una página.

## Decisiones técnicas

El motor funciona en un Web Worker para mantener la interfaz disponible y poder cancelar el trabajo. Las tareas se realizan localmente; no hay peticiones para subir PDF o imágenes. Se crean copias y se descargan resultados; los originales no se sobrescriben. Los bytes y las direcciones temporales del navegador se liberan al quitar archivos o cambiar de herramienta.

Límites: 50 MB por archivo, 100 MB de entradas por operación, 20 archivos, 500 páginas de salida y 25 megapíxeles por imagen. Se rechazan archivos vacíos, ilegibles y PDF cifrados. Los formularios compatibles se convierten a contenido fijo para mantener su apariencia; se rechaza XFA. Reescribir un PDF invalida sus firmas digitales.

Las dependencias tienen versiones fijas y lockfile de npm. Sus avisos se incluyen en `THIRD_PARTY_NOTICES.md` y en el bundle autónomo. La consulta de `npm audit --omit=dev` no informó vulnerabilidades conocidas para las dependencias consultadas; esto no equivale a una auditoría de seguridad del producto.

## Próximas funciones posibles

Compresión, OCR, PDF a imágenes, anotaciones y recorte visual de márgenes requieren otras bibliotecas y pruebas de calidad. La edición del texto existente y las conversiones Word/PDF no están incluidas. Primero conviene observar cuáles de las herramientas entregadas usan más las personas.

Para el modelo comercial, estas utilidades gratuitas pueden atraer usuarios a Re-SAPO, mientras se valida el costo por minuto de la transcripción. El MVP todavía no controla pagos ni cuotas de clientes.
