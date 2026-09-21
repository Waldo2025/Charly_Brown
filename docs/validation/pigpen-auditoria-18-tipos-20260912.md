# Auditoría de los 18 tipos nuevos de PigPen

## Síntoma
La generación se detenía sucesivamente por omisiones o incompatibilidades entre el plan privado, el esquema de salida, los validadores y los controles del juego. Las pruebas anteriores demostraban que los ejemplos válidos funcionaban, pero no cubrían suficientemente los contratos mínimos ni las soluciones imposibles de introducir.

## Reproducción
Se examinó el recorrido completo: esquema del plan → contrato interaction_data → normalización → validación de autoría → acciones del alumno → evaluación → edición → motor autocontenido del export.

Pruebas reproducibles: tests/pigpen-contract-audit.test.mjs y la batería detallada al final. Se construyeron contratos completos y mínimos para cada tipo y se eliminaron campos obligatorios; también se introdujeron IDs inexistentes, selecciones imposibles, reglas inválidas y límites incompatibles. No se utilizaron solicitudes de Gemini para estas pruebas.

## Matriz de requisitos
Todos los tipos necesitan version=1, instructions con los datos públicos suficientes, extra_hint, options con id/label, targets con id/label y solutions. Cada solución cubre todos los destinos exactamente una vez. allowed ausente o [] significa banco completo; una lista limita las opciones visibles. Los IDs deben ser únicos, válidos y referenciar elementos existentes.

| Tipo | Datos y controles necesarios | Solución y comprobaciones particulares |
|---|---|---|
| Selección de varias respuestas | Un destino; 4–8 opciones; selección independiente; minimum | ≥2 correctas y ≥2 distractores fuera de todas las soluciones. Banco completo visible. Cada solución alcanza minimum. |
| Respuesta + justificación | Exactamente dos destinos; bancos de conclusión y razón, cada uno con alternativas | Una selección por destino. La pareja completa debe coincidir con una solución. Los distractores pertenecen al grupo correspondiente. |
| Marcar evidencia | Un destino; segmentos ordenados del documento; selección múltiple; minimum | Conjunto exacto de segmentos; mínimo alcanzable y fragmentos no decisivos visibles. |
| Clasificar en grupos | Destinos=casos; opciones=categorías; selección por caso | Una categoría por caso. Se pueden repetir categorías entre casos. Cada caso ofrece alternativas. |
| Matriz de deducción | Filas=destinos; columnas=opciones; pistas públicas; controles seleccionar/excluir | Una opción por fila, sin repetir una opción entre filas. La respuesta no puede estar simultáneamente seleccionada y excluida. |
| Completar patrón | Patrón y términos conocidos en instructions; destinos=huecos; ≥3 alternativas por hueco | Una opción por hueco y ≥2 distractores. En causa y efecto deben existir acontecimiento inicial y pasos conocidos. |
| Construir expresión | Un destino; fichas numéricas/operadores seguros; goal y maximum; añadir/deshacer | Se acepta cualquier expresión válida que alcance goal y respete maximum/reglas. La solución de ejemplo debe caber en ese límite. División por cero y código ejecutable no son válidos. |
| Ubicar en escala | Cada opción tiene value finito y distinto; etiqueta con unidad; uno o más marcadores | Una posición por marcador. Escala ordenada numéricamente y alternativas visibles. |
| Seleccionar y sustituir error | Exactamente dos destinos; texto con el error en instructions; bancos separados | Selección del fragmento erróneo y su reemplazo; una opción por destino. Alternativas en ambos bancos. |
| Predecir resultado | Un destino; estados futuros candidatos y cambio descrito en el caso | Una opción; alternativas visibles, incluyendo una incorrecta. Los datos deben permitir deducir el cambio. |
| Completar analogía | Relación incompleta en instructions; destino por hueco | Una selección por hueco. Cada banco contiene solución y distractores. |
| Seleccionar contraejemplo | Un destino; afirmación general y casos candidatos | Una selección; contraejemplo definido y alternativas que no sean soluciones. |
| Comparar atributos | Filas=elementos; columnas=propiedades; selecciones múltiples y confirmación de filas vacías | Conjunto exacto por fila; las filas sin atributos se declaran explícitamente con []. |
| Completar diagrama | Nodos con x/y, connections válidas, etiquetas candidatas y controles por nodo | Una etiqueta por nodo. Coordenadas 0–100; separación que evite superposición; alternativas visibles. El prompt recomienda 10–90. |
| Resolver restricciones | Posiciones ordenadas; elementos; rules públicas y estructuradas | Distribución completa que cumpla todas las reglas. before/after usan IDs; at/not_at índices válidos desde cero; different impide repetir. No exige distractores permanentemente incorrectos: un elemento puede servir en distintas distribuciones. |
| Información suficiente | Un destino; datos candidatos; minimum; todos los conjuntos mínimos declarados | Coincidencia con uno de los conjuntos mínimos. Se rechaza declarar un conjunto que contiene otro ya suficiente. La suficiencia curricular requiere revisión semántica. |
| Respuesta por coordenadas | Un destino; cuadrícula rectangular completa; x/y enteros únicos por celda | Una celda correcta. Sin huecos en el producto de ejes declarado; etiquetas distintas y alternativas. El editor ahora permite corregir x/y. |
| Balancear cantidades | Destinos=recipientes; fichas reutilizables con value; goal; maximum; añadir/deshacer/confirmar vacíos | Suma algebraica total igual a goal, dentro del máximo. Valores negativos representan lo que se resta. La solución de ejemplo debe ser introducible. |

