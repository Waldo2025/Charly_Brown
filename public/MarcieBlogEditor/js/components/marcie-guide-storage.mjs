const MAX_SNAPSHOT_LENGTH = 32_000;

function shortText(value, length = 400) {
  return String(value || "").slice(0, length);
}

function compactAudienceMap(value) {
  return Object.fromEntries(Object.entries(value || {}).slice(0, 10).map(([audience, entry]) => [
    shortText(audience, 120),
    Array.isArray(entry) ? entry.slice(0, 20).map((item) => shortText(item, 200)) : shortText(entry, 200)
  ]));
}

export function compactGuideResponse(response) {
  if (!response || typeof response !== "object") return null;
  const configuration = response.configuration || {};
  const prompt = response.uiPrompt || {};
  const videoResearch = response.videoResearch || configuration.videoResearch || {};
  return {
    phase: shortText(response.phase, 80),
    runStatus: shortText(response.runStatus, 80),
    uiPrompt: {
      type: shortText(prompt.type, 80),
      question: shortText(prompt.question, 500),
      options: (Array.isArray(prompt.options) ? prompt.options : []).slice(0, 30).map((option) => ({
        id: shortText(option.id, 120), label: shortText(option.label, 300),
        value: shortText(option.value, 300), action: shortText(option.action, 80),
        kind: shortText(option.kind, 40), selected: Boolean(option.selected)
      }))
    },
    configuration: {
      topic: shortText(configuration.topic, 500),
      sourceMode: shortText(configuration.sourceMode, 80),
      sourceInputs: { youtube: (configuration.sourceInputs?.youtube || []).slice(0, 5).map((video) => ({
        videoId: shortText(video.videoId, 80), url: shortText(video.url, 500)
      })) },
      selectedAudiences: (configuration.selectedAudiences || []).slice(0, 10).map((item) => shortText(item, 120)),
      tone: shortText(configuration.tone, 200),
      extensionsByAudience: compactAudienceMap(configuration.extensionsByAudience),
      searchPlatforms: (configuration.searchPlatforms || []).slice(0, 20).map((item) => shortText(item, 80)),
      specialSources: (configuration.specialSources || []).slice(0, 20).map((item) => shortText(item, 200)),
      resourcesByAudience: compactAudienceMap(configuration.resourcesByAudience),
      resources: (configuration.resources || []).slice(0, 20).map((item) => shortText(item, 200)),
      preferredVocabulary: (configuration.preferredVocabulary || []).slice(0, 30).map((item) => shortText(item, 200))
    },
    videoResearch: {
      videos: (Array.isArray(videoResearch.videos) ? videoResearch.videos : []).slice(0, 5).map((video) => ({
        title: shortText(video.title, 300), channel: shortText(video.channel, 150), summary: shortText(video.summary, 600)
      })),
      warnings: (videoResearch.warnings || []).slice(0, 5).map((item) => shortText(item, 300))
    }
  };
}

export function createGuideSnapshot({ runId, targetSessionId = "", responseState, messages, input, phase, updatedAt = Date.now() }) {
  const snapshot = {
    runId: shortText(runId, 200),
    targetSessionId: shortText(targetSessionId, 200),
    responseState: compactGuideResponse(responseState),
    messages: (Array.isArray(messages) ? messages : []).filter((item) =>
      (item?.role === "user" || item?.role === "assistant") && !item.queued
    ).slice(-16).map((item) => ({ role: item.role, text: shortText(item.text, 1200) })),
    input: shortText(input, 4000),
    phase: shortText(phase, 80),
    updatedAt
  };
  while (JSON.stringify(snapshot).length > MAX_SNAPSHOT_LENGTH && snapshot.messages.length) snapshot.messages.shift();
  if (JSON.stringify(snapshot).length > MAX_SNAPSHOT_LENGTH && snapshot.responseState) {
    snapshot.responseState.videoResearch = { videos: [], warnings: [] };
  }
  return snapshot;
}

export function saveGuideSnapshot(storage, key, snapshot) {
  try {
    storage.setItem(key, JSON.stringify(snapshot));
    return true;
  } catch (error) {
    if (error?.name !== "QuotaExceededError") return false;
    const smaller = { ...snapshot, messages: snapshot.messages.slice(-3), input: shortText(snapshot.input, 500) };
    try {
      storage.setItem(key, JSON.stringify(smaller));
      return true;
    } catch (_) {
      return false;
    }
  }
}

export function saveGuideWithFallback(localStorage, sessionStorage, key, snapshot, mode = "local") {
  if (mode === "memory") return "memory";
  if (mode === "local" && saveGuideSnapshot(localStorage, key, snapshot)) return "local";
  return saveGuideSnapshot(sessionStorage, key, snapshot) ? "session" : "memory";
}
