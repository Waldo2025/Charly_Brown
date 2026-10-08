import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { sourceFunctions } from "./helpers/snoopy-source.mjs";

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

test("local media proxy fallback keeps the storage path on Firebase Hosting", () => {
  const source = sourceFunctions(new URL("../public/podcaster/podcaster.js", import.meta.url), ["resolveAlternateMediaProxyUrl"]);
  const context = vm.createContext({
    URL,
    window: { location: { origin: "http://127.0.0.1:5010" } },
    getRemoteApiBase: () => "https://charly-brown.web.app/api",
    buildApiUrlFromBase: (base, path) => `${base}${path.slice(4)}`
  });
  vm.runInContext(source, context);
  const path = "podcaster%2Fsessions%2Fs1%2Faudio%2Fvoice.wav";
  assert.equal(
    context.resolveAlternateMediaProxyUrl(`http://127.0.0.1:8787/api/assets/proxy-media?storagePath=${path}`),
    `https://charly-brown.web.app/api/assets/proxy-media?storagePath=${path}`
  );
});

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

test("a missing local proxy retries the Firebase API before marking audio absent", async () => {
  const controller = new PodcasterPlaybackController();
  const localUrl = "http://127.0.0.1:8787/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fs1%2Faudio%2Fvoice.wav";
  const remoteUrl = "https://charly-brown.web.app/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fs1%2Faudio%2Fvoice.wav";
  const requests = [];
  let stale = false;
  controller.state.config = { mediaLoadMode: "blob" };
  controller.deps = {
    preferAuthenticatedMediaProxy: true,
    getAuthHeaders: async () => ({ Authorization: "Bearer test-token" }),
    resolveAlternateMediaProxyUrl: () => remoteUrl,
    markStaleProxyMediaUrl: () => { stale = true; }
  };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    requests.push([String(url), options.headers?.Authorization]);
    return String(url) === localUrl
      ? new Response("missing locally", { status: 404 })
      : new Response(new Blob(["audio-bytes"], { type: "audio/wav" }), { status: 200 });
  };
  try {
    assert.match(await controller.getBlobUrl(localUrl, { persistent: true }), /^blob:/);
    assert.deepEqual(requests, [[localUrl, "Bearer test-token"], [remoteUrl, "Bearer test-token"]]);
    assert.equal(stale, false);
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
