Original prompt: vamos a crear el modo game en lecturasGame.html en lecturasGameModeModal. Crear minijuego educativo "Caza el sinónimo" (webcam + colisiones con cuerpo), con estados instruction/countdown/playing/won/lost/continue reading, integrado a narración de lecturas y con estilo infantil.

## Avances de esta sesión
- Se revisó implementación actual de `Modo game` (hoy es placeholder).
- Se identificaron puntos reales de integración:
  - Modal: `public/lecturasGame.html` (`#lecturasGameModeModal`).
  - Apertura/cierre game: `openGameModePlaceholder`/`closeGameModePlaceholder` en `public/lecturasGame.js`.
  - Control de narración live: `cbControlLecturaGeminiLive` y `cbLeerLecturaConGeminiLive`.
  - Fuente de sinónimos: `lectura.sinonimos` y utilidades de normalización.
- Se creó especificación técnica completa en:
  - `docs/caza-sinonimo-spec-arquitectura.md`

## TODO siguiente iteración (implementación)
- Reemplazar `openGameModePlaceholder()` por inicialización de `LecturasGameModeController`.
- Crear shell UI del minijuego dentro de `#lecturasGameModeBody` con un `canvas` principal.
- Implementar máquina de estados del juego.
- Integrar webcam y tracking corporal (PoseLandmarker).
- Implementar caída de palabras + colisiones + reglas win/lose.
- Integrar pausa/reanudación de narración con los callbacks globales existentes.
- Agregar `window.render_game_to_text` y `window.advanceTime(ms)` para pruebas automatizadas.
- Ejecutar pruebas Playwright con el cliente del skill y revisar screenshots/errores de consola.

## Riesgos / notas
- `lectura.sinonimos` llega con formatos mixtos (string/html/array): se requiere parser robusto antes del armado de rondas.
- Hay que liberar stream de cámara al cerrar modal para evitar consumo y bloqueos de permisos.

## Iteración 2 (implementación fases 1-3 en progreso)
- `public/lecturasGame.js`:
  - Se reemplazó `openGameModePlaceholder` por motor jugable de `Caza el sinónimo`.
  - Se agregó estado completo: `instruction`, `countdown`, `playing`, `won`, `lost`, `resume_reading`, `closed`.
  - Se agregó parser de sinónimos (`array/html/texto`) + fallback pedagógico.
  - Se implementó render en `canvas` con lluvia de palabras, avatar/sombra corporal y partículas al golpear distractores.
  - Se implementó detección corporal con MediaPipe PoseLandmarker (CDN) y colisiones cuerpo-palabra.
  - Se implementó victoria/derrota y sonido básico de feedback.
  - Se integró pausa y reanudación de narración (`cbControlLecturaGeminiLive`, `cbLeerLecturaConGeminiLive`).
  - Se expusieron hooks de test: `window.render_game_to_text` y `window.advanceTime(ms)`.
  - Se agregaron acciones UI del modal para iniciar, reintentar y continuar lectura.
  - Se agregó fullscreen con tecla `f` dentro del modal.
- `public/lecturasGame.css`:
  - Se añadió layout visual infantil para shell del minijuego, HUD, stage canvas, overlay y responsive móvil.

## Pendiente inmediato
- Validar sintaxis/ejecución real del flujo en navegador.
- Probar interacciones end-to-end con script Playwright del skill y revisar screenshots/errores.
- Ajustar finos visuales/físicos según resultados de pruebas.

## Iteración 3 (soporte de pruebas automatizadas)
- Se añadió `?gameDebug=1` en `public/lecturasGame.js` para autoabrir el minijuego con una lectura real (o mock si no hay datos).
- Objetivo: permitir corridas Playwright estables del skill sin depender de navegación manual por tarjetas de grado.
- Se ajustó `bootLecturasGame()` para que el modo debug se abra incluso cuando Firestore responde con permisos insuficientes.
- Se añadió modo de simulación corporal para debug (sin cámara real) y autoarranque opcional con `?gameDebug=1&autoStart=1`.

## Iteración 4 (pruebas Playwright + evidencias)
- Se instaló `playwright` y navegador Chromium en el entorno del skill `develop-web-game`.
- Corridas ejecutadas con el cliente oficial del skill:
  - `output/web-game/lecturas-caza/`: validación de arranque, sin errores de consola.
  - `output/web-game/lecturas-caza-short/`: estado `playing` alcanzado, avatar simulado visible, colisiones activas.
  - `output/web-game/lecturas-caza-lose/`: estado `playing` con `wrongRemaining` reducido (golpes efectivos en distractores).
  - `output/web-game/lecturas-caza-timeout/`: estado `lost` alcanzado por timeout (con `roundMs=4000` para prueba).
- Se verificaron visualmente capturas PNG de gameplay (`shot-0.png`) y estado JSON (`state-*.json`).
- No se registraron archivos `errors-*.json` en corridas exitosas.

## Notas de test
- En headless real no hay webcam, por eso se usa simulación de pose solo en `gameDebug`.
- Algunas corridas largas del cliente Playwright pueden quedarse ejecutando mucho tiempo por cantidad alta de `frames`; se prefirieron bursts medianos/cortos + casos dirigidos.

## Iteración 5 (ajustes solicitados por usuario)
- Se removió la proyección visual de cámara en el canvas (ya no se dibuja feed).
- Se reemplazó la visualización de nodos/palitos por un avatar tipo sombra.
- Se eliminó el bloque `lecturas-game-hud` del layout del minijuego.
- Se remaquetó el stage para que `lecturasGameCanvas` ocupe el 100% del área (sin padding en el body del modal de juego).
- Se priorizó que los distractores salgan del texto real de la lectura (`htmlLectura`), con fallback solo cuando faltan palabras.
- Se actualizó muestra `gameDebug` para incluir texto de lectura y validar distractores contextuales.

## Iteración 6 (flujo nuevo de juego + progresión)
- Skill aplicado: `build-game-ui-web-animation`.
- Se cambió el flujo de `Modo game`: ahora abre primero un catálogo de juegos en modal.
- Se añadió el primer juego seleccionable: **El juego de sinónimos**.
- El constructor de rondas de sinónimos ahora prioriza la **tabla de sinónimos** (payload `sinonimos` + tablas HTML), y si no hay datos suficientes el juego no inicia.
- Se añadió progresión:
  - `nivel` y velocidad de caída creciente por nivel.
  - puntaje: `+10` por palabra incorrecta acertada, `-10` al tocar el sinónimo.
  - recompensa por nivel: semilla.
  - cada 3 niveles: agua para regar.
  - plantas crecen cuando sube puntaje y se marchitan cuando baja.
- Se añadió ciclo de cosecha cada 5 niveles (misma mecánica corporal: golpear elementos para recolectar conocimiento).
- Se añadieron badges de progreso en HUD superior del stage: nivel, puntos, semillas, agua, plantas vivas.
- Prueba de humo ejecutada con Playwright:
  - `output/web-game/lecturas-level-smoke/state-0.json`
  - estado válido (`instruction`, `challengeType: synonyms`, progreso inicial) y sin `errors-0.json`.

## Iteración 7 (fix tabla de sinónimos y menú de secciones)
- Causa raíz detectada:
  - El viewer extraía sinónimos solo con selector estricto `table.lectura-tabla-sinonimos`.
  - El fallback de payload solo leía `payload.sinonimos`.
  - En varias lecturas nuevas los datos llegan con otras claves (`sinónimos`, `tablaSinonimos`, `tabla_sinonimos`, `glosario`, etc.) o con tablas sin clase exacta.
