import { readFileSync } from "node:fs";

const shared = readFileSync(new URL("../public/on-screen-text-render-spec.js", import.meta.url), "utf8");
const controller = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/podcaster.css", import.meta.url), "utf8");
const home = readFileSync(new URL("../public/home.html", import.meta.url), "utf8");

if (!/function wrapOnScreenTextRenderText\(text, options\)/.test(shared)
  || !/wrappedText,/.test(shared)
  || !/clampedYPct: Math\.max\(0, Math\.min\(1, yPx \/ exportCanvasHeight\)\)/.test(shared)) {
  throw new Error("La spec compartida debe resolver wrap y posición vertical segura.");
}

if (!/const rowLayout = this\.deps\?\.getOnScreenTextLayoutForRow\?\.\(session, selected\.rowId\)\s*\|\|\s*null;/.test(controller)
  || !/const renderOptions = \{\s*text,\s*previewWidthPx,\s*previewHeightPx,[\s\S]*widthPct: Number\(rowLayout\?\.widthPct \|\| 0\.58\),[\s\S]*heightPct: Number\(rowLayout\?\.heightPct \|\| 0\.14\),[\s\S]*xPct: Number\(rowLayout\?\.xPct \|\| 0\.21\),[\s\S]*yPct: Number\(rowLayout\?\.yPct \|\| 0\.7\)/m.test(controller)) {
  throw new Error("El overlay del editor debe consumir el layout por fila al resolver métricas.");
}

if (!/contentNode\.style\.setProperty\("--pod-onscreen-text-bubble-width", `\$\{bubbleWidthPx\}px`\);/.test(controller)
  || !/contentNode\.style\.setProperty\("min-height", `\$\{bubbleHeightPx\}px`\);/.test(controller)
  || !/contentNode\.style\.setProperty\("height", "auto"\);/.test(controller)
  || !/overlay\.style\.setProperty\("--pod-onscreen-text-x", `\$\{bubbleLeftPct \* 100\}%`\);/.test(controller)
  || !/overlay\.style\.setProperty\("--pod-onscreen-text-y", `\$\{bubbleTopPct \* 100\}%`\);/.test(controller)) {
  throw new Error("El preview debe aplicar geometría de burbuja desde el layout por fila.");
}

if (!/const contentHtml = this\.deps\.escapeHtml\(renderMetrics\.wrappedText \|\| text\);/.test(controller)
  || !/contentNode\.style\.setProperty\('--pod-onscreen-text-color', settings\.textColor \|\| '#f8fafc'\);/.test(controller)) {
  throw new Error("El preview debe seguir usando el wrap compartido y los tokens de estilo del texto.");
}

if (!/letter-spacing:\s*0;/.test(css)
  || !/line-height:\s*var\(--pod-onscreen-text-line-height, 1\.22em\);/.test(css)
  || !/--pod-onscreen-text-stroke-color:\s*rgba\(15, 23, 42, 0\.88\);/.test(css)
  || !/--pod-onscreen-text-stroke-shadow:\s*none;/.test(css)
  || !/text-shadow:\s*var\(--pod-onscreen-text-stroke-shadow\), var\(--pod-onscreen-text-preset-shadow\), var\(--pod-onscreen-text-user-shadow\);/.test(css)) {
  throw new Error("La capa visual del texto en el editor debe usar tokens cercanos al render exportado.");
}

if (!/top:\s*var\(--pod-onscreen-text-y, 72%\);/.test(css)
  || !/max-width:\s*min\(96%, 1400px\);/.test(css)
  || !/top:\s*var\(--pod-onscreen-text-y, 72%\);/.test(home)
  || !/max-width:\s*min\(96%, 1400px\);/.test(home)) {
  throw new Error("Editor y Home deben compartir defaults de posición y ancho para el texto en pantalla.");
}

console.log("Podcast onscreen preview parity OK.");
