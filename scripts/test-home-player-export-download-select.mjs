import assert from "node:assert/strict";
import fs from "node:fs";

const htmlSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/home.html",
  "utf8"
);
const homeSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/js/home.js",
  "utf8"
);
const podcasterExportSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-montage-export.js",
  "utf8"
);
const backendSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

assert.doesNotMatch(
  htmlSource,
  /id="btnOpenExportModal"/,
  "Home player must not expose the export-video button."
);

assert.match(
  htmlSource,
  /<select id="playerExportDownloadSelect"[\s\S]*?hidden[\s\S]*?>[\s\S]*?<option value="">Descargar MP4<\/option>[\s\S]*?<\/select>/,
  "Home player must expose a hidden download select with the Descargar MP4 placeholder."
);

assert.doesNotMatch(
  homeSource,
  /btnOpenExportModal/,
  "Home JS must not wire the old export modal launcher."
);

assert.match(
  homeSource,
  /function normalizeDashboardMontageExportReference\(raw = null\)/,
  "Home must normalize stored export references before rendering downloads."
);

assert.match(
  homeSource,
  /function resolveDashboardMontageExportHistory\(session = null\)[\s\S]*montageExportHistory[\s\S]*latestMontageExport/,
  "Home must render download options from montageExportHistory with latestMontageExport fallback."
);

assert.match(
  homeSource,
  /function getDashboardMontageExportOptionLabel\(entry = null, index = 0\)[\s\S]*Más reciente[\s\S]*function renderDashboardExportDownloadSelect\(session = null\)[\s\S]*playerExportDownloadSelect[\s\S]*Descargar MP4/,
  "Home must render the player download select only when the session has exports."
);

assert.match(
  homeSource,
  /playerExportDownloadSelect[\s\S]*addEventListener\("change"[\s\S]*downloadDashboardMontageExportSelection/,
  "Home must download the selected export from the player select."
);

assert.match(
  podcasterExportSource,
  /montageExportHistory:\s*normalizeMontageExportDownloadHistory\(\[[\s\S]*normalized[\s\S]*current\.podcastVideoConfig\?\.montageExportHistory/,
  "Podcaster must persist a durable per-session montageExportHistory."
);

assert.match(
  backendSource,
  /function sanitizeMontageExportHistory\(value = \[\]\)[\s\S]*sanitizeMontageExportReference/,
  "Backend must sanitize montageExportHistory entries."
);

assert.match(
  backendSource,
  /montageExportHistory:\s*sanitizeMontageExportHistory\(raw\?\.podcastVideoConfig\?\.montageExportHistory \|\| \[\]\)/,
  "Backend session sanitizer must preserve podcastVideoConfig.montageExportHistory."
);

assert.match(
  backendSource,
  /"session\.podcastVideoConfig\.montageExportHistory":\s*admin\.firestore\.FieldValue\.arrayUnion/,
  "Backend export completion metadata must append ready exports to montageExportHistory."
);

console.log("Home player export download select contract OK.");
