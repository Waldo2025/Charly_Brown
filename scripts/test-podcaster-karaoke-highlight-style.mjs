import { readFileSync } from "node:fs";

const onScreenSource = readFileSync(new URL("../public/podcaster/podcaster-on-screen-text.js", import.meta.url), "utf8");
const textRenderSource = readFileSync(new URL("../public/podcaster/podcaster-text-render.js", import.meta.url), "utf8");
const playbackSource = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");
const renderSource = readFileSync(new URL("../public/podcaster/podcaster-render.js", import.meta.url), "utf8");
const homeSource = readFileSync(new URL("../public/js/home.js", import.meta.url), "utf8");
const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../public/podcaster.css", import.meta.url), "utf8");

const requirements = [
  [onScreenSource, "karaokeHighlightColor", "On-screen text settings must normalize karaoke highlight color."],
  [onScreenSource, 'data-setting="karaokeHighlightStyle"', "On-screen text modal must expose karaoke highlight shape control."],
  [textRenderSource, "resolveKaraokeHighlightSettings", "Text renderer must centralize karaoke highlight settings."],
  [textRenderSource, "is-highlight-pill", "Karaoke markup must support shaped highlight classes."],
  [playbackSource, "buildKaraokeSubtitleMarkup(text, karaokeWordTimings, activeKaraokeWordIndex, settings)", "Preview playback must pass track settings into karaoke markup."],
  [renderSource, "buildKaraokeSubtitleMarkup(text, audioClip?.wordTimings || [], activeWordIndex, settings)", "Browser render must pass settings into karaoke markup."],
  [homeSource, "karaokeHighlightStyle", "Home must include karaoke highlight CSS/settings parity."],
  [backendSource, "karaokeHighlightStyle", "Backend sanitizer must preserve karaoke highlight settings."],
  [cssSource, ".podcast-karaoke-word.is-active.is-highlight-pill", "Podcaster CSS must style pill karaoke highlights."]
];

const missing = requirements.filter(([source, snippet]) => !source.includes(snippet));
if (missing.length) {
  throw new Error(missing.map(([, snippet, message]) => `${message}\nMissing: ${snippet}`).join("\n\n"));
}

console.log("Podcaster karaoke highlight style contract OK.");
