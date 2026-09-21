/**
 * mindmapBatchStickers.js
 * Generador interactivo por lotes de stickers faltantes para Mindmap Creator.
 * Procesa palabra por palabra con confirmación modal del usuario (Aceptar, Rehacer, Omitir, Detener).
 */
import { ref, uploadString, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js';

export const METAFORAS_VISUALES = {
  // Ejemplos explícitos solicitados:
  "my": "un niño con las manos en el pecho y un objeto entre las manos y el pecho como diciendo mío",
  "inside": "una caja abierta, dentro un objeto y una flecha señalando el objeto dentro de la caja",
  "light": "un foco o bombilla encendida con pequeños rayitos amarillos resplandecientes",

  // Preposiciones y ubicaciones espaciales:
  "in": "un frasco o taza abierta con una canica brillante adentro y una flecha señalándola",
  "outside": "una caja abierta y una pelota afuera en el suelo con una flecha señalando afuera de la caja",
  "out": "un conejito saliendo alegremente de un sombrero de copa con flecha hacia afuera",
  "on": "una manzana o taza apoyada firmemente sobre una mesa de madera con una flecha señalando arriba de la mesa",
  "under": "un gatito o un par de zapatos debajo de una pequeña mesa con una flecha apuntando hacia abajo",
  "over": "un pajarito volando por encima de un puente con una flecha curva sobrevolando",
  "behind": "un osito asomándose curioso por detrás del tronco de un árbol",
  "front": "un perrito sentado sonriente justo al frente de su casita",
  "between": "un objeto brillante ubicado justo en el medio de dos cajas",
  "into": "una moneda cayendo dentro de una alcancía con una flecha hacia adentro",
  "up": "un globo rojo elevándose hacia arriba con una flecha vertical apuntando hacia arriba",
  "down": "una hoja de árbol cayendo al suelo con una flecha vertical apuntando hacia abajo",
  "through": "un trenecito saliendo por el túnel de una montaña con flechas de paso",
  "across": "un puente simple cruzando de una orilla a otra de un río azul",
  "near": "dos amigos parados muy cerca uno del otro saludándose con una mano",
  "far": "un muñequito diminuto en el horizonte saludando a lo lejos",
  "toward": "una flecha curvada indicando dirección de avance hacia una colina",

  // Pronombres y personas:
  "mine": "un niño abrazando fuertemente un osito de peluche contra su pecho diciendo 'mío'",
  "your": "una mano infantil con el dedo índice señalando amigablemente hacia adelante",
  "you": "una mano infantil señalando hacia adelante al espectador con simpatía",
  "he": "un niño pequeño sonriente con gorrita de béisbol saludando con la mano",
  "him": "un niño pequeño sonriendo de pie saludando alegre",
  "his": "un niño pequeño sosteniendo su mochila favorita con orgullo",
  "she": "una niña pequeña con dos colitas en el pelo sonriendo alegre",
  "her": "una niña pequeña sonriendo con un vestidito y saludando con una mano",
  "hers": "una niña pequeña abrazando su libro favorito",
  "we": "dos niños tomados de la mano sonriendo juntos con alegría",
  "us": "dos niños abrazados como mejores amigos sonriendo juntos",
  "our": "dos niños mostrando juntos una banderita que comparten",
  "they": "tres niños juntos de espaldas caminando hacia una aventura",
  "them": "un grupo de tres niños sonrientes juntos",
  "it": "una cajita de regalo misteriosa con un lazo",
  "i": "un niño señalándose a sí mismo con el pulgar hacia su pecho con una sonrisa",
  "me": "un niño pequeño tocando su propio pecho sonriendo",
  "who": "un niño con una lupa grande buscando con curiosidad",

  // Familia y roles:
  "father": "un papá cariñoso sonriendo y saludando tiernamente con la mano",
  "dad": "un papá cariñoso y sonriente saludando amigablemente",
  "mother": "una mamá tierna sonriendo con los brazos abiertos para un abrazo",
  "mom": "una mamá cariñosa sonriendo y saludando tiernamente",
  "brother": "un hermanito con gorra y una pelota de fútbol bajo el brazo",
  "sister": "una hermanita con moño en el cabello saludando alegremente",
  "family": "una casita sencilla con un corazón en el tejado y figuras tomadas de la mano",
  "baby": "un biberón infantil con leche tibia y un chupete colorido al lado",
  "friend": "dos muñequitos de palito sonrientes abrazándose con afecto",
  "friends": "tres muñequitos sonrientes con los brazos en los hombros en equipo",

  // Sensaciones, emociones y estados:
  "worried": "una carita infantil con cejas fruncidas de preocupación y una gotita de sudor",
  "happy": "una carita redonda con una gran sonrisa radiante y mejillas sonrosadas",
  "sad": "una carita con la boca hacia abajo y una lágrima azul resbalando por la mejilla",
  "sleepy": "un osito bostezando con párpados pesados y tres letras 'Zzz' flotando",
  "asleep": "una almohadita mullida durmiendo en paz con gorro de dormir",
  "quiet": "un dedito índice sobre los labios cerrados haciendo el gesto de silencio 'shhh'",
  "peace": "una palomita blanca con una ramita verde en su pico",
  "gentle": "una pluma suave y ligera flotando delicadamente en el aire",
  "afraid": "un niño con los ojos muy abiertos y las manos en las mejillas sorprendido",
  "scared": "un niño con los ojos abiertos de sorpresa viendo una pequeña sombra",
  "angry": "una carita enfadada con el ceño fruncido y vapor suave saliendo de las orejas",
  "love": "un corazón rojo cálido dibujado a mano con trazos de crayón",

  // Luz, día, noche y clima:
  "flash": "un destello repentino de luz en forma de estrella brillante con chispitas",
  "glowing": "un frasco de vidrio transparente con luciérnagas doradas brillando adentro",
  "glow": "una esfera dorada irradiando pequeños rayos de luz cálida",
  "dark": "una luna menguante dormilona con un gorrito y una pequeña estrellita",
  "night": "un cielo con luna creciente y estrellitas sobre el tejado de una casa",
  "day": "un sol redondo y radiante saliendo sobre una pequeña colina verde",
  "sun": "un sol sonriente y amarillo con rayos rectos alegres",
  "moon": "una luna creciente plateada y suave con una sonrisa tranquila",
  "star": "una estrella amarilla brillante de cinco puntas con destellos",
  "sky": "dos nubes esponjosas flotando en un cielo azul pacífico",
  "wind": "tres líneas en espiral de viento ondeando y una hoja verde volando",
  "breeze": "una suave brisa ondulada que mece una pequeña margarita",

  // Verbos de acción:
  "woke": "un gallo cantando al amanecer con notas musicales y sol naciente",
  "wake": "un despertador retro clásico sonando con dos campanillas vibrando",
  "sleep": "una almohada suave y cómoda con tres letras 'Zzz' subiendo",
  "walk": "un par de zapatillas dando un paso sobre un caminito con huellitas",
  "walked": "dos huellas de zapatos sobre un sendero marcando el camino recorrido",
  "looked": "dos ojos grandes y atentos mirando hacia una dirección con pestañas",
  "look": "un par de ojos curiosos y abiertos mirando atentamente al frente",
  "see": "un ojo grande y expresivo con una pequeña estrella en la pupila",
  "saw": "unos anteojos o una lupa enfocando un objeto brillante",
  "opened": "una puerta de madera entreabierta dejando entrar luz cálida",
  "open": "una puerta entreabierta mostrando un interior iluminado y acogedor",
  "close": "una puerta de madera cerrada con su pomo redondo y cerrojo",
  "closed": "un candado cerrado con su llave al lado",
  "sudden": "un rayo relámpago zigzagueante amarillo que sorprende",
  "suddenly": "un rayo relámpago zigzagueante amarillo con chispitas de sorpresa",
  "run": "un niño corriendo a toda velocidad con zapatillas y nubes de polvo",
  "running": "piernitas infantiles corriendo rápido con líneas de velocidad",
  "jump": "un niño dando un salto alto en el aire con rayitas de rebote debajo",
  "fly": "un avioncito de papel blanco volando en curva con estela punteada",
  "swim": "un pececito feliz nadando entre ondas de agua y burbujas",
  "eat": "una manzana roja brillante con un mordisco en el costado",
  "drink": "un vaso con jugo y una pajita o popote con gotitas",
  "go": "un semáforo con luz verde encendida invitando a avanzar",
  "went": "un cochecito avanzando en un camino dejando huella",
  "stop": "una señal roja octogonal de alto con una mano blanca dibujada",
  "come": "una manito infantil haciendo un gesto amigable de invitación a acercarse",
  "help": "un aro salvavidas rojo y blanco o dos manos sosteniéndose",
  "together": "dos manos infantiles entrelazadas fuertemente en equipo",
  "swept": "una ráfaga de viento suave barriendo hojas secas en espiral",
  "bringing": "dos manos infantiles abiertas entregando una flor de regalo",

  // Lugares y cosas:
  "hill": "una colina verde suave y redondeada con un caminito zigzagueante",
  "town": "tres casitas pequeñas con techos rojos, ventanas y una farola",
  "valley": "dos colinas verdes suaves con un pequeño río y flores en medio",
  "house": "una casita clásica con tejado triangular, chimenea con humo y puerta",
  "home": "una casita acogedora con un corazón en la ventana y humo en la chimenea",
  "tree": "un árbol frondoso verde con tronco marrón y dos frutos rojos",
  "water": "un vaso de agua azul clara y dos gotitas de agua saltando",
  "fire": "tres lenguas de fuego vivas en colores amarillo y naranja",
  "book": "un libro de cuentos abierto con una cinta marcapáginas colorida",
  "car": "un autito de juguete rojo con dos ruedas negras",
  "eyes": "dos ojos infantiles bonitos y expresivos bien abiertos",
  "eye": "un ojo bien abierto con pestañas y pupila brillante",
  "whole": "un pastel completo redondo con una velita sin cortar",
  "one": "el número 1 dibujado con estilo infantil y una estrellita",
  "two": "dos cerezas rojas unidas por un tallo verde",
  "three": "tres globos de colores flotando juntos"
};


export const ESTILO_DEFAULT = "dibujo minimalista hecho por un niño en blanco y negro con algunos elementos a color, fondo blanco puro sin fondo de sticker ni marco, sin texto";
const STORAGE_KEY_ESTILO = "mc_sticker_prompt_suffix";

export function obtenerEstiloConfigurado() {
  return localStorage.getItem(STORAGE_KEY_ESTILO) || ESTILO_DEFAULT;
}

export function guardarEstiloConfigurado(nuevoEstilo) {
  if (nuevoEstilo && nuevoEstilo.trim()) {
    localStorage.setItem(STORAGE_KEY_ESTILO, nuevoEstilo.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY_ESTILO);
  }
}

export function resetearEstiloConfigurado() {
  localStorage.removeItem(STORAGE_KEY_ESTILO);
}

export const PREFIJO_DEFAULT = "un elemento, o conjunto de elementos, persona o acción que represente el significado de la palabra";
const STORAGE_KEY_PREFIJO = "mc_sticker_prompt_prefix";
const STORAGE_KEY_TRADUCIR_PROMPT = "mc_sticker_translate_prompt";

export function obtenerPrefijoConfigurado() {
  return localStorage.getItem(STORAGE_KEY_PREFIJO) || PREFIJO_DEFAULT;
}

export function guardarPrefijoConfigurado(val) {
  if (val && val.trim()) {
    localStorage.setItem(STORAGE_KEY_PREFIJO, val.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY_PREFIJO);
  }
}

export function construirPromptStickerSimple(palabra, opciones = {}) {
  const clean = String(palabra || "")
    .trim()
    .toLowerCase()
    .replace(/[.,;:!?()¿¡"'`´]/g, "")
    .trim();

  const prefijo = String(opciones.prefijo ?? obtenerPrefijoConfigurado()).trim();
  let estilo = String(opciones.estilo ?? obtenerEstiloConfigurado()).trim();
  const comoTexto = Boolean(opciones.comoTexto);

  if (comoTexto && clean) {
    estilo = estilo
      .replace(/\bsin texto\b/gi, "")
      .replace(/\s+,/g, ",")
      .replace(/,{2,}/g, ",")
      .trim();
    return [
      `un sticker tipográfico que muestre únicamente la palabra exacta "${clean}" dibujada con letras grandes, claras, infantiles y muy legibles`,
      estilo,
      `TEXTO OBLIGATORIO: escribir exactamente "${clean}", sin traducir, sin cambiar letras y sin agregar objetos ni personajes`
    ].filter(Boolean).join(", ");
  }

  let metafora = METAFORAS_VISUALES[clean];
  if (!metafora) {
    if (clean.endsWith("ing") && METAFORAS_VISUALES[clean.slice(0, -3)]) {
      metafora = METAFORAS_VISUALES[clean.slice(0, -3)];
    } else if (clean.endsWith("ed") && METAFORAS_VISUALES[clean.slice(0, -2)]) {
      metafora = METAFORAS_VISUALES[clean.slice(0, -2)];
    } else if (clean.endsWith("s") && METAFORAS_VISUALES[clean.slice(0, -1)]) {
      metafora = METAFORAS_VISUALES[clean.slice(0, -1)];
    }
  }

  let primeraParte = "";
  if (clean) {
    if (prefijo.includes("${clean}") || prefijo.includes('"{clean}"')) {
      primeraParte = prefijo.replace(/\$*\{clean\}/g, clean);
    } else {
      primeraParte = `${prefijo} "${clean}"`;
    }
    if (metafora) {
      primeraParte += ` (${metafora})`;
    }
  } else {
    primeraParte = prefijo;
  }

  return estilo ? `${primeraParte}, ${estilo}` : primeraParte;
}

function cargarImagenParaComponer(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo cargar uno de los stickers para combinarlo."));
    image.src = src;
  });
}

function dibujarImagenAjustada(ctx, image, x, y, width, height) {
  const sourceWidth = image.naturalWidth || image.width || 1;
  const sourceHeight = image.naturalHeight || image.height || 1;
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  ctx.drawImage(
    image,
    x + ((width - drawWidth) / 2),
    y + ((height - drawHeight) / 2),
    drawWidth,
    drawHeight
  );
}

export function crearStickerTextoDataUrl(palabra, size = 1024) {
  const texto = String(palabra || "").trim();
  if (!texto) throw new Error("La palabra para el sticker de texto está vacía.");

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const maxWidth = size * 0.84;
  let fontSize = Math.round(size * 0.3);

  ctx.clearRect(0, 0, size, size);
  do {
    ctx.font = `900 ${fontSize}px "Arial Rounded MT Bold", "Trebuchet MS", sans-serif`;
    if (ctx.measureText(texto).width <= maxWidth) break;
    fontSize -= 8;
  } while (fontSize > 72);

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = Math.max(8, Math.round(fontSize * 0.075));
  ctx.fillStyle = "#facc15";
  ctx.strokeText(texto, size / 2, size / 2, maxWidth);
  ctx.fillText(texto, size / 2, size / 2, maxWidth);
  ctx.restore();

  return canvas.toDataURL("image/png");
}

export async function combinarDosStickers(dataUrlA, dataUrlB, size = 1024) {
  const [imageA, imageB] = await Promise.all([
    cargarImagenParaComponer(dataUrlA),
    cargarImagenParaComponer(dataUrlB)
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const padding = Math.round(size * 0.06);
  const centerGap = Math.round(size * 0.12);
  const slotWidth = (size - (padding * 2) - centerGap) / 2;
  const slotHeight = size - (padding * 2);

  ctx.clearRect(0, 0, size, size);
  dibujarImagenAjustada(ctx, imageA, padding, padding, slotWidth, slotHeight);
  dibujarImagenAjustada(ctx, imageB, padding + slotWidth + centerGap, padding, slotWidth, slotHeight);

  const center = size / 2;
  const plusRadius = Math.round(size * 0.026);
  ctx.save();
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = Math.max(6, Math.round(size * 0.008));
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(center - plusRadius, center);
  ctx.lineTo(center + plusRadius, center);
  ctx.moveTo(center, center - plusRadius);
  ctx.lineTo(center, center + plusRadius);
  ctx.stroke();
  ctx.restore();

  return canvas.toDataURL("image/png");
}

export function inicializarGeneradorBatchStickers({
  storage,
  generateGeminiImage,
  translatePromptToEnglish,
  asegurarIndiceStickers,
  stickerIndex,
  stickerCache,
  getTextos,
  onStickerGuardado,
  onFinalizado
}) {
  const modal = document.getElementById("mcModalBatchStickers");
  if (!modal) return;

  // Botones principales y modal
  const btnClose = document.getElementById("mcCloseBatchModal");
  const btnCancelar = document.getElementById("mcBatchBtnCancelar");
  const btnOmitir = document.getElementById("mcBatchBtnOmitir");
  const btnCrear = document.getElementById("mcBatchBtnCrear");
  const btnRehacer = document.getElementById("mcBatchBtnRehacer");
  const btnAceptar = document.getElementById("mcBatchBtnAceptar");
  const btnCrearTodas = document.getElementById("mcBatchBtnCrearTodas");
  const btnToggleComposite = document.getElementById("mcBtnToggleComposite");
  const compositeBuilder = document.getElementById("mcCompositeBuilder");

  // Panel de configuración
  const btnConfig = document.getElementById("mcBatchBtnConfig");
  const configPanel = document.getElementById("mcBatchConfigPanel");
  const configCloseBtn = document.getElementById("mcBatchConfigCloseBtn");
  const configStyleInput = document.getElementById("mcBatchConfigStyleInput");
  const configTranslateInput = document.getElementById("mcBatchTranslatePrompt");
  const configResetBtn = document.getElementById("mcBatchConfigResetBtn");
  const configSaveBtn = document.getElementById("mcBatchConfigSaveBtn");

  // Elementos de progreso y vista
  const progressText = document.getElementById("mcBatchProgressText");
  const remainingBadge = document.getElementById("mcBatchRemainingBadge");
  const progressBar = document.getElementById("mcBatchProgressBar");
  const currentWordEl = document.getElementById("mcBatchCurrentWord");
  const statusText = document.getElementById("mcBatchStatusText");
  const previewImg = document.getElementById("mcBatchPreviewImg");
  const loadingPlaceholder = document.getElementById("mcBatchLoadingPlaceholder");
  const placeholderIcon = document.getElementById("mcBatchPlaceholderIcon");
  const placeholderText = document.getElementById("mcBatchPlaceholderText");
  const promptInput = document.getElementById("mcBatchPromptInput");
  const manualWordInput = document.getElementById("mcBatchManualWordInput");
  const manualWordButton = document.getElementById("mcBatchAddManualWord");
  const wordAsTextInput = document.getElementById("mcBatchWordAsText");
  const compositeTargetInput = document.getElementById("mcCompositeTarget");
  const compositePartAInput = document.getElementById("mcCompositePartA");
  const compositePartBInput = document.getElementById("mcCompositePartB");
  const compositePreviewA = document.getElementById("mcCompositePreviewA");
  const compositePreviewB = document.getElementById("mcCompositePreviewB");
  const compositePlaceholderA = document.getElementById("mcCompositePlaceholderA");
  const compositePlaceholderB = document.getElementById("mcCompositePlaceholderB");
  const compositeGenerateA = document.getElementById("mcCompositeGenerateA");
  const compositeGenerateB = document.getElementById("mcCompositeGenerateB");
  const btnCompose = document.getElementById("mcBatchBtnCompose");

  let queue = [];
  let currentIndex = 0;
  let currentDataUrl = null;
  let isGenerating = false;
  let isAutoCreating = false;
  let abortRequested = false;
  let isPreparingBatch = false;
  let generationVersion = 0;
  let compositeDataUrlA = null;
  let compositeDataUrlB = null;
  let promptTranslationVersion = 0;

  if (configTranslateInput) {
    configTranslateInput.checked = localStorage.getItem(STORAGE_KEY_TRADUCIR_PROMPT) === "1";
  }

  async function traducirPromptSiCorresponde(prompt, requestVersion, palabra) {
    if (!configTranslateInput?.checked || typeof translatePromptToEnglish !== "function") return prompt;
    if (promptInput?.dataset.language === "en" && promptInput.value.trim() === String(prompt || "").trim()) {
      return prompt;
    }
    if (statusText) {
      statusText.innerHTML = `<i class="fas fa-language text-blue-500"></i> Traduciendo prompt...`;
    }
    if (placeholderText) placeholderText.textContent = `Traduciendo el prompt de “${palabra}”...`;
    const translatedPrompt = await translatePromptToEnglish(prompt);
    if (abortRequested || requestVersion !== generationVersion) {
      throw new DOMException("Generación cancelada", "AbortError");
    }
    const cleanPrompt = String(translatedPrompt || "").trim();
    if (!cleanPrompt) throw new Error("La traducción del prompt está vacía.");
    if (promptInput) {
      promptInput.value = cleanPrompt;
      ajustarAlturaPrompt();
    }
    return cleanPrompt;
  }

  function crearOpcionesReintento(requestVersion, palabra) {
    return {
      shouldAbort: () => abortRequested || requestVersion !== generationVersion,
      onRetry: ({ reason, attempt, totalAttempts, delayMs, switchedModel }) => {
        if (abortRequested || requestVersion !== generationVersion) return;
        const seconds = Math.max(1, Math.ceil(delayMs / 1000));
        if (reason === "pacing") {
          if (statusText) {
            statusText.innerHTML = `<i class="fas fa-hourglass-half text-blue-500"></i> Pausa de seguridad: siguiente generación en ${seconds}s`;
          }
          if (placeholderText) placeholderText.textContent = `Esperando el turno para crear “${palabra}”...`;
          return;
        }
        const modelStatus = switchedModel ? " Cambiando de modelo." : "";
        if (statusText) {
          statusText.innerHTML = `<i class="fas fa-clock-rotate-left text-amber-500"></i> Límite temporal.${modelStatus} Reintento ${attempt}/${totalAttempts} en ${seconds}s`;
        }
        if (placeholderText) placeholderText.textContent = `Esperando para reintentar “${palabra}”...`;
      }
    };
  }

  function ajustarAlturaPrompt() {
    if (!promptInput) return;
    const maxHeight = 256;
    promptInput.style.height = "auto";
    const nextHeight = Math.min(Math.max(promptInput.scrollHeight, 52), maxHeight);
    promptInput.style.height = `${nextHeight}px`;
    promptInput.style.overflowY = promptInput.scrollHeight > maxHeight ? "auto" : "hidden";
  }

  function abrirModal() {
    modal.classList.add("is-open");
    if (configPanel) configPanel.classList.add("hidden");
    document.dispatchEvent(new CustomEvent("mc:sticker-workspace-open", { detail: { tab: "create" } }));
    requestAnimationFrame(ajustarAlturaPrompt);
  }

  function alternarCompositorStickers() {
    if (!compositeBuilder) return;
    const abrir = compositeBuilder.classList.contains("hidden");
    if (abrir) abrirModal();
    compositeBuilder.classList.toggle("hidden", !abrir);
    compositeBuilder.setAttribute("aria-hidden", String(!abrir));
    btnToggleComposite?.setAttribute("aria-expanded", String(abrir));
    if (abrir) compositeTargetInput?.focus();
  }

  function cerrarModal() {
    generationVersion++;
    modal.classList.remove("is-open");
    if (configPanel) configPanel.classList.add("hidden");
    queue = [];
    currentIndex = 0;
    currentDataUrl = null;
    isGenerating = false;
    isAutoCreating = false;
    abortRequested = false;
    actualizarEstadoCrearTodas();
    document.dispatchEvent(new CustomEvent("mc:sticker-workspace-close"));
  }

  function detenerGeneracion() {
    abortRequested = true;
    generationVersion++;
    queue = [];
    currentIndex = 0;
    currentDataUrl = null;
    compositeDataUrlA = null;
    compositeDataUrlB = null;
    isGenerating = false;
    isAutoCreating = false;
    isPreparingBatch = false;
    setBotonesBloqueados(false);

    if (previewImg) {
      previewImg.classList.add("hidden");
      previewImg.src = "";
    }
    if (loadingPlaceholder) loadingPlaceholder.classList.remove("hidden");
    if (placeholderIcon) placeholderIcon.className = "fas fa-wand-magic-sparkles text-amber-500 text-3xl mb-2";
    if (placeholderText) placeholderText.textContent = "Escribe una palabra para crear un sticker.";
    restablecerPrevisualizacionesCompuestas();

    abortRequested = false;
    actualizarUIProgreso();
    actualizarEstadoCrearTodas();
    manualWordInput?.focus();
  }

  function actualizarEstadoCrearTodas() {
    if (!btnCrearTodas) return;
    const icon = btnCrearTodas.querySelector("i");
    btnCrearTodas.disabled = isGenerating && !isAutoCreating;
    btnCrearTodas.title = isAutoCreating
      ? "Detener creación automática"
      : "Crear y aceptar todos los stickers faltantes";
    btnCrearTodas.setAttribute("aria-label", btnCrearTodas.title);
    if (icon) {
      icon.className = isAutoCreating
        ? "fas fa-stop mc-icon--rose"
        : "fas fa-check-double mc-icon--emerald";
    }
  }

  function setBotonesBloqueados(bloqueado) {
    if (btnCrear) btnCrear.disabled = bloqueado;
    if (btnAceptar) btnAceptar.disabled = bloqueado;
    if (btnRehacer) btnRehacer.disabled = bloqueado;
    if (btnOmitir) btnOmitir.disabled = bloqueado;
    if (btnCancelar) btnCancelar.disabled = false;
    if (promptInput) promptInput.disabled = bloqueado;
    if (btnConfig) btnConfig.disabled = bloqueado;
    if (configTranslateInput) configTranslateInput.disabled = bloqueado;
    if (btnCrearTodas) btnCrearTodas.disabled = bloqueado && !isAutoCreating;
    if (btnCompose) btnCompose.disabled = bloqueado || !compositeDataUrlA || !compositeDataUrlB;
    if (compositeGenerateA) compositeGenerateA.disabled = bloqueado;
    if (compositeGenerateB) compositeGenerateB.disabled = bloqueado;
    if (compositeTargetInput) compositeTargetInput.disabled = bloqueado;
    if (compositePartAInput) compositePartAInput.disabled = bloqueado;
    if (compositePartBInput) compositePartBInput.disabled = bloqueado;
  }

  function actualizarUIProgreso() {
    const total = queue.length;
    if (!total) {
      if (progressText) progressText.textContent = "Sin palabras en cola";
      if (remainingBadge) remainingBadge.textContent = "0 pendientes";
      if (progressBar) progressBar.style.width = "0%";
      if (currentWordEl) currentWordEl.textContent = "—";
      if (statusText) statusText.innerHTML = `<i class="fas fa-pen-nib text-slate-400"></i> Escribe una palabra para comenzar`;
      if (promptInput) {
        promptInput.value = "";
        ajustarAlturaPrompt();
      }
      if (btnCrear) {
        btnCrear.classList.remove("hidden");
        btnCrear.disabled = true;
      }
      if (btnRehacer) btnRehacer.classList.add("hidden");
      if (btnAceptar) btnAceptar.classList.add("hidden");
      return;
    }
    const actual = currentIndex + 1;
    const restantes = Math.max(0, total - actual);
    const porcentaje = total > 0 ? Math.round((currentIndex / total) * 100) : 0;

    if (progressText) progressText.textContent = `Palabra ${actual} de ${total}`;
    if (remainingBadge) remainingBadge.textContent = `${restantes} restante${restantes === 1 ? '' : 's'}`;
    if (progressBar) progressBar.style.width = `${porcentaje}%`;
  }

  function limpiarPalabraParaAlmacen(palabra) {
    return String(palabra || "")
      .trim()
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 30);
  }

  function palabraTieneSticker(p) {
    const clean = String(p || "").toLowerCase().trim();
    if (!clean) return true;
    if (stickerCache.has(clean) && stickerCache.get(clean)) return true;
    const variantes = [
      clean,
      clean.replace(/[_-]/g, " "),
      clean.replace(/\s+/g, "_"),
      clean.replace(/\s+/g, "-")
    ];
    for (const v of variantes) {
      if (stickerIndex.has(v)) return true;
    }
    return false;
  }

  // FASE 1: Preparar la palabra actual, mostrar el prompt editable y esperar confirmación del usuario
  function prepararPalabraActual() {
    if (abortRequested || currentIndex >= queue.length) {
      finalizarLote();
      return;
    }

    const palabra = queue[currentIndex];
    currentDataUrl = null;
    isGenerating = false;

    actualizarUIProgreso();
    if (currentWordEl) currentWordEl.textContent = palabra;
    if (statusText) {
      statusText.innerHTML = `<i class="fas fa-pen-nib text-slate-400"></i> Revisa el prompt antes de crear`;
    }

    // Resetear preview para mostrar invitación a crear
    if (previewImg) {
      previewImg.classList.add("hidden");
      previewImg.src = "";
    }
    if (loadingPlaceholder) loadingPlaceholder.classList.remove("hidden");
    if (placeholderIcon) placeholderIcon.className = "fas fa-wand-magic-sparkles text-amber-500 text-3xl mb-2";
    if (placeholderText) placeholderText.textContent = 'Revisa el prompt y presiona “Crear sticker” para generar la imagen.';

    // Prompt mnemotécnico específico para la palabra
    actualizarPromptActualEnPantalla();
    if (promptInput) promptInput.disabled = false;

    // Ajustar botones para Fase 1 (Confirmar creación previa)
    if (btnCrear) {
      btnCrear.classList.remove("hidden");
      btnCrear.disabled = false;
    }
    if (btnRehacer) btnRehacer.classList.add("hidden");
    if (btnAceptar) btnAceptar.classList.add("hidden");
    if (btnOmitir) btnOmitir.disabled = false;
    if (btnCancelar) btnCancelar.disabled = false;
    if (btnConfig) btnConfig.disabled = false;
    if (configTranslateInput) configTranslateInput.disabled = false;
  }

  function abrirModalConCola() {
    abrirModal();
    if (queue.length) prepararPalabraActual();
    else actualizarUIProgreso();
  }

  function agregarPalabraManual() {
    const palabra = manualWordInput?.value?.trim();
    if (!palabra) return;
    abortRequested = false;
    if (!queue.some((item) => item.toLowerCase() === palabra.toLowerCase())) {
      queue.push(palabra);
    }
    if (manualWordInput) manualWordInput.value = "";
    if (!modal.classList.contains("is-open")) abrirModal();
    actualizarUIProgreso();
    if (!isGenerating && currentIndex >= queue.length - 1 && currentIndex === 0 && !currentDataUrl) {
      prepararPalabraActual();
    } else if (!isGenerating && currentIndex >= queue.length - 1 && !currentDataUrl) {
      prepararPalabraActual();
    }
  }

  function restablecerPrevisualizacionCompuesta(preview, placeholder) {
    if (preview) {
      preview.src = "";
      preview.classList.add("hidden");
    }
    if (placeholder) {
      placeholder.classList.remove("hidden");
      placeholder.innerHTML = '<i class="fas fa-image"></i>';
    }
  }

  function restablecerPrevisualizacionesCompuestas() {
    restablecerPrevisualizacionCompuesta(compositePreviewA, compositePlaceholderA);
    restablecerPrevisualizacionCompuesta(compositePreviewB, compositePlaceholderB);
    if (btnCompose) btnCompose.disabled = true;
  }

  function actualizarBotonComponer() {
    if (btnCompose) btnCompose.disabled = isGenerating || !compositeDataUrlA || !compositeDataUrlB;
  }

  async function generarParteCompuesta(partKey) {
    if (isGenerating) return;
    const esParteA = partKey === "A";
    const input = esParteA ? compositePartAInput : compositePartBInput;
    const preview = esParteA ? compositePreviewA : compositePreviewB;
    const placeholder = esParteA ? compositePlaceholderA : compositePlaceholderB;
    const palabra = input?.value?.trim() || "";
    if (!palabra) {
      alert(`Escribe el nombre del ${esParteA ? "primer" : "segundo"} sticker.`);
      input?.focus();
      return;
    }

    const requestVersion = ++generationVersion;
    abortRequested = false;
    isGenerating = true;
    setBotonesBloqueados(true);
    if (placeholder) {
      placeholder.classList.remove("hidden");
      placeholder.innerHTML = '<i class="mc-batch-preview__spinner"></i>';
    }
    if (preview) preview.classList.add("hidden");
    if (statusText) statusText.innerHTML = `<i class="fas fa-spinner fa-spin text-blue-500"></i> Creando “${palabra}”...`;

    try {
      const promptCompuesto = construirPromptStickerSimple(palabra);
      const promptParaEnviar = wordAsTextInput?.checked
        ? promptCompuesto
        : await traducirPromptSiCorresponde(promptCompuesto, requestVersion, palabra);
      const dataUrl = wordAsTextInput?.checked
        ? crearStickerTextoDataUrl(palabra)
        : await generateGeminiImage(
          promptParaEnviar,
          {
            aspectRatio: "1:1",
            imageSize: "1K",
            ...crearOpcionesReintento(requestVersion, palabra)
          }
        );
      if (abortRequested || requestVersion !== generationVersion) return;
      if (esParteA) compositeDataUrlA = dataUrl;
      else compositeDataUrlB = dataUrl;
      if (preview) {
        preview.src = dataUrl;
        preview.classList.remove("hidden");
      }
      if (placeholder) placeholder.classList.add("hidden");
      if (statusText) statusText.innerHTML = `<i class="fas fa-circle-check text-emerald-600"></i> “${palabra}” listo`;
    } catch (error) {
      if (abortRequested || requestVersion !== generationVersion) return;
      if (placeholder) placeholder.innerHTML = '<i class="fas fa-triangle-exclamation text-amber-500"></i>';
      if (statusText) statusText.innerHTML = `<i class="fas fa-triangle-exclamation text-amber-500"></i> No se pudo crear “${palabra}”`;
      alert(`No se pudo crear “${palabra}”: ${error.message || error}`);
    } finally {
      if (requestVersion === generationVersion) {
        isGenerating = false;
        setBotonesBloqueados(false);
        actualizarBotonComponer();
        if (!queue.length && btnCrear) btnCrear.disabled = true;
      }
    }
  }

  async function guardarStickerCompuesto() {
    if (isGenerating || !compositeDataUrlA || !compositeDataUrlB) return;
    const palabraFinal = compositeTargetInput?.value?.trim() || "";
    if (!palabraFinal) {
      alert("Escribe el nombre de la palabra final.");
      compositeTargetInput?.focus();
      return;
    }

    const requestVersion = ++generationVersion;
    const cleanNombre = limpiarPalabraParaAlmacen(palabraFinal);
    abortRequested = false;
    isGenerating = true;
    setBotonesBloqueados(true);
    if (currentWordEl) currentWordEl.textContent = palabraFinal;
    if (progressText) progressText.textContent = "Uniendo stickers";
    if (remainingBadge) remainingBadge.textContent = "Guardando";
    if (statusText) statusText.innerHTML = `<i class="fas fa-object-group text-fuchsia-600"></i> Uniendo y guardando...`;

    try {
      const compositeDataUrl = await combinarDosStickers(compositeDataUrlA, compositeDataUrlB);
      const refImg = ref(storage, `mindmap/${cleanNombre}.png`);
      await uploadString(refImg, compositeDataUrl, "data_url");
      if (abortRequested || requestVersion !== generationVersion) return;
      const persistentUrl = await getDownloadURL(refImg);
      if (abortRequested || requestVersion !== generationVersion) return;
      const refreshedUrl = `${persistentUrl}${persistentUrl.includes("?") ? "&" : "?"}mc=${Date.now()}`;

      stickerIndex.set(cleanNombre, refImg);
      stickerCache.set(cleanNombre, refreshedUrl);
      currentDataUrl = compositeDataUrl;
      if (typeof onStickerGuardado === "function") {
        onStickerGuardado(cleanNombre, refreshedUrl, palabraFinal);
      }
      if (previewImg) {
        previewImg.src = compositeDataUrl;
        previewImg.classList.remove("hidden");
      }
      if (loadingPlaceholder) loadingPlaceholder.classList.add("hidden");
      if (progressBar) progressBar.style.width = "100%";
      if (remainingBadge) remainingBadge.textContent = "Guardado";
      if (statusText) statusText.innerHTML = `<i class="fas fa-circle-check text-emerald-600"></i> “${palabraFinal}” unido, guardado y sustituido`;
    } catch (error) {
      if (abortRequested || requestVersion !== generationVersion) return;
      if (statusText) statusText.innerHTML = `<i class="fas fa-triangle-exclamation text-amber-500"></i> No se pudo guardar la combinación`;
      alert(`No se pudo guardar el sticker compuesto: ${error.message || error}`);
    } finally {
      if (requestVersion === generationVersion) {
        isGenerating = false;
        setBotonesBloqueados(false);
        actualizarBotonComponer();
        if (!queue.length && btnCrear) btnCrear.disabled = true;
      }
    }
  }

  // FASE 2: Generar la imagen a partir del prompt confirmado por el usuario
  async function generarStickerActual() {
    if (isGenerating || currentIndex >= queue.length) return false;
    const requestVersion = ++generationVersion;
    const palabra = queue[currentIndex];
    let promptPersonalizado = promptInput?.value?.trim() || construirPromptStickerSimple(palabra, {
      comoTexto: wordAsTextInput?.checked
    });

    setBotonesBloqueados(true);
    isGenerating = true;

    if (previewImg) previewImg.classList.add("hidden");
    if (loadingPlaceholder) loadingPlaceholder.classList.remove("hidden");
    if (placeholderIcon) placeholderIcon.className = "mc-batch-preview__spinner";
    if (placeholderText) placeholderText.textContent = "Creando sticker educativo...";
    if (statusText) {
      statusText.innerHTML = `<i class="fas fa-spinner fa-spin text-blue-500"></i> Creando imagen...`;
    }

    try {
      if (!wordAsTextInput?.checked) {
        promptPersonalizado = await traducirPromptSiCorresponde(promptPersonalizado, requestVersion, palabra);
      }
      currentDataUrl = wordAsTextInput?.checked
        ? crearStickerTextoDataUrl(palabra)
        : await generateGeminiImage(promptPersonalizado, {
          aspectRatio: "1:1",
          imageSize: "1K",
          ...crearOpcionesReintento(requestVersion, palabra)
        });
      if (abortRequested || requestVersion !== generationVersion) return;

      if (previewImg) {
        previewImg.src = currentDataUrl;
        previewImg.classList.remove("hidden");
      }
      if (loadingPlaceholder) loadingPlaceholder.classList.add("hidden");
      if (statusText) {
        statusText.innerHTML = `<i class="fas fa-eye text-emerald-600"></i> ¿Deseas aceptar esta imagen o rehacerla?`;
      }

      // Pasar a controles de aceptación o rehacer
      if (btnCrear) btnCrear.classList.add("hidden");
      if (btnRehacer) {
        btnRehacer.classList.remove("hidden");
        btnRehacer.disabled = false;
      }
      if (btnAceptar) {
        btnAceptar.classList.remove("hidden");
        btnAceptar.disabled = false;
      }
      if (btnOmitir) btnOmitir.disabled = false;
      if (btnCancelar) btnCancelar.disabled = false;
      if (promptInput) promptInput.disabled = false;
      if (btnConfig) btnConfig.disabled = false;
      if (configTranslateInput) configTranslateInput.disabled = false;
      return true;
    } catch (err) {
      if (abortRequested || requestVersion !== generationVersion) return;
      if (loadingPlaceholder) loadingPlaceholder.classList.remove("hidden");
      if (placeholderIcon) placeholderIcon.className = "fas fa-triangle-exclamation text-amber-500 text-3xl mb-2";
      if (placeholderText) placeholderText.textContent = "No se pudo crear la imagen.";
      if (statusText) {
        statusText.innerHTML = `<i class="fas fa-triangle-exclamation text-amber-500"></i> Error al generar`;
      }
      if (btnCrear) {
        btnCrear.classList.remove("hidden");
        btnCrear.disabled = false;
      }
      if (btnRehacer) btnRehacer.classList.add("hidden");
      if (btnAceptar) btnAceptar.classList.add("hidden");
      if (btnOmitir) btnOmitir.disabled = false;
      if (btnCancelar) btnCancelar.disabled = false;
      if (promptInput) promptInput.disabled = false;
      if (btnConfig) btnConfig.disabled = false;
      if (configTranslateInput) configTranslateInput.disabled = false;
      alert(`Error al generar sticker para "${palabra}": ${err.message || err}`);
      return false;
    } finally {
      if (requestVersion === generationVersion) isGenerating = false;
    }
  }

  // FASE 3: Aceptar la imagen creada y pasar a la siguiente palabra
  async function aceptarYGuardarActual() {
    if (!currentDataUrl || isGenerating || currentIndex >= queue.length) return false;
    const palabra = queue[currentIndex];
    const cleanNombre = limpiarPalabraParaAlmacen(palabra);

    setBotonesBloqueados(true);
    if (statusText) {
      statusText.innerHTML = `<i class="fas fa-cloud-arrow-up fa-fade text-blue-500"></i> Guardando imagen...`;
    }

    try {
      const refImg = ref(storage, `mindmap/${cleanNombre}.png`);
      await uploadString(refImg, currentDataUrl, "data_url");
      const persistentUrl = await getDownloadURL(refImg);

      // Actualizar índices
      stickerIndex.set(cleanNombre, refImg);
      stickerCache.set(cleanNombre, persistentUrl);

      if (typeof onStickerGuardado === "function") {
        onStickerGuardado(cleanNombre, persistentUrl, palabra);
      }

      // Pasar a preparar la siguiente palabra
      currentIndex++;
      if (currentIndex < queue.length) {
        prepararPalabraActual();
      } else {
        finalizarLote();
      }
      return true;
    } catch (err) {
      alert(`No se pudo guardar "${cleanNombre}": ${err.message || err}`);
      setBotonesBloqueados(false);
      if (statusText) {
        statusText.innerHTML = `<i class="fas fa-triangle-exclamation text-amber-500"></i> Error al guardar`;
      }
      return false;
    }
  }

  async function crearYAceptarTodas() {
    if (isAutoCreating || isPreparingBatch || isGenerating) return;

    abortRequested = false;
    isAutoCreating = true;
    actualizarEstadoCrearTodas();

    try {
      if (!queue.length || currentIndex >= queue.length) {
        await iniciarBatch();
      }

      if (!isAutoCreating) return;
      if (!queue.length || currentIndex >= queue.length) {
        if (statusText) {
          statusText.innerHTML = `<i class="fas fa-circle-check text-emerald-600"></i> No hay stickers faltantes`;
        }
        return;
      }

      while (!abortRequested && currentIndex < queue.length) {
        if (!currentDataUrl) {
          const generado = await generarStickerActual();
          if (!generado || abortRequested) break;
        }

        const guardado = await aceptarYGuardarActual();
        if (!guardado || abortRequested) break;
      }
    } finally {
      isAutoCreating = false;
      actualizarEstadoCrearTodas();
    }
  }

  function omitirActual() {
    if (isGenerating) return;
    currentIndex++;
    if (currentIndex < queue.length) {
      prepararPalabraActual();
    } else {
      finalizarLote();
    }
  }

  function finalizarLote() {
    if (progressBar) progressBar.style.width = "100%";
    if (statusText) statusText.innerHTML = `<i class="fas fa-circle-check text-emerald-600"></i> ¡Completado!`;
    setTimeout(() => {
      cerrarModal();
      if (typeof onFinalizado === "function") {
        onFinalizado();
      }
      alert("¡Proceso de generación de stickers completado con éxito!");
    }, 400);
  }

  async function iniciarBatch() {
    if (isPreparingBatch || isGenerating) return;
    const prepVersion = ++generationVersion;
    isPreparingBatch = true;
    abrirModal();
    if (progressText) progressText.textContent = "Buscando stickers faltantes...";
    if (remainingBadge) remainingBadge.textContent = "Analizando";
    if (statusText) statusText.innerHTML = `<i class="fas fa-spinner fa-spin text-blue-500"></i> Preparando la cola`;

    const { textoParte1 = "", textoParte2 = "" } = (typeof getTextos === "function" ? getTextos() : {});
    const textoCompleto = `${textoParte1} ${textoParte2}`.trim();

    if (!textoCompleto) {
      queue = [];
      currentIndex = 0;
      currentDataUrl = null;
      abortRequested = false;
      abrirModalConCola();
      isPreparingBatch = false;
      return;
    }

    // Extraer palabras únicas (mínimo 2 letras, ignorar números)
    const tokens = textoCompleto
      .toLowerCase()
      .replace(/[^\w\s-]/g, " ")
      .split(/\s+/)
      .map(w => w.trim())
      .filter(w => w.length > 1 && !/^\d+$/.test(w));

    const palabrasUnicas = Array.from(new Set(tokens));

    if (palabrasUnicas.length === 0) {
      queue = [];
      currentIndex = 0;
      currentDataUrl = null;
      abortRequested = false;
      abrirModalConCola();
      isPreparingBatch = false;
      return;
    }

    try {
      if (typeof asegurarIndiceStickers === "function") await asegurarIndiceStickers();
      if (abortRequested || prepVersion !== generationVersion) {
        isPreparingBatch = false;
        return;
      }
    } catch (error) {
      if (abortRequested || prepVersion !== generationVersion) {
        isPreparingBatch = false;
        return;
      }
      console.error("No se pudo preparar el índice de stickers:", error);
      if (progressText) progressText.textContent = "No se pudo revisar la biblioteca";
      if (remainingBadge) remainingBadge.textContent = "Error";
      if (statusText) statusText.innerHTML = `<i class="fas fa-triangle-exclamation text-amber-500"></i> Revisa la conexión e inténtalo de nuevo`;
      isPreparingBatch = false;
      return;
    }

    const faltantes = palabrasUnicas.filter(p => !palabraTieneSticker(p));

    queue = faltantes;
    currentIndex = 0;
    currentDataUrl = null;
    abortRequested = false;

    abrirModalConCola();
    isPreparingBatch = false;
  }

  // Event Listeners de Configuración de Prompt
  const configPrefixInput = document.getElementById("mcBatchConfigPrefixInput");

  btnConfig?.addEventListener("click", () => {
    if (!configPanel) return;
    if (!modal.classList.contains("is-open")) abrirModal();
    const estaOculto = configPanel.classList.contains("hidden");
    if (estaOculto) {
      if (configStyleInput) configStyleInput.value = obtenerEstiloConfigurado();
      if (configPrefixInput) configPrefixInput.value = obtenerPrefijoConfigurado();
      configPanel.classList.remove("hidden");
    } else {
      configPanel.classList.add("hidden");
    }
  });

  configCloseBtn?.addEventListener("click", () => {
    configPanel?.classList.add("hidden");
  });

  function obtenerConfiguracionPromptEnEdicion() {
    return {
      prefijo: configPrefixInput?.value?.trim() || PREFIJO_DEFAULT,
      estilo: configStyleInput?.value?.trim() || ESTILO_DEFAULT
    };
  }

  async function traducirPromptVisible(promptOriginal, palabra) {
    if (!promptInput) return;
    const translationVersion = ++promptTranslationVersion;
    promptInput.value = promptOriginal;
    promptInput.dataset.language = "es";
    ajustarAlturaPrompt();

    if (!configTranslateInput?.checked || wordAsTextInput?.checked || typeof translatePromptToEnglish !== "function") return;
    if (statusText && !isGenerating) {
      statusText.innerHTML = '<i class="fas fa-language text-blue-500"></i> Traduciendo prompt...';
    }

    try {
      const traducido = String(await translatePromptToEnglish(promptOriginal) || "").trim();
      if (translationVersion !== promptTranslationVersion || !configTranslateInput.checked) return;
      if (!traducido) throw new Error("La traducción del prompt está vacía.");
      promptInput.value = traducido;
      promptInput.dataset.language = "en";
      ajustarAlturaPrompt();
      if (statusText && !isGenerating) {
        statusText.innerHTML = `<i class="fas fa-language text-emerald-600"></i> Prompt listo en inglés para “${palabra || "la palabra"}”`;
      }
    } catch (error) {
      if (translationVersion !== promptTranslationVersion) return;
      promptInput.dataset.language = "es";
      if (statusText && !isGenerating) {
        statusText.innerHTML = `<i class="fas fa-triangle-exclamation text-amber-500"></i> ${error.message || "No se pudo traducir el prompt"}`;
      }
    }
  }

  function actualizarPromptActualEnPantalla(opciones = {}) {
    if (!promptInput) return;
    const palabra =
      (queue && queue.length > currentIndex && queue[currentIndex]) ||
      (currentWordEl && currentWordEl.textContent && currentWordEl.textContent !== "—" && currentWordEl.textContent !== "..." ? currentWordEl.textContent.trim() : "") ||
      manualWordInput?.value?.trim() ||
      "";
    const config = opciones.usarInputs ? obtenerConfiguracionPromptEnEdicion() : {};

    let promptOriginal = "";
    if (palabra) {
      promptOriginal = construirPromptStickerSimple(palabra, {
        ...config,
        comoTexto: wordAsTextInput?.checked
      });
    } else {
      const prefijo = String(config.prefijo ?? obtenerPrefijoConfigurado()).trim();
      const estilo = String(config.estilo ?? obtenerEstiloConfigurado()).trim();
      promptOriginal = estilo ? `${prefijo}, ${estilo}` : prefijo;
    }
    void traducirPromptVisible(promptOriginal, palabra);
  }

  configResetBtn?.addEventListener("click", () => {
    resetearEstiloConfigurado();
    if (configStyleInput) configStyleInput.value = ESTILO_DEFAULT;
    if (configPrefixInput) configPrefixInput.value = PREFIJO_DEFAULT;
    localStorage.removeItem("mc_sticker_prompt_prefix");
    actualizarPromptActualEnPantalla({ usarInputs: true });
  });

  configSaveBtn?.addEventListener("click", () => {
    const nuevoEstilo = configStyleInput?.value?.trim() || "";
    guardarEstiloConfigurado(nuevoEstilo);
    const nuevoPrefijo = configPrefixInput?.value?.trim() || "";
    guardarPrefijoConfigurado(nuevoPrefijo);
    localStorage.setItem(STORAGE_KEY_TRADUCIR_PROMPT, configTranslateInput?.checked ? "1" : "0");
    configPanel?.classList.add("hidden");
    actualizarPromptActualEnPantalla();
  });

  configPrefixInput?.addEventListener("input", () => {
    actualizarPromptActualEnPantalla({ usarInputs: true });
  });

  configStyleInput?.addEventListener("input", () => {
    actualizarPromptActualEnPantalla({ usarInputs: true });
  });
  configTranslateInput?.addEventListener("change", () => {
    localStorage.setItem(STORAGE_KEY_TRADUCIR_PROMPT, configTranslateInput.checked ? "1" : "0");
    actualizarPromptActualEnPantalla({ usarInputs: !configPanel?.classList.contains("hidden") });
  });
  promptInput?.addEventListener("input", () => {
    promptTranslationVersion += 1;
    promptInput.dataset.language = "manual";
    ajustarAlturaPrompt();
  });
  wordAsTextInput?.addEventListener("change", () => actualizarPromptActualEnPantalla());

  // Event Listeners de Control de Generación
  btnCrear?.addEventListener("click", generarStickerActual);
  btnRehacer?.addEventListener("click", generarStickerActual);
  btnAceptar?.addEventListener("click", aceptarYGuardarActual);
  btnCrearTodas?.addEventListener("click", () => {
    if (isAutoCreating || isPreparingBatch) detenerGeneracion();
    else crearYAceptarTodas();
  });
  btnOmitir?.addEventListener("click", omitirActual);
  btnToggleComposite?.addEventListener("click", alternarCompositorStickers);
  btnCancelar?.addEventListener("click", detenerGeneracion);
  btnClose?.addEventListener("click", () => {
    abortRequested = true;
    cerrarModal();
  });
  manualWordButton?.addEventListener("click", agregarPalabraManual);
  compositeGenerateA?.addEventListener("click", () => generarParteCompuesta("A"));
  compositeGenerateB?.addEventListener("click", () => generarParteCompuesta("B"));
  btnCompose?.addEventListener("click", guardarStickerCompuesto);
  compositePartAInput?.addEventListener("input", () => {
    compositeDataUrlA = null;
    restablecerPrevisualizacionCompuesta(compositePreviewA, compositePlaceholderA);
    actualizarBotonComponer();
  });
  compositePartBInput?.addEventListener("input", () => {
    compositeDataUrlB = null;
    restablecerPrevisualizacionCompuesta(compositePreviewB, compositePlaceholderB);
    actualizarBotonComponer();
  });
  manualWordInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      agregarPalabraManual();
    }
  });

  document.querySelectorAll("[data-mc-start-batch]").forEach((button) => {
    button.addEventListener("click", iniciarBatch);
  });

  return {
    iniciarBatch,
    obtenerEstiloConfigurado,
    guardarEstiloConfigurado,
    resetearEstiloConfigurado,
    obtenerPrefijoConfigurado,
    guardarPrefijoConfigurado
  };
}
