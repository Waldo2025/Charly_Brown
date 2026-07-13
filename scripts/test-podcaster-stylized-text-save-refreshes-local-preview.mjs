import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster-media-editor.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");

if (!/function invalidateStylizedTextBitmapCache\(textData = null\)/.test(source)) {
  throw new Error("El editor debe poder invalidar el cache bitmap del texto estilizado.");
}

if (!/await updateDoc\(sessionRef, \{[\s\S]*\[textMapRef\]: json[\s\S]*\}\);[\s\S]*invalidateStylizedTextBitmapCache\(\);[\s\S]*window\.PodcasterUI\.upsertActiveSession\(\(current\) => \(\{[\s\S]*stylizedTextMap:[\s\S]*\[currentEditingRowId\]: json[\s\S]*\}\), \{ render: false, persist: true, markDirty: true, autosaveReason: "stylized-text" \}\);[\s\S]*window\.PodcasterUI\.render\(\);/m.test(source)) {
  throw new Error("Guardar texto estilizado debe actualizar activeSession/localStorage y renderizar sin esperar recarga.");
}

if (!/data-cache-src="podcaster\/podcaster-media-editor\.js" data-cache-type="module"/.test(html)) {
  throw new Error("podcaster.html debe cargar podcaster-media-editor.js por cache-version-loader para publicar el fix vigente.");
}

console.log("Podcaster stylized text save refreshes local preview OK.");
