# Contexto por sala dentro de su propia solicitud — v347

## Síntoma y evidencia
La generación global terminó con 57 textos ausentes desde rooms.2.learning_focus. La inspección de la pestaña activa mostró 4 salas y 4 preguntas por sala; rooms.2 era la tercera sala, no una sala añadida por el constructor para una configuración de dos.

La petición global anterior solicitaba el marco del proyecto y los campos de todas las salas. Su validador exigía recibirlos todos antes de poder iniciar el bucle secuencial. El error indica una respuesta incompleta de esa etapa, no dos salas jugables ya completadas. No se capturó la respuesta remota original para establecer por qué el proveedor dejó de emitir campos.

## Corrección
La plantilla global reserva localmente el número exacto de salas pero no envía ningún campo rooms.* a Gemini. Cada solicitud de sala incluye room_context, plans y mission en el mismo documento de texto fijo. El contexto se incorpora al proyecto antes de materializar la sala. La continuidad entrante se conserva localmente a partir de la sala anterior. Se guardan los resultados antes de iniciar la siguiente.

El nuevo prompt incluye la fuente curricular original para planificar esa sala, además del marco global y los casos ya evaluados. Una petición global y una por sala; ninguna solicitud extra de reparación.

## Verificación
150 pruebas aprobadas. Cobertura nueva: de 1 a 8 salas el número de campos globales permanece constante y ninguno empieza por rooms.; el contexto de una sala y sus preguntas se rellenan juntos sin pedir otras salas. Se conservan los tests de una llamada, orden secuencial, checkpoints, contratos jugables y apoyo pedagógico visible.

Sintaxis de PigPenCreator.js correcta. No se alteraron los valores del formulario del usuario ni se inició otra petición real a Gemini. El nuevo flujo reduce el alcance de la planificación global; no garantiza que un proveedor externo siempre complete todos los textos solicitados.
