import { generateWithGemini } from "/charly-brown/gemini-client.js?v=20260923r4";

const BLOCK_SCHEMA = {
  type: "OBJECT", required: ["blocks"], properties: {
    blocks: { type: "ARRAY", items: { type: "OBJECT", required: ["section", "text", "sourceIds"], properties: {
      section: { type: "STRING" }, type: { type: "STRING", enum: ["paragraph", "quote", "bulletList"] },
      text: { type: "STRING" }, sourceIds: { type: "ARRAY", items: { type: "STRING" } },
      locator: { type: "STRING" }, attribution: { type: "STRING" }
    } } }
  }
};

function compactDossier(dossier = {}) {
  const currentYear = new Date().getUTCFullYear();
  const recentThresholdYear = currentYear - 5;
  const sources = (dossier.sources || []).map((source) => ({
    id: source.id, title: source.title, authors: source.authors, year: source.year,
    supportSummary: String(source.supportSummary || "").slice(0, 400), locator: source.locator,
    sourceType: source.sourceType
  }));
  sources.sort((a, b) => {
    const yA = Number(String(a.year || "").match(/\b(?:18|19|20)\d{2}\b/)?.[0] || 0);
    const yB = Number(String(b.year || "").match(/\b(?:18|19|20)\d{2}\b/)?.[0] || 0);
    const recA = yA >= recentThresholdYear ? 1 : (yA > 0 ? 0 : -1);
    const recB = yB >= recentThresholdYear ? 1 : (yB > 0 ? 0 : -1);
    if (recA !== recB) return recB - recA;
    return yB - yA;
  });
  return {
    sources,
    facts: (dossier.facts || []).slice(0, 24).map((fact) => ({
      claim: String(fact.claim || fact.text || "").slice(0, 450), sourceIds: fact.sourceIds, locator: fact.locator,
      evidenceKind: fact.evidenceKind
    }))
  };
}

function requestedWordRange(brief = "") {
  const match = String(brief).match(/\b(\d{3,4})\s*(?:a|y|hasta|[-–—])\s*(\d{3,4})\s+palabras\b/i);
  if (!match) return null;
  const minimum = Number(match[1]);
  const maximum = Number(match[2]);
  return minimum > 0 && maximum >= minimum ? { minimum, maximum } : null;
}

function wordCount(value = "") {
  return String(value).trim().split(/\s+/).filter(Boolean).length;
}

async function structuredRequest({ model, prompt, schema, maxOutputTokens = 3000, signal = null }) {
  const raw = await generateWithGemini({
    model, prompt, fallback: false, thinkingLevel: "LOW", signal,
    payload: {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: schema, maxOutputTokens }
    }
  });
  try { return JSON.parse(String(raw || "").trim()); }
  catch (error) {
    const invalid = new Error("Gemini devolvió un grupo JSON incompleto; se reintentará solo ese grupo.");
    invalid.code = "marcie_chunk_invalid_json";
    invalid.cause = error;
    throw invalid;
  }
}