- Cambios aplicados en `public/lecturasGame.js`:
  - Se añadió `resolveLecturaSinonimos(raw)` para resolver sinónimos desde múltiples aliases y anidaciones (`rawData`, `campos`, `metadata`, `payload`).
  - `normalizeLectura` ahora usa `resolveLecturaSinonimos(raw)` para poblar `lectura.sinonimos` de forma robusta.
  - Se amplió `_lecturasAgentBuildSinonimosHtml` para aceptar arrays, objetos (`rows/items/data`), mapa clave-valor y líneas tipo `palabra: sinónimo`.
  - Se agregó `_lecturasAgentTableLooksLikeSinonimos(table)` y heurística para detectar tablas de sinónimos por `caption`, `th`, clases/ids y encabezados semánticos (palabra/sinónimo).
  - `_lecturasAgentExtractOptionalSections` ahora extrae sinónimos con selectores alternos + heurística de tabla.
  - `_lecturasAgentBuildViewerContent` ahora resuelve sinónimos desde aliases del payload antes de construir el HTML de sección.
  - `_lecturasGameBuildRoundFromLectura` ahora usa fallback robusto de sinónimos y más fuentes de HTML (`textoLectura`, `contenidoCompleto`, `lectura`, `contenido`, `texto`) para evitar falsos "tabla no disponible".
- Validación:
  - `node --check public/lecturasGame.js` sin errores.

## Iteración 8 (fix inicio + controles)
- Reporte de usuario: el botón de iniciar quedaba debajo del canvas y el personaje dejó de responder a movimiento.
- Ajustes aplicados:
  - `public/lecturasGame.css`: `.lecturas-game-overlay` ahora usa `z-index: 6` y `pointer-events: auto` para asegurar que el botón `Iniciar ronda` quede encima del canvas y sea clicable.
  - `public/lecturasGame.js`: fallback automático a simulación cuando no hay detección de pose por ~1.8s (sin requerir `?gameDebug=1`).
  - `public/lecturasGame.js`: se habilita `allowSimulatedPose` por defecto (puede desactivarse con `?simPose=0`).
  - `public/lecturasGame.js`: cuando vuelve la detección de pose real, se desactiva simulación automáticamente.
  - `public/lecturasGame.js`: reset de timers de detección de pose al abrir/cerrar modal para evitar arrastre de estado entre partidas.
- Resultado esperado:
  - Botón de inicio visible y funcional.
  - Si no hay tracking de cámara, el avatar vuelve a responder con teclado (flechas/WASD) en modo simulación.

## Iteración 8 (fallback sin tabla de sinónimos)
- Solicitud: si la lectura no trae tabla de sinónimos, usar palabras de la misma lectura para construir la ronda.
- Cambios en `public/lecturasGame.js`:
  - Se añadió extracción de vocabulario narrativo (`_lecturasGameExtractNarrativeWordPool`) desde el HTML de la lectura.
  - Se añadió banco local de sinónimos + índice bidireccional (`LECTURAS_GAME_FALLBACK_SYNONYM_BANK`).
  - Se añadió constructor de pares por fallback (`_lecturasGameBuildWordPairsFromNarrativeFallback`) que solo genera pares cuando ambas palabras aparecen en la lectura.
  - `_lecturasGameBuildRoundFromLectura` ahora usa este fallback cuando no hay pares en tabla de sinónimos, y completa distractores con palabras del mismo texto.
  - Se actualizaron mensajes de bloqueo para no depender del texto "tabla de sinónimos".
- Validación:
  - `node --check public/lecturasGame.js` sin errores.
- Verificación rápida:
  - `node --check public/lecturasGame.js` OK.
  - Corrida Playwright con cliente del skill sobre `http://127.0.0.1:4173/lecturasGame.html?gameDebug=1`:
    - artefactos en `output/web-game/lecturas-start-fix/`.
    - captura validada visualmente: se abrió el modal de juegos (no alcanzó shell de ronda en esa corrida).
  - Corrida adicional con `autoStart=1` falló por navegación intermedia del contexto Playwright (sin screenshot final).

## Iteración 9 (fix fallback sin tabla no iniciaba)
- Problema: el fallback semántico exigía que el sinónimo correcto también estuviera presente en el texto de la lectura, lo que dejaba muchas lecturas sin ronda.
- Corrección aplicada en `public/lecturasGame.js`:
  - `_lecturasGameBuildWordPairsFromNarrativeFallback` ahora toma objetivo del texto y permite sinónimo desde banco pedagógico aunque no aparezca literal en la lectura.
  - Se agregó normalización morfológica simple para variantes (`plural`, `-o/-a`) al buscar sinónimos del objetivo.
  - Se relajó mínimo de longitud de token narrativo de 4 a 3 para aumentar cobertura en lecturas cortas.
  - Si faltan distractores tras usar palabras narrativas, se completa con respaldo del banco base para no bloquear el nivel.
  - Mensaje de bloqueo actualizado para reflejar fallback con banco pedagógico.
- Validación:
  - `node --check public/lecturasGame.js` sin errores.

## Iteración 9 (menu inicial tipo Minecraft + ajuste de tamaño de globos)
- Se redujo el tamaño de palabras/globos desde el estado exagerado:
  - medición de ancho y alto de palabras reajustada.
  - tipografías 2D/3D reducidas.
  - escala de malla 3D reducida y relaneado reactivado a 2-3 columnas.
- Se creó una nueva pantalla inicial del juego en modal (estética tipo menú clásico pixel):
  - botones: `Jugar`, `Continuar jugando`, `Cómo jugar`, `Salir`.
  - se agregó soporte de `checkpoint` para habilitar/deshabilitar `Continuar jugando` por lectura.
- Se implementó fondo dinámico en menú inicial:
  - recolecta imágenes de la lectura (cover, arrays de imágenes, `<img>` del HTML).
  - rota automáticamente slides con transición suave (fade + zoom leve).
- Integración de flujo:
  - al abrir shell de juego se detiene rotación de fondo de menú.
  - al cerrar modal se persiste checkpoint y se limpia rotación.
- Se mantuvo cache-bust en `lecturasGame.html` a versión `20260311d`.

## Iteración 10 (modal de ayuda + fuente Ballooning en globos)
- Se reemplazó el `alert` de `Cómo jugar` por un modal interno con estilo del menú principal del juego.
- Se incorporó la fuente local `public/Ballooning.otf` vía `@font-face` en `lecturasGame.css`.
- Se implementó render de texto multicolor para globos (`_lecturasGameDrawBallooningText`) y se aplica en:
  - textura de texto 3D del globo.
  - fallback 2D cuando Three no está activo.
- Se ajustó la proporción globo/texto en 3D (esfera más grande + plano frontal + escala acotada) para evitar efecto "palabra plana detrás + bolita".
- Cache-bust actualizado a `20260311e` en `lecturasGame.html`.

## Iteración 11 (auto-siguiente nivel + transición al ganar)
- Se aplicó skill `develop-web-game` para corregir progresión entre niveles.
- Cambios en `public/lecturasGame.js`:
  - Al ganar un nivel (sinónimos y cosecha), ahora se agenda avance automático al siguiente nivel con `setTimeout` corto.
  - El avance automático ejecuta `prepareChallenge(next)` y entra directo en `COUNTDOWN` para mostrar `3,2,1` sin intervención del usuario.
  - Se añadió limpieza de timer de auto-avance al reintentar nivel y al cerrar modal para evitar carreras.
  - Selección de fondo por nivel ahora evita repetir la imagen actual cuando hay más de una disponible, para forzar cambio visual entre niveles y permitir transición de temblor/rotura/humo.
  - Se ocultó el botón manual `Siguiente nivel` para privilegiar el flujo automático.
- Validación pendiente en esta iteración:
  - Ejecutar cliente Playwright del skill y revisar screenshots/estado para confirmar: win -> transición visual de fondo -> countdown -> siguiente nivel jugando.

## Iteración 12 (fix transición visible + auto-nivel con countdown)
- Correcciones funcionales aplicadas:
  - Al ganar (`WON`) en sinónimos o cosecha, el juego ahora agenda avance automático al siguiente nivel y entra directo en `COUNTDOWN` (3,2,1).
  - Se reforzó limpieza de timers de autoavance en retry/cierre para evitar estados cruzados.
  - La selección de fondo evita repetir la imagen actual/última cuando hay varias disponibles.
  - `resolveCoverUrlForDisplay` ahora respeta rutas locales de imágenes (`.png/.jpg/.webp...`) sin forzarlas a Firebase Storage (eliminando 403 y fondo azul por fallback).
  - Si el fondo viejo no estaba listo como imagen, se toma snapshot del canvas actual y se usa como base para la transición (temblor + quiebre + caída de piezas + humo), garantizando efecto visual en cambio de nivel.
