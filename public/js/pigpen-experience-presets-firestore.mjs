import {normalizePreset} from './pigpen-experience-presets.mjs?v=20261006-account-presets-v2';

const conflict = () => Object.assign(new Error('El preset cambió en otro dispositivo.'), {code: 'preset-conflict'});

export function createFirestorePresetAdapter(db, {doc, collection, getDocsFromServer, runTransaction, serverTimestamp}) {
  const ref = (uid, id) => doc(db, 'users', uid, 'pigpenExperiencePresets', id);
  const record = (value, old, seeded = false) => ({...normalizePreset(value, {allowDefault: seeded}), revision: Number(old?.revision || 0) + 1, seeded, createdAt: old?.createdAt || serverTimestamp(), updatedAt: serverTimestamp()});
  return {
    async initialize(uid, defaults) {
      await runTransaction(db, async tx => {
        const marker = doc(db, 'users', uid, 'pigpenExperienceState', 'library');
        if ((await tx.get(marker)).exists()) return;
        const existing = await Promise.all(defaults.map(p => tx.get(ref(uid, p.id))));
        defaults.forEach((p, index) => {if (!existing[index].exists()) tx.set(ref(uid, p.id), record(p, null, true));});
        tx.set(marker, {version: 1, initialized: true, createdAt: serverTimestamp()});
      });
    },
    async load(uid) {const snapshot = await getDocsFromServer(collection(db, 'users', uid, 'pigpenExperiencePresets')); return snapshot.docs.map(d => ({...d.data(), id: d.id}));},
    async save(uid, value, expectedRevision) {
      const saved = await runTransaction(db, async tx => {
        const target = ref(uid, value.id), snapshot = await tx.get(target), old = snapshot.exists() ? snapshot.data() : null;
        if (Number(old?.revision || 0) !== expectedRevision) throw conflict();
        const next = record(value, old); tx.set(target, next); return next;
      });
      return {...normalizePreset(saved), revision: saved.revision, seeded: false};
    },
    async remove(uid, id, expectedRevision) {
      await runTransaction(db, async tx => {const target = ref(uid, id), snapshot = await tx.get(target); if (!snapshot.exists() || snapshot.data().revision !== expectedRevision) throw conflict(); tx.delete(target);});
    }
  };
}
