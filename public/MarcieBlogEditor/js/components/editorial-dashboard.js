import { showModal, closeActiveModal, showToast } from "./modals.js";
import { getCurrentUser } from "../services/marcie-firebase.js";
import {
  readEditorialSettings, saveCalendarItem,
  seedAidaEditorialCalendar, subscribeEditorialCalendar, subscribeEditorialNotifications, subscribeTrendSnapshots
} from "../services/marcie-editorial-store.js";
import { refreshEditorialTrends } from "../services/marcie-gemini-service.js?v=20260831r6";
import { cancelScheduledPublication, createWordPressDraft, reconcilePublicationStatus, schedulePublication, reschedulePublication } from "../services/marcie-wordpress-service.js";
import { articleVerificationBlockers } from "../contracts/editorial-contracts.js";
import { isEditorialEditor } from "../services/marcie-auth-guard.js";

const TZ = "America/Cancun";
const AUDIENCES = { educators: "Docentes", parents: "Padres", students: "Estudiantes", coordinators: "Coordinadores" };
const MODES = { marcie: "Marcie", aida: "Aida", custom: "Otro" };
const STATUS_LABELS = { idea: "Idea", planned: "Planificado", researching: "Investigación", drafting: "Redacción", review: "Revisión", approved: "Aprobado", scheduled: "Programado", blocked: "Bloqueado", cancelled: "Cancelado", published: "Publicado", failed: "Fallido" };
const TREND_REGIONS = [
  ["MX", "México · Nacional"],
  ["Norte de México", "México · Norte"],
  ["Centro de México", "México · Centro"],
  ["Bajío y Occidente de México", "México · Bajío y Occidente"],
  ["Sur y Sureste de México", "México · Sur y Sureste"],
  ["América del Norte", "América del Norte"],
  ["Latinoamérica", "Latinoamérica"],
  ["Centroamérica y Caribe", "Centroamérica y Caribe"],
  ["América del Sur", "América del Sur"],
  ["Europa", "Europa"],
  ["Asia", "Asia"],
  ["África", "África"],
  ["Oceanía", "Oceanía"],
  ["Global", "Global"]
];
const state = { items: [], trends: [], view: "month", cursor: new Date(), permissionError: "", permissionNoticeShown: false };
let trendRefreshInFlight = null;
let trendWinnerNotificationShown = false;

