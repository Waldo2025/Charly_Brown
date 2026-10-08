import {experience} from './escape-room-experience.mjs?v=20260924-coordinate-grid-v12';

export const DEFAULT_PRESETS = [
  {
    id: 'preset_classic',
    name: 'Clásico',
    config: {
      question_types: ['opcion_multiple', 'verdadero_falso', 'texto', 'relacion_columnas', 'drag_drop', 'completar_espacio', 'ordenar_secuencia', 'multimedia'],
      primary_reward: 'letras',
      extras: []
    },
    structure: { rooms: 4, questionsPerRoom: 4 }
  },
  {
    id: 'preset_logic',
    name: 'Lógica y deducción',
    config: {
      question_types: ['matriz_deduccion', 'clasificar_grupos', 'completar_patron', 'resolver_restricciones', 'opcion_multiple'],
      primary_reward: 'simbolos',
      extras: ['pista']
    },
    structure: { rooms: 4, questionsPerRoom: 4 }
  },
  {
    id: 'preset_math',
    name: 'Matemáticas y escala',
    config: {
      question_types: ['construir_expresion', 'ubicar_escala', 'balancear_cantidades', 'respuesta_coordenadas'],
      primary_reward: 'letras',
      extras: []
    },
    structure: { rooms: 4, questionsPerRoom: 4 }
  },
  {
    id: 'preset_variety',
    name: 'Variedad total',
    config: {
      question_types: ['opcion_multiple', 'respuesta_justificacion', 'marcar_evidencia', 'matriz_deduccion', 'construir_solucion', 'clasificar_grupos'],
      primary_reward: 'imagen',
      extras: ['pista']
    },
    structure: { rooms: 4, questionsPerRoom: 4 }
  }
];

export const LEGACY_PRESETS_KEY = 'pigpen.experiencePresets.v1';
export const presetNameKey = name => String(name || '').normalize('NFC').trim().toLowerCase();
const cacheKey = uid => `pigpen.experiencePresets.v2:${encodeURIComponent(uid)}`;
const draftKey = uid => `pigpen.experiencePresetDraft.v1:${encodeURIComponent(uid)}`;
const failure = (message, code) => Object.assign(new Error(message), {code});

export function normalizePreset(value, {allowDefault = false} = {}) {
  const name = String(value?.name || '').normalize('NFC').trim();
  if (!name || [...name].length > 28) throw failure('El nombre debe tener entre 1 y 28 caracteres.', 'invalid-preset');
  if (!value?.config || !Array.isArray(value.config.question_types) || !value.config.question_types.length) throw failure('Selecciona al menos un tipo de pregunta.', 'invalid-preset');
  if (value.config.extras !== undefined && !Array.isArray(value.config.extras)) throw failure('Revisa los premios adicionales.', 'invalid-preset');
  if (value.config.reward_image && typeof value.config.reward_image !== 'string') throw failure('La imagen del preset no es válida.', 'invalid-preset');
  if (value.config.question_types.some(id => !experience.types.includes(id)) || (value.config.primary_reward && !experience.rewards.some(r => r.id === value.config.primary_reward)) || (value.config.extras || []).some(id => !experience.extras.some(r => r.id === id))) throw failure('El preset contiene opciones no compatibles.', 'invalid-preset');
  const config = experience.config(value.config);
  if (config.reward_image_alt.length > 500) throw failure('La descripción de la imagen supera 500 caracteres.', 'invalid-preset');
  const issues = experience.configIssues(config);
  // Default image rewards intentionally use the game's automatic image.
  if (issues.length) throw failure(issues.join(' '), 'invalid-preset');
  const rooms = Number(value?.structure?.rooms), questionsPerRoom = Number(value?.structure?.questionsPerRoom);
  if (!Number.isInteger(rooms) || rooms < 1 || rooms > 8 || !Number.isInteger(questionsPerRoom) || questionsPerRoom < 1) throw failure('Revisa las salas y las preguntas por sala.', 'invalid-preset');
  const image = value.config.reward_image || '';
  if (image.length > 350000 || (image && !/^(data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+|https:\/\/[^\s]+)$/.test(image))) throw failure('La imagen del preset debe ser PNG, JPEG o WebP y ocupar menos de 350 KB codificada.', 'invalid-preset');
  const normalized = {id: String(value.id || ''), name, nameKey: presetNameKey(name), config, structure: {rooms, questionsPerRoom}, version: 1};
  if (new TextEncoder().encode(JSON.stringify(normalized)).length > 512000) throw failure('El preset es demasiado grande.', 'invalid-preset');
  return normalized;
}

export async function presetIdForName(name) {
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(presetNameKey(name)));
  return 'preset_' + [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join('');
}

