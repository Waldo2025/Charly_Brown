// Only the selected topic document is deleted. Parent metadata is updated atomically.
export async function deleteTopicOnly({ uid, topicId, sessionRef, topicRefs, run, summarize, timestamp, schemaVersion }) {
  if (!uid || !topicId) throw new Error('Selecciona un tema de una sesión propia.');
  return run(async transaction => {
    const parent = await transaction.get(sessionRef);
    if (!parent.exists()) throw new Error('La sesión ya no existe.');
    const session = parent.data();
    if (session.ownerId !== uid) throw new Error('Solo puedes eliminar temas de tus propias sesiones.');
    if (session.status === 'published') throw new Error('Cambia la sesión a borrador antes de eliminar un tema.');
    const snapshots = await Promise.all(topicRefs.map(ref => transaction.get(ref)));
    const target = snapshots.find(snapshot => snapshot.id === topicId && snapshot.exists());
    const legacy = !target && topicId === 'legacy' && !snapshots.some(snapshot => snapshot.exists())
      && (session.project || Object.keys(session.formState || {}).length);
    if (!target && !legacy) throw new Error('El tema ya no existe. Actualiza la lista.');
    const topics = snapshots.filter(snapshot => snapshot.exists() && snapshot.id !== topicId).map(snapshot => ({...snapshot.data(), id:snapshot.id}));
    // An indexed topic created after the list was read must not disappear from the index.
    if ((session.topicSummaries || []).some(item => item.id !== topicId && !topicRefs.some(ref => ref.id === item.id))) {
      throw new Error('La lista de temas cambió. Actualiza y vuelve a intentarlo.');
    }
    const summaries = topics.map(summarize);
    const active = topics.find(topic => topic.id === session.activeTopicId) || topics[0] || null;
    const patch = { schemaVersion, activeTopicId:active?.id || '', topicCount:topics.length,
      topicSummaries:summaries, project:active?.project || null, formState:active?.formState || {}, updatedAt:timestamp() };
    if (target) transaction.delete(target.ref);
    transaction.update(sessionRef, patch);
    return { topics, patch };
  });
}
