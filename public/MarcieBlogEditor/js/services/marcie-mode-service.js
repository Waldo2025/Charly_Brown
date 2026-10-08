import "../contracts/marcie-research-policy.js?v=20260923r2";
import { listMarciePromptProfiles } from "./marcie-prompt-settings.js";
import { buildEditorialVocabularyInstruction, normalizeEditorialVocabulary } from "./marcie-vocabulary.js";
import { isTransientFetchError } from "./marcie-automation-recovery.js";
import {
  getResearchDossierFromCache,
  saveResearchDossierToCache,
  saveSessionResearchToCache,
  restoreSessionResearchFromCache
} from "./marcie-research-cache.js?v=20260923r3";
export {
  getResearchDossierFromCache,
  saveResearchDossierToCache,
  saveSessionResearchToCache,
  restoreSessionResearchFromCache
};
const researchPolicy = globalThis.MarcieResearchPolicy;
import {
  draftArticleWithGemini,
  researchArticleEvidence,
  researchArticleEvidenceBundle,
  generateProposalsWithGemini,
  refineBlogTopicWithGemini,
  reviewArticleWithGemini
} from "./marcie-gemini-service.js?v=20260923r27";
import {
  AIDA_LEGACY_BRAND_LINE,
  draftAidaArticleWithGemini,
  generateAidaProposalsWithGemini,
  refineAidaTopicWithGemini,
  researchAidaTopicWithGemini,
  reviewAidaArticleWithGemini
} from "./marcie-aida-service.js?v=20260923r6";

export function normalizeLegacyAidaClosing(session = {}, article = session.article || {}) {
  const configuredBrandLine = String(session.editorialProfileSnapshot?.brandLine || "").trim();
  if (configuredBrandLine || !Array.isArray(article.blocks)) return article;
  const closingIndex = article.blocks.findLastIndex?.((block) => block?.phase === "close") ?? -1;
  if (closingIndex < 0) return article;
  const closingText = String(article.blocks[closingIndex]?.text || "").trim();
  if (!closingText.endsWith(AIDA_LEGACY_BRAND_LINE)) return article;
  const blocks = article.blocks.map((block, index) => index === closingIndex
    ? { ...block, text: closingText.slice(0, -AIDA_LEGACY_BRAND_LINE.length).trim().replace(/[,:;–—-]+$/, "").trim() }
    : block);
  return { ...article, blocks, aida: { ...(article.aida || {}), brandLine: "" } };
}

export const DEFAULT_CUSTOM_PROFILE = Object.freeze({
  name: "Híbrido Marcie + Aida",
  structure: "hybrid",
  opening: "scene",
  historicalComparison: "when_supported",
  evidenceDensity: "high",
  minimumSources: 8,
  sourceTypes: ["academic", "official", "science_magazine", "education_blog"],
  includeQuote: false,
  includeLists: true,
  includeCaseStudy: true,
  includeAnalogy: true,
  ctaPolicy: "optional",
  brandLine: "",
  tone: "Cálido, riguroso y accesible",
  length: "1000–1600 palabras",
  seo: true
});

export function buildCustomEditorialBrief(profile = {}) {
  const rules = { ...DEFAULT_CUSTOM_PROFILE, ...(profile || {}) };
  return [
    `Estructura: ${rules.structure}.`,
    `Apertura: ${rules.opening}.`,
    `Comparación histórica: ${rules.historicalComparison}.`,
    `Densidad de evidencia: ${rules.evidenceDensity}; mínimo ${rules.minimumSources} fuentes.`,
    `Tipos de fuentes: ${(rules.sourceTypes || []).join(", ")}.`,
    `Cita: ${rules.includeQuote ? "sí" : "no"}; listas: ${rules.includeLists ? "sí" : "no"}; caso: ${rules.includeCaseStudy ? "sí" : "no"}; analogía: ${rules.includeAnalogy ? "sí" : "no"}.`,
    `CTA: ${rules.ctaPolicy}. Tono: ${rules.tone}. Extensión: ${rules.length}.`,
    rules.brandLine ? `Frase de marca obligatoria: ${rules.brandLine}.` : ""
  ].filter(Boolean).join("\n");
}

export function sessionUsesAida(session = {}) {
  const mode = String(session.editorialMode || "marcie").toLowerCase();
  return mode === "aida" || (mode === "custom" && String(session.editorialProfileSnapshot?.structure || "").toLowerCase() === "aida");
}

export async function refineTopicForMode({ editorialMode = "marcie", editorialProfileSnapshot = {}, topic = "", specifications = [], audience = "educators", preferredVocabulary = [] } = {}) {
  const vocabularyInstruction = buildEditorialVocabularyInstruction(preferredVocabulary);
  const enrichedSpecifications = [...specifications, vocabularyInstruction].filter(Boolean);
  if (String(editorialMode).toLowerCase() === "aida" || (String(editorialMode).toLowerCase() === "custom" && String(editorialProfileSnapshot?.structure || "").toLowerCase() === "aida")) {
    return refineAidaTopicWithGemini({ topic, specifications: enrichedSpecifications, audience });
  }
  return refineBlogTopicWithGemini({ topic, specifications: enrichedSpecifications, audience });
}

