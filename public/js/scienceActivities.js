import { authFetchJson, buildApiUrl, buildVeoApiUrl } from "./api-client.js";
import { createScienceGame, installAccessibleGameState } from "./science-game-runtime.mjs?v=20260731-rive-mission-circuit-v1";
import { installScienceActivitiesMotion } from "./science-activities-motion.mjs?v=20260730-micro-missions-v1";
import { generateImagesViaGemini } from "../imagecreator/api.js";
import { characterPresets, createCharacterSprite } from "./science-character-library.mjs?v=20260728-subject-style-characters";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { doc, getFirestore, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { getDownloadURL, getStorage, ref as firebaseStorageRef, uploadBytes } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";
import { getDefaultFirebaseApp } from "./firebase-default-app.js";

const STORAGE_KEY = "scienceActivities.sessions.v2";
const DRAFT_STORAGE_KEY = "scienceActivities.draft.v2";
const ACTIVE_SESSION_STORAGE_KEY = "scienceActivities.activeSession.v1";
const OFFLINE_DB_NAME = "scienceActivities.offline.v1";
const OFFLINE_DB_VERSION = 1;
const OFFLINE_SESSIONS_STORE = "sessions";
const OFFLINE_DRAFTS_STORE = "drafts";
const CUSTOM_CHARACTER_STORAGE_KEY = "scienceActivities.characters.v1";
const SCIENCE_CHARACTER_STORAGE_BUCKET = "gs://charly-brown.firebasestorage.app";
const SCIENCE_THEME_STORAGE_KEY = "scienceActivities.theme.v1";
const EXPERIENCE_PROPOSAL_MEMORY_KEY = "scienceActivities.experienceProposals.v1";
const RUNTIME_URL = new URL("./science-game-runtime.mjs?v=20260731-rive-mission-circuit-v1", import.meta.url);
const PHASER_URL = new URL("../vendor/phaser/phaser.esm.js", import.meta.url);
const ANIME_URL = new URL("../vendor/animejs/anime.esm.min.js", import.meta.url);
const ANIME_LICENSE_URL = new URL("../vendor/animejs/LICENSE.md", import.meta.url);
const MOTION_URL = new URL("./science-activities-motion.mjs?v=20260730-micro-missions-v1", import.meta.url);
const RIVE_RUNTIME_URL = new URL("../vendor/rive/rive.js", import.meta.url);
const RIVE_WASM_URL = new URL("../vendor/rive/rive.wasm", import.meta.url);
const RIVE_LICENSE_URL = new URL("../vendor/rive/LICENSE.txt", import.meta.url);
const RIVE_HUD_SCRIPT_URL = new URL("./science-rive-hud.js?v=20260731-rive-mission-controls-v1", import.meta.url);
const RIVE_HUD_ASSET_URL = new URL("../assets/rive/science-tech-hud.riv?v=20260731-rive-mission-carousel-v1", import.meta.url);
const RIVE_HUD_ATTRIBUTION_URL = new URL("../assets/rive/ATTRIBUTION.txt", import.meta.url);
let draftSaveTimer = 0;
let offlineDbPromise = null;
let restoredDraftTimestamp = 0;

function readCustomCharacters() {
  try {
    const stored = JSON.parse(localStorage.getItem(CUSTOM_CHARACTER_STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function fillCharacterOptions(selectedId = "", activeCharacter = null) {
  const subject = state.activity.subject || $("#subjectSelect")?.value || "physics";
  const visualStyle = state.activity.visualStyle || $("#visualStyleSelect")?.value || "kawaii-lab";
  const presets = characterPresets(subject, visualStyle, readCustomCharacters());
  if (activeCharacter?.id && !presets.some((item) => item.id === activeCharacter.id)) presets.push(activeCharacter);
  const select = $("#characterSelect");
  if (!select) return presets;
  select.innerHTML = presets.map((preset) => (
    `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.name)} · ${escapeHtml(preset.role)}</option>`
  )).join("");
  const selected = presets.find((item) => item.id === selectedId) || presets[0];
  if (selected) select.value = selected.id;
  return presets;
}

function renderCharacterPreview() {
  const character = state.activity.playerCharacter;
  const sprite = state.activity.playerSprite;
  const preview = $("#characterPreviewSprite");
  if (!character || !sprite?.dataUrl || !preview) return;
  preview.style.backgroundImage = `url("${sprite.dataUrl}")`;
  $("#characterPreviewName").textContent = character.name;
  $("#characterDescription").textContent = `${character.role}. Adaptado a ${SUBJECT_LABELS[state.activity.subject] || "la materia"} y al estilo seleccionado.`;
  populateCharacterCustomizer();
}

function applySelectedCharacter(shouldRender = true) {
  const presets = fillCharacterOptions($("#characterSelect")?.value, state.activity.playerCharacter);
  const selected = presets.find((item) => item.id === $("#characterSelect")?.value) || presets[0];
  if (!selected) return;
  state.activity.playerCharacter = structuredClone(selected);
  state.activity.playerSprite = createCharacterSprite(selected);
  renderCharacterPreview();
  scheduleLocalDraftSave();
  if (shouldRender) renderGame();
}

function populateCharacterCustomizer() {
  const character = state.activity.playerCharacter;
  if (!character || !$("#characterNameInput")) return;
  $("#characterNameInput").value = character.name || "";
  $("#characterRoleInput").value = character.role || "";
  $("#characterBodySelect").value = character.bodyType || (character.id?.endsWith("-2") ? "tech" : "explorer");
  $("#characterPrimaryColor").value = /^#[0-9a-f]{6}$/i.test(character.palette?.[0]) ? character.palette[0] : "#4e8cff";
  $("#characterAccentColor").value = /^#[0-9a-f]{6}$/i.test(character.palette?.[1]) ? character.palette[1] : "#ff7b8f";
}

function createCharacterVariation() {
  populateCharacterModal();
  $("#characterCreatorModal").classList.add("show");
  $("#characterCreatorModal").setAttribute("aria-hidden", "false");
}

function closeCharacterModal() {
  $("#characterCreatorModal").classList.remove("show");
  $("#characterCreatorModal").setAttribute("aria-hidden", "true");
}

function selectedCharacterMovements() {
  return Object.fromEntries(
    [...document.querySelectorAll("[data-character-movement]")]
      .map((input) => [input.value, input.checked]),
  );
}

function populateCharacterModal() {
  const character = state.activity.playerCharacter || characterPresets(
    state.activity.subject,
    state.activity.visualStyle,
  )[0];
  $("#characterModalName").value = character?.name || "";
  $("#characterModalRole").value = character?.role || "";
  $("#characterGenderSelect").value = character?.gender || "female";
  $("#characterPlayerStyle").value = character?.playerStyle || "arcade-hd";
  $("#characterPromptInput").value = character?.prompt || "";
  const movements = character?.movements || {};
  document.querySelectorAll("[data-character-movement]").forEach((input) => {
    input.checked = movements[input.value] !== false;
  });
  const image = $("#characterModalPreview");
  image.src = state.activity.playerSprite?.dataUrl || state.activity.playerSprite?.src || "";
  image.hidden = !image.src;
  $("#characterModalEmpty").hidden = Boolean(image.src);
  $("#characterModalStatus").textContent = "Configura el personaje y genera su plantilla de movimientos.";
}

function characterConfigFromModal() {
  const base = state.activity.playerCharacter || characterPresets(
    state.activity.subject,
    state.activity.visualStyle,
  )[0];
  return {
    ...base,
    id: base?.custom ? base.id : `custom-${state.activity.subject}-${state.activity.visualStyle}-${crypto.randomUUID()}`,
    name: $("#characterModalName").value.trim() || base?.name || "Personaje",
    role: $("#characterModalRole").value.trim() || base?.role || "Explorador científico",
    gender: $("#characterGenderSelect").value,
    playerStyle: $("#characterPlayerStyle").value,
    prompt: $("#characterPromptInput").value.trim(),
    movements: selectedCharacterMovements(),
    bodyType: $("#characterBodySelect")?.value || base?.bodyType || "explorer",
    palette: base?.palette || ["#4e8cff", "#ff7b8f", "#183b4e", "#ffd166"],
    subject: state.activity.subject,
    visualStyle: state.activity.visualStyle,
    custom: true,
  };
}

async function generateCharacterTemplate() {
  const button = $("#generateCharacterTemplateBtn");
  const character = characterConfigFromModal();
  button.disabled = true;
  $("#characterModalStatus").textContent = "Generando una hoja de movimientos consistente…";
  try {
    const sprite = await generatePlayerSpriteWithGemini(state.activity, character);
    if (!sprite?.dataUrl) throw new Error("No se recibió una plantilla válida.");
    state.activity.playerCharacter = character;
    state.activity.playerSprite = sprite;
    const saved = readCustomCharacters();
    localStorage.setItem(
      CUSTOM_CHARACTER_STORAGE_KEY,
      JSON.stringify([...saved.filter((item) => item.id !== character.id), character].slice(-24)),
    );
    fillCharacterOptions(character.id, character);
    renderCharacterPreview();
    $("#characterModalPreview").src = sprite.dataUrl;
    $("#characterModalPreview").hidden = false;
    $("#characterModalEmpty").hidden = true;
    $("#characterModalStatus").textContent = "Plantilla lista. Revisa las poses antes de guardarla.";
    scheduleLocalDraftSave();
    renderGame();
  } catch (error) {
    console.error("[ScienceActivities] Character generation failed:", error);
    $("#characterModalStatus").textContent = error?.message || "No se pudo generar el personaje.";
  } finally {
    button.disabled = false;
  }
}

async function saveCharacterToFirebase() {
  const character = state.activity.playerCharacter;
  const sprite = state.activity.playerSprite;
  if (!character || !sprite?.dataUrl) {
    $("#characterModalStatus").textContent = "Primero genera una plantilla del personaje.";
    return;
  }
  const button = $("#saveCharacterFirebaseBtn");
  button.disabled = true;
  $("#characterModalStatus").textContent = "Limpiando la imagen y guardando el personaje…";
  try {
    const app = getDefaultFirebaseApp();
    const user = getAuth(app).currentUser;
    if (!user) throw new Error("Debes iniciar sesión para guardar el personaje.");
    const clean = await sanitizeAndResizeImage(sprite.dataUrl, 1536);
    const safeId = String(character.id).replace(/[^a-z0-9_-]/gi, "-");
    const storagePath = `science-characters/${user.uid}/${safeId}.webp`;
    // Use the active Firebase Storage bucket explicitly. This avoids inheriting a
    // stale local runtime setting from an app instance initialized by another page module.
    const storage = getStorage(app, SCIENCE_CHARACTER_STORAGE_BUCKET);
    const fileRef = firebaseStorageRef(storage, storagePath);
    await uploadBytes(fileRef, clean.blob, { contentType: clean.contentType });
    const spriteUrl = await getDownloadURL(fileRef);
    const firebaseDocId = `${user.uid}_${safeId}`;
    await setDoc(doc(getFirestore(app), "scienceCharacters", firebaseDocId), {
      ownerId: user.uid,
      characterId: character.id,
      name: character.name,
      role: character.role,
      gender: character.gender,
      playerStyle: character.playerStyle,
      subject: character.subject,
      visualStyle: character.visualStyle,
      movements: character.movements,
      palette: character.palette,
      spriteUrl,
      storagePath,
      sprite: {
        width: clean.width,
        height: clean.height,
        columns: sprite.columns || 4,
        rows: sprite.rows || 2,
        poses: sprite.poses || {},
      },
      updatedAt: serverTimestamp(),
    }, { merge: true });
    state.activity.playerCharacter = { ...character, firebaseDocId, spriteUrl, storagePath };
    state.activity.playerSprite = { ...sprite, src: spriteUrl, storagePath };
    scheduleLocalDraftSave();
    $("#characterModalStatus").textContent = "Personaje guardado correctamente en Firebase.";
    showToast("Personaje guardado en Firebase.");
  } catch (error) {
    console.error("[ScienceActivities] Character Firebase save failed:", error);
    $("#characterModalStatus").textContent = error?.message || "No se pudo guardar el personaje.";
  } finally {
    button.disabled = false;
  }
}

function applyCharacterCustomization() {
  const base = state.activity.playerCharacter;
  if (!base) return;
  const saved = readCustomCharacters();
  const preset = {
    ...base,
    id: base.custom ? base.id : `custom-${base.subject}-${base.visualStyle}-${crypto.randomUUID()}`,
    name: $("#characterNameInput").value.trim() || base.name,
    role: $("#characterRoleInput").value.trim() || base.role,
    bodyType: $("#characterBodySelect").value,
    palette: [
      $("#characterPrimaryColor").value,
      $("#characterAccentColor").value,
      base.palette?.[2] || "#183b4e",
      base.palette?.[3] || "#ffd166",
    ],
    custom: true,
  };
  const next = [...saved.filter((item) => item.id !== preset.id), preset].slice(-24);
  localStorage.setItem(CUSTOM_CHARACTER_STORAGE_KEY, JSON.stringify(next));
  state.activity.playerCharacter = preset;
  state.activity.playerSprite = createCharacterSprite(preset);
  fillCharacterOptions(preset.id, preset);
  renderCharacterPreview();
  scheduleLocalDraftSave();
  renderGame();
  $("#characterCustomizer").open = false;
  showToast("Personaje personalizado y aplicado al videojuego.");
}

function createReviewProgressState() {
  return {
    level: 1,
    question: 1,
    correctAnswers: 0,
    completedQuestions: 0,
    briefedLevels: [],
    score: 0,
    levelScore: 0,
    streak: 0,
    bestStreak: 0,
    scoredQuestions: {}
  };
}

async function openEditorQuestionReview() {
  const reviewButton = document.getElementById("quickQuestionReviewBtn");
  if (reviewButton) reviewButton.disabled = true;
  try {
    let controller = state.assessmentController;
    if (!controller?.openQuestion) {
      await renderGame({ resetProgress: false });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      controller = state.assessmentController;
    }
    if (!controller?.openQuestion?.(Number(state.contentQuestionIndex) || 0)) {
      showToast("No se pudo abrir la pregunta de esta vista previa.");
      return;
    }
    document.querySelector('[data-inspector-tab="questions"]')?.click();
    const answered = await controller.answerCorrectly?.();
    showToast(answered
      ? "Respuesta correcta cargada para revisión."
      : "La pregunta se abrió, pero no fue posible cargar su respuesta.");
  } catch (error) {
    console.error("[ScienceActivities] Quick question review failed:", error);
    showToast("No se pudo preparar la respuesta de revisión.");
  } finally {
    if (reviewButton) reviewButton.disabled = false;
  }
}

function mountEditorQuestionReviewButton() {
  const existingButton = document.getElementById("quickQuestionReviewBtn");
  if (existingButton) {
    existingButton.addEventListener("click", () => { void openEditorQuestionReview(); });
    return;
  }

  const previewHeading = [...document.querySelectorAll("h1, h2, h3, h4, span, strong")].find(
    (element) => element.textContent?.trim().toLowerCase() === "preview interactivo"
  );
  const previewHeader = previewHeading?.closest("header, [class*='header'], [class*='toolbar']") || previewHeading?.parentElement;
  if (!previewHeader) return;
  const button = document.createElement("button");
  button.id = "quickQuestionReviewBtn";
  button.className = "sa-quick-question-review";
  button.type = "button";
  button.title = "Cargar y comprobar la respuesta correcta de la pregunta seleccionada";
  button.setAttribute("aria-label", "Probar respuesta correcta en revisión rápida");
  button.innerHTML = '<span class="sa-action-sheen" aria-hidden="true"></span><i class="fas fa-circle-check" aria-hidden="true"></i>';
  button.addEventListener("click", () => { void openEditorQuestionReview(); });

  const actionBar = previewHeader.querySelector(".sa-stage-actions") || previewHeader;
  actionBar.append(button);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountEditorQuestionReviewButton, { once: true });
} else {
  mountEditorQuestionReviewButton();
}
const VISUAL_STYLE_DIRECTIONS = {
  "rive-kawaii-signal": "videojuego educativo japonés contemporáneo Kawaii Signal para adolescentes, paneles suaves de alta calidad con coral, aqua y verde lima, señalética científica clara, ilustración vectorial limpia y movimiento elástico Rive; moderno, despejado y nunca preescolar",
  "rive-tokyo-tech": "HUD científico Tokyo Tech de videojuego japonés contemporáneo, grafito y blanco cálido con cian eléctrico y lima ácida, geometría modular precisa, señalética de estación y visualización de datos de alta legibilidad; premium, sobrio y táctil",
  "rive-arcade-matsuri": "HUD Arcade Matsuri de videojuego japonés contemporáneo, índigo profundo con magenta, amarillo festival y cian, módulos expresivos inspirados en carteles de matsuri, formas vectoriales nítidas y movimiento Rive enérgico sin pixel art retro",
  "kawaii-lab": "club de ciencias anime contemporáneo para estudiantes de 14 a 17 años, personajes adolescentes de proporciones naturales, cel shading limpio, color optimista y tecnología de laboratorio creíble; expresivo pero nunca chibi, infantil ni preescolar",
  "tech-minimal": "interfaz científica japonesa minimalista para adolescentes, geometría precisa, blanco limpio, tinta azul marino, acentos cian y visualización de datos; sin personajes infantiles, chibi ni estética de juguete",
  "arcade-science": "videojuego científico arcade de 16 bits para público adolescente, pixel art nítido, sprites juveniles proporcionados, alto contraste, HUD técnico y acción dinámica; sin mascotas infantiles",
  "pastel-adventure": "novela gráfica científica juvenil en gouache editorial, escenarios amplios, textura artística, estudiantes adolescentes y composición cinematográfica; evitar apariencia de cuento infantil",
  "cosmic-kawaii": "aventura espacial anime juvenil con tripulación adolescente, tecnología orbital detallada, planetas luminosos y gradientes cósmicos intensos; sin criaturas bebé, chibi ni proporciones infantiles",
  "eco-explorer": "expedición naturalista juvenil de enfoque documental, estudiantes adolescentes con equipo de campo, verdes orgánicos, texturas botánicas y fauna científicamente correcta",
  "storybook-science": "novela gráfica científica para adolescentes en acuarela editorial y collage sofisticado, iluminación dramática, composición narrativa y personajes juveniles proporcionados; no cuento infantil",
  "neon-lab": "laboratorio futurista cyberpunk juvenil, personajes adolescentes proporcionados, vectores afilados, vidrio oscuro, neón cian y magenta e iluminación dramática; sin estética infantil",
  "ocean-discovery": "expedición submarina juvenil con estética de documental y videojuego, estudiantes adolescentes, profundidad azul, bioluminiscencia, tecnología de exploración y organismos detallados"
};

const ADOLESCENT_CONTENT_DIRECTION = [
  "Público objetivo: estudiantes adolescentes de secundaria, aproximadamente de 13 a 17 años.",
  "Usa un tono juvenil, inteligente y respetuoso; nunca infantilices al estudiante.",
  "Presenta casos científicos verosímiles, decisiones con consecuencias, datos, unidades y evidencia observable.",
  "Las preguntas deben exigir interpretar, comparar, predecir, calcular o justificar; evita respuestas obvias y distractores absurdos.",
  "Relaciona los conceptos con tecnología, ambiente, salud no clínica, ingeniería, deporte, energía o situaciones contemporáneas.",
  "No uses bebés, mascotas parlantes, juguetes, diminutivos, caritas tiernas, premios preescolares ni expresiones como amiguito, súper fácil o magia.",
  "La dificultad debe corresponder al grado escolar y ofrecer retroalimentación que explique el razonamiento científico."
].join(" ");

const ADOLESCENT_IMAGE_DIRECTION = [
  "Audience is secondary-school teenagers ages 13–17.",
  "If people appear, depict clearly adolescent students with natural body proportions, age-appropriate clothing and confident expressions.",
  "Use sophisticated game key art or young-adult graphic-novel composition with credible scientific equipment.",
  "No small children, toddlers, babies, chibi anatomy, oversized baby faces, toy-like mascots, plush creatures or preschool classroom aesthetics."
].join(" ");

const TOPICS = {
  physics: ["Aceleración", "Arquímedes", "Caída libre", "Calor", "Cambios de estado de la materia", "Cantidad de movimiento", "Carga eléctrica", "Circuitos en paralelo", "Circuitos en serie", "Conducción", "Conservación de energía", "Convección", "Corriente", "Densidad", "Dilatación térmica", "Distancia y desplazamiento", "Elasticidad y ley de Hooke", "Electromagnetismo", "Energía cinética", "Energía potencial", "Equilibrio de fuerzas", "Estados de la materia", "Flotación", "Frecuencia", "Fuerza", "Fuerza centrípeta", "Gráficas de posición, velocidad y tiempo", "Gravedad", "Impulso", "Ley de Ohm", "Leyes de Newton", "Longitud de onda", "Luz", "Magnetismo", "Masa y peso", "Movimiento circular", "Movimiento rectilíneo uniforme (MRU)", "Movimiento rectilíneo uniformemente acelerado (MRUA)", "Ondas", "Pascal", "¿Por qué cambia el estado de la materia?", "Posición y sistema de referencia", "Potencia", "Presión", "Proyectiles", "Radiación", "Rapidez", "Reflexión", "Refracción", "Resistencia eléctrica", "Resistencia y fricción", "Sonido", "Temperatura", "Trabajo", "Velocidad", "Voltaje"],
  chemistry: ["Materia", "Átomo", "Protones", "Neutrones", "Electrones", "Número atómico", "Isótopos", "Iones", "Tabla periódica", "Metales", "No metales", "Gases nobles", "Moléculas", "Compuestos", "Enlace iónico", "Enlace covalente", "Enlace metálico", "Fórmulas químicas", "Agua H₂O", "Dióxido de carbono CO₂", "Cloruro de sodio NaCl", "Ácidos", "Bases", "pH", "Neutralización", "Reacción química", "Ecuaciones químicas", "Balanceo", "Conservación de la masa", "Mol", "Masa molar", "Disoluciones", "Concentración", "Solubilidad", "Oxidación", "Reducción", "Catalizadores", "Temperatura de reacción", "Estados de la materia", "Química orgánica"],
  biology: ["Seres vivos", "Célula", "Teoría celular", "Procariotas", "Eucariotas", "Membrana celular", "Núcleo", "Mitocondria", "Cloroplasto", "Ribosomas", "ADN", "ARN", "Genes", "Cromosomas", "Mitosis", "Meiosis", "Herencia", "Mutaciones", "Evolución", "Selección natural", "Taxonomía", "Bacterias", "Virus", "Hongos", "Plantas", "Animales", "Fotosíntesis", "Respiración celular", "Nutrición", "Sistema digestivo", "Sistema respiratorio", "Sistema circulatorio", "Sistema nervioso", "Sistema endocrino", "Sistema inmunitario", "Homeostasis", "Ecosistemas", "Cadenas alimentarias", "Ciclos biogeoquímicos", "Biodiversidad"],
  math: ["Números enteros", "Operaciones con enteros", "Jerarquía de operaciones", "Fracciones", "Operaciones con fracciones", "Decimales", "Porcentajes", "Razones", "Proporciones", "Regla de tres", "Potencias", "Leyes de exponentes", "Raíces cuadradas", "Notación científica", "Lenguaje algebraico", "Términos semejantes", "Polinomios", "Productos notables", "Factorización", "Ecuaciones de primer grado", "Sistemas de ecuaciones", "Inecuaciones", "Plano cartesiano", "Patrones y sucesiones", "Funciones", "Función lineal", "Pendiente", "Proporcionalidad directa e inversa", "Ángulos", "Triángulos", "Teorema de Pitágoras", "Congruencia y semejanza", "Perímetro", "Área", "Circunferencia y círculo", "Volumen", "Transformaciones geométricas", "Estadística descriptiva", "Gráficas y tablas", "Probabilidad"]
};

const SUBJECT_LABELS = { physics: "Física", chemistry: "Química", biology: "Biología", math: "Matemáticas" };
const SUBJECT_DEFAULT_GRADES = {
  biology: "1º secundaria",
  physics: "2º secundaria",
  chemistry: "3º secundaria",
  math: "1º secundaria"
};
const SIMULATION_LABELS = {
  friction: "Fricción y resistencia",
  projectile: "Movimiento de proyectiles",
  circuit: "Circuito interactivo",
  particles: "Laboratorio de partículas",
  ecosystem: "Ecosistema dinámico",
  energy: "Transformación de energía",
  fluid: "Fluidos e hidráulica",
  wave: "Ondas en movimiento",
  optics: "Laboratorio de luz",
  cell: "Explorador celular",
  math: "Laboratorio matemático"
};

const SIMULATION_ICONS = {
  friction: "fa-truck-fast",
  projectile: "fa-meteor",
  circuit: "fa-bolt",
  particles: "fa-atom",
  ecosystem: "fa-leaf",
  energy: "fa-battery-three-quarters",
  fluid: "fa-droplet",
  wave: "fa-water",
  optics: "fa-sun",
  cell: "fa-microscope",
  math: "fa-square-root-variable"
};

const SCENARIO_ARCHETYPES = {
  physics: [
    ["laboratory", "#c8f4ee", "#5bb8a9", "#ffc768"],
    ["city", "#d8e7f4", "#617c9b", "#ff8068"],
    ["space", "#182541", "#46568a", "#c4f05c"],
    ["desert", "#ffe6ad", "#d8a857", "#ff8068"],
    ["arctic", "#dff7ff", "#86c8df", "#8e85ff"],
    ["ocean", "#bcecf4", "#3aa5b8", "#ffc768"],
    ["volcanic", "#f2c0a7", "#744449", "#ffcf5c"],
    ["forest", "#d8f1c0", "#5d9c72", "#ffcf5c"]
  ],
  chemistry: [
    ["microscopic", "#e9dcff", "#7766b8", "#48d8c8"],
    ["laboratory", "#d7f6ef", "#4ba997", "#ff8068"],
    ["space", "#211d3d", "#685c9e", "#c4f05c"],
    ["volcanic", "#ffd3bc", "#9c5148", "#ffc768"],
    ["ocean", "#c8f4fa", "#3f99aa", "#8e85ff"],
    ["arctic", "#e8fbff", "#8dcbd8", "#ff8068"],
    ["desert", "#ffedc9", "#c79855", "#8e85ff"],
    ["city", "#dce7ec", "#667c86", "#48d8c8"]
  ],
  biology: [
    ["forest", "#d8f1c0", "#5d9c72", "#ffc768"],
    ["microscopic", "#f4dbef", "#ad6e9d", "#48d8c8"],
    ["ocean", "#c7f1f0", "#4a9e9d", "#c4f05c"],
    ["arctic", "#e4f8ff", "#88bfd2", "#8e85ff"],
    ["desert", "#ffedc5", "#b88b54", "#ff8068"],
    ["city", "#dce9dc", "#65836a", "#ffc768"],
    ["space", "#1d3140", "#496a79", "#c4f05c"],
    ["laboratory", "#def5e9", "#589d79", "#8e85ff"]
  ],
  math: [
    ["laboratory", "#e9f5ff", "#4d78a8", "#ffc857"],
    ["city", "#e7edf8", "#516a91", "#ff7b83"],
    ["space", "#111b3e", "#394d94", "#58e1d4"],
    ["microscopic", "#f0e9ff", "#745fb1", "#ffb65c"],
    ["desert", "#fff0ca", "#bb8950", "#5bd8c7"],
    ["ocean", "#d8f4f7", "#3e93aa", "#ffc857"],
    ["arctic", "#edfaff", "#7ebacf", "#8f82ff"],
    ["forest", "#e1f2db", "#5f9470", "#ffbe63"]
  ]
};

function buildScenarioCatalog(subject) {
  return (TOPICS[subject] || []).map((topic, index) => {
    const [biome, sky, ground, accent] = SCENARIO_ARCHETYPES[subject][index % SCENARIO_ARCHETYPES[subject].length];
    return {
      id: `${subject}-${index + 1}`,
      label: `${topic} · ${["Estación", "Mundo", "Zona", "Laboratorio"][index % 4]} ${String(index + 1).padStart(2, "0")}`,
      topic,
      biome,
      sky,
      ground,
      accent,
      motif: `${topic.toLowerCase()}-${biome}`
    };
  });
}

const SCENARIOS = {
  physics: buildScenarioCatalog("physics"),
  chemistry: buildScenarioCatalog("chemistry"),
  biology: buildScenarioCatalog("biology"),
  math: buildScenarioCatalog("math")
};
const CUSTOM_TOPIC_VALUE = "__custom_topic__";

const CONTROL_PRESETS = {
  friction: [
    { id: "force", label: "Fuerza aplicada", min: 10, max: 100, step: 5, value: 55, unit: "N", effect: "Impulsa el objeto." },
    { id: "friction", label: "Resistencia", min: 5, max: 90, step: 5, value: 45, unit: "N", effect: "Se opone al movimiento." },
    { id: "mass", label: "Masa", min: 2, max: 25, step: 1, value: 10, unit: "kg", effect: "Modifica la aceleración." }
  ],
  projectile: [
    { id: "angle", label: "Ángulo", min: 10, max: 80, step: 1, value: 45, unit: "°", effect: "Cambia la trayectoria." },
    { id: "power", label: "Velocidad inicial", min: 20, max: 100, step: 2, value: 62, unit: "m/s", effect: "Cambia el alcance." },
    { id: "gravity", label: "Gravedad", min: 2, max: 20, step: .2, value: 9.8, unit: "m/s²", effect: "Atrae el proyectil." }
  ],
  circuit: [
    { id: "voltage", label: "Voltaje", min: 1, max: 24, step: 1, value: 9, unit: "V", effect: "Impulsa las cargas." },
    { id: "resistance", label: "Resistencia", min: 1, max: 30, step: 1, value: 10, unit: "Ω", effect: "Limita la corriente." }
  ],
  particles: [
    { id: "temperature", label: "Temperatura", min: 0, max: 100, step: 1, value: 45, unit: "°C", effect: "Cambia la agitación." },
    { id: "particleCount", label: "Cantidad", min: 10, max: 45, step: 1, value: 24, unit: "", effect: "Cambia la concentración." }
  ],
  ecosystem: [
    { id: "sunlight", label: "Luz", min: 0, max: 100, step: 5, value: 60, unit: "%", effect: "Aporta energía." },
    { id: "water", label: "Agua", min: 0, max: 100, step: 5, value: 55, unit: "%", effect: "Limita la población." }
  ],
  energy: [
    { id: "mass", label: "Masa", min: 1, max: 30, step: 1, value: 8, unit: "kg", effect: "Cambia la energía." },
    { id: "height", label: "Altura", min: 1, max: 12, step: .5, value: 7, unit: "m", effect: "Cambia la energía potencial." },
    { id: "gravity", label: "Gravedad", min: 2, max: 20, step: .2, value: 9.8, unit: "m/s²", effect: "Atrae el objeto." }
  ],
  fluid: [
    { id: "force", label: "Fuerza", min: 5, max: 100, step: 5, value: 35, unit: "N", effect: "Presiona el fluido." },
    { id: "area", label: "Área del pistón", min: 1, max: 20, step: 1, value: 5, unit: "m²", effect: "Modifica la presión." },
    { id: "density", label: "Densidad", min: 200, max: 1600, step: 50, value: 700, unit: "kg/m³", effect: "Determina flotación." }
  ],
  wave: [
    { id: "frequency", label: "Frecuencia", min: .5, max: 8, step: .5, value: 3, unit: "Hz", effect: "Cambia los ciclos." },
    { id: "amplitude", label: "Amplitud", min: 10, max: 100, step: 5, value: 50, unit: "cm", effect: "Cambia la energía." },
    { id: "wavelength", label: "Longitud", min: 60, max: 220, step: 10, value: 120, unit: "cm", effect: "Separa las crestas." }
  ],
  optics: [
    { id: "angle", label: "Ángulo de incidencia", min: 5, max: 75, step: 1, value: 35, unit: "°", effect: "Cambia el rayo." },
    { id: "refractiveIndex", label: "Índice del medio", min: 1, max: 2.5, step: .05, value: 1.5, unit: "n", effect: "Desvía la luz." }
  ],
  cell: [
    { id: "nutrients", label: "Nutrientes", min: 0, max: 100, step: 5, value: 60, unit: "%", effect: "Aporta materia." },
    { id: "oxygen", label: "Oxígeno", min: 0, max: 100, step: 5, value: 65, unit: "%", effect: "Favorece ATP." }
  ],
  math: [
    { id: "x", label: "Valor de x", min: -20, max: 20, step: 1, value: 4, unit: "", effect: "Variable independiente." },
    { id: "coefficient", label: "Coeficiente", min: -10, max: 10, step: 1, value: 2, unit: "", effect: "Modifica la pendiente o escala." },
    { id: "constant", label: "Constante", min: -20, max: 20, step: 1, value: 3, unit: "", effect: "Desplaza el resultado." }
  ]
};

const STRUCTURED_ASSESSMENT_TYPES = new Set([
  "equation-build", "fill-blank", "exponent-placement", "chemical-balance",
  "numeric-answer", "graph-plot", "sequence-order"
]);

const STRUCTURED_MECHANICS = {
  "equation-build": "equation-lab",
  "fill-blank": "formula-console",
  "exponent-placement": "exponent-dock",
  "chemical-balance": "molecule-balance",
  "numeric-answer": "numeric-console",
  "graph-plot": "graph-probe",
  "sequence-order": "process-stations"
};

const STEM_MODEL_REGISTRY = {
  "arithmetic-balance": { subject: "math", formula: "a + b = c", measurement: "equivalencia" },
  "algebra-equation": { subject: "math", formula: "ax + b = c", measurement: "solución" },
  "proportional-reasoning": { subject: "math", formula: "a/b = c/d", measurement: "proporción" },
  "function-graph": { subject: "math", formula: "y = mx + b", measurement: "coordenada" },
  "geometry-measurement": { subject: "math", formula: "A, P, V", measurement: "magnitud" },
  "probability-statistics": { subject: "math", formula: "P = favorables / posibles", measurement: "probabilidad" }
};

function resolveTopicTemplate(subject, topic) {
  const name = String(topic || "").toLowerCase();
  if (subject === "math") {
    if (/probabilidad|estadística|gráfica|tabla/.test(name)) return { type: "math", variant: "probability-statistics" };
    if (/función|pendiente|plano cartesiano/.test(name)) return { type: "math", variant: "function-graph" };
    if (/ángulo|triángulo|pitágoras|perímetro|área|circunferencia|volumen|geometr|transform/.test(name)) return { type: "math", variant: "geometry-measurement" };
    if (/razón|proporción|regla de tres|porcentaje/.test(name)) return { type: "math", variant: "proportional-reasoning" };
    if (/ecuación|inecuación|polinomio|factor|algebra|término|producto notable/.test(name)) return { type: "math", variant: "algebra-equation" };
    return { type: "math", variant: "arithmetic-balance" };
  }
  if (subject === "physics") {
    if (/movimiento rectil[ií]neo|mrua|mru|posici[oó]n|desplazamiento|rapidez|velocidad|aceleraci[oó]n|gr[aá]fica/.test(name)) return { type: "friction", variant: "motion" };
    if (/pascal|arquímedes|presión|densidad|fluido/.test(name)) return { type: "fluid", variant: /pascal|presión/.test(name) ? "hydraulic" : "buoyancy" };
    if (/onda|frecuencia|longitud de onda|sonido/.test(name)) return { type: "wave", variant: "wave" };
    if (/reflexión|refracción|luz/.test(name)) return { type: "optics", variant: "prism" };
    if (/corriente|voltaje|ohm|circuito|resistencia eléctrica|carga eléctrica/.test(name)) return { type: "circuit", variant: "circuit" };
    if (/energía|trabajo|potencia/.test(name)) return { type: "energy", variant: /trabajo/.test(name) ? "work" : /potencia/.test(name) ? "power" : "potential" };
    if (/estado de la materia|cambio.*estado|temperatura|calor|dilatación|conducción|convección|radiación/.test(name)) return { type: "particles", variant: "thermal" };
    if (/caída|gravedad|proyectil/.test(name)) return { type: "projectile", variant: "projectile" };
    return { type: "friction", variant: "motion" };
  }
  if (subject === "chemistry") {
    if (/ácido|base|ph|neutralización|disolución|concentración|solubilidad/.test(name)) return { type: "fluid", variant: "solution" };
    if (/electrón|ion|oxidación|reducción/.test(name)) return { type: "circuit", variant: "electron" };
    return { type: "particles", variant: "molecular" };
  }
  if (/ecosistema|cadena|ciclo|biodiversidad|evolución|selección|planta|fotosíntesis/.test(name)) return { type: "ecosystem", variant: "ecosystem" };
  return { type: "cell", variant: "cell" };
}

function buildTopicActivity(subject, topic, scenario) {
  const template = resolveTopicTemplate(subject, topic);
  const typeLabel = SIMULATION_LABELS[template.type];
  const title = `${topic}: laboratorio interactivo`;
  const missions = {
    friction: `Experimenta cómo las fuerzas cambian el movimiento en el tema ${topic}.`,
    projectile: `Ajusta trayectoria y gravedad para comprobar el comportamiento de ${topic}.`,
    circuit: `Modifica las variables eléctricas y observa su efecto en ${topic}.`,
    particles: `Controla temperatura y cantidad de partículas para explorar ${topic}.`,
    ecosystem: `Equilibra recursos y observa cómo cambia ${topic}.`,
    energy: template.variant === "work" ? "Eleva la carga y relaciona fuerza, distancia y trabajo." : `Transforma energía y comprueba cómo masa y altura afectan ${topic}.`,
    fluid: template.variant === "hydraulic" ? "Acciona la prensa y descubre cómo se transmite la presión en un fluido." : `Cambia densidad y fuerza para investigar ${topic}.`,
    wave: `Modifica frecuencia, amplitud y longitud de onda para investigar ${topic}.`,
    optics: `Dirige el rayo y cambia el medio para experimentar ${topic}.`,
    cell: `Ajusta los recursos de la célula y observa su respuesta en ${topic}.`
  };
  const principles = {
    friction: "La fuerza neta determina el cambio de movimiento de un cuerpo.",
    projectile: "La trayectoria combina movimiento horizontal y aceleración vertical debida a la gravedad.",
    circuit: "La corriente depende del voltaje aplicado y de la resistencia del circuito.",
    particles: "Las propiedades macroscópicas dependen del movimiento y las interacciones entre partículas.",
    ecosystem: "Los organismos dependen de recursos limitados y de sus interacciones.",
    energy: "La energía puede almacenarse, transferirse y transformarse; el trabajo cambia la energía de un sistema.",
    fluid: "La presión, densidad y empuje explican el comportamiento de los fluidos.",
    wave: "Las ondas transportan energía mediante oscilaciones caracterizadas por frecuencia, amplitud y longitud.",
    optics: "La luz cambia de dirección al reflejarse o al pasar entre medios.",
    cell: "La célula mantiene su actividad mediante intercambio de materia y transformación de energía."
  };
  const actions = {
    friction: "Aplicar fuerza", projectile: "Lanzar", circuit: "Activar circuito", particles: "Observar partículas",
    ecosystem: "Simular ecosistema", energy: template.variant === "work" ? "Elevar carga" : "Liberar energía",
    fluid: template.variant === "hydraulic" ? "Accionar prensa" : "Probar flotación", wave: "Emitir onda",
    optics: "Proyectar luz", cell: "Activar célula"
  };
  missions.math ||= `Manipula valores y representaciones para descubrir la estructura matemática de ${topic}.`;
  principles.math ||= "Una relación matemática conserva su validez cuando sus operaciones y representaciones son equivalentes.";
  actions.math ||= "Comprobar relación";
  return normalizeActivity({
    schemaVersion: 2,
    title,
    subtitle: typeLabel,
    subject,
    topic,
    simulationType: template.type,
    variant: template.variant,
    scenario: structuredClone(scenario),
    mission: missions[template.type],
    scientificPrinciple: principles[template.type],
    actionLabel: actions[template.type],
    successMessage: `¡Experimento de ${topic} completado!`,
    coachTips: [
      "Cambia una sola variable cada vez.",
      "Predice qué ocurrirá antes de activar la simulación.",
      "Compara el resultado con el principio científico."
    ],
    controls: structuredClone(CONTROL_PRESETS[template.type]),
    challenge: { targetLabel: `Explorar ${topic}`, targetValue: 1, tolerance: .1 },
    visual: { primary: scenario.ground, accent: scenario.accent, character: `${topic} explorer` }
  });
}

const DEFAULT_ACTIVITY = {
  schemaVersion: 2,
  visualStyle: "rive-kawaii-signal",
  title: "Misión Antideslizante",
  subtitle: "Experimenta con fuerza, masa y superficie",
  subject: "physics",
  grade: "2º secundaria",
  gameMode: "game",
  topic: "Resistencia y fricción",
  simulationType: "friction",
  scenario: {
    id: "physics-2",
    label: "Resistencia y fricción · Mundo 02",
    topic: "Resistencia y fricción",
    biome: "city",
    sky: "#d8e7f4",
    ground: "#617c9b",
    accent: "#ff8068",
    motif: "resistencia-y-friccion-city"
  },
  mission: "Lleva a Momo hasta la meta ajustando la fuerza y venciendo la resistencia sin usar más energía de la necesaria.",
  scientificPrinciple: "La fuerza de fricción se opone al movimiento. Un objeto comienza a acelerar cuando la fuerza aplicada supera la resistencia.",
  actionLabel: "¡Empujar a Momo!",
  successMessage: "¡Lo lograste! La fuerza aplicada superó la resistencia de la superficie.",
  coachTips: [
    "Compara la flecha azul con la flecha coral.",
    "Si Momo no avanza, cambia una sola variable.",
    "Una masa mayor necesita más fuerza para acelerar."
  ],
  controls: [
    { id: "force", label: "Fuerza aplicada", min: 10, max: 100, step: 5, value: 55, unit: "N", effect: "Aumenta la fuerza hacia la meta." },
    { id: "friction", label: "Resistencia", min: 5, max: 90, step: 5, value: 45, unit: "N", effect: "Se opone al movimiento." },
    { id: "mass", label: "Masa del objeto", min: 2, max: 25, step: 1, value: 10, unit: "kg", effect: "Modifica la aceleración." }
  ],
  challenge: { targetLabel: "Llegar a la meta", targetValue: 10, tolerance: 1 },
  visual: { primary: "#48d8c8", accent: "#c4f05c", character: "Momo, caja exploradora" }
};

const ACTIVITY_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    subtitle: { type: "string" },
    subject: { type: "string", enum: ["physics", "chemistry", "biology", "math"] },
    topic: { type: "string" },
    simulationType: { type: "string", enum: ["friction", "projectile", "circuit", "particles", "ecosystem", "energy", "fluid", "wave", "optics", "cell", "math"] },
    scenario: {
      type: "object",
      properties: {
        id: { type: "string" },
        label: { type: "string" },
        topic: { type: "string" },
        biome: { type: "string", enum: ["laboratory", "city", "space", "desert", "arctic", "ocean", "volcanic", "forest", "microscopic"] },
        sky: { type: "string" },
        ground: { type: "string" },
        accent: { type: "string" },
        motif: { type: "string" }
      },
      required: ["id", "label", "topic", "biome", "sky", "ground", "accent", "motif"]
    },
    mission: { type: "string" },
    scientificPrinciple: { type: "string" },
    actionLabel: { type: "string" },
    successMessage: { type: "string" },
    coachTips: { type: "array", minItems: 3, maxItems: 5, items: { type: "string" } },
    controls: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          id: { type: "string", enum: ["force", "friction", "mass", "angle", "power", "gravity", "velocity", "initialVelocity", "brakeForce", "obstacleDistance", "voltage", "resistance", "temperature", "particleCount", "sunlight", "water", "height", "area", "density", "frequency", "amplitude", "wavelength", "refractiveIndex", "nutrients", "oxygen", "reagentA", "reagentB", "ratioA", "ratioB", "solute", "volume", "outside", "inside", "permeability", "biodiversity", "dominant", "recessive", "x", "coefficient", "constant"] },
          label: { type: "string" },
          min: { type: "number" },
          max: { type: "number" },
          step: { type: "number" },
          value: { type: "number" },
          unit: { type: "string" },
          effect: { type: "string" }
        },
        required: ["id", "label", "min", "max", "step", "value", "unit", "effect"]
      }
    },
    challenge: {
      type: "object",
      properties: {
        targetLabel: { type: "string" },
        targetValue: { type: "number" },
        tolerance: { type: "number" }
      },
      required: ["targetLabel", "targetValue", "tolerance"]
    },
    visual: {
      type: "object",
      properties: {
        primary: { type: "string" },
        accent: { type: "string" },
        character: { type: "string" }
      },
      required: ["primary", "accent", "character"]
    }
  },
  required: ["title", "subtitle", "subject", "topic", "simulationType", "scenario", "mission", "scientificPrinciple", "actionLabel", "successMessage", "coachTips", "controls", "challenge", "visual"]
};

