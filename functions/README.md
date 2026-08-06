# Charly Brown Google Functions

Paquete Node 22 para la migración de los backends Render. En la fase actual está registrado en `firebase.json`, pero Firebase Hosting todavía no dirige tráfico hacia estas funciones.

## Exports

- `podcasterApi`: health y contrato de subida resumible directa a Storage.
- `geminiApi`: `generateContent` mediante Vertex AI y ADC, sin API key.
- `veoApi`: frontera reservada para los trabajos asíncronos de Veo.
- `assetApi`: redirección a URLs V4 firmadas, con biblioteca pública y sesiones privadas.

## Validación local

```sh
npm install --prefix functions
npm run test:functions
npm run test:migration:session-compat
```

No ejecutar `firebase deploy --only functions` hasta completar cuentas de servicio, IAM, Cloud Tasks y pruebas de integración. El primer despliegue con `podcasterApi.minInstances=1` requiere confirmar el incremento de costo mediante la opción `--force` de Firebase CLI.