function researchInstructionsForSession(session = {}) {
  const promptProfileId = session.sessionConfiguration?.promptProfileId || session.automation?.promptProfileId;
  const profile = listMarciePromptProfiles().find(profile => profile.id === promptProfileId);
  return [
    ...(session.specifications || []).filter(item => /^#fuentes\b/i.test(item)),
    ...(session.editorialProfileSnapshot?.sourceTypes || []).map(type => `Tipo de fuente preferido: ${type}`),
    profile?.prompts?.source_research_policy || ""
  ].filter(Boolean);
}

function researchPlatformsForSession(session = {}) {
  const selected = session.searchPlatforms ?? session.sessionConfiguration?.searchPlatforms;
  if (!Array.isArray(selected)) return selected;
  const legacyChatPlatforms = (researchPolicy.platforms || []).map((platform) => platform.id);
  return session.agentRunId && !selected.includes("supplemental")
    && legacyChatPlatforms.length === selected.length
    && legacyChatPlatforms.every((id) => selected.includes(id))
    ? [...selected, "supplemental"]
    : selected;
}

export async function researchTopicForMode({ session = {}, topic = "", region = "MX", country = "MX", period = "6m", audience = "", excludeUrls = [], startPlatformOffset = 0, pendingCandidates = [], signal = null } = {}) {
  const researchInstructions = researchInstructionsForSession(session);
  if (sessionUsesAida(session)) {
    return researchAidaTopicWithGemini({
      topic,
      audience: audience || session.audience || session.selectedAudiences?.[0] || "parents",
      region: region || country || "MX",
      period,
      minimumSources: researchPolicy.target(session),
      researchInstructions,
      searchPlatforms: researchPlatformsForSession(session),
      videoEvidence: session.videoResearch || session.sessionConfiguration?.videoResearch || null,
      signal
    });
  }
  return researchArticleEvidence({
    sessionId: session.id,
    topic,
    audience: audience || session.audience || session.selectedAudiences?.[0] || "educators",
    mode: String(session.editorialMode || "marcie"),
    researchInstructions,
    searchPlatforms: researchPlatformsForSession(session),
    minimumSources: researchPolicy.target(session),
    region: region || country || "MX",
    period,
    videoEvidence: session.videoResearch || session.sessionConfiguration?.videoResearch || null,
    excludeUrls,
    startPlatformOffset,
    pendingCandidates,
    signal
  });
}

const draftJobs = new Map();

function videoEditorialInstruction(videoResearch = null) {
  const videos = Array.isArray(videoResearch?.videos) ? videoResearch.videos : [];
  if (!videos.length) return "";
  const axes = videos.slice(0, 5).map((video) => ({
    centralIdea: String(video?.centralIdea || video?.summary || "").trim(),
    neuroeducationConnection: String(video?.neuroeducationConnection || "").trim()
  }));
  return `BASE DE VIDEO OBLIGATORIA PARA LA REDACCIÓN:
- El artículo debe desarrollar la idea central del video y su relación con la neuroeducación, adaptadas al público seleccionado.
- El video es el punto de partida conceptual: no copies su estructura, secuencia, frases ni paráfrasis cercanas.
- Amplía y refuerza ambos ejes con las fuentes documentales verificadas. No atribuyas al video explicaciones neurocientíficas añadidas por las fuentes.
- Atribuye expresamente las ideas del video a su autor o canal cuando corresponda.
Ejes analizados: ${JSON.stringify(axes)}.`;
}

export async function draftArticleForMode(options = {}) {
  const session = options.session || {};
  const audience = options.audience || session.audience || "educators";
  const key = (session.id || "new") + ":" + audience;
  if (draftJobs.has(key)) throw new Error("Ya se está redactando esta audiencia.");
  const revision = session.articlesByAudience?.[audience]?.revision || 0;
  const activeAudience = session.audience;
  const configuration = researchPolicy.fingerprint(session, audience);
  const isAutomated = options.isAutomated === true || session.automation?.status === "running" || session.automation?.mode === "automated";
  draftJobs.set(key, true);
  try {
    const result = await draftArticleForModeInternal(options);
    delete session.articleDraftsByAudience?.[audience];
    if (!isAutomated && (session.audience !== activeAudience || (session.articlesByAudience?.[audience]?.revision || 0) !== revision || researchPolicy.fingerprint(session, audience) !== configuration)) {
      throw new Error("El contenido cambió durante la redacción. Se conservaron las ediciones.");
    }
    result.revision = revision + 1;
    result.audience = audience;
    result.preferredVocabulary = normalizeEditorialVocabulary(session.preferredVocabulary || session.sessionConfiguration?.preferredVocabulary || []);
    return result;
  } finally { draftJobs.delete(key); }
}
async function draftArticleForModeInternal({ session = {}, title = "", topic = "", audience = "educators", brief = "", allowProvisionalDraft = false, onDraftProgress = null, signal = null } = {}) {
  const vocabularyInstruction = buildEditorialVocabularyInstruction(session.preferredVocabulary || session.sessionConfiguration?.preferredVocabulary || []);
  const videoInstruction = videoEditorialInstruction(session.videoResearch || session.sessionConfiguration?.videoResearch || null);
  const editorialBrief = [brief, videoInstruction, ...(session.specifications || []), vocabularyInstruction].filter(Boolean).join("\n");
  const promptProfileId = session.sessionConfiguration?.promptProfileId || session.automation?.promptProfileId;
  const promptOverrides = listMarciePromptProfiles().find(profile => profile.id === promptProfileId)?.prompts || null;
  const mode = String(session.editorialMode || "marcie");
  const profile = session.editorialProfileSnapshot || {};
  let provisionalDraft = allowProvisionalDraft;
  let researchDossier = session.researchGlobal ? session.researchByAudience?.[audience] : (allowProvisionalDraft ? session.researchByAudience?.[audience] : null);
  if (researchDossier && !researchPolicy.readiness(researchDossier, researchPolicy.target(session)).ready) provisionalDraft = true;
  if (!researchDossier) {
    try { researchDossier = await ensureAudienceResearchForDraft({ session, title, topic, audience, brief, signal }); }
    catch (error) {
      if (error?.code !== "marcie_research_incomplete" || !session.researchByAudience?.[audience]) throw error;
      researchDossier = session.researchByAudience[audience];
      provisionalDraft = true;
    }
  }
  if (provisionalDraft) researchDossier = { ...researchDossier, provisionalDraft: true };
  const onChunk = async (checkpoint) => {
    session.articleDraftsByAudience = { ...(session.articleDraftsByAudience || {}), [audience]: checkpoint };
    await onDraftProgress?.(checkpoint);
  };
  const checkpoint = session.articleDraftsByAudience?.[audience] || null;
  brief = editorialBrief;
  if (mode === "aida") {
    return draftAidaArticleWithGemini({
      title, topic, audience, brief,
      brandLine: profile.brandLine,
      customRules: profile,
      researchDossier, provisionalDraft, checkpoint, onChunk, signal,
      region: session.researchRegion || "MX",
      period: session.researchPeriod || "6m"
    });
  }
  if (mode === "custom") {
    const hybridBrief = `${brief}\n${buildCustomEditorialBrief(profile)}`.trim();
    if (profile.structure === "aida") {
      return draftAidaArticleWithGemini({
        title, topic, audience, brief: hybridBrief,
        brandLine: profile.brandLine,
        customRules: profile,
        researchDossier, provisionalDraft, checkpoint, onChunk, signal,
        region: session.researchRegion || "MX",
        period: session.researchPeriod || "6m"
      });
    }
    return draftArticleWithGemini({ title, topic, audience, brief: hybridBrief, editorialMode: "custom", verifyEvidence: false, researchDossier, provisionalDraft, promptOverrides, checkpoint, onChunk, signal });
  }
  return draftArticleWithGemini({ title, topic, audience, brief, editorialMode: "marcie", verifyEvidence: false, researchDossier, provisionalDraft, promptOverrides, checkpoint, onChunk, signal });
}

const AUDIENCE_LABELS = {
  educators: "Docentes",
  parents: "Padres y tutores",
  students: "Estudiantes",
  coordinators: "Coordinadores académicos y directivos escolares"
};

const AUDIENCE_PROPOSAL_FALLBACKS = Object.freeze({
  educators: {
    title: "Transformar la práctica docente desde el aula",
    angle: "Metodologías, bienestar profesional y decisiones didácticas",
    brief: "Una propuesta práctica para fortalecer la enseñanza, el acompañamiento del aprendizaje y el bienestar docente."
  },
  students: {
    title: "Aprender con estrategia, autonomía y bienestar",
    angle: "Hábitos de estudio, autorregulación y motivación",
    brief: "Una guía clara para que cada estudiante comprenda cómo aprende y tome decisiones útiles sobre su estudio."
  },
  parents: {
    title: "Acompañar el aprendizaje en familia sin convertirlo en una batalla",
    angle: "Orientación familiar, empatía y acuerdos cotidianos",
    brief: "Pautas para que madres, padres y tutores acompañen el desarrollo y bienestar de sus hijos con cercanía y criterio."
  },
  coordinators: {
    title: "Liderazgo neuropedagógico: convertir la evidencia en decisiones escolares",
    angle: "Neuropedagogía, acompañamiento docente e implementación institucional",
    brief: "Un marco estratégico para que coordinación y dirección traduzcan principios sobre atención, memoria de trabajo, carga cognitiva, autorregulación y metacognición en prácticas docentes, acuerdos curriculares e indicadores observables, sin neuromitos ni recetas familiares."
  }
});

function fallbackProposalTitle(topic = "", audience = "educators") {
  const cleanTopic = String(topic || "el tema").trim().replace(/[.!?]+$/, "").slice(0, 110) || "el tema";
  const titles = {
    educators: `Qué cambia en el aula cuando comprendemos ${cleanTopic}`,
    students: `Cómo aprovechar ${cleanTopic} para aprender mejor`,
    parents: `Cómo acompañar ${cleanTopic} en casa con más claridad`,
    coordinators: `Qué decisiones puede orientar ${cleanTopic} en la escuela`
  };
  return titles[audience] || `Una guía práctica sobre ${cleanTopic}`;
}

function providerErrorDetails(error = {}) {
  let body = error?.detail;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body) {
    try { body = JSON.parse(String(error?.message || "")); } catch { body = null; }
  }
  const root = body?.error && typeof body.error === "object" ? body.error : body || {};
  return {
    status: Number(error?.status || root.code || root.statusCode || 0),
    code: String(error?.code || root.status || root.code || body?.error || "provider_error").slice(0, 100),
    requestId: String(error?.requestId || body?.requestId || root.requestId || "").slice(0, 100),
    message: String(root.message || error?.message || "").slice(0, 300)
  };
}

