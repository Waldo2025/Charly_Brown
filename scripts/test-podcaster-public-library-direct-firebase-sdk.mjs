import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../public/podcaster/podcaster-public-library.js", import.meta.url),
  "utf8"
);
const firestoreRules = readFileSync(
  new URL("../firestore.rules", import.meta.url),
  "utf8"
);
const storageRules = readFileSync(
  new URL("../storage.rules", import.meta.url),
  "utf8"
);

if (/authFetchJson|hasAvailableApiBase|\/api\/podcaster\/scene-library\//.test(source)) {
  throw new Error("podcaster-public-library.js no debe usar backend /api/podcaster/scene-library; debe usar Firebase SDK directo.");
}

for (const token of [
  "firebase-firestore.js",
  "firebase-storage.js",
  "firebase-auth.js",
  "collection",
  "query",
  "orderBy",
  "limit",
  "getDocs",
  "setDoc",
  "deleteDoc",
  "uploadBytesResumable",
  "uploadString",
  "getDownloadURL"
]) {
  if (!source.includes(token)) {
    throw new Error(`podcaster-public-library.js debe usar ${token} para la librería pública directa.`);
  }
}

for (const fnName of [
  "fetchPodcastSceneLibraryDirect",
  "publishPodcastSceneLibraryItemDirect",
  "uploadLocalPodcastSceneLibraryVideoDirect",
  "updatePodcastSceneLibraryItemDirect",
  "deletePodcastSceneLibraryItemDirect",
  "resolvePublicSceneLibraryPlayableUrlDirect",
  "isPublicSceneLibraryImageItem"
]) {
  if (!source.includes(`function ${fnName}`) && !source.includes(`async function ${fnName}`)) {
    throw new Error(`Falta helper directo ${fnName}.`);
  }
}

if (!/if \(isPublicSceneLibraryImageItem\(normalized\)\)[\s\S]*swapStageToImagePreview/.test(source)) {
  throw new Error("Las escenas públicas de imagen deben previsualizarse en el stage de imagen, no como <video>.");
}

if (!/resolvePublicSceneLibraryPlayableUrlDirect\(normalized\)/.test(source)) {
  throw new Error("La reproducción de escenas públicas debe resolver storagePath con Firebase Storage SDK directo.");
}

if (!/const storagePath = clampText\(normalized\.storagePath \|\| normalized\.videoStoragePath \|\| "", 900\);[\s\S]*if \(storagePath\) \{[\s\S]*getDownloadURL\(storageRef\(firebaseStorage, storagePath\)\)[\s\S]*\}[\s\S]*const directDownloadUrl = clampText\(normalized\.downloadUrl \|\| "", 3000\);[\s\S]*return directDownloadUrl;/m.test(source)) {
  throw new Error("La librería pública debe refrescar primero el downloadUrl desde storagePath por SDK y solo usar el downloadUrl persistido como fallback.");
}

for (const pattern of [
  /publicSceneVideoStoragePath:\s*published\.storagePath\s*\|\|\s*""/,
  /publicSceneStoragePath:\s*published\.storagePath\s*\|\|\s*""/,
  /publicSceneVideoStoragePath:\s*normalized\.storagePath\s*\|\|\s*""/,
  /publicSceneStoragePath:\s*normalized\.storagePath\s*\|\|\s*""/,
  /publicSceneVideoStoragePath:\s*nextStoragePath/,
  /publicSceneStoragePath:\s*nextStoragePath/
]) {
  if (!pattern.test(source)) {
    throw new Error("Las escenas públicas deben persistir publicSceneVideoStoragePath/publicSceneStoragePath al publicar, insertar y clonar para rehidratar por SDK sin depender del token viejo.");
  }
}

for (const pattern of [
  /function normalizePublicSceneVisualEffects\(/,
  /function resolvePublicSceneVisualEffectsForRow\(/,
  /visualEffects:\s*normalizePublicSceneVisualEffects\(data\.visualEffects/,
  /visualEffects:\s*resolvePublicSceneVisualEffectsForRow\(session,\s*key\)/,
  /const restoredVisualEffects = normalizePublicSceneVisualEffects\(normalized\.visualEffects\)/,
  /visualEffectsMap:\s*restoredVisualEffects[\s\S]*\?\s*\{[\s\S]*\(current\.visualEffectsMap \|\| \{\}\),[\s\S]*\[rowId\]: restoredVisualEffects/
]) {
  if (!pattern.test(source)) {
    throw new Error("Las escenas públicas de imagen deben conservar y restaurar visualEffectsMap al publicar e insertar.");
  }
}

if (!/visualEffects:\s*normalizePublicSceneVisualEffects\(item\.visualEffects\)/.test(
  readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8")
)) {
  throw new Error("normalizePodcastSceneLibraryItem debe preservar visualEffects para escenas públicas con imagen en movimiento.");
}

if (!/match \/podcaster_scene_library\/\{libraryId\}/.test(firestoreRules)) {
  throw new Error("firestore.rules debe permitir acceso seguro a podcaster_scene_library desde SDK.");
}

if (!/match \/podcaster\/library\/scenes\/\{libraryId\}\/\{allPaths=\*\*\}/.test(storageRules)) {
  throw new Error("storage.rules debe permitir assets de podcaster/library/scenes por SDK.");
}

console.log("Podcaster public library direct Firebase SDK OK.");
