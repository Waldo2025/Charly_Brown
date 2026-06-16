import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

const movieOverlayCount = (source.match(/movie=filename='/g) || []).length;

if (!movieOverlayCount) {
  throw new Error("No se encontraron overlays estáticos de FFmpeg creados con movie=filename.");
}

if (/movie=filename='[\s\S]{0,700}overlay=[^`\n]*shortest=1/.test(source)) {
  throw new Error("Los overlays estáticos creados con movie=filename no deben usar shortest=1 porque pueden cortar el stream de video.");
}

if (!/overlay=eof_action=pass:shortest=0:x=\$\{xExpr\}:y=\$\{yExpr\}:format=auto/.test(source)) {
  throw new Error("El overlay de marca debe conservar el video base completo con eof_action=pass:shortest=0.");
}

if (!/overlay=eof_action=pass:shortest=0:x=\$\{baseX\}:y=\$\{baseY\}:format=auto:enable='\$\{baseEnableExpr\}'/.test(source)) {
  throw new Error("El overlay rasterizado base de texto debe conservar el video base completo.");
}

if (!/overlay=eof_action=pass:shortest=0:x=\$\{baseX\}:y=\$\{baseY\}:format=auto:enable='\$\{wordEnableExpr\}'/.test(source)) {
  throw new Error("El overlay rasterizado de karaoke debe conservar el video base completo.");
}

console.log("Podcaster montage export static overlays keep video OK.");