function esc(value = "") { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
function dateKey(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date); }
function localToUtc(localValue) { return new Date(`${localValue}:00-05:00`).toISOString(); }
function statusClass(status) { return status === "published" ? "bg-emerald-100 text-emerald-700" : status === "scheduled" ? "bg-purple-100 text-purple-700" : status === "blocked" || status === "failed" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"; }

function recordEditorialAccessError(error) {
  const code = String(error?.code || error?.message || "");
  state.permissionError = /permission-denied|Missing or insufficient permissions/i.test(code)
    ? "Firestore todavía no autorizó las colecciones editoriales compartidas para esta cuenta."
    : `No se pudo cargar la información editorial: ${String(error?.message || error)}`;
  if (!state.permissionNoticeShown) {
    state.permissionNoticeShown = true;
    showToast(state.permissionError, "error");
  }
}

function reportEditorialActionError(error, fallback = "No se pudo completar la acción editorial.") {
  const code = String(error?.code || error?.message || "");
  if (/permission-denied|Missing or insufficient permissions/i.test(code)) {
    recordEditorialAccessError(error);
    return;
  }
  showToast(String(error?.message || fallback), "error");
}

function permissionBanner() {
  return state.permissionError ? `<div class="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><b>Acceso editorial pendiente.</b> ${esc(state.permissionError)}</div>` : "";
}

function trendRegionOptions(selectedRegion = "MX") {
  const selected = String(selectedRegion || "MX");
  const options = TREND_REGIONS.some(([value]) => value === selected)
    ? TREND_REGIONS
    : [[selected, selected], ...TREND_REGIONS];
  return options.map(([value, label]) => `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(label)}</option>`).join("");
}

function trendOpportunityCard(trend = {}, index = 0) {
  const factors = trend.rankingFactors || {};
  const factorItems = [
    ["Impulso", factors.momentum], ["Frescura", factors.freshness], ["Señales", factors.signalStrength], ["Prominencia", factors.discoveryProminence]
  ].filter(([, value]) => Number.isFinite(Number(value)));
  const momentumLabels = { breakout: "Despegando", rising: "En crecimiento", emerging: "Emergente", steady: "Conversación estable" };
  const freshnessLabels = { immediate: "Ahora", recent: "Reciente", monthly: "Este mes" };
  const signals = Array.isArray(trend.signals) ? trend.signals : [];
  return `<article class="radar-rank-row radar-trend-card ${index === 0 ? "is-first" : ""}" style="--trend-share:${Math.max(0, Math.min(100, Number(trend.trendingPercent || 0)))}%"><div class="radar-rank-position"><span>${String(trend.rank || index + 1).padStart(2, "0")}</span></div><div class="radar-rank-main"><div class="radar-rank-meta"><span class="radar-confidence is-high"><i aria-hidden="true">↗</i>${esc(momentumLabels[trend.momentum] || "Tendencia detectada")}</span><span>${esc(freshnessLabels[trend.freshness] || "Reciente")}</span><span>TrendScore ${esc(trend.trendScore || 0)}</span></div><h3>${esc(trend.topic || trend.title || "Tendencia sin título")}</h3><p>${esc(trend.summary || "Sin resumen disponible.")}</p>${trend.whyNow ? `<p class="radar-why-now"><b>Por qué ahora:</b> ${esc(trend.whyNow)}</p>` : ""}<div class="radar-factor-list">${factorItems.map(([label, value]) => `<span><small>${esc(label)}</small><b>${esc(Math.round(Number(value)))}</b></span>`).join("")}</div></div><div class="radar-rank-share"><span class="radar-share-label">Trending share</span><strong>${esc(Number(trend.trendingPercent || 0).toFixed(1))}%</strong><small>cuota comparativa</small><div class="radar-share-track" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, Number(trend.trendingPercent || 0)))}%"></span></div><div class="radar-topic-actions"><button type="button" data-trend-current-session="${index}" aria-label="Crear un artículo sobre este tema en la sesión actual"><i aria-hidden="true">✎</i><span>Crear artículo aquí</span></button><button type="button" data-trend-new-session="${index}" aria-label="Crear un artículo sobre este tema en una sesión nueva"><i aria-hidden="true">＋</i><span>Crear en nueva sesión</span></button></div></div><details class="radar-rank-evidence"><summary><span>Señales que impulsan este tema</span><small>${signals.length} señales</small><i aria-hidden="true">⌄</i></summary><div class="radar-signal-panel"><ul class="radar-signal-list">${signals.map((signal) => `<li>${esc(signal)}</li>`).join("") || "<li>Sin señales detalladas.</li>"}</ul></div></details></article>`;
}

function renderCompactTrendWidget(options = {}) {
  const widget = document.getElementById("compact-trend-widget");
  if (!widget) return;

  const latest = state.trends.find((snapshot) => Array.isArray(snapshot?.opportunities));
  const leader = latest?.opportunities?.[0];
  if (!leader) {
    widget.innerHTML = `<div class="compact-trend-widget__empty"><span class="compact-trend-widget__icon" aria-hidden="true"><i data-lucide="radar"></i></span><div><h3 id="compact-trend-widget-title">Radar de tendencias</h3><p>Explora conversaciones educativas y convierte la mejor señal en un artículo.</p></div></div><button type="button" class="compact-trend-widget__open" data-compact-trend-open>Abrir radar <i data-lucide="arrow-up-right" aria-hidden="true"></i></button>`;
  } else {
    const signals = Array.isArray(leader.signals) ? leader.signals.filter(Boolean).slice(0, 2) : [];
    const trendScore = Number.isFinite(Number(leader.trendScore)) ? Math.round(Number(leader.trendScore)) : null;
    const share = Number.isFinite(Number(leader.trendingPercent)) ? Number(leader.trendingPercent).toFixed(1) : null;
    const momentumLabels = { breakout: "Despegando", rising: "En crecimiento", emerging: "Emergente", steady: "Estable" };
    const reportMeta = [latest.region, latest.periodKey].filter(Boolean).join(" · ") || "Último reporte";
    widget.innerHTML = `<header class="compact-trend-widget__header"><div><span class="compact-trend-widget__eyebrow"><i data-lucide="radar" aria-hidden="true"></i> Radar de tendencias</span><span class="compact-trend-widget__status"><i aria-hidden="true"></i>${esc(momentumLabels[leader.momentum] || "Señal activa")}</span></div><button type="button" class="compact-trend-widget__open" data-compact-trend-open>Ver radar <i data-lucide="arrow-up-right" aria-hidden="true"></i></button></header><div class="compact-trend-widget__body"><span class="compact-trend-widget__rank">Tema #1 · ${esc(reportMeta)}</span><h3 id="compact-trend-widget-title">${esc(leader.topic || leader.title || "Tendencia principal")}</h3><p>${esc(leader.summary || "Conversación educativa con oportunidad para convertirse en contenido.")}</p><div class="compact-trend-widget__metrics">${trendScore != null ? `<span><b>${esc(trendScore)}</b> TrendScore</span>` : ""}${share != null ? `<span><b>${esc(share)}%</b> share</span>` : ""}<span><b>${esc(signals.length)}</b> señales clave</span></div>${signals.length ? `<ul class="compact-trend-widget__signals">${signals.map((signal) => `<li>${esc(signal)}</li>`).join("")}</ul>` : ""}</div><footer class="compact-trend-widget__actions"><button type="button" class="compact-trend-widget__primary" data-compact-trend-current><i data-lucide="file-plus-2" aria-hidden="true"></i> Crear artículo</button><button type="button" class="compact-trend-widget__secondary" data-compact-trend-new><i data-lucide="plus" aria-hidden="true"></i> Nueva sesión</button></footer>`;
  }

  widget.querySelector("[data-compact-trend-open]")?.addEventListener("click", () => {
    void openTrends(options).catch(recordEditorialAccessError);
  });
  widget.querySelector("[data-compact-trend-current]")?.addEventListener("click", async (event) => {
    if (!leader || event.currentTarget.disabled) return;
    const button = event.currentTarget;
    const originalLabel = button.innerHTML;
    button.disabled = true;
    button.textContent = "Añadiendo…";
    try {
      await useTrendInCurrentSession(leader, options);
      showToast("Tema añadido a la sesión actual.", "success");
    } catch (error) {
      reportEditorialActionError(error, "No se pudo añadir el tema a la sesión actual.");
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.innerHTML = originalLabel;
        window.lucide?.createIcons?.();
      }
    }
  });
  widget.querySelector("[data-compact-trend-new]")?.addEventListener("click", async (event) => {
    if (!leader || event.currentTarget.disabled) return;
    const button = event.currentTarget;
    const originalLabel = button.innerHTML;
    button.disabled = true;
    button.textContent = "Creando…";
    try {
      const sessionId = await createSessionFromTrend(leader, options);
      if (!sessionId) return;
    } catch (error) {
      reportEditorialActionError(error, "No se pudo crear la sesión editorial.");
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.innerHTML = originalLabel;
        window.lucide?.createIcons?.();
      }
    }
  });
  window.lucide?.createIcons?.();
}

