export async function collectCourseInventories({ modelUrl, targetUrl, views = ["model", "target"], available, open, inspect, progress, onInventory=async()=>{} }) {
  if (!available) throw new Error("El navegador remoto no está disponible. Recarga la página para conectar con el servidor.");
  const result = {};
  for (const [view, url] of [["model", modelUrl], ["target", targetUrl]]) {
    if (!views.includes(view)) continue;
    if (!url) throw new Error(view === "target" ? "Indica la URL del curso destino." : "Indica la URL del curso modelo.");
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("URL de curso inválida.");
    progress(view === "model" ? "Abriendo y analizando el curso modelo…" : "Abriendo y analizando el curso destino…");
    await open(view);
    const inventory = await inspect({ courseView: view, url });
    if (!inventory || !Array.isArray(inventory.sections) || inventory.sections.length === 0)
      throw new Error("No se encontró la estructura del curso. Inicia sesión en Moodle en el panel central y vuelve a analizar.");
    result[view] = inventory;
    await onInventory(inventory,view);
  }
  return result;
}

export function isAnalysisOnly(brief) {
  return /analiz|revis|estudi|inspeccion|compar|comprend|identific|busc|localiz|encuentr/i.test(brief) &&
    !/modific|cambi|crea|replic|insert|añad|agreg|reescri|actualiz|elimin|edit|copi|duplic|organiz|muev/i.test(brief);
}

// Reading the model never depends on a destination URL. Moving content is an
// explicit hand-off, not an implicit consequence of mentioning creation.
export function resolveChatRequest(brief, thread = "model") {
  const text=String(brief).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const change=/\b(crea\w*|modifica\w*|cambia\w*|replica\w*|inserta\w*|anad\w*|agrega\w*|reescrib\w*|actualiza\w*|elimina\w*|edita\w*|copi\w*|duplica\w*|organiza\w*|mueve\w*)\b/.test(text);
  const transfer=change && /\bdestino\b/.test(text);
  const analysisOnly=thread==="model" ? !transfer : !change;
  const views=analysisOnly
    ? /\bambos\b|compar/.test(text)?["model","target"]:/\bmodelo\b/.test(text)?["model"]:/\bdestino\b/.test(text)?["target"]:[thread]
    : /\bmodelo\b/.test(text)||thread==="model"?["model","target"]:["target"];
  return {analysisOnly,views};
}
