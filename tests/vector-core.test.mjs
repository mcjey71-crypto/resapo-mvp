import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import {
  vectorize,
  brandPalette,
  removeBackground,
} from "../src/vector-core.js";

function image(
  width = 64,
  height = 64,
  pixel = (x, y) =>
    x > 12 && x < 51 && y > 12 && y < 51
      ? [30, 95, 50, 255]
      : [255, 255, 255, 255],
) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  return { width, height, data };
}

test("color tracing produces standalone paths without embedded raster or scripts", () => {
  const source = image();
  const snapshot = new Uint8ClampedArray(source.data);
  const result = vectorize(source, { colors: 8 });
  assert.match(result.svg, /viewBox="0 0 64 64"/);
  assert.match(result.svg, /<path /);
  assert.doesNotMatch(result.svg, /<image|<script|data:|href=|NaN|undefined/);
  assert.deepEqual(source.data, snapshot, "input pixels are preserved");
});

test("monochrome and white removal leave only dark visible paths", () => {
  const { svg } = vectorize(image(), {
    mode: "mono",
    removeWhite: true,
    detail: "fine",
  });
  assert.match(svg, /fill="rgb\(0,0,0\)"/);
  assert.doesNotMatch(svg, /fill="rgb\(255,255,255\)"/);
});

test("transparent holes survive as separate subpaths", async () => {
  const ring = image(64, 64, (x, y) => {
    const d = Math.hypot(x - 32, y - 32);
    return d < 25 && d > 12 ? [0, 0, 0, 255] : [0, 0, 0, 0];
  });
  const { svg } = vectorize(ring, { mode: "mono", detail: "fine" });
  assert.ok((svg.match(/M /g) || []).length >= 2);
  await mkdir("test-results/vector-fixtures", { recursive: true });
  await writeFile("test-results/vector-fixtures/ring.svg", svg);
});

test("rejects invalid options, oversized working images, empty and fully removed inputs", () => {
  assert.throws(
    () => vectorize({ width: 2401, height: 1, data: new Uint8Array(9604) }),
    /tamaño/,
  );
  assert.throws(() => vectorize(image(), { colors: 5000 }), /opciones/);
  assert.throws(() => vectorize(image(), { threshold: NaN }), /opciones/);
  assert.throws(
    () =>
      vectorize(
        image(16, 16, () => [255, 255, 255, 255]),
        { removeWhite: true },
      ),
    /vacía/,
  );
  assert.throws(() => vectorize(image(16, 16, () => [0, 0, 0, 0])), /vacía/);
});

test("palette reduction is deterministic for repeat conversions", () => {
  const source = image(80, 80, (x, y) => [
    Math.floor(x / 20) * 80,
    Math.floor(y / 20) * 80,
    70,
    255,
  ]);
  assert.equal(
    vectorize(source, { colors: 8 }).svg,
    vectorize(source, { colors: 8 }).svg,
  );
});

test("keeps a small accent color that spatial grid sampling could miss", () => {
  const source = image(100, 100, (x, y) =>
    x > 40 && x < 47 && y > 40 && y < 60
      ? [240, 180, 20, 255]
      : [20, 60, 30, 255],
  );
  assert.match(
    vectorize(source, { colors: 4 }).svg,
    /fill="rgb\(240,180,20\)"/,
  );
});

test("brand palette preserves exact HEX colors without making opaque pixels transparent", () => {
  const source = image(40, 40, (x, y) =>
    x < 20 ? [255, 255, 255, 255] : [150, 190, 200, 255],
  );
  const result = vectorize(source, {
    palette: "#001122, #112233",
    detail: "fine",
  });
  assert.ok(result.colors.length > 0);
  assert.ok(result.colors.every((c) => ["#001122", "#112233"].includes(c)));
  assert.match(result.svg, /opacity="1"/);
  assert.equal(brandPalette("#AABBCC, #aabbcc").length, 1);
  assert.throws(() => vectorize(source, { palette: "red" }), /HEX/);
});
test("edge background removal keeps enclosed white logo details", async () => {
  const source = image(64, 64, (x, y) =>
    x > 10 && x < 53 && y > 10 && y < 53
      ? x > 25 && x < 38 && y > 25 && y < 38
        ? [255, 255, 255, 255]
        : [20, 60, 30, 255]
      : [255, 255, 255, 255],
  );
  const original = new Uint8ClampedArray(source.data);
  const data = new Uint8ClampedArray(original);
  removeBackground(data, 64, 64, "edge", [255, 255, 255], 20);
  assert.equal(data[3], 0);
  assert.equal(data[(32 * 64 + 32) * 4 + 3], 255);
  const edge = vectorize(source, {
    background: "edge",
    detail: "fine",
    colors: 2,
  });
  const all = vectorize(source, {
    background: "all",
    detail: "fine",
    colors: 2,
  });
  assert.match(edge.svg, /rgb\(255,255,255\)/);
  assert.doesNotMatch(all.svg, /rgb\(255,255,255\)/);
  assert.deepEqual(source.data, original);
  await writeFile("test-results/vector-fixtures/edge.svg", edge.svg);
  await writeFile("test-results/vector-fixtures/all.svg", all.svg);
});
test("high resolution accepts 2400px and rejects invalid advanced controls", () => {
  assert.match(
    vectorize(
      image(2400, 4, () => [10, 20, 30, 255]),
      { detail: "fine", palette: "#0a141e" },
    ).svg,
    /viewBox="0 0 2400 4"/,
  );
  for (const setting of [
    { smoothing: 0 },
    { smoothing: NaN },
    { speckles: -1 },
    { alpha: 0 },
    { background: "unknown" },
    { backgroundTolerance: 101 },
    { corners: "yes" },
    { ink: "broken" },
  ])
    assert.throws(() => vectorize(image(), setting));
});
test("single ink recolors black paths while preserving white and transparent regions", () => {
  const result = vectorize(image(), {
    mode: "mono",
    ink: "#123456",
    removeWhite: true,
    detail: "fine",
  });
  assert.deepEqual(result.colors, ["#123456"]);
  assert.match(result.svg, /rgb\(18,52,86\)/);
});

test("single ink removes threshold-generated white halos, not just pure source white", () => {
  const source = image(32, 32, (x, y) =>
    x > 8 && x < 24 && y > 8 && y < 24
      ? [10, 10, 10, 255]
      : [220, 220, 220, 255],
  );
  const result = vectorize(source, {
    mode: "mono",
    inkOnly: true,
    detail: "fine",
    ink: "#224466",
  });
  assert.deepEqual(result.colors, ["#224466"]);
  assert.doesNotMatch(result.svg, /rgb\(255,255,255\)/);
});


test('automatic palette never assigns opaque pixels to transparency',async()=>{
  const {quantizeCovered}=await import('../src/vector-geometry.js');
  const data=new Uint8ClampedArray([255,255,255,255,0,0,0,0]);
  const result=quantizeCovered(data,2,1,[{r:0,g:0,b:0,a:255},{r:200,g:0,b:0,a:255},{r:255,g:255,b:255,a:0}]);
  assert.notEqual(result.labels[0],result.transparent);assert.equal(result.labels[1],result.transparent);
});
test('small colored regions merge without creating alpha holes or filling real holes',async()=>{
  const {mergeSmallRegions}=await import('../src/vector-geometry.js');
  const labels=new Uint8Array(25).fill(0);labels[12]=1;labels[6]=2;mergeSmallRegions(labels,5,5,2,4);assert.equal(labels[12],0);assert.equal(labels[6],2);
});
