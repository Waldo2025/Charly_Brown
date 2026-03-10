const admin = require("firebase-admin");
const path = require("path");

const serviceAccountPath = path.resolve(__dirname, "..", "charly-brown-firebase-adminsdk-fbsvc-6c32e4f96b.json");
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

function normalizeSegments(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return normalizeSegments(parsed);
    } catch {
      return [];
    }
  }
  if (typeof raw === "object") {
    return Object.values(raw);
  }
  return [];
}

function ensureArray(val) {
  return Array.isArray(val) ? val : [];
}

function isPlainObject(val) {
  return val && typeof val === "object" && !Array.isArray(val);
}

async function main() {
  const sessionId = process.argv[2];
  if (!sessionId) {
    console.error("Usage: node repairSession.js <sessionId>");
    process.exit(1);
  }

  const ref = db.collection("audioTranslate").doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error("Session not found:", sessionId);
    process.exit(1);
  }

  const data = snap.data() || {};
  let segments = normalizeSegments(data.segments);

  if (!segments.length) {
    // Fallback: try root numeric keys
    const numericKeys = Object.keys(data).filter(k => /^\d+$/.test(k));
    if (numericKeys.length) {
      segments = numericKeys.map(k => data[k]).filter(v => v && typeof v === "object");
    }
  }

  if (!segments.length) {
    console.error("No segments found to repair for session:", sessionId);
    process.exit(2);
  }

  let maxId = 0;
  for (const seg of segments) {
    if (typeof seg?.id === "number" && Number.isFinite(seg.id)) {
      if (seg.id > maxId) maxId = seg.id;
    }
  }

  let changed = false;

  const cleaned = segments.map((seg, idx) => {
    const clean = isPlainObject(seg) ? { ...seg } : {};

    if (!clean.id || typeof clean.id !== "number") {
      maxId += 1;
      clean.id = maxId;
      changed = true;
    }

    if (!clean.raw && clean.original_raw) {
      clean.raw = clean.original_raw;
      changed = true;
    }

    if (clean.raw && !clean.original_raw) {
      clean.original_raw = clean.raw;
      changed = true;
    }

    if (!clean.status) {
      clean.status = clean.raw ? "done" : "stopped";
      changed = true;
    }

    if (clean.analyses && !isPlainObject(clean.analyses)) {
      clean.analyses = {};
      changed = true;
    }

    if (clean.analisis_voces && !isPlainObject(clean.analisis_voces)) {
      clean.analisis_voces = { transcripcion_estructurada: [] };
      changed = true;
    }

    if (clean.analisis_voces && !Array.isArray(clean.analisis_voces.transcripcion_estructurada)) {
      clean.analisis_voces.transcripcion_estructurada = [];
      changed = true;
    }

    if (clean.status === "processing") {
      const tone = clean.generatingTone;
      if (tone && clean.analyses?.[tone]) {
        clean.status = "done";
        delete clean.generatingTone;
        changed = true;
      } else if (!tone) {
        clean.status = clean.raw ? "done" : "stopped";
        changed = true;
      } else if (!clean.raw) {
        clean.status = "error";
        clean.error = clean.error || "No hay texto base para procesar";
        delete clean.generatingTone;
        changed = true;
      } else {
        // Mark as done to allow reprocessing in UI
        clean.status = "done";
        delete clean.generatingTone;
        changed = true;
      }
    }

    if (clean.timerInterval !== null) {
      clean.timerInterval = null;
      changed = true;
    }

    return clean;
  });

  if (!changed) {
    console.log("No repairs needed for session:", sessionId);
    process.exit(0);
  }

  await ref.set(
    {
      segments: cleaned,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log("Repaired session:", sessionId, "segments:", cleaned.length);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
