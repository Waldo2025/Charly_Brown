/**
 * Empty escape-room scaffolding a teacher fills by hand: structure and question
 * topology only, never model calls.
 */
import { buildInteractionPlan } from "./escape-room-interaction-plan.mjs?v=20260904-unlimited-questions-v44";
import { experience } from "./escape-room-experience.mjs?v=20260924-coordinate-grid-v12";
import { fixedInteraction, CONTENT_SLOT } from "./pigpen-fixed-content.mjs?v=20260917-attributes-v8";
import { getAuthoringLabels, normalizeGameLocale } from "./escape-room-game-i18n.mjs?v=20261002-manual-template-v1";

// These banks are numbers, operators or grid cells; text markers would break their contracts.
const KEEP_FIXED_LABELS = new Set(["expression", "coordinates"]);

export function buildManualTemplatePlan({ rooms = 1, questionsPerRoom = 1, questionTypes = [], seed = "manual-template" } = {}) {
  const allowed = [...new Set((Array.isArray(questionTypes) ? questionTypes : []).filter(Boolean))];
  return buildInteractionPlan(rooms, questionsPerRoom, seed, allowed.length ? allowed : ["texto"]);
}

export function buildManualTemplateInteractionData(type, locale = "es-419", seed = 0) {
  const contract = fixedInteraction(type, experience, seed);
  if (!contract || !experience.get(type)) return null;
  const labels = getAuthoringLabels(locale);
  const marker = (value, replacement) => String(value || "").startsWith(CONTENT_SLOT) ? replacement : value;
  contract.instructions = marker(contract.instructions, labels.exerciseInstructions);
  contract.extra_hint = marker(contract.extra_hint, labels.extraHint);
  if (!KEEP_FIXED_LABELS.has(experience.get(type).family)) {
    (contract.options || []).forEach((option, index) => { option.label = marker(option.label, `${labels.token} ${index + 1}`); });
    (contract.targets || []).forEach((target, index) => { target.label = marker(target.label, `${labels.target} ${index + 1}`); });
  }
  return contract;
}

export function buildManualTemplateQuestion({ roomIndex = 0, questionIndex = 0, type = "texto", locale = "es-419" } = {}) {
  const safeLocale = normalizeGameLocale(locale);
  const labels = getAuthoringLabels(safeLocale);
  const marker = (prefix, index) => `${prefix} ${index}`;
  const question = {
    id: `question-${roomIndex + 1}-${questionIndex + 1}`,
    release: "",
    titulo: "",
    reto: "",
    tipo_interaccion: type,
    subtipo_respuesta: "palabra",
    respuesta_correcta: "",
    respuestas_aceptadas: [],
    opciones: [],
    parejas: [],
    elementos: [],
    texto_con_hueco: "",
    media: null,
    pista: "",
    retroalimentacion_correcta: "",
    retroalimentacion_incorrecta: "",
    requiere_imagen: false,
    imagen_prompt: "",
    imagen_alt: "",
    imagen: "",
    bloqueada_inicial: false,
    interaction_contract_version: 0
  };

  if (type === "opcion_multiple") {
    question.opciones = [1, 2, 3, 4].map((index) => marker(labels.option, index));
    question.respuesta_correcta = question.opciones[0];
    question.respuestas_aceptadas = [question.opciones[0]];
    question._correctOptionIndex = 0;
  } else if (type === "verdadero_falso") {
    question.respuesta_correcta = true;
  } else if (type === "relacion_columnas") {
    question.interaction_contract_version = 2;
    question.parejas = [1, 2, 3].map((index) => ({ izquierda: marker(labels.pairLeft, index), derecha: marker(labels.pairRight, index) }));
    question.opciones = [marker(labels.distractor, 1), marker(labels.distractor, 2)];
  } else if (type === "drag_drop") {
    question.parejas = [1, 2, 3].map((index) => ({ izquierda: marker(labels.pairLeft, index), derecha: marker(labels.pairRight, index) }));
  } else if (type === "ordenar_secuencia") {
    question.elementos = [1, 2, 3].map((index) => marker(labels.sequenceItem, index));
  } else if (type === "completar_espacio") {
    question.interaction_contract_version = 2;
    question.texto_con_hueco = "___";
    question.parejas = [{ izquierda: "1", derecha: marker(labels.pairRight, 1) }];
    question.opciones = [marker(labels.distractor, 1)];
  } else if (type === "multimedia") {
    question.interaction_contract_version = 1;
    question.subtipo_respuesta = "frase_corta";
    question.opciones = [1, 2, 3, 4].map((index) => marker(labels.option, index));
    question.respuesta_correcta = question.opciones[0];
    question.respuestas_aceptadas = [question.opciones[0]];
    question._correctOptionIndex = 0;
    question.imagen_alt = labels.imageAlt;
  } else if (type === "texto") {
    question.respuesta_correcta = labels.answer;
    question.respuestas_aceptadas = [labels.answer];
  } else if (experience.get(type)) {
    question.interaction_data = buildManualTemplateInteractionData(type, safeLocale, (roomIndex + 1) * 31 + questionIndex + 1);
  }

  return question;
}

export function buildManualTemplateQuestions({ roomIndex = 0, types = [], locale = "es-419" } = {}) {
  return (Array.isArray(types) ? types : []).map((type, questionIndex) => buildManualTemplateQuestion({ roomIndex, questionIndex, type, locale }));
}
