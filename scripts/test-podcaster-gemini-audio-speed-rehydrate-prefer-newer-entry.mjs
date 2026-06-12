import assert from "node:assert/strict";
import { mergeCloudVsLocalSessions } from "../public/podcaster/podcaster-session-store.js";
import { readFileSync } from "node:fs";

const merged = mergeCloudVsLocalSessions(
  [{
    id: "s1",
    updatedAt: "2026-06-11T12:00:00.000Z",
    dialogueAudioMap: {
      "row-1": {
        rowId: "row-1",
        playbackRate: 1,
        updatedAt: "2026-06-11T12:00:00.000Z",
        downloadUrl: "cloud.wav"
      }
    },
    script: {
      rows: [{
        id: "row-1",
        playbackRate: 1,
        updatedAt: "2026-06-11T12:00:00.000Z"
      }]
    }
  }],
  [{
    id: "s1",
    updatedAt: "2026-06-10T12:00:00.000Z",
    dialogueAudioMap: {
      "row-1": {
        rowId: "row-1",
        playbackRate: 4.5,
        updatedAt: "2026-06-11T13:00:00.000Z",
        downloadUrl: "local.wav"
      }
    },
    script: {
      rows: [{
        id: "row-1",
        playbackRate: 4.5,
        updatedAt: "2026-06-11T13:00:00.000Z"
      }]
    }
  }],
  {
    mergeSessionRowsWithFallback(primaryRows = [], fallbackRows = []) {
      return primaryRows.length ? primaryRows : fallbackRows;
    }
  }
);

assert.equal(merged[0].dialogueAudioMap["row-1"].playbackRate, 4.5);
assert.equal(merged[0].script.rows[0].playbackRate, 4.5);

const source = readFileSync(
  new URL("../public/podcaster/podcaster.js", import.meta.url),
  "utf8"
);

assert.match(
  source,
  /const audioUpdatedAt = Date\.parse\(String\(audioClip\?\.updatedAt \|\| ""\)\);[\s\S]*const rowUpdatedAt = Date\.parse\(String\(row\?\.updatedAt \|\| ""\)\);[\s\S]*rowUpdatedAt > audioUpdatedAt[\s\S]*return normalizeDialogueAudioPlaybackRate\(rowPlaybackRate \|\| audioClip\?\.playbackRate \|\| 1\);/m,
  "La resolución de playbackRate debe preferir el valor de la fila cuando su updatedAt sea más nuevo que el del dialogueAudioMap."
);

console.log("Podcaster Gemini audio speed rehydrate prefers newer entry OK.");
