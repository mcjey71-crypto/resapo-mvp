import { writeFile, mkdir, copyFile } from "node:fs/promises";
import { vectorize as current } from "../src/vector-core.js";
await mkdir("test-results/vector-quality", { recursive: true });
function image(w, h, pixel) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) data.set(pixel(x, y), (y * w + x) * 4);
  return { width: w, height: h, data };
}
const fixtures = {
  alpha: image(160, 160, (x, y) =>
    x < 5 || y < 5 || x > 154 || y > 154
      ? [0, 0, 0, 0]
      : x >= 79 && x <= 80 && y >= 79 && y <= 80
        ? [255, 255, 255, 255]
        : x < 80
          ? [0, 10, 30, 255]
          : [160, 10, 20, 255],
  ),
  opaque: image(160, 160, (x, y) =>
    Math.hypot(x - 80, y - 80) < 55
      ? x + y < 160
        ? [30, 90, 130, 255]
        : [230, 170, 40, 255]
      : [245, 230, 200, 255],
  ),
  circle: image(160, 160, (x, y) => {
    const alpha = Math.round(
      Math.max(
        0,
        Math.min(1, 55 - Math.hypot(x + 0.5 - 80, y + 0.5 - 80) + 0.5),
      ) * 255,
    );
    return [20, 70, 50, alpha];
  }),
};
for (const [name, input] of Object.entries(fixtures)) {
  await copyFile(
    `tests/fixtures/vector-quality/${name}-before.svg`,
    `test-results/vector-quality/${name}-before.svg`,
  );
  await writeFile(
    `test-results/vector-quality/${name}-after.svg`,
    current(input, { colors: 2 }).svg,
  );
}
