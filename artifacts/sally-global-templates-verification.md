# Biblioteca global de plantillas Sally

Implementación local, 8 de septiembre de 2026. Sin publicación de frontend ni reglas.

- Modal nativo desde `.sally-topbar`, con biblioteca, búsqueda, editor HTML, importación, copia, archivo/restauración y vista previa aislada sin scripts ni red.
- Colección `SallyBrownTemplates` independiente del proyecto. Usuarios aprobados con rol pueden consultar/reutilizar; solo el autor puede actualizar/archivar. No hay borrado destructivo ni acceso anónimo.
- Transacciones con versión esperada impiden sobrescribir ediciones concurrentes. Propietario y fecha de creación inmutables. Tamaño de HTML acotado.
- Las plantillas privadas anteriores permanecen privadas: el usuario puede publicarlas conscientemente mediante «Guardar una copia global».
- Elegir una plantilla conserva una copia de su HTML y versión en la conversación destino. La IA recibe esa copia para la propuesta. Seleccionar no modifica Moodle; preparación y aprobación continúan siendo necesarias.
- Los campos `{{contenido}}` se pueden completar con controles de texto para una inserción directa o mediante la solicitud al chat. No se requiere editar JSON.

## Pruebas

Pasaron `test-sally-template-manager.mjs`, `test-sally-template-store.mjs`, `test-sally-conversations.mjs`, `test-sally-redesign.mjs`, `test-sally-chat-routing.mjs` y `test-sally-brown-editor.mjs`.

Emulador Firestore: `PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" firebase emulators:exec --project demo-sally-templates --config sally-template-emulators.json --only firestore 'node scripts/test-sally-template-rules.mjs'`.

Pasaron lectura y listado compartido, denegación anónima/pendiente/sin rol/bloqueado, escritura ajena denegada, propiedad inmutable, versiones, límites, copia, archivo/restauración y revocación de aprobación. Los mensajes PERMISSION_DENIED de la prueba corresponden a los casos negativos esperados.

Capturas revisadas: `sally-template-manager-desktop.png` y `sally-template-manager-mobile.png`.

## Publicación pendiente

Publicar las nuevas reglas de `SallyBrownTemplates` antes del frontend. `firestore.rules` ya contenía cambios ajenos: no publicar el archivo completo sin revisar esos cambios. El script de publicación selectiva de Sally incluye los nuevos módulos. No se modificó Cloud Run, Storage ni los estilos del encabezado y sidebar compartidos. No se ejecutaron cambios en un Moodle real.
