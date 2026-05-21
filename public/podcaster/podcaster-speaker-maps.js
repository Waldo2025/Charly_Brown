function requireFunction(fn, name = "") {
  if (typeof fn !== "function") {
    throw new TypeError(`${name} is not a function`);
  }
  return fn;
}

export function buildSpeakerMapsForHosts(hosts = [], session = null, snapshots = {}, deps = {}) {
  const getSpeakerVoiceMap = requireFunction(deps.getSpeakerVoiceMap, "getSpeakerVoiceMap");
  const getSpeakerExpressionMap = requireFunction(deps.getSpeakerExpressionMap, "getSpeakerExpressionMap");
  const getSpeakerNameMap = requireFunction(deps.getSpeakerNameMap, "getSpeakerNameMap");
  const getSpeakerScenarioMap = requireFunction(deps.getSpeakerScenarioMap, "getSpeakerScenarioMap");
  const normalizeLiveVoiceName = requireFunction(deps.normalizeLiveVoiceName, "normalizeLiveVoiceName");
  const resolveSpeakerVoiceName = requireFunction(deps.resolveSpeakerVoiceName, "resolveSpeakerVoiceName");
  const rewriteScenarioPromptForEducationalVideo = requireFunction(
    deps.rewriteScenarioPromptForEducationalVideo,
    "rewriteScenarioPromptForEducationalVideo"
  );
  const expressions = Array.isArray(deps.EXPRESSIONS) ? deps.EXPRESSIONS : [];
  const defaultSpeakerNameMap = deps.DEFAULT_SPEAKER_NAME_MAP && typeof deps.DEFAULT_SPEAKER_NAME_MAP === "object"
    ? deps.DEFAULT_SPEAKER_NAME_MAP
    : {};
  const defaultSpeakerScenarioMap = deps.DEFAULT_SPEAKER_SCENARIO_MAP && typeof deps.DEFAULT_SPEAKER_SCENARIO_MAP === "object"
    ? deps.DEFAULT_SPEAKER_SCENARIO_MAP
    : {};
  const voiceSource = { ...getSpeakerVoiceMap(session), ...(snapshots?.speakerVoiceMap || {}) };
  const expressionSource = { ...getSpeakerExpressionMap(session), ...(snapshots?.speakerExpressionMap || {}) };
  const nameSource = { ...getSpeakerNameMap(session), ...(snapshots?.speakerNameMap || {}) };
  const scenarioSource = { ...getSpeakerScenarioMap(session), ...(snapshots?.speakerScenarioMap || {}) };
  const voiceMap = {};
  const expressionMap = {};
  const nameMap = {};
  const scenarioMap = {};

  hosts.forEach((host) => {
    const key = String(host || "").trim();
    if (!key) return;
    voiceMap[key] = normalizeLiveVoiceName(voiceSource[key], resolveSpeakerVoiceName(key, session));
    expressionMap[key] = expressions.includes(expressionSource[key]) ? expressionSource[key] : "Neutral";
    nameMap[key] = String(nameSource[key] || defaultSpeakerNameMap[key] || key).trim() || key;
    const scenarioValue = String(
      scenarioSource[key] || defaultSpeakerScenarioMap[key] || "Cabina premium de podcast"
    ).replace(/\s+/g, " ").trim() || "Cabina premium de podcast";
    scenarioMap[key] = rewriteScenarioPromptForEducationalVideo(scenarioValue);
  });

  return { voiceMap, expressionMap, nameMap, scenarioMap };
}
