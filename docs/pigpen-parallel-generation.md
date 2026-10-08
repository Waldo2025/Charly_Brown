# PigPen: generación persistente en paralelo

El editor y `/api/pigpen/mcp` utilizan el mismo coordinador. Enriquecer el objetivo crea sólo el plan maestro, el reparto curricular, las transiciones y los fragmentos de la clave final. Generar utiliza ese plan para crear las salas, sus imágenes y sus revisiones.

## Ejecución

- Hasta cuatro tareas de texto y dos imágenes simultáneas, con permisos de ejecución compartidos en Firestore.
- Una sala puede empezar sus imágenes mientras otras siguen redactándose.
- Cada revisor recibe la lectura, actividades e imágenes reales comprimidas. Resuelve las actividades sin ver la clave privada; el servidor compara su solución con el contrato jugable.
- Una revisión rechazada produce una reparación puntual y una segunda revisión. Si persisten defectos, la ejecución requiere atención. Reanudar permite otra ronda conservando las salas aprobadas.
- Los resultados se guardan en Storage y las tareas en Firestore. Cerrar el navegador no cancela el trabajo. Las respuestas tardías de tareas canceladas no se aplican.
- Sólo 429 y 503 inequívocos de texto se reintentan automáticamente, con espera y capacidad reducida ante cuota. Imágenes con error 5xx y resultados inciertos requieren reanudación explícita.
- El resultado no reemplaza un tema editado durante la generación. Se conserva como candidato en la ejecución. Los recursos existentes del mismo tema se reutilizan cuando el contrato sigue siendo compatible.

## Herramientas MCP

POST `/api/pigpen/mcp`, con `Authorization: Bearer <Firebase ID token>`:

`plan_objective`, `generate_escape_room`, `get_generation`, `cancel_generation`, `resume_generation`, `retry_failed`.

Las herramientas de inicio requieren `sessionId`, `topicId`, `config` e `idempotencyKey`. Aceptan `planRunId` y `reuseBlueprint`. No conceden acceso a sesiones de otro propietario.

## Desarrollo y validación

`npm run build:pigpen-generation` genera el núcleo Node desde las funciones puras del editor y sus contratos compartidos. `--check` detecta diferencias sin escribir.

`npm run test:pigpen-generation` cubre el coordinador, límites de concurrencia, cancelación, expiración, cuota, conflictos con ediciones, revisión independiente y paridad REST/MCP. Las pruebas REST necesitan un puerto local temporal.

`npm run dev:pigpen-generation` sirve el editor y los workers en `127.0.0.1:8793`. Firebase Admin utiliza las credenciales locales configuradas y Vertex utiliza la sesión existente de `gcloud`. Usa colecciones `PigPenLocalGenerationRuns` y `PigPenLocalGenerationControl`; las sesiones de escape room y Storage siguen siendo reales, por lo que deben seleccionarse borradores de prueba.

## Producción

Funciones: `pigpenGenerationApi`, `dispatchPigPenGenerationTask` y `recoverPigPenGenerations`, región `us-central1`. Cola Cloud Tasks: `pigpen-generation`, con hasta seis despachos simultáneos. El worker sólo admite la identidad `charly-tasks-invoker` configurada en el proyecto.

El recuperador ejecuta cada minuto los trabajos pendientes. El control de capacidad real está en Firestore, no en el número de instancias HTTP.

`node scripts/deploy-pigpen-generation-hosting.mjs` prepara y muestra una publicación limitada. `--publish` publica únicamente los archivos PigPen seleccionados y sus nuevas rutas, conservando el resto de la versión vigente. El script se detiene si detecta otro despliegue concurrente.

## Caso de aceptación

Matemáticas, Secundaria, Tercero, trimestre 2, tema 2: **Congruencia y semejanza de triángulos**. Fuente autorizada: “Escape Rooms Aprende 2026-2027”, hoja “Escape Rooms Español”, fila 23. Configuración de la fila: tres salas, cuatro preguntas por sala, quince minutos, narrativa Olimpiada matemática, estilo Isométrico 3D.

La prueba debe comprobar planificación separada, redacción simultánea, imágenes, revisión independiente, persistencia al recargar, solución de las actividades y resultado final, primero local y después en producción.
