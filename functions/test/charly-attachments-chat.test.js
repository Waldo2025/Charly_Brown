"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const { buildAgentHistory, runChatAgent, registerCharlyBrownMcpRoutes } = require("../src/charly-brown-mcp.js");

test("buildAgentHistory incluye contenido de texto y partes de archivo adjunto", () => {
  const history = buildAgentHistory([], "Analiza la ficha", [
    { fileData: { mimeType: "application/pdf", fileUri: "gs://bucket/test.pdf" } }
  ]);
  assert.equal(history.length, 1);
  assert.equal(history[0].role, "user");
  assert.equal(history[0].parts.length, 2);
  assert.equal(history[0].parts[0].text, "Analiza la ficha");
  assert.equal(history[0].parts[1].fileData.mimeType, "application/pdf");
});

test("runChatAgent procesa archivo Excel adjunto y pasa el contenido a generateContent", async () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Subtema", "Actividad"],
    ["Palabras con Y", "Sopa de letras"]
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Fichas");
  const xlsxBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  let capturedPrompt = "";
  const mockContext = {
    uid: "test-user-att",
    db: {
      collection: () => ({
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({
              id: "sess_att",
              ownerId: "test-user-att",
              academicMeta: { grade: "1° Primaria" },
              units: [{ id: "unit_att", title: "Unidad 1", revision: 1, meta: { grade: "1° Primaria" }, messages: [], accepted: {} }]
            })
          })
        })
      })
    },
    generateContent: async ({ contents }) => {
      capturedPrompt = contents.flatMap((c) => c.parts.map((p) => p.text || "")).join("\n");
      return {
        candidates: [{ content: { parts: [{ text: "Leí el archivo de Excel correctamente." }] } }]
      };
    },
    // Mock de storage para devolver el buffer directamente
    storage: {
      bucket: () => ({
        file: () => ({
          download: async () => [xlsxBuf]
        })
      })
    }
  };

  const result = await runChatAgent({
    context: mockContext,
    sessionId: "sess_att",
    targetUnitId: "unit_att",
    userText: "Lee las fichas",
    attachments: [
      {
        name: "fichas.xlsx",
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        storagePath: "charly_attachments/test/fichas.xlsx"
      }
    ]
  });

  assert.equal(result.text, "Leí el archivo de Excel correctamente.");
  assert.match(capturedPrompt, /HOJA: Fichas/);
  assert.match(capturedPrompt, /Palabras con Y/);
  assert.match(capturedPrompt, /Sopa de letras/);
});

test("runChatAgent procesa imagen adjunta como inlineData multimodal", async () => {
  const imgBuf = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  let capturedContents = null;

  const mockContext = {
    uid: "test-user-img",
    db: {
      collection: () => ({
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({
              id: "sess_img",
              ownerId: "test-user-img",
              academicMeta: { grade: "1° Primaria" },
              units: [{ id: "unit_img", title: "Unidad 1", revision: 1, meta: { grade: "1° Primaria" }, messages: [], accepted: {} }]
            })
          })
        })
      })
    },
    generateContent: async ({ contents }) => {
      capturedContents = contents;
      return {
        candidates: [{ content: { parts: [{ text: "Analicé la imagen adjunta." }] } }]
      };
    },
    storage: {
      bucket: () => ({
        file: () => ({
          download: async () => [imgBuf]
        })
      })
    }
  };

  const result = await runChatAgent({
    context: mockContext,
    sessionId: "sess_img",
    targetUnitId: "unit_img",
    userText: "Describe la imagen",
    attachments: [
      {
        name: "captura.png",
        type: "image/png",
        storagePath: "charly_attachments/test/captura.png"
      }
    ]
  });

  assert.equal(result.text, "Analicé la imagen adjunta.");
  const userTurn = capturedContents.find((c) => c.role === "user");
  assert.ok(userTurn);
  const inlinePart = userTurn.parts.find((p) => p.inlineData);
  assert.ok(inlinePart, "Debe contener una parte inlineData para la imagen");
  assert.equal(inlinePart.inlineData.mimeType, "image/png");
  assert.equal(inlinePart.inlineData.data, imgBuf.toString("base64"));
});

