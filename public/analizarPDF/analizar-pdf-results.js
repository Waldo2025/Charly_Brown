import { getRecortableAnchorId, renderRecortableMetaList } from "./analizar-pdf-recortables.js?v=2026-1.0.10.466";
import { hasRenderableAnalysis } from "./analizar-pdf-session-logic.js?v=2026-1.0.10.466";

const railOpenStateByKey = new Map();
const RAIL_WIDTH_STORAGE_KEY = "analizar-pdf-rail-width-v2";
const RAIL_CATEGORY_VISIBILITY_STORAGE_KEY = "analizar-pdf-rail-category-visibility";
const DEFAULT_RAIL_WIDTH = 200;
const MIN_RAIL_WIDTH = 200;
const MAX_RAIL_WIDTH = 640;
const RAIL_CATEGORY_FILTERS = [
  { id: "spelling", label: "Ortografía", defaultVisible: false },
  { id: "orthotypography", label: "Ortotipografía" },
  { id: "quick-orthotypography", label: "Análisis rápido ortotipográfico" },
  { id: "redaction", label: "Propuestas de redacción", defaultVisible: false },
  { id: "text-status", label: "Texto fuera o desbordado", defaultVisible: false },
  { id: "field-profile", label: "Campo formativo", defaultVisible: false },
  { id: "notes", label: "Notas" },
  { id: "tracked-changes", label: "Control de cambios" },
  { id: "custom-rules", label: "Condiciones personalizadas" },
  { id: "recortables", label: "Recortables / Fichas / Anexos / Videos" },
];
const RAIL_CATEGORY_FILTER_IDS = new Set(RAIL_CATEGORY_FILTERS.map((item) => item.id));
let railCategoryVisibility = null;
let railFilterModalOpen = false;
let activeRailWorkflowFormat = "en_forma";
let previousRailWorkflowFormat = "";
const LIBRE_RAIL_CATEGORY_DEFAULTS = {
  spelling: true,
  orthotypography: true,
  "quick-orthotypography": false,
  redaction: true,
  "text-status": false,
  "field-profile": false,
  notes: true,
  "tracked-changes": true,
  "custom-rules": true,
  recortables: false,
};

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
  // Los grupos que no forman parte del selector permanecen siempre visibles.
  if (!RAIL_CATEGORY_FILTER_IDS.has(cleanCategoryId)) return true;
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
  const isValidHex = (value = "") => /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || "").trim());
  if (String(entry?.workflowFormat || "").trim().toLowerCase() === "libre") {
    const dominantHex = String(entry?.result?.stats?.dominantPageSwatch?.hex || "").trim();
    if (isValidHex(dominantHex)) return dominantHex;
  }
  const cachedHex = String(entry?.railTintHex || "").trim();
  if (isValidHex(cachedHex)) return cachedHex;
  const targetSwatchName = resolveUnitRailSwatchName(entry?.unidad || entry?.revisionTitle || "");
  const swatches = Array.isArray(entry?.result?.stats?.swatchInventory) ? entry.result.stats.swatchInventory : [];
  const isNeutralSwatch = (swatch = {}) => /^(?:BLACK|PAPER|NONE|REGISTRATION|\[BLACK\]|\[PAPER\]|\[NONE\]|\[REGISTRATION\])$/i
    .test(String(swatch?.name || swatch?.swatchName || "").trim());
  const normalizedTarget = normalizeRailSwatchName(targetSwatchName);
  const getSwatchName = (swatch = {}) => String(swatch?.name || swatch?.swatchName || "").trim();
  const exact = targetSwatchName
    ? swatches.find((swatch) => normalizeRailSwatchName(getSwatchName(swatch)) === normalizedTarget) || null
    : null;
  const loose = exact || (targetSwatchName
    ? swatches.find((swatch) => normalizeRailSwatchName(getSwatchName(swatch)).includes(normalizedTarget)) || null
    : null);
  const extracted = loose
    || swatches.find((swatch) => isValidHex(swatch?.hex) && !isNeutralSwatch(swatch))
    || swatches.find((swatch) => isValidHex(swatch?.hex))
    || null;
  const hex = String(extracted?.hex || "").trim();
  return isValidHex(hex) ? hex : "";
}

