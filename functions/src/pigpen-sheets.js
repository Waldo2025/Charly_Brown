"use strict";

const COLLECTION = "pigpenSheetSources";
const MAX_ROWS = 1000;
const MAX_COLUMNS = 50;
const HEADER_ALIASES = Object.freeze({
  creator: ["creador", "creator"], status: ["estatus", "estado", "status"],
  level: ["nivel", "level"], grade: ["grado", "grade"],
  trimester: ["trimestre", "trim", "trimester"], subject: ["materia", "subject"],
  unit: ["tema", "chapter", "unidad", "unit"], curricularTopic: ["tema curricular", "curricular topic"],
  objective: ["objetivo final", "final objective", "objective"], narrative: ["narrativa", "narrative"],
  illustrationStyle: ["estilo de ilustracion", "illustration style", "image style"],
  roomCount: ["numero de salas", "number of rooms", "rooms"],
  questionsPerRoom: ["preguntas", "questions", "questions per room"],
  durationMinutes: ["duracion minutos", "duration minutes", "duration"]
});

function normalizeHeader(value = "") {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ").trim().toLowerCase();
}

function columnLetter(index) {
  let current = Math.max(1, Number(index) || 1);
  let result = "";
  while (current > 0) {
    current -= 1;
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26);
  }
  return result;
}

function buildHeaderMap(headers = []) {
  const normalized = headers.map(normalizeHeader);
  return Object.fromEntries(Object.entries(HEADER_ALIASES).map(([field, aliases]) =>
    [field, normalized.findIndex((header) => aliases.includes(header))]
  ).filter(([, index]) => index >= 0));
}

function normalizeRows(values = []) {
  if (!Array.isArray(values) || !values.length) return { fields: [], rows: [] };
  const headerMap = buildHeaderMap(values[0]);
  const fields = Object.keys(headerMap);
  const rows = values.slice(1).map((cells, offset) => {
    const row = { rowNumber: offset + 2 };
    fields.forEach((field) => { row[field] = String(cells?.[headerMap[field]] ?? "").trim(); });
    return row;
  }).filter((row) => fields.some((field) => String(row[field] || "").trim()));
  return { fields, rows };
}

function sanitizeTabs(tabs = []) {
  return (Array.isArray(tabs) ? tabs : []).map((tab) => ({
    sheetId: String(tab?.sheetId ?? "").trim(), label: String(tab?.label || "").trim(),
    language: String(tab?.language || "").trim(), enabled: tab?.enabled !== false
  })).filter((tab) => /^\d+$/.test(tab.sheetId) && tab.enabled);
}

function sanitizeSource(docSnap) {
  const data = docSnap?.data?.() || {};
  return {
    id: String(docSnap?.id || ""), displayName: String(data.displayName || data.name || "Google Sheet").trim(),
    spreadsheetId: String(data.spreadsheetId || "").trim(), enabled: data.enabled === true,
    order: Number(data.order || 0), maxRows: Math.min(MAX_ROWS, Math.max(2, Number(data.maxRows || MAX_ROWS))),
    tabs: sanitizeTabs(data.tabs)
  };
}

async function googleJson(url, accessToken) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(response.status === 403 ? "La cuenta de servicio no tiene acceso a esta hoja." : "Google Sheets no pudo completar la lectura.");
    error.status = response.status === 404 ? 404 : 502;
    error.code = "PIGPEN_SHEETS_UPSTREAM_ERROR";
    error.detail = body?.error?.message || "";
    throw error;
  }
  return body;
}

async function loadEnabledSource(db, sourceId) {
  const snap = await db.collection(COLLECTION).doc(String(sourceId || "")).get();
  if (!snap.exists) return null;
  const source = sanitizeSource(snap);
  return source.enabled && source.spreadsheetId ? source : null;
}

function sendError(res, error) {
  console.error(JSON.stringify({
    service: "pigpen-sheets",
    code: String(error?.code || "PIGPEN_SHEETS_ERROR"),
    status: Number(error?.status || 500),
    message: String(error?.message || "No se pudo leer Google Sheets."),
    upstreamDetail: String(error?.detail || "")
  }));
  return res.status(Math.max(400, Math.min(599, Number(error?.status || 500)))).json({
    error: String(error?.code || "PIGPEN_SHEETS_ERROR"),
    message: String(error?.message || "No se pudo leer Google Sheets.")
  });
}

