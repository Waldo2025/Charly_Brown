# Producción de actividades científicas mediante MCP

## Flujo y contratos

El editor crea una ejecución con `POST /api/science-activities/production/plan`. El planificador trabaja en la cola y deja `awaiting_approval`. El docente edita título, objetivo e instrucciones; `/revise` incrementa la revisión e invalida la aprobación anterior. `/approve` y `/start` reciben esa revisión. Ningún ejecutor produce actividades antes de aprobarla.

El coordinador ejecuta agentes MCP internos con una sola herramienta autorizada por rol. Pedagogía, niveles, modelos e imágenes forman un grafo de dependencias; la validación científica y el ensamblado esperan sus resultados. Los límites transaccionales iniciales son cuatro trabajos de texto y dos de imagen, compartidos entre ejecuciones. Cloud Tasks puede entregar mensajes duplicados; los leases, tokens y epochs descartan resultados obsoletos. La recuperación programada reencola tareas pendientes o vencidas.

Los documentos `ScienceProductionRuns`, sus tareas y `ScienceProductionControl` son exclusivos del backend (las reglas actuales deniegan las colecciones no declaradas). Los resultados usan referencias Storage y el contrato de sesiones anterior. Una imagen obligatoria fallida deja la ejecución pendiente de atención; no existe finalización silenciosa con una imagen faltante. Los resultados parciales pueden revisarse antes del resultado final.

## MCP externo y permisos

URL: `https://charly-brown.web.app/api/science-activities/mcp`. Las herramientas `list_science_topics` y `get_activity_template` permiten descubrir el catálogo; `plan_activity` puede derivar la actividad base sin exigir al cliente que conozca el esquema interno.

- Descubrimiento del recurso: `/.well-known/oauth-protected-resource/api/science-activities/mcp`.
- Descubrimiento de autorización: `/.well-known/oauth-authorization-server`.
- Registro de clientes públicos, PKCE S256 y redirecciones HTTPS o loopback exactas. No se admiten clientes confidenciales ni redirecciones comodín.
- Consentimiento en `science-mcp-consent.html`, autenticado mediante Firebase. Permisos: `science:read`, `science:plan`, `science:execute`.
- Tokens opacos almacenados como hashes, acceso de una hora, renovación rotativa con máximo de 30 días y revocación de la familia completa.
- La identidad del usuario siempre se obtiene del token; nunca de los argumentos de herramientas.

`SCIENCE_PUBLIC_ORIGIN` permite cambiar el origen anunciado en previews y local. Debe coincidir con el host público del cliente; no se deriva del encabezado Host. Firebase Hosting incluye las rutas de descubrimiento. El consentimiento usa los dominios Firebase Auth ya autorizados.

El smoke externo, de sólo lectura, es `node scripts/smoke-science-mcp.mjs --url https://HOST/api/science-activities/mcp`, con `SCIENCE_MCP_ACCESS_TOKEN` en el entorno. No imprime el token. La comprobación real desde Codex requiere publicar los endpoints y conectar esa URL desde un cliente con OAuth; las pruebas locales validan el SDK y el flujo HTTP, no constituyen una conexión a producción.

## Simuladores generados

Un candidato contiene `source`, `controls`, `tests`, título, descripción y límites didácticos. Debe exportar funciones declaradas `measure(params)` y `draw(ctx,state,width,height)`; no necesita dependencias externas. Se requieren al menos tres casos numéricos. Los valores esperados permanecen en el proceso de validación: el iframe recibe sólo los parámetros y devuelve mediciones; el código generado no declara si sus pruebas pasan. El catálogo fija versión y hash. Se incluyen imágenes comprimidas dentro del documento aprobado para exportar sin red.

El código sólo se ejecuta en Chromium dentro de un iframe de origen opaco (`sandbox=allow-scripts`, sin `allow-same-origin`). La política del documento bloquea conexiones, formularios, ventanas y frames; el servicio de pruebas también bloquea solicitudes y WebSockets. El contenedor no debe tener permisos de proyecto. No se ejecuta código candidato en Node ni en el DOM del editor. El hash verifica integridad; la autorización reside en el backend.

El autor puede inspeccionar y solicitar pruebas; sólo un administrador validado contra `users/{uid}` puede aprobar el catálogo. Una aprobación exige evidencia positiva para el mismo hash. La revisión científica de los casos y el código sigue siendo responsabilidad de esa aprobación humana: que una prueba generada pase no demuestra por sí solo validez científica. Rechazar un candidato también lo retira del catálogo para nuevas actividades; no modifica silenciosamente las exportaciones ya realizadas.

## Habilitación de infraestructura

No ejecutar una publicación general de los cambios locales ajenos. Preparar un despliegue revisado de estas funciones y sus dependencias:

