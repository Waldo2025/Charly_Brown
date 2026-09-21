import { experience } from "./escape-room-experience.mjs?v=20260912-text-pieces-v9";
export const CLASSIC_INTERACTION_CATALOG = Object.freeze([
  "texto",
  "opcion_multiple",
  "relacion_columnas",
  "drag_drop",
  "multimedia",
  "verdadero_falso",
  "ordenar_secuencia",
  "completar_espacio"
]);
export const ESCAPE_ROOM_INTERACTION_CATALOG = Object.freeze([...experience.types]);

function hashSeed(value = "") {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffledCatalog(seed = "", allowed = CLASSIC_INTERACTION_CATALOG) {
  const values = [...allowed];
  let state = hashSeed(seed) || 1;
  for (let index = values.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

export function buildInteractionPlan(missionCount = 1, questionsPerMission = 1, seed = "escape-room", allowedTypes = CLASSIC_INTERACTION_CATALOG) {
  const allowed = [...new Set(allowedTypes.filter(type => ESCAPE_ROOM_INTERACTION_CATALOG.includes(type)))];
  if (!allowed.length) throw new Error("Selecciona al menos un tipo de pregunta.");
  const rooms = Math.max(1, Math.min(8, Number(missionCount) || 1));
  const requestedQuestions = Number(questionsPerMission);
  const questions = Number.isFinite(requestedQuestions)
    ? Math.max(1, Math.floor(requestedQuestions))
    : 1;
  const usage = new Map(ESCAPE_ROOM_INTERACTION_CATALOG.map((type) => [type, 0]));
  const plan = [];
  let previousFirst = "";

  for (let roomIndex = 0; roomIndex < rooms; roomIndex += 1) {
    const selected = [];
    const roomUsage = new Map(ESCAPE_ROOM_INTERACTION_CATALOG.map((type) => [type, 0]));
    for (let questionIndex = 0; questionIndex < questions; questionIndex += 1) {
      let candidates = shuffledCatalog(`${seed}:${roomIndex}:${questionIndex}`, allowed)
        .filter((type) => allowed.length === 1 || type !== "drag_drop" || !selected.includes("drag_drop"));
      if (questionIndex === 0 && previousFirst && candidates.length > 1) {
        candidates = candidates.filter((type) => type !== previousFirst).concat(candidates.filter((type) => type === previousFirst));
      }
      const previousType = selected.at(-1);
      candidates.sort((left, right) => {
        const leftPenalty = (usage.get(left) || 0) + (roomUsage.get(left) || 0) + (left === previousType ? questions + 1 : 0);
        const rightPenalty = (usage.get(right) || 0) + (roomUsage.get(right) || 0) + (right === previousType ? questions + 1 : 0);
        return leftPenalty - rightPenalty;
      });
      const selectedType = candidates[0] || allowed[0];
      selected.push(selectedType);
      roomUsage.set(selectedType, (roomUsage.get(selectedType) || 0) + 1);
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
