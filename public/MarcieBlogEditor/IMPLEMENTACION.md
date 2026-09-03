# Marcie Blog Editor — Estado actual y hoja de ruta

Actualizado: 23/08/2026

## Clasificación actual

Marcie Blog Editor es un **MVP funcional avanzado / beta interna de un copiloto editorial educativo impulsado por Gemini**.

- No es un LLM propio: Gemini es el modelo; Marcie es la aplicación vertical y su flujo editorial.
- Ya supera una demostración visual: tiene autenticación, persistencia, generación real, revisión, edición y exportación.
- Todavía no es un agente autónomo completo ni un producto listo para publicación desatendida.

## Implementado actualmente

### Producto y experiencia

- Aplicación de tres paneles: sesiones, editor y flujo editorial/IA.
- Sesiones con creación, selección, búsqueda, filtros, estados, duplicado, archivado y eliminación.
- Temas de interfaz y plantillas visuales persistentes por artículo.
- Edición directa de título, subtítulo y cuerpo mediante `contenteditable`.
- Paleta de comandos, acciones superiores, redimensionado de paneles y flujo por etapas.
- Tres audiencias editoriales: docentes/directivos, estudiantes y familias.

### Inteligencia editorial con Gemini

- Análisis del tema y síntesis de tendencias.
- Generación de cuatro propuestas diferenciadas por audiencia.
- Refinamiento del tema.
- Redacción de artículos estructurados.
- Revisión de calidad, tono, SEO y hallazgos editoriales.
- Regeneración/corrección de artículos.
- Generación de portadas 16:9 y optimización WebP/JPEG para web.
- Perfiles de instrucciones editoriales configurables y modo libre.
- Flujo automatizado actual: propuestas → cuatro artículos → cuatro portadas secuenciales con control de cuota → revisión → correcciones; la regeneración manual sigue siendo individual por propuesta.

### Datos, seguridad y exportación

- Firebase Auth y validación de usuario aprobado.
- Persistencia en Firestore, colección `MarcieBlogEditor`, filtrada por propietario.
- Copia local de respaldo y suscripción en tiempo real.
- Reglas de Firestore para propietario y roles editoriales.
- Contratos canónicos para sesiones, fuentes, propuestas y artículos.
- Exportación del artículo actual o los cuatro artículos como HTML/ZIP.
- Portadas incluidas en el paquete y estilos coherentes entre vista previa y exportación.

## Limitaciones reales del estado actual

1. La etapa llamada “investigación” usa generación de Gemini y una lista segura de dominios, pero no conserva evidencia web por afirmación ni demuestra que cada dato provenga de una página consultada.
2. La automatización se orquesta principalmente en el navegador. Si se cierra la pestaña o falla una etapa larga, la recuperación depende del estado guardado, no de un trabajador durable.
3. No hay una suite automatizada específica de Marcie que cubra contratos, investigación, edición, reanudación, permisos, exportación y publicación.
4. `editor-app.js` concentra demasiadas responsabilidades y debe dividirse antes de ampliar el producto.
5. El adaptador inicial de WordPress ya existe, pero todavía requiere configurarse y validarse contra un sitio de staging real; otros CMS siguen pendientes.
6. La aprobación editorial no está separada formalmente de la autorización para publicar.
7. No existen evaluaciones sistemáticas de exactitud factual, cobertura de citas, calidad editorial, costo y tiempo por artículo.

---

# Lista de pendientes actualizada

## P0 — Estabilizar la beta interna

- [ ] Crear pruebas unitarias de contratos, normalización de fuentes, artículos, auditorías y exportación.
- [ ] Crear pruebas de integración de Firestore/Auth y reglas para propietario, editor y administrador.
- [ ] Crear una prueba de navegador del recorrido completo: sesión → propuesta → artículo → revisión → exportación.
- [ ] Dividir `editor-app.js` en módulos de estado, renderizado, automatización, editor, exportación y configuración.
- [ ] Añadir identificadores de operación e idempotencia a generación de artículos, imágenes y exportaciones.
- [ ] Registrar métricas por etapa: modelo, duración, tokens, costo estimado, reintentos, resultado y error normalizado.
- [ ] Mostrar estados recuperables: reintentar, continuar desde la última etapa válida y cancelar.
- [ ] Resolver conflictos de edición concurrente mediante versión del documento o transacciones.
- [ ] Actualizar textos de producto para distinguir `borrador`, `aprobado editorialmente`, `programado` y `publicado`.

