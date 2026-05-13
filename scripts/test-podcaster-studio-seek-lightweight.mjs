import { readFileSync } from "node:fs";

const controllerSource = readFileSync(new URL("../public/podcaster-playback-controller.js", import.meta.url), "utf8");
const studioSource = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

if (!/const useLightweightSeek = options\.lightweight === true \|\| this\.deps\?\.useLightweightSeekDuringPlayback === true;/.test(controllerSource)) {
  throw new Error("El controller debe soportar seeks ligeros durante playback en Studio.");
}

if (!/await this\.tick\(ms, \{ lightweight: useLightweightSeek \}\);/.test(controllerSource)) {
  throw new Error("El seek del controller debe reutilizar el modo lightweight al sincronizar Studio.");
}

if (!/useLightweightSeekDuringPlayback: true,/.test(studioSource)) {
  throw new Error("Studio debe habilitar lightweight seek en el controller principal.");
}

if (!/enableExternalStudioPreviewSync: false,/.test(studioSource)) {
  throw new Error("Studio debe desactivar la resincronización externa del stage durante playback.");
}

console.log("Podcaster studio seek lightweight OK.");
