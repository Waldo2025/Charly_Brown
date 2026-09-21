const FONT_FAMILIES = Object.freeze({
  sans: 'Inter, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  display: 'Balloon, Impact, sans-serif',
  handwritten: '"ASC Cursive 2022", cursive'
});

function loadImage(dataUrl = "") {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("text_overlay_decode_failed"));
    image.src = String(dataUrl || "");
  });
}

function wrapText(context, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [String(text || "")];
}

function canvasToDataUrl(canvas, mimeType = "image/png") {
  return canvas.toDataURL(mimeType, mimeType === "image/png" ? undefined : 0.95);
}

export async function overlayExactTextOnImage(dataUrl = "", {
  text = "",
  bounds = null,
  fontStyle = "sans",
  color = "#ffffff"
} = {}) {
  const cleanText = String(text || "").trim();
  if (!cleanText || !bounds) throw new Error("text_overlay_input_missing");
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = Number(image.naturalWidth || image.width || 1) || 1;
  canvas.height = Number(image.naturalHeight || image.height || 1) || 1;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas_unavailable");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const x = Math.max(0, Math.round(Number(bounds.x || 0) * canvas.width));
  const y = Math.max(0, Math.round(Number(bounds.y || 0) * canvas.height));
  const width = Math.max(24, Math.min(canvas.width - x, Math.round(Number(bounds.width || 0.2) * canvas.width)));
  const height = Math.max(20, Math.min(canvas.height - y, Math.round(Number(bounds.height || 0.1) * canvas.height)));
  const family = FONT_FAMILIES[fontStyle] || FONT_FAMILIES.sans;
  const weight = fontStyle === "display" ? 800 : 700;
  const maxFontSize = Math.max(12, Math.round(height * 0.78));
  let fontSize = maxFontSize;
  let lines = [];
  let lineHeight = 0;
  while (fontSize >= 10) {
    context.font = `${weight} ${fontSize}px ${family}`;
    lines = wrapText(context, cleanText, width * 0.94);
    lineHeight = fontSize * 1.08;
    const widest = Math.max(...lines.map((line) => context.measureText(line).width));
    if (widest <= width * 0.96 && lines.length * lineHeight <= height * 0.94) break;
    fontSize -= 2;
  }

  context.save();
  context.font = `${weight} ${fontSize}px ${family}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = String(color || "#ffffff");
  context.shadowColor = "rgba(0,0,0,.28)";
  context.shadowBlur = Math.max(1, fontSize * 0.045);
  context.shadowOffsetY = Math.max(1, fontSize * 0.025);
  const startY = y + (height / 2) - ((lines.length - 1) * lineHeight / 2);
  lines.forEach((line, index) => context.fillText(line, x + (width / 2), startY + (index * lineHeight), width));
  context.restore();

  const sourceMime = String(dataUrl).match(/^data:(image\/(?:png|jpeg|webp));/i)?.[1]?.toLowerCase() || "image/png";
  return {
    dataUrl: canvasToDataUrl(canvas, sourceMime),
    mimeType: sourceMime,
    width: canvas.width,
    height: canvas.height,
    exactTextOverlay: true
  };
}
