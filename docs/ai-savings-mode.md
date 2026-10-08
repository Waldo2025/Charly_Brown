# Modo de ahorro de IA

El header compartido lee `GET /api/savings/policy`. Solo un usuario con `users/{uid}.role == "admin"` puede cambiar el nivel mediante `PUT /api/savings/policy` con `level: "off" | "medium" | "high" | "ultra" | "auto"`. El valor inicial es `off`; las cuotas se registran desde que se activa uno de los niveles. La respuesta distingue `mode` (`manual` o `auto`) y `level` (nivel efectivo), que es el mismo valor usado por cuotas y reglas de Firestore.

En modo automático, la facturación mensual del proyecto en MXN determina el nivel: menos de $2,000, `off`; desde $2,000, `medium`; desde $3,500, `high`; desde $5,000, `ultra`. Si falta la lectura del mes actual, se aplica `ultra` como protección, incluso al cambiar de mes. La primera lectura del mes nuevo puede reducir el nivel. En `ultra` no se aceptan nuevas generaciones de Veo; los trabajos admitidos antes del cambio pueden continuar. Las opciones manuales fijan su propio nivel y no cambian cuando llega un mensaje de facturación.

Las cuotas diarias usan `America/Cancun` y se guardan en `savings_daily_quotas`. Las esperas de Veo se guardan por usuario en `savings_veo_cooldowns`, de modo que abrir otra sesión o pestaña no acorta la espera. Los documentos de control, cuotas, permisos y facturación son de escritura exclusiva del servidor.

## Facturación

1. Verificar que la cuenta de Cloud Billing del proyecto `charly-brown` facture en MXN.
2. Para el objetivo de MXN 7,000 mensuales de Vertex AI, crear un presupuesto **solo de alertas**, mensual, limitado al proyecto `charly-brown` y al servicio Vertex AI, con la misma base de costos que se quiera comparar con el límite. Conectarlo al tópico Pub/Sub `charly-savings-billing`. Este presupuesto complementa el límite de gasto existente; no se debe editar ni levantar ese límite durante la conexión.
3. Configurar `SAVINGS_BILLING_BUDGET_ID` en el runtime de la función `recordSavingsBilling` con el ID exacto de ese presupuesto. Dar a Cloud Billing permiso para publicar en el tópico y a la función permiso para escribir el documento `savings_billing/current`.
4. Probar un mensaje de Pub/Sub con `costAmount`, `costIntervalStart` y `currencyCode: "MXN"`. La función deduplica entregas repetidas, conserva el importe mayor del mes, ignora mensajes de otros meses y actualiza el nivel efectivo si el modo es automático. El header muestra solo al admin el total estimado y el último múltiplo de $1,000 MXN; si la lectura pertenece a otro mes, muestra que está pendiente de actualización.

Cloud Billing publica varias veces al día, puede tardar horas en entregar el primer mensaje y usa entrega al menos una vez. La etiqueta debe entenderse como costo estimado con hora de actualización, no como saldo en tiempo real.

El presupuesto con límite de gasto de Vertex AI es una protección separada. Al activarse puede pausar nuevas solicitudes y requiere intervención manual para levantarlo; el modo de ahorro de la aplicación no puede garantizar por sí solo que MXN 7,000 alcancen hasta el último día porque los datos de facturación son diferidos. Revisar el gasto y el ritmo diario antes de levantar el límite.

## Snoopy Editor

Cada menú de escena permite usar una imagen de referencia como clip de imagen con movimiento, sin generar video. Si hay varias imágenes se abre un selector; si no hay ninguna, la opción está deshabilitada. La acción está disponible también con el ahorro desactivado y reutiliza la misma conversión que las escenas pares del modo ahorro.

## Free tier de AI Studio para el texto de PigPen

