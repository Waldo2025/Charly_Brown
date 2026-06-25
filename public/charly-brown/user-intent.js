export function routeUserIntent(text = "") {
  const value = normalizeIntentText(text);
  if (!value) return "chat";
  if (/\b(genera|generar|crear|crea|haz|hacer|prepara|preparar|redacta|redactar)\b.*\b(actividades|activities|activity|ejercicios|reactivos)\b/.test(value)) return "activities";
  if (/\b(hacer|haz|mas|más)\s+(facil|fácil|sencillo|simple)\b/.test(value) && /\b(actividad|actividades|activity|activities|propuesta)\b/.test(value)) return "activities";
  if (/\b(hacer|haz|mas|más)\s+(dificil|difícil|retador|experto)\b/.test(value) && /\b(actividad|actividades|activity|activities|propuesta)\b/.test(value)) return "activities";
  if (/\b(genera|generar|crear|crea|haz|hacer|prepara|preparar|redacta|redactar)\b.*\b(lectura|texto)\b/.test(value)) return "reading";
  if (/\b(busca|buscar|elige|elegir|selecciona|seleccionar|usar)\b.*\b(lectura|lecturas)\b/.test(value)) return "select-reading";
  if (/\b(secuencia|alcance|sya|sya)\b/.test(value) && /\b(revisa|revisar|carga|cargar|trae|buscar|busca|aplica|aplicar)\b/.test(value)) return "sya";
  if (/\b(genera|generar|crear|crea|haz|hacer|prepara|preparar|redacta|redactar)\b.*\b(notas|guia)\b.*\b(maestro|docente|profesor)\b/.test(value)) return "teacher-notes";
  return "chat";
}

export function normalizeIntentText(text = "") {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
