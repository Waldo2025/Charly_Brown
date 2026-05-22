const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");

const serviceAccountPath = path.resolve(__dirname, "..", "charly-brown-firebase-adminsdk-fbsvc-6c32e4f96b.json");

console.log("Loading service account from:", serviceAccountPath);
if (!fs.existsSync(serviceAccountPath)) {
  console.error("Service account file not found!");
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
const projectId = serviceAccount.project_id || "charly-brown";
const storageBucket = "charly-brown.firebasestorage.app";

console.log("Initializing Firebase Admin with project:", projectId, "and bucket:", storageBucket);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket,
  projectId
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function testUpload() {
  try {
    console.log("Probing bucket metadata for:", bucket.name);
    await bucket.getMetadata();
    console.log("Bucket metadata successfully retrieved!");

    const testPath = `test-diagnostics/${Date.now()}_test.txt`;
    console.log("Saving test file to storage path:", testPath);
    const file = bucket.file(testPath);
    await file.save("Hello, World from diagnostics!", {
      resumable: false,
      contentType: "text/plain"
    });
    console.log("File saved successfully!");

    const exists = await file.exists();
    console.log("File exists check returned:", exists);

    console.log("Deleting test file...");
    await file.delete();
    console.log("Test completed successfully! Storage is fully functional and writable.");
  } catch (error) {
    console.error("FAILED to write/access Firebase Storage:", error);
  }
}

testUpload();
