# Validación de PigPen: Matemáticas Secundaria 3, trimestre 2, tema 1

**Estado:** prueba de producción completada antes de las dos correcciones de contenido; repetición final pendiente  
**Producción:** `https://charly-brown.web.app/PigPenCreator`  
**Hoja:** `Escape Rooms Español`, fila 22 de `Escape Rooms Aprende 2026-2027`  
**Tema:** Modelaje de funciones lineales y cuadráticas  
**Configuración prevista:** 7 salas × 4 preguntas, 27 tipos, recompensa principal Letras, 5 extras; borrador sin publicar.

## Errores y repeticiones

| ID | Intento / lugar | Sala, pregunta y tipo | Error observado | Corrección / repetición | Resultado |
|---|---|---|---|---|---|
| E1 | Reproducción local previa al despliegue | Tipo Relación de columnas; la etapa aún no tenía una pregunta identificable | La validación sólo devolvía el mensaje genérico de distractores aunque podía deberse a cantidad, vacío, duplicado normalizado o colisión con una respuesta correcta. | Se añadió diagnóstico por causa y reparación dirigida exclusivamente a `opciones`, con máximo de tres intentos y conservación de `parejas`. Se añadieron regresiones para las cuatro causas y para conservar las parejas. | Las seis regresiones nuevas pasan; la reparación inválida termina con error concreto. |
| E2 | Producción, primer intento antes de desplegar la reparación Multimedia | Sala 1; pregunta y número no expuestos por el aviso; tipo Multimedia | `Multimedia requiere cuatro opciones distintas y la solución literal en una única opción.` Falló antes de guardar salas. | Se añadió reparación focalizada de las cuatro `opciones`, sin cambiar solución ni recurso, con validación de cantidad, vacíos, duplicados y respuesta literal. Desplegado como Hosting `v366`. | El fallo quedó corregido en código y cubierto por seis regresiones; el siguiente intento superó esa revisión y avanzó a completar salas. |
| E3 | Producción, segundo intento con la importación y ambas automatizaciones activas | Sala 4; reserva `r4_reserve`, fuera de las cuatro preguntas, por lo que aún no tiene tipo de interacción asignado | La salida de Gemini omitió `plans.r4_reserve.reasoning_steps[1]` y `[2]`. Tras dos modelos secuenciales, PigPen conservó las salas anteriores y señaló la sala pendiente. | Se usó el punto de guardado por sala y se reanudó desde la sala 4 sin repetir las tres salas aprobadas. El brief de Sheets y las salas aprobadas quedaron guardados en el borrador. | Recuperación completada. La Sala 4 se abrió con 4 preguntas; las cuatro respuestas se verificaron correctas y se avanzó a la Sala 5. |
| E4 | Producción, intento de cambiar una recompensa después de crear el borrador | Configuración de experiencia; recompensa principal | Guardar «Imagen» en la configuración no cambió el plan compilado: la vista previa seguía con «Letras». | Se agregó una ruta de ajuste de recompensa: compara contratos, reconstruye el plan y conserva misiones, preguntas y fragmentos. El botón «Generar escape room» toma esa ruta cuando sólo cambia la recompensa. | La lógica unitaria pasa para las cinco recompensas principales nuevas. Falta comprobar el flujo en la aplicación publicada; el código actual aún no se ha desplegado. |
| E5 | Producción, Sala 5, pregunta 3, `respuesta_coordenadas` | `Navegación en el Plano Cartesiano` | Decía «el desplazamiento indicado», pero no daba cantidad ni dirección; E `(2,2)` no permite deducir I `(3,3)`. | Se editó el borrador en producción: ahora pide avanzar 1 columna a la derecha y 1 fila hacia abajo; la pista explica `x+1`, `y+1` y el destino `(3,3)`. | Antes de editar, la UI aceptó I `(3,3)` aunque el texto no justificaba esa respuesta. El cambio se leyó en el editor; la segunda ejecución de la partida no se completó por inestabilidad de la pestaña Chrome. |
| E6 | Revisión de comprensión visual de coordenadas | Tablero de Sala 5, pregunta 3 | En la versión de producción, E `(2,2)` se identificaba con el texto «· Inicio»; el énfasis visual era tenue. | En código se añadió la insignia visible «Inicio», borde sólido resaltado, coordenadas en la celda y nombre accesible «E (2, 2), Inicio». | La regresión local del tablero pasa. Esa mejora visual aún no está desplegada en Hosting; el editor de producción conserva el contenido modificado. |
| E7 | Suite local de navegador, experiencia y recompensas | 18 tipos de interacción; comodines y recompensas principales | La prueba antigua esperaba que la recompensa de imagen fuera un código y buscaba un aviso de ayudas agotadas que ya no corresponde a la interfaz. | La prueba arma el rompecabezas por piezas y comprueba el diálogo real de pista. | `tests/pigpen-experience-browser.test.mjs`: 8/8 pasan; los seis tipos de recompensa principal, incluyendo las cinco recompensas «Nuevas», se ejercitan en el navegador local. |
| E8 | Producción, Sala 6, pregunta 4, construcción de expresión | `Construcción y Evaluación de Expresiones` | El enunciado pide evaluar `2(5)^2 − 3(5) + 5`, cuyo resultado es 40; el plan y el verificador pedían 46 y aceptaban `5 × 11 − 9`. | Se corrigió la pregunta del borrador: explica los términos 50, 15 y 5; la secuencia de fichas ahora forma `50 − 15 + 5`; el resultado objetivo y la solución se cambiaron a 40. | La partida original aceptó 46, lo cual confirma un error de contenido/verificación. El cambio se leyó en el editor del borrador, pero aún falta validar esta pregunta en una ejecución posterior a la edición. |

