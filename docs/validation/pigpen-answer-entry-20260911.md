## Síntoma
La generación se detenía en r4_p1 al detectar una respuesta explícita en el reto del plan.

## Reproducción
El texto rechazado original no quedó accesible en la consola de Chrome. Reproducción local equivalente: caso con _ESTURE, pregunta de vocabulario y la instrucción «Type the complete word GESTURE». answerDisclosureIssues confirma la fuga.

## Hallazgos
La validación se ejecuta sobre application, instruction_outline y case_data antes de aceptar la sala. Un mandato terminal que da la respuesta es una fuga real, no debe desactivarse la validación. La sesión real de Chrome conservaba las tres salas completadas.

## Hipótesis probadas
Confirmada para la reproducción: una instrucción terminal con la solución activa el rechazo, y sustituir exclusivamente esa instrucción por «Type the answer you deduced» conserva el caso y permite validar. No se afirma que la respuesta original perdida tuviera exactamente esa redacción.

## Causa raíz
El generador podía copiar la solución privada dentro de una instrucción pública. El flujo rechazaba la sala sin corregir localmente este caso sencillo. La redacción exacta de la respuesta rechazada original no está disponible.

## Fix
Corrección determinista limitada a mandatos terminales con la respuesta literal en texto, multimedia y opción múltiple cuando existe case_data. Conserva la clave privada y los datos, no modifica listas de alternativas ni afirmaciones generales. Aplica en plan y misión; después se mantienen los validadores. Instrucción explícita adicional en el prompt. No añade llamadas ni reintentos automáticos. HTML usa v332 y la importación de política usa v19.

## Validación
8 pruebas aprobadas mediante node --test tests/pigpen-answer-entry-repair.test.mjs tests/pigpen-single-room-request.test.mjs. Incluyen clave intacta, caso intacto, corrección idempotente, alternativas preservadas, rechazo de otras fugas, ausencia de llamadas extra y checkpoint secuencial. node --check public/js/PigPenCreator.js aprobado.
Prueba real en Chrome: Segundo, Trim 2, Tema 1, Body Language. Al recrear el objetivo reanudó directamente en sala 4 de 4. La generación pasó y mostró 4 salas y contenido listo The Silent Airport Code. Texto real r4_p1: application presenta _ESTURE y pide el término deducido, instruction_outline no revela GESTURE y answer_target conserva GESTURE. Sin errores capturados en consola.

## Riesgos / Regresiones
La corrección no acepta otras fugas ni inventa pistas. Una generación futura con otro tipo de fuga sigue rechazándose. El script antiguo scripts/test-pigpen-puzzle-contract.mjs no completó su arnés VM por normalizeObjectiveQuestionPlan no definido; sus primeras comprobaciones de fugas pasaron, pero no se presenta como prueba completa aprobada. No se desplegó Hosting; el cambio está en el servidor local indicado por el usuario.
