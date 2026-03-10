// crearAudio.js

const HF_TOKEN = "__HF_API_KEY_LOCAL__";

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

    let modificado = aplicarTonoYVelocidad(texto, tono, velocidad);

    try {
      const response = await fetch("https://api-inference.huggingface.co/models/suno/bark", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HF_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ inputs: modificado })
      });

      if (!response.ok) {
        alert("Error generando el audio. Intenta más tarde.");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const audio = document.getElementById("audioGenerado");
      audio.src = url;
      document.getElementById("audioPreview").style.display = "block";

    } catch (error) {
      alert("Error al generar el audio.");
    }
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
