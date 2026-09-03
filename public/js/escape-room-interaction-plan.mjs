export const ESCAPE_ROOM_INTERACTION_CATALOG = Object.freeze([
  "texto",
  "opcion_multiple",
  "relacion_columnas",
  "drag_drop",
  "multimedia",
  "verdadero_falso",
  "ordenar_secuencia",
  "completar_espacio"
]);

function hashSeed(value = "") {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffledCatalog(seed = "") {
  const values = [...ESCAPE_ROOM_INTERACTION_CATALOG];
  let state = hashSeed(seed) || 1;
  for (let index = values.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

export function buildInteractionPlan(missionCount = 1, questionsPerMission = 1, seed = "escape-room") {
  const rooms = Math.max(1, Math.min(8, Number(missionCount) || 1));
  const questions = Math.max(1, Math.min(6, Number(questionsPerMission) || 1));
  const usage = new Map(ESCAPE_ROOM_INTERACTION_CATALOG.map((type) => [type, 0]));
  const seen = new Set();
  const plan = [];
  let previousFirst = "";

  for (let roomIndex = 0; roomIndex < rooms; roomIndex += 1) {
    let selected = [];
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const candidates = shuffledCatalog(`${seed}:${roomIndex}:${attempt}`)
        .sort((left, right) => (usage.get(left) || 0) - (usage.get(right) || 0));
      const candidate = candidates.slice(0, questions);
      if (candidate[0] === previousFirst && candidate.length > 1) {
        const replacementIndex = candidate.findIndex((type) => type !== previousFirst);
        [candidate[0], candidate[replacementIndex]] = [candidate[replacementIndex], candidate[0]];
      }
      const signature = candidate.join("|");
      if (!seen.has(signature) || attempt === 31) {
        selected = candidate;
        seen.add(signature);
        break;
      }
    }
    selected.forEach((type) => usage.set(type, (usage.get(type) || 0) + 1));
    previousFirst = selected[0] || previousFirst;
    plan.push(selected);
  }
  return plan;
}

export function formatInteractionPlanForPrompt(plan = []) {
  return plan.map((types, index) => `- Actividad/Sala ${index + 1}: ${types.join(" → ")}`).join("\n");
}
