import { applyChemistrySimulatorProfile, validateChemistryProfiles } from "./science-chemistry-profiles.mjs?v=20260810-chemistry-v2";
import { applyBiologySimulatorProfile, validateBiologyProfiles } from "./science-biology-profiles.mjs?v=20260813-energy-transformation-v4";

export const CURRICULUM_PROFILE_VERSION = 1;

const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const clone = (value) => structuredClone(value);
export const curriculumProfileId = (subject, topic) => `${normalize(subject)}:${normalize(topic)}`;

const controls = {
  periodic: [
    { id: "atomicNumber", label: "Número atómico", min: 1, max: 118, step: 1, value: 6, unit: "", editable: true, visible: true, effect: "Selecciona un elemento y muestra su posición y clasificación periódica." }
  ],
  atomic: [
    { id: "protons", label: "Protones", min: 1, max: 20, step: 1, value: 6, unit: "", editable: true, visible: true, effect: "Determinan el elemento y Z." },
    { id: "neutrons", label: "Neutrones", min: 0, max: 30, step: 1, value: 6, unit: "", editable: true, visible: true, effect: "Determinan el isótopo y A." },
    { id: "electrons", label: "Electrones", min: 0, max: 20, step: 1, value: 6, unit: "", editable: true, visible: true, effect: "Determinan la carga neta." }
  ],
  motion: [{ id: "velocity", label: "Velocidad", min: 0, max: 40, step: 1, value: 12, unit: "m/s", effect: "Cambia el movimiento." }, { id: "mass", label: "Masa", min: 1, max: 25, step: 1, value: 5, unit: "kg", effect: "Modifica la respuesta inercial." }, { id: "force", label: "Fuerza", min: -100, max: 100, step: 5, value: 20, unit: "N", effect: "Cambia la aceleración." }],
  force: [{ id: "force", label: "Fuerza aplicada", min: 0, max: 150, step: 5, value: 60, unit: "N", effect: "Impulsa el sistema." }, { id: "friction", label: "Fuerza opuesta", min: 0, max: 120, step: 5, value: 25, unit: "N", effect: "Se opone al cambio." }, { id: "mass", label: "Masa", min: 1, max: 30, step: 1, value: 10, unit: "kg", effect: "Modifica la aceleración." }],
  gravity: [{ id: "height", label: "Altura", min: 1, max: 100, step: 1, value: 20, unit: "m", effect: "Cambia el tiempo de caída." }, { id: "gravity", label: "Gravedad", min: 1.6, max: 24.8, step: .1, value: 9.8, unit: "m/s²", effect: "Cambia la aceleración." }, { id: "mass", label: "Masa", min: .1, max: 20, step: .1, value: 1, unit: "kg", effect: "No cambia la caída ideal." }],
  projectile: [{ id: "angle", label: "Ángulo", min: 5, max: 85, step: 1, value: 45, unit: "°", effect: "Cambia la trayectoria." }, { id: "power", label: "Velocidad inicial", min: 2, max: 50, step: 1, value: 20, unit: "m/s", effect: "Cambia el alcance." }, { id: "gravity", label: "Gravedad", min: 1.6, max: 24.8, step: .1, value: 9.8, unit: "m/s²", effect: "Curva la trayectoria." }],
  fluid: [{ id: "force", label: "Fuerza", min: 5, max: 100, step: 5, value: 35, unit: "N", effect: "Presiona el fluido." }, { id: "area", label: "Área", min: 1, max: 20, step: 1, value: 5, unit: "m²", effect: "Modifica la presión." }, { id: "density", label: "Densidad", min: 200, max: 1600, step: 50, value: 700, unit: "kg/m³", effect: "Modifica el empuje." }],
  thermal: [{ id: "sourceTemperature", label: "Temperatura de fuente", min: 0, max: 100, step: 1, value: 65, unit: "°C", effect: "Define la fuente térmica." }, { id: "objectMass", label: "Masa del material", min: 25, max: 1000, step: 25, value: 150, unit: "g", effect: "Cambia la rapidez térmica." }, { id: "initialTemperature", label: "Temperatura inicial", min: -10, max: 60, step: 1, value: 20, unit: "°C", effect: "Define el estado inicial." }, { id: "thermalConductance", label: "Conductancia", min: 1, max: 30, step: 1, value: 12, unit: "W/K", effect: "Controla el flujo de calor." }],
  circuit: [{ id: "voltage", label: "Voltaje", min: 1, max: 24, step: 1, value: 9, unit: "V", effect: "Impulsa las cargas." }, { id: "resistance", label: "Resistencia", min: 1, max: 30, step: 1, value: 10, unit: "Ω", effect: "Limita la corriente." }],
  energy: [{ id: "mass", label: "Masa", min: 1, max: 30, step: 1, value: 8, unit: "kg", effect: "Cambia la energía." }, { id: "height", label: "Altura", min: 0, max: 20, step: .5, value: 7, unit: "m", effect: "Cambia la energía potencial." }, { id: "gravity", label: "Gravedad", min: 1.6, max: 24.8, step: .1, value: 9.8, unit: "m/s²", effect: "Cambia el peso." }],
  wave: [{ id: "frequency", label: "Frecuencia", min: .5, max: 20, step: .5, value: 3, unit: "Hz", effect: "Cambia los ciclos." }, { id: "amplitude", label: "Amplitud", min: 1, max: 100, step: 1, value: 40, unit: "cm", effect: "Cambia la energía." }, { id: "wavelength", label: "Longitud de onda", min: 10, max: 300, step: 5, value: 120, unit: "cm", effect: "Separa las crestas." }],
  optics: [{ id: "angle", label: "Ángulo de incidencia", min: 5, max: 80, step: 1, value: 35, unit: "°", effect: "Cambia la dirección del rayo." }, { id: "refractiveIndex", label: "Índice del medio", min: 1, max: 2.5, step: .05, value: 1.5, unit: "n", effect: "Modifica la refracción." }],
  particles: [{ id: "temperature", label: "Temperatura", min: 0, max: 100, step: 1, value: 25, unit: "°C", effect: "Cambia la agitación." }, { id: "particleCount", label: "Cantidad de partículas", min: 10, max: 60, step: 1, value: 30, unit: "", effect: "Cambia la concentración." }],
  cell: [{ id: "nutrients", label: "Recursos", min: 0, max: 100, step: 5, value: 60, unit: "%", effect: "Aportan materia." }, { id: "oxygen", label: "Actividad", min: 0, max: 100, step: 5, value: 65, unit: "%", effect: "Modifica el proceso celular." }],
  ecosystem: [{ id: "sunlight", label: "Energía disponible", min: 0, max: 100, step: 5, value: 60, unit: "%", effect: "Sostiene el sistema." }, { id: "water", label: "Recursos disponibles", min: 0, max: 100, step: 5, value: 55, unit: "%", effect: "Limita la población." }],
  math: [{ id: "x", label: "Valor de x", min: -20, max: 20, step: 1, value: 4, unit: "", effect: "Variable independiente." }, { id: "coefficient", label: "Parámetro", min: -10, max: 10, step: 1, value: 2, unit: "", effect: "Cambia la relación." }, { id: "constant", label: "Constante", min: -20, max: 20, step: 1, value: 3, unit: "", effect: "Desplaza el resultado." }],
  numberLine: [
    { id: "startNumerator", label: "Valor inicial", min: -20, max: 20, step: 1, value: -6, unit: "", effect: "Ubica el punto de partida exactamente en ese valor." },
    { id: "movementNumerator", label: "Desplazamiento", min: -20, max: 20, step: 1, value: 10, unit: "", effect: "Mueve el punto a la derecha si es positivo y a la izquierda si es negativo." },
    { id: "comparisonNumerator", label: "Punto de comparación", min: -20, max: 20, step: 1, value: 8, unit: "", effect: "Permite comparar y ordenar dos números racionales." },
    { id: "denominator", label: "Subdivisiones por unidad", min: 1, max: 10, step: 1, value: 2, unit: "", effect: "Divide visualmente cada unidad sin modificar los valores." }
  ],
  additionSubtraction: [
    { id: "operandA", label: "Primer número", min: -20, max: 20, step: 1, value: 5, unit: "", effect: "Define el punto de partida en la recta numérica." },
    { id: "operator", label: "Operación", min: -1, max: 1, step: 2, value: 1, unit: "", controlType: "segmented", options: [{ value: 1, label: "+" }, { value: -1, label: "−" }], effect: "Elige si el segundo número se suma o se resta." },
    { id: "operandB", label: "Segundo número", min: -20, max: 20, step: 1, value: 3, unit: "", effect: "Define la cantidad que se suma o se resta; puede ser negativa." }
  ],
  quadraticFactorization: [
    { id: "factorMode", label: "Modo", min: 0, max: 1, step: 1, value: 0, unit: "", controlType: "segmented", options: [{ value: 0, label: "Explorar" }, { value: 1, label: "Reto" }], effect: "Alterna entre construcción libre y resolución guiada." },
    { id: "commonFactor", label: "Factor común", min: 1, max: 6, step: 1, value: 1, unit: "", effect: "Multiplica el trinomio completo." },
    { id: "factorP", label: "Coeficiente p", min: 1, max: 4, step: 1, value: 1, unit: "", effect: "Define el término px del primer factor." },
    { id: "factorQ", label: "Constante q", min: -8, max: 8, step: 1, value: 2, unit: "", effect: "Define el término constante del primer factor." },
    { id: "factorR", label: "Coeficiente r", min: 1, max: 4, step: 1, value: 1, unit: "", effect: "Define el término rx del segundo factor." },
    { id: "factorS", label: "Constante s", min: -8, max: 8, step: 1, value: 3, unit: "", effect: "Define el término constante del segundo factor." }
  ]
};

