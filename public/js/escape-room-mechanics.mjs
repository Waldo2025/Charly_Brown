const normalizeText = (value = "") => String(value ?? "").replace(/\s+/g, " ").trim();

const normalizeToken = (value = "") => normalizeText(value)
  .toLocaleLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim();

const normalizeMechanicSearchText = (value = "") => String(value ?? "")
  .toLocaleLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^\p{L}\p{N}+-]+/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

const normalizeCompact = (value = "") => normalizeToken(value).replace(/\s+/g, "");

const unique = (values = []) => [...new Set(values.filter(Boolean))];

function deterministicSeed(value = "") {
  return [...String(value)].reduce((seed, character) => (
    Math.imul(seed ^ character.codePointAt(0), 16777619) >>> 0
  ), 2166136261);
}

function deterministicShuffle(values = [], seedText = "") {
  const result = [...values];
  let seed = deterministicSeed(seedText);
  for (let index = result.length - 1; index > 0; index -= 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const target = seed % (index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  if (result.length > 1 && result.every((value, index) => value === values[index])) {
    result.push(result.shift());
  }
  return result;
}

function permutationDistance(candidate = [], source = []) {
  return candidate.reduce((distance, value, index) => distance + (value === source[index] ? 0 : 1), 0);
}

function isSimpleRotation(candidate = [], source = []) {
  if (candidate.length !== source.length || candidate.length < 2) return false;
  const joinedSource = source.join("");
  const joinedCandidate = candidate.join("");
  return `${joinedSource}${joinedSource}`.slice(1, -1).includes(joinedCandidate);
}

function buildDeterministicAnagram(values = [], seedText = "") {
  if (values.length < 3) return [];
  const candidates = Array.from({ length: 12 }, (_, attempt) => (
    deterministicShuffle(values, `${seedText}:${attempt}`)
  ));
  const nonTrivial = candidates.filter((candidate) => (
    candidate.join("") !== values.join("")
    && candidate.join("") !== [...values].reverse().join("")
    && !isSimpleRotation(candidate, values)
  ));
  return (nonTrivial.length ? nonTrivial : candidates)
    .sort((left, right) => permutationDistance(right, values) - permutationDistance(left, values))[0] || [];
}

function normalizeMechanicKind(value = "") {
  const kind = normalizeToken(value).replace(/\s+/g, "_");
  if (["cipher_assertion", "cipher_verification", "cifrado_verificacion", "verificacion_cifrado"].includes(kind)) return "cipher_assertion";
  if (["cipher", "caesar", "caesar_cipher", "cifrado", "cifrado_cesar"].includes(kind)) return "cipher";
  if (["anagram", "anagrama", "unscramble"].includes(kind)) return "anagram";
  if (["sequence", "secuencia", "ordering", "orden"].includes(kind)) return "sequence";
  return "none";
}

function normalizeBooleanTarget(value) {
  if (typeof value === "boolean") return value;
  const token = normalizeToken(value);
  if (["true", "verdadero", "vrai", "verdadeiro", "1"].includes(token)) return true;
  if (["false", "falso", "faux", "0"].includes(token)) return false;
  return null;
}

function extractClaimedCipherValue(plan = {}, fallback = "") {
  const explicit = normalizeText(plan?.mechanic_contract?.claimed_value || plan?.claimed_value);
  if (explicit) return explicit;
  const source = [
    plan?.application,
    plan?.instruction_outline,
    ...(Array.isArray(plan?.case_data) ? plan.case_data : [])
  ].filter(Boolean).join(" ");
  const patterns = [
    /\b(?:yields?|produces?|results?\s+in|decodes?\s+to|decrypts?\s+to|equals?)\s+(?:the\s+(?:system\s+)?(?:status\s+)?(?:output\s+)?)?["'“”]?([\p{L}\p{N}][\p{L}\p{N}\s-]{0,30}?)["'“”]?(?=[.,;!?]|\s+(?:under|using|with|when|after|if)\b|$)/iu,
    /\b(?:da\s+como\s+resultado|produce|resulta\s+en|se\s+descifra\s+como|equivale\s+a)\s+["'“”]?([\p{L}\p{N}][\p{L}\p{N}\s-]{0,30}?)["'“”]?(?=[.,;!?]|\s+(?:con|usando|cuando|si)\b|$)/iu
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (normalizeText(match?.[1])) return normalizeText(match[1]);
  }
  return normalizeText(fallback);
}

function normalizeAlphabet(value = "") {
  const source = normalizeText(value).toLocaleUpperCase() || "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return unique([...source].filter((character) => !/\s/u.test(character))).join("");
}

export function shiftCipherText(value = "", shift = 0, alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
  const sourceAlphabet = normalizeAlphabet(alphabet);
  if (sourceAlphabet.length < 2) return normalizeText(value);
  const lookup = new Map([...sourceAlphabet].map((character, index) => [character, index]));
  const amount = Number.isFinite(Number(shift)) ? Math.trunc(Number(shift)) : 0;
  return [...String(value ?? "")].map((character) => {
    const upper = character.toLocaleUpperCase();
    if (!lookup.has(upper)) return character;
    const index = lookup.get(upper);
    const nextIndex = ((index + amount) % sourceAlphabet.length + sourceAlphabet.length) % sourceAlphabet.length;
    const shifted = sourceAlphabet[nextIndex];
    return character === character.toLocaleLowerCase() ? shifted.toLocaleLowerCase() : shifted;
  }).join("");
}

function materializeMechanicContract(contract = {}, seedText = "") {
  const source = contract && typeof contract === "object" && !Array.isArray(contract) ? contract : {};
  const kind = normalizeMechanicKind(source.kind || source.type || source.mechanic);
  if (kind === "none") return { kind: "none" };

  if (kind === "cipher_assertion") {
    const alphabet = normalizeAlphabet(source.alphabet);
    const requestedShift = Math.trunc(Number(source.shift) || 0);
    const shift = alphabet.length > 1 && requestedShift % alphabet.length !== 0
      ? requestedShift
      : 0;
    const ciphertext = normalizeText(source.ciphertext);
    const calculatedValue = ciphertext && shift
      ? normalizeText(shiftCipherText(ciphertext, -shift, alphabet))
      : "";
    const suppliedValue = normalizeText(source.computed_value || source.decoded_value);
    const computedValue = suppliedValue && normalizeCompact(suppliedValue) === normalizeCompact(calculatedValue)
      ? suppliedValue
      : calculatedValue;
    const expectedBoolean = normalizeBooleanTarget(source.expected_boolean ?? source.answer ?? source.correct_answer);
    return {
      kind,
      alphabet,
      shift,
      ciphertext,
      computed_value: computedValue,
      claimed_value: normalizeText(source.claimed_value),
      expected_boolean: expectedBoolean
    };
  }

  if (kind === "cipher") {
    const solution = normalizeText(source.solution || source.plaintext || source.correct_answer || source.answer);
    const alphabet = normalizeAlphabet(source.alphabet);
    const requestedShift = Math.trunc(Number(source.shift) || 0);
    const shift = alphabet.length > 1 && requestedShift % alphabet.length !== 0
      ? requestedShift
      : 0;
    const suppliedCiphertext = normalizeText(source.ciphertext);
    const ciphertext = suppliedCiphertext && solution && shift
      && normalizeCompact(shiftCipherText(suppliedCiphertext, -shift, alphabet)) === normalizeCompact(solution)
      ? suppliedCiphertext
      : solution && shift ? shiftCipherText(solution, shift, alphabet) : "";
    return { kind, solution, alphabet, shift, ciphertext };
  }

  if (kind === "anagram") {
    const solution = normalizeText(source.solution || source.correct_answer || source.answer);
    const compactSolution = [...solution].filter((character) => !/\s/u.test(character));
    const suppliedScrambled = [...normalizeText(source.scrambled)].filter((character) => !/\s/u.test(character));
    const validSupplied = suppliedScrambled.length > 1
      && suppliedScrambled.join("") !== compactSolution.join("")
      && [...suppliedScrambled].map((value) => value.toLocaleLowerCase()).sort().join("")
        === [...compactSolution].map((value) => value.toLocaleLowerCase()).sort().join("");
    const scrambled = validSupplied
      ? suppliedScrambled.join("")
      : compactSolution.length > 1 ? buildDeterministicAnagram(compactSolution, `${seedText}:${solution}`).join("") : "";
    return { kind, solution, scrambled };
  }

  const rawItems = Array.isArray(source.items) ? source.items : [];
  const items = rawItems.map((item, index) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return {
        text: normalizeText(item.text || item.label || item.value),
        order_key: Number.isFinite(Number(item.order_key ?? item.rank ?? item.order))
          ? Number(item.order_key ?? item.rank ?? item.order)
          : index + 1,
        evidence: normalizeText(item.evidence || item.reason)
      };
    }
    return { text: normalizeText(item), order_key: index + 1, evidence: "" };
  }).filter((item) => item.text);
  const orderedItems = [...items]
    .sort((first, second) => first.order_key - second.order_key)
    .map((item) => item.text);
  return {
    kind,
    ordering_rule: normalizeText(source.ordering_rule || source.rule),
    items,
    ordered_items: orderedItems
  };
}

function containsCompletionFeedback(value = "", feedback = "") {
  const normalizedValue = normalizeToken(value);
  const normalizedFeedback = normalizeToken(feedback);
  return Boolean(normalizedFeedback && normalizedValue.includes(normalizedFeedback));
}

function getSafeNarrativeEffect(plan = {}, room = {}) {
  const effect = normalizeText(plan.narrative_effect);
  const fragment = normalizeText(room.fixed_code_fragment);
  const completionFeedback = normalizeText(room.room_completion_feedback);
  if (!containsFragment(effect, fragment)
    && !containsCompletionFeedback(effect, completionFeedback)
    && !objectiveTextClaimsFragmentDelivery(effect)) {
    return effect;
  }
  return [
    room?.narrative_beat?.success_change,
    room?.narrative_beat?.next_state,
    room?.narrative_beat?.room_role,
    room?.room_objective,
    plan?.application,
    plan?.knowledge
  ].map(normalizeText).find((candidate) => (
    candidate
    && !containsFragment(candidate, fragment)
    && !containsCompletionFeedback(candidate, completionFeedback)
    && !objectiveTextClaimsFragmentDelivery(candidate)
  )) || effect;
}

function materializeQuestionPlan(plan = {}, roomIndex = 0, questionIndex = 0, reserve = false, room = {}) {
  const planId = normalizeText(plan.plan_id)
    || `room-${roomIndex + 1}-${reserve ? "reserve" : `question-${questionIndex + 1}`}`;
  const mechanicContract = reconcileObjectiveMechanicContract(plan);
  return {
    ...plan,
    plan_id: planId,
    narrative_effect: getSafeNarrativeEffect(plan, room),
    mechanic_contract: materializeMechanicContract(
      mechanicContract,
      `${roomIndex}:${questionIndex}:${planId}`
    )
  };
}

export function canonicalizeObjectiveNarrativeContinuity(blueprint = {}) {
  const result = structuredClone(blueprint || {});
  const rooms = Array.isArray(result.rooms) ? result.rooms : [];
  for (let roomIndex = 1; roomIndex < rooms.length; roomIndex += 1) {
    const inheritedState = normalizeText(rooms[roomIndex - 1]?.narrative_beat?.next_state);
    if (!inheritedState) continue;
    rooms[roomIndex].narrative_beat = {
      ...(rooms[roomIndex].narrative_beat || {}),
      incoming_state: inheritedState
    };
  }
  return result;
}

export function materializeObjectiveBlueprintMechanics(blueprint = {}) {
  const result = structuredClone(blueprint || {});
  result.rooms = (Array.isArray(result.rooms) ? result.rooms : []).map((room, roomIndex) => ({
    ...room,
    narrative_beat: {
      incoming_state: normalizeText(room?.narrative_beat?.incoming_state),
      room_role: normalizeText(room?.narrative_beat?.room_role),
      obstacle: normalizeText(room?.narrative_beat?.obstacle),
      stakes: normalizeText(room?.narrative_beat?.stakes),
      success_change: normalizeText(room?.narrative_beat?.success_change),
      next_state: normalizeText(room?.narrative_beat?.next_state)
    },
    question_plans: (Array.isArray(room.question_plans) ? room.question_plans : [])
      .map((plan, questionIndex) => materializeQuestionPlan(plan, roomIndex, questionIndex, false, room)),
    reserve_opportunity: materializeQuestionPlan(
      room.reserve_opportunity || {},
      roomIndex,
      Number(room.question_plans?.length || 0),
      true,
      room
    )
  }));
  return canonicalizeObjectiveNarrativeContinuity(result);
}

export function applyMechanicContractToQuestion(question = {}, contract = {}) {
  const source = question && typeof question === "object" && !Array.isArray(question)
    ? question
    : {};
  if (contract?.kind === "sequence") {
    const orderedItems = Array.isArray(contract.ordered_items) && contract.ordered_items.length
      ? contract.ordered_items
      : (Array.isArray(contract.items) ? [...contract.items] : [])
        .sort((first, second) => Number(first?.order_key) - Number(second?.order_key))
        .map((item) => normalizeText(item?.text || item?.label || item?.value))
        .filter(Boolean);
    return {
      ...source,
      elementos: [...orderedItems]
    };
  }
  if (contract?.kind === "cipher_assertion" && typeof contract.expected_boolean === "boolean") {
    return {
      ...source,
      subtipo_respuesta: "frase_corta",
      respuesta_correcta: contract.expected_boolean,
      respuestas_aceptadas: [],
      opciones: []
    };
  }
  if (["cipher", "anagram"].includes(contract?.kind) && normalizeText(contract.solution)) {
    const solution = normalizeText(contract.solution);
    const currentOptions = Array.isArray(source.opciones) ? source.opciones : [];
    const options = currentOptions.length
      ? [solution, ...currentOptions.filter((option) => normalizeToken(option) !== normalizeToken(solution))]
      : currentOptions;
    return {
      ...source,
      respuesta_correcta: solution,
      respuestas_aceptadas: [solution],
      opciones: options
    };
  }
  return source;
}

function collectCorrectAnswers(question = {}) {
  const interaction = normalizeText(question.tipo_interaccion).toLowerCase();
  if (["relacion_columnas", "drag_drop"].includes(interaction)) {
    return (Array.isArray(question.parejas) ? question.parejas : [])
      .flatMap((pair) => [normalizeText(pair?.izquierda), normalizeText(pair?.derecha)])
      .filter(Boolean);
  }
  if (interaction === "ordenar_secuencia") {
    return (Array.isArray(question.elementos) ? question.elementos : []).map(normalizeText).filter(Boolean);
  }
  if (typeof question.respuesta_correcta === "boolean") return [];
  return unique([
    normalizeText(question.respuesta_correcta),
    ...(Array.isArray(question.respuestas_aceptadas) ? question.respuestas_aceptadas.map(normalizeText) : [])
  ]);
}

function containsExactAnswer(text = "", answer = "") {
  const haystack = normalizeToken(text);
  const needle = normalizeToken(answer);
  return needle.replace(/\s+/g, "").length >= 3
    && (` ${haystack} `).includes(` ${needle} `);
}

function containsFragment(text = "", fragment = "") {
  const value = normalizeText(fragment);
  if (!value) return false;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const source = String(text ?? "");
  const explicitSecret = new RegExp(
    `\\b(?:fragmentos?(?:\\s+(?:de|del)\\s+c[oó]digo|\\s+de\\s+seguridad)?|(?:code|key|security|room)\\s+fragments?|fragments?\\s+de\\s+(?:code|salle)|clave\\s+final|final\\s+(?:key|code))\\b[^.!?]{0,36}(?:^|[^\\p{L}\\p{N}])${escaped}(?:[^\\p{L}\\p{N}]|$)`,
    "iu"
  );
  const explicitReward = new RegExp(
    `\\b(?:take|obtain|obtained|receive|received|recover|recovered|unlock|unlocked|collect|collected|toma|recibe|recibiste|recupera|recuperaste|obt[eé]n|obtuviste|desbloquea|recolecta|obtenir|prends|re[cç]ois|r[eé]cup[eè]re)\\b[^.!?]{0,24}(?:^|[^\\p{L}\\p{N}])${escaped}(?:[^\\p{L}\\p{N}]|$)`,
    "iu"
  );
  return explicitSecret.test(source) || explicitReward.test(source);
}

function containsFinalCodeDisclosure(text = "", finalCode = "") {
  const source = String(text ?? "");
  const code = normalizeText(finalCode);
  if ([...code].length < 3) return false;
  const compactCode = normalizeCompact(code);
  const codePattern = [...compactCode]
    .map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[\\s\\-–—]*");
  const occurrence = new RegExp(`(^|[^\\p{L}\\p{N}])${codePattern}([^\\p{L}\\p{N}]|$)`, "iu");
  if (!occurrence.test(source)) return false;

  // A final code is independent metadata, not forbidden vocabulary. Even an
  // opaque alphanumeric value is a leak only when copy identifies it as a key.
  const normalized = normalizeToken(source);
  const normalizedCodePattern = [...compactCode]
    .map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s*");
  const secretLabel = "(?:(?:final|master|override|unlock|access)\\s+(?:code|key|password|sequence)|passcode|password|c[oó]digo\\s+(?:final|maestro|de\\s+acceso)|clave\\s+(?:final|maestra)|secuencia\\s+maestra|mot\\s+de\\s+passe|code\\s+final|senha\\s+final|c[oó]digo\\s+de\\s+acesso)";
  const copula = "(?:is|equals?|forms?|creates?|becomes?|constitutes?|es|equivale|forma|crea|se\\s+convierte\\s+en|est|forme|devient|e|forma|torna se)";
  return [
    // Declaraciones directas: "final code is STAR" o "final code STAR".
    new RegExp(`${secretLabel}\\s*(?:(?:is|equals?|es|equivale|est|e)\\s+)?${normalizedCodePattern}(?:\\s|$)`, "iu"),
    // Declaraciones inversas: "S-T-A-R forms the final key".
    new RegExp(`${normalizedCodePattern}\\s+${copula}\\s+(?:(?:the|el|la|le|o|a)\\s+)?${secretLabel}(?:\\s|$)`, "iu"),
    // Instrucciones inequívocas de entrada; se excluye deliberadamente "use"
    // porque puede referirse al término académico, no al valor secreto.
    new RegExp(`(?:enter|type|submit|write|introduce|escribe|ingresa|saisis|digite)\\s+(?:the\\s+value\\s+|el\\s+valor\\s+)?${normalizedCodePattern}(?:\\s+(?:as|como)\\s+(?:(?:the|el|la|le|o|a)\\s+)?${secretLabel}|\\s+(?:to|para)\\s+(?:unlock|open|escape|desbloquear|abrir|escapar))`, "iu"),
    // "Use" sólo constituye filtración cuando asigna explícitamente el valor
    // al campo secreto: "Use A1B as the final code".
    new RegExp(`(?:use|usa|utiliza|utilise)\\s+${normalizedCodePattern}\\s+(?:as|como)\\s+(?:(?:the|el|la|le|o|a)\\s+)?${secretLabel}`, "iu"),
    // Ensamblaje explícito de fragmentos hasta producir el valor completo.
    new RegExp(`(?:assemble|combine|join|une|combina|ensambla|junta|assemble|forme)\\s+(?:(?:the|los|les|os)\\s+)?(?:fragments?|fragmentos?)[^.!?]{0,24}(?:into|to\\s+form|to\\s+spell|para\\s+formar|hasta\\s+formar)\\s+${normalizedCodePattern}(?:\\s|$)`, "iu")
  ].some((pattern) => pattern.test(normalized));
}

export function objectiveTextDisclosesRoomFragment(text = "", fragment = "") {
  return containsFragment(text, fragment);
}

export function objectiveTextDisclosesFinalCode(text = "", finalCode = "") {
  return containsFinalCodeDisclosure(text, finalCode);
}

export function redactObjectiveFinalCodeDisclosure(text = "", finalCode = "", replacement = "the concealed access value") {
  const source = String(text ?? "");
  const code = normalizeText(finalCode);
  if (!source || !code || !containsFinalCodeDisclosure(source, code)) return source;
  const compactCode = normalizeCompact(code);
  const codePattern = [...compactCode]
    .map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[\\s\\-–—]*");
  const occurrence = new RegExp(`(^|[^\\p{L}\\p{N}])${codePattern}(?=[^\\p{L}\\p{N}]|$)`, "giu");
  return source.replace(occurrence, (_match, boundary) => `${boundary}${replacement}`);
}

export function objectiveHintLikelyRevealsBooleanAnswer(plan = {}) {
  const target = normalizeToken(plan?.answer_target);
  const isBoolean = normalizeToken(plan?.interaction) === "verdadero falso"
    || /^(?:true|false|verdadero|falso|vrai|faux|verdadeiro)$/u.test(target);
  if (!isBoolean) return false;
  const hint = normalizeToken(plan?.hint_strategy);
  if (!hint) return false;
  const declarativeAnswer = /\b(?:is|are|means|must|requires|represents|belongs|contains|features|defines|corresponds|es|son|significa|debe|requiere|representa|pertenece|contiene|define|corresponde|est|sont|signifie|doit|represente|appartient|contient|definit|correspond|e|sao|significa|deve|requer|representa|pertence|contem|define|corresponde)\b/u;
  return declarativeAnswer.test(hint);
}

export function objectiveSynthesisLacksConcreteCase(plan = {}) {
  if (normalizeToken(plan?.pedagogical_role) !== "synthesis") return false;
  if (normalizeToken(plan?.case_source) !== "new case in prompt") return true;
  return !objectivePlanCaseDataIsMaterialized(plan, 2);
}

function objectiveCaseDatumIsConcrete(value = "") {
  const text = normalizeText(value);
  const separatorIndex = text.search(/[:=→]/u);
  if (separatorIndex <= 0) return false;
  const source = normalizeText(text.slice(0, separatorIndex));
  const observation = normalizeText(text.slice(separatorIndex + 1));
  return Boolean(source && observation && /[\p{L}\p{N}]/u.test(observation));
}

export function objectivePlanCaseDataIsMaterialized(plan = {}, minimumItems = 1) {
  const caseData = unique((Array.isArray(plan?.case_data) ? plan.case_data : [])
    .map(normalizeText)
    .filter(objectiveCaseDatumIsConcrete));
  if (caseData.length < Math.max(1, Number(minimumItems) || 1)) return false;
  return caseData.every((item) => objectiveTextContainsPhrase(plan?.application, item));
}

export function objectiveSynthesisUsesNarrativeStatusAnswer(plan = {}) {
  if (normalizeToken(plan?.pedagogical_role) !== "synthesis") return false;
  const family = normalizeToken(plan?.answer_family);
  const target = normalizeToken(plan?.answer_target);
  const statusFamily = /\b(?:system|console|core|grid|array|lock|authorization|status|synthesis|alignment|calibration|operational)\b/u.test(family);
  const gameStateTarget = /\b(?:online|locked|unlocked|active|activated|complete|completed|authorized|authorization|aligned|calibrated|operational|restored|released|accepted)\b/u.test(target);
  return statusFamily && gameStateTarget;
}

export function inferRequiredObjectiveMechanic(plan = {}) {
  const interaction = normalizeToken(plan?.interaction).replace(/\s+/g, "_");
  if (interaction === "ordenar_secuencia") return "sequence";
  // These interactions already carry structured answers. Treating the whole
  // mapping/blank list as one cipher corrupts its answer contract.
  if (["drag_drop", "relacion_columnas", "completar_espacio"].includes(interaction)) return "none";
  const activityFields = [
    plan?.cognitive_operation,
    plan?.application,
    plan?.instruction_outline,
    plan?.answer_signature,
    plan?.answer_target
  ].filter(Boolean).map(normalizeMechanicSearchText);
  const cipherTopic = /\b(?:caesar|cipher|ciphertext|plaintext|encrypted|encryption|shift|shifted|shifting|alphabet(?:ic)? offset|cifrado|cifra cesar|desplazamiento alfabetico|dechiffrement|chiffrement)\b/u;
  const cipherCalculation = /(?:[+-]\s*\d+|\b(?:move|shift|transform|convert|decode|decrypt|decipher|encode|calculate|produce|recover|reveal|mueve|desplaza|transforma|convierte|descifra|decodifica|calcula|produce|recupera|revela)\b[^.!?]{0,64}\b(?:letter|letters|character|characters|message|word|ciphertext|plaintext|letra|letras|caracter|caracteres|mensaje|palabra|texto cifrado|texto plano)\b|\b(?:first|next|previous|resulting|decoded|encrypted|primer|siguiente|anterior|resultante|descifrada|cifrada)\s+(?:letter|word|message|letra|palabra|mensaje)\b)/u;
  if (activityFields.some((field) => cipherTopic.test(field) && cipherCalculation.test(field))) return "cipher";

  const anagramTopic = /\b(?:anagram|anagrama|unscramble|rearrange|scrambled|jumbled|reordena|ordena|reorganiza|letras mezcladas)\b/u;
  const anagramCalculation = /\b(?:unscramble|rearrange|reorder|arrange|form|solve|identify|reordena|ordena|reorganiza|forma|resuelve|identifica)\b[^.!?]{0,56}\b(?:letters|word|name|letras|palabra|nombre)\b/u;
  if (activityFields.some((field) => anagramTopic.test(field) && anagramCalculation.test(field))) return "anagram";

  const sequenceCalculation = /\b(?:order steps|arrange steps|sort steps|sequence steps|put .* in order|ordena pasos|ordenar pasos|secuencia de pasos|poner .* en orden|mettre en ordre|ordonner les etapes)\b/u;
  if (activityFields.some((field) => sequenceCalculation.test(field))) return "sequence";
  return "none";
}

export function reconcileObjectiveMechanicContract(plan = {}) {
  const current = plan?.mechanic_contract && typeof plan.mechanic_contract === "object" && !Array.isArray(plan.mechanic_contract)
    ? plan.mechanic_contract
    : { kind: "none" };
  const currentKind = normalizeMechanicKind(current.kind);
  const interaction = normalizeToken(plan?.interaction).replace(/\s+/g, "_");
  if (["drag_drop", "relacion_columnas", "completar_espacio"].includes(interaction)) return { kind: "none" };
  const requiredKind = inferRequiredObjectiveMechanic(plan);
  const booleanTarget = interaction === "verdadero_falso"
    ? normalizeBooleanTarget(plan?.answer_target)
    : null;
  if (booleanTarget !== null && (requiredKind === "cipher" || ["cipher", "cipher_assertion"].includes(currentKind))) {
    const operationText = [
      plan?.cognitive_operation,
      plan?.application,
      plan?.instruction_outline,
      plan?.evidence,
      plan?.knowledge
    ].filter(Boolean).join(" ");
    const numericShift = operationText.match(/(?:shift|step|offset|desplazamiento|paso|d[eé]calage)\D{0,18}([+-]?\d+)/iu)?.[1];
    const wordShift = /\b(one|un|uno|una|two|dos|three|tres)\s+(?:alphabet(?:ic)?\s+)?(?:step|steps|letter|letters|paso|pasos|letra|letras)\b/iu.exec(operationText)?.[1]?.toLocaleLowerCase();
    const wordAmounts = { one: 1, un: 1, uno: 1, una: 1, two: 2, dos: 2, three: 3, tres: 3 };
    const shift = Math.trunc(Number(current.shift) || Math.abs(Number(numericShift) || wordAmounts[wordShift] || 0) || 1);
    const alphabet = normalizeAlphabet(current.alphabet);
    const ciphertext = normalizeText(current.ciphertext);
    const computedValue = ciphertext && shift
      ? normalizeText(shiftCipherText(ciphertext, -shift, alphabet))
      : normalizeText(current.computed_value);
    const claimedValue = extractClaimedCipherValue(plan, current.claimed_value);
    // La verdad de la afirmación es calculable; no depende del booleano del LLM.
    // Sin un cifrado y una afirmación completos, conservar la validación/reparación.
    const canEvaluate = ciphertext && shift % alphabet.length !== 0
      && normalizeCompact(computedValue) && normalizeCompact(claimedValue);
    return {
      kind: "cipher_assertion",
      alphabet,
      shift,
      ciphertext,
      computed_value: computedValue,
      claimed_value: claimedValue,
      expected_boolean: canEvaluate
        ? normalizeCompact(computedValue) === normalizeCompact(claimedValue)
        : booleanTarget
    };
  }
  if (requiredKind === "sequence") {
    const currentItems = currentKind === "sequence" && Array.isArray(current.items) && current.items.length
      ? current.items
      : currentKind === "sequence" && Array.isArray(current.ordered_items)
        ? current.ordered_items.map((text, index) => ({
          text: normalizeText(text),
          order_key: index + 1,
          evidence: normalizeText(plan?.reasoning_evidence || text)
        }))
        : [];
    const answerItems = normalizeText(plan?.answer_target)
      .split(/\s*(?:→|->|;|\|)\s*/u)
      .map(normalizeText)
      .filter(Boolean);
    const caseItems = (Array.isArray(plan?.case_data) ? plan.case_data : [])
      .map((datum) => normalizeText(datum).replace(/^[^:=→]+[:=→]\s*/u, ""))
      .filter(Boolean);
    const sourceItems = currentItems.length >= 2
      ? currentItems
      : answerItems.length >= 2
        ? answerItems
        : caseItems;
    const items = sourceItems.map((item, index) => (
      item && typeof item === "object" && !Array.isArray(item)
        ? {
          text: normalizeText(item.text || item.label || item.value),
          order_key: Number.isFinite(Number(item.order_key ?? item.rank ?? item.order))
            ? Number(item.order_key ?? item.rank ?? item.order)
            : index + 1,
          evidence: normalizeText(item.evidence || item.reason || plan?.reasoning_evidence || item.text)
        }
        : { text: normalizeText(item), order_key: index + 1, evidence: normalizeText(plan?.reasoning_evidence || item) }
    )).filter((item) => item.text);
    const orderedItems = [...items]
      .sort((first, second) => first.order_key - second.order_key)
      .map((item) => item.text);
    return {
      kind: "sequence",
      ordering_rule: normalizeText(current.ordering_rule || plan?.instruction_outline || plan?.cognitive_operation || "Follow the order established by the case evidence."),
      items,
      ordered_items: orderedItems
    };
  }
  if (requiredKind === "cipher" || (requiredKind === "none" && currentKind === "cipher")) {
    const operationText = [
      plan?.cognitive_operation,
      plan?.application,
      plan?.instruction_outline,
      plan?.evidence,
      plan?.knowledge
    ].filter(Boolean).join(" ");
    const numericShift = operationText.match(/(?:shift|step|offset|desplazamiento|paso|d[eé]calage)\D{0,18}([+-]?\d+)/iu)?.[1];
    const wordShift = /\b(one|un|uno|una|two|dos|three|tres)\s+(?:alphabet(?:ic)?\s+)?(?:step|steps|letter|letters|paso|pasos|letra|letras)\b/iu.exec(operationText)?.[1]?.toLocaleLowerCase();
    const wordAmounts = { one: 1, un: 1, uno: 1, una: 1, two: 2, dos: 2, three: 3, tres: 3 };
    const inferredShift = Math.abs(Number(numericShift) || wordAmounts[wordShift] || 0);
    return {
      ...current,
      kind: "cipher",
      solution: normalizeText(current.solution || plan?.answer_target),
      shift: Math.trunc(Number(current.shift) || inferredShift || 1)
    };
  }
  if (requiredKind === "anagram") {
    const solution = normalizeText(
      currentKind === "anagram" ? (current.solution || plan?.answer_target) : plan?.answer_target
    );
    const normalizedLength = normalizeToken(solution).replace(/\s+/g, "").length;
    return normalizedLength >= 4
      ? { ...current, kind: "anagram", solution }
      : { kind: "none" };
  }
  if (currentKind !== "none") return current;
  return current;
}

export function objectivePlanTargetText(plan = {}) {
  return normalizeMechanicSearchText(plan?.answer_target);
}

export function objectiveTextContainsExactTarget(text = "", target = "") {
  const haystack = normalizeMechanicSearchText(text);
  const needle = normalizeMechanicSearchText(target);
  return needle.replace(/\s+/g, "").length >= 3
    && (` ${haystack} `).includes(` ${needle} `);
}

export function objectiveAnswerTargetsEquivalent(first = "", second = "") {
  const left = normalizeMechanicSearchText(first);
  const right = normalizeMechanicSearchText(second);
  return left.replace(/\s+/g, "").length >= 1 && left === right;
}

function objectiveTextContainsPhrase(text = "", phrase = "") {
  const source = normalizeToken(text);
  const target = normalizeToken(phrase);
  return target.length >= 3 && (` ${source} `).includes(` ${target} `);
}

function extractObjectiveRelationTargets(answerTarget = "") {
  return String(answerTarget ?? "")
    .split(/[|;\n]+/u)
    .map((entry) => entry.split(/(?:=>|->|→|—|=)/u).map(normalizeText))
    .filter((parts) => parts.length === 2 && parts.every((value) => normalizeToken(value).length >= 2));
}

export function objectiveTeachingExamplesRevealPlan(teachingExamples = [], plan = {}) {
  const source = (Array.isArray(teachingExamples) ? teachingExamples : [teachingExamples]).map(normalizeText).filter(Boolean).join(" ");
  if (!source) return false;
  if (normalizeToken(plan?.pedagogical_role) === "direct") return false;
  const assessmentCase = normalizeText(plan?.application);
  if (assessmentCase.length >= 12 && objectiveTextContainsPhrase(source, assessmentCase)) return true;
  const mechanicSolution = normalizeText(plan?.mechanic_contract?.solution);
  if (["cipher", "anagram"].includes(plan?.mechanic_contract?.kind)
    && mechanicSolution
    && objectiveTextContainsPhrase(source, mechanicSolution)) return true;
  const answerTarget = normalizeText(plan?.answer_target);
  if (answerTarget && objectiveTextContainsPhrase(source, answerTarget)) return true;
  const relations = extractObjectiveRelationTargets(plan?.answer_target);
  return relations.length > 0 && relations.every(([left, right]) => (
    objectiveTextContainsPhrase(source, left) && objectiveTextContainsPhrase(source, right)
  ));
}

export function objectiveHintRevealsPlanAnswer(plan = {}) {
  const hint = normalizeText(plan?.hint_strategy);
  if (!hint) return false;
  const answerTarget = normalizeText(plan?.answer_target);
  if (answerTarget && objectiveTextContainsPhrase(hint, answerTarget)) return true;
  const relations = extractObjectiveRelationTargets(answerTarget);
  return relations.length > 0 && relations.every(([left, right]) => (
    objectiveTextContainsPhrase(hint, left) && objectiveTextContainsPhrase(hint, right)
  ));
}

export function objectivePlanRequestsPrematureUnlock(plan = {}) {
  const text = normalizeToken([
    plan?.cognitive_operation,
    plan?.application,
    plan?.instruction_outline,
    plan?.answer_signature,
    plan?.hint_strategy,
    plan?.feedback_strategy
  ].filter(Boolean).join(" "));
  const unlockAction = /\b(?:assemble|combine|join|concatenate|enter|submit|type|input|form|authorize|unlock|ensamblar|ensambla|combinar|combina|unir|une|concatenar|ingresar|ingresa|introducir|introduce|escribir|escribe|formar|forma|autorizar|autoriza|desbloquear|desbloquea|assembler|combiner|saisir|former|autoriser|deverrouiller|montar|juntar|digitar)\b/u;
  const unlockObject = /\b(?:final code|final key|master code|master key|override code|override sequence|passcode|password|room fragments|security fragments|code fragments|codigo final|clave final|codigo maestro|clave maestra|secuencia maestra|fragmentos de sala|fragmentos de seguridad|fragmentos del codigo|code final|cle finale|mot de passe|fragments de salle|chave final|senha|fragmentos da sala)\b/u;
  return unlockAction.test(text) && unlockObject.test(text);
}

export function objectiveTextClaimsFragmentDelivery(value = "") {
  const text = normalizeToken(value);
  const deliveryAction = /\b(?:take|earn|receive|release|released|unlock|unlocked|obtain|collect|grant|granted|toma|gana|recibe|libera|liberado|desbloquea|obtiene|recolecta|entrega|entregado|obtenir|recevoir|liberer|deverrouiller|receber|liberar|desbloquear)\b/u;
  const fragmentObject = /\b(?:fragment|fragments|fragmento|fragmentos|security piece|code piece|pieza del codigo|pieza de codigo)\b/u;
  return deliveryAction.test(text) && fragmentObject.test(text);
}

export function objectivePlanClaimsFragmentDelivery(plan = {}) {
  const fields = [
    plan?.narrative_effect,
    plan?.feedback_strategy,
    plan?.instruction_outline,
    plan?.application
  ].filter(Boolean);
  return fields.some((field) => objectiveTextClaimsFragmentDelivery(field));
}

function containsCompletionFragment(text = "", fragment = "") {
  const value = normalizeText(fragment);
  if (!value) return false;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "iu")
    .test(String(text ?? ""));
}

function mentionsSingleBooleanOutcome(value = "") {
  const text = normalizeToken(value);
  const mentionsTrue = /\b(?:true|verdadero|verdadera|vrai|verdadeiro|verdadeira)\b/u.test(text);
  const mentionsFalse = /\b(?:false|falso|falsa|faux)\b/u.test(text);
  return mentionsTrue !== mentionsFalse;
}

function questionSignature(question = {}) {
  const interaction = normalizeText(question.tipo_interaccion).toLowerCase();
  if (["relacion_columnas", "drag_drop"].includes(interaction)) {
    return (Array.isArray(question.parejas) ? question.parejas : [])
      .map((pair) => `${normalizeToken(pair?.izquierda)}=>${normalizeToken(pair?.derecha)}`)
      .sort()
      .join("|");
  }
  if (interaction === "ordenar_secuencia") {
    return (Array.isArray(question.elementos) ? question.elementos : []).map(normalizeToken).join("=>");
  }
  return normalizeToken(question.respuesta_correcta);
}

function tokenSet(value = "") {
  return new Set(normalizeToken(value).split(/\s+/).filter((token) => token.length > 3));
}

function tokenSimilarity(first = "", second = "") {
  const left = tokenSet(first);
  const right = tokenSet(second);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  left.forEach((token) => { if (right.has(token)) shared += 1; });
  return shared / Math.min(left.size, right.size);
}

function hasMeaningfulTokenOverlap(reference = "", content = "") {
  const expected = tokenSet(reference);
  const actual = tokenSet(content);
  if (expected.size < 2) return true;
  return [...expected].some((token) => actual.has(token));
}

function questionContent(question = {}) {
  return [
    question.titulo,
    question.reto,
    question.respuesta_correcta,
    ...(Array.isArray(question.respuestas_aceptadas) ? question.respuestas_aceptadas : []),
    ...(Array.isArray(question.opciones) ? question.opciones : []),
    ...(Array.isArray(question.elementos) ? question.elementos : []),
    ...(Array.isArray(question.parejas) ? question.parejas.flatMap((pair) => [pair?.izquierda, pair?.derecha]) : [])
  ].filter(Boolean).join(" ");
}

function questionPromptContent(question = {}) {
  return [
    question.titulo,
    question.reto,
    question.texto_con_hueco,
    ...(Array.isArray(question.opciones) ? question.opciones : []),
    ...(Array.isArray(question.elementos) ? question.elementos : []),
    ...(Array.isArray(question.parejas) ? question.parejas.flatMap((pair) => [pair?.izquierda, pair?.derecha]) : []),
    question.imagen_alt,
    question?.media?.alt,
    question?.media?.texto
  ].filter(Boolean).join(" ");
}

function readField(holder = {}, field = "") {
  return String(field).split(".").reduce((value, key) => value?.[key], holder);
}

function addIssue(issues, roomIndex, questionIndex, field, code, message) {
  issues.push({ roomIndex, questionIndex, field, code, message });
}

function containsUncontractedCalculatedMechanic(question = {}, contract = {}) {
  if (normalizeMechanicKind(contract?.kind) !== "none") return false;
  const source = `${question.reto || ""} ${question.pista || ""}`;
  const normalized = normalizeToken(source);
  const cipherOperation = /\b(?:caesar|cesar|cipher|cifrado|decrypt|decryption|decrypting|descifra|descifrar|desencripta|shift|desplaza|decale|dechiffre)\b/u.test(normalized)
    && /(?:[+-]\s*\d+|\b\d+\s*(?:position|posicion|place|letter|letra)|\b(?:forward|backward|adelante|atras)\b)/iu.test(source);
  const anagramOperation = /\b(?:unscramble|rearrange\s+(?:the\s+)?letters|reordena\s+(?:las\s+)?letras)\b/u.test(normalized)
    && /\b[A-ZÁÉÍÓÚÜÑ]{4,}\b/u.test(source);
  const sequenceOperation = normalizeText(question.tipo_interaccion).toLowerCase() === "ordenar_secuencia";
  return cipherOperation || anagramOperation || sequenceOperation;
}

function validateMechanic(question, contract, issues, roomIndex, questionIndex) {
  if (!contract || contract.kind === "none") return;
  const label = `Sala ${roomIndex + 1} · Pregunta ${questionIndex + 1}`;
  if (contract.kind === "cipher") {
    if (!contract.solution || !contract.ciphertext || !contract.shift) {
      addIssue(issues, roomIndex, questionIndex, "mechanic_contract", "invalid_cipher_contract", `${label}: el contrato de cifrado está incompleto.`);
      return;
    }
    const decoded = shiftCipherText(contract.ciphertext, -contract.shift, contract.alphabet);
    if (normalizeCompact(decoded) !== normalizeCompact(contract.solution)) {
      addIssue(issues, roomIndex, questionIndex, "mechanic_contract", "invalid_cipher_math", `${label}: el cifrado no se puede invertir hasta su solución.`);
    }
    if (!containsExactAnswer(question.reto, contract.ciphertext)) {
      addIssue(issues, roomIndex, questionIndex, "reto", "missing_ciphertext", `${label}: el enunciado no contiene el cifrado calculado por PigPen.`);
    }
    if (normalizeCompact(question.respuesta_correcta) !== normalizeCompact(contract.solution)) {
      addIssue(issues, roomIndex, questionIndex, "respuesta_correcta", "cipher_answer_mismatch", `${label}: la respuesta no coincide con la solución del cifrado.`);
    }
  } else if (contract.kind === "anagram") {
    const sourceLetters = [...normalizeCompact(contract.solution)].sort().join("");
    const scrambledLetters = [...normalizeCompact(contract.scrambled)].sort().join("");
    if (!contract.solution || !contract.scrambled || sourceLetters.length < 4 || sourceLetters !== scrambledLetters
      || normalizeCompact(contract.solution) === normalizeCompact(contract.scrambled)) {
      addIssue(issues, roomIndex, questionIndex, "mechanic_contract", "invalid_anagram", `${label}: el anagrama debe tener al menos cuatro letras, conservarlas exactamente y no coincidir con la solución.`);
    }
    if (!containsExactAnswer(question.reto, contract.scrambled)) {
      addIssue(issues, roomIndex, questionIndex, "reto", "missing_anagram", `${label}: el enunciado no contiene el anagrama calculado por PigPen.`);
    }
    if (normalizeCompact(question.respuesta_correcta) !== normalizeCompact(contract.solution)) {
      addIssue(issues, roomIndex, questionIndex, "respuesta_correcta", "anagram_answer_mismatch", `${label}: la respuesta no coincide con la solución del anagrama.`);
    }
  } else if (contract.kind === "sequence") {
    const orderKeys = contract.items.map((item) => item.order_key);
    if (!contract.ordering_rule || contract.ordered_items.length < 2
      || new Set(orderKeys).size !== orderKeys.length
      || contract.items.some((item) => !Number.isFinite(item.order_key) || !item.evidence)) {
      addIssue(issues, roomIndex, questionIndex, "mechanic_contract", "unverifiable_sequence", `${label}: la secuencia no tiene regla, posiciones y evidencias verificables.`);
      return;
    }
    const received = (Array.isArray(question.elementos) ? question.elementos : []).map(normalizeCompact);
    const expected = contract.ordered_items.map(normalizeCompact);
    if (JSON.stringify(received) !== JSON.stringify(expected)) {
      addIssue(issues, roomIndex, questionIndex, "elementos", "sequence_order_mismatch", `${label}: el orden no coincide con el contrato verificable de la secuencia.`);
    }
  }
}

function readabilityWarnings(mission = {}, roomIndex = 0) {
  const warnings = [];
  const inspect = (value, field, maximumWords, maximumSentenceWords) => {
    const text = normalizeText(value);
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length > maximumWords) {
      warnings.push({ roomIndex, questionIndex: null, field, code: "long_copy", message: `Sala ${roomIndex + 1}: ${field} supera la extensión recomendada.` });
    }
    const longestSentence = text.split(/[.!?]+/).reduce((maximum, sentence) => (
      Math.max(maximum, sentence.trim().split(/\s+/).filter(Boolean).length)
    ), 0);
    if (longestSentence > maximumSentenceWords) {
      warnings.push({ roomIndex, questionIndex: null, field, code: "long_sentence", message: `Sala ${roomIndex + 1}: ${field} contiene una oración demasiado extensa para lectura ágil.` });
    }
  };
  inspect(mission.historia, "historia", 75, 28);
  inspect(mission.contexto, "contexto", 135, 28);
  inspect(mission.reto, "reto", 60, 28);
  return warnings;
}

