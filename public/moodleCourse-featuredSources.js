export const FEATURED_SOURCE_MODULE_TYPE = "Fuentes destacadas. Extracción de contenido de fuentes externas";
export const FEATURED_SOURCE_MODULE_TYPE_NORMALIZED = "fuentes_destacadas";

export function normalizarTipoModuloFeaturedSource(tipo = "") {
  const raw = String(tipo || "").trim().toLowerCase();
  if (raw.includes("fuentes destacadas")) return FEATURED_SOURCE_MODULE_TYPE_NORMALIZED;
  if (raw.includes("fuente destacada")) return FEATURED_SOURCE_MODULE_TYPE_NORMALIZED;
  return raw;
}

export function crearContenidoInicialFuentesDestacadas() {
  return `
<h2>Ficha de fuente destacada</h2>
<p>Aquí aparecerá la ficha completa generada a partir del enlace web configurado en Instrucciones IA.</p>
`.trim();
}

export function crearInstruccionesInicialesFuentesDestacadas() {
  return `
Genera una ficha completa de la fuente analizada.
Usa de manera obligatoria el enlace web y la referencia bibliográfica capturados en este módulo.
Enlace web: https://ejemplo.org/articulo
Referencia bibliográfica: Autor, A. (2026). Título. Editorial o revista.
Si no puedes leer el sitio, detén la generación y muestra error.
`.trim();
}

export function crearDefaultsFuentesDestacadas() {
  return {
    tipo: FEATURED_SOURCE_MODULE_TYPE,
    nombre: FEATURED_SOURCE_MODULE_TYPE,
    contenido: crearContenidoInicialFuentesDestacadas(),
    instrucciones: crearInstruccionesInicialesFuentesDestacadas(),
    fuenteDestacadaUrl: "",
    fuenteDestacadaReferencia: ""
  };
}