function resolveRailTintInk(hex = "") {
  let value = String(hex || "").trim().replace(/^#/, "");
  if (value.length === 3) value = value.split("").map((character) => character.repeat(2)).join("");
  if (!/^[0-9a-f]{6}$/i.test(value)) return "#182034";
  const [red, green, blue] = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  const perceivedBrightness = Math.sqrt(
    (.299 * red * red) + (.587 * green * green) + (.114 * blue * blue)
  ) / 255;
  return perceivedBrightness < .64 ? "#ffffff" : "#111827";
}

function resolveRailTextRelief(ink = "") {
  return String(ink || "").trim().toLowerCase() === "#ffffff"
    ? "0 1px 1px rgba(0,0,0,.34),0 0 1px rgba(255,255,255,.12)"
    : "0 1px 1px rgba(255,255,255,.34),0 0 1px rgba(0,0,0,.16)";
}

function buildRailTintStyleAttr(hex = "") {
  const cleanHex = String(hex || "").trim();
  if (!cleanHex) return "";
  const ink = resolveRailTintInk(cleanHex);
  return ` style="--analizar-pdf-rail-tint:${escapeHtmlAttr(cleanHex)};--analizar-pdf-rail-ink:${ink};--analizar-pdf-rail-text-relief:${resolveRailTextRelief(ink)};"`;
}

function getRailDisplayTitle(entry = {}) {
  return String(entry?.railTitle || entry?.revisionTitle || entry?.fileTitle || entry?.title || "Ficha editorial").trim() || "Ficha editorial";
}

function getRailDisplayTooltip(entry = {}) {
  const title = getRailDisplayTitle(entry);
  const fileName = String(entry?.railTooltip || entry?.fileTitle || "").trim();
  return fileName && fileName !== title ? `${title} · ${fileName}` : title;
}

function isProcessedRailEntry(entry = {}) {
  const status = String(entry?.analysisStatus || "").trim().toLowerCase();
  if (["uploading", "queued", "processing", "delivering"].includes(status)) {
    return false;
  }
  return hasRenderableAnalysis(entry) || Boolean(entry?.quickAnalysis);
}

function parseSortableTime(value = "") {
  const timestamp = Date.parse(String(value || "").trim());
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatPlaceholderTrimester(value = "") {
  const cleanValue = String(value || "").trim();
  const match = cleanValue.match(/(\d+)/);
  return match ? `Trim ${match[1]}` : cleanValue;
}

function buildPlaceholderRailTitle(session = null, revision = null) {
  const info = session?.bibliographicInfo || {};
  return [info.grado, formatPlaceholderTrimester(info.trimestre), revision?.unidad || info.unidad]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" · ") || String(revision?.title || "Ficha editorial").trim() || "Ficha editorial";
}

function buildEmptyRailEntry(session = null, revision = null, file = null, revisionIndex = 0, fileIndex = 0) {
  const revisionTitle = session?.workflowFormat === "libre"
    ? `Archivo ${revisionIndex + 1}`
    : (String(revision?.title || revision?.unidad || "Ficha editorial").trim() || "Ficha editorial");
  const fileTitle = String(file?.documentName || file?.name || "").trim();
  return {
    revisionId: String(revision?.id || "").trim(),
    fileId: String(file?.id || "").trim(),
    revisionIndex,
    fileIndex,
    revisionTitle,
    railTitle: session?.workflowFormat === "libre" ? revisionTitle : buildPlaceholderRailTitle(session, revision),
    railTooltip: fileTitle || revisionTitle,
    fileTitle,
    unidad: String(revision?.unidad || "").trim(),
    recortableRole: String(revision?.recortableRole || "").trim(),
    analysisStatus: String(file?.analysisStatus || "idle").trim(),
    workflowFormat: String(session?.workflowFormat || "en_forma").trim(),
    railTintHex: String(file?.railTintHex || "").trim(),
    isRailPlaceholder: true,
  };
}

function buildOrderedRailEntries(session = null, entries = []) {
  const revisions = Array.isArray(session?.revisions) ? session.revisions : [];
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
  for (const [revisionIndex, revision] of revisions.entries()) {
    const revisionId = String(revision?.id || "").trim();
    if (!revisionId) continue;
    const matches = entriesByRevisionId.get(revisionId) || [];
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
    const consumedMatches = new Set();
    const files = Array.isArray(revision?.files) ? revision.files : [];
    const revisionFiles = files.length ? files : [null];
    for (const [fileIndex, file] of revisionFiles.entries()) {
      const fileId = String(file?.id || "").trim();
      const matchIndex = orderedMatches.findIndex((entry, index) => {
        if (consumedMatches.has(index)) return false;
        const entryFileId = String(entry?.fileId || "").trim();
        return fileId ? entryFileId === fileId : !entryFileId;
      });
      if (matchIndex < 0) {
        ordered.push(buildEmptyRailEntry(session, revision, file, revisionIndex, fileIndex));
        continue;
      }
      consumedMatches.add(matchIndex);
      const match = orderedMatches[matchIndex];
      ordered.push({
        ...match,
        revisionTitle: String(revision?.title || match?.revisionTitle || "Revisión").trim(),
        unidad: String(revision?.unidad || match?.unidad || "").trim(),
        recortableRole: String(revision?.recortableRole || match?.recortableRole || "").trim(),
        isRailPlaceholder: false,
      });
    }
    orderedMatches.forEach((match, index) => {
      if (consumedMatches.has(index)) return;
      ordered.push({
        ...match,
        revisionTitle: String(revision?.title || match?.revisionTitle || "Revisión").trim(),
        unidad: String(revision?.unidad || match?.unidad || "").trim(),
        recortableRole: String(revision?.recortableRole || match?.recortableRole || "").trim(),
        isRailPlaceholder: false,
      });
    });
  }
  return [...ordered, ...anonymousEntries];
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

function renderNotesMetaList(activeItems = [], historyItems = []) {
  const hasActive = Array.isArray(activeItems) && activeItems.length;
  const hasHistory = Array.isArray(historyItems) && historyItems.length;
  if (!hasActive && !hasHistory) {
    return "";
  }
  const renderNote = (item = {}, label = "Nota") => {
    const text = String(item?.text || "").trim() || "Sin contenido textual";
    const author = String(item?.userName || "").trim();
    const created = String(item?.creationDate || "").trim();
    const modified = String(item?.modificationDate || "").trim();
    const meta = [author, created && `Creada: ${created}`, modified && modified !== created ? `Modificada: ${modified}` : ""]
      .filter(Boolean)
      .join(" · ");
    const paragraph = String(item?.paragraphText || "").trim();
    return `<div class="analizar-pdf-change-entry"><p><strong>${escapeHtml(label)}</strong>${meta ? ` · ${escapeHtml(meta)}` : ""}</p><p>${escapeHtml(text)}</p>${paragraph ? `<p><small>Contexto: ${escapeHtml(paragraph)}</small></p>` : ""}</div>`;
  };
  return `
    <div class="analizar-pdf-meta-row is-stack">
      <span>Notas</span>
      <div class="analizar-pdf-page-body">
        ${hasActive ? `<p><strong>Notas activas</strong></p>` : ""}
        ${activeItems.map((item) => renderNote(item, "Nota")).join("")}
        ${hasHistory ? `<p><strong>Historial de notas</strong></p>` : ""}
        ${historyItems.map((item) => renderNote(item, "Nota en cambio rastreado")).join("")}
      </div>
    </div>
  `;
}

function renderTrackedChangesMetaList(trackedItems = []) {
  const hasTracked = Array.isArray(trackedItems) && trackedItems.length;
  if (!hasTracked) return "";
  return `
    <div class="analizar-pdf-meta-row is-stack">
      <span>Control de cambios</span>
      <div class="analizar-pdf-page-body">
        <p><strong>Cambios rastreados</strong></p>
        ${trackedItems.map((item) => {
          const labels = { InsertedText: "Texto insertado", DeletedText: "Texto eliminado", MovedText: "Texto movido" };
          const changeType = String(item?.changeType || "").trim();
          const label = labels[changeType] || changeType || "Cambio";
          const text = String(item?.text || "").trim() || "Sin contenido textual";
          const meta = [item?.userName, item?.date].map((value) => String(value || "").trim()).filter(Boolean).join(" · ");
          return `<div class="analizar-pdf-change-entry"><p><strong>${escapeHtml(label)}</strong>${meta ? ` · ${escapeHtml(meta)}` : ""}</p><p>${escapeHtml(text)}</p></div>`;
        }).join("")}
      </div>
    </div>
  `;
}

function renderChangeControlMetaList(activeItems = [], historyItems = [], trackedItems = []) {
  return `${renderNotesMetaList(activeItems, historyItems)}${renderTrackedChangesMetaList(trackedItems)}`;
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
      <span id="${getTrackedChangesAnchorId(page, session)}" class="analizar-pdf-anchor-target" aria-hidden="true"></span>
      ${renderChangeControlMetaList(page.notes, page.noteHistory, page.trackedChanges)}
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
  return `analizar-pdf-notes-${buildPageAnchorScope(context)}-page-${slugifyAnchorPart(page.pageName || "x")}`;
}

function getTrackedChangesAnchorId(page = {}, context = {}) {
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
  const trackedChangeCount = Array.isArray(page?.trackedChanges) ? page.trackedChanges.length : 0;
  const textStatusTotal = getProblematicTextStatusSummary(page).total || 0;
  return (orthotypographyCount + spellingCount + recortableCount + noteCount + noteHistoryCount + trackedChangeCount + textStatusTotal) > 0;
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
      <aside class="analizar-pdf-ortho-rail" aria-label="Accesos rápidos">
        <div class="analizar-pdf-ortho-rail-resizer" data-action="resize-rail" role="separator" aria-orientation="vertical" aria-label="Redimensionar panel derecho"></div>
        <div class="analizar-pdf-ortho-rail-head">
          <div class="analizar-pdf-inline-actions">
            ${renderRailFilterControl(false)}
            ${renderRailExpandCollapseControls(false)}
            ${renderCorrectionModeToggle(correctionSelection)}
          </div>
        </div>
        <div class="analizar-pdf-ortho-rail-title">Análisis realizado</div>
        <div class="analizar-pdf-ortho-rail-body">
          <p class="analizar-pdf-empty-state">Sin accesos directos disponibles.</p>
        </div>
      </aside>
      ${renderRailFilterModal()}
    `;
  }
  return `
    <aside class="analizar-pdf-ortho-rail" aria-label="Accesos rápidos">
      <div class="analizar-pdf-ortho-rail-resizer" data-action="resize-rail" role="separator" aria-orientation="vertical" aria-label="Redimensionar panel derecho"></div>
      <div class="analizar-pdf-ortho-rail-head">
        <div class="analizar-pdf-inline-actions">
          ${renderRailFilterControl(true)}
          ${renderRailExpandCollapseControls(true)}
          ${renderClearAnalysisButton(true)}
          ${renderCorrectionModeToggle(correctionSelection)}
        </div>
      </div>
      <div class="analizar-pdf-ortho-rail-title">Análisis realizado</div>
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
  const completedEntries = entries.filter((entry) => entry?.isRailPlaceholder !== true);
  const correctionEntry = completedEntries[0] || null;
  return `
    <aside class="analizar-pdf-ortho-rail" aria-label="Accesos rápidos">
      <div class="analizar-pdf-ortho-rail-resizer" data-action="resize-rail" role="separator" aria-orientation="vertical" aria-label="Redimensionar panel derecho"></div>
      <div class="analizar-pdf-ortho-rail-head">
        <div class="analizar-pdf-inline-actions">
          ${renderRailFilterControl(entries.length > 0)}
          ${renderRailExpandCollapseControls(entries.length > 0)}
          ${renderClearAnalysisButton(completedEntries.length > 0)}
          ${renderCorrectionModeToggle(correctionEntry?.correctionSelection || {})}
        </div>
      </div>
      <div class="analizar-pdf-ortho-rail-title">Análisis realizado</div>
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
          <details
            class="analizar-pdf-ortho-rail-group is-complete ${entry?.isRailPlaceholder === true ? "is-empty" : "has-analysis"}"
            data-revision-id="${escapeHtmlAttr(String(entry?.revisionId || "").trim())}"
            data-file-id="${escapeHtmlAttr(String(entry?.fileId || "").trim())}"
            data-rail-state="${entry?.isRailPlaceholder === true ? "empty" : "complete"}"
            ${buildRailGroupAttrs(fileGroupKey)}${buildRailTintStyleAttr(railTintHex)}
          >
            <summary>
              <span
                class="analizar-pdf-rail-file-title"
                data-tooltip="${escapeHtmlAttr(railTooltip)}"
              ><span class="analizar-pdf-rail-file-title-text">${escapeHtml(railTitle)}</span></span>
              <span class="analizar-pdf-summary-toggle" aria-hidden="true"></span>
            </summary>
            <div class="analizar-pdf-ortho-file-group">
              ${entry?.isRailPlaceholder !== true && Array.isArray(entry?.result?.stats?.pageReports) && entry.result.stats.pageReports.length
                ? renderRailGroups(entry.result.stats.pageReports, entry, entry?.correctionSelection || {}, fileGroupKey, railTintHex, recortableMatchCodes)
                : ""}
              ${entry?.isRailPlaceholder === true ? "" : renderQuickAnalysisRailGroup(entry.quickAnalysis, entry, fileGroupKey, railTintHex)}
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
  if (!isRailCategoryVisible("quick-orthotypography")) return "";
  return `
    <details class="analizar-pdf-ortho-rail-group is-complete"${buildRailGroupAttrs(`${groupKeyPrefix}::quick-orthotypography`)}${buildRailCategoryAttrs("quick-orthotypography")}${buildRailTintStyleAttr(railTintHex)}>
      <summary><span>Análisis rápido ortotipográfico</span><span class="analizar-pdf-summary-toggle" aria-hidden="true"></span></summary>
      ${pages.length ? `
        <nav class="analizar-pdf-ortho-nav" aria-label="Accesos rápidos del análisis rápido ortotipográfico">
          ${pages.map((page) => `
            <a class="analizar-pdf-ortho-link" href="#${getQuickOrthotypographyAnchorId(page, context)}" data-action="show-page-fragments" data-page-name="${escapeHtmlAttr(page.pageName || "")}" data-file-id="${escapeHtmlAttr(context.fileId || "")}">
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
      <i class="fas fa-eye" aria-hidden="true"></i>
    </button>
  `;
}

function readRailCategoryVisibility() {
  const isLibre = activeRailWorkflowFormat === "libre";
  const defaults = isLibre
    ? { ...LIBRE_RAIL_CATEGORY_DEFAULTS }
    : Object.fromEntries(RAIL_CATEGORY_FILTERS.map((item) => [item.id, item.defaultVisible !== false]));
  if (typeof window === "undefined") return defaults;
  try {
    const storageKey = `${RAIL_CATEGORY_VISIBILITY_STORAGE_KEY}-${isLibre ? "libre" : "en-forma"}`;
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
    const stored = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    return Object.fromEntries(RAIL_CATEGORY_FILTERS.map((item) => [
      item.id,
      Object.prototype.hasOwnProperty.call(stored, item.id)
        ? stored[item.id] !== false
        : defaults[item.id] !== false,
    ]));
  } catch (_) {
    return defaults;
  }
}

// El mismo estado gobierna tanto la visibilidad del rail como el trabajo que
// debe ejecutar el siguiente análisis. Se devuelve una copia para impedir que
// otros módulos muten accidentalmente el estado del renderer.
export function getAnalizarPdfAnalysisCategories() {
  const visibility = { ...readRailCategoryVisibility() };
  if (activeRailWorkflowFormat === "libre") visibility.recortables = false;
  return visibility;
}

function persistRailCategoryVisibility(visibility = {}) {
  if (typeof window === "undefined") return;
  const storageKey = `${RAIL_CATEGORY_VISIBILITY_STORAGE_KEY}-${activeRailWorkflowFormat === "libre" ? "libre" : "en-forma"}`;
  window.localStorage.setItem(storageKey, JSON.stringify(visibility || {}));
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
            <p>Activa los grupos que quieres analizar y mostrar. Los desactivados se omitirán en el siguiente análisis.</p>
          </div>
          <button type="button" class="analizar-pdf-icon-btn" data-action="close-rail-filter-modal" aria-label="Cerrar filtro">
            <i class="fas fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
        <div class="analizar-pdf-rail-filter-list">
          ${RAIL_CATEGORY_FILTERS.filter((item) => activeRailWorkflowFormat !== "libre" || item.id !== "recortables").map((item) => `
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
  const isLibreWorkflow = activeRailWorkflowFormat === "libre" || String(context?.workflowFormat || "").trim().toLowerCase() === "libre";
  const recortableDestinationOnly = !isLibreWorkflow && isRecortableDestinationContext(context);
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
  const pagesWithTrackedChanges = (Array.isArray(items) ? items : [])
    .filter((page) => Array.isArray(page?.trackedChanges) && page.trackedChanges.length);
  const pagesWithCustomRules = (Array.isArray(items) ? items : [])
    .filter((page) => Array.isArray(page?.customRuleIssues) && page.customRuleIssues.length);
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
    <details class="analizar-pdf-ortho-rail-group is-complete"${buildRailGroupAttrs(`${groupKeyPrefix}::recortables`)}${buildRailCategoryAttrs("recortables")}${groupTintAttr}>
      <summary><span>${label}</span><span class="analizar-pdf-summary-toggle" aria-hidden="true"></span></summary>
      ${pagesWithRecortables.length ? `
        <nav class="analizar-pdf-ortho-nav" aria-label="Accesos rápidos de recortables, fichas, anexos y videos">
          ${recortableRailItems.map((item) => {
            const page = item.page || {};
            const labelText = formatRailLinkedAssetLabel(item);
            return `
              <a class="analizar-pdf-ortho-link" href="#${getRecortableAnchorId(page, context)}" data-action="show-page-fragments" data-page-name="${escapeHtmlAttr(page.pageName || "")}" data-file-id="${escapeHtmlAttr(context.fileId || "")}">
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
  const renderNotesGroup = () => `<details class="analizar-pdf-ortho-rail-group is-complete"${buildRailGroupAttrs(`${groupKeyPrefix}::notes`)}${buildRailCategoryAttrs("notes")}${groupTintAttr}>
    <summary><span>Notas</span><span class="analizar-pdf-summary-toggle" aria-hidden="true"></span></summary>
    ${pagesWithNotes.length ? `
      <nav class="analizar-pdf-ortho-nav" aria-label="Accesos rápidos de notas">
        ${pagesWithNotes.map((page) => `
          <a class="analizar-pdf-ortho-link" href="#${getNotesAnchorId(page, context)}" data-action="show-page-fragments" data-page-name="${escapeHtmlAttr(page.pageName || "")}" data-file-id="${escapeHtmlAttr(context.fileId || "")}">
            <span>Página ${escapeHtml(page.pageName || "?")}</span>
            ${renderRailBadge(String((Array.isArray(page?.notes) ? page.notes.length : 0) + (Array.isArray(page?.noteHistory) ? page.noteHistory.length : 0)), "warning")}
          </a>
        `).join("")}
      </nav>
    ` : `<p class="analizar-pdf-empty-state">Sin notas detectadas.</p>`}
  </details>`;
  const renderTrackedChangesGroup = () => `<details class="analizar-pdf-ortho-rail-group is-complete"${buildRailGroupAttrs(`${groupKeyPrefix}::tracked-changes`)}${buildRailCategoryAttrs("tracked-changes")}${groupTintAttr}>
    <summary><span>Control de cambios</span><span class="analizar-pdf-summary-toggle" aria-hidden="true"></span></summary>
    ${pagesWithTrackedChanges.length ? `
      <nav class="analizar-pdf-ortho-nav" aria-label="Accesos rápidos de control de cambios">
        ${pagesWithTrackedChanges.map((page) => `
          <a class="analizar-pdf-ortho-link" href="#${getTrackedChangesAnchorId(page, context)}" data-action="show-page-fragments" data-page-name="${escapeHtmlAttr(page.pageName || "")}" data-file-id="${escapeHtmlAttr(context.fileId || "")}">
            <span>Página ${escapeHtml(page.pageName || "?")}</span>
            ${renderRailBadge(String(page.trackedChanges.length), "warning")}
          </a>
        `).join("")}
      </nav>
    ` : `<p class="analizar-pdf-empty-state">Sin cambios rastreados detectados.</p>`}
  </details>`;
  const renderCustomRulesGroup = () => `<details class="analizar-pdf-ortho-rail-group is-complete"${buildRailGroupAttrs(`${groupKeyPrefix}::custom-rules`)}${buildRailCategoryAttrs("custom-rules")}${groupTintAttr}>
    <summary><span>Condiciones personalizadas</span><span class="analizar-pdf-summary-toggle" aria-hidden="true"></span></summary>
    ${pagesWithCustomRules.length ? `<nav class="analizar-pdf-ortho-nav" aria-label="Accesos rápidos de condiciones personalizadas">
      ${pagesWithCustomRules.map((page) => `<a class="analizar-pdf-ortho-link" href="#" data-action="show-page-fragments" data-detail-kind="custom-rules" data-page-name="${escapeHtmlAttr(page.pageName || "")}" data-file-id="${escapeHtmlAttr(context.fileId || "")}"><span>Página ${escapeHtml(page.pageName || "?")}</span>${renderRailBadge(String(page.customRuleIssues.length), "warning")}</a>`).join("")}
    </nav>` : `<p class="analizar-pdf-empty-state">Sin hallazgos de condiciones personalizadas.</p>`}
  </details>`;
  if (recortableDestinationOnly) {
    return `
      ${isRailCategoryVisible("recortables") ? renderRecortablesGroup("Recortables / coincidencia origen-destino", "Sin coincidencias registradas.") : ""}
      ${isRailCategoryVisible("orthotypography") ? `<details class="analizar-pdf-ortho-rail-group is-complete"${buildRailGroupAttrs(`${groupKeyPrefix}::orthotypography`)}${buildRailCategoryAttrs("orthotypography")}${groupTintAttr}>
        <summary><span>Ortotipografía</span><span class="analizar-pdf-summary-toggle" aria-hidden="true"></span></summary>
        ${pagesWithOrthoIssues.length ? `
          <nav class="analizar-pdf-ortho-nav" aria-label="Accesos rápidos de ortotipografía">
            ${pagesWithOrthoIssues.map((page) => `
              <a class="analizar-pdf-ortho-link" href="#${getOrthotypographyAnchorId(page, context)}" data-action="show-page-fragments" data-page-name="${escapeHtmlAttr(page.pageName || "")}" data-file-id="${escapeHtmlAttr(context.fileId || "")}">
                <span>Página ${escapeHtml(page.pageName || "?")}</span>
                ${renderRailBadge(String(page.orthotypographyIssues.length), "danger")}
              </a>
            `).join("")}
          </nav>
        ` : `<p class="analizar-pdf-empty-state">Sin hallazgos ortotipográficos.</p>`}
      </details>` : ""}
      ${isRailCategoryVisible("redaction") ? `<details class="analizar-pdf-ortho-rail-group is-complete"${buildRailGroupAttrs(`${groupKeyPrefix}::redaction`)}${buildRailCategoryAttrs("redaction")}${groupTintAttr}>
        <summary><span>Propuestas de redacción</span><span class="analizar-pdf-summary-toggle" aria-hidden="true"></span></summary>
        ${pagesWithRedactionIssues.length ? `<nav class="analizar-pdf-ortho-nav" aria-label="Accesos rápidos de propuestas de redacción">
          ${pagesWithRedactionIssues.map((page) => `
            <a class="analizar-pdf-ortho-link" href="#${getRedactionAnchorId(page, context)}" data-action="show-page-fragments" data-page-name="${escapeHtmlAttr(page.pageName || "")}" data-file-id="${escapeHtmlAttr(context.fileId || "")}">
              <span>Página ${escapeHtml(page.pageName || "?")}</span>
              ${renderRailBadge(String(page.redactionIssues.length), "suggestion")}
            </a>
          `).join("")}
        </nav>` : `<p class="analizar-pdf-empty-state">Sin propuestas de redacción.</p>`}
      </details>` : ""}
      ${isRailCategoryVisible("notes") ? renderNotesGroup() : ""}
      ${isRailCategoryVisible("tracked-changes") ? renderTrackedChangesGroup() : ""}
      ${isRailCategoryVisible("custom-rules") ? renderCustomRulesGroup() : ""}
      ${isRailCategoryVisible("spelling") ? `<details class="analizar-pdf-ortho-rail-group is-complete"${buildRailGroupAttrs(`${groupKeyPrefix}::spelling`)}${buildRailCategoryAttrs("spelling")}${groupTintAttr}>
        <summary><span>Ortografía</span><span class="analizar-pdf-summary-toggle" aria-hidden="true"></span></summary>
        ${pagesWithSpellingIssues.length ? `
          <nav class="analizar-pdf-ortho-nav" aria-label="Accesos rápidos de ortografía">
            ${pagesWithSpellingIssues.map((page) => `
              <a class="analizar-pdf-ortho-link" href="#${getSpellingAnchorId(page, context)}" data-action="show-page-fragments" data-page-name="${escapeHtmlAttr(page.pageName || "")}" data-file-id="${escapeHtmlAttr(context.fileId || "")}">
                <span>Página ${escapeHtml(page.pageName || "?")}</span>
                ${renderRailBadge(String(page.spellingIssues.length), "danger")}
              </a>
            `).join("")}
          </nav>
        ` : `<p class="analizar-pdf-empty-state">Sin hallazgos ortográficos.</p>`}
      </details>` : ""}
    `;
  }
  return `
    ${isRailCategoryVisible("orthotypography") ? `<details class="analizar-pdf-ortho-rail-group is-complete"${buildRailGroupAttrs(`${groupKeyPrefix}::orthotypography`)}${buildRailCategoryAttrs("orthotypography")}${groupTintAttr}>
      <summary><span>Ortotipografía</span><span class="analizar-pdf-summary-toggle" aria-hidden="true"></span></summary>
      ${pagesWithOrthoIssues.length ? `
        <nav class="analizar-pdf-ortho-nav" aria-label="Accesos rápidos de ortotipografía">
          ${pagesWithOrthoIssues.map((page) => `
            <a class="analizar-pdf-ortho-link" href="#${getOrthotypographyAnchorId(page, context)}" data-action="show-page-fragments" data-page-name="${escapeHtmlAttr(page.pageName || "")}" data-file-id="${escapeHtmlAttr(context.fileId || "")}">
              <span>Página ${escapeHtml(page.pageName || "?")}</span>
              ${renderRailBadge(String(page.orthotypographyIssues.length), "danger")}
            </a>
          `).join("")}
        </nav>
      ` : `<p class="analizar-pdf-empty-state">Sin hallazgos ortotipográficos.</p>`}
    </details>` : ""}
    ${isRailCategoryVisible("spelling") ? `<details class="analizar-pdf-ortho-rail-group is-complete"${buildRailGroupAttrs(`${groupKeyPrefix}::spelling`)}${buildRailCategoryAttrs("spelling")}${groupTintAttr}>
      <summary><span>Ortografía</span><span class="analizar-pdf-summary-toggle" aria-hidden="true"></span></summary>
      ${pagesWithSpellingIssues.length ? `
        <nav class="analizar-pdf-ortho-nav" aria-label="Accesos rápidos de ortografía">
          ${pagesWithSpellingIssues.map((page) => `
            <a class="analizar-pdf-ortho-link" href="#${getSpellingAnchorId(page, context)}" data-action="show-page-fragments" data-page-name="${escapeHtmlAttr(page.pageName || "")}" data-file-id="${escapeHtmlAttr(context.fileId || "")}">
              <span>Página ${escapeHtml(page.pageName || "?")}</span>
              ${renderRailBadge(String(page.spellingIssues.length), "danger")}
            </a>
          `).join("")}
        </nav>
      ` : `<p class="analizar-pdf-empty-state">Sin hallazgos ortográficos.</p>`}
    </details>` : ""}
    ${isRailCategoryVisible("redaction") ? `<details class="analizar-pdf-ortho-rail-group is-complete"${buildRailGroupAttrs(`${groupKeyPrefix}::redaction`)}${buildRailCategoryAttrs("redaction")}${groupTintAttr}>
      <summary><span>Propuestas de redacción</span><span class="analizar-pdf-summary-toggle" aria-hidden="true"></span></summary>
      ${pagesWithRedactionIssues.length ? `<nav class="analizar-pdf-ortho-nav" aria-label="Accesos rápidos de propuestas de redacción">
        ${pagesWithRedactionIssues.map((page) => `
          <a class="analizar-pdf-ortho-link" href="#${getRedactionAnchorId(page, context)}" data-action="show-page-fragments" data-page-name="${escapeHtmlAttr(page.pageName || "")}" data-file-id="${escapeHtmlAttr(context.fileId || "")}">
            <span>Página ${escapeHtml(page.pageName || "?")}</span>
            ${renderRailBadge(String(page.redactionIssues.length), "suggestion")}
          </a>
        `).join("")}
      </nav>` : `<p class="analizar-pdf-empty-state">Sin propuestas de redacción.</p>`}
    </details>` : ""}
    ${isRailCategoryVisible("text-status") ? `<details class="analizar-pdf-ortho-rail-group is-complete"${buildRailGroupAttrs(`${groupKeyPrefix}::text-status`)}${buildRailCategoryAttrs("text-status")}${groupTintAttr}>
      <summary><span>Texto fuera / parcial / desbordado</span><span class="analizar-pdf-summary-toggle" aria-hidden="true"></span></summary>
      ${pagesWithTextStatusIssues.length ? `
        <nav class="analizar-pdf-ortho-nav" aria-label="Accesos rápidos de texto fuera, parcial o desbordado">
          ${pagesWithTextStatusIssues.map(({ page, summary }) => `
            <a class="analizar-pdf-ortho-link" href="#${getTextStatusAnchorId(page, context)}" data-action="show-page-fragments" data-page-name="${escapeHtmlAttr(page.pageName || "")}" data-file-id="${escapeHtmlAttr(context.fileId || "")}">
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
    ${isRailCategoryVisible("field-profile") ? `<details class="analizar-pdf-ortho-rail-group is-complete"${buildRailGroupAttrs(`${groupKeyPrefix}::field-profile`)}${buildRailCategoryAttrs("field-profile")}${groupTintAttr}>
      <summary><span>Campo formativo</span><span class="analizar-pdf-summary-toggle" aria-hidden="true"></span></summary>
      ${pagesWithFieldProfile.length ? `
        <nav class="analizar-pdf-ortho-nav" aria-label="Accesos rápidos de campo formativo">
          ${pagesWithFieldProfile.map((page) => {
            const label = String(page?.fieldProfiles?.[0]?.label || "Campo formativo").trim();
            return `
              <a class="analizar-pdf-ortho-link" href="#${getFieldProfileAnchorId(page, context)}" data-action="show-page-fragments" data-page-name="${escapeHtmlAttr(page.pageName || "")}" data-file-id="${escapeHtmlAttr(context.fileId || "")}">
                <span>Página ${escapeHtml(page.pageName || "?")}</span>
                <strong>${escapeHtml(label)}</strong>
              </a>
            `;
          }).join("")}
        </nav>
      ` : `<p class="analizar-pdf-empty-state">Sin campo formativo detectado.</p>`}
    </details>` : ""}
    ${isRailCategoryVisible("notes") ? renderNotesGroup() : ""}
    ${isRailCategoryVisible("tracked-changes") ? renderTrackedChangesGroup() : ""}
    ${isRailCategoryVisible("custom-rules") ? renderCustomRulesGroup() : ""}
    ${!isLibreWorkflow && isRailCategoryVisible("recortables") ? renderRecortablesGroup() : ""}
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
        const layerName = String(issue?.layerName || "").trim();
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
            <span>${escapeHtml(message)}${layerName ? ` <small class="analizar-pdf-inline-badge">Capa: ${escapeHtml(layerName)}</small>` : ""}</span>
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
  const layerName = String(issue?.layerName || "").trim();
  return `
    <li class="analizar-pdf-selectable-issue-item analizar-pdf-quick-issue-item">
      <div>
        <strong>${escapeHtml(issue?.styleName || "Estilo no detectado")}</strong>
        ${layerName ? `<span class="analizar-pdf-inline-badge">Capa: ${escapeHtml(layerName)}</span>` : ""}
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

function groupItemsByLayer(items = []) {
  const groups = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const layerName = String(item?.layerName || item?.value?.layerName || "").trim() || "Sin capa";
    const group = groups.get(layerName) || [];
    group.push(item);
    groups.set(layerName, group);
  }
  return [...groups.entries()];
}

function renderLayerTabs(items = [], baseId = "layer-tabs", renderGroup = () => "") {
  const groups = groupItemsByLayer(items);
  if (!groups.length) return "";
  const tabsId = `${baseId}-tabs`;
  return `
    <div class="analizar-pdf-layer-tabs" data-layer-tabs="${escapeHtmlAttr(tabsId)}">
      <div class="analizar-pdf-layer-tablist" role="tablist" aria-label="Capas de la página">
        ${groups.map(([layerName, layerItems], index) => {
          const tabId = `${tabsId}-tab-${index}`;
          const panelId = `${tabsId}-panel-${index}`;
          return `<button id="${escapeHtmlAttr(tabId)}" type="button" class="analizar-pdf-layer-tab${index === 0 ? " is-active" : ""}"
            role="tab" aria-selected="${index === 0 ? "true" : "false"}" aria-controls="${escapeHtmlAttr(panelId)}"
            tabindex="${index === 0 ? "0" : "-1"}" data-action="select-layer-tab">
            <span>${escapeHtml(layerName)}</span><small>${layerItems.length}</small>
          </button>`;
        }).join("")}
      </div>
      <div class="analizar-pdf-layer-tabpanels">
        ${groups.map(([layerName, layerItems], index) => {
          const tabId = `${tabsId}-tab-${index}`;
          const panelId = `${tabsId}-panel-${index}`;
          return `<section id="${escapeHtmlAttr(panelId)}" class="analizar-pdf-layer-tabpanel" role="tabpanel"
            aria-labelledby="${escapeHtmlAttr(tabId)}" ${index === 0 ? "" : "hidden"}>
            ${renderGroup(layerItems, layerName, index)}
          </section>`;
        }).join("")}
      </div>
    </div>`;
}

function renderSelectedFragments(selection = null, fileEntries = []) {
  if (!selection?.pageName) {
    return `<div class="analizar-pdf-result-card"><p class="analizar-pdf-empty-state">Selecciona una página en Accesos rápidos para ver los fragmentos con error.</p></div>`;
  }
  const entry = fileEntries.find((item) => String(item?.fileId || "") === String(selection.fileId || "")) || null;
  const page = Array.isArray(entry?.result?.stats?.pageReports)
    ? entry.result.stats.pageReports.find((item) => String(item?.pageName || "") === String(selection.pageName || ""))
    : null;
  const quickPage = Array.isArray(entry?.quickAnalysis?.pages)
    ? entry.quickAnalysis.pages.find((item) => String(item?.pageName || "") === String(selection.pageName || ""))
    : null;
  const pageText = String(page?.pageText || Object.values(page?.content || {})
    .flatMap((items) => Array.isArray(items) ? items : [])
    .map((item) => String(item?.text || "").trim())
    .filter(Boolean)
    .join("\n")).trim();
  const detailKind = String(selection?.detailKind || "orthotypography").trim().toLowerCase();
  const pageCardId = `analizar-pdf-page-text-${slugifyAnchorPart(selection.fileId || "file")}-${slugifyAnchorPart(selection.pageName || "page")}-${slugifyAnchorPart(detailKind)}`;
  const renderFullPageText = () => `
    <button type="button" class="analizar-pdf-page-text-toggle" data-action="toggle-full-page-text" aria-expanded="false" aria-controls="${escapeHtmlAttr(pageCardId)}">Ver texto completo de la página</button>
    <article id="${escapeHtmlAttr(pageCardId)}" class="analizar-pdf-full-page-text-card" hidden><h6>Texto completo · Página ${escapeHtml(selection.pageName)}</h6><p>${escapeHtml(pageText || "No hay texto de página disponible.")}</p></article>
  `;
  const renderCardHeader = (title = "") => `
    <div class="analizar-pdf-fragment-card-head">
      <div class="analizar-pdf-fragment-card-head-copy">
        <span>${escapeHtml(title)}</span>
        <small title="${escapeHtmlAttr(entry?.fileTitle || entry?.documentName || "")}">${escapeHtml(entry?.fileTitle || entry?.documentName || "")}</small>
      </div>
      <button type="button" class="analizar-pdf-fragment-card-close" data-action="close-quick-detail" aria-label="Cerrar detalle" title="Cerrar">&times;</button>
    </div>`;
  if (detailKind === "notes") {
    const noteItems = [
      ...(Array.isArray(page?.notes) ? page.notes.map((value) => ({ value, layerName: value?.layerName, source: "active" })) : []),
      ...(Array.isArray(page?.noteHistory) ? page.noteHistory.map((value) => ({ value, layerName: value?.layerName, source: "history" })) : []),
    ];
    const notesContent = renderLayerTabs(noteItems, `${pageCardId}-notes`, (layerItems) => renderNotesMetaList(
      layerItems.filter((item) => item.source === "active").map((item) => item.value),
      layerItems.filter((item) => item.source === "history").map((item) => item.value)
    ));
    return `
      <div class="analizar-pdf-fragment-card analizar-pdf-fragment-card--change-control">
        ${renderCardHeader(`Notas · Página ${selection.pageName}`)}
        ${notesContent || `<p class="analizar-pdf-empty-state">Esta página no tiene notas disponibles.</p>`}
        ${renderFullPageText()}
      </div>`;
  }
  if (detailKind === "tracked-changes") {
    const trackedChangesContent = renderLayerTabs(page?.trackedChanges, `${pageCardId}-tracked-changes`, (layerItems) => renderTrackedChangesMetaList(layerItems));
    return `
      <div class="analizar-pdf-fragment-card analizar-pdf-fragment-card--change-control">
        ${renderCardHeader(`Control de cambios · Página ${selection.pageName}`)}
        ${trackedChangesContent || `<p class="analizar-pdf-empty-state">Esta página no tiene cambios rastreados disponibles.</p>`}
        ${renderFullPageText()}
      </div>`;
  }
  if (detailKind === "custom-rules") {
    const issues = Array.isArray(page?.customRuleIssues) ? page.customRuleIssues : [];
    const content = issues.length ? `<ul class="analizar-pdf-redaction-list">${issues.map((issue) => `<li class="analizar-pdf-redaction-item"><p><strong>${escapeHtml(issue.ruleName || "Condición personalizada")}</strong> · ${escapeHtml(issue.severity || "warning")}</p><p>${escapeHtml(issue.message || "Condición encontrada")}</p>${issue.context ? `<p><strong>Contexto:</strong> ${escapeHtml(issue.context)}</p>` : ""}${issue.mechanism ? `<p><strong>Mecanismo:</strong> ${escapeHtml(issue.mechanism)}</p>` : ""}${issue.suggestion ? `<p><strong>Sugerencia:</strong> ${escapeHtml(issue.suggestion)}</p>` : ""}</li>`).join("")}</ul>` : `<p class="analizar-pdf-empty-state">Esta página no tiene hallazgos personalizados.</p>`;
    return `<div class="analizar-pdf-fragment-card analizar-pdf-fragment-card--change-control">${renderCardHeader(`Condiciones personalizadas · Página ${selection.pageName}`)}${content}${renderFullPageText()}</div>`;
  }
  if (detailKind === "recortables") {
    const recortableIssues = Array.isArray(page?.recortableIssues) ? page.recortableIssues : [];
    const layeredRecortableIssues = groupItemsByLayer(recortableIssues.filter((item) => String(item?.layerName || "").trim()));
    const recortableTabs = [{
      layerName: "Resumen",
      value: { ...page, recortableIssues: recortableIssues.filter((item) => !String(item?.layerName || "").trim()) },
    }, ...layeredRecortableIssues.map(([layerName, items]) => ({
      layerName,
      value: { ...page, recortableSummary: {}, recortableIssues: items },
    }))];
    const recortableContent = renderLayerTabs(recortableTabs, `${pageCardId}-recortables`, (layerItems) => renderRecortableMetaList(
      layerItems[0]?.value || {},
      { title: "Recortables / Fichas / Anexos / Videos" }
    ));
    return `
      <div class="analizar-pdf-fragment-card analizar-pdf-fragment-card--recortables">
        ${renderCardHeader(`Referencias editoriales · Página ${selection.pageName}`)}
        ${recortableContent || `<p class="analizar-pdf-empty-state">Esta página no tiene referencias de recortables, fichas, anexos o videos disponibles.</p>`}
        ${renderFullPageText()}
      </div>`;
  }
  const issueSourcesByKind = {
    orthotypography: Array.isArray(page?.orthotypographyIssues) ? page.orthotypographyIssues : [],
    spelling: Array.isArray(page?.spellingIssues) ? page.spellingIssues : [],
    "quick-orthotypography": Array.isArray(quickPage?.issues) ? quickPage.issues : [],
    redaction: Array.isArray(page?.redactionIssues) ? page.redactionIssues : [],
  };
  const issueLabelsByKind = {
    orthotypography: "fragmentos ortotipográficos",
    spelling: "fragmentos ortográficos",
    "quick-orthotypography": "hallazgos del análisis rápido",
    redaction: "propuestas de redacción",
  };
  const selectedIssues = issueSourcesByKind[detailKind] || [];
  const fragments = selectedIssues.map((issue) => ({
    excerpt: String(issue?.excerpt || issue?.paragraphText || issue?.context || issue?.token || "").trim(),
    paragraphText: String(issue?.paragraphText || issue?.context || issue?.excerpt || issue?.token || "").trim(),
    message: String(issue?.message || issue?.reason || issue?.suggestion || "Hallazgo editorial").trim(),
    layerName: String(issue?.layerName || "").trim(),
    storyId: String(issue?.storyId || "").trim(),
    frameId: String(issue?.frameId || "").trim(),
    code: String(issue?.code || issue?.layoutIssueType || "").trim(),
    suggestion: String(issue?.suggestion || issue?.replacement || issue?.replacements?.[0] || "").trim(),
  })).filter((issue) => issue.excerpt);
  const normalizeFingerprintPart = (value = "") => String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("es");
  const unique = [...new Map(fragments.map((issue) => {
    const occurrenceKey = [
      detailKind,
      issue.storyId,
      issue.frameId,
      issue.layerName,
      issue.excerpt,
      issue.paragraphText,
      issue.code || issue.suggestion || issue.message,
    ].map(normalizeFingerprintPart).join("::");
    return [occurrenceKey, issue];
  })).values()];
  const issueLabel = issueLabelsByKind[detailKind] || "hallazgos de esta categoría";
  const issueTabs = renderLayerTabs(unique, `${pageCardId}-issues`, (layerItems, layerName, groupIndex) => `
    <ul class="analizar-pdf-fragment-list">${layerItems.map((issue, index) => {
      const issuePageCardId = `${pageCardId}-${groupIndex}-${index}`;
      return `<li>
        <small>${escapeHtml(issue.message)}</small>
        <p class="analizar-pdf-fragment-paragraph">${renderHighlightedText(issue.paragraphText, [issue.excerpt])}</p>
        <button type="button" class="analizar-pdf-page-text-toggle" data-action="toggle-full-page-text" aria-expanded="false" aria-controls="${escapeHtmlAttr(issuePageCardId)}">Ver texto completo de la página</button>
        <article id="${escapeHtmlAttr(issuePageCardId)}" class="analizar-pdf-full-page-text-card" hidden><h6>Texto completo · Página ${escapeHtml(selection.pageName)} · ${escapeHtml(layerName)}</h6><p>${escapeHtml(pageText || "No hay texto de página disponible.")}</p></article>
      </li>`;
    }).join("")}</ul>
  `);
  return `
    <div class="analizar-pdf-fragment-card">
      ${renderCardHeader(`Página ${selection.pageName}`)}
      ${unique.length ? issueTabs : `<p class="analizar-pdf-empty-state">Esta página no tiene ${escapeHtml(issueLabel)} disponibles.</p>`}
    </div>`;
}

export function createAnalizarPdfResultsRenderer(deps = {}) {
  const { el, pageReportsEl, railHostEl, onToggleCorrectionMode, onToggleCorrectionPage, onToggleCorrectionIssue, onClearRailAnalysis, isRailCleared } = deps;
  const railRootEl = railHostEl || pageReportsEl;
  const fullPageTextModalEl = typeof document !== "undefined" ? document.getElementById("analizarPdfFullPageTextModal") : null;
  const fullPageTextTitleEl = typeof document !== "undefined" ? document.getElementById("analizarPdfFullPageTextTitle") : null;
  const fullPageTextContentEl = typeof document !== "undefined" ? document.getElementById("analizarPdfFullPageTextContent") : null;
  const fullPageTextCloseBtn = typeof document !== "undefined" ? document.getElementById("analizarPdfFullPageTextCloseBtn") : null;
  let auxiliaryPanelsHidden = true;
  let outsideTextHidden = false;
  let selectedQuickPage = null;
  let activeRailResizeCleanup = null;
  let activeRailMuuriLayouts = [];
  let activeRailLayoutFrame = 0;
  let activeRailLayoutObserver = null;
  let fullPageTextOpener = null;

  function closeFullPageTextModal({ restoreFocus = true } = {}) {
    if (!fullPageTextModalEl || fullPageTextModalEl.hidden) return;
    fullPageTextModalEl.hidden = true;
    fullPageTextOpener?.setAttribute("aria-expanded", "false");
    if (restoreFocus && fullPageTextOpener?.isConnected) fullPageTextOpener.focus();
    fullPageTextOpener = null;
  }

  function openFullPageTextModal(sourceCard, opener) {
    if (!fullPageTextModalEl || !fullPageTextTitleEl || !fullPageTextContentEl || !sourceCard) return;
    const sourceTitle = String(sourceCard.querySelector("h6")?.textContent || "Texto completo").trim();
    const sourceText = String(sourceCard.querySelector("p")?.textContent || "No hay texto de página disponible.").trim();
    fullPageTextTitleEl.textContent = sourceTitle;
    fullPageTextContentEl.textContent = sourceText;
    fullPageTextOpener = opener || null;
    fullPageTextOpener?.setAttribute("aria-expanded", "true");
    fullPageTextModalEl.hidden = false;
    fullPageTextCloseBtn?.focus();
  }

  if (fullPageTextModalEl) {
    fullPageTextModalEl.onclick = (event) => {
      const closeTrigger = event.target instanceof Element
        ? event.target.closest('[data-action="close-full-page-text-modal"]')
        : null;
      if (!closeTrigger) return;
      event.preventDefault();
      closeFullPageTextModal();
    };
    fullPageTextModalEl.onkeydown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeFullPageTextModal();
    };
  }

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

  function createRailMasonryLayout(container) {
    const Muuri = getMuuriConstructor();
    if (!container || !Muuri || !container.querySelector(":scope > .analizar-pdf-ortho-rail-group")) return null;
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
    activeRailLayoutObserver?.observe(container);
    return grid;
  }

  function destroyRailMasonryLayoutFor(container) {
    if (!container) return;
    activeRailLayoutObserver?.unobserve(container);
    const retained = [];
    activeRailMuuriLayouts.forEach((grid) => {
      if (grid.getElement?.() !== container) {
        retained.push(grid);
        return;
      }
      try {
        grid.destroy();
      } catch (_) {
        // El contenedor puede haber sido retirado durante una actualización puntual.
      }
    });
    activeRailMuuriLayouts = retained;
  }

  function initRailMasonryLayouts() {
    destroyRailMasonryLayouts();
    if (!railRootEl || typeof window === "undefined") return;
    const Muuri = getMuuriConstructor();
    if (!Muuri) return;
    const nestedContainers = Array.from(railRootEl.querySelectorAll(".analizar-pdf-ortho-file-group"));
    const rootContainers = Array.from(railRootEl.querySelectorAll(".analizar-pdf-ortho-rail-body"));
    const containers = [...nestedContainers, ...rootContainers]
      .filter((container) => container.querySelector(":scope > .analizar-pdf-ortho-rail-group"));
    if (!containers.length) return;
    if (typeof ResizeObserver === "function") {
      activeRailLayoutObserver = new ResizeObserver(() => scheduleRailMasonryLayout());
      const rail = railRootEl.querySelector(".analizar-pdf-ortho-rail");
      if (rail) activeRailLayoutObserver.observe(rail);
    }
    containers.forEach((container) => createRailMasonryLayout(container));
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
    if (!railRootEl || typeof window === "undefined") return;
    restoreRailWidth();
    const handle = railRootEl.querySelector("[data-action='resize-rail']");
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
    const onDoubleClick = (event) => {
      if (!canResizeRail()) return;
      event.preventDefault();
      applyRailWidth(DEFAULT_RAIL_WIDTH);
      scheduleRailMasonryLayout();
    };
    handle.onpointerdown = onPointerDown;
    handle.ondblclick = onDoubleClick;
    handle.setAttribute("title", "Doble clic para restaurar el ancho");
    activeRailResizeCleanup = () => {
      handle.onpointerdown = null;
      handle.ondblclick = null;
    };
  }

  function toggleFileRailGroup(revisionId = "", fileId = "") {
    const cleanRevisionId = String(revisionId || "").trim();
    const cleanFileId = String(fileId || "").trim();
    if (!cleanRevisionId || !railRootEl) return false;

    const groups = Array.from(railRootEl.querySelectorAll(
      ".analizar-pdf-ortho-rail-body > details.analizar-pdf-ortho-rail-group.is-complete.has-analysis[data-rail-group-key]"
    ));
    const details = groups.find((group) => {
      const sameRevision = String(group.dataset.revisionId || "").trim() === cleanRevisionId;
      const sameFile = !cleanFileId || String(group.dataset.fileId || "").trim() === cleanFileId;
      return sameRevision && sameFile;
    });
    if (!details) return false;

    const groupKey = String(details.dataset.railGroupKey || "").trim();
    const shouldOpen = details.open !== true;
    if (groupKey) {
      railOpenStateByKey.set(groupKey, shouldOpen);
    }
    details.open = shouldOpen;
    // Esperar a que <details> confirme su nueva geometría antes de pedir a
    // Muuri que mida el item evita layouts con una altura intermedia bloqueada.
    window.requestAnimationFrame(() => scheduleRailMasonryLayout());
    return shouldOpen;
  }

  function closeQuickDetail() {
    selectedQuickPage = null;
    const quickDetailPanel = pageReportsEl?.closest("#analizarPdfQuickDetailPanel");
    quickDetailPanel?.classList.remove("is-visible");
    const quickDetailDescription = quickDetailPanel?.querySelector("#analizarPdfQuickDetailDescription");
    if (quickDetailDescription) {
      quickDetailDescription.textContent = "Selecciona una página en Accesos rápidos para ver la información del hallazgo.";
    }
    if (pageReportsEl) pageReportsEl.innerHTML = "";
  }

  function updateQuickDetailDescription(quickDetailPanel = null) {
    const description = quickDetailPanel?.querySelector("#analizarPdfQuickDetailDescription");
    if (!description) return;
    const detailKind = String(selectedQuickPage?.detailKind || "orthotypography").trim().toLowerCase();
    const descriptions = {
      notes: "Notas editoriales detectadas en la página seleccionada.",
      "tracked-changes": "Cambios rastreados detectados en la página seleccionada.",
      recortables: "Recortables, fichas, anexos y videos detectados en la página seleccionada.",
    };
    description.textContent = descriptions[detailKind]
      || "Fragmentos ortográficos y ortotipográficos de la página seleccionada.";
  }

  function renderQuickDetailOnly(session = null) {
    if (!pageReportsEl || pageReportsEl === railRootEl) {
      render(session);
      return;
    }
    const railCleared = typeof isRailCleared === "function" ? isRailCleared(session) : false;
    const fallbackSessionEntries = hasRenderableAnalysis(session) ? [session] : [];
    const fileEntries = railCleared
      ? []
      : (Array.isArray(session?.fileResults) && session.fileResults.length
        ? session.fileResults
        : fallbackSessionEntries);
    const railEntries = buildOrderedRailEntries(
      session,
      railCleared ? [] : fileEntries.filter((entry) => isProcessedRailEntry(entry))
    );
    const quickDetailPanel = pageReportsEl.closest("#analizarPdfQuickDetailPanel");
    const shouldShow = Boolean(selectedQuickPage?.pageName);
    quickDetailPanel?.classList.toggle("is-visible", shouldShow);
    updateQuickDetailDescription(quickDetailPanel);
    pageReportsEl.innerHTML = shouldShow
      ? `<div class="analizar-pdf-page-report-shell"><div class="analizar-pdf-page-report-list">${renderSelectedFragments(selectedQuickPage, railEntries)}</div></div>`
      : "";
  }

  function resolveRailEntries(session = null) {
    const railCleared = typeof isRailCleared === "function" ? isRailCleared(session) : false;
    const fallbackSessionEntries = hasRenderableAnalysis(session) ? [session] : [];
    const fileEntries = railCleared
      ? []
      : (Array.isArray(session?.fileResults) && session.fileResults.length
        ? session.fileResults
        : fallbackSessionEntries);
    return {
      railCleared,
      fileEntries,
      railEntries: buildOrderedRailEntries(
        session,
        railCleared ? [] : fileEntries.filter((entry) => isProcessedRailEntry(entry))
      ),
    };
  }

  function updateRailEntry(session = null, revisionId = "", fileId = "") {
    const cleanRevisionId = String(revisionId || "").trim();
    const cleanFileId = String(fileId || "").trim();
    if (!session || !railRootEl || !cleanRevisionId || !cleanFileId) return false;

    const { railEntries } = resolveRailEntries(session);
    const template = document.createElement("template");
    template.innerHTML = railEntries.length ? renderGroupedRightRail(railEntries) : renderRightRail([]);
    const matchesTarget = (details) => (
      String(details?.dataset?.revisionId || "").trim() === cleanRevisionId
      && String(details?.dataset?.fileId || "").trim() === cleanFileId
    );
    const replacement = Array.from(template.content.querySelectorAll(
      ".analizar-pdf-ortho-rail-body > details.analizar-pdf-ortho-rail-group[data-revision-id][data-file-id]"
    )).find(matchesTarget) || null;
    const current = Array.from(railRootEl.querySelectorAll(
      ".analizar-pdf-ortho-rail-body > details.analizar-pdf-ortho-rail-group[data-revision-id][data-file-id]"
    )).find(matchesTarget) || null;
    if (!replacement || !current) return false;

    railRootEl.__analizarPdfSession = session;
    const semanticClasses = ["is-complete", "is-empty", "has-analysis"];
    semanticClasses.forEach((className) => {
      current.classList.toggle(className, replacement.classList.contains(className));
    });
    current.dataset.railState = String(replacement.dataset.railState || "");
    current.dataset.railGroupKey = String(replacement.dataset.railGroupKey || "");
    ["--analizar-pdf-rail-tint", "--analizar-pdf-rail-ink", "--analizar-pdf-rail-text-relief"].forEach((property) => {
      const value = replacement.style.getPropertyValue(property);
      if (value) current.style.setProperty(property, value);
    });
    const currentTitle = current.querySelector(":scope > summary .analizar-pdf-rail-file-title");
    const replacementTitle = replacement.querySelector(":scope > summary .analizar-pdf-rail-file-title");
    const currentTitleText = currentTitle?.querySelector(".analizar-pdf-rail-file-title-text");
    const replacementTitleText = replacementTitle?.querySelector(".analizar-pdf-rail-file-title-text");
    if (currentTitle && replacementTitle) {
      currentTitle.dataset.tooltip = String(replacementTitle.dataset.tooltip || "");
    }
    if (currentTitleText && replacementTitleText && currentTitleText.textContent !== replacementTitleText.textContent) {
      currentTitleText.textContent = replacementTitleText.textContent;
    }

    // Conservar el summary evita cortar el relleno, la sacudida y las partículas
    // que ya están animándose. Solo cambia el contenido analítico del item destino.
    const currentBody = current.querySelector(":scope > .analizar-pdf-ortho-file-group");
    const replacementBody = replacement.querySelector(":scope > .analizar-pdf-ortho-file-group");
    if (currentBody && replacementBody && currentBody.innerHTML !== replacementBody.innerHTML) {
      destroyRailMasonryLayoutFor(currentBody);
      currentBody.innerHTML = replacementBody.innerHTML;
      currentBody.classList.remove("is-muuri-rail-grid");
      createRailMasonryLayout(currentBody);
    }
    const groupKey = String(current.dataset.railGroupKey || "").trim();
    if (groupKey) railOpenStateByKey.set(groupKey, current.open === true);
    bindEvents();
    scheduleRailMasonryLayout();
    return true;
  }

  function updateSessionReference(session = null) {
    if (el) el.__analizarPdfSession = session;
    if (pageReportsEl) pageReportsEl.__analizarPdfSession = session;
    if (railRootEl) railRootEl.__analizarPdfSession = session;
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
    if (railRootEl) {
      bindRailResizeHandle();
      railRootEl.querySelectorAll("details[data-rail-group-key]").forEach((details) => {
        details.ontoggle = () => {
          const groupKey = String(details.dataset.railGroupKey || "").trim();
          if (groupKey) {
            railOpenStateByKey.set(groupKey, details.open === true);
          }
          scheduleRailMasonryLayout();
        };
      });
      railRootEl.onclick = (event) => {
        const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
        const action = String(target?.dataset?.action || "").trim();
        if (!action) return;
        if (action === "show-page-fragments") {
          event.preventDefault();
          const railCategory = target.closest("details[data-rail-category]")?.dataset?.railCategory || "";
          const selection = {
            pageName: String(target?.dataset?.pageName || "").trim(),
            fileId: String(target?.dataset?.fileId || "").trim(),
            detailKind: String(target?.dataset?.detailKind || railCategory || "orthotypography").trim().toLowerCase(),
          };
          const isCurrentSelection = selectedQuickPage
            && selectedQuickPage.pageName === selection.pageName
            && selectedQuickPage.fileId === selection.fileId
            && selectedQuickPage.detailKind === selection.detailKind;
          selectedQuickPage = isCurrentSelection ? null : selection;
          const session = railRootEl.__analizarPdfSession || el?.__analizarPdfSession || null;
          // El detalle vive en un panel independiente: actualizar solo ese nodo
          // conserva Muuri, los <details> abiertos y cualquier animación activa.
          renderQuickDetailOnly(session);
          return;
        }
        if (action === "toggle-hide-outside-text") {
          outsideTextHidden = !outsideTextHidden;
          const session = railRootEl.__analizarPdfSession || el?.__analizarPdfSession || null;
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
          const session = railRootEl.__analizarPdfSession || el?.__analizarPdfSession || null;
          render(session);
          return;
        }
        if (action === "close-rail-filter-modal") {
          railFilterModalOpen = false;
          const modal = railRootEl.querySelector("[data-rail-filter-modal]");
          if (modal) modal.hidden = true;
          return;
        }
        if (action === "show-all-rail-categories") {
          railCategoryVisibility = Object.fromEntries(RAIL_CATEGORY_FILTERS.map((item) => [item.id, activeRailWorkflowFormat !== "libre" || item.id !== "recortables"]));
          persistRailCategoryVisibility(railCategoryVisibility);
          railFilterModalOpen = true;
          const session = railRootEl.__analizarPdfSession || el?.__analizarPdfSession || null;
          render(session);
          return;
        }
        if (action === "toggle-rail-groups") {
          const groups = Array.from(railRootEl.querySelectorAll(".analizar-pdf-ortho-rail details[data-rail-group-key]"));
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
          const groups = Array.from(railRootEl.querySelectorAll(".analizar-pdf-ortho-rail details[data-rail-group-key]"));
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
      railRootEl.onchange = (event) => {
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
          const session = railRootEl.__analizarPdfSession || el?.__analizarPdfSession || null;
          render(session);
        }
      };
    }
    if (pageReportsEl && pageReportsEl !== railRootEl) {
      pageReportsEl.onclick = (event) => {
        const button = event.target instanceof Element ? event.target.closest("[data-action]") : null;
        if (!button) return;
        if (button.dataset.action === "close-quick-detail") {
          event.preventDefault();
          closeQuickDetail();
          return;
        }
        if (button.dataset.action === "select-layer-tab") {
          event.preventDefault();
          const tabs = button.closest("[data-layer-tabs]");
          if (!tabs) return;
          tabs.querySelectorAll('[role="tab"]').forEach((tab) => {
            const active = tab === button;
            tab.classList.toggle("is-active", active);
            tab.setAttribute("aria-selected", active ? "true" : "false");
            tab.tabIndex = active ? 0 : -1;
            const panel = document.getElementById(String(tab.getAttribute("aria-controls") || ""));
            if (panel) panel.hidden = !active;
          });
          return;
        }
        if (button.dataset.action !== "toggle-full-page-text") return;
        event.preventDefault();
        const targetId = String(button.getAttribute("aria-controls") || "").trim();
        const pageCard = targetId ? document.getElementById(targetId) : null;
        if (!pageCard) return;
        openFullPageTextModal(pageCard, button);
      };
      pageReportsEl.onkeydown = (event) => {
        const tab = event.target instanceof Element ? event.target.closest('[role="tab"]') : null;
        if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const tabs = [...(tab.closest('[role="tablist"]')?.querySelectorAll('[role="tab"]') || [])];
        if (!tabs.length) return;
        event.preventDefault();
        const currentIndex = tabs.indexOf(tab);
        const nextIndex = event.key === "Home" ? 0
          : event.key === "End" ? tabs.length - 1
          : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        tabs[nextIndex]?.click();
        tabs[nextIndex]?.focus();
      };
    }
  }

  function render(session = null) {
    activeRailWorkflowFormat = session?.workflowFormat === "libre" ? "libre" : "en_forma";
    if (previousRailWorkflowFormat !== activeRailWorkflowFormat) {
      previousRailWorkflowFormat = activeRailWorkflowFormat;
      railCategoryVisibility = readRailCategoryVisibility();
      if (activeRailWorkflowFormat === "libre") railCategoryVisibility.recortables = false;
    }
    destroyRailMasonryLayouts();
    if (el) {
      el.__analizarPdfSession = session;
    }
    if (pageReportsEl) {
      pageReportsEl.__analizarPdfSession = session;
    }
    if (railRootEl) {
      railRootEl.__analizarPdfSession = session;
    }
    if (!session) {
      if (el) {
        el.innerHTML = `<div class="analizar-pdf-result-card"><p class="analizar-pdf-empty-state">Selecciona o crea una sesión para empezar.</p></div>`;
      }
      if (pageReportsEl) {
        pageReportsEl.innerHTML = `<div class="analizar-pdf-result-card"><p class="analizar-pdf-empty-state">Todavía no hay reporte por página.</p></div>`;
      }
      if (railRootEl && railRootEl !== pageReportsEl) {
        railRootEl.innerHTML = renderRightRail([]);
      }
      bindEvents();
      return;
    }
    const result = session.result && typeof session.result === "object" ? session.result : {};
    const summary = session.resultSummary && typeof session.resultSummary === "object" ? session.resultSummary : null;
    const stats = result.stats && typeof result.stats === "object" ? result.stats : {};
    const { railCleared, fileEntries, railEntries } = resolveRailEntries(session);
    const reportEntries = railCleared ? [] : railEntries.filter((entry) => Array.isArray(entry?.result?.stats?.pageReports) && entry.result.stats.pageReports.length);
    const quickReportEntries = railCleared
      ? []
      : fileEntries.filter((entry) => entry?.quickAnalysis && Array.isArray(entry?.quickAnalysis?.pages));
    const hasAnyPageReport = reportEntries.length || quickReportEntries.length;
    if (el) {
      el.innerHTML = "";
    }
    if (pageReportsEl) {
      const quickDetailPanel = pageReportsEl.closest("#analizarPdfQuickDetailPanel");
      quickDetailPanel?.classList.toggle("is-visible", Boolean(selectedQuickPage?.pageName));
      updateQuickDetailDescription(quickDetailPanel);
      const renderedRail = railEntries.length ? renderGroupedRightRail(railEntries) : renderRightRail([]);
      pageReportsEl.innerHTML = `
        <div class="analizar-pdf-page-report-shell">
          <div class="analizar-pdf-page-report-list">${renderSelectedFragments(selectedQuickPage, railEntries)}</div>
          ${railRootEl === pageReportsEl ? renderedRail : ""}
        </div>
      `;
    }
    if (railRootEl && railRootEl !== pageReportsEl) {
      railRootEl.innerHTML = railEntries.length ? renderGroupedRightRail(railEntries) : renderRightRail([]);
    }
    bindEvents();
    initRailMasonryLayouts();
  }

  return { render, updateRailEntry, updateSessionReference, toggleFileRailGroup, closeQuickDetail };
}
