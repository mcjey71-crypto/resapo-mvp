import ImageTracer from "imagetracerjs";

// Quantize RGB independently from coverage: transparency is never a candidate
// for an opaque pixel. Fixed palettes stay exact; automatic palettes refine RGB.
export function quantizeCovered(data, width, height, palette, fixed = false) {
  const colors = palette
    .filter((c) => c.a >= 128)
    .map((c) => ({ ...c, a: 255 }));
  const labels = new Uint8Array(width * height),
    transparent = colors.length;
  for (let cycle = 0; cycle < (fixed ? 1 : 3); cycle++) {
    const sums = colors.map(() => [0, 0, 0, 0]),
      cache = new Map();
    for (let p = 0; p < labels.length; p++) {
      const i = p * 4;
      if (!data[i + 3]) {
        labels[p] = transparent;
        continue;
      }
      const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      let best = cache.get(key);
      if (best === undefined) {
        best = 0;
        let distance = Infinity;
        for (let c = 0; c < colors.length; c++) {
          const v = colors[c],
            d =
              Math.abs(v.r - data[i]) +
              Math.abs(v.g - data[i + 1]) +
              Math.abs(v.b - data[i + 2]);
          if (d < distance) {
            distance = d;
            best = c;
          }
        }
        if (cache.size < 65536) cache.set(key, best);
      }
      labels[p] = best;
      const sum = sums[best];
      sum[0] += data[i];
      sum[1] += data[i + 1];
      sum[2] += data[i + 2];
      sum[3]++;
    }
    if (!fixed && cycle < 2)
      for (let c = 0; c < colors.length; c++)
        if (sums[c][3]) {
          colors[c].r = Math.floor(sums[c][0] / sums[c][3]);
          colors[c].g = Math.floor(sums[c][1] / sums[c][3]);
          colors[c].b = Math.floor(sums[c][2] / sums[c][3]);
        }
  }
  return { labels, colors, transparent };
}

