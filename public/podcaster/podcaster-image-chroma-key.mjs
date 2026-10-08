const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Removes a solid chroma matte only when it is connected to the image edge. */
export async function removeMatteScreenBackground(dataUrl, { color = "#ff00ff", threshold = 58, softness = 34 } = {}) {
  const parseColor = (value) => {
    const match = String(value).match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
    if (!match) throw new Error("El color de recorte no es válido.");
    return match.slice(1).map((channel) => parseInt(channel, 16));
  };
  const mattes = [color, "#00ff00"].map(parseColor);
  const image = await new Promise((resolve, reject) => {
    const element = new Image(); element.onload = () => resolve(element); element.onerror = () => reject(new Error("No se pudo cargar el recorte generado.")); element.src = String(dataUrl || "");
  });
  const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true }); context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height), { data } = imageData;
  const width = canvas.width, height = canvas.height, visited = new Uint8Array(width * height), queue = new Int32Array(width * height);
  const closestMatteAt = (pixel) => {
    const offset = pixel * 4;
    let best = { distance: Infinity, color: mattes[0] };
    for (const matte of mattes) {
      const distance = Math.hypot(data[offset] - matte[0], data[offset + 1] - matte[1], data[offset + 2] - matte[2]);
      if (distance < best.distance) best = { distance, color: matte };
    }
    return best;
  };
  const distanceAt = (pixel) => closestMatteAt(pixel).distance;
  let head = 0, tail = 0, hadTransparency = false;
  for (let offset = 3; offset < data.length; offset += 4) if (data[offset] < 250) { hadTransparency = true; break; }
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    if (visited[pixel] || distanceAt(pixel) > threshold + softness) return;
    visited[pixel] = 1; queue[tail++] = pixel;
  };
  for (let x = 0; x < width; x += 1) { enqueue(x, 0); enqueue(x, height - 1); }
  for (let y = 1; y < height - 1; y += 1) { enqueue(0, y); enqueue(width - 1, y); }
  while (head < tail) {
    const pixel = queue[head++], offset = pixel * 4, distance = distanceAt(pixel);
    data[offset + 3] = Math.round(clamp((distance - threshold) / Math.max(1, softness), 0, 1) * data[offset + 3]);
    const x = pixel % width, y = Math.floor(pixel / width);
    enqueue(x - 1, y); enqueue(x + 1, y); enqueue(x, y - 1); enqueue(x, y + 1);
  }
  // Image models sometimes paint the requested matte inside the subject as
  // isolated patches. Remove only pixels strongly matching the matte hue even
  // when they are disconnected from the outer background.
  let removedInterior = 0;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4, alpha = data[offset + 3];
    if (!alpha) continue;
    const red = data[offset], green = data[offset + 1], blue = data[offset + 2];
    const { distance, color: matte } = closestMatteAt(pixel);
    const isMagenta = matte[0] > 200 && matte[2] > 200;
    const chromaDominance = isMagenta ? Math.min(red, blue) - green : green - Math.max(red, blue);
    const maxDistance = isMagenta ? threshold + softness : 32;
    if (chromaDominance < (isMagenta ? 42 : 88) || distance > maxDistance) continue;
    const keep = isMagenta
      ? clamp((distance - threshold) / Math.max(1, softness), 0, 1)
      : clamp((distance - 8) / 20, 0, 1);
    data[offset + 3] = Math.min(alpha, Math.round(keep * alpha));
    if (!data[offset + 3]) removedInterior += 1;
  }
  if (!tail && !removedInterior) {
    if (hadTransparency) return dataUrl;
    throw new Error("No se detectó el fondo magenta uniforme del recorte. Vuelve a generar la capa.");
  }
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