export function validateGeneratedRoomContent(mission = {}, roomContract = {}, options = {}) {
  const roomIndex = Number(options.roomIndex) || 0;
  const issues = [];
  const warnings = readabilityWarnings(mission, roomIndex);
  const questions = Array.isArray(mission.preguntas) ? mission.preguntas : [];
  const plans = Array.isArray(roomContract.question_plans) ? roomContract.question_plans : [];
  const fragment = normalizeText(roomContract.fixed_code_fragment);
  const finalCode = normalizeText(options.finalCode);

  if (fragment) {
    const roomFields = [
      ["titulo", mission.titulo],
      ["historia", mission.historia],
      ["contexto", mission.contexto],
      ["datos_clave", (Array.isArray(mission.datos_clave) ? mission.datos_clave : []).join(" ")],
      ["reto", mission.reto],
      ["imagen_prompt", mission.imagen_prompt],
      ["imagen_alt", mission.imagen_alt]
    ];
    roomFields.forEach(([field, value]) => {
      if (containsFragment(value, fragment)) {
        addIssue(issues, roomIndex, null, field, "room_fragment_leak", `Sala ${roomIndex + 1}: ${field} anticipa el fragmento reservado para completar la sala.`);
      }
    });
    if (!containsCompletionFragment(mission.retroalimentacion_correcta, fragment)) {
      addIssue(issues, roomIndex, null, "retroalimentacion_correcta", "missing_room_fragment", `Sala ${roomIndex + 1}: el feedback de finalización no entrega su fragmento privado.`);
    }
  }

  if (/[?¿]/u.test(normalizeText(mission.reto))) {
    addIssue(issues, roomIndex, null, "reto", "challenge_is_question", `Sala ${roomIndex + 1}: el Challenge formula una pregunta en lugar de presentar la escena.`);
  }

  if ([...finalCode].length >= 3) {
    [
      ["titulo", mission.titulo],
      ["historia", mission.historia],
      ["contexto", mission.contexto],
      ["datos_clave", (Array.isArray(mission.datos_clave) ? mission.datos_clave : []).join(" ")],
      ["reto", mission.reto],
      ["imagen_prompt", mission.imagen_prompt],
      ["imagen_alt", mission.imagen_alt]
    ].forEach(([field, value]) => {
      if (containsFinalCodeDisclosure(value, finalCode)) {
        addIssue(issues, roomIndex, null, field, "final_code_leak", `Sala ${roomIndex + 1}: ${field} revela la clave final completa antes del cierre.`);
      }
    });
  }
  if (normalizeText(mission.reto).split(/\s+/).filter(Boolean).length > 70) {
    addIssue(issues, roomIndex, null, "reto", "challenge_too_long", `Sala ${roomIndex + 1}: el Challenge debe ser una transición breve.`);
  }

  const signatures = new Map();
  const previousPrompts = [];
  questions.forEach((question, questionIndex) => {
    const plan = plans[questionIndex] || {};
    if (normalizeText(question._plan_id) !== normalizeText(plan.plan_id)) {
      addIssue(issues, roomIndex, questionIndex, "plan_id", "plan_binding_mismatch", `Sala ${roomIndex + 1} · Pregunta ${questionIndex + 1}: la pregunta no está vinculada con su plan privado.`);
    }
    if (normalizeText(question._assessment_case_id) !== normalizeText(plan.assessment_case_id)) {
      addIssue(issues, roomIndex, questionIndex, "assessment_case_id", "assessment_case_binding_mismatch", `Sala ${roomIndex + 1} · Pregunta ${questionIndex + 1}: la pregunta no conserva la identidad del caso evaluado.`);
    }
    if (normalizeText(question._case_source).toLowerCase() !== normalizeText(plan.case_source).toLowerCase()) {
      addIssue(issues, roomIndex, questionIndex, "case_source", "case_source_binding_mismatch", `Sala ${roomIndex + 1} · Pregunta ${questionIndex + 1}: la pregunta cambió la fuente prevista del caso evaluado.`);
    }
    const generatedCaseData = (Array.isArray(question._case_data) ? question._case_data : [])
      .map(normalizeToken).filter(Boolean).sort();
    const plannedCaseData = (Array.isArray(plan.case_data) ? plan.case_data : [])
      .map(normalizeToken).filter(Boolean).sort();
    if (JSON.stringify(generatedCaseData) !== JSON.stringify(plannedCaseData)) {
      addIssue(issues, roomIndex, questionIndex, "case_data", "case_data_binding_mismatch", `Sala ${roomIndex + 1} · Pregunta ${questionIndex + 1}: la pregunta perdió los datos concretos aprobados para el caso.`);
    }
    if (normalizeText(question._transfer_delta) !== normalizeText(plan.transfer_delta)) {
      addIssue(issues, roomIndex, questionIndex, "transfer_delta", "transfer_delta_binding_mismatch", `Sala ${roomIndex + 1} · Pregunta ${questionIndex + 1}: la pregunta perdió la diferencia de transferencia aprobada.`);
    }
    if (normalizeText(question._reasoning_evidence) !== normalizeText(plan.reasoning_evidence)) {
      addIssue(issues, roomIndex, questionIndex, "reasoning_evidence", "reasoning_evidence_binding_mismatch", `Sala ${roomIndex + 1} · Pregunta ${questionIndex + 1}: la pregunta perdió la evidencia de razonamiento aprobada.`);
    }
    const integratedKnowledge = (Array.isArray(question._integrates_knowledge_ids) ? question._integrates_knowledge_ids : [])
      .map(normalizeToken).filter(Boolean).sort();
    const plannedIntegration = (Array.isArray(plan.integrates_knowledge_ids) ? plan.integrates_knowledge_ids : [])
      .map(normalizeToken).filter(Boolean).sort();
    if (JSON.stringify(integratedKnowledge) !== JSON.stringify(plannedIntegration)) {
      addIssue(issues, roomIndex, questionIndex, "integrates_knowledge_ids", "knowledge_integration_binding_mismatch", `Sala ${roomIndex + 1} · Pregunta ${questionIndex + 1}: la pregunta perdió la integración curricular aprobada.`);
    }
    const briefingSupport = `${mission.contexto || ""} ${(Array.isArray(mission.datos_clave) ? mission.datos_clave : []).join(" ")}`;
    const promptSupport = questionContent(question);
    const promptCaseSupport = questionPromptContent(question);
    const missingCaseDatum = (Array.isArray(plan.case_data) ? plan.case_data : [])
      .find((item) => !objectiveTextContainsPhrase(promptCaseSupport, item));
    if (missingCaseDatum) {
      addIssue(issues, roomIndex, questionIndex, "reto", "case_data_not_materialized", `Sala ${roomIndex + 1} · Pregunta ${questionIndex + 1}: el enunciado no materializa el dato aprobado «${normalizeText(missingCaseDatum)}».`);
    }
    const expectedSupport = `${plan.knowledge || ""} ${plan.evidence || ""}`;
    const supportContent = plan.support_source === "briefing"
      ? briefingSupport
      : (plan.support_source === "prompt" ? promptSupport : `${briefingSupport} ${promptSupport}`);
    if (!hasMeaningfulTokenOverlap(expectedSupport, supportContent)) {
      addIssue(issues, roomIndex, questionIndex, "support_source", "missing_plan_support", `Sala ${roomIndex + 1} · Pregunta ${questionIndex + 1}: el contenido no conserva ningún término curricular significativo de la evidencia asignada.`);
    }
    if (!hasMeaningfulTokenOverlap(plan.application, promptSupport)) {
      addIssue(issues, roomIndex, questionIndex, "reto", "application_binding_mismatch", `Sala ${roomIndex + 1} · Pregunta ${questionIndex + 1}: el caso redactado no corresponde con la aplicación de su plan privado.`);
    }
    if (!hasMeaningfulTokenOverlap(plan.narrative_effect, question.retroalimentacion_correcta)) {
      addIssue(issues, roomIndex, questionIndex, "retroalimentacion_correcta", "narrative_effect_missing", `Sala ${roomIndex + 1} · Pregunta ${questionIndex + 1}: el feedback correcto no materializa el cambio narrativo asignado.`);
    }
    validateMechanic(question, plan.mechanic_contract, issues, roomIndex, questionIndex);
    if (containsUncontractedCalculatedMechanic(question, plan.mechanic_contract)) {
      addIssue(issues, roomIndex, questionIndex, "reto", "uncontracted_calculation", `Sala ${roomIndex + 1} · Pregunta ${questionIndex + 1}: plantea una operación calculable que no fue materializada y verificada por PigPen.`);
    }
    if (objectivePlanRequestsPrematureUnlock({
      cognitive_operation: plan.cognitive_operation,
      application: `${question.reto || ""} ${question.texto_con_hueco || ""}`,
      instruction_outline: plan.instruction_outline,
      answer_signature: plan.answer_signature,
      hint_strategy: question.pista,
      feedback_strategy: `${question.retroalimentacion_correcta || ""} ${question.retroalimentacion_incorrecta || ""}`
    })) {
      addIssue(issues, roomIndex, questionIndex, "reto", "premature_final_unlock", `Sala ${roomIndex + 1} · Pregunta ${questionIndex + 1}: intenta ejecutar el desbloqueo final antes de entregar todos los fragmentos.`);
    }
    const signature = questionSignature(question);
    const requiresUniqueAnswer = normalizeText(question.tipo_interaccion).toLowerCase() !== "verdadero_falso";
    if (requiresUniqueAnswer && signature && signatures.has(signature)) {
      addIssue(issues, roomIndex, questionIndex, "respuesta_correcta", "duplicate_answer_signature", `Sala ${roomIndex + 1} · Pregunta ${questionIndex + 1}: repite la misma respuesta o conjunto de relaciones de la pregunta ${signatures.get(signature) + 1}.`);
    } else if (requiresUniqueAnswer && signature) {
      signatures.set(signature, questionIndex);
    }
    const duplicatePromptIndex = previousPrompts.findIndex((prompt) => tokenSimilarity(prompt, question.reto) >= 0.74);
    if (duplicatePromptIndex >= 0) {
      addIssue(issues, roomIndex, questionIndex, "reto", "duplicate_question_case", `Sala ${roomIndex + 1} · Pregunta ${questionIndex + 1}: reutiliza prácticamente el mismo caso que la pregunta ${duplicatePromptIndex + 1}.`);
    }
    previousPrompts.push(question.reto || "");

    const answers = collectCorrectAnswers(question);
    if ([...finalCode].length >= 3) {
      [
        ["reto", question.reto],
        ["texto_con_hueco", question.texto_con_hueco],
        ["opciones", (Array.isArray(question.opciones) ? question.opciones : []).join(" ")],
        ["pista", question.pista],
        ["retroalimentacion_correcta", question.retroalimentacion_correcta],
        ["retroalimentacion_incorrecta", question.retroalimentacion_incorrecta],
        ["imagen_prompt", question.imagen_prompt],
        ["imagen_alt", question.imagen_alt],
        ["media.alt", question?.media?.alt],
        ["media.texto", question?.media?.texto]
      ].forEach(([field, value]) => {
        if (containsFinalCodeDisclosure(value, finalCode)) {
          addIssue(issues, roomIndex, questionIndex, field, "final_code_leak", `Sala ${roomIndex + 1} · Pregunta ${questionIndex + 1}: ${field} revela la clave final completa antes del cierre.`);
        }
      });
    }
    const protectedFields = [
      "reto", "texto_con_hueco", "pista", "imagen_prompt", "imagen_alt",
      "media.alt", "media.texto", "retroalimentacion_incorrecta"
    ];
    if (!["relacion_columnas", "drag_drop", "ordenar_secuencia"].includes(question.tipo_interaccion)) {
      protectedFields.forEach((field) => {
        if (answers.some((answer) => containsExactAnswer(readField(question, field), answer))) {
          addIssue(issues, roomIndex, questionIndex, field, "answer_leak", `Sala ${roomIndex + 1} · Pregunta ${questionIndex + 1}: ${field} revela una respuesta antes de resolver la actividad.`);
        }
      });
    }
    if (question.tipo_interaccion === "verdadero_falso") {
      ["pista", "retroalimentacion_incorrecta"].forEach((field) => {
        if (!mentionsSingleBooleanOutcome(question?.[field])) return;
        addIssue(issues, roomIndex, questionIndex, field, "boolean_answer_leak", `Sala ${roomIndex + 1} · Pregunta ${questionIndex + 1}: ${field} anticipa un único resultado de verdadero o falso.`);
      });
    }

    if (question.tipo_interaccion === "opcion_multiple") {
      const correct = normalizeToken(question.respuesta_correcta);
      const normalizedOptions = (Array.isArray(question.opciones) ? question.opciones : []).map(normalizeToken);
      const exactMatches = normalizedOptions.filter((option) => option === correct).length;
      if (!correct || exactMatches !== 1 || new Set(normalizedOptions).size !== normalizedOptions.length) {
        addIssue(issues, roomIndex, questionIndex, "opciones", "invalid_multiple_choice", `Sala ${roomIndex + 1} · Pregunta ${questionIndex + 1}: la respuesta debe aparecer exactamente una vez y todas las opciones deben ser distintas.`);
      }
    }

    if (["relacion_columnas", "drag_drop"].includes(question.tipo_interaccion)) {
      const pairs = Array.isArray(question.parejas) ? question.parejas : [];
      const leftValues = pairs.map((pair) => normalizeToken(pair?.izquierda));
      const rightValues = pairs.map((pair) => normalizeToken(pair?.derecha));
      if (new Set(leftValues).size !== leftValues.length || new Set(rightValues).size !== rightValues.length) {
        addIssue(issues, roomIndex, questionIndex, "parejas", "ambiguous_pairs", `Sala ${roomIndex + 1} · Pregunta ${questionIndex + 1}: las fichas y destinos deben ser únicos para evitar correspondencias ambiguas.`);
      }
      protectedFields.forEach((field) => {
        if (pairs.some((pair) => {
          const value = normalizeCompact(readField(question, field));
          return containsExactAnswer(value, pair.izquierda) && containsExactAnswer(value, pair.derecha);
        })) {
          addIssue(issues, roomIndex, questionIndex, field, "resolved_pair_leak", `Sala ${roomIndex + 1} · Pregunta ${questionIndex + 1}: ${field} muestra una correspondencia resuelta.`);
        }
      });
    }
    if (question.tipo_interaccion === "ordenar_secuencia") {
      ["pista", "retroalimentacion_incorrecta"].forEach((field) => {
        const value = normalizeCompact(question?.[field]);
        const positions = (question.elementos || []).map((item) => value.indexOf(normalizeCompact(item)));
        if (positions.length > 1 && positions.every((position) => position >= 0)
          && positions.every((position, index) => index === 0 || position > positions[index - 1])) {
          addIssue(issues, roomIndex, questionIndex, field, "sequence_solution_leak", `Sala ${roomIndex + 1} · Pregunta ${questionIndex + 1}: ${field} entrega el orden completo de la secuencia.`);
        }
      });
    }

    if (fragment) {
      ["titulo", "reto", "pista", "retroalimentacion_correcta", "retroalimentacion_incorrecta", "imagen_prompt", "imagen_alt", "media.alt", "media.texto"]
        .forEach((field) => {
          if (containsFragment(readField(question, field), fragment)) {
            addIssue(issues, roomIndex, questionIndex, field, "fragment_leak", `Sala ${roomIndex + 1} · Pregunta ${questionIndex + 1}: ${field} anticipa el fragmento reservado para completar la sala.`);
          }
        });
    }
  });

  if (questions.length > 1) {
    const finalQuestion = questions.at(-1);
    const finalSignature = normalizeText(finalQuestion?.tipo_interaccion).toLowerCase() === "verdadero_falso"
      ? ""
      : questionSignature(finalQuestion);
    const previousSignatures = questions.slice(0, -1)
      .filter((question) => normalizeText(question?.tipo_interaccion).toLowerCase() !== "verdadero_falso")
      .map(questionSignature)
      .filter(Boolean);
    if (finalSignature && previousSignatures.some((signature) => signature === finalSignature)) {
      addIssue(issues, roomIndex, questions.length - 1, "respuesta_correcta", "synthesis_reuses_answer", `Sala ${roomIndex + 1}: la actividad final reutiliza una solución anterior en vez de aplicar un caso nuevo.`);
    }
  }

  const challengeAnswers = questions.flatMap(collectCorrectAnswers);
  if (challengeAnswers.some((answer) => containsExactAnswer(mission.reto, answer))) {
    addIssue(issues, roomIndex, null, "reto", "challenge_reveals_answer", `Sala ${roomIndex + 1}: el Challenge anticipa una solución perteneciente a las preguntas.`);
  }
  const mechanicInputs = plans.flatMap((plan) => {
    const contract = plan?.mechanic_contract || {};
    return [contract.ciphertext, contract.scrambled].filter(Boolean);
  });
  if (mechanicInputs.some((value) => containsExactAnswer(mission.reto, value))) {
    addIssue(issues, roomIndex, null, "reto", "challenge_contains_mechanic", `Sala ${roomIndex + 1}: el Challenge anticipa datos de una mecánica específica en lugar de funcionar como transición narrativa.`);
  }

  return { issues, warnings };
}