const FAMILY = {
  motion: ["friction", "motion", "a = Δv/Δt", "Cambio de movimiento", "answer-zones", ["numeric-answer", "graph-plot", "sequence-order", "multiple"]],
  force: ["friction", "force", "ΣF = m·a", "Fuerza neta", "force-balance", ["equation-build", "numeric-answer", "matching", "multiple"]],
  gravity: ["gravity", "gravity", "t = √(2h/g)", "Tiempo y velocidad de caída", "trajectory-test", ["numeric-answer", "graph-plot", "multiple", "sequence-order"]],
  projectile: ["projectile", "projectile", "R = v₀²·sen(2θ)/g", "Alcance", "trajectory-test", ["numeric-answer", "graph-plot", "multiple"]],
  fluid: ["fluid", "fluid", "P = F/A; E = ρ·g·V", "Presión o empuje", "resource-balance", ["numeric-answer", "equation-build", "multiple", "matching"]],
  thermal: ["thermal", "thermal", "Q̇ = G(Tfuente − Tmaterial)", "Transferencia térmica", "resource-balance", ["graph-plot", "numeric-answer", "sequence-order", "multiple"]],
  circuit: ["circuit", "circuit", "I = V/R", "Magnitud eléctrica", "circuit-route", ["equation-build", "numeric-answer", "matching", "multiple"]],
  energy: ["energy", "energy", "E = m·g·h; P = W/t", "Energía o potencia", "energy-transfer", ["numeric-answer", "equation-build", "sequence-order", "multiple"]],
  wave: ["wave", "wave", "v = f·λ", "Propiedad de la onda", "signal-routing", ["graph-plot", "numeric-answer", "matching", "multiple"]],
  optics: ["optics", "optics", "n₁·senθ₁ = n₂·senθ₂", "Dirección de la luz", "light-routing", ["graph-plot", "matching", "multiple"]],
  atomic: ["atomic", "atom-builder", "Z=p; A=p+n; q=p−e", "Identidad atómica", "assemble-atom", ["matching", "numeric-answer", "multiple", "fill-blank"]],
  periodic: ["periodic", "periodic-table", "Z = número atómico", "Elemento, grupo, periodo y familia", "classification-grid", ["matching", "multiple", "sequence-order"]],
  particles: ["particles", "particles", "TK = T°C + 273.15", "Comportamiento de partículas", "particle-lab", ["matching", "graph-plot", "sequence-order", "multiple"]],
  molecular: ["particles", "molecular", "composición = átomos + enlaces", "Estructura molecular", "molecule-builder", ["chemical-balance", "matching", "equation-build", "multiple"]],
  reaction: ["particles", "reaction", "masa de reactivos = masa de productos", "Cambio químico", "reaction-balance", ["chemical-balance", "sequence-order", "numeric-answer", "multiple"]],
  solution: ["fluid", "solution", "C = n/V", "Concentración", "resource-balance", ["numeric-answer", "equation-build", "graph-plot", "multiple"]],
  acidbase: ["fluid", "acid-base", "pH = −log[H⁺]", "pH", "classification-grid", ["numeric-answer", "matching", "sequence-order", "multiple"]],
  cell: ["cell", "cell", "estructura → función", "Actividad celular", "cell-routing", ["matching", "sequence-order", "multiple", "fill-blank"]],
  genetics: ["cell", "genetics", "genotipo → fenotipo", "Información genética", "sequence-builder", ["matching", "sequence-order", "probability-statistics", "multiple"]],
  organism: ["cell", "organism", "estructura → función → sistema", "Función biológica", "system-routing", ["matching", "sequence-order", "multiple", "fill-blank"]],
  ecosystem: ["ecosystem", "ecosystem", "energía → niveles tróficos", "Equilibrio ecológico", "ecosystem-balance", ["sequence-order", "graph-plot", "matching", "multiple"]],
  evolution: ["ecosystem", "evolution", "variación + selección → cambio poblacional", "Cambio evolutivo", "population-selection", ["sequence-order", "graph-plot", "multiple", "matching"]],
  mathNumber: ["math", "number", "resultado = operación definida", "Resultado numérico", "number-lab", ["numeric-answer", "sequence-order", "equation-build", "multiple"]],
  additionSubtraction: ["addition-subtraction", "integer-chips", "a ± b = resultado", "Resultado", "integer-operation-lab", ["numeric-answer", "equation-build", "sequence-order", "multiple"]],
  numberLine: ["number-line", "number-line", "posición final = inicio + desplazamiento", "Posición, orden y distancia", "number-line-placement", ["number-line-placement", "numeric-answer", "multiple", "sequence-order"]],
  quadraticFactorization: ["quadratic-factorization-rectangle", "quadratic-factorization-rectangle", "g(px + q)(rx + s) = ax² + bx + c", "Construcción algebraica", "factorization-box", ["equation-build", "sequence-order", "numeric-answer", "multiple"]],
  mathRatio: ["math", "ratio", "a/b = c/d", "Razón o proporción", "ratio-builder", ["numeric-answer", "equation-build", "graph-plot", "multiple"]],
  mathAlgebra: ["math", "algebra", "expresión equivalente", "Relación algebraica", "equation-builder", ["equation-build", "fill-blank", "numeric-answer", "sequence-order"]],
  mathFunction: ["math", "function", "y = m·x + b", "Valor y representación", "graph-builder", ["graph-plot", "equation-build", "numeric-answer", "multiple"]],
  mathGeometry: ["math", "geometry", "medida = relación geométrica", "Medida geométrica", "geometry-builder", ["numeric-answer", "matching", "sequence-order", "multiple"]],
  mathData: ["math", "data", "medida = análisis de datos", "Resultado estadístico", "data-lab", ["graph-plot", "probability-statistics", "numeric-answer", "multiple"]]
};

