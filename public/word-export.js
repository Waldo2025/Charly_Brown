const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";

const DEFAULT_STYLE_DEFINITIONS = {
  paragraph: {
    CBTitle: { label: "Título", fontSize: 34, color: "1E293B", bold: true, italic: false, align: "left", spacingAfter: 220, spacingBefore: 80, indentLeft: 0 },
    CBSubtitle: { label: "Subtítulo", fontSize: 22, color: "475569", bold: false, italic: true, align: "left", spacingAfter: 180, spacingBefore: 0, indentLeft: 0 },
    CBHeading1: { label: "Encabezado 1", fontSize: 30, color: "1D4ED8", bold: true, italic: false, align: "left", spacingAfter: 120, spacingBefore: 240, indentLeft: 0 },
    CBHeading2: { label: "Encabezado 2", fontSize: 26, color: "2563EB", bold: true, italic: false, align: "left", spacingAfter: 100, spacingBefore: 200, indentLeft: 0 },
    CBHeading3: { label: "Encabezado 3", fontSize: 24, color: "334155", bold: true, italic: false, align: "left", spacingAfter: 80, spacingBefore: 160, indentLeft: 0 },
    CBSubtopic: { label: "Subtema", fontSize: 24, color: "1F3A8A", bold: true, italic: false, align: "left", spacingAfter: 100, spacingBefore: 120, indentLeft: 0 },
    CBBody: { label: "Párrafo Normal", fontSize: 22, color: "1F2937", bold: false, italic: false, align: "left", spacingAfter: 160, spacingBefore: 0, indentLeft: 0 },
    CBActivity: { label: "Actividad", fontSize: 22, color: "0F766E", bold: true, italic: false, align: "left", spacingAfter: 180, spacingBefore: 80, indentLeft: 320 },
    CBInstructions: { label: "Instrucciones", fontSize: 22, color: "0284C7", bold: true, italic: true, align: "left", spacingAfter: 160, spacingBefore: 60, indentLeft: 0 },
    CBSubinstructions: { label: "Subinstrucciones", fontSize: 20, color: "0369A1", bold: false, italic: true, align: "left", spacingAfter: 120, spacingBefore: 0, indentLeft: 240 },
    CBAnswer: { label: "Respuesta", fontSize: 22, color: "FF00FF", bold: false, italic: false, align: "left", spacingAfter: 140, spacingBefore: 40, indentLeft: 240 },
    CBTeacherNote: { label: "Nota maestro", fontSize: 22, color: "7C2D12", bold: false, italic: false, align: "left", spacingAfter: 180, spacingBefore: 80, indentLeft: 320 },
    CBTableText: { label: "Texto de tabla", fontSize: 20, color: "1F2937", bold: false, italic: false, align: "left", spacingAfter: 80, spacingBefore: 0, indentLeft: 0 }
  },
  character: {
    CBTextNormal: { label: "Normal", bold: false, italic: false, underline: false, highlight: false, color: "" },
    CBStrong: { label: "Negrita", bold: true, italic: false, underline: false, highlight: false, color: "" },
    CBEmphasis: { label: "Énfasis", bold: false, italic: true, underline: false, highlight: false, color: "" },
    CBUnderline: { label: "Subrayado", bold: false, italic: false, underline: true, highlight: false, color: "" },
    CBHighlight: { label: "Resaltado", bold: false, italic: false, underline: false, highlight: true, color: "" }
  }
};

function escXml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sanitizeFilename(value = "", fallback = "documento") {
  const cleaned = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();
  return cleaned || fallback;
}

function normalizeStyleDefinitions(input = {}) {
  const out = {
    paragraph: { ...DEFAULT_STYLE_DEFINITIONS.paragraph },
    character: { ...DEFAULT_STYLE_DEFINITIONS.character }
  };
  ["paragraph", "character"].forEach((group) => {
    const src = input?.[group];
    if (!src || typeof src !== "object") return;
    Object.entries(src).forEach(([key, value]) => {
      if (!out[group][key]) return;
      out[group][key] = { ...out[group][key], ...(value || {}) };
    });
  });
  return out;
}

