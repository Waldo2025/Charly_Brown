import { readFileSync } from "node:fs";

const htmlContent = readFileSync(
  new URL("../public/podcaster.html", import.meta.url),
  "utf8"
);

// 1. Verify that the original header reel switch exists
if (!htmlContent.includes('id="reelModeToggle"')) {
  throw new Error("El archivo public/podcaster.html debe contener el elemento original con ID 'reelModeToggle'.");
}

// 2. Verify that the new footer/composer reel switch exists
if (!htmlContent.includes('id="reelModeToggle_footer"')) {
  throw new Error("El archivo public/podcaster.html debe contener el nuevo elemento con ID 'reelModeToggle_footer'.");
}

// 3. Verify that reelModeToggle_footer is inside composer-switches-wrapper
const switchesWrapperStart = htmlContent.indexOf('class="composer-switches-wrapper"');
if (switchesWrapperStart === -1) {
  throw new Error("No se encontró 'composer-switches-wrapper' en public/podcaster.html.");
}

const wrapperSnippet = htmlContent.slice(switchesWrapperStart, switchesWrapperStart + 3000);
if (!wrapperSnippet.includes('id="reelModeToggle_footer"')) {
  throw new Error("El switch 'reelModeToggle_footer' debe estar posicionado dentro de 'composer-switches-wrapper'.");
}

console.log("Podcaster reel-toggle elements verification test OK.");
