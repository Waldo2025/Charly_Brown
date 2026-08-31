function asArray(value) {
  if (Array.isArray(value)) return value;
  return value == null || value === "" ? [] : [value];
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function clippedWords(value, maximum) {
  const words = String(value || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  return words.slice(0, maximum).join(" ").replace(/[,:;]+$/g, "");
}

function normalizedCompound(compound, side) {
  if (typeof compound === "string") return { formula: compound, side };
  return { ...compound, side: compound?.side === "product" ? "product" : side };
}

export function repairGeneratedAssessmentShape(source = {}, expectedType = "") {
  if (!source || typeof source !== "object") return null;
  const repaired = structuredClone(source);
  if (expectedType && !repaired.type) repaired.type = expectedType;

  if (expectedType === "fill-blank") {
    const accepted = firstDefined(
      repaired.accepted,
      repaired.acceptedAnswers,
      repaired.correctAnswers,
      repaired.answers,
      repaired.answer,
      repaired.correctAnswer
    );
    repaired.accepted = asArray(accepted).map(String).map((value) => value.trim()).filter(Boolean);
    if (!asArray(repaired.segments).length) {
      const expression = firstDefined(
        repaired.expression,
        repaired.blankExpression,
        repaired.sentence,
        repaired.formula,
        repaired.equation
      );
      if (expression != null) repaired.expression = String(expression);
    }
  }

  if (expectedType === "numeric-answer") {
    repaired.correctValue = firstDefined(
      repaired.correctValue,
      repaired.numericAnswer,
      repaired.value,
      repaired.result,
      repaired.answer,
      repaired.correctAnswer
    );
    repaired.tolerance = firstDefined(repaired.tolerance, repaired.margin, repaired.allowedError, 0);
    repaired.unit = String(firstDefined(repaired.unit, repaired.units, repaired.measurementUnit, ""));
  }

  if (expectedType === "chemical-balance") {
    if (!asArray(repaired.compounds).length) {
      repaired.compounds = [
        ...asArray(repaired.reactants).map((compound) => normalizedCompound(compound, "reactant")),
        ...asArray(repaired.products).map((compound) => normalizedCompound(compound, "product"))
      ];
    }
    repaired.correctCoefficients = asArray(firstDefined(
      repaired.correctCoefficients,
      repaired.coefficients,
      repaired.balancedCoefficients,
      repaired.answer,
      repaired.correctAnswer
    ));
  }

  return repaired;
}

export function buildGeneratedAssessmentGroundingContext(activity = {}, currentContext = "") {
  const parts = [];
  const topic = clippedWords(activity.topic, 12);
  const experience = clippedWords(activity.experiencePrompt, 16);
  const learning = clippedWords(activity.expectedLearnings, 18);
  const context = clippedWords(currentContext, 40);
  if (topic) parts.push(`Tema: ${topic}.`);
  if (experience) parts.push(`Situación: ${experience}.`);
  if (learning) parts.push(`Aprendizaje aplicado: ${learning}.`);
  if (context) parts.push(context);
  return clippedWords(parts.join(" "), 86);
}