const ASSESSMENT_GENERATION_SCHEMA = {
  type: "object",
  properties: {
    assessments: {
      type: "array",
      minItems: 1,
      maxItems: 25,
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["multiple", "matching", "keyword", "equation-build", "fill-blank", "exponent-placement", "chemical-balance", "numeric-answer", "graph-plot", "sequence-order"] },
          prompt: { type: "string" },
          context: { type: "string" },
          given: { type: "array", items: { type: "string" } },
          goal: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correct: { type: "number" },
          accepted: { type: "array", items: { type: "string" } },
          pieces: { type: "array", items: { type: "string" } },
          correctSequence: { type: "array", items: { type: "string" } },
          distractors: { type: "array", items: { type: "string" } },
          segments: { type: "array", items: { type: "string" } },
          bases: { type: "array", items: { type: "string" } },
          exponents: { type: "array", items: { type: "string" } },
          correctExponents: { type: "array", items: { type: "string" } },
          correctValue: { type: "number" },
          tolerance: { type: "number" },
          unit: { type: "string" },
          steps: { type: "array", items: { type: "string" } },
          correctOrder: { type: "array", items: { type: "string" } },
          pairs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                left: { type: "string" },
                right: { type: "string" }
              },
              required: ["left", "right"]
            }
          },
          feedback: { type: "string" }
        },
        required: ["type", "prompt", "feedback"]
      }
    }
  },
  required: ["assessments"]
};

const state = {
  activity: structuredClone(DEFAULT_ACTIVITY),
  previewActivity: null,
  gameInstance: null,
  sessions: [],
  activeSessionId: null,
  generating: false
};

const REAL_WORLD_EXPERIENCE_CONTEXTS = {
  physics: [
    "movilidad y seguridad vial",
    "consumo energético de una vivienda",
    "rendimiento y seguridad en un deporte",
    "mantenimiento de máquinas o herramientas",
    "transporte y entrega de mercancías",
    "diseño seguro de espacios públicos",
    "producción de energía local",
    "funcionamiento de dispositivos cotidianos"
  ],
  chemistry: [
    "tratamiento y control de calidad del agua",
    "conservación y preparación segura de alimentos",
    "limpieza doméstica responsable",
    "corrosión y selección de materiales",
    "producción agrícola y calidad del suelo",
    "control de calidad de un producto",
    "gestión segura de residuos",
    "fabricación de materiales de uso cotidiano"
  ],
  biology: [
    "prevención y cuidado de la salud",
    "conservación de un ecosistema cercano",
    "producción sostenible de alimentos",
    "calidad ambiental de una comunidad",
    "nutrición y decisiones alimentarias",
    "manejo responsable de recursos naturales",
    "bienestar de organismos en un hábitat",
    "vigilancia de cambios en una población"
  ],
  math: [
    "presupuesto y finanzas personales",
    "logística de un comercio local",
    "diseño y construcción de un espacio",
    "planificación de rutas de transporte",
    "análisis de datos de salud o deporte",
    "distribución equitativa de recursos",
    "comparación de planes y tarifas",
    "control de inventario y demanda"
  ]
};

const REAL_WORLD_EXPERIENCE_ROLES = [
  "un equipo técnico municipal",
  "una familia que debe tomar una decisión informada",
  "el personal de un pequeño negocio",
  "un equipo de diseño e ingeniería",
  "una cooperativa de la comunidad",
  "un grupo de monitoreo ambiental",
  "un equipo de salud y prevención",
  "una organización escolar"
];

const REAL_WORLD_EXPERIENCE_TASKS = [
  "comparar dos soluciones y justificar cuál funciona mejor",
  "calibrar un sistema para alcanzar un resultado seguro",
  "diagnosticar la causa de un problema observable",
  "predecir un resultado antes de probarlo",
  "optimizar recursos sin perder seguridad ni calidad",
  "comprobar si una afirmación se sostiene con mediciones",
  "establecer un límite de funcionamiento aceptable",
  "evaluar un cambio antes de recomendarlo"
];

const REAL_WORLD_EVIDENCE_ROUTES = [
  "mediciones antes y después de modificar una variable",
  "una tabla de ensayos controlados",
  "una gráfica que permita reconocer una tendencia",
  "la comparación con un umbral o criterio verificable",
  "un registro de cambios a lo largo del tiempo",
  "la repetición de pruebas para comprobar consistencia"
];

const REAL_WORLD_CONSTRAINTS = [
  "Usa únicamente variables observables y materiales seguros o sensores virtuales realistas.",
  "La decisión final debe poder justificarse con datos, no con una opinión.",
  "Mantén una sola relación causal principal para que el experimento sea interpretable.",
  "Incluye una restricción realista de tiempo, costo, energía, seguridad o recursos.",
  "Evita equipos especializados que normalmente no estarían disponibles para estudiantes.",
  "Distingue claramente la variable que se modifica de la evidencia que se observa."
];

const $ = (selector) => document.querySelector(selector);
const setOptionalText = (selector, value) => {
  const element = $(selector);
  if (element) element.textContent = value;
};
const SCIENCE_THEMES = ["dark", "mid", "light"];
const SCIENCE_THEME_META = {
  dark: { label: "Tema oscuro", icon: "fa-adjust", next: "Cambiar a tema medio" },
  mid: { label: "Tema medio", icon: "fa-sun", next: "Cambiar a tema claro" },
  light: { label: "Tema claro", icon: "fa-moon", next: "Cambiar a tema oscuro" }
};

function setScienceTheme(theme = "dark", { persist = false } = {}) {
  const normalizedTheme = SCIENCE_THEMES.includes(String(theme || "").toLowerCase())
    ? String(theme).toLowerCase()
    : "dark";
  document.body.dataset.saTheme = normalizedTheme;
  const button = $("#scienceThemeToggleBtn");
  const meta = SCIENCE_THEME_META[normalizedTheme];
  if (button) {
    button.dataset.tooltip = meta.label;
    button.title = meta.next;
    button.setAttribute("aria-label", meta.next);
    button.setAttribute("aria-pressed", String(normalizedTheme !== "dark"));
    const icon = button.querySelector("i");
    if (icon) icon.className = `fas ${meta.icon}`;
  }
  if (persist) {
    try { localStorage.setItem(SCIENCE_THEME_STORAGE_KEY, normalizedTheme); } catch (_) { }
  }
}

function initializeScienceTheme() {
  let savedTheme = "dark";
  try { savedTheme = localStorage.getItem(SCIENCE_THEME_STORAGE_KEY) || "dark"; } catch (_) { }
  setScienceTheme(savedTheme);
}

function cycleScienceTheme() {
  const current = document.body.dataset.saTheme || "dark";
  const next = SCIENCE_THEMES[(SCIENCE_THEMES.indexOf(current) + 1) % SCIENCE_THEMES.length];
  setScienceTheme(next, { persist: true });
}
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

function parseGeneratedJson(rawText) {
  const cleaned = String(rawText || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  try { return JSON.parse(cleaned); } catch (_) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("La IA no devolvió una actividad JSON válida.");
  }
}

function cleanVisualConfigurationReferences(value) {
  return String(value ?? "")
    .replace(/\b(?:estilo\s+)?(?:kawaii|chibi|cyberpunk|pixel\s*art|gouache|acuarela|pastel|ne[oó]n|arcade|storybook|tech\s+minimal|minimalista\s+japon[eé]s|cosmos\s+kawaii)\b/gi, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([)\]])/g, "$1")
    .trim();
}

