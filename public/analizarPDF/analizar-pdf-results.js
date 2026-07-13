import { getRecortableAnchorId, renderRecortableMetaList } from "./analizar-pdf-recortables.js?v=2026-1.0.10.466";
import { hasRenderableAnalysis } from "./analizar-pdf-session-logic.js?v=2026-1.0.10.466";

const railOpenStateByKey = new Map();
const RAIL_WIDTH_STORAGE_KEY = "analizar-pdf-rail-width";
const RAIL_CATEGORY_VISIBILITY_STORAGE_KEY = "analizar-pdf-rail-category-visibility";
const DEFAULT_RAIL_WIDTH = 248;
const MIN_RAIL_WIDTH = 260;
const MAX_RAIL_WIDTH = 640;
const RAIL_CATEGORY_FILTERS = [
  { id: "orthotypography", label: "Ortotipografía" },
  { id: "redaction", label: "Propuestas de redacción" },
  { id: "text-status", label: "Texto fuera o desbordado" },
  { id: "field-profile", label: "Campo formativo" },
  { id: "notes", label: "Control de cambios" },
  { id: "recortables", label: "Recortables / Fichas / Anexos / Videos" },
];
let railCategoryVisibility = null;
let railFilterModalOpen = false;

export function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function escapeHtmlAttr(value = "") {
  return escapeHtml(value)
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function slugifyAnchorPart(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "x";
}

function isRecortableDestinationContext(context = {}) {
  return /^recortables?$/i.test(String(context?.unidad || "").trim())
    && String(context?.recortableRole || "").trim().toLowerCase() === "destination";
}

function getPaginationAnchorId(page = {}, context = {}) {
  return `analizar-pdf-pagination-${buildPageAnchorScope(context)}-page-${slugifyAnchorPart(page.pageName || "x")}`;
}

function getQuickOrthotypographyAnchorId(page = {}, context = {}) {
  return `analizar-pdf-quick-ortho-${buildPageAnchorScope(context)}-page-${slugifyAnchorPart(page.pageName || "x")}`;
}

function buildRailGroupAttrs(groupKey = "") {
  const cleanKey = String(groupKey || "").trim();
  const isOpen = cleanKey ? railOpenStateByKey.get(cleanKey) === true : false;
  return `${cleanKey ? ` data-rail-group-key="${escapeHtmlAttr(cleanKey)}"` : ""}${isOpen ? " open" : ""}`;
}

function buildRailCategoryAttrs(categoryId = "") {
  const cleanCategoryId = String(categoryId || "").trim();
  return cleanCategoryId ? ` data-rail-category="${escapeHtmlAttr(cleanCategoryId)}"` : "";
}

function isRailCategoryVisible(categoryId = "") {
  const cleanCategoryId = String(categoryId || "").trim();
  if (!cleanCategoryId) return true;
  if (!railCategoryVisibility) {
    railCategoryVisibility = readRailCategoryVisibility();
  }
  return railCategoryVisibility[cleanCategoryId] !== false;
}

function normalizeRailSwatchName(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function resolveUnitRailSwatchName(unidad = "") {
  const cleanUnidad = String(unidad || "").trim();
  if (!cleanUnidad) return "";
  if (/^proyecto$/i.test(cleanUnidad)) return "10ED PROYECTO";
  if (/^lecturas?$/i.test(cleanUnidad)) return "COLOR DE LA SEMANA";
  if (/^recortables?$/i.test(cleanUnidad)) return "LEVEL COLOR";
  const unitMatch = cleanUnidad.match(/^unidad\s+(\d{1,2})$/i);
  if (unitMatch) {
    return `U${unitMatch[1]}`;
  }
  return "";
}

function resolveRailTintHex(entry = {}) {
  const targetSwatchName = resolveUnitRailSwatchName(entry?.unidad || entry?.revisionTitle || "");
  if (!targetSwatchName) return "";
  const swatches = Array.isArray(entry?.result?.stats?.swatchInventory) ? entry.result.stats.swatchInventory : [];
  const normalizedTarget = normalizeRailSwatchName(targetSwatchName);
  const getSwatchName = (swatch = {}) => String(swatch?.name || swatch?.swatchName || "").trim();
  const exact = swatches.find((swatch) => normalizeRailSwatchName(getSwatchName(swatch)) === normalizedTarget) || null;
  const loose = exact || swatches.find((swatch) => normalizeRailSwatchName(getSwatchName(swatch)).includes(normalizedTarget)) || null;
  const hex = String(loose?.hex || "").trim();
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex) ? hex : "";
}

function buildRailTintStyleAttr(hex = "") {
  const cleanHex = String(hex || "").trim();
  if (!cleanHex) return "";
  return ` style="--analizar-pdf-rail-tint:${escapeHtmlAttr(cleanHex)};"`;
}

function getRailDisplayTitle(entry = {}) {
  return String(entry?.railTitle || entry?.revisionTitle || entry?.fileTitle || entry?.title || "Ficha editorial").trim() || "Ficha editorial";
}

function getRailDisplayTooltip(entry = {}) {
  const title = getRailDisplayTitle(entry);
  const fileName = String(entry?.railTooltip || entry?.fileTitle || "").trim();
  return fileName && fileName !== title ? `${title} · ${fileName}` : title;
}

function parseSortableTime(value = "") {
  const timestamp = Date.parse(String(value || "").trim());
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function buildOrderedRailEntries(session = null, entries = []) {
  const revisions = Array.isArray(session?.revisions) ? session.revisions : [];
  const activeRevisionId = String(session?.activeRevisionId || "").trim();
  const activeFileId = String(session?.activeFileId || "").trim();
  const entriesByRevisionId = new Map();
  const anonymousEntries = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry) continue;
    const revisionId = String(entry?.revisionId || "").trim();
    if (!revisionId) {
      anonymousEntries.push(entry);
      continue;
    }
    const bucket = entriesByRevisionId.get(revisionId) || [];
    bucket.push(entry);
    entriesByRevisionId.set(revisionId, bucket);
  }
  const ordered = [];
  for (const revision of revisions) {
    const revisionId = String(revision?.id || "").trim();
    if (!revisionId) continue;
    const matches = entriesByRevisionId.get(revisionId) || [];
    if (!matches.length) continue;
    const orderedMatches = [...matches].sort((left, right) => {
      const leftFileIndex = Number(left?.fileIndex);
      const rightFileIndex = Number(right?.fileIndex);
      if (Number.isFinite(leftFileIndex) && Number.isFinite(rightFileIndex) && leftFileIndex !== rightFileIndex) {
        return leftFileIndex - rightFileIndex;
      }
      const leftUpdatedAt = parseSortableTime(left?.fileUpdatedAt || left?.updatedAt || "");
      const rightUpdatedAt = parseSortableTime(right?.fileUpdatedAt || right?.updatedAt || "");
      if (leftUpdatedAt !== rightUpdatedAt) {
        return rightUpdatedAt - leftUpdatedAt;
      }
      return String(left?.fileTitle || left?.title || "").localeCompare(String(right?.fileTitle || right?.title || ""), "es");
    });
    for (const match of orderedMatches) {
      ordered.push({
        ...match,
        revisionTitle: String(revision?.title || match?.revisionTitle || "Revisión").trim(),
        unidad: String(revision?.unidad || match?.unidad || "").trim(),
        recortableRole: String(revision?.recortableRole || match?.recortableRole || "").trim(),
      });
    }
  }
  return [...ordered, ...anonymousEntries].sort((left, right) => {
    const leftActive = String(left?.revisionId || "").trim() === activeRevisionId
      && (!activeFileId || String(left?.fileId || "").trim() === activeFileId);
    const rightActive = String(right?.revisionId || "").trim() === activeRevisionId
      && (!activeFileId || String(right?.fileId || "").trim() === activeFileId);
    if (leftActive !== rightActive) {
      return leftActive ? -1 : 1;
    }
    return 0;
  });
}

