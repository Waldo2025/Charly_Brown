# Snoopy Editor: validación local — 10 de septiembre de 2026

Implementación local, revisión `snoopy-media-21`; sin despliegue ni generación facturable. Se aplicó a la sesión de prueba un video ya generado de la escena 3 y se guardó en Firebase la activación de Gemini mediante los controles del editor.

## Cambios implementados

- Selección de medios compartida entre navegador y Functions, con sesión, versión, escena y revisión de partida. Una regeneración puede sustituir un clip manual; los resultados antiguos no pueden sobrescribir una selección posterior. Aplicación idempotente y errores de guardado explícitos.
- Actualización conjunta de selección, tipo visual, metadatos y timeline; conservación del material anterior y de las versiones generadas. Los candidatos que fallan al aplicarse quedan disponibles para reintentar sin generar otra vez.
- Normalización común de referencias, claves locales, fechas, posiciones y recortes. Ninguna corrección automática por coincidir con 1.000 ms. El recorte editorial no crece por la duración física del audio.
- El arrastre del playhead difiere la preparación del preview hasta soltarlo. Se eliminaron los precalentamientos globales desde la navegación del timeline. La hidratación completa, incluidas las lecturas de IndexedDB, comparte una sola promesa por recurso.
- Precarga y reproducción comparten la preparación de cada superficie. Las recuperaciones por canplay no pueden competir con una transición o el arranque de voz. Un fotograma anterior durante seek no rechaza el video; los medios activos confirman play antes de reanudar el reloj.
- Soportes antes de la aplicación, errores de carga propagados y revisión coordinada para los módulos de medios. Nombre visible Snoopy Editor; rutas conservadas.

## Evidencia de navegador

Sesión autenticada `La entrevista Español 1 bloque 2`, `session_3gp8dair`, en localhost:5010.

1. Antes de las correcciones se reprodujo una detención alrededor de 1,4–1,5 s. El diagnóstico identificó dos propietarios simultáneos del arranque de video (voz y recuperación de canplay).
2. La comprobación ampliada encontró carreras adicionales de preparación en los cortes posteriores. Se corrigieron y se añadieron pruebas ejecutables para ambas carreras.
3. Con la revisión corregida se observó reproducción activa a 39,7 s, superando los cortes problemáticos, y retorno al inicio. La observación fue por muestras; no constituye una medición continua de cada fotograma durante los 112 s.
4. Se verificó por separado la salida de biblioteca: transporte a 1:44,6, video no pausado, readyState 4, fuente blob local y reproducción avanzada a 1,75 s del archivo.
5. Seek manual a 11,7 s: las fuentes de audio permanecieron idénticas y el overlay global de carga siguió oculto. Esto verifica conservación de identidad; la ausencia de descargas duplicadas se comprueba también en las pruebas de hidratación compartida.
6. Chromium aislado con medios reales: primer offset de audio 0, sin activación anticipada, pausa en el recorte y espera de fotograma pausado de aproximadamente 30 ms. El loader se probó retrasando un soporte requerido.

No se ejecutó una regeneración facturable contra el worker publicado. Los casos de selección, conflicto, cancelación, cambio de versión, fallo de transacción y recepción repetida se validaron con el código real y dependencias de base de datos simuladas.

## Pruebas

- `npm run test:snoopy-media`: 116 aprobadas, 0 fallidas (revisión 21). Registro: `/tmp/snoopy-media-21-tests.log`.
- Persistencia seleccionada: 8 aprobadas (filtros/versiones y guardado de música). Registro: `/tmp/snoopy-session-18-tests.log`. Se sustituyeron dos comprobaciones de texto por transacciones y restauraciones ejecutables del session store.
- Verificación anterior de backend seleccionado: 17 aprobadas (alineación de voz, estado de trabajos, identidad de Storage, proxy y audio de exportación).
- Verificación anterior de sintaxis: 78 archivos JavaScript sin errores; comprobados nuevamente los módulos modificados de selección, generación, reemplazo, payload, session store y reproducción. `git diff --check` del ámbito afectado sin errores.
- Verificación anterior de Chromium aislado: `node scripts/test-snoopy-media-browser.mjs`; evidencia en `artifacts/snoopy-media/chromium.json`.

Última batería general anterior a estas correcciones (no repetida completa): `tests/podcaster*.test.mjs`, 380 casos, 351 aprobados y 29 fallidos, sin cancelaciones. La batería no está completamente verde.

## Verificación del reemplazo y Gemini en la sesión real