## Campos del plan privado
Además del contrato jugable, el plan necesita conocimiento y trazabilidad: knowledge, evidence, case_data, transfer_delta, reasoning_evidence, reasoning_steps, cognitive_operation, answer_family, answer_signature, answer_target, application, instruction_outline, hint_strategy, feedback_strategy, narrative_effect y las listas distractor_errors/editorial_constraints/solution_pairs según el esquema.

En tipos nuevos, solution_pairs permanece vacío y mechanic_contract sólo necesita kind="none". No se exige completar parámetros de cifrado inactivos. evidence omitido puede recuperarse del reasoning_evidence existente; no se fabrican evidencias, soluciones, casos ni pasos. Desafiante requiere dos pasos sustantivos o tres en síntesis. La diversidad se evalúa con los casos y razonamientos, no únicamente por compartir una regla curricular.

## Hallazgos y correcciones
1. **Esquema genérico excesivo:** requería value/x/y incluso en botones de texto. Ahora se exigen sólo los campos activos según el tipo, usando requisitos compartidos con el motor. Los campos opcionales siguen permitidos y se validan si vienen presentes.
2. **Cantidad de destinos incompatible:** el esquema permitía un destino para respuesta+justificación/corregir error, aunque el juego exige dos. El esquema ahora declara el número correspondiente y la cobertura de soluciones.
3. **Soluciones imposibles:** minimum mayor que la solución o maximum menor que las fichas necesarias. Ahora se rechazan antes de jugar.
4. **Matriz no biyectiva por fila:** una solución podía repetir una columna. Ahora se exige asignación uno a uno entre las filas usadas.
5. **Restricciones fuera de rango:** not_at con un índice inexistente podía ser trivialmente verdadera. Se comprueban rango, referencias y valores numéricos.
6. **Alternativas insuficientes:** tipos de predicción, contraejemplo, escala, coordenadas, evidencia y diagrama no tenían la misma protección de alternativas que los slots. Ahora se comprueba visibilidad de alternativas no correctas.
7. **Geometría y escala:** se detectan cuadrículas incompletas, nodos superpuestos y valores de escala duplicados.
8. **Conjuntos no mínimos:** información suficiente rechaza supersets de otras soluciones declaradas.
9. **Restricciones con soluciones múltiples:** se elimina la exigencia incompatible de una alternativa siempre incorrecta por posición; la corrección depende de la distribución completa.
10. **Plantilla numérica de ejemplo:** maximum/minimum salían como cero. Ahora se usan los valores declarados: maximum=12 y minimum=1.
11. **Valores inválidos que causaban excepciones:** etiquetas numéricas y reglas nulas se rechazan con diagnóstico, sin romper el validador.
12. **Edición de coordenadas:** se añadieron los campos de posición de cada celda al editor y al listado compartido con el libro editorial.

