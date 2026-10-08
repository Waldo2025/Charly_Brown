#!/usr/bin/env node
'use strict';

const { getAdminServices } = require('../functions/src/common.js');
const { normalizeCharlyModel } = require('../functions/src/charly-brown-mcp.js');
const { runtime } = require('../functions/src/charly-resources/runtime.js');
const { generateResourceWithValidationRetry } = require('../functions/src/charly-resources/generate.js');
const { hash, validateArtifact } = require('../functions/src/charly-resources/contracts.js');

const [sessionId, unitId, resourceCode] = process.argv.slice(2);
if (!sessionId || !unitId || !resourceCode) {
  console.error('Uso: node scripts/regenerate-charly-raster-resource.cjs <sessionId> <unitId> <código>');
  process.exit(2);
}

const TYPE_BY_LABEL = { anexo: 'annex', recortable: 'cutout' };

function activityPlanningHash(activity = {}) {
  return hash({
    id: activity.id || '',
    html: activity.html || '',
    resourceSpecifications: activity.resourceSpecifications || []
  });
}

async function main() {
  const { db } = getAdminServices();
  const sessionRef = db.collection('charlyBrownUnitSessions').doc(sessionId);
  const snapshot = await sessionRef.get();
  if (!snapshot.exists) throw new Error('Sesión inexistente.');
  const session = snapshot.data();
  const unit = session.units?.find(item => item.id === unitId);
  if (!unit) throw new Error('Unidad inexistente.');
  const previous = unit.accepted?.resources?.find(item => String(item.code || '') === resourceCode);
  if (!previous) throw new Error(`No se encontró ${resourceCode}.`);
  const type = TYPE_BY_LABEL[previous.type || previous.contentType] || previous.type;
  if (!['annex', 'cutout'].includes(type)) throw new Error('Este comando sólo regenera anexos y recortables raster.');
  const activity = unit.accepted?.activities?.find(item => item.id === previous.activityId);
  if (!activity) throw new Error('La actividad vinculada no existe.');
  const activityHash = activityPlanningHash(activity);
  const model = normalizeCharlyModel(unit.meta?.model);
  const generation = runtime(model);
  const input = {
    ownerUid: session.ownerUid || session.ownerId || session.userId,
    sessionId,
    targetUnitId: unitId,
    idempotencyKey: `manual-raster-v5:${previous.id}:${activityHash}`,
    model,
    unit: {
      meta: unit.meta,
      accepted: {
        reading: unit.accepted?.reading,
        sya: unit.accepted?.sya || unit.sya,
        resources: (unit.accepted?.resources || []).filter(item => item.id !== previous.id)
      }
    },
    activity: {
      id: activity.id,
      title: activity.title || '',
      html: activity.html || '',
      section: activity.section || '',
      category: activity.category || '',
      subtopic: activity.subtopic || '',
      resourceSpecifications: activity.resourceSpecifications || []
    },
    code: resourceCode
  };
  const artifact = await generation.cachedGeneration(type, input, () =>
    generateResourceWithValidationRetry(type, input, generation)
  );
  validateArtifact(type, artifact, { activity: input.activity });

  await db.runTransaction(async transaction => {
    const currentSnapshot = await transaction.get(sessionRef);
    const current = currentSnapshot.data();
    const currentUnit = current.units?.find(item => item.id === unitId);
    const currentActivity = currentUnit?.accepted?.activities?.find(item => item.id === activity.id);
    if (!currentUnit || activityPlanningHash(currentActivity) !== activityHash) throw new Error('La planificación pedagógica cambió durante la generación; no se reemplazó el recurso.');
    const index = currentUnit.accepted.resources.findIndex(item => item.id === previous.id);
    if (index < 0) throw new Error('El recurso cambió durante la generación; no se reemplazó.');
    const { html, ...structuredArtifact } = artifact;
    currentUnit.accepted.resources[index] = {
      ...artifact,
      id: previous.id,
      type: previous.type || (type === 'cutout' ? 'recortable' : 'anexo'),
      activityId: activity.id,
      order: previous.order,
      code: resourceCode,
      artifact: structuredArtifact,
      automated: true,
      sourceUnitId: unitId,
      revision: Number(previous.revision || 0) + 1,
      acceptedAt: new Date().toISOString()
    };
    currentUnit.revision = Number(currentUnit.revision || 0) + 1;
    currentUnit.updatedAt = new Date().toISOString();
    transaction.update(sessionRef, {
      units: current.units,
      storageRevision: Number(current.storageRevision || 0) + 1,
      updatedAt: currentUnit.updatedAt
    });
  });
  console.log(JSON.stringify({
    ok: true,
    code: resourceCode,
    title: artifact.title,
    imageModel: artifact.imageModel,
    mimeTypes: artifact.assets.map(asset => asset.mimeType),
    visualReview: artifact.visualReview
  }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