- El payload omitía `activeThreadId` y `threads`. Se guardan ahora las versiones y sus selecciones; se admite el documento antiguo que solo contiene la versión raíz, conservando los controles de revisión y eliminación.
- La comparación de selección trataba una ruta relativa y la misma ruta `gs://bucket/...` como archivos distintos. La identidad canónica reconoce ambas formas y las URL de Storage; conserva la separación entre buckets y recursos.
- Se eligió expresamente `700a2a6f-9df7-4885-aea8-d01d2ecc21f4.mp4` en Reemplazar escena para `row_28bftc8n`. La aplicación devolvió `applied`, el modal cerró y apareció «Escena 3 lista». Se guardó la sesión y se cerró/reabrió el navegador. La lectura de Firestore y el estado cargado coinciden en archivo y revisión `797897d8-4d7e-43ad-af22-f1ebb7140af0`. No fue necesario generar otro video.
- Gemini estaba guardado con `enabled:true`, pero al cargar una ficha provisional normalizada con `enabled:false`, segmentos vacíos y sin fecha, la combinación conservaba los segmentos y anulaba su activación. La recuperación ahora conserva la pista guardada. Las pistas con una desactivación explícita y contenido siguen respetándose.
- Al reabrir, tanto Firebase como la sesión cargada conservaron las 14 posiciones: 1590, 8272, 16132, 24158, 32456, 40000, 48386, 56185, 63020, 71310, 79239, 87099, 95020 y 105020 ms. La activación y la fecha de la pista también coincidieron.
- Aplicar volumen positivo reactiva una pista desactivada, incluso si ya mostraba 100%. Confirmar solo volumen no cambia alineación, posiciones, recortes ni velocidades por escena. Abrir el control respeta un volumen de 0.
- La sincronización de audio se ejecuta antes del trabajo de video/interfaz. La corrección de desfase usa el reloj actual, no la última posición pintada; las búsquedas en curso y `play()` pendiente no se reemplazan en cada tick. Activar una voz ya preparada no reposiciona la música.

La prueba completa con revisión 20 recorrió los 112000 ms en 114196 ms de reloj real, con las 14 voces activas, volumen 1, sin mute y tiempo de fuente avanzando. No hubo búsquedas hacia atrás de Gemini. Se registraron cuatro esperas de 155, 231, 341 y 214 ms (tres de preparación de voz y una recuperación de video). La última recuperación reposicionó la música 1,100 s hacia atrás por usar el cursor pintado. La revisión 21 corrige esa captura usando el reloj actual y pasa una prueba ejecutable de esa demora. No se atribuye la reproducción completa de la revisión 20 a la revisión 21 ni se certifica continuidad perfecta de todos los fotogramas. La audibilidad por los altavoces del usuario no fue confirmada; la verificación observada es la de los elementos multimedia del navegador.

Durante el guardado se observó `QuotaExceededError` en el respaldo de ajustes musicales de `localStorage`; el guardado de Firebase sí se completó. No se borraron datos para liberar espacio. La biblioteca conserva el video creado, pero el respaldo local de ajustes y candidatos pendientes puede seguir fallando si el almacenamiento está lleno.

## Casos pendientes de la batería general

Los fallos siguientes quedan registrados, no convertidos en éxitos ni ocultados. Las comprobaciones textuales no prueban el comportamiento actual; los fallos de comportamiento de exportación, overlays y stop-motion requieren una revisión específica adicional.

