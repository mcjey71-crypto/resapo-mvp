import { inspectSVG, MAX_SVG_BYTES } from "./svg-viewer.js";
import {
  MAX_TRACE_EDGE,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_BYTES,
} from "./vector-core.js";

const $ = (id) => document.getElementById(id);
let selected = null,
  sourceURL = null,
  resultURL = null,
  worker = null,
  timer = null,
  generation = 0,
  latestSVG = null;
const workerURL = URL.createObjectURL(
  new Blob([__VECTOR_WORKER_SOURCE__], { type: "text/javascript" }),
);
function message(text, error = false) {
  $("v-message").textContent = text;
  $("v-message").className = error ? "vector-message error" : "vector-message";
  $("v-message").hidden = !text;
}
function clearResult() {
  latestSVG = null;
  $("svg-result").disabled = true;
  $("v-used-colors").replaceChildren();
  if (resultURL) URL.revokeObjectURL(resultURL);
  resultURL = null;
  $("v-output").removeAttribute("src");
  $("v-download").removeAttribute("href");
  $("v-download").hidden = true;
  $("v-result-empty").hidden = false;
  $("v-output").hidden = true;
  $("v-stats").textContent = "Tu SVG aparecerá aquí.";
}
function busy(value) {
  document.querySelectorAll("[data-v-lock]").forEach((el) => {
    el.disabled = value;
  });
  $("v-run").disabled = value || !selected;
  $("v-cancel").hidden = !value;
  $("v-working").hidden = !value;
  $("vector-workspace").setAttribute("aria-busy", String(value));
}
function stop() {
  generation++;
  worker?.terminate();
  worker = null;
  clearTimeout(timer);
  busy(false);
}
function reset() {
  stop();
  selected = null;
  if (sourceURL) URL.revokeObjectURL(sourceURL);
  sourceURL = null;
  $("v-original").removeAttribute("src");
  $("v-original").hidden = true;
  $("v-source-empty").hidden = false;
  $("v-filename").textContent = "Ninguna imagen seleccionada";
  $("v-resolution").textContent =
    "Las imágenes grandes se ajustan a un máximo de 2400 px por lado para crear los contornos.";
  $("v-input").value = "";
  clearResult();
  message("");
  busy(false);
}
async function load(file) {
  stop();
  const token = generation;
  message("");
  let bitmap;
  busy(true);
  try {
    if (
      !file ||
      !/\.(png|jpe?g|webp)$/i.test(file.name) ||
      !file.size ||
      file.size > MAX_IMAGE_BYTES
    ) {
      throw new Error("Elige un PNG, JPG o WebP de hasta 15 MB.");
    }
    // Decode before replacing the current selection, so an invalid upload does not lose work.
    bitmap = await createImageBitmap(file);
    if (token !== generation) return;
    if (bitmap.width * bitmap.height > MAX_IMAGE_PIXELS)
      throw new Error(
        "La imagen supera los 25 megapíxeles. Reduce su tamaño antes de subirla.",
      );
    const ratio = Math.min(
      1,
      MAX_TRACE_EDGE / Math.max(bitmap.width, bitmap.height),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    selected = {
      name: file.name,
      image: ctx.getImageData(0, 0, canvas.width, canvas.height),
    };
    if (sourceURL) URL.revokeObjectURL(sourceURL);
    sourceURL = URL.createObjectURL(file);
    $("v-original").src = sourceURL;
    $("v-original").hidden = false;
    $("v-source-empty").hidden = true;
    $("v-filename").textContent =
      `${file.name} · ${bitmap.width} × ${bitmap.height} px`;
    updateResolution();
    clearResult();
  } catch (error) {
    if (token === generation)
      message(
        error.message.includes("image") && error.name === "InvalidStateError"
          ? "No pudimos leer la imagen. Comprueba que el archivo no esté dañado."
          : error.message,
        true,
      );
  } finally {
    bitmap?.close();
    if (token === generation) busy(false);
  }
}
function workingSize() {
  if (!selected) return null;
  const ratio = Math.min(
    1,
    Number($("v-size").value) /
      Math.max(selected.image.width, selected.image.height),
  );
  return {
    width: Math.max(1, Math.round(selected.image.width * ratio)),
    height: Math.max(1, Math.round(selected.image.height * ratio)),
  };
}
function updateResolution() {
  const size = workingSize();
  if (size)
    $("v-resolution").textContent =
      `Resolución de trazado: ${size.width} × ${size.height} px. El SVG se puede ampliar; no recupera detalles ausentes del original.`;
}
function workingImage() {
  const size = workingSize();
  if (
    size.width === selected.image.width &&
    size.height === selected.image.height
  )
    return selected.image;
  const original = document.createElement("canvas");
  original.width = selected.image.width;
  original.height = selected.image.height;
  original.getContext("2d").putImageData(selected.image, 0, 0);
  const scaled = document.createElement("canvas");
  scaled.width = size.width;
  scaled.height = size.height;
  const ctx = scaled.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(original, 0, 0, size.width, size.height);
  const result = ctx.getImageData(0, 0, size.width, size.height);
  original.width = original.height = 1;
  return result;
}
function run() {
  if (!selected) return;
  stop();
  clearResult();
  message("");
  busy(true);
  const token = generation;
  worker = new Worker(workerURL);
  const fail = (text) => {
    if (token !== generation) return;
    stop();
    message(text, true);
  };
  worker.onerror = () =>
    fail(
      "No pudimos completar el trazado. Reduce el detalle o prueba una imagen más pequeña.",
    );
  timer = setTimeout(
    () =>
      fail(
        "Esta imagen tardó demasiado. Prueba menos colores o una imagen más sencilla.",
      ),
    90000,
  );
  worker.onmessage = ({ data }) => {
    if (token !== generation) return;
    stop();
    if (!data.ok) {
      message(data.message, true);
      return;
    }
    latestSVG = data.svg;
    $("svg-result").disabled = false;
    for (const color of data.colors) {
      const swatch = document.createElement("span");
      swatch.textContent = color;
      const chip = document.createElement("i");
      chip.style.backgroundColor = color;
      swatch.prepend(chip);
      $("v-used-colors").append(swatch);
    }
    resultURL = URL.createObjectURL(
      new Blob([data.svg], { type: "image/svg+xml" }),
    );
    $("v-output").src = resultURL;
    $("v-output").hidden = false;
    $("v-result-empty").hidden = true;
    $("v-download").href = resultURL;
    $("v-download").download =
      selected.name
        .replace(/\.[^.]+$/, "")
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_") + "-resapo.svg";
    $("v-download").hidden = false;
    $("v-stats").textContent =
      `${data.paths} trazados · ${Math.ceil(new Blob([data.svg]).size / 1024)} KB · SVG escalable`;
    message("Listo. Compara el resultado y descarga tu vector.");
  };
  try {
    const image = workingImage();
    worker.postMessage({
      image: { width: image.width, height: image.height, data: image.data },
      settings: {
        mode: $("v-mode").value,
        colors: Number($("v-colors").value),
        detail: $("v-detail").value,
        threshold: Number($("v-threshold").value),
        removeWhite: $("v-white").checked,
        inkOnly: $("v-ink-only").checked,
        palette: $("v-palette").value,
        ink: $("v-ink").value,
        smoothing: Number($("v-smoothing").value),
        speckles: Number($("v-speckles").value),
        corners: $("v-corners").checked,
        alpha: Number($("v-alpha").value),
        background: $("v-background").value,
        backgroundColor: $("v-bg-color").value,
        backgroundTolerance: Number($("v-bg-tolerance").value),
      },
    });
  } catch {
    fail(
      "No hay suficiente memoria para preparar el trazado. Prueba 600 px o una imagen más pequeña.",
    );
  }
}
$("v-input").addEventListener("change", (event) => {
  if (event.target.files[0]) load(event.target.files[0]);
  event.target.value = "";
});
$("v-drop").onclick = () => $("v-input").click();
$("v-drop").ondragover = (event) => {
  event.preventDefault();
  if (!$("v-drop").disabled) $("v-drop").classList.add("dragover");
};
$("v-drop").ondragleave = () => $("v-drop").classList.remove("dragover");
$("v-drop").ondrop = (event) => {
  event.preventDefault();
  $("v-drop").classList.remove("dragover");
  if (!$("v-drop").disabled && event.dataTransfer.files[0])
    load(event.dataTransfer.files[0]);
};
$("v-run").onclick = run;
$("v-clear").onclick = reset;
$("v-cancel").onclick = () => {
  stop();
  message(
    "Conversión cancelada. Puedes ajustar las opciones y volver a probar.",
  );
};
function refreshOptions() {
  $("v-color-row").hidden = $("v-mode").value === "mono";
  $("v-threshold-row").hidden = $("v-mode").value !== "mono";
  $("v-bg-options").hidden = $("v-background").value === "keep";
  for (const id of ["threshold", "smoothing", "alpha", "bg-tolerance"])
    $("v-" + id + "-value").textContent = $("v-" + id).value;
  updateResolution();
}
const presets = {
  flat: {
    mode: "color",
    colors: 4,
    detail: "fine",
    smoothing: 0.25,
    speckles: 0,
    corners: true,
    size: 1200,
    background: "keep",
    tip: "Colores planos y esquinas definidas. Indica los HEX de tu marca si necesitas colores exactos.",
  },
  letters: {
    mode: "mono",
    colors: 2,
    detail: "fine",
    smoothing: 0.15,
    speckles: 0,
    corners: true,
    size: 2400,
    background: "all",
    tip: "Conserva puntos y acentos. Ajusta el umbral para no adelgazar las letras; comprueba los huecos al ampliar.",
  },
  seal: {
    mode: "mono",
    colors: 2,
    detail: "balanced",
    smoothing: 1,
    speckles: 4,
    corners: false,
    size: 1200,
    background: "edge",
    tip: "Una tinta y curvas suaves. Baja la limpieza si desaparecen detalles pequeños.",
  },
  rich: {
    mode: "color",
    colors: 16,
    detail: "balanced",
    smoothing: 0.5,
    speckles: 4,
    corners: true,
    size: 1200,
    background: "keep",
    tip: "Más matices producen más trazados y archivos mayores. Los degradados se aproximan con bandas de color.",
  },
};
$("v-preset").onchange = () => {
  const preset = presets[$("v-preset").value];
  if (!preset) return;
  for (const [key, value] of Object.entries(preset)) {
    const control = $("v-" + key);
    if (control) {
      if (control.type === "checkbox") control.checked = value;
      else control.value = value;
    }
  }
  $("v-white").checked = false;
  $("v-ink-only").checked = ["letters", "seal"].includes($("v-preset").value);
  $("v-palette").value = "";
  $("v-alpha").value = 128;
  $("v-threshold").value = 150;
  $("v-bg-color").value = "#ffffff";
  $("v-bg-tolerance").value = 20;
  $("v-preset-tip").textContent = preset.tip;
  clearResult();
  message("");
  refreshOptions();
};
$("v-detail").onchange = () => {
  const detail = $("v-detail").value;
  $("v-smoothing").value = { soft: 2.5, balanced: 1, fine: 0.25 }[detail];
  $("v-speckles").value = { soft: 16, balanced: 4, fine: 0 }[detail];
  $("v-corners").checked = detail !== "soft";
  refreshOptions();
};
document
  .querySelectorAll(
    ".vector-controls input,.vector-controls select,.vector-controls textarea",
  )
  .forEach((el) =>
    el.addEventListener("input", () => {
      clearResult();
      message("");
      if (el.id !== "v-preset") $("v-preset").value = "custom";
      refreshOptions();
    }),
  );
document.querySelectorAll(".vector-controls select").forEach((el) =>
  el.addEventListener("change", () => {
    clearResult();
    refreshOptions();
  }),
);
$("v-zoom").oninput = () => {
  for (const id of ["v-output", "v-original"]) {
    const img = $(id);
    img.style.width = `${$("v-zoom").value}%`;
    img.parentElement.classList.toggle(
      "is-zoomed",
      Number($("v-zoom").value) > 100,
    );
  }
  $("v-zoom-value").textContent = `${$("v-zoom").value}%`;
};
$("v-preview-bg").onchange = () =>
  document
    .querySelectorAll(".vector-comparison .vector-stage")
    .forEach((stage) => (stage.dataset.background = $("v-preview-bg").value));
let syncing = false;
const stages = [
  ...document.querySelectorAll(".vector-comparison .vector-stage"),
];
for (const stage of stages)
  stage.addEventListener("scroll", () => {
    if (syncing) return;
    syncing = true;
    for (const other of stages) {
      if (other === stage) continue;
      other.scrollLeft = stage.scrollLeft;
      other.scrollTop = stage.scrollTop;
    }
    requestAnimationFrame(() => (syncing = false));
  });
$("v-sample").onclick = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 360;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f6f2e8";
  ctx.fillRect(0, 0, 480, 360);
  ctx.fillStyle = "#254c3e";
  ctx.beginPath();
  ctx.arc(240, 194, 110, 0, Math.PI * 2);
  ctx.fill();
  for (const x of [180, 300]) {
    ctx.fillStyle = "#a3b96b";
    ctx.beginPath();
    ctx.arc(x, 105, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x, 103, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#172e26";
    ctx.beginPath();
    ctx.arc(x + 4, 103, 11, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "#e7bc67";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(240, 190, 55, 0.15, Math.PI - 0.15);
  ctx.stroke();
  canvas.toBlob(
    (blob) => load(new File([blob], "sapo-ejemplo.png", { type: "image/png" })),
    "image/png",
  );
};
window.addEventListener("pagehide", () => {
  reset();
  clearViewer();
  URL.revokeObjectURL(workerURL);
});
reset();

let viewerURL = null,
  viewerGeneration = 0;
function clearViewer() {
  viewerGeneration++;
  if (viewerURL) URL.revokeObjectURL(viewerURL);
  viewerURL = null;
  $("svg-preview").removeAttribute("src");
  $("svg-preview").hidden = true;
  $("svg-empty").hidden = false;
  $("svg-info").textContent = "";
  $("svg-input").value = "";
  $("svg-zoom").value = 100;
  viewerZoom();
}
function viewerZoom() {
  const zoom = Number($("svg-zoom").value);
  $("svg-preview").style.width = `${zoom}%`;
  $("svg-stage").classList.toggle("is-zoomed", zoom > 100);
  $("svg-zoom-value").textContent = `${zoom}%`;
}
async function showSVG(text, name, token) {
  let url;
  try {
    const info = inspectSVG(text);
    url = URL.createObjectURL(new Blob([info.svg], { type: "image/svg+xml" }));
    const image = new Image();
    image.src = url;
    await image.decode();
    if (token !== viewerGeneration) {
      URL.revokeObjectURL(url);
      return;
    }
    viewerURL = url;
    $("svg-preview").src = url;
    $("svg-preview").hidden = false;
    $("svg-empty").hidden = true;
    $("svg-info").textContent =
      `${name} · ${info.paths} trazados · viewBox: ${info.viewBox}${info.images ? ` · Contiene ${info.images} imágenes incrustadas: no todo el archivo es vectorial.` : ""}`;
    viewerZoom();
  } catch (error) {
    if (url) URL.revokeObjectURL(url);
    if (token === viewerGeneration)
      $("svg-info").textContent =
        error.name === "InvalidStateError"
          ? "No se pudo visualizar este SVG. Comprueba sus dimensiones y contenido."
          : error.message;
  }
}
$("svg-input").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  clearViewer();
  const token = viewerGeneration;
  if (!/\.svg$/i.test(file.name) || !file.size || file.size > MAX_SVG_BYTES) {
    $("svg-info").textContent = "Elige un archivo SVG de hasta 12 MB.";
    return;
  }
  try {
    const text = await file.text();
    if (token === viewerGeneration) await showSVG(text, file.name, token);
  } catch {
    if (token === viewerGeneration)
      $("svg-info").textContent = "No se pudo leer el archivo SVG.";
  }
};
$("svg-result").onclick = () => {
  if (!latestSVG) return;
  clearViewer();
  showSVG(latestSVG, "Vector creado en Re-SAPO", viewerGeneration);
  $("svg-viewer-title").scrollIntoView({ behavior: "smooth", block: "start" });
};
$("svg-clear").onclick = clearViewer;
$("svg-zoom").oninput = viewerZoom;
$("svg-fit").onclick = () => {
  $("svg-zoom").value = 100;
  viewerZoom();
  $("svg-stage").scrollTo(0, 0);
};
$("svg-background").onchange = () =>
  ($("svg-stage").dataset.background = $("svg-background").value);
refreshOptions();