export async function generateArticleInChunks({ model, title, topic, audience, brief, dossier, mode = "marcie", checkpoint = null, onChunk = null, brandLine = "", editorialPolicy = "", signal = null } = {}) {
  const sourceIds = new Set((dossier.sources || []).map((source) => String(source.id)));
  const provisionalDraft = dossier.provisionalDraft === true;
  const evidence = compactDossier(dossier);
  const fingerprint = JSON.stringify({ mode, title, topic, audience, brief, sourceIds: [...sourceIds].sort(), brandLine, editorialPolicy, provisionalDraft });
  const resume = checkpoint?.fingerprint === fingerprint ? checkpoint : null;
  const aida = mode === "aida";
  const wordRange = !aida ? requestedWordRange(brief) : null;
  const fixedPhases = ["problem", "deepen", "agitate", "turn", "why", "change", "close"];
  let outline = resume?.outline;
  if (!outline) {
    if (aida) {
      outline = { title, subtitle: "", excerpt: "", tags: ["Neuroeducación"], sections: fixedPhases.map((phase) => ({ key: phase, heading: phase, purpose: phase })) };
    } else {
      const schema = { type: "OBJECT", required: ["subtitle", "excerpt", "sections"], properties: {
        subtitle: { type: "STRING" }, excerpt: { type: "STRING" },
        sections: { type: "ARRAY", items: { type: "OBJECT", required: ["heading", "purpose"], properties: {
          heading: { type: "STRING" }, purpose: { type: "STRING" }
        } } }
      } };
      outline = await structuredRequest({ model, maxOutputTokens: 1400, schema, signal,
        prompt: `Planifica un artículo educativo en español neutro latinoamericano. Tema: ${topic}. Título: ${title}. Público: ${audience}. Indicaciones: ${brief}. ${wordRange?.minimum >= 1000 ? "Crea exactamente 5 secciones sustantivas para poder cumplir la extensión solicitada." : "Crea entre 3 y 5 secciones pertinentes, sin estructura fija,"} cada una con heading y purpose. El heading es un rótulo breve de 2 a 12 palabras, sin párrafos, citas ni explicación; el desarrollo corresponde exclusivamente al cuerpo. Devuelve solo subtítulo, extracto y secciones. Evidencia disponible: ${JSON.stringify(evidence)}` });
      if (!Array.isArray(outline.sections) || outline.sections.length < (wordRange?.minimum >= 1000 ? 5 : 3) || outline.sections.length > 5 || outline.sections.some((section) => !String(section.heading || "").trim())) throw new Error("El esquema editorial quedó incompleto.");
      outline.sections = outline.sections.map((section, index) => ({ ...section, key: `section-${index + 1}` }));
    }
  }
  const groups = [];
  for (let index = 0; index < outline.sections.length; index += 2) groups.push(outline.sections.slice(index, index + 2));
  const completed = { ...(resume?.completed || {}) };
  const minimumSectionWords = wordRange ? Math.ceil(wordRange.minimum / outline.sections.length) : 0;
  if (!resume && onChunk) await onChunk({ fingerprint, outline, completed: {}, totalGroups: groups.length, completedGroups: 0 });
  for (let index = 0; index < groups.length; index += 1) {
    if (Array.isArray(completed[index]) && completed[index].length) continue;
    const sections = groups[index];
    const prompt = `Redacta SOLO estas secciones de un artículo educativo en español neutro latinoamericano. Tema: ${topic}. Título: ${title}. Público: ${audience}. Indicaciones: ${brief}. Política editorial: ${editorialPolicy}. ${aida ? "Respeta la progresión Aida: escena, comprensión, costo sin dramatizar, giro, explicación respaldada, cambio concreto y cierre memorable. Devuelve exactamente un bloque por fase, de 90 a 180 palabras." : wordRange ? `El artículo completo debe tener entre ${wordRange.minimum} y ${wordRange.maximum} palabras. Desarrolla cada sección con al menos ${minimumSectionWords} palabras de cuerpo, repartidas en varios párrafos con ejemplos pertinentes; no cuentes el título ni las referencias.` : "Elige ejemplos pertinentes y redacción original. Redacta entre 180 y 260 palabras por sección."} ${provisionalDraft ? "BORRADOR PARA REVISIÓN: la búsqueda no reunió el mínimo de documentos. Usa tu conocimiento general para redactar orientaciones y explicaciones prudentes; evita cifras, fechas, afirmaciones técnicas específicas o atribuciones que no estén respaldadas en el dossier. Una obra que recuerdes no es una fuente verificada: no la cites ni inventes su URL. Deja sourceIds [] cuando no haya respaldo documental y conserva las citas únicamente para las fuentes verificadas." : "No inventes hechos, autores ni referencias."} Usa [sourceId] exactos y sourceIds solo del dossier. Prioriza el uso y citación de las fuentes científicas más recientes del dossier (publicadas en los últimos 5 años), a menos que la información científica o teoría fundacional no haya cambiado desde el hallazgo original o artículo seminal. Evita citar fuentes sin fecha si hay estudios fechados disponibles. Los videos solo respaldan ideas atribuidas explícitamente a su autor y requieren locator. No incluyas bibliografía en el texto. Escribe los signos de puntuación pegados a la palabra o a la cita anterior, nunca con un espacio antes del punto, la coma o el punto y coma. Secciones solicitadas: ${JSON.stringify(sections)}. Produce al menos un párrafo sustantivo por sección y usa el campo section con su key exacta. Todo desarrollo narrativo debe ser type "paragraph"; usa "quote" únicamente para citas textuales. No generes bloques heading ni repitas los títulos de sección: el editor los insertará por separado. ${brandLine && sections.some((section) => section.key === "close") ? `Termina el cierre exactamente con: ${brandLine}.` : ""} Dossier verificado: ${JSON.stringify(evidence)}`;
    let parsed;
    let longestValid = null;
    for (let attempt = 0; attempt < (wordRange ? 3 : 2); attempt += 1) {
      const lengthFeedback = attempt && longestValid ? ` La versión anterior sumó ${longestValid.wordCount} palabras en estas ${sections.length} secciones; amplía cada sección hasta el mínimo indicado con contenido útil y respaldado. Devuelve todas las secciones completas, no una continuación.` : "";
      try { parsed = await structuredRequest({ model, prompt: prompt + lengthFeedback, schema: BLOCK_SCHEMA, maxOutputTokens: wordRange ? 5000 : 3600, signal }); }
      catch (error) {
        if (attempt === (wordRange ? 2 : 1) || !["marcie_chunk_invalid_json", "gemini_incomplete_response"].includes(error.code)) {
          if (longestValid) { parsed = longestValid.parsed; break; }
          throw error;
        }
        continue;
      }
      const blocks = Array.isArray(parsed?.blocks) ? parsed.blocks.map((block) => provisionalDraft ? {
        ...block,
        text: String(block.text || "").replace(/\[([^\]\n]{1,160})\]/g, (marker, ids) => ids.split(/[,;]/).map((id) => id.trim()).every((id) => sourceIds.has(id)) ? marker : ""),
        sourceIds: (Array.isArray(block.sourceIds) ? block.sourceIds : []).map(String).filter((id) => sourceIds.has(id))
      } : block) : [];
      if (parsed) parsed.blocks = blocks;
      const sectionKeys = new Set(sections.map((section) => section.key));
      if (blocks.length && sections.every((section) => blocks.some((block) => block.section === section.key && String(block.text || "").trim()))
        && (!aida || sections.every((section) => blocks.filter((block) => block.section === section.key).length === 1))
        && blocks.every((block) => sectionKeys.has(block.section) && String(block.text || "").trim() && Array.isArray(block.sourceIds) && block.sourceIds.every((id) => sourceIds.has(String(id))))) {
        const count = blocks.reduce((total, block) => total + wordCount(block.text), 0);
        if (!longestValid || count > longestValid.wordCount) longestValid = { parsed, wordCount: count };
        if (!wordRange || count >= minimumSectionWords * sections.length) break;
      }
      parsed = null;
    }
    if (!parsed && longestValid) parsed = longestValid.parsed;
    if (!parsed) throw new Error(`Marcie no completó el grupo editorial ${index + 1}/${groups.length}.`);
    const blocks = parsed.blocks.map((block, blockIndex) => {
      const sectionIndex = outline.sections.findIndex((section) => section.key === block.section);
      return { id: aida ? `aida-${block.section}` : `b${sectionIndex + 1}-${blockIndex + 1}`, type: ["quote", "bulletList"].includes(block.type) ? block.type : "paragraph", text: String(block.text).trim(), sourceIds: block.sourceIds.map(String), locator: block.locator || "", attribution: block.attribution || "", ...(aida ? { phase: block.section } : {}) };
    });
    completed[index] = blocks;
    if (onChunk) await onChunk({ fingerprint, outline, completed: { ...completed }, totalGroups: groups.length, completedGroups: Object.keys(completed).length });
  }
  const written = groups.flatMap((_group, index) => completed[index] || []).map(block => {
    // Also repair body headings in previously completed checkpoints without
    // regenerating their text or changing their citation/source metadata.
    const normalized = { ...block, type: ["quote", "bulletList"].includes(block.type) ? block.type : "paragraph" };
    delete normalized.level;
    return normalized;
  });
  const blocks = aida ? fixedPhases.map((phase) => written.find((block) => block.phase === phase)) : outline.sections.flatMap((section, index) => [
    { id: `h${index + 1}`, text: section.heading, sourceIds: [],
      ...(wordCount(section.heading) > 20 || /[\r\n]|\[[^\]]+\]/.test(section.heading)
        ? { type: "paragraph" } : { type: "heading", level: "h2" }) },
    ...written.filter((block) => block.id.startsWith(`b${index + 1}-`))
  ]);
  if (!blocks.length || blocks.some((block) => !block) || groups.some((_group, index) => !completed[index]?.length)) throw new Error("El artículo no está completo.");
  return {
    schemaVersion: "1.0", title, subtitle: outline.subtitle || "", excerpt: outline.excerpt || "",
    audience, readingTimeMinutes: Math.max(1, Math.round(blocks.map((block) => block.text).join(" ").split(/\s+/).length / 180)),
    tags: outline.tags || [], blocks,
    seo: { title, description: outline.excerpt || outline.subtitle || "", keywords: [], slug: String(title || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }
  };
}