Todo el texto de PigPen (objetivo y su blueprint, salas, reparaciones, plan de preguntas, análisis de briefings, palabra de desbloqueo, reparadores de JSON y revisión) puede servirse desde la Gemini Developer API de AI Studio, que no factura, sin importar el nivel del modo de ahorro. La ruta del navegador entra por `POST /api/gemini/generate` con un perfil PigPen: `"pigpen-fixed-content"` para el contenido de texto libre y `"pigpen-text"` para los demás turnos (plan de preguntas, análisis de briefings, palabra de desbloqueo y los dos reparadores de JSON). Los tres builders de `public/js/PigPenCreator.js` declaran el perfil explícitamente, así que un turno nuevo sin perfil caería en la ruta pagada; `tests/pigpen-free-tier-contract.test.mjs` lo vigila. La ruta orquestada decide por etapa dentro de `functions/src/pigpen-generation-workers.js`. Las dos evalúan la forma real de la petición construida (`inspectTextRequest` en `functions/src/gemini-free-tier.js`) en lugar de una bandera del llamante, y conservan el mismo plazo que ya tenía la ruta pagada: 480 s sólo para `pigpen-fixed-content` con `singleAttempt`, 105 s para los demás turnos.

Lo que **no** migra: toda generación de imagen sigue en Vertex pagado, tanto la etapa `image` de la ruta orquestada (`responseModalities: ["IMAGE"]`) como `generateGeminiImage` del navegador. El grounding con Google Search no existe en el plan gratuito, por lo que Marcie, las tendencias y `sya/improve` de Charly quedan en Vertex hasta la fase 2. Voz, audio y Veo tampoco tienen ruta gratuita.

Dos condiciones del free tier que conviene tener presentes: los términos indican que Google puede usar prompts y respuestas para entrenar modelos (en PigPen incluye briefs, misiones, preguntas y soluciones), y la cuota es por proyecto Cloud, no por key (~1.000 llamadas/día y ~15 RPM en la clase Lite; reinicia a medianoche `America/Cancun`). Por eso el tope propio `GEMINI_FREE_TIER_DAILY_CALL_CAP` (850 por omisión) es deliberadamente menor que el techo real, y al agotarse la generación **falla** con `pigpen_free_tier_exhausted` (HTTP 429 y `Retry-After`) en vez de derivar a Vertex; `retryPolicy` lee `permanentToday` y manda la tarea a `needs_attention` sin quemar reintentos. Cualquier otro fallo del tier gratuito (key ausente, plan sin verificar, forma de petición no elegible, error del proveedor) regresa al cliente Vertex de siempre **sólo cuando el turno no pidió el modelo gratuito**, que es lo que decide el selector.

### El selector de modelos decide el proveedor

`GET /api/gemini/models` ahora devuelve además `freeTier: { enabled, model }` (`describeFreeTierOffer`). Si el plan gratuito está activo, `loadGeminiModelCatalog` pone ese modelo como primera opción de `#objetivoModeloSelect` **y como valor por defecto**: reasigna `TEXT_MODEL_DEFAULT` y, cuando el estado restaurado del formulario aún trae el id construido `gemini-2.5-flash` (el que escribía el propio formulario antes de este cambio, no una decisión del autor), la selección pasa al modelo gratuito. Un modelo de cobro sólo se usa si el autor lo elige explícitamente en el selector, y esto ocurre igual con el modo de ahorro activado o desactivado: el routing del texto nunca consulta `getPolicy`, así que `off` sigue significando «texto gratis».

El criterio vive en un solo lugar, `classifyModelSelection` dentro de `resolveTextRoute`:

- el id recibido es otro modelo → `reason: "paid_model_selected"`, y la ruta pagada de `index.js` lo sirve (es la decisión del autor);
- el id recibido **es** el modelo gratuito → `explicitFreeSelection`; si el tier no puede responder (flag apagado, key ausente, forma no elegible, error del proveedor, bucket sin ledger) `attemptFreeText` lanza `pigpen_free_tier_unavailable` (HTTP 503) y **no** se hace ninguna llamada de cobro;
- sin id declarado (`null`, vacío o `auto`) → omisión del servicio: gratuito mientras el tier esté encendido, pagado mientras esté apagado, para que los registros anteriores sigan funcionando durante el rodaje.

Los turnos del navegador mandan el id sin normalizar como `req.body.model` y el gateway lo reenvía como `requestedModel`; en la ruta orquestada `functions/src/pigpen-generation-workers.js` manda `context.modelo` en las etapas de contenido y `null` en `review`, cuyo modelo elige el servicio (`reviewModel`), no el autor. Una configuración de corrida sin modelo tampoco paga: `configuration()` en `pigpen-generation-policy.js` usa la oferta gratuita cuando existe.