### Criterio de salida P0

El flujo completo debe poder fallar y reanudarse sin duplicar artículos, imágenes ni publicaciones, y las reglas de acceso deben estar cubiertas por pruebas.

## P1 — Convertir el flujo en un agente editorial autónomo verificable

### 1. Orquestador durable en backend

- [ ] Crear `EditorialAgentRun` como entidad persistente con objetivo, plan, etapa, presupuesto, intentos, artefactos, evidencias y estado final.
- [ ] Mover la ejecución larga del navegador a Cloud Run/Functions con Cloud Tasks.
- [ ] Guardar un checkpoint después de cada herramienta o decisión.
- [ ] Hacer idempotente cada paso usando `runId + stepId + inputHash`.
- [ ] Implementar reintentos con espera progresiva, límite de intentos y cola de errores.
- [ ] Permitir pausar, continuar y cancelar una ejecución desde la interfaz.

Estados sugeridos:

`queued → planning → researching → verifying → drafting → auditing → replanning → awaiting_approval → publishing → completed | failed | cancelled`

### 2. Herramientas del agente

El modelo no debe simular acciones. Debe solicitar herramientas mediante function calling y el backend debe ejecutarlas y devolver resultados estructurados.

- [ ] `search_web(query, filters)` — búsqueda en tiempo real con Google Search grounding.
- [ ] `read_urls(urls)` — lectura de páginas seleccionadas mediante URL Context.
- [ ] `search_internal_library(query)` — consulta de documentos internos mediante File Search cuando exista una biblioteca propia.
- [ ] `extract_claims(document)` — divide el borrador en afirmaciones comprobables.
- [ ] `verify_claim(claim, evidenceIds)` — determina soporte, contradicción o evidencia insuficiente.
- [ ] `save_evidence(source, excerptHash, retrievedAt)` — conserva metadatos y huella de la evidencia.
- [ ] `generate_article`, `review_article` y `revise_article` — operaciones editoriales estructuradas.
- [ ] `create_cms_draft`, `update_cms_draft` y `publish_cms_entry` — acciones externas con permisos separados.

### 3. Modelo de evidencia

- [ ] Crear `ResearchSource`: URL canónica, título, autor, editor, fecha, fecha de consulta, tipo de fuente y nivel de confianza.
- [ ] Crear `EvidenceRecord`: fragmento breve o resumen, ubicación, huella, fuente y fecha de recuperación.
- [ ] Crear `ArticleClaim`: texto de la afirmación, nivel de riesgo y `evidenceIds` que la respaldan.
- [ ] Guardar las anotaciones/citas devueltas por Google Search, URL Context o File Search.
- [ ] Renderizar citas junto a la afirmación y una matriz “afirmación ↔ evidencia” en el panel de revisión.
- [ ] Marcar como no verificadas las afirmaciones que solo provengan del conocimiento paramétrico del modelo.

No basta con que el dominio sea confiable: la página recuperada debe respaldar realmente la afirmación.

### 4. Ciclo de planificación y replanteamiento

El agente debe ejecutar este ciclo con un máximo de pasos y presupuesto definidos:

1. Interpretar el objetivo editorial y las restricciones.
2. Crear un plan de investigación y criterios de suficiencia.
3. Buscar y leer fuentes.
4. Extraer afirmaciones y evidencias.
5. Comparar fuentes independientes y detectar contradicciones.
6. Evaluar brechas: actualidad, diversidad, autoridad y cobertura.
7. Si no cumple los criterios, explicar la brecha y generar un nuevo plan de búsqueda.
8. Redactar únicamente con evidencia aceptada.
9. Auditar el borrador afirmación por afirmación.
10. Repetir investigación o redacción hasta cumplir el umbral o agotar el presupuesto.
11. Solicitar aprobación humana antes de cualquier publicación externa.

Reglas iniciales de replanteamiento:

- Rebuscar si una afirmación importante tiene menos de dos fuentes independientes cuando el tema lo requiera.
- Rebuscar si las fuentes son demasiado antiguas para el tema.
- Rebuscar si todas las fuentes proceden de una sola institución o perspectiva.
- Eliminar o suavizar una afirmación si no puede verificarse.
- Mostrar contradicciones; no ocultarlas ni resolverlas por intuición del modelo.
- Detenerse con `insufficient_evidence` si no existe soporte suficiente.

