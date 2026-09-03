(function initPigpenSheetsImportModule(global) {
  "use strict";
  const FILTERS = ["level", "grade", "trimester", "subject", "unit"];
  const LABELS = { level: "Nivel", grade: "Grado", trimester: "Trimestre", subject: "Materia", unit: "Chapter / Tema" };
  const LAST_CONFIG_KEY = "pigpen.lastSheetBrief.v1";
  let config = null, rows = [], fields = [], selectedRow = null, pendingSpreadsheet = null;
  const byId = (id) => document.getElementById(id);
  const clean = (value) => String(value ?? "").trim();
  const escapeHtml = (value) => clean(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
  function saveLastConfig() {
    const formState = config?.getFormState?.();
    if (!formState || typeof formState !== "object") return false;
    try {
      global.localStorage.setItem(LAST_CONFIG_KEY, JSON.stringify({ formState, savedAt: new Date().toISOString() }));
      return true;
    } catch (_) { return false; }
  }
  function getLastFormState() {
    try {
      const parsed = JSON.parse(global.localStorage.getItem(LAST_CONFIG_KEY) || "null");
      return parsed?.formState && typeof parsed.formState === "object" ? { ...parsed.formState } : {};
    } catch (_) { return {}; }
  }
  function apiUrl(path) {
    const runtime = global.__CHARLY_CONFIG__ || {};
    const base = clean(runtime.apiBaseUrl || runtime.geminiApiBaseUrl || runtime.remoteApiBaseUrl).replace(/\/+$/, "");
    if (!base) return path;
    return base.endsWith("/api") && path.startsWith("/api/") ? `${base}${path.slice(4)}` : `${base}${path}`;
  }
  async function request(path, options = {}) {
    const user = config?.getUser?.();
    if (!user) throw new Error("Inicia sesión para consultar Google Sheets.");
    const response = await fetch(apiUrl(path), {
      ...options,
      headers: { Authorization: `Bearer ${await user.getIdToken()}`, Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(clean(payload.message || payload.error) || "No se pudo consultar Google Sheets.");
    return payload;
  }
  function setStatus(message, kind = "") { const el = byId("erSheetsImportStatus"); if (el) { el.textContent = message; el.dataset.kind = kind; } }
  function setManageStatus(message, kind = "") { const el = byId("erSheetsManageStatus"); if (el) { el.textContent = message; el.dataset.kind = kind; } }
  function setSelect(select, options, placeholder) {
    if (!select) return;
    select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${options.map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`).join("")}`;
    select.disabled = options.length === 0;
  }
  function optionsFor(list, field) {
    if (field === "unit") {
      const currentValues = list.map((row) => clean(row.unit)).filter(Boolean);
      const prefix = currentValues.some((value) => /^tema\b/i.test(value)) ? "Tema" : "Chapter";
      const existingByNumber = new Map();
      currentValues.forEach((value) => {
        const number = clean(value).match(/\d+/)?.[0];
        if (number && !existingByNumber.has(number)) existingByNumber.set(number, value);
      });
      return Array.from({ length: 15 }, (_, index) => {
        const number = String(index + 1);
        const value = existingByNumber.get(number) || `${prefix} ${number}`;
        return { value, label: value };
      });
    }
    return [...new Set(list.map((row) => clean(row[field])).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })).map((value) => ({ value, label: value }));
  }
  function rebuildFilters(changedIndex = -1) {
    let filtered = rows.slice();
    FILTERS.forEach((field, index) => {
      const wrapper = document.querySelector(`[data-sheet-filter="${field}"]`), select = byId(`erSheets${field[0].toUpperCase()}${field.slice(1)}Filter`);
      const available = fields.includes(field);
      wrapper?.classList.toggle("hidden", !available);
      if (!available || !select) return;
      const previous = index <= changedIndex ? clean(select.value) : "", options = optionsFor(filtered, field);
      setSelect(select, options, `Todos: ${LABELS[field]}`);
      if (previous && options.some((item) => item.value === previous)) select.value = previous;
      if (select.value) filtered = filtered.filter((row) => field === "unit"
        ? clean(row[field]).match(/\d+/)?.[0] === clean(select.value).match(/\d+/)?.[0]
        : clean(row[field]) === select.value);
    });
    rebuildRows(filtered);
  }
  function rebuildRows(filtered) {
    const select = byId("erSheetsRowSelect");
    const options = filtered.map((row) => ({ value: String(row.rowNumber), label: `Fila ${row.rowNumber} · ${clean(row.unit) ? `${clean(row.unit)} · ` : ""}${clean(row.curricularTopic) || "Sin tema"}` }));
    setSelect(select, options, options.length ? "Selecciona una fila" : "No hay filas coincidentes");
    if (options.length === 1) select.value = options[0].value;
    selectedRow = select?.value ? filtered.find((row) => String(row.rowNumber) === select.value) || null : null;
    renderPreview();
  }
  function renderPreview() {
    const preview = byId("erSheetsImportPreview"), button = byId("btnApplySheetsImport");
    if (button) button.disabled = !selectedRow;
    if (!preview) return;
    if (!selectedRow) { preview.innerHTML = '<p class="er-sheets-preview-empty">Selecciona una fila para revisar los datos.</p>'; return; }
    const entries = [["Creador", selectedRow.creator], ["Estatus", selectedRow.status], ["Nivel", selectedRow.level], ["Grado", selectedRow.grade], ["Trimestre", selectedRow.trimester], ["Materia", selectedRow.subject], ["Chapter / Tema", selectedRow.unit], ["Tema curricular", selectedRow.curricularTopic], ["Objetivo final", selectedRow.objective], ["Narrativa", selectedRow.narrative], ["Estilo", selectedRow.illustrationStyle], ["Salas", selectedRow.roomCount], ["Preguntas", selectedRow.questionsPerRoom], ["Duración", selectedRow.durationMinutes]].filter(([, value]) => clean(value));
    const count = entries.filter(([label]) => !["Creador", "Estatus"].includes(label)).length;
    preview.innerHTML = `<div class="er-sheets-preview-heading"><strong>Fila ${selectedRow.rowNumber}</strong><span>${count} campos se cargarán</span></div><dl>${entries.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>`;
  }
  async function loadSources(preselect = "") {
    setStatus("Cargando archivos autorizados…", "loading");
    setSelect(byId("erSheetsSourceSelect"), [], "Cargando archivos…");
    const payload = await request("/api/pigpen/sheet-sources"), sources = payload.sources || [];
    byId("btnShowAddSheet")?.classList.toggle("hidden", payload.canManage !== true);
    setSelect(byId("erSheetsSourceSelect"), sources.map((item) => ({ value: item.id, label: item.displayName })), sources.length ? "Selecciona un archivo" : "No hay archivos autorizados");
    if (preselect && sources.some((item) => item.id === preselect)) { byId("erSheetsSourceSelect").value = preselect; await loadSheets(preselect); }
    setStatus(sources.length ? "Selecciona el archivo y la hoja." : "El catálogo no contiene archivos habilitados.", sources.length ? "" : "warning");
  }
  async function loadSheets(sourceId) {
    setSelect(byId("erSheetsSheetSelect"), [], "Cargando hojas…");
    if (!sourceId) return;
    setStatus("Consultando las hojas autorizadas…", "loading");
    const sheets = (await request(`/api/pigpen/sheet-sources/${encodeURIComponent(sourceId)}/sheets`)).sheets || [];
    setSelect(byId("erSheetsSheetSelect"), sheets.map((item) => ({ value: item.sheetId, label: item.label || item.title })), sheets.length ? "Selecciona una hoja" : "No hay hojas disponibles");
    setStatus(sheets.length ? "Selecciona una hoja para cargar sus filas." : "No hay pestañas autorizadas disponibles.", sheets.length ? "" : "warning");
  }
  async function loadRows(sourceId, sheetId) {
    rows = []; fields = []; selectedRow = null; rebuildFilters();
    if (!sourceId || !sheetId) return;
    setStatus("Leyendo encabezados y filas…", "loading");
    const payload = await request(`/api/pigpen/sheet-sources/${encodeURIComponent(sourceId)}/sheets/${encodeURIComponent(sheetId)}/rows`);
    rows = Array.isArray(payload.rows) ? payload.rows : []; fields = Array.isArray(payload.fields) ? payload.fields : [];
    rebuildFilters();
    setStatus(rows.length ? `${rows.length} filas disponibles.` : "La hoja no contiene filas importables.", rows.length ? "success" : "warning");
  }
  async function inspectNewSheet() {
    const url = clean(byId("erSheetsNewUrl")?.value);
    setManageStatus("Comprobando acceso y pestañas…", "loading");
    pendingSpreadsheet = await request("/api/pigpen/sheet-sources/inspect", { method: "POST", body: JSON.stringify({ spreadsheetUrl: url }) });
    if (!clean(byId("erSheetsNewName")?.value)) byId("erSheetsNewName").value = pendingSpreadsheet.title || "Google Sheet";
    const list = byId("erSheetsNewTabs");
    list.innerHTML = (pendingSpreadsheet.sheets || []).map((sheet) => `<label><input type="checkbox" value="${escapeHtml(sheet.sheetId)}" data-title="${escapeHtml(sheet.title)}"><span>${escapeHtml(sheet.title)}</span></label>`).join("");
    byId("btnSaveNewSheet").disabled = !(pendingSpreadsheet.sheets || []).length;
    setManageStatus(`${(pendingSpreadsheet.sheets || []).length} pestañas disponibles. Selecciona las que usará PigPen.`, "success");
  }
  async function saveNewSheet() {
    const tabs = Array.from(document.querySelectorAll("#erSheetsNewTabs input:checked")).map((input) => ({ sheetId: input.value, label: input.dataset.title, enabled: true }));
    if (!pendingSpreadsheet || !tabs.length) throw new Error("Selecciona al menos una pestaña.");
    setManageStatus("Guardando en el catálogo…", "loading");
    const payload = await request("/api/pigpen/sheet-sources", { method: "POST", body: JSON.stringify({ spreadsheetId: pendingSpreadsheet.spreadsheetId, displayName: clean(byId("erSheetsNewName")?.value) || pendingSpreadsheet.title, tabs }) });
    byId("erSheetsManagePanel")?.classList.add("hidden");
    setManageStatus("Fuente añadida.", "success");
    await loadSources(payload.source?.id || "");
  }
  async function safely(action, manage = false) { try { await action(); } catch (error) { (manage ? setManageStatus : setStatus)(clean(error?.message) || "No se pudo completar la operación.", "error"); } }
  function openImporter() {
    global.bootstrap?.Modal.getOrCreateInstance(byId("erSheetsImportModal"))?.show();
    safely(loadSources);
  }
  function wire() {
    byId("btnAttachGoogleSheet")?.addEventListener("click", openImporter);
    byId("erSheetsSourceSelect")?.addEventListener("change", (event) => safely(async () => { rows = []; fields = []; selectedRow = null; rebuildFilters(); await loadSheets(event.target.value); }));
    byId("erSheetsSheetSelect")?.addEventListener("change", () => safely(() => loadRows(byId("erSheetsSourceSelect").value, byId("erSheetsSheetSelect").value)));
    FILTERS.forEach((field, index) => byId(`erSheets${field[0].toUpperCase()}${field.slice(1)}Filter`)?.addEventListener("change", () => rebuildFilters(index)));
    byId("erSheetsRowSelect")?.addEventListener("change", (event) => { selectedRow = rows.find((row) => String(row.rowNumber) === event.target.value) || null; renderPreview(); });
    byId("btnApplySheetsImport")?.addEventListener("click", async () => {
      const button = byId("btnApplySheetsImport");
      if (!selectedRow || button?.disabled) return;
      if (button) button.disabled = true;
      try {
        const count = await config.onApply(selectedRow);
        saveLastConfig();
        global.bootstrap?.Modal.getInstance(byId("erSheetsImportModal"))?.hide();
        config.onStatus?.(`Se cargaron ${count} campos desde Google Sheets.`, "success");
      } catch (error) {
        setStatus(clean(error?.message) || "No se pudieron aplicar los datos.", "error");
      } finally {
        if (button) button.disabled = !selectedRow;
      }
    });
    byId("btnShowAddSheet")?.addEventListener("click", () => byId("erSheetsManagePanel")?.classList.toggle("hidden"));
    byId("btnInspectNewSheet")?.addEventListener("click", () => safely(inspectNewSheet, true));
    byId("btnSaveNewSheet")?.addEventListener("click", () => safely(saveNewSheet, true));
  }
  global.PigPenSheetsImport = { getLastFormState, open: openImporter, init(options) { if (config) return; config = options || {}; wire(); rebuildFilters(); } };
})(window);