const GROUPS = {
  physics: {
    motion: ["Aceleración", "Distancia y desplazamiento", "Gráficas de posición, velocidad y tiempo", "Movimiento rectilíneo uniforme (MRU)", "Movimiento rectilíneo uniformemente acelerado (MRUA)", "Posición y sistema de referencia", "Rapidez", "Velocidad"],
    force: ["Cantidad de movimiento", "Elasticidad y ley de Hooke", "Equilibrio de fuerzas", "Fuerza", "Fuerza centrípeta", "Impulso", "Leyes de Newton", "Movimiento circular", "Resistencia y fricción"],
    gravity: ["Caída libre", "Gravedad", "Masa y peso"], projectile: ["Proyectiles"],
    fluid: ["Arquímedes", "Densidad", "Flotación", "Pascal", "Presión"],
    thermal: ["Calor", "Cambios de estado de la materia", "Conducción", "Convección", "Dilatación térmica", "Estados de la materia", "¿Por qué cambia el estado de la materia?", "Radiación", "Temperatura"],
    circuit: ["Carga eléctrica", "Circuitos en paralelo", "Circuitos en serie", "Corriente", "Electromagnetismo", "Ley de Ohm", "Magnetismo", "Resistencia eléctrica", "Voltaje"],
    energy: ["Conservación de energía", "Energía cinética", "Energía potencial", "Potencia", "Trabajo"],
    wave: ["Frecuencia", "Longitud de onda", "Ondas", "Sonido"], optics: ["Luz", "Reflexión", "Refracción"]
  },
  chemistry: {
    particles: ["Materia", "Estados de la materia"],
    atomic: ["Átomo", "Protones", "Neutrones", "Electrones", "Número atómico", "Isótopos", "Iones"],
    periodic: ["Tabla periódica", "Metales", "No metales", "Gases nobles"],
    molecular: ["Moléculas", "Compuestos", "Enlace iónico", "Enlace covalente", "Enlace metálico", "Fórmulas químicas", "Agua H₂O", "Dióxido de carbono CO₂", "Cloruro de sodio NaCl", "Química orgánica"],
    acidbase: ["Ácidos", "Bases", "pH", "Neutralización"],
    reaction: ["Reacción química", "Ecuaciones químicas", "Balanceo", "Conservación de la masa", "Mol", "Masa molar", "Oxidación", "Reducción", "Catalizadores", "Temperatura de reacción"],
    solution: ["Disoluciones", "Mezclas y sustancias puras", "Concentración", "Solubilidad"]
  },
  biology: {
    organism: ["Seres vivos", "Taxonomía", "Bacterias", "Virus", "Hongos", "Plantas", "Animales", "Nutrición", "Sistema digestivo", "Sistema respiratorio", "Sistema circulatorio", "Sistema nervioso", "Sistema endocrino", "Sistema inmunitario", "Homeostasis"],
    cell: ["Célula", "Teoría celular", "Procariotas", "Eucariotas", "Membrana celular", "Núcleo", "Mitocondria", "Cloroplasto", "Ribosomas", "Fotosíntesis", "Respiración celular"],
    genetics: ["ADN", "ARN", "Genes", "Cromosomas", "Mitosis", "Meiosis", "Herencia", "Mutaciones"],
    evolution: ["Evolución", "Selección natural"],
    ecosystem: ["Ecosistemas", "Transformación de la energía en los ecosistemas", "Cadenas alimentarias", "Ciclos biogeoquímicos", "Biodiversidad"]
  },
  math: {
    numberLine: ["La recta numérica"],
    additionSubtraction: ["Adición y sustracción"],
    mathNumber: ["Números enteros", "Operaciones con enteros", "Jerarquía de operaciones", "Decimales", "Potencias", "Leyes de exponentes", "Raíces cuadradas", "Notación científica"],
    mathRatio: ["Fracciones", "Operaciones con fracciones", "Porcentajes", "Razones", "Proporciones", "Regla de tres", "Proporcionalidad directa e inversa"],
    quadraticFactorization: ["Factorización"],
    mathAlgebra: ["Lenguaje algebraico", "Términos semejantes", "Polinomios", "Productos notables", "Ecuaciones de primer grado", "Sistemas de ecuaciones", "Inecuaciones"],
    mathFunction: ["Plano cartesiano", "Patrones y sucesiones", "Funciones", "Función lineal", "Pendiente"],
    mathGeometry: ["Ángulos", "Triángulos", "Teorema de Pitágoras", "Congruencia y semejanza", "Perímetro", "Área", "Circunferencia y círculo", "Volumen", "Transformaciones geométricas"],
    mathData: ["Estadística descriptiva", "Gráficas y tablas", "Probabilidad"]
  }
};

