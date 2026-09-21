const JSZip = require("jszip");
const PDFDocument = require("pdfkit");
const { parse } = require("node-html-parser");
const {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} = require("docx");

const MIME_TYPES = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  idml: "application/vnd.adobe.indesign-idml-package"
};

function clean(value = "") {
  return String(value || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function safeName(value = "") {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "contenido-charly-brown";
}

function compactAcademicNumber(value = "", fallback = "X") {
  const normalized = clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const words = { primero: "1", primer: "1", segundo: "2", tercero: "3", tercer: "3", cuarto: "4", quinto: "5", sexto: "6" };
  return normalized.match(/\d+/)?.[0] || words[normalized] || fallback;
}

function buildExportBaseName(session = {}) {
  const academic = session.academicMeta || session.meta || {};
  const units = Array.isArray(session.units) ? session.units : [];
  const activeUnit = units.find((unit) => unit.id === session.activeUnitId) || units[0] || {};
  const level = safeName(academic.level || "Nivel");
  const grade = compactAcademicNumber(academic.grade);
  const trimester = compactAcademicNumber(academic.trimester);
  const unit = compactAcademicNumber(activeUnit.meta?.unit || session.meta?.unit);
  return `${level}_nv${grade}_trim${trimester}_U${unit}`;
}

function escapeXml(value = "") {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
}

function inlineRuns(node, style = {}) {
  if (!node) return [];
  if (node.nodeType === 3) return clean(node.rawText) ? [{ text: node.rawText.replace(/\s+/g, " "), ...style }] : [];
  const tag = String(node.tagName || "").toLowerCase();
  if (tag === "br") return [{ text: "\n", ...style }];
  const next = {
    ...style,
    bold: style.bold || ["strong", "b"].includes(tag),
    italics: style.italics || ["em", "i"].includes(tag),
    superscript: style.superscript || tag === "sup",
    subscript: style.subscript || tag === "sub",
    underline: style.underline || tag === "u"
  };
  return (node.childNodes || []).flatMap((child) => inlineRuns(child, next));
}

function htmlBlocks(html = "") {
  const root = parse(`<div>${String(html || "")}</div>`).firstChild;
  const blocks = [];
  const walk = (node) => {
    if (!node || node.nodeType === 3) return;
    const tag = String(node.tagName || "").toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      blocks.push({ type: "heading", level: Number(tag.slice(1)), runs: inlineRuns(node), text: clean(node.text) });
      return;
    }
    if (tag === "p" || tag === "blockquote") {
      const text = clean(node.text);
      const classes = String(node.getAttribute?.("class") || "").toLowerCase();
      const type = node.classList?.contains("answer") || /respuesta|solucionario/.test(classes) || /^respuesta(?: esperada)?\s*:/i.test(text)
        ? "answer"
        : /subinstruccion|sub-instruction/.test(classes)
          ? "subinstruction"
          : tag === "blockquote" || /instruccion|instruction/.test(classes) || /^instrucci[oó]n\s*:/i.test(text)
            ? "instruction"
            : "paragraph";
      if (text) blocks.push({ type, runs: inlineRuns(node), text });
      return;
    }
    if (tag === "ul" || tag === "ol") {
      const items = node.childNodes.filter((child) => String(child.tagName || "").toLowerCase() === "li").map((item) => ({ runs: inlineRuns(item), text: clean(item.text) })).filter((item) => item.text);
      if (items.length) blocks.push({ type: "list", ordered: tag === "ol", items });
      return;
    }
    if (tag === "table") {
      const rows = node.querySelectorAll("tr").map((row) => row.querySelectorAll("th,td").map((cell) => ({ text: clean(cell.text), header: String(cell.tagName || "").toLowerCase() === "th" })));
      if (rows.length) blocks.push({ type: "table", rows });
      return;
    }
    if (tag === "hr") {
      blocks.push({ type: "break" });
      return;
    }
    const children = node.childNodes || [];
    if (!children.some((child) => child.nodeType !== 3)) {
      const text = clean(node.text);
      if (text) blocks.push({ type: node.classList?.contains("answer") ? "answer" : "paragraph", runs: inlineRuns(node), text });
      return;
    }
    children.forEach(walk);
  };
  (root?.childNodes || []).forEach(walk);
  return blocks;
}

function addHtmlSection(sections, label, title, html, extra = {}) {
  if (!clean(parse(String(html || "")).text)) return;
  sections.push({ label, title: clean(title || label), blocks: htmlBlocks(html), ...extra });
}

function collectApprovedDocument(session = {}, { documentKind = "student" } = {}) {
  const sections = [];
  const academic = session.academicMeta || session.meta || {};
  const teacherNotesOnly = documentKind === "teacher-notes";
  for (const [index, unit] of (Array.isArray(session.units) ? session.units : []).entries()) {
    const accepted = unit.accepted || {};
    const unitTitle = clean(unit.title || `Unidad ${unit.meta?.unit || index + 1}`);
    const unitLabel = `Unidad ${unit.meta?.unit || index + 1}`;
    const reading = accepted.reading;
    if (!teacherNotesOnly && reading) {
      const readingHtml = reading.sections?.narrativeHtml || reading.html || "";
      addHtmlSection(sections, unitLabel, `${unitTitle} · Lectura`, readingHtml, { unitTitle, kind: "reading" });
      const synonyms = reading.sections?.synonyms;
      if (Array.isArray(synonyms) && synonyms.length) {
        sections.push({ label: unitLabel, title: "Tabla de sinónimos", unitTitle, kind: "reading", blocks: [{ type: "table", rows: [[{ text: "Palabra", header: true }, { text: "Sinónimo", header: true }], ...synonyms.map((row) => [{ text: clean(row.word || row.palabra) }, { text: clean(row.synonym || row.sinonimo) }])] }] });
      } else if (reading.sections?.synonymsHtml) addHtmlSection(sections, unitLabel, "Tabla de sinónimos", reading.sections.synonymsHtml, { unitTitle, kind: "reading" });
      const questions = Array.isArray(reading.sections?.questions) ? reading.sections.questions : reading.questions;
      if (Array.isArray(questions) && questions.length) {
        sections.push({ label: unitLabel, title: "Preguntas de comprensión", unitTitle, kind: "reading", blocks: [{ type: "list", ordered: true, items: questions.map((item) => ({ text: clean(item.question || item.text || item), runs: [{ text: clean(item.question || item.text || item) }] })) }] });
      } else if (reading.sections?.questionsHtml) addHtmlSection(sections, unitLabel, "Preguntas de comprensión", reading.sections.questionsHtml, { unitTitle, kind: "reading" });
    }
    for (const activity of (accepted.activities || [])) {
      if (!teacherNotesOnly) addHtmlSection(sections, unitLabel, activity.section || activity.category || activity.title || "Actividad", activity.html, { unitTitle, kind: "activity" });
      if (teacherNotesOnly) for (const note of (activity.notes || [])) addHtmlSection(sections, unitLabel, `${activity.section || activity.title || "Actividad"} · Notas`, note.html || note.text || note, { unitTitle, kind: "notes" });
    }
    for (const resource of (accepted.resources || [])) {
      if (!teacherNotesOnly) addHtmlSection(sections, unitLabel, resource.code || resource.title || resource.type || "Recurso", resource.html, { unitTitle, kind: "resource" });
      if (teacherNotesOnly) for (const note of (resource.notes || [])) addHtmlSection(sections, unitLabel, `${resource.code || resource.title || resource.type || "Recurso"} · Notas`, note.html || note.text || note, { unitTitle, kind: "notes" });
    }
    if (teacherNotesOnly) for (const note of (accepted.teacherNotes || [])) addHtmlSection(sections, unitLabel, note.title || "Notas globales del maestro", note.html || note.text, { unitTitle, kind: "notes" });
  }
  const baseTitle = clean(session.title || "Contenido Charly Brown");
  return {
    title: teacherNotesOnly ? `${baseTitle} · Notas del maestro` : baseTitle,
    subtitle: clean([academic.level, academic.grade, academic.trimester ? `Trimestre ${academic.trimester}` : ""].filter(Boolean).join(" · ")),
    sections,
    documentKind: teacherNotesOnly ? "teacher-notes" : "student"
  };
}

function wordRuns(runs = [], fallback = "") {
  const source = runs.length ? runs : [{ text: fallback }];
  return source.filter((run) => run.text).map((run) => new TextRun({
    text: run.text,
    bold: Boolean(run.bold),
    italics: Boolean(run.italics),
    superScript: Boolean(run.superscript),
    subScript: Boolean(run.subscript),
    underline: run.underline ? {} : undefined
  }));
}

function wordBlock(block, listIndex) {
  if (block.type === "table") {
    const columnCount = Math.max(1, ...block.rows.map((row) => row.length));
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: block.rows.map((row) => new TableRow({ children: Array.from({ length: columnCount }, (_, index) => {
        const cell = row[index] || { text: "" };
        return new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cell.text, bold: Boolean(cell.header) })] })], shading: cell.header ? { fill: "EAF2FF" } : undefined });
      }) })),
      borders: { top: { style: BorderStyle.SINGLE, size: 2, color: "CBD5E1" }, bottom: { style: BorderStyle.SINGLE, size: 2, color: "CBD5E1" }, left: { style: BorderStyle.SINGLE, size: 2, color: "CBD5E1" }, right: { style: BorderStyle.SINGLE, size: 2, color: "CBD5E1" }, insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" }, insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" } }
    });
  }
  if (block.type === "list") return block.items.map((item) => new Paragraph({ children: wordRuns(item.runs, item.text), style: block.ordered ? "ListaNumerada" : "ListaVinetas", numbering: block.ordered ? { reference: "cb-numbering", level: 0, instance: listIndex } : undefined, bullet: block.ordered ? undefined : { level: 0 } }));
  if (block.type === "break") return new Paragraph({ text: "" });
  const style = block.type === "instruction" ? "Instruccion" : block.type === "subinstruction" ? "Subinstruccion" : block.type === "answer" ? "Respuesta" : block.type === "heading" ? (block.level <= 2 ? "Encabezado1" : "Encabezado2") : "Normal";
  return new Paragraph({ children: wordRuns(block.runs, block.text), style, heading: block.type === "heading" ? (block.level <= 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3) : undefined });
}

