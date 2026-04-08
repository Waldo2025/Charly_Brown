// crearAudio.js

document.addEventListener("DOMContentLoaded", () => {
  const modalEl = document.getElementById("modalGenerarAudio");
  const btnAudio = document.getElementById("btnAbrirModalAudio");

  if (!modalEl || !btnAudio) {
    return;
  }

  const modalAudio = new bootstrap.Modal(modalEl);

  // Abrir modal al hacer clic en el botón
  document.getElementById("btnAbrirModalAudio").addEventListener("click", () => {
    const parte1 = document.getElementById("textoMindmapParte1").value.trim();
    const parte2 = document.getElementById("textoMindmapParte2").value.trim();
    document.getElementById("textoFinalAudio").value = parte1 + '\n\n' + parte2;
    document.getElementById("audioPreview").style.display = "none";
    modalAudio.show();
  });

  // Generar audio al hacer clic en el botón del modal
  document.getElementById("btnGenerarAudioFinal").addEventListener("click", async () => {
    const texto = document.getElementById("textoFinalAudio").value.trim();
    const tono = document.getElementById("tonoVoz").value;
    const velocidad = document.getElementById("velocidadVoz").value;

    if (!texto) {
      alert("⚠️ No hay texto para generar audio.");
      return;
    }

    aplicarTonoYVelocidad(texto, tono, velocidad);
    alert("La generación de audio desde crearAudio.js fue deshabilitada por seguridad. Usa el flujo integrado que ya corre sin exponer APIs en el cliente.");
  });
});

// Función para aplicar tono y velocidad al texto
function aplicarTonoYVelocidad(texto, tono, velocidad) {
  let modificado = texto;

  // Tono (usando etiquetas estilo Bark)
  switch (tono) {
    case "amable":
      modificado = `[friendly] ${modificado}`;
      break;
    case "entusiasta":
      modificado = `[excited] ${modificado}`;
      break;
    case "serio":
      modificado = `[serious] ${modificado}`;
      break;
    default:
      modificado = `[neutral] ${modificado}`;
  }

  // Velocidad (hackeado a nivel textual para Bark)
  if (velocidad === "lenta") {
    modificado += " ...";
  } else if (velocidad === "rapida") {
    modificado = modificado.replace(/\./g, ",");
  }

  return modificado;
}