function cleanScenarioConfigurationReferences(value, scenario = {}) {
  let result = String(value ?? "");
  const label = String(scenario.label || "").trim();
  if (label) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escapedLabel, "gi"), "");
  }
  return result
    .replace(/\b(?:mundo|zona|estaci[oó]n|laboratorio)\s*(?:n[úu]m(?:ero)?\.?\s*)?\d+\b/gi, "")
    .replace(/\bescenario\s+libre\b/gi, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function sanitizeVisibleActivityCopy(activity) {
  ["title", "subtitle", "mission", "scientificPrinciple", "actionLabel", "successMessage"].forEach((key) => {
    if (typeof activity[key] === "string") activity[key] = cleanVisualConfigurationReferences(activity[key]);
  });
  if (Array.isArray(activity.coachTips)) {
    activity.coachTips = activity.coachTips.map(cleanVisualConfigurationReferences);
  }
  if (Array.isArray(activity.controls)) {
    activity.controls.forEach((control) => {
      control.label = cleanVisualConfigurationReferences(control.label);
      control.effect = cleanVisualConfigurationReferences(control.effect);
    });
  }
  if (activity.challenge) {
    activity.challenge.targetLabel = cleanVisualConfigurationReferences(activity.challenge.targetLabel);
  }
  if (activity.learningGuide) {
    activity.learningGuide.title = cleanVisualConfigurationReferences(activity.learningGuide.title);
    activity.learningGuide.introduction = cleanVisualConfigurationReferences(activity.learningGuide.introduction);
    (activity.learningGuide.levels || []).forEach((level) => {
      ["title", "narrative", "objective", "hint"].forEach((key) => {
        level[key] = cleanVisualConfigurationReferences(level[key]);
      });
      (level.concepts || []).forEach((concept) => {
        concept.term = cleanVisualConfigurationReferences(concept.term);
        concept.definition = cleanVisualConfigurationReferences(concept.definition);
      });
      if (typeof level.example === "string") level.example = cleanVisualConfigurationReferences(level.example);
      else if (level.example && typeof level.example === "object") {
        ["title", "text", "situation", "data", "procedure", "result", "formula", "explanation"].forEach((key) => {
          level.example[key] = cleanVisualConfigurationReferences(level.example[key]);
        });
      }
    });
  }
  (activity.assessments || []).forEach((assessment) => {
    assessment.prompt = cleanVisualConfigurationReferences(assessment.prompt);
    assessment.feedback = cleanVisualConfigurationReferences(assessment.feedback);
    if (Array.isArray(assessment.options)) assessment.options = assessment.options.map(cleanVisualConfigurationReferences);
    if (Array.isArray(assessment.pairs)) {
      assessment.pairs = assessment.pairs.map((pair) => pair.map(cleanVisualConfigurationReferences));
    }
  });
  return activity;
}

function resolveLearningGuideImageSource(level = {}) {
  return String(level.imageDataUrl || level.imageUrl || level.imageSrc || "").trim();
}

function rehydrateLearningGuideImages(activity) {
  (activity?.learningGuide?.levels || []).forEach((level) => {
    const source = resolveLearningGuideImageSource(level);
    if (source && !level.imageDataUrl) level.imageDataUrl = source;
  });
  return activity;
}

function normalizeActivity(input) {
  const activity = { ...structuredClone(DEFAULT_ACTIVITY), ...input };
  rehydrateLearningGuideImages(activity);
  activity.subject = SUBJECT_LABELS[activity.subject] ? activity.subject : $("#subjectSelect").value;
  activity.grade = input?.grade || SUBJECT_DEFAULT_GRADES[activity.subject] || "2º secundaria";
  const legacyMode = input?.gameMode;
  activity.gameMode = legacyMode === "lab" || legacyMode === "simulator" ? "simulator" : "game";
  activity.simulationType = SIMULATION_LABELS[activity.simulationType] ? activity.simulationType : "friction";
  if (activity.subject === "math") activity.simulationType = "math";
  const catalog = SCENARIOS[activity.subject] || SCENARIOS.physics;
  const referencedScenario = catalog.find((scenario) => scenario.id === activity.scenario?.id)
    || catalog.find((scenario) => scenario.topic.toLowerCase() === String(activity.topic || "").toLowerCase())
    || catalog[0];
  activity.scenario = activity.subject === "math"
    ? { ...referencedScenario, id: referencedScenario.id, topic: activity.topic || referencedScenario.topic }
    : { ...referencedScenario, ...(activity.scenario || {}), id: referencedScenario.id, topic: activity.topic || referencedScenario.topic };
  activity.coachTips = Array.isArray(activity.coachTips) && activity.coachTips.length ? activity.coachTips.slice(0, 5) : [...DEFAULT_ACTIVITY.coachTips];
  activity.controls = Array.isArray(activity.controls) && activity.controls.length
    ? activity.controls.slice(0, 4).map((control) => ({
      id: String(control.id || "force"),
      label: String(control.label || control.id || "Variable"),
      min: Number(control.min ?? 0),
      max: Number(control.max ?? 100),
      step: Math.max(.01, Number(control.step ?? 1)),
      value: Number(control.value ?? 50),
      unit: String(control.unit || ""),
      effect: String(control.effect || "")
    }))
    : structuredClone(DEFAULT_ACTIVITY.controls);
  if (activity.subject === "math" && !activity.controls.some((control) => ["x", "coefficient", "constant"].includes(control.id))) {
    activity.controls = structuredClone(CONTROL_PRESETS.math);
  }
  activity.simulator = {
    modelId: activity.simulator?.modelId || (activity.subject === "math" ? resolveTopicTemplate("math", activity.topic).variant : activity.simulationType),
    formula: activity.simulator?.formula || STEM_MODEL_REGISTRY[activity.simulator?.modelId]?.formula || activity.scientificPrinciple,
    objectiveEnabled: activity.simulator?.objectiveEnabled !== false,
    objective: activity.simulator?.objective || activity.challenge?.targetLabel || "Observar la relación entre variables",
    tolerance: Math.max(0, Number(activity.simulator?.tolerance ?? activity.challenge?.tolerance ?? .1)),
    values: { ...(activity.simulator?.values || {}) }
  };
  enforceActivitySubjectContract(activity);
  activity.assessments = activity.gameMode === "simulator"
    ? []
    : reconcileSubjectAssessments(activity, activity.assessments || []);
  if (activity.gameMode === "game" && activity.gameProgress) {
    state.gameProgress = structuredClone(activity.gameProgress);
  }
  return sanitizeVisibleActivityCopy(activity);
}

function buildPrompt() {
  const subject = $("#subjectSelect").value;
  const topic = getSelectedTopic();
  const visualStyle = $("#visualStyleSelect").value;
  const experience = $("#experiencePrompt").value.trim();
  const selectedScenario = getSelectedScenario();
  const levelCount = Math.max(1, Math.floor(Number($("#gameLevelCount").value || 3)));
  const questionsPerLevel = Math.max(1, Math.floor(Number($("#questionsPerLevel").value || 3)));
  const totalQuestions = levelCount * questionsPerLevel;
  const subjectIsolation = {
    math: [
      "CONTRATO OBLIGATORIO DE MATERIA: MATEMÁTICAS.",
      "Todo el contenido debe ser matemático y corresponder al tema indicado.",
      "Usa números, operaciones, expresiones, ecuaciones, funciones, figuras, mediciones, tablas, gráficas, estadística o probabilidad según corresponda.",
      "No uses matraces, reactivos, reacciones químicas, moléculas, células, genética, ecosistemas, fuerzas, circuitos, proyectiles ni vocabulario de Física, Química o Biología.",
      "La plantilla obligatoria es math y el modelo debe ser uno de: arithmetic-balance, algebra-equation, proportional-reasoning, function-graph, geometry-measurement o probability-statistics."
    ].join(" "),
    physics: "CONTRATO OBLIGATORIO DE MATERIA: FÍSICA. No introduzcas contenidos de Química, Biología o Matemáticas como tema principal.",
    chemistry: "CONTRATO OBLIGATORIO DE MATERIA: QUÍMICA. No introduzcas contenidos de Física, Biología o Matemáticas como tema principal.",
    biology: "CONTRATO OBLIGATORIO DE MATERIA: BIOLOGÍA. No introduzcas contenidos de Física, Química o Matemáticas como tema principal."
  }[subject];
  return [
    "Diseña una actividad científica experimental y jugable para adolescentes.",
    ADOLESCENT_CONTENT_DIRECTION,
    `Materia: ${SUBJECT_LABELS[subject]}.`,
    subjectIsolation,
    `Tema de referencia: ${topic || "tema libre"}.`,
    `Escenario asignado al tema: ${selectedScenario.label}; bioma ${selectedScenario.biome}; paleta ${selectedScenario.sky}, ${selectedScenario.ground}, ${selectedScenario.accent}. Conserva su id ${selectedScenario.id}.`,
    "Usa el escenario únicamente como dirección visual interna. Nunca escribas su etiqueta, número de mundo, zona, estación o identificador en títulos, narrativas, misiones, preguntas, retroalimentación ni resultados visibles para el alumno.",
    `Nivel: ${$("#gradeSelect").value}.`,
    `Dificultad: ${$("#difficultySelect").value}.`,
    `Modalidad: ${$("#gameModeSelect").value === "simulator" ? "simulador científico sin personaje, preguntas ni puntuación" : "videojuego educativo con retos, preguntas y puntuación"}.`,
    $("#gameModeSelect").value === "simulator"
      ? "Diseña un simulador con variables editables, rangos, unidades, fórmula, mediciones en tiempo real y un objetivo opcional. No incluyas preguntas ni personaje."
      : "Diseña un videojuego de pregunta, hipótesis, interacción científica, evidencia, puntuación y retroalimentación.",
    `La estructura pedagógica tendrá ${levelCount} niveles y ${questionsPerLevel} actividades por nivel; las preguntas se generarán en una etapa posterior.`,
    "challenge.targetLabel debe coincidir exactamente con el label de uno de los controles y targetValue debe estar dentro de su rango min/max.",
    `Dirección visual obligatoria: ${VISUAL_STYLE_DIRECTIONS[visualStyle] || VISUAL_STYLE_DIRECTIONS["kawaii-lab"]}.`,
    "No mezcles esta dirección con otros estilos. Solo usa estética kawaii cuando la opción seleccionada la mencione expresamente.",
    "La dirección visual es solo una instrucción de ilustración. Está prohibido mencionar nombres de estilos artísticos o de configuración en cualquier texto visible de la actividad.",
    "No escribas palabras como kawaii, chibi, cyberpunk, pastel, neón, arcade, pixel art, gouache o acuarela en títulos, misión, controles, preguntas, respuestas, conceptos o retroalimentación.",
    `Experiencia solicitada por el docente: ${experience}.`,
    "Construye preguntas con contexto breve pero auténtico. En opción múltiple usa distractores científicamente plausibles que representen errores conceptuales comunes.",
    "En emparejamiento relaciona variables, evidencias, procesos o representaciones; en palabra clave solicita términos disciplinares relevantes, no vocabulario trivial.",
    "Elige exactamente una plantilla compatible:",
    "- friction: fuerzas, fricción, resistencia, masa, aceleración.",
    "- projectile: ángulo, potencia, gravedad y trayectoria.",
    "- circuit: voltaje, resistencia, corriente y brillo.",
    "- particles: temperatura, partículas, difusión o estados de la materia.",
    "- ecosystem: luz, agua, recursos, poblaciones y equilibrio.",
    "- energy: energía cinética/potencial, trabajo, potencia y transformaciones.",
    "- fluid: presión, Pascal, Arquímedes, densidad, flotación y disoluciones.",
    "- wave: ondas, sonido, frecuencia, amplitud y longitud de onda.",
    "- optics: reflexión, refracción, ángulos e índice del medio.",
    "- cell: célula, orgánulos, genética, sistemas y metabolismo.",
    "- math: aritmética, álgebra, proporcionalidad, funciones, geometría, estadística y probabilidad.",
    "Los controles deben usar únicamente IDs válidos para la plantilla elegida.",
    "Prioriza manipular variables, observar causa y efecto, formular hipótesis y volver a intentar.",
    "No generes código, HTML ni markdown. Devuelve únicamente el JSON solicitado."
  ].join("\n");
}

function extractResponseText(response) {
  return (response?.candidates?.[0]?.content?.parts || [])
    .map((part) => typeof part?.text === "string" ? part.text : "")
    .join("")
    || String(response?.text || response?.output_text || "");
}

const ASSESSMENT_BANK = {
  friction: {
    multiple: ["¿Cuándo comenzará a moverse el objeto?", ["Cuando la fuerza aplicada supera la fricción", "Cuando la masa desaparece", "Cuando la fricción aumenta"], 0],
    keyword: ["Escribe la fuerza que se opone al movimiento entre dos superficies.", ["fricción", "friccion"]],
    matching: [["Fuerza aplicada", "Cambia el movimiento"], ["Fricción", "Se opone al movimiento"], ["Masa", "Determina la inercia"]]
  },
  projectile: {
    multiple: ["¿Qué variables cambian directamente la trayectoria de un proyectil?", ["Velocidad inicial y ángulo", "Color y temperatura", "Masa y voltaje"], 0],
    keyword: ["Escribe la fuerza que curva la trayectoria hacia el suelo.", ["gravedad"]],
    matching: [["Ángulo", "Orienta el lanzamiento"], ["Velocidad inicial", "Aporta alcance"], ["Gravedad", "Acelera hacia abajo"]]
  },
  circuit: {
    multiple: ["Si el voltaje se mantiene, ¿qué ocurre al aumentar la resistencia?", ["Disminuye la corriente", "Aumenta la corriente", "Desaparece el voltaje"], 0],
    keyword: ["Escribe la magnitud que se opone al paso de la corriente.", ["resistencia"]],
    matching: [["Voltaje", "Impulsa las cargas"], ["Corriente", "Flujo de carga"], ["Resistencia", "Limita la corriente"]]
  },
  particles: {
    multiple: ["¿Qué sucede con las partículas al aumentar la temperatura?", ["Se mueven más rápido", "Pierden toda su masa", "Se quedan inmóviles"], 0],
    keyword: ["Escribe la medida relacionada con la energía cinética promedio de las partículas.", ["temperatura"]],
    matching: [["Sólido", "Partículas muy próximas"], ["Líquido", "Partículas que fluyen"], ["Gas", "Partículas muy separadas"]]
  },
  ecosystem: {
    multiple: ["¿Qué puede ocurrir si disminuye mucho una población del ecosistema?", ["Se altera la red alimentaria", "Nada cambia", "Aumenta toda la energía disponible"], 0],
    keyword: ["Escribe el proceso mediante el cual las plantas capturan energía luminosa.", ["fotosíntesis", "fotosintesis"]],
    matching: [["Productor", "Fabrica su alimento"], ["Consumidor", "Obtiene energía al alimentarse"], ["Descomponedor", "Recicla materia"]]
  },
  energy: {
    multiple: ["¿Qué transformación ocurre al descender un objeto por una rampa?", ["Potencial a cinética", "Cinética a masa", "Calor a gravedad"], 0],
    keyword: ["Escribe la capacidad de producir cambios o realizar trabajo.", ["energía", "energia"]],
    matching: [["Altura", "Aumenta energía potencial"], ["Velocidad", "Aumenta energía cinética"], ["Trabajo", "Transfiere energía"]]
  },
  fluid: {
    multiple: ["En una prensa hidráulica, ¿cómo se transmite la presión?", ["Por todo el fluido", "Solo hacia arriba", "Únicamente al recipiente"], 0],
    keyword: ["Escribe la magnitud definida como fuerza entre área.", ["presión", "presion"]],
    matching: [["Fuerza", "Empuja el pistón"], ["Área", "Modifica la presión"], ["Densidad", "Influye en la flotación"]]
  },
  wave: {
    multiple: ["¿Qué cambia al aumentar la frecuencia de una onda sonora?", ["El tono", "La masa del emisor", "La gravedad"], 0],
    keyword: ["Escribe el número de oscilaciones por segundo.", ["frecuencia"]],
    matching: [["Frecuencia", "Oscilaciones por segundo"], ["Amplitud", "Máximo desplazamiento"], ["Longitud de onda", "Distancia entre crestas"]]
  },
  optics: {
    multiple: ["¿Qué ocurre cuando la luz cambia de medio y modifica su dirección?", ["Refracción", "Evaporación", "Conducción"], 0],
    keyword: ["Escribe el cambio de dirección de la luz al rebotar en una superficie.", ["reflexión", "reflexion"]],
    matching: [["Reflexión", "La luz rebota"], ["Refracción", "La luz cambia de dirección"], ["Prisma", "Separa colores"]]
  },
  cell: {
    multiple: ["¿Qué estructura contiene principalmente la información genética de una célula eucariota?", ["Núcleo", "Membrana", "Citoplasma"], 0],
    keyword: ["Escribe el orgánulo que participa principalmente en la producción de ATP.", ["mitocondria"]],
    matching: [["Núcleo", "Contiene ADN"], ["Membrana", "Regula intercambios"], ["Mitocondria", "Produce ATP"]]
  },
  math: {
    multiple: ["¿Qué valor de x satisface 2x + 3 = 11?", ["4", "5", "7"], 0],
    keyword: ["Escribe el resultado de elevar 3 al cuadrado.", ["9", "nueve"]],
    matching: [["Coeficiente", "Número que multiplica una variable"], ["Variable", "Símbolo que representa un valor"], ["Constante", "Término sin variable"]]
  }
};

function assessmentHash(text) {
  return [...String(text)].reduce((total, character) => total + character.codePointAt(0), 0);
}

const SUBJECT_ASSESSMENT_MODELS = {
  math: new Set([
    "math",
    "arithmetic-balance",
    "algebra-equation",
    "proportional-reasoning",
    "function-graph",
    "geometry-measurement",
    "probability-statistics"
  ])
};

const SUBJECT_FORBIDDEN_CONTENT = {
  math: /\b(matraz|reactiv|reactor|reaccion quim|molecul|atomo|celul|adn|genetic|ecosistem|mitocond|friccion|gravedad|voltaje|corriente electr|circuito|proyectil|trayectoria balistica)\w*/i,
  physics: /\b(matraz|reactiv|estequiometr|celul|adn|genetic|ecosistem|mitocond)\w*/i,
  chemistry: /\b(celul|adn|genetic|ecosistem|mitocond|proyectil|trayectoria balistica)\w*/i,
  biology: /\b(estequiometr|polinom|ecuacion algebra|proyectil|circuito electr|friccion estatica)\w*/i
};

function normalizeSubjectContent(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isSubjectTextCompatible(subject, value) {
  const forbidden = SUBJECT_FORBIDDEN_CONTENT[subject];
  return !forbidden || !forbidden.test(normalizeSubjectContent(value));
}

function assessmentList(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function assessmentText(assessment = {}) {
  return [
    assessment.prompt,
    assessment.feedback,
    assessment.unit,
    ...assessmentList(assessment.options),
    ...assessmentList(assessment.accepted),
    ...assessmentList(assessment.pieces),
    ...assessmentList(assessment.correctSequence),
    ...assessmentList(assessment.segments),
    ...assessmentList(assessment.bases),
    ...assessmentList(assessment.exponents),
    ...assessmentList(assessment.steps),
    ...assessmentList(assessment.correctOrder),
    ...assessmentList(assessment.pairs).flatMap((pair) => Array.isArray(pair) ? pair : [pair?.left, pair?.right]),
    ...assessmentList(assessment.compounds).map((compound) => compound?.formula)
  ].filter(Boolean).join(" ");
}

function isAssessmentCompatibleWithSubject(activity, assessment = {}) {
  if (assessment.subject && assessment.subject !== activity.subject) return false;
  if (!isSubjectTextCompatible(activity.subject, assessmentText(assessment))) return false;
  if (activity.subject === "math" && assessment.modelId) {
    return SUBJECT_ASSESSMENT_MODELS.math.has(String(assessment.modelId));
  }
  return true;
}

function enforceActivitySubjectContract(activity) {
  if (activity.subject !== "math") return activity;
  const topic = String(activity.topic || "Matemáticas");
  const template = resolveTopicTemplate("math", topic);
  const contaminatedTopLevel = !isSubjectTextCompatible("math", [
    activity.title,
    activity.subtitle,
    activity.mission,
    activity.scientificPrinciple,
    activity.challenge?.targetLabel,
    visibleLearningGuideText(activity.learningGuide || {})
  ].join(" "));
  activity.subject = "math";
  activity.simulationType = "math";
  activity.variant = template.variant;
  activity.controls = structuredClone(CONTROL_PRESETS.math);
  activity.simulator = {
    ...(activity.simulator || {}),
    modelId: template.variant,
    formula: STEM_MODEL_REGISTRY[template.variant]?.formula || "Relación matemática",
    values: {}
  };
  if (contaminatedTopLevel) {
    activity.title = `${topic}: desafío matemático`;
    activity.subtitle = "Razonamiento matemático interactivo";
    activity.mission = `Resuelve, representa y comprueba relaciones matemáticas del tema ${topic}.`;
    activity.scientificPrinciple = `Las representaciones de ${topic} deben conservar equivalencia, orden y precisión en cada transformación.`;
    activity.actionLabel = "Comprobar solución";
    activity.successMessage = "¡Relación matemática comprobada!";
    activity.coachTips = [
      "Identifica los datos y la operación requerida.",
      "Conserva la equivalencia en cada paso.",
      "Comprueba el resultado sustituyendo los valores."
    ];
    activity.challenge = {
      ...(activity.challenge || {}),
      targetLabel: "Solución matemática",
      targetValue: 1,
      tolerance: 0
    };
    activity.learningGuide = null;
  }
  return activity;
}

function reconcileSubjectAssessments(activity, candidates = []) {
  const expectedCount = Math.max(1, Number(activity.levelCount || 3))
    * Math.max(1, Number(activity.questionsPerLevel || 3));
  if (activity.gameMode === "simulator") return [];
  return Array.from({ length: expectedCount }, (_, index) => {
    const candidate = candidates[index];
    if (candidate && isAssessmentCompatibleWithSubject(activity, candidate)) {
      const normalized = normalizeAssessmentSchema(structuredClone(candidate));
      normalized.subject = activity.subject;
      if (activity.subject === "math") {
        normalized.modelId = SUBJECT_ASSESSMENT_MODELS.math.has(String(normalized.modelId))
          ? normalized.modelId
          : resolveTopicTemplate("math", activity.topic).variant;
      }
      return normalized;
    }
    const fallback = normalizeAssessmentSchema(buildStructuredFallbackAssessment(activity, index));
    fallback.subject = activity.subject;
    return fallback;
  });
}

function normalizeAssessmentSchema(source = {}) {
  const assessment = source;
  assessment.context = String(assessment.context || assessment.antecedent || assessment.situation || "");
  assessment.given = assessmentList(assessment.given)
    .map(String)
    .map((value) => value.trim())
    .filter(Boolean);
  assessment.goal = String(assessment.goal || assessment.objective || "");
  if (STRUCTURED_ASSESSMENT_TYPES.has(assessment.type)) {
    assessment.prompt = String(assessment.prompt || "Completa el reto estructurado.");
    assessment.feedback = String(assessment.feedback || "Compara la estructura construida con la relación correcta.");
    assessment.pieces = assessmentList(assessment.pieces).map(String);
    assessment.correctSequence = assessmentList(assessment.correctSequence).length ? assessmentList(assessment.correctSequence).map(String) : [...assessment.pieces];
    assessment.distractors = assessmentList(assessment.distractors).map(String);
    assessment.segments = assessmentList(assessment.segments).map(String);
    assessment.accepted = assessmentList(assessment.accepted).map(String);
    if (assessment.type === "fill-blank") {
      const sourceExpression = String(assessment.expression || assessment.formula || assessment.equation || "").trim();
      if (!assessment.segments.includes("___") && sourceExpression.includes("___")) {
        assessment.segments = blankSegmentsFromExpression(sourceExpression);
      }
      if (!assessment.segments.includes("___")) {
        const prompt = String(assessment.prompt || "").trim();
        const target = prompt.match(/(?:valor|resultado|magnitud)\s+de\s+(.+?)[.?!]?$/i)?.[1]?.trim();
        assessment.segments = target
          ? [`El valor de ${target} es `, "___", "."]
          : [String(assessment.context || prompt || "Completa la expresión"), " ", "___"];
      }
      if (!assessment.accepted.length && assessment.answer != null) {
        assessment.accepted = assessmentList(assessment.answer).map(String);
      }
    }
    assessment.bases = assessmentList(assessment.bases).map(String);
    assessment.exponents = assessmentList(assessment.exponents).map(String);
    assessment.correctExponents = assessmentList(assessment.correctExponents).map(String);
    assessment.compounds = assessmentList(assessment.compounds).map((compound) => ({
      formula: String(compound?.formula || ""),
      side: compound?.side === "product" ? "product" : "reactant"
    }));
    assessment.correctCoefficients = assessmentList(assessment.correctCoefficients)
      .map((value) => Math.max(1, Number(value) || 1));
    assessment.correctValue = Number(assessment.correctValue ?? assessment.answer ?? 0);
    assessment.tolerance = Math.max(0, Number(assessment.tolerance ?? .01));
    assessment.unit = String(assessment.unit || "");
    assessment.axes = {
      x: String(assessment.axes?.x || "x"),
      y: String(assessment.axes?.y || "y"),
      xMin: Number(assessment.axes?.xMin ?? -5),
      xMax: Number(assessment.axes?.xMax ?? 5),
      yMin: Number(assessment.axes?.yMin ?? -5),
      yMax: Number(assessment.axes?.yMax ?? 5)
    };
    assessment.targetPoints = assessmentList(assessment.targetPoints)
      .map((point) => ({ x: Number(point?.x || 0), y: Number(point?.y || 0) }));
    assessment.steps = assessmentList(assessment.steps).map(String);
    assessment.correctOrder = assessmentList(assessment.correctOrder).length ? assessmentList(assessment.correctOrder).map(String) : [...assessment.steps];
    assessment.gameplay = { ...(assessment.gameplay || {}), mechanic: STRUCTURED_MECHANICS[assessment.type] };
    return assessment;
  }
  if (assessment.type === "multiple") {
    const optionObjects = Array.isArray(assessment.options) ? assessment.options : [];
    const markedIndex = optionObjects.findIndex((option) => option && typeof option === "object" && (option.correct === true || option.isCorrect === true));
    assessment.options = optionObjects.map((option) => typeof option === "object"
      ? String(option.text ?? option.label ?? option.value ?? "")
      : String(option));
    const rawCorrect = assessment.correct ?? assessment.correctIndex ?? assessment.correctAnswer ?? assessment.answer;
    let correctIndex = markedIndex;
    if (correctIndex < 0 && Number.isInteger(rawCorrect) && rawCorrect >= 0 && rawCorrect < assessment.options.length) {
      correctIndex = rawCorrect;
    }
    if (correctIndex < 0 && typeof rawCorrect === "string") {
      const normalized = normalizeAnswer(rawCorrect);
      const letterIndex = /^[a-z]$/i.test(rawCorrect.trim()) ? rawCorrect.trim().toUpperCase().charCodeAt(0) - 65 : -1;
      const numericIndex = /^\d+$/.test(rawCorrect.trim()) ? Number(rawCorrect.trim()) : -1;
      correctIndex = assessment.options.findIndex((option) => normalizeAnswer(option) === normalized);
      if (correctIndex < 0 && letterIndex >= 0 && letterIndex < assessment.options.length) correctIndex = letterIndex;
      if (correctIndex < 0 && numericIndex >= 0 && numericIndex < assessment.options.length) correctIndex = numericIndex;
      if (correctIndex < 0 && numericIndex > 0 && numericIndex <= assessment.options.length) correctIndex = numericIndex - 1;
    }
    assessment.correct = correctIndex >= 0 ? correctIndex : 0;
  }
  if (assessment.type === "keyword") {
    const rawAccepted = assessment.accepted
      ?? assessment.acceptedAnswers
      ?? assessment.keywords
      ?? assessment.answers
      ?? assessment.correctAnswer
      ?? assessment.answer;
    assessment.accepted = (Array.isArray(rawAccepted) ? rawAccepted : [rawAccepted])
      .flatMap((value) => String(value ?? "").split(","))
      .map((value) => value.trim())
      .filter(Boolean);
    if (!assessment.accepted.length) assessment.accepted = ["ciencia"];
  }
  if (assessment.type === "matching") {
    assessment.pairs = (assessment.pairs || assessment.matches || []).map((pair) => Array.isArray(pair)
      ? [String(pair[0] ?? ""), String(pair[1] ?? "")]
      : [String(pair?.left ?? pair?.term ?? pair?.concept ?? ""), String(pair?.right ?? pair?.definition ?? pair?.match ?? "")])
      .filter(([left, right]) => left && right);
  }
  return assessment;
}

function buildStructuredFallbackAssessment(activity, index = 0) {
  const subject = activity.subject;
  const modelId = subject === "math"
    ? resolveTopicTemplate("math", activity.topic).variant
    : activity.simulationType;
  const common = { feedback: activity.scientificPrinciple, modelId };
  if (subject === "biology") {
    const variants = activity.simulationType === "ecosystem"
      ? [
        { type: "sequence-order", prompt: "Ordena el flujo de energía del ecosistema.", steps: ["Productor", "Consumidor primario", "Consumidor secundario", "Descomponedor"], correctOrder: ["Productor", "Consumidor primario", "Consumidor secundario", "Descomponedor"] },
        { type: "fill-blank", prompt: "Completa la relación ecológica.", segments: ["Los organismos que fabrican su alimento son ", "___", "."], accepted: ["productores", "productor"] },
        { type: "numeric-answer", prompt: "Una población de 20 individuos aumenta 25%. ¿Cuál es la población final?", correctValue: 25, tolerance: 0, unit: "individuos" },
        { type: "graph-plot", prompt: "Ubica dos registros de crecimiento poblacional.", axes: { x: "Tiempo", y: "Población", xMin: 0, xMax: 5, yMin: 0, yMax: 10 }, targetPoints: [{ x: 1, y: 2 }, { x: 4, y: 8 }], tolerance: .6 },
        { type: "sequence-order", prompt: "Ordena las etapas de recuperación de un ecosistema.", steps: ["Colonización", "Crecimiento", "Competencia", "Equilibrio"], correctOrder: ["Colonización", "Crecimiento", "Competencia", "Equilibrio"] }
      ]
      : [
        { type: "sequence-order", prompt: "Ordena las etapas principales de la división celular.", steps: ["Interfase", "Profase", "Metafase", "Anafase", "Telofase"], correctOrder: ["Interfase", "Profase", "Metafase", "Anafase", "Telofase"] },
        { type: "fill-blank", prompt: "Completa la función del orgánulo.", segments: ["La ", "___", " produce la mayor parte del ATP celular."], accepted: ["mitocondria"] },
        { type: "equation-build", prompt: "Construye el apareamiento complementario del ADN.", pieces: ["A", "–", "T"], correctSequence: ["A", "–", "T"] },
        { type: "numeric-answer", prompt: "Una célula se divide dos veces. ¿Cuántas células se obtienen?", correctValue: 4, tolerance: 0, unit: "células" },
        { type: "sequence-order", prompt: "Ordena el recorrido de una proteína secretada.", steps: ["Ribosoma", "Retículo endoplásmico", "Aparato de Golgi", "Membrana"], correctOrder: ["Ribosoma", "Retículo endoplásmico", "Aparato de Golgi", "Membrana"] }
      ];
    return { ...common, ...variants[index % variants.length] };
  }
  if (subject === "chemistry") {
    const variants = [
      { type: "chemical-balance", prompt: "Balancea la formación de agua conservando todos los átomos.", compounds: [{ formula: "H₂", side: "reactant" }, { formula: "O₂", side: "reactant" }, { formula: "H₂O", side: "product" }], correctCoefficients: [2, 1, 2] },
      { type: "equation-build", prompt: "Construye la relación para calcular concentración molar.", pieces: ["C", "=", "n", "/", "V"], correctSequence: ["C", "=", "n", "/", "V"] },
      { type: "numeric-answer", prompt: "Calcula la concentración de 2 mol en 0.5 L.", correctValue: 4, tolerance: .01, unit: "mol/L" },
      { type: "exponent-placement", prompt: "Completa la notación del número de Avogadro.", bases: ["6.022 × 10"], exponents: ["21", "22", "23"], correctExponents: ["23"] },
      { type: "sequence-order", prompt: "Ordena el procedimiento seguro para preparar una disolución.", steps: ["Medir el soluto", "Disolver parcialmente", "Aforar al volumen", "Homogeneizar"], correctOrder: ["Medir el soluto", "Disolver parcialmente", "Aforar al volumen", "Homogeneizar"] }
    ];
    return normalizeAssessmentSchema({ ...common, ...variants[index % variants.length] });
  }
  if (subject === "physics") {
    const variants = [
      { type: "equation-build", prompt: "Construye la segunda ley de Newton.", pieces: ["F", "=", "m", "·", "a"], correctSequence: ["F", "=", "m", "·", "a"] },
      { type: "exponent-placement", prompt: "Coloca el exponente correcto en la ecuación cinemática.", bases: ["v"], exponents: ["1", "2", "3"], correctExponents: ["2"] },
      { type: "numeric-answer", prompt: "Calcula la aceleración de 20 N aplicados a 4 kg.", correctValue: 5, tolerance: .01, unit: "m/s²" },
      { type: "graph-plot", prompt: "Marca dos puntos de una velocidad que aumenta 2 m/s cada segundo.", axes: { x: "t (s)", y: "v (m/s)", xMin: 0, xMax: 5, yMin: 0, yMax: 10 }, targetPoints: [{ x: 1, y: 2 }, { x: 4, y: 8 }], tolerance: .65 },
      { type: "fill-blank", prompt: "Completa la expresión de energía potencial.", segments: ["Ep", "=", "m", "·", "g", "·", "___"], accepted: ["h", "altura"] },
      { type: "equation-build", prompt: "Construye la relación de fuerza neta sobre un trineo.", pieces: ["Fₙₑₜ", "=", "Fₘ", "−", "Fᵣ"], correctSequence: ["Fₙₑₜ", "=", "Fₘ", "−", "Fᵣ"] },
      { type: "numeric-answer", prompt: "Una fuerza neta de 30 N produce 3 m/s². ¿Cuál es la masa?", correctValue: 10, tolerance: .01, unit: "kg" },
      { type: "fill-blank", prompt: "Completa la expresión de energía cinética.", segments: ["Ec", "=", "½", "·", "m", "·", "___"], accepted: ["v²", "v2"] },
      { type: "graph-plot", prompt: "Marca dos puntos de un móvil que avanza 4 m cada segundo.", axes: { x: "t (s)", y: "d (m)", xMin: 0, xMax: 5, yMin: 0, yMax: 20 }, targetPoints: [{ x: 1, y: 4 }, { x: 3, y: 12 }], tolerance: .65 },
      { type: "sequence-order", prompt: "Ordena el análisis de un cambio de movimiento.", steps: ["Identificar las fuerzas", "Calcular la fuerza neta", "Aplicar F = m · a", "Interpretar la aceleración"], correctOrder: ["Identificar las fuerzas", "Calcular la fuerza neta", "Aplicar F = m · a", "Interpretar la aceleración"] }
    ];
    return normalizeAssessmentSchema({ ...common, ...variants[index % variants.length] });
  }
  const mathTopic = normalizeAnswer(activity.topic);
  const isPolynomialTopic = /polinom|terminos semejantes|producto notable|factor/.test(mathTopic);
  const variants = isPolynomialTopic
    ? [
      {
        type: "equation-build",
        context: "Una placa rectangular tiene lados (x + 2) y (x + 3). Su área debe escribirse como un polinomio desarrollado.",
        given: ["Largo: x + 3", "Ancho: x + 2", "Área: largo × ancho"],
        goal: "Desarrolla el producto y conserva todos los términos.",
        prompt: "Construye el polinomio que representa el área de la placa.",
        pieces: ["P(x)", "=", "x²", "+", "5x", "+", "6"],
        correctSequence: ["P(x)", "=", "x²", "+", "5x", "+", "6"],
        distractors: ["x³", "6x", "−", "5"],
        feedback: "(x + 2)(x + 3) = x² + 5x + 6 al aplicar la propiedad distributiva."
      },
      {
        type: "numeric-answer",
        context: "El polinomio P(x) = x² + 5x + 6 representa el área de una placa ajustable.",
        given: ["x = 2", "P(x) = x² + 5x + 6"],
        goal: "Sustituye x y calcula el área.",
        prompt: "¿Cuál es el valor de P(2)?",
        correctValue: 20,
        tolerance: 0,
        unit: "u²",
        feedback: "P(2) = 2² + 5(2) + 6 = 4 + 10 + 6 = 20."
      },
      {
        type: "exponent-placement",
        context: "Al multiplicar potencias de la misma base se suman sus exponentes.",
        given: ["x² · x³ = xⁿ"],
        goal: "Determina el valor de n.",
        prompt: "Coloca el exponente resultante.",
        bases: ["x"],
        exponents: ["4", "5", "6", "9"],
        correctExponents: ["5"],
        feedback: "x² · x³ = x²⁺³ = x⁵."
      },
      {
        type: "fill-blank",
        context: "Dos términos semejantes tienen la misma variable y el mismo exponente.",
        given: ["3x² + 4x²"],
        goal: "Suma únicamente los coeficientes.",
        prompt: "Completa la reducción de términos semejantes.",
        segments: ["3x²", "+", "4x²", "=", "___"],
        accepted: ["7x²", "7x2"],
        feedback: "3x² + 4x² = (3 + 4)x² = 7x²."
      },
      {
        type: "sequence-order",
        context: "Para desarrollar (x + 2)(x + 3) se distribuye cada término del primer binomio.",
        given: ["Producto: (x + 2)(x + 3)"],
        goal: "Ordena el procedimiento hasta obtener la forma reducida.",
        prompt: "Ordena los pasos para desarrollar el producto.",
        steps: ["Multiplicar x por x + 3", "Multiplicar 2 por x + 3", "Sumar x² + 3x + 2x + 6", "Reducir a x² + 5x + 6"],
        correctOrder: ["Multiplicar x por x + 3", "Multiplicar 2 por x + 3", "Sumar x² + 3x + 2x + 6", "Reducir a x² + 5x + 6"],
        feedback: "La distributiva produce cuatro términos y después se reducen los semejantes."
      }
    ]
    : [
      {
        type: "equation-build",
        context: "Un servicio cobra una cuota fija de 3 y 2 por cada recorrido. El total registrado fue 11.",
        given: ["Costo por recorrido: 2", "Cuota fija: 3", "Total: 11"],
        goal: "Representa la situación con una ecuación de primer grado.",
        prompt: "Construye la ecuación que permite calcular el número de recorridos.",
        pieces: ["2x", "+", "3", "=", "11"],
        correctSequence: ["2x", "+", "3", "=", "11"],
        distractors: ["−", "8", "3x"],
        feedback: "El costo variable es 2x, se suma la cuota fija 3 y el total debe ser 11."
      },
      {
        type: "numeric-answer",
        context: "El costo total de un servicio se modela con 2x + 3 = 11.",
        given: ["2x + 3 = 11"],
        goal: "Despeja x para encontrar el número de recorridos.",
        prompt: "¿Cuál es el valor de x?",
        correctValue: 4,
        tolerance: 0,
        unit: "recorridos",
        feedback: "Al restar 3 se obtiene 2x = 8; al dividir entre 2, x = 4."
      },
      { type: "exponent-placement", context: "Se multiplican dos potencias con la misma base.", given: ["x² · x³ = xⁿ"], goal: "Suma los exponentes.", prompt: "Coloca el exponente resultante.", bases: ["x"], exponents: ["4", "5", "6"], correctExponents: ["5"] },
      { type: "graph-plot", context: "Una relación lineal comienza en 1 y aumenta 2 unidades por cada avance en x.", given: ["y = 2x + 1"], goal: "Representa dos pares ordenados de la función.", prompt: "Coloca dos puntos de la recta y = 2x + 1.", axes: { x: "x", y: "y", xMin: -2, xMax: 4, yMin: -3, yMax: 9 }, targetPoints: [{ x: 0, y: 1 }, { x: 2, y: 5 }], tolerance: .55 },
      { type: "sequence-order", context: "Debes conservar la igualdad mientras despejas la incógnita.", given: ["2x + 3 = 11"], goal: "Aplica la misma operación en ambos lados.", prompt: "Ordena los pasos para despejar x.", steps: ["Restar 3 en ambos lados", "Simplificar a 2x = 8", "Dividir ambos lados entre 2", "Obtener x = 4"], correctOrder: ["Restar 3 en ambos lados", "Simplificar a 2x = 8", "Dividir ambos lados entre 2", "Obtener x = 4"] },
      { type: "fill-blank", context: "En un triángulo rectángulo, los catetos y la hipotenusa cumplen una relación fija.", given: ["Catetos: a y b", "Hipotenusa: c"], goal: "Completa el teorema de Pitágoras.", prompt: "Completa la igualdad.", segments: ["a²", "+", "b²", "=", "___"], accepted: ["c²", "c2"] }
    ];
  return normalizeAssessmentSchema({ ...common, ...variants[index % variants.length] });
}

const QUESTION_ANIMATION_VARIANTS = {
  friction: ["force", "balance", "surface"],
  projectile: ["trajectory", "gravity", "launch"],
  circuit: ["circuit-flow", "resistance", "voltage"],
  particles: ["reaction", "diffusion", "phase-change"],
  ecosystem: ["ecosystem-flow", "population", "resources"],
  energy: ["energy-transfer", "work", "power"],
  fluid: ["pressure", "buoyancy", "flow"],
  wave: ["wave", "frequency", "amplitude"],
  optics: ["refraction", "reflection", "spectrum"],
  cell: ["replication", "transport", "cell-energy", "division", "organelles"]
};

function buildQuestionAnimationProfile(activity, assessment, offset = 0) {
  const simulationType = activity.simulationType || "friction";
  const text = normalizeAnswer([
    assessment?.prompt,
    ...(assessment?.options || []),
    ...(assessment?.accepted || []),
    ...(assessment?.pairs || []).flat()
  ].join(" "));
  const semanticRules = [
    [/adn|gen|cromosom|nucleo|nucleotid|base nitrogenada/, "replication"],
    [/membrana|intercambio|difusion|osmosis|transport/, simulationType === "cell" ? "transport" : "diffusion"],
    [/atp|mitocond|energia celular|respiracion celular/, "cell-energy"],
    [/mitosis|meiosis|division celular/, "division"],
    [/organelo|organulo|ribosoma|cloroplast/, "organelles"],
    [/trayectoria|proyectil|angulo|lanzamiento/, "trajectory"],
    [/gravedad|caida/, "gravity"],
    [/voltaje|corriente|carga electrica/, "circuit-flow"],
    [/resistencia electrica|ohm/, "resistance"],
    [/reaccion|molecula|enlace|colision/, "reaction"],
    [/temperatura|estado de la materia|fusion|evapor/, "phase-change"],
    [/ecosistema|cadena alimentaria|poblacion/, "ecosystem-flow"],
    [/presion|pascal/, "pressure"],
    [/flot|arquimedes|empuje/, "buoyancy"],
    [/onda|frecuencia|amplitud|sonido/, "wave"],
    [/refraccion|indice|prisma/, "refraction"],
    [/reflexion|rebota/, "reflection"],
    [/friccion|fuerza|movimiento|inercia/, "force"],
    [/energia|trabajo|potencia/, "energy-transfer"]
  ];
  const matchedVariant = semanticRules.find(([pattern]) => pattern.test(text))?.[1];
  const variants = QUESTION_ANIMATION_VARIANTS[simulationType] || QUESTION_ANIMATION_VARIANTS.friction;
  return {
    variant: matchedVariant || variants[offset % variants.length],
    sequence: offset % 4,
    gameplay: offset % 2 ? "handheld" : "platform",
    concept: cleanVisualConfigurationReferences(assessment?.prompt || activity.topic)
  };
}

function resolveExperimentModelId(activity, assessment = {}, offset = 0) {
  const questionsPerLevel = Math.max(1, Number(activity.questionsPerLevel || 3));
  const levelIndex = Math.floor(offset / questionsPerLevel);
  const level = activity.learningGuide?.levels?.[levelIndex] || {};
  const subject = normalizeAnswer(activity.subject);
  const levelText = normalizeAnswer([
    activity.simulationType,
    activity.topic,
    activity.mission,
    activity.scientificPrinciple,
    level.title,
    level.objective,
    level.narrative,
    level.hint
  ].filter(Boolean).join(" "));
  const questionText = normalizeAnswer([
    assessment.prompt,
    ...(assessment.options || []),
    ...(assessment.accepted || []),
    ...(assessment.pairs || []).flat()
  ].filter(Boolean).join(" "));
  const explicit = assessment.experiment?.modelId;
  const combined = `${levelText} ${questionText}`;

  if (subject === "physics" || subject.includes("fisica")) {
    if (/fren|deten|desaceler|distancia de parada|distancia de frenado|obstaculo|impacto/.test(levelText)) return "braking-motion";
    if (/gravedad|caida libre|caer|peso gravitatorio/.test(levelText)) return "gravity-fall";
    if (/movimiento circular|fuerza centripeta|aceleracion centripeta|velocidad angular|plataforma giratoria|rotacion|orbita circular/.test(combined)) return "circular-motion";
    if (/proyectil|movimiento parabolico|trayectoria parabolica|lanzamiento|alcance|angulo de tiro/.test(combined)) return "projectile-motion";
    if (/circuit|electric|ley de ohm|voltaje|corriente/.test(combined)) return "ohm-circuit";
    if (/onda|sonido|frecuencia|longitud de onda/.test(combined)) return "wave-motion";
    if (/optic|luz|refrac|reflexion|prisma/.test(combined)) return "optics-refraction";
    if (/fluido|presion|pascal|arquimedes|flotacion/.test(combined)) return "fluid-pressure";
    if (/energia mecanica|energia potencial|energia cinetica|trabajo|potencia/.test(combined)) return "energy-work";
    return "newton-motion";
  }
  if (subject === "chemistry" || subject.includes("quimica")) {
    if (/estequ|(?:^|\s)mol(?:\s|$)|reactivo limitante|proporcion quimica/.test(combined)) return "stoichiometry";
    if (/disol|concentr|molaridad|(?:^|\s)ph(?:\s|$)|acido|base/.test(combined)) return "solution-concentration";
    return "particle-collision";
  }
  if (subject === "biology" || subject.includes("biologia")) {
    if (/(?:^|\s)(?:gen|genes|genetica)(?:\s|$)|herencia|(?:^|\s)adn(?:\s|$)|(?:^|\s)arn(?:\s|$)|alelo|cromosom/.test(combined)) return "genetics-probability";
    if (/ecosistema|ecolog|poblac|cadena alimentaria|biodiversidad/.test(combined)) return "ecosystem-balance";
    if (/respiracion celular|(?:^|\s)atp(?:\s|$)|fotosint/.test(combined)) return "cell-energy";
    return "cell-transport";
  }

  if (/fren|deten|desaceler|distancia de parada|distancia de frenado|obstaculo|impacto/.test(levelText)) return "braking-motion";
  if (/gravedad|caida libre|caer|peso gravitatorio/.test(levelText)) return "gravity-fall";
  if (/movimiento circular|fuerza centripeta|aceleracion centripeta|velocidad angular|plataforma giratoria|rotacion|orbita circular/.test(combined)) return "circular-motion";
  if (/proyectil|movimiento parabolico|trayectoria parabolica|lanzamiento|alcance|angulo de tiro/.test(combined)) return "projectile-motion";
  if (/circuit|electric|ohm|voltaje|corriente/.test(combined)) return "ohm-circuit";
  if (/onda|sonido|frecuencia|longitud de onda/.test(combined)) return "wave-motion";
  if (/optic|luz|refrac|reflexion|prisma/.test(combined)) return "optics-refraction";
  if (/fluido|presion|pascal|arquimedes|flotacion/.test(combined)) return "fluid-pressure";
  if (/energia mecanica|energia potencial|trabajo|potencia/.test(combined)) return "energy-work";
  if (/(?:^|\s)(?:gen|genes|genetica)(?:\s|$)|herencia|(?:^|\s)adn(?:\s|$)|(?:^|\s)arn(?:\s|$)|alelo|cromosom/.test(combined)) return "genetics-probability";
  if (/ecosistema|ecolog|poblac|cadena alimentaria|biodiversidad/.test(combined)) return "ecosystem-balance";
  if (/respiracion celular|atp|fotosint/.test(combined)) return "cell-energy";
  if (/celula|membrana|osmosis|transporte celular|difusion/.test(combined)) return "cell-transport";
  if (/estequ|mol|reactivo limitante|proporcion quimica/.test(combined)) return "stoichiometry";
  if (/disol|concentr|molaridad|ph|acido|base/.test(combined)) return "solution-concentration";
  if (/reaccion|molecula|enlace|colision|temperatura/.test(combined) || subject.includes("quim")) return "particle-collision";
  if (/fuerza|friccion|rozamiento|inercia|movimiento|velocidad|aceleracion/.test(combined)) return "newton-motion";
  return SCIENCE_EXPERIMENT_PRESETS[explicit] ? explicit : "newton-motion";
}

function buildQuestionGameplayProfile(activity, assessment, offset = 0) {
  const modelId = resolveExperimentModelId(activity, assessment, offset);
  const mechanic = assessment.type === "matching"
    ? "carry-match"
    : assessment.type === "keyword"
      ? "word-forge"
      : modelId === "braking-motion"
        ? "braking-run"
      : modelId === "gravity-fall"
        ? "gravity-drop"
      : modelId === "circular-motion"
        ? "circular-orbit"
      : modelId === "projectile-motion"
        ? "projectile-target"
        : modelId === "ohm-circuit"
          ? "circuit-route"
          : ["ecosystem-balance", "cell-energy", "cell-transport"].includes(modelId)
            ? "resource-balance"
            : "answer-zones";
  return { mechanic, modelId, sequence: offset % 4 };
}

const SCIENCE_EXPERIMENT_PRESETS = Object.freeze({
  "braking-motion": {
    interaction: "drive-and-brake", objective: { metric: "stoppingDistance", operator: "lessThan", target: 25, tolerance: .5 },
    inputs: ["initialVelocity", "brakeForce", "friction", "mass", "obstacleDistance"],
    measurements: ["acceleration", "stoppingDistance", "finalVelocity"],
    formula: ["Fnet = -(Fbrake + Ffriction)", "a = Fnet / mass", "vf² = vi² + 2ad"],
    correct: { initialVelocity: 20, brakeForce: 8200, friction: 800, mass: 1000, obstacleDistance: 25 },
    incorrect: { initialVelocity: 20, brakeForce: 2400, friction: 400, mass: 1000, obstacleDistance: 25 }
  },
  "gravity-fall": {
    interaction: "drop-object", objective: { metric: "fallTime", operator: "lessThan", target: 5, tolerance: .1 },
    inputs: ["height", "gravity", "mass"],
    measurements: ["fallTime", "impactVelocity", "acceleration"],
    formula: ["h = 1/2·g·t²", "t = √(2h/g)", "v = g·t"],
    correct: { height: 35, gravity: 9.81, mass: 10 },
    incorrect: { height: 70, gravity: 3.7, mass: 35 }
  },
  "circular-motion": {
    interaction: "stabilize-orbit", objective: { metric: "stabilityMargin", operator: "greaterThan", target: 0, tolerance: .1 },
    inputs: ["velocity", "radius", "mass", "frictionCoefficient", "gravity"],
    measurements: ["angularVelocity", "centripetalAcceleration", "centripetalForce", "maxStaticFriction", "stabilityMargin"],
    formula: ["ω = v/r", "ac = v²/r", "Fc = m·v²/r", "Ff,max = μs·m·g"],
    correct: { velocity: 6, radius: 8, mass: 12, frictionCoefficient: .7, gravity: 9.81 },
    incorrect: { velocity: 12, radius: 4, mass: 12, frictionCoefficient: .25, gravity: 9.81 }
  },
  "newton-motion": {
    interaction: "push-object", objective: { metric: "acceleration", operator: "greaterThan", target: .2, tolerance: .05 },
    correct: { force: 80, friction: 25, mass: 10 }, incorrect: { force: 24, friction: 52, mass: 18 }
  },
  "projectile-motion": {
    interaction: "launch-projectile", objective: { metric: "range", operator: "greaterThan", target: 18, tolerance: 1 },
    correct: { power: 72, angle: 45, gravity: 9.81 }, incorrect: { power: 22, angle: 82, gravity: 9.81 }
  },
  "ohm-circuit": {
    interaction: "connect-circuit", objective: { metric: "current", operator: "greaterThan", target: 1, tolerance: .05 },
    correct: { voltage: 12, resistance: 6 }, incorrect: { voltage: 3, resistance: 18 }
  },
  "energy-work": {
    interaction: "activate-lift", objective: { metric: "energy", operator: "greaterThan", target: 240, tolerance: 5 },
    correct: { mass: 8, gravity: 9.81, height: 5 }, incorrect: { mass: 2, gravity: 9.81, height: 2 }
  },
  "wave-motion": {
    interaction: "tune-wave", objective: { metric: "speed", operator: "greaterThan", target: 20, tolerance: 1 },
    correct: { frequency: 8, wavelength: 4, amplitude: 3 }, incorrect: { frequency: 2, wavelength: 2, amplitude: 1 }
  },
  "fluid-pressure": {
    interaction: "operate-piston", objective: { metric: "pressure", operator: "greaterThan", target: 8, tolerance: .2 },
    correct: { force: 60, area: 5, density: 1000 }, incorrect: { force: 18, area: 8, density: 500 }
  },
  "optics-refraction": {
    interaction: "redirect-light", objective: { metric: "angle", operator: "between", target: 24, tolerance: 10 },
    correct: { angle: 35, refractiveIndex: 1.45 }, incorrect: { angle: 75, refractiveIndex: 1.05 }
  },
  "particle-collision": {
    interaction: "energize-particles", objective: { metric: "collisionRate", operator: "greaterThan", target: 20, tolerance: 1 },
    correct: { temperature: 420, particleCount: 28 }, incorrect: { temperature: 120, particleCount: 8 }
  },
  stoichiometry: {
    interaction: "combine-reagents", objective: { metric: "product", operator: "greaterThan", target: 1.5, tolerance: .1 },
    correct: { reagentA: 4, reagentB: 3, ratioA: 2, ratioB: 1 }, incorrect: { reagentA: 1, reagentB: 1, ratioA: 4, ratioB: 3 }
  },
  "solution-concentration": {
    interaction: "mix-solution", objective: { metric: "concentration", operator: "between", target: 1, tolerance: .15 },
    correct: { solute: 1, volume: 1 }, incorrect: { solute: .1, volume: 2 }
  },
  "cell-transport": {
    interaction: "transport-particles", objective: { metric: "flux", operator: "absoluteGreaterThan", target: 18, tolerance: 1 },
    correct: { outside: 85, inside: 25, permeability: .6 }, incorrect: { outside: 45, inside: 40, permeability: .1 }
  },
  "cell-energy": {
    interaction: "produce-atp", objective: { metric: "energy", operator: "greaterThan", target: 25, tolerance: 1 },
    correct: { nutrients: 65, oxygen: 65 }, incorrect: { nutrients: 18, oxygen: 70 }
  },
  "ecosystem-balance": {
    interaction: "balance-resources", objective: { metric: "balance", operator: "greaterThan", target: 78, tolerance: 2 },
    correct: { sunlight: 62, water: 60, biodiversity: 56 }, incorrect: { sunlight: 95, water: 20, biodiversity: 12 }
  },
  "genetics-probability": {
    interaction: "select-inheritance", objective: { metric: "probability", operator: "greaterThan", target: .5, tolerance: .02 },
    correct: { dominant: 3, recessive: 1 }, incorrect: { dominant: 1, recessive: 4 }
  }
});

function buildQuestionExperiment(activity, assessment, offset = 0) {
  const gameplay = assessment.gameplay || buildQuestionGameplayProfile(activity, assessment, offset);
  const resolvedModelId = resolveExperimentModelId(activity, assessment, offset);
  const modelId = SCIENCE_EXPERIMENT_PRESETS[resolvedModelId]
    ? resolvedModelId
    : SCIENCE_EXPERIMENT_PRESETS[gameplay.modelId]
      ? gameplay.modelId
      : "newton-motion";
  const template = SCIENCE_EXPERIMENT_PRESETS[modelId];
  const answerCount = assessment.type === "multiple"
    ? Math.max(1, assessment.options?.length || 3)
    : assessment.type === "matching"
      ? Math.max(2, assessment.pairs?.length || 3)
      : 2;
  const correctIndex = assessment.type === "multiple" ? Number(assessment.correct || 0) : 0;
  const existingExperiment = assessment.experiment || {};
  const canReuseExperiment = Number(existingExperiment.schemaVersion) === 2
    && existingExperiment.modelId === modelId;
  const generatedPresets = Array.from({ length: answerCount }, (_, index) =>
    structuredClone(index === correctIndex ? template.correct : template.incorrect)
  );
  return {
    schemaVersion: 2,
    modelId,
    interaction: canReuseExperiment ? existingExperiment.interaction || template.interaction : template.interaction,
    answerPresets: canReuseExperiment
      && Array.isArray(existingExperiment.answerPresets)
      && existingExperiment.answerPresets.length >= answerCount
      ? existingExperiment.answerPresets.slice(0, answerCount)
      : generatedPresets,
    correctPreset: { ...template.correct, ...(canReuseExperiment ? existingExperiment.correctPreset || {} : {}) },
    incorrectPreset: { ...template.incorrect, ...(canReuseExperiment ? existingExperiment.incorrectPreset || {} : {}) },
    objective: { ...template.objective, ...(canReuseExperiment ? existingExperiment.objective || {} : {}) },
    inputs: [...(template.inputs || Object.keys(template.correct))],
    measurements: [...(template.measurements || [template.objective.metric])],
    formula: [...(template.formula || [])]
  };
}

function assessmentMatchesModel(assessment, modelId) {
  const text = normalizeAnswer([
    assessment.prompt,
    ...(assessment.options || []),
    ...(assessment.accepted || []),
    ...(assessment.pairs || []).flat()
  ].filter(Boolean).join(" "));
  if (modelId === "braking-motion") return /fren|deten|desaceler|distancia de parada|distancia de frenado|obstaculo|impacto/.test(text);
  if (modelId === "projectile-motion") return /proyectil|parabolic|trayectoria|lanzamiento|alcance|angulo/.test(text);
  return true;
}

function buildBrakingAssessment(offset, requestedType = "multiple") {
  const variant = offset % 3;
  if (requestedType === "keyword") {
    const keywords = [
      ["Escribe el término para la aceleración opuesta al movimiento que reduce la velocidad.", ["desaceleración"]],
      ["Escribe el nombre de la distancia recorrida desde que se frena hasta detenerse.", ["distancia de frenado", "distancia de detención"]],
      ["Escribe la propiedad que hace que el vehículo se resista a cambiar su movimiento.", ["inercia"]]
    ][variant];
    return normalizeAssessmentSchema({
      type: "keyword",
      prompt: keywords[0],
      accepted: keywords[1],
      feedback: "La prueba relaciona velocidad inicial, fuerza neta, masa y distancia disponible para detener el vehículo."
    });
  }
  if (requestedType === "matching") {
    return normalizeAssessmentSchema({
      type: "matching",
      prompt: "Relaciona cada variable de frenado con su efecto observable.",
      pairs: [
        ["Mayor fuerza de frenado", "Reduce la distancia de detención"],
        ["Mayor masa", "Exige más fuerza para obtener la misma desaceleración"],
        ["Mayor velocidad inicial", "Aumenta la distancia necesaria para detenerse"]
      ],
      feedback: "La distancia de frenado depende de la velocidad inicial y de la desaceleración producida por la fuerza neta."
    });
  }
  const variants = [
    {
      prompt: "¿Qué condición permite detener el vehículo antes del obstáculo?",
      options: ["La distancia de frenado calculada es menor que la distancia al obstáculo", "La masa desaparece durante el frenado", "La velocidad aumenta mientras se aplican los frenos"],
      correct: 0
    },
    {
      prompt: "¿Qué ocurrirá si aumenta la masa y se conserva la misma fuerza de frenado?",
      options: ["La distancia de detención aumentará", "El vehículo se detendrá instantáneamente", "La velocidad inicial dejará de influir"],
      correct: 0
    },
    {
      prompt: "¿Qué ajuste reduce de forma segura la distancia de frenado?",
      options: ["Aumentar la fuerza de frenado sin perder adherencia", "Aumentar la velocidad inicial", "Reducir la distancia disponible"],
      correct: 0
    }
  ];
  return normalizeAssessmentSchema({
    type: "multiple",
    ...variants[variant],
    feedback: "La fuerza neta de frenado produce una aceleración negativa; su magnitud determina cuánto espacio necesita el vehículo para detenerse."
  });
}

function buildAssessment(activity, offset = 0) {
  const savedAssessment = activity.assessments?.[offset];
  if (savedAssessment && isAssessmentCompatibleWithSubject(activity, savedAssessment)) {
    const saved = normalizeAssessmentSchema(structuredClone(savedAssessment));
    saved.subject = activity.subject;
    saved.animation ||= buildQuestionAnimationProfile(activity, saved, offset);
    saved.gameplay ||= buildQuestionGameplayProfile(activity, saved, offset);
    return saved;
  }
  const bank = ASSESSMENT_BANK[activity.simulationType] || ASSESSMENT_BANK.friction;
  const types = ["multiple", "matching", "keyword"];
  const type = types[(assessmentHash(activity.topic) + offset) % types.length];
  if (type === "multiple") {
    const [prompt, options, correct] = bank.multiple;
    const assessment = normalizeAssessmentSchema({ type, prompt, options, correct, feedback: activity.scientificPrinciple });
    assessment.animation = buildQuestionAnimationProfile(activity, assessment, offset);
    assessment.gameplay = buildQuestionGameplayProfile(activity, assessment, offset);
    return assessment;
  }
  if (type === "keyword") {
    const [prompt, accepted] = bank.keyword;
    const assessment = normalizeAssessmentSchema({ type, prompt, accepted, feedback: activity.scientificPrinciple });
    assessment.animation = buildQuestionAnimationProfile(activity, assessment, offset);
    assessment.gameplay = buildQuestionGameplayProfile(activity, assessment, offset);
    return assessment;
  }
  const assessment = normalizeAssessmentSchema({
    type,
    prompt: "Relaciona cada concepto con su efecto o definición.",
    pairs: bank.matching,
    feedback: activity.scientificPrinciple
  });
  assessment.animation = buildQuestionAnimationProfile(activity, assessment, offset);
  assessment.gameplay = buildQuestionGameplayProfile(activity, assessment, offset);
  return assessment;
}

function buildDistinctFallbackAssessment(activity, index, questionsPerLevel) {
  if (activity.subject === "math" || (["physics", "chemistry"].includes(activity.subject) && index % 5 < 3)) {
    return buildStructuredFallbackAssessment(activity, index);
  }
  const levelIndex = Math.floor(index / questionsPerLevel);
  const questionIndex = index % questionsPerLevel;
  const guideLevel = activity.learningGuide?.levels?.[levelIndex] || {};
  const guideConcepts = Array.isArray(guideLevel.concepts) ? guideLevel.concepts : [];
  const controlConcepts = (activity.controls || []).map((control) => ({
    term: control.label,
    definition: control.effect || `Variable que modifica ${activity.topic}`
  }));
  const concepts = [...guideConcepts, ...controlConcepts].filter((concept) => concept?.term && concept?.definition);
  const primary = concepts[(questionIndex + levelIndex) % Math.max(1, concepts.length)]
    || { term: activity.topic, definition: activity.scientificPrinciple };
  const alternatives = concepts
    .filter((concept) => normalizeAnswer(concept.term) !== normalizeAnswer(primary.term))
    .map((concept) => concept.definition)
    .filter(Boolean);
  const type = ["multiple", "matching", "keyword"][(index + assessmentHash(activity.topic)) % 3];
  let assessment;

  if (type === "keyword") {
    assessment = {
      type,
      prompt: `Escribe el término científico que corresponde a esta descripción: ${primary.definition}`,
      accepted: [primary.term],
      feedback: `${primary.term}: ${primary.definition}`
    };
  } else if (type === "matching") {
    const pairs = concepts.slice(0, 4).map((concept) => [concept.term, concept.definition]);
    while (pairs.length < 3) {
      pairs.push([
        `${activity.topic} ${pairs.length + 1}`,
        `Relación científica del nivel ${levelIndex + 1}, fase ${pairs.length + 1}`
      ]);
    }
    assessment = {
      type,
      prompt: `Relaciona los conceptos del nivel ${levelIndex + 1} con su función o evidencia.`,
      pairs: pairs.slice(0, 3),
      feedback: `Las relaciones correctas conectan cada concepto con su efecto observable en ${activity.topic}.`
    };
  } else {
    const correctText = primary.definition;
    const distractors = alternatives.slice(0, 2);
    while (distractors.length < 2) {
      distractors.push(
        distractors.length
          ? `No produce cambios observables en ${primary.term}`
          : `Describe una propiedad ajena a ${primary.term}`
      );
    }
    const correctIndex = (levelIndex + questionIndex) % 3;
    const options = distractors.slice(0, 2);
    options.splice(correctIndex, 0, correctText);
    assessment = {
      type,
      prompt: `¿Qué afirmación explica mejor ${primary.term} en el nivel ${levelIndex + 1}?`,
      options,
      correct: correctIndex,
      feedback: `${primary.term} se reconoce porque ${primary.definition}`
    };
  }
  return normalizeAssessmentSchema(assessment);
}

function ensureActivityAssessments(activity) {
  const levelCount = Math.max(1, Math.floor(Number(activity.levelCount || 3)));
  const questionsPerLevel = Math.max(1, Math.floor(Number(activity.questionsPerLevel || 3)));
  const existing = Array.isArray(activity.assessments) ? activity.assessments : [];
  const expectedCount = levelCount * questionsPerLevel;
  if (activity.generation?.complete) {
    if (existing.length !== expectedCount) {
      throw new Error(`La actividad está incompleta: se esperaban ${expectedCount} preguntas y existen ${existing.length}.`);
    }
    const signatures = new Set();
    activity.assessments = existing.map((source, index) => {
      let assessment = normalizeAssessmentSchema(structuredClone(source));
      const signature = normalizeAnswer(JSON.stringify({
        prompt: assessment.prompt,
        options: assessment.options,
        accepted: assessment.accepted,
        pairs: assessment.pairs,
        correctSequence: assessment.correctSequence
      }));
      if (signatures.has(signature)) assessment = buildDistinctFallbackAssessment(activity, index, questionsPerLevel);
      signatures.add(normalizeAnswer(JSON.stringify({
        prompt: assessment.prompt,
        options: assessment.options,
        accepted: assessment.accepted,
        pairs: assessment.pairs,
        correctSequence: assessment.correctSequence
      })));
      const levelIndex = Math.floor(index / questionsPerLevel);
      const questionIndex = index % questionsPerLevel;
      assessment.levelIndex = levelIndex;
      assessment.questionIndex = questionIndex;
      assessment.globalIndex = index;
      assessment.levelId ||= `level-${levelIndex + 1}`;
      assessment.questionId ||= `${assessment.levelId}-question-${questionIndex + 1}`;
      assessment.animation ||= buildQuestionAnimationProfile(activity, assessment, index);
      assessment.gameplay ||= buildQuestionGameplayProfile(activity, assessment, index);
      assessment.experiment ||= buildQuestionExperiment(activity, assessment, index);
      return assessment;
    });
    return activity.assessments;
  }
  const sourceActivity = { ...activity, assessments: [] };
  const signatures = new Set();
  activity.assessments = Array.from(
    { length: levelCount * questionsPerLevel },
    (_, index) => {
      let assessment = normalizeAssessmentSchema(existing[index] || buildAssessment(sourceActivity, index));
      if (activity.subject === "math" || (["physics", "chemistry"].includes(activity.subject) && index % 5 < 3)) {
        if (!STRUCTURED_ASSESSMENT_TYPES.has(assessment.type)) assessment = buildStructuredFallbackAssessment(activity, index);
      }
      const signature = normalizeAnswer(JSON.stringify({
        prompt: assessment.prompt,
        options: assessment.options,
        accepted: assessment.accepted,
        pairs: assessment.pairs
      }));
      if (signatures.has(signature)) {
        assessment = buildDistinctFallbackAssessment(activity, index, questionsPerLevel);
      }
      signatures.add(normalizeAnswer(JSON.stringify({
        prompt: assessment.prompt,
        options: assessment.options,
        accepted: assessment.accepted,
        pairs: assessment.pairs
      })));
      const resolvedModelId = resolveExperimentModelId(activity, assessment, index);
      if (!assessmentMatchesModel(assessment, resolvedModelId) && resolvedModelId === "braking-motion") {
        assessment = buildBrakingAssessment(index, assessment.type);
      }
      assessment.animation ||= buildQuestionAnimationProfile(activity, assessment, index);
      assessment.gameplay = {
        ...buildQuestionGameplayProfile(activity, assessment, index),
        ...(assessment.gameplay || {}),
        modelId: resolvedModelId
      };
      assessment.experiment = buildQuestionExperiment(activity, assessment, index);
      return assessment;
    }
  );
  return activity.assessments;
}

function structuredEditorList(value, separator = "|") {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item).trim())
    .filter(Boolean)
    .join(` ${separator} `);
}

function splitStructuredEditorList(value, separator = "|") {
  return String(value || "")
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

function blankSegmentsFromExpression(value) {
  const chunks = String(value || "").split("___");
  return chunks.flatMap((chunk, index) => index < chunks.length - 1 ? [chunk, "___"] : [chunk]);
}

function acceptedAnswerPreviewMarkup(values = []) {
  const accepted = (Array.isArray(values) ? values : [values])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const [primary, ...alternatives] = accepted;
  if (!primary) return `<strong>Configura la respuesta</strong>`;
  return `<strong>${escapeHtml(primary)}</strong>${alternatives.length
    ? `<span class="sa-answer-alternatives"><small>Alternativa aceptada</small><b>/ ${escapeHtml(alternatives.join(" / "))}</b></span>`
    : ""}`;
}

function acceptedAnswerEditorHint(values = []) {
  const accepted = (Array.isArray(values) ? values : [values])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (accepted.length < 2) return "";
  return `<p class="sa-editor-help">Respuesta principal: <b>${escapeHtml(accepted[0])}</b>. También se acepta: ${escapeHtml(accepted.slice(1).join(", "))}.</p>`;
}

function buildStructuredAnswerEditor(assessment) {
  const answerSummary = (() => {
    if (assessment.type === "equation-build") return (assessment.correctSequence || []).join(" ");
    if (assessment.type === "fill-blank") return (assessment.accepted || []).join(" / ");
    if (assessment.type === "exponent-placement") return (assessment.correctExponents || []).join(", ");
    if (assessment.type === "chemical-balance") return (assessment.correctCoefficients || []).join(" : ");
    if (assessment.type === "numeric-answer") return `${assessment.correctValue ?? ""} ${assessment.unit || ""}`.trim();
    if (assessment.type === "graph-plot") return (assessment.targetPoints || []).map((point) => `(${point.x}, ${point.y})`).join(", ");
    if (assessment.type === "sequence-order") return (assessment.correctOrder || []).join(" → ");
    return "";
  })();
  const answerPreview = assessment.type === "fill-blank"
    ? acceptedAnswerPreviewMarkup(assessment.accepted)
    : `<strong>${escapeHtml(answerSummary || "Configura la respuesta")}</strong>`;
  const common = `
    <div class="sa-structured-editor">
      <div class="sa-answer-preview"><small>Respuesta principal</small>${answerPreview}</div>
      <label class="sa-field"><span>Antecedente o situación</span><textarea id="assessmentContext" rows="3" placeholder="Explica de dónde surge el reto y por qué se necesita resolverlo.">${escapeHtml(assessment.context || "")}</textarea></label>
      <label class="sa-field"><span>Datos conocidos</span><textarea id="assessmentGiven" rows="3" placeholder="Un dato por línea">${escapeHtml((assessment.given || []).join("\n"))}</textarea></label>
      <label class="sa-field"><span>Objetivo del alumno</span><input id="assessmentGoal" value="${escapeHtml(assessment.goal || "")}" placeholder="Qué debe representar, calcular o demostrar"></label>`;
  let fields = "";
  if (assessment.type === "equation-build") {
    fields = `
      <label class="sa-field"><span>Ecuación correcta</span><input id="assessmentCorrectSequence" value="${escapeHtml(structuredEditorList(assessment.correctSequence))}" placeholder="2x | + | 3 | = | 11"></label>
      <small class="sa-editor-help">Separa cada pieza con <b>|</b>. El juego mezclará el orden automáticamente.</small>
      <label class="sa-field"><span>Piezas distractoras</span><input id="assessmentDistractors" value="${escapeHtml(structuredEditorList(assessment.distractors))}" placeholder="− | 8 | 3x"></label>`;
  } else if (assessment.type === "numeric-answer") {
    fields = `<div class="sa-structured-editor-grid">
      <label class="sa-field"><span>Respuesta numérica</span><input id="assessmentCorrectValue" type="number" step="any" value="${escapeHtml(assessment.correctValue)}"></label>
      <label class="sa-field"><span>Tolerancia</span><input id="assessmentTolerance" type="number" min="0" step="any" value="${escapeHtml(assessment.tolerance)}"></label>
      <label class="sa-field"><span>Unidad</span><input id="assessmentUnit" value="${escapeHtml(assessment.unit || "")}" placeholder="cm, %, m/s²..."></label>
    </div>`;
  } else if (assessment.type === "fill-blank") {
    fields = `
      <label class="sa-field"><span>Expresión con espacio</span><input id="assessmentBlankExpression" value="${escapeHtml((assessment.segments || []).join(""))}" placeholder="3x² + 4x² = ___"></label>
      <label class="sa-field"><span>Respuestas aceptadas</span><input id="assessmentStructuredAccepted" value="${escapeHtml((assessment.accepted || []).join(", "))}" placeholder="7x², 7x2"></label>
      ${acceptedAnswerEditorHint(assessment.accepted)}`;
  } else if (assessment.type === "exponent-placement") {
    fields = `<div class="sa-structured-editor-grid">
      <label class="sa-field"><span>Base</span><input id="assessmentBases" value="${escapeHtml((assessment.bases || []).join(", "))}"></label>
      <label class="sa-field"><span>Exponentes disponibles</span><input id="assessmentExponents" value="${escapeHtml((assessment.exponents || []).join(", "))}"></label>
      <label class="sa-field"><span>Exponente correcto</span><input id="assessmentCorrectExponents" value="${escapeHtml((assessment.correctExponents || []).join(", "))}"></label>
    </div>`;
  } else if (assessment.type === "sequence-order") {
    fields = `
      <label class="sa-field"><span>Pasos disponibles</span><textarea id="assessmentSteps" rows="5">${escapeHtml((assessment.steps || []).join("\n"))}</textarea></label>
      <label class="sa-field"><span>Orden correcto</span><textarea id="assessmentCorrectOrder" rows="5">${escapeHtml((assessment.correctOrder || []).join("\n"))}</textarea></label>`;
  }
  const advancedData = {
    compounds: assessment.compounds,
    correctCoefficients: assessment.correctCoefficients,
    axes: assessment.axes,
    targetPoints: assessment.targetPoints
  };
  return `${common}${fields}
    <details class="sa-advanced-config">
      <summary>Configuración avanzada</summary>
      <label class="sa-field"><span>Datos estructurados</span><textarea id="assessmentStructuredData" rows="8" spellcheck="false">${escapeHtml(JSON.stringify(advancedData, null, 2))}</textarea></label>
    </details></div>`;
}

function renderContentEditor() {
  const inspector = $(".sa-inspector");
  const contentScroll = inspector?.querySelector(".sa-content-scroll") || inspector;
  let editor = $("#scienceContentEditor");
  if (!editor) {
    editor = document.createElement("section");
    editor.id = "scienceContentEditor";
    editor.className = "sa-inspector-section sa-content-editor";
    contentScroll.append(editor);
  }
  if (state.activity.gameMode === "simulator") {
    renderSimulatorContentEditor(editor);
    return;
  }
  editor.oninput = null;
  editor.onclick = null;

  const assessments = ensureActivityAssessments(state.activity);
  state.contentQuestionIndex = Math.min(Number(state.contentQuestionIndex || 0), assessments.length - 1);
  state.contentLevelIndex = Math.min(Number(state.contentLevelIndex || 0), Number(state.activity.levelCount || 3) - 1);
  state.activity.learningGuide ||= buildFallbackLearningGuide(state.activity);
  const assessment = assessments[state.contentQuestionIndex];
  const guideLevel = state.activity.learningGuide.levels[state.contentLevelIndex] || buildFallbackLearningGuide(state.activity).levels[0];
  const questionOptions = assessments.map((_, index) => {
    const perLevel = Number(state.activity.questionsPerLevel || 3);
    return `<option value="${index}" ${index === state.contentQuestionIndex ? "selected" : ""}>Nivel ${Math.floor(index / perLevel) + 1} · Pregunta ${(index % perLevel) + 1}</option>`;
  }).join("");
  const levelOptions = state.activity.learningGuide.levels.map((_, index) =>
    `<option value="${index}" ${index === state.contentLevelIndex ? "selected" : ""}>Nivel ${index + 1}</option>`
  ).join("");

  let answerEditor = "";
  if (assessment.type === "multiple") {
    answerEditor = `<div class="sa-answer-editor">${assessment.options.map((option, index) => `
      <label><input type="radio" name="correctAssessmentAnswer" value="${index}" ${index === assessment.correct ? "checked" : ""}><span>Correcta</span><input data-option-index="${index}" value="${escapeHtml(option)}"></label>
    `).join("")}</div>`;
  } else if (assessment.type === "matching") {
    answerEditor = `<div class="sa-pair-editor">${assessment.pairs.map((pair, index) => `
      <div><input data-pair-term="${index}" value="${escapeHtml(pair[0])}" aria-label="Concepto"><i class="fas fa-arrow-right"></i><input data-pair-definition="${index}" value="${escapeHtml(pair[1])}" aria-label="Relación correcta"></div>
    `).join("")}</div><p class="sa-editor-help">Cada fila define una pareja correcta.</p>`;
  } else if (assessment.type === "keyword") {
    answerEditor = `<label class="sa-field"><span>Palabras aceptadas</span><input id="assessmentAccepted" value="${escapeHtml(assessment.accepted.join(", "))}" placeholder="Separadas por comas"></label>${acceptedAnswerEditorHint(assessment.accepted)}`;
  } else {
    answerEditor = buildStructuredAnswerEditor(assessment);
  }

  editor.innerHTML = `
    <div data-editor-pane="objectives">
    <div class="sa-inspector-heading"><span>Objetivos y conocimiento</span><i class="fas fa-book-open"></i></div>
    <label class="sa-field"><span>Editar nivel</span><select id="contentLevelSelect">${levelOptions}</select></label>
    <label class="sa-field"><span>Objetivo del nivel</span><textarea id="contentObjective" rows="2">${escapeHtml(guideLevel.objective)}</textarea></label>
    <label class="sa-field"><span>Descripción narrativa</span><textarea id="contentNarrative" rows="3">${escapeHtml(guideLevel.narrative)}</textarea></label>
    <label class="sa-field"><span>Conceptos y definiciones</span><textarea id="contentConcepts" rows="4" placeholder="Concepto: definición">${escapeHtml((guideLevel.concepts || []).map((concept) => `${concept.term}: ${concept.definition}`).join("\n"))}</textarea></label>
    <label class="sa-field"><span>Pista</span><textarea id="contentHint" rows="2">${escapeHtml(guideLevel.hint)}</textarea></label>
    </div>
    <div data-editor-pane="questions">
    <div class="sa-inspector-heading sa-question-editor-heading"><span>Preguntas, respuestas y retroalimentación</span><i class="fas fa-list-check"></i></div>
    <label class="sa-field"><span>Editar pregunta</span><select id="contentQuestionSelect">${questionOptions}</select></label>
    <label class="sa-field"><span>Tipo de pregunta</span><select id="assessmentType">
      <option value="multiple" ${assessment.type === "multiple" ? "selected" : ""}>Opción múltiple</option>
      <option value="matching" ${assessment.type === "matching" ? "selected" : ""}>Emparejamiento</option>
      <option value="keyword" ${assessment.type === "keyword" ? "selected" : ""}>Palabra clave</option>
      <option value="equation-build" ${assessment.type === "equation-build" ? "selected" : ""}>Construir ecuación</option>
      <option value="fill-blank" ${assessment.type === "fill-blank" ? "selected" : ""}>Completar espacio</option>
      <option value="exponent-placement" ${assessment.type === "exponent-placement" ? "selected" : ""}>Colocar exponentes</option>
      <option value="chemical-balance" ${assessment.type === "chemical-balance" ? "selected" : ""}>Balanceo químico</option>
      <option value="numeric-answer" ${assessment.type === "numeric-answer" ? "selected" : ""}>Respuesta numérica</option>
      <option value="graph-plot" ${assessment.type === "graph-plot" ? "selected" : ""}>Graficar puntos</option>
      <option value="sequence-order" ${assessment.type === "sequence-order" ? "selected" : ""}>Ordenar procedimiento</option>
    </select></label>
    <label class="sa-field"><span>Mecánica dentro del juego</span><select id="assessmentMechanic">
      <option value="auto" ${assessment.gameplay?.mechanic === "auto" ? "selected" : ""}>Automática según el contenido</option>
      <option value="answer-zones" ${assessment.gameplay?.mechanic === "answer-zones" ? "selected" : ""}>Zonas de respuesta</option>
      <option value="carry-match" ${assessment.gameplay?.mechanic === "carry-match" ? "selected" : ""}>Transportar y emparejar</option>
      <option value="word-forge" ${assessment.gameplay?.mechanic === "word-forge" ? "selected" : ""}>Forjar palabra clave</option>
      <option value="projectile-target" ${assessment.gameplay?.mechanic === "projectile-target" ? "selected" : ""}>Objetivos y proyectiles</option>
      <option value="circuit-route" ${assessment.gameplay?.mechanic === "circuit-route" ? "selected" : ""}>Ruta de circuito</option>
      <option value="resource-balance" ${assessment.gameplay?.mechanic === "resource-balance" ? "selected" : ""}>Equilibrio de recursos</option>
      <option value="equation-lab" ${assessment.gameplay?.mechanic === "equation-lab" ? "selected" : ""}>Laboratorio de ecuaciones</option>
      <option value="formula-console" ${assessment.gameplay?.mechanic === "formula-console" ? "selected" : ""}>Consola de fórmula</option>
      <option value="exponent-dock" ${assessment.gameplay?.mechanic === "exponent-dock" ? "selected" : ""}>Dock de exponentes</option>
      <option value="molecule-balance" ${assessment.gameplay?.mechanic === "molecule-balance" ? "selected" : ""}>Balanza molecular</option>
      <option value="numeric-console" ${assessment.gameplay?.mechanic === "numeric-console" ? "selected" : ""}>Consola numérica</option>
      <option value="graph-probe" ${assessment.gameplay?.mechanic === "graph-probe" ? "selected" : ""}>Sonda gráfica</option>
      <option value="process-stations" ${assessment.gameplay?.mechanic === "process-stations" ? "selected" : ""}>Estaciones de proceso</option>
    </select></label>
    <label class="sa-field"><span>Pregunta</span><textarea id="assessmentPrompt" rows="3">${escapeHtml(assessment.prompt)}</textarea></label>
    ${answerEditor}
    <label class="sa-field"><span>Retroalimentación</span><textarea id="assessmentFeedback" rows="4">${escapeHtml(assessment.feedback || "")}</textarea></label>
    </div>`;

  initializeInspectorTabs();
  if (editor.dataset.bound) return;
  editor.dataset.bound = "true";
  editor.addEventListener("change", (event) => {
    if (event.target.id === "contentLevelSelect") {
      state.contentLevelIndex = Number(event.target.value);
      renderContentEditor();
      return;
    }
    if (event.target.id === "contentQuestionSelect") {
      state.contentQuestionIndex = Number(event.target.value);
      renderContentEditor();
      window.dispatchEvent(new CustomEvent("scienceactivities:select-question", {
        detail: { index: state.contentQuestionIndex }
      }));
      return;
    }
    if (event.target.id === "assessmentType") {
      const type = event.target.value;
      const base = buildAssessment({ ...state.activity, assessments: [] }, state.contentQuestionIndex);
      state.activity.assessments[state.contentQuestionIndex] = STRUCTURED_ASSESSMENT_TYPES.has(type)
        ? { ...buildStructuredFallbackAssessment(state.activity, state.contentQuestionIndex), type }
        : type === "multiple"
        ? { type, prompt: base.prompt, options: base.options || ["Opción A", "Opción B", "Opción C"], correct: 0, feedback: base.feedback }
        : type === "matching"
          ? { type, prompt: "Relaciona cada concepto con su definición.", pairs: (ASSESSMENT_BANK[state.activity.simulationType] || ASSESSMENT_BANK.friction).matching, feedback: base.feedback }
          : { type, prompt: base.prompt, accepted: ["respuesta"], feedback: base.feedback };
      state.activity.assessments[state.contentQuestionIndex].animation = buildQuestionAnimationProfile(
        state.activity,
        state.activity.assessments[state.contentQuestionIndex],
        state.contentQuestionIndex
      );
      state.activity.assessments[state.contentQuestionIndex].gameplay = buildQuestionGameplayProfile(
        state.activity,
        state.activity.assessments[state.contentQuestionIndex],
        state.contentQuestionIndex
      );
      renderContentEditor();
      return;
    }
    if (event.target.id === "assessmentMechanic") {
      const current = state.activity.assessments[state.contentQuestionIndex];
      current.gameplay = {
        ...buildQuestionGameplayProfile(state.activity, current, state.contentQuestionIndex),
        ...(current.gameplay || {}),
        mechanic: event.target.value
      };
    }
    if (event.target.name === "correctAssessmentAnswer") {
      state.activity.assessments[state.contentQuestionIndex].correct = Number(event.target.value);
    }
  });
  editor.addEventListener("input", (event) => {
    const currentAssessment = state.activity.assessments[state.contentQuestionIndex];
    const currentLevel = state.activity.learningGuide.levels[state.contentLevelIndex];
    if (event.target.id === "contentObjective") currentLevel.objective = event.target.value;
    if (event.target.id === "contentNarrative") currentLevel.narrative = event.target.value;
    if (event.target.id === "contentHint") currentLevel.hint = event.target.value;
    if (event.target.id === "contentConcepts") {
      currentLevel.concepts = event.target.value.split("\n").map((line) => {
        const [term, ...definition] = line.split(":");
        return { term: term.trim(), definition: definition.join(":").trim() };
      }).filter((concept) => concept.term && concept.definition);
    }
    if (event.target.id === "assessmentPrompt") {
      currentAssessment.prompt = event.target.value;
      currentAssessment.animation = buildQuestionAnimationProfile(
        state.activity,
        currentAssessment,
        state.contentQuestionIndex
      );
    }
    if (event.target.id === "assessmentFeedback") currentAssessment.feedback = event.target.value;
    if (event.target.id === "assessmentAccepted") currentAssessment.accepted = event.target.value.split(",").map((value) => value.trim()).filter(Boolean);
    if (event.target.id === "assessmentContext") currentAssessment.context = event.target.value;
    if (event.target.id === "assessmentGiven") currentAssessment.given = event.target.value.split("\n").map((value) => value.trim()).filter(Boolean);
    if (event.target.id === "assessmentGoal") currentAssessment.goal = event.target.value;
    if (event.target.id === "assessmentCorrectSequence") {
      currentAssessment.correctSequence = splitStructuredEditorList(event.target.value);
      currentAssessment.pieces = [...currentAssessment.correctSequence, ...(currentAssessment.distractors || [])];
    }
    if (event.target.id === "assessmentDistractors") {
      currentAssessment.distractors = splitStructuredEditorList(event.target.value);
      currentAssessment.pieces = [...(currentAssessment.correctSequence || []), ...currentAssessment.distractors];
    }
    if (event.target.id === "assessmentCorrectValue") currentAssessment.correctValue = Number(event.target.value);
    if (event.target.id === "assessmentTolerance") currentAssessment.tolerance = Math.max(0, Number(event.target.value));
    if (event.target.id === "assessmentUnit") currentAssessment.unit = event.target.value;
    if (event.target.id === "assessmentBlankExpression") currentAssessment.segments = blankSegmentsFromExpression(event.target.value);
    if (event.target.id === "assessmentStructuredAccepted") currentAssessment.accepted = event.target.value.split(",").map((value) => value.trim()).filter(Boolean);
    if (event.target.id === "assessmentBases") currentAssessment.bases = event.target.value.split(",").map((value) => value.trim()).filter(Boolean);
    if (event.target.id === "assessmentExponents") currentAssessment.exponents = event.target.value.split(",").map((value) => value.trim()).filter(Boolean);
    if (event.target.id === "assessmentCorrectExponents") currentAssessment.correctExponents = event.target.value.split(",").map((value) => value.trim()).filter(Boolean);
    if (event.target.id === "assessmentSteps") currentAssessment.steps = event.target.value.split("\n").map((value) => value.trim()).filter(Boolean);
    if (event.target.id === "assessmentCorrectOrder") currentAssessment.correctOrder = event.target.value.split("\n").map((value) => value.trim()).filter(Boolean);
    if (event.target.id === "assessmentStructuredData") {
      try {
        Object.assign(currentAssessment, JSON.parse(event.target.value));
        event.target.setCustomValidity("");
      } catch (_) {
        event.target.setCustomValidity("El JSON de la mecánica no es válido.");
      }
    }
    if (event.target.matches("[data-option-index]")) currentAssessment.options[Number(event.target.dataset.optionIndex)] = event.target.value;
    if (event.target.matches("[data-pair-term]")) currentAssessment.pairs[Number(event.target.dataset.pairTerm)][0] = event.target.value;
    if (event.target.matches("[data-pair-definition]")) currentAssessment.pairs[Number(event.target.dataset.pairDefinition)][1] = event.target.value;
  });
}

function normalizeAnswer(value) {
  return String(value || "").trim().toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function assessmentLearningContextMarkup(assessment = {}) {
  const given = (assessment.given || []).filter(Boolean);
  if (!assessment.context && !given.length && !assessment.goal) return "";
  return `<section class="sa-question-context">
    <header class="sa-question-context-header">
      <span class="sa-question-context-signal" aria-hidden="true"><i></i></span>
      <small>Contexto de misión</small>
      <strong><i class="fas fa-compass" aria-hidden="true"></i> Antecedente</strong>
    </header>
    ${assessment.context ? `<div class="sa-question-context-copy"><i class="fas fa-wave-square" aria-hidden="true"></i><p>${escapeHtml(assessment.context)}</p></div>` : ""}
    ${given.length ? `<div class="sa-question-context-data"><small>Datos disponibles</small><div>${given.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div></div>` : ""}
    ${assessment.goal ? `<div class="sa-question-context-goal"><i class="fas fa-crosshairs" aria-hidden="true"></i><span><small>Objetivo operativo</small><strong>${escapeHtml(assessment.goal)}</strong></span></div>` : ""}
  </section>`;
}

function assessmentQuestionMarkup(assessment) {
  if (STRUCTURED_ASSESSMENT_TYPES.has(assessment.type)) {
    return `<div class="sa-structured-preview"><i class="fas fa-gamepad"></i><strong>Reto interactivo dentro del videojuego</strong><span>Las piezas, valores o puntos se manipulan en la siguiente pantalla.</span></div>`;
  }
  if (assessment.type === "multiple") {
    return `<div class="sa-answer-options">${assessment.options.map((option, index) => `
      <button type="button" data-assessment-answer="${index}"><span>${String.fromCharCode(65 + index)}</span>${escapeHtml(option)}</button>
    `).join("")}</div>`;
  }
  if (assessment.type === "keyword") {
    return `<form class="sa-keyword-answer">
      <label for="assessmentKeyword">Palabra clave</label>
      <div><input id="assessmentKeyword" autocomplete="off" placeholder="Escribe tu respuesta…" required><button type="button" data-assessment-submit>Registrar hipótesis</button></div>
    </form>`;
  }
  const definitions = assessment.pairs.map((pair) => pair[1]).sort(() => .5 - Math.random());
  return `<form class="sa-matching-answer">${assessment.pairs.map(([concept]) => `
    <label><span>${escapeHtml(concept)}</span><select required><option value="">Selecciona…</option>${definitions.map((definition) => `<option value="${escapeHtml(definition)}">${escapeHtml(definition)}</option>`).join("")}</select></label>
  `).join("")}<button type="button" data-assessment-submit>Registrar relaciones</button></form>`;
}

function getAssessmentTypeLabel(type) {
  return {
    multiple: "Opción múltiple",
    matching: "Emparejamiento",
    keyword: "Palabra clave",
    "equation-build": "Construir ecuación",
    "fill-blank": "Completar espacio",
    "exponent-placement": "Colocar exponentes",
    "chemical-balance": "Balanceo químico",
    "numeric-answer": "Respuesta numérica",
    "graph-plot": "Graficar puntos",
    "sequence-order": "Ordenar procedimiento"
  }[type] || "Reto interactivo";
}

function calculateSimulatorMeasurement(activity, values) {
  const value = (id, fallback = 0) => Number(values[id] ?? fallback);
  const type = activity.simulationType;
  if (type === "friction") {
    return { value: (value("force") - value("friction")) / Math.max(.01, value("mass", 1)), unit: "m/s²", label: "Aceleración", formula: "a = (F - Fr) / m" };
  }
  if (type === "projectile") {
    const radians = value("angle", 45) * Math.PI / 180;
    return { value: (value("power", 1) ** 2 * Math.sin(2 * radians)) / Math.max(.01, value("gravity", 9.8)), unit: "m", label: "Alcance", formula: "R = v²·sen(2θ) / g" };
  }
  if (type === "circuit") return { value: value("voltage") / Math.max(.01, value("resistance", 1)), unit: "A", label: "Corriente", formula: "I = V / R" };
  if (type === "energy") return { value: value("mass") * value("gravity", 9.8) * value("height"), unit: "J", label: "Energía potencial", formula: "Ep = m·g·h" };
  if (type === "fluid") return { value: value("force") / Math.max(.01, value("area", 1)), unit: "Pa", label: "Presión relativa", formula: "P = F / A" };
  if (type === "wave") return { value: value("frequency") * value("wavelength") / 100, unit: "m/s", label: "Velocidad de onda", formula: "v = f·λ" };
  if (type === "optics") {
    const angle = Math.asin(Math.sin(value("angle") * Math.PI / 180) / Math.max(1, value("refractiveIndex", 1))) * 180 / Math.PI;
    return { value: angle, unit: "°", label: "Ángulo refractado", formula: "n₁·senθ₁ = n₂·senθ₂" };
  }
  if (type === "math") return { value: value("coefficient", 1) * value("x") + value("constant"), unit: "", label: "Resultado", formula: "y = m·x + b" };
  if (type === "particles") return { value: value("temperature") * value("particleCount") / 100, unit: "u", label: "Índice de agitación", formula: "A ∝ T·N" };
  if (type === "ecosystem") return { value: Math.sqrt(Math.max(0, value("sunlight") * value("water"))), unit: "%", label: "Equilibrio", formula: "E = √(luz·agua)" };
  if (type === "cell") return { value: (value("nutrients") + value("oxygen")) / 2, unit: "%", label: "ATP relativo", formula: "ATP ∝ (nutrientes + O₂) / 2" };
  return { value: Object.values(values).reduce((sum, item) => sum + Number(item || 0), 0), unit: "u", label: "Medición", formula: activity.simulator?.formula || "Relación experimental" };
}

function renderSimulatorContentEditor(editor) {
  const activity = state.activity;
  activity.simulator ||= {};
  editor.innerHTML = `
    <div data-editor-pane="objectives">
      <div class="sa-inspector-heading"><span>Modelo científico</span><i class="fas fa-square-root-variable"></i></div>
      <label class="sa-field"><span>Identificador del modelo</span><input id="simulatorModelId" value="${escapeHtml(activity.simulator.modelId || activity.simulationType)}"></label>
      <label class="sa-field"><span>Fórmula o relación</span><textarea id="simulatorFormula" rows="3">${escapeHtml(activity.simulator.formula || activity.scientificPrinciple)}</textarea></label>
      <label class="sa-field"><span>Objetivo opcional</span><textarea id="simulatorObjective" rows="3">${escapeHtml(activity.simulator.objective || "")}</textarea></label>
      <label class="sa-field"><span>Tolerancia</span><input id="simulatorTolerance" type="number" min="0" step="0.01" value="${Number(activity.simulator.tolerance ?? .1)}"></label>
    </div>
    <div data-editor-pane="questions">
      <div class="sa-inspector-heading"><span>Variables y rangos</span><i class="fas fa-sliders"></i></div>
      <div class="sa-simulator-variable-editor">${(activity.controls || []).map((control, index) => `
        <article>
          <input data-sim-control="${index}" data-key="label" value="${escapeHtml(control.label)}" aria-label="Nombre de variable">
          <div><input data-sim-control="${index}" data-key="min" type="number" value="${control.min}"><input data-sim-control="${index}" data-key="max" type="number" value="${control.max}"><input data-sim-control="${index}" data-key="step" type="number" value="${control.step}"></div>
          <input data-sim-control="${index}" data-key="unit" value="${escapeHtml(control.unit)}" aria-label="Unidad">
        </article>`).join("")}</div>
    </div>`;
  initializeInspectorTabs();
  editor.oninput = (event) => {
    if (event.target.id === "simulatorModelId") activity.simulator.modelId = event.target.value;
    if (event.target.id === "simulatorFormula") activity.simulator.formula = event.target.value;
    if (event.target.id === "simulatorObjective") activity.simulator.objective = event.target.value;
    if (event.target.id === "simulatorTolerance") activity.simulator.tolerance = Math.max(0, Number(event.target.value) || 0);
    if (event.target.matches("[data-sim-control]")) {
      const control = activity.controls[Number(event.target.dataset.simControl)];
      const key = event.target.dataset.key;
      control[key] = ["min", "max", "step"].includes(key) ? Number(event.target.value) : event.target.value;
    }
  };
}

function mountSimulatorFlow(activity) {
  const frame = $(".sa-game-frame");
  frame.querySelectorAll(".sa-assessment-layer,.sa-scene-outcome,.sa-scene-check,.sa-mode-toggle,.sa-game-footer,.sa-simulator-shell").forEach((element) => element.remove());
  frame.classList.add("is-simulator");
  $("#scienceGameControls").classList.add("sa-game-controls-hidden");
  const shell = document.createElement("section");
  shell.className = "sa-simulator-shell";
  const savedValues = activity.simulator?.values || {};
  const values = Object.fromEntries((activity.controls || []).map((control) => [control.id, Number(savedValues[control.id] ?? control.value)]));
  shell.innerHTML = `
    <header><div><small>SIMULADOR CIENTÍFICO</small><h2>${escapeHtml(activity.title)}</h2><p>${escapeHtml(activity.simulator?.objective || activity.mission)}</p></div>
      <span class="sa-simulator-model">${escapeHtml(activity.simulator?.modelId || activity.simulationType)}</span></header>
    <div class="sa-simulator-workbench">
      <div class="sa-simulator-visual"><div class="sa-simulator-orbit"><i></i><b></b></div></div>
      <aside><small>MEDICIÓN EN TIEMPO REAL</small><strong data-sim-reading>0</strong><span data-sim-label>Medición</span><code data-sim-formula>${escapeHtml(activity.simulator?.formula || "")}</code></aside>
    </div>
    <div class="sa-simulator-controls">${(activity.controls || []).map((control) => `
      <label><span>${escapeHtml(control.label)} <strong data-sim-value="${escapeHtml(control.id)}">${values[control.id]} ${escapeHtml(control.unit)}</strong></span>
        <input type="range" data-sim-input="${escapeHtml(control.id)}" min="${control.min}" max="${control.max}" step="${control.step}" value="${values[control.id]}"></label>`).join("")}</div>
    <footer><button type="button" data-sim-run><i class="fas fa-play"></i> Ejecutar</button><button type="button" data-sim-pause><i class="fas fa-pause"></i> Pausar</button><button type="button" data-sim-reset><i class="fas fa-rotate-left"></i> Restablecer valores iniciales</button></footer>`;
  frame.append(shell);
  let running = false;
  let raf = 0;
  const renderMeasurement = () => {
    const measurement = calculateSimulatorMeasurement(activity, values);
    shell.querySelector("[data-sim-reading]").textContent = `${Number(measurement.value).toFixed(2)} ${measurement.unit}`.trim();
    shell.querySelector("[data-sim-label]").textContent = measurement.label;
    shell.querySelector("[data-sim-formula]").textContent = measurement.formula;
    shell.style.setProperty("--sa-sim-level", `${Math.max(8, Math.min(96, Math.abs(Number(measurement.value)) % 100))}%`);
    if (running) raf = requestAnimationFrame(renderMeasurement);
  };
  shell.addEventListener("input", (event) => {
    const id = event.target.dataset.simInput;
    if (!id) return;
    values[id] = Number(event.target.value);
    const control = activity.controls.find((item) => item.id === id);
    shell.querySelector(`[data-sim-value="${CSS.escape(id)}"]`).textContent = `${values[id]} ${control?.unit || ""}`.trim();
    activity.simulator.values = { ...values };
    persistLocalDraft();
    renderMeasurement();
  });
  shell.addEventListener("click", (event) => {
    if (event.target.closest("[data-sim-run]")) {
      running = true;
      shell.classList.add("is-running");
      cancelAnimationFrame(raf);
      renderMeasurement();
    }
    if (event.target.closest("[data-sim-pause]")) {
      running = false;
      shell.classList.remove("is-running");
      cancelAnimationFrame(raf);
    }
    if (event.target.closest("[data-sim-reset]")) {
      (activity.controls || []).forEach((control) => {
        values[control.id] = Number(control.value);
        const input = shell.querySelector(`[data-sim-input="${CSS.escape(control.id)}"]`);
        if (input) input.value = String(control.value);
        const output = shell.querySelector(`[data-sim-value="${CSS.escape(control.id)}"]`);
        if (output) output.textContent = `${control.value} ${control.unit}`.trim();
      });
      activity.simulator.values = {};
      persistLocalDraft();
      renderMeasurement();
    }
  });
  renderMeasurement();
}

function mountAssessmentFlow(activity) {
  if (activity.gameMode === "simulator") {
    mountSimulatorFlow(activity);
    return;
  }
  const frame = $(".sa-game-frame");
  frame.classList.remove("is-level-briefing");
  frame.classList.remove("is-simulator");
  frame.querySelector(".sa-assessment-layer")?.remove();
  frame.querySelector(".sa-scene-outcome")?.remove();
  frame.querySelector(".sa-scene-check")?.remove();
  state.assessmentController?.dispose?.();
  frame.querySelector(".sa-mode-toggle")?.remove();
  frame.querySelectorAll(".sa-game-footer").forEach((element) => element.remove());
  frame.querySelector(".sa-simulator-shell")?.remove();
  frame.classList.remove("sa-result-correct", "sa-result-incorrect", "sa-experiment-active");
  frame.dataset.simulationType = activity.simulationType || "friction";
  frame.style.setProperty("--sa-game-sky", activity.scenario?.sky || "#dff4ff");
  frame.style.setProperty("--sa-game-ground", activity.scenario?.ground || "#8fd5c8");
  frame.style.setProperty("--sa-game-accent", activity.scenario?.accent || "#ff7d68");
  const controls = $("#scienceGameControls");
  controls.classList.add("sa-game-controls-hidden");

  const isLabMode = false;
  const totalLevels = Math.max(1, Math.floor(Number(activity.levelCount || 3)));
  const questionsPerLevel = isLabMode ? 1 : Math.max(1, Math.floor(Number(activity.questionsPerLevel || 3)));
  const progress = state.editorReviewProgress || createReviewProgressState();
  progress.briefedLevels ||= [];
  progress.score = Math.max(0, Number(progress.score) || 0);
  progress.levelScore = Math.max(0, Number(progress.levelScore) || 0);
  progress.streak = Math.max(0, Number(progress.streak) || 0);
  progress.bestStreak = Math.max(progress.streak, Number(progress.bestStreak) || 0);
  progress.scoredQuestions ||= {};
  state.editorReviewProgress = progress;
  const questionOffset = ((progress.level - 1) * questionsPerLevel) + progress.question - 1;
  const session = {
    phase: "question",
    answeredCorrectly: false,
    assessment: buildAssessment(activity, questionOffset),
    retries: 0,
    questionScore: 0,
    scoreAwarded: false,
    scoreBreakdown: [],
    runId: 0,
    transitionLocked: false
  };
  state.assessmentSession = session;
  const invalidateQuestionRun = () => {
    session.runId += 1;
    state.gameInstance?.cancelQuestionGame?.();
    return session.runId;
  };

  const layer = document.createElement("section");
  layer.className = "sa-assessment-layer";
  layer.setAttribute("aria-live", "polite");
  const sceneOutcome = document.createElement("div");
  sceneOutcome.className = "sa-scene-outcome";
  const sceneCheck = document.createElement("button");
  sceneCheck.className = "sa-scene-check";
  sceneCheck.type = "button";
  sceneCheck.innerHTML = "<i class=\"fas fa-flask-vial\"></i><span>Comprobar</span>";
  const modeToggle = document.createElement("button");
  modeToggle.className = "sa-mode-toggle";
  modeToggle.type = "button";
  modeToggle.innerHTML = "<i class=\"fas fa-sliders\"></i><span>Modo libre</span>";
  modeToggle.hidden = true;
  frame.append(sceneOutcome, layer, sceneCheck, modeToggle);

  const setResultSurface = (active) => {
    frame.classList.toggle("is-assessment-result", Boolean(active));
  };

  const formatScore = (value) => Math.max(0, Number(value) || 0).toLocaleString("es-MX");

  const createResultShareImage = ({ title, rank, score, accuracy, stars }) => new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 630;
    const context = canvas.getContext("2d");
    if (!context) {
      reject(new Error("No fue posible preparar la imagen del resultado."));
      return;
    }
    const wrap = (text, x, y, maxWidth, lineHeight) => {
      const words = String(text).split(/\s+/);
      let line = "";
      let lineY = y;
      words.forEach((word) => {
        const candidate = line ? `${line} ${word}` : word;
        if (context.measureText(candidate).width > maxWidth && line) {
          context.fillText(line, x, lineY);
          line = word;
          lineY += lineHeight;
        } else line = candidate;
      });
      if (line) context.fillText(line, x, lineY);
      return lineY;
    };
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#061c27");
    gradient.addColorStop(.52, "#0c3541");
    gradient.addColorStop(1, "#143154");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(94, 227, 196, .14)";
    context.beginPath(); context.arc(1060, 88, 180, 0, Math.PI * 2); context.fill();
    context.fillStyle = "rgba(92, 209, 255, .15)";
    context.beginPath(); context.arc(112, 560, 210, 0, Math.PI * 2); context.fill();
    context.strokeStyle = "rgba(93, 227, 199, .72)";
    context.lineWidth = 3;
    context.strokeRect(42, 42, 1116, 546);
    context.fillStyle = "#58ddc3";
    context.font = "700 27px system-ui, sans-serif";
    context.fillText("SCIENCE ACTIVITIES · RESULTADO", 86, 112);
    context.fillStyle = "#f5fcff";
    context.font = "800 66px system-ui, sans-serif";
    const titleBottom = wrap(title, 86, 205, 850, 78);
    context.fillStyle = "#bbd2d9";
    context.font = "600 31px system-ui, sans-serif";
    context.fillText(`Rango científico · ${rank}`, 86, titleBottom + 70);
    context.fillStyle = "#ffe875";
    context.font = "800 56px system-ui, sans-serif";
    context.fillText("★".repeat(stars), 88, 504);
    context.fillStyle = "#ffffff";
    context.font = "800 42px system-ui, sans-serif";
    context.fillText(`${score} pts`, 825, 438);
    context.fillStyle = "#83f1dc";
    context.font = "700 31px system-ui, sans-serif";
    context.fillText(`${accuracy}% precisión`, 825, 488);
    context.fillStyle = "#9db8c3";
    context.font = "600 22px system-ui, sans-serif";
    context.fillText("Aprender, comprobar y compartir.", 86, 555);
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No fue posible crear la captura.")), "image/png");
  });

  const shareLevelResult = async (button) => {
    if (button?.disabled) return;
    const shareTitle = activity.title || "Misión científica";
    const completionTitle = layer.querySelector(".sa-level-complete-card h2")?.textContent?.trim() || "Resultado científico";
    const accuracy = Math.round((progress.correctAnswers / Math.max(1, progress.completedQuestions)) * 100);
    const rank = accuracy >= 90 ? "Investigador élite" : accuracy >= 75 ? "Analista científico" : accuracy >= 60 ? "Explorador de laboratorio" : "Aprendiz científico";
    const stars = accuracy >= 90 ? 3 : accuracy >= 70 ? 2 : 1;
    const originalMarkup = button.innerHTML;
    try {
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparando captura…';
      const blob = await createResultShareImage({ title: shareTitle, rank, score: formatScore(progress.score), accuracy, stars });
      const file = new File([blob], "resultado-science-activities.png", { type: "image/png" });
      const message = `¡${completionTitle}! Alcancé ${formatScore(progress.score)} puntos y ${accuracy}% de precisión en ${shareTitle}.`;
      const shareData = { title: shareTitle, text: message, files: [file] };
      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData);
      } else {
        const download = document.createElement("a");
        download.href = URL.createObjectURL(blob);
        download.download = file.name;
        download.click();
        window.setTimeout(() => URL.revokeObjectURL(download.href), 1500);
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(message).catch(() => {});
        showToast("Captura descargada y texto copiado para compartir.");
      }
    } catch (error) {
      if (error?.name !== "AbortError") showToast(error?.message || "No fue posible preparar la captura.");
    } finally {
      button.disabled = false;
      button.innerHTML = originalMarkup;
    }
  };

  const calculateQuestionScore = () => {
    if (session.scoreAwarded) return session.questionScore;
    session.scoreAwarded = true;
    session.questionScore = 0;
    session.scoreBreakdown = [];

    if (!session.answeredCorrectly) {
      progress.streak = 0;
      return 0;
    }

    const questionKey = `${progress.level}:${progress.question}`;
    if (progress.scoredQuestions[questionKey]) {
      session.scoreBreakdown.push("Puntuación ya registrada");
      return 0;
    }

    const runtimeAttempts = Math.max(1, Number(session.gameResult?.attempts) || 1);
    const durationMs = Math.max(0, Number(session.gameResult?.durationMs) || 0);
    const firstAttempt = session.retries === 0 && runtimeAttempts === 1;
    const basePoints = isLabMode ? 150 : 100;
    const firstAttemptBonus = firstAttempt ? 50 : 0;
    const speedBonus = durationMs > 0 && durationMs <= 30000 ? 30 : durationMs > 0 && durationMs <= 60000 ? 15 : 0;

    progress.streak += 1;
    progress.bestStreak = Math.max(progress.bestStreak, progress.streak);
    const streakBonus = Math.min(100, Math.max(0, progress.streak - 1) * 20);
    session.questionScore = basePoints + firstAttemptBonus + speedBonus + streakBonus;
    progress.score += session.questionScore;
    progress.levelScore += session.questionScore;
    progress.scoredQuestions[questionKey] = session.questionScore;
    session.scoreBreakdown = [
      `Base +${basePoints}`,
      firstAttemptBonus ? `Primer intento +${firstAttemptBonus}` : "",
      speedBonus ? `Rapidez +${speedBonus}` : "",
      streakBonus ? `Racha +${streakBonus}` : ""
    ].filter(Boolean);
    return session.questionScore;
  };

  const progressMarkup = () => {
    const percentage = Math.round(((progress.question - 1) / questionsPerLevel) * 100);
    return `<div class="sa-level-progress">
      <div><strong>Nivel ${progress.level} de ${totalLevels}</strong><span>${isLabMode ? "Práctica experimental" : `Pregunta ${progress.question} de ${questionsPerLevel}`}</span></div>
      <i><span style="width:${percentage}%"></span></i>
    </div>`;
  };

  const setControlsEnabled = (enabled) => {
    controls.querySelectorAll("button, input, select").forEach((control) => {
      control.disabled = !enabled;
    });
  };

  const applyAnswerPreset = (answerSeed, correct) => {
    const seed = Math.max(1, Number(answerSeed) || 1);
    controls.querySelectorAll('input[type="range"]').forEach((input, index) => {
      const minimum = Number(input.min || 0);
      const maximum = Number(input.max || 100);
      const steps = 9;
      const position = ((seed * (index + 3)) + (index * 2)) % steps;
      const ratio = correct ? .72 + (position / steps) * .22 : .08 + (position / steps) * .22;
      input.value = String(minimum + ((maximum - minimum) * ratio));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };

  const renderAccessibleQuestion = () => {
    setResultSurface(false);
    frame.classList.remove("is-level-briefing");
    const assessment = session.assessment;
    session.phase = "question";
    layer.className = "sa-assessment-layer";
    layer.innerHTML = `
      <div class="sa-question-world" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="sa-question-card" data-question-type="${assessment.type}">
        <div class="sa-question-badge"><i class="fas ${SIMULATION_ICONS[activity.simulationType] || "fa-flask"}"></i> Pregunta ${progress.question}</div>
        ${progressMarkup()}
        <small>${getAssessmentTypeLabel(assessment.type)}</small>
        ${assessmentLearningContextMarkup(assessment)}
        <h2>${escapeHtml(limitLearningText(assessment.prompt, 24, 175))}</h2>
        <p>Elige tu hipótesis.</p>
        ${assessmentQuestionMarkup(assessment)}
      </div>`;
    setControlsEnabled(false);
    sceneCheck.classList.remove("show");
  };

  const prepareQuestion = () => {
    session.transitionLocked = false;
    const currentQuestionOffset = ((progress.level - 1) * questionsPerLevel) + progress.question - 1;
    session.assessment = buildAssessment(activity, currentQuestionOffset);
    state.contentQuestionIndex = currentQuestionOffset;
    renderContentEditor();
    document.querySelector('[data-inspector-tab="questions"]')?.click();
    return session.assessment;
  };

  const renderQuestion = () => {
    setResultSurface(false);
    frame.classList.remove("is-level-briefing");
    const assessment = prepareQuestion();
    session.phase = "question-intro";
    layer.className = "sa-assessment-layer";
    layer.innerHTML = `
      <div class="sa-question-world" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="sa-question-card sa-question-launch" data-question-type="${assessment.type}">
        <div class="sa-question-badge"><i class="fas ${SIMULATION_ICONS[activity.simulationType] || "fa-flask"}"></i> Pregunta ${progress.question}</div>
        ${progressMarkup()}
        <small>${getAssessmentTypeLabel(assessment.type)}</small>
        <h2>${escapeHtml(limitLearningText(assessment.prompt, 24, 175))}</h2>
        <button class="sa-start-level" type="button" data-assessment-enter-game>Jugar ahora <i class="fas fa-arrow-right"></i></button>
      </div>`;
    frame.classList.remove("sa-result-correct", "sa-result-incorrect", "sa-experiment-active", "sa-experiment-success", "sa-experiment-failed");
    sceneCheck.classList.remove("show");
    setControlsEnabled(false);
  };

  const navigateFromEditor = (event) => {
    if (!frame.isConnected) return;
    invalidateQuestionRun();
    const questionIndex = Math.max(0, Math.min(
      Number(event.detail?.index || 0),
      Math.max(0, totalLevels * questionsPerLevel - 1)
    ));
    progress.level = Math.floor(questionIndex / questionsPerLevel) + 1;
    progress.question = (questionIndex % questionsPerLevel) + 1;
    session.assessment = null;
    session.phase = "question-intro";
    renderQuestion();
    frame.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  if (window.__scienceActivitiesQuestionNavigator) {
    window.removeEventListener("scienceactivities:select-question", window.__scienceActivitiesQuestionNavigator);
  }
  window.__scienceActivitiesQuestionNavigator = navigateFromEditor;
  window.addEventListener("scienceactivities:select-question", navigateFromEditor);
  const assessmentController = {
    openQuestion(index = 0) {
      navigateFromEditor({ detail: { index } });
      return frame.isConnected;
    },
    continue() {
      const button = layer.querySelector("[data-assessment-continue]");
      if (!button || session.transitionLocked) return false;
      button.click();
      return true;
    },
    retry() {
      const button = layer.querySelector("[data-assessment-retry]");
      if (!button || session.transitionLocked) return false;
      button.click();
      return true;
    },
    async answerCorrectly() {
      const enterButton = layer.querySelector("[data-assessment-enter-game]");
      if (enterButton && !session.transitionLocked) enterButton.click();
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const activeExercise = frame.querySelector(".science-structured-game");
        if (activeExercise) {
          const detail = { handled: false };
          activeExercise.dispatchEvent(new CustomEvent("scienceactivities:review-correct-answer", { detail }));
          if (detail.handled) {
            if (session.assessment?.type === "graph-plot") {
              const graph = activeExercise.querySelector("[data-graph]");
              const axes = session.assessment.axes || { xMin: -5, xMax: 5, yMin: -5, yMax: 5 };
              const xMin = Number(axes.xMin ?? -5);
              const xMax = Number(axes.xMax ?? 5);
              const yMin = Number(axes.yMin ?? -5);
              const yMax = Number(axes.yMax ?? 5);
              const targets = (session.assessment.targetPoints || []).map((point) => ({ x: Number(point.x), y: Number(point.y) }));
              if (graph && xMax > xMin && yMax > yMin) {
                graph.querySelectorAll(".science-graph-point").forEach((marker) => marker.remove());
                targets.forEach((point, index) => {
                  const marker = document.createElement("i");
                  marker.className = "science-graph-point";
                  marker.style.left = `${(point.x - xMin) / (xMax - xMin) * 100}%`;
                  marker.style.top = `${(yMax - point.y) / (yMax - yMin) * 100}%`;
                  marker.dataset.pointIndex = String(index);
                  marker.dataset.coordinate = `(${point.x}, ${point.y})`;
                  marker.setAttribute("aria-hidden", "true");
                  graph.append(marker);
                });
                const coordinate = graph.querySelector("[data-graph-coordinate]");
                if (coordinate) coordinate.textContent = targets.map((point) => `(${point.x}, ${point.y})`).join(" · ");
              }
            }
            return true;
          }
        }
        if (!activeExercise && state.gameInstance?.reviewCorrectAnswer?.()) return true;
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      return false;
    },
    dispose() {
      invalidateQuestionRun();
      window.removeEventListener("scienceactivities:select-question", navigateFromEditor);
      if (window.__scienceActivitiesQuestionNavigator === navigateFromEditor) {
        window.__scienceActivitiesQuestionNavigator = null;
      }
      if (state.assessmentController === assessmentController) {
        state.assessmentController = null;
      }
    }
  };
  state.assessmentController = assessmentController;

  const startQuestionGame = () => {
    setResultSurface(false);
    frame.classList.remove("is-level-briefing");
    window.ScienceRiveHud?.destroyAll(layer);
    const assessment = session.assessment;
    if (!assessment) {
      renderQuestion();
      return;
    }
    const runId = invalidateQuestionRun();
    session.phase = "experiment";
    layer.className = "sa-assessment-layer is-hidden";
    frame.classList.remove("sa-result-correct", "sa-result-incorrect", "sa-experiment-success", "sa-experiment-failed");
    frame.classList.add("sa-experiment-active");
    setControlsEnabled(false);
    const run = state.gameInstance?.playQuestionGame?.({
      assessment,
      profile: assessment.gameplay || assessment.animation || {},
      gameplay: assessment.gameplay || {},
      subject: activity.subject,
      topic: activity.topic,
      simulationType: activity.simulationType,
      difficulty: activity.difficulty,
      controls: activity.controls
    });
    if (!run) {
      session.phase = "question";
      frame.classList.remove("sa-experiment-active");
      renderAccessibleQuestion();
      return;
    }
    Promise.resolve(run).then((result) => {
      if (result?.cancelled || session.phase !== "experiment" || session.runId !== runId) return;
      session.answeredCorrectly = Boolean(result?.correct);
      session.gameResult = result;
      revealResult();
    }).catch((error) => {
      if (session.runId !== runId) return;
      console.error("[ScienceActivities] Question game failed:", error);
      session.phase = "question";
      frame.classList.remove("sa-experiment-active");
      renderAccessibleQuestion();
    });
  };

  const renderLevelBriefing = () => {
    setResultSurface(false);
    session.transitionLocked = false;
    if (progress.briefedLevels.includes(progress.level)) {
      if (isLabMode) beginLabPractice();
      else {
        prepareQuestion();
        startQuestionGame();
      }
      return;
    }
    const guide = activity.learningGuide || buildFallbackLearningGuide(activity);
    const level = guide.levels?.[progress.level - 1] || buildFallbackLearningGuide(activity).levels[0];
    const levelImageSource = resolveLearningGuideImageSource(level);
    const imageMarkup = levelImageSource
      ? `<img class="sa-level-hero" src="${escapeHtml(levelImageSource)}" alt="Ilustración de ${escapeHtml(level.title)}">`
      : `<div class="sa-level-hero sa-level-hero-fallback"><i class="fas fa-atom"></i><span>${escapeHtml(activity.topic)}</span></div>`;
    const concepts = (level.concepts || []).filter((concept) => concept?.term && concept?.definition).slice(0, 2);
    const generatedExample = level?.example && typeof level.example === "object" ? level.example : null;
    const practicalExample = generatedExample?.text
      || [generatedExample?.situation, generatedExample?.result].filter(Boolean).join(" ")
      || (typeof level?.example === "string" ? level.example : "");
    const exampleFormula = String(generatedExample?.formula || "").trim();
    const exampleGuidance = String(generatedExample?.explanation || "").trim();
    const exampleMarkup = practicalExample ? `
          <div class="science-micro-example">
            <span>
              <small>${escapeHtml(generatedExample?.title || "Ejemplo aplicado")}</small>
              <strong>${escapeHtml(practicalExample)}</strong>
              ${exampleFormula ? `<em class="science-micro-formula"><b>Aplicado a este caso</b><code>${escapeHtml(exampleFormula)}</code></em>` : ""}
              ${exampleGuidance ? `<p class="science-micro-example-guidance">${escapeHtml(exampleGuidance)}</p>` : ""}
            </span>
          </div>` : "";
    session.phase = "briefing";
    frame.classList.add("is-level-briefing");
    layer.className = "sa-assessment-layer sa-briefing-layer";
    layer.innerHTML = `
      <article class="science-rive-briefing-screen science-micro-mission">
        <div class="science-micro-visual">
          ${imageMarkup}
          <div class="science-rive-hud science-rive-visual" data-science-rive-hud data-rive-role="briefing" data-rive-artboard="New Artboard" data-rive-state-machine="State Machine 1" data-rive-fit="contain" data-rive-level="${progress.level}" data-rive-progress="${Math.max(0, Math.min(1, (progress.question - 1) / questionsPerLevel))}" aria-hidden="true"><canvas></canvas></div>
          <div class="science-micro-level"><span>Nivel ${progress.level}</span><strong>${escapeHtml(limitLearningText(level.title, 7, 56))}</strong></div>
        </div>
        <div class="science-micro-content">
          ${progressMarkup()}
          <div class="science-micro-kicker"><span>Micro-misión</span><b>${progress.question}/${questionsPerLevel}</b></div>
          <h2>${escapeHtml(limitLearningText(level.objective || activity.mission, 13, 96))}</h2>
          <div class="science-micro-concepts">
            ${concepts.map((concept, index) => `
              <div class="science-micro-concept">
                <span>0${index + 1}</span>
                <p><strong>${escapeHtml(limitLearningText(concept.term, 4, 38))}</strong>${escapeHtml(limitLearningText(concept.definition, 16, 112))}</p>
              </div>
            `).join("")}
          </div>
          ${exampleMarkup}
          <button class="sa-start-level science-micro-launch" type="button" data-assessment-start-level><span>${isLabMode ? "Abrir práctica" : "Jugar pregunta 1"}</span><i class="fas fa-arrow-right" aria-hidden="true"></i></button>
        </div>
      </article>`;
    requestAnimationFrame(() => window.ScienceRiveHud?.mountAll(layer));
    setControlsEnabled(false);
    sceneCheck.classList.remove("show");
  };

  const beginLabPractice = () => {
    setResultSurface(false);
    frame.classList.remove("is-level-briefing");
    window.ScienceRiveHud?.destroyAll(layer);
    session.phase = "lab";
    session.answeredCorrectly = false;
    layer.classList.add("is-hidden");
    controls.classList.remove("sa-game-controls-hidden");
    setControlsEnabled(true);
    sceneOutcome.classList.remove("show");
    sceneCheck.disabled = false;
    sceneCheck.innerHTML = "<i class=\"fas fa-flask-vial\"></i><span>Comprobar práctica</span>";
    sceneCheck.classList.add("show");
    frame.classList.remove("sa-result-correct", "sa-result-incorrect", "sa-experiment-success", "sa-experiment-failed");
  };

  const validateLabPractice = () => {
    if (session.phase !== "lab") return;
    const target = Number(activity.challenge?.targetValue ?? 50);
    const tolerance = Math.max(0, Number(activity.challenge?.tolerance ?? 5));
    const ranges = [...controls.querySelectorAll('input[type="range"]')];
    const normalizedTargetLabel = normalizeAnswer(activity.challenge?.targetLabel);
    const targetControlIndex = (activity.controls || []).findIndex((control) => {
      const label = normalizeAnswer(control.label);
      return label === normalizedTargetLabel || label.includes(normalizedTargetLabel) || normalizedTargetLabel.includes(label);
    });
    const testedRange = ranges[targetControlIndex] || ranges.find((input) => target >= Number(input.min) && target <= Number(input.max)) || ranges[0];
    const testedValue = Number(testedRange?.value ?? Number.NaN);
    session.answeredCorrectly = Number.isFinite(testedValue) && Math.abs(testedValue - target) <= tolerance;
    session.phase = "lab-running";
    sceneCheck.disabled = true;
    sceneCheck.classList.remove("show");
    controls.querySelector(".science-action:not(.secondary)")?.click();
    frame.classList.add("sa-experiment-active");
    window.setTimeout(() => {
      session.phase = "experiment";
      frame.classList.add(session.answeredCorrectly ? "sa-experiment-success" : "sa-experiment-failed");
      revealResult();
    }, 1400);
  };

  const beginExperiment = (correct, answerSeed = 1) => {
    const runId = invalidateQuestionRun();
    session.answeredCorrectly = correct;
    session.phase = "experiment";
    applyAnswerPreset(answerSeed, correct);
    layer.classList.add("is-hidden");
    frame.classList.remove("sa-experiment-success", "sa-experiment-failed");
    frame.classList.add("sa-experiment-active");
    sceneOutcome.classList.remove("show");
    sceneCheck.classList.remove("show");
    setControlsEnabled(false);
    window.setTimeout(() => {
      if (session.runId === runId && session.phase === "experiment") revealResult();
    }, 260);
  };

  const revealResult = () => {
    if (session.phase !== "experiment") return;
    calculateQuestionScore();
    const labFeedback = session.answeredCorrectly
      ? `La práctica alcanzó ${activity.challenge?.targetLabel || "el objetivo experimental"} dentro de la tolerancia permitida.`
      : `La prueba quedó fuera del objetivo. Ajusta las variables para aproximarte a ${activity.challenge?.targetValue ?? "el valor indicado"} ± ${activity.challenge?.tolerance ?? 5}.`;
    session.phase = "result";
    sceneOutcome.classList.remove("show");
    sceneCheck.classList.remove("show");
    frame.classList.remove("sa-experiment-active", "sa-experiment-success", "sa-experiment-failed");
    frame.classList.add(session.answeredCorrectly ? "sa-result-correct" : "sa-result-incorrect");
    setResultSurface(true);
    layer.className = `sa-assessment-layer is-result ${session.answeredCorrectly ? "is-correct" : "is-incorrect"}`;
    layer.innerHTML = `
      <article class="science-rive-result-screen" role="dialog" aria-modal="true" aria-labelledby="scienceResultTitle" tabindex="-1">
        <div class="science-rive-result-content">
          ${progressMarkup()}
          <small>${isLabMode ? (session.answeredCorrectly ? "Práctica correcta" : "Práctica por corregir") : (session.answeredCorrectly ? "Hipótesis confirmada" : "Hipótesis por revisar")}</small>
          <h2 id="scienceResultTitle">${isLabMode ? (session.answeredCorrectly ? "¡Procedimiento validado!" : "La configuración no alcanzó el objetivo") : (session.answeredCorrectly ? "¡La evidencia coincide!" : "El experimento mostró otra relación")}</h2>
          <p>${escapeHtml(limitLearningText(isLabMode ? labFeedback : (session.assessment.feedback || "Observa las variables, cambia una a la vez y vuelve a probar."), 24, 165))}</p>
          <div class="science-rive-result-proof ${session.answeredCorrectly ? "is-positive" : "is-zero"}">
            <i class="fas ${session.answeredCorrectly ? "fa-bolt" : "fa-rotate-left"}"></i>
            <span><small>${session.answeredCorrectly ? "Puntos obtenidos" : "Racha reiniciada"}</small><strong>${session.answeredCorrectly ? `+${formatScore(session.questionScore)}` : "0 puntos"}</strong></span>
            <em>${escapeHtml(session.scoreBreakdown.join(" · ") || (session.answeredCorrectly ? "Acierto confirmado" : "Reintenta para sumar puntos"))}</em>
          </div>
          <div class="sa-result-actions science-rive-result-actions">
          <button type="button" data-assessment-retry><i class="fas fa-rotate-left"></i> Reintentar</button>
          <button type="button" data-assessment-continue><i class="fas fa-arrow-right"></i> ${isLabMode ? "Concluir práctica" : (progress.question === questionsPerLevel ? "Concluir nivel" : "Siguiente pregunta")}</button>
          </div>
        </div>
      </article>`;
    requestAnimationFrame(() => {
      layer.querySelector(".science-rive-result-screen")?.focus({ preventScroll: true });
    });
  };

  const renderLevelConclusion = () => {
    session.transitionLocked = false;
    const isLastLevel = progress.level >= totalLevels;
    const totalQuestions = totalLevels * questionsPerLevel;
    const accuracy = Math.round((progress.correctAnswers / Math.max(1, progress.completedQuestions)) * 100);
    const rank = accuracy >= 90 ? "Investigador élite" : accuracy >= 75 ? "Analista científico" : accuracy >= 60 ? "Explorador de laboratorio" : "Aprendiz científico";
    const starCount = accuracy >= 90 ? 3 : accuracy >= 70 ? 2 : 1;
    session.phase = isLastLevel ? "game-complete" : "level-complete";
    frame.classList.remove("sa-result-correct", "sa-result-incorrect");
    frame.classList.add("sa-result-correct");
    setResultSurface(true);
    layer.className = "sa-assessment-layer is-result is-correct";
    layer.innerHTML = `
      <div class="sa-question-card sa-result-card sa-level-complete-card">
        <div class="sa-level-stars">${[1, 2, 3].map((star) => `<i class="fas fa-star ${star <= starCount ? "is-active" : ""}"></i>`).join("")}</div>
        <small>${isLastLevel ? "Juego concluido" : `Nivel ${progress.level} superado`}</small>
        <h2>${isLastLevel ? "¡Misión científica completada!" : (isLabMode ? "Práctica de laboratorio completada" : "Todas las preguntas fueron experimentadas")}</h2>
        <p>${isLastLevel
          ? (isLabMode ? `Completaste ${totalLevels} prácticas y validaste ${progress.correctAnswers} procedimientos.` : `Completaste ${totalQuestions} preguntas y confirmaste ${progress.correctAnswers} hipótesis.`)
          : (isLabMode ? "Concluiste la práctica. El siguiente nivel presenta un nuevo procedimiento experimental." : `Concluiste las ${questionsPerLevel} preguntas del nivel. El siguiente nivel tendrá nuevas formas de responder y experimentar.`)}</p>
        <div class="sa-score-summary">
          <div><small>Score total</small><strong>${formatScore(progress.score)}</strong></div>
          <div><small>Puntos del nivel</small><strong>${formatScore(progress.levelScore)}</strong></div>
          <div><small>Precisión</small><strong>${accuracy}%</strong></div>
          <div><small>Mejor racha</small><strong>${progress.bestStreak}</strong></div>
        </div>
        <div class="sa-player-rank"><i class="fas fa-medal"></i><span><small>Rango científico</small><strong>${rank}</strong></span></div>
        <div class="sa-result-actions">
          <button class="sa-share-result" type="button" data-assessment-share-result><i class="fas fa-share-nodes"></i> Compartir resultado</button>
          <button type="button" ${isLastLevel ? "data-assessment-restart-game" : "data-assessment-next-level"}>
            <i class="fas ${isLastLevel ? "fa-rotate" : "fa-flag-checkered"}"></i>
            ${isLastLevel ? "Jugar de nuevo" : `Comenzar nivel ${progress.level + 1}`}
          </button>
        </div>
      </div>`;
  };

  const submitAssessmentForm = (form) => {
    if (session.phase !== "question" || !form || !form.reportValidity()) return;
    if (session.assessment.type === "keyword") {
      const value = normalizeAnswer(form.querySelector("input").value);
      beginExperiment(
        session.assessment.accepted.some((answer) => normalizeAnswer(answer) === value),
        assessmentHash(value)
      );
      return;
    }
    const selections = [...form.querySelectorAll("select")].map((select) => select.value);
    if (selections.some((selection) => !selection)) return;
    beginExperiment(
      selections.every((selection, index) => selection === session.assessment.pairs[index][1]),
      assessmentHash(selections.join("|"))
    );
  };

  layer.addEventListener("click", (event) => {
    const submitButton = event.target.closest("[data-assessment-submit]");
    if (submitButton) {
      event.preventDefault();
      submitAssessmentForm(submitButton.closest("form"));
      return;
    }
    if (event.target.closest("[data-assessment-start-level]")) {
      progress.briefedLevels.push(progress.level);
      if (isLabMode) beginLabPractice();
      else {
        prepareQuestion();
        startQuestionGame();
      }
      return;
    }
    if (event.target.closest("[data-assessment-enter-game]") && session.phase === "question-intro") {
      startQuestionGame();
      return;
    }
    const answer = event.target.closest("[data-assessment-answer]");
    if (answer && session.phase === "question") {
      const answerIndex = Number(answer.dataset.assessmentAnswer);
      beginExperiment(answerIndex === session.assessment.correct, answerIndex + 1);
      return;
    }
    if (event.target.closest("[data-assessment-retry]")) {
      if (session.transitionLocked) return;
      session.transitionLocked = true;
      invalidateQuestionRun();
      session.retries += 1;
      session.scoreAwarded = false;
      session.questionScore = 0;
      session.scoreBreakdown = [];
      session.gameResult = null;
      state.gameInstance?.reset?.();
      if (isLabMode) beginLabPractice();
      else {
        prepareQuestion();
        startQuestionGame();
      }
      sceneOutcome.classList.remove("show");
      frame.classList.remove("sa-result-correct", "sa-result-incorrect", "sa-experiment-success", "sa-experiment-failed");
      return;
    }
    if (event.target.closest("[data-assessment-continue]")) {
      if (session.transitionLocked) return;
      session.transitionLocked = true;
      invalidateQuestionRun();
      progress.completedQuestions += 1;
      if (session.answeredCorrectly) progress.correctAnswers += 1;
      state.gameInstance?.reset?.();
      if (isLabMode || progress.question >= questionsPerLevel) renderLevelConclusion();
      else {
        progress.question += 1;
        prepareQuestion();
        startQuestionGame();
      }
      return;
    }
    const shareButton = event.target.closest("[data-assessment-share-result]");
    if (shareButton) {
      shareLevelResult(shareButton);
      return;
    }
    if (event.target.closest("[data-assessment-next-level]")) {
      if (session.transitionLocked) return;
      session.transitionLocked = true;
      invalidateQuestionRun();
      progress.level += 1;
      progress.question = 1;
      progress.levelScore = 0;
      session.assessment = null;
      session.phase = "briefing";
      session.answeredCorrectly = false;
      session.retries = 0;
      session.questionScore = 0;
      session.scoreAwarded = false;
      session.scoreBreakdown = [];
      session.gameResult = null;
      state.gameInstance?.reset?.();
      state.contentQuestionIndex = (progress.level - 1) * questionsPerLevel;
      renderContentEditor();
      session.transitionLocked = false;
      renderLevelBriefing();
      return;
    }
    if (event.target.closest("[data-assessment-restart-game]")) {
      invalidateQuestionRun();
      state.editorReviewProgress = {
        level: 1,
        question: 1,
        correctAnswers: 0,
        completedQuestions: 0,
        briefedLevels: [],
        score: 0,
        levelScore: 0,
        streak: 0,
        bestStreak: 0,
        scoredQuestions: {}
      };
      state.gameInstance?.reset?.();
      mountAssessmentFlow(activity);
    }
  });

  layer.addEventListener("submit", (event) => {
    event.preventDefault();
    submitAssessmentForm(event.target.closest("form"));
  });

  if (state.assessmentControlHandler) controls.removeEventListener("click", state.assessmentControlHandler);
  state.assessmentControlHandler = (event) => {
    if (!event.target.closest(".science-action:not(.secondary)") || session.phase !== "free") return;
    showToast("Experimento libre ejecutado.");
  };
  controls.addEventListener("click", state.assessmentControlHandler);

  sceneCheck.addEventListener("click", () => {
    if (session.phase === "experiment") revealResult();
    else if (session.phase === "lab") validateLabPractice();
    else if (session.phase === "free") controls.querySelector(".science-action:not(.secondary)")?.click();
  });

  modeToggle.addEventListener("click", () => {
    if (session.phase !== "free") {
      session.previousPhase = session.phase;
      session.phase = "free";
      state.gameInstance?.reset?.();
      layer.classList.add("is-hidden");
      sceneOutcome.classList.remove("show");
      frame.classList.remove("sa-experiment-active", "sa-experiment-success", "sa-experiment-failed", "sa-result-correct", "sa-result-incorrect");
      controls.classList.remove("sa-game-controls-hidden");
      setControlsEnabled(true);
      sceneCheck.classList.add("show");
      modeToggle.innerHTML = "<i class=\"fas fa-gamepad\"></i><span>Volver al juego</span>";
      requestAnimationFrame(() => controls.scrollIntoView({ block: "nearest", behavior: "smooth" }));
      return;
    }
    state.gameInstance?.reset?.();
    session.phase = "question";
    controls.classList.add("sa-game-controls-hidden");
    sceneCheck.classList.remove("show");
    sceneOutcome.classList.remove("show");
    frame.classList.remove("sa-experiment-active", "sa-experiment-success", "sa-experiment-failed", "sa-result-correct", "sa-result-incorrect");
    modeToggle.innerHTML = "<i class=\"fas fa-sliders\"></i><span>Modo libre</span>";
    layer.classList.remove("is-hidden");
    setControlsEnabled(false);
    if (activity.gameMode === "lab") beginLabPractice();
    else renderQuestion();
  });

  session.revealResult = revealResult;
  renderLevelBriefing();
}

let experienceProposalMemoryCache = null;

function readExperienceProposalMemory() {
  if (experienceProposalMemoryCache) return experienceProposalMemoryCache;
  try {
    const stored = JSON.parse(localStorage.getItem(EXPERIENCE_PROPOSAL_MEMORY_KEY) || "null");
    experienceProposalMemoryCache = {
      counter: Math.max(0, Number(stored?.counter || 0)),
      items: Array.isArray(stored?.items) ? stored.items.slice(-30) : []
    };
  } catch {
    experienceProposalMemoryCache = { counter: 0, items: [] };
  }
  return experienceProposalMemoryCache;
}

function writeExperienceProposalMemory(memory) {
  experienceProposalMemoryCache = {
    counter: Math.max(0, Number(memory?.counter || 0)),
    items: Array.isArray(memory?.items) ? memory.items.slice(-30) : []
  };
  try {
    localStorage.setItem(EXPERIENCE_PROPOSAL_MEMORY_KEY, JSON.stringify(experienceProposalMemoryCache));
  } catch (error) {
    console.warn("[ScienceActivities] No se pudo guardar el historial de propuestas:", error);
  }
}

function nextExperienceProposalRoute(subject, topic) {
  const memory = readExperienceProposalMemory();
  const sequence = memory.counter;
  const contexts = REAL_WORLD_EXPERIENCE_CONTEXTS[subject] || REAL_WORLD_EXPERIENCE_CONTEXTS.physics;
  const route = {
    sequence,
    context: contexts[sequence % contexts.length],
    role: REAL_WORLD_EXPERIENCE_ROLES[Math.floor(sequence / contexts.length) % REAL_WORLD_EXPERIENCE_ROLES.length],
    task: REAL_WORLD_EXPERIENCE_TASKS[Math.floor(sequence / 3) % REAL_WORLD_EXPERIENCE_TASKS.length],
    evidence: REAL_WORLD_EVIDENCE_ROUTES[Math.floor(sequence / 5) % REAL_WORLD_EVIDENCE_ROUTES.length],
    constraint: REAL_WORLD_CONSTRAINTS[Math.floor(sequence / 7) % REAL_WORLD_CONSTRAINTS.length]
  };
  memory.counter += 1;
  writeExperienceProposalMemory(memory);
  route.key = `${subject}:${String(topic || "").toLowerCase()}:${route.sequence}`;
  return route;
}

function proposalComparisonTokens(value) {
  const stopWords = new Set([
    "para", "como", "esta", "este", "estos", "estas", "desde", "entre", "sobre", "cuando",
    "deben", "pueden", "cada", "donde", "hasta", "segun", "mediante", "estudiantes", "equipo",
    "datos", "resultado", "resultados", "variable", "variables", "observar", "comprobar"
  ]);
  return new Set(String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 3 && !stopWords.has(token)));
}

function proposalSimilarity(left, right) {
  const a = proposalComparisonTokens(left);
  const b = proposalComparisonTokens(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  a.forEach((token) => {
    if (b.has(token)) intersection += 1;
  });
  return intersection / Math.max(1, new Set([...a, ...b]).size);
}

function proposalIsDistinct(proposal, previousProposals) {
  const normalized = String(proposal || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return false;
  return previousProposals.every((previous) => {
    const prior = String(previous || "").replace(/\s+/g, " ").trim().toLowerCase();
    return normalized !== prior && proposalSimilarity(normalized, prior) < .46;
  });
}

function completeProposalSentence(value) {
  const sentence = String(value || "").replace(/\s+/g, " ").trim();
  if (!sentence) return "";
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

function rememberExperienceProposal({ subject, topic, proposal, routeKey }) {
  const memory = readExperienceProposalMemory();
  memory.items.push({
    subject,
    topic,
    proposal,
    routeKey,
    createdAt: new Date().toISOString()
  });
  memory.items = memory.items.slice(-30);
  writeExperienceProposalMemory(memory);
}

async function generateExperienceProposal() {
  const button = $("#generateExperienceBtn");
  if (button.dataset.loading === "true") return;
  const subject = $("#subjectSelect").value;
  const topic = getSelectedTopic();
  const grade = $("#gradeSelect").value;
  const difficulty = $("#difficultySelect").value;
  const gameMode = $("#gameModeSelect").value;
  const topicTemplate = resolveTopicTemplate(subject, topic);
  const supportedControls = (CONTROL_PRESETS[topicTemplate.type] || [])
    .map((control) => ({
      label: control.label,
      unit: control.unit,
      effect: control.effect
    }));
  const supportedControlLabels = supportedControls.map((control) => control.label);
  const supportedControlDescription = supportedControls
    .map((control) => `${control.label}${control.unit ? ` (${control.unit})` : ""}: ${control.effect}`)
    .join("; ");
  const currentProposal = $("#experiencePrompt").value.trim();
  const memory = readExperienceProposalMemory();
  const recentProposals = memory.items
    .filter((item) => item.subject === subject && String(item.topic).toLowerCase() === String(topic).toLowerCase())
    .slice(-6)
    .map((item) => item.proposal)
    .filter(Boolean);
  if (currentProposal) recentProposals.push(currentProposal);
  const originalButtonHtml = button.innerHTML;
  button.dataset.loading = "true";
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i><span>Proponiendo…</span>';
  try {
    let acceptedProposal = "";
    let acceptedRoute = null;
    for (let attempt = 0; attempt < 3 && !acceptedProposal; attempt += 1) {
      const route = nextExperienceProposalRoute(subject, topic);
      const exclusions = recentProposals.length
        ? recentProposals.map((proposal, index) => `${index + 1}. ${proposal.slice(0, 360)}`).join("\n")
        : "No existen propuestas previas.";
      const response = await authFetchJson(buildVeoApiUrl("/api/gemini/generate"), {
        method: "POST",
        body: {
          model: $("#modelSelect").value,
          payload: {
            systemInstruction: {
              parts: [{
                text: [
                  "Eres especialista en didáctica STEM y diseño de experiencias auténticas para secundaria.",
                  "Cada propuesta debe representar un uso plausible del conocimiento fuera del aula, ser científicamente correcta, segura y realizable mediante una simulación interactiva 2D.",
                  "No aceptes contextos decorativos: la medición debe servir para tomar una decisión realista."
                ].join(" ")
              }]
            },
            contents: [{
              role: "user",
              parts: [{
                text: [
                  `Diseña una propuesta nueva para ${SUBJECT_LABELS[subject]} sobre ${topic}.`,
                  `Nivel escolar: ${grade}. Dificultad: ${difficulty}.`,
                  `Modalidad: ${gameMode === "simulator" ? "simulador de exploración con variables editables" : "videojuego educativo basado en evidencia"}.`,
                  `Variables que el juego sí puede manipular: ${supportedControlDescription}.`,
                  "",
                  `Ruta creativa única ${route.sequence + 1}:`,
                  `- Ámbito auténtico sugerido: ${route.context}.`,
                  `- Personas que necesitan la evidencia: ${route.role}.`,
                  `- Decisión o tarea: ${route.task}.`,
                  `- Evidencia principal: ${route.evidence}.`,
                  `- Restricción de diseño: ${route.constraint}`,
                  "",
                  "Adapta la ruta si algún elemento no es compatible con el tema, pero conserva una aplicación cotidiana o profesional real y específica.",
                  "Usa como variables manipulables únicamente las variables disponibles indicadas. Puedes adaptar el contexto real, pero no sustituirlas por otras.",
                  "Relaciona directamente esas variables con el fenómeno científico del tema. No inventes instrumentos, efectos, datos ni relaciones causales imposibles.",
                  "La experiencia debe permitir cambiar al menos dos variables disponibles, observar una consecuencia medible producida por el simulador y usarla para resolver la decisión planteada.",
                  "Evita frases genéricas como «comprender el tema», «aprender de forma divertida», «situación de la vida real» o «realizar un experimento».",
                  "No repitas ni parafrasees estas propuestas recientes:",
                  exclusions,
                  "",
                  "Devuelve tres oraciones complementarias: contexto auténtico, acción experimental y evidencia con decisión. No incluyas título, código, markdown ni nombres de estilos visuales."
                ].join("\n")
              }]
            }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  authenticContext: { type: "STRING" },
                  studentAction: { type: "STRING" },
                  evidenceAndDecision: { type: "STRING" },
                  usedVariables: {
                    type: "ARRAY",
                    minItems: 2,
                    maxItems: 4,
                    items: { type: "STRING", enum: supportedControlLabels }
                  }
                },
                required: ["authenticContext", "studentAction", "evidenceAndDecision", "usedVariables"]
              },
              temperature: .92,
              topP: .95
            }
          }
        }
      });
      const generated = parseGeneratedJson(extractResponseText(response));
      const parts = [
        completeProposalSentence(generated?.authenticContext),
        completeProposalSentence(generated?.studentAction),
        completeProposalSentence(generated?.evidenceAndDecision)
      ].filter(Boolean);
      const candidate = cleanVisualConfigurationReferences(parts.join(" "));
      const usedVariables = Array.isArray(generated?.usedVariables)
        ? [...new Set(generated.usedVariables.filter((label) => supportedControlLabels.includes(label)))]
        : [];
      const hasCompleteStructure = parts.length === 3
        && usedVariables.length >= Math.min(2, supportedControlLabels.length)
        && candidate.length >= 140
        && candidate.length <= 900;
      const comparisons = [...recentProposals];
      if (hasCompleteStructure && proposalIsDistinct(candidate, comparisons)) {
        acceptedProposal = candidate;
        acceptedRoute = route;
      } else if (candidate) {
        recentProposals.push(candidate);
      }
    }
    if (!acceptedProposal) {
      throw new Error("La IA repitió una propuesta anterior o no produjo una situación real coherente. Intenta nuevamente.");
    }
    rememberExperienceProposal({
      subject,
      topic,
      proposal: acceptedProposal,
      routeKey: acceptedRoute.key
    });
    $("#experiencePrompt").value = acceptedProposal;
    $("#experiencePrompt").dispatchEvent(new Event("input", { bubbles: true }));
    showToast("Propuesta auténtica y diferente creada con IA.");
  } catch (error) {
    console.error("[ScienceActivities] Experience proposal failed:", error);
    showToast(error?.message || "No fue posible crear la propuesta experimental.");
  } finally {
    button.dataset.loading = "false";
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.innerHTML = originalButtonHtml;
  }
}

function buildFallbackLearningGuide(activity) {
  const levelCount = Math.max(1, Math.floor(Number(activity.levelCount || 3)));
  const controls = Array.isArray(activity.controls) ? activity.controls : [];
  const isMath = activity.subject === "math";
  const baseConcepts = controls.slice(0, 2).map((control) => ({
    term: control.label,
    definition: control.effect || (isMath
      ? "Valor que puedes modificar para comprobar una relación matemática."
      : "Variable que puedes modificar durante el experimento.")
  }));
  if (!baseConcepts.length) baseConcepts.push({ term: activity.topic, definition: activity.scientificPrinciple });
  return {
    title: `Bitácora de ${activity.topic}`,
    introduction: isMath
      ? `Explora ${activity.topic} mediante representaciones, patrones, operaciones y comprobaciones matemáticas.`
      : `Explora ${activity.topic} como una misión científica: estudia las pistas, formula una hipótesis y compruébala.`,
    levels: Array.from({ length: levelCount }, (_, index) => ({
      title: `Misión ${index + 1}: ${activity.topic}`,
      narrative: isMath
        ? (index === 0
          ? "Analiza los datos, reconoce la estructura del problema y construye una representación matemática antes de resolverlo."
          : "Compara estrategias, transforma la expresión y comprueba qué procedimiento conserva la equivalencia del resultado.")
        : (index === 0
          ? "Tu equipo de investigación recibe un caso sin resolver. Analiza el sistema, identifica las variables y establece una hipótesis antes de ejecutar la prueba."
          : "La evidencia inicial no es suficiente. Contrasta resultados, detecta relaciones entre variables y decide qué modificación permitirá sostener una conclusión."),
      objective: isMath
        ? (index === 0
          ? `Reconocer datos, operaciones y representaciones relevantes de ${activity.topic}.`
          : `Resolver y justificar relaciones de ${activity.topic} mediante procedimientos equivalentes.`)
        : (index === 0
          ? `Identificar variables y evidencia relevante en un caso aplicado de ${activity.topic}.`
          : `Explicar y justificar una relación causal sobre ${activity.topic} mediante los resultados de la simulación.`),
      concepts: structuredClone(baseConcepts),
      hint: isMath
        ? (index === 0
          ? "Separa los datos conocidos, la incógnita y la operación que los relaciona."
          : "Comprueba el resultado sustituyendo los valores en la expresión original.")
        : (index === 0
          ? "Aísla una variable y registra qué evidencia apoyaría o refutaría tu hipótesis."
          : "Compara la magnitud del cambio y distingue correlación de una relación causal."),
      imagePrompt: isMath
        ? `${VISUAL_STYLE_DIRECTIONS[activity.visualStyle] || VISUAL_STYLE_DIRECTIONS["tech-minimal"]}. ${ADOLESCENT_IMAGE_DIRECTION} Ilustración vertical 9:16 para adolescentes sobre ${activity.topic}, nivel ${index + 1}. Visualiza patrones, formas, relaciones espaciales, gráficas o piezas matemáticas abstractas según el tema. Sin matraces, reactivos, moléculas, células, circuitos ni aparatos de otras ciencias.`
        : `${VISUAL_STYLE_DIRECTIONS[activity.visualStyle] || VISUAL_STYLE_DIRECTIONS["tech-minimal"]}. ${ADOLESCENT_IMAGE_DIRECTION} Ilustración vertical 9:16 de cuerpo completo, con la acción principal centrada y ocupando todo el encuadre. Escena educativa sobre ${activity.topic}, nivel ${index + 1}, con ambiente ${activity.scenario?.biome || "científico"}.`,
      imageDataUrl: ""
    }))
  };
}

function visibleLearningGuideText(guide = {}) {
  return [
    guide.title,
    guide.introduction,
    ...(guide.levels || []).flatMap((level) => [
      level.title,
      level.narrative,
      level.objective,
      level.hint,
      typeof level.example === "string" ? level.example : level.example?.title,
      typeof level.example === "object" ? level.example?.text : "",
      ...(level.concepts || []).flatMap((concept) => [concept.term, concept.definition])
    ])
  ].filter(Boolean).join(" ");
}

function normalizeLearningGuideForSubject(activity, guide) {
  if (guide && isSubjectTextCompatible(activity.subject, visibleLearningGuideText(guide))) return guide;
  const fallback = buildFallbackLearningGuide(activity);
  fallback.levels = fallback.levels.map((level, index) => ({
    ...level,
    imageDataUrl: guide?.levels?.[index]?.imageDataUrl || "",
    imageSrc: guide?.levels?.[index]?.imageSrc || ""
  }));
  return fallback;
}

function limitLearningText(value, maxWords, maxCharacters) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  let concise = normalized.split(" ").slice(0, maxWords).join(" ");
  if (concise.length > maxCharacters) concise = concise.slice(0, maxCharacters).replace(/\s+\S*$/, "");
  return concise.length < normalized.length ? `${concise.replace(/[,:;.-]+$/, "")}…` : concise;
}

function difficultyExampleMarkup(activity, level) {
  const generated = level?.example && typeof level.example === "object" ? level.example : null;
  const rawExample = generated?.text
    || [generated?.situation, generated?.result].filter(Boolean).join(" ")
    || (typeof level?.example === "string" ? level.example : "");
  if (!rawExample) return "";
  const title = generated?.title || "Ejemplo generado";
  const conciseExample = limitLearningText(rawExample, 32, 190);
  return `<div class="sa-difficulty-example"><i class="fas fa-flask-vial"></i><strong>${escapeHtml(title)}</strong><span>${escapeHtml(conciseExample)}</span></div>`;
}

async function generateLearningGuideWithGemini(activity, attempt = 0) {
  const levelCount = Math.max(1, Math.floor(Number(activity.levelCount || 3)));
  const fallback = buildFallbackLearningGuide(activity);
  let guide = fallback;
  const isMath = activity.subject === "math";
  const requiresAppliedFormula = ["math", "physics", "chemistry"].includes(activity.subject);
  try {
    const response = await authFetchJson(buildVeoApiUrl("/api/gemini/generate"), {
      method: "POST",
      body: {
        model: $("#modelSelect").value,
        payload: {
          systemInstruction: {
            parts: [{ text: isMath
              ? `Eres diseñador instruccional de videojuegos de Matemáticas para adolescentes. Enseña antes de evaluar con lenguaje claro, breve y matemáticamente correcto. No mezcles Física, Química ni Biología. ${ADOLESCENT_CONTENT_DIRECTION}`
              : `Eres diseñador instruccional y narrativo de videojuegos STEM para adolescentes. Enseña antes de evaluar con lenguaje claro, breve y científicamente correcto. ${ADOLESCENT_CONTENT_DIRECTION}` }]
          },
          contents: [{
            role: "user",
            parts: [{
              text: [
                `Crea una guía de aprendizaje de exactamente ${levelCount} niveles.`,
                `Materia: ${SUBJECT_LABELS[activity.subject]}. Tema: ${activity.topic}.`,
                `Experiencia obligatoria solicitada por el docente: ${activity.experiencePrompt || "No se proporcionó una instrucción adicional."}`,
                `Ambiente visual: ${activity.scenario?.biome || "laboratorio científico"}.`,
                `Misión: ${activity.mission}. ${isMath ? "Principio matemático" : "Principio científico"}: ${activity.scientificPrinciple}.`,
                isMath
                  ? "Contrato de materia: usa exclusivamente conceptos, procedimientos, ejemplos y representaciones matemáticas. No incluyas matraces, reactivos, moléculas, células, genética, ecosistemas, fuerzas, circuitos ni proyectiles."
                  : `Mantén todo el contenido dentro de ${SUBJECT_LABELS[activity.subject]}.`,
                `Nivel escolar: ${$("#gradeSelect").value}.`,
                `Dificultad: ${$("#difficultySelect").value}.`,
                ADOLESCENT_CONTENT_DIRECTION,
                `Dirección visual obligatoria: ${VISUAL_STYLE_DIRECTIONS[activity.visualStyle] || VISUAL_STYLE_DIRECTIONS["kawaii-lab"]}.`,
                "La dirección visual solo controla la imagen. No menciones el nombre del estilo ni términos de configuración artística en ningún contenido educativo visible.",
                "Cada nivel debe preparar al alumno con una sola micro-misión: objetivo, exactamente 1 o 2 conceptos, un ejemplo cotidiano y un prompt visual.",
                "Toda la guía, cada ejemplo, su fórmula y su explicación deben responder de forma concreta a la experiencia solicitada por el docente; no la ignores ni la sustituyas por un caso genérico.",
                "Límites obligatorios: title máximo 7 palabras; objective una oración de máximo 13 palabras; narrative máximo 18 palabras.",
                "Cada definición tendrá máximo 16 palabras. La pista tendrá máximo 14 palabras. No repitas una idea entre campos.",
                "La narrativa debe condensar una investigación, incidente técnico, problema real, reto de ingeniería o análisis de evidencia.",
                "Evita misiones basadas en personajes tiernos, mascotas, regalos, magia, dulces o recompensas infantiles.",
                "El ejemplo debe ser realista, aplicable a la vida cotidiana y exclusivo de ese nivel. Incluye datos concretos y unidades cuando el tema lo permita.",
                "Para cada ejemplo devuelve: title, text, formula y explanation. formula debe ser la relación aplicada exactamente al caso de text, sustituyendo sus mismos datos y unidades; no una ley genérica. Si el tema no admite una fórmula válida, formula debe ser una cadena vacía y explanation debe explicar causalmente el caso.",
                requiresAppliedFormula
                  ? "REQUISITO ESTRICTO: para cada nivel formula no puede estar vacía. Debe contener una ecuación o reacción con =, ≈, ∝ o → y mostrar el cálculo o sustitución de los mismos valores, unidades y resultado mencionados en text. Una fórmula general sin datos del ejemplo es inválida."
                  : "Cuando exista una relación cuantitativa válida, formula debe contener la ecuación aplicada con los datos del caso.",
                "explanation debe explicar en una oración por qué la fórmula, cálculo o relación confirma el resultado del ejemplo. No inventes valores, leyes ni unidades.",
                isMath
                  ? "Usa números, operaciones, expresiones, ecuaciones, funciones, figuras, mediciones, tablas, gráficas o probabilidades específicas del tema. No repitas la misma estructura ni los mismos datos entre niveles."
                  : "Usa valores, unidades, organismos, sustancias o fenómenos específicos del tema. No repitas la misma estructura ni los mismos datos entre niveles.",
                "Adapta el ejemplo a la dificultad: guiada usa un paso directo; equilibrada relaciona dos variables; desafío exige varios pasos, cálculo o razonamiento.",
                "Haz progresar el aprendizaje desde reconocer hasta relacionar, predecir, aplicar y explicar.",
                "Cada imagePrompt debe respetar únicamente la dirección visual indicada. No añadas kawaii, chibi, pastel ni caras tiernas salvo que la dirección seleccionada lo pida.",
                "Cada imagePrompt debe solicitar explícitamente una ilustración vertical 9:16, de cuerpo completo, con la acción principal centrada y aprovechando toda la altura.",
                ADOLESCENT_IMAGE_DIRECTION,
                "La escena debe ser profesional y científicamente correcta, sin texto, letras, números, fórmulas, logotipos ni marcas.",
                "No menciones nombres técnicos de escenario, mundo, zona, estación, laboratorio numerado ni identificadores internos en ningún texto visible.",
                "Devuelve únicamente JSON."
              ].join("\n")
            }]
          }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                title: { type: "STRING" },
                introduction: { type: "STRING" },
                levels: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      title: { type: "STRING" },
                      narrative: { type: "STRING" },
                      objective: { type: "STRING" },
                      concepts: {
                        type: "ARRAY",
                        items: {
                          type: "OBJECT",
                          properties: { term: { type: "STRING" }, definition: { type: "STRING" } },
                          required: ["term", "definition"]
                        }
                      },
                      hint: { type: "STRING" },
                      example: {
                        type: "OBJECT",
                        properties: {
                          title: { type: "STRING" },
                          text: { type: "STRING" },
                          formula: { type: "STRING" },
                          explanation: { type: "STRING" }
                        },
                        required: ["title", "text", "formula", "explanation"]
                      },
                      imagePrompt: { type: "STRING" }
                    },
                    required: ["title", "narrative", "objective", "concepts", "hint", "example", "imagePrompt"]
                  }
                }
              },
              required: ["title", "introduction", "levels"]
            },
            temperature: .7
          }
        }
      }
    });
    const generated = parseGeneratedJson(extractResponseText(response));
    if (Array.isArray(generated?.levels) && generated.levels.length === levelCount) {
      const formulasAreApplied = !requiresAppliedFormula || generated.levels.every((level) => {
        const formula = String(level?.example?.formula || "").trim();
        return /[=≈∝→]/.test(formula) && /\d/.test(formula);
      });
      if (!formulasAreApplied) {
        if (attempt < 2) return generateLearningGuideWithGemini(activity, attempt + 1);
        throw new Error("Gemini no devolvió ecuaciones aplicadas para todos los ejemplos requeridos.");
      }
      if (!isSubjectTextCompatible(activity.subject, visibleLearningGuideText(generated))) {
        if (attempt < 2) return generateLearningGuideWithGemini(activity, attempt + 1);
        throw new Error("Gemini devolvió una guía con contenido ajeno a la materia solicitada.");
      }
      guide = {
        title: String(generated.title || fallback.title),
        introduction: String(generated.introduction || fallback.introduction),
        levels: generated.levels.map((level, index) => ({
          ...fallback.levels[index],
          ...level,
          concepts: Array.isArray(level.concepts) && level.concepts.length ? level.concepts.slice(0, 2) : fallback.levels[index].concepts.slice(0, 2),
          imageDataUrl: ""
        }))
      };
    } else {
      throw new Error("Gemini no devolvió todos los niveles solicitados.");
    }
  } catch (error) {
    if (attempt < 2) return generateLearningGuideWithGemini(activity, attempt + 1);
    throw new Error(`No se pudo generar una guía completa con Gemini: ${error?.message || "respuesta inválida"}`);
  }

  const generateLevelImage = async (level, index) => {
    const prompt = [
      level.imagePrompt,
      `${isMath ? "Tema matemático" : "Tema científico"}: ${activity.topic}. Nivel ${index + 1} de ${levelCount}.`,
      `Mandatory art direction: ${VISUAL_STYLE_DIRECTIONS[activity.visualStyle] || VISUAL_STYLE_DIRECTIONS["tech-minimal"]}.`,
      ADOLESCENT_IMAGE_DIRECTION,
      "Vertical 9:16 portrait game illustration. Full scene from top to bottom, centered main subject, tall environmental composition, no letterboxing and no important elements near the crop edges.",
      "Use a layered game environment, strong composition and lighting appropriate to the selected art direction. Do not blend in kawaii or pastel conventions unless explicitly required by that direction.",
      isMath
        ? "Accurate mathematical visualization for teenagers. Use geometric structures, spatial relationships, graphs, patterns or symbolic puzzle pieces appropriate to the topic. No chemistry lab, molecules, cells, physics apparatus, text, letters, numbers, formulas, logo or watermark."
        : "Accurate science for teenagers. No text, letters, numbers, formulas, logo or watermark."
    ].join(" ");
    const models = ["gemini-3.1-flash-image", "gemini-2.5-flash-image"];
    const errors = [];
    for (const model of models) {
      try {
        const result = await generateImagesViaGemini({
          mode: "generate",
          prompt,
          options: { model, aspectRatio: "9:16", imageSize: "1K", count: 1 },
          attachments: []
        });
        if (result?.[0]?.dataUrl) return result[0].dataUrl;
      } catch (error) {
        errors.push(`${model}: ${error?.message || "sin imagen"}`);
      }
    }
    throw new Error(errors.join(" · ") || "Gemini no devolvió una imagen válida.");
  };

  const imageResults = await Promise.allSettled(
    guide.levels.map((level, index) => generateLevelImage(level, index))
  );
  imageResults.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value) guide.levels[index].imageDataUrl = result.value;
  });
  const failedImages = imageResults.filter((result) => result.status === "rejected").length;
  if (failedImages) {
    const firstFailure = imageResults.find((result) => result.status === "rejected");
    throw new Error(`Gemini no creó ${failedImages} de ${levelCount} imágenes del juego. ${firstFailure?.reason?.message || "Revisa el modelo, la cuota o los permisos."}`);
  }
  return guide;
}

