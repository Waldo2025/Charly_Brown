import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const activeBrowserFiles = [
  "firebase.json",
  "public/cors.json",
  "public/js/api-client.js",
  "public/js/runtime-config.js",
  "public/js/generarUnidad.js",
  ...fs.readdirSync(path.join(root, "public/podcaster"))
    .filter((name) => name.endsWith(".js"))
    .map((name) => `public/podcaster/${name}`)
];

for (const relativePath of activeBrowserFiles) {
  const source = read(relativePath);
  assert.doesNotMatch(
    source,
    /onrender\.com|snoopy-export|charly-brown-podcaster-queue|charly-brown-gemini-backend|gemini-veo/i,
    `${relativePath} no debe conservar rutas activas de Render.`
  );
}

for (const relativePath of ["public/podcaster.html", "public/video-player.html"]) {
  const html = read(relativePath);
  const baseDirectory = path.dirname(path.join(root, relativePath));
  const assetReferences = [...html.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)]
    .map((match) => match[1])
    .filter((reference) => !/^(?:https?:|data:|\/\/)/.test(reference));

  for (const reference of assetReferences) {
    const assetPath = reference.startsWith("/")
      ? path.join(root, "public", reference)
      : path.resolve(baseDirectory, reference);
    assert.ok(fs.existsSync(assetPath), `${relativePath} referencia un archivo ausente: ${reference}`);
  }
}

const podcasterHtml = read("public/podcaster.html");
const podcasterCss = read("public/podcaster.css");
const videoPlayerHtml = read("public/video-player.html");
const podcasterSource = read("public/podcaster/podcaster.js");
const runtimeConfigSource = read("public/js/runtime-config.js");
const apiClientSource = read("public/js/api-client.js");
const mediaRuntimeSource = read("public/podcaster/podcaster-media-runtime.js");
const playbackControllerSource = read("public/podcaster/podcaster-playback-controller.js");
const runtimeConfigLoaderSource = read("public/js/runtime-config-loader.js");
const montageExportSource = read("public/podcaster/podcaster-montage-export.js");
const montageExportV2Source = read("public/podcaster/podcaster-montage-export-v2.js");

