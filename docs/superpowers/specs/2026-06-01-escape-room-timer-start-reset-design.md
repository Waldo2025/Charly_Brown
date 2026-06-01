# Escape room export: temporizador, iniciar y reiniciar

## Objetivo

Agregar al export y al preview del escape room tres controles operativos:

1. **Temporizador visible** basado en la duración configurada del proyecto.
2. **Botón “Iniciar escape room”** para arrancar la partida.
3. **Botón “Reiniciar escape room”** para limpiar todo el estado y volver al inicio.

La cuenta regresiva debe **seguir corriendo aunque la página se recargue**.  
Solo el reinicio manual debe devolver todo a cero.

## Alcance

Este cambio afecta al runtime generado por el builder del escape room y a la plantilla que comparten preview y export.

Queda incluido:
- mostrar el tiempo restante antes y durante la partida
- arrancar el contador al pulsar iniciar
- persistir el estado del temporizador en `localStorage`
- bloquear el juego cuando el tiempo llegue a cero
- reiniciar por completo progreso, respuestas, pantallas y temporizador

Queda fuera de alcance:
- cambiar cómo se configura la duración en el formulario
- añadir pausa manual
- añadir reanudación manual separada de la recarga
- añadir límites por sala distintos al tiempo global del escape room

## Comportamiento funcional

### 1) Estado previo al inicio

Al abrir el export, la experiencia arranca en modo **no iniciado**:
- el temporizador se muestra en valor inicial derivado de la duración configurada
- el contenido narrativo y la navegación pueden verse, pero la interacción de juego queda bloqueada
- el botón principal visible es **“Iniciar escape room”**
- el botón **“Reiniciar escape room”** permanece disponible para devolver todo a cero, aunque antes de iniciar tenga el mismo efecto de limpieza

### 2) Estado en curso

Al pulsar **Iniciar escape room**:
- se registra la hora de inicio y el instante de finalización esperado
- el temporizador comienza a decrementar
- el estado se guarda en `localStorage`
- si el usuario recarga la página, la cuenta regresiva continúa con el tiempo real restante
- el progreso del juego continúa guardándose con el sistema ya existente

### 3) Estado agotado

Si el temporizador llega a `0`:
- la partida queda bloqueada
- no se pueden verificar nuevas respuestas ni avanzar
- se muestra un estado de fin por tiempo agotado
- el único camino operativo es pulsar **Reiniciar escape room**

### 4) Reinicio total

Al pulsar **Reiniciar escape room**:
- se borra el estado del temporizador
- se borra el progreso del juego
- se borran respuestas, selecciones, emparejamientos, misión actual, pantalla activa y cualquier otro estado persistido
- la UI vuelve al estado previo al inicio

## Diseño propuesto

### Estado persistido

El runtime del export guardará un objeto de estado mínimo en `localStorage` con:
- `startedAt` o `startedAtMs`
- `endedAt` o `endAtMs`
- `durationSeconds`
- `isStarted`
- `isFinished`
- progreso de juego ya existente

La lógica del temporizador será **basada en tiempo absoluto**, no en decremento almacenado cada segundo.  
Eso evita desajustes al recargar o perder intervalos de ejecución.

### Render del temporizador

El temporizador aparecerá como un bloque visible en la cabecera del juego exportado.  
Debe mostrar:
- tiempo restante en formato `MM:SS` o `HH:MM:SS` cuando corresponda
- estado visual neutro antes de iniciar
- estado activo durante la cuenta regresiva
- estado crítico cuando falte poco tiempo
- estado agotado cuando llegue a cero

### Botones

#### Iniciar escape room
- visible antes de iniciar
- al pulsarlo: inicia el timer y habilita el juego
- tras iniciar: se oculta o se deshabilita para evitar arranques repetidos

#### Reiniciar escape room
- visible siempre
- limpia todo el estado persistido
- retorna al estado inicial
- vuelve a mostrar el botón de inicio

## Flujo de datos

1. El builder genera el runtime con la duración configurada del proyecto.
2. Al cargar el export, el runtime intenta restaurar el estado desde `localStorage`.
3. Si existe un timer activo, calcula el tiempo restante a partir de `endAt`.
4. Si no existe un timer activo, presenta el estado inicial con botón de inicio.
5. Cada segundo, el runtime recalcula el tiempo restante y re-renderiza el bloque del temporizador.
6. Al llegar a cero, marca el juego como agotado y bloquea la interacción.
7. Reiniciar borra el estado persistido y reconstruye la vista inicial.

## Integración con el estado actual

El proyecto ya persiste:
- progreso del juego
- respuestas internas
- pantalla de galería
- sala activa

Este cambio debe integrarse con ese estado sin romperlo.  
El reinicio total debe limpiar **todo** en una sola acción.

## Manejo de errores y casos límite

- Si la duración configurada es inválida o menor que cero, el runtime debe normalizarla a un valor seguro.
- Si no hay duración configurada, se usa un valor por defecto razonable.
- Si `localStorage` no está disponible, el juego debe seguir funcionando en memoria durante la sesión actual.
- Si el tiempo almacenado ya expiró al recargar, el juego debe entrar de inmediato en estado agotado.

## Criterios de aceptación

- El export muestra un temporizador visible desde la carga.
- El contador no avanza antes de pulsar **Iniciar escape room**.
- Al pulsar **Iniciar**, la cuenta regresiva comienza.
- Si se recarga la página, el tiempo continúa correctamente.
- Cuando el tiempo llega a cero, la partida se bloquea.
- **Reiniciar escape room** devuelve todo a cero, incluido el temporizador.
- El comportamiento funciona tanto en preview como en export, porque comparten plantilla.

## Pruebas y validación

Se validará con:
- `node --check public/js/escape-room-package-builder.mjs`
- `node --check public/js/escapeRoomCreator.js`
- pruebas existentes del creador y del package builder
- regeneración real del export ZIP
- smoke test del `assets/game.js` generado
- verificación del flujo manual en navegador:
  - abrir
  - iniciar
  - recargar
  - esperar expiración
  - reiniciar

## Riesgos

- Si se persiste el timer como decremento en vez de como tiempo absoluto, la recarga podría desincronizarlo.
- Si reiniciar no limpia también el estado de progreso actual, el juego podría volver a una pantalla inconsistente.
- Si el UI del temporizador se acopla demasiado a la galería, puede afectar la navegación entre pantallas.

