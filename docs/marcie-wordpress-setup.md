# Configurar WordPress para Marcie Blog Editor

## Resultado

Marcie puede:

1. probar la conexión con WordPress;
2. subir la portada del artículo;
3. crear categorías y etiquetas necesarias;
4. crear o actualizar un borrador con slug determinista;
5. abrir el editor remoto;
6. publicar únicamente después de una confirmación explícita.

El backend vuelve a cargar la sesión desde Firestore. No acepta HTML ni credenciales enviados por el navegador y rechaza sesiones que no estén en estado `approved`.

## 1. Preparar WordPress

1. Usar un sitio con HTTPS válido y REST API disponible.
2. Crear un usuario técnico, por ejemplo `marcie-publisher`.
3. Asignarle el rol mínimo que permita editar entradas, subir medios, gestionar categorías/etiquetas y publicar. El botón **Probar conexión** verifica esas cuatro capacidades.
4. En WordPress, abrir **Usuarios → Perfil → Contraseñas de aplicación**.
5. Crear una contraseña llamada `Marcie Blog Editor` y copiarla una sola vez.

No usar la contraseña normal del usuario.

## 2. Guardar el secreto en Firebase

Desde la raíz del proyecto:

```sh
firebase functions:secrets:set MARCIE_WORDPRESS_CONFIG_JSON
```

Pegar como valor una sola línea JSON:

```json
{"baseUrl":"https://blog.example.com","username":"marcie-publisher","applicationPassword":"xxxx xxxx xxxx xxxx xxxx xxxx"}
```

La URL puede incluir una instalación en subdirectorio, por ejemplo `https://example.com/blog`.

Desplegar la función que contiene las rutas:

```sh
firebase deploy --only functions:geminiApi
```

La interfaz implementada usa deliberadamente la ruta same-origin de Firebase Hosting para mantener esta integración en el backend protegido por Secret Manager.

## 3. Verificar desde Marcie

1. Abrir una sesión y completar la auditoría.
2. Resolver los hallazgos y pulsar **Aprobar artículo**.
3. Pulsar el icono de envío o **Opciones → Publicar en WordPress**.
4. Pulsar **Probar conexión**.
5. Pulsar **Crear borrador en WordPress**.
6. Abrir el editor remoto y revisar el resultado.
7. Volver a Marcie y pulsar **Publicar ahora** solamente si el borrador es correcto.

## 4. Prueba recomendada

Realizar primero el recorrido en un WordPress de staging. Verificar:

- título, extracto y bloques;
- portada y texto alternativo;
- categoría y etiquetas;
- enlaces de fuentes;
- slug estable;
- creación repetida sin duplicar el artículo;
- rechazo de una sesión no aprobada;
- cambio final de `approved` a `published` solo después de que WordPress confirme `publish`.

## Seguridad y operación

- El secreto existe únicamente en el backend.
- Solo se permiten sitios HTTPS; localhost HTTP se puede habilitar exclusivamente con `MARCIE_WORDPRESS_ALLOW_INSECURE_LOCAL=true` en desarrollo.
- Se rechazan hosts privados, loopback y metadata de nube para reducir SSRF.
- Las llamadas tienen timeout y no siguen redirecciones.
- El propietario autenticado debe coincidir con el propietario de la sesión.
- El usuario de Charly Brown debe estar aprobado.
- La creación reserva una publicación en Firestore y usa un slug determinista para reducir duplicados.
- No se reintenta automáticamente una escritura incierta a WordPress.

## Rutas internas

- `GET /api/marcie/wordpress/status`
- `POST /api/marcie/wordpress/test`
- `POST /api/marcie/wordpress/draft`
- `POST /api/marcie/wordpress/publish`

Todas requieren un Firebase ID token válido.
