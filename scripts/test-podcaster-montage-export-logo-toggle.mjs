import fs from "node:fs";

const root = "/Users/waldolopez/Documents/CharlyBrown";
const montage = fs.readFileSync(`${root}/public/podcaster/podcaster-montage-export.js`, "utf8");
const backend = fs.readFileSync(`${root}/backend/server.js`, "utf8");

if (!/function isMontageExportLogoEnabled\(\)[\s\S]*montageExportIncludeLogo[\s\S]*window\.montageExportState\.includeLogo = checkbox\.checked === true;[\s\S]*return window\.montageExportState\.includeLogo !== false;/.test(montage)) {
  throw new Error("El payload de export debe leer el checkbox montageExportIncludeLogo vivo antes de exportar.");
}

if (!/function buildMontageBrandOverlayForExport\(isReel = false\) \{[\s\S]*const includeLogo = isMontageExportLogoEnabled\(\);[\s\S]*enabled: includeLogo,/.test(montage)) {
  throw new Error("brandOverlay.enabled debe depender del checkbox vivo, no de un estado stale.");
}

if (!/const includeLogo = isMontageExportLogoEnabled\(\);[\s\S]*includeLogo,[\s\S]*brandOverlay: buildMontageBrandOverlayForExport\(reelModeEnabled\)/.test(montage)) {
  throw new Error("El payload debe enviar includeLogo top-level junto al brandOverlay.");
}

if (!/const includeLogoExplicitlyDisabled = raw\?\.includeLogo === false;/.test(backend)) {
  throw new Error("El backend debe reconocer includeLogo:false como anulación explícita.");
}

if (!/enabled: brandOverlayRaw\?\.enabled !== false && !includeLogoExplicitlyDisabled/.test(backend)) {
  throw new Error("El backend debe apagar brandOverlay si includeLogo es false.");
}

console.log("Podcaster montage export logo toggle OK.");
