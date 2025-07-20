import { metodologiaASC } from './metodologiaASC.js';

let historialConversacion = [];

// 📌 Configuración de la API de Google Gemini
const GOOGLE_AI_API_KEY = "AIzaSyA-Al10Diw6CkowW0F3EePEBD6D1h3jwxw"; // Reemplázalo con tu clave real
const GOOGLE_AI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

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
        const response = await fetch(`${GOOGLE_AI_ENDPOINT}?key=${GOOGLE_AI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: historialConversacion
            })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Error HTTP ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
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
        console.error("❌ Error con la API de Google:", error);
        return "Hubo un problema procesando tu solicitud.";
    }
}



// 📌 Función para agregar mensajes al chat con formato adecuado
function agregarMensajeChatbot(remitente, mensaje, clase) {
    const chatboxMensajes = document.getElementById("chatbotMessages");
    if (!chatboxMensajes) {
        console.error("❌ Error: No se encontró el contenedor de mensajes.");
        return;
    }

    const mensajeElemento = document.createElement("div");
    mensajeElemento.classList.add("chatbot-message", clase);
    mensajeElemento.innerHTML = `<strong>${remitente}:</strong> ${mensaje}`;
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

// 📌 Configuración del chatbot en la página
document.addEventListener("DOMContentLoaded", function () {
    const chatbotContainer = document.getElementById("chatbotContainer");
    const chatbotBubble = document.getElementById("chatbotBubble");
    const chatbotMessages = document.getElementById("chatbotMessages");
    const chatbotInput = document.getElementById("chatbotInput");
    const chatbotSend = document.getElementById("chatbotSend");
    const chatbotClose = document.getElementById("chatbotClose"); // Botón de cerrar

    // Verificar si los elementos existen antes de asignar eventos
    if (chatbotBubble && chatbotContainer) {
        chatbotBubble.addEventListener("click", function () {
            chatbotContainer.classList.add("show");

            // Mostrar mensaje de bienvenida solo la primera vez
            if (chatbotMessages && chatbotMessages.children.length === 0) {
                agregarMensajeChatbot("Charly", mensajeBienvenida(), "bot");
            }
        });
    }

    if (chatbotClose && chatbotContainer) {
        chatbotClose.addEventListener("click", function () {
          chatbotContainer.classList.remove("show");
      
          // ✅ Restaurar interacción con la burbuja al cerrar
          const bubble = document.getElementById("chatbotBubble");
          bubble.classList.remove("no-interactivo");
          bubble.style.pointerEvents = "auto";
        });
      }
      

    if (chatbotSend && chatbotInput) {
        chatbotSend.addEventListener("click", manejarEnvioMensaje);
        chatbotInput.addEventListener("keydown", function (event) {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault(); // ❌ evitar salto y envío
            }
        });
    }
});



function hacerArrastrableConInercia(elemento, onClickCallback) {
    let isDragging = false;
    let wasDragged = false;
    let offsetX = 0, offsetY = 0;
    let lastX = 0, lastY = 0;
    let velocityX = 0, velocityY = 0;
    let animationFrame;
  
    // Posición inicial
    let posX = elemento.offsetLeft;
    let posY = elemento.offsetTop;
  
    const onMouseDown = (e) => {
      cancelAnimationFrame(animationFrame);
      isDragging = true;
      wasDragged = false;
      const evt = e.touches ? e.touches[0] : e;
      offsetX = evt.clientX - elemento.offsetLeft;
      offsetY = evt.clientY - elemento.offsetTop;
      lastX = evt.clientX;
      lastY = evt.clientY;
      elemento.style.cursor = "grabbing";
    };
  
    const onMouseMove = (e) => {
      if (!isDragging) return;
      const evt = e.touches ? e.touches[0] : e;
  
      posX = evt.clientX - offsetX;
      posY = evt.clientY - offsetY;
  
      // Marcar como que se arrastró
      wasDragged = true;
  
      // Limitar dentro de ventana
      const maxX = window.innerWidth - elemento.offsetWidth;
      const maxY = window.innerHeight - elemento.offsetHeight;
      posX = Math.max(0, Math.min(posX, maxX));
      posY = Math.max(0, Math.min(posY, maxY));
  
      // Calcular velocidad
      velocityX = evt.clientX - lastX;
      velocityY = evt.clientY - lastY;
  
      lastX = evt.clientX;
      lastY = evt.clientY;
  
      elemento.style.left = posX + "px";
      elemento.style.top = posY + "px";
    };
  
    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      elemento.style.cursor = "grab";
  
      // Si no se arrastró, se trata de un clic real
      if (!wasDragged && typeof onClickCallback === "function") {
        onClickCallback();
      }
  
      aplicarInercia();
    };
  
    const aplicarInercia = () => {
      velocityX *= 0.95;
      velocityY *= 0.95;
  
      posX += velocityX;
      posY += velocityY;
  
      const maxX = window.innerWidth - elemento.offsetWidth;
      const maxY = window.innerHeight - elemento.offsetHeight;
  
      if (posX > maxX) { posX = maxX; velocityX *= -0.3; }
      if (posY > maxY) { posY = maxY; velocityY *= -0.3; }
      if (posX < 0) { posX = 0; velocityX *= -0.3; }
      if (posY < 0) { posY = 0; velocityY *= -0.3; }
  
      elemento.style.left = posX + "px";
      elemento.style.top = posY + "px";
  
      if (Math.abs(velocityX) > 0.5 || Math.abs(velocityY) > 0.5) {
        animationFrame = requestAnimationFrame(aplicarInercia);
      }
    };
  
    // Eventos
    elemento.addEventListener("mousedown", onMouseDown);
    elemento.addEventListener("touchstart", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("touchmove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("touchend", onMouseUp);
  }
  

// Inicializar cuando cargue
document.addEventListener("DOMContentLoaded", () => {
  const bubble = document.getElementById("chatbotBubble");
  hacerArrastrableConInercia(bubble);
});

