const fs = require("node:fs");
const path = require("node:path");
const JSZip = require("jszip");
const {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} = require("docx");

const TEMPLATE_PATH = path.resolve(__dirname, "../assets/word-templates/ESTILOS_10ED.docx");

const STYLE = Object.freeze({
  title: "0100TITULO",
  unitTitle: "0100TITULO",
  subtitle: "0102SUBTITULO",
  subheading: "0103SUBTITULONIVEL2",
  subtopic: "0103SUBTITULONIVEL2",
  campoFormativo: "0104CAMPOFORMATIVO",
  sectionTitle: "0105TITULOSECCIONYCOMPETENCIA",
  competencia: "0801COMPETENCIA",
  ejeArticulador: "0802EJEARTICULADOR",
  habilidades: "080502HABILIDADES",
  body: "020000TEXTO",
  literature: "020001TEXTOLITERATURA",
  instruction: "020100INSTRUCCION",
  orderedList: "020200TEXTONUMERADONIVEL1",
  bulletList: "020202TEXTOBULLET",
  tableBody: "030000TABLASCUERPO",
  tableBodyCentered: "030004TABLASCUERPOCENTRADO",
  tableTitle: "030100TABLASTITULOCENTRADO",
  answer: "080400RESPUESTAALUMNO",
  teacherNote: "1002SPEC"
});

const LIST_STYLE_LEVELS = Object.freeze({
  [STYLE.orderedList]: 0,
  [STYLE.bulletList]: 0,
  "020300TEXTONUMERADONIVEL2": 1,
  "020303TEXTOBULLETSNIVEL2": 1
});

const TEMPLATE_PARTS = Object.freeze([
  "word/styles.xml",
  "word/numbering.xml",
  "word/theme/theme1.xml",
  "word/fontTable.xml",
  "word/settings.xml",
  "word/webSettings.xml"
]);

let templateBuffer;

function getTemplateBuffer() {
  if (!templateBuffer) templateBuffer = fs.readFileSync(TEMPLATE_PATH);
  return templateBuffer;
}

function characterStyle(run = {}, fallback = "") {
  if (fallback) return fallback;
  if (run.superscript) return "ASUPERINDICE";
  if (run.subscript) return "ASUBINDICE";
  if (run.bold && run.underline) return "ASUBRAYADOBOLD";
  if (run.bold && run.italics) return "ABOLDITALIC";
  if (run.bold) return "ABOLD";
  if (run.italics) return "AITALIC";
  if (run.underline) return "ASUBRAYADO";
  return "";
}

function wordRuns(runs = [], fallback = "", defaultCharacterStyle = "") {
  const source = runs.length ? runs : [{ text: fallback }];
  return source.filter((run) => run.text).map((run) => {
    const style = characterStyle(run, defaultCharacterStyle);
    return new TextRun({
      text: run.text,
      style: style || undefined,
      bold: Boolean(run.bold),
      italics: Boolean(run.italics),
      superScript: Boolean(run.superscript),
      subScript: Boolean(run.subscript),
      underline: run.underline ? {} : undefined
    });
  });
}

function bodyStyleFor(section = {}) {
  if (section.kind === "reading") return STYLE.literature;
  if (section.kind === "notes") return STYLE.teacherNote;
  return STYLE.body;
}

