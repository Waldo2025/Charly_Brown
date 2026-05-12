import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster.css",
  "utf8"
);

assert.match(
  source,
  /\.row-active-proposal\.is-resolved\s*\{[\s\S]*border-color:\s*#22c55e;/,
  "La propuesta activa resuelta debe usar borde verde."
);

assert.match(
  source,
  /\.row-active-proposal\.is-resolved \.row-active-proposal-label,\s*\.row-active-proposal\.is-resolved \.row-active-proposal-text\s*\{[\s\S]*color:\s*#bbf7d0;/,
  "La propuesta activa resuelta debe usar texto verde legible."
);

console.log("Podcaster resolved proposal green OK.");
