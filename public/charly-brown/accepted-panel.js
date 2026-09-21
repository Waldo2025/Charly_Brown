import { escapeHtml } from "./ui-components.js";
import { getFocusedSya, getSyaGroupedByCategory, hasAllSelection } from "./sya-service.js";
import { isProjectSelection } from "./unit-contracts.js";
import { collectSessionBibliography } from "./bibliography.js";
import { normalizeActivitySubtopicTitle } from "./activity-label.js";


const COLLAPSE_PREFIX = "cbAcceptedCollapse:";
export function renderAcceptedPanel({
  root,
  session,
  readingOptions = [],
  readingFilter = "",
  onNewSession,
  onFilterReadings,
  onUseReading,
  onOpenReadingsPanel,
  onRemoveReading,
  onEditUnit,
  onRemoveUnit,
  onEditReadingSection,
  onEditActivity,
  onEditResource,
  onRegenerateActivity,
  onRegenerateResource,
  onRemoveActivity,
  onRemoveResource,
  onOpenUnit,
  onGenerateNotesForActivity,
  onGenerateNotesForResource,
  onGenerateGlobalNotes,
  onEditTeacherNotes,
  onDeleteTeacherNotes
} = {}) {
  const panel = root?.querySelector("#cbAcceptedPanel");
  const globalBtn = root?.querySelector("#cbGenerateGlobalNotesBtn");
  if (!panel) return;

  if (globalBtn) globalBtn.onclick = () => onGenerateGlobalNotes?.();
  const units = Array.isArray(session?.units) ? session.units : [];
  if (!units.length) {
    panel.innerHTML = "";
    return;
  }
  panel.innerHTML = `${units.map((unit) => renderUnitPanel(unit, unit.id === session.activeUnitId)).join("")}${renderSessionBibliography(session)}`;
  installApprovedContentActions(panel, { onEditReadingSection, onEditActivity, onEditResource });

  panel.querySelectorAll("[data-reading-panel-action='open']").forEach((button) => {
    button.addEventListener("click", () => onOpenReadingsPanel?.());
  });
  panel.querySelectorAll("[data-reading-panel-action='remove']").forEach((button) => {
    button.addEventListener("click", () => {
      const unitId = button.closest("[data-unit-id]")?.dataset.unitId || "";
      if (unitId) onRemoveReading?.(unitId);
    });
  });
  panel.querySelector("[data-sya-panel-action='open']")?.addEventListener("click", () => {
    root?.dispatchEvent(new CustomEvent("cb:sya-edit"));
  });
  panel.querySelectorAll("[data-unit-action='new']").forEach((button) => {
    button.addEventListener("click", () => onNewSession?.());
  });
  panel.querySelectorAll("[data-unit-action='open']").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.closest("[data-unit-id]")?.dataset.unitId || "";
      if (!id) return;
      onOpenUnit?.(id);
    });
  });
  panel.querySelectorAll("[data-unit-action='edit']").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.closest("[data-unit-id]")?.dataset.unitId || "";
      if (id) onEditUnit?.(id);
    });
  });
  panel.querySelectorAll("[data-unit-action='remove']").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.closest("[data-unit-id]")?.dataset.unitId || "";
      if (id) onRemoveUnit?.(id);
    });
  });
  panel.querySelectorAll("[data-activity-action]").forEach((button) => {
    button.addEventListener("click", () => {
      button.closest("details")?.removeAttribute("open");
      const id = button.closest("[data-activity-id]")?.dataset.activityId || "";
      const unitId = button.closest("[data-unit-id]")?.dataset.unitId || "";
      if (button.dataset.activityAction === "edit") onEditActivity?.(id, unitId);
      if (button.dataset.activityAction === "regenerate") onRegenerateActivity?.(id, unitId);
      if (button.dataset.activityAction === "remove") onRemoveActivity?.(id, unitId);
      if (button.dataset.activityAction === "notes") onGenerateNotesForActivity?.(id, unitId);
    });
  });
  panel.querySelectorAll("[data-resource-action]").forEach((button) => {
    button.addEventListener("click", () => {
      button.closest("details")?.removeAttribute("open");
      const id = button.closest("[data-resource-id]")?.dataset.resourceId || "";
      const unitId = button.closest("[data-unit-id]")?.dataset.unitId || "";
      if (button.dataset.resourceAction === "edit") onEditResource?.(id, unitId);
      if (button.dataset.resourceAction === "regenerate") onRegenerateResource?.(id, unitId);
      if (button.dataset.resourceAction === "notes") onGenerateNotesForResource?.(id, unitId);
      if (button.dataset.resourceAction === "remove") onRemoveResource?.(id, unitId);
    });
  });
  panel.querySelectorAll(".cb-card-menu > summary").forEach((summary) => {
    summary.addEventListener("click", () => {
      const activeMenu = summary.parentElement;
      panel.querySelectorAll(".cb-card-menu[open]").forEach((menu) => {
        if (menu !== activeMenu) menu.removeAttribute("open");
      });
      requestAnimationFrame(() => {
        if (activeMenu?.open) positionCardMenu(activeMenu);
      });
    });
  });
  panel.onscroll = () => {
    panel.querySelectorAll(".cb-card-menu[open]").forEach((menu) => menu.removeAttribute("open"));
  };
  panel.querySelectorAll("[data-teacher-notes-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest("[data-teacher-notes-id]");
      const id = card?.dataset.teacherNotesId || "";
      const unitId = button.closest("[data-unit-id]")?.dataset.unitId || "";
      if (button.dataset.teacherNotesAction === "save") {
        const editable = card?.querySelector(".cb-teacher-notes-editable");
        const html = editable?.innerHTML ?? "";
        onEditTeacherNotes?.(id, html, unitId);
      }
      if (button.dataset.teacherNotesAction === "delete") onDeleteTeacherNotes?.(id, unitId);
    });
  });
  panel.querySelectorAll("[data-collapse-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const unitId = button.closest("[data-unit-id]")?.dataset.unitId || "";
      if (unitId && unitId !== session.activeUnitId) onOpenUnit?.(unitId);
      const key = button.dataset.collapseToggle || "";
      const shell = button.closest("[data-collapse-shell]");
      if (!shell || !key) return;
      const next = shell.dataset.collapsed !== "true";
      shell.dataset.collapsed = next ? "true" : "false";
      button.setAttribute("aria-expanded", next ? "false" : "true");
      setCollapsedState(key, next);
    });
  });
  panel.querySelectorAll("[data-approved-card-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const shell = button.closest("[data-approved-card-shell]");
      const key = shell?.dataset.approvedCardShell || "";
      if (!shell || !key) return;
      const next = shell.dataset.cardCollapsed !== "true";
      shell.dataset.cardCollapsed = next ? "true" : "false";
      button.setAttribute("aria-expanded", next ? "false" : "true");
      setCollapsedState(`approved-card-${key}`, next);
    });
  });
}

