import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

assert.match(
  source,
  /function shouldSkipMontageEntryError\(error\) \{[\s\S]*"scene_download_timeout"[\s\S]*"storage_download_idle_timeout"[\s\S]*"downloaded_asset_invalid"[\s\S]*"scene_probe_timeout"[\s\S]*"scene_render_timeout"[\s\S]*"ffmpeg_exit_code"[\s\S]*\}/m,
  "Errores recuperables por escena deben omitirse para que el montage export continúe con las demás escenas."
);

console.log("Podcaster backend montage skippable scene errors OK.");
