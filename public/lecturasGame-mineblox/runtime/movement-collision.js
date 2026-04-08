export const COLLISION_LAYERS = Object.freeze({
  STRUCTURAL: 1 << 0,
  ITEM_SOLID: 1 << 1,
  DECOR: 1 << 2,
  TRIGGER: 1 << 3
});

export const COLLISION_MASKS = Object.freeze({
  playerLocal: COLLISION_LAYERS.STRUCTURAL,
  placedItem: COLLISION_LAYERS.STRUCTURAL | COLLISION_LAYERS.ITEM_SOLID,
  decor: COLLISION_LAYERS.STRUCTURAL,
  allBlocking: COLLISION_LAYERS.STRUCTURAL | COLLISION_LAYERS.ITEM_SOLID | COLLISION_LAYERS.DECOR,
  all: COLLISION_LAYERS.STRUCTURAL | COLLISION_LAYERS.ITEM_SOLID | COLLISION_LAYERS.DECOR | COLLISION_LAYERS.TRIGGER
});

function describeMeshCollider(mesh, box, id) {
  const userData = mesh?.userData || {};
  const sourceType = String(
    userData.sourceType
    || (userData.isStaticCollider ? "static_collider" : "")
    || (userData.isDoor ? "door" : "")
    || (userData.isRocketShuttle ? "rocket" : "")
    || (userData.isBlock ? "block" : "")
    || (userData.itemId ? "placed_item" : "")
    || "mesh"
  );
  let layer = COLLISION_LAYERS.DECOR;
  if (userData.isTrigger || userData.placementOnly) {
    layer = COLLISION_LAYERS.TRIGGER;
  } else if (
    userData.isStaticCollider
    || userData.isRoomShellCollider
    || userData.isDoor
    || userData.isRocketShuttle
    || userData.isProtectedStructure
    || String(userData.structure || "").includes("room_shell")
  ) {
    layer = COLLISION_LAYERS.STRUCTURAL;
  } else if (userData.isBlock || userData.isSeatable || userData.isStepable) {
    layer = COLLISION_LAYERS.ITEM_SOLID;
  }
  return {
    id,
    mesh,
    box: box.clone(),
    layer,
    blocking: layer !== COLLISION_LAYERS.TRIGGER,
    trigger: layer === COLLISION_LAYERS.TRIGGER,
    placementOnly: !!userData.placementOnly,
    sourceType
  };
}

function shouldIncludeColliderForContext(entry, context = {}) {
  if (!entry) return false;
  const actorType = String(context.actorType || "");
  const userData = entry.mesh?.userData || {};
  if (actorType === "playerLocal" && userData.excludeFromPlayerCollision) {
    return false;
  }
  return true;
}

export function createASCraftCollisionBroadphase(options = {}) {
  const cellSize = Math.max(3, Number(options.cellSize || 6));
  let dirty = true;
  let buckets = new Map();
  const colliders = new Map();

  function cellCoord(value) {
    return Math.floor(Number(value || 0) / cellSize);
  }

  function cellKey(x, z) {
    return `${x}:${z}`;
  }

  function rebuild() {
    buckets = new Map();
    colliders.forEach((entry) => {
      const box = entry?.box;
      if (!box) return;
      const minCellX = cellCoord(box.min.x);
      const maxCellX = cellCoord(box.max.x);
      const minCellZ = cellCoord(box.min.z);
      const maxCellZ = cellCoord(box.max.z);
      for (let x = minCellX; x <= maxCellX; x += 1) {
        for (let z = minCellZ; z <= maxCellZ; z += 1) {
          const key = cellKey(x, z);
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push(entry);
        }
      }
    });
    dirty = false;
  }

  function ensure(context = {}) {
    if (context.placedItems instanceof Map && typeof context.getCollisionBox === "function") {
      const seen = new Set();
      context.placedItems.forEach((mesh, id) => {
        seen.add(id);
        upsert(id, mesh, { getCollisionBox: context.getCollisionBox });
      });
      colliders.forEach((_, id) => {
        if (!seen.has(id) && String(id || "").startsWith("__fallback__")) {
          colliders.delete(id);
          dirty = true;
        }
      });
    }
    if (dirty) rebuild();
  }

  function upsert(id, mesh, context = {}) {
    if (!id || !mesh) return null;
    const getCollisionBox = typeof context.getCollisionBox === "function" ? context.getCollisionBox : (() => null);
    const box = getCollisionBox(mesh);
    if (!box) {
      if (colliders.delete(id)) dirty = true;
      return null;
    }
    const nextEntry = describeMeshCollider(mesh, box, id);
    colliders.set(id, nextEntry);
    dirty = true;
    return nextEntry;
  }

  function remove(id) {
    if (!id) return false;
    const removed = colliders.delete(id);
    if (removed) dirty = true;
    return removed;
  }

  function query(position, radius = 1, context = {}) {
    ensure(context);
    const safeRadius = Math.max(0.5, Number(radius || 1));
    const mask = Number.isFinite(context.mask) ? Number(context.mask) : COLLISION_MASKS.allBlocking;
    const includeTriggers = !!context.includeTriggers;
    const minCellX = cellCoord(position.x - safeRadius);
    const maxCellX = cellCoord(position.x + safeRadius);
    const minCellZ = cellCoord(position.z - safeRadius);
    const maxCellZ = cellCoord(position.z + safeRadius);
    const results = new Map();
    for (let x = minCellX; x <= maxCellX; x += 1) {
      for (let z = minCellZ; z <= maxCellZ; z += 1) {
        const bucket = buckets.get(cellKey(x, z));
        if (!bucket) continue;
        bucket.forEach((entry) => {
          if (!entry) return;
          if (!shouldIncludeColliderForContext(entry, context)) return;
          if (!includeTriggers && !entry.blocking) return;
          if ((entry.layer & mask) === 0) return;
          results.set(entry.id, entry.mesh);
        });
      }
    }
    return Array.from(results.values());
  }

  return {
    layers: COLLISION_LAYERS,
    masks: COLLISION_MASKS,
    markDirty() {
      dirty = true;
    },
    rebuild,
    upsert,
    remove,
    query,
    getStats() {
      const counts = {
        structural: 0,
        itemSolid: 0,
        decor: 0,
        trigger: 0
      };
      colliders.forEach((entry) => {
        if (!entry) return;
        if (entry.layer === COLLISION_LAYERS.STRUCTURAL) counts.structural += 1;
        else if (entry.layer === COLLISION_LAYERS.ITEM_SOLID) counts.itemSolid += 1;
        else if (entry.layer === COLLISION_LAYERS.DECOR) counts.decor += 1;
        else if (entry.layer === COLLISION_LAYERS.TRIGGER) counts.trigger += 1;
      });
      return {
        cellSize,
        colliderCount: colliders.size,
        bucketCount: buckets.size,
        dirty,
        counts
      };
    },
    isDirty() {
      return dirty;
    }
  };
}
