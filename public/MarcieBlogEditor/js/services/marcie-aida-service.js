import {
  applyVerifiedAttributions,
  articleContentHash,
  generateGroundedJson,
  refineBlogTopicWithGemini,
  researchArticleEvidence,
  sanitizeTrustedSources,
  verifyArticleEvidence
} from "./marcie-gemini-service.js?v=20260908r9";

export const AIDA_SERVICE_VERSION = "2.0";
export const AIDA_LEGACY_BRAND_LINE = "Aprender no es esforzarse más. Es aprender como el cerebro estaba hecho para aprender.";
export const AIDA_DEFAULT_BRAND_LINE = "";
export const AIDA_PHASES = Object.freeze(["headline", "problem", "deepen", "agitate", "turn", "why", "change", "close"]);

const AIDA_BLOCK_PHASES = AIDA_PHASES.filter((phase) => phase !== "headline");
const AUDIENCE_LABELS = {
  parents: "madres, padres y tutores",
  educators: "docentes",
  students: "estudiantes",
  coordinators: "coordinadores y líderes académicos"
};

function audienceLabel(audience = "parents") {
  return AUDIENCE_LABELS[audience] || audience;
}

function audienceEditorialDirection(audience = "parents") {
  if (audience === "coordinators") {
    return `Escribe para coordinadores académicos, directores, subdirectores, jefes de estudio y líderes pedagógicos. Usa lenguaje científico y neuropedagógico profesional, con alta precisión conceptual. Integra el vocabulario editorial configurado sólo cuando el dossier lo respalde y sea pertinente. Traduce cada concepto en acompañamiento docente, observación de aula, alineación curricular, inclusión, clima escolar e indicadores observables. Define brevemente los términos especializados en su primera aparición, evita jerga ornamental y neuromitos, y queda prohibido dirigirse a padres, hablar de "tus hijos" o plantear rutinas del hogar.`;
  }
  if (audience === "parents") return `Escribe para madres, padres y tutores desde situaciones del hogar, con un tono cálido y orientador.`;
  if (audience === "students") return `Escribe directamente para estudiantes, con claridad, respeto, autonomía y estrategias aplicables a su aprendizaje.`;
  return `Escribe para docentes desde la práctica de aula, las decisiones didácticas y su desarrollo profesional. Usa una densidad científica moderada y rigurosa. Integra el vocabulario editorial configurado sólo cuando el dossier lo respalde y sea pertinente; define cada término especializado al introducirlo y vincúlalo con una decisión pedagógica concreta. Evita jerga ornamental y neuromitos.`;
}

function uniqueInstitutions(sources = []) {
  return new Set(sources.map((source) => String(source?.publisher || source?.domain || "").trim().toLowerCase()).filter(Boolean));
}

function currentVerifiedSources(sources = []) {
  return sanitizeTrustedSources(sources).filter((source) => source.verificationStatus === "verified" && source.evidenceRole !== "historical");
}

async function hasCurrentEvidenceVerification(article = {}) {
  const storedHash = String(article?.verification?.contentHash || "").trim();
  if (!storedHash || !article?.verification?.verifiedAt) return false;
  return storedHash === await articleContentHash(article);
}

function dossierForPrompt(dossier = {}) {
  return {
    summary: dossier.summary || "",
    facts: dossier.facts || [],
    currentSignals: dossier.currentSignals || [],
    historicalMilestones: dossier.historicalMilestones || [],
    attributedReferences: dossier.attributedReferences || [],
    sources: dossier.sources || [],
    researchPeriod: dossier.researchPeriod || "",
    dateWindow: dossier.dateWindow || null,
    currentSourceCount: dossier.currentSourceCount || 0,
    historicalSourceCount: dossier.historicalSourceCount || 0,
    verificationStatus: dossier.verificationStatus || "blocked",
    blockers: dossier.blockers || []
  };
}