- Debug/testing:
  - Se añadió hook de prueba bajo `gameDebug=1`: `window.__lecturasGameDebug.forceWin()` para validar rápidamente la cadena de victoria->auto nivel.
  - Se añadieron campos de estado en `render_game_to_text` para diagnóstico: `background.url`, `background.ready`, `background.transitionActive`.
- Evidencia de pruebas:
  - Cliente oficial del skill ejecutado: `node "$WEB_GAME_CLIENT" ... ?gameDebug=1&autoStart=1&simPose=1` (exit code 0).
  - Prueba dirigida Playwright (script corto) con capturas en `output/web-game/lecturas-transition-check/`:
    - `shot-3-mid.png` y `shot-4-late.png` muestran transición activa con piezas rotas y humo.
    - `state-3-mid.json`/`state-4-late.json` reportan `"background.transitionActive": true`.
    - `state-5-countdown.json` muestra transición finalizada y countdown activo en nivel siguiente.

## Iteración 13 (fuego cargable por puño + cometa + glow animado)
- Se integró HandLandmarker (MediaPipe) junto con PoseLandmarker para detectar puño cerrado/abierto por mano.
- Nueva lógica de combate:
  - puño cerrado: carga fuego en muñeca (orb escalable por tiempo de carga),
  - abrir puño: dispara en dirección de la mano (`wrist -> middleMcp`) con filtro anti-disparo al piso,
  - soporte en ambas manos con cooldown independiente por release.
- Simulación actualizada:
  - `Space` ahora carga mientras se mantiene presionado y dispara al soltar.
- Visuales mejoradas:
  - bolas de fuego con cola tipo cometa (`trail[]`),
  - brillo animado en esqueleto cuando hay fire mode,
  - capa CSS animada en stage (`.is-fire-mode`, `.is-charging`) con keyframes tipo fuego.
- `render_game_to_text` extendido con `hands.left/right` (`closed`, `chargeNorm`, `aim`) y `fireballs[].trailLen`.
- Se añadieron utilidades debug para simular carga/liberación de fuego en `window.__lecturasGameDebug`.
- Pruebas de esta iteración:
  - `node --check public/lecturasGame.js` OK.
  - Cliente Playwright del skill ejecutado en corridas de humo:
    - `output/web-game/lecturas-fuego-puno/`
    - `output/web-game/lecturas-fuego-puno-charge/`
    - `output/web-game/lecturas-fuego-puno-charge2/`
  - Prueba dirigida con Playwright (import desde skill) para validar fuego cargable y release:
    - `output/web-game/lecturas-fuego-puno-directed/shot-charging.png` (orb cargando en puño)
    - `output/web-game/lecturas-fuego-puno-directed/shot-directed.png` (bola disparada con cola)
    - estado textual confirmado: `fireModeActive: true`, `hands.right.closed/chargeNorm`, `fireballs[].trailLen > 0`.
- Nota: en entorno headless no hay cámara real; la verificación de puño en cámara quedó validada por integración de HandLandmarker + fallback simulación y prueba dirigida de carga/release.

## Iteración 9 (silueta real + shake de nivel robusto)
- Skill aplicado: `build-game-ui-web-animation` + `develop-web-game`.
- Implementación en `public/lecturasGame.js`:
  - Se habilitó segmentación de Pose (`outputSegmentationMasks: true`) y se integró pipeline de silueta transparente real con fallback procedural por joints.
  - Se añadió runtime `silhouette` (preferencia real, persistencia de máscara, throttling de actualización y buffers temporales).
  - En `pair`, la asignación de máscaras ahora se hace por mitad de pantalla (centro de pose), evitando asociar una sola pose del lado derecho como `left`.
  - Se desactivó render de esqueleto por defecto; solo queda activo con `runtime.silhouette.debugShowSkeleton`.
  - Se separó FX de cambio de nivel (`levelTransitionFx`) del cambio de fondo y se aplica shake por variables CSS a capas visuales del stage.
  - El shake de nivel ahora es más visible (mayor amplitud/decay/escala) y se dispara en transición de nivel manual/auto y al completar incorrectas.
  - `render_game_to_text()` ahora expone:
    - `effects.levelTransitionActive` + `levelTransitionMsLeft`
    - `silhouette.enabled`, `silhouette.preferReal`, `silhouette.hasRecentMask.{solo,left,right}`
- Implementación en `public/lecturasGame.css`:
  - Variables CSS de shake (`--lg-shake-x/y/scale`) en stage.
  - Transform sincronizado en `lecturas-game-canvas`, `lecturas-game-words3d`, `lecturas-game-pose-overlay`.
  - Overlay de pose con blend/opacidad para legibilidad de silueta transparente.

## Pruebas y evidencias
- Sintaxis:
  - `node --check public/lecturasGame.js` ✅
- Cliente Playwright del skill (corrida funcional con evidencia):
  - `output/web-game/lecturas-silueta-shake-ready/shot-0.png`
  - `output/web-game/lecturas-silueta-shake-ready/state-0.json`
- Verificación dirigida (Playwright custom) para shake de cambio de nivel:
  - `output/web-game/lecturas-silueta-shake-verify/state-before-win.json`
  - `output/web-game/lecturas-silueta-shake-verify/state-after-win-transition.json`
  - `output/web-game/lecturas-silueta-shake-verify/shake-vars.json`
  - Resultado clave: `--lg-shake-x` y `--lg-shake-y` no-cero durante transición (`20.56px`, `-18.70px`), con `effects.levelTransitionActive=true`.

## Nota operativa
- En entorno headless/simulación, `hasRecentMask` puede permanecer `false` (sin máscara real de cámara). Con cámara real en runtime, la silueta recortada por máscara se activa automáticamente.

## Iteración 10 (debug causa raíz: silueta mezclada con cámara/esqueleto)
- Síntoma reportado: la silueta se veía mezclada con imagen de cámara y con aspecto de esqueleto; además se pidió espejo y sombra negra únicamente.
- Causa raíz confirmada:
  1) `renderSilhouetteFromMask` dibujaba primero `videoEl` y luego recortaba con máscara -> visual “persona real + tinte”, no sombra pura.
  2) Fallback procedural activo implícitamente en ausencia de máscara reciente -> reaparecía forma esquelética.
  3) CSS del overlay tenía `mix-blend-mode: screen`, lo que alteraba mezcla visual en fondos claros/oscuros.
- Fix aplicado:
  - Refactor de `renderSilhouetteFromMask`: ahora dibuja solo la máscara en espejo y la colorea negro (`source-in`), sin `drawImage(videoEl, ...)`.
  - `silhouette.proceduralFallback=false` por defecto para evitar regresar a dibujo esquelético.
  - Fallback procedural mantenido como opción, pero reestilizado en negro (si se activa manualmente).
  - Overlay CSS: `mix-blend-mode: normal` y `opacity: 1`.
- Verificación:
  - `node --check public/lecturasGame.js` OK.
  - Playwright skill capture: `output/web-game/lecturas-silueta-shadow-fix/shot-0.png` (sin overlay cian/esqueleto en simulación).
  - Verificación de estilo runtime: `mixBlendMode=normal`, `opacity=1`.

## Iteración 14 (pair independiente por lado + validación Playwright)
- Skill aplicado: `develop-web-game`.
- Problema reportado: en `pair` se mezclaban manos/nodos entre jugadores, había salto de lado al interactuar y el powerup/fuego no estaba totalmente aislado por lado.

### Causa raíz confirmada
- En `pair`, la asignación de pose podía reutilizar/mezclar entradas entre lados cuando faltaba una detección.
- El render de manos y la selección visual no distinguían completamente panel/jugador en todos los puntos de la tubería.
- `powerup` y `fireMode` se manejaban globalmente, compartiendo estado entre ambos lados.