## Cambios desplegados

- Hosting únicamente; no se desplegaron Functions ni reglas.
- `v365`: reparación de distractores de Relación de columnas.
- `v366`: reparación dirigida de opciones Multimedia.
- `v367`: guardar objetivo de Sheets en `#objetivoInput` y esperar confirmación de guardado remoto antes de continuar; checkpoints por sesión/tema y sala en IndexedDB; acción para continuar desde el último avance aprobado.
- El idioma de esta sesión se cambió a Español (Latinoamérica); el tema anterior «The Logic Chamber» permanece intacto.
- La publicación continúa desactivada; la sesión es borrador.
- El borrador productivo de Matemáticas se editó directamente para hacer explícito el movimiento del acertijo cartesiano y corregir la evaluación cuadrática. Chrome volvió a alternar a otra pestaña durante la confirmación; falta comprobar tras recargar que ambos cambios persistieron.

## Evidencia automatizada local

- Suite de navegador de experiencia: 8/8 correctas. Incluye 18 mecánicas, pista, rompecabezas de imagen y seis recompensas principales.
- Pruebas focalizadas de políticas, recompensas interactivas, ajuste de recompensa conservando preguntas, experiencia y acertijos espaciales: 67/67 correctas.
- Prueba de jigsaw: 11/11 correctas; `node --check` y `git diff --check`: correctos.
- `tests/pigpen-objective-room-materialization.test.mjs`: 2/4 fallan por expectativas previas incompatibles con el contrato actual (el test espera versión 1 y el código usa versión 3; la otra aserción busca una condición que ya no está). No se atribuye a este cambio.
- Prueba de navegador de producción previa a las ediciones: 7/7 salas, 28 preguntas respondidas, 27 tipos únicos cubiertos; clave final `PARABOLA` correcta. Sala 2 usó comodines; las salas 1, 3, 4, 5, 6 y 7 obtuvieron recompensa por sala perfecta.
- Se probaron descarte, comprobación parcial y pista; el inventario mostró fragmentos, recompensas de sala perfecta, material coleccionable y personalización. Se confirmó que la sesión siguió en borrador y el interruptor Publicar quedó apagado.
- Las automatizaciones «Enriquecer objetivo» y «Generar escape room» estaban ambas seleccionadas.

## Criterios pendientes

- Volver a abrir la misma sesión en producción y confirmar que persistieron las ediciones E5 y E8.
- Repetir Sala 5 Q3 y Sala 6 Q4 con la versión corregida; verificar el indicador visual «Inicio» cuando el parche esté disponible en producción.
- Leer errores de consola del navegador tras la repetición final.
- Desplegar Hosting con el parche local una vez preparado un checkout aislado que no incluya los numerosos cambios ajenos del checkout actual.

## Registro de la partida de producción anterior a las correcciones E5/E8

| Sala | Preguntas respondidas | Resultado |
|---|---:|---|
| 1 · El estadio de los modelos funcionales | 4/4 | Perfecta; fragmento `PA`, material de colección y personalización. |
| 2 · Modelaje Avanzado en la Arena Numérica | 4/4 | Correctas; se usaron descarte, comprobación parcial y pista. |
| 3 · La Gran Olimpiada de los Números | 4/4 | Correctas; perfecta. |
| 4 · Modelaje Avanzado de Funciones Lineales y Cuadráticas | 4/4 | Correctas; perfecta. |
| 5 · Arena de Modelaje Funcional | 4/4 | Correctas; perfecta. La navegación por coordenadas llegó a I `(3,3)`, pero su enunciado no justificaba ese movimiento. |
| 6 · Cima de los Modelos Funcionales | 4/4 | Correctas según el verificador; perfecta. La última respuesta `46` era matemáticamente incorrecta para el enunciado y motivó E8. |
| 7 · La Arena de los Modelos Funcionales | 4/4 | Correctas; perfecta. |

El inventario final mostró fragmentos que forman `PARABOLA`; se ordenaron las letras y el juego indicó victoria con progreso 7/7. Esta evidencia corresponde al contenido previo a E5/E8, por lo que no sustituye la repetición de esas dos preguntas corregidas.