function pickZipCtor() {
  return window.htmlDocx?.JSZip || window.JSZip || null;
}

function buildContentTypes() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function buildRootRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${REL_NS}">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail" Target="docProps/thumbnail.jpeg"/>
</Relationships>`;
}

function buildDocumentRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${REL_NS}">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;
}

function buildCoreXml(title = "Documento") {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:dcmitype="http://purl.org/dc/dcmitype/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escXml(title)}</dc:title>
  <dc:creator>Charly Brown</dc:creator>
  <cp:lastModifiedBy>Charly Brown</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

function buildAppXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
  xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Charly Brown</Application>
</Properties>`;
}

function buildParagraphStyleXml(styleId, def = {}, basedOn = "Normal") {
  const ppr = [];
  if (def.align) ppr.push(`<w:jc w:val="${escXml(def.align)}"/>`);
  if (Number.isFinite(Number(def.spacingBefore)) || Number.isFinite(Number(def.spacingAfter))) {
    ppr.push(`<w:spacing w:before="${Math.max(0, Number(def.spacingBefore || 0))}" w:after="${Math.max(0, Number(def.spacingAfter || 0))}"/>`);
  }
  if (Number(def.indentLeft || 0) > 0) ppr.push(`<w:ind w:left="${Math.max(0, Number(def.indentLeft || 0))}"/>`);
  const rpr = [];
  if (def.bold) rpr.push("<w:b/>");
  if (def.italic) rpr.push("<w:i/>");
  rpr.push(`<w:sz w:val="${Math.max(16, Number(def.fontSize || 22))}"/>`);
  rpr.push(`<w:color w:val="${escXml(def.color || "1F2937")}"/>`);
  return `<w:style w:type="paragraph" w:styleId="${styleId}"><w:name w:val="${escXml(def.label || styleId)}"/><w:basedOn w:val="${basedOn}"/><w:qFormat/>${ppr.length ? `<w:pPr>${ppr.join("")}</w:pPr>` : ""}<w:rPr>${rpr.join("")}</w:rPr></w:style>`;
}

function buildCharacterStyleXml(styleId, def = {}) {
  const rpr = [];
  if (def.bold) rpr.push("<w:b/>");
  if (def.italic) rpr.push("<w:i/>");
  if (def.underline) rpr.push('<w:u w:val="single"/>');
  if (def.highlight) rpr.push('<w:highlight w:val="yellow"/>');
  if (def.fontSize) rpr.push(`<w:sz w:val="${Math.max(16, Number(def.fontSize || 22))}"/>`);
  if (def.color) rpr.push(`<w:color w:val="${escXml(def.color)}"/>`);
  return `<w:style w:type="character" w:styleId="${styleId}"><w:name w:val="${escXml(def.label || styleId)}"/><w:basedOn w:val="DefaultParagraphFont"/>${rpr.length ? `<w:rPr>${rpr.join("")}</w:rPr>` : ""}</w:style>`;
}

function buildStylesXml(styleDefinitions) {
  const defs = normalizeStyleDefinitions(styleDefinitions);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${WORD_NS}">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
        <w:color w:val="1F2937"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="160" w:line="300" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:sz w:val="22"/><w:color w:val="1F2937"/></w:rPr>
  </w:style>
  ${buildParagraphStyleXml("CBTitle", defs.paragraph.CBTitle)}
  ${buildParagraphStyleXml("CBSubtitle", defs.paragraph.CBSubtitle)}
  ${buildParagraphStyleXml("CBHeading1", defs.paragraph.CBHeading1)}
  ${buildParagraphStyleXml("CBHeading2", defs.paragraph.CBHeading2)}
  ${buildParagraphStyleXml("CBHeading3", defs.paragraph.CBHeading3)}
  ${buildParagraphStyleXml("CBSubtopic", defs.paragraph.CBSubtopic, "CBBody")}
  ${buildParagraphStyleXml("CBBody", defs.paragraph.CBBody)}
  ${buildParagraphStyleXml("CBActivity", defs.paragraph.CBActivity, "CBBody")}
  ${buildParagraphStyleXml("CBAnswer", defs.paragraph.CBAnswer, "CBBody")}
  ${buildParagraphStyleXml("CBTeacherNote", defs.paragraph.CBTeacherNote, "CBBody")}
  ${buildParagraphStyleXml("CBTableText", defs.paragraph.CBTableText, "CBBody")}
  ${buildCharacterStyleXml("CBTextNormal", defs.character.CBTextNormal)}
  ${buildCharacterStyleXml("CBStrong", defs.character.CBStrong)}
  ${buildCharacterStyleXml("CBEmphasis", defs.character.CBEmphasis)}
  ${buildCharacterStyleXml("CBUnderline", defs.character.CBUnderline)}
  ${buildCharacterStyleXml("CBHighlight", defs.character.CBHighlight)}
</w:styles>`;
}

function buildNumberingXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="${WORD_NS}">
  <w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
  <w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;
}

function buildSectPr() {
  return `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;
}

