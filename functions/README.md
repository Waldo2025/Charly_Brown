# Charly Brown Google Functions

Paquete Node 22 para la migración de los backends Render. Firebase Hosting dirige las rutas declaradas en `firebase.json` hacia estas funciones.

## Exports

- `podcasterApi`: health y contrato de subida resumible directa a Storage.
- `geminiApi`: `generateContent` mediante Vertex AI y ADC, sin API key.
- `geminiApi`: también expone la publicación segura de Marcie en WordPress (`status`, `test`, `draft` y `publish`).
- `veoApi`: frontera reservada para los trabajos asíncronos de Veo.
- `assetApi`: streaming autenticado de medios con soporte Range, además de URLs V4 firmadas para imágenes y descargas.

## Validación local

```sh
npm install --prefix functions
npm run test:functions
npm run test:migration:session-compat
```

No ejecutar `firebase deploy --only functions` hasta completar cuentas de servicio, IAM, Cloud Tasks y pruebas de integración. El primer despliegue con `podcasterApi.minInstances=1` requiere confirmar el incremento de costo mediante la opción `--force` de Firebase CLI.

## WordPress para Marcie

La credencial se inyecta como un único secreto JSON de Firebase Functions:

```sh
firebase functions:secrets:set MARCIE_WORDPRESS_CONFIG_JSON
```

El valor debe tener esta forma (sin guardarlo en el repositorio):

```json
{"baseUrl":"https://blog.example.com","username":"marcie-publisher","applicationPassword":"xxxx xxxx xxxx xxxx xxxx xxxx"}
```

Después se despliega `geminiApi`. La interfaz de Marcie permite probar la conexión, crear el borrador del artículo aprobado y, tras una segunda confirmación, publicarlo. Consulta `docs/marcie-wordpress-setup.md` para la preparación del usuario y la prueba de staging.
