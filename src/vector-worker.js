import { vectorize } from './vector-core.js';
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ ok: true, ...vectorize(data.image, data.settings) });
  } catch (error) {
    self.postMessage({ ok: false, message: error.message || 'No se pudo vectorizar esta imagen.' });
  }
};
