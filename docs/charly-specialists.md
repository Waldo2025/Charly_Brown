# Charly: especialistas MCP y producción de unidades

## Componentes

Cuatro procesos MCP privados (`annex`, `cutout`, `worksheet`, `video-script`) comparten el runtime de Vertex y utilidades de renderizado; cada proceso publica solamente su herramienta. El editor conserva su API pública autenticada con Firebase. El backend invoca los especialistas mediante ID tokens con la audiencia del servicio de Cloud Run.

La cola `charly-production` ejecuta dos actividades independientes en paralelo y, al terminar la fase de actividades, produce hasta tres recursos simultáneos por unidad. Firestore mantiene tareas, intentos, permisos de ejecución y resultados desactualizados en `charlyProductionRuns/{id}/tasks`. Las notas se generan al concluir los recursos. No se modifica contenido existente; la reanudación trabaja sobre tareas pendientes. Los cambios del currículo requieren iniciar otra ejecución mediante «Completar con los cambios actuales»; los cambios en una actividad durante la generación conservan el resultado como desactualizado.

Las escrituras de sesiones utilizan `storageRevision` para detectar clientes obsoletos. Una pestaña con cambios locales deja de incorporar automáticamente las instantáneas remotas y conserva la edición visible. Los resultados del servidor continúan guardándose y pueden recuperarse reabriendo la sesión.

Los especialistas guardan archivos y resultados idempotentes en `charly-resources/{uid}/{session}/{unit}` en Storage. Los enlaces de descarga usan el mecanismo de tokens de Firebase del proyecto; deben tratarse como enlaces privados compartibles. No se incluyen binarios en Firestore. Las imágenes generadas se identifican como tales. Los gráficos sin datos verificados se rotulan «Datos de ejemplo».

## Configuración y despliegue

Ejecutar desde la raíz del repositorio:

```sh
bash scripts/deploy-charly-specialists.sh
```

El script construye la imagen, crea cuatro servicios privados con cuentas de servicio independientes y permisos para Vertex y objetos del prefijo de recursos, y prepara la cola. Requiere permisos de Cloud Build, Artifact Registry, Cloud Run, IAM, Storage y Cloud Tasks. No activa el tráfico del editor.

Configurar estas variables tanto en `geminiApi` como en `dispatchCharlyProductionTask` y `recoverCharlyProductions` mediante el mecanismo de entornos de Firebase del proyecto:

```dotenv
CHARLY_MCP_ANNEX_URL=https://URL-DEL-SERVICIO
CHARLY_MCP_CUTOUT_URL=https://URL-DEL-SERVICIO
CHARLY_MCP_WORKSHEET_URL=https://URL-DEL-SERVICIO
CHARLY_MCP_VIDEO_SCRIPT_URL=https://URL-DEL-SERVICIO
CHARLY_ACTIVITY_CONCURRENCY=2
CHARLY_RESOURCE_CONCURRENCY=3
```

Las URLs deben ser las bases de Cloud Run, sin `/mcp`. Los especialistas aceptan `CHARLY_IMAGE_MODEL` opcional y utilizan por defecto el modelo de imágenes centralizado en `vertex.js`. El coordinador utiliza el modelo compatible elegido en la unidad.

Desplegar las funciones mencionadas, las reglas de Firestore y los módulos del editor. La cuenta `charly-functions-ai` debe poder encolar Cloud Tasks y actuar como `charly-tasks-invoker`; esta última debe poder invocar el worker privado. Las funciones se declaran con esa identidad e invocador en `functions/src/index.js`.

Tras verificar los cuatro servicios y una unidad de prueba, desplegar las tres funciones. La ruta `/api/charly-brown/production/config` activa la interfaz cuando la ejecución inline está habilitada o están configuradas las cuatro URLs. Para reducir temporalmente la presión sobre Vertex, ajustar `CHARLY_RESOURCE_CONCURRENCY=1`; se conservan resultados, registros y checkpoints.

El backend alternativo de Node registra las mismas rutas; para invocar Cloud Run necesita ADC con acceso al proyecto. Las llamadas antiguas a Gemini de otras funciones del backend no se han migrado como parte de este cambio.

## Validación

```sh
node --test functions/test/charly-production.test.js functions/test/charly-specialists.test.js
node --test backend/charly-brown-mcp.test.js functions/test/charly-brown-mcp-route.test.js functions/test/charly-brown-security.test.js functions/test/charly-brown-export.test.js
node --experimental-default-type=module --test scripts/test-charly-brown-units.mjs
node scripts/test-charly-specialists-browser.cjs
node scripts/smoke-charly-vertex.cjs
```

La última prueba usa ADC y realiza dos llamadas mínimas a Vertex: declara una herramienta mediante JSON Schema y devuelve sus resultados preservando las partes y firmas del modelo. No crea contenido ni archivos remotos.

Comprobar en la aplicación: iniciar y recargar una ejecución, cancelar/reanudar, conservar actividades existentes, generar los cuatro recursos, copiar la tabla y pegarla en Snoopy. Revisar visualmente los PDF de recortables con muchas piezas, Carta/A4 y ambas orientaciones. Los anexos administrados se incorporan como imágenes en DOCX/PDF. El exportador IDML conserva una referencia textual a los recursos visuales; su colocación gráfica sigue siendo una operación editorial independiente.

La suite heredada `scripts/test-charly-brown-editor-contract.mjs` conserva cinco expectativas desactualizadas: `cbModelSelect`, la acción de refresco de lectura, `gemini-3-pro-preview`, `resolveLocalChatResponse` y `cb-reading-dock`. No se modificaron esas expectativas para ocultar sus fallos; las pruebas funcionales anteriores verifican el flujo actual.

## Referencias oficiales consultadas el 24-09-2026

- [Vertex function calling](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/function-calling): llamadas múltiples, respuestas y firmas.
- [ADK: flujos paralelos](https://google.github.io/adk-docs/agents/workflow-agents/parallel-agents/): independencia de ramas y coordinación explícita de estado.
- [Cloud Run: autenticación entre servicios](https://docs.cloud.google.com/run/docs/authenticating/service-to-service): IAM e ID tokens.

Validación realizada: contrato real de function calling probado con `gemini-3.8-flash`; pruebas locales de concurrencia, recursos, exportación, interfaz y portapapeles verificadas. Los cuatro servicios y las funciones nuevas no se desplegaron en esta sesión.