function stripHtml(value = "") {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extraerCamposFuentesDestacadasDesdeInstrucciones(instrucciones = "") {
  const raw = stripHtml(instrucciones);
  const urlMatch =
    raw.match(/(?:^|\n)\s*enlace\s+web\s*:\s*(https?:\/\/\S+)/i) ||
    raw.match(/(https?:\/\/[^\s<>"')\]]+)/i);
  const url = String(urlMatch?.[1] || urlMatch?.[0] || "").trim().replace(/[.,;)\]]+$/g, "");

  const refLineMatch = raw.match(/(?:^|\n)\s*referencia\s+bibliogr[aá]fica\s*:\s*([^\n]+)/i);
  const referencia = String(refLineMatch?.[1] || "").trim();

  return {
    fuenteDestacadaUrl: url,
    fuenteDestacadaReferencia: referencia
  };
}

export function extraerConsignaFuentesDestacadasDesdeInstrucciones(instrucciones = "") {
  const raw = stripHtml(instrucciones);
  if (!raw) return "";

  const lineas = raw
    .split(/\r?\n/)
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .filter((line) => !/^enlace\s+web\s*:/i.test(line))
    .filter((line) => !/^referencia\s+bibliogr[aá]fica\s*:/i.test(line))
    .filter((line) => !/^https?:\/\//i.test(line))
    .filter((line) => !/^usa de manera obligatoria el enlace web/i.test(line));

  return lineas.join("\n").trim();
}

export function normalizarSalidaFuentesDestacadasMarkdown(texto = "") {
  let raw = String(texto || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return "";

  raw = raw
    .replace(/\s+(#{1,6}\s+)/g, "\n\n$1")
    .replace(/([^\n])\s+(-\s+\*\*|\*\s+\*\*|\*\s+\w)/g, "$1\n$2")
    .replace(/([^\n])\s+(\d+\.\s+)/g, "$1\n$2")
    .replace(/\n\*\s+/g, "\n- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return raw;
}

export function validarFuentesDestacadas(modulo = {}) {
  const tipoNormalizado = normalizarTipoModuloFeaturedSource(modulo?.tipo || "");
  if (tipoNormalizado !== FEATURED_SOURCE_MODULE_TYPE_NORMALIZED) {
    return { ok: false, error: "El módulo no es de tipo Fuentes destacadas." };
  }
  const derivados = extraerCamposFuentesDestacadasDesdeInstrucciones(modulo?.instrucciones || "");
  const url = String(modulo?.fuenteDestacadaUrl || derivados?.fuenteDestacadaUrl || "").trim();
  if (!url) {
    return { ok: false, error: "Falta el enlace web de la fuente destacada." };
  }
  const referencia = String(modulo?.fuenteDestacadaReferencia || derivados?.fuenteDestacadaReferencia || "").trim();
  return {
    ok: true,
    url,
    referencia
  };
}

export function construirPromptFuentesDestacadas({
  nombreModulo = FEATURED_SOURCE_MODULE_TYPE,
  fuenteDestacadaUrl = "",
  fuenteDestacadaReferencia = "",
  extractedText = "",
  extractedTitle = "",
  instruccionesAutor = "",
  contextoCurso = "",
  contextoSubtema = ""
} = {}) {
  return `
Eres un asistente experto en análisis de fuentes académicas y pedagógicas.

Debes trabajar a partir de una fuente web realmente extraída.

REGLAS OBLIGATORIAS:
- Usa exclusivamente la información disponible en el texto extraído.
- No inventes datos no presentes en la fuente.
- Si falta evidencia suficiente, indícalo con cautela dentro del análisis, sin fabricar contenido.
- Si se proporcionó referencia bibliográfica, mantenla exactamente como la proporcionó el autor.
- Si no se proporcionó referencia bibliográfica, no inventes una.
- NO resumas en exceso. Esta respuesta se usará con fines de educación y aprendizaje, así que debe ser específica, útil y basada en detalles reales del sitio.
- Desarrolla el contenido con lenguaje claro, preciso y formativo, explicando ideas, contexto, relaciones y relevancia cuando el texto lo permita.
- Si el autor pide extraer, detallar, desarrollar o cubrir el contenido completo del sitio, prioriza amplitud, profundidad y cobertura temática real del texto extraído.
- Si el autor pide otro formato, otra organización o un nivel distinto de desarrollo, sigue esa instrucción.
- Si el autor pide extraer el sitio completo, NO lo conviertas en un resumen breve: recorre de forma amplia los apartados, ideas, datos, procesos y ejemplos realmente presentes en el texto extraído.
- Evita redacción genérica, frases de relleno o secciones vacías. Nombra hallazgos concretos del sitio cuando existan.

FORMATO DE SALIDA:
- Puedes usar una estructura libre si eso representa mejor el contenido real de la fuente y la intención del autor.
- Si el sitio tiene una organización clara, puedes seguir esa lógica en vez de imponer una plantilla artificial.
- No impongas secciones artificiales si no aportan valor real al análisis.
- Si el autor no pide un formato específico, puedes usar encabezados útiles como resumen, apartados principales, observaciones críticas, valor pedagógico y referencia bibliográfica, pero solo cuando ayuden.
- Si usas markdown, escribe encabezados markdown reales en líneas separadas.
- Si usas listas, escribe listas markdown reales con cada bullet en su propia línea.
- La referencia bibliográfica debe aparecer al final si fue proporcionada.

INSTRUCCIONES ESPECÍFICAS DEL AUTOR:
${String(instruccionesAutor || "").trim() || "[Sin instrucciones adicionales del autor]"}

CONTEXTO DEL CURSO Y DEL SUBTEMA:
${String(contextoCurso || "").trim() || "[Sin contexto adicional del curso]"}

${String(contextoSubtema || "").trim() || "[Sin contexto adicional del subtema]"}

DATOS DE LA FUENTE:
- Nombre del módulo: ${String(nombreModulo || "").trim()}
- Título extraído: ${String(extractedTitle || "").trim()}
- URL: ${String(fuenteDestacadaUrl || "").trim()}
- Referencia bibliográfica: ${String(fuenteDestacadaReferencia || "").trim() || "[No proporcionada]"}

TEXTO EXTRAÍDO DEL SITIO:
================================
${String(extractedText || "").trim()}
================================

Devuelve solo el resultado final en markdown claro y natural.
`.trim();
}

export function construirPromptFuentesDestacadasDesdeUrl({
  nombreModulo = FEATURED_SOURCE_MODULE_TYPE,
  fuenteDestacadaUrl = "",
  fuenteDestacadaReferencia = ""
} = {}) {
  return `
Eres un asistente experto en análisis de fuentes académicas y pedagógicas.

Debes analizar la URL proporcionada usando la herramienta oficial URL Context de Gemini y generar una ficha completa.

REGLAS OBLIGATORIAS:
- Usa exclusivamente la información recuperada desde la URL proporcionada.
- No inventes datos no presentes en la fuente.
- Si la URL no puede recuperarse, responde con un fallo explícito en lugar de inventar contenido.
- Si se proporcionó referencia bibliográfica, mantenla exactamente como la proporcionó el autor.
- Si no se proporcionó referencia bibliográfica, no inventes una.

ESTRUCTURA OBLIGATORIA:
## Resumen ejecutivo
## Puntos clave
## Análisis crítico
## Confiabilidad y sesgos
## Citas o fragmentos relevantes
## Aplicación pedagógica
## Referencia bibliográfica

DATOS DE LA FUENTE:
- Nombre del módulo: ${String(nombreModulo || "").trim()}
- URL: ${String(fuenteDestacadaUrl || "").trim()}
- Referencia bibliográfica: ${String(fuenteDestacadaReferencia || "").trim() || "[No proporcionada]"}

Analiza la URL anterior y devuelve solo la ficha final en markdown estructurado.
`.trim();
}
