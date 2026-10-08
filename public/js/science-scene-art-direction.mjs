// Shared, deterministic visual briefs. No provider, DOM or credentials are needed.
export const SCIENCE_SCENE_ART_VERSION = 2;
export const SCIENCE_SCENE_ASSET_ROOT = '/assets/science-scenes/v2/';
const SCIENCE_SCENE_ASSET_EXT = Object.freeze({
  background: Object.freeze({ rail: 'webp', harbor: 'webp', living: 'webp', math: 'webp', optics: 'webp', workbench: 'svg', micro: 'svg', thermal: 'svg' }),
  primary: Object.freeze({ rail: 'svg', harbor: 'svg', living: 'svg' })
});
const PENDING_BUNDLED_ASSETS = new Set(['workbench-background.svg', 'micro-background.svg', 'thermal-background.svg', 'rail-primary.svg', 'harbor-primary.svg', 'living-primary.svg']);
const family = (id, environment, camera, surface, hero = '') => ({ id, environment, camera, surface, hero });
export const SCIENCE_SCENE_FAMILIES = Object.freeze({
  rail: family('rail', 'Vías de tren junto a un paisaje abierto', 'Vista lateral ortográfica, horizonte estable', 'Vías horizontales a la altura del apoyo de las ruedas', 'Tren bala blanco, sin marcas, visto completamente de lado'),
  projectile: family('projectile', 'Campo de pruebas de tiro parabólico al aire libre, con una plataforma de lanzamiento y una zona amplia de caída', 'Vista lateral amplia, horizonte bajo y espacio despejado sobre el terreno', 'Suelo firme y horizontal con una plataforma corta de lanzamiento a la izquierda (ocupando del 15% al 25% del ancho, con superficie plana superior); dejar libre todo el arco de vuelo hacia la derecha', 'Cañón de laboratorio compacto orientado hacia la derecha, con sombra de contacto discreta en la base, sin proyectil incrustado'),
  harbor: family('harbor', 'Puerto tranquilo con agua azul y costa distante', 'Vista lateral del agua, horizonte alto', 'Superficie del agua horizontal', 'Barco de investigación de casco visible, sin marcas, visto de lado'),
  workbench: family('workbench', 'Mesa de experimentación en un taller científico luminoso', 'Vista frontal ligeramente elevada', 'Superficie de trabajo despejada'),
  optics: family('optics', 'Mesa óptica en un laboratorio con iluminación tenue', 'Vista frontal ligeramente elevada', 'Superficie mate oscura para ver rayos precisos', 'Prisma triangular de vidrio óptico incoloro, sin rayos incrustados'),
  living: family('living', 'Hábitat natural con vegetación y un claro de observación', 'Vista frontal a la altura de la muestra', 'Suelo libre en el primer plano', 'Planta joven completa con hojas verdes y raíces visibles en un pequeño terrón'),
  math: family('math', 'Mesa de materiales matemáticos junto a una ventana', 'Vista frontal ligeramente elevada', 'Mesa amplia, limpia y sin marcas ni objetos en el centro'),
  micro: family('micro', 'Laboratorio de observación microscópica', 'Vista frontal del área de observación', 'Área central despejada para una muestra aumentada'),
  thermal: family('thermal', 'Mesa de laboratorio para transferencia de calor', 'Vista frontal ligeramente elevada', 'Superficie resistente al calor despejada')
});
const normalized = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const modelOf = a => String(a.simulator?.modelId || a.simulatorProfile?.modelId || a.simulationType || '');
function chooseFamily(a) {
  const topic = normalized(a.topic), model = modelOf(a);
  if (a.subject === 'math') return 'math';
  if (a.subject === 'biology') return /ecosistem|alimentaria|biodiversidad|seleccion natural|evolucion|plantas|animales|fotosintesis|biogeoquimic/.test(topic) ? 'living' : 'micro';
  if (a.subject === 'chemistry') return /atom|period|proton|neutron|electron|ion|molecul|enlace|formula|compuesto|carbono|organica/.test(topic) ? 'micro' : 'thermal';
  if (/arquimedes|flotacion/.test(topic) || model === 'physics-buoyancy') return 'harbor';
  if (/refraccion|reflexion|^luz$/.test(topic) || /optics|reflection/.test(model)) return 'optics';
  if (/calor|termic|conduccion|conveccion|radiacion|temperatura|estado de la materia/.test(topic)) return 'thermal';
  if (/proyectil|projectile|tiro parabolico|movimiento parabolico/.test(topic) || model === 'projectile') return 'projectile';
  if (/rectilineo|aceleracion|distancia y desplazamiento|posicion y sistema|rapidez|^velocidad$|graficas de posicion|cantidad de movimiento|resistencia y friccion|equilibrio de fuerzas|leyes de newton|^fuerza$/.test(topic) || model === 'physics-motion') return 'rail';
  return 'workbench';
}
const ASSET_RULES = 'Realismo ilustrado editorial para adolescentes, materiales creíbles, bordes cuidados y luz suave. Sin marcas, texto, números, fórmulas, escalas, flechas, interfaz ni marcas de agua. Las medidas se dibujan mediante código.';