test("runChatAgent con pregunta sobre archivo adjunto NO ofrece list_units en las herramientas y extrae el texto del PDF", async () => {
  let offeredTools = [];
  let capturedPrompt = "";

  const PDFDocument = require("pdfkit");
  const doc = new PDFDocument();
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => doc.on("end", resolve));
  doc.text("Indice del programa:\nUnidad 1: Los animales del bosque\nSeccion 1: El zorro astuto");
  doc.end();
  await done;
  const pdfBuffer = Buffer.concat(chunks);

  const mockContext = {
    uid: "test-user-tools",
    db: {
      collection: () => ({
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({
              id: "sess_tools",
              ownerId: "test-user-tools",
              academicMeta: { grade: "1° Primaria" },
              units: [{ id: "unit_tools", title: "Unidad 1", revision: 1, meta: { grade: "1° Primaria" }, messages: [], accepted: {} }]
            })
          })
        })
      })
    },
    generateContent: async ({ contents, config }) => {
      offeredTools = config.tools?.[0]?.functionDeclarations || [];
      capturedPrompt = contents.flatMap((c) => c.parts.map((p) => p.text || "")).join("\n");
      return {
        candidates: [{ content: { parts: [{ text: "Aquí está la lista de unidades del archivo adjunto." }] } }]
      };
    },
    storage: {
      bucket: () => ({
        file: () => ({
          download: async () => [pdfBuffer]
        })
      })
    }
  };

  await runChatAgent({
    context: mockContext,
    sessionId: "sess_tools",
    targetUnitId: "unit_tools",
    userText: "analiza el archivo, y dame una lista de unidades, secciones y temas",
    attachments: [
      {
        name: "programa.pdf",
        type: "application/pdf",
        storagePath: "charly_attachments/test/programa.pdf"
      }
    ]
  });

  const toolNames = offeredTools.map((t) => t.name);
  assert.ok(!toolNames.includes("list_units"), "NO debe ofrecer list_units al consultar sobre un archivo");
  assert.ok(!toolNames.includes("list_unit_content"), "NO debe ofrecer list_unit_content al consultar sobre un archivo");
  assert.match(capturedPrompt, /Los animales del bosque/);
  assert.match(capturedPrompt, /El zorro astuto/);
});

test("runChatAgent hereda adjuntos del turno anterior cuando el usuario escribe 'continua'", async () => {
  let capturedPrompt = "";

  const mockContext = {
    uid: "test-user-continua",
    db: {
      collection: () => ({
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({
              id: "sess_cont",
              ownerId: "test-user-continua",
              academicMeta: { grade: "1° Primaria" },
              units: [{
                id: "unit_cont",
                title: "Unidad 1",
                revision: 1,
                meta: { grade: "1° Primaria" },
                messages: [
                  {
                    role: "user",
                    text: "analiza el archivo adjunto",
                    attachments: [{
                      name: "libro.csv",
                      type: "text/csv",
                      storagePath: "charly_attachments/test/libro.csv"
                    }]
                  },
                  {
                    role: "assistant",
                    text: "Empecé a analizarlo."
                  }
                ],
                accepted: {}
              }]
            })
          })
        })
      })
    },
    generateContent: async ({ contents }) => {
      capturedPrompt = contents.flatMap((c) => c.parts.map((p) => p.text || "")).join("\n");
      return {
        candidates: [{ content: { parts: [{ text: "Continuando con el análisis del archivo libro.csv..." }] } }]
      };
    },
    storage: {
      bucket: () => ({
        file: () => ({
          download: async () => [Buffer.from("Unidad,Tema\nUnidad 1,Animales\nUnidad 2,Plantas")]
        })
      })
    }
  };

  const result = await runChatAgent({
    context: mockContext,
    sessionId: "sess_cont",
    targetUnitId: "unit_cont",
    userText: "continua",
    attachments: [] // Sin adjuntos en este turno
  });

  assert.equal(result.text, "Continuando con el análisis del archivo libro.csv...");
  assert.match(capturedPrompt, /libro\.csv/);
  assert.match(capturedPrompt, /Unidad 1,Animales/);
});