export function getAidaCompatibility(article = {}) {
  const hasContent = Boolean(String(article?.title || "").trim()) && Array.isArray(article?.blocks) && article.blocks.length > 0;
  if (!hasContent) return { status: "empty", compatible: true, missingPhases: [] };
  const declaredMode = String(article.editorialMode || "").toLowerCase();
  const declaredPhases = Array.isArray(article.aida?.phases) ? article.aida.phases.map(String) : [];
  const orderedBlockPhases = (article.blocks || []).map((block) => String(block?.phase || "")).filter((phase) => AIDA_PHASES.includes(phase));
  const blockPhases = new Set(orderedBlockPhases);
  const missingPhases = AIDA_BLOCK_PHASES.filter((phase) => !blockPhases.has(phase));
  let previousIndex = -1;
  const phaseOrderValid = AIDA_BLOCK_PHASES.every((phase) => {
    const index = orderedBlockPhases.indexOf(phase);
    if (index <= previousIndex) return false;
    previousIndex = index;
    return true;
  });
  const compatible = declaredMode === "aida"
    && AIDA_PHASES.every((phase) => declaredPhases.includes(phase))
    && missingPhases.length === 0
    && phaseOrderValid;
  return { status: compatible ? "compatible" : "legacy_incompatible", compatible, missingPhases, phaseOrderValid };
}

export async function refineAidaTopicWithGemini({ topic = "", specifications = [], audience = "educators" } = {}) {
  return refineBlogTopicWithGemini({ topic, specifications, audience });
}

export async function researchAidaTopicWithGemini({
  searchPlatforms,
  researchInstructions = [],
  topic = "",
  audience = "parents",
  region = "MX",
  period = "6m",
  minimumSources = 8
} = {}) {
  const dossier = await researchArticleEvidence({
    searchPlatforms,
    researchInstructions,
    topic,
    audience,
    mode: "aida",
    minimumSources: globalThis.MarcieResearchPolicy.target({ editorialMode: "aida", editorialProfileSnapshot: { minimumSources } }),
    region,
    period
  });
  return {
    ...dossier,
    topic: dossier.topic || topic,
    trendScore: null,
    growth: null,
    freshness: null,
    sourceDiversity: `${dossier.institutionCount || 0} publicaciones o instituciones verificadas`,
    signals: Array.isArray(dossier.signals) ? dossier.signals : [],
    editorialMode: "aida",
    modeUsed: "aida",
    serviceVersion: AIDA_SERVICE_VERSION,
    resultType: "aida_research_dossier"
  };
}