export function renderIssues(items = [], emptyLabel = "") {
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

function normalizeStyleNameForMatch(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function normalizeTextForMatch(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function iterPageContentItems(page = {}, includeMaster = true) {
  const sources = [page?.content || {}];
  if (includeMaster) {
    sources.push(page?.masterContent || {});
  }
  const items = [];
  for (const source of sources) {
    for (const bucketItems of Object.values(source || {})) {
      for (const item of Array.isArray(bucketItems) ? bucketItems : []) {
        if (item && typeof item === "object") items.push(item);
      }
    }
  }
  return items;
}

function itemMatchesMappingEntry(item = {}, entry = {}) {
  const styleKind = String(entry?.styleKind || "").trim().toLowerCase();
  const targetStyleName = normalizeStyleNameForMatch(entry?.styleName || "");
  if (!targetStyleName) return false;
  if (styleKind === "character") {
    const characterStyles = Array.isArray(item?.characterStyles) ? item.characterStyles : [];
    return characterStyles.some((styleName) => normalizeStyleNameForMatch(styleName) === targetStyleName);
  }
  return normalizeStyleNameForMatch(item?.styleName || "") === targetStyleName;
}

function appendUniqueSwatches(target = [], item = {}) {
  for (const swatchName of Array.isArray(item?.swatches) ? item.swatches : []) {
    const cleanSwatchName = String(swatchName || "").trim();
    if (cleanSwatchName && !target.includes(cleanSwatchName)) {
      target.push(cleanSwatchName);
    }
  }
}

function itemTextMatchesLines(item = {}, lines = [], lineSet = new Set()) {
  const itemText = normalizeTextForMatch(item?.text || "");
  return Boolean(itemText && (lineSet.has(itemText) || lines.some((line) => itemText.includes(line) || line.includes(itemText))));
}

function collectSwatchesForAliasValue(page = {}, entry = {}, value = "") {
  const lines = String(value || "")
    .split("\n")
    .map((line) => normalizeTextForMatch(line))
    .filter(Boolean);
  if (!lines.length) return [];
  const lineSet = new Set(lines);
  const swatches = [];
  for (const item of iterPageContentItems(page, true)) {
    if (!itemMatchesMappingEntry(item, entry)) continue;
    if (!itemTextMatchesLines(item, lines, lineSet)) continue;
    appendUniqueSwatches(swatches, item);
  }
  return swatches;
}

function collectSwatchesForTextValue(page = {}, value = "") {
  const lines = String(value || "")
    .split("\n")
    .map((line) => normalizeTextForMatch(line))
    .filter(Boolean);
  if (!lines.length) return [];
  const lineSet = new Set(lines);
  const swatches = [];
  for (const item of iterPageContentItems(page, true)) {
    if (!itemTextMatchesLines(item, lines, lineSet)) continue;
    appendUniqueSwatches(swatches, item);
  }
  return swatches;
}

function isNeutralSwatchName(value = "") {
  const normalized = normalizeRailSwatchName(value);
  return !normalized
    || normalized === "NONE"
    || normalized.includes("[NONE]")
    || normalized.includes("BLACK")
    || normalized.includes("[BLACK]")
    || normalized.includes("PAPER")
    || normalized.includes("[PAPER]")
    || normalized.includes("REGISTRATION");
}

function resolveSwatchHex(session = null, swatchNames = []) {
  const names = (Array.isArray(swatchNames) ? swatchNames : [])
    .map((value) => normalizeRailSwatchName(value))
    .filter(Boolean)
    .filter((value) => value !== "NONE" && !value.includes("[NONE]"));
  if (!names.length) return "";
  const prioritizedNames = names.some((name) => !isNeutralSwatchName(name))
    ? names.filter((name) => !isNeutralSwatchName(name))
    : names;
  const swatches = Array.isArray(session?.result?.stats?.swatchInventory) ? session.result.stats.swatchInventory : [];
  for (const targetName of prioritizedNames) {
    const match = swatches.find((swatch) => {
      const swatchName = normalizeRailSwatchName(swatch?.name || swatch?.swatchName || "");
      return swatchName === targetName || swatchName.includes(targetName) || targetName.includes(swatchName);
    });
    const hex = String(match?.hex || "").trim();
    if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) {
      return hex;
    }
  }
  return "";
}

function buildConfiguredAliasRows(page = {}, session = null) {
  const aliasValues = page?.aliasValues && typeof page.aliasValues === "object" ? page.aliasValues : {};
  const entries = Array.isArray(session?.mappingEntries) ? session.mappingEntries : [];
  const groupedByText = new Map();
  const seenEntries = new Set();
  const normalizeValueKey = (value = "") => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  const appendRow = (entry = {}, alias = "", value = "") => {
    const cleanValue = String(value || "").trim();
    if (!cleanValue || cleanValue === "N/D") return;
    const valueKey = normalizeValueKey(cleanValue);
    if (!valueKey) return;
    const row = groupedByText.get(valueKey) || {
      labelSet: new Set(),
      styleSet: new Set(),
      swatchSet: new Set(),
      value: cleanValue,
    };
    const label = formatAliasLabel(alias);
    if (label) row.labelSet.add(label);
    const styleKind = String(entry?.styleKind || "").trim().toLowerCase();
    const styleName = String(entry?.styleName || "").trim();
    if (styleName) {
      const kindLabel = styleKind === "character" ? "Carácter" : styleKind === "paragraph" ? "Párrafo" : "Estilo";
      row.styleSet.add(`${kindLabel}: ${styleName}`);
    }
    for (const swatchName of collectSwatchesForAliasValue(page, entry, cleanValue)) {
      row.swatchSet.add(swatchName);
    }
    if (!row.swatchSet.size) {
      for (const swatchName of collectSwatchesForTextValue(page, cleanValue)) {
        row.swatchSet.add(swatchName);
      }
    }
    groupedByText.set(valueKey, row);
  };
  for (const entry of entries) {
    const alias = String(entry?.alias || "").trim();
    const entryKey = [
      alias,
      String(entry?.styleKind || "").trim(),
      String(entry?.styleName || "").trim(),
      String(entry?.targetPage || "").trim(),
      String(entry?.excludeTargetPage || "").trim(),
    ].join("::");
    if (!alias || seenEntries.has(entryKey) || !mappingEntryAppliesToPage(entry, page)) continue;
    seenEntries.add(entryKey);
    appendRow(entry, alias, aliasValues?.[alias]);
  }
  const instructionWorkType = String(aliasValues?.tipo_trabajo_instruccion || "").trim();
  if (instructionWorkType) {
    groupedByText.set(`instruction::${normalizeValueKey(instructionWorkType)}`, {
      labelSet: new Set(["tipo_trabajo_instruccion"]),
      styleSet: new Set(),
      swatchSet: new Set(),
      value: instructionWorkType,
    });
  }
  return [...groupedByText.values()].map((row) => ({
    label: [...row.labelSet].join(" / "),
    styleSummary: [...row.styleSet].join(" · "),
    swatchNames: [...row.swatchSet],
    swatchHex: resolveSwatchHex(session, [...row.swatchSet]),
    value: row.value,
  }));
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
      <strong class="analizar-pdf-meta-label">${escapeHtml(row.label || "")}${row.styleSummary ? `<small>${escapeHtml(row.styleSummary)}</small>` : ""}</strong>
      <span class="analizar-pdf-meta-value"${row.swatchHex ? ` style="color:${escapeHtmlAttr(row.swatchHex)};-webkit-text-fill-color:${escapeHtmlAttr(row.swatchHex)}"` : ""}>${renderHighlightedMetaValue(row.value || "", fragments)}</span>
    </div>
  `).join("");
}

function renderConfiguredAliasRowsWithValuesOnly(page = {}, session = null) {
  const rows = buildConfiguredAliasRows(page, session)
    .filter((row) => String(row?.value || "").trim() && String(row?.value || "").trim() !== "N/D");
  if (!rows.length) return "";
  const fragments = collectPageHighlightFragments(page);
  return rows.map((row) => `
    <div class="analizar-pdf-meta-row">
      <strong class="analizar-pdf-meta-label">${escapeHtml(row.label || "")}${row.styleSummary ? `<small>${escapeHtml(row.styleSummary)}</small>` : ""}</strong>
      <span class="analizar-pdf-meta-value"${row.swatchHex ? ` style="color:${escapeHtmlAttr(row.swatchHex)};-webkit-text-fill-color:${escapeHtmlAttr(row.swatchHex)}"` : ""}>${renderHighlightedMetaValue(row.value || "", fragments)}</span>
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

function isSolutionLine(line = {}) {
  const styleName = String(line?.styleName || "").trim().toUpperCase();
  return styleName.includes("08_04_00 RESPUESTA ALUMNO");
}

function getPageBodyLineStyle(line = {}) {
  const swatchHex = resolveSwatchHex(line?.session || null, line?.swatches || []);
  if (swatchHex) {
    return `color:${swatchHex};`;
  }
  if (isSolutionLine(line)) {
    return "color:#FF00FF;";
  }
  return "";
}

function withLineSession(line = {}, session = null) {
  return {
    ...(line || {}),
    session,
  };
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
            <p class="${isSolutionLine(line) ? "analizar-pdf-solution-line" : ""}" style="${escapeHtml(getPageBodyLineStyle(withLineSession(line, options?.session || null)))}">${renderHighlightedText(line.text || "", fragments)}</p>
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
            <p class="analizar-pdf-solution-line" style="${escapeHtml(getPageBodyLineStyle(withLineSession(line, options?.session || null)))}">${renderHighlightedText(line.text || "", fragments)}</p>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderInstructionWorkModesMetaRow(page = {}) {
  const modes = Array.isArray(page?.instructionWorkModes) ? page.instructionWorkModes : [];
  if (!modes.length) {
    return "";
  }
  return `
    <div class="analizar-pdf-meta-row is-stack">
      <span>Modalidad de Trabajo (Icono)</span>
      <div class="analizar-pdf-page-body">
        ${modes.map((mode) => `
          <div class="analizar-pdf-page-body-item">
            <span class="analizar-pdf-text-status-badge">
              <span class="analizar-pdf-status-dot is-ok" aria-hidden="true"></span>
              <span>${escapeHtml(mode.kind)}</span>
            </span>
            <p>${escapeHtml(mode.text)}</p>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderFolioSignals(page = {}, session = null, options = {}) {
  const bodyLines = collectPageBodyLines(page, session);
  const outsideLines = filterLinesByStatuses(bodyLines, ["fuera de la página", "parcialmente fuera de la página"]);
  const overflowLines = filterLinesByStatuses(bodyLines, ["desbordado"]);
  const configuredAliasRows = options?.hideEmptyMappedStyles === true
    ? renderConfiguredAliasRowsWithValuesOnly(page, session)
    : renderConfiguredAliasRows(page, session);
  return `
    <div class="analizar-pdf-meta-list">
      ${renderFieldProfiles(page.fieldProfiles)}
      ${renderConfiguredSwatches(page.configuredSwatches)}
      ${configuredAliasRows}
      ${renderInstructionWorkModesMetaRow(page)}
      <span id="${getNotesAnchorId(page, session)}" class="analizar-pdf-anchor-target" aria-hidden="true"></span>
      ${renderChangeControlMetaList(page.notes, page.noteHistory)}
      ${renderRecortableMetaList(page)}
      ${renderProblematicTextMetaList("Textos fuera de pantalla", outsideLines, page, { ...options, session })}
      ${renderProblematicTextMetaList("Textos desbordados", overflowLines, page, { ...options, session })}
      ${renderSolutionMetaList(collectSolutionLines(page), page, { ...options, session })}
    </div>
  `;
}

export function buildPageAnchorScope(context = {}) {
  return [
    slugifyAnchorPart(context?.sessionId || context?.id || ""),
    slugifyAnchorPart(context?.revisionTitle || ""),
    slugifyAnchorPart(context?.fileTitle || context?.title || ""),
  ].filter(Boolean).join("-");
}

function getOrthotypographyAnchorId(page = {}, context = {}) {
  return `analizar-pdf-orthotypography-${buildPageAnchorScope(context)}-page-${slugifyAnchorPart(page.pageName || "x")}`;
}

function getRedactionAnchorId(page = {}, context = {}) {
  return `analizar-pdf-redaction-${buildPageAnchorScope(context)}-page-${slugifyAnchorPart(page.pageName || "x")}`;
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

function renderRailBadge(label = "", variant = "danger", icon = "", options = {}) {
  const tooltip = String(options?.tooltip || "").trim();
  const compactLabel = String(label || "")
    .replace(/\bRecortables\b/gi, "Rec.")
    .replace(/\bRecortable\b/gi, "Rec.")
    .replace(/\s+/g, " ")
    .trim();
  const safeLabel = escapeHtml(compactLabel);
  const safeVariant = escapeHtml(variant);
  const tooltipAttr = tooltip
    ? ` data-tooltip="${escapeHtmlAttr(tooltip)}" tabindex="0" aria-label="${escapeHtmlAttr(`${compactLabel}: ${tooltip}`)}"`
    : "";
  const iconHtml = icon ? `<span class="analizar-pdf-rail-badge-icon" aria-hidden="true">${escapeHtml(icon)}</span>` : "";
  return `<span class="analizar-pdf-rail-badge is-${safeVariant}"${tooltipAttr}>${iconHtml}<span>${safeLabel}</span></span>`;
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
        <div class="analizar-pdf-ortho-rail-resizer" data-action="resize-rail" role="separator" aria-orientation="vertical" aria-label="Redimensionar panel derecho"></div>
        <div class="analizar-pdf-ortho-rail-head">
          <h4>Accesos rápidos</h4>
          <div class="analizar-pdf-inline-actions">
            ${renderRailFilterControl(false)}
            ${renderRailExpandCollapseControls(false)}
            ${renderCorrectionModeToggle(correctionSelection)}
          </div>
        </div>
        <div class="analizar-pdf-ortho-rail-body">
          <p class="analizar-pdf-empty-state">Sin accesos directos disponibles.</p>
        </div>
      </aside>
      ${renderRailFilterModal()}
    `;
  }
  return `
    <aside class="analizar-pdf-ortho-rail">
      <div class="analizar-pdf-ortho-rail-resizer" data-action="resize-rail" role="separator" aria-orientation="vertical" aria-label="Redimensionar panel derecho"></div>
      <div class="analizar-pdf-ortho-rail-head">
        <h4>Accesos rápidos</h4>
        <div class="analizar-pdf-inline-actions">
          ${renderRailFilterControl(true)}
          ${renderRailExpandCollapseControls(true)}
          ${renderClearAnalysisButton(true)}
          ${renderCorrectionModeToggle(correctionSelection)}
        </div>
      </div>
      <div class="analizar-pdf-ortho-rail-body">${renderRailGroups(items, context, correctionSelection, "", resolveRailTintHex(context))}</div>
    </aside>
    ${renderRailFilterModal()}
  `;
}

function renderGroupedRightRail(fileEntries = []) {
  const entries = Array.isArray(fileEntries) ? fileEntries : [];
  if (!entries.length) {
    return renderRightRail([]);
  }
  const recortableMatchCodes = buildGlobalRecortableMatchCodes(entries);
  return `
    <aside class="analizar-pdf-ortho-rail">
      <div class="analizar-pdf-ortho-rail-resizer" data-action="resize-rail" role="separator" aria-orientation="vertical" aria-label="Redimensionar panel derecho"></div>
      <div class="analizar-pdf-ortho-rail-head">
        <h4>Accesos rápidos</h4>
        <div class="analizar-pdf-inline-actions">
          ${renderRailFilterControl(entries.length > 0)}
          ${renderRailExpandCollapseControls(entries.length > 0)}
          ${renderClearAnalysisButton(entries.length > 0)}
          ${renderCorrectionModeToggle(entries[0]?.correctionSelection || {})}
        </div>
      </div>
      <div class="analizar-pdf-ortho-rail-body">
        ${entries.map((entry) => {
          const railTitle = getRailDisplayTitle(entry);
          const railTooltip = getRailDisplayTooltip(entry);
          const fileGroupKey = [
            "file",
            String(entry?.revisionId || "").trim(),
            String(entry?.fileId || "").trim(),
            slugifyAnchorPart(railTitle),
          ].join("::");
          const railTintHex = resolveRailTintHex(entry);
          return `
          <details class="analizar-pdf-ortho-rail-group"${buildRailGroupAttrs(fileGroupKey)}${buildRailTintStyleAttr(railTintHex)}>
            <summary>
              <span
                class="analizar-pdf-rail-file-title"
                data-tooltip="${escapeHtmlAttr(railTooltip)}"
              ><span class="analizar-pdf-rail-file-title-text">${escapeHtml(railTitle)}</span></span>
              <span class="analizar-pdf-summary-toggle" aria-hidden="true"></span>
            </summary>
            <div class="analizar-pdf-ortho-file-group">
              ${Array.isArray(entry?.result?.stats?.pageReports) && entry.result.stats.pageReports.length
                ? renderRailGroups(entry.result.stats.pageReports, entry, entry?.correctionSelection || {}, fileGroupKey, railTintHex, recortableMatchCodes)
                : ""}
              ${renderQuickAnalysisRailGroup(entry.quickAnalysis, entry, fileGroupKey, railTintHex)}
            </div>
          </details>
        `;
        }).join("")}
      </div>
    </aside>
    ${renderRailFilterModal()}
  `;
}

function renderQuickAnalysisRailGroup(quickAnalysis = null, context = {}, groupKeyPrefix = "", railTintHex = "") {
  const pages = Array.isArray(quickAnalysis?.pages) ? quickAnalysis.pages.filter((page) => Array.isArray(page?.issues) && page.issues.length) : [];
  if (!quickAnalysis) return "";
  if (!isRailCategoryVisible("orthotypography")) return "";
  return `
    <details class="analizar-pdf-ortho-rail-group"${buildRailGroupAttrs(`${groupKeyPrefix}::quick-orthotypography`)}${buildRailCategoryAttrs("orthotypography")}${buildRailTintStyleAttr(railTintHex)}>
      <summary><span>Análisis rápido ortotipográfico</span><span class="analizar-pdf-summary-toggle" aria-hidden="true"></span></summary>
      ${pages.length ? `
        <nav class="analizar-pdf-ortho-nav" aria-label="Accesos rápidos del análisis rápido ortotipográfico">
          ${pages.map((page) => `
            <a class="analizar-pdf-ortho-link" href="#${getQuickOrthotypographyAnchorId(page, context)}">
              <span>Página ${escapeHtml(page.pageName || "?")}</span>
              ${renderRailBadge(String((Array.isArray(page?.issues) ? page.issues.length : 0) || 0), "danger")}
            </a>
          `).join("")}
        </nav>
      ` : `<p class="analizar-pdf-empty-state">Sin hallazgos rápidos.</p>`}
    </details>
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

function renderClearAnalysisButton(canClear = false) {
  if (!canClear) return "";
  return `
    <button
      type="button"
      class="analizar-pdf-icon-btn analizar-pdf-rail-selection-toggle"
      data-action="clear-rail-analysis"
      aria-label="Borrar análisis del panel"
      data-tooltip="Borrar análisis del panel"
    >
      <i class="fas fa-trash" aria-hidden="true"></i>
    </button>
  `;
}

function renderRailFilterControl(canFilter = false) {
  if (!canFilter) return "";
  return `
    <button
      type="button"
      class="analizar-pdf-icon-btn analizar-pdf-rail-selection-toggle"
      data-action="open-rail-filter-modal"
      aria-label="Filtrar grupos del rail"
      data-tooltip="Filtrar grupos"
    >
      <i class="fas fa-sliders" aria-hidden="true"></i>
    </button>
  `;
}

function renderRailExpandCollapseControls(canToggle = false) {
  if (!canToggle) return "";
  return `
    <button
      type="button"
      class="analizar-pdf-icon-btn analizar-pdf-rail-selection-toggle"
      data-action="toggle-rail-groups"
      aria-label="Expandir o contraer todos los accesos"
      data-tooltip="Expandir / contraer"
    >
      <i class="fas fa-up-right-and-down-left-from-center" aria-hidden="true"></i>
    </button>
    <button
      type="button"
      class="analizar-pdf-icon-btn analizar-pdf-rail-selection-toggle"
      data-action="toggle-rail-nonempty-groups"
      aria-label="Abrir solo accesos con cambios o errores"
      data-tooltip="Abrir solo con hallazgos"
    >
      <i class="fas fa-filter-circle-check" aria-hidden="true"></i>
    </button>
  `;
}

function readRailCategoryVisibility() {
  const defaults = Object.fromEntries(RAIL_CATEGORY_FILTERS.map((item) => [item.id, true]));
  if (typeof window === "undefined") return defaults;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RAIL_CATEGORY_VISIBILITY_STORAGE_KEY) || "{}");
    return {
      ...defaults,
      ...(parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}),
    };
  } catch (_) {
    return defaults;
  }
}

function persistRailCategoryVisibility(visibility = {}) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RAIL_CATEGORY_VISIBILITY_STORAGE_KEY, JSON.stringify(visibility || {}));
}

function renderRailFilterModal() {
  if (!railCategoryVisibility) {
    railCategoryVisibility = readRailCategoryVisibility();
  }
  return `
    <div class="analizar-pdf-rail-filter-modal" data-rail-filter-modal${railFilterModalOpen ? "" : " hidden"}>
      <button type="button" class="analizar-pdf-rail-filter-backdrop" data-action="close-rail-filter-modal" aria-label="Cerrar filtro del rail"></button>
      <section class="analizar-pdf-rail-filter-card" role="dialog" aria-modal="true" aria-labelledby="analizarPdfRailFilterTitle">
        <div class="analizar-pdf-rail-filter-head">
          <div>
            <h3 id="analizarPdfRailFilterTitle">Mostrar grupos</h3>
            <p>Activa solo los accesos que quieres ver en el rail.</p>
          </div>
          <button type="button" class="analizar-pdf-icon-btn" data-action="close-rail-filter-modal" aria-label="Cerrar filtro">
            <i class="fas fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
        <div class="analizar-pdf-rail-filter-list">
          ${RAIL_CATEGORY_FILTERS.map((item) => `
            <label class="analizar-pdf-rail-filter-option">
              <input
                type="checkbox"
                data-action="toggle-rail-category"
                data-rail-category-id="${escapeHtmlAttr(item.id)}"
                ${isRailCategoryVisible(item.id) ? "checked" : ""}
              >
              <span>${escapeHtml(item.label)}</span>
            </label>
          `).join("")}
        </div>
        <div class="analizar-pdf-rail-filter-actions">
          <button type="button" class="analizar-pdf-ghost-pill" data-action="show-all-rail-categories">Mostrar todo</button>
          <button type="button" class="analizar-pdf-ghost-pill is-primary" data-action="close-rail-filter-modal">Listo</button>
        </div>
      </section>
    </div>
  `;
}

function getRecortableRailTone(status = "", fallbackTone = "") {
  const cleanStatus = String(status || "").trim().toLowerCase();
  if (cleanStatus === "mismatch" || cleanStatus === "error") return "danger";
  if (cleanStatus === "pending" || cleanStatus === "warning") return "warning";
  if (cleanStatus === "match" || cleanStatus === "ok") return "ok";
  return fallbackTone || "";
}

function getRecortableRailIcon(tone = "") {
  if (tone === "danger") return "✕";
  if (tone === "warning") return "!";
  if (tone === "ok") return "✓";
  return "";
}

function isVideoRailItem(label = "", summary = {}, item = {}) {
  const cleanLabel = String(label || "").trim();
  const cleanKind = String(item?.kind || item?.type || "").trim().toLowerCase();
  if (cleanKind === "video") return true;
  if (/^videos?\b/i.test(cleanLabel)) return true;
  const visualKind = String(summary?.visualKind || "").trim().toLowerCase();
  if (visualKind.split(/\s*,\s*/).includes("video") && !/^(?:rec\.|recortables?|anexos?|fichas?)\b/i.test(cleanLabel)) {
    return true;
  }
  if (/^(?:rec\.|recortables?|anexos?|fichas?)\b/i.test(cleanLabel)) return false;
  if (extractRecortableCodeKeys(cleanLabel).length) return false;
  return /[a-záéíóúñ]{3,}/i.test(cleanLabel);
}

function resolveRailAssetKind(label = "", summary = {}, item = {}) {
  const cleanLabel = String(label || "").trim();
  const cleanKind = String(item?.kind || item?.type || "").trim().toLowerCase();
  if (["video", "anexo", "ficha", "recortable"].includes(cleanKind)) return cleanKind;
  if (/^videos?\b/i.test(cleanLabel) || isVideoRailItem(cleanLabel, summary, item)) return "video";
  if (/^anexos?\b/i.test(cleanLabel)) return "anexo";
  if (/^fichas?\b/i.test(cleanLabel)) return "ficha";
  if (/^(?:rec\.|recortables?)\b/i.test(cleanLabel)) return "recortable";
  return "";
}

function chooseRecortableRailTone(current = "", candidate = "") {
  const rank = { danger: 3, warning: 2, ok: 1, "": 0 };
  return (rank[candidate] || 0) > (rank[current] || 0) ? candidate : current;
}

function extractRecortableCodeKeys(value = "") {
  const source = String(value || "").trim();
  if (!source) return [];
  if (/^(?:anexos?|fichas?|videos?)\b/i.test(source)) {
    return [];
  }
  const keys = new Set();
  const explicit = source.match(/\brecortables?\s+([A-Za-z0-9]+)\b/i);
  if (explicit?.[1]) {
    keys.add(`recortable:${explicit[1].toLowerCase()}`);
  }
  for (const match of source.matchAll(/\b(?:\d+[A-Za-z]T\d+|[A-Za-z]\d+T\d+|[A-Za-z]{1,3}T\d+|\d+[A-Za-z])\b/gi)) {
    const code = String(match?.[0] || "").trim();
    if (code) keys.add(`recortable:${code.toLowerCase()}`);
  }
  return [...keys];
}

function buildGlobalRecortableMatchCodes(fileEntries = []) {
  const originCodes = new Set();
  const destinationCodes = new Set();
  const addCodes = (targetSet, values = []) => {
    for (const value of Array.isArray(values) ? values : []) {
      for (const key of extractRecortableCodeKeys(value)) {
        targetSet.add(key);
      }
    }
  };
  for (const entry of Array.isArray(fileEntries) ? fileEntries : []) {
    const pages = Array.isArray(entry?.result?.stats?.pageReports) ? entry.result.stats.pageReports : [];
    const isDestination = /^recortables?$/i.test(String(entry?.unidad || "").trim())
      && String(entry?.recortableRole || "").trim().toLowerCase() === "destination";
    for (const page of pages) {
      const summary = page?.recortableSummary || {};
      addCodes(originCodes, summary.originCodes);
      addCodes(destinationCodes, summary.destinationCodes);
      for (const item of Array.isArray(summary.resolvedDestinations) ? summary.resolvedDestinations : []) {
        addCodes(isDestination ? destinationCodes : originCodes, [item?.code]);
      }
      for (const item of Array.isArray(summary.resolvedLinks) ? summary.resolvedLinks : []) {
        const role = String(item?.role || "").trim().toLowerCase();
        if (role === "destination" || isDestination) {
          addCodes(destinationCodes, [item?.code]);
        } else {
          addCodes(originCodes, [item?.code]);
        }
      }
    }
  }
  return new Set([...originCodes].filter((key) => destinationCodes.has(key)));
}

function buildRecortableRailItems(page = {}, recortableMatchCodes = new Set()) {
  const summary = page?.recortableSummary || {};
  const codeTitles = summary?.codeTitles && typeof summary.codeTitles === "object" ? summary.codeTitles : {};
  const issues = Array.isArray(page?.recortableIssues) ? page.recortableIssues : [];
  const pageHasError = issues.some((item) => String(item?.severity || "").trim().toLowerCase() === "error");
  const pageHasPending = issues.some((item) => String(item?.severity || "").trim().toLowerCase() === "pending");
  const byLabel = new Map();
  const append = (label = "", status = "", fallbackTone = "", sourceItem = {}) => {
    const cleanLabel = String(label || "").trim();
    if (!cleanLabel) return;
    const key = cleanLabel.toLowerCase();
    const kind = resolveRailAssetKind(cleanLabel, summary, sourceItem);
    const hasGlobalCodeMatch = kind === "recortable" && extractRecortableCodeKeys(cleanLabel).some((codeKey) => recortableMatchCodes.has(codeKey));
    const tone = hasGlobalCodeMatch ? "ok" : getRecortableRailTone(status, fallbackTone);
    const tooltip = String(sourceItem?.title || codeTitles[cleanLabel] || "").trim();
    const previous = byLabel.get(key) || { label: cleanLabel, tone: "", tooltip: "", kind: "" };
    byLabel.set(key, {
      label: previous.label || cleanLabel,
      tone: chooseRecortableRailTone(previous.tone, tone),
      kind: previous.kind || kind,
      tooltip: previous.tooltip || (["video", "anexo", "ficha"].includes(kind) ? (tooltip || cleanLabel) : ""),
    });
  };
  for (const item of Array.isArray(summary.resolvedLinks) ? summary.resolvedLinks : []) {
    append(item?.code, item?.status, "", item);
  }
  for (const item of Array.isArray(summary.pendingDestinations) ? summary.pendingDestinations : []) {
    append(item?.code || "Recortable", "pending", "", item);
  }
  for (const item of Array.isArray(summary.resolvedDestinations) ? summary.resolvedDestinations : []) {
    append(item?.code, item?.status || "match", "", item);
  }
  for (const code of Array.isArray(summary.originCodes) ? summary.originCodes : []) {
    append(code, "", pageHasError ? "danger" : "warning", { title: codeTitles[String(code || "").trim()] || "" });
  }
  for (const code of Array.isArray(summary.destinationCodes) ? summary.destinationCodes : []) {
    append(code, "", pageHasError ? "danger" : "warning", { title: codeTitles[String(code || "").trim()] || "" });
  }
  if (!byLabel.size && issues.length) {
    append("Recortable", pageHasError ? "error" : pageHasPending ? "pending" : "warning");
  }
  return [...byLabel.values()].map((item) => ({
    ...item,
    page,
    icon: getRecortableRailIcon(item.tone),
  }));
}

function formatRailLinkedAssetLabel(item = {}) {
  const label = String(item?.label || "").trim();
  const kind = String(item?.kind || "").trim().toLowerCase();
  if (kind === "video") {
    return "Video";
  }
  if (kind === "anexo") {
    const match = label.match(/\banexos?\s+([A-Za-z0-9]+)\b/i);
    return match?.[1] ? `Anexo ${match[1]}` : "Anexo";
  }
  if (kind === "ficha") {
    const match = label.match(/\bfichas?\s+([A-Za-z0-9]+)\b/i);
    return match?.[1] ? `Ficha ${match[1]}` : "Ficha";
  }
  return label || "Recortable";
}

function renderRailGroups(items = [], context = {}, correctionSelection = {}, groupKeyPrefix = "", railTintHex = "", recortableMatchCodes = new Set()) {
  const recortableDestinationOnly = isRecortableDestinationContext(context);
  const groupTintAttr = buildRailTintStyleAttr(railTintHex);
  const pagesWithOrthoIssues = (Array.isArray(items) ? items : []).filter((page) => Array.isArray(page?.orthotypographyIssues) && page.orthotypographyIssues.length);
  const pagesWithSpellingIssues = (Array.isArray(items) ? items : []).filter((page) => Array.isArray(page?.spellingIssues) && page.spellingIssues.length);
  const pagesWithRedactionIssues = (Array.isArray(items) ? items : []).filter((page) => Array.isArray(page?.redactionIssues) && page.redactionIssues.length);
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
      (Array.isArray(summary.pendingDestinations) && summary.pendingDestinations.length) ||
      (Array.isArray(summary.resolvedDestinations) && summary.resolvedDestinations.length)
    );
  });
  const recortableRailItems = pagesWithRecortables.flatMap((page) => buildRecortableRailItems(page, recortableMatchCodes));
  const renderRecortablesGroup = (label = "Recortables / Fichas / Anexos / Videos", emptyLabel = "Sin referencias detectadas.") => `
    <details class="analizar-pdf-ortho-rail-group"${buildRailGroupAttrs(`${groupKeyPrefix}::recortables`)}${buildRailCategoryAttrs("recortables")}${groupTintAttr}>
      <summary><span>${label}</span><span class="analizar-pdf-summary-toggle" aria-hidden="true"></span></summary>
      ${pagesWithRecortables.length ? `
        <nav class="analizar-pdf-ortho-nav" aria-label="Accesos rápidos de recortables, fichas, anexos y videos">
          ${recortableRailItems.map((item) => {
            const page = item.page || {};
            const labelText = formatRailLinkedAssetLabel(item);
            return `
              <a class="analizar-pdf-ortho-link" href="#${getRecortableAnchorId(page, context)}">
                <span>Página ${escapeHtml(page.pageName || "?")}</span>
                ${item.tone
                  ? renderRailBadge(labelText, item.tone, item.icon, { tooltip: item.tooltip || "" })
                  : `<strong>${escapeHtml(labelText)}</strong>`}
              </a>
            `;
          }).join("")}
        </nav>
      ` : `<p class="analizar-pdf-empty-state">${emptyLabel}</p>`}
    </details>
  `;
  if (recortableDestinationOnly) {
    return `
      ${isRailCategoryVisible("recortables") ? renderRecortablesGroup("Recortables / coincidencia origen-destino", "Sin coincidencias registradas.") : ""}
      ${isRailCategoryVisible("orthotypography") ? `<details class="analizar-pdf-ortho-rail-group"${buildRailGroupAttrs(`${groupKeyPrefix}::orthotypography`)}${buildRailCategoryAttrs("orthotypography")}${groupTintAttr}>
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
      </details>` : ""}
      ${isRailCategoryVisible("redaction") && pagesWithRedactionIssues.length ? `<details class="analizar-pdf-ortho-rail-group"${buildRailGroupAttrs(`${groupKeyPrefix}::redaction`)}${buildRailCategoryAttrs("redaction")}${groupTintAttr}>
        <summary><span>Propuestas de redacción</span><span class="analizar-pdf-summary-toggle" aria-hidden="true"></span></summary>
        <nav class="analizar-pdf-ortho-nav" aria-label="Accesos rápidos de propuestas de redacción">
          ${pagesWithRedactionIssues.map((page) => `
            <a class="analizar-pdf-ortho-link" href="#${getRedactionAnchorId(page, context)}">
              <span>Página ${escapeHtml(page.pageName || "?")}</span>
              ${renderRailBadge(String(page.redactionIssues.length), "suggestion")}
            </a>
          `).join("")}
        </nav>
      </details>` : ""}
      <details class="analizar-pdf-ortho-rail-group"${buildRailGroupAttrs(`${groupKeyPrefix}::spelling`)}${groupTintAttr}>
        <summary><span>Ortografía</span><span class="analizar-pdf-summary-toggle" aria-hidden="true"></span></summary>
        ${pagesWithSpellingIssues.length ? `
          <nav class="analizar-pdf-ortho-nav" aria-label="Accesos rápidos de ortografía">
            ${pagesWithSpellingIssues.map((page) => `
              <a class="analizar-pdf-ortho-link" href="#${getSpellingAnchorId(page, context)}">
                <span>Página ${escapeHtml(page.pageName || "?")}</span>
                ${renderRailBadge(String(page.spellingIssues.length), "danger")}
              </a>
            `).join("")}
          </nav>
        ` : `<p class="analizar-pdf-empty-state">Sin hallazgos ortográficos.</p>`}
      </details>
    `;
  }
  return `
    ${isRailCategoryVisible("orthotypography") ? `<details class="analizar-pdf-ortho-rail-group"${buildRailGroupAttrs(`${groupKeyPrefix}::orthotypography`)}${buildRailCategoryAttrs("orthotypography")}${groupTintAttr}>
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
    </details>` : ""}
    ${isRailCategoryVisible("redaction") && pagesWithRedactionIssues.length ? `<details class="analizar-pdf-ortho-rail-group"${buildRailGroupAttrs(`${groupKeyPrefix}::redaction`)}${buildRailCategoryAttrs("redaction")}${groupTintAttr}>
      <summary><span>Propuestas de redacción</span><span class="analizar-pdf-summary-toggle" aria-hidden="true"></span></summary>
      <nav class="analizar-pdf-ortho-nav" aria-label="Accesos rápidos de propuestas de redacción">
        ${pagesWithRedactionIssues.map((page) => `
          <a class="analizar-pdf-ortho-link" href="#${getRedactionAnchorId(page, context)}">
            <span>Página ${escapeHtml(page.pageName || "?")}</span>
            ${renderRailBadge(String(page.redactionIssues.length), "suggestion")}
          </a>
        `).join("")}
      </nav>
    </details>` : ""}
    ${isRailCategoryVisible("text-status") ? `<details class="analizar-pdf-ortho-rail-group"${buildRailGroupAttrs(`${groupKeyPrefix}::text-status`)}${buildRailCategoryAttrs("text-status")}${groupTintAttr}>
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
    </details>` : ""}
    ${isRailCategoryVisible("field-profile") ? `<details class="analizar-pdf-ortho-rail-group"${buildRailGroupAttrs(`${groupKeyPrefix}::field-profile`)}${buildRailCategoryAttrs("field-profile")}${groupTintAttr}>
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
    </details>` : ""}
    ${isRailCategoryVisible("notes") ? `<details class="analizar-pdf-ortho-rail-group"${buildRailGroupAttrs(`${groupKeyPrefix}::notes`)}${buildRailCategoryAttrs("notes")}${groupTintAttr}>
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
    </details>` : ""}
    ${isRailCategoryVisible("recortables") ? renderRecortablesGroup() : ""}
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

function renderRedactionSuggestionList(page = {}) {
  const issues = Array.isArray(page?.redactionIssues) ? page.redactionIssues : [];
  if (!issues.length) return "";
  return `
    <ul class="analizar-pdf-redaction-list">
      ${issues.map((issue) => {
        const styleName = String(issue?.styleName || "").trim();
        const excerpt = String(issue?.excerpt || issue?.context || "").trim();
        const reason = String(issue?.reason || issue?.message || "La redacción puede resultar poco clara.").trim();
        const suggestion = String(issue?.suggestion || "").trim();
        return `
          <li class="analizar-pdf-redaction-item">
            ${styleName ? `<p class="analizar-pdf-redaction-style">Estilo: ${escapeHtml(styleName)}</p>` : ""}
            ${excerpt ? `<p><strong>Fragmento:</strong> <span class="analizar-pdf-redaction-excerpt">${escapeHtml(excerpt)}</span></p>` : ""}
            <p><strong>Motivo:</strong> ${escapeHtml(reason)}</p>
            ${suggestion ? `<p><strong>Propuesta:</strong> <span class="analizar-pdf-redaction-suggestion">${escapeHtml(suggestion)}</span></p>` : ""}
          </li>
        `;
      }).join("")}
    </ul>
  `;
}

function getSpellingAnchorId(page = {}, context = {}) {
  return `analizar-pdf-spelling-${buildPageAnchorScope(context)}-page-${slugifyAnchorPart(page.pageName || "x")}`;
}

function renderRecortableDestinationPageReportItems(items = [], session = null) {
  if (!Array.isArray(items) || !items.length) {
    return `<p class="analizar-pdf-empty-state">No hay reporte de recortable destino disponible.</p>`;
  }
  return items.map((page) => `
    <article class="analizar-pdf-page-report analizar-pdf-page-report--recortable-destination">
      <header class="analizar-pdf-page-report-head">
        <div class="analizar-pdf-page-report-head-copy">
          <h4>Página ${escapeHtml(page.pageName || "?")}</h4>
          ${renderPageApprovalBadge(page)}
        </div>
        <span>Recortable destino</span>
      </header>
      <span id="${getRecortableAnchorId(page, session)}" class="analizar-pdf-anchor-target" aria-hidden="true"></span>
      <div class="analizar-pdf-meta-list">
        ${renderRecortableMetaList(page, { title: "Coincidencia por código origen-destino" }) || `<p class="analizar-pdf-empty-state">Sin coincidencia origen-destino registrada en esta página.</p>`}
      </div>
      <section id="${getOrthotypographyAnchorId(page, session)}">
        <h5>Ortotipografía</h5>
        ${renderSelectableIssueList("orthotypography", page, session?.correctionSelection || {})}
      </section>
      ${Array.isArray(page?.redactionIssues) && page.redactionIssues.length ? `
        <section id="${getRedactionAnchorId(page, session)}">
          <h5>Propuestas de redacción</h5>
          ${renderRedactionSuggestionList(page)}
        </section>
      ` : ""}
      <section id="${getSpellingAnchorId(page, session)}">
        <h5>Ortografía</h5>
        ${renderSelectableIssueList("spelling", page, session?.correctionSelection || {})}
      </section>
    </article>
  `).join("");
}

function renderPageReportItems(items = [], session = null, options = {}) {
  if (!Array.isArray(items) || !items.length) {
    return `<p class="analizar-pdf-empty-state">No hay reporte por página disponible.</p>`;
  }
  if (isRecortableDestinationContext(session)) {
    return renderRecortableDestinationPageReportItems(items, session);
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
      <span id="${getPaginationAnchorId(page, session)}" class="analizar-pdf-anchor-target" aria-hidden="true"></span>
      <section id="${getTextStatusAnchorId(page, session)}">
        ${renderFolioSignals(page, session, options)}
      </section>
      <span id="${getRecortableAnchorId(page, session)}" class="analizar-pdf-anchor-target" aria-hidden="true"></span>
      <section id="${getOrthotypographyAnchorId(page, session)}">
        <h5>Ortotipografía</h5>
        ${renderSelectableIssueList("orthotypography", page, session?.correctionSelection || {})}
      </section>
      ${Array.isArray(page?.redactionIssues) && page.redactionIssues.length ? `
        <section id="${getRedactionAnchorId(page, session)}">
          <h5>Propuestas de redacción</h5>
          ${renderRedactionSuggestionList(page)}
        </section>
      ` : ""}
      <section>
        <h5>Ortografía</h5>
        ${renderSelectableIssueList("spelling", page, session?.correctionSelection || {})}
      </section>
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

function renderQuickAnalysisIssue(issue = {}) {
  const paragraphText = String(issue?.paragraphText || issue?.context || issue?.excerpt || "").trim();
  const excerpt = String(issue?.excerpt || "").trim();
  return `
    <li class="analizar-pdf-selectable-issue-item analizar-pdf-quick-issue-item">
      <div>
        <strong>${escapeHtml(issue?.styleName || "Estilo no detectado")}</strong>
        <p>${escapeHtml(issue?.message || "Hallazgo ortotipográfico.")}</p>
        <div class="analizar-pdf-quick-paragraph">${renderHighlightedText(paragraphText, excerpt ? [excerpt] : [])}</div>
      </div>
    </li>
  `;
}

function renderQuickAnalysisReports(fileEntry = {}, index = 0) {
  const quickAnalysis = fileEntry?.quickAnalysis || null;
  if (!quickAnalysis) return "";
  const pages = Array.isArray(quickAnalysis?.pages) ? quickAnalysis.pages.filter((page) => Array.isArray(page?.issues) && page.issues.length) : [];
  return `
    <details class="analizar-pdf-file-report-block analizar-pdf-file-report-block--quick" ${index === 0 ? "open" : ""}>
      <summary class="analizar-pdf-file-report-summary">
        <div class="analizar-pdf-file-report-summary-copy">
          <strong>Análisis rápido ortotipográfico</strong>
          <span>${escapeHtml(fileEntry.fileTitle || `Archivo ${index + 1}`)}</span>
          ${fileEntry.revisionTitle ? `<small>${escapeHtml(fileEntry.revisionTitle)}</small>` : ""}
        </div>
        <span class="analizar-pdf-summary-toggle" aria-hidden="true"></span>
      </summary>
      <div class="analizar-pdf-file-report-body">
        ${pages.length ? pages.map((page) => `
          <article class="analizar-pdf-page-report analizar-pdf-page-report--quick">
            <header class="analizar-pdf-page-report-head">
              <div class="analizar-pdf-page-report-head-copy">
                <h4>Página ${escapeHtml(page.pageName || "?")}</h4>
                <span class="analizar-pdf-inline-badge is-warning">${escapeHtml(String((Array.isArray(page?.issues) ? page.issues.length : 0) || 0))} hallazgo(s)</span>
              </div>
              <span>Solo ortotipografía</span>
            </header>
            <span id="${getQuickOrthotypographyAnchorId(page, fileEntry)}" class="analizar-pdf-anchor-target" aria-hidden="true"></span>
            <ul class="analizar-pdf-selectable-issue-list">
              ${(Array.isArray(page?.issues) ? page.issues : []).map((issue) => renderQuickAnalysisIssue(issue)).join("")}
            </ul>
          </article>
        `).join("") : `<p class="analizar-pdf-empty-state">Sin páginas con errores ortotipográficos rápidos.</p>`}
      </div>
    </details>
  `;
}

export function createAnalizarPdfResultsRenderer(deps = {}) {
  const { el, pageReportsEl, onToggleCorrectionMode, onToggleCorrectionPage, onToggleCorrectionIssue, onClearRailAnalysis, isRailCleared } = deps;
  let auxiliaryPanelsHidden = true;
  let outsideTextHidden = false;
  let activeRailResizeCleanup = null;
  let activeRailMuuriLayouts = [];
  let activeRailLayoutFrame = 0;
  let activeRailLayoutObserver = null;

  function getMuuriConstructor() {
    if (typeof window === "undefined") return null;
    return typeof window.Muuri === "function" ? window.Muuri : null;
  }

  function destroyRailMasonryLayouts() {
    if (activeRailLayoutFrame && typeof window !== "undefined") {
      window.cancelAnimationFrame(activeRailLayoutFrame);
    }
    activeRailLayoutFrame = 0;
    if (activeRailLayoutObserver) {
      activeRailLayoutObserver.disconnect();
      activeRailLayoutObserver = null;
    }
    activeRailMuuriLayouts.forEach((grid) => {
      try {
        grid.destroy();
      } catch (_) {
        // Muuri puede haber destruido nodos durante un render rápido.
      }
    });
    activeRailMuuriLayouts = [];
  }

  function refreshRailMasonryLayouts() {
    activeRailLayoutFrame = 0;
    activeRailMuuriLayouts.forEach((grid) => {
      try {
        grid.refreshItems().layout();
      } catch (_) {
        // Evita que un relayout tardío bloquee el render de resultados.
      }
    });
  }

  function scheduleRailMasonryLayout() {
    if (!activeRailMuuriLayouts.length || typeof window === "undefined") return;
    if (activeRailLayoutFrame) return;
    activeRailLayoutFrame = window.requestAnimationFrame(refreshRailMasonryLayouts);
  }

  function initRailMasonryLayouts() {
    destroyRailMasonryLayouts();
    if (!pageReportsEl || typeof window === "undefined") return;
    const Muuri = getMuuriConstructor();
    if (!Muuri) return;
    const nestedContainers = Array.from(pageReportsEl.querySelectorAll(".analizar-pdf-ortho-file-group"));
    const rootContainers = Array.from(pageReportsEl.querySelectorAll(".analizar-pdf-ortho-rail-body"));
    const containers = [...nestedContainers, ...rootContainers]
      .filter((container) => container.querySelector(":scope > .analizar-pdf-ortho-rail-group"));
    if (!containers.length) return;
    containers.forEach((container) => {
      container.classList.add("is-muuri-rail-grid");
      const grid = new Muuri(container, {
        items: ".analizar-pdf-ortho-rail-group",
        layout: {
          fillGaps: true,
          horizontal: false,
          alignRight: false,
          alignBottom: false,
          rounding: true,
        },
        layoutDuration: 220,
        layoutEasing: "cubic-bezier(.22,.61,.36,1)",
        layoutOnInit: true,
        layoutOnResize: 80,
        dragEnabled: false,
      });
      activeRailMuuriLayouts.push(grid);
    });
    if (typeof ResizeObserver === "function") {
      activeRailLayoutObserver = new ResizeObserver(() => scheduleRailMasonryLayout());
      const rail = pageReportsEl.querySelector(".analizar-pdf-ortho-rail");
      if (rail) activeRailLayoutObserver.observe(rail);
      containers.forEach((container) => activeRailLayoutObserver.observe(container));
    }
    scheduleRailMasonryLayout();
  }

  function canResizeRail() {
    return typeof window !== "undefined" && window.matchMedia("(min-width: 1100px)").matches;
  }

  function getRailLayoutEl() {
    return pageReportsEl?.closest(".analizar-pdf-layout") || document.querySelector(".analizar-pdf-layout") || document.documentElement;
  }

  function resolveRailWidthBounds() {
    if (typeof window === "undefined") {
      return { min: MIN_RAIL_WIDTH, max: MAX_RAIL_WIDTH };
    }
    const min = MIN_RAIL_WIDTH;
    const max = Math.max(min, Math.min(MAX_RAIL_WIDTH, Math.round(window.innerWidth * 0.55)));
    return { min, max };
  }

  function clampRailWidth(width) {
    const numeric = Number(width);
    const { min, max } = resolveRailWidthBounds();
    if (!Number.isFinite(numeric)) return Math.max(min, Math.min(DEFAULT_RAIL_WIDTH, max));
    return Math.max(min, Math.min(Math.round(numeric), max));
  }

  function applyRailWidth(width, { persist = true } = {}) {
    if (typeof document === "undefined") return;
    const nextWidth = clampRailWidth(width);
    getRailLayoutEl().style.setProperty("--ap-rail-width", `${nextWidth}px`);
    if (persist && typeof window !== "undefined") {
      window.localStorage.setItem(RAIL_WIDTH_STORAGE_KEY, String(nextWidth));
    }
  }

  function restoreRailWidth() {
    if (typeof window === "undefined") return;
    const stored = Number(window.localStorage.getItem(RAIL_WIDTH_STORAGE_KEY) || DEFAULT_RAIL_WIDTH);
    applyRailWidth(stored, { persist: false });
  }

  function bindRailResizeHandle() {
    if (activeRailResizeCleanup) {
      activeRailResizeCleanup();
      activeRailResizeCleanup = null;
    }
    if (!pageReportsEl || typeof window === "undefined") return;
    restoreRailWidth();
    const handle = pageReportsEl.querySelector("[data-action='resize-rail']");
    if (!handle) return;
    const onPointerDown = (event) => {
      if (!canResizeRail()) return;
      event.preventDefault();
      const pointerId = event.pointerId;
      const startX = Number(event.clientX || 0);
      const layoutEl = getRailLayoutEl();
      const startWidth = clampRailWidth(
        parseFloat(getComputedStyle(layoutEl).getPropertyValue("--ap-rail-width")) || DEFAULT_RAIL_WIDTH
      );
      handle.classList.add("is-dragging");
      document.body.classList.add("analizar-pdf-rail-resizing");
      if (typeof handle.setPointerCapture === "function") {
        try {
          handle.setPointerCapture(pointerId);
        } catch (_) {
          // noop
        }
      }
      const onPointerMove = (moveEvent) => {
        const deltaX = startX - Number(moveEvent.clientX || 0);
        applyRailWidth(startWidth + deltaX);
        scheduleRailMasonryLayout();
      };
      const finish = () => {
        handle.classList.remove("is-dragging");
        document.body.classList.remove("analizar-pdf-rail-resizing");
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        scheduleRailMasonryLayout();
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    };
    handle.onpointerdown = onPointerDown;
    activeRailResizeCleanup = () => {
      handle.onpointerdown = null;
    };
  }

  function bindEvents() {
    const toggle = el?.querySelector("[data-action='toggle-auxiliary-panels']");
    if (toggle) {
      toggle.addEventListener("click", () => {
        auxiliaryPanelsHidden = !auxiliaryPanelsHidden;
        const session = el.__analizarPdfSession || null;
        render(session);
      });
    }
    if (pageReportsEl) {
      bindRailResizeHandle();
      pageReportsEl.querySelectorAll("details[data-rail-group-key]").forEach((details) => {
        details.ontoggle = () => {
          const groupKey = String(details.dataset.railGroupKey || "").trim();
          if (groupKey) {
            railOpenStateByKey.set(groupKey, details.open === true);
          }
          scheduleRailMasonryLayout();
        };
      });
      pageReportsEl.onclick = (event) => {
        const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
        const action = String(target?.dataset?.action || "").trim();
        if (!action) return;
        if (action === "toggle-hide-outside-text") {
          outsideTextHidden = !outsideTextHidden;
          const session = pageReportsEl.__analizarPdfSession || el?.__analizarPdfSession || null;
          render(session);
          return;
        }
        if (action === "toggle-correction-mode") {
          if (typeof onToggleCorrectionMode === "function") {
            onToggleCorrectionMode();
          }
          return;
        }
        if (action === "clear-rail-analysis") {
          if (typeof onClearRailAnalysis === "function") {
            onClearRailAnalysis();
          }
          return;
        }
        if (action === "open-rail-filter-modal") {
          railFilterModalOpen = true;
          const session = pageReportsEl.__analizarPdfSession || el?.__analizarPdfSession || null;
          render(session);
          return;
        }
        if (action === "close-rail-filter-modal") {
          railFilterModalOpen = false;
          const modal = pageReportsEl.querySelector("[data-rail-filter-modal]");
          if (modal) modal.hidden = true;
          return;
        }
        if (action === "show-all-rail-categories") {
          railCategoryVisibility = Object.fromEntries(RAIL_CATEGORY_FILTERS.map((item) => [item.id, true]));
          persistRailCategoryVisibility(railCategoryVisibility);
          railFilterModalOpen = true;
          const session = pageReportsEl.__analizarPdfSession || el?.__analizarPdfSession || null;
          render(session);
          return;
        }
        if (action === "toggle-rail-groups") {
          const groups = Array.from(pageReportsEl.querySelectorAll(".analizar-pdf-ortho-rail details[data-rail-group-key]"));
          const shouldOpen = groups.some((details) => details.open !== true);
          groups.forEach((details) => {
            const groupKey = String(details.dataset.railGroupKey || "").trim();
            details.open = shouldOpen;
            if (groupKey) {
              railOpenStateByKey.set(groupKey, shouldOpen);
            }
          });
          scheduleRailMasonryLayout();
        }
        if (action === "toggle-rail-nonempty-groups") {
          const groups = Array.from(pageReportsEl.querySelectorAll(".analizar-pdf-ortho-rail details[data-rail-group-key]"));
          groups.forEach((details) => {
            const groupKey = String(details.dataset.railGroupKey || "").trim();
            const hasLinks = Boolean(details.querySelector(".analizar-pdf-ortho-nav .analizar-pdf-ortho-link"));
            details.open = hasLinks;
            if (groupKey) {
              railOpenStateByKey.set(groupKey, hasLinks);
            }
          });
          scheduleRailMasonryLayout();
        }
      };
      pageReportsEl.onchange = (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const action = String(target?.dataset?.action || "").trim();
        if (!action) return;
        if (action === "toggle-correction-page") {
          if (typeof onToggleCorrectionPage === "function") {
            onToggleCorrectionPage(target?.dataset?.pageName || "");
          }
          return;
        }
        if (action === "toggle-correction-issue") {
          if (typeof onToggleCorrectionIssue === "function") {
            onToggleCorrectionIssue({
              kind: target?.dataset?.issueKind || "",
              pageName: target?.dataset?.pageName || "",
              issueId: target?.dataset?.issueId || "",
            });
          }
          return;
        }
        if (action === "toggle-rail-category") {
          const categoryId = String(target?.dataset?.railCategoryId || "").trim();
          if (!categoryId) return;
          railCategoryVisibility = {
            ...readRailCategoryVisibility(),
            [categoryId]: target.checked === true,
          };
          persistRailCategoryVisibility(railCategoryVisibility);
          railFilterModalOpen = true;
          const session = pageReportsEl.__analizarPdfSession || el?.__analizarPdfSession || null;
          render(session);
        }
      };
    }
  }

  function render(session = null) {
    destroyRailMasonryLayouts();
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
    const railCleared = typeof isRailCleared === "function" ? isRailCleared(session) : false;
    const fallbackSessionEntries = hasRenderableAnalysis(session) ? [session] : [];
    const fileEntries = railCleared
      ? []
      : (Array.isArray(session.fileResults) && session.fileResults.length ? session.fileResults : fallbackSessionEntries);
    const railEntries = railCleared
      ? []
      : buildOrderedRailEntries(session, fileEntries.filter((entry) => hasRenderableAnalysis(entry)));
    const reportEntries = railCleared ? [] : railEntries.filter((entry) => Array.isArray(entry?.result?.stats?.pageReports) && entry.result.stats.pageReports.length);
    const quickReportEntries = railCleared
      ? []
      : fileEntries.filter((entry) => entry?.quickAnalysis && Array.isArray(entry?.quickAnalysis?.pages));
    const hasAnyPageReport = reportEntries.length || quickReportEntries.length;
    if (el) {
      el.innerHTML = "";
    }
    if (pageReportsEl) {
      pageReportsEl.innerHTML = `
        <div class="analizar-pdf-page-report-shell">
          <div class="analizar-pdf-page-report-list">
            ${reportEntries.length
              ? reportEntries.map((entry, index) => renderFilePageReports(entry, index, { hideOutsideText: outsideTextHidden })).join("")
              : ""}
            ${quickReportEntries.length
              ? quickReportEntries.map((entry, index) => renderQuickAnalysisReports(entry, index)).join("")
              : ""}
            ${!hasAnyPageReport ? `<div class="analizar-pdf-result-card"><p class="analizar-pdf-empty-state">Todavía no hay reporte por página.</p></div>` : ""}
          </div>
          ${fileEntries.length ? renderGroupedRightRail(fileEntries) : renderRightRail([])}
        </div>
      `;
    }
    bindEvents();
    initRailMasonryLayouts();
  }

  return { render };
}
