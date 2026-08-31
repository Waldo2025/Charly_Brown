const DIRECT_VIDEO_TABLE_REQUIRED_KEYS = Object.freeze([
  "script",
  "sceneDescription",
  "visual"
]);

const DIRECT_VIDEO_TABLE_REQUIRED_LABELS = Object.freeze({
  script: "Guion",
  sceneDescription: "Descripción de escena",
  visual: "Elemento visual"
});

function cleanCell(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function formatSceneClock(totalSeconds = 0) {
  const value = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  const minuteSecond = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours > 0 ? `${String(hours).padStart(2, "0")}:${minuteSecond}` : minuteSecond;
}

function normalizeHeaderLabel(label = "") {
  return cleanCell(label)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2013\u2014_-]+/g, " ")
    .replace(/[^\p{L}\p{N}#]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeVideoTableHeaderKey(label = "") {
  const clean = normalizeHeaderLabel(label);
  if (!clean) return "";

  if (/^(#|n|no|num|numero)?\s*(escena|secuencia)(\s+(#|n|no|num|numero|id))?$/.test(clean)
    || /^(scene|sequence)(\s+(number|no|id))?$/.test(clean)) {
    return "sceneIndex";
  }
  if (/\b(tiempo|duracion|duration|time|timecode|codigo de tiempo|rango de tiempo)\b/.test(clean)) {
    return "time";
  }
  if (/\b(guion|voz en off|voice over|locucion|dialogo|narracion|narration|script)\b/.test(clean)) {
    return "script";
  }
  if (/\b(subtitulos?|karaoke|captions?|closed captions?|dialogo subtitulado)\b/.test(clean)) {
    return "captionText";
  }
  if (/\b(texto natural (dentro|integrado|visible)|texto (dentro|integrado) (de|en) (la )?(escena|video)|texto en pantalla|on screen text|onscreen text|in scene text)\b/.test(clean)) {
    return "inSceneText";
  }
  if (/\b(titular editorial|titular|headline|rotulo editorial|copy editorial)\b/.test(clean)) {
    return "headlineText";
  }
  if (/\b(descripcion (?:de (?:la )?)?escena|descripcion escena|descripcion visual|scene description|escenario|locacion|ambientacion|setting)\b/.test(clean)
    || clean === "descripcion") {
    return "sceneDescription";
  }
  if (/\b(transicion|transition|tipo de corte|corte|fade|fundido|barrido|disolvencia)\b/.test(clean)) {
    return "transition";
  }
  if (/\b(elemento visual|recurso visual|notas visuales|visual notes|direccion visual|visual|imagen|fondo|plano visual)\b/.test(clean)) {
    return "visual";
  }
  return "";
}

export function analyzeVideoTableHeader(row = []) {
  const cells = Array.isArray(row) ? row.map(cleanCell) : [];
  const keys = cells.map((cell) => normalizeVideoTableHeaderKey(cell));
  const contentKeys = keys.filter((key) => key && key !== "sceneIndex");
  const recognizedContentCount = new Set(contentKeys).size;
  const shortCellCount = cells.filter((cell) => cell.length <= 48).length;
  const hasLongNarrativeCell = cells.some((cell) => cell.length > 80 || /[.!?]\s*$/.test(cell));
  const hasAnchor = contentKeys.includes("script")
    || contentKeys.includes("sceneDescription")
    || contentKeys.includes("visual");
  return {
    keys,
    isHeader: recognizedContentCount >= 2
      && hasAnchor
      && shortCellCount >= Math.max(2, Math.ceil(cells.length * 0.6))
      && !hasLongNarrativeCell
  };
}

function createEmptyMappedRow() {
  return {
    time: "",
    script: "",
    sceneDescription: "",
    headlineText: "",
    captionText: "",
    inSceneText: "",
    transition: "",
    visual: ""
  };
}

function mapArrayRowByHeader(row = [], headerKeys = []) {
  const mapped = createEmptyMappedRow();
  headerKeys.forEach((key, cellIndex) => {
    if (!key || key === "sceneIndex" || !Object.prototype.hasOwnProperty.call(mapped, key)) return;
    const value = cleanCell(row[cellIndex]);
    if (value || !mapped[key]) mapped[key] = value;
  });
  return mapped;
}

function looksLikeSceneOrdinal(value = "") {
  return /^(?:escena\s*)?#?\s*\d{1,4}$/i.test(cleanCell(value));
}

function mapArrayRowByLegacyPosition(row = [], siblingRows = []) {
  const cells = row.map(cleanCell);
  const mapped = createEmptyMappedRow();
  const fiveColumnSceneOrdinalLayout = cells.length === 5
    && looksLikeSceneOrdinal(cells[0])
    && siblingRows.filter((item) => Array.isArray(item) && item.some((cell) => cleanCell(cell))).every((item) => looksLikeSceneOrdinal(item[0]));

  if (fiveColumnSceneOrdinalLayout) {
    mapped.script = cells[1] || "";
    mapped.sceneDescription = cells[2] || "";
    mapped.transition = cells[3] || "";
    mapped.visual = cells[4] || "";
    return mapped;
  }
  if (cells.length === 5) {
    mapped.script = cells[0] || "";
    mapped.sceneDescription = cells[1] || "";
    mapped.inSceneText = cells[2] || "";
    mapped.transition = cells[3] || "";
    mapped.visual = cells[4] || "";
    return mapped;
  }
  if (cells.length === 4) {
    mapped.time = cells[0] || "";
    mapped.script = cells[1] || "";
    mapped.transition = cells[2] || "";
    mapped.visual = cells[3] || "";
    return mapped;
  }
  mapped.time = cells[0] || "";
  mapped.script = cells[1] || "";
  mapped.sceneDescription = cells[2] || "";
  mapped.inSceneText = cells[3] || "";
  mapped.transition = cells[4] || "";
  mapped.visual = cells[5] || "";
  return mapped;
}

function mapObjectRow(row = {}) {
  return {
    time: cleanCell(row?.time ?? row?.timeRange ?? row?.tiempo),
    script: cleanCell(row?.script ?? row?.guion ?? row?.voiceOverText ?? row?.text),
    sceneDescription: cleanCell(
      row?.sceneDescription
      ?? row?.descripcionEscena
      ?? row?.descripcionDeEscena
      ?? row?.description
      ?? row?.escenario
    ),
    headlineText: cleanCell(
      row?.headlineText
      ?? row?.onScreenText
      ?? row?.titularEditorial
    ),
    captionText: cleanCell(row?.captionText ?? row?.subtitulos ?? row?.subtitles ?? row?.karaoke),
    inSceneText: cleanCell(
      row?.inSceneText
      ?? row?.textoEnEscena
      ?? row?.textoPantalla
      ?? row?.textoEnPantalla
    ),
    transition: cleanCell(row?.transition ?? row?.transicion),
    visual: cleanCell(row?.visual ?? row?.elementoVisual ?? row?.visualNotes ?? row?.recursoVisual)
  };
}

function finalizeMappedRow(mapped = {}, index = 0) {
  const script = cleanCell(mapped.script) || "Definir voz en off.";
  const sceneDescription = cleanCell(mapped.sceneDescription);
  const visual = cleanCell(mapped.visual);
  const headlineText = cleanCell(mapped.headlineText);
  const captionText = script;
  const inSceneText = cleanCell(mapped.inSceneText);
  const overlayMode = headlineText ? "both" : "captions";
  return {
    time: cleanCell(mapped.time) || `${formatSceneClock(index * 8)}-${formatSceneClock((index + 1) * 8)}`,
    script,
    sceneDescription: sceneDescription || visual || "Definir descripción de escena.",
    headlineText,
    onScreenText: headlineText ? `${headlineText}\n${captionText}` : captionText,
    captionText,
    inSceneText,
    overlayMode,
    onScreenTextNoSummarize: true,
    transition: cleanCell(mapped.transition) || "Corte limpio",
    visual: visual || sceneDescription || "Definir elemento visual."
  };
}

export function normalizeEducationalVideoTableRows(rows = []) {
  const sourceRows = (Array.isArray(rows) ? rows : [])
    .map((row) => (Array.isArray(row) ? row.map(cleanCell) : row && typeof row === "object" ? row : []))
    .filter((row) => (Array.isArray(row) ? row.some(Boolean) : Object.values(row).some((value) => cleanCell(value))));
  if (!sourceRows.length) return [];

  if (!Array.isArray(sourceRows[0])) {
    return sourceRows.map((row, index) => finalizeMappedRow(mapObjectRow(row), index));
  }

  const header = analyzeVideoTableHeader(sourceRows[0]);
  const dataRows = header.isHeader ? sourceRows.slice(1) : sourceRows;
  return dataRows
    .map((row, index) => finalizeMappedRow(
      header.isHeader
        ? mapArrayRowByHeader(row, header.keys)
        : mapArrayRowByLegacyPosition(row, dataRows),
      index
    ))
    .filter((row) => row.script || row.sceneDescription || row.visual);
}

export function validateDirectVideoTableRows(rawRows = []) {
  const sourceRows = (Array.isArray(rawRows) ? rawRows : [])
    .map((row) => (Array.isArray(row) ? row.map(cleanCell) : []))
    .filter((row) => row.some(Boolean));
  if (sourceRows.length < 2) {
    return {
      ok: false,
      rows: [],
      missingColumns: DIRECT_VIDEO_TABLE_REQUIRED_KEYS.map((key) => DIRECT_VIDEO_TABLE_REQUIRED_LABELS[key]),
      error: "Pega una tabla con encabezados y al menos una fila de escena."
    };
  }

  const header = analyzeVideoTableHeader(sourceRows[0]);
  const missingKeys = DIRECT_VIDEO_TABLE_REQUIRED_KEYS.filter((key) => !header.keys.includes(key));
  if (!header.isHeader || missingKeys.length) {
    const effectiveMissingKeys = missingKeys.length ? missingKeys : DIRECT_VIDEO_TABLE_REQUIRED_KEYS;
    const missingColumns = effectiveMissingKeys.map((key) => DIRECT_VIDEO_TABLE_REQUIRED_LABELS[key]);
    return {
      ok: false,
      rows: [],
      missingColumns,
      error: `Faltan columnas obligatorias: ${missingColumns.join(", ")}.`
    };
  }

  const mappedRows = [];
  const rowErrors = [];
  sourceRows.slice(1).forEach((row, index) => {
    const mapped = mapArrayRowByHeader(row, header.keys);
    const missingCells = DIRECT_VIDEO_TABLE_REQUIRED_KEYS
      .filter((key) => !cleanCell(mapped[key]))
      .map((key) => DIRECT_VIDEO_TABLE_REQUIRED_LABELS[key]);
    if (missingCells.length) {
      rowErrors.push(`fila ${index + 2}: ${missingCells.join(", ")}`);
      return;
    }
    mappedRows.push(finalizeMappedRow(mapped, mappedRows.length));
  });
  if (rowErrors.length) {
    return {
      ok: false,
      rows: [],
      missingColumns: [],
      rowErrors,
      error: `Hay filas incompletas (${rowErrors.slice(0, 4).join("; ")}${rowErrors.length > 4 ? "; ..." : ""}).`
    };
  }
  if (!mappedRows.length) {
    return {
      ok: false,
      rows: [],
      missingColumns: [],
      error: "La tabla no contiene filas de escena completas."
    };
  }
  return {
    ok: true,
    rows: mappedRows,
    missingColumns: [],
    rowErrors: [],
    error: ""
  };
}
