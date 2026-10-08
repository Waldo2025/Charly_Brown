"use strict";

const IMAGE_WARP_TYPES = new Set(["wave", "bend", "ripple", "pulse", "flag", "liquid", "twist", "shear", "jelly", "particles"]);
const PARTICLE_DIRECTIONS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], "up-right": [0.707, -0.707], "down-right": [0.707, 0.707] };

function normalizeImageWarp(raw = null) {
  const source = raw && typeof raw === "object" ? raw : {};
  const type = String(source.type || "none").trim().toLowerCase();
  const clamp = (value, fallback, min, max) => {
    const number = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
  };
  const legacySpot = {
    centerX: source.region?.centerX,
    centerY: source.region?.centerY,
    radius: source.region?.radius,
    feather: source.region?.feather
  };
  const rawSpots = Array.isArray(source.region?.spots) ? source.region.spots : [legacySpot];
  const spots = rawSpots.slice(0, 6).map((spot, index) => ({
    id: String(spot?.id || `spot-${index + 1}`).slice(0, 64),
    type: IMAGE_WARP_TYPES.has(String(spot?.type || type).toLowerCase()) ? String(spot?.type || type).toLowerCase() : "none",
    centerX: clamp(spot?.centerX, 0.5, 0, 1),
    centerY: clamp(spot?.centerY, 0.5, 0, 1),
    radius: clamp(spot?.radius, 0.3, 0.05, 1),
    feather: clamp(spot?.feather, 0.15, 0.01, 0.5)
  }));
  return {
    type: IMAGE_WARP_TYPES.has(type) ? type : "none",
    intensity: clamp(source.intensity, 45, 1, 100),
    speed: clamp(source.speed, 1, 0.25, 3),
    startSec: clamp(source.startSec, 0, 0, 3600),
    endSec: source.endSec == null ? null : clamp(source.endSec, 8, 0, 3600),
    particles: {
      count: Math.round(clamp(source.particles?.count, 10, 3, 16)),
      size: clamp(source.particles?.size, 7, 2, 18),
      color: /^#[0-9a-f]{6}$/i.test(String(source.particles?.color || "")) ? String(source.particles.color).toLowerCase() : "#7dd3fc",
      direction: Object.hasOwn(PARTICLE_DIRECTIONS, source.particles?.direction) ? source.particles.direction : "up"
    },
    region: {
      mode: source.region?.mode === "focus" ? "focus" : "all",
      centerX: clamp(source.region?.centerX, 0.5, 0, 1),
      centerY: clamp(source.region?.centerY, 0.5, 0, 1),
      radius: clamp(source.region?.radius, 0.3, 0.05, 1),
      feather: clamp(source.region?.feather, 0.15, 0.01, 0.5),
      spots
    }
  };
}

