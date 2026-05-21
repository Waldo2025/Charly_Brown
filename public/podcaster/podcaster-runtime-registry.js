let generationRuntime = null;
let chatRuntime = null;
let publicLibraryRuntime = null;
let scriptEditorRuntime = null;

function requireRuntime(runtime, name) {
  if (!runtime || typeof runtime !== "object") {
    throw new Error(`${name} no está disponible. Revisa la carga de podcaster.js.`);
  }
  return runtime;
}

export function registerPodcasterGenerationRuntime(api = null) {
  generationRuntime = api && typeof api === "object" ? api : null;
  return generationRuntime;
}

export function requirePodcasterGenerationRuntime() {
  return requireRuntime(generationRuntime, "PodcasterGenerationRuntime");
}

export function registerPodcasterChatRuntime(api = null) {
  chatRuntime = api && typeof api === "object" ? api : null;
  return chatRuntime;
}

export function requirePodcasterChatRuntime() {
  return requireRuntime(chatRuntime, "PodcasterChatRuntime");
}

export function registerPodcasterPublicLibraryRuntime(api = null) {
  publicLibraryRuntime = api && typeof api === "object" ? api : null;
  return publicLibraryRuntime;
}

export function requirePodcasterPublicLibraryRuntime() {
  return requireRuntime(publicLibraryRuntime, "PodcasterPublicLibraryRuntime");
}

export function registerPodcasterScriptEditorRuntime(api = null) {
  if (!api || typeof api !== "object") {
    scriptEditorRuntime = null;
    return scriptEditorRuntime;
  }
  scriptEditorRuntime = scriptEditorRuntime && typeof scriptEditorRuntime === "object"
    ? { ...scriptEditorRuntime, ...api }
    : { ...api };
  return scriptEditorRuntime;
}

export function requirePodcasterScriptEditorRuntime() {
  return requireRuntime(scriptEditorRuntime, "PodcasterScriptEditorRuntime");
}