function paragraphForBlock(block, section = {}) {
  const baseStyle = bodyStyleFor(section);
  if (block.type === "image" && block.data) {
    const width = Math.max(1, Number(block.width || 1));
    const height = Math.max(1, Number(block.height || 1));
    const scale = Math.min(600 / width, 730 / height, 1);
    return new Paragraph({
      style: baseStyle,
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 160 },
      children: [new ImageRun({
        type: "png",
        data: block.data,
        transformation: { width: Math.round(width * scale), height: Math.round(height * scale) },
        altText: { title: block.alt, description: block.alt, name: "Recurso visual" }
      })]
    });
  }
  if (block.type === "table") {
    const columnCount = Math.max(1, ...block.rows.map((row) => row.length));
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: block.rows.map((row) => new TableRow({
        children: Array.from({ length: columnCount }, (_, index) => {
          const cell = row[index] || { text: "" };
          return new TableCell({
            children: [new Paragraph({
              style: cell.header ? STYLE.tableTitle : STYLE.tableBody,
              alignment: cell.header ? AlignmentType.CENTER : AlignmentType.LEFT,
              children: [new TextRun({ text: cell.text })]
            })]
          });
        })
      })),
      borders: {
        top: { style: BorderStyle.SINGLE, size: 2, color: "B7B7B7" },
        bottom: { style: BorderStyle.SINGLE, size: 2, color: "B7B7B7" },
        left: { style: BorderStyle.SINGLE, size: 2, color: "B7B7B7" },
        right: { style: BorderStyle.SINGLE, size: 2, color: "B7B7B7" },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "D9D9D9" },
        insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "D9D9D9" }
      }
    });
  }
  if (block.type === "list") {
    const style = block.ordered ? STYLE.orderedList : STYLE.bulletList;
    return block.items.map((item) => new Paragraph({
      style,
      children: wordRuns(item.runs, item.text)
    }));
  }
  if (block.type === "break") return new Paragraph({ style: baseStyle, text: "" });

  let style = baseStyle;
  let outlineLevel;
  let defaultCharacterStyle = "";

  if (block.style) {
    style = block.style;
  } else if (block.type === "subtopic") {
    style = STYLE.subtopic;
  } else if (block.type === "campoFormativo") {
    style = STYLE.campoFormativo;
  } else if (block.type === "ejeArticulador") {
    style = STYLE.ejeArticulador;
  } else if (block.type === "habilidades") {
    style = STYLE.habilidades;
  } else if (block.type === "competencia") {
    style = STYLE.competencia;
  } else if (block.type === "sectionTitle") {
    style = STYLE.sectionTitle;
  } else if (block.type === "instruction" || block.type === "subinstruction") {
    style = STYLE.instruction;
  } else if (block.type === "answer") {
    style = STYLE.answer;
    defaultCharacterStyle = "ARESPUESTAALUMNO";
  } else if (block.type === "heading") {
    style = block.level === 1 ? STYLE.title : block.level === 2 ? STYLE.subtitle : STYLE.subheading;
    outlineLevel = block.level;
  }
  return new Paragraph({
    style,
    outlineLevel,
    keepNext: block.type === "heading" || block.type === "subtopic" || block.type === "sectionTitle",
    children: wordRuns(block.runs, block.text, defaultCharacterStyle)
  });
}

function buildDocument(documentData) {
  const children = [
    new Paragraph({
      text: documentData.title,
      style: STYLE.title,
      alignment: AlignmentType.LEFT,
      outlineLevel: 0,
      keepNext: true
    }),
    ...(documentData.subtitle ? [new Paragraph({ text: documentData.subtitle, style: STYLE.subtitle, keepNext: true })] : [])
  ];
  let currentUnit = "";
  for (const section of documentData.sections) {
    if (section.unitTitle && section.unitTitle !== currentUnit) {
      currentUnit = section.unitTitle;
      children.push(new Paragraph({
        text: currentUnit,
        style: STYLE.unitTitle,
        outlineLevel: 0,
        keepNext: true,
        pageBreakBefore: children.length > 2
      }));
    }
    if (!section.hasCustomHeader) {
      children.push(new Paragraph({
        text: section.title,
        style: documentData.documentKind === "teacher-notes" ? STYLE.teacherNote : STYLE.sectionTitle,
        outlineLevel: 1,
        keepNext: true
      }));
    }
    for (const block of section.blocks) {
      const output = paragraphForBlock(block, section);
      if (Array.isArray(output)) children.push(...output);
      else children.push(output);
    }
  }
  return new Document({
    creator: "Charly Brown",
    title: documentData.title,
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1417, right: 1701, bottom: 1417, left: 1701, header: 708, footer: 708 }
        }
      },
      children
    }]
  });
}

