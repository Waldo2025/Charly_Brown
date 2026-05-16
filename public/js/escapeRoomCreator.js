import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import { getDefaultFirebaseApp } from './firebase-default-app.js';
import { authFetchJson } from './api-client.js';

const app = getDefaultFirebaseApp();
const auth = getAuth(app);

let tokenAuth = "";
let escapeRoomData = null;

onAuthStateChanged(auth, async (user) => {
    if (user) {
        tokenAuth = await user.getIdToken();
    } else {
        window.location.href = "login.html";
    }
});

// Helper functions for image generation (adapted from generarLectura.js)
function _escapeRoomNormalizarAspectRatio(value = "") {
    const raw = String(value || "").trim();
    const allowed = new Set(["1:1", "4:3", "3:4", "16:9", "9:16", "21:9"]);
    return allowed.has(raw) ? raw : "16:9"; // Default to 16:9 for backgrounds
}

function _escapeRoomNormalizarImageSize(value = "") {
    const raw = String(value || "").trim().toUpperCase();
    const allowed = new Set(["512", "1K", "2K", "4K"]);
    return allowed.has(raw) ? raw : "1K"; // Default to 1K for backgrounds
}

function _escapeRoomBuildGeminiImageGenerationConfig({
    aspectRatio = "16:9",
    imageSize = "1K",
    temperature = null
} = {}) {
    const config = {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
            aspectRatio: _escapeRoomNormalizarAspectRatio(aspectRatio),
            imageSize: _escapeRoomNormalizarImageSize(imageSize)
        }
    };
    const temp = Number(temperature);
    if (Number.isFinite(temp)) config.temperature = temp;
    return config;
}

function _escapeRoomExtractImageInlineFromGenerateData(data = null) {
    const outParts = data?.candidates?.[0]?.content?.parts || [];
    for (const part of outParts) {
        const inline = part?.inlineData || part?.inline_data;
        const mime = String(inline?.mimeType || inline?.mime_type || "").trim();
        const b64 = String(inline?.data || "").trim();
        if (!b64 || !/^image\//i.test(mime)) continue;
        return { dataUrl: `data:${mime};base64,${b64}`, mimeType: mime };
    }
    return null;
}

async function _escapeRoomTryGenerateImageWithGemini({ prompt = "", aspectRatio = "16:9", imageSize = "1K" } = {}) {
    const cleanedPrompt = String(prompt || "").trim();
    if (!cleanedPrompt) throw new Error("Prompt vacío para imagen.");

    const modelName = "gemini-2.5-flash-image"; // Using a flash image model
    const generationConfig = _escapeRoomBuildGeminiImageGenerationConfig({
        aspectRatio,
        imageSize,
        temperature: 0.7 // A bit higher temperature for creative backgrounds
    });

    const data = await authFetchJson('/api/gemini/generate', {
        method: 'POST',
        body: {
            model: modelName,
            payload: {
                contents: [{ role: "user", parts: [{ text: cleanedPrompt }] }],
                generationConfig: generationConfig
            }
        }
    });

    const image = _escapeRoomExtractImageInlineFromGenerateData(data);
    if (image?.dataUrl) {
        return image;
    }
    throw new Error("No se recibió imagen en la respuesta de Gemini.");
}

document.getElementById('escapeRoomForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nivel = document.getElementById('nivelSelect').value;
    const grado = document.getElementById('gradoSelect').value;
    const tema = document.getElementById('temaInput').value;
    const narrativa = document.getElementById('narrativaSelect').value;
    const numMisiones = document.getElementById('numMisionesInput').value;

    const btnGenerar = document.getElementById('btnGenerar');
    const loading = document.getElementById('loadingIndicator');
    const resultadoContainer = document.getElementById('resultadoContainer');
    const escapeRoomPreviewPanel = document.getElementById('escapeRoomPreviewPanel');
    const escapeRoomPreviewFrame = document.getElementById('escapeRoomPreviewFrame');

    btnGenerar.disabled = true;
    btnGenerar.classList.add('opacity-50');
    loading.classList.remove('hidden');
    resultadoContainer.classList.add('hidden');

    const prompt = `
Eres un experto en gamificación y diseño de Escape Rooms educativos inmersivos.
Crea un Escape Room digital sobre el tema "${tema}" para alumnos de ${grado} de ${nivel}.
El estilo narrativo e inmersivo debe ser: ${narrativa}.
Genera exactamente ${numMisiones} misiones/salas de dificultad progresiva.
Reglas:
- Las respuestas correctas deben ser cortas (1 a 3 palabras) o un número exacto, sin tildes de preferencia para facilitar la validación.
- Redacta textos inmersivos que hagan sentir al alumno como el protagonista de la historia.

Devuelve SOLO un JSON válido con esta estructura exacta:
{
  "titulo": "Nombre creativo del Escape Room",
  "introduccion": "Historia inicial que plantea el problema urgente y el objetivo final.",
  "misiones": [
    {
      "titulo": "Sala 1: [Nombre de la sala]",
      "historia": "Narrativa de lo que ocurre al entrar a esta sala.",
      "reto": "El acertijo, problema matemático o pregunta educativa a resolver.",
      "respuesta_correcta": "respuesta",
      "pista": "Pista sutil si el alumno se equivoca"
    }
  ],
  "conclusion": "Mensaje épico de victoria y cierre de la historia."
}
    `.trim();

    let generatedBackgroundImage = '';
    try {
        // Generate background image based on theme and narrative
        const imageResult = await _escapeRoomTryGenerateImageWithGemini({
            prompt: `Fondo inmersivo para un escape room educativo. Estilo: ${narrativa}. Tema: ${tema}.`,
            aspectRatio: "16:9",
            imageSize: "1K"
        });
        generatedBackgroundImage = imageResult.dataUrl;
    } catch (imgErr) {
        alert(`Error al generar imagen de fondo: ${imgErr.message}`);
    }

    try {
        // Usamos authFetchJson que resuelve automáticamente el puerto del backend y los headers
        const data = await authFetchJson('/api/gemini/generate', {
            method: 'POST',
            body: {
                model: "gemini-2.5-flash",
                payload: {
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: "application/json", temperature: 0.7 }
                }
            }
        });

        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // Limpiar JSON
        let jsonString = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
        escapeRoomData = JSON.parse(jsonString);

        document.getElementById('jsonPreview').innerHTML = `
            <h3 class="font-bold text-lg text-blue-600 mb-2">${escapeRoomData.titulo}</h3>
            <p class="mb-4"><strong>Intro:</strong> ${escapeRoomData.introduccion}</p>
            <div class="space-y-4">
                ${escapeRoomData.misiones.map((m, i) => `
                    <div class="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                        <h4 class="font-bold text-slate-800">Sala ${i+1}: ${m.titulo}</h4>
                        <p class="text-sm mt-1"><strong>Reto:</strong> ${m.reto}</p>
                        <p class="text-sm text-emerald-600 mt-1"><strong>Respuesta:</strong> ${m.respuesta_correcta}</p>
                    </div>
                `).join('')}
            </div>
        `;
        escapeRoomData.backgroundImage = generatedBackgroundImage; // Store image data URL

        // Render the interactive preview
        const gameHTML = buildEscapeRoomHTML(escapeRoomData); // Ensure this function is called
        if (escapeRoomPreviewFrame) {
            escapeRoomPreviewFrame.srcdoc = gameHTML;
            escapeRoomPreviewPanel.classList.remove('hidden');
        }

        resultadoContainer.classList.remove('hidden');

    } catch (err) {
        alert(`Error: ${err.message}`);
    } finally {
        btnGenerar.disabled = false;
        btnGenerar.classList.remove('opacity-50');
        loading.classList.add('hidden');
    }
});