export function getScienceSceneArtDirection(activity = {}) {
  const familyId = chooseFamily(activity), f = SCIENCE_SCENE_FAMILIES[familyId];
  const topic = String(activity.topic || activity.title || 'Experimento científico');
  const model = modelOf(activity), text = normalized(topic);
  // Raster heroes are used only where the physical object matches the lesson.
  // Structures, anatomy, axes, rays and counting remain exact programmatic layers.
  const representation = familyId === 'rail' || familyId === 'harbor' || familyId === 'projectile' || familyId === 'living' && /^(plantas|fotosintesis)$/.test(text) ? 'object' : 'code';
  const hero = representation === 'object' ? f.hero : `Material o aparato manipulable para ${topic}, construido con geometría científica exacta`;
  const layout = {
    anchor: { x: familyId === 'projectile' ? .18 : .5, y: familyId === 'rail' ? .64 : familyId === 'projectile' ? .64 : familyId === 'harbor' ? .57 : .57 },
    scale: familyId === 'rail' ? .57 : familyId === 'harbor' ? .40 : familyId === 'projectile' ? .24 : .30,
    mobileAnchor: { x: familyId === 'projectile' ? .18 : .5, y: familyId === 'rail' ? .64 : familyId === 'projectile' ? .64 : .57 },
    mobileScale: familyId === 'rail' ? .78 : familyId === 'projectile' ? .30 : .58,
    safeArea: { x: .12, y: .15, width: .76, height: .70 },
    backgroundFit: 'cover', objectOrigin: 'center'
  };
  const controls = activity.controls || activity.simulatorProfile?.controls || [];
  const effects = controls.map(c => ({ id: c.id, label: c.label || c.id, unit: c.unit || '', effect: c.effect || `Modificar ${c.label || c.id} y observar el resultado del modelo`, source: 'scientific-model' }));
  const motion = { preset: familyId === 'rail' ? 'translate-x' : 'static', driver: familyId === 'rail' ? 'measurement:velocity' : 'time' };
  return {
    version: SCIENCE_SCENE_ART_VERSION, style: 'illustrated-realism', familyId, topic, modelId: model,
    environment: f.environment, hero, representation, camera: f.camera,
    lighting: 'Luz suave desde arriba a la izquierda, exposición equilibrada, sombras de contacto discretas',
    palette: 'Materiales naturales, azul petróleo y acentos cálidos moderados', layout, motion, effects,
    scientificOverlay: representation === 'object' ? 'vectors' : 'specimen',
    backgroundPrompt: `${ASSET_RULES} Fondo horizontal 16:9: ${f.environment}. ${f.camera}. ${f.surface}. Centro despejado para el experimento. Luz suave desde arriba a la izquierda. No incluir el protagonista ni aparatos que dupliquen las capas interactivas. Composición adaptable a recorte central móvil. Tema: ${topic}.`,
    primaryPrompt: representation === 'object' ? `${ASSET_RULES} Un solo objeto: ${hero}. Misma cámara y luz que ${f.environment}: ${f.camera}, luz suave desde arriba a la izquierda. Fondo verdaderamente transparente. Objeto completo sin recortes, con sombra de contacto discreta e integrada en la base sobre plano transparente, sin suelo duro ni elementos sueltos. No representar movimiento ni indicadores. Dejar margen exterior vacío.` : '',
    interaction: `Cambia una variable de ${topic}, observa el cambio en la escena y compáralo con la medición.`,
    qualityCriteria: ['escena reconocible', 'protagonista o material interactivo visible', 'perspectiva y luz coherentes', 'sin texto incrustado', 'medidas legibles', 'respuesta causal a controles', 'encuadre móvil completo'],
    limitations: 'Ilustración contextual; distancias, tamaños y velocidades de pantalla no constituyen una escala física salvo indicación expresa.'
  };
}