async function buildDocx(documentData) {
  const children = [
    new Paragraph({ text: documentData.title, style: "Titulo", alignment: AlignmentType.LEFT }),
    ...(documentData.subtitle ? [new Paragraph({ text: documentData.subtitle, style: "Subtitulo" })] : [])
  ];
  let currentUnit = "";
  let listIndex = 1;
  for (const section of documentData.sections) {
    if (section.unitTitle !== currentUnit) {
      currentUnit = section.unitTitle;
      children.push(new Paragraph({ text: currentUnit, style: "Encabezado1", heading: HeadingLevel.HEADING_1, pageBreakBefore: children.length > 2 }));
    }
    children.push(new Paragraph({ text: section.title, style: "Encabezado2", heading: HeadingLevel.HEADING_2 }));
    for (const block of section.blocks) {
      const output = wordBlock(block, listIndex++);
      if (Array.isArray(output)) children.push(...output); else children.push(output);
    }
  }
  const doc = new Document({
    creator: "Charly Brown",
    title: documentData.title,
    styles: {
      default: { document: { run: { font: "Aptos", size: 21, color: "172033" }, paragraph: { spacing: { after: 120, line: 276 } } } },
      paragraphStyles: [
        { id: "Titulo", name: "Título", basedOn: "Normal", next: "Subtitulo", run: { font: "Aptos Display", size: 34, bold: true, color: "102A56" }, paragraph: { spacing: { after: 120 } } },
        { id: "Subtitulo", name: "Subtítulo", basedOn: "Normal", next: "Normal", run: { size: 22, color: "52627A" }, paragraph: { spacing: { after: 280 } } },
        { id: "Encabezado1", name: "Encabezado 1", basedOn: "Normal", next: "Normal", run: { size: 28, bold: true, color: "102A56" }, paragraph: { spacing: { before: 240, after: 100 } } },
        { id: "Encabezado2", name: "Encabezado 2", basedOn: "Normal", next: "Normal", run: { size: 24, bold: true, color: "1D4ED8" }, paragraph: { spacing: { before: 180, after: 80 } } },
        { id: "Instruccion", name: "Instrucción", basedOn: "Normal", next: "Normal", run: { italics: true, color: "334155" }, paragraph: { indent: { left: 360 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: "38BDF8", space: 8 } } } },
        { id: "Subinstruccion", name: "Subinstrucción", basedOn: "Normal", next: "Normal", run: { color: "334155" }, paragraph: { indent: { left: 420, hanging: 220 }, spacing: { after: 80 } } },
        { id: "Respuesta", name: "Respuesta esperada", basedOn: "Normal", next: "Normal", run: { italics: true, color: "C026D3" } },
        { id: "ListaNumerada", name: "Lista numerada", basedOn: "Normal", next: "Normal", paragraph: { indent: { left: 420, hanging: 220 } } },
        { id: "ListaVinetas", name: "Lista con viñetas", basedOn: "Normal", next: "Normal", paragraph: { indent: { left: 420, hanging: 220 } } }
      ],
      characterStyles: [
        { id: "Negrita", name: "Negrita", run: { bold: true } },
        { id: "Cursiva", name: "Cursiva", run: { italics: true } },
        { id: "Superindice", name: "Superíndice", run: { superScript: true } },
        { id: "Subindice", name: "Subíndice", run: { subScript: true } }
      ]
    },
    numbering: { config: [{ reference: "cb-numbering", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.START, style: { paragraph: { indent: { left: 420, hanging: 220 } } } }] }] },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } }, children }]
  });
  return Packer.toBuffer(doc);
}