const atomicVariant = (topic, profile) => {
  const map = {
    "Átomo": { focus: "integrar núcleo y nube electrónica", objective: "Construye carbono-12 neutro.", targets: [["protons", 6], ["neutrons", 6], ["electrons", 6]] },
    "Protones": { focus: "comprobar que los protones determinan el elemento", objective: "Construye neón cambiando el número de protones.", targets: [["protons", 10]], links: [{ source: "protons", target: "electrons" }] },
    "Neutrones": { focus: "comparar isótopos del mismo elemento", objective: "Construye carbono-14 conservando Z=6.", targets: [["protons", 6], ["neutrons", 8], ["electrons", 6]], editable: ["neutrons"] },
    "Electrones": { focus: "observar capas y carga eléctrica", objective: "Forma el ion óxido O²⁻.", targets: [["protons", 8], ["electrons", 10]], editable: ["electrons"] },
    "Número atómico": { focus: "relacionar Z con protones e identidad", objective: "Localiza el neón mediante Z=10.", targets: [["protons", 10]], links: [{ source: "protons", target: "electrons" }] },
    "Isótopos": { focus: "mantener Z y modificar A", objective: "Representa carbono-14.", targets: [["protons", 6], ["neutrons", 8]], editable: ["neutrons"] },
    "Iones": { focus: "calcular q=p−e", objective: "Forma Na⁺ con 11 protones y 10 electrones.", targets: [["protons", 11], ["electrons", 10]], editable: ["electrons"] }
  }[topic];
  if (!map) return profile;
  profile.simulatorProfile.focus = map.focus;
  profile.simulatorProfile.objective = { strategy: "all", label: map.objective, targets: map.targets.map(([metric, value]) => ({ metric, value, tolerance: 0 })) };
  profile.simulatorProfile.links = map.links || [];
  if (map.editable) profile.simulatorProfile.controls.forEach((control) => { control.editable = map.editable.includes(control.id); control.visible = true; });
  profile.gameProfile.learningObjective = `Comprender ${topic}: ${map.focus}.`;
  return profile;
};