async function removeSpriteSheetBackground(source, columns = 4, rows = 2) {
  const bitmap = await decodeImageSource(source);
  const frameSize = 512;
  const canvas = document.createElement("canvas");
  canvas.width = frameSize * columns;
  canvas.height = frameSize * rows;
  const context = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const dominance = green - Math.max(red, blue);
    if (green > 95 && dominance > 28) {
      const removal = Math.min(1, Math.max(0, (dominance - 28) / 90));
      data[index + 3] = Math.round(255 * (1 - removal));
      data[index + 1] = Math.min(green, Math.max(red, blue) + 22);
    }
  }

  context.putImageData(pixels, 0, 0);
  const cleanedCanvas = document.createElement("canvas");
  cleanedCanvas.width = canvas.width;
  cleanedCanvas.height = canvas.height;
  const cleanedContext = cleanedCanvas.getContext("2d", { alpha: true });
  cleanedContext.imageSmoothingEnabled = false;

  const removeFrameGuideLines = (framePixels, width, height) => {
    const alphaThreshold = 64;
    const clearThinBands = (orientation) => {
      const length = orientation === "row" ? height : width;
      const span = orientation === "row" ? width : height;
      const counts = new Uint16Array(length);
      for (let line = 0; line < length; line += 1) {
        let count = 0;
        for (let point = 0; point < span; point += 1) {
          const x = orientation === "row" ? point : line;
          const y = orientation === "row" ? line : point;
          if (framePixels.data[(y * width + x) * 4 + 3] >= alphaThreshold) count += 1;
        }
        counts[line] = count;
      }
      const minimumLineLength = Math.round(span * .16);
      for (let start = 0; start < length;) {
        if (counts[start] < minimumLineLength) {
          start += 1;
          continue;
        }
        let end = start;
        let peak = counts[start];
        while (end + 1 < length && counts[end + 1] >= minimumLineLength) {
          end += 1;
          peak = Math.max(peak, counts[end]);
        }
        const before = start > 0 ? counts[start - 1] : 0;
        const after = end + 1 < length ? counts[end + 1] : 0;
        const isThinIsolatedLine = end - start + 1 <= 5
          && Math.max(before, after) < peak * .55;
        if (isThinIsolatedLine) {
          for (let line = Math.max(0, start - 1); line <= Math.min(length - 1, end + 1); line += 1) {
            for (let point = 0; point < span; point += 1) {
              const x = orientation === "row" ? point : line;
              const y = orientation === "row" ? line : point;
              framePixels.data[(y * width + x) * 4 + 3] = 0;
            }
          }
        }
        start = end + 1;
      }
    };
    clearThinBands("row");
    clearThinBands("column");
    return framePixels;
  };

  const findMainComponentBounds = (framePixels, width, height) => {
    const alphaThreshold = 72;
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    const components = [];
    const offsets = [-1, 1, -width, width];
    for (let y = 2; y < height - 2; y += 1) {
      for (let x = 2; x < width - 2; x += 1) {
        const start = y * width + x;
        if (visited[start] || framePixels.data[start * 4 + 3] < alphaThreshold) continue;
        let head = 0;
        let tail = 0;
        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;
        queue[tail++] = start;
        visited[start] = 1;
        while (head < tail) {
          const point = queue[head++];
          const pointX = point % width;
          const pointY = Math.floor(point / width);
          minX = Math.min(minX, pointX);
          maxX = Math.max(maxX, pointX);
          minY = Math.min(minY, pointY);
          maxY = Math.max(maxY, pointY);
          for (const next of offsets) {
            const candidate = point + next;
            const candidateX = candidate % width;
            if (candidate < 0 || candidate >= width * height || visited[candidate]) continue;
            if (Math.abs(candidateX - pointX) > 1) continue;
            if (framePixels.data[candidate * 4 + 3] < alphaThreshold) continue;
            visited[candidate] = 1;
            queue[tail++] = candidate;
          }
        }
        const component = { size: tail, minX, maxX, minY, maxY };
        components.push(component);
      }
    }
    if (!components.length) return null;
    components.sort((first, second) => second.size - first.size);
    const main = components[0];
    const expansion = Math.round(width * .24);
    const combined = { ...main };
    components.slice(1).forEach((component) => {
      const meaningfulSize = component.size >= Math.max(8, main.size * .001);
      const touchesExpandedBody = component.maxX >= main.minX - expansion
        && component.minX <= main.maxX + expansion
        && component.maxY >= main.minY - expansion
        && component.minY <= main.maxY + expansion;
      if (!meaningfulSize || !touchesExpandedBody) return;
      combined.minX = Math.min(combined.minX, component.minX);
      combined.maxX = Math.max(combined.maxX, component.maxX);
      combined.minY = Math.min(combined.minY, component.minY);
      combined.maxY = Math.max(combined.maxY, component.maxY);
      combined.size += component.size;
    });
    return combined;
  };

  const extractedFrames = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const sourceX = column * frameSize;
      const sourceY = row * frameSize;
      const framePixels = removeFrameGuideLines(
        context.getImageData(sourceX, sourceY, frameSize, frameSize),
        frameSize,
        frameSize
      );
      context.putImageData(framePixels, sourceX, sourceY);
      const bounds = findMainComponentBounds(framePixels, frameSize, frameSize);
      if (!bounds) continue;
      const padding = 12;
      const cropX = Math.max(0, bounds.minX - padding);
      const cropY = Math.max(0, bounds.minY - padding);
      const cropWidth = Math.min(frameSize - cropX, bounds.maxX - bounds.minX + 1 + padding * 2);
      const cropHeight = Math.min(frameSize - cropY, bounds.maxY - bounds.minY + 1 + padding * 2);
      extractedFrames.push({ sourceX, sourceY, cropX, cropY, cropWidth, cropHeight });
    }
  }

  const widestFrame = Math.max(1, ...extractedFrames.map((frame) => frame.cropWidth));
  const tallestFrame = Math.max(1, ...extractedFrames.map((frame) => frame.cropHeight));
  const commonScale = Math.min(
    (frameSize * .76) / widestFrame,
    (frameSize * .84) / tallestFrame
  );
  extractedFrames.forEach((frame) => {
    const drawWidth = frame.cropWidth * commonScale;
    const drawHeight = frame.cropHeight * commonScale;
    const destinationX = frame.sourceX + (frameSize - drawWidth) / 2;
    const destinationY = frame.sourceY + frameSize - drawHeight - frameSize * .06;
    cleanedContext.drawImage(
      canvas,
      frame.sourceX + frame.cropX,
      frame.sourceY + frame.cropY,
      frame.cropWidth,
      frame.cropHeight,
      destinationX,
      destinationY,
      drawWidth,
      drawHeight
    );
  });

  bitmap.close?.();
  return {
    dataUrl: cleanedCanvas.toDataURL("image/png"),
    width: cleanedCanvas.width,
    height: cleanedCanvas.height,
    columns,
    rows,
    poses: {
      idle: 0,
      run: [1, 2, 3],
      jump: 4,
      fall: 5,
      hit: 6,
      celebrate: 7
    }
  };
}