export async function generateAidaProposalsWithGemini({ session = {}, topic = "", signals = [], dossier = null } = {}) {
  const audiences = Array.isArray(session.selectedAudiences) && session.selectedAudiences.length
    ? [...new Set(session.selectedAudiences.map(String))]
    : ["parents", "educators"];
  const evidence = dossier || session.trends?.[0] || {};
  const sources = sanitizeTrustedSources(evidence.sources || []);
  const prompt = `
Eres la editora Aida. Crea exactamente una propuesta editorial en español para cada público solicitado.
Tema: ${topic}
Públicos: ${audiences.map((audience) => `${audience} (${audienceLabel(audience)})`).join(", ")}
Señales actuales verificadas: ${JSON.stringify(signals)}
Dossier integral del tema, con evidencia y antecedentes: ${JSON.stringify(dossierForPrompt(evidence)).slice(0, 18000)}

Reglas estrictas Aida:
- Cada propuesta parte de una escena o problema reconocible, no de una pregunta PNL obligatoria.
- Define una sola idea central sobre el tema y una sola analogía dominante.
- Usa hechos científicos como respaldo cuando sean pertinentes, sin desplazar el tema principal.
- Incluye ángulo histórico únicamente si el dossier contiene hitos respaldados.
- Asocia solo IDs de fuentes presentes en el dossier. No inventes datos, años, personas ni fuentes.
- No incluyas CTA comercial.
- Diferencia de forma inequívoca cada público. Instrucciones editoriales por audiencia:
${audiences.map((audience) => `  - ${audience}: ${audienceEditorialDirection(audience)}`).join("\n")}
- Concisión estricta en cada propuesta: brief (máximo 2 a 3 oraciones), scene (1 oración), problem (1 oración), centralIdea (1 oración), dominantAnalogy (1 frase). No redactes el artículo completo dentro de las propuestas.

Devuelve SOLO JSON válido:
{"proposals":[{"id":"aida-parents","audience":"parents","audienceLabel":"Padres y tutores","title":"","scene":"","problem":"","centralIdea":"","dominantAnalogy":"","historicalAngle":"","sourceIds":["source-1"],"angle":"","brief":"","estimatedReadTimeMinutes":8,"editorialMode":"aida"}]}`.trim();
  const { parsed } = await generateGroundedJson({ prompt, urls: sources.map((source) => source.url) });
  const generated = Array.isArray(parsed?.proposals) ? parsed.proposals : [];
  const sourceIds = new Set(sources.map((source) => String(source.id)));
  const proposals = audiences.map((audience) => {
    const candidate = generated.find((item) => String(item?.audience || "").toLowerCase() === String(audience).toLowerCase()) || {};
    const centralIdea = String(candidate.centralIdea || candidate.angle || `Explicar con evidencia verificable cómo ${topic} se relaciona con la experiencia de ${audienceLabel(audience)}.`).trim();
    const scene = String(candidate.scene || candidate.problem || `Una situación cotidiana de ${audienceLabel(audience)} relacionada con ${topic}.`).trim();
    const dominantAnalogy = String(candidate.dominantAnalogy || "Una analogía visual única que haga comprensible la idea central.").trim();
    return {
      ...candidate,
      id: String(candidate.id || `aida-${audience}`),
      audience,
      audienceLabel: audienceLabel(audience),
      title: String(candidate.title || topic).trim(),
      scene,
      problem: String(candidate.problem || scene).trim(),
      centralIdea,
      dominantAnalogy,
      historicalAngle: evidence.historicalMilestones?.length ? String(candidate.historicalAngle || "").trim() : "",
      sourceIds: [...new Set((candidate.sourceIds || []).map(String).filter((id) => sourceIds.has(id)))],
      angle: String(candidate.angle || centralIdea).trim(),
      brief: String(candidate.brief || `${scene}\nIdea central: ${centralIdea}\nAnalogía dominante: ${dominantAnalogy}`).trim(),
      estimatedReadTimeMinutes: Number(candidate.estimatedReadTimeMinutes || 8),
      editorialMode: "aida",
      aida: true
    };
  });
  return { proposals, editorialMode: "aida", serviceVersion: AIDA_SERVICE_VERSION };
}

