import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-playback-controller.js",
  "utf8"
);

assert.match(
  source,
  /const isDirectFirebaseUrl = url\.includes\('firebasestorage\.googleapis\.com'\);[\s\S]*const isImageLikeUrl = \/\\\.\(png\|jpe\?g\|webp\|gif\|avif\|svg\)/,
  "El loader debe detectar explícitamente imágenes remotas de Firebase."
);

assert.match(
  source,
  /const isDirectRemoteImage = isImageLikeFinalUrl && !String\(finalUrl \|\| ""\)\.includes\('\/api\/'\);[\s\S]*if \(isDirectFirebaseUrl && isDirectRemoteImage\) \{[\s\S]*return finalUrl;[\s\S]*if \(isImageLikeUrl && isDirectRemoteImage\) \{[\s\S]*return finalUrl;/,
  "Las imágenes remotas directas deben devolverse como URL directa sin pasar por fetch/blob/objectURL para evitar CORS innecesario."
);

console.log("Podcaster playback controller bypasses fetch for Firebase images OK.");