async function generatePlayerSpriteWithGemini(activity, characterConfig = activity.playerCharacter || {}) {
  const styleDirection = VISUAL_STYLE_DIRECTIONS[activity.visualStyle]
    || VISUAL_STYLE_DIRECTIONS["tech-minimal"];
  const genderDirection = characterConfig.gender === "male"
    ? "male teenage protagonist"
    : characterConfig.gender === "nonbinary"
      ? "androgynous teenage protagonist"
      : "female teenage protagonist";
  const playerStyle = {
    "arcade-hd": "premium modern HD arcade sprite, detailed 32-bit pixel art",
    "pixel-16": "authentic polished 16-bit pixel art with crisp readable silhouette",
    "anime-action": "anime action-game sprite with cel-shaded arcade rendering",
    "kawaii-teen": "original kawaii teenage adventure-game sprite, expressive but not childish",
    "graphic-novel": "graphic-novel action-game sprite with bold ink and controlled shading",
  }[characterConfig.playerStyle] || "premium modern HD arcade sprite";
  const enabledMovements = Object.entries(characterConfig.movements || {})
    .filter(([, enabled]) => enabled)
    .map(([movement]) => movement)
    .join(", ");
  const result = await generateImagesViaGemini({
    mode: "generate",
    prompt: [
      `Create one original ${genderDirection} named ${characterConfig.name || "the player"} for a ${SUBJECT_LABELS[activity.subject] || activity.subject} game about ${activity.topic}.`,
      `Character role: ${characterConfig.role || "science adventurer"}. Player rendering: ${playerStyle}.`,
      characterConfig.prompt ? `Additional character direction: ${characterConfig.prompt}.` : "",
      "Produce a production-ready sprite sheet with exactly eight equal cells in a strict 4-column by 2-row grid.",
      "Top row from left to right: walk forward, walk backward, jump upward, strike or hit.",
      "Bottom row from left to right: crouch, push a heavy invisible object, pull an invisible object, throw an invisible object.",
      `Movements enabled by the editor: ${enabledMovements || "all eight movements"}.`,
      "In both walking poses both complete legs and both complete feet must remain visible, with clearly opposite leading legs.",
      "Do not hide one leg behind the other, omit a foot, merge limbs, add motion duplicates or use anatomical shortcuts.",
      "Keep exactly the same character identity, face, hairstyle, clothing, proportions, palette and equipment in all eight poses.",
      "Full body centered inside every cell, identical character scale and consistent foot baseline.",
      "Keep every body part, hair, hand, foot and accessory fully inside the central 60 percent of its cell, with at least 20 percent plain green margin from every cell edge.",
      "No pose may be cropped, truncated, incomplete, hidden behind another pose or cross into an adjacent cell.",
      "Crisp high-resolution 16-bit pixel art for a modern HD platform game. Mature adolescent design, not preschool or toddler imagery.",
      `Adapt the palette, clothing and visual language to this selected direction: ${styleDirection}.`,
      "Use a perfectly flat solid chroma green #00FF00 background across the complete image for automatic background removal.",
      "No text, labels, letters, numbers, frame borders, separator lines, corner marks, crop marks, baselines, logos, UI, scenery, floor, cast shadows or additional characters."
    ].join(" "),
    options: {
      model: "gemini-3.1-flash-image",
      aspectRatio: "16:9",
      imageSize: "2K",
      count: 1
    },
    attachments: []
  });
  const generated = result?.[0]?.dataUrl;
  if (!generated) return null;
  const sprite = await removeSpriteSheetBackground(generated, 4, 2);
  return {
    ...sprite,
    poses: {
      idle: 0,
      run: [0, 1],
      jump: 2,
      fall: 2,
      hit: 3,
      crouch: 4,
      push: 5,
      pull: 6,
      throw: 7,
      celebrate: 3,
    },
    movements: characterConfig.movements || {},
    characterId: characterConfig.id,
  };
}

