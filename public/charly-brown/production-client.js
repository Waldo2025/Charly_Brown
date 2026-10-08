import { getAuth } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import { buildGeminiApiUrl } from '../js/api-client.js';

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
async function request(path, body) {
  const user = getAuth().currentUser;
  if (!user) throw new Error('Inicia sesión para generar la unidad.');
  const fullUrl = buildGeminiApiUrl(`/api/charly-brown/production${path}`);
  try {
    const response = await fetch(fullUrl, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error(`[charly-production] ❌ HTTP ${response.status} en ${path}:`, data);
      throw new Error(data.message || data.error || 'No se pudo consultar la generación.');
    }
    return data;
  } catch (error) {
    console.error(`[charly-production] ⚠️ Error en petición a ${path}:`, error);
    throw error;
  }
}
export const productionConfig = () => request('/config');
export const startProduction = (sessionId, targetUnitId, enabledExerciseDynamics) => request('', { sessionId, targetUnitId, enabledExerciseDynamics });
export const readProduction = id => request(`/${encodeURIComponent(id)}`);
export const controlProduction = (id, action) => request(`/${encodeURIComponent(id)}/${action}`, {});

// ---------------------------------------------------------------------------
// Stage metadata — all agents are Charly Brown
// ---------------------------------------------------------------------------
const STAGE_META = Object.freeze({
  activity:       { label: 'Actividades Didácticas',    actionText: 'Creando actividades didácticas...', icon: 'fa-book-open', image: 'logoCharly.png', legacyImage: 'agentePrimero.png', stageClass: 'cb-solo-agent-stage' },
  annex:          { label: 'Anexo Gráfico',             actionText: 'Diseñando anexo conceptual...',     icon: 'fa-image', image: 'logoCharly.png', legacyImage: 'agenteSegundo.png' },
  cutout:         { label: 'Recortable Manipulativo',   actionText: 'Estructurando recortable interactivo...', icon: 'fa-scissors', image: 'logoCharly.png', legacyImage: 'agenteTercero.png' },
  worksheet:      { label: 'Ficha de Refuerzo',         actionText: 'Formulando ficha de refuerzo...',   icon: 'fa-file-lines', image: 'logoCharly.png', legacyImage: 'agenteCuarto.png' },
  'video-script': { label: 'Guion de Video',            actionText: 'Escribiendo guion audiovisual...',  icon: 'fa-film', image: 'logoCharly.png', legacyImage: 'agenteQuinto.png' },
  notes:          { label: 'Notas del Maestro',         actionText: 'Consolidando orientaciones metodológicas...', icon: 'fa-graduation-cap', image: 'logoCharly.png', legacyImage: 'agentesexto.png', celebrationClass: 'cb-solo-celebration-stage' }
});

const STAGE_ORDER = [
  'activity',
  'annex',
  'cutout',
  'worksheet',
  'video-script',
  'notes'
];

// ---------------------------------------------------------------------------
// Lazy loaders — anime.js and Three.js
// ---------------------------------------------------------------------------
let _animePromise = null;
async function getAnime() {
  if (window.anime) return window.anime;
  if (!_animePromise) {
    _animePromise = import('../vendor/animejs/anime.esm.min.js')
      .then(m => m.default || m)
      .catch(() => null);
  }
  return _animePromise;
}

let _threePromise = null;
async function getThree() {
  if (_threePromise) return _threePromise;
  _threePromise = import('../vendor/three/three.module.js')
    .then(m => m)
    .catch(() => null);
  return _threePromise;
}

// ---------------------------------------------------------------------------
// Three.js 3D Glass HUD & Neural Brain Formation Animation
// ---------------------------------------------------------------------------
let _activeThreeScene = null;

export function destroyParticles() {
  if (_activeThreeScene) {
    _activeThreeScene.destroy();
    _activeThreeScene = null;
  }
}

/**
 * High-Definition 3D Human Brain Anatomical Point Cloud Generator (850 nodes)
 * Accurately models:
 * - Left & Right Cerebral Hemispheres with deep medial longitudinal fissure
 * - Frontal, Parietal, Occipital, and Temporal Lobes with lateral Sylvian fissure
 * - Dense multi-harmonic cortical gyri & sulci convolutions
 * - Dual postero-inferior Cerebellar Hemispheres with folia texture
 * - Descending Brainstem (Pons & Medulla)
 * - Subcortical internal neural core & Corpus Callosum inter-hemispheric tract
 */
