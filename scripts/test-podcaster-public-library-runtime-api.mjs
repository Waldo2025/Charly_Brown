import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const registrySource = readFileSync(new URL("../public/podcaster/podcaster-runtime-registry.js", import.meta.url), "utf8");

const runtimeApiMatch = source.match(/const podcasterPublicLibraryRuntimeApi = \{([\s\S]*?)\n\};/);

if (!runtimeApiMatch) {
  throw new Error("No se encontró podcasterPublicLibraryRuntimeApi en podcaster.js.");
}

const runtimeApiBody = runtimeApiMatch[1];

const requiredMembers = [
  "getActiveSession",
  "getPodcastVideoConfig",
  "getSessionRows",
  "normalizeVideoImagePrompts",
  "podcastVideoState",
  "renderPodcastTransitionTimeline",
  "renderPodcastVideoTimeline",
  "syncPodcastStudioInspector"
];

const missingMembers = requiredMembers.filter((member) => !new RegExp(`\\b${member}\\b`).test(runtimeApiBody));

if (missingMembers.length) {
  throw new Error(`PodcasterPublicLibraryRuntime debe exponer: ${missingMembers.join(", ")}`);
}

if (!/registerPodcasterPublicLibraryRuntime\(podcasterPublicLibraryRuntimeApi\);/.test(source)) {
  throw new Error("podcaster.js debe registrar podcasterPublicLibraryRuntimeApi en el registry modular.");
}

if (!/export function requirePodcasterPublicLibraryRuntime\(\)/.test(registrySource)) {
  throw new Error("El runtime registry debe exponer requirePodcasterPublicLibraryRuntime.");
}

console.log("Podcaster public library runtime API OK.");