function isResearchQuotaError(error = {}) {
  const details = providerErrorDetails(error);
  return details.status === 429 || /quota|resource_exhausted|too many requests/i.test(`${details.code} ${details.message}`);
}

function proposalResearchFingerprint(session, audience, proposal = {}) {
  const stableSession = {
    ...session,
    specifications: session.sessionConfiguration?.specifications || session.specifications || []
  };
  return researchPolicy.fingerprint(stableSession, audience, {
    title: proposal.title || session.topic || session.title,
    brief: proposal.brief || proposal.angle || "",
    researchInstructions: researchInstructionsForSession(stableSession)
  });
}

function hasResearchSourceYear(source = {}) {
  return /\b(?:18|19|20)\d{2}\b/.test(String(source.year || source.publishedAt || ""));
}

function mergeResearchDossiers(previous = {}, incoming = {}) {
  const sources = [...(previous.sources || []), ...(incoming.sources || [])].filter((source, index, all) =>
    all.findIndex((item) => String(item.doi || item.url || item.id).toLowerCase() === String(source.doi || source.url || source.id).toLowerCase()) === index)
    .sort((left, right) => Number(hasResearchSourceYear(right)) - Number(hasResearchSourceYear(left)));
  const rejectedByUrl = new Map([...(previous.rejectedSources || []), ...(incoming.rejectedSources || [])]
    .filter((source) => source?.url).map((source) => [String(source.url).toLowerCase(), source]));
  const sourceIds = new Set(sources.map((source) => String(source.id)));
  const analysedSourceIds = new Set([...(previous.analysis?.sourceIds || []), ...(incoming.analysis?.sourceIds || [])].map(String));
  const facts = [...(previous.facts || []), ...(incoming.facts || [])].filter((fact) =>
    (fact.sourceIds || []).some((id) => sourceIds.has(String(id))));
  const target = Number(incoming.targetSourceCount || previous.targetSourceCount || 4);
  const sharedSourceIds = [...new Set([...(previous.sharedSourceIds || []), ...(incoming.sharedSourceIds || [])].map(String))];
  const specificSourceIds = [...new Set([...(previous.specificSourceIds || []), ...(incoming.specificSourceIds || [])].map(String))];
  const merged = {
    ...incoming, sources, facts, rejectedSources: [...rejectedByUrl.values()].slice(-100),
    platformResults: [...(previous.platformResults || []), ...(incoming.platformResults || [])].slice(-80),
    attributedReferences: [...(previous.attributedReferences || []), ...(incoming.attributedReferences || [])],
    sharedSourceIds, specificSourceIds,
    sharedSourceCount: Number(incoming.sharedSourceCount || previous.sharedSourceCount || sharedSourceIds.length),
    specificSourceCount: Number(incoming.specificSourceCount || previous.specificSourceCount || specificSourceIds.length),
    sharedSourceTarget: Number(incoming.sharedSourceTarget || previous.sharedSourceTarget || 2),
    specificSourceTarget: Number(incoming.specificSourceTarget || previous.specificSourceTarget || 2),
    analysis: { ...(incoming.analysis || {}), sourceIds: [...analysedSourceIds].filter((id) => sourceIds.has(id)) },
    targetSourceCount: target
  };
  const readiness = researchPolicy.readiness(merged, target);
  return { ...merged, analysisStatus: readiness.ready ? "complete" : "incomplete", blockers: readiness.reasons };
}