function installApprovedContentActions(panel, { onEditReadingSection, onEditActivity, onEditResource } = {}) {
  panel.querySelectorAll(".cb-approved-html, .cb-reading-content-section, .cb-bibliography-groups").forEach((content) => {
    if (content.querySelector(":scope > .cb-content-actions")) return;
    content.classList.add("cb-content-action-host");
    const row = document.createElement("div");
    row.className = "cb-content-actions";
    const editable = Boolean(content.dataset.readingPart || content.closest("[data-activity-id], [data-resource-id], [data-teacher-notes-id]"));
    row.innerHTML = `
      <button type="button" class="cb-content-action-button" data-content-command="copy" aria-label="Copiar contenido para Word" title="Copiar contenido para Word"><i class="far fa-copy" aria-hidden="true"></i></button>
      ${editable ? `<button type="button" class="cb-content-action-button" data-content-command="edit" aria-label="Editar contenido" title="Editar contenido"><i class="fas fa-pen" aria-hidden="true"></i></button>` : ""}
    `;
    content.append(row);
    row.querySelector("[data-content-command='copy']")?.addEventListener("click", async () => {
      const button = row.querySelector("[data-content-command='copy']");
      try {
        await copyContentForWord(content);
        button?.classList.add("is-copied");
        if (button) {
          button.innerHTML = `<i class="fas fa-check" aria-hidden="true"></i>`;
          button.title = "Contenido copiado";
        }
        window.setTimeout(() => {
          if (!button) return;
          button.classList.remove("is-copied");
          button.innerHTML = `<i class="far fa-copy" aria-hidden="true"></i>`;
          button.title = "Copiar contenido para Word";
        }, 1800);
      } catch (_) {
        if (button) button.title = "No fue posible copiar el contenido";
      }
    });
    row.querySelector("[data-content-command='edit']")?.addEventListener("click", () => {
      const unitId = content.closest("[data-unit-id]")?.dataset.unitId || "";
      const activityId = content.closest("[data-activity-id]")?.dataset.activityId || "";
      const resourceId = content.closest("[data-resource-id]")?.dataset.resourceId || "";
      const notes = content.closest("[data-teacher-notes-id]");
      if (content.dataset.readingPart) onEditReadingSection?.(content.dataset.readingPart, unitId);
      else if (activityId) onEditActivity?.(activityId, unitId);
      else if (resourceId) onEditResource?.(resourceId, unitId);
      else if (notes) content.focus();
    });
  });
}