function writePdfBlock(pdf, block) {
  if (block.type === "table") {
    const widths = block.rows.reduce((max, row) => Math.max(max, row.length), 1);
    const columnWidth = (pdf.page.width - pdf.page.margins.left - pdf.page.margins.right) / widths;
    block.rows.forEach((row) => {
      const y = pdf.y;
      const heights = row.map((cell) => pdf.heightOfString(cell.text, { width: columnWidth - 12 }) + 12);
      const height = Math.max(28, ...heights);
      row.forEach((cell, index) => {
        const x = pdf.page.margins.left + index * columnWidth;
        pdf.save().fillColor(cell.header ? "#eaf2ff" : "#ffffff").rect(x, y, columnWidth, height).fill().strokeColor("#cbd5e1").rect(x, y, columnWidth, height).stroke().restore();
        pdf.fillColor("#172033").font(cell.header ? "Helvetica-Bold" : "Helvetica").fontSize(9).text(cell.text, x + 6, y + 6, { width: columnWidth - 12, height: height - 12 });
      });
      pdf.y = y + height;
    });
    pdf.moveDown(0.6);
    return;
  }
  if (block.type === "list") {
    block.items.forEach((item, index) => pdf.font("Helvetica").fontSize(10.5).fillColor("#172033").text(`${block.ordered ? `${index + 1}.` : "•"} ${item.text}`, { indent: 18, paragraphGap: 4 }));
    return;
  }
  if (block.type === "break") return void pdf.moveDown(0.6);
  if (block.type === "heading") pdf.font("Helvetica-Bold").fontSize(block.level <= 2 ? 14 : 12).fillColor("#102a56").text(block.text, { paragraphGap: 6 });
  else if (block.type === "answer") pdf.font("Helvetica-Oblique").fontSize(10.5).fillColor("#c026d3").text(block.text, { paragraphGap: 6 });
  else if (block.type === "instruction") pdf.font("Helvetica-Oblique").fontSize(10.5).fillColor("#334155").text(block.text, { indent: 14, paragraphGap: 6 });
  else pdf.font("Helvetica").fontSize(10.5).fillColor("#172033").text(block.text, { paragraphGap: 6, lineGap: 2 });
}

