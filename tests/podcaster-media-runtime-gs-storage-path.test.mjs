import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = {
  location: {
    origin: "https://charly-brown.web.app"
  }
};

const { createPodcasterMediaRuntimeApi } = await import("../public/podcaster/podcaster-media-runtime.js");

test("resolveStaleAwareProxyMediaUrl sends clean object paths instead of gs:// storagePath", () => {
  const api = createPodcasterMediaRuntimeApi({
    buildApiUrlPreferRemote: (path) => `https://snoopy-export.onrender.com${path}`,
    resolveDateIso: (value) => String(value || "")
  });
  const resolved = api.resolveStaleAwareProxyMediaUrl(
    "https://firebasestorage.googleapis.com/v0/b/charly-brown.firebasestorage.app/o/podcaster%2Fsessions%2Fsession_cmmy944e%2Fowners%2Fuid%2Fvideos%2Frow%2Fclip.mp4?alt=media",
    "gs://charly-brown.firebasestorage.app/podcaster/sessions/session_cmmy944e/owners/uid/videos/row/clip.mp4",
    "media",
    { updatedAt: "2026-05-05T03:17:36.691Z" }
  );

  assert.equal(
    resolved,
    "https://snoopy-export.onrender.com/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fsession_cmmy944e%2Fowners%2Fuid%2Fvideos%2Frow%2Fclip.mp4&u=2026-05-05T03%3A17%3A36.691Z"
  );
  assert.ok(!resolved.includes("gs%3A%2F%2F"));
});

test("stale proxy-media keys do not fall back to unsigned Firebase Storage urls", () => {
  const storagePath = "podcaster/sessions/session_cmmy944e/owners/uid/videos/row_pbuhgnrj-narrador/clip.mp4";
  const fallbackUrl = "https://firebasestorage.googleapis.com/v0/b/charly-brown.firebasestorage.app/o/podcaster%2Fsessions%2Fsession_cmmy944e%2Fowners%2Fuid%2Fvideos%2Frow_pbuhgnrj-narrador%2Fclip.mp4?alt=media";
  const api = createPodcasterMediaRuntimeApi({
    buildApiUrlPreferRemote: (path) => `https://snoopy-export.onrender.com${path}`,
    resolveDateIso: (value) => String(value || "")
  });

  api.markStaleProxyMediaUrl(
    `https://snoopy-export.onrender.com/api/assets/proxy-media?storagePath=${encodeURIComponent(storagePath)}&u=2026-05-05T03%3A17%3A36.691Z`,
    "proxy-media-404"
  );

  const resolved = api.resolveStaleAwareProxyMediaUrl(
    fallbackUrl,
    storagePath,
    "media",
    { updatedAt: "2026-07-01T10:00:00.000Z" }
  );

  assert.equal(resolved, "");
  assert.equal(
    api.isMarkedStaleProxyMediaUrl(
      `https://snoopy-export.onrender.com/api/assets/proxy-media?storagePath=${encodeURIComponent(storagePath)}&u=different`
    ),
    true
  );
});

test("stale proxy-media can still fall back to signed Firebase Storage urls", () => {
  const storagePath = "podcaster/sessions/session_cmmy944e/owners/uid/videos/row_pbuhgnrj-narrador/clip.mp4";
  const signedFallbackUrl = "https://firebasestorage.googleapis.com/v0/b/charly-brown.firebasestorage.app/o/podcaster%2Fsessions%2Fsession_cmmy944e%2Fowners%2Fuid%2Fvideos%2Frow_pbuhgnrj-narrador%2Fclip.mp4?alt=media&token=abc123";
  const api = createPodcasterMediaRuntimeApi({
    buildApiUrlPreferRemote: (path) => `https://snoopy-export.onrender.com${path}`,
    resolveDateIso: (value) => String(value || "")
  });

  api.markStaleProxyMediaUrl(
    `https://snoopy-export.onrender.com/api/assets/proxy-media?storagePath=${encodeURIComponent(storagePath)}`,
    "proxy-media-404"
  );

  assert.equal(
    api.resolveStaleAwareProxyMediaUrl(signedFallbackUrl, storagePath, "media"),
    signedFallbackUrl
  );
});
