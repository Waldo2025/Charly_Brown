import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/podcaster.css", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

if (!/id="podcastVideoModal" class="floating-panel-modal snoopy-editor-modal"/.test(html)) {
  throw new Error("El modal principal de Snoopy debe tener la clase snoopy-editor-modal.");
}

if (!/id="creativeVideoModal" class="floating-panel-modal snoopy-editor-modal"/.test(html)) {
  throw new Error("El modal creativo de Snoopy debe tener la clase snoopy-editor-modal.");
}

for (const id of ["podcastVideoModalFullscreenBtn", "creativeVideoModalFullscreenBtn"]) {
  if (!new RegExp(`id="${id}"[\\s\\S]*aria-pressed="false"[\\s\\S]*fa-expand`).test(html)) {
    throw new Error(`Falta el botón fullscreen ${id} con estado ARIA e icono inicial.`);
  }
}

for (const id of [
  "timelineClipDurationModal",
  "geminiCreativityModal",
  "podcastTransitionPickerModal",
  "dialogueVideoDirectiveModal",
  "musicConfigModal",
  "audioTrackMixModal",
  "globalConfigModal",
  "montageExportModal"
]) {
  if (!new RegExp(`id="${id}" class="floating-panel-modal snoopy-editor-child-modal"`).test(html)) {
    throw new Error(`El modal hijo ${id} debe quedar por encima del editor fullscreen.`);
  }
}

if (!/\.floating-panel-modal\.snoopy-editor-modal\.is-snoopy-editor-fullscreen[\s\S]*z-index: 2147483000/.test(css)) {
  throw new Error("El editor fullscreen debe tener una capa alta dedicada.");
}

if (!/\.has-snoopy-editor-fullscreen \.snoopy-editor-child-modal[\s\S]*z-index: 2147483400/.test(css)) {
  throw new Error("Los modales hijos deben tener z-index superior al editor fullscreen.");
}

if (!/function setSnoopyEditorFullscreen\(modal = null, enabled = false, options = \{\}\)[\s\S]*has-snoopy-editor-fullscreen[\s\S]*syncSnoopyEditorFullscreenButtons\(\);/.test(js)) {
  throw new Error("El JS debe alternar la clase global y sincronizar botones fullscreen.");
}

if (!/async function requestSnoopyBrowserFullscreen\(targetModal = null\)[\s\S]*\? targetModal[\s\S]*: els\.podcastVideoModal;[\s\S]*target\.requestFullscreen\(\{ navigationUI: "hide" \}\)/m.test(js)) {
  throw new Error("El botón fullscreen de Snoopy debe activar pantalla completa real sobre #podcastVideoModal o el modal activo.");
}

if (!/function dockSnoopyChildModalsForFullscreen\(targetModal = null\)[\s\S]*document\.querySelectorAll\("\.snoopy-editor-child-modal"\)[\s\S]*targetModal\.appendChild\(modal\);/m.test(js)) {
  throw new Error("Los modales hijos deben moverse dentro del modal fullscreen para poder verse sobre #podcastVideoModal.");
}

if (!/function restoreSnoopyChildModalsAfterFullscreen\(\)[\s\S]*anchor\.parent\.insertBefore\(modal, anchor\.nextSibling \|\| null\);[\s\S]*snoopyFullscreenChildModalAnchors\.clear\(\);/m.test(js)) {
  throw new Error("Los modales hijos deben restaurarse a su posición original al salir de fullscreen.");
}

if (!/async function exitSnoopyBrowserFullscreen\(\)[\s\S]*document\.exitFullscreen\(\)/m.test(js)) {
  throw new Error("Salir de fullscreen de Snoopy debe llamar document.exitFullscreen().");
}

if (!/document\.addEventListener\("fullscreenchange", syncSnoopyEditorFullscreenFromBrowser\);[\s\S]*document\.addEventListener\("webkitfullscreenchange", syncSnoopyEditorFullscreenFromBrowser\);/m.test(js)) {
  throw new Error("El estado fullscreen debe sincronizarse cuando el navegador salga de pantalla completa.");
}

if (!/function syncSnoopyEditorFullscreenButtons\(\)[\s\S]*aria-pressed[\s\S]*fa-compress[\s\S]*fa-expand/.test(js)) {
  throw new Error("Los botones fullscreen deben sincronizar aria-pressed e iconos expand/compress.");
}

if (!/getSnoopyFullscreenModal\(\)[\s\S]*setSnoopyEditorFullscreen\(fullscreenSnoopyModal, false\);[\s\S]*return;/.test(js)) {
  throw new Error("Escape debe salir de fullscreen antes de cerrar Snoopy.");
}

console.log("Podcaster Snoopy editor fullscreen OK.");
