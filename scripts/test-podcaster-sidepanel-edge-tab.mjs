import { readFileSync } from "node:fs";

const htmlSource = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../public/podcaster.css", import.meta.url), "utf8");
const jsSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

if (!/id="openSidepanelBtn" class="panel-icon-btn sidepanel-edge-tab"/.test(htmlSource)) {
  throw new Error("openSidepanelBtn debe renderizarse como sidepanel-edge-tab.");
}

if (/sidepanel-edge-tab-label/.test(htmlSource)) {
  throw new Error("La pestaña externa del sidepanel ya no debe renderizar texto visible.");
}

if (/chat-stage-toggle/.test(htmlSource)) {
  throw new Error("El toggle lateral ya no debe renderizarse como chat-stage-toggle dentro del toolbar.");
}

if (!/\.sidepanel-edge-tab\s*\{/.test(cssSource)) {
  throw new Error("Faltan estilos para la pestaña externa del sidepanel.");
}

if (!/border-radius:\s*20px 0 0 20px;/.test(cssSource)) {
  throw new Error("La pestaña lateral debe usar un rail acoplado con radio continuo hacia el panel.");
}

if (!/\.sidepanel-edge-tab::after\s*\{/.test(cssSource)) {
  throw new Error("El rail acoplado debe renderizar una costura visual hacia el panel.");
}

if (!/\.sidepanel-toggle-btn\s*\{\s*display:\s*none;/.test(cssSource)) {
  throw new Error("El toggle viejo del header del sidepanel debe quedar oculto.");
}

if (!/els\.openSidepanelBtn\.setAttribute\("title", isOpen \? "Ocultar inspector" : "Mostrar inspector"\);/.test(jsSource)) {
  throw new Error("setSidepanelOpen debe actualizar el title del sidepanel edge tab.");
}

if (!/icon\.className = isOpen \? "fas fa-chevron-right" : "fas fa-chevron-left";/.test(jsSource)) {
  throw new Error("setSidepanelOpen debe alternar el icono del sidepanel edge tab.");
}

console.log("Podcaster sidepanel edge tab OK.");
