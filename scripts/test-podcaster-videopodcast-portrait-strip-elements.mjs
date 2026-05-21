import { readFileSync } from "node:fs";

const htmlContent = readFileSync(
  new URL("../public/podcaster.html", import.meta.url),
  "utf8"
);

// 1. Verify that the footer container exists
if (!htmlContent.includes('class="podcast-studio-footer"')) {
  throw new Error("El archivo public/podcaster.html debe contener el contenedor de la clase 'podcast-studio-footer'.");
}

// 2. Verify that the portrait strip element exists with the correct ID and class
if (!htmlContent.includes('id="podcastPortraitStrip"')) {
  throw new Error("El archivo public/podcaster.html debe contener el elemento con ID 'podcastPortraitStrip'.");
}

if (!htmlContent.includes('class="podcast-portrait-strip"')) {
  throw new Error("El archivo public/podcaster.html debe contener el elemento con clase 'podcast-portrait-strip'.");
}

// 3. Verify that the note about main montage audio is present
if (!htmlContent.includes("Audio principal del montaje: Gemini Live por escena.")) {
  throw new Error("El archivo public/podcaster.html debe incluir la nota aclaratoria sobre Gemini Live en el footer.");
}

console.log("Podcaster video-podcast portrait-strip container verification test OK.");
