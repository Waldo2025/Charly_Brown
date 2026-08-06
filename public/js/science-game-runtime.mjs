let PhaserModule = null;
let AnimeModule = null;
const EVIDENCE_CHECK_ANIMATION_MS = 2200;
const GAMEPLAY_FEEDBACK_READING_MS = 4000;

async function loadPhaser() {
  if (PhaserModule) return PhaserModule;
  const source = globalThis.SCIENCE_PHASER_URL || "../vendor/phaser/phaser.esm.js";
  PhaserModule = await import(source);
  return PhaserModule;
}

async function loadAnime() {
  if (AnimeModule) return AnimeModule;
  const source = globalThis.SCIENCE_ANIME_URL || "../vendor/animejs/anime.esm.min.js";
  AnimeModule = await import(source);
  return AnimeModule;
}

async function playScienceProbeEffect(surface) {
  if (!(surface instanceof Element) || !surface.isConnected) return;
  const effect = document.createElement("div");
  effect.className = "science-validation-probe";
  effect.dataset.visualStyle = surface.closest("[data-visual-style]")?.dataset.visualStyle || "rive-kawaii-signal";
  effect.setAttribute("aria-hidden", "true");
  effect.innerHTML = `<i class="science-validation-probe-core"><b class="science-probe-tail"></b><svg viewBox="0 0 120 120" focusable="false"><path class="science-probe-frame" d="M60 8 103 33v54L60 112 17 87V33Z"/><path class="science-probe-panel" d="m60 25 28 16v38L60 95 32 79V41Z"/><path class="science-probe-cut" d="m45 57 10 10 21-24"/><circle class="science-probe-lens" cx="60" cy="60" r="10"/><circle class="science-probe-lens-shine" cx="56" cy="56" r="3"/></svg></i><i class="science-probe-orbit science-probe-orbit-a"></i><i class="science-probe-orbit science-probe-orbit-b"></i>${Array.from({ length: 18 }, () => "<span class=\"science-probe-spark\"></span>").join("")}`;
  surface.append(effect);
  if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    effect.remove();
    return;
  }
  const anime = AnimeModule || await loadAnime().catch(() => null);
  if (!anime || !effect.isConnected) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    effect.remove();
    return;
  }
  const probe = effect.querySelector(".science-validation-probe-core");
  const orbits = [...effect.querySelectorAll(".science-probe-orbit")];
  const sparks = [...effect.querySelectorAll(".science-probe-spark")];
  const surfaceWidth = Math.max(520, surface.getBoundingClientRect().width);
  const surfaceHeight = Math.max(320, surface.getBoundingClientRect().height);
  const startX = -surfaceWidth * .62;
  const startY = -Math.min(120, surfaceHeight * .18);
  anime.remove([effect, probe, ...orbits, ...sparks]);
  anime.set(probe, { opacity: 0, x: startX, y: startY, scale: .42, rotate: -34 });
  anime.set(orbits, { opacity: 0, scale: .45, rotate: 0 });
  anime.set(sparks, { opacity: 0, scale: .1, x: (_, index) => startX + index * 13, y: (_, index) => startY + Math.sin(index * 1.7) * 22 });
  await new Promise((resolve) => {
    const finish = () => { effect.remove(); resolve(); };
    const timeline = anime.createTimeline({ defaults: { ease: "out(4)" } });
    timeline
      .add(probe, { opacity: [0, 1], x: [startX, 0], y: [startY, 0], scale: [.42, 1], rotate: [-34, 0], duration: 720 }, 60)
      .add(sparks, { opacity: [0, .96, .55, 0], x: (_, index) => -150 + (index % 6) * 58, y: (_, index) => -96 + Math.floor(index / 6) * 86, scale: [.1, 1.2, .58, .08], duration: 880, delay: (_, index) => index * 36 }, 230)
      .add(orbits, { opacity: [0, .92], scale: [.2, 1], duration: 300 }, 620)
      .add(probe, { rotate: [0, 540], scale: [1, 1.13, 1], duration: 820, ease: "inOut(3)" }, 700)
      .add(orbits, { rotate: [0, 620], duration: 820, ease: "inOut(3)" }, 700)
      .add(effect, { opacity: [1, 0], duration: 160, onComplete: finish }, 1730);
    // Defensive fallback for runtimes that do not expose timeline callbacks.
    setTimeout(finish, 1980);
  });
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const readControl = (config, id, fallback) => {
  const control = (config.controls || []).find((item) => item.id === id);
  return Number(control?.value ?? fallback);
};

