import { metodologiaASC } from './metodologiaASC.js';
import { authFetchJson } from "./api-client.js";

let historialConversacion = [];

// 📌 Configuración de backend seguro
const GOOGLE_AI_MODEL = "gemini-2.0-flash";

// 📌 Lista de herramientas disponibles en la página
const herramientas = [
    { nombre: "Generador de Letras", descripcion: "Crea letras de canciones infantiles con IA.", id: "canciones" },
    { nombre: "Creador de Cuestionarios", descripcion: "Genera cuestionarios a partir de textos o páginas web.", id: "cuestionarios" },
    { nombre: "Estructurador de Ideas", descripcion: "Organiza tus ideas y genera instrucciones claras.", id: "estructurador" },
    { nombre: "Generador de Contextos", descripcion: "Conecta los temas de la clase a ejemplos del mundo real.", id: "contexto-real" },
    { nombre: "Generador de Rúbricas", descripcion: "Diseña rúbricas de calificación claras y detalladas.", id: "rubrica" },
    { nombre: "Planificador de Clases", descripcion: "Genera actividades adaptadas a diferentes estilos de aprendizaje.", id: "planificadorDiferenciado" },
    { nombre: "Generador de Explicaciones", descripcion: "Obtén explicaciones adaptadas al nivel académico y materia.", id: "explicador" },
    { nombre: "Generador de Materiales Didácticos", descripcion: "Crea materiales didácticos personalizados.", id: "materialesDidacticos" },
    { nombre: "Generador de Proyectos", descripcion: "Crea proyectos educativos con actividades organizadas.", id: "generadorProyectos" },
    { nombre: "Generador de Gamificación", descripcion: "Crea estrategias gamificadas adaptadas a tu nivel y materia.", id: "gamificacion" },
    { nombre: "Generador de Imágenes", descripcion: "Crea imágenes con IA a partir de descripciones.", id: "generadorImagenes" }
];


  

// 📌 Función para generar el mensaje de bienvenida con consejos de uso
function mensajeBienvenida() {
    return `
        <div style="font-size: 12px; line-height: 1.4;">
            <p><b>¡Hola! Me alegra mucho que estés aquí.</b></p>
            <p>Estoy aquí para acompañarte con cariño en tu proceso creativo y educativo. Puedes contar conmigo para:</p>

            <ul style="padding-left: 18px; font-size:12px;">
                <li>✍️ <b>Editar textos, lecturas o actividades</b> que estés preparando.</li>
                <li>📚 <b>Buscar fuentes bibliográficas o referencias</b> confiables para tus clases o trabajos.</li>
                <li>🔍 <b>Explicar el significado de palabras</b> o frases difíciles, o ayudarte a redactar mejor.</li>
                <li>🧠 <b>Organizar tus ideas</b>, armar rúbricas, planificar sesiones, o convertir textos en cuestionarios.</li>
            </ul>

            <p>✨ Solo dime lo que necesitas, y con mucho gusto te ayudaré. ¡Estoy contigo! 💫</p>

            <p style="margin-top: 0.8rem;"><i>Puedes comenzar diciendo algo como:<br>
            <b>"Ayúdame a editar este texto..."</b> o <b>"¿Qué significa *epistemología*?"</b></i></p>
        </div>
    `;
}



// 📌 Función para formatear la respuesta del chatbot con HTML
function formatearRespuesta(mensaje) {
    // Reemplazar negritas en markdown por HTML
    mensaje = mensaje.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");
    
    // Convertir saltos de línea en HTML <br>
    mensaje = mensaje.replace(/\n/g, "<br>");

    // Convertir listas con viñetas en listas HTML
    mensaje = mensaje.replace(/- (.*?)\n/g, "<li>$1</li>");
    
    // Si hay listas de viñetas, envolverlas en <ul>
    if (mensaje.includes("<li>")) {
        mensaje = mensaje.replace(/(<li>.*?<\/li>)+/gs, "<ul>$&</ul>");
    }

    return mensaje;
}