test("runChatAgent recupera el archivo de la unidad tras muchos turnos sin adjuntos en mensajes", async () => {
  let capturedPrompt = "";
  const source = {
    name: "programa.csv",
    type: "text/csv",
    storagePath: "charly_attachments/test-user-revisit/sess_revisit/programa.csv"
  };
  const mockContext = {
    uid: "test-user-revisit",
    db: {
      collection: () => ({ doc: () => ({ get: async () => ({
        exists: true,
        data: () => ({
          id: "sess_revisit", ownerId: "test-user-revisit",
          academicMeta: { grade: "1° Primaria" },
          units: [{ id: "unit_revisit", title: "Unidad 1", meta: {}, accepted: {},
            sourceAttachments: [source],
            messages: Array.from({ length: 22 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", text: `Turno ${index}` })) }]
        })
      }) }) })
    },
    generateContent: async ({ contents }) => {
      capturedPrompt = contents.flatMap((item) => item.parts.map((part) => part.text || "")).join("\n");
      return { candidates: [{ content: { parts: [{ text: "Lo encontré." }] } }] };
    },
    storage: { bucket: () => ({ file: () => ({
      download: async () => [Buffer.from("Unidad,Tema\nUnidad 13,Fracciones y decimales")]
    }) }) }
  };

  const result = await runChatAgent({ context: mockContext, sessionId: "sess_revisit",
    targetUnitId: "unit_revisit", userText: "Vuelve a analizar el PDF", attachments: [] });
  assert.equal(result.text, "Lo encontré.");
  assert.match(capturedPrompt, /programa\.csv/);
  assert.match(capturedPrompt, /Unidad 13,Fracciones y decimales/);
});

test("runChatAgent conserva y consulta dos archivos subidos en turnos distintos", async () => {
  const paths = ["charly_attachments/user/session/uno.csv", "charly_attachments/user/session/dos.csv"];
  let capturedPrompt = "";
  const context = {
    uid: "user",
    db: { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({
      ownerId: "user", units: [{ id: "unit", meta: {}, accepted: {}, messages: [],
        sourceAttachmentsManaged: true, sourceAttachments: paths.map((storagePath, index) => ({
          name: `${index ? "dos" : "uno"}.csv`, type: "text/csv", storagePath
        })) }]
    }) }) }) }) },
    storage: { bucket: () => ({ file: (path) => ({
      download: async () => [Buffer.from(path === paths[0] ? "Clave,Valor\nA,Animales" : "Clave,Valor\nB,Plantas")]
    }) }) },
    generateContent: async ({ contents }) => {
      capturedPrompt = contents.flatMap((item) => item.parts.map((part) => part.text || "")).join("\n");
      return { candidates: [{ content: { parts: [{ text: "Comparé los archivos." }] } }] };
    }
  };
  await runChatAgent({ context, sessionId: "session", targetUnitId: "unit", userText: "Compara los dos archivos" });
  assert.match(capturedPrompt, /A,Animales/);
  assert.match(capturedPrompt, /B,Plantas/);
});

