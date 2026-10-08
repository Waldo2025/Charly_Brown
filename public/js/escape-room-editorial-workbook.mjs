import { experience } from "./escape-room-experience.mjs?v=20260924-coordinate-grid-v12";
import { experienceEditorFields, updateExperienceEditor } from "./escape-room-experience-authoring.mjs?v=20260912-text-pieces-v11";
import {
  normalizeAcceptedAnswers,
  normalizePairList,
  normalizeSequenceItems,
  normalizeTextList
} from "./escape-room-creator-model.mjs?v=20260925-signed-answers-v64";
import { getGameMessages, normalizeGameLocale } from "./escape-room-game-i18n.mjs?v=20260904-briefing-editorial-v13";

export const EDITORIAL_WORKBOOK_VERSION = 7;
const SUPPORTED_EDITORIAL_WORKBOOK_VERSIONS = new Set([1, 2, 3, 4, 5, 6, EDITORIAL_WORKBOOK_VERSION]);

const EDITORIAL_SHEET_LAYOUTS = Object.freeze({
  Textos: { visibleThrough: 5, editable: new Set(["E"]), choices: new Set() }
});

const EDITORIAL_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="11"/><color rgb="FF172033"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="15"/><color rgb="FF172033"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FF172033"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="6">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF2563EB"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF4CC"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE8F5E9"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left/><right/><top/><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="8">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleMedium4"/>
</styleSheet>`;

const APPLY_VALUES = new Set(["si", "sí", "yes", "oui", "sim", "1", "true"]);
const DELETE_VALUES = new Set(["eliminar", "delete", "supprimer", "excluir"]);
const ADD_VALUES = new Set(["agregar", "añadir", "add", "ajouter", "adicionar"]);
const TEXT_FIELDS = Object.freeze({
  project: ["titulo", "subtitulo", "introduccion", "instrucciones", "ambientacion", "linea_visual_base", "estilo_visual", "clave_final", "conclusion"],
  mission: [
    "release", "titulo", "historia", "contexto", "datos_clave", "reto", "pista", "retroalimentacion_correcta",
    "briefing_titulo", "briefing_instruccion", "briefing_evidencias_titulo",
    "briefing_objetivo_titulo", "briefing_boton_inicio", "briefing_boton_revisar",
    "briefing_mensaje_listo", "imagen_prompt", "imagen_alt", "media.alt", "media.titulo", "media.texto"
  ],
  question: [
    "titulo", "reto", "pista", "extra_hint", "imagen_prompt", "imagen_alt", "media.alt", "media.titulo", "media.texto",
    "retroalimentacion_correcta", "retroalimentacion_incorrecta"
  ]
});

const LABELS = Object.freeze({
  extra_hint: "Pista adicional",
  release: "Etiqueta de sala o sección",
  titulo: "Título",
  subtitulo: "Subtítulo",
  introduccion: "Introducción",
  instrucciones: "Instrucciones",
  ambientacion: "Ambientación narrativa",
  linea_visual_base: "Línea visual base",
  estilo_visual: "Estilo visual",
  clave_final: "Palabra clave final",
  conclusion: "Mensaje final",
  historia: "Historia",
  contexto: "Expediente de contexto",
  datos_clave: "Evidencias clave",
  reto: "Reto",
  pista: "Pista",
  imagen_prompt: "Prompt de imagen",
  imagen_alt: "Texto alternativo de imagen",
  "media.alt": "Multimedia · Texto alternativo",
  "media.titulo": "Multimedia · Título",
  "media.texto": "Multimedia · Descripción",
  retroalimentacion_correcta: "Feedback correcto / finalización de sala",
  retroalimentacion_incorrecta: "Feedback incorrecto",
  texto_con_hueco: "Texto con espacio",
  briefing_titulo: "Briefing · Título del tablero",
  briefing_instruccion: "Briefing · Instrucción inicial",
  briefing_evidencias_titulo: "Briefing · Encabezado de evidencias",
  briefing_objetivo_titulo: "Briefing · Encabezado del objetivo",
  briefing_boton_inicio: "Briefing · Botón para comenzar",
  briefing_boton_revisar: "Briefing · Botón Review the briefing",
  briefing_mensaje_listo: "Briefing · Mensaje después de revisarlo"
});

const BRIEFING_DEFAULT_KEYS = Object.freeze({
  briefing_titulo: "investigationBoard",
  briefing_instruccion: "briefingLead",
  briefing_evidencias_titulo: "keyEvidence",
  briefing_objetivo_titulo: "missionObjective",
  briefing_boton_inicio: "briefingAcknowledge",
  briefing_boton_revisar: "briefingReview",
  briefing_mensaje_listo: "briefingReady"
});

function text(value = "") {
  return String(value ?? "");
}

function key(value = "") {
  return text(value).trim().toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function wantsApply(value) {
  return APPLY_VALUES.has(key(value));
}

function isDelete(value) {
  return DELETE_VALUES.has(key(value));
}

function isAdd(value) {
  return ADD_VALUES.has(key(value));
}

function parseIndex(value) {
  const raw = text(value).trim();
  if (!/^\d+$/.test(raw)) return null;
  const index = Number(raw);
  return Number.isSafeInteger(index) && index >= 0 ? index : null;
}

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function stableJson(value) {
  return JSON.stringify(value ?? null);
}

function topicReference(topic, topicIndex) {
  return `T${String(Number(topic?.academicNumber) || topicIndex + 1).padStart(2, "0")}`;
}

function missionReference(topicRef, missionIndex) {
  return `${topicRef}-S${String(missionIndex + 1).padStart(2, "0")}`;
}

function questionReference(missionRef, questionIndex) {
  return `${missionRef}-P${String(questionIndex + 1).padStart(2, "0")}`;
}

function projectFieldValue(project, field, locale = "es-419") {
  if (field.startsWith('experience.')) return text(experienceEditorFields(project).find(f => f.path === field.slice(11))?.value);
  if (field === "datos_clave") return normalizeTextList(project?.[field] || []).join("\n");
  if (field.startsWith("media.")) return text(project?.media?.[field.slice(6)]);
  const explicit = text(project?.[field]);
  if (explicit || !BRIEFING_DEFAULT_KEYS[field]) return explicit;
  return text(getGameMessages(normalizeGameLocale(locale))?.[BRIEFING_DEFAULT_KEYS[field]]);
}

function addTextRow(rows, context, holder, field, locale = "es-419") {
  const current = projectFieldValue(holder, field, locale);
  rows.push([
    "No", context.reference, context.topicLabel, context.missionLabel, context.questionLabel,
    context.contentLabel || LABELS[field] || field, current, "", "",
    context.topicId, context.missionId, context.questionId, context.scope, field, current
  ]);
}

function addResponseRows(rows, context, question, locale = "es-419") {
  if (question.tipo_interaccion === "multimedia" && question.interaction_contract_version === 1) return;
  if (question.tipo_interaccion === 'completar_espacio' && question.interaction_contract_version === 2) return;
  if (["opcion_multiple", "relacion_columnas", "drag_drop", "ordenar_secuencia"].includes(question.tipo_interaccion)) return;
  if (["texto", "multimedia"].includes(question.tipo_interaccion) && question.subtipo_respuesta === "frase_libre") return;
  if (question.tipo_interaccion === "verdadero_falso") {
    const messages = getGameMessages(normalizeGameLocale(locale));
    const trueLabel = text(messages?.trueLabel || "Verdadero");
    const falseLabel = text(messages?.falseLabel || "Falso");
    const value = question.respuesta_correcta === true ? trueLabel : falseLabel;
    rows.push(["No", context.reference, context.topicLabel, context.missionLabel, context.questionLabel, `${trueLabel}/${falseLabel}`, value, "", "Sí", "Conservar", "", context.topicId, context.missionId, context.questionId, "boolean", stableJson(question.respuesta_correcta)]);
    return;
  }
  const primaryAnswer = text(question.respuesta_correcta).trim();
  const accepted = normalizeAcceptedAnswers([primaryAnswer, ...(Array.isArray(question.respuestas_aceptadas) ? question.respuestas_aceptadas : [question.respuestas_aceptadas])]);
  const primaryKey = key(primaryAnswer);
  const values = [primaryAnswer, ...accepted.filter((answer) => key(answer) !== primaryKey)].filter(Boolean);
  if (!values.length) values.push("");
  values.forEach((answer, answerIndex) => rows.push([
    "No", context.reference, context.topicLabel, context.missionLabel, context.questionLabel,
    "Respuesta aceptada", answer, "", answerIndex === 0 ? "Sí" : "No", "Conservar", answerIndex,
    context.topicId, context.missionId, context.questionId, "accepted", stableJson(accepted)
  ]));
  rows.push(["No", context.reference, context.topicLabel, context.missionLabel, context.questionLabel, "Nueva respuesta", "", "", "No", "Agregar", "", context.topicId, context.missionId, context.questionId, "accepted", stableJson(accepted)]);
}

function addListRows(collections, context, question) {
  if ((question.tipo_interaccion === "opcion_multiple" || (question.tipo_interaccion === "multimedia" && question.interaction_contract_version === 1) || (question.tipo_interaccion === 'completar_espacio' && question.interaction_contract_version === 2))) {
    const options = normalizeTextList(question.opciones || []);
    const correct = text(question.respuesta_correcta);
    options.forEach((option, index) => collections.options.push([
      "No", context.reference, context.topicLabel, context.missionLabel, context.questionLabel,
      index + 1, option, "", option === correct ? "Sí" : "No", "Conservar", index,
      context.topicId, context.missionId, context.questionId, stableJson(options)
    ]));
    collections.options.push(["No", context.reference, context.topicLabel, context.missionLabel, context.questionLabel, options.length + 1, "", "", "No", "Agregar", "", context.topicId, context.missionId, context.questionId, stableJson(options)]);
  }
  if (["relacion_columnas", "drag_drop"].includes(question.tipo_interaccion) || (question.tipo_interaccion === 'completar_espacio' && question.interaction_contract_version === 2)) {
    const pairs = normalizePairList(question.parejas || []);
    pairs.forEach((pair, index) => collections.pairs.push([
      "No", context.reference, context.topicLabel, context.missionLabel, context.questionLabel,
      index + 1, pair.izquierda, "", pair.derecha, "", "Conservar", index,
      context.topicId, context.missionId, context.questionId, stableJson(pairs)
    ]));
    collections.pairs.push(["No", context.reference, context.topicLabel, context.missionLabel, context.questionLabel, pairs.length + 1, "", "", "", "", "Agregar", "", context.topicId, context.missionId, context.questionId, stableJson(pairs)]);
  }
  if (question.tipo_interaccion === "ordenar_secuencia") {
    const items = normalizeSequenceItems(question.elementos || []);
    items.forEach((item, index) => collections.sequence.push([
      "No", context.reference, context.topicLabel, context.missionLabel, context.questionLabel,
      index + 1, item, index + 1, "", "Conservar", index,
      context.topicId, context.missionId, context.questionId, stableJson(items)
    ]));
    collections.sequence.push(["No", context.reference, context.topicLabel, context.missionLabel, context.questionLabel, items.length + 1, "", items.length + 1, "", "Agregar", "", context.topicId, context.missionId, context.questionId, stableJson(items)]);
  }
}

function makeUnifiedTextRows(texts, responses, collections) {
  const entries = [];
  const addEntry = (source, { label, current, corrected = "", kind, scope = "", field = "", index = "", action = "Conservar", primary = "", correct = "", snapshot = "", order = 0 }) => {
    entries.push({ source, label, current, corrected, kind, scope, field, index, action, primary, correct, snapshot, order });
  };

  texts.forEach((row, order) => addEntry(row, {
    label: row[5], current: row[6], corrected: row[7], kind: "text", scope: row[12], field: row[13], snapshot: row[14], order
  }));
  responses.filter((row) => !isAdd(row[9])).forEach((row, order) => addEntry(row, {
    label: row[14] === "boolean" || wantsApply(row[8]) ? "Respuesta correcta" : `Respuesta aceptada ${Number(row[10]) + 1}`,
    current: row[6], corrected: row[7], kind: "response", scope: row[14], index: row[10], action: row[9], primary: row[8], snapshot: row[15], order: 100 + order
  }));
  collections.options.filter((row) => !isAdd(row[9])).forEach((row, order) => addEntry(row, {
    label: `Opción ${row[5]}${wantsApply(row[8]) ? " (respuesta correcta)" : ""}`,
    current: row[6], corrected: row[7], kind: "option", index: row[10], action: row[9], correct: row[8], snapshot: row[14], order: 200 + order
  }));
  collections.pairs.filter((row) => !isAdd(row[10])).forEach((row, order) => {
    addEntry(row, { label: `Pareja ${row[5]}: lado izquierdo`, current: row[6], corrected: row[7], kind: "pair", scope: "left", index: row[11], action: row[10], snapshot: row[15], order: 300 + (order * 2) });
    addEntry(row, { label: `Pareja ${row[5]}: lado derecho`, current: row[8], corrected: row[9], kind: "pair", scope: "right", index: row[11], action: row[10], snapshot: row[15], order: 301 + (order * 2) });
  });
  collections.sequence.filter((row) => !isAdd(row[9])).forEach((row, order) => addEntry(row, {
    label: `Paso ${row[5]}`, current: row[6], corrected: row[8], kind: "sequence", index: row[10], action: row[9], snapshot: row[14], order: 400 + order
  }));

  entries.sort((a, b) => text(a.source[1]).localeCompare(text(b.source[1]), undefined, { numeric: true }) || a.order - b.order);
  return entries.map((entry) => {
    const row = entry.source;
    const reference = text(row[1]);
    const referenceMatch = reference.match(/^T(\d+)(?:-S(\d+))?(?:-P(\d+))?/i);
    const topicNumber = Number(referenceMatch?.[1]) || "";
    const missionNumber = Number(referenceMatch?.[2]) || "";
    const questionNumber = Number(referenceMatch?.[3]) || "";
    const technicalStart = entry.kind === "text" ? 9 : entry.kind === "response" ? 11 : entry.kind === "option" ? 11 : entry.kind === "pair" ? 12 : 11;
    return [
      topicNumber, missionNumber, questionNumber, entry.label, entry.current, row[0],
      reference, row[2], row[3], row[4], row[technicalStart], row[technicalStart + 1], row[technicalStart + 2],
      entry.kind, entry.scope, entry.field, entry.index, entry.action, entry.primary, entry.correct, entry.snapshot, entry.current
    ];
  });
}

function createSheet(XLSX, title, headers, rows, widths, { hiddenFrom = -1, editableColumns = [], choiceColumns = [] } = {}) {
  const sheet = XLSX.utils.aoa_to_sheet([[title, ...Array(Math.max(0, headers.length - 1)).fill("")], headers, ...rows]);
  sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];
  sheet["!cols"] = widths.map((wch, index) => ({ wch, ...(hiddenFrom >= 0 && index >= hiddenFrom ? { hidden: true } : {}) }));
  sheet["!autofilter"] = { ref: `A2:${XLSX.utils.encode_col(headers.length - 1)}${rows.length + 2}` };
  sheet["!freeze"] = { xSplit: 0, ySplit: 2 };
  sheet["!pageSetup"] = { orientation: "landscape", fitToWidth: 1, fitToHeight: 0 };
  sheet["!margins"] = { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 };
  sheet["!rows"] = [{ hpt: 28 }, { hpt: 30 }];
  for (let row = 0; row < rows.length + 2; row += 1) {
    for (let column = 0; column < headers.length; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (!cell) continue;
      cell.s = row === 0
        ? { font: { bold: true, color: { rgb: "FF172033" }, sz: 15 }, alignment: { vertical: "center" }, border: { bottom: { style: "thin", color: { rgb: "FFCBD5E1" } } } }
        : row === 1
          ? { font: { bold: true, color: { rgb: "FFFFFFFF" } }, fill: { patternType: "solid", fgColor: { rgb: "FF2563EB" } }, alignment: { vertical: "center", wrapText: true } }
          : {
              fill: editableColumns.includes(column)
                ? { patternType: "solid", fgColor: { rgb: "FFFFF4CC" } }
                : choiceColumns.includes(column)
                  ? { patternType: "solid", fgColor: { rgb: "FFE8F5E9" } }
                  : row % 2 === 0 ? { patternType: "solid", fgColor: { rgb: "FFF8FAFC" } } : undefined,
              alignment: { vertical: "top", wrapText: true }
            };
    }
  }
  return sheet;
}

export function buildEditorialWorkbook(XLSX, { sessionId, sessionTitle = "Sesión", status = "draft", topics = [] } = {}) {
  if (!XLSX?.utils) throw new Error("XLSX no está disponible.");
  const texts = [];
  const responses = [];
  const collections = { options: [], pairs: [], sequence: [] };
  [...topics].sort((a, b) => (Number(a.academicNumber) || 0) - (Number(b.academicNumber) || 0)).forEach((topic, topicIndex) => {
    const project = topic?.project;
    if (!project) return;
    const topicRef = topicReference(topic, topicIndex);
    const topicLabel = `Tema ${Number(topic.academicNumber) || topicIndex + 1}: ${text(project.titulo || topic.title)}`;
    TEXT_FIELDS.project.forEach((field) => addTextRow(texts, { reference: topicRef, topicLabel, missionLabel: "", questionLabel: "", topicId: topic.id, missionId: "", questionId: "", scope: "project" }, project, field, project.idioma));
    (Array.isArray(project.misiones) ? project.misiones : []).forEach((mission, missionIndex) => {
      const missionRef = missionReference(topicRef, missionIndex);
      const missionLabel = mission.titulo || `Sala ${missionIndex + 1}`;
      TEXT_FIELDS.mission.forEach((field) => addTextRow(texts, { reference: missionRef, topicLabel, missionLabel, questionLabel: "", topicId: topic.id, missionId: mission.id, questionId: "", scope: "mission" }, mission, field, project.idioma));
      (Array.isArray(mission.preguntas) ? mission.preguntas : []).forEach((question, questionIndex) => {
        const questionRef = questionReference(missionRef, questionIndex);
        const context = { reference: questionRef, topicLabel, missionLabel, questionLabel: question.titulo || `Pregunta ${questionIndex + 1}`, topicId: topic.id, missionId: mission.id, questionId: question.id };
        const fields = question.tipo_interaccion === "completar_espacio" ? [...TEXT_FIELDS.question, "texto_con_hueco"] : TEXT_FIELDS.question;
        fields.forEach((field) => addTextRow(texts, { ...context, scope: "question" }, question, field, project.idioma));
        normalizePairList(question.parejas || []).forEach((pair, pairIndex) => {
          addTextRow(texts, {
            ...context,
            scope: `pair:${pairIndex}`,
            contentLabel: `Pareja ${pairIndex + 1}: pista`
          }, pair, "pista", project.idioma);
        });
        if (experience.get(question.tipo_interaccion)) {
          experienceEditorFields(question).forEach(field => addTextRow(texts, { ...context, scope: 'question', contentLabel: field.label }, question, 'experience.' + field.path, project.idioma));
        } else addResponseRows(responses, context, question, project.idioma);
        addListRows(collections, context, question);
      });
    });
  });

  const workbook = XLSX.utils.book_new();
  workbook.Props = { Title: `Revisión editorial - ${sessionTitle}`, Subject: "Correcciones de una sesión de PigPen", Author: "PigPen Creator", CreatedDate: new Date() };
  const instructions = [
    ["CORRECCIONES EDITORIALES"],
    ["Sesión", sessionTitle],
    ["Estado", status === "published" ? "Publicada" : "Borrador"],
    ["1", "Abre la hoja Textos. Allí encontrarás todo el contenido, incluidas las respuestas."],
    ["2", "Corrige directamente el contenido de la columna Texto."],
    ["3", "Guarda y devuelve este mismo archivo. PigPen comparará los textos y mostrará las diferencias."],
    ["Color amarillo", "Celdas de texto que Editorial puede modificar"]
  ];
  const instructionSheet = XLSX.utils.aoa_to_sheet(instructions);
  instructionSheet["!cols"] = [{ wch: 24 }, { wch: 76 }];
  instructionSheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  XLSX.utils.book_append_sheet(workbook, instructionSheet, "Instrucciones");
  const unifiedRows = makeUnifiedTextRows(texts, responses, collections);
  XLSX.utils.book_append_sheet(workbook, createSheet(XLSX, "TEXTOS Y RESPUESTAS", ["Tema", "Sala / Room", "Pregunta", "Contenido", "Texto"], unifiedRows.map((row) => row.slice(0, 5)), [10, 14, 12, 30, 68], { editableColumns: [4] }), "Textos");
  const mapHeaders = ["row_number", "Referencia", "Tema", "Sala", "Pregunta", "topic_id", "mission_id", "question_id", "editorial_kind", "scope", "field", "Índice", "Acción", "Principal", "Correcta", "snapshot", "original_text"];
  const mapRows = unifiedRows.map((row, index) => [index + 3, ...row.slice(6)]);
  XLSX.utils.book_append_sheet(workbook, createSheet(XLSX, "MAPA INTERNO", mapHeaders, mapRows, mapHeaders.map(() => 18), { hiddenFrom: 0 }), "__map");
  const meta = XLSX.utils.aoa_to_sheet([["key", "value"], ["editorialWorkbookVersion", EDITORIAL_WORKBOOK_VERSION], ["sessionId", sessionId], ["exportedAt", new Date().toISOString()]]);
  XLSX.utils.book_append_sheet(workbook, meta, "__meta");
  workbook.Workbook = workbook.Workbook || {};
  workbook.Workbook.Views = [{ activeTab: 1, firstSheet: 1 }];
  workbook.Workbook.Sheets = workbook.SheetNames.map((name) => ({
    name,
    Hidden: name === "Textos" ? 0 : name.startsWith("__") ? 2 : 1
  }));
  return workbook;
}

function columnNumber(columnName = "") {
  return Array.from(columnName).reduce((total, character) => (total * 26) + character.charCodeAt(0) - 64, 0);
}

function styleEditorialSheetXml(xml, sheetName) {
  const layout = EDITORIAL_SHEET_LAYOUTS[sheetName];
  const withFitToPage = xml.includes("<pageSetUpPr")
    ? xml
    : xml.replace(/(<dimension\b)/, '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>$1');
  const withPrintSetup = withFitToPage.includes("<pageSetup")
    ? withFitToPage
    : withFitToPage.replace(/(<ignoredErrors\b|<extLst\b|<\/worksheet>)/, '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>$1');
  const withView = withPrintSetup.replace(
    /<sheetView\b([^>]*)\/>/,
    (_match, attributes) => `<sheetView${attributes.replace(/\s+showGridLines="[^"]*"/g, "")} showGridLines="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView>`
  );
  return withView.replace(/<c\b([^>]*\br="([A-Z]+)(\d+)"[^>]*)>/g, (match, attributes, column, rawRow) => {
    const row = Number(rawRow);
    let style = 0;
    if (row === 1) style = 1;
    else if (sheetName !== "Instrucciones" && row === 2) style = 2;
    else if (sheetName === "Instrucciones") style = column === "A" ? 7 : 3;
    else if (layout && columnNumber(column) <= layout.visibleThrough) {
      if (layout.editable.has(column)) style = 5;
      else if (layout.choices.has(column)) style = 6;
      else style = row % 2 === 0 ? 4 : 3;
    }
    const cleanAttributes = attributes.replace(/\s+s="\d+"/g, "");
    return `<c${cleanAttributes} s="${style}">`;
  });
}

export async function buildEditorialWorkbookBlob(XLSX, JSZipCtor, workbook, { type = "blob" } = {}) {
  if (!JSZipCtor?.loadAsync) throw new Error("El generador de archivos Excel no está disponible.");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true, cellStyles: true });
  const zip = await JSZipCtor.loadAsync(bytes);
  zip.file("xl/styles.xml", EDITORIAL_STYLES_XML);
  for (let index = 0; index < workbook.SheetNames.length; index += 1) {
    const sheetName = workbook.SheetNames[index];
    if (sheetName.startsWith("__")) continue;
    const path = `xl/worksheets/sheet${index + 1}.xml`;
    const file = zip.file(path);
    if (!file) continue;
    zip.file(path, styleEditorialSheetXml(await file.async("string"), sheetName));
  }
  return zip.generateAsync({
    type,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    compression: "DEFLATE"
  });
}

function rowsFromSheet(XLSX, workbook, name) {
  const sheet = workbook.Sheets?.[name];
  if (!sheet) return null;
  return XLSX.utils.sheet_to_json(sheet, { range: 1, defval: "", raw: false });
}

function buildSheetsFromUnifiedRows(rows) {
  const sheets = { Textos: [], Respuestas: [], Opciones: [], Parejas: [], Secuencias: [] };
  const pairs = new Map();
  const common = (row) => ({
    Aplicar: row.Aplicar,
    Referencia: row.Referencia,
    Tema: row.Tema,
    Sala: row.Sala,
    Pregunta: row.Pregunta,
    topic_id: row.topic_id,
    mission_id: row.mission_id,
    question_id: row.question_id,
    snapshot: row.snapshot
  });

  rows.forEach((row) => {
    const kind = text(row.editorial_kind);
    if (kind === "text") {
      sheets.Textos.push(row);
      return;
    }
    if (kind === "response") {
      sheets.Respuestas.push({
        ...common(row),
        "Respuesta actual": row["Texto actual"],
        "Respuesta corregida": row["Texto corregido"],
        Principal: row.Principal,
        Acción: row.Acción || "Conservar",
        Índice: row.Índice,
        kind: row.scope
      });
      return;
    }
    if (kind === "option") {
      sheets.Opciones.push({
        ...common(row),
        "Opción actual": row["Texto actual"],
        "Opción corregida": row["Texto corregido"],
        Correcta: row.Correcta,
        Acción: row.Acción || "Conservar",
        Índice: row.Índice
      });
      return;
    }
    if (kind === "sequence") {
      const order = Number(row.Índice) + 1;
      sheets.Secuencias.push({
        ...common(row),
        "Orden actual": order,
        "Paso actual": row["Texto actual"],
        "Orden corregido": order,
        "Paso corregido": row["Texto corregido"],
        Acción: row.Acción || "Conservar",
        Índice: row.Índice
      });
      return;
    }
    if (kind !== "pair") return;
    const pairKey = `${row.topic_id}::${row.mission_id}::${row.question_id}::${row.Índice}`;
    const pair = pairs.get(pairKey) || { ...common(row), Acción: row.Acción || "Conservar", Índice: row.Índice };
    if (wantsApply(row.Aplicar)) pair.Aplicar = "Sí";
    if (row.scope === "left") {
      pair["Izquierda actual"] = row["Texto actual"];
      pair["Izquierda corregida"] = row["Texto corregido"];
    } else if (row.scope === "right") {
      pair["Derecha actual"] = row["Texto actual"];
      pair["Derecha corregida"] = row["Texto corregido"];
    }
    pairs.set(pairKey, pair);
  });
  sheets.Parejas.push(...pairs.values());
  return sheets;
}

export function readEditorialWorkbook(XLSX, data) {
  if (!XLSX?.read) throw new Error("XLSX no está disponible.");
  const workbook = XLSX.read(data, { type: "array", cellFormula: true });
  const baseRequired = ["Textos", "__meta"];
  const missingBase = baseRequired.filter((name) => !workbook.Sheets?.[name]);
  if (missingBase.length) throw new Error(`El archivo no contiene las hojas requeridas: ${missingBase.join(", ")}.`);
  const metaRows = XLSX.utils.sheet_to_json(workbook.Sheets.__meta, { header: 1, defval: "" });
  const meta = Object.fromEntries(metaRows.slice(1).map((row) => [text(row[0]), row[1]]));
  const version = Number(meta.editorialWorkbookVersion);
  if (!SUPPORTED_EDITORIAL_WORKBOOK_VERSIONS.has(version)) throw new Error("La versión del archivo editorial no es compatible.");
  const legacySheetNames = ["Textos", "Respuestas", "Opciones", "Parejas", "Secuencias"];
  if (version === 1) {
    const missingLegacy = legacySheetNames.filter((name) => !workbook.Sheets?.[name]);
    if (missingLegacy.length) throw new Error(`El archivo no contiene las hojas requeridas: ${missingLegacy.join(", ")}.`);
  }
  if (version >= 4 && !workbook.Sheets?.__map) throw new Error("El archivo no contiene el mapa interno requerido.");
  const sourceSheetNames = version === 1 ? legacySheetNames : version >= 4 ? ["Textos", "__map"] : ["Textos"];
  const sourceSheets = Object.fromEntries(sourceSheetNames.map((name) => [name, rowsFromSheet(XLSX, workbook, name)]));
  for (const [name, rows] of Object.entries(sourceSheets)) {
    if (!Array.isArray(rows) || rows.length > 10000) throw new Error(`La hoja ${name} excede el límite permitido.`);
    if (Object.values(workbook.Sheets[name] || {}).some((cell) => cell && typeof cell === "object" && text(cell.f).trim())) {
      throw new Error(`La hoja ${name} contiene fórmulas no permitidas.`);
    }
  }
  let unifiedSourceRows = sourceSheets.Textos;
  if (version >= 4) {
    const mapByRow = new Map(sourceSheets.__map.map((row) => [Number(row.row_number), row]));
    unifiedSourceRows = sourceSheets.Textos.map((row, index) => {
      const mapping = mapByRow.get(index + 3);
      if (!mapping) throw new Error(`No se encontró el vínculo interno de la fila ${index + 3}.`);
      return { ...row, ...mapping };
    });
  }
  const sheets = version === 1
    ? sourceSheets
    : buildSheetsFromUnifiedRows(unifiedSourceRows.map((row) => {
        if (version === 2) {
          return {
            ...row,
            Aplicar: text(row["Texto corregido"]).trim() ? "Sí" : "No"
          };
        }
        const original = text(row.original_text);
        const proposed = text(row.Texto);
        return {
          ...row,
          "Texto actual": original,
          "Texto corregido": proposed,
          Aplicar: proposed !== original ? "Sí" : "No"
        };
      }));
  return { meta, sheets };
}

function findTarget(topics, row) {
  const referenceMatch = text(row.Referencia).match(/^T(\d+)(?:-S(\d+))?(?:-P(\d+))?/i);
  const topicNumber = Number(referenceMatch?.[1]);
  const missionNumber = Number(referenceMatch?.[2]);
  const questionNumber = Number(referenceMatch?.[3]);
  const topic = topics.find((item) => text(row.topic_id) && item.id === text(row.topic_id))
    || topics.find((item) => topicNumber > 0 && Number(item.academicNumber) === topicNumber)
    || (topicNumber > 0 ? topics[topicNumber - 1] : null);
  if (!topic?.project) return null;
  const mission = topic.project.misiones?.find((item) => text(row.mission_id) && item.id === text(row.mission_id))
    || (missionNumber > 0 ? topic.project.misiones?.[missionNumber - 1] : null);
  const question = mission?.preguntas?.find((item) => text(row.question_id) && item.id === text(row.question_id))
    || (questionNumber > 0 ? mission?.preguntas?.[questionNumber - 1] : null);
  return { topic, project: topic.project, mission, question };
}

function addChange(changes, row, before, after, field, topicId = "") {
  changes.push({
    reference: text(row.Referencia),
    topic: text(row.Tema),
    topicId: text(topicId || row.topic_id),
    mission: text(row.Sala),
    question: text(row.Pregunta),
    field,
    before: text(before),
    after: text(after)
  });
}

function groupAppliedRows(rows) {
  const groups = new Map();
  rows.filter((row) => wantsApply(row.Aplicar)).forEach((row) => {
    const groupKey = `${row.topic_id}::${row.mission_id}::${row.question_id}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(row);
  });
  return groups;
}