// 📌 Función para obtener respuesta del chatbot con formato HTML y memoria
async function obtenerRespuestaChatbot(mensaje) {
    try {
        let sugerencias = [];

        // 🔹 Detectar herramientas mencionadas por el usuario
        herramientas.forEach(herramienta => {
            if (
                mensaje.toLowerCase().includes(herramienta.nombre.toLowerCase()) ||
                mensaje.toLowerCase().includes(herramienta.descripcion.toLowerCase())
            ) {
                sugerencias.push(`📌 <b>${herramienta.nombre}</b> - ${herramienta.descripcion} 
                <br> 👉 <button onclick="mostrarHerramienta('${herramienta.id}')">Abrir</button>`);
            }
        });

        // 🔹 Si es la primera interacción, agregar metodología como contexto en el primer mensaje
        if (historialConversacion.length === 0) {
            historialConversacion.push({
                role: "user",
                parts: [{
                    text: `Eres un asistente pedagógico llamado Charly que ayuda con actividades escolares y contenido educativo. 
Sigue esta metodología llamada ASC para todas tus respuestas:\n\n${metodologiaASC}`
                }]
            });
        }

        // 🔹 Agregar mensaje actual del usuario
        historialConversacion.push({
            role: "user",
            parts: [{ text: mensaje }]
        });

        // 🔹 Enviar solicitud
        const data = await authFetchJson(`/api/gemini/generate`, {
            method: "POST",
            body: JSON.stringify({
                model: GOOGLE_AI_MODEL,
                payload: {
                    contents: historialConversacion
                }
            })
        });
        const respuestaTexto = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No tengo una respuesta en este momento.";

        // 🔹 Agregar respuesta al historial
        historialConversacion.push({
            role: "model",
            parts: [{ text: respuestaTexto }]
        });

        // 🔹 Limitar historial a 30
        if (historialConversacion.length > 30) {
            historialConversacion = historialConversacion.slice(-30);
        }

        // 🔹 Combinar con sugerencias
        const respuestaFinal = sugerencias.length > 0
            ? `${formatearRespuesta(respuestaTexto)}<hr><div class="chat-sugerencias">${sugerencias.join("<br>")}</div>`
            : formatearRespuesta(respuestaTexto);

        return respuestaFinal;

    } catch (error) {
        return "Hubo un problema procesando tu solicitud.";
    }
}



// 📌 Función para agregar mensajes al chat con formato adecuado
function agregarMensajeChatbot(remitente, mensaje, clase) {
    const chatboxMensajes = document.getElementById("chatbotMessages");
    if (!chatboxMensajes) {
        return;
    }

    const mensajeElemento = document.createElement("div");
    mensajeElemento.classList.add("chatbot-message", clase);
    const strong = document.createElement("strong");
    strong.textContent = `${String(remitente || "")}:`;
    const text = document.createElement("span");
    text.textContent = ` ${String(mensaje || "").replace(/<[^>]*>/g, "")}`;
    mensajeElemento.appendChild(strong);
    mensajeElemento.appendChild(text);
    chatboxMensajes.appendChild(mensajeElemento);
    chatboxMensajes.scrollTop = chatboxMensajes.scrollHeight;
}

// 📌 Función para manejar el envío de mensajes en el chat
async function manejarEnvioMensaje() {
    const inputMensaje = document.getElementById("chatbotInput");
    const mensajeUsuario = inputMensaje.innerText.trim(); // permite saltos de línea

    if (!mensajeUsuario) return;

    agregarMensajeChatbot("Tú", mensajeUsuario, "user");
    inputMensaje.innerHTML = ""; // limpia el div editable


    // 👉 Agregar mensaje de "generando respuesta"
    const chatboxMensajes = document.getElementById("chatbotMessages");
    const cargandoElemento = document.createElement("div");
    cargandoElemento.classList.add("chatbot-message", "bot");
    cargandoElemento.innerHTML = `<strong>Charly:</strong> <i>Generando respuesta...</i>`;
    chatboxMensajes.appendChild(cargandoElemento);
    chatboxMensajes.scrollTop = chatboxMensajes.scrollHeight;


    const respuestaChatbot = await obtenerRespuestaChatbot(mensajeUsuario);
    agregarMensajeChatbot("Charly", respuestaChatbot, "bot");
}