function eventChip(item) {
  return `<button draggable="true" data-calendar-event="${esc(item.id)}" class="calendar-event-chip" title="${esc(item.title || item.topic || "Sin título")}"><span class="calendar-event-dot" aria-hidden="true"></span><span class="calendar-event-copy"><b>${esc(item.title || item.topic || "Sin título")}</b><small>${esc(AUDIENCES[item.audience] || item.audience || "Sin público")} · ${esc(item.status || "idea")}</small></span></button>`;
}

function monthHtml() {
  const year = state.cursor.getFullYear();
  const month = state.cursor.getMonth();
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  const today = dateKey(new Date());
  for (let index = 0; index < offset; index += 1) cells.push(`<div class="calendar-day-cell is-outside" aria-hidden="true"></div>`);
  for (let day = 1; day <= days; day += 1) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const events = state.items.filter((item) => dateKey(item.publishAtUtc || item.publishAtLocal) === key);
    cells.push(`<div data-calendar-day="${key}" class="calendar-day-cell${key === today ? " is-today" : ""}"><button data-new-calendar-date="${key}" class="calendar-day-number" aria-label="Crear evento el ${day} de ${month + 1} de ${year}">${day}</button><div class="calendar-day-events">${events.map(eventChip).join("")}</div></div>`);
  }
  while (cells.length < 42) cells.push(`<div class="calendar-day-cell is-outside" aria-hidden="true"></div>`);
  return `<div class="calendar-month-scroll" tabindex="0" aria-label="Calendario mensual"><div class="calendar-month-canvas"><div class="calendar-weekdays">${["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map((day) => `<div>${day}</div>`).join("")}</div><div class="calendar-month-grid">${cells.join("")}</div></div></div>`;
}

function listHtml() {
  return `<div class="space-y-2">${state.items.map((item) => `<button data-calendar-event="${esc(item.id)}" class="grid w-full grid-cols-[1fr_auto] gap-3 rounded-xl border border-slate-200 p-3 text-left"><span><b class="block text-sm text-slate-800">${esc(item.title || item.topic)}</b><small class="text-slate-500">${esc(dateKey(item.publishAtUtc || item.publishAtLocal))} · ${esc(AUDIENCES[item.audience] || item.audience || "Sin público")} · ${esc(MODES[item.editorialMode] || item.editorialMode || "Marcie")}</small></span><i class="h-fit rounded-full px-2 py-1 text-[10px] not-italic ${statusClass(item.status)}">${esc(item.status)}</i></button>`).join("") || `<p class="py-12 text-center text-sm text-slate-500">No hay eventos.</p>`}</div>`;
}

function weekHtml() {
  const start = new Date(state.cursor);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return `<div class="calendar-week-grid">${Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start); day.setDate(start.getDate() + index);
    const key = dateKey(day);
    const events = state.items.filter((item) => dateKey(item.publishAtUtc || item.publishAtLocal) === key);
    return `<div data-calendar-day="${key}" class="calendar-week-day"><button data-new-calendar-date="${key}" class="calendar-week-label">${day.toLocaleDateString("es-MX", { weekday: "short", day: "numeric" })}</button>${events.map(eventChip).join("")}</div>`;
  }).join("")}</div>`;
}

function bindCalendar(modal, options) {
  modal.element.querySelectorAll("[data-calendar-view]").forEach((button) => button.addEventListener("click", () => { state.view = button.dataset.calendarView; openCalendar(options); }));
  modal.element.querySelector("[data-calendar-prev]")?.addEventListener("click", () => { state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() - 1, 1); openCalendar(options); });
  modal.element.querySelector("[data-calendar-next]")?.addEventListener("click", () => { state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + 1, 1); openCalendar(options); });
  modal.element.querySelectorAll("[data-new-calendar-date]").forEach((button) => button.addEventListener("click", () => openEventForm({ publishDate: button.dataset.newCalendarDate }, options)));
  modal.element.querySelectorAll("[data-calendar-event]").forEach((button) => {
    button.addEventListener("click", () => openEventForm(state.items.find((item) => item.id === button.dataset.calendarEvent) || {}, options));
    button.addEventListener("dragstart", (event) => event.dataTransfer.setData("text/calendar-item", button.dataset.calendarEvent));
  });
  modal.element.querySelectorAll("[data-calendar-day]").forEach((cell) => {
    cell.addEventListener("dragover", (event) => event.preventDefault());
    cell.addEventListener("drop", async (event) => {
      event.preventDefault();
      try {
        const item = state.items.find((entry) => entry.id === event.dataTransfer.getData("text/calendar-item"));
        if (!item) return;
        const time = String(item.publishAtLocal || "T10:00").match(/T(\d{2}:\d{2})/)?.[1] || "10:00";
        const updated = await saveCalendarItem({ ...item, publishAtLocal: `${cell.dataset.calendarDay}T${time}:00`, publishAtUtc: localToUtc(`${cell.dataset.calendarDay}T${time}`) });
        const session = options.getSessions().find((entry) => entry.id === updated.sessionId);
        if (item.status === "scheduled" && session) await reschedulePublication(session, updated);
        showToast("Evento reprogramado.", "success");
      } catch (error) {
        reportEditorialActionError(error, "No se pudo reprogramar el evento.");
      }
    });
  });
}

export function openCalendar(options = {}) {
  const label = state.cursor.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  const content = state.view === "month" ? monthHtml() : state.view === "week" ? weekHtml() : listHtml();
  const views = [["month", "Mensual"], ["week", "Semanal"], ["list", "Lista"]].map(([id, text]) => `<button type="button" data-calendar-view="${id}" class="${state.view === id ? "is-active" : ""}" aria-pressed="${state.view === id}">${text}</button>`).join("");
  const modal = showModal({ title: "Calendario editorial", widthClass: "max-w-6xl", contentHtml: `<div class="calendar-workspace">${permissionBanner()}<div class="calendar-toolbar"><div class="calendar-period-nav"><button type="button" data-calendar-prev class="calendar-icon-button" aria-label="Periodo anterior">←</button><div><b>${esc(label)}</b><small>${state.items.length} ${state.items.length === 1 ? "evento" : "eventos"}</small></div><button type="button" data-calendar-next class="calendar-icon-button" aria-label="Periodo siguiente">→</button></div><div class="calendar-toolbar-actions"><div class="calendar-view-tabs" aria-label="Vista del calendario">${views}</div><button type="button" data-new-calendar-date="${dateKey(new Date())}" class="calendar-new-button" ${state.permissionError ? "disabled" : ""}><span aria-hidden="true">＋</span> Nuevo evento</button></div></div>${content}</div>` });
  bindCalendar(modal, options);
}

