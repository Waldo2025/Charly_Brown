# Baseline de migración a Firebase y Google Cloud

Fecha del inventario: 2026-08-06. Proyecto objetivo: `charly-brown`.

## Invariantes de datos

- Firestore continúa siendo la fuente de verdad. No se renombran ni copian `podcaster_sessions`, `podcaster_scene_library`, `podcaster_music_library` o `podcaster_export_jobs`.
- El bucket existente continúa siendo `charly-brown.firebasestorage.app`; los objetos conservan sus rutas actuales.
- El frontend mantiene compatibilidad con las claves locales `cb_podcaster_sessions_v2` y `cb_podcaster_sessions_v1`.
- El corte de proveedor sólo puede cambiar cómputo, colas y enrutamiento. No puede ejecutar borrados ni backfills destructivos.

## Mapa actual

| Dominio | Implementación actual | Persistencia | Destino |
| --- | --- | --- | --- |
| Sesiones y bibliotecas | Express en `backend/server.js` | Firestore y Storage | Functions Gen2 |
| Gemini, audio e imágenes | Express + Gemini API key | Firestore y Storage | Functions Gen2 + ADC/Vertex AI |
| Veo | Express + procesos asíncronos locales | Firestore y Storage | Functions Gen2 + Cloud Tasks |
| Montaje | BullMQ/Redis + FFmpeg/Playwright | `podcaster_export_jobs` | Cloud Tasks + Cloud Run Job |
| Gemini Live | Token efímero directo al navegador | Estado del navegador | Cloud Run WebSocket proxy + IAM |

## Baseline de validación

- `node --test backend/montage-export/*.test.js backend/podcaster-video-provider.test.js backend/podcaster-video-prompt-translation.test.js`: 71 pruebas verdes.
- `node scripts/test-podcaster-scene-library-list-public.mjs`: verde.
- `node scripts/test-podcaster-cloud-autosave-persists-to-firebase.mjs`: verde.
- `scripts/test-podcaster-montage-export-backend-routing.mjs` está desalineada con la restauración visual previa de `podcaster.html`; falla por un cache-buster esperado antiguo, no por lógica backend.
- FFmpeg/ffprobe no están instalados en el PATH local. La validación de códecs y el smoke export deben ejecutarse dentro de la imagen Cloud Run.

## Riesgos y controles

- `backend/server.js` concentra rutas, proveedores AI y render. Se extraerá detrás de adaptadores manteniendo los contratos HTTP.
- Functions/Hosting no recibirán videos grandes: se usarán sesiones resumibles directas a Storage.
- Los WebSockets Live se aislarán en Cloud Run; Functions sólo emitirá tickets de un uso.
- Ningún redirect de producción se cambiará hasta que los endpoints Google pasen pruebas directas y de preview.
- Los recursos Render permanecerán suspendidos durante el periodo de observación para permitir rollback explícito.

Ejecutar `node scripts/test-google-cloud-migration-session-compatibility.mjs` en cada fase para impedir cambios accidentales de proyecto, colecciones, prefijos o compatibilidad local.
