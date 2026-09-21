# Tiempo de espera del contenido de PigPen — v345

## Síntoma
El endpoint geminiApi devolvió HTTP 503 `gemini_upstream_timeout` durante el relleno de una sala.

## Reproducción y hallazgos
Cloud Logging registra el 12 de septiembre de 2026 a las 13:03:48 UTC una respuesta 503 de la revisión geminiapi-00086-row con latencia de 105,079833352 segundos. La función desplegada permite 540 segundos. Su código, en cambio, interrumpe la espera del proveedor a los 105 segundos mediante Promise.race.

La prueba con reloj simulado verifica que una respuesta recibida a los 120 segundos se acepta con el plazo de 480 segundos. También verifica que los límites siguen rechazando solicitudes que no terminan.

## Causa raíz
El temporizador interno conservaba el presupuesto de una configuración antigua de 120 segundos. El comentario también seguía indicando ese límite antiguo. El fallo observado coincide exactamente con ese temporizador; no demuestra un error de JSON ni un rechazo por cuota.

## Fix
El frontend identifica el relleno con generationProfile=pigpen-fixed-content. El backend concede 480 segundos únicamente si ese perfil acompaña a singleAttempt=true. Se reservan 60 segundos dentro del límite total de 540 para terminar la respuesta. Otras solicitudes conservan 105 segundos. No se añaden llamadas, paralelismo ni reintentos.

Si se alcanza el límite, el frontend explica la interrupción y la conservación de las salas terminadas.

## Validación
31 pruebas aprobadas: plazos estándar y ampliado, perfil explícito, una única llamada, checkpoints y relleno de texto de los tipos de preguntas. Comprobada la referencia v345 que sirve localhost. Sintaxis de backend y frontend válida.

El despliegue usa la fuente publicada descargada de Cloud Storage más únicamente el cambio de plazo/perfil en src/index.js. No incluye otros cambios del repositorio local.

## Límites
No se consumió una generación real de Gemini para medir su próxima latencia. El proveedor puede tardar más de 480 segundos; el cambio elimina el corte prematuro demostrado, no garantiza su disponibilidad. Los avances anteriores al timeout se conservan; no se puede recuperar el resultado de una petición cuya respuesta ya se perdió.

## Despliegue comprobado
Revisión geminiapi-00087-wih ACTIVE, con 100% del tráfico y timeout total de 540 segundos. Verificación del endpoint con GET: HTTP 405 y mensaje esperado que solicita POST; no se invocó Gemini. El frontend local sirve v345.