### Cambios aplicados en `public/lecturasGame.js`
- **Aislamiento por lado (`left/right`)**:
  - Nuevo estado por lado: `pairSideState.left/right` con `powerup`, `powerupCollectedThisLevel`, `powerupSpawnAtMs`, `fireModeUntilMs`.
  - Helpers nuevos: `_lecturasGameResetPairStates`, `_lecturasGameGetPairSideState`, `_lecturasGameIsFireModeActiveForSide`, `_lecturasGameGetFireModeMsLeft`, `_lecturasGameIsAnyFireModeActive`, `_lecturasGameGetActivePowerups`.
- **Pose en pair sin contaminación cruzada**:
  - `_lecturasGameTryDetectPose` ahora selecciona candidatos por mitad de pantalla estricta, sin duplicar una misma pose para ambos lados.
  - Persistencia corta por lado (`~240ms`) cuando falta detección en una mitad.
  - Tag de lado por pose: `_lecturasGameTagPoseWithSide` (`playerSide` en joints/segments).
- **Nodos confinados por columna**:
  - `_lecturasGameBuildPoseRenderData` ahora usa `playerSide` y clamp fuerte por mitad (`safetyPad`) para evitar cruce de nodos al otro panel.
  - Selección de joints/segments por lado prioriza `playerSide`/`panelSide`.
- **Powerup independiente por jugador/lado**:
  - En `pair`, spawn/caída/recolección de powerup ahora corre por lado (`left` y `right`), no global.
  - Si un lado recolecta su powerup, sólo activa fuego para ese lado.
- **Fuego independiente por lado**:
  - Disparo validado por lado (`throwSide`) y sólo permitido si ese lado tiene fuego activo.
  - HUD/FX usan `anyFire` derivado de estados por lado.
- **Telemetría para debug**:
  - `render_game_to_text` ahora incluye `renderPoseHands` (posición y `sideByX`) y `powerups` (lista activa).
- **Debug de arranque**:
  - Query param `playMode=pair` respetado en debug auto-start.

### Validación ejecutada
- Sintaxis:
  - `node --check public/lecturasGame.js` OK.
- Cliente oficial Playwright del skill:
  - URL: `http://127.0.0.1:4173/public/lecturasGame.html?gameDebug=1&autoStart=1&simPose=1&playMode=pair`
  - Artefactos: `output/web-game/lecturas-pair-side-isolation5/`
  - Sin `errors-*.json`.
- Evidencia de aislamiento por lado en estado:
  - `state-0.json`: `renderPoseHands` con nodos `*_left` en `sideByX=left` y `*_right` en `sideByX=right`.
  - `state-2.json`: `players.left.fireModeActive=true` mientras `players.right.fireModeActive=false` (no se comparte fuego).

### Nota de entorno
- `npx serve` hacía redirect `*.html -> /ruta` y perdía query params de debug; para pruebas se usó `python3 -m http.server 4173`.

### TODO siguiente iteración
- Refinar aún más separación de manos por jugador en `HandLandmarker` (actualmente el aislamiento visual/lógico principal ya está por lado, pero el tracking de puño sigue global `left/right`).
- Añadir caso Playwright dedicado para verificar explícitamente que sólo un lado activa fuego al recolectar su powerup.

## Iteración 15 (fix robusto modo pareja: manos/pose por columna independiente)
- Skill aplicado: `develop-web-game` + enfoque `debug-causa-raiz`.
- Síntoma reportado: en `pair`, al bajar manos o interactuar, nodos/manos se cruzaban entre lados y se mezclaban entre jugadores.

### Causa raíz confirmada
- Tracking de manos seguía en esquema global `left/right` (mano anatómica/cámara), no por panel de juego; con 2 jugadores (hasta 4 manos detectadas) se reasignaban claves y se contaminaba el estado de carga/disparo.
- Asignación de poses por lado dependía de `centerX < split` estricta por frame; en bordes/oclusiones podía generar swap de jugador entre columnas.
- Colisión/interacción de mano en pair usaba múltiples nodos por lado, amplificando falsos toques y sensación de “manos unidas”.

### Cambios aplicados en `public/lecturasGame.js`
- Nuevo helper: `_lecturasGameGetPanelAnchorX(side, runtime)`.
- **Pose pairing robusto en pair** (`_lecturasGameTryDetectPose`):
  - Reemplazada lógica estricta por mitad de pantalla por asignación de costo mínimo respecto a centros previos de `left/right`.
  - Conserva persistencia corta de pose por lado cuando falta detección.
  - Reduce swaps de identidad al moverse cerca del centro.
- **Hand tracking por panel en pair** (`_lecturasGameTryDetectHands`):
  - Nuevo selector `_lecturasGamePickPairHandCandidate`.
  - En `pair`, se agrupan candidatos por lado según `wrist.x` y se selecciona 1 mano dominante por columna usando score (confianza + cercanía al historial del lado + cercanía al ancla del panel).
  - Cada lado actualiza exclusivamente `runtime.hands.left/right` de su propia columna.
- **Aim/origen de disparo por lado**:
  - `_lecturasGameGetPoseAimFallback` ahora en `pair` toma segmentos del lado (`playerSide/panel`) y no sólo `leftArm/rightArm` global.
  - `_lecturasGameSelectVisualHandNode` en `pair` filtra nodos por panel (`left/right`) y selecciona el más coherente con tracking del lado.
- **Interacción/colisión de manos más estricta en pair**:
  - `_lecturasGameGetHandCollisionJoints` en `pair` reduce a 1 mano efectiva por lado (o 2 total si no se especifica lado), evitando mezcla de nodos de ambos jugadores.
  - `_lecturasGameGetHandInteractionPoints` en `pair` devuelve sólo mano efectiva izquierda y derecha (una por panel).

### Validación ejecutada
- Sintaxis:
  - `node --check public/lecturasGame.js` ✅
- Cliente oficial del skill:
  - URL: `http://127.0.0.1:4173/public/lecturasGame.html?gameDebug=1&autoStart=1&simPose=1&playMode=pair`
  - artefactos: `output/web-game/state-0.json`, `output/web-game/shot-0.png`
  - evidencia en estado: `playMode="pair"` y `renderPoseHands` confinado por lado (`*_left` en `sideByX:left`, `*_right` en `sideByX:right`).
- Corrida adicional de smoke de UI menú:
  - `output/web-game/lecturas-pair-fix-side-lock-run2/shot-0.png`.

### Nota / pendiente siguiente
- Esta iteración ataca el cruce estructural de manos/pose por lado en runtime.
- Pendiente validar con cámara real (no headless) la estabilidad fina de `fist open/close` simultáneo de 2 jugadores y ajustar thresholds por lado si hace falta (`close/openThreshold`, smoothing y cooldown de release).

## Iteración 16 (fireballs sólo activas bajo `lecturas-game-stage-top`)
- Solicitud: evitar que bolas de fuego revienten palabras cuando todavía están arriba/ocultas detrás del top bar (`.lecturas-game-stage-top`).
- Cambios en `public/lecturasGame.js`:
  - Nuevo helper `_lecturasGameGetWordActivationY(runtime, nowMs)`:
    - Calcula el umbral Y en coordenadas de canvas usando el borde inferior real de `.lecturas-game-stage-top`.
    - Incluye cache breve (~90ms) para reducir lecturas de layout por frame.
  - `_lecturasGameCacheUiRefs()` ahora guarda `ui.stageTopEl`.
  - `_lecturasGameUpdateFireballs()`:
    - Obtiene `wordActivationY` por frame.
    - Antes de colisión fireball-palabra, ignora palabras cuyo hitbox todavía esté por encima de ese umbral (`rect.y < wordActivationY`).
- Resultado esperado:
  - Las palabras no se pueden explotar mientras están arriba/detrás del top HUD.
  - Se vuelven impactables sólo cuando ya entraron por debajo de `lecturas-game-stage-top`.
- Validación:
  - `node --check public/lecturasGame.js` OK.