export function validateGeneratedProjectContent(project = {}, blueprint = {}) {
  const issues = [];
  const warnings = [];
  const missions = Array.isArray(project.misiones) ? project.misiones : [];
  missions.forEach((mission, roomIndex) => {
    const result = validateGeneratedRoomContent(mission, blueprint?.rooms?.[roomIndex] || {}, {
      roomIndex,
      finalCode: blueprint?.final_unlock?.code || project?.clave_final || ""
    });
    issues.push(...result.issues);
    warnings.push(...result.warnings);
  });

  missions.forEach((mission, roomIndex) => {
    const currentCopy = `${mission.historia || ""} ${mission.reto || ""}`;
    missions.slice(0, roomIndex).forEach((previousMission, previousIndex) => {
      const previousCopy = `${previousMission.historia || ""} ${previousMission.reto || ""}`;
      if (tokenSimilarity(currentCopy, previousCopy) >= 0.76) {
        addIssue(issues, roomIndex, null, "historia", "narrative_reset", `Sala ${roomIndex + 1}: repite la situación narrativa de la sala ${previousIndex + 1} en lugar de continuarla.`);
      }
    });
  });

  const allFragments = (Array.isArray(blueprint?.rooms) ? blueprint.rooms : [])
    .map((room) => normalizeText(room.fixed_code_fragment));
  missions.forEach((mission, roomIndex) => {
    allFragments.forEach((fragment, fragmentIndex) => {
      if (fragment && fragmentIndex !== roomIndex && containsFragment(mission.retroalimentacion_correcta, fragment)) {
        addIssue(issues, roomIndex, null, "retroalimentacion_correcta", "foreign_room_fragment", `Sala ${roomIndex + 1}: el feedback de finalización contiene el fragmento privado de la sala ${fragmentIndex + 1}.`);
      }
    });
  });

  const fragments = allFragments;
  const assembled = fragments.join("").toLocaleUpperCase().replace(/[^\p{L}\p{N}]/gu, "");
  const finalCode = normalizeText(blueprint?.final_unlock?.code).toLocaleUpperCase().replace(/[^\p{L}\p{N}]/gu, "");
  if (assembled && finalCode && assembled !== finalCode) {
    issues.push({ roomIndex: null, questionIndex: null, field: "clave_final", code: "fragment_code_mismatch", message: "Los fragmentos de las salas no forman exactamente la clave final." });
  }
  return { issues, warnings };
}

export function formatGenerationIssue(issue = {}) {
  const location = issue.roomIndex === null || issue.roomIndex === undefined
    ? "General"
    : `Sala ${Number(issue.roomIndex) + 1}${issue.questionIndex === null || issue.questionIndex === undefined ? "" : ` · Pregunta ${Number(issue.questionIndex) + 1}`}`;
  return `${location}${issue.field ? ` · ${issue.field}` : ""}: ${issue.message || issue.code || "contenido inválido"}`;
}
