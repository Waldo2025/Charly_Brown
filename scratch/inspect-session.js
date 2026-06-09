const admin = require("firebase-admin");
const path = require("path");

const serviceAccountPath = path.resolve(__dirname, "..", "charly-brown-firebase-adminsdk-fbsvc-6c32e4f96b.json");
admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath)),
  projectId: "charly-brown"
});

const db = admin.firestore();

async function run() {
  const sessionId = "session_0ufm9i7h";
  console.log(`Querying session ${sessionId}...`);
  const doc = await db.collection("podcaster_sessions").doc(sessionId).get();

  if (!doc.exists) {
    console.log("Session not found.");
    return;
  }

  const rootDoc = doc.data();
  const session = rootDoc.session || {};

  if (session.dialogueAudioMap) {
    console.log("\nChecking models in dialogueAudioMap:");
    for (const [rowId, clip] of Object.entries(session.dialogueAudioMap)) {
      console.log(`Row: ${rowId}`);
      console.log(`  model: ${clip.model}`);
      console.log(`  wordTimings length: ${clip.wordTimings ? clip.wordTimings.length : "undefined"}`);
    }
  } else {
    console.log("\nNo dialogueAudioMap found in session.session.");
  }
}

run().catch(err => {
  console.error("Error running script:", err);
});