## Iteración 17 (Música Lyria por lectura + versión game)
- Skill aplicado: `build-game-ui-web-animation`.
- Objetivo: en `generarLectura.html`/`lecturasASCAgent`, agregar generación de música instrumental por lectura con dos versiones:
  1) lectura (clásica, relajada, emocional),
  2) game (electrónica/sintetizadores, movida),
  reutilizando audios existentes en Storage y mostrando `Re-generar música` cuando ya existen.

### Backend (`functions/index.js`)
- Se añadió dependencia `@google/genai` y endpoint nuevo:
  - `POST /api/gemini/lyria/generate`
- Flujo del endpoint:
  - verifica auth Firebase Bearer,
  - recibe `lecturaId`, `sourceCollection`, `promptReading`, `promptGame`, `force`,
  - si ya existen ambos audios en el doc y `force=false`, retorna `source: "storage"`,
  - si no, genera dos pistas con `lyria-realtime-exp` (Live Music API),
  - recolecta chunks PCM, los convierte a WAV,
  - sube a Storage en:
    - `lecturas_music/<collection>/<id>/reading.wav`
    - `lecturas_music/<collection>/<id>/game.wav`
  - guarda URLs/rutas en el documento Firestore en campo `music`.

### Frontend tabla ASC (`public/lecturasASC.js` + `public/generarLectura.css`)
- Se agregó botón por fila `ascMusic` (`action-music`) en la lista de lecturas ASC.
  - Si no hay música: icono música + tooltip `Generar música`.
  - Si ya hay música: icono regenerar + tooltip `Re-generar música`.
- El botón llama al endpoint de Lyria y actualiza tabla/cache.
- Se agregó callback global para el visor:
  - `window.cbGenerateLecturaMusicAssets(payload)`
  - usado por `lecturasASCAgent` para generar/re-generar desde la vista de lectura.

### Visor `lecturasASCAgent` (`public/generarUnidad.js` + `public/generarUnidad.css`)
- Se añadió botón de música en los controles del visor (junto a play/regenerate/fullscreen/secciones):
  - `Generar música` o `Re-generar música` según disponibilidad.
- Se añadieron dos players dentro del contenido del visor cuando existen URLs:
  - `Música lectura`
  - `Música game`
- Se añadió estado interno `lecturasAgentViewerState.music` para URLs/flags de generación.
- `cbOpenLecturasAgentViewer` ahora recibe y conserva `musicAssets` + `allowMusicGeneration`.

### Integración con "Ver lectura"
- `onViewRow` en `lecturasASC.js` ahora pasa al visor:
  - `musicAssets` actuales (si existen)
  - `allowMusicGeneration: true`

### Validación
- Sintaxis OK:
  - `node --check public/lecturasASC.js`
  - `node --check public/generarUnidad.js`
  - `node --check functions/index.js`
- Dependencias backend actualizadas:
  - `functions/package.json`
  - `functions/package-lock.json`

### Nota operativa
- Para producción, desplegar Functions para habilitar ruta nueva:
  - `firebase deploy --only functions`

## Iteración 18 (MP3 + botón en modal para ASC/Nuevas + sinónimos editables)
- Ajustes solicitados aplicados:

### 1) Audio más liviano para web (MP3)
- Backend `functions/index.js` actualizado:
  - Se agregó `lamejs` para codificar PCM -> MP3.
  - Lyria ahora guarda:
    - `lecturas_music/<coleccion>/<lecturaId>/reading.mp3`
    - `lecturas_music/<coleccion>/<lecturaId>/game.mp3`
  - `contentType` ahora `audio/mpeg`.
- Resultado: archivos más ligeros y compatibles con navegadores.

### 2) Botón de audio dentro de `lecturasASCAgentImageActions`
- En `public/generarUnidad.js`:
  - Se añadió botón `data-action="generate-reading-music"` dentro de `lecturasASCAgentImageActions`.
  - Muestra `Generar música` o `Re-generar música` según existan audios.
  - Incluye estado spinner durante generación.
  - Renderiza dos players dentro del modal: `Música lectura` y `Música game`.
- Disponible tanto para:
  - Lecturas ASC (`public/lecturasASC.js` pasa `allowMusicGeneration: true` + `musicAssets`).
  - Lecturas Nuevas (`public/lecturaNueva.js` ahora también pasa `allowMusicGeneration: true` + `musicAssets`).

### 3) `asc-editor-panel-actions` en columna
- En `public/generarLectura.css`:
  - `.asc-editor-panel-actions` ahora usa `flex-direction: column` y se ve uno debajo de otro.

### 4) Tabla de sinónimos editable en `ascSynonymsBody`
- En `public/lecturasASC.js`:
  - `renderAscSynonymsPanel()` marca `table.lectura-tabla-sinonimos` como `contenteditable=true`.
  - Cada tabla se renderiza con `data-synonym-table-index`.
  - Al editar, se sincroniza automáticamente el HTML de la tabla al contenido principal del editor (`ascTexto`) para que se guarde al persistir.

### Validación
- Sintaxis OK:
  - `node --check public/lecturasASC.js`
  - `node --check public/generarUnidad.js`
  - `node --check public/lecturaNueva.js`
  - `node --check functions/index.js`

### Nota de despliegue
- Para activar MP3 + endpoint actualizado en entorno productivo:
  - `firebase deploy --only functions`

## Iteración 13 (micrófono directo + prosodia + feedback de botones)
- Skill aplicado: `develop-web-game`.
- Ajustes en `public/lecturasGame.js` para modo **Atrapa el sinónimo**:
  - Se mantuvo y reforzó flujo **directo a micrófono** (sin lectura TTS previa), con arranque desde countdown.
  - Se agregó estado `orderVoice.starting` para que el foco/blur se active desde que se inicia el micrófono (antes de `onstart`) y se congele la caída de palabras en ese tramo.
  - Se añadió captura de prosodia por audio (`getUserMedia` + `AnalyserNode`) con métricas:
    - pausas cortas/largas (coma/punto),
    - energía/volumen pico,
    - estimación de tono (pitch) para tendencia interrogativa/exclamativa.
  - La validación de frase ahora combina texto reconocido + prosodia:
    - cobertura de palabras (LCS),
    - puntuación flexible,
    - señales de pregunta/exclamación por puntuación/léxico/entonación,
    - validación de pausas cuando la frase contiene `,` o `.`.
  - Se asegura cleanup de recursos de audio (timer, analyser, stream) al terminar/cancelar reconocimiento y al cerrar/resetear ronda.
- Feedback solicitado en botones:
  - `start-round` y `retry-round` mantienen SFX tipo cohete + temblor de pantalla vía `levelTransitionFx`.

### Validación ejecutada
- Sintaxis:
  - `node --check public/lecturasGame.js` OK.
- Cliente Playwright del skill (post-fix):
  - `output/web-game/order-prosody-postfix/` (sin `errors-*.json`).
- Prueba dirigida modo ORDER con mock de `SpeechRecognition`:
  - `output/web-game/order-directed-flow/`.
  - `state-0-post-start.json`: `challengeType: "order"` y `effects.levelTransitionActive: true` tras tocar iniciar (shake trigger activo).
  - `shot-1-focus.png`: frase centrada y countdown/foco visible durante fase de lectura.
  - `state-2-after-recognition.json`: transición a siguiente estado de juego tras reconocimiento.

### TODO siguiente
- Validar en navegador real con voz humana (sin mock) para calibrar umbrales de prosodia (`rms`/`pitch`) según micrófonos de baja calidad.
- Si hay falsos negativos en dispositivos concretos, exponer preset `prosodyLenient=1` por query param para flexibilizar evaluación sin tocar producción global.

## Iteración 14 (separación de lógica por juego + frase animada)
- Se separó el flujo operativo del juego ORDER respecto al de sinónimos en handlers dedicados:
  - `_lecturasGameOrderOnCountdownFinished(...)`
  - `_lecturasGameOrderTick(...)`
  - El loop principal ahora delega al handler ORDER solo cuando `challengeType === order`.