export function createPresetStore({adapter, storage = globalThis.localStorage, online = () => globalThis.navigator?.onLine !== false}) {
  let uid = '', epoch = 0, presets = [], source = 'none', ready = false, warning = '', error = '', busy = false, loading = null;
  const listeners = new Set();
  const readLocal = key => {try {return JSON.parse(storage?.getItem(key) || 'null');} catch {return null;}};
  const writeLocal = (key, value) => {try {storage?.setItem(key, JSON.stringify(value));} catch {warning = 'No se pudo guardar la copia local en este navegador. Firebase conserva los presets ya sincronizados.';}};
  const current = (owner, generation) => {if (uid !== owner || epoch !== generation) throw failure('La cuenta cambió. Vuelve a abrir la configuración.', 'account-changed');};
  const validList = items => (Array.isArray(items) ? items : []).flatMap(item => {try {return [{...normalizePreset(item, {allowDefault: true}), revision: Number(item.revision || 0), seeded: item.seeded === true}];} catch {return [];}});
  const state = () => ({uid, presets: structuredClone(presets), source, ready, busy, warning, error, legacyAvailable: Array.isArray(readLocal(LEGACY_PRESETS_KEY)), draft: uid ? readLocal(draftKey(uid)) : null});
  const emit = () => {for (const listener of listeners) listener(state());};
  const cache = () => {writeLocal(cacheKey(uid), {version: 2, presets});};
  async function hydrate() {
    const owner = uid, generation = epoch;
    if (!owner) return state();
    if (!online()) {source = 'cache'; ready = false; error = 'Sin conexión: se muestran los presets guardados en este navegador.'; emit(); return state();}
    busy = true; error = ''; emit();
    try {
      await adapter.initialize(owner, DEFAULT_PRESETS.map(p => normalizePreset(p, {allowDefault: true})));
      current(owner, generation);
      const items = await adapter.load(owner);
      current(owner, generation);
      presets = validList(items); source = 'cloud'; ready = true; cache();
    } catch (e) {
      if (uid !== owner || epoch !== generation || e.code === 'account-changed') return state();
      current(owner, generation); source = 'cache'; ready = false; error = e.message || 'No se pudieron recuperar los presets de Firebase.';
    } finally {if (uid === owner && epoch === generation) {busy = false; emit();}}
    return state();
  }
  async function mutate(action) {
    if (!uid || !ready || source !== 'cloud' || !online()) throw failure('Conéctate y recarga los presets antes de guardar o eliminar.', 'offline');
    if (busy) throw failure('Espera a que termine la sincronización.', 'busy');
    const owner = uid, generation = epoch; busy = true; error = ''; emit();
    try {const result = await action(owner, () => current(owner, generation)); current(owner, generation); cache(); return result;}
    catch (e) {if (uid === owner && epoch === generation) error = e.code === 'preset-conflict' ? 'Este preset cambió en otro dispositivo. Recarga la biblioteca; tu borrador se conserva.' : e.message; throw e;}
    finally {if (uid === owner && epoch === generation) {busy = false; emit();}}
  }
  return {
    state,
    load() {if (loading) return loading; if (busy) return Promise.resolve(state()); const generation = epoch; const promise = hydrate().finally(() => {if (epoch === generation && loading === promise) loading = null;}); loading = promise; return promise;},
    subscribe(listener) {listeners.add(listener); listener(state()); return () => listeners.delete(listener);},
    setUser(nextUid) {uid = String(nextUid || ''); epoch++; loading = null; presets = uid ? validList(readLocal(cacheKey(uid))?.presets) : []; source = uid ? 'cache' : 'none'; ready = false; busy = false; error = ''; warning = ''; emit();},
    saveDraft(value) {if (uid) {writeLocal(draftKey(uid), value); emit();}},
    clearDraft() {if (uid) {try {storage?.removeItem(draftKey(uid));} catch {} emit();}},
    async save(value) {
      const owner = uid, generation = epoch;
      this.saveDraft(value);
      const clean = normalizePreset(value);
      const previous = presets.find(p => p.nameKey === clean.nameKey);
      clean.id = previous?.id || await presetIdForName(clean.name);
      current(owner, generation);
      return mutate(async (owner, check) => {
        const result = await adapter.save(owner, clean, previous?.revision || 0);
        check();
        presets = [...presets.filter(p => p.id !== clean.id), result]; this.clearDraft(); return result;
      });
    },
    async remove(id) {const previous = presets.find(p => p.id === id); if (!previous) return; return mutate(async (owner, check) => {await adapter.remove(owner, id, previous.revision); check(); presets = presets.filter(p => p.id !== id);});},
    async importLegacy() {
      const legacy = readLocal(LEGACY_PRESETS_KEY);
      if (!Array.isArray(legacy)) throw failure('No hay presets antiguos para importar.', 'invalid-preset');
      return mutate(async (owner, check) => {
        let imported = 0; const conflicts = [], invalid = [];
        for (const item of legacy) {
          let value;
          try {value = normalizePreset({...item, config: {...item?.config, extras: (item?.config?.extras || []).filter(id => id !== 'recompensa_visual')}});} catch {invalid.push(String(item?.name || 'Sin nombre')); continue;}
          const old = presets.find(p => p.nameKey === value.nameKey);
          if (old && !old.seeded) {conflicts.push(value.name); continue;}
          value.id = old?.id || await presetIdForName(value.name);
          check();
          try {const saved = await adapter.save(owner, value, old?.revision || 0); check(); presets = [...presets.filter(p => p.id !== value.id), saved]; imported++; cache();}
          catch (e) {if (e.code === 'preset-conflict') conflicts.push(value.name); else if (e.code === 'invalid-preset') invalid.push(value.name); else throw e;}
        }
        // The unscoped legacy key remains as an explicit recovery backup.
        return {imported, conflicts, invalid};
      });
    }
  };
}
