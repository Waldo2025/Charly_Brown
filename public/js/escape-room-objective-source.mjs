import { shiftCipherText } from "./escape-room-mechanics.mjs";

const clean = (value = "") => String(value ?? "").replace(/^[“”"']+|[“”"']+$/g, "").replace(/\s+/g, " ").trim();
const compact = (value = "") => [...String(value ?? "")]
  .filter((character) => /[\p{L}\p{N}]/u.test(character))
  .map((character) => character.toLocaleUpperCase())
  .join("");

export function collectDeterministicObjectiveSourceRepairs(text = "", roomCount = 4) {
  const source = String(text ?? "");
  const repairs = [];
  const roomMarkers = [...source.matchAll(/\b(?:sala|room|salle)\s+(\d+)\b/giu)];
  const blocks = roomMarkers.length
    ? roomMarkers.map((marker, index) => ({
      roomIndex: Math.max(0, Number(marker[1]) - 1),
      text: source.slice(marker.index || 0, roomMarkers[index + 1]?.index ?? source.length)
    }))
    : [{ roomIndex: 0, text: source }];

  blocks.slice(0, Math.max(1, Number(roomCount) || 1)).forEach(({ roomIndex, text: block }) => {
    const answer = clean(block.match(/(?:respuesta\s+correcta|correct\s+answer|r[eé]ponse\s+correcte|resposta\s+correta)\s*:\s*([^\r\n.]+)/iu)?.[1] || "");
    const letterSequence = block.match(/\b(?:(?:letters?|letras?)\s+|unscramble\s+|reordena\s+(?:las\s+)?letras?\s+)([\p{L}](?:\s*[-–—]\s*[\p{L}]){2,})/iu)?.[1] || "";
    if (answer && letterSequence) {
      const supplied = [...compact(letterSequence)].sort().join("");
      const expected = [...compact(answer)].sort().join("");
      if (supplied && expected && supplied !== expected) {
        repairs.push({
          room_index: roomIndex,
          code: "anagram_letter_mismatch",
          issue: `Las letras ${letterSequence} no forman exactamente la respuesta ${answer}.`,
          preserved_intent: `Conservar la respuesta ${answer} y la actividad de anagrama.`,
          repair_instruction: "Descartar la secuencia defectuosa y usar únicamente el anagrama calculado por PigPen desde la solución."
        });
      }
    }

    for (const match of block.matchAll(/\b([A-Z]{2,}(?:\s+[A-Z]{2,})*)\s*([+-]\s*\d+)\s*(?:→|->|=)\s*([A-Z]{2,}(?:\s+[A-Z]{2,})*)\b/g)) {
      const input = clean(match[1]);
      const shift = Number(String(match[2]).replace(/\s+/g, ""));
      const stated = clean(match[3]);
      const calculated = shiftCipherText(input, shift);
      if (compact(calculated) !== compact(stated)) {
        repairs.push({
          room_index: roomIndex,
          code: "cipher_example_mismatch",
          issue: `El ejemplo ${input} ${match[2]} → ${stated} no es reversible; el resultado verificable es ${calculated}.`,
          preserved_intent: "Conservar la enseñanza del desplazamiento alfabético.",
          repair_instruction: "Usar sólo ciphertext y soluciones calculados por PigPen; no copiar el ejemplo incorrecto."
        });
      }
    }

    for (const match of block.matchAll(/\b([A-ZÁÉÍÓÚÜÑ]{4,})\s*(?:→|->)\s*([A-ZÁÉÍÓÚÜÑ]{4,})\b/g)) {
      const nearbyContext = block.slice(Math.max(0, (match.index || 0) - 72), match.index || 0);
      if (!/(?:example|ejemplo|anagram|anagrama|unscramble|scrambled|letras?\s+(?:mezcladas?|reordenadas?))\s*[:=-]?\s*$/iu.test(nearbyContext)) {
        continue;
      }
      const scrambled = clean(match[1]);
      const solution = clean(match[2]);
      if ([...compact(scrambled)].sort().join("") !== [...compact(solution)].sort().join("")) {
        repairs.push({
          room_index: roomIndex,
          code: "anagram_example_mismatch",
          issue: `El ejemplo ${scrambled} → ${solution} no conserva exactamente las mismas letras.`,
          preserved_intent: "Conservar la demostración de cómo se resuelve un anagrama.",
          repair_instruction: "Sustituirlo por un ejemplo calculado con el mismo multiconjunto de letras."
        });
      }
    }
  });
  return repairs;
}
