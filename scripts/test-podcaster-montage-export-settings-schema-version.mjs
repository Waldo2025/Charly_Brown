import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");

if (!/const MONTAGE_EXPORT_SETTINGS_SCHEMA_VERSION = 3;/.test(source)) {
  throw new Error("El modal de export debe declarar un schemaVersion para migrar estado viejo.");
}

if (!/onlyAudio:\s*schemaVersion >= MONTAGE_EXPORT_SETTINGS_SCHEMA_VERSION && source\.onlyAudio === true,/.test(source)) {
  throw new Error("La migración de settings debe limpiar onlyAudio heredado de versiones anteriores.");
}

if (!/schemaVersion:\s*MONTAGE_EXPORT_SETTINGS_SCHEMA_VERSION/.test(source)) {
  throw new Error("El modal de export debe persistir el schemaVersion actual.");
}

console.log("Podcaster montage export settings schema version OK.");