El navegador tenía su propia escalera de modelos: ante un 429 (o contenido invalidado localmente) cambiaba a `gemini-3.5-flash-lite`/`gemini-3.8-flash`, que es exactamente una llamada de cobro. Ahora esa escalera está bloqueada para los turnos gratuitos: el proxy marca cada respuesta servida gratis con `charlyProvider: "aistudio-free"` en el cuerpo y cada rechazo con `freeTier: true` (más `permanentToday`), y `requestQualityJson` se salta el cambio de modelo con esas dos señales. El cupo agotado por el día detiene en lugar de reintentar, y el enfriamiento de ~15 RPM se respeta con su `Retry-After`.

Con el texto completo en el bucket gratuito, el límite operativo es de velocidad, no del día: 15 solicitudes por minuto por proyecto y modelo, medido en la Fase 0. Un 429 del proveedor escribe `freeTextCooldownUntil` (piso de `GEMINI_FREE_TIER_COOLDOWN_MS`, 60 s por omisión) y el siguiente reclamo devuelve 429 con ese `Retry-After` sin llamar al proveedor. El navegador ya respeta ese encabezado (`getGeminiQuotaRetryDelayMs`, tope 90 s y dos reintentos) y el error lleva `retryAfterMs` para que la cola orquestada espere el enfriamiento en vez de gastar sus tres intentos contra un bucket pausado; sólo el agotamiento del cupo diario, que dura más de 15 minutos, marca `permanentToday` y detiene el trabajo.

### Fase 0: crear y atestar la key

La key debe vivir en un proyecto **sin** cuenta de facturación. Vincular facturación a un proyecto lo saca por completo del free tier, y una key de proyecto facturado se factura en silencio, así que se verifican tres cosas.

1. Crear el proyecto (por ejemplo `charly-aistudio-free`) sin vincular facturación y comprobarlo por dos rutas:
   - `gcloud billing projects describe <proyecto> --format="value(billingAccountName)"` debe devolver vacío.
   - `gcloud billing projects list --filter="billingEnabled=true" --format="value(projectId)"` no debe incluirlo.
2. En AI Studio, con ese proyecto seleccionado, generar la API key.
3. Atestar el bucket y detectar el modelo real:

```sh
GEMINI_FREE_TIER_API_KEY=... npm run gemini:free-tier:verify -- --models gemini-3.5-flash-lite --burst 40
```

`scripts/verify-free-tier-key.mjs` deja el informe en `docs/validation/gemini-free-tier-<fecha>.md` e imprime las variables que hay que exportar. Si el plan resulta `unverified`, **no** se activa el flag: el routing se queda en Vertex. La key se guarda con nombre nuevo, nunca `GEMINI_API_KEY`, porque `ai-jobs.js` usa esa variable para voz replicada y audio y terminaría en el bucket gratuito:

```sh
firebase functions:secrets:set GEMINI_FREE_TIER_API_KEY
gcloud secrets add-iam-policy-binding GEMINI_FREE_TIER_API_KEY --project charly-brown \
  --member "serviceAccount:charly-functions-ai@charly-brown.iam.gserviceaccount.com" \
  --role "roles/secretmanager.secretAccessor"
```

### Fase 0 completada (2026-10-03)

El atestado está en `docs/validation/gemini-free-tier-2026-10-03.md` y salió `plan: free`. La key vive en `charly-aistudio-free` (`gen-lang-client-0809622674`), proyecto sin cuenta de facturación confirmado por `gcloud billing projects describe` y con la Generative Language API habilitada; `charly-brown` sí tiene facturación (`billingAccounts/014D79-…`), así que una key de ese proyecto nunca sería gratuita y no debe usarse aquí.

Dos datos que cambian la configuración:

- `gemini-2.5-flash-lite` responde **404 “no longer available to new users”** para proyectos nuevos, aunque siga en el listado de `/models`. El modelo gratuito es `gemini-3.5-flash-lite`, y ése es ahora el `FALLBACK_TEXT_MODEL` del módulo. Como el alias pagado de `vertex.js` también desemboca en ese id, el selector muestra una sola entrada con ese id — la gratuita — y no deja pedir la versión de cobro.
- El techo medido es `GenerateRequestsPerMinutePerProjectPerModel-FreeTier` con `quotaValue: 15`, es decir **15 solicitudes por minuto por proyecto y modelo**; 12 de 40 llamadas de la ráfaga rebotaron con 429. Por eso el enfriamiento propio (`GEMINI_FREE_TIER_COOLDOWN_MS`, piso 60 s) y el `retryAfterMs` del `429` son la ruta normal del rodaje, no una excepción.