function parseSpreadsheetId(value = "") {
  const clean = String(value || "").trim();
  const fromUrl = clean.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  const id = fromUrl || clean;
  return /^[a-zA-Z0-9_-]{20,}$/.test(id) ? id : "";
}

async function canManageSources(db, authContext) {
  const decoded = authContext?.decoded || {};
  let role = String(decoded.role || decoded.rol || decoded.userRole || "").trim().toLowerCase();
  if (!role && authContext?.uid) {
    const userSnap = await db.collection("users").doc(authContext.uid).get();
    const user = userSnap.exists ? userSnap.data() || {} : {};
    role = String(user.role || user.rol || user.userRole || "").trim().toLowerCase();
  }
  return ["admin", "superadmin", "super_admin", "editor"].includes(role);
}

async function requireSourceManager(db, req) {
  if (await canManageSources(db, req.authContext)) return;
  const error = new Error("Solo administradores y editores pueden añadir fuentes.");
  error.status = 403;
  error.code = "PIGPEN_SHEET_SOURCE_FORBIDDEN";
  throw error;
}

async function getSpreadsheetMetadata(spreadsheetId, accessToken) {
  const fields = encodeURIComponent("spreadsheetId,properties.title,sheets.properties(sheetId,title,hidden,gridProperties)");
  return googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?includeGridData=false&fields=${fields}`, accessToken);
}

function registerPigpenSheetsRoutes(app, { db, verifyFirebaseBearer, getAccessToken }) {
  app.use("/api/pigpen/sheet-sources", async (req, res, next) => {
    if (req.method === "OPTIONS") return next();
    try {
      req.authContext = await verifyFirebaseBearer(req);
      res.setHeader("Cache-Control", "no-store");
      return next();
    } catch (error) { return sendError(res, error); }
  });

  app.get("/api/pigpen/sheet-sources", async (req, res) => {
    try {
      const snap = await db.collection(COLLECTION).where("enabled", "==", true).limit(50).get();
      const sources = snap.docs.map(sanitizeSource).filter((source) => source.spreadsheetId && source.tabs.length)
        .sort((a, b) => a.order - b.order || a.displayName.localeCompare(b.displayName))
        .map(({ spreadsheetId: _spreadsheetId, ...source }) => source);
      return res.status(200).json({ ok: true, sources, canManage: await canManageSources(db, req.authContext) });
    } catch (error) { return sendError(res, error); }
  });

  app.post("/api/pigpen/sheet-sources/inspect", async (req, res) => {
    try {
      await requireSourceManager(db, req);
      const spreadsheetId = parseSpreadsheetId(req.body?.spreadsheetUrl || req.body?.spreadsheetId);
      if (!spreadsheetId) return res.status(400).json({ error: "PIGPEN_SHEET_URL_INVALID", message: "Pega una URL válida de Google Sheets." });
      const metadata = await getSpreadsheetMetadata(spreadsheetId, await getAccessToken());
      const sheets = (metadata.sheets || []).filter((item) => item?.properties?.hidden !== true).map((item) => ({
        sheetId: String(item.properties.sheetId), title: String(item.properties.title || "")
      }));
      return res.status(200).json({ ok: true, spreadsheetId, title: String(metadata.properties?.title || "Google Sheet"), sheets });
    } catch (error) { return sendError(res, error); }
  });

  app.post("/api/pigpen/sheet-sources", async (req, res) => {
    try {
      await requireSourceManager(db, req);
      const spreadsheetId = parseSpreadsheetId(req.body?.spreadsheetId);
      const requestedTabs = sanitizeTabs(req.body?.tabs);
      if (!spreadsheetId || !requestedTabs.length) return res.status(400).json({ error: "PIGPEN_SHEET_SOURCE_INVALID", message: "Selecciona al menos una pestaña." });
      const metadata = await getSpreadsheetMetadata(spreadsheetId, await getAccessToken());
      const liveSheets = new Map((metadata.sheets || []).filter((item) => item?.properties?.hidden !== true).map((item) => [String(item.properties.sheetId), item.properties]));
      const tabs = requestedTabs.map((tab) => {
        const live = liveSheets.get(tab.sheetId);
        return live ? { sheetId: tab.sheetId, label: tab.label || String(live.title || ""), language: tab.language || "", enabled: true } : null;
      }).filter(Boolean);
      if (!tabs.length) return res.status(400).json({ error: "PIGPEN_SHEET_TABS_INVALID", message: "Las pestañas seleccionadas no están disponibles." });
      const existing = await db.collection(COLLECTION).where("spreadsheetId", "==", spreadsheetId).limit(1).get();
      const ref = existing.empty ? db.collection(COLLECTION).doc() : existing.docs[0].ref;
      await ref.set({
        displayName: String(req.body?.displayName || metadata.properties?.title || "Google Sheet").trim().slice(0, 160),
        spreadsheetId, enabled: true, order: Number(req.body?.order || 100), maxRows: Math.min(MAX_ROWS, Math.max(2, Number(req.body?.maxRows || MAX_ROWS))),
        tabs, updatedAt: new Date(), updatedBy: String(req.authContext?.uid || "")
      }, { merge: true });
      return res.status(existing.empty ? 201 : 200).json({ ok: true, source: { id: ref.id, displayName: String(req.body?.displayName || metadata.properties?.title || "Google Sheet").trim(), tabs } });
    } catch (error) { return sendError(res, error); }
  });

  app.get("/api/pigpen/sheet-sources/:sourceId/sheets", async (req, res) => {
    try {
      const source = await loadEnabledSource(db, req.params.sourceId);
      if (!source) return res.status(404).json({ error: "PIGPEN_SHEET_SOURCE_NOT_FOUND", message: "Fuente no disponible." });
      const token = await getAccessToken();
      const fields = encodeURIComponent("spreadsheetId,properties.title,sheets.properties(sheetId,title,hidden,gridProperties)");
      const metadata = await googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(source.spreadsheetId)}?includeGridData=false&fields=${fields}`, token);
      const liveSheets = new Map((metadata.sheets || []).map((sheet) => [String(sheet?.properties?.sheetId ?? ""), sheet.properties]));
      const sheets = source.tabs.map((tab) => {
        const live = liveSheets.get(tab.sheetId);
        return !live || live.hidden === true ? null : { sheetId: tab.sheetId, label: tab.label || live.title, title: live.title, language: tab.language };
      }).filter(Boolean);
      return res.status(200).json({ ok: true, source: { id: source.id, displayName: source.displayName }, sheets });
    } catch (error) { return sendError(res, error); }
  });

  app.get("/api/pigpen/sheet-sources/:sourceId/sheets/:sheetId/rows", async (req, res) => {
    try {
      const source = await loadEnabledSource(db, req.params.sourceId);
      if (!source) return res.status(404).json({ error: "PIGPEN_SHEET_SOURCE_NOT_FOUND", message: "Fuente no disponible." });
      const tab = source.tabs.find((item) => item.sheetId === String(req.params.sheetId || ""));
      if (!tab) return res.status(403).json({ error: "PIGPEN_SHEET_TAB_FORBIDDEN", message: "La pestaña no está autorizada." });
      const token = await getAccessToken();
      const metaFields = encodeURIComponent("sheets.properties(sheetId,title,hidden,gridProperties)");
      const metadata = await googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(source.spreadsheetId)}?includeGridData=false&fields=${metaFields}`, token);
      const sheet = (metadata.sheets || []).find((item) => String(item?.properties?.sheetId ?? "") === tab.sheetId);
      if (!sheet || sheet.properties?.hidden === true) return res.status(404).json({ error: "PIGPEN_SHEET_TAB_NOT_FOUND", message: "Pestaña no disponible." });
      const title = String(sheet.properties.title || "");
      const rowLimit = Math.min(source.maxRows, Math.max(2, Number(sheet.properties?.gridProperties?.rowCount || source.maxRows)));
      const columnLimit = Math.min(MAX_COLUMNS, Math.max(1, Number(sheet.properties?.gridProperties?.columnCount || MAX_COLUMNS)));
      const range = `'${title.replace(/'/g, "''")}'!A1:${columnLetter(columnLimit)}${rowLimit}`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(source.spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
      const normalized = normalizeRows((await googleJson(url, token)).values || []);
      if (!normalized.fields.includes("curricularTopic")) return res.status(422).json({ error: "PIGPEN_SHEET_HEADERS_UNSUPPORTED", message: "La hoja necesita Tema curricular o Curricular Topic." });
      return res.status(200).json({ ok: true, sheet: { sheetId: tab.sheetId, label: tab.label || title, title, language: tab.language }, fields: normalized.fields, rows: normalized.rows });
    } catch (error) { return sendError(res, error); }
  });
}

module.exports = { HEADER_ALIASES, buildHeaderMap, columnLetter, normalizeHeader, normalizeRows, parseSpreadsheetId, registerPigpenSheetsRoutes, sanitizeSource };
