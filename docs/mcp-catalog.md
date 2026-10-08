# Catálogo MCP

Actualizado: 6 de octubre de 2026. Lista de herramientas: [mcp-tools.json](mcp-tools.json), regenerada con `node scripts/catalog-mcp.cjs` sin ejecutar herramientas.

| Servidor | Código propietario | Ruta y despliegue | Consumidores y permisos |
|---|---|---|---|
| Charly / MCP Editor | `functions/src/charly-brown-mcp.js` | `/api/charly-brown/mcp`, `geminiApi` | Editor y clientes MCP; Firebase, cuenta aprobada, propiedad de sesión/unidad, permisos editoriales e idempotencia de mutaciones |
| Marcie | `functions/src/marcie-editorial-agent.js` | `/api/marcie/mcp`, `geminiApi` | Blog Editor y clientes MCP; Firebase, aprobación editorial y propiedad de sesión |
| PigPen | `functions/src/pigpen-generation-routes.js` | `/api/pigpen/mcp`, `pigpenGenerationApi` | Creator; Firebase y propiedad de producción; versión, tareas persistidas y presupuesto compartido |
| Science | `functions/src/science-mcp.js` | `/api/science-activities/mcp`, `scienceActivitiesApi` | Science y clientes autorizados; OAuth/Firebase, scopes y propiedad de producción |
| Sally | `backend/sally/sally-mcp.js` | `/api/sally/mcp`, `sally-browser` | Sally; sesión autorizada, dominios Moodle permitidos y confirmaciones por riesgo antes de escribir |
| Cuatro especialistas Charly | `functions/src/charly-resources/server.js` | `/mcp`, `charly-mcp-annex`, `charly-mcp-cutout`, `charly-mcp-worksheet`, `charly-mcp-video-script` | Coordinador, IAM/OIDC; producen artefactos, sin modificar sesiones |

## Reutilización y contratos

- Charly y MCP Editor comparten implementación. `backend/charly-brown-mcp.js` conserva el alias, sin copiar herramientas.
- Los cuatro especialistas comparten fábrica, contratos, validación y generador; sus tipos permanecen separados.
- La generación habitual de especialistas de Charly se ejecuta dentro de Functions cuando no hay URL remota configurada. Los servicios privados siguen disponibles para consumidores autorizados.
- `functions/src/mcp/runtime.js` instrumenta las herramientas. Sally usa una copia generada por `scripts/build-sally-mcp-runtime.cjs`, porque su imagen es independiente.
- Transportes HTTP del SDK MCP, cierre por respuesta, autenticación y scopes conservados. Los nombres de herramientas y rutas públicas permanecen estables.
- La fábrica antigua `backend/image-creator-mcp.js` no tiene consumidor activo identificado. Se conserva hasta confirmar todos los clientes externos; no significa una instancia reservada adicional.
- Lucy utiliza APIs de generación, no un nuevo servidor MCP equivalente. Podcaster conserva Gemini TTS y generación normal.

## Medición

`node scripts/report-mcp-tool-usage.mjs 7` agrupa ejecuciones, errores, duración media/p95 y RSS del proceso. No registra argumentos, resultados ni credenciales. La duración puede solaparse entre herramientas y RSS pertenece al proceso; estas cifras no representan costo exacto por herramienta.

## Investigación

Las herramientas reutilizan `functions/src/research/`. Generación de imágenes, formato y análisis de archivos no activan búsquedas. Los expedientes mantienen presupuesto al editar o reintentar. Grounding está desactivado hasta configurar límites positivos por usuario y proyecto; la segunda llamada exige reformulación justificada.

Referencias: [transportes MCP](https://modelcontextprotocol.io/specification/latest/basic/transports), [autorización MCP](https://modelcontextprotocol.io/specification/latest/basic/authorization), [SDK oficial TypeScript](https://github.com/modelcontextprotocol/typescript-sdk).