function generateBrainCoordinates(count = 850, scaleX = 3.3, scaleY = 1.95, scaleZ = 1.70) {
  const coords = [];
  const cortexCount = Math.floor(count * 0.65);
  const coreCount = Math.floor(count * 0.15);
  const cerebellumCount = Math.floor(count * 0.14);
  const perHemisphere = Math.floor(cortexCount / 2);
  const perCoreHemisphere = Math.floor(coreCount / 2);
  const perCereb = Math.floor(cerebellumCount / 2);
  const stemCount = Math.max(1, count - (perHemisphere * 2) - (perCoreHemisphere * 2) - (perCereb * 2));

  // 1. Cerebral Cortex Outer Shell (Left & Right Hemispheres with anatomical lobes)
  for (const h of [-1, 1]) {
    for (let i = 0; i < perHemisphere; i++) {
      const t = (i + 0.5) / perHemisphere;
      // Fibonacci golden spiral distribution over hemisphere dome
      const phi = Math.pow(t, 0.58) * (Math.PI * 0.78);
      const theta = 2.399963229728653 * i;

      // Complex multi-harmonic cortical sulcation (gyri & sulci folds)
      const sulci1 = 0.14 * Math.sin(9 * phi) * Math.cos(8 * theta);
      const sulci2 = 0.08 * Math.sin(16 * theta) * Math.cos(5 * phi);
      const sulci3 = 0.05 * Math.sin(24 * phi + theta * 4);
      const gyriRadius = 0.52 * (1.0 + sulci1 + sulci2 + sulci3);

      let cx = gyriRadius * Math.sin(phi) * Math.abs(Math.cos(theta));
      let cy = gyriRadius * Math.cos(phi);
      let cz = gyriRadius * Math.sin(phi) * Math.sin(theta);

      // Anatomical Lobar Sculpting:
      // Frontal Lobe (Anterior, +Z): Expansive curve descending over orbits
      if (cz > 0.05) {
        cz *= 1.22;
        cy += 0.08 * Math.sin(phi * 1.2);
        cx *= (1.0 - 0.12 * Math.pow(cz, 2));
      }
      // Occipital Lobe (Posterior, -Z): Sloping down toward cerebellum
      if (cz < -0.05) {
        cz *= 1.18;
        cy -= 0.06 * Math.sin(phi);
      }
      // Temporal Lobe: Distinct lateral inferior protrusion beneath Sylvian cleft
      if (phi > 0.95 && cz > -0.32 && cz < 0.42) {
        cx *= 1.38;
        cy -= 0.12 * (phi - 0.95);
        cz += 0.08;
      }
      // Sylvian (Lateral) Fissure indentation
      if (phi > 0.75 && phi < 1.15 && cz > -0.15 && cz < 0.25) {
        cx *= 0.88;
        cy += 0.04;
      }

      // Medial Longitudinal Sagittal Fissure
      const fissureGap = 0.095;
      const x = h * (fissureGap + cx * (scaleX * 0.44));
      const y = cy * (scaleY * 0.54);
      const z = cz * (scaleZ * 0.54);

      // Color zone assignment
      let zone = "frontal";
      if (cz < -0.2) zone = "occipital";
      else if (phi > 0.95 && cz > -0.32 && cz < 0.42) zone = "temporal";
      else if (cy > 0.2) zone = "parietal";

      coords.push({ x, y, z, region: "cortex", zone, hemisphere: h });
    }
  }

  // 2. Subcortical Core & Corpus Callosum (Internal neural depth)
  for (const h of [-1, 1]) {
    for (let i = 0; i < perCoreHemisphere; i++) {
      const t = (i + 0.5) / perCoreHemisphere;
      const phi = t * (Math.PI * 0.65);
      const theta = 2.399963229728653 * i;
      const r = 0.32 * (0.7 + 0.3 * Math.random());

      const cx = r * Math.sin(phi) * Math.abs(Math.cos(theta));
      const cy = r * Math.cos(phi) + 0.04;
      const cz = r * Math.sin(phi) * Math.sin(theta);

      const x = h * (0.04 + cx * (scaleX * 0.36));
      const y = cy * (scaleY * 0.45);
      const z = cz * (scaleZ * 0.45);

      coords.push({ x, y, z, region: "core", zone: "core", hemisphere: h });
    }
  }

  // 3. Cerebellum (Two distinct postero-inferior globular lobes with horizontal folia)
  for (const h of [-1, 1]) {
    for (let i = 0; i < perCereb; i++) {
      const t = (i + 0.5) / perCereb;
      const phi = Math.acos(1 - 2 * t);
      const theta = 2.399963229728653 * i;
      // Folia horizontal striations
      const folia = 1.0 + 0.14 * Math.sin(18 * phi);
      const r = (0.19 + 0.04 * Math.random()) * folia;

      const cx = r * Math.sin(phi) * Math.cos(theta);
      const cy = r * Math.cos(phi);
      const cz = r * Math.sin(phi) * Math.sin(theta);

      const x = h * (0.22 + Math.abs(cx) * 0.95);
      const y = -scaleY * 0.30 + cy * 0.88;
      const z = -scaleZ * 0.34 + cz * 0.95;

      coords.push({ x, y, z, region: "cerebellum", zone: "cerebellum", hemisphere: h });
    }
  }

  // 4. Brainstem (Pons & Medulla descending central trunk)
  for (let i = 0; i < stemCount; i++) {
    const t = i / stemCount;
    const ang = Math.random() * Math.PI * 2;
    // Pons bulge at top, tapering down to medulla
    const ponsBulge = 1.0 + 0.4 * Math.exp(-Math.pow(t - 0.25, 2) / 0.08);
    const r = 0.065 * ponsBulge * (1 - t * 0.30);

    const x = r * Math.cos(ang);
    const y = -scaleY * 0.32 - t * (scaleY * 0.28);
    const z = -scaleZ * 0.12 + r * Math.sin(ang) - t * 0.06;

    coords.push({ x, y, z, region: "stem", zone: "stem", hemisphere: 0 });
  }

  return coords;
}

/**
 * 3D Volumetric Particle Generator for Letters "ASC" (850 nodes)
 * Accurately models:
 * - Letter "A": Left diagonal, right diagonal, and horizontal crossbar with 3D depth
 * - Letter "S": Double-curved serpentine ribbon with smooth continuous curvature and 3D depth
 * - Letter "C": Deep open circular arc with rounded terminals and 3D depth
 */
function generateAscCoordinates(count = 850, THREE) {
  const coords = [];
  const countA = Math.round(count * 0.33); // ~281
  const countS = Math.round(count * 0.34); // ~289
  const countC = count - countA - countS;  // ~280

  // 1. Letter "A" (countA particles)
  // Left leg: 38%, Right leg: 38%, Crossbar: 24%
  const aLeft = Math.round(countA * 0.38);
  const aRight = Math.round(countA * 0.38);
  const aBar = countA - aLeft - aRight;

  const colorA1 = new THREE.Color(0x00d4ff); // Electric Neon Cyan
  const colorA2 = new THREE.Color(0x2563eb); // Vivid Royal Blue

  for (let i = 0; i < aLeft; i++) {
    const u = i / Math.max(1, aLeft - 1);
    const x = -0.95 - 0.35 * u + (Math.random() - 0.5) * 0.16;
    const y = 0.80 - 1.60 * u + (Math.random() - 0.5) * 0.14;
    const z = (Math.random() - 0.5) * 0.62;
    coords.push({ x, y, z, letter: "A", letterIdx: 0, color: colorA1.clone().lerp(colorA2, u) });
  }
  for (let i = 0; i < aRight; i++) {
    const u = i / Math.max(1, aRight - 1);
    const x = -0.95 + 0.35 * u + (Math.random() - 0.5) * 0.16;
    const y = 0.80 - 1.60 * u + (Math.random() - 0.5) * 0.14;
    const z = (Math.random() - 0.5) * 0.62;
    coords.push({ x, y, z, letter: "A", letterIdx: 0, color: colorA1.clone().lerp(colorA2, u) });
  }
  for (let i = 0; i < aBar; i++) {
    const u = i / Math.max(1, aBar - 1);
    const x = -1.13 + 0.36 * u + (Math.random() - 0.5) * 0.13;
    const y = -0.15 + (Math.random() - 0.5) * 0.13;
    const z = (Math.random() - 0.5) * 0.25;
    coords.push({ x, y, z, letter: "A", letterIdx: 0, color: colorA1.clone().lerp(colorA2, 0.5) });
  }

  // 2. Letter "S" (countS particles)
  const colorS1 = new THREE.Color(0x10b981); // Emerald Green
  const colorS2 = new THREE.Color(0x06b6d4); // Vibrant Cyan
  for (let i = 0; i < countS; i++) {
    const t = i / Math.max(1, countS - 1);
    let cx, cy;
    if (t <= 0.5) {
      const k = t / 0.5;
      const ang = 0.25 * Math.PI + k * (1.25 * Math.PI);
      cx = 0.32 * Math.cos(ang);
      cy = 0.40 + 0.40 * Math.sin(ang);
    } else {
      const k = (t - 0.5) / 0.5;
      const ang = 0.5 * Math.PI - k * (1.25 * Math.PI);
      cx = 0.32 * Math.cos(ang);
      cy = -0.40 + 0.40 * Math.sin(ang);
    }
    const x = cx + (Math.random() - 0.5) * 0.16;
    const y = cy + (Math.random() - 0.5) * 0.14;
    const z = (Math.random() - 0.5) * 0.62;
    coords.push({ x, y, z, letter: "S", letterIdx: 1, color: colorS1.clone().lerp(colorS2, t) });
  }

  // 3. Letter "C" (countC particles)
  const colorC1 = new THREE.Color(0x8b5cf6); // Luminous Violet
  const colorC2 = new THREE.Color(0x38bdf8); // Sky Blue
  for (let i = 0; i < countC; i++) {
    const u = i / Math.max(1, countC - 1);
    const ang = 0.28 * Math.PI + u * (1.44 * Math.PI);
    const x = 0.95 + 0.35 * Math.cos(ang) + (Math.random() - 0.5) * 0.16;
    const y = 0.80 * Math.sin(ang) + (Math.random() - 0.5) * 0.14;
    const z = (Math.random() - 0.5) * 0.62;
    coords.push({ x, y, z, letter: "C", letterIdx: 2, color: colorC1.clone().lerp(colorC2, u) });
  }

  return coords;
}

