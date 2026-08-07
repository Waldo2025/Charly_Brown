import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = { location: { origin: "http://127.0.0.1:5010" } };
await import("../public/podcaster/podcaster-timeline-model.js");
await import("../public/podcaster/podcaster-text-render.js");
const { PodcasterPlaybackController } = await import("../public/podcaster/podcaster-playback-controller.js");

test("private session images are signed before browser preload", async () => {
  const controller = new PodcasterPlaybackController();
  const privateProxy = "https://charly-brown.web.app/api/assets/proxy-image?storagePath=podcaster%2Fsessions%2Fs1%2Fscene.webp";
  const signedUrl = "https://storage.googleapis.com/charly-brown.firebasestorage.app/podcaster/sessions/s1/scene.webp?signed=yes";
  let requestedProxy = "";
  controller.deps = {
    resolveAuthorizedAssetUrl: async (value) => {
      requestedProxy = value;
      return signedUrl;
    }
  };

  assert.equal(await controller.resolveStageImageSource(privateProxy), signedUrl);
  assert.equal(requestedProxy, privateProxy);
});

test("tokenized public images bypass the signed URL endpoint", async () => {
  const controller = new PodcasterPlaybackController();
  const publicUrl = "https://firebasestorage.googleapis.com/v0/b/charly-brown.firebasestorage.app/o/public%2Fscene.webp?alt=media&token=public-token";
  controller.deps = {
    resolveAuthorizedAssetUrl: async () => {
      throw new Error("signed resolver should not be called");
    }
  };

  assert.equal(await controller.resolveStageImageSource(publicUrl), publicUrl);
});

test("untokenized Firebase session images preserve their Storage object path", async () => {
  const controller = new PodcasterPlaybackController();
  const directUrl = "https://firebasestorage.googleapis.com/v0/b/charly-brown.firebasestorage.app/o/podcaster%2Fsessions%2Fs1%2Fscene.webp?alt=media";
  let requestedProxy = "";
  controller.deps = {
    buildApiUrlPreferRemote: (path) => `https://charly-brown.web.app${path}`,
    resolveAuthorizedAssetUrl: async (value) => {
      requestedProxy = value;
      return "https://storage.googleapis.com/signed-scene.webp";
    }
  };

  assert.equal(await controller.resolveStageImageSource(directUrl), "https://storage.googleapis.com/signed-scene.webp");
  const proxy = new URL(requestedProxy);
  assert.equal(proxy.pathname, "/api/assets/proxy-image");
  assert.equal(proxy.searchParams.get("storagePath"), "podcaster/sessions/s1/scene.webp");
});
