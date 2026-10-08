# PigPen: biblioteca de presets por cuenta

Publicado el 6 de octubre de 2026 en Firebase `charly-brown`.

## Resultado

- Biblioteca privada en `users/{uid}/pigpenExperiencePresets/{presetId}`. Cada documento conserva nombre, configuración, recompensa, extras, imagen, descripción/proporción, salas, preguntas por sala, versión, revisión y fechas de servidor.
- Cuatro predeterminados inicializados una vez con el marcador privado `users/{uid}/pigpenExperienceState/library`. Borrar uno no vuelve a crearlo.
- Recuperación al iniciar sesión y abrir el modal. Caché y preferencias separadas por UID; respuestas pendientes de una cuenta no rehidratan otra.
- Guardar con el mismo nombre normalizado actualiza el mismo ID. Transacciones comparan la revisión y rechazan cambios de otro dispositivo; el borrador permanece disponible.
- Importación explícita de `pigpen.experiencePresets.v1`. Reemplaza predeterminados sin modificar, conserva los personalizados remotos, informa conflictos y datos inválidos y mantiene la clave antigua como respaldo.
- Guardado confirmado solo después del commit. Sin conexión se consulta la caché y se conservan borradores locales; las escrituras requieren conexión y sincronización.
- Aplicar un preset prepara el modal; `Guardar y continuar` sigue siendo necesario para cambiar el escape room.
- Imagen codificada limitada a 350 000 caracteres; documento validado en cliente a 512 000 bytes. Reglas limitan campos y tamaños para impedir documentos arbitrarios.
- No se añadieron Functions, Cloud Run ni cambios en Storage. Esta persistencia sí utiliza lecturas y escrituras normales de Firestore.

## Validación realizada

1. Once pruebas unitarias: guardar/actualizar/rehidratar, ID estable, borrado sin reinicialización, conflictos, UID, respuestas tardías, offline, borradores, importación, respaldo y datos inválidos.
2. Chromium: modal completo, recarga, imagen, descripción/proporción, tipos, extras, cantidades, aplicación explícita, eliminación, fallo de escritura y cambio de cuenta. Ejecutado con archivos locales, preview y producción.
3. Prueba móvil existente del modal: confirmación, persistencia aplicada y temas claro/oscuro.
4. Emulador oficial de Firestore con `@firebase/rules-unit-testing` 4.0.1: adapter/transacciones, recuperación en otro contexto, permisos entre cuentas/anónimo, marcador inmutable y rechazos de estructuras/tamaños inválidos.
5. Firebase real con SDK web 12.7.0, tanto en preview como producción: dos cuentas temporales, guardar/actualizar, recuperación de la misma cuenta en otro contexto de navegador, rechazo a otra cuenta, borrado y ausencia de reinicialización. Se eliminaron cuentas, perfiles y documentos temporales al finalizar. No se generó contenido de IA.
6. Contratos existentes de reglas para escape room/PDF y prueba de roles de modelos. Se corrigieron únicamente dependencias ausentes del fixture de esa última prueba.
7. `security:scan-secrets`, `security:verify-public`, sintaxis y comprobación de whitespace.

La prueba de varios contextos valida recuperación remota; no fue una prueba física en un segundo equipo. La caché/borradores dependen del espacio y permisos del navegador; si fallan, se informa.

## Publicación acotada y reversión

- Reglas privadas revisadas y probadas antes de `firebase deploy --only firestore:rules --project charly-brown`.
- Hosting: seis archivos, sin cambiar configuración y preservando los otros 822 archivos. Se incluyó la corrección previamente solicitada para conservar modelos seleccionados manualmente.
- Preview: https://charly-brown--pigpen-presets-20261006-v0tjkz1o.web.app
- Versión publicada: `sites/charly-brown/versions/76e86cc2f6f42c85`.
- Versión anterior para reversión de Hosting: `sites/charly-brown/versions/ea2aa9ecaddce0fa`. Los datos privados nuevos deben conservarse al revertir Hosting.
- Reglas anteriores: `projects/charly-brown/rulesets/b2467665-37b0-4748-ad4d-493edc96d5c8`. Revertirlas deshabilitaría la persistencia nueva; solo hacerlo con una reversión coordinada del cliente.
- Evidencia de hashes, preservación y reglas: `docs/reports/pigpen-presets-deployment-20261006.json`.

## Repetir pruebas

```sh
npm run test:pigpen-presets
npm run test:pigpen-presets:rules
node --test --test-name-pattern='Configuration modal' tests/pigpen-experience-browser.test.mjs
```

El emulador requiere Java 21 y Firebase CLI; en esta sesión se utilizó un JRE oficial temporal con checksum verificado. Chromium debe estar disponible para Playwright.

Para una prueba remota autorizada con cuentas temporales y limpieza automática:

```sh
PIGPEN_PRESET_BASE_URL=https://charly-brown.web.app node scripts/smoke-pigpen-presets.mjs --execute
```

El modo `--pigpen-presets` de `scripts/deploy-cost-hosting.mjs` reutiliza el despliegue selectivo existente: prepara preview, `--verify` comprueba hashes y prueba de navegador, y `--publish` exige que fuente y versión base sigan coincidiendo.
