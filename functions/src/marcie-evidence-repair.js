function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function unresolvedClaims(article = {}) {
  return (Array.isArray(article.articleClaims) ? article.articleClaims : [])
    .filter((claim) => claim && claim.status !== "supported" && String(claim.text || claim.claim || "").trim());
}

function selectEvidenceClaim(article = {}, requestedId = "", requestText = "") {
  const claims = unresolvedClaims(article);
  if (requestedId) return claims.find((claim) => String(claim.id) === String(requestedId)) || null;
  const query = normalize(requestText);
  const mentioned = claims.filter((claim) => {
    const text = normalize(claim.text || claim.claim);
    return text.length > 20 && (query.includes(text) || query.includes(text.slice(0, 60)));
  });
  return mentioned.length === 1 ? mentioned[0] : claims.length === 1 ? claims[0] : null;
}

function findClaimBlock(article = {}, claim = {}) {
  const blocks = Array.isArray(article.blocks) ? article.blocks : [];
  const claimText = String(claim.text || claim.claim || "").trim();
  if (!claimText) return null;
  const pattern = new RegExp(claimText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"), "i");
  const indexed = blocks.map((block, index) => ({ block, index, match: pattern.exec(String(block?.text || "")) }));
  return indexed.find((entry) => entry.match && claim.blockId && String(entry.block.id) === String(claim.blockId))
    || indexed.find((entry) => entry.match)
    || null;
}

function pendingArticle(article, blocks, sources = null) {
  const preview = {
    ...article,
    blocks,
    articleClaims: [],
    evidenceLinks: [],
    verification: { status: "pending", coverage: 0, blockers: [], contradictions: [], verifiedAt: "", contentHash: "" }
  };
  delete preview.approval;
  if (sources) {
    preview.sources = sources;
    preview.researchSources = sources;
  }
  return preview;
}

function mergeVerifiedSources(article = {}, verified = {}) {
  const found = new Map();
  const add = (source, existing = false) => {
    if (!source?.id) return;
    if (source.verificationStatus === "verified" && !existing) {
      found.set(String(source.id), source);
    } else if ((existing || source.sourceType === "youtube_video") && !found.has(String(source.id))) {
      found.set(String(source.id), source);
    }
  };
  [...(article.researchSources || []), ...(article.sources || [])].forEach((source) => add(source, true));
  [...(verified.researchSources || []), ...(verified.sources || [])].forEach((source) => add(source));
  return [...found.values()];
}

function buildEvidenceRepairPreview(article = {}, claim = {}, verified = null) {
  const target = findClaimBlock(article, claim);
  if (!target) return null;
  const claimText = String(claim.text || claim.claim || "").trim();
  const text = String(target.block.text || "");
  const sources = verified ? mergeVerifiedSources(article, verified) : null;
  const sourcesById = new Map((sources || []).map((source) => [String(source.id), source]));
  const updatedClaim = (verified?.articleClaims || []).find((item) => normalize(item.text || item.claim) === normalize(claimText));
  const documentIds = (updatedClaim?.sourceIds || []).map(String)
    .filter((id) => sourcesById.get(id)?.verificationStatus === "verified" && sourcesById.get(id)?.sourceType !== "youtube_video");
  const textWithoutCitation = text.replace(/\s*\[youtube-[^\]]+\]\s*/gi, " ").trim();
  const isolatedClaim = normalize(textWithoutCitation) === normalize(claimText);

  if (updatedClaim?.status === "supported" && documentIds.length && isolatedClaim) {
    const revisedBlock = {
      ...target.block,
      text: claimText.replace(/\s*\[youtube-[^\]]+\]\s*/gi, " ").trim(),
      sourceIds: documentIds,
      referenceIds: (target.block.referenceIds || []).filter((id) => !String(id).startsWith("youtube-"))
    };
    const blocks = article.blocks.map((block, index) => index === target.index ? revisedBlock : block);
    const preview = pendingArticle(article, blocks, sources);
    preview.usedSources = sources.filter((source) => documentIds.includes(String(source.id)) || (article.usedSources || []).some((used) => String(used.id) === String(source.id)));
    preview.usedSourceIds = [...new Set([...(article.usedSourceIds || []).filter((id) => !String(id).startsWith("youtube-")), ...documentIds])];
    return { preview, resolution: "documented", documentIds, finding: `La afirmación ahora se vincula a ${documentIds.length} documento(s) verificado(s); al aplicar, se volverá a comprobar el artículo.` };
  }

  // Sin respaldo documental no hay una corrección segura que proponer:
  // el texto conserva su autoría y su estado de evidencia pendiente.
  return null;
}

function autoRepairEvidence(article = {}) {
  // Una falta de verificación no autoriza a borrar prosa ni secciones del autor.
  // Las afirmaciones y citas pendientes permanecen visibles y bloquean la aprobación.
  return { article, changed: false, corrections: [] };
}

module.exports = { unresolvedClaims, selectEvidenceClaim, buildEvidenceRepairPreview, autoRepairEvidence };
