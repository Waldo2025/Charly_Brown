import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../public/podcaster/podcaster-media-replacement.js", import.meta.url),
  "utf8"
);

assert.match(
  source,
  /const uploadResult = await uploadPodcasterAsset\([\s\S]*?showSceneMediaUploadStatus\(uploadResult\?\.media\?\.transcoded/,
  "El resultado de uploadPodcasterAsset debe seguir disponible al mostrar el estado final de la subida."
);

assert.doesNotMatch(
  source,
  /showSceneMediaUploadStatus\(data\?\.media\?\.transcoded/,
  "El callback de FilePond no debe consultar una variable data inexistente."
);

assert.match(
  source,
  /const data = await authFetchJson\(`\/api\/podcaster\/sessions\/list-videos\?sessionSlug=\$\{encodeURIComponent\(sessionSlug\)\}`\);\s*const rawVideos =/,
  "La biblioteca de reemplazo debe cargar su respuesta antes de normalizar los videos."
);

console.log("Podcaster media replacement upload response OK.");