const colorInt = (value, fallback) => {
  const cleaned = String(value || "").replace("#", "");
  const parsed = Number.parseInt(cleaned, 16);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function drawKawaiiFace(scene, container, x, y, scale = 1) {
  const left = scene.add.ellipse(x - 13 * scale, y, 8 * scale, 12 * scale, 0x18343a);
  const right = scene.add.ellipse(x + 13 * scale, y, 8 * scale, 12 * scale, 0x18343a);
  const shineL = scene.add.circle(x - 15 * scale, y - 3 * scale, 2.2 * scale, 0xffffff);
  const shineR = scene.add.circle(x + 11 * scale, y - 3 * scale, 2.2 * scale, 0xffffff);
  const mouth = scene.add.arc(x, y + 14 * scale, 11 * scale, 15, 165, false, 0x18343a);
  container.add([left, right, shineL, shineR, mouth]);
}

const SCIENCE_MODELS = Object.freeze({
  "braking-motion": {
    label: "Frenado y desaceleración",
    run: (p) => {
      const initialVelocity = Math.max(0, p.initialVelocity ?? p.velocity ?? 20);
      const brakeForce = Math.max(0, p.brakeForce ?? 6000);
      const friction = Math.max(0, p.friction ?? 600);
      const mass = Math.max(.1, p.mass ?? 1000);
      const obstacleDistance = Math.max(.1, p.obstacleDistance ?? 25);
      const acceleration = -(brakeForce + friction) / mass;
      const stoppingDistance = initialVelocity ** 2 / Math.max(.01, 2 * Math.abs(acceleration));
      const finalVelocitySquared = Math.max(0, initialVelocity ** 2 + 2 * acceleration * obstacleDistance);
      const finalVelocity = Math.sqrt(finalVelocitySquared);
      return {
        acceleration,
        initialVelocity,
        stoppingDistance,
        finalVelocity,
        obstacleDistance,
        safeStop: stoppingDistance <= obstacleDistance,
        formula: `a = -(Ff + Fr)/m = ${acceleration.toFixed(2)} m/s²; d = v²/(2|a|) = ${stoppingDistance.toFixed(1)} m`
      };
    }
  },
  "newton-motion": {
    label: "Dinámica de Newton",
    run: (p) => {
      const force = p.force ?? 55;
      const friction = p.friction ?? p.resistance ?? 25;
      const mass = Math.max(.1, p.mass ?? 10);
      const acceleration = (force - friction) / mass;
      return { acceleration, traction: clamp(1 - friction / Math.max(1, force + friction), .16, .92), formula: `a = (F - Fr) / m = ${acceleration.toFixed(2)} m/s²` };
    }
  },
  "uniform-motion": {
    label: "Movimiento rectilíneo uniforme",
    run: (p) => {
      const velocity = Math.max(0, p.velocity ?? p.speed ?? p.initialVelocity ?? 10);
      const time = Math.max(.1, p.time ?? p.duration ?? 5);
      const distance = velocity * time;
      return {
        acceleration: 0,
        velocity,
        time,
        distance,
        formula: `x = v·t = ${velocity.toFixed(1)} m/s · ${time.toFixed(1)} s = ${distance.toFixed(1)} m`
      };
    }
  },
  "gravity-fall": {
    label: "Caída gravitatoria",
    run: (p) => {
      const height = Math.max(.1, p.height ?? 35);
      const gravity = Math.max(.01, p.gravity ?? 9.81);
      const mass = Math.max(.01, p.mass ?? 10);
      const fallTime = Math.sqrt((2 * height) / gravity);
      const impactVelocity = gravity * fallTime;
      return {
        acceleration: gravity,
        height,
        gravity,
        mass,
        fallTime,
        impactVelocity,
        formula: `t = √(2h/g) = ${fallTime.toFixed(2)} s; v = g·t = ${impactVelocity.toFixed(1)} m/s`
      };
    }
  },
  "circular-motion": {
    label: "Movimiento circular",
    run: (p) => {
      const velocity = Math.max(0, p.velocity ?? p.speed ?? 6);
      const radius = Math.max(.1, p.radius ?? 8);
      const mass = Math.max(.01, p.mass ?? 12);
      const frictionCoefficient = clamp(p.frictionCoefficient ?? p.friction ?? .7, 0, 2);
      const gravity = Math.max(.01, p.gravity ?? 9.81);
      const angularVelocity = velocity / radius;
      const centripetalAcceleration = velocity ** 2 / radius;
      const centripetalForce = mass * centripetalAcceleration;
      const maxStaticFriction = frictionCoefficient * mass * gravity;
      const stabilityMargin = maxStaticFriction - centripetalForce;
      return {
        acceleration: centripetalAcceleration,
        velocity,
        radius,
        mass,
        frictionCoefficient,
        gravity,
        angularVelocity,
        centripetalAcceleration,
        centripetalForce,
        maxStaticFriction,
        stabilityMargin,
        stableOrbit: stabilityMargin >= 0,
        formula: `Fc = m·v²/r = ${centripetalForce.toFixed(1)} N; Ff,máx = μs·m·g = ${maxStaticFriction.toFixed(1)} N`
      };
    }
  },
  "projectile-motion": {
    label: "Movimiento parabólico",
    run: (p) => {
      const velocity = (p.power ?? p.velocity ?? 55) / 4;
      const angle = (p.angle ?? 45) * Math.PI / 180;
      const gravity = Math.max(.1, p.gravity ?? 9.81);
      const range = velocity ** 2 * Math.sin(2 * angle) / gravity;
      return { acceleration: velocity / 5, gravity, range, formula: `R = v²·sen(2θ)/g = ${range.toFixed(1)} m` };
    }
  },
  "ohm-circuit": {
    label: "Ley de Ohm",
    run: (p) => {
      const voltage = p.voltage ?? 12;
      const resistance = Math.max(.1, p.resistance ?? 6);
      const current = voltage / resistance;
      return { acceleration: current, energy: voltage * current, formula: `I = V/R = ${current.toFixed(2)} A` };
    }
  },
  "energy-work": {
    label: "Energía mecánica",
    run: (p) => {
      const energy = (p.mass ?? 10) * (p.gravity ?? 9.81) * (p.height ?? 5);
      return { acceleration: (p.gravity ?? 9.81) / 3, energy, formula: `Ep = m·g·h = ${energy.toFixed(1)} J` };
    }
  },
  "wave-motion": {
    label: "Propagación de ondas",
    run: (p) => {
      const speed = (p.frequency ?? 10) * (p.wavelength ?? 3);
      return { acceleration: speed / 10, amplitude: p.amplitude ?? 2, formula: `v = f·λ = ${speed.toFixed(1)} m/s` };
    }
  },
  "fluid-pressure": {
    label: "Presión de fluidos",
    run: (p) => {
      const pressure = (p.force ?? 40) / Math.max(.1, p.area ?? 4);
      return { acceleration: pressure / 5, buoyancy: (p.density ?? 1000) / 1000, formula: `P = F/A = ${pressure.toFixed(1)} Pa` };
    }
  },
  "optics-refraction": {
    label: "Refracción",
    run: (p) => {
      const incident = (p.angle ?? 35) * Math.PI / 180;
      const refracted = Math.asin(clamp(Math.sin(incident) / Math.max(1, p.refractiveIndex ?? 1.5), -1, 1));
      return { acceleration: 2, angle: refracted * 180 / Math.PI, formula: `n₁·sen θ₁ = n₂·sen θ₂; θ₂ = ${(refracted * 180 / Math.PI).toFixed(1)}°` };
    }
  },
  "particle-collision": {
    label: "Teoría cinético-molecular",
    run: (p) => {
      const rate = Math.sqrt(Math.max(1, p.temperature ?? 300) / 273) * (p.particleCount ?? 20);
      return { acceleration: clamp(rate / 8, 1.2, 5), collisionRate: rate, formula: `Colisiones relativas = ${rate.toFixed(1)}` };
    }
  },
  stoichiometry: {
    label: "Estequiometría",
    run: (p) => {
      const product = Math.min((p.reagentA ?? 2) / Math.max(.1, p.ratioA ?? 2), (p.reagentB ?? 3) / Math.max(.1, p.ratioB ?? 1));
      return { acceleration: 1.5 + product, product, formula: `Producto posible = ${product.toFixed(2)} mol` };
    }
  },
  "solution-concentration": {
    label: "Concentración",
    run: (p) => {
      const concentration = (p.solute ?? 1) / Math.max(.01, p.volume ?? 1);
      return { acceleration: 1 + concentration, concentration, formula: `C = n/V = ${concentration.toFixed(2)} mol/L` };
    }
  },
  "cell-transport": {
    label: "Transporte celular",
    run: (p) => {
      const flux = ((p.outside ?? 80) - (p.inside ?? 30)) * (p.permeability ?? .5);
      return { acceleration: clamp(Math.abs(flux) / 12, 1, 5), flux, formula: `Flujo relativo = ΔC·P = ${flux.toFixed(1)}` };
    }
  },
  "cell-energy": {
    label: "Respiración celular",
    run: (p) => {
      const energy = Math.min(p.nutrients ?? 60, p.oxygen ?? 60) * .6;
      return { acceleration: clamp(energy / 12, 1, 5), energy, formula: `ATP relativo = ${energy.toFixed(0)}%` };
    }
  },
  "ecosystem-balance": {
    label: "Equilibrio ecológico",
    run: (p) => {
      const balance = clamp(100 - (Math.abs((p.sunlight ?? 60) - (p.water ?? 60)) + Math.abs((p.water ?? 60) - (p.biodiversity ?? 50))) / 2, 0, 100);
      return { acceleration: clamp(balance / 25, 1, 4), balance, formula: `Estabilidad del sistema = ${balance.toFixed(0)}%` };
    }
  },
  "genetics-probability": {
    label: "Probabilidad genética",
    run: (p) => {
      const probability = (p.dominant ?? 1) / Math.max(1, (p.dominant ?? 1) + (p.recessive ?? 1));
      return { acceleration: 1.5 + probability * 3, probability, formula: `P(fenotipo) = ${(probability * 100).toFixed(0)}%` };
    }
  }
});

const PLAYABLE_VISUAL_THEMES = Object.freeze({
  soft: {
    background: "#eafaf6", panel: "#fff9f0", surface: "#d7f4eb", grid: "#b9ded5",
    text: "#17324a", muted: "#486678", highlight: "#ffcf6b", danger: "#d95768",
    font: "Trebuchet MS", decoration: "bubbles"
  },
  technical: {
    background: "#eef3f5", panel: "#ffffff", surface: "#dbe5e9", grid: "#aebfc7",
    text: "#172733", muted: "#536875", highlight: "#f3b83f", danger: "#c84655",
    font: "Arial", decoration: "blueprint"
  },
  pixel: {
    background: "#101936", panel: "#202952", surface: "#303b6c", grid: "#485486",
    text: "#fff7d6", muted: "#bbc4ee", highlight: "#ffcf3f", danger: "#ff5f78",
    font: "Courier New", decoration: "scanlines"
  },
  gouache: {
    background: "#fff1dc", panel: "#fffaf2", surface: "#e8d8c4", grid: "#d6bfa6",
    text: "#3b3440", muted: "#6c6170", highlight: "#ef9f62", danger: "#c95767",
    font: "Georgia", decoration: "paint"
  },
  cosmic: {
    background: "#111a42", panel: "#222b60", surface: "#343879", grid: "#53528f",
    text: "#fff8ff", muted: "#d0c9ef", highlight: "#ff9ed2", danger: "#ff647c",
    font: "Trebuchet MS", decoration: "stars"
  },
  natural: {
    background: "#e7f2d8", panel: "#f8f7e9", surface: "#c8d8ae", grid: "#9eb487",
    text: "#26382b", muted: "#536a54", highlight: "#f2bd58", danger: "#c65354",
    font: "Verdana", decoration: "leaves"
  },
  paper: {
    background: "#f7e7c8", panel: "#fffaf0", surface: "#e5cfad", grid: "#c7a982",
    text: "#3c3027", muted: "#746456", highlight: "#d9875d", danger: "#b94e4e",
    font: "Georgia", decoration: "paper"
  },
  neon: {
    background: "#04131f", panel: "#0b2638", surface: "#12384e", grid: "#14516a",
    text: "#eaffff", muted: "#9ccbd3", highlight: "#ffe66d", danger: "#ff4f7b",
    font: "Courier New", decoration: "circuit"
  },
  ocean: {
    background: "#d9f5f7", panel: "#f4ffff", surface: "#a8dce2", grid: "#79bac4",
    text: "#123b4a", muted: "#477482", highlight: "#ffb45f", danger: "#d95768",
    font: "Trebuchet MS", decoration: "waves"
  }
});

function resolveScienceModel(payload = {}) {
  const requested = payload.assessment?.experiment?.modelId || payload.profile?.modelId || payload.gameplay?.modelId;
  const normalizedSubject = String(payload.subject || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  const subjectKey = normalizedSubject === "physics" || normalizedSubject.includes("fisica")
    ? "physics"
    : normalizedSubject === "chemistry" || normalizedSubject.includes("quimica")
      ? "chemistry"
      : normalizedSubject === "biology" || normalizedSubject.includes("biologia")
        ? "biology"
        : "";
  const allowedModels = {
    physics: new Set(["braking-motion", "gravity-fall", "circular-motion", "newton-motion", "uniform-motion", "projectile-motion", "ohm-circuit", "energy-work", "wave-motion", "fluid-pressure", "optics-refraction"]),
    chemistry: new Set(["particle-collision", "stoichiometry", "solution-concentration"]),
    biology: new Set(["cell-transport", "cell-energy", "ecosystem-balance", "genetics-probability"])
  };
  const identityText = `${payload.subject || ""} ${payload.topic || ""} ${payload.simulationType || ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (subjectKey === "physics" && /movimiento circular|fuerza centripeta|aceleracion centripeta|velocidad angular|plataforma giratoria|rotacion|orbita circular/.test(identityText)) {
    return "circular-motion";
  }
  if ((!subjectKey || subjectKey === "physics") && /movimiento rectilineo uniforme|(?:^|\s)mru(?:\s|$)|velocidad constante|rapidez constante/.test(identityText)) {
    return "uniform-motion";
  }
  if (SCIENCE_MODELS[requested] && (!subjectKey || allowedModels[subjectKey].has(requested))) return requested;
  const text = `${payload.subject || ""} ${payload.topic || ""} ${payload.simulationType || ""} ${payload.assessment?.prompt || ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (subjectKey === "physics") {
    if (/fren|deten|desaceler|distancia de parada|distancia de frenado|obstaculo|impacto/.test(text)) return "braking-motion";
    if (/movimiento rectilineo uniforme|(?:^|\s)mru(?:\s|$)|velocidad constante|rapidez constante/.test(text)) return "uniform-motion";
    if (/gravedad|caida libre|caer|peso gravitatorio/.test(text)) return "gravity-fall";
    if (/movimiento circular|fuerza centripeta|aceleracion centripeta|velocidad angular|plataforma giratoria|rotacion|orbita circular/.test(text)) return "circular-motion";
    if (/proyect|parabolic|trayectoria|lanzamiento|alcance|angulo de tiro/.test(text)) return "projectile-motion";
    if (/circuit|electric|ley de ohm|voltaje|corriente/.test(text)) return "ohm-circuit";
    if (/onda|sonido|frecuencia|longitud de onda/.test(text)) return "wave-motion";
    if (/optic|luz|refrac|reflexion|prisma/.test(text)) return "optics-refraction";
    if (/fluido|presion|pascal|arquimedes|flotacion/.test(text)) return "fluid-pressure";
    if (/energia mecanica|energia potencial|energia cinetica|trabajo|potencia/.test(text)) return "energy-work";
    return "newton-motion";
  }
  if (subjectKey === "chemistry") {
    if (/estequ|(?:^|\s)mol(?:\s|$)|reactivo limitante|proporcion quimica/.test(text)) return "stoichiometry";
    if (/disol|concentr|molaridad|(?:^|\s)ph(?:\s|$)|acido|base/.test(text)) return "solution-concentration";
    return "particle-collision";
  }
  if (subjectKey === "biology") {
    if (/(?:^|\s)(?:gen|genes|genetica)(?:\s|$)|herencia|(?:^|\s)adn(?:\s|$)|(?:^|\s)arn(?:\s|$)|alelo|cromosom/.test(text)) return "genetics-probability";
    if (/ecosistema|ecolog|poblac|cadena alimentaria|biodiversidad/.test(text)) return "ecosystem-balance";
    if (/respiracion celular|(?:^|\s)atp(?:\s|$)|fotosint/.test(text)) return "cell-energy";
    return "cell-transport";
  }
  if (/fren|deten|desaceler|distancia de parada|distancia de frenado|obstaculo|impacto/.test(text)) return "braking-motion";
  if (/movimiento rectilineo uniforme|(?:^|\s)mru(?:\s|$)|velocidad constante|rapidez constante/.test(text)) return "uniform-motion";
  if (/gravedad|caida libre|caer|peso gravitatorio/.test(text)) return "gravity-fall";
  if (/movimiento circular|fuerza centripeta|aceleracion centripeta|velocidad angular|plataforma giratoria|rotacion|orbita circular/.test(text)) return "circular-motion";
  if (/proyect|parabolic|trayectoria|lanzamiento|alcance|angulo de tiro/.test(text)) return "projectile-motion";
  if (/circuit|electric|ohm/.test(text)) return "ohm-circuit";
  if (/onda|sonido/.test(text)) return "wave-motion";
  if (/optic|luz|refrac/.test(text)) return "optics-refraction";
  if (/fluido|presion|pascal/.test(text)) return "fluid-pressure";
  if (/energia|trabajo|potencia/.test(text)) return "energy-work";
  if (/(?:^|\s)(?:gen|genes|genetica)(?:\s|$)|herencia|(?:^|\s)adn(?:\s|$)|(?:^|\s)arn(?:\s|$)|alelo|cromosom/.test(text)) return "genetics-probability";
  if (/ecosistema|ecolog|poblac|cadena/.test(text)) return "ecosystem-balance";
  if (/respir|atp|fotosint/.test(text)) return "cell-energy";
  if (/celula|membrana|osmosis|transporte/.test(text)) return "cell-transport";
  if (/estequ|mol|reaccion/.test(text)) return "stoichiometry";
  if (/disol|concentr|ph|acido|base/.test(text)) return "solution-concentration";
  if (/quim/.test(text)) return "particle-collision";
  if (/fuerza|friccion|rozamiento|inercia|movimiento|velocidad|aceleracion/.test(text)) return "newton-motion";
  return "newton-motion";
}

function evaluateScienceModel(payload = {}) {
  const id = resolveScienceModel(payload);
  const values = {
    ...Object.fromEntries((payload.controls || []).map((control) => [control.id, Number(control.value)])),
    ...(payload.experimentValues || {})
  };
  const model = SCIENCE_MODELS[id];
  return { id, label: model.label, ...model.run({ ...values, ...(payload.profile?.parameters || {}) }) };
}

function validateScienceObjective(result = {}, objective = {}) {
  const measured = Number(result[objective.metric]);
  const target = Number(objective.target);
  const tolerance = Math.max(0, Number(objective.tolerance || 0));
  if (!Number.isFinite(measured) || !Number.isFinite(target)) return false;
  if (objective.operator === "lessThan") return measured < target + tolerance;
  if (objective.operator === "between") return Math.abs(measured - target) <= tolerance;
  if (objective.operator === "absoluteGreaterThan") return Math.abs(measured) > target - tolerance;
  if (objective.operator === "equals") return Math.abs(measured - target) <= tolerance;
  return measured > target - tolerance;
}

class ScienceLabScene {
  constructor(Phaser, config, hooks) {
    this.Phaser = Phaser;
    this.configData = config;
    this.hooks = hooks;
    this.params = Object.fromEntries((config.controls || []).map((item) => [item.id, Number(item.value)]));
    this.running = false;
    this.elapsed = 0;
    this.velocity = 0;
    this.physicsScale = 5;
    this.trail = [];
  }

  sceneConfig() {
    const owner = this;
    return {
      key: "ScienceLab",
      preload() {
        owner.scene = this;
        const playerSprite = owner.configData.playerSprite;
        const source = playerSprite?.dataUrl || playerSprite?.src;
        if (!source) return;
        const columns = Math.max(1, Number(playerSprite.columns) || 4);
        const rows = Math.max(1, Number(playerSprite.rows) || 2);
        const width = Math.max(columns, Number(playerSprite.width) || 1536);
        const height = Math.max(rows, Number(playerSprite.height) || 1024);
        this.load.spritesheet("science-player-generated", source, {
          frameWidth: Math.floor(width / columns),
          frameHeight: Math.floor(height / rows)
        });
      },
      create() { owner.scene = this; owner.create(); },
      update(time, delta) { owner.update(time, delta); }
    };
  }

  create() {
    const s = this.scene;
    s.cameras.main.setZoom(4 / 3);
    s.cameras.main.centerOn(480, 270);
    s.cameras.main.setBackgroundColor("#c8f4ee");
    this.drawBackdrop();
    this.drawProfessionalEnvironment();
    const type = this.configData.simulationType || "friction";
    if (type === "gravity") this.createGravity();
    else if (type === "projectile") this.createProjectile();
    else if (type === "circuit") this.createCircuit();
    else if (type === "particles") this.createParticles();
    else if (type === "ecosystem") this.createEcosystem();
    else if (type === "energy") this.createEnergy();
    else if (type === "fluid") this.createFluid();
    else if (type === "wave") this.createWave();
    else if (type === "optics") this.createOptics();
    else if (type === "cell") this.createCell();
    else this.createFriction();
    this.createHud();
  }

  drawBackdrop() {
    const s = this.scene;
    const scenario = this.configData.scenario || {};
    const sky = colorInt(scenario.sky, 0xcaf4ee);
    const groundColor = colorInt(scenario.ground, 0x5bb8a9);
    const accent = colorInt(scenario.accent, 0xffc768);
    const biome = scenario.biome || "laboratory";
    const bg = s.add.graphics();
    bg.fillStyle(sky, 1).fillRect(0, 0, 960, 540);
    bg.fillStyle(accent, .16).fillCircle(810, 85, 92);
    bg.lineStyle(1, accent, .18);
    for (let x = 0; x <= 960; x += 48) bg.lineBetween(x, 0, x, 540);
    for (let y = 0; y <= 540; y += 48) bg.lineBetween(0, y, 960, y);
    this.drawScenarioDecor(biome, groundColor, accent);
    const missionBadges = {
      friction: "MISIÓN // DOMINA EL MOVIMIENTO",
      projectile: "MISIÓN // TRAZA LA TRAYECTORIA",
      circuit: "MISIÓN // ENCIENDE EL CIRCUITO",
      particles: "MISIÓN // ACTIVA LA MATERIA",
      ecosystem: "MISIÓN // RESTAURA EL EQUILIBRIO",
      energy: "MISIÓN // TRANSFORMA LA ENERGÍA",
      fluid: "MISIÓN // CONTROLA EL FLUJO",
      wave: "MISIÓN // SINCRONIZA LA ONDA",
      optics: "MISIÓN // GUÍA LA LUZ",
      cell: "MISIÓN // EXPLORA LA VIDA"
    };
    const badge = missionBadges[this.configData.simulationType] || "MISIÓN // DESCUBRE LA EVIDENCIA";
    s.add.text(936, 505, badge, {
      fontFamily: "Trebuchet MS", fontSize: "10px", fontStyle: "bold", color: "#173942", backgroundColor: "rgba(255,255,255,.68)", padding: { x: 9, y: 5 }
    }).setOrigin(1, 1).setAlpha(.86);
  }

  drawProfessionalEnvironment() {
    const s = this.scene;
    const type = this.configData.simulationType || "friction";
    const mode = this.configData.visualMode || "soft";
    const scenario = this.configData.scenario || {};
    const sky = colorInt(scenario.sky, 0xcaf4ee);
    const ground = colorInt(scenario.ground, 0x5bb8a9);
    const accent = colorInt(scenario.accent, 0xffc768);
    const darkScene = ["technical", "pixel", "cosmic", "neon"].includes(mode);
    const ink = darkScene ? 0xeafcff : 0x173942;
    const environment = s.add.container(0, 0).setDepth(-2);
    const atmosphere = s.add.graphics();

    atmosphere.fillGradientStyle(sky, sky, darkScene ? 0x12283a : 0xf8fffd, darkScene ? 0x0b1727 : 0xe4f4ef, 1);
    atmosphere.fillRect(0, 0, 960, 540);
    atmosphere.fillStyle(accent, darkScene ? .08 : .1).fillCircle(815, 92, 150);
    atmosphere.fillStyle(ground, darkScene ? .12 : .09).fillCircle(105, 185, 120);
    atmosphere.fillStyle(ink, darkScene ? .07 : .045).fillRect(0, 397, 960, 143);
    atmosphere.lineStyle(2, ink, darkScene ? .1 : .065);
    for (let y = 414; y < 540; y += 30) atmosphere.lineBetween(0, y, 960, y);
    for (let x = -80; x < 1040; x += 92) atmosphere.lineBetween(480, 397, x, 540);
    environment.add(atmosphere);

    const leftGlass = s.add.graphics();
    leftGlass.fillStyle(darkScene ? 0x071523 : 0xffffff, darkScene ? .38 : .44);
    leftGlass.fillRoundedRect(28, 150, 186, 196, 24);
    leftGlass.lineStyle(2, accent, darkScene ? .32 : .22).strokeRoundedRect(28, 150, 186, 196, 24);
    leftGlass.fillStyle(accent, .12).fillRoundedRect(44, 169, 154, 42, 12);
    leftGlass.lineStyle(3, accent, .25);
    for (let index = 0; index < 4; index += 1) {
      const y = 245 + index * 22;
      leftGlass.lineBetween(53, y, 53 + 28 + index * 23, y);
    }
    environment.add(leftGlass);

    const rightGlass = s.add.graphics();
    rightGlass.fillStyle(darkScene ? 0x071523 : 0xffffff, darkScene ? .32 : .38);
    rightGlass.fillRoundedRect(756, 154, 176, 184, 24);
    rightGlass.lineStyle(2, ground, darkScene ? .38 : .25).strokeRoundedRect(756, 154, 176, 184, 24);
    rightGlass.fillStyle(ground, .14).fillRoundedRect(774, 174, 140, 78, 14);
    rightGlass.lineStyle(2, accent, .35);
    rightGlass.lineBetween(792, 292, 897, 292);
    rightGlass.lineBetween(792, 306, 868, 306);
    environment.add(rightGlass);

    const addMonitorPulse = (x, y, color = accent) => {
      const pulse = s.add.circle(x, y, 4, color, .7);
      environment.add(pulse);
      s.tweens.add({ targets: pulse, alpha: .16, scale: 2.1, duration: 1150, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    };
    addMonitorPulse(68, 190);
    addMonitorPulse(790, 192, ground);

    const prop = s.add.graphics();
    if (type === "gravity") {
      prop.lineStyle(8, ink, .14).strokeCircle(488, 245, 112);
      prop.lineStyle(2, accent, .3).strokeCircle(488, 245, 82);
      prop.lineStyle(2, ground, .3).strokeCircle(488, 245, 54);
      prop.fillStyle(accent, .11).fillCircle(488, 245, 20);
      prop.lineStyle(3, ink, .16).lineBetween(488, 132, 488, 358);
      prop.lineBetween(375, 245, 601, 245);
    } else if (type === "projectile") {
      prop.fillStyle(ground, .14).fillTriangle(210, 397, 415, 226, 580, 397);
      prop.fillStyle(accent, .1).fillTriangle(488, 397, 690, 258, 865, 397);
      prop.lineStyle(3, accent, .26);
      let previousX = 270;
      let previousY = 358;
      for (let step = 1; step <= 14; step += 1) {
        const ratio = step / 14;
        const x = 270 + ratio * 430;
        const y = 358 - Math.sin(ratio * Math.PI) * 132;
        prop.lineBetween(previousX, previousY, x, y);
        previousX = x;
        previousY = y;
      }
    } else if (type === "circuit") {
      prop.lineStyle(10, ground, .12).strokeRoundedRect(270, 176, 420, 176, 38);
      prop.lineStyle(3, accent, .34).strokeRoundedRect(285, 191, 390, 146, 28);
      for (let index = 0; index < 6; index += 1) {
        prop.fillStyle(index % 2 ? accent : ground, .28).fillCircle(326 + index * 62, 264, 10);
        if (index < 5) prop.lineStyle(3, ink, .14).lineBetween(338 + index * 62, 264, 374 + index * 62, 264);
      }
    } else if (["particles", "cell"].includes(type)) {
      prop.fillStyle(ground, .1).fillCircle(490, 260, 142);
      prop.lineStyle(6, accent, .2).strokeCircle(490, 260, 142);
      prop.lineStyle(2, ink, .13).strokeCircle(490, 260, 96);
      for (let index = 0; index < 12; index += 1) {
        const angle = (Math.PI * 2 * index) / 12;
        prop.fillStyle(index % 2 ? accent : ground, .3).fillCircle(490 + Math.cos(angle) * 112, 260 + Math.sin(angle) * 112, 8);
      }
    } else if (type === "ecosystem") {
      prop.fillStyle(ground, .14).fillEllipse(490, 370, 510, 130);
      prop.lineStyle(5, ink, .11);
      for (let index = 0; index < 8; index += 1) {
        const x = 275 + index * 62;
        prop.lineBetween(x, 365, x, 280 - (index % 3) * 24);
        prop.strokeCircle(x, 263 - (index % 3) * 24, 24 + (index % 2) * 7);
      }
    } else if (type === "wave") {
      prop.lineStyle(5, accent, .26);
      let lastX = 235;
      let lastY = 270;
      for (let x = 240; x <= 720; x += 8) {
        const y = 270 + Math.sin(x / 28) * 72;
        prop.lineBetween(lastX, lastY, x, y);
        lastX = x;
        lastY = y;
      }
    } else if (type === "optics") {
      prop.fillStyle(ground, .12).fillTriangle(480, 174, 365, 350, 595, 350);
      prop.lineStyle(6, accent, .28).lineBetween(245, 235, 430, 275);
      prop.lineStyle(5, ground, .3).lineBetween(430, 275, 704, 206);
      prop.lineStyle(3, ink, .1).lineBetween(430, 150, 430, 375);
    } else {
      prop.fillStyle(ground, .09).fillRoundedRect(252, 184, 456, 165, 40);
      prop.lineStyle(4, accent, .2).strokeRoundedRect(252, 184, 456, 165, 40);
      prop.lineStyle(3, ink, .12).lineBetween(292, 310, 668, 310);
      prop.fillStyle(accent, .18).fillCircle(352, 252, 34);
      prop.fillStyle(ground, .18).fillCircle(480, 252, 34);
      prop.fillStyle(ink, .12).fillCircle(608, 252, 34);
    }
    environment.add(prop);

    for (let index = 0; index < 14; index += 1) {
      const particle = s.add.circle(
        245 + (index * 83) % 470,
        155 + (index * 47) % 190,
        1.8 + index % 3,
        index % 2 ? accent : ground,
        darkScene ? .38 : .22
      );
      environment.add(particle);
      s.tweens.add({
        targets: particle,
        y: particle.y - 16 - (index % 4) * 5,
        alpha: .06,
        duration: 1700 + index * 110,
        delay: index * 65,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut"
      });
    }

    const vignette = s.add.graphics();
    vignette.lineStyle(18, darkScene ? 0x020811 : 0xffffff, darkScene ? .28 : .25).strokeRoundedRect(8, 8, 944, 524, 28);
    environment.add(vignette);
  }

  drawScenarioDecor(biome, groundColor, accent) {
    const s = this.scene;
    const decor = s.add.graphics();
    if (biome === "space") {
      for (let i = 0; i < 34; i += 1) decor.fillStyle(i % 4 ? 0xffffff : accent, .75).fillCircle(30 + (i * 83) % 910, 25 + (i * 47) % 300, i % 3 + 1);
      decor.fillStyle(accent, .45).fillCircle(820, 150, 72).lineStyle(10, 0xffffff, .22).strokeEllipse(820, 150, 170, 38);
    } else if (biome === "ocean") {
      for (let i = 0; i < 18; i += 1) decor.lineStyle(3, 0xffffff, .22).strokeCircle(40 + (i * 73) % 900, 130 + (i * 61) % 310, 5 + (i % 4) * 3);
      decor.fillStyle(groundColor, .5).fillRect(0, 420, 960, 120);
    } else if (biome === "forest") {
      for (let i = 0; i < 12; i += 1) {
        const x = 20 + i * 88;
        decor.fillStyle(0x5b6b45, .7).fillRect(x, 320, 15, 130).fillStyle(groundColor, .75).fillCircle(x + 7, 300, 46);
      }
    } else if (biome === "city") {
      for (let i = 0; i < 11; i += 1) {
        const height = 75 + (i % 4) * 34;
        decor.fillStyle(i % 2 ? groundColor : accent, .26).fillRect(i * 92, 430 - height, 70, height);
      }
    } else if (biome === "microscopic") {
      for (let i = 0; i < 17; i += 1) {
        const x = 35 + (i * 113) % 900;
        const y = 120 + (i * 71) % 300;
        decor.fillStyle(i % 2 ? accent : groundColor, .18).fillCircle(x, y, 18 + (i % 4) * 7).lineStyle(2, 0xffffff, .28).strokeCircle(x, y, 10 + (i % 3) * 6);
      }
    } else if (biome === "volcanic") {
      decor.fillStyle(groundColor, .48).fillTriangle(40, 450, 260, 145, 480, 450).fillStyle(accent, .48).fillTriangle(190, 250, 260, 145, 325, 250);
      for (let i = 0; i < 12; i += 1) decor.fillStyle(accent, .45).fillCircle(240 + (i * 37) % 90, 115 - (i * 23) % 95, 5 + i % 5);
    } else if (biome === "arctic") {
      decor.fillStyle(0xffffff, .42).fillTriangle(0, 445, 160, 235, 330, 445).fillTriangle(260, 445, 510, 195, 720, 445).fillTriangle(590, 445, 800, 260, 960, 445);
    } else if (biome === "desert") {
      decor.fillStyle(groundColor, .42).fillCircle(180, 500, 230).fillCircle(550, 515, 275).fillCircle(890, 500, 210);
      decor.fillStyle(accent, .42).fillCircle(820, 135, 68);
    } else {
      for (let i = 0; i < 7; i += 1) {
        const x = 35 + i * 145;
        decor.lineStyle(4, accent, .18).strokeRoundedRect(x, 150 + (i % 2) * 45, 78, 110, 18);
        decor.fillStyle(groundColor, .2).fillCircle(x + 39, 205 + (i % 2) * 45, 22);
      }
    }
  }

  createHud() {
    const s = this.scene;
    s.add.roundedRect = (x, y, width, height, radius, color, alpha = 1) => {
      const g = s.add.graphics();
      g.fillStyle(color, alpha).fillRoundedRect(x, y, width, height, radius);
      return g;
    };
    s.add.roundedRect(24, 20, 640, 112, 18, 0x173942, .94);
    s.add.text(45, 34, this.configData.title || "Science Activity", { fontFamily: "Trebuchet MS", fontSize: "21px", fontStyle: "bold", color: "#f7fff5", wordWrap: { width: 590 } });
    s.add.text(46, 66, this.configData.mission || "Experimenta y encuentra la solución.", { fontFamily: "Trebuchet MS", fontSize: "12px", color: "#bde7df", wordWrap: { width: 585 }, maxLines: 3 });
    this.metricText = s.add.text(936, 28, "LISTO", { fontFamily: "Trebuchet MS", fontSize: "15px", fontStyle: "bold", color: "#173942", align: "right" }).setOrigin(1, 0);
    this.feedbackText = s.add.text(936, 54, this.configData.coachTips?.[0] || "Cambia una variable y observa.", { fontFamily: "Trebuchet MS", fontSize: "12px", color: "#315c62", align: "right", wordWrap: { width: 290 } }).setOrigin(1, 0);
  }

  createFriction() {
    const s = this.scene;
    this.ground = s.add.graphics();
    this.drawFrictionGround();
    s.add.text(70, 430, "INICIO", { fontFamily: "Trebuchet MS", fontSize: "11px", fontStyle: "bold", color: "#3b6266" });
    s.add.text(815, 430, "META", { fontFamily: "Trebuchet MS", fontSize: "11px", fontStyle: "bold", color: "#3b6266" });
    const flag = s.add.graphics();
    flag.lineStyle(6, 0x173942).lineBetween(842, 295, 842, 416);
    flag.fillStyle(0xff8068).fillTriangle(845, 300, 845, 345, 900, 322);
    this.actor = s.add.container(125, 362);
    const shadow = s.add.ellipse(0, 55, 120, 22, 0x173942, .18);
    const body = s.add.graphics();
    body.fillStyle(0xffc768).fillRoundedRect(-58, -40, 116, 90, 22);
    body.lineStyle(5, 0xffffff, .55).strokeRoundedRect(-52, -34, 104, 78, 18);
    body.fillStyle(0xff8068).fillCircle(-48, 33, 16).fillCircle(48, 33, 16);
    this.actor.add([shadow, body]);
    drawKawaiiFace(s, this.actor, 0, -5, 1);
    this.forceArrow = s.add.graphics();
    this.resistanceArrow = s.add.graphics();
    this.distanceText = s.add.text(125, 285, "0.0 m", { fontFamily: "Trebuchet MS", fontSize: "14px", fontStyle: "bold", color: "#173942" }).setOrigin(.5);
    s.tweens.add({ targets: this.actor, scaleY: .97, scaleX: 1.03, duration: 700, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    this.drawForceArrows();
  }

  drawFrictionGround() {
    const friction = this.params.friction ?? this.params.resistance ?? 45;
    const color = friction > 65 ? 0x9d826a : friction > 35 ? 0xc8a978 : 0x8ecfc0;
    this.ground.clear();
    this.ground.fillStyle(0x173942, .13).fillRoundedRect(45, 410, 870, 33, 14);
    this.ground.fillStyle(color).fillRoundedRect(50, 398, 860, 34, 12);
    this.ground.lineStyle(2, 0xffffff, .42);
    const gap = friction > 65 ? 13 : friction > 35 ? 28 : 48;
    for (let x = 70; x < 900; x += gap) this.ground.lineBetween(x, 405, x + 10, 424);
  }

  drawForceArrows() {
    const applied = this.params.force ?? 55;
    const resistance = this.params.friction ?? this.params.resistance ?? 45;
    this.forceArrow.clear().lineStyle(7, 0x4f90ff).lineBetween(190, 340, 190 + applied * 1.65, 340).fillStyle(0x4f90ff).fillTriangle(190 + applied * 1.65, 328, 190 + applied * 1.65, 352, 208 + applied * 1.65, 340);
    this.resistanceArrow.clear().lineStyle(7, 0xff8068).lineBetween(120, 390, 120 - resistance * 1.15, 390).fillStyle(0xff8068).fillTriangle(120 - resistance * 1.15, 378, 120 - resistance * 1.15, 402, 102 - resistance * 1.15, 390);
  }

  createProjectile() {
    const s = this.scene;
    const ground = s.add.graphics();
    ground.fillStyle(0x5bb8a9).fillRect(0, 430, 960, 110);
    ground.fillStyle(0x89d0a0).fillCircle(720, 430, 170);
    this.cannon = s.add.container(110, 400);
    const base = s.add.graphics().fillStyle(0x334c61).fillCircle(0, 0, 38);
    this.barrel = s.add.graphics().fillStyle(0xffc768).fillRoundedRect(0, -15, 100, 30, 14);
    this.cannon.add([base, this.barrel]);
    this.projectile = s.add.circle(155, 370, 18, 0xff8068);
    this.projectile.setStrokeStyle(5, 0xffffff, .55);
    this.target = s.add.graphics();
    this.target.fillStyle(0xffffff).fillCircle(790, 388, 48).fillStyle(0xff8068).fillCircle(790, 388, 33).fillStyle(0xffffff).fillCircle(790, 388, 17);
    this.resetProjectile();
  }

  resetProjectile() {
    if (!this.projectile) return;
    const angle = this.params.angle ?? 45;
    const rad = -angle * Math.PI / 180;
    this.cannon?.setRotation(rad);
    this.projectile.setPosition(145, 370);
    this.velocityX = 0;
    this.velocityY = 0;
    this.running = false;
    this.trail.forEach((dot) => dot.destroy());
    this.trail = [];
  }

  createGravity() {
    const s = this.scene;
    this.gravityGroundY = 438;
    s.add.rectangle(690, 286, 18, 306, 0x315c62, .2);
    s.add.rectangle(690, this.gravityGroundY, 225, 14, 0x315c62, .32);
    for (let index = 0; index <= 5; index += 1) {
      const markerY = this.gravityGroundY - index * 55;
      s.add.line(0, 678, markerY, 704, markerY, 0x315c62, .42).setLineWidth(2);
      s.add.text(716, markerY - 8, `${index * 10} m`, { fontFamily: "Trebuchet MS", fontSize: "12px", color: "#315c62" });
    }
    this.gravityGlow = s.add.circle(625, 150, 44, 0xff8068, .14);
    this.gravityObject = s.add.circle(625, 150, 24, 0xff8068).setStrokeStyle(6, 0xffffff, .82);
    this.gravityCore = s.add.circle(625, 150, 8, 0xffffff, .72);
    this.gravityShadow = s.add.ellipse(625, this.gravityGroundY - 4, 76, 15, 0x173942, .14);
    s.tweens.add({ targets: this.gravityGlow, scale: 1.25, alpha: .05, duration: 850, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    this.resetGravity();
  }

  resetGravity() {
    if (!this.gravityObject) return;
    const height = Math.max(1, this.params.height ?? 35);
    const mass = Math.max(1, this.params.mass ?? 10);
    this.gravityStartY = this.gravityGroundY - Math.min(280, height * this.physicsScale);
    this.gravityObject.setPosition(625, this.gravityStartY);
    this.gravityGlow?.setPosition(625, this.gravityStartY);
    this.gravityCore?.setPosition(625, this.gravityStartY);
    this.gravityObject.setRadius(clamp(15 + Math.sqrt(mass), 17, 32));
    this.gravityVelocity = 0;
    this.gravityElapsed = 0;
    this.running = false;
    this.metricText?.setText("LISTO");
  }

  createCircuit() {
    const s = this.scene;
    const board = s.add.graphics();
    board.fillStyle(0x173942, .94).fillRoundedRect(110, 150, 740, 310, 30);
    board.lineStyle(12, 0xffc768).strokeRoundedRect(185, 220, 590, 165, 42);
    board.fillStyle(0x7ad8ce).fillRoundedRect(145, 270, 85, 70, 12);
    s.add.text(166, 291, "+  −", { fontFamily: "Trebuchet MS", fontSize: "23px", fontStyle: "bold", color: "#173942" });
    this.bulbGlow = s.add.circle(766, 300, 76, 0xffef91, .22);
    this.bulb = s.add.circle(766, 300, 44, 0xffef91, .6);
    this.bulb.setStrokeStyle(7, 0xffffff, .65);
    drawKawaiiFace(s, s.add.container(766, 300), 0, 0, .75);
    this.electrons = Array.from({ length: 13 }, (_, index) => s.add.circle(225 + index * 42, 220, 6, 0x48d8c8));
    this.updateCircuitVisual();
  }

  updateCircuitVisual() {
    const voltage = this.params.voltage ?? 6;
    const resistance = Math.max(1, this.params.resistance ?? 10);
    this.current = voltage / resistance;
    const glow = clamp(this.current / 1.4, .08, 1);
    this.bulb?.setFillStyle(0xffef91, .3 + glow * .7);
    this.bulbGlow?.setScale(.75 + glow * .7).setAlpha(.1 + glow * .36);
  }

  createParticles() {
    const s = this.scene;
    const chamber = s.add.graphics();
    chamber.fillStyle(0x173942, .88).fillRoundedRect(150, 135, 660, 330, 32);
    chamber.lineStyle(5, 0xffffff, .25).strokeRoundedRect(150, 135, 660, 330, 32);
    const count = clamp(Math.round(this.params.particleCount ?? 24), 10, 45);
    this.particles = Array.from({ length: count }, (_, index) => {
      const colors = [0xff8068, 0x48d8c8, 0xffc768, 0x8e85ff];
      const particle = s.add.circle(190 + Math.random() * 580, 175 + Math.random() * 250, 11, colors[index % colors.length]);
      particle.vx = (Math.random() - .5) * 2;
      particle.vy = (Math.random() - .5) * 2;
      return particle;
    });
    s.add.text(480, 485, "CÁMARA DE PARTÍCULAS", { fontFamily: "Trebuchet MS", fontSize: "13px", fontStyle: "bold", color: "#315c62" }).setOrigin(.5);
  }

  createEcosystem() {
    const s = this.scene;
    const land = s.add.graphics();
    land.fillStyle(0x72c594).fillRect(0, 370, 960, 170);
    land.fillStyle(0x5bb8a9).fillCircle(180, 430, 190).fillCircle(790, 430, 230);
    this.sun = s.add.circle(820, 145, 58, 0xffd769);
    s.add.circle(800, 135, 5, 0x173942); s.add.circle(838, 135, 5, 0x173942);
    s.add.arc(819, 155, 18, 20, 160, false, 0x173942);
    this.plants = [];
    this.animals = [];
    this.rebuildEcosystem();
  }

  createEnergy() {
    const s = this.scene;
    const variant = this.configData.variant || "potential";
    this.energyVariant = variant;
    this.energyGraphics = s.add.graphics();
    if (variant === "work" || variant === "power") {
      this.energyGraphics.lineStyle(9, 0x334c61).lineBetween(480, 150, 480, 440);
      this.energyGraphics.fillStyle(0xffc768).fillCircle(480, 175, 38);
      this.energyGraphics.lineStyle(5, 0xffffff, .75).strokeCircle(480, 175, 24);
      this.energyGraphics.lineStyle(6, 0x334c61).lineBetween(480, 175, 700, 175).lineBetween(700, 175, 700, 390);
      this.energyActor = s.add.container(700, 390);
      const load = s.add.graphics().fillStyle(0x8e85ff).fillRoundedRect(-55, -36, 110, 72, 18);
      this.energyActor.add(load);
      drawKawaiiFace(s, this.energyActor, 0, -2, .85);
      s.add.text(185, 355, "OPERADOR", { fontFamily: "Trebuchet MS", fontSize: "13px", fontStyle: "bold", color: "#173942" });
      const robot = s.add.text(210, 375, "🤖", { fontSize: "70px" }).setOrigin(.5);
      s.tweens.add({ targets: robot, angle: 5, duration: 550, yoyo: true, repeat: -1 });
    } else {
      this.energyGraphics.fillStyle(0x79c9b9).fillTriangle(150, 420, 690, 420, 690, 180);
      this.energyGraphics.lineStyle(10, 0xffffff, .65).lineBetween(175, 400, 675, 195);
      this.energyActor = s.add.circle(235, 375, 31, 0xff8068);
      this.energyActor.setStrokeStyle(7, 0xffffff, .58);
      this.energyStart = { x: 235, y: 375 };
      this.energyVx = 0;
      this.energyVy = 0;
      s.add.text(720, 392, "ZONA DE MEDICIÓN", { fontFamily: "Trebuchet MS", fontSize: "12px", fontStyle: "bold", color: "#173942" });
    }
  }

  createFluid() {
    const s = this.scene;
    const variant = this.configData.variant || "hydraulic";
    this.fluidVariant = variant;
    const tank = s.add.graphics();
    tank.fillStyle(0x3faabd, .62).fillRoundedRect(130, 210, 700, 255, 28);
    tank.lineStyle(8, 0xffffff, .56).strokeRoundedRect(130, 210, 700, 255, 28);
    if (variant === "hydraulic") {
      tank.fillStyle(0x334c61).fillRect(190, 175, 125, 55).fillRect(640, 120, 150, 110);
      tank.fillStyle(0xffc768).fillRoundedRect(655, 80, 120, 55, 13);
      this.leftPiston = s.add.rectangle(252, 210, 105, 18, 0xff8068);
      this.rightPiston = s.add.rectangle(715, 210, 132, 18, 0xc4f05c);
      s.add.text(202, 260, "FUERZA\nAPLICADA", { fontFamily: "Trebuchet MS", fontSize: "12px", fontStyle: "bold", color: "#ffffff", align: "center" });
      s.add.text(660, 260, "CARGA\nELEVADA", { fontFamily: "Trebuchet MS", fontSize: "12px", fontStyle: "bold", color: "#ffffff", align: "center" });
    } else {
      this.floatObject = s.add.container(480, 270);
      const object = s.add.graphics().fillStyle(0xffc768).fillRoundedRect(-58, -38, 116, 76, 20);
      this.floatObject.add(object);
      drawKawaiiFace(s, this.floatObject, 0, -2, .85);
      this.waterLine = s.add.text(480, 425, "EMPUJE DEL FLUIDO", { fontFamily: "Trebuchet MS", fontSize: "13px", fontStyle: "bold", color: "#eaffff" }).setOrigin(.5);
    }
  }

  createWave() {
    const s = this.scene;
    this.waveGraphics = s.add.graphics();
    this.wavePhase = 0;
    s.add.text(85, 180, "FUENTE", { fontFamily: "Trebuchet MS", fontSize: "12px", fontStyle: "bold", color: "#173942" });
    this.waveSource = s.add.circle(110, 285, 42, 0xff8068);
    this.waveSource.setStrokeStyle(6, 0xffffff, .6);
    s.add.text(850, 180, "DETECTOR", { fontFamily: "Trebuchet MS", fontSize: "12px", fontStyle: "bold", color: "#173942" });
    this.waveDetector = s.add.rectangle(865, 285, 48, 170, 0x334c61);
    this.running = true;
  }

  createOptics() {
    const s = this.scene;
    this.opticsGraphics = s.add.graphics();
    this.opticsSource = s.add.circle(115, 315, 35, 0xffc768);
    this.opticsSource.setStrokeStyle(7, 0xffffff, .65);
    s.add.text(74, 365, "LUZ", { fontFamily: "Trebuchet MS", fontSize: "12px", fontStyle: "bold", color: "#173942" });
    this.prism = s.add.triangle(520, 300, 0, 150, 95, 0, 190, 150, 0x8e85ff, .42);
    this.prism.setStrokeStyle(7, 0xffffff, .7);
    this.drawOptics();
  }

  createCell() {
    const s = this.scene;
    this.cellBody = s.add.circle(500, 310, 180, 0x8ed8b4, .82);
    this.cellBody.setStrokeStyle(12, 0xffffff, .65);
    this.nucleus = s.add.circle(500, 310, 68, 0x8e85ff, .9);
    this.nucleus.setStrokeStyle(7, 0xffffff, .55);
    this.organelles = [];
    const colors = [0xff8068, 0xffc768, 0x48d8c8];
    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * Math.PI * 2;
      const organelle = s.add.ellipse(500 + Math.cos(angle) * 125, 310 + Math.sin(angle) * 105, 34, 18, colors[i % colors.length]);
      organelle.baseAngle = angle;
      this.organelles.push(organelle);
    }
    s.add.text(500, 304, "ADN", { fontFamily: "Trebuchet MS", fontSize: "15px", fontStyle: "bold", color: "#ffffff" }).setOrigin(.5);
    this.running = true;
  }

  rebuildEcosystem() {
    if (!this.scene) return;
    [...(this.plants || []), ...(this.animals || [])].forEach((item) => item.destroy());
    this.plants = [];
    this.animals = [];
    const plantCount = clamp(Math.round((this.params.sunlight ?? 60) / 6), 4, 16);
    const animalCount = clamp(Math.round((this.params.water ?? 45) / 9), 3, 10);
    for (let i = 0; i < plantCount; i += 1) {
      const x = 80 + (i * 73) % 820;
      const y = 390 + (i % 3) * 28;
      const plant = this.scene.add.text(x, y, i % 2 ? "🌱" : "🌼", { fontSize: "30px" });
      this.plants.push(plant);
      this.scene.tweens.add({ targets: plant, scaleX: 1.12, scaleY: .92, duration: 750 + i * 40, yoyo: true, repeat: -1 });
    }
    for (let i = 0; i < animalCount; i += 1) {
      const animal = this.scene.add.text(120 + i * 78, 340 + (i % 2) * 48, i % 3 ? "🐇" : "🐝", { fontSize: "31px" });
      this.animals.push(animal);
      this.scene.tweens.add({ targets: animal, x: animal.x + 35, duration: 1200 + i * 130, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    }
  }

  setParam(id, value) {
    this.params[id] = Number(value);
    if ((this.configData.simulationType || "friction") === "friction") {
      this.drawFrictionGround();
      this.drawForceArrows();
    }
    if (this.configData.simulationType === "gravity") this.resetGravity();
    if (this.configData.simulationType === "projectile") this.resetProjectile();
    if (this.configData.simulationType === "circuit") this.updateCircuitVisual();
    if (this.configData.simulationType === "ecosystem") this.rebuildEcosystem();
    if (this.configData.simulationType === "optics") this.drawOptics();
    this.hooks.onState?.(this.getTextState());
  }

  action() {
    const type = this.configData.simulationType || "friction";
    if (type === "gravity") {
      this.resetGravity();
      this.running = true;
    } else if (type === "projectile") {
      this.resetProjectile();
      const angle = (this.params.angle ?? 45) * Math.PI / 180;
      const power = this.params.power ?? 60;
      this.velocityX = Math.cos(angle) * power;
      this.velocityY = -Math.sin(angle) * power;
      this.running = true;
    } else if (type === "friction") {
      this.running = true;
      this.actor?.setScale(1.13, .88);
      this.scene.tweens.add({ targets: this.actor, scaleX: 1, scaleY: 1, duration: 180, ease: "Back.out" });
    } else if (type === "energy") {
      this.running = true;
      if (this.energyVariant === "work" || this.energyVariant === "power") {
        this.scene.tweens.killTweensOf(this.energyActor);
        const height = this.params.height ?? 8;
        const duration = Math.max(450, 2400 - (this.params.power ?? 50) * 18);
        this.scene.tweens.add({ targets: this.energyActor, y: 390 - height * 24, duration, ease: "Sine.inOut", onComplete: () => this.hooks.onSuccess?.() });
      }
    } else if (type === "fluid") {
      this.running = true;
      if (this.fluidVariant === "hydraulic") {
        const force = this.params.force ?? 30;
        const area = Math.max(1, this.params.area ?? 5);
        const lift = clamp(force / area, 2, 28);
        this.scene.tweens.add({ targets: this.leftPiston, y: 210 + 35, duration: 500, yoyo: true });
        this.scene.tweens.add({ targets: this.rightPiston, y: 210 - lift * 3, duration: 650, yoyo: true, onComplete: () => this.hooks.onSuccess?.() });
      }
    } else {
      this.running = !this.running;
    }
  }

  reset() {
    this.running = false;
    this.elapsed = 0;
    this.velocity = 0;
    if (this.actor) this.actor.setPosition(125, 362);
    if (this.distanceText) this.distanceText.setPosition(125, 285).setText("0.0 m");
    if (this.configData.simulationType === "gravity") this.resetGravity();
    if (this.configData.simulationType === "projectile") this.resetProjectile();
    if (this.configData.simulationType === "energy" && this.energyActor) {
      if (this.energyVariant === "work" || this.energyVariant === "power") this.energyActor.setY(390);
      else this.energyActor.setPosition(this.energyStart.x, this.energyStart.y);
    }
    this.feedbackText?.setText(this.configData.coachTips?.[0] || "Cambia una variable y observa.");
    this.hooks.onState?.(this.getTextState());
  }

  update(_time, delta) {
    const dt = Math.min(delta, 34) / 1000;
    const type = this.configData.simulationType || "friction";
    if (type === "friction") this.updateFriction(dt);
    if (type === "gravity") this.updateGravity(dt);
    if (type === "projectile") this.updateProjectile(dt);
    if (type === "circuit") this.updateCircuit(dt);
    if (type === "particles") this.updateParticles(dt);
    if (type === "ecosystem") this.updateEcosystem(dt);
    if (type === "energy") this.updateEnergy(dt);
    if (type === "fluid") this.updateFluid(dt);
    if (type === "wave") this.updateWave(dt);
    if (type === "optics") this.updateOptics(dt);
    if (type === "cell") this.updateCell(dt);
  }

  updateFriction(dt) {
    if (!this.running || !this.actor) return;
    const force = this.params.force ?? 55;
    const friction = this.params.friction ?? this.params.resistance ?? 45;
    const mass = Math.max(1, this.params.mass ?? 10);
    const net = force - friction;
    if (net <= 0) {
      this.velocity *= .88;
      this.feedbackText.setText("La resistencia iguala o supera la fuerza. Momo no avanza.");
      this.metricText.setText("FNET = 0");
      if (this.velocity < .03) this.running = false;
    } else {
      this.velocity += (net / mass) * 22 * dt;
      this.velocity *= .994;
      this.feedbackText.setText(`Fuerza neta: ${net.toFixed(0)} N. La aceleración aumenta al reducir masa o fricción.`);
      this.metricText.setText(`${this.velocity.toFixed(1)} m/s`);
    }
    this.actor.x += this.velocity * 22 * dt;
    const distance = Math.max(0, (this.actor.x - 125) / 72);
    this.distanceText.setPosition(this.actor.x, 285).setText(`${distance.toFixed(1)} m`);
    if (this.actor.x > 825) {
      this.running = false;
      this.metricText.setText("¡META!");
      this.feedbackText.setText(this.configData.successMessage || "¡Hipótesis confirmada!");
      this.scene.tweens.add({ targets: this.actor, y: 330, duration: 220, yoyo: true, repeat: 2, ease: "Quad.out" });
      this.hooks.onSuccess?.();
    }
  }

  updateProjectile(dt) {
    if (!this.running || !this.projectile) return;
    const gravity = this.params.gravity ?? 9.8;
    this.velocityY += gravity * dt;
    this.projectile.x += this.velocityX * this.physicsScale * dt;
    this.projectile.y += this.velocityY * this.physicsScale * dt;
    if (Math.random() > .55) {
      const dot = this.scene.add.circle(this.projectile.x, this.projectile.y, 5, 0xff8068, .4);
      this.trail.push(dot);
      this.scene.tweens.add({ targets: dot, alpha: 0, scale: .2, duration: 800, onComplete: () => dot.destroy() });
    }
    this.metricText.setText(`x ${((this.projectile.x - 145) / this.physicsScale).toFixed(1)} m`);
    if (PhaserModule.Math.Distance.Between(this.projectile.x, this.projectile.y, 790, 388) < 62) {
      this.running = false;
      this.feedbackText.setText(this.configData.successMessage || "¡Trayectoria exacta!");
      this.hooks.onSuccess?.();
    } else if (this.projectile.y > 450 || this.projectile.x > 950) {
      this.running = false;
      this.feedbackText.setText("Ajusta el ángulo o la potencia y vuelve a lanzar.");
    }
  }

  updateGravity(dt) {
    if (!this.running || !this.gravityObject) return;
    const gravity = Math.max(.01, this.params.gravity ?? 9.81);
    this.gravityVelocity += gravity * dt;
    this.gravityElapsed += dt;
    this.gravityObject.y += this.gravityVelocity * this.physicsScale * dt;
    this.gravityGlow?.setY(this.gravityObject.y);
    this.gravityCore?.setY(this.gravityObject.y);
    this.metricText.setText(`${this.gravityElapsed.toFixed(2)} s · ${this.gravityVelocity.toFixed(1)} m/s`);
    if (this.gravityObject.y >= this.gravityGroundY - this.gravityObject.radius) {
      this.gravityObject.y = this.gravityGroundY - this.gravityObject.radius;
      this.gravityGlow?.setY(this.gravityObject.y);
      this.gravityCore?.setY(this.gravityObject.y);
      this.running = false;
      this.feedbackText.setText(`Impacto: ${this.gravityVelocity.toFixed(1)} m/s. La masa no cambia g.`);
      this.scene.tweens.add({ targets: this.gravityObject, scale: 1.18, duration: 130, yoyo: true, repeat: 1 });
      this.hooks.onSuccess?.();
    }
  }

  updateCircuit(dt) {
    if (!this.running || !this.electrons) return;
    const speed = clamp(this.current * 95, 18, 140);
    this.electrons.forEach((electron, index) => {
      const perimeter = 2 * (590 + 165);
      let pos = ((this.elapsed * speed + index * 58) % perimeter);
      if (pos < 590) electron.setPosition(185 + pos, 220);
      else if (pos < 755) electron.setPosition(775, 220 + (pos - 590));
      else if (pos < 1345) electron.setPosition(775 - (pos - 755), 385);
      else electron.setPosition(185, 385 - (pos - 1345));
    });
    this.elapsed += dt;
    this.metricText.setText(`${this.current.toFixed(2)} A`);
    this.feedbackText.setText(`I = V/R. El brillo representa una corriente de ${this.current.toFixed(2)} amperes.`);
  }

  updateParticles(dt) {
    const temp = this.params.temperature ?? 50;
    const speed = .25 + temp / 24;
    this.particles?.forEach((particle) => {
      particle.x += particle.vx * speed * dt * 18;
      particle.y += particle.vy * speed * dt * 18;
      if (particle.x < 172 || particle.x > 788) particle.vx *= -1;
      if (particle.y < 157 || particle.y > 443) particle.vy *= -1;
    });
    this.metricText?.setText(`${temp.toFixed(0)} °C`);
    this.feedbackText?.setText(temp > 70 ? "Las partículas se mueven con mayor energía cinética." : "A menor temperatura, el movimiento promedio disminuye.");
  }

  updateEcosystem() {
    const sunlight = this.params.sunlight ?? 60;
    const water = this.params.water ?? 45;
    const balance = 100 - Math.abs(sunlight - water);
    this.metricText?.setText(`${balance.toFixed(0)}% equilibrio`);
    this.feedbackText?.setText(balance > 80 ? "Recursos equilibrados: la población puede sostenerse." : "Un recurso limita el crecimiento del ecosistema.");
    this.sun?.setScale(.75 + sunlight / 180);
  }

  updateEnergy(dt) {
    const mass = Math.max(1, this.params.mass ?? 5);
    const gravity = this.params.gravity ?? 9.8;
    const height = this.params.height ?? 8;
    if (this.energyVariant === "work" || this.energyVariant === "power") {
      const work = mass * gravity * height;
      this.metricText?.setText(`${work.toFixed(0)} J`);
      this.feedbackText?.setText(`Trabajo = m·g·h. Elevar ${mass} kg a ${height} m requiere ${work.toFixed(0)} joules.`);
      return;
    }
    const potential = mass * gravity * height;
    if (this.running && this.energyActor) {
      this.energyVx += 24 * dt;
      this.energyActor.x += this.energyVx * 12 * dt;
      this.energyActor.y += this.energyVx * 4.8 * dt;
      this.energyActor.rotation += this.energyVx * .01;
      if (this.energyActor.x > 690) {
        this.running = false;
        this.hooks.onSuccess?.();
      }
    }
    this.metricText?.setText(`${potential.toFixed(0)} J`);
    this.feedbackText?.setText(`Energía potencial = m·g·h. Al descender se transforma en energía cinética.`);
  }

  updateFluid() {
    const force = this.params.force ?? 30;
    const area = Math.max(.1, this.params.area ?? 5);
    const density = this.params.density ?? 700;
    if (this.fluidVariant === "hydraulic") {
      const pressure = force / area;
      this.metricText?.setText(`${pressure.toFixed(1)} Pa`);
      this.feedbackText?.setText(`P = F/A. La presión aplicada se transmite por todo el fluido.`);
    } else if (this.floatObject) {
      const targetY = density < 1000 ? 270 : 385;
      this.floatObject.y += (targetY - this.floatObject.y) * .035;
      this.metricText?.setText(density < 1000 ? "FLOTA" : "SE HUNDE");
      this.feedbackText?.setText(`Compara la densidad del objeto (${density} kg/m³) con la del agua.`);
    }
  }

  updateWave(dt) {
    if (!this.waveGraphics) return;
    const frequency = this.params.frequency ?? 3;
    const amplitude = this.params.amplitude ?? 55;
    const wavelength = this.params.wavelength ?? 120;
    this.wavePhase += dt * frequency * 3;
    this.waveGraphics.clear().lineStyle(8, 0x4f90ff, .9);
    let lastX = 150;
    let lastY = 285;
    for (let x = 150; x <= 825; x += 8) {
      const y = 285 + Math.sin((x / wavelength) * Math.PI * 2 - this.wavePhase) * amplitude;
      this.waveGraphics.lineBetween(lastX, lastY, x, y);
      lastX = x;
      lastY = y;
    }
    this.waveSource?.setScale(1 + Math.sin(this.wavePhase) * .08);
    this.metricText?.setText(`${frequency.toFixed(1)} Hz`);
    this.feedbackText?.setText(`La frecuencia controla los ciclos por segundo; la amplitud controla la energía visual de la onda.`);
  }

  drawOptics() {
    if (!this.opticsGraphics) return;
    const angle = this.params.angle ?? 35;
    const index = this.params.refractiveIndex ?? 1.5;
    const entryY = 315 - Math.tan(angle * Math.PI / 180) * 310;
    this.opticsGraphics.clear().lineStyle(8, 0xffc768).lineBetween(145, 315, 455, entryY);
    const bend = clamp(angle / index, 5, 65);
    const exitY = entryY + Math.tan(bend * Math.PI / 180) * 210;
    this.opticsGraphics.lineStyle(8, 0x48d8c8).lineBetween(455, entryY, 665, exitY);
    this.opticsGraphics.lineStyle(5, 0xff8068).lineBetween(665, exitY, 900, exitY - 55);
  }

  updateOptics() {
    const angle = this.params.angle ?? 35;
    const index = this.params.refractiveIndex ?? 1.5;
    this.metricText?.setText(`n = ${index.toFixed(2)}`);
    this.feedbackText?.setText(`Al cambiar de medio, la rapidez y dirección de la luz cambian. Ángulo: ${angle}°.`);
  }

  updateCell(dt) {
    const nutrients = this.params.nutrients ?? 60;
    const oxygen = this.params.oxygen ?? 60;
    this.elapsed += dt;
    this.organelles?.forEach((organelle, index) => {
      const angle = organelle.baseAngle + this.elapsed * (.12 + nutrients / 500);
      organelle.setPosition(500 + Math.cos(angle) * 125, 310 + Math.sin(angle) * 105);
      organelle.rotation = angle;
    });
    const energy = Math.round((nutrients + oxygen) / 2);
    this.nucleus?.setScale(.95 + Math.sin(this.elapsed * 2) * .04);
    this.metricText?.setText(`${energy}% ATP`);
    this.feedbackText?.setText(`Nutrientes y oxígeno sostienen la producción de energía y la actividad celular.`);
  }

  playQuestionMiniGame(profile = {}, correct = true) {
    const s = this.scene;
    if (!s) return Promise.resolve({ cancelled: true });
    if (this.questionMiniGameCleanup) this.questionMiniGameCleanup();
    if (this.questionFx) {
      s.tweens.killTweensOf(this.questionFx.list || []);
      this.questionFx.destroy(true);
    }

    const variant = profile.variant || "energy-transfer";
    const sequence = Number(profile.sequence || 0);
    const gameplayMode = profile.gameplay || (sequence % 2 ? "handheld" : "platform");
    const handheld = gameplayMode === "handheld";
    const accent = correct ? colorInt(this.configData.scenario?.accent, 0x48d8c8) : 0xff667d;
    const secondary = correct ? 0xc4f05c : 0xffb15f;
    const fx = s.add.container(0, 0).setDepth(90);
    this.questionFx = fx;
    let resolveCompletion;
    let completionSettled = false;
    const completion = new Promise((resolve) => { resolveCompletion = resolve; });
    const completeMiniGame = (result) => {
      if (completionSettled) return;
      completionSettled = true;
      resolveCompletion(result);
    };
    const add = (object) => { fx.add(object); return object; };
    const label = (x, y, text, size = 15, color = "#ffffff") => add(s.add.text(x, y, text, {
      fontFamily: handheld ? "Courier New" : "Trebuchet MS",
      fontSize: `${size}px`,
      fontStyle: "bold",
      color,
      align: "center",
      stroke: "#102838",
      strokeThickness: size > 18 ? 5 : 3
    }).setOrigin(.5));
    const rounded = (x, y, width, height, color, alpha = .95) => {
      const graphic = add(s.add.graphics());
      graphic.fillStyle(color, alpha).fillRoundedRect(x - width / 2, y - height / 2, width, height, Math.min(18, height / 2));
      return graphic;
    };

    const gameData = {
      replication: { title: "CORREDOR DEL ADN", item: "BASE", goal: "HÉLICE", icon: "ADN" },
      organelles: { title: "RESCATE CELULAR", item: "ORG", goal: "NÚCLEO", icon: "CEL" },
      transport: { title: "CRUCE DE MEMBRANA", item: "ION", goal: "CANAL", icon: "↔" },
      diffusion: { title: "RUTA DE DIFUSIÓN", item: "MOL", goal: "EQUILIBRIO", icon: "••" },
      "cell-energy": { title: "CARGA DE ATP", item: "ATP", goal: "MITOCONDRIA", icon: "⚡" },
      division: { title: "MISIÓN MITOSIS", item: "CROM", goal: "DIVISIÓN", icon: "2x" },
      trajectory: { title: "SALTO PARABÓLICO", item: "V", goal: "BLANCO", icon: "↗" },
      gravity: { title: "TORRE DE GRAVEDAD", item: "g", goal: "ÓRBITA", icon: "↓" },
      launch: { title: "LANZAMIENTO CIENTÍFICO", item: "°", goal: "META", icon: "↗" },
      "circuit-flow": { title: "CIRCUITO EN MARCHA", item: "e−", goal: "BATERÍA", icon: "⚡" },
      resistance: { title: "LABERINTO DE OHM", item: "Ω", goal: "SALIDA", icon: "Ω" },
      voltage: { title: "IMPULSO ELÉCTRICO", item: "V", goal: "TERMINAL", icon: "+" },
      reaction: { title: "REACCIÓN EN CADENA", item: "MOL", goal: "PRODUCTO", icon: "✦" },
      "phase-change": { title: "CAMBIO DE FASE", item: "°C", goal: "ESTADO", icon: "◇" },
      wave: { title: "SURF DE ONDAS", item: "λ", goal: "RECEPTOR", icon: "∿" },
      frequency: { title: "RITMO DE FRECUENCIA", item: "Hz", goal: "SEÑAL", icon: "∿" },
      amplitude: { title: "PICOS DE AMPLITUD", item: "A", goal: "CRESTA", icon: "∧" },
      refraction: { title: "RAYO REFRACTADO", item: "n", goal: "PRISMA", icon: "◇" },
      reflection: { title: "REBOTE DE LUZ", item: "LUZ", goal: "ESPEJO", icon: "↗" },
      spectrum: { title: "CARRERA DEL ESPECTRO", item: "RGB", goal: "PRISMA", icon: "◆" },
      pressure: { title: "CÁMARA DE PRESIÓN", item: "Pa", goal: "VÁLVULA", icon: "P" },
      buoyancy: { title: "ASCENSO DE ARQUÍMEDES", item: "ρ", goal: "SUPERFICIE", icon: "↑" },
      flow: { title: "RÁPIDOS DEL FLUIDO", item: "Q", goal: "CAUDAL", icon: "≈" },
      "ecosystem-flow": { title: "RUTA DEL ECOSISTEMA", item: "E", goal: "HÁBITAT", icon: "♧" },
      population: { title: "EQUILIBRIO DE ESPECIES", item: "N", goal: "REFUGIO", icon: "♧" },
      resources: { title: "MISIÓN RECURSOS", item: "H₂O", goal: "HÁBITAT", icon: "♧" },
      balance: { title: "PUENTE DEL EQUILIBRIO", item: "ΣF", goal: "BALANZA", icon: "=" },
      surface: { title: "PISTA DE FRICCIÓN", item: "μ", goal: "ZONA 0", icon: "▰" },
      force: { title: "IMPULSO DE FUERZA", item: "N", goal: "META", icon: "→" },
      "energy-transfer": { title: "CARRERA DE ENERGÍA", item: "J", goal: "NÚCLEO", icon: "⚡" },
      work: { title: "MISIÓN TRABAJO", item: "J", goal: "CARGA", icon: "W" },
      power: { title: "SPRINT DE POTENCIA", item: "W", goal: "GENERADOR", icon: "⚡" }
    };
    const data = gameData[variant] || gameData.force;

    if (handheld) {
      add(s.add.rectangle(480, 310, 938, 500, 0xb7a8d8, .98).setStrokeStyle(7, 0x6b5a8e, 1));
      add(s.add.rectangle(480, 300, 870, 402, 0x273542, 1).setStrokeStyle(8, 0x514665, 1));
      add(s.add.rectangle(480, 300, 834, 372, 0x0c2528, .98));
      const scanlines = add(s.add.graphics());
      scanlines.lineStyle(2, 0xd7f6b4, .055);
      for (let y = 118; y < 487; y += 6) scanlines.lineBetween(63, y, 897, y);
      label(480, 516, "SCIENCE POCKET · LAB SYSTEM", 12, "#403653");
      label(70, 515, "● POWER", 10, "#403653");
    } else {
      add(s.add.rectangle(480, 310, 960, 470, 0x071d2c, .88));
    }
    const grid = add(s.add.graphics());
    grid.lineStyle(2, accent, .12);
    for (let x = 30; x < 960; x += 48) grid.lineBetween(x, 105, x, 500);
    for (let y = 120; y < 500; y += 48) grid.lineBetween(0, y, 960, y);
    rounded(480, 125, 780, 64, 0x102f40, .96);
    label(480, 113, data.title, 24);
    label(480, 139, "RECOLECTA 3 DATOS Y ALCANZA LA PRUEBA", 12, "#bdefff");

    const platforms = [
      { x: 480, y: 448, width: 780 },
      { x: 385 + sequence * 12, y: 360, width: 160 },
      { x: 575 - sequence * 10, y: 286, width: 150 },
      { x: 735, y: 365, width: 120 }
    ];
    platforms.forEach((platform, index) => {
      rounded(platform.x, platform.y, platform.width, 18, index ? accent : 0x2b6071, index ? .72 : .94);
      if (variant === "wave" || variant === "frequency" || variant === "amplitude") {
        const crest = add(s.add.arc(platform.x, platform.y - 7, platform.width / 2, 180, 360, false, accent, .2));
        s.tweens.add({ targets: crest, scaleY: 1.28, yoyo: true, repeat: -1, duration: 420 + sequence * 80 });
      }
    });

    const actor = add(s.add.container(220, 405));
    const actorGlow = s.add.circle(0, 0, 30, accent, .2);
    const actorBody = s.add.rectangle(0, 0, 42, 48, secondary, 1).setStrokeStyle(4, 0xffffff, .82);
    const actorEyeLeft = s.add.circle(-8, -7, 3, 0x102838);
    const actorEyeRight = s.add.circle(8, -7, 3, 0x102838);
    const actorMark = s.add.text(0, 10, data.icon, {
      fontFamily: "Trebuchet MS",
      fontSize: "12px",
      fontStyle: "bold",
      color: "#102838"
    }).setOrigin(.5);
    actor.add([actorGlow, actorBody, actorEyeLeft, actorEyeRight, actorMark]);
    s.tweens.add({ targets: actorGlow, scale: 1.45, alpha: .05, duration: 500, yoyo: true, repeat: -1 });

    const collectiblePositions = [
      [345 + sequence * 12, 318],
      [575 - sequence * 10, 244],
      [704, 325]
    ];
    const collectibles = collectiblePositions.map(([x, y], index) => {
      const item = add(s.add.container(x, y));
      const halo = s.add.circle(0, 0, 24, index % 2 ? accent : secondary, .24);
      const core = s.add.circle(0, 0, 14, index % 2 ? accent : secondary, .95).setStrokeStyle(3, 0xffffff, .75);
      const text = s.add.text(0, 0, data.item, {
        fontFamily: "Trebuchet MS",
        fontSize: "9px",
        fontStyle: "bold",
        color: "#102838"
      }).setOrigin(.5);
      item.add([halo, core, text]);
      item.collected = false;
      s.tweens.add({ targets: item, y: y - 8, angle: 8, duration: 420 + index * 90, yoyo: true, repeat: -1 });
      return item;
    });

    const goal = add(s.add.container(815, 385));
    const goalHalo = s.add.circle(0, 0, 46, correct ? accent : 0xff667d, .2);
    const goalDoor = s.add.rectangle(0, 0, 58, 92, correct ? accent : 0xff667d, .82).setStrokeStyle(5, 0xffffff, .72);
    const goalText = s.add.text(0, 0, correct ? data.goal : "RIESGO", {
      fontFamily: "Trebuchet MS",
      fontSize: "10px",
      fontStyle: "bold",
      color: "#102838",
      align: "center",
      wordWrap: { width: 52 }
    }).setOrigin(.5);
    goal.add([goalHalo, goalDoor, goalText]);
    s.tweens.add({ targets: goalHalo, scale: 1.4, alpha: .05, duration: 480, yoyo: true, repeat: -1 });

    rounded(480, 495, 640, 38, 0x102f40, .94);
    const hud = label(480, 495, `DATOS 0/3  ·  ${correct ? "LLEGA A LA PRUEBA" : "PRUEBA LA HIPÓTESIS"}`, 13, "#ffffff");
    const status = label(480, 182, "MUÉVETE: ← → / A D · SALTA: ↑ / W / ESPACIO", 12, "#bdefff");

    const controlButton = (x, y, symbol, action) => {
      const button = add(s.add.container(x, y).setDepth(4));
      const background = s.add.circle(0, 0, 34, 0x173e50, .92).setStrokeStyle(3, accent, .78);
      const text = s.add.text(0, -2, symbol, {
        fontFamily: "Trebuchet MS",
        fontSize: "29px",
        fontStyle: "bold",
        color: "#ffffff"
      }).setOrigin(.5);
      button.add([background, text]);
      button.setSize(72, 72).setInteractive({ useHandCursor: true });
      button.on("pointerdown", (pointer) => {
        pointer.event?.preventDefault?.();
        input[action] = true;
        s.tweens.add({ targets: button, scale: .84, duration: 80, yoyo: true });
      });
      button.on("pointerup", () => { input[action] = false; });
      button.on("pointerout", () => { input[action] = false; });
      return button;
    };

    const input = { left: false, right: false, jump: false };
    controlButton(92, 455, "‹", "left");
    controlButton(172, 455, "›", "right");
    controlButton(868, 455, "↑", "jump");

    const cursors = s.input.keyboard?.createCursorKeys();
    const keys = s.input.keyboard?.addKeys("W,A,D,SPACE");
    let velocityX = 0;
    let velocityY = 0;
    let grounded = false;
    let collected = 0;
    let finished = false;
    let autoTarget = null;
    const distanceBetween = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

    const onWorldPointer = (pointer, gameObjects) => {
      if (gameObjects?.length) return;
      autoTarget = pointer.worldX;
      if (pointer.worldY < actor.y - 35) input.jump = true;
    };
    const releaseInput = () => {
      input.left = false;
      input.right = false;
      input.jump = false;
    };
    s.input.on("pointerdown", onWorldPointer);
    s.input.on("pointerup", releaseInput);

    const finishRun = () => {
      if (finished) return;
      finished = true;
      velocityX = 0;
      if (correct) {
        status.setText("¡PRUEBA SUPERADA! LA HIPÓTESIS FUNCIONA");
        status.setColor("#d9ff75");
        s.tweens.add({ targets: [actor, goal], scale: 1.28, duration: 180, yoyo: true, repeat: 3 });
        for (let index = 0; index < 22; index += 1) {
          const spark = add(s.add.circle(goal.x, goal.y, 5 + index % 4, index % 2 ? accent : secondary, .95));
          const angle = Math.PI * 2 * index / 22;
          s.tweens.add({
            targets: spark,
            x: goal.x + Math.cos(angle) * (90 + index * 3),
            y: goal.y + Math.sin(angle) * (70 + index * 2),
            alpha: 0,
            duration: 650
          });
        }
      } else {
        status.setText("LA HIPÓTESIS FALLÓ: OBSERVA EL EFECTO Y CORRIGE");
        status.setColor("#ff9aac");
        s.tweens.add({ targets: actor, x: actor.x - 140, angle: -28, duration: 420, ease: "Back.easeOut" });
        s.tweens.add({ targets: fx, x: { from: -8, to: 8 }, duration: 65, yoyo: true, repeat: 7 });
        if (globalThis.navigator?.vibrate) globalThis.navigator.vibrate([70, 45, 90]);
      }
      s.time.delayedCall(850, () => completeMiniGame({
        correct,
        collected,
        variant,
        gameplay: gameplayMode
      }));
    };

    const updateMiniGame = (_, deltaMs) => {
      if (finished || !actor.active) return;
      const dt = Math.min(deltaMs / 1000, .034);
      const keyboardLeft = cursors?.left?.isDown || keys?.A?.isDown;
      const keyboardRight = cursors?.right?.isDown || keys?.D?.isDown;
      const keyboardJump = cursors?.up?.isDown || keys?.W?.isDown || keys?.SPACE?.isDown;
      if (autoTarget !== null) {
        if (Math.abs(actor.x - autoTarget) < 18) autoTarget = null;
        else if (actor.x < autoTarget) input.right = true;
        else input.left = true;
      }
      const direction = (input.right || keyboardRight ? 1 : 0) - (input.left || keyboardLeft ? 1 : 0);
      velocityX += direction * 1150 * dt;
      velocityX *= direction ? .9 : .78;
      velocityX = Math.max(-340, Math.min(340, velocityX));
      if ((input.jump || keyboardJump) && grounded) {
        velocityY = -560;
        grounded = false;
        input.jump = false;
        s.tweens.add({ targets: actor, scaleX: .82, scaleY: 1.18, duration: 120, yoyo: true });
      }
      velocityY += 1450 * dt;
      const previousY = actor.y;
      actor.x = Math.max(190, Math.min(850, actor.x + velocityX * dt));
      actor.y += velocityY * dt;
      grounded = false;
      platforms.forEach((platform) => {
        const top = platform.y - 9;
        if (
          velocityY >= 0 &&
          previousY + 24 <= top + 10 &&
          actor.y + 24 >= top &&
          Math.abs(actor.x - platform.x) < platform.width / 2 + 18
        ) {
          actor.y = top - 24;
          velocityY = 0;
          grounded = true;
        }
      });
      if (actor.y > 485) {
        actor.setPosition(220, 405);
        velocityX = 0;
        velocityY = 0;
        status.setText("REINTENTO: AJUSTA TU SALTO");
      }
      actorBody.setFillStyle(direction < 0 ? 0x7fd8ff : secondary, 1);
      actor.rotation = Math.max(-.12, Math.min(.12, velocityX / 1600));

      collectibles.forEach((item) => {
        if (item.collected || distanceBetween(actor.x, actor.y, item.x, item.y) > 46) return;
        item.collected = true;
        collected += 1;
        hud.setText(`DATOS ${collected}/3  ·  ${collected === 3 ? "PUERTA DESBLOQUEADA" : "SIGUE EXPLORANDO"}`);
        s.tweens.add({
          targets: item,
          y: item.y - 70,
          scale: 1.8,
          alpha: 0,
          duration: 360,
          onComplete: () => item.setVisible(false)
        });
      });
      if (collected === collectibles.length && distanceBetween(actor.x, actor.y, goal.x, goal.y) < 62) finishRun();
    };
    s.events.on("update", updateMiniGame);

    const cleanup = () => {
      s.events.off("update", updateMiniGame);
      s.input.off("pointerdown", onWorldPointer);
      s.input.off("pointerup", releaseInput);
      if (this.questionFx === fx) this.questionFx = null;
      if (fx.active) {
        s.tweens.killTweensOf(fx.list || []);
        fx.destroy(true);
      }
      completeMiniGame({ cancelled: true });
      this.questionMiniGameCleanup = null;
    };
    this.questionMiniGameCleanup = cleanup;
    return completion;
  }

  playQuestionAnimation(profile = {}, correct = true) {
    return this.playQuestionMiniGame(profile, correct);
  }

  playStructuredQuestionGame(payload = {}, question = {}) {
    const canvas = this.scene?.game?.canvas;
    // El renderer Rive no necesita un canvas de Phaser.  Conservamos el canvas
    // únicamente cuando el runtime clásico está activo y montamos los retos
    // estructurados directamente en el host Rive en los presets nuevos.
    const host = this.mount || canvas?.parentElement;
    if (!host) return Promise.resolve({ cancelled: true });
    this.questionMiniGameCleanup?.();
    const previousCanvasAriaHidden = canvas?.getAttribute("aria-hidden");
    host.classList.add("is-structured-question");
    canvas?.setAttribute("aria-hidden", "true");
    const startedAt = performance.now();
    let attempts = 0;
    let settled = false;
    let resolver;
    const overlay = document.createElement("section");
    overlay.className = `science-structured-game is-${question.type}`;
    overlay.dataset.rivePreset = String(this.configData.visualStyle || "").startsWith("rive-") ? "true" : "false";
    overlay.setAttribute("aria-label", question.prompt || "Reto interactivo");
    const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
    const concise = (value, maxWords = 24, maxCharacters = 180) => {
      const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
      if (!normalized) return "";
      let result = normalized.split(" ").slice(0, maxWords).join(" ");
      if (result.length > maxCharacters) result = result.slice(0, maxCharacters).replace(/\s+\S*$/, "");
      return result.length < normalized.length ? `${result.replace(/[,:;.-]+$/, "")}…` : result;
    };
    const normalize = (value) => String(value ?? "")
      .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[×∙]/g, "·").replace(/[−–—]/g, "-")
      .replace(/\s+/g, "").toLowerCase();
    const state = { selected: [], selectedTokenIndexes: [], value: "", points: [], coefficients: [], exponent: "" };
    const typeLabels = {
      "equation-build": "CONSTRUCTOR DE ECUACIONES",
      "fill-blank": "REACTOR DE SÍMBOLOS",
      "exponent-placement": "DOCK DE EXPONENTES",
      "chemical-balance": "BALANZA MOLECULAR",
      "numeric-answer": "CONSOLA NUMÉRICA",
      "graph-plot": "SONDA CARTESIANA",
      "sequence-order": "ESTACIONES DE PROCESO"
    };
    const isMinimalRiveNumeric = question.type === "numeric-answer"
      && String(this.configData.visualStyle || "").startsWith("rive-");
    const missionCarouselPages = isMinimalRiveNumeric ? [
      question.context ? { label: "ANTECEDENTE", title: "Situación de misión", body: concise(question.context, 48, 420) } : null,
      Array.isArray(question.given) && question.given.length
        ? { label: "DATOS", title: "Variables disponibles", body: question.given.slice(0, 6).map((item, index) => `D${String(index + 1).padStart(2, "0")} · ${concise(item, 10, 88)}`).join("\n") }
        : null,
      question.goal ? { label: "OBJETIVO", title: "Resultado esperado", body: concise(question.goal, 28, 220) } : null
    ].filter(Boolean) : [];
    const learningContext = missionCarouselPages.length ? `<section class="science-rive-mission-carousel" data-science-rive-hud data-rive-role="mission-carousel" data-rive-artboard="New Artboard" data-rive-state-machine="State Machine 1" data-rive-fit="contain" role="region" aria-label="Datos de misión. Usa Anterior y Siguiente, o las flechas izquierda y derecha."><canvas aria-hidden="true"></canvas><div class="science-rive-mission-fallback" data-rive-carousel-fallback aria-live="polite"><small data-rive-carousel-label></small><strong data-rive-carousel-title></strong><p data-rive-carousel-body></p><div class="science-rive-mission-navigation"><button type="button" class="science-rive-mission-nav is-previous" data-rive-carousel-prev aria-label="Ver paso anterior">← <span>Anterior</span></button><div class="science-rive-mission-pagination" aria-label="Pasos de misión">${missionCarouselPages.map((_, index) => `<button type="button" data-rive-carousel-dot aria-label="Ver paso ${index + 1}"><i></i></button>`).join("")}<b data-rive-carousel-count></b></div><button type="button" class="science-rive-mission-nav is-next" data-rive-carousel-next aria-label="Ver paso siguiente"><span>Siguiente</span> →</button></div></div></section>` : "";
    overlay.classList.toggle("has-structured-context", Boolean(learningContext));
    overlay.classList.toggle("is-rive-numeric-console", isMinimalRiveNumeric);
    overlay.innerHTML = `
      <header>
        <div class="science-rive-challenge-heading">
          ${isMinimalRiveNumeric ? "" : `<i class="science-rive-challenge-signal" data-science-rive-hud data-rive-artboard="New Artboard" data-rive-state-machine="State Machine 1" data-rive-fit="contain" aria-hidden="true"><canvas></canvas></i>`}
          <div><small>${typeLabels[question.type] || "RETO STEM"}</small><h2>${escape(concise(question.prompt, 28, 195))}</h2></div>
        </div>
        <div class="science-rive-challenge-progress" aria-hidden="true"><i></i><i></i><i></i></div>
      </header>
      ${learningContext}
      <div class="science-structured-status"><span>${isMinimalRiveNumeric ? "Introduce el valor y valida tu cálculo" : "Construye, observa y comprueba"}</span><strong data-structured-progress>0%</strong></div>
      <div class="science-structured-board" data-structured-board></div>
      <footer><button type="button" data-structured-clear>Reiniciar</button><button type="button" data-structured-check disabled>Comprobar</button></footer>`;
    host.append(overlay);
    const board = overlay.querySelector("[data-structured-board]");
    const check = overlay.querySelector("[data-structured-check]");
    const progress = overlay.querySelector("[data-structured-progress]");
    requestAnimationFrame(() => {
      globalThis.ScienceRiveHud?.mountAll(overlay);
      const carousel = overlay.querySelector(".science-rive-mission-carousel");
      if (carousel) globalThis.ScienceRiveHud?.configureMissionCarousel(carousel, missionCarouselPages);
    });
    const buttonList = (items, className = "science-token-bank") =>
      `<div class="${className}" aria-label="Piezas disponibles">${items.map((item, index) => {
        const isOperator = /^[+\-−×·÷/=<>≤≥]$/.test(String(item).trim());
        return `<button type="button" class="${isOperator ? "is-equation-operator" : "is-equation-value"}" draggable="true" data-token="${index}" aria-label="Añadir ${escape(item)}"><i aria-hidden="true"></i><kbd>${index + 1}</kbd><span>${escape(item)}</span></button>`;
      }).join("")}</div>`;
    const shuffleTokens = (items) => {
      const shuffled = [...items];
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const target = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
      }
      if (shuffled.length > 2 && shuffled.every((token, index) => token === items[index])) {
        shuffled.push(shuffled.shift());
      }
      return shuffled;
    };
    const fallbackEquationDistractors = (required) => {
      const present = new Set(required.map(String));
      const candidates = ["−", "×", "÷", "0", "1", "x", "y", "x²", "12"];
      const numeric = required.find((token) => /^-?\d+(?:\.\d+)?$/.test(String(token)));
      if (numeric != null) candidates.unshift(String(Number(numeric) + 1));
      return candidates.filter((token) => !present.has(token)).slice(0, 3);
    };
    const graphAxes = (() => {
      const source = question.axes || {};
      const xMin = Number.isFinite(Number(source.xMin)) ? Number(source.xMin) : -5;
      const xMaxValue = Number.isFinite(Number(source.xMax)) ? Number(source.xMax) : 5;
      const yMin = Number.isFinite(Number(source.yMin)) ? Number(source.yMin) : -5;
      const yMaxValue = Number.isFinite(Number(source.yMax)) ? Number(source.yMax) : 5;
      return {
        x: String(source.x || "x"),
        y: String(source.y || "y"),
        xMin,
        xMax: xMaxValue > xMin ? xMaxValue : xMin + 10,
        yMin,
        yMax: yMaxValue > yMin ? yMaxValue : yMin + 10
      };
    })();
    const niceGraphStep = (range, divisions = 5) => {
      const rough = Math.abs(range) / Math.max(1, divisions);
      const magnitude = 10 ** Math.floor(Math.log10(rough || 1));
      const normalized = rough / magnitude;
      const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
      return nice * magnitude;
    };
    const graphXStep = Number(question.axes?.xStep) > 0
      ? Number(question.axes.xStep)
      : niceGraphStep(graphAxes.xMax - graphAxes.xMin);
    const graphYStep = Number(question.axes?.yStep) > 0
      ? Number(question.axes.yStep)
      : niceGraphStep(graphAxes.yMax - graphAxes.yMin);
    const graphSnapX = Number(question.axes?.xSnap) > 0 ? Number(question.axes.xSnap) : graphXStep / 2;
    const graphSnapY = Number(question.axes?.ySnap) > 0 ? Number(question.axes.ySnap) : graphYStep / 2;
    const formatGraphNumber = (value) => {
      const rounded = Math.abs(value) < 1e-9 ? 0 : Math.round(value * 100) / 100;
      return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, "").replace(/\.$/, "");
    };
    const graphTickValues = (minimum, maximum, step) => {
      const values = [];
      const first = Math.ceil(minimum / step) * step;
      for (let value = first, guard = 0; value <= maximum + step * .001 && guard < 24; value += step, guard += 1) {
        values.push(Math.round(value * 1e8) / 1e8);
      }
      if (!values.some((value) => Math.abs(value - minimum) < 1e-8)) values.unshift(minimum);
      if (!values.some((value) => Math.abs(value - maximum) < 1e-8)) values.push(maximum);
      return values;
    };
    const graphTicksMarkup = () => {
      const xRange = graphAxes.xMax - graphAxes.xMin;
      const yRange = graphAxes.yMax - graphAxes.yMin;
      const xTicks = graphTickValues(graphAxes.xMin, graphAxes.xMax, graphXStep).map((value) =>
        `<span class="science-graph-tick is-x" style="--tick-pos:${(value - graphAxes.xMin) / xRange * 100}%"><b>${escape(formatGraphNumber(value))}</b></span>`).join("");
      const yTicks = graphTickValues(graphAxes.yMin, graphAxes.yMax, graphYStep).map((value) =>
        `<span class="science-graph-tick is-y" style="--tick-pos:${(graphAxes.yMax - value) / yRange * 100}%"><b>${escape(formatGraphNumber(value))}</b></span>`).join("");
      const xAxisTop = (graphAxes.yMax - Math.min(graphAxes.yMax, Math.max(graphAxes.yMin, 0))) / yRange * 100;
      const yAxisLeft = (Math.min(graphAxes.xMax, Math.max(graphAxes.xMin, 0)) - graphAxes.xMin) / xRange * 100;
      return `<i class="x-axis" style="top:${xAxisTop}%"></i><i class="y-axis" style="left:${yAxisLeft}%"></i>${xTicks}${yTicks}<span class="science-graph-axis-title is-x">${escape(graphAxes.x)}</span><span class="science-graph-axis-title is-y">${escape(graphAxes.y)}</span>`;
    };

    if (question.type === "equation-build") {
      const requiredPieces = Array.isArray(question.correctSequence) ? question.correctSequence.map(String) : [];
      const availablePieces = [
        ...(Array.isArray(question.pieces) ? question.pieces.map(String) : []),
        ...(Array.isArray(question.distractors) ? question.distractors.map(String) : [])
      ];
      const requiredCounts = new Map();
      const availableCounts = new Map();
      requiredPieces.forEach((token) => requiredCounts.set(token, (requiredCounts.get(token) || 0) + 1));
      availablePieces.forEach((token) => availableCounts.set(token, (availableCounts.get(token) || 0) + 1));
      requiredCounts.forEach((count, token) => {
        for (let index = availableCounts.get(token) || 0; index < count; index += 1) availablePieces.push(token);
      });
      const hasDistractors = availablePieces.length > requiredPieces.length;
      if (!hasDistractors) availablePieces.push(...fallbackEquationDistractors(requiredPieces));
      question.pieces = shuffleTokens(availablePieces);
      board.innerHTML = `<div class="science-equation-workspace"><small>Construye la ecuación completa</small><div class="science-equation-slots" data-slots></div></div><small class="science-token-bank-label">Piezas y operadores disponibles</small>${buttonList(question.pieces)}`;
    } else if (question.type === "fill-blank") {
      const authoredSegments = Array.isArray(question.segments) ? question.segments.map(String) : [];
      const expressionSource = String(question.expression || question.formula || question.equation || "").trim();
      const expressionSegments = expressionSource.includes("___") ? expressionSource.split(/(___)/) : [];
      const prompt = String(question.prompt || "").trim();
      const target = prompt.match(/(?:valor|resultado|magnitud)\s+de\s+(.+?)[.?!]?$/i)?.[1]?.trim();
      const inferredSegments = target
        ? [`El valor de ${target} es `, "___", "."]
        : [String(question.context || prompt || "Completa la expresión"), " ", "___"];
      const displaySegments = authoredSegments.includes("___")
        ? authoredSegments
        : (expressionSegments.includes("___") ? expressionSegments : inferredSegments);
      board.innerHTML = `<div class="science-expression">${displaySegments.map((segment) =>
        segment === "___" ? `<input data-blank autocomplete="off" aria-label="Valor faltante">` : `<span>${escape(segment)}</span>`).join("")}</div>`;
    } else if (question.type === "exponent-placement") {
      board.innerHTML = `<div class="science-exponent-base">${escape((question.bases || ["x"])[0])}<sup data-exponent-slot>?</sup></div>${buttonList(question.exponents || [])}`;
    } else if (question.type === "chemical-balance") {
      state.coefficients = (question.compounds || []).map(() => 1);
      board.innerHTML = `<div class="science-molecule-equation">${(question.compounds || []).map((compound, index, all) => `
        <article><div><button type="button" data-coeff="${index}" data-delta="-1">−</button><strong data-coeff-value="${index}">1</strong><button type="button" data-coeff="${index}" data-delta="1">+</button></div><span>${escape(compound.formula)}</span></article>
        ${index < all.length - 1 ? `<b>${compound.side !== all[index + 1].side ? "→" : "+"}</b>` : ""}`).join("")}</div>
        <div class="science-atom-meter"><span>Reactivos</span><i></i><span>Productos</span></div>`;
    } else if (question.type === "numeric-answer") {
      board.innerHTML = `
        <label class="science-numeric-console">
          ${isMinimalRiveNumeric ? "" : `<i class="science-rive-module science-rive-console-surface" data-science-rive-hud data-rive-artboard="New Artboard" data-rive-state-machine="State Machine 1" data-rive-fit="contain" data-rive-static aria-hidden="true"><canvas></canvas></i>`}
          <span class="science-numeric-console-heading">
            <b>ENTRADA // RESULTADO</b>
            <small>CANAL NUMÉRICO ACTIVO</small>
          </span>
          <div class="science-numeric-input">
            <span aria-hidden="true">VAL</span>
            <input type="number" inputmode="decimal" data-numeric-answer step="any" aria-label="Resultado numérico">
            <em>${escape(question.unit || "")}</em>
          </div>
        </label>`;
    } else if (question.type === "graph-plot") {
      board.innerHTML = `<div class="science-graph" data-graph role="application" tabindex="0" aria-label="Plano cartesiano. Eje ${escape(graphAxes.x)} de ${formatGraphNumber(graphAxes.xMin)} a ${formatGraphNumber(graphAxes.xMax)}. Eje ${escape(graphAxes.y)} de ${formatGraphNumber(graphAxes.yMin)} a ${formatGraphNumber(graphAxes.yMax)}.">${graphTicksMarkup()}<output class="science-graph-coordinate" data-graph-coordinate aria-live="polite">Selecciona un punto</output></div>
        <p>Haz clic o toca una intersección para colocar ${(question.targetPoints || []).length || 2} puntos. Las coordenadas se ajustan a la cuadrícula.</p>`;
    } else if (question.type === "sequence-order") {
      question.steps = shuffleTokens(question.steps || []);
      board.innerHTML = `
        <section class="science-sequence-workspace science-rive-sequence-route" data-rive-question-surface="SequenceRoute">
          <small>RUTA DE PROCEDIMIENTO <b>TOCA PARA AÑADIR</b></small>
          <ol class="science-sequence-slots" data-sequence data-sequence-drop>
            <li class="science-sequence-placeholder">Selecciona el primer paso para activar la ruta</li>
          </ol>
        </section>
        <small class="science-token-bank-label">Módulos disponibles</small>
        ${buttonList(question.steps, "science-sequence-bank")}`;
    }

    const updateProgress = () => {
      let total = 1;
      let current = 0;
      if (["equation-build", "sequence-order"].includes(question.type)) {
        total = (question.correctSequence || question.correctOrder || question.pieces || question.steps || []).length || 1;
        current = state.selected.length;
      } else if (question.type === "graph-plot") {
        total = (question.targetPoints || []).length || 2;
        current = state.points.length;
      } else if (question.type === "chemical-balance") {
        current = state.coefficients.length ? 1 : 0;
      } else {
        current = state.value || state.exponent ? 1 : 0;
      }
      const percent = Math.min(100, Math.round(current / total * 100));
      progress.textContent = `${percent}%`;
      overlay.dataset.progress = String(percent);
      overlay.querySelectorAll(".science-rive-challenge-progress i").forEach((dot, index, dots) => {
        const threshold = index === 0 ? 1 : Math.ceil((index / Math.max(1, dots.length - 1)) * 100);
        dot.classList.toggle("is-active", percent >= threshold || (index === 0 && percent === 0));
      });
      check.disabled = current < total;
    };
    const renderGraphPoints = () => {
      if (question.type !== "graph-plot") return;
      const graphElement = overlay.querySelector("[data-graph]");
      if (!graphElement) return;
      graphElement.querySelectorAll(".science-graph-point").forEach((item) => item.remove());
      const xRange = graphAxes.xMax - graphAxes.xMin;
      const yRange = graphAxes.yMax - graphAxes.yMin;
      state.points.forEach((item, index) => {
        const marker = document.createElement("i");
        marker.className = "science-graph-point";
        marker.style.left = `${(item.x - graphAxes.xMin) / xRange * 100}%`;
        marker.style.top = `${(graphAxes.yMax - item.y) / yRange * 100}%`;
        marker.dataset.pointIndex = String(index);
        marker.dataset.coordinate = `(${formatGraphNumber(item.x)}, ${formatGraphNumber(item.y)})`;
        marker.setAttribute("aria-hidden", "true");
        graphElement.append(marker);
      });
      overlay.dataset.renderedPointCount = String(graphElement.querySelectorAll(".science-graph-point").length);
      const coordinate = graphElement.querySelector("[data-graph-coordinate]");
      if (coordinate) {
        coordinate.textContent = state.points.length
          ? state.points.map((point) => `(${formatGraphNumber(point.x)}, ${formatGraphNumber(point.y)})`).join(" · ")
          : "Selecciona un punto";
      }
      graphElement.setAttribute("aria-label", `Plano cartesiano. ${state.points.length ? `Puntos marcados: ${coordinate?.textContent || ""}.` : "Sin puntos marcados."} Eje ${graphAxes.x} de ${formatGraphNumber(graphAxes.xMin)} a ${formatGraphNumber(graphAxes.xMax)}. Eje ${graphAxes.y} de ${formatGraphNumber(graphAxes.yMin)} a ${formatGraphNumber(graphAxes.yMax)}.`);
    };
    const renderSelection = () => {
      if (question.type === "equation-build") {
        const slotCount = Math.max(1, (question.correctSequence || question.pieces || []).length);
        overlay.querySelector("[data-slots]").innerHTML = Array.from({ length: slotCount }, (_, index) => {
          const token = state.selected[index];
          return token == null
            ? `<span class="science-equation-empty-slot" aria-label="Espacio ${index + 1} vacío"><b>${index + 1}</b></span>`
            : `<button type="button" class="${/^[+\-−×·÷/=<>≤≥]$/.test(token) ? "is-equation-operator" : ""}" data-remove-token="${index}" aria-label="Quitar ${escape(token)}">${escape(token)}</button>`;
        }).join("");
      }
      if (question.type === "sequence-order") {
        overlay.querySelector("[data-sequence]").innerHTML = state.selected.length
          ? state.selected.map((token, index) => `
            <li draggable="true" data-selected-index="${index}">
              <span>${index + 1}</span>
              <strong>${escape(token)}</strong>
              <div>
                <button type="button" data-move-token="${index}" data-direction="-1" ${index === 0 ? "disabled" : ""} aria-label="Subir paso">↑</button>
                <button type="button" data-move-token="${index}" data-direction="1" ${index === state.selected.length - 1 ? "disabled" : ""} aria-label="Bajar paso">↓</button>
                <button type="button" data-remove-token="${index}" aria-label="Quitar paso">×</button>
              </div>
            </li>`).join("")
          : `<li class="science-sequence-placeholder">Selecciona el primer paso para activar la ruta</li>`;
      }
      overlay.querySelectorAll("[data-token]").forEach((button) => {
        const used = state.selectedTokenIndexes.includes(Number(button.dataset.token));
        const exponentSelected = question.type === "exponent-placement"
          && String((question.exponents || [])[Number(button.dataset.token)]) === state.exponent;
        button.disabled = used;
        button.classList.toggle("is-used", used);
        button.classList.toggle("is-selected", exponentSelected);
        button.setAttribute("aria-pressed", exponentSelected ? "true" : "false");
      });
      renderGraphPoints();
      updateProgress();
    };
    const selectToken = (index) => {
      const source = question.type === "sequence-order"
        ? question.steps || []
        : question.type === "exponent-placement"
          ? question.exponents || []
          : question.pieces || [];
      const token = source[index];
      if (token == null) return;
      if (question.type === "exponent-placement") {
        state.exponent = String(token);
        overlay.querySelector("[data-exponent-slot]").textContent = token;
      } else {
        const maximum = question.type === "sequence-order"
          ? (question.correctOrder || source).length
          : (question.correctSequence || source).length;
        if (state.selectedTokenIndexes.includes(index)) return;
        if (state.selected.length < maximum) {
          state.selected.push(String(token));
          state.selectedTokenIndexes.push(index);
        }
      }
      renderSelection();
    };
    const isCorrect = () => {
      if (question.type === "equation-build") return normalize(state.selected.join("")) === normalize((question.correctSequence || []).join(""));
      if (question.type === "fill-blank") return (question.accepted || []).some((item) => normalize(item) === normalize(state.value));
      if (question.type === "exponent-placement") return normalize(state.exponent) === normalize((question.correctExponents || [])[0]);
      if (question.type === "chemical-balance") return state.coefficients.every((value, index) => value === Number(question.correctCoefficients?.[index]));
      if (question.type === "numeric-answer") return Math.abs(Number(state.value) - Number(question.correctValue)) <= Number(question.tolerance || 0);
      if (question.type === "graph-plot") {
        const targets = question.targetPoints || [];
        const tolerance = Number(question.tolerance || .5);
        const remaining = state.points.map((point) => ({ ...point }));
        return targets.length === remaining.length && targets.every((target) => {
          const matchIndex = remaining.findIndex((point) => Math.hypot(point.x - target.x, point.y - target.y) <= tolerance + 1e-8);
          if (matchIndex < 0) return false;
          remaining.splice(matchIndex, 1);
          return true;
        });
      }
      if (question.type === "sequence-order") return normalize(state.selected.join("|")) === normalize((question.correctOrder || []).join("|"));
      return false;
    };
    const measurements = () => ({
      type: question.type,
      sequence: [...state.selected],
      value: state.value,
      exponent: state.exponent,
      coefficients: [...state.coefficients],
      points: [...state.points]
    });
    const cleanup = (cancelled = true) => {
      window.removeEventListener("keydown", onKey);
      globalThis.ScienceRiveHud?.destroyAll(overlay);
      if (AnimeModule) {
        AnimeModule.remove(overlay.querySelectorAll(".science-validation-probe, .science-validation-probe *"));
      }
      overlay.remove();
      host.classList.remove("is-structured-question");
      if (canvas) {
        if (previousCanvasAriaHidden == null) canvas.removeAttribute("aria-hidden");
        else canvas.setAttribute("aria-hidden", previousCanvasAriaHidden);
      }
      if (this.questionMiniGameCleanup === cleanup) this.questionMiniGameCleanup = null;
      if (cancelled && !settled) resolver({ cancelled: true });
    };
    const finish = async () => {
      if (settled) return;
      attempts += 1;
      const correct = isCorrect();
      overlay.classList.toggle("is-correct", correct);
      overlay.classList.toggle("is-incorrect", !correct);
      settled = true;
      overlay.querySelectorAll("button, input").forEach((control) => {
        control.disabled = true;
      });
      await playScienceProbeEffect(overlay);
      cleanup(false);
      resolver({ completed: true, correct, response: measurements(), attempts, durationMs: performance.now() - startedAt, measurements: measurements() });
    };
    const reviewCorrectAnswer = () => {
      if (settled) return false;
      if (question.type === "equation-build") {
        state.selected = [...(question.correctSequence || [])].map(String);
      } else if (question.type === "fill-blank") {
        state.value = String((question.accepted || [])[0] ?? "");
      } else if (question.type === "exponent-placement") {
        state.exponent = String((question.correctExponents || [])[0] ?? "");
      } else if (question.type === "chemical-balance") {
        state.coefficients = [...(question.correctCoefficients || [])].map(Number);
      } else if (question.type === "numeric-answer") {
        state.value = String(question.correctValue ?? "");
      } else if (question.type === "graph-plot") {
        state.points = (question.targetPoints || []).map((point) => ({ ...point }));
        overlay.dataset.reviewPointCount = String(state.points.length);
      } else if (question.type === "sequence-order") {
        state.selected = [...(question.correctOrder || [])].map(String);
      } else {
        return false;
      }
      const answerInput = overlay.querySelector("input");
      if (answerInput && state.value !== "") answerInput.value = state.value;
      const exponentSlot = overlay.querySelector("[data-exponent-slot]");
      if (exponentSlot && state.exponent !== "") exponentSlot.textContent = state.exponent;
      overlay.querySelectorAll("[data-coeff-value]").forEach((element, index) => {
        if (state.coefficients[index] != null) element.textContent = String(state.coefficients[index]);
      });
      renderSelection();
      check.disabled = false;
      window.setTimeout(finish, 180);
      return true;
    };
    this.questionReviewCorrectAnswer = reviewCorrectAnswer;
    overlay.addEventListener("scienceactivities:review-correct-answer", (event) => {
      const handled = reviewCorrectAnswer();
      if (event.detail && typeof event.detail === "object") event.detail.handled = handled;
    });
    const clear = () => {
      state.selected = [];
      state.selectedTokenIndexes = [];
      state.value = "";
      state.points = [];
      state.exponent = "";
      if (question.type === "chemical-balance") state.coefficients = (question.compounds || []).map(() => 1);
      overlay.querySelectorAll("input").forEach((input) => { input.value = ""; });
      const exponentSlot = overlay.querySelector("[data-exponent-slot]");
      if (exponentSlot) exponentSlot.textContent = "?";
      overlay.querySelectorAll("[data-coeff-value]").forEach((item) => { item.textContent = "1"; });
      overlay.querySelectorAll(".science-graph-point").forEach((point) => point.remove());
      overlay.classList.remove("is-correct", "is-incorrect");
      renderSelection();
    };
    const onClick = (event) => {
      const token = event.target.closest("[data-token]");
      if (token) selectToken(Number(token.dataset.token));
      const remove = event.target.closest("[data-remove-token]");
      if (remove) {
        const index = Number(remove.dataset.removeToken);
        state.selected.splice(index, 1);
        state.selectedTokenIndexes.splice(index, 1);
        renderSelection();
      }
      const move = event.target.closest("[data-move-token]");
      if (move) {
        const index = Number(move.dataset.moveToken);
        const target = index + Number(move.dataset.direction);
        if (target >= 0 && target < state.selected.length) {
          [state.selected[index], state.selected[target]] = [state.selected[target], state.selected[index]];
          [state.selectedTokenIndexes[index], state.selectedTokenIndexes[target]] = [state.selectedTokenIndexes[target], state.selectedTokenIndexes[index]];
          renderSelection();
        }
      }
      const coefficient = event.target.closest("[data-coeff]");
      if (coefficient) {
        const index = Number(coefficient.dataset.coeff);
        state.coefficients[index] = Math.max(1, Math.min(9, state.coefficients[index] + Number(coefficient.dataset.delta)));
        overlay.querySelector(`[data-coeff-value="${index}"]`).textContent = state.coefficients[index];
        updateProgress();
      }
      if (event.target.closest("[data-structured-check]")) finish();
      if (event.target.closest("[data-structured-clear]")) clear();
    };
    const onInput = (event) => {
      if (event.target.matches("[data-blank],[data-numeric-answer]")) {
        state.value = event.target.value;
        updateProgress();
      }
    };
    const graph = overlay.querySelector("[data-graph]");
    const onGraphPointer = (event) => {
      const rect = graph.getBoundingClientRect();
      const rawX = graphAxes.xMin + ((event.clientX - rect.left) / rect.width) * (graphAxes.xMax - graphAxes.xMin);
      const rawY = graphAxes.yMax - ((event.clientY - rect.top) / rect.height) * (graphAxes.yMax - graphAxes.yMin);
      const point = {
        x: Math.min(graphAxes.xMax, Math.max(graphAxes.xMin, Math.round(rawX / graphSnapX) * graphSnapX)),
        y: Math.min(graphAxes.yMax, Math.max(graphAxes.yMin, Math.round(rawY / graphSnapY) * graphSnapY))
      };
      if (state.points.length >= ((question.targetPoints || []).length || 2)) state.points.shift();
      state.points.push(point);
      renderSelection();
    };
    const onKey = (event) => {
      if (/^[1-9]$/.test(event.key)) selectToken(Number(event.key) - 1);
      if (event.key === "Backspace" && !event.target.matches("input")) {
        state.selected.pop();
        state.selectedTokenIndexes.pop();
        renderSelection();
      }
      if (event.key === "Enter" && !check.disabled) finish();
    };
    const completion = new Promise((resolve) => { resolver = resolve; });
    overlay.addEventListener("click", onClick);
    overlay.addEventListener("input", onInput);
    graph?.addEventListener("pointerdown", onGraphPointer);
    window.addEventListener("keydown", onKey);
    overlay.addEventListener("dragstart", (event) => {
      const selected = event.target.closest("[data-selected-index]");
      const token = event.target.closest("[data-token]");
      if (selected) {
        event.dataTransfer.setData("application/x-science-selected", selected.dataset.selectedIndex);
        event.dataTransfer.effectAllowed = "move";
      } else if (token) {
        event.dataTransfer.setData("application/x-science-token", token.dataset.token);
        event.dataTransfer.effectAllowed = "copy";
      }
    });
    board.addEventListener("dragover", (event) => event.preventDefault());
    board.addEventListener("drop", (event) => {
      event.preventDefault();
      const selectedValue = event.dataTransfer.getData("application/x-science-selected");
      if (selectedValue !== "") {
        const from = Number(selectedValue);
        const targetItem = event.target.closest("[data-selected-index]");
        const to = targetItem ? Number(targetItem.dataset.selectedIndex) : state.selected.length - 1;
        if (from !== to && from >= 0 && to >= 0) {
          const [selectedToken] = state.selected.splice(from, 1);
          const [selectedIndex] = state.selectedTokenIndexes.splice(from, 1);
          state.selected.splice(to, 0, selectedToken);
          state.selectedTokenIndexes.splice(to, 0, selectedIndex);
          renderSelection();
        }
        return;
      }
      const tokenValue = event.dataTransfer.getData("application/x-science-token")
        || event.dataTransfer.getData("text/plain");
      if (tokenValue !== "") selectToken(Number(tokenValue));
    });
    this.questionMiniGameCleanup = cleanup;
    renderSelection();
    return completion;
  }

  cancelQuestionGame() {
    const cleanup = this.questionMiniGameCleanup;
    this.questionMiniGameCleanup = null;
    cleanup?.();
  }

  playQuestionGame(payload = {}) {
    const s = this.scene;
    if (!s) return Promise.resolve({ cancelled: true });
    this.cancelQuestionGame();
    const question = { ...(payload.assessment || {}) };
    const rawQuestionType = String(question.type || "multiple").trim().toLowerCase();
    if (["match", "pairing", "pair", "emparejamiento", "relation", "relationship"].includes(rawQuestionType)) {
      question.type = "matching";
    } else if (["keyword", "key-word", "word", "palabra", "palabra-clave"].includes(rawQuestionType)) {
      question.type = "keyword";
    } else {
      const supported = ["multiple", "matching", "keyword", "equation-build", "fill-blank", "exponent-placement", "chemical-balance", "numeric-answer", "graph-plot", "sequence-order"];
      question.type = supported.includes(rawQuestionType) ? rawQuestionType : "multiple";
    }
    if (["equation-build", "fill-blank", "exponent-placement", "chemical-balance", "numeric-answer", "graph-plot", "sequence-order"].includes(question.type)) {
      return this.playStructuredQuestionGame(payload, question);
    }
    const profile = payload.profile || question.gameplay || question.animation || {};
    const science = evaluateScienceModel({ ...payload, profile });
    const selectedTheme = PLAYABLE_VISUAL_THEMES[this.configData.visualMode] || PLAYABLE_VISUAL_THEMES.soft;
    const isKawaiiTheme = this.configData.visualMode === "soft"
      || ["kawaii-lab", "rive-kawaii-signal"].includes(this.configData.visualStyle);
    const theme = {
      ...selectedTheme,
      accent: this.configData.scenario?.accent || "#48d8c8",
      ground: this.configData.scenario?.ground || selectedTheme.surface
    };
    const palette = Object.fromEntries(
      Object.entries(theme).filter(([, value]) => /^#[0-9a-f]{6}$/i.test(value)).map(([key, value]) => [key, colorInt(value, 0xffffff)])
    );
    const mechanic = profile.mechanic && profile.mechanic !== "auto"
      ? profile.mechanic
      : question.type === "matching" ? "carry-match" : question.type === "keyword" ? "word-forge" : "answer-zones";
    const Phaser = this.Phaser;
    const startedAt = performance.now();
    const response = [];
    let attempts = 0;
    let stage = 0;
    let settled = false;

    return new Promise((resolve) => {
      const root = s.add.container(0, 0).setDepth(9000);
      const add = (object) => { root.add(object); return object; };
      add(s.add.rectangle(480, 270, 960, 540, palette.background, .99));
      const grid = add(s.add.graphics());
      grid.lineStyle(1, palette.grid, this.configData.visualMode === "technical" ? .8 : .5);
      for (let x = 0; x <= 960; x += 48) grid.lineBetween(x, 0, x, 540);
      for (let y = 0; y <= 540; y += 48) grid.lineBetween(0, y, 960, y);
      if (theme.decoration === "stars") {
        for (let index = 0; index < 36; index += 1) {
          add(s.add.circle((index * 137) % 950, 92 + ((index * 83) % 420), 1 + index % 3, index % 4 ? palette.muted : palette.highlight, .65));
        }
      } else if (theme.decoration === "bubbles" || theme.decoration === "waves") {
        for (let index = 0; index < 18; index += 1) {
          add(s.add.circle((index * 173) % 940, 105 + ((index * 71) % 400), 8 + index % 4 * 5, palette.accent, .07).setStrokeStyle(1, palette.accent, .18));
        }
      } else if (theme.decoration === "scanlines" || theme.decoration === "circuit") {
        const scanlines = add(s.add.graphics());
        scanlines.lineStyle(1, palette.accent, .12);
        for (let y = 100; y < 540; y += 8) scanlines.lineBetween(0, y, 960, y);
      }
      add(s.add.rectangle(480, 54, 900, 82, palette.panel, .98).setStrokeStyle(2, palette.accent, .78));
      const sceneContextLabel = add(s.add.text(48, 18, `CONCEPTO A RELACIONAR  //  ${science.label.toUpperCase()}`, {
        fontFamily: theme.font, fontSize: "13px", fontStyle: "bold", color: theme.accent
      }));
      const sceneQuestion = add(s.add.text(48, 40, "Encuentra y comprueba la respuesta dentro del escenario", {
        fontFamily: theme.font, fontSize: "20px", fontStyle: "bold", color: theme.text,
        wordWrap: { width: 690 }, maxLines: 2
      }));
      const formulaText = add(s.add.text(730, 24, "Selecciona una hipótesis para cargar las variables", {
        fontFamily: theme.font, fontSize: "13px", color: theme.muted, align: "right",
        wordWrap: { width: 175 }
      }));
      const instruction = add(s.add.text(48, 106, "", {
        fontFamily: theme.font, fontSize: "16px", fontStyle: "bold", color: theme.highlight
      }));
      const feedback = add(s.add.text(480, 468, "Explora y activa una cápsula de respuesta", {
        fontFamily: theme.font, fontSize: "15px", fontStyle: "bold", color: theme.text,
        backgroundColor: theme.panel, padding: { x: 16, y: 9 }
      }).setOrigin(.5));
      const runway = add(s.add.graphics());
      runway.fillStyle(palette.text, .12).fillRoundedRect(38, 411, 884, 34, 17);
      runway.fillStyle(palette.ground, .96).fillRoundedRect(40, 404, 880, 31, 15);
      runway.lineStyle(2, palette.accent, .76).strokeRoundedRect(40, 404, 880, 31, 15);
      runway.lineStyle(2, palette.highlight, .34).lineBetween(62, 413, 898, 413);
      for (let index = 0; index < 9; index += 1) {
        runway.fillStyle(index % 2 ? palette.accent : palette.highlight, .48);
        runway.fillCircle(82 + index * 98, 420, 3);
        if (isKawaiiTheme && index < 8) {
          runway.fillStyle(index % 2 ? palette.highlight : palette.panel, .86);
          runway.fillCircle(110 + index * 105, 432, 8 + (index % 3));
        }
      }

      const actor = add(s.add.container(115, 382));
      const actorGlow = s.add.circle(0, 0, 30, palette.accent, .2);
      let actorSprite = null;
      if (s.textures.exists("science-player-generated")) {
        actorSprite = s.add.sprite(0, -23, "science-player-generated", 0);
        actorSprite.setDisplaySize(104, 104);
        actorSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        actor.add([actorGlow, actorSprite]);
      } else {
        const actorBody = s.add.rectangle(0, 0, 38, 48, palette.highlight).setStrokeStyle(3, palette.panel);
        const visor = s.add.rectangle(5, -8, 23, 11, palette.text);
        const boots = s.add.rectangle(0, 25, 46, 8, palette.accent);
        actor.add([actorGlow, actorBody, visor, boots]);
      }
      const poseFrames = {
        idle: 0,
        run: [1, 2, 3],
        jump: 4,
        fall: 5,
        hit: 6,
        celebrate: 7,
        ...(this.configData.playerSprite?.poses || {})
      };
      let currentPose = "";
      let activePose = "";
      let poseStartedAt = 0;
      let hitPoseUntil = 0;
      let facingDirection = 1;
      const setActorPose = (pose) => {
        if (!actorSprite) return;
        if (activePose !== pose) {
          activePose = pose;
          poseStartedAt = s.time.now;
        }
        const poseValue = poseFrames[pose];
        const frames = Array.isArray(poseValue) ? poseValue : [poseValue];
        const frame = Number(frames[Math.floor((s.time.now - poseStartedAt) / 145) % frames.length]);
        const poseKey = `${pose}:${frame}`;
        const totalFrames = Math.max(
          1,
          (Number(this.configData.playerSprite?.columns) || 4)
            * (Number(this.configData.playerSprite?.rows) || 2)
        );
        if (currentPose !== poseKey && Number.isInteger(frame) && frame >= 0 && frame < totalFrames) {
          actorSprite.setFrame(frame);
          currentPose = poseKey;
        }
      };
      setActorPose("idle");

      const keys = s.input.keyboard?.addKeys("A,D,W,LEFT,RIGHT,UP,SPACE,E") || {};
      const touch = { left: false, right: false, action: false };
      const body = { vx: 0, vy: 0, grounded: true };
      const acceleration = clamp(520 + Math.abs(science.acceleration || 1) * 100, 560, 1120);
      const gravity = clamp((science.gravity || 9.81) * 105, 760, 1450);
      const drag = clamp(.84 + (science.traction || .45) * .13, .84, .96);
      let zones = [];
      let zoneObjects = [];
      let pointerTarget = null;
      let keywordConsole = null;
      let answerConsole = null;
      let roundLocked = false;
      let evidence = null;
      let evidenceReady = false;
      let evidenceChecked = false;
      let selectedAnswerIndex = 0;
      let apparatus = null;
      let experimentStarted = false;
      let experimentArmedAt = 0;

      const normalizePair = (pair) => Array.isArray(pair)
        ? { left: pair[0], right: pair[1] }
        : { left: pair?.left || pair?.term, right: pair?.right || pair?.definition };
      const pairs = (question.pairs || question.matches || []).map(normalizePair);
      const rawAccepted = question.accepted
        ?? question.acceptedAnswers
        ?? question.keywords
        ?? question.answers
        ?? question.correctAnswer
        ?? question.answer;
      const acceptedKeywords = (Array.isArray(rawAccepted) ? rawAccepted : [rawAccepted])
        .flatMap((value) => String(value ?? "").split(","))
        .map((value) => value.trim())
        .filter(Boolean);
      const keyword = String(acceptedKeywords[0] || "ciencia").trim();

      const resolveCorrectIndex = (options) => {
        const optionObjects = Array.isArray(question.options) ? question.options : [];
        const markedIndex = optionObjects.findIndex((option) => option && typeof option === "object" && (option.correct === true || option.isCorrect === true));
        if (markedIndex >= 0) return markedIndex;
        const rawCorrect = question.correct ?? question.correctIndex ?? question.correctAnswer ?? question.answer;
        if (Number.isInteger(rawCorrect) && rawCorrect >= 0 && rawCorrect < options.length) return rawCorrect;
        if (typeof rawCorrect === "string") {
          const clean = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
          const byText = options.findIndex((option) => clean(typeof option === "object" ? option.text ?? option.label ?? option.value : option) === clean(rawCorrect));
          if (byText >= 0) return byText;
          const trimmed = rawCorrect.trim();
          if (/^[a-z]$/i.test(trimmed)) {
            const byLetter = trimmed.toUpperCase().charCodeAt(0) - 65;
            if (byLetter >= 0 && byLetter < options.length) return byLetter;
          }
          if (/^\d+$/.test(trimmed)) {
            const numeric = Number(trimmed);
            if (numeric >= 0 && numeric < options.length) return numeric;
            if (numeric > 0 && numeric <= options.length) return numeric - 1;
          }
        }
        return 0;
      };

      const round = () => {
        if (question.type === "matching") {
          const pair = pairs[stage] || pairs[0] || { left: "Concepto", right: "Definición" };
          const options = pairs.map((item) => item.right).filter(Boolean);
          while (options.length < 3) options.push(`Alternativa ${options.length + 1}`);
          return { title: String(pair.left), options: options.slice(0, 3), correct: Math.max(0, options.indexOf(pair.right)), total: Math.max(1, pairs.length) };
        }
        if (question.type === "keyword") return { title: "Escribe la palabra clave completa", options: [], correct: 0, total: 1 };
        const options = (question.options || ["Opción A", "Opción B", "Opción C"])
          .map((option) => typeof option === "object" ? String(option.text ?? option.label ?? option.value ?? "") : String(option))
          .slice(0, 3);
        return { title: "Localiza la hipótesis correcta", options, correct: resolveCorrectIndex(options), total: 1 };
      };

      const clearZones = () => {
        zoneObjects.forEach((object) => object.destroy());
        zoneObjects = [];
        zones = [];
      };
      const cleanup = () => {
        s.events.off("update", update);
        clearZones();
        keywordConsole?.remove();
        s.game.canvas.parentElement?.classList.remove("has-keyword-game-console");
        s.game.canvas.parentElement?.classList.remove("has-answer-game-console");
        keywordConsole = null;
        if (answerConsole) window.ScienceRiveHud?.destroyAll(answerConsole);
        answerConsole?.remove();
        answerConsole = null;
        this.questionReviewCorrectAnswer = null;
        if (s.input.keyboard) s.input.keyboard.enabled = true;
        if (root.active) root.destroy(true);
        if (this.questionMiniGameCleanup === cleanup) this.questionMiniGameCleanup = null;
      };
      const complete = (confirmedCorrect = true) => {
        if (settled) return;
        settled = true;
        setActorPose(confirmedCorrect ? "celebrate" : "hit");
        feedback
          .setText(confirmedCorrect ? "EVIDENCIA CONFIRMADA" : "LA EVIDENCIA NO ALCANZA EL OBJETIVO")
          .setColor(confirmedCorrect ? theme.text : "#ffffff")
          .setBackgroundColor(confirmedCorrect ? theme.accent : theme.danger);
        if (confirmedCorrect) s.cameras.main.flash(250, 114, 245, 223);
        else s.cameras.main.shake(260, .012);
        s.tweens.add({ targets: [actor, feedback], scale: 1.12, duration: 170, yoyo: true, repeat: 1 });
        s.time.delayedCall(GAMEPLAY_FEEDBACK_READING_MS, () => {
          cleanup();
          resolve({
            completed: true,
            correct: confirmedCorrect,
            response: question.type === "keyword" ? response.join("") : response,
            attempts,
            durationMs: Math.round(performance.now() - startedAt),
            measurements: evidence || science
          });
        });
      };
      const experimentConfig = question.experiment || {};
      const normalizedQuestion = String(question.prompt || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      const resolveEvidenceVariant = (modelId) => {
        if (modelId === "braking-motion") {
          if (/velocidad|rapidez/.test(normalizedQuestion)) return "velocity";
          if (/fuerza|friccion|rozamiento|frenos/.test(normalizedQuestion)) return "forces";
          return "distance";
        }
        if (modelId === "gravity-fall") {
          if (/masa|peso/.test(normalizedQuestion)) return "mass";
          if (/tiempo|altura/.test(normalizedQuestion)) return "time";
          return "acceleration";
        }
        if (modelId === "newton-motion") {
          if (/friccion|rozamiento|superficie/.test(normalizedQuestion)) return "friction";
          if (/inercia|reposo/.test(normalizedQuestion)) return "inertia";
          return "acceleration";
        }
        if (modelId === "projectile-motion") {
          if (/angulo|direccion/.test(normalizedQuestion)) return "angle";
          if (/altura|tiempo de vuelo/.test(normalizedQuestion)) return "flight";
          return "range";
        }
        if (modelId === "particle-collision") {
          if (/temperatura|calor/.test(normalizedQuestion)) return "temperature";
          if (/choque|colision/.test(normalizedQuestion)) return "collision";
          return "particles";
        }
        return String(profile.variant || profile.sequence || "default");
      };
      const createEvidenceApparatus = (result, preset) => {
        const evidenceVariant = resolveEvidenceVariant(result.id);
        if (apparatus) {
          s.tweens.killTweensOf(apparatus);
          s.tweens.killTweensOf(apparatus.list || []);
          apparatus.destroy(true);
        }
        actor.setVisible(true).setDepth(9008);
        runway.setVisible(true);
        sceneContextLabel.setText(`EXPERIMENTO EN JUEGO  //  ${String(result.label || result.id).toUpperCase()}`);
        sceneQuestion.setText("Ejecuta la prueba, observa las mediciones y contrasta tu hipótesis");
        apparatus = add(s.add.container(590, 295).setDepth(9004).setScale(.72));
        const panel = s.add.graphics();
        panel.fillStyle(palette.panel, .95).fillRoundedRect(-350, -132, 700, 264, 28);
        panel.lineStyle(3, palette.accent, .78).strokeRoundedRect(-350, -132, 700, 264, 28);
        panel.lineStyle(1, palette.highlight, .4).strokeRoundedRect(-338, -120, 676, 240, 22);
        apparatus.add(panel);
        apparatus.add(s.add.text(-320, -108, String(result.label || "Experimento").toUpperCase(), {
          fontFamily: theme.font, fontSize: "14px", fontStyle: "bold", color: theme.accent
        }));
        const metric = (text) => {
          apparatus.add(s.add.text(0, 102, text, {
            fontFamily: theme.font, fontSize: "14px", fontStyle: "bold", color: theme.text,
            backgroundColor: theme.surface, padding: { x: 14, y: 8 }
          }).setOrigin(.5));
        };
        const particles = (count, colors) => {
          for (let index = 0; index < count; index += 1) {
            const item = s.add.circle(-255 + (index * 71) % 510, -62 + (index * 47) % 128, 6 + index % 3, colors[index % colors.length], .9);
            apparatus.add(item);
            s.tweens.add({
              targets: item,
              x: item.x + 28 - (index % 4) * 15,
              y: item.y - 16 + (index % 3) * 15,
              duration: 420 + index * 41,
              yoyo: true,
              repeat: -1,
              ease: "Sine.inOut"
            });
          }
        };

        if (result.id === "braking-motion" && evidenceVariant === "velocity") {
          const gauge = s.add.container(0, -2);
          const dial = s.add.graphics();
          dial.lineStyle(14, palette.surface, .95).strokeCircle(0, 0, 92);
          dial.lineStyle(7, palette.accent, .86).arc(0, 0, 92, Phaser.Math.DegToRad(145), Phaser.Math.DegToRad(395), false);
          for (let index = 0; index <= 8; index += 1) {
            const angle = Phaser.Math.DegToRad(145 + index * 31.25);
            dial.lineStyle(3, palette.text, .48).lineBetween(
              Math.cos(angle) * 70,
              Math.sin(angle) * 70,
              Math.cos(angle) * 84,
              Math.sin(angle) * 84
            );
          }
          const needle = s.add.rectangle(0, 0, 74, 6, palette.danger).setOrigin(.08, .5).setRotation(Phaser.Math.DegToRad(145));
          const hub = s.add.circle(0, 0, 12, palette.text).setStrokeStyle(4, palette.panel);
          const speed = s.add.text(0, 42, `${Number(result.initialVelocity).toFixed(1)} → ${Number(result.finalVelocity).toFixed(1)} m/s`, {
            fontFamily: theme.font, fontSize: "16px", fontStyle: "bold", color: theme.text
          }).setOrigin(.5);
          gauge.add([dial, needle, hub, speed]);
          apparatus.add(gauge);
          s.tweens.add({
            targets: needle,
            rotation: Phaser.Math.DegToRad(145 + clamp(result.finalVelocity / Math.max(1, result.initialVelocity), 0, 1) * 250),
            duration: 1050,
            ease: "Cubic.out"
          });
          metric(`Velocidad final al obstáculo: ${Number(result.finalVelocity).toFixed(1)} m/s`);
        } else if (result.id === "braking-motion" && evidenceVariant === "forces") {
          const vehicle = s.add.container(0, 30);
          vehicle.add([
            s.add.rectangle(0, -10, 118, 48, palette.surface).setStrokeStyle(4, palette.accent),
            s.add.rectangle(28, -36, 54, 28, palette.highlight).setStrokeStyle(3, palette.panel),
            s.add.circle(-36, 18, 15, palette.text).setStrokeStyle(4, palette.panel),
            s.add.circle(36, 18, 15, palette.text).setStrokeStyle(4, palette.panel)
          ]);
          const brakeArrow = s.add.text(92, -34, `← FRENO ${Number(preset.brakeForce || 0)} N`, {
            fontFamily: theme.font, fontSize: "16px", fontStyle: "bold", color: theme.danger
          });
          const frictionArrow = s.add.text(-280, 48, `ROZAMIENTO ${Number(preset.friction || 0)} N →`, {
            fontFamily: theme.font, fontSize: "14px", fontStyle: "bold", color: theme.accent
          });
          apparatus.add([vehicle, brakeArrow, frictionArrow]);
          s.tweens.add({ targets: vehicle, x: 48, duration: 310, yoyo: true, repeat: 2, ease: "Sine.inOut" });
          metric(`Fuerza neta: ${Math.abs(Number(result.acceleration) * Number(preset.mass || 1000)).toFixed(0)} N`);
        } else if (result.id === "braking-motion") {
          const track = s.add.rectangle(0, 68, 650, 18, palette.ground).setStrokeStyle(3, palette.accent);
          const obstacleX = 265;
          const obstacle = s.add.rectangle(obstacleX, 4, 24, 124, palette.danger).setStrokeStyle(4, palette.panel);
          const vehicle = s.add.container(-270, 35);
          vehicle.add([
            s.add.rectangle(0, -8, 94, 42, palette.surface).setStrokeStyle(4, palette.accent),
            s.add.rectangle(22, -28, 44, 25, palette.highlight).setStrokeStyle(3, palette.panel),
            s.add.circle(-28, 18, 14, palette.text).setStrokeStyle(4, palette.panel),
            s.add.circle(28, 18, 14, palette.text).setStrokeStyle(4, palette.panel)
          ]);
          const vehicleHalfWidth = 47;
          const safetyGap = 16;
          const startX = -270;
          const safeLimitX = obstacleX - vehicleHalfWidth - safetyGap;
          const availablePixels = safeLimitX - startX;
          const ratio = clamp(result.stoppingDistance / Math.max(.1, result.obstacleDistance), 0, 1.35);
          const stopX = startX + availablePixels * ratio;
          const stopMark = s.add.rectangle(stopX, 46, 5, 44, result.safeStop ? palette.accent : palette.danger, .9);
          apparatus.add([track, obstacle, stopMark, vehicle]);
          s.tweens.add({
            targets: vehicle,
            x: result.safeStop ? Math.min(stopX, safeLimitX) : Math.min(stopX, obstacleX - vehicleHalfWidth + 10),
            duration: 1150,
            ease: "Cubic.out",
            onComplete: () => {
              if (!result.safeStop) s.cameras.main.shake(180, .009);
            }
          });
          metric(`v₀ ${result.initialVelocity.toFixed(1)} m/s · a ${result.acceleration.toFixed(2)} m/s² · parada ${result.stoppingDistance.toFixed(1)} m`);
        } else if (result.id === "gravity-fall" && evidenceVariant === "mass") {
          const floor = s.add.rectangle(0, 82, 560, 14, palette.ground).setStrokeStyle(3, palette.accent);
          const lightObject = s.add.circle(-145, -82, 17, palette.highlight).setStrokeStyle(4, 0xffffff);
          const heavyObject = s.add.circle(145, -82, 31, palette.accent).setStrokeStyle(5, 0xffffff);
          const lightLabel = s.add.text(-145, -112, "MASA MENOR", {
            fontFamily: theme.font, fontSize: "13px", fontStyle: "bold", color: theme.text
          }).setOrigin(.5);
          const heavyLabel = s.add.text(145, -122, "MASA MAYOR", {
            fontFamily: theme.font, fontSize: "13px", fontStyle: "bold", color: theme.text
          }).setOrigin(.5);
          apparatus.add([floor, lightObject, heavyObject, lightLabel, heavyLabel]);
          s.tweens.add({
            targets: [lightObject, heavyObject],
            y: 58,
            duration: clamp(Number(result.fallTime) * 1000, 650, 2800),
            ease: "Quad.easeIn"
          });
          metric(`Ambas masas caen con g = ${Number(result.gravity).toFixed(2)} m/s²`);
        } else if (result.id === "gravity-fall" && evidenceVariant === "acceleration") {
          const guide = s.add.graphics();
          guide.lineStyle(4, palette.accent, .62).lineBetween(-210, -90, -210, 82);
          for (let index = 0; index < 5; index += 1) {
            const length = 28 + index * 28;
            guide.lineStyle(5, palette.danger, .72).lineBetween(-150 + index * 76, -72 + index * 33, -150 + index * 76, -72 + index * 33 + length);
            guide.fillStyle(palette.danger, .72).fillTriangle(
              -158 + index * 76, -72 + index * 33 + length - 4,
              -142 + index * 76, -72 + index * 33 + length - 4,
              -150 + index * 76, -72 + index * 33 + length + 12
            );
          }
          const object = s.add.circle(-210, -90, 23, palette.highlight).setStrokeStyle(5, 0xffffff);
          apparatus.add([guide, object]);
          s.tweens.add({ targets: object, y: 72, duration: clamp(Number(result.fallTime) * 1000, 650, 2800), ease: "Quad.easeIn" });
          metric(`Aceleración constante: ${Number(result.acceleration).toFixed(2)} m/s²`);
        } else if (result.id === "gravity-fall") {
          const tower = s.add.rectangle(205, 0, 18, 220, palette.text, .2);
          const floor = s.add.rectangle(205, 88, 190, 14, palette.ground).setStrokeStyle(3, palette.accent);
          const fallingObject = s.add.circle(135, -90, 22, palette.highlight).setStrokeStyle(5, 0xffffff, .9);
          const ruler = s.add.text(245, -82, `h ${Number(result.height).toFixed(1)} m\ng ${Number(result.gravity).toFixed(2)} m/s²`, {
            fontFamily: theme.font, fontSize: "15px", fontStyle: "bold", color: theme.text, lineSpacing: 8
          });
          apparatus.add([tower, floor, fallingObject, ruler]);
          s.tweens.add({
            targets: fallingObject,
            y: 62,
            duration: clamp(Number(result.fallTime) * 1000, 650, 3200),
            ease: "Quad.easeIn"
          });
          metric(`Caída: ${Number(result.fallTime).toFixed(2)} s · impacto ${Number(result.impactVelocity).toFixed(1)} m/s`);
        } else if (result.id === "circular-motion") {
          const orbitRadius = clamp(Number(result.radius) * 15, 78, 122);
          const rotation = s.add.container(0, -4);
          const platform = s.add.graphics();
          platform.fillStyle(palette.surface, .38).fillCircle(0, 0, orbitRadius + 32);
          platform.lineStyle(12, palette.surface, .92).strokeCircle(0, 0, orbitRadius + 12);
          platform.lineStyle(4, result.stableOrbit ? palette.accent : palette.danger, .95).strokeCircle(0, 0, orbitRadius);
          platform.lineStyle(2, palette.highlight, .62).strokeCircle(0, 0, 34);
          const arm = s.add.rectangle(orbitRadius / 2, 0, orbitRadius, 5, palette.text, .52).setOrigin(.5);
          const hub = s.add.circle(0, 0, 22, palette.panel).setStrokeStyle(5, palette.highlight);
          const module = s.add.container(orbitRadius, 0);
          const moduleBody = s.add.roundedRectangle
            ? s.add.roundedRectangle(0, 0, 58, 46, 12, palette.highlight).setStrokeStyle(4, 0xffffff)
            : s.add.rectangle(0, 0, 58, 46, palette.highlight).setStrokeStyle(4, 0xffffff);
          module.add(moduleBody);
          drawKawaiiFace(s, module, 0, -2, .55);
          const inwardArrow = s.add.text(orbitRadius * .48, -36, "← Fc", {
            fontFamily: theme.font, fontSize: "16px", fontStyle: "bold", color: theme.accent
          }).setOrigin(.5);
          const slipWarning = s.add.text(0, orbitRadius + 38, result.stableOrbit
            ? "ÓRBITA ESTABLE"
            : "DESLIZAMIENTO: Fc SUPERA LA FRICCIÓN", {
            fontFamily: theme.font, fontSize: "14px", fontStyle: "bold",
            color: result.stableOrbit ? theme.accent : theme.danger
          }).setOrigin(.5);
          rotation.add([platform, arm, hub, module, inwardArrow, slipWarning]);
          apparatus.add(rotation);
          const turnsPerSecond = clamp(Number(result.angularVelocity), .2, 2.2);
          s.tweens.add({
            targets: rotation,
            angle: 360,
            duration: 1000 / turnsPerSecond,
            repeat: -1,
            ease: "Linear"
          });
          if (!result.stableOrbit) {
            s.tweens.add({
              targets: module,
              x: orbitRadius + 72,
              duration: 920,
              ease: "Quad.in",
              onComplete: () => s.cameras.main.shake(180, .007)
            });
          }
          metric(`ω ${Number(result.angularVelocity).toFixed(2)} rad/s · Fc ${Number(result.centripetalForce).toFixed(1)} N · límite ${Number(result.maxStaticFriction).toFixed(1)} N`);
        } else if (result.id === "uniform-motion") {
          const track = s.add.rectangle(0, 62, 610, 16, palette.ground).setStrokeStyle(2, palette.accent);
          const startMark = s.add.rectangle(-268, 35, 4, 62, palette.highlight, .9);
          const finishMark = s.add.rectangle(268, 35, 4, 62, palette.accent, .9);
          const vehicle = s.add.container(-250, 22);
          vehicle.add([
            s.add.rectangle(0, 0, 82, 54, palette.surface).setStrokeStyle(4, palette.accent),
            s.add.circle(-25, 27, 12, palette.text).setStrokeStyle(3, palette.panel),
            s.add.circle(25, 27, 12, palette.text).setStrokeStyle(3, palette.panel)
          ]);
          drawKawaiiFace(s, vehicle, 0, -5, .48);
          const velocityLabel = s.add.text(0, -70, `v = ${Number(result.velocity).toFixed(1)} m/s  ·  a = 0`, {
            fontFamily: theme.font, fontSize: "16px", fontStyle: "bold", color: theme.accent
          }).setOrigin(.5);
          apparatus.add([track, startMark, finishMark, vehicle, velocityLabel]);
          s.tweens.add({
            targets: vehicle,
            x: 250,
            duration: clamp(Number(result.time) * 360, 1200, EVIDENCE_CHECK_ANIMATION_MS),
            ease: "Linear"
          });
          metric(`Distancia recorrida: ${Number(result.distance).toFixed(1)} m en ${Number(result.time).toFixed(1)} s`);
        } else if (result.id === "newton-motion") {
          const track = s.add.rectangle(0, 62, 560, 16, palette.ground).setStrokeStyle(2, palette.accent);
          const crate = s.add.container(-225, 25);
          crate.add([
            s.add.rectangle(0, 0, 78, 64, palette.surface).setStrokeStyle(4, palette.accent),
            s.add.text(0, 0, "→", { fontFamily: theme.font, fontSize: "30px", fontStyle: "bold", color: theme.text }).setOrigin(.5)
          ]);
          const force = s.add.text(-300, -50, `FUERZA ${Number(preset.force || 0)} N  →`, {
            fontFamily: theme.font, fontSize: "15px", fontStyle: "bold", color: theme.accent
          });
          const resistance = s.add.text(90, 42, `←  RESISTENCIA ${Number(preset.friction || 0)} N`, {
            fontFamily: theme.font, fontSize: "13px", fontStyle: "bold", color: theme.danger
          });
          apparatus.add([track, crate, force, resistance]);
          s.tweens.add({ targets: crate, x: clamp(result.acceleration * 50, -80, 235), duration: 720, ease: "Cubic.out" });
          metric(`Aceleración medida: ${Number(result.acceleration).toFixed(2)} m/s²`);
        } else if (result.id === "projectile-motion") {
          const path = s.add.graphics();
          path.lineStyle(4, palette.accent, .6);
          const range = clamp(Number(result.range || 1), 2, 45);
          let lastX = -280;
          let lastY = 66;
          for (let step = 1; step <= 20; step += 1) {
            const ratio = step / 20;
            const x = -280 + ratio * 560;
            const y = 66 - Math.sin(ratio * Math.PI) * clamp(range * 3.2, 35, 125);
            path.lineBetween(lastX, lastY, x, y);
            lastX = x;
            lastY = y;
          }
          const launcher = s.add.circle(-280, 66, 25, palette.surface).setStrokeStyle(4, palette.accent);
          const ball = s.add.circle(-280, 66, 11, palette.highlight).setStrokeStyle(3, 0xffffff);
          apparatus.add([path, launcher, ball]);
          s.tweens.addCounter({
            from: 0, to: 1, duration: 720,
            onUpdate: (tween) => {
              const ratio = tween.getValue();
              ball.setPosition(-280 + ratio * 560, 66 - Math.sin(ratio * Math.PI) * clamp(range * 3.2, 35, 125));
            }
          });
          metric(`Alcance medido: ${range.toFixed(1)} m`);
        } else if (result.id === "ohm-circuit") {
          const circuit = s.add.graphics();
          circuit.lineStyle(9, palette.accent, .74).strokeRoundedRect(-250, -65, 500, 132, 32);
          apparatus.add(circuit);
          for (let index = 0; index < 8; index += 1) {
            const charge = s.add.circle(-220 + index * 58, -65, 7, palette.highlight);
            apparatus.add(charge);
            s.tweens.add({ targets: charge, x: charge.x + 52, duration: clamp(850 / Math.max(.2, result.current), 230, 1400), repeat: -1 });
          }
          const glow = s.add.circle(0, 0, 54, palette.highlight, clamp(result.current / 4, .12, .62));
          const bulb = s.add.circle(0, 0, 28, palette.highlight).setStrokeStyle(4, 0xffffff);
          apparatus.add([glow, bulb]);
          s.tweens.add({ targets: glow, scale: 1.25, alpha: .15, duration: 480, yoyo: true, repeat: -1 });
          metric(`Corriente: ${Number(result.current).toFixed(2)} A`);
        } else if (["energy-work", "fluid-pressure"].includes(result.id)) {
          const base = s.add.rectangle(0, 70, 480, 18, palette.ground).setStrokeStyle(2, palette.accent);
          const left = s.add.rectangle(-150, 5, 75, 120, palette.surface).setStrokeStyle(3, palette.accent);
          const right = s.add.rectangle(150, 5, 110, 120, palette.surface).setStrokeStyle(3, palette.accent);
          const load = s.add.rectangle(result.id === "fluid-pressure" ? 150 : 0, 28, 90, 48, palette.highlight).setStrokeStyle(3, 0xffffff);
          apparatus.add([base, left, right, load]);
          s.tweens.add({ targets: load, y: -58, duration: 690, ease: "Sine.out" });
          metric(result.id === "fluid-pressure"
            ? `Presión: ${Number(result.pressure).toFixed(1)} Pa`
            : `Energía: ${Number(result.energy).toFixed(1)} J`);
        } else if (result.id === "wave-motion") {
          const wave = s.add.graphics();
          wave.lineStyle(6, palette.accent, .9);
          let previousX = -285;
          let previousY = 0;
          for (let x = -280; x <= 285; x += 8) {
            const y = Math.sin((x + 280) / Math.max(15, Number(preset.wavelength || 3) * 8))
              * clamp(Number(preset.amplitude || 2) * 11, 18, 82);
            wave.lineBetween(previousX, previousY, x, y);
            previousX = x;
            previousY = y;
          }
          const detector = s.add.rectangle(286, 0, 26, 160, palette.surface).setStrokeStyle(3, palette.highlight);
          apparatus.add([wave, detector]);
          s.tweens.add({ targets: wave, x: 18, duration: 320, yoyo: true, repeat: 2 });
          metric(`Velocidad de onda: ${Number(result.speed).toFixed(1)} m/s`);
        } else if (result.id === "optics-refraction") {
          const optics = s.add.graphics();
          optics.fillStyle(palette.surface, .78).fillTriangle(-35, -78, -98, 72, 35, 72);
          optics.lineStyle(6, palette.highlight).lineBetween(-290, -42, -55, 0);
          optics.lineStyle(6, palette.accent).lineBetween(-55, 0, 275, clamp(Number(result.angle) * 2 - 45, -75, 80));
          apparatus.add([optics, s.add.circle(-290, -42, 22, palette.highlight).setStrokeStyle(3, 0xffffff)]);
          metric(`Ángulo refractado: ${Number(result.angle).toFixed(1)}°`);
        } else if (["particle-collision", "stoichiometry", "solution-concentration"].includes(result.id)) {
          const chamber = s.add.graphics();
          chamber.fillStyle(palette.surface, .4).fillRoundedRect(-290, -78, 580, 155, 38);
          chamber.lineStyle(4, palette.accent, .75).strokeRoundedRect(-290, -78, 580, 155, 38);
          apparatus.add(chamber);
          particles(result.id === "particle-collision" ? 22 : 16, [palette.accent, palette.highlight, palette.ground, palette.text]);
          metric(result.id === "stoichiometry"
            ? `Producto: ${Number(result.product).toFixed(2)} mol`
            : result.id === "solution-concentration"
              ? `Concentración: ${Number(result.concentration).toFixed(2)} mol/L`
              : `Colisiones: ${Number(result.collisionRate).toFixed(1)}`);
        } else if (["cell-transport", "cell-energy"].includes(result.id)) {
          apparatus.add([
            s.add.circle(0, 2, 108, palette.surface, .62).setStrokeStyle(8, palette.accent, .76),
            s.add.circle(0, 2, 38, palette.highlight, .88).setStrokeStyle(3, 0xffffff, .7)
          ]);
          particles(14, [palette.accent, palette.highlight]);
          metric(result.id === "cell-energy"
            ? `ATP relativo: ${Number(result.energy).toFixed(0)}%`
            : `Flujo de membrana: ${Number(result.flux).toFixed(1)}`);
        } else if (result.id === "ecosystem-balance") {
          apparatus.add(s.add.ellipse(0, 58, 570, 96, palette.ground, .86));
          ["🌿", "🌱", "🦋", "🌳", "🐝", "🌾"].forEach((symbol, index) => {
            const item = s.add.text(-250 + index * 98, 8 - (index % 2) * 38, symbol, { fontSize: "34px" });
            apparatus.add(item);
            s.tweens.add({ targets: item, y: item.y - 8, duration: 640 + index * 75, yoyo: true, repeat: -1 });
          });
          metric(`Estabilidad: ${Number(result.balance).toFixed(0)}%`);
        } else {
          const punnett = s.add.graphics();
          punnett.lineStyle(4, palette.accent, .75).strokeRect(-120, -78, 240, 156);
          punnett.lineBetween(0, -78, 0, 78);
          punnett.lineBetween(-120, 0, 120, 0);
          apparatus.add(punnett);
          ["A", "a", "A", "a"].forEach((gene, index) => {
            apparatus.add(s.add.text(-60 + index % 2 * 120, -39 + Math.floor(index / 2) * 78, gene, {
              fontFamily: theme.font, fontSize: "28px", fontStyle: "bold", color: index % 2 ? theme.muted : theme.accent
            }).setOrigin(.5));
          });
          metric(`Probabilidad: ${(Number(result.probability) * 100).toFixed(0)}%`);
        }
        apparatus.setAlpha(0).setScale(.54);
        s.tweens.add({
          targets: apparatus,
          alpha: 1,
          scale: .72,
          duration: 420,
          ease: "Back.out"
        });
      };
      const startEvidenceTrial = (answerIndex, answerWasCorrect) => {
        if (evidence || settled) return;
        selectedAnswerIndex = Math.max(0, Number(answerIndex) || 0);
        const indexedPreset = question.type === "multiple"
          ? experimentConfig.answerPresets?.[selectedAnswerIndex] || {}
          : {};
        const authoritativePreset = answerWasCorrect
          ? experimentConfig.correctPreset || {}
          : experimentConfig.incorrectPreset || {};
        const preset = { ...indexedPreset, ...authoritativePreset };
        evidence = evaluateScienceModel({
          ...payload,
          profile: { ...profile, modelId: experimentConfig.modelId || profile.modelId },
          experimentValues: preset
        });
        evidence.expectedAnswer = Boolean(answerWasCorrect);
        evidence.preset = preset;
        clearZones();
        actor.setVisible(true);
        runway.setVisible(true);
        keywordConsole?.classList.add("is-hidden");
        if (answerConsole) {
          answerConsole.classList.add("is-exiting");
          window.setTimeout(() => answerConsole?.classList.add("is-hidden"), 340);
        }
        body.vx = 0;
        body.vy = 0;
        body.grounded = true;
        experimentArmedAt = s.time.now + 260;
        feedback
          .setText("HIPÓTESIS CARGADA · pulsa EXPERIMENTAR para aplicar las variables")
          .setColor(theme.text)
          .setBackgroundColor(theme.highlight);
        formulaText.setText("Variables cargadas · ejecuta la prueba para obtener la medición");
        if (checkControl?.button) checkControl.button.setVisible(true);
        if (checkControl?.text) checkControl.text.setText("Experimentar");
      };
      const runEvidenceExperiment = () => {
        if (!evidence || experimentStarted || settled || s.time.now < experimentArmedAt) return;
        experimentStarted = true;
        createEvidenceApparatus(evidence, evidence.preset || {});
        feedback
          .setText(`EXPERIMENTO EN CURSO · ${evidence.formula}`)
          .setColor(theme.text)
          .setBackgroundColor(theme.highlight);
        formulaText.setText(evidence.formula);
        s.time.delayedCall(1250, () => {
          if (settled) return;
          evidenceReady = true;
          feedback
            .setText(`MEDICIÓN REGISTRADA · ${evidence.formula} · pulsa COMPROBAR`)
            .setColor(theme.text)
            .setBackgroundColor(theme.panel);
          if (checkControl?.text) checkControl.text.setText("Comprobar");
          const keywordSubmit = keywordConsole?.querySelector('button[type="submit"]');
          if (keywordSubmit) {
            keywordSubmit.disabled = false;
            keywordSubmit.textContent = "Comprobar";
          }
        });
      };
      const checkEvidence = () => {
        if (!evidenceReady || evidenceChecked || settled) return;
        evidenceChecked = true;
        const objectivePassed = validateScienceObjective(evidence, experimentConfig.objective || {});
        evidence.objectivePassed = objectivePassed;
        const hasAnswerVerdict = typeof evidence.expectedAnswer === "boolean";
        const confirmedCorrect = hasAnswerVerdict ? evidence.expectedAnswer : objectivePassed;
        createEvidenceApparatus(evidence, evidence.preset || {});
        feedback
          .setText(`COMPROBANDO LA EVIDENCIA · observa el experimento · ${evidence.formula}`)
          .setColor(theme.text)
          .setBackgroundColor(theme.highlight);
        if (checkControl?.text) checkControl.text.setText("Comprobando…");
        checkControl?.button?.disableInteractive();
        const keywordSubmit = keywordConsole?.querySelector('button[type="submit"]');
        if (keywordSubmit) {
          keywordSubmit.disabled = true;
          keywordSubmit.textContent = "Comprobando…";
        }
        const replayDuration = evidence.id === "gravity-fall"
          ? clamp(Number(evidence.fallTime) * 1000 + 180, 900, 3380)
          : EVIDENCE_CHECK_ANIMATION_MS;
        s.time.delayedCall(replayDuration, () => {
          if (!settled) complete(confirmedCorrect);
        });
      };
      const normalizeKeyword = (value) => String(value || "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
      const createKeywordConsole = () => {
        if (keywordConsole) return;
        const parent = s.game.canvas.parentElement;
        if (!parent) return;
        parent.classList.add("has-keyword-game-console");
        const form = document.createElement("form");
        form.className = "science-keyword-game-console";
        form.setAttribute("aria-label", "Responder palabra clave");
        const label = document.createElement("label");
        label.className = "science-keyword-game-label";
        label.textContent = "Escribe tu respuesta";
        const input = document.createElement("input");
        input.className = "science-keyword-game-input";
        input.type = "text";
        input.autocomplete = "off";
        input.spellcheck = false;
        input.placeholder = "Palabra clave…";
        input.setAttribute("aria-label", "Palabra clave");
        const submit = document.createElement("button");
        submit.className = "science-keyword-game-submit";
        submit.type = "submit";
        submit.textContent = "Comprobar";
        form.append(label, input, submit);
        input.addEventListener("keydown", (event) => event.stopPropagation());
        input.addEventListener("keyup", (event) => event.stopPropagation());
        input.addEventListener("keypress", (event) => event.stopPropagation());
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          if (settled) return;
          if (evidenceReady) {
            checkEvidence();
            return;
          }
          const entered = input.value.trim();
          if (!entered) {
            input.focus();
            return;
          }
          attempts += 1;
          const normalizedEntered = normalizeKeyword(entered);
          const compactEntered = normalizedEntered.replace(/\s+/g, "");
          const isCorrect = acceptedKeywords.some((accepted) => {
            const normalizedAccepted = normalizeKeyword(accepted);
            return normalizedAccepted === normalizedEntered
              || normalizedAccepted.replace(/\s+/g, "") === compactEntered;
          });
          if (!isCorrect) {
            response.push(entered);
            input.disabled = true;
            submit.disabled = true;
            startEvidenceTrial(1, false);
            return;
          }
          response.push(entered);
          input.disabled = true;
          submit.disabled = true;
          input.classList.add("is-correct");
          startEvidenceTrial(0, true);
        });
        parent.appendChild(form);
        keywordConsole = form;
        if (s.input.keyboard) s.input.keyboard.enabled = false;
        window.setTimeout(() => {
          if (s.input.keyboard) s.input.keyboard.enabled = false;
          input.focus();
        }, 80);
      };
      const createMultipleChoiceConsole = (data) => {
        if (answerConsole) return;
        const parent = s.game.canvas.parentElement;
        if (!parent) return;
        parent.classList.add("has-answer-game-console");
        const panel = document.createElement("section");
        panel.className = "science-rive-answer-deck";
        panel.setAttribute("role", "group");
        panel.setAttribute("aria-label", "Opciones de respuesta");
        const heading = document.createElement("div");
        heading.className = "science-rive-answer-heading";
        heading.innerHTML = "<span>Selecciona una hipótesis</span><b>TOCA · HAZ CLIC · USA TAB</b>";
        const list = document.createElement("div");
        list.className = "science-rive-answer-list";
        data.options.forEach((option, index) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "science-rive-answer-card";
          button.dataset.riveAnswer = String(index);
          button.dataset.correct = String(index === data.correct);
          button.setAttribute("aria-label", `Opción ${String.fromCharCode(65 + index)}: ${option}`);
          button.setAttribute("aria-pressed", "false");
          const riveSurface = document.createElement("i");
          riveSurface.className = "science-rive-answer-surface";
          riveSurface.setAttribute("data-science-rive-hud", "");
          riveSurface.setAttribute("data-rive-artboard", "New Artboard");
          riveSurface.setAttribute("data-rive-state-machine", "State Machine 1");
          riveSurface.setAttribute("data-rive-fit", "contain");
          riveSurface.setAttribute("aria-hidden", "true");
          riveSurface.appendChild(document.createElement("canvas"));
          const badge = document.createElement("span");
          badge.className = "science-rive-answer-badge";
          badge.textContent = String.fromCharCode(65 + index);
          const copy = document.createElement("strong");
          copy.textContent = option;
          const cue = document.createElement("small");
          cue.textContent = "Probar esta hipótesis";
          button.append(riveSurface, badge, copy, cue);
          button.addEventListener("pointerenter", () => {
            if (!panel.classList.contains("is-locked")) window.ScienceRiveHud?.setState(riveSurface, "active");
          });
          button.addEventListener("focus", () => {
            if (!panel.classList.contains("is-locked")) window.ScienceRiveHud?.setState(riveSurface, "active");
          });
          button.addEventListener("click", () => {
            if (settled || panel.classList.contains("is-locked")) return;
            attempts += 1;
            const isCorrect = index === data.correct;
            panel.classList.add("is-locked");
            response.push(option);
            button.setAttribute("aria-pressed", "true");
            button.classList.add("is-selected", isCorrect ? "is-correct" : "is-incorrect");
            list.querySelectorAll("button").forEach((candidate) => {
              candidate.disabled = true;
              if (candidate !== button) candidate.classList.add("is-muted");
            });
            window.ScienceRiveHud?.setState(riveSurface, isCorrect ? "correct" : "incorrect");
            if (navigator.vibrate) navigator.vibrate(isCorrect ? 35 : [30, 45, 30]);
            window.setTimeout(() => startEvidenceTrial(index, isCorrect), 420);
          });
          list.appendChild(button);
        });
        panel.append(heading, list);
        parent.appendChild(panel);
        answerConsole = panel;
        window.requestAnimationFrame(() => window.ScienceRiveHud?.mountAll(panel));
      };
      const choose = (zone) => {
        if (!zone || settled || roundLocked) return;
        attempts += 1;
        if (!zone.correct) {
          response.push(zone.value);
          startEvidenceTrial(zones.indexOf(zone), false);
          return;
        }
        roundLocked = true;
        response.push(zone.value);
        const current = round();
        feedback.setText("DATO CAPTURADO · siguiente fase").setColor(theme.text).setBackgroundColor(theme.highlight);
        s.tweens.add({
          targets: zone.object, y: zone.y - 18, scale: 1.08, alpha: .35, duration: 240,
          onComplete: () => {
            stage += 1;
            if (question.type === "multiple" || stage >= current.total) {
              startEvidenceTrial(zones.indexOf(zone), true);
            }
            else {
              roundLocked = false;
              renderRound();
            }
          }
        });
      };
      this.questionReviewCorrectAnswer = () => {
        if (settled || experimentStarted) return false;
        attempts += 1;
        if (question.type === "keyword") {
          const input = keywordConsole?.querySelector("input");
          if (input) input.value = keyword;
          response.push(keyword);
        } else if (question.type === "matching") {
          response.push(...pairs.map((pair) => pair.right));
          const correctZone = zones.find((zone) => zone.correct);
          correctZone?.object?.setScale(1.08);
        } else {
          const data = round();
          response.push(data.options[data.correct]);
          const correctCard = answerConsole?.querySelector(`[data-rive-answer="${data.correct}"]`);
          if (correctCard) {
            correctCard.classList.add("is-selected", "is-correct");
            window.ScienceRiveHud?.setState(correctCard.querySelector("[data-science-rive-hud]"), "correct");
          } else {
            const correctZone = zones.find((zone) => zone.correct);
            correctZone?.object?.setScale(1.08);
          }
        }
        s.time.delayedCall(180, () => complete(true));
        return true;
      };
      const seededUnit = (salt = 0) => {
        const seedText = `${question.prompt || ""}:${stage}:${salt}`;
        let hash = 2166136261;
        for (const character of seedText) {
          hash ^= character.codePointAt(0);
          hash = Math.imul(hash, 16777619);
        }
        return ((hash >>> 0) % 10000) / 10000;
      };
      const renderRound = () => {
        clearZones();
        const data = round();
        sceneQuestion.setText(
          question.type === "matching"
            ? `ELEMENTO A EMPAREJAR: “${data.title}”`
            : question.type === "multiple"
              ? String(question.prompt || "")
              : "ESCRIBE EL CONCEPTO O PALABRA CLAVE"
        );
        feedback
          .setText(question.type === "keyword"
            ? "Escribe el concepto, ejecuta la prueba y pulsa COMPROBAR"
            : question.type === "matching"
              ? "Activa la cápsula con la relación que deseas probar"
              : "Activa la cápsula con la hipótesis que deseas probar")
          .setColor(theme.text)
          .setBackgroundColor(theme.panel);
        instruction.setText("");
        if (question.type === "keyword") {
          actor.setVisible(false);
          createKeywordConsole();
          return;
        }
        if (question.type === "multiple") {
          actor.setVisible(false);
          runway.setVisible(false);
          createMultipleChoiceConsole(data);
          return;
        }
        const slots = [
          { x: 190 + seededUnit(1) * 45, y: 224 + seededUnit(4) * 10 },
          { x: 438 + seededUnit(2) * 70, y: 210 + seededUnit(5) * 10 },
          { x: 710 + seededUnit(3) * 55, y: 224 + seededUnit(6) * 10 }
        ].sort(() => seededUnit(7) - .5);
        const positions = data.options.length === 2 ? [slots[0], slots[2]] : slots;
        zones = data.options.map((option, index) => {
          const { x, y } = positions[index];
          const object = add(s.add.container(x, y).setDepth(9002));
          const optionLabel = String(option);
          const optionFontSize = optionLabel.length > 52 ? "11px" : optionLabel.length > 34 ? "12px" : "14px";
          const glow = s.add.graphics();
          glow.fillStyle(palette.accent, .12).fillRoundedRect(-126, -50, 252, 100, 28);
          const plate = s.add.graphics();
          plate.fillStyle(index % 2 ? palette.surface : palette.panel, .98).fillRoundedRect(-118, -42, 236, 84, 22);
          plate.lineStyle(isKawaiiTheme ? 4 : 3, isKawaiiTheme ? 0xffffff : palette.accent, isKawaiiTheme ? .94 : .82)
            .strokeRoundedRect(-118, -42, 236, 84, 22);
          if (isKawaiiTheme) {
            plate.lineStyle(2, palette.accent, .78).strokeRoundedRect(-114, -38, 228, 76, 19);
          }
          plate.lineStyle(1, palette.highlight, .52).strokeRoundedRect(-110, -34, 220, 68, 17);
          const badgeGlow = s.add.circle(-92, 0, 20, palette.accent, .16);
          const badge = s.add.circle(-92, 0, 15, palette.accent, .94);
          const letter = s.add.text(-92, 0, String.fromCharCode(65 + index), {
            fontFamily: theme.font, fontSize: "13px", fontStyle: "bold", color: theme.panel
          }).setOrigin(.5);
          const label = s.add.text(18, 3, optionLabel, {
            fontFamily: theme.font, fontSize: optionFontSize, fontStyle: "bold", color: theme.text,
            align: "center", wordWrap: { width: 176, useAdvancedWrap: true }, maxLines: 3,
            lineSpacing: 2
          }).setOrigin(.5);
          const kawaiiParts = [];
          if (isKawaiiTheme) {
            const antennaLeft = s.add.circle(-34, -35, 7, palette.highlight, .94).setStrokeStyle(2, 0xffffff, .9);
            const antennaRight = s.add.circle(34, -35, 7, palette.accent, .84).setStrokeStyle(2, 0xffffff, .9);
            const eyeLeft = s.add.circle(76, -27, 2.7, palette.text, .92);
            const eyeRight = s.add.circle(88, -27, 2.7, palette.text, .92);
            const eyeShineLeft = s.add.circle(75, -28, .8, 0xffffff, .94);
            const eyeShineRight = s.add.circle(87, -28, .8, 0xffffff, .94);
            const cheekLeft = s.add.ellipse(66, -19, 10, 5, palette.accent, .3);
            const cheekRight = s.add.ellipse(98, -19, 10, 5, palette.accent, .3);
            const smile = s.add.arc(82, -21, 7, 18, 162, false, palette.text, .9);
            kawaiiParts.push(antennaLeft, antennaRight, eyeLeft, eyeRight, cheekLeft, cheekRight, smile);
            kawaiiParts.push(eyeShineLeft, eyeShineRight);
            label.setPosition(5, 9);
            label.setWordWrapWidth(158, true);
          }
          object.add([glow, plate, ...kawaiiParts, badgeGlow, badge, letter, label]).setSize(244, 100).setInteractive({ useHandCursor: true });
          s.tweens.add({
            targets: glow,
            alpha: .46,
            scaleX: 1.035,
            scaleY: 1.06,
            duration: 1100 + index * 120,
            yoyo: true,
            repeat: -1,
            ease: "Sine.inOut"
          });
          object.on("pointerdown", () => {
            pointerTarget = x;
          });
          zoneObjects.push(object);
          return { x, y, width: 244, height: 100, object, value: option, correct: index === data.correct };
        });
      };
      const touchButton = (x, label, key) => {
        const isAction = key === "action";
        const button = add(s.add.container(x, 494).setDepth(9010));
        const plate = isAction
          ? s.add.rectangle(0, 0, 132, 54, palette.panel, .98).setStrokeStyle(2, palette.accent, .9)
          : s.add.circle(0, 0, 28, palette.panel, .96).setStrokeStyle(2, palette.accent, .8);
        const text = s.add.text(0, 0, label, {
          fontFamily: theme.font,
          fontSize: isAction ? "14px" : "19px",
          fontStyle: "bold",
          color: theme.text
        }).setOrigin(.5);
        button.add([plate, text]).setSize(isAction ? 136 : 58, 58).setInteractive({ useHandCursor: true });
        button.on("pointerdown", () => { touch[key] = true; });
        button.on("pointerup", () => {
          if (!isAction) touch[key] = false;
        });
        button.on("pointerout", () => {
          if (!isAction) touch[key] = false;
        });
        return { button, text };
      };
      let checkControl = null;
      const leftControl = touchButton(68, "◀", "left");
      const rightControl = touchButton(136, "▶", "right");
      checkControl = touchButton(850, "Saltar", "action");
      if (question.type === "keyword") {
        leftControl.button.setVisible(false);
        rightControl.button.setVisible(false);
        checkControl.button.setVisible(false);
      }
      const update = (_time, delta) => {
        if (settled) return;
        const dt = Math.min(delta, 34) / 1000;
        const previousTop = actor.y - 24;
        const left = keys.A?.isDown || keys.LEFT?.isDown || touch.left;
        const right = keys.D?.isDown || keys.RIGHT?.isDown || touch.right;
        if (left) body.vx -= acceleration * dt;
        if (right) body.vx += acceleration * dt;
        if (pointerTarget != null) {
          const distance = pointerTarget - actor.x;
          if (Math.abs(distance) > 13) body.vx += Math.sign(distance) * acceleration * dt;
          else {
            body.vx *= .6;
            pointerTarget = null;
            touch.action = true;
          }
        }
        const jump = Phaser.Input.Keyboard.JustDown(keys.W)
          || Phaser.Input.Keyboard.JustDown(keys.UP)
          || Phaser.Input.Keyboard.JustDown(keys.SPACE)
          || Phaser.Input.Keyboard.JustDown(keys.E)
          || touch.action;
        touch.action = false;
        if (jump && evidence) {
          const interaction = String(
            question.experiment?.interaction
            || question.gameplay?.interaction
            || question.gameplay?.mechanic
            || "",
          ).toLowerCase();
          const actionPose = interaction.includes("pull") || interaction.includes("jalar")
            ? "pull"
            : interaction.includes("throw") || interaction.includes("launch") || interaction.includes("aventar")
              ? "throw"
              : interaction.includes("push") || interaction.includes("empujar")
                ? "push"
                : interaction.includes("crouch") || interaction.includes("agachar")
                  ? "crouch"
                  : interaction.includes("hit") || interaction.includes("strike") || interaction.includes("golpear")
                    ? "hit"
                    : "hit";
          setActorPose(actionPose);
          hitPoseUntil = s.time.now + 720;
          if (!experimentStarted) runEvidenceExperiment();
          else if (evidenceReady) checkEvidence();
          return;
        }
        if (jump && body.grounded) {
          body.vy = -520;
          body.grounded = false;
        }
        body.vy += gravity * dt;
        body.vx = clamp(body.vx, -315, 315);
        actor.x = clamp(actor.x + body.vx * dt, 50, 910);
        actor.y += body.vy * dt;
        if (body.vy < 0 && question.type !== "keyword") {
          const currentTop = actor.y - 24;
          const hitZone = zones.find((zone) => {
            const blockBottom = zone.y + zone.height / 2;
            return previousTop > blockBottom
              && currentTop <= blockBottom
              && Math.abs(actor.x - zone.x) <= zone.width / 2 - 8;
          });
          if (hitZone) {
            body.vy = 145;
            choose(hitZone);
          }
        }
        if (actor.y >= 382) {
          actor.y = 382;
          body.vy = 0;
          body.grounded = true;
        }
        body.vx *= Math.pow(drag, delta / 16.67);
        if (s.time.now >= hitPoseUntil) {
          if (!body.grounded) setActorPose(body.vy < 0 ? "jump" : "fall");
          else if (Math.abs(body.vx) > 28) setActorPose("run");
          else setActorPose("idle");
        }
        if (body.vx < -18) facingDirection = -1;
        else if (body.vx > 18) facingDirection = 1;
        actor.scaleX = facingDirection;
        actorGlow.alpha = .16 + Math.min(.34, Math.abs(body.vx) / 900);
      };
      this.questionMiniGameCleanup = cleanup;
      renderRound();
      s.events.on("update", update);
    });
  }

  playQuestionEffect(profile = {}, correct = true) {
    const s = this.scene;
    if (!s) return;
    if (this.questionFx) {
      s.tweens.killTweensOf(this.questionFx.list || []);
      this.questionFx.destroy(true);
    }
    const variant = profile.variant || "energy-transfer";
    const sequence = Number(profile.sequence || 0);
    const accent = correct ? colorInt(this.configData.scenario?.accent, 0x48d8c8) : 0xff5f78;
    const secondary = correct ? 0xc4f05c : 0xffb36b;
    const duration = 620 + sequence * 90;
    const fx = s.add.container(0, 0).setDepth(80);
    this.questionFx = fx;
    const add = (object) => { fx.add(object); return object; };
    const circle = (x, y, radius = 9, color = accent, alpha = .92) => add(s.add.circle(x, y, radius, color, alpha));
    const bar = (x, y, width, height, color = accent, alpha = .82) => add(s.add.rectangle(x, y, width, height, color, alpha));
    const pulse = (target, delay = 0, scale = 1.5) => s.tweens.add({
      targets: target,
      scale,
      alpha: correct ? .35 : .18,
      duration,
      delay,
      yoyo: true,
      repeat: 1,
      ease: correct ? "Sine.easeInOut" : "Back.easeIn"
    });

    if (variant === "organelles") {
      const cell = circle(480, 310, 116, accent, .13);
      cell.setStrokeStyle(5, accent, .78);
      const nucleus = circle(480, 310, 34, accent, .82);
      nucleus.setStrokeStyle(4, 0xffffff, .75);
      for (let index = 0; index < 8; index += 1) {
        const angle = (Math.PI * 2 * index) / 8;
        const organelle = add(s.add.ellipse(
          480 + Math.cos(angle) * 78,
          310 + Math.sin(angle) * 66,
          28,
          14,
          index % 2 ? accent : secondary,
          .94
        ).setRotation(angle));
        s.tweens.add({
          targets: organelle,
          scaleX: correct ? 1.45 : .72,
          scaleY: correct ? 1.45 : .72,
          alpha: correct ? .55 : .2,
          duration,
          delay: index * 75,
          yoyo: true,
          repeat: 1
        });
      }
      s.tweens.add({ targets: nucleus, angle: correct ? 360 : 35, duration: duration * 2.5, ease: "Sine.easeInOut" });
    } else if (variant === "replication") {
      for (let index = 0; index < 10; index += 1) {
        const y = 175 + index * 27;
        const left = circle(405 + Math.sin(index + sequence) * 18, y, 8, index % 2 ? accent : secondary);
        const right = circle(555 - Math.sin(index + sequence) * 18, y, 8, index % 2 ? secondary : accent);
        bar(480, y, 125, 3, 0xffffff, .4);
        s.tweens.add({ targets:left, x:left.x-(correct ? 24 : -10), duration, delay:index*35, yoyo:true, repeat:1 });
        s.tweens.add({ targets:right, x:right.x+(correct ? 24 : -10), duration, delay:index*35, yoyo:true, repeat:1 });
      }
    } else if (variant === "transport" || variant === "diffusion") {
      bar(480, 310, 16, 270, 0xffffff, .5);
      for (let index = 0; index < 14; index += 1) {
        const fromLeft = (index + sequence) % 2 === 0;
        const particle = circle(fromLeft ? 330 : 630, 195 + (index % 7) * 34, 8, index % 3 ? accent : secondary);
        s.tweens.add({
          targets:particle,
          x:fromLeft ? (correct ? 610 : 430) : (correct ? 350 : 530),
          duration:duration + index * 28,
          delay:index * 30,
          yoyo:true,
          repeat:1,
          ease:"Sine.easeInOut"
        });
      }
    } else if (variant === "division") {
      const first = circle(480, 310, 82, accent, .32);
      const secondCell = circle(480, 310, 82, secondary, .3);
      circle(480, 310, 25, accent);
      s.tweens.add({ targets:first, x:correct ? 370 : 445, scale:correct ? .88 : 1.08, duration:duration*1.6, yoyo:true, repeat:1, ease:"Sine.easeInOut" });
      s.tweens.add({ targets:secondCell, x:correct ? 590 : 515, scale:correct ? .88 : 1.08, duration:duration*1.6, yoyo:true, repeat:1, ease:"Sine.easeInOut" });
    } else if (variant === "cell-energy" || variant === "energy-transfer" || variant === "work" || variant === "power") {
      const core = circle(480, 310, 34, accent, .72);
      pulse(core, 0, correct ? 1.7 : 1.18);
      for (let index = 0; index < 14; index += 1) {
        const angle = (Math.PI * 2 * index / 14) + sequence * .25;
        const spark = circle(480 + Math.cos(angle) * 155, 310 + Math.sin(angle) * 115, 6, index % 2 ? accent : secondary);
        s.tweens.add({
          targets:spark,
          x:480 + Math.cos(angle) * (correct ? 48 : 205),
          y:310 + Math.sin(angle) * (correct ? 38 : 150),
          alpha:correct ? 1 : .12,
          duration:duration + index * 25,
          yoyo:true,
          repeat:1
        });
      }
    } else if (variant === "trajectory" || variant === "gravity" || variant === "launch") {
      for (let index = 0; index < 15; index += 1) {
        const ratio = index / 14;
        const x = 250 + ratio * 480;
        const arcHeight = (correct ? 230 : 95) + sequence * 12;
        const y = 410 - Math.sin(ratio * Math.PI) * arcHeight + (!correct ? ratio * 85 : 0);
        const dot = circle(x, y, 6 + (index % 3), index < 8 ? accent : secondary, .85);
        pulse(dot, index * 55, 1.65);
      }
    } else if (variant === "circuit-flow" || variant === "resistance" || variant === "voltage") {
      bar(480, 185, 420, 6, accent, .7);
      bar(480, 420, 420, 6, accent, .7);
      bar(270, 302, 6, 235, accent, .7);
      bar(690, 302, 6, 235, accent, .7);
      const points = [[320,185],[410,185],[500,185],[590,185],[690,235],[690,325],[640,420],[540,420],[440,420],[340,420],[270,350],[270,260]];
      points.forEach(([x,y], index) => {
        const node = circle(x, y, variant === "resistance" && index > 4 && index < 8 ? 11 : 7, index % 2 ? accent : secondary);
        pulse(node, correct ? index * 70 : (points.length-index) * 55, correct ? 1.8 : 1.15);
      });
    } else if (variant === "reaction" || variant === "phase-change") {
      for (let index = 0; index < 12; index += 1) {
        const left = circle(280 + (index % 3) * 30, 220 + (index % 4) * 52, 8, accent);
        const right = circle(680 - (index % 3) * 30, 220 + (index % 4) * 52, 8, secondary);
        s.tweens.add({ targets:[left,right], x:480 + (index%3-1)*18, y:300+(index%4-2)*18, duration:duration+index*35, yoyo:true, repeat:1, ease:correct?"Expo.easeIn":"Bounce.easeOut" });
      }
      const reactionCore = circle(480, 300, 24, correct ? secondary : accent, .25);
      pulse(reactionCore, duration*.7, correct ? 2.5 : 1.25);
    } else if (variant === "wave" || variant === "frequency" || variant === "amplitude") {
      const amplitude = variant === "amplitude" ? 95 : 58 + sequence * 8;
      const frequency = variant === "frequency" ? 3 + sequence : 2;
      for (let index = 0; index < 26; index += 1) {
        const x = 190 + index * 23;
        const y = 310 + Math.sin((index / 25) * Math.PI * 2 * frequency) * amplitude;
        const node = circle(x, y, 6, index % 2 ? accent : secondary);
        s.tweens.add({ targets:node, y:y+(correct ? 22 : 6)*(index%2?-1:1), duration:duration, delay:index*22, yoyo:true, repeat:2, ease:"Sine.easeInOut" });
      }
    } else if (variant === "refraction" || variant === "reflection" || variant === "spectrum") {
      const entry = bar(360, 270, 240, 8, accent);
      entry.rotation = -.38 - sequence * .04;
      const exit = bar(570, variant === "reflection" ? 220 : 350, 260, 8, secondary);
      exit.rotation = variant === "reflection" ? -.55 : .45 + sequence * .05;
      pulse(entry, 0, 1.08);
      pulse(exit, 180, correct ? 1.12 : .92);
      if (variant === "spectrum") {
        [0xff5f78,0xffb36b,0xc4f05c,0x48d8c8,0x8e85ff].forEach((color,index) => {
          const ray = bar(635, 300+index*18, 170, 4, color, .85);
          ray.rotation = .12 + index*.035;
          pulse(ray, index*60, 1.08);
        });
      }
    } else if (variant === "pressure" || variant === "buoyancy" || variant === "flow") {
      bar(480, 370, 430, 170, 0x4cbfd0, .25);
      const object = add(s.add.rectangle(480, variant === "buoyancy" ? 345 : 275, 82, 58, secondary, .8));
      s.tweens.add({ targets:object, y:correct ? 265-sequence*10 : 405, rotation:correct ? .04 : .28, duration:duration*1.5, yoyo:true, repeat:1, ease:"Sine.easeInOut" });
      for (let index = 0; index < 10; index += 1) {
        const bubble = circle(300+index*38, 420-(index%3)*25, 5+(index%3), accent, .6);
        s.tweens.add({ targets:bubble, y:220-(index%4)*18, alpha:.1, duration:duration+index*45, repeat:1 });
      }
    } else if (variant === "ecosystem-flow" || variant === "population" || variant === "resources") {
      const levels = [[480,190],[390,300],[570,300],[315,410],[430,410],[550,410],[665,410]];
      levels.forEach(([x,y], index) => {
        const node = circle(x, y, 16-(index>2?3:0), index%2?accent:secondary, .82);
        pulse(node, index*85, correct ? 1.55 : .9);
        if (index) {
          const parent = levels[index < 3 ? 0 : index % 2 ? 1 : 2];
          const length = Math.hypot(x-parent[0],y-parent[1]);
          const link = bar((x+parent[0])/2,(y+parent[1])/2,length,3,accent,.35);
          link.rotation = Math.atan2(y-parent[1],x-parent[0]);
        }
      });
    } else if (variant === "balance") {
      const beam = bar(480, 320, 290, 14, accent, .9);
      const pivot = add(s.add.triangle(480, 385, 0, 55, 45, 0, 90, 55, 0x34495e, .95));
      const leftMass = add(s.add.rectangle(380, 284, 58, 48, correct ? accent : 0xff5f78, .95));
      const rightMass = add(s.add.rectangle(580, 284, 58, 48, secondary, .95));
      [beam, leftMass, rightMass].forEach((item) => item.setRotation(-.22));
      s.tweens.add({
        targets: [beam, leftMass, rightMass],
        rotation: correct ? 0 : .34,
        yoyo: !correct,
        repeat: correct ? 0 : 2,
        duration,
        ease: "Back.easeOut"
      });
      pulse(pivot, 120, correct ? 1.15 : .92);
    } else if (variant === "surface") {
      bar(480, 390, 390, 22, accent, .5);
      for (let index = 0; index < 12; index += 1) {
        circle(300 + index * 33, 377, 5, 0xffffff, .76);
      }
      const block = add(s.add.rectangle(315, 335, 78, 74, correct ? secondary : 0xff5f78, .96));
      s.tweens.add({
        targets: block,
        x: correct ? 645 : 395,
        angle: correct ? 8 : -12,
        duration: duration * 1.8,
        ease: correct ? "Cubic.easeOut" : "Bounce.easeOut"
      });
      if (!correct) {
        s.tweens.add({ targets: block, y: "-=12", yoyo: true, repeat: 4, duration: 120 });
      }
    } else {
      const block = add(s.add.rectangle(355, 340, 95, 82, secondary, .85));
      const arrow = bar(520, 340, 210, 12, accent);
      const head = add(s.add.triangle(635, 340, 0, 0, 0, 34, 38, 17, accent, .9));
      s.tweens.add({ targets:[block,arrow,head], x:correct ? "+=150" : "+=22", duration:duration*1.4, yoyo:true, repeat:1, ease:correct?"Cubic.easeOut":"Bounce.easeOut" });
    }

    if (!correct) {
      s.tweens.add({ targets:fx, x:{ from:-8, to:8 }, duration:70, yoyo:true, repeat:7 });
    }
    s.time.delayedCall(2600, () => {
      if (this.questionFx !== fx) return;
      s.tweens.killTweensOf(fx.list || []);
      fx.destroy(true);
      this.questionFx = null;
    });
  }

  getTextState() {
    return {
      title: this.configData.title,
      simulationType: this.configData.simulationType,
      parameters: { ...this.params },
      running: this.running,
      velocity: Number(this.velocity.toFixed(2)),
      feedback: this.feedbackText?.text || ""
    };
  }
}

const RUNTIME_VISUAL_STYLES = {
  "rive-kawaii-signal": { sky: "#e9fbf8", ground: "#70d9ca", accent: "#ff708f", visualMode: "soft" },
  "rive-tokyo-tech": { sky: "#eef3f2", ground: "#2e3d48", accent: "#19cce2", visualMode: "technical" },
  "rive-arcade-matsuri": { sky: "#17143f", ground: "#352b68", accent: "#ffd84d", visualMode: "cosmic" },
  "kawaii-lab": { sky: "#dff7f4", ground: "#8fd5c8", accent: "#ff7d88", visualMode: "soft" },
  "tech-minimal": { sky: "#f4f7f8", ground: "#9eabb4", accent: "#00a9bd", visualMode: "technical" },
  "arcade-science": { sky: "#101936", ground: "#39406d", accent: "#ffcf3f", visualMode: "pixel" },
  "pastel-adventure": { sky: "#fff1dc", ground: "#b7d6bb", accent: "#ef8fa9", visualMode: "gouache" },
  "cosmic-kawaii": { sky: "#17234f", ground: "#53528f", accent: "#ff9ed2", visualMode: "cosmic" },
  "eco-explorer": { sky: "#dcefc8", ground: "#68845b", accent: "#f2bd58", visualMode: "natural" },
  "storybook-science": { sky: "#f7e7c8", ground: "#b98d68", accent: "#d66f5a", visualMode: "paper" },
  "neon-lab": { sky: "#061827", ground: "#18334a", accent: "#00f5d4", visualMode: "neon" },
  "ocean-discovery": { sky: "#bcebf2", ground: "#277f91", accent: "#ffb45f", visualMode: "ocean" }
};

// Rive is the primary renderer for the three Rive presets.  Phaser remains
// available for legacy visual styles, but it must not create a second canvas
// behind the current Rive UI.
class RiveScienceGameRuntime {
  constructor(mount, config, hooks = {}) {
    this.mount = mount;
    this.configData = config;
    this.hooks = hooks;
    this.questionMiniGameCleanup = null;
    this.questionReviewCorrectAnswer = null;
    this.mount.classList.add("is-rive-game-runtime");
    this.mount.innerHTML = `<section class="science-rive-game-surface" aria-label="Laboratorio científico interactivo">
      <div class="science-rive-game-orbit" data-science-rive-hud data-rive-artboard="New Artboard" data-rive-state-machine="State Machine 1" data-rive-fit="cover" aria-hidden="true"><canvas></canvas></div>
      <div class="science-rive-game-copy"><small>LABORATORIO INTERACTIVO</small><strong>${this.escape(config.title || "Misión científica")}</strong><span>${this.escape(config.mission || "Selecciona una hipótesis para comenzar el experimento.")}</span></div>
    </section>`;
    requestAnimationFrame(() => globalThis.ScienceRiveHud?.mountAll(this.mount));
  }

  escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  }

  cancelQuestionGame() {
    const cleanup = this.questionMiniGameCleanup;
    this.questionMiniGameCleanup = null;
    cleanup?.();
  }

  reset() {
    this.cancelQuestionGame();
    this.questionReviewCorrectAnswer = null;
  }

  destroy() {
    this.reset();
    globalThis.ScienceRiveHud?.destroyAll(this.mount);
    this.mount.classList.remove("is-rive-game-runtime", "is-structured-question");
    this.mount.innerHTML = "";
  }

  getState() {
    return { title: this.configData.title, simulationType: this.configData.simulationType, renderer: "rive" };
  }

  playQuestionAnimation() {
    return Promise.resolve({ completed: true, correct: true, renderer: "rive" });
  }

  playQuestionGame(payload = {}) {
    const question = { ...(payload.assessment || {}) };
    const rawType = String(question.type || "multiple").trim().toLowerCase();
    const aliases = { match: "matching", pairing: "matching", pair: "matching", emparejamiento: "matching", relation: "matching", relationship: "matching", "key-word": "keyword", word: "keyword", palabra: "keyword", "palabra-clave": "keyword" };
    question.type = aliases[rawType] || rawType;
    const structuredTypes = ["equation-build", "fill-blank", "exponent-placement", "chemical-balance", "numeric-answer", "graph-plot", "sequence-order"];
    if (structuredTypes.includes(question.type)) {
      return ScienceLabScene.prototype.playStructuredQuestionGame.call(this, payload, question);
    }
    return this.playChoiceQuestion(question);
  }

  playChoiceQuestion(question) {
    this.cancelQuestionGame();
    this.mount.classList.add("is-rive-question");
    const startedAt = performance.now();
    const normalize = (value) => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ").toLowerCase();
    const rawOptions = question.type === "matching"
      ? (question.pairs || []).map((pair) => pair?.right).filter(Boolean)
      : (question.options || []).map((option) => typeof option === "object" ? option.text ?? option.label ?? option.value : option).filter(Boolean);
    const options = rawOptions.length ? rawOptions.slice(0, 4) : ["Hipótesis A", "Hipótesis B", "Hipótesis C"];
    const marked = (question.options || []).findIndex((option) => option && typeof option === "object" && (option.correct === true || option.isCorrect === true));
    const declared = Number.isInteger(question.correct) ? question.correct : Number.isInteger(question.correctIndex) ? question.correctIndex : marked;
    const correct = declared >= 0 && declared < options.length ? declared : 0;
    let settled = false;
    let attempts = 0;
    let resolveCompletion;
    const completion = new Promise((resolve) => { resolveCompletion = resolve; });
    const panel = document.createElement("section");
    panel.className = "science-rive-answer-deck is-rive-only";
    panel.setAttribute("role", "group");
    panel.setAttribute("aria-label", "Opciones de respuesta");
    const finish = async (index, answer) => {
      if (settled) return;
      settled = true;
      const isCorrect = index === correct;
      await playScienceProbeEffect(panel);
      cleanup();
      resolveCompletion({ completed: true, correct: isCorrect, response: answer, attempts, durationMs: Math.round(performance.now() - startedAt), renderer: "rive" });
    };
    const cleanup = () => {
      globalThis.ScienceRiveHud?.destroyAll(panel);
      panel.remove();
      this.mount.classList.remove("is-rive-question");
      if (this.questionMiniGameCleanup === cleanup) this.questionMiniGameCleanup = null;
      this.questionReviewCorrectAnswer = null;
    };
    if (question.type === "keyword") {
      const accepted = [question.correctAnswer, question.answer, question.keyword, question.accepted, question.acceptedAnswers, question.acceptedKeywords, question.keywords]
        .flatMap((value) => Array.isArray(value) ? value : [value])
        .flatMap((value) => String(value ?? "").split(","))
        .map((value) => value.trim())
        .filter(Boolean);
      panel.classList.add("is-keyword-question");
      panel.innerHTML = `<div class="science-rive-answer-heading"><span>ESCRIBE LA PALABRA CLAVE</span><b>COMPRUEBA TU HIPÓTESIS</b><i class="science-keyword-rive-signal" data-science-rive-hud data-rive-artboard="New Artboard" data-rive-state-machine="State Machine 1" data-rive-fit="contain" aria-hidden="true"><canvas></canvas></i></div><form class="science-keyword-game-console"><label class="science-keyword-game-label">Tu respuesta<input class="science-keyword-game-input" autocomplete="off" placeholder="Palabra clave…"></label><button class="science-keyword-game-submit" type="submit">Comprobar</button></form>`;
      panel.querySelector("form").addEventListener("submit", (event) => {
        event.preventDefault();
        const input = panel.querySelector("input");
        const answer = input.value.trim();
        if (!answer || settled) return;
        attempts += 1;
        input.disabled = true;
        finish(accepted.some((value) => normalize(value) === normalize(answer)) ? correct : -1, answer);
      });
      this.questionReviewCorrectAnswer = () => {
        const input = panel.querySelector("input");
        if (!input || settled) return false;
        input.value = String(accepted[0] || ""); attempts += 1; finish(correct, input.value); return true;
      };
    } else {
      const title = question.type === "matching" ? question.pairs?.[0]?.left || question.prompt : question.prompt;
      panel.innerHTML = `<div class="science-rive-answer-heading"><span>${this.escape(title || "Selecciona una hipótesis")}</span><b>TOCA · HAZ CLIC · USA TAB</b></div><div class="science-rive-answer-list"></div>`;
      const list = panel.querySelector(".science-rive-answer-list");
      options.forEach((option, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "science-rive-answer-card";
        button.dataset.riveAnswer = String(index);
        button.innerHTML = `<i class="science-rive-answer-surface" data-science-rive-hud data-rive-artboard="New Artboard" data-rive-state-machine="State Machine 1" data-rive-fit="contain" aria-hidden="true"><canvas></canvas></i><span class="science-rive-answer-badge">${String.fromCharCode(65 + index)}</span><strong>${this.escape(option)}</strong><small>Probar esta hipótesis</small>`;
        button.addEventListener("click", () => {
          if (settled) return;
          attempts += 1;
          const isCorrect = index === correct;
          list.querySelectorAll("button").forEach((candidate) => { candidate.disabled = true; candidate.classList.toggle("is-muted", candidate !== button); });
          button.classList.add("is-selected", isCorrect ? "is-correct" : "is-incorrect");
          globalThis.ScienceRiveHud?.setState(button.querySelector("[data-science-rive-hud]"), isCorrect ? "correct" : "incorrect");
          finish(index, option);
        });
        list.append(button);
      });
      this.questionReviewCorrectAnswer = () => {
        const card = panel.querySelector(`[data-rive-answer="${correct}"]`);
        if (!card || settled) return false;
        attempts += 1; card.click(); return true;
      };
    }
    this.mount.append(panel);
    this.questionMiniGameCleanup = cleanup;
    requestAnimationFrame(() => globalThis.ScienceRiveHud?.mountAll(panel));
    return completion;
  }
}

export async function createScienceGame(mount, controlsMount, config, hooks = {}) {
  const target = typeof mount === "string" ? document.querySelector(mount) : mount;
  const controlsTarget = typeof controlsMount === "string" ? document.querySelector(controlsMount) : controlsMount;
  if (!target) throw new Error("No se encontró el contenedor de la simulación.");
  target.innerHTML = "";
  if (controlsTarget) controlsTarget.innerHTML = "";

  if (String(config.visualStyle || "").startsWith("rive-")) {
    return new RiveScienceGameRuntime(target, config, hooks);
  }

  const [Phaser] = await Promise.all([loadPhaser(), loadAnime()]);

  const styleProfile = RUNTIME_VISUAL_STYLES[config.visualStyle] || RUNTIME_VISUAL_STYLES["kawaii-lab"];
  const normalizedTopic = `${config.subject || ""} ${config.topic || ""} ${config.customTopic || ""} ${config.title || ""} ${config.mission || ""}`
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const isGravityActivity = /gravedad|caida libre|caer|peso gravitatorio/.test(normalizedTopic);
  const controlValues = Object.fromEntries((config.controls || []).map((control) => [control.id, Number(control.value)]));
  const normalizedControls = isGravityActivity
    ? [
        { id: "height", label: "Altura", min: 5, max: 55, step: 1, value: controlValues.height || 35, unit: "m" },
        { id: "gravity", label: "Gravedad", min: 1.6, max: 24.8, step: .01, value: controlValues.gravity || 9.81, unit: "m/s²" },
        { id: "mass", label: "Masa", min: 1, max: 100, step: 1, value: controlValues.mass || 10, unit: "kg" }
      ]
    : config.controls;
  const styledConfig = {
    ...config,
    simulationType: isGravityActivity ? "gravity" : config.simulationType,
    controls: normalizedControls,
    visualMode: styleProfile.visualMode,
    scenario: {
      ...(config.scenario || {}),
      sky: styleProfile.sky,
      ground: styleProfile.ground,
      accent: styleProfile.accent
    },
    visual: {
      ...(config.visual || {}),
      primary: styleProfile.ground,
      accent: styleProfile.accent
    }
  };
  target.dataset.visualStyle = config.visualStyle || "kawaii-lab";
  const labScene = new ScienceLabScene(Phaser, styledConfig, hooks);
  const targetWidth = Math.max(320, target.clientWidth || globalThis.innerWidth || 960);
  const coarsePointer = globalThis.matchMedia?.("(pointer: coarse)")?.matches === true;
  const minimumHdScale = coarsePointer ? 1.5 : targetWidth < 768 ? 2 : 2.5;
  const resolutionCap = coarsePointer ? 2 : 3;
  const adaptiveResolution = Math.min(resolutionCap, Math.max(minimumHdScale, globalThis.devicePixelRatio || 1));
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: target,
    width: 1280,
    height: 720,
    resolution: adaptiveResolution,
    transparent: true,
    antialias: true,
    render: {
      pixelArt: false,
      antialias: true,
      antialiasGL: true,
      roundPixels: false,
      powerPreference: "high-performance"
    },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: {
      activePointers: 2,
      touch: { capture: true }
    },
    scene: labScene.sceneConfig()
  });

  if (controlsTarget) {
    (styledConfig.controls || []).slice(0, 4).forEach((control) => {
      const wrapper = document.createElement("label");
      wrapper.className = "science-control";
      wrapper.innerHTML = `<span class="science-control-head"><span>${control.label}</span><output>${control.value} ${control.unit || ""}</output></span><input type="range" min="${control.min}" max="${control.max}" step="${control.step || 1}" value="${control.value}" aria-label="${control.label}">`;
      const input = wrapper.querySelector("input");
      const output = wrapper.querySelector("output");
      input.addEventListener("input", () => {
        output.textContent = `${input.value} ${control.unit || ""}`;
        control.value = Number(input.value);
        labScene.setParam(control.id, Number(input.value));
      });
      controlsTarget.appendChild(wrapper);
    });
    const action = document.createElement("button");
    action.type = "button";
    action.className = "science-action";
    action.textContent = "Comprobar";
    action.addEventListener("click", () => labScene.action());
    controlsTarget.appendChild(action);
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "science-action secondary";
    reset.textContent = "Reiniciar";
    reset.addEventListener("click", () => labScene.reset());
    controlsTarget.appendChild(reset);
  }

  return {
    game,
    scene: labScene,
    destroy() {
      labScene.cancelQuestionGame();
      if (labScene.questionFx) {
        labScene.scene?.tweens.killTweensOf(labScene.questionFx.list || []);
        labScene.questionFx.destroy(true);
        labScene.questionFx = null;
      }
      game.destroy(true);
    },
    cancelQuestionGame() { labScene.cancelQuestionGame(); },
    reset() {
      labScene.cancelQuestionGame();
      if (labScene.questionFx) {
        labScene.scene?.tweens.killTweensOf(labScene.questionFx.list || []);
        labScene.questionFx.destroy(true);
        labScene.questionFx = null;
      }
      labScene.reset();
    },
    playQuestionAnimation(profile, correct) { return labScene.playQuestionAnimation(profile, correct); },
    playQuestionGame(payload) { return labScene.playQuestionGame(payload); },
    reviewCorrectAnswer() { return labScene.questionReviewCorrectAnswer?.() === true; },
    getState() { return labScene.getTextState(); }
  };
}

export function installAccessibleGameState(instance) {
  globalThis.render_game_to_text = () => JSON.stringify(instance?.getState?.() || {});
  globalThis.advanceTime = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
}
