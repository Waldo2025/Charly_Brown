import { escapeHtml } from "./ui-components.js";
import { getFocusedSya, getSyaGroupedByCategory, hasAllSelection } from "./sya-service.js";
import { isProjectSelection } from "./unit-contracts.js";

const COLLAPSE_PREFIX = "cbAcceptedCollapse:";

export function renderAcceptedPanel({
  root,
  session,
  readingOptions = [],
  readingFilter = "",
  onRefreshReadings,
  onFilterReadings,
  onUseReading,
  onEditActivity,
  onRegenerateActivity,
  onRemoveActivity,
  onGenerateNotesForActivity,
  onGenerateGlobalNotes
} = {}) {
  const panel = root?.querySelector("#cbAcceptedPanel");
  const globalBtn = root?.querySelector("#cbGenerateGlobalNotesBtn");
  if (!panel) return;

  const accepted = session?.accepted || {};
  const activities = accepted.activities || [];
  const teacherNotes = accepted.teacherNotes || [];
  const visibleReadings = filterReadings(readingOptions, readingFilter);
  const hasEditedSya = hasEditedSyaVersion(session);
  const projectMode = isProjectSelection(session?.meta || {});

  if (globalBtn) globalBtn.onclick = () => onGenerateGlobalNotes?.();

  panel.innerHTML = [
    renderCollapsibleSection({
      key: "readings-dock",
      title: "Lecturas",
      actions: `<button type="button" data-reading-panel-action="refresh">Cargar</button>`,
      body: `
        <input class="cb-reading-search" type="search" value="${escapeHtml(readingFilter)}" placeholder="Filtrar por título, grado, unidad o texto..." aria-label="Filtrar lecturas">
        <div class="cb-reading-panel-list">
          ${visibleReadings.length ? visibleReadings.map(renderReadingOption).join("") : `<div class="cb-empty">Carga lecturas para elegir una.</div>`}
        </div>
      `,
      extraClass: "cb-reading-dock",
      openByDefault: true
    }),
    accepted.reading
      ? renderSelectedReadingSection(accepted.reading)
      : renderCollapsibleSection({
          key: "reading-selected",
          title: "Lectura",
          body: `<div class="cb-empty">Pendiente</div>`,
          extraClass: "cb-approved-card cb-approved-card--empty",
          openByDefault: true
        }),
    accepted.sya
      ? renderCollapsibleSection({
          key: "sya",
          title: "Secuencia y alcance",
          kicker: "Secuencia",
          actions: `
            <button type="button" data-sya-action="edit">Editar</button>
            ${hasEditedSya ? `<button type="button" data-sya-action="restore">Restaurar original</button>` : ""}
          `,
          body: renderSyaSummary(session?.meta || {}, accepted.sya),
          extraClass: "cb-approved-card",
          openByDefault: true
        })
      : renderCollapsibleSection({
          key: "sya",
          title: "Secuencia y alcance",
          kicker: "Secuencia",
          body: `<div class="cb-empty">Pendiente</div>`,
          extraClass: "cb-approved-card cb-approved-card--empty",
          openByDefault: true
        }),
    renderCollapsibleSection({
      key: "activities",
      title: projectMode ? "Proyectos aprobados" : "Activities aprobadas",
      body: activities.length ? activities.map((activity) => renderActivity(activity, projectMode)).join("") : `<div class="cb-empty">${projectMode ? "Acepta un proyecto para verlo aquí." : "Acepta una activity para verla aquí."}</div>`,
      extraClass: "cb-accepted-section",
      openByDefault: true
    }),
    renderCollapsibleSection({
      key: "teacher-notes",
      title: projectMode ? "Notas del proyecto" : "Notas globales del maestro",
      body: teacherNotes.length ? teacherNotes.map((notes) => renderTeacherNotesBlock(notes)).join("") : `<div class="cb-empty">Genera notas con activities aprobadas.</div>`,
      extraClass: "cb-accepted-section",
      openByDefault: true
    })
  ].join("");

  panel.querySelector("[data-reading-panel-action='refresh']")?.addEventListener("click", (event) => {
    event.stopPropagation();
    onRefreshReadings?.();
  });
  panel.querySelector(".cb-reading-search")?.addEventListener("input", (event) => onFilterReadings?.(event.target.value));
  panel.querySelectorAll("[data-reading-action='use']").forEach((button) => {
    button.addEventListener("click", () => onUseReading?.(button.closest("[data-reading-id]")?.dataset.readingId || ""));
  });
  panel.querySelectorAll("[data-sya-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.syaAction || "";
      if (action === "edit") {
        root?.dispatchEvent(new CustomEvent("cb:sya-edit"));
      }
      if (action === "restore") {
        root?.dispatchEvent(new CustomEvent("cb:sya-restore"));
      }
    });
  });
  panel.querySelectorAll("[data-activity-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.closest("[data-activity-id]")?.dataset.activityId || "";
      if (button.dataset.activityAction === "edit") onEditActivity?.(id);
      if (button.dataset.activityAction === "regenerate") onRegenerateActivity?.(id);
      if (button.dataset.activityAction === "remove") onRemoveActivity?.(id);
      if (button.dataset.activityAction === "notes") onGenerateNotesForActivity?.(id);
    });
  });
  panel.querySelectorAll("[data-collapse-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.collapseToggle || "";
      const shell = button.closest("[data-collapse-shell]");
      if (!shell || !key) return;
      const next = shell.dataset.collapsed !== "true";
      shell.dataset.collapsed = next ? "true" : "false";
      button.setAttribute("aria-expanded", next ? "false" : "true");
      setCollapsedState(key, next);
    });
  });
}

