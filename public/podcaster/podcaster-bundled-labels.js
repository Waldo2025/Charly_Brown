// Canonical same-origin paths for label PNGs. Keeping them in one registry
// makes newly added templates and persisted labels resolve through one place.
export const BUNDLED_TEXT_LABELS = Object.freeze({
  "orbit-png": "/podcaster/assets/text-labels/orbit-png.png?v=2026-10-07.editorial-labels-2",
  "paint-png": "/podcaster/assets/text-labels/paint-png.png?v=2026-10-07.editorial-labels-2",
  "ribbon-png": "/podcaster/assets/text-labels/ribbon-png.png?v=2026-10-07.editorial-labels-2",
  "capsule-png": "/podcaster/assets/text-labels/capsule-png.png?v=2026-10-07.editorial-labels-2",
  "burst-png": "/podcaster/assets/text-labels/burst-png.png?v=2026-10-07.editorial-labels-2",
  "cloud-png": "/podcaster/assets/text-labels/cloud-png.png?v=2026-10-07.editorial-labels-2",
  "ticket-png": "/podcaster/assets/text-labels/ticket-png.png?v=2026-10-07.editorial-labels-2",
  "scallop-png": "/podcaster/assets/text-labels/scallop-png.png?v=2026-10-07.editorial-labels-2",
  "sunset-png": "/podcaster/assets/text-labels/sunset-png.png?v=2026-10-07.editorial-labels-2",
  "tag-png": "/podcaster/assets/text-labels/tag-png.png?v=2026-10-07.editorial-labels-2",
  "paper-png": "/podcaster/assets/text-labels/paper-png.png?v=2026-10-07.editorial-labels-2",
  "blush-png": "/podcaster/assets/text-labels/blush-png.png?v=2026-10-07.editorial-labels-2",
  "mint-png": "/podcaster/assets/text-labels/mint-png.png?v=2026-10-07.editorial-labels-2",
  "sky-png": "/podcaster/assets/text-labels/sky-png.png?v=2026-10-07.editorial-labels-2"
});

export function isBundledLabelTemplate(name = "") {
  const clean = String(name || "").trim().toLowerCase().replace(/\.png$/i, "");
  return Object.prototype.hasOwnProperty.call(BUNDLED_TEXT_LABELS, clean);
}

export function getBundledLabelDataUrl(name = "") {
  const clean = String(name || "").trim().toLowerCase().replace(/\.png$/i, "");
  return BUNDLED_TEXT_LABELS[clean] || null;
}

export function resolveBundledLabelSource(src = "", template = "") {
  const tKey = String(template || "").trim().toLowerCase().replace(/\.png$/i, "");
  if (BUNDLED_TEXT_LABELS[tKey]) return BUNDLED_TEXT_LABELS[tKey];
  const cleanSrc = String(src || "").trim().toLowerCase().split(/[?#]/, 1)[0];
  if (!cleanSrc) return null;
  for (const [key, path] of Object.entries(BUNDLED_TEXT_LABELS)) {
    if (cleanSrc.includes("/text-labels/" + key + ".png") || cleanSrc.endsWith("/" + key + ".png") || cleanSrc.endsWith(key + ".png")) return path;
  }
  return null;
}