El lado de producción quedó instalado el mismo día: secreto `GEMINI_FREE_TIER_API_KEY` (v1) con su binding `roles/secretmanager.secretAccessor` al service account `charly-functions-ai@…`, las cuatro variables en `functions/.env` (ignorado por git) y el deploy acotado de las cuatro funciones más Hosting. Con `codebase` explícito en `firebase.json`, los filtros no son `functions:<nombre>` sino `functions:charly-google:<nombre>`; con la forma corta el comando falla con *"No function matches given --only filters"* sin desplegar nada. La revisión que sirve hoy es `geminiapi-00217-yuw` (100 % del tráfico, `GEMINI_FREE_TIER_ENABLED=true`, `GEMINI_FREE_TIER_PLAN=free`, `GEMINI_FREE_TIER_TEXT_MODEL=gemini-3.5-flash-lite`, `GEMINI_FREE_TIER_DAILY_CALL_CAP=850`), verificada con `gcloud run services describe geminiapi`.

### Caída del catálogo pagado (2026-10-03)

`charly-brown` está en la cuenta de facturación `014D79-71DB41-2ADBDB` y ese cuenta activó un tope de gasto: toda llamada a `aiplatform.googleapis.com` responde **403 `Spend cap breached for project: projects/128488238449`**. Afecta a todo lo pagado del sitio —`GET /api/gemini/models`, imágenes de PigPen, Marcie, Charly y Veo— y lo decide la consola de Cloud Billing, no el código.

El catálogo era el punto ciego del free tier: ese 403 se lanzaba desde `client.models.list()` dentro del handler, así que el navegador caía en la rama de error y nunca leía `freeTier`, es decir **la caída de Vertex impedía justo el texto gratuito**. Ahora `functions/src/ai-jobs.js` envolve la lista en `try/catch` y siempre responde 200 con `models`, `freeTier` y, si la lista falló, `catalogError`; la página lo anuncia como "Vertex no devolvió su catálogo; se muestran los modelos de respaldo" y elige el modelo gratuito igualmente. La prueba viva es el propio arnés: con `createVertexClient` lanzando el 403, `/api/gemini/models` devuelve `{"models":[],"freeTier":{"enabled":true,"model":"gemini-3.5-flash-lite"},"catalogError":…}`.

Dos consecuencias que hay que tener presentes:

- Mientras rige el tope, la generación de **imagen** de PigPen no puede funcionar; es pagada por diseño y el free tier no sirve imágenes.
- Un config guardado cuyo `modelo` sea un id de cobro (por ejemplo el viejo `gemini-2.5-flash` escrito antes de esta feature) se clasifica `paid_model_selected`, va a Vertex y rebota contra el tope. La página lo autocorrige: al cargar el catálogo, un valor igual al default construido se migra al gratuito y `saveFormState()` lo reescribe. Las salas ya en Firestore conservan el id de cobro hasta que el autor abre la página otra vez.

### El entorno local usa otro proxy

`public/js/config.local.js` (ignorado) fija `useLocalApi: true` y `apiBaseUrl: http://127.0.0.1:8787/api`, así que en `http://127.0.0.1:5010/PigPenCreator.html` **todas** las llamadas de Gemini de PigPen las responde `backend/server.js`, nunca la función `geminiApi`. Por eso el backend monta el mismo `createPigPenTextGateway` (con `services: () => ({ db })` y `resolveAuth: verifyFirebaseBearer` antes de `POST /api/gemini/generate`) y reporta la oferta en `GET /api/gemini/models`; sin eso, cambiar sólo `functions/` deja la página local sin modelo gratuito. El gateway no toca lo que no está etiquetado: las turnos de imagen y los perfiles de podcaster siguen su ruta pagada de siempre.

Para reiniciar el backend basta `kill <pid>` de `node backend/server.js`: el `monitor_backend` de `scripts/dev-local.sh` lo vuelve a levantar (~6 s) releyendo código y `.env`. El log queda en `/tmp/charlybrown-backend-8787.log` y ahí se leen los eventos `gemini_provider_route` con `reason: "served"` y `freeTierCallsToday`.

### Arreglo: el executor recibía un cliente nulo