async function copyContentForWord(content) {
  const clone = content.cloneNode(true);
  clone.querySelector(".cb-content-actions")?.remove();
  const html = `<div style="font-family:Aptos,Arial,sans-serif;font-size:11pt;line-height:1.45;color:#172033">${clone.innerHTML}</div>`;
  const text = structuredContentText(clone);
  if (navigator.clipboard?.write && window.ClipboardItem) {
    await navigator.clipboard.write([new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([text], { type: "text/plain" })
    })]);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function structuredContentText(activity) {
  const output = [];
  activity.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,tr").forEach((node) => {
    const text = String(node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) return;
    if (node.matches("li")) {
      const ordered = node.parentElement?.matches("ol");
      const index = ordered ? Array.from(node.parentElement.children).indexOf(node) + 1 : 0;
      output.push(`${ordered ? `${index}.` : "•"} ${text}`);
    } else if (node.matches("tr")) {
      output.push(Array.from(node.querySelectorAll("th,td")).map((cell) => String(cell.innerText || cell.textContent || "").trim()).join("\t"));
    } else if (!node.closest("li,tr")) {
      output.push(text);
    }
  });
  return output.join("\n\n");
}

function renderUnitPanel(unit = {}, active = false) {
  const accepted = unit.accepted || {};
  const activities = Array.isArray(accepted.activities) ? accepted.activities : [];
  const resources = Array.isArray(accepted.resources) ? accepted.resources : [];
  const notes = Array.isArray(accepted.teacherNotes) ? accepted.teacherNotes : [];
  const projectMode = isProjectSelection(unit.meta || {});
  const content = [
    accepted.reading ? renderSelectedReadingSection(accepted.reading, unit.id) : "",
    activities.length ? renderCollapsibleSection({
      key: `${unit.id}-activities`,
      title: projectMode ? "Proyectos" : "Actividades",
      body: activities.map((activity) => renderActivity(activity, projectMode, unit.meta?.category)).join(""),
      extraClass: "cb-accepted-section"
    }) : "",
    resources.length ? renderCollapsibleSection({
      key: `${unit.id}-resources`,
      title: "Recursos",
      body: resources.map((resource) => renderResource(resource)).join(""),
      extraClass: "cb-accepted-section cb-resource-section"
    }) : "",
    notes.length ? renderCollapsibleSection({
      key: `${unit.id}-teacher-notes`,
      title: projectMode ? "Notas del proyecto" : "Notas globales del maestro",
      body: notes.map((item, index) => renderTeacherNotesBlock(item, index)).join(""),
      extraClass: "cb-accepted-section"
    }) : ""
  ].filter(Boolean).join("");

  return `<div class="cb-unit-panel-wrap${active ? " is-active" : ""}" data-unit-id="${escapeHtml(unit.id || "")}">
    ${renderCollapsibleSection({
      key: `unit-${unit.id}`,
      title: buildUnitHeading(unit),
      body: content || `<div class="cb-unit-awaiting">El contenido aparecerá aquí cuando lo apruebes.</div>`,
      actions: `<div class="cb-unit-header-actions" aria-label="Acciones de la unidad">
        <button type="button" data-unit-action="edit" aria-label="Editar unidad" title="Editar unidad"><i class="fas fa-pen" aria-hidden="true"></i></button>
        <button type="button" data-unit-action="remove" aria-label="Eliminar unidad" title="Eliminar unidad"><i class="fas fa-trash" aria-hidden="true"></i></button>
      </div>`,
      extraClass: "cb-unit-summary-card cb-unit-summary-card--lavender cb-unit-group",
      openByDefault: active
    })}
  </div>`;
}