const GENERATION_DRAFT_DB = "scienceActivitiesGeneration.v1";
const GENERATION_DRAFT_STORE = "assessmentDrafts";

function positiveInteger(value, fallback = 1) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function generationDraftKey(activity) {
  return [
    "assessment-uniqueness-v2",
    activity.subject,
    normalizeAnswer(activity.topic),
    activity.grade,
    positiveInteger(activity.levelCount, 1),
    positiveInteger(activity.questionsPerLevel, 1),
    activity.difficulty
  ].join("::");
}

function openGenerationDraftDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return resolve(null);
    const request = window.indexedDB.open(GENERATION_DRAFT_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(GENERATION_DRAFT_STORE)) {
        request.result.createObjectStore(GENERATION_DRAFT_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readGenerationDraft(key) {
  const database = await openGenerationDraftDatabase();
  if (!database) return null;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(GENERATION_DRAFT_STORE, "readonly");
    const request = transaction.objectStore(GENERATION_DRAFT_STORE).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

async function writeGenerationDraft(key, activity, levels) {
  const database = await openGenerationDraftDatabase();
  if (!database) return;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(GENERATION_DRAFT_STORE, "readwrite");
    transaction.objectStore(GENERATION_DRAFT_STORE).put({
      key,
      subject: activity.subject,
      topic: activity.topic,
      levelCount: positiveInteger(activity.levelCount, 1),
      questionsPerLevel: positiveInteger(activity.questionsPerLevel, 1),
      levels,
      updatedAt: Date.now()
    });
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

async function deleteGenerationDraft(key) {
  const database = await openGenerationDraftDatabase();
  if (!database) return;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(GENERATION_DRAFT_STORE, "readwrite");
    transaction.objectStore(GENERATION_DRAFT_STORE).delete(key);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

function assessmentSolution(assessment) {
  if (assessment.solution != null && String(assessment.solution).trim()) return String(assessment.solution).trim();
  if (assessment.type === "multiple") return String(assessment.options?.[Number(assessment.correct)] || "");
  if (assessment.type === "matching") return JSON.stringify(assessment.pairs || []);
  if (assessment.type === "keyword" || assessment.type === "fill-blank") return String(assessment.accepted?.[0] || "");
  if (assessment.type === "equation-build") return (assessment.correctSequence || []).join(" ");
  if (assessment.type === "exponent-placement") return (assessment.correctExponents || []).join(",");
  if (assessment.type === "chemical-balance") return (assessment.correctCoefficients || []).join(",");
  if (assessment.type === "numeric-answer") return `${assessment.correctValue ?? ""} ${assessment.unit || ""}`.trim();
  if (assessment.type === "graph-plot") return JSON.stringify(assessment.targetPoints || []);
  if (assessment.type === "sequence-order") return (assessment.correctOrder || []).join(" | ");
  return "";
}

function generatedAssessmentIsComplete(activity, source) {
  if (!source || !isAssessmentCompatibleWithSubject(activity, source)) return false;
  const assessment = normalizeAssessmentSchema(structuredClone(source));
  const hasRequiredText = (value) => typeof value === "string" && value.trim().length > 0;
  if (!hasRequiredText(assessment.prompt) || !hasRequiredText(assessment.feedback) || !hasRequiredText(assessment.context)) return false;
  if (!assessmentSolution(assessment)) return false;
  if (assessment.type === "multiple") {
    return assessment.options?.length >= 3
      && Number.isInteger(Number(assessment.correct))
      && Number(assessment.correct) >= 0
      && Number(assessment.correct) < assessment.options.length;
  }
  if (assessment.type === "matching") return assessment.pairs?.length >= 3;
  if (assessment.type === "keyword") return assessment.accepted?.length > 0;
  if (assessment.type === "fill-blank") {
    const sourceSegments = assessmentList(source.segments).map(String);
    const sourceExpression = String(source.expression || source.formula || source.equation || "");
    const hasAuthoredPhrase = sourceSegments.includes("___")
      && sourceSegments.some((segment) => segment.trim() && segment !== "___");
    return assessment.accepted?.length > 0 && (hasAuthoredPhrase || sourceExpression.includes("___"));
  }
  if (assessment.type === "equation-build") return assessment.pieces?.length > 0 && assessment.correctSequence?.length > 0;
  if (assessment.type === "exponent-placement") return assessment.exponents?.length > 0 && assessment.correctExponents?.length > 0;
  if (assessment.type === "chemical-balance") return assessment.compounds?.length > 0 && assessment.correctCoefficients?.length > 0;
  if (assessment.type === "numeric-answer") return Number.isFinite(Number(assessment.correctValue));
  if (assessment.type === "graph-plot") return assessment.targetPoints?.length > 0;
  if (assessment.type === "sequence-order") return assessment.steps?.length > 0 && assessment.correctOrder?.length > 0;
  return false;
}

function generatedAssessmentSignature(source) {
  const assessment = normalizeAssessmentSchema(structuredClone(source));
  return normalizeAnswer([assessment.prompt, assessmentSolution(assessment), assessment.goal, assessment.feedback].join("::"));
}

function finalizeGeneratedAssessment(activity, source, levelIndex, questionIndex, questionsPerLevel) {
  const globalIndex = (levelIndex * questionsPerLevel) + questionIndex;
  const assessment = normalizeAssessmentSchema(structuredClone(source));
  assessment.subject = activity.subject;
  assessment.levelIndex = levelIndex;
  assessment.questionIndex = questionIndex;
  assessment.globalIndex = globalIndex;
  assessment.levelId = `level-${levelIndex + 1}`;
  assessment.questionId ||= `${assessment.levelId}-question-${questionIndex + 1}`;
  assessment.solution = assessmentSolution(assessment);
  assessment.answerData = {
    type: assessment.type,
    options: assessment.options || [],
    correct: assessment.correct,
    accepted: assessment.accepted || [],
    pairs: assessment.pairs || [],
    pieces: assessment.pieces || [],
    correctSequence: assessment.correctSequence || [],
    correctValue: assessment.correctValue,
    unit: assessment.unit || ""
  };
  assessment.animation = buildQuestionAnimationProfile(activity, assessment, globalIndex);
  assessment.gameplay = buildQuestionGameplayProfile(activity, assessment, globalIndex);
  assessment.experiment = buildQuestionExperiment(activity, assessment, globalIndex);
  return assessment;
}

async function requestAssessmentLevel(activity, levelIndex, questionsNeeded, acceptedQuestions, allAccepted) {
  const level = activity.learningGuide?.levels?.[levelIndex] || {};
  const previousSummary = allAccepted.map((assessment) => ({
    level: Number(assessment.levelIndex) + 1,
    prompt: assessment.prompt,
    solution: assessment.solution || assessmentSolution(assessment),
    type: assessment.type,
    mechanic: assessment.gameplay?.mechanic || assessment.gameplay?.interaction || ""
  }));
  const response = await authFetchJson(buildVeoApiUrl("/api/gemini/generate"), {
    method: "POST",
    body: {
      model: $("#modelSelect").value,
      payload: {
        systemInstruction: {
          parts: [{
            text: "Eres especialista en evaluación STEM para adolescentes. Genera contenido correcto, coherente, breve, verificable y sin repeticiones. Cumple estrictamente el contrato JSON solicitado."
          }]
        },
        contents: [{
          role: "user",
          parts: [{
            text: [
              `Genera exactamente ${questionsNeeded} preguntas nuevas para el nivel ${levelIndex + 1}.`,
              `Materia exclusiva: ${SUBJECT_LABELS[activity.subject]}. Tema: ${activity.topic}. Grado: ${activity.grade}.`,
              `Experiencia obligatoria solicitada por el docente: ${activity.experiencePrompt || "No se proporcionó una instrucción adicional."}`,
              `Objetivo del nivel: ${level.objective || activity.mission}.`,
              `Conceptos del nivel: ${JSON.stringify(level.concepts || [])}.`,
              `Caso aplicado generado por Gemini para este nivel: ${JSON.stringify(level.example || {})}. Las preguntas deben evaluar ese mismo fenómeno, datos, unidades y relación; no sustituyas el caso por una plantilla genérica.`,
              "Todas las preguntas, respuestas y retroalimentaciones deben materializar la experiencia solicitada por el docente.",
              `Dificultad general: ${activity.difficulty}.`,
              `Preguntas válidas ya creadas en este nivel: ${JSON.stringify(acceptedQuestions.map((item) => ({ prompt: item.prompt, solution: item.solution, type: item.type })))}.`,
              `Contenido ya usado en toda la actividad, que no debes repetir: ${JSON.stringify(previousSummary)}.`,
              activity.subject === "math"
                ? "Todo debe ser matemático. Prohibido introducir química, física, biología, reactivos, células, fuerzas o experimentos científicos ajenos al tema."
                : `No mezcles contenido de materias distintas de ${SUBJECT_LABELS[activity.subject]}.`,
              "Cada elemento debe incluir context, given, goal, prompt, type, feedback, solution, gameplay y experiment.",
              "Tipos permitidos: multiple, matching, keyword, equation-build, fill-blank, exponent-placement, chemical-balance, numeric-answer, graph-plot, sequence-order.",
              "Para multiple incluye options y correct. Para matching incluye pairs. Para keyword y fill-blank incluye accepted.",
              "Para equation-build incluye pieces desordenadas y correctSequence. Para exponent-placement incluye bases, exponents y correctExponents.",
              "Para chemical-balance incluye compounds y correctCoefficients. Para numeric-answer incluye correctValue, tolerance y unit.",
              "Para graph-plot incluye axes y targetPoints. Para sequence-order incluye steps desordenados y correctOrder.",
              "La retroalimentación debe explicar la solución concreta y corregir un error conceptual. No uses textos genéricos.",
              "Cada pregunta debe ser semánticamente distinta: no reutilices el mismo enunciado, fórmula, datos, incógnita ni resultado de otra pregunta, incluso si cambias su tipo o redacción.",
              "Varía las mecánicas y no repitas la mecánica de la pregunta anterior cuando exista una alternativa apropiada.",
              "Devuelve únicamente JSON con la forma {\"assessments\": [...]}."
            ].join("\n")
          }]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: .72
        }
      }
    }
  });
  const generated = parseGeneratedJson(extractResponseText(response));
  return Array.isArray(generated?.assessments) ? generated.assessments : [];
}

async function generateAssessmentsWithGemini(activity) {
  if (activity.gameMode === "simulator") return [];
  const levelCount = positiveInteger(activity.levelCount, 3);
  const questionsPerLevel = positiveInteger(activity.questionsPerLevel, 3);
  const expectedCount = levelCount * questionsPerLevel;
  const draftKey = generationDraftKey(activity);
  const storedDraft = await readGenerationDraft(draftKey).catch(() => null);
  const signatures = new Set();
  const levelDrafts = Array.from({ length: levelCount }, (_, levelIndex) => {
    const stored = Array.isArray(storedDraft?.levels?.[levelIndex]) ? storedDraft.levels[levelIndex] : [];
    return stored.reduce((accepted, assessment) => {
      if (accepted.length >= questionsPerLevel || !generatedAssessmentIsComplete(activity, assessment)) return accepted;
      const signature = generatedAssessmentSignature(assessment);
      if (!signature || signatures.has(signature)) return accepted;
      signatures.add(signature);
      accepted.push(finalizeGeneratedAssessment(activity, assessment, levelIndex, accepted.length, questionsPerLevel));
      return accepted;
    }, []);
  });

  for (let levelIndex = 0; levelIndex < levelCount; levelIndex += 1) {
    let attempts = 0;
    while (levelDrafts[levelIndex].length < questionsPerLevel && attempts < 4) {
      attempts += 1;
      const missing = questionsPerLevel - levelDrafts[levelIndex].length;
      let candidates = [];
      try {
        candidates = await requestAssessmentLevel(activity, levelIndex, missing, levelDrafts[levelIndex], levelDrafts.flat());
      } catch (error) {
        console.warn(`[ScienceActivities] No se pudo generar el lote del nivel ${levelIndex + 1}:`, error);
        continue;
      }
      for (const candidate of candidates) {
        if (levelDrafts[levelIndex].length >= questionsPerLevel) break;
        if (!generatedAssessmentIsComplete(activity, candidate)) continue;
        const signature = generatedAssessmentSignature(candidate);
        if (!signature || signatures.has(signature)) continue;
        const questionIndex = levelDrafts[levelIndex].length;
        levelDrafts[levelIndex].push(finalizeGeneratedAssessment(activity, candidate, levelIndex, questionIndex, questionsPerLevel));
        signatures.add(signature);
      }
      await writeGenerationDraft(draftKey, activity, levelDrafts).catch((error) => {
        console.warn("[ScienceActivities] No se pudo guardar el borrador parcial:", error);
      });
    }
    if (levelDrafts[levelIndex].length !== questionsPerLevel) {
      throw new Error(`El nivel ${levelIndex + 1} quedó incompleto. Se conservaron ${levelDrafts[levelIndex].length} de ${questionsPerLevel} preguntas para reanudar.`);
    }
  }
  const assessments = levelDrafts.flat();
  if (assessments.length !== expectedCount) {
    throw new Error(`La actividad quedó incompleta: se esperaban ${expectedCount} preguntas y se generaron ${assessments.length}.`);
  }
  await deleteGenerationDraft(draftKey).catch(() => {});
  return assessments;
}

async function generateWithGemini() {
  if (state.generating) return;
  const previousActivity = state.activity;
  let generationSucceeded = false;
  const requestedExperience = $("#experiencePrompt").value.trim();
  if (!requestedExperience) {
    showToast("Describe qué deben experimentar los estudiantes.");
    $("#experiencePrompt").focus();
    return;
  }
  const selectedSubject = $("#subjectSelect").value;
  const selectedTopic = getSelectedTopic();
  if (state.activity.subject !== selectedSubject || state.activity.topic !== selectedTopic) {
    state.activity = buildTopicActivity(selectedSubject, selectedTopic, getSelectedScenario());
  }
  state.activity.subject = selectedSubject;
  state.activity.topic = selectedTopic;
  state.activity.experiencePrompt = requestedExperience;
  state.activity.scenario = structuredClone(getSelectedScenario());
  if (selectedSubject === "math") {
    const mathTemplate = resolveTopicTemplate("math", selectedTopic);
    state.activity.simulationType = "math";
    state.activity.variant = mathTemplate.variant;
    state.activity.grade = $("#gradeSelect").value || SUBJECT_DEFAULT_GRADES.math;
    state.activity.controls = structuredClone(CONTROL_PRESETS.math);
    state.activity.simulator = {
      ...(state.activity.simulator || {}),
      modelId: mathTemplate.variant,
      formula: STEM_MODEL_REGISTRY[mathTemplate.variant]?.formula || "Relación matemática",
      values: {}
    };
  }
  state.generating = true;
  setGenerating(true);
  try {
    const response = await authFetchJson(buildVeoApiUrl("/api/gemini/generate"), {
      method: "POST",
      body: {
        model: $("#modelSelect").value,
        payload: {
          systemInstruction: {
            parts: [{
              text: "Eres diseñador senior de simulaciones STEM 2D para secundaria. Devuelve JSON válido y pedagógicamente correcto. No inventes leyes científicas. Diseña experimentos breves, visuales, inclusivos y seguros."
            }]
          },
          contents: [{ role: "user", parts: [{ text: buildPrompt() }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: ACTIVITY_SCHEMA,
            temperature: .74
          }
        }
      }
    });
    const generatedActivity = parseGeneratedJson(extractResponseText(response));
    generatedActivity.subject = selectedSubject;
    generatedActivity.topic = selectedTopic;
    generatedActivity.experiencePrompt = requestedExperience;
    generatedActivity.scenario = structuredClone(getSelectedScenario());
    if (selectedSubject === "math") {
      generatedActivity.simulationType = "math";
      generatedActivity.variant = resolveTopicTemplate("math", selectedTopic).variant;
    }
    state.activity = normalizeActivity(generatedActivity);
    state.activity.levelCount = Number($("#gameLevelCount").value);
    state.activity.questionsPerLevel = Number($("#questionsPerLevel").value);
    state.activity.difficulty = $("#difficultySelect").value;
    state.activity.gameMode = $("#gameModeSelect").value;
    state.activity.visualStyle = $("#visualStyleSelect").value;
    const [learningGuide, playerSprite] = await Promise.all([
      generateLearningGuideWithGemini(state.activity),
      state.activity.gameMode === "simulator"
        ? Promise.resolve(null)
        : Promise.resolve(
          state.activity.playerCharacter
            ? createCharacterSprite(state.activity.playerCharacter)
            : state.activity.playerSprite,
        )
    ]);
    state.activity.learningGuide = normalizeLearningGuideForSubject(state.activity, learningGuide);
    state.activity.playerSprite = playerSprite;
    state.activity.assessments = await generateAssessmentsWithGemini(state.activity);
    const expectedQuestionCount = positiveInteger(state.activity.levelCount, 1)
      * positiveInteger(state.activity.questionsPerLevel, 1);
    if (state.activity.gameMode !== "simulator" && state.activity.assessments.length !== expectedQuestionCount) {
      throw new Error(`No se completaron las ${expectedQuestionCount} preguntas solicitadas.`);
    }
    state.activity.generation = {
      complete: true,
      levelCount: positiveInteger(state.activity.levelCount, 1),
      questionsPerLevel: positiveInteger(state.activity.questionsPerLevel, 1),
      totalQuestions: expectedQuestionCount,
      completedAt: Date.now()
    };
    ensureActivityAssessments(state.activity);
    sanitizeVisibleActivityCopy(state.activity);
    syncActivityToEditor();
    state.previewActivity = structuredClone(state.activity);
    await renderGame();
    generationSucceeded = true;
    showToast("La IA creó una nueva simulación interactiva.");
  } catch (error) {
    console.error("[ScienceActivities] AI generation failed:", error);
    state.activity = previousActivity;
    showToast(error?.message || "No fue posible completar la actividad. Puedes reanudar la generación.");
  } finally {
    state.generating = false;
    await setGenerating(false, { materializePreview: generationSucceeded });
  }
}

async function setGenerating(active, options = {}) {
  const overlay = $("#generationOverlay");
  const preview = $(".sa-stage");
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (active) {
    overlay.classList.remove("is-completing", "is-revealing");
    preview?.classList.remove("sa-preview-materialize");
    overlay.style.removeProperty("--sa-spark-x");
    overlay.style.removeProperty("--sa-spark-y");
    overlay.classList.add("show");
  } else if (options.materializePreview) {
    const target = $(".sa-game-frame") || preview;
    const targetRect = target?.getBoundingClientRect();
    const originX = window.innerWidth / 2;
    const originY = window.innerHeight * .42;
    const targetX = targetRect
      ? Math.min(window.innerWidth - 24, Math.max(24, targetRect.left + (targetRect.width / 2)))
      : originX;
    const targetY = targetRect
      ? Math.min(window.innerHeight - 24, Math.max(24, targetRect.top + (targetRect.height / 2)))
      : originY;
    overlay.style.setProperty("--sa-spark-x", `${Math.round(targetX - originX)}px`);
    overlay.style.setProperty("--sa-spark-y", `${Math.round(targetY - originY)}px`);
    overlay.classList.add("is-completing");
    await new Promise((resolve) => window.setTimeout(resolve, reducedMotion ? 40 : 1400));
    preview?.classList.remove("sa-preview-materialize");
    if (preview) void preview.offsetWidth;
    preview?.classList.add("sa-preview-materialize");
    overlay.classList.add("is-revealing");
    await new Promise((resolve) => window.setTimeout(resolve, reducedMotion ? 20 : 240));
    overlay.classList.remove("show");
  } else {
    overlay.classList.remove("show");
  }
  document.body.classList.toggle("sa-is-generating", active);
  overlay.setAttribute("aria-hidden", String(!active));
  $("#formGenerateBtn").disabled = active;
  $("#generateBtn").disabled = active;
  $("#generateExperienceBtn").disabled = active;
  const generationStatus = $("#generationStatus");
  if (generationStatus) {
    generationStatus.classList.toggle("generating", active);
    generationStatus.innerHTML = active ? "<i></i> La IA está diseñando…" : "<i></i> Listo para experimentar";
  }
  if (!active) {
    window.setTimeout(() => {
      overlay.classList.remove("is-completing", "is-revealing");
    }, reducedMotion ? 30 : 260);
  }
}

async function renderGame(options = {}) {
  installScienceActivitiesMotion($(".sa-game-frame"));
  const resetProgress = options?.resetProgress === true
    || options?.currentTarget?.id === "restartPreviewBtn";
  const previewActivity = state.previewActivity || structuredClone(state.activity);
  if (!state.previewActivity) state.previewActivity = structuredClone(previewActivity);
  state.assessmentController?.dispose?.();
  state.gameInstance?.destroy?.();
  const activityChanged = state.editorReviewActivityRef !== previewActivity;
  if (resetProgress || activityChanged || !state.editorReviewProgress) {
    state.editorReviewProgress = createReviewProgressState();
  }
  state.editorReviewActivityRef = previewActivity;
  $(".sa-game-frame").dataset.visualStyle = previewActivity.visualStyle || "kawaii-lab";
  const runtimeActivity = structuredClone(previewActivity);
  runtimeActivity.scenario = { ...(runtimeActivity.scenario || {}), label: "" };
  state.gameInstance = await createScienceGame("#scienceGameMount", "#scienceGameControls", runtimeActivity, {
    onSuccess: () => {}
  });
  installAccessibleGameState(state.gameInstance);
  mountAssessmentFlow(previewActivity);
  mountEditorQuestionReviewButton();
}

async function restartPreviewFromBeginning() {
  const button = $("#restartPreviewBtn");
  if (button?.dataset.restarting === "true") return;
  if (button) {
    button.dataset.restarting = "true";
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  }
  try {
    state.editorReviewProgress = createReviewProgressState();
    state.gameProgress = null;
    await renderGame({ resetProgress: true });
    showToast("Juego reiniciado desde el primer nivel.");
  } catch (error) {
    console.error("[ScienceActivities] No fue posible reiniciar el juego:", error);
    showToast("No fue posible reiniciar el juego.");
  } finally {
    if (button) {
      button.dataset.restarting = "false";
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }
}

function applyInspectorTab(tabName) {
  const inspector = $(".sa-inspector");
  if (!inspector) return;
  const activeTab = ["general", "objectives", "questions", "help"].includes(tabName) ? tabName : "general";
  state.inspectorTab = activeTab;
  inspector.dataset.activeTab = activeTab;
  inspector.querySelectorAll("[data-inspector-tab]").forEach((button) => {
    const selected = button.dataset.inspectorTab === activeTab;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  inspector.querySelectorAll("[data-inspector-group]").forEach((element) => {
    const group = element.dataset.inspectorGroup;
    element.hidden = group === "editor"
      ? !["objectives", "questions"].includes(activeTab)
      : group !== activeTab;
  });
  inspector.querySelectorAll("[data-editor-pane]").forEach((pane) => {
    pane.hidden = pane.dataset.editorPane !== activeTab;
  });
}

function initializeInspectorTabs() {
  const inspector = $(".sa-inspector");
  if (!inspector) return;
  const title = inspector.querySelector(".sa-panel-title");
  let tabs = inspector.querySelector(".sa-inspector-tabs");
  if (!tabs) {
    tabs = document.createElement("div");
    tabs.className = "sa-inspector-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.innerHTML = `
      <button type="button" role="tab" data-inspector-tab="general"><i class="fas fa-pen-to-square"></i><span>General</span></button>
      <button type="button" role="tab" data-inspector-tab="objectives"><i class="fas fa-bullseye"></i><span>Objetivos</span></button>
      <button type="button" role="tab" data-inspector-tab="questions"><i class="fas fa-list-check"></i><span>Preguntas</span></button>
      <button type="button" role="tab" data-inspector-tab="help"><i class="fas fa-lightbulb"></i><span>Ayuda</span></button>`;
    title?.insertAdjacentElement("afterend", tabs);
    tabs.addEventListener("click", (event) => {
      const button = event.target.closest("[data-inspector-tab]");
      if (button) applyInspectorTab(button.dataset.inspectorTab);
    });
  }

  ["activityTitle", "missionInput", "principleInput"].forEach((id) => {
    document.getElementById(id)?.closest(".sa-field")?.setAttribute("data-inspector-group", "general");
  });
  const contentScroll = inspector.querySelector(".sa-content-scroll") || inspector;
  contentScroll.querySelectorAll(":scope > .sa-inspector-section:not(#scienceContentEditor)").forEach((section) => {
    section.dataset.inspectorGroup = "help";
  });
  const contentEditor = $("#scienceContentEditor");
  if (contentEditor) contentEditor.dataset.inspectorGroup = "editor";
  const applyButton = $("#applyContentChanges");
  if (applyButton) {
    const destination = state.activity.gameMode === "simulator" ? "simulador" : "preview";
    applyButton.innerHTML = `
      <span class="sa-action-sheen" aria-hidden="true"></span>
      <i class="fas fa-play" aria-hidden="true"></i>
      <span>Aplicar cambios al ${destination}</span>`;
    if (!applyButton.dataset.bound) {
      applyButton.dataset.bound = "true";
      applyButton.addEventListener("click", () => {
        syncEditorToActivity();
        showToast("Cambios guardados en el borrador. Crea la actividad para actualizar el preview.");
      });
    }
  }
  applyInspectorTab(state.inspectorTab || "general");
}

function initializeRightPanelResize() {
  const page = $(".sa-page");
  const workspace = $(".sa-workspace");
  if (!page || !workspace) return;

  const panelCollapsedKeys = ["scienceActivities.inspectorCollapsed", "scienceActivities.briefCollapsed"];
  const PREVIEW_MIN_WIDTH = 280;
  const COLLAPSED_PANEL_WIDTH = 0;
  panelCollapsedKeys.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch (_) {}
  });

  const panelConfigs = [
    {
      selector: ".sa-inspector",
      variable: "--sa-inspector-width",
      widthKey: "scienceActivities.inspectorWidth",
      collapsedKey: "scienceActivities.inspectorCollapsed",
      workspaceClass: "sa-inspector-collapsed",
      defaultWidth: 350,
      minWidth: 280,
      maxWidth: 620,
      headerContainer: "#sa-panelHeaderControls",
      label: "Contenido",
      collapsible: true
    },
    {
      selector: ".sa-brief",
      variable: "--sa-brief-width",
      widthKey: "scienceActivities.briefWidth",
      collapsedKey: "scienceActivities.briefCollapsed",
      workspaceClass: "sa-brief-collapsed",
      defaultWidth: 320,
      minWidth: 280,
      maxWidth: 560,
      headerContainer: "#sa-panelHeaderControls",
      label: "Objetivos",
      collapsible: true
    },
    {
      selector: ".sa-sessions",
      variable: "--sa-sessions-width",
      widthKey: "scienceActivities.sessionsWidth",
      defaultWidth: 185,
      minWidth: 150,
      maxWidth: 460,
      resizerSide: "right",
      label: "Sesiones",
      collapsible: false
    }
  ];

  const toNumber = (value, fallback = 0) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const panelStates = new Map();

  const currentWorkspaceWidth = () => {
    const width = toNumber(workspace.clientWidth, 0);
    if (width > 0) return width;
    return toNumber(toNumber(getComputedStyle(workspace).width, "0"), 0);
  };

  const currentPanelWidth = (state, fallback) => {
    if (!state) return fallback;
    const fromCss = toNumber(getComputedStyle(page).getPropertyValue(state.config.variable), toNumber(fallback, 0));
    if (state.collapsed) return COLLAPSED_PANEL_WIDTH;
    return fromCss;
  };

  const enforceRightPanelBudget = (sourceSelector) => {
    const inspectorState = panelStates.get(".sa-inspector");
    const briefState = panelStates.get(".sa-brief");
    if (!inspectorState || !briefState) return;

    const workspaceWidth = currentWorkspaceWidth();
    const maxRightColumns = Math.max(0, workspaceWidth - PREVIEW_MIN_WIDTH);
    if (maxRightColumns <= 0) return;

    let inspectorWidth = currentPanelWidth(inspectorState, stateFromKey(".sa-inspector"));
    let briefWidth = currentPanelWidth(briefState, stateFromKey(".sa-brief"));
    let overflow = inspectorWidth + briefWidth - maxRightColumns;
    if (overflow <= 0) return;

    const sourceState = panelStates.get(sourceSelector) || {};
    const firstSelector = sourceState.config?.selector === ".sa-inspector" ? ".sa-brief" : ".sa-inspector";
    const secondSelector = sourceState.config?.selector === ".sa-inspector" ? ".sa-inspector" : ".sa-brief";
    const first = panelStates.get(firstSelector);
    const second = panelStates.get(secondSelector);

    const shrink = (state, amount) => {
      if (!state || state.collapsed || amount <= 0) return amount;
      const stateMin = state.config.minWidth;
      const current = state.collapsed ? COLLAPSED_PANEL_WIDTH : currentPanelWidth(state, state.config.defaultWidth);
      const keep = Math.max(stateMin, current - amount);
      const reduced = current - keep;
      if (reduced <= 0) return amount;
      setPanelWidth(state, keep, false);
      return amount - reduced;
    };

    overflow = shrink(first, overflow);
    overflow = shrink(second, overflow);

    if (overflow > 0) {
      const fallbackState = first?.collapsed ? null : first;
      if (fallbackState) {
        applyCollapsedState(fallbackState, true, false);
      }
      inspectorWidth = currentPanelWidth(inspectorState, stateFromKey(".sa-inspector"));
      briefWidth = currentPanelWidth(briefState, stateFromKey(".sa-brief"));
      overflow = inspectorWidth + briefWidth - maxRightColumns;
      if (overflow > 0 && second && !second.collapsed) applyCollapsedState(second, true, false);
    }

    enforceSessionsWidth();
  };

  const enforceSessionsWidth = () => {
    const sessionState = panelStates.get(".sa-sessions");
    const inspectorState = panelStates.get(".sa-inspector");
    const briefState = panelStates.get(".sa-brief");
    if (!sessionState || !inspectorState || !briefState) return;

    const pageWidth = toNumber(page.clientWidth, toNumber(getComputedStyle(page).width, 0));
    if (!pageWidth) return;

    const rightOpenWidth = currentPanelWidth(inspectorState, toNumber(inspectorState.config.defaultWidth, 0))
      + currentPanelWidth(briefState, toNumber(briefState.config.defaultWidth, 0));
    const maxSessions = Math.max(sessionState.config.minWidth, pageWidth - (PREVIEW_MIN_WIDTH + rightOpenWidth));
    if (sessionState.expandedWidth > maxSessions) {
      setPanelWidth(sessionState, maxSessions, false);
    }
  };

  const stateFromKey = (selector) => {
    const state = panelStates.get(selector);
    return state ? state.expandedWidth : 0;
  };

  const setPanelWidth = (state, width, persist = true) => {
    const safe = Math.max(state.config.minWidth, Math.min(state.config.maxWidth, Math.round(width)));
    state.expandedWidth = safe;
    if (!state.collapsed) {
      workspace.style.setProperty(state.config.variable, `${safe}px`);
      page.style.setProperty(state.config.variable, `${safe}px`);
      if (state.handle) state.handle.setAttribute("aria-valuenow", String(safe));
      if (persist && state.config.widthKey) {
        localStorage.setItem(state.config.widthKey, String(safe));
      }
    }
  };

  const applyCollapsedState = (state, nextCollapsed, persist = true) => {
    if (!state.config.collapsible) return;

    state.collapsed = nextCollapsed;
    state.panel.classList.toggle("is-collapsed", state.collapsed);
    if (state.config.workspaceClass) {
      workspace.classList.toggle(state.config.workspaceClass, state.collapsed);
    }

    if (state.collapsed) {
      workspace.style.setProperty(state.config.variable, `${COLLAPSED_PANEL_WIDTH}px`);
      page.style.setProperty(state.config.variable, `${COLLAPSED_PANEL_WIDTH}px`);
    } else {
      const storedWidth = state.expandedWidth;
      workspace.style.setProperty(state.config.variable, `${storedWidth}px`);
      page.style.setProperty(state.config.variable, `${storedWidth}px`);
    }

    if (state.collapseButton) {
      const label = `${state.collapsed ? "Expandir" : "Contraer"} panel ${state.config.label}`;
      state.collapseButton.setAttribute("aria-expanded", String(!state.collapsed));
      state.collapseButton.setAttribute("aria-label", label);
      state.collapseButton.title = label;
      state.collapseButton.setAttribute("data-tooltip", label);
      state.collapseButton.classList.toggle("is-collapsed", state.collapsed);
    }

    if (state.handle) {
      state.handle.setAttribute("aria-valuenow", state.collapsed ? String(COLLAPSED_PANEL_WIDTH) : String(state.expandedWidth));
    }
    if (persist && state.config.collapsedKey) {
      localStorage.setItem(state.config.collapsedKey, String(state.collapsed));
    }

    enforceRightPanelBudget(state.config.selector);
    enforceSessionsWidth();
  };

  panelConfigs.forEach((config) => {
    const panel = $(config.selector);
    if (!panel || panel.dataset.resizableReady) return;
    panel.dataset.resizableReady = "true";
    panel.classList.add("sa-dock-panel");
    panel.querySelectorAll(".sa-panel-title .sa-panel-collapse").forEach((button) => button.remove());

    const rawCssWidth = getComputedStyle(workspace).getPropertyValue(config.variable).trim();
    const cssDefaultWidth = Number.parseFloat(rawCssWidth.replace("px", ""));
    const startWidthDefault = Number.isFinite(cssDefaultWidth) ? cssDefaultWidth : config.defaultWidth;
    const storedWidth = Number.parseFloat(localStorage.getItem(config.widthKey) || "");
    const initialWidth = Number.isFinite(storedWidth) ? storedWidth : startWidthDefault;
    let expandedWidth = Math.max(config.minWidth, Math.min(config.maxWidth, Math.round(initialWidth)));
    const state = { config, panel, handle: null, collapseButton: null, expandedWidth, collapsed: false };
    panelStates.set(config.selector, state);

    const handle = document.createElement("div");
    handle.className = `sa-dock-resizer ${config.selector === ".sa-brief" ? "sa-brief-resizer" : config.selector === ".sa-sessions" ? "sa-sessions-resizer" : "sa-inspector-resizer"}${config.resizerSide === "right" ? " sa-dock-resizer-right" : " sa-dock-resizer-left"}`;
    handle.tabIndex = 0;
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", "vertical");
    handle.setAttribute("aria-valuemin", String(config.minWidth));
    handle.setAttribute("aria-valuemax", String(config.maxWidth));
    handle.setAttribute("aria-label", `Cambiar ancho del panel ${config.label}`);
    if (config.resizerSide === "right") {
      panel.append(handle);
    } else {
      panel.prepend(handle);
    }
    state.handle = handle;
    handle.setAttribute("aria-valuemin", String(config.minWidth));
    handle.setAttribute("aria-valuemax", String(config.maxWidth));

    const makeCollapsible = config.collapsible !== false;
    const collapseButton = makeCollapsible ? document.createElement("button") : null;
    if (collapseButton) {
      collapseButton.className = "sa-panel-collapse sa-icon-button";
      collapseButton.type = "button";
      collapseButton.innerHTML = '<i class="fas fa-chevron-right" aria-hidden="true"></i>';
      const headerControlHost = document.querySelector(config.headerContainer || ".sa-summary");
      if (headerControlHost) headerControlHost.appendChild(collapseButton);
    }
    state.collapseButton = collapseButton;

    const setWidth = (width, persist = true) => {
      if (state.collapsed) return;
      setPanelWidth(state, width, persist);
      enforceRightPanelBudget(config.selector);
      enforceSessionsWidth();
    };

    const toggleCollapse = () => applyCollapsedState(state, !state.collapsed, true);

    setPanelWidth(state, expandedWidth, false);
    const normalized = currentPanelWidth(state, state.config.defaultWidth);
    if (normalized !== expandedWidth) setPanelWidth(state, normalized, false);
    if (makeCollapsible) {
      applyCollapsedState(state, state.collapsed, false);
      collapseButton.addEventListener("click", toggleCollapse);
    } else {
      state.collapsed = false;
      workspace.style.setProperty(config.variable, `${expandedWidth}px`);
    }

    const moveStep = (direction) => {
      if (config.resizerSide === "right") {
        return direction === "left" ? -16 : 16;
      }
      return direction === "left" ? 16 : -16;
    };

    handle.addEventListener("pointerdown", (event) => {
      if (state.collapsed) return;
      const startX = event.clientX;
      const startWidth = panel.getBoundingClientRect().width;
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add("sa-resizing-panel");
      const move = (moveEvent) => {
        const delta = moveEvent.clientX - startX;
        if (config.resizerSide === "right") {
          setWidth(startWidth + delta);
        } else {
          setWidth(startWidth - delta);
        }
      };
      const stop = () => {
        handle.removeEventListener("pointermove", move);
        document.body.classList.remove("sa-resizing-panel");
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", stop, { once: true });
      handle.addEventListener("pointercancel", stop, { once: true });
    });
    handle.addEventListener("keydown", (event) => {
      if (state.collapsed || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const delta = moveStep(event.key === "ArrowLeft" ? "left" : "right");
      setWidth(state.expandedWidth + delta);
    });
  });

  enforceRightPanelBudget(".sa-inspector");
  enforceSessionsWidth();
}

function updateGameModeUI() {
  const isSimulator = $("#gameModeSelect")?.value === "simulator";
  const questionsField = $("#questionsPerLevelField");
  if (questionsField) questionsField.hidden = isSimulator;
  const structureFields = $("#gameStructureFields");
  if (structureFields) structureFields.hidden = isSimulator;
  const questionsTab = document.querySelector('[data-inspector-tab="questions"]');
  const objectivesTab = document.querySelector('[data-inspector-tab="objectives"]');
  if (questionsTab) {
    questionsTab.hidden = false;
    const label = questionsTab.querySelector("span");
    if (label) label.textContent = isSimulator ? "Variables" : "Preguntas";
  }
  if (objectivesTab) {
    const label = objectivesTab.querySelector("span");
    if (label) label.textContent = isSimulator ? "Modelo" : "Objetivos";
  }
  const note = document.querySelector(".sa-form-note");
  if (note) {
    note.textContent = isSimulator
      ? "El simulador permite modificar variables, ejecutar el modelo, pausar y restablecer sus valores."
      : "El tema es una referencia. El sistema diseña la misión, las preguntas, las mecánicas y el desafío experimental.";
  }
  const titleField = $("#activityTitle")?.closest("label");
  if (titleField?.querySelector("span")) titleField.querySelector("span").textContent = isSimulator ? "Título del simulador" : "Título del juego";
}

function syncActivityToEditor() {
  const activity = state.activity;
  $("#subjectSelect").value = activity.subject;
  fillTopicSuggestions();
  const isCatalogTopic = (TOPICS[activity.subject] || []).includes(activity.topic);
  $("#topicInput").value = isCatalogTopic ? activity.topic : CUSTOM_TOPIC_VALUE;
  $("#customTopicInput").value = isCatalogTopic ? "" : activity.topic;
  toggleCustomTopicField();
  fillScenarioOptions(activity.scenario?.id);
  $("#visualStyleSelect").value = activity.visualStyle || "kawaii-lab";
  if (activity.playerSprite?.dataUrl && !activity.playerCharacter) {
    activity.playerCharacter = {
      id: `existing-${activity.subject || "science"}-${activity.visualStyle || "kawaii-lab"}`,
      name: "Personaje personalizado",
      role: "Personaje existente",
      subject: activity.subject || "physics",
      visualStyle: activity.visualStyle || "kawaii-lab",
      palette: ["#50d6b4", "#ff6f91", "#183b4e", "#ffd166"],
      custom: true,
    };
    activity.playerSprite.characterId = activity.playerCharacter.id;
  }
  const characters = fillCharacterOptions(activity.playerCharacter?.id, activity.playerCharacter);
  const selectedCharacter = characters.find((item) => item.id === $("#characterSelect")?.value) || characters[0];
  if (selectedCharacter && !activity.playerSprite?.dataUrl) {
    activity.playerCharacter = structuredClone(selectedCharacter);
    activity.playerSprite = createCharacterSprite(selectedCharacter);
  }
  renderCharacterPreview();
  $("#gameModeSelect").value = activity.gameMode || "game";
  $("#difficultySelect").value = activity.difficulty || $("#difficultySelect").value || "balanced";
  $("#gradeSelect").value = activity.grade || SUBJECT_DEFAULT_GRADES[activity.subject] || "2º secundaria";
  $("#gameLevelCount").value = String(activity.levelCount || 3);
  $("#questionsPerLevel").value = String(activity.questionsPerLevel || 3);
  $("#experiencePrompt").value = activity.experiencePrompt ?? "";
  $("#activityTitle").value = activity.title;
  $("#missionInput").value = activity.mission;
  $("#principleInput").value = activity.scientificPrinciple;
  $("#previewTitle").textContent = activity.title;
  setOptionalText("#summarySubject", SUBJECT_LABELS[activity.subject]);
  setOptionalText("#summarySimulation", SIMULATION_LABELS[activity.simulationType]);
  renderTips();
  renderContentEditor();
  initializeInspectorTabs();
  updateGameModeUI();
  initializeRightPanelResize();
  scheduleLocalDraftSave();
}

function syncEditorToActivity() {
  state.activity.experiencePrompt = $("#experiencePrompt").value.trim();
  state.activity.title = $("#activityTitle").value.trim() || "Science Activity";
  state.activity.mission = $("#missionInput").value.trim();
  state.activity.scientificPrinciple = $("#principleInput").value.trim();
  state.activity.subject = $("#subjectSelect").value;
  state.activity.grade = $("#gradeSelect").value;
  state.activity.gameMode = $("#gameModeSelect").value;
  state.activity.topic = getSelectedTopic();
  state.activity.levelCount = Number($("#gameLevelCount").value);
    state.activity.questionsPerLevel = Number($("#questionsPerLevel").value);
    state.activity.difficulty = $("#difficultySelect").value;
    state.activity.gameMode = $("#gameModeSelect").value;
  state.activity.visualStyle = $("#visualStyleSelect").value;
  state.activity.scenario = structuredClone(getSelectedScenario());
  sanitizeVisibleActivityCopy(state.activity);
  $("#previewTitle").textContent = state.activity.title;
  setOptionalText("#summarySubject", SUBJECT_LABELS[state.activity.subject]);
}

function fillTopicSuggestions() {
  const topics = TOPICS[$("#subjectSelect").value] || [];
  const currentTopic = $("#topicInput").value;
  $("#topicInput").innerHTML = `${topics.map((topic) => `<option value="${escapeHtml(topic)}">${escapeHtml(topic)}</option>`).join("")}
    <option value="${CUSTOM_TOPIC_VALUE}">Otro tema…</option>`;
  $("#topicInput").value = topics.includes(currentTopic) || currentTopic === CUSTOM_TOPIC_VALUE ? currentTopic : (topics[0] || CUSTOM_TOPIC_VALUE);
}

function getSelectedTopic() {
  return $("#topicInput").value === CUSTOM_TOPIC_VALUE
    ? $("#customTopicInput").value.trim()
    : $("#topicInput").value.trim();
}

function toggleCustomTopicField() {
  const isCustom = $("#topicInput").value === CUSTOM_TOPIC_VALUE;
  $("#customTopicField").hidden = !isCustom;
  $("#customTopicInput").required = isCustom;
  if (isCustom) window.requestAnimationFrame(() => $("#customTopicInput").focus());
}

function fillScenarioOptions(selectedId = "") {
  const subject = $("#subjectSelect").value;
  const scenarios = SCENARIOS[subject]?.length
    ? SCENARIOS[subject]
    : buildScenarioCatalog(subject);
  $("#scenarioSelect").innerHTML = scenarios.map((scenario) => `<option value="${scenario.id}">${escapeHtml(scenario.label)}</option>`).join("");
  const topicMatch = scenarios.find((scenario) => scenario.topic.toLowerCase() === getSelectedTopic().toLowerCase());
  $("#scenarioSelect").value = scenarios.some((scenario) => scenario.id === selectedId) ? selectedId : (topicMatch?.id || scenarios[0]?.id || "");
  $("#scenarioSelect").disabled = scenarios.length === 0;
}

function getSelectedScenario() {
  const subject = $("#subjectSelect").value;
  const scenarios = SCENARIOS[subject]?.length
    ? SCENARIOS[subject]
    : buildScenarioCatalog(subject);
  const baseScenario = scenarios.find((scenario) => scenario.id === $("#scenarioSelect").value) || scenarios[0];
  const customTopic = getSelectedTopic();
  if ($("#topicInput").value !== CUSTOM_TOPIC_VALUE || !customTopic) return baseScenario;
  return {
    ...baseScenario,
    label: `${customTopic} · Escenario libre`,
    topic: customTopic,
    motif: `${slugify(customTopic)}-${baseScenario.biome}`
  };
}

function matchScenarioToTopic() {
  const scenarios = SCENARIOS[$("#subjectSelect").value] || [];
  toggleCustomTopicField();
  const selectedTopic = getSelectedTopic();
  if ($("#topicInput").value === CUSTOM_TOPIC_VALUE) {
    if (!selectedTopic) return;
    state.activity = buildTopicActivity($("#subjectSelect").value, selectedTopic, getSelectedScenario());
    $("#experiencePrompt").value = "";
    syncActivityToEditor();
    return;
  }
  const match = scenarios.find((scenario) => scenario.topic.toLowerCase() === selectedTopic.toLowerCase());
  if (match) {
    $("#scenarioSelect").value = match.id;
    state.activity = buildTopicActivity($("#subjectSelect").value, match.topic, match);
    $("#experiencePrompt").value = "";
    syncActivityToEditor();
    return;
  }
  syncEditorToActivity();
}

function renderTips() {
  $("#coachTips").innerHTML = state.activity.coachTips.map((tip, index) => `
    <div class="sa-tip">${escapeHtml(tip)}<button type="button" data-remove-tip="${index}" aria-label="Eliminar consejo"><i class="fas fa-xmark"></i></button></div>
  `).join("");
}

function openOfflineDatabase() {
  if (offlineDbPromise) return offlineDbPromise;
  offlineDbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB no está disponible."));
      return;
    }
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OFFLINE_SESSIONS_STORE)) {
        database.createObjectStore(OFFLINE_SESSIONS_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(OFFLINE_DRAFTS_STORE)) {
        database.createObjectStore(OFFLINE_DRAFTS_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("No fue posible abrir IndexedDB."));
  });
  return offlineDbPromise;
}

async function readOfflineStore(storeName) {
  const database = await openOfflineDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function persistOfflineSessions(sessions = state.sessions) {
  const database = await openOfflineDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(OFFLINE_SESSIONS_STORE, "readwrite");
    const store = transaction.objectStore(OFFLINE_SESSIONS_STORE);
    store.clear();
    sessions.forEach((session) => store.put(structuredClone(session)));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function persistOfflineDraft(activity = state.activity, updatedAt = new Date().toISOString()) {
  const database = await openOfflineDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(OFFLINE_DRAFTS_STORE, "readwrite");
    transaction.objectStore(OFFLINE_DRAFTS_STORE).put({
      key: "current",
      updatedAt,
      activity: structuredClone(activity)
    });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function loadOfflineDraft() {
  let offlineDraft = null;
  try {
    const drafts = await readOfflineStore(OFFLINE_DRAFTS_STORE);
    offlineDraft = drafts.find((item) => item.key === "current") || null;
  } catch (error) {
    console.warn("[ScienceActivities] IndexedDB no disponible para el borrador:", error);
  }
  const localDraft = readLocalDraftRecord();
  if (!offlineDraft?.activity && !localDraft?.activity) return false;

  const offlineTimestamp = Date.parse(offlineDraft?.updatedAt || "") || 0;
  const localTimestamp = localDraft?.legacy
    ? Number.MAX_SAFE_INTEGER
    : Date.parse(localDraft?.updatedAt || "") || 0;
  const useLocalDraft = Boolean(localDraft?.activity)
    && (!offlineDraft?.activity || localTimestamp >= offlineTimestamp);
  const selectedActivity = useLocalDraft
    ? restoreOfflineAssets(localDraft.activity, offlineDraft?.activity)
    : offlineDraft.activity;
  state.activity = normalizeActivity(selectedActivity);
  restoredDraftTimestamp = useLocalDraft && localDraft?.legacy
    ? Date.now()
    : Math.max(localTimestamp, offlineTimestamp);
  return true;
}

async function loadSessions() {
  let migratedFromLocalStorage = false;
  try {
    state.sessions = await readOfflineStore(OFFLINE_SESSIONS_STORE);
  } catch (error) {
    console.warn("[ScienceActivities] IndexedDB no disponible para sesiones:", error);
    state.sessions = [];
  }
  if (!state.sessions.length) {
    try {
      state.sessions = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(state.sessions)) state.sessions = [];
      migratedFromLocalStorage = state.sessions.length > 0;
    } catch (_) {
      state.sessions = [];
    }
  }
  state.sessions.sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
  state.activeSessionId = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY) || null;
  const activeSession = state.sessions.find((session) => String(session.id) === String(state.activeSessionId));
  const activeSessionTimestamp = Date.parse(activeSession?.savedAt || "") || 0;
  if (activeSession?.activity && activeSessionTimestamp > restoredDraftTimestamp) {
    state.activity = normalizeActivity(structuredClone(activeSession.activity));
    restoredDraftTimestamp = activeSessionTimestamp;
  }
  if (migratedFromLocalStorage) {
    persistOfflineSessions(state.sessions).catch((error) => {
      console.warn("[ScienceActivities] No fue posible migrar sesiones a IndexedDB:", error);
    });
  }
  renderSessions();
}

function readLocalDraftRecord() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || "null");
    if (!draft || typeof draft !== "object") return null;
    if (draft.activity && typeof draft.activity === "object") {
      return {
        activity: draft.activity,
        updatedAt: draft.updatedAt || "",
        activeSessionId: draft.activeSessionId || null,
        legacy: false
      };
    }
    return { activity: draft, updatedAt: "", activeSessionId: null, legacy: true };
  } catch (error) {
    console.warn("[ScienceActivities] Borrador local inválido:", error);
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    return null;
  }
}

function restoreOfflineAssets(primaryActivity, offlineActivity) {
  const result = structuredClone(primaryActivity);
  if (!offlineActivity || typeof offlineActivity !== "object") return result;
  const resultLevels = result.learningGuide?.levels || [];
  const offlineLevels = offlineActivity.learningGuide?.levels || [];
  resultLevels.forEach((level, index) => {
    const offlineLevel = offlineLevels[index];
    if (!offlineLevel) return;
    if (!level.imageDataUrl && offlineLevel.imageDataUrl) level.imageDataUrl = offlineLevel.imageDataUrl;
    if (!level.imageUrl && offlineLevel.imageUrl) level.imageUrl = offlineLevel.imageUrl;
    if (!level.imageSrc && offlineLevel.imageSrc) level.imageSrc = offlineLevel.imageSrc;
  });
  if (result.playerSprite && offlineActivity.playerSprite) {
    if (!result.playerSprite.dataUrl && offlineActivity.playerSprite.dataUrl) {
      result.playerSprite.dataUrl = offlineActivity.playerSprite.dataUrl;
    }
  }
  return rehydrateLearningGuideImages(result);
}

function loadLocalDraft() {
  const draft = readLocalDraftRecord();
  if (!draft?.activity) return false;
  state.activity = normalizeActivity(draft.activity);
  restoredDraftTimestamp = draft.legacy ? Date.now() : Date.parse(draft.updatedAt || "") || 0;
  return true;
}

function updateActiveSessionFromDraft(updatedAt) {
  if (!state.activeSessionId) return;
  const activeIndex = state.sessions.findIndex((session) => String(session.id) === String(state.activeSessionId));
  if (activeIndex < 0) return;
  state.sessions[activeIndex] = {
    ...state.sessions[activeIndex],
    savedAt: updatedAt,
    activity: structuredClone(state.activity)
  };
  try {
    state.sessions = persistSessionsWithinQuota(state.sessions);
  } catch (error) {
    console.warn("[ScienceActivities] La sesión activa excede la cuota de localStorage:", error);
  }
  persistOfflineSessions(state.sessions).catch((error) => {
    console.warn("[ScienceActivities] No fue posible actualizar la sesión activa en IndexedDB:", error);
  });
}

function persistLocalDraft() {
  const updatedAt = new Date().toISOString();
  let localSaved = false;
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
      version: 3,
      updatedAt,
      activeSessionId: state.activeSessionId,
      activity: createStorageSafeActivity(state.activity)
    }));
    restoredDraftTimestamp = Date.parse(updatedAt);
    localSaved = true;
  } catch (error) {
    console.warn("[ScienceActivities] No fue posible guardar el borrador local:", error);
  }
  updateActiveSessionFromDraft(updatedAt);
  persistOfflineDraft(state.activity, updatedAt).catch((error) => {
    console.warn("[ScienceActivities] No fue posible guardar el borrador completo en IndexedDB:", error);
  });
  return localSaved;
}

function scheduleLocalDraftSave() {
  window.clearTimeout(draftSaveTimer);
  draftSaveTimer = window.setTimeout(() => {
    syncEditorToActivity();
    persistLocalDraft();
  }, 180);
}

function flushLocalDraftSave() {
  window.clearTimeout(draftSaveTimer);
  if (!$("#activityTitle")) return;
  syncEditorToActivity();
  persistLocalDraft();
}

function renderSessions() {
  $("#savedProjects").innerHTML = state.sessions.length
    ? state.sessions.map((session, index) => `
      <div class="sa-session-item ${String(session.id) === String(state.activeSessionId) ? "active" : ""}" role="listitem">
        <button class="sa-session" type="button" data-load-session="${index}">
          <span><strong>${escapeHtml(session.activity.title)}</strong></span>
        </button>
        <button class="sa-session-menu-toggle" type="button" data-session-menu="${index}" aria-label="Opciones de ${escapeHtml(session.activity.title)}" aria-expanded="false">
          <i class="fas fa-ellipsis-vertical"></i>
        </button>
        <div class="sa-session-menu" data-session-menu-content="${index}" hidden>
          <button type="button" data-session-action="rename" data-session-index="${index}"><i class="fas fa-pen"></i>Renombrar</button>
          <button type="button" data-session-action="duplicate" data-session-index="${index}"><i class="fas fa-copy"></i>Duplicar</button>
          <button type="button" data-session-action="delete" data-session-index="${index}"><i class="fas fa-trash"></i>Eliminar</button>
        </div>
      </div>`).join("")
    : '<p class="sa-session-empty">Crea con IA y guarda aquí tus sesiones.</p>';
}

function createStorageSafeActivity(activity) {
  const copy = structuredClone(activity);
  const removeEmbeddedAssets = (value) => {
    if (!value || typeof value !== "object") return;
    Object.entries(value).forEach(([key, child]) => {
      if (typeof child === "string" && child.startsWith("data:")) {
        value[key] = "";
        return;
      }
      removeEmbeddedAssets(child);
    });
  };
  removeEmbeddedAssets(copy);
  return copy;
}

async function decodeImageSource(source) {
  const response = await fetch(source);
  if (!response.ok) throw new Error("No se pudo leer la imagen generada.");
  const sourceBlob = await response.blob();
  try {
    return await createImageBitmap(sourceBlob, { imageOrientation: "from-image" });
  } catch (_) {
    return createImageBitmap(sourceBlob);
  }
}

async function sanitizeAndResizeImage(source, targetWidth = 1280) {
  const bitmap = await decodeImageSource(source);
  if (!bitmap.width || !bitmap.height) {
    bitmap.close?.();
    throw new Error("La imagen generada no tiene dimensiones válidas.");
  }
  const targetHeight = Math.max(1, Math.round(bitmap.height * (targetWidth / bitmap.width)));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d", { alpha: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close?.();
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error("No se pudo recodificar la imagen.")),
      "image/webp",
      .9
    );
  });
  canvas.width = 1;
  canvas.height = 1;
  return { blob, width: targetWidth, height: targetHeight, contentType: "image/webp" };
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function prepareSanitizedActivityImages(activity) {
  const cloudActivity = structuredClone(activity);
  const levels = cloudActivity.learningGuide?.levels || [];
  const images = [];
  await Promise.all(levels.map(async (level, index) => {
    const source = String(level.imageDataUrl || level.imageUrl || "").trim();
    if (!source) return;
    if (/^https:\/\//i.test(source) && level.storagePath) {
      level.imageUrl = source;
      level.imageDataUrl = source;
      return;
    }
    if (!/^(data:image\/|blob:)/i.test(source)) return;
    const cleanImage = await sanitizeAndResizeImage(source, 1280);
    images.push({
      assetType: "levelImage",
      levelIndex: index,
      dataBase64: await blobToBase64(cleanImage.blob),
      contentType: cleanImage.contentType,
      width: cleanImage.width,
      height: cleanImage.height
    });
    level.imageDataUrl = "";
    level.imageUrl = "";
  }));
  const playerSource = String(cloudActivity.playerSprite?.dataUrl || "").trim();
  if (/^(data:image\/|blob:)/i.test(playerSource)) {
    const cleanSprite = await sanitizeAndResizeImage(playerSource, 1536);
    images.push({
      levelIndex: -1,
      assetType: "playerSprite",
      dataBase64: await blobToBase64(cleanSprite.blob),
      contentType: cleanSprite.contentType,
      width: cleanSprite.width,
      height: cleanSprite.height
    });
    cloudActivity.playerSprite.dataUrl = "";
  }
  return { cloudActivity, images };
}

function persistSessionsWithinQuota(sessions) {
  const limits = [15, 10, 5, 3, 1];
  let lastError;
  for (const limit of limits) {
    const reducedSessions = sessions.slice(0, limit).map((session) => ({
      ...session,
      activity: createStorageSafeActivity(session.activity)
    }));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reducedSessions));
      return sessions;
    } catch (error) {
      lastError = error;
      if (error?.name !== "QuotaExceededError") throw error;
    }
  }
  throw lastError || new DOMException("No hay espacio disponible.", "QuotaExceededError");
}

async function saveProject() {
  syncEditorToActivity();
  state.activity.gameProgress = state.activity.gameMode === "game"
    ? structuredClone(state.gameProgress || null)
    : null;
  persistLocalDraft();
  const existing = state.sessions.find((item) => String(item.id) === String(state.activeSessionId));
  const session = {
    id: existing?.id || Date.now(),
    firebaseDocId: existing?.firebaseDocId || crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    activity: structuredClone(state.activity)
  };
  const existingIndex = state.sessions.findIndex((item) => String(item.id) === String(session.id));
  if (existingIndex >= 0) state.sessions[existingIndex] = session;
  else state.sessions.unshift(session);
  state.activeSessionId = session.id;
  localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, String(session.id));
  try {
    state.sessions = persistSessionsWithinQuota(state.sessions);
    await persistOfflineSessions(state.sessions);
    renderSessions();
    showToast("Actividad guardada localmente. Sincronizando con Firebase…");
  } catch (error) {
    console.warn("[ScienceActivities] No fue posible guardar la sesión:", error);
    showToast("El navegador no tiene espacio para guardar. Exporta el proyecto como ZIP.");
    return;
  }

  try {
    showToast("Limpiando metadatos, ajustando imágenes y subiendo a Firebase Storage…");
    const prepared = await prepareSanitizedActivityImages(state.activity);
    const response = await authFetchJson(buildApiUrl("/api/science-activities/save"), {
      method: "POST",
      body: {
        firebaseDocId: session.firebaseDocId,
        localId: String(session.id),
        savedAt: session.savedAt,
        activity: prepared.cloudActivity,
        images: prepared.images
      }
    });
    state.activity = response.activity || prepared.cloudActivity;
    session.activity = createStorageSafeActivity(state.activity);
    const localSessionIndex = state.sessions.findIndex((item) => item.id === session.id);
    if (localSessionIndex >= 0) state.sessions[localSessionIndex] = session;
    state.sessions = persistSessionsWithinQuota(state.sessions);
    await persistOfflineSessions(state.sessions);
    persistLocalDraft();
    showToast("Actividad guardada localmente y sincronizada con Firebase.");
  } catch (error) {
    console.error("[ScienceActivities] Error al guardar en Firebase:", error);
    showToast("Se guardó localmente, pero Firebase no pudo sincronizar.");
  }
}

function newProject() {
  state.activity = structuredClone(DEFAULT_ACTIVITY);
  state.activeSessionId = null;
  localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
  localStorage.removeItem(DRAFT_STORAGE_KEY);
  state.activity.experiencePrompt = "";
  $("#experiencePrompt").value = state.activity.experiencePrompt;
  syncActivityToEditor();
  persistLocalDraft();
  state.previewActivity = structuredClone(state.activity);
  renderGame();
  showToast("Nuevo laboratorio preparado.");
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function slugify(value) {
  return String(value || "science-activity").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "science-activity";
}

const EXPORTED_CSS = `
:root{--bg:#10151f;--panel:#18222e;--line:#334153;--text:#eef6f7;--muted:#91a4ad;--lime:#c4f05c}*{box-sizing:border-box}body{margin:0;min-height:100vh;color:var(--text);font-family:"Trebuchet MS",sans-serif;background:radial-gradient(circle at 70% 0,rgba(72,216,200,.1),transparent 38%),var(--bg)}.game-shell{width:min(1180px,calc(100% - 24px));margin:0 auto;padding:20px 0}.game-head{padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:15px;border:1px solid var(--line);border-radius:13px;background:var(--panel)}.game-head small{color:#48d8c8;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.game-head h1{margin:4px 0 0;font-size:clamp(1.35rem,3vw,2.2rem)}.game-head p{max-width:520px;margin:0;color:var(--muted);font-size:.78rem}.game-frame{height:min(67vh,680px);min-height:420px;margin-top:10px;overflow:hidden;border:1px solid var(--line);border-radius:13px;background:#0e1721}#scienceGame{width:100%;height:100%}#scienceGame canvas{width:100%!important;height:100%!important;object-fit:contain}.controls{margin-top:10px;display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:8px}.science-control{padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--panel)}.science-control-head{display:flex;justify-content:space-between;gap:8px;color:var(--muted);font-size:.7rem;font-weight:800}.science-control output{color:var(--lime)}.science-control input{width:100%;accent-color:var(--lime)}.science-action{min-height:58px;color:#142018;border:0;border-radius:10px;background:var(--lime);font-weight:900;cursor:pointer}.science-action.secondary{color:var(--text);border:1px solid var(--line);background:var(--panel)}@media(max-width:700px){.game-head{align-items:flex-start;flex-direction:column}.game-frame{height:54vh;min-height:360px}.controls{grid-template-columns:repeat(2,1fr)}}`;

function buildExportHtml(activity) {
  const config = JSON.stringify(activity).replace(/</g, "\\u003c");
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(activity.title)}</title><link rel="stylesheet" href="styles.css"></head><body><main class="game-shell"><header class="game-head"><div><small>${escapeHtml(SUBJECT_LABELS[activity.subject])} · ${escapeHtml(activity.topic)}</small><h1>${escapeHtml(activity.title)}</h1></div><p>${escapeHtml(activity.mission)}</p></header><section class="game-frame"><div id="scienceGame"></div></section><div id="scienceControls" class="controls"></div></main><script>window.SCIENCE_ACTIVITY=${config};window.SCIENCE_PHASER_URL="./vendor/phaser.esm.js";window.SCIENCE_ANIME_URL="./vendor/animejs/anime.esm.min.js";<\/script><script type="module">import{installScienceActivitiesMotion}from"./science-motion.mjs";installScienceActivitiesMotion(document.body);<\/script><script type="module" src="script.js"><\/script></body></html>`;
}

async function exportProject() {
  syncEditorToActivity();
  const JSZip = window.htmlDocx?.JSZip || window.JSZip;
  if (!JSZip) return showToast("No se encontró el componente para crear ZIP.");
  setGenerating(true);
  try {
    const [runtimeSource, phaserSource, animeSource, animeLicense, motionSource] = await Promise.all([
      fetch(RUNTIME_URL).then((response) => {
        if (!response.ok) throw new Error("No se pudo leer el motor de la actividad.");
        return response.text();
      }),
      fetch(PHASER_URL).then((response) => {
        if (!response.ok) throw new Error("No se pudo leer Phaser.");
        return response.text();
      }),
      fetch(ANIME_URL).then((response) => {
        if (!response.ok) throw new Error("No se pudo leer Anime.js.");
        return response.text();
      }),
      fetch(ANIME_LICENSE_URL).then((response) => {
        if (!response.ok) throw new Error("No se pudo leer la licencia de Anime.js.");
        return response.text();
      }),
      fetch(MOTION_URL).then((response) => {
        if (!response.ok) throw new Error("No se pudo leer el sistema de animaciones.");
        return response.text();
      })
    ]);
    const zip = new JSZip();
    zip.file("index.html", buildExportHtml(state.activity));
    zip.file("styles.css", EXPORTED_CSS.trim());
    zip.file("script.js", `${runtimeSource}\n\nconst instance = await createScienceGame("#scienceGame", "#scienceControls", window.SCIENCE_ACTIVITY); globalThis.scienceGameInstance = instance; installAccessibleGameState(instance);`);
    zip.file("vendor/phaser.esm.js", phaserSource);
    zip.file("vendor/animejs/anime.esm.min.js", animeSource);
    zip.file("vendor/animejs/LICENSE.md", animeLicense);
    zip.file("science-motion.mjs", motionSource.replace("../vendor/animejs/anime.esm.min.js", "./vendor/animejs/anime.esm.min.js"));
    zip.file("activity.json", JSON.stringify(state.activity, null, 2));
    zip.file("LEEME.txt", `SCIENCE ACTIVITIES\n\n${state.activity.title}\n${SUBJECT_LABELS[state.activity.subject]} · ${state.activity.topic}\n\nIncluye Phaser, Anime.js, el runtime de Rive y el HUD vectorial para funcionar sin conexión.\nConsulta assets/RIVE-HUD-ATTRIBUTION.txt para la atribución del recurso Rive.\nAbre index.html mediante un servidor local o plataforma educativa. El paquete no requiere internet.`);
    const blob = typeof zip.generateAsync === "function" ? await zip.generateAsync({ type: "blob" }) : zip.generate({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slugify(state.activity.title)}.zip`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    showToast("Juego exportado con Phaser, Anime.js y animaciones offline.");
  } catch (error) {
    console.error("[ScienceActivities] Export failed:", error);
    showToast(error?.message || "No fue posible exportar el juego.");
  } finally {
    setGenerating(false);
  }
}

async function exportProjectWithAssessment() {
  const JSZipConstructor = window.JSZip;
  if (!JSZipConstructor?.prototype?.generateAsync) {
    await exportProject();
    return;
  }

  const [
    assessmentScript,
    assessmentStyles,
    hudThemeStyles,
    riveRuntimeSource,
    riveWasm,
    riveHudScript,
    riveHudAsset,
    riveLicense,
    riveAttribution
  ] = await Promise.all([
    fetch(new URL("./science-assessment-export.js?v=20260731-result-content-only-v1", import.meta.url)).then((response) => {
      if (!response.ok) throw new Error("No se pudo cargar el runtime de preguntas.");
      return response.text();
    }),
    fetch(new URL("../science-assessment-export.css?v=20260731-rive-result-v19", import.meta.url)).then((response) => {
      if (!response.ok) throw new Error("No se pudieron cargar los estilos de preguntas.");
      return response.text();
    }),
    fetch(new URL("../science-hud-themes.css?v=20260731-graph-coordinates-v20", import.meta.url)).then((response) => {
      if (!response.ok) throw new Error("No se pudieron cargar los temas visuales del HUD.");
      return response.text();
    }),
    fetch(RIVE_RUNTIME_URL).then((response) => {
      if (!response.ok) throw new Error("No se pudo cargar el runtime de Rive.");
      return response.text();
    }),
    fetch(RIVE_WASM_URL).then((response) => {
      if (!response.ok) throw new Error("No se pudo cargar WebAssembly de Rive.");
      return response.arrayBuffer();
    }),
    fetch(RIVE_HUD_SCRIPT_URL).then((response) => {
      if (!response.ok) throw new Error("No se pudo cargar la integración del HUD Rive.");
      return response.text();
    }),
    fetch(RIVE_HUD_ASSET_URL).then((response) => {
      if (!response.ok) throw new Error("No se pudo cargar el HUD vectorial.");
      return response.arrayBuffer();
    }),
    fetch(RIVE_LICENSE_URL).then((response) => response.text()),
    fetch(RIVE_HUD_ATTRIBUTION_URL).then((response) => response.text())
  ]);

  syncEditorToActivity();
  const levelCount = Math.max(1, Math.floor(Number(state.activity.levelCount || 3)));
  const questionsPerLevel = Math.max(1, Math.floor(Number(state.activity.questionsPerLevel || 3)));
  const assessmentConfig = {
    subject: state.activity.subject,
    topic: state.activity.topic,
    mission: state.activity.mission,
    levelCount,
    questionsPerLevel,
    gameMode: state.activity.gameMode || $("#gameModeSelect").value || "game",
    difficulty: state.activity.difficulty || $("#difficultySelect").value || "balanced",
    visualStyle: state.activity.visualStyle || $("#visualStyleSelect").value || "kawaii-lab",
    simulationType: state.activity.simulationType || "friction",
    theme: {
      sky: state.activity.scenario?.sky || "#dff4ff",
      ground: state.activity.scenario?.ground || "#8fd5c8",
      accent: state.activity.scenario?.accent || "#ff7d68"
    },
    challenge: {
      title: state.activity.title,
      description: state.activity.mission,
      targetLabel: state.activity.challenge?.targetLabel,
      targetValue: state.activity.challenge?.targetValue,
      tolerance: state.activity.challenge?.tolerance
    },
    controls: structuredClone(state.activity.controls || []),
    simulator: structuredClone(state.activity.simulator || {}),
    learningGuide: structuredClone(state.activity.learningGuide || buildFallbackLearningGuide(state.activity)),
    playerSprite: structuredClone(state.activity.playerSprite || null),
    playerCharacter: structuredClone(state.activity.playerCharacter || null),
    questions: state.activity.gameMode === "simulator" ? [] : Array.from(
      { length: levelCount * questionsPerLevel },
      (_, index) => buildAssessment(state.activity, index)
    )
  };
  const originalGenerateAsync = JSZipConstructor.prototype.generateAsync;

  JSZipConstructor.prototype.generateAsync = async function patchedGenerateAsync(...args) {
    const playerSpriteMatch = String(assessmentConfig.playerSprite?.dataUrl || "")
      .match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (playerSpriteMatch) {
      const extension = playerSpriteMatch[1].includes("webp") ? "webp" : "png";
      const playerAssetPath = `assets/player-sprite.${extension}`;
      this.file(playerAssetPath, playerSpriteMatch[2], { base64: true });
      assessmentConfig.playerSprite.src = playerAssetPath;
      delete assessmentConfig.playerSprite.dataUrl;
    }
    assessmentConfig.learningGuide?.levels?.forEach((level, index) => {
      const match = String(level.imageDataUrl || "").match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
      if (!match) return;
      const extension = match[1].includes("jpeg") ? "jpg" : match[1].split("/")[1].replace("+xml", "");
      const imagePath = `assets/level-${index + 1}.${extension}`;
      this.file(imagePath, match[2], { base64: true });
      level.imageSrc = imagePath;
      delete level.imageDataUrl;
    });
    const serializedConfig = JSON.stringify(assessmentConfig).replace(/</g, "\\u003c");
    const htmlName = Object.keys(this.files).find((name) => /\.html?$/i.test(name));
    if (htmlName) {
      const htmlFile = this.file(htmlName);
      let html = await htmlFile.async("string");
      html = html.includes("</head>")
        ? html.replace("</head>", "  <link rel=\"stylesheet\" href=\"science-assessment.css\">\n</head>")
        : `<link rel="stylesheet" href="science-assessment.css">\n${html}`;
      const assessmentBoot = `<script>window.SCIENCE_ASSESSMENT_CONFIG=${serializedConfig};window.SCIENCE_RIVE_WASM_URL="./vendor/rive/rive.wasm";window.SCIENCE_RIVE_HUD_URL="./assets/science-tech-hud.riv";</script>\n<script src="vendor/rive/rive.js"></script>\n<script src="science-rive-hud.js"></script>\n<script src="science-assessment.js" defer></script>`;
      html = html.includes("</body>")
        ? html.replace("</body>", `${assessmentBoot}\n</body>`)
        : `${html}\n${assessmentBoot}`;
      this.file(htmlName, html);
    }
    this.file("science-assessment.js", assessmentScript);
    this.file("science-assessment.css", `${assessmentStyles}\n\n${hudThemeStyles}`);
    this.file("science-rive-hud.js", riveHudScript);
    this.file("vendor/rive/rive.js", riveRuntimeSource);
    this.file("vendor/rive/rive.wasm", riveWasm);
    this.file("vendor/rive/LICENSE.txt", riveLicense);
    this.file("assets/science-tech-hud.riv", riveHudAsset);
    this.file("assets/RIVE-HUD-ATTRIBUTION.txt", riveAttribution);
    return originalGenerateAsync.apply(this, args);
  };

  try {
    const originalScenarioLabel = state.activity.scenario?.label || "";
    if (state.activity.scenario) state.activity.scenario.label = "";
    await exportProject();
    if (state.activity.scenario) state.activity.scenario.label = originalScenarioLabel;
    showToast("Juego exportado con Phaser, Anime.js y HUD Rive offline.");
  } finally {
    if (state.activity.scenario && !state.activity.scenario.label) {
      state.activity.scenario.label = getSelectedScenario()?.label || "";
    }
    JSZipConstructor.prototype.generateAsync = originalGenerateAsync;
  }
}

function bindEvents() {
  $("#scienceThemeToggleBtn")?.addEventListener("click", cycleScienceTheme);
  $("#activityForm").addEventListener("submit", (event) => { event.preventDefault(); generateWithGemini(); });
  $("#generateBtn").addEventListener("click", generateWithGemini);
  $("#generateExperienceBtn").addEventListener("click", generateExperienceProposal);
  $("#gameModeSelect").addEventListener("change", () => {
    state.activity.gameMode = $("#gameModeSelect").value;
    state.gameProgress = null;
    updateGameModeUI();
  });
  $("#subjectSelect").addEventListener("change", () => {
    const subject = $("#subjectSelect").value;
    $("#topicInput").value = TOPICS[subject][0];
    fillTopicSuggestions();
    fillScenarioOptions();
    state.activity.subject = subject;
    state.activity.topic = TOPICS[subject][0];
    state.activity = buildTopicActivity(subject, TOPICS[subject][0], getSelectedScenario());
    state.activity.assessments = [];
    state.activity.learningGuide = null;
    state.gameProgress = null;
    state.activity.grade = SUBJECT_DEFAULT_GRADES[subject];
    $("#gradeSelect").value = state.activity.grade;
    $("#experiencePrompt").value = "";
    syncActivityToEditor();
    setOptionalText("#summarySubject", SUBJECT_LABELS[subject]);
  });
  $("#topicInput").addEventListener("input", matchScenarioToTopic);
  $("#customTopicInput").addEventListener("change", matchScenarioToTopic);
  $("#customTopicInput").addEventListener("input", () => {
    state.activity.topic = getSelectedTopic();
    state.activity.scenario = structuredClone(getSelectedScenario());
  });
  $("#scenarioSelect").addEventListener("change", () => {
    state.activity.scenario = structuredClone(getSelectedScenario());
  });
  $("#visualStyleSelect").addEventListener("change", () => {
    state.activity.visualStyle = $("#visualStyleSelect").value;
    fillCharacterOptions();
    applySelectedCharacter(false);
    state.activity.learningGuide?.levels?.forEach((level) => {
      level.imagePrompt = `${VISUAL_STYLE_DIRECTIONS[state.activity.visualStyle]} 2D educational game scene about ${state.activity.topic}.`;
    });
    state.previewActivity = {
      ...(state.previewActivity || structuredClone(state.activity)),
      visualStyle: state.activity.visualStyle
    };
    scheduleLocalDraftSave();
    void renderGame();
    showToast("Estilo visual aplicado al preview.");
  });
  $("#characterSelect").addEventListener("change", () => applySelectedCharacter(false));
  $("#createCharacterBtn").addEventListener("click", createCharacterVariation);
  $("#closeCharacterModalBtn").addEventListener("click", closeCharacterModal);
  $("#cancelCharacterModalBtn").addEventListener("click", closeCharacterModal);
  $("#generateCharacterTemplateBtn").addEventListener("click", generateCharacterTemplate);
  $("#saveCharacterFirebaseBtn").addEventListener("click", saveCharacterToFirebase);
  $("#characterCreatorModal").addEventListener("click", (event) => {
    if (event.target === $("#characterCreatorModal")) closeCharacterModal();
  });
  ["activityTitle", "missionInput", "principleInput", "topicInput", "customTopicInput", "gameLevelCount", "questionsPerLevel", "difficultySelect", "visualStyleSelect"].forEach((id) => {
    $(`#${id}`).addEventListener("input", syncEditorToActivity);
  });
  $("#difficultySelect").addEventListener("change", () => {
    state.activity.difficulty = $("#difficultySelect").value;
  });
  $("#restartPreviewBtn").addEventListener("click", restartPreviewFromBeginning);
  $("#fullscreenBtn").addEventListener("click", () => {
    const frame = $(".sa-game-frame");
    if (!document.fullscreenElement) frame.requestFullscreen?.();
    else document.exitFullscreen?.();
  });
  $("#saveProjectBtn").addEventListener("click", saveProject);
  $("#exportProjectBtn").addEventListener("click", exportProjectWithAssessment);
  $("#newProjectBtn").addEventListener("click", newProject);
  $("#quickNewBtn").addEventListener("click", newProject);
  $("#savedProjects").addEventListener("click", (event) => {
    const menuButton = event.target.closest("[data-session-menu]");
    if (menuButton) {
      const index = menuButton.dataset.sessionMenu;
      const menu = $(`[data-session-menu-content="${index}"]`);
      const willOpen = menu?.hidden;
      document.querySelectorAll(".sa-session-menu").forEach((item) => { item.hidden = true; });
      document.querySelectorAll("[data-session-menu]").forEach((item) => item.setAttribute("aria-expanded", "false"));
      if (menu && willOpen) {
        menu.hidden = false;
        menuButton.setAttribute("aria-expanded", "true");
      }
      return;
    }
    const actionButton = event.target.closest("[data-session-action]");
    if (actionButton) {
      const index = Number(actionButton.dataset.sessionIndex);
      const session = state.sessions[index];
      if (!session) return;
      const action = actionButton.dataset.sessionAction;
      if (action === "rename") {
        const nextName = window.prompt("Nombre de la sesión:", session.activity.title)?.trim();
        if (!nextName) return;
        session.activity.title = nextName;
        if (String(session.id) === String(state.activeSessionId)) {
          state.activity.title = nextName;
          syncActivityToEditor();
          persistLocalDraft();
        }
      }
      if (action === "duplicate") {
        const duplicate = structuredClone(session);
        duplicate.id = Date.now();
        duplicate.firebaseDocId = crypto.randomUUID();
        duplicate.savedAt = new Date().toISOString();
        duplicate.activity.title = `${session.activity.title} · copia`;
        state.sessions.unshift(duplicate);
      }
      if (action === "delete") {
        if (!window.confirm(`¿Eliminar la sesión "${session.activity.title}"?`)) return;
        state.sessions.splice(index, 1);
        if (String(session.id) === String(state.activeSessionId)) {
          state.activeSessionId = null;
          localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
        }
      }
      try {
        state.sessions = persistSessionsWithinQuota(state.sessions);
        persistOfflineSessions(state.sessions).catch((error) => {
          console.warn("[ScienceActivities] No fue posible actualizar IndexedDB:", error);
        });
        renderSessions();
        showToast(action === "rename" ? "Sesión renombrada." : action === "duplicate" ? "Sesión duplicada." : "Sesión eliminada.");
      } catch (error) {
        console.warn("[ScienceActivities] No fue posible actualizar las sesiones:", error);
        showToast("No fue posible actualizar las sesiones locales.");
      }
      return;
    }
    const button = event.target.closest("[data-load-session]");
    if (!button) return;
    const session = state.sessions[Number(button.dataset.loadSession)];
    state.activeSessionId = session.id;
    localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, String(session.id));
    state.activity = normalizeActivity(structuredClone(session.activity));
    syncActivityToEditor();
    persistLocalDraft();
    state.previewActivity = structuredClone(state.activity);
    renderGame();
    renderSessions();
    showToast("Sesión restaurada.");
  });
  $("#addTipBtn").addEventListener("click", () => {
    const tip = window.prompt("Nuevo consejo breve para el estudiante:");
    if (!tip?.trim()) return;
    state.activity.coachTips.push(tip.trim());
    state.activity.coachTips = state.activity.coachTips.slice(0, 5);
    renderTips();
    scheduleLocalDraftSave();
  });
  $("#coachTips").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-tip]");
    if (!button) return;
    state.activity.coachTips.splice(Number(button.dataset.removeTip), 1);
    renderTips();
    scheduleLocalDraftSave();
  });
  $(".sa-page").addEventListener("input", (event) => {
    if (event.target.closest("#activityForm, .sa-inspector")) scheduleLocalDraftSave();
  });
  $(".sa-page").addEventListener("change", (event) => {
    if (event.target.closest("#activityForm, .sa-inspector")) scheduleLocalDraftSave();
  });
  window.addEventListener("pagehide", flushLocalDraftSave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushLocalDraftSave();
  });
}

async function init() {
  initializeScienceTheme();
  const restoredIndexedDbDraft = await loadOfflineDraft();
  if (!restoredIndexedDbDraft) loadLocalDraft();
  fillTopicSuggestions();
  fillScenarioOptions(state.activity.scenario?.id || DEFAULT_ACTIVITY.scenario.id);
  await loadSessions();
  bindEvents();
  syncActivityToEditor();
  state.previewActivity = structuredClone(state.activity);
  await renderGame();
}

init().catch((error) => {
  console.error("[ScienceActivities] Initialization failed:", error);
  showToast("No fue posible iniciar el motor 2D.");
});
