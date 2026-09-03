import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const creatorHtml = readFileSync(new URL("../public/PigPenCreator.html", import.meta.url), "utf8");
const creatorJs = readFileSync(new URL("../public/js/PigPenCreator.js", import.meta.url), "utf8");
const viewerHtml = readFileSync(new URL("../public/PigPen-Visor.html", import.meta.url), "utf8");
const viewerJs = readFileSync(new URL("../public/js/PigPen-Visor.js", import.meta.url), "utf8");
const functionsIndex = readFileSync(new URL("../functions/src/index.js", import.meta.url), "utf8");
const firebaseConfig = JSON.parse(readFileSync(new URL("../firebase.json", import.meta.url), "utf8"));

assert.match(creatorHtml, /id="btnShareEscapeRoom"[\s\S]*aria-haspopup="menu"/, "El header debe incluir el botón Compartir.");
assert.match(creatorHtml, /data-er-share-action="copy"[\s\S]*Copiar enlace/, "El menú debe permitir copiar el enlace.");
assert.match(creatorHtml, /data-er-share-action="open"[\s\S]*Abrir enlace/, "El menú debe permitir abrir el enlace.");
assert.match(creatorJs, /authFetchJson\("\/api\/pigpen\/share"/, "El Creator debe crear un enlace tokenizado en backend.");
assert.match(creatorJs, /new URL\("PigPen-Visor\.html"/, "El enlace compartido debe abrir el visor nuevo.");

assert.match(viewerHtml, /id="pvGameFrame"[\s\S]*allowfullscreen/, "El visor debe alojar el juego completo en un iframe.");
assert.match(viewerJs, /fetchSharedSession[\s\S]*\/api\/pigpen\/share\//, "El visor debe cargar dinámicamente la sesión compartida.");
assert.match(viewerJs, /buildPreviewDocument\(project/, "El visor debe reutilizar el runtime jugable oficial.");
assert.match(viewerJs, /state\.session\.topics/, "El visor debe permitir navegar los temas de la sesión.");
assert.doesNotMatch(viewerJs, /firebase-firestore|escapeRoom"\)/, "El visor público no debe acceder directamente a Firestore.");

assert.match(functionsIndex, /registerPigPenShareRoutes\(assetApp\)/, "assetApi debe registrar las rutas públicas de PigPen.");
const pigPenRewrite = firebaseConfig.hosting.rewrites.find((rewrite) => rewrite.source === "/api/pigpen/**");
assert.equal(pigPenRewrite?.function?.functionId, "assetApi", "Hosting debe dirigir /api/pigpen/** a assetApi.");

console.log("PigPen shared viewer OK.");
