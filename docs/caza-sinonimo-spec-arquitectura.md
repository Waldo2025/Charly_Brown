# Caza el Sinónimo: Especificación Técnica y Arquitectura Web

## 1) Objetivo
Implementar el modo de juego `Caza el sinónimo` dentro de `lecturasGameModeModal` para pausar temporalmente la narración, lanzar una ronda de vocabulario con webcam y reanudar lectura al terminar.

## 2) Contexto actual del proyecto (base real)
- Modal objetivo existente: `#lecturasGameModeModal` en [public/lecturasGame.html](/Users/waldolopez/Documents/CharlyBrown/public/lecturasGame.html:66).
- Apertura actual del modo game: `openGameModePlaceholder()` en [public/lecturasGame.js](/Users/waldolopez/Documents/CharlyBrown/public/lecturasGame.js:1085).
- Botón que dispara modo game: `data-action="game"` en [public/lecturasGame.js](/Users/waldolopez/Documents/CharlyBrown/public/lecturasGame.js:1030).
- Estado de narración en vivo disponible: `window.cbControlLecturaGeminiLive` y `window.cbLeerLecturaConGeminiLive` en [public/lecturasGame.js](/Users/waldolopez/Documents/CharlyBrown/public/lecturasGame.js:1907).
- Datos de sinónimos por lectura ya disponibles como `lectura.sinonimos` en [public/lecturasGame.js](/Users/waldolopez/Documents/CharlyBrown/public/lecturasGame.js:1117) y normalizados en utilidades de secciones (tabla/html/arreglo) desde [public/lecturasGame.js](/Users/waldolopez/Documents/CharlyBrown/public/lecturasGame.js:2289).

## 3) Alcance funcional (MVP)
1. Abrir `Modo game` desde una lectura.
2. Mostrar instrucción + palabra objetivo.
3. Cuenta regresiva `3, 2, 1`.
4. Lluvia de palabras con 1 sinónimo correcto y N distractores.
5. Captura de webcam y detección de cuerpo (mínimo muñecas, codos, hombros, cabeza, torso).
6. Avatar/sombra del jugador sobre el canvas.
7. Colisiones cuerpo-palabras.
8. Regla de derrota inmediata al tocar el sinónimo correcto.
9. Regla de victoria al eliminar todos los distractores.
10. Estado final con botón `Continuar lectura` que reanuda narración.

## 4) Fuera de alcance MVP
- Multijugador.
- Ranking persistente.
- Ajuste automático por nivel pedagógico avanzado (se deja para Fase 2).

## 5) Máquina de estados (obligatoria)
Estados:
- `instruction`
- `countdown`
- `playing`
- `won`
- `lost`
- `resume_reading`

Transiciones:
- `instruction -> countdown` al pulsar `Iniciar`.
- `countdown -> playing` cuando contador llega a 0.
- `playing -> lost` si colisiona con palabra correcta.
- `playing -> won` si distractores activos = 0 y correcta sigue activa.
- `won|lost -> resume_reading` al confirmar.
- `resume_reading -> closed` al cerrar modal y devolver control a lectura.

## 6) Arquitectura propuesta
### 6.1 Módulos JS
- `LecturasGameModeController`: orquesta apertura/cierre de modal y ciclo de ronda.
- `SynonymRoundBuilder`: construye ronda desde `lectura.sinonimos` + fallback.
- `PoseTrackingService`: webcam + landmarks (pose/hands).
- `CollisionEngine`: colisiones entre segmentos del cuerpo y rects de palabras.
- `GameRenderer`: canvas 2D (video espejo, sombra, palabras, FX, HUD).
- `AudioFeedbackService`: SFX ganar/perder/golpe.
- `NarrationBridge`: pausa/reanuda Gemini Live.

### 6.2 Integración por capas
1. UI (`lecturasGameModeModal`) inicia controlador.
2. Controlador pide ronda a `SynonymRoundBuilder`.
3. Controlador inicia `PoseTrackingService`.
4. Bucle de juego actualiza entidades y colisiones.
5. `NarrationBridge` pausa al entrar y reanuda al salir.

## 7) Diseño de datos
```js
/**
 * Fuente de una ronda
 */
{
  lecturaRef: { id: "abc", coleccion: "lecturasASC" },
  targetWord: "RAPIDO",
  correctSynonym: "VELOZ",
  distractors: ["LENTO", "PIEDRA", "VERDE", "GRANDE"],
  grade: "5",
  difficulty: "normal"
}
```

```js
/**
 * Entidad de palabra en caída
 */
{
  id: "w_12",
  text: "LENTO",
  isCorrect: false,
  x: 420,
  y: 120,
  vy: 86,
  width: 132,
  height: 48,
  active: true,
  hitAt: 0
}
```

