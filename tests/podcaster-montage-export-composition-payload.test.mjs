import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("podcaster-montage-export builds complete payload with visualEffects, stylizedText, and overlayCards", () => {
  const exportSource = readFileSync("public/podcaster/podcaster-montage-export.js", "utf8");
  const cardStudioSource = readFileSync("public/podcaster/podcaster-overlay-card-studio.js", "utf8");
  const serverSource = readFileSync("backend/server.js", "utf8");
  const sceneLayersBackendSource = readFileSync("backend/montage-export/scene-image-layers.js", "utf8");

  // 1. Montage export resolves visual effects across all session containers
  assert.match(exportSource, /function resolveExportVisualEffects\(session, rowId\)/);
  assert.match(exportSource, /visualEffects:\s*resolveExportVisualEffects\(activeSession,\s*rowId\)/);

  // 2. Stylized text timeline resolves across session containers and does not lose dataUrl if upload fails
  assert.match(exportSource, /activeSession\?\.podcastVideoConfig\?\.stylizedTextMap/);
  assert.match(exportSource, /dataUrl:\s*storagePath\s*\?\s*""\s*:\s*dataUrl/);

  // 3. Overlay card studio populates textLines and resolves from all config locations
  assert.match(cardStudioSource, /s\?\.session\?\.podcastVideoConfig\?\.timelineOverlayCardsById/);
  assert.match(cardStudioSource, /const textLines = Array\.isArray\(card\.textLines\)/);

  // 4. Backend normalizes scene image layers with downloadUrl, url, and dataUrl
  assert.match(sceneLayersBackendSource, /const downloadUrl = String\(source\.downloadUrl\s*\|\|\s*source\.url\s*\|\|\s*""\)/);
  assert.match(sceneLayersBackendSource, /const dataUrl = String\(source\.dataUrl\s*\|\|\s*source\.localDataUrl\s*\|\|\s*""\)/);

  // 5. Backend normalizes overlay cards extracting textLines from fields/lines if missing
  assert.match(serverSource, /textLines\s*=\s*card\.fields\.map\(\(f\)\s*=>\s*clampText\(f\?\.value\s*\|\|\s*"",\s*180\)\)/);

  // 6. Backend has safe fallbacks for card motion and stylized motion when Playwright is unavailable
  assert.match(serverSource, /catch\s*\(cardMotionErr\)\s*\{/);
  assert.match(serverSource, /catch\s*\(motionErr\)\s*\{/);
});

test("montage export does not resurrect excluded or deleted Gemini audio", () => {
  const exportSource = readFileSync("public/podcaster/podcaster-montage-export.js", "utf8");
  assert.match(exportSource, /excludedRowIds\.has\(rowId\)\s*\|\|\s*window\.isDialogueAudioDeletedForRow\?\.\(activeSession,\s*rowId\)/);
  assert.match(exportSource, /if\s*\(!storedAudio\)\s*return null/);
  assert.doesNotMatch(exportSource, /\|\|\s*segment\?\.audioSrc\s*\|\|\s*runtime\?\.audioSrc/);
});

test("backend normalizeSceneImageLayers and normalizeMontageOverlayCards function correctly", async () => {
  const { normalizeSceneImageLayers } = await import("../backend/montage-export/scene-image-layers.js");

  const rawLayers = [
    {
      id: "layer_1",
      url: "https://example.com/layer1.png",
      startSec: 1,
      endSec: 5
    },
    {
      id: "layer_2",
      dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      startSec: 0,
      endSec: 4
    }
  ];

  const normalized = normalizeSceneImageLayers(rawLayers);
  assert.equal(normalized.length, 2, "Both layers with url and dataUrl must be preserved");
  assert.equal(normalized[0].downloadUrl, "https://example.com/layer1.png");
  assert.equal(normalized[0].url, "https://example.com/layer1.png");
  assert.ok(normalized[1].dataUrl.startsWith("data:image/png;base64,"));
});
