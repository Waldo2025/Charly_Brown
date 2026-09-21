export function normalizeActivitySubtopicTitle(value = "") {
  const ignored = /^(?:todos?|actividades? generadas?|proyectos? generados?|actividades? aprobadas?|proyectos? aprobados?|m[aá]s f[aá]cil|m[aá]s dif[ií]cil|normal)$/i;
  const parts = String(value || "")
    .split(/\s*(?:·|•|\||\*)\s*/)
    .map((part) => part.trim())
    .filter((part) => part && !ignored.test(part));
  return parts.at(-1) || "";
}
