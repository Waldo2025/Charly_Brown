import assert from "node:assert/strict";
import fs from "node:fs";

const root = "/Users/waldolopez/Documents/CharlyBrown";
const podcasterSource = fs.readFileSync(`${root}/public/podcaster/podcaster.js`, "utf8");
const playbackSource = fs.readFileSync(`${root}/public/podcaster/podcaster-playback-controller.js`, "utf8");

const openModalMatch = podcasterSource.match(/async function openPodcastVideoModalWithLoader\(\) \{[\s\S]*?\n\}/);
assert.ok(openModalMatch, "Debe existir openPodcastVideoModalWithLoader.");
const openModalBody = openModalMatch[0];

assert.match(
  openModalBody,
  /await pausePodcastPlayback\(\)\.catch\(\(\) => \{ \}\);[\s\S]*await playbackController\.stop\(\{ keepStatus: true, keepCursor: true \}\)\.catch\(\(\) => \{ \}\);[\s\S]*podcastVideoState\.montageActive = false;[\s\S]*podcastVideoState\.speaking = false;/m,
  "Abrir el editor Snoopy debe pausar el podcast y detener el transport antes de renderizar/hidratar el stage."
);

assert.doesNotMatch(
  playbackSource,
  /const playbackActive = this\.state\.isPlaying === true \|\|[\s\S]*podcastPlaybackState[\s\S]*\.active === true;/m,
  "syncStageMedia no debe usar podcastPlaybackState.active para autorizar stageVideo.play() al abrir el editor."
);

assert.match(
  playbackSource,
  /const playbackActive = this\.state\.isPlaying === true;/,
  "syncStageMedia sólo debe reproducir el stage cuando el transport del playbackController está activo."
);

console.log("Podcaster Snoopy editor open no autoplay OK.");
