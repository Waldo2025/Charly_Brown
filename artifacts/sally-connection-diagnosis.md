# Diagnóstico del registro de conexión

## Síntoma

El registro reúne desconexión al entrar en BFCache, errores del canal Firestore,
rechazo del análisis por login Moodle, respuestas 429 y una respuesta 502 de IA.

## Reproducción

Se inspeccionó el archivo adjunto, el cliente local y los registros de Cloud Run.
Los preflight actuales de Sally y Gemini desde el origen local respondieron 204.
El preflight de Sally contiene el origen `http://127.0.0.1:5010` permitido.
No se reprodujeron las peticiones privadas del usuario ni se usaron sus tokens.

## Hallazgos

- Cloud Run confirmó varios 429 entre 13:57 y 13:58 UTC: la solicitud se abortó
  porque no había una instancia disponible. Posteriormente hubo respuestas 200.
- El servidor de Sally devolvió un mensaje explícito de login Moodle requerido.
- `SallyBrownEditor.js` dispone conexiones y listeners en `pagehide`, sin una
  recuperación en `pageshow` para restauraciones desde BFCache.
- El cliente envía inventarios e historial completos en la solicitud síncrona de
  IA. Esto debe medirse antes de atribuirle la causa del 502.
- Gemini API registró respuestas 200 de 68 y 81 segundos. Esa duración supera el
  [límite de 60 segundos de Firebase Hosting](https://firebase.google.com/docs/hosting/functions).
  Es una incompatibilidad de la ruta síncrona y una causa probable del fallo del
  cliente; no se pudo correlacionar un identificador de petición con el 502 exacto.

## Hipótesis probadas

1. CORS incorrecto permanente: no sustentado por los preflight actuales. Los 429
   de infraestructura no pasan por el middleware de la aplicación.
2. Falta temporal de instancia: confirmada por Cloud Run para los 429.
3. Cliente descartado tras BFCache: el código confirma la ausencia de
   recuperación; falta reproducción completa con la sesión del usuario.

## Causa raíz

No hay evidencia de una única causa que explique todo. El 429 procede de la
infraestructura; el 400 de análisis corresponde al control de sesión Moodle.
La causa exacta del 502 y de las interrupciones del canal Firestore sigue abierta.

## Fix

No se modificó código ni infraestructura en este diagnóstico. Las siguientes
correcciones propuestas son recuperar conexiones tras BFCache, controlar
reintentos y medir/dividir la generación de IA cuando corresponda. Aumentar
instancias sin resolver afinidad/estado de Chromium no es una solución segura.

## Validación

Lectura de registros, revisión estática del ciclo de página y preflight reales.
No se ejecutaron cambios en Moodle ni solicitudes de generación pagadas.

## Riesgos / regresiones

Un preflight correcto ahora no demuestra que el incidente nunca se repita.
No hay evidencia suficiente para atribuir todos los errores a permisos Firebase,
a la conexión del usuario, o al tamaño del prompt. Recargar no garantiza resolver
la disponibilidad del servidor ni la sesión Moodle.
