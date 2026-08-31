import {
  collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, serverTimestamp, setDoc
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { db, getCurrentUser } from "./marcie-firebase.js";

export const MARCIE_CALENDAR_COLLECTION = "MarcieEditorialCalendar";
export const MARCIE_TRENDS_COLLECTION = "MarcieTrendSnapshots";
export const MARCIE_PROFILES_COLLECTION = "MarcieEditorialProfiles";
export const MARCIE_NOTIFICATIONS_COLLECTION = "MarcieNotifications";
export const MARCIE_SETTINGS_COLLECTION = "MarcieEditorialSettings";

const AIDA_CALENDAR_SEED = [
  ["2026-08-26T10:00:00-05:00", "Cómo prepara el cerebro para aprender: sueño, hábitos y arranque", ["parents", "educators"]],
  ["2026-09-23T10:00:00-05:00", "El cerebro emocional: por qué las emociones influyen en el aprendizaje", ["parents", "educators"]],
  ["2026-10-21T10:00:00-05:00", "Memoria y olvido: por qué releer no siempre fija lo aprendido", ["parents", "educators"]],
  ["2026-11-18T10:00:00-05:00", "Atención y pantallas: cómo afectan al cerebro que aprende", ["parents", "educators"]],
  ["2026-12-09T10:00:00-05:00", "Descanso, juego y movimiento: consolidar fuera del aula", ["parents"]],
  ["2027-01-20T10:00:00-05:00", "Qué es la neuroeducación y cómo cambia el aprendizaje", ["parents"]],
  ["2027-02-17T10:00:00-05:00", "El cerebro bilingüe: cómo aprende idiomas", ["parents"]],
  ["2027-03-17T10:00:00-05:00", "Motivación: cuando no querer no es flojera", ["parents", "educators"]],
  ["2027-04-14T10:00:00-05:00", "El error como motor del aprendizaje", ["educators", "parents"]],
  ["2027-05-12T10:00:00-05:00", "Estrés y examen: cuando el miedo bloquea lo aprendido", ["parents", "educators"]],
  ["2027-06-16T10:00:00-05:00", "Carga cognitiva: por qué saturar de contenido no enseña", ["educators", "coordinators"]],
  ["2027-07-14T10:00:00-05:00", "Neurodesarrollo por etapas: qué aprende el cerebro a cada edad", ["parents"]]
];

function cleanJson(value, fallback = {}) {
  try { return JSON.parse(JSON.stringify(value)); } catch (_) { return fallback; }
}

function normalizeSnapshot(snapshot) {
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export function subscribeEditorialCalendar(onUpdate, onError) {
  return onSnapshot(collection(db, MARCIE_CALENDAR_COLLECTION), (snapshot) => {
    const items = normalizeSnapshot(snapshot).sort((a, b) => String(a.publishAtUtc || a.publishAtLocal || "").localeCompare(String(b.publishAtUtc || b.publishAtLocal || "")));
    onUpdate?.(items);
  }, onError);
}

export function subscribeTrendSnapshots(onUpdate, onError) {
  return onSnapshot(collection(db, MARCIE_TRENDS_COLLECTION), (snapshot) => {
    const items = normalizeSnapshot(snapshot).sort((a, b) => String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")));
    onUpdate?.(items);
  }, onError);
}

export function subscribeEditorialProfiles(onUpdate, onError) {
  return onSnapshot(collection(db, MARCIE_PROFILES_COLLECTION), (snapshot) => onUpdate?.(normalizeSnapshot(snapshot)), onError);
}

export function subscribeEditorialNotifications(onUpdate, onError) {
  return onSnapshot(collection(db, MARCIE_NOTIFICATIONS_COLLECTION), (snapshot) => {
    const items = normalizeSnapshot(snapshot).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    onUpdate?.(items);
  }, onError);
}

export async function listEditorialProfilesOnce() {
  return normalizeSnapshot(await getDocs(collection(db, MARCIE_PROFILES_COLLECTION)));
}

export async function saveCalendarItem(item = {}) {
  const user = getCurrentUser();
  if (!user?.uid) throw new Error("Se requiere autenticación.");
  const id = String(item.id || `calendar-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const payload = cleanJson({
    ...item,
    id,
    timezone: item.timezone || "America/Cancun",
    status: item.status || "planned",
    responsibleUid: item.responsibleUid || user.uid,
    updatedBy: user.uid,
    updatedAt: new Date().toISOString(),
    createdAt: item.createdAt || new Date().toISOString()
  });
  await setDoc(doc(db, MARCIE_CALENDAR_COLLECTION, id), payload, { merge: true });
  return { ...payload, id };
}

export async function deleteCalendarItem(id) {
  await deleteDoc(doc(db, MARCIE_CALENDAR_COLLECTION, String(id)));
}

export async function saveEditorialProfile(profile = {}) {
  const user = getCurrentUser();
  if (!user?.uid) throw new Error("Se requiere autenticación.");
  const id = String(profile.id || `profile-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const current = await getDoc(doc(db, MARCIE_PROFILES_COLLECTION, id));
  const version = Number(current.data()?.version || 0) + 1;
  const payload = cleanJson({ ...profile, id, version, updatedBy: user.uid, updatedAt: new Date().toISOString(), createdAt: profile.createdAt || new Date().toISOString() });
  await setDoc(doc(db, MARCIE_PROFILES_COLLECTION, id), payload, { merge: true });
  return payload;
}

export async function readEditorialSettings() {
  const snapshot = await getDoc(doc(db, MARCIE_SETTINGS_COLLECTION, "global"));
  return snapshot.exists() ? snapshot.data() : { cadence: "weekly", region: "MX", timezone: "America/Cancun", discoveryMode: "general_education_brain" };
}

export async function saveEditorialSettings(settings = {}) {
  const user = getCurrentUser();
  const payload = cleanJson({ ...settings, updatedBy: user?.uid || "", updatedAt: new Date().toISOString() });
  await setDoc(doc(db, MARCIE_SETTINGS_COLLECTION, "global"), payload, { merge: true });
  return payload;
}

export async function saveTrendSnapshot(snapshot = {}) {
  const cadence = ["daily", "weekly", "monthly"].includes(snapshot.cadence) ? snapshot.cadence : "weekly";
  const periodKey = String(snapshot.periodKey || editorialPeriodKey(cadence));
  const id = `${cadence}-${periodKey}`.replace(/[^a-z0-9-]/gi, "-");
  const payload = cleanJson({ ...snapshot, id, cadence, generatedAt: new Date().toISOString() });
  await setDoc(doc(db, MARCIE_TRENDS_COLLECTION, id), payload, { merge: true });
  return payload;
}

export function editorialPeriodKey(cadence = "weekly", date = new Date()) {
  const iso = date.toISOString().slice(0, 10);
  if (cadence === "monthly") return iso.slice(0, 7);
  if (cadence === "weekly") {
    const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    return `${utc.getUTCFullYear()}-W${String(Math.ceil((((utc - yearStart) / 86400000) + 1) / 7)).padStart(2, "0")}`;
  }
  return iso;
}

export async function seedAidaEditorialCalendar() {
  const marker = doc(db, MARCIE_SETTINGS_COLLECTION, "aida-calendar-seed-v1");
  if ((await getDoc(marker)).exists()) return false;
  await Promise.all(AIDA_CALENDAR_SEED.map(async ([publishAtLocal, title, audiences], index) => {
    const date = new Date(publishAtLocal);
    const id = `aida-${String(index + 1).padStart(2, "0")}-${publishAtLocal.slice(0, 7)}`;
    await setDoc(doc(db, MARCIE_CALENDAR_COLLECTION, id), {
      id,
      title,
      topic: title,
      editorialMode: "aida",
      audiences,
      audience: audiences[0],
      publishAtLocal,
      publishAtUtc: date.toISOString(),
      timezone: "America/Cancun",
      status: "idea",
      source: "guia-aida-blog",
      blockedReasons: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  }));
  await setDoc(marker, { seededAt: serverTimestamp(), version: 1 });
  return true;
}
