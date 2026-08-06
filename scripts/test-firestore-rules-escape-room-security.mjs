import assert from "node:assert/strict";
import fs from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

const projectId = `pigpen-security-${Date.now()}`;
const rules = fs.readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const [host = "127.0.0.1", portText = "8080"] = String(
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080"
).split(":");

const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: { host, port: Number(portText), rules },
});

const ownerId = "teacher-owner";
const otherId = "teacher-other";
const privateId = "private-session";
const publishedId = "published-session";

function session(owner, status, title) {
  return {
    ownerId: owner,
    ownerEmail: `${owner}@example.test`,
    title,
    status,
    schemaVersion: 2,
    topicCount: 1,
    topicSummaries: [],
  };
}

function topic(title) {
  return { academicNumber: 1, title, formState: {}, project: {} };
}

try {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "escapeRoom", privateId), session(ownerId, "draft", "Privada"));
    await setDoc(doc(db, "escapeRoom", privateId, "topics", "topic-1"), topic("Tema privado"));
    await setDoc(doc(db, "escapeRoom", publishedId), session(ownerId, "published", "Publicada"));
    await setDoc(doc(db, "escapeRoom", publishedId, "topics", "topic-1"), topic("Tema publicado"));
  });

  const ownerDb = testEnv.authenticatedContext(ownerId).firestore();
  const otherDb = testEnv.authenticatedContext(otherId).firestore();
  const adminDb = testEnv.authenticatedContext("moderator", { role: "admin" }).firestore();
  const anonymousDb = testEnv.unauthenticatedContext().firestore();

  await assertSucceeds(getDoc(doc(ownerDb, "escapeRoom", privateId)));
  await assertSucceeds(updateDoc(doc(ownerDb, "escapeRoom", privateId), { title: "Privada actualizada" }));
  await assertFails(getDoc(doc(otherDb, "escapeRoom", privateId)));
  await assertFails(getDoc(doc(otherDb, "escapeRoom", privateId, "topics", "topic-1")));

  await assertSucceeds(getDoc(doc(otherDb, "escapeRoom", publishedId)));
  await assertSucceeds(getDoc(doc(otherDb, "escapeRoom", publishedId, "topics", "topic-1")));
  await assertFails(getDoc(doc(anonymousDb, "escapeRoom", publishedId)));

  await assertSucceeds(getDoc(doc(adminDb, "escapeRoom", privateId)));
  await assertSucceeds(updateDoc(doc(adminDb, "escapeRoom", privateId), { title: "Moderada" }));
  await assertFails(updateDoc(doc(ownerDb, "escapeRoom", privateId), { ownerId: otherId }));

  const publishedQuery = query(collection(otherDb, "escapeRoom"), where("status", "==", "published"));
  const ownerQuery = query(collection(ownerDb, "escapeRoom"), where("ownerId", "==", ownerId));
  await assertSucceeds(getDocs(publishedQuery));
  const ownerSnapshot = await assertSucceeds(getDocs(ownerQuery));
  assert.equal(ownerSnapshot.size, 2, "La consulta del propietario debe devolver únicamente sus sesiones.");
  await assertFails(getDocs(collection(otherDb, "escapeRoom")));

  console.log("PigPen Firestore security rules OK.");
} finally {
  await testEnv.cleanup();
}