export async function draftAidaArticleWithGemini({
  title = "",
  topic = "",
  audience = "parents",
  brief = "",
  brandLine = "",
  customRules = {},
  researchDossier = null,
  region = "MX",
  period = "6m"
} = {}) {
  const centralTopic = String(topic || title || "Neuroeducación").trim();
  const minimumSources = globalThis.MarcieResearchPolicy.target({ editorialMode: "aida", editorialProfileSnapshot: customRules });
  const dossier = researchDossier || await researchAidaTopicWithGemini({
        topic: centralTopic,
        audience,
        region,
        period,
        minimumSources
      });
  globalThis.MarcieResearchPolicy.assertReady(dossier, minimumSources);
  const sources = sanitizeTrustedSources(dossier.sources);
  const prompt = `
Redacta un artículo educativo, riguroso y documentado en español para ${audienceLabel(audience)}.
Tema: ${centralTopic}
Título provisional: ${title || centralTopic}
Brief: ${brief || "Sin indicaciones adicionales"}
Contrato específico de audiencia: ${audienceEditorialDirection(audience)}

Aplica estrictamente la guía editorial Aida:
1. Titular que nombre un dolor o situación concreta.
2. Gancho mediante una escena reconocible; no empieces obligatoriamente con una pregunta.
3. Profundización que demuestre comprensión del caso.
4. Agitación moderada: muestra el costo sin dramatizar.
5. Giro breve que cierre el dolor y abra la explicación.
6. Explicación accesible y precisa, con una idea central y una analogía dominante. Incorpora hechos científicos relacionados cuando el dossier demuestre que son pertinentes.
7. Transformación concreta y observable.
8. Cierre memorable, específico para este artículo y sin CTA comercial.${brandLine ? " Termina exactamente con la frase de marca configurada." : " No repitas una firma, eslogan o frase fija usada en otros artículos."}

Desarrolla el tema completo usando únicamente datos del dossier. Los hechos científicos y la historia enriquecen el argumento: no sustituyen el tema principal. Integra 2 a 4 hitos como antes → avance intermedio → conocimiento vigente solo si ayudan a explicar el hecho o tema y están respaldados. No inventes testimonios, fechas, científicos, estudios ni descubrimientos.
Integra entre 2 y 3 referencias atribuidas verificadas del campo attributedReferences cuando existan. Combina citas textuales breves y paráfrasis naturales del tipo "Según X". Una cita directa debe reproducir exactamente el texto verificado y cada bloque factual debe declarar sourceIds con IDs del dossier. Si no hay una frase directa verificada, usa una paráfrasis; nunca inventes una cita.
Respeta la ventana de actualidad del dossier: las fuentes current solo pueden describirse como noticias, señales o datos actuales si están dentro de dateWindow. Las fuentes historical sirven únicamente como antecedentes explícitos y deben presentarse con su fecha real; nunca las redactes como si fueran del periodo actual.
Si el brief contiene un hallazgo factual sin respaldo, elimínalo o reescríbelo sin convertirlo en otro dato factual. No repitas ni parafrasees una afirmación marcada como no respaldada. La fase de explicación no obliga a incluir neurociencia cuando el dossier no contiene evidencia neurocientífica pertinente.

${brandLine ? `Frase de marca configurada: ${brandLine}` : "No hay frase de marca configurada; crea un cierre original y pertinente al argumento."}
Reglas adicionales permitidas: ${JSON.stringify(customRules)}
Marca las citas en línea como [sourceId], usando el ID exacto del documento del dossier. La interfaz mostrará autor o autores y año. No inventes etiquetas reference-N, números ni documentos. Cuando solo conozcas a un autor por otro documento, indica la cita secundaria (como se citó en) y referencia el documento realmente consultado.
Dossier completo analizado: ${JSON.stringify(dossierForPrompt(dossier))}

Devuelve SOLO JSON válido:
{"schemaVersion":"1.0","title":"titular","subtitle":"promesa clara","excerpt":"resumen","audience":"${audience}","category":"Neuroeducación","readingTimeMinutes":8,"publishedDateText":"fecha actual en español","tags":["Neuroeducación"],"blocks":[{"id":"aida-problem","type":"paragraph","phase":"problem","text":"escena"},{"id":"aida-deepen","type":"paragraph","phase":"deepen","text":"profundización"},{"id":"aida-agitate","type":"paragraph","phase":"agitate","text":"costo"},{"id":"aida-turn","type":"paragraph","phase":"turn","text":"giro"},{"id":"aida-why","type":"paragraph","phase":"why","text":"explicación científica"},{"id":"aida-change","type":"paragraph","phase":"change","text":"transformación"},{"id":"aida-close","type":"paragraph","phase":"close","text":"cierre y frase de marca"}],"seo":{"title":"título SEO","description":"máximo 155 caracteres","keywords":["palabra clave"],"slug":"slug"}}`.trim();
  const { parsed } = await generateGroundedJson({ prompt, useResearchTools: false });
  const article = applyVerifiedAttributions({
    ...parsed,
    schemaVersion: "1.0",
    audience,
    editorialMode: "aida",
    modeCompatibility: "compatible",
    researchPeriod: dossier.researchPeriod || period,
    dateWindow: dossier.dateWindow || null,
    sources,
    researchSources: sources,
    usedSources: [...sources],
    usedSourceIds: sources.map(source => source.id),
    sourceCitationStyle: "apa",
    researchDossier: {
      searchPlatforms: dossier.searchPlatforms,
      analysisStatus: dossier.analysisStatus,
      analysis: dossier.analysis,
      platformResults: dossier.platformResults,
      researchRegion: dossier.researchRegion,
      researchInstructions: dossier.researchInstructions,
      researchPolicyVersion: dossier.researchPolicyVersion,
      targetSourceCount: dossier.targetSourceCount,
      verificationStatus: dossier.verificationStatus,
      summary: dossier.summary || "",
      facts: dossier.facts || [],
      currentSignals: dossier.currentSignals || [],
      historicalMilestones: dossier.historicalMilestones || [],
      attributedReferences: dossier.attributedReferences || [],
      researchPeriod: dossier.researchPeriod || "",
      dateWindow: dossier.dateWindow || null,
      currentSourceCount: dossier.currentSourceCount || 0,
      historicalSourceCount: dossier.historicalSourceCount || 0,
      verifiedSourceCount: dossier.verifiedSourceCount || sources.length,
      institutionCount: dossier.institutionCount || uniqueInstitutions(sources).size,
      researchedAt: dossier.researchedAt
    },
    aida: { brandLine, phases: [...AIDA_PHASES], serviceVersion: AIDA_SERVICE_VERSION },
    generationTelemetry: {
      modeUsed: "aida",
      serviceVersion: AIDA_SERVICE_VERSION,
      retrievedUrls: sources.map((source) => source.url),
      verifiedSourceCount: dossier.verifiedSourceCount || sources.length,
      institutionCount: dossier.institutionCount || uniqueInstitutions(sources).size
    }
  }, dossier);
  const verified = {
    ...article,
    verification: { status: "pending", coverage: 0, blockers: [], contradictions: [], verifiedAt: "" }
  };
  const verifiedSources = sanitizeTrustedSources(verified.researchSources || verified.sources || []);
  const densityBlockers = [];
  if (!verifiedSources.length) densityBlockers.push("La investigación no contiene ninguna fuente verificable.");
  const compatibility = getAidaCompatibility(verified);
  if (!compatibility.compatible) densityBlockers.push(`La estructura Aida está incompleta: ${compatibility.missingPhases.join(", ") || "faltan fases declaradas"}.`);
  return {
    ...verified,
    editorialMode: "aida",
    modeCompatibility: compatibility.status,
    aida: { ...(verified.aida || article.aida), complianceStatus: densityBlockers.length ? "blocked" : "pending" },
    verification: {
      ...(verified.verification || {}),
      status: "pending",
      blockers: [...new Set([...(verified.verification?.blockers || []), ...densityBlockers])]
    }
  };
}

