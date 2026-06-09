import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);

assert.match(
  source,
  /els\.podcastStudioInspectorRowEditor\.addEventListener\("click",[\s\S]*handleSharedCreativeRowAction\((?:event\.)?target\)/,
  "El panel podcastStudioInspectorRowEditor debe delegar las acciones al despachador compartido."
);

assert.match(
  source,
  /action === "delete-visual-proposal-text"[\s\S]*deleteVisualProposalForRow/,
  "El despachador compartido debe manejar delete-visual-proposal-text para tachar la propuesta activa."
);

console.log("Podcaster inspector delete proposal handler OK.");
