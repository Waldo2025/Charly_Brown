import assert from "node:assert/strict";
import {
  findEscapeRoomManifestPath,
  isSafeArchivePath,
  resolveArchiveAssetPath,
  restorePigPenArchiveAssets
} from "../public/js/escape-room-zip-import.mjs";

assert.equal(findEscapeRoomManifestPath(["index.html", "Exportado/assets/escape-room.json"]), "Exportado/assets/escape-room.json");
assert.equal(findEscapeRoomManifestPath(["assets/escape-room.json", "Otra/assets/escape-room.json"]), "assets/escape-room.json");
assert.equal(findEscapeRoomManifestPath(["escape-room.json"]), "");
assert.equal(isSafeArchivePath("assets/media/a.png"), true);
assert.equal(isSafeArchivePath("../secreto.png"), false);
assert.equal(isSafeArchivePath("/absoluto.png"), false);
assert.equal(resolveArchiveAssetPath("Exportado/assets/escape-room.json", "assets/media/a.png"), "Exportado/assets/media/a.png");
assert.equal(resolveArchiveAssetPath("Exportado/assets/escape-room.json", "../outside.png"), "");

const bytes = new Uint8Array([137, 80, 78, 71]);
const imported = await restorePigPenArchiveAssets({
  themeConfig: { baseColor: "#0ea5e9" },
  backgroundImage: "assets/media/cover.png",
  misiones: [{ imagen: "https://example.com/remote.png", preguntas: [{ imagen: "assets/media/question.png" }, { media: { tipo: "audio", url: "assets/media/missing.mp3" } }] }]
}, {
  manifestPath: "Exportado/assets/escape-room.json",
  getBinary: async (path) => path.endsWith("cover.png") || path.endsWith("question.png") ? bytes : null
});

assert.match(imported.project.backgroundImage, /^data:image\/png;base64,/);
assert.match(imported.project.misiones[0].preguntas[0].imagen, /^data:image\/png;base64,/);
assert.equal(imported.project.misiones[0].imagen, "https://example.com/remote.png");
assert.equal(imported.project.misiones[0].preguntas[1].media.url, "");
assert.deepEqual(imported.missingPaths, ["assets/media/missing.mp3"]);
assert.equal(imported.project.themeConfig.baseColor, "#0ea5e9");
console.log("escape-room ZIP import helpers OK.");
