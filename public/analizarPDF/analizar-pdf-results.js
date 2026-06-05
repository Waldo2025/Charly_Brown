function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderIssues(items = [], emptyLabel = "") {
  if (!Array.isArray(items) || !items.length) {
    return `<p class="analizar-pdf-empty-state">${escapeHtml(emptyLabel)}</p>`;
  }
  return `<ul>${items.map((item) => {
    if (typeof item === "string") {
      return `<li>${escapeHtml(item)}</li>`;
    }
    const message = String(item?.message || item?.reason || JSON.stringify(item)).trim();
    return `<li>${escapeHtml(message)}</li>`;
  }).join("")}</ul>`;
}

function renderKeyValueRows(rows = []) {
  if (!Array.isArray(rows) || !rows.length) {
    return `<p class="analizar-pdf-empty-state">Sin datos disponibles.</p>`;
  }
  return `
    <div class="analizar-pdf-meta-list">
      ${rows.map((row) => `
        <div class="analizar-pdf-meta-row">
          <span>${escapeHtml(row.label || "")}</span>
          <strong>${escapeHtml(row.value || "")}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderPreviewTable(items = [], columns = []) {
  if (!Array.isArray(items) || !items.length) {
    return `<p class="analizar-pdf-empty-state">Sin datos disponibles.</p>`;
  }
  return `
    <div class="analizar-pdf-table-wrap">
      <table class="analizar-pdf-table">
        <thead>
          <tr>${columns.map((column) => `<th>${escapeHtml(column.label || "")}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${items.map((item) => `
            <tr>${columns.map((column) => `<td>${escapeHtml(column.render ? column.render(item) : (item?.[column.key] ?? ""))}</td>`).join("")}</tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function collectPageBodyLines(page = {}) {
  const buckets = [
    "subtítulos",
    "instrucciones",
    "subinstrucciones",
    "párrafos normales",
    "otro",
  ];
  const seen = new Set();
  const markers = page?.footerMarkers || {};
  const excluded = new Set([
    String(markers.sectionName || "").trim(),
    String(markers.trimester || "").trim(),
    String(markers.grade || "").trim(),
    ...((Array.isArray(markers.skills) ? markers.skills : []).map((item) => String(item || "").trim()))
  ].filter(Boolean));
  const lines = [];
  for (const bucket of buckets) {
    for (const item of page?.content?.[bucket] || []) {
      const text = String(item?.text || "").trim();
      if (!text || seen.has(text) || excluded.has(text)) continue;
      seen.add(text);
      lines.push({
        text,
        styleName: String(item?.styleName || "").trim(),
        swatches: Array.isArray(item?.swatches) ? item.swatches : [],
      });
    }
  }
  return lines;
}

function getPageBodyLineStyle(line = {}) {
  const styleName = String(line?.styleName || "").trim();
  const swatches = Array.isArray(line?.swatches) ? line.swatches : [];
  if (styleName === "08_04_00 RESPUESTA ALUMNO" && swatches.includes("Z_ESCRITO A MANO")) {
    return "color:#FF00FF;";
  }
  return "";
}

function renderFieldProfiles(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return `
      <div class="analizar-pdf-meta-row is-stack">
        <span>Campo formativo</span>
        <p class="analizar-pdf-empty-state">Sin campo formativo detectado.</p>
      </div>
    `;
  }
  return `
    ${items.map((item) => {
      const hex = String(item?.hex || "").trim() || "#e8ecf4";
      return `
        <div class="analizar-pdf-meta-row is-stack">
          <span>Campo formativo</span>
          <div class="analizar-pdf-field-profile">
            <span class="analizar-pdf-field-badge" style="--field-badge:${escapeHtml(hex)}">${escapeHtml(item?.label || "Campo formativo")}</span>
          </div>
        </div>
      `;
    }).join("")}
  `;
}

function renderTextMetaList(lines = []) {
  if (!Array.isArray(lines) || !lines.length) {
    return `
      <div class="analizar-pdf-meta-row is-stack">
        <span>Texto</span>
        <p class="analizar-pdf-empty-state">Sin texto detectado.</p>
      </div>
    `;
  }
  return `
    <div class="analizar-pdf-meta-row is-stack">
      <span>Texto</span>
      <div class="analizar-pdf-page-body">
        ${lines.map((line) => `<p style="${escapeHtml(getPageBodyLineStyle(line))}">${escapeHtml(line.text || "")}</p>`).join("")}
      </div>
    </div>
  `;
}

function isOddPage(page = {}) {
  const value = Number.parseInt(String(page?.pageName || "").trim(), 10);
  return Number.isFinite(value) && value % 2 === 1;
}

function renderFolioSignals(page = {}) {
  const markers = page?.footerMarkers || {};
  const rows = [
    { label: "Folio", value: markers.pageNumber || page?.numbering?.visiblePageNumber || "N/D" },
    { label: "Nombre de sección", value: markers.sectionName || "N/D" },
    { label: "Título de sección", value: markers.sectionTitle || "N/D" },
  ];
  if (isOddPage(page)) {
    rows.push(
      { label: "Trimestre", value: markers.trimester || "N/D" },
      { label: "Grado", value: markers.grade || "N/D" },
    );
  }
  rows.push({
    label: "Habilidad",
    value: Array.isArray(markers.skills) && markers.skills.length ? markers.skills.join(", ") : "N/D",
  });
  return `
    <div class="analizar-pdf-meta-list">
      ${renderFieldProfiles(page.fieldProfiles)}
      ${rows.map((row) => `
        <div class="analizar-pdf-meta-row">
          <span>${escapeHtml(row.label || "")}</span>
          <strong>${escapeHtml(row.value || "")}</strong>
        </div>
      `).join("")}
      ${renderTextMetaList(collectPageBodyLines(page))}
    </div>
  `;
}

function renderPageReports(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return `<p class="analizar-pdf-empty-state">No hay reporte por página disponible.</p>`;
  }
  return `
    <div class="analizar-pdf-page-report-list">
      ${items.map((page) => `
        <article class="analizar-pdf-page-report">
          <header class="analizar-pdf-page-report-head">
            <h4>Página ${escapeHtml(page.pageName || "?")}</h4>
            <span>Master: ${escapeHtml(page.masterName || page.appliedMaster || "N/D")}</span>
          </header>
          <section>
            ${renderFolioSignals(page)}
          </section>
          <section>
            <h5>Ortotipografía</h5>
            ${renderIssues(page.orthotypographyIssues, "Sin hallazgos ortotipográficos en esta página.")}
          </section>
          <section>
            <h5>Ortografía</h5>
            ${renderIssues(page.spellingIssues, "Sin hallazgos ortográficos en esta página.")}
          </section>
        </article>
      `).join("")}
    </div>
  `;
}

function renderSummary(session = null) {
  const result = session?.result || {};
  const stats = result?.stats || {};
  const summary = session?.resultSummary || {};
  return renderKeyValueRows([
    { label: "Tipo de fuente", value: stats.sourceType || session?.sourceType || "-" },
    { label: "Páginas", value: String(summary.pageCount || stats.pageCount || 0) },
    { label: "Spreads", value: String(stats.spreadCount || 0) },
    { label: "Stories", value: String(stats.storyCount || 0) },
    { label: "Swatches", value: String(stats.swatchCount || 0) },
    { label: "Duración", value: `${Number(stats.durationMs || 0)} ms` },
  ]);
}

export function createAnalizarPdfResultsRenderer(deps = {}) {
  const { el } = deps;
  let auxiliaryPanelsHidden = true;

  function bindEvents() {
    const toggle = el?.querySelector("[data-action='toggle-auxiliary-panels']");
    if (!toggle) return;
    toggle.addEventListener("click", () => {
      auxiliaryPanelsHidden = !auxiliaryPanelsHidden;
      const session = el.__analizarPdfSession || null;
      render(session);
    });
  }

  function render(session = null) {
    if (!el) return;
    el.__analizarPdfSession = session;
    if (!session) {
      el.innerHTML = `<div class="analizar-pdf-result-card"><p class="analizar-pdf-empty-state">Selecciona o crea una sesión para empezar.</p></div>`;
      return;
    }
    const result = session.result && typeof session.result === "object" ? session.result : {};
    const summary = session.resultSummary && typeof session.resultSummary === "object" ? session.resultSummary : null;
    const stats = result.stats && typeof result.stats === "object" ? result.stats : {};
    el.innerHTML = `
      <div class="analizar-pdf-results-toolbar">
        <button type="button" class="analizar-pdf-toggle-btn" data-action="toggle-auxiliary-panels">
          ${auxiliaryPanelsHidden ? "Mostrar paneles informativos" : "Ocultar paneles informativos"}
        </button>
      </div>
      <article class="analizar-pdf-result-card">
        <h3>Resumen</h3>
        ${summary ? renderSummary(session) : `<p class="analizar-pdf-empty-state">Todavía no hay resultados.</p>`}
      </article>
      <article class="analizar-pdf-result-card">
        <h3>Configuración</h3>
        ${renderIssues(stats.configurationWarnings, "La sesión ya tiene checklist base configurado.")}
      </article>
      <article class="analizar-pdf-result-card ${auxiliaryPanelsHidden ? "is-hidden" : ""}">
        <h3>Estructura del documento</h3>
        ${renderKeyValueRows([
          { label: "Archivo", value: stats.documentName || "-" },
          { label: "Páginas maestras detectadas", value: String(stats.masterSpreadCount || 0) },
          { label: "Estilos de párrafo", value: String(stats.paragraphStyleCount || 0) },
          { label: "Estilos de carácter", value: String(stats.characterStyleCount || 0) },
          { label: "Texto analizado", value: `${Number(stats.textCharacterCount || 0)} caracteres` },
          { label: "Stories semánticas", value: String(stats.semanticStoryCount || 0) },
        ])}
      </article>
      <article class="analizar-pdf-result-card ${auxiliaryPanelsHidden ? "is-hidden" : ""}">
        <h3>Páginas y masters</h3>
        ${renderPreviewTable(stats.pagePreview, [
          { key: "pageName", label: "Página" },
          { key: "spreadId", label: "Spread" },
          { key: "appliedMaster", label: "Master" }
        ])}
      </article>
      <article class="analizar-pdf-result-card ${auxiliaryPanelsHidden ? "is-hidden" : ""}">
        <h3>Swatches detectados</h3>
        ${renderPreviewTable(stats.swatchInventory, [
          { key: "name", label: "Swatch" },
          { key: "space", label: "Espacio" },
          { key: "cmyk", label: "CMYK" },
          { key: "hex", label: "HEX" }
        ])}
      </article>
      <article class="analizar-pdf-result-card ${auxiliaryPanelsHidden ? "is-hidden" : ""}">
        <h3>Estilos predominantes</h3>
        ${renderPreviewTable(stats.topParagraphStyles, [
          { key: "styleName", label: "Párrafo" },
          { key: "uses", label: "Usos" }
        ])}
        ${renderPreviewTable(stats.topCharacterStyles, [
          { key: "styleName", label: "Carácter" },
          { key: "uses", label: "Usos" }
        ])}
      </article>
      <article class="analizar-pdf-result-card">
        <h3>Numeración</h3>
        ${renderIssues(result.paginationIssues, "Sin hallazgos de paginación.")}
      </article>
      <article class="analizar-pdf-result-card">
        <h3>Secciones</h3>
        ${renderIssues(result.sectionIssues, "Sin hallazgos de secciones.")}
      </article>
      <article class="analizar-pdf-result-card">
        <h3>Ortografía</h3>
        ${renderIssues(result.spellingIssues, "Sin hallazgos ortográficos.")}
      </article>
      <article class="analizar-pdf-result-card">
        <h3>Ortotipografía</h3>
        ${renderIssues(result.orthotypographyIssues, "Sin hallazgos ortotipográficos.")}
      </article>
      <article class="analizar-pdf-result-card">
        <h3>Colores</h3>
        ${renderIssues(result.colorIssues, "Sin hallazgos de color.")}
      </article>
      <article class="analizar-pdf-result-card ${auxiliaryPanelsHidden ? "is-hidden" : ""}">
        <h3>Stories relevantes</h3>
        ${renderPreviewTable(stats.topStories, [
          { key: "storyTitle", label: "Story" },
          { key: "length", label: "Largo" },
          { key: "excerpt", label: "Extracto" }
        ])}
      </article>
      <article class="analizar-pdf-result-card">
        <h3>Reporte por página</h3>
        ${renderPageReports(stats.pageReports)}
      </article>
    `;
    bindEvents();
  }

  return { render };
}