### 5. Límites de autonomía

- [ ] Presupuesto máximo por ejecución: pasos, búsquedas, tiempo, tokens e imágenes.
- [ ] Lista permitida de herramientas y dominios bloqueados por política.
- [ ] Validación estricta de argumentos antes de ejecutar una herramienta.
- [ ] Protección SSRF al recuperar URLs y bloqueo de redes privadas/metadatos de nube.
- [ ] Registro inmutable de decisiones, herramientas, entradas resumidas y resultados.
- [ ] Aprobación humana obligatoria para publicar, sobrescribir o eliminar contenido externo.
- [ ] Separar permisos `research`, `draft`, `approve` y `publish`.

### 6. Evaluación del agente

- [ ] Conjunto de 30–50 temas representativos con criterios esperados.
- [ ] Medir precisión de citas, cobertura de afirmaciones, enlaces rotos y contradicciones detectadas.
- [ ] Medir utilidad editorial con revisión humana ciega.
- [ ] Medir costo, latencia, número de replanteamientos y tasa de terminación.
- [ ] Ejecutar evaluaciones de regresión al cambiar modelo, instrucciones o herramientas.

### Criterio de salida P1

Al menos el 95 % de las afirmaciones factuales de riesgo medio/alto debe tener evidencia visible y válida; ninguna cita puede apuntar a una página que no respalde la afirmación. El agente debe poder reanudar una ejecución interrumpida y explicar por qué replanteó su investigación.

## P2 — Publicación en WordPress

### Arquitectura

Implementar una interfaz común `PublisherAdapter` en backend:

```ts
interface PublisherAdapter {
  testConnection(profileId: string): Promise<ConnectionResult>;
  uploadMedia(profileId: string, asset: PublishAsset): Promise<RemoteMedia>;
  createDraft(profileId: string, article: PublishArticle): Promise<RemoteEntry>;
  updateDraft(profileId: string, remoteId: string, article: PublishArticle): Promise<RemoteEntry>;
  publish(profileId: string, remoteId: string): Promise<RemoteEntry>;
  getStatus(profileId: string, remoteId: string): Promise<RemoteEntryStatus>;
}
```

El primer adaptador, `WordPressPublisherAdapter`, está implementado para conexión, medios, términos, borradores y publicación.

### Configuración de WordPress

- [x] Configurar URL base, usuario técnico y Application Password mediante un secreto de servidor.
- [x] Guardar la contraseña únicamente en Secret Manager, sin enviarla al navegador ni guardarla en Firestore.
- [x] Verificar HTTPS, identidad del usuario y acceso a la API.
- [x] Crear/asociar categoría y etiquetas del artículo.
- [ ] Configurar autor y valores predeterminados por múltiples perfiles editoriales.
- [ ] Crear y validar en WordPress un usuario técnico con el mínimo rol/capacidad necesarios.

### Flujo de publicación recomendado

1. Validar que el artículo esté aprobado y que el análisis factual haya pasado.
2. Convertir `ArticleDocument` a HTML seguro y compatible con WordPress.
3. Subir la portada con `POST /wp-json/wp/v2/media`.
4. Crear o resolver categorías y etiquetas.
5. Crear el artículo con `POST /wp-json/wp/v2/posts` y `status: "draft"`.
6. Guardar `remoteId`, URL editable, versión/fecha, huella del contenido y perfil utilizado.
7. Mostrar vista previa y solicitar aprobación humana.
8. Publicar mediante una actualización del post a `status: "publish"`, o programar con `status: "future"` y fecha.
9. Consultar el post después de escribirlo y reconciliar su estado en Marcie.

Campos mínimos a mapear:

| Marcie | WordPress |
|---|---|
| `article.title` | `title` |
| bloques renderizados | `content` |
| `article.excerpt` | `excerpt` |
| portada subida | `featured_media` |
| etiquetas | `tags` |
| categoría editorial | `categories` |
| autor configurado | `author` |
| estado editorial | `draft`, `pending`, `future` o `publish` |

### Endpoints internos sugeridos

- [x] `POST /api/marcie/wordpress/test`
- [x] `POST /api/marcie/wordpress/draft`
- [x] `POST /api/marcie/wordpress/publish`
- [ ] `POST /api/marcie/publications/:publicationId/schedule`
- [x] `GET /api/marcie/wordpress/status`