// Merge a small colored component into a neighboring opaque region. Dropping
// its outline would leave a hole in the surrounding color. Real alpha is intact.
export function mergeSmallRegions(labels, width, height, transparent, limit) {
  if (!limit) return;
  const seen = new Uint8Array(labels.length),
    queue = new Int32Array(labels.length);
  for (let start = 0; start < labels.length; start++) {
    if (seen[start] || labels[start] === transparent) continue;
    const color = labels[start],
      neighbors = new Uint32Array(transparent);
    let head = 0,
      tail = 1;
    queue[0] = start;
    seen[start] = 1;
    const visit = (p) => {
      const v = labels[p];
      if (v === color) {
        if (!seen[p]) {
          seen[p] = 1;
          queue[tail++] = p;
        }
      } else if (v !== transparent) neighbors[v]++;
    };
    while (head < tail) {
      const p = queue[head++],
        x = p % width;
      if (x) visit(p - 1);
      if (x + 1 < width) visit(p + 1);
      if (p >= width) visit(p - width);
      if (p + width < labels.length) visit(p + width);
    }
    if (tail <= limit) {
      let target = -1,
        max = 0;
      for (let c = 0; c < neighbors.length; c++)
        if (neighbors[c] > max) {
          target = c;
          max = neighbors[c];
        }
      if (target !== -1)
        for (let j = 0; j < tail; j++) labels[queue[j]] = target;
    }
  }
}
function indexed(labels, width, height, mask = false, transparent) {
  const array = Array.from({ length: height + 2 }, () =>
    new Int16Array(width + 2).fill(-1),
  );
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const value = labels[y * width + x];
      array[y + 1][x + 1] = mask ? (value === transparent ? 1 : 0) : value;
    }
  return { array };
}
const number = (v) => {
  if (!Number.isFinite(v))
    throw Error("No se pudo ajustar un contorno. Prueba menor simplificación.");
  return Math.round(v * 1000) / 1000;
};
function segmentPath(path) {
  if (!path.segments.length) return "";
  // Quadratic controls stay within the source contour bounding box. This bounds
  // the entire curve (convex hull property), preventing new outward spikes.
  const [left, top, right, bottom] = path.boundingbox;
  let d = `M ${number(path.segments[0].x1)} ${number(path.segments[0].y1)} `;
  for (const s of path.segments) {
    if (s.type === "Q")
      d += `Q ${number(Math.max(left, Math.min(right, s.x2)))} ${number(Math.max(top, Math.min(bottom, s.y2)))} ${number(s.x3)} ${number(s.y3)} `;
    else d += `L ${number(s.x2)} ${number(s.y2)} `;
  }
  return d + "Z ";
}
function contours(ii, color, options) {
  const raw = ImageTracer.pathscan(ImageTracer.layeringstep(ii, color), 0);
  const nodes = ImageTracer.internodes(raw, options);
  if (!options.rightangleenhance)
    for (const path of nodes) {
      if (path.points.length < 8) continue;
      // A short, symmetric contour filter attenuates raster stair-steps without
      // deleting regions or crossing to an unrelated color/transparent component.
      for (let pass = 0; pass < 2; pass++) {
        const old = path.points;
        path.points = old.map((p, i) => {
          const a = old[(i + old.length - 1) % old.length],
            b = old[(i + 1) % old.length];
          return {
            ...p,
            x: (a.x + 2 * p.x + b.x) / 4,
            y: (a.y + 2 * p.y + b.y) / 4,
          };
        });
      }
      path.points.forEach((p, i) => {
        const next = path.points[(i + 1) % path.points.length];
        p.linesegment = ImageTracer.getdirection(p.x, p.y, next.x, next.y);
      });
    }
  return ImageTracer.batchtracepaths(nodes, options.ltres, options.qtres);
}
function compounds(layer) {
  return layer
    .filter((p) => !p.isholepath)
    .map(
      (p) =>
        segmentPath(p) +
        p.holechildren.map((i) => segmentPath(layer[i])).join(""),
    );
}
export function coveredSVG(
  labels,
  colors,
  transparent,
  width,
  height,
  options,
) {
  const counts = new Uint32Array(colors.length);
  let opaque = 0;
  for (const v of labels)
    if (v !== transparent) {
      counts[v]++;
      opaque++;
    }
  let dominant = 0;
  for (let i = 1; i < counts.length; i++)
    if (counts[i] > counts[dominant]) dominant = i;
  // A coverage layer fills internal seams caused by independently fitted color
  // boundaries. Clipping preserves intended transparent holes and outer edges.
  const coverage =
    opaque === labels.length
      ? `M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z`
      : compounds(
          contours(indexed(labels, width, height, true, transparent), 0, {
            ...options,
            ltres: Math.min(options.ltres, 1),
            qtres: Math.min(options.qtres, 1),
          }),
        ).join("");
  const colorString = (c) => `rgb(${c.r},${c.g},${c.b})`;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><defs><clipPath id="resapo-coverage" clipPathUnits="userSpaceOnUse"><path d="${coverage}" clip-rule="evenodd"/></clipPath></defs><path fill="${colorString(colors[dominant])}" opacity="1" fill-rule="evenodd" d="${coverage}"/>`;
  const ii = indexed(labels, width, height);
  let paths = 1;
  for (let c = 0; c < colors.length; c++)
    if (counts[c])
      for (const d of compounds(contours(ii, c, options))) {
        paths++;
        svg += `<path fill="${colorString(colors[c])}" opacity="1" fill-rule="evenodd" clip-path="url(#resapo-coverage)" d="${d}"/>`;
        if (svg.length > 12 * 1024 ** 2)
          throw Error(
            "El resultado es demasiado complejo. Reduce colores o resolución.",
          );
      }
  return {
    svg: svg + "</svg>",
    paths,
    colors: colors
      .filter((_, i) => counts[i])
      .map(
        (c) =>
          "#" +
          [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join(""),
      ),
  };
}