export async function reduceMatteFringe(dataUrl, { color = "#ff00ff", radius = 3, strength = 0.72 } = {}) {
  const mattes = [color, "#00ff00"].map((value) => {
    const hex = String(value).replace("#", "");
    return [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16));
  });
  const image = await new Promise((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = () => reject(new Error("No se pudo limpiar el borde de la capa.")); element.src = String(dataUrl || ""); });
  const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true }); context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height), { data } = imageData;
  const original = new Uint8ClampedArray(data);
  const reach = Math.max(1, Math.min(6, Math.round(radius))), transparent = new Uint8Array(canvas.width * canvas.height);
  for (let pixel = 0; pixel < transparent.length; pixel += 1) transparent[pixel] = data[pixel * 4 + 3] < 24 ? 1 : 0;
  const edge = new Uint8Array(transparent.length);
  for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
    if (!transparent[y * canvas.width + x]) continue;
    for (let dy = -reach; dy <= reach; dy += 1) for (let dx = -reach; dx <= reach; dx += 1) {
      const nx = x + dx, ny = y + dy; if (dx * dx + dy * dy <= reach * reach && nx >= 0 && ny >= 0 && nx < canvas.width && ny < canvas.height) edge[ny * canvas.width + nx] = 1;
    }
  }
  for (let pixel = 0; pixel < edge.length; pixel += 1) {
    if (!edge[pixel]) continue;
    const offset = pixel * 4, alpha = data[offset + 3] / 255; if (alpha <= 0) continue;
    const red = original[offset], green = original[offset + 1], blue = original[offset + 2];
    const target = mattes.reduce((best, matte) => {
      const distance = Math.hypot(original[offset] - matte[0], original[offset + 1] - matte[1], original[offset + 2] - matte[2]);
      return distance < best.distance ? { distance, matte } : best;
    }, { distance: Infinity, matte: mattes[0] }).matte;
    const isMagenta = target[0] > 200 && target[2] > 200;
    if (isMagenta) {
      const spill = Math.max(0, Math.min(1, (Math.min(red, blue) - green + 8) / 100)) * strength;
      data[offset] = Math.round(red * (1 - spill) + green * spill);
      data[offset + 2] = Math.round(blue * (1 - spill) + green * spill);
    } else {
      const spill = Math.max(0, Math.min(1, (green - Math.max(red, blue) + 8) / 100)) * strength;
      data[offset + 1] = Math.round(green * (1 - spill) + Math.max(red, blue) * spill);
    }
  }
  context.putImageData(imageData, 0, 0); return canvas.toDataURL("image/png");
}

export function keyGreenScreenPixels(imageData, { threshold = 82, softness = 120, width = 0, height = 0 } = {}) {
  const data = imageData?.data;
  if (!data || data.length % 4) throw new Error("Se requieren píxeles RGBA válidos.");
  if (Number(width) > 0 && Number(height) > 0 && Number(width) * Number(height) * 4 === data.length) {
    return keyConnectedGreenPixels(imageData, Number(width), Number(height), threshold, softness);
  }
  const start = Math.max(0, Number(threshold) || 0);
  const feather = Math.max(1, Number(softness) || 1);
  let transparentPixels = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    const red = data[offset], green = data[offset + 1], blue = data[offset + 2];
    const greenExcess = green - Math.max(red, blue);
    if (green < 85 || greenExcess < start * 0.35) continue;
    const chroma = Math.sqrt((red * red) + ((255 - green) * (255 - green)) + (blue * blue));
    const amount = clamp((chroma - start) / feather, 0, 1);
    const alpha = Math.round(amount * amount * (3 - 2 * amount) * data[offset + 3]);
    if (alpha < data[offset + 3]) {
      const originalAlpha = Math.max(1, data[offset + 3]);
      data[offset + 3] = alpha;
      data[offset + 1] = Math.min(green, Math.max(red, blue) + Math.round(greenExcess * alpha / originalAlpha));
      if (alpha === 0) transparentPixels += 1;
    }
  }
  return { imageData, transparentPixels };
}

function keyConnectedGreenPixels(imageData, width, height, threshold, softness) {
  const data = imageData.data;
  const queue = new Int32Array(width * height);
  const visited = new Uint8Array(width * height);
  const maxDistance = Math.max(1, Number(threshold) || 0) + Math.max(1, Number(softness) || 1);
  const greenAt = (pixel) => {
    const offset = pixel * 4;
    const red = data[offset], green = data[offset + 1], blue = data[offset + 2];
    const excess = green - Math.max(red, blue);
    const distance = Math.hypot(red, 255 - green, blue);
    return green > 80 && excess > 16 && distance <= maxDistance;
  };
  let head = 0, tail = 0, transparentPixels = 0;
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    if (visited[pixel] || !greenAt(pixel)) return;
    visited[pixel] = 1;
    queue[tail++] = pixel;
  };
  for (let x = 0; x < width; x += 1) { enqueue(x, 0); enqueue(x, height - 1); }
  for (let y = 1; y < height - 1; y += 1) { enqueue(0, y); enqueue(width - 1, y); }
  while (head < tail) {
    const pixel = queue[head++];
    const offset = pixel * 4;
    const red = data[offset], green = data[offset + 1], blue = data[offset + 2];
    const distance = Math.hypot(red, 255 - green, blue);
    const amount = clamp((distance - Math.max(0, Number(threshold) || 0)) / Math.max(1, Number(softness) || 1), 0, 1);
    const alpha = Math.round(amount * amount * (3 - 2 * amount) * data[offset + 3]);
    const originalAlpha = Math.max(1, data[offset + 3]);
    data[offset + 3] = alpha;
    data[offset + 1] = Math.min(green, Math.max(red, blue) + Math.round((green - Math.max(red, blue)) * alpha / originalAlpha));
    if (alpha === 0) transparentPixels += 1;
    const x = pixel % width, y = Math.floor(pixel / width);
    enqueue(x - 1, y); enqueue(x + 1, y); enqueue(x, y - 1); enqueue(x, y + 1);
  }
  return { imageData, transparentPixels };
}