async function buildPdf(documentData) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const pdf = new PDFDocument({ size: "LETTER", margins: { top: 54, right: 54, bottom: 58, left: 54 }, info: { Title: documentData.title, Author: "Charly Brown" }, bufferPages: true });
    pdf.on("data", (chunk) => chunks.push(chunk));
    pdf.on("error", reject);
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.font("Helvetica-Bold").fontSize(22).fillColor("#102a56").text(documentData.title);
    if (documentData.subtitle) pdf.moveDown(0.25).font("Helvetica").fontSize(11).fillColor("#52627a").text(documentData.subtitle);
    let currentUnit = "";
    for (const section of documentData.sections) {
      if (section.unitTitle !== currentUnit) {
        currentUnit = section.unitTitle;
        if (pdf.y > 150) pdf.addPage();
        pdf.font("Helvetica-Bold").fontSize(18).fillColor("#102a56").text(currentUnit, { paragraphGap: 8 });
      }
      pdf.font("Helvetica-Bold").fontSize(13).fillColor("#1d4ed8").text(section.title, { paragraphGap: 6 });
      section.blocks.forEach((block) => writePdfBlock(pdf, block));
      pdf.moveDown(0.5);
    }
    const range = pdf.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index++) {
      pdf.switchToPage(index);
      pdf.font("Helvetica").fontSize(8).fillColor("#64748b").text(`${index + 1} / ${range.count}`, 54, pdf.page.height - 38, { width: pdf.page.width - 108, align: "right" });
    }
    pdf.end();
  });
}

function idmlCharacterRanges(runs = [], fallback = "") {
  const source = runs.length ? runs : [{ text: fallback }];
  return source.filter((run) => run.text).map((run) => {
    const style = run.superscript ? "SUPERINDICE" : run.subscript ? "SUBINDICE" : run.underline ? "SUBRAYADO" : run.bold && run.italics ? "BOLD ITALIC" : run.bold ? "BOLD" : run.italics ? "ITALIC" : "Normal";
    return `<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/${style}"><Content>${escapeXml(run.text)}</Content></CharacterStyleRange>`;
  }).join("");
}

function idmlParagraph(style, runs, text) {
  return `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/${style}">${idmlCharacterRanges(runs, text)}<Br/></ParagraphStyleRange>`;
}

function idmlTable(rows = [], tableIndex = 0) {
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const hasHeader = rows[0]?.some((cell) => cell.header);
  const tableId = `uTable${tableIndex}`;
  const columns = Array.from({ length: columnCount }, (_, index) => `<Column Self="${tableId}Column${index}" Name="${index}" SingleColumnWidth="${Math.floor(487 / columnCount)}"/>`).join("");
  const rowNodes = rows.map((_, index) => `<Row Self="${tableId}Row${index}" Name="${index}" MinimumHeight="18"/>`).join("");
  const cells = rows.flatMap((row, rowIndex) => Array.from({ length: columnCount }, (_, columnIndex) => {
    const cell = row[columnIndex] || { text: "", header: false };
    const header = Boolean(cell.header || (hasHeader && rowIndex === 0));
    return `<Cell Self="${tableId}Cell${rowIndex}_${columnIndex}" Name="${columnIndex}:${rowIndex}" RowSpan="1" ColumnSpan="1" CellType="TextTypeCell" AppliedCellStyle="CellStyle/${header ? "TABLA TITULO" : "TABLA CUERPO"}" TextTopInset="4" TextLeftInset="4" TextBottomInset="4" TextRightInset="4" VerticalJustification="CenterAlign"><ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/${header ? "TABLAS TITULO" : "TABLAS CUERPO"}"><CharacterStyleRange AppliedCharacterStyle="CharacterStyle/${header ? "BOLD" : "Normal"}"><Content>${escapeXml(cell.text)}</Content></CharacterStyleRange></ParagraphStyleRange></Cell>`;
  })).join("");
  return `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/$ID/NormalParagraphStyle"><CharacterStyleRange AppliedCharacterStyle="CharacterStyle/Normal"><Table Self="${tableId}" HeaderRowCount="${hasHeader ? 1 : 0}" FooterRowCount="0" BodyRowCount="${Math.max(0, rows.length - (hasHeader ? 1 : 0))}" ColumnCount="${columnCount}" AppliedTableStyle="TableStyle/TABLA EDITORIAL" TableDirection="LeftToRightDirection">${rowNodes}${columns}${cells}</Table><Br/></CharacterStyleRange></ParagraphStyleRange>`;
}