async function openEventForm(item = {}, options = {}) {
  const sessions = options.getSessions?.() || [];
  const publishDate = item.publishDate || dateKey(item.publishAtUtc || item.publishAtLocal) || dateKey(new Date());
  const time = String(item.publishAtLocal || "").match(/T(\d{2}:\d{2})/)?.[1] || "10:00";
  const selectedAudiences = new Set(Array.isArray(item.audiences) && item.audiences.length ? item.audiences : [item.audience || "educators"]);
  const audienceOptions = Object.entries(AUDIENCES).map(([id, label]) => `<label class="calendar-audience-option${selectedAudiences.has(id) ? " is-selected" : ""}"><input type="checkbox" name="calendar-audience" value="${id}" ${selectedAudiences.has(id) ? "checked" : ""}><span aria-hidden="true">✓</span><b>${label}</b></label>`).join("");
  const allSelected = selectedAudiences.size === Object.keys(AUDIENCES).length;
  const currentStatus = item.status || "planned";
  const statusOptions = ["idea", "planned", "researching", "drafting", "review", "approved", "scheduled", "blocked", "cancelled"].map((status) => `<option value="${status}" ${status === currentStatus ? "selected" : ""}>${STATUS_LABELS[status]}</option>`).join("");
  const sessionOptions = sessions.map((session) => `<option value="${esc(session.id)}" ${session.id === item.sessionId ? "selected" : ""}>${esc(session.title)}</option>`).join("");
  const modeOptions = Object.entries(MODES).map(([id, label]) => `<option value="${id}" ${id === (item.editorialMode || "marcie") ? "selected" : ""}>${label}</option>`).join("");
  const linkedActions = item.sessionId ? `<button id="calendar-open-session" type="button" class="editorial-event-action is-outline">Abrir artículo</button><button id="calendar-draft-wordpress" type="button" class="editorial-event-action is-outline">Actualizar borrador WP</button><button id="calendar-reconcile" type="button" class="editorial-event-action is-ghost">Comprobar WP</button>` : "";
  const eventFormHtml = `<form id="calendar-event-form" class="editorial-event-dialog">
    <header class="editorial-event-intro">
      <span class="editorial-event-intro-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" stroke-width="1.7" stroke-linecap="round"/></svg></span>
      <div><span class="editorial-event-eyebrow">Planificación editorial</span><p>Organiza el artículo, sus públicos y la publicación desde un único lugar.</p></div>
      <span class="editorial-event-status">${esc(STATUS_LABELS[currentStatus] || currentStatus)}</span>
    </header>
    <section class="editorial-event-card">
      <div class="editorial-event-section-heading"><div><b>Contenido y sesión</b><small>Define qué se publicará y dónde se trabajará.</small></div><span>01</span></div>
      <div class="editorial-event-fields is-content">
        <label class="editorial-event-field is-wide"><span>Título del artículo</span><input id="calendar-title" class="input-field" value="${esc(item.title || item.topic || "")}" placeholder="Escribe un título editorial" required></label>
        <label class="editorial-event-field"><span>Sesión vinculada</span><select id="calendar-session" class="input-field"><option value="">Crear una sesión nueva</option>${sessionOptions}</select></label>
        <label class="editorial-event-field"><span>Modo editorial</span><select id="calendar-mode" class="input-field">${modeOptions}</select></label>
      </div>
    </section>
    <fieldset class="calendar-audience-fieldset editorial-event-card">
      <div class="editorial-event-section-heading"><div><b>Públicos</b><small>Se creará un evento independiente para cada selección.</small></div><span>02</span></div>
      <div class="calendar-audience-heading"><label class="calendar-audience-all"><input id="calendar-audience-all" type="checkbox" ${allSelected ? "checked" : ""}><span>Seleccionar todos</span></label></div>
      <div class="calendar-audience-grid">${audienceOptions}</div><p id="calendar-audience-error" role="alert" hidden>Elige al menos un público.</p>
    </fieldset>
    <section class="editorial-event-card">
      <div class="editorial-event-section-heading"><div><b>Programación</b><small>Zona horaria: America/Cancun (UTC−5).</small></div><span>03</span></div>
      <div class="editorial-event-fields is-schedule">
        <label class="editorial-event-field"><span>Fecha</span><input id="calendar-date" type="date" class="input-field" value="${publishDate}" required></label>
        <label class="editorial-event-field"><span>Hora</span><input id="calendar-time" type="time" class="input-field" value="${time}" required></label>
        <label class="editorial-event-field"><span>Estado</span><select id="calendar-status" class="input-field">${statusOptions}</select></label>
        <label class="editorial-event-field"><span>Responsable</span><input id="calendar-responsible" class="input-field" value="${esc(item.responsibleUid || getCurrentUser()?.uid || "")}" placeholder="UID del responsable"></label>
      </div>
    </section>
    <section class="editorial-event-card">
      <label class="editorial-event-field"><span>Brief y notas <small>Opcional</small></span><textarea id="calendar-notes" class="input-field" rows="3" placeholder="Contexto, enfoque o recordatorios para el equipo">${esc(item.notes || item.brief || "")}</textarea></label>
    </section>
    ${item.blockedReasons?.length ? `<aside class="editorial-event-alert" role="alert"><span aria-hidden="true">!</span><div><b>Este evento tiene pendientes</b><p>${esc(item.blockedReasons.join(" · "))}</p></div></aside>` : ""}
    <footer class="editorial-event-footer"><div class="editorial-event-secondary-actions">${linkedActions}${item.id ? `<button id="calendar-duplicate" type="button" class="editorial-event-action is-ghost">Duplicar</button>` : ""}${item.status === "scheduled" ? `<button id="calendar-cancel-schedule" type="button" class="editorial-event-action is-danger">Cancelar programación</button>` : ""}</div><div class="editorial-event-primary-actions"><button type="button" id="calendar-cancel" class="editorial-event-action is-outline">Cancelar</button><button type="submit" class="editorial-event-action is-primary"><span aria-hidden="true">✓</span> Guardar cambios</button></div></footer>
  </form>`;
  const modal = showModal({ title: item.id ? "Editar evento editorial" : "Nuevo evento editorial", widthClass: "max-w-3xl", contentHtml: eventFormHtml });
  const audienceInputs = [...modal.element.querySelectorAll('input[name="calendar-audience"]')];
  const allAudiencesInput = modal.element.querySelector("#calendar-audience-all");
  const syncAudiencePicker = () => {
    const checkedCount = audienceInputs.filter((input) => input.checked).length;
    audienceInputs.forEach((input) => input.closest(".calendar-audience-option")?.classList.toggle("is-selected", input.checked));
    allAudiencesInput.checked = checkedCount === audienceInputs.length;
    allAudiencesInput.indeterminate = checkedCount > 0 && checkedCount < audienceInputs.length;
    modal.element.querySelector("#calendar-audience-error").hidden = checkedCount > 0;
  };
  allAudiencesInput?.addEventListener("change", () => { audienceInputs.forEach((input) => { input.checked = allAudiencesInput.checked; }); syncAudiencePicker(); });
  audienceInputs.forEach((input) => input.addEventListener("change", syncAudiencePicker));
  syncAudiencePicker();
  modal.element.querySelector("#calendar-cancel")?.addEventListener("click", closeActiveModal);
  modal.element.querySelector("#calendar-open-session")?.addEventListener("click", () => { closeActiveModal(); options.onOpenSession?.(item.sessionId, item.audience); });
  const linkedSession = () => options.getSessions().find((entry) => entry.id === item.sessionId);
  modal.element.querySelector("#calendar-draft-wordpress")?.addEventListener("click", async () => {
    try {
      const session = linkedSession(); if (!session) return;
      await createWordPressDraft({ ...session, audience: item.audience, article: session.articlesByAudience?.[item.audience] || session.article });
      showToast("Borrador de WordPress actualizado.", "success");
    } catch (error) { reportEditorialActionError(error, "No se pudo actualizar el borrador de WordPress."); }
  });
  modal.element.querySelector("#calendar-reconcile")?.addEventListener("click", async () => {
    try {
      const session = linkedSession(); if (!session) return;
      const result = await reconcilePublicationStatus({ ...session, audience: item.audience });
      showToast(`WordPress: ${result.publication?.status || "sin estado"}.`, "info");
    } catch (error) { reportEditorialActionError(error, "No se pudo consultar WordPress."); }
  });
  modal.element.querySelector("#calendar-duplicate")?.addEventListener("click", () => {
    const audience = item.audience === "parents" ? "educators" : "parents";
    openEventForm({ ...item, id: "", audience, audiences: [audience], status: "planned", wordpressPublicationId: "", wordpressPostId: 0 }, options);
  });
  modal.element.querySelector("#calendar-cancel-schedule")?.addEventListener("click", async () => {
    try {
      const session = linkedSession(); if (!session) return;
      await cancelScheduledPublication({ ...session, audience: item.audience }, "Cancelada desde el calendario editorial");
      await saveCalendarItem({ ...item, status: "cancelled", blockedReasons: [] });
      closeActiveModal();
      showToast("Programación cancelada; el post volvió a borrador.", "success");
    } catch (error) { reportEditorialActionError(error, "No se pudo cancelar la programación."); }
  });
  modal.element.querySelector("#calendar-event-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const title = modal.element.querySelector("#calendar-title").value.trim();
      let sessionId = modal.element.querySelector("#calendar-session").value;
      const checkedAudiences = audienceInputs.filter((input) => input.checked).map((input) => input.value);
      const audiences = item.audience && checkedAudiences.includes(item.audience)
        ? [item.audience, ...checkedAudiences.filter((audience) => audience !== item.audience)]
        : checkedAudiences;
      if (!audiences.length) {
        modal.element.querySelector("#calendar-audience-error").hidden = false;
        audienceInputs[0]?.focus();
        return;
      }
      const editorialMode = modal.element.querySelector("#calendar-mode").value;
      if (!sessionId) sessionId = await createMarcieSession({ title, topic: title, editorialMode, editorialProfileId: editorialMode, editorialProfileVersion: 1, editorialProfileSnapshot: { name: MODES[editorialMode] }, selectedAudiences: audiences, audience: audiences[0] });
      const selectedDate = modal.element.querySelector("#calendar-date").value;
      const localInput = `${selectedDate}T${modal.element.querySelector("#calendar-time").value}`;
      const basePayload = { title, topic: title, sessionId, editorialMode, responsibleUid: modal.element.querySelector("#calendar-responsible").value.trim(), publishAtLocal: `${localInput}:00`, publishAtUtc: localToUtc(localInput), timezone: TZ, status: modal.element.querySelector("#calendar-status").value, notes: modal.element.querySelector("#calendar-notes").value.trim(), blockedReasons: [] };
      const savedItems = [];
      for (const [index, audience] of audiences.entries()) {
        const matchingVariant = index === 0
          ? item
          : state.items.find((entry) => entry.id !== item.id && entry.sessionId === sessionId && entry.audience === audience && dateKey(entry.publishAtUtc || entry.publishAtLocal) === selectedDate && (entry.title || entry.topic) === title);
        const variant = matchingVariant || { ...item, id: "", wordpressPublicationId: "", wordpressPostId: 0, lastScheduledContentHash: "" };
        savedItems.push(await saveCalendarItem({ ...variant, ...basePayload, audience }));
      }
      const session = options.getSessions().find((entry) => entry.id === sessionId);
      let blockedCount = 0;
      for (const saved of savedItems.filter((entry) => entry.status === "scheduled")) {
        const audience = saved.audience;
        if (!session) {
          await saveCalendarItem({ ...saved, status: "blocked", blockedReasons: ["La sesión debe sincronizarse antes de programar WordPress."] });
          blockedCount += 1;
          continue;
        }
        const article = session.articlesByAudience?.[audience] || (session.audience === audience ? session.article : null);
        const blockers = articleVerificationBlockers(article || {}, { editorialMode: editorialMode || session?.editorialMode });
        if (!(session.approvedAudiences || []).includes(audience)) blockers.unshift("Falta aprobación explícita.");
        if (blockers.length) {
          await saveCalendarItem({ ...saved, status: "blocked", blockedReasons: blockers });
          blockedCount += 1;
          continue;
        }
        try {
          await schedulePublication({ ...session, audience, article }, saved);
        } catch (error) {
          await saveCalendarItem({ ...saved, status: "blocked", blockedReasons: [String(error.message || error)] });
          blockedCount += 1;
        }
      }
      closeActiveModal();
      const plural = savedItems.length > 1;
      showToast(blockedCount
        ? `${savedItems.length} ${plural ? "eventos guardados" : "evento guardado"}; ${blockedCount} ${blockedCount === 1 ? "quedó bloqueado" : "quedaron bloqueados"} para publicación.`
        : `${savedItems.length} ${plural ? "eventos editoriales guardados" : "evento editorial guardado"}.`, blockedCount ? "info" : "success");
    } catch (error) {
      reportEditorialActionError(error, "No se pudo guardar el evento editorial.");
    }
  });
}

