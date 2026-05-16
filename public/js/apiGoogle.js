async function generarImagenDesdeSpec(prompt) {
  throw new Error(`apiGoogle.js no debe ejecutarse en el cliente. Migra "${prompt ? "generarImagenDesdeSpec" : "este flujo"}" al backend.`);
}

if (typeof module !== "undefined") {
  module.exports = { generarImagenDesdeSpec };
}