const periodicVariant = (topic, profile) => {
  const map = {
    "Tabla periódica": { value: 6, focus: "relacionar número atómico, posición, símbolo y familia en los 118 elementos", objective: "Localiza el carbono (Z=6) en la tabla periódica." },
    "Metales": { value: 26, focus: "identificar regiones metálicas y comparar sus familias", objective: "Localiza el hierro (Fe, Z=26), un metal de transición." },
    "No metales": { value: 8, focus: "identificar no metales y relacionar posición con propiedades", objective: "Localiza el oxígeno (O, Z=8), un no metal." },
    "Gases nobles": { value: 10, focus: "reconocer el grupo 18 y su configuración electrónica estable", objective: "Localiza el neón (Ne, Z=10), un gas noble." }
  }[topic];
  if (!map) return profile;
  profile.simulatorProfile.focus = map.focus;
  profile.simulatorProfile.objective = { strategy: "all", label: map.objective, targets: [{ metric: "atomicNumber", value: map.value, tolerance: 0 }] };
  profile.gameProfile.learningObjective = `Comprender ${topic}: ${map.focus}.`;
  profile.gameProfile.evidence = `La evidencia debe usar la posición real de los elementos en la tabla periódica para explicar ${topic}.`;
  return profile;
};

const motionVariant = (topic, profile) => {
  if (topic !== "Movimiento rectilíneo uniforme (MRU)") return profile;
  profile.simulatorProfile.focus = "Mantener una velocidad constante comprobando que la aceleración sea cero.";
  profile.simulatorProfile.measurementLabel = "Aceleración";
  profile.simulatorProfile.measurementUnit = "m/s²";
  profile.simulatorProfile.objectiveMetric = "acceleration";
  profile.simulatorProfile.objective = {
    strategy: "all",
    label: "Ajusta la fuerza para conservar velocidad constante: aceleración = 0 m/s².",
    targets: [{ metric: "acceleration", value: 0, tolerance: .01 }]
  };
  return profile;
};

