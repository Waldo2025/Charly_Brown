export function hasCompleteArticle(article) {
  return Array.isArray(article?.blocks) && article.blocks.some((block) =>
    String(block?.text || "").trim() ||
    (Array.isArray(block?.items) && block.items.some((item) => String(typeof item === "string" ? item : item?.text || "").trim()))
  );
}

export function hasProposalsForAudiences(proposals, audienceIds) {
  return Array.isArray(proposals) && audienceIds.length > 0 &&
    audienceIds.every((id) => proposals.some((proposal) => proposal?.audience === id));
}

export function isTransientFetchError(error) {
  if (error?.name === "AbortError") return false;
  const message = String(error?.message || "").toLowerCase();
  return error instanceof TypeError && /failed to fetch|networkerror|network request failed|load failed/.test(message);
}

export async function retryTransientFetch(operation, { wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), delayMs = 1500 } = {}) {
  try {
    return await operation();
  } catch (error) {
    if (!isTransientFetchError(error)) throw error;
    await wait(delayMs);
    return operation();
  }
}
