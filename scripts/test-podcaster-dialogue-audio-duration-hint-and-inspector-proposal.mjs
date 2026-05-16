import assert from "node:assert/strict";
import fs from "node:fs";

const publicSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);

const backendSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

assert.match(
  publicSource,
  /const displayedActiveVisualProposal = resolveDisplayedVisualProposal\(activeRow\);/,
  "El inspector principal debe usar resolveDisplayedVisualProposal(activeRow) para que la propuesta activa también se vea resuelta allí."
);

assert.match(
  publicSource,
  /const targetDurationSec = Math\.max\(0, Number\(row\?\.durationSec \|\| 0\) \|\| 0\);[\s\S]*const speechRateHint = computeDurationSpeedMultiplier\(dialogueText, targetDurationSec/,
  "La generación de audio debe calcular una pista de velocidad a partir de durationSec."
);

assert.match(
  publicSource,
  /targetDurationSec,\s*speechRateHint,/,
  "La generación de audio debe enviar targetDurationSec y speechRateHint al backend."
);

assert.match(
  backendSource,
  /const targetDurationSec = Math\.max\(0, Number\(req\.body\?\.targetDurationSec \|\| 0\) \|\| 0\);[\s\S]*const speechRateHint = Math\.max\(0\.5, Math\.min\(1\.85, Number\(req\.body\?\.speechRateHint \|\| 1\) \|\| 1\)\);/,
  "El backend debe aceptar la duración objetivo y la pista de velocidad."
);

assert.match(
  backendSource,
  /Target duration: .*seconds[\s\S]*Speech rate hint: /,
  "El prompt TTS debe incluir la duración objetivo y la pista de velocidad para variar el ritmo de locución."
);

assert.match(
  backendSource,
  /function buildFfmpegAtempoFilterChain\(speedRatio = 1\)/,
  "El backend debe construir una cadena atempo para retimar realmente el audio Gemini."
);

assert.match(
  backendSource,
  /const retimedAudio = await retimeDialogueAudioBufferToTargetDuration\(baseBuffer, \{\s*targetDurationSec,\s*measuredDurationSec: naturalDurationSec,/,
  "La ruta de diálogo debe ajustar el audio final a la duración objetivo antes de guardarlo."
);

console.log("Podcaster dialogue audio duration hint and inspector proposal OK.");
