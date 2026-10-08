# Reducción de costos: implementación y validación

Actualizado: 6 de octubre de 2026. Proyecto: `charly-brown`, región: `us-central1`.

## Objetivo

Conservar almacenamiento, autenticación, servidores MCP, generación de IA, TTS y reproducción. Priorizar el equipo del usuario y ejecutar en Cloud Run únicamente el trabajo necesario. Grounding es complementario y presupuestado; Gemini Live no se reactiva.

## Cambios aplicados en producción

| Área | Implementación |
|---|---|
| Reservas | Auditoría de las 34 superficies Cloud Run, incluidas Functions Gen2: mínimo cero en servicios y revisiones actuales. No se encontraron servicios en otra región. |
| Gemini Live | Servicio retirado; ruta de token devuelve 410. Se eliminaron conexiones y código de micrófono; los nombres antiguos usados como compatibilidad no abren Live. Podcaster y Schroeder conservan Gemini TTS. |
| Recuperación | PigPen, Charly, Marcie y Science usan endpoints privados y Cloud Tasks vinculadas a producciones pendientes. Los cuatro recuperadores periódicos fueron eliminados después de preparar los trabajos existentes. |
| Otros temporizadores | Monitores de trabajos IA/exportación y calendario migrados a eventos y tareas específicas. Eliminados los cron de trabajos obsoletos, calendario y tendencias. Tendencias se solicitan desde el editor. |
| Veo | Operación persistida y petición liberada; primera consulta a 30 s y siguientes a 60 s. Reserva y secuencia transaccionales, identidad de solicitud y escena, sin reenviar una generación cuyo resultado inicial es incierto. |
| Investigación | Módulo compartido, APIs académicas y SearXNG privados; presupuestos persistidos antes de llamar al proveedor. Grounding desactivado hasta configurar límites mensuales positivos. |
| SearXNG | Servicio privado, una CPU, 512 MiB, concurrencia 2, máximo 2, mínimo cero, facturación por solicitudes. Imagen oficial fijada por digest. |
| Sally | Sesiones inactivas cierran navegador y WebSocket; las consultas de estado no prolongan su vida. Mínimo cero, máximo una instancia. Se comprobó ausencia de tareas pendientes antes de actualizar. |
| PDF | Extractor compartido PDF.js/Web Worker, lotes de 25, OCR local y reglas de paginación, secciones y ortografía. Integrado en Charly y Peppermint; puntos de continuación en IndexedDB. |
| Alternativa PDF | Subida resumible directa a Storage para archivos grandes, validación de dueño, tamaño y firma PDF antes de asociarlos a la revisión. El worker se conserva privado, mínimo cero, 4 GiB, una instancia como máximo y una petición simultánea. Su cola heredada mantiene estados en memoria; este límite evita repartir consultas entre procesos distintos mientras se migra. |
| MCP | Catálogo de rutas, consumidores y herramientas; implementación y métricas compartidas; especialistas privados actualizados conservando IAM y contratos. |

La auditoría encontró 134 revisiones históricas de Podcaster con mínimo uno, sin tráfico ni tags. No mantienen reservas activas. No deben volver a recibir tráfico sin ajustar primero su mínimo a cero. Las revisiones etiquetadas que siguen siendo accesibles tienen mínimo cero. El backend antiguo `charly-brown-gemini-backend` se conserva por compatibilidad: es privado, rechazó accesos públicos con 403 y no mostró consumo en la línea base; no se borró una superficie sin identificar todos sus posibles consumidores.

### Excepción de facturación: Sally

Sally mantiene facturación por instancia porque sus automatizaciones continúan después de la petición inicial. Cambiarla a CPU limitada por solicitudes interrumpiría ese flujo. Cerrar sesiones reduce conexiones abiertas y permite escalar a cero; no garantiza cobro cero durante todo el intervalo ocioso previo al apagado. Esa excepción sigue siendo una oportunidad de optimización mediante ejecución duradera por tareas, con una migración específica que preserve las sesiones de Moodle.

## Recuperación y operaciones

