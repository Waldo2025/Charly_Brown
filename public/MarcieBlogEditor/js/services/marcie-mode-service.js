import "../contracts/marcie-research-policy.js?v=20260922r1";
import { listMarciePromptProfiles } from "./marcie-prompt-settings.js";
import { buildEditorialVocabularyInstruction, normalizeEditorialVocabulary } from "./marcie-vocabulary.js";
import {
  getResearchDossierFromCache,
  saveResearchDossierToCache,
  saveSessionResearchToCache,
  restoreSessionResearchFromCache
} from "./marcie-research-cache.js";
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
  generateProposalsWithGemini,
  refineBlogTopicWithGemini,
  reviewArticleWithGemini
} from "./marcie-gemini-service.js?v=20260922r3";
import {
  AIDA_LEGACY_BRAND_LINE,
  draftAidaArticleWithGemini,
  generateAidaProposalsWithGemini,
  refineAidaTopicWithGemini,
  researchAidaTopicWithGemini,
  reviewAidaArticleWithGemini
} from "./marcie-aida-service.js?v=20260922r3";

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

export async function researchTopicForMode({ session = {}, topic = "", region = "MX", country = "MX", period = "6m", audience = "" } = {}) {
  const researchInstructions = researchInstructionsForSession(session);
  if (sessionUsesAida(session)) {
    return researchAidaTopicWithGemini({
      topic,
      audience: audience || session.audience || session.selectedAudiences?.[0] || "parents",
      region: region || country || "MX",
      period,
      minimumSources: researchPolicy.target(session),
      researchInstructions,
      searchPlatforms: session.searchPlatforms ?? session.sessionConfiguration?.searchPlatforms,
      videoEvidence: session.videoResearch || session.sessionConfiguration?.videoResearch || null
    });
  }
  return researchArticleEvidence({
    topic,
    audience: audience || session.audience || session.selectedAudiences?.[0] || "educators",
    mode: String(session.editorialMode || "marcie"),
    researchInstructions,
    searchPlatforms: session.searchPlatforms ?? session.sessionConfiguration?.searchPlatforms,
    minimumSources: researchPolicy.target(session),
    region: region || country || "MX",
    period,
    videoEvidence: session.videoResearch || session.sessionConfiguration?.videoResearch || null
  });
}

const draftJobs = new Map();
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
    if (!isAutomated && (session.audience !== activeAudience || (session.articlesByAudience?.[audience]?.revision || 0) !== revision || researchPolicy.fingerprint(session, audience) !== configuration)) {
      throw new Error("El contenido cambió durante la redacción. Se conservaron las ediciones.");
    }
    result.revision = revision + 1;
    result.audience = audience;
    result.preferredVocabulary = normalizeEditorialVocabulary(session.preferredVocabulary || session.sessionConfiguration?.preferredVocabulary || []);
    return result;
  } finally { draftJobs.delete(key); }
}
async function draftArticleForModeInternal({ session = {}, title = "", topic = "", audience = "educators", brief = "" } = {}) {
  const vocabularyInstruction = buildEditorialVocabularyInstruction(session.preferredVocabulary || session.sessionConfiguration?.preferredVocabulary || []);
  const editorialBrief = [brief, ...(session.specifications || []), vocabularyInstruction].filter(Boolean).join("\n");
  const promptProfileId = session.sessionConfiguration?.promptProfileId || session.automation?.promptProfileId;
  const promptOverrides = listMarciePromptProfiles().find(profile => profile.id === promptProfileId)?.prompts || null;
  const mode = String(session.editorialMode || "marcie");
  const profile = session.editorialProfileSnapshot || {};
  const researchDossier = await ensureAudienceResearchForDraft({ session, title, topic, audience, brief });
  brief = editorialBrief;
  if (mode === "aida") {
    return draftAidaArticleWithGemini({
      title, topic, audience, brief,
      brandLine: profile.brandLine,
      customRules: profile,
      researchDossier,
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
        researchDossier,
        region: session.researchRegion || "MX",
        period: session.researchPeriod || "6m"
      });
    }
    return draftArticleWithGemini({ title, topic, audience, brief: hybridBrief, editorialMode: "custom", verifyEvidence: false, researchDossier, promptOverrides });
  }
  return draftArticleWithGemini({ title, topic, audience, brief, editorialMode: "marcie", verifyEvidence: false, researchDossier, promptOverrides });
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

