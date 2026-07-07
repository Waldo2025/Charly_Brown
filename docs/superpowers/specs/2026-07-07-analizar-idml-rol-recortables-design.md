# Analizar IDML Recortables Role Design

## Summary

La verificación actual de `Recortables` depende demasiado de heurísticas implícitas:

- asume por nombre de unidad si un archivo aporta destinos
- no distingue si la ficha `Recortables` fue configurada como fuente, destino o ambas
- cuando falta la ficha correcta, el resultado no expresa claramente que el destino quedó pendiente

La corrección es introducir un selector explícito de rol solo para la unidad `Recortables`, persistido por revisión:

- `Fuente`
- `Destino`
- `Fuente y destino`

Ese rol pasa a gobernar la reconciliación de destinos recortables tanto en análisis individual como en `Analizar todas`.

## Goals

- Hacer explícito cuándo una ficha `Recortables` aporta páginas destino.
- Permitir que una unidad normal marque `Recortable destino pendiente` sin bloquear el análisis.
- Procesar la ficha `Recortables` antes de una unidad normal cuando sea necesaria para resolver destinos.
- Mantener la persistencia por revisión, sin mover esta configuración al estado global de sesión.
- Reflejar `Pendiente` de forma consistente en reporte por página y rail derecho.

## Non-Goals

- No introducir roles equivalentes para `Fichas` o `Anexos` en esta fase.
- No cambiar contratos HTTP ni la estructura base `session.revisions[].files[]`.
- No rediseñar Firestore ni separar la lógica en nuevos endpoints.

## UX Design

### Formulario

Cuando la revisión activa tenga `unidad = Recortables`, el formulario mostrará un selector único:

- etiqueta: `Rol recortables`
- opciones: `Fuente`, `Destino`, `Fuente y destino`

Cuando la unidad no sea `Recortables`, ese selector no se muestra.

### Valor por defecto

Para una ficha nueva `Recortables`, el valor inicial será `Destino`.

Motivo:

- es el caso operativo más frecuente
- reduce falsos negativos cuando otras unidades buscan destinos

### Persistencia

El valor se guarda dentro de la revisión:

```json
{
  "id": "revision_id",
  "unidad": "Recortables",
  "revisionNumero": "F1",
  "recortableRole": "destination"
}
```

Valores permitidos:

- `source`
- `destination`
- `both`

Si el campo no existe en revisiones antiguas de `Recortables`, el sistema las tratará como `destination` para mantener compatibilidad hacia atrás.

## Analysis Semantics

### Unidad normal

Cuando se analiza una unidad distinta de `Recortables` y se detecta un origen recortable:

- si existe una revisión `Recortables` con rol `Destino` o `Fuente y destino` y tiene archivo resoluble, esa ficha debe entrar al flujo antes que la unidad actual
- si esa ficha todavía no existe, el destino queda `Pendiente`
- si existe pero no tiene análisis útil aún, el destino queda `Pendiente`
- el análisis no se bloquea en ninguno de esos casos

### Ficha Recortables

Cuando se analiza una revisión `Recortables`:

- `Fuente`: reporta orígenes detectados en ese archivo, pero no aporta índice de destinos para otras unidades
- `Destino`: aporta índice de destinos para otras unidades, aunque no tenga orígenes
- `Fuente y destino`: hace ambas cosas

### Prioridad en análisis individual

En `Analizar ficha editorial`:

- si la revisión activa no es `Recortables`
- y hay una revisión `Recortables` con rol que incluya `Destino`
- y tiene archivo local o persistido resoluble

entonces el target de `Recortables` debe analizarse primero y luego el target activo.

### Prioridad en análisis masivo

En `Analizar todas las fichas`:

- el orden visual de `Fichas editoriales` sigue siendo la referencia primaria
- dentro de ese flujo, una revisión `Recortables` con rol de destino debe quedar disponible antes de las unidades que dependan de ella siempre que tenga archivo resoluble

La implementación puede lograrlo reordenando targets o haciendo una pasada previa sobre fichas `Recortables` destino, pero el resultado observable debe ser el mismo: cuando una unidad normal se procese, ya debe existir el mejor índice posible de destinos recortables.

## Result Model

### Estado pendiente

Se introduce un estado semántico `Pendiente` para recortables cuando:

- la unidad origen sí detectó referencia recortable
- no existe ficha `Recortables` destino aplicable, o no tiene análisis disponible todavía

Eso no es un error editorial del archivo origen. Es una ausencia de destino resoluble en la sesión.

### Estado error

Sigue siendo `Error` cuando:

- el origen marca recortable pero no tiene código
- existe más de un destino válido para el mismo código
- existe destino pero incumple validaciones editoriales obligatorias

### Render

En reporte por página y rail derecho:

- `Pendiente` usa badge y texto propios
- `Error` se mantiene separado
- si una ficha ya tiene grupo en el rail, un nuevo análisis actualiza ese grupo; no crea duplicado

Ejemplos de copy:

- `Recortable PcT1: destino pendiente.`
- `Recortable PcT1: destino pendiente en ficha Recortables.`

## Data Flow Changes

### Frontend session state

- agregar `recortableRole` a la revisión activa cuando `unidad = Recortables`
- persistirlo mediante el mismo flujo actual de guardado de revisiones
- no mezclar este valor con `session.bibliographicInfo`

### Target resolution

El builder de targets debe poder:

- localizar la revisión `Recortables` relevante
- comprobar si su rol incluye destino
- comprobar si su archivo es resoluble localmente o por fuente persistida
- inyectar ese target antes del target activo cuando aplique

### Backend pipeline

El pipeline debe filtrar qué revisiones `Recortables` contribuyen al índice externo de destinos según `recortableRole`.

Reglas:

- `source`: no aporta destinos externos
- `destination`: sí aporta destinos externos
- `both`: sí aporta destinos externos
- valor ausente en revisión `Recortables`: tratar como `destination`

## Compatibility

- Revisiones no `Recortables` no cambian.
- Revisiones `Recortables` antiguas siguen funcionando por fallback a `destination`.
- No cambia el shape requerido por endpoints existentes; solo se agrega un campo opcional en revisión.

## Testing

### Caso 1

Existe `Unidad 3` con origen recortable y no existe ficha `Recortables`.

Resultado esperado:

- análisis completo
- recortable marcado `Pendiente`
- sin bloqueo del job

### Caso 2

Existe ficha `Recortables` con rol `Destino` y archivo resoluble.

Resultado esperado:

- al analizar `Unidad 3`, la ficha `Recortables` se procesa primero o ya está disponible
- el destino se resuelve si existe en ese archivo

### Caso 3

Existe ficha `Recortables` con rol `Fuente`.

Resultado esperado:

- no se usa como destino para otras unidades
- la unidad normal queda en `Pendiente` si no hay otra ficha destino

### Caso 4

Existe ficha `Recortables` con rol `Fuente y destino`.

Resultado esperado:

- reporta sus propios orígenes
- también aporta destinos externos

### Caso 5

Se reanaliza manualmente una misma ficha.

Resultado esperado:

- el rail actualiza el grupo existente
- no se crean duplicados

## Implementation Notes

- El cambio debe integrarse sobre la lógica ya corregida de revisiones y rail derecho.
- La prioridad es exactitud de estado y persistencia, no inferencias por nombre de archivo.
- Si más adelante `Fichas` o `Anexos` necesitan el mismo patrón, podrá generalizarse a un modelo de roles por tipo de activo enlazado, pero esa expansión queda fuera de este cambio.
