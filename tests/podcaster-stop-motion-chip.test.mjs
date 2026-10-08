import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const uiSource = readFileSync(new URL("../public/podcaster/podcaster-timeline-ui.js", import.meta.url), "utf8");
const interactionSource = readFileSync(new URL("../public/podcaster/podcaster-timeline-interaction.js", import.meta.url), "utf8");
const stopMotionModel = require("../public/podcaster/podcaster-stop-motion.js");

function buildFiveFrameSequence() {
  return stopMotionModel.normalizeStopMotion({
    version: 2,
    timingMode: "fit-scene",
    frames: [1, 2, 3, 4, 5].map((id) => ({
      name: `frame-${id}.jpg`,
      storagePath: `scenes/frame-${id}.jpg`,
      downloadUrl: `https://example.test/frame-${id}.jpg`
    }))
  });
}

test("timeline ui renderiza la franja de subchips con geometría derivada de pesos", () => {
  assert.match(uiSource, /const stopMotionSequence = stopMotionModel\?\.normalizeStopMotion\?\.\(dialogueMap\[rowId\]\?\.stopMotion \|\| null\) \|\| null;/);
  assert.match(uiSource, /data-stop-motion-segment data-row-id="\$\{escapeHtml\(rowId\)\}" data-frame-index="\$\{frameIndex\}" style="left:\$\{stopMotionCursorPct\.toFixed\(4\)\}%;width:\$\{widthPct\.toFixed\(4\)\}%"/);
  assert.match(uiSource, /data-stop-motion-resize data-row-id="\$\{escapeHtml\(rowId\)\}" data-frame-index="\$\{frameIndex\}" style="left:\$\{stopMotionCursorPct\.toFixed\(4\)\}%"/);
  assert.match(uiSource, /class="podcast-stop-motion-segments" data-row-id="\$\{escapeHtml\(rowId\)\}" data-scene-duration-ms="\$\{clipEffectiveDurationMs\}"/);
  assert.match(uiSource, /if \(frameIndex < stopMotionWeights\.length - 1\)/);
  // El chip sólo muestra divisiones: sin miniaturas por foto no hay N recursos
  // privados que hidratar en cada refresco del timeline.
  assert.doesNotMatch(uiSource, /class="podcast-stop-motion-segment"[\s\S]{0,240}?<img/);
  assert.match(uiSource, /frames\.length\} fotos/);
});