function renderCollapsibleSection({ key = "", title = "", kicker = "", body = "", actions = "", extraClass = "", openByDefault = true } = {}) {
  const collapsed = getCollapsedState(key, !openByDefault);
  return `
    <section class="cb-collapsible ${extraClass}" data-collapse-shell="${escapeHtml(key)}" data-collapsed="${collapsed ? "true" : "false"}">
      <div class="cb-collapsible-head">
        <button type="button" class="cb-collapsible-toggle" data-collapse-toggle="${escapeHtml(key)}" aria-expanded="${collapsed ? "false" : "true"}">
          <span>
            ${kicker ? `<span class="cb-panel-kicker">${escapeHtml(kicker)}</span>` : ""}
            <strong>${escapeHtml(title)}</strong>
          </span>
          <i class="fas fa-chevron-down" aria-hidden="true"></i>
        </button>
        ${actions ? `<div class="cb-collapsible-actions">${actions}</div>` : ""}
      </div>
      <div class="cb-collapsible-body">
        ${body}
      </div>
    </section>
  `;
}

function renderSelectedReadingSection(reading = {}) {
  const sections = reading.sections || {};
  const synonymRows = Array.isArray(sections.synonyms) ? sections.synonyms : [];
  const questions = Array.isArray(sections.questions) ? sections.questions : reading.questions || [];
  const questionsHtml = String(sections.questionsHtml || "").trim();

  return renderCollapsibleSection({
    key: "reading-selected",
    title: reading.title || "Lectura aprobada",
    kicker: "Lectura",
    extraClass: "cb-approved-card",
    openByDefault: true,
    body: [
      renderCollapsibleSection({
        key: "reading-body",
        title: "Lectura",
        body: `<div class="cb-approved-html">${sections.narrativeHtml || reading.html || ""}</div>`,
        extraClass: "cb-collapsible-subsection",
        openByDefault: true
      }),
      renderCollapsibleSection({
        key: "reading-synonyms",
        title: "Tabla de sinónimos",
        body: synonymRows.length ? renderSynonymsTable(synonymRows) : `<div class="cb-empty">Sin tabla de sinónimos guardada.</div>`,
        extraClass: "cb-collapsible-subsection",
        openByDefault: false
      }),
      renderCollapsibleSection({
        key: "reading-questions",
        title: "Preguntas de comprensión",
        body: questions.length ? renderReadingQuestions(questions) : (questionsHtml ? `<div class="cb-reading-questions">${questionsHtml}</div>` : `<div class="cb-empty">Sin preguntas de comprensión guardadas.</div>`),
        extraClass: "cb-collapsible-subsection",
        openByDefault: false
      })
    ].join("")
  });
}