```js
/**
 * Estado global del minijuego
 */
{
  mode: "instruction|countdown|playing|won|lost|resume_reading",
  countdown: 3,
  timeMs: 0,
  removedWrongCount: 0,
  totalWrongCount: 0,
  touchedCorrect: false,
  activeWords: [],
  pose: {
    segments: [
      // cada segmento: linea usada para colision
      { ax: 100, ay: 220, bx: 150, by: 260, kind: "leftArm" }
    ],
    joints: [
      // cada joint: círculo para colisión
      { x: 120, y: 210, r: 24, kind: "head" }
    ],
    confidence: 0.81
  }
}
```

## 8) Contratos de integración con narración
Al entrar a juego:
- Si existe lectura activa, ejecutar:
```js
await window.cbControlLecturaGeminiLive({ id, coleccion }, { stop: true });
```

Al terminar ronda y pulsar continuar:
- Reanudar lectura con:
```js
await window.cbLeerLecturaConGeminiLive({ id, coleccion });
```
o usar `cbControlLecturaGeminiLive` según estado previo (`paused/idle`).

Evento interno recomendado:
- `window.dispatchEvent(new CustomEvent("cb:lecturas-game-round-ended", { detail }))`
para telemetría y continuidad pedagógica.

## 9) Detección corporal y cámara (web-only)
Propuesta técnica:
- `getUserMedia({ video: { facingMode: "user", width: 640, height: 480 }, audio: false })`.
- Motor de tracking: MediaPipe Tasks Vision (`PoseLandmarker`, opcional `HandLandmarker`).
- Frecuencia inferencia: 15-24 FPS (separada del render 60 FPS).
- Fallback si no hay cámara/permisos:
  - Mostrar error claro.
  - Botón `Reintentar cámara`.
  - Botón `Salir al modo lectura`.

Mapping mínimo de colisión:
- Círculos: cabeza, torso-centro, muñecas.
- Segmentos: antebrazos y brazos.
- Colisión válida si círculo o segmento intersecta rectángulo de palabra.

## 10) Render y UX visual
Layout dentro del modal:
- Encabezado: palabra objetivo grande.
- Centro: canvas juego (video espejo + palabras).
- Overlay superior: estado y contador.
- Overlay inferior: instrucción contextual.

Estilo:
- Paleta infantil, alto contraste, bordes redondeados.
- Palabra correcta con color único no revelador (mismo estilo base que distractores).
- Efecto hit distractor: pop + partículas + sonido corto.
- `won`: confeti suave + sonido éxito.
- `lost`: shake breve + sonido error.

## 11) Reglas de jugabilidad y balance inicial
- `wrongCount`: 4-6 por ronda.
- `spawn`: 1 palabra cada 450-700ms (jitter aleatorio).
- Velocidad caída inicial: 70-110 px/s.
- Duración máxima ronda: 20s (si expira => `lost` por tiempo).
- Cooldown anti doble golpe por palabra: 180ms.
- Margen top seguro para no spawn encima del mismo carril consecutivo.

## 12) Parsing de sinónimos (fuente pedagógica)
Orden de resolución:
1. `lectura.sinonimos` como arreglo estructurado:
   - `[{ palabra, sinonimos: [] }]`.
2. `lectura.sinonimos` como HTML tabla (`table`).
3. `lectura.sinonimos` como texto libre (`palabra: sinonimo1, sinonimo2`).
4. Fallback local por grado/tema si no hay datos.

Regla de selección:
- Elegir una `palabra objetivo`.
- Elegir 1 sinónimo correcto no ambiguo.
- Excluir distractores que también sean sinónimos válidos.

## 13) Observabilidad y depuración
Exponer en `window` para pruebas automáticas:
- `window.render_game_to_text()`: JSON corto del estado visible.
- `window.advanceTime(ms)`: stepping determinista para test.

Payload mínimo de `render_game_to_text`:
```js
{
  mode: "playing",
  targetWord: "RAPIDO",
  correctWord: "VELOZ",
  activeWords: [{ text: "LENTO", x: 100, y: 250, active: true }],
  wrongRemaining: 3,
  touchedCorrect: false
}
```

## 14) Seguridad, privacidad y permisos
- Cámara solo en contexto del minijuego.
- Detener tracks (`stream.getTracks().forEach(t => t.stop())`) al cerrar modal.
- No persistir video frames.
- Mostrar indicador visible `Cámara activa`.

## 15) Plan de implementación incremental
Fase 1:
- Reemplazar placeholder por shell del juego en modal.
- Implementar máquina de estados + UI.

Fase 2:
- Integrar webcam + dibujo espejo + avatar sombra.
- Integrar caída de palabras y físicas simples.

Fase 3:
- Colisiones cuerpo-palabras + reglas win/lose.
- Integrar pausa/reanudación de narración.

Fase 4:
- Sonidos, partículas, ajuste visual responsive y accesibilidad.
- Pruebas E2E y hardening.

## 16) Criterios de aceptación (DoD)
- Se puede jugar una ronda completa con webcam.
- Perder al tocar el sinónimo correcto funciona siempre.
- Ganar al eliminar distractores funciona siempre.
- Al finalizar ronda, lectura continúa sin recargar página.
- Cierre del modal libera cámara y listeners.
- Sin errores de consola en flujo normal.
