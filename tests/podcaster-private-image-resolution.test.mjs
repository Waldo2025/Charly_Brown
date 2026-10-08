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

// Producción: una capa de escena con imagen de la galería (`images/<uid>/…`)
// llegaba al <img> como proxy de /api/assets y respondía 400 invalid_storage_path,
// porque el modo streaming de getBlobUrlSync devolvía ese proxy ya "resuelto".
test("las imágenes fuera de podcaster/ se resuelven por el SDK y no se cachean como proxy", async () => {
  const controller = new PodcasterPlaybackController();
  const galleryProxy = "https://charly-brown.web.app/api/assets/proxy-image?storagePath=images%2F9iuid%2Fscene_2%2FEscena02.jpg&u=2026-10-05T13%3A50%3A54.900Z";
  const signedUrl = "https://firebasestorage.googleapis.com/v0/b/charly-brown.firebasestorage.app/o/images%2F9iuid%2Fscene_2%2FEscena02.jpg?alt=media&token=sdk";
  let sdkRequest = "";
  controller.deps = {
    resolveFirebaseStorageUrl: async (gsPath) => {
      sdkRequest = gsPath;
      return signedUrl;
    },
    resolveAuthorizedAssetUrl: async () => {
      throw new Error("la galería no debe pasar por la API de assets");
    }
  };

  assert.ok(!controller.getBlobUrlSync(galleryProxy), "el proxy 400 no puede quedar en la caché");
  assert.equal(await controller.resolveStageImageSource(galleryProxy), signedUrl);
  assert.equal(sdkRequest, "gs://charly-brown.firebasestorage.app/images/9iuid/scene_2/Escena02.jpg");
});
