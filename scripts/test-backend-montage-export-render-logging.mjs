import assert from "node:assert/strict";
import fs from "node:fs";

const serverSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);
const renderSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/render.yaml",
  "utf8"
);

assert.match(
  serverSource,
  /const MONTAGE_EXPORT_RENDERED_TEXT_FRAME_LIMIT = Math\.max\([\s\S]*320/,
  "backend debe permitir suficientes frames PNG para copiar el estilo del frontend."
);

assert.match(
  serverSource,
  /const MONTAGE_EXPORT_FORCE_ASS_TEXT_ON_RENDER = IS_RENDER_RUNTIME && process\.env\.MONTAGE_EXPORT_FORCE_ASS_TEXT_ON_RENDER !== "false"/,
  "backend debe forzar ASS en Render por defecto."
);

assert.match(
  serverSource,
  /\[backend\]\[montage-export\]\[scene-onscreen-rendered-frames-limit\][\s\S]*fallback: "rendered_png_sampled"/,
  "backend debe loggear cuando recorta frames PNG sin degradar a ASS."
);

assert.match(
  serverSource,
  /\[backend\]\[montage-export\]\[scene-ffmpeg-preflight\][\s\S]*argCount:[\s\S]*inputCount:[\s\S]*filterCount:[\s\S]*renderedTextFrameLimit:/,
  "backend debe loggear preflight FFmpeg por escena con conteos concretos."
);

assert.match(
  serverSource,
  /\[backend\]\[montage-export\]\[scene-error\][\s\S]*stderrPreview:[\s\S]*memory:/,
  "backend debe loggear errores de escena con stderr y memoria."
);

assert.match(
  serverSource,
  /sceneOnScreenTextMode: shouldBurnSceneOnScreenText \? "rendered_png" : "ass"/,
  "backend debe reportar el modo de texto de escena en el visual-pass decision."
);

assert.match(
  renderSource,
  /name:\s+snoopy-export[\s\S]*MONTAGE_EXPORT_RENDERED_TEXT_FRAME_LIMIT\s*\n\s*value:\s+320/,
  "Render debe declarar un limite de frames PNG suficientemente alto para mantener el estilo del frontend."
);

assert.match(
  renderSource,
  /MONTAGE_EXPORT_FORCE_ASS_TEXT_ON_RENDER\s*\n\s*value:\s+true/,
  "Render debe forzar ASS de texto en Render."
);

console.log("Backend montage export render logging OK.");
