import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(
  new URL("../public/podcaster/podcaster.js", import.meta.url),
  "utf8"
);

function extractFunction(name) {
  const signature = `function ${name}`;
  const start = source.indexOf(signature);
  if (start === -1) throw new Error(`No se encontró ${name} en public/podcaster/podcaster.js`);
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
  buildApiUrl(path) {
    return `https://example.test${path}`;
  },
  buildApiUrlPreferRemote(path) {
    return `https://example.test${path}`;
  },
  hasAvailableApiBase() {
    return true;
  },
  deriveStoragePathFromMediaSource(downloadUrl, storagePath) {
    const cleanStoragePath = String(storagePath || "").trim();
    if (cleanStoragePath) return cleanStoragePath;
    const cleanUrl = String(downloadUrl || "").trim();
    if (cleanUrl.startsWith("gs://")) return cleanUrl;
    try {
      const match = new URL(cleanUrl).pathname.match(/^\/(?:v0\/)?b\/[^/]+\/o\/(.+)$/i);
      return match ? decodeURIComponent(match[1]) : "";
    } catch (_) {
      return "";
    }
  },
  isMarkedStaleProxyMediaUrl() {
    return false;
  },
  resolveStaleAwareProxyMediaUrl(downloadUrl, storagePath) {
    let cleanStoragePath = String(storagePath || "").trim();
    if (cleanStoragePath.startsWith("gs://")) {
      cleanStoragePath = cleanStoragePath.replace(/^gs:\/\/[^/]+\//i, "");
    }
    return cleanStoragePath
      ? `https://example.test/api/assets/proxy-media?storagePath=${encodeURIComponent(cleanStoragePath)}`
      : String(downloadUrl || "").trim()
        ? `https://example.test/api/assets/proxy-media?url=${encodeURIComponent(String(downloadUrl || "").trim())}`
        : "";
  },
  resolveDateIso(value) {
    return String(value || "");
  },
  window: {
    location: {
      origin: "https://example.test"
    }
  },
  URL,
  console
};

vm.createContext(context);
vm.runInContext(`${extractFunction("resolveStorageAudioUrl")};`, context);
vm.runInContext(`${extractFunction("resolveStorageVideoUrl")};`, context);
vm.runInContext(`${extractFunction("resolveStorageMediaUrl")};`, context);

test("podcaster resolveStorageAudioUrl converts gs:// audio into proxy-media storagePath fallback", () => {
  const gsUrl = "gs://bucket-name/podcaster/sessions/session-audio/audio/row-1/file.wav";
  const resolved = context.resolveStorageAudioUrl(gsUrl, "");
  assert.equal(
    resolved,
    "https://example.test/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fsession-audio%2Faudio%2Frow-1%2Ffile.wav"
  );
});

test("podcaster resolveStorageAudioUrl keeps plain storagePath on storagePath proxy route", () => {
  const resolved = context.resolveStorageAudioUrl("", "podcaster/sessions/session-audio/audio/row-1/file.wav");
  assert.equal(
    resolved,
    "https://example.test/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fsession-audio%2Faudio%2Frow-1%2Ffile.wav"
  );
});

test("podcaster resolveStorageVideoUrl converts gs:// video into proxy-media storagePath fallback", () => {
  const gsUrl = "gs://bucket-name/podcaster/sessions/session-video/videos/row-1/file.mp4";
  const resolved = context.resolveStorageVideoUrl(gsUrl, "");
  assert.equal(
    resolved,
    "https://example.test/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fsession-video%2Fvideos%2Frow-1%2Ffile.mp4"
  );
});

test("podcaster resolveStorageMediaUrl firma la ruta del objeto en lugar de url=", () => {
  const portraitUrl = "https://firebasestorage.googleapis.com/v0/b/charly-brown.firebasestorage.app/o/podcaster%2Fsessions%2Fs-1%2Fowners%2Fu-1%2Fspeakers%2Fhost-a.png?alt=media&token=abc";
  const resolved = context.resolveStorageMediaUrl(portraitUrl);
  assert.equal(
    resolved,
    "https://example.test/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fs-1%2Fowners%2Fu-1%2Fspeakers%2Fhost-a.png"
  );
  assert.doesNotMatch(resolved, /[?&]url=/);
});

// functions/src/assets.js lee sólo `storagePath` y exige el prefijo podcaster/,
// así que cualquier proxy con `url=` devuelve 400 invalid_storage_path.
test("podcaster no construye proxies con el parámetro url= que la API de assets rechaza", () => {
  assert.doesNotMatch(source, /\/api\/assets\/proxy-(?:media|image)\?url=/);
});

test("el editor autoriza Storage directo con el SDK y la galería con el resolver directo", () => {
  // Dos controladores (reproducción y vista previa del export), como home.js.
  assert.equal(source.match(/preferDirectFirebaseStorage: true/g)?.length, 2);
  assert.match(source, /resolveDirectRecord: async/);
  assert.match(
    source,
    /import \{ createAuthorizedAssetResolver \} from "\.\/podcaster-authorized-asset-resolver\.js\?v=2026-10-05\.gs-path-normalize-1"/
  );
});

// El selector de reemplazo persiste estas URLs en Firestore y el reproductor las
// vuelve a leer: una `gs://bucket/...` dentro de `?storagePath=` no pasa el filtro
// `podcaster/sessions/` del controlador y la escena queda sin imagen.
const replacementSource = readFileSync(
  new URL("../public/podcaster/podcaster-media-replacement.js", import.meta.url),
  "utf8"
);

const controllerSource = readFileSync(
  new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url),
  "utf8"
);

