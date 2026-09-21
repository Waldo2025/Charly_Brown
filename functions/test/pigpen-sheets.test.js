const assert = require("node:assert/strict");
const test = require("node:test");
const {
  GOOGLE_SHEET_MIME,
  XLSX_MIME,
  buildEditorialDriveDownloadUrl,
  parseDriveFileId,
  parseSpreadsheetId
} = require("../src/pigpen-sheets.js");

test("PigPen extracts safe Google Sheets and Drive file ids", () => {
  const id = "17Mh1GfkqM2f7IX2ZXOAS3wIkox7ZxVkk";
  assert.equal(parseDriveFileId(`https://docs.google.com/spreadsheets/d/${id}/edit?gid=2040906422`), id);
  assert.equal(parseDriveFileId(`https://drive.google.com/file/d/${id}/view`), id);
  assert.equal(parseDriveFileId(`https://drive.google.com/open?id=${id}`), id);
  assert.equal(parseSpreadsheetId(`https://docs.google.com/spreadsheets/d/${id}/edit`), id);
  assert.equal(parseDriveFileId("https://example.com/file.xlsx"), "");
});

test("PigPen uses Drive media download for XLSX and export for native Sheets", () => {
  const id = "17Mh1GfkqM2f7IX2ZXOAS3wIkox7ZxVkk";
  const stored = buildEditorialDriveDownloadUrl(id, XLSX_MIME);
  assert.match(stored, /\/drive\/v3\/files\//);
  assert.match(stored, /alt=media/);
  const native = buildEditorialDriveDownloadUrl(id, GOOGLE_SHEET_MIME);
  assert.match(native, /\/export\?/);
  assert.ok(native.includes(encodeURIComponent(XLSX_MIME)));
});