- Se mejoró el sistema de frase en ORDER para guía de pronunciación:
  - Render letra por letra con spans animados de izquierda a derecha.
  - Animación de crecimiento + glow por letra.
  - Color de glow por frase (ciclo): morado, verde, naranja.
  - La palabra objetivo mantiene énfasis (`is-hit`).
- `runtime.round` ahora actualiza por frase:
  - `orderPhraseGlow`
  - `orderPhraseAnimVersion`

### Verificación
- `node --check public/lecturasGame.js` OK.
- Captura de revisión visual en `output/web-game/order-phrase-glow-check/shot-order-glow.png`.

## Iteración 15 (fix espacios + karaoke visible)
- Causa detectada: el render tokenizado no garantizaba separación visual consistente entre palabras en todos los casos.
- Corrección aplicada:
  - Render de frase por `split(/\s+/)` con separador explícito `&nbsp;` entre palabras (`lecturas-game-order-space`).
  - Karaoke ahora tiene índice activo calculado en JS (`_lecturasGameGetOrderKaraokeIndex`) para recorrer palabras de izquierda a derecha con estado determinista.
  - Palabra activa usa clase `is-karaoke-active` con glow/color fuerte (no depende solo de delays CSS).
- Verificación visual:
  - `output/web-game/order-karaoke-active-fix/shot-1.png`
  - `output/web-game/order-karaoke-active-fix/shot-2.png`

## Iteración 16 (ORDER sin countdown repetido + rearme de mic)
- Se eliminó el `3,2,1` interno del juego ORDER entre frases:
  - Al terminar countdown inicial de ronda, ahora entra a `playing` y arma escucha directa (`nextAutoStartAt`) sin volver a `startOrderReadFlow`.
  - Tras frase correcta y tras atrapar palabra en modo trampa, ahora pasa a la siguiente frase con `_lecturasGameQueueOrderSpeech(...)` (sin nuevo countdown).
- Se reforzó continuidad de micrófono:
  - En `rec.onend` y `rec.onerror`, si ORDER sigue en `playing` y no hay trampa activa, se rearma escucha automáticamente.
- El botón `start-mic-read` ahora dispara escucha directa (sin `3,2,1`).
- Verificación:
  - `node --check public/lecturasGame.js` OK.
  - prueba dirigida con mock en `output/web-game/order-no-recountdown-check/`.

## Iteración 17 (karaoke por voz + puntaje por palabra)
- Se reemplazó el avance rápido por tiempo en ORDER: ahora la palabra iluminada avanza por match de voz (ritmo del jugador).
- Lógica nueva por palabra:
  - Compara cada palabra reconocida contra la palabra iluminada actual.
  - Acierto: `+10` puntos.
  - Error: `-5` puntos.
  - Se marcan visualmente palabras correctas/incorrectas en la frase.
- Implementación técnica:
  - `orderPhraseWords`, `orderPhraseSpeakable`, `orderPhraseWordStates`, `orderWordIndex`, `orderActiveDisplayIndex` en `runtime.round`.
  - Consumo incremental de transcript con `orderVoice.processedWordCount` para evitar recontar tokens.
  - `SpeechRecognition` en ORDER con `continuous=true` e `interimResults=true`.
- Verificación:
  - `node --check public/lecturasGame.js` OK.
  - prueba dirigida `output/web-game/order-word-score-check3/state.json` con `score: -10` y captura `shot.png` confirmando penalización por palabras mal dichas.

## Iteración 18 (fix flujo ORDER: no salta párrafos)
- Causa raíz corregida en `Atrapa el sinónimo`:
  - El motor avanzaba palabra/párrafo aun con mismatch de voz.
  - Eso generaba saltos deliberados del segundo párrafo en adelante.
- Ajustes aplicados en `public/lecturasGame.js`:
  - Match de voz por palabra activa: solo avanza índice cuando coincide exacto.
  - Palabra incorrecta ya no avanza el puntero (se mantiene en la palabra esperada).
  - Procesamiento de resultados de speech por `resultIndex` y solo resultados `isFinal` para evitar arrastre/cascada de texto previo.
  - Mantiene escucha continua (`continuous=true`) sin repetir `3,2,1`.
  - Penalización `-5` limitada a una vez por palabra activa hasta acertarla (evita caída infinita por ruido).
- Validación ejecutada:
  - Cliente oficial del skill: `output/web-game/order-flow-fix-client-run/`.
  - Prueba dirigida de flujo: `output/web-game/order-flow-fix-directed/` (se mantiene en playing sin salto de párrafo).
  - Prueba de penalización controlada: `output/web-game/order-flow-fix-penalty-throttle/state.json` con `score: -5` tras ruido repetido.

## Iteración 19 (fix karaoke detenido / no fluye)
- Diagnóstico de causa raíz:
  - El matcher por palabra era demasiado estricto y se quedaba bloqueado en una palabra.
  - El consumo de transcript no era robusto ante hipótesis reescritas del ASR, provocando comportamiento errático.
- Correcciones aplicadas en `public/lecturasGame.js`:
  - Matcher tolerante `_lecturasGameSpeechWordMatch(...)` con distancia de Levenshtein por longitud de palabra.
  - Recuperación de flujo con lookahead de 1 palabra: si reconoce la siguiente, marca la actual como mal y continúa (sin saltos descontrolados).
  - `interimResults=true` para que la iluminación avance palabra por palabra durante dictado.
  - Procesamiento incremental por `orderVoice.processedWordCount`, con reset seguro al cambiar frase.
  - Penalización `-5` solo en resultados finales (no en hipótesis intermedias), evitando castigos por ruido temporal.
- Verificación:
  - Cliente oficial del skill ejecutado: `output/web-game/order-karaoke-stability-client/`.
  - Prueba dirigida ORDER con mock de voz: `output/web-game/order-karaoke-flow-fix-final/`.
    - Capturas muestran avance de palabra iluminada y cambio de frase sin quedar atascado.

## Iteración 20 (palabra clave voladora en fallo + ciclo mic/música)
- Ajuste de flujo solicitado en ORDER:
  - Si al cerrar intento de frase quedan palabras pendientes/incorrectas, ahora se fuerza fallo y se genera palabra clave voladora.
  - Al entrar en modo trampa se detiene micrófono (`_lecturasGameStopOrderSpeech`) y se desactiva ducking (música normal).
  - Al atrapar palabra clave, avanza a la siguiente frase y rearma micrófono automáticamente.
  - Si la frase se dice completa correctamente, avanza directo a la siguiente frase.
- Cambios clave en `public/lecturasGame.js`:
  - `_lecturasGameHandleOrderSpeechFailure` ahora detiene speech + limpia `nextAutoStartAt` antes de activar trampa.
  - Nuevo helper `_lecturasGameShouldFinalizeOrderAttempt(...)` para decidir cierre de intento final.
  - En `rec.onresult`, al ser resultado final con palabras pendientes se dispara fallo/trampa.
- Verificación dirigida:
  - Falla y palabra voladora: `output/web-game/order-flyword-on-fail/state.json` + `shot.png` (`activeWords` contiene palabra clave).
  - Atrapar palabra y pasar a siguiente frase con mic reactivado: `output/web-game/order-flyword-catch-next/state.json` + `shot.png`.

## Iteración 21 (debug causa raíz: iluminación se quedaba en última palabra)
- Síntoma reproducido en ORDER: después de transición de frase, la iluminación podía quedarse fija y no reflejar nueva frase.
- Hallazgo confirmado en código:
  - En `_lecturasGameConsumeOrderSpeechWords`, después de `_lecturasGameTryAdvanceOrderPhrase(runtime)` se hacía `break` y luego se escribían de nuevo `orderPhraseWordStates/orderWordIndex/orderActiveDisplayIndex` con referencias de la frase anterior.
  - Ese write-back tardío sobrescribía estado recién inicializado de la nueva frase.
- Fix mínimo aplicado:
  - Si `_lecturasGameTryAdvanceOrderPhrase(runtime)` devuelve true, ahora se hace `return` inmediato para evitar sobrescribir estado con datos stale.