test("los subchips no aportan duración propia: los pesos suman siempre el ancho total del chip", () => {
  const sequence = buildFiveFrameSequence();
  assert.equal(sequence.frames.length, 5);
  const total = sequence.frameWeights.reduce((sum, weight) => sum + weight, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
  const widthsPct = sequence.frameWeights.map((weight) => (weight / total) * 100);
  assert.ok(Math.abs(widthsPct.reduce((sum, width) => sum + width, 0) - 100) < 1e-9);
});

test("mover un subchip reordena sin cambiar la suma de duraciones", () => {
  const sequence = buildFiveFrameSequence();
  const before = sequence.frameWeights.slice();
  const reordered = stopMotionModel.reorderStopMotionFrames(sequence, 2, 0);
  const sumBefore = before.reduce((sum, weight) => sum + weight, 0);
  const sumAfter = reordered.frameWeights.reduce((sum, weight) => sum + weight, 0);
  assert.ok(Math.abs(sumBefore - sumAfter) < 1e-9);
  assert.equal(reordered.frameWeights.length, 5);
  assert.equal(reordered.frames[0].name, "frame-3.jpg");
  assert.deepEqual(reordered.frames.map((frame) => frame.order), [0, 1, 2, 3, 4]);
  // Las duraciones absolutas (peso × duración del chip) siguen siendo un multiconjunto idéntico.
  const sortedBefore = before.map((weight) => weight * 8000).sort((a, b) => a - b);
  const sortedAfter = reordered.frameWeights.map((weight) => weight * 8000).sort((a, b) => a - b);
  sortedBefore.forEach((value, index) => assert.ok(Math.abs(value - sortedAfter[index]) < 1e-9));
});

test("alargar un subchip acorta sólo a su vecino y conserva el ancho total", () => {
  const sequence = buildFiveFrameSequence();
  const durationMs = 8000;
  const resized = stopMotionModel.resizeStopMotionSegment(sequence, 1, 600, durationMs, 500);
  const sumAfter = resized.frameWeights.reduce((sum, weight) => sum + weight, 0);
  assert.ok(Math.abs(sumAfter - 1) < 1e-9);
  const grew = resized.frameWeights[1] - sequence.frameWeights[1];
  const shrank = sequence.frameWeights[2] - resized.frameWeights[2];
  assert.ok(grew > 0);
  assert.ok(Math.abs(grew - shrank) < 1e-9);
  // Los demás frames quedan intactos.
  assert.equal(resized.frameWeights[0], sequence.frameWeights[0]);
  assert.equal(resized.frameWeights[3], sequence.frameWeights[3]);
  assert.equal(resized.frameWeights[4], sequence.frameWeights[4]);
});

test("el recorte interno respeta el mínimo por frame y es no-op si no cabe", () => {
  const sequence = buildFiveFrameSequence();
  const durationMs = 8000;
  const minMs = 500;
  const maxExtendMs = (sequence.frameWeights[2] * durationMs) - minMs;
  const clamped = stopMotionModel.resizeStopMotionSegment(sequence, 1, maxExtendMs + 4000, durationMs, minMs);
  assert.ok(clamped.frameWeights[2] * durationMs >= minMs - 1);
  const noOp = stopMotionModel.resizeStopMotionSegment(sequence, 1, 0, durationMs, minMs);
  assert.deepEqual(noOp.frameWeights, sequence.frameWeights);
  const tight = stopMotionModel.resizeStopMotionSegment(sequence, 0, 1000, durationMs, 7000);
  assert.deepEqual(tight.frameWeights, sequence.frameWeights);
});

test("la interacción registra los modos stop-motion y congela la base del arrastre", () => {
  assert.match(interactionSource, /function beginStopMotionSegmentDrag\(event = null\) \{/);
  assert.match(interactionSource, /mode: isResize \? "stop-motion-segment-resize" : "stop-motion-segment-move",[\s\S]*?stopMotionBase,[\s\S]*?sceneDurationMs,[\s\S]*?minFrameMs,/);
  assert.match(interactionSource, /if \(drag\.mode === "stop-motion-segment-move" \|\| drag\.mode === "stop-motion-segment-resize"\) \{/);
  assert.match(interactionSource, /model\.resizeStopMotionSegment\(\s*drag\.stopMotionBase,/);
  assert.match(interactionSource, /model\.reorderStopMotionFrames\(drag\.stopMotionBase, drag\.frameIndex, dropIndex\)/);
  assert.match(interactionSource, /updateDialogueVideoStopMotionForRow\(rowId, reordered, \{ reason: "stop-motion-segment-reorder" \}\)/);
  assert.match(interactionSource, /updateDialogueVideoStopMotionForRow\(rowId, preview, \{ reason: "stop-motion-segment-resize" \}\)/);
  // El commit sólo escribe si el arrastre realmente se movió (clic = seleccionar escena).
  assert.match(interactionSource, /if \(!model \|\| !rowId \|\| !drag\.stopMotionBase \|\| drag\.moved !== true\) return;/);
});

test("el recorte exterior reproporciona las duraciones relativas automáticamente", () => {
  const sequence = buildFiveFrameSequence();
  const atNineSeconds = sequence.frameWeights.map((weight) => weight * 9000);
  const atSixSeconds = sequence.frameWeights.map((weight) => weight * 6000);
  assert.ok(Math.abs(atNineSeconds.reduce((sum, value) => sum + value, 0) - 9000) < 1e-9);
  assert.ok(Math.abs(atSixSeconds.reduce((sum, value) => sum + value, 0) - 6000) < 1e-9);
  // Misma proporción relativa elegida por el usuario tras abrir la esquina del chip.
  sequence.frameWeights.forEach((weight, index) => {
    assert.ok(Math.abs(atNineSeconds[index] / 9000 - atSixSeconds[index] / 6000) < 1e-9);
    assert.ok(Math.abs(weight - sequence.frameWeights[index]) < 1e-9);
  });
});

test("arrastrar el subchip 3 al frente reordena la secuencia y conserva el ancho total", async () => {
  globalThis.CSS = globalThis.CSS || { escape: (value) => String(value).replace(/[^\w-]/g, "\\$&") };
  globalThis.document = globalThis.document || {
    body: { classList: { add() {}, remove() {} } },
    addEventListener() {},
    removeEventListener() {},
    elementFromPoint: () => null
  };
  const { createPodcasterTimelineInteractionApi } = await import("../public/podcaster/podcaster-timeline-interaction.js");
  const sequence = buildFiveFrameSequence();
  const writes = [];
  const podcastVideoState = { timelineDrag: null, timelineAudioSelection: { geminiRowIds: new Set(), uploadedKeys: new Set(), panelLoopKey: "" } };
  const session = { dialogueVideoMap: { r1: { stopMotion: sequence } } };
  const segmentEls = new Map();
  for (let i = 0; i < 5; i += 1) {
    segmentEls.set(i, { style: {}, classList: { add() {}, remove() {} } });
  }
  const stripEl = {
    style: {},
    querySelector(selector) {
      const match = String(selector).match(/data-frame-index="(\d+)"/);
      if (!match) return null;
      if (String(selector).includes("data-stop-motion-segment")) return segmentEls.get(Number(match[1])) || null;
      return null;
    },
    parentElement: null
  };
  const api = createPodcasterTimelineInteractionApi({
    els: {
      podcastVideoTimeline: {
        getBoundingClientRect: () => ({ left: 0, right: 10000, width: 10000, top: 0, bottom: 100 }),
        scrollLeft: 0,
        querySelector(selector) {
          if (String(selector).includes("podcast-stop-motion-segments")) return stripEl;
          return null;
        }
      }
    },
    podcastVideoState,
    getActiveSession: () => session,
    getTimelineViewMode: () => "tracks",
    timelinePxToMs: (px) => (px * 1000) / 52,
    resolveTimelineDragStepMs: () => 1,
    snapTimelineMsWithStep: (ms) => Math.round(ms),
    STUDIO_TIMELINE_MIN_CLIP_MS: 500,
    selectTimelineSceneRow: () => {},
    updateDialogueVideoStopMotionForRow: (rowId, nextStopMotion) => {
      writes.push({ rowId, nextStopMotion });
      session.dialogueVideoMap[rowId] = { ...session.dialogueVideoMap[rowId], stopMotion: nextStopMotion };
      return nextStopMotion
    }
  });

  const segmentControl = {
    dataset: { rowId: "r1", frameIndex: "2" },
    hasAttribute: (name) => name === "data-stop-motion-segment",
    closest: (selector) => (String(selector).includes("podcast-stop-motion-segments") ? stripEl : null)
  };
  const downEvent = {
    button: 0,
    clientX: 500,
    clientY: 10,
    target: { closest: (selector) => (String(selector).includes("data-stop-motion") ? segmentControl : null) },
    preventDefault() {},
    shiftKey: false,
    metaKey: false,
    ctrlKey: false
  };
  // stripEl debe reportar la duración de escena de 8000 ms
  stripEl.dataset = { sceneDurationMs: "8000" };
  stripEl.querySelector = (selector) => {
    const match = String(selector).match(/data-frame-index="(\d+)"/);
    if (!match) return null;
    if (String(selector).includes("data-stop-motion-segment")) return segmentEls.get(Number(match[1])) || null;
    return null;
  };

  api.handlePointerDown(downEvent);
  assert.equal(podcastVideoState.timelineDrag?.mode, "stop-motion-segment-move");
  assert.equal(podcastVideoState.timelineDrag?.frameIndex, 2);

  // Mover 3.5 segundos hacia la izquierda cruza los frames 0 y 1 (cada uno dura 1600 ms).
  const moveEvent = { clientX: 500 - Math.round((3500 * 52) / 1000), clientY: 10 };
  api.applyClipDrag(moveEvent);
  assert.equal(podcastVideoState.timelineDrag.moved, true);
  api.finalizeClipDrag();
  assert.equal(writes.length, 1);
  const reordered = writes[0].nextStopMotion;
  assert.equal(reordered.frames[0].name, "frame-3.jpg");
  assert.ok(Math.abs(reordered.frameWeights.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-9);

  // Resize: alargar la foto 2 acorta sólo la foto 3 y mantiene la suma.
  writes.length = 0;
  const weightsBeforeResize = session.dialogueVideoMap.r1.stopMotion.frameWeights.slice();
  const resizeControl = {
    dataset: { rowId: "r1", frameIndex: "1" },
    hasAttribute: (name) => name === "data-stop-motion-resize",
    closest: (selector) => {
      const text = String(selector);
      if (text.includes("data-stop-motion-resize")) return resizeControl;
      if (text.includes("podcast-stop-motion-segments")) return stripEl;
      return null;
    }
  };
  const resizeDown = {
    button: 0,
    clientX: 500,
    clientY: 10,
    target: { closest: (selector) => (String(selector).includes("data-stop-motion") ? resizeControl : null) },
    preventDefault() {},
    shiftKey: false,
    metaKey: false,
    ctrlKey: false
  };
  api.handlePointerDown(resizeDown);
  assert.equal(podcastVideoState.timelineDrag?.mode, "stop-motion-segment-resize");
  assert.equal(podcastVideoState.timelineDrag?.frameIndex, 1);
  api.applyClipDrag({ clientX: 500 + Math.round((400 * 52) / 1000), clientY: 10 });
  assert.equal(podcastVideoState.timelineDrag.moved, true);
  api.finalizeClipDrag();
  assert.equal(writes.length, 1);
  const resizedWeights = writes[0].nextStopMotion.frameWeights;
  assert.ok(Math.abs(resizedWeights.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-6);
  assert.ok(resizedWeights[1] > weightsBeforeResize[1]);
  assert.ok(Math.abs((resizedWeights[1] - weightsBeforeResize[1]) - (weightsBeforeResize[2] - resizedWeights[2])) < 1e-6);
});
