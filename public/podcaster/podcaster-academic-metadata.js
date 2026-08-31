const ACADEMIC_METADATA_COLLECTION = "podcaster_academic_metadata";
const ACADEMIC_LEVEL_OPTIONS = Object.freeze(["Preescolar", "Primaria", "Secundaria"]);
const ACADEMIC_GRADE_OPTIONS = Object.freeze(["Primero", "Segundo", "Tercero", "Cuarto", "Quinto", "Sexto"]);
const ACADEMIC_TERM_OPTIONS = Object.freeze(["1", "2", "3"]);
const ACADEMIC_UNIT_VALUES = Object.freeze(Array.from({ length: 10 }, (_, index) => String(index + 1)));
const ACADEMIC_SUBJECT_OPTIONS_BY_GRADE = Object.freeze({
  Primero: Object.freeze(["Español", "Matemáticas", "Biología", "Historia del mundo", "Formación cívica y ética", "Geografía", "Inglés"]),
  Segundo: Object.freeze(["Español", "Matemáticas", "Formación cívica y ética", "Física", "Historia de México 1", "Inglés"]),
  Tercero: Object.freeze(["Español", "Matemáticas", "Formación cívica y ética", "Química", "Historia de México 2", "Inglés"])
});

function normalizeAcademicField(value = "", allowedValues = []) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return allowedValues.includes(raw) ? raw : "";
}

export function resolveAcademicUnitLabel(level = "") {
  const normalizedLevel = String(level || "").trim().toLowerCase();
  return normalizedLevel === "secundaria" ? "Tema" : "Unidad";
}

export function resolveAcademicUnitOptions(level = "") {
  const label = resolveAcademicUnitLabel(level);
  return ACADEMIC_UNIT_VALUES.map((value) => ({
    value,
    label: `${label} ${value}`
  }));
}

export function resolveAcademicSubjectOptions(level = "", grade = "") {
  const normalizedLevel = String(level || "").trim().toLowerCase();
  if (normalizedLevel !== "secundaria") return [];
  const normalizedGrade = String(grade || "").trim();
  const options = ACADEMIC_SUBJECT_OPTIONS_BY_GRADE[normalizedGrade] || [];
  return options.map((label) => ({ value: label, label }));
}

export function normalizeAcademicMetadata(source = null) {
  const input = source && typeof source === "object" ? source : {};
  const nested = input.academicMetadata && typeof input.academicMetadata === "object"
    ? input.academicMetadata
    : {};
  const firstValid = (values, allowedValues) => {
    for (const value of values) {
      const normalized = normalizeAcademicField(value, allowedValues);
      if (normalized) return normalized;
    }
    return "";
  };
  const nivel = firstValid([nested.nivel, input.nivel], ACADEMIC_LEVEL_OPTIONS);
  const grado = firstValid([nested.grado, input.grado], ACADEMIC_GRADE_OPTIONS);
  const trimestre = firstValid([nested.trimestre, input.trimestre], ACADEMIC_TERM_OPTIONS);
  const unidad = firstValid([nested.unidad, input.unidad], ACADEMIC_UNIT_VALUES);
  const materia = firstValid(
    [nested.materia, input.materia],
    resolveAcademicSubjectOptions(nivel, grado).map((item) => item.value)
  );
  return {
    nivel,
    grado,
    trimestre,
    unidad,
    materia,
    unitLabel: resolveAcademicUnitLabel(nivel)
  };
}

export function academicMetadataIsEmpty(metadata = null) {
  const normalized = normalizeAcademicMetadata(metadata);
  return !normalized.nivel && !normalized.grado && !normalized.trimestre && !normalized.unidad && !normalized.materia;
}

export function resolveAcademicMetadata(...sources) {
  const normalizedSources = sources
    .flat()
    .filter((source) => source && typeof source === "object")
    .map((source) => normalizeAcademicMetadata(source));
  const fields = ["nivel", "grado", "trimestre", "unidad", "materia"];
  const resolved = Object.fromEntries(fields.map((field) => [
    field,
    normalizedSources.find((source) => source[field])?.[field] || ""
  ]));
  return normalizeAcademicMetadata(resolved);
}

