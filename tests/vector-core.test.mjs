import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { vectorize } from '../src/vector-core.js';

function image(width = 64, height = 64, pixel = (x, y) => x > 12 && x < 51 && y > 12 && y < 51 ? [30, 95, 50, 255] : [255, 255, 255, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  return { width, height, data };
}

test('color tracing produces standalone paths without embedded raster or scripts', () => {
  const source = image();
  const snapshot = new Uint8ClampedArray(source.data);
  const result = vectorize(source, { colors: 8 });
  assert.match(result.svg, /viewBox="0 0 64 64"/);
  assert.match(result.svg, /<path /);
  assert.doesNotMatch(result.svg, /<image|<script|data:|href=|NaN|undefined/);
  assert.deepEqual(source.data, snapshot, 'input pixels are preserved');
});

test('monochrome and white removal leave only dark visible paths', () => {
  const { svg } = vectorize(image(), { mode: 'mono', removeWhite: true, detail: 'fine' });
  assert.match(svg, /fill="rgb\(0,0,0\)"/);
  assert.doesNotMatch(svg, /fill="rgb\(255,255,255\)"/);
});

test('transparent holes survive as separate subpaths', async () => {
  const ring = image(64, 64, (x, y) => {
    const d = Math.hypot(x - 32, y - 32);
    return d < 25 && d > 12 ? [0, 0, 0, 255] : [0, 0, 0, 0];
  });
  const { svg } = vectorize(ring, { mode: 'mono', detail: 'fine' });
  assert.ok((svg.match(/M /g) || []).length >= 2);
  await mkdir('test-results/vector-fixtures', { recursive: true });
  await writeFile('test-results/vector-fixtures/ring.svg', svg);
});

test('rejects invalid options, oversized working images, empty and fully removed inputs', () => {
  assert.throws(() => vectorize({ width: 1201, height: 1, data: new Uint8Array(4804) }), /tamaño/);
  assert.throws(() => vectorize(image(), { colors: 5000 }), /opciones/);
  assert.throws(() => vectorize(image(), { threshold: NaN }), /opciones/);
  assert.throws(() => vectorize(image(16, 16, () => [255, 255, 255, 255]), { removeWhite: true }), /vacía/);
  assert.throws(() => vectorize(image(16, 16, () => [0, 0, 0, 0])), /vacía/);
});

test('palette reduction is deterministic for repeat conversions', () => {
  const source = image(80, 80, (x, y) => [Math.floor(x / 20) * 80, Math.floor(y / 20) * 80, 70, 255]);
  assert.equal(vectorize(source, { colors: 8 }).svg, vectorize(source, { colors: 8 }).svg);
});

test('keeps a small accent color that spatial grid sampling could miss', () => {
  const source = image(100, 100, (x, y) => x > 40 && x < 47 && y > 40 && y < 60
    ? [240, 180, 20, 255] : [20, 60, 30, 255]);
  assert.match(vectorize(source, { colors: 4 }).svg, /fill="rgb\(240,180,20\)"/);
});
