let scriptGeneratorApi = null;

export function registerPodcasterScriptGeneratorApi(api = null) {
  scriptGeneratorApi = api && typeof api === "object" ? api : null;
  return scriptGeneratorApi;
}

export function requirePodcasterScriptGeneratorApi() {
  if (!scriptGeneratorApi || typeof scriptGeneratorApi !== "object") {
    throw new Error("PodcasterScriptGeneratorApi no está disponible. Revisa la carga de podcaster-script-generator.js.");
  }
  return scriptGeneratorApi;
}

export function requirePodcasterScriptGeneratorApiFunction(name = "") {
  const fn = requirePodcasterScriptGeneratorApi()?.[name];
  if (typeof fn !== "function") {
    throw new Error(`PodcasterScriptGeneratorApi.${name} no está disponible.`);
  }
  return fn;
}
