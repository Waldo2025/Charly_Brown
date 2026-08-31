import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/js/home.js", import.meta.url), "utf8");
const controllerSource = readFileSync(
  new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url),
  "utf8"
);

function extractFunction(name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `No se encontró ${name}`);
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`No se pudo extraer ${name}`);
}

function createMediaResolver() {
  const context = {
    URL,
    app: { options: { storageBucket: "charly-brown.firebasestorage.app" } },
    window: {
      location: { origin: "https://charly-brown.firebaseapp.com" },
      __CHARLY_CONFIG__: { firebase: { storageBucket: "charly-brown.firebasestorage.app" } }
    }
  };
  vm.createContext(context);
  [
    "parseFirebaseStorageObjectUrl",
    "getDirectMediaStorageBucket",
    "parseGsStorageReference",
    "unwrapLegacyMediaProxy",
    "buildDirectFirebaseMediaReference"
  ].forEach((name) => vm.runInContext(`${extractFunction(name)};`, context));
  return context.buildDirectFirebaseMediaReference;
}

test("video-player resolves legacy private assets with Firebase Storage instead of Functions", () => {
  assert.match(
    source,
    /async function resolveAuthorizedAssetUrl\(proxyUrl = ""\)[\s\S]*?buildDirectFirebaseMediaReference\(proxyUrl, ""\)[\s\S]*?resolveFirebaseStorageUrl/,
  );
  const resolverBlock = source.slice(
    source.indexOf("async function resolveAuthorizedAssetUrl"),
    source.indexOf("const HOME_TIMELINE_MIN_CLIP_MS")
  );
  assert.doesNotMatch(resolverBlock, /\/api\/assets\/(?:proxy-media|signed-url)/);
  assert.match(
    source,
    /const multimediaPlaybackDeps = \{[\s\S]*?preferDirectFirebaseStorage: true,[\s\S]*?resolveAuthorizedAssetUrl,/
  );
});

test("all supported media references normalize to direct Firebase references", () => {
  const resolve = createMediaResolver();
  const tokenized = "https://firebasestorage.googleapis.com/v0/b/charly-brown.firebasestorage.app/o/podcaster%2Fsessions%2Fs1%2Faudio.mp3?alt=media&token=t1";
  assert.equal(resolve(tokenized, "podcaster/sessions/s1/audio.mp3"), tokenized);

  for (const extension of ["png", "jpg", "jpeg", "webp", "mp4", "mov", "webm", "m4v", "mp3", "wav", "m4a"]) {
    const path = `podcaster/sessions/s1/media/file.${extension}`;
    assert.equal(resolve("", path), `gs://charly-brown.firebasestorage.app/${path}`);
  }
  assert.equal(
    resolve("", "podcaster/sessions/s1/media/no-extension"),
    "gs://charly-brown.firebasestorage.app/podcaster/sessions/s1/media/no-extension"
  );
  assert.equal(resolve("gs://custom-bucket/path/video.mov", ""), "gs://custom-bucket/path/video.mov");

  const untokenized = "https://firebasestorage.googleapis.com/v0/b/custom-bucket/o/path%2Fimage.png?alt=media";
  assert.equal(resolve(untokenized, ""), "gs://custom-bucket/path/image.png");

  const legacy = `/api/assets/proxy-media?storagePath=${encodeURIComponent("podcaster/sessions/s1/audio.wav")}`;
  assert.equal(
    resolve(legacy, ""),
    "gs://charly-brown.firebasestorage.app/podcaster/sessions/s1/audio.wav"
  );
  const nestedLegacy = `/api/assets/proxy-image?url=${encodeURIComponent(tokenized)}`;
  assert.equal(resolve(nestedLegacy, ""), tokenized);
});

test("video-player delegates stage video loading to the shared playback controller", () => {
  assert.doesNotMatch(source, /homeStageVideoLoadTokenSeq|homeStageVideoLoadTokensByEl/);
  assert.match(
    source,
    /setPodcastStageVideoSourceForElement:\s*\(video, url, options = \{\}\) => \(\s*multimediaPlaybackController\.setStageVideoSourceForElement\(video, url, options\)\s*\)/
  );
});

test("the shared controller never assigns an unresolved private stage source", () => {
  assert.doesNotMatch(controllerSource, /const preferredSource = cachedObjectUrl \|\| src/);
  assert.doesNotMatch(controllerSource, /const blobUrl = this\.getBlobUrlSync\(entry\.videoSrc\) \|\| entry\.videoSrc/);
  assert.match(
    controllerSource,
    /void this\.setStageVideoSourceForElement\(stageVideo, src, \{[\s\S]*?noWait: true,[\s\S]*?keepHidden: false/
  );
  assert.doesNotMatch(controllerSource, /forcePersistent: true/);
  assert.match(
    controllerSource,
    /cachedObjectUrl \|\| await this\.getBlobUrl\(cleanSrc, \{/
  );
});

test("video-player resolves gs paths directly with the Firebase Storage SDK", () => {
  assert.match(source, /replace\(\/\^gs:\\\/\\\/\[\^\/\]\+\\\/\/i, ""\)/);
  assert.match(source, /getDownloadURL\(ref\(storage, referenceInput\)\)/);
  assert.doesNotMatch(
    source,
    /resolveFirebaseStorageUrl:[\s\S]*proxy-media/
  );
});