function applySharedEvidence(dossier = {}, sharedEvidence = null) {
  if (!sharedEvidence?.sources?.length) return dossier;
  const sources = [...(dossier.sources || []), ...(sharedEvidence.sources || [])].filter((source, index, all) =>
    all.findIndex((item) => String(item.doi || item.url || item.id).toLowerCase() === String(source.doi || source.url || source.id).toLowerCase()) === index);
  const sharedSourceIds = [...new Set([...(sharedEvidence.sharedSourceIds || []), ...(dossier.sharedSourceIds || [])].map(String))];
  const verifiedIds = new Set(sources.filter((source) => source.verificationStatus === "verified").map((source) => String(source.id)));
  const usableSharedIds = sharedSourceIds.filter((id) => verifiedIds.has(id));
  const specificCandidates = [
    ...(dossier.specificSourceIds || []),
    ...sources
      .filter((source) => source.verificationStatus === "verified" && !usableSharedIds.includes(String(source.id)))
      .map((source) => String(source.id))
  ];
  const specificSourceIds = [...new Set(specificCandidates.map(String))].filter((id) => !usableSharedIds.includes(id));
  const facts = [...(dossier.facts || []), ...(sharedEvidence.facts || [])].filter((fact, index, all) =>
    all.findIndex((item) => String(item.id || item.claim || item.text) === String(fact.id || fact.claim || fact.text)) === index);
  return {
    ...dossier,
    sources,
    facts,
    sharedSourceIds: usableSharedIds,
    specificSourceIds,
    sharedSourceCount: usableSharedIds.length,
    specificSourceCount: specificSourceIds.length,
    sharedSourceTarget: Number(dossier.sharedSourceTarget || sharedEvidence.sharedSourceTarget || 2),
    specificSourceTarget: Number(dossier.specificSourceTarget || sharedEvidence.specificSourceTarget || 2),
    analysis: { ...(dossier.analysis || {}), sourceIds: [...new Set([...(dossier.analysis?.sourceIds || []), ...(sharedEvidence.analysis?.sourceIds || [])].map(String))] }
  };
}

function mergeAudienceSpecificEvidence(previous = {}, incoming = {}, sharedIds = []) {
  const merged = mergeResearchDossiers(previous, incoming);
  const verified = (merged.sources || []).filter((source) => source.verificationStatus === "verified");
  const verifiedIds = new Set(verified.map((source) => String(source.id)));
  const sharedSourceIds = [...new Set(sharedIds.map(String))].filter((id) => verifiedIds.has(id));
  const specificTarget = Number(previous.specificSourceTarget || 2);
  const specificSourceIds = verified.filter((source) => !sharedSourceIds.includes(String(source.id)))
    .sort((left, right) => Number(hasResearchSourceYear(right)) - Number(hasResearchSourceYear(left)))
    .slice(0, specificTarget).map((source) => String(source.id));
  const dateSearchComplete = previous.dateSearchComplete === true || incoming.dateSearchComplete === true;
  const datedCount = verified.filter(hasResearchSourceYear).length;
  const target = Number(previous.targetSourceCount || 4);
  return refreshResearchAnalysisStatus({
    ...merged,
    sharedSourceIds,
    specificSourceIds,
    sharedSourceCount: sharedSourceIds.length,
    specificSourceCount: specificSourceIds.length,
    sharedSourceTarget: Number(previous.sharedSourceTarget || 2),
    specificSourceTarget: specificTarget,
    dateSearchComplete,
    blockers: !dateSearchComplete && datedCount < target
      ? [`La búsqueda de fuentes fechadas quedó pendiente: ${datedCount} de ${target} con fecha comprobada. Reanuda antes de usar fuentes sin fecha como respaldo.`]
      : [],
    verificationStatus: "verified"
  });
}

