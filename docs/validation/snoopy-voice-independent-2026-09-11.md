# Snoopy Editor — voces independientes del video

Implementación local, revisión `2026-09-11.snoopy-voice-23`. Sin despliegue.

## Evidencia

En el navegador se inspeccionó «La entrevista Español 1 bloque 2», sesión `session_3gp8dair`. El WAV actual de `row_28bftc8n` en la pestaña publicada medía 9,24 s; otras voces medían 9,52 s. Había elementos con duración física completa pero pausados antes de alcanzar su final. Ese estado aislado no demuestra por sí solo el motivo de la pausa.

Se reprodujo por separado con la función real `buildGeminiDialogueTimelineTrack`: para 9.240 ms a 1,15× se guardaban `durationMs = trimOutMs = 8.035`. El reproductor dividía nuevamente ese recorte entre 1,15: ventana de 6.987 ms, solo 8.035 ms del archivo audible. El ancho del chip, en cambio, usaba la duración física completa. Otra ruta conservaba sin actualizar los recortes del WAV anterior después de regenerar o recibir metadatos.

## Cambio

- Un cálculo compartido conserva `trimInMs`/`trimOutMs` en tiempo del archivo y `durationMs`/`endMs` en tiempo del montaje. La velocidad se aplica una sola vez.
- Las voces nuevas se vinculan a la duración de su fuente (`durationMode: source`). Regenerar o medir otro archivo actualiza esa duración sin desplazar el inicio del chip.
- Recuperación de ventanas automáticas antiguas: cero de entrada, ancla de escena y duración igual al final de recorte, formato emitido por el constructor anterior. No se usa el número 8.000 ni una posición especial para reconocerlas. Los recortes con entrada distinta de cero o marcas explícitas se conservan. Los segmentos importados con recorte y sin ancla se marcan como `trim` antes de normalizar el ancla.
- Timeline, movimiento, transporte y exportación comparten las unidades. El final del montaje incluye voces situadas después del último video. El arrastre de una voz puede extender el montaje.
- La actualización de metadatos sincroniza los snapshots de ambos controladores sin preparar toda la multimedia, hacer seek o alterar el reloj.
- Un seek no selecciona qué voz detener según la escena visual: todas se sincronizan en su intervalo propio.
- Se coordinan las versiones de los módulos modificados, incluido el normalizador compartido generado desde `functions/src/podcaster-media-state.js`.

## Validación

Casos ejecutables en `tests/podcaster-voice-independent-timing.test.mjs`: velocidades 0,5×–10×, audio antes/después de la escena y después del montaje visual, regeneración, idempotencia, recortes explícitos/importados, una voz de 12 s atravesando otra escena y otra voz, duración total y actualización de los controladores sin volver a preparar medios.

Baterías:

```
npm run test:snoopy-media
node --test tests/podcaster-voice-independent-timing.test.mjs tests/podcaster-audio-start-contract.test.mjs tests/podcaster-seek-cache.test.mjs tests/podcaster-playback-continuity.test.mjs
node --test tests/podcaster-voice-independent-timing.test.mjs tests/podcaster-media-selection.test.mjs tests/podcaster-montage-audio-duration-parity.test.mjs tests/podcaster-timeline-interaction-ownership.test.mjs
```

Resultados: 116/116 en la batería principal; 103/103 tras sincronizar los controladores; 50/50 en la pasada final de normalización, independencia de voz, selección de medios, paridad y arrastre. Hay casos compartidos entre las baterías. El chequeo de espacios del cambio afectado pasó; el chequeo global detectó espacios anteriores en `public/vendor/voxeljs.bundle.js`, ajeno a este trabajo.

La batería de paridad incluye render y análisis FFmpeg de una ventana de voz completa. Se verificó sintaxis de los módulos modificados.

## Límite de la comprobación en vivo

Se pudieron leer las duraciones y fuentes reales antes de corregir. La conexión de control de Chrome se desconectó repetidamente y las aperturas posteriores del navegador integrado agotaron su tiempo de espera. No se pudo concluir una reproducción auditiva de la sesión real con la revisión corregida. Las pruebas automatizadas no sustituyen esa comprobación. No se regeneraron audios ni se aplicaron cambios manuales a las escenas de la sesión publicada durante esta revisión.
