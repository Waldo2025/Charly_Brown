import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
    getFirestore, collection, doc, setDoc, onSnapshot, getDoc, updateDoc, deleteDoc,
    query, where, getDocs, serverTimestamp, addDoc, limit, writeBatch
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { firebaseWebConfig } from "./firebase-web-config.js";
import { buildApiUrl } from "./api-client.js";
import { withGameVersion } from "./lecturasGame-build.js";

const {
    createASCraftMovementController,
    createASCraftCollisionBroadphase
} = await import(withGameVersion("./lecturasGame-mineblox.movement.js"));
const { createSkyLightingRuntime } = await import(withGameVersion("./lecturasGame-mineblox/runtime/sky-lighting.js"));

// Helper for textures/voxel look
const VOXEL_SIZE = 1;
const ROOM_WIDTH = 30;
const ROOM_DEPTH = 30;
const ROOM_HEIGHT = 10;
const OUTDOOR_WORLD_RADIUS = 132;
const OUTDOOR_WORLD_INNER_RADIUS = Math.ceil(Math.max(ROOM_WIDTH, ROOM_DEPTH) / 2) + 12;
const OUTDOOR_PLATEAU_RADIUS = 96;
const OUTDOOR_PLATEAU_BLEND = 24;
const CARDINAL_TERRACE_RADIUS = 36;
const CARDINAL_TERRACE_BLEND = 28;
const OUTDOOR_TERRAIN_DEPTH = 3;
const VOLLEYBALL_COURT_CENTER_X = 54;
const VOLLEYBALL_COURT_CENTER_Z = 0;
const VOLLEYBALL_COURT_HALF_WIDTH = 8;
const VOLLEYBALL_COURT_HALF_DEPTH = 12;
const VOLLEYBALL_COURT_TERRACE_RADIUS = 16;
const VOLLEYBALL_NET_HALF_WIDTH = 0.5;
const VOLLEYBALL_NET_HEIGHT = 4;
const SOCCER_COURT_CENTER_X = -54;
const SOCCER_COURT_CENTER_Z = 0;
const SOCCER_COURT_HALF_WIDTH = 9;
const SOCCER_COURT_HALF_DEPTH = 15;
const SOCCER_GOAL_HALF_WIDTH = 2;
const SOCCER_GOAL_HEIGHT = 3;
const EARTH_LAUNCH_PAD_X = 0;
const EARTH_LAUNCH_PAD_Z = 54;
const EARTH_LAUNCH_PAD_OFFSET_Y = 0.1;
const LAKE_CENTER_X = 0;
const LAKE_CENTER_Z = -54;
const LAKE_RADIUS = 16;
const OCEAN_RAFT_START = Object.freeze({
    x: OUTDOOR_WORLD_RADIUS + 0.9,
    y: -OUTDOOR_WORLD_RADIUS + 22,
    z: 24
});
const OCEAN_CARAVEL_START = Object.freeze({
    x: OUTDOOR_WORLD_RADIUS + 1.0,
    y: -OUTDOOR_WORLD_RADIUS - 18,
    z: -20
});
const VOLLEYBALL_DOME_RADIUS = 18;
const OUTDOOR_WORLD_STREAM_RADIUS = OUTDOOR_WORLD_RADIUS;
const ROOM_WORLD_OFFSET_Y = -1;
const LEGACY_ROOM_WORLD_OFFSET_Y = -10.5;
const EARTH_ROCKET_PAD_OFFSET_Y = 0.95;
const OUTDOOR_TERRAIN_SPHERE_BLEND = 0.72;
const OUTDOOR_LIGHT_POST_HEIGHT = 9.2;
const RIVER_HALF_WIDTH = 1;
const RIVER_DEPTH = 2;
const RIVER_RAIN_MAX_EXPANSION = 2;
const RIVER_RAIN_FILL_RATE = 0.38;
const RIVER_RAIN_DRAIN_RATE = 0.18;
const SNOW_MAX_LAYERS = 4;
const SNOW_LAYER_HEIGHT = 0.2;
const SNOW_ACCUMULATION_RATE = 14;
const SNOW_MELT_RATE = 20;
const WEATHER_ACCUMULATION_RADIUS = 48;
const POLAR_SNOW_UPDATE_SAMPLES = 20;
const POLAR_SNOW_MEMORY_GAIN_RATE = 0.18;
const POLAR_SNOW_MEMORY_MELT_RATE = 0.05;
const POLAR_SNOW_WINTER_GAIN_BONUS = 0.12;
const POLAR_SNOW_SUMMER_MELT_BONUS = 0.08;
const AUTO_RECESS_TEACHER_TIMEOUT_MS = 45 * 1000;
const SCREENSHOT_CAPTURE_COOLDOWN_MS = 15 * 1000;
const SCREENSHOT_PERSONAL_LIMIT = 24;
const SCREENSHOT_SHARED_LIMIT = 48;
const SCREENSHOT_DESKTOP_SIZE = Object.freeze({ width: 1920, height: 1080 });
const SCREENSHOT_COMPACT_SIZE = Object.freeze({ width: 1600, height: 900 });
const SCREENSHOT_THUMB_SIZE = Object.freeze({ width: 480, height: 270 });
const SKY_CYCLE_DURATION_MS = 10 * 60 * 1000;
const SKY_CYCLE_VERSION = 2;
const SKY_RADIUS = 1200;
const SKY_CLOUD_COUNT = 24;
const SKY_RAIN_PARTICLE_COUNT = 960;
const SKY_SNOW_PARTICLE_COUNT = 640;
const SKY_STAR_COUNT = 10000; // Massively increased for the "cielo estrellado" look
const SKY_MILKY_WAY_STAR_COUNT = 2200;
const SKY_AURORA_RIBBON_COUNT = 12;
const SKY_METEOR_POOL_SIZE = 10;
const ECLIPSE_NOTIFICATION_LEAD_MS = 45 * 1000;
const ECLIPSE_SCAN_INTERVAL_MS = 8 * 1000;
const ECLIPSE_SCAN_HORIZON_MS = 8 * 60 * 1000;
const ECLIPSE_SCAN_STEP_MS = 3 * 1000;
const ECLIPSE_SCAN_FINE_STEP_MS = 250;
const ECLIPSE_ENTER_THRESHOLD = 0.1;
const ECLIPSE_ACTIVE_THRESHOLD = 0.16;
const ECLIPSE_TIME_SCALE_MIN = 0.08;
const ECLIPSE_TIME_SCALE_MAX = 1;
const ECLIPSE_TIME_SCALE_LERP = 4.2;
const ECLIPSE_ENV_DARKEN_MAX = 0.84;
const ECLIPSE_HALO_START_THRESHOLD = 0.06;
const PLANET_EYE_HEIGHT = 1.6;
const MOON_WORLD_RADIUS = 18;
const MOON_WORLD_CENTER_X = 210;
const MOON_WORLD_CENTER_Y = 122;
const MOON_WORLD_CENTER_Z = -36;
const SPACE_WORLD_CENTER = Object.freeze({ x: MOON_WORLD_CENTER_X, y: MOON_WORLD_CENTER_Y, z: MOON_WORLD_CENTER_Z });
const MOON_GRAVITY_TIME_SCALE = 0.74;
const MOON_JUMP_BOOST = 2.8;
const MOON_DESCENT_ASSIST = 0.05;
const PLANET_BLEND_START = 22;
const PLANET_BLEND_END = 48;
const INITIAL_SCENE_SKY_COLOR = 0x02030a;
const FLAT_SKY_COLOR = 0x02030a;
const ROOM_SHELL_VERSION = 10;
const OUTDOOR_WORLD_VERSION = 27;
const OUTDOOR_WORLD_STYLE = 'tiny_planet_grass_v20_all_grass_voxel';
const USE_VOXELJS_ENGINE = (() => {
    if (typeof window === 'undefined') return false;
    try {
        const params = new URLSearchParams(window.location.search || '');
        const flag = params.get('voxeljs');
        const enabled = flag === '1';
        if (window.localStorage?.setItem) {
            window.localStorage.setItem('ascraftUseVoxelJs', enabled ? '1' : '0');
        }
        return enabled;
    } catch (_) { }
    return false;
})();
const USE_VOXEL_PLANET_ITEMS_HYBRID = true;
const PLAYER_EYE_HEIGHT = PLANET_EYE_HEIGHT;
const PLAYER_TOP_OFFSET = 0.25;
const PLAYER_RADIUS = 0.35;
const PLAYER_HEIGHT = PLAYER_EYE_HEIGHT + PLAYER_TOP_OFFSET;
const STEP_UP_HEIGHT = 1.1; // Allow auto-stepping over blocks for better navigation on structures
const PLAYER_MODEL_BASE_OFFSET = 0.35;
const PLAYER_THIRD_PERSON_LIFT = 0.95;
const PLAYER_THIRD_PERSON_GROUND_TARGET_DISTANCE = 2;
const ROOM_FLOOR_Y = 0;
const LOBBY_SPAWN_X = 0;
const LOBBY_SPAWN_Z = 4;
const CROSSHAIR_SCREEN_ANCHORS = Object.freeze({
    first: 0.5,
    third: 0.38,
    third_front: 0.66
});
const ROOM_TIME_PRESETS = Object.freeze({
    real: { id: 'real', label: 'Real (1h/día, 365h/año)', dayDurationHoursReal: 1, yearDurationHoursReal: 365 },
    x2: { id: 'x2', label: '2x', dayDurationHoursReal: 0.5, yearDurationHoursReal: 182.5 },
    x6: { id: 'x6', label: '6x', dayDurationHoursReal: 1 / 6, yearDurationHoursReal: 365 / 6 },
    x24: { id: 'x24', label: '24x', dayDurationHoursReal: 1 / 24, yearDurationHoursReal: 365 / 24 },
    custom: { id: 'custom', label: 'Avanzado', dayDurationHoursReal: 1, yearDurationHoursReal: 365 }
});
const DEFAULT_ROOM_TIME_PRESET = 'real';
const DEFAULT_DAY_DURATION_HOURS_REAL = 1;
const DEFAULT_YEAR_DURATION_HOURS_REAL = 365;
const SEASON_ORDER = Object.freeze(['spring', 'summer', 'autumn', 'winter']);

// Textures (Lazy initialized)
let textureLoader = null;
let TEXTURES = { stone: null, dirt: null, wood: null, leaf: null, tile: null, wall: null, water: null, lava: null, whiteboard: null };
let snowflakeParticleTexture = null;

let scene, camera, renderer, cssRenderer, clock, THREE, CSS3DObject;
let voxelJsRuntime = null;
let outdoorWorldRuntimeCache = null;
let outdoorWorldRuntimeCacheKey = '';
let outdoorWorldBuildPromise = null;
let outdoorWorldBuildState = null;
let outdoorWorldChunkQueue = [];
let outdoorWorldReadyLevel = 'none';
let outdoorWorldBuildFramePending = false;
let outdoorWorldSurfaceQueued = false;
let lastEarthSurfaceFaceHint = null;
let cssRendererInitPromise = null;
let gameContainer = null;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let canJump = false;
let velocity = null;
let direction = null;
const lookInputState = {
    pointerId: null,
    lastX: 0,
    lastY: 0,
    deltaX: 0,
    deltaY: 0
};

// Consolidated Input State
const inputState = {
    forward: 0,
    backward: 0,
    left: 0,
    right: 0,
    jump: false,
    sprint: false,
    lookX: 0,
    lookY: 0
};
let firstPersonControls = null;
let raycaster = null;
let crosshairHighlightMesh = null;
let crosshairHighlightCenter = null;
let crosshairHighlightSize = null;
let crosshairHighlightNormal = null;
let crosshairHighlightSample = null;
let crosshairHighlightLastUpdateAt = 0;
let cssScene;
let activeVideos = new Map(); // docId -> CSS3DObject
let roomDoor = null;
let primaryActionDownAt = 0;
let destructionCommitted = false;
let destructionEffects = [];
let pendingDestructionIds = new Set();
let doorToggleCandidate = null;
let primaryActionFromCanvas = false;
let outdoorTerrainBuildPromise = null;
let skyCycleInitPromise = null;
let skySystem = null;
let ambientLight = null;
let hemisphereLight = null;
let sunLight = null;
let moonLight = null;
let starLight = null;
let classroomLights = [];
let terrainRegenerationInProgress = false;
let outdoorTerrainGroup = null;
let outdoorSnowCoverGroup = null;
let outdoorRiverSurfaceGroup = null;
let roomShellGroup = null;
let moonTerrainGroup = null;
let outdoorFlowerBuildTask = null;
let roomDataSnapshot = null;
let staticCollisionItems = new Map();
let collisionBroadphase = null;
let skyLightingRuntime = null;
let voxelWorldGeometry = null;
let voxelMaterialCache = new Map();
let outdoorWorldVoxelKeys = new Set();
let waterWorldVoxelKeys = new Set();
let outdoorTopSolidVoxelYByCell = new Map();
let roomShellVoxelKeys = new Set();
let moonWorldVoxelKeys = new Set();
let solidWorldVoxelKeys = new Set();
let localWorldBuildPromise = null;
let roomShellBuildPromise = null;
let skySystemBuildPromise = null;
let travelPropsBuildPromise = null;
let scenePresetRebuildPromise = null;
let progressiveSceneSkyQueued = false;
let progressiveOutdoorRestoreTimeoutId = null;
let playerWorldPosition = null;
let localPlayerMesh = null;
let earthRocketShuttle = null;
let moonRocketShuttle = null;
let earthLaunchPad = null;
let lastEarthWorldShift = null;
let lastEarthWorldVisibilityMode = null;
let activeCelestialBody = 'earth';
let currentSpaceBodyId = 'moon';
let playerViewMode = 'first';
const PLAYER_VIEW_MODES = ['first', 'third', 'third_front'];
let audioContext = null;
let diggingLoopOsc = null;
let diggingLoopNoise = null;
let diggingLoopGain = null;
let destructionShardGeometry = null;
let destructionSmokeGeometry = null;
let destructionShardMaterials = null;
let destructionSmokeMaterial = null;
let lastFootstepAtMs = 0;
let footstepToggle = false;
let outdoorTerrainRemovedTopCells = new Set();
let outdoorTerrainRemovedVoxelKeys = new Set();
let outdoorTerrainRegenerationQueued = false;
let outdoorWeatherRegenerationQueued = false;
let rainSystem = null;
let snowSystem = null;
let recessModeActive = false;
let autoRecessNoTeacher = false;
let teacherPresent = true;
let lastRecessEpochSeen = null;
let outdoorTreeAnchors = [];
let outdoorBlossomAnchors = [];
let outdoorGeneratedTreeAnchorKeys = new Set();
let outdoorGeneratedBlossomAnchorKeys = new Set();
let cherryPetalSystem = null;
let outdoorLampLights = [];
let outdoorRiverFish = [];
let outdoorSeasonalTrees = [];
let oceanVehicleMeshes = [];
const oceanVehicleRuntimeState = {
    activeVehicleId: null,
    steeringByVehicleId: new Map()
};
let outdoorSnowCoverByCell = new Map();
let outdoorPolarSnowBaseByCell = new Map();
let outdoorPolarSnowMemoryByCell = new Map();
let outdoorTerrainHeightCache = new Map(); // Root optimization: Cache for expensive noise-based height samples
let outdoorRiverExpansionLevel = 0;
let outdoorSnowAccumulationBudget = 0;
let outdoorSnowMeltBudget = 0;
let outdoorSakuraCoverByCell = new Map();
let outdoorAutumnLeafCoverByCell = new Map();
let outdoorSakuraAccumulationBudget = 0;
let outdoorAutumnLeafAccumulationBudget = 0;
let roomTimeSettings = null;
let currentRoomTimeState = null;
let selectedWhiteboardDocId = null;
let seatedState = {
    active: false,
    targetId: null,
    position: null
};
let playerYaw = 0;
let playerPitch = 0;
let lookTargetYaw = 0;
let lookTargetPitch = 0;
let localPlayerWalkPhase = 0;
let localPlayerWalkBlend = 0;
let movementController = null;
let shouldDiscardNextMovementDelta = false;
let movementVisibilityBound = false;
let lastAnimationTimeMs = 0;
let rocketTravelCountdownTimer = null;
let rocketTravelWarpTimer = null;
let rocketTravelTargetId = null;
let performanceModeOverride = 'auto';
let currentPerformanceTier = 'balanced';
let performanceAutoTier = 'balanced';
let performanceLoafObserver = null;
let lastDebugPublishAtMs = 0;
let lastShadowPos = null;
let lastLightingMoodAtMs = 0;
let lastShadowUpdateAtMs = 0;
let lastSunDirSnapshot = null;
let networkLastSyncAtMs = 0;
let networkLastHeartbeatAtMs = 0;
let networkLastSyncedPosition = null;
let networkLastSyncedYaw = 0;
let networkLastSyncedMoving = false;
let networkLastSyncedMicEnabled = false;
let networkLastSyncedPeerId = '';
let networkLastSyncedBodyId = 'earth';
let lastSkyAnimationTickAtMs = 0;
let lastParticleAnimationTickAtMs = 0;
let lastWeatherParticleTickAtMs = 0;
let lastHighlightTickAtMs = 0;
let lastSkyUpdateAtRealMs = 0;
let lastSceneStreamAttemptAtMs = 0;
let skyAnimationEpochBaseMs = 0;
let skyAnimationPerfBaseMs = 0;
let skyAnimationTimeSource = 'Date.now';
let skySimulationNowMs = 0;
let skySimulationLastRealNowMs = 0;
let skySimulationTimeScale = 1;
let skySimulationTargetScale = 1;
let skyShadowRefreshPending = true;
let eclipseHudState = {
    bannerEl: null,
    titleEl: null,
    countdownEl: null
};
const eclipseRuntimeState = {
    nextEvent: null,
    activeEvent: null,
    lastPredictionAtRealMs: 0
};
let posterTextureCache = new Map();
let whiteboardRenderCache = new Map();
let whiteboardThumbnailPromiseCache = new Map();
let whiteboardUpdateTimerIds = new Map();
let whiteboardPendingPayloads = new Map();
let latestSkyDebugState = null;
let renderGameToTextAstroAugmented = false;
const performanceDebugState = {
    modeOverride: 'auto',
    currentTier: 'balanced',
    autoTier: 'balanced',
    fps: 0,
    fpsAverage: 0,
    frameMs: 0,
    frameP50: 0,
    frameP95: 0,
    aboveBudgetForMs: 0,
    belowBudgetForMs: 0,
    shadowRefreshCount: 0,
    lastShadowUpdateAt: 0,
    lightAngularDelta: 0,
    lightPositionDelta: 0,
    skyTimeSource: 'Date.now',
    skyTimeScale: 1,
    skyTargetTimeScale: 1,
    longAnimationFrames: [],
    renderInfo: {
        calls: 0,
        triangles: 0,
        points: 0,
        lines: 0
    },
    thumbnailPrecache: {
        requested: false,
        active: false,
        completed: 0,
        total: 0
    },
    viewport: {
        cssWidth: 0,
        cssHeight: 0,
        renderWidth: 0,
        renderHeight: 0,
        pixelRatioCap: 1
    },
    outdoorBuild: {
        queue: 0,
        chunksProcessed: 0,
        frameMs: 0,
        lastChunkMs: 0,
        frameBudgetMs: 0,
        maxChunksPerFrame: 0,
        sliceWidth: 0,
        phase: 'idle',
        chunkQueueByFace: {}
    },
    heroSceneBudget: {
        tier: 'balanced',
        targetFps: 55,
        maxDrawCalls: 1280,
        highDetailRadius: 56,
        heroPropLimit: 38,
        drawCallsOverBudget: false
    },
    weatherMeshUpdates: 0,
    weatherFullWorldRebuilds: 0,
    cloudUpdateMs: 0,
    photoCaptureMs: 0
};
const screenshotState = {
    records: [],
    loading: false,
    initialized: false,
    activeTab: 'shared',
    modalOpen: false,
    activeRecordId: '',
    captureOpen: false,
    captureBusy: false,
    lastCaptureAt: 0,
    compileReady: false
};
const weatherRuntimeState = {
    snowVisualDirty: true,
    riverVisualDirty: true,
    snowVisualBuildQueued: false,
    riverVisualBuildQueued: false,
    snowStormActive: false,
    lastSnowBurstAtMs: 0,
    lastVisualStreamCenterX: NaN,
    lastVisualStreamCenterZ: NaN,
    lastVisualStreamAtMs: 0,
    lastRiverVisualStreamCenterX: NaN,
    lastRiverVisualStreamCenterZ: NaN,
    lastRiverVisualStreamAtMs: 0
};
const cloudScratchState = {
    planetCenter: null,
    position: null,
    normal: null,
    tangent: null,
    bitangent: null,
    fallbackUp: null,
    basis: null
};
const weatherScratchState = {
    planetCenter: null,
    cameraPlanetUp: null,
    localTangentX: null,
    localTangentZ: null,
    worldPos: null,
    fallDirection: null,
    respawnLocal: null
};
const performanceState = {
    frameSamplesMs: [],
    aboveBudgetForMs: 0,
    belowBudgetForMs: 0,
    lastAutoTierChangeAtMs: 0,
    lastRenderFrameAtMs: 0
};

const DOOR_OPEN_ANGLE = Math.PI / 2;
const DOOR_INTERACT_TAP_THRESHOLD = 12;
const DOOR_INTERACT_MOVE_THRESHOLD = DOOR_INTERACT_TAP_THRESHOLD;
const MOVEMENT_DELTA_MIN = 1 / 240;
const MOVEMENT_DELTA_MAX = 0.05;
const SKY_UPDATE_MIN_INTERVAL_MS = 0;
const HIGHLIGHT_MIN_INTERVAL_WHILE_MOVING_MS = 90;
const SCENE_STREAM_COOLDOWN_MS = 1200;
const WEATHER_VISUAL_RENDER_RADIUS = 72;
const WEATHER_VISUAL_STREAM_STEP = 18;
const WEATHER_VISUAL_STREAM_COOLDOWN_MS = 220;
const WEATHER_VISUAL_RIVER_STREAM_STEP = 34;
const WEATHER_VISUAL_RIVER_STREAM_COOLDOWN_MS = 680;
const WEATHER_VISUAL_STREAM_STEP_SNOW_ACTIVE = 10;
const WEATHER_VISUAL_STREAM_COOLDOWN_MS_SNOW_ACTIVE = 120;
const SNOW_BURST_RADIUS = 24;
const SNOW_BURST_BASE_SAMPLES = 180;
const SNOW_FRAME_APPLY_LIMIT_LOW = 16;
const SNOW_FRAME_APPLY_LIMIT_BALANCED = 24;
const SNOW_FRAME_APPLY_LIMIT_HIGH = 32;
const DESTRUCTION_HOLD_MS = 1100;
const DIG_DUST_INTERVAL_MS = 275;
const CROSSHAIR_HIGHLIGHT_INTERVAL_MS = 50;
const ROCKET_LAUNCH_COUNTDOWN_MS = 3000;
const ROCKET_LAUNCH_WARP_MS = 1600;
const SOLAR_SYSTEM_PLANET_ORBIT_SCALE = 3.4;
const SOLAR_SYSTEM_MOON_ORBIT_SCALE = 2.2;
const PERFORMANCE_TIER_CONFIG = Object.freeze({
    low: {
        frameBudgetMs: 33,
        maxRenderMegapixels: 0.9,
        shadowMapSize: 0,
        skyHz: 10,
        particleHz: 12,
        highlightHz: 10,
        showClouds: false,
        showSolarVisuals: true,
        showConstellations: true
    },
    balanced: {
        frameBudgetMs: 25,
        maxRenderMegapixels: 1.4,
        shadowMapSize: 512,
        skyHz: 18,
        particleHz: 20,
        highlightHz: 20,
        showClouds: true,
        showSolarVisuals: true,
        showConstellations: true
    },
    high: {
        frameBudgetMs: 16.7,
        maxRenderMegapixels: 2.0,
        shadowMapSize: 1024,
        skyHz: 24,
        particleHz: 30,
        highlightHz: Math.round(1000 / CROSSHAIR_HIGHLIGHT_INTERVAL_MS),
        showClouds: true,
        showSolarVisuals: true,
        showConstellations: true
    }
});
const PERFORMANCE_FRAME_SAMPLE_SIZE = 180;
const PERFORMANCE_AUTO_DEGRADE_MS = 2000;
const PERFORMANCE_AUTO_RECOVER_MS = 10000;
const PERFORMANCE_FRAME_SPIKE_MS = 150;
const NETWORK_SYNC_ACTIVE_INTERVAL_MS = 120;
const NETWORK_SYNC_IDLE_INTERVAL_MS = 750;
const NETWORK_SYNC_POSITION_EPSILON = 0.12;
const NETWORK_SYNC_ROTATION_EPSILON = 0.04;
const NETWORK_SYNC_HEARTBEAT_MS = 3000;
const WHITEBOARD_UPDATE_DEBOUNCE_MS = 120;
const WHITEBOARD_CANVAS_WIDTH = 1024;
const WHITEBOARD_CANVAS_HEIGHT = 512;
const SUN_VISUAL_RADIUS = 1.3;
const SUN_ANGULAR_RADIUS_RAD = 0.266 * (Math.PI / 180);
const MOON_ANGULAR_RADIUS_RAD = 0.259 * (Math.PI / 180);
const EARTH_FROM_MOON_ANGULAR_RADIUS_RAD = 0.95 * (Math.PI / 180);
const EARTH_MOON_ORBIT_RADIUS_AU = 0.00257;
const MOON_FROM_EARTH_SKY_DISTANCE = SKY_RADIUS * 0.28;
const EARTH_FROM_MOON_SKY_DISTANCE = SKY_RADIUS * 0.44;

function cycleDurationToAngularSpeed(durationMs = SKY_CYCLE_DURATION_MS) {
    return (Math.PI * 2) / Math.max(1000, Number(durationMs || SKY_CYCLE_DURATION_MS));
}

const SOLAR_SYSTEM_VISUAL_PLANETS = [
    { id: 'mercury', name: 'Mercurio', semiMajorAxisAU: 0.39, diameterRatioEarth: 0.383, color: 0xb7a99a, orbitSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 1.5), orbitTilt: 0.12, axialTilt: 0.03, rotationSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 0.7), orbitPhase: 0.18, moons: [] },
    { id: 'venus', name: 'Venus', semiMajorAxisAU: 0.72, diameterRatioEarth: 0.949, color: 0xd6b77a, orbitSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 2.4), orbitTilt: 0.08, axialTilt: 0.06, rotationSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 1.4), orbitPhase: 0.92, moons: [] },
    {
        id: 'earth', name: 'Tierra', semiMajorAxisAU: 1.0, diameterRatioEarth: 1, color: 0x72b96a, orbitSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 6), orbitTilt: 0.06, axialTilt: 0.41, rotationSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 0.6), orbitPhase: 1.42, moons: [
            { id: 'moon', name: 'Luna', diameterRatioEarth: 0.273, color: 0xe3ecfa, orbitRadiusKm: 384400, orbitRadiusAU: EARTH_MOON_ORBIT_RADIUS_AU, orbitSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 0.24), orbitTilt: 0.12, axialTilt: 0.1, lockedToParent: true, faceOffset: 0, orbitPhase: 0.64 }
        ]
    },
    {
        id: 'mars', name: 'Marte', semiMajorAxisAU: 1.52, diameterRatioEarth: 0.532, color: 0xc96b4a, orbitSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 9), orbitTilt: 0.09, axialTilt: 0.34, rotationSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 1.06), orbitPhase: 2.06, moons: [
            { id: 'phobos', name: 'Fobos', diameterRatioEarth: 0.02, color: 0xb0a48f, orbitRadiusKm: 9376, orbitRadiusAU: 0.0000627, orbitSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 0.48), orbitTilt: 0.2, axialTilt: 0.08, lockedToParent: true, faceOffset: 0, orbitPhase: 0.2 },
            { id: 'deimos', name: 'Deimos', diameterRatioEarth: 0.012, color: 0x9f9684, orbitRadiusKm: 23463, orbitRadiusAU: 0.0001568, orbitSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 0.62), orbitTilt: 0.15, axialTilt: 0.07, lockedToParent: true, faceOffset: 0, orbitPhase: 1.52 }
        ]
    },
    {
        id: 'jupiter', name: 'Júpiter', semiMajorAxisAU: 5.2, diameterRatioEarth: 11.21, color: 0xcfab85, orbitSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 15), orbitTilt: 0.05, axialTilt: 0.12, rotationSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 0.42), orbitPhase: 2.72, moons: [
            { id: 'io', name: 'Ío', diameterRatioEarth: 0.286, color: 0xd9c379, orbitRadiusKm: 421700, orbitRadiusAU: 0.00282, orbitSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 0.68), orbitTilt: 0.12, axialTilt: 0.1, lockedToParent: true, faceOffset: 0, orbitPhase: 0.36 },
            { id: 'europa', name: 'Europa', diameterRatioEarth: 0.245, color: 0xd7d9df, orbitRadiusKm: 671100, orbitRadiusAU: 0.00449, orbitSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 0.94), orbitTilt: 0.1, axialTilt: 0.08, lockedToParent: true, faceOffset: 0, orbitPhase: 1.08 },
            { id: 'ganymede', name: 'Ganímedes', diameterRatioEarth: 0.413, color: 0xbca892, orbitRadiusKm: 1070400, orbitRadiusAU: 0.00716, orbitSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 1.16), orbitTilt: 0.08, axialTilt: 0.09, lockedToParent: true, faceOffset: 0, orbitPhase: 1.92 },
            { id: 'callisto', name: 'Calisto', diameterRatioEarth: 0.378, color: 0x9c856e, orbitRadiusKm: 1882700, orbitRadiusAU: 0.01258, orbitSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 1.38), orbitTilt: 0.06, axialTilt: 0.06, lockedToParent: true, faceOffset: 0, orbitPhase: 2.74 }
        ]
    },
    {
        id: 'saturn', name: 'Saturno', semiMajorAxisAU: 9.58, diameterRatioEarth: 9.45, color: 0xd7c38e, orbitSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 21), orbitTilt: 0.07, axialTilt: 0.47, rotationSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 0.46), orbitPhase: 3.45, moons: [
            { id: 'titan', name: 'Titán', diameterRatioEarth: 0.404, color: 0xd3bb8d, orbitRadiusKm: 1221870, orbitRadiusAU: 0.00817, orbitSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 1.62), orbitTilt: 0.12, axialTilt: 0.12, lockedToParent: true, faceOffset: 0, orbitPhase: 0.74 },
            { id: 'rhea', name: 'Rea', diameterRatioEarth: 0.119, color: 0xcdc4b5, orbitRadiusKm: 527108, orbitRadiusAU: 0.00352, orbitSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 1.24), orbitTilt: 0.1, axialTilt: 0.08, lockedToParent: true, faceOffset: 0, orbitPhase: 1.96 }
        ]
    },
    {
        id: 'uranus', name: 'Urano', semiMajorAxisAU: 19.2, diameterRatioEarth: 4.01, color: 0x98d4d5, orbitSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 28), orbitTilt: 0.1, axialTilt: 1.34, rotationSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 0.72), orbitPhase: 4.02, moons: [
            { id: 'titania', name: 'Titania', diameterRatioEarth: 0.124, color: 0xc6d8db, orbitRadiusKm: 436300, orbitRadiusAU: 0.00292, orbitSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 1.84), orbitTilt: 0.09, axialTilt: 0.09, lockedToParent: true, faceOffset: 0, orbitPhase: 0.52 },
            { id: 'oberon', name: 'Oberón', diameterRatioEarth: 0.119, color: 0xb8c8ca, orbitRadiusKm: 583500, orbitRadiusAU: 0.0039, orbitSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 2.16), orbitTilt: 0.11, axialTilt: 0.1, lockedToParent: true, faceOffset: 0, orbitPhase: 1.72 }
        ]
    },
    {
        id: 'neptune', name: 'Neptuno', semiMajorAxisAU: 30.05, diameterRatioEarth: 3.88, color: 0x4e8ef8, orbitSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 36), orbitTilt: 0.11, axialTilt: 0.52, rotationSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 0.78), orbitPhase: 4.68, moons: [
            { id: 'triton', name: 'Tritón', diameterRatioEarth: 0.212, color: 0xdce4f2, orbitRadiusKm: 354759, orbitRadiusAU: 0.00237, orbitSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 2.4), orbitTilt: 0.14, axialTilt: 0.12, lockedToParent: true, faceOffset: 0, orbitPhase: 0.82 }
        ]
    },
    {
        id: 'pluto', name: 'Plutón', semiMajorAxisAU: 39.48, diameterRatioEarth: 0.18, color: 0xddcaae, orbitSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 45), orbitTilt: 0.3, axialTilt: 2.14, rotationSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 1.2), orbitPhase: 5.2, moons: [
            { id: 'charon', name: 'Caronte', diameterRatioEarth: 0.095, color: 0xbcab94, orbitRadiusKm: 19591, orbitRadiusAU: 0.00013, orbitSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 1.2), orbitTilt: 0.15, axialTilt: 0.1, lockedToParent: true, faceOffset: 0, orbitPhase: 0.0 }
        ]
    }
];

const SOLAR_TRAVEL_BODIES = Object.freeze({
    moon: { id: 'moon', name: 'Luna', surfaceRadius: 18, gravityTimeScale: 0.88, jumpBoost: 2.35, descentAssist: 0.075, surfaceItem: 'sand_block', subSurfaceItem: 'stone_cobble', craterSeed: 977, tint: 0xcfd6de },
    mercury: { id: 'mercury', name: 'Mercurio', surfaceRadius: 14, gravityTimeScale: 0.7, jumpBoost: 1.6, descentAssist: 0.07, surfaceItem: 'stone_cobble', subSurfaceItem: 'stone_cobble', craterSeed: 913, tint: 0xaea39a },
    venus: { id: 'venus', name: 'Venus', surfaceRadius: 20, gravityTimeScale: 0.82, jumpBoost: 1.05, descentAssist: 0.12, surfaceItem: 'sand_block', subSurfaceItem: 'dirt_block', craterSeed: 921, tint: 0xcaa56d },
    mars: { id: 'mars', name: 'Marte', surfaceRadius: 16, gravityTimeScale: 0.72, jumpBoost: 1.7, descentAssist: 0.08, surfaceItem: 'dirt_block', subSurfaceItem: 'stone_cobble', craterSeed: 931, tint: 0xbd6644 },
    jupiter: { id: 'jupiter', name: 'Júpiter', surfaceRadius: 34, gravityTimeScale: 0.92, jumpBoost: 0.85, descentAssist: 0.16, surfaceItem: 'sand_block', subSurfaceItem: 'stone_cobble', craterSeed: 941, tint: 0xcfa87e },
    saturn: { id: 'saturn', name: 'Saturno', surfaceRadius: 30, gravityTimeScale: 0.88, jumpBoost: 0.95, descentAssist: 0.14, surfaceItem: 'sand_block', subSurfaceItem: 'stone_cobble', craterSeed: 951, tint: 0xd3c08a },
    uranus: { id: 'uranus', name: 'Urano', surfaceRadius: 24, gravityTimeScale: 0.8, jumpBoost: 1.2, descentAssist: 0.1, surfaceItem: 'glass_block', subSurfaceItem: 'stone_cobble', craterSeed: 961, tint: 0x8fcdd1 },
    neptune: { id: 'neptune', name: 'Neptuno', surfaceRadius: 24, gravityTimeScale: 0.82, jumpBoost: 1.15, descentAssist: 0.11, surfaceItem: 'water_block', subSurfaceItem: 'stone_cobble', craterSeed: 971, tint: 0x4d88e8 }
});

const HELIOCENTRIC_COMETS = Object.freeze([
    {
        id: 'halley',
        name: '1P/Halley',
        semiMajorAxisAU: 17.8,
        eccentricity: 0.967,
        inclination: 0.45,
        ascendingNode: 0.92,
        orbitSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 48),
        orbitPhase: 0.36,
        color: 0xd8efff,
        tailColor: 0x8cbcff
    },
    {
        id: 'encke',
        name: '2P/Encke',
        semiMajorAxisAU: 2.22,
        eccentricity: 0.85,
        inclination: 0.21,
        ascendingNode: 2.46,
        orbitSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 18),
        orbitPhase: 1.12,
        color: 0xffedd4,
        tailColor: 0xffb066
    },
    {
        id: 'cg67p',
        name: '67P/Churyumov-Gerasimenko',
        semiMajorAxisAU: 3.46,
        eccentricity: 0.64,
        inclination: 0.12,
        ascendingNode: 4.08,
        orbitSpeed: cycleDurationToAngularSpeed(SKY_CYCLE_DURATION_MS * 24),
        orbitPhase: 2.34,
        color: 0xd7fff3,
        tailColor: 0x7af8d1
    }
]);

const CARDINAL_TERRACES = Object.freeze([
    { id: 'north_classroom', x: 0, z: 0, radius: 40, blend: 12, flattenStrength: 1.0, lift: -11.0 },
    { id: 'front_pole', x: 0, z: 46, radius: 32, blend: 14, flattenStrength: 1.0, lift: -15.0 },
    { id: 'back_pole', x: 0, z: -46, radius: 32, blend: 14, flattenStrength: 1.0, lift: -4.5 },
    { id: 'east_pole', x: 46, z: 0, radius: 32, blend: 12, flattenStrength: 1.0, lift: -4.0 },
    { id: 'west_pole', x: -46, z: 0, radius: 32, blend: 12, flattenStrength: 1.0, lift: -4.0 },
    { id: 'south_pole_ref', x: 0, z: -24, radius: 24, blend: 12, flattenStrength: 1.0, lift: -3.5 }
]);

const OUTDOOR_FLAT_ZONES = Object.freeze([
    { id: 'build_north_east', x: 52, z: -34, radius: 16, blend: 8, flattenStrength: 1.0, lift: -3.5 },
    { id: 'build_north_west', x: -52, z: -34, radius: 16, blend: 8, flattenStrength: 1.0, lift: -3.5 },
    { id: 'build_south_east', x: 52, z: 34, radius: 16, blend: 8, flattenStrength: 1.0, lift: -3.5 },
    { id: 'build_south_west', x: -52, z: 34, radius: 16, blend: 8, flattenStrength: 1.0, lift: -3.5 },
    { id: 'build_east_mid', x: 68, z: 0, radius: 14, blend: 8, flattenStrength: 1.0, lift: -3.2 },
    { id: 'build_west_mid', x: -68, z: 0, radius: 14, blend: 8, flattenStrength: 1.0, lift: -3.2 },
    { id: 'build_north_mid', x: 0, z: -72, radius: 15, blend: 8, flattenStrength: 1.0, lift: -3.4 },
    { id: 'build_south_mid', x: 0, z: 78, radius: 15, blend: 8, flattenStrength: 1.0, lift: -3.4 }
]);

const BASE_OUTDOOR_FIXED_TREE_LAYOUT = Object.freeze([
    { x: -38, z: -38, scale: 1.1 }, { x: 38, z: -38, scale: 1.1 },
    { x: -38, z: 38, scale: 1.1 }, { x: 38, z: 38, scale: 1.1 },
    { x: -24, z: -24, scale: 1.0 }, { x: 24, z: -24, scale: 1.0 },
    { x: -24, z: 24, scale: 1.0 }, { x: 24, z: 24, scale: 1.0 },
    { x: 0, z: 32, scale: 1.2 }, { x: 0, z: -32, scale: 1.2 },
    { x: 32, z: 0, scale: 1.2 }, { x: -32, z: 0, scale: 1.2 }
]);

const HERO_OUTDOOR_FIXED_TREE_LAYOUT = Object.freeze([
    { x: -42, z: -34, scale: 1.28 }, { x: 42, z: -34, scale: 1.28 },
    { x: -46, z: 18, scale: 1.42 }, { x: 46, z: 18, scale: 1.42 },
    { x: -26, z: 42, scale: 1.18 }, { x: 26, z: 42, scale: 1.18 },
    { x: -18, z: -8, scale: 1.12 }, { x: 18, z: -8, scale: 1.12 }
]);

const HERO_GARDEN_PLANTER_LAYOUT = Object.freeze([
    { x: -52, z: 56, yaw: 0 }, { x: -24, z: 56, yaw: 0 }, { x: 24, z: 56, yaw: 0 }, { x: 52, z: 56, yaw: 0 },
    { x: -58, z: 22, yaw: Math.PI / 2 }, { x: 58, z: 22, yaw: -Math.PI / 2 },
    { x: -58, z: -10, yaw: Math.PI / 2 }, { x: 58, z: -10, yaw: -Math.PI / 2 }
]);

const HERO_GARDEN_BENCH_LAYOUT = Object.freeze([
    { x: -64, z: 48, yaw: Math.PI * 0.14 },
    { x: 64, z: 48, yaw: -Math.PI * 0.14 },
    { x: -64, z: -8, yaw: Math.PI * 0.22 },
    { x: 64, z: -8, yaw: -Math.PI * 0.22 }
]);

const SCENE_PRESET_CATALOG = Object.freeze({
    default_classroom_planet_v1: Object.freeze({
        id: 'default_classroom_planet_v1',
        heroMoonScale: 1,
        heroMoonDistanceScale: 1,
        heroMoonAnchor: Object.freeze({ x: 0, y: 0, z: 0 }),
        heroRocketAnchor: Object.freeze({ x: EARTH_LAUNCH_PAD_X, z: EARTH_LAUNCH_PAD_Z }),
        heroGardenDensity: 'balanced',
        heroLightingProfile: 'default',
        treeLayout: BASE_OUTDOOR_FIXED_TREE_LAYOUT,
        roomDeskCols: 4,
        roomDeskRows: 4
    }),
    hero_classroom_planet_v1: Object.freeze({
        id: 'hero_classroom_planet_v1',
        heroMoonScale: 1.32,
        heroMoonDistanceScale: 0.88,
        heroMoonAnchor: Object.freeze({ x: 0.26, y: 0.24, z: 0 }),
        heroRocketAnchor: Object.freeze({ x: 54, z: -30 }),
        heroGardenDensity: 'high',
        heroLightingProfile: 'cinematic_voxel',
        treeLayout: HERO_OUTDOOR_FIXED_TREE_LAYOUT,
        roomDeskCols: 5,
        roomDeskRows: 4
    })
});

const HERO_PROP_CATALOG = Object.freeze({
    CherryTreeHero: Object.freeze({
        low: { scaleMul: 0.92, max: 6 },
        balanced: { scaleMul: 1.0, max: 8 },
        high: { scaleMul: 1.08, max: 10 }
    }),
    PlanterBed: Object.freeze({
        low: { max: 4 },
        balanced: { max: 6 },
        high: { max: 8 }
    }),
    BenchVoxel: Object.freeze({
        low: { max: 2 },
        balanced: { max: 4 },
        high: { max: 6 }
    }),
    LampPostHero: Object.freeze({
        low: { haloScale: 0.86 },
        balanced: { haloScale: 1.0 },
        high: { haloScale: 1.14 }
    }),
    ClassroomKit: Object.freeze({
        low: { deskCols: 4, deskRows: 3 },
        balanced: { deskCols: 5, deskRows: 4 },
        high: { deskCols: 5, deskRows: 4 }
    }),
    RocketPadHero: Object.freeze({
        low: { towerHeightMul: 0.8 },
        balanced: { towerHeightMul: 1.0 },
        high: { towerHeightMul: 1.08 }
    }),
    MoonHero: Object.freeze({
        low: { scaleMul: 1.18 },
        balanced: { scaleMul: 1.32 },
        high: { scaleMul: 1.4 }
    })
});

const HERO_SCENE_PERFORMANCE_BUDGETS = Object.freeze({
    low: Object.freeze({
        targetFps: 45,
        maxDrawCalls: 980,
        highDetailRadius: 44,
        heroPropLimit: 26
    }),
    balanced: Object.freeze({
        targetFps: 55,
        maxDrawCalls: 1280,
        highDetailRadius: 56,
        heroPropLimit: 38
    }),
    high: Object.freeze({
        targetFps: 60,
        maxDrawCalls: 1660,
        highDetailRadius: 70,
        heroPropLimit: 52
    })
});

function readScenePresetId() {
    try {
        const params = new URLSearchParams(window.location.search || '');
        const fromUrl = String(params.get('scenePreset') || '').trim();
        if (SCENE_PRESET_CATALOG[fromUrl]) return fromUrl;
    } catch (_) { }
    try {
        const fromStorage = String(localStorage.getItem('ascraftScenePreset') || '').trim();
        if (SCENE_PRESET_CATALOG[fromStorage]) return fromStorage;
    } catch (_) { }
    return 'hero_classroom_planet_v1';
}

let activeScenePresetId = readScenePresetId();

function getActiveScenePresetConfig() {
    return SCENE_PRESET_CATALOG[activeScenePresetId] || SCENE_PRESET_CATALOG.default_classroom_planet_v1;
}

function getHeroScenePerformanceBudget(tier = currentPerformanceTier) {
    return HERO_SCENE_PERFORMANCE_BUDGETS[tier] || HERO_SCENE_PERFORMANCE_BUDGETS.balanced;
}

function getHeroPropTierConfig(propId, tier = currentPerformanceTier) {
    const catalog = HERO_PROP_CATALOG?.[propId];
    if (!catalog) return {};
    return catalog[tier] || catalog.balanced || {};
}

function setScenePreset(nextPresetId = 'hero_classroom_planet_v1') {
    const safeId = SCENE_PRESET_CATALOG[nextPresetId]
        ? nextPresetId
        : 'default_classroom_planet_v1';
    const changed = activeScenePresetId !== safeId;
    activeScenePresetId = safeId;
    try {
        localStorage.setItem('ascraftScenePreset', safeId);
    } catch (_) { }
    return changed;
}

async function queueScenePresetRebuild(options = {}) {
    const force = options.force === true;
    if (!currentRoomId || !scene) return null;
    if (scenePresetRebuildPromise && !force) return scenePresetRebuildPromise;
    scenePresetRebuildPromise = (async () => {
        invalidateOutdoorWorldRuntimeCache('scene_preset_switch');
        cancelOutdoorFlowerBuildTask();
        if (roomShellGroup) {
            await generateRoomShell().catch(() => { });
        }
        await ensureTravelSceneProps().catch(() => { });
        if (activeCelestialBody !== 'space') {
            await generateOutdoorWorld({
                radius: OUTDOOR_WORLD_RADIUS,
                includePlanetShell: true,
                includeSurfaceColumns: false,
                deferSurfaceColumns: true,
                priorityFace: getCurrentEarthFaceForStreaming()
            }).catch(() => { });
        }
        weatherRuntimeState.riverVisualDirty = true;
        weatherRuntimeState.snowVisualDirty = true;
        refreshOutdoorWeatherVisuals(true);
        rebuildCherryPetalSystem();
        return getActiveScenePresetConfig();
    })().finally(() => {
        scenePresetRebuildPromise = null;
    });
    return scenePresetRebuildPromise;
}

function getOutdoorTreeLayout() {
    return getActiveScenePresetConfig().treeLayout || BASE_OUTDOOR_FIXED_TREE_LAYOUT;
}

function getEarthLaunchPadAnchor() {
    const cfg = getActiveScenePresetConfig();
    return cfg.heroRocketAnchor || { x: EARTH_LAUNCH_PAD_X, z: EARTH_LAUNCH_PAD_Z };
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function readStoredPerformanceMode() {
    try {
        const stored = String(localStorage.getItem('ascraftPerformanceMode') || 'auto').trim().toLowerCase();
        return stored === 'low' || stored === 'balanced' || stored === 'high' || stored === 'auto'
            ? stored
            : 'auto';
    } catch (_) {
        return 'auto';
    }
}

function getPerformanceTierConfig(tier = currentPerformanceTier) {
    return PERFORMANCE_TIER_CONFIG[tier] || PERFORMANCE_TIER_CONFIG.balanced;
}

function pushBoundedSample(target, value, maxSize = PERFORMANCE_FRAME_SAMPLE_SIZE) {
    if (!Number.isFinite(value) || value <= 0) return;
    target.push(value);
    if (target.length > maxSize) {
        target.splice(0, target.length - maxSize);
    }
}

function getSamplePercentile(samples, percentile = 0.5) {
    if (!Array.isArray(samples) || !samples.length) return 0;
    const sorted = [...samples].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * percentile)));
    return sorted[index];
}

function getAverageSample(samples) {
    if (!Array.isArray(samples) || !samples.length) return 0;
    return samples.reduce((sum, value) => sum + value, 0) / samples.length;
}

function getSubsystemIntervalMs(hz) {
    const safeHz = Math.max(1, Number(hz || 1));
    return 1000 / safeHz;
}

// The main sky pass runs every render frame; keep `skyHz` only for secondary sky workloads.
function getSkyUpdateIntervalMs() {
    return getSubsystemIntervalMs(getPerformanceTierConfig().skyHz);
}

function getParticleUpdateIntervalMs() {
    return getSubsystemIntervalMs(getPerformanceTierConfig().particleHz);
}

function getCrosshairHighlightIntervalMs() {
    if (currentPerformanceTier === 'high') {
        return CROSSHAIR_HIGHLIGHT_INTERVAL_MS;
    }
    return getSubsystemIntervalMs(getPerformanceTierConfig().highlightHz);
}

function canUsePerformanceClock() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function';
}

function getSkyTimeSourceLabel() {
    return `simulation(${skyAnimationTimeSource})`;
}

function rebaseSkyAnimationClock(nowMs = (canUsePerformanceClock() ? performance.now() : Date.now())) {
    if (canUsePerformanceClock()) {
        skyAnimationPerfBaseMs = Number(nowMs || performance.now());
        skyAnimationEpochBaseMs = Date.now();
        skyAnimationTimeSource = 'performance.now';
    } else {
        skyAnimationPerfBaseMs = 0;
        skyAnimationEpochBaseMs = Date.now();
        skyAnimationTimeSource = 'Date.now';
    }
    skySimulationNowMs = skyAnimationEpochBaseMs;
    skySimulationLastRealNowMs = skyAnimationEpochBaseMs;
    skySimulationTimeScale = 1;
    skySimulationTargetScale = 1;
    eclipseRuntimeState.nextEvent = null;
    eclipseRuntimeState.activeEvent = null;
    eclipseRuntimeState.lastPredictionAtRealMs = 0;
    performanceDebugState.skyTimeSource = getSkyTimeSourceLabel();
    performanceDebugState.skyTimeScale = 1;
    performanceDebugState.skyTargetTimeScale = 1;
    setEclipseBannerState({ visible: false });
}

function getSkyAnimationNowMs(nowMs = (canUsePerformanceClock() ? performance.now() : Date.now())) {
    if (!skyAnimationEpochBaseMs) {
        rebaseSkyAnimationClock(nowMs);
    }
    if (canUsePerformanceClock()) {
        return skyAnimationEpochBaseMs + Math.max(0, Number(nowMs || 0) - skyAnimationPerfBaseMs);
    }
    return Date.now();
}

function setSkySimulationTargetScale(nextScale = 1) {
    skySimulationTargetScale = THREE.MathUtils.clamp(
        Number(nextScale || 1),
        ECLIPSE_TIME_SCALE_MIN,
        ECLIPSE_TIME_SCALE_MAX
    );
}

function getSkySimulationNowMs(realNowMs = Date.now(), deltaSeconds = 0) {
    const safeRealNowMs = Number(realNowMs || Date.now());
    if (!Number.isFinite(skySimulationNowMs) || skySimulationNowMs <= 0) {
        skySimulationNowMs = safeRealNowMs;
    }
    if (!Number.isFinite(skySimulationLastRealNowMs) || skySimulationLastRealNowMs <= 0) {
        skySimulationLastRealNowMs = safeRealNowMs;
    }
    const alpha = 1 - Math.exp(-Math.max(0, Number(deltaSeconds || 0)) * ECLIPSE_TIME_SCALE_LERP);
    skySimulationTimeScale += (skySimulationTargetScale - skySimulationTimeScale) * alpha;
    skySimulationTimeScale = THREE.MathUtils.clamp(skySimulationTimeScale, ECLIPSE_TIME_SCALE_MIN, ECLIPSE_TIME_SCALE_MAX);
    const realDeltaMs = Math.max(0, safeRealNowMs - skySimulationLastRealNowMs);
    skySimulationNowMs += realDeltaMs * skySimulationTimeScale;
    skySimulationLastRealNowMs = safeRealNowMs;
    return skySimulationNowMs;
}

function hasActiveCssVideoScene() {
    return !!(cssRenderer && cssScene && activeVideos.size > 0);
}

function getPerformanceTargetTierOrder() {
    return ['low', 'balanced', 'high'];
}

function getAdjacentPerformanceTier(direction = 1) {
    const tiers = getPerformanceTargetTierOrder();
    const currentIndex = tiers.indexOf(currentPerformanceTier);
    if (currentIndex < 0) return currentPerformanceTier;
    const nextIndex = Math.max(0, Math.min(tiers.length - 1, currentIndex + direction));
    return tiers[nextIndex];
}

function setCssRendererVisibility(visible) {
    if (!cssRenderer?.domElement) return;
    cssRenderer.domElement.style.display = visible ? 'block' : 'none';
}

function removeActiveVideoDisplay(docId, boardMesh = null) {
    if (!activeVideos.has(docId)) return;
    const cssObj = activeVideos.get(docId);
    if (cssObj && cssScene) {
        cssScene.remove(cssObj);
    }
    activeVideos.delete(docId);
    if (boardMesh) {
        boardMesh.visible = true;
    }
    if (!activeVideos.size) {
        setCssRendererVisibility(false);
    }
}

function clearWhiteboardRenderState(docId) {
    const timerId = whiteboardUpdateTimerIds.get(docId);
    if (timerId) {
        clearTimeout(timerId);
        whiteboardUpdateTimerIds.delete(docId);
    }
    whiteboardPendingPayloads.delete(docId);
    const renderState = whiteboardRenderCache.get(docId);
    if (renderState) {
        renderState.texture?.dispose?.();
        renderState.material?.dispose?.();
        whiteboardRenderCache.delete(docId);
    }
}

async function ensureCSS3DRenderer() {
    if (cssRenderer && CSS3DObject) {
        setCssRendererVisibility(activeVideos.size > 0);
        return cssRenderer;
    }
    if (cssRendererInitPromise) return cssRendererInitPromise;
    cssRendererInitPromise = (async () => {
        if (!THREE) return null;
        const CSS3D = await import("./vendor/three/CSS3DRenderer.js");
        cssRenderer = new CSS3D.CSS3DRenderer();
        CSS3DObject = CSS3D.CSS3DObject;
        cssRenderer.domElement.style.position = 'absolute';
        cssRenderer.domElement.style.top = 0;
        cssRenderer.domElement.style.left = 0;
        cssRenderer.domElement.style.width = '100%';
        cssRenderer.domElement.style.height = '100%';
        cssRenderer.domElement.style.pointerEvents = 'none';
        cssRenderer.domElement.style.zIndex = '10';
        if (gameContainer && !cssRenderer.domElement.parentElement) {
            gameContainer.appendChild(cssRenderer.domElement);
        }
        updateRenderSurfaceSize();
        setCssRendererVisibility(activeVideos.size > 0);
        return cssRenderer;
    })().finally(() => {
        cssRendererInitPromise = null;
    });
    return cssRendererInitPromise;
}

function createWhiteboardFallbackTexture() {
    if (!THREE) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    for (let i = 0; i <= canvas.width; i += 32) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
    }
    for (let i = 0; i <= canvas.height; i += 32) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
    }
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

function updateRenderSurfaceSize() {
    if (!renderer || !camera) return;
    const cssWidth = Math.max(1, Math.floor(gameContainer?.clientWidth || window.innerWidth || 1));
    const cssHeight = Math.max(1, Math.floor(gameContainer?.clientHeight || window.innerHeight || 1));
    camera.aspect = cssWidth / cssHeight;
    camera.updateProjectionMatrix();

    const tierCfg = getPerformanceTierConfig();
    const desiredDpr = Math.max(1, Number(window.devicePixelRatio || 1));
    const maxPixels = Math.max(1, tierCfg.maxRenderMegapixels * 1_000_000);
    let renderWidth = Math.max(1, Math.floor(cssWidth * desiredDpr));
    let renderHeight = Math.max(1, Math.floor(cssHeight * desiredDpr));
    const totalPixels = renderWidth * renderHeight;
    let pixelRatioCap = desiredDpr;
    if (totalPixels > maxPixels) {
        const downscale = Math.sqrt(maxPixels / totalPixels);
        renderWidth = Math.max(1, Math.floor(renderWidth * downscale));
        renderHeight = Math.max(1, Math.floor(renderHeight * downscale));
        pixelRatioCap = renderWidth / cssWidth;
    }
    renderer.setSize(renderWidth, renderHeight, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    if (cssRenderer) {
        cssRenderer.setSize(cssWidth, cssHeight);
        setCssRendererVisibility(activeVideos.size > 0);
    }

    performanceDebugState.viewport.cssWidth = cssWidth;
    performanceDebugState.viewport.cssHeight = cssHeight;
    performanceDebugState.viewport.renderWidth = renderWidth;
    performanceDebugState.viewport.renderHeight = renderHeight;
    performanceDebugState.viewport.pixelRatioCap = pixelRatioCap;
}

function applyPerformanceTier(nextTier, options = {}) {
    const safeTier = PERFORMANCE_TIER_CONFIG[nextTier] ? nextTier : 'balanced';
    const changed = currentPerformanceTier !== safeTier;
    currentPerformanceTier = safeTier;
    performanceDebugState.currentTier = safeTier;
    performanceDebugState.autoTier = performanceAutoTier;
    performanceDebugState.modeOverride = performanceModeOverride;
    if (!renderer) return changed;

    const tierCfg = getPerformanceTierConfig(safeTier);
    renderer.shadowMap.enabled = tierCfg.shadowMapSize > 0;
    if (sunLight) {
        sunLight.castShadow = tierCfg.shadowMapSize > 0;
        if (sunLight.shadow) {
            sunLight.shadow.autoUpdate = false;
            const nextSize = Math.max(1, tierCfg.shadowMapSize || 1);
            if (sunLight.shadow.mapSize.width !== nextSize || sunLight.shadow.mapSize.height !== nextSize) {
                sunLight.shadow.mapSize.set(nextSize, nextSize);
                sunLight.shadow.map?.dispose?.();
                sunLight.shadow.needsUpdate = true;
            }
        }
    }
    if (moonLight) {
        moonLight.castShadow = false;
    }
    if (starLight) {
        starLight.castShadow = false;
    }
    skyShadowRefreshPending = true;
    setCssRendererVisibility(activeVideos.size > 0);
    if (options.force || !options.fromAuto) {
        updateRenderSurfaceSize();
    }
    if ((changed || options.force) && typeof performance !== 'undefined') {
        performanceState.lastAutoTierChangeAtMs = performance.now();
    }
    return changed;
}

function initPerformanceMonitoring() {
    performanceModeOverride = readStoredPerformanceMode();
    rebaseSkyAnimationClock();
    skyShadowRefreshPending = true;
    performanceDebugState.modeOverride = performanceModeOverride;
    performanceDebugState.currentTier = currentPerformanceTier;
    performanceDebugState.autoTier = performanceAutoTier;
    performanceDebugState.shadowRefreshCount = 0;
    performanceDebugState.lastShadowUpdateAt = 0;
    performanceDebugState.lightAngularDelta = 0;
    performanceDebugState.lightPositionDelta = 0;
    performanceDebugState.skyTimeSource = getSkyTimeSourceLabel();
    performanceDebugState.skyTimeScale = 1;
    performanceDebugState.skyTargetTimeScale = 1;
    performanceDebugState.thumbnailPrecache.requested = itemThumbnailBuildRequested;
    performanceDebugState.thumbnailPrecache.active = itemThumbnailBuildActive;
    performanceDebugState.thumbnailPrecache.completed = itemThumbnailBuildCompleted;
    performanceDebugState.thumbnailPrecache.total = ITEMS_LIBRARY.length;
    window.__ASCraftPerfDebug = () => performanceDebugState;
    window.__ASCraftScenePresetGet = () => ({ id: activeScenePresetId, ...getActiveScenePresetConfig() });
    window.__ASCraftScenePresetList = () => Object.keys(SCENE_PRESET_CATALOG);
    window.__ASCraftScenePresetSet = (nextId = 'hero_classroom_planet_v1') => {
        const changed = setScenePreset(nextId);
        const rebuildPromise = changed
            ? queueScenePresetRebuild().catch(() => null)
            : Promise.resolve(getActiveScenePresetConfig());
        if (changed) {
            performanceDebugState.outdoorBuild.phase = 'scene_preset_rebuild';
        }
        return { id: activeScenePresetId, ...getActiveScenePresetConfig(), rebuildPromise };
    };
    if (
        typeof PerformanceObserver === 'function' &&
        Array.isArray(PerformanceObserver.supportedEntryTypes) &&
        PerformanceObserver.supportedEntryTypes.includes('long-animation-frame')
    ) {
        performanceLoafObserver?.disconnect?.();
        performanceLoafObserver = new PerformanceObserver((list) => {
            list.getEntries().forEach((entry) => {
                performanceDebugState.longAnimationFrames.push({
                    startTime: Number(entry.startTime || 0),
                    duration: Number(entry.duration || 0),
                    blockingDuration: Number(entry.blockingDuration || 0)
                });
            });
            if (performanceDebugState.longAnimationFrames.length > 12) {
                performanceDebugState.longAnimationFrames.splice(0, performanceDebugState.longAnimationFrames.length - 12);
            }
        });
        try {
            performanceLoafObserver.observe({ type: 'long-animation-frame', buffered: true });
        } catch (_) {
            performanceLoafObserver = null;
        }
    }
}

function recordPerformanceFrame(frameMs) {
    if (!Number.isFinite(frameMs) || frameMs <= 0) return;
    if (
        (!performanceLoafObserver || !performanceDebugState.longAnimationFrames.length) &&
        frameMs >= PERFORMANCE_FRAME_SPIKE_MS
    ) {
        performanceDebugState.longAnimationFrames.push({
            startTime: typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now(),
            duration: frameMs,
            blockingDuration: Math.max(0, frameMs - 50)
        });
        if (performanceDebugState.longAnimationFrames.length > 12) {
            performanceDebugState.longAnimationFrames.splice(0, performanceDebugState.longAnimationFrames.length - 12);
        }
    }
    pushBoundedSample(performanceState.frameSamplesMs, frameMs);
    performanceDebugState.frameMs = frameMs;
    performanceDebugState.fps = 1000 / frameMs;
    performanceDebugState.fpsAverage = performanceState.frameSamplesMs.length
        ? 1000 / Math.max(0.0001, getAverageSample(performanceState.frameSamplesMs))
        : 0;
    performanceDebugState.frameP50 = getSamplePercentile(performanceState.frameSamplesMs, 0.5);
    performanceDebugState.frameP95 = getSamplePercentile(performanceState.frameSamplesMs, 0.95);
    if (renderer?.info?.render) {
        performanceDebugState.renderInfo.calls = Number(renderer.info.render.calls || 0);
        performanceDebugState.renderInfo.triangles = Number(renderer.info.render.triangles || 0);
        performanceDebugState.renderInfo.points = Number(renderer.info.render.points || 0);
        performanceDebugState.renderInfo.lines = Number(renderer.info.render.lines || 0);
    }
    const heroBudget = getHeroScenePerformanceBudget(currentPerformanceTier);
    performanceDebugState.heroSceneBudget.tier = currentPerformanceTier;
    performanceDebugState.heroSceneBudget.targetFps = Number(heroBudget.targetFps || 0);
    performanceDebugState.heroSceneBudget.maxDrawCalls = Number(heroBudget.maxDrawCalls || 0);
    performanceDebugState.heroSceneBudget.highDetailRadius = Number(heroBudget.highDetailRadius || 0);
    performanceDebugState.heroSceneBudget.heroPropLimit = Number(heroBudget.heroPropLimit || 0);
    performanceDebugState.heroSceneBudget.drawCallsOverBudget = performanceDebugState.renderInfo.calls > performanceDebugState.heroSceneBudget.maxDrawCalls;

    const tierCfg = getPerformanceTierConfig();
    const aboveBudget = frameMs > tierCfg.frameBudgetMs;
    const comfortablyBelowBudget = frameMs < tierCfg.frameBudgetMs * 0.72;
    if (aboveBudget) {
        performanceState.aboveBudgetForMs += frameMs;
        performanceState.belowBudgetForMs = 0;
    } else if (comfortablyBelowBudget) {
        performanceState.belowBudgetForMs += frameMs;
        performanceState.aboveBudgetForMs = Math.max(0, performanceState.aboveBudgetForMs - frameMs);
    } else {
        performanceState.aboveBudgetForMs = Math.max(0, performanceState.aboveBudgetForMs - (frameMs * 0.5));
        performanceState.belowBudgetForMs = Math.max(0, performanceState.belowBudgetForMs - frameMs);
    }
    performanceDebugState.aboveBudgetForMs = performanceState.aboveBudgetForMs;
    performanceDebugState.belowBudgetForMs = performanceState.belowBudgetForMs;

    if (performanceModeOverride !== 'auto') return;
    const nowMs = typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    if (
        performanceState.aboveBudgetForMs >= PERFORMANCE_AUTO_DEGRADE_MS &&
        currentPerformanceTier !== 'low' &&
        nowMs - performanceState.lastAutoTierChangeAtMs >= 1000
    ) {
        // Disabled auto-downgrade to prevent shadows and glows from vanishing unexpectedly
        // performanceAutoTier = getAdjacentPerformanceTier(-1);
        // applyPerformanceTier(performanceAutoTier, { fromAuto: true });
        performanceState.aboveBudgetForMs = 0;
        performanceState.belowBudgetForMs = 0;
        return;
    }
    if (
        performanceState.belowBudgetForMs >= PERFORMANCE_AUTO_RECOVER_MS &&
        currentPerformanceTier !== 'high' &&
        nowMs - performanceState.lastAutoTierChangeAtMs >= 1500
    ) {
        performanceAutoTier = getAdjacentPerformanceTier(1);
        applyPerformanceTier(performanceAutoTier, { fromAuto: true });
        performanceState.aboveBudgetForMs = 0;
        performanceState.belowBudgetForMs = 0;
    }
}

function hasDirectionalMovementInput() {
    return !!(
        inputState.forward ||
        inputState.backward ||
        inputState.left ||
        inputState.right
    );
}

function getTravelBodyConfig(bodyId = currentSpaceBodyId) {
    return SOLAR_TRAVEL_BODIES[bodyId] || SOLAR_TRAVEL_BODIES.moon;
}

function isSpaceBodyActive() {
    return activeCelestialBody !== 'earth';
}

function getCurrentBodyGravityTuning() {
    if (!isSpaceBodyActive()) {
        return {
            gravityTimeScale: 1,
            jumpBoost: 0,
            descentAssist: 0
        };
    }
    const body = getTravelBodyConfig(currentSpaceBodyId);
    return {
        gravityTimeScale: Number.isFinite(body.gravityTimeScale) ? body.gravityTimeScale : MOON_GRAVITY_TIME_SCALE,
        jumpBoost: Number.isFinite(body.jumpBoost) ? body.jumpBoost : MOON_JUMP_BOOST,
        descentAssist: Number.isFinite(body.descentAssist) ? body.descentAssist : MOON_DESCENT_ASSIST
    };
}

function getSolarPlanetVisualRadius(diameterRatioEarth) {
    let raw = 18.0 * Math.pow(Math.max(0.0001, Number(diameterRatioEarth || 1)), 0.42);
    // Apply additional scaling to distinguish outer planets and give impression of distance
    // Shrink all planets to simulate vastness
    if (diameterRatioEarth > 1.1) {
        // Gas giants: very small and distant
        raw *= 0.08;
    } else {
        // All other planets (Mercury, Venus, Mars, etc.): also very small
        raw *= 0.12;
    }
    return THREE.MathUtils.clamp(raw, 0.8, 128.0);
}

function getPlanetOrbitVisualRadius(semiMajorAxisAU = 1) {
    const au = Math.max(0.0001, Number(semiMajorAxisAU || 1));
    // Massive scale to push planets into the deep background
    return au * 320.0;
}

function getMoonOrbitVisualRadius(moonCfg = {}) {
    const orbitRadiusKm = Number(moonCfg.orbitRadiusKm || 0);
    if (Number.isFinite(orbitRadiusKm) && orbitRadiusKm > 0) {
        return 3.6 + (2.8 * Math.log10(1 + (orbitRadiusKm / 120000)));
    }
    const orbitRadiusAU = Math.max(0.00001, Number(moonCfg.orbitRadiusAU || 0.001));
    return 3.2 + (3.2 * Math.log10(1 + (orbitRadiusAU * 6000)));
}

function getRelativeEarthDistanceVisual(relativeDistanceAU = 0) {
    const safeDistance = Math.max(0, Number(relativeDistanceAU || 0));
    return THREE.MathUtils.clamp(
        220 + (140 * Math.log10(1 + (safeDistance * 18))),
        220,
        760
    );
}

function directionToQuaternion(direction, forwardAxis = new THREE.Vector3(0, 0, 1), faceOffset = 0) {
    const safeDirection = direction?.clone?.();
    if (!safeDirection || safeDirection.lengthSq() < 1e-6) {
        return new THREE.Quaternion();
    }
    safeDirection.normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(forwardAxis.clone().normalize(), safeDirection);
    if (faceOffset) {
        quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(safeDirection, Number(faceOffset || 0)));
    }
    return quaternion;
}

function applyInterpolatedObjectTransform(object, targetPosition, targetQuaternion, delta = 0, options = {}) {
    if (!object) return;
    const safeDelta = Math.max(0, Number(delta || 0));
    const positionLambda = Math.max(0.01, Number(options.positionLambda || 14));
    const rotationLambda = Math.max(0.01, Number(options.rotationLambda || 16));
    const snap = !!options.snap || !object.userData.__interpolationReady;
    if (targetPosition?.clone) {
        if (snap) {
            object.position.copy(targetPosition);
        } else {
            const positionAlpha = 1 - Math.exp(-safeDelta * positionLambda);
            object.position.lerp(targetPosition, positionAlpha);
        }
    }
    if (targetQuaternion?.copy) {
        if (snap) {
            object.quaternion.copy(targetQuaternion);
        } else {
            const rotationAlpha = 1 - Math.exp(-safeDelta * rotationLambda);
            object.quaternion.slerp(targetQuaternion, rotationAlpha);
        }
    }
    object.userData.__interpolationReady = true;
}

function dampAngleRadians(current = 0, target = 0, lambda = 16, delta = 0) {
    const safeCurrent = Number(current || 0);
    const safeTarget = Number(target || 0);
    const diff = Math.atan2(Math.sin(safeTarget - safeCurrent), Math.cos(safeTarget - safeCurrent));
    return safeCurrent + (diff * (1 - Math.exp(-Math.max(0, Number(delta || 0)) * Math.max(0.01, Number(lambda || 16)))));
}

function applyInterpolatedScalar(object, key, targetValue, delta = 0, lambda = 16) {
    if (!object) return Number(targetValue || 0);
    const userData = object.userData || (object.userData = {});
    const safeTarget = Number(targetValue || 0);
    if (!Number.isFinite(userData[key])) {
        userData[key] = safeTarget;
        return safeTarget;
    }
    userData[key] = THREE.MathUtils.damp(userData[key], safeTarget, Math.max(0.01, Number(lambda || 16)), Math.max(0, Number(delta || 0)));
    return userData[key];
}

function getAngularOverlap(separation = 0, occluderRadius = 0, lightRadius = 0) {
    const safeSeparation = Math.max(0, Number(separation || 0));
    const safeOccluder = Math.max(0, Number(occluderRadius || 0));
    const safeLight = Math.max(0, Number(lightRadius || 0));
    if (safeOccluder <= 0 || safeLight <= 0 || safeSeparation >= (safeOccluder + safeLight)) {
        return { penumbra: 0, umbra: 0 };
    }
    const fullOverlapThreshold = Math.abs(safeOccluder - safeLight);
    const overlapSpan = Math.max(0.0001, (safeOccluder + safeLight) - fullOverlapThreshold);
    const penumbra = clamp01(1 - ((safeSeparation - fullOverlapThreshold) / overlapSpan));
    const umbra = safeOccluder >= (safeSeparation + safeLight)
        ? clamp01((safeOccluder - safeSeparation) / Math.max(0.0001, safeLight))
        : 0;
    return { penumbra, umbra };
}

function getDirectionSeparation(directionA, directionB) {
    const a = directionA?.clone?.();
    const b = directionB?.clone?.();
    if (!a || !b || a.lengthSq() < 1e-6 || b.lengthSq() < 1e-6) {
        return Math.PI;
    }
    return a.normalize().angleTo(b.normalize());
}

function getMoonPhaseName(phaseAmount = 0) {
    const phase = clamp01(Number(phaseAmount || 0));
    if (phase <= 0.08) return 'luna_nueva';
    if (phase < 0.42) return 'creciente';
    if (phase <= 0.58) return 'cuarto';
    if (phase < 0.92) return 'gibosa';
    return 'luna_llena';
}

function getEclipseEventLabel(eventType = 'solar') {
    return eventType === 'lunar' ? 'Eclipse lunar' : 'Eclipse solar';
}

function formatCountdownSeconds(remainingMs = 0) {
    return Math.max(0, Math.ceil(Math.max(0, Number(remainingMs || 0)) / 1000));
}

const EARTH_PHYSICAL_RADIUS_AU = 6371.0 / 149.6e6;
const MOON_PHYSICAL_RADIUS_AU = 1737.1 / 149.6e6;

function getEclipseStrengthSampleAtTime(epochMs = Date.now(), surfaceNormal = null) {
    const roomClock = getRoomTimeState(epochMs);
    const astronomyTimeScale = (24 * 60 * 60 * 1000) / Math.max(60_000, roomClock.dayDurationMs);
    const astronomyNowMs = Number(roomClock.sourceEpochMs || epochMs) * astronomyTimeScale;
    const snapshot = buildSolarSystemSnapshot(astronomyNowMs, roomClock);
    const earthState = snapshot.planets.get('earth');
    const earthMoonState = snapshot.moons.get('earth:moon');
    if (!earthState || !earthMoonState) return null;

    // Localized parallax calculation if surface normal is provided
    let observerPosInertial;
    if (surfaceNormal && surfaceNormal instanceof THREE.Vector3) {
        // Rotate surface normal back to inertial frame to combine with physical positions
        const inertialSurfaceNormal = surfaceNormal.clone()
            .applyAxisAngle(earthState.spinAxis, earthState.rotationAngle)
            .normalize();
        observerPosInertial = earthState.physicalPosition.clone()
            .addScaledVector(inertialSurfaceNormal, EARTH_PHYSICAL_RADIUS_AU);
    } else {
        // Fallback to center-of-earth calculation
        observerPosInertial = earthState.physicalPosition.clone();
    }

    const sunOrigin = new THREE.Vector3(0, 0, 0);
    const observerToSunInertial = sunOrigin.clone().sub(observerPosInertial).normalize();
    const observerToMoonInertial = earthMoonState.physicalPosition.clone().sub(observerPosInertial).normalize();

    // Solar Eclipse (Moon between observer and Sun)
    const solarEclipseState = getAngularOverlap(
        getDirectionSeparation(observerToSunInertial, observerToMoonInertial),
        MOON_ANGULAR_RADIUS_RAD,
        SUN_ANGULAR_RADIUS_RAD
    );

    // Lunar Eclipse (Earth shadow on Moon as seen from observer)
    // For lunar eclipse, parallax is smaller relative to the Earth's shadow size at the moon's distance,
    // but the observer must be on the dark side of Earth to see it.
    const moonToEarthInertial = earthState.physicalPosition.clone().sub(earthMoonState.physicalPosition).normalize();
    const moonToSunInertial = earthMoonState.localSunDirection?.clone?.() || new THREE.Vector3(0, 0, -1);
    const lunarEclipseState = getAngularOverlap(
        getDirectionSeparation(moonToSunInertial, moonToEarthInertial),
        EARTH_FROM_MOON_ANGULAR_RADIUS_RAD,
        SUN_ANGULAR_RADIUS_RAD
    );

    // Check if observer is in the night side for lunar eclipse visibility
    let lunarVisibility = 1;
    if (surfaceNormal) {
        const localSunDirInertial = sunOrigin.clone().sub(earthState.physicalPosition).normalize();
        const altitudeAtSurface = surfaceNormal.dot(localSunDirInertial.applyAxisAngle(earthState.spinAxis, -earthState.rotationAngle));
        lunarVisibility = altitudeAtSurface < 0.05 ? 1 : 0; // Only visible near or during night
    }

    return {
        solarStrength: Math.max(solarEclipseState.penumbra, solarEclipseState.umbra),
        lunarStrength: Math.max(lunarEclipseState.penumbra, lunarEclipseState.umbra) * lunarVisibility
    };
}

function refineEclipseEventStart(eventType = 'solar', rangeStartMs = Date.now(), rangeEndMs = Date.now()) {
    let low = Math.min(rangeStartMs, rangeEndMs);
    let high = Math.max(rangeStartMs, rangeEndMs);
    let guard = 0;
    while ((high - low) > ECLIPSE_SCAN_FINE_STEP_MS && guard < 24) {
        const mid = low + ((high - low) * 0.5);
        const sample = getEclipseStrengthSampleAtTime(mid);
        const strength = eventType === 'lunar'
            ? Number(sample?.lunarStrength || 0)
            : Number(sample?.solarStrength || 0);
        if (strength >= ECLIPSE_ENTER_THRESHOLD) {
            high = mid;
        } else {
            low = mid;
        }
        guard += 1;
    }
    return Math.round(high);
}

function predictNextEclipseEvent(fromEpochMs = Date.now(), surfaceNormal = null) {
    const horizonEnd = fromEpochMs + ECLIPSE_SCAN_HORIZON_MS;
    let previousSample = getEclipseStrengthSampleAtTime(fromEpochMs, surfaceNormal);
    if (!previousSample) return null;
    let previousMs = fromEpochMs;

    // Coarse scan first (larger steps to avoid hanging the main thread)
    const coarseStepMs = 60 * 1000;
    const scanStepMs = ECLIPSE_SCAN_STEP_MS; // 3s from config

    for (let cursorMs = fromEpochMs + coarseStepMs; cursorMs <= horizonEnd; cursorMs += coarseStepMs) {
        const currentSample = getEclipseStrengthSampleAtTime(cursorMs, surfaceNormal);
        if (!currentSample) continue;

        const isSolarPotential = (currentSample.solarStrength || 0) > 0.02 || (previousSample.solarStrength || 0) > 0.02;
        const isLunarPotential = (currentSample.lunarStrength || 0) > 0.02 || (previousSample.lunarStrength || 0) > 0.02;

        if (isSolarPotential || isLunarPotential) {
            // Refine this potential window with a finer grain
            for (let refineMs = previousMs + scanStepMs; refineMs < cursorMs; refineMs += scanStepMs) {
                const sample = getEclipseStrengthSampleAtTime(refineMs, surfaceNormal);
                if (!sample) continue;

                if (sample.solarStrength >= ECLIPSE_ENTER_THRESHOLD) {
                    const startMs = refineEclipseEventStart('solar', refineMs - scanStepMs, refineMs);
                    return { id: `solar:${startMs}`, eventType: 'solar', startMs };
                }
                if (sample.lunarStrength >= ECLIPSE_ENTER_THRESHOLD) {
                    const startMs = refineEclipseEventStart('lunar', refineMs - scanStepMs, refineMs);
                    return { id: `lunar:${startMs}`, eventType: 'lunar', startMs };
                }
            }
            // Final check at the cursor point
            if (currentSample.solarStrength >= ECLIPSE_ENTER_THRESHOLD) {
                const startMs = refineEclipseEventStart('solar', cursorMs - coarseStepMs, cursorMs);
                return { id: `solar:${startMs}`, eventType: 'solar', startMs };
            }
            if (currentSample.lunarStrength >= ECLIPSE_ENTER_THRESHOLD) {
                const startMs = refineEclipseEventStart('lunar', cursorMs - coarseStepMs, cursorMs);
                return { id: `lunar:${startMs}`, eventType: 'lunar', startMs };
            }
        }
        previousMs = cursorMs;
        previousSample = currentSample;
    }
    return null;
}

function setEclipseBannerState({ visible = false, title = '', countdown = '', severity = 'normal' } = {}) {
    if (!eclipseHudState.bannerEl || !eclipseHudState.titleEl || !eclipseHudState.countdownEl) return;
    const normalizedSeverity = String(severity || 'normal');
    eclipseHudState.bannerEl.style.display = visible ? 'block' : 'none';
    eclipseHudState.bannerEl.setAttribute('data-severity', normalizedSeverity);
    if (normalizedSeverity === 'active') {
        eclipseHudState.bannerEl.style.borderColor = 'rgba(255,196,112,0.9)';
        eclipseHudState.bannerEl.style.background = 'linear-gradient(135deg, rgba(9,16,34,0.96), rgba(64,28,0,0.93))';
    } else if (normalizedSeverity === 'countdown') {
        eclipseHudState.bannerEl.style.borderColor = 'rgba(255,245,190,0.52)';
        eclipseHudState.bannerEl.style.background = 'linear-gradient(135deg, rgba(18,25,42,0.92), rgba(34,18,62,0.92))';
    } else {
        eclipseHudState.bannerEl.style.borderColor = 'rgba(255,245,190,0.45)';
        eclipseHudState.bannerEl.style.background = 'linear-gradient(135deg, rgba(18,25,42,0.92), rgba(34,18,62,0.92))';
    }
    eclipseHudState.titleEl.textContent = title || 'Evento especial';
    eclipseHudState.countdownEl.textContent = countdown || '';
    eclipseHudState.bannerEl.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function updateEclipseRuntimeState({
    simulationNowMs = Date.now(),
    realNowMs = Date.now(),
    solarStrength = 0,
    lunarStrength = 0,
    surfaceNormal = null
} = {}) {
    const solar = clamp01(Number(solarStrength || 0));
    const lunar = clamp01(Number(lunarStrength || 0));
    const activeType = solar >= ECLIPSE_ACTIVE_THRESHOLD || lunar >= ECLIPSE_ACTIVE_THRESHOLD
        ? (solar >= lunar ? 'solar' : 'lunar')
        : null;

    if (activeType) {
        if (!eclipseRuntimeState.activeEvent || eclipseRuntimeState.activeEvent.eventType !== activeType) {
            eclipseRuntimeState.activeEvent = {
                id: `${activeType}:${Math.round(simulationNowMs)}`,
                eventType: activeType,
                startedAtMs: Math.round(simulationNowMs)
            };
        }
        eclipseRuntimeState.nextEvent = null;
    } else if (eclipseRuntimeState.activeEvent && solar < ECLIPSE_ENTER_THRESHOLD && lunar < ECLIPSE_ENTER_THRESHOLD) {
        eclipseRuntimeState.activeEvent = null;
    }

    const dominantStrength = eclipseRuntimeState.activeEvent
        ? Math.max(solar, lunar)
        : 0;
    if (eclipseRuntimeState.activeEvent) {
        const slowScale = THREE.MathUtils.clamp(1 - (dominantStrength * 0.92), ECLIPSE_TIME_SCALE_MIN, 0.34);
        setSkySimulationTargetScale(slowScale);
    } else {
        setSkySimulationTargetScale(1);
    }

    const shouldPredict = !eclipseRuntimeState.activeEvent
        && (
            !eclipseRuntimeState.nextEvent
            || eclipseRuntimeState.nextEvent.startMs <= simulationNowMs
            || (realNowMs - eclipseRuntimeState.lastPredictionAtRealMs) >= ECLIPSE_SCAN_INTERVAL_MS
        );
    if (shouldPredict) {
        eclipseRuntimeState.nextEvent = predictNextEclipseEvent(simulationNowMs, surfaceNormal);
        eclipseRuntimeState.lastPredictionAtRealMs = Number(realNowMs || Date.now());
    }

    if (eclipseRuntimeState.activeEvent) {
        const eventLabel = getEclipseEventLabel(eclipseRuntimeState.activeEvent.eventType);
        const speedPercent = Math.round((1 - skySimulationTimeScale) * 100);
        setEclipseBannerState({
            visible: true,
            severity: 'active',
            title: `EVENTO ESPECIAL: ${eventLabel} en curso`,
            countdown: `Tiempo ralentizado ${speedPercent}% para observar el eclipse`
        });
    } else if (eclipseRuntimeState.nextEvent) {
        const remainingMs = eclipseRuntimeState.nextEvent.startMs - simulationNowMs;
        if (remainingMs > 0 && remainingMs <= ECLIPSE_NOTIFICATION_LEAD_MS) {
            const eventLabel = getEclipseEventLabel(eclipseRuntimeState.nextEvent.eventType);
            const seconds = formatCountdownSeconds(remainingMs);
            setEclipseBannerState({
                visible: true,
                severity: 'countdown',
                title: `EVENTO ESPECIAL: ${eventLabel} empieza en ${seconds}s`,
                countdown: `Cuenta regresiva: ${seconds}s`
            });
        } else {
            setEclipseBannerState({ visible: false });
        }
    } else {
        setEclipseBannerState({ visible: false });
    }

    return {
        activeEvent: eclipseRuntimeState.activeEvent,
        nextEvent: eclipseRuntimeState.nextEvent,
        solarStrength: solar,
        lunarStrength: lunar,
        dominantStrength: dominantStrength,
        timeScale: Number(skySimulationTimeScale || 1),
        targetTimeScale: Number(skySimulationTargetScale || 1)
    };
}

function tryAugmentRenderGameToText() {
    ensureWebGameHooks();
    if (renderGameToTextAstroAugmented || typeof window === 'undefined') return;
    if (typeof window.render_game_to_text !== 'function') return;
    const original = window.render_game_to_text;
    window.render_game_to_text = () => {
        const raw = original();
        const astroPayload = latestSkyDebugState?.astro || null;
        const roomTimePayload = latestSkyDebugState?.roomTime || null;
        const movementPayload = movementController?.state ? {
            canJump: !!movementController.state.canJump,
            isMoving: !!movementController.state.isMoving,
            interpolationAlpha: Number(movementController.state.interpolationAlpha || 0),
            viewMode: playerViewMode,
            activeBody: activeCelestialBody,
            surfaceMode: movementController.state.debugSurfaceMode || null,
            collisionFlags: movementController.state.debugCollisionFlags || null,
            support: movementController.state.debugLastSupport || null,
            position: playerWorldPosition ? {
                x: Number(playerWorldPosition.x || 0),
                y: Number(playerWorldPosition.y || 0),
                z: Number(playerWorldPosition.z || 0)
            } : null,
            velocity: movementController.state.velocity ? {
                x: Number(movementController.state.velocity.x || 0),
                y: Number(movementController.state.velocity.y || 0),
                z: Number(movementController.state.velocity.z || 0)
            } : null,
            spawnPersistenceEnabled,
            lastSavedSpawn: lastSavedSpawnState,
            playerCollisionMask: collisionBroadphase?.masks?.playerLocal ?? null,
            collisionWorldStats: collisionBroadphase?.getStats?.() ?? null
        } : null;
        const cameraPayload = camera ? {
            position: {
                x: Number(camera.position?.x || 0),
                y: Number(camera.position?.y || 0),
                z: Number(camera.position?.z || 0)
            }
        } : null;
        try {
            const parsed = JSON.parse(String(raw));
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                parsed.astro = astroPayload;
                parsed.roomTime = roomTimePayload;
                parsed.season = latestSkyDebugState?.season || null;
                parsed.weather = latestSkyDebugState?.weather || null;
                parsed.moonPhase = latestSkyDebugState?.astro?.moonPhase || null;
                parsed.arenaCollisionState = latestSkyDebugState?.arenaCollisionState || null;
                parsed.movement = movementPayload;
                parsed.camera = cameraPayload;
                return JSON.stringify(parsed);
            }
        } catch (_) { }
        return JSON.stringify({
            mode: 'legacy_state',
            rawState: raw,
            astro: astroPayload,
            roomTime: roomTimePayload,
            season: latestSkyDebugState?.season || null,
            weather: latestSkyDebugState?.weather || null,
            moonPhase: latestSkyDebugState?.astro?.moonPhase || null,
            arenaCollisionState: latestSkyDebugState?.arenaCollisionState || null,
            movement: movementPayload,
            camera: cameraPayload
        });
    };
    renderGameToTextAstroAugmented = true;
}

function ensureWebGameHooks() {
    if (typeof window === 'undefined') return;
    if (typeof window.advanceTime !== 'function') {
        window.advanceTime = async (ms = 0) => {
            const waitMs = Math.max(0, Number(ms || 0));
            await new Promise((resolve) => window.setTimeout(resolve, waitMs));
            await new Promise((resolve) => requestAnimationFrame(() => resolve()));
            return typeof window.render_game_to_text === 'function'
                ? window.render_game_to_text()
                : null;
        };
    }
}

function publishSkyDebugState(payload = null) {
    latestSkyDebugState = payload ? JSON.parse(JSON.stringify(payload)) : null;
    if (typeof window === 'undefined') return;
    window.__ASCraftSkyDebug = () => latestSkyDebugState;
    ensureWebGameHooks();
    tryAugmentRenderGameToText();
}

function createOrbitOffset(radius = 1, angle = 0, tilt = 0, verticalFrequency = 1.15) {
    return new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle * verticalFrequency) * (radius * tilt),
        Math.sin(angle) * radius
    );
}

function createEllipticalOrbitOffset(
    semiMajorAxis = 1,
    eccentricity = 0,
    angle = 0,
    inclination = 0,
    ascendingNode = 0
) {
    const safeSemiMajorAxis = Math.max(0.04, Number(semiMajorAxis || 1));
    const safeEccentricity = THREE.MathUtils.clamp(Number(eccentricity || 0), 0, 0.985);
    const radius = (safeSemiMajorAxis * (1 - (safeEccentricity * safeEccentricity)))
        / Math.max(0.08, 1 + (safeEccentricity * Math.cos(angle)));
    return new THREE.Vector3(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
    )
        .applyAxisAngle(new THREE.Vector3(1, 0, 0), Number(inclination || 0))
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), Number(ascendingNode || 0));
}

function getCelestialSpinAxis(axialTilt = 0) {
    return new THREE.Vector3(0, 1, 0)
        .applyAxisAngle(new THREE.Vector3(0, 0, 1), Number(axialTilt || 0))
        .normalize();
}

let _cachedSolarSnapshot = null;
let _cachedSolarSnapshotMs = -1;

function buildSolarSystemSnapshot(now = Date.now(), roomTimeState = null) {
    if (_cachedSolarSnapshot && Math.abs(now - _cachedSolarSnapshotMs) < 120) {
        return _cachedSolarSnapshot;
    }
    const safeRoomTimeState = roomTimeState || getRoomTimeState(now);
    const planets = new Map();
    const moons = new Map();
    const sunOrigin = new THREE.Vector3(0, 0, 0);
    const timeState = safeRoomTimeState;
    const earthConfig = SOLAR_SYSTEM_VISUAL_PLANETS.find((planet) => planet.id === 'earth') || SOLAR_SYSTEM_VISUAL_PLANETS[0];
    const earthOrbitReferenceMs = getConfigPeriodMsFromSpeed(earthConfig?.orbitSpeed, SKY_CYCLE_DURATION_MS * 6);
    const earthRotationReferenceMs = getConfigPeriodMsFromSpeed(earthConfig?.rotationSpeed, SKY_CYCLE_DURATION_MS * 0.6);

    SOLAR_SYSTEM_VISUAL_PLANETS.forEach((planetCfg, planetIndex) => {
        const orbitPeriodMs = (timeState.dayDurationMs * 6)
            * (getConfigPeriodMsFromSpeed(planetCfg.orbitSpeed, SKY_CYCLE_DURATION_MS * 6) / earthOrbitReferenceMs);
        const rotationPeriodMs = timeState.dayDurationMs
            * (getConfigPeriodMsFromSpeed(planetCfg.rotationSpeed, SKY_CYCLE_DURATION_MS * 0.6) / earthRotationReferenceMs);
        const orbitAngle = getAngularProgress(
            timeState.epochMs,
            orbitPeriodMs,
            Number(planetCfg.orbitPhase || (planetIndex * 0.62))
        );
        const position = createOrbitOffset(
            getPlanetOrbitVisualRadius(planetCfg.semiMajorAxisAU),
            orbitAngle,
            planetCfg.orbitTilt || 0,
            1.33
        );
        const physicalPosition = createOrbitOffset(
            Number(planetCfg.semiMajorAxisAU || 1),
            orbitAngle,
            planetCfg.orbitTilt || 0,
            1.33
        );
        const planetState = {
            id: planetCfg.id,
            config: planetCfg,
            orbitAngle,
            position,
            physicalPosition,
            rotationAngle: getAngularProgress(
                timeState.epochMs,
                rotationPeriodMs,
                Number(planetCfg.rotationPhase || 0)
            ),
            spinAxis: getCelestialSpinAxis(planetCfg.axialTilt || 0)
        };
        planets.set(planetCfg.id, planetState);

        (planetCfg.moons || []).forEach((moonCfg, moonIndex) => {
            const orbitPeriodMsMoon = (timeState.dayDurationMs * 27.3)
                * (getConfigPeriodMsFromSpeed(moonCfg.orbitSpeed, SKY_CYCLE_DURATION_MS * 0.6) / earthOrbitReferenceMs);
            const rotationPeriodMsMoon = timeState.dayDurationMs
                * (getConfigPeriodMsFromSpeed(moonCfg.rotationSpeed || moonCfg.orbitSpeed, SKY_CYCLE_DURATION_MS * 0.24) / earthRotationReferenceMs);
            const orbitAngleMoon = getAngularProgress(
                timeState.epochMs,
                orbitPeriodMsMoon,
                Number(moonCfg.orbitPhase || (moonIndex * 1.2))
            );
            const localOffset = createOrbitOffset(
                getMoonOrbitVisualRadius(moonCfg),
                orbitAngleMoon,
                moonCfg.orbitTilt || 0,
                1.15
            );
            const physicalLocalOffset = createOrbitOffset(
                Number(moonCfg.orbitRadiusAU || EARTH_MOON_ORBIT_RADIUS_AU),
                orbitAngleMoon,
                moonCfg.orbitTilt || 0,
                1.15
            );
            const physicalPosition = planetState.physicalPosition.clone().add(physicalLocalOffset);
            const localSunDirection = sunOrigin.clone().sub(physicalPosition).normalize();
            const parentDirection = planetState.physicalPosition.clone().sub(physicalPosition).normalize();
            const lockedToParent = !!moonCfg.lockedToParent;
            const spinAngle = lockedToParent
                ? (orbitAngleMoon + Number(moonCfg.faceOffset || 0)) % (Math.PI * 2)
                : getAngularProgress(
                    timeState.epochMs,
                    rotationPeriodMsMoon,
                    Number(moonCfg.rotationPhase || 0)
                );
            const moonState = {
                id: moonCfg.id,
                fullId: `${planetCfg.id}:${moonCfg.id}`,
                parentId: planetCfg.id,
                config: moonCfg,
                orbitAngle: orbitAngleMoon,
                spinAngle,
                lockedToParent,
                localOffset,
                physicalLocalOffset,
                position: planetState.position.clone().add(localOffset),
                physicalPosition,
                rotationAngle: spinAngle,
                spinAxis: getCelestialSpinAxis(moonCfg.axialTilt || 0),
                localSunDirection,
                parentDirection,
                faceOffset: Number(moonCfg.faceOffset || 0),
                phaseAmount: clamp01((1 - localSunDirection.dot(parentDirection)) * 0.5),
                umbraFactor: 0,
                penumbraFactor: 0
            };
            moons.set(moonState.fullId, moonState);
        });
    });

    return { sunOrigin, planets, moons };
}

function getEarthSolarLightingState(roomClock = currentRoomTimeState, now = Date.now()) {
    const safeRoomClock = roomClock || getRoomTimeState(now);
    const astronomyTimeScale = (24 * 60 * 60 * 1000) / Math.max(60_000, safeRoomClock.dayDurationMs);
    const astronomyNowMs = Number(safeRoomClock.sourceEpochMs || now) * astronomyTimeScale;
    const snapshot = buildSolarSystemSnapshot(astronomyNowMs, safeRoomClock);
    const earthState = snapshot.planets.get('earth');
    if (!earthState?.spinAxis || !earthState?.physicalPosition) return null;
    const inertialSunDirection = earthState.physicalPosition.clone().multiplyScalar(-1).normalize();
    const localSunDirection = inertialSunDirection
        .clone()
        .applyAxisAngle(earthState.spinAxis, -earthState.rotationAngle)
        .normalize();
    return {
        snapshot,
        earthState,
        localSunDirection
    };
}

function buildCometSnapshot(now = Date.now(), roomTimeState = getRoomTimeState(now)) {
    const comets = new Map();
    const timeState = roomTimeState || getRoomTimeState(now);
    const earthConfig = SOLAR_SYSTEM_VISUAL_PLANETS.find((planet) => planet.id === 'earth') || SOLAR_SYSTEM_VISUAL_PLANETS[0];
    const earthOrbitReferenceMs = getConfigPeriodMsFromSpeed(earthConfig?.orbitSpeed, SKY_CYCLE_DURATION_MS * 6);
    HELIOCENTRIC_COMETS.forEach((cometCfg, cometIndex) => {
        const orbitPeriodMs = timeState.yearDurationMs
            * (getConfigPeriodMsFromSpeed(cometCfg.orbitSpeed, SKY_CYCLE_DURATION_MS * 24) / earthOrbitReferenceMs);
        const orbitAngle = getAngularProgress(
            timeState.epochMs,
            orbitPeriodMs,
            Number(cometCfg.orbitPhase || (cometIndex * 1.17))
        );
        const physicalPosition = createEllipticalOrbitOffset(
            cometCfg.semiMajorAxisAU,
            cometCfg.eccentricity,
            orbitAngle,
            cometCfg.inclination,
            cometCfg.ascendingNode
        );
        comets.set(cometCfg.id, {
            id: cometCfg.id,
            config: cometCfg,
            orbitAngle,
            physicalPosition,
            sunDistanceAU: physicalPosition.length()
        });
    });
    return comets;
}

function getActiveSolarBodyState(snapshot) {
    if (isSpaceBodyActive()) {
        if (currentSpaceBodyId === 'moon') {
            return snapshot.moons.get('earth:moon') || snapshot.planets.get('earth');
        }
        return snapshot.planets.get(currentSpaceBodyId) || snapshot.planets.get('earth');
    }
    return snapshot.planets.get('earth');
}

function createCelestialBodyVisual({
    radius = 1,
    color = 0xffffff,
    opacity = 0.88,
    renderOrder = -874,
    segments = 16,
    axialTilt = 0
} = {}) {
    const root = new THREE.Group();
    markRaycastIgnored(root);

    const axialTiltGroup = new THREE.Group();
    axialTiltGroup.rotation.z = Number(axialTilt || 0);
    markRaycastIgnored(axialTiltGroup);
    root.add(axialTiltGroup);

    const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, segments, segments),
        new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity,
            depthWrite: false,
            fog: false
        })
    );
    mesh.renderOrder = renderOrder;
    markRaycastIgnored(mesh);
    axialTiltGroup.add(mesh);

    const accentA = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(radius * 0.18, 0.08), 10, 10),
        new THREE.MeshBasicMaterial({
            color: new THREE.Color(color).offsetHSL(0, 0, -0.18),
            transparent: true,
            opacity: Math.min(1, opacity + 0.04),
            depthWrite: false,
            fog: false
        })
    );
    accentA.position.set(radius * 0.68, radius * 0.18, radius * 0.22);
    accentA.renderOrder = renderOrder + 1;
    markRaycastIgnored(accentA);
    mesh.add(accentA);

    const accentB = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(radius * 0.12, 0.06), 8, 8),
        new THREE.MeshBasicMaterial({
            color: new THREE.Color(color).offsetHSL(0, 0, 0.12),
            transparent: true,
            opacity: Math.max(0.55, opacity * 0.78),
            depthWrite: false,
            fog: false
        })
    );
    accentB.position.set(-radius * 0.52, -radius * 0.16, radius * 0.38);
    accentB.renderOrder = renderOrder + 1;
    markRaycastIgnored(accentB);
    mesh.add(accentB);

    return { root, axialTiltGroup, mesh, accentA, accentB };
}

function createCelestialPhaseMaterial(baseColor = 0xffffff, darkFloor = 0.14) {
    const safeColor = new THREE.Color(baseColor);
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: false,
        uniforms: {
            uBaseColor: { value: safeColor },
            uSunDirection: { value: new THREE.Vector3(0, 0, 1) },
            uPenumbra: { value: 0 },
            uUmbra: { value: 0 },
            uRedTint: { value: 0 },
            uDarkFloor: { value: THREE.MathUtils.clamp(Number(darkFloor || 0.14), 0.08, 0.48) }
        },
        vertexShader: `
            varying vec3 vNormalLocal;
            void main() {
                vNormalLocal = normalize(normal);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 uBaseColor;
            uniform vec3 uSunDirection;
            uniform float uPenumbra;
            uniform float uUmbra;
            uniform float uRedTint;
            uniform float uDarkFloor;
            varying vec3 vNormalLocal;
            void main() {
                vec3 normal = normalize(vNormalLocal);
                vec3 sunDir = normalize(uSunDirection);
                float ndl = dot(normal, sunDir);
                float lit = smoothstep(-0.18, 0.52, ndl);
                vec3 base = mix(uBaseColor * uDarkFloor, uBaseColor, lit);
                float eclipse = clamp(1.0 - (uPenumbra * 0.42) - (uUmbra * 0.72), 0.08, 1.0);
                vec3 tinted = mix(base, vec3(0.58, 0.24, 0.18), clamp(uRedTint, 0.0, 1.0) * (0.25 + uUmbra * 0.55));
                gl_FragColor = vec4(tinted * eclipse, 0.96);
            }
        `
    });
}

function createLightOrbitalBodyDisplay({
    bodyColor = 0xffffff,
    glowInner = 'rgba(255,255,255,0.98)',
    glowOuter = 'rgba(255,255,255,0)',
    glowScale = 12,
    meshRadius = 2,
    renderOrder = -899,
    axialTilt = 0,
    voxelSize = 0.32,
    darkFloor = 0.14,
    patches = []
} = {}) {
    const root = new THREE.Group();
    markRaycastIgnored(root);

    const axialTiltGroup = new THREE.Group();
    axialTiltGroup.rotation.z = Number(axialTilt || 0);
    markRaycastIgnored(axialTiltGroup);
    root.add(axialTiltGroup);

    const surfaceGroup = new THREE.Group();
    markRaycastIgnored(surfaceGroup);
    axialTiltGroup.add(surfaceGroup);

    const phaseMaterial = createCelestialPhaseMaterial(bodyColor, darkFloor);
    const phaseSphere = new THREE.Mesh(
        new THREE.SphereGeometry(meshRadius * 0.86, 18, 18),
        phaseMaterial
    );
    phaseSphere.renderOrder = renderOrder + 1;
    phaseSphere.frustumCulled = false; // Prevents disappearing at screen edges
    markRaycastIgnored(phaseSphere);
    surfaceGroup.add(phaseSphere);

    const patchMaterials = [];
    patches.forEach((patch, index) => {
        const patchMaterial = new THREE.MeshBasicMaterial({
            color: patch.color || bodyColor,
            transparent: true,
            opacity: Number.isFinite(patch.opacity) ? patch.opacity : 0.9,
            depthWrite: false,
            fog: false
        });
        const patchMesh = new THREE.Mesh(
            new THREE.SphereGeometry(meshRadius * Number(patch.radiusScale || 0.26), 12, 12),
            patchMaterial
        );
        const position = patch.position || [0.45, 0.12, 0.42];
        const scale = patch.scale || [1, 0.58, 0.26];
        const rotation = patch.rotation || [0, 0, 0];
        patchMesh.position.set(
            meshRadius * position[0],
            meshRadius * position[1],
            meshRadius * position[2]
        );
        patchMesh.scale.set(scale[0], scale[1], scale[2]);
        patchMesh.rotation.set(rotation[0], rotation[1], rotation[2]);
        patchMesh.renderOrder = renderOrder + 2 + index;
        markRaycastIgnored(patchMesh);
        surfaceGroup.add(patchMesh);
        patchMaterials.push({
            material: patchMaterial,
            baseColor: new THREE.Color(patch.color || bodyColor)
        });
    });

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: createRadialGlowTexture(glowInner, glowOuter, 128),
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        fog: false
    }));
    glow.renderOrder = renderOrder;
    glow.scale.set(glowScale, glowScale, 1);
    markRaycastIgnored(glow);
    root.add(glow);

    return {
        root,
        glow,
        axialTiltGroup,
        mesh: surfaceGroup,
        phaseSphere,
        phaseMaterial,
        instancedMeshes: [],
        voxelMaterials: patchMaterials,
        bodyRadius: meshRadius,
        shadowFloor: darkFloor
    };
}

function createVoxelOrbitalBodyDisplay({
    bodyColor = 0xffffff,
    glowInner = 'rgba(255,255,255,0.98)',
    glowOuter = 'rgba(255,255,255,0)',
    glowScale = 12,
    meshRadius = 2,
    renderOrder = -899,
    axialTilt = 0,
    voxelSize = 0.32,
    darkFloor = 0.14,
    patches = []
} = {}) {
    const root = new THREE.Group();
    markRaycastIgnored(root);

    const axialTiltGroup = new THREE.Group();
    axialTiltGroup.rotation.z = Number(axialTilt || 0);
    markRaycastIgnored(axialTiltGroup);
    root.add(axialTiltGroup);

    const surfaceGroup = new THREE.Group();
    markRaycastIgnored(surfaceGroup);
    axialTiltGroup.add(surfaceGroup);

    const phaseMaterial = createCelestialPhaseMaterial(bodyColor, darkFloor);
    const phaseSphere = new THREE.Mesh(
        new THREE.SphereGeometry(meshRadius * 0.86, 18, 18),
        phaseMaterial
    );
    phaseSphere.renderOrder = renderOrder + 1;
    phaseSphere.frustumCulled = false;
    markRaycastIgnored(phaseSphere);
    surfaceGroup.add(phaseSphere);

    const cubeGeometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
    const materialMap = new Map();
    const matrixMap = new Map();
    const voxelMaterialEntries = [];
    const ensureMaterialKey = (color) => {
        const key = new THREE.Color(color).getHexString();
        if (!materialMap.has(key)) {
            const material = createCelestialPhaseMaterial(color, darkFloor);
            materialMap.set(key, material);
            matrixMap.set(key, []);
            voxelMaterialEntries.push({
                material,
                baseColor: new THREE.Color(color)
            });
        }
        return key;
    };

    const patchDefs = patches.map((patch) => ({
        color: patch.color || bodyColor,
        direction: new THREE.Vector3(
            Number((patch.position || [0, 0, 1])[0] || 0),
            Number((patch.position || [0, 0, 1])[1] || 0),
            Number((patch.position || [0, 0, 1])[2] || 1)
        ).normalize(),
        threshold: Number.isFinite(patch.threshold) ? patch.threshold : 0.82
    }));

    const baseMaterialKey = ensureMaterialKey(bodyColor);
    const gridRadius = Math.max(2, Math.ceil(meshRadius / voxelSize) + 1);
    for (let x = -gridRadius; x <= gridRadius; x += 1) {
        for (let y = -gridRadius; y <= gridRadius; y += 1) {
            for (let z = -gridRadius; z <= gridRadius; z += 1) {
                const localPosition = new THREE.Vector3(x * voxelSize, y * voxelSize, z * voxelSize);
                const distance = localPosition.length();
                if (distance < (meshRadius - voxelSize * 1.45) || distance > (meshRadius + voxelSize * 0.3)) continue;
                const normal = localPosition.clone().normalize();
                let materialKey = baseMaterialKey;
                for (const patch of patchDefs) {
                    if (normal.dot(patch.direction) >= patch.threshold) {
                        materialKey = ensureMaterialKey(patch.color);
                        break;
                    }
                }
                const matrix = new THREE.Matrix4();
                matrix.setPosition(localPosition);
                matrixMap.get(materialKey).push(matrix);
            }
        }
    }

    const instancedMeshes = [];
    matrixMap.forEach((matrices, key) => {
        const material = materialMap.get(key);
        const instanced = new THREE.InstancedMesh(cubeGeometry, material, matrices.length);
        matrices.forEach((matrix, index) => instanced.setMatrixAt(index, matrix));
        instanced.instanceMatrix.needsUpdate = true;
        instanced.renderOrder = renderOrder + 2;
        instanced.castShadow = true;
        instanced.receiveShadow = true;
        instanced.frustumCulled = false;
        markRaycastIgnored(instanced);
        surfaceGroup.add(instanced);
        instancedMeshes.push(instanced);
    });

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: createRadialGlowTexture(glowInner, glowOuter, 128),
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        fog: false
    }));
    glow.renderOrder = renderOrder;
    glow.scale.set(glowScale, glowScale, 1);
    markRaycastIgnored(glow);
    root.add(glow);

    return {
        root,
        glow,
        axialTiltGroup,
        mesh: surfaceGroup,
        phaseSphere,
        phaseMaterial,
        instancedMeshes,
        voxelMaterials: voxelMaterialEntries,
        bodyRadius: meshRadius,
        shadowFloor: darkFloor
    };
}

function createSkyOrbitalBodyDisplay({
    bodyColor = 0xffffff,
    glowInner = 'rgba(255,255,255,0.98)',
    glowOuter = 'rgba(255,255,255,0)',
    glowScale = 12,
    meshRadius = 2,
    renderOrder = -899,
    axialTilt = 0,
    patches = []
} = {}) {
    const display = createCelestialBodyVisual({
        radius: meshRadius,
        color: bodyColor,
        opacity: 0.96,
        renderOrder: renderOrder + 1,
        segments: 18,
        axialTilt
    });
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: createRadialGlowTexture(glowInner, glowOuter, 128),
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        fog: false
    }));
    glow.renderOrder = renderOrder;
    glow.scale.set(glowScale, glowScale, 1);
    markRaycastIgnored(glow);
    display.root.add(glow);
    patches.forEach((patch, index) => {
        const patchMesh = new THREE.Mesh(
            new THREE.SphereGeometry(meshRadius * Number(patch.radiusScale || 0.28), 12, 12),
            new THREE.MeshBasicMaterial({
                color: patch.color || 0xffffff,
                transparent: true,
                opacity: Number.isFinite(patch.opacity) ? patch.opacity : 0.92,
                depthWrite: false,
                fog: false
            })
        );
        const scale = patch.scale || [1, 0.55, 0.24];
        const position = patch.position || [0.45, 0.12, 0.42];
        const rotation = patch.rotation || [0, 0, 0];
        patchMesh.scale.set(scale[0], scale[1], scale[2]);
        patchMesh.position.set(
            meshRadius * position[0],
            meshRadius * position[1],
            meshRadius * position[2]
        );
        patchMesh.rotation.set(rotation[0], rotation[1], rotation[2]);
        patchMesh.renderOrder = renderOrder + 2 + index;
        markRaycastIgnored(patchMesh);
        display.mesh.add(patchMesh);
    });
    return {
        root: display.root,
        glow,
        axialTiltGroup: display.axialTiltGroup,
        mesh: display.mesh
    };
}

function updateOrbitalBodyLighting(display, sunDirection, eclipse = {}) {
    if (!display?.phaseMaterial || !display?.mesh || !sunDirection?.clone) return;

    // Ensure world matrix is fresh before extracting quaternions for lighting
    if (display.root) display.root.updateMatrixWorld(true);

    const worldQuaternion = new THREE.Quaternion();
    display.mesh.getWorldQuaternion(worldQuaternion);
    const localSunDirection = sunDirection.clone().normalize().applyQuaternion(worldQuaternion.invert());
    display.phaseMaterial.uniforms.uSunDirection.value.copy(localSunDirection);
    display.phaseMaterial.uniforms.uPenumbra.value = clamp01(eclipse.penumbra || 0);
    display.phaseMaterial.uniforms.uUmbra.value = clamp01(eclipse.umbra || 0);
    display.phaseMaterial.uniforms.uRedTint.value = clamp01(eclipse.redTint || 0);
    const eclipseDim = clamp01(1 - ((eclipse.penumbra || 0) * 0.35) - ((eclipse.umbra || 0) * 0.6));
    const redTint = clamp01(eclipse.redTint || 0);
    const shadowFloor = THREE.MathUtils.clamp(Number(display.shadowFloor || 0.2), 0.12, 0.5);
    if (Array.isArray(display.voxelMaterials)) {
        display.voxelMaterials.forEach((entry) => {
            if (!entry?.material || !entry?.baseColor) return;
            if (entry.material.uniforms && entry.material.uniforms.uSunDirection) {
                entry.material.uniforms.uSunDirection.value.copy(localSunDirection);
                entry.material.uniforms.uPenumbra.value = clamp01(eclipse.penumbra || 0);
                entry.material.uniforms.uUmbra.value = clamp01(eclipse.umbra || 0);
                entry.material.uniforms.uRedTint.value = clamp01(eclipse.redTint || 0);
            } else {
                entry.material.color.copy(entry.baseColor).multiplyScalar(Math.max(shadowFloor, eclipseDim));
                if (redTint > 0.001) {
                    entry.material.color.lerp(new THREE.Color(0x8b4335), redTint * 0.35);
                }
                entry.material.opacity = 0.92 + (eclipseDim * 0.06);
            }
        });
    }
}

function syncMovementStateFromController(nextState = {}) {
    moveForward = !!nextState.moveForward;
    moveBackward = !!nextState.moveBackward;
    moveLeft = !!nextState.moveLeft;
    moveRight = !!nextState.moveRight;
    canJump = !!nextState.canJump;
    if (velocity && nextState.velocity?.copy) velocity.copy(nextState.velocity);
    if (direction && nextState.direction?.copy) direction.copy(nextState.direction);
    if (nextState.inputState) {
        inputState.forward = Number(nextState.inputState.forward || 0);
        inputState.backward = Number(nextState.inputState.backward || 0);
        inputState.left = Number(nextState.inputState.left || 0);
        inputState.right = Number(nextState.inputState.right || 0);
        inputState.jump = !!nextState.inputState.jump;
        inputState.sprint = !!nextState.inputState.sprint;
        inputState.lookX = Number(nextState.inputState.lookX || 0);
        inputState.lookY = Number(nextState.inputState.lookY || 0);
    }
    if (nextState.lookInputState) {
        lookInputState.pointerId = nextState.lookInputState.pointerId ?? null;
        lookInputState.lastX = Number(nextState.lookInputState.lastX || 0);
        lookInputState.lastY = Number(nextState.lookInputState.lastY || 0);
        lookInputState.deltaX = Number(nextState.lookInputState.deltaX || 0);
        lookInputState.deltaY = Number(nextState.lookInputState.deltaY || 0);
    }
    playerYaw = Number(nextState.playerYaw || 0);
    playerPitch = Number(nextState.playerPitch || 0);
    lookTargetYaw = Number(nextState.lookTargetYaw || 0);
    lookTargetPitch = Number(nextState.lookTargetPitch || 0);
    localPlayerWalkPhase = Number(nextState.localPlayerWalkPhase || 0);
    localPlayerWalkBlend = Number(nextState.localPlayerWalkBlend || 0);
    lastFootstepAtMs = Number(nextState.lastFootstepAtMs || 0);
    publishMovementDebugState();
}

function publishMovementDebugState() {
    if (typeof window === "undefined") return;
    window.__ASCraftMovementDebug = () => ({
        currentRoomId,
        roomShellReady: !!roomShellGroup,
        outdoorReady: !!outdoorTerrainGroup,
        playerViewMode,
        activeCelestialBody,
        playerPosition: playerWorldPosition ? {
            x: Number(playerWorldPosition.x || 0),
            y: Number(playerWorldPosition.y || 0),
            z: Number(playerWorldPosition.z || 0)
        } : null,
        spawnPersistenceEnabled,
        lastSavedSpawn: lastSavedSpawnState,
        collisionWorldStats: collisionBroadphase?.getStats?.() ?? null,
        inputState: {
            forward: Number(inputState.forward || 0),
            backward: Number(inputState.backward || 0),
            left: Number(inputState.left || 0),
            right: Number(inputState.right || 0),
            jump: !!inputState.jump,
            sprint: !!inputState.sprint
        },
        movementState: movementController?.state ? {
            canJump: !!movementController.state.canJump,
            isMoving: !!movementController.state.isMoving,
            interpolationAlpha: Number(movementController.state.interpolationAlpha || 0),
            insideRoomVolumeLatch: !!movementController.state.insideRoomVolumeLatch,
            currentFace: movementController.state.currentCubeFace || null,
            faceTransitionCount: Number(movementController.state.faceTransitionCount || 0),
            surfaceMode: movementController.state.debugSurfaceMode || null,
            collisionFlags: movementController.state.debugCollisionFlags || null,
            support: movementController.state.debugLastSupport || null,
            pressedKeys: Array.from(movementController.state.pressedKeys || []),
            velocity: movementController.state.velocity ? {
                x: Number(movementController.state.velocity.x || 0),
                y: Number(movementController.state.velocity.y || 0),
                z: Number(movementController.state.velocity.z || 0)
            } : null
        } : null,
        chunkQueueByFace: summarizeOutdoorChunkQueueByFace()
    });
    window.__ASCraftTerrainDebug = (points = null) => buildPlanetSurfaceProbe(points);
}

function snapToVoxel(value, step = VOXEL_SIZE) {
    return Math.round(value / step) * step;
}

function snapVectorToVoxel(vec, step = VOXEL_SIZE) {
    return new THREE.Vector3(
        snapToVoxel(vec.x, step),
        snapToVoxel(vec.y, step),
        snapToVoxel(vec.z, step)
    );
}

function snapNormalToVoxelFace(normal) {
    const safeNormal = normal?.clone?.();
    if (!safeNormal || safeNormal.lengthSq() < 1e-6) {
        return new THREE.Vector3(0, 1, 0);
    }
    safeNormal.normalize();
    const absX = Math.abs(safeNormal.x);
    const absY = Math.abs(safeNormal.y);
    const absZ = Math.abs(safeNormal.z);
    if (absX >= absY && absX >= absZ) {
        return new THREE.Vector3(Math.sign(safeNormal.x) || 1, 0, 0);
    }
    if (absY >= absX && absY >= absZ) {
        return new THREE.Vector3(0, Math.sign(safeNormal.y) || 1, 0);
    }
    return new THREE.Vector3(0, 0, Math.sign(safeNormal.z) || 1);
}

function getHitWorldVoxelNormal(hit) {
    if (!hit?.face?.normal || !hit?.object?.matrixWorld) {
        return new THREE.Vector3(0, 1, 0);
    }
    return snapNormalToVoxelFace(
        hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
    );
}

function getAdjacentVoxelPlacementPoint(point, normal) {
    const faceNormal = snapNormalToVoxelFace(normal);
    return snapVectorToVoxel(point.clone().addScaledVector(faceNormal, (VOXEL_SIZE * 0.5) + 0.001));
}

function getOutdoorTerrainCellKey(x, z) {
    return `${Math.round(x)}|${Math.round(z)}`;
}

function getOutdoorAnchorKey(x, y, z) {
    return `${snapToVoxel(x)}|${snapToVoxel(y)}|${snapToVoxel(z)}`;
}

function addOutdoorGeneratedTreeAnchor(x, y, z, options = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    const key = getOutdoorAnchorKey(x, y, z);
    if (options.blossom) {
        outdoorGeneratedBlossomAnchorKeys.add(key);
    } else {
        outdoorGeneratedTreeAnchorKeys.add(key);
    }
}

function clearOutdoorGeneratedTreeAnchors() {
    outdoorGeneratedTreeAnchorKeys.clear();
    outdoorGeneratedBlossomAnchorKeys.clear();
}

function parseOutdoorAnchorKey(key = '') {
    const parts = String(key || '').split('|');
    if (parts.length !== 3) return null;
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    const z = Number(parts[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return new THREE.Vector3(x, y, z);
}

function sampleAnchorVectors(vectors = [], maxCount = 1200) {
    if (!Array.isArray(vectors) || vectors.length <= maxCount) return vectors;
    const sampled = [];
    const stride = vectors.length / maxCount;
    for (let i = 0; i < maxCount; i += 1) {
        sampled.push(vectors[Math.floor(i * stride)]);
    }
    return sampled;
}

function collectOutdoorGeneratedTreeAnchors() {
    const treeAnchors = [];
    const blossomAnchors = [];
    outdoorGeneratedTreeAnchorKeys.forEach((key) => {
        const parsed = parseOutdoorAnchorKey(key);
        if (parsed) treeAnchors.push(parsed);
    });
    outdoorGeneratedBlossomAnchorKeys.forEach((key) => {
        const parsed = parseOutdoorAnchorKey(key);
        if (parsed) blossomAnchors.push(parsed);
    });
    return {
        treeAnchors: sampleAnchorVectors(treeAnchors, 1400),
        blossomAnchors: sampleAnchorVectors(blossomAnchors, 1800)
    };
}

function getOutdoorSnowCellLayerCount(x, z) {
    return outdoorSnowCoverByCell.get(getOutdoorTerrainCellKey(x, z)) || 0;
}

function setOutdoorSnowCellLayerCount(x, z, layers) {
    const key = getOutdoorTerrainCellKey(x, z);
    const nextLayers = THREE.MathUtils.clamp(Math.round(layers), 0, SNOW_MAX_LAYERS);
    if (nextLayers <= 0) {
        const existed = outdoorSnowCoverByCell.has(key);
        outdoorSnowCoverByCell.delete(key);
        return existed;
    }
    if (outdoorSnowCoverByCell.get(key) === nextLayers) return false;
    outdoorSnowCoverByCell.set(key, nextLayers);
    return true;
}

function setOutdoorSakuraCellLayerCount(x, z, layers) {
    const key = getOutdoorTerrainCellKey(x, z);
    const nextLayers = THREE.MathUtils.clamp(Math.round(layers), 0, SNOW_MAX_LAYERS);
    if (nextLayers <= 0) {
        const existed = outdoorSakuraCoverByCell.has(key);
        outdoorSakuraCoverByCell.delete(key);
        return existed;
    }
    if (outdoorSakuraCoverByCell.get(key) === nextLayers) return false;
    outdoorSakuraCoverByCell.set(key, nextLayers);
    return true;
}

function setOutdoorAutumnLeafCellLayerCount(x, z, layers) {
    const key = getOutdoorTerrainCellKey(x, z);
    const nextLayers = THREE.MathUtils.clamp(Math.round(layers), 0, SNOW_MAX_LAYERS);
    if (nextLayers <= 0) {
        const existed = outdoorAutumnLeafCoverByCell.has(key);
        outdoorAutumnLeafCoverByCell.delete(key);
        return existed;
    }
    if (outdoorAutumnLeafCoverByCell.get(key) === nextLayers) return false;
    outdoorAutumnLeafCoverByCell.set(key, nextLayers);
    return true;
}

function getOutdoorPolarSnowCellLayerCount(x, z) {
    return outdoorPolarSnowBaseByCell.get(getOutdoorTerrainCellKey(x, z)) || 0;
}

function setOutdoorPolarSnowCellLayerCount(x, z, layers) {
    const key = getOutdoorTerrainCellKey(x, z);
    const nextLayers = THREE.MathUtils.clamp(Math.round(layers), 0, SNOW_MAX_LAYERS);
    if (nextLayers <= 0) {
        const existed = outdoorPolarSnowBaseByCell.has(key);
        outdoorPolarSnowBaseByCell.delete(key);
        return existed;
    }
    if (outdoorPolarSnowBaseByCell.get(key) === nextLayers) return false;
    outdoorPolarSnowBaseByCell.set(key, nextLayers);
    return true;
}

function getOutdoorCombinedSnowLayers(x, z) {
    return Math.max(
        getOutdoorSnowCellLayerCount(x, z),
        getOutdoorPolarSnowCellLayerCount(x, z)
    );
}

function isLakeCell(x, z, margin = 0.5) {
    const dx = Number(x || 0) - LAKE_CENTER_X;
    const dz = Number(z || 0) - LAKE_CENTER_Z;
    return Math.hypot(dx, dz) <= (LAKE_RADIUS + Math.max(0, Number(margin || 0)));
}

function isEarthLaunchPadFootprintCell(x, z, margin = 1) {
    const safeMargin = Math.max(0, Number(margin || 0));
    const anchor = getEarthLaunchPadAnchor();
    const relX = Number(x || 0) - Number(anchor.x || 0);
    const relZ = Number(z || 0) - Number(anchor.z || 0);
    const onDeck = Math.abs(relX) <= (4 + safeMargin) && Math.abs(relZ) <= (4 + safeMargin);
    const onApproach = Math.abs(relX) <= (3 + safeMargin) && relZ <= (-6 + safeMargin) && relZ >= (-15 - safeMargin);
    return onDeck || onApproach;
}

function isOutdoorSnowBlockedCell(x, z) {
    if (!isEarthSurfaceSampleInsideRadius(x, z, 0.5)) return true;
    if (isRiverCell(x, z) || isLakeCell(x, z, 1.5)) return true;
    if (isRoomClearanceCell(x, z) || isRoomApronCell(x, z)) return true;
    if (isEntryTunnelCell(x, getEntryTunnelFloorY(), z)) return true;
    if (isEarthLaunchPadFootprintCell(x, z, 1.5)) return true;
    return false;
}

function getOutdoorSnowVisualSupportY(x, z) {
    if (isEntryTunnelCell(x, getEntryTunnelFloorY(), z)) {
        return getEntryTunnelFloorY();
    }
    if (isRoomApronCell(x, z) && !isRoomClearanceCell(x, z)) {
        return getSchoolPatioFloorY();
    }
    const visualSurfaceY = getEarthVisualSurfaceY(x, z);
    return Number.isFinite(visualSurfaceY) ? snapToVoxel(visualSurfaceY) : null;
}

function getDynamicRiverHalfWidth(x) {
    const widthBias = Math.abs(Math.sin(x * 0.052)) * 0.4;
    return RIVER_HALF_WIDTH + Math.round(outdoorRiverExpansionLevel) + widthBias;
}

function getOutdoorTerrainVoxelKey(x, y, z) {
    return `${snapToVoxel(x)}|${snapToVoxel(y)}|${snapToVoxel(z)}`;
}

function getEffectiveRecessMode() {
    return recessModeActive || autoRecessNoTeacher;
}

function getEffectiveCreativeModeForStudent() {
    return !isTeacher && getEffectiveRecessMode();
}

function isAutoRecessActive() {
    return !isTeacher && autoRecessNoTeacher;
}

function getDoorShouldBeOpen(roomDoorOpen = false) {
    return !!roomDoorOpen || getEffectiveRecessMode();
}

function isRecessVirtualInventoryActive() {
    return getEffectiveCreativeModeForStudent();
}

function getActiveItemsLibrary() {
    if (!USE_VOXEL_PLANET_ITEMS_HYBRID) return ITEMS_LIBRARY;
    return ITEMS_LIBRARY.filter((item) => {
        const category = String(item?.category || '').trim().toLowerCase();
        return category === 'build' || category === 'furniture' || category === 'decor';
    });
}

function hasActiveInventoryItems(items = []) {
    const activeIds = new Set(getActiveItemsLibrary().map((item) => normalizeInventoryItemId(item.id)).filter(Boolean));
    return Array.isArray(items) && items.some((entry) => activeIds.has(normalizeInventoryItemId(entry?.itemId)));
}

function getRecessBuildCatalog() {
    return getActiveItemsLibrary().slice();
}

function getEffectiveGroupedInventory() {
    if (!isRecessVirtualInventoryActive()) return groupedInventory;
    return getRecessBuildCatalog().map((item) => ({
        itemId: item.id,
        count: 999,
        items: [{ itemId: item.id, docId: null, virtual: true }]
    }));
}

function isProtectedOutdoorDestructionVoxel(x, y, z) {
    const roomFloorY = Math.floor(getRoomWorldFloorY());
    const roomCeilingY = Math.ceil(getRoomWorldCeilingY());
    if (isVolleyballCourtCell(x, z)) return true;
    if (isSoccerFieldCell(x, z)) return true;
    if (isRoomApronCell(x, z) && y >= (roomFloorY - 1) && y <= (roomFloorY + 2)) return true;
    if (isRoomClearanceCell(x, z) && y >= (roomFloorY - 2) && y <= (roomCeilingY + 2)) return true;
    return false;
}

function getOutdoorVoxelFromTerrainHit(point, normal = null) {
    if (!point) return null;
    const safeNormal = normal?.clone?.();
    const offset = (safeNormal && safeNormal.lengthSq() > 1e-6)
        ? safeNormal.normalize().multiplyScalar(0.05)
        : new THREE.Vector3(0, 0, 0);
    const sample = point.clone().sub(offset);
    return new THREE.Vector3(
        snapToVoxel(sample.x),
        snapToVoxel(sample.y),
        snapToVoxel(sample.z)
    );
}

function ensurePlayerWorldPosition() {
    if (!playerWorldPosition) {
        playerWorldPosition = new THREE.Vector3(0, PLAYER_EYE_HEIGHT, 0);
    }
    return playerWorldPosition;
}

function isThirdPersonViewMode() {
    return playerViewMode === 'third' || playerViewMode === 'third_front';
}

function getCrosshairViewportAnchorY(mode = playerViewMode) {
    return CROSSHAIR_SCREEN_ANCHORS[mode] ?? CROSSHAIR_SCREEN_ANCHORS.first;
}

function getCrosshairNdcY(mode = playerViewMode) {
    const anchorY = getCrosshairViewportAnchorY(mode);
    return 1 - (anchorY * 2);
}

function isLocalAvatarObject(object) {
    let current = object;
    while (current) {
        if (current === localPlayerMesh) return true;
        current = current.parent;
    }
    return false;
}

function configureCrosshairRaycaster(targetRaycaster) {
    const activeRaycaster = targetRaycaster || raycaster || new THREE.Raycaster();
    activeRaycaster.camera = camera;
    activeRaycaster.setFromCamera(new THREE.Vector2(0, getCrosshairNdcY()), camera);
    activeRaycaster.near = 0;
    activeRaycaster.far = 1000;
    return activeRaycaster;
}

function getLobbySpawnPosition() {
    return new THREE.Vector3(
        LOBBY_SPAWN_X,
        getRoomWorldFloorY() + PLAYER_EYE_HEIGHT + 0.5,
        LOBBY_SPAWN_Z
    );
}

function getEarthSurfaceAnchorY(x = 0, z = 0) {
    const state = getCubeSurfaceState(new THREE.Vector3(snapToVoxel(x), 0, snapToVoxel(z)), lastEarthSurfaceFaceHint);
    return Number.isFinite(state?.projectedSurfacePoint?.y) ? snapToVoxel(state.projectedSurfacePoint.y) : 0;
}

function isEarthSurfaceSampleInsideRadius(x, z, padding = 0) {
    const sampleX = Math.abs(snapToVoxel(x));
    const sampleZ = Math.abs(snapToVoxel(z));
    const safePadding = Math.max(0, Number(padding || 0));
    const limit = Math.max(0, OUTDOOR_WORLD_RADIUS - safePadding);
    const insideCubic = Math.max(sampleX, sampleZ) <= limit;
    if (!insideCubic) return false;
    if (outdoorTopSolidVoxelYByCell.size > 0) {
        const cachedY = getOutdoorTopSolidVoxelYFromCache(sampleX, sampleZ);
        return Number.isFinite(cachedY) || insideCubic;
    }
    return insideCubic;
}

function getClampedEarthSurfaceSample(x, z, padding = 0) {
    const safePadding = Math.max(0, Number(padding || 0));
    const limit = Math.max(1, OUTDOOR_WORLD_RADIUS - safePadding);
    const sampleX = snapToVoxel(x);
    const sampleZ = snapToVoxel(z);
    const distanceCubic = Math.max(Math.abs(sampleX), Math.abs(sampleZ));

    if (distanceCubic <= limit) {
        return { x: sampleX, z: sampleZ, clamped: false };
    }

    const scale = limit / distanceCubic;
    return {
        x: snapToVoxel(sampleX * scale),
        z: snapToVoxel(sampleZ * scale),
        clamped: true
    };
}

function getRoomWorldOriginY() {
    return getEarthSurfaceAnchorY(0, 0) + ROOM_WORLD_OFFSET_Y;
}

function getRoomAnchorSurfaceY() {
    return getRoomWorldOriginY();
}

function normalizeLegacyRoomItemY(data = null) {
    if (!data) return data;
    const normalized = { ...data };
    if (shouldApplyRoomWorldOffsetToPlacement(normalized) && Number(normalized.y || 0) < -2) {
        normalized.y = snapToVoxel(Number(normalized.y || 0) - LEGACY_ROOM_WORLD_OFFSET_Y);
    }
    return normalized;
}

function getRoomWorldFloorY() {
    return ROOM_FLOOR_Y + getRoomWorldOriginY();
}

function getRoomWorldCeilingY() {
    return getRoomWorldFloorY() + ROOM_HEIGHT;
}

function shouldApplyRoomWorldOffsetToPlacement(data = null) {
    if (!data || data.terrain || data.structure === 'room_shell') return false;
    const x = Number(data.x || 0);
    const y = Number(data.y || 0);
    const z = Number(data.z || 0);
    return Math.abs(x) <= (ROOM_WIDTH * 0.5 + 1.25)
        && Math.abs(z) <= (ROOM_DEPTH * 0.5 + 1.75)
        && y >= (ROOM_FLOOR_Y - 4)
        && y <= (ROOM_HEIGHT + 6);
}

function getPlacedItemWorldYOffset(data = null) {
    return shouldApplyRoomWorldOffsetToPlacement(data) ? getRoomWorldOriginY() : 0;
}

function getPlayerSpawnPosition() {
    const preferred = getSafeOutdoorSpawnState(getPreferredSpawnState());
    return new THREE.Vector3(
        Number(preferred.x || 0),
        Number(preferred.y || (getRoomWorldFloorY() + PLAYER_EYE_HEIGHT + 0.5)),
        Number(preferred.z || 0)
    );
}

function isPlayerInsideRoomVolume(position = null) {
    if (movementController?.state?.insideRoomVolumeLatch) return true;
    const sample = position || playerWorldPosition || ensurePlayerWorldPosition();
    if (!sample) return false;
    return isPositionInsideRoomBounds(sample);
}

function isPositionInsideRoomBounds(position = null) {
    const sample = position || playerWorldPosition || ensurePlayerWorldPosition();
    if (!sample) return false;
    return Math.abs(Number(sample.x || 0)) <= (ROOM_WIDTH * 0.5 - 0.6)
        && Math.abs(Number(sample.z || 0)) <= (ROOM_DEPTH * 0.5 - 0.6)
        && Number(sample.y || 0) >= (getRoomWorldFloorY() + PLAYER_EYE_HEIGHT - 2.3)
        && Number(sample.y || 0) <= (getRoomWorldCeilingY() + PLAYER_EYE_HEIGHT + 2.2);
}

function isOutdoorWeatherBlockedByClassroom(x, z, margin = 2.5) {
    return Math.abs(Number(x || 0)) <= ((ROOM_WIDTH * 0.5) + margin)
        && Math.abs(Number(z || 0)) <= ((ROOM_DEPTH * 0.5) + margin);
}

function applyPlayerSpawnState(state = null, options = {}) {
    const nextState = getSafeOutdoorSpawnState(state || getPreferredSpawnState());
    const persistSpawn = options.persist !== false;
    const spawn = new THREE.Vector3(
        Number(nextState.x || 0),
        Number(nextState.y || (getRoomWorldFloorY() + PLAYER_EYE_HEIGHT + 0.5)),
        Number(nextState.z || 0)
    );
    if (nextState.activeCelestialBody === 'space') {
        activeCelestialBody = 'space';
        currentSpaceBodyId = String(nextState.currentSpaceBodyId || currentSpaceBodyId || 'moon');
    } else {
        activeCelestialBody = 'earth';
    }
    ensurePlayerWorldPosition().copy(spawn);
    if (camera) camera.position.copy(spawn);
    if (velocity) velocity.set(0, 0, 0);
    lastAnimationTimeMs = 0;
    canJump = true;
    playerYaw = Number(nextState.playerYaw || 0);
    playerPitch = Number(nextState.playerPitch || 0);
    lookTargetYaw = playerYaw;
    lookTargetPitch = playerPitch;
    if (camera) {
        camera.rotation.order = 'YXZ';
        camera.rotation.set(0, 0, 0);
    }
    if (movementController?.state) {
        movementController.state.velocity?.set?.(0, 0, 0);
        movementController.state.direction?.set?.(0, 0, 0);
        movementController.state.canJump = true;
        movementController.state.isMoving = false;
        movementController.state.playerYaw = playerYaw;
        movementController.state.playerPitch = playerPitch;
        movementController.state.lookTargetYaw = lookTargetYaw;
        movementController.state.lookTargetPitch = lookTargetPitch;
        movementController.state.previousSimPosition?.copy?.(spawn);
        movementController.state.currentSimPosition?.copy?.(spawn);
        movementController.state.renderPosition?.copy?.(spawn);
        movementController.state.interpolationAlpha = 1;
        if (movementController.state.lookInputState) {
            movementController.state.lookInputState.deltaX = 0;
            movementController.state.lookInputState.deltaY = 0;
        }
        syncMovementStateFromController(movementController.state);
    }
    if (persistSpawn) {
        saveCurrentSpawnState(true);
    }
}

function resetPlayerToLobbySpawn(options = {}) {
    applyPlayerSpawnState(getDefaultSpawnState('earth', 'earth'), options);
}

function resetPlayerToPreferredSpawn(options = {}) {
    applyPlayerSpawnState(getPreferredSpawnState(), options);
}

function ensureAudioContext() {
    if (audioContext) return audioContext;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    audioContext = new AudioCtor();
    return audioContext;
}

function playSynthSound({ type = 'step', intensity = 1 } = {}) {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => { });

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = type === 'destroy' ? 'bandpass' : 'highpass';
    filter.frequency.value = type === 'place' ? 2200 : type === 'destroy' ? 260 : 1400;
    filter.Q.value = type === 'destroy' ? 1.6 : 0.8;

    const noiseBuffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * (type === 'destroy' ? 0.18 : 0.05))), ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (type === 'destroy' ? 0.9 : 0.35);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const osc = ctx.createOscillator();
    osc.type = type === 'destroy' ? 'sawtooth' : type === 'place' ? 'triangle' : 'triangle';
    osc.frequency.value = type === 'destroy' ? 92 : type === 'place' ? 760 : (footstepToggle ? 212 : 176);
    const baseGain = type === 'destroy' ? 0.22 : type === 'place' ? 0.09 : 0.09;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, baseGain * intensity), now + 0.01);
    gain.gain.exponentialRampToValueAtTime(type === 'destroy' ? Math.max(0.0002, baseGain * intensity * 0.46) : 0.0001, now + (type === 'destroy' ? 0.07 : 0.05));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (type === 'destroy' ? 0.34 : type === 'place' ? 0.12 : 0.08));

    osc.connect(filter);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    osc.start(now);
    osc.stop(now + (type === 'destroy' ? 0.36 : type === 'place' ? 0.14 : 0.1));
    noise.stop(now + (type === 'destroy' ? 0.36 : type === 'place' ? 0.14 : 0.1));
    footstepToggle = !footstepToggle;
}

function playStepSound(intensity = 1) {
    playSynthSound({ type: 'step', intensity });
}

function playPlaceSound() {
    playSynthSound({ type: 'place', intensity: 0.9 });
}

function playDestroySound() {
    playSynthSound({ type: 'destroy', intensity: 1 });
}

function startDiggingLoopSound() {
    playPlaceSound();
}

function stopDiggingLoopSound() {
    // Left empty since we use discrete one-shot sounds now instead of continuous loops.
}

function setPlayerViewMode(mode) {
    const normalizedMode = PLAYER_VIEW_MODES.includes(mode) ? mode : 'first';
    playerViewMode = normalizedMode;
    try {
        localStorage.setItem('minebloxViewMode', playerViewMode);
    } catch (_) { }
    const btn = document.getElementById('viewModeBtn');
    if (btn) {
        const nextMode = playerViewMode === 'first'
            ? 'third'
            : playerViewMode === 'third'
                ? 'third_front'
                : 'first';
        const nextLabel = nextMode === 'first'
            ? '1ª Persona'
            : nextMode === 'third'
                ? '3ª Trasera'
                : '3ª Frontal';
        btn.querySelector('.mineblox-action-label').textContent = nextLabel;
        btn.title = `Cambiar a ${nextLabel}`;
        btn.setAttribute('aria-label', btn.title);
    }
    updateCrosshairByViewMode();
}

function togglePlayerViewMode() {
    const nextMode = playerViewMode === 'first'
        ? 'third'
        : playerViewMode === 'third'
            ? 'third_front'
            : 'first';
    setPlayerViewMode(nextMode);
}

function updateCrosshairByViewMode() {
    const crosshair = uiContainer?.querySelector?.('.mineblox-crosshair');
    if (!crosshair) return;
    crosshair.style.top = `${Math.round(getCrosshairViewportAnchorY() * 100)}%`;
}

function getStableProjectedForward(upVector, directionHint) {
    const up = upVector.clone().normalize();
    const candidates = [
        directionHint?.clone?.() || new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, -1, 0)
    ];
    for (const candidate of candidates) {
        const forward = candidate.projectOnPlane(up);
        if (forward.lengthSq() > 1e-6) {
            return forward.normalize();
        }
    }
    return new THREE.Vector3(0, 0, -1);
}

function orientGroupToSurfaceNormal(group, surfaceNormal, directionHint = null, yawOffset = 0) {
    if (!group || !surfaceNormal) return;
    const up = surfaceNormal.clone().normalize();
    const forward = getStableProjectedForward(up, directionHint?.clone?.() || new THREE.Vector3(0, 0, -1));
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();
    const basis = new THREE.Matrix4().makeBasis(right, up, forward.clone().multiplyScalar(-1));
    group.quaternion.setFromRotationMatrix(basis);
    if (yawOffset) {
        group.rotateOnAxis(up, yawOffset);
    }
}

function orientGroupUpright(group, directionHint = null, yawOffset = 0) {
    if (!group) return;
    const heading = (directionHint?.clone?.() || new THREE.Vector3(0, 0, 1));
    heading.y = 0;
    if (heading.lengthSq() < 1e-6) {
        heading.set(0, 0, 1);
    } else {
        heading.normalize();
    }
    const yaw = Math.atan2(heading.x, heading.z) + yawOffset;
    group.quaternion.setFromEuler(new THREE.Euler(0, yaw, 0));
}

let cameraLookTarget = null;

function applyCameraOrientation(cam, lookDirection, upVector) {
    if (!cameraLookTarget) cameraLookTarget = new cam.position.constructor();
    const up = (upVector?.clone?.() || new THREE.Vector3(0, 1, 0)).normalize();
    const forward = (lookDirection?.clone?.() || new THREE.Vector3(0, 0, -1)).normalize();
    if (forward.lengthSq() < 1e-6) {
        forward.set(0, 0, -1);
    }
    if (Math.abs(forward.dot(up)) > 0.999) {
        forward.copy(getStableProjectedForward(up, forward));
    }
    cam.up.copy(up);
    cameraLookTarget.copy(cam.position).add(forward);
    cam.lookAt(cameraLookTarget);
    cam.up.copy(up);
}

function updateLocalPlayerAvatar(worldPos, upVector, facingForward, moving = false, movementState = null) {
    if (!localPlayerMesh) return;
    const desiredAvatarId = playerConfig.avatarId || 'boy_basic';
    if (localPlayerMesh.userData.avatarId !== desiredAvatarId) {
        const currentVisible = localPlayerMesh.visible;
        scene.remove(localPlayerMesh);
        localPlayerMesh = createVoxelPlayerModel(desiredAvatarId, playerConfig.name || '');
        localPlayerMesh.visible = currentVisible;
        scene.add(localPlayerMesh);
    }
    localPlayerMesh.userData.avatarId = desiredAvatarId;
    localPlayerMesh.visible = playerViewMode === 'third' || playerViewMode === 'third_front';
    if (!localPlayerMesh.visible) return;
    const bodyPos = worldPos.clone()
        .sub(upVector.clone().multiplyScalar(PLAYER_EYE_HEIGHT))
        .add(upVector.clone().multiplyScalar(PLAYER_MODEL_BASE_OFFSET));
    const walkBlend = movementState?.localPlayerWalkBlend ?? localPlayerWalkBlend;
    const walkPhase = movementState?.localPlayerWalkPhase ?? localPlayerWalkPhase;
    const isSwimming = movementState?.isSwimming === true;
    const walkBob = walkBlend > 0.01
        ? Math.sin(walkPhase * (isSwimming ? 1.4 : 2)) * walkBlend * (isSwimming ? 0.028 : 0.058)
        : 0;
    localPlayerMesh.position.copy(bodyPos).add(upVector.clone().multiplyScalar(walkBob));
    localPlayerMesh.userData.currentName = playerConfig.name || '';
    // Align avatar body to the active local surface normal (cube faces on Earth, radial on space bodies).
    const avatarUp = (upVector?.clone?.() || getPlanetSurfaceNormal(worldPos, getPlanetBlend(worldPos)) || new THREE.Vector3(0, 1, 0)).normalize();
    const avatarForward = getStableProjectedForward(avatarUp, facingForward?.clone?.() || new THREE.Vector3(0, 0, -1));
    let avatarRight = new THREE.Vector3().crossVectors(avatarUp, avatarForward);
    if (avatarRight.lengthSq() < 1e-6) {
        avatarRight = getStableProjectedForward(avatarUp, new THREE.Vector3(1, 0, 0));
    }
    avatarRight.normalize();
    const orthoForward = new THREE.Vector3().crossVectors(avatarRight, avatarUp).normalize();
    const avatarBasis = new THREE.Matrix4().makeBasis(avatarRight, avatarUp, orthoForward);
    localPlayerMesh.quaternion.setFromRotationMatrix(avatarBasis);
    if (isSwimming) {
        const swimPitchQuat = new THREE.Quaternion().setFromAxisAngle(avatarRight, -Math.PI * 0.42);
        localPlayerMesh.quaternion.multiply(swimPitchQuat);
        localPlayerMesh.position.addScaledVector(avatarUp, -0.18);
    }
    if (localPlayerMesh.userData.limbs) {
        const cycle = Math.sin(walkPhase * (isSwimming ? 1.7 : 1));
        if (isSwimming) {
            const armStroke = 0.48 + (walkBlend * 0.36);
            const legKick = 0.24 + (walkBlend * 0.22);
            localPlayerMesh.userData.limbs.leftArm.rotation.x = -0.72 + (cycle * armStroke);
            localPlayerMesh.userData.limbs.rightArm.rotation.x = -0.72 - (cycle * armStroke);
            localPlayerMesh.userData.limbs.leftLeg.rotation.x = 0.18 - (cycle * legKick);
            localPlayerMesh.userData.limbs.rightLeg.rotation.x = 0.18 + (cycle * legKick);
        } else {
            const swing = moving ? (0.16 + walkBlend * 0.82) : 0.06;
            localPlayerMesh.userData.limbs.leftArm.rotation.x = cycle * swing;
            localPlayerMesh.userData.limbs.rightArm.rotation.x = -cycle * swing;
            localPlayerMesh.userData.limbs.leftLeg.rotation.x = -cycle * swing;
            localPlayerMesh.userData.limbs.rightLeg.rotation.x = cycle * swing;
        }
    }
}

function quantizeQuarterTurn(angle) {
    const step = Math.PI / 2;
    return Math.round(angle / step) * step;
}

function makeVoxelKey(x, y, z) {
    return `${x}|${y}|${z}`;
}

function syncSolidWorldVoxelKeys() {
    solidWorldVoxelKeys = new Set([
        ...outdoorWorldVoxelKeys,
        ...moonWorldVoxelKeys
    ]);
}

function getOutdoorTopSolidVoxelYFromCache(x, z) {
    return outdoorTopSolidVoxelYByCell.get(getOutdoorTerrainCellKey(snapToVoxel(x), snapToVoxel(z))) ?? null;
}

function isSolidOutdoorWorldVoxelAt(x, y, z) {
    const key = makeVoxelKey(
        snapToVoxel(x),
        snapToVoxel(y),
        snapToVoxel(z)
    );
    if (outdoorTerrainRemovedVoxelKeys.has(key)) return false;
    return outdoorWorldVoxelKeys.has(key);
}

function syncOutdoorTopSolidVoxelCacheFromBlocks(blocks = [], reset = false) {
    if (reset) {
        outdoorTopSolidVoxelYByCell.clear();
    }
    blocks.forEach((block) => {
        if (isNonSolidWorldVoxelItem(block.itemId)) return;
        const cellKey = getOutdoorTerrainCellKey(block.x, block.z);
        const topY = snapToVoxel(block.y);
        const previousY = outdoorTopSolidVoxelYByCell.get(cellKey);
        if (!Number.isFinite(previousY) || topY > previousY) {
            outdoorTopSolidVoxelYByCell.set(cellKey, topY);
        }
    });
}

function rebuildOutdoorTopSolidVoxelCacheForCell(x, z) {
    const cellX = snapToVoxel(x);
    const cellZ = snapToVoxel(z);
    const cellKey = getOutdoorTerrainCellKey(cellX, cellZ);
    let nextTopY = null;
    for (let y = 8; y >= ((-OUTDOOR_WORLD_RADIUS * 2) - 8); y -= 1) {
        if (isSolidOutdoorWorldVoxelAt(cellX, y, cellZ)) {
            nextTopY = snapToVoxel(y);
            break;
        }
    }
    if (Number.isFinite(nextTopY)) {
        outdoorTopSolidVoxelYByCell.set(cellKey, nextTopY);
        return nextTopY;
    }
    outdoorTopSolidVoxelYByCell.delete(cellKey);
    return null;
}

function isNonSolidWorldVoxelItem(itemId) {
    return isWaterWorldVoxelItem(itemId)
        || itemId === 'lava_block'
        || itemId === 'snow_block'
        || itemId === 'flower_red'
        || itemId === 'flower_yellow';
}

function isWaterWorldVoxelItem(itemId) {
    return itemId === 'water_block' || itemId === 'water_still';
}

function isWaterWorldVoxelAt(x, y, z) {
    const key = makeVoxelKey(
        snapToVoxel(x),
        snapToVoxel(y),
        snapToVoxel(z)
    );
    return waterWorldVoxelKeys.has(key);
}

function registerVoxelBlockKeys(targetSet, blocks = []) {
    targetSet.clear();
    if (targetSet === outdoorWorldVoxelKeys) {
        waterWorldVoxelKeys.clear();
    }
    blocks.forEach((block) => {
        const key = makeVoxelKey(
            snapToVoxel(block.x),
            snapToVoxel(block.y),
            snapToVoxel(block.z)
        );
        if (targetSet === outdoorWorldVoxelKeys && isWaterWorldVoxelItem(block.itemId)) {
            waterWorldVoxelKeys.add(key);
        }
        if (isNonSolidWorldVoxelItem(block.itemId)) return;
        targetSet.add(makeVoxelKey(
            snapToVoxel(block.x),
            snapToVoxel(block.y),
            snapToVoxel(block.z)
        ));
    });
    if (targetSet === outdoorWorldVoxelKeys) {
        syncOutdoorTopSolidVoxelCacheFromBlocks(blocks, true);
    }
    syncSolidWorldVoxelKeys();
}

function appendVoxelBlockKeys(targetSet, blocks = [], skipSync = false) {
    blocks.forEach((block) => {
        const key = makeVoxelKey(
            snapToVoxel(block.x),
            snapToVoxel(block.y),
            snapToVoxel(block.z)
        );
        if (targetSet === outdoorWorldVoxelKeys && isWaterWorldVoxelItem(block.itemId)) {
            waterWorldVoxelKeys.add(key);
        }
        if (isNonSolidWorldVoxelItem(block.itemId)) return;
        targetSet.add(makeVoxelKey(
            snapToVoxel(block.x),
            snapToVoxel(block.y),
            snapToVoxel(block.z)
        ));
    });
    if (targetSet === outdoorWorldVoxelKeys) {
        syncOutdoorTopSolidVoxelCacheFromBlocks(blocks, false);
    }
    // skipSync: skip the expensive full-Set rebuild; caller must call syncSolidWorldVoxelKeys() when done
    if (!skipSync) {
        syncSolidWorldVoxelKeys();
    }
}

function isSolidWorldVoxelAt(x, y, z) {
    const key = makeVoxelKey(
        snapToVoxel(x),
        snapToVoxel(y),
        snapToVoxel(z)
    );
    if (outdoorTerrainRemovedVoxelKeys.has(key)) return false;
    return solidWorldVoxelKeys.has(key);
}

function valueNoise3D(x, y, z, seed = 0) {
    let h = Math.imul(x | 0, 374761393);
    h = Math.imul(h ^ Math.imul(y | 0, 668265263), 1274126177);
    h ^= Math.imul(z | 0, 2147483647);
    h ^= Math.imul(seed | 0, 1597334677);
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function isEntryTunnelCell(x, y, z) {
    const tunnelHalfWidth = 3;
    const tunnelStartZ = (ROOM_DEPTH / 2) - 1;
    const tunnelEndZ = tunnelStartZ + 26;
    const tunnelFloorY = getEntryTunnelFloorY();
    return Math.abs(x) <= tunnelHalfWidth
        && z >= tunnelStartZ
        && z <= tunnelEndZ
        && y >= (tunnelFloorY - 1)
        && y <= (tunnelFloorY + 5);
}

function getEntryTunnelFloorY() {
    return snapToVoxel(getRoomWorldFloorY());
}

function getSchoolPatioFloorY() {
    return snapToVoxel(getRoomWorldFloorY());
}

function isFlowerPatchCell(x, y, z) {
    if (y < -2) return false;
    if (Math.abs(x) > OUTDOOR_WORLD_RADIUS - 4 || Math.abs(z) > OUTDOOR_WORLD_RADIUS - 4) return false;
    const noise = valueNoise3D(x, y, z, 187);
    return noise > 0.962;
}

function isOutdoorWeatherVisualCell(x, z) {
    return Math.max(Math.abs(x), Math.abs(z)) <= (OUTDOOR_WORLD_RADIUS - 1);
}

function getWhiteboardLabel(data = {}, fallbackIndex = 1) {
    const shortId = String(data.label || data.name || data.displayName || '').trim();
    if (shortId) return shortId;
    return `Pizarrón ${fallbackIndex}`;
}

function disposeVoxelGroup(group) {
    if (!group) return;
    if (scene && group.parent === scene) {
        scene.remove(group);
    }
    group.traverse((child) => {
        if (!child?.isMesh) return;
        if (child.geometry && child.geometry !== voxelWorldGeometry) {
            child.geometry.dispose?.();
        }
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.filter(Boolean).forEach((material) => {
            if (material?.userData?.sharedVoxelMaterial) return;
            material.map = null;
            material.dispose?.();
        });
    });
}

function getBlockMaterialConfig(itemId) {
    const item = ITEMS_LIBRARY.find((entry) => entry.id === itemId) || {};
    const cfg = {
        color: item.color || 0xffffff,
        roughness: 0.96,
        metalness: 0,
        flatShading: false,
        side: THREE.FrontSide
    };
    if (item.transparent) {
        cfg.transparent = true;
        cfg.opacity = Number.isFinite(item.opacity) ? Number(item.opacity) : 0.68;
        cfg.side = THREE.DoubleSide;
    }
    if (typeof item.depthWrite === 'boolean') {
        cfg.depthWrite = item.depthWrite;
    }
    if (typeof item.depthTest === 'boolean') {
        cfg.depthTest = item.depthTest;
    }
    if (itemId === 'tile_floor') {
        cfg.color = 0xffffff;
        cfg.roughness = 0.72;
        cfg.metalness = 0.02;
    } else if (itemId === 'classroom_wall') {
        cfg.color = 0xffffff;
        cfg.roughness = 0.9;
        cfg.metalness = 0;
    } else if (itemId === 'water_block' || itemId === 'water_still') {
        cfg.transparent = true;
        cfg.opacity = itemId === 'water_still' ? 0.56 : 0.62;
        cfg.depthWrite = false;
        cfg.side = THREE.FrontSide;
        cfg.roughness = 0.12;
    } else if (itemId === 'snow_block') {
        cfg.transparent = true;
        cfg.opacity = 0.94;
        cfg.roughness = 0.82;
        cfg.metalness = 0;
    } else if (itemId === 'sakura_block' || itemId === 'autumn_leaf_block') {
        cfg.transparent = true;
        cfg.opacity = 0.88;
        cfg.roughness = 0.92;
    } else if (itemId === 'lava_block' || itemId === 'lava_still') {
        cfg.color = 0xff4500;
        cfg.emissive = new THREE.Color(0xff2200);
        cfg.emissiveIntensity = 0.8;
        cfg.roughness = 0.2;
        cfg.metalness = 0;
    }
    return cfg;
}

function createBlockMaterial(itemId) {
    if (voxelMaterialCache.has(itemId)) {
        return voxelMaterialCache.get(itemId);
    }
    const material = new THREE.MeshStandardMaterial(getBlockMaterialConfig(itemId));
    if (itemId === 'grass_block' && TEXTURES.grass) {
        material.map = TEXTURES.grass;
        material.color.setHex(0xffffff);
    } else if (itemId === 'dirt_block' && TEXTURES.dirt) {
        material.map = TEXTURES.dirt;
        material.color.setHex(0xffffff);
    } else if (itemId === 'basalt_block' && TEXTURES.stone) {
        material.map = TEXTURES.stone;
        material.color.setHex(0x333333); // Dark tint
    } else if ((itemId === 'stone_cobble' || itemId === 'diamond_block' || itemId === 'gold_block' || itemId === 'emerald_block') && TEXTURES.stone) {
        material.map = TEXTURES.stone;
        material.color.setHex(0xffffff);
    } else if (itemId === 'tile_floor' && TEXTURES.tile) {
        material.map = TEXTURES.tile;
        material.color.setHex(0xffffff);
    } else if (itemId === 'classroom_wall' && TEXTURES.wall) {
        material.map = TEXTURES.wall;
        material.color.setHex(0xffffff);
    } else if (itemId === 'wood_plank' && TEXTURES.wood) {
        material.map = TEXTURES.wood;
        material.color.setHex(0xffffff);
    } else if (itemId === 'glass_block') {
        material.color.setHex(0xf5fbff);
    } else if (itemId === 'water_block' || itemId === 'water_still') {
        material.map = TEXTURES.water || null;
        material.color.setHex(TEXTURES.water ? 0xffffff : 0x2563eb);
        material.transparent = true;
        material.opacity = itemId === 'water_still' ? 0.56 : 0.62;
        material.roughness = 0.06;
        material.metalness = 0.02;
        material.side = THREE.DoubleSide;
        material.depthWrite = false;
        material.forceSinglePass = true;
        material.polygonOffset = true;
        material.polygonOffsetFactor = -1;
        material.polygonOffsetUnits = -1;
    } else if (itemId === 'lava_block' || itemId === 'lava_still') {
        material.map = TEXTURES.lava || null;
        material.emissiveMap = TEXTURES.lava || null;
        material.color.setHex(0xffffff); // Use texture color
        material.emissive = new THREE.Color(0xff6600); // Constant glow
        material.emissiveIntensity = 1.05;
        material.roughness = 0.08;
        material.metalness = 0.05;
        material.side = THREE.FrontSide;
    } else if (itemId === 'snow_block' || itemId === 'sakura_block' || itemId === 'autumn_leaf_block') {
        const baseColor = itemId === 'sakura_block' ? 0xffc3dd : (itemId === 'autumn_leaf_block' ? 0xd94e33 : 0xf7fbff);
        material.color.setHex(baseColor);
        material.transparent = true;
        material.opacity = itemId === 'snow_block' ? 0.94 : 0.88;
        material.depthWrite = true;
        material.roughness = 0.78;
        material.emissive = new THREE.Color(itemId === 'snow_block' ? 0x132033 : 0x0a0a0a);
        material.emissiveIntensity = 0.02;
    } else if (itemId === 'lava_block') {
        material.color.setHex(0xff7a18);
        material.emissive = new THREE.Color(0xff4d00);
        material.emissiveIntensity = 0.9;
        material.roughness = 0.2;
    } else if (itemId === 'flower_red') {
        material.color.setHex(0xff4d6d);
        material.roughness = 0.65;
    } else if (itemId === 'flower_yellow') {
        material.color.setHex(0xffdd55);
        material.roughness = 0.65;
    } else if (itemId === 'leaf_block') {
        if (TEXTURES.leaf) {
            material.map = TEXTURES.leaf;
            material.color.setHex(0xffffff);
        } else {
            material.color.setHex(0x4f9f45);
        }
        material.roughness = 0.88;
    }
    material.userData = material.userData || {};
    material.userData.sharedVoxelMaterial = true;
    material.userData.itemId = itemId;
    material.needsUpdate = true;
    voxelMaterialCache.set(itemId, material);
    return material;
}

const FLOWER_DECORATION_CACHE = new Map();

function getFlowerDecorationPalette(itemId) {
    if (itemId === 'flower_yellow') {
        return {
            petal: 0xffd35a,
            center: 0xff9f1c,
            stem: 0x4a8f42,
            leaf: 0x63ad52
        };
    }
    return {
        petal: 0xff5878,
        center: 0xffd36e,
        stem: 0x4a8f42,
        leaf: 0x63ad52
    };
}

function getFlowerDecorationMaterials(itemId) {
    if (FLOWER_DECORATION_CACHE.has(itemId)) {
        return FLOWER_DECORATION_CACHE.get(itemId);
    }
    const palette = getFlowerDecorationPalette(itemId);
    const makeMat = (color, roughness = 0.86) => {
        const material = new THREE.MeshStandardMaterial({
            color,
            flatShading: true,
            roughness,
            metalness: 0,
            side: THREE.DoubleSide
        });
        material.userData = material.userData || {};
        material.userData.sharedVoxelMaterial = true;
        return material;
    };
    const materials = {
        stem: makeMat(palette.stem, 0.95),
        leaf: makeMat(palette.leaf, 0.9),
        petal: makeMat(palette.petal, 0.78),
        center: makeMat(palette.center, 0.74)
    };
    FLOWER_DECORATION_CACHE.set(itemId, materials);
    return materials;
}

function createFlowerDecorationGroup(itemId, block, groupName, groupKind) {
    const flower = new THREE.Group();
    flower.name = `${groupName}_${itemId}_${snapToVoxel(block.x)}_${snapToVoxel(block.y)}_${snapToVoxel(block.z)}`;
    flower.userData.structure = groupName;
    flower.userData.isTerrain = groupKind === 'terrain';
    flower.userData.isRoomShell = groupKind === 'room_shell';
    flower.userData.isProtectedStructure = true;
    flower.userData.ignoreRaycast = true;
    flower.userData.itemId = itemId;

    const scale = Array.isArray(block.scale) && block.scale.length >= 3
        ? Math.max(0.18, Math.min(0.36, Number(block.scale[0]) || 0.25))
        : 0.25;
    const isCherryBlossom = String(block?.role || '').startsWith('blossom');
    const terrainFlower = String(block?.terrainDecor || '') === 'flower';

    // Normal alignment for flowers on planet
    const snx = Number(block?.surfaceNormalX ?? 0);
    const sny = Number(block?.surfaceNormalY ?? 1);
    const snz = Number(block?.surfaceNormalZ ?? 0);
    const surfaceNormal = new THREE.Vector3(snx, sny, snz);
    if (surfaceNormal.lengthSq() < 1e-6) surfaceNormal.set(0, 1, 0);
    else surfaceNormal.normalize();

    const positionYOffset = isCherryBlossom ? 0 : -0.82;
    flower.position.set(block.x, block.y + positionYOffset, block.z);

    if (terrainFlower && block.terrainShape === 'planet') {
        const renderBase = new THREE.Vector3(block.renderBaseX || block.x, block.renderBaseY || block.y, block.renderBaseZ || block.z);
        flower.position.copy(renderBase).addScaledVector(surfaceNormal, 0.42);
        const surfaceQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), surfaceNormal);
        flower.quaternion.multiply(surfaceQuat);
    }

    flower.scale.setScalar(scale);
    flower.rotation.y = ((Math.abs(Math.sin((block.x * 12.9898) + (block.z * 78.233) + (itemId === 'flower_yellow' ? 7.5 : 3.2))) % 1) * Math.PI * 2);

    const materials = getFlowerDecorationMaterials(itemId);

    const center = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.16, 0),
        materials.center
    );
    center.position.y = 0.16;
    center.scale.set(1.0, 0.9, 1.0);
    center.castShadow = true;
    center.receiveShadow = true;
    flower.add(center);

    const petalGeo = new THREE.SphereGeometry(0.105, 5, 4);
    const petalOffsets = [
        [0.14, 0.18, 0.00],
        [-0.14, 0.18, 0.00],
        [0.00, 0.18, 0.14],
        [0.00, 0.18, -0.14],
        [0.10, 0.22, 0.10]
    ];
    petalOffsets.forEach(([x, y, z], idx) => {
        const petal = new THREE.Mesh(petalGeo, materials.petal);
        petal.position.set(x, y + (idx === 4 ? 0.02 : 0), z);
        petal.scale.set(1.0, 0.72, 0.92);
        petal.rotation.y = idx * 0.72;
        petal.castShadow = true;
        petal.receiveShadow = true;
        flower.add(petal);
    });

    if (!isCherryBlossom) {
        const stem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07, 0.045, 0.58, 5, 1, false),
            materials.stem
        );
        stem.position.y = -0.16;
        stem.rotation.z = 0.03;
        stem.castShadow = true;
        stem.receiveShadow = true;
        flower.add(stem);

        const leafGeo = new THREE.BoxGeometry(0.12, 0.03, 0.05);
        const leafLeft = new THREE.Mesh(leafGeo, materials.leaf);
        leafLeft.position.set(-0.08, -0.03, 0.02);
        leafLeft.rotation.z = -0.58;
        leafLeft.rotation.y = 0.42;
        leafLeft.castShadow = true;
        leafLeft.receiveShadow = true;
        flower.add(leafLeft);

        const leafRight = new THREE.Mesh(leafGeo, materials.leaf);
        leafRight.position.set(0.08, 0.02, -0.01);
        leafRight.rotation.z = 0.62;
        leafRight.rotation.y = -0.25;
        leafRight.castShadow = true;
        leafRight.receiveShadow = true;
        flower.add(leafRight);
    } else {
        const nx = Number(block?.blossomNormalX ?? 0);
        const ny = Number(block?.blossomNormalY ?? 1);
        const nz = Number(block?.blossomNormalZ ?? 0);
        const normal = new THREE.Vector3(nx, ny, nz);
        if (normal.lengthSq() < 1e-6) {
            normal.set(0, 1, 0);
        } else {
            normal.normalize();
        }
        const blossomQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
        flower.quaternion.multiply(blossomQuat);
        center.position.y = 0.06;
        petalOffsets.forEach((_, idx) => {
            const petal = flower.children[idx + 1];
            if (petal?.isMesh) {
                petal.position.y -= 0.07;
            }
        });
    }

    if (terrainFlower && block.terrainShape !== 'planet') {
        flower.position.set(block.x, block.y + (0.45 * scale), block.z);
        flower.rotation.set(0, flower.rotation.y, 0);
    }

    markRaycastIgnored(flower);
    return flower;
}

let outdoorLeafCapGeometry = null;
function getOutdoorLeafCapGeometry() {
    return new THREE.BoxGeometry(1.0, 1.0, 1.0);
}

function getBlockSurfaceNormalVector(block = null) {
    if (!block) return null;
    const nx = Number(block.surfaceNormalX);
    const ny = Number(block.surfaceNormalY);
    const nz = Number(block.surfaceNormalZ);
    if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz)) return null;
    const normal = new THREE.Vector3(nx, ny, nz);
    if (normal.lengthSq() < 1e-6) return null;
    return normal.normalize();
}

function getBlockRenderBaseVector(block = null) {
    if (!block) return null;
    const rx = Number(block.renderBaseX);
    const ry = Number(block.renderBaseY);
    const rz = Number(block.renderBaseZ);
    if (!Number.isFinite(rx) || !Number.isFinite(ry) || !Number.isFinite(rz)) return null;
    return new THREE.Vector3(rx, ry, rz);
}

function createVoxelWorldGroup(blocks, groupName, groupKind) {
    const group = new THREE.Group();
    group.name = groupName;
    group.userData.structure = groupName;
    group.userData.isTerrain = groupKind === 'terrain';
    group.userData.isRoomShell = groupKind === 'room_shell';
    group.userData.isProtectedStructure = true;
    group.userData.ignoreRaycast = false;

    if (!voxelWorldGeometry) {
        voxelWorldGeometry = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);
    }

    const byItem = new Map();
    const groupBlockKeys = new Set();
    const waterVoxelKeys = new Set();
    const isWaterVoxelItem = (itemId) => itemId === 'water_block' || itemId === 'water_still';
    blocks.forEach((block) => {
        const itemId = String(block.itemId || 'stone_cobble');
        if (!byItem.has(itemId)) byItem.set(itemId, []);
        byItem.get(itemId).push(block);
        const snappedX = snapToVoxel(block.x);
        const snappedY = snapToVoxel(block.y);
        const snappedZ = snapToVoxel(block.z);
        const voxelKey = makeVoxelKey(snappedX, snappedY, snappedZ);
        groupBlockKeys.add(voxelKey);
        if (isWaterVoxelItem(itemId)) {
            waterVoxelKeys.add(voxelKey);
        }
    });

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const capScale = new THREE.Vector3(1, 1, 1);
    const surfaceQuat = new THREE.Quaternion();
    const waterFaceGeometry = new THREE.PlaneGeometry(1.02, 1.02);
    const worldUp = new THREE.Vector3(0, 1, 0);
    const shouldCastShadowForBlock = (itemId) => {
        if (groupKind === 'terrain') {
            return itemId === 'grass_block' || itemId === 'dirt_block' || itemId === 'wood_plank' || itemId === 'stone_cobble' || itemId === 'glass_block' || itemId === 'leaf_block';
        }
        if (groupKind === 'room_shell') {
            return itemId === 'classroom_wall' || itemId === 'tile_floor' || itemId === 'wood_plank' || itemId === 'stone_brick';
        }
        return true;
    };
    const shouldReceiveShadowForBlock = (itemId) => {
        if (itemId === 'water_block' || itemId === 'lava_block') return false;
        return true;
    };
    const getWaterSurfaceNormal = (block, x, y, z) => {
        const blockNormal = getBlockSurfaceNormalVector(block);
        if (blockNormal && blockNormal.lengthSq() > 1e-6) return blockNormal.normalize();
        const cubeState = getCubeSurfaceState(new THREE.Vector3(x, y, z), lastEarthSurfaceFaceHint);
        if (cubeState?.up && cubeState.up.lengthSq() > 1e-6) return cubeState.up.clone().normalize();
        return worldUp.clone();
    };
    const getMajorAxisStepFromNormal = (normal) => {
        const nx = Number(normal?.x || 0);
        const ny = Number(normal?.y || 0);
        const nz = Number(normal?.z || 0);
        const absX = Math.abs(nx);
        const absY = Math.abs(ny);
        const absZ = Math.abs(nz);
        if (absX >= absY && absX >= absZ) return { x: Math.sign(nx) || 1, y: 0, z: 0 };
        if (absZ >= absX && absZ >= absY) return { x: 0, y: 0, z: Math.sign(nz) || 1 };
        return { x: 0, y: Math.sign(ny) || 1, z: 0 };
    };
    const WATER_FACE_DEFS = [
        { id: 'px', step: { x: 1, y: 0, z: 0 }, normal: new THREE.Vector3(1, 0, 0) },
        { id: 'nx', step: { x: -1, y: 0, z: 0 }, normal: new THREE.Vector3(-1, 0, 0) },
        { id: 'py', step: { x: 0, y: 1, z: 0 }, normal: new THREE.Vector3(0, 1, 0) },
        { id: 'ny', step: { x: 0, y: -1, z: 0 }, normal: new THREE.Vector3(0, -1, 0) },
        { id: 'pz', step: { x: 0, y: 0, z: 1 }, normal: new THREE.Vector3(0, 0, 1) },
        { id: 'nz', step: { x: 0, y: 0, z: -1 }, normal: new THREE.Vector3(0, 0, -1) }
    ];
    const waterPlaneNormal = new THREE.Vector3(0, 0, 1);

    byItem.forEach((list, itemId) => {
        if (itemId === 'flower_red' || itemId === 'flower_yellow') {
            list.forEach((block) => {
                group.add(createFlowerDecorationGroup(itemId, block, groupName, groupKind));
            });
            return;
        }

        if (isWaterVoxelItem(itemId)) {
            const faceEntriesById = new Map();
            WATER_FACE_DEFS.forEach((def) => faceEntriesById.set(def.id, []));
            list.forEach((block) => {
                const x = snapToVoxel(block.x);
                const y = snapToVoxel(block.y);
                const z = snapToVoxel(block.z);
                const renderBase = groupKind === 'terrain' ? getBlockRenderBaseVector(block) : null;
                const bScale = Array.isArray(block.scale)
                    ? {
                        x: Math.max(0.2, Number(block.scale[0]) || 1),
                        y: Math.max(0.2, Number(block.scale[1]) || 1),
                        z: Math.max(0.2, Number(block.scale[2]) || 1)
                    }
                    : { x: 1, y: 1, z: 1 };
                const isRiverOverlay = String(block.terrainDecor || '') === 'river_water';
                if (isRiverOverlay) {
                    const surfaceNormal = getWaterSurfaceNormal(block, x, y, z);
                    const step = getMajorAxisStepFromNormal(surfaceNormal);
                    const neighborKey = makeVoxelKey(x + step.x, y + step.y, z + step.z);
                    if (waterVoxelKeys.has(neighborKey)) return;
                    const normal = new THREE.Vector3(step.x, step.y, step.z).normalize();
                    faceEntriesById.get('py').push({
                        x, y, z,
                        normal,
                        renderBase,
                        scaleX: bScale.x * 1.02,
                        scaleY: Math.max(0.42, bScale.y * 0.72),
                        scaleZ: bScale.z * 1.02
                    });
                    return;
                }

                WATER_FACE_DEFS.forEach((def) => {
                    const neighborKey = makeVoxelKey(x + def.step.x, y + def.step.y, z + def.step.z);
                    if (waterVoxelKeys.has(neighborKey)) return;
                    faceEntriesById.get(def.id).push({
                        x, y, z,
                        normal: def.normal,
                        renderBase,
                        scaleX: bScale.x * 1.01,
                        scaleY: bScale.y * 1.01,
                        scaleZ: bScale.z * 1.01
                    });
                });
            });

            let waterFaceCount = 0;
            faceEntriesById.forEach((entries) => {
                waterFaceCount += entries.length;
            });
            if (waterFaceCount <= 0) {
                return;
            }

            faceEntriesById.forEach((entries, faceId) => {
                if (!entries.length) return;
                const instanced = new THREE.InstancedMesh(waterFaceGeometry, createBlockMaterial(itemId), entries.length);
                instanced.name = `${groupName}_${itemId}_surface_${faceId}`;
                instanced.userData.docId = `${groupName}_${itemId}_surface_${faceId}`;
                instanced.userData.itemId = itemId;
                instanced.userData.structure = groupName;
                instanced.userData.isTerrain = groupKind === 'terrain';
                instanced.userData.isRoomShell = groupKind === 'room_shell';
                instanced.userData.isProtectedStructure = true;
                instanced.castShadow = false;
                instanced.receiveShadow = false;
                entries.forEach((entry, index) => {
                    const normal = entry.normal?.clone?.() || worldUp.clone();
                    const basePos = entry.renderBase
                        ? entry.renderBase.clone()
                        : new THREE.Vector3(entry.x, entry.y, entry.z);
                    const thicknessY = Math.max(0.35, Math.min(1.02, entry.scaleY));
                    const faceOffset = Math.abs(normal.y) > 0.5 ? (0.5 + 0.008) : (0.5 + 0.004);
                    position.copy(basePos).addScaledVector(normal, faceOffset);
                    surfaceQuat.setFromUnitVectors(waterPlaneNormal, normal);
                    quaternion.copy(surfaceQuat);
                    if (Math.abs(normal.y) > 0.5) {
                        capScale.set(entry.scaleX * 1.035, entry.scaleZ * 1.035, 1);
                    } else if (Math.abs(normal.x) > 0.5) {
                        capScale.set(entry.scaleZ, thicknessY, 1);
                    } else {
                        capScale.set(entry.scaleX, thicknessY, 1);
                    }
                    matrix.compose(position, quaternion, capScale);
                    instanced.setMatrixAt(index, matrix);
                });
                instanced.instanceMatrix.needsUpdate = true;
                instanced.computeBoundingSphere();
                group.add(instanced);
            });

            return;
        }

        // Grass cap removed to avoid covering flowers and comply with user request ("quita esa tapa externa en el césped")

        if (groupKind === 'terrain' && itemId === 'leaf_block') {
            const leafCapMesh = new THREE.InstancedMesh(getOutdoorLeafCapGeometry(), createBlockMaterial(itemId), list.length);
            leafCapMesh.name = `${groupName}_${itemId}_bushy`;
            leafCapMesh.userData.docId = `${groupName}_${itemId}_bushy`;
            leafCapMesh.userData.itemId = itemId;
            leafCapMesh.userData.structure = groupName;
            leafCapMesh.userData.isTerrain = true;
            leafCapMesh.userData.isProtectedStructure = true;
            leafCapMesh.castShadow = false;
            leafCapMesh.receiveShadow = true;
            markRaycastIgnored(leafCapMesh);
            list.forEach((block, index) => {
                position.set(block.x, block.y, block.z);
                const bScale = Array.isArray(block.scale) ? new THREE.Vector3(block.scale[0], block.scale[1], block.scale[2]) : new THREE.Vector3(1, 1, 1);
                matrix.compose(position, new THREE.Quaternion(), bScale);
                leafCapMesh.setMatrixAt(index, matrix);
            });
            leafCapMesh.instanceMatrix.needsUpdate = true;
            leafCapMesh.computeBoundingSphere();
            group.add(leafCapMesh);
            // We store the leafy meshes in userData so updateSharedVoxelMaterialMood can find them
            group.userData.leafyMeshes = group.userData.leafyMeshes || [];
            group.userData.leafyMeshes.push(leafCapMesh);
        }

        const instanced = new THREE.InstancedMesh(voxelWorldGeometry, createBlockMaterial(itemId), list.length);
        instanced.name = `${groupName}_${itemId}`;
        instanced.userData.docId = `${groupName}_${itemId}`;
        instanced.userData.itemId = itemId;
        instanced.userData.structure = groupName;
        instanced.userData.isTerrain = groupKind === 'terrain';
        instanced.userData.isRoomShell = groupKind === 'room_shell';
        instanced.userData.isProtectedStructure = true;
        instanced.castShadow = shouldCastShadowForBlock(itemId);
        instanced.receiveShadow = shouldReceiveShadowForBlock(itemId);
        list.forEach((block, index) => {
            position.set(block.x, block.y, block.z);
            quaternion.set(0, 0, 0, 1);
            const bScale = Array.isArray(block.scale)
                ? new THREE.Vector3(block.scale[0], block.scale[1], block.scale[2])
                : scale.clone();
            const surfaceNormal = groupKind === 'terrain' ? getBlockSurfaceNormalVector(block) : null;
            const renderBase = groupKind === 'terrain' ? getBlockRenderBaseVector(block) : null;
            const riverWaterOverlay = (itemId === 'water_block' && String(block.terrainDecor || '') === 'river_water');
            const isWeatherOverlay = (itemId === 'snow_block' || itemId === 'sakura_block' || itemId === 'autumn_leaf_block');
            const isPlanetSolidSurface = groupKind === 'terrain'
                && block.role === 'surface'
                && block.terrainShape === 'planet'
                && !isWeatherOverlay
                && !riverWaterOverlay
                && itemId !== 'water_block'
                && itemId !== 'water_still';
            if (block.role === 'surface' && block.terrainShape === 'planet' && (isWeatherOverlay || riverWaterOverlay)) {
                const safeNormal = surfaceNormal || new THREE.Vector3(0, 1, 0);
                if (safeNormal.lengthSq() > 1e-6) {
                    surfaceQuat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), safeNormal.clone().normalize());
                    quaternion.multiply(surfaceQuat);
                }
                if (renderBase) {
                    position.copy(renderBase);
                }
                if (isWeatherOverlay) {
                    const tileThickness = 0.15;
                    bScale.x *= 1.04;
                    bScale.y *= tileThickness;
                    bScale.z *= 1.04;
                    // Sit weather overlays strictly ABOVE top solid voxel face.
                    const overlayLift = 0.5 + (bScale.y * 0.5) + 0.02;
                    position.addScaledVector(safeNormal, overlayLift);
                } else if (riverWaterOverlay) {
                    // Keep river water voxel-ish but floating above soil, never buried.
                    bScale.x *= 1.02;
                    bScale.y *= 0.72;
                    bScale.z *= 1.02;
                    const waterLift = 0.5 + (bScale.y * 0.5) + 0.01;
                    position.addScaledVector(safeNormal, waterLift);
                }
            } else if (isPlanetSolidSurface) {
                // Keep the top-face ground exact voxel size to avoid the "smoothed/shrunken block" look.
                bScale.set(1, 1, 1);
                if (renderBase) {
                    position.copy(renderBase);
                }
            }
            matrix.compose(position, quaternion, bScale);
            instanced.setMatrixAt(index, matrix);
        });
        instanced.instanceMatrix.needsUpdate = true;
        instanced.computeBoundingBox?.();
        instanced.computeBoundingSphere();
        group.add(instanced);
    });

    return group;
}

function isProtectedWorldItemData(data = {}) {
    return !!data?.terrain || data?.structure === 'room_shell';
}

function getLocalAxisInfo(gravUp) {
    if (Math.abs(gravUp.x) > 0.5) return { upAxis: 'x', upSign: Math.sign(gravUp.x), h1: 'y', h2: 'z' };
    if (Math.abs(gravUp.z) > 0.5) return { upAxis: 'z', upSign: Math.sign(gravUp.z), h1: 'x', h2: 'y' };
    return { upAxis: 'y', upSign: Math.sign(gravUp.y), h1: 'x', h2: 'z' };
}

function findTerrainSupportYAtLocal(x, y, z, gravityUp, searchDepth = 24) {
    const vx = snapToVoxel(x);
    const vy = snapToVoxel(y);
    const vz = snapToVoxel(z);
    const loc = getLocalAxisInfo(gravityUp);

    let pos = { x: vx, y: vy, z: vz };
    const startLocUp = Math.floor(pos[loc.upAxis] * loc.upSign - PLAYER_EYE_HEIGHT + 0.5);

    for (let step = startLocUp + 2; step >= startLocUp - searchDepth; step -= 1) {
        pos[loc.upAxis] = step * loc.upSign;
        if (isSolidWorldVoxelAt(pos.x, pos.y, pos.z)) {
            return step + 0.5;
        }
    }

    // Mathematical fallback: while the outdoor world is building, clamp the player
    // to the cubic planet surface so they don't fall to the center of the universe.
    if (outdoorWorldReadyLevel === 'none' || outdoorWorldReadyLevel === 'shell_partial') {
        const posVec = new THREE.Vector3(vx, vy, vz);
        const cubeState = getCubeSurfaceState(posVec, lastEarthSurfaceFaceHint);
        const supportPoint = cubeState?.projectedSurfacePoint;
        if (supportPoint) {
            const locAxis = loc.upAxis;
            return supportPoint[locAxis] * loc.upSign;
        }
    }
    return null;
}

function findTerrainSupportYAt(x, z, fromY = null, searchDepth = 32) {
    const pos = new THREE.Vector3(x, fromY ?? ensurePlayerWorldPosition().y, z);
    const preferredFace = movementController?.state?.currentCubeFace || lastEarthSurfaceFaceHint || null;
    const gravityUp = isSpaceBodyActive()
        ? getPlanetSurfaceNormal(pos.clone())
        : getCubeSurfaceState(pos.clone(), preferredFace).up.clone();
    const tangentA = getStableProjectedForward(gravityUp.clone(), new THREE.Vector3(1, 0, 0));
    if (tangentA.lengthSq() < 1e-6) {
        tangentA.copy(getStableProjectedForward(gravityUp.clone(), new THREE.Vector3(0, 0, 1)));
    }
    const tangentB = new THREE.Vector3().crossVectors(gravityUp, tangentA).normalize();

    // Probe around the player footprint in the local tangent frame.
    // This keeps support detection stable when crossing edges between cube faces.
    const offsets = [
        [0, 0],
        [0.35, 0.35],
        [-0.35, 0.35],
        [0.35, -0.35],
        [-0.35, -0.35]
    ];
    let bestY = -Infinity;
    offsets.forEach(([oa, ob]) => {
        const sample = pos.clone()
            .addScaledVector(tangentA, oa)
            .addScaledVector(tangentB, ob);
        const py = findTerrainSupportYAtLocal(sample.x, sample.y, sample.z, gravityUp, searchDepth);
        if (py > bestY) bestY = py;
    });
    return bestY;
}

function getTerrainVoxelContact(nextPos, knownSupportY = null) {
    const result = {
        collisionX: false,
        collisionZ: false,
        collisionH1: false,
        collisionH2: false,
        localAxes: null,
        supportY: null
    };

    const preferredFace = movementController?.state?.currentCubeFace || lastEarthSurfaceFaceHint || null;
    const gravityUp = isSpaceBodyActive()
        ? getPlanetSurfaceNormal(nextPos)
        : getCubeSurfaceState(nextPos, preferredFace).up.clone();
    const loc = getLocalAxisInfo(gravityUp);
    result.localAxes = { ...loc };

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
                let pos = { x: 0, y: 0, z: 0 };
                pos[loc.h1] = h1;
                pos[loc.h2] = h2;
                pos[loc.upAxis] = upVal * loc.upSign;

                if (!isSolidWorldVoxelAt(pos.x, pos.y, pos.z)) continue;

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
                    if (result.supportY === null || blockTopUp > result.supportY) {
                        result.supportY = blockTopUp;
                    }
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
                        result.collisionH1 = true;
                        if (loc.h1 === 'x') result.collisionX = true;
                        else if (loc.h1 === 'z') result.collisionZ = true;
                    } else {
                        result.collisionH2 = true;
                        if (loc.h2 === 'x') result.collisionX = true;
                        else if (loc.h2 === 'z') result.collisionZ = true;
                    }
                }
            }
        }
    }

    const raycastSupportY = findTerrainSupportYAtLocal(nextPos.x, nextPos.y, nextPos.z, gravityUp, 4);
    if (result.supportY !== null && knownSupportY !== null) {
        result.supportY = Math.max(result.supportY, knownSupportY);
    } else if (result.supportY === null && raycastSupportY !== null) {
        result.supportY = raycastSupportY;
    } else if (result.supportY === null) {
        result.supportY = knownSupportY;
    }
    return result;
}

function getMoonCenter() {
    return new THREE.Vector3(SPACE_WORLD_CENTER.x, SPACE_WORLD_CENTER.y, SPACE_WORLD_CENTER.z);
}

function getEarthCenter() {
    return new THREE.Vector3(0, -OUTDOOR_WORLD_RADIUS, 0);
}

function getPlanetCenter() {
    return isSpaceBodyActive() ? getMoonCenter() : getEarthCenter();
}

function getPlanetEyeRadius() {
    const isEarth = !isSpaceBodyActive();
    if (isEarth) {
        return OUTDOOR_WORLD_RADIUS + PLAYER_EYE_HEIGHT;
    }
    const bodyRadius = getTravelBodyConfig(currentSpaceBodyId).surfaceRadius;
    return bodyRadius + PLANET_EYE_HEIGHT;
}

function getPlanetBlend(position) {
    if (isSpaceBodyActive()) return 1;
    // For cubic planet, we are ALWAYS in "planet mode" (blend 1) outside the room
    return 1;
}

const CUBE_FACE_NORMALS = Object.freeze({
    top: Object.freeze({ x: 0, y: 1, z: 0 }),
    bottom: Object.freeze({ x: 0, y: -1, z: 0 }),
    east: Object.freeze({ x: 1, y: 0, z: 0 }),
    west: Object.freeze({ x: -1, y: 0, z: 0 }),
    south: Object.freeze({ x: 0, y: 0, z: 1 }),
    north: Object.freeze({ x: 0, y: 0, z: -1 })
});

const CUBE_FACE_NEIGHBORS = Object.freeze({
    top: Object.freeze(['south', 'north', 'east', 'west']),
    bottom: Object.freeze(['south', 'north', 'east', 'west']),
    east: Object.freeze(['top', 'bottom', 'south', 'north']),
    west: Object.freeze(['top', 'bottom', 'south', 'north']),
    south: Object.freeze(['top', 'bottom', 'east', 'west']),
    north: Object.freeze(['top', 'bottom', 'east', 'west'])
});

function cubeFaceNormal(faceId = 'top') {
    const safeFace = String(faceId || 'top').trim().toLowerCase();
    const preset = CUBE_FACE_NORMALS[safeFace] || CUBE_FACE_NORMALS.top;
    return new THREE.Vector3(preset.x, preset.y, preset.z);
}

function cubeFaceFromPosition(position, prevFace = null, hysteresis = 0.2) {
    const center = getEarthCenter();
    const offset = (position?.clone?.() || new THREE.Vector3()).sub(center);
    const absX = Math.abs(offset.x);
    const absY = Math.abs(offset.y);
    const absZ = Math.abs(offset.z);
    const maxAbs = Math.max(absX, absY, absZ);
    if (maxAbs < 1e-6) return prevFace || 'top';
    const safePrevFace = typeof prevFace === 'string' ? prevFace : null;
    if (safePrevFace && CUBE_FACE_NORMALS[safePrevFace]) {
        const prevNormal = cubeFaceNormal(safePrevFace);
        const prevAxisAbs = Math.abs(offset.dot(prevNormal));
        if ((maxAbs - prevAxisAbs) <= Math.max(0.02, hysteresis)) {
            return safePrevFace;
        }
    }
    if (absY >= absX && absY >= absZ) return offset.y >= 0 ? 'top' : 'bottom';
    if (absX >= absY && absX >= absZ) return offset.x >= 0 ? 'east' : 'west';
    return offset.z >= 0 ? 'south' : 'north';
}

function cubeSurfaceProject(position, prevFace = null) {
    const center = getEarthCenter();
    const safePosition = position?.clone?.() || new THREE.Vector3();
    const face = cubeFaceFromPosition(safePosition, prevFace);
    const normal = cubeFaceNormal(face);
    const halfSize = OUTDOOR_WORLD_RADIUS;
    const projected = safePosition.clone();
    projected.x = THREE.MathUtils.clamp(projected.x, -halfSize, halfSize);
    projected.y = THREE.MathUtils.clamp(projected.y, (-2 * halfSize), 0);
    projected.z = THREE.MathUtils.clamp(projected.z, -halfSize, halfSize);
    if (face === 'top') projected.y = 0;
    else if (face === 'bottom') projected.y = -2 * halfSize;
    else if (face === 'east') projected.x = halfSize;
    else if (face === 'west') projected.x = -halfSize;
    else if (face === 'south') projected.z = halfSize;
    else projected.z = -halfSize;
    const tangentForward = getStableProjectedForward(normal, new THREE.Vector3(0, 0, -1));
    let tangentRight = new THREE.Vector3().crossVectors(tangentForward, normal);
    if (tangentRight.lengthSq() < 1e-6) {
        tangentRight = getStableProjectedForward(normal, new THREE.Vector3(1, 0, 0));
    } else {
        tangentRight.normalize();
    }
    const tangentOrthoForward = new THREE.Vector3().crossVectors(normal, tangentRight).normalize();
    return {
        face,
        up: normal,
        tangentForward: tangentOrthoForward,
        tangentRight,
        projectedSurfacePoint: projected.clone(),
        center
    };
}

function getCubeSurfaceState(position, prevFace = null) {
    const safePrev = prevFace || lastEarthSurfaceFaceHint || null;
    return cubeSurfaceProject(position, safePrev);
}

function updateLastEarthSurfaceFaceHint(position, prevFace = null) {
    if (!position) return lastEarthSurfaceFaceHint || 'top';
    const state = cubeSurfaceProject(position, prevFace || lastEarthSurfaceFaceHint || null);
    if (state?.face) {
        lastEarthSurfaceFaceHint = state.face;
        return state.face;
    }
    return lastEarthSurfaceFaceHint || 'top';
}

function getCubeFaceUpVector(faceId = 'top') {
    return cubeFaceNormal(faceId).normalize();
}

function cubeFaceLocalToWorld(faceId = 'top', u = 0, v = 0) {
    const R = OUTDOOR_WORLD_RADIUS;
    const cu = THREE.MathUtils.clamp(Number(u || 0), -R, R);
    const cv = THREE.MathUtils.clamp(Number(v || 0), -R, R);
    const safeFace = String(faceId || 'top');
    if (safeFace === 'top') return new THREE.Vector3(cu, 0, cv);
    if (safeFace === 'bottom') return new THREE.Vector3(cu, -2 * R, -cv);
    if (safeFace === 'east') return new THREE.Vector3(R, cv - R, cu);
    if (safeFace === 'west') return new THREE.Vector3(-R, cv - R, -cu);
    if (safeFace === 'north') return new THREE.Vector3(-cu, cv - R, -R);
    return new THREE.Vector3(cu, cv - R, R); // south
}

function cubeFaceWorldToLocal(position = null, preferredFace = null) {
    const sample = position?.clone?.() || new THREE.Vector3();
    const face = String(preferredFace || getCubeSurfaceState(sample, lastEarthSurfaceFaceHint).face || 'top');
    const R = OUTDOOR_WORLD_RADIUS;
    if (face === 'top') return { face, u: sample.x, v: sample.z };
    if (face === 'bottom') return { face, u: sample.x, v: -sample.z };
    if (face === 'east') return { face, u: sample.z, v: sample.y + R };
    if (face === 'west') return { face, u: -sample.z, v: sample.y + R };
    if (face === 'north') return { face, u: -sample.x, v: sample.y + R };
    return { face, u: sample.x, v: sample.y + R }; // south
}

function getSpawnStateForCubeFacePoint(faceId = 'top', u = 0, v = 0, options = {}) {
    const safeFace = String(faceId || 'top');
    const surface = cubeFaceLocalToWorld(safeFace, u, v);
    const up = getCubeFaceUpVector(safeFace);
    const eyeOffset = Number.isFinite(options.eyeOffset)
        ? Number(options.eyeOffset)
        : (PLAYER_EYE_HEIGHT + 0.25);
    const spawnPos = surface.clone().addScaledVector(up, eyeOffset);
    const forwardSeed = getStableProjectedForward(up, options.forward?.clone?.() || new THREE.Vector3(0, 0, -1));
    const right = new THREE.Vector3().crossVectors(forwardSeed, up).normalize();
    const forward = new THREE.Vector3().crossVectors(up, right).normalize();
    const yaw = Math.atan2(forward.x, forward.z);
    return {
        roomId: currentRoomId,
        x: Number(spawnPos.x || 0),
        y: Number(spawnPos.y || 0),
        z: Number(spawnPos.z || 0),
        playerYaw: Number.isFinite(options.playerYaw) ? Number(options.playerYaw) : yaw,
        playerPitch: 0,
        activeCelestialBody: 'earth',
        currentSpaceBodyId: 'earth',
        updatedAt: Date.now(),
        source: 'map_fast_travel'
    };
}

function buildCubeFastTravelZones() {
    const zones = [
        { id: 'zone_room', label: 'SALON', icon: '🏫', color: '#f59e0b', face: 'top', u: 0, v: 0 },
        (() => {
            const rocketAnchor = getEarthLaunchPadAnchor();
            return { id: 'zone_rocket', label: 'COHETE', icon: '🚀', color: '#dc2626', face: 'top', u: rocketAnchor.x, v: rocketAnchor.z };
        })(),
        { id: 'zone_lake', label: 'LAGO', icon: '💧', color: '#2563eb', face: 'top', u: LAKE_CENTER_X, v: LAKE_CENTER_Z },
        { id: 'zone_soccer', label: 'FUTBOL', icon: '⚽', color: '#ef4444', face: 'west', u: 0, v: 0 },
        { id: 'zone_volley', label: 'VOLEY', icon: '🏐', color: '#fde047', face: 'east', u: 0, v: 0 },
        { id: 'zone_forest', label: 'BOSQUE', icon: '🌲', color: '#16a34a', face: 'north', u: 0, v: 8 },
        { id: 'zone_volcano', label: 'VOLCAN', icon: '🌋', color: '#f97316', face: 'south', u: 0, v: -10 },
        { id: 'zone_snow', label: 'NIEVE', icon: '❄️', color: '#93c5fd', face: 'bottom', u: 0, v: 0 },
        { id: 'zone_ocean', label: 'OCEANO', icon: '🌊', color: '#38bdf8', face: 'east', u: -24, v: 0 }
    ];
    const raft = oceanVehicleMeshes.find((mesh) => mesh?.userData?.vehicleId === 'raft');
    if (raft) {
        const local = cubeFaceWorldToLocal(raft.position, 'east');
        zones.push({
            id: 'zone_raft',
            label: 'BALSA',
            icon: '🛶',
            color: '#f97316',
            face: local.face,
            u: local.u,
            v: local.v
        });
    }
    const caravel = oceanVehicleMeshes.find((mesh) => mesh?.userData?.vehicleId === 'caravel');
    if (caravel) {
        const local = cubeFaceWorldToLocal(caravel.position, 'east');
        zones.push({
            id: 'zone_caravel',
            label: 'CARAVELA',
            icon: '⛵',
            color: '#0ea5e9',
            face: local.face,
            u: local.u,
            v: local.v
        });
    }
    return zones;
}

function getPlanetSurfaceNormal(position, blend = null) {
    if (!isSpaceBodyActive()) {
        const prevFace = typeof blend === 'object' ? blend?.prevFace : null;
        return getCubeSurfaceState(position, prevFace).up.clone();
    }
    const center = getPlanetCenter();
    const radial = position.clone().sub(center).normalize();
    const lerpBlend = blend === null ? getPlanetBlend(position) : blend;
    const flatUp = new THREE.Vector3(0, 1, 0);
    return flatUp.lerp(radial, lerpBlend).normalize();
}

function getPlanetFrame(position, _yaw = 0, blend = null, directionHint = null) {
    if (!isSpaceBodyActive()) {
        const prevFace = typeof blend === 'object' ? blend?.prevFace : null;
        const cubeState = getCubeSurfaceState(position, prevFace);
        const up = cubeState.up.clone();
        const forwardSeed = directionHint?.clone?.() || cubeState.tangentForward.clone();
        const forward = getStableProjectedForward(up, forwardSeed);
        let right = new THREE.Vector3().crossVectors(forward, up);
        if (right.lengthSq() < 1e-6) {
            right = cubeState.tangentRight.clone();
        } else {
            right.normalize();
        }
        return { up, forward, right, face: cubeState.face };
    }
    const up = getPlanetSurfaceNormal(position, blend);
    const forward = getStableProjectedForward(up, directionHint?.clone?.() || new THREE.Vector3(0, 0, -1));
    let right = new THREE.Vector3().crossVectors(forward, up);
    if (right.lengthSq() < 1e-6) {
        right = getStableProjectedForward(up, new THREE.Vector3(1, 0, 0));
    }
    right.normalize();
    return { up, forward, right };
}

function projectToPlanetEyeRadius(position) {
    if (!isSpaceBodyActive()) {
        const cubeState = getCubeSurfaceState(position, lastEarthSurfaceFaceHint);
        const surface = cubeState.projectedSurfacePoint.clone();
        return surface.addScaledVector(cubeState.up, getPlanetEyeRadius() - OUTDOOR_WORLD_RADIUS);
    }
    const center = getPlanetCenter();
    const offset = position.clone().sub(center);
    const dist = offset.length();
    if (dist < 1e-6) {
        return center.clone().add(new THREE.Vector3(0, getPlanetEyeRadius(), 0));
    }
    return center.clone().add(offset.multiplyScalar(getPlanetEyeRadius() / dist));
}

function getOutdoorSurfaceNormalAt(x, y, z) {
    if (!isSpaceBodyActive()) {
        return getCubeSurfaceState(new THREE.Vector3(x, Number.isFinite(y) ? y : 0, z), lastEarthSurfaceFaceHint).up.clone();
    }
    const centerSample = getClampedEarthSurfaceSample(x, z, 1);
    const sampleX = centerSample.x;
    const sampleZ = centerSample.z;
    const centerY = getOutdoorBaseSurfaceYContinuous(sampleX, sampleZ) ?? getEarthTopFaceY(sampleX, sampleZ);
    const leftSample = getClampedEarthSurfaceSample(sampleX - 1, sampleZ, 1);
    const rightSample = getClampedEarthSurfaceSample(sampleX + 1, sampleZ, 1);
    const backSample = getClampedEarthSurfaceSample(sampleX, sampleZ - 1, 1);
    const frontSample = getClampedEarthSurfaceSample(sampleX, sampleZ + 1, 1);
    const leftY = getOutdoorBaseSurfaceYContinuous(leftSample.x, leftSample.z) ?? getEarthTopFaceY(leftSample.x, leftSample.z);
    const rightY = getOutdoorBaseSurfaceYContinuous(rightSample.x, rightSample.z) ?? getEarthTopFaceY(rightSample.x, rightSample.z);
    const backY = getOutdoorBaseSurfaceYContinuous(backSample.x, backSample.z) ?? getEarthTopFaceY(backSample.x, backSample.z);
    const frontY = getOutdoorBaseSurfaceYContinuous(frontSample.x, frontSample.z) ?? getEarthTopFaceY(frontSample.x, frontSample.z);
    if (
        Number.isFinite(centerY)
        && Number.isFinite(leftY)
        && Number.isFinite(rightY)
        && Number.isFinite(backY)
        && Number.isFinite(frontY)
    ) {
        const tangentX = new THREE.Vector3(rightSample.x - leftSample.x, rightY - leftY, rightSample.z - leftSample.z);
        const tangentZ = new THREE.Vector3(frontSample.x - backSample.x, frontY - backY, frontSample.z - backSample.z);
        const terrainNormal = new THREE.Vector3().crossVectors(tangentZ, tangentX);
        if (terrainNormal.lengthSq() > 1e-6) {
            return terrainNormal.normalize();
        }
    }
    const fallbackY = Number.isFinite(centerY) ? centerY : Number(y);
    const normal = new THREE.Vector3(sampleX, ((Number.isFinite(fallbackY) ? fallbackY : 0) + OUTDOOR_WORLD_RADIUS), sampleZ);
    if (normal.lengthSq() < 1e-6) {
        normal.set(0, 1, 0);
    } else {
        normal.normalize();
    }
    return normal;
}

function outdoorTerrainBlendFactor(distance) {
    return THREE.MathUtils.smoothstep(distance, OUTDOOR_PLATEAU_RADIUS, OUTDOOR_PLATEAU_RADIUS + OUTDOOR_PLATEAU_BLEND);
}

function getSphereSurfaceYAt(x, z, planetRadius = OUTDOOR_WORLD_RADIUS) {
    const centerY = -planetRadius;
    return centerY + Math.sqrt(Math.max(0, (planetRadius * planetRadius) - ((x * x) + (z * z))));
}

function getFlattenedSphericalZoneY(zone, x, z, planetRadius = OUTDOOR_WORLD_RADIUS) {
    const sphereY = getSphereSurfaceYAt(x, z, planetRadius);
    if (!Number.isFinite(sphereY)) return null;
    const flattenStrength = clamp01(Number(zone?.flattenStrength || 0));
    const lift = Number(zone?.lift || 0);
    if (flattenStrength <= 0.0001) {
        return sphereY + lift;
    }
    const centerSphereY = getSphereSurfaceYAt(zone.x, zone.z, planetRadius);
    if (!Number.isFinite(centerSphereY)) {
        return sphereY + lift;
    }
    const sphereCenter = new THREE.Vector3(0, -planetRadius, 0);
    const zoneCenterPoint = new THREE.Vector3(zone.x, centerSphereY, zone.z);
    const normal = zoneCenterPoint.clone().sub(sphereCenter);
    if (normal.lengthSq() < 1e-6) {
        return sphereY + lift;
    }
    normal.normalize();
    const tangentPlaneConstant = normal.dot(zoneCenterPoint);
    const tangentY = Math.abs(normal.y) > 1e-5
        ? ((tangentPlaneConstant - (normal.x * x) - (normal.z * z)) / normal.y)
        : zoneCenterPoint.y;
    return THREE.MathUtils.lerp(sphereY, tangentY, flattenStrength) + lift;
}

function getCardinalTerraceSurfaceY(terrace, x, z, planetRadius = OUTDOOR_WORLD_RADIUS) {
    return getFlattenedSphericalZoneY(terrace, x, z, planetRadius);
}

function getCardinalTerraceInfo(x, z) {
    let closest = null;
    CARDINAL_TERRACES.forEach((terrace) => {
        const distance = Math.hypot(x - terrace.x, z - terrace.z);
        if (!closest || distance < closest.distance) {
            closest = { terrace, distance };
        }
    });
    return closest;
}

function getOutdoorFlatZoneInfo(x, z) {
    let closest = null;
    const n = OUTDOOR_FLAT_ZONES.length;
    for (let i = 0; i < n; i++) {
        const zone = OUTDOOR_FLAT_ZONES[i];
        const dx = x - zone.x;
        const dz = z - zone.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (!closest || distance < closest.distance) {
            closest = { zone, distance };
        }
    }
    return closest;
}

function getOutdoorFlatZoneSurfaceY(zone, x, z, planetRadius = OUTDOOR_WORLD_RADIUS) {
    return getFlattenedSphericalZoneY(zone, x, z, planetRadius);
}

const OUTDOOR_TOP_RELIEF_PROFILE = Object.freeze({
    macroFreq: 0.045,
    detailFreq: 0.12,
    macroAmp: 1.35,
    detailAmp: 0.52,
    ridgeAmp: 0.24,
    maxAmplitude: 2.15,
    centerFlattenRadius: 28,
    centerFlattenBlend: 18,
    edgeFadeStartInset: 10,
    edgeFadeEndInset: 2
});

function sampleOutdoorTopReliefY(x, z) {
    const profile = OUTDOOR_TOP_RELIEF_PROFILE;
    const macroNoise = (valueNoise3D(x * profile.macroFreq, 0, z * profile.macroFreq, 1201) - 0.5) * 2;
    const detailNoise = (valueNoise3D(x * profile.detailFreq, 0, z * profile.detailFreq, 1202) - 0.5) * 2;
    const ridge = (Math.sin((x + z) * 0.07) * 0.55) + (Math.cos((x - z) * 0.05) * 0.45);

    let relief = (macroNoise * profile.macroAmp) + (detailNoise * profile.detailAmp) + (ridge * profile.ridgeAmp);

    const centerDistance = Math.hypot(x, z);
    const centerFlattenStart = profile.centerFlattenRadius;
    const centerFlattenEnd = centerFlattenStart + profile.centerFlattenBlend;
    const centerReliefFactor = THREE.MathUtils.smoothstep(centerDistance, centerFlattenStart, centerFlattenEnd);
    relief *= centerReliefFactor;

    const radialDistance = Math.max(Math.abs(x), Math.abs(z));
    const edgeFadeStart = OUTDOOR_WORLD_RADIUS - profile.edgeFadeStartInset;
    const edgeFadeEnd = OUTDOOR_WORLD_RADIUS - profile.edgeFadeEndInset;
    const edgeFadeFactor = 1 - THREE.MathUtils.smoothstep(radialDistance, edgeFadeStart, edgeFadeEnd);
    relief *= edgeFadeFactor;

    return THREE.MathUtils.clamp(relief, -profile.maxAmplitude, profile.maxAmplitude);
}

function computeOutdoorBaseSurfaceY(x, z, options = {}) {
    if (isEntryTunnelCell(x, getEntryTunnelFloorY(), z)) {
        return getEntryTunnelFloorY();
    }
    const distance = Math.max(Math.abs(x), Math.abs(z));
    if (distance > OUTDOOR_WORLD_RADIUS && activeCelestialBody === 'earth') return null;
    if (isRoomClearanceCell(x, z) || isRoomApronCell(x, z) || isEarthLaunchPadFootprintCell(x, z, 2)) {
        return options.snapToVoxel === false ? 0 : snapToVoxel(0);
    }

    const reliefY = sampleOutdoorTopReliefY(x, z);
    const finalSurfaceY = reliefY;
    return options.snapToVoxel === false ? finalSurfaceY : snapToVoxel(finalSurfaceY);
}

function getOutdoorBaseSurfaceYContinuous(x, z) {
    return computeOutdoorBaseSurfaceY(x, z, { snapToVoxel: false });
}

function getOutdoorBaseSurfaceY(x, z) {
    return computeOutdoorBaseSurfaceY(x, z, { snapToVoxel: true });
}

function getEarthTopSolidVoxelY(x, z) {
    const sampleX = snapToVoxel(x);
    const sampleZ = snapToVoxel(z);
    const cachedY = getOutdoorTopSolidVoxelYFromCache(sampleX, sampleZ);
    if (Number.isFinite(cachedY)) return cachedY;
    const baseSurfaceY = getOutdoorBaseSurfaceY(sampleX, sampleZ);
    return Number.isFinite(baseSurfaceY) ? snapToVoxel(baseSurfaceY) : null;
}

function getEarthTopFaceY(x, z) {
    const topSolidVoxelY = getEarthTopSolidVoxelY(x, z);
    return Number.isFinite(topSolidVoxelY) ? Number(topSolidVoxelY) + 0.5 : null;
}

function getEarthWalkableSurfaceY(x, z) {
    return getEarthTopFaceY(x, z);
}

function getEarthWalkableSurfaceNormal(x, z) {
    const surfaceY = getOutdoorBaseSurfaceYContinuous(x, z) ?? getEarthWalkableSurfaceY(x, z);
    return getOutdoorSurfaceNormalAt(x, surfaceY, z);
}

function getEarthPlacementSurfaceY(x, z) {
    return getEarthWalkableSurfaceY(x, z);
}

function getEarthVisualSurfaceY(x, z) {
    return getEarthTopSolidVoxelY(x, z);
}

function getRiverDepthAt(x, z) {
    if (!isRiverCell(x, z)) return 0;
    const centerZ = getRiverCenterZAtX(x);
    const lateralDistance = Math.abs(z - centerZ);
    const halfWidth = Math.max(1, getDynamicRiverHalfWidth(x));
    const normalized = 1 - THREE.MathUtils.clamp(lateralDistance / (halfWidth + 0.001), 0, 1);
    return Math.max(1, Math.round(RIVER_DEPTH * (0.55 + (normalized * 0.9))));
}

function getOutdoorRiverWaterSurfaceY(x, z) {
    if (!isRiverCell(x, z)) return null;
    const baseSurfaceY = getOutdoorBaseSurfaceY(x, z);
    if (!Number.isFinite(baseSurfaceY)) return null;
    return baseSurfaceY;
}

function getOutdoorTerrainSurfaceY(x, z) {
    const vx = snapToVoxel(x);
    const vz = snapToVoxel(z);
    const cacheKey = `${vx}|${vz}`;
    if (outdoorTerrainHeightCache.has(cacheKey)) return outdoorTerrainHeightCache.get(cacheKey);

    const baseSurfaceY = getOutdoorBaseSurfaceY(vx, vz);
    if (!Number.isFinite(baseSurfaceY)) return baseSurfaceY;

    let result = baseSurfaceY;
    if (isRiverCell(vx, vz)) {
        result = baseSurfaceY - getRiverDepthAt(vx, vz);
    }

    if (outdoorTerrainHeightCache.size > 2500) {
        // Simple LRU-ish eviction: clear the first key added
        const firstKey = outdoorTerrainHeightCache.keys().next().value;
        outdoorTerrainHeightCache.delete(firstKey);
    }
    outdoorTerrainHeightCache.set(cacheKey, result);
    return result;
}

function getOutdoorRenderableSupportY(x, z, fromY = null) {
    const visualSurfaceY = getEarthVisualSurfaceY(x, z);
    if (Number.isFinite(visualSurfaceY)) {
        return snapToVoxel(visualSurfaceY);
    }
    const sampleSurfaceY = Number.isFinite(fromY) ? Number(fromY) : getOutdoorTerrainSurfaceY(x, z);
    return Number.isFinite(sampleSurfaceY) ? snapToVoxel(sampleSurfaceY) : null;
}

function getOutdoorRenderSurfaceY(x, z) {
    return getEarthVisualSurfaceY(x, z);
}

function getOutdoorSurfaceAnchor(x, z) {
    const visualY = getEarthVisualSurfaceY(x, z);
    const topFaceY = getEarthTopFaceY(x, z);
    if (!Number.isFinite(visualY) || !Number.isFinite(topFaceY)) return null;
    return {
        x: snapToVoxel(x),
        y: topFaceY,
        z: snapToVoxel(z),
        normal: getOutdoorSurfaceNormalAt(x, topFaceY, z)
    };
}

function getPolarSnowExposure(x, z, sunDirection) {
    const safeSunDirection = sunDirection?.clone?.();
    if (!safeSunDirection || safeSunDirection.lengthSq() < 1e-6) return 0;
    const visualY = getEarthVisualSurfaceY(x, z);
    if (!Number.isFinite(visualY) || isOutdoorSnowBlockedCell(x, z)) return 0;
    const lightingState = getEarthSolarLightingState();
    const polarAxis = lightingState?.earthState?.spinAxis?.clone?.() || new THREE.Vector3(0, 1, 0);
    polarAxis.normalize();
    const surfaceNormal = getOutdoorSurfaceNormalAt(x, visualY, z);
    const sunAltitude = surfaceNormal.dot(safeSunDirection.normalize());
    const lowExposure = 1 - THREE.MathUtils.smoothstep(sunAltitude, -0.04, 0.28);
    const polarLatitude = Math.abs(surfaceNormal.dot(polarAxis));
    const polarBias = THREE.MathUtils.smoothstep(polarLatitude, 0.34, 0.86);
    const nightBoost = sunAltitude < -0.08 ? 0.14 : 0;
    return clamp01((lowExposure * polarBias) + nightBoost);
}

function getEarthSurfaceSupportState(x, z) {
    const sample = getClampedEarthSurfaceSample(x, z, 0.1);
    const smoothTerrainSupportY = getOutdoorBaseSurfaceYContinuous(sample.x, sample.z);
    let supportY = getEarthWalkableSurfaceY(sample.x, sample.z);
    let supportPointY = Number.isFinite(smoothTerrainSupportY)
        ? Number(smoothTerrainSupportY) + 0.5
        : supportY;
    let supportNormal = getEarthWalkableSurfaceNormal(sample.x, sample.z);
    const queryY = Number.isFinite(supportY)
        ? supportY + PLAYER_EYE_HEIGHT
        : PLAYER_EYE_HEIGHT + 1;
    const queryResults = collisionBroadphase?.query?.(
        new THREE.Vector3(sample.x, queryY, sample.z),
        Math.max(PLAYER_RADIUS + 1.1, STEP_UP_HEIGHT + 0.5),
        {
            actorType: 'playerLocal',
            mask: collisionBroadphase?.masks?.playerLocal,
            placedItems,
            getCollisionBox: getPlacedItemCollisionBox
        }
    ) || [];
    queryResults.forEach((mesh) => {
        const box = getPlacedItemCollisionBox(mesh);
        if (!box) return;
        const padding = Number.isFinite(mesh?.userData?.collisionPadding) ? mesh.userData.collisionPadding : 0.05;
        const overlapsXZ = sample.x >= (box.min.x - PLAYER_RADIUS - padding)
            && sample.x <= (box.max.x + PLAYER_RADIUS + padding)
            && sample.z >= (box.min.z - PLAYER_RADIUS - padding)
            && sample.z <= (box.max.z + PLAYER_RADIUS + padding);
        if (!overlapsXZ) return;
        if (!(mesh?.userData?.isStepable || mesh?.userData?.isSeatable)) return;
        const topY = mesh.userData.collisionTop ?? box.max.y;
        if (!Number.isFinite(topY)) return;
        if (!Number.isFinite(supportY) || (topY >= (supportY - 0.45) && topY <= (supportY + 4.2))) {
            supportY = Math.max(Number.isFinite(supportY) ? supportY : -Infinity, topY);
            if (!Number.isFinite(supportPointY) || topY > supportPointY) {
                supportPointY = topY;
            }
        }
    });
    const supportPoint = Number.isFinite(supportPointY)
        ? new THREE.Vector3(sample.x, supportPointY, sample.z)
        : null;
    if ((!supportNormal || supportNormal.lengthSq() < 1e-6) && supportPoint) {
        supportNormal = getCubeSurfaceState(supportPoint, lastEarthSurfaceFaceHint).up.clone();
    }
    if (supportNormal && supportNormal.lengthSq() > 1e-6) {
        supportNormal.normalize();
    } else {
        supportNormal = new THREE.Vector3(0, 1, 0);
    }
    const radialDistance = supportPoint
        ? Math.max(
            Math.abs(supportPoint.x),
            Math.abs(supportPoint.y - getEarthCenter().y),
            Math.abs(supportPoint.z)
        )
        : null;
    return {
        x: sample.x,
        z: sample.z,
        clamped: sample.clamped,
        supportY: Number.isFinite(supportY) ? supportY : null,
        supportPoint,
        supportNormal,
        radialDistance,
        clearance: Number.isFinite(radialDistance) ? (radialDistance - OUTDOOR_WORLD_RADIUS) : null
    };
}

function getEarthSurfaceSupportStateAtPosition(position = null) {
    const sample = position?.clone?.() || ensurePlayerWorldPosition().clone();
    const earthCenter = getEarthCenter();
    const offset = sample.clone().sub(earthCenter);
    const radial = offset.clone().normalize();
    if (radial.lengthSq() < 1e-6) {
        radial.set(0, 1, 0);
    }

    const buildCubeFallbackSupport = () => {
        const cubeState = getCubeSurfaceState(sample, lastEarthSurfaceFaceHint);
        const supportNormal = cubeState?.up?.clone?.() || new THREE.Vector3(0, 1, 0);
        const supportPoint = cubeState?.projectedSurfacePoint?.clone?.()
            || sample.clone().sub(earthCenter).setLength(OUTDOOR_WORLD_RADIUS).add(earthCenter);
        const supportOffset = supportPoint.clone().sub(earthCenter);
        const cubicDistance = Math.max(
            Math.abs(supportOffset.x),
            Math.abs(supportOffset.y),
            Math.abs(supportOffset.z)
        );
        return {
            x: Number(supportPoint.x || 0),
            z: Number(supportPoint.z || 0),
            clamped: false,
            supportY: Number(supportPoint.y || 0),
            supportPoint,
            supportNormal: supportNormal.normalize(),
            radialDistance: cubicDistance,
            clearance: Number(cubicDistance - OUTDOOR_WORLD_RADIUS)
        };
    };

    let supportVoxel = null;
    const hasVoxelData = outdoorWorldVoxelKeys.size > 0;

    const absX = Math.abs(offset.x);
    const absY = Math.abs(offset.y);
    const absZ = Math.abs(offset.z);
    const maxAxis = Math.max(absX, absY, absZ);
    const surfaceDistance = OUTDOOR_WORLD_RADIUS / Math.max(1e-6, Math.max(Math.abs(radial.x), Math.abs(radial.y), Math.abs(radial.z)));

    if (!hasVoxelData || maxAxis > (OUTDOOR_WORLD_RADIUS + 8)) {
        return buildCubeFallbackSupport();
    }

    if (hasVoxelData) {
        // Probe along radial starting from well above the cubic surface
        for (let radius = surfaceDistance + 2; radius >= (surfaceDistance - 8); radius -= 0.25) {
            const probe = earthCenter.clone().addScaledVector(radial, radius);
            const vx = snapToVoxel(probe.x);
            const vy = snapToVoxel(probe.y);
            const vz = snapToVoxel(probe.z);
            if (!isSolidOutdoorWorldVoxelAt(vx, vy, vz)) continue;
            supportVoxel = new THREE.Vector3(vx, vy, vz);
            break;
        }
    }

    if (!supportVoxel) {
        return buildCubeFallbackSupport();
    }

    const supportNormal = getCubeSurfaceState(supportVoxel, lastEarthSurfaceFaceHint).up.clone();
    const supportPoint = supportVoxel.clone().addScaledVector(supportNormal, 0.5);
    const supportOffset = supportPoint.clone().sub(earthCenter);
    const cubicDistance = Math.max(
        Math.abs(supportOffset.x),
        Math.abs(supportOffset.y),
        Math.abs(supportOffset.z)
    );

    return {
        x: Number(supportPoint.x || 0),
        z: Number(supportPoint.z || 0),
        clamped: false,
        supportY: Number(supportPoint.y || 0),
        supportPoint,
        supportNormal,
        radialDistance: cubicDistance,
        clearance: Number(cubicDistance - OUTDOOR_WORLD_RADIUS)
    };
}

function samplePlanetWalkSurface(x, z) {
    const supportState = getEarthSurfaceSupportState(x, z);
    const supportPoint = supportState?.supportPoint || null;
    const supportNormal = supportState?.supportNormal || null;
    return {
        x: Number(supportState?.x ?? x),
        z: Number(supportState?.z ?? z),
        clamped: !!supportState?.clamped,
        supportY: Number.isFinite(supportState?.supportY) ? Number(supportState.supportY) : null,
        supportPoint: supportPoint ? {
            x: Number(supportPoint.x || 0),
            y: Number(supportPoint.y || 0),
            z: Number(supportPoint.z || 0)
        } : null,
        supportNormal: supportNormal ? {
            x: Number(supportNormal.x || 0),
            y: Number(supportNormal.y || 0),
            z: Number(supportNormal.z || 0)
        } : null,
        radialDistance: Number.isFinite(supportState?.radialDistance) ? Number(supportState.radialDistance) : null,
        clearance: Number.isFinite(supportState?.clearance) ? Number(supportState.clearance) : null
    };
}

function buildPlanetSurfaceProbe(points = []) {
    const normalizedPoints = Array.isArray(points) && points.length
        ? points
        : [
            { id: 'north', x: 0, z: -72 },
            { id: 'south', x: 0, z: 78 },
            { id: 'east', x: 68, z: 0 },
            { id: 'west', x: -68, z: 0 },
            { id: 'south_center', x: 0, z: 46 },
            { id: 'south_mid', x: 0, z: 78 }
        ];
    const samples = normalizedPoints.map((point) => ({
        id: String(point.id || `${point.x}:${point.z}`),
        sample: samplePlanetWalkSurface(point.x, point.z)
    }));
    const route = [];
    for (let step = 0; step <= 24; step += 1) {
        const t = step / 24;
        const z = THREE.MathUtils.lerp(46, 78, t);
        route.push({
            id: `south_route_${step}`,
            sample: samplePlanetWalkSurface(0, z)
        });
    }
    let maxClearanceJump = 0;
    let maxNormalAngleDeg = 0;
    for (let i = 1; i < route.length; i += 1) {
        const prev = route[i - 1].sample;
        const next = route[i].sample;
        if (Number.isFinite(prev.clearance) && Number.isFinite(next.clearance)) {
            maxClearanceJump = Math.max(maxClearanceJump, Math.abs(next.clearance - prev.clearance));
        }
        if (prev.supportNormal && next.supportNormal) {
            const prevNormal = new THREE.Vector3(prev.supportNormal.x, prev.supportNormal.y, prev.supportNormal.z).normalize();
            const nextNormal = new THREE.Vector3(next.supportNormal.x, next.supportNormal.y, next.supportNormal.z).normalize();
            maxNormalAngleDeg = Math.max(maxNormalAngleDeg, THREE.MathUtils.radToDeg(prevNormal.angleTo(nextNormal)));
        }
    }
    return {
        samples,
        southRoute: route,
        continuity: {
            maxClearanceJump: Number(maxClearanceJump.toFixed(4)),
            maxNormalAngleDeg: Number(maxNormalAngleDeg.toFixed(4))
        },
        currentFace: movementController?.state?.currentCubeFace || getCurrentEarthFaceForStreaming(),
        faceTransitionCount: Number(movementController?.state?.faceTransitionCount || 0),
        chunkQueueByFace: summarizeOutdoorChunkQueueByFace()
    };
}

function getOutdoorWorldCacheKey(options = {}) {
    const radius = Number.isFinite(Number(options.radius)) ? Math.round(Number(options.radius)) : OUTDOOR_WORLD_RADIUS;
    const shell = 0;
    const surface = 1;
    const scenePreset = getActiveScenePresetConfig();
    return [
        String(currentRoomId || ''),
        OUTDOOR_WORLD_VERSION,
        OUTDOOR_WORLD_STYLE,
        'runtime_cache_v7',
        String(scenePreset.id || 'default_classroom_planet_v1'),
        radius,
        shell,
        surface,
        Math.round(outdoorRiverExpansionLevel || 0),
        outdoorTerrainRemovedTopCells.size,
        outdoorTerrainRemovedVoxelKeys.size
    ].join('|');
}

function isOutdoorWorldCacheValid(options = {}) {
    return !!outdoorWorldRuntimeCache
        && outdoorWorldRuntimeCacheKey === getOutdoorWorldCacheKey(options);
}

function invalidateOutdoorWorldRuntimeCache(reason = '') {
    outdoorWorldRuntimeCache = null;
    outdoorWorldRuntimeCacheKey = '';
    outdoorWorldChunkQueue = [];
    outdoorWorldBuildState = null;
    outdoorWorldBuildPromise = null;
    outdoorWorldReadyLevel = 'none';
    outdoorWorldSurfaceQueued = false;
    outdoorWorldBuildFramePending = false;
    if (reason) {
        console.info('[ASCraft] invalidated outdoor world cache:', reason);
    }
}

function isVolleyballCourtCell(x, z) {
    return Math.abs(x - VOLLEYBALL_COURT_CENTER_X) <= VOLLEYBALL_COURT_HALF_WIDTH
        && Math.abs(z - VOLLEYBALL_COURT_CENTER_Z) <= VOLLEYBALL_COURT_HALF_DEPTH;
}

function isVolleyballBoundaryCell(x, z) {
    const relX = Math.abs(x - VOLLEYBALL_COURT_CENTER_X);
    const relZ = Math.abs(z - VOLLEYBALL_COURT_CENTER_Z);
    return relX === VOLLEYBALL_COURT_HALF_WIDTH
        || relZ === VOLLEYBALL_COURT_HALF_DEPTH;
}

function isSoccerFieldCell(x, z) {
    return Math.abs(x - SOCCER_COURT_CENTER_X) <= SOCCER_COURT_HALF_WIDTH
        && Math.abs(z - SOCCER_COURT_CENTER_Z) <= SOCCER_COURT_HALF_DEPTH;
}

function isSoccerBoundaryCell(x, z) {
    const relX = Math.abs(x - SOCCER_COURT_CENTER_X);
    const relZ = Math.abs(z - SOCCER_COURT_CENTER_Z);
    return relX === SOCCER_COURT_HALF_WIDTH
        || relZ === SOCCER_COURT_HALF_DEPTH;
}

function isRoomClearanceCell(x, z) {
    const roomClearanceX = (ROOM_WIDTH / 2) + 2;
    const roomClearanceZ = (ROOM_DEPTH / 2) + 2;
    return Math.abs(x) <= roomClearanceX && Math.abs(z) <= roomClearanceZ;
}

function isRoomApronCell(x, z) {
    const apronHalfX = (ROOM_WIDTH / 2) + 8;
    const apronHalfZ = (ROOM_DEPTH / 2) + 8;
    return !isRoomClearanceCell(x, z)
        && Math.abs(x) <= apronHalfX
        && Math.abs(z) <= apronHalfZ;
}

function isSurfaceProtectedForRiverOrTrees(x, z) {
    if (isRoomClearanceCell(x, z)) return true;
    if (isRoomApronCell(x, z)) return true;
    if (isEntryTunnelCell(x, 0, z)) return true;
    if (isVolleyballCourtCell(x, z)) return true;
    if (isSoccerFieldCell(x, z)) return true;
    const flatZoneInfo = getOutdoorFlatZoneInfo(x, z);
    if (flatZoneInfo && flatZoneInfo.distance <= flatZoneInfo.zone.radius + 2) return true;
    const terraceInfo = getCardinalTerraceInfo(x, z);
    if (terraceInfo && terraceInfo.distance <= terraceInfo.terrace.radius + 2) return true;
    return false;
}

function getRiverCenterZAtX(x) {
    const baseCenterZ = Math.round((Math.sin(x * 0.083) * 20) + (Math.sin((x * 0.027) + 1.1) * 8));
    if (!isSurfaceProtectedForRiverOrTrees(x, baseCenterZ)) {
        return baseCenterZ;
    }
    for (let offset = 1; offset <= OUTDOOR_WORLD_RADIUS; offset += 1) {
        const up = baseCenterZ + offset;
        if (!isSurfaceProtectedForRiverOrTrees(x, up)) return up;
        const down = baseCenterZ - offset;
        if (!isSurfaceProtectedForRiverOrTrees(x, down)) return down;
    }
    return baseCenterZ;
}

function isRiverCell(x, z) {
    const centerZ = getRiverCenterZAtX(x);
    return Math.abs(z - centerZ) <= getDynamicRiverHalfWidth(x);
}

function isTerrainDocId(docId) {
    return String(docId || '').startsWith('terrain_');
}

function isTerrainItemData(data) {
    return !!data?.terrain || isTerrainDocId(data?.docId) || String(data?.itemId || '').toLowerCase() === 'grass_block';
}

function timestampToMillis(value) {
    if (!value) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.seconds === 'number') {
        return (value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1e6);
    }
    if (value instanceof Date) return value.getTime();
    return null;
}

function getSystemTimeZone() {
    try {
        const resolved = Intl.DateTimeFormat().resolvedOptions?.().timeZone;
        return resolved && typeof resolved === 'string' ? resolved : 'UTC';
    } catch (_) {
        return 'UTC';
    }
}

function isValidTimeZone(timeZone) {
    try {
        Intl.DateTimeFormat('en-US', { timeZone: String(timeZone || 'UTC') }).format(new Date());
        return true;
    } catch (_) {
        return false;
    }
}

function resolveRoomTimePreset(presetId = DEFAULT_ROOM_TIME_PRESET) {
    const safeId = String(presetId || DEFAULT_ROOM_TIME_PRESET).trim().toLowerCase();
    return ROOM_TIME_PRESETS[safeId] || ROOM_TIME_PRESETS[DEFAULT_ROOM_TIME_PRESET];
}

function getDefaultRoomTimeSettings() {
    const preset = resolveRoomTimePreset(DEFAULT_ROOM_TIME_PRESET);
    const now = Date.now();
    return {
        timeZone: getSystemTimeZone(),
        timeScalePreset: preset.id,
        dayDurationHoursReal: preset.dayDurationHoursReal,
        yearDurationHoursReal: preset.yearDurationHoursReal,
        manualOverrideEnabled: false,
        manualEpochMs: now,
        timeAnchorMs: now,
        seasonMode: 'astronomical',
        skyCycleVersion: SKY_CYCLE_VERSION
    };
}

function normalizeRoomTimeSettings(source = null) {
    const raw = source?.timeSettings && typeof source.timeSettings === 'object'
        ? source.timeSettings
        : (source && typeof source === 'object' ? source : {});
    const preset = resolveRoomTimePreset(raw.timeScalePreset);
    const hasCustomDurations = Number.isFinite(Number(raw.dayDurationHoursReal))
        && Number.isFinite(Number(raw.yearDurationHoursReal));
    const timeZone = isValidTimeZone(raw.timeZone) ? String(raw.timeZone) : getSystemTimeZone();
    const dayDurationHoursReal = Math.max(
        1 / 120,
        Number(hasCustomDurations ? raw.dayDurationHoursReal : preset.dayDurationHoursReal || DEFAULT_DAY_DURATION_HOURS_REAL)
    );
    const yearDurationHoursReal = Math.max(
        dayDurationHoursReal,
        Number(hasCustomDurations ? raw.yearDurationHoursReal : preset.yearDurationHoursReal || DEFAULT_YEAR_DURATION_HOURS_REAL)
    );
    const manualEpochMs = timestampToMillis(raw.manualEpochMs) || Date.now();
    const timeAnchorMs = timestampToMillis(raw.timeAnchorMs) || manualEpochMs;
    const normalizedPresetId = hasCustomDurations
        && (
            Math.abs(dayDurationHoursReal - Number(preset.dayDurationHoursReal || 0)) > 0.00001
            || Math.abs(yearDurationHoursReal - Number(preset.yearDurationHoursReal || 0)) > 0.00001
        )
        ? 'custom'
        : preset.id;
    return {
        timeZone,
        timeScalePreset: normalizedPresetId,
        dayDurationHoursReal,
        yearDurationHoursReal,
        manualOverrideEnabled: !!raw.manualOverrideEnabled,
        manualEpochMs,
        timeAnchorMs,
        seasonMode: 'astronomical',
        skyCycleVersion: SKY_CYCLE_VERSION
    };
}

function getRoomTimeSettingsPayload(settings = roomTimeSettings) {
    const normalized = normalizeRoomTimeSettings(settings);
    return {
        timeZone: normalized.timeZone,
        timeScalePreset: normalized.timeScalePreset,
        dayDurationHoursReal: Number(normalized.dayDurationHoursReal),
        yearDurationHoursReal: Number(normalized.yearDurationHoursReal),
        manualOverrideEnabled: !!normalized.manualOverrideEnabled,
        manualEpochMs: Number(normalized.manualEpochMs),
        timeAnchorMs: Number(normalized.timeAnchorMs),
        seasonMode: 'astronomical',
        skyCycleVersion: SKY_CYCLE_VERSION
    };
}

function getTimeZoneFormatter(timeZone, options = {}) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: isValidTimeZone(timeZone) ? timeZone : 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
        ...options
    });
}

function getTimeZoneDateParts(epochMs = Date.now(), timeZone = getSystemTimeZone()) {
    const parts = getTimeZoneFormatter(timeZone).formatToParts(new Date(epochMs));
    const record = {};
    parts.forEach((part) => {
        if (part.type !== 'literal') {
            record[part.type] = Number(part.value);
        }
    });
    return {
        year: Number(record.year || 1970),
        month: Number(record.month || 1),
        day: Number(record.day || 1),
        hour: Number(record.hour || 0),
        minute: Number(record.minute || 0),
        second: Number(record.second || 0)
    };
}

function getTimeZoneOffsetMs(epochMs = Date.now(), timeZone = getSystemTimeZone()) {
    // Use a whole-second reference to avoid fractional-ms jitter/quantization
    // when converting zone parts back to UTC.
    const safeEpochMs = Number(epochMs || 0);
    const baseEpochMs = Math.floor(safeEpochMs / 1000) * 1000;
    const parts = getTimeZoneDateParts(baseEpochMs, timeZone);
    const utcFromParts = Date.UTC(
        parts.year,
        Math.max(0, parts.month - 1),
        parts.day,
        parts.hour,
        parts.minute,
        parts.second
    );
    return utcFromParts - baseEpochMs;
}

function parseZonedDateTimeInput(value = '', timeZone = getSystemTimeZone()) {
    const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!match) return null;
    const [, yearStr, monthStr, dayStr, hourStr, minuteStr] = match;
    const utcGuess = Date.UTC(
        Number(yearStr),
        Number(monthStr) - 1,
        Number(dayStr),
        Number(hourStr),
        Number(minuteStr),
        0
    );
    let offset = getTimeZoneOffsetMs(utcGuess, timeZone);
    let epoch = utcGuess - offset;
    const refinedOffset = getTimeZoneOffsetMs(epoch, timeZone);
    if (refinedOffset !== offset) {
        epoch = utcGuess - refinedOffset;
    }
    return epoch;
}

function formatEpochForDateTimeInput(epochMs = Date.now(), timeZone = getSystemTimeZone()) {
    const parts = getTimeZoneDateParts(epochMs, timeZone);
    const pad = (value) => String(Math.max(0, Number(value || 0))).padStart(2, '0');
    return `${String(parts.year).padStart(4, '0')}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

function formatRoomTimeLabel(epochMs = Date.now(), timeZone = getSystemTimeZone()) {
    try {
        return new Intl.DateTimeFormat('es-MX', {
            timeZone: isValidTimeZone(timeZone) ? timeZone : 'UTC',
            dateStyle: 'medium',
            timeStyle: 'short'
        }).format(new Date(epochMs));
    } catch (_) {
        return new Date(epochMs).toISOString();
    }
}

function mod(value, divisor) {
    const safeDivisor = Math.max(1, Number(divisor || 1));
    return ((Number(value || 0) % safeDivisor) + safeDivisor) % safeDivisor;
}

function getRoomTimeState(now = Date.now()) {
    const settings = normalizeRoomTimeSettings(roomTimeSettings || getDefaultRoomTimeSettings());
    const dayDurationMs = Math.max(60_000, settings.dayDurationHoursReal * 60 * 60 * 1000);
    const yearDurationMs = Math.max(dayDurationMs, settings.yearDurationHoursReal * 60 * 60 * 1000);
    const sourceEpochMs = settings.manualOverrideEnabled
        ? settings.manualEpochMs + Math.max(0, now - settings.timeAnchorMs)
        : now;
    const zonedEpochMs = sourceEpochMs + getTimeZoneOffsetMs(sourceEpochMs, settings.timeZone);
    const dayProgress = mod(zonedEpochMs, dayDurationMs) / dayDurationMs;
    const yearProgress = mod(zonedEpochMs, yearDurationMs) / yearDurationMs;
    const seasonIndex = Math.floor(yearProgress * SEASON_ORDER.length) % SEASON_ORDER.length;
    const season = SEASON_ORDER[seasonIndex] || 'spring';
    const seasonProgress = mod(yearProgress * SEASON_ORDER.length, 1);
    let weather = 'clear';
    const weatherPulse = (Math.sin((yearProgress * Math.PI * 2 * 9.4) + (dayProgress * Math.PI * 2 * 0.7)) + 1) * 0.5;
    if (season === 'spring') {
        weather = weatherPulse > 0.74 ? 'rain' : (weatherPulse > 0.56 ? 'bloom' : 'clear');
    } else if (season === 'summer') {
        weather = weatherPulse > 0.78 ? 'storm' : (weatherPulse > 0.58 ? 'rain' : 'clear');
    } else if (season === 'autumn') {
        weather = weatherPulse > 0.72 ? 'wind' : (weatherPulse > 0.54 ? 'rain' : 'clear');
    } else {
        weather = weatherPulse > 0.82 ? 'blizzard' : (weatherPulse > 0.58 ? 'snow' : 'clear');
    }
    return {
        settings,
        epochMs: zonedEpochMs,
        sourceEpochMs,
        dayDurationMs,
        yearDurationMs,
        dayProgress,
        yearProgress,
        season,
        seasonProgress,
        weather,
        localHour: dayProgress * 24,
        timeLabel: formatRoomTimeLabel(sourceEpochMs, settings.timeZone),
        timeZone: settings.timeZone
    };
}

function getPlanetAstronomyNormal(position) {
    const center = getPlanetCenter();
    const radial = (position?.clone?.() || new THREE.Vector3()).sub(center);
    if (radial.lengthSq() < 1e-6) {
        radial.set(0, 1, 0);
    } else {
        radial.normalize();
    }
    return radial;
}

function getAngularProgress(nowMs = Date.now(), periodMs = 60_000, phaseOffset = 0) {
    const normalizedPeriod = Math.max(1, Number(periodMs || 1));
    return ((mod(nowMs, normalizedPeriod) / normalizedPeriod) * Math.PI * 2 + Number(phaseOffset || 0)) % (Math.PI * 2);
}

function getConfigPeriodMsFromSpeed(speed, fallbackMs = SKY_CYCLE_DURATION_MS) {
    const safeSpeed = Number(speed || 0);
    return safeSpeed > 0 ? ((Math.PI * 2) / safeSpeed) : Math.max(1, Number(fallbackMs || SKY_CYCLE_DURATION_MS));
}

function isRaycastIgnoredObject(object) {
    let current = object;
    while (current) {
        if (current.userData?.ignoreRaycast) return true;
        current = current.parent;
    }
    return false;
}

function markRaycastIgnored(object) {
    if (!object) return;
    object.userData = object.userData || {};
    object.userData.ignoreRaycast = true;
    if (typeof object.traverse === 'function') {
        object.traverse((child) => {
            child.userData = child.userData || {};
            child.userData.ignoreRaycast = true;
        });
    }
}

function getRaycastTargets() {
    return (scene?.children || []).filter((child) => !isRaycastIgnoredObject(child));
}

function createSeededRandom(seedText) {
    let hash = 2166136261;
    const seed = String(seedText || 'ASCraft');
    for (let i = 0; i < seed.length; i += 1) {
        hash ^= seed.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return () => {
        hash += 0x6D2B79F5;
        let t = hash;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function createRadialGlowTexture(innerColor, outerColor, size = 128) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, innerColor);
    gradient.addColorStop(0.25, innerColor);
    gradient.addColorStop(0.65, outerColor.replace('0)', '0.12)'));
    gradient.addColorStop(1, outerColor);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
}

function createSolarHaloTexture(size = 256) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const center = size * 0.5;
    const innerRadius = size * 0.14;
    const outerRadius = size * 0.5;
    const ring = ctx.createRadialGradient(center, center, innerRadius, center, center, outerRadius);
    ring.addColorStop(0, 'rgba(255,255,255,0)');
    ring.addColorStop(0.24, 'rgba(255,245,210,0.08)');
    ring.addColorStop(0.5, 'rgba(255,210,140,0.36)');
    ring.addColorStop(0.78, 'rgba(255,180,100,0.1)');
    ring.addColorStop(1, 'rgba(255,170,72,0)');
    ctx.fillStyle = ring;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
}

function createSkyBackdropTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    // Flat sky texture (no gradient, no banding), color mood is driven only by runtime skyColor.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
}

function getSnowflakeParticleTexture() {
    if (snowflakeParticleTexture) return snowflakeParticleTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.98)';
    ctx.lineCap = 'round';
    ctx.lineWidth = 3.2;
    for (let i = 0; i < 6; i += 1) {
        ctx.save();
        ctx.rotate((Math.PI / 3) * i);
        ctx.beginPath();
        ctx.moveTo(0, -18);
        ctx.lineTo(0, 18);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(-6, -4);
        ctx.moveTo(0, -10);
        ctx.lineTo(6, -4);
        ctx.moveTo(0, 10);
        ctx.lineTo(-6, 4);
        ctx.moveTo(0, 10);
        ctx.lineTo(6, 4);
        ctx.stroke();
        ctx.restore();
    }
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 28);
    glow.addColorStop(0, 'rgba(255,255,255,0.16)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.fill();
    snowflakeParticleTexture = new THREE.CanvasTexture(canvas);
    snowflakeParticleTexture.colorSpace = THREE.SRGBColorSpace;
    snowflakeParticleTexture.needsUpdate = true;
    return snowflakeParticleTexture;
}

function createStarsGeometry(rng) {
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const sizes = [];
    const phases = [];
    const speeds = [];
    const intensities = [];
    for (let i = 0; i < SKY_STAR_COUNT; i += 1) {
        const azimuth = rng() * Math.PI * 2;
        const verticalUnit = (rng() * 2) - 1;
        const radius = SKY_RADIUS - 12 - (rng() * 72);
        const radialUnit = Math.sqrt(Math.max(0, 1 - (verticalUnit * verticalUnit)));
        positions.push(
            Math.cos(azimuth) * radialUnit * radius,
            verticalUnit * radius,
            Math.sin(azimuth) * radialUnit * radius
        );
        sizes.push(0.24 + rng() * 0.76);
        phases.push(rng() * Math.PI * 2);
        speeds.push(0.45 + rng() * 1.3);
        intensities.push(0.72 + rng() * 0.28);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
    geometry.setAttribute('aSpeed', new THREE.Float32BufferAttribute(speeds, 1));
    geometry.setAttribute('aIntensity', new THREE.Float32BufferAttribute(intensities, 1));
    return geometry;
}

function createMilkyWayGeometry(rng) {
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const sizes = [];
    const alphas = [];
    const galacticTilt = 0.78;
    const galacticNode = 1.16;
    const galaxyCoreAzimuth = 4.88;
    const TAU = Math.PI * 2;
    const sampleGaussian = (sigma = 1) => {
        const u1 = Math.max(1e-6, rng());
        const u2 = rng();
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(TAU * u2) * sigma;
    };
    for (let i = 0; i < SKY_MILKY_WAY_STAR_COUNT; i += 1) {
        const azimuth = rng() * Math.PI * 2;
        const coreDelta = Math.abs(Math.atan2(
            Math.sin(azimuth - galaxyCoreAzimuth),
            Math.cos(azimuth - galaxyCoreAzimuth)
        ));
        const coreBoost = Math.exp(-Math.pow(coreDelta / 0.54, 2));
        const thinBand = sampleGaussian(0.032 + ((1 - coreBoost) * 0.018));
        const thickBand = sampleGaussian(0.11 + ((1 - coreBoost) * 0.06));
        const bandOffset = THREE.MathUtils.clamp(
            THREE.MathUtils.lerp(thickBand, thinBand, 0.58 + (coreBoost * 0.34)),
            -0.34,
            0.34
        );
        const radius = SKY_RADIUS - 24 - (rng() * 16) + (coreBoost * 7.2);
        const direction = new THREE.Vector3(
            Math.cos(azimuth) * Math.cos(bandOffset),
            Math.sin(bandOffset),
            Math.sin(azimuth) * Math.cos(bandOffset)
        )
            .applyAxisAngle(new THREE.Vector3(0, 0, 1), galacticTilt)
            .applyAxisAngle(new THREE.Vector3(0, 1, 0), galacticNode)
            .normalize();
        positions.push(direction.x * radius, direction.y * radius, direction.z * radius);
        const dustLane = Math.exp(-Math.pow(bandOffset / 0.028, 2));
        const dustSuppression = dustLane * (0.2 + (coreBoost * 0.28)) * (0.55 + (rng() * 0.45));
        const bandDensity = clamp01(1 - (Math.abs(bandOffset) / 0.34));
        const brightness = clamp01(0.2 + (coreBoost * 0.72) + (bandDensity * 0.3) - dustSuppression);
        const warmMix = THREE.MathUtils.clamp((rng() * 0.22) + (coreBoost * 0.52), 0, 1);
        const coolColor = new THREE.Color(0x74c1ff);
        const warmColor = new THREE.Color(0xffd9ad);
        const color = coolColor.clone().lerp(warmColor, warmMix).multiplyScalar(0.34 + (brightness * 0.9));
        colors.push(color.r, color.g, color.b);
        sizes.push((1.2 + (brightness * 3.8) + (rng() * 1.2)) * 4.2);
        alphas.push(clamp01(0.24 + (brightness * 0.96)));
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute('aAlpha', new THREE.Float32BufferAttribute(alphas, 1));
    return geometry;
}

function createConstellationOverlay(rng) {
    const overlay = new THREE.Group();
    overlay.name = 'ASCraftConstellations';
    overlay.userData.ignoreRaycast = true;

    const toSkyPoint = (azimuth, elevation, radius = SKY_RADIUS - 28) => {
        const cosElevation = Math.cos(elevation);
        return new THREE.Vector3(
            Math.cos(azimuth) * cosElevation * radius,
            Math.sin(elevation) * radius,
            Math.sin(azimuth) * cosElevation * radius
        );
    };

    const defs = [
        {
            name: 'Orion',
            centerAz: 0.5,
            centerEl: 0.25,
            scale: 0.25,
            color: 0xbfdfff,
            stars: [
                [-0.2, 0.35],   // 0: Betelgeuse (hombro izq)
                [0.2, 0.35],    // 1: Bellatrix (hombro der)
                [0.05, 0.55],   // 2: Meissa (cabeza)
                [-0.1, 0.05],   // 3: Alnitak (cinturón izq)
                [0, 0.02],      // 4: Alnilam (cinturón centro)
                [0.1, -0.01],   // 5: Mintaka (cinturón der)
                [-0.2, -0.4],   // 6: Saiph (pie izq)
                [0.2, -0.3],    // 7: Rigel (pie der)
                [0, -0.2],      // 8: Espada

                // Escudo / Arco a la derecha de Bellatrix
                [0.45, 0.5],    // 9: Escudo 1
                [0.52, 0.35],   // 10: Escudo 2
                [0.55, 0.15],   // 11: Escudo 3
                [0.52, -0.05],  // 12: Escudo 4
                [0.45, -0.2],   // 13: Escudo 5

                // Mazo / Garrote levantado sobre Betelgeuse
                [-0.15, 0.65],  // 14: Brazo garrote
                [-0.25, 0.85],  // 15: Garrote punta izq
                [-0.05, 0.9]    // 16: Garrote punta der
            ],
            edges: [
                [0, 2], [1, 2],       // Cabeza a hombros
                [0, 3], [1, 5],       // Hombros a cinturón
                [3, 4], [4, 5],       // Cinturón (las 3 marías)
                [3, 6], [5, 7],       // Cinturón a pies
                [6, 7],               // Pies conectados (base)
                [4, 8],               // Espada colgando

                // Forma del Escudo curvo
                [9, 10], [10, 11], [11, 12], [12, 13],
                [1, 10],              // Unión de Bellatrix al escudo

                // Forma del mazo
                [0, 14], [14, 15], [14, 16]
            ]
        },
        {
            name: 'Ursa Major',
            centerAz: -0.5,
            centerEl: 0.6,
            scale: 0.25,
            color: 0xcfe5ff,
            stars: [
                [-0.7, 0.4],    // 0: Alkaid
                [-0.4, 0.2],    // 1: Mizar
                [-0.1, 0.05],   // 2: Alioth
                [0.15, 0],      // 3: Megrez
                [0.2, -0.3],    // 4: Phecda
                [0.6, -0.2],    // 5: Merak
                [0.65, 0.2]     // 6: Dubhe
            ],
            edges: [
                [0, 1], [1, 2], [2, 3], // Handle
                [3, 4], [4, 5], [5, 6], [6, 3] // Bowl
            ]
        },
        {
            name: 'Ursa Minor',
            centerAz: 0.1,
            centerEl: 0.85,
            scale: 0.18,
            color: 0xffffff,
            stars: [
                [0.6, 0.6],    // 0: Polaris
                [0.4, 0.4],    // 1: Yildun
                [0.2, 0.2],    // 2: Epsilon
                [0, 0],        // 3: Zeta
                [-0.3, 0.1],   // 4: Kochab
                [-0.4, -0.2],  // 5: Pherkad
                [-0.1, -0.2]   // 6: Eta
            ],
            edges: [
                [0, 1], [1, 2], [2, 3], // Handle
                [3, 4], [4, 5], [5, 6], [6, 3] // Bowl
            ]
        },
        {
            name: 'Cassiopeia',
            centerAz: 2.2,
            centerEl: 0.75,
            scale: 0.2,
            color: 0xf2f6ff,
            stars: [
                [-0.6, 0.4],   // 0: Segin
                [-0.3, -0.2],  // 1: Ruchbah
                [0, 0.2],      // 2: Gamma 
                [0.3, -0.3],   // 3: Schedar
                [0.6, 0.3]     // 4: Caph
            ],
            edges: [[0, 1], [1, 2], [2, 3], [3, 4]]
        },
        {
            name: 'Crux',
            centerAz: 3.6,
            centerEl: 0.2,
            scale: 0.16,
            color: 0xdbeaff,
            stars: [
                [0, 0.6],      // 0: Gacrux
                [0, -0.6],     // 1: Acrux
                [-0.4, 0.1],   // 2: Mimosa
                [0.3, 0.2]     // 3: Imai
            ],
            edges: [[0, 1], [2, 3]]
        },
        {
            name: 'Ursa Major', // El Gran Oso (completa)
            centerAz: 1.2,
            centerEl: 0.6,
            scale: 0.28,
            color: 0xffffd4,
            stars: [
                // El Cazo (Cuerpo del oso)
                [0.1, 0.4],    // 0: Dubhe (espalda)
                [-0.1, 0.35],  // 1: Merak (espalda abajo)
                [-0.2, 0.1],   // 2: Phecda (cuarto trasero)
                [0.1, 0.15],   // 3: Megrez (tronco)

                // Cola (Mango del cazo)
                [0.2, 0.05],   // 4: Alioth
                [0.35, -0.05], // 5: Mizar
                [0.55, -0.15], // 6: Alkaid

                // Cabeza
                [0.3, 0.42],   // 7: Cabeza base
                [0.45, 0.48],  // 8: Cabeza punta (Muscida)

                // Pata delantera
                [0.2, 0.55],   // 9: Hombro
                [0.25, 0.75],  // 10: Pata del (Talitha)

                // Patas traseras
                [-0.3, -0.1],  // 11: Pata tras 1
                [-0.45, -0.3], // 12: Pata tras punta 1 (Tania)
                [0.1, -0.1],   // 13: Pata tras 2
                [0.15, -0.4],  // 14: Pata tras punta 2 (Alula)

                [-0.4, 0.3],   // 15: Punta trasera del cuerpo
            ],
            edges: [
                [0, 1], [1, 2], [2, 3], [3, 0], // El cuerpo (cuadro del cazo)
                [3, 4], [4, 5], [5, 6],         // La cola
                [0, 7], [7, 8],                 // La cabeza
                [0, 9], [9, 10],                // Pata delantera
                [2, 11], [11, 12],              // Pata trasera 1
                [1, 13], [13, 14],              // Pata trasera 2
                [2, 15], [15, 1]                // Curva del lomo
            ]
        },
        {
            name: 'Ursa Minor',
            centerAz: 0.1,
            centerEl: 0.85,
            scale: 0.18,
            color: 0xffffff,
            stars: [
                [0, 0],        // 0: Polaris (punta cola)
                [-0.15, -0.05],// 1: Yildun
                [-0.3, -0.15], // 2: Pherkad
                [-0.5, -0.1],  // 3: Kochab (esquina cazo)
                [-0.55, -0.3], // 4: Ahfa
                [-0.35, -0.35],// 5
                [-0.3, -0.15]  // 6
            ],
            edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 2]]
        },
        {
            name: 'Leo', // El León
            centerAz: -2.0,
            centerEl: 0.35,
            scale: 0.3,
            color: 0xfff4d1,
            stars: [
                [0, 0],       // 0: Regulus (pecho)
                [0, 0.35],    // 1: Algieba (cuello)
                [0.2, 0.5],   // 2: Adhafera (cabeza arriba)
                [0.4, 0.45],  // 3: Rasalas (hocico)
                [0.45, 0.25], // 4: Cabeza abajo
                [0.2, 0.2],   // 5: Garganta

                [-0.4, -0.1], // 6: Zosma (cuarto trasero)
                [-0.8, 0],    // 7: Denebola (cola)
                [-0.5, -0.3]  // 8: Pata trasera
            ],
            edges: [
                [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 1], // La hoz/cabeza
                [0, 6], [6, 7], [6, 8], [8, 0] // El cuerpo y cola
            ]
        }
    ];

    const items = [];
    defs.forEach((def, idx) => {
        const group = new THREE.Group();
        group.name = `Constellation_${def.name}`;
        group.userData.ignoreRaycast = true;
        group.userData.baseOpacity = 0.85 + rng() * 0.15;
        group.userData.twinklePhase = rng() * Math.PI * 2;
        group.userData.twinkleSpeed = 0.25 + rng() * 0.45;

        const positions = [];
        def.stars.forEach(([dx, dy]) => {
            const az = def.centerAz + dx * def.scale;
            const el = def.centerEl + dy * def.scale;
            const p = toSkyPoint(az, el, SKY_RADIUS * 0.38 + (idx % 3) * 1.5);
            positions.push(p.x, p.y, p.z);
        });

        const linePositions = [];
        def.edges.forEach(([a, b]) => {
            const pa = new THREE.Vector3(positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2]);
            const pb = new THREE.Vector3(positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2]);
            linePositions.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
        });

        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
        const lineMat = new THREE.LineBasicMaterial({
            color: def.color,
            transparent: true,
            opacity: 0,
            depthWrite: false
        });
        const lines = new THREE.LineSegments(lineGeo, lineMat);
        group.add(lines);

        const pointGeo = new THREE.BufferGeometry();
        pointGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const pointMat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 12.0,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            map: createRadialGlowTexture('rgba(255,255,255,0.96)', 'rgba(255,255,255,0)', 48)
        });
        const points = new THREE.Points(pointGeo, pointMat);
        group.add(points);

        group.userData.lineMaterial = lineMat;
        group.userData.pointMaterial = pointMat;
        group.userData.points = points;
        group.userData.lines = lines;
        const anchor = new THREE.Vector3();
        for (let i = 0; i < positions.length; i += 3) {
            anchor.x += positions[i];
            anchor.y += positions[i + 1];
            anchor.z += positions[i + 2];
        }
        anchor.multiplyScalar(1 / Math.max(1, positions.length / 3));
        group.userData.labelAnchor = anchor;
        items.push(group);
        overlay.add(group);
    });

    return { overlay, items };
}

function createAuroraCurtainTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(0.12, 'rgba(210,255,246,0.24)');
    gradient.addColorStop(0.42, 'rgba(112,255,202,0.88)');
    gradient.addColorStop(0.74, 'rgba(88,198,255,0.5)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 18; i += 1) {
        const x = (i / 18) * canvas.width;
        const width = 3 + ((i % 4) * 2);
        const alpha = 0.06 + ((i % 5) * 0.018);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fillRect(x, 0, width, canvas.height);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
}

function createAuroraRibbonGeometry(width = 14, height = 40, phase = 0) {
    const geometry = new THREE.PlaneGeometry(width, height, 6, 14);
    const positionAttr = geometry.attributes.position;
    const halfHeight = height * 0.5;
    for (let i = 0; i < positionAttr.count; i += 1) {
        const x = positionAttr.getX(i);
        const y = positionAttr.getY(i);
        const yNorm = halfHeight > 0 ? (y / halfHeight) : 0;
        const widthFactor = 0.28 + (0.72 * (1 - Math.pow(Math.abs(yNorm), 1.18)));
        const wave = Math.sin((yNorm * Math.PI * 1.35) + phase) * (0.42 + (0.24 * (1 - Math.abs(yNorm))));
        positionAttr.setXYZ(i, x * widthFactor, y, wave * width * 0.12);
    }
    positionAttr.needsUpdate = true;
    geometry.computeBoundingSphere();
    return geometry;
}

function createAuroraSystem(rng) {
    const group = new THREE.Group();
    group.name = 'ASCraftAurora';
    markRaycastIgnored(group);

    const texture = createAuroraCurtainTexture();
    const northGroup = new THREE.Group();
    const southGroup = new THREE.Group();
    markRaycastIgnored(northGroup);
    markRaycastIgnored(southGroup);
    group.add(northGroup);
    group.add(southGroup);

    const buildHemisphere = (targetGroup) => {
        const ribbons = [];
        const ribbonCount = Math.max(5, Math.round(SKY_AURORA_RIBBON_COUNT * 0.58));
        for (let i = 0; i < ribbonCount; i += 1) {
            const ribbonPhase = rng() * Math.PI * 2;
            const orbitAngle = ((i + ((rng() - 0.5) * 0.95)) / ribbonCount) * Math.PI * 2;
            const ringRadius = SKY_RADIUS * (0.06 + (rng() * 0.05));
            const polarHeight = SKY_RADIUS * (0.74 + (rng() * 0.05));
            const ribbon = new THREE.Mesh(
                createAuroraRibbonGeometry(5.8 + (rng() * 2.6), 36 + (rng() * 16), ribbonPhase),
                new THREE.MeshBasicMaterial({
                    map: texture,
                    color: 0xaaffdf,
                    transparent: true,
                    opacity: 0,
                    side: THREE.DoubleSide,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    fog: false
                })
            );
            ribbon.position.set(
                Math.cos(orbitAngle) * ringRadius,
                polarHeight,
                Math.sin(orbitAngle) * ringRadius
            );
            ribbon.rotation.y = -orbitAngle + (Math.PI / 2);
            ribbon.rotation.x = -0.42 + ((rng() - 0.5) * 0.12);
            ribbon.rotation.z = (rng() - 0.5) * 0.12;
            ribbon.renderOrder = -842;
            ribbon.userData.baseOpacity = 0.06 + (rng() * 0.08);
            ribbon.userData.phase = ribbonPhase;
            ribbon.userData.speed = 0.3 + (rng() * 0.5);
            ribbon.userData.scalePulse = 0.9 + (rng() * 0.2);
            markRaycastIgnored(ribbon);
            targetGroup.add(ribbon);
            ribbons.push(ribbon);
        }
        return ribbons;
    };

    return {
        group,
        northGroup,
        southGroup,
        northRibbons: buildHemisphere(northGroup),
        southRibbons: buildHemisphere(southGroup)
    };
}

function createCometVisuals() {
    const group = new THREE.Group();
    group.name = 'ASCraftComets';
    markRaycastIgnored(group);
    const cometMap = new Map();
    HELIOCENTRIC_COMETS.forEach((cometCfg) => {
        const cometGroup = new THREE.Group();
        cometGroup.name = `ASCraftComet_${cometCfg.id}`;
        markRaycastIgnored(cometGroup);

        const head = new THREE.Sprite(new THREE.SpriteMaterial({
            map: createRadialGlowTexture('rgba(255,255,255,0.96)', 'rgba(255,255,255,0)', 96),
            color: cometCfg.color,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            fog: false
        }));
        head.renderOrder = -846;
        head.scale.setScalar(7.4);
        markRaycastIgnored(head);
        cometGroup.add(head);

        const tailGeometry = new THREE.BufferGeometry();
        tailGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
            0, 0, 0,
            0, 0, 0,
            0, 0, 0
        ], 3));
        const tail = new THREE.Line(
            tailGeometry,
            new THREE.LineBasicMaterial({
                color: cometCfg.tailColor,
                transparent: true,
                opacity: 0,
                depthWrite: false,
                fog: false
            })
        );
        tail.renderOrder = -847;
        markRaycastIgnored(tail);
        cometGroup.add(tail);

        group.add(cometGroup);
        cometMap.set(cometCfg.id, { group: cometGroup, head, tail, config: cometCfg });
    });
    return { group, cometMap };
}

function createMeteorSystem(maxMeteors = SKY_METEOR_POOL_SIZE) {
    const group = new THREE.Group();
    group.name = 'ASCraftMeteors';
    markRaycastIgnored(group);
    const meteors = [];
    for (let i = 0; i < maxMeteors; i += 1) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute([
            0, 0, 0,
            0, 0, 0,
            0, 0, 0
        ], 3));
        const material = new THREE.LineBasicMaterial({
            color: 0xfff5dc,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            fog: false
        });
        const line = new THREE.Line(geometry, material);
        line.visible = false;
        line.renderOrder = -844;
        line.userData = {
            active: false,
            startDirection: new THREE.Vector3(),
            endDirection: new THREE.Vector3(),
            trailDirection: new THREE.Vector3(),
            skyDistance: SKY_RADIUS * 0.72,
            streakLength: 18,
            startedAt: 0,
            lifeMs: 900
        };
        markRaycastIgnored(line);
        group.add(line);
        meteors.push(line);
    }
    return {
        group,
        meteors,
        nextSpawnAtMs: 0,
        lastVisibleCount: 0
    };
}

function createFocusLabelSprite(text, scale = [3.2, 0.48, 1]) {
    if (skyLightingRuntime?.createFocusLabelSprite) {
        const sprite = skyLightingRuntime.createFocusLabelSprite(text, scale);
        markRaycastIgnored(sprite);
        return sprite;
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 1024;
    canvas.height = 192;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '700 112px sans-serif';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.96)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = 'rgba(255,255,255,0.98)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(text || '').trim() || 'Etiqueta', canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        fog: false
    }));
    sprite.center.set(0.5, 0);
    sprite.scale.set(scale[0], scale[1], scale[2] || 1);
    sprite.material.opacity = 0;
    sprite.material.depthTest = true;
    sprite.material.needsUpdate = true;
    sprite.visible = false;
    sprite.renderOrder = -838;
    markRaycastIgnored(sprite);
    return sprite;
}

function createCloudCluster(rng) {
    const group = new THREE.Group();
    group.userData.ignoreRaycast = true;

    const voxelSize = 1.08 + rng() * 0.08;
    const voxelGeo = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
    const puffMat = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.22, // Much more subtle
        depthWrite: false
    });
    const halfWidth = 1 + Math.floor(rng() * 2);
    const halfDepth = 1 + Math.floor(rng() * 1);
    const cells = [];

    for (let x = -halfWidth; x <= halfWidth; x += 1) {
        for (let z = -halfDepth; z <= halfDepth; z += 1) {
            const edge = Math.max(Math.abs(x) / Math.max(1, halfWidth), Math.abs(z) / Math.max(1, halfDepth));
            if (edge > 1) continue;
            if (edge > 0.84 && rng() > 0.42) continue;
            cells.push({ x, y: 0, z });
            if (edge < 0.48 && rng() > 0.35) {
                cells.push({ x, y: 1, z });
            }
        }
    }

    if (!cells.length) {
        cells.push({ x: 0, y: 0, z: 0 });
    }

    const puffCount = cells.length;
    const puffMesh = new THREE.InstancedMesh(voxelGeo, puffMat, puffCount);

    for (let i = 0; i < puffCount; i += 1) {
        const cell = cells[i];
        const offsetX = cell.x * 1.08;
        const offsetY = cell.y * 0.82;
        const offsetZ = cell.z * 1.08;
        const scaleX = 1.12 + ((cell.y === 0 && Math.abs(cell.x) < halfWidth) ? 0.08 : 0);
        const scaleY = cell.y === 0 ? 0.46 : 0.42;
        const scaleZ = 1.12 + ((cell.y === 0 && Math.abs(cell.z) < halfDepth) ? 0.08 : 0);
        const matrix = new THREE.Matrix4();
        matrix.compose(
            new THREE.Vector3(offsetX, offsetY, offsetZ),
            new THREE.Quaternion(),
            new THREE.Vector3(scaleX, scaleY, scaleZ)
        );
        puffMesh.setMatrixAt(i, matrix);
    }
    puffMesh.instanceMatrix.needsUpdate = true;
    group.add(puffMesh);

    group.userData.cloudMaterial = puffMat;
    group.userData.baseScale = 5.6 + rng() * 2.8;
    const r = 1200 + rng() * 400; // Pushed MUCH further out into the background
    const phi = (rng() * 0.45 + 0.02) * Math.PI;
    const theta = rng() * Math.PI * 2;
    group.position.setFromSphericalCoords(r, phi, theta);
    group.lookAt(0, 0, 0);
    group.userData.orbitAngle = theta;
    group.userData.phiAngle = phi;
    group.userData.orbitRadius = r;
    group.userData.orbitSpeed = 0.008 + rng() * 0.01;
    group.userData.verticalWobble = 0.18 + rng() * 0.35;
    group.userData.verticalPhase = rng() * Math.PI * 2;
    group.userData.patternPhase = rng() * Math.PI * 2;
    group.userData.patternSpeed = 0.25 + rng() * 0.45;
    group.userData.bandTilt = (rng() - 0.5) * 0.12;
    group.userData.latitude = (rng() * 0.90 - 0.45) * Math.PI; // Full planet distribution [-81, 81 deg]
    group.scale.setScalar(group.userData.baseScale);
    return group;
}

function createCherryPetalSystem(maxParticles = 220) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(maxParticles * 3);
    const sizes = new Float32Array(maxParticles);
    const alphas = new Float32Array(maxParticles);
    const velocities = new Array(maxParticles);
    const anchors = new Uint16Array(maxParticles);

    for (let i = 0; i < maxParticles; i += 1) {
        positions[i * 3] = 0;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = 0;
        sizes[i] = 0.2 + Math.random() * 0.3;
        alphas[i] = 0.65 + Math.random() * 0.35;
        velocities[i] = new THREE.Vector3();
        anchors[i] = 0;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));

    const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        uniforms: {
            uPointColor: { value: new THREE.Color(0xffc3dd) }
        },
        vertexShader: `
            attribute float aSize;
            attribute float aAlpha;
            varying float vAlpha;
            void main() {
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                float perspective = 360.0 / max(16.0, -mvPosition.z);
                gl_PointSize = aSize * perspective * 1.25;
                vAlpha = aAlpha;
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 uPointColor;
            varying float vAlpha;
            void main() {
                vec2 uv = gl_PointCoord * 2.0 - 1.0;
                float d = dot(uv, uv);
                if (d > 1.0) discard;
                float petal = smoothstep(1.0, 0.1, d);
                gl_FragColor = vec4(uPointColor, petal * vAlpha);
            }
        `
    });

    const points = new THREE.Points(geometry, material);
    points.userData = {
        velocities,
        anchors,
        groundedUntil: new Float64Array(maxParticles),
        maxParticles
    };
    markRaycastIgnored(points);
    return points;
}

function createWeatherParticleSystem(count, isSnow = false) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count);
    const geometry_size = 64;

    for (let i = 0; i < count; i += 1) {
        positions[i * 3] = (Math.random() - 0.5) * geometry_size;
        positions[i * 3 + 1] = 64 + Math.random() * 64; // Fall from higher clouds
        positions[i * 3 + 2] = (Math.random() - 0.5) * geometry_size;
        velocities[i] = 0.2 + Math.random() * 0.45;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        color: isSnow ? 0xffffff : 0xadd8e6,
        size: isSnow ? 0.28 : 0.045, // Much smaller drops for realism
        map: isSnow ? getSnowflakeParticleTexture() : null,
        transparent: true,
        opacity: isSnow ? 0.82 : 0.74,
        depthWrite: false,
        alphaTest: isSnow ? 0.08 : 0,
        sizeAttenuation: true
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.userData = { velocities, count, isSnow };
    markRaycastIgnored(points);
    return points;
}

function updateWeatherParticleSystem(system, camera, delta, isActive) {
    if (!system) return;
    system.visible = isActive;
    system.position.set(camera.position.x, camera.position.y, camera.position.z);
    if (!isActive) return;

    const posAttr = system.geometry.getAttribute('position');
    const positions = posAttr.array;
    const count = system.userData.count;
    const isSnow = system.userData.isSnow;
    const range = 64;
    const fallDistance = delta * (isSnow ? 14 : 45);

    // Get LOCAL GRAVITY for the current planet face
    const gravityUp = getPlanetSurfaceNormal(camera.position);
    const gravityDown = gravityUp.clone().multiplyScalar(-1);
    const frame = getPlanetFrame(camera.position);
    const localRight = frame.right;
    const localForward = frame.forward;

    for (let i = 0; i < count; i += 1) {
        const ix = i * 3;
        const iy = ix + 1;
        const iz = ix + 2;

        // Current particle local offset
        const px = positions[ix];
        const py = positions[iy];
        const pz = positions[iz];

        // Move particle along LOCAL gravity down
        positions[ix] += gravityDown.x * fallDistance;
        positions[iy] += gravityDown.y * fallDistance;
        positions[iz] += gravityDown.z * fallDistance;

        // HIGH FIDELITY WORLD POS
        const worldPos = weatherScratchState.worldPos.set(
            camera.position.x + positions[ix],
            camera.position.y + positions[iy],
            camera.position.z + positions[iz]
        );

        // Project relative position onto local axes
        const relPos = weatherScratchState.fallDirection.set(positions[ix], positions[iy], positions[iz]);
        const heightAlongNormal = relPos.dot(gravityUp);
        const distH1 = relPos.dot(localRight);
        const distH2 = relPos.dot(localForward);

        // Reset if too low relative to camera or hit ground
        // We use a relative height check (heightAlongNormal) to ensure it works on ALL faces
        if (heightAlongNormal < -32) {
            const spreadH = (Math.random() - 0.5) * range;
            const spreadH2 = (Math.random() - 0.5) * range;
            const spreadV = 48 + Math.random() * 42;

            const newPos = gravityUp.clone().multiplyScalar(spreadV)
                .add(localRight.clone().multiplyScalar(spreadH))
                .add(localForward.clone().multiplyScalar(spreadH2));

            positions[ix] = newPos.x;
            positions[iy] = newPos.y;
            positions[iz] = newPos.z;
        }

        // Loop horizontally (toroidal wrap in local face space)
        if (Math.abs(distH1) > range / 2 || Math.abs(distH2) > range / 2) {
            // Simplest is to just respawn it if it drifts too far horizontally
            const spreadH = (Math.random() - 0.5) * range;
            const spreadH2 = (Math.random() - 0.5) * range;
            const newPos = gravityUp.clone().multiplyScalar(heightAlongNormal)
                .add(localRight.clone().multiplyScalar(spreadH))
                .add(localForward.clone().multiplyScalar(spreadH2));
            positions[ix] = newPos.x;
            positions[iy] = newPos.y;
            positions[iz] = newPos.z;
        }
    }
    posAttr.needsUpdate = true;
}

function createSolarSystemVisual() {
    const group = new THREE.Group();
    group.name = 'ASCraftSolarSystem';
    markRaycastIgnored(group);

    const sunAnchor = new THREE.Group();
    sunAnchor.name = 'ASCraftSolarSunAnchor';
    markRaycastIgnored(sunAnchor);
    group.add(sunAnchor);
    const focusLabels = [];

    // Heliocentric central sun additions removed to restore day/night orbit

    const planetBodies = new Map();
    const moonBodies = new Map();

    SOLAR_SYSTEM_VISUAL_PLANETS.forEach((planet) => {
        const radius = getSolarPlanetVisualRadius(planet.diameterRatioEarth);
        const orbitPlane = new THREE.Group();
        orbitPlane.rotation.x = Number(planet.orbitTilt || 0);
        markRaycastIgnored(orbitPlane);
        sunAnchor.add(orbitPlane);

        const orbitPivot = new THREE.Group();
        orbitPivot.rotation.y = Number(planet.orbitPhase || 0);
        markRaycastIgnored(orbitPivot);
        orbitPlane.add(orbitPivot);

        const anchor = new THREE.Group();
        anchor.position.x = getPlanetOrbitVisualRadius(planet.semiMajorAxisAU);
        markRaycastIgnored(anchor);
        orbitPivot.add(anchor);

        const planetVisual = createCelestialBodyVisual({
            radius,
            color: planet.color,
            opacity: 0.88,
            renderOrder: -910,  // Lower than sun (-860) so planets draw BEFORE and appear BEHIND the sun
            segments: 16,
            axialTilt: planet.axialTilt
        });
        anchor.add(planetVisual.root);
        const planetLabel = createFocusLabelSprite(planet.name, [8.4, 1.24, 1]);
        planetLabel.position.set(0, radius + 10.4, 0);
        anchor.add(planetLabel);
        focusLabels.push({
            sprite: planetLabel,
            visibility: () => group.visible,
            threshold: 0.08, // Decreased to make easier to see from afar
            fullOpacityDot: 0.35,
            labelKind: 'astro',
            targetPixelHeight: 136,
            minPixelHeight: 104,
            maxPixelHeight: 192
        });
        planetBodies.set(planet.id, {
            orbitPlane,
            orbitPivot,
            anchor,
            axialTiltGroup: planetVisual.axialTiltGroup,
            mesh: planetVisual.mesh,
            label: planetLabel
        });

        if (planet.id === 'saturn') {
            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(radius * 1.55, Math.max(0.25, radius * 0.2), 8, 48),
                new THREE.MeshBasicMaterial({
                    color: 0xcbb892,
                    transparent: true,
                    opacity: 0.58,
                    depthWrite: false,
                    fog: false
                })
            );
            ring.rotation.x = Math.PI / 2;
            ring.renderOrder = -873;
            markRaycastIgnored(ring);
            planetVisual.mesh.add(ring);
        }

        (planet.moons || []).forEach((moonCfg) => {
            const moonRadius = getSolarPlanetVisualRadius(moonCfg.diameterRatioEarth);
            const moonOrbitPlane = new THREE.Group();
            moonOrbitPlane.rotation.x = Number(moonCfg.orbitTilt || 0);
            markRaycastIgnored(moonOrbitPlane);
            anchor.add(moonOrbitPlane);

            const moonOrbitPivot = new THREE.Group();
            moonOrbitPivot.rotation.y = Number(moonCfg.orbitPhase || 0);
            markRaycastIgnored(moonOrbitPivot);
            moonOrbitPlane.add(moonOrbitPivot);

            const moonAnchor = new THREE.Group();
            moonAnchor.position.x = getMoonOrbitVisualRadius(moonCfg);
            markRaycastIgnored(moonAnchor);
            moonOrbitPivot.add(moonAnchor);

            const moonVisual = createCelestialBodyVisual({
                radius: moonRadius,
                color: moonCfg.color || 0xdfe7f4,
                opacity: 0.9,
                renderOrder: -911,  // Behind sun (-860) and behind planets (-910)
                segments: 12,
                axialTilt: moonCfg.axialTilt
            });
            moonAnchor.add(moonVisual.root);
            const moonLabel = createFocusLabelSprite(moonCfg.name, [6.2, 1.18, 1]);
            moonLabel.position.set(0, moonRadius + 6.4, 0);
            moonAnchor.add(moonLabel);
            focusLabels.push({
                sprite: moonLabel,
                visibility: () => group.visible,
                threshold: 0.06, // Decreased threshold
                fullOpacityDot: 0.30,
                labelKind: 'astro',
                targetPixelHeight: 112,
                minPixelHeight: 84,
                maxPixelHeight: 160
            });
            moonBodies.set(`${planet.id}:${moonCfg.id}`, {
                orbitPlane: moonOrbitPlane,
                orbitPivot: moonOrbitPivot,
                anchor: moonAnchor,
                axialTiltGroup: moonVisual.axialTiltGroup,
                mesh: moonVisual.mesh,
                label: moonLabel
            });
        });
    });

    return { group, sunAnchor, planetBodies, moonBodies, focusLabels };
}

function createSkySystem() {
    const root = new THREE.Group();
    root.name = 'ASCraftSky';
    root.userData.ignoreRaycast = true;

    const rng = createSeededRandom('ASCraftSky');

    const skyTexture = createSkyBackdropTexture();
    const skyBackdrop = new THREE.Mesh(
        new THREE.SphereGeometry(SKY_RADIUS, 32, 24),
        new THREE.MeshBasicMaterial({
            map: skyTexture,
            color: 0xffffff,
            side: THREE.BackSide,
            fog: false,
            depthWrite: false
        })
    );
    skyBackdrop.renderOrder = -1000;
    markRaycastIgnored(skyBackdrop);
    root.add(skyBackdrop);

    const starfieldDrift = new THREE.Group();
    starfieldDrift.name = 'ASCraftStarfieldDrift';
    markRaycastIgnored(starfieldDrift);
    root.add(starfieldDrift);

    const constellationDrift = new THREE.Group();
    constellationDrift.name = 'ASCraftConstellationDrift';
    markRaycastIgnored(constellationDrift);
    root.add(constellationDrift);

    const milkyWayDrift = new THREE.Group();
    milkyWayDrift.name = 'ASCraftMilkyWayDrift';
    markRaycastIgnored(milkyWayDrift);
    root.add(milkyWayDrift);

    const sunTex = createRadialGlowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,1)', 64);
    const sunMesh = new THREE.Sprite(new THREE.SpriteMaterial({
        map: sunTex,
        color: 0xffffff,
        transparent: false,
        depthWrite: false,
        depthTest: true
    }));
    sunMesh.scale.set(160, 160, 1);
    sunMesh.renderOrder = -960;
    markRaycastIgnored(sunMesh);
    root.add(sunMesh);
    const sunSprite = sunMesh;

    const sunBloom = new THREE.Sprite(new THREE.SpriteMaterial({
        map: createRadialGlowTexture('rgba(255,245,200,0.5)', 'rgba(255,180,50,0)', 128),
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false
    }));
    sunBloom.visible = false; // Pure square sun as requested 
    markRaycastIgnored(sunBloom);
    root.add(sunBloom);
    const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: createSolarHaloTexture(256),
        color: 0xfff2d2,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false
    }));
    sunHalo.renderOrder = -861;
    sunHalo.visible = false; // No circular halos 
    sunHalo.material.opacity = 0;
    sunHalo.scale.set(400, 400, 1); // Truly massive cinematic halo
    markRaycastIgnored(sunHalo);
    root.add(sunHalo);
    const sunLabelAnchor = new THREE.Group();
    sunLabelAnchor.name = 'ASCraftSunLabelAnchor';
    markRaycastIgnored(sunLabelAnchor);
    root.add(sunLabelAnchor);

    // Removed sunOccluder - using renderOrder instead (planets at -910 draw before sun at -860)

    const moonDisplay = createLightOrbitalBodyDisplay({
        bodyColor: 0xe8ebf0,
        glowInner: 'rgba(255,255,255,0.36)',
        glowOuter: 'rgba(255,255,255,0)',
        glowScale: 18.0,
        meshRadius: 4.2,
        renderOrder: -899,
        axialTilt: 0.08,
        voxelSize: 0.34,
        darkFloor: 0.28,
        patches: [
            { color: 0xd5d9df, position: [0.62, 0.16, 0.74], threshold: 0.82 },
            { color: 0xced3db, position: [-0.18, -0.12, 0.96], threshold: 0.84 },
            { color: 0xf7f8f9, position: [-0.52, 0.34, 0.6], threshold: 0.86 }
        ]
    });
    const moonSprite = moonDisplay.glow;

    const earthDisplay = createLightOrbitalBodyDisplay({
        bodyColor: 0x72b96a,
        glowInner: 'rgba(182,246,255,0.52)',
        glowOuter: 'rgba(63,133,255,0)',
        glowScale: 28.0,
        meshRadius: 10.0,
        renderOrder: -898,
        axialTilt: 0.41,
        voxelSize: 0.64,
        darkFloor: 0.16,
        patches: [
            { color: 0x2f7d45, position: [0.44, 0.16, 0.78], threshold: 0.8 },
            { color: 0x1f5fbf, position: [-0.3, -0.08, 0.86], threshold: 0.84 },
            { color: 0x3b9151, position: [-0.52, 0.3, 0.56], threshold: 0.83 },
            { color: 0x4da8ff, position: [0.12, -0.42, 0.88], threshold: 0.86 }
        ]
    });
    const earthSprite = earthDisplay.glow;
    const earthSpinMarker = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 0.22, 0.16),
        new THREE.MeshBasicMaterial({
            color: 0xf8fafc,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            fog: false
        })
    );
    earthSpinMarker.position.set(3.2, 0.48, 2.08);
    earthSpinMarker.rotation.z = 0.22;
    earthSpinMarker.renderOrder = -895;
    markRaycastIgnored(earthSpinMarker);
    earthDisplay.mesh.add(earthSpinMarker);
    earthDisplay.spinMarker = earthSpinMarker;
    earthDisplay.root.visible = false;

    const earthMoonViz = new THREE.Group();
    earthMoonViz.name = 'ASCraftEarthMoonViz';
    markRaycastIgnored(earthMoonViz);
    earthMoonViz.add(earthDisplay.root);
    earthMoonViz.add(moonDisplay.root);
    root.add(earthMoonViz);
    const focusLabels = [];
    const sunLabel = createFocusLabelSprite('Sol', [14.0, 2.0, 1]);
    sunLabel.position.set(0, 14.5, 0);
    sunLabelAnchor.add(sunLabel);
    focusLabels.push({ sprite: sunLabel, visibility: () => sunSprite.visible, threshold: 0.08, fullOpacityDot: 0.28, labelKind: 'astro', targetPixelHeight: 200, minPixelHeight: 140, maxPixelHeight: 320 });

    const moonLabel = createFocusLabelSprite('Luna', [13.5, 1.95, 1]);
    moonLabel.position.set(0, 16.2, 0);
    moonDisplay.root.add(moonLabel);
    focusLabels.push({ sprite: moonLabel, visibility: () => moonDisplay.root.visible, threshold: 0.08, fullOpacityDot: 0.28, labelKind: 'astro', targetPixelHeight: 200, minPixelHeight: 140, maxPixelHeight: 320 });

    const earthLabel = createFocusLabelSprite('Tierra', [15.2, 2.2, 1]);
    earthLabel.position.set(0, 21.0, 0);
    earthDisplay.root.add(earthLabel);
    focusLabels.push({ sprite: earthLabel, visibility: () => earthDisplay.root.visible, threshold: 0.08, fullOpacityDot: 0.28, labelKind: 'astro', targetPixelHeight: 200, minPixelHeight: 140, maxPixelHeight: 320 });

    const starGeometry = createStarsGeometry(rng);
    const starMaterial = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        uniforms: {
            uTime: { value: 0 },
            uNightOpacity: { value: 0 },
            uSprite: { value: createRadialGlowTexture('rgba(255,255,255,0.98)', 'rgba(255,255,255,0)', 64) }
        },
        vertexShader: `
            attribute float aSize;
            attribute float aPhase;
            attribute float aSpeed;
            attribute float aIntensity;
            uniform float uTime;
            varying float vTwinkle;
            void main() {
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                float twinkle = 0.58 + 0.42 * sin(uTime * aSpeed + aPhase);
                vTwinkle = clamp(twinkle * aIntensity, 0.0, 1.0);
                float perspective = 180.0 / max(26.0, -mvPosition.z);
                gl_PointSize = aSize * perspective * (0.58 + vTwinkle * 0.44);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform sampler2D uSprite;
            uniform float uNightOpacity;
            varying float vTwinkle;
            void main() {
                vec4 tex = texture2D(uSprite, gl_PointCoord);
                float alpha = tex.a * uNightOpacity * vTwinkle;
                if (alpha <= 0.001) discard;
                gl_FragColor = vec4(vec3(1.0), alpha);
            }
        `
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    stars.renderOrder = -850;
    markRaycastIgnored(stars);
    starfieldDrift.add(stars);

    const { overlay: constellationOverlay, items: constellationItems } = createConstellationOverlay(rng);
    constellationOverlay.renderOrder = -820;
    markRaycastIgnored(constellationOverlay);
    constellationDrift.add(constellationOverlay);
    constellationItems.forEach((item) => {
        const finalName = String(item?.name || 'Constelación').replace(/^Constellation_/, '');
        const sprite = createFocusLabelSprite(finalName, [8.4, 1.24, 1]);
        const anchor = item.userData?.labelAnchor?.clone?.() || new THREE.Vector3(0, 0, 0);
        const labelOffset = anchor.clone().normalize().multiplyScalar(17.6);
        sprite.position.copy(anchor.add(labelOffset));
        sprite.renderOrder = -810;
        item.add(sprite);
        focusLabels.push({
            sprite,
            visibility: () => item.visible,
            threshold: 0.04,
            fullOpacityDot: 0.2,
            labelKind: 'constellation',
            targetPixelHeight: 168,
            minPixelHeight: 128,
            maxPixelHeight: 224
        });
    });

    const milkyWayMaterial = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        uniforms: {
            uTime: { value: 0 },
            uOpacity: { value: 0 },
            uSprite: { value: createRadialGlowTexture('rgba(255,255,255,0.96)', 'rgba(255,255,255,0)', 64) }
        },
        vertexShader: `
            attribute float aSize;
            attribute float aAlpha;
            attribute vec3 color;
            varying vec3 vColor;
            varying float vAlpha;
            uniform float uTime;
            uniform float uOpacity;
            void main() {
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                float phase = (position.x + position.z) * 0.0045;
                float pulse = 0.92 + (sin((uTime * 0.11) + phase) * 0.08);
                float perspective = 240.0 / max(24.0, -mvPosition.z);
                gl_PointSize = max(0.6, aSize * perspective);
                vColor = color;
                vAlpha = aAlpha * pulse * uOpacity;
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform sampler2D uSprite;
            varying vec3 vColor;
            varying float vAlpha;
            void main() {
                vec4 tex = texture2D(uSprite, gl_PointCoord);
                float alpha = tex.a * vAlpha;
                if (alpha <= 0.001) discard;
                gl_FragColor = vec4(vColor, alpha);
            }
        `
    });
    const milkyWay = new THREE.Points(
        createMilkyWayGeometry(rng),
        milkyWayMaterial
    );
    milkyWay.renderOrder = -848;
    markRaycastIgnored(milkyWay);
    milkyWayDrift.add(milkyWay);

    const auroraSystem = createAuroraSystem(rng);
    root.add(auroraSystem.group);

    const cometVisuals = createCometVisuals();
    cometVisuals.cometMap.forEach((entry) => {
        const cometLabel = createFocusLabelSprite(entry.config?.name || entry.config?.id || 'Cometa', [8.8, 1.28, 1]);
        cometLabel.position.set(0, 9.2, 0);
        entry.group.add(cometLabel);
        entry.label = cometLabel;
        focusLabels.push({
            sprite: cometLabel,
            visibility: () => entry.group.visible,
            threshold: 0.08,
            fullOpacityDot: 0.24,
            labelKind: 'astro',
            targetPixelHeight: 136,
            minPixelHeight: 104,
            maxPixelHeight: 192
        });
    });
    root.add(cometVisuals.group);

    const meteorSystem = createMeteorSystem();
    root.add(meteorSystem.group);

    const clouds = new THREE.Group();
    clouds.name = 'ASCraftClouds';
    markRaycastIgnored(clouds);
    root.add(clouds);

    const cloudList = [];
    for (let i = 0; i < SKY_CLOUD_COUNT; i += 1) {
        const cloud = createCloudCluster(rng);
        clouds.add(cloud);
        cloudList.push(cloud);
    }

    const solarVisual = createSolarSystemVisual();
    root.add(solarVisual.group);

    const isSnowing = currentRoomTimeState?.weather === 'snow' || currentRoomTimeState?.weather === 'blizzard';
    rainSystem = createWeatherParticleSystem(SKY_RAIN_PARTICLE_COUNT, isSnowing);
    root.add(rainSystem);
    snowSystem = createWeatherParticleSystem(SKY_SNOW_PARTICLE_COUNT, true);
    root.add(snowSystem);

    // Removed deprecated orbitVizRoot as requested by user

    return {
        root,
        skyBackdrop,
        skyTexture,
        sunSprite,
        sunBloom,
        sunHalo,
        sunLabelAnchor,
        moonSprite,
        earthSprite,
        moonDisplay,
        earthDisplay,
        earthMoonViz,
        starfieldDrift,
        constellationDrift,
        milkyWayDrift,
        stars,
        starsMaterial: starMaterial,
        constellationOverlay,
        constellationItems,
        focusLabels: focusLabels.concat(solarVisual.focusLabels || []),
        milkyWay,
        milkyWayMaterial,
        auroraSystem,
        cometVisuals,
        meteorSystem,
        clouds,
        cloudList,
        solarVisual
    };
}

function createSkyPlaceholderBodyDisplay(bodyRadius = 1, shadowFloor = 0.2) {
    const root = new THREE.Group();
    root.visible = false;
    markRaycastIgnored(root);
    return {
        root,
        glow: null,
        axialTiltGroup: null,
        mesh: null,
        phaseSphere: null,
        phaseMaterial: null,
        instancedMeshes: [],
        voxelMaterials: [],
        bodyRadius,
        shadowFloor
    };
}

function scheduleSkyHydrationTask(task, delayMs = 0) {
    window.setTimeout(() => {
        requestAnimationFrame(() => {
            try {
                task();
            } catch (error) {
                console.warn('[ASCraft] Sky hydration task failed', error);
            }
        });
    }, delayMs);
}

function hydrateSkyStarfieldFeatures(sky, rng) {
    if (!sky || sky.stars) return;
    const starGeometry = createStarsGeometry(rng);
    const starMaterial = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        uniforms: {
            uTime: { value: 0 },
            uNightOpacity: { value: 0 },
            uSprite: { value: createRadialGlowTexture('rgba(255,255,255,0.98)', 'rgba(255,255,255,0)', 64) }
        },
        vertexShader: `
            attribute float aSize;
            attribute float aPhase;
            attribute float aSpeed;
            attribute float aIntensity;
            uniform float uTime;
            varying float vTwinkle;
            void main() {
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                float twinkle = 0.58 + 0.42 * sin(uTime * aSpeed + aPhase);
                vTwinkle = clamp(twinkle * aIntensity, 0.0, 1.0);
                float perspective = 180.0 / max(26.0, -mvPosition.z);
                gl_PointSize = aSize * perspective * (0.58 + vTwinkle * 0.44);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform sampler2D uSprite;
            uniform float uNightOpacity;
            varying float vTwinkle;
            void main() {
                vec4 tex = texture2D(uSprite, gl_PointCoord);
                float alpha = tex.a * uNightOpacity * vTwinkle;
                if (alpha <= 0.001) discard;
                gl_FragColor = vec4(vec3(1.0), alpha);
            }
        `
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    stars.renderOrder = -850;
    markRaycastIgnored(stars);
    sky.starfieldDrift.add(stars);
    sky.stars = stars;
    sky.starsMaterial = starMaterial;

    const milkyWayMaterial = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        uniforms: {
            uTime: { value: 0 },
            uOpacity: { value: 0 },
            uSprite: { value: createRadialGlowTexture('rgba(255,255,255,0.96)', 'rgba(255,255,255,0)', 64) }
        },
        vertexShader: `
            attribute float aSize;
            attribute float aAlpha;
            attribute vec3 color;
            varying vec3 vColor;
            varying float vAlpha;
            uniform float uTime;
            uniform float uOpacity;
            void main() {
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                float phase = (position.x + position.z) * 0.0045;
                float pulse = 0.92 + (sin((uTime * 0.11) + phase) * 0.08);
                float perspective = 240.0 / max(24.0, -mvPosition.z);
                gl_PointSize = max(0.6, aSize * perspective);
                vColor = color;
                vAlpha = aAlpha * pulse * uOpacity;
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform sampler2D uSprite;
            varying vec3 vColor;
            varying float vAlpha;
            void main() {
                vec4 tex = texture2D(uSprite, gl_PointCoord);
                float alpha = tex.a * vAlpha;
                if (alpha <= 0.001) discard;
                gl_FragColor = vec4(vColor, alpha);
            }
        `
    });
    const milkyWay = new THREE.Points(createMilkyWayGeometry(rng), milkyWayMaterial);
    milkyWay.renderOrder = -848;
    markRaycastIgnored(milkyWay);
    sky.milkyWayDrift.add(milkyWay);
    sky.milkyWay = milkyWay;
    sky.milkyWayMaterial = milkyWayMaterial;

    const { overlay: constellationOverlay, items: constellationItems } = createConstellationOverlay(rng);
    constellationOverlay.renderOrder = -820;
    markRaycastIgnored(constellationOverlay);
    sky.constellationDrift.add(constellationOverlay);
    sky.constellationOverlay = constellationOverlay;
    sky.constellationItems = constellationItems;
    constellationItems.forEach((item) => {
        const finalName = String(item?.name || 'Constelación').replace(/^Constellation_/, '');
        const sprite = createFocusLabelSprite(finalName, [8.4, 1.24, 1]);
        const anchor = item.userData?.labelAnchor?.clone?.() || new THREE.Vector3(0, 0, 0);
        const labelOffset = anchor.clone().normalize().multiplyScalar(17.6);
        sprite.position.copy(anchor.add(labelOffset));
        sprite.renderOrder = -810;
        item.add(sprite);
        sky.focusLabels.push({
            sprite,
            visibility: () => item.visible,
            threshold: 0.04,
            fullOpacityDot: 0.2,
            labelKind: 'constellation',
            targetPixelHeight: 168,
            minPixelHeight: 128,
            maxPixelHeight: 224
        });
    });
}

function hydrateSkyAtmosphereFeatures(sky, rng) {
    if (!sky || sky.auroraSystem) return;
    sky.auroraSystem = createAuroraSystem(rng);
    sky.root.add(sky.auroraSystem.group);

    sky.cometVisuals = createCometVisuals();
    sky.cometVisuals.cometMap.forEach((entry) => {
        const cometLabel = createFocusLabelSprite(entry.config?.name || entry.config?.id || 'Cometa', [8.8, 1.28, 1]);
        cometLabel.position.set(0, 9.2, 0);
        entry.group.add(cometLabel);
        entry.label = cometLabel;
        sky.focusLabels.push({
            sprite: cometLabel,
            visibility: () => entry.group.visible,
            threshold: 0.08,
            fullOpacityDot: 0.24,
            labelKind: 'astro',
            targetPixelHeight: 136,
            minPixelHeight: 104,
            maxPixelHeight: 192
        });
    });
    sky.root.add(sky.cometVisuals.group);

    sky.meteorSystem = createMeteorSystem();
    sky.root.add(sky.meteorSystem.group);

    const clouds = new THREE.Group();
    clouds.name = 'ASCraftClouds';
    markRaycastIgnored(clouds);
    sky.root.add(clouds);
    sky.clouds = clouds;
    sky.cloudList = [];
    const targetCloudCount = Math.max(8, Math.round(SKY_CLOUD_COUNT * 0.45));
    for (let i = 0; i < targetCloudCount; i += 1) {
        const cloud = createCloudCluster(rng);
        clouds.add(cloud);
        sky.cloudList.push(cloud);
    }
}

function hydrateSkyBodyDisplays(sky) {
    if (!sky || sky.moonDisplay?.phaseMaterial || sky.earthDisplay?.phaseMaterial) return;
    const moonDisplay = createVoxelOrbitalBodyDisplay({
        bodyColor: 0xe8ebf0,
        glowInner: 'rgba(255,255,255,0.4)',
        glowOuter: 'rgba(255,255,255,0)',
        glowScale: 17.2,
        meshRadius: 5.1,
        renderOrder: -899,
        axialTilt: 0.08,
        voxelSize: 0.34,
        darkFloor: 0.28,
        patches: [
            { color: 0xd5d9df, position: [0.62, 0.16, 0.74], threshold: 0.82 },
            { color: 0xced3db, position: [-0.18, -0.12, 0.96], threshold: 0.84 },
            { color: 0xf7f8f9, position: [-0.52, 0.34, 0.6], threshold: 0.86 }
        ]
    });
    const earthDisplay = createLightOrbitalBodyDisplay({
        bodyColor: 0x72b96a,
        glowInner: 'rgba(182,246,255,0.82)',
        glowOuter: 'rgba(63,133,255,0)',
        glowScale: 15.2,
        meshRadius: 12.8,
        renderOrder: -898,
        axialTilt: 0.41,
        voxelSize: 0.64,
        darkFloor: 0.16,
        patches: [
            { color: 0x2f7d45, position: [0.44, 0.16, 0.78], radiusScale: 0.26, scale: [1.2, 0.6, 0.28] },
            { color: 0x1f5fbf, position: [-0.3, -0.08, 0.86], radiusScale: 0.3, scale: [1.26, 0.74, 0.34] },
            { color: 0x3b9151, position: [-0.52, 0.3, 0.56], radiusScale: 0.2, scale: [0.96, 0.52, 0.24] },
            { color: 0x4da8ff, position: [0.12, -0.42, 0.88], radiusScale: 0.26, scale: [1.1, 0.64, 0.28] }
        ]
    });
    const earthSpinMarker = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 0.22, 0.16),
        new THREE.MeshBasicMaterial({
            color: 0xf8fafc,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            fog: false
        })
    );
    earthSpinMarker.position.set(3.2, 0.48, 2.08);
    earthSpinMarker.rotation.z = 0.22;
    earthSpinMarker.renderOrder = -895;
    markRaycastIgnored(earthSpinMarker);
    earthDisplay.mesh.add(earthSpinMarker);
    earthDisplay.spinMarker = earthSpinMarker;
    earthDisplay.root.visible = false;

    sky.earthMoonViz.remove(sky.earthDisplay.root);
    sky.earthMoonViz.remove(sky.moonDisplay.root);
    sky.earthDisplay = earthDisplay;
    sky.moonDisplay = moonDisplay;
    sky.earthSprite = earthDisplay.glow;
    sky.moonSprite = moonDisplay.glow;
    sky.earthMoonViz.add(earthDisplay.root);
    sky.earthMoonViz.add(moonDisplay.root);

    const moonLabel = createFocusLabelSprite('Luna', [13.5, 1.95, 1]);
    moonLabel.position.set(0, 16.2, 0);
    moonDisplay.root.add(moonLabel);
    sky.focusLabels.push({ sprite: moonLabel, visibility: () => moonDisplay.root.visible, threshold: 0.08, fullOpacityDot: 0.28, labelKind: 'astro', targetPixelHeight: 200, minPixelHeight: 140, maxPixelHeight: 320 });

    const earthLabel = createFocusLabelSprite('Tierra', [15.2, 2.2, 1]);
    earthLabel.position.set(0, 21.0, 0);
    earthDisplay.root.add(earthLabel);
    sky.focusLabels.push({ sprite: earthLabel, visibility: () => earthDisplay.root.visible, threshold: 0.08, fullOpacityDot: 0.28, labelKind: 'astro', targetPixelHeight: 200, minPixelHeight: 140, maxPixelHeight: 320 });
}

function hydrateSkySolarVisual(sky) {
    if (!sky || sky.solarVisual?.group) return;
    sky.solarVisual = createSolarSystemVisual();
    sky.root.add(sky.solarVisual.group);
    sky.focusLabels.push(...(sky.solarVisual.focusLabels || []));
}

function createFastSkySystem() {
    const root = new THREE.Group();
    root.name = 'ASCraftSky';
    root.userData.ignoreRaycast = true;

    const rng = createSeededRandom('ASCraftSky');
    const skyTexture = createSkyBackdropTexture();
    const skyBackdrop = new THREE.Mesh(
        new THREE.SphereGeometry(SKY_RADIUS, 20, 16),
        new THREE.MeshBasicMaterial({
            map: skyTexture,
            color: 0xffffff,
            side: THREE.BackSide,
            fog: false,
            depthWrite: false
        })
    );
    skyBackdrop.renderOrder = -1000;
    markRaycastIgnored(skyBackdrop);
    root.add(skyBackdrop);

    const starfieldDrift = new THREE.Group();
    const constellationDrift = new THREE.Group();
    const milkyWayDrift = new THREE.Group();
    starfieldDrift.name = 'ASCraftStarfieldDrift';
    constellationDrift.name = 'ASCraftConstellationDrift';
    milkyWayDrift.name = 'ASCraftMilkyWayDrift';
    markRaycastIgnored(starfieldDrift);
    markRaycastIgnored(constellationDrift);
    markRaycastIgnored(milkyWayDrift);
    root.add(starfieldDrift, constellationDrift, milkyWayDrift);

    const sunMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(3.6, 3.6),
        new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: false,
            opacity: 1,
            fog: false,
            depthWrite: false,
            depthTest: true
        })
    );
    sunMesh.renderOrder = -960;
    markRaycastIgnored(sunMesh);
    root.add(sunMesh);
    const sunSprite = sunMesh;

    const sunBloom = new THREE.Sprite(new THREE.SpriteMaterial({
        map: createRadialGlowTexture('rgba(255,245,200,0.5)', 'rgba(255,180,50,0)', 128),
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false
    }));
    sunBloom.visible = false;
    markRaycastIgnored(sunBloom);
    root.add(sunBloom);

    const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: createSolarHaloTexture(256),
        color: 0xfff2d2,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false
    }));
    sunHalo.renderOrder = -861;
    sunHalo.visible = false;
    sunHalo.material.opacity = 0;
    sunHalo.scale.set(72, 72, 1);
    markRaycastIgnored(sunHalo);
    root.add(sunHalo);

    const sunLabelAnchor = new THREE.Group();
    sunLabelAnchor.name = 'ASCraftSunLabelAnchor';
    markRaycastIgnored(sunLabelAnchor);
    root.add(sunLabelAnchor);

    const earthMoonViz = new THREE.Group();
    earthMoonViz.name = 'ASCraftEarthMoonViz';
    markRaycastIgnored(earthMoonViz);
    root.add(earthMoonViz);
    const moonDisplay = createSkyPlaceholderBodyDisplay(5.1, 0.28);
    const earthDisplay = createSkyPlaceholderBodyDisplay(12.8, 0.16);
    earthMoonViz.add(earthDisplay.root);
    earthMoonViz.add(moonDisplay.root);

    const focusLabels = [];
    const sunLabel = createFocusLabelSprite('Sol', [14.0, 2.0, 1]);
    sunLabel.position.set(0, 14.5, 0);
    sunLabelAnchor.add(sunLabel);
    focusLabels.push({ sprite: sunLabel, visibility: () => sunSprite.visible, threshold: 0.08, fullOpacityDot: 0.28, labelKind: 'astro', targetPixelHeight: 200, minPixelHeight: 140, maxPixelHeight: 320 });

    rainSystem = createWeatherParticleSystem(SKY_RAIN_PARTICLE_COUNT, false);
    root.add(rainSystem);
    snowSystem = createWeatherParticleSystem(SKY_SNOW_PARTICLE_COUNT, true);
    root.add(snowSystem);

    const sky = {
        root,
        skyBackdrop,
        skyTexture,
        sunSprite,
        sunBloom,
        sunHalo,
        sunLabelAnchor,
        moonSprite: null,
        earthSprite: null,
        moonDisplay,
        earthDisplay,
        earthMoonViz,
        starfieldDrift,
        constellationDrift,
        milkyWayDrift,
        stars: null,
        starsMaterial: null,
        constellationOverlay: null,
        constellationItems: [],
        focusLabels,
        milkyWay: null,
        milkyWayMaterial: null,
        auroraSystem: null,
        cometVisuals: null,
        meteorSystem: null,
        clouds: null,
        cloudList: [],
        solarVisual: null
    };

    scheduleSkyHydrationTask(() => hydrateSkyStarfieldFeatures(sky, rng), 0);
    scheduleSkyHydrationTask(() => hydrateSkyAtmosphereFeatures(sky, rng), 40);
    scheduleSkyHydrationTask(() => hydrateSkyBodyDisplays(sky), 120);
    scheduleSkyHydrationTask(() => hydrateSkySolarVisual(sky), 220);
    return sky;
}

function respawnCherryPetal(index) {
    const petalAnchors = outdoorBlossomAnchors.length ? outdoorBlossomAnchors : outdoorTreeAnchors;
    if (!cherryPetalSystem || !Array.isArray(petalAnchors) || !petalAnchors.length) return;
    const geometry = cherryPetalSystem.geometry;
    const posAttr = geometry.getAttribute('position');
    const velocities = cherryPetalSystem.userData?.velocities || [];
    const anchors = cherryPetalSystem.userData?.anchors;
    const groundedUntil = cherryPetalSystem.userData?.groundedUntil;
    const anchorIndex = Math.floor(Math.random() * petalAnchors.length);
    const anchor = petalAnchors[anchorIndex];
    const ix = index * 3;
    const spawnAngle = Math.random() * Math.PI * 2;
    const spawnRadius = 0.08 + Math.random() * 0.52;
    posAttr.array[ix] = anchor.x + Math.cos(spawnAngle) * spawnRadius;
    const groundY = Number(getEarthPlacementSurfaceY(anchor.x, anchor.z) ?? anchor.y);
    posAttr.array[ix + 1] = Math.max(anchor.y + 0.08 + (Math.random() * 0.34), groundY + 0.18);
    posAttr.array[ix + 2] = anchor.z + Math.sin(spawnAngle) * spawnRadius;
    if (velocities[index]) {
        velocities[index].set((Math.random() - 0.5) * 0.14, -(0.12 + Math.random() * 0.08), (Math.random() - 0.5) * 0.14);
    }
    if (anchors) anchors[index] = anchorIndex;
    if (groundedUntil) groundedUntil[index] = 0;
}

function rebuildCherryPetalSystem() {
    if (cherryPetalSystem) {
        scene.remove(cherryPetalSystem);
        cherryPetalSystem.geometry?.dispose?.();
        cherryPetalSystem.material?.dispose?.();
        cherryPetalSystem = null;
    }
    const petalAnchors = outdoorBlossomAnchors.length ? outdoorBlossomAnchors : outdoorTreeAnchors;
    if (!petalAnchors.length) return;
    cherryPetalSystem = createCherryPetalSystem(Math.min(420, Math.max(160, petalAnchors.length * 3)));
    const count = cherryPetalSystem.userData?.maxParticles || 0;
    for (let i = 0; i < count; i += 1) {
        respawnCherryPetal(i);
    }
    cherryPetalSystem.geometry.getAttribute('position').needsUpdate = true;
    scene.add(cherryPetalSystem);
}

function updateCherryPetalSystem(delta, now = Date.now()) {
    if (!currentRoomTimeState || !currentRoomTimeState.season) return;
    const isSpring = currentRoomTimeState.season === 'spring';
    const isAutumn = currentRoomTimeState.season === 'autumn';

    if (cherryPetalSystem) {
        cherryPetalSystem.visible = (isSpring || isAutumn) && !isSpaceBodyActive();
        if (cherryPetalSystem.visible) {
            // Spring: Pink (#ffc3dd / 0xffc3dd), Autumn: Red-Orange (#d94e33 / 0xd94e33)
            const targetColor = isAutumn ? 0xd94e33 : 0xffc3dd;
            if (cherryPetalSystem.material.uniforms.uPointColor.value.getHex() !== targetColor) {
                cherryPetalSystem.material.uniforms.uPointColor.value.setHex(targetColor);
            }
        } else {
            const posAttr = cherryPetalSystem.geometry?.getAttribute?.('position');
            const groundedUntil = cherryPetalSystem.userData?.groundedUntil;
            if (posAttr) {
                for (let i = 0; i < posAttr.array.length; i += 3) {
                    posAttr.array[i + 1] = -9999;
                }
                posAttr.needsUpdate = true;
            }
            if (groundedUntil) {
                groundedUntil.fill(0);
            }
        }
    }

    if (!cherryPetalSystem || !cherryPetalSystem.visible) return;
    const petalAnchors = outdoorBlossomAnchors.length ? outdoorBlossomAnchors : outdoorTreeAnchors;
    if (!petalAnchors.length) return;
    const geometry = cherryPetalSystem.geometry;
    const posAttr = geometry.getAttribute('position');
    const positions = posAttr.array;
    const velocities = cherryPetalSystem.userData?.velocities || [];
    const anchors = cherryPetalSystem.userData?.anchors;
    const groundedUntil = cherryPetalSystem.userData?.groundedUntil;
    const t = now * 0.001;
    const windX = Math.sin(t * 0.24) * 0.58 + Math.sin(t * 0.61) * 0.34;
    const windZ = Math.cos(t * 0.29) * 0.54 + Math.sin(t * 0.52) * 0.3;
    const count = cherryPetalSystem.userData?.maxParticles || 0;

    // Staggered respawn: only a few per tick if needed
    let respawnBudget = 2;

    for (let i = 0; i < count; i += 1) {
        const ix = i * 3;
        const v = velocities[i];
        if (!v) continue;
        const anchor = petalAnchors[anchors ? anchors[i] : 0] || petalAnchors[0];
        const settleDeadline = groundedUntil ? groundedUntil[i] : 0;
        const placementSurfaceY = getEarthPlacementSurfaceY(positions[ix], positions[ix + 2]);
        const groundY = Number(placementSurfaceY ?? anchor.y) + 0.14;

        // If particle is waiting on ground
        if (settleDeadline && now < settleDeadline) {
            positions[ix + 1] = groundY;
            continue;
        }

        // If particle has finished settled time, mark for respawn but only if budget allows
        if (settleDeadline && now >= settleDeadline) {
            if (respawnBudget > 0) {
                respawnCherryPetal(i);
                respawnBudget -= 1;
            }
            continue;
        }

        // Apply physics
        v.x = THREE.MathUtils.damp(v.x, windX * 0.88, 2.8, delta) + Math.sin(t * 1.9 + i) * 0.012;
        v.z = THREE.MathUtils.damp(v.z, windZ * 0.88, 2.8, delta) + Math.cos(t * 1.5 + i) * 0.012;

        // Falling speed (v.y is negative)
        positions[ix] += v.x * delta * 18;
        positions[ix + 1] += v.y * delta * 45; // Slower fall as requested
        positions[ix + 2] += v.z * delta * 18;

        if (positions[ix + 1] < (groundY - 0.18)) {
            respawnCherryPetal(i);
            respawnBudget = Math.max(0, respawnBudget - 1);
            continue;
        }

        if (positions[ix + 1] <= groundY) {
            positions[ix + 1] = groundY;
            v.set(0, 0, 0);

            // Accumulate layers on ground
            if (isSpring) {
                outdoorSakuraAccumulationBudget += 0.02;
                if (outdoorSakuraAccumulationBudget >= 1) {
                    outdoorSakuraAccumulationBudget -= 1;
                    const cKey = getOutdoorTerrainCellKey(positions[ix], positions[ix + 2]);
                    const current = outdoorSakuraCoverByCell.get(cKey) || 0;
                    if (current < 4) {
                        setOutdoorSakuraCellLayerCount(positions[ix], positions[ix + 2], current + 1);
                        queueOutdoorWeatherVisualRefresh('snow');
                    }
                }
            } else if (isAutumn) {
                outdoorAutumnLeafAccumulationBudget += 0.02;
                if (outdoorAutumnLeafAccumulationBudget >= 1) {
                    outdoorAutumnLeafAccumulationBudget -= 1;
                    const cKey = getOutdoorTerrainCellKey(positions[ix], positions[ix + 2]);
                    const current = outdoorAutumnLeafCoverByCell.get(cKey) || 0;
                    if (current < 4) {
                        setOutdoorAutumnLeafCellLayerCount(positions[ix], positions[ix + 2], current + 1);
                        queueOutdoorWeatherVisualRefresh('snow');
                    }
                }
            }

            // Stay on ground for a while before respawning
            if (groundedUntil) groundedUntil[i] = now + (isAutumn ? 12000 : 16000) + Math.random() * (isAutumn ? 7000 : 10000);
            continue;
        }

        // Reset if too far from tree (infinite loop prevention)
        if (
            Math.abs(positions[ix] - anchor.x) > 12 ||
            Math.abs(positions[ix + 2] - anchor.z) > 12
        ) {
            if (respawnBudget > 0) {
                respawnCherryPetal(i);
                respawnBudget -= 1;
            }
        }
    }
    posAttr.needsUpdate = true;
}

function syncSkyCycleFromRoomData(roomData = null) {
    const normalized = normalizeRoomTimeSettings(roomData?.timeSettings || roomData || getDefaultRoomTimeSettings());
    roomTimeSettings = normalized;
    const hasTimeSettings = !!(roomData?.timeSettings && typeof roomData.timeSettings === 'object');
    if (isTeacher && currentRoomId && !hasTimeSettings && !skyCycleInitPromise) {
        skyCycleInitPromise = updateDoc(doc(db, 'mineblox_rooms', currentRoomId), {
            timeSettings: getRoomTimeSettingsPayload(normalized),
            skyCycleVersion: SKY_CYCLE_VERSION
        }).catch(() => { }).finally(() => {
            skyCycleInitPromise = null;
        });
    }
}

function updateSkySystem(delta, now = Date.now(), realNow = now) {
    if (!scene || !camera || !skySystem) return;
    if (!Number.isFinite(delta) || delta < 0) return;
    const safeDelta = Math.min(delta, 0.05);
    const safeRealNow = Number.isFinite(Number(realNow)) ? Number(realNow) : Number(now || Date.now());
    const inSpaceBody = isSpaceBodyActive();
    const activeBodyCenter = getPlanetCenter();
    const perfTier = getPerformanceTierConfig();
    const cameraForward = new THREE.Vector3();
    camera.getWorldDirection(cameraForward);

    const applyOrbitalDisplayDetail = (display, liteMode = false, spinMarkerVisible = true) => {
        if (!display) return;
        (display.instancedMeshes || []).forEach((mesh) => {
            if (mesh) mesh.visible = !liteMode;
        });
        if (display.phaseSphere) {
            display.phaseSphere.visible = true;
        }
        if (display.spinMarker) {
            display.spinMarker.visible = spinMarkerVisible && !liteMode;
        }
    };

    const shouldUseLiteOrbitalDisplay = (display, markerPosition, scaleScalar = 1) => {
        if (!camera || !display?.bodyRadius || typeof markerPosition?.length !== 'function') return false;
        const bodyDistance = Math.max(1, markerPosition.length());
        const directionToBody = markerPosition.clone().normalize();
        const centerAlignment = cameraForward.dot(directionToBody);
        const apparentRadius = Math.atan((display.bodyRadius * Math.max(0.1, scaleScalar)) / bodyDistance);
        return false; // Force high-fidelity voxel body rendering always to prevent popping LOD issues
    };

    if (moonTerrainGroup) {
        moonTerrainGroup.visible = inSpaceBody;
    }
    if (moonRocketShuttle) {
        moonRocketShuttle.visible = inSpaceBody;
    }
    if (cherryPetalSystem) {
        cherryPetalSystem.visible = !inSpaceBody;
    }

    const roomClock = getRoomTimeState(now);

    if (outdoorTerrainGroup) {
        const legacyWorldSnow = outdoorTerrainGroup.getObjectByName('ASCraftWorldSnow');
        if (legacyWorldSnow?.material) {
            legacyWorldSnow.visible = false;
            legacyWorldSnow.material.opacity = 0;
        }
    }
    const astronomyTimeScale = (24 * 60 * 60 * 1000) / Math.max(60_000, roomClock.dayDurationMs);
    const astronomyNowMs = Number(roomClock.sourceEpochMs || now) * astronomyTimeScale;
    currentRoomTimeState = roomClock;
    const progress = roomClock.dayProgress;
    const snapshot = buildSolarSystemSnapshot(astronomyNowMs, roomClock);
    const cometSnapshot = buildCometSnapshot(astronomyNowMs, roomClock);
    const activeBodyState = getActiveSolarBodyState(snapshot);
    const earthState = snapshot.planets.get('earth');
    const earthMoonState = snapshot.moons.get('earth:moon');
    if (!activeBodyState) return;

    const playerPosition = ensurePlayerWorldPosition();
    const playerBlend = getPlanetBlend(playerPosition);
    const surfaceNormal = getPlanetSurfaceNormal(playerPosition, playerBlend);
    const astronomyNormal = getPlanetAstronomyNormal(playerPosition);
    const heliocentricDistanceAU = Math.max(0.25, activeBodyState.physicalPosition?.length?.() || activeBodyState.position?.length?.() || 1);
    const sunApparentScale = THREE.MathUtils.clamp(Math.pow(1 / heliocentricDistanceAU, 0.42), 0.62, 1.52);
    const sunEnergyScale = THREE.MathUtils.clamp(Math.pow(1 / heliocentricDistanceAU, 0.22), 0.72, 1.22);
    const inertialSunDirection = (activeBodyState.physicalPosition || activeBodyState.position).clone().multiplyScalar(-1).normalize();
    const localSunDirection = inertialSunDirection
        .clone()
        .applyAxisAngle(activeBodyState.spinAxis, -activeBodyState.rotationAngle)
        .normalize();
    lastSunDirSnapshot = localSunDirection.clone();
    const altitude = astronomyNormal.dot(localSunDirection);

    const dayFactor = THREE.MathUtils.smoothstep(altitude, -0.04, 0.18);
    const nightFactor = 1 - THREE.MathUtils.smoothstep(altitude, -0.18, 0.02);
    const twilightFactor = clamp01(1 - Math.abs(altitude) * 1.85);

    const solarSkyMix = THREE.MathUtils.clamp(dayFactor * sunEnergyScale, 0, 1);
    const skyColor = new THREE.Color(FLAT_SKY_COLOR).lerp(new THREE.Color(0x2a4a78), solarSkyMix * 0.92);
    if (!inSpaceBody) {
        const sunsetTint = altitude >= 0 ? new THREE.Color(0xffa25a) : new THREE.Color(0xff865c);
        skyColor.lerp(sunsetTint, twilightFactor * 0.42);
    }

    if (skySystem.skyBackdrop?.material?.color) {
        skySystem.skyBackdrop.material.color.copy(skyColor);
    }
    if (gameContainer?.style) {
        gameContainer.style.backgroundColor = `#${skyColor.getHexString()}`;
    }

    skySystem.root.position.copy(camera.position);
    if (!inSpaceBody) {
        // Anchor the background globe beneath the player to eliminate the hollow sensation
        if (skySystem.earthDisplay?.root) {
            skySystem.earthDisplay.root.visible = true;
            const earthSurfaceY = -13.0; // Slightly below salon level (12.8 radius)
            skySystem.earthDisplay.root.position.set(0, earthSurfaceY, 0);
            skySystem.earthDisplay.root.scale.setScalar(1.0);
            applyOrbitalDisplayDetail(skySystem.earthDisplay, false, true);
        }
    }
    if (skySystem.clouds) {
        skySystem.clouds.visible = !inSpaceBody && perfTier.showClouds;
        // Dynamic drift relative to current surface normal for cubic planet realism
        const driftSpeed = safeDelta * 0.005;
        const driftAxis = astronomyNormal.clone().cross(new THREE.Vector3(0, 1, 0)).length() < 0.1
            ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0); // Avoid gimbal lock
        skySystem.clouds.rotateOnWorldAxis(astronomyNormal, driftSpeed * 0.4);
        skySystem.clouds.rotateOnWorldAxis(driftAxis.cross(astronomyNormal).normalize(), driftSpeed);
    }

    const isRaining = roomClock.weather === 'rain' || roomClock.weather === 'storm';
    const isSnowing = roomClock.weather === 'snow' || roomClock.weather === 'blizzard';
    const isStorming = roomClock.weather === 'storm';

    if (!inSpaceBody) {
        updateOutdoorWeatherAccumulation(roomClock, safeDelta, localSunDirection);
    }

    // Snow Accumulation on Roof
    if (roomShellGroup && !inSpaceBody) {
        let snowLayer = roomShellGroup.getObjectByName('ASCraftSnowLayer');
        const wantsSnow = roomClock.season === 'winter' && (isSnowing || roomClock.weather === 'clear');
        if (wantsSnow) {
            if (!snowLayer) {
                const snowGeo = new THREE.PlaneGeometry(33, 33, 4, 4);
                const snowMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
                snowLayer = new THREE.Mesh(snowGeo, snowMat);
                snowLayer.name = 'ASCraftSnowLayer';
                snowLayer.rotation.x = -Math.PI / 2;
                snowLayer.position.set(0, 10.04, 0); // Just above salón roof
                snowLayer.renderOrder = -10;
                markRaycastIgnored(snowLayer);
                roomShellGroup.add(snowLayer);
            }
            snowLayer.visible = true;
            const targetOpacity = isSnowing ? 0.95 : 0.65;
            snowLayer.material.opacity += (targetOpacity - snowLayer.material.opacity) * 0.002;
        } else if (snowLayer) {
            snowLayer.material.opacity -= 0.005;
            if (snowLayer.material.opacity <= 0) snowLayer.visible = false;
        }
    }
    const playerInsideRoom = isPlayerInsideRoomVolume(playerPosition);
    const weatherParticleIntervalMs = isStorming ? 24 : 34;
    const shouldStepWeatherParticles = !lastWeatherParticleTickAtMs || (now - lastWeatherParticleTickAtMs) >= weatherParticleIntervalMs;
    if (shouldStepWeatherParticles) {
        lastWeatherParticleTickAtMs = now;
        updateWeatherParticleSystem(rainSystem, camera, safeDelta * (weatherParticleIntervalMs / 16.6667), !inSpaceBody && !playerInsideRoom && isRaining);
        updateWeatherParticleSystem(snowSystem, camera, safeDelta * (weatherParticleIntervalMs / 16.6667), !inSpaceBody && !playerInsideRoom && isSnowing);
    } else {
        if (rainSystem) {
            rainSystem.visible = !inSpaceBody && !playerInsideRoom && isRaining;
            rainSystem.position.copy(camera.position);
        }
        if (snowSystem) {
            snowSystem.visible = !inSpaceBody && !playerInsideRoom && isSnowing;
            snowSystem.position.copy(camera.position);
        }
    }
    if (skySystem.starfieldDrift) {
        const seasonalSkyShift = roomClock.yearProgress * Math.PI * 2 * 0.018;
        skySystem.starfieldDrift.quaternion.setFromAxisAngle(
            activeBodyState.spinAxis,
            -Number(activeBodyState.rotationAngle || 0) - seasonalSkyShift
        );
    }
    if (skySystem.constellationDrift) {
        const constellationShift = roomClock.yearProgress * Math.PI * 2 * 0.012;
        skySystem.constellationDrift.quaternion.setFromAxisAngle(
            activeBodyState.spinAxis,
            -Number(activeBodyState.rotationAngle || 0) - constellationShift
        );
    }
    if (skySystem.milkyWayDrift) {
        const galacticShift = roomClock.yearProgress * Math.PI * 2 * 0.004;
        skySystem.milkyWayDrift.quaternion.setFromAxisAngle(
            activeBodyState.spinAxis,
            -Number(activeBodyState.rotationAngle || 0) - galacticShift
        );
    }
    if (skySystem.solarVisual?.group) {
        skySystem.solarVisual.group.visible = perfTier.showSolarVisuals;
    }
    if (skySystem.constellationOverlay) {
        skySystem.constellationOverlay.visible = perfTier.showConstellations;
    }

    const sunDistance = SKY_RADIUS * 0.36;
    const sunPos = localSunDirection.clone().multiplyScalar(sunDistance);
    const earthRelativePhysicalOffset = earthState
        ? earthState.physicalPosition.clone().sub(activeBodyState.physicalPosition || activeBodyState.position)
        : null;
    const earthRelativeDistanceAU = earthRelativePhysicalOffset?.length() || 0;
    const earthFromActiveDirection = earthRelativePhysicalOffset && earthRelativeDistanceAU > 0.000001
        ? earthRelativePhysicalOffset
            .clone()
            .normalize()
            .applyAxisAngle(activeBodyState.spinAxis, -activeBodyState.rotationAngle)
            .normalize()
        : new THREE.Vector3(-0.78, 0.12, -0.62).normalize();
    const earthWorldDistance = getRelativeEarthDistanceVisual(earthRelativeDistanceAU);
    const desiredEarthCenter = inSpaceBody
        ? activeBodyCenter.clone().add(earthFromActiveDirection.clone().multiplyScalar(earthWorldDistance))
        : getEarthCenter();
    const earthWorldShift = desiredEarthCenter.clone().sub(getEarthCenter());
    const earthShiftChanged = !lastEarthWorldShift || lastEarthWorldShift.distanceToSquared(earthWorldShift) > 0.0001;
    const earthVisibilityChanged = lastEarthWorldVisibilityMode === null || lastEarthWorldVisibilityMode !== inSpaceBody;
    if (outdoorTerrainGroup) {
        if (earthShiftChanged) {
            outdoorTerrainGroup.position.copy(earthWorldShift);
        }
        if (earthShiftChanged || earthVisibilityChanged) {
            refreshStaticColliderBoundsForParent(outdoorTerrainGroup);
        }
    }
    if (roomShellGroup) {
        if (earthShiftChanged) {
            roomShellGroup.position.set(earthWorldShift.x, earthWorldShift.y + getRoomWorldOriginY(), earthWorldShift.z);
        }
        roomShellGroup.visible = !inSpaceBody;
        if (earthShiftChanged || earthVisibilityChanged) {
            refreshStaticColliderBoundsForParent(roomShellGroup);
        }
    }
    if (roomDoor) {
        if (earthShiftChanged) {
            roomDoor.position.set(
                earthWorldShift.x,
                earthWorldShift.y + getRoomWorldOriginY(),
                earthWorldShift.z + (ROOM_DEPTH * 0.5)
            );
        }
        roomDoor.visible = !inSpaceBody;
        if (earthShiftChanged || earthVisibilityChanged) {
            refreshCollisionMeshBounds(roomDoor);
        }
    }
    if (earthLaunchPad) {
        if (earthShiftChanged) {
            const rocketAnchor = getEarthLaunchPadAnchor();
            const earthLaunchPadBaseY = getEarthLaunchPadBaseY();
            earthLaunchPad.position.set(
                earthWorldShift.x + rocketAnchor.x,
                earthWorldShift.y + earthLaunchPadBaseY,
                earthWorldShift.z + rocketAnchor.z
            );
            alignEarthLaunchStructure(earthLaunchPad, rocketAnchor.x, rocketAnchor.z, Math.PI * 0.5);
            registerEarthLaunchPadColliders(earthLaunchPad.position);
        }
    }
    if (earthRocketShuttle) {
        if (earthShiftChanged) {
            const rocketAnchor = getEarthLaunchPadAnchor();
            const earthLaunchPadBaseY = getEarthLaunchPadBaseY();
            earthRocketShuttle.position.set(
                earthWorldShift.x + rocketAnchor.x,
                earthWorldShift.y + earthLaunchPadBaseY + EARTH_ROCKET_PAD_OFFSET_Y,
                earthWorldShift.z + rocketAnchor.z
            );
            alignEarthLaunchStructure(earthRocketShuttle, rocketAnchor.x, rocketAnchor.z, Math.PI * 0.5);
        }
    }
    if (earthShiftChanged) {
        if (!lastEarthWorldShift) lastEarthWorldShift = new THREE.Vector3();
        lastEarthWorldShift.copy(earthWorldShift);
    }
    lastEarthWorldVisibilityMode = inSpaceBody;

    // Shadow logic is now handled during applyBalancedLighting in the sky system

    if (perfTier.showSolarVisuals && skySystem.solarVisual) {
        const earthVisibleInnerPlanets = new Set(['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']);
        if (skySystem.solarVisual.sunAnchor) {
            applyInterpolatedObjectTransform(
                skySystem.solarVisual.sunAnchor,
                sunPos,
                null,
                safeDelta,
                { positionLambda: 20 }
            );
        }
        SOLAR_SYSTEM_VISUAL_PLANETS.forEach((planetCfg) => {
            const planetBody = skySystem.solarVisual.planetBodies.get(planetCfg.id);
            const planetState = snapshot.planets.get(planetCfg.id);
            const planetVisibleFromEarth = earthVisibleInnerPlanets.has(planetCfg.id);
            if (planetBody) {
                if (planetBody.orbitPlane) planetBody.orbitPlane.visible = planetVisibleFromEarth;
                if (planetBody.anchor) planetBody.anchor.visible = planetVisibleFromEarth;
                if (planetBody.label) planetBody.label.visible = planetVisibleFromEarth;
            }
            if (planetBody?.orbitPivot) {
                planetBody.orbitPivot.rotation.y = dampAngleRadians(
                    Number(planetBody.orbitPivot.rotation.y || 0),
                    Number(planetState?.orbitAngle || 0),
                    38,
                    safeDelta
                );
            }
            if (planetBody?.mesh) {
                planetBody.mesh.rotation.y = dampAngleRadians(
                    Number(planetBody.mesh.rotation.y || 0),
                    Number(planetState?.rotationAngle || 0),
                    36,
                    safeDelta
                );
            }
            (planetCfg.moons || []).forEach((moonCfg) => {
                const moonBody = skySystem.solarVisual.moonBodies.get(`${planetCfg.id}:${moonCfg.id}`);
                const moonState = snapshot.moons.get(`${planetCfg.id}:${moonCfg.id}`);
                if (moonBody) {
                    if (moonBody.orbitPlane) moonBody.orbitPlane.visible = planetVisibleFromEarth;
                    if (moonBody.anchor) moonBody.anchor.visible = planetVisibleFromEarth;
                    if (moonBody.label) moonBody.label.visible = planetVisibleFromEarth;
                }
                if (moonBody?.orbitPivot) {
                    moonBody.orbitPivot.rotation.y = dampAngleRadians(
                        Number(moonBody.orbitPivot.rotation.y || 0),
                        Number(moonState?.orbitAngle || 0),
                        22,
                        safeDelta
                    );
                }
                if (moonBody?.mesh) {
                    moonBody.mesh.rotation.y = dampAngleRadians(
                        Number(moonBody.mesh.rotation.y || 0),
                        moonState?.lockedToParent ? 0 : Number(moonState?.rotationAngle || 0),
                        20,
                        safeDelta
                    );
                }
            });
        });
    }

    // Helper functions moved up to avoid ReferenceError

    const isEarthSurfaceView = !inSpaceBody;
    const isMoonSurfaceView = inSpaceBody && currentSpaceBodyId === 'moon';
    const moonHero = getMoonHeroConfig();
    const moonFromEarthDirection = earthState && earthMoonState
        ? earthMoonState.physicalPosition.clone().sub(earthState.physicalPosition).normalize().applyAxisAngle(earthState.spinAxis, -earthState.rotationAngle).normalize()
        : new THREE.Vector3(0.64, 0.18, -0.74).normalize();
    const earthFromMoonDirection = earthState && earthMoonState
        ? earthState.physicalPosition.clone().sub(earthMoonState.physicalPosition).normalize().applyAxisAngle(earthMoonState.spinAxis, -earthMoonState.rotationAngle).normalize()
        : new THREE.Vector3(-0.78, 0.12, -0.62).normalize();
    const moonPos = moonFromEarthDirection.clone().multiplyScalar(MOON_FROM_EARTH_SKY_DISTANCE * moonHero.heroMoonDistanceScale);
    moonPos.add(new THREE.Vector3(
        Number(moonHero.heroMoonAnchor?.x || 0),
        Number(moonHero.heroMoonAnchor?.y || 0),
        Number(moonHero.heroMoonAnchor?.z || 0)
    ));
    const earthMarkerPos = earthFromMoonDirection.clone().multiplyScalar(EARTH_FROM_MOON_SKY_DISTANCE);
    const moonToEarthInertial = earthState && earthMoonState
        ? earthState.physicalPosition.clone().sub(earthMoonState.physicalPosition).normalize()
        : new THREE.Vector3(0, 0, -1);
    const moonToSunInertial = earthMoonState?.localSunDirection?.clone?.() || new THREE.Vector3(0, 0, -1);
    const localEclipseSample = getEclipseStrengthSampleAtTime(now, surfaceNormal);
    const solarStrength = Number(localEclipseSample?.solarStrength || 0);
    const lunarStrength = Number(localEclipseSample?.lunarStrength || 0);
    const isSolarEclipseActive = solarStrength > 0.02;

    // Smoothly increase moon scale during solar eclipse for better coverage
    const moonScaleMultiplier = 1.0 + (solarStrength * 0.18);
    const finalMoonPos = isSolarEclipseActive ? sunPos.clone() : moonPos.clone();

    const eclipseRuntimeSnapshot = updateEclipseRuntimeState({
        simulationNowMs: now,
        realNowMs: safeRealNow,
        solarStrength,
        lunarStrength,
        surfaceNormal
    });

    const localEclipseDim = clamp01(1 - (solarStrength * 0.92));
    const eclipseDarkenFactor = inSpaceBody
        ? 0
        : clamp01((1 - localEclipseDim) + (solarStrength * 0.48));

    // Apply deeper darkness for localized eclipse
    const eclipseEnvDarkenMax = 0.94; // Increased from 0.84 for more "obscuridad"
    if (!inSpaceBody && eclipseDarkenFactor > 0.001) {
        const eclipseSkyColor = skyColor.clone().lerp(new THREE.Color(0x060913), eclipseDarkenFactor * eclipseEnvDarkenMax);
        if (skySystem.skyBackdrop?.material?.color) {
            skySystem.skyBackdrop.material.color.copy(eclipseSkyColor);
        }
        if (scene.fog) {
            scene.fog.color.copy(eclipseSkyColor);
            scene.fog.density += eclipseDarkenFactor * 0.00062;
        }
        if (gameContainer?.style) {
            gameContainer.style.backgroundColor = `#${eclipseSkyColor.getHexString()}`;
        }
    }
    const moonPhaseAmount = earthMoonState
        ? clamp01((1 - moonToSunInertial.dot(moonToEarthInertial)) * 0.5)
        : 0;
    const moonDirectionLocal = moonPos.clone().normalize();
    const moonAltitude = moonDirectionLocal.dot(astronomyNormal);
    if (earthMoonState) {
        earthMoonState.phaseAmount = moonPhaseAmount;
        earthMoonState.penumbraFactor = Number(localEclipseSample?.lunarStrength || 0);
        earthMoonState.umbraFactor = 0;
    }

    applyInterpolatedObjectTransform(
        skySystem.sunSprite,
        sunPos,
        null,
        safeDelta,
        { positionLambda: 24 }
    );
    if (skySystem.sunBloom) {
        applyInterpolatedObjectTransform(
            skySystem.sunBloom,
            sunPos,
            null,
            safeDelta,
            { positionLambda: 24 }
        );
    }
    if (skySystem.sunLabelAnchor) {
        applyInterpolatedObjectTransform(
            skySystem.sunLabelAnchor,
            sunPos,
            null,
            safeDelta,
            { positionLambda: 24 }
        );
    }
    const sunVisible = altitude > -0.2;
    if (skySystem.sunHalo) {
        applyInterpolatedObjectTransform(
            skySystem.sunHalo,
            sunPos,
            null,
            safeDelta,
            { positionLambda: 24 }
        );
        const haloStrength = clamp01((solarStrength - ECLIPSE_HALO_START_THRESHOLD) / 0.84);
        skySystem.sunHalo.visible = sunVisible && haloStrength > 0.01;
        if (skySystem.sunHalo.material) {
            skySystem.sunHalo.material.opacity = clamp01((0.12 + (haloStrength * 0.86)) * (0.35 + (dayFactor * 0.65)));
        }
        skySystem.sunHalo.scale.setScalar(
            applyInterpolatedScalar(
                skySystem.sunHalo,
                '__sunHaloScale',
                (17 + dayFactor * 14) * sunApparentScale * (1.2 + haloStrength * 1.04),
                safeDelta,
                14
            )
        );
    }
    skySystem.sunSprite.visible = sunVisible;
    skySystem.sunSprite.material.opacity = clamp01((0.18 + dayFactor * 1.08 + twilightFactor * 0.24) * localEclipseDim * THREE.MathUtils.clamp(sunApparentScale, 0.84, 1.34));
    // Important: PlaneMesh must lookAt camera to avoid 'giant slab' effect
    skySystem.sunSprite.lookAt(0, 0, 0);
    skySystem.sunSprite.scale.setScalar(
        applyInterpolatedScalar(
            skySystem.sunSprite,
            '__sunScale',
            (3.4 + dayFactor * 2.7 + twilightFactor * 0.7) * sunApparentScale,
            safeDelta,
            20
        )
    );

    // Integrated Moon and Planet View Logic
    if (skySystem.earthMoonViz) {
        if (isMoonSurfaceView) {
            applyInterpolatedObjectTransform(skySystem.earthMoonViz, earthMarkerPos, null, safeDelta, { positionLambda: 10 });
        } else {
            skySystem.earthMoonViz.position.set(0, 0, 0);
            skySystem.earthMoonViz.userData.__interpolationReady = false;
        }
    }

    if (isEarthSurfaceView) {
        // Moon Body Display
        const moonLiteMode = shouldUseLiteOrbitalDisplay(skySystem.moonDisplay, moonPos, 1.08);
        if (skySystem.moonDisplay?.root) {
            applyInterpolatedObjectTransform(
                skySystem.moonDisplay.root,
                finalMoonPos,
                directionToQuaternion(
                    finalMoonPos.clone().multiplyScalar(-1),
                    new THREE.Vector3(0, 0, 1),
                    earthMoonState?.faceOffset || 0
                ),
                safeDelta,
                { positionLambda: 10, rotationLambda: 14 }
            );
            skySystem.moonDisplay.root.visible = true;
            skySystem.moonDisplay.root.scale.setScalar(1.65 * moonHero.heroMoonScale);
            applyOrbitalDisplayDetail(skySystem.moonDisplay, moonLiteMode, false);
            updateOrbitalBodyLighting(skySystem.moonDisplay, sunPos.clone().sub(finalMoonPos).normalize(), {
                penumbra: Number(localEclipseSample?.lunarStrength || 0),
                umbra: 0,
                redTint: 0
            });
        }
        // Remove "otra luna" as requested by the user, only keep the 3D phase moon
        if (skySystem.moonSprite) {
            skySystem.moonSprite.visible = false;
        }
        if (skySystem.earthDisplay?.root) skySystem.earthDisplay.root.visible = false;
        if (skySystem.earthSprite) skySystem.earthSprite.visible = false;
    } else if (isMoonSurfaceView) {
        if (skySystem.moonDisplay?.root) skySystem.moonDisplay.root.visible = false;
        if (skySystem.moonSprite) skySystem.moonSprite.visible = false;
        if (skySystem.earthDisplay?.root) {
            const earthLiteMode = shouldUseLiteOrbitalDisplay(skySystem.earthDisplay, earthMarkerPos, 1.52);
            applyInterpolatedObjectTransform(
                skySystem.earthDisplay.root,
                new THREE.Vector3(0, 0, 0),
                directionToQuaternion(earthMarkerPos.clone().multiplyScalar(-1), new THREE.Vector3(0, 0, 1), 0),
                safeDelta,
                { positionLambda: 10, rotationLambda: 14 }
            );
            skySystem.earthDisplay.root.visible = true;
            skySystem.earthDisplay.root.scale.setScalar(1.52);
            applyOrbitalDisplayDetail(skySystem.earthDisplay, earthLiteMode, true);
        }
        if (skySystem.earthSprite) {
            skySystem.earthSprite.visible = true;
            skySystem.earthSprite.material.opacity = 0.12;
            skySystem.earthSprite.scale.setScalar(7.4);
        }
    } else {
        if (skySystem.moonDisplay?.root) skySystem.moonDisplay.root.visible = false;
        if (skySystem.moonSprite) skySystem.moonSprite.visible = false;
        if (skySystem.earthDisplay?.root) skySystem.earthDisplay.root.visible = false;
        if (skySystem.earthSprite) skySystem.earthSprite.visible = false;
    }
    if (skySystem.earthDisplay?.mesh) {
        skySystem.earthDisplay.mesh.rotation.y = THREE.MathUtils.damp(
            Number(skySystem.earthDisplay.mesh.rotation.y || 0),
            Number(earthState?.rotationAngle || 0),
            12,
            safeDelta
        );
        skySystem.earthDisplay.mesh.rotation.z = 0;
    }
    if (skySystem.earthDisplay?.spinMarker) {
        const fullDetailVisible = Array.isArray(skySystem.earthDisplay.instancedMeshes)
            ? skySystem.earthDisplay.instancedMeshes.some((mesh) => !!mesh?.visible)
            : true;
        skySystem.earthDisplay.spinMarker.visible = isMoonSurfaceView && fullDetailVisible;
    }
    if (skySystem.moonDisplay?.mesh) {
        skySystem.moonDisplay.mesh.rotation.y = THREE.MathUtils.damp(
            Number(skySystem.moonDisplay.mesh.rotation.y || 0),
            0,
            12,
            safeDelta
        );
    }

    if (skySystem.starsMaterial?.uniforms) {
        skySystem.starsMaterial.uniforms.uTime.value = now * 0.001;
        skySystem.starsMaterial.uniforms.uNightOpacity.value = inSpaceBody
            ? 1
            : clamp01((nightFactor - 0.03) / 0.88) * 0.96;
    }

    if (perfTier.showConstellations && Array.isArray(skySystem.constellationItems) && skySystem.constellationItems.length) {
        const constellationOpacity = inSpaceBody
            ? 0.78
            : clamp01((nightFactor - 0.05) / 0.48) * 0.86;
        skySystem.constellationItems.forEach((group, idx) => {
            if (!group) return;
            const pulse = 0.82 + 0.18 * Math.sin((now * 0.001) * (group.userData.twinkleSpeed || 0.3) + (group.userData.twinklePhase || idx));
            const opacity = constellationOpacity * pulse;
            if (group.userData.lineMaterial) {
                group.userData.lineMaterial.opacity = opacity;
            }
            if (group.userData.pointMaterial) {
                group.userData.pointMaterial.opacity = Math.min(0.95, opacity * 1.15);
            }
            group.visible = opacity > 0.01;
        });
    }

    const milkyWayOpacity = inSpaceBody
        ? 0.52 // Much more reasonable than 0.94 which obscuredeverything
        : clamp01((nightFactor - 0.12) / 0.72) * (1 - dayFactor);
    if (skySystem.milkyWayMaterial?.uniforms) {
        skySystem.milkyWayMaterial.uniforms.uTime.value = now * 0.001;
        skySystem.milkyWayMaterial.uniforms.uOpacity.value = milkyWayOpacity;
    } else if (skySystem.milkyWay?.material) {
        skySystem.milkyWay.material.opacity = milkyWayOpacity;
    }
    if (skySystem.milkyWay) {
        skySystem.milkyWay.visible = milkyWayOpacity > 0.01;
    }

    if (skySystem.auroraSystem?.group) {
        const magneticLatitude = astronomyNormal.dot(activeBodyState.spinAxis);
        const northAurora = !inSpaceBody
            ? clamp01((magneticLatitude - 0.72) / 0.12) * clamp01((nightFactor - 0.68) / 0.16)
            : 0;
        const southAurora = !inSpaceBody
            ? clamp01(((-magneticLatitude) - 0.72) / 0.12) * clamp01((nightFactor - 0.68) / 0.16)
            : 0;
        const northQuaternion = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            activeBodyState.spinAxis.clone().normalize()
        );
        const southQuaternion = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            activeBodyState.spinAxis.clone().multiplyScalar(-1).normalize()
        );
        skySystem.auroraSystem.northGroup.quaternion.copy(northQuaternion);
        skySystem.auroraSystem.southGroup.quaternion.copy(southQuaternion);
        const updateAuroraRibbons = (ribbons, intensity) => {
            ribbons.forEach((ribbon, idx) => {
                if (!ribbon?.material) return;
                const wave = 0.84 + (Math.sin((now * 0.001) * (ribbon.userData.speed || 0.4) + (ribbon.userData.phase || idx)) * 0.16);
                ribbon.material.opacity = intensity * (ribbon.userData.baseOpacity || 0.08) * wave * 0.42;
                ribbon.scale.y = (ribbon.userData.scalePulse || 1) * (0.92 + (wave * 0.16));
                ribbon.scale.x = 0.72 + (wave * 0.06);
                ribbon.visible = ribbon.material.opacity > 0.01;
            });
        };
        updateAuroraRibbons(skySystem.auroraSystem.northRibbons, northAurora);
        updateAuroraRibbons(skySystem.auroraSystem.southRibbons, southAurora);
        skySystem.auroraSystem.group.visible = northAurora > 0.01 || southAurora > 0.01;
    }

    if (skySystem.cometVisuals?.group && skySystem.cometVisuals.cometMap instanceof Map) {
        let visibleCometCount = 0;
        skySystem.cometVisuals.cometMap.forEach((visual, cometId) => {
            const cometState = cometSnapshot.get(cometId);
            if (!visual?.group || !cometState) return;
            const relativeOffset = cometState.physicalPosition.clone().sub(activeBodyState.physicalPosition || activeBodyState.position);
            const relativeDistanceAU = Math.max(0.01, relativeOffset.length());
            const localDirection = relativeOffset
                .clone()
                .normalize()
                .applyAxisAngle(activeBodyState.spinAxis, -activeBodyState.rotationAngle)
                .normalize();
            const angularSeparationFromSun = getDirectionSeparation(localDirection, localSunDirection);
            const visibility = (inSpaceBody ? 0.9 : clamp01((nightFactor - 0.04) / 0.52))
                * clamp01((angularSeparationFromSun - 0.18) / 0.42)
                * clamp01(1.25 - Math.log10(1 + (relativeDistanceAU * 2.8)));
            if (visibility <= 0.02) {
                visual.group.visible = false;
                if (visual.tail?.material) visual.tail.material.opacity = 0;
                if (visual.head?.material) visual.head.material.opacity = 0;
                return;
            }
            visibleCometCount += 1;
            const cometSkyDistance = SKY_RADIUS * THREE.MathUtils.clamp(0.66 + (Math.log10(1 + relativeDistanceAU) * 0.06), 0.64, 0.8);
            const cometPosition = localDirection.clone().multiplyScalar(cometSkyDistance);
            const awayFromSunLocal = cometState.physicalPosition
                .clone()
                .normalize()
                .applyAxisAngle(activeBodyState.spinAxis, -activeBodyState.rotationAngle)
                .normalize();
            const tailLength = THREE.MathUtils.clamp((12 / Math.sqrt(Math.max(0.18, cometState.sunDistanceAU))) + 8, 10, 28) * visibility;
            visual.group.visible = true;
            applyInterpolatedObjectTransform(
                visual.group,
                cometPosition,
                null,
                safeDelta,
                { positionLambda: 14 }
            );
            if (visual.head?.material) {
                visual.head.material.opacity = THREE.MathUtils.clamp(0.14 + (visibility * 0.92), 0, 0.95);
            }
            if (visual.head) {
                visual.head.scale.setScalar(5.8 + (visibility * 5.2));
            }
            if (visual.tail?.material) {
                visual.tail.material.opacity = THREE.MathUtils.clamp(visibility * 0.7, 0, 0.78);
            }
            if (visual.tail?.geometry?.attributes?.position) {
                const tailPositions = visual.tail.geometry.attributes.position.array;
                tailPositions[0] = 0;
                tailPositions[1] = 0;
                tailPositions[2] = 0;
                tailPositions[3] = awayFromSunLocal.x * tailLength * 0.42;
                tailPositions[4] = awayFromSunLocal.y * tailLength * 0.42;
                tailPositions[5] = awayFromSunLocal.z * tailLength * 0.42;
                tailPositions[6] = awayFromSunLocal.x * tailLength;
                tailPositions[7] = awayFromSunLocal.y * tailLength;
                tailPositions[8] = awayFromSunLocal.z * tailLength;
                visual.tail.geometry.attributes.position.needsUpdate = true;
            }
        });
        skySystem.cometVisuals.group.visible = visibleCometCount > 0;
    }

    if (skySystem.meteorSystem?.group && Array.isArray(skySystem.meteorSystem.meteors)) {
        const meteorNightFactor = !inSpaceBody ? clamp01((nightFactor - 0.14) / 0.44) : 0;
        const surfaceUp = surfaceNormal.clone().normalize();
        const tangentEast = new THREE.Vector3().crossVectors(activeBodyState.spinAxis, surfaceUp);
        if (tangentEast.lengthSq() < 1e-5) {
            tangentEast.set(1, 0, 0).cross(surfaceUp);
        }
        tangentEast.normalize();
        const tangentNorth = new THREE.Vector3().crossVectors(surfaceUp, tangentEast).normalize();
        const activateMeteor = () => {
            const meteor = skySystem.meteorSystem.meteors.find((item) => !item.userData?.active);
            if (!meteor) return;
            const azimuth = Math.random() * Math.PI * 2;
            const altitudeMix = 0.34 + (Math.random() * 0.36);
            const horizonMix = Math.sqrt(Math.max(0, 1 - (altitudeMix * altitudeMix)));
            const startDirection = surfaceUp.clone().multiplyScalar(altitudeMix)
                .add(tangentEast.clone().multiplyScalar(Math.cos(azimuth) * horizonMix))
                .add(tangentNorth.clone().multiplyScalar(Math.sin(azimuth) * horizonMix))
                .normalize();
            const trailDirection = tangentEast.clone().multiplyScalar(Math.cos(azimuth + 0.9))
                .add(tangentNorth.clone().multiplyScalar(Math.sin(azimuth + 0.9)))
                .add(surfaceUp.clone().multiplyScalar(-0.22 - (Math.random() * 0.14)))
                .normalize();
            const endDirection = startDirection.clone().add(trailDirection.clone().multiplyScalar(0.22 + (Math.random() * 0.14))).normalize();
            meteor.userData.active = true;
            meteor.userData.startedAt = now;
            meteor.userData.lifeMs = 620 + (Math.random() * 460);
            meteor.userData.startDirection.copy(startDirection);
            meteor.userData.endDirection.copy(endDirection);
            meteor.userData.trailDirection.copy(trailDirection);
            meteor.userData.skyDistance = SKY_RADIUS * (0.66 + (Math.random() * 0.08));
            meteor.userData.streakLength = 12 + (Math.random() * 11);
            meteor.visible = true;
        };

        if (meteorNightFactor > 0.08 && now >= (skySystem.meteorSystem.nextSpawnAtMs || 0)) {
            activateMeteor();
            skySystem.meteorSystem.nextSpawnAtMs = now + (1800 + (Math.random() * 4200)) / Math.max(0.35, meteorNightFactor);
        }

        let visibleMeteorCount = 0;
        skySystem.meteorSystem.meteors.forEach((meteor, idx) => {
            if (!meteor?.userData?.active) {
                meteor.visible = false;
                if (meteor.material) meteor.material.opacity = 0;
                return;
            }
            const elapsedMeteorMs = now - (meteor.userData.startedAt || now);
            const lifeMs = Math.max(300, meteor.userData.lifeMs || 900);
            const progressMeteor = elapsedMeteorMs / lifeMs;
            if (progressMeteor >= 1 || meteorNightFactor <= 0.04) {
                meteor.userData.active = false;
                meteor.visible = false;
                if (meteor.material) meteor.material.opacity = 0;
                return;
            }
            visibleMeteorCount += 1;
            const headDirection = meteor.userData.startDirection.clone().lerp(meteor.userData.endDirection, progressMeteor).normalize();
            const headPosition = headDirection.multiplyScalar(meteor.userData.skyDistance || SKY_RADIUS * 0.7);
            const trailVector = meteor.userData.trailDirection.clone().normalize().multiplyScalar(meteor.userData.streakLength || 16);
            const meteorPositions = meteor.geometry.attributes.position.array;
            meteorPositions[0] = headPosition.x;
            meteorPositions[1] = headPosition.y;
            meteorPositions[2] = headPosition.z;
            meteorPositions[3] = headPosition.x - (trailVector.x * 0.45);
            meteorPositions[4] = headPosition.y - (trailVector.y * 0.45);
            meteorPositions[5] = headPosition.z - (trailVector.z * 0.45);
            meteorPositions[6] = headPosition.x - trailVector.x;
            meteorPositions[7] = headPosition.y - trailVector.y;
            meteorPositions[8] = headPosition.z - trailVector.z;
            meteor.geometry.attributes.position.needsUpdate = true;
            meteor.visible = true;
            if (meteor.material) {
                meteor.material.opacity = Math.sin(progressMeteor * Math.PI) * 0.82 * meteorNightFactor;
            }
        });
        skySystem.meteorSystem.lastVisibleCount = visibleMeteorCount;
        skySystem.meteorSystem.group.visible = visibleMeteorCount > 0;
    }

    const lightingDebugState = skyLightingRuntime?.applyBalancedLighting?.({
        sunLight,
        moonLight,
        starLight,
        ambientLight,
        hemisphereLight,
        activeBodyCenter: isEarthSurfaceView ? playerWorldPosition : activeBodyCenter,
        localSunDirection,
        localEclipseDim,
        sunEnergyScale,
        dayFactor,
        twilightFactor,
        nightFactor,
        moonDirection: isEarthSurfaceView ? moonDirectionLocal : null,
        moonAltitude,
        moonPhase: moonPhaseAmount,
        moonVisible: isEarthSurfaceView && !!skySystem.moonDisplay?.root?.visible,
        inSpaceBody,
        getPlanetEyeRadius,
        delta: safeDelta,
        nowMs: now,
        performanceTier: currentPerformanceTier,
        forceShadowRefresh: skyShadowRefreshPending || earthVisibilityChanged
    });
    performanceDebugState.skyTimeScale = Number(eclipseRuntimeSnapshot?.timeScale || 1);
    performanceDebugState.skyTargetTimeScale = Number(eclipseRuntimeSnapshot?.targetTimeScale || 1);
    if (lightingDebugState) {
        performanceDebugState.shadowRefreshCount = Number(lightingDebugState.shadowRefreshCount || 0);
        performanceDebugState.lastShadowUpdateAt = Number(lightingDebugState.lastShadowUpdateAt || 0);
        performanceDebugState.lightAngularDelta = Number(lightingDebugState.lightAngularDelta || 0);
        performanceDebugState.lightPositionDelta = Number(lightingDebugState.lightPositionDelta || 0);
        performanceDebugState.skyTimeSource = getSkyTimeSourceLabel();
        if (lightingDebugState.shadowRefreshApplied || !sunLight?.castShadow) {
            skyShadowRefreshPending = false;
        }
    }
    if (Array.isArray(classroomLights) && classroomLights.length) {
        classroomLights.forEach((light) => {
            if (!light) return;
            light.visible = false;
            light.intensity = 0;
        });
    }
    if (Array.isArray(outdoorLampLights) && outdoorLampLights.length) {
        outdoorLampLights.forEach((light, index) => {
            if (!light) return;
            const lampNightFactor = inSpaceBody ? 0 : clamp01((nightFactor - 0.04) / 0.58);
            const duskWarmup = inSpaceBody ? 0 : clamp01((twilightFactor - 0.15) / 0.75) * 0.42;
            const baseTargetIntensity = (lampNightFactor * 2.8) + duskWarmup;
            const smoothedIntensity = THREE.MathUtils.damp(
                Number(light.intensity || 0),
                baseTargetIntensity,
                7.2,
                safeDelta
            );
            const flicker = smoothedIntensity > 0.05
                ? (0.95 + (Math.sin((now * 0.0042) + (index * 1.71)) * 0.05))
                : 1;
            const lampIntensity = smoothedIntensity * flicker;
            light.intensity = lampIntensity;
            light.visible = lampIntensity > 0.01;
            const head = light.parent?.userData?.lampHead;
            const halo = light.parent?.userData?.lampHalo;
            if (head?.material?.emissive) {
                head.material.emissiveIntensity = lampIntensity > 0.01 ? (0.18 + lampIntensity * 0.32) : 0;
            }
            if (halo?.material) {
                halo.material.opacity = lampIntensity > 0.01 ? Math.min(0.7, 0.08 + lampIntensity * 0.13) : 0;
                halo.visible = halo.material.opacity > 0.01;
            }
        });
    }
    if (now - lastLightingMoodAtMs >= 180) { // Throttle mood updates to ~5Hz
        lastLightingMoodAtMs = now;
        updateSharedVoxelMaterialMood({
            dayFactor,
            twilightFactor,
            inSpaceBody,
            now,
            season: roomClock.season,
            seasonProgress: roomClock.seasonProgress,
            weather: roomClock.weather,
            yearProgress: roomClock.yearProgress
        });
    }

    if (!inSpaceBody && now - lastParticleAnimationTickAtMs >= getParticleUpdateIntervalMs()) {
        lastParticleAnimationTickAtMs = now;
        updateCherryPetalSystem(safeDelta, now);
    }

    if (!inSpaceBody && Array.isArray(outdoorRiverFish) && outdoorRiverFish.length && now === lastParticleAnimationTickAtMs) {
        outdoorRiverFish.forEach((fish, idx) => {
            const swimPhase = (now * 0.001 * (fish.userData.swimSpeed || 0.4)) + (fish.userData.phase || idx);
            const swimX = fish.userData.homeX + (Math.sin(swimPhase) * 3.2 * (fish.userData.turnBias || 1));
            const centerZ = getRiverCenterZAtX(swimX);
            const waterSurfaceY = getOutdoorRiverWaterSurfaceY(swimX, centerZ);
            if (waterSurfaceY === null || inSpaceBody) {
                fish.visible = false;
                return;
            }
            fish.visible = true;
            fish.position.set(
                swimX,
                waterSurfaceY - 0.95 + Math.sin(swimPhase * 2.2) * 0.08,
                centerZ + Math.sin((swimPhase * 1.4) + idx) * 0.42
            );
            fish.rotation.y = Math.atan2(
                Math.cos((swimPhase * 1.4) + idx) * 0.35,
                Math.cos(swimPhase) * (fish.userData.turnBias || 1)
            );
            fish.rotation.z = Math.sin(swimPhase * 2.4) * 0.12;
            const tail = fish.children[1];
            if (tail) {
                tail.rotation.y = Math.sin(swimPhase * 4.5) * 0.45;
            }
        });
    }

    if (perfTier.showClouds && Array.isArray(skySystem.cloudList)) {
        const cloudTickStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const planetCenter = cloudScratchState.planetCenter.copy(getEarthCenter());
        const cloudPos = cloudScratchState.position;
        const normal = cloudScratchState.normal;
        const tangent = cloudScratchState.tangent;
        const bitangent = cloudScratchState.bitangent;
        const basis = cloudScratchState.basis;
        skySystem.cloudList.forEach((cloud, idx) => {
            if (inSpaceBody) {
                cloud.visible = false;
                const hiddenMaterial = cloud.userData.cloudMaterial;
                if (hiddenMaterial) {
                    hiddenMaterial.opacity = 1;
                }
                return;
            }
            cloud.visible = true;
            const orbitSpeed = cloud.userData.orbitSpeed || 0.04;
            cloud.userData.orbitAngle = (cloud.userData.orbitAngle || 0) + (orbitSpeed * safeDelta);
            const angle = cloud.userData.orbitAngle;
            const latitude = cloud.userData.latitude || 0.78;
            const bandTilt = cloud.userData.bandTilt || 0;
            const isRainy = currentRoomTimeState?.weather === 'rain' || currentRoomTimeState?.weather === 'storm' || currentRoomTimeState?.weather === 'snow' || currentRoomTimeState?.weather === 'blizzard';
            const stormIntensity = currentRoomTimeState?.weather === 'storm' || currentRoomTimeState?.weather === 'blizzard' ? 1 : 0;
            const cloudRadius = cloud.userData.orbitRadius || (OUTDOOR_WORLD_RADIUS + 160);
            const cosLatitude = Math.cos(latitude); // Stable circular rotation
            const sinLatitude = Math.sin(latitude);
            cloud.position.x = Math.cos(angle) * cosLatitude * cloudRadius;
            cloud.position.z = Math.sin(angle) * cosLatitude * cloudRadius;
            cloud.position.y = getEarthCenter().y
                + (sinLatitude * cloudRadius)
                + Math.sin((progress * Math.PI * 2) + (cloud.userData.verticalPhase || idx)) * (cloud.userData.verticalWobble || 0.2);

            const scale = (cloud.userData.baseScale || 1); // Remove pulsing
            cloud.scale.setScalar(scale);

            cloudPos.copy(cloud.position);
            normal.copy(cloudPos).sub(planetCenter).normalize();
            tangent.set(-Math.sin(angle) * cosLatitude, 0, Math.cos(angle) * cosLatitude);
            if (Math.abs(sinLatitude) > 0.001) {
                tangent.y = Math.cos(latitude) * (cloud.userData.orbitSpeed || 0.04) * 0.1;
            }
            if (tangent.lengthSq() < 0.0001) {
                tangent.crossVectors(cloudScratchState.fallbackUp, normal);
            }
            tangent.normalize();
            bitangent.crossVectors(normal, tangent).normalize();
            tangent.crossVectors(bitangent, normal).normalize();
            basis.makeBasis(bitangent, normal, tangent);
            cloud.quaternion.setFromRotationMatrix(basis);

            // Localized Weather logic
            const weatherPulse = currentRoomTimeState?.yearProgress || 0;
            const cloudSeed = (weatherPulse * 42.1) + (idx * 1.7);
            const cloudWeather = (Math.sin(cloudSeed) + 1) * 0.5;
            const isStormy = cloudWeather > 0.72 && isRainy;
            cloud.userData.isStormy = isStormy;

            const cloudMaterial = cloud.userData.cloudMaterial;
            if (cloudMaterial) {
                cloudMaterial.opacity = 1;
                const cloudBaseColor = nightFactor > 0.55 ? 0xd9e5f4 : 0xffffff;
                if (isStormy) {
                    cloudMaterial.color.setHex(nightFactor > 0.55 ? 0x1a2d3f : 0x5a6c7f);
                } else {
                    cloudMaterial.color.setHex(cloudBaseColor);
                }

                // Lightning Flash Effect for stormy clouds
                if (isStormy && Math.random() < 0.003) {
                    cloudMaterial.emissive = new THREE.Color(0xb0d8ff);
                    cloudMaterial.emissiveIntensity = 8;
                    setTimeout(() => {
                        if (cloudMaterial) {
                            cloudMaterial.emissiveIntensity = 0;
                        }
                    }, 50 + Math.random() * 150);
                }
            }
        });
        performanceDebugState.cloudUpdateMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - cloudTickStart);
    } else if (Array.isArray(skySystem.cloudList)) {
        skySystem.cloudList.forEach((cloud) => {
            cloud.visible = false;
            const hiddenMaterial = cloud.userData?.cloudMaterial;
            if (hiddenMaterial) hiddenMaterial.opacity = 1;
        });
    }

    // Orbit moon and planet logic removed as requested
    if (Array.isArray(skySystem.focusLabels) && skySystem.focusLabels.length) {
        skyLightingRuntime?.updateFocusLabels?.({
            camera,
            focusLabels: skySystem.focusLabels
        });
    }
    // Throttle debug publishing to avoid GC pressure and UI freezes
    const nowSyncMs = Date.now();
    if (!lastDebugPublishAtMs || (nowSyncMs - lastDebugPublishAtMs) >= 2000) {
        lastDebugPublishAtMs = nowSyncMs;

        const arenaColliderCount = staticCollisionItems ? Array.from(staticCollisionItems.keys()).filter((id) => String(id).startsWith('__static_arena_')).length : 0;

        publishSkyDebugState({
            body: isSpaceBodyActive() ? currentSpaceBodyId : 'earth',
            arenaCollisionState: {
                totalArenaColliders: arenaColliderCount,
                collisionWorld: collisionBroadphase?.getStats?.() ?? null
            },
            roomTime: {
                label: roomClock.timeLabel,
                timeZone: roomClock.timeZone,
                dayProgress: Number(roomClock.dayProgress.toFixed(4)),
                yearProgress: Number(roomClock.yearProgress.toFixed(4)),
                dayDurationHoursReal: Number(roomClock.settings.dayDurationHoursReal.toFixed(4)),
                yearDurationHoursReal: Number(roomClock.settings.yearDurationHoursReal.toFixed(4)),
                astronomyNowMs: Math.round(astronomyNowMs),
                astronomyTimeScale: Number(astronomyTimeScale.toFixed(4)),
                astronomyTimeSource: 'roomTime.sourceEpochMs'
            },
            season: roomClock.season,
            weather: roomClock.weather,
            astro: {
                body: isSpaceBodyActive() ? currentSpaceBodyId : 'earth',
                sunAltitude: Number(altitude.toFixed(4)),
                moonPhase: {
                    name: getMoonPhaseName(moonPhaseAmount),
                    amount: Number(moonPhaseAmount.toFixed(4))
                },
                eclipseState: {
                    local: {
                        solar: Number(solarStrength.toFixed(4)),
                        lunar: Number(lunarStrength.toFixed(4))
                    }
                }
            }
        });
    }
}

function normalizeInventoryItemId(itemId) {
    return String(itemId || '').trim().toLowerCase();
}

function getInventoryItemLabel(itemId) {
    const normalized = normalizeInventoryItemId(itemId);
    if (!normalized) return 'Item';
    const libItem = ITEMS_LIBRARY.find((entry) => entry.id === normalized);
    const rawLabel = String(libItem?.name || normalized.replace(/[_-]+/g, ' ').trim());
    if (!rawLabel) return 'Item';
    return rawLabel.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function getInventoryItemFallbackGlyph(itemId) {
    const label = getInventoryItemLabel(itemId);
    const letters = label.replace(/[^A-Za-z0-9]/g, '');
    if (letters.length >= 2) return letters.slice(0, 2).toUpperCase();
    if (letters.length === 1) return letters.toUpperCase();
    return '??';
}

function hexToRgb(hex) {
    const value = Number(hex || 0) >>> 0;
    return [
        (value >> 16) & 0xff,
        (value >> 8) & 0xff,
        value & 0xff
    ];
}

function mixRgb(a, b, t) {
    const tt = clamp01(t);
    return [
        Math.round(a[0] + (b[0] - a[0]) * tt),
        Math.round(a[1] + (b[1] - a[1]) * tt),
        Math.round(a[2] + (b[2] - a[2]) * tt)
    ];
}

function makeSurfaceTexture({
    base = 0x888888,
    dark = 0x666666,
    light = 0xaaaaaa,
    seed = 1,
    size = 160,
    contrast = 0.2,
    grainScale = 0.22,
    stripes = 0,
    pixelated = false
}) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const rand = (x, y) => {
        const s = Math.sin((x + 1) * 12.9898 + (y + 1) * 78.233 + seed * 43758.5453) * 43758.5453;
        return s - Math.floor(s);
    };
    const baseRgb = hexToRgb(base);
    const darkRgb = hexToRgb(dark);
    const lightRgb = hexToRgb(light);
    const image = ctx.createImageData(size, size);
    const data = image.data;

    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const macro = rand(Math.floor(x * grainScale), Math.floor(y * grainScale));
            const micro = rand(x, y);
            let tone = 0.5 + (macro - 0.5) * (0.9 + contrast) + (micro - 0.5) * (0.25 + contrast * 0.4);
            tone += ((y / (size - 1)) - 0.5) * 0.08;
            const diagonal = rand(Math.floor((x + y) * 0.14), Math.floor(Math.abs(x - y) * 0.11));
            tone += (diagonal - 0.5) * 0.08;
            if (stripes > 0) {
                const stripeWave = Math.sin((x / size) * Math.PI * 10 + (y / size) * Math.PI * 1.2 + seed);
                tone += stripeWave * stripes;
            }
            if (pixelated) {
                const px = Math.floor(x / 10);
                const py = Math.floor(y / 10);
                const blocky = rand(px + 7, py + 13);
                tone = THREE.MathUtils.lerp(tone, blocky, 0.42);
            }
            tone = clamp01(tone);
            const shaded = mixRgb(darkRgb, lightRgb, tone);
            const rgb = mixRgb(baseRgb, shaded, 0.7);
            const idx = (y * size + x) * 4;
            data[idx] = rgb[0];
            data[idx + 1] = rgb[1];
            data[idx + 2] = rgb[2];
            data[idx + 3] = 255;
        }
    }
    ctx.putImageData(image, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = Math.min(4, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
    tex.needsUpdate = true;
    return tex;
}
// ---- Fluid (Lava / Water) Animated Texture System ----
// Stores canvas + ctx references so we can redraw per-frame without UV scrolling
const FLUID_CANVAS = {};

function _fluidNoise(x, y) {
    // Smooth noise via sin/cos combinations — avoids tile seams
    const a = Math.sin(x * 1.38 + y * 0.72) * 0.5 + 0.5;
    const b = Math.sin(x * 0.85 - y * 1.21 + 3.14) * 0.5 + 0.5;
    const c = Math.sin((x + y) * 1.05 + 1.57) * 0.5 + 0.5;
    return (a * 0.5 + b * 0.3 + c * 0.2);
}

function _fbmNoise(x, y, octaves = 4) {
    let val = 0, amp = 0.5, freq = 1, total = 0;
    for (let i = 0; i < octaves; i++) {
        val += _fluidNoise(x * freq, y * freq) * amp;
        total += amp;
        amp *= 0.5;
        freq *= 2.1;
    }
    return val / total;
}

function _drawFluidCanvas(ctx, canvas, type, timeOffset = 0) {
    const size = canvas.width;
    const isLava = type === 'lava';
    const image = ctx.createImageData(size, size);
    const data = image.data;
    const PIXEL_BLOCK = 4; // Minecraft-style: group pixels into 4x4 blocks

    for (let py = 0; py < size; py += PIXEL_BLOCK) {
        for (let px = 0; px < size; px += PIXEL_BLOCK) {
            // Sample noise at block center, shifted by time for animation
            const nx = (px / size) * 4 + timeOffset * 0.4;
            const ny = (py / size) * 4 + timeOffset * 0.25;
            const n = _fbmNoise(nx, ny);

            let r, g, b;
            if (isLava) {
                // Lava palette: hot yellow blobs in orange base with dark red edges
                if (n > 0.78) { r = 255; g = 230; b = 0; }          // Hot yellow core
                else if (n > 0.65) { r = 255; g = 160; b = 0; }     // Bright orange
                else if (n > 0.50) { r = 255; g = 90; b = 0; }      // Orange-red
                else if (n > 0.35) { r = 200; g = 30; b = 0; }      // Deep red
                else if (n > 0.22) { r = 140; g = 10; b = 0; }      // Dark red
                else { r = 80; g = 0; b = 0; }                       // Almost black
            } else {
                // Water palette: blues
                if (n > 0.75) { r = 120; g = 200; b = 255; }        // Foam/highlight
                else if (n > 0.55) { r = 60; g = 130; b = 230; }    // Mid blue
                else { r = 25; g = 70; b = 200; }                    // Deep blue
            }

            // Fill the pixel block
            for (let by = 0; by < PIXEL_BLOCK && (py + by) < size; by++) {
                for (let bx = 0; bx < PIXEL_BLOCK && (px + bx) < size; bx++) {
                    const idx = ((py + by) * size + (px + bx)) * 4;
                    data[idx] = r;
                    data[idx + 1] = g;
                    data[idx + 2] = b;
                    data[idx + 3] = 255;
                }
            }
        }
    }
    ctx.putImageData(image, 0, 0);
}

function makeFluidTexture(type = 'water', size = 64) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    _drawFluidCanvas(ctx, canvas, type, 0);

    // Store canvas/ctx for per-frame animation
    FLUID_CANVAS[type] = { canvas, ctx, type, time: 0 };

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    FLUID_CANVAS[type].texture = tex;
    return tex;
}

function updateFluidTextures(deltaSec = 0.016) {
    for (const key of Object.keys(FLUID_CANVAS)) {
        const fc = FLUID_CANVAS[key];
        if (!fc) continue;
        const speed = key === 'lava' ? 0.12 : 0.22;
        fc.time += deltaSec * speed;
        _drawFluidCanvas(fc.ctx, fc.canvas, fc.type, fc.time);
        if (fc.texture) fc.texture.needsUpdate = true;
    }
}

function initVoxelTextures() {
    TEXTURES.grass = makeSurfaceTexture({
        base: 0x5f9f58,
        dark: 0x3d6f3a,
        light: 0x87bb7f,
        seed: 11,
        contrast: 0.18,
        grainScale: 0.18
    });
    TEXTURES.dirt = makeSurfaceTexture({
        base: 0x8d6a4c,
        dark: 0x6b4b31,
        light: 0xb08663,
        seed: 19,
        contrast: 0.22,
        grainScale: 0.2
    });
    TEXTURES.stone = makeSurfaceTexture({
        base: 0xa1a7ad,
        dark: 0x7e848b,
        light: 0xc5c9ce,
        seed: 29,
        contrast: 0.16,
        grainScale: 0.24
    });
    TEXTURES.wood = makeSurfaceTexture({
        base: 0x9b6e45,
        dark: 0x734c2d,
        light: 0xc89564,
        seed: 41,
        contrast: 0.2,
        grainScale: 0.16,
        stripes: 0.12
    });
    TEXTURES.leaf = makeSurfaceTexture({
        base: 0x6aa660,
        dark: 0x4d8146,
        light: 0x88c37b,
        seed: 53,
        contrast: 0.2,
        grainScale: 0.17,
        pixelated: true
    });
    TEXTURES.tile = makeSurfaceTexture({
        base: 0xf0f2f5,
        dark: 0xd2d7df,
        light: 0xffffff,
        seed: 67,
        contrast: 0.08,
        grainScale: 0.14,
        stripes: 0.015
    });
    TEXTURES.wall = makeSurfaceTexture({
        base: 0xf7f7f6,
        dark: 0xe8e8e6,
        light: 0xffffff,
        seed: 79,
        contrast: 0.045,
        grainScale: 0.12,
        stripes: 0.01
    });
    TEXTURES.water = makeFluidTexture('water', 64);
    TEXTURES.lava = makeFluidTexture('lava', 64);
}

function applyBuildBlockTexture(target, itemId) {
    if (!target?.material) return;
    const material = target.material;
    material.side = getBlockMaterialConfig(itemId).side;
    if (itemId === 'grass_block') {
        material.map = TEXTURES.grass;
    } else if (itemId === 'dirt_block') {
        material.map = TEXTURES.dirt;
    } else if (itemId === 'stone_cobble' || itemId === 'diamond_block' || itemId === 'gold_block' || itemId === 'emerald_block') {
        material.map = TEXTURES.stone;
    } else if (itemId === 'tile_floor') {
        material.map = TEXTURES.tile;
    } else if (itemId === 'classroom_wall') {
        material.map = TEXTURES.wall;
    } else if (itemId === 'water_block') {
        material.map = TEXTURES.water;
        material.color.setHex(TEXTURES.water ? 0xffffff : 0x68b7ff);
    } else if (itemId === 'snow_block') {
        material.map = null;
        material.color.setHex(0xf7fbff);
    } else if (itemId === 'wood_plank' || itemId === 'chair_wood' || itemId === 'table_wood' || itemId === 'desk_student' || itemId === 'desk_teacher' || itemId === 'door_wood' || itemId === 'bookshelf') {
        material.map = TEXTURES.wood;
    } else if (itemId === 'leaf_block') {
        material.map = TEXTURES.leaf || null;
    }
    material.needsUpdate = true;
}

function updateSharedVoxelMaterialMood({
    dayFactor = 1,
    twilightFactor = 0,
    inSpaceBody = false,
    now = 0,
    season = 'summer',
    seasonProgress = 0,
    weather = 'clear',
    yearProgress = 0
} = {}) {
    const scenePreset = getActiveScenePresetConfig();
    const heroLightBoost = scenePreset.heroLightingProfile === 'cinematic_voxel' ? 1.24 : 1;
    const sunsetStrength = inSpaceBody ? 0 : clamp01(twilightFactor * (1 - dayFactor * 0.35)) * heroLightBoost;
    const sunsetColor = new THREE.Color(0xff8a3d);

    // Seasonal parameters for all materials
    const seasonKey = String(season || 'summer').toLowerCase();
    const isSpring = seasonKey === 'spring';
    const isAutumn = seasonKey === 'autumn';
    const isSummer = seasonKey === 'summer';
    const isWinter = seasonKey === 'winter';
    const weatherDampen = weather === 'storm' || weather === 'blizzard' ? 0.82 : 1;

    const greenPalette = [new THREE.Color(0x518d41), new THREE.Color(0x6bbd58)];
    const springPinkPalette = [new THREE.Color(0xf472b6), new THREE.Color(0xffc3dd)];
    const autumnPalette = [new THREE.Color(0xb9412e), new THREE.Color(0xdf6a3a)];
    const winterPalette = [new THREE.Color(0x6b5643), new THREE.Color(0x8d7761)];

    const springBloomFactor = isSpring
        ? clamp01(THREE.MathUtils.smoothstep(seasonProgress, 0.12, 0.42) - (THREE.MathUtils.smoothstep(seasonProgress, 0.78, 1.0) * 0.22))
        : 0;
    const autumnDryFactor = isAutumn ? clamp01(THREE.MathUtils.smoothstep(seasonProgress, 0.08, 0.38)) : 0;
    const autumnDropFactor = isAutumn ? clamp01(THREE.MathUtils.smoothstep(seasonProgress, 0.42, 0.88)) : 0;
    const autumnRegrowFactor = isAutumn ? clamp01(THREE.MathUtils.smoothstep(seasonProgress, 0.88, 1.0)) : 0;

    let leafPalette = greenPalette;
    if (isSpring) {
        leafPalette = greenPalette.map((gc, i) => gc.clone().lerp(springPinkPalette[i % springPinkPalette.length], springBloomFactor));
    } else if (isSummer) {
        leafPalette = greenPalette;
    } else if (isAutumn) {
        leafPalette = autumnPalette.map((ac, i) => ac.clone().lerp(greenPalette[i % greenPalette.length], autumnRegrowFactor));
    } else {
        leafPalette = winterPalette;
    }

    let leafOpacity = 1.0;
    let treeLeafScale = 1.0;
    if (isAutumn) {
        leafOpacity = THREE.MathUtils.lerp(1.0 - (autumnDryFactor * 0.08), 0.04, autumnDropFactor);
        leafOpacity = THREE.MathUtils.lerp(leafOpacity, 0.92, autumnRegrowFactor);
        treeLeafScale = THREE.MathUtils.lerp(1.0, 0.16, autumnDropFactor);
        treeLeafScale = THREE.MathUtils.lerp(treeLeafScale, 0.92, autumnRegrowFactor);
    } else if (isWinter) {
        leafOpacity = 0.68;
        treeLeafScale = 0.72;
    } else if (isSpring) {
        treeLeafScale = THREE.MathUtils.lerp(0.88, 1.08, springBloomFactor);
    }
    const globalSeasonPulse = 0.5 + (Math.sin((now * 0.000024) + (yearProgress * Math.PI * 2)) * 0.5);

    voxelMaterialCache.forEach((material) => {
        if (!material?.userData?.sharedVoxelMaterial) return;
        const itemId = String(material.userData.itemId || '');
        if (
            material.isMeshStandardMaterial
            && itemId !== 'water_block'
            && itemId !== 'water_still'
            && itemId !== 'lava_block'
            && itemId !== 'lava_still'
            && itemId !== 'glass_block'
        ) {
            material.metalness = 0;
            material.roughness = Math.max(0.9, Number(material.roughness || 0.9));
        }
        if (!material.emissive) {
            material.emissive = new THREE.Color(0x000000);
        }
        if (itemId === 'glass_block' || itemId === 'water_block') {
            const baseIntensity = itemId === 'water_block'
                ? sunsetStrength * 0.08
                : sunsetStrength * 0.05;
            material.emissive.copy(sunsetColor).multiplyScalar(baseIntensity);
        } else {
            material.emissive.setRGB(0, 0, 0);
        }
        if (itemId === 'leaf_block') {
            const paletteColor = leafPalette[0].clone().lerp(
                leafPalette[1] || leafPalette[0],
                0.34 + (globalSeasonPulse * 0.28)
            );
            material.color.copy(paletteColor);
            const seasonalOpacityBoost = isAutumn ? 0.9 : (isWinter ? 0.86 : 1);
            material.opacity = clamp01(leafOpacity * seasonalOpacityBoost * (0.9 + (weatherDampen * 0.1)));
            material.transparent = material.opacity < 0.95;
            if (material.emissive) {
                material.emissive.copy(paletteColor.clone().multiplyScalar(0.18));
                material.emissiveIntensity = isWinter ? 0.01 : 0.02 + (isSpring ? 0.015 : 0);
            }
        }
        if (itemId === 'water_block') {
            material.roughness = THREE.MathUtils.lerp(0.08, 0.16, twilightFactor * 0.32);
            material.color.setHex(TEXTURES.water ? 0xffffff : 0x68b7ff);
            if (material.map) {
                material.map.offset.x = (now * 0.000026) % 1;
                material.map.offset.y = (0.08 + (Math.sin(now * 0.0001) * 0.03) + (now * 0.000018)) % 1;
                material.map.rotation = Math.sin(now * 0.00005) * 0.016;
            }
        }
    });
    FLOWER_DECORATION_CACHE.forEach((materials) => {
        ['stem', 'leaf', 'petal', 'center'].forEach((key) => {
            const material = materials?.[key];
            if (!material) return;
            if (!material.emissive) {
                material.emissive = new THREE.Color(0x000000);
            }
            material.emissive.copy(sunsetColor).multiplyScalar(sunsetStrength * (key === 'petal' ? 0.02 : 0.008));
        });
    });
    if (Array.isArray(outdoorSeasonalTrees) && outdoorSeasonalTrees.length) {
        const blossomEnvelope = isSpring
            ? clamp01(THREE.MathUtils.smoothstep(seasonProgress, 0.18, 0.36) - (THREE.MathUtils.smoothstep(seasonProgress, 0.78, 1.0) * 0.45))
            : 0;
        const autumnPetalEnvelope = isAutumn
            ? clamp01(THREE.MathUtils.smoothstep(seasonProgress, 0.12, 0.32) - (THREE.MathUtils.smoothstep(seasonProgress, 0.92, 1.0) * 0.85))
            : 0;

        outdoorSeasonalTrees.forEach((entry) => {
            const leaves = Array.isArray(entry?.leaves) ? entry.leaves : [];
            const blossoms = Array.isArray(entry?.blossoms) ? entry.blossoms : [];
            const phase = Number(entry?.phase || 0);
            const leafMeshes = Array.isArray(entry?.leafMeshes) ? entry.leafMeshes : [];
            const seasonalPulse = 0.88 + (Math.sin((now * 0.000028) + phase + (yearProgress * Math.PI * 2)) * 0.12);

            leaves.forEach((leafMat, index) => {
                if (!leafMat?.color) return;
                const paletteColor = leafPalette[index % leafPalette.length].clone();
                leafMat.color.copy(paletteColor);
                leafMat.opacity = leafOpacity * (0.85 + (weatherDampen * 0.15));
                leafMat.transparent = leafMat.opacity < 0.99;

                const bushinessFactor = (isSpring || isSummer) ? 1.16 : 1.0;

                if (leafMat.emissive) {
                    leafMat.emissive.copy(paletteColor.clone().multiplyScalar(0.18));
                    if (typeof leafMat.emissiveIntensity === 'number') {
                        leafMat.emissiveIntensity = isWinter
                            ? 0.004
                            : (0.012 + ((isSpring ? 0.018 : 0.008) * seasonalPulse)) * bushinessFactor;
                    }
                }
            });
            leafMeshes.forEach((mesh) => {
                if (!mesh?.isInstancedMesh) return;
                mesh.visible = leafOpacity > 0.035;
                mesh.scale.setScalar(treeLeafScale);
            });
            blossoms.forEach((blossomMat) => {
                if (!blossomMat) return;
                const blossomWave = clamp01((blossomEnvelope + autumnPetalEnvelope) * (0.78 + (Math.sin((now * 0.00005) + (phase * 1.4)) * 0.22)));
                blossomMat.opacity = blossomWave * 0.82;
                blossomMat.transparent = blossomMat.opacity < 0.99;
                blossomMat.color.set(isAutumn ? 0xd94e33 : 0xffd0e3);
                if (typeof blossomMat.emissiveIntensity === 'number') {
                    blossomMat.emissiveIntensity = blossomWave * 0.004;
                }
            });
        });
    }
}

function adjustWhiteboardPlacementData(data = {}) {
    if (!data || data.itemId !== 'whiteboard') return data;
    return normalizePlacedItemPlacementData(data);
}

function shouldAlignItemToWall(itemId = '') {
    const profile = ITEM_PLACEMENT_RULES[String(itemId || '')];
    return !!profile?.wallAligned;
}

function shouldSnapItemAgainstWall(itemId = '') {
    const profile = ITEM_PLACEMENT_RULES[String(itemId || '')];
    return !!profile?.wallSnap;
}

function getPlacementSurfaceOrientation(itemId = '', hitNormal = null, fallbackYaw = 0) {
    const profile = ITEM_PLACEMENT_RULES[String(itemId || '')] || null;
    if (!profile?.wallAligned || !hitNormal) {
        return quantizeQuarterTurn(fallbackYaw);
    }
    const horizontalX = Number(hitNormal.x || 0);
    const horizontalZ = Number(hitNormal.z || 0);
    const horizontalLengthSq = (horizontalX * horizontalX) + (horizontalZ * horizontalZ);
    if (horizontalLengthSq < 0.2) {
        return quantizeQuarterTurn(fallbackYaw);
    }
    return quantizeQuarterTurn(Math.atan2(horizontalX, horizontalZ));
}

function snapPlacedItemAgainstRoomWall(data = {}, profile = null) {
    const adjusted = { ...data };
    const itemId = String(adjusted.itemId || '');
    const rules = profile || ITEM_PLACEMENT_RULES[itemId] || null;
    if (!rules?.wallSnap) return adjusted;
    const halfWidth = ROOM_WIDTH / 2;
    const halfDepth = ROOM_DEPTH / 2;
    const inset = Number(rules.wallInset || 0);
    const wallSnapThreshold = Number(rules.wallSnapThreshold || 2.4);
    const x = Number(adjusted.x || 0);
    const z = Number(adjusted.z || 0);
    const candidates = [
        { distance: Math.abs(z - halfDepth), axis: 'z', value: halfDepth - inset, ry: Math.PI },
        { distance: Math.abs(z + halfDepth), axis: 'z', value: -halfDepth + inset, ry: 0 },
        { distance: Math.abs(x - halfWidth), axis: 'x', value: halfWidth - inset, ry: -Math.PI / 2 },
        { distance: Math.abs(x + halfWidth), axis: 'x', value: -halfWidth + inset, ry: Math.PI / 2 }
    ];
    candidates.sort((a, b) => a.distance - b.distance);
    const nearest = candidates[0];
    if (nearest && nearest.distance <= wallSnapThreshold) {
        adjusted.ry = nearest.ry;
        if (nearest.axis === 'x') adjusted.x = nearest.value;
        if (nearest.axis === 'z') adjusted.z = nearest.value;
    }
    return adjusted;
}

function normalizePlacedItemPlacementData(data = {}) {
    if (!data) return data;
    const adjusted = normalizeLegacyRoomItemY(data);
    const itemId = String(adjusted.itemId || '');
    const profile = ITEM_PLACEMENT_RULES[itemId] || null;
    if (typeof adjusted.ry === 'number') {
        adjusted.ry = quantizeQuarterTurn(adjusted.ry);
    }
    if (!profile) return adjusted;
    if (profile.wallSnap) {
        return snapPlacedItemAgainstRoomWall(adjusted, profile);
    }
    return adjusted;
}

function resetMovementState() {
    if (movementController?.resetMovementState) {
        movementController.resetMovementState();
        return;
    }
    moveForward = false;
    moveBackward = false;
    moveLeft = false;
    moveRight = false;
    inputState.forward = 0;
    inputState.backward = 0;
    inputState.left = 0;
    inputState.right = 0;
    inputState.sprint = false;
    inputState.jump = false;
    lookInputState.deltaX = 0;
    lookInputState.deltaY = 0;
    lookTargetYaw = playerYaw;
    lookTargetPitch = playerPitch;
    if (velocity) velocity.set(0, 0, 0);
    canJump = false;
}

function getCrosshairIntersections() {
    if (!raycaster) raycaster = new THREE.Raycaster();
    configureCrosshairRaycaster(raycaster);
    return raycaster
        .intersectObjects(getRaycastTargets(), true)
        .filter((hit) => hit?.object
            && hit.object.visible !== false
            && !hit.object.userData?.isStaticCollider
            && !isLocalAvatarObject(hit.object)
            && !isRaycastIgnoredObject(hit.object));
}

function ensureCrosshairHighlightMesh() {
    if (crosshairHighlightMesh || !scene || !THREE) return;
    if (!crosshairHighlightCenter) crosshairHighlightCenter = new THREE.Vector3();
    if (!crosshairHighlightSize) crosshairHighlightSize = new THREE.Vector3();
    if (!crosshairHighlightNormal) crosshairHighlightNormal = new THREE.Vector3();
    if (!crosshairHighlightSample) crosshairHighlightSample = new THREE.Vector3();
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    const material = new THREE.LineBasicMaterial({
        color: 0x7dd3fc,
        transparent: true,
        opacity: 0.95,
        depthTest: true,
        depthWrite: false
    });
    crosshairHighlightMesh = new THREE.LineSegments(edges, material);
    crosshairHighlightMesh.visible = false;
    crosshairHighlightMesh.renderOrder = 1200;
    markRaycastIgnored(crosshairHighlightMesh);
    scene.add(crosshairHighlightMesh);
}

function getHighlightTransformFromHit(hit, target = null) {
    if (!hit?.object) return null;
    const source = target || hit.object;
    if (hit.object.isInstancedMesh && Number.isInteger(hit.instanceId) && hit.instanceId >= 0) {
        const geometry = hit.object.geometry;
        if (!geometry?.boundingBox) {
            geometry?.computeBoundingBox?.();
        }
        if (geometry?.boundingBox) {
            const instanceMatrix = new THREE.Matrix4();
            const worldMatrix = new THREE.Matrix4();
            const center = new THREE.Vector3();
            const size = new THREE.Vector3();
            const position = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            hit.object.getMatrixAt(hit.instanceId, instanceMatrix);
            worldMatrix.multiplyMatrices(hit.object.matrixWorld, instanceMatrix);
            geometry.boundingBox.getCenter(center).applyMatrix4(worldMatrix);
            geometry.boundingBox.getSize(size);
            worldMatrix.decompose(position, quaternion, scale);
            size.set(
                Math.abs(size.x * scale.x),
                Math.abs(size.y * scale.y),
                Math.abs(size.z * scale.z)
            );
            return { center, size, quaternion };
        }
    }
    if (source.userData?.collisionBox) {
        const box = source.userData.collisionBox.clone();
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);
        return {
            center,
            size,
            quaternion: new THREE.Quaternion()
        };
    }
    if (source.isMesh && source.geometry) {
        const geometry = source.geometry;
        if (!geometry.boundingBox) {
            geometry.computeBoundingBox?.();
        }
        if (geometry.boundingBox) {
            const center = geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(source.matrixWorld);
            const size = geometry.boundingBox.getSize(new THREE.Vector3());
            const position = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            source.matrixWorld.decompose(position, quaternion, scale);
            size.set(
                Math.abs(size.x * scale.x),
                Math.abs(size.y * scale.y),
                Math.abs(size.z * scale.z)
            );
            return { center, size, quaternion };
        }
    }
    const fallbackBox = new THREE.Box3().setFromObject(source);
    if (fallbackBox.isEmpty()) return null;
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    fallbackBox.getCenter(center);
    fallbackBox.getSize(size);
    return {
        center,
        size,
        quaternion: source.getWorldQuaternion?.(new THREE.Quaternion()) || new THREE.Quaternion()
    };
}

function updateCrosshairBlockHighlight(nowMs = performance.now()) {
    if (!scene || !camera || !renderer || !THREE) return;
    if ((nowMs - crosshairHighlightLastUpdateAt) < CROSSHAIR_HIGHLIGHT_INTERVAL_MS) return;
    crosshairHighlightLastUpdateAt = nowMs;
    ensureCrosshairHighlightMesh();
    if (!crosshairHighlightMesh) return;
    const hud = document.getElementById('minebloxHUD');
    if (!hud || hud.style.display === 'none') {
        crosshairHighlightMesh.visible = false;
        return;
    }

    const intersects = getCrosshairIntersections();
    let hasTarget = false;

    for (const hit of intersects) {
        if (!hit?.object) continue;
        const terrainObj = findAncestorWithUserFlag(hit.object, 'isTerrain');
        if (terrainObj && hit.face?.normal) {
            crosshairHighlightNormal.copy(getHitWorldVoxelNormal(hit));
            // Sample inside the impacted voxel with exact grid dimensions.
            const voxelInset = (VOXEL_SIZE * 0.5) - 0.0005;
            crosshairHighlightSample.copy(hit.point).addScaledVector(crosshairHighlightNormal, -voxelInset);
            // Snap to voxel grid — blocks are ALWAYS axis-aligned, never rotated
            crosshairHighlightMesh.position.set(
                snapToVoxel(crosshairHighlightSample.x),
                snapToVoxel(crosshairHighlightSample.y),
                snapToVoxel(crosshairHighlightSample.z)
            );
            // Keep the box axis-aligned (identity quaternion) so corners align with block vertices
            crosshairHighlightMesh.quaternion.identity();
            crosshairHighlightMesh.scale.setScalar(1);
            hasTarget = true;
            break;
        }

        let target = hit.object;
        while (target && !target.userData?.docId && !target.userData?.isBlock) {
            target = target.parent;
        }
        if (!target) continue;
        const highlightTarget = target.userData?.highlightProxy || target;
        const transform = getHighlightTransformFromHit(hit, highlightTarget);
        const fallbackBox = !transform ? (getPlacedItemCollisionBox(highlightTarget) || new THREE.Box3().setFromObject(highlightTarget)) : null;
        if (!transform && (!fallbackBox || fallbackBox.isEmpty())) continue;
        if (transform) {
            crosshairHighlightCenter.copy(transform.center);
            crosshairHighlightSize.copy(transform.size);
            crosshairHighlightMesh.quaternion.copy(transform.quaternion || new THREE.Quaternion());
        } else {
            fallbackBox.getCenter(crosshairHighlightCenter);
            fallbackBox.getSize(crosshairHighlightSize);
            crosshairHighlightMesh.quaternion.identity();
        }
        crosshairHighlightMesh.position.copy(crosshairHighlightCenter);
        crosshairHighlightMesh.scale.set(
            Math.max(0.06, crosshairHighlightSize.x + 0.03),
            Math.max(0.06, crosshairHighlightSize.y + 0.03),
            Math.max(0.06, crosshairHighlightSize.z + 0.03)
        );
        hasTarget = true;
        break;
    }

    crosshairHighlightMesh.visible = hasTarget;
}

function findAncestorWithUserFlag(object, flagName) {
    let current = object;
    while (current) {
        if (current.userData && current.userData[flagName]) return current;
        current = current.parent;
    }
    return null;
}

function findDoorFromHit(object) {
    return findAncestorWithUserFlag(object, 'isDoor');
}

function findDoorAtCrosshair() {
    const intersects = getCrosshairIntersections();
    for (const hit of intersects) {
        const door = findDoorFromHit(hit.object);
        if (door) return door;
    }
    return null;
}

function getDoorOpenAngle(doorGroup) {
    const hingeSide = doorGroup?.userData?.doorHingeSide || 'left';
    return hingeSide === 'right' ? -DOOR_OPEN_ANGLE : DOOR_OPEN_ANGLE;
}

function setDoorOpenState(doorGroup, open) {
    if (!doorGroup?.userData?.isDoor) return false;
    doorGroup.userData.doorOpen = !!open;
    doorGroup.userData.doorTargetAngle = open ? getDoorOpenAngle(doorGroup) : 0;
    return true;
}

function toggleDoorState(doorGroup) {
    if (!doorGroup?.userData?.isDoor) return false;
    setDoorOpenState(doorGroup, !doorGroup.userData.doorOpen);
    if (doorGroup.userData.isRoomDoor && currentRoomId) {
        updateDoc(doc(db, "mineblox_rooms", currentRoomId), {
            doorOpen: doorGroup.userData.doorOpen
        }).catch(() => { });
    }
    return true;
}

function updateDoorState(doorGroup, delta) {
    if (!doorGroup?.userData?.isDoor) return;
    const pivot = doorGroup.userData.doorPivot || doorGroup;
    const target = typeof doorGroup.userData.doorTargetAngle === 'number'
        ? doorGroup.userData.doorTargetAngle
        : 0;
    const current = typeof doorGroup.userData.doorCurrentAngle === 'number'
        ? doorGroup.userData.doorCurrentAngle
        : 0;
    const next = THREE.MathUtils.damp(current, target, 10, delta);
    doorGroup.userData.doorCurrentAngle = next;
    doorGroup.userData.doorOpenProgress = Math.min(1, Math.abs(next) / DOOR_OPEN_ANGLE);
    pivot.rotation.y = next;
}

function handleCrosshairActivation({ allowPlacement = true, allowDoorToggle = true } = {}) {
    if (!renderer || !camera) return false;
    const intersects = getCrosshairIntersections();
    if (!intersects.length) return false;

    for (const hit of intersects) {
        const doorHit = findDoorFromHit(hit.object);
        if (allowDoorToggle && doorHit) {
            toggleDoorState(doorHit);
            return true;
        }
        const rocketHit = findAncestorWithUserFlag(hit.object, 'isRocketShuttle');
        if (rocketHit) {
            openRocketTravelMenu();
            return true;
        }
    }

    let interactHit = false;
    for (const hit of intersects) {
        let p = hit.object;
        while (p && !p.userData?.docId) p = p.parent;
        if (p && p.userData?.youtubeId) {
            const surface = intersects.find(i => i.object.geometry?.parameters?.width > 2);
            if (surface) {
                playYoutubeOnWhiteboard(p.userData.youtubeId, p);
                interactHit = true;
            }
            break;
        }
    }
    if (interactHit) return true;

    if (allowPlacement) {
        tryPlaceItem();
        return true;
    }

    return false;
}

function isRocketUiBlockingInput() {
    const travelModal = document.getElementById('rocketTravelModal');
    const launchOverlay = document.getElementById('rocketLaunchOverlay');
    return (travelModal && travelModal.style.display !== 'none')
        || (launchOverlay && launchOverlay.style.display !== 'none');
}

function tryRestorePointerLock() {
    if (!renderer?.domElement?.requestPointerLock) return false;
    if (isRocketUiBlockingInput()) return false;
    const hud = document.getElementById('minebloxHUD');
    if (!hud || hud.style.display === 'none') return false;
    if (document.pointerLockElement === renderer.domElement) return true;
    try {
        const maybePromise = renderer.domElement.requestPointerLock();
        if (maybePromise && typeof maybePromise.catch === 'function') {
            maybePromise.catch(() => { });
        }
        return true;
    } catch (_) {
        return false;
    }
}

function isGameCanvasMouseEvent(event) {
    if (!renderer?.domElement) return false;
    return event?.target === renderer.domElement;
}

function getRocketDestinationOptions() {
    if (USE_VOXELJS_ENGINE && voxelJsRuntime?.getTravelBodyOptions) {
        const options = voxelJsRuntime.getTravelBodyOptions();
        if (Array.isArray(options) && options.length) {
            return options;
        }
    }
    const options = [{ id: 'earth', name: 'Tierra (Planeta Salón)' }];
    Object.values(SOLAR_TRAVEL_BODIES).forEach((body) => {
        options.push({ id: body.id, name: body.name });
    });
    return options.filter((opt, index, array) => array.findIndex((x) => x.id === opt.id) === index);
}

function closeRocketTravelMenu() {
    const modal = document.getElementById('rocketTravelModal');
    if (modal) modal.style.display = 'none';
    const overlay = document.getElementById('rocketLaunchOverlay');
    if (overlay) {
        overlay.classList.remove('is-warp');
        overlay.style.display = 'none';
    }
}

function openRocketTravelMenu() {
    const modal = document.getElementById('rocketTravelModal');
    const select = document.getElementById('rocketDestinationSelect');
    if (!modal || !select) return;
    if (document.pointerLockElement && document.exitPointerLock) {
        try { document.exitPointerLock(); } catch (_) { }
    }
    const options = getRocketDestinationOptions();
    const defaultId = USE_VOXELJS_ENGINE
        ? String(voxelJsRuntime?.state?.activeBodyId || 'earth')
        : (isSpaceBodyActive() ? currentSpaceBodyId : 'moon');
    select.innerHTML = options.map((opt) => `<option value="${opt.id}">${opt.name}</option>`).join('');
    select.value = options.some((opt) => opt.id === defaultId) ? defaultId : 'earth';
    modal.style.display = 'flex';
}

async function startRocketLaunchSequence() {
    const modal = document.getElementById('rocketTravelModal');
    const select = document.getElementById('rocketDestinationSelect');
    const overlay = document.getElementById('rocketLaunchOverlay');
    const status = document.getElementById('rocketLaunchStatus');
    const subStatus = document.getElementById('rocketLaunchSubstatus');
    if (!select || !overlay || !status || !subStatus) return;

    rocketTravelTargetId = String(select.value || 'earth').trim().toLowerCase() || 'earth';
    if (modal) modal.style.display = 'none';
    overlay.style.display = 'flex';
    status.textContent = '3';
    subStatus.textContent = 'Secuencia de lanzamiento';

    if (rocketTravelCountdownTimer) clearInterval(rocketTravelCountdownTimer);
    if (rocketTravelWarpTimer) clearTimeout(rocketTravelWarpTimer);

    let countdown = 3;
    rocketTravelCountdownTimer = setInterval(() => {
        countdown -= 1;
        if (countdown > 0) {
            status.textContent = String(countdown);
            return;
        }
        clearInterval(rocketTravelCountdownTimer);
        rocketTravelCountdownTimer = null;
        status.textContent = '¡DESPEGUE!';
        subStatus.textContent = 'Acelerando...';
        overlay.classList.add('is-warp');
        rocketTravelWarpTimer = setTimeout(async () => {
            status.textContent = 'HIPERESPACIO';
            subStatus.textContent = 'Velocidad de la luz';
            if (USE_VOXELJS_ENGINE && voxelJsRuntime?.travelToBody) {
                voxelJsRuntime.travelToBody(rocketTravelTargetId);
                const target = getRocketDestinationOptions().find((opt) => opt.id === rocketTravelTargetId);
                showTooltip(`Despegue completado: destino ${target?.name || rocketTravelTargetId}`);
            } else {
                await travelByRocket(rocketTravelTargetId);
            }
            overlay.classList.remove('is-warp');
            overlay.style.display = 'none';
            rocketTravelWarpTimer = null;
        }, ROCKET_LAUNCH_WARP_MS);
    }, ROCKET_LAUNCH_COUNTDOWN_MS / 3);
}

function getMeshFromCrosshair() {
    const intersects = getCrosshairIntersections();
    for (const hit of intersects) {
        let current = hit.object;
        while (current && !current.userData?.docId) {
            current = current.parent;
        }
        if (current?.userData?.docId) return current;
    }
    return null;
}

function exitSeatedState() {
    seatedState.active = false;
    seatedState.targetId = null;
    seatedState.position = null;
    canJump = true;
}

function enterSeatedState(mesh) {
    if (!mesh?.userData?.isSeatable) return false;
    const seatPosition = mesh.userData.seatPosition?.clone?.() || new THREE.Vector3(mesh.position.x, mesh.position.y + 0.9, mesh.position.z);
    seatedState.active = true;
    seatedState.targetId = mesh.userData.docId;
    seatedState.position = seatPosition;
    ensurePlayerWorldPosition().copy(seatPosition);
    velocity.set(0, 0, 0);
    canJump = false;
    camera.position.copy(seatPosition);
    return true;
}

function toggleSeatedStateFromCrosshair() {
    if (seatedState.active) {
        exitSeatedState();
        return true;
    }
    const mesh = getMeshFromCrosshair();
    if (mesh?.userData?.isSeatable) {
        return enterSeatedState(mesh);
    }
    return false;
}

function getPlacedItemCollisionBox(mesh) {
    if (!mesh) return null;
    if (!mesh.userData.collisionBox) {
        refreshCollisionMeshBounds(mesh);
    }
    return mesh.userData.collisionBox;
}

function refreshCollisionMeshBounds(mesh) {
    if (!mesh) return null;
    mesh.updateMatrixWorld(true);
    const collisionBox = new THREE.Box3().setFromObject(mesh);
    mesh.userData.collisionBox = collisionBox.clone();
    mesh.userData.collisionTop = collisionBox.max.y;
    mesh.userData.collisionBottom = collisionBox.min.y;
    markCollisionBroadphaseDirty();
    if (mesh.userData?.docId) {
        collisionBroadphase?.upsert?.(mesh.userData.docId, mesh, { getCollisionBox: getPlacedItemCollisionBox });
    }
    return mesh.userData.collisionBox;
}

function refreshStaticColliderBoundsForParent(parentGroup) {
    if (!parentGroup) return;
    parentGroup.updateMatrixWorld(true);
    const isDescendantOf = (node, ancestor) => {
        let current = node;
        while (current) {
            if (current === ancestor) return true;
            current = current.parent || null;
        }
        return false;
    };
    staticCollisionItems.forEach((mesh) => {
        if (!mesh || !isDescendantOf(mesh, parentGroup)) return;
        refreshCollisionMeshBounds(mesh);
    });
}

function spawnDestructionEffect(sourceObject) {
    if (!sourceObject || !scene || !THREE) return;
    if (destructionEffects.length >= 10) {
        const oldest = destructionEffects.shift();
        if (oldest?.group) {
            scene.remove(oldest.group);
        }
    }
    if (!destructionShardGeometry) {
        destructionShardGeometry = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    }
    if (!destructionSmokeGeometry) {
        destructionSmokeGeometry = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    }
    if (!destructionShardMaterials) {
        destructionShardMaterials = [
            0xf59e0b, 0xfb7185, 0xffffff, 0xf97316, 0xfacc15
        ].map((color) => new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 1,
            depthWrite: false
        }));
    }
    if (!destructionSmokeMaterial) {
        destructionSmokeMaterial = new THREE.MeshBasicMaterial({
            color: 0x8b8b8b,
            transparent: true,
            opacity: 0.72,
            depthWrite: false
        });
    }

    const bounds = new THREE.Box3().setFromObject(sourceObject);
    const worldPos = bounds.isEmpty()
        ? sourceObject.position.clone?.() || new THREE.Vector3()
        : bounds.getCenter(new THREE.Vector3());

    const burst = new THREE.Group();
    burst.position.copy(worldPos);

    const shardCount = 8;
    const smokeCount = 5;

    for (let i = 0; i < shardCount; i += 1) {
        const particle = new THREE.Mesh(
            destructionShardGeometry,
            destructionShardMaterials[i % destructionShardMaterials.length].clone()
        );
        particle.userData.kind = 'shard';
        particle.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 3.2,
            1.8 + Math.random() * 2.6,
            (Math.random() - 0.5) * 3.2
        );
        particle.userData.spin = new THREE.Vector3(
            (Math.random() - 0.5) * 5.4,
            (Math.random() - 0.5) * 5.4,
            (Math.random() - 0.5) * 5.4
        );
        burst.add(particle);
    }

    for (let i = 0; i < smokeCount; i += 1) {
        const smoke = new THREE.Mesh(
            destructionSmokeGeometry,
            destructionSmokeMaterial.clone()
        );
        smoke.userData.kind = 'smoke';
        smoke.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.9,
            0.45 + Math.random() * 1.2,
            (Math.random() - 0.5) * 0.9
        );
        smoke.userData.spin = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
        );
        smoke.position.set(
            (Math.random() - 0.5) * 0.35,
            (Math.random() - 0.5) * 0.28,
            (Math.random() - 0.5) * 0.35
        );
        burst.add(smoke);
    }

    scene.add(burst);
    destructionEffects.push({
        group: burst,
        age: 0,
        life: 0.56
    });
}

function updateDestructionEffects(delta) {
    if (!destructionEffects.length) return;
    const nextEffects = [];
    destructionEffects.forEach(effect => {
        effect.age += delta;
        const t = Math.min(1, effect.age / effect.life);
        effect.group.children.forEach(child => {
            const vel = child.userData.velocity;
            if (vel) {
                child.position.addScaledVector(vel, delta);
                child.rotation.x += child.userData.spin.x * delta;
                child.rotation.y += child.userData.spin.y * delta;
                child.rotation.z += child.userData.spin.z * delta;
                if (child.userData.kind === 'smoke') {
                    child.scale.multiplyScalar(1 + delta * 1.4);
                    child.material.opacity = Math.max(0, 0.72 - t * 0.62);
                } else {
                    child.material.opacity = Math.max(0, 1 - t);
                }
            }
        });
        effect.group.scale.setScalar(1 + t * 0.18);
        if (effect.age >= effect.life) {
            scene.remove(effect.group);
            effect.group.children.forEach(child => {
                child.material?.dispose?.();
            });
        } else {
            nextEffects.push(effect);
        }
    });
    destructionEffects = nextEffects;
}

function spawnDigDustAt(position) {
    if (!scene || !position) return;
    const dust = new THREE.Group();
    dust.position.copy(position);
    const dustCount = 7;
    for (let i = 0; i < dustCount; i += 1) {
        const puff = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.08, 0.08),
            new THREE.MeshBasicMaterial({
                color: 0xa69376,
                transparent: true,
                opacity: 0.55,
                depthWrite: false
            })
        );
        puff.userData.kind = 'smoke';
        puff.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.9,
            0.35 + Math.random() * 0.5,
            (Math.random() - 0.5) * 0.9
        );
        puff.userData.spin = new THREE.Vector3(
            (Math.random() - 0.5) * 1.6,
            (Math.random() - 0.5) * 1.6,
            (Math.random() - 0.5) * 1.6
        );
        puff.position.set(
            (Math.random() - 0.5) * 0.18,
            (Math.random() - 0.5) * 0.12,
            (Math.random() - 0.5) * 0.18
        );
        dust.add(puff);
    }
    scene.add(dust);
    destructionEffects.push({
        group: dust,
        age: 0,
        life: 0.28
    });
}

let db = null;
let auth = null;
let currentRoomId = null;
let currentUserId = null;
let isTeacher = false;
let peer = null;
let localStream = null;
let micEnabled = false;
let remoteStreams = new Map();
let activeVoiceCalls = new Map();
let voiceChatInitialized = false;
let networkSyncStarted = false;
let networkSyncIntervalId = null;
let networkSyncInFlight = false;
let otherPlayers = new Map(); // id -> mesh
let placedItems = new Map();
function markCollisionBroadphaseDirty() {
    collisionBroadphase?.markDirty?.();
}

function setPlacedItem(id, mesh) {
    placedItems.set(id, mesh);
    markCollisionBroadphaseDirty();
    collisionBroadphase?.upsert?.(id, mesh, { getCollisionBox: getPlacedItemCollisionBox });
    return mesh;
}

function deletePlacedItem(id) {
    const deleted = placedItems.delete(id);
    if (deleted) {
        markCollisionBroadphaseDirty();
        collisionBroadphase?.remove?.(id);
    }
    return deleted;
}

let playerConfig = { name: '', avatarId: 'boy_basic' };
let selectedItem = null;
let selectedItemTypeId = null;
let currentLibraryFilter = 'all';
let userInventory = [];
let groupedInventory = [];
let roomRating = { score: 0, level: 1 };
let chatEnabled = false;
let chatPanelOpenLocal = false;
let actionStackExpanded = false;
let hotbarQuickSlots = Array.from({ length: 9 }, () => null);
let hotbarActiveSlotIndex = 0;
let roomName = '';
const eyeHeight = 1.6;
const ACTIVE_SESSION_STORAGE_KEY = 'minebloxActiveSession';
const CLIENT_SESSION_STORAGE_KEY = 'minebloxClientSessionId';
const GUEST_SESSION_STORAGE_PREFIX = 'minebloxGuestSession_';
const SPAWN_PERSISTENCE_ENABLED_KEY = 'minebloxSpawnPersistenceEnabled';
const SPAWN_PERSISTENCE_STORAGE_PREFIX = 'minebloxSpawnState';
const ASCRAFT_SESSION_PERSISTENCE_ENABLED = false;
const ASCRAFT_AUTO_RESTORE_SESSION = false;
const SESSION_KIND_TEACHER = 'teacher';
const SESSION_KIND_STUDENT = 'student';
const SESSION_KIND_GUEST = 'guest';
let currentSessionKind = SESSION_KIND_STUDENT;
let unsubscribeOwnPlayer = null;
let spawnPersistenceEnabled = false;
let lastSavedSpawnState = null;
let lastSavedSpawnAtMs = 0;
let lastSavedSpawnSignature = '';
let currentStudentCredentialId = '';

const AVATAR_PRESETS = [
    { id: 'boy_basic', name: 'Zack', gender: 'male', skin: 0xffdbac, hairColor: 0x4b2c20, shirt: 0x3b82f6, pants: 0x1d4ed8, icon: '👦' },
    { id: 'girl_basic', name: 'Emma', gender: 'female', skin: 0xffdbac, hairColor: 0xf59e0b, shirt: 0xec4899, pants: 0x9d174d, icon: '👧' },
    { id: 'boy_cool', name: 'Leo', gender: 'male', skin: 0x8d5524, hairColor: 0x000000, shirt: 0x111827, pants: 0x374151, icon: '🧒🏿' },
    { id: 'girl_cute', name: 'Mia', gender: 'female', skin: 0xaf6e51, hairColor: 0x4b2c20, shirt: 0x8b5cf6, pants: 0x4c1d95, icon: '👧🏾' },
    { id: 'astronaut', name: 'Astro', gender: 'male', skin: 0xffffff, hairColor: 0x222222, shirt: 0xffffff, pants: 0xcccccc, icon: '👨‍🚀' },
    { id: 'scientist', name: 'Doc', gender: 'female', skin: 0xfde68a, hairColor: 0xeeeeee, shirt: 0xffffff, pants: 0x64748b, icon: '👩‍🔬' },
    { id: 'pirate', name: 'Pirata', gender: 'male', skin: 0xffdbac, hairColor: 0x000000, shirt: 0xef4444, pants: 0x111827, icon: '🏴‍☠️' },
    { id: 'ninja', name: 'Ninja', gender: 'male', skin: 0x000000, hairColor: 0x000000, shirt: 0x111827, pants: 0x111827, icon: '🥷' },
    { id: 'builder', name: 'Constructor', gender: 'male', skin: 0xffdbac, hairColor: 0x3b82f6, shirt: 0xfacc15, pants: 0x27272a, icon: '👷' }
];

function getAvatarPreset(id) {
    return AVATAR_PRESETS.find(p => p.id === id) || AVATAR_PRESETS[0];
}

function createNameLabel(name) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '400 20px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 2;
    ctx.shadowOffsetY = 1;
    ctx.fillText(name || 'Invitado', 128, 30);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        fog: false
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.center.set(0.5, 0);
    sprite.scale.set(1.7, 0.22, 1);
    sprite.position.y = 1.8;
    return sprite;
}

function loadSpawnPersistencePreference() {
    try {
        spawnPersistenceEnabled = localStorage.getItem(SPAWN_PERSISTENCE_ENABLED_KEY) === '1';
    } catch (_) {
        spawnPersistenceEnabled = false;
    }
    return spawnPersistenceEnabled;
}

function persistSpawnPersistencePreference() {
    try {
        localStorage.setItem(SPAWN_PERSISTENCE_ENABLED_KEY, spawnPersistenceEnabled ? '1' : '0');
    } catch (error) {
        console.warn('[ASCraft] No se pudo guardar la preferencia de ubicación:', error);
    }
}

function getSpawnPersistenceStorageKey(roomId = currentRoomId, bodyId = activeCelestialBody, spaceBodyId = currentSpaceBodyId) {
    const safeRoomId = String(roomId || '').trim().toUpperCase();
    const safeBodyId = String(bodyId || 'earth').trim().toLowerCase();
    const safeSpaceBodyId = safeBodyId === 'space' ? String(spaceBodyId || 'moon').trim().toLowerCase() : 'earth';
    const safeUserId = String(currentUserId || 'guest').trim().toLowerCase();
    return `${SPAWN_PERSISTENCE_STORAGE_PREFIX}:${safeUserId}:${safeRoomId}:${safeBodyId}:${safeSpaceBodyId}`;
}

function getSpawnPersistenceFallbackStorageKey(roomId = currentRoomId, bodyId = activeCelestialBody, spaceBodyId = currentSpaceBodyId) {
    const safeRoomId = String(roomId || '').trim().toUpperCase();
    const safeBodyId = String(bodyId || 'earth').trim().toLowerCase();
    const safeSpaceBodyId = safeBodyId === 'space' ? String(spaceBodyId || 'moon').trim().toLowerCase() : 'earth';
    return `${SPAWN_PERSISTENCE_STORAGE_PREFIX}:shared:${safeRoomId}:${safeBodyId}:${safeSpaceBodyId}`;
}

function getDefaultSpawnState(bodyId = activeCelestialBody, spaceBodyId = currentSpaceBodyId) {
    if (bodyId === 'space') {
        const spawn = getMoonSpawnPosition(spaceBodyId);
        return {
            roomId: currentRoomId,
            activeCelestialBody: 'space',
            currentSpaceBodyId: String(spaceBodyId || 'moon'),
            x: Number(spawn.x || 0),
            y: Number(spawn.y || 0),
            z: Number(spawn.z || 0),
            playerYaw: 0,
            playerPitch: 0,
            updatedAt: Date.now(),
            source: 'default_space'
        };
    }
    const spawn = getLobbySpawnPosition();
    return {
        roomId: currentRoomId,
        activeCelestialBody: 'earth',
        currentSpaceBodyId: 'earth',
        x: Number(spawn.x || 0),
        y: Number(spawn.y || 0),
        z: Number(spawn.z || 0),
        playerYaw: 0,
        playerPitch: 0,
        updatedAt: Date.now(),
        source: 'default_lobby'
    };
}

function isSpawnPersistenceWorldReady() {
    if (!currentRoomId || !roomShellGroup) return false;
    if (activeCelestialBody === 'space') {
        return !!moonTerrainGroup;
    }
    return !!outdoorTerrainGroup;
}

function doesSpawnOverlapStructuralCollider(state) {
    if (!state || !collisionBroadphase?.query) return false;
    const x = Number(state.x || 0);
    const y = Number(state.y || 0);
    const z = Number(state.z || 0);
    const playerBottom = y - PLAYER_EYE_HEIGHT;
    const playerTop = y + PLAYER_TOP_OFFSET;
    const queryResults = collisionBroadphase.query(
        new THREE.Vector3(x, y, z),
        Math.max(PLAYER_RADIUS + 0.9, STEP_UP_HEIGHT + 0.3),
        {
            actorType: 'playerLocal',
            mask: collisionBroadphase?.masks?.playerLocal,
            placedItems,
            getCollisionBox: getPlacedItemCollisionBox
        }
    );
    for (const mesh of queryResults) {
        const box = getPlacedItemCollisionBox(mesh);
        if (!box) continue;
        const padding = Number.isFinite(mesh?.userData?.collisionPadding) ? mesh.userData.collisionPadding : 0.05;
        const expandedMinX = box.min.x - PLAYER_RADIUS - padding;
        const expandedMaxX = box.max.x + PLAYER_RADIUS + padding;
        const expandedMinZ = box.min.z - PLAYER_RADIUS - padding;
        const expandedMaxZ = box.max.z + PLAYER_RADIUS + padding;
        const overlapsXZ = x >= expandedMinX && x <= expandedMaxX && z >= expandedMinZ && z <= expandedMaxZ;
        if (!overlapsXZ) continue;
        const topY = mesh?.userData?.collisionTop ?? box.max.y;
        const bottomY = mesh?.userData?.collisionBottom ?? box.min.y;
        const intersectsVertically = playerTop > bottomY && playerBottom < topY;
        if (intersectsVertically) {
            return true;
        }
    }
    return false;
}

function resolveSpawnState(state) {
    const fallbackBody = state?.activeCelestialBody === 'space' ? 'space' : 'earth';
    const fallbackSpaceBody = fallbackBody === 'space'
        ? String(state?.currentSpaceBodyId || currentSpaceBodyId || 'moon')
        : 'earth';
    const fallback = getDefaultSpawnState(fallbackBody, fallbackSpaceBody);
    const x = Number(state?.x);
    const y = Number(state?.y);
    const z = Number(state?.z);
    const hasBasicState = !!state
        && String(state.roomId || '').trim().toUpperCase() === String(currentRoomId || '').trim().toUpperCase()
        && Number.isFinite(x)
        && Number.isFinite(y)
        && Number.isFinite(z);
    if (!hasBasicState) {
        return fallback;
    }
    if (fallbackBody === 'space' && !isSpawnStateStructurallyValid(state)) {
        return fallback;
    }
    if (fallbackBody === 'earth') {
        const roomSafeHalfX = (ROOM_WIDTH * 0.5) - 1.6;
        const roomSafeHalfZ = (ROOM_DEPTH * 0.5) - 1.9;
        const insideRoomBounds = Math.abs(x) <= (ROOM_WIDTH * 0.5 - 0.5) && Math.abs(z) <= (ROOM_DEPTH * 0.5 - 0.5);
        if ((insideRoomBounds && (Math.abs(x) > roomSafeHalfX || Math.abs(z) > roomSafeHalfZ)) || (insideRoomBounds && doesSpawnOverlapStructuralCollider(state))) {
            return fallback;
        }
        if (!insideRoomBounds) {
            const savedPos = new THREE.Vector3(x, y, z);
            const earthCenter = getEarthCenter?.() || new THREE.Vector3(0, -OUTDOOR_WORLD_RADIUS, 0);
            const relative = savedPos.clone().sub(earthCenter);
            const cubicDistance = Math.max(Math.abs(relative.x), Math.abs(relative.y), Math.abs(relative.z));
            const minSurfaceDistance = OUTDOOR_WORLD_RADIUS - 6;
            const maxSurfaceDistance = OUTDOOR_WORLD_RADIUS + PLAYER_EYE_HEIGHT + 10;
            if (cubicDistance >= minSurfaceDistance && cubicDistance <= maxSurfaceDistance) {
                return state;
            }

            const supportState = getEarthSurfaceSupportStateAtPosition(savedPos);
            if (supportState && Number.isFinite(supportState.supportY)) {
                const up = supportState.supportNormal || new THREE.Vector3(0, 1, 0);
                const sp = supportState.supportPoint || new THREE.Vector3(supportState.x, supportState.supportY, supportState.z);
                return {
                    ...state,
                    x: sp.x,
                    y: sp.y + (PLAYER_EYE_HEIGHT || 1.6),
                    z: sp.z
                };
            }
            return fallback;
        }
    }
    return state;
}

function isSpawnStateStructurallyValid(state) {
    if (!state || String(state.roomId || '').trim().toUpperCase() !== String(currentRoomId || '').trim().toUpperCase()) return false;
    const x = Number(state.x);
    const y = Number(state.y);
    const z = Number(state.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false;
    const bodyId = String(state.activeCelestialBody || 'earth');
    if (bodyId === 'space') {
        const body = getTravelBodyConfig(state.currentSpaceBodyId || currentSpaceBodyId);
        const center = getMoonCenter();
        const distance = new THREE.Vector3(x, y, z).distanceTo(center);
        return distance <= (body.surfaceRadius + PLANET_EYE_HEIGHT + 9);
    }
    const withinRoom = Math.abs(x) <= (ROOM_WIDTH * 0.5 - 0.8)
        && Math.abs(z) <= (ROOM_DEPTH * 0.5 - 0.8)
        && y >= (getRoomWorldFloorY() + PLAYER_EYE_HEIGHT - 1)
        && y <= (getRoomWorldCeilingY() + PLAYER_EYE_HEIGHT + 2);
    if (withinRoom) return true;
    const earthCenter = getEarthCenter();
    const relative = new THREE.Vector3(x, y, z).sub(earthCenter);
    const cubicDistance = Math.max(Math.abs(relative.x), Math.abs(relative.y), Math.abs(relative.z));
    if (cubicDistance > (OUTDOOR_WORLD_RADIUS + PLAYER_EYE_HEIGHT + 20)) return false;
    const supportState = getEarthSurfaceSupportStateAtPosition(new THREE.Vector3(x, y, z));
    if (!supportState?.supportPoint || !supportState?.supportNormal) return false;
    const supportNormal = supportState.supportNormal.clone();
    if (supportNormal.lengthSq() < 1e-6) return false;
    supportNormal.normalize();
    const eyeOffset = new THREE.Vector3(x, y, z).sub(supportState.supportPoint).dot(supportNormal);
    const minEyeOffset = Math.max(0.3, PLAYER_EYE_HEIGHT - 2.5);
    const maxEyeOffset = PLAYER_EYE_HEIGHT + 6.5;
    return Number.isFinite(eyeOffset) && eyeOffset >= minEyeOffset && eyeOffset <= maxEyeOffset;
}

function readSavedSpawnState(bodyId = activeCelestialBody, spaceBodyId = currentSpaceBodyId) {
    try {
        const primaryKey = getSpawnPersistenceStorageKey(currentRoomId, bodyId, spaceBodyId);
        const fallbackKey = getSpawnPersistenceFallbackStorageKey(currentRoomId, bodyId, spaceBodyId);
        const raw = localStorage.getItem(primaryKey) || localStorage.getItem(fallbackKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const resolved = resolveSpawnState(parsed);
        if (!isSpawnStateStructurallyValid(resolved)) return null;
        if (resolved !== parsed) {
            const serialized = JSON.stringify(resolved);
            localStorage.setItem(primaryKey, serialized);
            localStorage.setItem(fallbackKey, serialized);
        }
        return resolved;
    } catch (_) {
        return null;
    }
}

function getPreferredSpawnState() {
    if (!spawnPersistenceEnabled) {
        lastSavedSpawnState = null;
        return getDefaultSpawnState('earth', 'earth');
    }
    const fallbackBody = activeCelestialBody === 'space' ? 'space' : 'earth';
    const saved = readSavedSpawnState(fallbackBody, currentSpaceBodyId);
    if (saved) {
        lastSavedSpawnState = saved;
        return { ...resolveSpawnState(saved), source: 'saved_spawn' };
    }
    return getDefaultSpawnState(fallbackBody, currentSpaceBodyId);
}

function getSafeOutdoorSpawnState(state = null) {
    const resolved = resolveSpawnState(state || getPreferredSpawnState());
    const bodyId = String(resolved.activeCelestialBody || 'earth');
    if (bodyId !== 'earth') return resolved;
    const x = Number(resolved.x || 0);
    const z = Number(resolved.z || 0);
    const y = Number(resolved.y || 0);
    const earthCenter = getEarthCenter();
    const relative = new THREE.Vector3(x, y, z).sub(earthCenter);
    const distanceCubic = Math.max(Math.abs(relative.x), Math.abs(relative.y), Math.abs(relative.z));
    const maxSafeEyeDistance = OUTDOOR_WORLD_RADIUS + PLAYER_EYE_HEIGHT + 5;

    if (distanceCubic <= maxSafeEyeDistance) {
        return resolved;
    }
    const safeScale = Math.max(0, maxSafeEyeDistance / Math.max(distanceCubic, 1e-6));
    const safePos = earthCenter.clone().add(relative.multiplyScalar(safeScale));
    const supportState = getEarthSurfaceSupportStateAtPosition(safePos);
    if (!Number.isFinite(supportState.supportY)) {
        return getDefaultSpawnState('earth', 'earth');
    }
    const up = supportState.supportNormal || new THREE.Vector3(0, 1, 0);
    const pos = supportState.supportPoint?.clone() || new THREE.Vector3(supportState.x, supportState.supportY, supportState.z);
    pos.addScaledVector(up, PLAYER_EYE_HEIGHT);
    return {
        ...resolved,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        source: 'safe_outdoor_spawn'
    };
}

function updateSpawnPersistenceButtonUi() {
    const btn = document.getElementById('spawnPersistBtn');
    const label = document.getElementById('spawnPersistBtnLabel');
    if (!btn || !label) return;
    btn.dataset.enabled = spawnPersistenceEnabled ? '1' : '0';
    btn.title = spawnPersistenceEnabled ? 'Guardar ubicación: activado' : 'Guardar ubicación: desactivado';
    btn.setAttribute('aria-pressed', spawnPersistenceEnabled ? 'true' : 'false');
    label.textContent = spawnPersistenceEnabled ? 'Lugar: ON' : 'Lugar: OFF';
    btn.classList.toggle('is-active', spawnPersistenceEnabled);
}

let lastHudUpdateAtMs = 0;
function updatePlayerCoordsHud() {
    const now = Date.now();
    if (now - lastHudUpdateAtMs < 100) return; // Throttle to 10Hz
    lastHudUpdateAtMs = now;

    const label = document.getElementById('minebloxPlayerCoords');
    if (label) {
        if (!playerWorldPosition) {
            label.textContent = 'XYZ -, -, -';
        } else {
            label.textContent = `XYZ ${Math.round(playerWorldPosition.x)}, ${Math.round(playerWorldPosition.y)}, ${Math.round(playerWorldPosition.z)}`;
        }
    }

    const seasonLabel = document.getElementById('minebloxSeason');
    if (seasonLabel && currentRoomTimeState?.season) {
        const seasons = {
            'spring': { text: '🌸 PRIMAVERA', color: '#f472b6' },
            'summer': { text: '☀️ VERANO', color: '#facc15' },
            'autumn': { text: '🍂 OTOÑO', color: '#f97316' },
            'winter': { text: '❄️ INVIERNO', color: '#60a5fa' }
        };
        const cfg = seasons[currentRoomTimeState.season] || { text: '...', color: '#fbbf24' };
        if (seasonLabel.textContent !== cfg.text) {
            seasonLabel.textContent = cfg.text;
            seasonLabel.style.color = cfg.color;
        }
    }
}

function saveCurrentSpawnState(force = false) {
    if (!spawnPersistenceEnabled || !currentRoomId || !playerWorldPosition) return;
    if (!force && !isSpawnPersistenceWorldReady()) return;
    if (!force && movementController?.state?.inFallbackSpawn) return;
    if (!force && (Date.now() - lastSavedSpawnAtMs) < 4000) return;
    lastSavedSpawnAtMs = Date.now();
    const activeState = {
        roomId: currentRoomId,
        activeCelestialBody,
        currentSpaceBodyId: activeCelestialBody === 'space' ? currentSpaceBodyId : 'earth',
        x: Number(playerWorldPosition.x || 0),
        y: Number(playerWorldPosition.y || 0),
        z: Number(playerWorldPosition.z || 0),
        playerYaw: Number(playerYaw || 0),
        playerPitch: Number(playerPitch || 0),
        updatedAt: Date.now()
    };
    const resolvedState = resolveSpawnState(activeState);
    if (!isSpawnStateStructurallyValid(resolvedState)) return;
    const signature = [
        resolvedState.roomId,
        resolvedState.activeCelestialBody,
        resolvedState.currentSpaceBodyId,
        Math.round(resolvedState.x * 10),
        Math.round(resolvedState.y * 10),
        Math.round(resolvedState.z * 10),
        Math.round(resolvedState.playerYaw * 100),
        Math.round(resolvedState.playerPitch * 100)
    ].join(':');
    if (!force && signature === lastSavedSpawnSignature) return;
    try {
        const serialized = JSON.stringify(resolvedState);
        localStorage.setItem(
            getSpawnPersistenceStorageKey(resolvedState.roomId, resolvedState.activeCelestialBody, resolvedState.currentSpaceBodyId),
            serialized
        );
        localStorage.setItem(
            getSpawnPersistenceFallbackStorageKey(resolvedState.roomId, resolvedState.activeCelestialBody, resolvedState.currentSpaceBodyId),
            serialized
        );
        lastSavedSpawnState = resolvedState;
        lastSavedSpawnAtMs = Date.now();
        lastSavedSpawnSignature = signature;
    } catch (error) {
        console.warn('[ASCraft] No se pudo guardar la ubicación del jugador:', error);
    }
}

function persistActiveSession() {
    if (!ASCRAFT_SESSION_PERSISTENCE_ENABLED) return;
    if (!currentRoomId || !playerConfig.name) return;
    try {
        localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify({
            roomId: currentRoomId,
            isTeacher,
            isGuest: currentSessionKind === SESSION_KIND_GUEST,
            sessionKind: currentSessionKind,
            name: playerConfig.name,
            avatarId: playerConfig.avatarId,
            userId: currentUserId,
            activeCelestialBody,
            currentSpaceBodyId,
            spawnPersistenceEnabled,
            updatedAt: Date.now()
        }));
    } catch (error) {
        console.warn('[ASCraft] No se pudo guardar la sesión activa:', error);
    }
}

function clearActiveSession() {
    if (!ASCRAFT_SESSION_PERSISTENCE_ENABLED) return;
    try {
        localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    } catch (_) { }
}

function clearCurrentRoomSessionState() {
    currentStudentCredentialId = '';
    if (currentRoomId) {
        try {
            localStorage.removeItem(`mineblox_name_${currentRoomId}`);
            localStorage.removeItem(`mineblox_avatar_${currentRoomId}`);
            sessionStorage.removeItem(`${GUEST_SESSION_STORAGE_PREFIX}${currentRoomId}`);
        } catch (_) { }
    }
    try {
        localStorage.removeItem("minebloxIsTeacher");
        localStorage.removeItem("minebloxLastTeacherRoom");
    } catch (_) { }
    clearActiveSession();
}

function stopNetworkSync() {
    if (networkSyncIntervalId) {
        clearInterval(networkSyncIntervalId);
        networkSyncIntervalId = null;
    }
    networkSyncStarted = false;
    networkSyncInFlight = false;
    networkLastSyncAtMs = 0;
    networkLastHeartbeatAtMs = 0;
    networkLastSyncedPosition = null;
    networkLastSyncedYaw = 0;
    networkLastSyncedMoving = false;
    networkLastSyncedMicEnabled = false;
    networkLastSyncedPeerId = '';
    networkLastSyncedBodyId = 'earth';
}

function exitGameSession() {
    stopNetworkSync();
    stopLocalVoiceStream();
    activeVoiceCalls.forEach((call) => {
        try { call.close?.(); } catch (_) { }
    });
    activeVoiceCalls.clear();
    remoteStreams.clear();
    try { peer?.destroy?.(); } catch (_) { }
    peer = null;
    voiceChatInitialized = false;
    if (db && currentRoomId && currentUserId) {
        deleteDoc(doc(db, "mineblox_rooms", currentRoomId, "players", currentUserId)).catch(() => { });
    }
    clearCurrentRoomSessionState();
    if (unsubscribeOwnPlayer) {
        try { unsubscribeOwnPlayer(); } catch (_) { }
        unsubscribeOwnPlayer = null;
    }
    window.location.reload();
}

function readActiveSession() {
    if (!ASCRAFT_SESSION_PERSISTENCE_ENABLED) return null;
    try {
        const raw = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                const roomId = String(parsed.roomId || '').trim();
                if (roomId) {
                    return {
                        roomId,
                        isTeacher: Boolean(parsed.isTeacher),
                        isGuest: Boolean(parsed.isGuest || parsed.sessionKind === SESSION_KIND_GUEST),
                        sessionKind: String(parsed.sessionKind || (parsed.isTeacher ? SESSION_KIND_TEACHER : SESSION_KIND_STUDENT)).trim() || SESSION_KIND_STUDENT,
                        name: String(parsed.name || '').trim(),
                        avatarId: String(parsed.avatarId || '').trim(),
                        userId: String(parsed.userId || '').trim(),
                        spawnPersistenceEnabled: Boolean(parsed.spawnPersistenceEnabled),
                        activeCelestialBody: String(parsed.activeCelestialBody || 'earth').trim().toLowerCase(),
                        currentSpaceBodyId: String(parsed.currentSpaceBodyId || 'moon').trim().toLowerCase()
                    };
                }
            }
        }

        const recentRaw = localStorage.getItem('minebloxRecentRooms') || '[]';
        const recentRooms = JSON.parse(recentRaw);
        if (!Array.isArray(recentRooms) || recentRooms.length === 0) return null;

        for (const entry of recentRooms) {
            const token = String(entry || '').trim().toUpperCase();
            if (!token) continue;
            const isTeacherRoom = !token.startsWith('A-');
            const roomId = isTeacherRoom ? token : token.slice(2);
            if (!roomId) continue;

            if (isTeacherRoom && localStorage.getItem('minebloxIsTeacher') === 'true' && localStorage.getItem('minebloxLastTeacherRoom') === roomId) {
                return {
                    roomId,
                    isTeacher: true,
                    isGuest: false,
                    sessionKind: SESSION_KIND_TEACHER,
                    name: String(localStorage.getItem(`mineblox_name_${roomId}`) || '').trim(),
                    avatarId: 'scientist',
                    userId: String(localStorage.getItem('minebloxPersistentId') || '').trim()
                };
            }

            const savedName = String(localStorage.getItem(`mineblox_name_${roomId}`) || '').trim();
            const savedAvatar = String(localStorage.getItem(`mineblox_avatar_${roomId}`) || '').trim();
            if (savedName && savedAvatar) {
                return {
                    roomId,
                    isTeacher: false,
                    isGuest: false,
                    sessionKind: SESSION_KIND_STUDENT,
                    name: savedName,
                    avatarId: savedAvatar,
                    userId: String(localStorage.getItem('minebloxPersistentId') || '').trim()
                };
            }
        }

        return null;
    } catch (error) {
        console.warn('[ASCraft] No se pudo leer la sesión activa:', error);
        return null;
    }
}

function getGuestSessionStorageKey(roomId) {
    return `${GUEST_SESSION_STORAGE_PREFIX}${String(roomId || '').trim()}`;
}

function readGuestSessionId(roomId) {
    try {
        return String(sessionStorage.getItem(getGuestSessionStorageKey(roomId)) || '').trim() || currentUserId || '';
    } catch (_) {
        return currentUserId || '';
    }
}

function ensureGuestSessionId(roomId) {
    const key = getGuestSessionStorageKey(roomId);
    let guestId = readGuestSessionId(roomId);
    if (!guestId) {
        guestId = currentUserId || ensureClientSessionId();
        try {
            sessionStorage.setItem(key, guestId);
        } catch (_) { }
    }
    return guestId;
}

function clearGuestSessionId(roomId) {
    try {
        sessionStorage.removeItem(getGuestSessionStorageKey(roomId));
    } catch (_) { }
}

function ensureClientSessionId() {
    try {
        const existing = String(sessionStorage.getItem(CLIENT_SESSION_STORAGE_KEY) || '').trim();
        if (existing) return existing;
        const created = `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        sessionStorage.setItem(CLIENT_SESSION_STORAGE_KEY, created);
        return created;
    } catch (_) {
        return `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    }
}

function getStableSessionOwnerId(sessionType = currentSessionKind) {
    if (sessionType === SESSION_KIND_GUEST) {
        return readGuestSessionId(currentRoomId) || currentUserId || ensureClientSessionId();
    }
    try {
        return currentUserId || String(localStorage.getItem('minebloxPersistentId') || '').trim() || ensureClientSessionId();
    } catch (_) {
        return currentUserId || ensureClientSessionId();
    }
}

async function ensureMinebloxAuthenticatedUser(app) {
    auth = auth || getAuth(app);
    if (auth.currentUser?.uid) {
        return auth.currentUser;
    }
    const credential = await signInAnonymously(auth);
    return credential.user;
}

function normalizeDisplayNameCandidate(name) {
    return String(name || '').trim().replace(/\s+/g, ' ');
}

function getPlayerDuplicateKey(player) {
    if (!player) return '';
    const normalizedName = normalizeDisplayNameCandidate(player.displayName || '').toLowerCase();
    const sessionType = String(player.sessionType || SESSION_KIND_STUDENT).trim() || SESSION_KIND_STUDENT;
    return normalizedName ? `${sessionType}:${normalizedName}` : '';
}

function getDuplicatePlayerIdSet(players = [], currentPlayer = null) {
    const counts = new Map();
    const register = (player) => {
        const key = getPlayerDuplicateKey(player);
        if (!key) return;
        counts.set(key, (counts.get(key) || 0) + 1);
    };
    players.forEach(register);
    if (currentPlayer) register(currentPlayer);
    const duplicates = new Set();
    players.forEach((player) => {
        const key = getPlayerDuplicateKey(player);
        if (key && (counts.get(key) || 0) > 1) {
            duplicates.add(player.id);
        }
    });
    return duplicates;
}

async function cleanupDuplicateTeacherSessions() {
    if (!db || !currentRoomId || !currentUserId || !isTeacher) return;
    try {
        const playersSnap = await getDocs(collection(db, "mineblox_rooms", currentRoomId, "players"));
        const teacherName = normalizeDisplayNameCandidate(playerConfig.name || '');
        const currentOwnerId = getStableSessionOwnerId(SESSION_KIND_TEACHER);
        const currentClientSessionId = ensureClientSessionId();
        const duplicateTeacherDocs = playersSnap.docs.filter((playerDoc) => {
            if (playerDoc.id === currentUserId) return false;
            const data = playerDoc.data() || {};
            const sessionType = String(data.sessionType || '').trim();
            const displayName = normalizeDisplayNameCandidate(data.displayName || '');
            const sameTeacherName = !!teacherName && displayName === teacherName;
            const sameOwnerDifferentSession = sessionType === SESSION_KIND_TEACHER
                && String(data.sessionOwnerId || '').trim()
                && String(data.sessionOwnerId || '').trim() === currentOwnerId
                && String(data.clientSessionId || '').trim() !== currentClientSessionId;
            return sameTeacherName || sameOwnerDifferentSession;
        });
        for (const duplicateDoc of duplicateTeacherDocs) {
            try {
                await updateDoc(duplicateDoc.ref, {
                    forceLogout: true,
                    forceLogoutReason: 'Se cerró una sesión duplicada del profesor',
                    forceLogoutBy: currentUserId,
                    forceLogoutAt: serverTimestamp()
                });
                setTimeout(() => {
                    deleteDoc(duplicateDoc.ref).catch(() => { });
                }, 2500);
            } catch (_) { }
        }
    } catch (error) {
        console.warn('[ASCraft] No se pudieron limpiar sesiones duplicadas del profesor:', error);
    }
}

function makeUniqueGuestDisplayName(baseName, takenNames = new Set()) {
    const normalizedBase = normalizeDisplayNameCandidate(baseName) || 'Invitado';
    if (!takenNames.has(normalizedBase)) return normalizedBase;

    const brandedBase = `${normalizedBase} (Invitado)`;
    if (!takenNames.has(brandedBase)) return brandedBase;

    let suffix = 2;
    while (takenNames.has(`${normalizedBase} (Invitado ${suffix})`)) {
        suffix += 1;
    }
    return `${normalizedBase} (Invitado ${suffix})`;
}

function createDropdownItemHtml({ id, icon, label, labelId = "", style = "", iconTone = "" }) {
    const labelAttr = labelId ? ` id="${labelId}"` : "";
    const iconClass = iconTone ? `mineblox-dd-icon ${iconTone}` : 'mineblox-dd-icon';
    return `
        <div class="mineblox-dropdown-item" id="${id}" style="${style}">
            <span class="${iconClass}"><i class="bx ${icon}"></i></span>
            <span class="mineblox-dd-label"${labelAttr}>${label}</span>
        </div>
    `;
}

async function fetchJson(url, options = {}) {
    const response = await fetch(buildApiUrl(url), options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(String(data?.error || `HTTP ${response.status}`));
    }
    return data;
}

async function clearUserPlacedObjectsInWorld() {
    if (!currentRoomId) return 0;
    const itemsRef = collection(db, "mineblox_rooms", currentRoomId, "items");
    const snap = await getDocs(itemsRef);
    const userDocs = snap.docs.filter((d) => !isProtectedWorldItemData(d.data() || {}));
    if (!userDocs.length) return 0;

    terrainRegenerationInProgress = true;
    try {
        for (const d of userDocs) {
            const mesh = placedItems.get(d.id);
            if (mesh) {
                if (activeVideos.has(d.id)) {
                    removeActiveVideoDisplay(d.id);
                }
                clearWhiteboardRenderState(d.id);
                scene.remove(mesh);
                deletePlacedItem(d.id);
            }
        }

        const chunkSize = 350;
        for (let i = 0; i < userDocs.length; i += chunkSize) {
            const batch = writeBatch(db);
            userDocs.slice(i, i + chunkSize).forEach((d) => {
                batch.delete(d.ref);
            });
            await batch.commit();
        }

        pendingDestructionIds.clear();
        destructionTarget = null;
        exitSeatedState();
        return userDocs.length;
    } finally {
        terrainRegenerationInProgress = false;
    }
}

async function handleClearWorldAction() {
    if (!isTeacher) return;
    const ok = window.confirm('Esto borrará todos los objetos colocados por usuarios. El planeta y el salón base se conservarán. ¿Continuar?');
    if (!ok) return;
    try {
        const removed = await clearUserPlacedObjectsInWorld();
        alert(removed > 0 ? `Mundo limpiado. Se borraron ${removed} objetos.` : 'No había objetos de usuario para limpiar.');
    } catch (error) {
        console.error('[ASCraft] Error limpiando mundo:', error);
        alert('No se pudo limpiar el mundo.');
    }
}

function groupInventoryItems(items = []) {
    const groups = new Map();
    const activeIds = new Set(getActiveItemsLibrary().map((item) => String(item.id || '').trim().toLowerCase()).filter(Boolean));
    items.forEach((item) => {
        const key = normalizeInventoryItemId(item?.itemId);
        if (!key) return;
        if (USE_VOXEL_PLANET_ITEMS_HYBRID && !activeIds.has(key)) return;
        if (!groups.has(key)) {
            groups.set(key, {
                itemId: key,
                count: 0,
                items: []
            });
        }
        const group = groups.get(key);
        group.count += 1;
        group.items.push(item);
    });
    return Array.from(groups.values()).sort((a, b) => {
        const activeLib = getActiveItemsLibrary();
        const rankA = activeLib.findIndex((it) => it.id === a.itemId);
        const rankB = activeLib.findIndex((it) => it.id === b.itemId);
        const safeA = rankA === -1 ? Number.MAX_SAFE_INTEGER : rankA;
        const safeB = rankB === -1 ? Number.MAX_SAFE_INTEGER : rankB;
        return safeA - safeB || a.itemId.localeCompare(b.itemId);
    });
}

function showMinebloxInvBar() {
    const bar = document.getElementById('minebloxInvBar');
    if (bar) bar.style.display = 'flex';
    buildItemThumbnailCache().catch((error) => {
        console.warn('[ASCraft] Thumbnail cache failed:', error);
    });
}

function hideMinebloxInvBar() {
    const bar = document.getElementById('minebloxInvBar');
    if (bar) bar.style.display = 'none';
}

function setLocalChatPanelVisibility(isOpen = false) {
    chatPanelOpenLocal = !!isOpen;
    const chatDiv = document.getElementById('minebloxChat');
    if (chatDiv) {
        chatDiv.style.display = chatPanelOpenLocal ? 'flex' : 'none';
    }
    const nextLabel = chatPanelOpenLocal ? 'Chat: ON' : 'Chat: OFF';
    const teacherLabel = document.getElementById('toolbarChatToggleLabel');
    const studentLabel = document.getElementById('studentChatToggleLabel');
    if (teacherLabel) teacherLabel.textContent = nextLabel;
    if (studentLabel) studentLabel.textContent = nextLabel;
}

function isCompactTouchViewport() {
    return typeof window !== 'undefined' && window.innerWidth <= 820;
}

function getQuickSlotStorageKey() {
    const safeRoom = String(currentRoomId || 'NO_ROOM').trim().toUpperCase();
    const safeUser = String(currentUserId || 'guest').trim().toLowerCase() || 'guest';
    return `minebloxQuickSlots:${safeRoom}:${safeUser}`;
}

function persistHotbarQuickSlots() {
    try {
        localStorage.setItem(getQuickSlotStorageKey(), JSON.stringify(hotbarQuickSlots));
    } catch (_) { }
}

function readPersistedHotbarQuickSlots() {
    try {
        const raw = localStorage.getItem(getQuickSlotStorageKey());
        if (!raw) return Array.from({ length: 9 }, () => null);
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return Array.from({ length: 9 }, () => null);
        return Array.from({ length: 9 }, (_, index) => normalizeInventoryItemId(parsed[index]) || null);
    } catch (_) {
        return Array.from({ length: 9 }, () => null);
    }
}

function getEffectiveInventoryItemIdSet() {
    return new Set(getEffectiveGroupedInventory()
        .map((group) => normalizeInventoryItemId(group.itemId))
        .filter(Boolean));
}

function syncHotbarQuickSlots() {
    const availableIds = getEffectiveInventoryItemIdSet();
    hotbarQuickSlots = Array.from({ length: 9 }, (_, index) => {
        const slotId = normalizeInventoryItemId(hotbarQuickSlots[index]);
        return slotId && availableIds.has(slotId) ? slotId : null;
    });
    if (hotbarQuickSlots.every((slotId) => !slotId) && availableIds.size > 0) {
        const bootstrapIds = Array.from(availableIds).slice(0, 9);
        hotbarQuickSlots = Array.from({ length: 9 }, (_, index) => bootstrapIds[index] || null);
    }
    if (!hotbarQuickSlots[hotbarActiveSlotIndex]) {
        const firstFilled = hotbarQuickSlots.findIndex((slotId) => !!slotId);
        hotbarActiveSlotIndex = firstFilled >= 0 ? firstFilled : 0;
    }
    persistHotbarQuickSlots();
}

function getHotbarSlotItemId(index = hotbarActiveSlotIndex) {
    return normalizeInventoryItemId(hotbarQuickSlots[index]) || null;
}

function getHotbarVisibleSlots() {
    return hotbarQuickSlots.slice(0, 9);
}

function getHiddenInventoryCount() {
    const assignedIds = new Set(hotbarQuickSlots.map((itemId) => normalizeInventoryItemId(itemId)).filter(Boolean));
    const effectiveIds = new Set(getEffectiveGroupedInventory().map((group) => normalizeInventoryItemId(group.itemId)).filter(Boolean));
    let hidden = 0;
    effectiveIds.forEach((itemId) => {
        if (!assignedIds.has(itemId)) hidden += 1;
    });
    return hidden;
}

function assignItemToHotbarSlot(itemId, slotIndex = hotbarActiveSlotIndex) {
    const normalized = normalizeInventoryItemId(itemId);
    if (!normalized) return;
    const targetIndex = Math.max(0, Math.min(8, Number(slotIndex || 0)));
    hotbarQuickSlots[targetIndex] = normalized;
    hotbarActiveSlotIndex = targetIndex;
    persistHotbarQuickSlots();
}

function resolveSelectedItemFromHotbar() {
    const activeItemId = getHotbarSlotItemId(hotbarActiveSlotIndex);
    if (!activeItemId) {
        selectedItem = null;
        selectedItemTypeId = null;
        return;
    }
    selectedItemTypeId = activeItemId;
    const group = getEffectiveGroupedInventory().find((entry) => normalizeInventoryItemId(entry.itemId) === activeItemId);
    if (group?.items?.length) {
        selectedItem = group.items[0];
        return;
    }
    if (isRecessVirtualInventoryActive()) {
        selectedItem = { itemId: activeItemId, docId: null, virtual: true };
        return;
    }
    selectedItem = null;
}

function setHotbarActiveSlot(index = 0) {
    hotbarActiveSlotIndex = Math.max(0, Math.min(8, Number(index || 0)));
    resolveSelectedItemFromHotbar();
}

function restoreHotbarQuickSlots() {
    hotbarQuickSlots = readPersistedHotbarQuickSlots();
    syncHotbarQuickSlots();
    resolveSelectedItemFromHotbar();
}

function getHotbarGroups() {
    return getHotbarVisibleSlots().map((itemId) => {
        const normalized = normalizeInventoryItemId(itemId);
        if (!normalized) return null;
        const group = getEffectiveGroupedInventory().find((entry) => normalizeInventoryItemId(entry.itemId) === normalized);
        if (group) return group;
        if (isRecessVirtualInventoryActive()) {
            return {
                itemId: normalized,
                count: 999,
                items: [{ itemId: normalized, docId: null, virtual: true }]
            };
        }
        return {
            itemId: normalized,
            count: 0,
            items: []
        };
    });
}

function setActionStackExpanded(isExpanded = false) {
    actionStackExpanded = !!isExpanded;
    const stack = document.getElementById('minebloxActionStack');
    if (!stack) return;
    stack.classList.toggle('is-expanded', actionStackExpanded);
    const visibleButtons = Array.from(stack.querySelectorAll('.mineblox-action-stack__actions .mineblox-action-btn'))
        .filter((button) => button.style.display !== 'none');

    // Spread buttons more and use a larger radius to prevent overlap
    const isCompact = isCompactTouchViewport();
    const radius = isCompact ? 142 : 192;
    const startDeg = isCompact ? 130 : 120;
    const endDeg = isCompact ? 260 : 285;

    const step = visibleButtons.length > 1 ? (endDeg - startDeg) / (visibleButtons.length - 1) : 0;
    visibleButtons.forEach((button, index) => {
        const angleDeg = startDeg + (step * index);
        const angleRad = angleDeg * (Math.PI / 180);
        const x = Math.cos(angleRad) * radius;
        const y = Math.sin(angleRad) * radius;
        button.style.setProperty('--action-x', `${x.toFixed(1)}px`);
        button.style.setProperty('--action-y', `${y.toFixed(1)}px`);
        button.dataset.actionIndex = String(index);
    });
}

function toggleActionStackExpanded() {
    setActionStackExpanded(!actionStackExpanded);
}

function syncOwnPlayerSession(data = {}) {
    const serverName = String(data.displayName || '').trim();
    const serverAvatar = String(data.avatarId || '').trim();

    if (serverName && serverName !== playerConfig.name) {
        playerConfig.name = serverName;
        if (currentRoomId && currentSessionKind === SESSION_KIND_TEACHER) {
            localStorage.setItem(`mineblox_name_${currentRoomId}`, serverName);
        }
        const userNameEl = document.getElementById('minebloxUserName');
        if (userNameEl) {
            userNameEl.textContent = isTeacher ? `Profesor: ${playerConfig.name}` : `Estudiante: ${playerConfig.name}`;
        }
    }

    if (serverAvatar && serverAvatar !== playerConfig.avatarId) {
        playerConfig.avatarId = serverAvatar;
        if (currentRoomId && currentSessionKind === SESSION_KIND_TEACHER) {
            localStorage.setItem(`mineblox_avatar_${currentRoomId}`, serverAvatar);
        } else if (currentRoomId && currentSessionKind === SESSION_KIND_STUDENT && currentStudentCredentialId) {
            localStorage.setItem(getStudentAvatarStorageKey(currentRoomId, currentStudentCredentialId), serverAvatar);
        }
    }
}

function watchOwnPlayerDoc() {
    if (!db || !currentRoomId || !currentUserId) return;
    if (unsubscribeOwnPlayer) {
        try { unsubscribeOwnPlayer(); } catch (_) { }
    }
    unsubscribeOwnPlayer = onSnapshot(doc(db, "mineblox_rooms", currentRoomId, "players", currentUserId), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() || {};
        if (data.forceLogout) {
            if (currentSessionKind === SESSION_KIND_GUEST) {
                clearGuestSessionId(currentRoomId);
            }
            exitGameSession();
            return;
        }
        if (data.forceMute) {
            if (micEnabled) {
                toggleMic().catch(() => { });
                alert("El maestro te ha silenciado");
            }
            setDoc(doc(db, "mineblox_rooms", currentRoomId, "players", currentUserId), { forceMute: false }, { merge: true }).catch(() => { });
        }
        syncOwnPlayerSession(data);
    });
}

async function isPlayerNameTakenInRoom(roomId, name, excludePlayerId = null) {
    const room = String(roomId || '').trim();
    const candidate = String(name || '').trim();
    if (!room || !candidate) return false;

    const snap = await getDocs(collection(db, "mineblox_rooms", room, "players"));
    let taken = false;
    snap.forEach((docSnap) => {
        if (excludePlayerId && docSnap.id === excludePlayerId) return;
        const displayName = String(docSnap.data()?.displayName || '').trim();
        if (displayName === candidate) {
            taken = true;
        }
    });
    return taken;
}

function normalizeRosterMatchKey(name) {
    return String(name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

function namesMatchForRoster(inputName, rosterName) {
    const typed = normalizeRosterMatchKey(inputName);
    const roster = normalizeRosterMatchKey(rosterName);
    if (!typed || !roster) return false;
    return typed === roster || typed.includes(roster) || roster.includes(typed);
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizePlainText(value, maxLength = 500) {
    let safe = String(value ?? "");
    safe = safe.replace(/\u0000/g, "").trim();
    if (Number.isFinite(maxLength) && maxLength > 0) {
        safe = safe.slice(0, maxLength);
    }
    return safe;
}

function renderRoomIdOnly(container, roomIdValue) {
    if (!container) return;
    container.replaceChildren();
    const idLine = document.createElement("div");
    idLine.style.fontSize = "11px";
    idLine.style.opacity = "0.8";
    idLine.style.fontWeight = "bold";
    idLine.textContent = `ID: ${sanitizePlainText(roomIdValue, 120)}`;
    container.appendChild(idLine);
}

function renderRoomNameAndId(container, roomNameValue, roomIdValue) {
    if (!container) return;
    container.replaceChildren();

    const roomNameLine = document.createElement("div");
    roomNameLine.style.fontWeight = "bold";
    roomNameLine.textContent = sanitizePlainText(roomNameValue || "Mi Salón", 180);

    const idLine = document.createElement("div");
    idLine.style.fontSize = "10px";
    idLine.style.opacity = "0.7";
    idLine.textContent = `ID: ${sanitizePlainText(roomIdValue, 120)}`;

    container.append(roomNameLine, idLine);
}

function normalizeStudentCredentialEntry(entry = {}, fallbackName = '', fallbackIndex = 0) {
    const name = normalizeDisplayNameCandidate(entry?.name || fallbackName);
    if (!name) return null;
    const password = String(entry?.password || '').trim().toUpperCase();
    const baseKey = normalizeRosterMatchKey(name).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || `alumno_${fallbackIndex + 1}`;
    const id = String(entry?.id || `stu_${baseKey}`).trim() || `stu_${baseKey}`;
    return { id, name, password };
}

function extractStudentCredentials(roomData = {}) {
    const credentialEntries = Array.isArray(roomData?.studentCredentials) ? roomData.studentCredentials : [];
    const normalizedFromCredentials = credentialEntries
        .map((entry, index) => normalizeStudentCredentialEntry(entry, entry?.name, index))
        .filter((entry) => entry && entry.name);
    if (normalizedFromCredentials.length) {
        return normalizedFromCredentials;
    }
    const rawNames = Array.isArray(roomData?.studentList) ? roomData.studentList : [];
    return rawNames
        .map((name, index) => normalizeStudentCredentialEntry({ name }, name, index))
        .filter((entry) => entry && entry.name);
}

function extractStudentNames(roomData = {}) {
    return extractStudentCredentials(roomData).map((entry) => entry.name).filter(Boolean);
}

function createShortUniqueCode(used = new Set(), length = 4) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 200; attempt += 1) {
        let next = '';
        for (let i = 0; i < length; i += 1) {
            next += alphabet[Math.floor(Math.random() * alphabet.length)];
        }
        if (!used.has(next)) return next;
    }
    let fallback = '';
    do {
        fallback = Math.random().toString(36).slice(2, 2 + Math.max(4, length)).toUpperCase();
    } while (used.has(fallback));
    return fallback;
}

function createUniqueStudentCredentialId(name, usedIds = new Set()) {
    const base = normalizeRosterMatchKey(name).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'alumno';
    let candidate = `stu_${base}`;
    let suffix = 2;
    while (usedIds.has(candidate)) {
        candidate = `stu_${base}_${suffix}`;
        suffix += 1;
    }
    return candidate;
}

function buildStudentCredentialEntries(rawNames = [], existingEntries = []) {
    const uniqueNames = [];
    const seenNames = new Set();
    rawNames.forEach((name) => {
        const normalized = normalizeDisplayNameCandidate(name);
        const key = normalizeRosterMatchKey(normalized);
        if (!normalized || seenNames.has(key)) return;
        seenNames.add(key);
        uniqueNames.push(normalized);
    });

    const existingByName = new Map();
    const usedPasswords = new Set();
    const usedIds = new Set();
    existingEntries.forEach((entry, index) => {
        const normalized = normalizeStudentCredentialEntry(entry, entry?.name, index);
        if (!normalized) return;
        const key = normalizeRosterMatchKey(normalized.name);
        if (!existingByName.has(key)) {
            existingByName.set(key, normalized);
        }
        if (normalized.password) usedPasswords.add(normalized.password);
        if (normalized.id) usedIds.add(normalized.id);
    });

    return uniqueNames.map((name) => {
        const key = normalizeRosterMatchKey(name);
        const existing = existingByName.get(key);
        if (existing && existing.password) {
            return {
                id: existing.id,
                name,
                password: existing.password
            };
        }
        const password = createShortUniqueCode(usedPasswords, 4);
        usedPasswords.add(password);
        const id = existing?.id && !usedIds.has(existing.id)
            ? existing.id
            : createUniqueStudentCredentialId(name, usedIds);
        usedIds.add(id);
        return { id, name, password };
    });
}

function getStudentCredentialByPassword(roomData = {}, password = '') {
    const normalizedPassword = String(password || '').trim().toUpperCase();
    if (!normalizedPassword) return null;
    return extractStudentCredentials(roomData).find((entry) => String(entry.password || '').trim().toUpperCase() === normalizedPassword) || null;
}

function getStudentCredentialPlayerId(roomId, credential = {}) {
    const safeRoom = String(roomId || '').trim().toUpperCase() || 'ROOM';
    const safeId = String(credential?.id || '').trim() || 'student';
    return `student_${safeRoom}_${safeId}`;
}

function getStudentAvatarStorageKey(roomId, credentialId) {
    return `mineblox_student_avatar_${String(roomId || '').trim().toUpperCase()}_${String(credentialId || '').trim()}`;
}

function getTeacherAccessPanelHtml(roomData = {}) {
    const teacherCode = String(currentRoomId || '').trim().toUpperCase();
    const studentCode = `A-${teacherCode}`;
    return `
        <div style="font-weight:bold; color:#fbbf24; font-size:14px; white-space:nowrap;">#SALA: ${escapeHtml(roomName || teacherCode)}</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:6px;">
            <button class="mineblox-badge-btn" data-copy-value="${escapeHtml(teacherCode)}">🔑 Maestro</button>
            <button class="mineblox-badge-btn" data-copy-value="${escapeHtml(studentCode)}" style="color:#34d399; border-color:rgba(52,211,153,0.4)">🎓 Alumno</button>
        </div>
        <div style="margin-top:8px; font-size:11px; color:#cbd5e1;">Las contraseñas de alumnos están en Ajustes del Aula.</div>
    `;
}

function promptForAccessValue({
    title = 'Continuar',
    description = '',
    placeholder = '',
    confirmLabel = 'Aceptar',
    cancelLabel = 'Cancelar',
    defaultValue = '',
    inputType = 'text'
} = {}) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'mineblox-modal';
        modal.innerHTML = `
            <div class="mineblox-modal-content" style="width:420px; color:#111827">
                <h3 style="margin-top:0">${escapeHtml(title)}</h3>
                ${description ? `<p style="font-size:13px; color:#475569; margin:0 0 12px">${escapeHtml(description)}</p>` : ''}
                <input type="${escapeHtml(inputType)}" id="sessionAccessPromptInput" class="mineblox-input" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(defaultValue)}" style="margin-bottom:12px; color:#000">
                <div style="display:flex; gap:10px">
                    <button class="lecturas-game-pixel-btn is-primary" id="sessionAccessPromptConfirm" style="flex:1">${escapeHtml(confirmLabel)}</button>
                    <button class="lecturas-game-pixel-btn" id="sessionAccessPromptCancel" style="flex:1; background:#6b7280">${escapeHtml(cancelLabel)}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        const input = modal.querySelector('#sessionAccessPromptInput');
        const cleanup = (value = null) => {
            modal.remove();
            resolve(value);
        };
        modal.querySelector('#sessionAccessPromptConfirm')?.addEventListener('click', () => {
            const value = String(input?.value || '').trim();
            if (!value) {
                alert('Completa el campo para continuar.');
                return;
            }
            cleanup(value);
        });
        modal.querySelector('#sessionAccessPromptCancel')?.addEventListener('click', () => cleanup(null));
        modal.addEventListener('click', (event) => {
            if (event.target === modal) cleanup(null);
        });
        input?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                modal.querySelector('#sessionAccessPromptConfirm')?.click();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                cleanup(null);
            }
        });
        setTimeout(() => input?.focus?.(), 0);
    });
}

function promptForSessionName({
    title = '¿Cómo te llamas?',
    description = '',
    placeholder = 'Escribe tu nombre',
    confirmLabel = 'Continuar',
    cancelLabel = 'Cancelar',
    defaultValue = ''
} = {}) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'mineblox-modal';
        modal.innerHTML = `
            <div class="mineblox-modal-content" style="width:420px; color:#111827">
                <h3 style="margin-top:0">${title}</h3>
                ${description ? `<p style="font-size:13px; color:#475569; margin:0 0 12px">${description}</p>` : ''}
                <input type="text" id="sessionNamePromptInput" class="mineblox-input" placeholder="${placeholder}" value="${String(defaultValue || '').replace(/"/g, '&quot;')}" style="margin-bottom:12px; color:#000">
                <div style="display:flex; gap:10px">
                    <button class="lecturas-game-pixel-btn is-primary" id="sessionNamePromptConfirm" style="flex:1">${confirmLabel}</button>
                    <button class="lecturas-game-pixel-btn" id="sessionNamePromptCancel" style="flex:1; background:#6b7280">${cancelLabel}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        const input = modal.querySelector('#sessionNamePromptInput');
        const cleanup = (value = null) => {
            modal.remove();
            resolve(value);
        };
        modal.querySelector('#sessionNamePromptConfirm')?.addEventListener('click', () => {
            const value = String(input?.value || '').trim();
            if (!value) {
                alert('Escribe un nombre para continuar.');
                input?.focus?.();
                return;
            }
            cleanup(value);
        });
        modal.querySelector('#sessionNamePromptCancel')?.addEventListener('click', () => cleanup(null));
        modal.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                modal.querySelector('#sessionNamePromptConfirm')?.click();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                cleanup(null);
            }
        });
        setTimeout(() => input?.focus?.(), 0);
    });
}

// UI Elements (created dynamically)
let uiContainer = null;
let reassignPlayersCache = [];

export async function initASCraft() {
    document.body.style.backgroundColor = `#${INITIAL_SCENE_SKY_COLOR.toString(16).padStart(6, '0')}`;
    // Load Three.js directly, skipping core generic runtime
    THREE = await import("./vendor/three/three.module.js");
    playerViewMode = (() => {
        try {
            const storedMode = localStorage.getItem('minebloxViewMode');
            return PLAYER_VIEW_MODES.includes(storedMode) ? storedMode : 'first';
        } catch (_) {
            return 'first';
        }
    })();

    // Initialize textures after THREE is ready
    textureLoader = new THREE.TextureLoader();
    initVoxelTextures();
    TEXTURES.whiteboard = createWhiteboardFallbackTexture();

    // Initialize Firestore for multiplayer
    db = window.cbFirestore || null;
    if (!db) {
        let app = window.cbFirebaseApp || (getApps().length > 0 ? getApps()[0] : null);
        if (!app) {
            app = initializeApp(firebaseWebConfig);
        }
        db = getFirestore(app);
        auth = getAuth(app);
    } else {
        const app = window.cbFirebaseApp || (getApps().length > 0 ? getApps()[0] : null);
        if (app) auth = getAuth(app);
    }

    const app = window.cbFirebaseApp || (getApps().length > 0 ? getApps()[0] : null);
    const resolvedUser = app ? await ensureMinebloxAuthenticatedUser(app) : null;
    const uid = String(resolvedUser?.uid || '').trim();
    if (!uid) {
        throw new Error("No se pudo resolver un usuario autenticado para Mineblox.");
    }

    currentUserId = uid;
    try {
        localStorage.setItem("minebloxPersistentId", uid);
    } catch (_) { }
    loadSpawnPersistencePreference();

    // Load CSS
    if (!document.getElementById('mineblox-css')) {
        const link = document.createElement('link');
        link.id = 'mineblox-css';
        link.rel = 'stylesheet';
        link.href = './lecturasGame-mineblox.css';
        document.head.appendChild(link);
    }

    if (USE_VOXELJS_ENGINE) {
        ensureWebGameHooks();
        createUI();
        applyVoxelJsUiOverrides();
        const runtime = await ensureVoxelJsRuntime();
        runtime?.setInputEnabled?.(false);
        if (ASCRAFT_AUTO_RESTORE_SESSION) {
            window.setTimeout(() => {
                restoreActiveSession().catch((error) => {
                    console.warn('[ASCraft] Restauración diferida falló:', error);
                    setLobbyBusyState(false);
                });
            }, 0);
        }
        return;
    }

    movementController = createASCraftMovementController(THREE, {
        syncState: syncMovementStateFromController
    });
    collisionBroadphase = createASCraftCollisionBroadphase({ cellSize: 6 });
    skyLightingRuntime = createSkyLightingRuntime({ THREE });
    ensureWebGameHooks();
    publishMovementDebugState();
    if (!movementVisibilityBound && typeof document !== "undefined") {
        document.addEventListener("visibilitychange", handleMovementVisibilityChange);
        movementVisibilityBound = true;
    }
    shouldDiscardNextMovementDelta = true;

    await setupScene(THREE);
    setupControls(THREE);
    createUI();
    animate();
    if (ASCRAFT_AUTO_RESTORE_SESSION) {
        window.setTimeout(() => {
            restoreActiveSession().catch((error) => {
                console.warn('[ASCraft] Restauración diferida falló:', error);
                setLobbyBusyState(false);
            });
        }, 0);
    }
}

async function restoreActiveSession() {
    const saved = readActiveSession();
    if (!saved) return false;
    setLobbyBusyState(true, 'Restaurando sesión...');

    const code = String(saved.roomId || '').trim().toUpperCase();
    if (!code) {
        setLobbyBusyState(false);
        return false;
    }

    try {
        const roomRef = doc(db, "mineblox_rooms", code);
        const roomSnap = await getDoc(roomRef);
        if (!roomSnap.exists()) {
            clearActiveSession();
            setLobbyBusyState(false);
            return false;
        }

        const roomData = roomSnap.data() || {};
        const savedName = String(saved.name || '').trim();
        const savedAvatar = String(saved.avatarId || '').trim();
        const savedSpawnEnabled = Boolean(saved.spawnPersistenceEnabled);
        spawnPersistenceEnabled = savedSpawnEnabled;
        try { localStorage.setItem(SPAWN_PERSISTENCE_ENABLED_KEY, spawnPersistenceEnabled ? '1' : '0'); } catch (_) { }
        const savedBody = String(saved.activeCelestialBody || 'earth').trim().toLowerCase();
        const savedSpaceBodyId = String(saved.currentSpaceBodyId || 'moon').trim().toLowerCase();
        activeCelestialBody = savedSpawnEnabled && savedBody === 'space' ? 'space' : 'earth';
        currentSpaceBodyId = savedSpaceBodyId || 'moon';

        if (saved.isTeacher) {
            currentRoomId = code;
            isTeacher = true;
            currentSessionKind = SESSION_KIND_TEACHER;
            playerConfig.name = roomData.teacherName || savedName || 'Profesor';
            playerConfig.avatarId = 'scientist';
            roomName = roomData.roomName || roomName || '';
            syncSkyCycleFromRoomData(roomData);
            applyRecessStateFromRoom(roomData);
            persistActiveSession();
            setLobbyBusyState(true, 'Abriendo salón...');
            await enterLobby();
            return true;
        }

        if (saved.isGuest) {
            const guestId = readGuestSessionId(code);
            if (!guestId) {
                clearActiveSession();
                setLobbyBusyState(false);
                return false;
            }
            currentUserId = guestId;
            currentSessionKind = SESSION_KIND_GUEST;
            const guestPlayerRef = doc(db, "mineblox_rooms", code, "players", guestId);
            const guestSnap = await getDoc(guestPlayerRef);
            if (guestSnap.exists() && guestSnap.data()?.forceLogout) {
                clearGuestSessionId(code);
                clearActiveSession();
                setLobbyBusyState(false);
                return false;
            }
        }

        const storedStudentName = savedName || localStorage.getItem(`mineblox_name_${code}`) || '';
        const storedStudentAvatar = savedAvatar || localStorage.getItem(`mineblox_avatar_${code}`) || '';
        if (!storedStudentName || !storedStudentAvatar) {
            setLobbyBusyState(false);
            return false;
        }

        const takenByAnother = await isPlayerNameTakenInRoom(code, storedStudentName, currentUserId);
        if (takenByAnother) {
            currentRoomId = code;
            isTeacher = false;
            roomName = roomData.roomName || roomName || '';
            setLobbyBusyState(false);
            return false;
        }

        currentRoomId = code;
        isTeacher = false;
        currentSessionKind = saved.isGuest ? SESSION_KIND_GUEST : SESSION_KIND_STUDENT;
        playerConfig.name = storedStudentName;
        playerConfig.avatarId = storedStudentAvatar;
        roomName = roomData.roomName || roomName || '';
        syncSkyCycleFromRoomData(roomData);
        applyRecessStateFromRoom(roomData);
        persistActiveSession();
        setLobbyBusyState(true, 'Abriendo salón...');
        await enterLobby();
        return true;
    } catch (error) {
        console.warn('[ASCraft] No se pudo restaurar la sesión activa:', error);
        setLobbyBusyState(false);
        return false;
    }
}

async function setupScene(THREE) {
    initPerformanceMonitoring();
    scene = new THREE.Scene();
    scene.background = null;
    scene.fog = null;
    cloudScratchState.planetCenter = new THREE.Vector3();
    cloudScratchState.position = new THREE.Vector3();
    cloudScratchState.normal = new THREE.Vector3();
    cloudScratchState.tangent = new THREE.Vector3();
    cloudScratchState.bitangent = new THREE.Vector3();
    cloudScratchState.fallbackUp = new THREE.Vector3(0, 1, 0);
    cloudScratchState.basis = new THREE.Matrix4();
    weatherScratchState.planetCenter = new THREE.Vector3(0, -OUTDOOR_WORLD_RADIUS, 0);
    weatherScratchState.cameraPlanetUp = new THREE.Vector3();
    weatherScratchState.localTangentX = new THREE.Vector3();
    weatherScratchState.localTangentZ = new THREE.Vector3();
    weatherScratchState.worldPos = new THREE.Vector3();
    weatherScratchState.fallDirection = new THREE.Vector3();
    weatherScratchState.respawnLocal = new THREE.Vector3();

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 4000);
    camera.position.copy(getLobbySpawnPosition());
    playerWorldPosition = camera.position.clone();

    renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
        powerPreference: 'high-performance'
    });
    renderer.setClearColor(INITIAL_SCENE_SKY_COLOR, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.96;
    renderer.physicallyCorrectLights = true;
    const scenePreset = getActiveScenePresetConfig();
    if (scenePreset.heroLightingProfile === 'cinematic_voxel') {
        renderer.toneMappingExposure = 1.03;
    }
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    currentPerformanceTier = performanceModeOverride === 'auto' ? performanceAutoTier : performanceModeOverride;
    performanceDebugState.currentTier = currentPerformanceTier;
    performanceDebugState.autoTier = performanceAutoTier;
    performanceDebugState.modeOverride = performanceModeOverride;
    renderer.domElement.id = 'minebloxCanvas';
    renderer.domElement.classList.add('mineblox-render-surface');
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = 0;
    renderer.domElement.style.left = 0;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.pointerEvents = 'auto';
    renderer.domElement.style.userSelect = 'none';
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.webkitUserSelect = 'none';
    renderer.domElement.style.webkitTouchCallout = 'none';
    renderer.domElement.style.zIndex = '5'; // WebGL Base layer

    cssScene = new THREE.Scene();

    const container = document.getElementById('lecturasGameCanvasContainer') || document.body;
    gameContainer = container;
    document.body.style.backgroundColor = `#${INITIAL_SCENE_SKY_COLOR.toString(16).padStart(6, '0')}`;
    container.innerHTML = '';
    container.classList.add('mineblox-container');
    container.style.position = 'relative';
    container.style.backgroundColor = `#${INITIAL_SCENE_SKY_COLOR.toString(16).padStart(6, '0')}`;

    // Order: WebGL behind, CSS video layer loads only when needed.
    container.appendChild(renderer.domElement);
    updateRenderSurfaceSize();

    // Window resize handling
    window.addEventListener('resize', () => {
        updateRenderSurfaceSize();
    });

    ambientLight = new THREE.AmbientLight(0xc8d9ee, 0.22);
    scene.add(ambientLight);

    hemisphereLight = new THREE.HemisphereLight(0xb7cff0, 0x2f241c, 0.28);
    scene.add(hemisphereLight);

    sunLight = new THREE.DirectionalLight(0xffffff, 1.34); // Increased for "Shader" look
    sunLight.position.set(500, 800, 500);
    sunLight.castShadow = true;
    if (sunLight.shadow) {
        sunLight.shadow.autoUpdate = true;
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.camera.near = 1;
        sunLight.shadow.camera.far = 720;
        sunLight.shadow.camera.left = -44;
        sunLight.shadow.camera.right = 44;
        sunLight.shadow.camera.top = 44;
        sunLight.shadow.camera.bottom = -44;
        sunLight.shadow.bias = -0.00015;
        sunLight.shadow.normalBias = 0.024;
        sunLight.shadow.radius = 3.0;
    }
    scene.add(sunLight);
    scene.add(sunLight.target);

    moonLight = new THREE.DirectionalLight(0xcfe8ff, 0.02);
    moonLight.position.set(-60, 80, -40);
    moonLight.castShadow = false;
    if (moonLight.shadow) {
        moonLight.shadow.autoUpdate = false;
    }
    moonLight.target.position.set(0, 0, 0);
    scene.add(moonLight);
    scene.add(moonLight.target);

    starLight = new THREE.DirectionalLight(0xaecbff, 0.01);
    starLight.position.set(35, 120, -52);
    starLight.castShadow = false;
    if (starLight.shadow) {
        starLight.shadow.autoUpdate = false;
    }
    starLight.target.position.set(0, 0, 0);
    scene.add(starLight);
    scene.add(starLight.target);

    skySystem = null;
    applyPerformanceTier(currentPerformanceTier, { force: true });

    classroomLights = [];

    // The room shell and planet are built locally; keep the doorway mesh as the interactive overlay.
    roomDoor = createDoorAssembly(0x8b4513, {
        width: 2.0,
        height: 4.0,
        thickness: 0.12,
        hingeSide: 'left'
    });
    roomDoor.position.set(0, 0, ROOM_DEPTH / 2);
    roomDoor.userData.isRoomDoor = true;
    roomDoor.userData.roomDoorPersistedOpen = false;
    scene.add(roomDoor);

    localPlayerMesh = createVoxelPlayerModel(playerConfig.avatarId || 'boy_basic', playerConfig.name || '');
    localPlayerMesh.visible = false;
    scene.add(localPlayerMesh);

    earthLaunchPad = null;
    earthRocketShuttle = null;
    moonRocketShuttle = null;

    // Classroom Lights (Visible fixtures below the ceiling)
    const lampChainGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.55, 10);
    const lampChainMat = new THREE.MeshStandardMaterial({
        color: 0x6b7280,
        roughness: 0.45,
        metalness: 0.2
    });
    const lampBulbGeo = new THREE.SphereGeometry(0.32, 16, 16);
    const lampBulbMat = new THREE.MeshStandardMaterial({
        color: 0xfff3cc,
        emissive: 0xffdca8,
        emissiveIntensity: 1.35,
        roughness: 0.22,
        metalness: 0.0
    });
    const lightPositions = [
        [-8, ROOM_HEIGHT - 0.15, -8],
        [8, ROOM_HEIGHT - 0.15, -8],
        [-8, ROOM_HEIGHT - 0.15, 8],
        [8, ROOM_HEIGHT - 0.15, 8]
    ];
    lightPositions.forEach(pos => {
        const lampY = ROOM_HEIGHT - 1.35;
        const lampGroup = new THREE.Group();
        lampGroup.position.set(pos[0], lampY, pos[2]);
        const chain = new THREE.Mesh(lampChainGeo, lampChainMat);
        chain.position.y = 0.2;
        lampGroup.add(chain);
        const bulb = new THREE.Mesh(lampBulbGeo, lampBulbMat);
        bulb.position.y = -0.45;
        lampGroup.add(bulb);
        markRaycastIgnored(lampGroup);
        scene.add(lampGroup);

        // Decorative fixture only; no local light in solar-only lighting mode.
    });

    velocity = new THREE.Vector3();
    direction = new THREE.Vector3();
    clock = new THREE.Clock();
    shouldDiscardNextMovementDelta = true;
    playerYaw = 0;
    playerPitch = 0;
    lookTargetYaw = playerYaw;
    lookTargetPitch = playerPitch;

    // Initial rotation order for FPS
    camera.rotation.order = 'YXZ';

    // Hybrid Controls Initialization (Mobile + Desktop)
    setupHybridControls();

    syncSkyCycleFromRoomData(roomTimeSettings || getDefaultRoomTimeSettings());
}

/**
 * Custom Virtual Joystick and Multi-Touch Look System
 * Inspired by Roblox/Minecraft mobile controls
 */
function setupHybridControls() {
    movementController?.bindControls({
        canvas: renderer?.domElement,
        document,
        window,
        ensureAudioContext,
        onToggleSeatedStateFromCrosshair: toggleSeatedStateFromCrosshair,
        onTogglePlayerViewMode: togglePlayerViewMode,
        onTapInteraction: () => handleCrosshairActivation({ allowPlacement: false, allowDoorToggle: true }),
        setCameraRotationOrder: (order) => {
            if (camera) camera.rotation.order = order;
        }
    });
}

function setupControls(THREE) {
    if (camera) camera.rotation.order = 'YXZ';
}

function createUI() {
    uiContainer = document.createElement('div');
    uiContainer.className = 'mineblox-ui mineblox-ui--lobby';

    // Load recent rooms
    const recent = JSON.parse(localStorage.getItem('minebloxRecentRooms') || '[]');
    const recentHtml = recent.map((r) => {
        const safeRecent = escapeHtml(r);
        return `<button class="mineblox-recent-badge" data-room-code="${safeRecent}">${safeRecent}</button>`;
    }).join('');

    uiContainer.innerHTML = `
        <div class="mineblox-lobby" id="minebloxLobby">
            <h2>ASCRAFT</h2>
            <p>Bienvenido al Salón Digital</p>
            <div class="mineblox-recent-rooms">
                <small>Recientes: </small>${recentHtml}
            </div>
            <input type="text" id="minebloxRoomCode" placeholder="CÓDIGO (ex: 123456 o A-123456)" maxlength="10">
            <button class="lecturas-game-pixel-btn is-primary" id="minebloxJoinBtn">Entrar al Salón</button>
            <hr>
            <button class="lecturas-game-pixel-btn" id="minebloxCreateBtn">Crear Salón Nuevo (Maestro)</button>
            <br><br>
            <button class="lecturas-game-pixel-btn" id="minebloxBackBtn" style="background:#ef4444; border-color:#991b1b">Volver al Menú</button>
        </div>
        <div class="mineblox-hud" id="minebloxHUD" style="display:none;">
             <div id="footerLeft" style="display:flex; align-items:center; gap:25px; flex-wrap:wrap;">
                  <div class="mineblox-level-badge" id="roomLevelBadge" style="margin:0">LVL 1</div>
                  <div id="minebloxStatus" style="font-weight:bold; color:#10b981; font-size:11px;">● Online</div>
                  <div id="minebloxRoomId" style="display:flex; align-items:center; gap:8px"></div>
                  <div id="minebloxUserName" style="font-size:11px; opacity:0.8; margin-left:15px; border-left:1px solid rgba(255,255,255,0.2); padding-left:15px;"></div>
                  <div id="minebloxPlayerCoords" style="font-size:11px; opacity:0.82; font-family:monospace; letter-spacing:0.02em; margin-left:15px; border-left:1px solid rgba(255,255,255,0.2); padding-left:15px;">XYZ 0, 0, 0</div>
                  <div id="minebloxSeason" style="font-size:11px; font-weight:bold; letter-spacing:0.05em; margin-left:15px; border-left:1px solid rgba(255,255,255,0.2); padding-left:15px; color:#fbbf24;">ESTACIÓN: ...</div>
                  <div id="minebloxRecessStatus" style="display:none; font-size:11px; font-weight:bold; letter-spacing:0.05em; margin-left:15px; border-left:1px solid rgba(255,255,255,0.2); padding-left:15px; color:#93c5fd;">Recreo automático</div>
             </div>
        </div>

        <!-- Fixed Top Right Menu -->
        <div id="unifiedMenuWrapper" style="display:none; position:fixed; top:20px; right:20px; z-index:5000;">
             <button class="mineblox-toolbar-btn" id="unifiedMenuBtn" style="background:#fbbf24; border:2px solid #b45309; box-shadow:0 3px 0 #b45309; border-radius:30px; padding:10px 25px; font-weight:800; font-size:16px;">☰ MENÚ</button>
             <div id="unifiedDropdown" class="mineblox-teacher-dropdown" style="display:none; position:absolute; top:55px; right:0; min-width:320px; z-index:5100; box-shadow:0 10px 35px rgba(0,0,0,0.6);">
                  <!-- Options injected in enterLobby -->
             </div>
        </div>

        <div id="minebloxActionStack" class="mineblox-action-stack" style="display:none;">
             <button type="button" class="mineblox-action-stack__toggle" id="actionStackToggleBtn" aria-label="Abrir menú de acciones" title="Menú">
                  <span class="mineblox-action-icon"><i class="bx bx-plus"></i></span>
             </button>
             <div class="mineblox-action-stack__actions" id="actionStackButtons">
                  <button type="button" class="mineblox-action-btn mineblox-action-btn--mic" id="micBtn" aria-label="Hablar" title="Hablar" style="display:none;">
                       <span class="mineblox-action-icon"><i class="bx bx-microphone"></i></span>
                       <span class="mineblox-action-label" id="micBtnText">Hablar</span>
                  </button>
                  <button type="button" class="mineblox-action-btn mineblox-action-btn--inventory" id="viewModeBtn" aria-label="Ver en tercera persona" title="Ver en tercera persona" style="display:none;">
                       <span class="mineblox-action-icon"><i class="bx bx-cube"></i></span>
                       <span class="mineblox-action-label">3ª Persona</span>
                  </button>
                  <button type="button" class="mineblox-action-btn mineblox-action-btn--inventory" id="spawnPersistBtn" aria-label="Guardar ubicación" title="Guardar ubicación" aria-pressed="false" style="display:none;">
                       <span class="mineblox-action-icon"><i class="bx bx-map-pin"></i></span>
                       <span class="mineblox-action-label" id="spawnPersistBtnLabel">Lugar: OFF</span>
                  </button>
                  <button type="button" class="mineblox-action-btn mineblox-action-btn--inventory" id="photoCaptureBtn" aria-label="Tomar foto" title="Tomar foto" style="display:none;">
                       <span class="mineblox-action-icon"><i class="bx bx-camera"></i></span>
                       <span class="mineblox-action-label">Foto</span>
                  </button>
                  <button type="button" class="mineblox-action-btn mineblox-action-btn--chat" id="toolbarChatToggle" aria-label="Chat del salón" title="Chat del salón" style="display:none;">
                       <span class="mineblox-action-icon"><i class="bx bx-message-rounded-dots"></i></span>
                       <span class="mineblox-action-label" id="toolbarChatToggleLabel">Chat</span>
                  </button>
                  <button type="button" class="mineblox-action-btn mineblox-action-btn--chat" id="studentChatToggle" aria-label="Chat del salón" title="Chat del salón" style="display:none;">
                       <span class="mineblox-action-icon"><i class="bx bx-message-rounded-dots"></i></span>
                       <span class="mineblox-action-label" id="studentChatToggleLabel">Chat</span>
                  </button>
                  <button type="button" class="mineblox-action-btn mineblox-action-btn--board" id="toolbarWB" aria-label="Control Pizarrón" title="Control Pizarrón" style="display:none;">
                       <span class="mineblox-action-icon"><i class="bx bx-chalkboard"></i></span>
                       <span class="mineblox-action-label">Pizarrón</span>
                  </button>
                  <button type="button" class="mineblox-action-btn mineblox-action-btn--reward" id="toolbarReward" aria-label="Premiar alumno" title="Premiar alumno" style="display:none;">
                       <span class="mineblox-action-icon"><i class="bx bx-gift"></i></span>
                       <span class="mineblox-action-label">Premio</span>
                  </button>
                   <button type="button" class="mineblox-action-btn mineblox-action-btn--map" id="toolbarMap" aria-label="Abrir Mapa" title="Mapa">
                        <span class="mineblox-action-icon"><i class="bx bx-map"></i></span>
                        <span class="mineblox-action-label">Mapa</span>
                   </button>
                   <button type="button" class="mineblox-action-btn mineblox-action-btn--inventory" id="toolbarRocket" aria-label="Abrir selector del cohete" title="Cohete">
                        <span class="mineblox-action-icon"><i class="bx bx-rocket"></i></span>
                        <span class="mineblox-action-label">Cohete</span>
                   </button>
             </div>
        </div>

        <!-- Map HUD Overlay -->
        <div id="minebloxMapHUD" class="mineblox-map-hud-overlay" style="display:none;">
             <div class="mineblox-map-frame">
                  <h3 class="mineblox-map-header">MAPA DIGITAL</h3>
                  <div class="mineblox-map-canvas-container">
                       <canvas id="minebloxMapCanvas" width="560" height="560"></canvas>
                  </div>
                  <div class="mineblox-map-footer">
                       <p>Toca el mapa para teletransportarte</p>
                       <button id="closeMapBtn" class="mineblox-map-close-btn">CERRAR MAPA</button>
                  </div>
             </div>
        </div>

        <div class="mineblox-chat-container" id="minebloxChat" style="display:none; bottom:80px; left:20px; z-index:3000;">
             <div class="mineblox-chat-messages" id="chatMsgs"></div>
             <form class="mineblox-chat-input-area" id="chatForm">
                  <input type="text" class="mineblox-chat-input" id="chatInput" placeholder="Enter para chatear..." maxlength="100">
             </form>
        </div>
        
        <div class="mineblox-inv-bar" id="minebloxInvBar" style="display:none" aria-label="Barra rápida de inventario">
            <div class="mineblox-inv-bar-slots" id="minebloxInvBarSlots"></div>
        </div>
        <button class="mineblox-toolbar-btn" id="minebloxCraftOpenBtn" style="display:none; position:fixed; bottom:90px; right:20px; z-index:40; background:#f59e0b; color:white;">⚒️ Crafteo</button>
        
        <div class="mineblox-modal" id="minebloxCraftModal" style="display:none">
            <div class="mineblox-modal-content" style="background:#c6c6c6; border:4px solid #373737; color:#333">
                <h3 style="color:#111">Mesa de Crafteo (3x3)</h3>
                <div class="mineblox-crafting-3x3" id="minebloxCraftGrid">
                    ${Array(9).fill(0).map((_, i) => `<div class="mineblox-craft-slot" data-idx="${i}" data-mineblox-action="select-craft-slot"></div>`).join('')}
                </div>
                <div id="craftResult" style="margin:10px; font-weight:bold; height:30px"></div>
                <button class="lecturas-game-pixel-btn is-primary" style="width:100%" data-mineblox-action="do-craft">⚒️ Crear Item</button>
                <button class="lecturas-game-pixel-btn" style="background:#666; width:100%; margin-top:10px" data-mineblox-action="close-craft-modal">Cerrar</button>
            </div>
        </div>
        <div class="mineblox-library-modal" id="minebloxLibModal" style="display:none">
            <div class="mineblox-lib-content">
                <header>
                    <h3>Inventario</h3>
                    <button class="mineblox-close-lib" data-mineblox-action="close-library">×</button>
                </header>
                <div class="mineblox-lib-tabs">
                    <button class="active" data-mineblox-action="library-filter" data-mineblox-filter="all">Todos</button>
                    <button data-mineblox-action="library-filter" data-mineblox-filter="build">Bloques</button>
                    <button data-mineblox-action="library-filter" data-mineblox-filter="furniture">Muebles</button>
                    <button data-mineblox-action="library-filter" data-mineblox-filter="decor">Decoración</button>
                </div>
                <div class="mineblox-lib-grid" id="minebloxLibGrid"></div>
            </div>
        </div>
        <div class="mineblox-modal" id="minebloxPhotoModal" style="display:none">
            <div class="mineblox-modal-content" style="max-width:420px; background:linear-gradient(180deg,#ddefff 0%,#eef5ff 100%); color:#0f172a; border:4px solid #0f172a;">
                <h3 style="margin-top:0;">Foto cinemática</h3>
                <p style="font-size:13px; line-height:1.45;">La captura guarda una vista limpia del juego, sin HUD y con encuadre mejorado.</p>
                <div style="display:grid; gap:10px;">
                    <button class="lecturas-game-pixel-btn is-primary" id="minebloxPhotoPersonalBtn">Guardar para mí</button>
                    <button class="lecturas-game-pixel-btn" id="minebloxPhotoSharedBtn" style="background:#0ea5e9; border-color:#075985; color:#fff;">Compartir con el salón</button>
                    <button class="lecturas-game-pixel-btn" id="minebloxPhotoCancelBtn" style="background:#64748b; border-color:#334155; color:#fff;">Cancelar</button>
                </div>
                <div id="minebloxPhotoStatus" style="margin-top:10px; font-size:12px; color:#334155;"></div>
            </div>
        </div>
        <div class="mineblox-modal" id="minebloxGalleryModal" style="display:none">
            <div class="mineblox-modal-content" style="position:relative; width:min(1040px,92vw); max-height:88vh; overflow:hidden; background:#f8fafc; color:#0f172a; border:4px solid #0f172a; display:flex; flex-direction:column;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px;">
                    <h3 style="margin:0;">Galería</h3>
                    <button class="lecturas-game-pixel-btn" id="minebloxGalleryCloseBtn" style="background:#64748b; border-color:#334155; color:#fff;">Cerrar</button>
                </div>
                <div style="display:flex; gap:10px; margin-bottom:12px;">
                    <button class="lecturas-game-pixel-btn is-primary" id="minebloxGalleryTabShared">Compartidas</button>
                    <button class="lecturas-game-pixel-btn" id="minebloxGalleryTabPersonal">Mis fotos</button>
                </div>
                <div id="minebloxGalleryStatus" style="font-size:12px; color:#475569; margin-bottom:10px;">Cargando...</div>
                <div id="minebloxGalleryGrid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:12px; overflow:auto; padding:4px 2px 12px;"></div>
                <div id="minebloxGalleryViewer" style="display:none; position:absolute; inset:0; background:rgba(2,6,23,0.96); padding:20px; z-index:20; align-items:center; justify-content:center; flex-direction:column; gap:16px; backdrop-filter:blur(8px);">
                    <button id="minebloxGalleryViewerCloseBtn" style="position:absolute; top:20px; right:20px; width:44px; height:44px; border-radius:50%; background:#ef4444; color:#fff; border:none; cursor:pointer; font-size:24px; font-weight:bold; box-shadow:0 10px 25px rgba(239,68,68,0.4); display:flex; align-items:center; justify-content:center; z-index:21;">&times;</button>
                    <div style="flex:1; display:flex; align-items:center; justify-content:center; overflow:hidden; width:100%;">
                        <img id="minebloxGalleryViewerImage" alt="Captura ASCraft" style="max-width:100%; max-height:100%; object-fit:contain; border-radius:8px; box-shadow:0 30px 90px rgba(0,0,0,0.6);">
                    </div>
                    <div id="minebloxGalleryViewerMeta" style="color:#94a3b8; font-size:14px; text-align:center; padding:10px; background:rgba(255,255,255,0.05); border-radius:8px; width:100%; max-width:600px;"></div>
                </div>
            </div>
        </div>
        <div class="mineblox-modal mineblox-rocket-modal" id="rocketTravelModal" style="display:none">
            <div class="mineblox-modal-content mineblox-rocket-modal-content">
                <h3>Control de Cohete</h3>
                <p>Selecciona planeta destino.</p>
                <select id="rocketDestinationSelect" class="mineblox-input"></select>
                <div class="mineblox-rocket-actions">
                    <button class="lecturas-game-pixel-btn is-primary" id="rocketLaunchBtn">Iniciar Despegue</button>
                    <button class="lecturas-game-pixel-btn" id="rocketCancelBtn" style="background:#4b5563">Cancelar</button>
                </div>
            </div>
        </div>
        <div id="rocketLaunchOverlay" class="mineblox-rocket-overlay" style="display:none;">
            <div class="mineblox-rocket-overlay-window">
                <div class="mineblox-rocket-warp-lines"></div>
                <div class="mineblox-rocket-status" id="rocketLaunchStatus">3</div>
                <div class="mineblox-rocket-substatus" id="rocketLaunchSubstatus">Secuencia de lanzamiento</div>
            </div>
        </div>
        <div id="eclipseEventBanner" aria-live="polite" aria-hidden="true" style="display:none; position:fixed; top:18px; left:50%; transform:translateX(-50%); z-index:5200; min-width:320px; max-width:min(92vw, 620px); padding:12px 16px; border-radius:14px; border:1px solid rgba(255,245,190,0.45); background:linear-gradient(135deg, rgba(18,25,42,0.92), rgba(34,18,62,0.92)); box-shadow:0 14px 38px rgba(0,0,0,0.38); backdrop-filter: blur(6px);">
            <div id="eclipseEventTitle" style="font-weight:800; letter-spacing:0.04em; color:#fef3c7; font-size:12px; text-transform:uppercase;">Evento especial</div>
            <div id="eclipseEventCountdown" style="margin-top:4px; color:#e2e8f0; font-size:14px; font-family:'Radiora', monospace;">Cuenta regresiva: 0s</div>
        </div>
        <div class="mineblox-crosshair"></div>
    `;
    const container = document.getElementById('lecturasGameCanvasContainer') || document.body;
    container.appendChild(uiContainer);
    eclipseHudState.bannerEl = document.getElementById('eclipseEventBanner');
    eclipseHudState.titleEl = document.getElementById('eclipseEventTitle');
    eclipseHudState.countdownEl = document.getElementById('eclipseEventCountdown');
    setEclipseBannerState({ visible: false });
    updateCrosshairByViewMode();
    document.getElementById('minebloxPhotoCancelBtn')?.addEventListener('click', closePhotoModal);
    document.getElementById('minebloxPhotoPersonalBtn')?.addEventListener('click', () => captureAndUploadScreenshot('personal'));
    document.getElementById('minebloxPhotoSharedBtn')?.addEventListener('click', () => captureAndUploadScreenshot('shared'));
    document.getElementById('minebloxGalleryCloseBtn')?.addEventListener('click', closeGalleryModal);
    document.getElementById('minebloxGalleryViewerCloseBtn')?.addEventListener('click', closeGalleryViewer);
    document.getElementById('minebloxGalleryTabShared')?.addEventListener('click', () => {
        screenshotState.activeTab = 'shared';
        renderGalleryGrid();
    });
    document.getElementById('minebloxGalleryTabPersonal')?.addEventListener('click', () => {
        screenshotState.activeTab = 'personal';
        renderGalleryGrid();
    });

    // Ensure hidden by default
    document.getElementById('minebloxHUD').style.display = 'none';

    const codeInput = document.getElementById('minebloxRoomCode');
    if (!codeInput) return;
    const createBtn = document.getElementById('minebloxCreateBtn');
    const joinBtn = document.getElementById('minebloxJoinBtn');
    if (joinBtn) joinBtn.dataset.originalLabel = joinBtn.textContent;
    if (createBtn) createBtn.dataset.originalLabel = createBtn.textContent;

    uiContainer.addEventListener('click', (event) => {
        const copyBtn = event.target.closest?.('[data-copy-value]');
        if (copyBtn) {
            const value = String(copyBtn.getAttribute('data-copy-value') || '').trim();
            if (value) window.copyToClipboard(value);
            return;
        }

        const recentBtn = event.target.closest?.('.mineblox-recent-badge[data-room-code]');
        if (recentBtn && codeInput) {
            codeInput.value = String(recentBtn.getAttribute('data-room-code') || '').trim();
            updateButtons();
        }
    });

    const updateButtons = () => {
        if (document.getElementById('minebloxLobby')?.dataset?.busy === '1') return;
        const hasCode = codeInput.value.trim().length > 0;
        if (hasCode) {
            createBtn.textContent = '🚀 Entrar a este Salón';
            createBtn.style.background = '#3b82f6';
            joinBtn.style.display = 'none';
        } else {
            createBtn.textContent = 'Crear Salón Nuevo (Maestro)';
            createBtn.style.background = '';
            joinBtn.style.display = 'block';
        }
    };

    codeInput.oninput = updateButtons;

    document.getElementById('minebloxJoinBtn').onclick = () => {
        const code = codeInput.value;
        if (code) joinRoom(code);
    };

    document.getElementById('minebloxCreateBtn').onclick = () => {
        const code = codeInput.value.trim();
        if (code) {
            joinRoom(code);
        } else {
            createRoom();
        }
    };

    document.getElementById('minebloxBackBtn').onclick = () => {
        clearActiveSession();
        window.location.href = './lecturasGame.html';
    };

    const toolbar = document.getElementById('minebloxTeacherToolbar');
    if (toolbar) {
        document.getElementById('toolbarReward').onclick = () => showRewardPanel();
        document.getElementById('toolbarQuiz').onclick = () => showConfigQuizzes();
        document.getElementById('toolbarConfig').onclick = () => showTeacherConfig();
        document.getElementById('toolbarMute').onclick = () => showMutePanel();
        document.getElementById('toolbarWB').onclick = () => showWhiteboardConfig();
    }

    document.getElementById('actionStackToggleBtn')?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        toggleActionStackExpanded();
    });
    const spawnPersistBtn = document.getElementById('spawnPersistBtn');
    if (spawnPersistBtn) {
        spawnPersistBtn.onclick = () => {
            spawnPersistenceEnabled = !spawnPersistenceEnabled;
            if (!spawnPersistenceEnabled) {
                lastSavedSpawnState = null;
                lastSavedSpawnSignature = '';
            } else {
                saveCurrentSpawnState(true);
            }
            persistSpawnPersistencePreference();
            persistActiveSession();
            updateSpawnPersistenceButtonUi();
            showTooltip(spawnPersistenceEnabled ? 'Ubicación guardada al reiniciar' : 'Reinicio siempre en el salón');
        };
        updateSpawnPersistenceButtonUi();
    }

    const rocketCancelBtn = document.getElementById('rocketCancelBtn');
    if (rocketCancelBtn) {
        rocketCancelBtn.onclick = () => closeRocketTravelMenu();
    }

    const rocketLaunchBtn = document.getElementById('rocketLaunchBtn');
    if (rocketLaunchBtn) {
        rocketLaunchBtn.onclick = () => startRocketLaunchSequence();
    }



    // Close dropdowns on click outside
    window.onclick = () => {
        const tDD = document.getElementById('teacherDropdown');
        const sDD = document.getElementById('studentDropdown');
        if (tDD) tDD.style.display = 'none';
        if (sDD) sDD.style.display = 'none';
        setActionStackExpanded(false);
    };

    document.addEventListener('keydown', (event) => {
        if (!currentRoomId) return;
        const tagName = String(event.target?.tagName || '').toLowerCase();
        const isTyping = tagName === 'input' || tagName === 'textarea' || event.target?.isContentEditable;
        if (event.code === 'KeyT' && !isTyping) {
            event.preventDefault();
            toggleChatVisibility();
            return;
        }
        if (event.code === 'KeyE' && !isTyping) {
            event.preventDefault();
            window._minebloxOpenInventoryFromHotbar();
            return;
        }
        if (/^Digit[1-9]$/.test(event.code) && !isTyping) {
            const index = Number(event.code.slice(-1)) - 1;
            if (index >= 0 && index < getHotbarGroups().length) {
                event.preventDefault();
                window._minebloxSelectSlot(index);
            }
        }
    });
}

function configureActionStackForRole() {
    const micBtn = document.getElementById('micBtn');
    const spawnPersistBtn = document.getElementById('spawnPersistBtn');
    const photoBtn = document.getElementById('photoCaptureBtn');
    const teacherChatBtn = document.getElementById('toolbarChatToggle');
    const studentChatBtn = document.getElementById('studentChatToggle');
    const boardBtn = document.getElementById('toolbarWB');
    const rewardBtn = document.getElementById('toolbarReward');
    const rocketBtn = document.getElementById('toolbarRocket');
    if (micBtn) micBtn.style.display = 'flex';
    if (spawnPersistBtn) spawnPersistBtn.style.display = 'flex';
    if (photoBtn) photoBtn.style.display = 'flex';
    updateSpawnPersistenceButtonUi();

    if (isTeacher) {
        if (teacherChatBtn) teacherChatBtn.style.display = 'flex';
        if (studentChatBtn) studentChatBtn.style.display = 'none';
        if (boardBtn) boardBtn.style.display = 'flex';
        if (rewardBtn) rewardBtn.style.display = 'flex';
    } else {
        if (teacherChatBtn) teacherChatBtn.style.display = 'none';
        if (studentChatBtn) studentChatBtn.style.display = 'flex';
        if (boardBtn) boardBtn.style.display = 'none';
        if (rewardBtn) rewardBtn.style.display = 'none';
    }
    const mapBtn = document.getElementById('toolbarMap');
    if (mapBtn) mapBtn.style.display = 'flex';
    if (rocketBtn) rocketBtn.style.display = 'flex';
    setActionStackExpanded(false);
}

function setActionStackVisible(isVisible) {
    const stack = document.getElementById('minebloxActionStack');
    if (!stack) return;
    stack.style.display = isVisible ? 'flex' : 'none';
    if (!isVisible) setActionStackExpanded(false);
}

function setPhotoStatus(message = '', isError = false) {
    const status = document.getElementById('minebloxPhotoStatus');
    if (!status) return;
    status.textContent = message;
    status.style.color = isError ? '#b91c1c' : '#334155';
}

function setGalleryStatus(message = '') {
    const status = document.getElementById('minebloxGalleryStatus');
    if (!status) return;
    status.textContent = message;
}

function closePhotoModal() {
    const modal = document.getElementById('minebloxPhotoModal');
    if (modal) modal.style.display = 'none';
    screenshotState.captureOpen = false;
    setPhotoStatus('');
}

function openPhotoModal() {
    const modal = document.getElementById('minebloxPhotoModal');
    if (!modal) return;
    screenshotState.captureOpen = true;
    modal.style.display = 'flex';
    const remaining = SCREENSHOT_CAPTURE_COOLDOWN_MS - (Date.now() - screenshotState.lastCaptureAt);
    if (remaining > 250) {
        setPhotoStatus(`Espera ${Math.ceil(remaining / 1000)}s para otra captura.`);
    } else {
        setPhotoStatus('');
    }
}

function closeGalleryViewer() {
    const viewer = document.getElementById('minebloxGalleryViewer');
    if (viewer) viewer.style.display = 'none';
    screenshotState.activeRecordId = '';
}

function closeGalleryModal() {
    const modal = document.getElementById('minebloxGalleryModal');
    if (modal) modal.style.display = 'none';
    screenshotState.modalOpen = false;
    closeGalleryViewer();
}

function sortScreenshotRecords(records = []) {
    return (records || []).sort((a, b) => {
        const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return db - da; // Newest first
    });
}

function getScreenshotRecordsForActiveTab() {
    const tab = screenshotState.activeTab === 'personal' ? 'personal' : 'shared';
    const visibleRecords = screenshotState.records.filter((record) => record?.visibility === tab);
    return sortScreenshotRecords(visibleRecords);
}

function renderGalleryGrid() {
    const sharedTabBtn = document.getElementById('minebloxGalleryTabShared');
    const personalTabBtn = document.getElementById('minebloxGalleryTabPersonal');
    if (sharedTabBtn) sharedTabBtn.classList.toggle('is-primary', screenshotState.activeTab === 'shared');
    if (personalTabBtn) personalTabBtn.classList.toggle('is-primary', screenshotState.activeTab === 'personal');
    const grid = document.getElementById('minebloxGalleryGrid');
    if (!grid) return;
    const records = getScreenshotRecordsForActiveTab();
    if (!records.length) {
        grid.innerHTML = '<div style="grid-column:1/-1; padding:18px; border:2px dashed rgba(15,23,42,0.2); border-radius:18px; text-align:center; color:#64748b;">Todavía no hay fotos en esta vista.</div>';
        setGalleryStatus(screenshotState.loading ? 'Cargando...' : `0 fotos en ${screenshotState.activeTab === 'shared' ? 'Compartidas' : 'Mis fotos'}.`);
        return;
    }
    setGalleryStatus(`${records.length} fotos en ${screenshotState.activeTab === 'shared' ? 'Compartidas' : 'Mis fotos'}.`);
    grid.innerHTML = records.map((record) => {
        const createdAt = new Date(record.createdAt || Date.now());
        return `
            <button type="button" class="mineblox-gallery-card" data-shot-id="${record.id}" style="display:flex; flex-direction:column; gap:8px; padding:10px; border-radius:18px; border:2px solid rgba(15,23,42,0.12); background:#fff; text-align:left; cursor:pointer;">
                <img src="${record.thumbUrl || record.downloadUrl}" alt="Foto ASCraft" style="width:100%; aspect-ratio:16 / 9; object-fit:cover; border-radius:12px; background:#dbeafe;">
                <strong style="font-size:12px; color:#0f172a;">${record.authorName || 'Jugador'}</strong>
                <span style="font-size:11px; color:#64748b;">${createdAt.toLocaleString()}</span>
            </button>
        `;
    }).join('');
    Array.from(grid.querySelectorAll('[data-shot-id]')).forEach((button) => {
        button.onclick = () => openGalleryViewer(button.getAttribute('data-shot-id') || '');
    });
}

function openGalleryViewer(recordId = '') {
    const record = screenshotState.records.find((entry) => entry.id === recordId);
    if (!record) return;
    screenshotState.activeRecordId = record.id;
    const viewer = document.getElementById('minebloxGalleryViewer');
    const img = document.getElementById('minebloxGalleryViewerImage');
    const meta = document.getElementById('minebloxGalleryViewerMeta');
    if (!viewer || !img || !meta) return;
    img.src = record.downloadUrl || record.thumbUrl || '';
    const createdAt = new Date(record.createdAt || Date.now());
    meta.textContent = `${record.authorName || 'Jugador'} · ${createdAt.toLocaleString()} · ${record.bodyId || 'earth'} · ${record.season || 'unknown'} · ${record.weather || 'clear'}`;
    viewer.style.display = 'flex';
}

async function refreshScreenshotGallery(force = false) {
    if (!currentRoomId || !currentUserId) return;
    if (screenshotState.loading) return;
    if (screenshotState.initialized && !force) {
        renderGalleryGrid();
        return;
    }
    screenshotState.loading = true;
    setGalleryStatus('Cargando fotos...');
    try {
        const params = new URLSearchParams({
            roomId: currentRoomId,
            playerId: currentUserId,
            clientSessionId: ensureClientSessionId()
        });
        const data = await fetchJson(`/api/mineblox/screenshots/list?${params.toString()}`);
        screenshotState.records = Array.isArray(data?.records) ? data.records : [];
        screenshotState.initialized = true;
        renderGalleryGrid();
    } catch (error) {
        setGalleryStatus(`No se pudo cargar la galería: ${error.message}`);
    } finally {
        screenshotState.loading = false;
    }
}

async function openGalleryModal(tab = screenshotState.activeTab) {
    screenshotState.activeTab = tab === 'personal' ? 'personal' : 'shared';
    const modal = document.getElementById('minebloxGalleryModal');
    if (!modal) return;
    screenshotState.modalOpen = true;
    modal.style.display = 'flex';
    closeGalleryViewer();
    renderGalleryGrid();
    await refreshScreenshotGallery(!screenshotState.initialized);
}

function buildPhotoCamera() {
    const photoCamera = camera.clone();
    photoCamera.aspect = 16 / 9;
    photoCamera.updateProjectionMatrix();

    if (playerViewMode === 'third' && localPlayerMesh) {
        const worldPosition = ensurePlayerWorldPosition().clone();
        const lookDirection = new THREE.Vector3();
        camera.getWorldDirection(lookDirection);
        const worldUp = getPlanetSurfaceNormal(worldPosition);
        const side = new THREE.Vector3().crossVectors(lookDirection, worldUp).normalize();

        // Move back to see the scene properly
        photoCamera.position.copy(worldPosition)
            .add(worldUp.multiplyScalar(1.2))
            .add(side.multiplyScalar(1.2))
            .add(lookDirection.multiplyScalar(-3.6));
        photoCamera.lookAt(worldPosition.clone().add(lookDirection.multiplyScalar(6)));
    } else {
        // First-person: Use exact camera view but apply the inversion Fix
        photoCamera.position.copy(camera.position);
        photoCamera.quaternion.copy(camera.quaternion);
    }

    // Explicitly flip 180 as requested because the current coordinate setup is mirrored on render
    photoCamera.rotateY(Math.PI);

    return photoCamera;
}

function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.92) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('No se pudo generar el blob de la captura.'));
        }, type, quality);
    });
}

async function renderPhotoBlob(photoCamera, size) {
    const renderTarget = new THREE.WebGLRenderTarget(size.width, size.height, {
        colorSpace: THREE.SRGBColorSpace,
        depthBuffer: true
    });
    const previousTarget = renderer.getRenderTarget();
    const previousClearColor = renderer.getClearColor(new THREE.Color());
    const previousClearAlpha = renderer.getClearAlpha();
    const previousShadows = renderer.shadowMap.enabled;
    const previousPixelRatio = renderer.getPixelRatio();

    // Cinematic boost
    renderer.shadowMap.enabled = true;
    renderer.setPixelRatio(2); // Super-sampling

    renderer.setRenderTarget(renderTarget);
    renderer.setClearColor(previousClearColor, previousClearAlpha);
    renderer.render(scene, photoCamera);

    // Restore
    renderer.shadowMap.enabled = previousShadows;
    renderer.setPixelRatio(previousPixelRatio);
    const pixels = new Uint8Array(size.width * size.height * 4);
    if (typeof renderer.readRenderTargetPixelsAsync === 'function') {
        await renderer.readRenderTargetPixelsAsync(renderTarget, 0, 0, size.width, size.height, pixels);
    } else {
        renderer.readRenderTargetPixels(renderTarget, 0, 0, size.width, size.height, pixels);
    }
    renderer.setRenderTarget(previousTarget);

    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(size.width, size.height);
    for (let y = 0; y < size.height; y += 1) {
        const srcStart = y * size.width * 4;
        const dstStart = (size.height - y - 1) * size.width * 4;
        imageData.data.set(pixels.subarray(srcStart, srcStart + size.width * 4), dstStart);
    }
    ctx.putImageData(imageData, 0, 0);
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
    renderTarget.dispose();
    return { blob, canvas };
}

async function resizeCanvasToBlob(sourceCanvas, size) {
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(sourceCanvas, 0, 0, size.width, size.height);
    return canvasToBlob(canvas, 'image/jpeg', 0.84);
}

async function blobToDataUrl(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(arrayBuffer);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return `data:${blob.type};base64,${btoa(binary)}`;
}

function getScreenshotTargetSize() {
    if (!renderer) return { width: 1280, height: 720 };
    const canvas = renderer.domElement;
    return {
        width: canvas.width,
        height: canvas.height
    };
}

function setHudVisibilityForCapture(isVisible) {
    const hud = document.getElementById('minebloxHUD');
    const stack = document.getElementById('minebloxActionStack');
    const menu = document.getElementById('unifiedMenuWrapper');
    const chat = document.getElementById('minebloxChat');
    if (hud) hud.style.visibility = isVisible ? 'visible' : 'hidden';
    if (stack) stack.style.visibility = isVisible ? 'visible' : 'hidden';
    if (menu) menu.style.visibility = isVisible ? 'visible' : 'hidden';
    if (chat) chat.style.visibility = isVisible ? 'visible' : 'hidden';
}

async function captureAndUploadScreenshot(visibility = 'personal') {
    if (!renderer || !scene || !camera || !currentRoomId || !currentUserId) return;
    const now = Date.now();
    const remaining = SCREENSHOT_CAPTURE_COOLDOWN_MS - (now - screenshotState.lastCaptureAt);
    if (remaining > 250) {
        setPhotoStatus(`Espera ${Math.ceil(remaining / 1000)}s para otra captura.`, true);
        return;
    }
    screenshotState.captureBusy = true;
    setPhotoStatus('Renderizando captura...');
    const captureStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
        const photoCamera = buildPhotoCamera();
        if (!screenshotState.compileReady && typeof renderer.compileAsync === 'function') {
            await renderer.compileAsync(scene, photoCamera);
            screenshotState.compileReady = true;
        }
        setHudVisibilityForCapture(false);
        const size = getScreenshotTargetSize();
        const { blob, canvas } = await renderPhotoBlob(photoCamera, size);
        const thumbBlob = await resizeCanvasToBlob(canvas, SCREENSHOT_THUMB_SIZE);
        setPhotoStatus('Guardando foto...');
        const payload = {
            roomId: currentRoomId,
            playerId: currentUserId,
            playerName: playerConfig.name || 'Jugador',
            clientSessionId: ensureClientSessionId(),
            visibility,
            bodyId: isSpaceBodyActive() ? currentSpaceBodyId : 'earth',
            season: currentRoomTimeState?.season || null,
            weather: currentRoomTimeState?.weather || null,
            viewMode: playerViewMode,
            imageDataUrl: await blobToDataUrl(blob),
            thumbDataUrl: await blobToDataUrl(thumbBlob),
            width: size.width,
            height: size.height,
            thumbWidth: SCREENSHOT_THUMB_SIZE.width,
            thumbHeight: SCREENSHOT_THUMB_SIZE.height
        };
        const data = await fetchJson('/api/mineblox/screenshots/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        screenshotState.lastCaptureAt = Date.now();
        performanceDebugState.photoCaptureMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - captureStartedAt);
        if (data?.record) {
            screenshotState.records = sortScreenshotRecords([data.record, ...screenshotState.records.filter((record) => record.id !== data.record.id)]);
            screenshotState.initialized = true;
        }
        renderGalleryGrid();
        setPhotoStatus(`Foto guardada en ${visibility === 'personal' ? 'Mis fotos' : 'Compartidas'}.`);
        window.setTimeout(() => closePhotoModal(), 500);
    } catch (error) {
        setPhotoStatus(`No se pudo guardar la foto: ${error.message}`, true);
    } finally {
        screenshotState.captureBusy = false;
        setHudVisibilityForCapture(true);
    }
}

function showTooltip(text) {
    let tip = document.getElementById('mineblox-tooltip');
    if (!tip) {
        tip = document.createElement('div');
        tip.id = 'mineblox-tooltip';
        tip.style.cssText = 'position:fixed; bottom:100px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:white; padding:8px 16px; border-radius:20px; font-size:14px; z-index:10000; pointer-events:none; transition:opacity 0.3s; font-family:sans-serif;';
        document.body.appendChild(tip);
    }
    tip.textContent = text;
    tip.style.opacity = '1';
    setTimeout(() => { tip.style.opacity = '0'; }, 2000);
}

function applyVoxelJsUiOverrides() {
    if (!USE_VOXELJS_ENGINE || typeof document === 'undefined') return;
    document.body.classList.add('ascraft-voxeljs');
    const hud = document.getElementById('minebloxHUD');
    const invBar = document.getElementById('minebloxInvBar');
    const menu = document.getElementById('unifiedMenuWrapper');
    const actionStack = document.getElementById('minebloxActionStack');
    const craftBtn = document.getElementById('minebloxCraftOpenBtn');
    if (hud) hud.style.display = 'flex';
    if (invBar) invBar.style.display = 'flex';
    if (menu) menu.style.display = 'block';
    if (actionStack) actionStack.style.display = 'flex';
    if (craftBtn) craftBtn.style.display = isTeacher ? 'none' : 'block';

    const voxelMount = document.getElementById('voxeljsMount');
    if (voxelMount) voxelMount.style.zIndex = '1';
    if (uiContainer) uiContainer.style.zIndex = '20';

    document.querySelectorAll('.voxel-modal-dialog-aligner').forEach((el) => {
        el.style.zIndex = '15';
    });
}

async function ensureVoxelJsRuntime() {
    if (!USE_VOXELJS_ENGINE) return null;
    if (voxelJsRuntime) return voxelJsRuntime;
    const mod = await import(withGameVersion("./voxeljs-runtime.js"));
    voxelJsRuntime = await mod.initVoxelJsRuntime({
        containerId: 'lecturasGameCanvasContainer'
    });
    return voxelJsRuntime;
}

async function startVoxelJsWorldForRoom() {
    if (!USE_VOXELJS_ENGINE) return null;
    const runtime = await ensureVoxelJsRuntime();
    if (!runtime) return null;
    await runtime.start({ roomId: currentRoomId });
    runtime.setInputEnabled?.(true);
    return runtime;
}

function setLobbyBusyState(isBusy, message = '') {
    const lobby = document.getElementById('minebloxLobby');
    const joinBtn = document.getElementById('minebloxJoinBtn');
    const createBtn = document.getElementById('minebloxCreateBtn');
    const codeInput = document.getElementById('minebloxRoomCode');
    if (joinBtn) {
        joinBtn.disabled = !!isBusy;
        joinBtn.dataset.originalLabel = joinBtn.dataset.originalLabel || joinBtn.textContent;
        joinBtn.textContent = isBusy ? (message || 'Trabajando...') : joinBtn.dataset.originalLabel;
    }
    if (createBtn) {
        createBtn.disabled = !!isBusy;
        createBtn.dataset.originalLabel = createBtn.dataset.originalLabel || createBtn.textContent;
        createBtn.textContent = isBusy ? (message || 'Trabajando...') : createBtn.dataset.originalLabel;
    }
    if (codeInput) {
        codeInput.disabled = !!isBusy;
    }
    if (lobby) {
        lobby.dataset.busy = isBusy ? '1' : '0';
    }
}

window.copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
        showTooltip("Copiado");
    });
}

const ITEMS_LIBRARY = [
    // Blocks
    { id: 'brick_red', category: 'build', name: 'Ladrillos', icon: '🧱', color: 0xa52a2a },
    { id: 'wood_plank', category: 'build', name: 'Madera', icon: '🪵', color: 0x8b4513 },
    { id: 'stone_cobble', category: 'build', name: 'Piedra', icon: '🪨', color: 0x808080 },
    { id: 'stone_brick', category: 'build', name: 'Ladrillo de piedra', icon: '🧱', color: 0x9ca3af },
    { id: 'stone_block', category: 'build', name: 'Bloque de piedra', icon: '🪨', color: 0x9ca3af },
    { id: 'sand_block', category: 'build', name: 'Arena', icon: '🏖️', color: 0xd8c48a },
    { id: 'glass_block', category: 'build', name: 'Cristal', icon: '🧊', color: 0xadd8e6, transparent: true },
    { id: 'grass_block', category: 'build', name: 'Césped', icon: '🌿', color: 0x228b22 },
    { id: 'dirt_block', category: 'build', name: 'Tierra', icon: '🟫', color: 0x7a4c26 },
    { id: 'leaf_block', category: 'build', name: 'Hojas', icon: '🍃', color: 0x4f9f45 },
    { id: 'snow_block', category: 'build', name: 'Nieve', icon: '❄️', color: 0xf7fbff, transparent: true },
    { id: 'tile_floor', category: 'build', name: 'Piso', icon: '⬜', color: 0xf0f2f5 },
    { id: 'classroom_wall', category: 'build', name: 'Muro', icon: '🧱', color: 0xf7f7f6 },
    { id: 'sakura_block', category: 'decor', name: 'Pétalos Sakura', icon: '🌸', color: 0xffc3dd, transparent: true },
    { id: 'autumn_leaf_block', category: 'decor', name: 'Hojas Secas', icon: '🍂', color: 0xd94e33, transparent: true },
    { id: 'concrete_green', category: 'build', name: 'Concreto Verde', icon: '🟩', color: 0x166534 },
    { id: 'concrete_yellow', category: 'build', name: 'Concreto Amarillo', icon: '🟨', color: 0xeab308 },
    { id: 'concrete_blue', category: 'build', name: 'Concreto Azul', icon: '🟦', color: 0x2563eb },
    { id: 'wool_white', category: 'build', name: 'Lana Blanca', icon: '⬜', color: 0xf8fafc },
    { id: 'basalt_block', category: 'build', name: 'Basalto', icon: '⬛', color: 0x1f1d1f },
    { id: 'lava_block', category: 'build', name: 'Lava', icon: '🔥', color: 0xff4500, emissive: true },
    { id: 'water_block', category: 'build', name: 'Agua', icon: '💧', color: 0x3b82f6, transparent: true, opacity: 0.52, depthWrite: false },
    { id: 'water_still', category: 'build', name: 'Mar', icon: '🌊', color: 0x2563eb, transparent: true, opacity: 0.48, depthWrite: false },
    { id: 'lava_block', category: 'build', name: 'Lava', icon: '🔥', color: 0xff4500, emissive: 0xff3300, emissiveIntensity: 0.8 },

    // Premium Blocks (Rewards)
    { id: 'diamond_block', category: 'build', name: 'Bloque Diamante', icon: '💠', color: 0x0ea5e9 },
    { id: 'gold_block', category: 'build', name: 'Bloque Oro', icon: '🟨', color: 0xeab308 },
    { id: 'emerald_block', category: 'build', name: 'Bloque Esmeralda', icon: '🟩', color: 0x22c55e },

    // Furniture
    { id: 'chair_wood', category: 'furniture', name: 'Silla', icon: '🪑', color: 0x5c4033 },
    { id: 'table_wood', category: 'furniture', name: 'Mesa', icon: '🪵', color: 0x5c4033, scale: [1.2, 0.2, 1.2] },
    { id: 'door_wood', category: 'furniture', name: 'Puerta', icon: '🚪', color: 0x8b4513, scale: [0.8, 2, 0.1] },

    // Educational Furniture
    { id: 'whiteboard', category: 'furniture', name: 'Pizarrón', icon: '⬜', color: 0xffffff, scale: [3, 1.5, 0.1] },
    { id: 'desk_student', category: 'furniture', name: 'Mesabanco', icon: '🪑', color: 0x3b82f6, scale: [0.8, 0.8, 0.8] },
    { id: 'bookshelf', category: 'furniture', name: 'Librero', icon: '📚', color: 0x8b4513, scale: [1, 2, 0.5] },
    { id: 'desk_teacher', category: 'furniture', name: 'Mesa Maestro', icon: '👨‍🏫', color: 0x1e3a8a, scale: [1.5, 0.9, 0.8] },

    // Items / Rewards (Trends)
    { id: 'trophy_gold', category: 'item_reward', name: 'Trofeo de Oro', icon: '🏆', color: 0xffd700 },
    { id: 'diamond_blue', category: 'item_reward', name: 'Diamante King', icon: '💎', color: 0x0ea5e9 },
    { id: 'armor_stand', category: 'item_reward', name: 'Armadura Base', icon: '🛡️', color: 0xb91c1c },
    { id: 'skin_premium', category: 'item_reward', name: 'Skin Legendario', icon: '🧥', color: 0x8b5cf6 },
    { id: 'gold_ingot', category: 'item_reward', name: 'Lingote de Oro', icon: '🪙', color: 0xfacc15 },
    { id: 'poster_reading', category: 'decor', name: 'Poster Lectura', icon: '🖼️', color: 0xffffff, scale: [1, 1.5, 0.05] }
];

const ITEM_PLACEMENT_RULES = Object.freeze({
    whiteboard: { wallAligned: true, wallSnap: true, wallInset: 2.6, wallSnapThreshold: 2.4 },
    poster_reading: { wallAligned: true, wallSnap: true, wallInset: 0.6, wallSnapThreshold: 2.2 },
    bookshelf: { wallAligned: true, wallSnap: true, wallInset: 0.75, wallSnapThreshold: 2.2 },
    door_wood: { wallAligned: true, wallSnap: true, wallInset: 0.5, wallSnapThreshold: 2.2 },
    desk_teacher: { wallAligned: true, wallSnap: false },
    desk_student: { wallAligned: true, wallSnap: false },
    chair_wood: { wallAligned: true, wallSnap: false },
    table_wood: { wallAligned: true, wallSnap: false }
});

let itemThumbnailUrls = new Map();
let itemThumbnailBuildPromise = null;
let itemThumbnailRenderer = null;
let itemThumbnailCanvas = null;
let itemThumbnailBuildRequested = false;
let itemThumbnailBuildActive = false;
let itemThumbnailBuildCompleted = 0;

async function yieldToMainThread() {
    const schedulerApi = globalThis.scheduler;
    if (schedulerApi && typeof schedulerApi.yield === 'function') {
        try {
            await schedulerApi.yield();
            return;
        } catch (_) { }
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
}

function getItemThumbnailRenderer() {
    if (itemThumbnailRenderer && itemThumbnailCanvas) return itemThumbnailRenderer;
    itemThumbnailCanvas = document.createElement('canvas');
    itemThumbnailCanvas.width = 160;
    itemThumbnailCanvas.height = 160;
    itemThumbnailRenderer = new THREE.WebGLRenderer({
        canvas: itemThumbnailCanvas,
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true
    });
    itemThumbnailRenderer.setSize(160, 160, false);
    itemThumbnailRenderer.setPixelRatio(1);
    itemThumbnailRenderer.setClearColor(0x000000, 0);
    itemThumbnailRenderer.outputColorSpace = THREE.SRGBColorSpace;
    return itemThumbnailRenderer;
}

function getItemThumbnailUrl(itemId) {
    return itemThumbnailUrls.get(itemId) || '';
}

function getItemVisualMarkup(item, options = {}) {
    const thumb = getItemThumbnailUrl(item.id);
    const fallback = item.icon || getInventoryItemFallbackGlyph(item.id || item.name);
    const sizeClass = options.sizeClass ? ` ${options.sizeClass}` : '';
    const label = options.label ? `<span class="mineblox-item-visual-label">${options.label}</span>` : '';
    if (thumb) {
        return `
            <span class="mineblox-item-visual${sizeClass}">
                <img class="mineblox-item-thumb" src="${thumb}" alt="${escapeHtml(item.name || item.id || '')}" onload="this.dataset.loaded='1'; const fb=this.parentElement?.querySelector('.mineblox-item-fallback'); if (fb) fb.style.display='none';" onerror="this.style.display='none'; const fb=this.parentElement?.querySelector('.mineblox-item-fallback'); if (fb) fb.style.display='grid';">
                <span class="mineblox-item-fallback" style="display:none">${fallback}</span>
                ${label}
            </span>
        `;
    }
    return `
        <span class="mineblox-item-visual mineblox-item-visual--fallback${sizeClass}">
            <span class="mineblox-item-fallback">${fallback}</span>
            ${label}
        </span>
    `;
}

function createItemThumbnailUrl(item) {
    const previewRenderer = getItemThumbnailRenderer();
    const canvas = itemThumbnailCanvas;

    const previewScene = new THREE.Scene();
    previewScene.background = null;

    const previewCamera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    previewCamera.position.set(2.6, 1.9, 2.6);

    const ambient = new THREE.AmbientLight(0xffffff, 1.3);
    const key = new THREE.DirectionalLight(0xffffff, 1.9);
    key.position.set(4, 6, 5);
    const fill = new THREE.DirectionalLight(0xa5f3fc, 0.55);
    fill.position.set(-4, 2, 3);
    previewScene.add(ambient, key, fill);

    const object = createFurnitureMesh(item.id, item.color || 0xffffff);
    object.rotation.y = Math.PI / 4;
    object.rotation.x = -0.04;

    if (item.id === 'poster_reading') {
        object.rotation.y = Math.PI;
        object.rotation.x = 0;
    } else if (item.id === 'whiteboard') {
        object.rotation.y = Math.PI / 8;
    } else if (item.id === 'door_wood') {
        object.rotation.y = Math.PI / 16;
    }

    if (ITEMS_LIBRARY.find((libItem) => libItem.id === item.id && libItem.category === 'build')) {
        const target = object.children[0] instanceof THREE.Mesh ? object.children[0] : object;
        applyBuildBlockTexture(target, item.id);
    }

    previewScene.add(object);

    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    object.position.sub(center);

    const fittedBox = new THREE.Box3().setFromObject(object);
    const size = fittedBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const dist = maxDim * 2.2;
    previewCamera.position.set(dist, dist * 0.72, dist);
    previewCamera.lookAt(0, 0, 0);

    previewRenderer.render(previewScene, previewCamera);
    const dataUrl = canvas.toDataURL('image/png');

    object.traverse((child) => {
        if (child.geometry) child.geometry.dispose?.();
        if (child.material) {
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((mat) => mat?.dispose?.());
        }
    });

    return dataUrl;
}

async function buildItemThumbnailCache() {
    itemThumbnailBuildRequested = true;
    performanceDebugState.thumbnailPrecache.requested = true;
    const activeLibrary = getActiveItemsLibrary();
    performanceDebugState.thumbnailPrecache.total = activeLibrary.length;
    if (itemThumbnailBuildPromise) return itemThumbnailBuildPromise;
    itemThumbnailBuildPromise = (async () => {
        itemThumbnailBuildActive = true;
        itemThumbnailBuildCompleted = itemThumbnailUrls.size;
        performanceDebugState.thumbnailPrecache.active = true;
        performanceDebugState.thumbnailPrecache.completed = itemThumbnailBuildCompleted;
        try {
            for (let i = 0; i < activeLibrary.length; i += 1) {
                const item = activeLibrary[i];
                if (itemThumbnailUrls.has(item.id)) {
                    itemThumbnailBuildCompleted = itemThumbnailUrls.size;
                    performanceDebugState.thumbnailPrecache.completed = itemThumbnailBuildCompleted;
                    continue;
                }
                try {
                    itemThumbnailUrls.set(item.id, createItemThumbnailUrl(item));
                    itemThumbnailBuildCompleted = itemThumbnailUrls.size;
                    performanceDebugState.thumbnailPrecache.completed = itemThumbnailBuildCompleted;
                    if (typeof renderInventory === 'function') renderInventory();
                    if (typeof renderLibrary === 'function') renderLibrary();
                } catch (error) {
                    console.warn(`[ASCraft] No se pudo generar thumbnail para ${item.id}:`, error);
                }
                await yieldToMainThread();
            }
        } finally {
            itemThumbnailBuildActive = false;
            performanceDebugState.thumbnailPrecache.active = false;
        }
    })();
    return itemThumbnailBuildPromise;
}

function renderLibrary(filter = currentLibraryFilter) {
    const grid = document.getElementById('minebloxLibGrid');
    if (!grid) return;
    currentLibraryFilter = filter || 'all';
    const selectedTypeId = getHotbarSlotItemId(hotbarActiveSlotIndex) || normalizeInventoryItemId(selectedItemTypeId);

    const activeLibrary = getActiveItemsLibrary();
    let itemsToShow = [];
    if (isTeacher) {
        itemsToShow = currentLibraryFilter === 'all' ? activeLibrary : activeLibrary.filter(i => i.category === currentLibraryFilter);
    } else if (isRecessVirtualInventoryActive()) {
        const base = getRecessBuildCatalog();
        itemsToShow = currentLibraryFilter === 'all' ? base : base.filter((i) => i.category === currentLibraryFilter);
    } else {
        // Show student inventory as a library
        itemsToShow = userInventory.map(inv => activeLibrary.find(it => it.id === inv.itemId)).filter(x => !!x);
        // Remove duplicates for view
        itemsToShow = Array.from(new Set(itemsToShow.map(a => a.id))).map(id => itemsToShow.find(a => a.id === id));
    }

    const html = itemsToShow.map(item => {
        const isSelected = selectedTypeId === item.id;
        return `
            <div class="mineblox-lib-item ${isSelected ? 'selected' : ''}" data-mineblox-action="library-equip" data-item-id="${escapeHtml(item.id)}">
                ${getItemVisualMarkup(item, { sizeClass: 'mineblox-item-visual--library' })}
                <div class="mineblox-lib-name">${item.name} ${isSelected ? '(Equipado)' : ''}</div>
            </div>
        `;
    }).join('') || '<p style="color:#666; padding:20px">No tienes items ganados aún.</p>';

    grid.innerHTML = html;
    // Update active tab
    const tabs = document.querySelectorAll('.mineblox-lib-tabs button');
    tabs.forEach(t => t.classList.remove('active'));
    const activeIdx = currentLibraryFilter === 'all' ? 0 : (currentLibraryFilter === 'build' ? 1 : (currentLibraryFilter === 'furniture' ? 2 : 3));
    tabs[activeIdx].classList.add('active');
}

window._minebloxLibFilter = (f) => renderLibrary(f);
window._minebloxLibEquip = async (id) => {
    const item = getActiveItemsLibrary().find(i => i.id === id);
    if (!item) return;

    if (isRecessVirtualInventoryActive()) {
        assignItemToHotbarSlot(item.id, hotbarActiveSlotIndex);
        selectedItemTypeId = normalizeInventoryItemId(item.id);
        selectedItem = { itemId: item.id, docId: null, virtual: true };
        renderInventory();
        renderLibrary('all');
        showMinebloxInvBar();
        return;
    }

    const normalizedId = normalizeInventoryItemId(item.id);
    const existingGroup = getEffectiveGroupedInventory().find((group) => normalizeInventoryItemId(group.itemId) === normalizedId);
    if (existingGroup?.items?.length) {
        assignItemToHotbarSlot(normalizedId, hotbarActiveSlotIndex);
        selectedItemTypeId = normalizedId;
        selectedItem = existingGroup.items[0];
        renderInventory();
        renderLibrary('all');
        showMinebloxInvBar();
        console.log(`[ASCraft] Equipped ${item.name}`);
        return;
    }

    const invRef = collection(db, "lecturasGame", currentUserId, "mineblox_inventory");
    const docRef = await addDoc(invRef, {
        itemId: item.id,
        grantedBy: 'library',
        grantedAt: serverTimestamp()
    });
    assignItemToHotbarSlot(normalizedId, hotbarActiveSlotIndex);
    selectedItemTypeId = normalizedId;
    selectedItem = {
        itemId: normalizedId,
        docId: docRef.id,
        grantedBy: 'library'
    };
    renderInventory();
    renderLibrary('all');
    showMinebloxInvBar();
    console.log(`[ASCraft] Equipped ${item.name}`);
};

window._minebloxToggleInventoryHUD = () => {
    const bar = document.getElementById('minebloxInvBar');
    if (!bar) return;
    const isVisible = bar.style.display !== 'none';
    bar.style.display = isVisible ? 'none' : 'flex';
};
window._minebloxToggleHUD = window._minebloxToggleInventoryHUD;

window._minebloxUnequip = () => {
    hotbarQuickSlots[hotbarActiveSlotIndex] = null;
    persistHotbarQuickSlots();
    selectedItem = null;
    selectedItemTypeId = null;
    renderInventory();
    renderLibrary();
    console.log("[ASCraft] Items desequipados");
};

async function rewardPlayer(playerId) {
    if (!isTeacher || !currentRoomId) return;
    const randomItem = ITEMS_LIBRARY[Math.floor(Math.random() * ITEMS_LIBRARY.length)];

    // Add to student's global inventory
    const invRef = collection(db, "lecturasGame", playerId, "mineblox_inventory");
    await addDoc(invRef, {
        itemId: randomItem.id,
        grantedBy: currentUserId,
        grantedAt: serverTimestamp()
    });

    // Notify student via room event
    const eventRef = collection(db, "mineblox_rooms", currentRoomId, "events");
    await addDoc(eventRef, {
        type: 'REWARD',
        to: playerId,
        item: randomItem,
        timestamp: serverTimestamp()
    });
}

async function createRoom() {
    showTeacherConfig();
}

async function showTeacherConfig() {
    const modal = document.createElement('div');
    modal.className = 'mineblox-modal';
    modal.innerHTML = `
        <div class="mineblox-modal-content mineblox-config-modal-content">
            <h3>Configuración del Salón</h3>
            <div id="cfgTabsBar" style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
                <button type="button" class="cfg-tab-btn is-active" data-tab="teacher" style="padding:10px 12px; border-radius:999px; border:1px solid rgba(30,64,175,0.18); background:#dbeafe; color:#1d4ed8; font-weight:800; cursor:pointer;">Datos del profesor</button>
                <button type="button" class="cfg-tab-btn" data-tab="passwords" style="padding:10px 12px; border-radius:999px; border:1px solid rgba(15,23,42,0.08); background:#f8fafc; color:#334155; font-weight:700; cursor:pointer;">Contraseñas de Alumnos</button>
                <button type="button" class="cfg-tab-btn" data-tab="reassign" style="padding:10px 12px; border-radius:999px; border:1px solid rgba(15,23,42,0.08); background:#f8fafc; color:#334155; font-weight:700; cursor:pointer;">Reasignar nombre de alumno</button>
                <button type="button" class="cfg-tab-btn" data-tab="time" style="padding:10px 12px; border-radius:999px; border:1px solid rgba(15,23,42,0.08); background:#f8fafc; color:#334155; font-weight:700; cursor:pointer;">Tiempo del Aula</button>
            </div>
            <div id="cfgTabTeacher" class="cfg-tab-panel" data-panel="teacher" style="display:block; padding:12px; border-radius:12px; background:rgba(15,23,42,0.04); border:1px solid rgba(15,23,42,0.08);">
                <input type="text" id="cfgRoomName" placeholder="Nombre del Salón (ej. 3ro A)">
                <input type="text" id="cfgTeacherName" placeholder="Nombre del Profesor (ej. Profe Juan)">
                <input type="password" id="cfgPassword" placeholder="Contraseña Maestro (opcional)">
                <textarea id="cfgStudentList" placeholder="Lista de Alumnos (ej. Ana, Luis, Pedro). ASCraft generará una contraseña corta única para cada alumno." rows="4"></textarea>
            </div>
            <div id="cfgStudentPasswordsPanel" class="cfg-tab-panel" data-panel="passwords" style="display:none; margin-top:0; padding:12px; border-radius:12px; background:rgba(15,23,42,0.04); border:1px solid rgba(15,23,42,0.08);">
                <h4 style="margin:0 0 8px; color:#0f172a; font-size:14px;">Contraseñas de Alumnos</h4>
                <div id="cfgStudentPasswordsList" style="display:flex; flex-direction:column; gap:6px; max-height:260px; overflow:auto; font-size:12px; color:#334155;"></div>
                <p style="margin:8px 0 0; font-size:11px; color:#64748b;">Estas contraseñas se entregan a los alumnos junto con el código de alumno.</p>
            </div>
            <div id="cfgReassignSection" class="cfg-tab-panel" data-panel="reassign" style="display:none; margin-top:0; padding:12px; border-radius:12px; background:rgba(15,23,42,0.04); border:1px solid rgba(59,130,246,0.18);">
                <h4 style="margin:0 0 10px; color:#1e3a8a; font-size:14px;">Reasignar nombre de alumno</h4>
                <label style="display:block; margin-bottom:4px; font-size:12px; color:#475569;">Alumno activo</label>
                <select id="cfgRenamePlayer" style="width:100%; padding:10px; margin-bottom:10px"></select>
                <label style="display:block; margin-bottom:4px; font-size:12px; color:#475569;">Nuevo nombre</label>
                <select id="cfgRenameTo" style="width:100%; padding:10px; margin-bottom:6px"></select>
                <button class="lecturas-game-pixel-btn is-primary" id="cfgRenameBtn" style="width:100%; margin-top:10px;">Reasignar nombre</button>
                <button class="lecturas-game-pixel-btn" id="cfgKickGuestBtn" style="width:100%; margin-top:8px; background:#991b1b; color:white;">Eliminar invitado</button>
                <button class="lecturas-game-pixel-btn" id="cfgKickDuplicateBtn" style="width:100%; margin-top:8px; background:#7c2d12; color:white;">Eliminar usuario duplicado</button>
                <p id="cfgRenameHint" style="margin:10px 0 0; font-size:12px; color:#475569;">Úsalo cuando un alumno entra desde otro dispositivo y su nombre original quedó ocupado.</p>
            </div>
            <div id="cfgTabTime" class="cfg-tab-panel" data-panel="time" style="display:none; margin-top:0; padding:12px; border-radius:12px; background:rgba(15,23,42,0.04); border:1px solid rgba(15,23,42,0.08);">
                <h4 style="margin:0 0 10px; color:#0f172a; font-size:14px;">Tiempo del Aula</h4>
                <label style="display:block; margin-bottom:4px; font-size:12px; color:#475569;">Zona horaria del salón</label>
                <input type="text" id="cfgTimeZone" placeholder="America/Cancun">
                <label style="display:block; margin:10px 0 4px; font-size:12px; color:#475569;">Escala del tiempo</label>
                <select id="cfgTimePreset">
                    <option value="real">Real (1h/día, 365h/año)</option>
                    <option value="x2">2x</option>
                    <option value="x6">6x</option>
                    <option value="x24">24x</option>
                    <option value="custom">Avanzado</option>
                </select>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
                    <div>
                        <label style="display:block; margin-bottom:4px; font-size:12px; color:#475569;">Horas reales por día</label>
                        <input type="number" id="cfgDayDurationHours" min="0.0083" step="0.01">
                    </div>
                    <div>
                        <label style="display:block; margin-bottom:4px; font-size:12px; color:#475569;">Horas reales por año</label>
                        <input type="number" id="cfgYearDurationHours" min="0.1" step="0.1">
                    </div>
                </div>
                <label style="display:flex; align-items:center; gap:8px; margin-top:10px; font-size:12px; color:#334155;">
                    <input type="checkbox" id="cfgManualTimeEnabled">
                    Fijar fecha y hora manual del aula
                </label>
                <input type="datetime-local" id="cfgManualDateTime" style="margin-top:8px;">
                <p id="cfgTimeScaleHint" style="margin:10px 0 0; font-size:12px; color:#475569;">1 día virtual tarda 1 hora real y el año virtual tarda 365 horas reales.</p>
            </div>
            <div style="display:flex; gap:10px; margin-top:14px;">
                <button class="lecturas-game-pixel-btn is-primary" id="cfgSaveBtn" style="flex:1">Crear y Abrir Salón</button>
                <button class="lecturas-game-pixel-btn" style="flex:1; background:#666; margin-top:0;" data-mineblox-action="close-parent-modal">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const tabButtons = Array.from(modal.querySelectorAll('.cfg-tab-btn'));
    const tabPanels = Array.from(modal.querySelectorAll('.cfg-tab-panel'));
    const setActiveConfigTab = (tabId = 'teacher') => {
        tabButtons.forEach((button) => {
            const active = button.dataset.tab === tabId;
            button.classList.toggle('is-active', active);
            button.style.background = active ? '#dbeafe' : '#f8fafc';
            button.style.color = active ? '#1d4ed8' : '#334155';
            button.style.borderColor = active ? 'rgba(30,64,175,0.18)' : 'rgba(15,23,42,0.08)';
        });
        tabPanels.forEach((panel) => {
            panel.style.display = panel.dataset.panel === tabId ? 'block' : 'none';
        });
    };
    tabButtons.forEach((button) => {
        button.addEventListener('click', () => setActiveConfigTab(button.dataset.tab || 'teacher'));
    });
    setActiveConfigTab('teacher');
    const reassignSection = document.getElementById('cfgReassignSection');
    const renamePlayerSelect = document.getElementById('cfgRenamePlayer');
    const renameToInput = document.getElementById('cfgRenameTo');
    const renameBtn = document.getElementById('cfgRenameBtn');
    const kickGuestBtn = document.getElementById('cfgKickGuestBtn');
    const kickDuplicateBtn = document.getElementById('cfgKickDuplicateBtn');
    const renameHint = document.getElementById('cfgRenameHint');
    const timeZoneInput = document.getElementById('cfgTimeZone');
    const timePresetSelect = document.getElementById('cfgTimePreset');
    const dayDurationInput = document.getElementById('cfgDayDurationHours');
    const yearDurationInput = document.getElementById('cfgYearDurationHours');
    const manualTimeToggle = document.getElementById('cfgManualTimeEnabled');
    const manualDateTimeInput = document.getElementById('cfgManualDateTime');
    const timeScaleHint = document.getElementById('cfgTimeScaleHint');
    const studentListInput = document.getElementById('cfgStudentList');
    const studentPasswordsList = document.getElementById('cfgStudentPasswordsList');
    const updateTimeScaleHint = () => {
        const dayHours = Math.max(1 / 120, Number(dayDurationInput?.value || DEFAULT_DAY_DURATION_HOURS_REAL));
        const yearHours = Math.max(dayHours, Number(yearDurationInput?.value || DEFAULT_YEAR_DURATION_HOURS_REAL));
        const approxDaysPerYear = yearHours / Math.max(1e-6, dayHours);
        if (timeScaleHint) {
            timeScaleHint.textContent = `1 día virtual tarda ${dayHours.toFixed(dayHours < 1 ? 2 : 1)} horas reales, y 1 año virtual tarda ${yearHours.toFixed(yearHours < 10 ? 2 : 1)} horas reales (${approxDaysPerYear.toFixed(1)} días virtuales por año).`;
        }
    };

    const applyPresetToInputs = (presetId, keepAdvancedValues = false) => {
        const preset = resolveRoomTimePreset(presetId);
        if (!keepAdvancedValues || preset.id !== 'custom') {
            dayDurationInput.value = String(Number(preset.dayDurationHoursReal || DEFAULT_DAY_DURATION_HOURS_REAL));
            yearDurationInput.value = String(Number(preset.yearDurationHoursReal || DEFAULT_YEAR_DURATION_HOURS_REAL));
        }
        const advanced = String(preset.id) === 'custom';
        dayDurationInput.disabled = !advanced;
        yearDurationInput.disabled = !advanced;
        updateTimeScaleHint();
    };

    const renderStudentPasswordPreview = () => {
        if (!studentPasswordsList) return;
        const names = String(studentListInput?.value || '')
            .split(',')
            .map((name) => normalizeDisplayNameCandidate(name))
            .filter(Boolean);
        const credentials = buildStudentCredentialEntries(
            names,
            roomDataSnapshot ? extractStudentCredentials(roomDataSnapshot) : []
        );
        studentPasswordsList.textContent = '';
        if (!credentials.length) {
            const empty = document.createElement('div');
            empty.style.fontSize = '11px';
            empty.style.color = '#64748b';
            empty.textContent = 'Agrega alumnos para generar sus contraseñas.';
            studentPasswordsList.appendChild(empty);
            return;
        }

        credentials.forEach((entry) => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.gap = '10px';
            row.style.alignItems = 'center';
            row.style.padding = '6px 8px';
            row.style.borderRadius = '8px';
            row.style.background = 'rgba(255,255,255,0.65)';

            const nameEl = document.createElement('span');
            nameEl.style.minWidth = '0';
            nameEl.style.overflow = 'hidden';
            nameEl.style.textOverflow = 'ellipsis';
            nameEl.style.whiteSpace = 'nowrap';
            nameEl.textContent = entry.name;

            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.textContent = entry.password;
            copyBtn.style.cursor = 'pointer';
            copyBtn.style.color = '#b91c1c';
            copyBtn.style.fontWeight = '700';
            copyBtn.style.border = 'none';
            copyBtn.style.background = 'transparent';
            copyBtn.style.padding = '0';
            copyBtn.dataset.copyValue = entry.password;

            row.append(nameEl, copyBtn);
            studentPasswordsList.appendChild(row);
        });
    };

    const defaultTimeSettings = normalizeRoomTimeSettings(roomTimeSettings || getDefaultRoomTimeSettings());
    if (timeZoneInput) timeZoneInput.value = defaultTimeSettings.timeZone;
    if (timePresetSelect) timePresetSelect.value = defaultTimeSettings.timeScalePreset;
    if (manualTimeToggle) manualTimeToggle.checked = !!defaultTimeSettings.manualOverrideEnabled;
    if (manualDateTimeInput) {
        manualDateTimeInput.disabled = !defaultTimeSettings.manualOverrideEnabled;
        manualDateTimeInput.value = formatEpochForDateTimeInput(defaultTimeSettings.manualEpochMs, defaultTimeSettings.timeZone);
    }
    applyPresetToInputs(defaultTimeSettings.timeScalePreset, true);

    timePresetSelect?.addEventListener('change', () => {
        applyPresetToInputs(timePresetSelect.value, false);
    });
    dayDurationInput?.addEventListener('input', updateTimeScaleHint);
    yearDurationInput?.addEventListener('input', updateTimeScaleHint);
    timeZoneInput?.addEventListener('change', () => {
        const safeZone = isValidTimeZone(timeZoneInput.value) ? timeZoneInput.value : getSystemTimeZone();
        if (manualDateTimeInput) {
            const epoch = parseZonedDateTimeInput(manualDateTimeInput.value, safeZone) || Date.now();
            manualDateTimeInput.value = formatEpochForDateTimeInput(epoch, safeZone);
        }
    });
    manualTimeToggle?.addEventListener('change', () => {
        if (!manualDateTimeInput) return;
        manualDateTimeInput.disabled = !manualTimeToggle.checked;
        if (!manualDateTimeInput.value) {
            const safeZone = isValidTimeZone(timeZoneInput?.value) ? timeZoneInput.value : getSystemTimeZone();
            manualDateTimeInput.value = formatEpochForDateTimeInput(Date.now(), safeZone);
        }
    });

    const renderReassignPanelFromPlayers = (roomData, players, selectedPlayerId = '') => {
        const roster = Array.from(new Set(extractStudentNames(roomData)
            .map((name) => normalizeDisplayNameCandidate(name))
            .filter(Boolean)));
        const currentPlayer = players.find((player) => player.id === selectedPlayerId) || null;
        const currentPlayerName = normalizeDisplayNameCandidate(currentPlayer?.displayName || '');
        const duplicateIds = getDuplicatePlayerIdSet(players, {
            id: currentUserId,
            displayName: playerConfig.name || '',
            sessionType: isTeacher ? SESSION_KIND_TEACHER : currentSessionKind
        });
        const takenNames = new Set(players
            .filter((player) => player.id !== selectedPlayerId)
            .map((player) => normalizeDisplayNameCandidate(player.displayName))
            .filter(Boolean));
        const availableNames = roster.filter((name) => !takenNames.has(name) || name === currentPlayerName);

        renamePlayerSelect.innerHTML = '';
        renameToInput.innerHTML = '';

        if (players.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No hay alumnos activos';
            renamePlayerSelect.appendChild(opt);
            renamePlayerSelect.disabled = true;
            renameToInput.disabled = true;
            renameBtn.disabled = true;
            if (kickGuestBtn) kickGuestBtn.disabled = true;
            if (kickDuplicateBtn) kickDuplicateBtn.disabled = true;
            if (renameHint) renameHint.textContent = 'No hay alumnos activos para reasignar en este momento.';
            return;
        }

        players.forEach((player) => {
            const opt = document.createElement('option');
            opt.value = player.id;
            const kindLabel = player.sessionType === SESSION_KIND_GUEST
                ? 'Invitado'
                : player.sessionType === SESSION_KIND_TEACHER
                    ? 'Profesor'
                    : 'Alumno';
            const duplicateSuffix = duplicateIds.has(player.id) ? ' · Duplicado' : '';
            const activityLabel = player.active ? 'Activo' : 'Inactivo';
            opt.textContent = `${player.displayName} · ${kindLabel} · ${activityLabel}${duplicateSuffix} (${player.id.slice(-4)})`;
            renamePlayerSelect.appendChild(opt);
        });

        if (roster.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'La lista de alumnos está vacía';
            renameToInput.appendChild(opt);
            renameToInput.disabled = true;
            renameBtn.disabled = true;
            if (kickGuestBtn) kickGuestBtn.disabled = true;
            if (kickDuplicateBtn) kickDuplicateBtn.disabled = true;
            if (renameHint) renameHint.textContent = 'Primero agrega nombres a la lista de alumnos del salón.';
            return;
        }

        roster.forEach((studentName) => {
            const opt = document.createElement('option');
            opt.value = studentName;
            opt.textContent = takenNames.has(studentName) && studentName !== currentPlayerName
                ? `${studentName} (ocupado)`
                : studentName;
            opt.disabled = takenNames.has(studentName) && studentName !== currentPlayerName;
            renameToInput.appendChild(opt);
        });

        const availablePlayer = players.find((player) => player.id === selectedPlayerId) || players[0];
        const selectedId = availablePlayer?.id || players[0].id;
        renamePlayerSelect.value = selectedId;
        const preferredName = roster.includes(currentPlayerName) ? currentPlayerName : availableNames[0] || roster[0];
        renameToInput.disabled = false;
        renameBtn.disabled = availableNames.length === 0;
        renameToInput.value = preferredName || roster[0];
        refreshGuestActionButton(selectedId, players);
        refreshDuplicateActionButton(selectedId, players);
        if (renameHint) renameHint.textContent = 'La lista muestra alumnos, invitados y profesores activos o inactivos. Los duplicados aparecen marcados.';
    };

    const refreshGuestActionButton = (selectedPlayerId, players) => {
        if (!kickGuestBtn) return;
        const selectedPlayer = players.find((player) => player.id === selectedPlayerId) || null;
        const isGuest = selectedPlayer?.sessionType === SESSION_KIND_GUEST;
        kickGuestBtn.disabled = !isGuest;
        kickGuestBtn.style.opacity = isGuest ? '1' : '0.55';
        kickGuestBtn.style.cursor = isGuest ? 'pointer' : 'not-allowed';
        kickGuestBtn.textContent = isGuest ? 'Eliminar invitado' : 'Eliminar invitado (selecciona uno)';
    };

    const refreshDuplicateActionButton = (selectedPlayerId, players) => {
        if (!kickDuplicateBtn) return;
        const duplicateIds = getDuplicatePlayerIdSet(players, {
            id: currentUserId,
            displayName: playerConfig.name || '',
            sessionType: isTeacher ? SESSION_KIND_TEACHER : currentSessionKind
        });
        const isDuplicate = duplicateIds.has(selectedPlayerId);
        kickDuplicateBtn.disabled = !isDuplicate;
        kickDuplicateBtn.style.opacity = isDuplicate ? '1' : '0.55';
        kickDuplicateBtn.style.cursor = isDuplicate ? 'pointer' : 'not-allowed';
        kickDuplicateBtn.textContent = isDuplicate ? 'Eliminar usuario duplicado' : 'Eliminar duplicado (selecciona uno)';
    };

    const populateReassignPanel = async (data = null) => {
        if (!currentRoomId || !reassignSection || !renamePlayerSelect || !renameToInput || !renameBtn) return;
        const roomData = data || roomDataSnapshot;
        if (!roomData) return;

        const playersSnap = await getDocs(collection(db, "mineblox_rooms", currentRoomId, "players"));
        const players = [];
        const nowMs = Date.now();
        playersSnap.forEach((d) => {
            if (d.id === currentUserId) return;
            const pdata = d.data() || {};
            const displayName = normalizeDisplayNameCandidate(pdata.displayName || 'Alumno');
            const inferredGuest = displayName.toLowerCase().includes('(invitado');
            const lastSeenMs = timestampToMillis(pdata.lastSeen);
            players.push({
                id: d.id,
                displayName,
                sessionType: String(pdata.sessionType || (String(pdata.isGuest) === 'true' ? SESSION_KIND_GUEST : (inferredGuest ? SESSION_KIND_GUEST : SESSION_KIND_STUDENT))).trim() || SESSION_KIND_STUDENT,
                active: !lastSeenMs || (nowMs - lastSeenMs) <= 45000,
                lastSeenMs
            });
        });
        reassignPlayersCache = players;

        reassignSection.style.display = 'block';
        renamePlayerSelect.innerHTML = '';
        if (players.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No hay alumnos activos';
            renamePlayerSelect.appendChild(opt);
            renamePlayerSelect.disabled = true;
            renameToInput.disabled = true;
            renameBtn.disabled = true;
            if (kickGuestBtn) kickGuestBtn.disabled = true;
            if (kickDuplicateBtn) kickDuplicateBtn.disabled = true;
            if (renameHint) renameHint.textContent = 'No hay alumnos activos para reasignar en este momento.';
            return;
        }

        renamePlayerSelect.disabled = false;
        renameToInput.disabled = false;
        renameBtn.disabled = false;
        renderReassignPanelFromPlayers(roomData, players, renamePlayerSelect.value || players[0]?.id || '');
    };

    // If editing
    if (currentRoomId) {
        const snap = await getDocs(query(collection(db, "mineblox_rooms"), where("__name__", "==", currentRoomId)));
        if (!snap.empty) {
            const data = snap.docs[0].data();
            roomDataSnapshot = data;
            document.getElementById('cfgRoomName').value = data.roomName || '';
            document.getElementById('cfgTeacherName').value = data.teacherName || '';
            document.getElementById('cfgPassword').value = data.password || '';
            document.getElementById('cfgStudentList').value = extractStudentNames(data).join(', ');
            const savedTimeSettings = normalizeRoomTimeSettings(data.timeSettings || data);
            if (timeZoneInput) timeZoneInput.value = savedTimeSettings.timeZone;
            if (timePresetSelect) timePresetSelect.value = savedTimeSettings.timeScalePreset;
            if (manualTimeToggle) manualTimeToggle.checked = !!savedTimeSettings.manualOverrideEnabled;
            if (manualDateTimeInput) {
                manualDateTimeInput.disabled = !savedTimeSettings.manualOverrideEnabled;
                manualDateTimeInput.value = formatEpochForDateTimeInput(savedTimeSettings.manualEpochMs, savedTimeSettings.timeZone);
            }
            applyPresetToInputs(savedTimeSettings.timeScalePreset, true);
            dayDurationInput.value = String(Number(savedTimeSettings.dayDurationHoursReal));
            yearDurationInput.value = String(Number(savedTimeSettings.yearDurationHoursReal));
            updateTimeScaleHint();
            document.getElementById('cfgSaveBtn').textContent = 'Guardar Cambios';
            await populateReassignPanel(data);
        }
    }
    studentListInput?.addEventListener('input', renderStudentPasswordPreview);
    renderStudentPasswordPreview();

    if (renamePlayerSelect) {
        renamePlayerSelect.addEventListener('change', async () => {
            if (!roomDataSnapshot) return;
            const selectedId = renamePlayerSelect.value;
            if (!selectedId) return;
            const playersSnap = await getDocs(collection(db, "mineblox_rooms", currentRoomId, "players"));
            const players = playersSnap.docs
                .filter((d) => d.id !== currentUserId)
                .map((d) => {
                    const pdata = d.data() || {};
                    const lastSeenMs = timestampToMillis(pdata.lastSeen);
                    return {
                        id: d.id,
                        displayName: normalizeDisplayNameCandidate(pdata.displayName || 'Alumno'),
                        sessionType: String(pdata.sessionType || (String(pdata.isGuest) === 'true' ? SESSION_KIND_GUEST : SESSION_KIND_STUDENT)).trim() || SESSION_KIND_STUDENT,
                        active: !lastSeenMs || (Date.now() - lastSeenMs) <= 45000,
                        lastSeenMs
                    };
                });
            reassignPlayersCache = players;
            renderReassignPanelFromPlayers(roomDataSnapshot, players, selectedId);
        });
    }

    if (renameBtn) {
        renameBtn.onclick = async () => {
            const playerId = String(renamePlayerSelect?.value || '').trim();
            const newName = String(renameToInput?.value || '').trim();
            if (!currentRoomId || !playerId || !newName) {
                alert('Selecciona un alumno y elige un nombre.');
                return;
            }

            const playersSnap = await getDocs(collection(db, "mineblox_rooms", currentRoomId, "players"));
            const targetDoc = playersSnap.docs.find((d) => d.id === playerId);
            if (!targetDoc) {
                alert('No se encontró ese alumno activo.');
                return;
            }

            const isTakenByAnother = playersSnap.docs.some((d) => d.id !== playerId && String(d.data()?.displayName || '').trim() === newName);
            if (isTakenByAnother) {
                alert('Ese nombre ya está ocupado por otro alumno activo.');
                return;
            }

            await updateDoc(doc(db, "mineblox_rooms", currentRoomId, "players", playerId), {
                displayName: newName,
                updatedAt: serverTimestamp(),
                nameReassignedBy: currentUserId
            });

            const roomDocRef = doc(db, "mineblox_rooms", currentRoomId);
            const roomSnap = await getDoc(roomDocRef);
            const roomDataNow = roomSnap.exists() ? (roomSnap.data() || {}) : (roomDataSnapshot || {});
            const studentList = extractStudentNames(roomDataNow);
            if (!studentList.includes(newName)) {
                studentList.push(newName);
                const studentCredentials = buildStudentCredentialEntries(studentList, extractStudentCredentials(roomDataNow));
                await updateDoc(roomDocRef, { studentList, studentCredentials });
                roomDataSnapshot = { ...roomDataNow, studentList, studentCredentials };
            }

            if (renameHint) {
                renameHint.textContent = `Nombre reasignado a ${newName}. El nombre anterior quedó libre.`;
            }
            alert('Nombre reasignado correctamente.');
        };
    }

    if (kickGuestBtn) {
        kickGuestBtn.onclick = async () => {
            const playerId = String(renamePlayerSelect?.value || '').trim();
            const selectedPlayer = reassignPlayersCache.find((player) => player.id === playerId) || null;
            if (!currentRoomId || !playerId) {
                alert('Selecciona un usuario invitado primero.');
                return;
            }
            if (!selectedPlayer || selectedPlayer.sessionType !== SESSION_KIND_GUEST) {
                alert('Solo puedes eliminar usuarios invitados desde esta acción.');
                return;
            }

            const playerRef = doc(db, "mineblox_rooms", currentRoomId, "players", playerId);
            await updateDoc(playerRef, {
                forceLogout: true,
                forceLogoutReason: 'El profesor eliminó tu sesión de invitado',
                forceLogoutBy: currentUserId,
                forceLogoutAt: serverTimestamp()
            });

            reassignPlayersCache = reassignPlayersCache.filter((player) => player.id !== playerId);
            renderReassignPanelFromPlayers(roomDataSnapshot, reassignPlayersCache, reassignPlayersCache[0]?.id || '');

            setTimeout(() => {
                deleteDoc(playerRef).catch(() => { });
            }, 2500);

            if (renameHint) {
                renameHint.textContent = `Se envió la expulsión a ${selectedPlayer.displayName}.`;
            }
            alert('Invitado eliminado de la sesión.');
        };
    }

    if (kickDuplicateBtn) {
        kickDuplicateBtn.onclick = async () => {
            const playerId = String(renamePlayerSelect?.value || '').trim();
            const selectedPlayer = reassignPlayersCache.find((player) => player.id === playerId) || null;
            const duplicateIds = getDuplicatePlayerIdSet(reassignPlayersCache, {
                id: currentUserId,
                displayName: playerConfig.name || '',
                sessionType: isTeacher ? SESSION_KIND_TEACHER : currentSessionKind
            });
            if (!currentRoomId || !playerId || !selectedPlayer) {
                alert('Selecciona un usuario duplicado primero.');
                return;
            }
            if (!duplicateIds.has(playerId)) {
                alert('Ese usuario no parece duplicado en este momento.');
                return;
            }

            const playerRef = doc(db, "mineblox_rooms", currentRoomId, "players", playerId);
            await updateDoc(playerRef, {
                forceLogout: true,
                forceLogoutReason: 'El profesor eliminó una sesión duplicada',
                forceLogoutBy: currentUserId,
                forceLogoutAt: serverTimestamp()
            });

            reassignPlayersCache = reassignPlayersCache.filter((player) => player.id !== playerId);
            renderReassignPanelFromPlayers(roomDataSnapshot, reassignPlayersCache, reassignPlayersCache[0]?.id || '');

            setTimeout(() => {
                deleteDoc(playerRef).catch(() => { });
            }, 2500);

            if (renameHint) {
                renameHint.textContent = `Se eliminó la sesión duplicada de ${selectedPlayer.displayName}.`;
            }
            alert('Usuario duplicado eliminado de la sesión.');
        };
    }

    document.getElementById('cfgSaveBtn').onclick = async () => {
        const rName = document.getElementById('cfgRoomName').value.trim() || 'Mi Salón';
        const tName = document.getElementById('cfgTeacherName').value.trim() || 'Profesor';
        const tPass = document.getElementById('cfgPassword').value.trim();
        const sListRaw = document.getElementById('cfgStudentList').value.split(',').map(n => n.trim()).filter(n => n.length > 0);
        const existingStudentCredentials = roomDataSnapshot ? extractStudentCredentials(roomDataSnapshot) : [];
        const studentCredentials = buildStudentCredentialEntries(sListRaw, existingStudentCredentials);
        const studentNames = studentCredentials.map((entry) => entry.name);
        const chosenTimeZone = isValidTimeZone(timeZoneInput?.value) ? String(timeZoneInput.value).trim() : getSystemTimeZone();
        const chosenPresetId = String(timePresetSelect?.value || DEFAULT_ROOM_TIME_PRESET).trim().toLowerCase();
        const presetDef = resolveRoomTimePreset(chosenPresetId);
        const useCustomDurations = presetDef.id === 'custom';
        const dayDurationHoursReal = Math.max(
            1 / 120,
            Number(useCustomDurations ? dayDurationInput?.value : presetDef.dayDurationHoursReal)
        );
        const yearDurationHoursReal = Math.max(
            dayDurationHoursReal,
            Number(useCustomDurations ? yearDurationInput?.value : presetDef.yearDurationHoursReal)
        );
        const manualOverrideEnabled = !!manualTimeToggle?.checked;
        const manualEpochMs = manualOverrideEnabled
            ? parseZonedDateTimeInput(manualDateTimeInput?.value, chosenTimeZone)
            : Date.now();
        const nextTimeSettings = getRoomTimeSettingsPayload({
            timeZone: chosenTimeZone,
            timeScalePreset: useCustomDurations ? 'custom' : presetDef.id,
            dayDurationHoursReal,
            yearDurationHoursReal,
            manualOverrideEnabled,
            manualEpochMs: manualEpochMs || Date.now(),
            timeAnchorMs: Date.now()
        });

        if (studentCredentials.length === 0) {
            alert("Añade al menos un alumno a la lista");
            return;
        }
        if (manualOverrideEnabled && !manualEpochMs) {
            alert("La fecha y hora manual no es válida para la zona horaria elegida.");
            return;
        }

        if (currentRoomId) {
            // Update mode
            await updateDoc(doc(db, "mineblox_rooms", currentRoomId), {
                roomName: rName,
                teacherName: tName,
                password: tPass,
                studentList: studentNames,
                studentCredentials,
                timeSettings: nextTimeSettings,
                skyCycleVersion: SKY_CYCLE_VERSION
            });
            playerConfig.name = tName;
            roomName = rName;
            localStorage.setItem(`mineblox_name_${currentRoomId}`, tName);
            roomTimeSettings = normalizeRoomTimeSettings(nextTimeSettings);
            roomDataSnapshot = {
                ...(roomDataSnapshot || {}),
                roomName: rName,
                teacherName: tName,
                password: tPass,
                studentList: studentNames,
                studentCredentials,
                timeSettings: nextTimeSettings,
                skyCycleVersion: SKY_CYCLE_VERSION
            };
            renderStudentPasswordPreview();
            persistActiveSession();
        } else {
            // Create mode
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            isTeacher = true;
            currentRoomId = code;
            playerConfig.name = tName;
            roomName = rName;
            playerConfig.avatarId = 'scientist';

            await setDoc(doc(db, "mineblox_rooms", code), {
                teacherId: currentUserId,
                roomName: rName,
                teacherName: tName,
                password: tPass,
                studentList: studentNames,
                studentCredentials,
                chatEnabled: false,
                doorOpen: false,
                recessMode: false,
                recessEpoch: 0,
                recessUpdatedAt: serverTimestamp(),
                timeSettings: nextTimeSettings,
                skyCycleVersion: SKY_CYCLE_VERSION,
                createdAt: serverTimestamp(),
                active: true
            });

            localStorage.setItem("minebloxIsTeacher", "true");
            localStorage.setItem("minebloxLastTeacherRoom", code);
            localStorage.setItem(`mineblox_name_${code}`, tName);
            roomTimeSettings = normalizeRoomTimeSettings(nextTimeSettings);
            recessModeActive = false;
            lastRecessEpochSeen = 0;
            roomDataSnapshot = {
                teacherId: currentUserId,
                roomName: rName,
                teacherName: tName,
                password: tPass,
                studentList: studentNames,
                studentCredentials,
                chatEnabled: false,
                doorOpen: false,
                recessMode: false,
                recessEpoch: 0,
                timeSettings: nextTimeSettings,
                skyCycleVersion: SKY_CYCLE_VERSION,
                active: true
            };
            renderStudentPasswordPreview();
            persistActiveSession();
        }

        modal.remove();
        await enterLobby();
    };
}

async function joinRoom(rawCode) {
    let code = rawCode.trim().toUpperCase();
    let isForcedStudent = false;

    if (code.startsWith('A-')) {
        code = code.substring(2);
        isForcedStudent = true;
    }

    const roomRef = doc(db, "mineblox_rooms", code);
    const roomSnap = await getDoc(roomRef);

    if (!roomSnap.exists()) {
        alert("Código de salón no válido");
        return;
    }

    const roomData = roomSnap.data() || {};
    roomDataSnapshot = roomData;
    currentRoomId = code;

    if (isForcedStudent) {
        isTeacher = false;
        currentSessionKind = SESSION_KIND_STUDENT;
        const configuredStudentCredentials = extractStudentCredentials(roomData).filter((entry) => String(entry.password || '').trim());
        const studentPassword = await promptForAccessValue({
            title: 'Ingreso de Alumno',
            description: 'Escribe la contraseña del alumno que te dio tu profesor.',
            placeholder: 'Contraseña del alumno',
            confirmLabel: 'Entrar',
            inputType: 'password'
        });
        if (!studentPassword) return;
        const credential = configuredStudentCredentials.find((entry) => String(entry.password || '').trim().toUpperCase() === String(studentPassword || '').trim().toUpperCase()) || null;
        if (!credential) {
            alert(configuredStudentCredentials.length
                ? 'Contraseña de alumno incorrecta.'
                : 'Este salón todavía no tiene contraseñas de alumnos configuradas. El profesor debe guardar de nuevo la lista de alumnos.');
            return;
        }
        currentStudentCredentialId = credential.id;
        playerConfig.name = credential.name;
        await showStudentOnboarding(roomData, credential);
        return;
    } else {
        if (roomData.password) {
            const p = await promptForAccessValue({
                title: 'Ingreso de Maestro',
                description: 'Escribe la contraseña del maestro para abrir el salón.',
                placeholder: 'Contraseña del maestro',
                confirmLabel: 'Continuar',
                inputType: 'password'
            });
            if (!p || p !== roomData.password) return alert("Contraseña incorrecta");
        }
        isTeacher = true;
        currentSessionKind = SESSION_KIND_TEACHER;
        currentStudentCredentialId = '';
    }

    // Load Library items (Maestro todos, Alumno vacío)
    if (isTeacher) {
        // Teacher starts with active voxel-compatible blocks if inventory has no active entries
        const invSnap = await getDocs(collection(db, "lecturasGame", currentUserId, "mineblox_inventory"));
        const currentItems = invSnap.docs.map((d) => d.data() || {});
        if (invSnap.empty || !hasActiveInventoryItems(currentItems)) {
            getActiveItemsLibrary().forEach(async (item) => {
                if (item.category === 'build' || item.category === 'furniture') {
                    await addDoc(collection(db, "lecturasGame", currentUserId, "mineblox_inventory"), {
                        itemId: item.id, grantedBy: 'teacher_default', grantedAt: serverTimestamp()
                    });
                }
            });
        }
        const savedTeacherName = String(localStorage.getItem(`mineblox_name_${code}`) || '').trim();
        const requestedTeacherName = await promptForAccessValue({
            title: 'Nombre del Profesor',
            description: 'Escribe tu nombre para esta sesión de maestro.',
            placeholder: 'Nombre del profesor',
            confirmLabel: 'Entrar al salón',
            defaultValue: roomData.teacherName || savedTeacherName || 'Profesor',
            inputType: 'text'
        });
        if (!requestedTeacherName) {
            return;
        }
        playerConfig.name = requestedTeacherName;
        syncSkyCycleFromRoomData(roomData);
        applyRecessStateFromRoom(roomData);
        localStorage.setItem(`mineblox_name_${code}`, playerConfig.name);
        persistActiveSession();
        await enterLobby();
        return;
    }
}

async function showStudentOnboarding(roomData, credential = null) {
    if (!credential?.id || !credential?.name) {
        alert('No se pudo asociar ese acceso a un alumno válido.');
        return;
    }
    currentSessionKind = SESSION_KIND_STUDENT;
    currentStudentCredentialId = credential.id;
    playerConfig.name = credential.name;
    const savedAvatar = String(localStorage.getItem(getStudentAvatarStorageKey(currentRoomId, credential.id)) || '').trim();
    if (savedAvatar) {
        playerConfig.avatarId = savedAvatar;
        syncSkyCycleFromRoomData(roomData);
        applyRecessStateFromRoom(roomData);
        persistActiveSession();
        await enterLobby();
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'mineblox-modal';
    modal.innerHTML = `
        <div class="mineblox-modal-content">
            <h3>Bienvenido, ${escapeHtml(credential.name)}</h3>
            <p style="margin-top:0; color:#475569; font-size:13px;">Tu contraseña ya te identificó. Solo elige un avatar para continuar.</p>
            <div id="avatarPickerArea">
                <p>Elige tu Avatar:</p>
                <div class="mineblox-avatar-grid" id="onboardAvatars"></div>
                <button class="lecturas-game-pixel-btn is-primary" id="onboardFinishBtn" style="width:100%">¡Listo para Jugar!</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const renderAvatarOptions = () => {
        const grid = document.getElementById('onboardAvatars');
        AVATAR_PRESETS.forEach((p) => {
            const opt = document.createElement('div');
            opt.className = 'mineblox-avatar-option';
            opt.innerHTML = `<div class="mineblox-avatar-preview">${p.icon}</div><div>${p.name}</div>`;
            opt.onclick = () => {
                document.querySelectorAll('.mineblox-avatar-option').forEach((el) => el.classList.remove('selected'));
                opt.classList.add('selected');
                playerConfig.avatarId = p.id;
            };
            if (p.id === playerConfig.avatarId) opt.classList.add('selected');
            grid.appendChild(opt);
        });
    };

    document.getElementById('onboardFinishBtn').onclick = async () => {
        localStorage.setItem(getStudentAvatarStorageKey(currentRoomId, credential.id), playerConfig.avatarId);
        syncSkyCycleFromRoomData(roomData);
        applyRecessStateFromRoom(roomData);
        persistActiveSession();
        modal.remove();
        await enterLobby();
    };

    renderAvatarOptions();
}


// 3x3 Crafting Logic
let craftSlots = Array(9).fill(null);

function showCraftingModal() {
    craftSlots = Array(9).fill(null);
    const modal = document.getElementById('minebloxCraftModal');
    modal.style.display = 'flex';
    updateCraftGridUI();
}

window._minebloxSelectCraftSlot = (idx) => {
    // Pick the selected item from hotbar/inventory to put in slot
    if (!selectedItem) {
        alert("Selecciona un material de tu inventario primero");
        return;
    }
    craftSlots[idx] = selectedItem.itemId;
    updateCraftGridUI();
    checkCraftResult();
};

function updateCraftGridUI() {
    const slots = document.querySelectorAll('.mineblox-craft-slot');
    slots.forEach((s, i) => {
        const itemId = craftSlots[i];
        if (itemId) {
            const item = ITEMS_LIBRARY.find(it => it.id === itemId);
            s.innerHTML = item.icon;
            s.classList.add('active');
        } else {
            s.innerHTML = '';
            s.classList.remove('active');
        }
    });
}

function checkCraftResult() {
    const resDiv = document.getElementById('craftResult');
    const result = getCraftingResult();
    if (result) {
        const item = ITEMS_LIBRARY.find(i => i.id === result);
        resDiv.innerHTML = `Resultado: ${item.icon} ${item.name}`;
    } else {
        resDiv.innerHTML = 'Sin receta válida';
    }
}

function getCraftingResult() {
    const s = craftSlots;
    // Map grid: 0 1 2
    //          3 4 5
    //          6 7 8

    // CHAIR: Vert line of 2 wood
    if (s[1] === 'wood_plank' && s[4] === 'wood_plank' && !s[0] && !s[2] && !s[3] && !s[5] && !s[6] && !s[7] && !s[8]) return 'chair_wood';

    // TABLE: Top row wood + leg center
    if (s[0] === 'wood_plank' && s[1] === 'wood_plank' && s[2] === 'wood_plank' && s[4] === 'wood_plank') return 'table_wood';

    // DESK: Top row stone + leg center wood
    if (s[0] === 'stone_cobble' && s[1] === 'stone_cobble' && s[2] === 'stone_cobble' && s[4] === 'wood_plank') return 'desk_student';

    // BOOKSHELF: Middle row wood (3x)
    if (s[3] === 'wood_plank' && s[4] === 'wood_plank' && s[5] === 'wood_plank') return 'bookshelf';

    // DIAMOND BLOCK: All 9 slots grass (test/cheat recipe)
    if (s.every(v => v === 'grass_block')) return 'diamond_block';

    return null;
}

window._minebloxDoCraft = async () => {
    const resultId = getCraftingResult();
    if (!resultId) return alert("Receta inválida");

    if (!isRecessVirtualInventoryActive()) {
        const needed = craftSlots.filter(s => s !== null);
        for (const itemId of needed) {
            const found = userInventory.find(i => i.itemId === itemId);
            if (found) {
                await deleteDoc(doc(db, "lecturasGame", currentUserId, "mineblox_inventory", found.docId));
                userInventory.splice(userInventory.indexOf(found), 1);
            }
        }
    }

    if (isRecessVirtualInventoryActive()) {
        selectedItemTypeId = normalizeInventoryItemId(resultId);
        selectedItem = { itemId: resultId, docId: null, virtual: true };
        renderInventory();
        renderLibrary();
    } else {
        const invRef = collection(db, "lecturasGame", currentUserId, "mineblox_inventory");
        await addDoc(invRef, { itemId: resultId, grantedBy: 'crafting', grantedAt: serverTimestamp() });
    }
    alert("¡Item creado!");
    document.getElementById('minebloxCraftModal').style.display = 'none';
};

async function enterLobby() {
    // Save identifying code to recent
    const codeToSave = isTeacher ? currentRoomId : `A-${currentRoomId}`;
    let recent = JSON.parse(localStorage.getItem('minebloxRecentRooms') || '[]');
    if (!recent.includes(codeToSave)) {
        recent.unshift(codeToSave);
        recent = recent.slice(0, 5);
        localStorage.setItem('minebloxRecentRooms', JSON.stringify(recent));
    }
    persistActiveSession();

    const lobby = document.getElementById('minebloxLobby');
    const hud = document.getElementById('minebloxHUD');
    const uMenuWrapper = document.getElementById('unifiedMenuWrapper');
    const uDropdown = document.getElementById('unifiedDropdown');
    const uMenuBtn = document.getElementById('unifiedMenuBtn');

    if (lobby) lobby.style.pointerEvents = 'none';
    if (hud) hud.style.display = 'none';
    if (uMenuWrapper) uMenuWrapper.style.display = 'none';
    setActionStackVisible(false);
    setLocalChatPanelVisibility(false);
    if (uMenuBtn) {
        uMenuBtn.onclick = (e) => {
            e.stopPropagation();
            uDropdown.style.display = uDropdown.style.display === 'none' ? 'flex' : 'none';
        };
    }

    configureActionStackForRole();

    if (isTeacher) {
        // Teacher Dropdown options
        uDropdown.innerHTML = `
            ${createDropdownItemHtml({ id: 'toolbarShare', icon: 'bx-layout', label: 'Mostrar/Ocultar HUD', labelId: 'toolbarShareLabel' })}
            ${createDropdownItemHtml({ id: 'toolbarGallery', icon: 'bx-images', label: 'Galería' })}
            ${createDropdownItemHtml({ id: 'toolbarRecess', icon: 'bx-run', label: 'Iniciar Recreo', labelId: 'toolbarRecessLabel' })}
            ${createDropdownItemHtml({ id: 'toolbarClearWorld', icon: 'bx-trash', label: 'Limpiar Mundo' })}
            ${createDropdownItemHtml({ id: 'toolbarQuiz', icon: 'bx-list-check', label: 'Config. Quizzes' })}
            ${createDropdownItemHtml({ id: 'toolbarMute', icon: 'bx-volume-mute', label: 'Silenciar Alumnos' })}
            ${createDropdownItemHtml({ id: 'toolbarConfig', icon: 'bx-cog', label: 'Ajustes del Aula' })}
            ${createDropdownItemHtml({ id: 'toolbarLogout', icon: 'bx-log-out', label: 'Salir de sesión' })}
        `;

        const roomIdContainer = document.getElementById('minebloxRoomId');
        if (roomIdContainer) {
            roomIdContainer.innerHTML = getTeacherAccessPanelHtml(roomDataSnapshot || {
                roomName,
                studentList: extractStudentNames(roomDataSnapshot || {}),
                studentCredentials: extractStudentCredentials(roomDataSnapshot || {})
            });
        }

        // Bind events
        const bindBtn = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.onclick = () => { fn(); uDropdown.style.display = 'none'; };
        };
        bindBtn('toolbarReward', showRewardPanel);
        bindBtn('toolbarGallery', () => openGalleryModal('shared'));
        bindBtn('toolbarRecess', toggleRecessMode);
        bindBtn('toolbarClearWorld', handleClearWorldAction);
        bindBtn('toolbarQuiz', showConfigQuizzes);
        bindBtn('toolbarConfig', showTeacherConfig);
        bindBtn('toolbarMute', showMutePanel);
        bindBtn('toolbarWB', showWhiteboardConfig);
        bindBtn('toolbarChatToggle', () => toggleChatVisibility());
        bindBtn('toolbarLogout', exitGameSession);

        const mapBtn = document.getElementById('toolbarMap');
        if (mapBtn) mapBtn.onclick = () => { toggleMapHUD(); setActionStackExpanded(false); };
        const rocketBtn = document.getElementById('toolbarRocket');
        if (rocketBtn) rocketBtn.onclick = () => { openRocketTravelMenu(); setActionStackExpanded(false); };

        const closeMapBtn = document.getElementById('closeMapBtn');
        if (closeMapBtn) closeMapBtn.onclick = () => toggleMapHUD(false);

        const mapCanvas = document.getElementById('minebloxMapCanvas');
        if (mapCanvas) mapCanvas.onclick = (e) => handleMapHUDClick(e);
        bindBtn('toolbarShare', () => {
            document.getElementById('minebloxHUD').style.opacity = document.getElementById('minebloxHUD').style.opacity === '0' ? '1' : '0';
        });

        loadUserInventory();
        showMinebloxInvBar();
        loadRoomQuizzes();
        if (!USE_VOXELJS_ENGINE) {
            window.setTimeout(async () => {
                const roomItemsSnap = await getDocs(collection(db, "mineblox_rooms", currentRoomId, "items")).catch(() => null);
                if (roomItemsSnap?.empty) {
                    populateDefaultClassroom().catch(() => { });
                }
            }, 0);
            const viewModeBtn = document.getElementById('viewModeBtn');
            if (viewModeBtn) viewModeBtn.style.display = 'flex';
        } else {
            applyVoxelJsUiOverrides();
        }
        watchOwnPlayerDoc();

    } else {
        // Student Dropdown options
        uDropdown.innerHTML = `
            ${createDropdownItemHtml({ id: 'stdHistoryBtn', icon: 'bx-history', label: 'Historial' })}
            ${createDropdownItemHtml({ id: 'stdGalleryBtn', icon: 'bx-images', label: 'Galería' })}
            ${createDropdownItemHtml({ id: 'stdHideHudBtn', icon: 'bx-layout', label: 'Mostrar/Ocultar HUD', labelId: 'stdHideHudLabel' })}
            ${createDropdownItemHtml({ id: 'studentLogout', icon: 'bx-log-out', label: 'Salir de sesión' })}
        `;

        document.getElementById('minebloxUserName').textContent = `Estudiante: ${playerConfig.name}`;
        renderRoomIdOnly(document.getElementById('minebloxRoomId'), currentRoomId);

        const bindBtn = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.onclick = () => { fn(); uDropdown.style.display = 'none'; };
        };
        bindBtn('stdHistoryBtn', () => window._minebloxShowHistory());
        bindBtn('stdGalleryBtn', () => openGalleryModal('shared'));
        bindBtn('stdHideHudBtn', () => {
            document.getElementById('minebloxHUD').style.opacity = document.getElementById('minebloxHUD').style.opacity === '0' ? '1' : '0';
        });
        bindBtn('studentChatToggle', () => toggleChatVisibility());
        bindBtn('studentLogout', exitGameSession);
        const studentRocketBtn = document.getElementById('toolbarRocket');
        if (studentRocketBtn) studentRocketBtn.onclick = () => { openRocketTravelMenu(); setActionStackExpanded(false); };

        showMinebloxInvBar();
        document.getElementById('minebloxCraftOpenBtn').style.display = 'block';
        loadUserInventory();
        setupStudentListeners();
        if (!USE_VOXELJS_ENGINE) {
            const viewModeBtn = document.getElementById('viewModeBtn');
            if (viewModeBtn) viewModeBtn.style.display = 'flex';
        } else {
            applyVoxelJsUiOverrides();
        }
        watchOwnPlayerDoc();
    }

    if (!USE_VOXELJS_ENGINE) {
        // Reset movement to avoid 'ghost' movement. Use safe lobby spawn first while the world finishes mounting.
        resetMovementState();
        resetPlayerToLobbySpawn({ persist: false });
    }
    document.getElementById('minebloxCraftOpenBtn').onclick = () => showCraftingModal();

    // UI Events
    document.getElementById('chatForm').onsubmit = (e) => {
        e.preventDefault();
        sendChatMessage();
    };

    const micBtn = document.getElementById('micBtn');
    if (micBtn) {
        micBtn.onclick = () => {
            toggleMic().catch(() => {
                syncMicButtonUi();
            });
        };
    }
    const photoCaptureBtn = document.getElementById('photoCaptureBtn');
    if (photoCaptureBtn) {
        photoCaptureBtn.onclick = () => openPhotoModal();
    }
    if (!USE_VOXELJS_ENGINE) {
        const viewModeBtn = document.getElementById('viewModeBtn');
        if (viewModeBtn) {
            viewModeBtn.onclick = () => {
                togglePlayerViewMode();
                ensureAudioContext()?.resume?.().catch(() => { });
            };
            setPlayerViewMode(playerViewMode);
        }
    }

    if (lobby) {
        lobby.style.pointerEvents = '';
        lobby.style.display = 'none';
    }
    uiContainer?.classList?.remove('mineblox-ui--lobby');
    if (hud) hud.style.display = 'flex';
    if (uMenuWrapper) uMenuWrapper.style.display = 'block';
    setActionStackVisible(true);
    setupChatListener();
    initVoiceChat().catch(() => { });

    if (USE_VOXELJS_ENGINE) {
        applyVoxelJsUiOverrides();
        startVoxelJsWorldForRoom().catch((error) => {
            console.warn('[ASCraft] VoxelJS init failed:', error);
        });
        return;
    }

    startNetworkSync();
    window.setTimeout(() => {
        ensureRoomShellMesh()
            .then(async () => {
                const preferredSpawnState = getPreferredSpawnState();
                const preferredSpawnVector = new THREE.Vector3(
                    Number(preferredSpawnState?.x || 0),
                    Number(preferredSpawnState?.y || (getRoomWorldFloorY() + PLAYER_EYE_HEIGHT)),
                    Number(preferredSpawnState?.z || 0)
                );
                const shouldBootOutside = !isPositionInsideRoomBounds(preferredSpawnVector);
                resetPlayerToPreferredSpawn();
                queueProgressiveSceneStreaming();
                if (shouldBootOutside) {
                    if (progressiveOutdoorRestoreTimeoutId) {
                        window.clearTimeout(progressiveOutdoorRestoreTimeoutId);
                    }
                    progressiveOutdoorRestoreTimeoutId = window.setTimeout(() => {
                        ensureTravelSceneProps()
                            .then(() => ensureLocalWorldMeshes())
                            .catch(() => { })
                            .finally(() => {
                                progressiveOutdoorRestoreTimeoutId = null;
                            });
                    }, 120);
                }
            })
            .catch(() => { });
    }, 0);
}

const QUIZ_CATEGORIES = {
    "Lenguaje y comunicación": ["Ortografía", "Gramática", "expresión oral", "expresión escrita", "habilidades", "trazos y letras"],
    "Ciencias experimentales": ["Naturales", "Conocimiento del medio", "Mi Localidad"],
    "Formación socioemocional": ["Socioemocional", "Formación Cívica y Ética"],
    "Ciencias sociales": ["Historia", "Geografia"],
    "Matemáticas": ["Cálculo", "Lógica", "Geometría"]
};

function updateRoomRating(pointsToAdd) {
    if (!currentRoomId || !isTeacher) return;
    roomRating.score += pointsToAdd;
    roomRating.level = Math.floor(roomRating.score / 100) + 1;

    updateDoc(doc(db, "mineblox_rooms", currentRoomId), {
        rating: roomRating
    });
}

function setupChatListener() {
    const chatRef = collection(db, "mineblox_rooms", currentRoomId, "chat");
    const qChat = query(chatRef, where("timestamp", ">", new Date(Date.now() - 600000))); // last 10 mins
    onSnapshot(qChat, (snap) => {
        snap.docChanges().forEach(change => {
            if (change.type === 'added') {
                renderChatMessage(change.doc.data());
            }
        });
    });
}

async function toggleChatVisibility() {
    setLocalChatPanelVisibility(!chatPanelOpenLocal);
    if (chatPanelOpenLocal) {
        document.getElementById('chatInput')?.focus?.();
    }
}

function updateRecessUiState() {
    const recessLabel = document.getElementById('toolbarRecessLabel');
    if (recessLabel) {
        recessLabel.textContent = recessModeActive ? 'Pausar Recreo' : 'Iniciar Recreo';
    }
    const autoLabel = document.getElementById('minebloxRecessStatus');
    if (autoLabel) {
        if (isAutoRecessActive()) {
            autoLabel.textContent = 'Recreo automático';
            autoLabel.style.display = 'inline-flex';
        } else if (getEffectiveRecessMode()) {
            autoLabel.textContent = 'Recreo activo';
            autoLabel.style.display = 'inline-flex';
        } else {
            autoLabel.style.display = 'none';
        }
    }
}

function applyRecessStateFromRoom(data = {}) {
    const nextRecessMode = data?.recessMode === true;
    const nextRecessEpoch = Number(data?.recessEpoch || 0);
    const prevMode = recessModeActive;
    recessModeActive = nextRecessMode;

    if (lastRecessEpochSeen === null) {
        lastRecessEpochSeen = nextRecessEpoch;
    } else if (!isTeacher && nextRecessEpoch !== lastRecessEpochSeen && prevMode && !nextRecessMode) {
        exitSeatedState();
        resetMovementState();
        resetPlayerToLobbySpawn();
    }
    lastRecessEpochSeen = nextRecessEpoch;

    if (!getEffectiveRecessMode() && selectedItem?.virtual) {
        selectedItem = null;
        selectedItemTypeId = null;
    }
    updateRecessUiState();
    renderInventory();
    renderLibrary();
}

function applyAutomaticRecessState(nextAutoRecess) {
    const resolved = !isTeacher && !!nextAutoRecess;
    const prevEffective = getEffectiveRecessMode();
    autoRecessNoTeacher = resolved;
    const nextEffective = getEffectiveRecessMode();
    if (!nextEffective && selectedItem?.virtual) {
        selectedItem = null;
        selectedItemTypeId = null;
    }
    if (roomDoor) {
        setDoorOpenState(roomDoor, getDoorShouldBeOpen(roomDoor.userData?.roomDoorPersistedOpen));
    }
    if (prevEffective !== nextEffective) {
        renderInventory();
        renderLibrary();
    }
    updateRecessUiState();
}

async function toggleRecessMode() {
    if (!isTeacher || !currentRoomId) return;
    const roomRef = doc(db, "mineblox_rooms", currentRoomId);
    const nextMode = !recessModeActive;
    const nextEpoch = (Number(lastRecessEpochSeen || 0) + 1);
    await updateDoc(roomRef, {
        recessMode: nextMode,
        recessEpoch: nextEpoch,
        recessUpdatedAt: serverTimestamp(),
        doorOpen: nextMode
    });
}

function renderChatMessage(m) {
    const chatMsgs = document.getElementById('chatMsgs');
    const div = document.createElement('div');
    div.className = 'mineblox-chat-msg';
    const sender = document.createElement('b');
    sender.textContent = `${String(m?.sender || 'Anónimo')}:`;
    const text = document.createTextNode(` ${String(m?.text || '')}`);
    div.append(sender, text);
    chatMsgs.appendChild(div);
    chatMsgs.scrollTop = chatMsgs.scrollHeight;
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const text = sanitizePlainText(input?.value, 600);
    if (!text) return;

    await addDoc(collection(db, "mineblox_rooms", currentRoomId, "chat"), {
        sender: sanitizePlainText(playerConfig.name, 100) || "Anónimo",
        text: text,
        timestamp: serverTimestamp()
    });
    input.value = '';
}

async function ensureLocalVoiceStream() {
    if (localStream) {
        const liveTrack = localStream.getAudioTracks().find((track) => track.readyState === 'live');
        if (liveTrack) return localStream;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStream = stream;
    return localStream;
}

function stopLocalVoiceStream() {
    if (!localStream) return;
    localStream.getTracks().forEach((track) => {
        try { track.stop(); } catch (_) { }
    });
    localStream = null;
}

async function connectVoiceToPeers() {
    if (!peer || !currentRoomId || !currentUserId || !micEnabled) return;
    const stream = await ensureLocalVoiceStream().catch(() => null);
    if (!stream) return;
    const snap = await getDocs(collection(db, "mineblox_rooms", currentRoomId, "players")).catch(() => null);
    if (!snap) return;
    snap.forEach((docSnap) => {
        if (docSnap.id === currentUserId) return;
        const data = docSnap.data() || {};
        const peerId = String(data.peerId || '');
        if (!peerId || activeVoiceCalls.has(peerId)) return;
        try {
            const call = peer.call(peerId, stream);
            if (call) {
                handleCall(call);
            }
        } catch (_) { }
    });
}

async function toggleMic() {
    const nextEnabled = !micEnabled;
    micEnabled = nextEnabled;
    if (nextEnabled) {
        const stream = await ensureLocalVoiceStream().catch(() => null);
        if (!stream) {
            micEnabled = false;
        } else {
            stream.getAudioTracks().forEach((track) => {
                track.enabled = true;
            });
            activeVoiceCalls.forEach((call) => {
                try { call.close?.(); } catch (_) { }
            });
            activeVoiceCalls.clear();
            await connectVoiceToPeers().catch(() => { });
        }
    } else {
        if (localStream) {
            localStream.getAudioTracks().forEach((track) => {
                track.enabled = false;
            });
        }
        stopLocalVoiceStream();
    }
    if (currentRoomId && currentUserId && db) {
        setDoc(doc(db, "mineblox_rooms", currentRoomId, "players", currentUserId), { micOn: micEnabled }, { merge: true }).catch(() => { });
    }
    syncMicButtonUi();
}

function syncMicButtonUi() {
    const hasActiveMicTrack = !!(localStream && localStream.getAudioTracks().some((track) => track.readyState === 'live' && track.enabled));
    micEnabled = hasActiveMicTrack;
    const btn = document.getElementById('micBtn');
    const icon = btn?.querySelector('i');
    const btnText = document.getElementById('micBtnText');
    if (btn) {
        btn.classList.toggle('active', micEnabled);
        btn.style.background = micEnabled ? '#10b981' : '#ef4444';
    }
    if (icon) {
        icon.className = `bx ${micEnabled ? 'bx-microphone' : 'bx-microphone-off'}`;
    }
    if (btnText) {
        btnText.textContent = isTeacher ? (micEnabled ? 'HABLAR: ENCENDIDO' : 'HABLAR: APAGADO') : (micEnabled ? 'MICRO: ON' : 'MICRO: OFF');
    }
}

async function showMutePanel() {
    const modal = document.createElement('div');
    modal.className = 'mineblox-modal';
    const snap = await getDocs(collection(db, "mineblox_rooms", currentRoomId, "players"));
    let students = [];
    snap.forEach(d => { if (d.id !== currentUserId) students.push({ id: d.id, ...d.data() }); });

    modal.innerHTML = `
        <div class="mineblox-modal-content">
            <h3>Silenciar Alumnos</h3>
            <div style="max-height:300px; overflow-y:auto">
                ${students.map(s => `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee">
                        <span style="color:#333">${s.displayName} ${s.micOn ? '🔊' : '🔇'}</span>
                        <button class="lecturas-game-pixel-btn" style="width:auto; font-size:10px" data-mineblox-action="remote-mute" data-student-id="${escapeHtml(s.id)}">Silenciar</button>
                    </div>
                `).join('') || '<p>No hay alumnos conectados.</p>'}
            </div>
            <button class="lecturas-game-pixel-btn" data-mineblox-action="close-parent-modal" style="margin-top:10px">Cerrar</button>
        </div>
    `;
    document.body.appendChild(modal);
}

window._minebloxRemoteMute = (sid) => {
    setDoc(doc(db, "mineblox_rooms", currentRoomId, "players", sid), { forceMute: true }, { merge: true });
    alert("Comando de silencio enviado");
};

async function populateDefaultClassroom() {
    const col = collection(db, "mineblox_rooms", currentRoomId, "items");
    // Start very minimal
    await addDoc(col, { itemId: 'desk_teacher', x: 0, y: 0.5, z: -4.5 });
}

function terrainNoise(x, z) {
    const seed = Math.sin((x * 12.9898) + (z * 78.233)) * 43758.5453;
    return seed - Math.floor(seed);
}

const OUTDOOR_LAYOUT_PROFILE = Object.freeze({
    default_classroom_planet_v1: Object.freeze({
        patioInset: 4,
        frontPlaza: null,
        lateralPads: null,
        tunnelHalfWidth: 3,
        tunnelExtraLength: 30,
        frontalCross: null,
        lateralWalkways: null,
        innerCross: null
    }),
    hero_classroom_planet_v1: Object.freeze({
        patioInset: 4,
        frontPlaza: Object.freeze({ halfWidth: 34, zMinOffset: 2, zMax: 62 }),
        lateralPads: Object.freeze({ xMin: 46, xMax: 66, zMin: 8, zMax: 36 }),
        tunnelHalfWidth: 2,
        tunnelExtraLength: 55,
        frontalCross: Object.freeze({ z: 56, halfDepth: 2, halfWidth: 70 }),
        lateralWalkways: Object.freeze({ x: 56, halfWidth: 2, zMin: 8, zMax: 58 }),
        innerCross: Object.freeze({ z: 22, halfDepth: 1, halfWidth: 34 })
    })
});

function getOutdoorLayoutProfile() {
    const preset = getActiveScenePresetConfig();
    return OUTDOOR_LAYOUT_PROFILE[preset.id] || OUTDOOR_LAYOUT_PROFILE.default_classroom_planet_v1;
}

function shouldBuildOutdoorPatioTile(x, z, profile = getOutdoorLayoutProfile()) {
    const safeProfile = profile || OUTDOOR_LAYOUT_PROFILE.default_classroom_planet_v1;
    const patioInset = Number(safeProfile.patioInset || 4);
    const patioHalfX = Math.floor((ROOM_WIDTH * 0.5) + patioInset);
    const patioHalfZ = Math.floor((ROOM_DEPTH * 0.5) + patioInset);
    const innerHalfX = Math.floor((ROOM_WIDTH * 0.5) + 0);
    const innerHalfZ = Math.floor((ROOM_DEPTH * 0.5) + 0);
    const insideOuter = Math.abs(x) <= patioHalfX && Math.abs(z) <= patioHalfZ;
    const insideInner = Math.abs(x) <= innerHalfX && Math.abs(z) <= innerHalfZ;
    const basePatio = insideOuter && !insideInner;

    const frontPlaza = safeProfile.frontPlaza
        ? (
            Math.abs(x) <= Number(safeProfile.frontPlaza.halfWidth || 0)
            && z >= Math.floor((ROOM_DEPTH * 0.5) + Number(safeProfile.frontPlaza.zMinOffset || 0))
            && z <= Number(safeProfile.frontPlaza.zMax || 0)
        )
        : false;
    const lateralPads = safeProfile.lateralPads
        ? (
            Math.abs(x) >= Number(safeProfile.lateralPads.xMin || 0)
            && Math.abs(x) <= Number(safeProfile.lateralPads.xMax || 0)
            && z >= Number(safeProfile.lateralPads.zMin || 0)
            && z <= Number(safeProfile.lateralPads.zMax || 0)
        )
        : false;
    return basePatio || frontPlaza || lateralPads;
}

function shouldBuildOutdoorPathTile(x, z, profile = getOutdoorLayoutProfile()) {
    const safeProfile = profile || OUTDOOR_LAYOUT_PROFILE.default_classroom_planet_v1;
    const tunnelHalfWidth = Number.isFinite(Number(safeProfile.tunnelHalfWidth)) ? Number(safeProfile.tunnelHalfWidth) : 3;
    const tunnelStartZ = Math.floor((ROOM_DEPTH / 2) - 1);
    const tunnelExtraLength = Number.isFinite(Number(safeProfile.tunnelExtraLength)) ? Number(safeProfile.tunnelExtraLength) : 30;
    const tunnelEndZ = tunnelStartZ + tunnelExtraLength;
    const basePath = Math.abs(x) <= tunnelHalfWidth && z >= tunnelStartZ && z <= tunnelEndZ;

    const frontalCross = safeProfile.frontalCross
        ? (
            Math.abs(z - Number(safeProfile.frontalCross.z || 0)) <= Number(safeProfile.frontalCross.halfDepth || 0)
            && Math.abs(x) <= Number(safeProfile.frontalCross.halfWidth || 0)
        )
        : false;
    const lateralWalkways = safeProfile.lateralWalkways
        ? (
            Math.abs(Math.abs(x) - Number(safeProfile.lateralWalkways.x || 0)) <= Number(safeProfile.lateralWalkways.halfWidth || 0)
            && z >= Number(safeProfile.lateralWalkways.zMin || 0)
            && z <= Number(safeProfile.lateralWalkways.zMax || 0)
        )
        : false;
    const innerCross = safeProfile.innerCross
        ? (
            Math.abs(z - Number(safeProfile.innerCross.z || 0)) <= Number(safeProfile.innerCross.halfDepth || 0)
            && Math.abs(x) <= Number(safeProfile.innerCross.halfWidth || 0)
        )
        : false;
    return basePath || frontalCross || lateralWalkways || innerCross;
}

function buildOutdoorWorldBlocks(options = {}) {
    const blocks = new Map();
    const requestedRadius = Number(options.radius);
    const radius = Number.isFinite(requestedRadius)
        ? THREE.MathUtils.clamp(Math.round(requestedRadius), 24, OUTDOOR_WORLD_RADIUS)
        : OUTDOOR_WORLD_RADIUS;
    const shellRadius = OUTDOOR_WORLD_RADIUS;
    const includePlanetShell = options.includePlanetShell !== false;
    const includeSurfaceColumns = options.includeSurfaceColumns === true;
    const useFastFaceGeneration = options.fastFaceGeneration !== false;
    const xMin = Number.isFinite(Number(options.xMin))
        ? THREE.MathUtils.clamp(Math.round(Number(options.xMin)), -shellRadius, shellRadius)
        : -radius;
    const xMax = Number.isFinite(Number(options.xMax))
        ? THREE.MathUtils.clamp(Math.round(Number(options.xMax)), -shellRadius, shellRadius)
        : radius;
    const zMin = Number.isFinite(Number(options.zMin))
        ? THREE.MathUtils.clamp(Math.round(Number(options.zMin)), -shellRadius, shellRadius)
        : -radius;
    const zMax = Number.isFinite(Number(options.zMax))
        ? THREE.MathUtils.clamp(Math.round(Number(options.zMax)), -shellRadius, shellRadius)
        : radius;
    const faceFilterSet = Array.isArray(options.faceFilter) && options.faceFilter.length
        ? new Set(options.faceFilter.map((face) => String(face || '').trim().toLowerCase()).filter(Boolean))
        : null;
    const shouldBuildFace = (faceId) => !faceFilterSet || faceFilterSet.has(String(faceId || '').trim().toLowerCase());
    const centerY = -shellRadius;
    const nextTreeAnchors = [];
    const nextBlossomAnchors = [];
    const planetCenter = getEarthCenter();
    const scratchVec1 = new THREE.Vector3();
    const scratchVec2 = new THREE.Vector3();

    const applySurfaceOrientationMeta = (meta = {}, x, y, z) => {
        return meta; // No curvature needed for cubic planet
    };

    const pushBlock = (itemId, x, y, z, layer, meta = {}, replace = false, scale = null) => {
        const snappedX = Math.round(x);
        const snappedY = Math.round(y);
        const snappedZ = Math.round(z);
        const key = snappedX + '|' + snappedY + '|' + snappedZ;

        if (!isProtectedOutdoorDestructionVoxel(snappedX, snappedY, snappedZ)) {
            const removedKey = snappedX + '|' + snappedY + '|' + snappedZ; // Simple string concat is faster
            if (outdoorTerrainRemovedVoxelKeys.has(removedKey)) return;
        }

        if (blocks.has(key) && !replace) return;
        blocks.set(key, {
            itemId,
            x: snappedX,
            y: snappedY,
            z: snappedZ,
            terrain: true,
            layer,
            scale,
            ...meta
        });
    };

    const pushOverlayBlock = (itemId, x, y, z, layer, meta = {}, scale = null) => {
        const key = `${itemId}:${x.toFixed(2)}|${y.toFixed(2)}|${z.toFixed(2)}`;
        blocks.set(key, {
            itemId,
            x,
            y,
            z,
            terrain: true,
            layer,
            scale,
            ...meta
        });
    };

    const patioFloorY = getSchoolPatioFloorY();
    const pathFloorY = getEntryTunnelFloorY();

    const placeColumn = (x, z, topItemId, meta = {}) => {
        const surfaceY = getOutdoorTerrainSurfaceY(x, z);
        if (surfaceY === null) return;
        if (isEntryTunnelCell(x, Math.round(surfaceY), z)) {
            pushBlock('stone_cobble', x, getEntryTunnelFloorY(), z, 0, { structure: 'entry_tunnel', role: 'floor' }, true);
            return;
        }
        const cellKey = getOutdoorTerrainCellKey(x, z);
        const removeTopLayer = outdoorTerrainRemovedTopCells.has(cellKey);
        const topY = Math.round(surfaceY);
        for (let layer = 0; layer < OUTDOOR_TERRAIN_DEPTH; layer += 1) {
            if (layer === 0 && removeTopLayer) continue;
            const y = topY - layer;
            const itemId = layer === 0 ? topItemId : 'dirt_block';
            const blockMeta = layer === 0
                ? applySurfaceOrientationMeta({ ...meta, role: 'surface' }, x, y, z)
                : meta;
            pushBlock(itemId, x, y, z, layer, blockMeta, layer === 0 && topItemId !== 'grass_block');
        }

    };

    const placeSurfaceTile = (itemId, x, z, meta = {}, explicitY = null) => {
        const supportY = Number.isFinite(explicitY) ? explicitY : getOutdoorRenderableSupportY(x, z);
        if (!Number.isFinite(supportY)) return;
        const isFlatStructureTile = meta?.structure === 'entry_tunnel' || meta?.structure === 'school_patio';
        pushBlock(itemId, x, supportY, z, 0, {
            ...(isFlatStructureTile ? meta : applySurfaceOrientationMeta(meta, x, supportY, z)),
            role: 'surface',
            terrainShape: isFlatStructureTile ? 'flat' : 'planet'
        }, true);
    };

    const layoutProfile = getOutdoorLayoutProfile();
    const shouldBuildPatioTile = (x, z) => shouldBuildOutdoorPatioTile(x, z, layoutProfile);
    const shouldBuildPathTile = (x, z) => shouldBuildOutdoorPathTile(x, z, layoutProfile);

    const columnsBuildRadius = radius; // Cover the full cubic face
    const shouldBuildTopFace = shouldBuildFace('top');
    const shouldProcessTopSurfaceColumns = includeSurfaceColumns && shouldBuildTopFace;
    const shouldProcessTopStructureTiles = !includeSurfaceColumns && shouldBuildTopFace;
    if (shouldProcessTopSurfaceColumns || shouldProcessTopStructureTiles) {
        for (let x = xMin; x <= xMax; x += 1) {
            if (Math.abs(x) > radius) continue;
            for (let z = zMin; z <= zMax; z += 1) {
                const cubicDist = Math.max(Math.abs(x), Math.abs(z));
                if (cubicDist > radius) continue;
                if (shouldProcessTopSurfaceColumns && cubicDist <= columnsBuildRadius) {
                    if (!isRoomClearanceCell(x, z)) {
                        let topItemId = 'grass_block';
                        let structureRole = 'surface';

                        if (isRiverCell(x, z)) {
                            topItemId = 'grass_block';
                        }

                        placeColumn(x, z, topItemId, {
                            columnX: x,
                            columnZ: z,
                            terrainShape: 'planet',
                            role: structureRole
                        });
                    }
                }

                if (shouldProcessTopStructureTiles) {
                    if (shouldBuildPatioTile(x, z)) {
                        placeSurfaceTile('tile_floor', x, z, { structure: 'school_patio', columnX: x, columnZ: z }, patioFloorY);
                    } else if (shouldBuildPathTile(x, z)) {
                        placeSurfaceTile('stone_cobble', x, z, { structure: 'entry_tunnel', columnX: x, columnZ: z }, pathFloorY);
                    }
                }
            }
        }
    }



    if (includePlanetShell) {
        const roomFloorY_int = Math.floor(getRoomWorldFloorY()) - 4;
        const roomCeilY_int = Math.ceil(getRoomWorldCeilingY()) + 2;
        const R = shellRadius;

        const addCubeFaceBlock = (gx, gy, gz, topItem, depthAxis, depthSign, role, extra = null) => {
            const isRoomCell = depthAxis === 'y' && depthSign === -1 && isRoomClearanceCell(gx, gz);
            const isPatioCell = depthAxis === 'y' && depthSign === -1 && shouldBuildPatioTile(gx, gz);
            const isPathCell = depthAxis === 'y' && depthSign === -1 && shouldBuildPathTile(gx, gz);
            if (isRoomCell && gy >= roomFloorY_int && gy <= roomCeilY_int) return;
            if ((isPatioCell || isPathCell) && gy >= ((isPathCell ? pathFloorY : patioFloorY) - 1)) return;
            if (depthAxis === 'y' && depthSign === -1 && isEntryTunnelCell(gx, gy, gz)) {
                if (gy === getEntryTunnelFloorY()) {
                    pushBlock('stone_cobble', gx, gy, gz, 0, { structure: 'entry_tunnel', role: 'floor' }, true);
                }
                return;
            }

            const isBottom = depthAxis === 'y' && depthSign === 1;
            const isLeft = depthAxis === 'x' && depthSign === 1; // x=-R, depth +X
            const isRight = depthAxis === 'x' && depthSign === -1; // x=R, depth -X
            const isFront = depthAxis === 'z' && depthSign === -1; // z=R, depth -Z
            const isBack = depthAxis === 'z' && depthSign === 1; // z=-R, depth +Z

            let finalTopItem = (extra && extra.topItem) ? extra.topItem : topItem;
            let finalSubItem = (extra && extra.subItem) ? extra.subItem : 'dirt_block';
            let startLayer = (extra && typeof extra.startLayer !== 'undefined') ? extra.startLayer : 0;
            let layers = 3;
            let waterSurfaceLayers = 0;
            let addFeature = null;

            const faceY = gy - (-R); // Y relative to face center
            const faceZ = gz - 0;      // Z relative to face center
            const faceXForX = gx - 0;  // X relative for top/bottom

            if (role !== 'soccer_field' && role !== 'volleyball_court' && useFastFaceGeneration) {
                if (isBottom) {
                    finalTopItem = 'grass_block';
                    finalSubItem = 'dirt_block';
                    layers = 4;
                } else if (isLeft) {
                    finalTopItem = 'sand_block';
                    finalSubItem = 'sand_block';
                    layers = 6;
                } else if (isRight) {
                    finalTopItem = 'water_still';
                    finalSubItem = 'sand_block';
                    startLayer = 0;
                    const oceanMacro = valueNoise3D(gx * 0.06, gy * 0.06, gz * 0.06, 1801);
                    const oceanDetail = valueNoise3D(gx * 0.14, gy * 0.14, gz * 0.14, 1802);
                    layers = 18 + Math.floor(oceanMacro * 8);
                    waterSurfaceLayers = Math.max(10, Math.min(layers - 4, 10 + Math.floor((oceanMacro * 7) + (oceanDetail * 4))));
                } else if (isBack) {
                    finalTopItem = 'grass_block';
                    finalSubItem = 'dirt_block';
                    layers = 5;
                    const forestNoise = valueNoise3D(gx, gy, gz, 811);
                    if (Math.abs(faceY) < 94 && Math.abs(faceXForX) < 98 && forestNoise > 0.9965) {
                        addFeature = 'tree';
                    }
                } else if (isFront) {
                    finalTopItem = 'stone_cobble';
                    finalSubItem = 'stone_block';
                    layers = 6;
                }
            } else if (role !== 'soccer_field' && role !== 'volleyball_court') {
                if (isBottom) {
                    finalTopItem = 'grass_block';
                    finalSubItem = 'dirt_block';
                    // Snow Palace / Ice Fort
                    if (Math.abs(faceXForX) < 15 && Math.abs(faceZ) < 15) {
                        const distToP = Math.max(Math.abs(faceXForX), Math.abs(faceZ));
                        if (distToP < 12) {
                            const h = Math.floor(10 - distToP);
                            if (h > 0) {
                                startLayer = -h;
                                finalTopItem = 'grass_block';
                                finalSubItem = 'dirt_block';
                                // Hollow room
                                if (h > 1 && distToP < 8) startLayer = 0;
                            }
                        }
                    }
                } else if (isLeft) { // Desert (-X)
                    finalTopItem = 'sand_block';
                    finalSubItem = 'sand_block';
                    if (Math.random() < 0.003) addFeature = 'cactus';

                    // Realistic Giza Pyramids (Limestone/Stone blocks)
                    const pyramids = [
                        { y: -R + 30, z: 25, size: 24, item: 'stone_block' },
                        { y: -R - 10, z: -10, size: 20, item: 'stone_block' },
                        { y: -R + 60, z: -45, size: 14, item: 'stone_block' }
                    ];

                    for (const pyr of pyramids) {
                        const relY = gy - pyr.y;
                        const relZ = gz - pyr.z;
                        const dist = Math.max(Math.abs(relY), Math.abs(relZ));
                        if (dist < pyr.size) {
                            const h = pyr.size - Math.floor(dist);
                            if (h > 0) {
                                startLayer = -h;
                                finalTopItem = pyr.item;
                                finalSubItem = pyr.item;
                                // Hollow with entrance
                                const isEntrance = Math.abs(relZ) < 2 && relY > -pyr.size && relY < 0 && Math.abs(relY) < 4;
                                if (dist < (pyr.size - 1) && !isEntrance) {
                                    startLayer = 0;
                                } else if (isEntrance) {
                                    startLayer = 0;
                                }
                            }
                        }
                    }
                    // Detailed Sphinx
                    const sDistY = gy - (-R - 45);
                    const sDistZ = gz - (35);
                    if (Math.abs(sDistY) < 12 && Math.abs(sDistZ) < 6) {
                        const bodyH = (sDistZ > 0) ? 7 : 5;
                        const headH = (Math.abs(sDistY) < 3 && sDistZ > 0) ? 10 : 0;
                        const h = Math.max(bodyH, headH);
                        if (h > 0) {
                            startLayer = -h;
                            finalTopItem = 'stone_block';
                            finalSubItem = 'stone_block';
                        }
                    }

                } else if (isRight) { // Ocean (+X)
                    finalTopItem = 'water_still';
                    finalSubItem = 'sand_block';
                    startLayer = 0;
                    const oceanMacro = valueNoise3D(gx * 0.045, gy * 0.045, gz * 0.045, 2801);
                    const oceanDetail = valueNoise3D(gx * 0.11, gy * 0.11, gz * 0.11, 2802);
                    layers = 28 + Math.floor(oceanMacro * 12);
                    waterSurfaceLayers = Math.max(14, Math.min(layers - 5, 16 + Math.floor((oceanMacro * 8) + (oceanDetail * 5))));

                    // Poseidon's Glass Temple (Center of Ocean)
                    if (Math.abs(faceY) < 18 && Math.abs(faceZ) < 18) {
                        const distToP = Math.max(Math.abs(faceY), Math.abs(faceZ));
                        if (distToP < 12) {
                            startLayer = 0;
                            finalTopItem = 'glass_block';
                            finalSubItem = 'stone_brick';
                            waterSurfaceLayers = 0;
                        }
                    }
                } else if (isBack) { // Forest (-Z)
                    finalTopItem = 'grass_block';
                    if (Math.random() < 0.015) addFeature = 'tree';

                    // The Realistic Farm Enclosure
                    const relX = gx - 0;
                    const relY = gy - (-R);
                    const isFarmZone = relX > 15 && relX < 45 && relY > 5 && relY < 35;
                    if (isFarmZone) {
                        finalTopItem = 'grass_block';
                        const edgeX = (relX === 16 || relX === 44);
                        const edgeY = (relY === 6 || relY === 34);
                        if (edgeX || edgeY) {
                            // Fence posts
                            if (((relX % 4) === 0) || ((relY % 4) === 0)) {
                                startLayer = -5;
                                finalTopItem = 'wood_plank';
                            }
                        }
                    }
                } else if (isFront) { // ---- Epic Stratovolcano (+Z Face) ----
                    const relY = gy - (-R);
                    const gx_f = gx;
                    const gy_f = relY;
                    const distToC = Math.hypot(gx_f, gy_f);
                    const angle = Math.atan2(gy_f, gx_f);

                    // ── Configuration ──────────────────────────────────────────────────
                    const V_BASE_R = 85;  // Massive base that stretches out
                    const V_PEAK_R = 10;  // Very narrow peak
                    const V_MAX_HEIGHT = 65; // Extremely tall
                    const V_CRATER_R = 4;   // Narrow lava pool

                    if (distToC < V_BASE_R) {
                        // ── Angular Displacement (Noise Jitter) ──
                        // Create non-circular ridges. Very pronounced for a natural mountain
                        const noiseA = Math.sin(angle * 4.2) * 5.0;
                        const noiseB = Math.sin(angle * 7.8) * 2.1;
                        const rEffect = distToC + noiseA + noiseB;

                        if (rEffect < V_BASE_R) {
                            // ── Slope Profile ──
                            // Power curve to make it sweep up tall and concave like a stratovolcano
                            const normalizedH = Math.max(0, 1 - rEffect / V_BASE_R);
                            let profileH = Math.pow(normalizedH, 1.8) * V_MAX_HEIGHT;

                            // Caldera Logic
                            let isCraterFloor = false;
                            if (distToC < V_PEAK_R) {
                                const craterDepth = (1 - distToC / V_PEAK_R) * 12;
                                profileH -= craterDepth;
                                if (distToC < V_CRATER_R) isCraterFloor = true;
                            }

                            // Surface jitter: Rough terrain
                            profileH += Math.sin(gx_f * 0.9) * Math.cos(gy_f * 0.9) * 1.5;
                            startLayer = -Math.max(1, Math.floor(profileH));

                            // ── Biome & Material Zones ──
                            const hRatio = profileH / V_MAX_HEIGHT; // 0 (base) to 1 (peak)
                            const matJitter = (Math.random() - 0.5) * 0.2; // blur the blending zones
                            const blendH = hRatio + matJitter;

                            if (isCraterFloor) {
                                finalTopItem = 'lava_block';
                                finalSubItem = 'basalt_block';
                                if (distToC < 2) finalSubItem = 'lava_block'; // Deep pipe
                            } else if (blendH > 0.70) { // Very top - Dark ash / Basalt
                                finalTopItem = 'basalt_block';
                                finalSubItem = 'basalt_block';
                            } else if (blendH > 0.50) { // Upper Mid - Transition rock
                                finalTopItem = Math.random() > 0.4 ? 'basalt_block' : 'stone_block';
                                finalSubItem = 'stone_block';
                            } else if (blendH > 0.25) { // Mid - Bare rock and cobble
                                finalTopItem = Math.random() > 0.5 ? 'stone_cobble' : 'stone_block';
                                finalSubItem = 'stone_block';
                            } else if (blendH > 0.12) { // Lower Mid - Rock breaking into grass
                                finalTopItem = Math.random() > 0.6 ? 'grass_block' : 'stone_cobble';
                                finalSubItem = 'grass_block';
                                const spawnChance = (Math.sin(gx_f * 0.5 + gy_f * 0.7) * 0.5 + 0.5) * 0.015;
                                if (finalTopItem === 'grass_block' && Math.random() < spawnChance) addFeature = 'tree';
                            } else { // Base - Thick jungle / forest floor
                                finalTopItem = 'grass_block';
                                finalSubItem = 'grass_block';
                                const spawnChance = (Math.sin(gx_f * 0.5 + gy_f * 0.7) * 0.5 + 0.5) * 0.025;
                                if (Math.random() < spawnChance) addFeature = 'tree';
                            }

                            // ── Lava Rivulets ──
                            // Random flows streaking down the dark peak
                            const riverOrigins = [0.8, 2.5, -1.5, -2.8];
                            if (distToC > V_CRATER_R && distToC < V_BASE_R * 0.7) {
                                for (const ro of riverOrigins) {
                                    // Meandering effect
                                    const meander = Math.sin(distToC * 0.15) * 0.4 + Math.cos(distToC * 0.25) * 0.2;
                                    let da = Math.abs(angle - (ro + meander));
                                    if (da > Math.PI) da = 2 * Math.PI - da;

                                    // The streams get slightly wider and more broken up as they go down
                                    const maxWidth = 1.0 + (distToC / V_BASE_R) * 1.5;
                                    const checkD = da * distToC;

                                    if (checkD < maxWidth) {
                                        // Lava flow can thin out randomly
                                        if (Math.random() > (distToC / V_BASE_R) * 0.8) {
                                            finalTopItem = 'lava_block';
                                            if (Math.random() > 0.5) finalSubItem = 'lava_block';
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            for (let layer = startLayer; layer < layers; layer++) {
                const px = depthAxis === 'x' ? gx + layer * depthSign : gx;
                const py = depthAxis === 'y' ? gy + layer * depthSign : gy;
                const pz = depthAxis === 'z' ? gz + layer * depthSign : gz;
                const key = makeVoxelKey(px, py, pz);
                if (blocks.has(key)) continue;

                let itemId = (layer === startLayer) ? finalTopItem : finalSubItem;
                // Ocean profile: water must be the exposed outer layers, sand/soil below.
                if (isRight && waterSurfaceLayers > 0) {
                    const depthFromSurface = layer - startLayer;
                    itemId = depthFromSurface < waterSurfaceLayers ? 'water_still' : 'sand_block';
                }
                if (isFront && layer === startLayer && finalTopItem === 'lava_block') itemId = 'lava_block';
                else if (isFront && layer > startLayer && finalTopItem === 'lava_block') itemId = 'stone_block';

                const meta = layer === startLayer
                    ? { columnX: gx, columnZ: gz, terrainShape: 'planet', role: role || 'surface' }
                    : { columnX: gx, columnZ: gz, terrainShape: 'planet' };
                // Ensure the lower ocean border remains water instead of being overridden by the bottom face.
                const shouldReplace = !!(
                    isRight
                    && layer === startLayer
                    && py === (-2 * R)
                    && itemId === 'water_still'
                );
                pushBlock(itemId, px, py, pz, layer, applySurfaceOrientationMeta(meta, px, py, pz), shouldReplace);
            }

            if (addFeature === 'cactus') {
                for (let h = 1; h <= 3; h++) {
                    const cx = depthAxis === 'x' ? gx - h * depthSign : gx;
                    const cy = depthAxis === 'y' ? gy - h * depthSign : gy;
                    const cz = depthAxis === 'z' ? gz - h * depthSign : gz;
                    pushBlock('cactus_block', cx, cy, cz, 0, applySurfaceOrientationMeta({ role: 'cactus' }, cx, cy, cz), true);
                }
            } else if (addFeature === 'tree') {
                const randType = Math.random();
                let treeH, isPine = false, isGiant = false;

                if (randType < 0.1) {
                    isGiant = true;
                    treeH = 12 + Math.floor(Math.random() * 5); // 12-16 blocks tall
                } else if (randType < 0.4) {
                    isPine = true;
                    treeH = 8 + Math.floor(Math.random() * 5);  // 8-12 blocks tall
                } else {
                    treeH = 6 + Math.floor(Math.random() * 3);  // 6-8 blocks tall
                }

                // Minimum height of bare trunk so avatar can walk underneath
                const trunkFreeH = isGiant ? 5 : 4;

                for (let h = 1; h <= treeH; h++) {
                    const cx = depthAxis === 'x' ? gx - h * depthSign : gx;
                    const cy = depthAxis === 'y' ? gy - h * depthSign : gy;
                    const cz = depthAxis === 'z' ? gz - h * depthSign : gz;

                    // Build the trunk log
                    pushBlock('wood_plank', cx, cy, cz, 0, applySurfaceOrientationMeta({ role: 'tree_trunk' }, cx, cy, cz), true);

                    if (h >= trunkFreeH) {
                        // Dynamically scale the width of the leaves based on height
                        let layerRadius = 0;
                        const hRatio = (h - trunkFreeH) / (treeH - trunkFreeH);

                        if (isPine) {
                            // Pine: Cone shape, wide at bottom of leaves and narrow at top
                            layerRadius = 3.5 * (1 - hRatio * 0.8) + 0.5;
                        } else if (isGiant) {
                            // Giant tree: Massive wide blob, thin at top and bottom
                            layerRadius = 5.0 * Math.sin(hRatio * Math.PI) + 1.0;
                        } else {
                            // Standard tree: Medium blob
                            layerRadius = 3.0 * Math.sin(hRatio * Math.PI) + 0.5;
                        }

                        const maxR = Math.ceil(layerRadius);

                        // Iterate a 2D lateral slice to place leaves around trunk
                        for (let la = -maxR; la <= maxR; la++) {
                            for (let lb = -maxR; lb <= maxR; lb++) {
                                if (la === 0 && lb === 0) continue;

                                const dist2D = Math.sqrt(la * la + lb * lb);
                                // Organic noisy radius
                                const organicR = layerRadius + (Math.random() * 0.8 - 0.4);

                                if (dist2D <= organicR) {
                                    let flx = cx, fly = cy, flz = cz;
                                    if (depthAxis === 'x') { fly += la; flz += lb; }
                                    else if (depthAxis === 'y') { flx += la; flz += lb; }
                                    else if (depthAxis === 'z') { flx += la; fly += lb; }

                                    const key = makeVoxelKey(flx, fly, flz);
                                    if (!blocks.has(key)) {
                                        pushBlock('leaf_block', flx, fly, flz, 0, applySurfaceOrientationMeta({ role: 'tree_leaves' }, flx, fly, flz), false);
                                    }
                                }
                            }
                        }
                    }
                }
                // Little tuft at the very top of the tree
                const topH = treeH + 1;
                const top_cx = depthAxis === 'x' ? gx - topH * depthSign : gx;
                const top_cy = depthAxis === 'y' ? gy - topH * depthSign : gy;
                const top_cz = depthAxis === 'z' ? gz - topH * depthSign : gz;
                const topKey = makeVoxelKey(top_cx, top_cy, top_cz);
                if (!blocks.has(topKey)) pushBlock('leaf_block', top_cx, top_cy, top_cz, 0, applySurfaceOrientationMeta({ role: 'tree_leaves' }, top_cx, top_cy, top_cz), false);

                // Register generated forest-tree anchors so seasonal petals/leaves affect this face too.
                addOutdoorGeneratedTreeAnchor(top_cx, top_cy, top_cz);
                addOutdoorGeneratedTreeAnchor(top_cx + 1, top_cy, top_cz, { blossom: true });
                addOutdoorGeneratedTreeAnchor(top_cx - 1, top_cy, top_cz, { blossom: true });
                addOutdoorGeneratedTreeAnchor(top_cx, top_cy, top_cz + 1, { blossom: true });
                addOutdoorGeneratedTreeAnchor(top_cx, top_cy, top_cz - 1, { blossom: true });
                addOutdoorGeneratedTreeAnchor(top_cx, top_cy + 1, top_cz, { blossom: true });
            }
        };

        for (let x = xMin; x <= xMax; x += 1) {
            if (Math.abs(x) > radius) continue;

            // Exact face boundaries: no overlap padding to avoid edge lip collisions.
            const rPadding = 0;

            // Top (+Y)
            // Keep shell top blocks so the cube is visible immediately on boot.
            // The extra visual "cap" layer is already disabled in createVoxelWorldGroup,
            // so this does not reintroduce the duplicated grass overlay.
            if (!includeSurfaceColumns && shouldBuildFace('top')) {
                for (let z = Math.max(-R - rPadding, zMin); z <= Math.min(R + rPadding, zMax); z++) {
                    addCubeFaceBlock(x, 0, z, 'grass_block', 'y', -1);
                }
            }

            // Bottom (-Y)
            if (shouldBuildFace('bottom')) {
                for (let z = Math.max(-R - rPadding, zMin); z <= Math.min(R + rPadding, zMax); z++) {
                    addCubeFaceBlock(x, -2 * R, z, 'grass_block', 'y', 1);
                }
            }

            // Front and Back (+Z and -Z)
            for (let y = -2 * R; y <= 0; y++) {
                if (shouldBuildFace('south')) {
                    addCubeFaceBlock(x, y, R, 'grass_block', 'z', -1);
                }
                if (shouldBuildFace('north')) {
                    addCubeFaceBlock(x, y, -R, 'grass_block', 'z', 1);
                }
            }

            // Left and Right (+X and -X)
            if (Math.abs(x) >= R) {
                const isVolleyballFace = (x === R);
                const isSoccerFace = (x === -R);
                for (let y = -2 * R; y <= 0; y++) {
                    for (let z = Math.max(-R - rPadding, zMin); z <= Math.min(R + rPadding, zMax); z++) {
                        if (isVolleyballFace && !shouldBuildFace('east')) continue;
                        if (isSoccerFace && !shouldBuildFace('west')) continue;
                        let topItem = 'grass_block';
                        let role = 'surface';
                        let extra = null;

                        // Soccer Stadium Face
                        if (isSoccerFace) {
                            const relY = y - (-R);
                            if (Math.abs(relY) <= 35 && Math.abs(z) <= 22) {
                                const isField = Math.abs(relY) <= 30 && Math.abs(z) <= 18;
                                topItem = isField ? ((Math.abs(relY) === 30 || Math.abs(z) === 18 || relY === 0) ? 'wool_white' : 'concrete_green') : 'stone_cobble';
                                role = isField ? 'soccer_field' : 'stadium_rim';

                                // Goals and Bleachers
                                const inGoalW = Math.abs(z) <= 4;
                                const isGoalL = Math.abs(relY) === 30;
                                if (isGoalL && inGoalW) {
                                    for (let h = 1; h <= 3; h++) {
                                        if (Math.abs(z) === 4 || h === 3) pushBlock('wool_white', -R - h, y, z, 0, { structure: 'soccer_goal' }, true);
                                    }
                                }
                                // Bleachers at sidelines
                                if (Math.abs(z) > 18 && Math.abs(z) < 22 && Math.abs(relY) < 30) {
                                    const step = Math.floor(Math.abs(z) - 18) + 1;
                                    extra = { startLayer: -step, topItem: 'wood_plank' };
                                }
                            }
                        }

                        // Volleyball Court logic
                        if (isVolleyballFace) {
                            const relY = y - (-R);
                            if (Math.abs(relY) <= 14 && Math.abs(z) <= 7) {
                                topItem = (Math.abs(relY) === 14 || Math.abs(z) === 7 || relY === 0) ? 'wool_white' : 'concrete_yellow';
                                role = 'volleyball_court';

                                const isNetLine = relY === 0;
                                const inNetWidth = Math.abs(z) <= 7;
                                if (isNetLine && inNetWidth) {
                                    for (let h = 1; h <= 3; h++) {
                                        const netItem = (h === 1 || Math.abs(z) === 7) ? 'wood_plank' : 'glass_block';
                                        pushBlock(netItem, R + h, y, z, 0, { structure: 'volleyball_net' }, true);
                                    }
                                }
                            }
                        }
                        addCubeFaceBlock(x, y, z, topItem, 'x', x > 0 ? -1 : 1, role, extra);
                    }
                }
            }
        }
    }

    outdoorTreeAnchors = nextTreeAnchors;
    outdoorBlossomAnchors = nextBlossomAnchors;
    return Array.from(blocks.values());
}

function hideOutdoorTerrainVoxel(x, y, z) {
    if (!outdoorTerrainGroup) return false;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    let hidden = false;
    outdoorTerrainGroup.traverse((child) => {
        if (!child.isInstancedMesh) return;
        for (let i = 0; i < child.count; i++) {
            child.getMatrixAt(i, m);
            p.setFromMatrixPosition(m);
            if (Math.abs(p.x - x) < 0.1 && Math.abs(p.y - y) < 0.1 && Math.abs(p.z - z) < 0.1) {
                m.decompose(p, q, s);
                if (s.lengthSq() < 0.01) continue; // Already hidden
                s.set(0, 0, 0);
                m.compose(p, q, s);
                child.setMatrixAt(i, m);
                child.instanceMatrix.needsUpdate = true;
                hidden = true;
                break;
            }
        }
    });
    return hidden;
}

async function destroyOutdoorTerrainVoxelFromHit(point, normal = null) {
    const voxel = getOutdoorVoxelFromTerrainHit(point, normal);
    if (!voxel) return false;
    const key = getOutdoorTerrainVoxelKey(voxel.x, voxel.y, voxel.z);
    // Don't protect too high so we can destroy terrain everywhere
    if (outdoorTerrainRemovedVoxelKeys.has(key)) return false;
    outdoorTerrainRemovedVoxelKeys.add(key);
    rebuildOutdoorTopSolidVoxelCacheForCell(voxel.x, voxel.z);
    invalidateOutdoorWorldRuntimeCache('terrain_voxel_removed');
    hideOutdoorTerrainVoxel(voxel.x, voxel.y, voxel.z);
    playDestroySound();
    return true;
}

function queueOutdoorTerrainRegeneration() {
    if (outdoorTerrainRegenerationQueued) return;
    outdoorTerrainRegenerationQueued = true;
    window.setTimeout(() => {
        outdoorTerrainRegenerationQueued = false;
        generateOutdoorWorld({
            radius: Number(outdoorTerrainGroup?.userData?.buildRadius || OUTDOOR_WORLD_STREAM_RADIUS),
            includePlanetShell: true,
            includeSurfaceColumns: false,
            deferSurfaceColumns: true
        }).catch(() => { });
    }, 60);
}

function queueOutdoorWeatherTerrainRegeneration() {
    performanceDebugState.weatherFullWorldRebuilds += 1;
    queueOutdoorWeatherVisualRefresh('all');
}

function pickOutdoorWeatherSampleCell(originX, originZ, radius = WEATHER_ACCUMULATION_RADIUS) {
    for (let attempt = 0; attempt < 18; attempt += 1) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.sqrt(Math.random()) * radius;
        const sampleX = snapToVoxel(originX + Math.cos(angle) * distance);
        const sampleZ = snapToVoxel(originZ + Math.sin(angle) * distance);
        if (isOutdoorSnowBlockedCell(sampleX, sampleZ)) continue;
        if (isSurfaceProtectedForRiverOrTrees(sampleX, sampleZ)) continue;
        const surfaceY = getEarthVisualSurfaceY(sampleX, sampleZ);
        if (!Number.isFinite(surfaceY)) continue;
        return { x: sampleX, z: sampleZ };
    }
    return null;
}

function getSnowAccumulationApplyLimit() {
    if (currentPerformanceTier === 'high') return SNOW_FRAME_APPLY_LIMIT_HIGH;
    if (currentPerformanceTier === 'low') return SNOW_FRAME_APPLY_LIMIT_LOW;
    return SNOW_FRAME_APPLY_LIMIT_BALANCED;
}

function applyImmediateSnowBurst(originX, originZ, roomClock) {
    const tierMultiplier = currentPerformanceTier === 'low'
        ? 0.72
        : (currentPerformanceTier === 'high' ? 1.2 : 1);
    const seasonBoost = roomClock?.weather === 'blizzard' ? 1.25 : 1;
    const burstSamples = Math.max(32, Math.round(SNOW_BURST_BASE_SAMPLES * tierMultiplier * seasonBoost));
    let changes = 0;
    for (let i = 0; i < burstSamples; i += 1) {
        const sample = pickOutdoorWeatherSampleCell(originX, originZ, SNOW_BURST_RADIUS);
        if (!sample) continue;
        const currentLayers = getOutdoorSnowCellLayerCount(sample.x, sample.z);
        if (currentLayers >= SNOW_MAX_LAYERS) continue;
        if (setOutdoorSnowCellLayerCount(sample.x, sample.z, Math.max(1, currentLayers + 1))) {
            changes += 1;
        }
    }
    return changes;
}

function updateOutdoorWeatherAccumulation(roomClock, delta, sunDirection = null) {
    if (!outdoorTerrainGroup || !camera) return;
    const isWinter = roomClock.season === 'winter';
    const isSnowing = roomClock.weather === 'snow' || roomClock.weather === 'blizzard';
    const isRaining = roomClock.weather === 'rain' || roomClock.weather === 'storm';
    let needsSnowVisualRefresh = false;
    let needsRiverVisualRefresh = false;
    let forceImmediateSnowRefresh = false;

    const previousRiverStage = Math.round(outdoorRiverExpansionLevel);
    if (isRaining) {
        outdoorRiverExpansionLevel = Math.min(
            RIVER_RAIN_MAX_EXPANSION,
            outdoorRiverExpansionLevel + (delta * RIVER_RAIN_FILL_RATE)
        );
    } else {
        outdoorRiverExpansionLevel = Math.max(
            0,
            outdoorRiverExpansionLevel - (delta * RIVER_RAIN_DRAIN_RATE)
        );
    }
    if (Math.round(outdoorRiverExpansionLevel) !== previousRiverStage) {
        needsRiverVisualRefresh = true;
    }

    if (isWinter && isSnowing) {
        if (!weatherRuntimeState.snowStormActive) {
            const burstChanges = applyImmediateSnowBurst(camera.position.x, camera.position.z, roomClock);
            if (burstChanges > 0) {
                needsSnowVisualRefresh = true;
                forceImmediateSnowRefresh = true;
                weatherRuntimeState.lastSnowBurstAtMs = Date.now();
            }
            weatherRuntimeState.snowStormActive = true;
        }
        outdoorSnowAccumulationBudget += delta * SNOW_ACCUMULATION_RATE;
        outdoorSnowMeltBudget = 0;
        let applied = 0;
        const applyLimit = getSnowAccumulationApplyLimit();
        while (outdoorSnowAccumulationBudget >= 1 && applied < applyLimit) {
            outdoorSnowAccumulationBudget -= 1;
            applied += 1;
            const sample = pickOutdoorWeatherSampleCell(camera.position.x, camera.position.z);
            if (!sample) continue;
            const currentLayers = getOutdoorSnowCellLayerCount(sample.x, sample.z);
            if (currentLayers >= SNOW_MAX_LAYERS) continue;
            if (setOutdoorSnowCellLayerCount(sample.x, sample.z, currentLayers + 1)) {
                needsSnowVisualRefresh = true;
            }
        }
    } else if (!isWinter && outdoorSnowCoverByCell.size) {
        weatherRuntimeState.snowStormActive = false;
        outdoorSnowAccumulationBudget = 0;
        outdoorSnowMeltBudget += delta * SNOW_MELT_RATE;
        const keys = Array.from(outdoorSnowCoverByCell.keys());
        let index = 0;
        while (outdoorSnowMeltBudget >= 1 && index < keys.length) {
            outdoorSnowMeltBudget -= 1;
            const key = keys[index];
            index += 1;
            const currentLayers = outdoorSnowCoverByCell.get(key) || 0;
            if (currentLayers <= 1) {
                outdoorSnowCoverByCell.delete(key);
                needsSnowVisualRefresh = true;
                continue;
            }
            outdoorSnowCoverByCell.set(key, currentLayers - 1);
            needsSnowVisualRefresh = true;
        }
    } else if (!isSnowing) {
        weatherRuntimeState.snowStormActive = false;
    }

    // Sakura / Autumn leaf Melt logic (Vanish when not in season)
    const isSpring = roomClock.season === 'spring';
    const isAutumn = roomClock.season === 'autumn';
    if (!isSpring && outdoorSakuraCoverByCell.size) {
        outdoorSakuraCoverByCell.clear();
        needsSnowVisualRefresh = true;
    }
    if (!isAutumn && outdoorAutumnLeafCoverByCell.size) {
        outdoorAutumnLeafCoverByCell.clear();
        needsSnowVisualRefresh = true;
    }

    const safeSunDirection = sunDirection?.clone?.();
    if (safeSunDirection && safeSunDirection.lengthSq() > 1e-6 && activeCelestialBody === 'earth') {
        safeSunDirection.normalize();
        const seasonGain = roomClock.season === 'winter' ? POLAR_SNOW_WINTER_GAIN_BONUS : 0;
        const seasonMelt = roomClock.season === 'summer' ? POLAR_SNOW_SUMMER_MELT_BONUS : 0;
        for (let i = 0; i < POLAR_SNOW_UPDATE_SAMPLES; i += 1) {
            const sample = pickOutdoorWeatherSampleCell(camera.position.x, camera.position.z, WEATHER_ACCUMULATION_RADIUS + 18);
            if (!sample) continue;
            const key = getOutdoorTerrainCellKey(sample.x, sample.z);
            const exposure = getPolarSnowExposure(sample.x, sample.z, safeSunDirection);
            const targetMemory = clamp01(exposure + seasonGain - seasonMelt);
            const previousMemory = outdoorPolarSnowMemoryByCell.get(key) ?? targetMemory;
            const lambda = targetMemory >= previousMemory
                ? (POLAR_SNOW_MEMORY_GAIN_RATE + seasonGain) * 10
                : Math.max(0.2, (POLAR_SNOW_MEMORY_MELT_RATE + seasonMelt) * 10);
            const nextMemory = THREE.MathUtils.damp(previousMemory, targetMemory, lambda, delta);
            outdoorPolarSnowMemoryByCell.set(key, nextMemory);
            const nextLayers = THREE.MathUtils.clamp(Math.round(nextMemory * SNOW_MAX_LAYERS), 0, SNOW_MAX_LAYERS);
            if (setOutdoorPolarSnowCellLayerCount(sample.x, sample.z, nextLayers)) {
                needsSnowVisualRefresh = true;
            }
        }
    }

    if (needsRiverVisualRefresh) queueOutdoorWeatherVisualRefresh('river');
    if (needsSnowVisualRefresh) queueOutdoorWeatherVisualRefresh('snow', { immediate: forceImmediateSnowRefresh });
}

function getOutdoorSnowVisualCellKeys() {
    const keys = new Set();
    outdoorSnowCoverByCell.forEach((_, key) => keys.add(key));
    outdoorPolarSnowBaseByCell.forEach((_, key) => keys.add(key));
    return keys;
}

function getOutdoorSakuraVisualCellKeys() {
    return new Set(outdoorSakuraCoverByCell.keys());
}

function getOutdoorAutumnLeafVisualCellKeys() {
    return new Set(outdoorAutumnLeafCoverByCell.keys());
}

function getOutdoorRiverVisualSupportY(x, z) {
    const visualSurfaceY = getEarthVisualSurfaceY(x, z);
    return Number.isFinite(visualSurfaceY) ? snapToVoxel(visualSurfaceY) : null;
}

function buildHeroClassroomKitBlocks(push, options = {}) {
    const halfWidth = Number(options.halfWidth || Math.floor(ROOM_WIDTH / 2));
    const halfDepth = Number(options.halfDepth || Math.floor(ROOM_DEPTH / 2));
    const tierCfg = getHeroPropTierConfig('ClassroomKit');
    const deskCols = Math.max(3, Number(options.deskCols || tierCfg.deskCols || 5));
    const deskRows = Math.max(3, Number(options.deskRows || tierCfg.deskRows || 4));
    const startZ = -halfDepth + 8;
    const endZ = halfDepth - 5;
    const startX = -halfWidth + 3;
    const endX = halfWidth - 3;
    const xStep = (endX - startX) / Math.max(1, deskCols - 1);
    const zStep = (endZ - startZ) / Math.max(1, deskRows - 1);
    const floorY = 0;

    for (let row = 0; row < deskRows; row += 1) {
        for (let col = 0; col < deskCols; col += 1) {
            const cx = snapToVoxel(startX + (xStep * col));
            const cz = snapToVoxel(startZ + (zStep * row));
            for (let dx = -1; dx <= 1; dx += 1) {
                for (let dz = -1; dz <= 0; dz += 1) {
                    push('wood_plank', cx + dx, floorY + 1, cz + dz, { layer: 'desk_student' });
                }
            }
            push('wood_plank', cx, floorY + 2, cz - 1, { layer: 'desk_chair' });
        }
    }

    // Teacher desk and board wall composition.
    for (let x = -4; x <= 4; x += 1) {
        for (let z = -halfDepth + 2; z <= -halfDepth + 4; z += 1) {
            push('wood_plank', x, floorY + 1, z, { layer: 'desk_teacher' });
        }
    }
    for (let x = -5; x <= 5; x += 1) {
        for (let y = 2; y <= 5; y += 1) {
            push('classroom_wall', x, y, -halfDepth + 1, { layer: 'board_backdrop' });
        }
    }
    for (let x = -4; x <= 4; x += 1) {
        for (let y = 3; y <= 4; y += 1) {
            push('tile_floor', x, y, -halfDepth + 2, { layer: 'chalkboard_panel' });
        }
    }

    // Side bookshelves for the reference classroom style.
    for (let y = 1; y <= 5; y += 1) {
        for (let z = -halfDepth + 4; z <= halfDepth - 4; z += 1) {
            if (z % 3 === 0) {
                push('wood_plank', -halfWidth + 2, y, z, { layer: 'bookshelf_left' });
                push('wood_plank', halfWidth - 2, y, z, { layer: 'bookshelf_right' });
            }
        }
    }
}

function buildRoomShellBlocks() {
    const blocks = [];
    const halfWidth = Math.floor(ROOM_WIDTH / 2);
    const halfDepth = Math.floor(ROOM_DEPTH / 2);
    const floorY = 0;
    const wallBaseY = 1;
    const wallRows = Math.max(5, ROOM_HEIGHT - 2);
    const wallTopY = wallBaseY + wallRows - 1;
    const ceilingY = wallTopY + 1;
    const doorHalfWidth = 1;
    const doorHeight = 4;
    const wallThickness = 2;

    const push = (itemId, x, y, z, meta = {}) => {
        blocks.push({
            itemId,
            x: snapToVoxel(x),
            y: snapToVoxel(y),
            z: snapToVoxel(z),
            terrain: true,
            structure: 'room_shell',
            ...meta
        });
    };

    for (let x = -halfWidth; x <= halfWidth; x += 1) {
        for (let z = -halfDepth; z <= halfDepth; z += 1) {
            push('tile_floor', x, floorY, z, { layer: 'floor' });
            push('classroom_wall', x, ceilingY, z, { layer: 'ceiling' });
        }
    }

    for (let y = wallBaseY; y <= wallTopY; y += 1) {
        for (let thickness = 0; thickness < wallThickness; thickness += 1) {
            const backZ = -halfDepth + thickness;
            const frontZ = halfDepth - thickness;
            for (let x = -halfWidth; x <= halfWidth; x += 1) {
                push('classroom_wall', x, y, backZ, { layer: 'back_wall' });
                if (Math.abs(x) > doorHalfWidth || y > doorHeight) {
                    push('classroom_wall', x, y, frontZ, { layer: 'front_wall' });
                }
            }
            const leftX = -halfWidth + thickness;
            const rightX = halfWidth - thickness;
            for (let z = -halfDepth; z <= halfDepth; z += 1) {
                push('classroom_wall', leftX, y, z, { layer: 'left_wall' });
                push('classroom_wall', rightX, y, z, { layer: 'right_wall' });
            }
        }
    }

    // Frame the doorway with wood blocks so the entrance stays grid-aligned.
    for (let y = wallBaseY; y <= doorHeight; y += 1) {
        push('wood_plank', -doorHalfWidth - 1, y, halfDepth, { layer: 'door_jamb' });
        push('wood_plank', doorHalfWidth + 1, y, halfDepth, { layer: 'door_jamb' });
    }
    for (let x = -doorHalfWidth - 1; x <= doorHalfWidth + 1; x += 1) {
        push('wood_plank', x, doorHeight + 1, halfDepth, { layer: 'door_header' });
    }

    const scenePreset = getActiveScenePresetConfig();
    if (scenePreset.id === 'hero_classroom_planet_v1') {
        buildHeroClassroomKitBlocks(push, {
            halfWidth,
            halfDepth,
            deskCols: scenePreset.roomDeskCols,
            deskRows: scenePreset.roomDeskRows
        });
    }

    return blocks;
}

function buildMoonWorldBlocks(bodyId = currentSpaceBodyId) {
    const blocks = [];
    const center = getMoonCenter();
    const body = getTravelBodyConfig(bodyId);
    const radius = body.surfaceRadius;
    const shellThickness = 4;
    for (let x = -radius; x <= radius; x += 1) {
        for (let y = -radius; y <= radius; y += 1) {
            for (let z = -radius; z <= radius; z += 1) {
                const dist = Math.sqrt((x * x) + (y * y) + (z * z));
                if (dist > radius) continue;
                const shellDepth = radius - dist;
                if (shellDepth > shellThickness) continue;
                const worldX = snapToVoxel(center.x + x);
                const worldY = snapToVoxel(center.y + y);
                const worldZ = snapToVoxel(center.z + z);
                let itemId = body.subSurfaceItem || 'stone_cobble';
                if (shellDepth < 1.15) {
                    itemId = body.surfaceItem || 'sand_block';
                } else if (shellDepth < 2.3) {
                    itemId = body.subSurfaceItem || 'stone_cobble';
                }
                const craterNoise = valueNoise3D(worldX, worldY, worldZ, body.craterSeed || 977);
                if (shellDepth < 1.8 && craterNoise > 0.82) {
                    continue;
                }
                blocks.push({
                    itemId,
                    x: worldX,
                    y: worldY,
                    z: worldZ,
                    terrain: true,
                    structure: `${body.id}_world`
                });
            }
        }
    }
    return blocks;
}

async function generateMoonWorld(bodyId = currentSpaceBodyId) {
    if (!currentRoomId) return;
    const blocks = buildMoonWorldBlocks(bodyId);
    registerVoxelBlockKeys(moonWorldVoxelKeys, blocks);
    disposeVoxelGroup(moonTerrainGroup);
    moonTerrainGroup = createVoxelWorldGroup(blocks, `${bodyId}_world`, 'terrain');
    moonTerrainGroup.userData.bodyId = bodyId;
    moonTerrainGroup.visible = isSpaceBodyActive();
    scene.add(moonTerrainGroup);
}

function createRocketShuttleMesh(targetWorld = 'moon') {
    const rocket = new THREE.Group();
    rocket.name = `RocketShuttle_${targetWorld}`;
    rocket.userData.docId = `rocket_shuttle_${targetWorld}`;
    rocket.userData.isRocketShuttle = true;
    rocket.userData.rocketTarget = targetWorld;
    rocket.userData.isProtectedStructure = true;
    rocket.userData.ignoreRaycast = false;

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe7ebf2, roughness: 0.25, metalness: 0.55 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.3, metalness: 0.65 });
    const finMat = new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.35, metalness: 0.2 });
    const windowMat = new THREE.MeshStandardMaterial({ color: 0x93c5fd, emissive: 0x1d4ed8, emissiveIntensity: 0.5, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.78 });
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.82, metalness: 0.05 });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7, metalness: 0.25 });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.55, 13.2, 24), bodyMat);
    body.position.y = 7.4;
    rocket.add(body);
    rocket.userData.highlightProxy = body;

    const nose = new THREE.Mesh(new THREE.ConeGeometry(2.12, 4.1, 24), finMat);
    nose.position.y = 16;
    rocket.add(nose);

    const boosterRing = new THREE.Mesh(new THREE.TorusGeometry(2.34, 0.18, 12, 42), accentMat);
    boosterRing.rotation.x = Math.PI / 2;
    boosterRing.position.y = 3.3;
    rocket.add(boosterRing);

    for (let i = 0; i < 4; i += 1) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.52, 3.2, 1.5), finMat);
        fin.position.y = 2.05;
        fin.rotation.y = (Math.PI * 2 * i) / 4;
        fin.position.x = Math.cos(fin.rotation.y) * 2.22;
        fin.position.z = Math.sin(fin.rotation.y) * 2.22;
        rocket.add(fin);
    }

    for (let i = 0; i < 6; i += 1) {
        const theta = (Math.PI * 2 * i) / 6;
        const windowPanel = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.6, 0.1), windowMat);
        windowPanel.position.set(Math.cos(theta) * 2.08, 10 + ((i % 2) * 1.8), Math.sin(theta) * 2.08);
        windowPanel.lookAt(0, windowPanel.position.y, 0);
        rocket.add(windowPanel);
    }

    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.65, 3.2, 1.6, 24), new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.55, metalness: 0.45 }));
    base.position.y = 0.8;
    rocket.add(base);

    const interiorFloor = new THREE.Mesh(new THREE.CylinderGeometry(1.72, 1.72, 0.22, 16), floorMat);
    interiorFloor.position.y = 6.2;
    rocket.add(interiorFloor);
    const upperDeck = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.32, 0.16, 16), floorMat);
    upperDeck.position.y = 9.6;
    rocket.add(upperDeck);

    for (let row = 0; row < 2; row += 1) {
        for (let col = 0; col < 4; col += 1) {
            const seat = new THREE.Group();
            const baseSeat = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.46, 0.66), seatMat);
            baseSeat.position.y = 0.28;
            seat.add(baseSeat);
            const backSeat = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.78, 0.2), seatMat);
            backSeat.position.set(0, 0.84, -0.22);
            seat.add(backSeat);
            seat.position.set((col - 1.5) * 0.8, 6.35 + (row * 2.05), 0.35);
            seat.rotation.y = Math.PI;
            rocket.add(seat);
        }
    }

    const commandPanel = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.65, 0.42), accentMat);
    commandPanel.position.set(0, 11.7, -0.85);
    commandPanel.rotation.x = -0.35;
    rocket.add(commandPanel);

    const engineGlow = new THREE.Mesh(new THREE.ConeGeometry(1.32, 2.8, 18), new THREE.MeshBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.45
    }));
    engineGlow.position.y = -0.8;
    engineGlow.rotation.x = Math.PI;
    rocket.add(engineGlow);

    rocket.traverse((child) => {
        if (child?.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    return rocket;
}

function createRocketLaunchPad() {
    const group = new THREE.Group();
    group.name = 'RocketLaunchPad';
    group.userData.isProtectedStructure = true;
    group.userData.isLaunchPad = true;
    markRaycastIgnored(group);

    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(10, 12, 1.4, 36),
        new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.7, metalness: 0.2 })
    );
    base.position.y = 0.7;
    group.add(base);
    group.userData.highlightProxy = base;

    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(8.3, 0.45, 10, 48),
        new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.45, metalness: 0.55 })
    );
    ring.position.y = 1.52;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    const markerMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });
    for (let i = 0; i < 8; i += 1) {
        const theta = (Math.PI * 2 * i) / 8;
        const marker = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 2.4), markerMat);
        marker.position.set(Math.cos(theta) * 6.5, 1.42, Math.sin(theta) * 6.5);
        marker.rotation.y = theta;
        group.add(marker);
    }
    return group;
}

function createOutdoorLampPost(localPosition = new THREE.Vector3()) {
    const group = new THREE.Group();
    group.position.copy(localPosition);
    group.userData.isProtectedStructure = true;
    markRaycastIgnored(group);

    const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.22, OUTDOOR_LIGHT_POST_HEIGHT + 0.5, 8),
        new THREE.MeshStandardMaterial({ color: 0x5a6472, roughness: 0.72, metalness: 0.18 })
    );
    pole.position.y = (OUTDOOR_LIGHT_POST_HEIGHT + 0.5) * 0.5;
    group.add(pole);

    const arm = new THREE.Mesh(
        new THREE.BoxGeometry(1.52, 0.18, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x677281, roughness: 0.64, metalness: 0.2 })
    );
    arm.position.set(0.62, OUTDOOR_LIGHT_POST_HEIGHT - 0.12, 0);
    group.add(arm);

    const lampHead = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.34, 0.56),
        new THREE.MeshStandardMaterial({
            color: 0xfff2cf,
            emissive: 0xffc765,
            emissiveIntensity: 0,
            roughness: 0.28,
            metalness: 0.04
        })
    );
    lampHead.position.set(1.22, OUTDOOR_LIGHT_POST_HEIGHT - 0.24, 0);
    group.add(lampHead);

    const glow = new THREE.PointLight(0xffe7bf, 0, 58, 1.35);
    glow.position.set(1.12, OUTDOOR_LIGHT_POST_HEIGHT - 0.52, 0);
    glow.castShadow = false;
    group.add(glow);

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: createRadialGlowTexture('rgba(255,233,178,0.98)', 'rgba(255,199,92,0)', 96),
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        opacity: 0
    }));
    halo.scale.set(5.2, 5.2, 1);
    halo.position.copy(glow.position);
    group.add(halo);

    group.userData.lampLight = glow;
    group.userData.lampHead = lampHead;
    group.userData.lampHalo = halo;
    return group;
}

function createOutdoorCherryTreeProp(localPosition = new THREE.Vector3(), options = {}) {
    const tree = new THREE.Group();
    const scale = THREE.MathUtils.clamp(Number(options.scale || 1), 0.86, 1.36);
    tree.position.copy(localPosition);
    tree.userData.isProtectedStructure = true;

    const trunkPrimaryMat = new THREE.MeshStandardMaterial({ color: 0x7a522d, roughness: 0.94, metalness: 0.01 });
    const trunkShadowMat = new THREE.MeshStandardMaterial({ color: 0x5c3b22, roughness: 0.96, metalness: 0.01 });
    const leafPrimaryMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: TEXTURES.leaf || null,
        emissive: 0x112d0f,
        emissiveIntensity: 0.02,
        transparent: false,
        opacity: 1.0,
        roughness: 0.94,
        metalness: 0.0
    });
    const leafAccentMat = new THREE.MeshStandardMaterial({
        color: 0xeeeeee,
        map: TEXTURES.leaf || null,
        emissive: 0x153312,
        emissiveIntensity: 0.015,
        transparent: false,
        opacity: 1.0,
        roughness: 0.92,
        metalness: 0.0
    });
    leafPrimaryMat.userData = { sharedVoxelMaterial: true, itemId: 'leaf_block' };
    leafAccentMat.userData = { sharedVoxelMaterial: true, itemId: 'leaf_block' };
    const blossomMat = new THREE.MeshStandardMaterial({
        color: 0xffd0e3,
        emissive: 0x000000,
        emissiveIntensity: 0,
        transparent: true,
        opacity: 0,
        roughness: 0.82,
        metalness: 0.01
    });

    const randomSeedX = Math.round(localPosition.x * 11);
    const randomSeedY = Math.round(localPosition.y * 7);
    const randomSeedZ = Math.round(localPosition.z * 13);
    const trunkHeight = 6 + Math.floor(valueNoise3D(randomSeedX, randomSeedY, randomSeedZ, 971) * 4);
    const canopyRadius = 2 + Math.floor(valueNoise3D(randomSeedX, randomSeedY, randomSeedZ, 1237) * 2);
    const canopyBaseY = trunkHeight - Math.max(2, Math.floor(canopyRadius * 0.8));

    const trunkSpecsByMat = new Map();
    const addTrunkSpec = (x, y, z, mat = trunkPrimaryMat, size = [1, 1, 1]) => {
        if (!trunkSpecsByMat.has(mat)) trunkSpecsByMat.set(mat, []);
        trunkSpecsByMat.get(mat).push({ size, pos: [x, y + 0.5, z] });
    };
    for (let h = 0; h < trunkHeight; h += 1) {
        addTrunkSpec(0, h, 0, h < trunkHeight - 1 ? trunkShadowMat : trunkPrimaryMat);
    }

    const branchDefs = [
        { dx: 1, dz: 0 },
        { dx: -1, dz: 0 },
        { dx: 0, dz: 1 },
        { dx: 0, dz: -1 }
    ];
    const branchStart = trunkHeight - 2;
    branchDefs.forEach((branch, idx) => {
        const branchNoise = valueNoise3D(randomSeedX + idx * 5, randomSeedY + idx * 3, randomSeedZ + idx * 7, 1777);
        const branchLength = branchNoise > 0.64 ? 2 : 1;
        for (let step = 1; step <= branchLength; step += 1) {
            const by = branchStart + (step > 1 ? 1 : 0);
            addTrunkSpec(branch.dx * step, by, branch.dz * step, trunkPrimaryMat);
        }
    });

    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();

    trunkSpecsByMat.forEach((specs, mat) => {
        const instanced = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, specs.length);
        instanced.castShadow = true;
        instanced.receiveShadow = true;
        specs.forEach((spec, i) => {
            p.set(spec.pos[0] * scale, spec.pos[1] * scale, spec.pos[2] * scale);
            q.identity();
            s.set(spec.size[0] * scale, spec.size[1] * scale, spec.size[2] * scale);
            m.compose(p, q, s);
            instanced.setMatrixAt(i, m);
        });
        instanced.instanceMatrix.needsUpdate = true;
        tree.add(instanced);
    });

    const leafSpecsByMat = new Map();
    const blossomSpecs = [];
    const blossomAnchorLocals = [];

    for (let dy = -1; dy <= canopyRadius + 2; dy += 1) {
        const radiusGrow = dy >= 0 ? 0.1 : -0.25;
        const maxR = canopyRadius + 1;
        for (let dx = -maxR; dx <= maxR; dx += 1) {
            for (let dz = -maxR; dz <= maxR; dz += 1) {
                const localNoise = valueNoise3D(
                    randomSeedX + dx * 5,
                    randomSeedY + dy * 7,
                    randomSeedZ + dz * 5,
                    2441
                );
                const ellipsoidDist = Math.sqrt((dx * dx) + (dz * dz) + ((dy * 0.82) * (dy * 0.82)));
                const shellRadius = canopyRadius + radiusGrow + ((localNoise - 0.5) * 0.72);
                if (ellipsoidDist > shellRadius) continue;
                if (dy <= 0 && dx === 0 && dz === 0) continue;

                const mat = ((dx + dz + dy) & 1) === 0 ? leafPrimaryMat : leafAccentMat;
                if (!leafSpecsByMat.has(mat)) leafSpecsByMat.set(mat, []);
                const spec = {
                    size: [1, 1, 1],
                    pos: [dx, canopyBaseY + dy + 0.5, dz]
                };
                leafSpecsByMat.get(mat).push(spec);

                const isOuter = ellipsoidDist >= (shellRadius - 0.48);
                if (isOuter && localNoise > 0.58) {
                    blossomAnchorLocals.push(
                        new THREE.Vector3(spec.pos[0] * scale, spec.pos[1] * scale, spec.pos[2] * scale)
                            .add(new THREE.Vector3(0, 0.44 * scale, 0))
                    );
                }
                if (isOuter && ((Math.abs(dx + dz + dy) % 5) === 0)) {
                    blossomSpecs.push(spec);
                }
            }
        }
    }

    const crownSpec = { size: [1, 1, 1], pos: [0, canopyBaseY + canopyRadius + 2.5, 0] };
    if (!leafSpecsByMat.has(leafPrimaryMat)) leafSpecsByMat.set(leafPrimaryMat, []);
    leafSpecsByMat.get(leafPrimaryMat).push(crownSpec);
    blossomAnchorLocals.push(
        new THREE.Vector3(crownSpec.pos[0] * scale, crownSpec.pos[1] * scale, crownSpec.pos[2] * scale)
            .add(new THREE.Vector3(0, 0.44 * scale, 0))
    );
    blossomSpecs.push(crownSpec);

    leafSpecsByMat.forEach((specs, mat) => {
        const instanced = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, specs.length);
        instanced.castShadow = true;
        instanced.receiveShadow = true;
        specs.forEach((spec, i) => {
            p.set(spec.pos[0] * scale, spec.pos[1] * scale, spec.pos[2] * scale);
            q.identity();
            s.set(spec.size[0] * scale, spec.size[1] * scale, spec.size[2] * scale);
            m.compose(p, q, s);
            instanced.setMatrixAt(i, m);
        });
        instanced.instanceMatrix.needsUpdate = true;
        tree.add(instanced);

        tree.userData.seasonalLeafMaterialsContent = tree.userData.seasonalLeafMaterialsContent || [];
        tree.userData.seasonalLeafMaterialsContent.push(mat);
        tree.userData.seasonalLeafMeshesContent = tree.userData.seasonalLeafMeshesContent || [];
        tree.userData.seasonalLeafMeshesContent.push(instanced);
    });

    if (blossomSpecs.length > 0) {
        const blossomInstanced = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), blossomMat, blossomSpecs.length);
        blossomSpecs.forEach((spec, i) => {
            p.set(spec.pos[0] * scale, spec.pos[1] * scale, spec.pos[2] * scale).add(new THREE.Vector3(0, 0.05 * scale, 0));
            q.identity();
            s.set(0.88 * scale, 0.88 * scale, 0.88 * scale);
            m.compose(p, q, s);
            blossomInstanced.setMatrixAt(i, m);
        });
        blossomInstanced.instanceMatrix.needsUpdate = true;
        tree.add(blossomInstanced);
    }

    tree.userData.treeAnchorLocal = new THREE.Vector3(0, (trunkHeight + canopyRadius + 1.2) * scale, 0);
    tree.userData.blossomAnchorsLocal = blossomAnchorLocals;
    tree.userData.seasonalLeafMaterials = Array.isArray(tree.userData.seasonalLeafMaterialsContent) && tree.userData.seasonalLeafMaterialsContent.length
        ? tree.userData.seasonalLeafMaterialsContent
        : [leafPrimaryMat, leafAccentMat];
    tree.userData.seasonalLeafMeshes = Array.isArray(tree.userData.seasonalLeafMeshesContent) && tree.userData.seasonalLeafMeshesContent.length
        ? tree.userData.seasonalLeafMeshesContent
        : [];
    tree.userData.isSeatable = true;
    tree.userData.seatPosition = new THREE.Vector3(0, Math.max(1.2, (trunkHeight - 1.3) * scale), 0.9 * scale);
    tree.userData.seasonalBlossomMaterials = [blossomMat];

    tree.traverse((child) => {
        if (child?.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    return tree;
}

function createRiverFishModel(type = 'trout') {
    const defs = {
        trout: { body: 0x7f9cb0, fin: 0xe8d6a2, scale: 0.68 },
        koi: { body: 0xf89846, fin: 0xffefd8, scale: 0.78 },
        carp: { body: 0x6d8398, fin: 0xc2d0dc, scale: 0.82 },
        tetra: { body: 0x54c5ff, fin: 0xffefbe, scale: 0.56 }
    };
    const def = defs[type] || defs.trout;
    const group = new THREE.Group();
    markRaycastIgnored(group);

    const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.32 * def.scale, 12, 10),
        new THREE.MeshStandardMaterial({
            color: def.body,
            roughness: 0.52,
            metalness: 0.04
        })
    );
    body.scale.set(1.6, 0.9, 0.78);
    group.add(body);

    const tail = new THREE.Mesh(
        new THREE.ConeGeometry(0.24 * def.scale, 0.42 * def.scale, 4),
        new THREE.MeshStandardMaterial({
            color: def.fin,
            roughness: 0.58,
            metalness: 0.02
        })
    );
    tail.rotation.z = Math.PI / 2;
    tail.position.set(-0.44 * def.scale, 0, 0);
    group.add(tail);

    const dorsal = new THREE.Mesh(
        new THREE.ConeGeometry(0.1 * def.scale, 0.22 * def.scale, 4),
        new THREE.MeshStandardMaterial({
            color: def.fin,
            roughness: 0.64,
            metalness: 0.02
        })
    );
    dorsal.position.set(0, 0.18 * def.scale, 0);
    group.add(dorsal);

    const eyeGeo = new THREE.SphereGeometry(0.04 * def.scale, 6, 6);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x081019, roughness: 0.2, metalness: 0.1 });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(0.26 * def.scale, 0.04 * def.scale, 0.12 * def.scale);
    const rightEye = leftEye.clone();
    rightEye.position.z *= -1;
    group.add(leftEye, rightEye);
    group.scale.setScalar(0.58);
    return group;
}

function createPlanterBedProp(localPosition = new THREE.Vector3(), options = {}) {
    const group = new THREE.Group();
    group.position.copy(localPosition);
    group.rotation.y = Number(options.yaw || 0);
    group.userData.isProtectedStructure = true;
    markRaycastIgnored(group);

    const baseMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.82, metalness: 0.08 });
    const soilMat = new THREE.MeshStandardMaterial({ color: 0x5f4129, roughness: 0.92, metalness: 0.01 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f8f38, roughness: 0.92, metalness: 0.01 });
    const petalMat = new THREE.MeshStandardMaterial({ color: 0xffd1ea, roughness: 0.84, metalness: 0.0 });

    const base = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.9, 2.6), baseMat);
    base.position.y = 0.45;
    group.add(base);
    const soil = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.46, 2.2), soilMat);
    soil.position.y = 0.98;
    group.add(soil);

    for (let i = 0; i < 24; i += 1) {
        const t = (i / 24) * Math.PI * 2;
        const flower = new THREE.Group();
        const stem = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.08), leafMat);
        stem.position.y = 1.18;
        flower.add(stem);
        const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), petalMat);
        bloom.position.y = 1.4;
        flower.add(bloom);
        flower.position.set((Math.cos(t) * 3.4) + (Math.sin(t * 2) * 0.2), 0, Math.sin(t) * 0.72);
        group.add(flower);
    }

    group.traverse((child) => {
        if (child?.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    return group;
}

function createBenchVoxelProp(localPosition = new THREE.Vector3(), options = {}) {
    const group = new THREE.Group();
    group.position.copy(localPosition);
    group.rotation.y = Number(options.yaw || 0);
    group.userData.isProtectedStructure = true;
    markRaycastIgnored(group);
    const mat = new THREE.MeshStandardMaterial({ color: 0x9b6e45, roughness: 0.86, metalness: 0.03 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x505e6f, roughness: 0.72, metalness: 0.22 });

    const seat = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.28, 1.2), mat);
    seat.position.y = 1.18;
    group.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.84, 0.22), mat);
    back.position.set(0, 1.7, -0.5);
    group.add(back);
    for (const dx of [-1.7, 1.7]) {
        for (const dz of [-0.45, 0.45]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.18, 0.22), legMat);
            leg.position.set(dx, 0.58, dz);
            group.add(leg);
        }
    }
    group.traverse((child) => {
        if (child?.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    return group;
}

function createRocketTowerProp(localPosition = new THREE.Vector3(), options = {}) {
    const group = new THREE.Group();
    group.position.copy(localPosition);
    group.rotation.y = Number(options.yaw || 0);
    group.userData.isProtectedStructure = true;
    markRaycastIgnored(group);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.52, metalness: 0.48 });
    const towerCfg = getHeroPropTierConfig('RocketPadHero');
    const heightMul = Number(options.heightMul || towerCfg.towerHeightMul || 1);
    const rungCount = Math.max(6, Math.round(9 * heightMul));
    for (let y = 0; y < rungCount; y += 1) {
        const rung = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.12), frameMat);
        rung.position.set(0, 0.9 + (y * 1.22), 0);
        group.add(rung);
    }
    for (const dx of [-1, 1]) {
        const railHeight = 11.3 * heightMul;
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, railHeight, 0.14), frameMat);
        rail.position.set(dx, railHeight * 0.5 + 0.15, 0);
        group.add(rail);
    }
    group.traverse((child) => {
        if (child?.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    return group;
}

function createCherryTreeHero(localPosition = new THREE.Vector3(), options = {}) {
    const treeCfg = getHeroPropTierConfig('CherryTreeHero');
    const scale = Number(options.scale || 1) * Number(treeCfg.scaleMul || 1);
    return createOutdoorCherryTreeProp(localPosition, { ...options, scale });
}

function createLampPostHero(localPosition = new THREE.Vector3()) {
    const lampCfg = getHeroPropTierConfig('LampPostHero');
    const post = createOutdoorLampPost(localPosition);
    if (post.userData?.lampHalo) {
        const scaleMul = Number(lampCfg.haloScale || 1);
        post.userData.lampHalo.scale.multiplyScalar(scaleMul);
    }
    return post;
}

function createRocketPadHero() {
    return createRocketLaunchPad();
}

function getMoonHeroConfig() {
    const cfg = getActiveScenePresetConfig();
    const moonCfg = getHeroPropTierConfig('MoonHero');
    return {
        heroMoonScale: Number(cfg.heroMoonScale || 1) * Number(moonCfg.scaleMul || 1),
        heroMoonDistanceScale: Number(cfg.heroMoonDistanceScale || 1),
        heroMoonAnchor: cfg.heroMoonAnchor || { x: 0, y: 0, z: 0 }
    };
}

function mountHeroGardenProps(targetGroup) {
    if (!targetGroup || getActiveScenePresetConfig().id !== 'hero_classroom_planet_v1') return;
    const existing = targetGroup.getObjectByName('hero_garden_props');
    if (existing) {
        targetGroup.remove(existing);
        disposeVoxelGroup(existing);
    }
    const heroGroup = new THREE.Group();
    heroGroup.name = 'hero_garden_props';
    markRaycastIgnored(heroGroup);
    const planterCfg = getHeroPropTierConfig('PlanterBed');
    const benchCfg = getHeroPropTierConfig('BenchVoxel');
    const heroBudget = getHeroScenePerformanceBudget(currentPerformanceTier);
    const heroPropLimit = Math.max(0, Number(heroBudget.heroPropLimit || 32));
    const planterTarget = Math.max(0, Math.min(
        Number(planterCfg.max || HERO_GARDEN_PLANTER_LAYOUT.length),
        heroPropLimit
    ));
    let consumedProps = 0;
    HERO_GARDEN_PLANTER_LAYOUT.slice(0, planterTarget).forEach((entry) => {
        const anchor = resolveOutdoorSurfaceAnchor(entry.x, entry.z, { allowFallback: true });
        if (!anchor) return;
        const planter = createPlanterBedProp(new THREE.Vector3(anchor.x, anchor.y + 0.05, anchor.z), { yaw: entry.yaw });
        heroGroup.add(planter);
        consumedProps += 1;
    });
    const benchTarget = Math.max(0, Math.min(
        Number(benchCfg.max || HERO_GARDEN_BENCH_LAYOUT.length),
        Math.max(0, heroPropLimit - consumedProps - 1)
    ));
    HERO_GARDEN_BENCH_LAYOUT.slice(0, benchTarget).forEach((entry) => {
        const anchor = resolveOutdoorSurfaceAnchor(entry.x, entry.z, { allowFallback: true });
        if (!anchor) return;
        const bench = createBenchVoxelProp(new THREE.Vector3(anchor.x, anchor.y, anchor.z), { yaw: entry.yaw });
        heroGroup.add(bench);
        consumedProps += 1;
    });
    const towerAnchor = getEarthLaunchPadAnchor();
    const towerSurface = resolveOutdoorSurfaceAnchor(towerAnchor.x + 8, towerAnchor.z + 1, { allowFallback: true });
    if (towerSurface && consumedProps < heroPropLimit) {
        const tower = createRocketTowerProp(new THREE.Vector3(towerSurface.x, towerSurface.y, towerSurface.z), { yaw: Math.PI * 0.5 });
        heroGroup.add(tower);
    }
    targetGroup.add(heroGroup);
}

function createWeatherCoverBlockPusher(snowBlocks, playerX, playerZ, renderRadius) {
    return (options = {}) => {
        const x = Number(options.x);
        const z = Number(options.z);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        if (Math.abs(x - playerX) > renderRadius || Math.abs(z - playerZ) > renderRadius) return;
        if (isOutdoorWeatherBlockedByClassroom(x, z)) return;
        const supportY = getOutdoorSnowVisualSupportY(x, z);
        if (!Number.isFinite(supportY)) return;
        const solidTopY = getEarthTopSolidVoxelY(x, z);
        if (!Number.isFinite(solidTopY)) return;
        const topY = Math.round(Math.max(supportY, solidTopY));
        if (topY < solidTopY) return;
        const cubeTopState = getCubeSurfaceState(new THREE.Vector3(x, 0, z), 'top');
        if (!cubeTopState || cubeTopState.face !== 'top') return;
        const trueNormal = cubeTopState.up.clone().normalize();
        snowBlocks.push({
            itemId: String(options.itemId || 'snow_block'),
            x: snapToVoxel(x),
            y: topY + Number(options.yOffset || 0),
            z: snapToVoxel(z),
            terrain: true,
            terrainDecor: String(options.terrainDecor || 'snow_cover'),
            columnX: x,
            columnZ: z,
            terrainShape: 'planet',
            role: 'surface',
            renderBaseX: x,
            renderBaseY: topY,
            renderBaseZ: z,
            surfaceNormalX: trueNormal.x,
            surfaceNormalY: trueNormal.y,
            surfaceNormalZ: trueNormal.z,
            scale: Array.isArray(options.scale) ? options.scale : [1.12, 0.15, 1.12]
        });
    };
}

function buildOutdoorSnowVisualBlocks() {
    const snowBlocks = [];
    const renderRadius = WEATHER_VISUAL_RENDER_RADIUS;
    const playerX = camera ? Math.round(camera.position.x) : 0;
    const playerZ = camera ? Math.round(camera.position.z) : 0;
    const pushWeatherCoverBlock = createWeatherCoverBlockPusher(snowBlocks, playerX, playerZ, renderRadius);

    for (const cellKey of getOutdoorSnowVisualCellKeys()) {
        const [xs, zs] = cellKey.split('|');
        const x = parseInt(xs, 10);
        const z = parseInt(zs, 10);
        const snowLayers = getOutdoorCombinedSnowLayers(x, z);
        if (snowLayers <= 0) continue;
        if (isOutdoorSnowBlockedCell(x, z)) continue;
        const snowThickness = THREE.MathUtils.clamp(snowLayers * SNOW_LAYER_HEIGHT, SNOW_LAYER_HEIGHT, 0.84);
        pushWeatherCoverBlock({
            x,
            z,
            itemId: 'snow_block',
            terrainDecor: 'snow_cover',
            yOffset: 0.5 + (snowThickness * 0.5),
            scale: [1.12, snowThickness, 1.12]
        });
    }

    for (const cellKey of getOutdoorSakuraVisualCellKeys()) {
        const [xs, zs] = cellKey.split('|');
        const x = parseInt(xs, 10);
        const z = parseInt(zs, 10);
        const layers = outdoorSakuraCoverByCell.get(cellKey) || 0;
        if (layers <= 0) continue;
        const thickness = THREE.MathUtils.clamp(layers * 0.1, 0.08, 0.42);
        pushWeatherCoverBlock({
            x,
            z,
            itemId: 'sakura_block',
            terrainDecor: 'sakura_cover',
            yOffset: 0.5 + (thickness * 0.5),
            scale: [1.12, thickness, 1.12]
        });
    }

    for (const cellKey of getOutdoorAutumnLeafVisualCellKeys()) {
        const [xs, zs] = cellKey.split('|');
        const x = parseInt(xs, 10);
        const z = parseInt(zs, 10);
        const layers = outdoorAutumnLeafCoverByCell.get(cellKey) || 0;
        if (layers <= 0) continue;
        const thickness = THREE.MathUtils.clamp(layers * 0.1, 0.08, 0.42);
        pushWeatherCoverBlock({
            x,
            z,
            itemId: 'autumn_leaf_block',
            terrainDecor: 'autumn_leaf_cover',
            yOffset: 0.5 + (thickness * 0.5),
            scale: [1.12, thickness, 1.12]
        });
    }
    return snowBlocks;
}

function buildOutdoorRiverVisualBlocks() {
    const riverBlocks = [];
    const renderRadius = WEATHER_VISUAL_RENDER_RADIUS;
    const playerX = camera ? Math.round(camera.position.x) : 0;
    const playerZ = camera ? Math.round(camera.position.z) : 0;

    const expansion = Math.round(outdoorRiverExpansionLevel);
    if (expansion > 0 || RIVER_HALF_WIDTH > 0) {
        for (let x = playerX - renderRadius; x <= playerX + renderRadius; x += 1) {
            if (Math.abs(x) > OUTDOOR_WORLD_RADIUS) continue;
            const centerZ = getRiverCenterZAtX(x);
            const halfWidth = getDynamicRiverHalfWidth(x);
            for (let z = Math.round(centerZ - halfWidth); z <= Math.round(centerZ + halfWidth); z += 1) {
                if (Math.abs(z - playerZ) > renderRadius) continue;
                if (isOutdoorWeatherBlockedByClassroom(x, z)) continue;
                const supportY = getOutdoorRiverVisualSupportY(x, z);
                if (!Number.isFinite(supportY)) continue;
                const topY = Math.round(supportY);
                const cubeTopState = getCubeSurfaceState(new THREE.Vector3(x, 0, z), 'top');
                if (!cubeTopState || cubeTopState.face !== 'top') continue;
                const trueNormal = cubeTopState.up.clone().normalize();
                riverBlocks.push({
                    itemId: 'water_block',
                    x: snapToVoxel(x),
                    y: topY,
                    z: snapToVoxel(z),
                    terrain: true, terrainDecor: 'river_water',
                    columnX: x, columnZ: z, terrainShape: 'planet', role: 'surface',
                    renderBaseX: x, renderBaseY: topY, renderBaseZ: z,
                    surfaceNormalX: trueNormal.x, surfaceNormalY: trueNormal.y, surfaceNormalZ: trueNormal.z
                });
            }
        }
    }
    return riverBlocks;
}

function disposeOutdoorWeatherVisualGroup(groupRef) {
    if (!groupRef) return null;
    disposeVoxelGroup(groupRef);
    return null;
}

function refreshOutdoorWeatherVisuals(force = false) {
    if (!scene || !outdoorTerrainGroup) return;
    if (!force && !weatherRuntimeState.snowVisualDirty && !weatherRuntimeState.riverVisualDirty) return;
    const shouldRefreshSnow = force || weatherRuntimeState.snowVisualDirty;
    const shouldRefreshRiver = force || weatherRuntimeState.riverVisualDirty;
    if (shouldRefreshRiver) {
        const riverBlocks = buildOutdoorRiverVisualBlocks();
        outdoorRiverSurfaceGroup = disposeOutdoorWeatherVisualGroup(outdoorRiverSurfaceGroup);
        if (riverBlocks.length) {
            outdoorRiverSurfaceGroup = createVoxelWorldGroup(riverBlocks, 'outdoor_river_surface', 'terrain');
            scene.add(outdoorRiverSurfaceGroup);
        }
        weatherRuntimeState.riverVisualDirty = false;
    }
    if (shouldRefreshSnow) {
        const snowBlocks = buildOutdoorSnowVisualBlocks();
        outdoorSnowCoverGroup = disposeOutdoorWeatherVisualGroup(outdoorSnowCoverGroup);
        if (snowBlocks.length) {
            outdoorSnowCoverGroup = createVoxelWorldGroup(snowBlocks, 'outdoor_snow_cover', 'terrain');
            scene.add(outdoorSnowCoverGroup);
        }
        weatherRuntimeState.snowVisualDirty = false;
    }
    performanceDebugState.weatherMeshUpdates += 1;
}

function queueOutdoorWeatherVisualRefresh(type = 'all', options = {}) {
    if (type === 'all' || type === 'snow') weatherRuntimeState.snowVisualDirty = true;
    if (type === 'all' || type === 'river') weatherRuntimeState.riverVisualDirty = true;
    const immediate = options?.immediate === true;
    if (immediate) {
        refreshOutdoorWeatherVisuals();
        return;
    }
    const shouldQueueSnow = (type === 'all' || type === 'snow') && !weatherRuntimeState.snowVisualBuildQueued;
    const shouldQueueRiver = (type === 'all' || type === 'river') && !weatherRuntimeState.riverVisualBuildQueued;
    if (!shouldQueueSnow && !shouldQueueRiver) return;
    if (shouldQueueSnow) weatherRuntimeState.snowVisualBuildQueued = true;
    if (shouldQueueRiver) weatherRuntimeState.riverVisualBuildQueued = true;
    window.setTimeout(() => {
        weatherRuntimeState.snowVisualBuildQueued = false;
        weatherRuntimeState.riverVisualBuildQueued = false;
        refreshOutdoorWeatherVisuals();
    }, 60);
}

function getWeatherVisualStreamConfig() {
    const roomClock = currentRoomTimeState || {};
    const isSnowing = roomClock.weather === 'snow' || roomClock.weather === 'blizzard';
    if (isSnowing) {
        return {
            snowStep: WEATHER_VISUAL_STREAM_STEP_SNOW_ACTIVE,
            snowCooldownMs: WEATHER_VISUAL_STREAM_COOLDOWN_MS_SNOW_ACTIVE,
            riverStep: WEATHER_VISUAL_RIVER_STREAM_STEP,
            riverCooldownMs: WEATHER_VISUAL_RIVER_STREAM_COOLDOWN_MS
        };
    }
    return {
        snowStep: WEATHER_VISUAL_STREAM_STEP,
        snowCooldownMs: WEATHER_VISUAL_STREAM_COOLDOWN_MS,
        riverStep: WEATHER_VISUAL_RIVER_STREAM_STEP,
        riverCooldownMs: WEATHER_VISUAL_RIVER_STREAM_COOLDOWN_MS
    };
}

function streamOutdoorWeatherVisualsAroundPlayer(nowMs = 0) {
    if (activeCelestialBody !== 'earth' || !camera || !outdoorTerrainGroup) return;
    const centerX = snapToVoxel(Math.round(camera.position.x));
    const centerZ = snapToVoxel(Math.round(camera.position.z));
    const streamCfg = getWeatherVisualStreamConfig();
    const prevSnowX = weatherRuntimeState.lastVisualStreamCenterX;
    const prevSnowZ = weatherRuntimeState.lastVisualStreamCenterZ;
    const hasSnowPrev = Number.isFinite(prevSnowX) && Number.isFinite(prevSnowZ);
    if (!hasSnowPrev) {
        weatherRuntimeState.lastVisualStreamCenterX = centerX;
        weatherRuntimeState.lastVisualStreamCenterZ = centerZ;
        weatherRuntimeState.lastVisualStreamAtMs = Number(nowMs || 0);
        weatherRuntimeState.lastRiverVisualStreamCenterX = centerX;
        weatherRuntimeState.lastRiverVisualStreamCenterZ = centerZ;
        weatherRuntimeState.lastRiverVisualStreamAtMs = Number(nowMs || 0);
        queueOutdoorWeatherVisualRefresh('all');
        return;
    }
    const snowDistance = Math.max(Math.abs(centerX - prevSnowX), Math.abs(centerZ - prevSnowZ));
    const snowElapsedMs = Number(nowMs || 0) - Number(weatherRuntimeState.lastVisualStreamAtMs || 0);
    if (snowDistance >= streamCfg.snowStep && snowElapsedMs >= streamCfg.snowCooldownMs) {
        weatherRuntimeState.lastVisualStreamCenterX = centerX;
        weatherRuntimeState.lastVisualStreamCenterZ = centerZ;
        weatherRuntimeState.lastVisualStreamAtMs = Number(nowMs || 0);
        queueOutdoorWeatherVisualRefresh('snow');
    }

    const prevRiverX = weatherRuntimeState.lastRiverVisualStreamCenterX;
    const prevRiverZ = weatherRuntimeState.lastRiverVisualStreamCenterZ;
    const riverDistance = Math.max(Math.abs(centerX - prevRiverX), Math.abs(centerZ - prevRiverZ));
    const riverElapsedMs = Number(nowMs || 0) - Number(weatherRuntimeState.lastRiverVisualStreamAtMs || 0);
    if (riverDistance >= streamCfg.riverStep && riverElapsedMs >= streamCfg.riverCooldownMs) {
        weatherRuntimeState.lastRiverVisualStreamCenterX = centerX;
        weatherRuntimeState.lastRiverVisualStreamCenterZ = centerZ;
        weatherRuntimeState.lastRiverVisualStreamAtMs = Number(nowMs || 0);
        queueOutdoorWeatherVisualRefresh('river');
    }
}

function resolveOutdoorSurfaceAnchor(x, z, options = {}) {
    const allowFallback = options.allowFallback !== false;
    const anchor = getOutdoorSurfaceAnchor(x, z);
    if (anchor) return anchor;
    if (!allowFallback) return null;
    const fallbackY = getOutdoorBaseSurfaceY(x, z);
    if (!Number.isFinite(fallbackY)) return null;
    return {
        x: snapToVoxel(x),
        y: snapToVoxel(fallbackY) + 0.5,
        z: snapToVoxel(z),
        normal: new THREE.Vector3(0, 1, 0)
    };
}

function buildOutdoorTreePropsGroup() {
    const treeGroup = new THREE.Group();
    treeGroup.name = 'outdoor_tree_props';
    const nextTreeAnchors = [];
    const nextBlossomAnchors = [];
    const seasonalTrees = [];

    const treeLayout = getOutdoorTreeLayout();
    const treeCfg = getHeroPropTierConfig('CherryTreeHero');
    const heroBudget = getHeroScenePerformanceBudget(currentPerformanceTier);
    const maxTrees = Math.max(1, Math.min(
        Number(treeCfg.max || treeLayout.length),
        Math.max(2, Number(heroBudget.heroPropLimit || treeLayout.length) - 12)
    ));
    treeLayout.slice(0, maxTrees).forEach((entry, index) => {
        const x = snapToVoxel(entry.x);
        const z = snapToVoxel(entry.z);
        if (Math.hypot(x, z) > OUTDOOR_WORLD_RADIUS - 6) return;
        const anchor = resolveOutdoorSurfaceAnchor(x, z, { allowFallback: true });
        if (!anchor) return;
        const treeScale = (entry.scale || 1.0) * 1.6;
        const tree = createCherryTreeHero(new THREE.Vector3(anchor.x, anchor.y, anchor.z), { scale: treeScale });
        const treeHeading = new THREE.Vector3(-x, 0, -z).add(new THREE.Vector3(index % 2 === 0 ? 3.4 : -3.4, 0, index % 2 === 0 ? -2.2 : 2.2));
        tree.position.set(anchor.x, anchor.y, anchor.z);
        orientGroupUpright(tree, treeHeading);
        treeGroup.add(tree);
        seasonalTrees.push({
            leaves: Array.isArray(tree.userData.seasonalLeafMaterials) ? tree.userData.seasonalLeafMaterials : [],
            blossoms: Array.isArray(tree.userData.seasonalBlossomMaterials) ? tree.userData.seasonalBlossomMaterials : [],
            leafMeshes: Array.isArray(tree.userData.seasonalLeafMeshes) ? tree.userData.seasonalLeafMeshes : [],
            phase: (index * 0.73) + (Math.abs(x + z) * 0.01)
        });
        const treeAnchorLocal = tree.userData.treeAnchorLocal?.clone?.();
        if (treeAnchorLocal) {
            nextTreeAnchors.push(treeAnchorLocal.applyQuaternion(tree.quaternion).add(tree.position));
        }
        const blossomLocals = Array.isArray(tree.userData.blossomAnchorsLocal) ? tree.userData.blossomAnchorsLocal : [];
        blossomLocals.forEach((blossomAnchor) => {
            nextBlossomAnchors.push(blossomAnchor.clone().applyQuaternion(tree.quaternion).add(tree.position));
        });
    });

    return {
        treeGroup,
        nextTreeAnchors,
        nextBlossomAnchors,
        seasonalTrees
    };
}

function mountOutdoorTreeProps(targetGroup, options = {}) {
    if (!targetGroup) return;
    const replaceExisting = options.replaceExisting !== false;
    if (replaceExisting) {
        const existingTreeGroup = targetGroup.getObjectByName('outdoor_tree_props');
        if (existingTreeGroup) {
            targetGroup.remove(existingTreeGroup);
            disposeVoxelGroup(existingTreeGroup);
        }
    } else if (targetGroup.getObjectByName('outdoor_tree_props')) {
        return;
    }
    const { treeGroup, nextTreeAnchors, nextBlossomAnchors, seasonalTrees } = buildOutdoorTreePropsGroup();
    targetGroup.add(treeGroup);
    const generatedAnchors = collectOutdoorGeneratedTreeAnchors();
    outdoorTreeAnchors = [
        ...nextTreeAnchors,
        ...(Array.isArray(generatedAnchors.treeAnchors) ? generatedAnchors.treeAnchors : [])
    ];
    outdoorBlossomAnchors = [
        ...nextBlossomAnchors,
        ...(Array.isArray(generatedAnchors.blossomAnchors) ? generatedAnchors.blossomAnchors : [])
    ];
    outdoorSeasonalTrees = seasonalTrees;
}

function clearMountedOceanVehicles() {
    oceanVehicleMeshes.forEach((vehicle) => {
        if (!vehicle) return;
        const docId = String(vehicle.userData?.docId || '');
        if (docId) {
            deletePlacedItem(docId);
        }
        vehicle.parent?.remove?.(vehicle);
        disposeVoxelGroup(vehicle);
    });
    oceanVehicleMeshes = [];
    oceanVehicleRuntimeState.activeVehicleId = null;
    oceanVehicleRuntimeState.steeringByVehicleId.clear();
}

function createOceanRaftVehicle() {
    const raft = new THREE.Group();
    raft.name = 'OceanRaftVehicle';
    raft.userData.docId = 'vehicle_raft';
    raft.userData.vehicleId = 'raft';
    raft.userData.isVehicle = true;
    raft.userData.isSeatable = true;
    raft.userData.vehicleLockSeat = false;
    raft.userData.isProtectedStructure = true;
    raft.userData.excludeFromPlayerCollision = true;
    raft.userData.capacity = 4;
    raft.userData.maxSpeed = 7.2;
    raft.userData.turnSpeed = 1.65;
    raft.userData.seatLocalOffset = new THREE.Vector3(0, 1.0, -0.12);
    raft.userData.baseWaterline = Number(OCEAN_RAFT_START.x || (OUTDOOR_WORLD_RADIUS + 0.9));

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.84, metalness: 0.04 });
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 0.92, metalness: 0.0 });
    const plankGeo = new THREE.BoxGeometry(2.8, 0.2, 1.4);
    const plank = new THREE.Mesh(plankGeo, woodMat);
    plank.position.y = 0.7;
    raft.add(plank);
    raft.userData.highlightProxy = plank;

    for (let i = -1; i <= 1; i += 2) {
        const floatLog = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.36, 0.38), woodMat);
        floatLog.position.set(0, 0.43, i * 0.52);
        raft.add(floatLog);
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.5, 8), ropeMat);
    mast.position.set(0.2, 1.36, 0);
    raft.add(mast);
    const sail = new THREE.Mesh(
        new THREE.PlaneGeometry(0.95, 0.74),
        new THREE.MeshStandardMaterial({ color: 0xf5f3e8, roughness: 0.9, metalness: 0, side: THREE.DoubleSide })
    );
    sail.position.set(0.25, 1.35, 0);
    sail.rotation.y = Math.PI * 0.5;
    raft.add(sail);
    raft.traverse((child) => {
        if (child?.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    return raft;
}

function createOceanCaravelVehicle() {
    const ship = new THREE.Group();
    ship.name = 'OceanCaravelVehicle';
    ship.userData.docId = 'vehicle_caravel';
    ship.userData.vehicleId = 'caravel';
    ship.userData.isVehicle = true;
    ship.userData.isSeatable = true;
    ship.userData.vehicleLockSeat = false;
    ship.userData.isProtectedStructure = true;
    ship.userData.excludeFromPlayerCollision = true;
    ship.userData.capacity = 24;
    ship.userData.maxSpeed = 9.4;
    ship.userData.turnSpeed = 1.1;
    ship.userData.seatLocalOffset = new THREE.Vector3(0, 2.08, -1.2);
    ship.userData.baseWaterline = Number(OCEAN_CARAVEL_START.x || (OUTDOOR_WORLD_RADIUS + 1.0));

    const hullMat = new THREE.MeshStandardMaterial({ color: 0x5f3a20, roughness: 0.82, metalness: 0.08 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xc49a6c, roughness: 0.76, metalness: 0.06 });
    const mastMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.88, metalness: 0.02 });
    const sailMat = new THREE.MeshStandardMaterial({ color: 0xf9f6ea, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });

    const hull = new THREE.Mesh(new THREE.BoxGeometry(10.8, 1.2, 3.6), hullMat);
    hull.position.y = 0.9;
    ship.add(hull);
    ship.userData.highlightProxy = hull;
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.65, 2.2, 4), hullMat);
    bow.rotation.z = -Math.PI * 0.5;
    bow.position.set(6.25, 1.0, 0);
    ship.add(bow);
    const stern = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.1, 2.8), hullMat);
    stern.position.set(-5.5, 1.45, 0);
    ship.add(stern);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(10.3, 0.24, 3.2), trimMat);
    deck.position.y = 1.62;
    ship.add(deck);
    const quarterDeck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.22, 2.7), trimMat);
    quarterDeck.position.set(-4.0, 2.06, 0);
    ship.add(quarterDeck);

    const mastPositions = [2.2, -0.6, -3.3];
    mastPositions.forEach((mx, idx) => {
        const mastHeight = idx === 0 ? 5.2 : (idx === 1 ? 4.7 : 4.2);
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, mastHeight, 10), mastMat);
        mast.position.set(mx, 1.62 + (mastHeight * 0.5), 0);
        ship.add(mast);
        const sail = new THREE.Mesh(new THREE.PlaneGeometry(idx === 0 ? 2.9 : 2.3, idx === 0 ? 2.5 : 2.1), sailMat);
        sail.position.set(mx + 0.05, 2.6 + (mastHeight * 0.36), 0);
        sail.rotation.y = Math.PI * 0.5;
        ship.add(sail);
    });

    for (let i = 0; i < 12; i += 1) {
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.45), trimMat);
        const lane = i % 2 === 0 ? -0.95 : 0.95;
        const row = Math.floor(i / 2);
        seat.position.set(3.8 - (row * 1.45), 1.86, lane);
        ship.add(seat);
    }

    ship.userData.seatSlots = Array.from({ length: ship.userData.capacity }, (_, i) => {
        const lane = i % 2 === 0 ? -1.08 : 1.08;
        const row = Math.floor(i / 2);
        return new THREE.Vector3(4.2 - (row * 0.72), 2.08, lane);
    });
    ship.traverse((child) => {
        if (child?.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    return ship;
}

function updateOceanVehicleSeatPosition(vehicle) {
    if (!vehicle?.userData?.seatLocalOffset) return;
    const seatPos = vehicle.userData.seatLocalOffset.clone()
        .applyQuaternion(vehicle.quaternion)
        .add(vehicle.position);
    vehicle.userData.seatPosition = seatPos;
}

function mountOceanVehicles(targetGroup) {
    if (!targetGroup) return;
    clearMountedOceanVehicles();

    const up = getCubeFaceUpVector('east');
    const heading = new THREE.Vector3(0, 1, 0);

    const raft = createOceanRaftVehicle();
    raft.position.set(OCEAN_RAFT_START.x, OCEAN_RAFT_START.y, OCEAN_RAFT_START.z);
    orientGroupToSurfaceNormal(raft, up, heading);
    updateOceanVehicleSeatPosition(raft);

    const caravel = createOceanCaravelVehicle();
    caravel.position.set(OCEAN_CARAVEL_START.x, OCEAN_CARAVEL_START.y, OCEAN_CARAVEL_START.z);
    orientGroupToSurfaceNormal(caravel, up, heading);
    updateOceanVehicleSeatPosition(caravel);

    targetGroup.add(raft);
    targetGroup.add(caravel);
    oceanVehicleMeshes = [raft, caravel];
    oceanVehicleRuntimeState.activeVehicleId = null;
    oceanVehicleRuntimeState.steeringByVehicleId.clear();

    oceanVehicleMeshes.forEach((vehicle) => {
        const docId = String(vehicle.userData?.docId || '');
        if (!docId) return;
        setPlacedItem(docId, vehicle);
    });
}

function updateOceanVehicles(deltaSeconds = 0) {
    if (!Array.isArray(oceanVehicleMeshes) || !oceanVehicleMeshes.length) return;
    const dt = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(0.05, deltaSeconds)) : 0;
    if (dt <= 0) return;

    const seatedVehicle = seatedState.active
        ? oceanVehicleMeshes.find((mesh) => String(mesh?.userData?.docId || '') === String(seatedState.targetId || ''))
        : null;
    oceanVehicleRuntimeState.activeVehicleId = seatedVehicle?.userData?.vehicleId || null;

    const up = getCubeFaceUpVector('east');
    const rightBound = OUTDOOR_WORLD_RADIUS + 1.8;
    const minY = (-2 * OUTDOOR_WORLD_RADIUS) + 8;
    const maxY = -8;
    const minZ = -OUTDOOR_WORLD_RADIUS + 8;
    const maxZ = OUTDOOR_WORLD_RADIUS - 8;

    oceanVehicleMeshes.forEach((vehicle, index) => {
        if (!vehicle) return;
        const vehicleId = String(vehicle.userData?.vehicleId || `vehicle_${index}`);
        const steering = oceanVehicleRuntimeState.steeringByVehicleId.get(vehicleId) || { speed: 0, yaw: 0 };
        const maxSpeed = Number(vehicle.userData?.maxSpeed || 7);
        const turnSpeed = Number(vehicle.userData?.turnSpeed || 1.2);
        const isActive = seatedVehicle === vehicle && movementController?.state;

        if (isActive) {
            const input = movementController.state.inputState || {};
            const forward = Number(input.forward || 0) - Number(input.backward || 0);
            const turn = Number(input.right || 0) - Number(input.left || 0);
            const sprintMul = input.sprint ? 1.24 : 1;
            const targetSpeed = THREE.MathUtils.clamp(forward * maxSpeed * sprintMul, -maxSpeed * 0.5, maxSpeed * sprintMul);
            steering.speed = THREE.MathUtils.damp(steering.speed || 0, targetSpeed, 8.2, dt);
            steering.yaw = Number(steering.yaw || 0) + (turn * turnSpeed * dt);
        } else {
            steering.speed = THREE.MathUtils.damp(steering.speed || 0, 0, 3.2, dt);
        }

        const motionForward = getStableProjectedForward(up, new THREE.Vector3(
            Math.sin(steering.yaw || 0),
            0,
            Math.cos(steering.yaw || 0)
        ));
        if (motionForward.lengthSq() > 1e-6) {
            vehicle.position.addScaledVector(motionForward, steering.speed * dt);
        }
        vehicle.position.x = rightBound;
        vehicle.position.y = THREE.MathUtils.clamp(vehicle.position.y, minY, maxY);
        vehicle.position.z = THREE.MathUtils.clamp(vehicle.position.z, minZ, maxZ);

        const bobWave = Math.sin(((performance.now?.() || Date.now()) * 0.0013) + index) * 0.08;
        const bobTargetX = Number(vehicle.userData?.baseWaterline || rightBound) + bobWave;
        vehicle.position.x = THREE.MathUtils.damp(vehicle.position.x, bobTargetX, 6.8, dt);
        orientGroupToSurfaceNormal(vehicle, up, motionForward, 0);
        updateOceanVehicleSeatPosition(vehicle);
        oceanVehicleRuntimeState.steeringByVehicleId.set(vehicleId, steering);
    });
}

function mountCubeCornerLampPosts(targetGroup) {
    if (!targetGroup) return;
    const faces = ['top', 'bottom', 'east', 'west', 'north', 'south'];
    const signs = [-1, 1];
    const inset = 5;
    const R = OUTDOOR_WORLD_RADIUS;
    const placedKeys = new Set();
    const addLampAtFace = (faceId, u, v, targetU = 0, targetV = 0) => {
        const faceUp = getCubeFaceUpVector(faceId);
        const anchor = cubeFaceLocalToWorld(faceId, u, v);
        const target = cubeFaceLocalToWorld(faceId, targetU, targetV);
        let heading = target.sub(anchor);
        if (heading.lengthSq() < 1e-6) {
            heading = getStableProjectedForward(faceUp, new THREE.Vector3(0, 0, -1));
        }
        const dedupeKey = `${faceId}:${Math.round(anchor.x)}:${Math.round(anchor.y)}:${Math.round(anchor.z)}`;
        if (placedKeys.has(dedupeKey)) return;
        placedKeys.add(dedupeKey);
        const lamp = createLampPostHero(new THREE.Vector3(anchor.x, anchor.y, anchor.z));
        lamp.userData.faceId = faceId;
        orientGroupToSurfaceNormal(lamp, faceUp, heading, 0);
        targetGroup.add(lamp);
        if (lamp.userData?.lampLight) {
            outdoorLampLights.push(lamp.userData.lampLight);
        }
    };

    faces.forEach((faceId) => {
        signs.forEach((su) => {
            signs.forEach((sv) => {
                const u = su * (R - inset);
                const v = sv * (R - inset);
                addLampAtFace(faceId, u, v, 0, 0);
            });
        });
    });

    const topRing = Math.min(R - 12, 48);
    const topMid = Math.round(topRing * 0.54);
    [
        [topRing, 0],
        [-topRing, 0],
        [0, topRing],
        [0, -topRing],
        [topRing, topMid],
        [topRing, -topMid],
        [-topRing, topMid],
        [-topRing, -topMid],
        [topMid, topRing],
        [topMid, -topRing],
        [-topMid, topRing],
        [-topMid, -topRing]
    ].forEach(([u, v]) => addLampAtFace('top', u, v, 0, 0));
}

function cancelOutdoorFlowerBuildTask() {
    if (!outdoorFlowerBuildTask) return;
    outdoorFlowerBuildTask.cancelled = true;
    if (Number.isFinite(outdoorFlowerBuildTask.rafId) && outdoorFlowerBuildTask.rafId > 0) {
        window.cancelAnimationFrame(outdoorFlowerBuildTask.rafId);
    }
    outdoorFlowerBuildTask = null;
}

function getOutdoorFlowerBuildProfile() {
    const preset = getActiveScenePresetConfig();
    const densityMul = preset.heroGardenDensity === 'high' ? 1.22 : (preset.heroGardenDensity === 'low' ? 0.8 : 1);
    const heroBudget = getHeroScenePerformanceBudget(currentPerformanceTier);
    const heroRadius = Math.max(40, Number(heroBudget.highDetailRadius || 56));
    if (currentPerformanceTier === 'low') {
        return {
            radius: Math.round(Math.min(64, heroRadius) * densityMul),
            stride: densityMul > 1 ? 3 : 4,
            maxCellsPerFrame: Math.round(120 * Math.min(1.15, densityMul)),
            frameBudgetMs: 4
        };
    }
    if (currentPerformanceTier === 'high') {
        return {
            radius: Math.round(Math.min(96, heroRadius + 24) * densityMul),
            stride: densityMul > 1 ? 2 : 3,
            maxCellsPerFrame: Math.round(260 * densityMul),
            frameBudgetMs: 7
        };
    }
    return {
        radius: Math.round(Math.min(84, heroRadius + 12) * densityMul),
        stride: densityMul > 1 ? 2 : 3,
        maxCellsPerFrame: Math.round(180 * densityMul),
        frameBudgetMs: 5.5
    };
}

function startOutdoorFlowerDecorationBuild(targetGroup) {
    if (!targetGroup) return;
    cancelOutdoorFlowerBuildTask();
    const profile = getOutdoorFlowerBuildProfile();
    const cells = [];
    for (let x = -profile.radius; x <= profile.radius; x += profile.stride) {
        for (let z = -profile.radius; z <= profile.radius; z += profile.stride) {
            cells.push([x, z]);
        }
    }
    if (getActiveScenePresetConfig().id === 'hero_classroom_planet_v1') {
        const focalX = 0;
        const focalZ = 42;
        cells.sort((a, b) => {
            const da = Math.hypot(a[0] - focalX, (a[1] - focalZ) * 1.25);
            const db = Math.hypot(b[0] - focalX, (b[1] - focalZ) * 1.25);
            return da - db;
        });
    }
    outdoorFlowerBuildTask = {
        targetGroup,
        cells,
        index: 0,
        rafId: 0,
        cancelled: false
    };
    const taskRef = outdoorFlowerBuildTask;
    const pump = () => {
        if (!outdoorFlowerBuildTask || outdoorFlowerBuildTask !== taskRef || taskRef.cancelled) return;
        if (!taskRef.targetGroup?.parent) {
            cancelOutdoorFlowerBuildTask();
            return;
        }
        const frameStart = performance.now();
        let processed = 0;
        while (
            taskRef.index < taskRef.cells.length
            && processed < profile.maxCellsPerFrame
            && (performance.now() - frameStart) <= profile.frameBudgetMs
        ) {
            const [x, z] = taskRef.cells[taskRef.index];
            taskRef.index += 1;
            processed += 1;
            const cellKey = getOutdoorTerrainCellKey(x, z);
            if (outdoorTerrainRemovedTopCells.has(cellKey)) continue;
            if (isRiverCell(x, z) || isRoomClearanceCell(x, z) || isRoomApronCell(x, z)) continue;
            if (isEntryTunnelCell(x, getEntryTunnelFloorY(), z) || isEarthLaunchPadFootprintCell(x, z, 1)) continue;
            const anchor = resolveOutdoorSurfaceAnchor(x, z, { allowFallback: false });
            if (!anchor) continue;
            const flowerSeed = valueNoise3D(anchor.x, anchor.y, anchor.z, 203);
            if (flowerSeed <= 0.996) continue;
            const flowerId = flowerSeed > 0.982 ? 'flower_yellow' : 'flower_red';
            const flower = createFlowerDecorationGroup(flowerId, {
                x: anchor.x,
                y: anchor.y,
                z: anchor.z,
                scale: [0.25, 0.25, 0.25],
                terrainDecor: 'flower',
                surfaceNormalX: anchor.normal.x,
                surfaceNormalY: anchor.normal.y,
                surfaceNormalZ: anchor.normal.z
            }, taskRef.targetGroup.name || 'outdoor_world', 'terrain');
            taskRef.targetGroup.add(flower);
        }
        if (taskRef.index >= taskRef.cells.length) {
            outdoorFlowerBuildTask = null;
            return;
        }
        taskRef.rafId = window.requestAnimationFrame(pump);
    };
    taskRef.rafId = window.requestAnimationFrame(pump);
}


function decorateOutdoorWorldGroup(targetGroup) {
    outdoorLampLights = [];
    outdoorRiverFish = [];
    outdoorTreeAnchors = [];
    outdoorBlossomAnchors = [];
    outdoorSeasonalTrees = [];
    if (!targetGroup) return;
    mountOutdoorTreeProps(targetGroup, { replaceExisting: true });
    mountOceanVehicles(targetGroup);
    mountCubeCornerLampPosts(targetGroup);
    mountHeroGardenProps(targetGroup);
    startOutdoorFlowerDecorationBuild(targetGroup);

    const fishTypes = ['trout', 'koi', 'carp', 'tetra'];
    for (let x = -OUTDOOR_WORLD_RADIUS + 8; x <= OUTDOOR_WORLD_RADIUS - 8; x += 10) {
        const centerZ = getRiverCenterZAtX(x);
        const waterSurfaceY = getOutdoorRenderSurfaceY(x, centerZ);
        if (!Number.isFinite(waterSurfaceY)) continue;
        for (let lane = -1; lane <= 1; lane += 2) {
            const fishType = fishTypes[(Math.abs(x + lane) / 3) % fishTypes.length | 0];
            const fish = createRiverFishModel(fishType);
            fish.position.set(x + (lane * 0.6), waterSurfaceY - 0.95 - (Math.abs(lane) * 0.06), centerZ + (lane * 0.4));
            fish.rotation.y = lane > 0 ? Math.PI : 0;
            fish.userData = {
                homeX: fish.position.x,
                homeY: fish.position.y,
                homeZ: fish.position.z,
                swimSpeed: 0.36 + (Math.abs(x) % 5) * 0.04,
                phase: (Math.abs(x * 0.17) + Math.abs(lane * 1.3)),
                turnBias: lane > 0 ? 1 : -1
            };
            targetGroup.add(fish);
            outdoorRiverFish.push(fish);
        }
    }
}

function ensureOutdoorTreePropsNow(targetGroup) {
    if (!targetGroup) return;
    mountOutdoorTreeProps(targetGroup, { replaceExisting: false });
}

function registerStaticCollisionBox(id, position, size, options = {}) {
    if (!scene || !THREE) return null;
    const existing = staticCollisionItems.get(id);
    if (existing) {
        existing.parent?.remove?.(existing);
        deletePlacedItem(id);
        staticCollisionItems.delete(id);
    }
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size.x, size.y, size.z),
        new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0,
            depthWrite: false
        })
    );
    mesh.position.copy(position);
    mesh.userData.docId = id;
    mesh.userData.isStaticCollider = true;
    mesh.userData.isRoomShellCollider = !!options.isRoomShellCollider;
    mesh.userData.isProtectedStructure = true;
    mesh.userData.isStepable = options.isStepable !== false;
    mesh.userData.excludeFromPlayerCollision = !!options.excludeFromPlayerCollision;
    mesh.userData.collisionPadding = Number.isFinite(options.padding) ? options.padding : 0.01;
    mesh.userData.stepSnapDepth = Number.isFinite(options.stepSnapDepth)
        ? Math.max(0.18, Number(options.stepSnapDepth))
        : 0.18;
    mesh.userData.ignoreRaycast = true;
    mesh.visible = false;
    (options.parent || scene).add(mesh);
    refreshCollisionMeshBounds(mesh);
    staticCollisionItems.set(id, mesh);
    setPlacedItem(id, mesh);
    return mesh;
}

function registerRoomShellColliders(parentGroup) {
    if (!parentGroup) return;
    const floorY = 0.25;
    const roofY = ROOM_HEIGHT - 0.2;
    const wallCenterY = (ROOM_HEIGHT * 0.5);
    const wallDepth = 1.9;
    const halfWidth = ROOM_WIDTH / 2;
    const halfDepth = ROOM_DEPTH / 2;
    const doorwayHalfWidth = 1.08;
    registerStaticCollisionBox(
        '__static_room_floor__',
        new THREE.Vector3(0, floorY, 0),
        new THREE.Vector3(ROOM_WIDTH + 0.2, 0.5, ROOM_DEPTH + 0.2),
        { isStepable: true, padding: 0.04, parent: parentGroup, isRoomShellCollider: true, excludeFromPlayerCollision: false }
    );
    registerStaticCollisionBox(
        '__static_room_roof__',
        new THREE.Vector3(0, roofY, 0),
        new THREE.Vector3(ROOM_WIDTH + 0.6, 0.56, ROOM_DEPTH + 0.6),
        { isStepable: true, padding: 0.08, parent: parentGroup, isRoomShellCollider: true, excludeFromPlayerCollision: true }
    );
    registerStaticCollisionBox(
        '__static_room_back_wall__',
        new THREE.Vector3(0, wallCenterY, -halfDepth + 0.5),
        new THREE.Vector3(ROOM_WIDTH + 0.4, ROOM_HEIGHT + 0.4, wallDepth),
        { isStepable: false, padding: 0.08, parent: parentGroup, isRoomShellCollider: true, excludeFromPlayerCollision: true }
    );
    registerStaticCollisionBox(
        '__static_room_left_wall__',
        new THREE.Vector3(-halfWidth + 0.5, wallCenterY, 0),
        new THREE.Vector3(wallDepth, ROOM_HEIGHT + 0.4, ROOM_DEPTH + 0.4),
        { isStepable: false, padding: 0.08, parent: parentGroup, isRoomShellCollider: true, excludeFromPlayerCollision: true }
    );
    registerStaticCollisionBox(
        '__static_room_right_wall__',
        new THREE.Vector3(halfWidth - 0.5, wallCenterY, 0),
        new THREE.Vector3(wallDepth, ROOM_HEIGHT + 0.4, ROOM_DEPTH + 0.4),
        { isStepable: false, padding: 0.08, parent: parentGroup, isRoomShellCollider: true, excludeFromPlayerCollision: true }
    );
    registerStaticCollisionBox(
        '__static_room_front_left__',
        new THREE.Vector3(-((halfWidth + doorwayHalfWidth + 1) * 0.5), wallCenterY, halfDepth - 0.5),
        new THREE.Vector3((halfWidth - doorwayHalfWidth) + 0.2, ROOM_HEIGHT + 0.4, wallDepth),
        { isStepable: false, padding: 0.08, parent: parentGroup, isRoomShellCollider: true, excludeFromPlayerCollision: true }
    );
    registerStaticCollisionBox(
        '__static_room_front_right__',
        new THREE.Vector3(((halfWidth + doorwayHalfWidth + 1) * 0.5), wallCenterY, halfDepth - 0.5),
        new THREE.Vector3((halfWidth - doorwayHalfWidth) + 0.2, ROOM_HEIGHT + 0.4, wallDepth),
        { isStepable: false, padding: 0.08, parent: parentGroup, isRoomShellCollider: true, excludeFromPlayerCollision: true }
    );
    registerStaticCollisionBox(
        '__static_room_corner_nw__',
        new THREE.Vector3(-halfWidth + 0.72, wallCenterY, -halfDepth + 0.72),
        new THREE.Vector3(1.7, ROOM_HEIGHT + 0.4, 1.7),
        { isStepable: false, padding: 0.08, parent: parentGroup, isRoomShellCollider: true, excludeFromPlayerCollision: true }
    );
    registerStaticCollisionBox(
        '__static_room_corner_ne__',
        new THREE.Vector3(halfWidth - 0.72, wallCenterY, -halfDepth + 0.72),
        new THREE.Vector3(1.7, ROOM_HEIGHT + 0.4, 1.7),
        { isStepable: false, padding: 0.08, parent: parentGroup, isRoomShellCollider: true, excludeFromPlayerCollision: true }
    );
    registerStaticCollisionBox(
        '__static_room_corner_sw__',
        new THREE.Vector3(-halfWidth + 0.72, wallCenterY, halfDepth - 0.72),
        new THREE.Vector3(1.7, ROOM_HEIGHT + 0.4, 1.7),
        { isStepable: false, padding: 0.08, parent: parentGroup, isRoomShellCollider: true, excludeFromPlayerCollision: true }
    );
    registerStaticCollisionBox(
        '__static_room_corner_se__',
        new THREE.Vector3(halfWidth - 0.72, wallCenterY, halfDepth - 0.72),
        new THREE.Vector3(1.7, ROOM_HEIGHT + 0.4, 1.7),
        { isStepable: false, padding: 0.08, parent: parentGroup, isRoomShellCollider: true, excludeFromPlayerCollision: true }
    );
}

function registerEarthLaunchPadColliders(origin) {
    if (!origin) return;
    // Keep only a narrow central blocker under the rocket; the outer ring must stay walkable.
    registerStaticCollisionBox(
        '__static_launchpad_solid__',
        new THREE.Vector3(origin.x, origin.y + 1.2, origin.z),
        new THREE.Vector3(6.8, 2.4, 6.8),
        { isStepable: true, padding: 0.01 }
    );

    // Small top deck directly below the rocket footprint.
    registerStaticCollisionBox(
        '__static_launchpad_top__',
        new THREE.Vector3(origin.x, origin.y + 1.54, origin.z),
        new THREE.Vector3(7.4, 0.44, 7.4),
        { isStepable: true, padding: 0.01 }
    );

    // Single front approach from the room side; keep the grass perimeter free.
    const stepCount = 6;
    const stepRise = 0.26;
    const stepThickness = 0.32;
    const stepReach = 8.1;
    const stepWidth = 4.6;
    for (let i = 0; i < stepCount; i += 1) {
        const y = origin.y + 0.16 + (i * stepRise);
        const reach = stepReach + (i * 0.92);
        registerStaticCollisionBox(
            `__static_launchpad_ramp_n_${i}__`,
            new THREE.Vector3(origin.x, y, origin.z - reach),
            new THREE.Vector3(stepWidth, stepThickness, 1.5),
            { isStepable: true, padding: 0.01 }
        );
    }
}

function getMoonSpawnPosition(bodyId = currentSpaceBodyId) {
    const body = getTravelBodyConfig(bodyId);
    return getMoonCenter().add(new THREE.Vector3(0, body.surfaceRadius + PLANET_EYE_HEIGHT + 0.8, 0));
}

function getEarthReturnPosition() {
    return getLobbySpawnPosition().add(new THREE.Vector3(0, 0, (ROOM_DEPTH / 2) - 2));
}

function getEarthLaunchPadBaseY() {
    const anchor = getEarthLaunchPadAnchor();
    const sampledY = Number(
        getEarthTopFaceY(anchor.x, anchor.z)
        ?? getOutdoorRenderSurfaceY(anchor.x, anchor.z)
        ?? Math.round(getOutdoorTerrainSurfaceY(anchor.x, anchor.z) || 0)
    );
    return sampledY + EARTH_LAUNCH_PAD_OFFSET_Y;
}

function alignOutdoorPropToTerrain(group, x, z, yawOffset = 0, directionHint = null) {
    if (!group) return;
    const anchor = getOutdoorSurfaceAnchor(x, z);
    if (!anchor) return;
    orientGroupToSurfaceNormal(group, anchor.normal, directionHint, yawOffset);
}

function alignEarthLaunchStructure(group, x, z, yawOffset = 0, directionHint = null) {
    if (!group) return;
    const fallbackDirection = new THREE.Vector3(-x, 0, (ROOM_DEPTH * 0.5) - z);
    const heading = (directionHint || fallbackDirection).clone();
    heading.y = 0;
    if (heading.lengthSq() < 0.0001) {
        heading.set(0, 0, 1);
    } else {
        heading.normalize();
    }
    const yaw = Math.atan2(heading.x, heading.z) + yawOffset;
    group.quaternion.setFromEuler(new THREE.Euler(0, yaw, 0));
}


async function travelByRocket(targetWorld = 'moon') {
    const nextBody = targetWorld === 'earth' ? 'earth' : 'space';
    activeCelestialBody = nextBody;
    if (nextBody === 'space') {
        currentSpaceBodyId = getTravelBodyConfig(targetWorld).id;
        await generateMoonWorld(currentSpaceBodyId);
        if (moonRocketShuttle) {
            moonRocketShuttle.position.copy(getMoonSpawnPosition(currentSpaceBodyId)).add(new THREE.Vector3(0, -PLANET_EYE_HEIGHT - 1.8, 0));
        }
    }
    const spawn = nextBody === 'space' ? getMoonSpawnPosition(currentSpaceBodyId) : getEarthReturnPosition();
    ensurePlayerWorldPosition().copy(spawn);
    if (camera) camera.position.copy(spawn);
    lastAnimationTimeMs = 0;
    movementController?.resetMovementState?.();
    resetMovementState();
    playerYaw = 0;
    playerPitch = 0;
    lookTargetYaw = playerYaw;
    lookTargetPitch = playerPitch;
    if (camera) {
        camera.rotation.order = 'YXZ';
        camera.rotation.set(0, 0, 0);
    }
    if (movementController?.state) {
        movementController.state.playerYaw = playerYaw;
        movementController.state.playerPitch = playerPitch;
        movementController.state.lookTargetYaw = lookTargetYaw;
        movementController.state.lookTargetPitch = lookTargetPitch;
        if (movementController.state.lookInputState) {
            movementController.state.lookInputState.deltaX = 0;
            movementController.state.lookInputState.deltaY = 0;
        }
        syncMovementStateFromController(movementController.state);
    }
    clearPendingLookInput();
    persistActiveSession();
    saveCurrentSpawnState(true);
    const targetName = nextBody === 'space' ? getTravelBodyConfig(currentSpaceBodyId).name : 'Planeta Tierra';
    showTooltip(`Despegue completado: destino ${targetName}`);
}

function buildCenteredStripes(radius, stripeWidth, priorityCoord = null) {
    const safeRadius = Math.max(4, Math.round(Number(radius || OUTDOOR_WORLD_RADIUS)));
    const width = Math.max(1, Math.round(Number(stripeWidth || 2)));
    const stripes = [];
    const centerHalf = Math.floor(width / 2);
    stripes.push({ min: -centerHalf, max: centerHalf });
    for (let start = centerHalf + 1; start <= safeRadius; start += width) {
        const end = Math.min(start + width - 1, safeRadius);
        stripes.push({ min: start, max: end });
        stripes.push({ min: -end, max: -start });
    }
    if (Number.isFinite(priorityCoord)) {
        const p = Math.round(Number(priorityCoord));
        stripes.sort((a, b) => {
            const aContains = p >= a.min && p <= a.max ? 1 : 0;
            const bContains = p >= b.min && p <= b.max ? 1 : 0;
            return bContains - aContains;
        });
    }
    return stripes;
}

function getOutdoorChunkStripeWidth(face, options = {}) {
    const isSurfaceOnly = options.includePlanetShell === false;
    if (isSurfaceOnly) return 6;
    if (face === 'top') return 4;
    return 3;
}

function getOutdoorChunkSliceWidth(face, options = {}, stripeWidth = 2) {
    const isSurfaceOnly = options.includePlanetShell === false;
    if (isSurfaceOnly) return Math.max(2, stripeWidth);
    if (face === 'top') return Math.max(2, Math.min(4, stripeWidth));
    return Math.max(2, Math.min(3, stripeWidth));
}

function buildImmediatePerimeterFenceBlocks(radius = OUTDOOR_WORLD_RADIUS) {
    const R = Math.max(24, Math.round(Number(radius || OUTDOOR_WORLD_RADIUS)));
    const topY = 0;
    const bottomY = -2 * R;
    const blocks = [];
    const seen = new Set();
    const pushFence = (x, y, z, itemId = 'wood_plank') => {
        const key = makeVoxelKey(x, y, z);
        if (seen.has(key)) return;
        seen.add(key);
        blocks.push({
            itemId,
            x,
            y,
            z,
            terrain: true,
            role: 'surface',
            terrainShape: 'planet',
            columnX: x,
            columnZ: z
        });
    };
    for (let x = -R; x <= R; x += 1) {
        pushFence(x, topY + 1, -R - 1, 'wood_plank');
        pushFence(x, topY + 1, R + 1, 'wood_plank');
        pushFence(x, bottomY - 1, -R - 1, 'stone_cobble');
        pushFence(x, bottomY - 1, R + 1, 'stone_cobble');
    }
    for (let z = -R; z <= R; z += 1) {
        pushFence(-R - 1, topY + 1, z, 'wood_plank');
        pushFence(R + 1, topY + 1, z, 'wood_plank');
        pushFence(-R - 1, bottomY - 1, z, 'stone_cobble');
        pushFence(R + 1, bottomY - 1, z, 'stone_cobble');
    }
    for (let y = bottomY; y <= topY; y += 2) {
        pushFence(R + 1, y, R + 1, 'wood_plank');
        pushFence(-R - 1, y, R + 1, 'wood_plank');
        pushFence(R + 1, y, -R - 1, 'wood_plank');
        pushFence(-R - 1, y, -R - 1, 'wood_plank');
    }
    return blocks;
}

function getCurrentEarthFaceForStreaming() {
    const sample = camera?.position || playerWorldPosition || ensurePlayerWorldPosition();
    if (!sample) return 'top';
    const preferredFace = movementController?.state?.currentCubeFace || lastEarthSurfaceFaceHint || null;
    return updateLastEarthSurfaceFaceHint(sample, preferredFace);
}

function getFaceBuildOrder(primaryFace = 'top') {
    const safePrimary = CUBE_FACE_NORMALS[primaryFace] ? primaryFace : 'top';
    const neighbors = CUBE_FACE_NEIGHBORS[safePrimary] || [];
    const remaining = Object.keys(CUBE_FACE_NORMALS).filter((face) => face !== safePrimary && !neighbors.includes(face));
    return [safePrimary, ...neighbors, ...remaining];
}

function summarizeOutdoorChunkQueueByFace(queue = outdoorWorldChunkQueue) {
    const summary = {};
    (Array.isArray(queue) ? queue : []).forEach((chunk) => {
        const face = String(chunk?.face || 'unknown');
        summary[face] = (summary[face] || 0) + 1;
    });
    return summary;
}

function getOutdoorChunkPriorityDistance(chunk, priorityX = null, priorityZ = null) {
    const priorityCoord = chunk?.axis === 'x' ? priorityX : priorityZ;
    if (!Number.isFinite(priorityCoord)) return 0;
    const min = Number(chunk?.min);
    const max = Number(chunk?.max);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;
    const p = Math.round(Number(priorityCoord));
    if (p >= min && p <= max) return -1000;
    return Math.min(Math.abs(p - min), Math.abs(p - max));
}

function maybeReprioritizeOutdoorChunkQueue(state = null) {
    if (!state || !Array.isArray(outdoorWorldChunkQueue) || outdoorWorldChunkQueue.length < 2) return;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if ((now - Number(state.lastQueueReprioritizeAtMs || 0)) < 220) return;
    const sample = camera?.position || playerWorldPosition || ensurePlayerWorldPosition();
    if (!sample) return;
    const priorityX = snapToVoxel(sample.x);
    const priorityZ = snapToVoxel(sample.z);
    const primaryFace = updateLastEarthSurfaceFaceHint(sample, state.lastPriorityFace || lastEarthSurfaceFaceHint);
    const movedEnough = !Number.isFinite(state.lastPriorityX)
        || !Number.isFinite(state.lastPriorityZ)
        || Math.abs(priorityX - Number(state.lastPriorityX || 0)) >= 8
        || Math.abs(priorityZ - Number(state.lastPriorityZ || 0)) >= 8;
    const faceChanged = String(primaryFace || '') !== String(state.lastPriorityFace || '');
    if (!movedEnough && !faceChanged) return;

    const faceOrder = getFaceBuildOrder(primaryFace);
    const faceRank = new Map(faceOrder.map((faceId, index) => [faceId, index]));
    outdoorWorldChunkQueue.sort((a, b) => {
        const rankA = faceRank.get(String(a?.face || '')) ?? 999;
        const rankB = faceRank.get(String(b?.face || '')) ?? 999;
        if (rankA !== rankB) return rankA - rankB;
        const distA = getOutdoorChunkPriorityDistance(a, priorityX, priorityZ);
        const distB = getOutdoorChunkPriorityDistance(b, priorityX, priorityZ);
        if (distA !== distB) return distA - distB;
        return Number(a?.min || 0) - Number(b?.min || 0);
    });
    state.lastPriorityFace = primaryFace;
    state.lastPriorityX = priorityX;
    state.lastPriorityZ = priorityZ;
    state.lastQueueReprioritizeAtMs = now;
}

function enqueueOutdoorWorldChunks(options = {}) {
    const radius = Number.isFinite(Number(options.radius)) ? Math.round(Number(options.radius)) : OUTDOOR_WORLD_RADIUS;
    const priorityX = Number.isFinite(options.priorityX) ? Math.round(options.priorityX) : null;
    const priorityZ = Number.isFinite(options.priorityZ) ? Math.round(options.priorityZ) : null;
    const primaryFace = String(options.priorityFace || getCurrentEarthFaceForStreaming() || 'top');
    const faceOrder = options.includePlanetShell === false
        ? ['top']
        : getFaceBuildOrder(primaryFace);
    const queue = [];

    faceOrder.forEach((face) => {
        const useXAxis = face === 'north' || face === 'south';
        const stripeWidth = getOutdoorChunkStripeWidth(face, options);
        const priorityCoord = useXAxis ? priorityX : priorityZ;
        const stripes = buildCenteredStripes(radius, stripeWidth, priorityCoord);
        const sliceWidth = getOutdoorChunkSliceWidth(face, options, stripeWidth);
        stripes.forEach((stripe) => {
            queue.push({
                face,
                axis: useXAxis ? 'x' : 'z',
                key: `${face}:${useXAxis ? 'x' : 'z'}:${stripe.min}:${stripe.max}`,
                min: stripe.min,
                max: stripe.max,
                next: stripe.min,
                sliceWidth
            });
        });
    });
    return queue;
}

function ensureOutdoorTerrainGroupRoot(normalizedOptions = {}) {
    if (outdoorTerrainGroup) return outdoorTerrainGroup;
    outdoorTerrainGroup = new THREE.Group();
    outdoorTerrainGroup.name = 'outdoor_world';
    outdoorTerrainGroup.userData.groupKind = 'terrain';
    outdoorTerrainGroup.userData.buildRadius = normalizedOptions.radius;
    outdoorTerrainGroup.userData.buildMode = 'sphere_shell_progressive';
    scene.add(outdoorTerrainGroup);
    return outdoorTerrainGroup;
}

function resetOutdoorWorldSceneArtifacts() {
    cancelOutdoorFlowerBuildTask();
    clearMountedOceanVehicles();
    disposeVoxelGroup(outdoorTerrainGroup);
    outdoorTerrainGroup = null;
    outdoorRiverSurfaceGroup = disposeOutdoorWeatherVisualGroup(outdoorRiverSurfaceGroup);
    outdoorSnowCoverGroup = disposeOutdoorWeatherVisualGroup(outdoorSnowCoverGroup);
    if (cherryPetalSystem) {
        scene.remove(cherryPetalSystem);
        cherryPetalSystem.geometry?.dispose?.();
        cherryPetalSystem.material?.dispose?.();
        cherryPetalSystem = null;
    }
    outdoorTreeAnchors = [];
    outdoorBlossomAnchors = [];
    clearOutdoorGeneratedTreeAnchors();
    outdoorSeasonalTrees = [];
    outdoorRiverFish = [];
    outdoorTerrainHeightCache.clear();
    outdoorTopSolidVoxelYByCell.clear();
    registerVoxelBlockKeys(outdoorWorldVoxelKeys, []);
    weatherRuntimeState.lastVisualStreamCenterX = NaN;
    weatherRuntimeState.lastVisualStreamCenterZ = NaN;
    weatherRuntimeState.lastVisualStreamAtMs = 0;
    weatherRuntimeState.lastRiverVisualStreamCenterX = NaN;
    weatherRuntimeState.lastRiverVisualStreamCenterZ = NaN;
    weatherRuntimeState.lastRiverVisualStreamAtMs = 0;
    weatherRuntimeState.snowStormActive = false;
    weatherRuntimeState.lastSnowBurstAtMs = 0;
}

function finalizeOutdoorWorldProgressiveBuild(state) {
    if (!state || outdoorWorldBuildState !== state || !outdoorTerrainGroup) return;
    if (!state.decorationApplied) {
        state.decorationApplied = true;
        // Refactor: the shell pass already contains full terrain strata for all cube faces.
        // Avoid a second "surface columns" pass that duplicated top-face voxels and stalled loading.
        outdoorWorldSurfaceQueued = false;
        window.setTimeout(() => {
            if (outdoorWorldBuildState !== state || !outdoorTerrainGroup) return;
            decorateOutdoorWorldGroup(outdoorTerrainGroup);
            weatherRuntimeState.riverVisualDirty = true;
            weatherRuntimeState.snowVisualDirty = true;
            refreshOutdoorWeatherVisuals(true);
            rebuildCherryPetalSystem();
            outdoorWorldReadyLevel = 'decorated';
            if (outdoorWorldRuntimeCache) {
                outdoorWorldRuntimeCache.decorationApplied = true;
                outdoorWorldRuntimeCache.readyLevel = outdoorWorldReadyLevel;
            }
            state.resolve?.(outdoorTerrainGroup);
            outdoorWorldBuildPromise = null;
            outdoorWorldBuildState = null;
        }, 0);
        return;
    }
    outdoorWorldReadyLevel = 'decorated';
    state.resolve?.(outdoorTerrainGroup);
    outdoorWorldBuildPromise = null;
    outdoorWorldBuildState = null;
    if (state.includeSurfaceColumns) {
        outdoorWorldSurfaceQueued = false;
    }
}

function getOutdoorBuildFrameProfile(state) {
    const isSurfaceOnlyPass = state?.options?.includePlanetShell === false;
    const pendingChunks = Math.max(0, Array.isArray(outdoorWorldChunkQueue) ? outdoorWorldChunkQueue.length : 0);
    const playerMoving = !!movementController?.state?.isMoving
        || !!movementController?.state?.inputState?.forward
        || !!movementController?.state?.inputState?.backward
        || !!movementController?.state?.inputState?.left
        || !!movementController?.state?.inputState?.right;
    if (playerMoving) {
        return {
            frameBudgetMs: 6,
            maxChunksPerFrame: 3,
            defaultSliceWidth: 2
        };
    }
    if (isSurfaceOnlyPass) {
        return {
            frameBudgetMs: 10,
            maxChunksPerFrame: 8,
            defaultSliceWidth: 4
        };
    }
    if (pendingChunks > 480) {
        return {
            frameBudgetMs: 14,
            maxChunksPerFrame: 12,
            defaultSliceWidth: 4
        };
    }
    if (pendingChunks > 240) {
        return {
            frameBudgetMs: 12,
            maxChunksPerFrame: 10,
            defaultSliceWidth: 3
        };
    }
    return {
        frameBudgetMs: 11,
        maxChunksPerFrame: 8,
        defaultSliceWidth: 2
    };
}

function pumpOutdoorWorldBuildFrame() {
    outdoorWorldBuildFramePending = false;
    const state = outdoorWorldBuildState;
    if (!state || !currentRoomId || !scene) return;
    const root = ensureOutdoorTerrainGroupRoot(state.options);

    const frameProfile = getOutdoorBuildFrameProfile(state);
    const FRAME_BUDGET_MS = frameProfile.frameBudgetMs;
    const MAX_CHUNKS_PER_FRAME = frameProfile.maxChunksPerFrame;
    const SUB_CHUNK_WIDTH = frameProfile.defaultSliceWidth;
    const frameStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    let chunksProcessed = 0;
    let lastChunkMs = 0;

    maybeReprioritizeOutdoorChunkQueue(state);

    while (outdoorWorldChunkQueue.length > 0) {
        if (chunksProcessed >= MAX_CHUNKS_PER_FRAME) break;
        // Yield back to the browser event loop if we're over budget.
        const elapsed = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - frameStart;
        if (chunksProcessed > 0 && elapsed >= FRAME_BUDGET_MS) break;

        const nextChunk = outdoorWorldChunkQueue.shift();
        if (!nextChunk) break;

        const cursor = Number.isFinite(nextChunk.next) ? nextChunk.next : nextChunk.min;
        const sliceWidth = Math.max(1, Math.round(Number(nextChunk.sliceWidth || SUB_CHUNK_WIDTH)));
        const sliceMin = cursor;
        const sliceMax = Math.min(cursor + sliceWidth - 1, nextChunk.max);
        const sliceKey = `${nextChunk.key}:${sliceMin}:${sliceMax}`;
        const sliceStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const cachedBlocks = state.chunkBlocks.get(sliceKey);
        const chunkOptions = {
            ...state.options,
            faceFilter: [nextChunk.face]
        };
        if (nextChunk.axis === 'x') {
            chunkOptions.xMin = sliceMin;
            chunkOptions.xMax = sliceMax;
        } else {
            chunkOptions.zMin = sliceMin;
            chunkOptions.zMax = sliceMax;
            if (nextChunk.face === 'east') {
                chunkOptions.xMin = OUTDOOR_WORLD_RADIUS;
                chunkOptions.xMax = OUTDOOR_WORLD_RADIUS;
            } else if (nextChunk.face === 'west') {
                chunkOptions.xMin = -OUTDOOR_WORLD_RADIUS;
                chunkOptions.xMax = -OUTDOOR_WORLD_RADIUS;
            }
        }
        const chunkBlocks = cachedBlocks || buildOutdoorWorldBlocks({
            ...chunkOptions
        });
        lastChunkMs = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - sliceStart;
        state.chunkBlocks.set(sliceKey, chunkBlocks);
        // skipSync=true: we will sync solidWorldVoxelKeys once after the batch
        appendVoxelBlockKeys(outdoorWorldVoxelKeys, chunkBlocks, true);

        const chunkGroup = createVoxelWorldGroup(chunkBlocks, `outdoor_world_chunk_${sliceKey}`, 'terrain');
        chunkGroup.userData.chunkKey = sliceKey;
        root.add(chunkGroup);
        chunksProcessed += 1;

        if (sliceMax < nextChunk.max) {
            nextChunk.next = sliceMax + 1;
            outdoorWorldChunkQueue.unshift(nextChunk);
        }

        if (chunksProcessed > 0 && lastChunkMs >= (FRAME_BUDGET_MS * 0.8)) break;
    }

    // Sync the voxel key set once after the whole batch (O(n) instead of O(n²))
    if (chunksProcessed > 0) {
        syncSolidWorldVoxelKeys();
        outdoorWorldReadyLevel = 'shell_partial';
        if (outdoorWorldRuntimeCache) {
            outdoorWorldRuntimeCache.readyLevel = outdoorWorldReadyLevel;
        }
    }

    if (outdoorWorldChunkQueue.length > 0) {
        outdoorWorldBuildFramePending = true;
        window.requestAnimationFrame(() => pumpOutdoorWorldBuildFrame());
        performanceDebugState.outdoorBuild.queue = outdoorWorldChunkQueue.length;
        performanceDebugState.outdoorBuild.chunksProcessed = chunksProcessed;
        performanceDebugState.outdoorBuild.frameMs = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - frameStart);
        performanceDebugState.outdoorBuild.lastChunkMs = Math.round(lastChunkMs);
        performanceDebugState.outdoorBuild.frameBudgetMs = FRAME_BUDGET_MS;
        performanceDebugState.outdoorBuild.maxChunksPerFrame = MAX_CHUNKS_PER_FRAME;
        performanceDebugState.outdoorBuild.sliceWidth = SUB_CHUNK_WIDTH;
        performanceDebugState.outdoorBuild.phase = state.includeSurfaceColumns ? 'surface' : 'shell';
        performanceDebugState.outdoorBuild.chunkQueueByFace = summarizeOutdoorChunkQueueByFace();
        return;
    }
    outdoorWorldReadyLevel = 'shell_complete';
    performanceDebugState.outdoorBuild.queue = 0;
    performanceDebugState.outdoorBuild.chunksProcessed = chunksProcessed;
    performanceDebugState.outdoorBuild.frameMs = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - frameStart);
    performanceDebugState.outdoorBuild.lastChunkMs = Math.round(lastChunkMs);
    performanceDebugState.outdoorBuild.frameBudgetMs = FRAME_BUDGET_MS;
    performanceDebugState.outdoorBuild.maxChunksPerFrame = MAX_CHUNKS_PER_FRAME;
    performanceDebugState.outdoorBuild.sliceWidth = SUB_CHUNK_WIDTH;
    performanceDebugState.outdoorBuild.phase = state.includeSurfaceColumns ? 'surface' : 'shell';
    performanceDebugState.outdoorBuild.chunkQueueByFace = summarizeOutdoorChunkQueueByFace();
    finalizeOutdoorWorldProgressiveBuild(state);
}

function startOutdoorWorldProgressiveBuild(options = {}) {
    if (!currentRoomId || !scene) return Promise.resolve(null);
    const appendToExisting = options.appendToExisting === true && !!outdoorTerrainGroup;
    const deferSurfaceColumns = options.deferSurfaceColumns === true;
    const normalizedOptions = {
        radius: typeof options.radius !== 'undefined' ? options.radius : OUTDOOR_WORLD_RADIUS,
        includePlanetShell: typeof options.includePlanetShell !== 'undefined' ? options.includePlanetShell : true,
        includeSurfaceColumns: typeof options.includeSurfaceColumns !== 'undefined' ? options.includeSurfaceColumns : true,
        priorityX: typeof options.priorityX !== 'undefined' ? options.priorityX : null,
        priorityZ: typeof options.priorityZ !== 'undefined' ? options.priorityZ : null,
        priorityFace: typeof options.priorityFace !== 'undefined' ? options.priorityFace : null
    };
    const cacheKey = getOutdoorWorldCacheKey(normalizedOptions);
    const hasValidCache = isOutdoorWorldCacheValid(normalizedOptions) && outdoorWorldRuntimeCache?.chunkBlocks instanceof Map;

    if (outdoorTerrainGroup && hasValidCache && outdoorWorldReadyLevel === 'decorated') {
        outdoorTerrainGroup.userData.buildRadius = normalizedOptions.radius;
        outdoorTerrainGroup.userData.buildMode = 'sphere_shell_progressive';
        return Promise.resolve(outdoorTerrainGroup);
    }
    if (outdoorWorldBuildPromise && outdoorWorldBuildState?.cacheKey === cacheKey) {
        return outdoorWorldBuildPromise;
    }

    if (!appendToExisting) {
        resetOutdoorWorldSceneArtifacts();
    }
    const chunkBlocks = hasValidCache ? outdoorWorldRuntimeCache.chunkBlocks : new Map();
    if (!hasValidCache) {
        outdoorWorldRuntimeCache = {
            chunkBlocks,
            decorationApplied: false,
            readyLevel: 'none'
        };
        outdoorWorldRuntimeCacheKey = cacheKey;
    }
    ensureOutdoorTerrainGroupRoot(normalizedOptions);
    ensureOutdoorTreePropsNow(outdoorTerrainGroup);
    if (!appendToExisting && normalizedOptions.includePlanetShell) {
        const perimeterKey = '__fast_perimeter__';
        if (!chunkBlocks.has(perimeterKey)) {
            const perimeterBlocks = buildImmediatePerimeterFenceBlocks(normalizedOptions.radius);
            chunkBlocks.set(perimeterKey, perimeterBlocks);
            appendVoxelBlockKeys(outdoorWorldVoxelKeys, perimeterBlocks, true);
            const perimeterGroup = createVoxelWorldGroup(perimeterBlocks, 'outdoor_world_fast_perimeter', 'terrain');
            perimeterGroup.userData.chunkKey = perimeterKey;
            outdoorTerrainGroup.add(perimeterGroup);
            syncSolidWorldVoxelKeys();
        }
    }
    outdoorWorldChunkQueue = enqueueOutdoorWorldChunks({
        ...normalizedOptions,
        priorityX: normalizedOptions.priorityX,
        priorityZ: normalizedOptions.priorityZ,
        priorityFace: normalizedOptions.priorityFace
    });
    if (!appendToExisting) {
        outdoorWorldReadyLevel = 'none';
    }

    outdoorWorldBuildPromise = new Promise((resolve, reject) => {
        outdoorWorldBuildState = {
            cacheKey,
            options: normalizedOptions,
            chunkBlocks,
            decorationApplied: false,
            includeSurfaceColumns: normalizedOptions.includeSurfaceColumns,
            deferSurfaceColumns,
            lastPriorityFace: normalizedOptions.priorityFace || null,
            lastPriorityX: Number.isFinite(normalizedOptions.priorityX) ? Number(normalizedOptions.priorityX) : null,
            lastPriorityZ: Number.isFinite(normalizedOptions.priorityZ) ? Number(normalizedOptions.priorityZ) : null,
            lastQueueReprioritizeAtMs: 0,
            resolve,
            reject
        };
    });

    if (!outdoorWorldBuildFramePending) {
        outdoorWorldBuildFramePending = true;
        window.requestAnimationFrame(() => pumpOutdoorWorldBuildFrame());
    }
    return outdoorWorldBuildPromise;
}

async function generateOutdoorWorld(options = {}) {
    return startOutdoorWorldProgressiveBuild(options);
}

async function generateRoomShell() {
    if (!currentRoomId) return;
    const blocks = buildRoomShellBlocks();
    registerVoxelBlockKeys(roomShellVoxelKeys, blocks);
    disposeVoxelGroup(roomShellGroup);
    roomShellGroup = createVoxelWorldGroup(blocks, 'room_shell', 'room_shell');
    registerRoomShellColliders(roomShellGroup);
    scene.add(roomShellGroup);
}

async function ensureSkySystemReady() {
    if (!scene) return null;
    if (skySystem) return skySystem;
    if (skySystemBuildPromise) return skySystemBuildPromise;
    skySystemBuildPromise = (async () => {
        skySystem = createFastSkySystem();
        scene.add(skySystem.root);
        applyPerformanceTier(currentPerformanceTier, { force: true });
        return skySystem;
    })().finally(() => {
        skySystemBuildPromise = null;
    });
    return skySystemBuildPromise;
}

async function ensureTravelSceneProps() {
    if (!scene) return;
    if (earthLaunchPad && earthRocketShuttle && moonRocketShuttle) return;
    if (travelPropsBuildPromise) return travelPropsBuildPromise;
    travelPropsBuildPromise = (async () => {
        const rocketAnchor = getEarthLaunchPadAnchor();
        const earthLaunchPadBaseY = getEarthLaunchPadBaseY();
        if (!earthLaunchPad) {
            earthLaunchPad = createRocketPadHero();
            scene.add(earthLaunchPad);
        }
        earthLaunchPad.position.set(rocketAnchor.x, earthLaunchPadBaseY, rocketAnchor.z);
        alignEarthLaunchStructure(earthLaunchPad, rocketAnchor.x, rocketAnchor.z, Math.PI * 0.5);
        registerEarthLaunchPadColliders(earthLaunchPad.position);

        if (!earthRocketShuttle) {
            earthRocketShuttle = createRocketShuttleMesh('moon');
            scene.add(earthRocketShuttle);
        }
        earthRocketShuttle.position.set(rocketAnchor.x, earthLaunchPadBaseY + EARTH_ROCKET_PAD_OFFSET_Y, rocketAnchor.z);
        alignEarthLaunchStructure(earthRocketShuttle, rocketAnchor.x, rocketAnchor.z, Math.PI * 0.5);

        if (!moonRocketShuttle) {
            moonRocketShuttle = createRocketShuttleMesh('earth');
            scene.add(moonRocketShuttle);
        }
        moonRocketShuttle.position.copy(getMoonSpawnPosition(currentSpaceBodyId)).add(new THREE.Vector3(0, -PLANET_EYE_HEIGHT - 1.8, 0));
    })().finally(() => {
        travelPropsBuildPromise = null;
    });
    return travelPropsBuildPromise;
}

function shouldStreamOutdoorWorldNow(position = null) {
    const sample = position || playerWorldPosition || ensurePlayerWorldPosition();
    if (!sample) return false;
    if (activeCelestialBody === 'space') return true;
    return Math.abs(Number(sample.z || 0)) >= ((ROOM_DEPTH * 0.5) - 8)
        || Math.abs(Number(sample.x || 0)) >= ((ROOM_WIDTH * 0.5) - 8);
}

function queueProgressiveSceneStreaming() {
    if (!currentRoomId) return;
    if (!progressiveSceneSkyQueued) {
        progressiveSceneSkyQueued = true;
        window.setTimeout(() => {
            const tasks = [ensureSkySystemReady().catch(() => { })];
            if (activeCelestialBody !== 'space') {
                tasks.push(generateOutdoorWorld({
                    radius: OUTDOOR_WORLD_RADIUS,
                    includePlanetShell: true,
                    includeSurfaceColumns: false,
                    deferSurfaceColumns: true
                }).catch(() => { }));
            }
            Promise.all(tasks).finally(() => {
                progressiveSceneSkyQueued = false;
            });
        }, 0);
    }
}

async function ensureLocalWorldMeshes() {
    if (!currentRoomId) return;
    if (localWorldBuildPromise) return localWorldBuildPromise;
    localWorldBuildPromise = (async () => {
        if (!roomShellGroup) {
            await generateRoomShell();
        }
        await ensureSkySystemReady().catch(() => { });
        await ensureTravelSceneProps().catch(() => { });
        if (!outdoorTerrainGroup) {
            // Detect if the player spawns outside the room (on the planet surface)
            // and pass the spawn X as a priority so that face's terrain builds first
            const savedSpawn = lastSavedSpawnState;
            const spawnX = savedSpawn && Number.isFinite(Number(savedSpawn.x)) ? Number(savedSpawn.x) : null;
            const spawnZ = savedSpawn && Number.isFinite(Number(savedSpawn.z)) ? Number(savedSpawn.z) : null;
            const spawnInsideRoom = spawnX !== null
                ? Math.abs(spawnX) <= (ROOM_WIDTH * 0.5)
                : true;
            const spawnPriorityFace = (!spawnInsideRoom && spawnX !== null && spawnZ !== null)
                ? cubeFaceFromPosition(new THREE.Vector3(spawnX, getEarthTopFaceY(spawnX, spawnZ) ?? 0, spawnZ), lastEarthSurfaceFaceHint)
                : null;
            generateOutdoorWorld({
                radius: OUTDOOR_WORLD_STREAM_RADIUS,
                includePlanetShell: true,
                includeSurfaceColumns: false,
                deferSurfaceColumns: true,
                priorityX: spawnInsideRoom ? null : spawnX,
                priorityZ: spawnInsideRoom ? null : spawnZ,
                priorityFace: spawnInsideRoom ? null : spawnPriorityFace
            }).catch(() => { });
        }
    })().finally(() => {
        localWorldBuildPromise = null;
    });
    return localWorldBuildPromise;
}

async function ensureRoomShellMesh() {
    if (!currentRoomId) return;
    if (roomShellGroup) return;
    if (roomShellBuildPromise) return roomShellBuildPromise;
    roomShellBuildPromise = (async () => {
        await generateRoomShell();
    })().finally(() => {
        roomShellBuildPromise = null;
    });
    return roomShellBuildPromise;
}

async function clearOutdoorTerrain() {
    if (!currentRoomId) return;
    const itemsSnap = await getDocs(collection(db, "mineblox_rooms", currentRoomId, "items"));
    const terrainDocs = itemsSnap.docs.filter((d) => {
        const data = d.data() || {};
        return (data?.terrain && data?.structure !== 'room_shell') || String(d.id || '').startsWith('terrain_');
    });
    if (!terrainDocs.length) return;

    const chunkSize = 350;
    for (let i = 0; i < terrainDocs.length; i += chunkSize) {
        const batch = writeBatch(db);
        terrainDocs.slice(i, i + chunkSize).forEach((d) => {
            batch.delete(d.ref);
        });
        await batch.commit();
    }
}

async function clearRoomShell() {
    if (!currentRoomId) return;
    const itemsSnap = await getDocs(collection(db, "mineblox_rooms", currentRoomId, "items"));
    const shellDocs = itemsSnap.docs.filter((d) => {
        const data = d.data() || {};
        return data?.structure === 'room_shell' || String(d.id || '').startsWith('room_');
    });
    if (!shellDocs.length) return;

    const chunkSize = 350;
    for (let i = 0; i < shellDocs.length; i += chunkSize) {
        const batch = writeBatch(db);
        shellDocs.slice(i, i + chunkSize).forEach((d) => {
            batch.delete(d.ref);
        });
        await batch.commit();
    }
}

async function ensureOutdoorTerrain(roomData = null) {
    if (!currentRoomId || outdoorTerrainBuildPromise) return outdoorTerrainBuildPromise;
    outdoorTerrainBuildPromise = (async () => {
        const roomRef = doc(db, "mineblox_rooms", currentRoomId);
        const data = roomData || (await getDoc(roomRef)).data() || {};
        const needsTerrain = data.terrainVersion !== OUTDOOR_WORLD_VERSION || data.worldStyle !== OUTDOOR_WORLD_STYLE;
        const needsShell = data.classroomShellVersion !== ROOM_SHELL_VERSION;
        if (isTeacher && needsTerrain) {
            terrainRegenerationInProgress = true;
            await clearOutdoorTerrain().catch(() => { });
            disposeVoxelGroup(outdoorTerrainGroup);
            outdoorTerrainGroup = null;
            invalidateOutdoorWorldRuntimeCache('teacher_terrain_regeneration');
            outdoorRiverSurfaceGroup = disposeOutdoorWeatherVisualGroup(outdoorRiverSurfaceGroup);
            outdoorSnowCoverGroup = disposeOutdoorWeatherVisualGroup(outdoorSnowCoverGroup);
            if (cherryPetalSystem) {
                scene.remove(cherryPetalSystem);
                cherryPetalSystem.geometry?.dispose?.();
                cherryPetalSystem.material?.dispose?.();
                cherryPetalSystem = null;
            }
            outdoorWorldVoxelKeys.clear();
            syncSolidWorldVoxelKeys();
            await updateDoc(roomRef, {
                terrainVersion: OUTDOOR_WORLD_VERSION,
                terrainBuiltAt: serverTimestamp(),
                terrainRadius: OUTDOOR_WORLD_RADIUS,
                terrainInnerRadius: OUTDOOR_WORLD_INNER_RADIUS,
                worldStyle: OUTDOOR_WORLD_STYLE,
                skyCycleVersion: SKY_CYCLE_VERSION
            }).catch(() => { });
        }
        if (isTeacher && needsShell) {
            terrainRegenerationInProgress = true;
            await clearRoomShell().catch(() => { });
            disposeVoxelGroup(roomShellGroup);
            roomShellGroup = null;
            roomShellVoxelKeys.clear();
            syncSolidWorldVoxelKeys();
            await updateDoc(roomRef, {
                classroomShellVersion: ROOM_SHELL_VERSION,
                classroomShellBuiltAt: serverTimestamp()
            }).catch(() => { });
        }
        await ensureLocalWorldMeshes();
    })().finally(() => {
        terrainRegenerationInProgress = false;
        outdoorTerrainBuildPromise = null;
    });
    return outdoorTerrainBuildPromise;
}

// Reward & Quiz Logic
let activeQuizzes = [];

async function showConfigQuizzes(editId = null, existingData = null) {
    const modal = document.createElement('div');
    modal.className = 'mineblox-modal';

    let catOptions = `<option value="">Selecciona Categoría</option>`;
    for (let cat in QUIZ_CATEGORIES) {
        catOptions += `<option value="${cat}" ${existingData?.category === cat ? 'selected' : ''}>${cat}</option>`;
    }

    modal.innerHTML = `
        <div class="mineblox-modal-content" style="color:#333">
            <h3 style="color:#1e3a8a">${editId ? 'Editar Quiz' : 'Programar Quizzes'}</h3>
            <select id="qCategory" style="width:100%; margin-bottom:10px">${catOptions}</select>
            <select id="qSubtheme" style="width:100%; margin-bottom:10px"><option>Subtema</option></select>
            <input type="text" id="qSubject" placeholder="Pregunta (ej: ¿2+2=4?)" style="color:#000" value="${existingData?.text || ''}">
            <input type="text" id="qOptions" placeholder="Opciones (ej: Si, No)" style="color:#000" value="${(existingData?.options || []).join(', ')}">
            <input type="number" id="qCorrect" placeholder="Indice Correcto (0 para la primera)" style="color:#000" value="${existingData?.correct || 0}">
            <button class="lecturas-game-pixel-btn is-primary" id="qSaveBtn">${editId ? 'Actualizar Quiz' : 'Guardar Quiz'}</button>
            <br>
            <div id="quizListArea" style="margin-top:15px; max-height:150px; overflow-y:auto; border-top:1px solid #ddd; padding-top:10px">
                <!-- Quizzes will be listed here for editing -->
            </div>
            <button class="lecturas-game-pixel-btn" style="background:#666; margin-top:10px" data-mineblox-action="close-parent-modal">Cerrar</button>
        </div>
    `;
    document.body.appendChild(modal);

    const catSelect = document.getElementById('qCategory');
    const subSelect = document.getElementById('qSubtheme');
    catSelect.onchange = () => {
        const subs = QUIZ_CATEGORIES[catSelect.value] || [];
        subSelect.innerHTML = subs.map(s => `<option value="${s}" ${existingData?.subtheme === s ? 'selected' : ''}>${s}</option>`).join('');
    };
    if (existingData) catSelect.onchange();

    // Render list for edit selective
    if (!editId) {
        const snap = await getDocs(collection(db, "mineblox_rooms", currentRoomId, "quizzes"));
        const quizListArea = document.getElementById('quizListArea');
        snap.forEach(d => {
            const data = d.data();
            const div = document.createElement('div');
            div.style.cssText = 'font-size:11px; padding:5px; border-bottom:1px solid #eee; display:flex; justify-content:space-between';
            div.innerHTML = `<span>${escapeHtml(data.text || "")}</span> <a href="#" style="color:#2563eb" data-mineblox-action="edit-quiz" data-quiz-id="${escapeHtml(d.id)}">Editar</a>`;
            quizListArea.appendChild(div);
        });
    }

    window._minebloxEditQuizUI = async (id) => {
        const d = await getDoc(doc(db, "mineblox_rooms", currentRoomId, "quizzes", id));
        modal.remove();
        showConfigQuizzes(id, d.data());
    };

    document.getElementById('qSaveBtn').onclick = async () => {
        const q = {
            category: catSelect.value,
            subtheme: subSelect.value,
            text: document.getElementById('qSubject').value,
            options: document.getElementById('qOptions').value.split(',').map(o => o.trim()),
            correct: parseInt(document.getElementById('qCorrect').value) || 0,
            id: editId || Date.now()
        };
        if (editId) {
            await updateDoc(doc(db, "mineblox_rooms", currentRoomId, "quizzes", editId), q);
        } else {
            await addDoc(collection(db, "mineblox_rooms", currentRoomId, "quizzes"), q);
        }
        alert("Quiz actualizado correctamente");
        modal.remove();
    };
}

async function loadRoomQuizzes() {
    onSnapshot(collection(db, "mineblox_rooms", currentRoomId, "quizzes"), (snap) => {
        activeQuizzes = snap.docs.map(doc => doc.data());
    });
}

function getYouTubeId(url) {
    if (!url) return "";
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : url.replace('v=', '').split('&')[0].trim();
}

function wrapCanvasText(ctx, text, maxWidth) {
    const paragraphs = String(text ?? "").split('\n');
    const lines = [];
    paragraphs.forEach((paragraph) => {
        if (!paragraph.length) {
            lines.push('');
            return;
        }
        const tokens = paragraph.match(/(\s+|[^\s]+)/g) || [paragraph];
        let current = "";
        tokens.forEach((token) => {
            const next = current + token;
            if (ctx.measureText(next).width <= maxWidth) {
                current = next;
                return;
            }
            if (current) lines.push(current);
            current = token.trimStart();
        });
        if (current.length || !tokens.length) lines.push(current);
    });
    return lines;
}

function getWhiteboardSurfaceMesh(mesh) {
    return mesh?.children?.find?.((child) => child.geometry?.parameters?.width > 2) || null;
}

async function playYoutubeOnWhiteboard(youtubeId, mesh) {
    const cleanId = getYouTubeId(youtubeId);
    if (!cleanId) return;

    await ensureCSS3DRenderer();
    if (!CSS3DObject || !cssScene) {
        // Fallback to modal if CSS3D not ready (shouldn't happen)
        const modal = document.createElement('div');
        modal.className = 'mineblox-modal';
        modal.style.zIndex = "2000";
        modal.innerHTML = `
            <div class="mineblox-modal-content" style="width:854px; max-width:95vw; background:#000; padding:10px; border:4px solid #333;">
               <iframe width="100%" height="480" src="https://www.youtube.com/embed/${cleanId}?autoplay=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
               <button class="lecturas-game-pixel-btn" style="background:#ef4444; width:100%; margin-top:10px; font-family:inherit" data-mineblox-action="close-parent-modal">Cerrar Video</button>
            </div>
        `;
        document.body.appendChild(modal);
        document.exitPointerLock();
        return;
    }

    const w = 6, h = 3.5;
    const div = document.createElement('div');
    div.style.width = '1024px';
    div.style.height = '512px';
    div.style.backgroundColor = '#000';
    div.innerHTML = `<iframe width="1024" height="512" src="https://www.youtube.com/embed/${cleanId}?autoplay=1&rel=0&enablejsapi=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen style="pointer-events: ${isTeacher ? 'auto' : 'none'};"></iframe>`;

    // Ensure the DIV itself allows clicks
    div.style.pointerEvents = 'auto';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '❌ CERRAR';
    closeBtn.style.cssText = 'position:absolute; top:10px; right:10px; background:red; color:white; border:none; padding:10px; cursor:pointer; font-weight:bold; border-radius:4px; font-family:Comic Sans MS;';
    div.appendChild(closeBtn);

    const cssObject = new CSS3DObject(div);
    const docId = mesh.userData.docId;

    // PREVENT DUPLICATE AUDIO / STACKING
    if (activeVideos.has(docId)) {
        removeActiveVideoDisplay(docId);
    }

    const boardMesh = getWhiteboardSurfaceMesh(mesh);
    if (boardMesh) boardMesh.visible = false;

    // Position it correctly: group position + Y offset (center of the board) + forward offset
    const forward = new THREE.Vector3(0, 0, 0.3);
    forward.applyQuaternion(mesh.quaternion);

    cssObject.position.copy(mesh.position).add(forward);
    cssObject.position.y += h / 2; // ADD Y OFFSET (Surface center)

    cssObject.rotation.copy(mesh.rotation);
    cssObject.scale.set(6 / 1024, 3.5 / 512, 1);

    cssScene.add(cssObject);
    activeVideos.set(docId, cssObject);
    setCssRendererVisibility(true);

    closeBtn.onclick = () => {
        removeActiveVideoDisplay(docId, boardMesh);
    };

    document.exitPointerLock();
}

async function showWhiteboardConfig() {
    const itemsSnap = await getDocs(collection(db, "mineblox_rooms", currentRoomId, "items"));
    const whiteboards = itemsSnap.docs.filter((d) => d.data()?.itemId === 'whiteboard');
    if (!whiteboards.length) {
        alert('No hay pizarrones en la sala');
        return;
    }

    const whiteboardDataById = new Map();
    whiteboards.forEach((d, idx) => {
        whiteboardDataById.set(d.id, {
            text: d.data()?.text || '',
            youtubeId: d.data()?.youtubeId || '',
            label: getWhiteboardLabel(d.data(), idx + 1)
        });
    });

    let targetId = selectedWhiteboardDocId;
    try {
        const storedTarget = localStorage.getItem(`minebloxSelectedWhiteboard_${currentRoomId}`) || '';
        if (storedTarget && whiteboardDataById.has(storedTarget)) {
            targetId = storedTarget;
        }
    } catch (_) { }
    if (!targetId || !whiteboardDataById.has(targetId)) {
        const intersects = getCrosshairIntersections();
        for (const hit of intersects) {
            let p = hit.object;
            while (p && !p.userData?.docId) p = p.parent;
            if (p && whiteboardDataById.has(p.userData.docId)) {
                targetId = p.userData.docId;
                break;
            }
        }
    }
    if (!targetId || !whiteboardDataById.has(targetId)) {
        targetId = whiteboards[0].id;
    }

    selectedWhiteboardDocId = targetId;

    const modal = document.createElement('div');
    modal.className = 'mineblox-modal';
    modal.innerHTML = `
        <div class="mineblox-modal-content" style="color:#333; width:440px">
            <h3 style="margin-top:0">Configurar Pizarrón</h3>
            <p style="font-size:12px; color:#666">Selecciona un pizarrón y luego edita su contenido</p>

            <label style="display:block; margin-bottom:5px; font-weight:bold">Pizarrón:</label>
            <select id="wbTargetSelect" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:4px; color:#000"></select>

            <label style="display:block; margin-bottom:5px; font-weight:bold">Texto:</label>
            <textarea id="wbText" placeholder="Escribe algo aquí..." style="width:100%; height:120px; color:#000; font-family:'Comic Sans MS'; padding:10px; border:1px solid #ccc; border-radius:4px; white-space:pre-wrap; resize:vertical"></textarea>

            <label style="display:block; margin:10px 0 5px; font-weight:bold">Video de YouTube (ID o Link):</label>
            <input type="text" id="wbYoutube" placeholder="ej: FyXu6v783Fc" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:4px; color:#000">

            <div style="margin-top:20px; display:flex; flex-direction:column; gap:10px">
                <button class="lecturas-game-pixel-btn is-primary" id="wbSaveBtn">💾 Guardar Cambios</button>
                ${isTeacher ? `
                <div style="display:flex; gap:5px">
                    <button class="lecturas-game-pixel-btn" id="wbPlayBtn" style="background:#ef4444; flex:1">🎬 PLAY GLOBAL</button>
                    <button class="lecturas-game-pixel-btn" id="wbPauseBtn" style="background:#fbbf24; flex:1">⏸️ PAUSA GLOBAL</button>
                </div>
                ` : ''}
                <button class="lecturas-game-pixel-btn" style="background:#666" id="wbCloseBtn">Cerrar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const targetSelect = modal.querySelector('#wbTargetSelect');
    const textInput = modal.querySelector('#wbText');
    const youtubeInput = modal.querySelector('#wbYoutube');
    const saveBtn = modal.querySelector('#wbSaveBtn');
    const closeBtn = modal.querySelector('#wbCloseBtn');
    const playBtn = modal.querySelector('#wbPlayBtn');
    const pauseBtn = modal.querySelector('#wbPauseBtn');

    targetSelect.innerHTML = whiteboards.map((d, idx) => {
        const data = whiteboardDataById.get(d.id) || {};
        return `<option value="${d.id}">${data.label || getWhiteboardLabel(d.data(), idx + 1)}</option>`;
    }).join('');

    const loadSelectedWhiteboard = (docId) => {
        const data = whiteboardDataById.get(docId) || { text: '', youtubeId: '' };
        selectedWhiteboardDocId = docId;
        try {
            localStorage.setItem(`minebloxSelectedWhiteboard_${currentRoomId}`, docId);
        } catch (_) { }
        textInput.value = data.text || '';
        youtubeInput.value = data.youtubeId || '';
    };

    targetSelect.value = targetId;
    loadSelectedWhiteboard(targetId);
    targetSelect.addEventListener('change', () => loadSelectedWhiteboard(targetSelect.value));

    const persistWhiteboardLocally = (docId, text, yt) => {
        const mesh = placedItems.get(docId);
        if (!mesh) return;
        const boardMesh = getWhiteboardSurfaceMesh(mesh);
        mesh.userData.youtubeId = yt;
        if (yt) {
            updateWhiteboardContent(mesh, text, yt, { immediate: true });
        } else {
            removeActiveVideoDisplay(docId, boardMesh);
            updateWhiteboardContent(mesh, text, '', { immediate: true });
        }
    };

    saveBtn.onclick = async () => {
        const docId = targetSelect.value;
        const text = textInput.value;
        const yt = youtubeInput.value.trim();
        await updateDoc(doc(db, "mineblox_rooms", currentRoomId, "items", docId), {
            text,
            youtubeId: yt,
            playRequested: false,
            playbackState: yt ? 'paused' : 'idle'
        });
        persistWhiteboardLocally(docId, text, yt);
        whiteboardDataById.set(docId, { text, youtubeId: yt, label: whiteboardDataById.get(docId)?.label || 'Pizarrón' });
        alert('Pizarrón actualizado');
        modal.remove();
    };

    if (isTeacher && playBtn && pauseBtn) {
        playBtn.onclick = async () => {
            const docId = targetSelect.value;
            const yt = youtubeInput.value.trim();
            if (!yt) {
                alert('Primero escribe un video o ID de YouTube');
                return;
            }
            await updateDoc(doc(db, "mineblox_rooms", currentRoomId, "items", docId), {
                youtubeId: yt,
                playRequested: true,
                playbackState: 'playing'
            });
            const mesh = placedItems.get(docId);
            if (mesh) {
                playYoutubeOnWhiteboard(yt, mesh);
            }
            showTooltip('Video transmitido');
            modal.remove();
        };
        pauseBtn.onclick = async () => {
            const docId = targetSelect.value;
            await updateDoc(doc(db, "mineblox_rooms", currentRoomId, "items", docId), {
                playbackState: 'paused'
            });
            if (activeVideos.has(docId)) {
                const cssObj = activeVideos.get(docId);
                const iframe = cssObj.element.querySelector('iframe');
                if (iframe && iframe.contentWindow) {
                    iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
                }
            }
            showTooltip('Video pausado global');
            modal.remove();
        };
    }

    closeBtn.onclick = () => modal.remove();
}

async function showRewardPanel() {
    const modal = document.createElement('div');
    modal.className = 'mineblox-modal';

    // Get active students
    const snap = await getDocs(collection(db, "mineblox_rooms", currentRoomId, "players"));
    let studentsHtml = '';
    snap.forEach(d => {
        if (d.id !== currentUserId) {
            studentsHtml += `<option value="${d.id}">${d.data().displayName}</option>`;
        }
    });

    modal.innerHTML = `
        <div class="mineblox-modal-content">
            <h3>Enviar Desafío de Premio</h3>
            <label>Alumno:</label>
            <select id="rwStudent" style="width:100%; padding:10px; margin-bottom:10px">${studentsHtml}</select>
            <label>Item a Regalar:</label>
            <select id="rwItem" style="width:100%; padding:10px; margin-bottom:10px">
                ${ITEMS_LIBRARY.map(i => `<option value="${i.id}">${i.icon} ${i.name}</option>`).join('')}
            </select>
            <label>Quiz Asociado:</label>
            <select id="rwQuiz" style="width:100%; padding:10px; margin-bottom:10px">
                ${activeQuizzes.map((q, idx) => `<option value="${idx}">${q.text}</option>`).join('')}
            </select>
            <button class="lecturas-game-pixel-btn is-primary" id="rwSendBtn">Enviar Desafío</button>
            <button class="lecturas-game-pixel-btn" style="background:#666; margin-top:10px" data-mineblox-action="close-parent-modal">Cancelar</button>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('rwSendBtn').onclick = async () => {
        const sid = document.getElementById('rwStudent').value;
        const iid = document.getElementById('rwItem').value;
        const qIdx = document.getElementById('rwQuiz').value;
        const quiz = activeQuizzes[qIdx];

        if (!sid || !quiz) return alert("Selecciona alumno y quiz");

        await addDoc(collection(db, "mineblox_rooms", currentRoomId, "events"), {
            type: 'CHALLENGE',
            to: sid,
            itemId: iid,
            quiz: quiz,
            timestamp: serverTimestamp()
        });
        alert("Desafío enviado!");
        modal.remove();
    };
}

function setupStudentListeners() {
    onSnapshot(collection(db, "mineblox_rooms", currentRoomId, "events"), (snap) => {
        snap.docChanges().forEach(change => {
            if (change.type === "added") {
                const data = change.doc.data();
                if (data.to === currentUserId && data.type === 'CHALLENGE') {
                    showChallengeModal(data);
                }
            }
        });
    });
}

async function showChallengeModal(data) {
    // Check if already answered
    const histSnap = await getDocs(query(collection(db, "mineblox_rooms", currentRoomId, "student_progress", currentUserId, "answers"), where("quizId", "==", data.quiz.id)));
    if (!histSnap.empty) return; // Skip if already answered

    const modal = document.createElement('div');
    modal.className = 'mineblox-modal';
    const item = ITEMS_LIBRARY.find(i => i.id === data.itemId);

    modal.innerHTML = `
        <div class="mineblox-modal-content">
            <h3 style="color:#fbbf24">🏆 ¡Desafío de Premio!</h3>
            <p style="color:#333">El maestro te enviará un <b>${item.icon} ${item.name}</b> si respondes correctamente:</p>
            <p style="font-size:18px; font-weight:bold; color:#111">${data.quiz.text}</p>
            <div class="mineblox-quiz-options">
                ${data.quiz.options.map((opt, idx) => `
                    <button class="mineblox-quiz-opt" data-mineblox-action="answer-quiz" data-option-index="${idx}" data-correct-index="${data.quiz.correct}" data-item-id="${escapeHtml(data.itemId)}" data-quiz-id="${escapeHtml(data.quiz.id)}" data-quiz-text="${escapeHtml(data.quiz.text)}">${escapeHtml(opt)}</button>
                `).join('')}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    window._minebloxAnsQuiz = async (clicked, correct, iid, qid, qtext) => {
        const isCorrect = clicked === correct;
        if (isCorrect) {
            alert("¡Correcto! Item añadido a tu inventario.");
            const invRef = collection(db, "lecturasGame", currentUserId, "mineblox_inventory");
            addDoc(invRef, { itemId: iid, grantedBy: 'challenge', grantedAt: serverTimestamp() });

            // INCREASE ROOM RATING
            updateRoomRating(10); // +10 points per correct answer
        } else {
            alert("Incorrecto. ¡Sigue practicando!");
        }

        // Save result
        await addDoc(collection(db, "mineblox_rooms", currentRoomId, "student_progress", currentUserId, "answers"), {
            quizId: qid, qtext: qtext, correct: isCorrect, timestamp: serverTimestamp()
        });

        modal.remove();
    };
}

window._minebloxShowHistory = async () => {
    const snap = await getDocs(collection(db, "mineblox_rooms", currentRoomId, "student_progress", currentUserId, "answers"));
    const history = snap.docs.map(d => d.data());
    const modal = document.createElement('div');
    modal.className = 'mineblox-modal';
    modal.innerHTML = `
        <div class="mineblox-modal-content" style="color:#333">
            <h3>📜 Historial de Quizzes</h3>
            <div style="max-height:300px; overflow-y:auto; text-align:left">
                ${history.map(h => `
                    <div style="padding:10px; border-bottom:1px solid #ddd">
                        <div><b>Q:</b> ${h.qtext}</div>
                        <div style="color:${h.correct ? '#059669' : '#dc2626'}">${h.correct ? '✅ Acertada' : '❌ Fallida'}</div>
                    </div>
                `).join('') || '<p>No has respondido quizzes aún.</p>'}
            </div>
            <button class="lecturas-game-pixel-btn" data-mineblox-action="close-parent-modal" style="margin-top:10px">Cerrar</button>
        </div>
    `;
    document.body.appendChild(modal);
};

async function loadUserInventory() {
    const invRef = collection(db, "lecturasGame", currentUserId, "mineblox_inventory");
    onSnapshot(invRef, (snap) => {
        userInventory = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
        groupedInventory = groupInventoryItems(userInventory);
        restoreHotbarQuickSlots();
        renderInventory();
        renderLibrary(); // Re-render library to update selection colors
    });
}

function renderInventory() {
    const slots = document.getElementById('minebloxInvBarSlots');
    if (!slots) return;
    syncHotbarQuickSlots();
    const effectiveGroups = getHotbarGroups();

    const slotMarkup = effectiveGroups.map((group, idx) => {
        if (!group?.itemId) {
            return `
                <button type="button" class="mineblox-inv-slot mineblox-inv-slot--empty ${hotbarActiveSlotIndex === idx ? 'active' : ''}" data-mineblox-action="select-slot" data-slot-index="${idx}" aria-label="Slot vacío">
                    <span class="mineblox-item-visual mineblox-item-visual--slot mineblox-item-visual--empty" aria-hidden="true"></span>
                </button>
            `;
        }
        const slotLabel = getInventoryItemLabel(group.itemId);
        const libItem = ITEMS_LIBRARY.find(l => l.id === group.itemId) || { id: group.itemId };
        const slotItem = {
            ...libItem,
            id: group.itemId,
            name: libItem.name || slotLabel,
            icon: libItem.icon || getInventoryItemFallbackGlyph(group.itemId)
        };
        const isActive = hotbarActiveSlotIndex === idx;
        const countLabel = isRecessVirtualInventoryActive() ? '∞' : (group.count > 0 ? group.count : '');
        return `
            <button type="button" class="mineblox-inv-slot ${isActive ? 'active' : ''}" data-mineblox-action="select-slot" data-slot-index="${idx}" aria-label="${escapeHtml(slotLabel)}">
                ${getItemVisualMarkup(slotItem, { sizeClass: 'mineblox-item-visual--slot' })}
                ${countLabel ? `<span class="mineblox-inv-slot-count">${countLabel}</span>` : ''}
            </button>
        `;
    }).join('');

    const inventoryBtn = `
        <button type="button" class="mineblox-inv-slot mineblox-inv-slot--utility" data-mineblox-action="open-inventory" aria-label="Abrir inventario completo">
            <span class="mineblox-item-visual mineblox-item-visual--slot mineblox-item-visual--fallback">
                <span class="mineblox-item-fallback">…</span>
            </span>
            ${getHiddenInventoryCount() > 0 ? `<span class="mineblox-inv-slot-count">+${getHiddenInventoryCount()}</span>` : ''}
        </button>
    `;

    slots.innerHTML = (slotMarkup + inventoryBtn) || '<div class="mineblox-inv-empty">Sin items</div>';
}

window._minebloxSelectSlot = (idx) => {
    setHotbarActiveSlot(idx);
    renderInventory();
    renderLibrary();
};

window._minebloxOpenInventoryFromHotbar = () => {
    document.getElementById('minebloxLibModal').style.display = 'flex';
    buildItemThumbnailCache().catch((error) => {
        console.warn('[ASCraft] Thumbnail cache failed:', error);
    });
    renderLibrary();
};

document.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-mineblox-action]");
    if (!actionEl) return;

    const action = String(actionEl.dataset.minebloxAction || "").trim();
    if (!action) return;

    if (action === "select-craft-slot") {
        window._minebloxSelectCraftSlot?.(Number(actionEl.dataset.idx || -1));
        return;
    }
    if (action === "do-craft") {
        window._minebloxDoCraft?.();
        return;
    }
    if (action === "close-craft-modal") {
        const modal = document.getElementById("minebloxCraftModal");
        if (modal) modal.style.display = "none";
        return;
    }
    if (action === "close-library") {
        const modal = document.getElementById("minebloxLibModal");
        if (modal) modal.style.display = "none";
        return;
    }
    if (action === "library-filter") {
        window._minebloxLibFilter?.(actionEl.dataset.minebloxFilter || "all");
        return;
    }
    if (action === "library-equip") {
        window._minebloxLibEquip?.(actionEl.dataset.itemId || "");
        return;
    }
    if (action === "close-parent-modal") {
        actionEl.closest(".mineblox-modal")?.remove();
        return;
    }
    if (action === "remote-mute") {
        window._minebloxRemoteMute?.(actionEl.dataset.studentId || "");
        return;
    }
    if (action === "edit-quiz") {
        event.preventDefault();
        window._minebloxEditQuizUI?.(actionEl.dataset.quizId || "");
        return;
    }
    if (action === "answer-quiz") {
        window._minebloxAnsQuiz?.(
            Number(actionEl.dataset.optionIndex || -1),
            Number(actionEl.dataset.correctIndex || -1),
            actionEl.dataset.itemId || "",
            actionEl.dataset.quizId || "",
            actionEl.dataset.quizText || "",
        );
        return;
    }
    if (action === "select-slot") {
        window._minebloxSelectSlot?.(Number(actionEl.dataset.slotIndex || -1));
        return;
    }
    if (action === "open-inventory") {
        window._minebloxOpenInventoryFromHotbar?.();
    }
});

window.addEventListener('resize', () => {
    if (actionStackExpanded) setActionStackExpanded(true);
});

function startNetworkSync() {
    if (networkSyncStarted) return;
    networkSyncStarted = true;
    networkSyncInFlight = false;
    networkLastSyncAtMs = 0;
    networkLastHeartbeatAtMs = 0;
    networkLastSyncedPosition = null;
    // Position sync loop
    networkSyncIntervalId = setInterval(async () => {
        if (!currentRoomId || !currentUserId || !db) return;
        if (networkSyncInFlight) return;
        const nowMs = Date.now();
        const isMoving = movementController?.state?.isMoving ?? hasDirectionalMovementInput();
        const minIntervalMs = isMoving ? NETWORK_SYNC_ACTIVE_INTERVAL_MS : NETWORK_SYNC_IDLE_INTERVAL_MS;
        const playerPos = ensurePlayerWorldPosition();
        const peerId = peer?.id || "";
        const activeBodyId = isSpaceBodyActive() ? currentSpaceBodyId : 'earth';
        const movedEnough = !networkLastSyncedPosition || networkLastSyncedPosition.distanceTo(playerPos) >= NETWORK_SYNC_POSITION_EPSILON;
        const rotatedEnough = Math.abs(playerYaw - networkLastSyncedYaw) >= NETWORK_SYNC_ROTATION_EPSILON;
        const stateChanged = (
            isMoving !== networkLastSyncedMoving ||
            micEnabled !== networkLastSyncedMicEnabled ||
            peerId !== networkLastSyncedPeerId ||
            activeBodyId !== networkLastSyncedBodyId
        );
        const heartbeatDue = !networkLastHeartbeatAtMs || (nowMs - networkLastHeartbeatAtMs) >= NETWORK_SYNC_HEARTBEAT_MS;
        const cadenceDue = !networkLastSyncAtMs || (nowMs - networkLastSyncAtMs) >= minIntervalMs;
        if (!heartbeatDue && (!cadenceDue || (!movedEnough && !rotatedEnough && !stateChanged))) {
            return;
        }
        networkSyncInFlight = true;
        try {
            const playerRef = doc(db, "mineblox_rooms", currentRoomId, "players", currentUserId);
            const sessionType = isTeacher ? SESSION_KIND_TEACHER : currentSessionKind;
            const clientSessionId = ensureClientSessionId();
            await setDoc(playerRef, {
                x: playerPos.x,
                y: playerPos.y,
                z: playerPos.z,
                ry: playerYaw,
                moving: isMoving,
                displayName: playerConfig.name || 'Invitado',
                avatarId: playerConfig.avatarId || 'boy_basic',
                sessionType,
                isGuest: sessionType === SESSION_KIND_GUEST,
                sessionOwnerId: getStableSessionOwnerId(sessionType),
                clientSessionId,
                peerId,
                micOn: micEnabled,
                bodyId: activeBodyId,
                lastSeen: serverTimestamp()
            }, { merge: true });
            networkLastSyncAtMs = nowMs;
            networkLastHeartbeatAtMs = nowMs;
            networkLastSyncedPosition = playerPos.clone();
            networkLastSyncedYaw = playerYaw;
            networkLastSyncedMoving = isMoving;
            networkLastSyncedMicEnabled = micEnabled;
            networkLastSyncedPeerId = peerId;
            networkLastSyncedBodyId = activeBodyId;
        } catch (error) {
            console.warn("[ASCraft] Position sync failed", error);
        } finally {
            networkSyncInFlight = false;
        }
    }, NETWORK_SYNC_ACTIVE_INTERVAL_MS);

    // Sync Room State
    onSnapshot(doc(db, "mineblox_rooms", currentRoomId), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        roomDataSnapshot = data;
        syncSkyCycleFromRoomData(data);
        applyRecessStateFromRoom(data);

        // Chat availability can remain global, but panel visibility is local-only.
        chatEnabled = data.chatEnabled !== false;

        if (roomDoor && typeof data.doorOpen === 'boolean') {
            roomDoor.userData.roomDoorPersistedOpen = data.doorOpen;
            setDoorOpenState(roomDoor, getDoorShouldBeOpen(data.doorOpen));
        }

        const needsTerrainMigration = data.terrainVersion !== OUTDOOR_WORLD_VERSION || data.worldStyle !== OUTDOOR_WORLD_STYLE || data.classroomShellVersion !== ROOM_SHELL_VERSION;
        if (!roomShellGroup && !roomShellBuildPromise) {
            ensureRoomShellMesh().catch(() => { });
        }
        if (!skySystem && !skySystemBuildPromise) {
            queueProgressiveSceneStreaming();
        }
        if (isTeacher && needsTerrainMigration && !outdoorTerrainBuildPromise) {
            window.setTimeout(() => {
                ensureOutdoorTerrain(data).catch(() => { });
            }, 160);
        }

        setLocalChatPanelVisibility(chatPanelOpenLocal);

        // Room Name / ID
        roomName = data.roomName || 'Mi Salón';
        const roomIdContainer = document.getElementById('minebloxRoomId');
        if (roomIdContainer) {
            if (isTeacher) {
                roomIdContainer.innerHTML = getTeacherAccessPanelHtml(data);
            } else {
                renderRoomNameAndId(roomIdContainer, roomName, currentRoomId);
            }
        }

        // Rating
        if (data.rating) {
            roomRating = data.rating;
            const badge = document.getElementById('roomLevelBadge');
            if (badge) {
                badge.textContent = `LVL ${roomRating.level}`;
                badge.title = `${roomRating.score} puntos`;
            }
        }
    });

    // Watch for other players
    onSnapshot(collection(db, "mineblox_rooms", currentRoomId, "players"), (snapshot) => {
        const activeIds = new Set();
        const now = Date.now();
        let nextTeacherPresent = isTeacher;

        snapshot.forEach(doc => {
            const pid = doc.id;
            const data = doc.data();

            // Ghost check
            const lastHeartbeat = data.lastSeen?.toMillis ? data.lastSeen.toMillis() : now;
            if (now - lastHeartbeat > 45000) {
                removeOtherPlayer(pid);
                return;
            }
            if (String(data.sessionType || '').trim() === SESSION_KIND_TEACHER) {
                nextTeacherPresent = true;
            }
            if (pid === currentUserId) return;

            activeIds.add(pid);
            updateOtherPlayer(pid, data);

            // Initiate voice call if we are unmuted and the other player has a peerId
            if (peer && localStream && micEnabled && data.peerId && !activeVoiceCalls.has(data.peerId)) {
                const hasLiveTrack = localStream.getAudioTracks().some((track) => track.readyState === 'live' && track.enabled);
                if (hasLiveTrack) {
                    const call = peer.call(data.peerId, localStream);
                    if (call) handleCall(call);
                }
            }
        });

        // Cleanup players who were deleted or timed out
        otherPlayers.forEach((mesh, id) => {
            if (!activeIds.has(id)) {
                removeOtherPlayer(id);
            }
        });

        teacherPresent = nextTeacherPresent;
        applyAutomaticRecessState(!teacherPresent);
    });

    if (isTeacher) {
        cleanupDuplicateTeacherSessions().catch(() => { });
    }

    window._minebloxReward = (pid) => rewardPlayer(pid);

    // Watch for Room items (decorations)
    onSnapshot(collection(db, "mineblox_rooms", currentRoomId, "items"), (snapshot) => {
        snapshot.docChanges().forEach(change => {
            const data = change.doc.data();
            const iid = change.doc.id;
            if (isProtectedWorldItemData(data)) {
                return;
            }
            if (change.type === "added") {
                renderPlacedItem(iid, data);
            } else if (change.type === "modified") {
                if (placedItems.has(iid)) {
                    const mesh = placedItems.get(iid);
                    if (shouldRebuildPlacedItem(mesh, data)) {
                        removeActiveVideoDisplay(iid);
                        clearWhiteboardRenderState(iid);
                        scene.remove(mesh);
                        deletePlacedItem(iid);
                        renderPlacedItem(iid, data);
                        return;
                    }
                    updatePlacedItemTransform(mesh, data);
                    if (data.itemId === 'whiteboard') {
                        const boardMesh = getWhiteboardSurfaceMesh(mesh);
                        if (!data.youtubeId) {
                            removeActiveVideoDisplay(iid, boardMesh);
                        }
                        mesh.userData.youtubeId = data.youtubeId || "";
                        updateWhiteboardContent(mesh, data.text || "", data.youtubeId || "");

                        // Auto-play broadcast from teacher
                        if (data.playRequested) {
                            playYoutubeOnWhiteboard(data.youtubeId, mesh);
                            if (isTeacher) {
                                // Master resets it so it can be re-triggered
                                updateDoc(doc(db, "mineblox_rooms", currentRoomId, "items", iid), { playRequested: false });
                            }
                        }

                        // Sync Playback State
                        if (activeVideos.has(iid)) {
                            const cssObj = activeVideos.get(iid);
                            const iframe = cssObj.element.querySelector('iframe');
                            if (iframe && iframe.contentWindow) {
                                if (data.playbackState === 'paused') {
                                    iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
                                } else if (data.playbackState === 'playing') {
                                    iframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
                                }
                            }
                        }
                    }
                }
            } else if (change.type === "removed") {
                const mesh = placedItems.get(iid);
                if (mesh) {
                    scene.remove(mesh);
                    deletePlacedItem(iid);
                    if (activeVideos.has(iid)) {
                        removeActiveVideoDisplay(iid);
                    }
                    clearWhiteboardRenderState(iid);
                    if (pendingDestructionIds.has(iid)) {
                        pendingDestructionIds.delete(iid);
                        if (currentUserId && data?.itemId && ITEMS_LIBRARY.find((it) => it.id === data.itemId && it.category === 'build')) {
                            addDoc(collection(db, "lecturasGame", currentUserId, "mineblox_inventory"), {
                                itemId: data.itemId,
                                grantedBy: 'terrain-destroy',
                                grantedAt: serverTimestamp()
                            }).catch(() => { });
                        }
                    } else if (terrainRegenerationInProgress || data?.terrain) {
                        // Terrain rebuilds are structural sync events, not destruction.
                        return;
                    } else {
                        spawnDestructionEffect(mesh);
                    }
                }
            }
        });
    });

    // Watch for events (e.g. Rewards for student)
    if (!isTeacher) {
        onSnapshot(collection(db, "mineblox_rooms", currentRoomId, "events"), (snapshot) => {
            snapshot.docChanges().forEach(change => {
                if (change.type === "added") {
                    const data = change.doc.data();
                    if (data.type === "REWARD" && data.to === currentUserId) {
                        alert(`¡Has ganado un ${data.item.name}! Revisa tu inventario.`);
                    }
                }
            });
        });
    }
}

// Destruction Long Press
let destructionTimer = null;
let destructionTarget = null;
let destructionTerrainPoint = null;
let destructionTerrainNormal = null;
let diggingDustIntervalId = null;

window.addEventListener('mousedown', (e) => {
    if (!isGameCanvasMouseEvent(e)) {
        primaryActionFromCanvas = false;
        return;
    }
    if (document.pointerLockElement !== renderer?.domElement) {
        if (e.button === 0) {
            tryRestorePointerLock();
        }
        return;
    }
    if (e.button === 0) {
        primaryActionFromCanvas = true;
        primaryActionDownAt = performance.now();
        destructionCommitted = false;
        doorToggleCandidate = findDoorAtCrosshair();

        if (doorToggleCandidate?.userData?.isRoomDoor) {
            return;
        }

        if (handleCrosshairActivation({ allowPlacement: false, allowDoorToggle: false })) {
            return;
        }
        // Start destruction check
        if (!raycaster) raycaster = new THREE.Raycaster();
        configureCrosshairRaycaster(raycaster);
        const intersects = raycaster.intersectObjects(getRaycastTargets(), true);

        let targetDocId = null;
        destructionTerrainPoint = null;
        destructionTerrainNormal = null;
        for (let hit of intersects) {
            let p = hit.object;
            while (p && !p.userData.docId) p = p.parent;
            if (p && p.userData.docId) {
                if (p.userData.isTerrain && !p.userData.isRoomShell) {
                    targetDocId = '__outdoor_terrain__';
                    destructionTarget = p;
                    destructionTerrainPoint = hit.point.clone();
                    if (hit.face?.normal) {
                        const worldNormal = hit.face.normal.clone();
                        worldNormal.transformDirection(hit.object.matrixWorld);
                        destructionTerrainNormal = worldNormal.normalize();
                    }
                    break;
                }
                if (p.userData.isProtectedStructure || p.userData.isRoomShell) {
                    targetDocId = null;
                    destructionTarget = null;
                    destructionTerrainPoint = null;
                    destructionTerrainNormal = null;
                    break;
                }
                targetDocId = p.userData.docId;
                destructionTarget = p;
                break;
            }
        }

        if (targetDocId) {
            startDiggingLoopSound();
            if (diggingDustIntervalId) {
                clearInterval(diggingDustIntervalId);
                diggingDustIntervalId = null;
            }
            diggingDustIntervalId = setInterval(() => {
                if (destructionTerrainPoint) {
                    spawnDigDustAt(destructionTerrainPoint);
                    playPlaceSound();
                } else if (destructionTarget?.position) {
                    spawnDigDustAt(destructionTarget.position);
                    playPlaceSound();
                }
            }, DIG_DUST_INTERVAL_MS);
            destructionTimer = setTimeout(async () => {
                destructionCommitted = true;
                stopDiggingLoopSound();
                if (diggingDustIntervalId) {
                    clearInterval(diggingDustIntervalId);
                    diggingDustIntervalId = null;
                }
                if (targetDocId === '__outdoor_terrain__' && destructionTerrainPoint) {
                    const didScrape = await destroyOutdoorTerrainVoxelFromHit(destructionTerrainPoint, destructionTerrainNormal);
                    if (didScrape) {
                        const terrainEffect = new THREE.Object3D();
                        terrainEffect.position.copy(destructionTerrainPoint);
                        spawnDestructionEffect(terrainEffect);
                    }
                } else {
                    const effectSource = destructionTarget || placedItems.get(targetDocId);
                    spawnDestructionEffect(effectSource || destructionTarget);
                    pendingDestructionIds.add(targetDocId);
                    playDestroySound();
                    await deleteDoc(doc(db, "mineblox_rooms", currentRoomId, "items", targetDocId));
                }
            }, DESTRUCTION_HOLD_MS);
        }
    }
});

window.addEventListener('mouseup', () => {
    const pressDuration = performance.now() - primaryActionDownAt;
    const wasCommitted = destructionCommitted;
    clearTimeout(destructionTimer);
    stopDiggingLoopSound();
    if (diggingDustIntervalId) {
        clearInterval(diggingDustIntervalId);
        diggingDustIntervalId = null;
    }
    destructionTarget = null;
    destructionCommitted = false;
    destructionTerrainPoint = null;
    destructionTerrainNormal = null;

    if (primaryActionFromCanvas && document.pointerLockElement === renderer.domElement && pressDuration < 300 && !wasCommitted && doorToggleCandidate) {
        toggleDoorState(doorToggleCandidate);
    }
    doorToggleCandidate = null;
    primaryActionFromCanvas = false;
});

async function tryPlaceItem() {
    resolveSelectedItemFromHotbar();
    if (!selectedItem && selectedItemTypeId) {
        const fallbackGroup = getEffectiveGroupedInventory().find(group => normalizeInventoryItemId(group.itemId) === normalizeInventoryItemId(selectedItemTypeId));
        if (fallbackGroup?.items?.length) {
            selectedItem = fallbackGroup.items[0];
        }
    }
    if (!selectedItem || !currentRoomId) return;
    const itemIdToPlace = normalizeInventoryItemId(selectedItem.itemId || selectedItemTypeId);

    if (!raycaster) raycaster = new THREE.Raycaster();
    configureCrosshairRaycaster(raycaster);
    const intersects = raycaster.intersectObjects(getRaycastTargets(), true);

    if (intersects.length > 0) {
        const point = intersects[0].point;
        const norm = getHitWorldVoxelNormal(intersects[0]);
        const snapped = getAdjacentVoxelPlacementPoint(point, norm);
        const itemKind = ITEMS_LIBRARY.find((libItem) => libItem.id === itemIdToPlace);
        const placementProfile = ITEM_PLACEMENT_RULES[itemIdToPlace] || null;
        const fallbackYaw = Number(playerYaw || lookTargetYaw || camera?.rotation?.y || 0);
        let py = snapped.y;
        let ry = placementProfile?.wallAligned
            ? getPlacementSurfaceOrientation(itemIdToPlace, norm, fallbackYaw)
            : quantizeQuarterTurn(fallbackYaw);

        // Poster specific orientation logic
        if (itemIdToPlace === 'poster_reading') {
            py = snapToVoxel(point.y);
        } else if (itemIdToPlace === 'door_wood') {
            py = snapToVoxel(Math.max(getRoomWorldFloorY(), point.y));
        } else if (itemKind?.category === 'build') {
            ry = quantizeQuarterTurn(ry);
        }

        let px = snapped.x;
        let pz = snapped.z;
        if (placementProfile?.wallSnap) {
            const normalizedPlacement = normalizePlacedItemPlacementData({
                itemId: itemIdToPlace,
                x: snapped.x,
                y: py,
                z: snapped.z,
                ry
            });
            px = snapToVoxel(normalizedPlacement.x || snapped.x);
            py = snapToVoxel(normalizedPlacement.y || py);
            pz = snapToVoxel(normalizedPlacement.z || snapped.z);
            ry = normalizedPlacement.ry;
        }

        let placementExt = {};
        if (itemIdToPlace === 'poster_reading') {
            // Get a random reading image from core if available (simplified for now)
            placementExt.imageUrl = await resolveRandomReadingImage();
        }

        addDoc(collection(db, "mineblox_rooms", currentRoomId, "items"), {
            itemId: itemIdToPlace,
            x: px,
            y: py,
            z: pz,
            ry: ry,
            ownerId: currentUserId,
            ...placementExt
        });
        playPlaceSound();

        if (selectedItem?.docId && !selectedItem?.virtual) {
            deleteDoc(doc(db, "lecturasGame", currentUserId, "mineblox_inventory", selectedItem.docId));
            selectedItem = null;
        } else {
            selectedItem = { itemId: itemIdToPlace, docId: null, virtual: true };
        }
        renderInventory();
        renderLibrary();
    }
}

async function resolveRandomReadingImage() {
    try {
        const snap = await getDocs(query(collection(db, "lecturasGame"), limit(20)));
        const reading = snap.docs[Math.floor(Math.random() * snap.docs.length)]?.data();
        if (reading) {
            // Try to use a known cover image path or a fallback
            return reading.coverImage || reading.imagen || reading.portada || 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&q=80&w=400';
        }
    } catch (_) { }
    return 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&q=80&w=400';
}

function createDoorAssembly(color = 0x8b4513, options = {}) {
    const width = options.width ?? 1.85;
    const height = options.height ?? 3.8;
    const thickness = options.thickness ?? 0.16;
    const hingeSide = options.hingeSide || 'left';

    const group = new THREE.Group();
    group.userData.isDoor = true;
    group.userData.doorOpen = false;
    group.userData.doorTargetAngle = 0;
    group.userData.doorCurrentAngle = 0;
    group.userData.doorOpenProgress = 0;
    group.userData.doorHingeSide = hingeSide;

    const pivot = new THREE.Group();
    pivot.position.x = hingeSide === 'right' ? width / 2 : -width / 2;
    group.add(pivot);
    group.userData.doorPivot = pivot;

    const leafMat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.72,
        metalness: 0.04,
        side: THREE.DoubleSide
    });
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(width, height, thickness), leafMat);
    leaf.position.x = hingeSide === 'right' ? -width / 2 : width / 2;
    leaf.position.y = height / 2;
    pivot.add(leaf);

    const trimMat = new THREE.MeshStandardMaterial({
        color: 0x5f3a23,
        roughness: 0.85,
        metalness: 0.08,
        side: THREE.DoubleSide
    });
    const railGeo = new THREE.BoxGeometry(0.08, height - 0.16, thickness + 0.02);
    const leftRail = new THREE.Mesh(railGeo, trimMat);
    leftRail.position.set(hingeSide === 'right' ? -width + 0.06 : 0.06, height / 2, 0);
    pivot.add(leftRail);
    const rightRail = new THREE.Mesh(railGeo, trimMat);
    rightRail.position.set(hingeSide === 'right' ? -0.06 : width - 0.06, height / 2, 0);
    pivot.add(rightRail);

    const crossGeo = new THREE.BoxGeometry(width - 0.16, 0.08, thickness + 0.02);
    const topCross = new THREE.Mesh(crossGeo, trimMat);
    topCross.position.set(0, height - 0.08, 0);
    pivot.add(topCross);
    const bottomCross = new THREE.Mesh(crossGeo, trimMat);
    bottomCross.position.set(0, 0.08, 0);
    pivot.add(bottomCross);

    const handleMat = new THREE.MeshStandardMaterial({
        color: 0xf5c542,
        roughness: 0.22,
        metalness: 0.85
    });
    const handleX = hingeSide === 'right' ? -0.22 : width - 0.22;
    const handlePlate = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.04), handleMat);
    handlePlate.position.set(handleX, height * 0.52, thickness / 2 + 0.035);
    pivot.add(handlePlate);

    const handleKnob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 16), handleMat);
    handleKnob.position.set(handleX + (hingeSide === 'right' ? -0.06 : 0.06), height * 0.52, thickness / 2 + 0.075);
    pivot.add(handleKnob);

    group.traverse((child) => {
        if (child?.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    return group;
}

function renderPlacedItem(id, data) {
    if (placedItems.has(id)) return;
    data = normalizePlacedItemPlacementData(data);
    const libItem = ITEMS_LIBRARY.find(l => l.id === data.itemId);

    // Create base mesh or compound group
    const itemWorldYOffset = getPlacedItemWorldYOffset(data);
    const mesh = createFurnitureMesh(data.itemId, libItem?.color || 0x8b4513);
    mesh.position.set(
        snapToVoxel(data.x || 0),
        snapToVoxel(data.y || 0) + itemWorldYOffset,
        snapToVoxel(data.z || 0)
    );
    mesh.userData.docId = id; // Store for destruction
    mesh.userData.isBlock = libItem?.category === 'build';
    mesh.userData.structure = data.structure || null;
    mesh.userData.isTerrain = !!data.terrain;
    mesh.userData.isRoomShell = data.structure === 'room_shell';
    mesh.userData.isProtectedStructure = !!data.terrain || data.structure === 'room_shell';
    mesh.userData.roomWorldOffsetY = itemWorldYOffset;
    mesh.userData.isSeatable = data.itemId === 'chair_wood';
    mesh.userData.isStepable = libItem?.category === 'build' || data.itemId === 'table_wood' || String(data.itemId || '').includes('desk') || data.itemId === 'bookshelf';
    mesh.userData.collisionPadding = data.itemId === 'chair_wood' ? 0.15 : 0.05;
    mesh.userData.itemId = data.itemId;
    mesh.userData.label = data.label || '';
    mesh.userData.imageUrl = data.imageUrl || '';

    // Apply Rotation if present
    if (typeof data.ry === 'number') mesh.rotation.y = quantizeQuarterTurn(data.ry);

    if (libItem?.category === 'build' && !isSpaceBodyActive()) {
        const surfNormal = getEarthWalkableSurfaceNormal(mesh.position.x, mesh.position.z);
        if (surfNormal) {
            const surfaceQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), surfNormal);
            mesh.quaternion.multiply(surfaceQuat);
        }
    }

    if (libItem?.category === 'build') {
        mesh.traverse((child) => {
            if (child?.isMesh && child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach((material) => {
                    material.side = getBlockMaterialConfig(data.itemId).side;
                    material.needsUpdate = true;
                });
            }
        });
    }

    // TEXTURES
    if (libItem?.category === 'build' && mesh.children[0]) {
        const target = mesh.children[0] instanceof THREE.Mesh ? mesh.children[0] : mesh;
        applyBuildBlockTexture(target, data.itemId);
    }

    if (data.itemId === 'poster_reading' && data.imageUrl) {
        if (!posterTextureCache.has(data.imageUrl)) {
            posterTextureCache.set(data.imageUrl, new Promise((resolve) => {
                textureLoader.load(data.imageUrl, resolve, undefined, () => resolve(null));
            }));
        }
        posterTextureCache.get(data.imageUrl).then((tex) => {
            if (!tex) return;
            const m = mesh.children[0] instanceof THREE.Mesh ? mesh.children[0] : mesh;
            m.material = new THREE.MeshPhongMaterial({ map: tex });
            m.material.needsUpdate = true;
        });
    }

    // Apply build-mode scale specifically to blocks
    if (libItem?.category === 'build') {
        const s = libItem.scale || [1, 1, 1];
        mesh.scale.set(s[0], s[1], s[2]);
    }
    mesh.traverse((child) => {
        if (child?.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    // Add Label if exists (for student desks)
    if (data.label) {
        const labelSprite = createNameLabel(data.label);
        labelSprite.position.y = 0.6;
        labelSprite.scale.set(1.2, 0.3, 1);
        mesh.add(labelSprite);
    }

    // Whiteboard drawing & Video
    if (data.itemId === 'whiteboard') {
        mesh.userData.youtubeId = data.youtubeId || "";
        updateWhiteboardContent(mesh, data.text || "", data.youtubeId || "", { immediate: true });

        // Final click play for manual activation (Students or Master)
        // Note: Students can only manually play if the master has set a youtubeId.
    }

    scene.add(mesh);
    refreshCollisionMeshBounds(mesh);
    const collisionBox = mesh.userData.collisionBox;
    if (mesh.userData.isSeatable) {
        mesh.userData.seatPosition = new THREE.Vector3(
            (collisionBox.min.x + collisionBox.max.x) * 0.5,
            collisionBox.max.y + 0.32,
            (collisionBox.min.z + collisionBox.max.z) * 0.5
        );
    }
    setPlacedItem(id, mesh);
}

function updatePlacedItemTransform(mesh, data) {
    if (!mesh) return;
    data = normalizePlacedItemPlacementData(data);
    const itemWorldYOffset = getPlacedItemWorldYOffset(data);
    mesh.position.set(
        snapToVoxel(data.x || 0),
        snapToVoxel(data.y || 0) + itemWorldYOffset,
        snapToVoxel(data.z || 0)
    );
    if (typeof data.ry === 'number') {
        mesh.rotation.y = quantizeQuarterTurn(data.ry);
    }
    mesh.userData.youtubeId = data.youtubeId || "";
    mesh.userData.label = data.label || '';
    mesh.userData.imageUrl = data.imageUrl || '';
    mesh.userData.roomWorldOffsetY = itemWorldYOffset;
    refreshCollisionMeshBounds(mesh);
    const collisionBox = mesh.userData.collisionBox;
    if (mesh.userData.isSeatable) {
        mesh.userData.seatPosition = new THREE.Vector3(
            (collisionBox.min.x + collisionBox.max.x) * 0.5,
            collisionBox.max.y + 0.32,
            (collisionBox.min.z + collisionBox.max.z) * 0.5
        );
    }
}

function shouldRebuildPlacedItem(mesh, data) {
    if (!mesh) return true;
    const nextItemId = String(data?.itemId || '');
    if (String(mesh.userData.itemId || '') !== nextItemId) return true;
    if (String(mesh.userData.label || '') !== String(data?.label || '')) return true;
    if (nextItemId === 'poster_reading' && String(mesh.userData.imageUrl || '') !== String(data?.imageUrl || '')) return true;
    return false;
}

function getWhiteboardRenderState(group, board) {
    const docId = String(group?.userData?.docId || board?.uuid || '');
    if (!whiteboardRenderCache.has(docId)) {
        const canvas = document.createElement('canvas');
        canvas.width = WHITEBOARD_CANVAS_WIDTH;
        canvas.height = WHITEBOARD_CANVAS_HEIGHT;
        const ctx = canvas.getContext('2d');
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.MeshPhongMaterial({ map: texture, side: THREE.DoubleSide });
        whiteboardRenderCache.set(docId, {
            canvas,
            ctx,
            texture,
            material,
            lastSignature: ''
        });
    }
    const entry = whiteboardRenderCache.get(docId);
    if (board.material !== entry.material) {
        board.material = entry.material;
        board.material.needsUpdate = true;
    }
    return entry;
}

function loadYouTubeThumbnail(cleanId) {
    if (!cleanId) return Promise.resolve(null);
    if (!whiteboardThumbnailPromiseCache.has(cleanId)) {
        whiteboardThumbnailPromiseCache.set(cleanId, new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = `https://img.youtube.com/vi/${cleanId}/hqdefault.jpg`;
        }));
    }
    return whiteboardThumbnailPromiseCache.get(cleanId);
}

async function drawWhiteboardContent(group, text, youtubeId) {
    const cleanId = getYouTubeId(youtubeId);
    const board = group.children.find(c => c.geometry && c.geometry.type === 'BoxGeometry' && c.geometry.parameters.width > 2);
    if (!board) return;
    const docId = String(group?.userData?.docId || board?.uuid || '');
    const renderState = getWhiteboardRenderState(group, board);
    const { ctx, texture } = renderState;

    ctx.clearRect(0, 0, WHITEBOARD_CANVAS_WIDTH, WHITEBOARD_CANVAS_HEIGHT);
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, WHITEBOARD_CANVAS_WIDTH, WHITEBOARD_CANVAS_HEIGHT);

    const drawWrappedText = (message, options = {}) => {
        const raw = String(message ?? "");
        if (!raw) return;
        const maxWidth = options.maxWidth || 900;
        const startY = options.startY || 110;
        const lineHeight = options.lineHeight || 48;
        const font = options.font || '400 38px "Comic Sans MS"';
        ctx.font = font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = options.fillStyle || '#333';
        ctx.strokeStyle = options.strokeStyle || 'transparent';
        ctx.lineWidth = options.lineWidth || 0;
        const lines = wrapCanvasText(ctx, raw, maxWidth);
        lines.forEach((line, idx) => {
            const y = startY + (idx * lineHeight);
            if (ctx.lineWidth > 0 && ctx.strokeStyle !== 'transparent') {
                ctx.strokeText(line, WHITEBOARD_CANVAS_WIDTH / 2, y);
            }
            ctx.fillText(line, WHITEBOARD_CANVAS_WIDTH / 2, y);
        });
    };

    if (cleanId) {
        const img = await loadYouTubeThumbnail(cleanId);
        if (!whiteboardRenderCache.has(docId)) return;
        if (img) {
            ctx.drawImage(img, 0, 0, WHITEBOARD_CANVAS_WIDTH, WHITEBOARD_CANVAS_HEIGHT);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, 0, WHITEBOARD_CANVAS_WIDTH, WHITEBOARD_CANVAS_HEIGHT);
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.moveTo(462, 206);
        ctx.lineTo(582, 256);
        ctx.lineTo(462, 306);
        ctx.closePath();
        ctx.fill();
        if (text) {
            drawWrappedText(text, {
                startY: 402,
                lineHeight: 44,
                maxWidth: 920,
                font: '400 36px "Comic Sans MS"',
                fillStyle: 'white',
                strokeStyle: 'black',
                lineWidth: 3
            });
        }
    } else {
        drawWrappedText(text, {
            startY: 140,
            lineHeight: 70,
            maxWidth: 930,
            font: '400 58px "Comic Sans MS", cursive',
            fillStyle: '#333'
        });
    }

    texture.needsUpdate = true;
    board.material.needsUpdate = true;
}

function updateWhiteboardContent(group, text, youtubeId, options = {}) {
    const docId = String(group?.userData?.docId || '');
    if (!docId) return;
    const cleanId = getYouTubeId(youtubeId);
    const signature = JSON.stringify([String(text || ''), cleanId || '']);
    const board = group.children.find(c => c.geometry && c.geometry.type === 'BoxGeometry' && c.geometry.parameters.width > 2);
    if (!board) return;
    const renderState = getWhiteboardRenderState(group, board);
    if (!options.force && renderState.lastSignature === signature) {
        return;
    }
    whiteboardPendingPayloads.set(docId, {
        group,
        text,
        youtubeId: cleanId || '',
        signature
    });
    const runUpdate = async () => {
        const pending = whiteboardPendingPayloads.get(docId);
        if (!pending) return;
        await drawWhiteboardContent(pending.group, pending.text, pending.youtubeId);
        renderState.lastSignature = pending.signature;
        whiteboardPendingPayloads.delete(docId);
    };
    const existingTimer = whiteboardUpdateTimerIds.get(docId);
    if (existingTimer) {
        clearTimeout(existingTimer);
        whiteboardUpdateTimerIds.delete(docId);
    }
    if (options.immediate) {
        runUpdate().catch(() => { });
        return;
    }
    const timerId = window.setTimeout(() => {
        whiteboardUpdateTimerIds.delete(docId);
        runUpdate().catch(() => { });
    }, WHITEBOARD_UPDATE_DEBOUNCE_MS);
    whiteboardUpdateTimerIds.set(docId, timerId);
}

function createFurnitureMesh(itemId, color) {
    const group = new THREE.Group();
    const libItem = ITEMS_LIBRARY.find((entry) => entry.id === itemId) || null;
    const isBuildItem = libItem?.category === 'build';
    const mat = isBuildItem
        ? createBlockMaterial(itemId)
        : new THREE.MeshPhongMaterial({ color: color, side: THREE.DoubleSide });

    if (itemId.includes('chair')) {
        // Seat
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), mat);
        seat.position.y = -0.15;
        group.add(seat);
        // Back rest
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.1), mat);
        back.position.set(0, 0.2, -0.3);
        group.add(back);
        // Legs (Voxel style)
        const legGeo = new THREE.BoxGeometry(0.1, 0.45, 0.1);
        for (let x of [-0.2, 0.2]) {
            for (let z of [-0.2, 0.2]) {
                const leg = new THREE.Mesh(legGeo, mat);
                leg.position.set(x, -0.4, z);
                group.add(leg);
            }
        }
    } else if (itemId.includes('table') || itemId.includes('desk')) {
        // Table Top
        const surfaceWidth = itemId.includes('teacher') ? 1.5 : 1.0;
        const top = new THREE.Mesh(new THREE.BoxGeometry(surfaceWidth, 0.1, 0.8), mat);
        top.position.y = 0.3;
        group.add(top);
        // Legs
        const legGeo = new THREE.BoxGeometry(0.1, 0.8, 0.1);
        for (let x of [-(surfaceWidth / 2 - 0.1), (surfaceWidth / 2 - 0.1)]) {
            for (let z of [-0.3, 0.3]) {
                const leg = new THREE.Mesh(legGeo, mat);
                leg.position.set(x, -0.15, z);
                group.add(leg);
            }
        }
        // If it's a desk, add a front panel
        if (itemId.includes('desk')) {
            const panel = new THREE.Mesh(new THREE.BoxGeometry(surfaceWidth - 0.2, 0.6, 0.05), mat);
            panel.position.set(0, -0.1, 0.3);
            group.add(panel);
        }
    } else if (itemId === 'whiteboard') {
        const w = 6, h = 3.5;
        // The Board
        const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), new THREE.MeshPhongMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
        board.position.y = h / 2;
        group.add(board);
        // The Frame
        const frameMat = new THREE.MeshPhongMaterial({ color: 0x333333, side: THREE.DoubleSide });
        const frameTop = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.15, 0.2), frameMat);
        frameTop.position.y = h + 0.05;
        group.add(frameTop);
        const frameBottom = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.15, 0.2), frameMat);
        frameBottom.position.y = -0.05;
        group.add(frameBottom);
        // Stand (Voxel feet)
        const legGeo = new THREE.BoxGeometry(0.2, 1, 0.2);
        const l1 = new THREE.Mesh(legGeo, frameMat);
        l1.position.set(-w / 2.5, -0.5, 0);
        group.add(l1);
        const l2 = new THREE.Mesh(legGeo, frameMat);
        l2.position.set(w / 2.5, -0.5, 0);
        group.add(l2);
    } else if (itemId === 'bookshelf') {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 0.5), mat);
        group.add(frame);
        // Recessed shelves
        const shelfGeo = new THREE.BoxGeometry(0.9, 0.05, 0.45);
        const shelfMat = new THREE.MeshPhongMaterial({ color: 0x5c4033 });
        for (let y of [-0.6, -0.2, 0.2, 0.6]) {
            const shelf = new THREE.Mesh(shelfGeo, shelfMat);
            shelf.position.set(0, y, 0.05);
            group.add(shelf);
        }
    } else if (itemId === 'door_wood') {
        return createDoorAssembly(color || 0x8b4513, {
            width: 1.0,
            height: 2.0,
            thickness: 0.12,
            hingeSide: 'left'
        });
    } else if (itemId === 'diamond_blue') {
        const geo = new THREE.OctahedronGeometry(0.4);
        const mesh = new THREE.Mesh(geo, mat);
        group.add(mesh);
    } else if (itemId === 'gold_ingot') {
        const geo = new THREE.BoxGeometry(0.6, 0.15, 0.3);
        const mesh = new THREE.Mesh(geo, mat);
        group.add(mesh);
    } else if (itemId === 'trophy_gold') {
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.4), new THREE.MeshPhongMaterial({ color: 0x555555 }));
        base.position.y = -0.3;
        group.add(base);
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.1, 0.5, 8), mat);
        group.add(cup);
    } else if (itemId === 'armor_stand') {
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), new THREE.MeshPhongMaterial({ color: 0x333333 }));
        base.position.y = -0.4;
        group.add(base);
        const pole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), mat);
        group.add(pole);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.1), mat);
        arm.position.y = 0.4;
        group.add(arm);
    } else if (itemId === 'poster_reading') {
        const geo = new THREE.BoxGeometry(1, 1.5, 0.05);
        const mesh = new THREE.Mesh(geo, mat);
        group.add(mesh);
    } else {
        // DEFAULT BLOCK (WITH TEXTURE IF BUILD)
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const mesh = new THREE.Mesh(geo, mat);
        group.add(mesh);
    }
    group.traverse((child) => {
        if (child?.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    return group;
}

function createVoxelPlayerModel(avatarId = 'boy_basic', displayName = '') {
    const group = new THREE.Group();
    const preset = getAvatarPreset(avatarId);
    group.userData.avatarId = avatarId;

    // Pivot helper to rotate limbs from top
    // Shift all children so pivot (0,0,0) is at the center of the base (feet)
    const yOffset = 1.05;

    const addLimb = (parent, geo, mat, x, y, z) => {
        const pivot = new THREE.Object3D();
        pivot.position.set(x, y + yOffset, z);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = -geo.parameters.height / 2; // pivot is top of limb
        pivot.add(mesh);
        parent.add(pivot);
        return pivot;
    };

    // Head
    const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const headMat = new THREE.MeshPhongMaterial({ color: preset.skin });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.2 + yOffset;
    head.castShadow = true;
    head.receiveShadow = true;
    group.add(head);

    // Hair
    const hairGeo = new THREE.BoxGeometry(0.42, 0.15, 0.42);
    const hairMat = new THREE.MeshPhongMaterial({ color: preset.hairColor });
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.position.y = 0.35 + yOffset;
    hair.castShadow = true;
    hair.receiveShadow = true;
    group.add(hair);

    // Eyes
    const eyeGeo = new THREE.BoxGeometry(0.08, 0.08, 0.05);
    const eyeMat = new THREE.MeshPhongMaterial({ color: 0x000000 });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.1, 0.2 + yOffset, 0.18);
    leftEye.castShadow = true;
    group.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.1, 0.2 + yOffset, 0.18);
    rightEye.castShadow = true;
    group.add(rightEye);

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.5, 0.7, 0.25);
    const torsoMat = new THREE.MeshPhongMaterial({ color: preset.shirt });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = -0.35 + yOffset;
    torso.castShadow = true;
    torso.receiveShadow = true;
    group.add(torso);

    // Arms & Legs
    const armGeo = new THREE.BoxGeometry(0.2, 0.7, 0.2);
    const legGeo = new THREE.BoxGeometry(0.2, 0.7, 0.2);
    const legMat = new THREE.MeshPhongMaterial({ color: preset.pants });

    const addShadowLimb = (parent, geo, mat, x, y, z) => {
        const pivot = addLimb(parent, geo, mat, x, y, z);
        const mesh = pivot.children.find(c => c?.isMesh) || pivot.children[0];
        if (mesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
        }
        return pivot;
    };

    group.userData.limbs = {
        leftArm: addShadowLimb(group, armGeo, torsoMat, -0.35, -0.05, 0),
        rightArm: addShadowLimb(group, armGeo, torsoMat, 0.35, -0.05, 0),
        leftLeg: addShadowLimb(group, legGeo, legMat, -0.15, -0.7, 0),
        rightLeg: addShadowLimb(group, legGeo, legMat, 0.15, -0.7, 0)
    };

    // Name tag
    if (displayName) {
        const nameTag = createNameLabel(displayName);
        nameTag.position.y = 0.6 + yOffset;
        group.add(nameTag);
        group.userData.nameTag = nameTag;
    }

    // The voxel body faces +Z by default; rotate it once so the visible front
    // aligns with the world forward direction used by the camera controls.
    group.rotation.y = Math.PI;
    group.traverse((child) => {
        if (child?.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    return group;
}

function updateOtherPlayer(id, data) {
    if (!otherPlayers.has(id)) {
        const mesh = createVoxelPlayerModel(data.avatarId || 'boy_basic', data.displayName || 'Alumno');
        scene.add(mesh);
        otherPlayers.set(id, mesh);
    }
    const mesh = otherPlayers.get(id);

    // Place the mesh at the same base plane as the local player.
    mesh.position.set(data.x, data.y - PLAYER_EYE_HEIGHT + PLAYER_MODEL_BASE_OFFSET, data.z);
    mesh.rotation.y = (data.ry || 0);

    // Update name/avatar if changed
    if (data.displayName && (!mesh.userData.currentName || mesh.userData.currentName !== data.displayName)) {
        if (mesh.userData.nameTag) mesh.remove(mesh.userData.nameTag);
        const newTag = createNameLabel(data.displayName);
        mesh.add(newTag);
        mesh.userData.nameTag = newTag;
        mesh.userData.currentName = data.displayName;
    }

    // Exaggerated Animation
    if (data.moving && mesh.userData.limbs) {
        const t = performance.now() * 0.015; // Faster
        const swing = 0.8; // More angle
        mesh.userData.limbs.leftArm.rotation.x = Math.sin(t) * swing;
        mesh.userData.limbs.rightArm.rotation.x = -Math.sin(t) * swing;
        mesh.userData.limbs.leftLeg.rotation.x = -Math.sin(t) * swing;
        mesh.userData.limbs.rightLeg.rotation.x = Math.sin(t) * swing;

        // Add body bobbing - base y is from data.y, then adjust locally
        const bob = Math.abs(Math.cos(t * 2)) * 0.1;
        mesh.position.y = (data.y - PLAYER_EYE_HEIGHT + PLAYER_MODEL_BASE_OFFSET) + bob;
    } else if (mesh.userData.limbs) {
        // Reset limbs
        Object.values(mesh.userData.limbs).forEach(l => {
            l.rotation.x = THREE.MathUtils.lerp(l.rotation.x, 0, 0.2);
        });
        mesh.position.y = (data.y - PLAYER_EYE_HEIGHT + PLAYER_MODEL_BASE_OFFSET);
    }
}

// Global click handler for placement
window.addEventListener('mousedown', (e) => {
    if (!isGameCanvasMouseEvent(e)) return;
    if (document.pointerLockElement !== renderer?.domElement) {
        if (e.button === 0) {
            tryRestorePointerLock();
        }
        return;
    }
    if (e.button === 0) {
        if (handleCrosshairActivation({ allowPlacement: false, allowDoorToggle: false })) {
            return;
        }

        // Only place if not held for destruction
        setTimeout(() => {
            if (!destructionTarget) tryPlaceItem();
        }, 300);
    }
});

function removeOtherPlayer(id) {
    if (otherPlayers.has(id)) {
        scene.remove(otherPlayers.get(id));
        otherPlayers.delete(id);
    }
}

async function initVoiceChat() {
    if (voiceChatInitialized) return;
    voiceChatInitialized = true;
    try {
        // We use a modular import for PeerJS from the CDN provided earlier.
        // PeerJS for ES modules can be tricky, we'll try to use the global Peer if PeerJS ESM fails.
        const PeerCtor = window.Peer || (await import("./vendor/peerjs/peerjs.min.js")).default;

        peer = new PeerCtor();

        peer.on('open', (id) => {
            console.log("My peer ID:", id);
            // Register peerId in room
            if (currentRoomId) {
                setDoc(doc(db, "mineblox_rooms", currentRoomId, "players", currentUserId), { peerId: id }, { merge: true }).catch(() => { });
            }
            if (micEnabled) {
                connectVoiceToPeers().catch(() => { });
            }
        });

        const micBtn = document.getElementById('micBtn');
        if (micBtn) micBtn.style.display = 'flex';
        micEnabled = false;
        syncMicButtonUi();

        peer.on('call', (call) => {
            if (localStream) {
                call.answer(localStream);
            } else {
                call.answer();
            }
            handleCall(call);
        });

        if (micBtn) {
            micBtn.onclick = () => {
                toggleMic().catch(() => {
                    syncMicButtonUi();
                });
            };
        }

    } catch (e) {
        voiceChatInitialized = false;
        try { peer?.destroy?.(); } catch (_) { }
        peer = null;
        stopLocalVoiceStream();
        console.warn("Voice chat init failed", e);
    }
}

function handleCall(call) {
    if (!call?.peer) return;
    activeVoiceCalls.set(call.peer, call);
    call.on('close', () => {
        activeVoiceCalls.delete(call.peer);
        remoteStreams.delete(call.peer);
    });
    call.on('error', () => {
        activeVoiceCalls.delete(call.peer);
    });
    call.on('stream', (remoteStream) => {
        if (!remoteStreams.has(call.peer)) {
            const audio = new Audio();
            audio.srcObject = remoteStream;
            audio.play().catch(() => { });
            remoteStreams.set(call.peer, remoteStream);
        }
    });
}

function clearPendingLookInput() {
    if (!movementController?.state?.lookInputState) return;
    movementController.state.lookInputState.deltaX = 0;
    movementController.state.lookInputState.deltaY = 0;
    movementController.state.lookTargetYaw = movementController.state.playerYaw;
    movementController.state.lookTargetPitch = movementController.state.playerPitch;
    syncMovementStateFromController(movementController.state);
}

function handleMovementVisibilityChange() {
    shouldDiscardNextMovementDelta = true;
    lastAnimationTimeMs = 0;
    lastSkyAnimationTickAtMs = 0;
    lastParticleAnimationTickAtMs = 0;
    lastHighlightTickAtMs = 0;
    lastSkyUpdateAtRealMs = 0;
    lastSceneStreamAttemptAtMs = 0;
    skyShadowRefreshPending = true;
    movementController?.resetMovementState?.();
    clearPendingLookInput();
    skyLightingRuntime?.resetDynamicLighting?.();
    stopDiggingLoopSound();
    if (diggingDustIntervalId) {
        clearInterval(diggingDustIntervalId);
        diggingDustIntervalId = null;
    }
    if (!document.hidden) {
        rebaseSkyAnimationClock();
        try { clock?.getDelta?.(); } catch (_) { }
    }
}

function animate() {
    requestAnimationFrame(animate);
    if (!movementController) return;
    const nowMs = (typeof performance !== "undefined" && typeof performance.now === "function")
        ? performance.now()
        : Date.now();
    const clockDelta = Number(clock?.getDelta?.() ?? 0);
    const fallbackDelta = lastAnimationTimeMs > 0
        ? Math.max(0, (nowMs - lastAnimationTimeMs) / 1000)
        : 0;
    lastAnimationTimeMs = nowMs;
    const deltaRaw = clockDelta > 0 ? clockDelta : fallbackDelta;
    const emergencyDelta = (!document.hidden && deltaRaw <= 0) ? (1 / 60) : 0;
    const stableDelta = deltaRaw > 0 ? deltaRaw : emergencyDelta;
    let frameDelta = 0;
    if (shouldDiscardNextMovementDelta) {
        shouldDiscardNextMovementDelta = false;
        clearPendingLookInput();
        frameDelta = 0;
    } else if (Number.isFinite(stableDelta) && stableDelta > 0) {
        frameDelta = Math.max(MOVEMENT_DELTA_MIN, Math.min(stableDelta, MOVEMENT_DELTA_MAX));
    }

    // Animate fluid textures by redrawing the canvas (no UV offset = no stripes)
    updateFluidTextures(stableDelta);
    if (activeCelestialBody === 'earth') {
        updateOceanVehicles(frameDelta || stableDelta);
    }
    if (typeof window !== "undefined") {
        window.__ASCraftFrameDebug = {
            clockDelta,
            fallbackDelta,
            deltaRaw,
            emergencyDelta,
            stableDelta,
            frameDelta,
            shouldDiscardNextMovementDelta,
            activeCelestialBody
        };
    }
    const cssLayerActive = hasActiveCssVideoScene();
    const highlightNowMs = typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    try {
        movementController.step({
            delta: frameDelta,
            document,
            THREE,
            renderer,
            camera,
            cssRenderer: cssLayerActive ? cssRenderer : null,
            cssScene: cssLayerActive ? cssScene : null,
            scene,
            currentRoomId,
            roomDoor,
            outdoorTerrainGroup,
            roomShellGroup,
            playerPosition: ensurePlayerWorldPosition(),
            playerViewMode,
            getPlayerSpawnPosition,
            getPlanetBlend,
            getPlanetSurfaceNormal,
            getPlanetFrame,
            getCubeSurfaceState,
            getPlanetCenter,
            getPlanetEyeRadius,
            getEarthWalkableSurfaceY,
            getEarthWalkableSurfaceNormal,
            getEarthSurfaceSupportState,
            getEarthSurfaceSupportStateAtPosition,
            isEarthSurfaceSampleInsideRadius,
            getClampedEarthSurfaceSample,
            activeCelestialBody,
            updateDoorState: (targetDoor, shouldOpen) => {
                if (typeof shouldOpen === "boolean") {
                    setDoorOpenState(targetDoor, shouldOpen);
                    return;
                }
                updateDoorState(targetDoor, shouldOpen);
            },
            updateDestructionEffects,
            findTerrainSupportYAt,
            getTerrainVoxelContact,
            isWaterWorldVoxelAt,
            getPlacedItemCollisionBox,
            collisionBroadphase,
            playerCollisionMask: collisionBroadphase?.masks?.playerLocal,
            placedItems,
            seatedState,
            exitSeatedState,
            applyCameraOrientation,
            updateLocalPlayerAvatar,
            playStepSound,
            syncState: syncMovementStateFromController,
            roomWidth: ROOM_WIDTH,
            roomDepth: ROOM_DEPTH,
            roomHeight: ROOM_HEIGHT,
            playerRadius: PLAYER_RADIUS,
            playerEyeHeight: PLAYER_EYE_HEIGHT,
            playerTopOffset: PLAYER_TOP_OFFSET,
            roomFloorY: getRoomWorldFloorY(),
            stepUpHeight: STEP_UP_HEIGHT,
            recessMode: getEffectiveRecessMode(),
            isTeacher
        });
    } catch (movementError) {
        console.error('[ASCraft] movement step failed', movementError);
    }
    streamOutdoorWeatherVisualsAroundPlayer(nowMs);
    if (activeCelestialBody === 'earth' && playerWorldPosition) {
        updateLastEarthSurfaceFaceHint(
            playerWorldPosition,
            movementController?.state?.currentCubeFace || lastEarthSurfaceFaceHint || null
        );
    }
    updatePlayerCoordsHud();
    saveCurrentSpawnState();
    const isActivelyMoving = !!movementController?.state?.isMoving
        || !!movementController?.state?.inputState?.forward
        || !!movementController?.state?.inputState?.backward
        || !!movementController?.state?.inputState?.left
        || !!movementController?.state?.inputState?.right;
    try {
        const highlightIntervalMs = Math.max(
            getCrosshairHighlightIntervalMs(),
            isActivelyMoving ? HIGHLIGHT_MIN_INTERVAL_WHILE_MOVING_MS : 0
        );
        if (!document.hidden && (highlightNowMs - lastHighlightTickAtMs >= highlightIntervalMs || lastHighlightTickAtMs === 0)) {
            lastHighlightTickAtMs = highlightNowMs;
            updateCrosshairBlockHighlight(highlightNowMs);
        }
    } catch (highlightError) {
        if (crosshairHighlightMesh) {
            crosshairHighlightMesh.visible = false;
        }
        console.warn('[ASCraft] crosshair highlight update failed', highlightError);
    }
    try {
        const skyRealNowMs = getSkyAnimationNowMs(nowMs);
        const skyNowMs = getSkySimulationNowMs(skyRealNowMs, frameDelta);
        if (!document.hidden && (lastSkyUpdateAtRealMs === 0 || (nowMs - lastSkyUpdateAtRealMs) >= SKY_UPDATE_MIN_INTERVAL_MS)) {
            lastSkyUpdateAtRealMs = nowMs;
            lastSkyAnimationTickAtMs = skyNowMs;
            updateSkySystem(frameDelta, skyNowMs, skyRealNowMs);
        }
    } catch (skyError) {
        console.error('[ASCraft] sky update failed', skyError);
    }
    if (!document.hidden && currentRoomId) {
        if (!skySystem && !skySystemBuildPromise && roomShellGroup) {
            queueProgressiveSceneStreaming();
        } else if (
            shouldStreamOutdoorWorldNow()
            && !localWorldBuildPromise
            && (!outdoorTerrainGroup || !earthLaunchPad || !earthRocketShuttle)
            && ((nowMs - lastSceneStreamAttemptAtMs) >= SCENE_STREAM_COOLDOWN_MS)
        ) {
            lastSceneStreamAttemptAtMs = nowMs;
            ensureTravelSceneProps()
                .then(() => ensureLocalWorldMeshes())
                .catch(() => { });
        }
    }
    try {
        renderer.render(scene, camera);
        if (cssLayerActive && cssRenderer) {
            cssRenderer.render(cssScene, camera);
        }
    } catch (renderError) {
        console.error('[ASCraft] render failed', renderError);
    }
    recordPerformanceFrame(Math.max(0.001, stableDelta) * 1000);
}

// Global hook to start
window._lecturasGameInitASCraft = initASCraft;

let minebloxInitialized = false;
async function guardedInitASCraft() {
    if (minebloxInitialized) return;
    minebloxInitialized = true;
    await initASCraft();
}
window._lecturasGameInitASCraft = guardedInitASCraft;

// --- Map HUD Implementation ---
let mapHUDOpen = false;
let mapHUDFaceRects = new Map();
let mapHUDMarkerHits = [];
const MAP_HUD_FACE_THEME = Object.freeze({
    top: { base: '#4fb94a', edge: '#2f7f2f', accent: '#84dd6d' },
    bottom: { base: '#b7d4f5', edge: '#6c89aa', accent: '#e5f2ff' },
    east: { base: '#2c91d2', edge: '#1e5f8e', accent: '#74c8ff' },
    west: { base: '#c68f46', edge: '#7d5b2c', accent: '#f3c67d' },
    north: { base: '#3d7f44', edge: '#255129', accent: '#8fcb75' },
    south: { base: '#727780', edge: '#42464d', accent: '#c0c4cc' }
});

function pathRoundRect(ctx, x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, width * 0.5, height * 0.5));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function drawMapHudPanel(ctx, w, h) {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#060c17');
    bg.addColorStop(1, '#0a1422');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const vignette = ctx.createRadialGradient(w * 0.5, h * 0.5, 24, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
    vignette.addColorStop(0, 'rgba(17,34,56,0)');
    vignette.addColorStop(1, 'rgba(2,6,12,0.72)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(116,186,255,0.34)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i += 1) {
        const y = 20 + (i * 16);
        ctx.beginPath();
        ctx.moveTo(18, y);
        ctx.lineTo(w - 18, y);
        ctx.stroke();
    }
}

function drawFaceTile(ctx, rect, faceId, faceLabel) {
    const theme = MAP_HUD_FACE_THEME[faceId] || MAP_HUD_FACE_THEME.top;
    const grad = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
    grad.addColorStop(0, theme.accent);
    grad.addColorStop(1, theme.base);
    pathRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 9);
    ctx.fillStyle = grad;
    ctx.fill();

    // Pixel-grid overlay to keep voxel style but with cleaner tactical readability.
    const step = Math.max(6, Math.floor(rect.w / 16));
    ctx.save();
    pathRoundRect(ctx, rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2, 8);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (let x = rect.x + step; x < rect.x + rect.w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, rect.y);
        ctx.lineTo(x, rect.y + rect.h);
        ctx.stroke();
    }
    for (let y = rect.y + step; y < rect.y + rect.h; y += step) {
        ctx.beginPath();
        ctx.moveTo(rect.x, y);
        ctx.lineTo(rect.x + rect.w, y);
        ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = theme.edge;
    ctx.lineWidth = 2;
    pathRoundRect(ctx, rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1, 9);
    ctx.stroke();

    ctx.fillStyle = 'rgba(2,10,20,0.62)';
    pathRoundRect(ctx, rect.x + 4, rect.y + 4, rect.w - 8, 20, 6);
    ctx.fill();
    ctx.fillStyle = '#edf5ff';
    ctx.font = '700 10px "Trebuchet MS", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(faceLabel, rect.x + (rect.w * 0.5), rect.y + 18);
}

function drawMapConnectionLinks(ctx, faceLayout) {
    const getCenter = (face) => {
        const rect = faceLayout.get(face);
        if (!rect) return null;
        return { x: rect.x + (rect.w * 0.5), y: rect.y + (rect.h * 0.5) };
    };
    const links = [
        ['top', 'south'],
        ['south', 'east'],
        ['south', 'west'],
        ['south', 'north'],
        ['south', 'bottom']
    ];
    ctx.strokeStyle = 'rgba(107,187,255,0.48)';
    ctx.lineWidth = 2;
    links.forEach(([a, b]) => {
        const pa = getCenter(a);
        const pb = getCenter(b);
        if (!pa || !pb) return;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
    });
}

function drawZoneMarker(ctx, point, zone, isVehicle = false) {
    const color = zone.color || '#f8fafc';
    const size = isVehicle ? 8 : 6.5;
    ctx.fillStyle = '#04101f';
    ctx.beginPath();
    ctx.arc(point.x + 1, point.y + 1, size + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e8f3ff';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.fillStyle = '#f8fbff';
    ctx.font = '700 9px "Trebuchet MS", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(zone.label || zone.id, point.x, point.y - (size + 8));
}

function drawPlayerMarker(ctx, point) {
    ctx.strokeStyle = 'rgba(169,230,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(point.x, point.y, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0b1422';
    ctx.lineWidth = 2;
    ctx.stroke();
}

function toggleMapHUD(force = null) {
    mapHUDOpen = force !== null ? force : !mapHUDOpen;
    const mapEl = document.getElementById('minebloxMapHUD');
    if (mapEl) {
        mapEl.style.display = mapHUDOpen ? 'flex' : 'none';
        if (mapHUDOpen) renderMapHUD();
    }
}

function renderMapHUD() {
    const canvas = document.getElementById('minebloxMapCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;

    const faceLayout = (() => {
        const faceSize = Math.floor(Math.min(w / 4.4, h / 3.15));
        const startX = Math.floor((w - (faceSize * 4)) * 0.5);
        const startY = Math.floor((h - (faceSize * 3)) * 0.5);
        return new Map([
            ['top', { x: startX + faceSize, y: startY, w: faceSize, h: faceSize }],
            ['west', { x: startX, y: startY + faceSize, w: faceSize, h: faceSize }],
            ['south', { x: startX + faceSize, y: startY + faceSize, w: faceSize, h: faceSize }],
            ['east', { x: startX + (faceSize * 2), y: startY + faceSize, w: faceSize, h: faceSize }],
            ['north', { x: startX + (faceSize * 3), y: startY + faceSize, w: faceSize, h: faceSize }],
            ['bottom', { x: startX + faceSize, y: startY + (faceSize * 2), w: faceSize, h: faceSize }]
        ]);
    })();
    mapHUDFaceRects = faceLayout;
    mapHUDMarkerHits = [];

    const faceLabels = {
        top: 'CIMA / SALON',
        bottom: 'NIEVE',
        east: 'OCEANO',
        west: 'CANCHAS',
        north: 'BOSQUE',
        south: 'VOLCAN'
    };
    drawMapHudPanel(ctx, w, h);
    drawMapConnectionLinks(ctx, faceLayout);
    faceLayout.forEach((rect, faceId) => {
        drawFaceTile(ctx, rect, faceId, faceLabels[faceId] || String(faceId).toUpperCase());
    });

    const radius = OUTDOOR_WORLD_RADIUS;
    const toFacePoint = (faceId, u, v) => {
        const rect = faceLayout.get(faceId);
        if (!rect) return null;
        const uu = THREE.MathUtils.clamp(Number(u || 0), -radius, radius);
        const vv = THREE.MathUtils.clamp(Number(v || 0), -radius, radius);
        return {
            x: rect.x + (((uu + radius) / (radius * 2)) * rect.w),
            y: rect.y + (((vv + radius) / (radius * 2)) * rect.h)
        };
    };

    const zones = buildCubeFastTravelZones();
    zones.forEach((zone) => {
        const point = toFacePoint(zone.face, zone.u, zone.v);
        if (!point) return;
        const isVehicle = zone.id === 'zone_raft' || zone.id === 'zone_caravel';
        mapHUDMarkerHits.push({
            id: zone.id,
            face: zone.face,
            u: zone.u,
            v: zone.v,
            x: point.x,
            y: point.y,
            radius: isVehicle ? 12 : 10
        });
        drawZoneMarker(ctx, point, zone, isVehicle);
    });

    if (camera) {
        const preferredFace = movementController?.state?.currentCubeFace || lastEarthSurfaceFaceHint || 'top';
        const local = cubeFaceWorldToLocal(camera.position, preferredFace);
        const point = toFacePoint(local.face, local.u, local.v);
        if (point) {
            drawPlayerMarker(ctx, point);
        }
    }

    ctx.fillStyle = 'rgba(8,18,33,0.78)';
    pathRoundRect(ctx, 12, h - 44, w - 24, 30, 8);
    ctx.fill();
    ctx.fillStyle = '#cfe3ff';
    ctx.font = '600 10px "Trebuchet MS", "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Click en una cara o POI para viaje rapido | Nodo blanco: tu posicion actual', 18, h - 24);
}

function handleMapHUDClick(e) {
    const canvas = document.getElementById('minebloxMapCanvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const my = ((e.clientY - rect.top) / rect.height) * canvas.height;

    const marker = mapHUDMarkerHits.find((hit) => Math.hypot(mx - hit.x, my - hit.y) <= Number(hit.radius || 14));
    if (marker) {
        const targetState = getSpawnStateForCubeFacePoint(marker.face, marker.u, marker.v, {
            eyeOffset: PLAYER_EYE_HEIGHT + 0.35
        });
        applyPlayerSpawnState(targetState, { persist: false });
        toggleMapHUD(false);
        return;
    }

    let targetFace = null;
    let targetRect = null;
    mapHUDFaceRects.forEach((rectInfo, faceId) => {
        if (targetFace) return;
        if (mx >= rectInfo.x && mx <= (rectInfo.x + rectInfo.w) && my >= rectInfo.y && my <= (rectInfo.y + rectInfo.h)) {
            targetFace = faceId;
            targetRect = rectInfo;
        }
    });
    if (!targetFace || !targetRect) return;

    const localU = (((mx - targetRect.x) / targetRect.w) * OUTDOOR_WORLD_RADIUS * 2) - OUTDOOR_WORLD_RADIUS;
    const localV = (((my - targetRect.y) / targetRect.h) * OUTDOOR_WORLD_RADIUS * 2) - OUTDOOR_WORLD_RADIUS;
    const targetState = getSpawnStateForCubeFacePoint(targetFace, localU, localV, {
        eyeOffset: PLAYER_EYE_HEIGHT + 0.35
    });
    applyPlayerSpawnState(targetState, { persist: false });
    toggleMapHUD(false);
}