/**
 * Creates an ultra-crisp antialiased 256x256 circular particle texture
 */
function createSynapseParticleTexture(THREE) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const center = size / 2;

  // Ultra-crisp vector circle with delicate smooth falloff
  const gradient = ctx.createRadialGradient(center, center, 4, center, center, center - 8);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.95)');
  gradient.addColorStop(0.70, 'rgba(37, 99, 235, 0.90)');
  gradient.addColorStop(0.92, 'rgba(37, 99, 235, 0.40)');
  gradient.addColorStop(1.0, 'rgba(37, 99, 235, 0.0)');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(center, center, center - 8, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

async function initThreeHUDScene(canvas, glassDomElement) {
  if (_activeThreeScene) return _activeThreeScene;

  const THREE = await getThree();
  if (!THREE || !canvas) return null;

  const W = window.innerWidth;
  const H = window.innerHeight;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000);
  camera.position.set(0, 0, 10.2);

  // -------------------------------------------------------------------------
  // 1. Scene Lighting
  // -------------------------------------------------------------------------
  const ambientLight = new THREE.AmbientLight(0xffffff, 2.6);
  scene.add(ambientLight);

  const mainLight = new THREE.DirectionalLight(0xffffff, 2.2);
  mainLight.position.set(6, 10, 12);
  scene.add(mainLight);

  const blueLight = new THREE.PointLight(0x2563eb, 3.5, 25);
  blueLight.position.set(-6, -4, 6);
  scene.add(blueLight);

  const emeraldLight = new THREE.PointLight(0x10b981, 3.0, 25);
  emeraldLight.position.set(6, 4, 6);
  scene.add(emeraldLight);

  // -------------------------------------------------------------------------
  // 2. Neural Brain & Synaptic Network Group
  // -------------------------------------------------------------------------
  const glassGroup = new THREE.Group();
  glassGroup.position.set(0, 0, 0);
  scene.add(glassGroup);

  // -------------------------------------------------------------------------
  // 3. Neural Brain → Letters "ASC" Morphing Particle System
  // -------------------------------------------------------------------------
  // Proporción compacta y armónica para no invadir ni tapar las cards de agentes en paralelo
  const brainCoordinates = generateBrainCoordinates(240, 2.3, 1.35, 1.20);
  const ascCoordinates = generateAscCoordinates(brainCoordinates.length, THREE);
  const figureScale = 0.85;
  for (const coordinates of [brainCoordinates, ascCoordinates]) {
    coordinates.forEach((point) => {
      point.x *= figureScale;
      point.y *= figureScale;
      point.z *= figureScale;
    });
  }
  // Letras ASC ajustadas proporcionalmente al tamaño compacto
  ascCoordinates.forEach((point) => {
    point.x *= 1.05;
    point.y *= 1.05;
    point.z *= 1.05;
  });
  const NODE_COUNT = brainCoordinates.length;

  const nodePositions = new Float32Array(NODE_COUNT * 3);
  const nodeColors = new Float32Array(NODE_COUNT * 3);
  const nodeData = [];

  // Center coordinates for both Brain and ASC in the header workspace (centrado y equilibrado en cabecera)
  const brainOffsetX = 1.80;
  const brainOffsetY = 1.85;
  const frontZOffset = 0.34; // In front of white slab

  const zoneColors = {
    frontal:    new THREE.Color(0x2563eb), // Electric Royal Blue
    parietal:   new THREE.Color(0x1d4ed8), // Deep Blue
    temporal:   new THREE.Color(0x06b6d4), // Cyan Glow
    occipital:  new THREE.Color(0x6366f1), // Violet / Indigo
    cerebellum: new THREE.Color(0x10b981), // Emerald Green
    stem:       new THREE.Color(0x059669), // Dark Teal
    core:       new THREE.Color(0x38bdf8)  // Luminous Sky
  };

  for (let i = 0; i < NODE_COUNT; i++) {
    const bPos = brainCoordinates[i] || { x: 0, y: 0, z: 0, zone: "frontal" };
    const aPos = ascCoordinates[i] || { x: 0, y: 0, z: 0, letterIdx: 0, color: zoneColors.frontal };

    const bColor = zoneColors[bPos.zone] || zoneColors.frontal;
    const aColor = aPos.color || zoneColors.frontal;

    // Start 100% as the Brain model
    const initX = brainOffsetX + bPos.x;
    const initY = brainOffsetY + bPos.y;
    const initZ = frontZOffset + (bPos.z || 0) * 0.32;

    nodePositions[i * 3]     = initX;
    nodePositions[i * 3 + 1] = initY;
    nodePositions[i * 3 + 2] = initZ;

    nodeColors[i * 3]     = bColor.r;
    nodeColors[i * 3 + 1] = bColor.g;
    nodeColors[i * 3 + 2] = bColor.b;

    nodeData.push({
      bx: bPos.x,
      by: bPos.y,
      bz: (bPos.z || 0) * 0.32,
      bColor,
      ax: aPos.x,
      ay: aPos.y,
      az: (aPos.z || 0) * 0.32,
      aColor,
      letterIdx: aPos.letterIdx ?? 0,
      currentX: initX,
      currentY: initY,
      currentZ: initZ,
      stagger: (i / NODE_COUNT) * 0.35,
      driftPhase: Math.random() * Math.PI * 2,
      driftSpeed: 0.25 + Math.random() * 0.35
    });
  }

  const pGeometry = new THREE.BufferGeometry();
  pGeometry.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3));
  pGeometry.setAttribute('color', new THREE.BufferAttribute(nodeColors, 3));

  const circleTex = createSynapseParticleTexture(THREE);

  // Fine, crisp micro-particle size for ultra-high anatomical definition
  const pMaterial = new THREE.PointsMaterial({
    size: 0.052,
    map: circleTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: true
  });

  const brainParticleSystem = new THREE.Points(pGeometry, pMaterial);
  brainParticleSystem.renderOrder = 20;
  glassGroup.add(brainParticleSystem);

  // High-Density Synaptic Network Lines
  const MAX_CONNECTIONS = 2800;
  const linePositions = new Float32Array(MAX_CONNECTIONS * 6);
  const lineColors = new Float32Array(MAX_CONNECTIONS * 6);
  const lineGeometry = new THREE.BufferGeometry();
  const lineAttr = new THREE.BufferAttribute(linePositions, 3);
  const lineColAttr = new THREE.BufferAttribute(lineColors, 3);
  lineAttr.setUsage(THREE.DynamicDrawUsage);
  lineColAttr.setUsage(THREE.DynamicDrawUsage);
  lineGeometry.setAttribute('position', lineAttr);
  lineGeometry.setAttribute('color', lineColAttr);

  const lineMaterial = new THREE.LineSegments(
    lineGeometry,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.32,
      depthTest: false,
      depthWrite: false,
      linewidth: 1
    })
  );
  lineMaterial.renderOrder = 18;
  glassGroup.add(lineMaterial);

  // -------------------------------------------------------------------------
  // 4. Subtle Damped Parallax
  // -------------------------------------------------------------------------
  let targetRotX = 0;
  let targetRotY = 0;

  const onMouseMove = (e) => {
    const mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    const mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    targetRotY = mouseX * 0.025;
    targetRotX = -mouseY * 0.015;
  };

  window.addEventListener('mousemove', onMouseMove, { passive: true });

  // -------------------------------------------------------------------------
  // 5. Animation Loop — Brain to Letters "ASC" Morphing Loop
  // -------------------------------------------------------------------------
  let animId = null;
  let clock = new THREE.Clock();
  let currentMorph = 0.0; // 0.0 = 100% Brain, 1.0 = 100% ASC

  const tick = () => {
    animId = requestAnimationFrame(tick);
    const time = clock.getElapsedTime();

    // Target morph is directly driven by automated creation progress (0.0 to 1.0)
    const rawProgress = Math.min(1.0, Math.max(0.0, (_activeThreeScene?.progressRatio || 0.0)));
    currentMorph += (rawProgress - currentMorph) * 0.045;
    const morph = currentMorph;

    // Calm micro-float on the 3D card
    const floatY = Math.sin(time * 0.6) * 0.015;
    glassGroup.position.y = floatY;

    // Smooth subtle tilt interpolation
    glassGroup.rotation.x += (targetRotX - glassGroup.rotation.x) * 0.05;
    glassGroup.rotation.y += (targetRotY - glassGroup.rotation.y) * 0.05;

    // Sync CSS DOM text layer
    const currentDom = document.querySelector('.cb-hud-glass') || glassDomElement;
    if (currentDom) {
      const degX = (glassGroup.rotation.x * 180 / Math.PI).toFixed(2);
      const degY = (glassGroup.rotation.y * 180 / Math.PI).toFixed(2);
      const transY = (floatY * 16).toFixed(1);
      currentDom.style.transform = `perspective(1200px) rotateX(${degX}deg) rotateY(${degY}deg) translateY(${transY}px)`;
    }

    // Brain dynamics (active when morph is low, smoothly eases as it transforms)
    const brainPulse = 1 + 0.022 * Math.sin(time * 1.5) * (1 - morph * 0.5);
    const baseTiltY = -0.38;
    const baseTiltX = 0.16;
    const brainRotY = (baseTiltY + Math.sin(time * 0.3) * 0.12) * (1 - morph);
    const brainRotX = (baseTiltX + Math.cos(time * 0.25) * 0.04) * (1 - morph);

    const cosY = Math.cos(brainRotY);
    const sinY = Math.sin(brainRotY);
    const cosX = Math.cos(brainRotX);
    const sinX = Math.sin(brainRotX);

    // ASC dynamics (breathing glow when formed)
    const ascPulse = 1 + 0.016 * Math.sin(time * 2.0);

    const pos = pGeometry.attributes.position.array;
    const col = pGeometry.attributes.color.array;

    for (let i = 0; i < NODE_COUNT; i++) {
      const nd = nodeData[i];

      // 1. Brain coordinates rotated with 3/4 anatomical perspective tilt
      const x1 = nd.bx * cosY - nd.bz * sinY;
      const z1 = nd.bx * sinY + nd.bz * cosY;
      const y1 = nd.by * cosX - z1 * sinX;
      const z2 = nd.by * sinX + z1 * cosX;

      const destBrainX = brainOffsetX + x1 * brainPulse;
      const destBrainY = brainOffsetY + y1 * brainPulse;
      const destBrainZ = frontZOffset + z2 * 0.32;

      // 2. ASC coordinates
      const destAscX = brainOffsetX + nd.ax * ascPulse;
      const destAscY = brainOffsetY + nd.ay * ascPulse;
      const destAscZ = frontZOffset + nd.az;

      // 3. Staggered smoothstep morph factor
      const pRaw = Math.max(0, Math.min(1, (morph - nd.stagger * (1 - morph)) / Math.max(0.001, 1 - nd.stagger * 0.35)));
      const pMorph = pRaw * pRaw * (3 - 2 * pRaw);

      // Mid-flight organic particle swirl during transformation
      const flight = Math.sin(pMorph * Math.PI);
      const swirlX = Math.cos(time * 2.0 + nd.driftPhase) * 0.07 * flight;
      const swirlY = Math.sin(time * 2.0 + nd.driftPhase) * 0.07 * flight;
      const swirlZ = Math.sin(time * 2.5 + nd.driftPhase) * 0.05 * flight;

      // Ambient drift
      const driftX = Math.cos(time * nd.driftSpeed + nd.driftPhase) * 0.006 * (1 - pMorph * 0.4);
      const driftY = Math.sin(time * nd.driftSpeed + nd.driftPhase) * 0.006 * (1 - pMorph * 0.4);

      nd.currentX = destBrainX + (destAscX - destBrainX) * pMorph + swirlX + driftX;
      nd.currentY = destBrainY + (destAscY - destBrainY) * pMorph + swirlY + driftY;
      nd.currentZ = destBrainZ + (destAscZ - destBrainZ) * pMorph + swirlZ;

      pos[i * 3]     = nd.currentX;
      pos[i * 3 + 1] = nd.currentY;
      pos[i * 3 + 2] = nd.currentZ;

      // Smooth color morph: Brain zone colors -> Vibrant ASC letters colors
      col[i * 3]     = nd.bColor.r + (nd.aColor.r - nd.bColor.r) * pMorph;
      col[i * 3 + 1] = nd.bColor.g + (nd.aColor.g - nd.bColor.g) * pMorph;
      col[i * 3 + 2] = nd.bColor.b + (nd.aColor.b - nd.bColor.b) * pMorph;
    }
    pGeometry.attributes.position.needsUpdate = true;
    pGeometry.attributes.color.needsUpdate = true;

    // Update Synaptic / ASC Connecting Lines
    let lineCount = 0;
    const lp = lineGeometry.attributes.position.array;
    const lc = lineGeometry.attributes.color.array;
    const cp = pGeometry.attributes.color.array;

    const connectThreshold = (0.55 + morph * 0.10) * 0.72;
    const maxPerNode = 8;

    for (let i = 0; i < NODE_COUNT && lineCount < MAX_CONNECTIONS; i++) {
      let nodeConnections = 0;
      for (let j = i + 1; j < NODE_COUNT && lineCount < MAX_CONNECTIONS; j++) {
        if (nodeConnections >= maxPerNode) break;

        // When forming ASC letters, restrict connections to the same letter
        // so the letters "A", "S", "C" remain razor-sharp without web artifacts between them
        if (morph > 0.45 && nodeData[i].letterIdx !== nodeData[j].letterIdx) continue;

        const dx = pos[i * 3] - pos[j * 3];
        const dy = pos[i * 3 + 1] - pos[j * 3 + 1];
        const dz = pos[i * 3 + 2] - pos[j * 3 + 2];
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq < connectThreshold * connectThreshold) {
          const idx = lineCount * 6;
          lp[idx]     = pos[i * 3];
          lp[idx + 1] = pos[i * 3 + 1];
          lp[idx + 2] = pos[i * 3 + 2];
          lc[idx]     = cp[i * 3];
          lc[idx + 1] = cp[i * 3 + 1];
          lc[idx + 2] = cp[i * 3 + 2];

          lp[idx + 3] = pos[j * 3];
          lp[idx + 4] = pos[j * 3 + 1];
          lp[idx + 5] = pos[j * 3 + 2];
          lc[idx + 3] = cp[j * 3];
          lc[idx + 4] = cp[j * 3 + 1];
          lc[idx + 5] = cp[j * 3 + 2];

          lineCount++;
          nodeConnections++;
        }
      }
    }
    lineGeometry.setDrawRange(0, lineCount * 2);
    lineGeometry.attributes.position.needsUpdate = true;
    lineGeometry.attributes.color.needsUpdate = true;

    renderer.render(scene, camera);
  };

  tick();

  const onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);

  _activeThreeScene = {
    progressRatio: 0.0,
    destroy() {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      
      pGeometry.dispose();
      pMaterial.dispose();
      circleTex.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
    }
  };

  return _activeThreeScene;
}