export function previewEditorialImport(document, { sessionId, topics = [] } = {}) {
  const errors = [];
  const conflicts = [];
  const changes = [];
  if (!document?.meta || (text(document.meta.sessionId).trim() && text(document.meta.sessionId) !== text(sessionId))) errors.push("El archivo pertenece a otra sesión.");
  const nextTopics = clone(topics);

  for (const row of document?.sheets?.Textos || []) {
    if (!wantsApply(row.Aplicar)) continue;
    const target = findTarget(nextTopics, row);
    const pairMatch = text(row.scope).match(/^pair:(\d+)$/);
    const holder = row.scope === "project"
      ? target?.project
      : row.scope === "mission"
        ? target?.mission
        : row.scope === "question"
          ? target?.question
          : pairMatch
            ? target?.question?.parejas?.[Number(pairMatch[1])]
            : null;
    if (!holder || (!LABELS[row.field] && !(row.scope === 'question' && row.field.startsWith('experience.') && experienceEditorFields(holder).some(f=>f.path===row.field.slice(11))))) { errors.push(`${row.Referencia || "Fila de texto"}: referencia o campo inválido.`); continue; }
    const current = projectFieldValue(holder, row.field, target?.project?.idioma);
    const snapshot = text(row.snapshot);
    const proposed = text(row["Texto corregido"]);
    if (current !== snapshot && current !== proposed) { conflicts.push(`${row.Referencia} · ${LABELS[row.field]} cambió después de la exportación.`); continue; }
    if (current === proposed) continue;
    if (row.field.startsWith('experience.')) {
      try { updateExperienceEditor(holder, row.field.slice(11), proposed); holder.content_revision = (Number(holder.content_revision) || 0) + 1; }
      catch (error) { errors.push(`${row.Referencia}: ${error.message}`); continue; }
    } else if (row.field === "datos_clave") {
      holder[row.field] = normalizeTextList(proposed);
    } else if (row.field.startsWith("media.")) {
      const mediaField = row.field.slice(6);
      holder.media = { ...(holder.media || {}), [mediaField]: proposed };
    } else {
      holder[row.field] = proposed;
    }
    addChange(changes, row, current, proposed, LABELS[row.field], target.topic.id);
  }

  const processLists = (sheetName, field, buildValue, label) => {
    for (const rows of groupAppliedRows(document?.sheets?.[sheetName] || []).values()) {
      const target = findTarget(nextTopics, rows[0]);
      const question = target?.question;
      if (!question) { errors.push(`${rows[0].Referencia}: pregunta no encontrada.`); continue; }
      const current = field === "parejas"
        ? normalizePairList(question[field] || [])
        : field === "elementos"
          ? normalizeSequenceItems(question[field] || [])
          : normalizeTextList(question[field] || []);
      let snapshot;
      try { snapshot = JSON.parse(text(rows[0].snapshot)); } catch (_) { errors.push(`${rows[0].Referencia}: snapshot inválido.`); continue; }
      const comparableCurrent = field === "parejas"
        ? current.map((pair) => ({ izquierda: pair.izquierda, derecha: pair.derecha }))
        : current;
      const comparableSnapshot = field === "parejas"
        ? normalizePairList(snapshot).map((pair) => ({ izquierda: pair.izquierda, derecha: pair.derecha }))
        : snapshot;
      if (stableJson(comparableCurrent) !== stableJson(comparableSnapshot)) { conflicts.push(`${rows[0].Referencia} · ${label} cambió después de la exportación.`); continue; }
      const next = buildValue(rows, current, question, errors);
      if (!next) continue;
      if (stableJson(current) === stableJson(next.value)) continue;
      question[field] = next.value;
      if (next.correct !== undefined) {
        question.respuesta_correcta = next.correct;
        question.respuestas_aceptadas = next.correct === "" ? [] : [next.correct];
      }
      addChange(changes, rows[0], stableJson(current), stableJson(next.value), label, target.topic.id);
    }
  };

  processLists("Opciones", "opciones", (rows, current, question, listErrors) => {
    const next = [...current];
    let correct = text(question.respuesta_correcta);
    const markedCorrect = rows.filter((row) => wantsApply(row.Correcta));
    if (markedCorrect.length > 1) listErrors.push(`${rows[0].Referencia}: marca solamente una opción como correcta.`);
    rows.forEach((row) => {
      const index = parseIndex(row["Índice"]);
      const proposed = text(row["Opción corregida"]).trim() || text(row["Opción actual"]).trim();
      if (isAdd(row["Acción"]) && index == null) { if (proposed) next.push(proposed); }
      else if (index != null && index < next.length) {
        if (isDelete(row["Acción"])) next[index] = null;
        else next[index] = proposed;
      }
      if (wantsApply(row.Correcta)) correct = proposed;
    });
    const clean = next.filter(Boolean);
    if (question.tipo_interaccion === 'completar_espacio' && question.interaction_contract_version === 2) {
      const values = clean.map(value => value.trim().toLocaleLowerCase());
      if (new Set(values).size !== values.length || values.some(value => (question.parejas || []).some(pair => pair.derecha.trim().toLocaleLowerCase() === value))) listErrors.push(`${rows[0].Referencia}: los distractores deben ser distintos y no duplicar soluciones.`);
      return { value: clean };
    }
    if (clean.length < 2) listErrors.push(`${rows[0].Referencia}: una opción múltiple necesita al menos dos opciones.`);
    if (!clean.includes(correct)) listErrors.push(`${rows[0].Referencia}: selecciona exactamente una opción correcta válida.`);
    return { value: clean, correct };
  }, "Opciones");

  processLists("Parejas", "parejas", (rows, current, question, listErrors) => {
    const next = clone(current);
    rows.forEach((row) => {
      const index = parseIndex(row["Índice"]);
      const pair = {
        izquierda: text(row["Izquierda corregida"]).trim() || text(row["Izquierda actual"]).trim(),
        derecha: text(row["Derecha corregida"]).trim() || text(row["Derecha actual"]).trim(),
        ...(index != null && next[index]?.pista ? { pista: next[index].pista } : {})
      };
      if (isAdd(row["Acción"]) && index == null) { if (pair.izquierda && pair.derecha) next.push(pair); }
      else if (index != null && index < next.length) next[index] = isDelete(row["Acción"]) ? null : pair;
    });
    const clean = normalizePairList(next.filter(Boolean));
    if (question.tipo_interaccion === 'completar_espacio' && question.interaction_contract_version === 2) {
      const count = (String(question.texto_con_hueco || '').match(/___/g) || []).length;
      if (!count || clean.length !== count || clean.some((pair, index) => pair.izquierda !== String(index + 1))) listErrors.push(`${rows[0].Referencia}: debe haber una palabra por hueco, numerada consecutivamente desde 1.`);
    } else if (clean.length < 2 || clean.length > 6) listErrors.push(`${rows[0].Referencia}: se requieren entre 2 y 6 parejas.`);
    return { value: clean };
  }, "Parejas");

  processLists("Secuencias", "elementos", (rows, current, _question, listErrors) => {
    const entries = current.map((value, index) => ({ value, order: index + 1 }));
    rows.forEach((row) => {
      const index = parseIndex(row["Índice"]);
      const entry = {
        value: text(row["Paso corregido"]).trim() || text(row["Paso actual"]).trim(),
        order: Number(row["Orden corregido"]) || Number(row["Orden actual"]) || 999
      };
      if (isAdd(row["Acción"]) && index == null) { if (entry.value) entries.push(entry); }
      else if (index != null && index < entries.length) entries[index] = isDelete(row["Acción"]) ? null : entry;
    });
    const clean = normalizeSequenceItems(entries.filter(Boolean).sort((a, b) => a.order - b.order).map((entry) => entry.value));
    if (clean.length < 3 || clean.length > 6) listErrors.push(`${rows[0].Referencia}: se requieren entre 3 y 6 pasos únicos.`);
    return { value: clean, correct: "" };
  }, "Secuencia");

  for (const rows of groupAppliedRows(document?.sheets?.Respuestas || []).values()) {
    const target = findTarget(nextTopics, rows[0]);
    const question = target?.question;
    if (!question) { errors.push(`${rows[0].Referencia}: pregunta no encontrada.`); continue; }
    if (rows[0].kind === "boolean") {
      const current = question.respuesta_correcta === true;
      let snapshot;
      try { snapshot = JSON.parse(text(rows[0].snapshot)); } catch (_) { errors.push(`${rows[0].Referencia}: snapshot inválido.`); continue; }
      if (current !== snapshot) { conflicts.push(`${rows[0].Referencia} · Respuesta cambió después de la exportación.`); continue; }
      const proposedText = text(rows[0]["Respuesta corregida"]).trim() || text(rows[0]["Respuesta actual"]).trim();
      const proposed = /^(verdadero|true|vrai|verdadeiro|1)$/i.test(proposedText);
      if (current !== proposed) { question.respuesta_correcta = proposed; question.respuestas_aceptadas = []; addChange(changes, rows[0], current ? "Verdadero" : "Falso", proposed ? "Verdadero" : "Falso", "Respuesta correcta", target.topic.id); }
      continue;
    }
    const current = normalizeAcceptedAnswers([
      question.respuesta_correcta,
      ...(Array.isArray(question.respuestas_aceptadas) ? question.respuestas_aceptadas : [question.respuestas_aceptadas])
    ]);
    let snapshot;
    try { snapshot = JSON.parse(text(rows[0].snapshot)); } catch (_) { errors.push(`${rows[0].Referencia}: snapshot inválido.`); continue; }
    if (stableJson(current) !== stableJson(snapshot)) { conflicts.push(`${rows[0].Referencia} · Respuestas cambiaron después de la exportación.`); continue; }
    const next = [...current];
    let primary = text(question.respuesta_correcta);
    rows.forEach((row) => {
      const index = parseIndex(row["Índice"]);
      const proposed = text(row["Respuesta corregida"]).trim() || text(row["Respuesta actual"]).trim();
      if (isAdd(row["Acción"]) && index == null) { if (proposed) next.push(proposed); }
      else if (index != null && index < next.length) next[index] = isDelete(row["Acción"]) ? null : proposed;
      if (wantsApply(row.Principal)) primary = proposed;
    });
    const clean = normalizeAcceptedAnswers(next.filter(Boolean));
    const normalizedPrimary = normalizeAcceptedAnswers(primary)[0] || "";
    if (!clean.length || !normalizedPrimary || !clean.includes(normalizedPrimary)) errors.push(`${rows[0].Referencia}: define una respuesta principal incluida en las respuestas aceptadas.`);
    if (stableJson(current) !== stableJson(clean) || key(question.respuesta_correcta) !== key(primary)) {
      question.respuestas_aceptadas = clean;
      question.respuesta_correcta = primary;
      addChange(changes, rows[0], stableJson(current), stableJson(clean), "Respuestas aceptadas", target.topic.id);
    }
  }

  nextTopics.forEach(topic => (topic.project?.misiones || []).forEach(mission => (mission.preguntas || []).forEach(question => {
    if (experience.get(question.tipo_interaccion)) errors.push(...experience.structuralIssues(question.tipo_interaccion, question.interaction_data).map(issue => `${mission.titulo} / ${question.titulo}: ${issue}`));
  })));
  const changedTopicIds = [...new Set(changes.map((change) => text(change.topicId)).filter(Boolean))];
  return { errors: [...new Set(errors)], conflicts: [...new Set(conflicts)], changes, changedTopicIds, nextTopics };
}