- Inicio/reanudación programa recuperación; pausa, cancelación y estados terminales impiden sucesores. Una tarea ya encolada puede llegar y descartarse sin continuar.
- Versiones, epochs y secuencias persistidas descartan tareas antiguas. Los fallos de encolado se reparan con la misma reserva y nombre determinista.
- Los monitores por documento tienen lease y no permiten que un temporizador antiguo sobrescriba la programación causada por un cambio nuevo.
- Los endpoints de recuperación, consulta Veo y monitor usan IAM/OIDC. El proxy PDF conserva el token Firebase y añade identidad OIDC para invocar al worker privado.
- No se detectaron producciones ni trabajos IA/exportación pendientes al preparar la transición. Los cron se retiraron después del despliegue y smoke privado.
- Se prepararon diez elementos pendientes del calendario; solo esos elementos reciben su tarea de seguimiento, sin escanear globalmente la colección.
- Los trabajos Cloud Run revisados no tenían ejecuciones activas. Hay ejecuciones de exportación fallidas antiguas; no son instancias encendidas.

## Investigación compartida

1. Reutilizar archivos, currículo oficial y resultados anteriores.
2. Buscar por Crossref, Europe PMC y SearXNG, respetando dominios seleccionados y exclusiones.
3. Recuperar contenido accesible y verificar afirmaciones con las utilidades existentes.
4. Solo ante una falta concreta de evidencia, preparar una consulta especializada.
5. Grounding permite hasta dos llamadas por expediente compartido. La segunda exige reformulación justificada. Ediciones, agentes paralelos y reintentos comparten el presupuesto.
6. Ante un error incierto, la reserva sigue consumida: no se repite automáticamente la consulta pagada.

Configuración administrativa autenticada: `POST /api/research/settings`, cuerpo `{enabled, monthlyProjectCalls, monthlyUserCalls}`. Para activar, ambos límites deben ser enteros positivos. No se establecieron importes ni cuotas arbitrarias en nombre del usuario.

Se registran llamadas, consultas reportadas por el proveedor, fuentes verificadas e incorporadas, sin contenido de los artículos. Dos llamadas no significan dos consultas facturables; el modelo puede ejecutar varias consultas dentro de cada llamada. Estos contadores no garantizan un límite monetario exacto en tiempo real.

Marcie usa conectores primero y conserva la verificación. Charly no busca automáticamente en una conversación general; el currículo y archivos se reutilizan. PigPen no recibe búsqueda por defecto. Science y especialistas están sujetos al mismo guard del cliente. Imágenes, formato y análisis de archivos no activan búsqueda automáticamente. No se añadió Haystack.

Una lista de enlaces o snippets no se presenta como evidencia suficiente. Si falta cobertura o una plataforma no responde, se informa; no se inventan referencias ni se sustituyen dominios silenciosamente.

## PDF local y continuidad

- Límite de extracción: 1 GiB (1.073.741.824 bytes). Huella de todos los bytes por fragmentos y versión del extractor; texto guardado por página en IndexedDB.
- Procesamiento secuencial, lotes de 25, liberación de recursos, progreso, cancelación y continuación al seleccionar nuevamente el archivo.
- OCR local en páginas con imágenes y sin texto útil; los recursos WASM, worker e idiomas español/inglés se sirven desde el sitio con sus licencias.
- Charly sube el original y los lotes de texto con manifiesto. El backend comprueba propiedad, estructura, páginas únicas y cobertura. Resume por lotes para Gemini y conserva referencias; `read_attachment_pages` recupera hasta 25 páginas literales sin descargar todos los lotes.
- Peppermint aplica reglas locales de paginación, secciones y diccionarios nspell español/inglés. El resultado indica proveedor local y que no se usó verificación Gemini.
- La alternativa de servidor solicita confirmación y sube archivos grandes en fragmentos directamente a Storage; el archivo completo no atraviesa Functions. La fuente queda asociada a una revisión propia tras verificar metadatos y firma.

### Verificación y límites pendientes

Los PDF sintéticos de 250 MiB, 500 MiB y 1 GiB conservaron las 52 páginas y sus marcadores. También pasaron cancelación/continuación, OCR, PDF mixto y error explícito en archivos protegidos o dañados. Son fixtures de tamaño, no una prueba representativa de todos los PDF reales de 1 GiB.

La subida resumible real de 1 GiB a Storage pasó la finalización y asociación a una revisión propia; sus recursos temporales se eliminaron. Se corrigió y probó también la entrega completa al reanudar un lote con una página previamente fallida, y las páginas no vacías cuyo OCR no obtiene texto reportan error explícito.

