import fs from "node:fs";

const podcasterSource = fs.readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const runtimeModulePath = new URL("../public/podcaster/podcaster-media-runtime.js", import.meta.url);
const runtimeModuleSource = fs.existsSync(runtimeModulePath)
  ? fs.readFileSync(runtimeModulePath, "utf8")
  : "";

if (!/import\s+\{\s*createPodcasterMediaRuntimeApi\s*\}\s+from\s+"\.\/podcaster-media-runtime\.js";/m.test(podcasterSource)) {
  throw new Error("podcaster.js debe importar createPodcasterMediaRuntimeApi desde podcaster-media-runtime.js.");
}

for (const legacyFn of [
  "isLocalProxyMediaUrl",
  "markLocalProxyMediaUnavailable",
  "shouldShortCircuitLocalProxyMediaFetch",
  "buildDialogueVideoSourceKey",
  "markStaleProxyMediaUrl",
  "isMarkedStaleProxyMediaUrl",
  "resolveStaleAwareProxyMediaUrl",
  "parseFirebaseStorageObjectUrl",
  "deriveStoragePathFromMediaSource",
  "normalizePersistedMediaReference",
  "normalizeMediaReferenceFromRecord",
  "isLikelyImageMediaRecord",
  "buildImageReferenceRecordFromMedia",
  "markStaleDialogueVideoSource",
  "isStaleDialogueVideoSource"
]) {
  if (new RegExp(`function\\s+${legacyFn}\\s*\\(`, "m").test(podcasterSource)) {
    throw new Error(`podcaster.js no debe seguir implementando ${legacyFn}; debe vivir en podcaster-media-runtime.js.`);
  }
}

if (!/export\s+function\s+createPodcasterMediaRuntimeApi\s*\(/m.test(runtimeModuleSource)) {
  throw new Error("podcaster-media-runtime.js debe exportar createPodcasterMediaRuntimeApi.");
}

const runtimeInitIndex = podcasterSource.indexOf("const podcasterMediaRuntimeApi = createPodcasterMediaRuntimeApi(");
const referenceInitIndex = podcasterSource.indexOf("const podcasterMediaReferenceApi = createPodcasterMediaReferenceApi(");
if (runtimeInitIndex < 0 || referenceInitIndex < 0 || runtimeInitIndex > referenceInitIndex) {
  throw new Error("podcaster.js debe inicializar podcasterMediaRuntimeApi antes de podcasterMediaReferenceApi.");
}

console.log("Podcaster media runtime module regression test OK.");
