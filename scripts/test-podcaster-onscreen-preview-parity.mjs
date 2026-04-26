import { readFileSync } from "node:fs";

const shared = readFileSync(new URL("../public/on-screen-text-render-spec.js", import.meta.url), "utf8");
const front = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/podcaster.css", import.meta.url), "utf8");

if (!/function wrapOnScreenTextRenderText\(text, options\)/.test(shared)
  || !/wrappedText,/.test(shared)
  || !/clampedYPct: Math\.max\(0, Math\.min\(1, yPx \/ exportCanvasHeight\)\)/.test(shared)) {
  throw new Error("La spec compartida debe resolver wrap y posición vertical segura.");
}

if (!/const wrappedText = String\(renderMetrics\.wrappedText \|\| wrapOnScreenTextPreviewText\(selected\.text, \{[\s\S]*maxChars: renderMetrics\.maxChars,[\s\S]*maxLines: renderMetrics\.maxLines[\s\S]*\}\)\);/m.test(front)
  || !/const bubbleTopPct = Math\.max\(0, Math\.min\(1, Number\(\(renderMetrics\.clampedYPct \?\? rowLayout\?\.yPct\) \|\| 0\)\)\);/.test(front)
  || !/const bottomSafetyPct = Math\.max\(0, Math\.min\(0\.3, Number\(renderMetrics\.bottomSafetyPct \|\| 0\)\)\);/.test(front)) {
  throw new Error("El overlay del editor debe consumir wrap y margen inferior de la spec compartida.");
}

if (!/overlay\.style\.setProperty\("--pod-onscreen-text-stroke-color", String\(settings\.strokeColor \|\| "#0f172a"\)\);/.test(front)
  || !/overlay\.style\.setProperty\("--pod-onscreen-text-border-width", `\$\{Math\.max\(0, Math\.min\(12, Number\(renderMetrics\.previewBorderWidthPx \?\? 2\)\)\)}px`\);/.test(front)) {
  throw new Error("El preview debe aplicar color y grosor de stroke explícitos desde los settings.");
}

if (!/parts\.push\(\s*`width:\$\{bubbleWidth\}px`,\s*`min-height:\$\{bubbleHeight\}px`,\s*"height:auto",\s*`min-width:\$\{bubbleWidth\}px`\s*\);/m.test(front)) {
  throw new Error("La burbuja del preview debe crecer en altura para no cortar la segunda linea.");
}

if (!/letter-spacing:\s*0;/.test(css)
  || !/line-height:\s*var\(--pod-onscreen-text-line-height, 1\.22em\);/.test(css)
  || !/--pod-onscreen-text-stroke-color:\s*rgba\(15, 23, 42, 0\.88\);/.test(css)
  || !/--pod-onscreen-text-stroke-shadow:\s*none;/.test(css)
  || !/text-shadow:\s*var\(--pod-onscreen-text-stroke-shadow\), var\(--pod-onscreen-text-preset-shadow\), var\(--pod-onscreen-text-user-shadow\);/.test(css)) {
  throw new Error("La capa visual del texto en el editor debe usar tokens cercanos al render exportado.");
}

if (!/\.podcast-on-screen-text-bubble\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;[\s\S]*backdrop-filter:\s*none;/m.test(css)) {
  throw new Error("La burbuja base del texto ya no debe dibujar caja o vidrio detrás del texto.");
}

console.log("Podcast onscreen preview parity OK.");
