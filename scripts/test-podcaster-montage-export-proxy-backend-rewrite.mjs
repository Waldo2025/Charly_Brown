import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-montage-export.js",
  "utf8"
);

function extractFunction(name) {
  const signature = `function ${name}`;
  const start = source.indexOf(signature);
  if (start === -1) throw new Error(`No se encontró ${name}`);
  let parenDepth = 0;
  let braceStart = -1;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth -= 1;
    if (char === "{" && parenDepth === 0) {
      braceStart = index;
      break;
    }
  }
  if (braceStart === -1) throw new Error(`No se encontró el cuerpo de ${name}`);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`No se pudo extraer ${name}`);
}

const context = {
  URL,
  window: {
    location: {
      origin: "https://charly-brown.web.app"
    }
  },
  buildApiUrlPreferRemote: (path = "") => `https://charly-brown-gemini-backend.onrender.com${path}`,
  buildExportApiUrl: (path = "") => `https://snoopy-export.onrender.com${path}`
};
context.window.resolveFirebaseStorageUrl = async (gsUrl = "") => `https://firebasestorage.googleapis.com/direct/${encodeURIComponent(gsUrl)}`;

vm.createContext(context);
vm.runInContext(`${extractFunction("normalizeMontageSubmissionMediaUrl")};${extractFunction("buildMontageStorageGsUrl")};${extractFunction("parseMontageFirebaseStorageObjectUrl")};${extractFunction("deriveMontageStoragePathFromMediaSource")};${extractFunction("isMontageProxyMediaUrl")};async ${extractFunction("resolveMontageSceneMediaSourceUrl")};`, context);

assert.equal(
  context.normalizeMontageSubmissionMediaUrl("/api/assets/proxy-media?storagePath=podcaster%2Flibrary%2Fmusic%2Ftrack.mp3"),
  "https://snoopy-export.onrender.com/api/assets/proxy-media?storagePath=podcaster%2Flibrary%2Fmusic%2Ftrack.mp3",
  "Las rutas relativas proxy-media del payload deben apuntar a snoopy-export."
);

assert.equal(
  context.normalizeMontageSubmissionMediaUrl(
    "https://charly-brown-gemini-backend.onrender.com/api/assets/proxy-media?url=https%3A%2F%2Ffirebasestorage.googleapis.com%2Fv0%2Fb%2Fbucket%2Fo%2Fscene.mp4%3Falt%3Dmedia"
  ),
  "https://snoopy-export.onrender.com/api/assets/proxy-media?url=https%3A%2F%2Ffirebasestorage.googleapis.com%2Fv0%2Fb%2Fbucket%2Fo%2Fscene.mp4%3Falt%3Dmedia",
  "Las URLs absolutas de proxy-media que aún apuntan a Gemini deben reescribirse a snoopy-export."
);

assert.equal(
  context.normalizeMontageSubmissionMediaUrl(
    "https://charly-brown-gemini-backend.onrender.com/api/assets/proxy-image?url=https%3A%2F%2Ffirebasestorage.googleapis.com%2Fv0%2Fb%2Fbucket%2Fo%2Fthumb.png%3Falt%3Dmedia&noRange=1"
  ),
  "https://snoopy-export.onrender.com/api/assets/proxy-image?url=https%3A%2F%2Ffirebasestorage.googleapis.com%2Fv0%2Fb%2Fbucket%2Fo%2Fthumb.png%3Falt%3Dmedia&noRange=1",
  "proxy-image también debe reescribirse al backend de export cuando viaje dentro del payload."
);

assert.equal(
  await context.resolveMontageSceneMediaSourceUrl({
    url: "https://charly-brown-gemini-backend.onrender.com/api/assets/proxy-media?url=https%3A%2F%2Ffirebasestorage.googleapis.com%2Fv0%2Fb%2Fcharly-brown.firebasestorage.app%2Fo%2Fpodcaster%252Fsessions%252Fsession_omz5q1yf%252Fowners%252F9ifaac0zddou10egfq33owkuthx2%252Fvideos%252Frow_mjyqbopi-narrador%252Fcb38eb77-cd26-40bd-9040-1233c5976cba.mp4%3Falt%3Dmedia%26token%3DREDACTED"
  }, "video"),
  "https://firebasestorage.googleapis.com/direct/gs%3A%2F%2Fcharly-brown.firebasestorage.app%2Fpodcaster%2Fsessions%2Fsession_omz5q1yf%2Fowners%2F9ifaac0zddou10egfq33owkuthx2%2Fvideos%2Frow_mjyqbopi-narrador%2Fcb38eb77-cd26-40bd-9040-1233c5976cba.mp4",
  "La hidratación previa al POST debe extraer la ruta Firebase anidada y resolver directo con Firebase Storage SDK."
);

assert.equal(
  await context.resolveMontageSceneMediaSourceUrl({
    storagePath: "podcaster/sessions/session_abc/owners/user/videos/row_1/scene.mp4",
    url: "https://charly-brown-gemini-backend.onrender.com/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fsession_abc%2Fowners%2Fuser%2Fvideos%2Frow_1%2Fscene.mp4"
  }, "video"),
  "https://firebasestorage.googleapis.com/direct/gs%3A%2F%2Fcharly-brown.firebasestorage.app%2Fpodcaster%2Fsessions%2Fsession_abc%2Fowners%2Fuser%2Fvideos%2Frow_1%2Fscene.mp4",
  "La hidratación del export debe preferir Firebase Storage directo cuando hay storagePath, aunque url/downloadUrl apunte a proxy-media viejo."
);

assert.equal(
  await context.resolveMontageSceneMediaSourceUrl({
    url: "https://charly-brown-gemini-backend.onrender.com/api/assets/proxy-media?storagePath=gs%3A%2F%2Fcharly-brown.firebasestorage.app%2Fpodcaster%2Fsessions%2Fsession_cmmy944e%2Fowners%2F9ifaac0zddou10egfq33owkuthx2%2Fvideos%2Frow_pbuhgnrj-narrador%2F2af3c740-be88-424f-bd72-97f484ecb7ed.mp4&u=2026-05-05T03%3A17%3A36.691Z"
  }, "video"),
  "https://firebasestorage.googleapis.com/direct/gs%3A%2F%2Fcharly-brown.firebasestorage.app%2Fpodcaster%2Fsessions%2Fsession_cmmy944e%2Fowners%2F9ifaac0zddou10egfq33owkuthx2%2Fvideos%2Frow_pbuhgnrj-narrador%2F2af3c740-be88-424f-bd72-97f484ecb7ed.mp4",
  "La hidratación del preview/export debe extraer storagePath desde proxy-media viejo y resolverlo con Firebase Storage SDK directo."
);

assert.match(
  source,
  /if \(isMontageProxyMediaUrl\(src\) && storagePath\) \{\s*src = "";\s*\}/,
  "El preview de export no debe conservar un src proxy-media cuando hay storagePath."
);

assert.match(
  source,
  /if \(!src && !storagePath\) \{\s*src = String\(window\.resolveStorageVideoUrl\(rawUrl, storagePath\) \|\| ""\)\.trim\(\);\s*\}/,
  "El preview de export solo puede caer a resolveStorageVideoUrl si no existe storagePath."
);

assert.ok(
  source.includes("if (/^https?:\\/\\//i.test(cleanStorageCandidate)) {")
    && source.includes("if (isMontageProxyMediaUrl(cleanStorageCandidate)) continue;"),
  "El preview progresivo de export-status debe ignorar currentDownloadUrl proxy-media en vez de reutilizarlo."
);

console.log("Podcaster montage export rewrites proxy asset URLs to snoopy-export OK.");