Todavía se debe comparar la calidad de OCR, ortografía nspell frente a PyEnchant/Gemini y reglas editoriales con un corpus real. Otros idiomas y los flujos IDML conservan el worker. No se retirará hasta demostrar equivalencia y cubrir todas las capacidades necesarias. La existencia de extracción y subida de 1 GiB no certifica el rendimiento del análisis de servidor en cualquier documento de ese tamaño.

## MCP y superficies

Ver [catálogo MCP](mcp-catalog.md) y [herramientas](mcp-tools.json). Charly y MCP Editor comparten implementación; cuatro especialistas comparten fábrica. Sally mantiene una imagen separada con una copia generada de la instrumentación. Los alias públicos se conservan; no se eliminó una fábrica sin confirmar sus consumidores externos.

La instrumentación mide duración, errores y RSS del proceso sin argumentos ni resultados. No representa CPU ni factura exacta por herramienta. Se conserva el transporte compatible del SDK; no se afirma certificación completa contra todas las versiones nuevas de la especificación MCP.

Hosting se publica selectivamente conservando hashes y configuración de los archivos no modificados. Cada versión tiene preview, comprobación de archivos, autenticación, investigación y PDF antes del corte. No se desplegaron reglas Firestore/Storage ni se modificaron recursos Render.

## Pruebas y evidencia

- Batería Functions: 623 casos, 616 pasaron y 7 fallaron por expectativas anteriores de prompts/modelos. La configuración pendiente de razonamiento de Charly se corrigió y sus pruebas de rutas pasaron.
- Pruebas finales de presupuesto, rutas Charly, lectura local y fuente PDF: 18/18.
- Recuperación, leases, pausas y Veo persistido: casos específicos aprobados; no se generaron videos reales para probar reintentos.
- Sally: 16/16; salud de producción correcta.
- Preview: 31 archivos coinciden con las fuentes revisadas; Live 410, investigación 200 con resultados y proxy privado PDF con respuesta esperada para job inexistente.
- Seguridad: escaneo de secretos y verificación pública aprobados.
- Regresión del protocolo Python: 3/3; las advertencias nativas y de Python quedan en stderr y el resultado JSON usa un descriptor separado.
- Servidor PDF: fuente de 32 MiB subida, analizada y consultada correctamente en producción; una página cubierta. La nueva imagen pasó la comprobación de carga y conserva IAM privado, mínimo cero y máximo una instancia. La revisión activa es `analizar-pdf-worker-00009-kd8`.
- Los siete fallos restantes corresponden a dos prompts editoriales Charly, tres expectativas de modelos de imagen, redacción LATAM y una expectativa de UI Marcie. No se presentan como una batería completa verde.

## Comparación de siete días

Línea base: [28 septiembre–5 octubre UTC](reports/cloud-run-baseline-20261005.json). `node scripts/report-cloud-run-compute.mjs` recupera siete días de tiempo facturable y solicitudes por servicio. `node scripts/report-mcp-tool-usage.mjs 7` resume las herramientas instrumentadas.

Tras siete días de actividad comparable, contrastar solicitudes, tiempo facturable, errores, producciones completadas y evidencia útil. Separar el cambio de volumen y las pruebas de despliegue del ahorro atribuible. Mantener Sally visible en el informe por su facturación por instancia. No anunciar un ahorro porcentual antes de esa comparación.

Seguimiento de lectura de métricas configurado en este chat para el 13 de octubre de 2026 a las 01:30, America/Cancun. No consulta Cloud Run antes de esa fecha y se detiene después del informe. Identificador: `comparaci-n-de-cloud-run-tras-siete-d-as`.

## Reversión

Restaurar únicamente la superficie afectada: versión Hosting previa, imagen de servicio o export de Function revisado. Mantener mínimo cero, IAM privado, operación Veo persistida y política de investigación en la reversión. Ningún rollback debe recrear Gemini Live, presupuestos ilimitados o recuperadores globales sin pendientes.

Checkpoint publicado: Hosting `ea2aa9ecaddce0fa`; worker PDF `sha256:b133ebfd79d6bbd93c5879751418831b53150c4624a320fce679db5ed7b9a925`. Las imágenes anteriores a los guards de investigación no son candidatas de reversión sin incorporar primero esos guards.

Referencias: [mínimo de instancias y facturación](https://docs.cloud.google.com/run/docs/configuring/min-instances), [métricas Cloud Run](https://docs.cloud.google.com/run/docs/monitoring), [SearXNG API](https://docs.searxng.org/dev/search_api.html), [autorización MCP](https://modelcontextprotocol.io/specification/latest/basic/authorization).