function assignEvidenceRoles(dossier = {}, sharedSourceIds = []) {
  const verified = (dossier.sources || []).filter((source) => source.verificationStatus === "verified")
    .sort((left, right) => Number(hasResearchSourceYear(right)) - Number(hasResearchSourceYear(left)));
  if (!verified.length) return dossier;
  const sharedTarget = Number(dossier.sharedSourceTarget || 2);
  const specificTarget = Math.max(2, Number(dossier.specificSourceTarget || 0), Number(dossier.targetSourceCount || 4) - sharedTarget);
  const existingShared = sharedSourceIds.length
    ? [...new Set(sharedSourceIds.map(String))]
    : verified.map((source) => String(source.id));
  const shared = existingShared.filter((id) => verified.some((source) => String(source.id) === id)).slice(0, sharedTarget);
  verified.forEach((source) => {
    if (shared.length >= sharedTarget) return;
    const id = String(source.id);
    if (!shared.includes(id)) shared.push(id);
  });
  const specific = [...new Set(verified.map((source) => String(source.id)))]
    .filter((id) => !shared.includes(id)).slice(0, specificTarget);
  return {
    ...dossier,
    sharedSourceIds: shared.slice(0, sharedTarget),
    specificSourceIds: specific,
    sharedSourceCount: shared.slice(0, sharedTarget).length,
    specificSourceCount: specific.length,
    sharedSourceTarget: sharedTarget,
    specificSourceTarget: specificTarget
  };
}

function refreshResearchAnalysisStatus(dossier = {}) {
  const sourceIds = (dossier.sources || []).filter((source) => source.verificationStatus === "verified").map((source) => String(source.id));
  const analysedIds = new Set((dossier.analysis?.sourceIds || []).map(String));
  const enoughSources = sourceIds.length >= Number(dossier.targetSourceCount || 4);
  if (sourceIds.length && sourceIds.every((id) => analysedIds.has(id)) && (enoughSources || !(dossier.pendingCandidates || []).length)) {
    return {
      ...dossier,
      analysisStatus: "complete",
      blockers: (dossier.blockers || []).filter((reason) =>
        !/Falta completar el análisis documental antes de redactar|resultados sin analizar por el límite técnico/i.test(String(reason)))
    };
  }
  return dossier;
}

function researchContinuation(dossier = {}) {
  dossier = dossier || {};
  const pendingCandidates = dossier.pendingCandidates || [];
  return {
    excludeUrls: [
      ...(dossier.sources || []).map((source) => source.url),
      ...(dossier.rejectedSources || []).filter((source) =>
        source.reason !== "verification_error"
        && !(source.reason === "unreachable" && !source.httpStatus)
      ).map((source) => source.url)
    ].filter(Boolean),
    startPlatformOffset: !pendingCandidates.length && (dossier.blockers || []).some((reason) => /resultados sin analizar por el límite técnico/i.test(String(reason)))
      ? Math.max(0, Number(dossier.nextPlatformOffset || 0) - 2)
      : Number(dossier.nextPlatformOffset || 0),
    pendingCandidates
  };
}

async function ensureAudienceResearchForDraft({ session = {}, title = "", topic = "", audience = "educators", brief = "", signal = null } = {}) {
  const normalizedAudience = String(audience || "educators").toLowerCase();
  restoreSessionResearchFromCache(session);
  const existingMap = session.researchByAudience && typeof session.researchByAudience === "object" ? session.researchByAudience : {};
  let cached = existingMap[normalizedAudience];
  if (!cached || !Array.isArray(cached.sources) || !cached.sources.length) {
    cached = getResearchDossierFromCache(title || topic, normalizedAudience)
      || getResearchDossierFromCache(topic, normalizedAudience);
  }
  const researchProposal = (session.proposals || []).find((item) => item.audience === normalizedAudience);
  const fingerprint = proposalResearchFingerprint(session, normalizedAudience, researchProposal || { title: title || topic, brief });
  if (cached?.researchFingerprint && cached.researchFingerprint !== fingerprint) cached = null;
  if (cached) cached = refreshResearchAnalysisStatus(assignEvidenceRoles(cached, session.researchShared?.sharedSourceIds || []));
  const cachedReady = cached && researchPolicy.readiness(cached, researchPolicy.target(session)).ready;
  if (cachedReady && (!cached.researchFingerprint || cached.researchFingerprint === fingerprint)) {
    session.researchByAudience = { ...existingMap, [normalizedAudience]: cached };
    saveResearchDossierToCache(title || topic, normalizedAudience, cached);
    return cached;
  }
  let dossier;
  try {
    dossier = await researchTopicForMode({
      session,
      topic: `${title || topic}. ${brief || ""}`.trim(),
      audience: normalizedAudience,
      region: session.researchRegion || "MX",
      period: session.researchPeriod || "6m",
      ...researchContinuation(cached),
      signal
    });
    if ((cached?.sources || []).length) dossier = mergeResearchDossiers(cached, dossier);
    dossier = refreshResearchAnalysisStatus(assignEvidenceRoles(dossier, session.researchShared?.sharedSourceIds || []));
    saveResearchDossierToCache(title || topic, normalizedAudience, dossier);
    saveResearchDossierToCache(topic, normalizedAudience, dossier);
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    if (isTransientFetchError(error) || Number(error?.status || 0) >= 500) throw error;
    dossier = { sources: [], attributedReferences: [], verifiedSourceCount: 0, blockers: [error.message || "No se pudo completar la investigación."] };
  }
  const readiness = researchPolicy.readiness(dossier, researchPolicy.target(session));
  const verifiedSourceCount = readiness.count;
  const normalizedDossier = { ...dossier, audience: normalizedAudience, verifiedSourceCount, targetSourceCount: researchPolicy.target(session), verificationStatus: readiness.ready ? "verified" : "blocked", blockers: readiness.reasons };
  normalizedDossier.researchFingerprint = fingerprint;
  session.researchByAudience = { ...existingMap, [normalizedAudience]: normalizedDossier };
  saveSessionResearchToCache(session);
  researchPolicy.assertReady(normalizedDossier, researchPolicy.target(session));
  session.proposals = Array.isArray(session.proposals) ? [...session.proposals] : [];
  let proposal = session.proposals.find((item) => String(item?.audience || "").toLowerCase() === normalizedAudience);
  if (!proposal) {
    proposal = { id: `manual-${normalizedAudience}`, audience: normalizedAudience, audienceLabel: AUDIENCE_LABELS[normalizedAudience] || normalizedAudience, title: title || topic, angle: brief || "Enfoque editorial manual", brief: brief || "Propuesta creada desde la redacción manual.", origin: "manual" };
    session.proposals.push(proposal);
  }
  Object.assign(proposal, { sourceIds: (normalizedDossier.sources || []).map((source) => String(source.id)), researchStatus: normalizedDossier.verificationStatus, verifiedSourceCount, targetSourceCount: researchPolicy.target(session) });
  normalizedDossier.researchFingerprint = proposalResearchFingerprint(session, normalizedAudience, proposal);
  return normalizedDossier;
}