function buildMontageParticleFilter(warp, { inputLabel, outputLabel, durationSec, sourceWidth, sourceHeight, labelPrefix = "" }) {
  const duration = Math.max(0.2, Number(durationSec) || 8);
  const width = Math.max(2, Number(sourceWidth) || 960);
  const height = Math.max(2, Number(sourceHeight) || 540);
  const end = Math.max(warp.startSec + 0.1, Math.min(duration, warp.endSec == null ? duration : warp.endSec));
  const [vx, vy] = PARTICLE_DIRECTIONS[warp.particles.direction];
  const filters = [];
  let base = inputLabel;
  for (let index = 0; index < warp.particles.count; index++) {
    const spot = warp.region.spots[index % warp.region.spots.length] || warp.region;
    const focusRadius = spot.radius * Math.sqrt(width * height);
    const depth = [0.55, 0.75, 1, 1.25, 1.45][index % 5];
    const diameter = Math.max(4, Math.round(warp.particles.size * depth * width / 480));
    const radius = Math.max(2, diameter / 2);
    const travel = (warp.region.mode === "focus" ? focusRadius * 0.32 : Math.min(width, height) * 0.4) * Math.min(warp.speed, 1.5) * (0.55 + depth * 0.45);
    const seedX = ((index * 73 + 19) % 97) / 97;
    const seedY = ((index * 37 + 11) % 89) / 89;
    const x = warp.region.mode === "focus" ? spot.centerX * width + (seedX - 0.5) * focusRadius * 0.7 : seedX * width;
    const y = warp.region.mode === "focus" ? spot.centerY * height + (seedY - 0.5) * focusRadius * 0.7 : seedY * height;
    const sprite = `${labelPrefix}particle_${index}`;
    const next = index === warp.particles.count - 1 ? outputLabel : `${labelPrefix}particle_mix_${index}`;
    const alpha = `255*${((0.35 + 0.65 * warp.intensity / 100) * (0.45 + depth * 0.35)).toFixed(4)}*max(0\\,1-((X-${radius.toFixed(2)})*(X-${radius.toFixed(2)})+(Y-${radius.toFixed(2)})*(Y-${radius.toFixed(2)}))/${(radius * radius).toFixed(2)})`;
    filters.push(`color=c=0x${warp.particles.color.slice(1)}:s=${diameter}x${diameter}:r=30:d=${duration.toFixed(3)},format=rgba,geq=r='r(X\\,Y)':g='g(X\\,Y)':b='b(X\\,Y)':a='${alpha}',fade=t=in:st=${warp.startSec.toFixed(3)}:d=0.16:alpha=1,fade=t=out:st=${Math.max(warp.startSec, end - 0.16).toFixed(3)}:d=0.16:alpha=1[${sprite}]`);
    const xExpr = `${(x - radius).toFixed(2)}+${(vx * travel / duration).toFixed(3)}*t`;
    const yExpr = `${(y - radius).toFixed(2)}+${(vy * travel / duration).toFixed(3)}*t`;
    filters.push(`${base}[${sprite}]overlay=x='${xExpr}':y='${yExpr}':eval=frame:format=auto:shortest=0:eof_action=repeat:enable='between(t\\,${warp.startSec.toFixed(3)}\\,${end.toFixed(3)})'[${next}]`);
    base = `[${next}]`;
  }
  return filters.join(";");
}

