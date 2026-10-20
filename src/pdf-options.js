export const LIMITS = Object.freeze({ bytes: 50 * 1024 * 1024, totalBytes: 100 * 1024 * 1024, files: 20, pages: 500, pixels: 25_000_000 });
export const TOOLS = {
  merge: { title: 'Unir PDF', label: 'Unir documentos', description: 'Varios documentos, un solo archivo. Elige el orden y reúne todas tus páginas.', multiple: true },
  extract: { title: 'Extraer páginas', label: 'Extraer páginas', description: 'Quédate con lo importante. Selecciona las páginas que quieres guardar en otro PDF.' },
  split: { title: 'Dividir PDF', label: 'Dividir documento', description: 'Separa tu documento por rangos y descarga todos los archivos en un ZIP.' },
  remove: { title: 'Eliminar páginas', label: 'Eliminar páginas', description: 'Quita las páginas que sobran y guarda una copia de tu documento.' },
  organize: { title: 'Ordenar y girar', label: 'Guardar cambios', description: 'Pon cada página en su lugar y corrige su orientación antes de guardar.' },
  images: { title: 'Imágenes a PDF', label: 'Crear PDF', description: 'Convierte fotos y apuntes en un documento. Una imagen por página, en el orden que elijas.', multiple: true },
};

export function parsePages(input, count, { allowEmpty = false } = {}) {
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('El documento no contiene páginas.');
  if (!String(input).trim()) {
    if (allowEmpty) return Array.from({ length: count }, (_, i) => i);
    throw new Error('Indica las páginas, por ejemplo: 1-3, 5.');
  }
  const result = [];
  const seen = new Set();
  for (const part of String(input).split(',')) {
    const match = part.trim().match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!match) throw new Error('Usa números y rangos separados por comas, por ejemplo: 1-3, 5.');
    const from = Number(match[1]), to = Number(match[2] || match[1]);
    if (from < 1 || to > count || from > to || !Number.isSafeInteger(from) || !Number.isSafeInteger(to)) {
      throw new Error(`Usa páginas entre 1 y ${count}, con rangos de menor a mayor.`);
    }
    for (let n = from; n <= to; n++) {
      if (seen.has(n)) throw new Error(`La página ${n} está repetida. Inclúyela una sola vez.`);
      seen.add(n);
      result.push(n - 1);
    }
  }
  return result;
}

export function parseGroups(input, count) {
  if (!String(input).trim()) throw new Error('Indica los grupos, por ejemplo: 1-3; 4-6.');
  return String(input).split(';').map(part => parsePages(part, count));
}

export function validateFiles(existing, incoming, tool) {
  const list = [...existing, ...incoming];
  if (!list.length) throw new Error('Elige al menos un archivo.');
  if (list.length > LIMITS.files) throw new Error(`Puedes trabajar con hasta ${LIMITS.files} archivos a la vez.`);
  if (!TOOLS[tool]?.multiple && list.length > 1) throw new Error('Esta herramienta trabaja con un PDF a la vez. Quita el actual para cambiarlo.');
  let bytes = 0;
  for (const file of list) {
    if (!file.size) throw new Error(`«${file.name}» está vacío.`);
    if (file.size > LIMITS.bytes) throw new Error(`«${file.name}» supera el límite de 50 MB.`);
    bytes += file.size;
    if (tool === 'images' ? !/\.(png|jpe?g)$/i.test(file.name) : !/\.pdf$/i.test(file.name)) {
      throw new Error(tool === 'images' ? 'Elige imágenes JPG o PNG. Otros formatos todavía no están disponibles.' : 'Elige archivos con extensión .pdf.');
    }
  }
  if (bytes > LIMITS.totalBytes) throw new Error('El total de archivos supera los 100 MB. Trabaja en grupos más pequeños.');
}