const additionSubtractionVariant = (topic, profile) => {
  if (topic !== "Adición y sustracción") return profile;
  profile.simulatorProfile.focus = "Representa sumas y restas de enteros mediante desplazamientos y pares cero.";
  profile.simulatorProfile.formula = "a ± b = resultado";
  profile.simulatorProfile.measurementLabel = "Resultado";
  profile.simulatorProfile.measurementUnit = "";
  profile.simulatorProfile.objective = { strategy: "all", label: "Explora libremente cómo cambian el signo, el desplazamiento y las fichas.", targets: [] };
  profile.gameProfile.learningObjective = "Resolver e interpretar adiciones y sustracciones de enteros, incluyendo la resta de números negativos.";
  profile.gameProfile.evidence = "La evidencia debe relacionar la operación con el desplazamiento en la recta y la cancelación de pares cero.";
  return profile;
};

const numberLineVariant = (topic, profile) => {
  if (topic !== "La recta numérica") return profile;
  profile.simulatorProfile.focus = "Relacionar el valor inicial, el desplazamiento y la posición final con un punto de comparación ajustable.";
  profile.simulatorProfile.objective = {
    strategy: "all",
    label: "Haz que la posición final coincida con el punto de comparación.",
    targets: [],
    dynamicTarget: "comparison"
  };
  return profile;
};

const quadraticFactorizationVariant = (topic, profile) => {
  if (topic !== "Factorización") return profile;
  profile.simulatorProfile.focus = "Factorizar trinomios cuadráticos enteros extrayendo el factor común y organizando cuatro términos en una caja 2×2.";
  profile.simulatorProfile.formula = "g(px + q)(rx + s) = ax² + bx + c";
  profile.simulatorProfile.measurementLabel = "Construcción algebraica";
  profile.simulatorProfile.objective = {
    strategy: "all",
    label: "Extrae el factor común, completa la caja 2×2 y construye los dos binomios.",
    targets: [],
    dynamicTarget: "factorizationProgress"
  };
  profile.gameProfile.learningObjective = "Factorizar trinomios cuadráticos enteros mediante factor común, separación del término medio y modelo rectangular.";
  profile.gameProfile.evidence = "La evidencia debe verificar que las cuatro regiones del rectángulo reproducen ax² + bx + c y que sus lados forman factores equivalentes.";
  return profile;
};

function createProfile(subject, topic, familyId) {
  const family = FAMILY[familyId];
  const [modelId, sceneVariant, formula, measurementLabel, mechanic, questionTypes] = family;
  const profile = {
    id: curriculumProfileId(subject, topic), profileVersion: CURRICULUM_PROFILE_VERSION, subject, topic,
    simulatorProfile: {
      modelId, sceneVariant, formula, measurementLabel, measurementUnit: "", graphMode: sceneVariant,
      focus: `Explorar ${topic} mediante variables observables y una relación verificable.`, controls: clone(controls[familyId] || controls[modelId] || controls.math),
      links: [], constraints: [], objective: { strategy: "all", label: `Explora la relación principal de ${topic}.`, targets: [] }
    },
    gameProfile: {
      learningObjective: `Explicar y aplicar ${topic} mediante evidencia.`, mechanic, modelId: `${subject}-${normalize(topic)}`,
      sceneVariant, questionTypes: clone(questionTypes), progression: ["reconocer", "relacionar", "aplicar"], maxAttempts: 2,
      evidence: `La evidencia debe mostrar la relación científica o matemática propia de ${topic}.`
    }
  };
  let configured = profile;
  if (familyId === "motion") configured = motionVariant(topic, configured);
  if (familyId === "atomic") configured = atomicVariant(topic, configured);
  if (familyId === "periodic") configured = periodicVariant(topic, configured);
  if (familyId === "additionSubtraction") configured = additionSubtractionVariant(topic, configured);
  if (familyId === "numberLine") configured = numberLineVariant(topic, configured);
  if (familyId === "quadraticFactorization") configured = quadraticFactorizationVariant(topic, configured);
  if (subject === "chemistry") return applyChemistrySimulatorProfile(topic, configured);
  if (subject === "biology") return applyBiologySimulatorProfile(topic, configured);
  return configured;
}

