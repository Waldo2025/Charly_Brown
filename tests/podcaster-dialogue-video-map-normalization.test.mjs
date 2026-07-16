import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

function extractFunction(name) {
  const signature = `function ${name}`;
  const start = podcasterSource.indexOf(signature);
  if (start === -1) {
    throw new Error(`No se encontró ${name}`);
  }
  let parenDepth = 0;
  let braceStart = -1;
  for (let index = start; index < podcasterSource.length; index += 1) {
    const char = podcasterSource[index];
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth -= 1;
    if (char === "{" && parenDepth === 0) {
      braceStart = index;
      break;
    }
  }
  if (braceStart === -1) throw new Error(`No se encontró el cuerpo de ${name}`);
  let depth = 0;
  for (let index = braceStart; index < podcasterSource.length; index += 1) {
    const char = podcasterSource[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return podcasterSource.slice(start, index + 1);
    }
  }
  throw new Error(`No se pudo extraer ${name}`);
}

const context = {
  console,
  normalizeMediaReferenceFromRecord(record = {}, mediaKeys = [], storageKeys = []) {
    const downloadUrl = mediaKeys.map((key) => String(record?.[key] || "").trim()).find(Boolean) || "";
    const storagePath = storageKeys.map((key) => String(record?.[key] || "").trim()).find(Boolean) || "";
    return { downloadUrl, storagePath };
  },
  normalizeVideoImagePrompts(value = []) {
    return Array.isArray(value) ? value : [];
  },
  nowIso() {
    return "2026-06-18T15:00:00.000Z";
  }
};

vm.createContext(context);
vm.runInContext(`${extractFunction("normalizeDialogueVideoMap")};`, context);

test("normalizeDialogueVideoMap defaults missing video type to video", () => {
  const normalized = context.normalizeDialogueVideoMap({
    "row-1": {
      downloadUrl: "https://example.test/video.mp4",
      mimeType: "video/mp4"
    }
  });

  assert.equal(normalized["row-1"].type, "video");
});

test("normalizeDialogueVideoMap defaults missing image type to image", () => {
  const normalized = context.normalizeDialogueVideoMap({
    "row-1": {
      downloadUrl: "https://example.test/image.jpg",
      mimeType: "image/jpeg"
    }
  });

  assert.equal(normalized["row-1"].type, "image");
});

test("normalizeDialogueVideoMap drops clips without any media source", () => {
  const normalized = context.normalizeDialogueVideoMap({
    "row-1": {
      mimeType: "video/mp4"
    }
  });

  assert.equal(Object.keys(normalized).length, 0);
});

test("normalizeDialogueVideoMap preserves Gemini video v2 routing and text metadata", () => {
  const normalized = context.normalizeDialogueVideoMap({
    "row-omni": {
      downloadUrl: "https://example.test/omni.mp4",
      mimeType: "video/mp4",
      generator: "omni",
      provider: "gemini",
      model: "gemini-omni-flash-preview",
      variant: "text_to_video",
      promptVersion: "podcaster_video_v2",
      promptHash: "abc123",
      quality: "final",
      textPolicy: "in_scene",
      aspectRatio: "9:16",
      resolution: "provider-default",
      interactionId: "interaction-1",
      providerVideoUri: "files/veo-extension-source",
      providerVideoGeneratedAt: "2026-07-15T10:00:00.000Z",
      providerVideoGenerator: "veo",
      providerVideoModel: "veo-3.1-fast-generate-preview",
      providerVideoResolution: "720p",
      providerVideoAspectRatio: "9:16",
      providerVideoDurationSec: 8,
      requestedDurationSeconds: 6,
      durationSeconds: 6,
      removedTextDirectives: [{ field: "visualNotes", count: 2 }],
      headlineText: "TITULAR EDITORIAL",
      captionText: "Diálogo literal con acentos.",
      inSceneText: "CHARLY PODCAST",
      overlayMode: "both",
      textSource: "manual"
    }
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify({
      generator: normalized["row-omni"].generator,
      provider: normalized["row-omni"].provider,
      model: normalized["row-omni"].model,
      variant: normalized["row-omni"].variant,
      promptVersion: normalized["row-omni"].promptVersion,
      promptHash: normalized["row-omni"].promptHash,
      quality: normalized["row-omni"].quality,
      textPolicy: normalized["row-omni"].textPolicy,
      aspectRatio: normalized["row-omni"].aspectRatio,
      resolution: normalized["row-omni"].resolution,
      interactionId: normalized["row-omni"].interactionId,
      providerVideoUri: normalized["row-omni"].providerVideoUri,
      providerVideoGeneratedAt: normalized["row-omni"].providerVideoGeneratedAt,
      providerVideoGenerator: normalized["row-omni"].providerVideoGenerator,
      providerVideoModel: normalized["row-omni"].providerVideoModel,
      providerVideoResolution: normalized["row-omni"].providerVideoResolution,
      providerVideoAspectRatio: normalized["row-omni"].providerVideoAspectRatio,
      providerVideoDurationSec: normalized["row-omni"].providerVideoDurationSec,
      requestedDurationSec: normalized["row-omni"].requestedDurationSec,
      durationSec: normalized["row-omni"].durationSec,
      removedTextDirectives: normalized["row-omni"].removedTextDirectives,
      headlineText: normalized["row-omni"].headlineText,
      captionText: normalized["row-omni"].captionText,
      inSceneText: normalized["row-omni"].inSceneText,
      overlayMode: normalized["row-omni"].overlayMode,
      textSource: normalized["row-omni"].textSource
    })),
    {
      generator: "omni",
      provider: "gemini",
      model: "gemini-omni-flash-preview",
      variant: "text_to_video",
      promptVersion: "podcaster_video_v2",
      promptHash: "abc123",
      quality: "final",
      textPolicy: "in_scene",
      aspectRatio: "9:16",
      resolution: "provider-default",
      interactionId: "interaction-1",
      providerVideoUri: "files/veo-extension-source",
      providerVideoGeneratedAt: "2026-07-15T10:00:00.000Z",
      providerVideoGenerator: "veo",
      providerVideoModel: "veo-3.1-fast-generate-preview",
      providerVideoResolution: "720p",
      providerVideoAspectRatio: "9:16",
      providerVideoDurationSec: 8,
      requestedDurationSec: 6,
      durationSec: 6,
      removedTextDirectives: [{ field: "visualNotes", count: 2 }],
      headlineText: "TITULAR EDITORIAL",
      captionText: "Diálogo literal con acentos.",
      inSceneText: "CHARLY PODCAST",
      overlayMode: "both",
      textSource: "manual"
    }
  );
});
