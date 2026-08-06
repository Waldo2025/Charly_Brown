"use strict";

const http = require("node:http");
const { URL } = require("node:url");
const { WebSocketServer, WebSocket } = require("ws");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { GoogleGenAI } = require("@google/genai");
const { parseClientMessage, forwardClientMessage } = require("./protocol.js");

const PORT = Math.max(1, Number(process.env.PORT || 8080) || 8080);
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "charly-brown";
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || "global";
const ALLOWED_ORIGINS = new Set(
  String(process.env.ALLOWED_ORIGINS || "https://charly-brown.web.app,https://charly-brown.firebaseapp.com")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
);

if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();
const ai = new GoogleGenAI({ vertexai: true, project: PROJECT_ID, location: LOCATION });

async function consumeTicket(ticket) {
  const ref = db.collection("gemini_live_tickets").doc(ticket);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw Object.assign(new Error("live_ticket_not_found"), { status: 401 });
    const data = snapshot.data() || {};
    const expiresAt = data.expiresAt?.toMillis?.() || 0;
    if (String(data.status || "") !== "issued" || !expiresAt || expiresAt < Date.now()) {
      throw Object.assign(new Error("live_ticket_expired_or_used"), { status: 401 });
    }
    transaction.set(ref, {
      status: "consumed",
      consumedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return {
      ownerId: String(data.ownerId || ""),
      model: String(data.model || "gemini-live-2.5-flash-native-audio"),
      voiceName: String(data.voiceName || "Aoede"),
      systemInstruction: String(data.systemInstruction || "").slice(0, 12000)
    };
  });
}

function sendJson(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return res.end(JSON.stringify({ ok: true, service: "gemini-live-proxy", provider: "vertex-ai" }));
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  return res.end(JSON.stringify({ error: "not_found" }));
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 3 * 1024 * 1024 });

server.on("upgrade", async (req, socket, head) => {
  const origin = String(req.headers.origin || "").trim();
  const parsed = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (parsed.pathname !== "/live" || !ALLOWED_ORIGINS.has(origin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return socket.destroy();
  }
  try {
    const ticket = String(parsed.searchParams.get("ticket") || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(ticket)) {
      throw Object.assign(new Error("invalid_live_ticket"), { status: 401 });
    }
    req.liveClaim = await consumeTicket(ticket);
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  } catch (error) {
    const status = Number(error?.status) === 401 ? 401 : 500;
    console.warn(JSON.stringify({ severity: "WARNING", event: "live_rejected", code: String(error?.message || error) }));
    socket.write(`HTTP/1.1 ${status} ${status === 401 ? "Unauthorized" : "Internal Server Error"}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  }
});

wss.on("connection", async (socket, req) => {
  let session = null;
  try {
    const claim = req.liveClaim;
    if (!claim) throw new Error("live_ticket_claim_missing");
    session = await ai.live.connect({
      model: claim.model,
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: claim.voiceName } } },
        ...(claim.systemInstruction ? { systemInstruction: claim.systemInstruction } : {})
      },
      callbacks: {
        onopen: () => sendJson(socket, { type: "ready", model: claim.model, voiceName: claim.voiceName }),
        onmessage: (message) => sendJson(socket, { type: "serverContent", message }),
        onerror: (error) => sendJson(socket, { type: "error", code: "vertex_live_error", message: String(error?.message || error) }),
        onclose: () => socket.close(1000, "vertex_closed")
      }
    });
    socket.on("message", async (raw) => {
      try {
        const message = parseClientMessage(raw);
        await forwardClientMessage(session, message);
      } catch (error) {
        sendJson(socket, { type: "error", code: String(error?.code || error?.message || "invalid_live_message") });
      }
    });
    socket.on("close", () => Promise.resolve(session?.close?.()).catch(() => {}));
    socket.on("error", () => Promise.resolve(session?.close?.()).catch(() => {}));
    console.info(JSON.stringify({ severity: "INFO", event: "live_connected", ownerId: claim.ownerId }));
  } catch (error) {
    console.warn(JSON.stringify({ severity: "WARNING", event: "live_rejected", code: String(error?.message || error) }));
    sendJson(socket, { type: "error", code: String(error?.message || "live_connection_rejected") });
    socket.close(1008, "unauthorized");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.info(JSON.stringify({ severity: "INFO", event: "live_proxy_started", port: PORT, projectId: PROJECT_ID, location: LOCATION }));
});

process.on("SIGTERM", () => {
  wss.clients.forEach((socket) => socket.close(1012, "service_restart"));
  server.close(() => process.exit(0));
});
