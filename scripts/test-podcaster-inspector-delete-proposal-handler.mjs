import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster.js",
  "utf8"
);

assert.match(
  source,
  /els\.podcastStudioInspectorRowEditor\.addEventListener\("click",[\s\S]*const deleteProposalTextBtn = event\.target\.closest\("\[data-action='delete-visual-proposal-text'\]\[data-row-id\]"\);[\s\S]*deleteVisualProposalForRow\(rowId, text\);/,
  "El panel podcastStudioInspectorRowEditor debe manejar delete-visual-proposal-text para tachar la propuesta activa allí también."
);

console.log("Podcaster inspector delete proposal handler OK.");
