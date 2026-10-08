import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const cssSource = readFileSync(new URL("public/podcaster.css", root), "utf8");
const appSource = readFileSync(new URL("public/podcaster/podcaster.js", root), "utf8");
const timelineUiSource = readFileSync(new URL("public/podcaster/podcaster-timeline-ui.js", root), "utf8");

function portalFunctionBody(source) {
  const start = source.indexOf("function getPodcastTimelineClipMenuPortal()");
  assert.ok(start > -1, "Debe existir getPodcastTimelineClipMenuPortal().");
  const end = source.indexOf("\n  }", start);
  return source.slice(start, end);
}

test("the clip action menu lives in a body portal so timeline re-renders cannot wipe it", () => {
  const body = portalFunctionBody(timelineUiSource);
  assert.match(body, /document\.body\.appendChild\(portal\);/);
  assert.doesNotMatch(
    body,
    /querySelector\("#podcastTimelineMenuLayer"\)[\s\S]*?if \(layer\) return layer;/,
    "El menú ya no puede alojarse dentro del canvas: renderPodcastVideoTimeline() reescribe su innerHTML y borra el menú recién abierto."
  );
  assert.match(appSource, /const menuLayer = bindPodcastTimelineClipMenuPortal\(\);/);
});

test("the menu portal keeps the same delegated click handler as the timeline", () => {
  assert.match(appSource, /const handlePodcastTimelineClick = async \(event\) => \{/);
  assert.match(appSource, /els\.podcastVideoTimeline\.addEventListener\("click", handlePodcastTimelineClick\);/);
  assert.match(appSource, /portal\.addEventListener\("click", handlePodcastTimelineClick\);/);
});

test("an open or stale menu overlay can never swallow clicks", () => {
  const withoutComments = cssSource.replace(/\/\*[\s\S]*?\*\//g, "");
  const timelineLayerRule = withoutComments.match(/\.podcast-video-timeline-menu-layer\.is-open\s*\{[^}]*\}/m);
  const portalRule = withoutComments.match(/\.podcast-video-clip-actions-portal\.is-open\s*\{[^}]*\}/m);
  assert.ok(timelineLayerRule && portalRule, "Faltan las reglas de is-open de los contenedores del menú.");
  for (const rule of [timelineLayerRule, portalRule]) {
    assert.doesNotMatch(rule[0], /pointer-events:\s*auto/, `${rule[0].split("{")[0].trim()} no debe capturar el puntero a pantalla completa.`);
  }
  assert.match(withoutComments, /\.podcast-video-clip-menu\s*\{[\s\S]*?pointer-events:\s*auto;/m);
});

test("clicks outside close the menu even when the host lost its menu node", () => {
  assert.match(
    appSource,
    /const hosts = \[menuLayer, portal\]\.filter\(Boolean\);[\s\S]*?const hasMenu = hosts\.some\(\(host\) => host\.querySelector\("\.podcast-video-clip-menu\.is-visible"\)\);/,
    "El delegado de cierre debe revisar ambos contenedores, no sólo el primero que exista."
  );
  assert.match(
    appSource,
    /if \(hosts\.some\(\(host\) => host\.classList\.contains\("is-open"\) \|\| host\.dataset\.openRowId\)\) \{\s*\n\s*closePodcastTimelineClipMenu\(\);/,
    "Un contenedor abierto sin menú dentro debe auto-limpiarse."
  );
});

test("scrolling the timeline closes the anchored clip menu", () => {
  assert.match(
    timelineUiSource,
    /if \(document\.getElementById\("podcastTimelineClipMenuPortal"\)\?\.dataset\?\.openRowId\) \{\s*\n\s*closePodcastTimelineClipMenu\(\);/,
    "El menú vive en coordenadas de viewport, así que un scroll del timeline lo despega del chip."
  );
});