assert.match(podcasterHtml, /data-cache-href=["']podcaster\.css/);
assert.match(podcasterCss, /is-snoopy-editor-light-theme/);
assert.match(podcasterCss, /is-snoopy-editor-mid-theme/);
assert.match(videoPlayerHtml, /data-video-player-theme=["']mid["']/);
assert.match(videoPlayerHtml, /data-video-player-theme=["']light["']/);
assert.match(videoPlayerHtml, /const themes = \["dark", "mid", "light"\]/);
assert.match(podcasterSource, /createPodcasterLiveProxyAdapter/);
assert.match(podcasterSource, /tokenJson\?\.websocketUrl/);
assert.match(podcasterSource, /tokenJson\?\.ticket/);
assert.doesNotMatch(podcasterSource, /apiKey:\s*liveApiKey|loadGoogleGenAiLiveModule/);
assert.match(runtimeConfigSource, /const __charlyGoogleApiBase = "https:\/\/charly-brown\.web\.app\/api"/);
assert.doesNotMatch(runtimeConfigSource, /__charlyIsLocalRuntime\s*\?\s*"http:\/\/127\.0\.0\.1/);
assert.match(apiClientSource, /return DEFAULT_GOOGLE_API_BASE/);
assert.match(playbackControllerSource, /!this\.hasFirebaseDirectAccessToken\(finalUrl\)/);
assert.match(playbackControllerSource, /resolveAuthorizedAssetUrl/);
assert.match(playbackControllerSource, /requiresAuthorizedAssetResolution/);
assert.match(playbackControllerSource, /async resolveStageImageSource\(src = ""\)/);
assert.match(
  playbackControllerSource,
  /preloadImageSrc\(src = ""\)[\s\S]*resolveStageImageSource\(cleanSrc\)[\s\S]*probe\.src = resolvedSrc/,
  "Las imágenes privadas deben resolverse a una URL firmada antes de precargarse."
);
assert.match(
  playbackControllerSource,
  /ensureStageImageReady\(imageEl, resolvedSrc, \{ sourceKey: cleanSrc \}\)/,
  "El stage debe cargar la URL firmada conservando la fuente lógica de la escena."
);
assert.match(podcasterSource, /\/api\/assets\/signed-url\?storagePath=/);
assert.match(runtimeConfigLoaderSource, /window\.__CHARLY_RUNTIME_CONFIG_READY__ = \(async \(\) =>/);
assert.match(podcasterSource, /await window\.__CHARLY_RUNTIME_CONFIG_READY__/);
assert.match(
  montageExportSource,
  /authFetchJson\(exportStatusUrl,\s*\{\s*auth:\s*true,\s*preferRemote:\s*false/s,
  "El polling privado de export-status debe conservar el Firebase ID token."
);
assert.match(montageExportSource, /waiting_capacity: "Esperando un turno disponible/);
assert.match(montageExportSource, /worker_starting: "Iniciando el motor de exportación/);
assert.match(montageExportSource, /if \(String\(level \|\| ""\)\.trim\(\) === "debug"\) return null/);
assert.doesNotMatch(montageExportV2Source, /setMontageExportStatus\([^)]*FFmpeg v2/s);
assert.match(montageExportSource, /function describeMontageExportLogSummary/);
assert.match(montageExportSource, /summary: summarizeMontageExportLogPayload\(payload\) \|\| describeMontageExportLogSummary\(event, payload\)/);

globalThis.window = { location: { origin: "http://127.0.0.1:5010" } };
const mediaRuntimeModule = await import(`data:text/javascript;base64,${Buffer.from(mediaRuntimeSource).toString("base64")}`);
const mediaRuntime = mediaRuntimeModule.createPodcasterMediaRuntimeApi({
  buildApiUrlPreferRemote: (route) => `https://charly-brown.web.app${route}`,
  buildApiUrl: (route) => `https://charly-brown.web.app${route}`
});
const tokenizedMedia = "https://firebasestorage.googleapis.com/v0/b/charly-brown.firebasestorage.app/o/podcaster%2Fsessions%2Fsession-1%2Fvideo.mp4?alt=media&token=token-1";
assert.equal(mediaRuntime.resolveStaleAwareProxyMediaUrl(tokenizedMedia, "", "media"), tokenizedMedia);
const legacyProxy = `http://127.0.0.1:5010/api/assets/proxy-media?url=${encodeURIComponent(tokenizedMedia)}`;
assert.equal(mediaRuntime.resolveStaleAwareProxyMediaUrl(legacyProxy, "", "media"), tokenizedMedia);
const protectedMedia = "https://firebasestorage.googleapis.com/v0/b/charly-brown.firebasestorage.app/o/podcaster%2Fsessions%2Fsession-1%2Fprivate.mp4?alt=media";
const protectedResolved = mediaRuntime.resolveStaleAwareProxyMediaUrl(protectedMedia, "", "media");
assert.match(protectedResolved, /^https:\/\/charly-brown\.web\.app\/api\/assets\/proxy-media\?storagePath=/);
assert.doesNotMatch(protectedResolved, /[?&]url=/);

const firebaseConfig = JSON.parse(read("firebase.json"));
const rewrites = firebaseConfig.hosting.rewrites;
const functionRewrites = rewrites.filter((rewrite) => rewrite.function);
assert.ok(functionRewrites.length >= 4, "Hosting debe enrutar las APIs a Functions.");
assert.ok(
  functionRewrites.every((rewrite) => rewrite.function.pinTag === undefined),
  "Los previews Gen2 deben evitar pinTag: entra en conflicto con minInstances y con actualizaciones concurrentes de Cloud Run."
);
assert.ok(functionRewrites.every((rewrite) => rewrite.function.region === "us-central1"));

console.log("Google Cloud browser cutover, assets and themes OK.");
