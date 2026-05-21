function requireFunction(fn, name = "") {
  if (typeof fn !== "function") {
    throw new TypeError(`${name} is not a function`);
  }
  return fn;
}

export function replaceHostTokensWithNames(text = "", session = null, deps = {}) {
  const getSpeakerNameMap = requireFunction(deps.getSpeakerNameMap, "getSpeakerNameMap");
  let output = String(text || "");
  const nameMap = getSpeakerNameMap(session);
  Object.keys(nameMap).forEach((hostKey) => {
    const name = String(nameMap[hostKey] || "").trim();
    if (!name) return;
    const escaped = hostKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output.replace(new RegExp(`\\b${escaped}\\b`, "gi"), name);
  });
  return output;
}
