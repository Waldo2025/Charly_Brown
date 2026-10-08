export function normalizeActivitySubtopicTitle(value = "") {
  const ignored = /^(?:todos?|actividades? generadas?|proyectos? generados?|actividades? aprobadas?|proyectos? aprobados?|m[aá]s f[aá]cil|m[aá]s dif[ií]cil|normal|orientaciones\s+metodol[oó]gicas(?:\s+por\s+actividad)?|orientaciones\s+docentes|orientaciones\s+pedag[oó]gicas|notas\s+del\s+maestro)$/i;
  let text = String(value || "").trim();
  text = text.replace(/^Actividad(?:es)?(?:\s*\d+)?\s*[:\-–—]\s*/i, "").trim();
  text = text.replace(/^(?:Orientaciones\s+(?:metodol[oó]gicas|docentes|pedag[oó]gicas)|Notas\s+del\s+maestro)(?:\s+por\s+actividad)?\s*[:\-–—]\s*/i, "").trim();

  const parts = text
    .split(/\s*(?:·|•|\||\*)\s*/)
    .map((part) => part.trim())
    .filter((part) => part && !ignored.test(part));

  let result = parts.at(-1) || "";
  result = result.replace(/^Actividad(?:es)?(?:\s*\d+)?\s*[:\-–—]\s*/i, "").trim();
  if (ignored.test(result)) return "";
  return result;
}

export function formatSubtopicLabel(value = "") {
  const normalized = normalizeActivitySubtopicTitle(value);
  if (normalized) return normalized;
  let text = String(value || "").trim();
  text = text.replace(/^Actividad(?:es)?(?:\s*\d+)?\s*[:\-–—]\s*/i, "").trim();
  text = text.replace(/^(?:Orientaciones\s+(?:metodol[oó]gicas|docentes|pedag[oó]gicas)|Notas\s+del\s+maestro)(?:\s+por\s+actividad)?\s*[:\-–—]\s*/i, "").trim();
  return text;
}

export function cleanResourceSubtopicTitle(raw = "") {
  if (!raw) return "";
  let clean = String(raw).trim();
  clean = clean.replace(/^(?:Ficha(?:\s+de\s+(?:refuerzo|trabajo))?(?:\s+[0-9]+[a-z]?)?|Anexo(?:\s+[0-9]+[a-z]?)?|Recortable(?:\s+[0-9]+[a-z]?)?|Guion(?:\s+de\s+video)?(?:\s+[0-9]+[a-z]?)?)\s*[:\-–—.]\s*/i, "");
  clean = clean.replace(/^(?:Ficha(?:\s+de\s+(?:refuerzo|trabajo))?)\s*[:\-–—.]?\s*/i, "");
  clean = clean.replace(/^Actividad(?:es)?(?:\s*\d+)?\s*[:\-–—.]\s*/i, "");
  clean = clean.replace(/^[0-9]+[a-z]?\s*[:\-–—.]\s*/i, "");
  return clean.trim();
}
