const INVALID_GENERATED_TEXT = /^(?:undefined|null|nan|\[object object\])$/i;

export function meaningfulActivityText(value) {
  const text = typeof value === "string" || typeof value === "number"
    ? String(value).replace(/\s+/g, " ").trim()
    : "";
  return text && !INVALID_GENERATED_TEXT.test(text) ? text : "";
}

export function deriveScienceActivityContext(activity = {}) {
  const topic = meaningfulActivityText(activity.topic) || "el tema seleccionado";
  const experiencePrompt = meaningfulActivityText(activity.experiencePrompt);
  const experience = experiencePrompt
    || `Explora ${topic}, toma decisiones y comprueba sus efectos mediante la evidencia del juego.`;
  const mission = meaningfulActivityText(activity.mission)
    || `Completa la experiencia propuesta: ${experience}`;
  const objective = experiencePrompt || mission;
  const scientificPrinciple = meaningfulActivityText(activity.scientificPrinciple)
    || (activity.subject === "math"
      ? `Las decisiones sobre ${topic} deben justificarse con relaciones, representaciones y resultados comprobables.`
      : `La explicación de ${topic} se construye al relacionar las variables manipuladas con la evidencia observada.`);

  return { experiencePrompt, experience, objective, mission, scientificPrinciple };
}

export function applyScienceActivityContext(activity = {}) {
  const context = deriveScienceActivityContext(activity);
  activity.experiencePrompt = context.experiencePrompt;
  activity.mission = context.mission;
  activity.scientificPrinciple = context.scientificPrinciple;
  return activity;
}

export function buildScienceExperienceIntroduction(activity = {}) {
  const context = deriveScienceActivityContext(activity);
  return [
    `Objetivo del juego: ${context.objective}`,
    `Principio ${activity.subject === "math" ? "matemático" : "científico"}: ${context.scientificPrinciple}`
  ].join("\n\n");
}
