import {
  draftArticleWithGemini,
  generateProposalsWithGemini,
  refineBlogTopicWithGemini,
  reviewArticleWithGemini,
  searchTrendsWithGemini
} from "./marcie-gemini-service.js";
import {
  draftAidaArticleWithGemini,
  generateAidaProposalsWithGemini,
  refineAidaTopicWithGemini,
  researchAidaTopicWithGemini,
  reviewAidaArticleWithGemini
} from "./marcie-aida-service.js";

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
      minimumSources: Number(session.editorialProfileSnapshot?.minimumSources || 8)
    });
  }
  const result = await searchTrendsWithGemini({ topic, country: region || country || "MX", period });
  return { ...result, editorialMode: String(session.editorialMode || "marcie"), modeUsed: "marcie", resultType: "trend_analysis" };
}

export async function draftArticleForMode({ session = {}, title = "", topic = "", audience = "educators", brief = "" } = {}) {
  const mode = String(session.editorialMode || "marcie");
  const profile = session.editorialProfileSnapshot || {};
  if (mode === "aida") {
    return draftAidaArticleWithGemini({
      title, topic, audience, brief,
      brandLine: profile.brandLine,
      customRules: profile,
      researchDossier: session.trends?.[0] || null,
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
        researchDossier: session.trends?.[0] || null,
        region: session.researchRegion || "MX",
        period: session.researchPeriod || "6m"
      });
    }
    return draftArticleWithGemini({ title, topic, audience, brief: hybridBrief, editorialMode: "custom", verifyEvidence: false });
  }
  return draftArticleWithGemini({ title, topic, audience, brief, editorialMode: "marcie", verifyEvidence: false });
}

const AUDIENCE_LABELS = {
  educators: "Docentes y directivos",
  parents: "Padres y tutores",
  students: "Estudiantes",
  coordinators: "Coordinadores académicos"
};

export async function generateProposalsForMode({ session = {}, topic = "", signals = [] } = {}) {
  const mode = String(session.editorialMode || "marcie");
  if (sessionUsesAida(session)) {
    return generateAidaProposalsWithGemini({ session, topic, signals, dossier: session.trends?.[0] || null });
  }
  const extra = mode === "aida"
    ? "Aplica la estructura Aida, abre con una escena y plantea una idea central fiel al tema. Añade hechos científicos relacionados y evolución histórica solo cuando sean pertinentes y tengan evidencia."
    : mode === "custom" ? buildCustomEditorialBrief(session.editorialProfileSnapshot || {}) : "";
  const response = await generateProposalsWithGemini({ topic, signals: [...signals, extra].filter(Boolean) });
  const requested = Array.isArray(session.selectedAudiences) && session.selectedAudiences.length
    ? session.selectedAudiences
    : ["educators", "students", "parents"];
  const source = Array.isArray(response?.proposals) ? response.proposals : [];
  const proposals = requested.map((audience, index) => {
    const exact = source.find((item) => item.audience === audience);
    const fallback = source[index % Math.max(1, source.length)] || {};
    return {
      ...fallback,
      ...exact,
      audience,
      audienceLabel: AUDIENCE_LABELS[audience] || audience,
      title: exact?.title || fallback.title || topic,
      brief: `${exact?.brief || fallback.brief || fallback.angle || ""}${extra ? `\n${extra}` : ""}`.trim()
    };
  });
  return { ...response, proposals };
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
