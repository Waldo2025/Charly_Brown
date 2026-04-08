# Security Best Practices Report

## Executive Summary

Se reviso la carpeta `public/` con foco en dos objetivos:

1. reducir riesgos reales de seguridad del frontend;
2. reducir condiciones que pueden terminar en advertencias de Google o Chrome del tipo sitio engañoso, comprometido o abusivo.

La conclusion es que hoy el mayor riesgo no es un "bloqueo de Google" por un detalle aislado, sino la combinacion de:

- varias rutas de renderizado HTML dinamico con `innerHTML`,
- ausencia visible en repo de una CSP estricta y de otros headers base,
- dependencias remotas y SDKs viejos,
- contenido editable/comentable sin controles visibles de antiabuso en `public`,
- un service worker que persiste respuestas remotas permitidas.

Tambien hay una mitigacion parcial importante: el frontend ya inicializa Firebase App Check en algunas pantallas, pero eso no compensa por si solo los problemas anteriores y no demuestra, en este alcance, verificacion server-side.

## Scope And Risk Gate

- Alcance revisado: solo `public/`.
- Stack identificado: HTML estatico, JavaScript modular, jQuery legado en varias vistas, Firebase Web SDK, service worker, flujos con contenido editable y comentarios.
- Ruta critica que podria romperse si se endurece sin rollout:
  - editores WYSIWYG,
  - vistas que renderizan HTML generado por IA o usuarios,
  - pantallas que dependen de scripts remotos `gstatic`.
- Riesgo de regresion alto si se cambia de golpe:
  - CSP,
  - sanitizacion,
  - carga de scripts remotos,
  - service worker.
- Rollback recomendado:
  - desplegar endurecimiento en fases,
  - primero inventario y limpieza de sinks,
  - despues CSP en modo observacion y luego enforcement,
  - despues upgrade/bundling de dependencias.
- Validacion recomendada:
  - smoke test manual de todas las paginas HTML de `public/`,
  - prueba de login, registro, edicion, comentarios, chat, lecturas, generacion y juego,
  - inspeccion runtime de headers y Search Console Security Issues report.

## Key Findings

