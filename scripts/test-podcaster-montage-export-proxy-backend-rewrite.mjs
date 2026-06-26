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

vm.createContext(context);
vm.runInContext(`${extractFunction("normalizeMontageSubmissionMediaUrl")};async ${extractFunction("resolveMontageSceneMediaSourceUrl")};`, context);

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
  "https://snoopy-export.onrender.com/api/assets/proxy-media?url=https%3A%2F%2Ffirebasestorage.googleapis.com%2Fv0%2Fb%2Fcharly-brown.firebasestorage.app%2Fo%2Fpodcaster%252Fsessions%252Fsession_omz5q1yf%252Fowners%252F9ifaac0zddou10egfq33owkuthx2%252Fvideos%252Frow_mjyqbopi-narrador%252Fcb38eb77-cd26-40bd-9040-1233c5976cba.mp4%3Falt%3Dmedia%26token%3DREDACTED",
  "La hidratación previa al POST también debe descargar proxy-media desde snoopy-export, no desde Gemini."
);

console.log("Podcaster montage export rewrites proxy asset URLs to snoopy-export OK.");
