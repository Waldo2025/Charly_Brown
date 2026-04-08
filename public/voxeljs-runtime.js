let activeRuntime = null;

const DEFAULT_SEED = 1337;
const PLANET_RADIUS = 96;
const PLANET_SHELL_THICKNESS = 3;
const PLANET_CENTER = { x: 0, y: -PLANET_RADIUS, z: 0 };

const PLAYER_RADIUS = 0.35;
const PLAYER_EYE_HEIGHT = 1.6;
const PLAYER_TOP_OFFSET = 0.25;
const STEP_UP_HEIGHT = 0.8;

const ROOM_WIDTH = 48;
const ROOM_DEPTH = 40;
const ROOM_HEIGHT = 15;
const ROOM_HALF_WIDTH = Math.floor(ROOM_WIDTH * 0.5);
const ROOM_HALF_DEPTH = Math.floor(ROOM_DEPTH * 0.5);
const ROOM_FLOOR_Y = 0;
const ROOM_CEILING_Y = ROOM_FLOOR_Y + ROOM_HEIGHT;
const ROOM_WALL_THICKNESS = 2;
const ROOM_DOOR_HALF_WIDTH = 3;
const ROOM_DOOR_HEIGHT = 7;
const WINDOW_BOTTOM_Y = ROOM_FLOOR_Y + 4;
const WINDOW_TOP_Y = ROOM_FLOOR_Y + 9;
const CLASSROOM_ENTRY_Z = ROOM_HALF_DEPTH + 10;
const ROOM_INTERIOR_LIGHT_Y = ROOM_CEILING_Y - 2;

const SOCCER_CENTER = { x: -54, z: 4 };
const SOCCER_HALF = { x: 12, z: 18 };
const VOLLEY_CENTER = { x: 56, z: 2 };
const VOLLEY_HALF = { x: 10, z: 14 };
const ROCKET_PAD = { x: 0, z: 58 };

const DAY_DURATION_MS = 240_000;
const YEAR_DURATION_MS = 960_000;
const SKY_RADIUS = 520;
const CHUNK_UPDATE_INTERVAL_MS = 180;
const PLANET_FACE_IDS = ['top', 'bottom', 'north', 'south', 'east', 'west'];
const VOXEL_TRAVEL_BODIES = Object.freeze({
  earth: { id: 'earth', name: 'Tierra', surfaceBlock: 'grass_block', coreBlock: 'stone_core', hasClassroom: true },
  moon: { id: 'moon', name: 'Luna', surfaceBlock: 'sand_block', coreBlock: 'basalt_block', hasClassroom: false },
  mars: { id: 'mars', name: 'Marte', surfaceBlock: 'sand_block', coreBlock: 'stone_core', hasClassroom: false },
  jupiter: { id: 'jupiter', name: 'Jupiter', surfaceBlock: 'sand_block', coreBlock: 'stone_core', hasClassroom: false },
  saturn: { id: 'saturn', name: 'Saturno', surfaceBlock: 'sand_block', coreBlock: 'basalt_block', hasClassroom: false },
  uranus: { id: 'uranus', name: 'Urano', surfaceBlock: 'snow_grass', coreBlock: 'stone_core', hasClassroom: false },
  neptune: { id: 'neptune', name: 'Neptuno', surfaceBlock: 'snow_grass', coreBlock: 'basalt_block', hasClassroom: false },
  pluto: { id: 'pluto', name: 'Pluton', surfaceBlock: 'snow_grass', coreBlock: 'basalt_block', hasClassroom: false }
});
const VOXEL_SOLAR_SYSTEM_PLANETS = Object.freeze([
  { id: 'mercury', name: 'Mercurio', semiMajorAxisAU: 0.39, color: 0xb7a99a, orbitTilt: 0.12, axialTilt: 0.03, orbitPhase: 0.18, orbitFactor: 1.5, rotationFactor: 0.7, spriteScale: 10 },
  { id: 'venus', name: 'Venus', semiMajorAxisAU: 0.72, color: 0xd6b77a, orbitTilt: 0.08, axialTilt: 0.06, orbitPhase: 0.92, orbitFactor: 2.4, rotationFactor: 1.4, spriteScale: 14 },
  { id: 'earth', name: 'Tierra', semiMajorAxisAU: 1.0, color: 0x72b96a, orbitTilt: 0.06, axialTilt: 0.41, orbitPhase: 1.42, orbitFactor: 6, rotationFactor: 0.6, spriteScale: 0, moons: [
    { id: 'moon', name: 'Luna', color: 0xe3ecfa, orbitRadiusAU: 0.00257, orbitRadiusKm: 384400, orbitTilt: 0.12, axialTilt: 0.1, orbitPhase: 0.64, orbitFactor: 0.24, rotationFactor: 0.24, lockedToParent: true }
  ] },
  { id: 'mars', name: 'Marte', semiMajorAxisAU: 1.52, color: 0xc96b4a, orbitTilt: 0.09, axialTilt: 0.34, orbitPhase: 2.06, orbitFactor: 9, rotationFactor: 1.06, spriteScale: 12 },
  { id: 'jupiter', name: 'Júpiter', semiMajorAxisAU: 5.2, color: 0xcfab85, orbitTilt: 0.05, axialTilt: 0.12, orbitPhase: 2.72, orbitFactor: 15, rotationFactor: 0.42, spriteScale: 22 },
  { id: 'saturn', name: 'Saturno', semiMajorAxisAU: 9.58, color: 0xd7c38e, orbitTilt: 0.07, axialTilt: 0.47, orbitPhase: 3.45, orbitFactor: 21, rotationFactor: 0.46, spriteScale: 20, ring: true },
  { id: 'uranus', name: 'Urano', semiMajorAxisAU: 19.2, color: 0x98d4d5, orbitTilt: 0.1, axialTilt: 1.34, orbitPhase: 4.02, orbitFactor: 28, rotationFactor: 0.72, spriteScale: 17 },
  { id: 'neptune', name: 'Neptuno', semiMajorAxisAU: 30.05, color: 0x4e8ef8, orbitTilt: 0.11, axialTilt: 0.52, orbitPhase: 4.68, orbitFactor: 36, rotationFactor: 0.78, spriteScale: 16 },
  { id: 'pluto', name: 'Plutón', semiMajorAxisAU: 39.48, color: 0xddcaae, orbitTilt: 0.3, axialTilt: 2.14, orbitPhase: 5.2, orbitFactor: 45, rotationFactor: 1.2, spriteScale: 10 }
]);

const FACE_DEFS = Object.freeze({
  top: {
    id: 'top',
    axis: 'y',
    sign: 1,
    uAxis: 'x',
    uSign: 1,
    vAxis: 'z',
    vSign: 1,
    normal: [0, 1, 0]
  },
  bottom: {
    id: 'bottom',
    axis: 'y',
    sign: -1,
    uAxis: 'x',
    uSign: 1,
    vAxis: 'z',
    vSign: 1,
    normal: [0, -1, 0]
  },
  north: {
    id: 'north',
    axis: 'z',
    sign: -1,
    uAxis: 'x',
    uSign: 1,
    vAxis: 'y',
    vSign: 1,
    normal: [0, 0, -1]
  },
  south: {
    id: 'south',
    axis: 'z',
    sign: 1,
    uAxis: 'x',
    uSign: 1,
    vAxis: 'y',
    vSign: 1,
    normal: [0, 0, 1]
  },
  east: {
    id: 'east',
    axis: 'x',
    sign: 1,
    uAxis: 'z',
    uSign: -1,
    vAxis: 'y',
    vSign: 1,
    normal: [1, 0, 0]
  },
  west: {
    id: 'west',
    axis: 'x',
    sign: -1,
    uAxis: 'z',
    uSign: 1,
    vAxis: 'y',
    vSign: 1,
    normal: [-1, 0, 0]
  }
});

const BLOCK_DEFS = [
  { name: 'stone_core', displayName: 'Stone Core', texture: 'stone_core' },
  { name: 'grass_block', displayName: 'Grass Block', texture: ['grass_side', 'grass_side', 'grass_top', 'dirt', 'grass_side', 'grass_side'] },
  { name: 'snow_grass', displayName: 'Snow Grass', texture: ['snow_side', 'snow_side', 'snow_top', 'dirt', 'snow_side', 'snow_side'] },
  { name: 'sand_block', displayName: 'Sand Block', texture: 'sand_block' },
  { name: 'basalt_block', displayName: 'Basalt', texture: 'basalt_block' },
  { name: 'path_block', displayName: 'Path Block', texture: 'path_block' },
  { name: 'classroom_wall', displayName: 'Classroom Wall', texture: 'classroom_wall' },
  { name: 'classroom_trim', displayName: 'Classroom Trim', texture: 'classroom_trim' },
  { name: 'roof_block', displayName: 'Roof Block', texture: 'roof_block' },
  { name: 'tile_floor', displayName: 'Tile Floor', texture: 'tile_floor' },
  { name: 'glass_block', displayName: 'Glass', texture: 'glass_block', solid: false },
  { name: 'board_block', displayName: 'Board', texture: 'board_block' },
  { name: 'desk_block', displayName: 'Desk', texture: 'desk_block' },
  { name: 'chair_block', displayName: 'Chair', texture: 'chair_block' },
  { name: 'court_green', displayName: 'Court', texture: 'court_green' },
  { name: 'court_line', displayName: 'Court Line', texture: 'court_line' },
  { name: 'rocket_body', displayName: 'Rocket Body', texture: 'rocket_body' },
  { name: 'rocket_accent', displayName: 'Rocket Accent', texture: 'rocket_accent' },
  { name: 'rocket_window', displayName: 'Rocket Window', texture: 'rocket_window', solid: false },
  { name: 'tree_trunk', displayName: 'Tree Trunk', texture: 'tree_trunk' },
  { name: 'leaf_green', displayName: 'Green Leaves', texture: 'leaf_green' },
  { name: 'leaf_sakura', displayName: 'Sakura Leaves', texture: 'leaf_sakura' },
  { name: 'leaf_autumn', displayName: 'Autumn Leaves', texture: 'leaf_autumn' },
  { name: 'leaf_snow', displayName: 'Snow Leaves', texture: 'leaf_snow' },
  { name: 'water_block', displayName: 'Water', texture: 'water_block', solid: false },
  { name: 'ice_block', displayName: 'Ice', texture: 'ice_block' }
];

function loadVoxelJsBundle() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('VoxelJS bundle requires a browser context.'));
  }
  if (window.VoxelJS) return Promise.resolve(window.VoxelJS);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = './vendor/voxeljs.bundle.js';
    script.async = true;
    script.onload = () => {
      if (window.VoxelJS) resolve(window.VoxelJS);
      else reject(new Error('VoxelJS bundle loaded but global not found.'));
    };
    script.onerror = () => reject(new Error('No se pudo cargar voxeljs.bundle.js'));
    document.head.appendChild(script);
  });
}

function ensureThreeCompat(THREE) {
  if (!THREE) return;
  if (!THREE.MathUtils) {
    THREE.MathUtils = {};
  }
  if (typeof THREE.MathUtils.lerp !== 'function') {
    THREE.MathUtils.lerp = (a, b, t) => Number(a || 0) + ((Number(b || 0) - Number(a || 0)) * Number(t || 0));
  }
  if (typeof THREE.MathUtils.clamp !== 'function') {
    THREE.MathUtils.clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  }
  if (typeof THREE.MathUtils.degToRad !== 'function') {
    THREE.MathUtils.degToRad = (degrees) => Number(degrees || 0) * (Math.PI / 180);
  }
  if (typeof THREE.MathUtils.smoothstep !== 'function') {
    THREE.MathUtils.smoothstep = (value, min, max) => {
      const x = THREE.MathUtils.clamp((Number(value || 0) - Number(min || 0)) / Math.max(1e-6, Number(max || 0) - Number(min || 0)), 0, 1);
      return x * x * (3 - (2 * x));
    };
  }
  if (THREE.Vector3 && typeof THREE.Vector3.prototype.addScaledVector !== 'function') {
    THREE.Vector3.prototype.addScaledVector = function addScaledVector(vector, scale) {
      this.x += (vector?.x || 0) * Number(scale || 0);
      this.y += (vector?.y || 0) * Number(scale || 0);
      this.z += (vector?.z || 0) * Number(scale || 0);
      return this;
    };
  }
  if (THREE.Vector3 && typeof THREE.Vector3.prototype.projectOnPlane !== 'function') {
    THREE.Vector3.prototype.projectOnPlane = function projectOnPlane(planeNormal) {
      const normal = planeNormal?.clone?.() || new THREE.Vector3(0, 1, 0);
      const denom = normal.lengthSq?.() || ((normal.x * normal.x) + (normal.y * normal.y) + (normal.z * normal.z));
      if (denom <= 1e-8) return this;
      normal.normalize?.();
      const dot = this.dot(normal);
      this.x -= normal.x * dot;
      this.y -= normal.y * dot;
      this.z -= normal.z * dot;
      return this;
    };
  }
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value || 0)));
}

function snapToVoxel(value) {
  return Math.round(Number(value || 0));
}

function mod(value, divisor) {
  const safeDivisor = Number(divisor || 1);
  return ((value % safeDivisor) + safeDivisor) % safeDivisor;
}

