import { readFileSync } from "node:fs";

const shared = readFileSync(new URL("../public/on-screen-text-render-spec.js", import.meta.url), "utf8");
const front = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const back = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!/function resolveOnScreenTextExportCanvasSize\(resolution, sourceWidth, sourceHeight\)/.test(shared)
  || !/function resolveOnScreenTextRenderSpec\(input\)/.test(shared)) {
  throw new Error("Debe existir una spec compartida para el texto en pantalla.");
}

if (!/const previewScaleY = Math\.max\(0\.0001, previewHeightPx \/ exportCanvasHeight\);/.test(shared)
  || !/previewFontSizePx: Math\.max\(12, Math\.round\(fontSizePx \* previewScaleY \* 1000\) \/ 1000\)/.test(shared)
  || !/previewLineHeightPx: Math\.max\(12, Math\.round\(lineHeightPx \* previewScaleY \* 1000\) \/ 1000\)/.test(shared)) {
  throw new Error("La spec compartida debe escalar tipografía contra el canvas de export.");
}

if (!/const boxWidthPx = Math\.max\(120, Math\.round\(exportCanvasWidth \* widthPct\)\);/.test(shared)
  || !/const minBoxHeightPx = Math\.max\(/.test(shared)
  || !/const boxHeightPx = Math\.max\(minBoxHeightPx, Math\.round\(exportCanvasHeight \* heightPct\)\);/.test(shared)
  || !/const maxLines = Math\.max\(2, Math\.floor\(boxHeightPx \/ lineHeightPx\)\);/.test(shared)) {
  throw new Error("La caja de texto debe salir de la geometría de export y no del CSS del editor.");
}

if (!/const spec = resolveSharedOnScreenTextRenderSpec[\s\S]*previewWidthPx,[\s\S]*previewHeightPx,/m.test(front)
  || !/font-size:\$\{renderMetrics\.previewFontSizePx\}px/.test(front)
  || !/--pod-onscreen-text-line-height:\$\{metrics\.previewLineHeightPx\}px/.test(front)) {
  throw new Error("El frontend debe consumir la spec compartida para el tamaño del preview.");
}

if (!/const spec = resolveOnScreenTextRenderSpec\(\{[\s\S]*resolution: input\.resolution,[\s\S]*sourceWidth: sourceDims\.width,[\s\S]*sourceHeight: sourceDims\.height,[\s\S]*text: segment\.text \|\| ""/m.test(back)
  || !/fontsize=\$\{spec\.fontSizePx\}/.test(back)
  || !/line_spacing=\$\{spec\.lineSpacingPx\}/.test(back)) {
  throw new Error("El backend debe usar la misma spec compartida para construir drawtext.");
}

console.log("Podcast onscreen resolution sync OK.");