function setTrendLaunchersBusy(busy) {
  ["btn-trend-radar-header", "btn-editorial-trends"].forEach((id) => {
    const button = document.getElementById(id);
    if (!button) return;
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
  });
}

async function createSessionFromTrend(trend = {}, options = {}) {
  if (typeof options.onCreateSessionFromTrend !== "function") {
    throw new Error("No está disponible el formulario para crear la sesión editorial.");
  }
  return options.onCreateSessionFromTrend(trend);
}

async function useTrendInCurrentSession(trend = {}, options = {}) {
  if (typeof options.onUseTrendInCurrentSession !== "function") {
    throw new Error("No hay una sesión activa para recibir este tema.");
  }
  await options.onUseTrendInCurrentSession(trend);
}

function removeTrendWinnerNotification() {
  document.getElementById("trend-winner-notification")?.remove();
}

function showTrendWinnerNotification(trend = {}, options = {}, { statusLabel = "Último radar guardado" } = {}) {
  if (!trend?.topic && !trend?.title) return;
  removeTrendWinnerNotification();
  const card = document.createElement("aside");
  card.id = "trend-winner-notification";
  card.className = "radar-winner radar-winner-notification";
  card.setAttribute("role", "status");
  card.setAttribute("aria-live", "polite");
  card.setAttribute("aria-label", "Tendencia editorial ganadora");
  card.innerHTML = `<button type="button" class="radar-winner-notification-close" data-trend-notification-dismiss aria-label="Cerrar tendencia ganadora">×</button><div class="radar-winner-top"><span class="radar-winner-badge"><i aria-hidden="true">↗</i> Trending #1</span><span class="radar-winner-confidence"><i aria-hidden="true"></i> ${esc(statusLabel)}</span></div><div class="radar-winner-content"><div><span class="radar-winner-eyebrow">Tema con mayor oportunidad editorial</span><h2>${esc(trend.topic || trend.title)}</h2><p>${esc(trend.summary || "Conversación educativa con el mayor impulso detectado en esta búsqueda.")}</p></div><div class="radar-winner-score"><strong>${esc(Number(trend.trendingPercent || 0).toFixed(1))}%</strong><span>Trending share</span><small>TrendScore ${esc(trend.trendScore || 0)}/100</small></div></div><div class="radar-winner-footer"><button type="button" class="radar-winner-notification-link" data-trend-notification-open>Ver radar completo</button><div class="radar-winner-actions"><button type="button" data-trend-notification-refresh><span aria-hidden="true">↻</span> Actualizar tendencias</button><button type="button" data-trend-notification-current>Crear artículo aquí</button><button type="button" data-trend-notification-new>Crear en nueva sesión <i aria-hidden="true">→</i></button></div></div>`;
  (document.fullscreenElement || document.webkitFullscreenElement || document.body).appendChild(card);
  requestAnimationFrame(() => card.classList.add("is-visible"));

  card.querySelector("[data-trend-notification-dismiss]")?.addEventListener("click", removeTrendWinnerNotification);
  card.querySelector("[data-trend-notification-open]")?.addEventListener("click", () => {
    removeTrendWinnerNotification();
    void openTrends(options).catch(recordEditorialAccessError);
  });
  card.querySelector("[data-trend-notification-refresh]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const originalLabel = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="radar-notification-spinner" aria-hidden="true">↻</span> Buscando…';
    try {
      await refreshTrendWinnerFromNotification(options);
    } catch (error) {
      if (button.isConnected) {
        button.disabled = false;
        button.innerHTML = originalLabel;
      }
      reportEditorialActionError(error, "No se pudieron actualizar las tendencias.");
    }
  });
  card.querySelector("[data-trend-notification-current]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Añadiendo…";
    try {
      await useTrendInCurrentSession(trend, options);
      removeTrendWinnerNotification();
      showToast("Tema añadido a la sesión actual.", "success");
    } catch (error) {
      button.disabled = false;
      button.textContent = "Crear artículo aquí";
      reportEditorialActionError(error, "No se pudo añadir el tema a la sesión actual.");
    }
  });
  card.querySelector("[data-trend-notification-new]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Creando…";
    try {
      const sessionId = await createSessionFromTrend(trend, options);
      if (!sessionId) {
        button.disabled = false;
        button.textContent = "Crear en nueva sesión →";
        return;
      }
      removeTrendWinnerNotification();
    } catch (error) {
      button.disabled = false;
      button.textContent = "Crear en nueva sesión →";
      reportEditorialActionError(error, "No se pudo crear la sesión editorial.");
    }
  });
}

