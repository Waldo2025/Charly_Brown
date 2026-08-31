import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  experienceAdaptationAddsValue,
  experienceDesignQuality,
  experienceLearningCoverage,
  experienceSourcePreservation,
  extractExperienceAnchors,
  findUnrequestedBiologyConcepts,
  parseExpectedLearningStatements,
  repairExperienceProposalLanguage
} from "../public/js/science-experience-proposal.mjs";

const expectedLearnings = `
Explica la ley de los exponentes de bases iguales.
Analiza los procedimientos para calcular potencias y raíces.
Aplica procedimientos para calcular patrones exponenciales en situaciones específicas.
`;

test("separa una lista pegada en aprendizajes esperados independientes", () => {
  assert.deepEqual(parseExpectedLearningStatements(expectedLearnings), [
    "Explica la ley de los exponentes de bases iguales.",
    "Analiza los procedimientos para calcular potencias y raíces.",
    "Aplica procedimientos para calcular patrones exponenciales en situaciones específicas."
  ]);
});

test("comprueba que la experiencia haga reconocibles los aprendizajes curriculares", () => {
  const candidate = "El grupo aplica la ley de los exponentes de bases iguales para comparar patrones exponenciales. Después calcula potencias y raíces y justifica el procedimiento usado en una situación específica.";
  assert.equal(experienceLearningCoverage(expectedLearnings, candidate).valid, true);
  assert.equal(experienceLearningCoverage(expectedLearnings, "El grupo participa en una campaña escolar.").valid, false);
});

test("rechaza narrativas basadas en controles genéricos y acepta experiencias con evidencias", () => {
  const stages = [
    { studentAction: "Registra los datos de tres rondas y calcula sus factores de cambio.", evidence: "Una tabla comparativa con cálculos verificados." },
    { studentAction: "Contrasta dos proyecciones y comprueba los resultados con raíces.", evidence: "Una gráfica anotada y una justificación breve." }
  ];
  const base = {
    situation: "En la cooperativa escolar, el inventario de materiales aumenta por paquetes durante varias rondas y el grupo debe prever cuánto espacio ocupará sin exceder la capacidad disponible.",
    mission: "El estudiante compara modelos de crecimiento y recomienda una cantidad viable de paquetes.",
    stages,
    finalProduct: "Una tabla y una gráfica con las proyecciones comprobadas.",
    finalDecision: "Elegir la proyección que cabe en el almacén y justificarla con los resultados."
  };
  const acceptedCandidate = `${base.situation} ${base.mission} Primero registra datos y calcula potencias. Después contrasta las proyecciones y comprueba raíces. Como producto final entrega una tabla y una gráfica. Con esa evidencia elige una cantidad viable y justifica la decisión con los resultados obtenidos.`;
  assert.equal(experienceDesignQuality({ ...base, candidate: acceptedCandidate }).valid, true);
  assert.equal(experienceDesignQuality({ ...base, candidate: `${acceptedCandidate} Ajusta el Valor de x, el Coeficiente y la Constante en la interfaz.` }).valid, false);
  assert.equal(experienceDesignQuality({
    ...base,
    candidate: `${acceptedCandidate} Compara el coeficiente de cada término y determina si la constante conserva la igualdad.`
  }).valid, true);
});

test("limpia frases genéricas menores antes de validar sin alterar vocabulario curricular", () => {
  const repaired = repairExperienceProposalLanguage("En una situación de la vida real, el grupo usa la interfaz para comprender el tema y comparar coeficientes y constantes.");
  assert.doesNotMatch(repaired, /situación de la vida real|interfaz|comprender el tema/i);
  assert.match(repaired, /coeficientes y constantes/);
});