function runProps(style = {}) {
  const out = [];
  if (style.charStyle) out.push(`<w:rStyle w:val="${style.charStyle}"/>`);
  if (style.bold) out.push("<w:b/>");
  if (style.italic) out.push("<w:i/>");
  if (style.underline) out.push('<w:u w:val="single"/>');
  if (style.highlight) out.push('<w:highlight w:val="yellow"/>');
  if (style.color) out.push(`<w:color w:val="${style.color}"/>`);
  return out.length ? `<w:rPr>${out.join("")}</w:rPr>` : "";
}

function makeTextRun(text = "", style = {}) {
  if (!text) return "";
  return `<w:r>${runProps(style)}<w:t xml:space="preserve">${escXml(text)}</w:t></w:r>`;
}

function makeBreakRun() {
  return "<w:r><w:br/></w:r>";
}

function paragraphXml(runs = "", styleId = "CBBody", extraPpr = "") {
  return `<w:p><w:pPr><w:pStyle w:val="${styleId}"/>${extraPpr}</w:pPr>${runs || "<w:r><w:t></w:t></w:r>"}</w:p>`;
}

function listPpr(type = "ul") {
  const numId = type === "ol" ? 2 : 1;
  return `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>`;
}

function mapParagraphStyle(el) {
  const declared = String(el?.getAttribute?.("data-word-style") || "").trim();
  if (declared) return declared;
  const tag = String(el?.tagName || "").toLowerCase();
  if (tag === "h1") return "CBTitle";
  if (tag === "h2") return "CBHeading1";
  if (tag === "h3") return "CBHeading2";
  if (tag === "h4" || tag === "h5") return "CBHeading3";
  const cls = String(el?.className || "");
  const text = String(el?.textContent || "").trim();
  const ownText = String(el?.childNodes?.length
    ? Array.from(el.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent || "")
      .join(" ")
    : text).replace(/\s+/g, " ").trim();
  if (/^subcategor/i.test(text)) return "CBSubtopic";
  if (/^pregunta detonante/i.test(text) || /^lectura generadora/i.test(text) || /^titulo de la lectura relacionada/i.test(text)) return "CBHeading2";
  if (/^bibliograf/i.test(text) || /^sin[oó]nimos/i.test(text) || /^notas del maestro/i.test(text)) return "CBHeading3";
  if (/^respuesta/i.test(text) || /respuesta esperada/i.test(text)) return "CBAnswer";
  if (/^instrucciones\b/i.test(text) || /instrucci[oó]n\b/i.test(text)) return "CBInstructions";
  if (/^subinstrucci[oó]n/i.test(text)) return "CBSubinstructions";
  if (/^actividad\b/i.test(text) || /^consigna\b/i.test(text)) return "CBActivity";
  if (/^nota\b/i.test(text) || /^orientaci[oó]n docente/i.test(text)) return "CBTeacherNote";
  if (/col-maestro/i.test(cls) || el?.closest?.(".col-maestro")) return "CBTeacherNote";
  if (/^subtema\b/i.test(ownText)) return "CBSubtopic";
  if (/activity/i.test(cls)) return "CBActivity";
  if (/maestro|teacher/i.test(cls)) return "CBTeacherNote";
  return "CBBody";
}

