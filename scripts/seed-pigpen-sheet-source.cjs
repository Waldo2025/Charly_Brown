"use strict";
const fs = require("node:fs"), path = require("node:path"), admin = require("firebase-admin");
const root = path.resolve(__dirname,".."), localCredential = path.join(root,"charly-brown-firebase-adminsdk-fbsvc-6c32e4f96b.json"), raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim();
let credential = admin.credential.applicationDefault(), projectId = process.env.FIREBASE_PROJECT_ID || process.env.PROJECT_ID || "charly-brown";
if (raw) { const parsed = JSON.parse(raw); credential = admin.credential.cert(parsed); projectId = parsed.project_id || projectId; } else if (fs.existsSync(localCredential)) { const parsed = JSON.parse(fs.readFileSync(localCredential,"utf8")); credential = admin.credential.cert(parsed); projectId = parsed.project_id || projectId; }
if (!admin.apps.length) admin.initializeApp({credential,projectId});
async function main() { const id = "aprende-escape-rooms-2026-2027"; await admin.firestore().collection("pigpenSheetSources").doc(id).set({ displayName:"Escape Rooms Aprende 2026-2027", spreadsheetId:"1KeIukb-Cu_iv9eiJii3Jg1O2P4-bMgaE7K2OvKSgerg", enabled:true, order:10, maxRows:1000, tabs:[{sheetId:"61907688",label:"Escape Rooms Inglés",language:"en-US",enabled:true},{sheetId:"2076431901",label:"Escape Rooms Español",language:"es-419",enabled:true}], updatedAt:admin.firestore.FieldValue.serverTimestamp() },{merge:true}); console.log(`Seeded pigpenSheetSources/${id}`); }
main().then(()=>process.exit(0)).catch((error)=>{console.error(error?.message || error);process.exit(1);});
