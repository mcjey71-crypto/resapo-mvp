import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";
import {
  cleanText,
  textStats,
  replaceLiteral,
  compareText,
  integer,
  icoFromPNG,
  loadEditablePDF,
  fieldsOf,
  fillPDF,
} from "../src/lab-core.js";
test("text tools preserve accents, treat replacements literally, and bound expansion", () => {
  assert.equal(
    cleanText("  Hola\t Perú  \r\n\n\nAdiós  "),
    "Hola Perú\n\nAdiós",
  );
  assert.deepEqual(textStats("Hola Perú 👋"), {
    words: 2,
    characters: 11,
    lines: 1,
  });
  assert.deepEqual(replaceLiteral("a.b a.b", "a.b", "$&"), {
    text: "$& $&",
    count: 2,
  });
  assert.throws(() => replaceLiteral("a".repeat(100000), "a", "aa"));
  const result = compareText("uno\ndos\n", "uno\ntres\n");
  assert.equal(
    result
      .filter((x) => x.removed)
      .map((x) => x.value)
      .join(""),
    "dos\n",
  );
  assert.equal(
    result
      .filter((x) => x.added)
      .map((x) => x.value)
      .join(""),
    "tres\n",
  );
  assert.throws(() => integer("", 1, 10));
  assert.throws(() => integer(1.2, 1, 10));
  assert.throws(() => compareText("x".repeat(100001), ""));
});
test("ICO header declares correct size and embeds PNG payload", () => {
  const png = new Uint8Array([1, 2, 3]);
  const result = icoFromPNG(png, 256),
    v = new DataView(result.buffer);
  assert.equal(v.getUint16(2, true), 1);
  assert.equal(result[6], 0);
  assert.equal(v.getUint32(18, true), 22);
  assert.deepEqual(result.slice(22), png);
});
test("AcroForm filling retains fields and accepts text, checkbox and choice", async () => {
  const doc = await PDFDocument.create(),
    page = doc.addPage();
  const f = doc.getForm();
  f.createTextField("Nombre").addToPage(page);
  f.createCheckBox("Acepto").addToPage(page);
  const d = f.createDropdown("Tema");
  d.addOptions(["Uno", "Dos"]);
  d.addToPage(page);
  assert.equal(fieldsOf(doc).length, 3);
  const out = await PDFDocument.load(
    await fillPDF(doc, { Nombre: "José", Acepto: true, Tema: ["Dos"] }),
  );
  assert.equal(out.getForm().getTextField("Nombre").getText(), "José");
  assert(out.getForm().getCheckBox("Acepto").isChecked());
  assert.deepEqual(out.getForm().getDropdown("Tema").getSelected(), ["Dos"]);
});
test("PDF bounds, encrypted and invalid documents rejected", async () => {
  await assert.rejects(loadEditablePDF(new Uint8Array([1, 2, 3])));
  await assert.rejects(
    loadEditablePDF(await readFile("tests/fixtures/encrypted.pdf")),
  );
  const big = await PDFDocument.create();
  for (let i = 0; i < 51; i++) big.addPage();
  await assert.rejects(loadEditablePDF(await big.save()), /50 páginas/);
});

test("radio groups receive a single selected option and can be cleared", async () => {
  const doc = await PDFDocument.create(),
    page = doc.addPage();
  const radio = doc.getForm().createRadioGroup("Opcion");
  radio.addOptionToPage("A", page);
  radio.addOptionToPage("B", page);
  let out = await PDFDocument.load(await fillPDF(doc, { Opcion: ["B"] }));
  assert.equal(out.getForm().getRadioGroup("Opcion").getSelected(), "B");
  out = await PDFDocument.load(await fillPDF(out, { Opcion: [] }));
  assert.equal(out.getForm().getRadioGroup("Opcion").getSelected(), undefined);
});
