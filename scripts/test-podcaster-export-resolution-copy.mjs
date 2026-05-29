import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");

if (!html.includes('>Fuente original</option>')) {
  throw new Error('La opción source debe explicarse como "Fuente original".');
}

if (!html.includes('>1080p final (1920×1080)</option>')) {
  throw new Error('La opción 1080p debe mostrar su resolución final explícita.');
}

if (!html.includes('>720p final (1280×720)</option>')) {
  throw new Error('La opción 720p debe mostrar su resolución final explícita.');
}

if (!html.includes('>480p final (854×480)</option>')) {
  throw new Error('La opción 480p debe mostrar su resolución final explícita.');
}

if (!html.includes('Si el video original es menor, el export puede escalarlo sin añadir detalle real.')) {
  throw new Error("Falta la nota aclaratoria sobre upscale sin detalle extra.");
}

console.log("Podcaster export resolution copy OK.");
