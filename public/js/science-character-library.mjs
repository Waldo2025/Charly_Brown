const SUBJECTS = {
  physics: [
    ["Nova", "Especialista en movimiento", "⚡", ["#27c6dc", "#ff765f", "#17324d", "#f7cf5d"]],
    ["Gael", "Piloto de pruebas", "↗", ["#568cff", "#ffae45", "#17233f", "#7ee7d8"]],
  ],
  chemistry: [
    ["Alma", "Analista molecular", "⚗", ["#50d6b4", "#ff6f91", "#183b4e", "#ffd166"]],
    ["Teo", "Ingeniero de reacciones", "⬡", ["#8d7cff", "#42d7c8", "#28204f", "#ffbd69"]],
  ],
  biology: [
    ["Lía", "Exploradora celular", "◉", ["#70d66f", "#ff8674", "#254936", "#ffd56a"]],
    ["Bruno", "Guardián de ecosistemas", "⌁", ["#36bfa0", "#f47da2", "#173e45", "#f2c14e"]],
  ],
  math: [
    ["Mara", "Arquitecta de patrones", "π", ["#6f8cff", "#ff7b8f", "#202b52", "#ffd05b"]],
    ["Leo", "Estratega algebraico", "∑", ["#30c6b1", "#ff9f43", "#183b4b", "#a991ff"]],
  ],
};

const STYLES = {
  "rive-kawaii-signal": ["#26344d", "#70e4d3", "soft"],
  "rive-tokyo-tech": ["#101a24", "#22d3ee", "tech"],
  "rive-arcade-matsuri": ["#17143f", "#ffd84d", "anime"],
  "kawaii-lab": ["#183047", "#ffffff", "soft"],
  "tech-minimal": ["#172737", "#77e5dd", "tech"],
  "arcade-science": ["#121b34", "#ffe04d", "pixel"],
  "pastel-adventure": ["#334258", "#fff3d8", "soft"],
  "cosmic-kawaii": ["#19234d", "#a9eaff", "anime"],
  "eco-explorer": ["#203e38", "#c8f5bb", "outdoor"],
  "storybook-science": ["#44352d", "#fff1c9", "paper"],
  "neon-lab": ["#07152b", "#25f4d0", "tech"],
  "ocean-discovery": ["#12364b", "#8deeff", "outdoor"],
};

function normalizeSubject(subject) {
  const value = String(subject || "").toLowerCase();
  if (value.includes("mat")) return "math";
  if (value.includes("chem") || value.includes("qu")) return "chemistry";
  if (value.includes("bio")) return "biology";
  return "physics";
}

export function characterPresets(subject, visualStyle, customCharacters = []) {
  const subjectId = normalizeSubject(subject);
  const styleId = STYLES[visualStyle] ? visualStyle : "kawaii-lab";
  const builtIns = SUBJECTS[subjectId].map(([name, role, symbol, palette], index) => ({
    id: `${subjectId}-${styleId}-${index + 1}`,
    name,
    role,
    symbol,
    subject: subjectId,
    visualStyle: styleId,
    palette,
    custom: false,
  }));
  return [...builtIns, ...customCharacters.filter(
    (item) => item.subject === subjectId && item.visualStyle === styleId,
  )];
}

