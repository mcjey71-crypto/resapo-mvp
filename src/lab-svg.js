const TAGS = new Set(
  "svg g path rect circle ellipse line polyline polygon defs linearGradient radialGradient stop clipPath mask title desc text tspan use".split(
    " ",
  ),
);
const ATTRS = new Set(
  "version desc xmlns xmlns:xlink viewBox width height x y x1 y1 x2 y2 cx cy r rx ry d points transform fill stroke color stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity fill-opacity stroke-opacity fill-rule clip-rule id clip-path mask gradientUnits gradientTransform spreadMethod offset stop-color stop-opacity fx fy fr preserveAspectRatio href xlink:href font-size font-family font-weight text-anchor dominant-baseline dx dy".split(
    " ",
  ),
);
const STYLE = new Set(
  "fill stroke color stroke-width stroke-linecap stroke-linejoin opacity fill-opacity stroke-opacity fill-rule stop-color stop-opacity font-size font-family font-weight text-anchor".split(
    " ",
  ),
);
export function parseSVG(source) {
  if (
    source.length > 2 * 1024 ** 2 ||
    /<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(source)
  )
    throw Error("Usa un SVG estático de hasta 2 MB, sin entidades externas.");
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  if (
    doc.querySelector("parsererror") ||
    doc.documentElement.localName !== "svg"
  )
    throw Error("El archivo no es un SVG válido.");
  const nodes = [...doc.querySelectorAll("*")];
  if (nodes.length > 20000)
    throw Error("El SVG contiene demasiados elementos.");
  for (const el of nodes) {
    if (
      !TAGS.has(el.localName) ||
      el.namespaceURI !== "http://www.w3.org/2000/svg"
    )
      throw Error(
        "Usa un SVG estático con formas y colores: no se admiten scripts, imágenes incrustadas, CSS global ni contenido externo.",
      );
    const style = el.getAttribute("style");
    if (style) {
      for (const part of style.split(";").filter((x) => x.trim())) {
        const colon = part.indexOf(":");
        const key = part.slice(0, colon).trim(),
          value = part.slice(colon + 1).trim();
        if (colon < 0 || !STYLE.has(key))
          throw Error(
            "Este SVG usa estilos no compatibles. Exporta con atributos de presentación.",
          );
        el.setAttribute(key, value);
      }
      el.removeAttribute("style");
    }
    for (const a of [...el.attributes]) {
      if (!ATTRS.has(a.name))
        throw Error(
          `Atributo SVG no compatible: ${a.name}. Exporta un SVG simple.`,
        );
      if (
        /(?:url\s*\(|javascript:|data:|https?:|\/\/)/i.test(a.value) &&
        !a.name.startsWith("xmlns") &&
        !/^url\(#[\w.-]+\)$/.test(a.value)
      )
        throw Error("No se permiten recursos externos en el SVG.");
      if (/href$/.test(a.name) && !/^#[\w.-]+$/.test(a.value))
        throw Error("Solo se permiten referencias internas en el SVG.");
    }
  }
  return doc;
}
export function svgColors(doc) {
  const result = new Map();
  for (const el of doc.querySelectorAll("*"))
    for (const attr of ["fill", "stroke", "stop-color", "color"]) {
      const value = el.getAttribute(attr);
      if (!value || /^(none|transparent|currentColor|url\()/i.test(value))
        continue;
      if (!CSS.supports("color", value))
        throw Error("El SVG contiene un color no compatible.");
      if (!result.has(value)) result.set(value, []);
      result.get(value).push([el, attr]);
    }
  if (!result.size) {
    doc.documentElement.setAttribute("fill", "#000000");
    result.set("#000000", [[doc.documentElement, "fill"]]);
  }
  if (result.size > 64)
    throw Error(
      "Edita SVG con hasta 64 colores. Reduce la paleta al vectorizar.",
    );
  return result;
}
export function serializeSVG(doc) {
  return new XMLSerializer().serializeToString(doc);
}
