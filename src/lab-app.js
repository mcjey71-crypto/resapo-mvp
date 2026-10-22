import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  getDocument,
  GlobalWorkerOptions,
  OPS,
  ImageKind,
} from "pdfjs-dist/build/pdf.mjs";
import {
  LIMITS,
  integer,
  cleanText,
  textStats,
  replaceLiteral,
  compareText,
  loadEditablePDF,
  fieldsOf,
  fillPDF,
  stampPDF,
  signPDF,
  icoFromPNG,
} from "./lab-core.js";
import { parseSVG, svgColors, serializeSVG } from "./lab-svg.js";
import { catalog } from "./lab-catalog.js";
const $ = (id) => document.getElementById(id),
  el = (tag, text) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    return n;
  };
const workerURL = URL.createObjectURL(
  new Blob([__LAB_PDF_WORKER__], { type: "text/javascript" }),
);
GlobalWorkerOptions.workerSrc = workerURL;
let tool = catalog[0],
  step = 0,
  source = null,
  pdf = null,
  pdfBytes = null,
  bitmap = null,
  svg = null,
  colors = null,
  epoch = 0,
  previewGeneration = 0,
  busy = false,
  urls = [],
  previewURL = null,
  signatureDrawn = false,
  renderTask = null,
  loadingTask = null;
const value = (id) => $(id)?.value,
  num = (id, min, max) =>
    integer(value(id), min, max, $(id)?.labels?.[0]?.textContent);