test("adapta la extensión a listas curriculares amplias y distingue observaciones menores", () => {
  const stages = [
    { studentAction: "Clasifica los datos disponibles y realiza los cálculos correspondientes.", evidence: "Una tabla revisada con resultados y unidades." },
    { studentAction: "Compara las proyecciones y comprueba cada procedimiento empleado.", evidence: "Una gráfica comentada con conclusiones verificables." }
  ];
  const situation = "En una actividad escolar concreta, el grupo recibe registros de varias semanas y debe preparar una recomendación viable respetando el presupuesto y el espacio realmente disponibles.";
  const longCandidate = `${situation} El estudiante debe elaborar una recomendación fundamentada. ${"El grupo documenta un procedimiento distinto, contrasta los datos y registra evidencia verificable para la decisión final. ".repeat(25)}`;
  const result = experienceDesignQuality({
    candidate: longCandidate,
    situation,
    mission: "El estudiante organiza los datos, comprueba los procedimientos y presenta una recomendación viable.",
    stages,
    finalProduct: "Un informe breve con tabla, gráfica y cálculos comprobados.",
    finalDecision: "Seleccionar la alternativa viable y justificarla con la evidencia reunida.",
    expectedLearningCount: 9
  });
  assert.equal(result.valid, true);
  assert.equal(result.maximumLength, 4000);
  const softIssue = experienceDesignQuality({
    candidate: longCandidate,
    situation,
    mission: "Misión breve.",
    stages,
    finalProduct: "Un informe breve con tabla, gráfica y cálculos comprobados.",
    finalDecision: "Seleccionar la alternativa viable y justificarla con la evidencia reunida.",
    expectedLearningCount: 9
  });
  assert.equal(softIssue.valid, false);
  assert.equal(softIssue.usable, true);
});

test("extrae del prompt los elementos concretos que definen su esencia", () => {
  const anchors = extractExperienceAnchors("Editar un video de una rutina de skateboarding y sincronizar el golpe de la tabla con la música.")
    .map(({ token }) => token);
  assert.deepEqual(anchors, ["editar", "video", "rutina", "skateboarding", "sincronizar", "golpe", "tabla", "musica"]);
});

test("acepta una adaptación que conserva escenario, acciones y objetos", () => {
  const source = "Editar un video de una rutina de skateboarding y sincronizar el golpe de la tabla con la música.";
  const candidate = "Edita el video de una rutina de skateboarding para una publicación escolar. Sincroniza el golpe de la tabla con la música usando las variables disponibles. Compara la evidencia y decide cuándo queda listo el montaje.";
  const result = experienceSourcePreservation(source, candidate);
  assert.equal(result.valid, true);
  assert.equal(result.coverage, 1);
});

test("rechaza el resultado repetitivo que sustituye la experiencia por otra misión", () => {
  const source = "Editar un video de una rutina de skateboarding y sincronizar el golpe de la tabla con la música.";
  const candidate = "En un laboratorio escolar, el equipo ajusta variables para observar un fenómeno. Registra datos en una gráfica y compara los resultados. Usa la evidencia para completar la misión científica.";
  const result = experienceSourcePreservation(source, candidate);
  assert.equal(result.valid, false);
  assert.ok(result.missing.includes("skateboarding"));
  assert.ok(result.missing.includes("musica"));
});

test("rechaza una simple reorganización y acepta una experiencia desarrollada desde el brief", () => {
  const source = "Explorar la fotosíntesis y reconocer la función de la luz en las plantas.";
  const reordered = "Reconoce la función de la luz en las plantas y explora la fotosíntesis durante la actividad.";
  const adapted = "Una zona verde de la escuela está perdiendo vigor y el grupo debe explorar la fotosíntesis para reconocer la función de la luz en las plantas y proponer una ubicación adecuada. El estudiante compara configuraciones, observa cambios y registra evidencia en cada intento sin abandonar los contenidos del brief. Al final contrasta los resultados y justifica qué condición favorece mejor el proceso estudiado.";
  assert.equal(experienceAdaptationAddsValue(source, reordered).valid, false);
  assert.equal(experienceAdaptationAddsValue(source, adapted).valid, true);
});