`attemptFreeText` resolvía `const client = freeClient || createFreeTierClient()` pero llamaba `run(freeClient, freeRequest)`, es decir el argumento del llamador. Como ni el gateway del navegador ni los workers pasan `freeClient`, el executor recibía `null` y fallaba con `Cannot read properties of null (reading 'models')` **antes** de tocar el proveedor; el resultado era `pigpen_free_tier_unavailable` (503) en cada turno con el modelo gratuito seleccionado, y `free_tier_error` en los que no lo habían declarado. Las pruebas unitarias no lo veían porque siempre inyectan un `freeClient` falso. Ahora se pasa `client`, y `tests/pigpen-free-tier-contract.test.mjs` fija esa línea.

### Con el modelo gratuito seleccionado no se crea ninguna imagen

El free tier contesta texto: una sola imagen ya es un cargo, aunque todas las palabras hayan salido gratis. Por eso, mientras `#objetivoModeloSelect` conserve el modelo gratuito, PigPen **no genera imágenes** y deja cada espacio vacío con su prompt listo para que el autor la cree a mano. `manualImageMode()` compara el modelo seleccionado con `dataset.freeTierModel` del propio selector: elegir un modelo de cobro a propósito devuelve automáticamente las imágenes automáticas.

Consecuencias en el flujo de generación:

- `generateMissionImages` saca el prompt de la escena antes de decidir nada y, en modo manual, lo guarda con `rememberManualImagePrompt()` — que sólo escribe `imagen_prompt` si el autor lo dejó vacío, así nunca destruye una instrucción editada — y cuenta el espacio como `deferred` en lugar de llamar al proveedor. La portada se siembra con `buildCoverImagePromptSeed()` en `backgroundImagePrompt`, y el final y la recompensa simplemente se omiten.
- Una sala reservada **no es una imagen fallida**: `failedImages` excluye los slots diferidos, de lo contrario el `completeSavings("pigpenTopics", …)` de la reclamación de ahorro colgaría de una imagen que nadie pidió. El run termina y anuncia «N imágenes para crear a mano · usa el «Prompt de la imagen» de cada sala».
- Los cinco botones manuales (`retryRewardImage`, `regenerateEndingImageOnly`, `regenerateCoverImageOnly`, `regenerateQuestionImageOnly`, `regenerateMissionImageOnly`) responden con la misma explicación en vez de facturar.

Subir la imagen hecha a mano requería `POST /api/unidades/support-graphics/upload`, que en local devolvía 403 *"La ruta no corresponde al usuario autenticado"*: el navegador escribe el segmento del dueño con el sanitizador en minúsculas, pero `backend/server.js` comparaba el uid crudo de Firebase, que lleva mayúsculas. La ruta desplegada (`functions/src/uploads.js` + `sanitizeSegment`) normaliza ambos lados, así que el proxy local ahora normaliza el segmento igual y la prueba desde la página responde 200.

### Las sobrecargas momentáneas del free tier se reintentan; el 429 no

Google descarga tráfico del bucket gratuito con 503 intermitentes tipo *"This model is currently experiencing high demand"*. No son cuota agotada, y el navegador **no** puede responderlos cambiando a un modelo de cobro, así que un reinicio era obligatorio: un run completo se había detenido a mitad de camino con `reason: "free_tier_stopped"`.

`isTransientFreeTierError()` (`functions/src/gemini-free-tier.js`) detecta 500/503 o esos mensajes, y devuelve `false` de inmediato si el error es de cuota. `attemptFreeText` reemite **la misma solicitud gratuita** hasta `GEMINI_FREE_TIER_TRANSIENT_ATTEMPTS` veces, separadas por el `Retry-After` del proveedor o un backoff de `GEMINI_FREE_TIER_RETRY_BACKOFF_MS`; el cobro al bucket diario se hace una sola vez por turno y cada intento extra se registra como `gemini_provider_route` con `reason: "free_tier_retry"`. Si un rebote devuelve 429, el bucle lo trata como terminal: aparece `pigpen_free_tier_exhausted` con su enfriamiento en vez de martillar el techo de 15 RPM. `functions/test/gemini-free-tier-gateway.test.js` fija ambos casos y que un modelo de cobro nunca reciba el turno reintentado.

### Variables

