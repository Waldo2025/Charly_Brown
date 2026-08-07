import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

function extractFunction(name) {
  const signature = `function ${name}`;
  const start = source.indexOf(signature);
  if (start === -1) throw new Error(`No se encontró ${name}`);
  let parenDepth = 0;
  let braceStart = -1;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth -= 1;
    if (char === "{" && parenDepth === 0) {
      braceStart = index;
      break;
    }
  }
  if (braceStart === -1) throw new Error(`No se encontró el cuerpo de ${name}`);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`No se pudo extraer ${name}`);
}

const normalizeCalls = [];
const context = {
  normalizeMontageExportRequestBody(input) {
    normalizeCalls.push(input);
    return {
      ...input,
      useTimelineAudio: true,
      timelineAudioSegments: input.audioTimeline.geminiSegments,
      normalizedGeminiTimelineSegments: input.audioTimeline.geminiSegments
    };
  }
};
vm.createContext(context);
vm.runInContext(`${extractFunction("normalizeMontageExportPipelineInput")};`, context);

test("normalizes the raw Firebase Functions payload before Cloud Run renders audio", () => {
  const raw = {
    sessionId: "session-1",
    audioTimeline: {
      enabled: true,
      geminiSegments: [{ kind: "gemini", storagePath: "gs://bucket/voice.wav" }],
      backgroundSegments: [{ kind: "background-track", storagePath: "gs://bucket/music.mp3" }]
    }
  };

  const result = context.normalizeMontageExportPipelineInput(raw);

  assert.equal(normalizeCalls.length, 1);
  assert.equal(result.useTimelineAudio, true);
  assert.equal(result.timelineAudioSegments.length, 1);
  assert.equal(result.normalizedGeminiTimelineSegments.length, 1);
});

test("preserves an already normalized backend payload", () => {
  normalizeCalls.length = 0;
  const normalized = {
    useTimelineAudio: true,
    timelineAudioSegments: [{ kind: "gemini" }],
    normalizedGeminiTimelineSegments: [{ kind: "gemini" }]
  };

  const result = context.normalizeMontageExportPipelineInput(normalized);

  assert.equal(normalizeCalls.length, 0);
  assert.equal(result, normalized);
});
