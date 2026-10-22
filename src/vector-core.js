import {
  quantizeCovered,
  mergeSmallRegions,
  coveredSVG,
} from "./vector-geometry.js";

export const MAX_TRACE_EDGE = 2400;
export const MAX_IMAGE_PIXELS = 25_000_000;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

// Spatial grid sampling can miss a small accent in a logo. Seed from a color
// histogram instead: keep common colors and choose distinct, represented accents.
function paletteFor(data, count) {
  const bins = new Map();
  let transparent = false;
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) {
      transparent = true;
      continue;
    }
    const key =
      ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const bin = bins.get(key) || { r: 0, g: 0, b: 0, n: 0 };
    bin.r += data[i];
    bin.g += data[i + 1];
    bin.b += data[i + 2];
    bin.n++;
    bins.set(key, bin);
  }
  const candidates = [...bins.values()]
    .map((c) => ({
      r: Math.round(c.r / c.n),
      g: Math.round(c.g / c.n),
      b: Math.round(c.b / c.n),
      a: 255,
      n: c.n,
    }))
    .sort((a, b) => b.n - a.n);
  const chosen = candidates.length ? [candidates.shift()] : [];
  while (chosen.length < count && candidates.length) {
    let best = 0,
      bestScore = -1;
    candidates.forEach((c, i) => {
      const distance = Math.min(
        ...chosen.map(
          (p) => (p.r - c.r) ** 2 + (p.g - c.g) ** 2 + (p.b - c.b) ** 2,
        ),
      );
      const score = distance * Math.sqrt(c.n);
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    });
    if (bestScore === 0) break;
    chosen.push(candidates.splice(best, 1)[0]);
  }
  const palette = chosen.map(({ r, g, b, a }) => ({ r, g, b, a }));
  if (transparent) palette.push({ r: 255, g: 255, b: 255, a: 0 });
  return palette;
}