function seededHash(seed, x = 0, y = 0, z = 0) {
  let h = Number(seed || 0) | 0;
  h = Math.imul(h ^ (x | 0), 0x45d9f3b);
  h = Math.imul(h ^ (y | 0), 0x119de1f3);
  h = Math.imul(h ^ (z | 0), 0x3449d);
  h ^= h >>> 16;
  return (h >>> 0);
}

function seededRandom(seed, x = 0, y = 0, z = 0) {
  return seededHash(seed, x, y, z) / 0xffffffff;
}

function computeSeedFromRoom(roomId) {
  if (!roomId) return DEFAULT_SEED;
  let hash = 0;
  const text = String(roomId);
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash || DEFAULT_SEED);
}

function getStableProjectedForward(THREE, upVector, directionHint = null) {
  const up = (upVector?.clone?.() || new THREE.Vector3(0, 1, 0)).normalize();
  const candidates = [
    directionHint?.clone?.() || new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0)
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    const projected = candidates[i].projectOnPlane(up);
    if (projected.lengthSq() > 1e-6) {
      return projected.normalize();
    }
  }
  return new THREE.Vector3(0, 0, -1);
}

function createTextureCanvas(size = 32) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function eachPixel(ctx, size, painter) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      painter(ctx, x, y, size);
    }
  }
}

function createPatternTexture(name, painter, size = 32) {
  const canvas = createTextureCanvas(size);
  const ctx = canvas.getContext('2d');
  painter(ctx, size);
  return `${canvas.toDataURL('image/png')}#${name}.png`;
}

function paintSolid(ctx, size, color) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
}

function paintDither(ctx, size, baseColor, accentColor, density = 0.16, seed = 1) {
  paintSolid(ctx, size, baseColor);
  eachPixel(ctx, size, (_ctx, x, y) => {
    if (seededRandom(seed, x, y) < density) {
      _ctx.fillStyle = accentColor;
      _ctx.fillRect(x, y, 1, 1);
    }
  });
}

function buildTextureMap() {
  const map = new Map();
  map.set('stone_core', createPatternTexture('stone_core', (ctx, s) => {
    paintDither(ctx, s, '#6b7280', '#4b5563', 0.2, 11);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let i = 2; i < s; i += 7) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i - 3, s);
      ctx.stroke();
    }
  }));
  map.set('grass_top', createPatternTexture('grass_top', (ctx, s) => {
    paintDither(ctx, s, '#68b84e', '#4f923a', 0.18, 21);
    eachPixel(ctx, s, (_ctx, x, y) => {
      if (seededRandom(22, x, y) < 0.06) {
        _ctx.fillStyle = '#8bd36a';
        _ctx.fillRect(x, y, 1, 1);
      }
    });
  }));
  map.set('grass_side', createPatternTexture('grass_side', (ctx, s) => {
    paintSolid(ctx, s, '#8a6a46');
    ctx.fillStyle = '#5fa84a';
    ctx.fillRect(0, 0, s, Math.floor(s * 0.28));
    paintDither(ctx, s, 'rgba(0,0,0,0)', 'rgba(75,55,38,0.35)', 0.18, 24);
  }));
  map.set('dirt', createPatternTexture('dirt', (ctx, s) => {
    paintDither(ctx, s, '#8a6a46', '#6f5536', 0.18, 31);
  }));
  map.set('snow_top', createPatternTexture('snow_top', (ctx, s) => {
    paintDither(ctx, s, '#f3f8ff', '#dce9f5', 0.18, 41);
  }));
  map.set('snow_side', createPatternTexture('snow_side', (ctx, s) => {
    paintSolid(ctx, s, '#8a6a46');
    ctx.fillStyle = '#f3f8ff';
    ctx.fillRect(0, 0, s, Math.floor(s * 0.38));
    paintDither(ctx, s, 'rgba(0,0,0,0)', 'rgba(120,130,150,0.12)', 0.08, 44);
  }));
  map.set('sand_block', createPatternTexture('sand_block', (ctx, s) => {
    paintDither(ctx, s, '#d9c189', '#c5aa6e', 0.16, 51);
  }));
  map.set('basalt_block', createPatternTexture('basalt_block', (ctx, s) => {
    paintDither(ctx, s, '#2d323a', '#171b20', 0.2, 61);
  }));
  map.set('path_block', createPatternTexture('path_block', (ctx, s) => {
    paintDither(ctx, s, '#8a7f70', '#6d6558', 0.14, 71);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < s; i += 8) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, s);
      ctx.stroke();
    }
  }));
  map.set('classroom_wall', createPatternTexture('classroom_wall', (ctx, s) => {
    paintDither(ctx, s, '#d6ddd8', '#c9d1cc', 0.1, 81);
    ctx.strokeStyle = 'rgba(77,94,112,0.18)';
    ctx.beginPath();
    ctx.moveTo(0, s * 0.18);
    ctx.lineTo(s, s * 0.18);
    ctx.stroke();
  }));
  map.set('classroom_trim', createPatternTexture('classroom_trim', (ctx, s) => {
    paintDither(ctx, s, '#49576b', '#364255', 0.12, 91);
  }));
  map.set('roof_block', createPatternTexture('roof_block', (ctx, s) => {
    paintDither(ctx, s, '#5a6675', '#404957', 0.14, 101);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    for (let i = 2; i < s; i += 6) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(s, i - 3);
      ctx.stroke();
    }
  }));
  map.set('tile_floor', createPatternTexture('tile_floor', (ctx, s) => {
    paintSolid(ctx, s, '#aab6c3');
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    const step = 8;
    for (let i = 0; i <= s; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(s, i);
      ctx.stroke();
    }
  }));
  map.set('glass_block', createPatternTexture('glass_block', (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(155, 205, 255, 0.28)';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(230,245,255,0.38)';
    ctx.strokeRect(1, 1, s - 2, s - 2);
    ctx.beginPath();
    ctx.moveTo(0, s * 0.25);
    ctx.lineTo(s, s * 0.6);
    ctx.stroke();
  }));
  map.set('board_block', createPatternTexture('board_block', (ctx, s) => {
    paintDither(ctx, s, '#21493b', '#17352a', 0.12, 111);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath();
    ctx.moveTo(4, s * 0.25);
    ctx.lineTo(s - 4, s * 0.18);
    ctx.moveTo(8, s * 0.58);
    ctx.lineTo(s - 7, s * 0.62);
    ctx.stroke();
  }));
  map.set('desk_block', createPatternTexture('desk_block', (ctx, s) => {
    paintDither(ctx, s, '#9d7248', '#7b5537', 0.18, 121);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    for (let i = 1; i < s; i += 5) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(s, i + 1);
      ctx.stroke();
    }
  }));
  map.set('chair_block', createPatternTexture('chair_block', (ctx, s) => {
    paintDither(ctx, s, '#5e6772', '#46505d', 0.14, 131);
  }));
  map.set('court_green', createPatternTexture('court_green', (ctx, s) => {
    paintDither(ctx, s, '#2f6d4c', '#24543a', 0.1, 141);
  }));
  map.set('court_line', createPatternTexture('court_line', (ctx, s) => {
    paintDither(ctx, s, '#edf1f4', '#cfd6dc', 0.04, 151);
  }));
  map.set('rocket_body', createPatternTexture('rocket_body', (ctx, s) => {
    paintDither(ctx, s, '#d9e1ea', '#bcc6d2', 0.08, 161);
    ctx.strokeStyle = 'rgba(90,100,116,0.16)';
    ctx.beginPath();
    ctx.moveTo(s * 0.5, 0);
    ctx.lineTo(s * 0.5, s);
    ctx.stroke();
  }));
  map.set('rocket_accent', createPatternTexture('rocket_accent', (ctx, s) => {
    paintDither(ctx, s, '#d44b48', '#a92f34', 0.1, 171);
  }));
  map.set('rocket_window', createPatternTexture('rocket_window', (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const gradient = ctx.createRadialGradient(s * 0.5, s * 0.4, s * 0.1, s * 0.5, s * 0.5, s * 0.55);
    gradient.addColorStop(0, 'rgba(196,232,255,0.95)');
    gradient.addColorStop(1, 'rgba(83,140,213,0.38)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, s, s);
  }));
  map.set('tree_trunk', createPatternTexture('tree_trunk', (ctx, s) => {
    paintDither(ctx, s, '#6f4a2d', '#56361f', 0.18, 181);
    ctx.strokeStyle = 'rgba(35,18,8,0.22)';
    for (let i = 4; i < s; i += 6) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i - 1, s);
      ctx.stroke();
    }
  }));
  map.set('leaf_green', createPatternTexture('leaf_green', (ctx, s) => {
    paintDither(ctx, s, '#3d8d4a', '#2b6e38', 0.18, 191);
  }));
  map.set('leaf_sakura', createPatternTexture('leaf_sakura', (ctx, s) => {
    paintDither(ctx, s, '#f7b7d3', '#ea8db8', 0.16, 201);
  }));
  map.set('leaf_autumn', createPatternTexture('leaf_autumn', (ctx, s) => {
    paintDither(ctx, s, '#d77431', '#aa451f', 0.18, 211);
  }));
  map.set('leaf_snow', createPatternTexture('leaf_snow', (ctx, s) => {
    paintDither(ctx, s, '#eff5fb', '#cad9e7', 0.18, 221);
    eachPixel(ctx, s, (_ctx, x, y) => {
      if (seededRandom(222, x, y) < 0.06) {
        _ctx.fillStyle = '#96adbf';
        _ctx.fillRect(x, y, 1, 1);
      }
    });
  }));
  map.set('water_block', createPatternTexture('water_block', (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(52, 128, 211, 0.7)';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(220,240,255,0.3)';
    for (let i = 0; i < s; i += 6) {
      ctx.beginPath();
      ctx.moveTo(0, i + 1);
      ctx.bezierCurveTo(s * 0.25, i - 1, s * 0.75, i + 3, s, i + 1);
      ctx.stroke();
    }
  }));
  map.set('ice_block', createPatternTexture('ice_block', (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(196, 230, 255, 0.82)';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.moveTo(s * 0.2, 0);
    ctx.lineTo(s * 0.8, s);
    ctx.moveTo(0, s * 0.72);
    ctx.lineTo(s, s * 0.25);
    ctx.stroke();
  }));
  return map;
}

function materialToTextureSpec(textureUrls, spec) {
  if (Array.isArray(spec)) {
    return spec.map((item) => textureUrls.get(item) || item);
  }
  return textureUrls.get(spec) || spec;
}

function getFaceDef(faceId) {
  return FACE_DEFS[faceId] || FACE_DEFS.top;
}

function getCubeFaceInfo(x, y, z) {
  const rx = x - PLANET_CENTER.x;
  const ry = y - PLANET_CENTER.y;
  const rz = z - PLANET_CENTER.z;
  const absX = Math.abs(rx);
  const absY = Math.abs(ry);
  const absZ = Math.abs(rz);
  const maxAxis = Math.max(absX, absY, absZ);
  if (maxAxis > PLANET_RADIUS) return null;
  if (maxAxis < (PLANET_RADIUS - PLANET_SHELL_THICKNESS + 1)) return null;
  let faceId = 'top';
  if (absY >= absX && absY >= absZ) {
    faceId = ry >= 0 ? 'top' : 'bottom';
  } else if (absX >= absY && absX >= absZ) {
    faceId = rx >= 0 ? 'east' : 'west';
  } else {
    faceId = rz >= 0 ? 'south' : 'north';
  }
  return {
    faceId,
    shellDepth: PLANET_RADIUS - maxAxis,
    maxAxis
  };
}

function getNearestSurfaceFaceId(x, y, z) {
  const rx = x - PLANET_CENTER.x;
  const ry = y - PLANET_CENTER.y;
  const rz = z - PLANET_CENTER.z;
  const candidates = [
    { faceId: 'top', distance: Math.abs(ry - PLANET_RADIUS) },
    { faceId: 'bottom', distance: Math.abs(ry + PLANET_RADIUS) },
    { faceId: 'east', distance: Math.abs(rx - PLANET_RADIUS) },
    { faceId: 'west', distance: Math.abs(rx + PLANET_RADIUS) },
    { faceId: 'south', distance: Math.abs(rz - PLANET_RADIUS) },
    { faceId: 'north', distance: Math.abs(rz + PLANET_RADIUS) }
  ];
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]?.faceId || 'top';
}

function getPlanetSurfaceNormalForCoords(THREE, x, y, z) {
  const face = getFaceDef(getNearestSurfaceFaceId(x, y, z));
  return new THREE.Vector3(face.normal[0], face.normal[1], face.normal[2]);
}

function getFaceLocal(faceId, x, y, z) {
  const face = getFaceDef(faceId);
  const rel = {
    x: x - PLANET_CENTER.x,
    y: y - PLANET_CENTER.y,
    z: z - PLANET_CENTER.z
  };
  return {
    u: rel[face.uAxis] * face.uSign,
    v: rel[face.vAxis] * face.vSign,
    w: (face.sign * rel[face.axis]) - PLANET_RADIUS
  };
}

function worldFromFace(faceId, u, v, w = 0) {
  const face = getFaceDef(faceId);
  const rel = { x: 0, y: 0, z: 0 };
  rel[face.uAxis] = u * face.uSign;
  rel[face.vAxis] = v * face.vSign;
  rel[face.axis] = face.sign * (PLANET_RADIUS + w);
  return {
    x: rel.x + PLANET_CENTER.x,
    y: rel.y + PLANET_CENTER.y,
    z: rel.z + PLANET_CENTER.z
  };
}

