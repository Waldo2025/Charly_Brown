"use strict";

const mammoth = require("mammoth");
const XLSX = require("xlsx");
const JSZip = require("jszip");

/**
 * Normaliza el tipo de archivo según extensión o mimeType.
 */
function detectFileType(name = "", mimeType = "") {
  const ext = String(name || "").split(".").pop().toLowerCase();
  const mime = String(mimeType || "").toLowerCase();

  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (["png", "jpg", "jpeg", "webp"].includes(ext) || mime.startsWith("image/")) return "image";
  if (["docx", "doc"].includes(ext) || mime.includes("wordprocessingml") || mime.includes("msword")) return "docx";
  if (["xlsx", "xls"].includes(ext) || mime.includes("spreadsheetml") || mime.includes("ms-excel")) return "xlsx";
  if (ext === "csv" || mime === "text/csv") return "csv";
  if (ext === "idml" || mime.includes("idml")) return "idml";
  if (["txt", "md", "markdown", "json", "html"].includes(ext) || mime.startsWith("text/")) return "text";
  return "binary";
}

/**
 * Extrae texto de un archivo InDesign IDML (.idml es un ZIP con XMLs de historias).
 */
async function extractIdmlText(buffer) {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const storyFiles = Object.keys(zip.files).filter((k) => k.startsWith("Stories/Story_") && k.endsWith(".xml"));
    if (!storyFiles.length) return "Archivo IDML sin historias legibles.";

    const stories = [];
    for (const sf of storyFiles) {
      const xml = await zip.file(sf).async("string");
      const matches = xml.match(/<Content[^>]*>([\s\S]*?)<\/Content>/g) || [];
      const parts = [];
      for (const m of matches) {
        const text = m.replace(/<[^>]+>/g, "").replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))).trim();
        if (text) parts.push(text);
      }
      if (parts.length) {
        stories.push(parts.join(" "));
      }
    }
    return stories.join("\n\n").trim() || "Archivo IDML sin texto extraíble.";
  } catch (err) {
    return `Error al extraer texto del archivo IDML: ${err.message}`;
  }
}

/**
 * Extrae texto de un archivo Word (.docx / .doc).
 */
async function extractDocxText(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return String(result.value || "").trim() || "Documento Word vacío.";
  } catch (err) {
    return `Error al extraer texto del documento Word: ${err.message}`;
  }
}

/**
 * Extrae texto de un archivo Excel (.xlsx / .xls).
 */
function extractExcelText(buffer) {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    if (!workbook.SheetNames || !workbook.SheetNames.length) return "Libro de Excel sin hojas.";

    const sheets = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (csv && csv.trim()) {
        sheets.push(`--- HOJA: ${sheetName} ---\n${csv.trim()}`);
      }
    }
    return sheets.join("\n\n") || "Hojas de Excel sin datos.";
  } catch (err) {
    return `Error al extraer datos de la hoja de cálculo: ${err.message}`;
  }
}

/**
 * Extrae el contenido de un archivo a partir de su buffer y metadatos,
 * con soporte para checkpoints de páginas en PDFs pesados y persistencia en Firestore.
 * @param {Buffer} buffer
 * @param {Object} fileMeta { name, mimeType }
 * @param {Object} options { db, cacheKey, onProgress }
 * @returns {Promise<{ type: string, text: string, checkpoints?: Array, totalPages?: number }>}
 */