function showSavedTrendWinnerOnStart(snapshots = [], options = {}) {
  if (trendWinnerNotificationShown) return;
  const latest = snapshots.find((snapshot) => Array.isArray(snapshot?.opportunities) && snapshot.opportunities.length);
  const leader = latest?.opportunities?.[0];
  if (!leader) return;
  trendWinnerNotificationShown = true;
  showTrendWinnerNotification(leader, options);
}

async function refreshTrendWinnerFromNotification(options = {}) {
  if (trendRefreshInFlight) throw new Error("El radar ya está realizando una búsqueda.");
  const settings = await readEditorialSettings();
  const refreshPromise = refreshEditorialTrends({
    cadence: settings.cadence || "weekly",
    region: settings.region || "MX",
    force: true
  });
  trendRefreshInFlight = refreshPromise;
  setTrendLaunchersBusy(true);
  try {
    const result = await refreshPromise;
    if (result?.snapshot) state.trends = [result.snapshot, ...state.trends.filter((item) => item.id !== result.snapshot.id)];
    const leader = result?.snapshot?.opportunities?.[0];
    if (!leader) throw new Error("La búsqueda terminó sin un tema ganador.");
    showTrendWinnerNotification(leader, options, { statusLabel: "Radar actualizado ahora" });
    showToast("Tendencias actualizadas. Se muestra el nuevo tema ganador.", "success");
  } finally {
    if (trendRefreshInFlight === refreshPromise) trendRefreshInFlight = null;
    setTrendLaunchersBusy(false);
  }
}

