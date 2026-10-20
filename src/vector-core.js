import ImageTracer from 'imagetracerjs';

export const MAX_TRACE_EDGE = 1200;
export const MAX_IMAGE_PIXELS = 25_000_000;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

// Spatial grid sampling can miss a small accent in a logo. Seed from a color
// histogram instead: keep common colors and choose distinct, represented accents.
function paletteFor(data, count) {
  const bins = new Map();
  let transparent = false;
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) { transparent = true; continue; }
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const bin = bins.get(key) || { r: 0, g: 0, b: 0, n: 0 };
    bin.r += data[i]; bin.g += data[i + 1]; bin.b += data[i + 2]; bin.n++;
    bins.set(key, bin);
  }
  const candidates = [...bins.values()].map(c => ({
    r: Math.round(c.r / c.n), g: Math.round(c.g / c.n), b: Math.round(c.b / c.n), a: 255, n: c.n,
  })).sort((a, b) => b.n - a.n);
  const chosen = candidates.length ? [candidates.shift()] : [];
  while (chosen.length < count && candidates.length) {
    let best = 0, bestScore = -1;
    candidates.forEach((c, i) => {
      const distance = Math.min(...chosen.map(p => (p.r - c.r) ** 2 + (p.g - c.g) ** 2 + (p.b - c.b) ** 2));
      const score = distance * Math.sqrt(c.n);
      if (score > bestScore) { best = i; bestScore = score; }
    });
    if (bestScore === 0) break;
    chosen.push(candidates.splice(best, 1)[0]);
  }
  const palette = chosen.map(({ r, g, b, a }) => ({ r, g, b, a }));
  if (transparent) palette.push({ r: 255, g: 255, b: 255, a: 0 });
  return palette;
}

// Only pixel data enters the tracer. No user-supplied SVG/HTML is ever parsed.
export function vectorize(image, settings = {}) {
  const { width, height } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width > MAX_TRACE_EDGE || height > MAX_TRACE_EDGE || image.data.length !== width * height * 4) {
    throw new Error('La imagen de trabajo no tiene un tamaño válido.');
  }
  const mode = settings.mode ?? 'color';
  const colors = Number(settings.colors ?? 8);
  const detail = settings.detail ?? 'balanced';
  const threshold = Number(settings.threshold ?? 150);
  if (!['color', 'mono'].includes(mode) || ![4, 8, 16, 24].includes(colors) ||
      !['soft', 'balanced', 'fine'].includes(detail) || threshold < 0 || threshold > 255 || !Number.isFinite(threshold)) {
    throw new Error('Revisa las opciones de vectorización.');
  }
  const data = new Uint8ClampedArray(image.data);
  let visible = 0;
  for (let i = 0; i < data.length; i += 4) {
    const white = Math.min(data[i], data[i + 1], data[i + 2]) >= 245;
    if (data[i + 3] < 128 || (settings.removeWhite && white)) {
      data.set([255, 255, 255, 0], i);
    } else {
      visible++;
      if (mode === 'mono') {
        const value = (data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722) < threshold ? 0 : 255;
        data.set([value, value, value, 255], i);
      } else {
        data[i + 3] = 255;
      }
    }
  }
  if (!visible) throw new Error('La imagen quedó vacía. Desactiva “Quitar blancos” o elige otra imagen.');
  const tolerance = { soft: 2.5, balanced: 1, fine: .25 }[detail];
  const options = {
    ltres: tolerance, qtres: tolerance, pathomit: { soft: 16, balanced: 4, fine: 0 }[detail],
    colorsampling: 2, numberofcolors: colors, colorquantcycles: 3, mincolorratio: 0,
    layering: 0, strokewidth: 0, roundcoords: 2, viewbox: true, desc: false,
    rightangleenhance: detail !== 'soft',
  };
  if (mode === 'mono') options.pal = [
    { r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 },
    { r: 255, g: 255, b: 255, a: 0 },
  ];
  else options.pal = paletteFor(data, colors);
  const traced = ImageTracer.imagedataToTracedata({ width, height, data }, options);
  // Transparent layers must remain holes, not opaque painted shapes.
  traced.palette.forEach((color, index) => {
    if (color.a < 128) traced.layers[index] = [];
  });
  const svg = ImageTracer.getsvgstring(traced, options);
  const paths = (svg.match(/<path /g) || []).length;
  if (!paths) throw new Error('No se encontraron contornos. Prueba con más detalle u otra imagen.');
  if (svg.length > 12 * 1024 * 1024) throw new Error('El resultado es demasiado complejo. Reduce los colores o el detalle.');
  return { svg, paths, width, height };
}
