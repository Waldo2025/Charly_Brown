# Gemini + Firebase Playbook

Guía operativa para integrar Gemini Live/Flash con Firebase y validar modelos antes de producción.

## 1) Arquitectura recomendada

- Cliente web/app:
  - UI y streaming de respuesta.
  - Sin llaves embebidas en frontend para producción.
- Backend proxy (Cloud Functions o tu backend):
  - Firma y envío de requests a Gemini.
  - Rate limiting y observabilidad.
- Firebase:
  - Auth + App Check.
  - Remote Config para seleccionar `preferredModel` y `fallbackChain` sin redeploy.
  - Firestore para guardar métricas y resultados de smoke tests.

## 2) Elección de modelos por caso

- Tiempo real voz/chat: modelo Live/audio compatible.
- Respuesta rápida/costo bajo: `gemini-2.5-flash-lite`.
- Calidad superior: `gemini-2.5-flash` o `gemini-2.5-pro`.
- Solo usar previews en canary.

## 3) Política de fallback

- Configura en Remote Config:
  - `preferredModel`
  - `fallbackChain` (array ordenado)
  - `maxRetriesPerModel`
  - `timeoutMsByModel`
- Reglas:
  - Errores 429/5xx/timeout: retry corto + siguiente modelo.
  - 4xx no recuperables: no reintentar el mismo modelo.

## 4) Pruebas de modelos (smoke)

Usa el runner incluido:

```bash
npm run gemini:models
npm run gemini:smoke
npm run gemini:all
```

Requiere:

```bash
export GEMINI_API_KEY="..."
```

Salida:

- Reporte JSON en `backups/gemini-model-report-*.json`
- Recomendación automática de `preferredModel` + `fallbackChain`.

## 5) Seguridad mínima obligatoria

- Activar App Check en Firebase y mover a enforcement.
- No exponer secretos en frontend productivo.
- Auditar logs para detectar abuso (IP/uid/modelo/error).

## 6) Referencias oficiales

- Live API: https://ai.google.dev/api/live
- Live API guide: https://ai.google.dev/gemini-api/docs/live-guide
- List models: https://ai.google.dev/api/rest/generativelanguage/models/list
- Gemini models: https://ai.google.dev/gemini-api/docs/models/gemini
- Firebase AI Logic: https://firebase.google.com/docs/ai-logic
- Firebase AI Logic Live API: https://firebase.google.com/docs/ai-logic/live-api
- Firebase AI Logic models: https://firebase.google.com/docs/ai-logic/models
- App Check for AI Logic: https://firebase.google.com/docs/vertex-ai/app-check

