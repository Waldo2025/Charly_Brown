import { getStorage, ref, uploadString, listAll, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import { buildGeminiApiUrl, authFetchJson } from './api-client.js';
import { getDefaultFirebaseApp } from './firebase-default-app.js';

const app = getDefaultFirebaseApp();
const storage = getStorage(app);
const auth = getAuth(app);

signInAnonymously(auth).catch(() => {});

const promptInput = document.getElementById("prompt");
const modeloSelect = document.getElementById("modelo");
const imagen = document.getElementById("imagenGenerada");
const boton = document.getElementById("generarImagen");

async function generarMapaMentalGemini(textoLectura) {
  const prompt = `
      You are a visual educational designer. Read the following text and extract 5 to 7 key concepts. 
      For each one, provide a short label and a list of simple emoji or visual ideas (like animals, objects, nature, etc.) that can be used to illustrate that concept. 
      Return only JSON in this format:

      [
        { "concept": "Concept Name", "visuals": ["icon1", "description2", ...] },
        ...
      ]

      Text:
      """${textoLectura}"""
      `;

  const data = await authFetchJson(buildGeminiApiUrl("/api/gemini/generate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      payload: { contents: [{ parts: [{ text: prompt }] }] }
    })
  });
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  try {
    const rawCleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(rawCleaned);
  } catch (_) {
    return null;
  }
}

function extractGeminiImageData(imageData = {}) {
  const response = imageData?.response && typeof imageData.response === "object" ? imageData.response : imageData;
  const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
  for (const candidate of candidates) {
    for (const part of (candidate?.content?.parts || [])) {
      const inline = part?.inlineData || part?.inline_data;
      const mime = String(inline?.mimeType || inline?.mime_type || "").trim();
      const base64 = String(inline?.data || "").trim();
      if (mime && base64 && /^image\//i.test(mime)) {
        return `data:${mime};base64,${base64}`;
      }
    }
  }
  const finishReason = candidates.map((candidate) => candidate?.finishReason || candidate?.finish_reason).filter(Boolean).join(", ");
  const blockReason = response?.promptFeedback?.blockReason || response?.prompt_feedback?.block_reason || "";
  throw new Error(`No se recibió una imagen válida${blockReason ? `: solicitud bloqueada (${blockReason})` : finishReason ? `: ${finishReason}` : ""}.`);
}

async function generateGeminiImage(prompt, { aspectRatio = "1:1", imageSize = "1K", temperature = 0.58, model = "gemini-3.1-flash-image" } = {}) {
  const requestOptions = {
    method: "POST",
    body: {
      model,
      payload: {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio, imageSize },
          temperature
        }
      }
    }
  };
  return extractGeminiImageData(await authFetchJson(buildGeminiApiUrl("/api/gemini/generate"), requestOptions));
}

boton?.addEventListener("click", async () => {
  const description = promptInput?.value?.trim() || "";
  const modelo = modeloSelect?.value || "";

  if (!description) {
    alert("Por favor, escribe un prompt o pega una lectura.");
    return;
  }

  imagen.innerHTML = "";
  boton.disabled = true;
  boton.textContent = "Generando...";

  try {
    if (modelo === "gemini-mindmap") {
      const resultado = await generarMapaMentalGemini(description);
      if (resultado) {
        resultado.forEach((item) => {
          const card = document.createElement("div");
          card.style.border = "1px solid #ccc";
          card.style.borderRadius = "12px";
          card.style.padding = "1rem";
          card.style.margin = "1rem";
          card.style.background = "#fff";
          card.style.boxShadow = "0 2px 5px rgba(0,0,0,0.1)";
          card.style.width = "250px";
          card.style.fontSize = "1.1rem";

          const title = document.createElement("h3");
          title.textContent = item.concept;
          const visuals = document.createElement("p");
          visuals.textContent = Array.isArray(item.visuals) ? item.visuals.join(" ") : "";

          card.appendChild(title);
          card.appendChild(visuals);
          imagen.appendChild(card);
        });
      } else {
        imagen.textContent = "Error al generar mapa mental.";
      }
      return;
    }

    // Generación de imagen con Gemini 3.1 Flash Image
    const dataUrl = await generateGeminiImage(description, {
      model: modelo || "gemini-3.1-flash-image",
      aspectRatio: "1:1",
      imageSize: "1K"
    });

    const img = document.createElement("img");
    img.src = dataUrl;
    img.style.maxWidth = "100%";
    img.style.borderRadius = "12px";
    img.style.boxShadow = "0 4px 10px rgba(0,0,0,0.15)";
    imagen.appendChild(img);

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "💾 Guardar en biblioteca (Storage)";
    saveBtn.style.marginTop = "0.75rem";
    saveBtn.onclick = async () => {
      const nombre = prompt("Nombre del archivo para guardar en Storage (ej. sol, casa, árbol):", description.slice(0, 20).trim());
      if (nombre) {
        await guardarEnFirebase(nombre, dataUrl);
        alert(`✅ Imagen "${nombre}" guardada en Firebase Storage.`);
      }
    };
    imagen.appendChild(saveBtn);
  } catch (err) {
    console.error("Error generando con Gemini:", err);
    alert(`Hubo un error al generar la imagen: ${err.message || "Revisa la consola"}`);
  } finally {
    boton.disabled = false;
    boton.textContent = "Generar";
  }
});

async function cargarImagenesGuardadas() {
  const contenedor = document.getElementById("contenedorGuardadas");
  if (!contenedor) return;
  contenedor.innerHTML = "";

  const folderRef = ref(storage, 'mindmap/');
  const result = await listAll(folderRef);

  for (const itemRef of result.items) {
    const url = await getDownloadURL(itemRef);
    const img = document.createElement("img");
    img.src = url;
    img.style.maxWidth = "100%";
    img.style.marginBottom = "0.5rem";
    contenedor.appendChild(img);
  }
}

async function guardarEnFirebase(nombre, dataURL) {
  if (!auth.currentUser) {
    alert("Debes iniciar sesión para guardar imágenes.");
    return;
  }

  const storageRef = ref(storage, `mindmap/${nombre}.png`);
  try {
    await uploadString(storageRef, dataURL, 'data_url');
    await cargarImagenesGuardadas();
  } catch (_) {
    // noop
  }
}

window.guardarMapaMentalEnFirebase = guardarEnFirebase;
void cargarImagenesGuardadas();
