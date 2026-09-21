const MAX_THEMATIC_WORD_LENGTH = 12;

export function normalizeObjectiveUnlockFragment(value = "") {
  const raw = String(value ?? "").trim();
  if (!raw || !/^\p{L}+$/u.test(raw)) return "";
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  return /^[A-Z]+$/.test(normalized) && normalized.length <= MAX_THEMATIC_WORD_LENGTH
    ? normalized
    : "";
}

export function normalizeThematicFinalWord(value = "", roomCount = 1) {
  const normalized = normalizeObjectiveUnlockFragment(value);
  const minimumLength = Math.max(3, Math.floor(Number(roomCount) || 1));
  return normalized.length >= minimumLength ? normalized : "";
}

export function partitionThematicFinalWord(value = "", roomCount = 1) {
  const rooms = Math.max(1, Math.floor(Number(roomCount) || 1));
  const normalized = normalizeThematicFinalWord(value, rooms);
  if (!normalized) return Array(rooms).fill("");
  const characters = Array.from(normalized);
  const baseSize = Math.floor(characters.length / rooms);
  const remainder = characters.length % rooms;
  let cursor = 0;
  return Array.from({ length: rooms }, (_, roomIndex) => {
    const size = baseSize + (roomIndex < remainder ? 1 : 0);
    const fragment = characters.slice(cursor, cursor + size).join("");
    cursor += size;
    return fragment;
  });
}

export function resolveFixedThematicUnlock({ finalCode = "", fragments = [], roomCount = 1 } = {}) {
  const rooms = Math.max(1, Math.floor(Number(roomCount) || 1));
  const sourceFragments = Array.isArray(fragments) ? fragments : [];
  const fixedFinalCode = normalizeThematicFinalWord(finalCode, rooms);
  const normalizedFragments = sourceFragments.map(normalizeObjectiveUnlockFragment);
  const fixedCodeFragments = sourceFragments.length === rooms
    && normalizedFragments.every(Boolean)
    && normalizeThematicFinalWord(normalizedFragments.join(""), rooms)
    ? normalizedFragments
    : [];
  return {
    fixedFinalCode,
    fixedCodeFragments,
    rejectedInvalidUnlock: Boolean(
      (String(finalCode || "").trim() && !fixedFinalCode)
      || (sourceFragments.length && fixedCodeFragments.length !== rooms)
    )
  };
}
