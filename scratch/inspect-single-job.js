const admin = require("firebase-admin");
const path = require("path");

const serviceAccountPath = path.resolve(__dirname, "..", "charly-brown-firebase-adminsdk-fbsvc-6c32e4f96b.json");
admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath)),
  projectId: "charly-brown"
});

const db = admin.firestore();

async function run() {
  const jobId = "21ff6c45-acb8-40ab-9a07-4899acbba6c2";
  console.log(`Querying job ${jobId}...`);
  const doc = await db.collection("podcaster_export_jobs").doc(jobId).get();

  if (!doc.exists) {
    console.log("Job not found.");
    return;
  }

  const job = doc.data();
  console.log(JSON.stringify(job, null, 2));
}

run().catch(err => {
  console.error("Error running script:", err);
});