1. Crear o actualizar la cola `science-production` en `us-central1`, con máximo 6 despachos simultáneos. Dar `roles/cloudtasks.enqueuer` sobre esta cola a las identidades `charly-functions-core` y `charly-functions-ai`; ambas requieren `roles/iam.serviceAccountUser` sobre `charly-tasks-invoker` para emitir las tareas OIDC.
2. Publicar el índice `ScienceProductionRuns(ownerId ASC, updatedAt DESC)` y esperar a que esté listo. Publicar `scienceActivitiesApi`, `dispatchScienceProductionTask` y `recoverScienceProductions`. El worker admite exclusivamente `charly-tasks-invoker`; la API conserva Firebase/OAuth y los controles de propiedad. La cuenta AI requiere los permisos Vertex y Storage que ya utiliza el proyecto.
3. Construir el contenedor desde la raíz: `docker build -f cloud-run/science-sandbox/Dockerfile -t SCIENCE_SANDBOX_IMAGE .`. Publicarlo en Cloud Run como servicio privado, sin acceso público, con concurrencia 1, CPU 1, memoria 1 GiB, timeout 30 segundos y máximo 2 instancias. Usar una cuenta `science-sandbox` sin roles de proyecto. Sólo `charly-functions-core` y `charly-functions-ai` necesitan `roles/run.invoker` sobre ese servicio. No montar secretos ni volúmenes.
4. Configurar `SCIENCE_SANDBOX_URL` en las funciones API/worker y `SCIENCE_PUBLIC_ORIGIN` cuando el host difiera del predeterminado. Sin sandbox configurado, los candidatos quedan pendientes y la aprobación no puede omitir las pruebas.
5. Configurar TTL de `ScienceOAuth.expiry` para limpiar autorizaciones y tokens expirados (el código verifica expiración aunque TTL aún no se haya ejecutado).
6. Ejecutar `npm run build:science`, publicar los recursos de ciencia y las reglas Hosting revisadas primero en preview. Probar generación real con Vertex, guardado, recuperación, exportación offline y conexión OAuth antes de habilitar producción.

`SCIENCE_PRODUCTION_ENABLED=false` detiene nuevas planificaciones y despachos conservando consultas y cancelación; al volver a habilitarlo, la recuperación retoma las tareas pendientes. No sustituye los resultados por el generador anterior.

El backend local reutiliza exactamente los módulos Functions. `SCIENCE_LOCAL_WORKER=true` habilita despacho local con recuperación cada minuto; usarlo sólo con el entorno de datos destinado a desarrollo. Sin esa opción, el despacho usa Cloud Tasks. El sandbox puede probarse localmente con `node scripts/test-science-candidate-sandbox.mjs` sin desplegar.

## Verificación y operación

- `npm run test:science-production`: contratos, concurrencia, leases, permisos, OAuth, aprobación, interfaz y aislamiento Chromium.
- `npm run build:science`: reconstruye los bundles del editor y exportación.
- Consultar el informe `science-simulator-audit.md` para la matriz de modelos y pruebas científicas.
- Inspeccionar estados `needs_attention`, intentos, edad de leases, profundidad de la cola, errores Vertex y memoria del sandbox. No registrar prompts completos, respuestas educativas ni tokens en logs de operación.
- Reversión: restaurar los recursos web revisados y detener despachos de la cola. Conservar ejecuciones, candidatos y sesiones; no se requiere migración destructiva.

Estado del trabajo: implementación y verificación local. El despliegue, las cuotas reales de proveedores y el cliente Codex remoto requieren una validación posterior sobre el entorno publicado.

Resultados locales del 24 de septiembre de 2026:

- Producción/MCP/OAuth/interfaz: 47 pruebas aprobadas; aislamiento Chromium y rechazo de evidencia falsificada aprobados.
- Contratos científicos: 192 pruebas aprobadas, incluidos los 180 perfiles y referencias numéricas independientes.
- Infraestructura afectada: 4 contratos aprobados, incluida la identidad OIDC de cada worker privado.
- Exportación: prueba del ZIP con reproducción offline por `file://` aprobada; integración del iframe generado aprobada.
- Regresión estática ampliada: 234 de 235 pruebas aprobadas. El único fallo preexistente está en `scripts/test-science-progressive-startup.mjs:68`: exige `Promise.resolve(fallbackVersion)` en `cache-version-loader.js`, cuyo contenido de HEAD ya usa la consulta a `version.json`. Ninguno de esos dos archivos se modificó en esta implementación.

La matriz de navegador y teclado tiene su evidencia detallada en el informe de simuladores. No se ejecutaron llamadas de generación pagadas ni se publicaron servicios o cambios de datos en la nube.
