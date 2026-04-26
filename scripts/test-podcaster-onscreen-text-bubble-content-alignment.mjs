import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.css", import.meta.url), "utf8");

if (!/\.podcast-on-screen-text-bubble\.is-bg-none\.is-resizable\s*\{[\s\S]*?display:\s*block;/m.test(source)) {
  throw new Error("La burbuja resizable sin fondo no debe volver a un layout flex que neutralice la alineación.");
}

if (/\.podcast-on-screen-text-bubble\.is-bg-none(?:\.is-resizable)?\s*\{[\s\S]*?width:\s*(?:auto|fit-content)\s*!important;/m.test(source)) {
  throw new Error("La burbuja sin fondo no debe forzar auto/fit-content sobre el ancho inline.");
}

if (!/\.podcast-on-screen-text-content\s*\{[\s\S]*?width:\s*100%;[\s\S]*?margin:\s*0;[\s\S]*?text-align:\s*inherit;/m.test(source)) {
  throw new Error("El contenido debe ocupar y alinear el rectángulo de la burbuja resizable.");
}

console.log("Podcast onscreen text bubble/content alignment OK.");