test("runChatAgent rescata el último PDF de Storage si una sesión antigua perdió sus referencias", async () => {
  let capturedParts = [];
  const PDFDocument = require("pdfkit");
  const doc = new PDFDocument();
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => doc.on("end", resolve));
  doc.text("Unidad 13 Fracciones decimales");
  doc.end();
  await done;
  const pdfBuffer = Buffer.concat(chunks);
  const path = "charly_attachments/legacy-user/legacy-session/1700000000000_programa.pdf";
  const context = {
    uid: "legacy-user",
    db: { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({
      id: "legacy-session", ownerId: "legacy-user", units: [{ id: "unit-1", meta: {}, messages: [], accepted: {} }]
    }) }) }) }) },
    storage: { bucket: () => ({
      getFiles: async () => [[{ name: path, metadata: { contentType: "application/pdf", size: pdfBuffer.length, timeCreated: "2026-09-30T12:00:00Z" } }]],
      file: () => ({ download: async () => [pdfBuffer] })
    }) },
    generateContent: async ({ contents }) => {
      capturedParts = contents.flatMap((item) => item.parts);
      return { candidates: [{ content: { parts: [{ text: "Encontré el programa." }] } }] };
    }
  };
  const result = await runChatAgent({ context, sessionId: "legacy-session", targetUnitId: "unit-1",
    userText: "Vuelve a analizar el PDF", attachments: [] });
  assert.equal(result.sourceAttachments[0].storagePath, path);
  assert.ok(capturedParts.some((part) => part.text?.includes("Fracciones decimales")));
});

test("eliminar un archivo borra Storage, caché y contexto sin recuperarlo del historial", async (t) => {
  const express = require("express");
  const path = "charly_attachments/test-user/session-1/libro.pdf";
  let deletedPath = "";
  let deletedCheckpoint = false;
  let stored = {
    id: "session-1", ownerUid: "test-user", units: [{ id: "unit-1", meta: {}, accepted: {},
      sourceAttachments: [{ name: "libro.pdf", storagePath: path }], sourceAttachmentsManaged: true,
      messages: [{ id: "message-1", role: "user", text: "Lee el libro", attachments: [{ name: "libro.pdf", storagePath: path }] }]
    }]
  };
  const db = { collection: (name) => ({ doc: () => name === "users"
    ? { get: async () => ({ exists: false }) }
    : name === "charlyBrownDocumentCheckpoints"
      ? { delete: async () => { deletedCheckpoint = true; } }
      : { get: async () => ({ id: "session-1", exists: true, data: () => stored }),
          set: async (value) => { stored = structuredClone(value); } } }) };
  const app = express();
  app.use(express.json());
  registerCharlyBrownMcpRoutes(app, {
    db, bucket: { file: (filePath) => ({ delete: async () => { deletedPath = filePath; } }) },
    verifyFirebaseBearer: async () => ({ uid: "test-user", decoded: { role: "editor" } }),
    generateText: async () => "", generateContent: async () => ({})
  });
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/charly-brown/attachments/delete`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body: JSON.stringify({ sessionId: "session-1", targetUnitId: "unit-1", storagePath: path })
  });
  assert.equal(response.status, 200);
  assert.equal(deletedPath, path);
  assert.equal(deletedCheckpoint, true);
  assert.deepEqual(stored.units[0].sourceAttachments, []);
  assert.equal(stored.units[0].sourceAttachmentsManaged, true);
  assert.deepEqual(stored.units[0].messages[0].attachments, []);
  let storageScans = 0;
  let prompt = "";
  await runChatAgent({
    context: { uid: "test-user", db,
      storage: { bucket: () => ({ getFiles: async () => { storageScans += 1; return [[]]; } }) },
      generateContent: async ({ contents }) => {
        prompt = contents.flatMap((item) => item.parts.map((part) => part.text || "")).join("\n");
        return { candidates: [{ content: { parts: [{ text: "Archivo eliminado." }] } }] };
      }
    },
    sessionId: "session-1", targetUnitId: "unit-1", userText: "Vuelve a analizar el PDF"
  });
  assert.equal(storageScans, 0);
  assert.doesNotMatch(prompt, /libro\.pdf/);
});
