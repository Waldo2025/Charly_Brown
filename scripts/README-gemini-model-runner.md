# Gemini Model Runner

Pruebas de humo para modelos Gemini y recomendación de fallback chain.

## Requisitos

- Node 18+
- Variable de entorno: `GEMINI_API_KEY` (o `GOOGLE_API_KEY`)

## Comandos

```bash
npm run gemini:models
npm run gemini:smoke
npm run gemini:all
```

## Opciones útiles

```bash
node scripts/gemini-model-runner.mjs --list
node scripts/gemini-model-runner.mjs --smoke --models gemini-2.5-flash-lite,gemini-2.5-flash
node scripts/gemini-model-runner.mjs --smoke --all --timeout-ms 25000 --max-output-tokens 180
```

## Salida

- Muestra resultado por modelo (`OK/FAIL`, latencia, error).
- Genera reporte JSON en `backups/gemini-model-report-*.json`.
- Imprime política recomendada:
  - `preferredModel`
  - `fallbackChain`
  - `preferredModelTextSafe`
  - `fallbackChainTextSafe`