export function createScienceIllustratedScene(activity = {}) {
  const artDirection = getScienceSceneArtDirection(activity), {familyId, layout, motion} = artDirection;
  const provenance = { source: 'bundled-catalog', assetVersion: 2, artDirectionVersion: 2, reviewStatus: 'reference', manifest: `${SCIENCE_SCENE_ASSET_ROOT}manifest.json` };
  const bundledFamilyId = familyId === 'projectile' ? 'workbench' : familyId;
  const requiredAssets = [`${bundledFamilyId}-background.${SCIENCE_SCENE_ASSET_EXT.background[bundledFamilyId] || 'svg'}`, ...(artDirection.representation === 'object' ? [`${bundledFamilyId}-primary.${SCIENCE_SCENE_ASSET_EXT.primary[bundledFamilyId] || 'svg'}`] : [])];
  const assetPending = requiredAssets.some(asset => PENDING_BUNDLED_ASSETS.has(asset));
  return {
    version: 2, style: artDirection.style, familyId, representation: artDirection.representation,
    status: assetPending ? 'needs_attention' : 'ready', artDirection, layout, provenance,
    background: { imageSrc: `${SCIENCE_SCENE_ASSET_ROOT}${bundledFamilyId}-background.${SCIENCE_SCENE_ASSET_EXT.background[bundledFamilyId] || 'svg'}`, alt: artDirection.environment, prompt: artDirection.backgroundPrompt, ...provenance },
    layers: artDirection.representation === 'object' ? [{
      id: `${familyId}-primary`, role: 'primary', label: artDirection.hero,
      imageSrc: `${SCIENCE_SCENE_ASSET_ROOT}${bundledFamilyId}-primary.${SCIENCE_SCENE_ASSET_EXT.primary[bundledFamilyId] || 'svg'}`, prompt: artDirection.primaryPrompt,
      anchor: {...layout.anchor}, scale: layout.scale, mobileAnchor: {...layout.mobileAnchor}, mobileScale: layout.mobileScale,
      motionPreset: motion.preset, driver: motion.driver, visible: true, depth: 2, cutoutVersion: 6, ...provenance
    }] : [],
    generationWarnings: []
  };
}

export function normalizeScienceIllustratedScene(activity, scene) {
  if (scene?.version !== 2) return null;
  const source = structuredClone(scene), direction = getScienceSceneArtDirection(activity);
  const clamp = (v, min, max, fallback) => Number.isFinite(Number(v)) ? Math.max(min, Math.min(max, Number(v))) : fallback;
  const anchor = (v, fallback) => ({ x: clamp(v?.x, .05, .95, fallback.x), y: clamp(v?.y, .08, .92, fallback.y) });
  const layers = (Array.isArray(source.layers) ? source.layers : []).slice(0, 6).map((layer, index) => ({
    ...layer, id: String(layer.id || `element-${index}`), visible: layer.visible !== false,
    anchor: anchor(layer.anchor, direction.layout.anchor), mobileAnchor: anchor(layer.mobileAnchor, direction.layout.mobileAnchor),
    scale: clamp(layer.scale, .08, .8, direction.layout.scale), mobileScale: clamp(layer.mobileScale, .08, .9, direction.layout.mobileScale)
  }));
  const src = item => String(item?.dataUrl || item?.imageUrl || item?.imageSrc || '');
  const representation = ['object','code'].includes(source.representation) ? source.representation : direction.representation;
  const ready = src(source.background) && (representation === 'code' || layers.some(l => l.visible && l.role === 'primary' && src(l)));
  return { ...source, version: 2, style: 'illustrated-realism', familyId: source.familyId || direction.familyId,
    representation, artDirection: source.artDirection || direction, background: source.background || {}, layers,
    status: ready ? source.status === 'needs_attention' ? 'needs_attention' : 'ready' : 'needs_attention',
    generationWarnings: [...(Array.isArray(source.generationWarnings) ? source.generationWarnings.map(String) : []), ...(!ready ? ['Faltan recursos obligatorios de la escena ilustrada.'] : [])].slice(-12)
  };
}
