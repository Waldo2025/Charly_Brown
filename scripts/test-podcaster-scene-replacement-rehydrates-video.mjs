import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const replacementSource = readFileSync(
  new URL("../public/podcaster/podcaster-media-replacement.js", import.meta.url),
  "utf8"
);

assert.match(
  replacementSource,
  /const updatedSession = window\.upsertActiveSession\([\s\S]*?const hydratedSession = updatedSession \|\| getActivePodcasterSession\(\);/,
  "El reemplazo debe conservar la sesión devuelta por upsertActiveSession."
);

assert.match(
  replacementSource,
  /playbackController\.sync\(hydratedSession, hydratedConfig\);[\s\S]*?window\.syncPodcastVideoStageMedia\(hydratedSession, currentEditingRowId, \{ force: true \}\);/,
  "El controlador debe recibir la sesión nueva antes de forzar la rehidratación del escenario."
);

assert.match(
  replacementSource,
  /await playbackController\.getBlobUrl\(playbackSource, \{ persistent: true \}\);[\s\S]*?window\.syncPodcastVideoStageMedia\(hydratedSession, currentEditingRowId, \{ force: true \}\);/,
  "El video reemplazado debe descargarse como blob persistente antes de sincronizar el escenario."
);

assert.doesNotMatch(
  replacementSource,
  /window\.syncPodcastVideoStageMedia\(session \|\| getActivePodcasterSession\(\), currentEditingRowId/,
  "La escena no debe volver a sincronizarse con la sesión capturada antes del reemplazo."
);

console.log("Podcaster scene replacement video rehydration OK.");