function buildSingleMontageImageWarpFilter(raw = null, { inputLabel = "[0:v]", outputLabel = "image_warp", durationSec = 8, sourceWidth = 960, sourceHeight = 540, labelPrefix = "" } = {}) {
  const warp = normalizeImageWarp(raw);
  if (warp.type === "none") return "";
  if (warp.type === "particles") return buildMontageParticleFilter(warp, { inputLabel, outputLabel, durationSec, sourceWidth, sourceHeight, labelPrefix });
  const duration = Math.max(0.2, Number(durationSec) || 8).toFixed(3);
  const strength = (warp.intensity / 100).toFixed(4);
  const phase = `(2*PI*${warp.speed.toFixed(3)}*T/${duration})`;
  const radius = `sqrt((X-W/2)*(X-W/2)+(Y-H/2)*(Y-H/2))`;
  const amplitude = `(${strength}*0.028*W)`;
  const start = Math.min(Number(duration), warp.startSec).toFixed(3);
  const end = Math.max(Number(start), Math.min(Number(duration), warp.endSec == null ? Number(duration) : warp.endSec)).toFixed(3);
  const envelope = `max(0\\,min(1\\,min((T-${start})/0.16\\,(${end}-T)/0.16)))`;
  const spotMask = (spot) => {
    const distance = `sqrt((X-${spot.centerX.toFixed(4)}*W)*(X-${spot.centerX.toFixed(4)}*W)+(Y-${spot.centerY.toFixed(4)}*H)*(Y-${spot.centerY.toFixed(4)}*H))/sqrt(W*H)`;
    return `max(0\\,min(1\\,(${spot.radius.toFixed(4)}-${distance})/${spot.feather.toFixed(4)}))`;
  };
  const region = warp.region.mode === "focus"
    ? (warp.region.spots.length ? warp.region.spots.map(spotMask).reduce((combined, next) => `max(${combined}\\,${next})`) : "0")
    : "1";
  const weight = `(${envelope}*${region})`;
  let dx = "0";
  let dy = "0";
  if (warp.type === "wave") dx = `${amplitude}*sin(2*PI*3*Y/H-${phase})`;
  if (warp.type === "bend") dx = `${amplitude}*2*pow(2*Y/H-1\\,2)*sin(${phase})`;
  if (warp.type === "ripple") {
    const wave = `sin(2*PI*3*${radius}/sqrt(W*H)-${phase})`;
    dx = `${amplitude}*(X-W/2)/(${radius}+1)*${wave}`;
    dy = `${amplitude}*(Y-H/2)/(${radius}+1)*${wave}`;
  }
  if (warp.type === "pulse") {
    const pulse = `(${strength}*0.045*sin(${phase}))`;
    dx = `(X-W/2)*${pulse}`;
    dy = `(Y-H/2)*${pulse}`;
  }
  if (warp.type === "flag") { dx = `${amplitude}*0.4*Y/H*sin(${phase})`; dy = `${amplitude}*0.35*sin(4*PI*X/W-${phase})`; }
  if (warp.type === "liquid") { dx = `${amplitude}*0.6*sin(6*PI*Y/H-${phase})`; dy = `${amplitude}*0.45*sin(4*PI*X/W+${phase})`; }
  if (warp.type === "twist") { const turn = `${amplitude}*1.5*sin(${phase})*max(0\\,1-${radius}/sqrt(W*H))`; dx = `-(Y-H/2)/(${radius}+1)*${turn}`; dy = `(X-W/2)/(${radius}+1)*${turn}`; }
  if (warp.type === "shear") dx = `${amplitude}*(2*Y/H-1)*sin(${phase})`;
  if (warp.type === "jelly") { dx = `${amplitude}*0.65*sin(4*PI*Y/H-${phase})`; dy = `${amplitude}*0.35*sin(4*PI*X/W-${phase})`; }
  const x = `min(max(X+(${dx})*${weight}\\,0)\\,W-1)`;
  const y = `min(max(Y+(${dy})*${weight}\\,0)\\,H-1)`;
  const sample = (channel) => `${channel}='${channel}(${x}\\,${y})'`;
  return `${inputLabel}format=gbrap,geq=${["r", "g", "b", "alpha"].map((channel) => channel === "alpha" ? `a='alpha(${x}\\,${y})'` : sample(channel)).join(":")}:interpolation=bilinear[${outputLabel}]`;
}

function hasImageWarpMotion(raw = null) {
  const warp = normalizeImageWarp(raw);
  return warp.region.mode === "focus"
    ? warp.region.spots.some((spot) => spot.type !== "none")
    : warp.type !== "none";
}

function buildMontageImageWarpFilter(raw = null, options = {}) {
  const warp = normalizeImageWarp(raw);
  if (!hasImageWarpMotion(warp)) return "";
  if (warp.region.mode !== "focus" || warp.region.spots.every((spot) => spot.type === warp.type)) {
    return buildSingleMontageImageWarpFilter(warp, options);
  }
  const inputLabel = options.inputLabel || "[0:v]";
  const outputLabel = options.outputLabel || "image_warp";
  const activeSpots = warp.region.spots.filter((spot) => spot.type !== "none");
  const filters = [];
  let currentInput = inputLabel;
  activeSpots.forEach((spot, index) => {
    const nextLabel = index === activeSpots.length - 1 ? outputLabel : `${outputLabel}_spot_${index}`;
    filters.push(buildSingleMontageImageWarpFilter({
      ...warp,
      type: spot.type,
      region: { ...warp.region, spots: [spot] }
    }, { ...options, inputLabel: currentInput, outputLabel: nextLabel, labelPrefix: `spot_${index}_` }));
    currentInput = `[${nextLabel}]`;
  });
  return filters.join(";");
}

module.exports = { normalizeImageWarp, hasImageWarpMotion, buildMontageImageWarpFilter };