function status(text, error = false) {
  $("lab-status").textContent = text;
  $("lab-status").dataset.error = error;
}
function clearResult() {
  urls.forEach(URL.revokeObjectURL);
  urls = [];
  $("lab-result").replaceChildren();
}
function makeURL(blob) {
  const url = URL.createObjectURL(blob);
  urls.push(url);
  return url;
}
function download(data, name, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = el("a", `Descargar ${name}`);
  a.href = makeURL(blob);
  a.download = name;
  a.className = "lab-download";
  $("lab-result").append(a);
  return blob;
}
function stem() {
  return (source?.name || "archivo").replace(/\.[^.]+$/, "").slice(0, 80);
}
function lock(on) {
  busy = on;
  document
    .querySelectorAll(
      "#lab-file,#lab-tool,#lab-groups button,#lab-options input,#lab-options select,#lab-options textarea,#lab-sample,#lab-run,#lab-reset",
    )
    .forEach((n) => {
      n.disabled = on || n.dataset.readonly === "true";
    });
  $("lab-cancel").hidden = !on;
  $("lab-run").disabled = on || (!source && tool.group !== "Texto");
  document.querySelector(".lab-editor").setAttribute("aria-busy", String(on));
}
function invalidate() {
  clearResult();
  status("");
}
function input(
  id,
  label,
  type = "number",
  initial = "",
  min,
  max,
  parent = $("lab-options"),
) {
  const l = el("label", label);
  l.htmlFor = id;
  const n = el(type === "textarea" ? "textarea" : "input");
  n.id = id;
  if (type !== "textarea") n.type = type;
  n.value = initial;
  if (min !== undefined) n.min = min;
  if (max !== undefined) n.max = max;
  if (type === "text" || type === "textarea")
    n.maxLength = type === "textarea" ? LIMITS.text : 200;
  parent.append(l, n);
  n.addEventListener("input", invalidate);
  return n;
}
function select(id, label, entries, parent = $("lab-options")) {
  const l = el("label", label);
  l.htmlFor = id;
  const n = el("select");
  n.id = id;
  for (const [v, t] of entries) {
    const o = el("option", t);
    o.value = v;
    n.append(o);
  }
  parent.append(l, n);
  n.addEventListener("change", invalidate);
  return n;
}
function note(text) {
  const n = el("p", text);
  n.className = "lab-note";
  $("lab-options").append(n);
}
function canvas(w, h) {
  const c = el("canvas");
  c.width = w;
  c.height = h;
  return c;
}
function toBlob(c, type = "image/png", quality) {
  return new Promise((resolve, reject) =>
    c.toBlob(
      (b) =>
        b
          ? resolve(b)
          : reject(
              Error("No se pudo crear la imagen. Reduce sus dimensiones."),
            ),
      type,
      quality,
    ),
  );
}
function previewImage(blob) {
  if (previewURL) URL.revokeObjectURL(previewURL);
  previewURL = URL.createObjectURL(blob);
  const img = el("img");
  img.src = previewURL;
  img.alt = "Vista previa del resultado";
  $("lab-preview").replaceChildren(img);
}
function showGuide() {
  $("guide-title").textContent = tool.name;
  $("guide-what").textContent = tool.what;
  $("guide-pain").textContent = tool.pain;
  $("guide-step").textContent = tool.steps[step];
  $("guide-count").textContent = `PASO ${step + 1} DE 3`;
  $("guide-prev").disabled = step === 0;
  $("guide-next").disabled = step === 2;
}
function reset() {
  epoch++;
  renderTask?.cancel();
  loadingTask?.destroy().catch(() => {});
  loadingTask = null;
  pdf = null;
  pdfBytes = null;
  bitmap?.close();
  bitmap = null;
  source = null;
  svg = null;
  colors = null;
  signatureDrawn = false;
  clearResult();
  if (previewURL) URL.revokeObjectURL(previewURL);
  previewURL = null;
  $("lab-file").value = "";
  $("lab-preview").replaceChildren(el("p", "Tu archivo aparecerá aquí."));
  status("");
  options();
  lock(false);
}
function choose(id) {
  tool = catalog.find((t) => t.id === id) || catalog[0];
  step = 0;
  $("lab-tool").value = tool.id;
  reset();
  showGuide();
  $("lab-title").textContent = tool.name;
  const text = tool.group === "Texto";
  $("lab-file").hidden = text;
  $("file-label").hidden = text;
  $("lab-file").accept =
    tool.group === "Imágenes"
      ? ".png,.jpg,.jpeg,.webp"
      : tool.id === "svg"
        ? ".svg"
        : ".pdf";
  $("lab-limit").textContent = text
    ? "Hasta 100 000 caracteres. No se envía el texto a ningún servidor."
    : tool.group === "Imágenes"
      ? "PNG, JPG o WebP · hasta 15 MB y 16 megapíxeles. Se exporta una imagen estática, sin conservar metadatos."
      : tool.id === "svg"
        ? "SVG estático · hasta 2 MB y 64 colores. No admite scripts, CSS global ni imágenes incrustadas."
        : "PDF sin contraseña · hasta 20 MB y 50 páginas. No admite XFA ni campos de firma digital. Revisa siempre la copia descargada.";
}
function group(name) {
  $("lab-tool").replaceChildren();
  for (const t of catalog.filter((t) => t.group === name)) {
    const o = el("option", t.name);
    o.value = t.id;
    $("lab-tool").append(o);
  }
  for (const b of $("lab-groups").children)
    b.setAttribute("aria-pressed", String(b.textContent === name));
  choose($("lab-tool").value);
}
for (const name of new Set(catalog.map((t) => t.group))) {
  const b = el("button", name);
  b.type = "button";
  b.onclick = () => group(name);
  $("lab-groups").append(b);
}
$("lab-tool").onchange = () => choose(value("lab-tool"));
$("guide-prev").onclick = () => {
  step--;
  showGuide();
};
$("guide-next").onclick = () => {
  step++;
  showGuide();
};
$("lab-reset").onclick = reset;
$("lab-cancel").onclick = () => {
  reset();
  status("Operación cancelada. Puedes elegir otro archivo.");
};
function options() {
  const box = $("lab-options");
  box.replaceChildren();
  const w = bitmap?.width || 800,
    h = bitmap?.height || 600;
  if (tool.id === "resize") {
    const width = input("width", "Ancho (px)", "number", w, 1, 8000),
      height = input("height", "Alto (px)", "number", h, 1, 8000),
      keep = input("keep", "Conservar proporción", "checkbox");
    keep.checked = true;
    width.addEventListener("input", () => {
      if (keep.checked)
        height.value = Math.max(1, Math.round((Number(width.value) * h) / w));
    });
    height.addEventListener("input", () => {
      if (keep.checked)
        width.value = Math.max(1, Math.round((Number(height.value) * w) / h));
    });
  }
  if (tool.id === "crop") {
    input("left", "Inicio desde la izquierda (px)", "number", 0, 0, w - 1);
    input("top", "Inicio desde arriba (px)", "number", 0, 0, h - 1);
    input("width", "Ancho del recorte (px)", "number", w, 1, w);
    input("height", "Alto del recorte (px)", "number", h, 1, h);
  }
  if (tool.id === "rotate")
    select("angle", "Giro hacia la derecha", [
      [90, "90°"],
      [180, "180°"],
      [270, "270°"],
    ]);
  if (tool.id === "compress") {
    select("format", "Formato de salida", [
      ["image/webp", "WebP"],
      ["image/jpeg", "JPG (fondo blanco)"],
    ]);
    input("quality", "Calidad (%)", "number", 80, 10, 100);
    note(
      "Una copia comprimida puede pesar más si el original ya está optimizado. Te mostraremos ambos tamaños.",
    );
  }
  if (tool.id === "imageText") {
    input("caption", "Texto o marca de agua", "text", "Re-SAPO");
    input("color", "Color", "color", "#234638");
    input(
      "fontSize",
      "Tamaño de letra (px)",
      "number",
      Math.max(12, Math.round(w / 15)),
      8,
      1000,
    );
    input("opacity", "Opacidad (%)", "number", 70, 5, 100);
    input("posX", "Posición horizontal del centro (%)", "number", 50, 0, 100);
    input("posY", "Posición vertical del centro (%)", "number", 50, 0, 100);
  }
  if (tool.id === "favicon") {
    select("size", "Tamaño (px)", [
      [32, "32 × 32"],
      [48, "48 × 48"],
      [64, "64 × 64"],
      [128, "128 × 128"],
      [256, "256 × 256"],
    ]);
    select("format", "Formato", [
      ["ico", "ICO"],
      ["png", "PNG"],
    ]);
  }
  if (tool.id === "number")
    input("start", "Número inicial", "number", 1, 1, 9999);
  if (tool.id === "watermark") {
    input("caption", "Texto de la marca", "text", "BORRADOR");
    input("color", "Color", "color", "#234638");
  }
  if (tool.id === "signature") {
    input("page", "Página", "number", 1, 1, pdf?.numPages || 1);
    input("posX", "Distancia desde la izquierda (%)", "number", 55, 0, 90);
    input("posY", "Distancia desde arriba (%)", "number", 75, 0, 95);
    input("signWidth", "Ancho de la firma (% de página)", "number", 30, 5, 90);
    const l = el("label", "Dibuja tu firma aquí");
    const pad = canvas(600, 200);
    pad.id = "signature";
    pad.className = "lab-signature";
    pad.setAttribute(
      "aria-label",
      "Área para dibujar la firma con ratón o pantalla táctil",
    );
    box.append(l, pad);
    const ctx = pad.getContext("2d");
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#18372c";
    let drawing = false;
    function point(e) {
      const r = pad.getBoundingClientRect();
      return [
        ((e.clientX - r.left) * pad.width) / r.width,
        ((e.clientY - r.top) * pad.height) / r.height,
      ];
    }
    pad.onpointerdown = (e) => {
      if (busy) return;
      e.preventDefault();
      pad.setPointerCapture(e.pointerId);
      drawing = true;
      ctx.beginPath();
      ctx.moveTo(...point(e));
    };
    pad.onpointermove = (e) => {
      if (!drawing || busy) return;
      ctx.lineTo(...point(e));
      ctx.stroke();
      signatureDrawn = true;
      invalidate();
      updateSignature();
    };
    pad.onpointerup = pad.onpointercancel = () => (drawing = false);
    const clear = el("button", "Borrar firma");
    clear.type = "button";
    clear.className = "secondary";
    clear.onclick = () => {
      if (busy) return;
      ctx.clearRect(0, 0, 600, 200);
      signatureDrawn = false;
      invalidate();
      updateSignature();
    };
    box.append(clear);
    note(
      "Firma visual dibujada: no certifica identidad ni equivale a una firma digital. También puedes subir una firma PNG transparente.",
    );
    const up = input("signature-file", "O subir firma PNG", "file");
    up.accept = ".png";
    up.onchange = async () => {
      try {
        if (!up.files[0]) return;
        if (up.files[0].size > 2 * 1024 ** 2)
          throw Error("La firma debe pesar menos de 2 MB.");
        const token = epoch,
          b = await createImageBitmap(up.files[0]);
        if (token !== epoch) {
          b.close();
          return;
        }
        ctx.clearRect(0, 0, 600, 200);
        const ratio = Math.min(600 / b.width, 200 / b.height);
        ctx.drawImage(
          b,
          (600 - b.width * ratio) / 2,
          (200 - b.height * ratio) / 2,
          b.width * ratio,
          b.height * ratio,
        );
        b.close();
        signatureDrawn = true;
        invalidate();
        updateSignature();
      } catch (e) {
        status(e.message, true);
      }
    };
    for (const id of ["posX", "posY", "signWidth"])
      $(id).addEventListener("input", updateSignature);
    $("page").addEventListener("change", () =>
      renderPage().catch((e) => status(e.message, true)),
    );
  }
  if (tool.group === "Texto") {
    input("text", "Texto original", "textarea");
    if (tool.id === "compare") input("text2", "Nueva versión", "textarea");
    if (tool.id === "replace") {
      input("find", "Buscar (coincidencia exacta)", "text");
      input("replacement", "Reemplazar por", "text");
    }
    note("Puedes pegar texto directamente; no necesitas subir un archivo.");
  }
}
async function renderPage() {
  if (!pdf) return;
  const token = epoch;
  const previewToken = ++previewGeneration;
  renderTask?.cancel();
  const p = await pdf.getPage(
    tool.id === "signature" ? num("page", 1, pdf.numPages) : 1,
  );
  if (token !== epoch || previewToken !== previewGeneration) return;
  const base = p.getViewport({ scale: 1 }),
    v = p.getViewport({ scale: Math.min(1.5, 600 / base.width) });
  if (v.width * v.height > 4e6)
    throw Error("Esta página es demasiado grande para la vista previa.");
  const c = canvas(Math.round(v.width), Math.round(v.height));
  renderTask = p.render({ canvasContext: c.getContext("2d"), viewport: v });
  try {
    await renderTask.promise;
  } catch (e) {
    if (e.name === "RenderingCancelledException") return;
    throw e;
  }
  if (token !== epoch || previewToken !== previewGeneration) return;
  const wrap = el("div");
  wrap.className = "page-wrap";
  wrap.append(c);
  $("lab-preview").replaceChildren(wrap);
  if (tool.id === "signature") {
    const img = el("img");
    img.id = "signature-overlay";
    img.alt = "Posición de la firma";
    wrap.append(img);
    updateSignature();
  }
}
function updateSignature() {
  const img = $("signature-overlay");
  if (!img) return;
  img.src = $("signature").toDataURL();
  img.style.left = `${value("posX")}%`;
  img.style.top = `${value("posY")}%`;
  img.style.width = `${value("signWidth")}%`;
}
async function load(file) {
  reset();
  if (!file) return;
  const token = epoch;
  lock(true);
  status("Abriendo archivo…");
  try {
    if (tool.group === "Imágenes") {
      if (
        !/\.(png|jpe?g|webp)$/i.test(file.name) ||
        file.size > LIMITS.imageBytes ||
        !file.size
      )
        throw Error("Elige un PNG, JPG o WebP de hasta 15 MB.");
      const b = await createImageBitmap(file);
      if (token !== epoch) {
        b.close();
        return;
      }
      if (b.width * b.height > LIMITS.pixels) {
        b.close();
        throw Error("La imagen supera 16 megapíxeles.");
      }
      bitmap = b;
      source = file;
      options();
      previewImage(file);
    } else if (tool.id === "svg") {
      if (file.size > LIMITS.svgBytes) throw Error("El SVG supera 2 MB.");
      const text = await file.text();
      if (token !== epoch) return;
      svg = parseSVG(text);
      colors = svgColors(svg);
      source = file;
      options();
      let i = 0;
      for (const [color, refs] of colors) {
        const c = canvas(1, 1).getContext("2d");
        c.fillStyle = color;
        const picker = input(
          `svg-color-${i++}`,
          `Color ${i}: ${color}`,
          "color",
          c.fillStyle,
        );
        picker.oninput = () => {
          invalidate();
          refs.forEach(([el, attr]) => el.setAttribute(attr, picker.value));
          previewImage(
            new Blob([serializeSVG(svg)], { type: "image/svg+xml" }),
          );
        };
      }
      previewImage(new Blob([serializeSVG(svg)], { type: "image/svg+xml" }));
    } else {
      if (
        !/\.pdf$/i.test(file.name) ||
        file.size > LIMITS.pdfBytes ||
        !file.size
      )
        throw Error("Elige un PDF de hasta 20 MB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const editable = await loadEditablePDF(bytes);
      if (token !== epoch) return;
      loadingTask = getDocument({
        data: bytes.slice(),
        isEvalSupported: false,
        useSystemFonts: true,
        useWasm: false,
        isOffscreenCanvasSupported: false,
        maxImageSize: LIMITS.pixels,
        stopAtErrors: true,
      });
      const p = await loadingTask.promise;
      if (token !== epoch) {
        p.loadingTask.destroy().catch(() => {});
        return;
      }
      pdf = p;
      pdfBytes = bytes;
      source = file;
      options();
      if (tool.id === "forms") {
        const fields = fieldsOf(editable);
        if (!fields.length)
          note(
            "Este PDF no tiene campos interactivos. Un escaneo o un espacio en blanco no es un formulario rellenable.",
          );
        fields.forEach((f, i) => {
          let control;
          if (f.type === "unsupported") {
            note(`Campo no editable: ${f.name}`);
            return;
          }
          if (f.type === "choice") {
            control = select(`field-${i}`, f.name, [
              ...(!f.multiple ? [["", "Sin selección"]] : []),
              ...f.options.map((o) => [o, o]),
            ]);
            control.multiple = f.multiple;
            for (const o of control.options)
              o.selected = (
                Array.isArray(f.value) ? f.value : [f.value]
              ).includes(o.value);
          } else {
            control = input(
              `field-${i}`,
              f.name,
              f.type === "check" ? "checkbox" : "text",
              f.type === "text" ? f.value : "",
            );
            if (f.type === "check") control.checked = f.value;
            else control.maxLength = f.max ?? 5000;
          }
          control.dataset.field = f.name;
          control.dataset.fieldtype = f.type;
          control.dataset.readonly = String(f.readonly);
        });
      }
      await renderPage();
    }
    if (token === epoch)
      status(
        `Listo: ${file.name}${bitmap ? ` · ${bitmap.width} × ${bitmap.height} px` : ""}`,
      );
  } catch (e) {
    if (token === epoch) {
      source = null;
      status(e.message || "No se pudo abrir el archivo.", true);
    }
  } finally {
    if (token === epoch) lock(false);
  }
}
$("lab-file").onchange = (e) => load(e.target.files[0]);
async function imageResult(token) {
  let w = bitmap.width,
    h = bitmap.height,
    c,
    ctx;
  let type = "image/png",
    quality;
  if (tool.id === "palette") {
    const sample = canvas(120, 120),
      s = sample.getContext("2d", { willReadFrequently: true });
    s.drawImage(bitmap, 0, 0, 120, 120);
    const data = s.getImageData(0, 0, 120, 120).data,
      map = new Map();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const key = [data[i], data[i + 1], data[i + 2]]
        .map((v) => Math.round(v / 32) * 32)
        .map((v) => Math.min(255, v))
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");
      map.set(key, (map.get(key) || 0) + 1);
    }
    const palette = [...map]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([h]) => "#" + h);
    if (!palette.length)
      throw Error(
        "La imagen es transparente; no hay colores visibles que extraer.",
      );
    for (const hex of palette) {
      const b = el("button", hex);
      b.type = "button";
      b.className = "lab-swatch";
      const swatch = el("i");
      swatch.style.background = hex;
      b.prepend(swatch);
      b.onclick = async () => {
        try {
          await navigator.clipboard.writeText(hex);
          status(`Color copiado: ${hex}`);
        } catch {
          status(`Copia este código: ${hex}`);
        }
      };
      $("lab-result").append(b);
    }
    download(
      palette.join("\n"),
      `${stem()}-paleta.txt`,
      "text/plain;charset=utf-8",
    );
    return;
  }
  if (tool.id === "resize" || tool.id === "crop") {
    w = num("width", 1, 8000);
    h = num("height", 1, 8000);
  }
  if (tool.id === "rotate" && num("angle", 90, 270) % 180) [w, h] = [h, w];
  if (tool.id === "favicon") w = h = num("size", 16, 256);
  if (w * h > LIMITS.pixels)
    throw Error("El resultado no puede superar 16 megapíxeles.");
  c = canvas(w, h);
  ctx = c.getContext("2d");
  if (tool.id === "compress") {
    type = value("format");
    quality = num("quality", 10, 100) / 100;
    if (type === "image/jpeg") {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, w, h);
    }
  }
  if (tool.id === "crop") {
    const x = num("left", 0, bitmap.width - 1),
      y = num("top", 0, bitmap.height - 1);
    if (x + w > bitmap.width || y + h > bitmap.height)
      throw Error(
        "El recorte sale de la imagen. Reduce su tamaño o mueve el inicio.",
      );
    ctx.drawImage(bitmap, x, y, w, h, 0, 0, w, h);
  } else if (tool.id === "rotate") {
    ctx.translate(w / 2, h / 2);
    ctx.rotate((num("angle", 90, 270) * Math.PI) / 180);
    ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  } else if (tool.id === "favicon") {
    const scale = Math.min(w / bitmap.width, h / bitmap.height);
    ctx.drawImage(
      bitmap,
      (w - bitmap.width * scale) / 2,
      (h - bitmap.height * scale) / 2,
      bitmap.width * scale,
      bitmap.height * scale,
    );
  } else ctx.drawImage(bitmap, 0, 0, w, h);
  if (tool.id === "imageText") {
    const text = value("caption");
    if (!text.trim()) throw Error("Escribe el texto que deseas añadir.");
    ctx.font = `${num("fontSize", 8, 1000)}px sans-serif`;
    ctx.fillStyle = value("color");
    ctx.globalAlpha = num("opacity", 5, 100) / 100;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const x = (w * num("posX", 0, 100)) / 100,
      y = (h * num("posY", 0, 100)) / 100,
      metrics = ctx.measureText(text);
    if (
      metrics.width > 2 * Math.min(x, w - x) ||
      num("fontSize", 8, 1000) > 2 * Math.min(y, h - y)
    )
      throw Error(
        "El texto sale de la imagen. Reduce su tamaño o acerca su posición al centro.",
      );
    ctx.fillText(text, x, y);
  }
  const blob = await toBlob(c, type, quality);
  if (token !== epoch) return;
  previewImage(blob);
  if (tool.id === "favicon" && value("format") === "ico") {
    const png = new Uint8Array(await blob.arrayBuffer());
    if (token !== epoch) return;
    download(icoFromPNG(png, w), `${stem()}-favicon.ico`, "image/x-icon");
  } else
    download(
      blob,
      `${stem()}-resapo.${blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png"}`,
    );
  status(
    `Original: ${(source.size / 1024).toFixed(1)} KB · Resultado: ${(blob.size / 1024).toFixed(1)} KB${tool.id === "compress" && blob.size >= source.size ? " · Esta copia no es más pequeña; prueba menor calidad o conserva el original." : ""}`,
  );
}
function textResult() {
  const a = value("text");
  if (!a.trim()) throw Error("Pega un texto para empezar.");
  if (a.length > LIMITS.text)
    throw Error("El texto supera 100 000 caracteres.");
  const stats = textStats(a),
    p = el("div");
  p.className = "lab-stats";
  for (const [key, label] of [
    ["words", "palabras"],
    ["characters", "caracteres"],
    ["lines", "líneas"],
  ]) {
    const item = el("span", label);
    item.prepend(el("strong", stats[key]));
    p.append(item);
  }
  $("lab-result").append(p);
  if (tool.id === "compare") {
    const diff = el("div");
    diff.className = "lab-diff";
    for (const part of compareText(a, value("text2"))) {
      diff.append(
        el(
          part.added ? "ins" : part.removed ? "del" : "span",
          (part.added ? "+ " : part.removed ? "− " : "  ") + part.value,
        ),
      );
    }
    $("lab-preview").replaceChildren(diff);
    return;
  }
  let output = a;
  if (tool.id === "clean") output = cleanText(a);
  if (tool.id === "replace") {
    const result = replaceLiteral(a, value("find"), value("replacement"));
    output = result.text;
    status(`${result.count} coincidencias reemplazadas.`);
  }
  const pre = el("div", output);
  pre.className = "lab-diff";
  $("lab-preview").replaceChildren(pre);
  download(output, "texto-resapo.txt", "text/plain;charset=utf-8");
}
async function extractImages(token) {
  let count = 0,
    totalPixels = 0,
    bytes = 0;
  const seen = new Set();
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    if (token !== epoch) return;
    status(`Buscando imágenes: página ${pageNo} de ${pdf.numPages}…`);
    const p = await pdf.getPage(pageNo),
      ops = await p.getOperatorList();
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (token !== epoch) return;
      const fn = ops.fnArray[i];
      let image, key;
      if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) {
        const id = ops.argsArray[i][0];
        key = id.startsWith("g_") ? id : `${pageNo}-${id}`;
        if (seen.has(key)) continue;
        image = await new Promise((resolve, reject) => {
          const timer = setTimeout(
            () =>
              reject(
                Error("Una imagen no se pudo decodificar. Prueba otro PDF."),
              ),
            10000,
          );
          (id.startsWith("g_") ? p.commonObjs : p.objs).get(id, (obj) => {
            clearTimeout(timer);
            resolve(obj);
          });
        });
      } else if (fn === OPS.paintInlineImageXObject) {
        image = ops.argsArray[i][0];
        key = `${pageNo}-inline-${i}`;
      } else continue;
      seen.add(key);
      if (!image) continue;
      const { width: w, height: h, data, bitmap: b, kind } = image;
      totalPixels += w * h;
      if (w * h > LIMITS.pixels || totalPixels > 40e6 || count >= 40)
        throw Error(
          "Este PDF supera el límite de extracción: 40 imágenes o 40 megapíxeles en total. Usa Extraer páginas para trabajar por partes.",
        );
      const c = canvas(w, h),
        ctx = c.getContext("2d");
      if (b) ctx.drawImage(b, 0, 0);
      else {
        const out = ctx.createImageData(w, h);
        if (kind === ImageKind.RGBA_32BPP) out.data.set(data);
        else
          for (let px = 0; px < w * h; px++) {
            let r, g, bl;
            if (kind === ImageKind.RGB_24BPP) {
              [r, g, bl] = data.slice(px * 3, px * 3 + 3);
            } else if (kind === ImageKind.GRAYSCALE_1BPP) {
              const row = Math.floor(px / w),
                col = px % w;
              r =
                g =
                bl =
                  ((data[row * Math.ceil(w / 8) + (col >> 3)] >>
                    (7 - (col & 7))) &
                    1) *
                  255;
            } else throw Error("Una imagen usa un formato no compatible.");
            out.data.set([r, g, bl, 255], px * 4);
          }
        ctx.putImageData(out, 0, 0);
      }
      const blob = await toBlob(c);
      if (token !== epoch) return;
      bytes += blob.size;
      if (bytes > 50 * 1024 ** 2)
        throw Error(
          "Las imágenes extraídas superan 50 MB. Divide el PDF primero.",
        );
      count++;
      download(blob, `pagina-${pageNo}-imagen-${count}.png`);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  if (!count)
    throw Error(
      "No se encontraron imágenes rasterizadas compatibles. Los dibujos vectoriales y las máscaras no se extraen como fotos.",
    );
  status(
    `${count} imágenes recuperadas. Se extrae la imagen incrustada; recortes, máscaras y efectos de la página pueden verse diferentes.`,
  );
}
async function pdfResult(token) {
  if (tool.id === "extractImages") return extractImages(token);
  const doc = await loadEditablePDF(pdfBytes);
  let data;
  if (tool.id === "forms") {
    const controls = [...document.querySelectorAll("[data-field]")];
    if (!controls.length)
      throw Error("Este PDF no contiene campos rellenables compatibles.");
    const values = Object.create(null);
    for (const n of controls)
      values[n.dataset.field] =
        n.dataset.fieldtype === "check"
          ? n.checked
          : n.dataset.fieldtype === "choice"
            ? [...n.selectedOptions].map((o) => o.value).filter(Boolean)
            : n.value;
    data = await fillPDF(doc, values);
  } else if (tool.id === "signature") {
    if (!signatureDrawn)
      throw Error("Dibuja o sube tu firma antes de continuar.");
    const pageIndex = num("page", 1, pdf.numPages) - 1,
      p = await pdf.getPage(pageIndex + 1),
      v = p.getViewport({ scale: 1 });
    const xPct = num("posX", 0, 90),
      yPct = num("posY", 0, 95),
      wp = num("signWidth", 5, 90),
      w = (v.width * wp) / 100,
      h = w / 3;
    if (xPct + wp > 100 || (v.height * yPct) / 100 + h > v.height)
      throw Error("La firma sale de la página. Ajusta posición o tamaño.");
    const [x, y] = v.convertToPdfPoint(
      (v.width * xPct) / 100,
      (v.height * yPct) / 100 + h,
    );
    data = await signPDF(
      doc,
      new Uint8Array(await (await toBlob($("signature"))).arrayBuffer()),
      {
        pageIndex,
        x,
        y,
        width: w,
        height: h,
        angle: doc.getPage(pageIndex).getRotation().angle,
      },
    );
  } else {
    if (tool.id === "watermark" && !value("caption").trim())
      throw Error("Escribe la marca de agua.");
    data = await stampPDF(doc, {
      kind: tool.id,
      text: value("caption"),
      color: value("color") || "#234638",
      start: tool.id === "number" ? num("start", 1, 9999) : 1,
      position: async (n) => (await pdf.getPage(n)).getViewport({ scale: 1 }),
    });
  }
  if (token !== epoch) return;
  download(data, `${stem()}-${tool.id}.pdf`, "application/pdf");
  status("PDF listo. Descarga y revisa la copia antes de compartirla.");
}
$("lab-run").onclick = async () => {
  if (busy) return;
  clearResult();
  const token = epoch;
  lock(true);
  status("Preparando resultado…");
  try {
    if (tool.group === "Texto") textResult();
    else if (tool.group === "Imágenes") await imageResult(token);
    else if (tool.id === "svg") {
      download(serializeSVG(svg), `${stem()}-variante.svg`, "image/svg+xml");
      status("Variante lista. Cambia los colores para crear otra.");
    } else await pdfResult(token);
    if (
      token === epoch &&
      $("lab-status").textContent === "Preparando resultado…"
    )
      status("Listo. Revisa y descarga tu resultado.");
  } catch (e) {
    if (token === epoch) {
      clearResult();
      status(
        e.message || "No se pudo completar. Prueba un archivo más pequeño.",
        true,
      );
    }
  } finally {
    if (token === epoch) lock(false);
  }
};
$("lab-sample").onclick = async () => {
  if (busy) return;
  const sampleToken = epoch;
  try {
    if (tool.group === "Texto") {
      $("text").value =
        "Mis  ideas\n\n\nUna clase para repasar.\nAprender con Re-SAPO.";
      if ($("text2"))
        $("text2").value =
          "Mis ideas\nUna clase para recordar.\nAprender con Re-SAPO.";
      if ($("find")) {
        $("find").value = "clase";
        $("replacement").value = "lección";
      }
      invalidate();
      status("Ejemplo cargado. Pulsa Crear resultado.");
      return;
    }
    lock(true);
    if (tool.id === "svg")
      return load(
        new File(
          [
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150"><rect width="200" height="150" fill="#e9efd8"/><circle cx="100" cy="75" r="50" fill="#234638"/><circle cx="80" cy="58" r="12" fill="#ffffff"/><circle cx="120" cy="58" r="12" fill="#ffffff"/></svg>',
          ],
          "ejemplo.svg",
          { type: "image/svg+xml" },
        ),
      );
    const c = canvas(800, 600),
      ctx = c.getContext("2d");
    ctx.fillStyle = "#e9efd8";
    ctx.fillRect(0, 0, 800, 600);
    ctx.fillStyle = "#234638";
    ctx.fillRect(100, 100, 400, 300);
    ctx.fillStyle = "#d5b86d";
    ctx.beginPath();
    ctx.arc(570, 370, 130, 0, Math.PI * 2);
    ctx.fill();
    const png = await toBlob(c);
    if (sampleToken !== epoch) return;
    if (tool.group === "Imágenes")
      return load(new File([png], "ejemplo.png", { type: "image/png" }));
    const doc = await PDFDocument.create(),
      page = doc.addPage([500, 650]);
    page.drawText("Un documento para tus ideas", { x: 40, y: 590, size: 20 });
    const img = await doc.embedPng(await png.arrayBuffer());
    page.drawImage(img, { x: 40, y: 270, width: 320, height: 240 });
    const form = doc.getForm();
    const name = form.createTextField("Nombre");
    name.setText("Re-SAPO");
    name.addToPage(page, { x: 40, y: 180, width: 280, height: 30 });
    const check = form.createCheckBox("Acepto");
    check.addToPage(page, { x: 40, y: 130, width: 20, height: 20 });
    page.drawText("Acepto", { x: 70, y: 135, size: 14 });
    const choice = form.createDropdown("Tema");
    choice.addOptions(["Estudio", "Trabajo"]);
    choice.select("Estudio");
    choice.addToPage(page, { x: 40, y: 70, width: 180, height: 25 });
    doc
      .addPage([500, 650])
      .drawText("Segunda pagina", { x: 40, y: 590, size: 20 });
    const bytes = await doc.save();
    if (sampleToken !== epoch) return;
    return load(new File([bytes], "ejemplo.pdf", { type: "application/pdf" }));
  } catch (e) {
    if (sampleToken === epoch) {
      status(e.message, true);
      lock(false);
    }
  }
};
window.addEventListener("pagehide", () => {
  reset();
  URL.revokeObjectURL(workerURL);
});
group("Imágenes");