export function matchesAcademicMetadataFilters(metadata = null, filters = null) {
  const normalized = resolveAcademicMetadata(metadata);
  const currentFilters = filters && typeof filters === "object" ? filters : {};
  const fields = ["nivel", "grado", "trimestre", "unidad", "materia"];
  if (academicMetadataIsEmpty(normalized)) {
    return fields.every((field) => !currentFilters[field] || currentFilters[field] === "all");
  }
  return fields.every((field) => {
    const expected = String(currentFilters[field] || "all").trim();
    return expected === "all" || normalized[field] === expected;
  });
}

export function mergeAcademicMetadataIntoEntity(entity = null, metadata = null) {
  const source = entity && typeof entity === "object" ? entity : {};
  const normalized = resolveAcademicMetadata(metadata, source.academicMetadata, source, source.session?.academicMetadata, source.session);
  const snapshot = buildAcademicMetadataSnapshot(normalized, {
    updatedAt: source.academicMetadataUpdatedAt || source.updatedAt || ""
  });
  const merged = { ...source, ...snapshot };
  if (source.session && typeof source.session === "object") {
    merged.session = { ...source.session, ...snapshot };
  }
  return merged;
}

export function buildAcademicMetadataSummary(metadata = null) {
  const normalized = normalizeAcademicMetadata(metadata);
  const unitLabel = resolveAcademicUnitLabel(normalized.nivel);
  return [
    normalized.nivel,
    normalized.grado,
    normalized.trimestre ? `Trimestre ${normalized.trimestre}` : "",
    normalized.unidad ? `${unitLabel} ${normalized.unidad}` : "",
    normalized.materia ? `Materia ${normalized.materia}` : ""
  ].map((item) => String(item || "").trim()).filter(Boolean);
}

export function buildAcademicMetadataSnapshot(metadata = null, extras = {}) {
  const normalized = normalizeAcademicMetadata(metadata);
  const unitLabel = resolveAcademicUnitLabel(normalized.nivel);
  return {
    academicMetadata: {
      nivel: normalized.nivel,
      grado: normalized.grado,
      trimestre: normalized.trimestre,
      unidad: normalized.unidad,
      materia: normalized.materia,
      unitLabel
    },
    nivel: normalized.nivel,
    grado: normalized.grado,
    trimestre: normalized.trimestre,
    unidad: normalized.unidad,
    materia: normalized.materia,
    academicMetadataUnitLabel: unitLabel,
    academicMetadataUpdatedAt: String(extras.updatedAt || "").trim() || new Date().toISOString(),
    academicMetadataUpdatedByUid: String(extras.updatedByUid || "").trim(),
    academicMetadataUpdatedByName: String(extras.updatedByName || "").trim(),
    academicMetadataCollection: ACADEMIC_METADATA_COLLECTION
  };
}

export function getAcademicMetadataCollectionName() {
  return ACADEMIC_METADATA_COLLECTION;
}

