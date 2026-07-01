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
  hasFirebaseDownloadToken(url = "") {
    const clean = String(url || "").trim();
    return clean.includes("token=") || clean.includes("downloadToken=");
  },
  buildPodcasterStorageGsUrl(storagePath = "") {
    const clean = String(storagePath || "").trim();
    return clean.startsWith("gs://") ? clean : `gs://charly-brown.firebasestorage.app/${clean}`;
  },
  normalizeStorageProxyPath(storagePath = "") {
    const clean = String(storagePath || "").trim();
    if (!clean) return "";
    if (clean.startsWith("gs://")) {
      const withoutScheme = clean.replace(/^gs:\/\//i, "");
      const slashIndex = withoutScheme.indexOf("/");
      return slashIndex >= 0 ? String(withoutScheme.slice(slashIndex + 1) || "").trim() : "";
    }
    return clean;
  },
  deriveStoragePathFromMediaSource(downloadUrl, storagePath) {
    const cleanStoragePath = String(storagePath || "").trim();
    if (cleanStoragePath) return cleanStoragePath;
    const cleanDownloadUrl = String(downloadUrl || "").trim();
    if (cleanDownloadUrl.startsWith("gs://")) return cleanDownloadUrl;
    try {
      const parsed = new URL(cleanDownloadUrl, "https://example.test");
      const proxyPath = String(parsed.pathname || "").toLowerCase();
      if (proxyPath.includes("/api/assets/proxy-media") || proxyPath.includes("/api/assets/proxy-image")) {
        return String(parsed.searchParams.get("storagePath") || "").trim();
      }
    } catch (_) {
      // noop
    }
    return "";
  },
  isMarkedStaleProxyMediaUrl() {
    return false;
  },
  resolveStaleAwareProxyMediaUrl(downloadUrl, storagePath) {
    if (context.hasFirebaseDownloadToken(downloadUrl)) {
      return String(downloadUrl || "").trim();
    }
    const proxyStoragePath = context.normalizeStorageProxyPath(storagePath);
    return proxyStoragePath
      ? `https://example.test/api/assets/proxy-media?storagePath=${encodeURIComponent(proxyStoragePath)}`
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
vm.runInContext(`${extractFunction("hasFirebaseDownloadToken")};`, context);
vm.runInContext(`${extractFunction("buildPodcasterStorageGsUrl")};`, context);
vm.runInContext(`${extractFunction("resolveStorageAudioUrl")};`, context);
vm.runInContext(`${extractFunction("resolveStorageVideoUrl")};`, context);

test("podcaster resolveStorageAudioUrl converts gs:// audio into proxy-media url= fallback", () => {
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

test("podcaster resolveStorageVideoUrl converts gs:// video into proxy-media url= fallback", () => {
  const gsUrl = "gs://bucket-name/podcaster/sessions/session-video/videos/row-1/file.mp4";
  const resolved = context.resolveStorageVideoUrl(gsUrl, "");
  assert.equal(
    resolved,
    "https://example.test/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fsession-video%2Fvideos%2Frow-1%2Ffile.mp4"
  );
});

test("podcaster resolveStorageVideoUrl rewrites legacy absolute proxy-media gs paths to normalized storagePath", () => {
  const legacyProxyUrl = "https://charly-brown-gemini-backend.onrender.com/api/assets/proxy-media?storagePath=gs%3A%2F%2Fcharly-brown.firebasestorage.app%2Fpodcaster%2Fsessions%2Fsession-video%2Fvideos%2Frow-1%2Ffile.mp4&u=2026-05-05T03%3A17%3A36.691Z";
  const resolved = context.resolveStorageVideoUrl(legacyProxyUrl, "");
  assert.equal(
    resolved,
    "https://example.test/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fsession-video%2Fvideos%2Frow-1%2Ffile.mp4"
  );
});

test("podcaster resolveStorageVideoUrl uses tokenized Firebase URL solo cuando no existe storagePath", () => {
  const directUrl = "https://firebasestorage.googleapis.com/v0/b/charly-brown.firebasestorage.app/o/podcaster%2Fsessions%2Fsession-video%2Fvideos%2Frow-1%2Ffile.mp4?alt=media&token=abc123";
  const resolved = context.resolveStorageVideoUrl(directUrl, "");
  assert.equal(resolved, directUrl);
});

test("podcaster resolveStorageVideoUrl prefiere storagePath sobre token Firebase downloadUrl para evitar tokens vencidos", () => {
  const directUrl = "https://firebasestorage.googleapis.com/v0/b/charly-brown.firebasestorage.app/o/podcaster%2Fsessions%2Fsession-video%2Fvideos%2Frow-1%2Ffile.mp4?alt=media&token=abc123";
  const resolved = context.resolveStorageVideoUrl(
    directUrl,
    "gs://charly-brown.firebasestorage.app/podcaster/sessions/session-video/videos/row-1/file.mp4"
  );
  assert.equal(
    resolved,
    "https://example.test/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fsession-video%2Fvideos%2Frow-1%2Ffile.mp4"
  );
});
