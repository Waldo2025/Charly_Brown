import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

if (!/const editorPreviewMode = !podcastVideoState\.montageActive;/.test(source)
  || !/const shouldShowPreferredRow = forceRow \|\| \(editorPreviewMode && Boolean\(preferredRowId\)\);/.test(source)
  || !/if \(isTimeActive \|\| \(shouldShowPreferredRow && isPreferred\)\) \{/.test(source)
  || !/selected = candidates\.find\(.*preferredRowId.*\(item\.isTimeActive \|\| shouldShowPreferredRow\)\)/s.test(source)) {
  throw new Error("El preview del editor debe mostrar el texto de la fila activa aunque el cursor no caiga dentro del clip.");
}

console.log("Podcast onscreen editor preferred-row preview OK.");
