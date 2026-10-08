import assert from "node:assert/strict";
import { formatFriendlyChatMessage } from "../public/charly-brown/friendly-chat-messages.js";

const mockSession = {
  id: "session_mumpzp2w_qefwen",
  activeUnitId: "unit_u1",
  accepted: {
    activities: [
      { id: "act_101", subtopic: "Ortografía", title: "Palabras con hiato y diptongo" },
      { id: "act_102", subtopic: "Matemáticas", title: "Fracciones equivalentes" }
    ]
  },
  units: [
    {
      id: "unit_u1",
      accepted: {
        activities: [
          { id: "act_101", subtopic: "Ortografía", title: "Palabras con hiato y diptongo" },
          { id: "act_102", subtopic: "Matemáticas", title: "Fracciones equivalentes" }
        ]
      }
    }
  ]
};

// 1. Mensaje técnico para crear notas del maestro con recursos
const rawNotesPrompt = `Usa design_teacher_note para preparar una propuesta pendiente de aprobación. Usa sessionId=session_mumpzp2w_qefwen, targetUnitId=unit_u1, baseRevision=0, mode=single, operation=create, targetActivityId=act_101 y subtopic="Ortografía". Usa la lectura, la secuencia y la actividad aprobadas. RECURSOS VINCULADOS A LA ACTIVIDAD: La actividad cuenta con los siguientes 1 recurso(s) vinculado(s): [Recortable 1a (recortable)]. Es OBLIGATORIO que la nota del maestro integre y detalle las orientaciones didácticas paso a paso... No guardes la nota directamente.`;

const friendlyNotes = formatFriendlyChatMessage(rawNotesPrompt, mockSession);
assert.ok(!friendlyNotes.includes("session_mumpzp2w_qefwen"), "No debe mostrar el sessionId técnico");
assert.ok(!friendlyNotes.includes("targetActivityId="), "No debe mostrar targetActivityId=");
assert.ok(!friendlyNotes.includes("design_teacher_note"), "No debe mostrar el nombre de la herramienta interna");
assert.ok(friendlyNotes.includes("Ortografía"), "Debe mostrar el nombre del subtema");
assert.ok(friendlyNotes.includes("Palabras con hiato y diptongo"), "Debe mostrar el título de la actividad");
assert.ok(friendlyNotes.includes("Crear notas del maestro"), "Debe indicar claramente la acción de crear notas");

// 2. Mensaje técnico para crear ficha
const rawWorksheetPrompt = `Usa design_worksheet para preparar una propuesta pendiente de aprobación. Usa sessionId=session_mumpzp2w_qefwen, targetUnitId=unit_u1, targetActivityId=act_102 y subtopic="Matemáticas". Diseña la ficha.`;
const friendlyWorksheet = formatFriendlyChatMessage(rawWorksheetPrompt, mockSession);
assert.ok(!friendlyWorksheet.includes("session_mumpzp2w_qefwen"));
assert.ok(friendlyWorksheet.includes("Fracciones equivalentes"));
assert.ok(friendlyWorksheet.includes("ficha de trabajo"));

// 3. Mensaje técnico para crear recortable
const rawCutoutPrompt = `Usa design_cutout para preparar una propuesta pendiente de aprobación. Usa sessionId=session_mumpzp2w_qefwen, targetUnitId=unit_u1, targetActivityId=act_101 y subtopic="Ortografía".`;
const friendlyCutout = formatFriendlyChatMessage(rawCutoutPrompt, mockSession);
assert.ok(!friendlyCutout.includes("targetActivityId="));
assert.ok(friendlyCutout.includes("recortable"));
assert.ok(friendlyCutout.includes("Ortografía"));

// 4. Mensaje normal del usuario
const normalUserText = "Explícame cómo resolver las fracciones de la actividad";
const friendlyNormal = formatFriendlyChatMessage(normalUserText, mockSession);
assert.equal(friendlyNormal, normalUserText, "El texto normal del usuario debe permanecer intacto");

console.log("Friendly chat messages tests passed successfully!");
