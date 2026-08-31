const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const dashboard = fs.readFileSync(path.join(root, "public/MarcieBlogEditor/js/components/editorial-dashboard.js"), "utf8");
const editorApp = fs.readFileSync(path.join(root, "public/MarcieBlogEditor/js/editor-app.js"), "utf8");
const editorHtml = fs.readFileSync(path.join(root, "public/MarcieBlogEditor/MarcieBlogEditor.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "public/MarcieBlogEditor/css/MarcieBlogEditor.css"), "utf8");

test("el mes usa una cuadrícula compacta y completa de seis semanas", () => {
  assert.match(dashboard, /while \(cells\.length < 42\)/);
  assert.match(dashboard, /class="calendar-month-grid"/);
  assert.doesNotMatch(dashboard, /class="min-h-28 border border-slate-100/);
  assert.match(styles, /\.calendar-day-cell \{[^}]*height: 4\.45rem/s);
});

test("el formulario permite varios públicos y la opción Todos", () => {
  assert.match(dashboard, /id="calendar-audience-all"/);
  assert.match(dashboard, /name="calendar-audience"/);
  assert.match(dashboard, /selectedAudiences: audiences/);
  assert.match(dashboard, /for \(const \[index, audience\] of audiences\.entries\(\)\)/);
  assert.match(dashboard, /saveCalendarItem\(\{ \.\.\.variant, \.\.\.basePayload, audience \}\)/);
  assert.match(dashboard, /class="editorial-event-dialog"/);
  assert.match(dashboard, /class="editorial-event-card"/);
  assert.match(dashboard, /class="editorial-event-action is-primary"/);
  assert.match(styles, /\.editorial-event-fields\.is-schedule \{ grid-template-columns: repeat\(4,minmax\(0,1fr\)\); \}/);
});

test("el calendario tiene controles segmentados y adaptación móvil", () => {
  assert.match(dashboard, /class="calendar-view-tabs"/);
  assert.match(dashboard, /aria-pressed=/);
  assert.match(styles, /\.calendar-month-canvas \{ min-width: 660px; \}/);
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]*\.calendar-audience-grid \{ grid-template-columns: repeat\(2,minmax\(0,1fr\)\); \}/);
});

test("el subheader muestra y sincroniza el modo editorial de la sesión", () => {
  assert.match(editorHtml, /id="editorial-mode-badge"/);
  assert.match(editorHtml, /id="editorial-mode-badge-label"/);
  assert.match(editorApp, /function renderEditorialModeBadge\(session = null\)/);
  assert.match(editorApp, /renderEditorialModeBadge\(session\);/);
  assert.match(editorApp, /marcie: "Modo Marcie", aida: "Modo Aida", custom: "Modo Otro"/);
  assert.match(styles, /\.editorial-mode-badge\[data-mode="aida"\]/);
});

test("el header abre el radar y conserva la actualización manual", () => {
  assert.match(editorHtml, /id="btn-trend-radar-header"/);
  assert.match(editorHtml, />Radar de tendencias</);
  assert.match(dashboard, /openTrends\(options\)/);
  assert.match(dashboard, /id="trend-refresh"/);
  assert.match(dashboard, />Actualizar radar</);
  assert.doesNotMatch(dashboard, /radar-scope|Descubrimiento editorial abierto/);
  assert.match(dashboard, /Trending #1/);
  assert.match(dashboard, /cuota comparativa/);
  assert.doesNotMatch(dashboard, /radar-method|Cómo leer este radar|Metodología y límites/);
  assert.doesNotMatch(dashboard, /id="trend-topics"/);
  assert.match(styles, /\.radar-winner \{/);
  assert.match(styles, /\.radar-rank-row\.is-first/);
  assert.match(styles, /\.marcie-modal-panel:has\(\.trend-workspace--modern\)/);
});

test("al iniciar el sitio muestra una vez el ganador guardado sin buscar automáticamente", () => {
  assert.match(dashboard, /showSavedTrendWinnerOnStart\(items, options\)/);
  assert.match(dashboard, /let trendWinnerNotificationShown = false/);
  assert.match(dashboard, /trendWinnerNotificationShown = true/);
  assert.doesNotMatch(dashboard, /marcie_trend_winner_login|lastSignInTime/);
  assert.doesNotMatch(dashboard, /refreshTrendWinnerOnLogin|scheduleBackgroundRadar|window\.requestIdleCallback/);
  assert.match(dashboard, /className = "radar-winner radar-winner-notification"/);
  assert.match(dashboard, /aria-label", "Tendencia editorial ganadora"/);
  assert.match(dashboard, /data-trend-notification-refresh/);
  assert.match(dashboard, /refreshTrendWinnerFromNotification\(options\)/);
  assert.match(dashboard, /data-trend-notification-current/);
  assert.match(dashboard, /data-trend-notification-new/);
  assert.match(dashboard, /data-trend-notification-open/);
  assert.match(styles, /\.radar-winner-notification \{[\s\S]*position: fixed/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.radar-winner-notification/);
});

test("el radar conserva el reporte, ofrece regiones amplias y crea sesiones por tendencia", () => {
  assert.match(dashboard, /<select id="trend-region">/);
  assert.match(dashboard, /México · Nacional/);
  assert.match(dashboard, /América del Norte/);
  assert.match(dashboard, /Latinoamérica/);
  assert.match(dashboard, /América del Sur/);
  assert.match(dashboard, /Europa/);
  assert.match(dashboard, /Asia/);
  assert.match(dashboard, /África/);
  assert.match(dashboard, /Oceanía/);
  assert.match(dashboard, /force: true/);
  assert.match(dashboard, /state\.trends = \[result\.snapshot/);
  assert.match(dashboard, /data-trend-new-session=/);
  assert.match(dashboard, /Crear en nueva sesión/);
  assert.match(dashboard, /data-trend-current-session=/);
  assert.match(dashboard, /Crear artículo aquí/);
  assert.match(dashboard, /createMarcieSession\(\{/);
  assert.match(dashboard, /status: "trends_ready"/);
  assert.match(dashboard, /options\.onOpenSession\?\.\(sessionId, "educators"\)/);
  assert.match(editorApp, /onUseTrendInCurrentSession: async \(trend\)/);
  assert.match(editorApp, /session\.trends = \[\{ \.\.\.trend, sources: \[\] \}\]/);
  assert.doesNotMatch(dashboard, /class="radar-command"/);
  assert.doesNotMatch(dashboard, /Inteligencia editorial/);
});

test("el radar usa una composición studio legible y responsive sin cambiar hooks", () => {
  assert.match(dashboard, /trend-workspace--studio/);
  assert.match(dashboard, /title: "Radar de tendencias"/);
  assert.match(dashboard, /class="[^"]*radar-trend-card/);
  assert.match(dashboard, /class="radar-section-kicker"/);
  assert.match(dashboard, /data-trend-current-session=/);
  assert.match(dashboard, /data-trend-new-session=/);
  assert.match(dashboard, /aria-label="Crear un artículo sobre este tema en la sesión actual"/);
  assert.match(dashboard, /aria-label="Crear un artículo sobre este tema en una sesión nueva"/);
  assert.match(styles, /\.trend-workspace--studio \.radar-ranking-list \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.trend-workspace--studio \.radar-rank-main h3 \{[\s\S]*font-size: 17px/);
  assert.match(styles, /\.radar-rank-share > \.radar-share-track \{/);
  assert.doesNotMatch(styles, /\.radar-rank-share > div \{/);
  assert.match(styles, /\.trend-workspace--studio \.radar-topic-actions button \{[\s\S]*display: inline-flex/);
  assert.match(styles, /\.trend-workspace--studio \.radar-winner-content h2 \{[\s\S]*font-size: clamp\(25px, 2\.2vw, 36px\)/);
  assert.match(styles, /@media \(max-width: 1180px\)[\s\S]*\.trend-workspace--studio \.radar-ranking-list/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.trend-workspace--studio \.radar-trend-card/);
  assert.doesNotMatch(styles, /#trend-(?:refresh|region|cadence)/);
});
