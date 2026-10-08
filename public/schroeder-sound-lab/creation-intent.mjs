const CREATION_VERB = /\b(crea|crear|cr[eé]ala|genera|generar|gen[eé]rala|comp[oó]n|componer|produce|producir|hazme|prepara|convierte|transforma)\b/i;
const AUDIO_OBJECT = /\b(canci[oó]n|tema|pista|track|m[uú]sica|instrumental|audio|frase|palabra|di[aá]logo|locuci[oó]n)\b/i;
const CONFIRMATION = /^(?:(?:s[ií][,!.]?\s*)?(?:adelante|hazla|cr[eé]ala|gen[eé]rala|prod[uú]cela|aprobada|confirmo|s[ií],?\s*(?:hazlo|hazla|cr[eé]ala|gen[eé]rala))(?:\s+con esos elementos)?|(?:por favor\s+)?(?:genera|crea|produce|haz|comp[oó]n)\s+(?:la|esa|esta|el|ese|este)\s+(?:pista|canci[oó]n|tema|m[uú]sica|audio)(?:\s+(?:con esos elementos|que hablamos|anterior))?)[.!\s]*$/i;

export function isCreationConfirmation(prompt) {
  return CONFIRMATION.test(String(prompt || "").trim());
}

export function isMusicCreationRequest(prompt) {
  const clean = String(prompt || "").trim();
  if (!clean) return false;
  if (isCreationConfirmation(clean)) return true;
  if (/\?|^(qu[eé]|qui[eé]n|cu[aá]l|cu[aá]ndo|d[oó]nde|por qu[eé]|c[oó]mo|sabes|conoces|puedes explic|ay[uú]dame a entender)\b/i.test(clean)) return false;
  if (CREATION_VERB.test(clean) && AUDIO_OBJECT.test(clean)) return true;
  return /\b(canci[oó]n|pista musical|tema musical|m[uú]sica para|instrumental|bpm|estribillo|coro|verso|balada|rock|pop|jazz|reggaet[oó]n|afrobeat|orquestal)\b/i.test(clean);
}

export function resolveMusicDraftPrompt(prompt, messages = []) {
  const clean = String(prompt || "").trim();
  if (!isCreationConfirmation(clean)) return clean;
  const priorBriefs = messages
    .filter((message) => message?.role === "user" && !message.type && typeof message.text === "string")
    .map((message) => message.text.trim())
    .filter((text) => text.length > 20 && !isCreationConfirmation(text));
  const context = priorBriefs.slice(-2).join("\n");
  return context ? `${context}\n${clean}` : clean;
}
