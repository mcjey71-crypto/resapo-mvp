import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { PDFDocument, degrees, StandardFonts } from 'pdf-lib';
import { unzipSync } from 'fflate';
import { parsePages, parseGroups, validateFiles, readPDF, composePDF, splitPDF, imagesToPDF, LIMITS } from '../src/pdf-core.js';

async function fixture(prefix, count) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < count; i++) {
    const page = doc.addPage([200 + i * 10, 300 + i * 10]);
    page.drawText(`${prefix}${i + 1}`, { x: 25, y: 100, size: 24, font });
    if (i === 1) page.setRotation(degrees(90));
  }
  return doc.save();
}
const a = await fixture('A', 3), b = await fixture('B', 2);
await mkdir('test-results/pdf-fixtures', { recursive: true });
await writeFile('test-results/pdf-fixtures/a.pdf', a);
await writeFile('test-results/pdf-fixtures/b.pdf', b);
const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7ioAAAAASUVORK5CYII=', 'base64'));
await writeFile('test-results/pdf-fixtures/image.png', png);

test('ranges use one-based pages, preserve requested order and trim spaces', () => {
  assert.deepEqual(parsePages('3, 1-2', 3), [2, 0, 1]);
  assert.deepEqual(parsePages(' 1 - 2 , 3 ', 3), [0, 1, 2]);
});
test('ranges reject empty, malformed, out-of-bounds, descending and duplicate entries', () => {
  for (const value of ['', '0', '-1', '1.5', '1,', '1-4', '3-2', '1,1', '1-2,2', '1e2', '99999999999999999']) assert.throws(() => parsePages(value, 3));
});
test('split groups preserve order and require valid nonempty groups', () => {
  assert.deepEqual(parseGroups('1-2; 3', 3), [[0, 1], [2]]);
  assert.throws(() => parseGroups('1;', 3));
  assert.throws(() => parseGroups('', 3));
});
test('file validation enforces types, counts, sizes and total bytes', () => {
  assert.doesNotThrow(() => validateFiles([], [{name:'A.PDF',size:10}], 'merge'));
  assert.throws(() => validateFiles([], [{name:'A.txt',size:10}], 'merge'));
  assert.throws(() => validateFiles([], [{name:'A.pdf',size:0}], 'merge'));
  assert.throws(() => validateFiles([], [{name:'A.pdf',size:LIMITS.bytes+1}], 'merge'));
  assert.throws(() => validateFiles([], Array.from({length:21}, () => ({name:'A.pdf',size:1})), 'merge'));
  assert.throws(() => validateFiles([], Array.from({length:3}, () => ({name:'A.pdf',size:LIMITS.bytes})), 'merge'));
  assert.throws(() => validateFiles([{name:'A.pdf',size:1}], [{name:'B.pdf',size:1}], 'extract'));
  assert.doesNotThrow(() => validateFiles([], [{name:'a.jpg',size:1},{name:'b.png',size:1}], 'images'));
  assert.throws(() => validateFiles([], [{name:'a.webp',size:1}], 'images'));
});
test('corrupt, empty and encrypted PDFs have readable errors', async () => {
  await assert.rejects(readPDF(new Uint8Array([1,2,3])), /No pudimos leer/);
  const empty = await PDFDocument.create();
  await assert.rejects(readPDF(await empty.save({addDefaultPage:false})), /no contiene páginas/);
  const encrypted = new Uint8Array(await readFile('tests/fixtures/encrypted.pdf'));
  await assert.rejects(readPDF(encrypted), /contraseña/);
});
test('merge preserves page order, dimensions and original rotations', async () => {
  const bytes = await composePDF([b, a], [0,1].map(page=>({source:0,page})).concat([0,1,2].map(page=>({source:1,page}))));
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(),5);
  assert.deepEqual(doc.getPages().map(p=>p.getWidth()),[200,210,200,210,220]);
  assert.deepEqual(doc.getPages().map(p=>p.getRotation().angle),[0,90,0,90,0]);
  await writeFile('test-results/pdf-fixtures/merged.pdf',bytes);
});
test('extract and remove produce exactly the requested pages', async () => {
  const extracted = await composePDF([a],parsePages('3,1',3).map(page=>({source:0,page})));
  assert.deepEqual((await PDFDocument.load(extracted)).getPages().map(p=>p.getWidth()),[220,200]);
  const removed = new Set(parsePages('2',3));
  const kept = [0,1,2].filter(i=>!removed.has(i));
  const deleted = await composePDF([a],kept.map(page=>({source:0,page})));
  assert.deepEqual((await PDFDocument.load(deleted)).getPages().map(p=>p.getWidth()),[200,220]);
  await writeFile('test-results/pdf-fixtures/extracted.pdf',extracted);
  await writeFile('test-results/pdf-fixtures/removed.pdf',deleted);
});
test('organize applies rotation relative to the original and keeps reordered content', async () => {
  const bytes=await composePDF([a],[{source:0,page:1,rotation:90},{source:0,page:0,rotation:270}]);
  const doc=await PDFDocument.load(bytes);
  assert.deepEqual(doc.getPages().map(p=>p.getRotation().angle),[180,270]);
  assert.deepEqual(doc.getPages().map(p=>p.getWidth()),[210,200]);
  await writeFile('test-results/pdf-fixtures/organized.pdf',bytes);
});
test('compose rejects an empty output, invalid pages, excessive pages and invalid rotations', async () => {
  await assert.rejects(composePDF([a],[]),/al menos una/);
  await assert.rejects(composePDF([a],[{source:0,page:3}]),/fuera de rango/);
  await assert.rejects(composePDF([a],[{source:4,page:0}]),/origen inválido/);
  await assert.rejects(composePDF([a],[{source:0,page:0,rotation:45}]),/rotación/);
  await assert.rejects(composePDF([a],Array.from({length:501},()=>({source:0,page:0}))),/supera/);
});
test('split produces a ZIP with individually readable PDFs and the chosen groups',async()=>{
  const archive=unzipSync(await splitPDF(a,parseGroups('1-2;3',3)));
  assert.deepEqual(Object.keys(archive),['parte-01.pdf','parte-02.pdf']);
  assert.equal((await PDFDocument.load(archive['parte-01.pdf'])).getPageCount(),2);
  assert.equal((await PDFDocument.load(archive['parte-02.pdf'])).getPageCount(),1);
  await writeFile('test-results/pdf-fixtures/split-01.pdf',archive['parte-01.pdf']);
  await writeFile('test-results/pdf-fixtures/split-02.pdf',archive['parte-02.pdf']);
});
test('images create one A4 page per image, with chosen orientation',async()=>{
  const bytes=await imagesToPDF([png,png],{size:'a4',orientation:'landscape',margin:0});
  const doc=await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(),2);
  assert.deepEqual(doc.getPage(0).getSize(),{width:841.89,height:595.28});
  await writeFile('test-results/pdf-fixtures/images.pdf',bytes);
});
test('image sizing preserves aspect and rejects invalid formats and options',async()=>{
  const doc=await PDFDocument.load(await imagesToPDF([png],{size:'original',orientation:'portrait',margin:24}));
  assert.deepEqual(doc.getPage(0).getSize(),{width:48.75,height:48.75});
  await assert.rejects(imagesToPDF([new Uint8Array([1,2,3])]),/no es un JPG o PNG/);
  await assert.rejects(imagesToPDF([png],{margin:-1}),/Opciones/);
});
test('filled forms retain their visible appearance as flat page content',async()=>{
  const doc=await PDFDocument.create();const page=doc.addPage();
  const text=doc.getForm().createTextField('student');text.setText('Re-SAPO');text.addToPage(page);
  const bytes=await composePDF([await doc.save()],[{source:0,page:0}]);
  const result=await PDFDocument.load(bytes);
  assert.equal(result.getForm().getFields().length,0);
  await writeFile('test-results/pdf-fixtures/form.pdf',bytes);
});