test("detecta ATP y variables celulares que no estaban en el prompt del docente", () => {
  const source = "Explica las diferencias entre organismos unicelulares y pluricelulares. Analiza las diferencias entre células procariota y eucariota. Identifica la importancia del microscopio en los avances científicos de la teoría celular.";
  const candidate = "Explica las diferencias entre organismos unicelulares y pluricelulares. Ajusta Nutrientes y Oxígeno para favorecer la producción de ATP. Examina el gasto energético y la supervivencia del cultivo.";
  assert.deepEqual(findUnrequestedBiologyConcepts(source, candidate), [
    "atp", "cultivo", "gasto energetico", "nutrientes", "oxigeno", "supervivencia"
  ]);
});

test("la revisión prioriza fidelidad y nunca sobrescribe si fallan los intentos", async () => {
  const source = await readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8");
  assert.match(source, /const isAcceptablyDistinct = isProposalRevision \|\| proposalIsDistinct/);
  assert.match(source, /experienceSourcePreservation\(currentProposal, candidate\)/);
  assert.match(source, /experienceAdaptationAddsValue\(currentProposal, candidate\)/);
  assert.match(source, /findUnrequestedBiologyConcepts\(`\$\{currentProposal\} \$\{topic\} \$\{supportedControlDescription\}`, candidate\)/);
  assert.match(source, /minItems: Math\.min\(2, supportedControlLabels\.length\)/);
  assert.match(source, /Variables disponibles que puedes integrar/);
  assert.match(source, /candidate\.length <= \(isProposalRevision \? 2200 : 900\)/);
  assert.match(source, /No devuelvas una lista ni una corrección cosmética/);
  assert.match(source, /Se conservó intacto tu texto/);
  const failureIndex = source.indexOf("if (!acceptedProposal)");
  const overwriteIndex = source.indexOf('$("#experiencePrompt").value = acceptedProposal', failureIndex);
  assert.ok(failureIndex >= 0 && overwriteIndex > failureIndex, "el throw debe ocurrir antes de escribir el textarea");
});

test("la propuesta nueva usa aprendizajes como currículo y la experiencia como contexto opcional", async () => {
  const [source, html] = await Promise.all([
    readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8"),
    readFile(new URL("../public/scienceActivities.html", import.meta.url), "utf8")
  ]);
  const proposalSource = source.match(/async function generateExperienceProposal\(\)[\s\S]*?\n}\n\nfunction buildFallbackLearningGuide/)?.[0] || "";
  assert.match(html, /id="expectedLearnings"/);
  assert.match(html, /Aprendizajes esperados/);
  assert.match(html, /Experiencia o idea de contexto/);
  assert.match(proposalSource, /parseExpectedLearningStatements\(expectedLearnings\)/);
  assert.match(proposalSource, /coveredLearningIndexes/);
  assert.match(proposalSource, /finalProduct/);
  assert.match(proposalSource, /finalDecision/);
  assert.match(proposalSource, /No hay una idea de contexto\. Inventa una experiencia completamente nueva\./);
  assert.match(proposalSource, /const distinct = Boolean\(experienceSeed\) \|\| proposalIsDistinct\(candidate, recentProposals\)/);
  assert.match(proposalSource, /!experienceSeed && recentProposals\.length/);
  assert.doesNotMatch(proposalSource, /recentProposals\.push\(candidate\)/);
  assert.match(proposalSource, /acceptableRepeatedProposal/);
  assert.match(proposalSource, /acceptableSoftIssueProposal/);
  assert.match(proposalSource, /curriculumAndDesignAreValid/);
  assert.match(proposalSource, /Experience proposal validation rejected/);
  assert.doesNotMatch(proposalSource, /usedVariables/);
  assert.match(source, /activity\.expectedLearnings/);
  assert.match(source, /expectedLearnings: state\.activity\.expectedLearnings/);
});