function renderUnitHistory(session = {}) {
  const units = Array.isArray(session?.units) ? session.units.filter((unit) => hasApprovedUnitContent(unit)) : [];
  if (!units.length) return "";
  return `
    <section class="cb-unit-history">
      <p class="cb-panel-kicker">Unidades archivadas</p>
      <div class="cb-unit-history-list">
        ${units.slice().reverse().map((unit, index) => `
          <article class="cb-unit-history-item" data-unit-id="${escapeHtml(unit.id || "")}">
            <strong>${escapeHtml(unit.title || `Unidad ${index + 1}`)}</strong>
            <span>${escapeHtml([unit.meta?.grade, unit.meta?.category, unit.meta?.subtopic].filter(Boolean).join(" · "))}</span>
            <button type="button" data-unit-action="open">Abrir</button>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function hasApprovedUnitContent(unit = {}) {
  const approved = unit?.accepted || {};
  return Boolean(
    approved.reading ||
    (Array.isArray(approved.activities) && approved.activities.length) ||
    (Array.isArray(approved.resources) && approved.resources.length) ||
    (Array.isArray(approved.teacherNotes) && approved.teacherNotes.length)
  );
}

function buildUnitHeading(unit = {}) {
  const unitLabel = `Unidad ${unit?.meta?.unit || ""}`.trim();
  const title = String(unit?.title || "").trim();
  if (!title || /^(nueva unidad|nueva sesi[oó]n)$/i.test(title)) return unitLabel;
  if (normalize(title).startsWith(normalize(unitLabel))) return title;
  return `${unitLabel}. ${title}`;
}

function renderCollapsibleSection({ key = "", title = "", kicker = "", toggleLabel = "", body = "", actions = "", belowHeadActions = "", extraClass = "", openByDefault = false } = {}) {
  const collapsed = getCollapsedState(key, !openByDefault);
  const visibleTitle = String(toggleLabel || title || kicker || "Sección").trim();
  return `
    <section class="cb-collapsible ${extraClass}" data-collapse-shell="${escapeHtml(key)}" data-collapsed="${collapsed ? "true" : "false"}">
      <div class="cb-collapsible-head">
        <button type="button" class="cb-collapsible-toggle" data-collapse-toggle="${escapeHtml(key)}" aria-expanded="${collapsed ? "false" : "true"}">
          <span>
            <strong>${escapeHtml(visibleTitle)}</strong>
          </span>
          <i class="fas fa-chevron-down" aria-hidden="true"></i>
        </button>
        ${actions ? `<div class="cb-collapsible-actions">${actions}</div>` : ""}
      </div>
      ${belowHeadActions || ""}
      <div class="cb-collapsible-body">
        ${body}
      </div>
    </section>
  `;
}

function renderSelectedReadingSection(reading = {}, unitId = "") {
  const sections = reading.sections || {};
  const synonymRows = Array.isArray(sections.synonyms) ? sections.synonyms : [];
  const questions = Array.isArray(sections.questions) ? sections.questions : reading.questions || [];
  const questionsHtml = String(sections.questionsHtml || "").trim();
  const readingHtml = sections.narrativeHtml || reading.html || "";
  const hasEmbeddedSynonyms = hasEmbeddedReadingSection(readingHtml, "synonyms");
  const hasEmbeddedQuestions = hasEmbeddedReadingSection(readingHtml, "questions");

  return renderCollapsibleSection({
    key: `${unitId}-reading-selected`,
    title: reading.title || "Lectura aprobada",
    kicker: "Lectura",
    toggleLabel: "Lectura",
    extraClass: "cb-approved-card",
    openByDefault: false,
    actions: `<div class="cb-unit-header-actions" aria-label="Acciones de la lectura">
      <button type="button" data-reading-panel-action="open" aria-label="Cambiar lectura" title="Cambiar lectura"><i class="fas fa-book-open" aria-hidden="true"></i></button>
      <button type="button" data-reading-panel-action="remove" aria-label="Eliminar lectura" title="Eliminar lectura"><i class="fas fa-trash" aria-hidden="true"></i></button>
    </div>`,
    body: `
      ${renderReadingContentTitle(reading.title, readingHtml)}
      <div class="cb-approved-html" data-reading-part="narrative">${readingHtml}</div>
      ${renderSourceLinks(reading.citations)}
      ${hasEmbeddedSynonyms ? "" : `<section class="cb-reading-content-section" data-reading-part="synonyms" aria-labelledby="cb-reading-synonyms-title">
        <h3 id="cb-reading-synonyms-title">Tabla de sinónimos</h3>
        ${synonymRows.length ? renderSynonymsTable(synonymRows) : (sections.synonymsHtml ? `<div class="cb-reading-synonyms">${sections.synonymsHtml}</div>` : `<div class="cb-empty">Sin tabla de sinónimos guardada.</div>`)}
      </section>`}
      ${hasEmbeddedQuestions ? "" : `<section class="cb-reading-content-section" data-reading-part="questions" aria-labelledby="cb-reading-questions-title">
        <h3 id="cb-reading-questions-title">Preguntas de comprensión</h3>
        ${questions.length ? renderReadingQuestions(questions) : (questionsHtml ? `<div class="cb-reading-questions">${questionsHtml}</div>` : `<div class="cb-empty">Sin preguntas de comprensión guardadas.</div>`)}
      </section>`}
    `
  });
}

function renderReadingContentTitle(title = "", html = "") {
  let safeTitle = String(title || "").replace(/\s+/g, " ").trim();
  if (!safeTitle || /^lectura sin t[ií]tulo$/i.test(safeTitle)) safeTitle = inferReadingContentTitle(html);
  if (!safeTitle) return "";
  const source = String(html || "");
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(`<div>${source}</div>`, "text/html");
    const headings = Array.from(doc.querySelectorAll("h1, h2, h3, [data-reading-title]"));
    if (headings.some((heading) => normalize(heading.textContent) === normalize(safeTitle))) return "";
  } else if (normalize(source.replace(/<[^>]+>/g, " ")).includes(normalize(safeTitle))) {
    return "";
  }
  return `<h2 class="cb-reading-content-title">${escapeHtml(safeTitle)}</h2>`;
}

