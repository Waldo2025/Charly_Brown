import { readFileSync } from "node:fs";

const controllerSource = readFileSync(new URL("../public/podcaster-playback-controller.js", import.meta.url), "utf8");
const studioSource = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

if (!/if \(session && this\.deps\?\.syncPodcastStudioRuntimeUi\) \{[\s\S]*?this\.deps\.syncPodcastStudioRuntimeUi\(session, activeRowId, speaker, \{\s*speaking: true,\s*lightweightInspector: true\s*\}\);/m.test(controllerSource)) {
  throw new Error("El playback del Studio debe usar la ruta runtime liviana en vez de setPodcastVideoRow pesado por escena.");
}

if (!/if \(!lightweight && this\.deps\?\.syncStudioTimelinePreview && this\.deps\?\.enableExternalStudioPreviewSync === true\)/.test(controllerSource)) {
  throw new Error("El controller no debe resincronizar el stage externo del Studio salvo que se habilite explícitamente.");
}

if (!/if \(podcastVideoState\.montageActive === true\) return;\s*syncPodcastVideoStageMedia\(session, ""\);/m.test(studioSource)) {
  throw new Error("syncStudioTimelinePreview debe quedar desactivado durante montaje activo en Studio.");
}

if (!/skipInspectorSync: options\.lightweightInspector === true/.test(studioSource)) {
  throw new Error("La ruta runtime del Studio debe poder omitir el inspector durante playback.");
}

console.log("Podcaster studio preview lite runtime OK.");
