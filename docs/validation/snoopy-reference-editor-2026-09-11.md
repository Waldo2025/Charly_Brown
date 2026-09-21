# Edición de referencias en Snoopy Editor

Implementación local. Revisión de recursos: `2026-09-11.snoopy-reference-edit-2`. Sin despliegue.

## Comportamiento

- Pulsar una imagen de referencia de escena abre el visor existente con «Editar imagen» y navegación entre las referencias de esa escena.
- Dentro del mismo modal: instrucciones para la imagen completa, lápiz/marcador por zonas, deshacer, limpiar, edición de texto integrada y composición de texto exacto.
- Reutiliza `imagecreator/api.js`, `attachments.js`, `region-editor.js`, `payloads.js`, `constants.js` y `text-overlay.js`. El editor de regiones admite uso incrustado; Image Creator conserva su comportamiento predeterminado.
- Original y resultado se comparan antes de «Usar como referencia». Generar una edición no modifica la escena.
- El resultado pendiente se conserva en IndexedDB por cuenta, sesión, versión y escena, y se recupera al reabrir la galería. Una nueva generación en esa escena sustituye su borrador pendiente anterior. Si falla la caché, el visor informa que se debe descargar el resultado antes de recargar.
- El guardado carga una imagen independiente y confirma una transacción de Firestore antes de cambiar la selección local. Reintentar el mismo trabajo reutiliza el recurso subido.
- Conserva la imagen original y hasta 19 referencias históricas adicionales. «Restaurar original» ofrece una comparación y requiere aplicar la restauración.
- Protege la referencia de origen mediante identidad de recurso, revisión y fecha de modificación; contempla normalización de rutas Storage y sesiones antiguas sin identificador de versión.
- Las referencias se incluyen en las instantáneas y la serialización de cada versión. Solo se actualiza el inspector tras aplicar; no se invoca sincronización, invalidación ni seek del reproductor.

## Verificación

104 pruebas aprobadas en la batería afectada. Incluye 17 casos nuevos de selección de referencias, guardado, conflictos, revisión, conservación del original, normalización, versiones y serialización; pruebas existentes de medios, referencias, persistencia, arranque, seek y herramientas de Image Creator. Los 17 casos nuevos se repitieron después de coordinar las versiones de importación y pasaron.

Comando de la batería:

```sh
node --test tests/podcaster-reference-edit.test.mjs tests/podcaster-media-selection.test.mjs tests/podcaster-row-reference-upload-gating.test.mjs tests/podcaster-row-reference-background-processing.test.mjs tests/podcaster-row-reference-folder-upload.test.mjs tests/podcaster-row-reference-preserve-existing-scenes.test.mjs tests/podcaster-seek-cache.test.mjs tests/podcaster-cloud-session-dialogue-video-payload.test.mjs tests/podcaster-video-mode-persistence.test.mjs tests/podcaster-session-store-cloud-priority.test.mjs tests/podcaster-bootstrap-order.test.mjs scripts/test-imagecreator-region-editor.mjs scripts/test-imagecreator-text-overlay.mjs scripts/test-imagecreator-payloads.mjs scripts/test-imagecreator-quality-contract.mjs
```

Verificación en navegador:

- Sesión `session_3gp8dair`, escena 3: apertura del modal desde su referencia real, edición general y dibujo con marcador; el lienzo decodificó la imagen de 1280 × 720.
- Una solicitud real al servicio de edición terminó y mostró original/resultado. Se pidió aumentar ligeramente la iluminación conservando personajes, composición y texto. Se dejó como resultado pendiente; no se pulsó «Usar como referencia» en la sesión del usuario.
- Fixture aislada con dos referencias: fallo de guardado dejó `generationCalls=1`, `writes=0` y ambas selecciones originales. Al cerrar, reabrir y reintentar, quedó `generationCalls=1`, `writes=1`; la segunda referencia permaneció intacta.
- Tras recargar la fixture se conservó la selección editada. Restaurar el original produjo cero generaciones nuevas y mantuvo la segunda referencia.
- Se inspeccionó el modo estrecho del modal sin desbordamiento horizontal interno. El navegador aplicó un ancho efectivo CSS de 520 px al solicitar 390 px, por su escala existente; no se afirma validación exacta a 390 píxeles CSS.
- El navegador dejó de responder al intentar abrir la revisión final de caché. La revisión visual fue sobre la implementación anterior a ese último cambio de versión y a algunos ajustes de compatibilidad. Los archivos finales pasaron comprobación de sintaxis; no se probó un guardado real en Firestore de la referencia del usuario. La transacción real del controlador se ejecutó en pruebas con dependencias simuladas.

Para repetir la fixture, ejecutar `node scripts/serve-snoopy-reference-qa.mjs` y abrir `http://127.0.0.1:5011/qa`. No usa sesiones del usuario ni solicita generaciones reales. El código de la fixture queda fuera de `public`.

## Límites

Los trazos son una guía visual para el modelo, no una máscara que garantice invariancia de cada píxel. La comparación permite revisar el cambio. El resultado pendiente se conserva en el navegador donde se generó; una generación todavía en curso no sobrevive a la recarga de la página. Los videos existentes conservan su selección; la imagen editada se utiliza en futuras generaciones de esa escena.
