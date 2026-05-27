import { readFileSync } from "node:fs";

const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const timelineModelSource = readFileSync(new URL("../public/podcaster/podcaster-timeline-model.js", import.meta.url), "utf8");
const sessionPayloadSource = readFileSync(new URL("../public/podcaster/podcaster-session-payload.js", import.meta.url), "utf8");
const sessionStoreSource = readFileSync(new URL("../public/podcaster/podcaster-session-store.js", import.meta.url), "utf8");
const serverSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!/reelModeEnabled: raw\?\.reelModeEnabled === true/.test(timelineModelSource)) {
  throw new Error("La normalización cliente debe conservar podcastVideoConfig.reelModeEnabled.");
}

if (!/podcastVideoConfig: normalizePodcastVideoConfig\?\.\(source\?\.podcastVideoConfig \|\| \{\}\) \|\| \{\}/.test(sessionPayloadSource)) {
  throw new Error("El payload de sesión debe serializar podcastVideoConfig normalizado.");
}

if (!/podcastVideoConfig: normalizePodcastVideoConfig\(source\.podcastVideoConfig \|\| \{\}\)/.test(sessionStoreSource)) {
  throw new Error("La cache local debe guardar podcastVideoConfig normalizado.");
}

if (!/function mergePodcastVideoConfigForLoad/.test(sessionStoreSource)
  || !/reelModeEnabled: local\.reelModeEnabled === true \? true : cloud\.reelModeEnabled === true/.test(sessionStoreSource)
  || !/podcastVideoConfig: mergePodcastVideoConfigForLoad/.test(sessionStoreSource)) {
  throw new Error("La fusión cloud/local debe preservar reelModeEnabled local cuando cloud viene de una sesión antigua sin ese campo.");
}

if (!/function setReelModeEnabled\(enabled = false\)[\s\S]*reelModeEnabled: enabled === true[\s\S]*persist: true[\s\S]*autosaveReason: "reel-mode-toggle"/.test(podcasterSource)) {
  throw new Error("El toggle reel debe persistir localmente su estado aunque la sesión use guardado manual.");
}

if (!/reelModeEnabled: raw\?\.podcastVideoConfig\?\.reelModeEnabled === true/.test(serverSource)) {
  throw new Error("El backend debe conservar reelModeEnabled al sanitizar la sesión guardada.");
}

console.log("Podcaster reel mode persistence OK.");