export async function generateProposalsForMode({ session = {}, topic = "", signals = [], onResearchProgress = null, reuseProposals = false, researchContinuations = 0, signal = null } = {}) {
  const mode = String(session.editorialMode || "marcie");
  const vocabularyInstruction = buildEditorialVocabularyInstruction(session.preferredVocabulary || session.sessionConfiguration?.preferredVocabulary || []);
  const enrichedSignals = [...signals, vocabularyInstruction].filter(Boolean);
  const requested = Array.isArray(session.selectedAudiences) && session.selectedAudiences.length
    ? session.selectedAudiences
    : ["educators", "students", "parents", "coordinators"];
  let response;
  let proposalGenerationFallback = false;
  try {
    if (reuseProposals && Array.isArray(session.proposals) && requested.every((audience) => session.proposals.some((proposal) => proposal.audience === audience))) {
      response = { proposals: session.proposals };
    } else if (sessionUsesAida(session)) {
      response = await generateAidaProposalsWithGemini({ session, topic, signals: enrichedSignals, dossier: session.trends?.[0] || null, signal });
    } else {
      const extra = mode === "aida"
        ? "Aplica la estructura Aida, abre con una escena y plantea una idea central fiel al tema. Añade hechos científicos relacionados y evolución histórica solo cuando sean pertinentes y tengan evidencia."
        : mode === "custom" ? buildCustomEditorialBrief(session.editorialProfileSnapshot || {}) : "";
      response = await generateProposalsWithGemini({ topic, signals: [...enrichedSignals, extra].filter(Boolean), audiences: requested, signal });
    }
  } catch (error) {
    const providerError = providerErrorDetails(error);
    if (providerError.status < 500 || providerError.status > 599) throw error;
    proposalGenerationFallback = true;
    console.warn("[MarcieAI] Propuestas de respaldo por error del proveedor", {
      operation: "generate_proposals",
      sessionId: String(session.id || "").slice(0, 100),
      mode,
      ...providerError,
      audienceCount: requested.length
    });
    response = { proposals: [] };
  }
  const extra = mode === "custom" ? buildCustomEditorialBrief(session.editorialProfileSnapshot || {}) : "";
  const source = Array.isArray(response?.proposals) ? response.proposals : [];
  const proposals = requested.map((audience) => {
    const normalizedAudience = String(audience).toLowerCase();
    const exact = source.find((item) => String(item?.audience || "").toLowerCase() === normalizedAudience);
    const fallback = AUDIENCE_PROPOSAL_FALLBACKS[normalizedAudience] || {
      title: topic,
      angle: "Enfoque editorial específico para la audiencia",
      brief: `Una propuesta sobre ${topic} adaptada a ${AUDIENCE_LABELS[normalizedAudience] || normalizedAudience}.`
    };
    const aidaFallback = proposalGenerationFallback && sessionUsesAida(session)
      ? {
          scene: `Una situación cotidiana de ${AUDIENCE_LABELS[normalizedAudience] || normalizedAudience} relacionada con ${topic}.`,
          problem: `Comprender ${topic} requiere distinguir la evidencia de las ideas simplificadas.`,
          centralIdea: fallback.angle,
          dominantAnalogy: "Una explicación concreta y fiel a las fuentes verificadas.",
          historicalAngle: "",
          sourceIds: [],
          editorialMode: "aida",
          aida: true
        }
      : {};
    return {
      ...fallback,
      ...exact,
      ...aidaFallback,
      audience: normalizedAudience,
      audienceLabel: AUDIENCE_LABELS[normalizedAudience] || normalizedAudience,
      title: exact?.title || (proposalGenerationFallback ? fallbackProposalTitle(topic, normalizedAudience) : "") || fallback.title || topic,
      angle: exact?.angle || fallback.angle,
      brief: `${exact?.brief || fallback.brief || fallback.angle || ""}${extra ? `\n${extra}` : ""}`.trim()
    };
  });
  restoreSessionResearchFromCache(session);
  session.researchByAudience = session.researchByAudience && typeof session.researchByAudience === "object" ? { ...session.researchByAudience } : {};
  session.proposals = proposals;
  const missingAudiences = proposals.filter((proposal) => !researchPolicy.readiness(session.researchByAudience[proposal.audience] || {}, researchPolicy.target(session)).ready);
  const globalBatch = proposals.length > 1;
  const globalFingerprint = researchPolicy.fingerprint(session, "global", {
    topic, audiences: requested, briefs: proposals.map((proposal) => `${proposal.audience}: ${proposal.title}. ${proposal.brief || proposal.angle}`)
  });
  const needsGlobalStage = globalBatch && missingAudiences.length && (
    session.researchGlobalFingerprint !== globalFingerprint || !session.researchGlobal?.selectionComplete || Number(researchContinuations) > 0
    || proposals.some((proposal) => !Object.prototype.hasOwnProperty.call(session.researchByAudience, proposal.audience))
  );
  if (needsGlobalStage) {
    try {
      const audienceBriefs = Object.fromEntries(proposals.map((proposal) => [proposal.audience, `${proposal.title}. ${proposal.brief || proposal.angle}`]));
      if (session.researchGlobalFingerprint !== globalFingerprint) {
        session.researchGlobal = null;
        session.researchShared = null;
      }
      let shared = await researchArticleEvidenceBundle({
        sessionId: session.id,
        topic, audiences: proposals.map((proposal) => proposal.audience), audienceBriefs,
        mode, minimumSources: researchPolicy.target(session), region: session.researchRegion || "MX", period: session.researchPeriod || "6m",
        searchPlatforms: researchPlatformsForSession(session),
        researchInstructions: researchInstructionsForSession(session),
        videoEvidence: session.videoResearch || session.sessionConfiguration?.videoResearch || null,
        existingGlobalDossier: session.researchGlobal,
        onGlobalResearch: async dossier => {
          session.researchGlobal = dossier;
          session.researchGlobalFingerprint = globalFingerprint;
          saveSessionResearchToCache(session);
          if (typeof onResearchProgress === "function") await onResearchProgress({
            audience: proposals[0].audience, proposal: proposals[0], index: 0, total: proposals.length,
            researchByAudience: session.researchByAudience, phase: "selection"
          });
        },
        signal
      });
      session.researchGlobal = shared.globalDossier;
      Object.assign(session.researchByAudience, shared.byAudience);
      saveSessionResearchToCache(session);
      const maxGlobalContinuations = Math.max(0, Math.min(2, Number(researchContinuations) || 0));
      for (let attempt = 0; attempt < maxGlobalContinuations && !session.researchGlobal?.quotaLimited; attempt += 1) {
        const missing = proposals.filter((proposal) => !researchPolicy.readiness(
          shared.byAudience?.[proposal.audience] || {}, researchPolicy.target(session)
        ).ready);
        if (!missing.length) break;
        const gaps = missing.map((proposal) => {
          const state = researchPolicy.readiness(shared.byAudience[proposal.audience], researchPolicy.target(session));
          return `${proposal.audience}: ${state.reasons.join(" ")}`;
        });
        const continued = await researchArticleEvidence({
    sessionId: session.id,
          topic: `${topic}. Fuentes comunes y específicas pendientes: ${gaps.join("; ")}. ${missing.map((proposal) => audienceBriefs[proposal.audience]).join("; ")}`,
          audience: requested.join(", "), audiences: requested, globalResearch: true,
          mode, minimumSources: Math.min(30, 2 + 2 * proposals.length), region: session.researchRegion || "MX", period: session.researchPeriod || "6m",
          searchPlatforms: researchPlatformsForSession(session), researchInstructions: researchInstructionsForSession(session),
          videoEvidence: session.videoResearch || session.sessionConfiguration?.videoResearch || null,
          ...researchContinuation(session.researchGlobal), signal
        });
        const priorCount = (session.researchGlobal?.sources || []).length;
        session.researchGlobal = mergeResearchDossiers(session.researchGlobal, continued);
        saveSessionResearchToCache(session);
        shared = await researchArticleEvidenceBundle({
        sessionId: session.id,
          topic, audiences: proposals.map((proposal) => proposal.audience), audienceBriefs,
          mode, minimumSources: researchPolicy.target(session), region: session.researchRegion || "MX", period: session.researchPeriod || "6m",
          searchPlatforms: researchPlatformsForSession(session), researchInstructions: researchInstructionsForSession(session),
          videoEvidence: session.videoResearch || session.sessionConfiguration?.videoResearch || null,
          existingGlobalDossier: session.researchGlobal, signal
        });
        Object.assign(session.researchByAudience, shared.byAudience);
        saveSessionResearchToCache(session);
        if ((session.researchGlobal?.sources || []).length === priorCount && !session.researchGlobal?.pendingCandidates?.length) break;
      }
      session.researchGlobal = shared.globalDossier;
      session.researchGlobal.selectionComplete = true;
      session.researchGlobalFingerprint = globalFingerprint;
      session.researchShared = null;
      Object.assign(session.researchByAudience, shared.byAudience);
      if (session.researchGlobal?.quotaLimited === true) {
        const error = new Error("Gemini alcanzó temporalmente la cuota de investigación. Reanuda cuando el servicio esté disponible.");
        error.status = 429;
        error.code = "marcie_research_quota";
        saveSessionResearchToCache(session);
        throw error;
      }
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      if (isResearchQuotaError(error)) {
        error.status = 429;
        error.code = "marcie_research_quota";
        saveSessionResearchToCache(session);
        throw error;
      }
      // Retry selection from the saved global dossier instead of starting audience searches.
      if (session.researchGlobal?.sources?.length && ([503, 504].includes(Number(error?.status)) || error?.code === "marcie_request_timeout")) throw error;
      console.warn("[MarcieResearch] No se completó la investigación global; se conserva el expediente parcial.", { code: error?.code, status: error?.status });
      session.researchGlobal = session.researchGlobal || { sources: [], facts: [], blockers: [error?.message || "La investigación global quedó incompleta."], verificationStatus: "blocked" };
    }
  }
  for (let index = 0; index < proposals.length; index += 1) {
    const proposal = proposals[index];
    const audience = proposal.audience;
    const sharedEvidenceCandidate = session.researchShared || Object.entries(session.researchByAudience || {}).find(([otherAudience, dossier]) =>
      otherAudience !== audience && Array.isArray(dossier?.sharedSourceIds) && dossier.sharedSourceIds.length >= 2
    )?.[1] || null;
    const sharedEvidence = sharedEvidenceCandidate ? {
      ...sharedEvidenceCandidate,
      sources: (sharedEvidenceCandidate.sources || []).filter((source) => sharedEvidenceCandidate.sharedSourceIds?.includes(String(source.id))),
      facts: (sharedEvidenceCandidate.facts || []).filter((fact) => fact.sourceIds?.some((id) => sharedEvidenceCandidate.sharedSourceIds?.includes(String(id))))
    } : null;
    if (typeof onResearchProgress === "function") {
      await onResearchProgress({ audience, proposal, index, total: proposals.length, researchByAudience: session.researchByAudience });
    }
    const audienceTopic = `${proposal.title || topic}. ${proposal.brief || proposal.angle || ""}`.trim();
    let dossier = session.researchByAudience[audience]
      || getResearchDossierFromCache(audienceTopic, audience)
      || getResearchDossierFromCache(topic, audience);
    dossier = applySharedEvidence(dossier || {}, sharedEvidence);
    dossier = globalBatch ? refreshResearchAnalysisStatus(dossier)
      : refreshResearchAnalysisStatus(assignEvidenceRoles(dossier, sharedEvidence?.sharedSourceIds || []));
    if (dossier?.researchFingerprint && dossier.researchFingerprint !== proposalResearchFingerprint(session, audience, proposal)) dossier = null;

    let cachedReady = dossier && researchPolicy.readiness(dossier, researchPolicy.target(session)).ready;
    if (!cachedReady) {
      const maxContinuations = sessionUsesAida(session)
        ? 0
        : Math.max(0, Math.min(1, Number(researchContinuations) || 0));
      let researchAttempts = 0;
      while (!cachedReady) {
        try {
          const incoming = await researchTopicForMode({
            session,
            topic: `${proposal.title || topic}. ${proposal.brief || proposal.angle || ""}`.trim(),
            audience,
            region: session.researchRegion || "MX",
            period: session.researchPeriod || "6m",
            ...researchContinuation(dossier),
            signal
          });
          if (globalBatch) {
            dossier = mergeAudienceSpecificEvidence(dossier, incoming, sharedEvidence?.sharedSourceIds || dossier?.sharedSourceIds || []);
          } else {
            dossier = (dossier?.sources || []).length ? mergeResearchDossiers(dossier, incoming) : incoming;
            dossier = refreshResearchAnalysisStatus(assignEvidenceRoles(applySharedEvidence(dossier, sharedEvidence), sharedEvidence?.sharedSourceIds || []));
          }
          cachedReady = researchPolicy.readiness(dossier, researchPolicy.target(session)).ready;
          saveResearchDossierToCache(audienceTopic, audience, dossier);
          saveResearchDossierToCache(topic, audience, dossier);
          researchAttempts += 1;
          if (cachedReady || dossier?.quotaLimited || researchAttempts > maxContinuations) break;
        } catch (error) {
          if (error?.name === "AbortError") throw error;
          session.researchByAudience[audience] = dossier || session.researchByAudience[audience] || {};
          saveSessionResearchToCache(session);
          throw error;
        }
      }
    } else {
      console.log(`[MarcieResearch] Reutilizando investigación documental en caché para ${audience}`);
    }
    const targetSourceCount = researchPolicy.target(session);
    dossier = globalBatch ? refreshResearchAnalysisStatus(dossier)
      : refreshResearchAnalysisStatus(assignEvidenceRoles(dossier, sharedEvidence?.sharedSourceIds || []));
    const readiness = researchPolicy.readiness(dossier, targetSourceCount);
    const verifiedSourceCount = readiness.count;
    dossier = { ...dossier, audience, targetSourceCount, verifiedSourceCount, verificationStatus: readiness.ready ? "verified" : "blocked", blockers: readiness.reasons };
    dossier.researchFingerprint = proposalResearchFingerprint(session, audience, proposal);
    session.researchByAudience[audience] = dossier;
    if (!session.researchShared && dossier.sharedSourceIds?.length >= 2) {
      session.researchShared = {
        sources: dossier.sources.filter((source) => dossier.sharedSourceIds.includes(String(source.id))),
        facts: (dossier.facts || []).filter((fact) => fact.sourceIds?.some((id) => dossier.sharedSourceIds.includes(String(id)))),
        analysis: { sourceIds: dossier.sharedSourceIds },
        sharedSourceIds: dossier.sharedSourceIds,
        sharedSourceTarget: dossier.sharedSourceTarget || 2,
        specificSourceTarget: dossier.specificSourceTarget || 2
      };
    }
    proposal.sourceIds = (dossier.sources || []).map((source) => String(source.id));
    proposal.researchStatus = dossier.verificationStatus;
    proposal.verifiedSourceCount = verifiedSourceCount;
    proposal.targetSourceCount = targetSourceCount;
    if (typeof onResearchProgress === "function") {
      await onResearchProgress({ audience, dossier, proposal, index, total: proposals.length, researchByAudience: session.researchByAudience });
    }
  }
  saveSessionResearchToCache(session);
  return { ...response, proposals, researchByAudience: session.researchByAudience, fallbackUsed: proposalGenerationFallback };
}

