function shouldContinueVariantFallback(options = {}) {
  const status = Number(options.status || 0);
  const reason = String(options.reason || "").trim().toLowerCase();
  const variantIndex = Math.max(0, Math.floor(Number(options.variantIndex || 0) || 0));
  const variantCount = Math.max(0, Math.floor(Number(options.variantCount || 0) || 0));
  const remainingVariants = Math.max(0, variantCount - variantIndex - 1);
  const isDoneWithoutMedia = status === 502 && reason === "done_without_media";
  const continueCurrentModel = isDoneWithoutMedia && remainingVariants > 0;
  const logReason = isDoneWithoutMedia
    ? (continueCurrentModel
      ? "operation completed without media; trying next variant"
      : "operation completed without media; no variants remain")
    : "non-recoverable variant failure";

  return {
    continueCurrentModel,
    remainingVariants,
    logReason
  };
}

module.exports = {
  shouldContinueVariantFallback
};
