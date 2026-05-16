import { readFileSync } from "node:fs";

const front = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const back = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!/id="montageExportPreviewVideo"/.test(html)) {
  throw new Error("El modal de export debe incluir un <video> para el preview real del montaje.");
}

if (!/mediaType:\s*String\(result\?\.previewMimeType \|\| "video\/mp4"\)\.trim\(\) \|\| "video\/mp4"/.test(back)
  || !/const previewDataUrl = `data:\$\{String\(result\?\.previewMimeType \|\| "video\/mp4"\)\.trim\(\)\};base64,\$\{Buffer\.from\(result\?\.previewBuffer \|\| Buffer\.alloc\(0\)\)\.toString\("base64"\)\}`;/.test(back)) {
  throw new Error("El backend debe responder mediaType y previewDataUrl para el preview del montaje.");
}

if (!/const preview = await renderMontagePreviewMedia\(input, \{ uid, baseUrl: resolvePublicBaseUrl\(req\) \|\| `http:\/\/127\.0\.0\.1:\$\{PORT\}` \}\);/.test(back)) {
  throw new Error("La ruta del preview debe usar el renderer de preview real de video.");
}

if (!/const isVideoPreview = hasReadyPreview && montageExportPreviewState\.mediaType\.startsWith\("video\/"\);/.test(front)
  || !/els\.montageExportPreviewVideo\.src = montageExportPreviewState\.dataUrl;/.test(front)
  || !/data\?\.previewDataUrl \|\| data\?\.imageDataUrl \|\| ""/.test(front)) {
  throw new Error("El frontend debe aceptar previewDataUrl/mediaType y renderizar video cuando corresponda.");
}

console.log("Podcast montage preview video OK.");
