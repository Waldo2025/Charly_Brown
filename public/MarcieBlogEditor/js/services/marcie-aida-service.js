import {
  applyVerifiedAttributions,
  articleContentHash,
  generateGroundedJson,
  LATAM_ARTICLE_LANGUAGE_POLICY,
  refineBlogTopicWithGemini,
  researchArticleEvidence,
  sanitizeTrustedSources,
  verifyArticleEvidence
} from "./marcie-gemini-service.js?v=20260923r27";
import { generateArticleInChunks } from "./marcie-draft-chunks.js?v=20260923r5";

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
  minimumSources = 8,
  videoEvidence = null,
  model = "",
  signal = null
} = {}) {
  const dossier = await researchArticleEvidence({
    searchPlatforms,
    researchInstructions,
    topic,
    audience,
    mode: "aida",
    minimumSources: globalThis.MarcieResearchPolicy.target({ editorialMode: "aida", editorialProfileSnapshot: { minimumSources } }),
    region,
    period,
    videoEvidence,
    model,
    signal
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

export async function generateAidaProposalsWithGemini({ session = {}, topic = "", signals = [], dossier = null, signal = null } = {}) {
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
  const { parsed } = await generateGroundedJson({ prompt, useResearchTools: false, maxOutputTokens: Math.max(1800, audiences.length * 950), signal });
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
  provisionalDraft = false,
  region = "MX",
  period = "6m",
  model = "",
  checkpoint = null,
  onChunk = null,
  signal = null
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
  if (!provisionalDraft) globalThis.MarcieResearchPolicy.assertReady(dossier, minimumSources);
  const draftingDossier = provisionalDraft ? { ...dossier, provisionalDraft: true } : dossier;
  const sources = sanitizeTrustedSources(dossier.sources);
  const editorialPolicy = `${LATAM_ARTICLE_LANGUAGE_POLICY} Contrato específico de audiencia: ${audienceEditorialDirection(audience)}
  Los hechos científicos y la historia enriquecen el argumento: no sustituyen el tema principal. Mantén una idea central fiel al tema y una analogía dominante. Hechos y fechas solo del dossier. Diferencia antecedentes históricos de señales actuales. No repitas ni parafrasees una afirmación marcada como no respaldada. Atribuye las ideas de videos a su autor; nunca los uses para respaldar hechos externos. Usa citas [sourceId] del documento consultado y locator en videos. Sin CTA comercial. ${brandLine ? `Termina exactamente con la frase de marca configurada: ${brandLine}` : "No hay frase de marca configurada; crea un cierre original y pertinente al argumento."} Reglas adicionales: ${JSON.stringify(customRules)}`;
  const parsed = await generateArticleInChunks({ model: model || "gemini-3.5-flash-lite", title: title || centralTopic, topic: centralTopic, audience, brief, dossier: draftingDossier, mode: "aida", checkpoint, onChunk, signal, brandLine, editorialPolicy });
  const article = applyVerifiedAttributions({
    ...parsed,
    schemaVersion: "1.0",
    audience,
    editorialMode: "aida",
    modeCompatibility: "compatible",
    provisionalDraft,
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
      provisionalDraft,
      summary: dossier.summary || "",
      facts: dossier.facts || [],
      currentSignals: dossier.currentSignals || [],
      historicalMilestones: dossier.historicalMilestones || [],
      attributedReferences: dossier.attributedReferences || [],
      researchPeriod: dossier.researchPeriod || "",
      dateWindow: dossier.dateWindow || null,
      currentSourceCount: dossier.currentSourceCount || 0,
      historicalSourceCount: dossier.historicalSourceCount || 0,
      verifiedSourceCount: dossier.verifiedSourceCount ?? sources.filter((source) => source.verificationStatus === "verified" && source.sourceType !== "youtube_video").length,
      totalSourceCount: dossier.totalSourceCount ?? sources.length,
      institutionCount: dossier.institutionCount || uniqueInstitutions(sources).size,
      researchedAt: dossier.researchedAt
    },
    aida: { brandLine, phases: [...AIDA_PHASES], serviceVersion: AIDA_SERVICE_VERSION },
    generationTelemetry: {
      modeUsed: "aida",
      serviceVersion: AIDA_SERVICE_VERSION,
      retrievedUrls: sources.filter((source) => source.sourceType !== "youtube_video").map((source) => source.url),
      videoCount: sources.filter((source) => source.sourceType === "youtube_video").length,
      verifiedSourceCount: dossier.verifiedSourceCount ?? sources.filter((source) => source.verificationStatus === "verified" && source.sourceType !== "youtube_video").length,
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

export async function reviewAidaArticleWithGemini({ article = {}, brandLine = "", blockIds = [] } = {}) {
  const articleWithMode = { ...article, editorialMode: "aida" };
  const verifiedArticle = await hasCurrentEvidenceVerification(articleWithMode)
    ? articleWithMode
    : await verifyArticleEvidence({ article: articleWithMode, topic: article.title || "", additionalSearches: 0 });
  const compatibility = getAidaCompatibility(verifiedArticle);
  const sources = sanitizeTrustedSources(verifiedArticle.researchSources || verifiedArticle.sources || []);
  const currentSources = currentVerifiedSources(sources);
  const selected = new Set(blockIds.map(String));
  const reviewedBlocks = selected.size ? (verifiedArticle.blocks || []).filter((block) => selected.has(String(block.id))) : verifiedArticle.blocks;
  const prompt = `
Audita este artículo con la guía editorial Aida. No uses criterios PNL de Marcie y no exijas que empiece con una pregunta.
${selected.size ? "Esta es una revisión parcial: evalúa solo los bloques indicados; la estructura global ya fue evaluada." : ""}
Comprueba: ocho fases en orden, escena inicial, agitación moderada, una idea central fiel al tema, una analogía dominante, precisión accesible, hechos científicos pertinentes respaldados, cronología solo cuando aporte y esté respaldada, ausencia de CTA comercial y un cierre original no repetitivo.${brandLine ? " También debe terminar exactamente con la frase de marca configurada." : " No exijas ninguna frase de marca."}
Comprueba además que la prosa original use español neutro latinoamericano, sin "vosotros" ni formas como "sabéis"; respeta las citas literales y los títulos de fuentes.
${brandLine ? `Frase de marca obligatoria: ${brandLine}` : "Frase de marca: no configurada."}
Artículo: ${JSON.stringify({ title: verifiedArticle.title, blocks: reviewedBlocks, aida: verifiedArticle.aida }).slice(0, 18000)}
Estado factual: ${JSON.stringify(verifiedArticle.verification || {})}
Fuentes actuales verificadas: ${currentSources.length}; instituciones actuales: ${uniqueInstitutions(currentSources).size}. Antecedentes históricos separados: ${sources.length - currentSources.length}.
Devuelve SOLO JSON: {"readabilityScore":90,"summary":"","issues":[{"id":"aida-1","type":"aida_structure|science|history|brand|cta|facts","message":"","suggestion":""}],"seoRecommendations":[],"aidaCompliance":{"status":"verified|blocked","phasesComplete":true,"sceneOpening":true,"singleCentralIdea":true,"singleDominantAnalogy":true,"commercialCtaAbsent":true,"brandLineExact":true}}`.trim();
  const { parsed } = await generateGroundedJson({ prompt, useResearchTools: false, maxOutputTokens: 2500 });
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