function hacerArrastrableConInercia(elemento, onTapCallback) {
    if (!elemento) return;

    let isDragging = false;
    let wasDragged = false;
    let suppressClick = false;
    let startX = 0;
    let startY = 0;
    let offsetX = 0;
    let offsetY = 0;
    let lastX = 0;
    let lastY = 0;
    let velocityX = 0;
    let velocityY = 0;
    let animationFrame = null;
    const DRAG_THRESHOLD = 6;

    let posX = Number.isFinite(elemento.offsetLeft) ? elemento.offsetLeft : 10;
    let posY = Number.isFinite(elemento.offsetTop) ? elemento.offsetTop : 10;

    const clampToViewport = () => {
        const maxX = Math.max(0, window.innerWidth - elemento.offsetWidth);
        const maxY = Math.max(0, window.innerHeight - elemento.offsetHeight);
        posX = Math.max(0, Math.min(posX, maxX));
        posY = Math.max(0, Math.min(posY, maxY));
    };

    const paint = () => {
        elemento.style.left = `${posX}px`;
        elemento.style.top = `${posY}px`;
    };

    clampToViewport();
    paint();

    const onPointerDown = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        if (animationFrame) cancelAnimationFrame(animationFrame);

        isDragging = true;
        wasDragged = false;
        suppressClick = false;
        velocityX = 0;
        velocityY = 0;

        startX = e.clientX;
        startY = e.clientY;
        offsetX = e.clientX - posX;
        offsetY = e.clientY - posY;
        lastX = e.clientX;
        lastY = e.clientY;

        elemento.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
        elemento.setPointerCapture?.(e.pointerId);
    };

    const onPointerMove = (e) => {
        if (!isDragging) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!wasDragged && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
            wasDragged = true;
        }

        posX = e.clientX - offsetX;
        posY = e.clientY - offsetY;
        clampToViewport();

        velocityX = e.clientX - lastX;
        velocityY = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;

        paint();
    };

    const applyInertia = () => {
        velocityX *= 0.92;
        velocityY *= 0.92;
        posX += velocityX;
        posY += velocityY;

        const maxX = Math.max(0, window.innerWidth - elemento.offsetWidth);
        const maxY = Math.max(0, window.innerHeight - elemento.offsetHeight);

        if (posX > maxX) { posX = maxX; velocityX *= -0.25; }
        if (posY > maxY) { posY = maxY; velocityY *= -0.25; }
        if (posX < 0) { posX = 0; velocityX *= -0.25; }
        if (posY < 0) { posY = 0; velocityY *= -0.25; }

        paint();

        if (Math.abs(velocityX) > 0.35 || Math.abs(velocityY) > 0.35) {
            animationFrame = requestAnimationFrame(applyInertia);
        } else {
            animationFrame = null;
        }
    };

    const onPointerUp = (e) => {
        if (!isDragging) return;
        isDragging = false;
        elemento.style.cursor = "grab";
        document.body.style.userSelect = "";
        elemento.releasePointerCapture?.(e.pointerId);

        if (wasDragged) {
            suppressClick = true;
            applyInertia();
            return;
        }

        if (typeof onTapCallback === "function") {
            onTapCallback();
        }
    };

    elemento.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("resize", () => {
        clampToViewport();
        paint();
    });

    elemento.addEventListener("click", (e) => {
        if (suppressClick) {
            e.preventDefault();
            e.stopPropagation();
            suppressClick = false;
        }
    }, true);
}

// 📌 Configuración del chatbot en la página
document.addEventListener("DOMContentLoaded", function () {
    const chatbotContainer = document.getElementById("chatbotContainer");
    const chatbotBubble = document.getElementById("chatbotBubble");
    const chatbotMessages = document.getElementById("chatbotMessages");
    const chatbotInput = document.getElementById("chatbotInput");
    const chatbotSend = document.getElementById("chatbotSend");
    const chatbotClose = document.getElementById("chatbotClose");

    if (!chatbotBubble || !chatbotContainer) return;

    const abrirChatbot = () => {
        chatbotContainer.classList.add("show");
        chatbotBubble.classList.remove("no-interactivo");
        chatbotBubble.style.pointerEvents = "auto";
        if (chatbotMessages && chatbotMessages.children.length === 0) {
            agregarMensajeChatbot("Charly", mensajeBienvenida(), "bot");
        }
    };

    const cerrarChatbot = () => {
        chatbotContainer.classList.remove("show");
        chatbotBubble.classList.remove("no-interactivo");
        chatbotBubble.style.pointerEvents = "auto";
    };

    chatbotBubble.addEventListener("click", abrirChatbot);
    hacerArrastrableConInercia(chatbotBubble, abrirChatbot);

    if (chatbotClose) {
        chatbotClose.addEventListener("click", cerrarChatbot);
    }

    if (chatbotSend && chatbotInput) {
        chatbotSend.addEventListener("click", manejarEnvioMensaje);
        chatbotInput.addEventListener("keydown", function (event) {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
            }
        });
    }
});