function createBasisVectors(faceId) {
  const face = getFaceDef(faceId);
  const u = { x: 0, y: 0, z: 0 };
  u[face.uAxis] = face.uSign;
  const v = { x: 0, y: 0, z: 0 };
  v[face.vAxis] = face.vSign;
  const n = { x: face.normal[0], y: face.normal[1], z: face.normal[2] };
  return { u, v, n };
}

function isInsideRoomFootprint(x, z, margin = 0) {
  return Math.abs(x) <= (ROOM_HALF_WIDTH - margin) && Math.abs(z) <= (ROOM_HALF_DEPTH - margin);
}

function isWindowOpening(x, y, z) {
  if (y < WINDOW_BOTTOM_Y || y > WINDOW_TOP_Y) return false;
  const sideWindow = (x === (-ROOM_HALF_WIDTH + 1) || x === (ROOM_HALF_WIDTH - 1)) && Math.abs(z) >= 6 && Math.abs(z) <= 13;
  const backWindow = z === (-ROOM_HALF_DEPTH + 1) && Math.abs(x) >= 10 && Math.abs(x) <= 14;
  return sideWindow || backWindow;
}

function getSeasonFromTime(nowMs) {
  const yearProgress = mod(nowMs, YEAR_DURATION_MS) / YEAR_DURATION_MS;
  if (yearProgress < 0.25) return { season: 'spring', yearProgress, seasonProgress: yearProgress / 0.25 };
  if (yearProgress < 0.5) return { season: 'summer', yearProgress, seasonProgress: (yearProgress - 0.25) / 0.25 };
  if (yearProgress < 0.75) return { season: 'autumn', yearProgress, seasonProgress: (yearProgress - 0.5) / 0.25 };
  return { season: 'winter', yearProgress, seasonProgress: (yearProgress - 0.75) / 0.25 };
}

function getCurrentSimTime(runtimeState) {
  const base = runtimeState.timeBaseMs || Date.now();
  return base + (runtimeState.timeOffsetMs || 0);
}

function cycleDurationToAngularSpeed(durationMs = DAY_DURATION_MS) {
  return (Math.PI * 2) / Math.max(1000, Number(durationMs || DAY_DURATION_MS));
}

function getConfigPeriodMsFromSpeed(speed, fallbackMs = DAY_DURATION_MS) {
  const safeSpeed = Number(speed || 0);
  return safeSpeed > 0 ? ((Math.PI * 2) / safeSpeed) : Math.max(1, Number(fallbackMs || DAY_DURATION_MS));
}

function getAngularProgress(nowMs = Date.now(), periodMs = DAY_DURATION_MS, phaseOffset = 0) {
  const normalizedPeriod = Math.max(1, Number(periodMs || DAY_DURATION_MS));
  return ((mod(nowMs, normalizedPeriod) / normalizedPeriod) * Math.PI * 2 + Number(phaseOffset || 0)) % (Math.PI * 2);
}

function createOrbitOffsetVector(THREE, radius = 1, angle = 0, tilt = 0, verticalFrequency = 1.15) {
  return new THREE.Vector3(
    Math.cos(angle) * radius,
    Math.sin(angle * verticalFrequency) * (radius * tilt),
    Math.sin(angle) * radius
  );
}

function getCelestialSpinAxis(THREE, axialTilt = 0) {
  return new THREE.Vector3(0, 1, 0)
    .applyAxisAngle(new THREE.Vector3(0, 0, 1), Number(axialTilt || 0))
    .normalize();
}

function getMoonOrbitVisualRadius(moonCfg = {}) {
  const orbitRadiusKm = Number(moonCfg.orbitRadiusKm || 0);
  if (Number.isFinite(orbitRadiusKm) && orbitRadiusKm > 0) {
    return 3.6 + (2.8 * Math.log10(1 + (orbitRadiusKm / 120000)));
  }
  const orbitRadiusAU = Math.max(0.00001, Number(moonCfg.orbitRadiusAU || 0.001));
  return 3.2 + (3.2 * Math.log10(1 + (orbitRadiusAU * 6000)));
}

function getMoonPhaseName(phaseAmount = 0) {
  const phase = clamp01(Number(phaseAmount || 0));
  if (phase <= 0.08) return 'luna_nueva';
  if (phase < 0.42) return 'creciente';
  if (phase <= 0.58) return 'cuarto';
  if (phase < 0.92) return 'gibosa';
  return 'luna_llena';
}

function buildVoxelSolarSnapshot(THREE, nowMs = Date.now()) {
  const planets = new Map();
  const moons = new Map();
  const earthConfig = VOXEL_SOLAR_SYSTEM_PLANETS.find((planet) => planet.id === 'earth') || VOXEL_SOLAR_SYSTEM_PLANETS[0];
  const earthOrbitReferenceMs = getConfigPeriodMsFromSpeed(cycleDurationToAngularSpeed(DAY_DURATION_MS * earthConfig.orbitFactor), DAY_DURATION_MS * earthConfig.orbitFactor);
  const earthRotationReferenceMs = getConfigPeriodMsFromSpeed(cycleDurationToAngularSpeed(DAY_DURATION_MS * earthConfig.rotationFactor), DAY_DURATION_MS * earthConfig.rotationFactor);

  VOXEL_SOLAR_SYSTEM_PLANETS.forEach((planetCfg, planetIndex) => {
    const orbitSpeed = cycleDurationToAngularSpeed(DAY_DURATION_MS * planetCfg.orbitFactor);
    const rotationSpeed = cycleDurationToAngularSpeed(DAY_DURATION_MS * planetCfg.rotationFactor);
    const orbitPeriodMs = (DAY_DURATION_MS * earthConfig.orbitFactor)
      * (getConfigPeriodMsFromSpeed(orbitSpeed, DAY_DURATION_MS * planetCfg.orbitFactor) / earthOrbitReferenceMs);
    const rotationPeriodMs = DAY_DURATION_MS
      * (getConfigPeriodMsFromSpeed(rotationSpeed, DAY_DURATION_MS * planetCfg.rotationFactor) / earthRotationReferenceMs);
    const orbitAngle = getAngularProgress(nowMs, orbitPeriodMs, Number(planetCfg.orbitPhase || (planetIndex * 0.62)));
    const physicalPosition = createOrbitOffsetVector(THREE, Number(planetCfg.semiMajorAxisAU || 1), orbitAngle, planetCfg.orbitTilt || 0, 1.33);
    const planetState = {
      id: planetCfg.id,
      config: planetCfg,
      orbitAngle,
      physicalPosition,
      rotationAngle: getAngularProgress(nowMs, rotationPeriodMs, 0),
      spinAxis: getCelestialSpinAxis(THREE, planetCfg.axialTilt || 0)
    };
    planets.set(planetCfg.id, planetState);

    (planetCfg.moons || []).forEach((moonCfg, moonIndex) => {
      const orbitSpeedMoon = cycleDurationToAngularSpeed(DAY_DURATION_MS * Number(moonCfg.orbitFactor || 1));
      const rotationSpeedMoon = cycleDurationToAngularSpeed(DAY_DURATION_MS * Number(moonCfg.rotationFactor || moonCfg.orbitFactor || 1));
      const orbitPeriodMsMoon = (DAY_DURATION_MS * 27.3)
        * (getConfigPeriodMsFromSpeed(orbitSpeedMoon, DAY_DURATION_MS * Number(moonCfg.orbitFactor || 1)) / earthOrbitReferenceMs);
      const rotationPeriodMsMoon = DAY_DURATION_MS
        * (getConfigPeriodMsFromSpeed(rotationSpeedMoon, DAY_DURATION_MS * Number(moonCfg.rotationFactor || moonCfg.orbitFactor || 1)) / earthRotationReferenceMs);
      const orbitAngleMoon = getAngularProgress(nowMs, orbitPeriodMsMoon, Number(moonCfg.orbitPhase || (moonIndex * 1.2)));
      const physicalLocalOffset = createOrbitOffsetVector(THREE, Number(moonCfg.orbitRadiusAU || 0.00257), orbitAngleMoon, moonCfg.orbitTilt || 0, 1.15);
      const physicalPosition = planetState.physicalPosition.clone().add(physicalLocalOffset);
      const localSunDirection = physicalPosition.clone().multiplyScalar(-1).normalize();
      const parentDirection = planetState.physicalPosition.clone().sub(physicalPosition).normalize();
      const spinAngle = moonCfg.lockedToParent
        ? orbitAngleMoon
        : getAngularProgress(nowMs, rotationPeriodMsMoon, 0);
      moons.set(`${planetCfg.id}:${moonCfg.id}`, {
        id: moonCfg.id,
        fullId: `${planetCfg.id}:${moonCfg.id}`,
        parentId: planetCfg.id,
        config: moonCfg,
        orbitAngle: orbitAngleMoon,
        spinAngle,
        rotationAngle: spinAngle,
        spinAxis: getCelestialSpinAxis(THREE, moonCfg.axialTilt || 0),
        physicalPosition,
        localSunDirection,
        parentDirection,
        phaseAmount: clamp01((1 - localSunDirection.dot(parentDirection)) * 0.5)
      });
    });
  });

  return { planets, moons };
}

function getSeasonalGroundBlock(runtimeState) {
  const body = VOXEL_TRAVEL_BODIES[runtimeState.activeBodyId] || VOXEL_TRAVEL_BODIES.earth;
  if (body.id !== 'earth') return body.surfaceBlock;
  return runtimeState.currentSeason === 'winter' ? 'snow_grass' : 'grass_block';
}

function getTravelBodyOptions() {
  return Object.values(VOXEL_TRAVEL_BODIES).map((body) => ({
    id: body.id,
    name: body.name
  }));
}

function getSeasonalLeafBlock(runtimeState) {
  if (runtimeState.currentSeason === 'spring') return 'leaf_sakura';
  if (runtimeState.currentSeason === 'autumn') return 'leaf_autumn';
  if (runtimeState.currentSeason === 'winter') return 'leaf_snow';
  return 'leaf_green';
}

function createTreeAnchor(faceId, u, v, options = {}) {
  const base = worldFromFace(faceId, u, v, 0);
  const basis = createBasisVectors(faceId);
  const canopyRadius = options.canopyRadius || 2;
  const trunkHeight = options.trunkHeight || 5;
  const canopyLift = options.canopyLift || 0;
  const canopyCenterW = trunkHeight + canopyLift;
  return {
    faceId,
    base,
    u,
    v,
    trunkHeight,
    canopyRadius,
    canopyLift,
    leafKind: options.leafKind || 'leaf_green',
    seasonal: !!options.seasonal,
    basis,
    bounds: {
      minU: u - canopyRadius,
      maxU: u + canopyRadius,
      minV: v - canopyRadius,
      maxV: v + canopyRadius,
      minW: 1,
      maxW: canopyCenterW + 2
    }
  };
}

function buildTreeAnchors(seed) {
  const anchors = [];
  const topTrees = [
    [-18, -26], [18, -26], [-24, 18], [24, 16], [-40, 42], [40, 42]
  ];
  topTrees.forEach(([u, v], index) => {
    anchors.push(createTreeAnchor('top', u, v, {
      trunkHeight: 5 + (index % 2),
      canopyRadius: 2 + (index % 2),
      seasonal: true
    }));
  });

  ['north', 'east', 'west'].forEach((faceId, faceIndex) => {
    for (let i = 0; i < 8; i += 1) {
      const u = -58 + ((i % 4) * 34) + Math.round(seededRandom(seed, faceIndex, i) * 6);
      const v = 30 + (Math.floor(i / 4) * 28) + Math.round(seededRandom(seed, faceIndex, i, 99) * 6);
      const leafKind = faceId === 'north'
        ? 'leaf_sakura'
        : faceId === 'east'
          ? 'leaf_autumn'
          : 'leaf_snow';
      anchors.push(createTreeAnchor(faceId, u, v, {
        trunkHeight: 4 + (i % 3),
        canopyRadius: 2 + ((i + faceIndex) % 2),
        leafKind
      }));
    }
  });

  return anchors;
}

function indexTreeAnchorsByFace(anchors = []) {
  const byFace = new Map();
  PLANET_FACE_IDS.forEach((faceId) => byFace.set(faceId, []));
  anchors.forEach((anchor) => {
    const bucket = byFace.get(anchor.faceId) || [];
    bucket.push(anchor);
    byFace.set(anchor.faceId, bucket);
  });
  return byFace;
}

function getRelevantTreeAnchors(runtimeState, faceId, x, y, z) {
  const anchors = runtimeState.treeAnchorsByFace?.get?.(faceId) || [];
  if (!anchors.length) return anchors;
  const local = getFaceLocal(faceId, x, y, z);
  const result = [];
  for (let i = 0; i < anchors.length; i += 1) {
    const anchor = anchors[i];
    if (!anchor?.bounds) continue;
    if (local.u < anchor.bounds.minU || local.u > anchor.bounds.maxU) continue;
    if (local.v < anchor.bounds.minV || local.v > anchor.bounds.maxV) continue;
    if (local.w < anchor.bounds.minW || local.w > anchor.bounds.maxW) continue;
    result.push(anchor);
  }
  return result;
}

