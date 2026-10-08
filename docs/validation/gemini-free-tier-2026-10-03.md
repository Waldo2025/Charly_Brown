# Gemini free tier attestation (2026-10-03)

- Modelo sondeado: `gemini-3.5-flash-lite`
- Disponible en la Developer API: sí
- Primera llamada: HTTP 200 (servida)
- Ráfaga de 40 llamadas: 12 respuestas 429
- Señal de bucket gratuito: sí; señal de facturación: no
- Servicios de grounding anunciados por los modelos: ninguno (el plan gratuito no los ofrece; fase 2)
- **Plan verificado: free**

## Variables resultantes

```sh
GEMINI_FREE_TIER_PLAN=free
GEMINI_FREE_TIER_TEXT_MODEL=gemini-3.5-flash-lite
```

## Modelos que ofrecen generateContent

- `gemini-2.5-flash`
- `gemini-2.5-pro`
- `gemini-2.5-flash-preview-tts`
- `gemini-2.5-pro-preview-tts`
- `gemma-4-26b-a4b-it`
- `gemma-4-31b-it`
- `gemini-flash-latest`
- `gemini-flash-lite-latest`
- `gemini-pro-latest`
- `gemini-2.5-flash-lite`
- `gemini-2.5-flash-image`
- `gemini-3-flash-preview`
- `gemini-3.1-pro-preview`
- `gemini-3.1-pro-preview-customtools`
- `gemini-3.1-flash-lite-preview`
- `gemini-3.1-flash-lite`
- `gemini-3-pro-image-preview`
- `gemini-3-pro-image`
- `nano-banana-pro-preview`
- `gemini-3.1-flash-image-preview`
- `gemini-3.1-flash-image`
- `gemini-3.1-flash-lite-image`
- `gemini-3.5-flash`
- `gemini-3.5-flash-lite`
- `gemini-omni-flash-preview`
- `gemini-omni-1.1-flash`
- `gemini-3.5-transcribe`
- `gemini-3.6-flash`
- `gemini-3.7-flash`
- `gemini-3.8-flash`
- `lyria-3-clip-preview`
- `lyria-3-pro-preview`
- `lyria-3.5`
- `gemini-3.1-flash-tts-preview`
- `gemini-3.8-flash-tts`
- `gemini-3.8-flash-lite-tts`
- `gemini-robotics-er-2-preview`
- `gemini-2.5-computer-use-preview-10-2025`
- `antigravity-preview-05-2026`
- `antigravity-preview-09-2026`
- `antigravity-preview-latest`
- `deep-research-max-preview-04-2026`
- `deep-research-preview-04-2026`
- `deep-research-pro-preview-12-2025`

## Notas

- Exporta GEMINI_FREE_TIER_PLAN=free y GEMINI_FREE_TIER_TEXT_MODEL=gemini-3.5-flash-lite en Functions.
- Confirma además que el proyecto no tiene facturación: gcloud billing projects describe <proyecto> --format="value(billingAccountName)" debe estar vacío.
- Una key de proyecto con facturación se factura en silencio: si aparece cualquier señal de billing, crea el secreto en otro proyecto.
