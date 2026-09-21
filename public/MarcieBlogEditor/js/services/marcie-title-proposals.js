const AUDIENCE_KEYS = Object.freeze(["students", "parents", "educators", "coordinators"]);

function cleanProposal(item, fallbackLabel) {
  const title = String(item?.title || item || "").trim();
  if (!title) return null;
  return {
    title,
    rationale: String(item?.rationale || fallbackLabel || "").trim()
  };
}

export function normalizeAudienceTitleProposals(value = {}) {
  const hooks = (Array.isArray(value?.hooks) ? value.hooks : value?.hookTitles || [])
    .map((item) => cleanProposal(item, "Título con gancho"))
    .filter(Boolean)
    .slice(0, 3);
  const contrahooks = (Array.isArray(value?.contrahooks) ? value.contrahooks : value?.contrahookTitles || [])
    .map((item) => cleanProposal(item, "Título con contrapunto"))
    .filter(Boolean)
    .slice(0, 3);
  return { topic: String(value?.topic || "").trim(), hooks, contrahooks };
}

export function normalizeTitleProposalsByAudience(value = {}) {
  const source = value?.byAudience && typeof value.byAudience === "object"
    ? value.byAudience
    : ((value?.hooks?.length || value?.contrahooks?.length || value?.hookTitles?.length || value?.contrahookTitles?.length) ? { all: value } : {});
  const byAudience = {};
  for (const audience of ["all", ...AUDIENCE_KEYS]) {
    const normalized = normalizeAudienceTitleProposals(source[audience]);
    if (normalized.hooks.length || normalized.contrahooks.length) byAudience[audience] = normalized;
  }
  return byAudience;
}

export function titleProposalsForAudience(byAudience = {}, audience = "all") {
  return normalizeAudienceTitleProposals(byAudience?.[audience] || (audience !== "all" ? byAudience?.all : {}));
}

export function hasTitleProposals(byAudience = {}) {
  return Object.values(byAudience || {}).some((value) => {
    const normalized = normalizeAudienceTitleProposals(value);
    return normalized.hooks.length || normalized.contrahooks.length;
  });
}

export function serializeTitleProposals(byAudience = {}) {
  const normalized = normalizeTitleProposalsByAudience({ byAudience });
  return hasTitleProposals(normalized) ? { schemaVersion: 2, byAudience: normalized } : null;
}