### Seguridad y consistencia

- [x] Nunca enviar credenciales de WordPress al frontend ni almacenarlas en `localStorage`.
- [x] Proteger las rutas con Firebase ID token, usuario aprobado y propiedad de la sesión.
- [x] Usar reserva de publicación y slug determinista para evitar publicaciones duplicadas.
- [x] Sanitizar HTML, URLs, atributos y bloques no compatibles.
- [x] Bloquear llamadas a hosts privados o no autorizados para reducir SSRF.
- [x] Registrar quién publicó y cuándo; la aprobación queda registrada en el estado editorial de la sesión.
- [ ] No sobrescribir cambios realizados directamente en WordPress sin advertir un conflicto.
- [ ] Añadir reintentos solo para errores transitorios; no repetir ciegamente una creación incierta.

### Criterio de salida P2

Marcie debe crear un borrador con portada, categorías y etiquetas; recuperar el resultado desde WordPress; mostrar su enlace de edición; y publicar únicamente después de una aprobación explícita, sin duplicados ante reintentos.

## P3 — Otros CMS y distribución

- [ ] Implementar `ContentfulPublisherAdapter` mediante Content Management API: crear entrada, subir/publicar activo y publicar entrada con control de versión.
- [ ] Evaluar Ghost Admin API si el caso principal sigue siendo un blog editorial.
- [ ] Evaluar Strapi para instalaciones autohospedadas y modelos de contenido personalizados.
- [ ] Añadir Webhook/Generic REST Adapter solo con plantillas de mapeo y esquemas validados.
- [ ] Incorporar programación, actualización, despublicación y reconciliación por adaptador.
- [ ] Añadir analítica posterior a la publicación sin mezclarla con el contrato editorial canónico.

## P4 — Editor y colaboración

- [ ] Migrar el cuerpo a TipTap o ProseMirror conservando `ArticleDocument` como fuente de verdad.
- [ ] Soportar listas, citas, llamados, estadísticas, definiciones, imágenes y fuentes como bloques estructurados.
- [ ] Añadir historial de revisiones, comparación y restauración.
- [ ] Añadir comentarios y asignaciones editoriales.
- [ ] Mostrar presencia y resolver edición concurrente.
- [ ] Validar visualmente todas las plantillas en escritorio, tableta, móvil y exportación.

---

# Orden recomendado de implementación

1. **P0 — estabilidad y pruebas.** Evita automatizar fallos o duplicar acciones externas.
2. **P1.1–P1.3 — backend durable, herramientas y evidencia.** Produce investigación comprobable.
3. **P2 — borradores de WordPress.** Integrar primero `draft`; mantener `publish` bajo aprobación humana.
4. **P1.4–P1.6 — replanteamiento, límites y evaluaciones.** Aumentar autonomía de forma medible.
5. **P3/P4 — más CMS, editor estructurado y colaboración.** Escalar después de validar el ciclo principal.

## Primera entrega técnica sugerida

La primera iteración debe ser pequeña y verificable:

1. Endpoint backend `POST /api/marcie/research-runs`.
2. Ejecución con Google Search grounding y URL Context.
3. Persistencia de `ResearchSource`, `EvidenceRecord` y `ArticleClaim`.
4. Panel de matriz afirmación ↔ evidencia.
5. `WordPressPublisherAdapter.testConnection()` y `createDraft()`.
6. Prueba de integración contra un WordPress de staging.

No habilitar publicación automática en esta primera entrega.

## Referencias técnicas oficiales

- Gemini — Grounding with Google Search: https://ai.google.dev/gemini-api/docs/google-search
- Gemini — Function calling: https://ai.google.dev/gemini-api/docs/function-calling
- Gemini — URL Context: https://ai.google.dev/gemini-api/docs/url-context
- Gemini — File Search: https://ai.google.dev/gemini-api/docs/file-search
- Google Cloud Tasks: https://cloud.google.com/tasks/docs/create-tasks
- WordPress REST API — autenticación: https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/
- WordPress REST API — posts: https://developer.wordpress.org/rest-api/reference/posts/
- WordPress REST API — media: https://developer.wordpress.org/rest-api/reference/media/
- Contentful Content Management API: https://www.contentful.com/developers/docs/references/content-management-api/
