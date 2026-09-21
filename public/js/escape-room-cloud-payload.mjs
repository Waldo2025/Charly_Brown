// Keep the Firestore schema: upload embedded assets and omit undefined map fields.
// Never mutate the editor snapshot or silently discard content after a failed upload.
export async function prepareEscapeRoomCloudPayload(payload, uploadAsset) {
  const assets = new Map();
  async function visit(value, path) {
    if (typeof value === "string" && /^data:(?:image|audio|video)\//i.test(value)) {
      if (!assets.has(value)) assets.set(value, Promise.resolve().then(() => uploadAsset(value, path)));
      const url = await assets.get(value);
      if (typeof url !== "string" || !/^https:\/\//i.test(url)) {
        throw new Error(`No se pudo subir el recurso de ${path}. El contenido sigue en el editor; vuelve a guardar cuando el almacenamiento esté disponible.`);
      }
      return url;
    }
    if (Array.isArray(value)) {
      const result = [];
      for (let index = 0; index < value.length; index++) result.push(value[index] === undefined ? null : await visit(value[index], `${path}.${index}`));
      return result;
    }
    if (value && Object.getPrototypeOf(value) === Object.prototype) {
      const result = {};
      for (const [key, entry] of Object.entries(value)) {
        if (entry !== undefined) result[key] = await visit(entry, `${path}.${key}`);
      }
      return result;
    }
    return value;
  }
  const prepared = await visit(payload, "sesion");
  // Leave headroom for Firestore field/document overhead and timestamps.
  const bytes = new TextEncoder().encode(JSON.stringify(prepared)).byteLength;
  if (bytes > 900_000) {
    throw new Error(`El texto del proyecto ocupa ${bytes.toLocaleString("es-MX")} bytes incluso después de separar los recursos. No se sobrescribió el documento: el contenido sigue en el editor y requiere dividir su almacenamiento.`);
  }
  return prepared;
}