function box(ctx, x, y, width, height, radius, fill, stroke, lineWidth = 8) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function limb(ctx, x1, y1, x2, y2, width, color, outline) {
  ctx.lineCap = "round";
  ctx.strokeStyle = outline;
  ctx.lineWidth = width + 9;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawFrame(ctx, frameX, frameY, preset, pose) {
  const sprite = document.createElement("canvas");
  sprite.width = 96;
  sprite.height = 128;
  const s = sprite.getContext("2d");
  const [primary, accent, dark, highlight] = preset.palette;
  const [outline, glow, shape] = STYLES[preset.visualStyle] || STYLES["kawaii-lab"];
  const running = pose === 2 || pose === 3;
  const phase = pose === 3 ? -1 : 1;
  const airborne = pose === 4 || pose === 5;
  const celebrate = pose === 6;
  const hit = pose === 7;
  const bodyType = preset.bodyType || (preset.id.endsWith("-2") ? "tech" : "explorer");
  const skin = preset.skin || "#d99a72";
  const skinLight = "#f3bc91";
  const yLift = pose === 4 ? -13 : pose === 5 ? -8 : running ? -2 : 0;
  const baseY = 116 + yLift;
  const px = (x, y, w, h, color) => {
    s.fillStyle = color;
    s.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };

  if (!airborne) {
    px(24, 117, 48, 3, "rgba(11,24,42,.18)");
    px(31, 120, 34, 2, "rgba(11,24,42,.1)");
  }

  const backLegX = 42 - (running ? 7 * phase : hit ? 5 : 0);
  const frontLegX = 52 + (running ? 8 * phase : hit ? 5 : 0);
  px(backLegX - 3, baseY - 32, 9, 22, outline);
  px(backLegX - 1, baseY - 31, 5, 19, dark);
  px(backLegX - 5, baseY - 12, 13, 6, outline);
  px(backLegX - 3, baseY - 11, 10, 3, accent);
  px(frontLegX - 3, baseY - 32, 9, 22, outline);
  px(frontLegX - 1, baseY - 31, 5, 19, primary);
  px(frontLegX - 5, baseY - 12, 13, 6, outline);
  px(frontLegX - 3, baseY - 11, 10, 3, highlight);

  px(33, baseY - 63, 30, 34, outline);
  px(35, baseY - 61, 26, 29, primary);
  px(35, baseY - 61, 5, 27, dark);
  px(47, baseY - 59, 4, 25, accent);
  px(52, baseY - 55, 7, 12, "rgba(255,255,255,.22)");
  if (bodyType === "tech") {
    px(37, baseY - 67, 22, 6, accent);
    px(39, baseY - 66, 18, 2, highlight);
    px(55, baseY - 50, 8, 8, highlight);
  } else {
    px(38, baseY - 66, 18, 7, dark);
    px(40, baseY - 64, 14, 4, accent);
    px(31, baseY - 58, 5, 22, highlight);
  }

  const leftArm = celebrate ? [-10, -24] : running ? [-9 * phase, 8] : hit ? [-12, 17] : [-8, 13];
  const rightArm = celebrate ? [10, -24] : running ? [9 * phase, -3] : hit ? [12, 17] : [8, 13];
  const arm = (shoulderX, dx, dy, color) => {
    const handX = shoulderX + dx;
    const handY = baseY - 54 + dy;
    px(Math.min(shoulderX, handX) - 3, Math.min(baseY - 55, handY), Math.abs(dx) + 7, Math.abs(dy) + 8, outline);
    px(Math.min(shoulderX, handX) - 1, Math.min(baseY - 54, handY) + 2, Math.abs(dx) + 3, Math.max(4, Math.abs(dy) + 3), color);
    px(handX - 3, handY - 2, 7, 7, outline);
    px(handX - 2, handY - 1, 5, 5, skin);
  };
  arm(35, ...leftArm, primary);
  arm(61, ...rightArm, accent);

  px(34, baseY - 91, 28, 27, outline);
  px(36, baseY - 89, 24, 23, skin);
  px(38, baseY - 88, 20, 5, skinLight);
  px(33, baseY - 96, 30, 12, outline);
  px(36, baseY - 99, 9, 7, dark);
  px(43, baseY - 101, 10, 9, dark);
  px(52, baseY - 98, 9, 10, dark);
  px(31, baseY - 91, 6, 17, dark);
  if (bodyType === "tech") {
    px(31, baseY - 86, 4, 13, accent);
    px(60, baseY - 86, 4, 13, highlight);
  }

  if (hit) {
    px(40, baseY - 79, 5, 2, outline);
    px(51, baseY - 79, 5, 2, outline);
  } else {
    px(41, baseY - 80, 3, 4, outline);
    px(52, baseY - 80, 3, 4, outline);
    px(42, baseY - 80, 1, 1, "#ffffff");
    px(53, baseY - 80, 1, 1, "#ffffff");
  }
  px(45, baseY - 71, celebrate ? 8 : 6, 2, hit ? outline : accent);
  px(38, baseY - 75, 3, 2, "#ef8e86");
  px(56, baseY - 75, 3, 2, "#ef8e86");

  px(61, baseY - 54, 9, 12, outline);
  px(63, baseY - 52, 5, 8, highlight);
  s.fillStyle = dark;
  s.font = "bold 5px sans-serif";
  s.textAlign = "center";
  s.fillText(preset.symbol, 65.5, baseY - 46);

  if (shape === "tech") {
    px(29, baseY - 103, 38, 2, glow);
    px(68, baseY - 87, 2, 16, glow);
  } else if (shape === "paper") {
    px(30, baseY - 29, 37, 2, "#ffffff");
  }

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.shadowColor = glow;
  ctx.shadowBlur = shape === "tech" ? 14 : 5;
  ctx.drawImage(sprite, frameX, frameY, 384, 512);
  ctx.restore();
}

export function createCharacterSprite(preset) {
  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  for (let index = 0; index < 8; index += 1) {
    drawFrame(ctx, (index % 4) * 384, Math.floor(index / 4) * 512, preset, index);
  }
  return {
    dataUrl: canvas.toDataURL("image/png"),
    mimeType: "image/png",
    width: 1536,
    height: 1024,
    columns: 4,
    rows: 2,
    characterId: preset.id,
    source: preset.custom ? "custom-preset" : "built-in-preset",
  };
}