| Prueba | Clasificación | Archivo |
|---|---|---|
| audio-only timeline reorder compacts Gemini chips to each scene start without inherited gaps | Semántica de reordenamiento de pistas | `tests/podcaster-audio-only-reorder.test.mjs` |
| placeBrandOverlay renders brand image from assetUrl even when assetPath is missing | Render de logo de exportación | `tests/podcaster-brand-overlay-browser-render.test.mjs` |
| tests/podcaster-gemini-layout-stability.test.mjs | Carga o aserciones del archivo de prueba; requiere actualización/revisión | `tests/podcaster-gemini-layout-stability.test.mjs` |
| shared Ken Burns pan effects finish at the top-aligned base frame | Contrato textual desactualizado | `tests/podcaster-image-replacement-layout.test.mjs` |
| inspector row uses podcast reference sections only outside pure video mode | Contrato textual desactualizado | `tests/podcaster-inspector-video-mode-reference-visibility.test.mjs` |
| syncOverlay renders karaoke spans when the selected row has word timings | Fixture de overlay sin estado de constructor | `tests/podcaster-karaoke-overlay.test.mjs` |
| syncOverlay passes selected karaoke highlight style into preview markup | Fixture de overlay sin estado de constructor | `tests/podcaster-karaoke-overlay.test.mjs` |
| syncOverlay treats editor-preview local time as scene-local when the clip starts later in the timeline | Fixture de overlay sin estado de constructor | `tests/podcaster-karaoke-overlay.test.mjs` |
| syncOverlay falls back to plain subtitle text when the audio clip lacks word timings | Fixture de overlay sin estado de constructor | `tests/podcaster-karaoke-overlay.test.mjs` |
| normalizePodcastVideoConfig migrates legacy Veo 2.0 to Veo 3.1 Standard | Migración automática de catálogo que el código ya no fuerza | `tests/podcaster-media-load-mode.test.mjs` |
| on-screen text track editor owns modal and overlay editing functions | Contrato textual desactualizado | `tests/podcaster-modular-extraction-ownership.test.mjs` |
| normalizeMontageRenderMode defaults unknown values to browser | Contrato de exportación / ASS | `tests/podcaster-montage-render-surface.test.mjs` |
| resolveRuntimeMontageRenderMode downgrades browser exports when Chromium is unavailable | Contrato de exportación / ASS | `tests/podcaster-montage-render-surface.test.mjs` |
| resolveRuntimeMontageRenderMode preserves browser when Chromium is available | Contrato de exportación / ASS | `tests/podcaster-montage-render-surface.test.mjs` |
| resolveRuntimeMontageRenderMode preserves explicit ffmpeg fallback | Contrato de exportación / ASS | `tests/podcaster-montage-render-surface.test.mjs` |
| buildMontageRenderAssContent builds karaoke ASS from canonical payload | Contrato textual desactualizado | `tests/podcaster-montage-render-surface.test.mjs` |
| tests/podcaster-prompt-paste.test.mjs | Carga o aserciones del archivo de prueba; requiere actualización/revisión | `tests/podcaster-prompt-paste.test.mjs` |
| tests/podcaster-scene-video-request-reference-context.test.mjs | Carga o aserciones del archivo de prueba; requiere actualización/revisión | `tests/podcaster-scene-video-request-reference-context.test.mjs` |
| el contrato integra persistencia, playback y una sola cadena de movimiento backend | Contrato textual desactualizado | `tests/podcaster-stop-motion.test.mjs` |
| preflight acepta secuencias completas y señala el frame exacto que falta | Validación de exportación stop-motion | `tests/podcaster-stop-motion.test.mjs` |
| los nombres Unicode se serializan como headers ASCII y el backend los recupera | Contrato textual desactualizado | `tests/podcaster-stop-motion.test.mjs` |
| las imágenes locales se limpian y redimensionan antes de subirlas | Contrato textual desactualizado | `tests/podcaster-stop-motion.test.mjs` |
| editor, persistencia temporal y export respetan el mapa musical | Contrato textual desactualizado | `tests/podcaster-stop-motion.test.mjs` |
| video-player usa el mismo recorrido Ken Burns completo que el editor | Contrato textual desactualizado | `tests/podcaster-stop-motion.test.mjs` |
| el nodo visible recibe la geometría Ken Burns y el modal rehidrata una imagen individual | Contrato textual desactualizado | `tests/podcaster-stop-motion.test.mjs` |
| session rail module owns rail filters, archive toggle, and card actions | Contrato textual desactualizado | `tests/podcaster-studio-shell-smoke.test.mjs` |
| playback stop guards timeline stage sync when no session is active | Contrato textual desactualizado | `tests/podcaster-studio-shell-smoke.test.mjs` |
| podcaster.js imports and instantiates timeline clip duration API | Contrato textual desactualizado | `tests/podcaster-timeline-clip-duration-ownership.test.mjs` |
| tests/podcaster-veo-reference-action-and-video-player.test.mjs | Carga o aserciones del archivo de prueba; requiere actualización/revisión | `tests/podcaster-veo-reference-action-and-video-player.test.mjs` |

## Mantenimiento

`functions/src/podcaster-media-state.js` es la fuente canónica. Ejecutar `npm run build:podcaster-media-state` tras cambiarla; la prueba de selección comprueba que la distribución del navegador coincide exactamente.

Las revisiones de importación de los módulos de medios deben coincidir con el fallback del cache-version-loader. La prueba de versiones comprueba este contrato sin depender de un número antiguo fijo.