export async function reviewAidaArticleWithGemini({ article = {}, brandLine = "" } = {}) {
  const articleWithMode = { ...article, editorialMode: "aida" };
  const verifiedArticle = await hasCurrentEvidenceVerification(articleWithMode)
    ? articleWithMode
    : await verifyArticleEvidence({ article: articleWithMode, topic: article.title || "", additionalSearches: 0 });
  const compatibility = getAidaCompatibility(verifiedArticle);
  const sources = sanitizeTrustedSources(verifiedArticle.researchSources || verifiedArticle.sources || []);
  const currentSources = currentVerifiedSources(sources);
  const prompt = `
Audita este artículo con la guía editorial Aida. No uses criterios PNL de Marcie y no exijas que empiece con una pregunta.
Comprueba: ocho fases en orden, escena inicial, agitación moderada, una idea central fiel al tema, una analogía dominante, precisión accesible, hechos científicos pertinentes respaldados, cronología solo cuando aporte y esté respaldada, ausencia de CTA comercial y un cierre original no repetitivo.${brandLine ? " También debe terminar exactamente con la frase de marca configurada." : " No exijas ninguna frase de marca."}
${brandLine ? `Frase de marca obligatoria: ${brandLine}` : "Frase de marca: no configurada."}
Artículo: ${JSON.stringify({ title: verifiedArticle.title, blocks: verifiedArticle.blocks, aida: verifiedArticle.aida }).slice(0, 18000)}
Estado factual: ${JSON.stringify(verifiedArticle.verification || {})}
Fuentes actuales verificadas: ${currentSources.length}; instituciones actuales: ${uniqueInstitutions(currentSources).size}. Antecedentes históricos separados: ${sources.length - currentSources.length}.
Devuelve SOLO JSON: {"readabilityScore":90,"summary":"","issues":[{"id":"aida-1","type":"aida_structure|science|history|brand|cta|facts","message":"","suggestion":""}],"seoRecommendations":[],"aidaCompliance":{"status":"verified|blocked","phasesComplete":true,"sceneOpening":true,"singleCentralIdea":true,"singleDominantAnalogy":true,"commercialCtaAbsent":true,"brandLineExact":true}}`.trim();
  const { parsed } = await generateGroundedJson({ prompt, urls: sources.map((source) => source.url) });
  const factualBlockers = Array.isArray(verifiedArticle.verification?.blockers) ? verifiedArticle.verification.blockers : [];
  const structuralIssues = [];
  if (!compatibility.compatible) structuralIssues.push({ id: "aida-structure", type: "aida_structure", message: `La estructura Aida está incompleta o fuera de orden: ${compatibility.missingPhases.join(", ") || "revisa la secuencia de fases"}.`, suggestion: "Regenera o corrige el artículo con el motor Aida." });
  if (!sources.length) structuralIssues.push({ id: "aida-sources", type: "facts", message: "El artículo no contiene fuentes verificables.", suggestion: "Reintenta la investigación antes de aprobar el artículo." });
  const closingText = String((verifiedArticle.blocks || []).findLast?.((block) => block?.phase === "close")?.text || "").trim();
  if (brandLine && !closingText.endsWith(brandLine)) structuralIssues.push({ id: "aida-brand", type: "brand", message: "El cierre no termina exactamente con la frase de marca Aida.", suggestion: "Conserva la frase de marca como última oración del artículo." });
  if (/\b(?:compra|contrata|suscr[ií]bete|inscr[ií]bete|agenda (?:una )?(?:llamada|asesor[ií]a)|cont[aá]ctanos|adquiere)\b/i.test(closingText)) structuralIssues.push({ id: "aida-commercial-cta", type: "cta", message: "El cierre contiene un llamado comercial no permitido en Aida.", suggestion: "Sustituye el CTA por un cierre reflexivo y la frase de marca." });
  const issues = [...(Array.isArray(parsed?.issues) ? parsed.issues : []), ...structuralIssues];
  const compliance = {
    ...(parsed?.aidaCompliance || {}),
    status: issues.length || factualBlockers.length || verifiedArticle.verification?.status !== "verified" ? "blocked" : "verified",
    verifiedSourceCount: currentSources.length,
    institutionCount: uniqueInstitutions(currentSources).size,
    checkedAt: new Date().toISOString()
  };
  verifiedArticle.aidaCompliance = compliance;
  verifiedArticle.modeCompatibility = compatibility.status;
  return {
    ...parsed,
    editorialMode: "aida",
    serviceVersion: AIDA_SERVICE_VERSION,
    issues,
    aidaCompliance: compliance,
    verifiedArticle
  };
}
