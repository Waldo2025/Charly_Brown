import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis.window || {};

const {
  mergeMediaMapByEntryUpdatedAt,
  reconcileDialogueVideoState
} = await import("../public/podcaster/podcaster-session-store.js");

test("a stale browser window cannot replace a regenerated scene video", () => {
  const cloud = {
    row_scene_7: {
      storagePath: "podcaster/new-scene.mp4",
      updatedAt: "2026-08-21T18:10:00.000Z"
    }
  };
  const staleWindow = {
    row_scene_7: {
      storagePath: "podcaster/old-scene.mp4",
      updatedAt: "2026-08-21T17:00:00.000Z"
    }
  };

  const merged = mergeMediaMapByEntryUpdatedAt(cloud, staleWindow);
  assert.equal(merged.row_scene_7.storagePath, "podcaster/new-scene.mp4");
});

test("different scenes regenerated in two windows are both preserved", () => {
  const cloud = {
    row_1: { storagePath: "podcaster/new-1.mp4", updatedAt: "2026-08-21T18:10:00.000Z" }
  };
  const otherWindow = {
    row_1: { storagePath: "podcaster/old-1.mp4", updatedAt: "2026-08-21T17:00:00.000Z" },
    row_2: { storagePath: "podcaster/new-2.mp4", updatedAt: "2026-08-21T18:11:00.000Z" }
  };

  const merged = mergeMediaMapByEntryUpdatedAt(cloud, otherWindow);
  assert.equal(merged.row_1.storagePath, "podcaster/new-1.mp4");
  assert.equal(merged.row_2.storagePath, "podcaster/new-2.mp4");
});

test("Firestore Timestamp metadata also selects the newest generated video", () => {
  const merged = mergeMediaMapByEntryUpdatedAt(
    { row_1: { storagePath: "new.mp4", updatedAt: { seconds: 1787335800, nanoseconds: 0 } } },
    { row_1: { storagePath: "old.mp4", updatedAt: "2026-08-21T17:00:00.000Z" } }
  );
  assert.equal(merged.row_1.storagePath, "new.mp4");
});

test("a manual scene replacement takes precedence over generated clips", () => {
  const merged = mergeMediaMapByEntryUpdatedAt(
    { row_1: { storagePath: "manual.mp4", sourceType: "manual-replacement", manuallyReplaced: true, updatedAt: "2026-08-21T16:00:00.000Z" } },
    { row_1: { storagePath: "generated.mp4", updatedAt: "2026-08-21T19:00:00.000Z" } }
  );
  assert.equal(merged.row_1.storagePath, "manual.mp4");
});

test("a deliberate deletion tombstone wins over an older clip but not a later regeneration", () => {
  const deleted = reconcileDialogueVideoState(
    { dialogueVideoMap: { row_1: { storagePath: "old.mp4", updatedAt: "2026-08-21T18:00:00.000Z" } } },
    { dialogueVideoMap: {}, dialogueVideoDeletedAtMap: { row_1: "2026-08-21T18:05:00.000Z" } }
  );
  assert.equal(deleted.dialogueVideoMap.row_1, undefined);

  const regenerated = reconcileDialogueVideoState(deleted, {
    dialogueVideoMap: { row_1: { storagePath: "new.mp4", updatedAt: "2026-08-21T18:10:00.000Z" } }
  });
  assert.equal(regenerated.dialogueVideoMap.row_1.storagePath, "new.mp4");
});
