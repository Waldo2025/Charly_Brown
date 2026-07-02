import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");

if (!/async function resolveMontageExportFrontendPreview/.test(source)) {
  throw new Error("No existe resolveMontageExportFrontendPreview.");
}

if (source.includes("proxy_media_bypassed") || source.includes('source: "firebase_direct"')) {
  throw new Error("El preview de export no debe reemplazar proxy-media por URLs directas de Firebase Storage.");
}

if (!/window\.resolveStorageVideoUrl\(directDownloadUrl \|\| rawUrl,\s*storagePath,\s*\{[\s\S]*mimeType: video\?\.mimeType \|\| "video\/mp4"/m.test(source)) {
  throw new Error("El preview de export debe resolver videos remotos mediante resolveStorageVideoUrl y storagePath.");
}

if (!/targetMediaEl\.src = window\.montageExportPreviewState\.dataUrl;/.test(source)) {
  throw new Error("El preview debe seguir asignando el src resuelto al elemento de video.");
}

console.log("Podcaster montage export preview uses proxy-media for Firebase videos OK.");