export async function openTrends(options = {}) {
  let settings = { cadence: "weekly", region: "MX", timezone: TZ, discoveryMode: "general_education_brain" };
  try {
    settings = await readEditorialSettings();
  } catch (error) {
    recordEditorialAccessError(error);
  }
  const latest = state.trends[0];
  const legacy = Boolean(latest && Number(latest.schemaVersion || 0) < 6);
  const opportunities = Array.isArray(latest?.opportunities) ? latest.opportunities : [];
  const signalCount = opportunities.reduce((total, item) => total + (Array.isArray(item.signals) ? item.signals.length : 0), 0);
  const breakoutCount = opportunities.filter((item) => item.momentum === "breakout" || item.momentum === "rising").length;
  const cadence = settings.cadence || "weekly";
  const cadenceButtons = [["daily", "Diaria"], ["weekly", "Semanal"], ["monthly", "Mensual"]].map(([value, label]) => `<button type="button" data-trend-cadence="${value}" aria-pressed="${value === cadence}" class="${value === cadence ? "is-active" : ""}">${label}</button>`).join("");
  const emptyHtml = `<div class="radar-empty"><span aria-hidden="true">◎</span><h3>El radar está listo</h3><p>Inicia una exploración para descubrir y comparar conversaciones educativas emergentes.</p></div>`;
  const leader = opportunities[0];
  const reportHtml = leader ? `<section class="radar-winner"><div class="radar-winner-top"><span class="radar-winner-badge"><i aria-hidden="true">↗</i> Trending #1</span><span class="radar-winner-confidence"><i aria-hidden="true"></i> Mayor impulso detectado</span></div><div class="radar-winner-content"><div><span class="radar-winner-eyebrow">Tema con mayor oportunidad editorial</span><h2>${esc(leader.topic || "Tendencia principal")}</h2><p>${esc(leader.summary || "")}</p></div><div class="radar-winner-score"><strong>${esc(Number(leader.trendingPercent || 0).toFixed(1))}%</strong><span>Trending share</span><small>TrendScore ${esc(leader.trendScore || 0)}/100</small></div></div><div class="radar-winner-footer"><span>Convierte esta conversación en contenido mientras conserva impulso.</span><div class="radar-winner-actions"><button type="button" data-trend-current-session="0">Crear artículo aquí</button><button type="button" data-trend-new-session="0">Crear en nueva sesión <i aria-hidden="true">→</i></button></div></div></section>` : `<section class="radar-winner radar-winner--empty"><div class="radar-winner-top"><span class="radar-winner-badge"><i aria-hidden="true">↗</i> Trending #1</span></div><div><h2>Aún no hay un tema ganador</h2><p>Ejecuta el radar para detectar conversaciones educativas emergentes.</p></div><div class="radar-winner-footer"><span>El resultado principal aparecerá aquí.</span></div></section>`;
  const contentHtml = `<div class="trend-workspace trend-workspace--modern trend-workspace--studio">${permissionBanner()}<section class="radar-controls"><div class="radar-control-group"><label>Ventana de tendencia</label><div id="trend-cadence" class="trend-segmented">${cadenceButtons}</div></div><label class="radar-region"><span>Mercado / región</span><select id="trend-region">${trendRegionOptions(settings.region)}</select></label><button id="trend-refresh" type="button" class="radar-run" ${state.permissionError ? "disabled" : ""}><span aria-hidden="true">↻</span><span>Actualizar radar</span></button></section>${legacy ? `<div class="radar-legacy"><span aria-hidden="true">!</span><div><b>Este reporte pertenece al radar anterior</b><p>Ejecuta una búsqueda para reemplazarlo por el ranking actualizado.</p></div></div>` : ""}<section class="radar-overview">${reportHtml}<div class="radar-stat-grid"><article><span>Topics detectados</span><strong>${opportunities.length}</strong><small>conversaciones distintas</small></article><article><span>Señales activas</span><strong>${signalCount}</strong><small>detonantes observados</small></article><article><span>Alta velocidad</span><strong>${breakoutCount}</strong><small>despegando o creciendo</small></article></div></section><section class="radar-ranking"><header><div><span class="radar-section-kicker"><i aria-hidden="true"></i> Trending topics</span><h3>Oportunidades para tu próximo artículo</h3><p>Priorizadas por impulso, frescura y fuerza de conversación.</p></div><div class="radar-period-chip">${esc(String(latest?.region || settings.region || "MX"))}<span>·</span>${esc(String(latest?.periodKey || cadence))}</div></header><div class="radar-ranking-list">${opportunities.length ? opportunities.map((trend, index) => trendOpportunityCard(trend, index)).join("") : emptyHtml}</div></section></div>`;
  const modal = showModal({ title: "Radar de tendencias", widthClass: "max-w-7xl", contentHtml });
  let selectedCadence = cadence;
  modal.element.querySelectorAll("[data-trend-cadence]").forEach((button) => button.addEventListener("click", () => {
    selectedCadence = button.dataset.trendCadence;
    modal.element.querySelectorAll("[data-trend-cadence]").forEach((entry) => { const active = entry === button; entry.classList.toggle("is-active", active); entry.setAttribute("aria-pressed", String(active)); });
  }));
  modal.element.querySelector("#trend-refresh")?.addEventListener("click", async (event) => {
    if (trendRefreshInFlight) {
      showToast("El radar ya está realizando una búsqueda.", "info");
      return;
    }
    const button = event.currentTarget; button.disabled = true; button.classList.add("is-loading"); button.querySelector("span:last-child").textContent = "Detectando conversaciones…";
    setTrendLaunchersBusy(true);
    const resultsGrid = modal.element.querySelector(".radar-ranking-list");
    const previousResults = resultsGrid?.innerHTML || "";
    if (resultsGrid) resultsGrid.innerHTML = Array.from({ length: 4 }, () => `<div class="radar-row-skeleton" aria-label="Buscando temas emergentes"><span></span><span></span><span></span></div>`).join("");
    trendRefreshInFlight = (async () => {
      const region = modal.element.querySelector("#trend-region").value.trim();
      const result = await refreshEditorialTrends({ cadence: selectedCadence, region, force: true });
      if (result?.snapshot) state.trends = [result.snapshot, ...state.trends.filter((item) => item.id !== result.snapshot.id)];
      if (modal.element.isConnected) {
        closeActiveModal();
        await openTrends(options);
      }
      showToast("Reporte de tendencias actualizado y ordenado por potencial.", "success");
    })();
    try {
      await trendRefreshInFlight;
    } catch (error) {
      reportEditorialActionError(error, "No se pudieron actualizar las tendencias.");
      if (resultsGrid?.isConnected) resultsGrid.innerHTML = previousResults;
      if (button.isConnected) {
        button.disabled = false;
        button.classList.remove("is-loading");
        button.querySelector("span:last-child").textContent = "Reintentar búsqueda";
      }
    } finally {
      trendRefreshInFlight = null;
      setTrendLaunchersBusy(false);
    }
  });
  modal.element.querySelectorAll("[data-trend-new-session]").forEach((button) => button.addEventListener("click", async () => {
    const trend = opportunities[Number(button.dataset.trendNewSession)];
    if (!trend || button.disabled) return;
    const originalLabel = button.innerHTML;
    button.disabled = true;
    button.textContent = "Creando sesión…";
    try {
      const sessionId = await createSessionFromTrend(trend, options);
      if (!sessionId) return;
      closeActiveModal();
    } catch (error) {
      reportEditorialActionError(error, "No se pudo crear la sesión editorial.");
      if (button.isConnected) {
        button.disabled = false;
        button.innerHTML = originalLabel;
      }
    }
  }));
  modal.element.querySelectorAll("[data-trend-current-session]").forEach((button) => button.addEventListener("click", async () => {
    const trend = opportunities[Number(button.dataset.trendCurrentSession)];
    if (!trend || button.disabled) return;
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "Añadiendo…";
    try {
      await useTrendInCurrentSession(trend, options);
      closeActiveModal();
      showToast("Tema añadido a la sesión actual.", "success");
    } catch (error) {
      reportEditorialActionError(error, "No se pudo añadir el tema a la sesión actual.");
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    }
  }));
}

export function initEditorialDashboard(options = {}) {
  renderCompactTrendWidget(options);
  isEditorialEditor(getCurrentUser()).then((canEdit) => {
    if (canEdit) seedAidaEditorialCalendar().catch(recordEditorialAccessError);
  }).catch(recordEditorialAccessError);
  subscribeEditorialCalendar((items) => { state.items = items; state.permissionError = ""; }, recordEditorialAccessError);
  subscribeTrendSnapshots((items) => {
    state.trends = items;
    renderCompactTrendWidget(options);
    showSavedTrendWinnerOnStart(items, options);
  }, recordEditorialAccessError);
  subscribeEditorialNotifications((items) => {
    window.__marcieEditorialNotifications = items;
    const button = document.getElementById("btn-notification-topbar");
    if (button) button.title = `${items.length} notificaciones editoriales`;
  }, recordEditorialAccessError);
  document.getElementById("btn-editorial-calendar")?.addEventListener("click", () => openCalendar(options));
  ["btn-trend-radar-header", "btn-editorial-trends"].forEach((id) => {
    document.getElementById(id)?.addEventListener("click", () => { void openTrends(options).catch(recordEditorialAccessError); });
  });
}
