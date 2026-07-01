import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

assert.ok(
  source.includes("montage_export_missing_scene_asset")
    && source.includes("montage_export_missing_audio_asset")
    && source.includes("renderMontageGapFillerClip")
    && source.includes("generateSolidPpm"),
  "El export MP4 debe degradar storage_not_found a placeholder sin abortar el job."
);

console.log("Backend montage export missing asset fallback OK.");