### PUB-001
- Severity: Critical
- Rule ID: JS-XSS-001
- Location:
  - [public/contenidoUnidad-.js](/Users/waldolopez/Documents/CharlyBrown/public/contenidoUnidad-.js#L653)
  - [public/contenidoUnidad-.js](/Users/waldolopez/Documents/CharlyBrown/public/contenidoUnidad-.js#L670)
  - [public/contenidoUnidad-.js](/Users/waldolopez/Documents/CharlyBrown/public/contenidoUnidad-.js#L672)
  - [public/home.js](/Users/waldolopez/Documents/CharlyBrown/public/home.js#L889)
  - [public/home.js](/Users/waldolopez/Documents/CharlyBrown/public/home.js#L892)
  - [public/home.js](/Users/waldolopez/Documents/CharlyBrown/public/home.js#L903)
- Evidence:
  - `tempDiv.innerHTML = htmlAnalisis;`
  - `analisisContenido.innerHTML += htmlAnalisis;`
  - `analisisContenido.innerHTML = \`<div class="analisis-wrapper">\${htmlAnalisis}</div>\`;`
  - `contenedor.innerHTML += html;`
  - `contenedor.innerHTML += \`<div style="background: url(\${urlImagen}) ...`
- Impact:
  - Si HTML generado por IA, Firestore, uploads o contenido colaborativo llega a estas rutas sin limpieza robusta, se abre la puerta a XSS almacenado o reflejado. Ese tipo de compromiso es exactamente la clase de problema que puede terminar en contenido malicioso, phishing inyectado o acciones no autorizadas en tu dominio.
- Fix:
  - Sustituir `innerHTML` por construccion explicita de nodos donde el contenido sea texto.
  - Cuando realmente necesites HTML enriquecido, centralizar toda insercion en una sola utilidad robusta y aplicar sanitizacion consistente antes del sink.
  - Prohibir concatenacion HTML ad hoc en vistas criticas.
- Mitigation:
  - Priorizar primero las pantallas con contenido generado por IA, edicion enriquecida o datos guardados en Firestore.
- False positive notes:
  - Algunas rutas ya usan sanitizacion en otras partes del repo, pero en estas lineas el sink sigue siendo real y de alto impacto.

### PUB-002
- Severity: High
- Rule ID: WEB-CSP-001
- Location:
  - [public/index.html](/Users/waldolopez/Documents/CharlyBrown/public/index.html#L3)
  - [public/unidadHome.html](/Users/waldolopez/Documents/CharlyBrown/public/unidadHome.html#L3)
  - [public/crearUnidades.html](/Users/waldolopez/Documents/CharlyBrown/public/crearUnidades.html#L3)
- Evidence:
  - En los entrypoints revisados no aparece ninguna `Content-Security-Policy` por meta tag.
  - Tampoco hay evidencia en `public/` de `Referrer-Policy`, `Permissions-Policy` o `X-Content-Type-Options`; estos podrian existir en hosting/edge, pero no son visibles aqui.
- Impact:
  - Sin una CSP estricta visible, una inyeccion HTML tiene mas margen para convertirse en ejecucion de script o carga de recursos no confiables. Esto empeora el riesgo tecnico y reputacional del sitio.
- Fix:
  - Definir una CSP estricta por header en hosting/CDN. Si no es posible, usar meta CSP como paso intermedio.
  - Añadir al menos:
    - `default-src 'self'`
    - `object-src 'none'`
    - `base-uri 'none'`
    - `script-src` restringido a `self` y origins estrictamente necesarios
    - `frame-src` solo para embeds requeridos
  - Verificar tambien `X-Content-Type-Options: nosniff`, `Referrer-Policy` y clickjacking protection a nivel de hosting.
- Mitigation:
  - Empezar en modo reporte/observacion si tu hosting lo soporta, porque este repo tiene muchas paginas y scripts.
- False positive notes:
  - Este hallazgo es "no visible en repo". Debe confirmarse en runtime con el navegador y el hosting final.

### PUB-003
- Severity: High
- Rule ID: CLOUD-KEYS-001
- Location:
  - [public/firebase-web-config.js](/Users/waldolopez/Documents/CharlyBrown/public/firebase-web-config.js#L3)
  - [public/firebase-web-config.js](/Users/waldolopez/Documents/CharlyBrown/public/firebase-web-config.js#L14)
  - [public/firebase-app-check.js](/Users/waldolopez/Documents/CharlyBrown/public/firebase-app-check.js#L18)
  - [public/home.js](/Users/waldolopez/Documents/CharlyBrown/public/home.js#L15)
  - [public/home.js](/Users/waldolopez/Documents/CharlyBrown/public/home.js#L18)
  - [public/index.js](/Users/waldolopez/Documents/CharlyBrown/public/index.js#L23)
  - [public/index.js](/Users/waldolopez/Documents/CharlyBrown/public/index.js#L39)
- Evidence:
  - Existe una API key de Firebase expuesta en cliente: `apiKey: "AIzaSy..."`.
  - El proyecto ya intenta usar App Check en frontend.
- Impact:
  - La config web de Firebase es publica por diseño, pero Google indica que las API keys no deben quedar sin restricciones. Si esta key no esta restringida por APIs y por origenes HTTP referrer, se vuelve un vector de abuso y de señal de mala postura.
- Fix:
  - Confirmar en Google Cloud Console que la key tenga:
    - restricciones de aplicacion por `HTTP referrers`,
    - restricciones por API solo a los servicios necesarios,
    - rotacion si hubo exposicion previa accidental en otros repos o builds.
  - Mantener App Check, pero no tratarlo como sustituto de restricciones de key ni de reglas backend.
- Mitigation:
  - Documentar de forma explicita cuales dominios productivos estan autorizados y eliminar referrers comodin.
- False positive notes:
  - Que la key este en el frontend no es, por si solo, una vulnerabilidad. El riesgo depende de si esta restringida o no. Esa configuracion no es visible en el repo.

### PUB-004
- Severity: High
- Rule ID: SEARCH-ABUSE-001
- Location:
  - [public/home.js](/Users/waldolopez/Documents/CharlyBrown/public/home.js#L113)
  - [public/home.js](/Users/waldolopez/Documents/CharlyBrown/public/home.js#L167)
  - [public/home.js](/Users/waldolopez/Documents/CharlyBrown/public/home.js#L196)
  - [public/home.js](/Users/waldolopez/Documents/CharlyBrown/public/home.js#L1270)
  - [public/chat.js](/Users/waldolopez/Documents/CharlyBrown/public/chat.js#L412)
- Evidence:
  - Hay flujos de comentarios y mensajeria con contenido generado por usuarios y guardado en Firestore.
  - En `public/` no se ven controles de antiabuso equivalentes a moderacion, reputacion, CAPTCHA, reportes de abuso o colas de revision para contenido publico.
- Impact:
  - Google documenta que el spam generado por usuarios y el contenido engañoso son motivos directos para problemas de reputacion y seguridad. Si alguien usa comentarios, chat o contenido compartido para inyectar spam, phishing o enlaces engañosos, el dominio puede verse afectado.
- Fix:
  - Definir que contenido de usuarios es publico, privado o moderado.
  - Añadir controles antiabuso donde aplique:
    - rate limit,
    - bloqueo por reputacion o rol,
    - revision/moderacion,
    - opcion de reportar abuso,
    - limpieza automatica de contenido sospechoso.
  - Si algun flujo no debe ser indexable/publico, mantenerlo autenticado y fuera de discovery publico.
- Mitigation:
  - Monitorizar Search Console Security Issues y contenido nuevo indexado.
- False positive notes:
  - No estoy afirmando que hoy tengas spam activo. El hallazgo es que la superficie existe y no se ven controles suficientes en `public/`.

### PUB-005
- Severity: Medium
- Rule ID: JQ-SUPPLY-001 / SUPPLY-CHAIN-001
- Location:
  - [public/unidadHome.html](/Users/waldolopez/Documents/CharlyBrown/public/unidadHome.html#L13)
  - [public/crearUnidades.html](/Users/waldolopez/Documents/CharlyBrown/public/crearUnidades.html#L16)
  - [public/vendor/jquery/jquery.min.js](/Users/waldolopez/Documents/CharlyBrown/public/vendor/jquery/jquery.min.js#L1)
- Evidence:
  - Se cargan Firebase SDKs remotos `9.1.3` desde `gstatic`.
  - El proyecto mantiene jQuery `v3.6.4`.
  - No se ve uso de `integrity` en los scripts remotos de `gstatic`.
- Impact:
  - Dependencias viejas o remotas no significan compromiso inmediato, pero amplian la superficie de supply chain y complican el endurecimiento con CSP estricta.
- Fix:
  - Inventariar dependencias remotas y migrar a versionado controlado o bundling donde sea posible.
  - Unificar versiones de Firebase; ahora conviven `9.1.3` y `9.19.1`.
  - Reducir jQuery y plugins heredados en flujos criticos.
- Mitigation:
  - Mantener allowlist minima de origins externos y revisar cambios de version antes de desplegar.
- False positive notes:
  - No se identifico en esta revision una CVE explotada activamente en esos archivos concretos; el hallazgo es de postura y reduccion de riesgo.

### PUB-006
- Severity: Medium
- Rule ID: SW-CACHE-001
- Location:
  - [public/lecturasGame-sw.js](/Users/waldolopez/Documents/CharlyBrown/public/lecturasGame-sw.js#L33)
  - [public/lecturasGame-sw.js](/Users/waldolopez/Documents/CharlyBrown/public/lecturasGame-sw.js#L62)
  - [public/lecturasGame-sw.js](/Users/waldolopez/Documents/CharlyBrown/public/lecturasGame-sw.js#L178)
  - [public/lecturasGame-sw.js](/Users/waldolopez/Documents/CharlyBrown/public/lecturasGame-sw.js#L184)
- Evidence:
  - El service worker permite y cachea recursos remotos de `www.gstatic.com`, `firebasestorage.googleapis.com` y `storage.googleapis.com`.
  - Para requests remotos de tipo `style`, `font`, `image`, `audio`, `script`, los guarda en cache runtime.
- Impact:
  - Si un recurso remoto permitido se sirviera de forma inesperada, indeseada o abusiva, el service worker puede persistirlo localmente y prolongar el problema en clientes.
- Fix:
  - No cachear scripts remotos salvo necesidad comprobada.
  - Limitar el cache runtime remoto a tipos y rutas estrictamente necesarias.
  - Versionar y limpiar agresivamente cuando cambien dependencias externas.
- Mitigation:
  - Revisar si realmente necesitas cachear `script` remoto en este SW.
- False positive notes:
  - El allowlist de hosts es relativamente acotado; el problema aqui es persistencia y alcance, no apertura indiscriminada.

### PUB-007
- Severity: Medium
- Rule ID: SANITIZE-001
- Location:
  - [public/security-utils.js](/Users/waldolopez/Documents/CharlyBrown/public/security-utils.js#L64)
  - [public/security-utils.js](/Users/waldolopez/Documents/CharlyBrown/public/security-utils.js#L68)
  - [public/security-utils.js](/Users/waldolopez/Documents/CharlyBrown/public/security-utils.js#L88)
- Evidence:
  - La sanitizacion HTML es casera y basada en allow/block logic manual.
  - Se permite `data:image/...` y el sanitizador no implementa Trusted Types ni una libreria especializada.
- Impact:
  - Los sanitizadores hechos a mano tienden a quedarse cortos con el tiempo. En un proyecto con IA, rich text, iframes, comentarios y editores, esta decision tiene riesgo estructural.
- Fix:
  - Reemplazar o reforzar con una libreria probada para sanitizacion HTML.
  - Reducir el conjunto de tags/attrs permitidos al minimo real.
  - Evaluar deshabilitar `svg+xml` en data URLs salvo necesidad demostrada.
- Mitigation:
  - Mientras tanto, centralizar todos los sinks HTML en pocas funciones para auditar mejor.
- False positive notes:
  - No estoy afirmando bypass confirmado del sanitizador actual; el hallazgo es que la estrategia no es suficientemente robusta para este nivel de superficie.

## Google-Aligned Actions

1. Prioridad 1: inventariar y eliminar todos los `innerHTML` que reciben contenido no constante o HTML armado por concatenacion.
2. Prioridad 1: desplegar una CSP estricta por header y validar en todas las paginas de `public`.
3. Prioridad 1: confirmar y documentar restricciones de la API key de Firebase por referrer y por API.
4. Prioridad 2: introducir controles antiabuso visibles en comentarios, chat y cualquier flujo colaborativo/publico.
5. Prioridad 2: dejar de cachear scripts remotos en el service worker del juego salvo justificacion fuerte.
6. Prioridad 2: unificar y actualizar Firebase SDKs y reducir dependencias remotas heredadas.
7. Prioridad 3: reemplazar el sanitizador manual por una solucion especializada y luego migrar sinks a esa unica capa.

## Validation Checks

- Runtime:
  - abrir cada HTML principal de `public/` y verificar headers reales con DevTools;
  - comprobar que Search Console no reporte Security Issues;
  - revisar consola por bloqueos CSP despues de endurecer.
- Codigo:
  - `rg -n "innerHTML|insertAdjacentHTML|outerHTML|document.write|eval\\(" public`
  - `rg -n "https://www.gstatic.com|https://|http://" public`
  - `rg -n "apiKey|AIza" public`
- Operacion:
  - verificar en Google Cloud Console que la key web este restringida;
  - revisar dominios autorizados de Firebase Auth;
  - revisar que los flujos con contenido de usuarios tengan moderacion o alcance privado.

## Sources

Acceso: 2026-03-24

- Google Search Central: [Social engineering (phishing and deceptive sites)](https://developers.google.com/search/docs/monitor-debug/security/social-engineering)
- Google Search Central: [Evita el spam generado por usuarios en tu sitio y plataforma](https://developers.google.com/search/docs/monitor-debug/prevent-abuse?hl=es-419)
- Google Search Central: [How To Use Search Console](https://developers.google.com/search/docs/monitor-debug/search-console-start)
- web.dev: [Mitigate XSS with a strict Content Security Policy (CSP)](https://web.dev/articles/strict-csp)
- Google Identity: [OAuth 2.0 Best Practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)
- Google Cloud: [Manage API keys](https://docs.cloud.google.com/docs/authentication/api-keys)
- Google Cloud Architecture Center: [Security, privacy, and compliance pillar](https://docs.cloud.google.com/architecture/framework/security)

## Notes On Interpretation

- Hechos documentados:
  - Google asocia advertencias de sitio engañoso con contenido de social engineering.
  - Google recomienda prevenir spam generado por usuarios.
  - Google recomienda CSP estricta para reducir XSS.
  - Google Cloud indica que las API keys sin restricciones son inseguras.
- Inferencias aplicadas a este repo:
  - Si las rutas de `innerHTML` y la ausencia de CSP se combinan con contenido editable o colaborativo, el riesgo de que el sitio termine sirviendo contenido engañoso o malicioso sube de forma material.
  - Si la key web no esta restringida, el riesgo operativo y reputacional del proyecto aumenta aunque la key sea "publica por diseño".
