import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.window = {
  location: { origin: "https://charly-brown.firebaseapp.com" },
  __CHARLY_CONFIG__: {
    firebase: { storageBucket: "charly-brown.firebasestorage.app" }
  }
};

globalThis.caches = {
  async open() {
    return {
      async match() { return null; },
      async put() {},
      async delete() { return true; }
    };
  }
};

const { PodcasterPlaybackController } = await import("../public/podcaster/podcaster-playback-controller.js");

test("persistent private scene videos resolve to a signed URL before fetching", async () => {
  const controller = new PodcasterPlaybackController();
  const privateProxy = "https://charly-brown.firebaseapp.com/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fsession_dixlu3jw%2Fowners%2Fuser%2Fvideos%2Frow_1%2Fregenerated.mp4";
  const signedUrl = "https://storage.googleapis.com/charly-brown.firebasestorage.app/podcaster/sessions/session_dixlu3jw/regenerated.mp4?X-Goog-Signature=test";
  let authorizedRequest = "";
  let fetchedUrl = "";

  controller.state.config = { mediaLoadMode: "blob" };
  controller.deps = {
    resolveAuthorizedAssetUrl: async (url) => {
      authorizedRequest = url;
      return signedUrl;
    },
    getAuthHeaders: async () => {
      throw new Error("The signed Storage URL must not require an API bearer header.");
    }
  };

  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    fetchedUrl = String(url);
    return new Response(new Blob(["video-bytes"], { type: "video/mp4" }), {
      status: 200,
      headers: { "Content-Type": "video/mp4" }
    });
  };

  try {
    const result = await controller.getBlobUrl(privateProxy, { persistent: true });
    assert.match(result, /^blob:/);
    assert.equal(authorizedRequest, privateProxy);
    assert.equal(fetchedUrl, signedUrl);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("local persistent hydration fetches the authenticated proxy instead of a Storage signed URL", async () => {
  const controller = new PodcasterPlaybackController();
  const privateProxy = "https://charly-brown.web.app/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fs1%2Fvideo.mp4";
  let fetchedUrl = "";
  let fetchedHeaders = null;

  controller.state.config = { mediaLoadMode: "blob" };
  controller.deps = {
    preferAuthenticatedMediaProxy: true,
    resolveAuthorizedAssetUrl: async () => {
      throw new Error("Local hydration must not request a signed Storage URL.");
    },
    getAuthHeaders: async () => ({ Authorization: "Bearer local-test" })
  };

  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    fetchedUrl = String(url);
    fetchedHeaders = options.headers;
    return new Response(new Blob(["video-bytes"], { type: "video/mp4" }), { status: 200 });
  };

  try {
    const result = await controller.getBlobUrl(privateProxy, { persistent: true });
    assert.match(result, /^blob:/);
    assert.equal(fetchedUrl, privateProxy);
    assert.equal(fetchedHeaders.Authorization, "Bearer local-test");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("stage video assignment forbids falling back to a raw private proxy", () => {
  const source = readFileSync(
    new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url),
    "utf8"
  );
  assert.match(
    source,
    /const rawSourceFallback = this\.requiresAuthorizedAssetResolution\(cleanSrc\) \? "" : cleanSrc;\s*const assignedSource = resolvedSource \|\| rawSourceFallback;/
  );
});
