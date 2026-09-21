# Sally — integración operativa, 8 de septiembre de 2026

## Estado

Implementación local ampliada; no publicada. No se modificó Moodle durante esta
continuación. El servicio público observado permanece en `sally-browser-00010-r5m`.

## Cambios comprobados

- El compositor principal guarda contexto; los subchats mantienen instrucciones,
  mensajes, borradores, planes y evidencias propios.
- El campo enviado se vacía después de confirmar el guardado. Un error conserva
  el texto y una respuesta tardía no borra texto nuevo.
- Las respuestas completas se presentan recientes primero y son colapsables;
  su estado de expansión se conserva durante el sondeo.
- El modal global gestiona diseños sin aplicar cambios. El selector `+` adjunta
  una copia de la versión de plantilla con vista previa aislada.
- El servidor investiga con herramientas tipadas; las modificaciones requieren
  aprobación del hash concreto del plan y autorización vigente.
- Los estados completos y evidencias de tareas son privados y gestionados por
  servidor. Las reglas generales de Storage ya no conceden acceso alternativo a
  las rutas Sally. Adjuntos normales mantienen el acceso de participantes.
- El contexto puede recuperar observaciones anteriores de la misma tarea; proponer
  escrituras exige volver a leer el destino, no solo utilizar evidencia heredada.
- Las preguntas de un cuestionario con intentos no se modifican estructuralmente.
- No se añadieron estilos al encabezado ni sidebar compartidos.

La exclusión del fallback se verificó con el emulador: las reglas coincidentes
se suman, por lo que una regla específica no revoca un permiso general.
[Referencia oficial de Firebase](https://firebase.google.com/docs/rules/rules-behavior).

## Pruebas realizadas

| Prueba | Resultado |
| --- | --- |
| `backend/sally`: `npm test` | 5 pruebas aprobadas; incluye ciclo HTTP con navegador simulado, aprobación, ejecución, aislamiento y revocación |
| `scripts/test-sally-tasks.mjs` | Aprobada; navegador local, compositores, fallos, texto concurrente, plantillas y aislamiento |
| `scripts/test-sally-template-manager.mjs` | Aprobada; modal solo diseño, copias, vista previa segura y responsive |
| `scripts/test-sally-conversations.mjs` | Aprobada; historial íntegro, versiones, borradores, respuestas tardías y drawer |
| `scripts/test-sally-remote.mjs` | Aprobada; autenticación, comandos e interacción ordenada |
| `scripts/test-sally-task-rules.mjs` | Aprobada con Firestore/Storage emulados; servidor exclusivo, participantes, negativos y adjuntos |

Capturas: `sally-task-panel-desktop.png`, `sally-task-panel-mobile.png`.

## Pendiente — no presentar como terminado

- Publicación coordinada de reglas Sally, permisos mínimos del servicio, backend
  y frontend. No aumentar capacidad ni desplegar archivos ajenos.
- Certificar escrituras a través de Sally, no mediante ediciones manuales externas.
- Verificar contenido guardado y orden real de Descripciones nativas, incluyendo
  inserciones múltiples y recuperación sin duplicados.
- Verificar privacidad de notas condicionadas en el Moodle autorizado.
- Lectura efectiva de archivos binarios/imágenes adjuntos: hoy son referencias.
- Ampliar pruebas de reinicio, concurrencia y restauración ante fallos de persistencia.

Las pruebas locales de ejecución utilizan dobles del controlador. No demuestran
compatibilidad de escritura con un Moodle real ni habilitan el curso 496.