// ---------------------------------------------------------------------------
// Summarized Categories & Stages Checklist Generator
// ---------------------------------------------------------------------------
function renderTasksStepsGrid(tasks = [], run = {}) {
  const isRunCompleted = run?.status === 'completed';
  const stageSet = new Set(tasks.map(t => t.stage));

  const unit = run?.unit || run?.session?.units?.find(u => u.id === run?.unitId);
  const configuredStages = new Set();
  (unit?.workflow?.activitySections || []).forEach(section => {
    if (Array.isArray(section.resourceTypes)) {
      section.resourceTypes.forEach(t => configuredStages.add(t));
    }
    if (section.resourceSelections) {
      if (section.resourceSelections.fichas) configuredStages.add('worksheet');
      if (section.resourceSelections.anexos) configuredStages.add('annex');
      if (section.resourceSelections.recortables) configuredStages.add('cutout');
      if (section.resourceSelections.videos) configuredStages.add('video-script');
    }
  });

  const activeStages = STAGE_ORDER.filter(stageKey => {
    if (stageKey === 'activity' || stageKey === 'notes') return true;
    return stageSet.has(stageKey) || configuredStages.has(stageKey);
  });

  const itemsHtml = activeStages.map(stageKey => {
    const meta = STAGE_META[stageKey] || { label: stageKey, icon: 'fa-layer-group' };
    const stageTasks = Array.isArray(tasks) ? tasks.filter(t => t.stage === stageKey) : [];

    let total = 1;
    let completed = 0;
    let running = 0;

    if (stageKey === 'activity') {
      total = stageTasks.length || run.total || 1;
      completed = Math.min(total, stageTasks.filter(t => t.status === 'completed').length || run.completed || (isRunCompleted ? total : 0));
      running = (!isRunCompleted && completed < total) ? stageTasks.filter(t => t.status === 'running').length || 1 : 0;
    } else if (stageKey === 'notes') {
      const actCount = tasks.filter(t => t.stage === 'activity').length || run.total || 1;
      total = Math.max(stageTasks.length, actCount);
      completed = isRunCompleted ? total : stageTasks.filter(t => t.status === 'completed').length;
      running = (!isRunCompleted && completed < total && stageTasks.some(t => t.status === 'running')) ? 1 : 0;
    } else {
      total = Math.max(1, stageTasks.length);
      completed = isRunCompleted ? total : stageTasks.filter(t => t.status === 'completed').length;
      running = (!isRunCompleted && completed < total && stageTasks.some(t => t.status === 'running')) ? 1 : 0;
    }

    const isAllDone = isRunCompleted || (total > 0 && completed >= total);
    const isStageRunning = !isAllDone && (running > 0 || (stageKey === 'notes' && tasks.length > 0 && tasks.filter(t => t.stage !== 'notes').every(t => t.status === 'completed') && completed === 0));

    let statusClass = 'cb-stage-pending';
    let iconHtml = '<i class="far fa-circle cb-stage-status-icon" aria-hidden="true"></i>';

    if (isAllDone) {
      statusClass = 'cb-stage-completed';
      iconHtml = '<i class="fas fa-check-circle cb-stage-status-icon cb-stage-status-icon--done" aria-hidden="true"></i>';
    } else if (isStageRunning) {
      statusClass = 'cb-stage-running';
      iconHtml = '<span class="cb-stage-pulse" aria-hidden="true"></span>';
    }

    return `
      <div class="cb-hud-stage-card ${statusClass}" title="${escapeText(meta.label)} (${completed}/${total})">
        <div class="cb-stage-card-main">
          <span class="cb-stage-indicator">${iconHtml}</span>
          <span class="cb-stage-card-icon"><i class="fas ${meta.icon}" aria-hidden="true"></i></span>
          <span class="cb-stage-card-name">${escapeText(meta.label)}</span>
        </div>
        <span class="cb-stage-card-count">${completed}/${total}</span>
      </div>`;
  }).join('');

  return `<div class="cb-hud-stages-grid">${itemsHtml}</div>`;
}

