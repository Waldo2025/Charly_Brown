/**
 * Traduce mensajes técnicos del chat que contienen identificadores internos
 * (sessionId, targetActivityId, targetUnitId, design_*, etc.) a expresiones
 * humanas, claras y pedagógicas basadas en el nombre del subtema o actividad,
 * preservando los parámetros e IDs intactos en el backend.
 */

export function formatFriendlyChatMessage(rawText = "", session = null) {
  if (!rawText || typeof rawText !== "string") return "";
  const text = rawText.trim();

  // Si no contiene parámetros técnicos ni llamadas de herramientas, devolver el texto tal cual
  if (!text.includes("sessionId=") && !text.includes("targetActivityId=") && !text.includes("targetUnitId=") && !text.includes("design_") && !text.includes("create_teacher_notes")) {
    return text;
  }

  // 1. Extraer subtema
  const subtopicMatch = text.match(/subtopic=(?:["']([^"']+)["']|([^,\s\n]+))/i);
  const subtopic = subtopicMatch ? (subtopicMatch[1] || subtopicMatch[2]) : "";

  // 2. Extraer ID y nombre de la actividad
  const actIdMatch = text.match(/targetActivityId=([a-zA-Z0-9_-]+)/i);
  const actId = actIdMatch ? actIdMatch[1] : "";
  let activityTitle = "";
  if (actId && session) {
    const act = (session.accepted?.activities || []).find((a) => a.id === actId)
      || (session.units || []).flatMap((u) => u.accepted?.activities || []).find((a) => a.id === actId);
    if (act) activityTitle = act.title || act.subtopic || "";
  }
  const actTitleQuoted = text.match(/actividad aprobada\s*["']([^"']+)["']/i);
  if (actTitleQuoted?.[1]) activityTitle = actTitleQuoted[1];

  const targetLabel = activityTitle
    ? `"${activityTitle}"${subtopic && subtopic !== activityTitle ? ` (${subtopic})` : ""}`
    : (subtopic || "la actividad");

  // 3. Detectar qué herramienta o recurso se está solicitando
  if (text.includes("design_teacher_note") || text.includes("create_teacher_notes")) {
    const hasResources = /recursos vinculados/i.test(text) || /cuenta con los siguientes \d+ recurso/i.test(text);
    return `Crear notas del maestro para la actividad de ${targetLabel}${hasResources ? " articulando los recursos vinculados" : ""}.`;
  }

  if (text.includes("design_worksheet")) {
    return text.includes("regenerar")
      ? `Regenerar ficha de trabajo para ${targetLabel}.`
      : `Crear ficha de trabajo para ${targetLabel}.`;
  }

  if (text.includes("design_annex")) {
    return text.includes("regenerar")
      ? `Regenerar anexo gráfico para ${targetLabel}.`
      : `Crear anexo gráfico para ${targetLabel}.`;
  }

  if (text.includes("design_cutout")) {
    return text.includes("regenerar")
      ? `Regenerar recortable para ${targetLabel}.`
      : `Crear recortable para ${targetLabel}.`;
  }

  if (text.includes("design_video_script")) {
    return text.includes("regenerar")
      ? `Regenerar guion de video para ${targetLabel}.`
      : `Crear guion de video para ${targetLabel}.`;
  }

  if (text.includes("design_activity")) {
    if (text.includes("Estrategia") || text.includes("Para saber más")) {
      const matchBlock = text.match(/«([^»]+)»/);
      const blockLabel = matchBlock ? matchBlock[1] : "bloque";
      return `Proponer otra alternativa para el bloque «${blockLabel}» de la actividad de ${targetLabel}.`;
    }
    return text.includes("regenerate") || text.includes("otra propuesta") || text.includes("alternativa")
      ? `Proponer otra alternativa para la actividad de ${targetLabel}.`
      : `Diseñar actividad para ${targetLabel}.`;
  }

  if (text.includes("design_reading_stage")) {
    if (text.includes("synonyms")) return "Generar tabla de sinónimos para la lectura.";
    if (text.includes("comprehension")) return "Generar preguntas de comprensión para la lectura.";
    return "Generar lectura principal de la unidad.";
  }

  // Limpiar cualquier residuo de sessionId, targetUnitId, etc., si aún queda algo
  return text
    .replace(/\s*sessionId=[a-zA-Z0-9_-]+/gi, "")
    .replace(/\s*targetUnitId=[a-zA-Z0-9_-]+/gi, "")
    .replace(/\s*targetActivityId=[a-zA-Z0-9_-]+/gi, "")
    .replace(/\s*targetContentId=[a-zA-Z0-9_-]+/gi, "")
    .replace(/\s*baseRevision=\d+/gi, "")
    .trim();
}
