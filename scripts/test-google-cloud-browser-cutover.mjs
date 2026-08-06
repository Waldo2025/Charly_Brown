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

const firebaseConfig = JSON.parse(read("firebase.json"));
const rewrites = firebaseConfig.hosting.rewrites;
const functionRewrites = rewrites.filter((rewrite) => rewrite.function);
assert.ok(functionRewrites.length >= 4, "Hosting debe enrutar las APIs a Functions.");
assert.ok(functionRewrites.every((rewrite) => rewrite.function.pinTag === true));
assert.ok(functionRewrites.every((rewrite) => rewrite.function.region === "us-central1"));

console.log("Google Cloud browser cutover, assets and themes OK.");
