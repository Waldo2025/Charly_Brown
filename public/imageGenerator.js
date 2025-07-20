import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-storage.js';
import { auth } from './generarLectura.js';
import { listAll } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-storage.js';

const HF_TOKEN = "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";

// 🧠 FUNCIÓN: Generar imagen desde Hugging Face
async function generarImagenDesdePrompt(prompt, negative_prompt, modelId, steps, guidance, width, height) {
  const endpoint = `https://api-inference.huggingface.co/models/${modelId}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        negative_prompt: negative_prompt || "",
        num_inference_steps: steps,
        guidance_scale: guidance,
        width: width,
        height: height
      }
    })
  });

  const contentType = response.headers.get("content-type");

  if (!response.ok) {
    if (contentType && contentType.includes("application/json")) {
      const errorJson = await response.json();
      throw new Error(`Error desde Hugging Face para el modelo "${modelId}": ${errorJson.error}`);
    } else {
        const errorText = await response.text();
        const shortMessage = errorText.split("\n")[0]; // primera línea
        throw new Error(`Error ${response.status}: ${shortMessage}`);
    }
  }

  return await response.blob();
}

// 🚀 FUNCIÓN PRINCIPAL
function setupImageGenerator(storage) {
  const modal = document.getElementById("modalGeneradorIlustracion");
  const openBtn = document.getElementById("btnAbrirGeneradorImagenes");
  const closeBtn = modal.querySelector("[data-action='close']");
  const form = document.getElementById("formGeneradorImagenes");
  const resultDiv = document.getElementById("gen_results");

  if (!modal || !openBtn || !form) {
    console.warn("❗ Elementos del generador de imágenes no encontrados");
    return;
  }

  openBtn.addEventListener("click", async () => {
    modal.style.display = "block";
    resultDiv.scrollTop = 0;
    resultDiv.innerHTML = "";
    if (auth.currentUser) {
      await cargarGaleria(storage, auth.currentUser.uid);
    }
  });

  closeBtn.addEventListener("click", () => {
    modal.style.display = "none";
    resultDiv.innerHTML = "";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!auth.currentUser) {
      alert("Debes iniciar sesión para generar imágenes");
      return;
    }

    const prompt = document.getElementById("gen_prompt").value.trim();
    const negative = document.getElementById("gen_negative").value.trim();
    const estilo = document.getElementById("gen_estilo").value;
    const count = parseInt(document.getElementById("gen_count").value, 10) || 1;
    const modelId = document.getElementById("gen_modelo").value;
    const steps = parseInt(document.getElementById("gen_steps").value, 10) || 30;
    const guidance = parseFloat(document.getElementById("gen_guidance").value) || 7.5;
    const ratio = document.getElementById("gen_ratio").value;

    if (!prompt) {
      alert("Escribe un prompt válido");
      return;
    }

    let promptModificado = prompt;
    if (estilo) {
      promptModificado = `${prompt}, en estilo ${estilo}`;
    }

    let width = 1024;
    let height = 1024;
    
    if (ratio === "3:4") {
      width = 1152; height = 1536;
    } else if (ratio === "4:3") {
      width = 1536; height = 1152;
    } else if (ratio === "16:9") {
      width = 1920; height = 1080;
    } else if (ratio === "1:1") {
      width = 1536; height = 1536;
    }
    
    // Ajuste preventivo para modelos SDXL
    if (modelId.includes("stable-diffusion-xl") && (width > 1024 || height > 1024)) {
      width = 1024;
      height = 1024;
    }
        // Mostrar mensaje de carga
    resultDiv.innerHTML = `<p style="font-weight:bold; color:#555; text-align: center;">⏳ Generando imagen...</p>`;

    try {
      const urls = [];

      for (let i = 0; i < count; i++) {
        const blob = await generarImagenDesdePrompt(
          promptModificado,
          negative,
          modelId,
          steps,
          guidance,
          width,
          height
        );
      
        // Mostrar imagen local desenfocada
        const localUrl = URL.createObjectURL(blob);
        const img = document.createElement("img");
        img.src = localUrl;
        img.alt = "Generando...";
        img.style.maxWidth = "100%";
        img.style.height = "auto";
        img.style.marginBottom = "12px";
        img.style.borderRadius = "8px";
        img.style.filter = "blur(8px)";
        img.style.opacity = "0.8";
        img.style.transition = "filter 1s ease, opacity 0.5s ease";
        resultDiv.appendChild(img);
      
        // Subir a Firebase
        const imageRef = ref(storage, `images/${auth.currentUser.uid}/${Date.now()}_${i}.png`);
        await uploadBytes(imageRef, blob);
        const imageUrl = await getDownloadURL(imageRef);
        urls.push(imageUrl);
      
        // Reemplazar URL + eliminar blur cuando cargue la real
        img.src = imageUrl;
        img.onload = () => {
          img.style.filter = "blur(0)";
          img.style.opacity = "1";
        };
      }
      

      // Mostrar las imágenes
      resultDiv.innerHTML = ""; // limpia "Generando..."
      urls.forEach((url) => {
        const img = document.createElement("img");
        img.src = url;
        img.alt = "Imagen generada";
        img.style.maxWidth = "100%";
        img.style.height = "auto";
        img.style.marginBottom = "12px";
        img.style.borderRadius = "8px";
        img.style.boxShadow = "0 0 12px rgba(0,0,0,0.1)";
        resultDiv.appendChild(img);
      });

      // Éxito
      const msg = document.createElement("p");
      msg.textContent = "✅ Imágenes generadas";
      msg.style.color = "green";
      msg.style.fontWeight = "bold";
      resultDiv.appendChild(msg);

        const btnPromptBuilder = document.getElementById("btnPromptBuilder");
        btnPromptBuilder.addEventListener("click", () => {
        const textarea = document.getElementById("gen_prompt");
        textarea.value =
            "Two girls flying in a duel in the sky, dramatic lighting, sci-fi armor, one in white and pink with cyber spear, the other in black and gold with dual pistols, dynamic composition, cinematic angle, photorealistic painting, masterpiece, intricate design, trending on Artstation, by Hajime Sorayama and Katsuhiro Otomo";

        document.getElementById("gen_negative").value =
            "blurry, lowres, ugly, poorly drawn face, extra fingers, deformed, bad anatomy, watermark, text";
        });


    } catch (err) {
      console.error(err);
      resultDiv.innerHTML = `<p style="color:red; font-weight:bold;">❌ Error: ${err.message}</p>`;
    }
  });
}


export default setupImageGenerator;

async function cargarGaleria(storage, userId) {
    const galleryDiv = document.getElementById("gen_gallery");
    if (!galleryDiv) {
      console.warn("⚠️ Contenedor de galería no encontrado");
      return;
    }
  
    galleryDiv.innerHTML = "🔄 Cargando...";
  
    const folderRef = ref(storage, `images/${userId}`);
  
    try {
      const result = await listAll(folderRef);
  
      if (!result.items.length) {
        galleryDiv.innerHTML = "🪄 Aún no has generado imágenes.";
        return;
      }
  
      galleryDiv.innerHTML = "";
  
      for (const itemRef of result.items.reverse()) {
        const url = await getDownloadURL(itemRef);
  
        const img = document.createElement("img");
        img.src = url;
        img.alt = "Imagen generada";
        img.loading = "lazy";
        img.style.width = "100%"; // ⚠️ importante para Masonry
        img.style.display = "block";
        img.style.borderRadius = "6px";
        img.style.marginBottom = "12px";
  
        // Lightbox preview
        img.onclick = () => {
          const lightboxImg = document.getElementById("lightboxImage");
          const lightbox = document.getElementById("lightboxOverlay");
          if (lightboxImg && lightbox) {
            lightboxImg.src = url;
            lightbox.style.display = "flex";
          }
        };
  
        galleryDiv.appendChild(img);
      }
  
    } catch (error) {
      console.error("❌ Error al cargar la galería:", error);
      galleryDiv.innerHTML = "❌ No se pudo cargar la galería.";
    }
  }
  

// Lightbox cierre por clic
document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("lightboxOverlay");
  overlay.addEventListener("click", () => {
    overlay.style.display = "none";
    document.getElementById("lightboxImage").src = "";
  });
});
