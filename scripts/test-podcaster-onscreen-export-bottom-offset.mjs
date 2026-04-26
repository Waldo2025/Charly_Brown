import { readFileSync } from "node:fs";

const shared = readFileSync(new URL("../public/on-screen-text-render-spec.js", import.meta.url), "utf8");
const source = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!/const bottomSafetyPx = Math\.max\(\s*Math\.round\(lineHeightPx \* 2\.4\),\s*Math\.round\(fontSizePx \* 1\.9\),\s*Math\.round\(exportCanvasHeight \* 0\.035\)\s*\);/s.test(shared)) {
  throw new Error("La spec compartida debe reservar margen inferior extra para que el texto no quede pegado al bottom.");
}

if (!/const maxYPx = Math\.max\(0, exportCanvasHeight - boxHeightPx - bottomSafetyPx\);/.test(shared)
  || !/const yPx = Math\.max\(0, Math\.min\(maxYPx, rawYPx\)\);/.test(shared)
  || !/y=\$\{spec\.yPx\}/.test(source)) {
  throw new Error("La posición Y del texto exportado debe salir de la spec compartida con margen inferior aplicado.");
}

console.log("Podcast onscreen export bottom offset OK.");
