// Display only through an <img> Blob URL, never insert uploaded SVG into the DOM.
// Keep static Illustrator/Inkscape markup, gradients, CSS classes and metadata.
export const MAX_SVG_BYTES = 12 * 1024 * 1024;
export function inspectSVG(source) {
  if (
    typeof source !== "string" ||
    source.length > MAX_SVG_BYTES ||
    /<!ENTITY|<\?xml-stylesheet/i.test(source)
  )
    throw Error(
      "Usa un SVG estático de hasta 12 MB, sin entidades ni hojas de estilo externas.",
    );
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = doc.documentElement;
  if (
    doc.querySelector("parsererror") ||
    root.localName !== "svg" ||
    root.namespaceURI !== "http://www.w3.org/2000/svg"
  )
    throw Error(
      "No se pudo leer el SVG. Comprueba que sea un archivo SVG válido.",
    );
  const nodes = [...doc.querySelectorAll("*")];
  if (nodes.length > 100000)
    throw Error("El SVG tiene demasiados elementos para este visor.");
  const safeURL = (value) => {
    for (const match of value.matchAll(/url\s*\(([^)]*)\)/gi)) {
      if (!/^['"]?#[\w:.-]+['"]?$/.test(match[1].trim()))
        throw Error("El visor no carga recursos externos del SVG.");
    }
  };
  for (const node of nodes) {
    if (
      /^(script|foreignObject|animate|animateTransform|animateMotion|set)$/i.test(
        node.localName,
      )
    )
      throw Error(
        "El visor admite SVG estáticos, sin scripts, animaciones ni contenido HTML.",
      );
    for (const attr of node.attributes) {
      if (/^on/i.test(attr.localName))
        throw Error("No se admiten eventos ejecutables dentro del SVG.");
      if (
        attr.localName === "href" &&
        !/^#[\w:.-]+$/.test(attr.value) &&
        !/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(attr.value)
      )
        throw Error("El visor no carga recursos externos del SVG.");
      safeURL(attr.value);
    }
    if (node.localName === "style") {
      if (/@import|@font-face|\\/i.test(node.textContent))
        throw Error("Usa estilos locales sin fuentes externas ni escapes CSS.");
      safeURL(node.textContent);
    }
  }
  const viewBox = root.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (
      parts.length !== 4 ||
      parts.some((x) => !Number.isFinite(x)) ||
      parts[2] <= 0 ||
      parts[3] <= 0
    )
      throw Error("El SVG contiene un viewBox no válido.");
  }
  return {
    svg: new XMLSerializer().serializeToString(root),
    viewBox: viewBox || "Sin viewBox",
    paths: doc.querySelectorAll("path").length,
    images: doc.querySelectorAll("image").length,
  };
}
