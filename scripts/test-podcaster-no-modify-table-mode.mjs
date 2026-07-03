import fs from "node:fs";

const root = "/Users/waldolopez/Documents/CharlyBrown";
const html = fs.readFileSync(`${root}/public/podcaster.html`, "utf8");
const podcaster = fs.readFileSync(`${root}/public/podcaster/podcaster.js`, "utf8");
const generator = fs.readFileSync(`${root}/public/podcaster/podcaster-script-generator.js`, "utf8");

if (!html.includes("composerNoModifyModeToggle_footer") || !html.includes("No modificar guión")) {
  throw new Error("podcaster.html debe incluir el switch No modificar guión en el composer.");
}

if (!/const COMPOSER_VIDEO_NO_MODIFY_MODE_KEY = "cb_podcaster_video_no_modify_mode_v1";/.test(podcaster)) {
  throw new Error("podcaster.js debe persistir el modo No modificar guión.");
}

if (!/composerVideoNoModifyMode === true[\s\S]*buildVideoScriptFromUnmodifiedTable\(prompt, promptHtml, sessionSnapshot\)[\s\S]*connectScriptSnapshotToPanel\(directTable\.script/.test(podcaster)) {
  throw new Error("El submit de video debe conectar la tabla directa antes de Componer/Crear.");
}

const noModifyBlock = podcaster.match(/if \(composerVideoNoModifyMode === true\) \{[\s\S]*?\n        \}\n        if \(!wantsCreate\)/)?.[0] || "";
if (!noModifyBlock) {
  throw new Error("No se pudo localizar el bloque No modificar guión antes de Componer/Crear.");
}

if (/handleGenerate|composeVideoScriptFromUserInput/.test(noModifyBlock)) {
  throw new Error("El modo No modificar guión no debe llamar a handleGenerate/Gemini.");
}

for (const key of ["script", "sceneDescription", "onScreenText", "visual"]) {
  if (!generator.includes(`"${key}"`)) {
    throw new Error(`La validación de tabla directa debe exigir ${key}.`);
  }
}

if (!/function buildVideoScriptFromUnmodifiedTable\(promptText = "", promptHtml = "", sessionSnapshot = null\)/.test(generator)) {
  throw new Error("podcaster-script-generator.js debe exponer buildVideoScriptFromUnmodifiedTable.");
}

if (!/registerPodcasterScriptGeneratorApi\(\{[\s\S]*buildVideoScriptFromUnmodifiedTable/.test(generator)) {
  throw new Error("buildVideoScriptFromUnmodifiedTable debe estar registrado en PodcasterScriptGeneratorApi.");
}

console.log("Podcaster no-modify table mode OK.");
