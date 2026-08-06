const crypto = require("node:crypto");
const { getAdminServices, resolveAuthContext } = require("./common.js");
const { DEFAULT_LIVE_MODEL } = require("./vertex.js");

const LIVE_TICKET_TTL_MS = 2 * 60 * 1000;
const DEFAULT_LIVE_PROXY_URL = "https://gemini-live-proxy-128488238449.us-central1.run.app";
const ALLOWED_VOICES = Object.freeze([
  "Zephyr", "Kore", "Orus", "Autonoe", "Umbriel", "Erinome", "Laomedeia", "Schedar",
  "Achird", "Sadachbia", "Puck", "Fenrir", "Aoede", "Enceladus", "Algieba", "Algenib",
  "Achernar", "Gacrux", "Zubenelgenubi", "Sadaltager", "Charon", "Leda", "Callirrhoe",
  "Iapetus", "Despina", "Rasalgethi", "Alnilam", "Pulcherrima", "Vindemiatrix", "Sulafat"
]);

function normalizeVoiceName(value = "") {
  const requested = String(value || "").trim();
  return ALLOWED_VOICES.find((voice) => voice.toLowerCase() === requested.toLowerCase()) || "Aoede";
}

async function createLiveTicket(req) {
  const authContext = await resolveAuthContext(req);
  const proxyBaseUrl = String(process.env.GEMINI_LIVE_PROXY_URL || DEFAULT_LIVE_PROXY_URL).trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(proxyBaseUrl)) {
    throw Object.assign(new Error("gemini_live_proxy_not_configured"), { status: 503 });
  }
  const { db, admin } = getAdminServices();
  const ticket = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + LIVE_TICKET_TTL_MS);
  const voiceName = normalizeVoiceName(req.body?.voiceName);
  const systemInstruction = String(req.body?.systemInstruction || "").trim().slice(0, 12000);
  const model = DEFAULT_LIVE_MODEL;
  await db.collection("gemini_live_tickets").doc(ticket).set({
    ownerId: authContext.uid,
    model,
    voiceName,
    systemInstruction,
    status: "issued",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromDate(expiresAt)
  });
  return {
    websocketUrl: `${proxyBaseUrl.replace(/^http/i, "ws")}/live`,
    ticket,
    expiresAt: expiresAt.toISOString(),
    model,
    voiceName
  };
}

module.exports = {
  LIVE_TICKET_TTL_MS,
  DEFAULT_LIVE_PROXY_URL,
  ALLOWED_VOICES,
  normalizeVoiceName,
  createLiveTicket
};
