import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { compactCloudSessionPayload } from "../public/podcaster/podcaster-session-payload.js";

const mediaReferenceSource = readFileSync(
  new URL("../public/podcaster/podcaster-media-reference.js", import.meta.url),
  "utf8"
);

assert.match(
  mediaReferenceSource,
  /saveSessionToCloud/,
  "Las referencias de escena deben tener fallback a guardado cloud completo cuando el patch no basta."
);

const makeChat = (count = 0, size = 0) => Array.from({ length: count }, (_, index) => ({
  id: `msg_${index}`,
  role: "assistant",
  text: `m${index}:` + "x".repeat(size)
}));

const payload = {
  id: "session_ref_cloud",
  title: "Sesion",
  updatedAt: "2026-05-18T15:00:00.000Z",
  chat: makeChat(120, 5000),
  script: {
    rows: [
      {
        id: "row_ref_1",
        text: "Escena 1",
        imagePrompts: Array.from({ length: 50 }, (_, index) => `prompt ${index} ${"p".repeat(2000)}`)
      }
    ]
  },
  speakerReferenceImageMap: {
    hostA: {
      name: "Speaker Ref",
      dataUrl: `data:image/jpeg;base64,${"a".repeat(180000)}`,
      mimeType: "image/jpeg",
      updatedAt: "2026-05-18T15:00:00.000Z"
    }
  },
  scenarioReferenceImageMap: {
    sc_1: {
      name: "Scenario Ref",
      dataUrl: `data:image/jpeg;base64,${"b".repeat(180000)}`,
      mimeType: "image/jpeg",
      updatedAt: "2026-05-18T15:00:00.000Z"
    }
  },
  rowReferenceImageMap: {
    row_ref_1: {
      name: "Row Ref",
      dataUrl: `data:image/jpeg;base64,${"c".repeat(120000)}`,
      mimeType: "image/jpeg",
      updatedAt: "2026-05-18T15:00:00.000Z"
    }
  },
  rowReferenceImageListMap: {
    row_ref_1: [
      {
        name: "Row Ref",
        dataUrl: `data:image/jpeg;base64,${"c".repeat(120000)}`,
        mimeType: "image/jpeg",
        updatedAt: "2026-05-18T15:00:00.000Z"
      }
    ]
  },
  rowReferenceVideoMap: {},
  rowReferenceModeByRowId: {
    row_ref_1: "image"
  }
};

const compacted = compactCloudSessionPayload(payload);

assert.equal(
  compacted.payload?.rowReferenceImageListMap?.row_ref_1?.length,
  1,
  "La compactacion no debe borrar primero las referencias visuales por escena."
);

assert.deepEqual(
  compacted.payload?.speakerReferenceImageMap || {},
  {},
  "La compactacion debe sacrificar primero referencias globales pesadas."
);

assert.deepEqual(
  compacted.payload?.scenarioReferenceImageMap || {},
  {},
  "La compactacion debe sacrificar primero referencias de escenario pesadas."
);

console.log("Podcaster row reference cloud durability OK.");
