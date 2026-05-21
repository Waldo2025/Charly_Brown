import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const exportSource = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");

if (!source.includes("window.setTimelinePreviewsSuspended = setTimelinePreviewsSuspended;")) {
  throw new Error("podcaster.js debe exponer setTimelinePreviewsSuspended en window para el modal de exportación.");
}

if (!exportSource.includes("window.setTimelinePreviewsSuspended(false);") || !exportSource.includes("window.setTimelinePreviewsSuspended(true);")) {
  throw new Error("El modal de exportación debe seguir suspendiendo y reactivando previews del timeline.");
}

console.log("Montage export preview suspension global OK.");