function sampleTreeBlock(anchor, x, y, z, seasonalLeafBlock) {
  const relX = x - anchor.base.x;
  const relY = y - anchor.base.y;
  const relZ = z - anchor.base.z;
  const localU = Math.round(relX * anchor.basis.u.x + relY * anchor.basis.u.y + relZ * anchor.basis.u.z);
  const localV = Math.round(relX * anchor.basis.v.x + relY * anchor.basis.v.y + relZ * anchor.basis.v.z);
  const localW = Math.round(relX * anchor.basis.n.x + relY * anchor.basis.n.y + relZ * anchor.basis.n.z);
  if (localU === 0 && localV === 0 && localW >= 1 && localW <= anchor.trunkHeight) {
    return 'tree_trunk';
  }
  const canopyCenterW = anchor.trunkHeight + anchor.canopyLift;
  const leafBlock = anchor.seasonal ? seasonalLeafBlock : anchor.leafKind;
  if (
    localW >= (canopyCenterW - 1)
    && localW <= (canopyCenterW + 2)
    && Math.abs(localU) <= anchor.canopyRadius
    && Math.abs(localV) <= anchor.canopyRadius
  ) {
    const taper = Math.abs(localW - canopyCenterW);
    const maxSpread = anchor.canopyRadius - Math.max(0, taper - 1);
    if (Math.abs(localU) <= maxSpread && Math.abs(localV) <= maxSpread) {
      return leafBlock;
    }
  }
  if (
    localW === (canopyCenterW + 2)
    && Math.abs(localU) <= 1
    && Math.abs(localV) <= 1
  ) {
    return leafBlock;
  }
  return null;
}

function getTopSurfaceBlockName(runtimeState, x, z) {
  const groundBlock = getSeasonalGroundBlock(runtimeState);
  if (isInsideRoomFootprint(x, z, 0)) return 'tile_floor';

  const onEntryPath = Math.abs(x) <= 3 && z >= (ROOM_HALF_DEPTH + 1) && z <= 62;
  const entryPlaza = Math.abs(x) <= 14 && Math.abs(z - 62) <= 4;
  if (onEntryPath || entryPlaza) return 'path_block';

  if (
    Math.abs(x - SOCCER_CENTER.x) <= SOCCER_HALF.x
    && Math.abs(z - SOCCER_CENTER.z) <= SOCCER_HALF.z
  ) {
    const relX = Math.abs(x - SOCCER_CENTER.x);
    const relZ = Math.abs(z - SOCCER_CENTER.z);
    return relX === SOCCER_HALF.x || relZ === SOCCER_HALF.z || relX === 0 ? 'court_line' : 'court_green';
  }

  if (
    Math.abs(x - VOLLEY_CENTER.x) <= VOLLEY_HALF.x
    && Math.abs(z - VOLLEY_CENTER.z) <= VOLLEY_HALF.z
  ) {
    const relX = Math.abs(x - VOLLEY_CENTER.x);
    const relZ = Math.abs(z - VOLLEY_CENTER.z);
    return relX === VOLLEY_HALF.x || relZ === VOLLEY_HALF.z || relX === 0 ? 'court_line' : 'court_green';
  }

  const launchPad = Math.abs(x - ROCKET_PAD.x) <= 5 && Math.abs(z - ROCKET_PAD.z) <= 5;
  if (launchPad) return 'path_block';

  return groundBlock;
}

function getRocketBlockName(x, y, z) {
  const relX = x - ROCKET_PAD.x;
  const relZ = z - ROCKET_PAD.z;
  const relY = y - 1;
  if (y === 0 && Math.abs(relX) <= 5 && Math.abs(relZ) <= 5) return 'path_block';
  const radial = Math.hypot(relX, relZ);
  if (relY >= 0 && relY <= 11) {
    if (radial <= 2) {
      if (relY >= 4 && relY <= 7 && radial >= 1.2) return 'rocket_window';
      return 'rocket_body';
    }
    if (relY <= 2 && radial <= 3 && (Math.abs(relX) <= 1 || Math.abs(relZ) <= 1)) {
      return 'rocket_accent';
    }
  }
  if (relY > 11 && relY <= 15) {
    const taperRadius = Math.max(0, 2 - ((relY - 11) * 0.55));
    if (radial <= taperRadius) return 'rocket_body';
  }
  return null;
}

function getClassroomBlockName(x, y, z) {
  if (!isInsideRoomFootprint(x, z, 0)) return null;

  if (y === ROOM_FLOOR_Y) return 'tile_floor';
  if (y === ROOM_FLOOR_Y - 1) return 'stone_core';
  if (y === ROOM_CEILING_Y) return 'roof_block';

  const leftEdge = x <= (-ROOM_HALF_WIDTH + (ROOM_WALL_THICKNESS - 1));
  const rightEdge = x >= (ROOM_HALF_WIDTH - (ROOM_WALL_THICKNESS - 1));
  const backEdge = z <= (-ROOM_HALF_DEPTH + (ROOM_WALL_THICKNESS - 1));
  const frontEdge = z >= (ROOM_HALF_DEPTH - (ROOM_WALL_THICKNESS - 1));
  const wallBand = y > ROOM_FLOOR_Y && y < ROOM_CEILING_Y && (leftEdge || rightEdge || backEdge || frontEdge);

  if (wallBand) {
    if (isWindowOpening(x, y, z)) return 'glass_block';
    if (frontEdge && Math.abs(x) <= ROOM_DOOR_HALF_WIDTH && y <= (ROOM_FLOOR_Y + ROOM_DOOR_HEIGHT)) return 0;
    if (frontEdge && (Math.abs(x) === ROOM_DOOR_HALF_WIDTH + 1 || y === (ROOM_FLOOR_Y + ROOM_DOOR_HEIGHT + 1))) {
      return 'classroom_trim';
    }
    if (y === ROOM_FLOOR_Y + 1 || y === ROOM_CEILING_Y - 1) return 'classroom_trim';
    return 'classroom_wall';
  }

  if (z === (-ROOM_HALF_DEPTH + 2) && Math.abs(x) <= 7 && y >= (ROOM_FLOOR_Y + 3) && y <= (ROOM_FLOOR_Y + 6)) {
    return 'board_block';
  }
  if (y === ROOM_FLOOR_Y + 1 && Math.abs(x) <= 8 && z >= (-ROOM_HALF_DEPTH + 4) && z <= (-ROOM_HALF_DEPTH + 6)) {
    return 'desk_block';
  }

  const deskColumns = [-15, -5, 5, 15];
  const deskRows = [-8, -1, 6, 13];
  for (let i = 0; i < deskColumns.length; i += 1) {
    for (let j = 0; j < deskRows.length; j += 1) {
      const dx = deskColumns[i];
      const dz = deskRows[j];
      const onDesk = y === (ROOM_FLOOR_Y + 1) && x >= (dx - 1) && x <= dx && z >= dz && z <= (dz + 1);
      const onChair = y === (ROOM_FLOOR_Y + 1) && x === (dx - 1) && z === (dz - 1);
      if (onDesk) return 'desk_block';
      if (onChair) return 'chair_block';
    }
  }

  return 0;
}

function getFaceSurfaceBlockName(runtimeState, faceId, x, y, z) {
  const local = getFaceLocal(faceId, x, y, z);
  if (faceId === 'top') return getTopSurfaceBlockName(runtimeState, x, z);
  if (faceId === 'north') {
    if (Math.abs(local.u) <= 20 && local.v >= 18 && local.v <= 68) return 'path_block';
    return 'grass_block';
  }
  if (faceId === 'south') {
    if (Math.abs(local.u) <= 12 && local.v >= 18 && local.v <= 78) return 'path_block';
    return 'sand_block';
  }
  if (faceId === 'east') {
    return runtimeState.currentSeason === 'winter' ? 'basalt_block' : 'sand_block';
  }
  if (faceId === 'west') {
    return 'snow_grass';
  }
  return faceId === 'bottom' ? 'basalt_block' : 'stone_core';
}

function getWorldBlockName(runtimeState, x, y, z) {
  const sx = snapToVoxel(x);
  const sy = snapToVoxel(y);
  const sz = snapToVoxel(z);
  const faceInfo = getCubeFaceInfo(sx, sy, sz);

  const isEarth = (runtimeState.activeBodyId || 'earth') === 'earth';
  const classroomBlock = isEarth ? getClassroomBlockName(sx, sy, sz) : null;
  if (classroomBlock !== null && classroomBlock !== undefined) return classroomBlock;

  const rocketBlock = getRocketBlockName(sx, sy, sz);
  if (rocketBlock) return rocketBlock;

  const seasonalLeafBlock = getSeasonalLeafBlock(runtimeState);
  const relevantTrees = faceInfo ? getRelevantTreeAnchors(runtimeState, faceInfo.faceId, sx, sy, sz) : runtimeState.treeAnchors;
  for (let i = 0; i < relevantTrees.length; i += 1) {
    const treeBlock = sampleTreeBlock(relevantTrees[i], sx, sy, sz, seasonalLeafBlock);
    if (treeBlock) return treeBlock;
  }

  if (sy === 0) {
    const riverBand = sz <= (-42) && sz >= (-56) && Math.abs(sx) <= 22;
    if (riverBand) return 'water_block';
  }

  if (!faceInfo) return 0;
  if (faceInfo.shellDepth > 0) {
    const body = VOXEL_TRAVEL_BODIES[runtimeState.activeBodyId] || VOXEL_TRAVEL_BODIES.earth;
    return faceInfo.faceId === 'bottom' ? 'basalt_block' : body.coreBlock;
  }
  return getFaceSurfaceBlockName(runtimeState, faceInfo.faceId, sx, sy, sz);
}

function getLocalAxisInfo(gravityUp) {
  if (Math.abs(gravityUp.x) > 0.5) return { upAxis: 'x', upSign: Math.sign(gravityUp.x), h1: 'y', h2: 'z' };
  if (Math.abs(gravityUp.z) > 0.5) return { upAxis: 'z', upSign: Math.sign(gravityUp.z), h1: 'x', h2: 'y' };
  return { upAxis: 'y', upSign: Math.sign(gravityUp.y), h1: 'x', h2: 'z' };
}

function applyCameraOrientation(THREE, camera, lookDirection, upVector) {
  if (!camera) return;
  const up = (upVector?.clone?.() || new THREE.Vector3(0, 1, 0)).normalize();
  const forward = (lookDirection?.clone?.() || new THREE.Vector3(0, 0, -1)).normalize();
  if (Math.abs(forward.dot(up)) > 0.999) {
    forward.copy(getStableProjectedForward(THREE, up, forward));
  }
  const target = camera.position.clone().add(forward);
  camera.up.copy(up);
  camera.lookAt(target);
  camera.up.copy(up);
}

function publishDebugHooks(runtimeState) {
  if (typeof window === 'undefined') return;
  window.__ASCraftSkyDebug = () => runtimeState.debug.sky;
  window.__ASCraftMovementDebug = () => runtimeState.debug.movement;
  window.__ASCraftPerfDebug = () => runtimeState.debug.perf;
  window.__ASCraftPlanetDebug = () => runtimeState.debug.planet;
  window.__ASCraftTerrainDebug = (samples = []) => {
    const report = (Array.isArray(samples) ? samples : []).map((sample) => {
      const x = snapToVoxel(sample?.x);
      const z = snapToVoxel(sample?.z);
      const y = findTerrainSupportYAt(runtimeState, x, z, ROOM_FLOOR_Y + 20, 48);
      const faceInfo = getCubeFaceInfo(x, Math.floor(Number.isFinite(y) ? y : 0), z);
      return {
        id: sample?.id || `${x},${z}`,
        x,
        z,
        supportY: y,
        faceId: faceInfo?.faceId || null,
        block: getWorldBlockName(runtimeState, x, Math.floor(Number.isFinite(y) ? y - 0.5 : 0), z) || 0
      };
    });
    return {
      continuity: report.every((item) => Number.isFinite(item.supportY)),
      samples: report
    };
  };
  window.advanceTime = async (ms = 0) => {
    runtimeState.timeOffsetMs += Math.max(0, Number(ms || 0));
    updateSeasonState(runtimeState, true);
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    return runtimeState.debug.planet;
  };
}

function isSolidWorldVoxelAt(runtimeState, x, y, z) {
  const blockName = getWorldBlockName(runtimeState, x, y, z);
  if (!blockName) return false;
  const def = runtimeState.blockDefsByName.get(blockName);
  return def ? def.solid !== false : false;
}

function findTerrainSupportYAtLocal(runtimeState, x, y, z, gravityUp, searchDepth = 24) {
  const vx = snapToVoxel(x);
  const vy = snapToVoxel(y);
  const vz = snapToVoxel(z);
  const loc = getLocalAxisInfo(gravityUp);
  const pos = { x: vx, y: vy, z: vz };
  const startLocUp = Math.floor((pos[loc.upAxis] * loc.upSign) - PLAYER_EYE_HEIGHT + 0.5);

  for (let step = startLocUp + 2; step >= startLocUp - searchDepth; step -= 1) {
    pos[loc.upAxis] = step * loc.upSign;
    if (isSolidWorldVoxelAt(runtimeState, pos.x, pos.y, pos.z)) {
      return step + 0.5;
    }
  }
  return null;
}

