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
    return String(storagePath || "").trim() || (String(downloadUrl || "").startsWith("gs://") ? String(downloadUrl || "").trim() : "");
  },
  isMarkedStaleProxyMediaUrl() {
    return false;
  },
  resolveStaleAwareProxyMediaUrl(downloadUrl, storagePath) {
    return storagePath
      ? `https://example.test/api/assets/proxy-media?storagePath=${encodeURIComponent(storagePath)}`
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

test("podcaster resolveStorageAudioUrl converts gs:// audio into proxy-media url= fallback", () => {
  const gsUrl = "gs://bucket-name/podcaster/sessions/session-audio/audio/row-1/file.wav";
  const resolved = context.resolveStorageAudioUrl(gsUrl, "");
  const expectedFirebaseUrl = "https://firebasestorage.googleapis.com/v0/b/bucket-name/o/podcaster%2Fsessions%2Fsession-audio%2Faudio%2Frow-1%2Ffile.wav?alt=media";
  assert.equal(
    resolved,
    `https://example.test/api/assets/proxy-media?url=${encodeURIComponent(expectedFirebaseUrl)}`
  );
});

test("podcaster resolveStorageAudioUrl keeps plain storagePath on storagePath proxy route", () => {
  const resolved = context.resolveStorageAudioUrl("", "podcaster/sessions/session-audio/audio/row-1/file.wav");
  assert.equal(
    resolved,
    "https://example.test/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fsession-audio%2Faudio%2Frow-1%2Ffile.wav"
  );
});

test("podcaster resolveStorageVideoUrl converts gs:// video into proxy-media url= fallback", () => {
  const gsUrl = "gs://bucket-name/podcaster/sessions/session-video/videos/row-1/file.mp4";
  const resolved = context.resolveStorageVideoUrl(gsUrl, "");
  const expectedFirebaseUrl = "https://firebasestorage.googleapis.com/v0/b/bucket-name/o/podcaster%2Fsessions%2Fsession-video%2Fvideos%2Frow-1%2Ffile.mp4?alt=media";
  assert.equal(
    resolved,
    `https://example.test/api/assets/proxy-media?url=${encodeURIComponent(expectedFirebaseUrl)}`
  );
});
