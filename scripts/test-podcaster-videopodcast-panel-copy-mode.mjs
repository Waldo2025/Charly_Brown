import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

if (!/const videoContentType = persistedVideoContentType !== "none"\s*\?\s*persistedVideoContentType\s*:\s*\(composerVideoMode \? "creative" : "none"\);/.test(source)) {
  throw new Error("getPanelModeCopy debe priorizar el videoContentType persistido antes que el modo global del composer.");
}

if (!/const videoMode = videoContentType === "creative";/.test(source)) {
  throw new Error("getPanelModeCopy debe tratar solo creative como videoMode verdadero.");
}

if (!/const videoPodcastMode = videoContentType === "videopodcast";/.test(source)) {
  throw new Error("getPanelModeCopy debe distinguir videopodcast del modo creativo.");
}

if (!/shellTitle: videoMode\s*\?\s*"Snoopy Video Creator Creativo"\s*:\s*\(videoPodcastMode \? "Snoopy Podcast Creator con video" : "Video del podcast"\)/.test(source)) {
  throw new Error("El copy del panel debe distinguir podcast con video del creativo.");
}

console.log("Podcaster videopodcast panel copy mode OK.");
