// Topic identity is its document ID, never its academic number.
export function topicAcademic(topic = {}, session = {}) {
  const result = {};
  for (const [field, input] of Object.entries({ nivel: 'nivelSelect', grado: 'gradoSelect', materia: 'materiaSelect', trimestre: 'trimestreSelect' })) {
    result[field] = String(topic.project?.[field] || topic.formState?.[input] || topic[field] || session[field] || session.project?.[field] || session.formState?.[input] || '').trim();
  }
  const trimester = result.trimestre.match(/^[^\d]*([123])[^\d]*$/);
  result.trimestre = trimester?.[1] || '';
  return result;
}

export function topicSummary(topic, session = {}) {
  return { id: topic.id, academicNumber: Number(topic.academicNumber) || 1,
    title: topic.project?.titulo || topic.title || 'Nuevo escape room', hasProject: Boolean(topic.project),
    ...topicAcademic(topic, session) };
}

export function compareTopics(a, b) {
  return (Number(topicAcademic(a).trimestre) || 4) - (Number(topicAcademic(b).trimestre) || 4)
    || (Number(a.academicNumber) || 1) - (Number(b.academicNumber) || 1)
    || String(a.project?.titulo || a.title || '').localeCompare(String(b.project?.titulo || b.title || ''), 'es')
    || String(a.id).localeCompare(String(b.id));
}

const textKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es');
export function sessionTopicCandidates(session = {}) {
  return session.topicSummaries?.length ? session.topicSummaries : [{
    ...topicAcademic({}, session), academicNumber: String(session.tema || session.project?.tema || session.unidad || session.project?.unidad || session.formState?.unidadTemaSelect || '').match(/\d+/)?.[0] || ''
  }];
}

export function topicMatchesFilters(topic, filters = {}, fallback = {}) {
  const academic = topicAcademic(topic, fallback);
  return (!filters.theme || String(topic.academicNumber) === String(filters.theme))
    && ['nivel', 'grado', 'materia', 'trimestre'].every(field => !filters[field] || textKey(academic[field]) === textKey(filters[field]));
}

export function matchingSessionTopics(session, filters) {
  return sessionTopicCandidates(session).filter(topic => topicMatchesFilters(topic, filters, session));
}

function stable(value) {
  if (value?.toJSON) return stable(value.toJSON());
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
export const transferFingerprint = value => JSON.stringify(stable(value));

export function ownedStoragePath(value, bucket) {
  if (typeof value !== 'string') return null;
  if (value.startsWith(`gs://${bucket}/`)) return value.slice(bucket.length + 6);
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) return null;
    if (url.hostname === 'firebasestorage.googleapis.com' || ['localhost', '127.0.0.1'].includes(url.hostname)) {
      const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
      return match && decodeURIComponent(match[1]) === bucket ? decodeURIComponent(match[2]) : null;
    }
    if (url.hostname === 'storage.googleapis.com' && url.pathname.startsWith(`/${bucket}/`)) return decodeURIComponent(url.pathname.slice(bucket.length + 2));
    if (url.hostname === `${bucket}.storage.googleapis.com`) return decodeURIComponent(url.pathname.slice(1));
  } catch (_) { /* Ordinary text is not an asset. */ }
  return null;
}

export async function copyTopicResources(raw, { bucket, copyAsset }) {
  const copied = new Map();
  async function visit(value) {
    if (typeof value === 'string') {
      const path = ownedStoragePath(value, bucket);
      if (path || /^data:(image|audio|video)\//i.test(value)) {
        const key = path || value;
        if (!copied.has(key)) copied.set(key, Promise.resolve().then(() => copyAsset(value, path)));
        return await copied.get(key);
      }
      if (/^blob:/i.test(value)) throw new Error('El tema contiene un recurso temporal. Guarda su archivo antes de trasladarlo.');
      return value;
    }
    if (Array.isArray(value)) {
      const result = [];
      for (const entry of value) result.push(await visit(entry));
      return result;
    }
    if (value && Object.getPrototypeOf(value) === Object.prototype) {
      const entries = [];
      for (const [key, entry] of Object.entries(value)) entries.push([key, await visit(entry)]);
      return Object.fromEntries(entries);
    }
    return value; // Preserve Firestore timestamps, references and unknown typed fields.
  }
  return visit(raw);
}

