import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = {
  location: {
    origin: "https://example.test"
  }
};

const { createPodcasterMediaRuntimeApi } = await import("../public/podcaster/podcaster-media-runtime.js");

function createRuntime() {
  return createPodcasterMediaRuntimeApi({
    buildApiUrl: (path) => `https://example.test${path}`,
    buildApiUrlPreferRemote: (path) => `https://example.test${path}`,
    resolveDateIso: (value) => String(value || "")
  });
}

test("resolveStaleAwareProxyMediaUrl normalizes gs storagePath from legacy proxy-media urls", () => {
  const runtime = createRuntime();
  const resolved = runtime.resolveStaleAwareProxyMediaUrl(
    "https://charly-brown-gemini-backend.onrender.com/api/assets/proxy-media?storagePath=gs%3A%2F%2Fcharly-brown.firebasestorage.app%2Fpodcaster%2Fsessions%2Fsession_a%2Fowners%2Fuser%2Fvideos%2Frow_1%2Fclip.mp4&u=2026-05-05T03%3A17%3A36.691Z",
    "",
    "media"
  );
  assert.equal(
    resolved,
    "https://example.test/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fsession_a%2Fowners%2Fuser%2Fvideos%2Frow_1%2Fclip.mp4&u=2026-05-05T03%3A17%3A36.691Z"
  );
});

test("resolveStaleAwareProxyMediaUrl rewrites legacy absolute proxy-media url= sources to current base", () => {
  const runtime = createRuntime();
  const directFirebaseUrl = "https://firebasestorage.googleapis.com/v0/b/charly-brown.firebasestorage.app/o/podcaster%2Fsessions%2Fsession_a%2Fowners%2Fuser%2Fvideos%2Frow_1%2Fclip.mp4?alt=media";
  const resolved = runtime.resolveStaleAwareProxyMediaUrl(
    `https://charly-brown-gemini-backend.onrender.com/api/assets/proxy-media?url=${encodeURIComponent(directFirebaseUrl)}`,
    "",
    "media"
  );
  assert.equal(
    resolved,
    `https://example.test/api/assets/proxy-media?url=${encodeURIComponent(directFirebaseUrl)}`
  );
});

test("normalizePersistedMediaReference strips legacy proxy-media urls and keeps storagePath", () => {
  const runtime = createRuntime();
  const normalized = runtime.normalizePersistedMediaReference(
    "https://charly-brown-gemini-backend.onrender.com/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fsession_a%2Fowners%2Fuser%2Fvideos%2Frow_1%2Fclip.mp4&u=2026-05-05T03%3A17%3A36.691Z",
    ""
  );
  assert.deepEqual(normalized, {
    downloadUrl: "",
    storagePath: "podcaster/sessions/session_a/owners/user/videos/row_1/clip.mp4"
  });
});

test("resolveStaleAwareProxyMediaUrl prefers direct Firebase download urls with token", () => {
  const runtime = createRuntime();
  const tokenizedUrl = "https://firebasestorage.googleapis.com/v0/b/charly-brown.firebasestorage.app/o/podcaster%2Fsessions%2Fsession_a%2Fowners%2Fuser%2Fvideos%2Frow_1%2Fclip.mp4?alt=media&token=abc123";
  const resolved = runtime.resolveStaleAwareProxyMediaUrl(
    tokenizedUrl,
    "gs://charly-brown.firebasestorage.app/podcaster/sessions/session_a/owners/user/videos/row_1/clip.mp4",
    "media"
  );
  assert.equal(resolved, tokenizedUrl);
});

test("resolveStaleAwareProxyMediaUrl does not append cache-busters to tokenized Firebase urls", () => {
  const runtime = createRuntime();
  const tokenizedUrl = "https://firebasestorage.googleapis.com/v0/b/charly-brown.firebasestorage.app/o/podcaster%2Flibrary%2Fscenes%2Fscene_a%2Fvideo.mp4?alt=media&token=abc123";
  const resolved = runtime.resolveStaleAwareProxyMediaUrl(
    tokenizedUrl,
    "podcaster/library/scenes/scene_a/video.mp4",
    "media",
    { updatedAt: "2026-05-05T03:40:31.964Z" }
  );
  assert.equal(resolved, tokenizedUrl);
});
