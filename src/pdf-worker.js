import { readPDF, composePDF, splitPDF, imagesToPDF, demoPDF } from './pdf-core.js';
self.onmessage = async ({ data: { id, action, payload } }) => {
  try {
    let result;
    if (action === 'inspect') {
      const doc = await readPDF(payload);
      result = doc.getPages().map(page => ({ width: page.getWidth(), height: page.getHeight(), rotation: page.getRotation().angle }));
    } else if (action === 'compose') result = await composePDF(payload.sources, payload.plan);
    else if (action === 'split') result = await splitPDF(payload.bytes, payload.groups);
    else if (action === 'images') result = await imagesToPDF(payload.images, payload.options);
    else if (action === 'demo') result = await demoPDF();
    else throw new Error('Operación desconocida.');
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error.message || 'No pudimos procesar el documento.' });
  }
};