- Validación:
  - `node --check public/lecturasGame.js` OK.
  - evidencias visuales en `output/web-game/order-rootcause-fix-stuck-highlight/`.

## Iteración 22 (debug raíz: primera palabra mal + flujo audio/trampa + repelación)
- Síntomas reportados:
  - Al pasar de frase, se marcaba mal la primera palabra.
  - A veces no se detenía por párrafo/frase.
  - Flujo música/micrófono no seguía el comportamiento esperado en lectura vs trampa.
- Causa raíz confirmada:
  - La lógica de consumo permitía castigar mismatch inicial antes de anclar la frase nueva, y el lookahead podía adelantar progreso de forma no deseada.
- Fix aplicado:
  - Se añadió `orderSpeechPrimed` por frase: hasta no reconocer la primera palabra válida, se ignoran mismatches iniciales (no marca mala la primera por ruido).
  - Se eliminó adelanto por lookahead a la siguiente palabra para evitar saltos de frase.
  - Se añadió `orderReadingAudioState` con pausa/reanudación real de música durante lectura:
    - lectura/mic activo => pausa música,
    - modo trampa (palabra voladora) => reanuda música.
  - Palabra voladora más ágil:
    - mayor velocidad base de spawn,
    - sistema de repelación desde manos del esqueleto para hacerla más difícil de atrapar.
- Validación:
  - `node --check public/lecturasGame.js` OK.
  - pruebas dirigidas en:
    - `output/web-game/order-debug-root-fixes/`
    - `output/web-game/order-flyword-on-fail/`
    - `output/web-game/order-flyword-catch-next/`

## Iteración 23 (debug raíz adicional + flujo audio/repelación)
- Se detectó y corrigió otro foco raíz de inestabilidad al inicio de frase:
  - mismatch inicial por ruido antes de anclar primera palabra.
- Cambios aplicados:
  - `orderSpeechPrimed` por frase: hasta acertar primera palabra no penaliza ni avanza.
  - Se removió avance por lookahead para evitar saltos de frase/párrafo.
  - Audio de lectura con pausa real (no solo ducking):
    - lectura activa => pausa música,
    - trampa/palabra voladora => reanuda música,
    - retorno a lectura => pausa música y activa mic.
  - Palabra voladora más difícil:
    - mayor velocidad base,
    - repelación por nodos de mano del esqueleto.
  - `3,2,1` subido con clase `.is-countdown` para reducir solape con párrafo.
- Verificación:
  - `node --check public/lecturasGame.js` OK.
  - capturas/estado en:
    - `output/web-game/order-countdown-position-fix/`
    - `output/web-game/order-debug-root-fixes/`
    - `output/web-game/order-flyword-on-fail/`
    - `output/web-game/order-flyword-catch-next/`
- 2026-03-12 ORDER flow refactor: dictado y lluvia separados; 3,2,1 movido arriba; fallo de lectura ahora dispara cohete+temblor y reinicia la misma frase; éxito de lectura activa lluvia de palabras para atrapar la clave.
- 2026-03-12 fix ORDER: agregado alias `_lecturasGameOrderSpeechLooseMatch`; fallo de voz vuelve a fase de palabra voladora con cohete+temblor; repulsion de palabra voladora endurecida (radio/fuerza/velocidad) y hitbox de captura reducida.
- 2026-03-12 ajuste ORDER solicitado: al fallar pronunciacion ahora solo cohete+temblor y reinicio de la misma frase; lluvia de palabras inicia unicamente tras pronunciacion correcta.
- 2026-03-12 voz ORDER: idioma dinamico preferente es-MX/es-419 segun navegador; matching más tolerante a transcript duplicado/interim; onresult procesa desde resultIndex para evitar acumulacion que marcaba falso negativo.
- 2026-03-12 debug voz/order: fixed race in stop/start mic audio (restoreAudio flag + onend early skip); final phrase validation now uses full transcript (not partial chunk) and only finalizes when enough speech coverage.
- 2026-03-12 prueba flujo unificado media: camera now requests video+audio first; prosody capture reuses main camera audio track when available; stop prosody no longer stops shared camera audio track.
- 2026-03-12 speech phrase sanitation: cleaned rare punctuation combos (e.g. ":-", long dashes, quotes) before ORDER phrase render/validation; relaxed punctuation/pause gates when phrase contains hard-to-pronounce symbols.
- 2026-03-12 ORDER phrase order fix: removed random shuffle; now ORDER mode uses sentences from lectura start in natural sequence.
- 2026-03-12 ORDER fail trigger fix: finalization no longer depends only on isFinal punctuation; attempt now closes when spoken coverage reaches ~85% so mismatch reliably triggers rocket+shake+phrase reset.
- 2026-03-12 root-cause fix ORDER speech: moved pass/fail decision from interim chunks to final/onend via `_lecturasGameFinalizeOrderSpeechAttempt`; cached `lastTranscriptAll` to evaluate full phrase and prevent premature false failures.
- 2026-03-12 last-word false negative fix: speech consumer now reprocesses overlap of last 2 tokens and does not mark mismatches as wrong during interim chunks; avoids locking final word as incorrect when ASR later corrects it.
- 2026-03-12 ORDER speech acceptance fix: lowered strictness of text LCS acceptance and added progress-based pass (`pointerCoverage >= 0.78`) in finalizer, so correct spoken phrase is not rejected due final token/punctuation ASR noise.
- 2026-03-12 rain freeze + score isolation fix: ignore stale SpeechRecognition callbacks via rec identity guard; added rain-motion watchdog for order trap words; game profile stats now read strictly per game bucket (no fallback to legacy global score/level).
- 2026-03-12 frozen rain cleanup fix: added hard cleanup `_lecturasGameClearAllWordEntities` (array + stale 3D groups) and used it on phrase reset/failure/catch/round reset/close to prevent accumulated frozen words across phrase transitions.
- 2026-03-12 topbar timer UI: added countdown badges (solo + pair left/right) and wired updates in `_lecturasGameSetMode` using `roundTimeLimitMs - roundElapsedMs`.
- 2026-03-12 ORDER rain movement update: correct synonym now moves right-to-left while falling using randomized long+short zigzag components; pattern resets from right edge when crossing left bound.
- 2026-03-12 strict word-fail behavior: if any hard mismatch is detected on final speech chunk, finalizer now forces rocket+shake+phrase restart (no rain transition).

## Iteración 14 (refactor flujo voz `Atrapa al sinónimo`)
- Skill aplicado: `develop-web-game`.
- Problemas corregidos (causa raíz):
  - El avance de palabras se estaba confirmando con resultados ASR intermedios (`interim`) y eso movía el progreso sin lectura realmente confirmada.
  - El estilo de texto tenía animación karaoke infinita por CSS, generando percepción de resaltado automático.
  - Los reintentos de micrófono reencolaban countdown completo, provocando ciclos repetitivos de `3,2,1`.
- Cambios técnicos en `public/lecturasGame-synonyms.runtime.js`:
  - `SpeechRecognition` ahora usa `interimResults = false` y `continuous = false` (lectura por intento único estable).
  - `onresult` ahora procesa solo segmentos finales (`isFinal`), guardando `lastFinalTranscript` y evitando commits con hipótesis intermedias.
  - Reescritura de `_lecturasGameConsumeOrderSpeechWords`: progreso determinista por prefijo confirmado, sin penalización/avance por intermedios.
  - `_lecturasGameGetOrderKaraokeIndex` ahora desactiva highlight automático del siguiente token (sin karaoke auto).
  - `_lecturasGameScheduleOrderSpeechRetry` ahora agenda `nextAutoStartAt` sin reiniciar countdown de 3s en cada retry.
  - `render_game_to_text` extendido con bloque `order` (frase, estados de palabras, estado de micrófono y transcripciones) para depuración reproducible.
- Cambios visuales en `public/lecturasGame.css`:
  - Eliminada animación `lecturas-order-word-karaoke`.
  - El estado visual fuerte se aplica solo a `.is-correct`.