function findTerrainSupportYAt(runtimeState, x, z, fromY = null, searchDepth = 32) {
  const y = Number.isFinite(fromY) ? Number(fromY) : ROOM_FLOOR_Y + 16;
  const gravityUp = getPlanetSurfaceNormalForCoords(runtimeState.THREE, x, y - PLAYER_EYE_HEIGHT, z);
  const offsets = [[0, 0], [0.28, 0.28], [-0.28, 0.28], [0.28, -0.28], [-0.28, -0.28]];
  let bestY = -Infinity;
  for (let i = 0; i < offsets.length; i += 1) {
    const py = findTerrainSupportYAtLocal(runtimeState, x + offsets[i][0], y, z + offsets[i][1], gravityUp, searchDepth);
    if (py > bestY) bestY = py;
  }
  return Number.isFinite(bestY) ? bestY : null;
}

function getTerrainVoxelContact(runtimeState, THREE, nextPos, knownSupportY = null) {
  const result = {
    collisionX: false,
    collisionZ: false,
    supportY: null
  };

  const gravityUp = getPlanetSurfaceNormalForCoords(THREE, nextPos.x, nextPos.y - PLAYER_EYE_HEIGHT, nextPos.z);
  const loc = getLocalAxisInfo(gravityUp);
  const minH1 = Math.floor(nextPos[loc.h1] - PLAYER_RADIUS);
  const maxH1 = Math.floor(nextPos[loc.h1] + PLAYER_RADIUS);
  const minH2 = Math.floor(nextPos[loc.h2] - PLAYER_RADIUS);
  const maxH2 = Math.floor(nextPos[loc.h2] + PLAYER_RADIUS);

  const playerBaseUp = nextPos[loc.upAxis] * loc.upSign;
  const playerBottom = playerBaseUp - PLAYER_EYE_HEIGHT;
  const playerTop = playerBaseUp + PLAYER_TOP_OFFSET;
  const minUp = Math.floor(playerBottom);
  const maxUp = Math.floor(playerTop);

  const playerMinH1 = nextPos[loc.h1] - PLAYER_RADIUS;
  const playerMaxH1 = nextPos[loc.h1] + PLAYER_RADIUS;
  const playerMinH2 = nextPos[loc.h2] - PLAYER_RADIUS;
  const playerMaxH2 = nextPos[loc.h2] + PLAYER_RADIUS;

  for (let h1 = minH1; h1 <= maxH1; h1 += 1) {
    for (let upVal = minUp; upVal <= maxUp; upVal += 1) {
      for (let h2 = minH2; h2 <= maxH2; h2 += 1) {
        const pos = { x: 0, y: 0, z: 0 };
        pos[loc.h1] = h1;
        pos[loc.h2] = h2;
        pos[loc.upAxis] = upVal * loc.upSign;
        if (!isSolidWorldVoxelAt(runtimeState, pos.x, pos.y, pos.z)) continue;

        const blockMinH1 = h1 - 0.5;
        const blockMaxH1 = h1 + 0.5;
        const blockMinUp = upVal - 0.5;
        const blockMaxUp = upVal + 0.5;
        const blockMinH2 = h2 - 0.5;
        const blockMaxH2 = h2 + 0.5;
        const blockTopUp = upVal + 0.5;

        const overlaps = playerMaxH1 > blockMinH1
          && playerMinH1 < blockMaxH1
          && playerTop > blockMinUp
          && playerBottom < blockMaxUp
          && playerMaxH2 > blockMinH2
          && playerMinH2 < blockMaxH2;
        if (!overlaps) continue;

        if (knownSupportY !== null && blockTopUp <= (knownSupportY + 0.001)) {
          if (result.supportY === null || blockTopUp > result.supportY) result.supportY = blockTopUp;
          continue;
        }

        const standingDelta = playerBottom - blockTopUp;
        if (standingDelta >= -0.45 && standingDelta <= STEP_UP_HEIGHT) {
          if (result.supportY === null || blockTopUp > result.supportY) {
            result.supportY = blockTopUp;
          }
        } else {
          const overlapH1 = Math.min(playerMaxH1, blockMaxH1) - Math.max(playerMinH1, blockMinH1);
          const overlapH2 = Math.min(playerMaxH2, blockMaxH2) - Math.max(playerMinH2, blockMinH2);
          const bodyMinUp = playerBottom + 0.2;
          const bodyMaxUp = playerTop - 0.05;
          const overlapsBodyUp = bodyMaxUp > blockMinUp && bodyMinUp < blockMaxUp;
          if (!overlapsBodyUp) continue;
          if (overlapH1 <= 0.001 || overlapH2 <= 0.001) continue;
          if (Math.min(overlapH1, overlapH2) < 0.02) continue;
          if (overlapH1 < overlapH2) {
            if (loc.h1 === 'x') result.collisionX = true;
            else result.collisionZ = true;
          } else {
            if (loc.h2 === 'z') result.collisionZ = true;
            else result.collisionX = true;
          }
        }
      }
    }
  }

  if (result.supportY === null) {
    result.supportY = findTerrainSupportYAtLocal(runtimeState, nextPos.x, nextPos.y, nextPos.z, gravityUp, 6);
  }
  return result;
}

function createGlowTexture(THREE, innerColor, outerColor, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size * 0.5, size * 0.5, size * 0.04, size * 0.5, size * 0.5, size * 0.5);
  gradient.addColorStop(0, innerColor);
  gradient.addColorStop(1, outerColor);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.Texture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createMoonPhaseTexture(THREE, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const texture = new THREE.Texture(canvas);
  texture.needsUpdate = true;
  return {
    canvas,
    ctx: canvas.getContext('2d'),
    texture
  };
}

function renderMoonPhaseTexture(moonPhase, phaseAmount = 1, isWaxing = true) {
  if (!moonPhase?.ctx || !moonPhase?.canvas) return;
  const { canvas, ctx, texture } = moonPhase;
  const size = canvas.width;
  const center = size * 0.5;
  const radius = size * 0.36;
  ctx.clearRect(0, 0, size, size);

  const glow = ctx.createRadialGradient(center, center, radius * 0.1, center, center, radius * 1.18);
  glow.addColorStop(0, 'rgba(220,230,255,0.16)');
  glow.addColorStop(1, 'rgba(220,230,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = 'rgba(18,23,34,0.94)';
  ctx.fillRect(center - radius, center - radius, radius * 2, radius * 2);

  const litGradient = ctx.createRadialGradient(center - (radius * 0.18), center - (radius * 0.2), radius * 0.12, center, center, radius);
  litGradient.addColorStop(0, 'rgba(252,253,255,1)');
  litGradient.addColorStop(0.62, 'rgba(219,227,242,0.98)');
  litGradient.addColorStop(1, 'rgba(176,190,214,0.94)');

  const signed = ((clamp01(phaseAmount) * 2) - 1) * (isWaxing ? 1 : -1);
  const offset = signed * radius * 0.92;
  const widthScale = 0.18 + (Math.abs(signed) * 0.82);
  ctx.save();
  ctx.translate(center + offset, center);
  ctx.scale(widthScale, 1);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = litGradient;
  ctx.fill();
  ctx.restore();

  ctx.restore();
  ctx.lineWidth = Math.max(2, radius * 0.04);
  ctx.strokeStyle = 'rgba(248,252,255,0.34)';
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.stroke();
  texture.needsUpdate = true;
}

function createLabelSprite(THREE, text = '', options = {}) {
  const canvas = document.createElement('canvas');
  const width = Number(options.width || 256);
  const height = Number(options.height || 64);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = options.bg || 'rgba(10,16,28,0.38)';
  ctx.strokeStyle = options.border || 'rgba(201,222,255,0.28)';
  ctx.lineWidth = 2;
  const radius = 18;
  ctx.beginPath();
  ctx.moveTo(radius, 6);
  ctx.lineTo(width - radius, 6);
  ctx.quadraticCurveTo(width - 6, 6, width - 6, radius);
  ctx.lineTo(width - 6, height - radius);
  ctx.quadraticCurveTo(width - 6, height - 6, width - radius, height - 6);
  ctx.lineTo(radius, height - 6);
  ctx.quadraticCurveTo(6, height - 6, 6, height - radius);
  ctx.lineTo(6, radius);
  ctx.quadraticCurveTo(6, 6, radius, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.font = `700 ${options.fontSize || 28}px sans-serif`;
  ctx.fillStyle = options.color || '#f8fbff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text || '').toUpperCase(), width * 0.5, height * 0.52);
  const texture = new THREE.Texture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.92,
    fog: false,
    depthWrite: false,
    depthTest: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(Number(options.scaleX || 32), Number(options.scaleY || 8), 1);
  return sprite;
}

function markRaycastIgnored(object3d) {
  if (!object3d) return object3d;
  object3d.userData = object3d.userData || {};
  object3d.userData.ignoreRaycast = true;
  return object3d;
}

function getSolarPlanetVisualRadius(diameterRatioEarth = 1) {
  const ratio = Math.max(0.1, Number(diameterRatioEarth || 1));
  return 2.9 + (Math.log10(1 + (ratio * 10.5)) * 7.6);
}

function getPlanetOrbitVisualRadius(semiMajorAxisAU = 1) {
  const au = Math.max(0.01, Number(semiMajorAxisAU || 1));
  return SKY_RADIUS * (0.54 + (Math.log10(1 + au) * 0.12));
}

function createCelestialBodyVisual(THREE, options = {}) {
  const root = markRaycastIgnored(new THREE.Object3D());
  const axialTiltGroup = markRaycastIgnored(new THREE.Object3D());
  root.add(axialTiltGroup);
  const radius = Math.max(0.8, Number(options.radius || 4));
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, Number(options.segments || 16), Number(options.segments || 16)),
    new THREE.MeshLambertMaterial({
      color: options.color || 0xffffff,
      transparent: true,
      opacity: Number(options.opacity ?? 0.92),
      fog: false
    })
  );
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  axialTiltGroup.rotation.z = Number(options.axialTilt || 0);
  axialTiltGroup.add(mesh);
  return { root, axialTiltGroup, mesh };
}

function createSolarSystemVisual(THREE) {
  const group = markRaycastIgnored(new THREE.Object3D());
  group.name = 'ASCraftSolarSystemLegacy';
  const sunAnchor = markRaycastIgnored(new THREE.Object3D());
  group.add(sunAnchor);
  const planetBodies = new Map();
  const moonBodies = new Map();

  VOXEL_SOLAR_SYSTEM_PLANETS.forEach((planetCfg) => {
    const diameterRatioEarth = Math.max(0.22, Number(planetCfg.semiMajorAxisAU || 1) < 1 ? 0.55 : (planetCfg.id === 'jupiter' ? 11.2 : (planetCfg.id === 'saturn' ? 9.5 : 1.1)));
    const radius = getSolarPlanetVisualRadius(diameterRatioEarth) * 0.66;
    const orbitPlane = markRaycastIgnored(new THREE.Object3D());
    orbitPlane.rotation.x = Number(planetCfg.orbitTilt || 0);
    sunAnchor.add(orbitPlane);

    const orbitPivot = markRaycastIgnored(new THREE.Object3D());
    orbitPivot.rotation.y = Number(planetCfg.orbitPhase || 0);
    orbitPlane.add(orbitPivot);

    const anchor = markRaycastIgnored(new THREE.Object3D());
    anchor.position.x = getPlanetOrbitVisualRadius(planetCfg.semiMajorAxisAU);
    orbitPivot.add(anchor);

    const visual = createCelestialBodyVisual(THREE, {
      radius,
      color: planetCfg.color || 0xffffff,
      opacity: 0.9,
      segments: 14,
      axialTilt: planetCfg.axialTilt || 0
    });
    anchor.add(visual.root);
    const label = createLabelSprite(THREE, planetCfg.name || planetCfg.id, {
      scaleX: 13,
      scaleY: 3.5,
      fontSize: 20
    });
    label.position.set(0, radius + 8, 0);
    anchor.add(label);

    if (planetCfg.ring) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 1.6, Math.max(0.2, radius * 0.18), 8, 36),
        new THREE.MeshBasicMaterial({
          color: 0xd7c79d,
          transparent: true,
          opacity: 0.6,
          fog: false,
          depthWrite: false
        })
      );
      ring.rotation.x = Math.PI * 0.5;
      visual.mesh.add(ring);
    }

    planetBodies.set(planetCfg.id, {
      orbitPlane,
      orbitPivot,
      anchor,
      axialTiltGroup: visual.axialTiltGroup,
      mesh: visual.mesh,
      label
    });

    (planetCfg.moons || []).forEach((moonCfg) => {
      const moonOrbitPlane = markRaycastIgnored(new THREE.Object3D());
      moonOrbitPlane.rotation.x = Number(moonCfg.orbitTilt || 0);
      anchor.add(moonOrbitPlane);

      const moonOrbitPivot = markRaycastIgnored(new THREE.Object3D());
      moonOrbitPivot.rotation.y = Number(moonCfg.orbitPhase || 0);
      moonOrbitPlane.add(moonOrbitPivot);

      const moonAnchor = markRaycastIgnored(new THREE.Object3D());
      moonAnchor.position.x = getMoonOrbitVisualRadius(moonCfg) * 8.2;
      moonOrbitPivot.add(moonAnchor);

      const moonVisual = createCelestialBodyVisual(THREE, {
        radius: Math.max(1.4, radius * 0.45),
        color: moonCfg.color || 0xe3ecfa,
        opacity: 0.92,
        segments: 12,
        axialTilt: moonCfg.axialTilt || 0
      });
      moonAnchor.add(moonVisual.root);
      const moonLabel = createLabelSprite(THREE, moonCfg.name || moonCfg.id, {
        scaleX: 10,
        scaleY: 3,
        fontSize: 18
      });
      moonLabel.position.set(0, (Math.max(1.4, radius * 0.45) + 6), 0);
      moonAnchor.add(moonLabel);
      moonBodies.set(`${planetCfg.id}:${moonCfg.id}`, {
        orbitPlane: moonOrbitPlane,
        orbitPivot: moonOrbitPivot,
        anchor: moonAnchor,
        axialTiltGroup: moonVisual.axialTiltGroup,
        mesh: moonVisual.mesh,
        label: moonLabel
      });
    });
  });

  return { group, sunAnchor, planetBodies, moonBodies };
}

