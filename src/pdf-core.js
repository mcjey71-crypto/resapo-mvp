import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';
import { zipSync } from 'fflate';

import { LIMITS } from './pdf-options.js';
export { LIMITS, TOOLS, parsePages, parseGroups, validateFiles } from './pdf-options.js';

export async function readPDF(bytes) {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
    const count = doc.getPageCount();
    if (!count) throw new Error('empty');
    if (count > LIMITS.pages) throw new Error('too-many-pages');
    return doc;
  } catch (error) {
    if (/encrypt/i.test(error.message)) throw new Error('Este PDF está protegido con contraseña. Abre una copia sin protección para continuar.');
    if (error.message === 'too-many-pages') throw new Error(`El límite es de ${LIMITS.pages} páginas por operación.`);
    if (error.message === 'empty') throw new Error('El PDF no contiene páginas.');
    throw new Error('No pudimos leer este PDF. Comprueba que no esté dañado y vuelve a exportarlo si es necesario.');
  }
}

function checkPlan(plan) {
  if (!plan.length) throw new Error('El resultado debe conservar al menos una página.');
  if (plan.length > LIMITS.pages) throw new Error(`El resultado supera las ${LIMITS.pages} páginas.`);
}

export async function composePDF(sources, plan) {
  checkPlan(plan);
  const target = await PDFDocument.create();
  const loaded = new Map();
  for (const item of plan) {
    if (!Number.isInteger(item.source) || !sources[item.source]) throw new Error('Documento de origen inválido.');
    if (!loaded.has(item.source)) {
      const source = await readPDF(sources[item.source]);
      // Page copying does not copy a document's interactive form dictionary.
      // Flatten existing appearances so completed fields remain visible.
      const form = source.getForm();
      if (form.hasXFA()) throw new Error('Este PDF contiene un formulario XFA. Exporta primero una copia plana del documento.');
      if (form.getFields().length) {
        try { form.flatten({ updateFieldAppearances: false }); }
        catch { throw new Error('No pudimos conservar los campos del formulario. Exporta una copia plana y vuelve a intentarlo.'); }
      }
      loaded.set(item.source, source);
    }
    const source = loaded.get(item.source);
    if (!Number.isInteger(item.page) || item.page < 0 || item.page >= source.getPageCount()) throw new Error('Página fuera de rango.');
    const [page] = await target.copyPages(source, [item.page]);
    if (!Number.isFinite(item.rotation || 0) || (item.rotation || 0) % 90) throw new Error('La rotación debe ser de 90, 180 o 270 grados.');
    page.setRotation(degrees(((page.getRotation().angle + (item.rotation || 0)) % 360 + 360) % 360));
    target.addPage(page);
  }
  target.setProducer('Re-SAPO · pdf-lib');
  return target.save();
}

export async function splitPDF(bytes, groups) {
  if (!groups.length || groups.length > LIMITS.pages) throw new Error('Indica al menos un grupo de páginas.');
  if (groups.reduce((n, g) => n + g.length, 0) > LIMITS.pages) throw new Error('Los grupos suman más de 500 páginas.');
  const parts = {};
  for (let i = 0; i < groups.length; i++) {
    parts[`parte-${String(i + 1).padStart(2, '0')}.pdf`] = await composePDF([bytes], groups[i].map(page => ({ source: 0, page })));
  }
  return zipSync(parts, { level: 0 });
}

export async function imagesToPDF(images, { size = 'a4', orientation = 'portrait', margin = 24 } = {}) {
  checkPlan(images);
  if (!['a4', 'original'].includes(size) || !['portrait', 'landscape'].includes(orientation) || ![0, 24].includes(margin)) throw new Error('Opciones de página inválidas.');
  const doc = await PDFDocument.create();
  for (const bytes of images) {
    let image;
    try { image = await doc.embedPng(bytes); }
    catch { try { image = await doc.embedJpg(bytes); } catch { throw new Error('Una imagen no es un JPG o PNG válido.'); } }
    if (image.width * image.height > LIMITS.pixels) throw new Error('Una imagen supera los 25 megapíxeles. Reduce su tamaño antes de convertirla.');
    const bounds = size === 'original' ? [image.width * .75 + 2 * margin, image.height * .75 + 2 * margin] : orientation === 'portrait' ? [595.28, 841.89] : [841.89, 595.28];
    const scale = Math.min((bounds[0] - 2 * margin) / image.width, (bounds[1] - 2 * margin) / image.height);
    const width = image.width * scale, height = image.height * scale;
    const page = doc.addPage(bounds);
    page.drawRectangle({ x: 0, y: 0, width: bounds[0], height: bounds[1], color: rgb(1, 1, 1) });
    page.drawImage(image, { x: (bounds[0] - width) / 2, y: (bounds[1] - height) / 2, width, height });
  }
  doc.setProducer('Re-SAPO · pdf-lib');
  return doc.save();
}

export async function demoPDF() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  ['Tus ideas, en orden.', 'Cada pagina cuenta.', 'Un salto hacia lo importante.'].forEach((text, i) => {
    const page = doc.addPage([595.28, 841.89]);
    page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: rgb(.97, .96, .93) });
    page.drawText('Re-SAPO / Documento de ejemplo', { x: 48, y: 770, size: 13, font, color: rgb(.19, .29, .15) });
    page.drawText(text, { x: 48, y: 650, size: 25, font, color: rgb(.19, .29, .15) });
    page.drawText(`Pagina ${i + 1} de 3`, { x: 48, y: 60, size: 12, font });
  });
  return doc.save();
}