export async function reviewArticleForMode({ session = {}, article = null, blockIds = [] } = {}) {
  const target = article || session.article;
  const audience = target?.audience || session.audience;
  const material = JSON.stringify(target);
  const startingRevision = target?.revision || 0;
  const result = await reviewArticleForModeInternal({ session, article: target, blockIds });
  if (JSON.stringify(target) !== material || (session.articlesByAudience?.[audience] && (session.articlesByAudience[audience].revision || 0) !== startingRevision)) throw new Error("El artículo cambió durante la revisión. Vuelve a revisarlo.");
  const audit = { ...result, audience, articleRevision: target?.revision || 0 };
  delete audit.verifiedArticle;
  session.auditsByAudience = { ...session.auditsByAudience, [audience]: audit };
  if (session.audience === audience) session.audit = audit;
  return result;
}
async function reviewArticleForModeInternal({ session = {}, article = null, blockIds = [] } = {}) {
  const targetArticle = article || session.article || { title: session.title, blocks: [] };
  if (sessionUsesAida(session)) {
    return reviewAidaArticleWithGemini({
      article: targetArticle,
      blockIds,
      brandLine: session.editorialProfileSnapshot?.brandLine
    });
  }
  return reviewArticleWithGemini({ article: targetArticle, blockIds });
}