function idmlStory(documentData) {
  let tableIndex = 0;
  let xml = idmlParagraph("TITULO LIBRO", [{ text: documentData.title }], documentData.title);
  if (documentData.subtitle) xml += idmlParagraph("SUBTITULO", [{ text: documentData.subtitle }], documentData.subtitle);
  let currentUnit = "";
  for (const section of documentData.sections) {
    if (section.unitTitle !== currentUnit) {
      currentUnit = section.unitTitle;
      xml += idmlParagraph("TITULO", [{ text: currentUnit }], currentUnit);
    }
    xml += idmlParagraph(documentData.documentKind === "teacher-notes" ? "NOTAS DEL MAESTRO" : "TITULO SECCION", [{ text: section.title }], section.title);
    for (const block of section.blocks) {
      if (block.type === "table") {
        xml += idmlTable(block.rows, tableIndex++);
      } else if (block.type === "list") {
        block.items.forEach((item, index) => {
          const marker = block.ordered ? `${index + 1}. ` : "• ";
          xml += `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/${block.ordered ? "LISTA NUMERADA" : "LISTA CON VIÑETAS"}"><CharacterStyleRange AppliedCharacterStyle="CharacterStyle/MARCADOR DE LISTA"><Content>${escapeXml(marker)}</Content></CharacterStyleRange>${idmlCharacterRanges(item.runs, item.text)}<Br/></ParagraphStyleRange>`;
        });
      } else if (block.type !== "break") {
        const style = block.type === "heading" ? (block.level <= 2 ? "TITULO SECCION" : "SUBTITULO") : block.type === "instruction" ? "INSTRUCCION" : block.type === "subinstruction" ? "SUBINSTRUCCION" : block.type === "answer" ? "RESPUESTA ALUMNO" : documentData.documentKind === "teacher-notes" ? "NOTAS DEL MAESTRO TEXTO" : "TEXTO";
        xml += idmlParagraph(style, block.runs, block.text);
      }
    }
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><idPkg:Story xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="20.0"><Story Self="u3" AppliedTOCStyle="n" AppliedNamedGrid="n" TrackChanges="false" StoryTitle="${escapeXml(documentData.title)}"><StoryPreference OpticalMarginAlignment="false" OpticalMarginSize="12" FrameType="TextFrameType" StoryOrientation="Horizontal" StoryDirection="LeftToRightDirection"/><InCopyExportOption IncludeGraphicProxies="true" IncludeAllResources="false"/>${xml}</Story></idPkg:Story>`;
}

async function buildIdml(documentData) {
  const zip = new JSZip();
  const storyCharacterCount = documentData.sections.reduce((total, section) => total + section.title.length + section.blocks.reduce((subtotal, block) => {
    if (block.type === "list") return subtotal + block.items.reduce((sum, item) => sum + item.text.length, 0);
    if (block.type === "table") return subtotal + block.rows.flat().reduce((sum, cell) => sum + cell.text.length, 0);
    return subtotal + String(block.text || "").length;
  }, 0), documentData.title.length + documentData.subtitle.length);
  const pageCount = Math.max(1, Math.ceil(storyCharacterCount / 2600));
  const spreadPages = [[1]];
  for (let page = 2; page <= pageCount; page += 2) {
    spreadPages.push(page + 1 <= pageCount ? [page, page + 1] : [page]);
  }
  const spreadRefs = spreadPages.map((_, index) => `<idPkg:Spread src="Spreads/Spread_u2_${index + 1}.xml"/>`).join("");
  zip.file("mimetype", MIME_TYPES.idml, { compression: "STORE" });
  zip.file("META-INF/container.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="designmap.xml" media-type="text/xml"/></rootfiles></container>`);
  zip.file("designmap.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><?aid style="50" type="document" readerVersion="6.0" featureSet="257" product="20.0"?><Document xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="20.0" Self="d" StoryList="u3" ActiveLayer="uLayer1"><idPkg:Graphic src="Resources/Graphic.xml"/><idPkg:Fonts src="Resources/Fonts.xml"/><idPkg:Styles src="Resources/Styles.xml"/><idPkg:Preferences src="Resources/Preferences.xml"/><idPkg:Tags src="XML/Tags.xml"/><Layer Self="uLayer1" Name="Contenido" Visible="true" Locked="false" IgnoreWrap="false" ShowGuides="true" LockGuides="false" UI="true" Expendable="true" Printable="true"><Properties><LayerColor type="enumeration">LightBlue</LayerColor></Properties></Layer><idPkg:MasterSpread src="MasterSpreads/MasterSpread_u1.xml"/>${spreadRefs}<idPkg:BackingStory src="XML/BackingStory.xml"/><idPkg:Story src="Stories/Story_u3.xml"/></Document>`);
  zip.file("XML/Tags.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><idPkg:Tags xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="20.0"><XMLTag Self="XMLTag/Root" Name="Root"><Properties><TagColor type="enumeration">LightBlue</TagColor></Properties></XMLTag></idPkg:Tags>`);
  zip.file("XML/BackingStory.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><idPkg:BackingStory xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="20.0"><XmlStory Self="uBackingStory" UserText="true" IsEndnoteStory="false" AppliedTOCStyle="n" TrackChanges="false" StoryTitle="$ID/" AppliedNamedGrid="n"><ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/$ID/NormalParagraphStyle"><CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"><Content>&#xfeff;&#xfeff;</Content><XMLElement Self="uRootElement" MarkupTag="XMLTag/Root"/><Content>&#xfeff;</Content></CharacterStyleRange></ParagraphStyleRange></XmlStory></idPkg:BackingStory>`);
  zip.file("Resources/Fonts.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><idPkg:Fonts xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging"><FontFamily Self="Arial"><Font Self="Arial\tRegular" FontFamily="Arial" FontStyleName="Regular" FontType="OpenType"/><Font Self="Arial\tBold" FontFamily="Arial" FontStyleName="Bold" FontType="OpenType"/><Font Self="Arial\tItalic" FontFamily="Arial" FontStyleName="Italic" FontType="OpenType"/><Font Self="Arial\tBold Italic" FontFamily="Arial" FontStyleName="Bold Italic" FontType="OpenType"/></FontFamily></idPkg:Fonts>`);
  zip.file("Resources/Graphic.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><idPkg:Graphic xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging"><Color Self="Color/Negro editorial" Model="Process" Space="CMYK" ColorValue="0 0 0 100"/><Color Self="Color/Azul editorial" Model="Process" Space="CMYK" ColorValue="85 55 0 0"/><Color Self="Color/Azul tabla" Model="Process" Space="CMYK" ColorValue="70 35 0 0"/><Color Self="Color/Gris tabla" Model="Process" Space="CMYK" ColorValue="5 2 0 8"/><Color Self="Color/Magenta respuesta" Model="Process" Space="CMYK" ColorValue="5 95 0 0"/><Color Self="Color/Paper" Model="Process" Space="CMYK" ColorValue="0 0 0 0"/></idPkg:Graphic>`);
  zip.file("Resources/Preferences.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><idPkg:Preferences xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging"><DocumentPreference PageHeight="793.7007874016" PageWidth="595.2755905512" PagesPerDocument="1" FacingPages="true" DocumentBleedTopOffset="14.1732283465" DocumentBleedBottomOffset="14.1732283465" DocumentBleedInsideOrLeftOffset="14.1732283465" DocumentBleedOutsideOrRightOffset="14.1732283465" DocumentBleedUniformSize="true" Intent="PrintIntent" PageBinding="LeftToRight"/><TextPreference SmartTextReflow="false" AddPages="EndOfStory" LimitToMasterTextFrames="true" PreserveFacingPageSpreads="true" DeleteEmptyPages="false"/><MarginPreference Top="42.5196850394" Bottom="42.5196850394" Left="42.5196850394" Right="42.5196850394" ColumnCount="1" ColumnGutter="12"/></idPkg:Preferences>`);
  const pStyles = [
    ["TITULO LIBRO", "24", "Bold", "Color/Azul editorial", "28", "12", "6", "0", "0"],
    ["SUBTITULO", "12", "Regular", "Color/Negro editorial", "16", "0", "12", "0", "0"],
    ["TITULO", "19", "Bold", "Color/Azul editorial", "23", "19", "6", "0", "0"],
    ["TITULO SECCION", "14", "Bold", "Color/Azul editorial", "18", "12", "6", "0", "0"],
    ["TEXTO", "11", "Regular", "Color/Negro editorial", "15", "0", "6", "0", "0"],
    ["INSTRUCCION", "11", "Regular", "Color/Negro editorial", "15", "4", "6", "0", "0"],
    ["SUBINSTRUCCION", "11", "Regular", "Color/Negro editorial", "15", "2", "5", "30", "-29"],
    ["RESPUESTA ALUMNO", "11", "Regular", "Color/Magenta respuesta", "15", "0", "6", "5", "0"],
    ["TABLAS TITULO", "10", "Bold", "Color/Paper", "12", "0", "0", "0", "0"],
    ["TABLAS CUERPO", "9", "Regular", "Color/Negro editorial", "12", "0", "0", "0", "0"],
    ["LISTA NUMERADA", "11", "Regular", "Color/Negro editorial", "15", "0", "4", "24", "-18"],
    ["LISTA CON VIÑETAS", "11", "Regular", "Color/Negro editorial", "15", "0", "4", "24", "-18"],
    ["NOTAS DEL MAESTRO", "14", "Bold", "Color/Azul editorial", "18", "12", "6", "0", "0"],
    ["NOTAS DEL MAESTRO TEXTO", "10.5", "Regular", "Color/Negro editorial", "14", "0", "6", "0", "0"],
    ["FUENTE", "8.5", "Regular", "Color/Negro editorial", "11", "0", "3", "0", "0"]
  ].map(([name, size, face, fill, leading, before, after, left, first]) => `<ParagraphStyle Self="ParagraphStyle/${name}" Name="${name}" BasedOn="ParagraphStyle/$ID/NormalParagraphStyle" PointSize="${size}" FontStyle="${face}" FillColor="${fill}" Leading="${leading}" SpaceBefore="${before}" SpaceAfter="${after}" LeftIndent="${left}" FirstLineIndent="${first}"><Properties><AppliedFont type="string">Arial</AppliedFont></Properties></ParagraphStyle>`).join("");
  const cStyles = [["Normal", "Regular", "Normal", "Color/Negro editorial", "false"], ["BOLD", "Bold", "Normal", "Color/Negro editorial", "false"], ["ITALIC", "Italic", "Normal", "Color/Negro editorial", "false"], ["BOLD ITALIC", "Bold Italic", "Normal", "Color/Negro editorial", "false"], ["SUPERINDICE", "Regular", "Superscript", "Color/Negro editorial", "false"], ["SUBINDICE", "Regular", "Subscript", "Color/Negro editorial", "false"], ["SUBRAYADO", "Regular", "Normal", "Color/Negro editorial", "true"], ["RESPUESTA ALUMNO", "Regular", "Normal", "Color/Magenta respuesta", "false"], ["SPEC Car", "Regular", "Normal", "Color/Azul editorial", "false"], ["MARCADOR DE LISTA", "Bold", "Normal", "Color/Negro editorial", "false"]].map(([name, face, position, fill, underline]) => `<CharacterStyle Self="CharacterStyle/${name}" Name="${name}" BasedOn="CharacterStyle/$ID/[No character style]" FontStyle="${face}" Position="${position}" FillColor="${fill}" Underline="${underline}"><Properties><AppliedFont type="string">Arial</AppliedFont></Properties></CharacterStyle>`).join("");
  const tableStyles = `<RootTableStyleGroup Self="uTS"><TableStyle Self="TableStyle/$ID/[No table style]" Name="$ID/[No table style]"/><TableStyle Self="TableStyle/$ID/[Basic Table]" Name="$ID/[Basic Table]"/><TableStyle Self="TableStyle/TABLA EDITORIAL" Name="TABLA EDITORIAL" BasedOn="TableStyle/$ID/[Basic Table]"/></RootTableStyleGroup>`;
  const cellStyles = `<RootCellStyleGroup Self="uCellS"><CellStyle Self="CellStyle/$ID/[None]" Name="$ID/[None]"/><CellStyle Self="CellStyle/TABLA TITULO" Name="TABLA TITULO" FillColor="Color/Azul tabla" TopEdgeStrokeWeight="0" BottomEdgeStrokeWeight="0.5" LeftEdgeStrokeWeight="0" RightEdgeStrokeWeight="0"/><CellStyle Self="CellStyle/TABLA CUERPO" Name="TABLA CUERPO" FillColor="Color/Gris tabla" TopEdgeStrokeWeight="0" BottomEdgeStrokeWeight="0.5" LeftEdgeStrokeWeight="0" RightEdgeStrokeWeight="0"/></RootCellStyleGroup>`;
  zip.file("Resources/Styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><idPkg:Styles xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging"><RootParagraphStyleGroup Self="uPS"><ParagraphStyle Self="ParagraphStyle/$ID/NormalParagraphStyle" Name="$ID/NormalParagraphStyle" FontStyle="Regular"><Properties><AppliedFont type="string">Arial</AppliedFont></Properties></ParagraphStyle>${pStyles}</RootParagraphStyleGroup><RootCharacterStyleGroup Self="uCS"><CharacterStyle Self="CharacterStyle/$ID/[No character style]" Name="$ID/[No character style]"/>${cStyles}</RootCharacterStyleGroup>${tableStyles}${cellStyles}</idPkg:Styles>`);
  const leftTransform = "1 0 0 1 -595.2755905512 -396.8503937008";
  const rightTransform = "1 0 0 1 0 -396.8503937008";
  const pageTransform = (number) => number % 2 === 0 ? leftTransform : rightTransform;
  const margins = `<MarginPreference Top="42.5196850394" Bottom="42.5196850394" Left="42.5196850394" Right="42.5196850394" ColumnCount="1" ColumnGutter="12"/>`;
  const frameGeometry = `<Properties><PathGeometry><GeometryPathType PathOpen="false"><PathPointArray><PathPointType Anchor="42.5196850394 42.5196850394" LeftDirection="42.5196850394 42.5196850394" RightDirection="42.5196850394 42.5196850394"/><PathPointType Anchor="552.7559055118 42.5196850394" LeftDirection="552.7559055118 42.5196850394" RightDirection="552.7559055118 42.5196850394"/><PathPointType Anchor="552.7559055118 751.1811023622" LeftDirection="552.7559055118 751.1811023622" RightDirection="552.7559055118 751.1811023622"/><PathPointType Anchor="42.5196850394 751.1811023622" LeftDirection="42.5196850394 751.1811023622" RightDirection="42.5196850394 751.1811023622"/></PathPointArray></GeometryPathType></PathGeometry></Properties>`;
  zip.file("MasterSpreads/MasterSpread_u1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><idPkg:MasterSpread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="20.0"><MasterSpread Self="u1" Name="A-Maestra" NamePrefix="A" BaseName="Maestra" ShowMasterItems="true" PageCount="2" PrimaryTextFrame="n" ItemTransform="1 0 0 1 0 0"><Page Self="u1pL" Name="A" AppliedMaster="n" MasterPageTransform="1 0 0 1 0 0" GeometricBounds="0 0 793.7007874016 595.2755905512" ItemTransform="${leftTransform}">${margins}</Page><Page Self="u1pR" Name="A" AppliedMaster="n" MasterPageTransform="1 0 0 1 0 0" GeometricBounds="0 0 793.7007874016 595.2755905512" ItemTransform="${rightTransform}">${margins}</Page></MasterSpread></idPkg:MasterSpread>`);
  spreadPages.forEach((pageNumbers, spreadIndex) => {
    const pagesXml = pageNumbers.map((number) => `<Page Self="u2p${number}" Name="${number}" AppliedMaster="u1" MasterPageTransform="1 0 0 1 0 0" GeometricBounds="0 0 793.7007874016 595.2755905512" ItemTransform="${pageTransform(number)}">${margins}</Page>`).join("");
    const framesXml = pageNumbers.map((number) => {
      const previous = number === 1 ? "n" : `u2tf${number - 1}`;
      const next = number === pageCount ? "n" : `u2tf${number + 1}`;
      return `<TextFrame Self="u2tf${number}" ParentStory="u3" PreviousTextFrame="${previous}" NextTextFrame="${next}" ContentType="TextType" ItemLayer="uLayer1" Visible="true" Name="$ID/" ItemTransform="${pageTransform(number)}">${frameGeometry}<TextFramePreference TextColumnCount="1" TextColumnFixedWidth="510.2362204724" TextColumnMaxWidth="0"/></TextFrame>`;
    }).join("");
    const bindingLocation = pageNumbers[0] === 1 ? "0" : "1";
    zip.file(`Spreads/Spread_u2_${spreadIndex + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><idPkg:Spread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="20.0"><Spread Self="u2s${spreadIndex + 1}" PageCount="${pageNumbers.length}" BindingLocation="${bindingLocation}" ShowMasterItems="true" AllowPageShuffle="false" ItemTransform="1 0 0 1 0 0">${pagesXml}${framesXml}</Spread></idPkg:Spread>`);
  });
  zip.file("Stories/Story_u3.xml", idmlStory(documentData));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

async function buildCharlyExport({ session = {}, format = "docx", documentKind = "student" } = {}) {
  const normalizedFormat = String(format || "").toLowerCase();
  if (!MIME_TYPES[normalizedFormat]) {
    const error = new Error("Formato de exportación no compatible.");
    error.status = 400;
    throw error;
  }
  const normalizedKind = documentKind === "teacher-notes" ? "teacher-notes" : "student";
  const documentData = collectApprovedDocument(session, { documentKind: normalizedKind });
  if (!documentData.sections.length) {
    const error = new Error(normalizedKind === "teacher-notes" ? "La sesión todavía no tiene notas del maestro aprobadas." : "La sesión todavía no tiene contenido aprobado para exportar.");
    error.status = 409;
    error.code = normalizedKind === "teacher-notes" ? "NO_TEACHER_NOTES" : "NO_APPROVED_CONTENT";
    throw error;
  }
  const builders = { docx: buildDocx, pdf: buildPdf, idml: buildIdml };
  const buffer = await builders[normalizedFormat](documentData);
  const suffix = normalizedKind === "teacher-notes" ? "notas-del-maestro" : "contenido";
  return { buffer, contentType: MIME_TYPES[normalizedFormat], extension: normalizedFormat, filename: `${buildExportBaseName(session)}-${suffix}.${normalizedFormat}`, documentData };
}

module.exports = { MIME_TYPES, buildCharlyExport, buildExportBaseName, collectApprovedDocument, htmlBlocks };