No se modificó la secuencia de llamadas: una solicitud por sala, sin concurrencia ni reparación remota automática. El checkpoint conserva las salas aceptadas.

## Hipótesis probadas
- Contratos aceptados que el alumno no podía completar: confirmada con mínimo de selección, máximo de fichas y matriz repetida; corregida con pruebas negativas.
- Campos irrelevantes obligatorios: confirmada al construir versiones mínimas de cada tipo; corregida en el esquema sin permitir ausencia de datos activos.
- La validación de distractores era uniforme para todos los juegos: descartada; resolver restricciones requiere una regla distinta porque sus alternativas pueden ser válidas en otras distribuciones.

## Validación
**108 pruebas automáticas aprobadas**, incluyendo:
- 18 tipos con contrato completo y mínimo, acciones reales del motor, revisión de campos editables y motor autocontenido como el usado sin conexión.
- Ausencia de campos obligatorios de nivel superior y de opciones/destinos.
- Referencias rotas, límites incompatibles, reglas mal formadas y datos nulos.
- 262143 selecciones no vacías de tipos; 324 parejas ordenadas; combinaciones con los clásicos y configuraciones de recompensas. Son pruebas locales de planificación/configuración, no generaciones de Gemini.
- Regresiones de guardado, Firestore, preferencias, checkpoints, diversidad, respuesta explícita, evidence y singleAttempt.

**18/18 tipos aprobados en navegador** mediante un arnés local: se renderizan sus controles, se introducen las respuestas con eventos click en los botones del DOM y se evalúa el resultado. Sin errores de consola. Esto verifica la interacción técnica con fixtures, no la calidad pedagógica de nuevas respuestas de Gemini.

Comando:
`node --test tests/pigpen-contract-audit.test.mjs tests/pigpen-experience.test.mjs tests/pigpen-new-type-combinations.test.mjs tests/pigpen-single-room-request.test.mjs tests/pigpen-evidence-recovery.test.mjs tests/pigpen-synthesis-diversity.test.mjs tests/pigpen-answer-entry-repair.test.mjs tests/pigpen-objective-checkpoint.test.mjs tests/pigpen-bonus-visibility.test.mjs tests/pigpen-question-preferences.test.mjs tests/pigpen-firestore-undefined.test.mjs`

## Riesgos y límites
No puede garantizarse que Gemini produzca siempre un JSON completo ni contenido pedagógicamente correcto. Los validadores técnicos no prueban por sí solos que un distractor sea plausible, que una pista baste para deducir la solución, que todos los conjuntos suficientes estén enumerados o que una analogía no sea ambigua. Estas condiciones siguen explícitas en el prompt y necesitan evaluación del contenido generado. No se desactivaron las validaciones para hacer pasar respuestas inválidas.

Los 429, cortes de conexión e imágenes son problemas externos a los contratos de preguntas. Esta auditoría no consumió cuota de Gemini ni pretende resolver su capacidad disponible.

Cambio local: **v337**, motor/autoría **v6** y exportador **v102**. No se desplegó Hosting.

## Corrección posterior: etiquetas y bancos independientes (v338)
La auditoría inicial omitió un caso válido: la misma etiqueta puede existir en dos bancos independientes sin ambigüedad. La regla global de etiquetas distintas era demasiado restrictiva. Se sustituyó por validación por destino y banco visible. Los segmentos de evidencia se numeran según su posición documental; las celdas ya muestran sus coordenadas. Siguen rechazándose alternativas indistinguibles dentro del mismo banco. El diagnóstico de planes ahora incluye plan_id, tipo, destino y etiquetas/IDs conflictivos. Se verificaron 88 pruebas focalizadas, incluidas tres nuevas pruebas de esta regresión. El JSON rechazado original no estaba incluido en el reporte del usuario, por lo que no se identifica cuál de sus etiquetas se repitió.