- Cache-busting:
  - `lecturasGame-synonyms.app.js` -> runtime `v=20260314e`.
  - `lecturasGame.html` y `lecturasGame-synonyms.html` actualizados a `lecturasGame-synonyms.app.js?v=20260314e`.

### Validación ejecutada
- Sintaxis:
  - `node --check public/lecturasGame-synonyms.runtime.js` OK.
  - `node --check public/lecturasGame-synonyms.app.js` OK.
- Playwright (cliente del skill):
  - `output/web-game/order-voice-refactor/`
  - `output/web-game/order-voice-refactor-start/`
  - Sin `errors-*.json`.
  - Estado JSON muestra en modo `order` que `phraseWordStates` se mantiene `pending` cuando no hay final transcript y que el flujo pasa a `manualRetryRequired` sin mover progreso.
- Inspección visual adicional (full-page Playwright ad-hoc):
  - `output/web-game/order-voice-dom-check/`
  - `dom-state.json` confirma `activeCount: 0` en todas las capturas (sin highlight automático).

### TODO siguiente iteración
- Probar con micrófono real en navegador del usuario para calibrar `silent retry` (límites/tiempos) con voz infantil real.
- Opcional: migrar el mismo refactor a `public/lecturasGame-order.app.js` para mantener paridad si esa app se vuelve a usar.

## Iteración 15 (debug causa raíz micrófono: onerror + onend duplicaban reintentos)
- Síntoma operativo confirmado: en `Atrapa el sinónimo`, al entrar a lectura de voz se mostraba `Habla ahora` y casi enseguida `Reintentar micrófono`.
- Causa raíz confirmada en código (`public/lecturasGame-synonyms.runtime.js`): un mismo intento fallido de Web Speech podía disparar `onerror` y luego `onend`; ambos caminos llamaban `_lecturasGameScheduleOrderSpeechRetry(...)`, duplicando `autoRetryCount` y forzando `manualRetryRequired` demasiado rápido.
- Fix aplicado:
  - Se añadió cierre de intento por sesión (`attemptSettled` + `settleAttempt()`) dentro de `_lecturasGameStartOrderSpeech`.
  - `rec.onerror` ahora procesa retry solo si el intento no fue resuelto antes.
  - `rec.onend` ahora ignora reprocesamiento si `onerror` ya cerró ese mismo intento.
- Verificación ejecutada:
  - Repro automatizada con Playwright + `SpeechRecognition` fake que fuerza secuencia `onstart -> onerror(no-speech) -> onend`.
  - URL: `http://127.0.0.1:4173/lecturasGame.html?gameDebug=1&autoStart=1&game=order`.
  - Resultado observado: durante la muestra no se activó `manualRetryRequired` de forma inmediata; se mantuvo en `false` y el flujo continuó en `playing` con reintentos temporizados.
- Consistencia aplicada: mismo guard de intento único (`attemptSettled`) replicado en `public/lecturasGame-order.app.js` y `public/lecturasGame-trace.app.js` para evitar doble conteo de retry en entrypoints alternos.

## Iteración 16 (fix: no autoabrir Atrapa al cargar)
- Causa raíz: `maybeAutoOpenGameFromUrl()` abría modal automáticamente con solo `?game=...` (sin `gameDebug`), y además el lector de forzado aceptaba forzado global/query fuera de debug.
- Cambios aplicados en `public/lecturasGame-synonyms.runtime.js`:
  - `LECTURAS_GAME_BOOT_FORCE` quedó vacío (sin forzado por defecto).
  - `_lecturasGameReadForcedGameId()` ahora solo acepta query `game` en `gameDebug=1` o forzado global explícito (`window.__LECTURAS_GAME_ALLOW_FORCE_GAME__ === true`).
  - `maybeAutoOpenGameFromUrl()` ahora requiere `gameDebug=1` para autoabrir desde URL.
- Cache bust:
  - `public/lecturasGame-synonyms.app.js` -> `lecturasGame-synonyms.runtime.js?v=20260314f`
  - `public/lecturasGame.html` -> `lecturasGame-synonyms.app.js?v=20260314f`
- Verificación Playwright:
  - `lecturasGame.html?game=order` ya no abre modal automáticamente (`isOpen=false`).
  - Al pulsar botón `Game` se muestra selector de juegos (incluye Protege/Atrapa/Trazos), no arranca ronda directa (`#lecturasGameStartBtn` ausente en menú inicial).

## Iteración 17 (estabilización voz Atrapa + fuente única)
- Se rehizo el flujo de voz de `order` en `public/lecturasGame-synonyms.runtime.js` con estado explícito:
  - `idle -> countdown -> arming_mic -> listening -> evaluating -> success|retry_phrase|mic_manual_retry`.
- Se eliminó el esquema legacy de auto-retry por contadores (`autoRetry*`) y se sustituyó por:
  - `attemptId` para descartar eventos tardíos,
  - `attemptSettled` por intento para bloquear doble resolución `onerror+onend`,
  - `silenceDeadline` (~9s) con recuperación corta de escucha y paso a `mic_manual_retry` al agotar silencio.
- Correcciones de UX/flujo:
  - Se quitó el segundo countdown de voz (evita repetir `3,2,1` tras iniciar ronda).
  - Countdown principal ahora deja estado `orderVoice.state = countdown` y al terminar abre micrófono una sola vez.
  - Botón `Hablar ahora` queda visible solo en `mic_manual_retry`.
  - En lectura incorrecta: estado `retry_phrase`, sonido/FX de cohete y temblor; se conserva feedback visual de palabras (no se limpia de inmediato a `pending`).
  - Progreso por palabra en orden con `strict` al evaluar final para marcar mismatch.
- Consol idación de fuente de verdad:
  - `public/lecturasGame-order.app.js` y `public/lecturasGame-trace.app.js` se convirtieron en wrappers del runtime único `lecturasGame-synonyms.runtime.js` usando forzado explícito permitido.
  - `public/lecturasGame-synonyms.app.js` y `public/lecturasGame.html` actualizados a cache-bust `v=20260314g`.
  - `public/lecturasGame-order.js` y `public/lecturasGame-trace.js` actualizados a `v=20260314g`.
- Validación dirigida (Playwright con ASR simulado):
  - Se verificó transición `countdown -> playing/arming_mic -> listening` sin reintento manual inmediato.
  - Con silencios simulados, el flujo recupera escucha sin reiniciar ejercicio en el corto plazo y mantiene `manualRetryRequired=false` durante ventana de silencio activa.

## Iteración 18 (debug raíz: mic se apaga al iniciar)
- Síntoma confirmado por código: en `order`, el flujo de cámara abría stream con audio y `SpeechRecognition` abría captura de mic en paralelo; además el manejo de `onerror` mandaba a manual de forma agresiva.
- Fix aplicado en `public/lecturasGame-synonyms.runtime.js`:
  - Cámara en `video-only` (`getUserMedia` con `audio:false`) para eliminar conflicto de captura con ASR.
  - `orderVoice` amplió estado con `recoverableErrorRetries`.
  - Nuevo clasificador de error ASR (`_lecturasGameClassifyOrderRecognitionError`) y política:
    - `no-speech` => `recover_silent` (sin manual inmediato)
    - `aborted|audio-capture|network` => 1 recovery corto y luego manual
    - `not-allowed|service-not-allowed` => manual inmediato con mensaje de permisos
  - `mic_manual_retry` ahora restaura audio/música explícitamente al entrar (cierre final).
  - En `onend`, se evita restaurar audio cuando entra en recuperación; solo se restaura al cierre real del intento.
  - `SpeechRecognition` en `continuous:true` e `interimResults:true` para reducir cortes prematuros.
- Independencia entre juegos:
  - `public/lecturasGame-order.app.js` y `public/lecturasGame-trace.app.js` ya no son wrappers/imports a runtime de otro juego.
  - Verificación `rg "import .*synonyms.runtime"` en order/trace = 0 coincidencias.
- Cache bust actualizado a `20260314h` en:
  - `public/lecturasGame-synonyms.app.js`
  - `public/lecturasGame.html`
  - `public/lecturasGame-order.js`
  - `public/lecturasGame-trace.js`