// SDK injection allows the exact production transaction to run in the emulator.
export function createTopicTransferService({ db, sdk, copyResources, collectionName = 'escapeRoom' }) {
  const { doc, collection, getDoc, getDocs, runTransaction, serverTimestamp } = sdk;
  const parentRef = id => doc(db, collectionName, id);
  const topicRef = (session, id) => doc(db, collectionName, session, 'topics', id);
  function checkParent(data, uid, destination, mode) {
    if (!data || data.ownerId !== uid) throw new Error('Solo puedes trasladar temas entre tus propias sesiones.');
    if ((destination || mode === 'move') && data.status === 'published') throw new Error('El destino y el origen de un movimiento deben estar en borrador.');
  }
  async function completed(args) {
    const target = await getDoc(topicRef(args.destinationId, args.operationId));
    if (!target.exists()) return null;
    const transfer = target.data()._topicTransfer;
    if (!transfer || transfer.operationId !== args.operationId || transfer.ownerId !== args.uid
      || transfer.sourceSessionId !== args.sourceId || transfer.sourceTopicId !== args.topicId || transfer.mode !== args.mode) throw new Error('La operación coincide con otro documento. No se sobrescribió nada.');
    checkParent((await getDoc(parentRef(args.destinationId))).data(), args.uid, false, 'copy');
    return { destinationId: args.destinationId, topicId: args.operationId, alreadyCompleted: true };
  }
  return {
    completed,
    async transfer(args) {
      if (!['move', 'copy'].includes(args.mode) || !args.uid || args.sourceId === args.destinationId
        || ![args.sourceId, args.destinationId, args.topicId, args.operationId].every(v => typeof v === 'string' && /^[^/]{1,1500}$/.test(v))) throw new Error('Origen, destino u operación inválidos.');
      const previous = await completed(args);
      if (previous) return previous;
      const sourceParent = await getDoc(parentRef(args.sourceId));
      const destinationParent = await getDoc(parentRef(args.destinationId));
      checkParent(sourceParent.data(), args.uid, false, args.mode);
      checkParent(destinationParent.data(), args.uid, true, args.mode);
      const source = await getDoc(topicRef(args.sourceId, args.topicId));
      const sourceList = await getDocs(collection(db, collectionName, args.sourceId, 'topics'));
      const destinationList = await getDocs(collection(db, collectionName, args.destinationId, 'topics'));
      const hasLegacy = parent => Boolean(parent.project || Object.keys(parent.formState || {}).length);
      const legacyTopic = parent => ({ ...parent, academicNumber: Number(String(parent.project?.tema || parent.project?.unidad || parent.formState?.unidadTemaSelect || '1').match(/\d+/)?.[0]) || 1 });
      const legacySource = !source.exists() && args.topicId === 'legacy' && !sourceList.docs.length && hasLegacy(sourceParent.data());
      if (!source.exists() && !legacySource) throw new Error('El tema de origen ya no existe. Actualiza la sesión.');
      const legacyDestination = !destinationList.docs.length && hasLegacy(destinationParent.data())
        ? { ...legacyTopic(destinationParent.data()), id: `${args.operationId}-legacy` } : null;
      const snapshots = [sourceParent, destinationParent, ...(source.exists() ? [source] : []), ...sourceList.docs, ...destinationList.docs];
      const firstSnapshots = new Map();
      for (const snapshot of snapshots) if (!firstSnapshots.has(snapshot.ref.path)) firstSnapshots.set(snapshot.ref.path, snapshot);
      const uniqueSnapshots = [...firstSnapshots.values()];
      if (uniqueSnapshots.length > 400) throw new Error('Estas sesiones contienen demasiados temas para verificarlos en una sola operación segura.');
      args.onProgress?.('Copiando y verificando recursos…');
      const prepared = await copyResources(legacySource ? legacyTopic(sourceParent.data()) : source.data(), args);
      const targetData = { ...prepared, ...topicAcademic(prepared, sourceParent.data()), _topicTransfer: { operationId: args.operationId, ownerId: args.uid, mode: args.mode,
        sourceSessionId: args.sourceId, sourceTopicId: args.topicId, ...(prepared._topicTransfer ? { previous: prepared._topicTransfer } : {}) }, updatedAt: serverTimestamp() };
      const toTopics = docs => docs.map(snapshot => ({ ...snapshot.data(), id: snapshot.id }));
      const remaining = toTopics(sourceList.docs).filter(topic => topic.id !== args.topicId).sort(compareTopics);
      const targetTopics = [...toTopics(destinationList.docs), ...(legacyDestination ? [legacyDestination] : []), { ...targetData, id: args.operationId }].sort(compareTopics);
      const indexPatch = (topics, parent, fallback) => {
        const active = topics.find(topic => topic.id === parent.activeTopicId) || fallback || topics[0];
        return { schemaVersion: 3, topicSummaries: topics.map(topic => topicSummary(topic, parent)), topicCount: topics.length,
          activeTopicId: active?.id || '', project: active?.project || null, formState: active?.formState || {}, updatedAt: serverTimestamp() };
      };
      args.onProgress?.('Confirmando traslado…');
      try {
        await runTransaction(db, async tx => {
          const existing = await tx.get(topicRef(args.destinationId, args.operationId));
          if (existing.exists()) {
            if (transferFingerprint(existing.data()._topicTransfer) !== transferFingerprint(targetData._topicTransfer)) throw new Error('Conflicto de operación.');
            return;
          }
          for (const before of uniqueSnapshots) {
            const fresh = await tx.get(before.ref);
            if (!fresh.exists() || transferFingerprint(fresh.data()) !== transferFingerprint(before.data())) throw new Error('La sesión o el tema cambió durante el traslado. No se eliminó el original; vuelve a intentarlo.');
          }
          tx.set(topicRef(args.destinationId, args.operationId), targetData);
          if (legacyDestination) {
            const { id, ...legacyData } = legacyDestination;
            tx.set(topicRef(args.destinationId, id), legacyData);
          }
          tx.update(destinationParent.ref, indexPatch(targetTopics, destinationParent.data(), targetTopics.find(topic => topic.id === args.operationId)));
          if (args.mode === 'move') {
            if (!legacySource) tx.delete(source.ref);
            tx.update(sourceParent.ref, indexPatch(remaining, sourceParent.data()));
          }
        });
      } catch (error) {
        // A lost acknowledgement is not a reason to create another copy.
        const result = await completed(args).catch(() => null);
        if (result) return result;
        throw error;
      }
      return { destinationId: args.destinationId, topicId: args.operationId, alreadyCompleted: false };
    }
  };
}