test("el selector normaliza gs:// antes de construir URLs de proxy", () => {
  assert.match(
    replacementSource,
    /import \{ normalizeAssetStoragePath \} from "\.\/podcaster-authorized-asset-resolver\.js\?v=2026-10-05\.gs-path-normalize-1"/
  );
  assert.equal((replacementSource.match(/proxy-(?:media|image)\?storagePath=/g) || []).length, 3);
  assert.equal((replacementSource.match(/normalizeAssetStoragePath\(/g) || []).length, 4);
  assert.doesNotMatch(replacementSource, /String\(storagePath \|\| ""\)\.trim\(\)/);
});

// Imagen de la galería usada como capa de escena: la URL lógica es un proxy de
// /api/assets, pero la API no firma rutas `images/...` y el <img> recibía 400.
const homeSource = readFileSync(
  new URL("../public/js/home.js", import.meta.url),
  "utf8"
);

test("el controlador resuelve por SDK las URLs que la API de assets no firma", () => {
  assert.match(
    controllerSource,
    /import \{ isAssetApiStoragePath, normalizeAssetStoragePath \} from "\.\/podcaster-authorized-asset-resolver\.js\?v=2026-10-05\.gs-path-normalize-1"/
  );
  const stageStart = controllerSource.indexOf("async resolveStageImageSource(");
  // Anclar en la *definición* de preloadImageSrc: el nombre solo aparece antes
  // como call site y el slice quedaría invertido.
  const stageEnd = controllerSource.indexOf('  preloadImageSrc(src = "") {', stageStart);
  assert.ok(stageStart >= 0 && stageEnd > stageStart, "no se encontró resolveStageImageSource");
  const stageResolver = controllerSource.slice(stageStart, stageEnd);
  assert.match(stageResolver, /const gallerySource = await this\.resolveNonAssetApiProxySource\(cleanSrc\);/);
  // Debe convertirse antes de preguntar por la autorización de la API: si no, el
  // proxy se queda como src y el navegador recibe el 400.
  assert.ok(
    controllerSource.indexOf("async resolveNonAssetApiProxySource")
    < controllerSource.indexOf("const gallerySource = await this.resolveNonAssetApiProxySource")
  );
  assert.ok(
    stageResolver.indexOf("resolveNonAssetApiProxySource")
    < stageResolver.indexOf("requiresAuthorizedAssetResolution")
  );
  // El SDK devuelve el `gs://` original cuando falla: no vale usarlo como src.
  assert.match(controllerSource, /return \/\^https\?:\/i\.test\(directUrl\) \? directUrl : "";/);
  // getBlobUrlSync en modo streaming devolvía el proxy sin resolver, así que el
  // corta-circuito de resolveStageImageSource nunca llegaba al SDK.
  const streamingCache = controllerSource.slice(
    controllerSource.indexOf("  getBlobUrlSync(url) {"),
    controllerSource.indexOf('  requiresAuthorizedAssetResolution(url = "") {')
  );
  assert.ok(streamingCache.length > 0 && streamingCache.includes("blobCache"), "no se encontró getBlobUrlSync");
  assert.match(streamingCache, /if \(!this\.isAssetApiSignableProxyUrl\(finalUrl\)\) return null;/);
  assert.match(
    controllerSource,
    /return isAssetApiStoragePath\(normalizeAssetStoragePath\(parsed\.searchParams\.get\("storagePath"\) \|\| ""\)\);/
  );
});

test("editor y reproductor comparten la misma instancia del controlador", () => {
  const pin = (src) => String(src.match(/podcaster-playback-controller\.js\?v=([^"']+)/)?.[1] || "");
  assert.ok(pin(source), "podcaster.js debe fijar la versión del controlador");
  assert.equal(pin(homeSource), pin(source), "un pin distinto cargaría dos controladores");
});
