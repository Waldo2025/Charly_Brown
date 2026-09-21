# Sally — conversaciones independientes

Implementación local, 8 de septiembre de 2026. No se publicó Hosting ni se modificó Cloud Run.

## Entregado

- Conversaciones con identidad estable por proyecto y pestaña, creación, nombre, archivo/restauración, borrador local por usuario y recuperación del último hilo.
- Historial privado inmutable con conversationId; vistas heredadas deterministas sin reescribir los archivos anteriores.
- Panel lateral de resultados con versiones, reportes, inventarios, planes y registros completos; cierre por teclado y retorno del foco.
- Contexto exclusivo de cada conversación, memoria extractiva acotada con referencias y originales íntegros. Referencias explícitas entre conversaciones.
- Reutilización de inventarios completos compatibles con la URL; actualización explícita o tras cambios registrados en destino.
- Respuesta de IA tardía guardada en la conversación original. Durante operaciones del navegador se mantiene el bloqueo de cambio; durante espera de respuesta de lectura se permite seleccionar otro hilo.
- Aprobación vinculada a conversación, destino y contenido exacto del plan; requiere nueva aprobación tras cambiar de conversación o recargar.
- Nuevos módulos incluidos en la lista de publicación selectiva para evitar imports ausentes en el próximo despliegue.

## Verificación

Pasaron: test-sally-conversations, test-sally-redesign, test-sally-history, test-sally-session-selection, test-sally-remote, test-sally-chat-routing, test-sally-report y test-sally-brown-editor. Comprobaciones de sintaxis de los módulos modificados correctas.

Las pruebas de navegador usan la UI real con Firebase y respuestas remotas simuladas: aislamiento, cambio mientras se espera a IA, reutilización sin recorrer Moodle, errores de Storage, rechazo de aprobación ajena, creación/renombrado/archivo, versiones y móvil. La prueba de Storage existente verifica separación de proyectos y retención íntegra.

Capturas revisadas: sally-independent-conversations-desktop.png y sally-independent-conversations-mobile.png.

## Límites

No se ejecutaron cambios en un Moodle real ni pruebas de reglas con emuladores. No se editaron reglas de Firestore/Storage, backend, encabezado o sidebar compartido. La autorización sigue dependiendo de las reglas existentes de participación del proyecto; no se añadieron permisos públicos.

Los errores anteriores de conectividad/Cloud Run y el límite de duración de generación síncrona no forman parte de este cambio.
