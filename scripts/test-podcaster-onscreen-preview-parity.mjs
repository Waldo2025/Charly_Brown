import { readFileSync } from "node:fs";

const shared = readFileSync(new URL("../public/podcaster/podcaster-on-screen-text.js", import.meta.url), "utf8");
const controller = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");
const front = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/podcaster.css", import.meta.url), "utf8");

if (!/function resolveOnScreenTextPreviewLayoutSpec\(input = \{\}\)/.test(shared)) {
  throw new Error("La spec compartida debe exponer una resolución única del preview del texto en pantalla.");
}

if (!/const resolveSharedOnScreenTextPreviewLayoutSpec = requireOnScreenTextApiFunction\("resolveOnScreenTextPreviewLayoutSpec"\);/.test(front)
  || !/function resolveOnScreenTextPreviewLayoutSpec\(input = \{\}\) \{[\s\S]*resolveSharedOnScreenTextPreviewLayoutSpec/m.test(front)) {
  throw new Error("podcaster.js debe delegar la geometría del preview al módulo compartido.");
}

if (!/const liveLayout = this\.resolveLiveOnScreenTextLayout\(selected\.rowId, persistedLayout, overlay, previewEl\);/.test(controller)
  || !/const rowLayout = hasLiveOverlayInteraction[\s\S]*\? liveLayout[\s\S]*: this\.resolveTrackManagedOnScreenTextLayout\(liveLayout, settings, selected\.rowId\);/.test(controller)
  || !/const previewSpec = this\.deps\?\.resolveOnScreenTextPreviewLayoutSpec\?\.\(\{[\s\S]*layout: rowLayout,[\s\S]*text,[\s\S]*previewWidthPx,[\s\S]*previewHeightPx/m.test(controller)) {
  throw new Error("El controller debe consumir un único preview spec compartido para renderizar el overlay.");
}

if (!/xPct: previewSpec\?\.xPct \?\? rowLayout\?\.xPct \?\? 0/.test(controller)
  || !/yPct: previewSpec\?\.yPct \?\? rowLayout\?\.yPct \?\? 0/.test(controller)) {
  throw new Error("El preview debe usar xPct/yPct persistidos como posición final, sin reinterpretarlos.");
}

if (/storedBubbleCenterXPct|actualBubbleWidthPct|bubbleTopPct = isDashboardPreview|storedBubbleTopPct \+ 0\.14/.test(controller)) {
  throw new Error("El controller no debe mantener compensaciones legacy de centrado o offsets verticales.");
}

if (!/left:\s*var\(--pod-onscreen-text-x, 21%\);/.test(css)
  || !/top:\s*var\(--pod-onscreen-text-y, 72%\);/.test(css)
  || !/transform:\s*none;/.test(css)
  || !/max-width:\s*min\(96%, 1400px\);/.test(css)) {
  throw new Error("El CSS del Studio debe respetar la semántica top-left del layout persistido.");
}

console.log("Podcast onscreen preview parity OK.");
