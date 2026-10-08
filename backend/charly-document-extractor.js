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
          return {
            name,
            type: cached.type || type,
            text: cached.text || "",
            totalPages: cached.totalPages || 1,
            checkpoints: cached.checkpoints || [],
            charCount: (cached.text || "").length,
            fromCache: true
          };
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
    text = await extractDocxText(buffer);
  } else if (type === "xlsx") {
    text = extractExcelText(buffer);
  } else if (type === "csv" || type === "text") {
    text = buffer.toString("utf8");
  } else if (type === "idml") {
    text = await extractIdmlText(buffer);
  } else if (type === "image") {
    text = `[Imagen adjunta: "${name}" (${fileMeta.mimeType || "imagen"})]`;
  } else if (type === "pdf") {
    try {
      const pdfModule = require("pdf-parse");
      if (pdfModule?.PDFParse) {
        const parser = new pdfModule.PDFParse({ data: buffer });
        const info = await parser.getInfo().catch(() => ({ total: 1 }));
        totalPages = Number(info?.total || 1);

        if (totalPages <= 30) {
          await options.onProgress?.(`Extrayendo texto del PDF (${totalPages} páginas)...`);
          const res = await parser.getText();
          text = String(res?.text || "").trim();
          checkpoints.push({ title: `Documento Completo (pp. 1-${totalPages})`, text });
        } else {
          // Documento pesado con cientos de hojas: procesar por checkpoints estructurados
          const ranges = [
            { title: "Estructura inicial e Índice (pp. 1-25)", first: 1, last: Math.min(25, totalPages) },
            { title: "Desarrollo Temático - Bloque 1 (pp. 26-55)", first: 26, last: Math.min(55, totalPages) },
            { title: "Desarrollo Temático - Bloque 2 (pp. 56-85)", first: 56, last: Math.min(85, totalPages) },
            { title: "Desarrollo Temático - Bloque 3 (pp. 86-120)", first: 86, last: Math.min(120, totalPages) }
          ].filter((r) => r.first <= totalPages);

          for (let i = 0; i < ranges.length; i++) {
            const range = ranges[i];
            await options.onProgress?.(`Extrayendo checkpoint ${i + 1} de ${ranges.length}: ${range.title}...`);
            const chunkRes = await parser.getText({ first: range.first, last: range.last });
            const chunkText = String(chunkRes?.text || "").trim();
            if (chunkText) {
              checkpoints.push({ title: range.title, pages: `${range.first}-${range.last}`, text: chunkText });
            }
          }
          text = checkpoints.map((c) => `=== CHECKPOINT: ${c.title} ===\n${c.text}`).join("\n\n");
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
          text: text.slice(0, 100000),
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
