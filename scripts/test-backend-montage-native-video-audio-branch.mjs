import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../backend/server.js", import.meta.url), "utf8");

assert.match(
  source,
  /else if \(useNativeVideoAudio && videoHasAudio\) \{[\s\S]*audioFilterGraph = `\[0:a:0\]volume=\$\{veoVolume\},aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo\[aout\]`;/,
  "La rama de audio VEO nativo debe reusar el audio del MP4 sin mezclarlo con anullsrc."
);

assert.doesNotMatch(
  source,
  /else if \(useNativeVideoAudio && videoHasAudio\) \{[\s\S]*amix=inputs=2:duration=first:dropout_transition=0\.05:normalize=0\[aout\]/,
  "La rama de audio VEO nativo no debe mezclar audio real con una pista silenciosa."
);

console.log("Backend montage native video audio branch OK.");
