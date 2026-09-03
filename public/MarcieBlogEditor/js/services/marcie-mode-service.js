import {
  draftArticleWithGemini,
  generateProposalsWithGemini,
  refineBlogTopicWithGemini,
  reviewArticleWithGemini
} from "./marcie-gemini-service.js?v=20260831r6";
import {
  draftAidaArticleWithGemini,
  generateAidaProposalsWithGemini,
  refineAidaTopicWithGemini,
  researchAidaTopicWithGemini,
  reviewAidaArticleWithGemini
} from "./marcie-aida-service.js?v=20260831r5";

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

export async function refineTopicForMode({ editorialMode = "marcie", editorialProfileSnapshot = {}, topic = "", specifications = [] } = {}) {
  if (String(editorialMode).toLowerCase() === "aida" || (String(editorialMode).toLowerCase() === "custom" && String(editorialProfileSnapshot?.structure || "").toLowerCase() === "aida")) {
    return refineAidaTopicWithGemini({ topic, specifications });
  }
  return refineBlogTopicWithGemini({ topic, specifications });
}

export async function researchTopicForMode({ session = {}, topic = "", region = "MX", country = "MX", period = "6m", audience = "" } = {}) {
  if (sessionUsesAida(session)) {
    return researchAidaTopicWithGemini({
      topic,
      audience: audience || session.audience || session.selectedAudiences?.[0] || "parents",
      region: region || country || "MX",
      period,
      minimumSources: 6
    });
  }
  return researchArticleEvidence({
    topic,
    audience: audience || session.audience || session.selectedAudiences?.[0] || "educators",
    mode: String(session.editorialMode || "marcie"),
    minimumSources: 6,
    region: region || country || "MX",
    period
  });
}

export async function draftArticleForMode({ session = {}, title = "", topic = "", audience = "educators", brief = "" } = {}) {
  const mode = String(session.editorialMode || "marcie");
  const profile = session.editorialProfileSnapshot || {};
  const researchDossier = await ensureAudienceResearchForDraft({ session, title, topic, audience, brief });
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
    return draftArticleWithGemini({ title, topic, audience, brief: hybridBrief, editorialMode: "custom", verifyEvidence: false, researchDossier });
  }
  return draftArticleWithGemini({ title, topic, audience, brief, editorialMode: "marcie", verifyEvidence: false, researchDossier });
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
  const existingMap = session.researchByAudience && typeof session.researchByAudience === "object" ? session.researchByAudience : {};
  if (Object.prototype.hasOwnProperty.call(existingMap, normalizedAudience)) return existingMap[normalizedAudience];
  let dossier;
  try {
    dossier = await researchTopicForMode({
      session,
      topic: `${title || topic}. ${brief || ""}`.trim(),
      audience: normalizedAudience,
      region: session.researchRegion || "MX",
      period: session.researchPeriod || "6m"
    });
  } catch (error) {
    dossier = { sources: [], attributedReferences: [], verifiedSourceCount: 0, blockers: [error.message || "No se pudo completar la investigación."] };
  }
  const verifiedSourceCount = Number(dossier.verifiedSourceCount || dossier.sources?.length || 0);
  const normalizedDossier = { ...dossier, audience: normalizedAudience, verifiedSourceCount, targetSourceCount: 6, verificationStatus: verifiedSourceCount >= 6 ? "verified" : "incomplete" };
  session.researchByAudience = { ...existingMap, [normalizedAudience]: normalizedDossier };
  session.proposals = Array.isArray(session.proposals) ? [...session.proposals] : [];
  let proposal = session.proposals.find((item) => String(item?.audience || "").toLowerCase() === normalizedAudience);
  if (!proposal) {
    proposal = { id: `manual-${normalizedAudience}`, audience: normalizedAudience, audienceLabel: AUDIENCE_LABELS[normalizedAudience] || normalizedAudience, title: title || topic, angle: brief || "Enfoque editorial manual", brief: brief || "Propuesta creada desde la redacción manual.", origin: "manual" };
    session.proposals.push(proposal);
  }
  Object.assign(proposal, { sourceIds: (normalizedDossier.sources || []).map((source) => String(source.id)), researchStatus: normalizedDossier.verificationStatus, verifiedSourceCount, targetSourceCount: 6 });
  return normalizedDossier;
}

export async function generateProposalsForMode({ session = {}, topic = "", signals = [], onResearchProgress = null } = {}) {
  const mode = String(session.editorialMode || "marcie");
  let response;
  if (sessionUsesAida(session)) {
    response = await generateAidaProposalsWithGemini({ session, topic, signals, dossier: session.trends?.[0] || null });
  } else {
    const extra = mode === "aida"
      ? "Aplica la estructura Aida, abre con una escena y plantea una idea central fiel al tema. Añade hechos científicos relacionados y evolución histórica solo cuando sean pertinentes y tengan evidencia."
      : mode === "custom" ? buildCustomEditorialBrief(session.editorialProfileSnapshot || {}) : "";
    response = await generateProposalsWithGemini({ topic, signals: [...signals, extra].filter(Boolean) });
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
  session.researchByAudience = session.researchByAudience && typeof session.researchByAudience === "object" ? { ...session.researchByAudience } : {};
  session.proposals = proposals;
  for (let index = 0; index < proposals.length; index += 1) {
    const proposal = proposals[index];
    const audience = proposal.audience;
    let dossier;
    try {
      dossier = await researchTopicForMode({
        session,
        topic: `${proposal.title || topic}. ${proposal.brief || proposal.angle || ""}`.trim(),
        audience,
        region: session.researchRegion || "MX",
        period: session.researchPeriod || "6m"
      });
    } catch (error) {
      dossier = { sources: [], attributedReferences: [], verifiedSourceCount: 0, targetSourceCount: 6, verificationStatus: "blocked", blockers: [error.message || "No se pudo completar la investigación."] };
    }
    const verifiedSourceCount = Number(dossier.verifiedSourceCount || dossier.sources?.length || 0);
    const targetSourceCount = 6;
    dossier = { ...dossier, audience, targetSourceCount, verifiedSourceCount, verificationStatus: verifiedSourceCount >= targetSourceCount ? "verified" : "incomplete" };
    session.researchByAudience[audience] = dossier;
    proposal.sourceIds = (dossier.sources || []).map((source) => String(source.id));
    proposal.researchStatus = dossier.verificationStatus;
    proposal.verifiedSourceCount = verifiedSourceCount;
    proposal.targetSourceCount = targetSourceCount;
    if (typeof onResearchProgress === "function") {
      await onResearchProgress({ audience, dossier, proposal, index, total: proposals.length, researchByAudience: session.researchByAudience });
    }
  }
  return { ...response, proposals, researchByAudience: session.researchByAudience };
}

export async function reviewArticleForMode({ session = {}, article = null } = {}) {
  const targetArticle = article || session.article || { title: session.title, blocks: [] };
  if (sessionUsesAida(session)) {
    return reviewAidaArticleWithGemini({
      article: targetArticle,
      brandLine: session.editorialProfileSnapshot?.brandLine
    });
  }
  return reviewArticleWithGemini({ article: targetArticle });
}
