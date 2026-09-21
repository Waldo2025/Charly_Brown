const DEFAULT_WIDTH = 1366;
const DEFAULT_HEIGHT = 904;

function crearCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

function numeroCss(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nombreCapa(value, fallback) {
  const clean = String(value || "")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return clean || fallback;
}

async function cargarImagen(src) {
  let objectUrl = "";
  try {
    const response = await fetch(src, { mode: "cors" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    objectUrl = URL.createObjectURL(await response.blob());
  } catch (_) {
    objectUrl = src;
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve({ image, objectUrl: objectUrl.startsWith("blob:") ? objectUrl : "" });
    image.onerror = () => {
      if (objectUrl.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
      reject(new Error("No se pudo cargar una imagen del MindMap."));
    };
    image.src = objectUrl;
  });
}

function liberarImagen(cargada) {
  if (cargada?.objectUrl) URL.revokeObjectURL(cargada.objectUrl);
}

async function crearCapaBloques({ blocksSvg, modoPlantilla, width, height, staticBackgroundUrl }) {
  const layerCanvas = crearCanvas(width, height);
  const ctx = layerCanvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  if (modoPlantilla === "static") {
    const loaded = await cargarImagen(staticBackgroundUrl);
    try {
      ctx.drawImage(loaded.image, 0, 0, width, height);
    } finally {
      liberarImagen(loaded);
    }
  } else if (blocksSvg) {
    const svgClone = blocksSvg.cloneNode(true);
    svgClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svgClone.setAttribute("width", String(width));
    svgClone.setAttribute("height", String(height));
    const svgBlob = new Blob([new XMLSerializer().serializeToString(svgClone)], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);
    const loaded = await cargarImagen(svgUrl);
    try {
      ctx.drawImage(loaded.image, 0, 0, width, height);
    } finally {
      liberarImagen(loaded);
      URL.revokeObjectURL(svgUrl);
    }
  }

  return {
    name: "Bloques y fondo",
    top: 0,
    left: 0,
    canvas: layerCanvas
  };
}

function calcularBoundsElemento(el, width, height, incluirEtiqueta) {
  const left = numeroCss(el.style.left, el.offsetLeft || 0);
  const top = numeroCss(el.style.top, el.offsetTop || 0);
  const elementWidth = numeroCss(el.style.width, el.offsetWidth || 48);
  const elementHeight = numeroCss(el.style.height, el.offsetHeight || elementWidth);
  const angle = numeroCss(el.dataset.angle, 0) * Math.PI / 180;
  const rotatedWidth = Math.abs(elementWidth * Math.cos(angle)) + Math.abs(elementHeight * Math.sin(angle));
  const rotatedHeight = Math.abs(elementWidth * Math.sin(angle)) + Math.abs(elementHeight * Math.cos(angle));
  const centerX = left + elementWidth / 2;
  const centerY = top + elementHeight / 2;
  const padding = 4;

  let minX = centerX - rotatedWidth / 2 - padding;
  let minY = centerY - rotatedHeight / 2 - padding;
  let maxX = centerX + rotatedWidth / 2 + padding;
  let maxY = centerY + rotatedHeight / 2 + padding;
  let label = null;

  if (incluirEtiqueta && el.tagName === "IMG") {
    const candidate = el.nextElementSibling;
    if (candidate?.classList.contains("sticker-word-label")) {
      const labelLeft = numeroCss(candidate.style.left, left);
      const labelTop = numeroCss(candidate.style.top, Math.max(4, top - 22));
      const labelWidth = numeroCss(candidate.style.width, elementWidth);
      const fontSize = numeroCss(candidate.style.fontSize, 12);
      label = { element: candidate, left: labelLeft, top: labelTop, width: labelWidth, fontSize };
      minX = Math.min(minX, labelLeft - padding);
      minY = Math.min(minY, labelTop - padding);
      maxX = Math.max(maxX, labelLeft + labelWidth + padding);
      maxY = Math.max(maxY, labelTop + fontSize + 8 + padding);
    }
  }

  const layerLeft = Math.max(0, Math.floor(minX));
  const layerTop = Math.max(0, Math.floor(minY));
  const layerRight = Math.min(width, Math.ceil(maxX));
  const layerBottom = Math.min(height, Math.ceil(maxY));

  return {
    left,
    top,
    width: elementWidth,
    height: elementHeight,
    angle,
    centerX,
    centerY,
    layerLeft,
    layerTop,
    layerWidth: Math.max(1, layerRight - layerLeft),
    layerHeight: Math.max(1, layerBottom - layerTop),
    label
  };
}

function dibujarChip(ctx, el, bounds) {
  const text = (el.textContent || "").trim();
  const x = bounds.left - bounds.layerLeft;
  const y = bounds.top - bounds.layerTop;
  const badgeWidth = Math.max(bounds.width, 24);
  const badgeHeight = Math.max(bounds.height, 22);
  const computed = getComputedStyle(el);

  ctx.fillStyle = computed.backgroundColor || "#ffffff";
  ctx.strokeStyle = computed.borderColor || "#0f172a";
  ctx.lineWidth = numeroCss(computed.borderTopWidth, 1.5);
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, badgeWidth, badgeHeight, badgeHeight / 2);
  else ctx.rect(x, y, badgeWidth, badgeHeight);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = computed.color || "#0f172a";
  ctx.font = `${computed.fontWeight || 700} ${computed.fontSize || "13px"} ${computed.fontFamily || "sans-serif"}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + badgeWidth / 2, y + badgeHeight / 2);
}

async function crearCapaElemento(el, index, options) {
  const bounds = calcularBoundsElemento(el, options.width, options.height, options.incluirEtiquetas);
  const layerCanvas = crearCanvas(bounds.layerWidth, bounds.layerHeight);
  const ctx = layerCanvas.getContext("2d");
  const palabra = nombreCapa(el.dataset.palabra || el.title || el.textContent, `Elemento ${index}`);
  const esSticker = el.tagName === "IMG";

  if (esSticker) {
    const loaded = await cargarImagen(el.currentSrc || el.src);
    try {
      ctx.save();
      ctx.translate(bounds.centerX - bounds.layerLeft, bounds.centerY - bounds.layerTop);
      ctx.rotate(bounds.angle);
      ctx.drawImage(loaded.image, -bounds.width / 2, -bounds.height / 2, bounds.width, bounds.height);
      ctx.restore();
    } finally {
      liberarImagen(loaded);
    }

    if (bounds.label) {
      const labelText = bounds.label.element.textContent.trim();
      ctx.font = `700 ${bounds.label.fontSize}px system-ui, sans-serif`;
      ctx.fillStyle = getComputedStyle(bounds.label.element).color || "#172033";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(
        labelText,
        bounds.label.left - bounds.layerLeft + bounds.label.width / 2,
        bounds.label.top - bounds.layerTop
      );
    }
  } else {
    dibujarChip(ctx, el, bounds);
  }

  return {
    layer: {
      name: `${esSticker ? "Sticker" : "Palabra"} ${String(index).padStart(3, "0")} - ${palabra}`,
      top: bounds.layerTop,
      left: bounds.layerLeft,
      canvas: layerCanvas
    },
    palabra,
    pageIndex: Number.parseInt(el.dataset.pageIndex, 10),
    blockIndex: Number.parseInt(el.dataset.blockIndex, 10),
    sentenceId: Number.parseInt(el.dataset.sentenceId, 10),
    wordIndex: Number.parseInt(el.dataset.wordIndex, 10),
    freeSticker: el.dataset.freeSticker === "true"
  };
}

function crearGruposPorFrase(elementLayers) {
  const groups = new Map();

  elementLayers.forEach((item, index) => {
    const pageIndex = Number.isFinite(item.pageIndex) ? item.pageIndex : 0;
    const phraseKey = Number.isFinite(item.sentenceId)
      ? `sentence-${pageIndex}-${item.sentenceId}`
      : Number.isFinite(item.blockIndex)
        ? `legacy-block-${pageIndex}-${item.blockIndex}`
        : `free-${index}`;
    const key = item.freeSticker ? "free-stickers" : phraseKey;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });

  return Array.from(groups.entries()).map(([key, items], groupIndex) => {
    const orderedItems = [...items].sort((a, b) => {
      const blockDelta = (a.blockIndex || 0) - (b.blockIndex || 0);
      return blockDelta || (a.wordIndex || 0) - (b.wordIndex || 0);
    });
    const sample = orderedItems.map((item) => item.palabra).join(" ").slice(0, 56).trim();
    const first = orderedItems[0];
    const pageLabel = Number.isFinite(first.pageIndex) ? first.pageIndex + 1 : 1;
    const phraseLabel = Number.isFinite(first.sentenceId) ? first.sentenceId + 1 : groupIndex + 1;
    const name = key === "free-stickers"
      ? "Stickers libres"
      : `Frase P${pageLabel}-${String(phraseLabel).padStart(2, "0")} - ${sample || "Sin texto"}`;

    return {
      name,
      opened: true,
      children: orderedItems.map((item) => item.layer)
    };
  });
}

function descargarPsd(buffer, filename) {
  const blob = new Blob([buffer], { type: "image/vnd.adobe.photoshop" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportarMindmapPsd({
  canvas,
  blocksSvg,
  modoPlantilla = "dynamic",
  incluirEtiquetas = true,
  filename = `MindMap_${Date.now()}.psd`,
  staticBackgroundUrl = "mindmapBackground.png",
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT
}) {
  if (!globalThis.agPsd?.writePsd) {
    throw new Error("El exportador PSD no está disponible.");
  }

  const blocksLayer = await crearCapaBloques({ blocksSvg, modoPlantilla, width, height, staticBackgroundUrl });
  const elements = Array.from(canvas.querySelectorAll(".sticker, .draggable-text"));
  const elementLayers = [];
  const skipped = [];

  for (let i = 0; i < elements.length; i++) {
    try {
      elementLayers.push(await crearCapaElemento(elements[i], i + 1, { width, height, incluirEtiquetas }));
    } catch (error) {
      skipped.push(nombreCapa(elements[i].dataset.palabra || elements[i].title, `Elemento ${i + 1}`));
      console.warn("No se pudo preparar una capa PSD:", error);
    }
  }

  const composite = crearCanvas(width, height);
  const compositeCtx = composite.getContext("2d");
  compositeCtx.drawImage(blocksLayer.canvas, blocksLayer.left, blocksLayer.top);
  elementLayers.forEach(({ layer }) => compositeCtx.drawImage(layer.canvas, layer.left, layer.top));

  const phraseGroups = crearGruposPorFrase(elementLayers);
  const children = [blocksLayer, ...phraseGroups];
  const buffer = globalThis.agPsd.writePsd({ width, height, canvas: composite, children });
  descargarPsd(buffer, filename.endsWith(".psd") ? filename : `${filename}.psd`);

  return { layerCount: elementLayers.length + 1, groupCount: phraseGroups.length, skipped };
}