function renderReadingOption(reading = {}) {
  const questionsCount = Array.isArray(reading.questions) ? reading.questions.length : 0;
  const synonymsCount = Array.isArray(reading.sections?.synonyms) ? reading.sections.synonyms.length : 0;
  return `
    <article class="cb-reading-option cb-reading-option--panel" data-reading-id="${escapeHtml(reading.id)}">
      <div>
        <p class="cb-panel-kicker">${escapeHtml(reading.sourceLabel || reading.collection || "Lectura")}</p>
        <h3>${escapeHtml(reading.title || "Lectura sin título")}</h3>
        <span>${escapeHtml([reading.meta?.nivel, reading.meta?.grado, reading.meta?.trimestre ? `T${reading.meta.trimestre}` : "", reading.meta?.unidad ? `U${reading.meta.unidad}` : ""].filter(Boolean).join(" · "))}</span>
        <p>${escapeHtml(String(reading.text || "").slice(0, 160))}</p>
        <span>${escapeHtml([
          questionsCount ? `${questionsCount} preguntas` : "Sin preguntas",
          synonymsCount ? `${synonymsCount} sinónimos` : ""
        ].filter(Boolean).join(" · "))}</span>
      </div>
      <button type="button" data-reading-action="use">Usar</button>
    </article>
  `;
}

function filterReadings(readings = [], filter = "") {
  const needle = normalize(filter);
  if (!needle) return readings;
  return readings.filter((reading) => normalize([
    reading.title,
    reading.text,
    reading.collection,
    reading.sourceLabel,
    reading.meta?.nivel,
    reading.meta?.grado,
    reading.meta?.trimestre,
    reading.meta?.unidad
  ].join(" ")).includes(needle));
}

function renderSyaSummary(meta = {}, sya = {}) {
  const focus = getFocusedSya(meta, sya);
  const grouped = getSyaGroupedByCategory(meta, sya);
  if (!grouped.length) return `<div class="cb-empty">Secuencia sin campos visibles para esta selección.</div>`;
  return `
    ${focus?.subtopic && !hasAllSelection(meta.subtopic) ? `
      <section class="cb-sya-focus">
        <p class="cb-panel-kicker">S&A activa</p>
        <h4>${escapeHtml(focus.category ? `${focus.category} · ${formatSyaKey(focus.subtopic)}` : formatSyaKey(focus.subtopic))}</h4>
        <dl class="cb-sya-summary cb-sya-summary--focus">
          ${renderSyaFieldEntries(focus.fields)}
        </dl>
      </section>
    ` : ""}
    <div class="cb-sya-groups">
      ${grouped.map((group) => `
        <section class="cb-sya-group">
          <h4>${escapeHtml(group.category)}</h4>
          ${group.items.map((item) => `
            <div class="cb-sya-subtopic">
              <strong>${escapeHtml(formatSyaKey(item.subtopic))}</strong>
              <dl class="cb-sya-summary">
                ${renderSyaFieldEntries(item.fields)}
              </dl>
            </div>
          `).join("")}
        </section>
      `).join("")}
    </div>
  `;
}

function renderSyaFieldEntries(fields = {}) {
  const ordered = [
    ["T", fields.T],
    ["AE", fields.AE],
    ["C", fields.C],
    ["P", fields.P]
  ].filter(([, value]) => String(value || "").trim());
  return ordered.map(([label, value]) => `
    <div>
      <dt>${escapeHtml(formatSyaFieldLabel(label))}</dt>
      <dd>${escapeHtml(String(value || ""))}</dd>
    </div>
  `).join("");
}