async function extractDocumentContent(buffer, fileMeta = {}, options = {}) {
  const name = String(fileMeta.name || "archivo");
  const type = detectFileType(name, fileMeta.mimeType);
  const db = options.db || null;
  const cacheKey = options.cacheKey ? String(options.cacheKey).replace(/[^a-zA-Z0-9_-]/g, "_") : "";

  // 1. Consultar si ya existe en la caché persistente de Firestore
  if (db && cacheKey) {
    try {
      const docRef = db.collection("charlyBrownDocumentCheckpoints").doc(cacheKey);
      if (typeof docRef?.get === "function") {
        const snap = await docRef.get();
        if (snap?.exists && snap.data()?.status === "completed") {
          const cached = snap.data();
          const cachedTotalPages = Number(cached.totalPages || 1);
          const cachedCheckpoints = Array.isArray(cached.checkpoints) ? cached.checkpoints : [];
          const expectedBlocks = Math.ceil(cachedTotalPages / 25);
          const isComplete = cachedTotalPages <= 30 || cachedCheckpoints.length >= expectedBlocks;

          if (isComplete) {
            return {
              name,
              type: cached.type || type,
              text: cached.text || "",
              totalPages: cachedTotalPages,
              checkpoints: cachedCheckpoints,
              charCount: (cached.text || "").length,
              fromCache: true
            };
          } else {
            console.info(`[charly-document-extractor] Caché previa de "${name}" incompleta (${cachedCheckpoints.length}/${expectedBlocks} bloques). Re-extrayendo documento completo...`);
          }
        }
      }
    } catch (err) {
      console.warn("[charly-document-extractor] Error al leer caché de Firestore:", err.message);
    }
  }

  let text = "";
  let totalPages = 1;
  const checkpoints = [];

  if (type === "docx") {
    await options.onProgress?.(`Extrayendo texto y párrafos de Word "${name}"...`);
    text = await extractDocxText(buffer);
  } else if (type === "xlsx") {
    await options.onProgress?.(`Leyendo hojas de cálculo de Excel "${name}"...`);
    text = extractExcelText(buffer);
  } else if (type === "csv" || type === "text") {
    await options.onProgress?.(`Leyendo datos de "${name}"...`);
    text = buffer.toString("utf8");
  } else if (type === "idml") {
    await options.onProgress?.(`Extrayendo relatos y tipografía de InDesign "${name}"...`);
    text = await extractIdmlText(buffer);
  } else if (type === "image") {
    await options.onProgress?.(`Procesando imagen "${name}"...`);
    text = `[Imagen adjunta: "${name}" (${fileMeta.mimeType || "imagen"})]`;
  } else if (type === "pdf") {
    try {
      const pdfModule = require("pdf-parse");
      if (pdfModule?.PDFParse) {
        const parser = new pdfModule.PDFParse({ data: buffer });
        const info = await parser.getInfo().catch(() => ({ total: 1 }));
        totalPages = Number(info?.total || 1);

        await options.onProgress?.(`Extrayendo texto del PDF (${totalPages} páginas)...`);
        const res = await parser.getText();
        text = String(res?.text || "").trim();

        if (totalPages <= 30) {
          checkpoints.push({ title: `Documento Completo (pp. 1-${totalPages})`, text });
        } else {
          // Documento pesado de cientos de páginas o casi 200MB:
          // Segmentar las páginas ya extraídas en checkpoints lógicos sin re-parsear el binario
          const pageSize = 25;
          const pages = Array.isArray(res?.pages) ? res.pages : [];
          for (let p = 1; p <= totalPages; p += pageSize) {
            const first = p;
            const last = Math.min(p + pageSize - 1, totalPages);
            const blockNum = Math.floor((p - 1) / pageSize) + 1;
            const blockPages = pages.filter((pg) => pg.num >= first && pg.num <= last);
            const chunkText = blockPages.map((pg) => pg.text).join("\n\n").trim();
            if (chunkText) {
              checkpoints.push({ title: `Parte ${blockNum} (pp. ${first}-${last})`, pages: `${first}-${last}`, text: chunkText });
            }
          }
        }
        await parser.destroy?.().catch(() => {});
      } else if (typeof pdfModule === "function") {
        const parsed = await pdfModule(buffer);
        text = String(parsed?.text || "").trim();
        checkpoints.push({ title: "Contenido PDF", text });
      }
    } catch (err) {
      console.warn("[charly-document-extractor] Fallo en extracción de PDF:", err.message);
      text = "";
    }
  }

  // 2. Guardar en la caché persistente de Firestore para que nunca vuelva a comenzar de cero
  if (db && cacheKey && text) {
    try {
      const docRef = db.collection("charlyBrownDocumentCheckpoints").doc(cacheKey);
      if (typeof docRef?.set === "function") {
        await docRef.set({
          name,
          type,
          totalPages,
          checkpoints: checkpoints.map((c) => ({ title: c.title, pages: c.pages || "" })),
          text: text.slice(0, 450000),
          status: "completed",
          updatedAt: Date.now()
        }, { merge: true });
      }
    } catch (err) {
      console.warn("[charly-document-extractor] Error al guardar caché en Firestore:", err.message);
    }
  }

  return {
    name,
    type,
    text,
    totalPages,
    checkpoints,
    charCount: text.length
  };
}

module.exports = {
  detectFileType,
  extractIdmlText,
  extractDocxText,
  extractExcelText,
  extractDocumentContent
};
