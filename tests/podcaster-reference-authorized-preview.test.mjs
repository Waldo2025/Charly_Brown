import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { sourceFunctions } from "./helpers/snoopy-source.mjs";

const appUrl = new URL("../public/podcaster/podcaster.js", import.meta.url);
const appSource = readFileSync(appUrl, "utf8");
const scriptEditorSource = readFileSync(new URL("../public/podcaster/podcaster-script-editor.js", import.meta.url), "utf8");
const referenceEditorSource = readFileSync(new URL("../public/podcaster/podcaster-reference-editor.js", import.meta.url), "utf8");

test("protected reference previews are not assigned directly to img src", () => {
  assert.match(scriptEditorSource, /data-reference-image-src=/);
  assert.doesNotMatch(
    scriptEditorSource,
    /<img\s+src="\$\{escapeHtml\(window\.resolveReferenceImagePreviewUrl/
  );
  assert.match(appSource, /void hydrateAuthorizedReferenceImages\(els\.podcastStudioInspectorRowEditor\)/);
});

test("reference proxy URLs are exchanged for authenticated signed URLs", async () => {
  const calls = [];
  const context = vm.createContext({
    resolveAuthorizedAssetUrl: async (source, options) => {
      calls.push({ source, options });
      return "https://storage.googleapis.com/signed-reference.png";
    }
  });
  vm.runInContext(sourceFunctions(appUrl, ["resolveAuthorizedReferenceImageDisplayUrl"]), context);

  const proxy = "https://charly-brown.web.app/api/assets/proxy-image?storagePath=podcaster%2Fsessions%2Fs1%2Freferences%2Fimage.png";
  assert.equal(
    await context.resolveAuthorizedReferenceImageDisplayUrl(proxy, { forceRefresh: true }),
    "https://storage.googleapis.com/signed-reference.png"
  );
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ source: proxy, options: { forceRefresh: true } }]);

  const dataUrl = "data:image/png;base64,AA==";
  assert.equal(await context.resolveAuthorizedReferenceImageDisplayUrl(dataUrl), dataUrl);
  assert.equal(calls.length, 1);
});

test("inspector hydration assigns only the authorized URL to the image", async () => {
  const trigger = { dataset: {} };
  const assignments = [];
  const image = {
    dataset: { referenceImageSrc: "/api/assets/proxy-image?storagePath=podcaster%2Fsessions%2Fs1%2Freference.png" },
    isConnected: true,
    closest: () => trigger,
    set src(value) { assignments.push(value); }
  };
  const context = vm.createContext({
    console,
    resolveAuthorizedAssetUrl: async () => "https://storage.googleapis.com/signed-reference.png"
  });
  vm.runInContext(sourceFunctions(appUrl, [
    "resolveAuthorizedReferenceImageDisplayUrl",
    "hydrateAuthorizedReferenceImages"
  ]), context);

  await context.hydrateAuthorizedReferenceImages({
    querySelectorAll: (selector) => selector === "img[data-reference-image-src]" ? [image] : []
  });

  assert.deepEqual(assignments, ["https://storage.googleapis.com/signed-reference.png"]);
  assert.equal(image.dataset.referenceImageState, "ready");
  assert.equal(trigger.dataset.referenceResolvedSrc, "https://storage.googleapis.com/signed-reference.png");
});

test("the reference editor waits for asynchronous preview authorization", () => {
  assert.match(
    referenceEditorSource,
    /await Promise\.resolve\(deps\.preview\(view\.record\)\)/
  );
  assert.match(appSource, /preview:\s*async record => resolveAuthorizedReferenceImageDisplayUrl/);
});