async function ensureAudienceResearchForDraft({ session = {}, title = "", topic = "", audience = "educators", brief = "" } = {}) {
  const normalizedAudience = String(audience || "educators").toLowerCase();
  restoreSessionResearchFromCache(session);
  const existingMap = session.researchByAudience && typeof session.researchByAudience === "object" ? session.researchByAudience : {};
  let cached = existingMap[normalizedAudience];
  if (!cached || !Array.isArray(cached.sources) || !cached.sources.length) {
    cached = getResearchDossierFromCache(title || topic, normalizedAudience)
      || getResearchDossierFromCache(topic, normalizedAudience);
  }
  const hasVerifiedSources = Array.isArray(cached?.sources) && cached.sources.some((source) => source?.verificationStatus === "verified" && source?.sourceType !== "youtube_video");
  if (cached && (hasVerifiedSources || cached.verificationStatus === "verified")) {
    session.researchByAudience = { ...existingMap, [normalizedAudience]: cached };
    saveResearchDossierToCache(title || topic, normalizedAudience, cached);
    return cached;
  }
  const fingerprint = researchPolicy.fingerprint(session, normalizedAudience, { title: title || topic, brief, researchInstructions: researchInstructionsForSession(session) });
  if (cached?.researchFingerprint === fingerprint && researchPolicy.readiness(cached, researchPolicy.target(session)).ready) return cached;
  let dossier;
  try {
    dossier = await researchTopicForMode({
      session,
      topic: `${title || topic}. ${brief || ""}`.trim(),
      audience: normalizedAudience,
      region: session.researchRegion || "MX",
      period: session.researchPeriod || "6m"
    });
    saveResearchDossierToCache(title || topic, normalizedAudience, dossier);
    saveResearchDossierToCache(topic, normalizedAudience, dossier);
  } catch (error) {
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
  return normalizedDossier;
}

export async function generateProposalsForMode({ session = {}, topic = "", signals = [], onResearchProgress = null } = {}) {
  const mode = String(session.editorialMode || "marcie");
  const vocabularyInstruction = buildEditorialVocabularyInstruction(session.preferredVocabulary || session.sessionConfiguration?.preferredVocabulary || []);
  const enrichedSignals = [...signals, vocabularyInstruction].filter(Boolean);
  let response;
  if (sessionUsesAida(session)) {
    response = await generateAidaProposalsWithGemini({ session, topic, signals: enrichedSignals, dossier: session.trends?.[0] || null });
  } else {
    const extra = mode === "aida"
      ? "Aplica la estructura Aida, abre con una escena y plantea una idea central fiel al tema. Añade hechos científicos relacionados y evolución histórica solo cuando sean pertinentes y tengan evidencia."
      : mode === "custom" ? buildCustomEditorialBrief(session.editorialProfileSnapshot || {}) : "";
    response = await generateProposalsWithGemini({ topic, signals: [...enrichedSignals, extra].filter(Boolean) });
  }
  const extra = mode === "custom" ? buildCustomEditorialBrief(session.editorialProfileSnapshot || {}) : "";
  const requested = Array.isArray(session.selectedAudiences) && session.selectedAudiences.length
    ? session.selectedAudiences
    : ["educators", "students", "parents", "coordinators"];
  const source = Array.isArray(response?.proposals) ? response.proposals : [];
  const proposals = requested.map((audience) => {
    const normalizedAudience = String(audience).toLowerCase();
    const exact = source.find((item) => String(item?.audience || "").toLowerCase() === normalizedAudience);
    const fallback = AUDIENCE_PROPOSAL_FALLBACKS[normalizedAudience] || {
      title: topic,
      angle: "Enfoque editorial específico para la audiencia",
      brief: `Una propuesta sobre ${topic} adaptada a ${AUDIENCE_LABELS[normalizedAudience] || normalizedAudience}.`
    };
    return {
      ...fallback,
      ...exact,
      audience: normalizedAudience,
      audienceLabel: AUDIENCE_LABELS[normalizedAudience] || normalizedAudience,
      title: exact?.title || fallback.title || topic,
      angle: exact?.angle || fallback.angle,
      brief: `${exact?.brief || fallback.brief || fallback.angle || ""}${extra ? `\n${extra}` : ""}`.trim()
    };
  });
  restoreSessionResearchFromCache(session);
  session.researchByAudience = session.researchByAudience && typeof session.researchByAudience === "object" ? { ...session.researchByAudience } : {};
  session.proposals = proposals;
  for (let index = 0; index < proposals.length; index += 1) {
    const proposal = proposals[index];
    const audience = proposal.audience;
    if (typeof onResearchProgress === "function") {
      await onResearchProgress({ audience, proposal, index, total: proposals.length, researchByAudience: session.researchByAudience });
    }
    const audienceTopic = `${proposal.title || topic}. ${proposal.brief || proposal.angle || ""}`.trim();
    let dossier = session.researchByAudience[audience]
      || getResearchDossierFromCache(audienceTopic, audience)
      || getResearchDossierFromCache(topic, audience);

    const hasCachedSources = Array.isArray(dossier?.sources) && dossier.sources.some((source) => source?.verificationStatus === "verified" && source?.sourceType !== "youtube_video");
    if (!hasCachedSources) {
      try {
        dossier = await researchTopicForMode({
          session,
          topic: `${proposal.title || topic}. ${proposal.brief || proposal.angle || ""}`.trim(),
          audience,
          region: session.researchRegion || "MX",
          period: session.researchPeriod || "6m"
        });
        saveResearchDossierToCache(audienceTopic, audience, dossier);
        saveResearchDossierToCache(topic, audience, dossier);
      } catch (error) {
        dossier = { sources: [], attributedReferences: [], verifiedSourceCount: 0, targetSourceCount: researchPolicy.target(session), verificationStatus: "blocked", blockers: [error.message || "No se pudo completar la investigación."] };
      }
    } else {
      console.log(`[MarcieResearch] Reutilizando investigación documental en caché para ${audience}`);
    }
    const targetSourceCount = researchPolicy.target(session);
    const readiness = researchPolicy.readiness(dossier, targetSourceCount);
    const verifiedSourceCount = readiness.count;
    dossier = { ...dossier, audience, targetSourceCount, verifiedSourceCount, verificationStatus: readiness.ready ? "verified" : "blocked", blockers: readiness.reasons };
    dossier.researchFingerprint = researchPolicy.fingerprint(session, audience, { title: proposal.title || topic, brief: proposal.brief || proposal.angle || "", researchInstructions: researchInstructionsForSession(session) });
    session.researchByAudience[audience] = dossier;
    proposal.sourceIds = (dossier.sources || []).map((source) => String(source.id));
    proposal.researchStatus = dossier.verificationStatus;
    proposal.verifiedSourceCount = verifiedSourceCount;
    proposal.targetSourceCount = targetSourceCount;
    if (typeof onResearchProgress === "function") {
      await onResearchProgress({ audience, dossier, proposal, index, total: proposals.length, researchByAudience: session.researchByAudience });
    }
  }
  saveSessionResearchToCache(session);
  return { ...response, proposals, researchByAudience: session.researchByAudience };
}

export async function reviewArticleForMode({ session = {}, article = null } = {}) {
  const target = article || session.article;
  const audience = target?.audience || session.audience;
  const activeAudience = session.audience;
  const material = JSON.stringify(target);
  const result = await reviewArticleForModeInternal({ session, article: target });
  if (JSON.stringify(target) !== material || session.audience !== activeAudience) throw new Error("El artículo cambió durante la revisión. Vuelve a revisarlo.");
  const audit = { ...result, audience, articleRevision: target?.revision || 0 };
  delete audit.verifiedArticle;
  session.auditsByAudience = { ...session.auditsByAudience, [audience]: audit };
  if (session.audience === audience) session.audit = audit;
  return result;
}
async function reviewArticleForModeInternal({ session = {}, article = null } = {}) {
  const targetArticle = article || session.article || { title: session.title, blocks: [] };
  if (sessionUsesAida(session)) {
    return reviewAidaArticleWithGemini({
      article: targetArticle,
      brandLine: session.editorialProfileSnapshot?.brandLine
    });
  }
  return reviewArticleWithGemini({ article: targetArticle });
}
