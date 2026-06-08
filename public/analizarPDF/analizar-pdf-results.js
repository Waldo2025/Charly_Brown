function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlAttr(value = "") {
  return escapeHtml(value)
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugifyAnchorPart(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "x";
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

function buildCorrectionIssueId(kind = "", issue = {}) {
  const cleanKind = String(kind || "").trim().toLowerCase();
  const storyId = String(issue?.storyId || "").trim();
  const pageName = String(issue?.pageName || "").trim();
  if (cleanKind === "spelling") {
    const token = String(issue?.token || "").trim().toLowerCase();
    const suggestion = String((Array.isArray(issue?.replacements) ? issue.replacements[0] : issue?.suggestion) || "").trim().toLowerCase();
    return [cleanKind, pageName, storyId, token, suggestion].join("::");
  }
  const excerpt = String(issue?.excerpt || "").trim().toLowerCase();
  const suggestion = String(issue?.suggestion || "").trim().toLowerCase();
  return [cleanKind, pageName, storyId, excerpt, suggestion].join("::");
}

function renderKeyValueRows(rows = []) {
  if (!Array.isArray(rows) || !rows.length) {
    return `<p class="analizar-pdf-empty-state">Sin datos disponibles.</p>`;
  }
  return `
    <div class="analizar-pdf-meta-list">
      ${rows.map((row) => `
        <div class="analizar-pdf-meta-row">
          <strong class="analizar-pdf-meta-label">${escapeHtml(row.label || "")}</strong>
          <span class="analizar-pdf-meta-value">${renderMetaValue(row.value || "")}</span>
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

function formatAliasLabel(alias = "") {
  return String(alias || "").trim() || "alias";
}

function normalizeMappingPageScope(scope = "") {
  const normalized = String(scope || "").trim().toLowerCase();
  return normalized === "even" || normalized === "odd" ? normalized : "both";
}

function normalizeMappingPageNumber(value = "", fallback = "") {
  const normalized = String(value || fallback || "").trim();
  return /^\d{1,3}$/.test(normalized) ? normalized : "";
}

function normalizeMappingPageList(value = "", options = {}) {
  const zeroMeansEmpty = options?.zeroMeansEmpty === true;
  const fallbackZero = options?.fallbackZero === true;
  const tokens = String(value || "")
    .split(",")
    .map((token) => Number.parseInt(String(token || "").trim(), 10))
    .filter((token) => Number.isFinite(token) && token >= 0 && token <= 999);
  const unique = [];
  const seen = new Set();
  for (const token of tokens) {
    if (zeroMeansEmpty && token === 0) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    unique.push(String(token));
  }
  if (!unique.length) {
    return fallbackZero ? "0" : "";
  }
  return unique.join(", ");
}

function parseNormalizedMappingPageList(value = "") {
  return new Set(
    String(value || "")
      .split(",")
      .map((token) => normalizeMappingPageNumber(token))
      .filter(Boolean)
  );
}

function mappingEntryAppliesToPage(entry = {}, page = {}) {
  const normalizedScope = normalizeMappingPageScope(entry?.pageScope || "both");
  const targetPage = normalizeMappingPageList(entry?.targetPage || "", { zeroMeansEmpty: true });
  const excludeTargetPage = normalizeMappingPageList(entry?.excludeTargetPage || "0", { zeroMeansEmpty: true, fallbackZero: true });
  const relativePage = normalizeMappingPageNumber(page?.pageSequence || "");
  const targetPages = parseNormalizedMappingPageList(targetPage);
  const excludePages = parseNormalizedMappingPageList(excludeTargetPage);
  if (targetPages.size && (!relativePage || !targetPages.has(relativePage))) {
    return false;
  }
  if (relativePage && excludePages.size && excludePages.has(relativePage)) {
    return false;
  }
  if (normalizedScope === "both") {
    return true;
  }
  const pageName = Number.parseInt(String(page?.pageName || "").trim(), 10);
  if (!Number.isFinite(pageName)) {
    return true;
  }
  if (normalizedScope === "even") {
    return pageName % 2 === 0;
  }
  return pageName % 2 === 1;
}

function buildConfiguredAliasRows(page = {}, session = null) {
  const aliasValues = page?.aliasValues && typeof page.aliasValues === "object" ? page.aliasValues : {};
  const entries = Array.isArray(session?.mappingEntries) ? session.mappingEntries : [];
  const seen = new Set();
  const rows = [];
  for (const entry of entries) {
    const alias = String(entry?.alias || "").trim();
    if (!alias || seen.has(alias) || !mappingEntryAppliesToPage(entry, page)) continue;
    seen.add(alias);
    rows.push({
      label: formatAliasLabel(alias),
      value: String(aliasValues?.[alias] || "").trim() || "N/D",
    });
  }
  const instructionWorkType = String(aliasValues?.tipo_trabajo_instruccion || "").trim();
  if (instructionWorkType) {
    rows.push({
      label: "tipo_trabajo_instruccion",
      value: instructionWorkType,
    });
  }
  return rows;
}

function renderMetaValue(value = "") {
  return escapeHtml(String(value || "")).replaceAll("\n", "<br>");
}

function renderHighlightedMetaValue(value = "", fragments = []) {
  return String(value || "")
    .split("\n")
    .map((line) => renderHighlightedText(line, fragments))
    .join("<br>");
}

function renderConfiguredAliasRows(page = {}, session = null) {
  const rows = buildConfiguredAliasRows(page, session);
  if (!rows.length) return "";
  const fragments = collectPageHighlightFragments(page);
  return rows.map((row) => `
    <div class="analizar-pdf-meta-row">
      <strong class="analizar-pdf-meta-label">${escapeHtml(row.label || "")}</strong>
      <span class="analizar-pdf-meta-value">${renderHighlightedMetaValue(row.value || "", fragments)}</span>
    </div>
  `).join("");
}

function buildConfiguredAliasTextSet(page = {}, session = null) {
  const aliasValues = page?.aliasValues && typeof page.aliasValues === "object" ? page.aliasValues : {};
  const entries = Array.isArray(session?.mappingEntries) ? session.mappingEntries : [];
  const set = new Set();
  const seenAliases = new Set();
  for (const entry of entries) {
    const alias = String(entry?.alias || "").trim();
    if (!alias || seenAliases.has(alias) || !mappingEntryAppliesToPage(entry, page)) continue;
    seenAliases.add(alias);
    const rawValue = String(aliasValues?.[alias] || "").trim();
    if (!rawValue) continue;
    for (const line of rawValue.split("\n")) {
      const clean = String(line || "").trim();
      if (clean) set.add(clean);
    }
  }
  return set;
}

function collectPageBodyLines(page = {}, session = null) {
  const buckets = [
    "títulos",
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
  const configuredAliasTexts = buildConfiguredAliasTextSet(page, session);
  const lines = [];
  for (const bucket of buckets) {
    for (const item of page?.content?.[bucket] || []) {
      const text = String(item?.text || "").trim();
      if (!text || seen.has(text) || excluded.has(text) || configuredAliasTexts.has(text)) continue;
      const line = {
        text,
        styleName: String(item?.styleName || "").trim(),
        swatches: Array.isArray(item?.swatches) ? item.swatches : [],
        textStatus: String(item?.textStatus || "correcto").trim() || "correcto",
        frameRect: item?.frameRect && typeof item.frameRect === "object" ? item.frameRect : null,
      };
      if (isSolutionLine(line)) continue;
      seen.add(text);
      lines.push(line);
    }
  }
  return lines;
}

function collectSolutionLines(page = {}) {
  const buckets = [
    "títulos",
    "subtítulos",
    "instrucciones",
    "subinstrucciones",
    "párrafos normales",
    "otro",
  ];
  const seen = new Set();
  const lines = [];
  for (const bucket of buckets) {
    for (const item of page?.content?.[bucket] || []) {
      const text = String(item?.text || "").trim();
      if (!text || seen.has(text)) continue;
      const line = {
        text,
        styleName: String(item?.styleName || "").trim(),
        swatches: Array.isArray(item?.swatches) ? item.swatches : [],
        textStatus: String(item?.textStatus || "correcto").trim() || "correcto",
        frameRect: item?.frameRect && typeof item.frameRect === "object" ? item.frameRect : null,
      };
      if (!isSolutionLine(line)) continue;
      seen.add(text);
      lines.push(line);
    }
  }
  return lines;
}

function getFrameCenter(line = {}) {
  const rect = line?.frameRect;
  if (!rect || typeof rect !== "object") return null;
  const x1 = Number(rect.x1);
  const y1 = Number(rect.y1);
  const x2 = Number(rect.x2);
  const y2 = Number(rect.y2);
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  return {
    x: (x1 + x2) / 2,
    y: (y1 + y2) / 2,
  };
}

function sortLinesByGeometry(lines = []) {
  return [...lines].sort((a, b) => {
    const aRect = a?.frameRect || {};
    const bRect = b?.frameRect || {};
    const ay = Number(aRect.y1);
    const by = Number(bRect.y1);
    const ax = Number(aRect.x1);
    const bx = Number(bRect.x1);
    if (Number.isFinite(ay) && Number.isFinite(by) && Math.abs(ay - by) > 8) {
      return ay - by;
    }
    if (Number.isFinite(ax) && Number.isFinite(bx) && ax !== bx) {
      return ax - bx;
    }
    return String(a?.text || "").localeCompare(String(b?.text || ""), "es");
  });
}

function isNumericTemarioLine(line = {}) {
  return /^\d{1,2}$/.test(String(line?.text || "").trim());
}

function isTemarioTopicLine(line = {}) {
  const styleName = String(line?.styleName || "").trim().toUpperCase();
  return styleName.includes("TEMARIO");
}

function buildTemarioSequence(lines = []) {
  const numericLines = lines.filter(isNumericTemarioLine);
  const topicLines = lines.filter((line) => isTemarioTopicLine(line) && !isNumericTemarioLine(line));
  const candidateLines = lines.filter((line) => isNumericTemarioLine(line) || isTemarioTopicLine(line));
  if (numericLines.length < 5 || topicLines.length < 5) {
    return null;
  }
  if (candidateLines.length < 8) {
    return null;
  }
  if (candidateLines.length < Math.ceil(lines.length * 0.6)) {
    return null;
  }
  if (topicLines.length < Math.ceil(numericLines.length * 0.6)) {
    return null;
  }
  const orderedNumbers = [...numericLines].sort((a, b) => Number(a.text) - Number(b.text));
  const remainingTopics = [...topicLines];
  const pairs = [];
  for (const numberLine of orderedNumbers) {
    const sourceCenter = getFrameCenter(numberLine);
    if (!sourceCenter || !remainingTopics.length) continue;
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    remainingTopics.forEach((topicLine, index) => {
      const targetCenter = getFrameCenter(topicLine);
      if (!targetCenter) return;
      const dx = targetCenter.x - sourceCenter.x;
      const dy = targetCenter.y - sourceCenter.y;
      const distance = Math.hypot(dx, dy);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    if (bestIndex === -1) continue;
    if (!Number.isFinite(bestDistance) || bestDistance > 320) continue;
    const topicLine = remainingTopics.splice(bestIndex, 1)[0];
    pairs.push({
      ...topicLine,
      text: `${String(numberLine.text || "").trim()}. ${String(topicLine.text || "").trim()}`,
      textStatus: numberLine.textStatus !== "correcto" ? numberLine.textStatus : topicLine.textStatus,
      frameRect: topicLine.frameRect || numberLine.frameRect || null,
      temarioNumber: String(numberLine.text || "").trim(),
    });
  }
  if (pairs.length < Math.min(5, Math.min(numericLines.length, topicLines.length))) return null;
  const pairedTopicTexts = new Set(pairs.map((item) => String(item?.text || "").replace(/^\d+\.\s*/, "").trim()));
  const leftovers = lines.filter((line) => {
    if (isNumericTemarioLine(line)) return false;
    if (isTemarioTopicLine(line) && pairedTopicTexts.has(String(line?.text || "").trim())) return false;
    return true;
  });
  return [...pairs.sort((a, b) => Number(a.temarioNumber) - Number(b.temarioNumber)), ...sortLinesByGeometry(leftovers)];
}

function normalizePageBodyLines(lines = [], page = {}, session = null) {
  const sorted = sortLinesByGeometry(lines);
  const configuredTemarioPage = Number(session?.indexConfig?.temarioPageNumber || 0) || 0;
  const currentPageNumber = Number.parseInt(String(page?.pageName || "").trim(), 10);
  const shouldUseTemarioSequence =
    configuredTemarioPage > 0 &&
    Number.isFinite(currentPageNumber) &&
    currentPageNumber === configuredTemarioPage;
  const temarioSequence = shouldUseTemarioSequence ? buildTemarioSequence(sorted) : null;
  return temarioSequence || sorted;
}

function isSolutionLine(line = {}) {
  const styleName = String(line?.styleName || "").trim().toUpperCase();
  return styleName.includes("08_04_00 RESPUESTA ALUMNO");
}

function getPageBodyLineStyle(line = {}) {
  if (isSolutionLine(line)) {
    return "color:#FF00FF;";
  }
  return "";
}

function renderTextStatusBadge(line = {}) {
  const rawStatus = String(line?.textStatus || "correcto").trim().toLowerCase();
  const validStatuses = new Set(["desbordado", "fuera de la página", "parcialmente fuera de la página"]);
  const status = validStatuses.has(rawStatus) ? rawStatus : "correcto";
  const statusClass = status.replaceAll(" ", "-").replaceAll("á", "a");
  return `<span class="analizar-pdf-text-status-badge is-${escapeHtml(statusClass)}">${escapeHtml(status)}</span>`;
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

function renderConfiguredSwatches(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return "";
  }
  return `
    <div class="analizar-pdf-meta-row is-stack">
      <span>Swatches configurados</span>
      <div class="analizar-pdf-page-body">
        ${items.map((item) => {
          const alias = String(item?.alias || "swatch").trim();
          const swatchName = String(item?.swatchName || "").trim() || "N/D";
          const sourceBits = [
            item?.inText ? "texto" : "",
            item?.inFrames ? "frames" : "",
          ].filter(Boolean);
          const sourceLabel = sourceBits.length ? ` · ${sourceBits.join(" + ")}` : "";
          return `<p><strong>${escapeHtml(alias)}</strong>: ${escapeHtml(swatchName)}${escapeHtml(sourceLabel)}</p>`;
        }).join("")}
      </div>
    </div>
  `;
}

function renderChangeControlMetaList(activeItems = [], historyItems = []) {
  const hasActive = Array.isArray(activeItems) && activeItems.length;
  const hasHistory = Array.isArray(historyItems) && historyItems.length;
  if (!hasActive && !hasHistory) {
    return "";
  }
  return `
    <div class="analizar-pdf-meta-row is-stack">
      <span>Control de cambios</span>
      <div class="analizar-pdf-page-body">
        ${hasActive ? `<p><strong>Notas activas</strong></p>` : ""}
        ${activeItems.map((item) => {
          const text = String(item?.text || "").trim();
          const userName = String(item?.userName || "").trim();
          const suffix = userName ? ` · ${userName}` : "";
          return `<p><strong>Nota</strong>: ${escapeHtml(text)}${escapeHtml(suffix)}</p>`;
        }).join("")}
        ${hasHistory ? `<p><strong>Historial de notas</strong></p>` : ""}
        ${historyItems.map((item) => {
          const text = String(item?.text || "").trim();
          const userName = String(item?.userName || "").trim();
          const changeType = String(item?.changeType || "").trim();
          const suffix = [userName, changeType].filter(Boolean).join(" · ");
          return `<p><strong>Historial</strong>: ${escapeHtml(text)}${suffix ? ` · ${escapeHtml(suffix)}` : ""}</p>`;
        }).join("")}
      </div>
    </div>
  `;
}

function renderRecortableMetaList(page = {}) {
  const summary = page?.recortableSummary || {};
  const issues = Array.isArray(page?.recortableIssues) ? page.recortableIssues : [];
  const originCodes = Array.isArray(summary.originCodes) ? summary.originCodes : [];
  const destinationCodes = Array.isArray(summary.destinationCodes) ? summary.destinationCodes : [];
  const resolved = Array.isArray(summary.resolvedDestinations) ? summary.resolvedDestinations : [];
  const resolvedLinks = Array.isArray(summary.resolvedLinks) ? summary.resolvedLinks : [];
  const statusBadge = issues.length
    ? `<span class="analizar-pdf-inline-badge is-error">Error</span>`
    : (originCodes.length || destinationCodes.length || resolved.length)
      ? `<span class="analizar-pdf-inline-badge is-ok">OK</span>`
      : "";
  const rows = [];

  if (resolvedLinks.length) {
    rows.push(...resolvedLinks.flatMap((item) => {
      const origins = Array.isArray(item?.origins) ? item.origins.filter(Boolean) : [];
      const originLabel = origins.length ? origins.map((folio) => `pág. ${folio}`).join(", ") : "pág. ?";
      return [
        `Origen ${item.code}: ${originLabel}`,
        `${item.code}: destino pág. ${item.destination || "?"}`,
      ];
    }));
  } else {
    if (originCodes.length) {
      rows.push(...originCodes.map((code) => `Origen ${code}: pág. ${page?.pageName || "?"}`));
    }
    if (destinationCodes.length) {
      rows.push(`Destino: ${destinationCodes.join(", ")}`);
    }
    if (resolved.length) {
      rows.push(...resolved.map((item) => `${item.code}: destino pág. ${item.destination}`));
    }
  }
  if (!rows.length && !issues.length && !summary.originIndicator) {
    return "";
  }
  return `
    <div class="analizar-pdf-meta-row is-stack">
      <span>Recortables / Fichas / Anexos / Videos ${statusBadge}</span>
      ${rows.length ? `
        <div class="analizar-pdf-page-body">
          ${rows.map((row) => `<p>${escapeHtml(row)}</p>`).join("")}
        </div>
      ` : ""}
      ${issues.length ? renderIssues(issues, "") : ""}
    </div>
  `;
}

function countCorrectableIssues(page = {}) {
  const ortho = Array.isArray(page?.orthotypographyIssues) ? page.orthotypographyIssues.length : 0;
  const spelling = Array.isArray(page?.spellingIssues) ? page.spellingIssues.length : 0;
  return ortho + spelling;
}

function normalizeIssueFragment(value = "") {
  return String(value || "").trim();
}

function collectPageHighlightFragments(page = {}) {
  const fragments = new Set();
  for (const issue of Array.isArray(page?.orthotypographyIssues) ? page.orthotypographyIssues : []) {
    const excerpt = normalizeIssueFragment(issue?.excerpt);
    if (excerpt) fragments.add(excerpt);
  }
  for (const issue of Array.isArray(page?.spellingIssues) ? page.spellingIssues : []) {
    const token = normalizeIssueFragment(issue?.token);
    if (token) fragments.add(token);
  }
  return [...fragments].sort((a, b) => b.length - a.length);
}

function buildHighlightRanges(text = "", fragments = []) {
  const source = String(text || "");
  const lower = source.toLowerCase();
  const ranges = [];
  for (const fragment of fragments) {
    const needle = String(fragment || "").trim();
    if (!needle) continue;
    const lowerNeedle = needle.toLowerCase();
    let startIndex = 0;
    while (startIndex < lower.length) {
      const foundAt = lower.indexOf(lowerNeedle, startIndex);
      if (foundAt === -1) break;
      const endAt = foundAt + needle.length;
      const overlaps = ranges.some((range) => !(endAt <= range.start || foundAt >= range.end));
      if (!overlaps) {
        ranges.push({ start: foundAt, end: endAt });
      }
      startIndex = foundAt + Math.max(1, needle.length);
    }
  }
  return ranges.sort((a, b) => a.start - b.start);
}

function renderHighlightedText(text = "", fragments = []) {
  const source = String(text || "");
  const ranges = buildHighlightRanges(source, fragments);
  if (!ranges.length) {
    return escapeHtml(source);
  }
  let cursor = 0;
  const chunks = [];
  for (const range of ranges) {
    if (range.start > cursor) {
      chunks.push(escapeHtml(source.slice(cursor, range.start)));
    }
    chunks.push(`<span class="analizar-pdf-text-highlight">${escapeHtml(source.slice(range.start, range.end))}</span>`);
    cursor = range.end;
  }
  if (cursor < source.length) {
    chunks.push(escapeHtml(source.slice(cursor)));
  }
  return chunks.join("");
}

function hasTextStatusIssueLines(lines = []) {
  return Array.isArray(lines) && lines.some((line) => {
    const status = String(line?.textStatus || "").trim().toLowerCase();
    return status === "fuera de la página" || status === "desbordado" || status === "parcialmente fuera de la página";
  });
}

function renderTextMetaSectionHeader(label = "", canHideOutside = false, hideOutsideText = false) {
  return `
    <div class="analizar-pdf-meta-section-head">
      <span>${escapeHtml(label)}</span>
      ${canHideOutside ? `
        <button
          type="button"
          class="analizar-pdf-icon-btn analizar-pdf-report-toggle-btn"
          data-action="toggle-hide-outside-text"
          aria-pressed="${hideOutsideText ? "true" : "false"}"
          aria-label="${hideOutsideText ? "Mostrar textos fuera, parciales o desbordados" : "Ocultar textos fuera, parciales o desbordados"}"
          data-tooltip="${hideOutsideText ? "Mostrar textos fuera, parciales o desbordados" : "Ocultar textos fuera, parciales o desbordados"}"
        >
          <i class="fas ${hideOutsideText ? "fa-eye" : "fa-eye-slash"}" aria-hidden="true"></i>
        </button>
      ` : ""}
    </div>
  `;
}

function filterLinesByStatuses(lines = [], statuses = []) {
  const allowed = new Set(statuses.map((status) => String(status || "").trim().toLowerCase()).filter(Boolean));
  if (!allowed.size) return [];
  return lines.filter((line) => allowed.has(String(line?.textStatus || "").trim().toLowerCase()));
}

function renderProblematicTextMetaList(label = "", lines = [], page = {}, options = {}) {
  if (!Array.isArray(lines) || !lines.length) {
    return "";
  }
  const fragments = collectPageHighlightFragments(page);
  const hideOutsideText = options?.hideOutsideText === true;
  const canHideOutside = hasTextStatusIssueLines(lines);
  return `
    <div class="analizar-pdf-meta-row is-stack${hideOutsideText ? " is-hiding-outside-text" : ""}">
      ${renderTextMetaSectionHeader(label, canHideOutside, hideOutsideText)}
      <div class="analizar-pdf-page-body">
        ${sortLinesByGeometry(lines).map((line) => `
          <div class="analizar-pdf-page-body-item${["fuera de la página", "desbordado", "parcialmente fuera de la página"].includes(String(line?.textStatus || "").trim().toLowerCase()) ? " is-outside-page-text" : ""}">
            ${renderTextStatusBadge(line)}
            <p class="${isSolutionLine(line) ? "analizar-pdf-solution-line" : ""}" style="${escapeHtml(getPageBodyLineStyle(line))}">${renderHighlightedText(line.text || "", fragments)}</p>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderSolutionMetaList(lines = [], page = {}, options = {}) {
  if (!Array.isArray(lines) || !lines.length) {
    return "";
  }
  const fragments = collectPageHighlightFragments(page);
  const hideOutsideText = options?.hideOutsideText === true;
  const canHideOutside = hasTextStatusIssueLines(lines);
  return `
    <div class="analizar-pdf-meta-row is-stack${hideOutsideText ? " is-hiding-outside-text" : ""}">
      ${renderTextMetaSectionHeader("Solucionario", canHideOutside, hideOutsideText)}
      <div class="analizar-pdf-page-body">
        ${lines.map((line) => `
          <div class="analizar-pdf-page-body-item${["fuera de la página", "desbordado", "parcialmente fuera de la página"].includes(String(line?.textStatus || "").trim().toLowerCase()) ? " is-outside-page-text" : ""}">
            ${renderTextStatusBadge(line)}
            <p class="analizar-pdf-solution-line" style="${escapeHtml(getPageBodyLineStyle(line))}">${renderHighlightedText(line.text || "", fragments)}</p>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function isOddPage(page = {}) {
  const value = Number.parseInt(String(page?.pageName || "").trim(), 10);
  return Number.isFinite(value) && value % 2 === 1;
}

function renderFolioSignals(page = {}, session = null, options = {}) {
  const bodyLines = collectPageBodyLines(page, session);
  const outsideLines = filterLinesByStatuses(bodyLines, ["fuera de la página", "parcialmente fuera de la página"]);
  const overflowLines = filterLinesByStatuses(bodyLines, ["desbordado"]);
  return `
    <div class="analizar-pdf-meta-list">
      ${renderFieldProfiles(page.fieldProfiles)}
      ${renderConfiguredSwatches(page.configuredSwatches)}
      ${renderConfiguredAliasRows(page, session)}
      <span id="${getNotesAnchorId(page, session)}" class="analizar-pdf-anchor-target" aria-hidden="true"></span>
      ${renderChangeControlMetaList(page.notes, page.noteHistory)}
      ${renderRecortableMetaList(page)}
      ${renderProblematicTextMetaList("Textos fuera de pantalla", outsideLines, page, options)}
      ${renderProblematicTextMetaList("Textos desbordados", overflowLines, page, options)}
      ${renderSolutionMetaList(collectSolutionLines(page), page, options)}
    </div>
  `;
}

function buildPageAnchorScope(context = {}) {
  return [
    slugifyAnchorPart(context?.sessionId || context?.id || ""),
    slugifyAnchorPart(context?.revisionTitle || ""),
    slugifyAnchorPart(context?.fileTitle || context?.title || ""),
  ].filter(Boolean).join("-");
}

function getOrthotypographyAnchorId(page = {}, context = {}) {
  return `analizar-pdf-orthotypography-${buildPageAnchorScope(context)}-page-${slugifyAnchorPart(page.pageName || "x")}`;
}

function getFieldProfileAnchorId(page = {}, context = {}) {
  return `analizar-pdf-field-profile-${buildPageAnchorScope(context)}-page-${slugifyAnchorPart(page.pageName || "x")}`;
}

function getTextStatusAnchorId(page = {}, context = {}) {
  return `analizar-pdf-text-status-${buildPageAnchorScope(context)}-page-${slugifyAnchorPart(page.pageName || "x")}`;
}

function getNotesAnchorId(page = {}, context = {}) {
  return `analizar-pdf-change-control-${buildPageAnchorScope(context)}-page-${slugifyAnchorPart(page.pageName || "x")}`;
}

function getRecortableAnchorId(page = {}, context = {}) {
  return `analizar-pdf-recortable-${buildPageAnchorScope(context)}-page-${slugifyAnchorPart(page.pageName || "x")}`;
}

function getProblematicTextStatusSummary(page = {}) {
  const lines = [...collectPageBodyLines(page), ...collectSolutionLines(page)];
  let outsideCount = 0;
  let partialCount = 0;
  let overflowCount = 0;
  for (const line of lines) {
    const status = String(line?.textStatus || "correcto").trim().toLowerCase();
    if (status === "fuera de la página") outsideCount += 1;
    if (status === "parcialmente fuera de la página") partialCount += 1;
    if (status === "desbordado") overflowCount += 1;
  }
  return {
    outsideCount,
    partialCount,
    overflowCount,
    total: outsideCount + partialCount + overflowCount,
  };
}

function renderRailBadge(label = "", variant = "danger", icon = "") {
  const safeLabel = escapeHtml(label);
  const safeVariant = escapeHtml(variant);
  const iconHtml = icon ? `<span class="analizar-pdf-rail-badge-icon" aria-hidden="true">${escapeHtml(icon)}</span>` : "";
  return `<span class="analizar-pdf-rail-badge is-${safeVariant}">${iconHtml}<span>${safeLabel}</span></span>`;
}

function pageHasReportIssues(page = {}) {
  const orthotypographyCount = Array.isArray(page?.orthotypographyIssues) ? page.orthotypographyIssues.length : 0;
  const spellingCount = Array.isArray(page?.spellingIssues) ? page.spellingIssues.length : 0;
  const recortableCount = Array.isArray(page?.recortableIssues) ? page.recortableIssues.length : 0;
  const noteCount = Array.isArray(page?.notes) ? page.notes.length : 0;
  const noteHistoryCount = Array.isArray(page?.noteHistory) ? page.noteHistory.length : 0;
  const textStatusTotal = getProblematicTextStatusSummary(page).total || 0;
  return (orthotypographyCount + spellingCount + recortableCount + noteCount + noteHistoryCount + textStatusTotal) > 0;
}

function renderPageApprovalBadge(page = {}) {
  if (pageHasReportIssues(page)) {
    return "";
  }
  return `
    <span class="analizar-pdf-inline-badge is-ok analizar-pdf-inline-badge--approved">
      <i class="fas fa-check" aria-hidden="true"></i>
      <span>Aprobado</span>
    </span>
  `;
}

function renderRightRail(items = [], context = {}, correctionSelection = {}) {
  const hasItems = Array.isArray(items) && items.length;
  if (!hasItems) {
    return `
      <aside class="analizar-pdf-ortho-rail">
        <div class="analizar-pdf-ortho-rail-head">
          <h4>Accesos rápidos</h4>
          ${renderCorrectionModeToggle(correctionSelection)}
        </div>
        <div class="analizar-pdf-ortho-rail-body">
          <p class="analizar-pdf-empty-state">Sin accesos directos disponibles.</p>
        </div>
      </aside>
    `;
  }
  return `
    <aside class="analizar-pdf-ortho-rail">
      <div class="analizar-pdf-ortho-rail-head">
        <h4>Accesos rápidos</h4>
        ${renderCorrectionModeToggle(correctionSelection)}
      </div>
      <div class="analizar-pdf-ortho-rail-body">${renderRailGroups(items, context, correctionSelection)}</div>
    </aside>
  `;
}

function renderGroupedRightRail(fileEntries = []) {
  const entries = Array.isArray(fileEntries) ? fileEntries : [];
  if (!entries.length) {
    return renderRightRail([]);
  }
  return `
    <aside class="analizar-pdf-ortho-rail">
      <div class="analizar-pdf-ortho-rail-head">
        <h4>Accesos rápidos</h4>
        ${renderCorrectionModeToggle(entries[0]?.correctionSelection || {})}
      </div>
      <div class="analizar-pdf-ortho-rail-body">
        ${entries.map((entry, index) => `
          <details class="analizar-pdf-ortho-rail-group" ${index === 0 ? "open" : ""}>
            <summary>
              <span
                class="analizar-pdf-rail-file-title"
                data-tooltip="${escapeHtmlAttr(entry.fileTitle || entry.title || "Archivo")}"
              ><span class="analizar-pdf-rail-file-title-text">${escapeHtml(entry.fileTitle || entry.title || "Archivo")}</span></span>
              <span class="analizar-pdf-summary-toggle" aria-hidden="true"></span>
            </summary>
            <div class="analizar-pdf-ortho-file-group">${renderRailGroups(entry.result?.stats?.pageReports || [], entry, entry?.correctionSelection || {})}</div>
          </details>
        `).join("")}
      </div>
    </aside>
  `;
}

function renderCorrectionModeToggle(correctionSelection = {}) {
  const checkboxesVisible = correctionSelection?.checkboxesVisible === true;
  return `
    <button
      type="button"
      class="analizar-pdf-icon-btn analizar-pdf-rail-selection-toggle"
      data-action="toggle-correction-mode"
      aria-pressed="${checkboxesVisible ? "true" : "false"}"
      aria-label="${checkboxesVisible ? "Ocultar checkboxes de corrección" : "Mostrar checkboxes de corrección"}"
      data-tooltip="${checkboxesVisible ? "Ocultar checkboxes de corrección" : "Mostrar checkboxes de corrección"}"
    >
      <i class="fas ${checkboxesVisible ? "fa-list-check" : "fa-square-check"}" aria-hidden="true"></i>
    </button>
  `;
}

function renderCorrectionRailGroup(items = [], context = {}, correctionSelection = {}) {
  const pages = Array.isArray(items) ? items : [];
  const selectedPages = new Set(Array.isArray(correctionSelection?.selectedPages) ? correctionSelection.selectedPages : []);
  const selectedIssueIds = new Set(Array.isArray(correctionSelection?.selectedIssueIds) ? correctionSelection.selectedIssueIds : []);
  const checkboxesVisible = correctionSelection?.checkboxesVisible === true;
  return `
    <details class="analizar-pdf-ortho-rail-group" open>
      <summary><span>Corrección selectiva</span><span class="analizar-pdf-summary-toggle" aria-hidden="true"></span></summary>
      ${pages.length ? `
        <nav class="analizar-pdf-ortho-nav" aria-label="Selección de páginas para corrección">
          ${pages.map((page) => {
            const pageName = String(page?.pageName || "?").trim();
            const pageSelected = selectedPages.has(pageName);
            const selectedCount = [
              ...(Array.isArray(page?.orthotypographyIssues) ? page.orthotypographyIssues : []).map((issue) => buildCorrectionIssueId("orthotypography", issue)),
              ...(Array.isArray(page?.spellingIssues) ? page.spellingIssues : []).map((issue) => buildCorrectionIssueId("spelling", issue)),
            ].filter((issueId) => selectedIssueIds.has(issueId)).length;
            const totalCount = countCorrectableIssues(page);
            return `
              <div class="analizar-pdf-ortho-link analizar-pdf-correction-link${pageSelected ? " is-selected" : ""}">
                ${checkboxesVisible ? `
                  <label class="analizar-pdf-correction-checkbox">
                    <input
                      type="checkbox"
                      data-action="toggle-correction-page"
                      data-page-name="${escapeHtmlAttr(pageName)}"
                      ${pageSelected ? "checked" : ""}
                    >
                    <span aria-hidden="true"></span>
                  </label>
                ` : ""}
                <a class="analizar-pdf-correction-link-anchor" href="#${getTextStatusAnchorId(page, context)}">
                  <span>Página ${escapeHtml(pageName)}</span>
                  ${renderRailBadge(
                    `${selectedCount}/${totalCount || 0}`,
                    pageSelected && selectedCount ? "ok" : "warning"
                  )}
                </a>
              </div>
            `;
          }).join("")}
        </nav>
      ` : `<p class="analizar-pdf-empty-state">Sin páginas para seleccionar.</p>`}
    </details>
  `;
}

function renderRailGroups(items = [], context = {}, correctionSelection = {}) {
  const pagesWithOrthoIssues = (Array.isArray(items) ? items : []).filter((page) => Array.isArray(page?.orthotypographyIssues) && page.orthotypographyIssues.length);
  const pagesWithTextStatusIssues = (Array.isArray(items) ? items : [])
    .map((page) => ({ page, summary: getProblematicTextStatusSummary(page) }))
    .filter((entry) => entry.summary.total > 0);
  const pagesWithNotes = (Array.isArray(items) ? items : []).filter((page) => {
    const active = Array.isArray(page?.notes) ? page.notes.length : 0;
    const history = Array.isArray(page?.noteHistory) ? page.noteHistory.length : 0;
    return active + history > 0;
  });
  const pagesWithFieldProfile = (Array.isArray(items) ? items : []).filter((page) => Array.isArray(page?.fieldProfiles) && page.fieldProfiles.length);
  const pagesWithRecortables = (Array.isArray(items) ? items : []).filter((page) => {
    const summary = page?.recortableSummary || {};
    return Boolean(
      (Array.isArray(page?.recortableIssues) && page.recortableIssues.length) ||
      (Array.isArray(summary.originCodes) && summary.originCodes.length) ||
      (Array.isArray(summary.destinationCodes) && summary.destinationCodes.length) ||
      (Array.isArray(summary.resolvedDestinations) && summary.resolvedDestinations.length)
    );
  });
  return `
    ${renderCorrectionRailGroup(items, context, correctionSelection)}
    <details class="analizar-pdf-ortho-rail-group">
      <summary><span>Ortotipografía</span><span class="analizar-pdf-summary-toggle" aria-hidden="true"></span></summary>
      ${pagesWithOrthoIssues.length ? `
        <nav class="analizar-pdf-ortho-nav" aria-label="Accesos rápidos de ortotipografía">
          ${pagesWithOrthoIssues.map((page) => `
            <a class="analizar-pdf-ortho-link" href="#${getOrthotypographyAnchorId(page, context)}">
              <span>Página ${escapeHtml(page.pageName || "?")}</span>
              ${renderRailBadge(String(page.orthotypographyIssues.length), "danger")}
            </a>
          `).join("")}
        </nav>
      ` : `<p class="analizar-pdf-empty-state">Sin hallazgos ortotipográficos.</p>`}
    </details>
    <details class="analizar-pdf-ortho-rail-group">
      <summary><span>Texto fuera / parcial / desbordado</span><span class="analizar-pdf-summary-toggle" aria-hidden="true"></span></summary>
      ${pagesWithTextStatusIssues.length ? `
        <nav class="analizar-pdf-ortho-nav" aria-label="Accesos rápidos de texto fuera, parcial o desbordado">
          ${pagesWithTextStatusIssues.map(({ page, summary }) => `
            <a class="analizar-pdf-ortho-link" href="#${getTextStatusAnchorId(page, context)}">
              <span>Página ${escapeHtml(page.pageName || "?")}</span>
              ${renderRailBadge([
                summary.outsideCount ? `${summary.outsideCount} fuera` : "",
                summary.partialCount ? `${summary.partialCount} parcial` : "",
                summary.overflowCount ? `${summary.overflowCount} desb.` : "",
              ].filter(Boolean).join(" · "), "warning")}
            </a>
          `).join("")}
        </nav>
      ` : `<p class="analizar-pdf-empty-state">Sin texto fuera, parcial o desbordado.</p>`}
    </details>
    <details class="analizar-pdf-ortho-rail-group">
      <summary><span>Campo formativo</span><span class="analizar-pdf-summary-toggle" aria-hidden="true"></span></summary>
      ${pagesWithFieldProfile.length ? `
        <nav class="analizar-pdf-ortho-nav" aria-label="Accesos rápidos de campo formativo">
          ${pagesWithFieldProfile.map((page) => {
            const label = String(page?.fieldProfiles?.[0]?.label || "Campo formativo").trim();
            return `
              <a class="analizar-pdf-ortho-link" href="#${getFieldProfileAnchorId(page, context)}">
                <span>Página ${escapeHtml(page.pageName || "?")}</span>
                <strong>${escapeHtml(label)}</strong>
              </a>
            `;
          }).join("")}
        </nav>
      ` : `<p class="analizar-pdf-empty-state">Sin campo formativo detectado.</p>`}
    </details>
    <details class="analizar-pdf-ortho-rail-group">
      <summary><span>Control de cambios</span><span class="analizar-pdf-summary-toggle" aria-hidden="true"></span></summary>
      ${pagesWithNotes.length ? `
        <nav class="analizar-pdf-ortho-nav" aria-label="Accesos rápidos de control de cambios">
          ${pagesWithNotes.map((page) => `
            <a class="analizar-pdf-ortho-link" href="#${getNotesAnchorId(page, context)}">
              <span>Página ${escapeHtml(page.pageName || "?")}</span>
              ${renderRailBadge(String((Array.isArray(page?.notes) ? page.notes.length : 0) + (Array.isArray(page?.noteHistory) ? page.noteHistory.length : 0)), "warning")}
            </a>
          `).join("")}
        </nav>
      ` : `<p class="analizar-pdf-empty-state">Sin control de cambios detectado.</p>`}
    </details>
    <details class="analizar-pdf-ortho-rail-group">
      <summary><span>Recortables / Fichas / Anexos / Videos</span><span class="analizar-pdf-summary-toggle" aria-hidden="true"></span></summary>
      ${pagesWithRecortables.length ? `
        <nav class="analizar-pdf-ortho-nav" aria-label="Accesos rápidos de recortables, fichas, anexos y videos">
          ${pagesWithRecortables.map((page) => {
            const summary = page?.recortableSummary || {};
            const issuesCount = Array.isArray(page?.recortableIssues) ? page.recortableIssues.length : 0;
            const labels = [
              ...(Array.isArray(summary.originCodes) ? summary.originCodes : []),
              ...(Array.isArray(summary.destinationCodes) ? summary.destinationCodes : []),
            ].filter(Boolean);
            const label = labels[0] || (Array.isArray(summary.resolvedDestinations) && summary.resolvedDestinations[0] ? summary.resolvedDestinations[0].code : "Recortable");
            return `
              <a class="analizar-pdf-ortho-link" href="#${getRecortableAnchorId(page, context)}">
                <span>Página ${escapeHtml(page.pageName || "?")}</span>
                ${issuesCount
                  ? renderRailBadge(label, "danger", "✕")
                  : `<strong>${escapeHtml(label)}</strong>`}
              </a>
            `;
          }).join("")}
        </nav>
      ` : `<p class="analizar-pdf-empty-state">Sin referencias detectadas.</p>`}
    </details>
  `;
}

function renderSelectableIssueList(kind = "", page = {}, correctionSelection = {}) {
  const issues = kind === "orthotypography"
    ? (Array.isArray(page?.orthotypographyIssues) ? page.orthotypographyIssues : [])
    : (Array.isArray(page?.spellingIssues) ? page.spellingIssues : []);
  const emptyLabel = kind === "orthotypography"
    ? "Sin hallazgos ortotipográficos en esta página."
    : "Sin hallazgos ortográficos en esta página.";
  if (!issues.length) {
    return `<p class="analizar-pdf-empty-state">${escapeHtml(emptyLabel)}</p>`;
  }
  const pageName = String(page?.pageName || "").trim();
  const pageSelected = new Set(Array.isArray(correctionSelection?.selectedPages) ? correctionSelection.selectedPages : []).has(pageName);
  const checkboxesVisible = correctionSelection?.checkboxesVisible === true;
  const selectedIssueIds = new Set(Array.isArray(correctionSelection?.selectedIssueIds) ? correctionSelection.selectedIssueIds : []);
  return `
    ${checkboxesVisible && !pageSelected ? `<p class="analizar-pdf-empty-state">Selecciona esta página en el rail para marcar hallazgos individuales.</p>` : ""}
    <ul class="analizar-pdf-selectable-issue-list">
      ${issues.map((issue) => {
        const issueId = buildCorrectionIssueId(kind, issue);
        const checked = selectedIssueIds.has(issueId);
        const message = String(issue?.message || issue?.reason || JSON.stringify(issue)).trim();
        return `
          <li class="analizar-pdf-selectable-issue-item${checked ? " is-selected" : ""}">
            ${checkboxesVisible ? `
              <label class="analizar-pdf-correction-checkbox analizar-pdf-correction-checkbox--issue">
                <input
                  type="checkbox"
                  data-action="toggle-correction-issue"
                  data-issue-kind="${escapeHtmlAttr(kind)}"
                  data-page-name="${escapeHtmlAttr(pageName)}"
                  data-issue-id="${escapeHtmlAttr(issueId)}"
                  ${pageSelected ? "" : "disabled"}
                  ${checked ? "checked" : ""}
                >
                <span aria-hidden="true"></span>
              </label>
            ` : ""}
            <span>${escapeHtml(message)}</span>
          </li>
        `;
      }).join("")}
    </ul>
  `;
}

function renderPageReportItems(items = [], session = null, options = {}) {
  if (!Array.isArray(items) || !items.length) {
    return `<p class="analizar-pdf-empty-state">No hay reporte por página disponible.</p>`;
  }
  return items.map((page) => `
    <article class="analizar-pdf-page-report">
      <header class="analizar-pdf-page-report-head">
        <div class="analizar-pdf-page-report-head-copy">
          <h4>Página ${escapeHtml(page.pageName || "?")}</h4>
          ${renderPageApprovalBadge(page)}
          ${(() => {
            const pageName = String(page?.pageName || "").trim();
            const selectedPages = new Set(Array.isArray(session?.correctionSelection?.selectedPages) ? session.correctionSelection.selectedPages : []);
            const selectedIssueIds = new Set(Array.isArray(session?.correctionSelection?.selectedIssueIds) ? session.correctionSelection.selectedIssueIds : []);
            const selectedCount = [
              ...(Array.isArray(page?.orthotypographyIssues) ? page.orthotypographyIssues : []).map((issue) => buildCorrectionIssueId("orthotypography", issue)),
              ...(Array.isArray(page?.spellingIssues) ? page.spellingIssues : []).map((issue) => buildCorrectionIssueId("spelling", issue)),
            ].filter((issueId) => selectedIssueIds.has(issueId)).length;
            return selectedPages.has(pageName)
              ? `<span class="analizar-pdf-inline-badge is-ok">Corrección ${selectedCount} seleccionada(s)</span>`
              : "";
          })()}
        </div>
        <span>Master: ${escapeHtml(page.masterName || page.appliedMaster || "N/D")}</span>
      </header>
      <span id="${getFieldProfileAnchorId(page, session)}" class="analizar-pdf-anchor-target" aria-hidden="true"></span>
      <section id="${getTextStatusAnchorId(page, session)}">
        ${renderFolioSignals(page, session, options)}
      </section>
      <span id="${getRecortableAnchorId(page, session)}" class="analizar-pdf-anchor-target" aria-hidden="true"></span>
      <section id="${getOrthotypographyAnchorId(page, session)}">
        <h5>Ortotipografía</h5>
        ${renderSelectableIssueList("orthotypography", page, session?.correctionSelection || {})}
      </section>
      <section>
        <h5>Ortografía</h5>
        ${renderSelectableIssueList("spelling", page, session?.correctionSelection || {})}
      </section>
      ${(() => {
        const modes = Array.isArray(page?.instructionWorkModes) ? page.instructionWorkModes : [];
        if (!modes.length) return "";
        return `
          <section>
            <h5>Iconos de Trabajo Detectados</h5>
            <ul class="analizar-pdf-selectable-issue-list">
              ${modes.map(mode => `
                <li class="analizar-pdf-selectable-issue-item">
                  <span class="analizar-pdf-inline-badge is-ok">Modalidad: ${escapeHtml(mode.kind)}</span>
                  <span>${escapeHtml(mode.text)}</span>
                </li>
              `).join("")}
            </ul>
          </section>
        `;
      })()}
    </article>
  `).join("");
}

function renderFilePageReports(fileEntry = {}, index = 0, options = {}) {
  const items = fileEntry?.result?.stats?.pageReports;
  const reportTitle = `Reporte por página Archivo ${index + 1}`;
  return `
    <details class="analizar-pdf-file-report-block" ${index === 0 ? "open" : ""}>
      <summary class="analizar-pdf-file-report-summary">
        <div class="analizar-pdf-file-report-summary-copy">
          <strong>${escapeHtml(reportTitle)}</strong>
          <span>${escapeHtml(fileEntry.fileTitle || `Archivo ${index + 1}`)}</span>
          ${fileEntry.revisionTitle ? `<small>${escapeHtml(fileEntry.revisionTitle)}</small>` : ""}
        </div>
        <span class="analizar-pdf-summary-toggle" aria-hidden="true"></span>
      </summary>
      <div class="analizar-pdf-file-report-body">
        ${renderPageReportItems(items, fileEntry, options)}
      </div>
    </details>
  `;
}

function renderFileIssueCards(fileEntry = {}) {
  const result = fileEntry?.result || {};
  return `
    <article class="analizar-pdf-result-card">
      <h3>${escapeHtml(fileEntry.fileTitle || "Archivo")}</h3>
      ${renderKeyValueRows([
        { label: "Estado", value: String(fileEntry.analysisStatus || "idle") },
        { label: "Tipo", value: String(fileEntry.sourceType || "-").toUpperCase() },
        { label: "Páginas", value: String(fileEntry?.resultSummary?.pageCount || fileEntry?.result?.stats?.pageCount || 0) },
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
      <h3>Control de cambios</h3>
      ${renderIssues([
        ...((Array.isArray(result.noteIssues) ? result.noteIssues : [])),
        ...((Array.isArray(result.noteHistoryIssues) ? result.noteHistoryIssues : [])),
      ], "Sin control de cambios detectado en el IDML.")}
    </article>
    <article class="analizar-pdf-result-card">
      <h3>Colores</h3>
      ${renderIssues(result.colorIssues, "Sin hallazgos de color.")}
    </article>
    <article class="analizar-pdf-result-card">
      <h3>Recortables / Fichas / Anexos / Videos</h3>
      ${renderIssues(result.recortableIssues, "Sin hallazgos de recursos vinculados.")}
    </article>
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
  const { el, pageReportsEl, onToggleCorrectionMode, onToggleCorrectionPage, onToggleCorrectionIssue } = deps;
  let auxiliaryPanelsHidden = true;
  let outsideTextHidden = false;

  function bindEvents() {
    const toggle = el?.querySelector("[data-action='toggle-auxiliary-panels']");
    if (toggle) {
      toggle.addEventListener("click", () => {
        auxiliaryPanelsHidden = !auxiliaryPanelsHidden;
        const session = el.__analizarPdfSession || null;
        render(session);
      });
    }
    pageReportsEl?.querySelectorAll("[data-action='toggle-hide-outside-text']").forEach((button) => {
      button.addEventListener("click", () => {
        outsideTextHidden = !outsideTextHidden;
        const session = pageReportsEl.__analizarPdfSession || el?.__analizarPdfSession || null;
        render(session);
      });
    });
    pageReportsEl?.querySelector("[data-action='toggle-correction-mode']")?.addEventListener("click", () => {
      if (typeof onToggleCorrectionMode === "function") {
        onToggleCorrectionMode();
      }
    });
    pageReportsEl?.querySelectorAll("[data-action='toggle-correction-page']").forEach((input) => {
      input.addEventListener("change", (event) => {
        if (typeof onToggleCorrectionPage === "function") {
          onToggleCorrectionPage(event.target?.dataset?.pageName || "");
        }
      });
    });
    pageReportsEl?.querySelectorAll("[data-action='toggle-correction-issue']").forEach((input) => {
      input.addEventListener("change", (event) => {
        if (typeof onToggleCorrectionIssue === "function") {
          onToggleCorrectionIssue({
            kind: event.target?.dataset?.issueKind || "",
            pageName: event.target?.dataset?.pageName || "",
            issueId: event.target?.dataset?.issueId || "",
          });
        }
      });
    });
  }

  function render(session = null) {
    if (el) {
      el.__analizarPdfSession = session;
    }
    if (pageReportsEl) {
      pageReportsEl.__analizarPdfSession = session;
    }
    if (!session) {
      if (el) {
        el.innerHTML = `<div class="analizar-pdf-result-card"><p class="analizar-pdf-empty-state">Selecciona o crea una sesión para empezar.</p></div>`;
      }
      if (pageReportsEl) {
        pageReportsEl.innerHTML = `<div class="analizar-pdf-result-card"><p class="analizar-pdf-empty-state">Todavía no hay reporte por página.</p></div>`;
      }
      return;
    }
    const result = session.result && typeof session.result === "object" ? session.result : {};
    const summary = session.resultSummary && typeof session.resultSummary === "object" ? session.resultSummary : null;
    const stats = result.stats && typeof result.stats === "object" ? result.stats : {};
    const fileEntries = Array.isArray(session.fileResults) && session.fileResults.length ? session.fileResults : [session];
    const reportEntries = fileEntries.filter((entry) => Array.isArray(entry?.result?.stats?.pageReports) && entry.result.stats.pageReports.length);
    if (el) {
      el.innerHTML = "";
    }
    if (pageReportsEl) {
      pageReportsEl.innerHTML = `
        <div class="analizar-pdf-page-report-shell">
          <div class="analizar-pdf-page-report-list">
            ${reportEntries.length
              ? reportEntries.map((entry, index) => renderFilePageReports(entry, index, { hideOutsideText: outsideTextHidden })).join("")
              : `<div class="analizar-pdf-result-card"><p class="analizar-pdf-empty-state">Todavía no hay reporte por página.</p></div>`}
          </div>
          ${reportEntries.length ? renderGroupedRightRail(reportEntries) : renderRightRail([])}
        </div>
      `;
    }
    bindEvents();
  }

  return { render };
}
