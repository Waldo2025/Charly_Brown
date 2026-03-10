# Security Best Practices Report

## Executive Summary
Se corrigió la caída de Firebase Auth (`auth/api-key-not-valid`) y se aplicó hardening balanceado anti-phishing/XSS en código activo. El riesgo principal era una configuración inválida de `apiKey` en frontend y renderizado HTML de datos remotos sin sanitización.

## Root Cause del fallo Firebase
- Error observado: `POST https://identitytoolkit.googleapis.com/...key=__FIREBASE_WEB_API_KEY_LOCAL__ 400`.
- Causa exacta: el placeholder `__FIREBASE_WEB_API_KEY_LOCAL__` estaba en archivos de producción, incluyendo login.
- Evidencia:
  - `public/index.js:20` (antes de corrección)
  - `public/perfil.js:7` (antes de corrección)
  - `public/home.js:16` (antes de corrección)
- Mitigación aplicada:
  - Reemplazo en código activo por la `apiKey` web pública válida de Firebase.
  - Configuración centralizada en `public/firebase-web-config.js`.
  - Validación fail-fast de configuración en flujos críticos (`index.js`, `perfil.js`).

## Hallazgos y mitigaciones de seguridad

### [SEC-006] XSS por `innerHTML` con datos de usuario/Firestore
- Severity: High
- Impacto: ejecución de HTML/script inyectado por contenido persistido (comentarios, perfiles, metadatos).
- Evidencia:
  - `public/home.js` en comentarios y tarjetas con datos remotos.
  - `public/gestionUsuarios.js` render de tabla de usuarios.
  - `public/chatbot.js` render directo de mensajes.
- Mitigación aplicada:
  - Utilidades comunes `escapeHtml` y `safeUrl` en `public/security-utils.js`.
  - Sanitización en renderizados críticos:
    - `public/home.js`
    - `public/gestionUsuarios.js`
    - `public/chatbot.js`
  - Eliminación de `innerHTML` directo para contenido de chat; se usa texto seguro.

### [SEC-007] Riesgo de phishing/reputación por enlaces dinámicos inseguros
- Severity: Medium
- Impacto: apertura de enlaces manipulados o esquemas peligrosos desde datos remotos.
- Evidencia:
  - Tarjetas con `href` dinámico en `public/home.js`.
- Mitigación aplicada:
  - Validación de URLs con `safeUrl`.
  - Uso de `rel="noopener noreferrer"` en enlaces externos generados dinámicamente.

### [SEC-008] Ausencia de políticas de navegador (CSP/headers)
- Severity: Medium
- Impacto: menor defensa en profundidad ante XSS/clickjacking/sniffing.
- Mitigación aplicada:
  - Headers de hosting en `firebase.json`:
    - `Content-Security-Policy` (perfil moderado compatible)
    - `Referrer-Policy: strict-origin-when-cross-origin`
    - `X-Content-Type-Options: nosniff`
    - `Permissions-Policy` (camera/microphone restringidos a self)

## Cambios técnicos aplicados
- Nuevo módulo de config Firebase web: `public/firebase-web-config.js`.
- Nuevo cliente API autenticado: `public/api-client.js`.
- Endurecimiento en:
  - `public/index.js`
  - `public/perfil.js`
  - `public/home.js`
  - `public/gestionUsuarios.js`
  - `public/chatbot.js`
- Endurecimiento de hosting security headers en `firebase.json`.

## Riesgo residual
- Existen más usos de `innerHTML` en otros módulos no priorizados en esta pasada; requieren saneamiento incremental para riesgo mínimo absoluto.
- Persisten placeholders de `GEMINI/HF` en frontend por diseño de migración a backend; no son llaves reales.

## Estado de release (2026-03-10)
- Bloqueante funcional: la función HTTP `api` aún no aparece desplegada en `charly-brown` (se observan solo `charlyReadData` y `generarImagen`), por lo que `/api/*` no está operativo en producción.
- Bloqueante IAM: el deploy de `functions:api` requiere permiso `cloudfunctions.functions.setIamPolicy` en el proyecto.
- Mitigación aplicada en frontend:
  - En producción, `generarUnidad.js` exige backend `/api/*` y ya no permite fallback directo con API key.
  - El modo directo Gemini queda restringido a localhost con bandera explícita (`allowDirectGemini`/`forceDirectGemini`).
- Mitigación aplicada en backend:
  - CORS ampliado a orígenes productivos (`*.web.app`, `*.firebaseapp.com` del proyecto) y configurable por `CORS_ALLOWED_ORIGINS`.
  - Validación de modelo/payload de Gemini y sanitización de respuestas de error para evitar fuga de internals.

## Recomendaciones operativas
1. Ejecutar smoke completo de login/registro/perfil/home/chatbot tras deploy.
2. Validar en navegador que CSP no bloquee recursos críticos.
3. Continuar remediación de `innerHTML` en módulos restantes (`voiceTranscribe`, `moodleCourse`, `contenidoUnidad*`).