document.getElementById('btnExportar').addEventListener('click', () => {
    if (!escapeRoomData) return;
    
    const gameHTML = buildEscapeRoomHTML(escapeRoomData);
    const blob = new Blob([gameHTML], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EscapeRoom_${escapeRoomData.titulo.replace(/\s+/g, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

// Compilador del juego en un solo archivo HTML
function buildEscapeRoomHTML(data) {
    // Preparamos los datos inyectables asegurando que escapamos comillas
    const escapeStr = (str) => String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const backgroundStyle = data.backgroundImage ? `background-image: url('${escapeStr(data.backgroundImage)}'); background-size: cover; background-position: center;` : '';
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeStr(data.titulo)}</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
<style>
:root { --bg: #0f172a; --card: #1e293b; --text: #f8fafc; --accent: #38bdf8; --error: #ef4444; --success: #10b981; } body { ${backgroundStyle} }
body { margin: 0; padding: 20px; min-height: 100vh; background-color: var(--bg); color: var(--text); font-family: 'Outfit', sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.container { max-width: 700px; width: 100%; background: rgba(30, 41, 59, 0.8); padding: 40px; border-radius: 20px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); border: 1px solid #334155; position: relative; overflow: hidden; }
.room { display: none; animation: slideUp 0.5s ease-out forwards; }
.room.active { display: block; }
h1 { color: var(--accent); font-size: 2rem; margin-top: 0; text-align: center; }
h2 { color: #94a3b8; font-size: 1.2rem; text-transform: uppercase; letter-spacing: 2px; border-bottom: 2px solid #334155; padding-bottom: 10px; }
p { font-size: 1.1rem; line-height: 1.7; color: #cbd5e1; }
.input-group { margin-top: 30px; display: flex; flex-direction: column; gap: 15px; }
input { width: 100%; box-sizing: border-box; padding: 15px; border-radius: 10px; border: 2px solid #475569; background: #0f172a; color: #fff; font-size: 1.2rem; outline: none; transition: all 0.3s; text-align: center; }
input:focus { border-color: var(--accent); box-shadow: 0 0 15px rgba(56, 189, 248, 0.3); }
button { padding: 15px 30px; background: var(--accent); color: #0f172a; border: none; border-radius: 10px; font-size: 1.2rem; font-weight: 800; cursor: pointer; transition: all 0.2s; width: 100%; text-transform: uppercase; letter-spacing: 1px; }
button:hover { transform: translateY(-3px); box-shadow: 0 10px 20px rgba(56, 189, 248, 0.4); }
.shake { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; border-color: var(--error) !important; }
.hint { display: none; margin-top: 15px; padding: 15px; border-radius: 10px; background: rgba(245, 158, 11, 0.1); border-left: 4px solid #f59e0b; color: #fcd34d; font-style: italic; animation: fadeIn 0.3s; }
.progress { display: flex; justify-content: center; gap: 8px; margin-bottom: 30px; }
.dot { width: 12px; height: 12px; border-radius: 50%; background: #334155; transition: all 0.3s; }
.dot.active { background: var(--accent); box-shadow: 0 0 10px var(--accent); transform: scale(1.2); }

@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes shake { 10%, 90% { transform: translate3d(-2px, 0, 0); } 20%, 80% { transform: translate3d(4px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-6px, 0, 0); } 40%, 60% { transform: translate3d(6px, 0, 0); } }

.success-bg { background: linear-gradient(135deg, #064e3b 0%, #0f172a 100%); border-color: var(--success); }
</style>
</head>
<body>
<div class="container" id="gameBox">
<div class="progress" id="progressDots"></div>

<!-- Intro -->
<div class="room active" id="room-intro">
    <h1>${escapeStr(data.titulo)}</h1>
    <p>${escapeStr(data.introduccion)}</p>
    <div class="input-group">
        <button onclick="startGame()">¡Iniciar Misión!</button>
    </div>
</div>

<!-- Misiones -->
${data.misiones.map((m, i) => `
<div class="room" id="room-${i}">
    <h2>Misión ${i+1}</h2>
    <h1 style="font-size:1.5rem; color:#fff;">${escapeStr(m.titulo)}</h1>
    <p>${escapeStr(m.historia)}</p>
    <p style="color: var(--accent); font-weight: 600; margin-top:20px; padding:15px; background: rgba(56,189,248,0.1); border-radius:10px;">🧩 ${escapeStr(m.reto)}</p>
    
    <div class="input-group">
        <input type="text" id="input-${i}" placeholder="Escribe tu respuesta..." onkeypress="if(event.key === 'Enter') checkAnswer(${i})">
        <button onclick="checkAnswer(${i})">Comprobar</button>
        <div class="hint" id="hint-${i}">💡 Pista: ${escapeStr(m.pista)}</div>
    </div>
</div>
`).join('')}

<!-- Outro -->
<div class="room" id="room-outro">
    <h1 style="color: var(--success);">¡MISIÓN CUMPLIDA!</h1>
    <p>${escapeStr(data.conclusion)}</p>
    <div class="input-group">
        <button onclick="location.reload()" style="background:var(--success);">Volver a jugar</button>
    </div>
</div>
</div>

<script>
const misiones = ${JSON.stringify(data.misiones.map(m => String(m.respuesta_correcta).toLowerCase().trim()))};
let currentRoom = -1;

function renderDots() {
    const dots = document.getElementById('progressDots');
    if(currentRoom < 0 || currentRoom >= misiones.length) { dots.innerHTML = ''; return; }
    dots.innerHTML = misiones.map((_, i) => \`<div class="dot \${i <= currentRoom ? 'active' : ''}"></div>\`).join('');
}

function showRoom(index) {
    document.querySelectorAll('.room').forEach(r => r.classList.remove('active'));
    if(index === -1) document.getElementById('room-intro').classList.add('active');
    else if(index >= misiones.length) {
        document.getElementById('room-outro').classList.add('active');
        document.getElementById('gameBox').classList.add('success-bg');
    }
    else document.getElementById(\`room-\${index}\`).classList.add('active');
    
    currentRoom = index;
    renderDots();
}

function startGame() { showRoom(0); }

function checkAnswer(index) {
    const input = document.getElementById(\`input-\${index}\`);
    const hint = document.getElementById(\`hint-\${index}\`);
    // Limpieza agresiva para la validación (ignoramos espacios y tildes completamente)
    const userAns = String(input.value).toLowerCase().replace(/\\s+/g, "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");
    const correctAns = String(misiones[index]).replace(/\\s+/g, "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");
    
    if (userAns === correctAns) {
        showRoom(index + 1);
    } else {
        input.classList.remove('shake');
        void input.offsetWidth; // Trigger reflow
        input.classList.add('shake');
        hint.style.display = 'block';
        input.value = '';
    }
}
${'<' + '/script>'}
</body>
</html>`;
}