function renderActivity(activity = {}, projectMode = false) {
  return `
    <article class="cb-approved-card" data-activity-id="${escapeHtml(activity.id)}">
      <div class="cb-approved-card-head">
        <strong>${escapeHtml(activity.title || (projectMode ? "Proyecto aprobado" : "Activity aprobada"))}</strong>
        <div>
          <button type="button" data-activity-action="edit">Editar</button>
          <button type="button" data-activity-action="regenerate">Regenerar</button>
          <button type="button" data-activity-action="notes">${projectMode ? "Generar notas del proyecto" : "Generar notas"}</button>
          <button type="button" data-activity-action="remove">Quitar</button>
        </div>
      </div>
      <div class="cb-approved-html">${activity.html || ""}</div>
      ${(activity.notes || []).map((note) => `<div class="cb-note-inline"><strong>Notas del maestro</strong>${note.html || ""}</div>`).join("")}
    </article>
  `;
}

function renderTeacherNotesBlock(notes = {}) {
  return `
    <section class="cb-approved-card">
      <h3>Notas del maestro</h3>
      <div class="cb-approved-html">${notes.html || ""}</div>
    </section>
  `;
}

function renderSynonymsTable(rows = []) {
  return `
    <div class="cb-synonyms-table-wrap">
      <table class="cb-synonyms-table lectura-tabla-sinonimos">
        <thead>
          <tr>
            <th>Palabra</th>
            <th>Sinónimo simple</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((item) => `
            <tr>
              <td>${escapeHtml(item.palabra || "—")}</td>
              <td>${escapeHtml(item.sinonimos || "—")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderReadingQuestions(questions = []) {
  if (!Array.isArray(questions) || !questions.length) {
    return `<div class="cb-empty">Sin preguntas de comprensión guardadas.</div>`;
  }
  return `
    <div class="cb-reading-questions">
      <ol>
        ${questions.map((question) => `
          <li>
            <div class="cb-reading-question-text">${escapeHtml(question.texto || question.prompt || question.pregunta || "Pregunta")}</div>
            <div class="cb-reading-question-meta">
              ${(question.level || question.nivel) ? `<span>Nivel taxonómico: ${escapeHtml(question.level || question.nivel)}</span>` : ""}
              ${(question.criteria || question.criterio) ? `<span>Criterio: ${escapeHtml(question.criteria || question.criterio)}</span>` : ""}
            </div>
            ${(question.respuesta || question.answer) ? `<div class="cb-reading-answer">Respuesta esperada: ${escapeHtml(question.respuesta || question.answer)}</div>` : ""}
          </li>
        `).join("")}
      </ol>
    </div>
  `;
}

function formatSyaKey(key = "") {
  return String(key).replace(/_/g, " ").replace(/\bAE\b/g, "Aprendizaje esperado");
}

function formatSyaFieldLabel(label = "") {
  if (label === "T") return "Tema";
  if (label === "AE") return "Aprendizaje esperado";
  if (label === "C") return "Contenido";
  if (label === "P") return "Proceso o práctica";
  return label;
}

function normalize(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getCollapsedState(key = "", fallback = false) {
  try {
    return localStorage.getItem(`${COLLAPSE_PREFIX}${key}`) === "1" ? true : fallback;
  } catch (_) {
    return fallback;
  }
}

function setCollapsedState(key = "", collapsed = false) {
  try {
    localStorage.setItem(`${COLLAPSE_PREFIX}${key}`, collapsed ? "1" : "0");
  } catch (_) {}
}

function hasEditedSyaVersion(session = {}) {
  const active = session?.accepted?.sya || session?.sya || null;
  const original = session?.accepted?.syaOriginal || session?.syaOriginal || null;
  if (!active || !original) return false;
  try {
    return JSON.stringify(active) !== JSON.stringify(original);
  } catch (_) {
    return false;
  }
}
