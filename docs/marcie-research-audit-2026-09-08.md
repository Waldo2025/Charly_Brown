# Auditoría del flujo de investigación de Marcie

## Síntoma

La redacción podía comenzar con una fuente verificada aunque la sesión solicitara ocho. El aviso de bibliografía incompleta describía el resultado, pero no impedía generarlo.

## Reproducción

Comando: `node --test functions/test/marcie-research-readiness.test.js`.

Antes de la corrección, las tres reproducciones iniciales fallaron de forma determinista: se conservaba 1 de 10 estudios disponibles, una búsqueda insuficiente no se ampliaba y la redacción no rechazaba un expediente con 1 de 8 fuentes.

Las pruebas usan respuestas de investigación y documentos controlados. No son una reproducción autenticada de la sesión real del usuario.

## Hallazgos

1. `marcie-mode-service.js` aceptaba y reutilizaba expedientes con cualquier fuente verificada. Además sustituía el estado del servidor por un cálculo local del número de fuentes.
2. `marcie-editorial-research.js` comprobaba solo cuatro resultados de cada plataforma. Aida solicitaba diversidad de dominios como filtro excluyente, eliminando estudios distintos alojados en el mismo repositorio.
3. La búsqueda no repetía consultas insuficientes. Las preferencias de tipo de fuente y la política del perfil no llegaban explícitamente al servidor.
4. Aida limitaba el objetivo a 12 fuentes en el cliente y mantenía un mínimo alternativo de tres fuentes actuales, diferente del objetivo configurado. La ventana de actualidad se formulaba como una restricción excesiva para estudios de base.
5. La verificación sobrescribía metadatos extraídos del documento, perdiendo autoría, revista y DOI. Si fallaba un lote de evaluación, se perdían también evaluaciones exitosas de otros lotes.
6. Aida recortaba el JSON del dossier a 22.000 caracteres al redactar, pudiendo dejar fuentes fuera del contexto e incluso cortar el JSON.
7. Faltaba importar `researchArticleEvidence` en el servicio que coordina Marcie y los perfiles personalizados. Las pruebas previas que lo inyectaban como dependencia no detectaban ese fallo de enlace.

## Hipótesis probadas

- La aceptación de un solo documento permite redactar prematuramente: confirmada con una prueba que cuenta las llamadas a redacción.
- Los recortes y el filtro por dominio explican la pérdida de documentos: confirmada con diez estudios del mismo repositorio.
- La configuración no llega íntegra a investigación: confirmada por inspección y corregida con pruebas del contrato para Marcie, Aida y personalizado.

## Causa raíz

No existía una condición común de investigación completa previa a la redacción. Los modos aplicaban umbrales distintos y se combinaban recortes de resultados, pérdida de metadatos y reutilización de expedientes incompletos. Estos fallos explican el comportamiento reproducido; sin registros de la sesión real no se puede atribuir su única fuente a un motivo de acceso concreto.

## Corrección

- Una política compartida exige el objetivo configurado, análisis documental completo y ausencia de bloqueos antes de redactar. Se aplica al coordinador y a las entradas directas de redacción.
- Se verifican todos los candidatos descubiertos, por lotes, sin limitar a cuatro por plataforma ni a un documento por dominio. Se deduplican documentos y se conserva su procedencia.
- Las consultas insuficientes se reformulan hasta tres rondas, respetando plataformas seleccionadas. El presupuesto técnico máximo es de 256 candidatos; si quedan resultados pendientes, se bloquea la redacción y se informa del límite.
- Los hallazgos de redacción proceden del análisis del texto recuperado. Los estudios anteriores pertinentes se conservan como no recientes, con su fecha real o sin fecha comprobada.
- Se transmiten región, periodo, número de fuentes, selección de plataformas, tipos de fuente y política de investigación del perfil. El tema no se sustituye por un tema genérico en la solicitud de investigación.
- La caché requiere coincidencia de tema, enfoque, audiencia, configuración y política, además de investigación suficiente y analizada.
- Se conservan metadatos bibliográficos y resultados exitosos cuando falla otro lote. Si falla la extracción opcional de citas textuales, se conserva el análisis y se indica usar paráfrasis verificadas.
- Aida recibe el dossier completo y no inicia otra búsqueda durante la redacción. La revisión de cantidad de fuentes usa el objetivo configurado, no un mínimo alternativo fijo de actualidad.
- Los expedientes incluyen estado de análisis, registros por plataforma y ronda, motivos de rechazo y recuentos. Los artículos existentes no se sobrescriben cuando la investigación falla.

## Validación

- Suite editorial: `node --test functions/test/marcie-*.test.js tests/marcie-wordpress-integration.test.mjs`.
- Pruebas de regresión para cantidad insuficiente, caché, diez estudios de un mismo repositorio, nuevas consultas, metadatos recuperados, propagación de preferencias, fallos parciales de evaluación y dossier Aida superior a 22.000 caracteres.
- Comprobación de sintaxis del servidor y revisión de espacios del diff en los archivos afectados.

## Riesgos y límites

- Cambios locales: no desplegados ni probados contra cuentas reales de las plataformas. La búsqueda utiliza grounding y recuperación pública de documentos, no accesos por suscripción.
- No se garantiza encontrar el objetivo en todos los temas. Acceso restringido, errores del proveedor y falta de documentos pertinentes deben detener la redacción, no generar referencias ficticias.
- La recuperación y el análisis conservan límites técnicos de tamaño y ejecución. Se analiza el contenido accesible recuperado, no se promete lectura integral de cualquier libro o PDF extenso.
- La función HTTP compartida tiene un tiempo máximo de ejecución de 120 segundos. Investigaciones extensas pueden agotar ese tiempo; el cliente no debe redactar con un resultado parcial. No se cambió la infraestructura compartida de otras aplicaciones.
- El aviso de bibliografía incompleta sigue siendo válido para artículos anteriores. Este cambio no regenera ni publica automáticamente artículos existentes.