export function createPodcasterAcademicMetadataApi(deps = {}) {
  const {
    db,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    serverTimestamp,
    nowIso,
    getCurrentUserUid,
    getCurrentUserName,
    buildSnapshotTargets = () => []
  } = deps;

  function getMetadataDocRef(entityId = "") {
    const cleanId = String(entityId || "").trim();
    if (!cleanId || typeof doc !== "function" || !db) return null;
    return doc(db, ACADEMIC_METADATA_COLLECTION, cleanId);
  }

  async function loadAcademicMetadata(entityId = "") {
    const ref = getMetadataDocRef(entityId);
    if (!ref || typeof getDoc !== "function") return null;
    const snap = await getDoc(ref);
    if (!snap?.exists?.()) return null;
    return normalizeAcademicMetadata(snap.data() || {});
  }

  async function saveAcademicMetadata(entityId = "", metadata = null, options = {}) {
    const cleanId = String(entityId || "").trim();
    if (!cleanId || typeof setDoc !== "function") {
      throw new Error("invalid_academic_metadata_entity");
    }

    const normalized = normalizeAcademicMetadata(metadata);
    const updatedAt = typeof nowIso === "function" ? nowIso() : new Date().toISOString();
    const updatedByUid = typeof getCurrentUserUid === "function" ? String(getCurrentUserUid() || "").trim() : "";
    const updatedByName = typeof getCurrentUserName === "function" ? String(getCurrentUserName() || "").trim() : "";
    const payload = {
      entityId: cleanId,
      entityType: String(options.entityType || "session").trim() || "session",
      ...buildAcademicMetadataSnapshot(normalized, {
        updatedAt,
        updatedByUid,
        updatedByName
      }),
      updatedAt: serverTimestamp ? serverTimestamp() : updatedAt,
      updatedAtIso: updatedAt,
      updatedByUid,
      updatedByName
    };

    const ref = getMetadataDocRef(cleanId);
    let metadataWriteError = null;
    if (ref) {
      try {
        await setDoc(ref, payload, { merge: true });
      } catch (error) {
        metadataWriteError = error;
      }
    }

    const snapshotTargets = Array.isArray(options.snapshotTargets) && options.snapshotTargets.length
      ? options.snapshotTargets
      : (typeof buildSnapshotTargets === "function" ? buildSnapshotTargets(cleanId, normalized, payload) : []);
    const snapshotPatch = {
      ...buildAcademicMetadataSnapshot(normalized, {
        updatedAt,
        updatedByUid,
        updatedByName
      }),
      updatedAt: serverTimestamp ? serverTimestamp() : updatedAt,
      updatedAtIso: updatedAt
    };

    const snapshotErrors = [];
    let snapshotWrites = 0;
    for (const target of snapshotTargets) {
      const targetRef = target?.ref || (target?.collectionName && target?.docId && typeof doc === "function" && db
        ? doc(db, target.collectionName, target.docId)
        : null);
      if (!targetRef) continue;
      const patch = target?.patch && typeof target.patch === "object"
        ? { ...snapshotPatch, ...target.patch }
        : snapshotPatch;
      try {
        if (typeof updateDoc === "function") {
          await updateDoc(targetRef, patch);
        } else if (typeof setDoc === "function") {
          await setDoc(targetRef, patch, { merge: true });
        } else {
          throw new Error("missing_snapshot_write_method");
        }
        snapshotWrites += 1;
      } catch (error) {
        snapshotErrors.push(error);
        if (typeof setDoc === "function" && typeof updateDoc === "function") {
          try {
            await setDoc(targetRef, patch, { merge: true });
            snapshotWrites += 1;
          } catch (fallbackError) {
            snapshotErrors.push(fallbackError);
          }
        }
      }
    }

    if (!snapshotWrites && metadataWriteError) {
      throw metadataWriteError;
    }
    if (!snapshotWrites && snapshotErrors.length) {
      throw snapshotErrors[0];
    }

    return payload;
  }

  return {
    collectionName: ACADEMIC_METADATA_COLLECTION,
    levelOptions: ACADEMIC_LEVEL_OPTIONS,
    gradeOptions: ACADEMIC_GRADE_OPTIONS,
    termOptions: ACADEMIC_TERM_OPTIONS,
    unitValues: ACADEMIC_UNIT_VALUES,
    resolveAcademicSubjectOptions,
    normalizeAcademicField,
    normalizeAcademicMetadata,
    resolveAcademicUnitLabel,
    resolveAcademicUnitOptions,
    academicMetadataIsEmpty,
    resolveAcademicMetadata,
    matchesAcademicMetadataFilters,
    mergeAcademicMetadataIntoEntity,
    buildAcademicMetadataSummary,
    buildAcademicMetadataSnapshot,
    getMetadataDocRef,
    loadAcademicMetadata,
    saveAcademicMetadata
  };
}