export async function removeGreenScreenBackground(dataUrl, options = {}) {
  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("No se pudo cargar el recorte generado."));
    element.src = String(dataUrl || "");
  });
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  let result = keyGreenScreenPixels(imageData, { ...options, width: canvas.width, height: canvas.height });
  if (!result.transparentPixels) result = keyEdgeConnectedBackground(imageData, canvas.width, canvas.height);
  if (!result.transparentPixels) throw new Error("No se pudo separar el fondo. Prueba de nuevo con un elemento de alto contraste y fondo uniforme.");
  context.putImageData(result.imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

export async function reduceGreenFringe(dataUrl, { radius = 3, strength = 0.78 } = {}) {
  const image = await new Promise((resolve, reject) => {
    const element = new Image(); element.onload = () => resolve(element); element.onerror = () => reject(new Error("No se pudo limpiar el borde verde.")); element.src = String(dataUrl || "");
  });
  const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true }); context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height); const { data } = imageData;
  const width = canvas.width, height = canvas.height, original = new Uint8ClampedArray(data);
  const reach = Math.max(1, Math.min(6, Math.round(radius)));
  const edgeBand = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (original[(y * width + x) * 4 + 3] >= 24) continue;
    for (let dy = -reach; dy <= reach; dy += 1) for (let dx = -reach; dx <= reach; dx += 1) {
      if (dx * dx + dy * dy > reach * reach) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < width && ny < height) edgeBand[ny * width + nx] = 1;
    }
  }
  let changed = false;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    if (!edgeBand[pixel]) continue;
    const offset = pixel * 4; const alpha = original[offset + 3];
    if (!alpha) continue;
    const red = original[offset], green = original[offset + 1], blue = original[offset + 2];
    const excess = green - Math.max(red, blue);
    if (excess < 14 || green < 75) continue;
    const ratio = clamp(excess / Math.max(1, green), 0, 1) * clamp(strength, 0, 1);
    const nextAlpha = Math.round(alpha * (1 - ratio * 0.95));
    data[offset + 1] = Math.min(green, Math.max(red, blue) + Math.round(excess * (1 - ratio)));
    data[offset + 3] = nextAlpha;
    if (data[offset + 1] !== green || nextAlpha !== alpha) changed = true;
  }
  if (!changed) return dataUrl;
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

// Fallback for image models that interpret the green-screen prompt loosely:
// estimate the backdrop from the corners and remove only connected edge pixels.
function keyEdgeConnectedBackground(imageData, width, height) {
  const data = imageData.data;
  const samples = [];
  const sample = (x, y) => {
    const offset = (y * width + x) * 4;
    samples.push([data[offset], data[offset + 1], data[offset + 2]]);
  };
  const inset = Math.max(0, Math.min(2, Math.floor(Math.min(width, height) / 100)));
  [[inset,inset],[width-1-inset,inset],[inset,height-1-inset],[width-1-inset,height-1-inset]].forEach(([x,y]) => sample(x,y));
  const background = [0,1,2].map((channel) => samples.reduce((sum, rgb) => sum + rgb[channel], 0) / samples.length);
  const queue = new Int32Array(width * height);
  const visited = new Uint8Array(width * height);
  let head = 0, tail = 0, transparentPixels = 0;
  const tolerance = 76;
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    if (visited[pixel]) return;
    const offset = pixel * 4;
    const distance = Math.hypot(data[offset] - background[0], data[offset + 1] - background[1], data[offset + 2] - background[2]);
    if (distance > tolerance) return;
    visited[pixel] = 1;
    queue[tail++] = pixel;
  };
  for (let x = 0; x < width; x += 1) { enqueue(x, 0); enqueue(x, height - 1); }
  for (let y = 1; y < height - 1; y += 1) { enqueue(0, y); enqueue(width - 1, y); }
  while (head < tail) {
    const pixel = queue[head++];
    const offset = pixel * 4;
    const distance = Math.hypot(data[offset] - background[0], data[offset + 1] - background[1], data[offset + 2] - background[2]);
    data[offset + 3] = Math.min(data[offset + 3], Math.round(clamp((distance - 12) / 28, 0, 1) * data[offset + 3]));
    if (data[offset + 3] === 0) transparentPixels += 1;
    const x = pixel % width, y = Math.floor(pixel / width);
    enqueue(x - 1, y); enqueue(x + 1, y); enqueue(x, y - 1); enqueue(x, y + 1);
  }
  return { imageData, transparentPixels };
}
