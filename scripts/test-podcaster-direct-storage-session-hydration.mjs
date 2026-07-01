import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);

assert.match(
  source,
  /async function hydrateSessionDirectStorageMediaUrls\(session = null\)/,
  "podcaster.js debe declarar hydrateSessionDirectStorageMediaUrls para resolver downloadUrl directos por Firebase Storage SDK."
);

assert.match(
  source,
  /const directMediaHydrated = await hydrateSessionDirectStorageMediaUrls\(nextSession\);/,
  "setActiveSession debe hidratar URLs directas de Storage antes del render del Studio."
);

assert.match(
  source,
  /if \(cleanStoragePath\) \{\s*if \(resolved\) .* return resolved;|return resolveStaleAwareProxyMediaUrl\(firebaseGsUrl,/s,
  "resolveStorageVideoUrl/resolveStorageAudioUrl deben resolver primero por storagePath cuando exista para evitar reusar URLs tokenizadas."
);

assert.ok(
  source.includes('const shouldForceLibraryRefresh = /(^|\\/)podcaster\\/library\\//i.test(normalizedStoragePath);')
    && source.includes('|| shouldForceLibraryRefresh'),
  "hydrateSessionDirectStorageMediaUrls debe refrescar por SDK los assets de podcaster/library aunque ya exista downloadUrl tokenizado persistido."
);

assert.ok(
  source.includes("const resolvedStorageUrlCache = new Map();")
    && source.includes("resolvedStorageUrlCache.has(normalizedStoragePath)")
    && source.includes("resolvedStorageUrlCache.set(normalizedStoragePath, resolved);"),
  "hydrateSessionDirectStorageMediaUrls debe deduplicar las resoluciones directas por storagePath dentro de la misma apertura de sesión para no repetir 404/403 del SDK."
);

assert.ok(
  source.includes("publicSceneVideoStoragePath")
    && source.includes("publicSceneStoragePath")
    && source.includes("activeSession.script.rows = nextRows;"),
  "hydrateSessionDirectStorageMediaUrls debe sincronizar y limpiar también los publicScene* de las filas para no revivir downloadUrl tokenizados rotos."
);

assert.ok(
  source.includes("normalizePersistedMediaReference(")
    && source.includes("record.publicSceneVideoUrl")
    && source.includes("publicSceneStorageFallback"),
  "La hidratación debe usar también los campos publicScene* como fallback al construir la referencia persistida."
);

assert.ok(
  source.includes("const rowPublicSceneVideoUrl = String(row?.publicSceneVideoUrl || \"\").trim();")
    && source.includes("const hasPublicSceneStorage")
    && source.includes("hasPublicSceneStorage ? \"\" : rowPublicSceneVideoUrl"),
  "Al sincronizar filas, si existe storagePath de escena pública, no se debe volver a reutilizar la URL tokenizada vieja de publicSceneVideoUrl."
);

assert.ok(
  source.includes("const priorLookupFailedAtMs = Date.parse(priorLookupFailedAt);")
    && source.includes("const hasRecentLookupFailure"),
  "La hidratación debe detectar marcas recientes de fallo por storagePath para evitar reintentos inmediatos de getDownloadURL."
);

assert.ok(
  source.includes("if (hasRecentLookupFailure && shouldResolveDirectUrl)"),
  "Si media ya falló recientemente y la referencia debe resolverse por Storage, la hidratación debe saltarse la reconsulta."
);

assert.ok(
  source.includes("storageLookupFailedAt: new Date().toISOString()"),
  "Los fallos de rehidratación deben persistir un timestamp real, no una cadena vacía."
);

console.log("Podcaster direct storage session hydration OK.");