function createSkySystem(game, runtimeState) {
  const THREE = runtimeState.THREE || game.THREE || window.THREE;
  const root = markRaycastIgnored(new THREE.Object3D());
  root.name = 'ASCraftVoxelSky';

  const backdrop = new THREE.Mesh(
    new THREE.SphereGeometry(SKY_RADIUS, 24, 18),
    new THREE.MeshBasicMaterial({
      color: 0x6b91b8,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false
    })
  );
  root.add(backdrop);

  const starTexture = createGlowTexture(THREE, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)', 56);
  const sunTexture = createGlowTexture(THREE, 'rgba(255,243,192,1)', 'rgba(255,204,116,0)', 160);
  const sun = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 18),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: false,
      opacity: 1,
      fog: false,
      depthWrite: false,
      depthTest: true
    })
  );
  root.add(sun);
  const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTexture,
    color: 0xffe6a8,
    transparent: true,
    opacity: 0.38,
    fog: false,
    depthWrite: false,
    depthTest: false
  }));
  sunHalo.scale.set(42, 42, 1);
  sunHalo.visible = true;
  sunHalo.material.opacity = 0.22;
  root.add(sunHalo);

  const moonPhase = createMoonPhaseTexture(THREE, 256);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: moonPhase.texture,
    color: 0xffffff,
    transparent: true,
    opacity: 0.84,
    fog: false,
    depthWrite: false,
    depthTest: false
  }));
  moon.scale.set(58, 58, 1);
  root.add(moon);
  const sunLabel = createLabelSprite(THREE, 'Sol', { scaleX: 18, scaleY: 4.8, fontSize: 24 });
  const moonLabel = createLabelSprite(THREE, 'Luna', { scaleX: 20, scaleY: 4.8, fontSize: 24 });
  root.add(sunLabel);
  root.add(moonLabel);

  const starGroup = markRaycastIgnored(new THREE.Object3D());
  const stars = [];
  for (let i = 0; i < 1400; i += 1) {
    const star = new THREE.Sprite(new THREE.SpriteMaterial({
      map: starTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 0.82,
      fog: false,
      depthWrite: false,
      depthTest: false
    }));
    const azimuth = seededRandom(runtimeState.seed, i, 1) * Math.PI * 2;
    const altitude = 0.02 + (seededRandom(runtimeState.seed, i, 2) * Math.PI * 0.95);
    const radius = SKY_RADIUS - 20 - (seededRandom(runtimeState.seed, i, 3) * 35);
    star.position.set(
      Math.cos(azimuth) * Math.sin(altitude) * radius,
      Math.cos(altitude) * radius,
      Math.sin(azimuth) * Math.sin(altitude) * radius
    );
    const scale = 0.9 + seededRandom(runtimeState.seed, i, 4) * 3.6;
    star.scale.set(scale, scale, 1);
    starGroup.add(star);
    stars.push(star);
  }
  root.add(starGroup);

  const constellationGroup = markRaycastIgnored(new THREE.Object3D());
  const constellationDefs = [
    { name: 'Orión', points: [[-180, 210, -280], [-146, 224, -264], [-114, 200, -248], [-78, 214, -232], [-42, 194, -216]] },
    { name: 'Casiopea', points: [[196, 128, -228], [162, 144, -242], [132, 120, -256], [98, 136, -270], [66, 114, -284]] },
    { name: 'Escorpión', points: [[-54, 238, -210], [-22, 252, -186], [16, 244, -164], [52, 262, -150]] }
  ];
  constellationDefs.forEach((constellation, groupIndex) => {
    const points = constellation.points;
    const group = markRaycastIgnored(new THREE.Object3D());
    const nodes = [];
    points.forEach((point, pointIndex) => {
      const node = new THREE.Sprite(new THREE.SpriteMaterial({
        map: starTexture,
        color: 0xb7d1ff,
        transparent: true,
        opacity: 0.88,
        fog: false,
        depthWrite: false,
        depthTest: false
      }));
      node.position.set(point[0], point[1], point[2]);
      node.scale.set(5.4, 5.4, 1);
      nodes.push(node);
      group.add(node);
      node.userData = node.userData || {};
      node.userData.twinklePhase = pointIndex + groupIndex;
    });
    for (let i = 1; i < nodes.length; i += 1) {
      const lineGeometry = new THREE.Geometry();
      lineGeometry.vertices.push(nodes[i - 1].position.clone(), nodes[i].position.clone());
      const line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({
        color: 0x87aef7,
        transparent: true,
        opacity: 0.4,
        fog: false,
        depthWrite: false,
        depthTest: false
      }));
      group.add(line);
    }
    const label = createLabelSprite(THREE, constellation.name || `Const ${groupIndex + 1}`, { scaleX: 24, scaleY: 5.2, fontSize: 22, color: '#dcecff' });
    label.position.copy(nodes[Math.floor(nodes.length * 0.5)].position.clone().add(new THREE.Vector3(0, 20, 0)));
    group.add(label);
    group.userData = group.userData || {};
    group.userData.label = label;
    constellationGroup.add(group);
  });
  root.add(constellationGroup);

  const milkyWay = markRaycastIgnored(new THREE.Object3D());
  for (let i = 0; i < 180; i += 1) {
    const dust = new THREE.Sprite(new THREE.SpriteMaterial({
      map: starTexture,
      color: 0xc9d9ff,
      transparent: true,
      opacity: 0.12,
      fog: false,
      depthWrite: false,
      depthTest: false
    }));
    const x = -360 + (i * 4);
    const y = 98 + Math.sin(i * 0.22) * 56;
    const z = -340 + Math.cos(i * 0.17) * 26;
    dust.position.set(x, y, z);
    const scale = 9 + Math.sin(i * 0.31) * 5;
    dust.scale.set(scale, scale * 0.7, 1);
    milkyWay.add(dust);
  }
  root.add(milkyWay);

  const solarVisual = createSolarSystemVisual(THREE);
  root.add(solarVisual.group);

  const sunLight = new THREE.DirectionalLight(0xfff1c4, 1.2);
  const moonLight = new THREE.DirectionalLight(0xa9c4ff, 0);
  const starLight = new THREE.DirectionalLight(0xaecbff, 0.01);
  const ambientLight = new THREE.AmbientLight(0x50647a, 0);
  const hemisphereLight = new THREE.HemisphereLight(0x87b3e2, 0x1a1f29, 0);
  const classroomLights = [];
  [new THREE.Vector3(-14, ROOM_INTERIOR_LIGHT_Y, -6), new THREE.Vector3(0, ROOM_INTERIOR_LIGHT_Y, 0), new THREE.Vector3(14, ROOM_INTERIOR_LIGHT_Y, 8)].forEach((position) => {
    const light = new THREE.PointLight(0xfff2d6, 0, 42);
    light.position.copy(position);
    classroomLights.push(light);
    game.scene?.add?.(light);
  });

  if (sunLight.target) {
    game.scene?.add?.(sunLight.target);
  }
  if (moonLight.target) {
    game.scene?.add?.(moonLight.target);
  }
  if (starLight.target) {
    game.scene?.add?.(starLight.target);
  }
  sunLight.castShadow = true;
  sunLight.shadowCameraNear = 10;
  sunLight.shadowCameraFar = 220;
  sunLight.shadowCameraLeft = -48;
  sunLight.shadowCameraRight = 48;
  sunLight.shadowCameraTop = 48;
  sunLight.shadowCameraBottom = -48;
  sunLight.shadowMapWidth = 1024;
  sunLight.shadowMapHeight = 1024;
  moonLight.castShadow = false;
  starLight.castShadow = false;

  game.scene?.add?.(root);
  game.scene?.add?.(sunLight);
  game.scene?.add?.(moonLight);
  game.scene?.add?.(starLight);
  game.scene?.add?.(ambientLight);
  game.scene?.add?.(hemisphereLight);

  return {
    root,
    backdrop,
    sun,
    sunHalo,
    sunLabel,
    moon,
    moonLabel,
    moonPhase,
    stars,
    starGroup,
    constellationGroup,
    milkyWay,
    solarVisual,
    sunLight,
    moonLight,
    starLight,
    ambientLight,
    hemisphereLight,
    classroomLights
  };
}

