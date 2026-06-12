import assert from "node:assert/strict";
import vm from "node:vm";

import { normalizeEscapeRoomProject } from "../public/js/escape-room-creator-model.mjs";
import { buildEscapeRoomPackage } from "../public/js/escape-room-package-builder.mjs";

const project = normalizeEscapeRoomProject({
  titulo: "Boveda Algebraica",
  introduccion: "Recupera la clave final.",
  conclusion: "La boveda se abre.",
  backgroundImage: "data:image/png;base64,QUJDRA==",
  misiones: [
    {
      id: "m1",
      titulo: "Sala con dos preguntas",
      preguntas: [
        {
          id: "q1",
          titulo: "Texto secreto",
          tipo_interaccion: "texto",
          subtipo_respuesta: "palabra",
          reto: "Escribe la palabra secreta.",
          respuesta_correcta: "factor",
          respuestas_aceptadas: ["factor"],
          media: {
            tipo: "imagen",
            url: "data:image/png;base64,QUJDRA==",
            alt: "Pista visual de la primera pregunta"
          }
        },
        {
          id: "q2",
          titulo: "Opcion interna",
          tipo_interaccion: "opcion_multiple",
          subtipo_respuesta: "palabra",
          reto: "Elige la opcion correcta.",
          opciones: ["A", "B", "C"],
          respuesta_correcta: "B",
          respuestas_aceptadas: ["B"]
        }
      ],
      desbloquea: ["m2"]
    },
    {
      id: "m2",
      titulo: "Pista visual",
      preguntas: [
        {
          id: "q3",
          titulo: "Multimedia interna",
          tipo_interaccion: "multimedia",
          subtipo_respuesta: "numero",
          reto: "Lee la imagen y responde.",
          respuesta_correcta: "12",
          media: {
            tipo: "imagen",
            url: "data:image/png;base64,QUJDRA==",
            alt: "Tarjeta con el numero 12"
          }
        }
      ]
    }
  ]
});

const pkg = buildEscapeRoomPackage(project);

assert.equal(pkg.downloadName, "EscapeRoom_Boveda_Algebraica", "Debe generar un nombre de paquete estable.");
assert.ok(pkg.files["index.html"], "Debe incluir index.html.");
assert.ok(pkg.files["assets/game.css"], "Debe incluir CSS del juego.");
assert.ok(pkg.files["assets/game.js"], "Debe incluir JS del juego.");
assert.ok(pkg.files["assets/escape-room.json"], "Debe incluir el JSON normalizado.");
assert.ok(pkg.files["assets/media/m1-q1-media.png"], "Debe extraer la media de una pregunta interna.");
assert.ok(pkg.files["assets/media/m2-q3-media.png"], "Debe extraer la media de una segunda pregunta interna.");
assert.ok(pkg.files["assets/media/Boveda_Algebraica-background.png"], "Debe extraer la imagen de portada de fondo.");
assert.match(pkg.files["index.html"], /assets\/game\.css/, "El index debe referenciar el CSS empaquetado.");
assert.match(pkg.files["index.html"], /assets\/game\.js/, "El index debe referenciar el JS empaquetado.");
assert.match(pkg.files["index.html"], /Boveda_Algebraica-background\.png/, "El index debe usar la imagen de portada exportada.");
assert.match(pkg.files["index.html"], /data-gallery-next/, "El hero-panel debe incluir un botón para pasar a la siguiente sección.");
assert.match(pkg.files["index.html"], /data-gallery-screen="intro"/, "El export debe separar la sección de inicio como galería.");
assert.match(pkg.files["index.html"], /data-gallery-screen="mission"/, "El export debe separar la sección de mapa y misión como galería.");
assert.match(pkg.files["assets/game.js"], /data-question-card/, "El runtime debe renderizar tarjetas de preguntas internas por sala.");
assert.match(pkg.files["assets/game.js"], /questionProgress/, "El runtime debe mostrar progreso interno por sala.");
assert.match(pkg.files["index.html"], /ending-media/, "El panel de victoria debe incluir una imagen representativa.");
assert.doesNotMatch(pkg.files["index.html"], /Roster/i, "El export no debe incluir la sección Roster.");
assert.match(pkg.files["assets/game.js"], /const ESCAPE_ROOM_DATA =/, "El JS debe hidratar el proyecto.");
assert.match(pkg.files["assets/game.js"], /mapa libre/i, "El runtime debe describir navegación libre.");
assert.match(pkg.files["assets/game.js"], /data-question-match-select=/, "El runtime debe renderizar emparejamiento por select dentro de cada pregunta.");
assert.match(pkg.files["assets/game.js"], /function escapeHtmlAttr\(/, "El runtime debe incluir el helper escapeHtmlAttr.");
assert.match(pkg.files["assets/game.js"], /galleryScreen/, "El runtime debe manejar la navegación por galerías.");
assert.match(pkg.files["assets/game.js"], /questionProgress/, "El runtime debe manejar preguntas internas por sala.");
assert.match(pkg.files["assets/game.js"], /localStorage/, "El runtime debe persistir el avance en localStorage.");
assert.match(pkg.files["assets/game.js"], /progressStorageKey|saveProgressState|restoreProgressState/, "El runtime debe definir una clave de persistencia para el avance.");
assert.match(pkg.files["assets/game.js"], /const ESCAPE_ROOM_FINAL_PASSCODE =/, "El runtime debe hidratar una clave final garantizada.");
assert.match(pkg.files["index.html"], /Panel de Control Maestro/, "El flujo final debe seguir mostrando el panel maestro.");
assert.match(pkg.files["assets/game.css"], /\.ending-panel\.is-alert/, "El CSS debe poder hacer parpadear el ending panel en rojo.");
assert.match(pkg.files["assets/game.js"], /function syncEndingAlertState\(/, "El runtime debe sincronizar el estado visual y sonoro de alerta del ending panel.");
assert.match(pkg.files["assets/game.js"], /function startAlertSound\(/, "El runtime debe exponer un arranque del sonido de alerta.");
assert.match(pkg.files["assets/game.js"], /function stopAlertSound\(/, "El runtime debe exponer un apagado del sonido de alerta.");
assert.doesNotMatch(pkg.files["assets/game.js"], /data-match-left=|data-match-right=/, "No debe usar el matching antiguo por columnas de botones.");
assert.doesNotMatch(pkg.files["index.html"], /<img src="Terminal de computadora antigua/i, "No debe renderizar descripciones largas como src de imagen.");
assert.doesNotThrow(() => new vm.Script(pkg.files["assets/game.js"]), "El JS empaquetado debe tener sintaxis válida.");

const fallbackProject = normalizeEscapeRoomProject({
  titulo: "Operacion Centinela",
  introduccion: "Desactiva el sistema final.",
  conclusion: "El sistema central se apaga cuando el equipo completa la misión.",
  misiones: [{ id: "m1", titulo: "Sala 1", preguntas: [{ id: "q1", titulo: "Clave", reto: "Resuelve", respuesta_correcta: "ok" }] }]
});

const fallbackPkg = buildEscapeRoomPackage(fallbackProject);
assert.match(
  fallbackPkg.files["assets/game.js"],
  /const ESCAPE_ROOM_FINAL_PASSCODE = "[A-Z0-9]{4,8}";/,
  "El runtime debe generar una clave final de respaldo cuando la conclusión no la incluye."
);

console.log("escapeRoom package builder OK.");
