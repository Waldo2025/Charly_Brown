import { readFileSync } from "node:fs";

const jsSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const generatorSource = readFileSync(new URL("../public/podcaster/podcaster-script-generator.js", import.meta.url), "utf8");

// 1. Verify in podcaster.js
if (!/setSidepanelOpen\s*,?\s*\};/.test(jsSource)) {
  throw new Error("setSidepanelOpen debe estar en la interfaz podcasterGenerationRuntimeApi.");
}

if (!/Object\.assign\(\s*window\s*,\s*\{[\s\S]*setSidepanelOpen\s*,?\s*\}\s*\);/.test(jsSource)) {
  throw new Error("setSidepanelOpen debe exportarse globalmente en el Object.assign(window).");
}

// 2. Verify in podcaster-script-generator.js
if (!/setSidepanelOpen:\s*windowSetSidepanelOpen\s*,/.test(generatorSource)) {
  throw new Error("El generador de guiones debe destructurar setSidepanelOpen como windowSetSidepanelOpen.");
}

if (!/const setSidepanelOpen = \(isOpen\) => \{[\s\S]*window\.setSidepanelOpen\(isOpen\)/.test(generatorSource)) {
  throw new Error("El generador de guiones debe proveer un wrapper local con fallback para setSidepanelOpen.");
}

console.log("Podcaster setSidepanelOpen global export and fallback OK.");
