import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/js/home.js", import.meta.url), "utf8");

if (!/function buildHomePanelMontageMusicConfig/.test(source)) {
  throw new Error("Home debe exponer un helper canónico para construir la config efectiva de música de montaje.");
}

if (!/getPanelMontageMusicConfig:\s*\(s\)\s*=>\s*\{[\s\S]*?return buildHomePanelMontageMusicConfig\(/.test(source)) {
  throw new Error("multimediaPlaybackDeps.getPanelMontageMusicConfig debe delegar en el helper canónico.");
}

if (!/const effectivePanelMusicConfig = multimediaPlaybackDeps\.getPanelMontageMusicConfig\(session\);[\s\S]*backgroundMusic: effectivePanelMusicConfig \|\| null,[\s\S]*backgroundSegments: effectivePanelMusicConfig\?\.sourceItems \|\| \[\]/s.test(source)) {
  throw new Error("La exportación rápida debe usar la config efectiva y sus sourceItems reconstruidos.");
}

if (!/const effectivePanelMusicConfig = multimediaPlaybackDeps\.getPanelMontageMusicConfig\(currentMultimediaSession\);[\s\S]*backgroundMusic: effectivePanelMusicConfig \|\| null,[\s\S]*backgroundSegments: effectivePanelMusicConfig\?\.sourceItems \|\| \[\]/s.test(source)) {
  throw new Error("La exportación multimedia debe usar la config efectiva y sus sourceItems reconstruidos.");
}

console.log("Home export uses effective panel music config OK.");