function updateChunkShadows(game) {
  Object.keys(game?.voxels?.meshes || {}).forEach((key) => {
    const mesh = game.voxels.meshes[key]?.surfaceMesh;
    if (!mesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.renderDepth = 1;
  });
}

function updateSeasonState(runtimeState, forceRefresh = false) {
  const seasonState = getSeasonFromTime(getCurrentSimTime(runtimeState));
  const previousSeason = runtimeState.currentSeason;
  runtimeState.currentSeason = seasonState.season;
  runtimeState.currentYearProgress = seasonState.yearProgress;
  runtimeState.currentSeasonProgress = seasonState.seasonProgress;
  if (forceRefresh || (previousSeason && previousSeason !== runtimeState.currentSeason)) {
    if (runtimeState.chunkRefreshTimer) {
      window.clearTimeout(runtimeState.chunkRefreshTimer);
    }
    runtimeState.chunkRefreshTimer = window.setTimeout(() => {
      runtimeState.chunkRefreshTimer = 0;
      refreshVisibleChunks(runtimeState);
    }, forceRefresh ? 140 : 60);
  }
}

function refreshVisibleChunks(runtimeState) {
  const game = runtimeState.game;
  if (!game?.voxels?.chunks) return;
  const chunkKeys = Object.keys(game.voxels.chunks);
  chunkKeys.forEach((key) => {
    const chunk = game.voxels.chunks[key];
    if (!chunk?.position) return;
    const [cx, cy, cz] = chunk.position;
    const nextChunk = game.voxels.generateChunk(cx, cy, cz);
    game.showChunk(nextChunk);
  });
  updateChunkShadows(game);
}

function updateSkySystem(runtimeState, deltaSeconds) {
  const game = runtimeState.game;
  const THREE = runtimeState.THREE || game.THREE || window.THREE;
  const sky = runtimeState.sky;
  if (!game?.camera || !sky) return;

  const nowMs = getCurrentSimTime(runtimeState);
  updateSeasonState(runtimeState, false);
  const dayProgress = mod(nowMs, DAY_DURATION_MS) / DAY_DURATION_MS;
  const snapshot = buildVoxelSolarSnapshot(THREE, nowMs);
  const earthState = snapshot.planets.get('earth');
  const earthMoonState = snapshot.moons.get('earth:moon');
  const playerPos = game.camera.position.clone();
  const surfaceUp = getPlanetSurfaceNormalForCoords(THREE, playerPos.x, playerPos.y - PLAYER_EYE_HEIGHT, playerPos.z);
  const inertialSunDirection = earthState?.physicalPosition?.clone?.().multiplyScalar?.(-1)?.normalize?.()
    || new THREE.Vector3(0.12, 0.84, -0.52).normalize();
  const sunDirection = earthState
    ? inertialSunDirection.clone().applyAxisAngle(earthState.spinAxis, -earthState.rotationAngle).normalize()
    : inertialSunDirection.clone();
  const moonDirection = earthState && earthMoonState
    ? earthMoonState.physicalPosition.clone()
      .sub(earthState.physicalPosition)
      .normalize()
      .applyAxisAngle(earthState.spinAxis, -earthState.rotationAngle)
      .normalize()
    : new THREE.Vector3(-0.64, 0.2, 0.74).normalize();
  const moonPhaseAmount = earthMoonState?.phaseAmount ?? clamp01((1 - moonDirection.dot(sunDirection)) * 0.5);
  const isWaxing = earthMoonState ? Math.sin(Number(earthMoonState.orbitAngle || 0)) >= 0 : dayProgress < 0.5;
  const sunAltitude = surfaceUp.dot(sunDirection);
  const dayFactor = clamp01((sunAltitude + 0.18) / 0.58);
  const twilightFactor = clamp01(1 - Math.abs(sunAltitude) * 2.2);
  const nightFactor = 1 - dayFactor;

  sky.root.position.copy(playerPos);
  const orbitalAngle = Number(earthState?.orbitAngle || (runtimeState.currentYearProgress * Math.PI * 2));
  const spinAngle = Number(earthState?.rotationAngle || (dayProgress * Math.PI * 2));
  if (earthState?.spinAxis) {
    sky.starGroup.quaternion.setFromAxisAngle(
      earthState.spinAxis,
      -spinAngle - (runtimeState.currentYearProgress * Math.PI * 2 * 0.018)
    );
    sky.constellationGroup.quaternion.setFromAxisAngle(
      earthState.spinAxis,
      -spinAngle - (runtimeState.currentYearProgress * Math.PI * 2 * 0.012)
    );
    sky.milkyWay.quaternion.setFromAxisAngle(
      earthState.spinAxis,
      -spinAngle - (runtimeState.currentYearProgress * Math.PI * 2 * 0.004)
    );
  }

  sky.sun.position.copy(sunDirection.clone().multiplyScalar(SKY_RADIUS * 0.74));
  sky.sun.lookAt(new THREE.Vector3(0, 0, 0));
  sky.sunHalo.position.copy(sky.sun.position);
  sky.moon.position.copy(moonDirection.clone().multiplyScalar(SKY_RADIUS * 0.7));
  sky.sunLabel.position.copy(sky.sun.position.clone().add(new THREE.Vector3(0, 26, 0)));
  sky.moonLabel.position.copy(sky.moon.position.clone().add(new THREE.Vector3(0, 22, 0)));
  const sunVisible = sunAltitude > -0.2;
  sky.sun.material.opacity = 1;
  sky.sun.visible = sunVisible;
  {
    const sunScale = 14 + (dayFactor * 14) + (twilightFactor * 7);
    sky.sun.scale.set(sunScale, sunScale, 1);
  }
  sky.sunHalo.visible = sunVisible;
  sky.sunHalo.material.opacity = clamp01((0.1 + (dayFactor * 0.2) + (twilightFactor * 0.34)) * (sunVisible ? 1 : 0));
  {
    const haloScale = 34 + (dayFactor * 18) + (twilightFactor * 12);
    sky.sunHalo.scale.set(haloScale, haloScale, haloScale);
  }
  sky.moon.material.opacity = 0.1 + (nightFactor * 0.74);
  sky.sunLabel.material.opacity = clamp01((0.14 + (dayFactor * 0.76)) * (sunAltitude > -0.14 ? 1 : 0));
  sky.sunLabel.visible = sky.sunLabel.material.opacity > 0.03;
  sky.moonLabel.material.opacity = clamp01((0.12 + (nightFactor * 0.82)) * (surfaceUp.dot(moonDirection) > -0.18 ? 1 : 0));
  sky.moonLabel.visible = sky.moonLabel.material.opacity > 0.03;
  renderMoonPhaseTexture(sky.moonPhase, moonPhaseAmount, isWaxing);

  sky.stars.forEach((star, index) => {
    const twinkle = 0.78 + Math.sin((nowMs * 0.0011) + index) * 0.18;
    star.material.opacity = (0.08 + (nightFactor * 0.86)) * twinkle;
    star.visible = star.material.opacity > 0.03;
  });
  sky.constellationGroup.children.forEach((group, groupIndex) => {
    const opacity = (0.06 + (nightFactor * 0.52)) * (0.86 + Math.sin((nowMs * 0.0006) + groupIndex) * 0.14);
    group.children.forEach((child) => {
      if (child.material) child.material.opacity = opacity;
      child.visible = opacity > 0.05;
    });
    if (group.userData?.label?.material) {
      group.userData.label.material.opacity = clamp01(opacity * 1.08);
      group.userData.label.visible = group.userData.label.material.opacity > 0.06;
    }
  });
  sky.milkyWay.children.forEach((dust, dustIndex) => {
    dust.material.opacity = (0.02 + (nightFactor * 0.22)) * (0.9 + Math.sin((nowMs * 0.00025) + dustIndex) * 0.08);
    dust.visible = dust.material.opacity > 0.04;
  });
  if (sky.solarVisual?.sunAnchor) {
    sky.solarVisual.sunAnchor.position.copy(sky.sun.position);
    sky.solarVisual.sunAnchor.lookAt(new THREE.Vector3(0, 0, 0));
  }
  if (sky.solarVisual?.planetBodies) {
    VOXEL_SOLAR_SYSTEM_PLANETS.forEach((planetCfg) => {
      const planetBody = sky.solarVisual.planetBodies.get(planetCfg.id);
      const planetState = snapshot.planets.get(planetCfg.id);
      if (!planetBody) return;
      if (planetBody.orbitPivot && planetState) {
        planetBody.orbitPivot.rotation.y = Number(planetState.orbitAngle || 0);
      }
      if (planetBody.mesh && planetState) {
        planetBody.mesh.rotation.y = Number(planetState.rotationAngle || 0);
      }
      const opacity = clamp01(0.28 + (nightFactor * 0.62));
      if (planetBody.mesh?.material) planetBody.mesh.material.opacity = opacity;
      if (planetBody.label?.material) {
        planetBody.label.material.opacity = clamp01(opacity * 0.88);
        planetBody.label.visible = planetBody.label.material.opacity > 0.08;
      }
      if (planetBody.anchor) planetBody.anchor.visible = opacity > 0.08;

      (planetCfg.moons || []).forEach((moonCfg) => {
        const moonBody = sky.solarVisual.moonBodies.get(`${planetCfg.id}:${moonCfg.id}`);
        const moonState = snapshot.moons.get(`${planetCfg.id}:${moonCfg.id}`);
        if (!moonBody) return;
        if (moonBody.orbitPivot && moonState) {
          moonBody.orbitPivot.rotation.y = Number(moonState.orbitAngle || 0);
        }
        if (moonBody.mesh && moonState) {
          moonBody.mesh.rotation.y = Number(moonState.rotationAngle || 0);
        }
        if (moonBody.mesh?.material) moonBody.mesh.material.opacity = clamp01(opacity * 0.9);
        if (moonBody.label?.material) {
          moonBody.label.material.opacity = clamp01(opacity * 0.84);
          moonBody.label.visible = moonBody.label.material.opacity > 0.08;
        }
        if (moonBody.anchor) moonBody.anchor.visible = opacity > 0.08;
      });
    });
  }

  const solarSkyMix = clamp01(dayFactor);
  const baseSky = new THREE.Color(0x02030a).lerp(new THREE.Color(0x2a4a78), solarSkyMix * 0.9);
  baseSky.lerp(new THREE.Color(0xff9b58), twilightFactor * 0.38);
  sky.backdrop.material.color.copy(baseSky);

  if (game.view?.renderer?.setClearColorHex) {
    game.view.renderer.setClearColorHex(baseSky.getHex(), 1);
  } else if (game.view?.renderer?.setClearColor) {
    game.view.renderer.setClearColor(baseSky, 1);
  }

  if (sky.sunLight.position) {
    const lightPos = playerPos.clone().add(sunDirection.clone().multiplyScalar(140));
    sky.sunLight.position.copy(lightPos);
    if (sky.sunLight.target?.position) sky.sunLight.target.position.copy(playerPos);
  }
  sky.sunLight.intensity = 0.3 + (dayFactor * 1.56) + (twilightFactor * 0.24);
  sky.sunLight.color.setHex(dayFactor > 0.55 ? 0xfff1cc : 0xffc38a);

  if (sky.moonLight.position) {
    const moonLightPos = playerPos.clone().add(moonDirection.clone().multiplyScalar(120));
    sky.moonLight.position.copy(moonLightPos);
    if (sky.moonLight.target?.position) sky.moonLight.target.position.copy(playerPos);
  }
  sky.moonLight.intensity = (0.02 + (nightFactor * 0.11)) * Math.max(0, 1 - (dayFactor * 0.9));
  if (sky.starLight?.position) {
    const starDirection = moonDirection.clone().multiplyScalar(-0.35).add(new THREE.Vector3(0.2, 0.9, -0.18)).normalize();
    const starLightPos = playerPos.clone().add(starDirection.multiplyScalar(140));
    sky.starLight.position.copy(starLightPos);
    if (sky.starLight.target?.position) sky.starLight.target.position.copy(playerPos);
  }
  if (sky.starLight) {
    sky.starLight.intensity = 0.01 + (nightFactor * 0.09);
    sky.starLight.color.setHex(0xaecbff);
  }
  sky.ambientLight.intensity = 0;
  sky.hemisphereLight.intensity = 0;
  sky.classroomLights.forEach((light) => {
    light.intensity = 0;
  });

  runtimeState.debug.sky = {
    season: runtimeState.currentSeason,
    yearProgress: Number(runtimeState.currentYearProgress.toFixed(4)),
    seasonProgress: Number(runtimeState.currentSeasonProgress.toFixed(4)),
    dayProgress: Number(dayProgress.toFixed(4)),
    sunAltitude: Number(sunAltitude.toFixed(4)),
    dayFactor: Number(dayFactor.toFixed(4)),
    nightFactor: Number(nightFactor.toFixed(4)),
    moonPhase: {
      name: getMoonPhaseName(moonPhaseAmount),
      amount: Number(moonPhaseAmount.toFixed(4)),
      waxing: isWaxing
    },
    sunDirection: { x: Number(sunDirection.x.toFixed(3)), y: Number(sunDirection.y.toFixed(3)), z: Number(sunDirection.z.toFixed(3)) },
    moonDirection: { x: Number(moonDirection.x.toFixed(3)), y: Number(moonDirection.y.toFixed(3)), z: Number(moonDirection.z.toFixed(3)) }
  };
  runtimeState.debug.planet = {
    faceId: getNearestSurfaceFaceId(playerPos.x, playerPos.y - PLAYER_EYE_HEIGHT, playerPos.z),
    roomId: runtimeState.roomId,
    activeBodyId: runtimeState.activeBodyId,
    season: runtimeState.currentSeason,
    dayProgress: Number(dayProgress.toFixed(4)),
    yearProgress: Number(runtimeState.currentYearProgress.toFixed(4)),
    spinAngle: Number(spinAngle.toFixed(3)),
    orbitalAngle: Number(orbitalAngle.toFixed(3)),
    loadedChunks: Object.keys(game?.voxels?.chunks || {}).length
  };
  runtimeState.debug.perf = {
    pendingChunks: Array.isArray(game?.pendingChunks) ? game.pendingChunks.length : 0,
    loadedChunks: Object.keys(game?.voxels?.chunks || {}).length,
    renderedChunks: Object.keys(game?.voxels?.meshes || {}).length,
    lastTickMs: Number(runtimeState.lastTickMs || 0),
    lastChunkRefreshAt: runtimeState.lastChunkRefreshAt || 0
  };
}

function createRuntimeState() {
  return {
    game: null,
    THREE: null,
    plugins: null,
    movementController: null,
    inputEnabled: false,
    roomId: '',
    activeBodyId: 'earth',
    seed: DEFAULT_SEED,
    timeBaseMs: Date.now(),
    timeOffsetMs: 0,
    currentSeason: 'spring',
    currentYearProgress: 0,
    currentSeasonProgress: 0,
    chunkRefreshTimer: 0,
    sky: null,
    treeAnchors: [],
    treeAnchorsByFace: new Map(),
    materialTextureUrls: new Map(),
    blockDefsByName: new Map(BLOCK_DEFS.map((def) => [def.name, def])),
    blockIds: {},
    debug: {
      sky: null,
      movement: null,
      planet: null,
      perf: null
    },
    lastTickMs: 0,
    lastChunkRefreshAt: 0
  };
}

function configureRendererForShadows(game) {
  const renderer = game?.view?.renderer;
  if (!renderer) return;
  if ('shadowMapEnabled' in renderer) renderer.shadowMapEnabled = true;
  if ('shadowMapSoft' in renderer) renderer.shadowMapSoft = true;
}

function registerBlocks(runtimeState, registry) {
  if (!registry || runtimeState.blocksRegistered) return;
  registry.getTextureURL = (name) => runtimeState.materialTextureUrls.get(name) || runtimeState.materialTextureUrls.get(String(name || '').toLowerCase()) || null;
  BLOCK_DEFS.forEach((def) => {
    registry.registerBlock(def.name, {
      texture: Array.isArray(def.texture) ? def.texture[2] || def.texture[0] : def.texture,
      displayName: def.displayName,
      solid: def.solid !== false
    });
  });
  runtimeState.blocksRegistered = true;
}

function createPluginSet(game, runtimeState, mod) {
  const pluginLoaders = {
    'voxel-registry': mod.voxelRegistry,
    'voxel-carry': mod.voxelCarry,
    'voxel-reach': mod.voxelReach,
    'voxel-mine': mod.voxelMine,
    'voxel-harvest': mod.voxelHarvest
  };
  const plugins = mod.createPlugins(game, {
    loaders: pluginLoaders,
    require: (name) => pluginLoaders[name]
  });
  plugins.add('voxel-registry', {});
  plugins.add('voxel-carry', {});
  plugins.add('voxel-reach', {});
  plugins.add('voxel-mine', {});
  plugins.add('voxel-harvest', {});
  plugins.loadAll();
  registerBlocks(runtimeState, plugins.get('voxel-registry'));
  return plugins;
}

function populateCarryInventory(mod, plugins) {
  const carry = plugins?.get?.('voxel-carry');
  if (!carry) return;
  const ItemPile = mod.itempile;
  [
    'classroom_wall',
    'classroom_trim',
    'tile_floor',
    'roof_block',
    'glass_block',
    'path_block',
    'grass_block',
    'court_green',
    'court_line',
    'tree_trunk',
    'leaf_green'
  ].forEach((itemName) => {
    carry.inventory.give(new ItemPile(itemName, 64));
  });
}

function moveCameraToSpawn(runtimeState) {
  const camera = runtimeState.game?.camera;
  if (!camera) return;
  const body = VOXEL_TRAVEL_BODIES[runtimeState.activeBodyId] || VOXEL_TRAVEL_BODIES.earth;
  if (body.id === 'earth') {
    camera.position.set(0.5, ROOM_FLOOR_Y + PLAYER_EYE_HEIGHT + 0.5, CLASSROOM_ENTRY_Z + 0.5);
  } else {
    const spawn = worldFromFace('top', 0, 0, 0);
    camera.position.set(
      spawn.x + 0.5,
      spawn.y + PLAYER_EYE_HEIGHT + 2.2,
      spawn.z + 0.5
    );
  }
  const spawnForward = new runtimeState.THREE.Vector3(0, 0, -1);
  applyCameraOrientation(runtimeState.THREE, camera, spawnForward, new runtimeState.THREE.Vector3(0, 1, 0));
}

function updateMovementDebug(runtimeState, movementState) {
  const camera = runtimeState.game?.camera;
  runtimeState.debug.movement = {
    roomId: runtimeState.roomId,
    faceId: camera ? getNearestSurfaceFaceId(camera.position.x, camera.position.y - PLAYER_EYE_HEIGHT, camera.position.z) : 'void',
    playerPosition: camera ? {
      x: Number(camera.position.x.toFixed(3)),
      y: Number(camera.position.y.toFixed(3)),
      z: Number(camera.position.z.toFixed(3))
    } : null,
    canJump: !!movementState?.canJump,
    isMoving: !!movementState?.isMoving,
    inputState: movementState?.inputState ? {
      forward: Number(movementState.inputState.forward || 0),
      backward: Number(movementState.inputState.backward || 0),
      left: Number(movementState.inputState.left || 0),
      right: Number(movementState.inputState.right || 0),
      jump: !!movementState.inputState.jump,
      sprint: !!movementState.inputState.sprint
    } : null
  };
}

async function buildGame(runtimeState, { containerId, seed, chunkSize, chunkDistance }) {
  const [mod, movementModule] = await Promise.all([
    loadVoxelJsBundle(),
    import('./lecturasGame-mineblox/runtime/movement-controller.js')
  ]);
  const { createGame } = mod;
  const { createASCraftMovementController } = movementModule;

  const mountRoot = document.getElementById(containerId) || document.body;
  const mountId = 'voxeljsMount';
  let mount = document.getElementById(mountId);
  if (!mount) {
    mount = document.createElement('div');
    mount.id = mountId;
    mount.style.position = 'absolute';
    mount.style.inset = '0';
    mount.style.zIndex = '3';
    mountRoot.prepend(mount);
  }
  mount.innerHTML = '';

  runtimeState.seed = seed;
  runtimeState.treeAnchors = buildTreeAnchors(seed);
  runtimeState.treeAnchorsByFace = indexTreeAnchorsByFace(runtimeState.treeAnchors);
  const textureUrls = buildTextureMap();
  runtimeState.materialTextureUrls = textureUrls;

  const materialNames = BLOCK_DEFS.map((def) => materialToTextureSpec(textureUrls, def.texture));
  const blockIds = BLOCK_DEFS.reduce((acc, def, index) => {
    acc[def.name] = index + 1;
    return acc;
  }, {});
  runtimeState.blockIds = blockIds;

  const game = createGame({
    chunkSize: chunkSize || 16,
    chunkDistance: chunkDistance || 2,
    removeDistance: (chunkDistance || 2) + 1,
    texturePath: '',
    materials: materialNames,
    materialFlatColor: false,
    materialType: window.THREE?.MeshLambertMaterial || undefined,
    controls: {
      discreteFire: false,
      fireRate: 100
    },
    lightsDisabled: true,
    fogDisabled: true,
    skyColor: 0x02030a,
    generate: (x, y, z) => blockIds[getWorldBlockName(runtimeState, x, y, z)] || 0
  });

  runtimeState.game = game;
  runtimeState.THREE = mod.THREE || game.THREE || window.THREE || window.VoxelJS?.THREE || null;
  ensureThreeCompat(runtimeState.THREE);
  game.appendTo(mount);
  configureRendererForShadows(game);
  if (game.scene) {
    game.scene.fog = null;
  }
  if (game.buttons?.disable) game.buttons.disable();
  game.controls?.target?.(null);

  updateSeasonState(runtimeState, true);
  moveCameraToSpawn(runtimeState);

  runtimeState.sky = createSkySystem(game, runtimeState);
  updateSkySystem(runtimeState, 0);

  game.on('renderChunk', () => {
    updateChunkShadows(game);
  });
  updateChunkShadows(game);

  const movementController = createASCraftMovementController(runtimeState.THREE, {
    syncState: (movementState) => updateMovementDebug(runtimeState, movementState)
  });
  movementController.bindControls({
    canvas: game.view?.element || game.view?.renderer?.domElement || null,
    document,
    window,
    setCameraRotationOrder: (order) => {
      if (game.camera?.rotation) game.camera.rotation.order = order;
    }
  });
  runtimeState.movementController = movementController;

  runtimeState.plugins = createPluginSet(game, runtimeState, mod);
  populateCarryInventory(mod, runtimeState.plugins);

  game.paused = false;
  let lastTickAt = Date.now();
  let lastChunkMaintenanceAt = 0;
  game.on('tick', (deltaMs) => {
    const now = Date.now();
    const deltaSeconds = Math.max(0, Number(deltaMs || 0) / 1000);
    runtimeState.lastTickMs = Number(deltaMs || 0);
    updateSkySystem(runtimeState, deltaSeconds);
    if (runtimeState.inputEnabled && runtimeState.movementController && game.camera) {
      try {
        runtimeState.movementController.step({
          delta: deltaSeconds,
          document,
          renderer: { domElement: game.view?.element || game.view?.renderer?.domElement || null },
          camera: game.camera,
          currentRoomId: runtimeState.roomId || 'ascraft-voxel',
          roomShellGroup: { name: 'VoxelClassroomReady' },
          playerPosition: game.camera.position,
          playerViewMode: 'first',
          getPlayerSpawnPosition: () => new runtimeState.THREE.Vector3(0.5, ROOM_FLOOR_Y + PLAYER_EYE_HEIGHT + 0.5, CLASSROOM_ENTRY_Z + 0.5),
          getPlanetBlend: () => 1,
          getPlanetSurfaceNormal: (position) => getPlanetSurfaceNormalForCoords(runtimeState.THREE, position.x, position.y - PLAYER_EYE_HEIGHT, position.z),
          getPlanetFrame: (position, _yaw, _blend, directionHint) => {
            const up = getPlanetSurfaceNormalForCoords(runtimeState.THREE, position.x, position.y - PLAYER_EYE_HEIGHT, position.z);
            const forward = getStableProjectedForward(runtimeState.THREE, up, directionHint);
            const right = new runtimeState.THREE.Vector3().crossVectors(forward, up).normalize();
            return { up, forward, right };
          },
          getPlanetCenter: () => new runtimeState.THREE.Vector3(PLANET_CENTER.x, PLANET_CENTER.y, PLANET_CENTER.z),
          getPlanetEyeRadius: () => PLANET_RADIUS + PLAYER_EYE_HEIGHT,
          getEarthWalkableSurfaceY: (x, z) => findTerrainSupportYAt(runtimeState, x, z, ROOM_FLOOR_Y + 12, 48),
          getEarthWalkableSurfaceNormal: (x, z) => getPlanetSurfaceNormalForCoords(runtimeState.THREE, x, ROOM_FLOOR_Y - PLAYER_EYE_HEIGHT, z),
          getClampedEarthSurfaceSample: (x, z) => ({ x, z, clamped: false }),
          activeCelestialBody: 'earth',
          findTerrainSupportYAt: (x, z, fromY, searchDepth) => findTerrainSupportYAt(runtimeState, x, z, fromY, searchDepth),
          getTerrainVoxelContact: (nextPos, knownSupportY) => getTerrainVoxelContact(runtimeState, runtimeState.THREE, nextPos, knownSupportY),
          applyCameraOrientation: (camera, lookDirection, upVector) => applyCameraOrientation(runtimeState.THREE, camera, lookDirection, upVector),
          updateLocalPlayerAvatar: () => {},
          playStepSound: () => {},
          roomWidth: ROOM_WIDTH,
          roomDepth: ROOM_DEPTH,
          roomHeight: ROOM_HEIGHT,
          playerRadius: PLAYER_RADIUS,
          playerEyeHeight: PLAYER_EYE_HEIGHT,
          playerTopOffset: PLAYER_TOP_OFFSET,
          roomFloorY: ROOM_FLOOR_Y,
          stepUpHeight: STEP_UP_HEIGHT
        });
      } catch (error) {
        console.error('[ASCraft Voxel Runtime] movement step failed', error);
      }
    }

    if ((now - lastChunkMaintenanceAt) >= CHUNK_UPDATE_INTERVAL_MS) {
      lastChunkMaintenanceAt = now;
      runtimeState.lastChunkRefreshAt = now;
      game.removeFarChunks([game.camera.position.x, game.camera.position.y, game.camera.position.z]);
    }
    lastTickAt = now;
  });

  publishDebugHooks(runtimeState);
  return {
    game,
    plugins: runtimeState.plugins,
    getTravelBodyOptions,
    setInputEnabled(enabled) {
      runtimeState.inputEnabled = !!enabled;
      if (!enabled) {
        runtimeState.movementController?.resetMovementState?.();
        updateMovementDebug(runtimeState, runtimeState.movementController?.state || null);
      }
    },
    startWorld(roomId, bodyId = runtimeState.activeBodyId) {
      runtimeState.roomId = roomId || runtimeState.roomId || 'ascraft-voxel';
      runtimeState.activeBodyId = VOXEL_TRAVEL_BODIES[String(bodyId || 'earth').toLowerCase()] ? String(bodyId || 'earth').toLowerCase() : 'earth';
      runtimeState.seed = computeSeedFromRoom(runtimeState.roomId);
      runtimeState.timeBaseMs = Date.now();
      runtimeState.timeOffsetMs = 0;
      runtimeState.treeAnchors = buildTreeAnchors(runtimeState.seed);
      runtimeState.treeAnchorsByFace = indexTreeAnchorsByFace(runtimeState.treeAnchors);
      updateSeasonState(runtimeState, true);
      moveCameraToSpawn(runtimeState);
      updateSkySystem(runtimeState, 0);
    },
    travelToBody(bodyId = 'earth') {
      const normalizedBodyId = String(bodyId || 'earth').trim().toLowerCase();
      runtimeState.activeBodyId = VOXEL_TRAVEL_BODIES[normalizedBodyId] ? normalizedBodyId : 'earth';
      runtimeState.timeBaseMs = Date.now();
      runtimeState.timeOffsetMs = 0;
      updateSeasonState(runtimeState, true);
      moveCameraToSpawn(runtimeState);
      refreshVisibleChunks(runtimeState);
      updateSkySystem(runtimeState, 0);
    }
  };
}

export async function initVoxelJsRuntime(options = {}) {
  const containerId = options.containerId || 'lecturasGameCanvasContainer';
  if (activeRuntime) return activeRuntime;

  const runtimeState = createRuntimeState();
  const runtime = {
    game: null,
    plugins: null,
    state: runtimeState,
    setInputEnabled(enabled) {
      runtimeState.inputEnabled = !!enabled;
    },
    getTravelBodyOptions,
    travelToBody(bodyId = 'earth') {
      const normalizedBodyId = String(bodyId || 'earth').trim().toLowerCase();
      runtimeState.activeBodyId = VOXEL_TRAVEL_BODIES[normalizedBodyId] ? normalizedBodyId : 'earth';
      runtimeState.timeBaseMs = Date.now();
      runtimeState.timeOffsetMs = 0;
      updateSeasonState(runtimeState, true);
      moveCameraToSpawn(runtimeState);
      refreshVisibleChunks(runtimeState);
      updateSkySystem(runtimeState, 0);
      return runtimeState.activeBodyId;
    },
    async start({ roomId, bodyId } = {}) {
      const normalizedRoomId = roomId || runtimeState.roomId || 'ascraft-voxel';
      const normalizedBodyId = String(bodyId || runtimeState.activeBodyId || 'earth').trim().toLowerCase();
      const seed = computeSeedFromRoom(normalizedRoomId);
      if (!this.game) {
        const built = await buildGame(runtimeState, {
          containerId,
          seed,
          chunkSize: options.chunkSize || 16,
          chunkDistance: options.chunkDistance || 2
        });
        this.game = built.game;
        this.plugins = built.plugins;
        this.setInputEnabled = built.setInputEnabled;
        runtimeState.roomId = normalizedRoomId;
        runtimeState.activeBodyId = VOXEL_TRAVEL_BODIES[normalizedBodyId] ? normalizedBodyId : 'earth';
        built.startWorld(normalizedRoomId, runtimeState.activeBodyId);
        this.travelToBody = built.travelToBody;
        this.setInputEnabled(false);
        return this.game;
      }

      runtimeState.roomId = normalizedRoomId;
      runtimeState.activeBodyId = VOXEL_TRAVEL_BODIES[normalizedBodyId] ? normalizedBodyId : 'earth';
      runtimeState.seed = seed;
      runtimeState.timeBaseMs = Date.now();
      runtimeState.timeOffsetMs = 0;
      runtimeState.treeAnchors = buildTreeAnchors(seed);
      runtimeState.treeAnchorsByFace = indexTreeAnchorsByFace(runtimeState.treeAnchors);
      updateSeasonState(runtimeState, true);
      moveCameraToSpawn(runtimeState);
      updateSkySystem(runtimeState, 0);
      this.setInputEnabled(false);
      return this.game;
    }
  };

  activeRuntime = runtime;
  if (options.roomId) {
    await runtime.start({ roomId: options.roomId });
  }
  return runtime;
}