`GEMINI_FREE_TIER_ENABLED` (maestro, sin definir deja todo en Vertex), `GEMINI_FREE_TIER_PLAN` (`free` | `unverified`), `GEMINI_FREE_TIER_API_KEY`, `GEMINI_FREE_TIER_TEXT_MODEL`, `GEMINI_FREE_TIER_DAILY_CALL_CAP`, `GEMINI_FREE_TIER_COOLDOWN_MS`, `GEMINI_FREE_TIER_TRANSIENT_ATTEMPTS` (3 por omisión) y `GEMINI_FREE_TIER_RETRY_BACKOFF_MS` (2 000) gobiernan los reintentos de sobrecarga, `PIGPEN_FREE_TIER_REVIEW` (`true` por omisión; `false` regresa sólo la etapa de revisión a Vertex si Lite produce hallazgos falsos) y las tasas del cálculo de ahorro (`GEMINI_FREE_TIER_SAVED_USD_PER_MTOK_INPUT`, `..._OUTPUT`, `GEMINI_FREE_TIER_MXN_PER_USD`).

`GEMINI_FREE_TIER_TEXT_MODEL` es también el id que publican `GET /api/gemini/models` (`freeTier.model`) y el selector `#objetivoModeloSelect`, así que cambiarlo cambia el valor por defecto de la página y la condición que separa "eligieron el modelo gratuito" de "eligieron un modelo de cobro". Si el nuevo id ya no está en la lista de Vertex, el autor seguiría pudiendo seleccionarlo y sus turnos se detendrían con `pigpen_free_tier_unavailable` en vez de pagar.

### Probar y rodar

`GET /api/savings/policy` agrega `freeTier` (solo al admin, junto a `billing`, y en **cualquier** nivel incluido `off`, porque el texto de PigPen no depende del modo de ahorro) con `enabled`, `keyConfigured`, `model`, `planVerified`, `usedToday`, `dailyCallCap`, `cooldownUntil`, `exhausted` y `estimatedSavedMxnToday`; el panel de ahorro lo muestra como "Texto de Pigpen" aunque el modo esté apagado. Cada decisión se registra como evento `gemini_provider_route` (nombre deliberadamente distinto de `vertex_resource_exhausted` para no contaminar las alertas de Vertex) y las respuestas servidas gratis llevan `X-Charly-Provider: aistudio-free` además de `charlyProvider: "aistudio-free"` en el cuerpo, que es lo que apaga la escalera de modelos del navegador.

`GET /api/gemini/models` agrega `freeTier: { enabled, model }`. Con esa oferta la página debe mostrar el modelo gratuito como primera opción y seleccionado por defecto — con el ahorro activado o desactivado — y solo los modelos de cobro aparecen debajo. Antes de rodar, confirmar que un config guardado cuyo `modelo` sea el gratuito no facture: un 429 o un fallo del proveedor gratuito debe terminar en mensaje, nunca en Vertex. En local, `scripts/dev-pigpen-generation.cjs` imprime `pigpen_text_provider` al arrancar y hereda las variables del shell.

Rodaje: desplegar con el flag apagado y confirmar `reason: env_disabled` en una generación completa; luego `GEMINI_FREE_TIER_ENABLED=true` y generar un tema con el ahorro en `off` y otro en `medium`, revisando los `stage` servidos gratis y `usedToday`. Durante la primera semana comparar el monto diario de `savings_billing/current` con `estimatedSavedMxnToday`: el tráfico gratuito no debe aparecer en la facturación de `charly-brown`.

Rollback de menor a mayor: `GEMINI_FREE_TIER_ENABLED=false` con deploy acotado (`firebase deploy --only functions:geminiApi,functions:pigpenGenerationApi,functions:dispatchPigPenGenerationTask,functions:recoverPigPenGenerations`) regresa a Vertex **sólo para quien no declaró modelo**; los temas y salas que quedaron con el id gratuito en el selector se detienen con `pigpen_free_tier_unavailable` hasta que el autor elige un modelo de cobro, que es la forma de apagar la feature sin que un cambio de flag empiece a cobrar contenido. No hay migración de datos: el documento `savings_daily_quotas/<dia>_global` simplemente deja de leerse.

## Despliegue

Validar primero las reglas de Firestore con emulador y los flujos de los cinco editores. Seguir `docs/google-cloud-phase5-runbook.md` antes del cambio de Hosting. Desplegar de forma acotada las funciones modificadas, la función Pub/Sub, las reglas revisadas y finalmente Hosting. Mantener los recursos de Render durante la ventana de reversión documentada.