function inferReadingContentTitle(html = "") {
  const source = String(html || "");
  let text = source.replace(/<[^>]+>/g, " ");
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(`<div>${source}</div>`, "text/html");
    text = doc.body.textContent || "";
  }
  text = text.replace(/\s+/g, " ").trim();
  const sentence = String(text.match(/^.{8,90}?[.!?](?:\s|$)/)?.[0] || "").replace(/[.!?]+$/, "").trim();
  return sentence || text.split(" ").filter(Boolean).slice(0, 8).join(" ");
}

function hasEmbeddedReadingSection(html = "", type = "") {
  const source = String(html || "").trim();
  if (!source) return false;
  const labelPattern = type === "synonyms"
    ? /^(tabla de sin[oó]nimos|sin[oó]nimos|glosario|vocabulario)$/i
    : /^preguntas de comprensi[oó]n$/i;
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(`<div>${source}</div>`, "text/html");
    const selector = type === "synonyms"
      ? ".lectura-tabla-sinonimos, .sinonimos, .tabla-sinonimos, .glosario, [data-reading-section='synonyms']"
      : ".cb-reading-questions, .preguntas, .preguntas-lectura, [data-reading-section='questions']";
    if (doc.querySelector(selector)) return true;
    return Array.from(doc.querySelectorAll("h1, h2, h3, h4, h5, h6, strong"))
      .some((node) => labelPattern.test(String(node.textContent || "").replace(/\s+/g, " ").trim()));
  }
  const pattern = type === "synonyms"
    ? /tabla de sin[oó]nimos|(?:class|data-reading-section)=["'][^"']*(?:sinonimos|sinónimos|glosario|vocabulario)|lectura-tabla-sinonimos/i
    : /preguntas de comprensi[oó]n|(?:class|data-reading-section)=["'][^"']*(?:preguntas|questions|comprension|comprensión)/i;
  return pattern.test(source);
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
  const focusCategory = normalize(focus?.category || "");
  const focusSubtopic = normalize(focus?.subtopic || "");
  const hasSpecificFocus = Boolean(focusSubtopic);
  const filteredGroups = hasSpecificFocus
    ? grouped
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => {
            const sameCategory = !focusCategory || normalize(group.category || "") === focusCategory;
            const sameSubtopic = normalize(item.subtopic || "") === focusSubtopic;
            return !(sameCategory && sameSubtopic);
          })
        }))
        .filter((group) => group.items.length)
    : grouped;
  if (hasSpecificFocus) {
    return `
      <section class="cb-sya-focus">
        <p class="cb-panel-kicker">S&A activa</p>
        <h4>${escapeHtml(focus.category ? `${focus.category} · ${formatSyaKey(focus.subtopic)}` : formatSyaKey(focus.subtopic))}</h4>
        <dl class="cb-sya-summary cb-sya-summary--focus">
          ${renderSyaFieldEntries(focus.fields)}
        </dl>
      </section>
      ${filteredGroups.length ? `
        <div class="cb-sya-groups">
          ${filteredGroups.map((group) => `
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
      ` : ""}
    `;
  }
  return `
    <div class="cb-sya-groups">
      ${filteredGroups.map((group) => `
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

function renderActivity(activity = {}, projectMode = false, unitSection = "") {
  const subtopicTitle = getActivityToggleLabel(activity, projectMode, unitSection);
  const collapseKey = `activity-${activity.id || subtopicTitle}`;
  const collapsed = getCollapsedState(`approved-card-${collapseKey}`, true);
  return `
    <article class="cb-approved-card cb-approved-card--collapsible" data-activity-id="${escapeHtml(activity.id)}" data-approved-card-shell="${escapeHtml(collapseKey)}" data-card-collapsed="${collapsed ? "true" : "false"}">
      <div class="cb-approved-card-head">
        <button type="button" class="cb-approved-card-toggle" data-approved-card-toggle aria-expanded="${collapsed ? "false" : "true"}">
          <strong>${escapeHtml(subtopicTitle)}</strong>
          <i class="fas fa-chevron-down" aria-hidden="true"></i>
        </button>
        ${renderCardActionMenu("activity", projectMode)}
      </div>
      <div class="cb-approved-card-body">
        <div class="cb-approved-html">${activity.html || ""}</div>
        ${renderSourceLinks(activity.citations)}
        ${(activity.notes || []).map((note) => `<div class="cb-note-inline"><strong>Notas del maestro</strong>${note.html || ""}</div>`).join("")}
      </div>
    </article>
  `;
}

function getActivityToggleLabel(activity = {}, projectMode = false, unitSection = "") {
  const candidates = [activity.subtopic, activity.title, activity.section];
  const subtopic = candidates.map(normalizeActivitySubtopicTitle).find(Boolean);
  return formatSyaKey(subtopic || activity.category || unitSection || (projectMode ? "Proyecto" : "Actividad"));
}


function renderTeacherNotesBlock(notes = {}, index = 0) {
  const safeId = escapeHtml(notes.id || String(index));
  const collapseKey = `teacher-notes-${notes.id || index}`;
  const collapsed = getCollapsedState(`approved-card-${collapseKey}`, true);
  const notesHtml = formatTeacherNotesHtml(notes.html || "");
  return `
    <article class="cb-approved-card cb-approved-card--collapsible cb-teacher-notes-card" data-teacher-notes-id="${safeId}" data-approved-card-shell="${escapeHtml(collapseKey)}" data-card-collapsed="${collapsed ? "true" : "false"}">
      <div class="cb-teacher-notes-card-head">
        <button type="button" class="cb-approved-card-toggle" data-approved-card-toggle aria-expanded="${collapsed ? "false" : "true"}">
          <strong>Notas del maestro</strong>
          <i class="fas fa-chevron-down" aria-hidden="true"></i>
        </button>
        <div>
          <button type="button" class="cb-icon-btn" data-teacher-notes-action="save" title="Guardar cambios" aria-label="Guardar cambios">
            <i class="fas fa-check"></i>
          </button>
          <button type="button" class="cb-icon-btn cb-icon-btn--danger" data-teacher-notes-action="delete" title="Eliminar notas" aria-label="Eliminar notas">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      <div class="cb-approved-card-body">
        <div class="cb-teacher-notes-editable" contenteditable="true" role="textbox" aria-multiline="true" spellcheck="true" aria-label="Texto de las notas del maestro">${notesHtml}</div>
      </div>
    </article>
  `;
}

function formatTeacherNotesHtml(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/<\/?[a-z][\s\S]*>/i.test(raw)) return raw;

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let html = "";
  let listType = "";
  let listItems = [];
  const flushList = () => {
    if (!listItems.length) return;
    html += `<${listType}>${listItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</${listType}>`;
    listType = "";
    listItems = [];
  };

  lines.forEach((line) => {
    const heading = line.match(/^(?:#{1,6}\s*)?(?:\d+[.)]\s*)?(.{3,80}:)$/);
    const unordered = line.match(/^[-*•]\s+(.+)$/);
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const nextType = ordered ? "ol" : "ul";
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      listItems.push((unordered?.[1] || ordered?.[1] || "").trim());
      return;
    }
    flushList();
    if (heading) {
      html += `<h4>${escapeHtml(heading[1].replace(/:$/, ""))}</h4>`;
      return;
    }
    html += `<p>${escapeHtml(line)}</p>`;
  });
  flushList();
  return html;
}

function renderResource(resource = {}) {
  const resourceTitle = String(resource.title || resource.code || resource.context || resource.type || "Recurso").trim();
  const collapseKey = `resource-${resource.id || resource.code || resource.title || "item"}`;
  const collapsed = getCollapsedState(`approved-card-${collapseKey}`, true);
  return `
    <article class="cb-approved-card cb-approved-card--collapsible cb-resource-card" data-resource-id="${escapeHtml(resource.id)}" data-approved-card-shell="${escapeHtml(collapseKey)}" data-card-collapsed="${collapsed ? "true" : "false"}">
      <div class="cb-approved-card-head">
        <button type="button" class="cb-approved-card-toggle" data-approved-card-toggle aria-expanded="${collapsed ? "false" : "true"}">
          <strong>${escapeHtml(resourceTitle)}</strong>
          <i class="fas fa-chevron-down" aria-hidden="true"></i>
        </button>
        ${renderCardActionMenu("resource")}
      </div>
      <div class="cb-approved-card-body">
        <div class="cb-resource-meta">
          <span>${escapeHtml(resource.context || resource.type || "Recurso")}</span>
        </div>
        <div class="cb-approved-html">${resource.html || ""}</div>
        ${renderSourceLinks(resource.citations)}
        ${(resource.notes || []).map((note) => `<div class="cb-note-inline"><strong>Notas del recurso</strong>${note.html || ""}</div>`).join("")}
      </div>
    </article>
  `;
}

function renderSourceLinks(citations = []) {
  const items = Array.isArray(citations) ? citations.filter((item) => item?.url) : [];
  if (!items.length) return "";
  return `<aside class="cb-citations"><strong>Fuentes verificadas</strong><ol>${items.map((item) => `<li><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title || item.url)}</a></li>`).join("")}</ol></aside>`;
}

function renderSessionBibliography(session = {}) {
  const citations = collectSessionBibliography(session);
  if (!citations.length) return "";
  const units = new Map((session.units || []).map((unit) => [unit.id, buildUnitHeading(unit)]));
  const grouped = new Map();
  citations.forEach((citation) => {
    const linkedUnitIds = citation.links?.map((item) => item.unitId).filter(Boolean) || citation.unitIds || [];
    linkedUnitIds.forEach((unitId) => {
      if (!grouped.has(unitId)) grouped.set(unitId, []);
      grouped.get(unitId).push(citation);
    });
  });
  return renderCollapsibleSection({
    key: "session-bibliography",
    title: "Fuentes bibliográficas",
    openByDefault: false,
    extraClass: "cb-bibliography-section",
    body: `<div class="cb-bibliography-groups">${Array.from(grouped.entries()).map(([unitId, items]) => `
      <section class="cb-bibliography-group">
        <h3>${escapeHtml(units.get(unitId) || "Unidad")}</h3>
        <ol>${dedupeByApa(items).map((citation) => `<li>${citation.url ? `<a href="${escapeHtml(safeHttpUrl(citation.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(citation.apa)}</a>` : escapeHtml(citation.apa)}</li>`).join("")}</ol>
      </section>
    `).join("")}</div>`
  });
}

function dedupeByApa(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item.doi || item.url || item.apa || "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function safeHttpUrl(value = "") {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch (_) {
    return "";
  }
}

function renderCardActionMenu(kind = "activity", projectMode = false) {
  const dataAttribute = kind === "resource" ? "data-resource-action" : "data-activity-action";
  const subject = kind === "resource" ? "recurso" : projectMode ? "proyecto" : "actividad";
  return `
    <details class="cb-card-menu">
      <summary class="cb-card-menu-toggle" aria-label="Opciones de ${subject}" title="Más opciones">
        <i class="fas fa-ellipsis-v" aria-hidden="true"></i>
      </summary>
      <div class="cb-card-menu-panel">
        <button type="button" ${dataAttribute}="edit"><i class="fas fa-pencil-alt" aria-hidden="true"></i><span>Editar</span></button>
        <button type="button" ${dataAttribute}="regenerate"><i class="fas fa-rotate-right" aria-hidden="true"></i><span>Regenerar</span></button>
        <button type="button" ${dataAttribute}="notes"><i class="fas fa-pen-nib" aria-hidden="true"></i><span>Generar notas</span></button>
        <button type="button" class="cb-card-menu-item--danger" ${dataAttribute}="remove"><i class="fas fa-trash" aria-hidden="true"></i><span>Eliminar</span></button>
      </div>
    </details>
  `;
}

function positionCardMenu(menu) {
  const toggle = menu?.querySelector(".cb-card-menu-toggle");
  const menuPanel = menu?.querySelector(".cb-card-menu-panel");
  if (!toggle || !menuPanel) return;
  const toggleRect = toggle.getBoundingClientRect();
  const panelRect = menuPanel.getBoundingClientRect();
  const viewportPadding = 8;
  const gap = 5;
  const left = Math.max(
    viewportPadding,
    Math.min(window.innerWidth - panelRect.width - viewportPadding, toggleRect.right - panelRect.width)
  );
  const preferredTop = toggleRect.bottom + gap;
  const top = preferredTop + panelRect.height <= window.innerHeight - viewportPadding
    ? preferredTop
    : Math.max(viewportPadding, toggleRect.top - panelRect.height - gap);
  menuPanel.style.left = `${Math.round(left)}px`;
  menuPanel.style.top = `${Math.round(top)}px`;
}

function normalizeResourceType(resource = {}) {
  const value = String(resource.type || resource.context || resource.title || resource.code || "").toLowerCase();
  if (value.includes("ficha")) return "ficha";
  if (value.includes("anexo")) return "anexo";
  if (value.includes("recortable")) return "recortable";
  if (value.includes("video") || value.includes("guion") || value.includes("guión")) return "video";
  return "";
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
  const value = String(key || "").trim();
  const labels = {
    Gramatica: "Gramática",
    ExpresionEscrita: "Expresión escrita",
    TrazosDeLetras: "Trazos de letras",
    ComprensionLectora: "Comprensión lectora",
    ExpresionOral: "Expresión oral",
    ConocimientoDelMedio: "Conocimiento del medio",
    MiLocalidad: "Mi localidad",
    Geografia: "Geografía",
    CivicaEtica: "Formación cívica y ética",
    Matematicas: "Matemáticas"
  };
  return labels[value] || value
    .replace(/_/g, " ")
    .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, "$1 $2")
    .replace(/\bAE\b/g, "Aprendizaje esperado");
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