export function createCurriculumRegistry(topicCatalog) {
  const registry = new Map();
  validateChemistryProfiles(topicCatalog?.chemistry || []);
  validateBiologyProfiles(topicCatalog?.biology || []);
  for (const [subject, topics] of Object.entries(topicCatalog || {})) {
    const assigned = new Map();
    for (const [familyId, familyTopics] of Object.entries(GROUPS[subject] || {})) {
      familyTopics.forEach((topic) => assigned.set(normalize(topic), familyId));
    }
    for (const topic of topics) {
      const familyId = assigned.get(normalize(topic));
      if (!familyId || !FAMILY[familyId]) throw new Error(`Falta perfil curricular curado para ${subject}: ${topic}`);
      const profile = createProfile(subject, topic, familyId);
      if (!profile.simulatorProfile || !profile.gameProfile) throw new Error(`Perfil curricular incompleto: ${profile.id}`);
      registry.set(profile.id, Object.freeze(profile));
    }
  }
  return registry;
}

export function resolveCurriculumProfile(registry, subject, topic) {
  return registry.get(curriculumProfileId(subject, topic)) || null;
}

export function applyCurriculumProfile(activity, profile) {
  if (!profile) return activity;
  const simulator = clone(profile.simulatorProfile);
  activity.profileId = profile.id;
  activity.profileVersion = profile.profileVersion;
  activity.curriculumProfile = clone(profile);
  activity.simulationType = simulator.modelId;
  activity.variant = simulator.sceneVariant;
  activity.controls = simulator.controls;
  activity.simulator = {
    ...(activity.simulator || {}), modelId: simulator.modelId, sceneVariant: simulator.sceneVariant,
    formula: simulator.formula, measurementLabel: simulator.measurementLabel, measurementUnit: simulator.measurementUnit,
    objectiveEnabled: simulator.objective.targets.length > 0 || Boolean(simulator.objective.dynamicTarget), objective: simulator.objective.label,
    objectiveStrategy: simulator.objective.strategy, objectiveTargets: simulator.objective.targets,
    objectiveTargetMetric: simulator.objective.dynamicTarget || "",
    objectiveMetric: simulator.objectiveMetric || "", links: simulator.links,
    profileId: profile.id, profileVersion: profile.profileVersion
  };
  const firstTarget = simulator.objective.targets[0];
  if (firstTarget) {
    const targetControl = simulator.controls.find((control) => control.id === firstTarget.metric);
    activity.challenge = { targetLabel: targetControl?.label || firstTarget.metric, targetValue: firstTarget.value, tolerance: firstTarget.tolerance };
  } else if (simulator.objective.dynamicTarget) activity.challenge = null;
  activity.gameProfile = clone(profile.gameProfile);
  return activity;
}

