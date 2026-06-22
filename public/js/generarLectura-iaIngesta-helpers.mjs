/**
 * Helper functions for generarLectura-iaIngesta.js
 */

export function buildResetIngestaUiState(options = {}) {
  const txtIngestaHtml = "";
  const fileInputValue = "";
  const analisisActual = null;
  return {
    txtIngestaHtml,
    fileInputValue,
    analisisActual
  };
}

export function hasSelectedReadingForUnidad(options = {}) {
  const {
    unidadTemaTextoId = "",
    unidadTemaASCId = "",
    legacyTemaId = "",
    legacyTemaAscId = "",
    lecturaPrompt = false,
    lecturaCacheId = ""
  } = options;

  return Boolean(
    String(unidadTemaTextoId || "").trim()
    || String(unidadTemaASCId || "").trim()
    || String(legacyTemaId || "").trim()
    || String(legacyTemaAscId || "").trim()
    || String(lecturaCacheId || "").trim()
    || lecturaPrompt === true
  );
}
