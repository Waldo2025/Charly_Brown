const admin = require("firebase-admin");
const path = require("path");

const serviceAccountPath = path.resolve(__dirname, "..", "charly-brown-firebase-adminsdk-fbsvc-6c32e4f96b.json");
admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath)),
  projectId: "charly-brown"
});

const db = admin.firestore();

async function run() {
  console.log("Querying latest 10 export jobs...");
  const snap = await db.collection("podcaster_export_jobs")
    .orderBy("createdAt", "desc")
    .limit(10)
    .get();

  if (snap.empty) {
    console.log("No jobs found.");
    return;
  }

  snap.forEach(doc => {
    const job = doc.data();
    console.log("--------------------------------------------------");
    console.log(`Job ID: ${job.jobId}`);
    console.log(`Status: ${job.status}`);
    console.log(`Stage: ${job.stage}`);
    console.log(`Scene Substage: ${job.sceneSubstage}`);
    console.log(`Progress: ${job.progress}`);
    console.log(`Hint: ${job.hint}`);
    console.log(`Created At: ${job.createdAt}`);
    console.log(`Updated At: ${job.updatedAt}`);
    console.log(`Heartbeat At: ${job.heartbeatAt}`);
    if (job.error) {
      console.log(`Error:`, JSON.stringify(job.error, null, 2));
    }
    if (job.warnings && job.warnings.length) {
      console.log(`Warnings:`, job.warnings);
    }
  });
}

run().catch(err => {
  console.error("Error running script:", err);
});
