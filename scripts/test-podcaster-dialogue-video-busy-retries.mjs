import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-video-generator.js",
  "utf8"
);

assert.match(
  source,
  /const maxBusyRetries = 6;/,
  "La generación de escenas no debe quedarse reintentando backend_busy durante demasiados minutos."
);

assert.match(
  source,
  /function buildDialogueVideoBusyHint\(source = null, attempt = 0, maxAttempts = 0\)/,
  "El frontend debe construir un mensaje explícito para backend_busy."
);

assert.match(
  source,
  /Backend ocupado con una exportación pesada en Render\./,
  "El mensaje de espera debe distinguir cuando el backend está ocupado por una exportación pesada."
);

assert.match(
  source,
  /Backend ocupado con otra generación de escena\./,
  "El mensaje de espera debe distinguir cuando hay otra generación VEO activa."
);

console.log("Podcaster dialogue video busy retry policy OK.");