export function brandPalette(text = "") {
  if (typeof text !== "string" || text.length > 300)
    throw new Error("Usa hasta 16 colores HEX, por ejemplo #183e33, #e7bc67.");
  const values = text.trim() ? text.trim().split(/[\s,;]+/) : [];
  if (
    values.length > 16 ||
    values.some((value) => !/^#[0-9a-f]{6}$/i.test(value))
  )
    throw new Error(
      "Usa hasta 16 colores HEX completos, por ejemplo #183e33, #e7bc67.",
    );
  return [...new Set(values.map((v) => v.toLowerCase()))].map((value) => ({
    r: parseInt(value.slice(1, 3), 16),
    g: parseInt(value.slice(3, 5), 16),
    b: parseInt(value.slice(5, 7), 16),
    a: 255,
  }));
}

// Flood from the perimeter only: white enclosed details remain part of the logo.
export function removeBackground(data, width, height, mode, color, tolerance) {
  if (mode === "keep") return;
  const matches = (pixel) => {
    const i = pixel * 4;
    return (
      data[i + 3] === 0 ||
      Math.max(
        Math.abs(data[i] - color[0]),
        Math.abs(data[i + 1] - color[1]),
        Math.abs(data[i + 2] - color[2]),
      ) <= tolerance
    );
  };
  if (mode === "all") {
    for (let p = 0; p < width * height; p++)
      if (matches(p)) data[p * 4 + 3] = 0;
    return;
  }
  const visited = new Uint8Array(width * height),
    queue = new Int32Array(width * height);
  let first = 0,
    last = 0;
  const add = (p) => {
    if (!visited[p] && matches(p)) {
      visited[p] = 1;
      queue[last++] = p;
    }
  };
  for (let x = 0; x < width; x++) {
    add(x);
    add((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    add(y * width);
    add(y * width + width - 1);
  }
  while (first < last) {
    const p = queue[first++],
      x = p % width;
    data[p * 4 + 3] = 0;
    if (x) add(p - 1);
    if (x < width - 1) add(p + 1);
    if (p >= width) add(p - width);
    if (p < (height - 1) * width) add(p + width);
  }
}

// Only pixel data enters the tracer; imported SVG files are handled separately.
export function vectorize(image, settings = {}) {
  const { width, height } = image;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_TRACE_EDGE ||
    height > MAX_TRACE_EDGE ||
    image.data.length !== width * height * 4
  ) {
    throw new Error("La imagen de trabajo no tiene un tamaño válido.");
  }
  const mode = settings.mode ?? "color";
  const colors = Number(settings.colors ?? 8);
  const detail = settings.detail ?? "balanced";
  const threshold = Number(settings.threshold ?? 150);
  if (
    !["color", "mono"].includes(mode) ||
    !Number.isInteger(colors) ||
    colors < 2 ||
    colors > 32 ||
    !["soft", "balanced", "fine"].includes(detail) ||
    threshold < 0 ||
    threshold > 255 ||
    !Number.isFinite(threshold)
  ) {
    throw new Error("Revisa las opciones de vectorización.");
  }
  const smoothing = Number(
    settings.smoothing ?? { soft: 2.5, balanced: 1, fine: 0.25 }[detail],
  );
  const speckles = Number(
    settings.speckles ?? { soft: 4, balanced: 0, fine: 0 }[detail],
  );
  const alpha = Number(settings.alpha ?? 128);
  const background = settings.background ?? "keep";
  const toleranceBG = Number(settings.backgroundTolerance ?? 20);
  const bg = brandPalette(settings.backgroundColor ?? "#ffffff");
  const ink = brandPalette(settings.ink ?? "#000000");
  const custom = brandPalette(settings.palette ?? "");
  if (
    !Number.isFinite(smoothing) ||
    smoothing < 0.1 ||
    smoothing > 5 ||
    !Number.isInteger(speckles) ||
    speckles < 0 ||
    speckles > 64 ||
    !Number.isInteger(alpha) ||
    alpha < 1 ||
    alpha > 255 ||
    !["keep", "edge", "all"].includes(background) ||
    !Number.isInteger(toleranceBG) ||
    toleranceBG < 0 ||
    toleranceBG > 100 ||
    bg.length !== 1 ||
    ink.length !== 1 ||
    (settings.corners !== undefined && typeof settings.corners !== "boolean") ||
    (settings.inkOnly !== undefined && typeof settings.inkOnly !== "boolean")
  )
    throw new Error("Revisa las opciones avanzadas de vectorización.");
  const data = new Uint8ClampedArray(image.data);
  removeBackground(
    data,
    width,
    height,
    background,
    [bg[0].r, bg[0].g, bg[0].b],
    toleranceBG,
  );
  let visible = 0;
  for (let i = 0; i < data.length; i += 4) {
    const white = Math.min(data[i], data[i + 1], data[i + 2]) >= 245;
    if (data[i + 3] < alpha || (settings.removeWhite && white)) {
      data.set([255, 255, 255, 0], i);
    } else {
      if (mode === "mono") {
        const value =
          data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722 <
          threshold
            ? 0
            : 255;
        data.set(
          settings.inkOnly && value === 255
            ? [255, 255, 255, 0]
            : [value, value, value, 255],
          i,
        );
      } else {
        // Keep opaque pixels out of the transparent palette entry, even when
        // every brand color is far from the original (e.g. white -> navy).
        if (custom.length) {
          let nearest = custom[0],
            distance = Infinity;
          for (const c of custom) {
            const d =
              Math.abs(data[i] - c.r) +
              Math.abs(data[i + 1] - c.g) +
              Math.abs(data[i + 2] - c.b);
            if (d < distance) {
              nearest = c;
              distance = d;
            }
          }
          data[i] = nearest.r;
          data[i + 1] = nearest.g;
          data[i + 2] = nearest.b;
        }
        data[i + 3] = 255;
      }
    }
  }
  for (let i = 3; i < data.length; i += 4) if (data[i]) visible++;
  if (!visible)
    throw new Error(
      "La imagen quedó vacía. Ajusta el fondo, la transparencia o el umbral; también puedes desactivar “Quitar blancos”.",
    );
  const tolerance = smoothing;
  const options = {
    ltres: tolerance,
    qtres: tolerance,
    pathomit: speckles,
    colorsampling: 2,
    numberofcolors: colors,
    colorquantcycles: custom.length ? 1 : 3,
    mincolorratio: 0,
    layering: 0,
    strokewidth: 0,
    roundcoords: 2,
    viewbox: true,
    desc: false,
    rightangleenhance: settings.corners ?? false,
  };
  if (mode === "mono")
    options.pal = [
      { r: 0, g: 0, b: 0, a: 255 },
      { r: 255, g: 255, b: 255, a: 255 },
      { r: 255, g: 255, b: 255, a: 0 },
    ];
  else if (custom.length)
    options.pal = [...custom, { r: 255, g: 255, b: 255, a: 0 }];
  else options.pal = paletteFor(data, colors);
  const quantized = quantizeCovered(
    data,
    width,
    height,
    options.pal,
    mode === "mono" || !!custom.length,
  );
  mergeSmallRegions(
    quantized.labels,
    width,
    height,
    quantized.transparent,
    speckles,
  );
  if (mode === "mono") quantized.colors[0] = ink[0];
  return {
    ...coveredSVG(
      quantized.labels,
      quantized.colors,
      quantized.transparent,
      width,
      height,
      options,
    ),
    width,
    height,
  };
}
