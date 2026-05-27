import { readFileSync } from "node:fs";

const front = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const back = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/podcaster.css", import.meta.url), "utf8");

if (!/id="montageExportPreviewVideo"/.test(html)) {
  throw new Error("El modal de export debe incluir un <video> para el preview real del montaje.");
}

if (!/mediaType:\s*String\(result\?\.previewMimeType \|\| "video\/mp4"\)\.trim\(\) \|\| "video\/mp4"/.test(back)
  || !/const previewDataUrl = `data:\$\{String\(result\?\.previewMimeType \|\| "video\/mp4"\)\.trim\(\)\};base64,\$\{Buffer\.from\(result\?\.previewBuffer \|\| Buffer\.alloc\(0\)\)\.toString\("base64"\)\}`;/.test(back)) {
  throw new Error("El backend debe responder mediaType y previewDataUrl para el preview del montaje.");
}

if (!/async function renderMontagePreviewMedia\(rawInput = \{\}, context = \{\}\)/.test(back)
  || !/const frontendPreview = resolveMontageExportFrontendPreview\(payload, previewRowId\);/.test(readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8"))) {
  throw new Error("El preview debe mantener disponible el renderer real y el preview frontend del modal.");
}

if (!/const isVideoPreview = hasReadyPreview && window\.montageExportPreviewState\.mediaType\.startsWith\("video\/"\);/.test(front)
  || !/window\.els\.montageExportPreviewVideo\.src = window\.montageExportPreviewState\.dataUrl;/.test(front)
  || !/mediaType: frontendPreview\.mediaType \|\| "video\/mp4"/.test(front)) {
  throw new Error("El frontend debe aceptar mediaType y renderizar video cuando corresponda.");
}

if (!/\.montage-export-preview-container \.podcast-active-speaker-video,[\s\S]*\.montage-export-preview-container \.podcast-active-speaker-image[\s\S]*object-fit: contain;/.test(css)
  || !/\.montage-export-preview\[data-reel="true"\] \.montage-export-preview-container \.podcast-active-speaker-video,[\s\S]*object-fit: cover;/.test(css)
  || /\.montage-export-preview-stage video\s*\{[\s\S]*object-fit: cover;/.test(css)) {
  throw new Error("El preview del export debe usar el mismo object-fit que el stage principal: contain normal y cover solo en reel.");
}

console.log("Podcast montage preview video OK.");
