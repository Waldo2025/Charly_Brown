import assert from "node:assert/strict";
import fs from "node:fs";

const podcasterSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);
const timelineUiSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-timeline-ui.js",
  "utf8"
);
const montageExportSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-montage-export.js",
  "utf8"
);

assert.match(
  podcasterSource,
  /if \(resolvedSessionId && resolvedRowId && isStaleDialogueVideoSource\(resolvedSessionId, resolvedRowId, clip\)\) \{\s*return null;\s*\}/,
  "resolvePrimaryDialogueVideoSegment debe devolver null cuando el clip base ya quedó marcado como stale para la sesión/fila activa."
);

assert.match(
  podcasterSource,
  /markStaleDialogueVideoSource\(activeSessionId, rowId, \{[\s\S]*?storagePath: normalizedStoragePath[\s\S]*?\}, "storage-sdk-object-not-found"\);/,
  "hydrateSessionDirectStorageMediaUrls debe marcar stale los videos cuya resolución directa por Firebase Storage SDK falle al abrir la sesión."
);

assert.match(
  podcasterSource,
  /missingStoragePath: normalizedStoragePath,[\s\S]*storageLookupFailedAt: new Date\(\)\.toISOString\(\)/,
  "Cuando un video de sesión ya no existe en Storage, podcaster.js debe persistir la falla para no reintentar el mismo getDownloadURL en cada apertura."
);

assert.match(
  timelineUiSource,
  /resolvePrimaryDialogueVideoSegment\(generatedClip, \{\s*sessionId: String\(activeSession\?\.id \|\| ""\)\.trim\(\),\s*rowId\s*\}\)/,
  "El timeline debe resolver el segmento principal con sessionId/rowId para no revivir clips rotos."
);

assert.match(
  montageExportSource,
  /resolvePrimaryDialogueVideoSegment\?\.\(clip, \{\s*sessionId,\s*rowId\s*\}\)/,
  "El export debe resolver el segmento principal con sessionId/rowId para respetar clips stale."
);

console.log("Podcaster stale storage open-session regression OK.");
