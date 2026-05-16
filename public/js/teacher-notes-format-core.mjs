export const TEACHER_NOTES_FORMATS = Object.freeze({
  DEFAULT: "default",
  INGESTA_NUMBERED_GENERAL: "ingesta_numbered_general"
});

export function normalizeTeacherNotesFormat(format = TEACHER_NOTES_FORMATS.DEFAULT) {
  return format === TEACHER_NOTES_FORMATS.INGESTA_NUMBERED_GENERAL
    ? TEACHER_NOTES_FORMATS.INGESTA_NUMBERED_GENERAL
    : TEACHER_NOTES_FORMATS.DEFAULT;
}

export function getTeacherGeneralHeading(format = TEACHER_NOTES_FORMATS.DEFAULT) {
  return normalizeTeacherNotesFormat(format) === TEACHER_NOTES_FORMATS.INGESTA_NUMBERED_GENERAL
    ? "Actividades generales"
    : "Actividad General";
}

function capitalizeInitial(text = "") {
  const source = String(text || "").trim();
  if (!source) return "";
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function lowercaseInitial(text = "") {
  const source = String(text || "").trim();
  if (!source) return "";
  return source.charAt(0).toLowerCase() + source.slice(1);
}

const TEACHER_IMPERATIVE_START_RE = /^(?:Dirija|Solicite|Pida|Gu[ií]e|Observe|Explique|Modele|Acompa[ñn]e|Facilite|Presente|Revise|Verifique|Anime|Invite|Recupere|Ap[oó]yese|Proyecte|Convierta|Finalice|Cierre|Marque|Lea|Haga|Tome|Use|Abra|Proponga|Transforme|Sit[uú]e|Trabaje|Compruebe)\b/i;

function stripTeacherNarrativePrefix(text = "") {
  return String(text || "")
    .replace(/^\s*\d+\.\s*/i, "")
    .replace(/^(?:En|Para)\s+(?:la\s+)?(?:actividad\s+\d+|actividad\s+[a-záéíóú]+|primera actividad|segunda actividad|tercera actividad|cuarta actividad|quinta actividad|sexta actividad|séptima actividad|septima actividad|octava actividad|novena actividad|d[eé]cima actividad|esta actividad)\s*,?\s*/i, "")
    .trim();
}

function stripTeacherConnectorPrefix(text = "") {
  return String(text || "")
    .replace(/^(?:Además|Ademas|Luego|Entonces|Y)\s*,?\s*/i, "")
    .replace(/^Con\s+[^,]{1,120},\s*/i, "")
    .trim();
}

function startsWithTeacherImperative(text = "") {
  return TEACHER_IMPERATIVE_START_RE.test(String(text || "").trim());
}

function normalizeTeacherImperativeOpening(text = "") {
  let cleaned = capitalizeInitial(stripTeacherConnectorPrefix(stripTeacherNarrativePrefix(text)));
  if (!cleaned) return "";
  if (startsWithTeacherImperative(cleaned)) return cleaned;
  return `Dirija la atención del grupo hacia la consigna y ${lowercaseInitial(cleaned)}`.trim();
}

export function formatTeacherGeneralParagraph({
  index = 0,
  format = TEACHER_NOTES_FORMATS.DEFAULT,
  paragraph = ""
} = {}) {
  const safeFormat = normalizeTeacherNotesFormat(format);
  const source = String(paragraph || "").trim();
  if (!source) return "";
  if (safeFormat !== TEACHER_NOTES_FORMATS.INGESTA_NUMBERED_GENERAL) return source;

  const cleaned = normalizeTeacherImperativeOpening(source);
  return `${Number(index) + 1}. ${cleaned}`.trim();
}

function hasNumberedTeacherParagraph(html = "") {
  return /<p[^>]*>\s*(?:<strong[^>]*>)?\s*\d+\.\s+/i.test(String(html || ""));
}

function hasNumberedTeacherParagraphStartingWithVerb(html = "") {
  const paragraphs = String(html || "").match(/<p[^>]*>\s*(?:<strong[^>]*>)?\s*\d+\.\s+[\s\S]*?<\/p>/gi) || [];
  return paragraphs.some((block) => {
    const plain = String(block || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\d+\.\s*/, "");
    return startsWithTeacherImperative(plain);
  });
}

export function matchesTeacherNotesTemplate(html = "", format = TEACHER_NOTES_FORMATS.DEFAULT) {
  const source = String(html || "");
  const safeFormat = normalizeTeacherNotesFormat(format);
  if (!source.trim()) return false;

  if (safeFormat === TEACHER_NOTES_FORMATS.INGESTA_NUMBERED_GENERAL) {
    return /<h3[^>]*>\s*Actividades generales\s*<\/h3>/i.test(source)
      && hasNumberedTeacherParagraph(source)
      && hasNumberedTeacherParagraphStartingWithVerb(source)
      && /<h3[^>]*>\s*Actividad de ampliación\s*<\/h3>/i.test(source)
      && /<h3[^>]*>\s*Actividad de refuerzo\s*<\/h3>/i.test(source)
      && /<h3[^>]*>\s*Neurolog[ií]a aplicada\s*<\/h3>/i.test(source)
      && /<h3[^>]*>\s*Atenci[oó]n a la diversidad y accesibilidad\s*<\/h3>/i.test(source);
  }

  return /<h3[^>]*>\s*Actividad General\s*<\/h3>/i.test(source)
    && /<h3[^>]*>\s*Actividad de ampliación\s*<\/h3>/i.test(source)
    && /<h3[^>]*>\s*Actividad de refuerzo\s*<\/h3>/i.test(source)
    && /<h3[^>]*>\s*Neurolog[ií]a aplicada\s*<\/h3>/i.test(source)
    && /<h3[^>]*>\s*Atenci[oó]n a la diversidad y accesibilidad\s*<\/h3>/i.test(source);
}
