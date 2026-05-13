import { readFileSync } from "node:fs";

const controllerSource = readFileSync(new URL("../public/podcaster-playback-controller.js", import.meta.url), "utf8");
const studioSource = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

if (/setPodcastStageVideoSourceForElement\?\.\(inactiveEl, [^)]*\{ noWait: true \}\)/.test(controllerSource)) {
  throw new Error("El swap del preview no debe ocultar el video activo antes de que el siguiente slot esté listo.");
}

if (!/const inactiveReady = await this\.deps\?\.setPodcastStageVideoSourceForElement\?\.\(inactiveEl, entry\.videoSrc, \{ keepHidden: true \}\);\s*if \(inactiveReady !== true\) return;/m.test(controllerSource)) {
  throw new Error("El swap del preview debe esperar readiness real del slot inactivo antes de hacer el relevo.");
}

if (!/const activeReady = await this\.deps\?\.setPodcastStageVideoSourceForElement\?\.\(activeEl, entry\.videoSrc\);\s*if \(activeReady !== true\) return;/m.test(controllerSource)) {
  throw new Error("El preview no debe limpiar el frame actual si el video principal nuevo no alcanzó a cargar.");
}

if (!/this\.preloadUpcomingStageSlot\(entry, upcoming\);/.test(controllerSource)) {
  throw new Error("El controller debe precargar el siguiente slot de video antes del cambio de escena.");
}

if (!/preloadUpcomingStageSlot\(currentEntry, upcomingEntries = \[\]\)/.test(controllerSource)) {
  throw new Error("La precarga adelantada del siguiente video debe vivir en un helper explícito.");
}

if (!/this\.stageMachine\.preloadingPromise = Promise\.resolve\(\s*this\.deps\.setPodcastStageVideoSourceForElement\(inactiveEl, nextSrc, \{ keepHidden: true \}\)\s*\)/m.test(controllerSource)) {
  throw new Error("La precarga del siguiente slot debe hidratar el video inactivo completo, no solo el blob.");
}

if (!/if \(this\.stageMachine\.preloadingSrc === entry\.videoSrc && this\.stageMachine\.preloadingPromise\) \{\s*const preloaded = await this\.stageMachine\.preloadingPromise;\s*if \(preloaded !== true\) return;/m.test(controllerSource)) {
  throw new Error("El swap debe poder esperar la precarga en curso del siguiente clip antes de cambiar de escena.");
}

if (/function pauseMontageBackgroundAudio\(/.test(studioSource) || /function stopMontageBackgroundAudio\(/.test(studioSource)) {
  throw new Error("Los wrappers legacy de música de fondo deben eliminarse para dejar un único flujo en el controller.");
}

if (!/if \(paused\) \{\s*playbackController\.pauseBackgroundMusic\(\);\s*\} else \{\s*playbackController\.stopBackgroundMusic\(\);\s*\}/m.test(studioSource)) {
  throw new Error("La cancelación de secuencia debe usar el controller directamente para el audio de fondo.");
}

console.log("Podcaster stage swap without black cut OK.");
