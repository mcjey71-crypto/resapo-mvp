import {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees,
  PDFTextField,
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFSignature,
} from "pdf-lib";
import { diffLines } from "diff";
export const LIMITS = {
  imageBytes: 15 * 1024 ** 2,
  pixels: 16e6,
  pdfBytes: 20 * 1024 ** 2,
  pages: 50,
  text: 100000,
  svgBytes: 2 * 1024 ** 2,
};
export function integer(value, min, max, label = "Valor") {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max)
    throw Error(`${label}: usa un entero entre ${min} y ${max}.`);
  return n;
}
export function cleanText(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((x) => x.replace(/[\t \u00a0]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export function textStats(text) {
  return {
    words: (text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length,
    characters: [...text].length,
    lines: text ? text.split(/\r\n?|\n/).length : 0,
  };
}
export function replaceLiteral(text, find, replacement) {
  if (!find) throw Error("Escribe el texto que quieres buscar.");
  const parts = text.split(find);
  if (
    text.length +
      (parts.length - 1) * Math.max(0, replacement.length - find.length) >
    LIMITS.text
  )
    throw Error("El resultado supera 100 000 caracteres.");
  return { text: parts.join(replacement), count: parts.length - 1 };
}
export function compareText(a, b) {
  if (
    a.length + b.length > LIMITS.text ||
    a.split("\n").length + b.split("\n").length > 2000
  )
    throw Error("Compara hasta 100 000 caracteres y 2000 líneas en total.");
  const result = diffLines(a, b, { timeout: 1000, maxEditLength: 2000 });
  if (!result)
    throw Error(
      "Hay demasiadas diferencias. Compara un fragmento más pequeño.",
    );
  return result;
}
export function hexColor(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw Error("Elige un color válido.");
  return rgb(...[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255));
}
export async function loadEditablePDF(data) {
  if (data.byteLength > LIMITS.pdfBytes) throw Error("El PDF supera 20 MB.");
  let doc;
  try {
    doc = await PDFDocument.load(data);
  } catch {
    throw Error("No se pudo abrir el PDF. Usa uno válido y sin contraseña.");
  }
  if (!doc.getPageCount()) throw Error("El PDF no contiene páginas.");
  if (doc.getPageCount() > LIMITS.pages)
    throw Error("Usa un PDF de hasta 50 páginas.");
  const form = doc.getForm();
  if (form.hasXFA())
    throw Error("Los formularios XFA no son compatibles. Usa un PDF AcroForm.");
  if (form.getFields().some((f) => f instanceof PDFSignature))
    throw Error(
      "Este PDF contiene campos de firma digital. Usa una copia sin firmas digitales.",
    );
  return doc;
}
export function fieldsOf(doc) {
  return doc
    .getForm()
    .getFields()
    .map((f) => {
      const base = { name: f.getName(), readonly: f.isReadOnly() };
      if (f instanceof PDFTextField)
        return {
          ...base,
          type: "text",
          value: f.getText() || "",
          max: f.getMaxLength(),
        };
      if (f instanceof PDFCheckBox)
        return { ...base, type: "check", value: f.isChecked() };
      if (
        f instanceof PDFDropdown ||
        f instanceof PDFOptionList ||
        f instanceof PDFRadioGroup
      )
        return {
          ...base,
          type: "choice",
          options: f.getOptions(),
          value: f.getSelected(),
          multiple: !(f instanceof PDFRadioGroup) && f.isMultiselect(),
        };
      return { ...base, type: "unsupported" };
    });
}
export async function fillPDF(doc, values) {
  const form = doc.getForm();
  for (const field of fieldsOf(doc)) {
    if (
      field.readonly ||
      field.type === "unsupported" ||
      !(field.name in values)
    )
      continue;
    const f = form.getField(field.name),
      v = values[field.name];
    if (field.type === "text") f.setText(v);
    else if (field.type === "check") v ? f.check() : f.uncheck();
    else if (v?.length) f.select(f instanceof PDFRadioGroup ? v[0] : v);
    else f.clear();
  }
  const font = await doc.embedFont(StandardFonts.Helvetica);
  try {
    form.updateFieldAppearances(font);
  } catch {
    throw Error(
      "El formulario no admite alguno de esos caracteres. Usa letras latinas sin emojis.",
    );
  }
  return doc.save();
}
export async function stampPDF(
  doc,
  { kind, text = "Re-SAPO", color = "#234638", start = 1, position },
) {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i],
      angle = page.getRotation().angle;
    const viewport = await position(i + 1);
    const value =
      kind === "number" ? `${start + i} / ${start + pages.length - 1}` : text;
    const size =
      kind === "number"
        ? 12
        : Math.min(48, (viewport.width / Math.max(1, value.length)) * 1.4);
    let width;
    try {
      width = font.widthOfTextAtSize(value, size);
    } catch {
      throw Error("Usa letras latinas sin emojis para el texto del PDF.");
    }
    const [x, y] = viewport.convertToPdfPoint(
      (viewport.width - width) / 2,
      kind === "number" ? viewport.height - 22 : viewport.height / 2,
    );
    page.drawText(value, {
      x,
      y,
      size,
      font,
      color: hexColor(color),
      rotate: degrees(angle),
      opacity: kind === "number" ? 1 : 0.22,
    });
  }
  return doc.save();
}
export async function signPDF(
  doc,
  png,
  { pageIndex, x, y, width, height, angle },
) {
  const img = await doc.embedPng(png);
  doc
    .getPage(pageIndex)
    .drawImage(img, { x, y, width, height, rotate: degrees(angle) });
  return doc.save();
}
export function icoFromPNG(png, size) {
  const bytes = new Uint8Array(22 + png.length),
    v = new DataView(bytes.buffer);
  v.setUint16(2, 1, true);
  v.setUint16(4, 1, true);
  bytes[6] = size === 256 ? 0 : size;
  bytes[7] = bytes[6];
  v.setUint16(10, 1, true);
  v.setUint16(12, 32, true);
  v.setUint32(14, png.length, true);
  v.setUint32(18, 22, true);
  bytes.set(png, 22);
  return bytes;
}