function extractStyleNumId(stylesXml = "", styleId = "") {
  const escaped = String(styleId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const style = stylesXml.match(new RegExp(`<w:style[^>]*w:styleId="${escaped}"[\\s\\S]*?<\\/w:style>`))?.[0] || "";
  return style.match(/<w:numId[^>]*w:val="(\d+)"/)?.[1] || "";
}

class NumberingAllocator {
  constructor(numberingXml = "") {
    this.xml = numberingXml;
    this.nextNumId = Math.max(0, ...Array.from(numberingXml.matchAll(/<w:num\b[^>]*w:numId="(\d+)"/g), (match) => Number(match[1]))) + 1;
  }

  clone(baseNumId) {
    const escaped = String(baseNumId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const source = this.xml.match(new RegExp(`<w:num\\b[^>]*w:numId="${escaped}"[\\s\\S]*?<\\/w:num>`))?.[0];
    if (!source) return String(baseNumId || "");
    const numId = String(this.nextNumId++);
    let clone = source.replace(new RegExp(`w:numId="${escaped}"`), `w:numId="${numId}"`);
    if (!/<w:lvlOverride\b/.test(clone)) {
      const overrides = Array.from({ length: 9 }, (_, level) => `<w:lvlOverride w:ilvl="${level}"><w:startOverride w:val="1"/></w:lvlOverride>`).join("");
      clone = clone.replace(/<\/w:num>\s*$/, `${overrides}</w:num>`);
    }
    this.xml = this.xml.replace(/<\/w:numbering>\s*$/, `${clone}</w:numbering>`);
    return numId;
  }
}

function applyRestartedTemplateNumbering(documentXml, stylesXml, allocator) {
  let activeStyle = "";
  let activeNumId = "";
  return documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) => {
    const styleId = paragraph.match(/<w:pStyle[^>]*w:val="([^"]+)"/)?.[1] || "";
    if (!Object.hasOwn(LIST_STYLE_LEVELS, styleId)) {
      activeStyle = "";
      activeNumId = "";
      return paragraph;
    }
    if (styleId !== activeStyle) {
      activeStyle = styleId;
      activeNumId = allocator.clone(extractStyleNumId(stylesXml, styleId));
    }
    if (!activeNumId) return paragraph;
    const numPr = `<w:numPr><w:ilvl w:val="${LIST_STYLE_LEVELS[styleId]}"/><w:numId w:val="${activeNumId}"/></w:numPr>`;
    if (/<w:numPr>[\s\S]*?<\/w:numPr>/.test(paragraph)) return paragraph.replace(/<w:numPr>[\s\S]*?<\/w:numPr>/, numPr);
    return paragraph.replace(/<w:pPr([^>]*)>/, `<w:pPr$1>${numPr}`);
  });
}

function mergeMissingOverrides(generatedXml, templateXml) {
  let xml = generatedXml;
  for (const match of templateXml.matchAll(/<Override\b[^>]*PartName="([^"]+)"[^>]*\/>/g)) {
    if (xml.includes(`PartName="${match[1]}"`)) continue;
    xml = xml.replace(/<\/Types>\s*$/, `${match[0]}</Types>`);
  }
  return xml;
}

function mergeMissingDocumentRelationships(generatedXml, templateXml) {
  let xml = generatedXml;
  let nextId = Math.max(0, ...Array.from(xml.matchAll(/Id="rId(\d+)"/g), (match) => Number(match[1]))) + 1;
  for (const match of templateXml.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const type = match[1].match(/Type="([^"]+)"/)?.[1] || "";
    const target = match[1].match(/Target="([^"]+)"/)?.[1] || "";
    if (!type || !target || xml.includes(`Type="${type}"`)) continue;
    xml = xml.replace(/<\/Relationships>\s*$/, `<Relationship Id="rId${nextId++}" Type="${type}" Target="${target}"/></Relationships>`);
  }
  return xml;
}

async function applyTemplate(generatedBuffer) {
  const [generated, template] = await Promise.all([
    JSZip.loadAsync(generatedBuffer),
    JSZip.loadAsync(getTemplateBuffer())
  ]);
  for (const part of TEMPLATE_PARTS) {
    const entry = template.file(part);
    if (entry) generated.file(part, await entry.async("nodebuffer"));
  }
  const generatedTypes = await generated.file("[Content_Types].xml").async("string");
  const templateTypes = await template.file("[Content_Types].xml").async("string");
  generated.file("[Content_Types].xml", mergeMissingOverrides(generatedTypes, templateTypes));
  const generatedRels = await generated.file("word/_rels/document.xml.rels").async("string");
  const templateRels = await template.file("word/_rels/document.xml.rels").async("string");
  generated.file("word/_rels/document.xml.rels", mergeMissingDocumentRelationships(generatedRels, templateRels));
  const stylesXml = await template.file("word/styles.xml").async("string");
  const allocator = new NumberingAllocator(await template.file("word/numbering.xml").async("string"));
  const documentXml = await generated.file("word/document.xml").async("string");
  generated.file("word/document.xml", applyRestartedTemplateNumbering(documentXml, stylesXml, allocator));
  generated.file("word/numbering.xml", allocator.xml);
  return generated.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

async function buildDocx10Ed(documentData) {
  return applyTemplate(await Packer.toBuffer(buildDocument(documentData)));
}

module.exports = { STYLE, TEMPLATE_PATH, buildDocx10Ed };