function resolveHudUnitLabel(run = {}) {
  if (typeof run.unit === 'string' && run.unit.trim()) {
    const clean = run.unit.trim();
    return clean.toLowerCase() === 'proyecto' ? 'Proyecto' : `Unidad ${clean}`;
  }
  if (typeof run.unit === 'number') {
    return `Unidad ${run.unit}`;
  }
  if (run.unit && typeof run.unit === 'object') {
    const num = run.unit.meta?.unit || run.unit.unit;
    if (num) return String(num).toLowerCase() === 'proyecto' ? 'Proyecto' : `Unidad ${num}`;
    if (run.unit.title) return run.unit.title;
  }
  const session = run.session || (typeof window !== 'undefined' && window.store?.getState?.()?.session);
  if (session && Array.isArray(session.units)) {
    const targetUnit = session.units.find(u => (run.unitId && u.id === run.unitId) || (session.activeUnitId && u.id === session.activeUnitId)) || session.units[0];
    if (targetUnit) {
      const num = targetUnit.meta?.unit || targetUnit.unit;
      if (num) return String(num).toLowerCase() === 'proyecto' ? 'Proyecto' : `Unidad ${num}`;
      if (targetUnit.title) return targetUnit.title;
    }
  }
  return 'Unidad';
}

function renderActiveParallelAgents(runningTasks = [], run = {}) {
  if (run.status === 'needs_attention') {
    const failedTasks = (run.tasks || []).filter(task => ['failed', 'stale'].includes(task.status));
    const firstTask = failedTasks[0] || null;
    const firstError = firstTask?.error || 'Ocurrió un error temporal durante la generación.';
    const subtopic = firstTask?.subtopic || firstTask?.section || (firstTask?.stage ? (STAGE_META[firstTask.stage]?.label || firstTask.stage) : 'Tarea');
    return `
      <div class="cb-hud-attention-box">
        <div class="cb-hud-attention-content">
          <div class="cb-hud-attention-icon"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i></div>
          <div class="cb-hud-attention-text">
            <span class="cb-hud-attention-headline">Atención requerida en ${escapeText(subtopic)}</span>
            <span class="cb-hud-attention-detail">${escapeText(firstError)}</span>
          </div>
        </div>
        <button type="button" class="cb-hud-btn cb-hud-btn--primary" id="cbHudInlineRetryBtn">
          <i class="fas fa-rotate-right" aria-hidden="true"></i>
          <span>Reintentar ahora</span>
        </button>
      </div>
    `;
  }

  if (!runningTasks || !runningTasks.length) {
    if (run.status === 'running') {
      return `
        <div class="cb-hud-orchestrating-box">
          <span class="cb-hud2-beacon" aria-hidden="true"></span>
          <span>Orquestando agentes y preparando siguiente fase...</span>
        </div>
      `;
    }
    return '';
  }

  const cardsHtml = runningTasks.map((task) => {
    const meta = STAGE_META[task.stage] || { label: task.stage, icon: 'fa-layer-group', image: 'logoCharly.png' };
    const subtopicLabel = task.subtopic || task.section || 'Subtema';
    const codeTag = task.code ? `<span class="cb-hud-parallel-agent-code">${escapeText(task.code)}</span>` : '';
    const stageModClass = `cb-hud-parallel-agent-card--${escapeText(task.stage)}`;
    const avatarSrc = meta.image || 'logoCharly.png';

    return `
      <div class="cb-hud-parallel-agent-card ${stageModClass}" title="${escapeText(subtopicLabel)}">
        <div class="cb-hud-parallel-agent-avatar-wrap">
          <img src="${avatarSrc}" alt="${escapeText(meta.label)}" class="cb-hud-parallel-agent-img" />
          <span class="cb-hud-parallel-agent-beacon" aria-hidden="true"></span>
        </div>
        <div class="cb-hud-parallel-agent-body">
          <span class="cb-hud-parallel-agent-role">
            <i class="fas ${meta.icon || 'fa-robot'}" aria-hidden="true"></i>
            <span>${escapeText(meta.label)}</span>
          </span>
          <span class="cb-hud-parallel-agent-subtopic">${escapeText(subtopicLabel)}</span>
          ${codeTag}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="cb-hud-parallel-agents-container">
      <div class="cb-hud-parallel-agents-label">
        <span>AGENTES ACTIVOS EN PARALELO (${runningTasks.length}):</span>
        <span class="cb-hud-parallel-agents-badge">Subtemas independientes</span>
      </div>
      <div class="cb-hud-parallel-agents-grid">
        ${cardsHtml}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// HUD overlay — main render function
// ---------------------------------------------------------------------------
export function renderProductionProgress(host, run, onControl) {
  if (!host) return;

  const tasks          = run.tasks || [];
  const activityTasks  = tasks.filter(t => t.stage === 'activity');
  const activityTotal  = activityTasks.length || run.total || 0;
  const activityDone   = activityTasks.filter(t => t.status === 'completed').length || run.completed || 0;

  const nonActivityTasks = tasks.filter(t => t.stage !== 'activity');
  const nonActivityDone  = nonActivityTasks.filter(t => t.status === 'completed').length;
  
  // El plan incluye las notas y recursos desde el inicio, aunque el servidor
  // todavía no haya creado sus tareas de las fases posteriores.
  const expectedNotes = activityTotal;
  const actualNotes = tasks.filter((task) => task.stage === 'notes').length;
  const totalTasks = Number(run.plannedTotal)
    || Math.max(1, tasks.length + Math.max(0, expectedNotes - actualNotes), activityTotal * 2 + Number(run.resourcesTotal || 0));
  const completedTasks = run.status === 'completed'
    ? totalTasks
    : (tasks.length ? tasks.filter(t => t.status === 'completed').length : (activityDone + (run.resourcesCompleted || 0) + (run.notesCompleted || 0)));
  const runningTasks   = tasks.filter(t => t.status === 'running') || [];
  const percent        = run.status === 'completed' ? 100 : (totalTasks ? Math.min(99, Math.round((completedTasks / totalTasks) * 100)) : 0);
  const isActRunning   = runningTasks.some(t => t.stage === 'activity');
  const isResRunning   = runningTasks.some(t => ['annex', 'cutout', 'worksheet', 'video-script'].includes(t.stage));
  const isNotesRunning = runningTasks.some(t => t.stage === 'notes');
  const runningTask    = runningTasks[0] || null;
  const stageMeta      = runningTask ? (STAGE_META[runningTask.stage] || null) : null;
  const unitLabel      = resolveHudUnitLabel(run);

  const failedTasks = tasks.filter(task => ['failed', 'stale'].includes(task.status));
  let stageTitle;
  let taskDesc;

  if (run.status === 'completed') {
    stageTitle = `${unitLabel} generada`;
    taskDesc = 'Unidad lista y guardada';
  } else if (run.status === 'needs_attention') {
    stageTitle = 'Atención requerida';
    taskDesc = `${failedTasks.length || 1} tareas pendientes de corregir. Reintenta para continuar.`;
  } else if (run.status === 'paused') {
    stageTitle = 'Proceso pausado';
    taskDesc = 'Generación en pausa por el usuario';
  } else if (run.status === 'cancelled') {
    stageTitle = 'Proceso cancelado';
    taskDesc = 'Generación cancelada';
  } else if (isActRunning) {
    const actCount = runningTasks.filter(t => t.stage === 'activity').length || 1;
    stageTitle = `Creando ${unitLabel} · ${actCount} Actividades en Paralelo`;
    taskDesc = `${actCount} agentes generando actividades simultáneamente, cada uno con un subtema diferente según el plan curricular.`;
  } else if (isResRunning) {
    stageTitle = `Creando ${unitLabel} · 6 Recursos en Paralelo`;
    taskDesc = `Generación paralela: 1 ficha, 2 anexos, 2 recortables y 1 video en subtemas distintos.`;
  } else if (isNotesRunning) {
    stageTitle = `Creando ${unitLabel} · Notas del Maestro`;
    taskDesc = `Consolidando orientaciones metodológicas para cada actividad didáctica.`;
  } else if (runningTask) {
    stageTitle = `Creando ${unitLabel} · ${stageMeta?.label || 'Especialistas'}`;
    taskDesc = stageMeta?.actionText || 'Creando contenido especializado...';
  } else {
    stageTitle = `Creando ${unitLabel}`;
    taskDesc = 'Organizando información pedagógica...';
  }


  // Update Brain -> ASC Morphing Progress in Three.js Scene
  if (_activeThreeScene) {
    const noteTasks = tasks.filter((task) => task.stage === 'notes');
    const noteDone = noteTasks.filter((task) => task.status === 'completed').length;
    const notesStarted = noteTasks.some((task) => ['running', 'completed'].includes(task.status))
      || (noteTasks.length > 0 && tasks.some((task) => task.stage !== 'notes')
        && tasks.filter((task) => task.stage !== 'notes').every((task) => task.status === 'completed'));
    const notesProgress = run.status === 'completed' ? 1
      : notesStarted ? 0.45 + 0.55 * (noteDone / Math.max(1, noteTasks.length)) : 0;
    _activeThreeScene.progressRatio = Math.max(
      _activeThreeScene.progressRatio || 0,
      notesProgress
    );
  }

  // Sync compact sidebar panel
  const percentageEl      = document.getElementById('cbAutomationPercentage');
  const progressBarEl     = document.getElementById('cbAutomationProgressBar');
  const statusTextEl      = document.getElementById('cbAutomationStatusText');
  const compactAgentNameEl= document.getElementById('cbCompactAgentName');
  const compactTaskCountEl= document.getElementById('cbCompactTaskCount');
  if (percentageEl)       percentageEl.textContent  = `${percent}%`;
  if (progressBarEl)      progressBarEl.style.width = `${percent}%`;
  if (compactTaskCountEl) compactTaskCountEl.textContent = `${completedTasks}/${totalTasks}`;
  if (compactAgentNameEl) {
    if (isActRunning) {
      const actCount = runningTasks.filter(t => t.stage === 'activity').length || 1;
      compactAgentNameEl.innerHTML = `<i class="fas fa-layer-group" aria-hidden="true"></i><span>${actCount} Agentes Actividades</span>`;
    } else if (isResRunning) {
      compactAgentNameEl.innerHTML = '<i class="fas fa-cubes-stacked" aria-hidden="true"></i><span>6 Agentes Recursos</span>';
    } else {
      compactAgentNameEl.innerHTML = '<i class="fas fa-brain" aria-hidden="true"></i><span>Charly Brown</span>';
    }
  }
  if (run.status === 'completed') {
    if (statusTextEl) statusTextEl.textContent = '¡Unidad completada!';
  } else if (isActRunning) {
    const actCount = runningTasks.filter(t => t.stage === 'activity').length || 1;
    if (statusTextEl) statusTextEl.textContent = `Creando ${actCount} actividades en paralelo (1 agente por subtema)...`;
  } else if (isResRunning) {
    if (statusTextEl) statusTextEl.textContent = 'Creando 6 recursos en paralelo (1 ficha, 2 anexos, 2 recortables, 1 video)...';
  } else if (stageMeta) {
    if (statusTextEl) statusTextEl.textContent = stageMeta.actionText;
  } else {
    if (statusTextEl) statusTextEl.textContent = 'Iniciando Charly Brown...';
  }

  let canvasEl = host.querySelector('.cb-hud-canvas');
  let glassEl = host.querySelector('.cb-hud-glass');

  if (!canvasEl || !glassEl) {
    host.className = 'cb-hud-overlay';
    host.setAttribute('aria-live', 'polite');
    host.innerHTML = `
      <canvas class="cb-hud-canvas" aria-hidden="true"></canvas>
      <div class="cb-hud-glass">
        <!-- Top Telemetry Row -->
        <div class="cb-hud-top">
          <div class="cb-hud-telemetry-left">
            <div class="cb-hud-system-kicker">
              <span class="cb-hud-sys-label">Charly Brown Editor</span>
            </div>
          </div>
          <div class="cb-hud-pct-wrap">
            <span class="cb-hud-pct" aria-label="0 por ciento">0<small>%</small></span>
          </div>
        </div>

        <!-- Central Active Stage Status -->
        <div class="cb-hud-stage">
          <div class="cb-hud-stage-header">
            <span class="cb-hud-stage-title">${escapeText(stageTitle)}</span>
          </div>
        </div>

        <!-- Active Parallel Agents Grid -->
        <div id="cbHudActiveAgentsHost">
          ${renderActiveParallelAgents(runningTasks)}
        </div>

        <!-- Summarized Stages Checklist Grid -->
        <div class="cb-hud-steps-container">
          <div class="cb-hud-steps-label">FASES Y RECURSOS DE LA UNIDAD:</div>
          <div id="cbHudStepsHost">
            ${renderTasksStepsGrid(tasks, run)}
          </div>
        </div>

        <!-- Bottom Telemetry & Controls -->
        <div class="cb-hud-foot">
          <div class="cb-hud-metrics">
            <span class="cb-hud-tasks">0 / 0 tareas</span>
          </div>
          <div class="cb-hud-btns">
            <button type="button" class="cb-hud-ghost" id="cbProductionControlBtn">
              <i class="fas fa-pause" aria-hidden="true"></i>
              <span>Pausar</span>
            </button>
            <button type="button" class="cb-hud-ghost cb-hud-ghost--danger" id="cbProductionCancelBtn">
              <i class="fas fa-stop" aria-hidden="true"></i>
              <span>Cancelar</span>
            </button>
            <button type="button" class="cb-hud-ghost" data-production-modal-close>
              <i class="fas fa-compress-alt" aria-hidden="true"></i>
              <span>Minimizar</span>
            </button>
          </div>
        </div>
      </div>`;

    canvasEl = host.querySelector('.cb-hud-canvas');
    glassEl = host.querySelector('.cb-hud-glass');

    initThreeHUDScene(canvasEl, glassEl);
  } else if (!_activeThreeScene && canvasEl) {
    initThreeHUDScene(canvasEl, glassEl);
  }

  // COMPLETED state transition
  if (run.status === 'completed') {
    glassEl.className = 'cb-hud-glass cb-hud-glass--done';
    glassEl.innerHTML = `
      <span class="cb-hud-reticle cb-hud-reticle--tl" aria-hidden="true"></span>
      <span class="cb-hud-reticle cb-hud-reticle--tr" aria-hidden="true"></span>
      <span class="cb-hud-reticle cb-hud-reticle--bl" aria-hidden="true"></span>
      <span class="cb-hud-reticle cb-hud-reticle--br" aria-hidden="true"></span>
      <div class="cb-hud-done-check" aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="22" stroke="#10b981" stroke-width="2.5"/><polyline points="14,24 21,31 34,17" stroke="#10b981" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <p class="cb-hud-done-count">${completedTasks} / ${totalTasks} ELEMENTOS COMPLETADOS</p>
      <h2 class="cb-hud-done-title">Red Neuronal Formada y ${escapeText(unitLabel)} Lista</h2>
      <button type="button" class="cb-hud-cta" id="cbProductionCompleteCloseBtn" data-production-modal-close>
        <span>Ver en el editor</span> <i class="fas fa-arrow-right" aria-hidden="true"></i>
      </button>`;
    animateCompletedHud(host);
    return;
  }

  // Update dynamic elements smoothly
  const pctEl = glassEl.querySelector('.cb-hud-pct');
  const stageTitleEl = glassEl.querySelector('.cb-hud-stage-title');
  const stageDescEl = glassEl.querySelector('.cb-hud-stage-desc');
  if (stageDescEl) stageDescEl.remove();
  const tasksEl = glassEl.querySelector('.cb-hud-tasks');
  const activeAgentsHost = glassEl.querySelector('#cbHudActiveAgentsHost');
  const stepsHost = glassEl.querySelector('#cbHudStepsHost');
  const controlBtn = glassEl.querySelector('#cbProductionControlBtn');

  if (pctEl) pctEl.innerHTML = `${percent}<small>%</small>`;
  if (stageTitleEl) stageTitleEl.textContent = stageTitle;
  if (activeAgentsHost) {
    activeAgentsHost.innerHTML = renderActiveParallelAgents(runningTasks, run);
    const retryBtn = activeAgentsHost.querySelector('#cbHudInlineRetryBtn');
    if (retryBtn) retryBtn.onclick = () => onControl('resume');
  }
  if (tasksEl) tasksEl.textContent = `${completedTasks} / ${totalTasks} tareas`;
  if (stepsHost) stepsHost.innerHTML = renderTasksStepsGrid(tasks, run);

  if (controlBtn) {
    const isRunning = run.status === 'running';
    const isAttention = run.status === 'needs_attention';
    controlBtn.className = isAttention ? 'cb-hud-ghost cb-hud-ghost--primary' : 'cb-hud-ghost';
    controlBtn.innerHTML = `<i class="fas ${isRunning ? 'fa-pause' : isAttention ? 'fa-rotate-right' : 'fa-play'}" aria-hidden="true"></i><span>${isRunning ? 'Pausar' : isAttention ? 'Reintentar pendientes' : 'Reanudar'}</span>`;
    controlBtn.onclick = () => onControl(isRunning ? 'pause' : 'resume');
  }
  const cancelBtn = glassEl.querySelector('#cbProductionCancelBtn');
  if (cancelBtn) cancelBtn.onclick = () => onControl('cancel');
  if (stageTitleEl && failedTasks.length) {
    stageTitleEl.title = failedTasks.map(task => `${task.subtopic || task.section || task.stage}: ${task.error || 'Error de generación'}`).join('\n');
  } else if (stageTitleEl) stageTitleEl.removeAttribute('title');
}

// ---------------------------------------------------------------------------
// Animations (Anime.js)
// ---------------------------------------------------------------------------
async function animateCompletedHud(container) {
  const anime = await getAnime();
  if (!anime || !container) return;
  const glass = container.querySelector('.cb-hud-glass--done');
  const check = container.querySelector('.cb-hud-done-check');
  try {
    if (glass) anime({ targets: glass, opacity: [0, 1], scale: [0.94, 1], duration: 450, easing: 'easeOutExpo' });
    if (check) anime({ targets: check, scale: [0, 1.15, 1], opacity: [0, 1], duration: 600, delay: 120, easing: 'easeOutBack' });
  } catch (_) {}
}

function escapeText(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}