export function buildCuratedProfileAssessment(profile, index = 0) {
  if (!profile?.gameProfile) return null;
  const game = profile.gameProfile;
  const type = game.questionTypes[index % game.questionTypes.length];
  const context = `Laboratorio de ${profile.topic}. ${game.learningObjective}`;
  const feedback = `${game.evidence} Perfil curricular ${profile.id}.`;
  if (profile.simulatorProfile.modelId === "addition-subtraction") {
    const variants = [
      { a: 5, operator: "+", b: 3, result: 8, explanation: "Sumar 3 desplaza tres unidades a la derecha." },
      { a: 5, operator: "−", b: 3, result: 2, explanation: "Restar 3 desplaza tres unidades a la izquierda." },
      { a: 5, operator: "+", b: -3, result: 2, explanation: "Sumar −3 equivale a desplazarse tres unidades a la izquierda." },
      { a: 5, operator: "−", b: -3, result: 8, explanation: "Restar −3 equivale a sumar 3 y desplazarse a la derecha." }
    ];
    const variant = variants[index % variants.length];
    const shownB = variant.b < 0 ? `(${variant.b})` : String(variant.b);
    const equation = `${variant.a} ${variant.operator} ${shownB}`;
    const specificFeedback = `${variant.explanation} ${feedback}`;
    if (type === "numeric-answer") return { type, context, given: [equation], goal: "Calcula el resultado entero exacto.", prompt: `¿Cuál es el resultado de ${equation}?`, answer: variant.result, correctAnswer: variant.result, correctValue: variant.result, tolerance: 0, feedback: specificFeedback };
    if (type === "equation-build") { const pieces = [String(variant.a), variant.operator, shownB, "=", String(variant.result)]; return { type, context, given: [variant.explanation], goal: "Construye la igualdad correcta.", prompt: "Ordena las piezas para formar la operación y su resultado.", pieces, correctSequence: pieces, feedback: specificFeedback }; }
    if (type === "sequence-order") { const steps = ["Identificar la operación", "Determinar el signo del desplazamiento", "Moverse en la recta numérica", "Comprobar con pares cero"]; return { type, context, given: [equation], goal: "Aplica un procedimiento verificable.", prompt: `Ordena el procedimiento para resolver ${equation}.`, steps, correctOrder: steps, feedback: specificFeedback }; }
    return { type: "multiple", context, given: [equation], goal: "Interpreta correctamente el signo de la operación.", prompt: `¿Qué resultado y desplazamiento corresponden a ${equation}?`, options: [`${variant.result}; ${variant.explanation}`, `${-variant.result}; se conserva el signo sin operar`, `${variant.a}; el segundo número no modifica la posición`, `${variant.b}; sólo cuenta el segundo número`], correct: 0, feedback: specificFeedback };
  }
  if (profile.simulatorProfile.modelId === "quadratic-factorization-rectangle") {
    const variants = [
      { trinomial: "x² + 5x + 6", factorization: "(x + 2)(x + 3)", split: "2x + 3x" },
      { trinomial: "2x² + 7x + 3", factorization: "(2x + 1)(x + 3)", split: "6x + x" },
      { trinomial: "x² − x − 6", factorization: "(x − 3)(x + 2)", split: "2x − 3x" },
      { trinomial: "2x² + 10x + 12", factorization: "2(x + 2)(x + 3)", split: "2x + 3x después de extraer 2" }
    ];
    const variant = variants[index % variants.length];
    const specificFeedback = `La caja 2×2 debe reconstruir ${variant.trinomial}. ${feedback}`;
    if (type === "equation-build") { const pieces = [variant.trinomial, "=", variant.factorization]; return { type, context, given: [variant.split], goal: "Construye una factorización equivalente.", prompt: `Factoriza ${variant.trinomial}.`, pieces, correctSequence: pieces, feedback: specificFeedback }; }
    if (type === "sequence-order") { const steps = ["Extraer el factor común", "Separar el término medio", "Completar la caja 2×2", "Leer los factores de los lados"]; return { type, context, given: [variant.trinomial], goal: "Aplica el método rectangular.", prompt: "Ordena el procedimiento de factorización.", steps, correctOrder: steps, feedback: specificFeedback }; }
    if (type === "numeric-answer") return { type, context, given: [variant.trinomial, variant.split], goal: "Comprueba el producto de los términos extremos.", prompt: "¿Cuántas regiones tiene la caja algebraica usada para separar el trinomio?", answer: 4, correctAnswer: 4, correctValue: 4, tolerance: 0, feedback: specificFeedback };
    return { type: "multiple", context, given: [variant.trinomial], goal: "Selecciona una factorización equivalente.", prompt: `¿Cuál es la factorización de ${variant.trinomial}?`, options: [variant.factorization, "(x + 1)(x + 6)", "(x − 2)(x − 3)", "No se puede factorizar"], correct: 0, feedback: specificFeedback };
  }
  if (type === "number-line-placement") return {
    type,
    context: "Una recta numérica representa orden, signo y distancia usando una escala uniforme.",
    given: ["Punto inicial: −2", "Desplazamiento: 7/4 hacia la derecha"],
    goal: "Calcula y ubica la posición final exacta.",
    prompt: "Parte de −2 y desplázate 7/4 a la derecha. Ubica el resultado.",
    min: -20,
    max: 20,
    denominator: 4,
    startValue: -2,
    targetValue: -.25,
    tolerance: .08,
    feedback
  };
  if (type === "matching") return { type, context, given: [profile.topic], goal: game.learningObjective, prompt: `Relaciona las evidencias fundamentales de ${profile.topic}.`, pairs: [["Tema", profile.topic], ["Modelo", profile.simulatorProfile.measurementLabel], ["Relación", profile.simulatorProfile.formula]], feedback };
  if (type === "sequence-order") { const steps = ["Identificar las variables", "Predecir el cambio", "Aplicar la relación", "Comparar con la evidencia"]; return { type, context, given: [profile.simulatorProfile.formula], goal: game.learningObjective, prompt: `Ordena el análisis de ${profile.topic}.`, steps, correctOrder: steps, feedback }; }
  if (type === "equation-build") { const pieces = profile.simulatorProfile.formula.split(/\s+/).filter(Boolean); return { type, context, given: [profile.topic], goal: game.learningObjective, prompt: `Construye la relación principal de ${profile.topic}.`, pieces, correctSequence: pieces, feedback }; }
  return { type: "multiple", context, given: [profile.simulatorProfile.formula], goal: game.learningObjective, prompt: `¿Qué evidencia permite comprender ${profile.topic}?`, options: [game.evidence, "Cambiar todas las variables sin medir", "Memorizar el título sin observar", "Ignorar las unidades y la relación"], correct: 0, feedback };
}
