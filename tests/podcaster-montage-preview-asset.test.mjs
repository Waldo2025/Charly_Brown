import assert from "node:assert/strict";
import test from "node:test";

import { createMontageExportPreviewAssetResolver } from "../public/podcaster/podcaster-montage-preview-asset.js";

const storagePath = "podcaster/sessions/session-1/owners/user-1/videos/scene-1.mp4";
const proxyUrl = `https://charly-brown.web.app/api/assets/proxy-media?storagePath=${encodeURIComponent(storagePath)}`;

test("export status preview uses an authorized signed URL instead of a media proxy URL", async () => {
  const requests = [];
  const resolver = createMontageExportPreviewAssetResolver({
    authFetchJson: async (url) => {
      requests.push(url);
      return { url: "https://storage.example/signed-scene", expiresAt: Date.now() + 600_000 };
    }
  });

  const result = await resolver.resolveStatusMedia({
    currentStoragePath: storagePath,
    currentDownloadUrl: proxyUrl
  });

  assert.deepEqual(result, { dataUrl: "https://storage.example/signed-scene", mediaType: "video/mp4" });
  assert.deepEqual(requests, [`/api/assets/signed-url?storagePath=${encodeURIComponent(storagePath)}`]);
  assert.equal(await resolver.resolveUrl(proxyUrl), result.dataUrl);
  assert.equal(requests.length, 1);
});

test("failed authorization hides preview rather than falling back to unauthenticated proxy", async () => {
  const resolver = createMontageExportPreviewAssetResolver({
    authFetchJson: async () => { throw Object.assign(new Error("auth_required"), { status: 401 }); }
  });

  assert.equal(await resolver.resolveStatusMedia({ currentDownloadUrl: proxyUrl }), null);
  await assert.rejects(resolver.resolveUrl(proxyUrl), { status: 401 });
  assert.equal(await resolver.resolveUrl("/api/assets/proxy-media?url=unsupported"), "");
});

test("inline preview media stays local and direct public URLs remain playable", async () => {
  const resolver = createMontageExportPreviewAssetResolver({
    authFetchJson: async () => { throw new Error("signed URL should not be requested"); }
  });

  assert.equal(await resolver.resolveUrl("blob:https://charly-brown.web.app/preview", { storagePath }), "blob:https://charly-brown.web.app/preview");
  assert.equal(await resolver.resolveUrl("https://cdn.example/public.mp4"), "https://cdn.example/public.mp4");
});