function mergeStyle(base = {}, patch = {}) {
  return { ...base, ...patch };
}

function inlineRuns(node, style = {}) {
  if (!node) return "";
  if (node.nodeType === Node.TEXT_NODE) return makeTextRun(node.textContent || "", style);
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const tag = node.tagName.toLowerCase();
  if (tag === "br") return makeBreakRun();
  let nextStyle = style;
  const declaredChar = String(node.getAttribute?.("data-word-char-style") || "").trim();
  if (declaredChar) nextStyle = mergeStyle(nextStyle, { charStyle: declaredChar });
  if (tag === "strong" || tag === "b") nextStyle = mergeStyle(style, { bold: true, charStyle: style.charStyle || "CBStrong" });
  if (tag === "em" || tag === "i") nextStyle = mergeStyle(nextStyle, { italic: true, charStyle: nextStyle.charStyle || "CBEmphasis" });
  if (tag === "u") nextStyle = mergeStyle(nextStyle, { underline: true, charStyle: nextStyle.charStyle || "CBUnderline" });
  if (tag === "mark") nextStyle = mergeStyle(nextStyle, { highlight: true, charStyle: nextStyle.charStyle || "CBHighlight" });
  if (tag === "span" && /color\s*:\s*([^;]+)/i.test(node.getAttribute("style") || "")) {
    const m = (node.getAttribute("style") || "").match(/color\s*:\s*#?([0-9a-f]{3,6})/i);
    if (m?.[1]) nextStyle = mergeStyle(nextStyle, { color: m[1].length === 3 ? m[1].replace(/(.)/g, "$1$1") : m[1] });
  }
  return Array.from(node.childNodes).map((child) => inlineRuns(child, nextStyle)).join("");
}

function tableXml(tableEl) {
  const rows = Array.from(tableEl.querySelectorAll("tr")).map((tr) => {
    const cells = Array.from(tr.children).filter((cell) => /^(td|th)$/i.test(cell.tagName)).map((cell) => {
      const cellParagraphs = blockNodesToXml(Array.from(cell.childNodes), { inTable: true }) || paragraphXml(makeTextRun(cell.textContent || ""), "CBTableText");
      return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${cellParagraphs}</w:tc>`;
    }).join("");
    return `<w:tr>${cells}</w:tr>`;
  }).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="8" w:space="0" w:color="C7D2FE"/><w:left w:val="single" w:sz="8" w:space="0" w:color="C7D2FE"/><w:bottom w:val="single" w:sz="8" w:space="0" w:color="C7D2FE"/><w:right w:val="single" w:sz="8" w:space="0" w:color="C7D2FE"/><w:insideH w:val="single" w:sz="6" w:space="0" w:color="E2E8F0"/><w:insideV w:val="single" w:sz="6" w:space="0" w:color="E2E8F0"/></w:tblBorders></w:tblPr>${rows}</w:tbl>`;
}

function blockNodeToXml(node, ctx = {}) {
  if (!node) return "";
  if (node.nodeType === Node.TEXT_NODE) {
    const text = String(node.textContent || "").trim();
    return text ? paragraphXml(makeTextRun(text), ctx.inTable ? "CBTableText" : "CBBody") : "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const tag = node.tagName.toLowerCase();
  if (tag === "table") return tableXml(node);
  if (tag === "ul" || tag === "ol") {
    return Array.from(node.children).filter((li) => li.tagName?.toLowerCase() === "li").map((li) => {
      const runs = Array.from(li.childNodes).map((child) => {
        if (child.nodeType === Node.ELEMENT_NODE && /^(ul|ol)$/i.test(child.tagName)) return "";
        return inlineRuns(child);
      }).join("");
      return paragraphXml(runs || makeTextRun(li.textContent || ""), ctx.inTable ? "CBTableText" : "CBBody", listPpr(tag));
    }).join("");
  }
  if (tag === "hr") return paragraphXml("", "CBBody", '<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="12" w:color="CBD5E1"/></w:pBdr>');
  if (["h1","h2","h3","h4","h5","p","div","blockquote"].includes(tag)) {
    const runs = Array.from(node.childNodes).map((child) => inlineRuns(child)).join("");
    const styleId = ctx.inTable ? "CBTableText" : mapParagraphStyle(node);
    return paragraphXml(runs || makeTextRun(node.textContent || ""), styleId);
  }
  return Array.from(node.childNodes).map((child) => blockNodeToXml(child, ctx)).join("");
}

function blockNodesToXml(nodes = [], ctx = {}) {
  return nodes.map((node) => blockNodeToXml(node, ctx)).join("");
}

function htmlToDocumentXml(html = "", options = {}) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  let bodyXml = "";
  const title = String(options.title || "").trim();
  const subtitle = String(options.subtitle || "").trim();
  if (title) bodyXml += paragraphXml(makeTextRun(title), "CBTitle");
  if (subtitle) bodyXml += paragraphXml(makeTextRun(subtitle), "CBSubtitle");
  bodyXml += blockNodesToXml(Array.from(doc.body.firstElementChild?.childNodes || doc.body.childNodes));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${WORD_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyXml || paragraphXml("", "CBBody")}
    ${buildSectPr()}
  </w:body>
</w:document>`;
}

function wrapText(ctx, text = "", maxWidth = 320) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (!current || ctx.measureText(next).width <= maxWidth) current = next;
    else { lines.push(current); current = word; }
  });
  if (current) lines.push(current);
  return lines;
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

async function buildThumbnailBlob({ title = "Documento", subtitle = "" } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#f8fbff");
  gradient.addColorStop(1, "#e8eefb");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#d8e1f2";
  ctx.lineWidth = 3;
  roundRect(ctx, 42, 36, 428, 440, 28);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#2b3a67";
  ctx.font = "700 20px Georgia";
  ctx.fillText("Charly Brown", 72, 88);
  ctx.fillStyle = "#1f2937";
  ctx.font = "700 30px Arial";
  wrapText(ctx, title, 360).slice(0, 5).forEach((line, i) => ctx.fillText(line, 72, 156 + i * 38));
  if (subtitle) {
    ctx.fillStyle = "#5b6475";
    ctx.font = "500 18px Arial";
    wrapText(ctx, subtitle, 360).slice(0, 3).forEach((line, i) => ctx.fillText(line, 72, 352 + i * 28));
  }
  ctx.fillStyle = "#7c8db5";
  ctx.fillRect(72, 392, 120, 8);
  ctx.fillRect(72, 416, 220, 8);
  ctx.fillRect(72, 440, 176, 8);
  return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob || null), "image/jpeg", 0.92));
}

export async function buildStyledDocxBlob({ html = "", title = "", subtitle = "", styleDefinitions = null } = {}) {
  const JSZipCtor = pickZipCtor();
  if (!JSZipCtor) throw new Error("JSZip no está disponible.");
  const zip = new JSZipCtor();
  zip.file("[Content_Types].xml", buildContentTypes());
  zip.folder("_rels").file(".rels", buildRootRels());
  zip.folder("docProps").file("core.xml", buildCoreXml(title)).file("app.xml", buildAppXml());
  const word = zip.folder("word");
  word.file("document.xml", htmlToDocumentXml(html, { title, subtitle }));
  word.file("styles.xml", buildStylesXml(styleDefinitions));
  word.file("numbering.xml", buildNumberingXml());
  word.folder("_rels").file("document.xml.rels", buildDocumentRels());
  const thumb = await buildThumbnailBlob({ title, subtitle });
  if (thumb) {
    zip.folder("docProps").file("thumbnail.jpeg", await thumb.arrayBuffer(), { binary: true });
  }
  return zip.generate({ type: "blob" });
}

export async function downloadStyledDocx({ html = "", title = "", subtitle = "", filename = "documento.docx", styleDefinitions = null } = {}) {
  const blob = await buildStyledDocxBlob({ html, title, subtitle, styleDefinitions });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export { sanitizeFilename };
export { DEFAULT_STYLE_DEFINITIONS, normalizeStyleDefinitions };
