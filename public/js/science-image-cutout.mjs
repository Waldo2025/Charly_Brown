function colorDistance(red, green, blue, matte) {
  return Math.sqrt((red - matte[0]) ** 2 + (green - matte[1]) ** 2 + (blue - matte[2]) ** 2);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function borderPositions(width, height) {
  const positions = [];
  const stride = Math.max(1, Math.floor(Math.min(width, height) / 48));
  for (let x = 0; x < width; x += stride) {
    positions.push(x, (height - 1) * width + x);
  }
  for (let y = stride; y < height - 1; y += stride) {
    positions.push(y * width, y * width + width - 1);
  }
  return positions;
}

export function removeConnectedImageBackground(source, width, height, preferredMatte) {
  const pixels = source instanceof Uint8ClampedArray ? source : new Uint8ClampedArray(source);
  const data = new Uint8ClampedArray(pixels);
  const border = borderPositions(width, height);
  const inferredMatte = [0, 1, 2].map((channel) => median(border.map((position) => data[position * 4 + channel])));
  const preferredDistances = border.map((position) => {
    const offset = position * 4;
    return colorDistance(data[offset], data[offset + 1], data[offset + 2], preferredMatte);
  });
  const preferredCoverage = preferredDistances.filter((distance) => distance <= 132).length / Math.max(1, preferredDistances.length);
  const usedInferredMatte = preferredCoverage < 0.72;
  const matte = usedInferredMatte ? inferredMatte : preferredMatte;
  const borderDistances = border.map((position) => {
    const offset = position * 4;
    return colorDistance(data[offset], data[offset + 1], data[offset + 2], matte);
  }).sort((a, b) => a - b);
  const percentile90 = borderDistances[Math.floor(borderDistances.length * 0.9)] || 0;
  const threshold = usedInferredMatte
    ? Math.max(30, Math.min(138, Math.ceil(percentile90 + 24)))
    : 118;
  const visited = new Uint8Array(width * height);
  const background = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const enqueue = (position) => {
    if (position < 0 || position >= visited.length || visited[position]) return;
    visited[position] = 1;
    queue[tail++] = position;
  };
  for (let x = 0; x < width; x++) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  let removedPixels = 0;
  while (head < tail) {
    const position = queue[head++];
    const offset = position * 4;
    if (colorDistance(data[offset], data[offset + 1], data[offset + 2], matte) > threshold) continue;
    background[position] = 1;
    data[offset + 3] = 0;
    removedPixels += 1;
    const x = position % width;
    const y = Math.floor(position / width);
    if (x > 0) enqueue(position - 1);
    if (x + 1 < width) enqueue(position + 1);
    if (y > 0) enqueue(position - width);
    if (y + 1 < height) enqueue(position + width);
  }
  return { data, background, matte, threshold, removedPixels, usedInferredMatte };
}

export function keepPrimaryImageComponent(source, width, height, { minimumAlpha = 16, strict = false } = {}) {
  const data = new Uint8ClampedArray(source);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const components = [];
  for (let start = 0; start < width * height; start++) {
    if (visited[start] || data[start * 4 + 3] < minimumAlpha) continue;
    let head = 0;
    let tail = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    const positions = [];
    visited[start] = 1;
    queue[tail++] = start;
    while (head < tail) {
      const position = queue[head++];
      positions.push(position);
      const x = position % width;
      const y = Math.floor(position / width);
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      for (let offsetY = -1; offsetY <= 1; offsetY++) for (let offsetX = -1; offsetX <= 1; offsetX++) {
        if (!offsetX && !offsetY) continue;
        const nextX = x + offsetX, nextY = y + offsetY;
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
        const next = nextY * width + nextX;
        if (visited[next] || data[next * 4 + 3] < minimumAlpha) continue;
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
    components.push({ positions, minX, minY, maxX, maxY });
  }
  if (components.length <= 1) return { data, removedComponents: 0, keptPixels: components[0]?.positions.length || 0 };
  const centerX = (width - 1) / 2, centerY = (height - 1) / 2;
  const largestSize = Math.max(...components.map((component) => component.positions.length));
  const scored = components.map((component) => {
    const componentX = (component.minX + component.maxX) / 2, componentY = (component.minY + component.maxY) / 2;
    const centerDistance = Math.hypot((componentX - centerX) / width, (componentY - centerY) / height);
    return { component, score: component.positions.length / largestSize - centerDistance * .28 };
  }).sort((a, b) => b.score - a.score);
  const primary = scored[0].component;
  const primarySize = primary.positions.length;
  const primaryCenterX = (primary.minX + primary.maxX) / 2, primaryCenterY = (primary.minY + primary.maxY) / 2;
  const kept = new Set(primary.positions);
  for (const { component } of scored.slice(1)) {
    const componentCenterX = (component.minX + component.maxX) / 2, componentCenterY = (component.minY + component.maxY) / 2;
    const primaryWidth = Math.max(1, primary.maxX - primary.minX + 1), primaryHeight = Math.max(1, primary.maxY - primary.minY + 1);
    const overlapX = Math.max(0, Math.min(component.maxX, primary.maxX) - Math.max(component.minX, primary.minX) + 1);
    const componentWidth = Math.max(1, component.maxX - component.minX + 1);
    const withinPrimaryFootprint = overlapX / componentWidth >= .55;
    const attachedBelow = componentCenterY >= primaryCenterY
      && component.minY <= primary.maxY + primaryHeight * .28
      && component.maxY <= primary.maxY + primaryHeight * .42
      && component.positions.length >= primarySize * .008
      && component.positions.length <= primarySize * .18
      && withinPrimaryFootprint;
    const enclosedByPrimary = component.minX >= primary.minX - primaryWidth * .04
      && component.maxX <= primary.maxX + primaryWidth * .04
      && component.minY >= primary.minY - primaryHeight * .04
      && component.maxY <= primary.maxY + primaryHeight * .04;
    const closeToPrimary = Math.abs(componentCenterX - primaryCenterX) <= Math.max(10, (primary.maxX - primary.minX) * .58)
      && Math.abs(componentCenterY - primaryCenterY) <= Math.max(10, (primary.maxY - primary.minY) * .58);
    const preserveComponent = strict
      ? attachedBelow || enclosedByPrimary
      : component.positions.length >= primarySize * .16 && closeToPrimary;
    if (preserveComponent) for (const position of component.positions) kept.add(position);
  }
  let removedComponents = 0;
  for (const component of components) {
    if (component.positions.some((position) => kept.has(position))) continue;
    removedComponents += 1;
    for (const position of component.positions) data[position * 4 + 3] = 0;
  }
  return { data, removedComponents, keptPixels: kept.size };
}

export function despillImageMatte(source, width, height, matte, { radius = 2 } = {}) {
  const data = new Uint8ClampedArray(source);
  const transparent = new Uint8Array(width * height);
  for (let position = 0; position < width * height; position++) {
    const offset = position * 4;
    if (data[offset + 3] < 8) {
      transparent[position] = 1;
      data[offset] = 0; data[offset + 1] = 0; data[offset + 2] = 0; data[offset + 3] = 0;
    }
  }
  const greenMatte = matte[1] > matte[0] && matte[1] > matte[2];
  const magentaMatte = matte[0] > matte[1] && matte[2] > matte[1];
  let correctedPixels = 0;
  let residualPixels = 0;
  for (let position = 0; position < width * height; position++) {
    const offset = position * 4;
    if (data[offset + 3] < 8) continue;
    const x = position % width, y = Math.floor(position / width);
    let edge = data[offset + 3] < 250;
    for (let dy = -radius; dy <= radius && !edge; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && transparent[ny * width + nx]) { edge = true; break; }
    }
    if (!edge) continue;
    if (greenMatte) {
      const neutral = Math.max(data[offset], data[offset + 2]);
      const spill = data[offset + 1] - neutral;
      if (spill > 8) { data[offset + 1] = neutral + Math.min(8, Math.round(spill * .08)); correctedPixels++; }
      if (data[offset + 1] - Math.max(data[offset], data[offset + 2]) > 14) residualPixels++;
    } else if (magentaMatte) {
      const neutral = data[offset + 1], spill = Math.min(data[offset], data[offset + 2]) - neutral;
      if (spill > 8) {
        const maximum = neutral + Math.min(8, Math.round(spill * .08));
        data[offset] = Math.min(data[offset], maximum); data[offset + 2] = Math.min(data[offset + 2], maximum); correctedPixels++;
      }
      if (Math.min(data[offset], data[offset + 2]) - data[offset + 1] > 14) residualPixels++;
    }
  }
  return { data, correctedPixels, residualPixels };
}
