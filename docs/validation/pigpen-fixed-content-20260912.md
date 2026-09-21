# Plantilla local y relleno de texto — v344

## Síntoma
El proveedor devolvía JSON mal formado. Filtrar un esquema no eliminaba la dependencia de que Gemini reconstruyera correctamente el documento entero.

## Reproducción y causa
La ruta anterior analizaba con JSON.parse la estructura generada por Gemini. Se verificó mediante pruebas aisladas que la nueva ruta recibe texto con comillas y saltos reales sin invocar ese analizador. No se dispone de la respuesta remota original para identificar su carácter defectuoso.

## Fix
PigPen construye localmente el documento global y cada sala antes de llamar al proveedor. Las recetas de los 18 tipos nuevos fijan identificadores, bancos, soluciones, posiciones, reglas y parámetros numéricos; los clásicos conservan sus campos y asignaciones locales. Sólo se exponen marcadores de contenido textual. Los tipos numéricos reciben cantidades locales deterministas por plan.

Gemini devuelve bloques FIELD/END. El relleno exige todos los campos exactamente una vez y rechaza campos desconocidos, bloques truncados y contenido fuera de los bloques. El documento original permanece intacto. Se derivan localmente las copias del enunciado, las pistas, el feedback y la evidencia para reducir el volumen solicitado.

La validación estructural local precede a la llamada. Los validadores de contenido y jugabilidad siguen aplicándose después del relleno. Una llamada por sala, secuencial y con checkpoints; no se añaden reparaciones automáticas por IA.

## Validación
140 pruebas aprobadas en las suites fixed-content, filtered-template, contract-audit, experience, single-room-request, rule-alias, json-syntax, one-room y choice-bank-labels. Sintaxis de PigPenCreator.js y pigpen-fixed-content.mjs verificada con node --check.

Se comprueba: topología local de los 18 tipos; soluciones jugables antes/después del relleno; 8 clásicos; copias derivadas; rechazo de campos ausentes, duplicados, desconocidos y truncados; conservación del número de salas global; canal de texto sin JSON.parse de la salida del modelo; una solicitud por sala y checkpoints.

## Límites
No se realizó generación remota real. Gemini todavía puede omitir textos o redactar contenido pedagógicamente incorrecto; eso se rechaza, no se convierte en una estructura improvisada. Esta prueba no certifica todos los recorridos visuales de recompensas y comodines. Otras funciones independientes de regeneración conservan sus transportes anteriores; la corrección cubre la creación del objetivo global y el llenado de salas de esta ruta.
