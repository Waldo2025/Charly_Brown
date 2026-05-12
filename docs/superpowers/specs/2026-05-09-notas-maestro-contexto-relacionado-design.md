# Diseño: Notas del Maestro con contexto relacionado y toggles externos

Fecha: 2026-05-09

## Objetivo

Extender el flujo de `modalNotasMaestro` para que la generación de notas pueda:

- analizar solo el módulo actual
- analizar el módulo actual más el anterior
- analizar el módulo actual más el siguiente
- o seguir usando el contexto amplio de otros módulos cuando esa opción esté habilitada

Además, mover los toggles de:

- Notas del Maestro
- Actividad original
- Propuesta de actividad

fuera de la fila horizontal del header del módulo, hacia una columna vertical en la esquina superior derecha del card.

## Problema actual

Hoy las Notas del Maestro:

- usan como fuente principal `Actividad original` o `Propuesta generada`
- pueden tomar contexto general de otros módulos mediante el flujo ya existente
- no permiten relacionar explícitamente un módulo con su vecino anterior o siguiente

Esto rompe casos pedagógicos donde los módulos son secuenciales, por ejemplo:

1. Temario
2. Lectura
3. Actividades de comprensión

En ese escenario, las notas del módulo de lectura deberían poder construirse considerando también las actividades de comprensión del módulo siguiente.

## Requisitos funcionales

### 1. Nuevos controles en `modalNotasMaestro`

En la parte inferior del modal se agregarán dos grupos de control persistentes:

- `Relacionar módulo`
  - `Apagado`
  - `Anterior`
  - `Siguiente`
- `Tomar contexto de otros módulos`
  - `Encendido`
  - `Apagado`

El switch actual `Original / Propuesta` seguirá existiendo en la parte superior y será la fuente principal de análisis.

### 2. Reglas de prioridad del contexto

El motor de generación seguirá estas reglas:

1. Si `Relacionar módulo` está en `Anterior` o `Siguiente`:
   - Gemini debe analizar exclusivamente:
     - el módulo actual
     - el módulo vecino seleccionado
   - debe omitir el contexto libre de otros módulos
   - aunque el switch `Tomar contexto de otros módulos` esté encendido

2. Si `Relacionar módulo` está en `Apagado`:
   - si `Tomar contexto de otros módulos` está apagado:
     - Gemini analiza solo el módulo actual
   - si `Tomar contexto de otros módulos` está encendido:
     - se mantiene el comportamiento actual de contexto amplio

### 3. Fuente aplicada al módulo relacionado

La fuente elegida por el switch superior `Original / Propuesta` debe aplicarse también al módulo relacionado.

Ejemplos:

- si el switch está en `Original`, el análisis toma:
  - actividad original del módulo actual
  - actividad original del módulo relacionado

- si el switch está en `Propuesta`, el análisis toma:
  - propuesta del módulo actual
  - propuesta del módulo relacionado

Si el módulo relacionado no tiene contenido disponible en esa fuente:

- no se debe inventar contenido
- el prompt debe declararlo
- el sistema debe usar únicamente lo disponible

### 4. Resolución de módulo anterior/siguiente

El vecino debe resolverse usando el orden real del subtema:

- `subtema.modulosIds`

Definición:

- anterior = índice actual - 1
- siguiente = índice actual + 1

Casos borde:

- si no existe módulo anterior o siguiente:
  - el control se puede dejar persistido
  - pero el modal debe mostrar una advertencia
  - la generación debe continuar solo con el módulo actual

### 5. Persistencia por módulo

Se agregarán estos campos al documento del módulo:

- `relacionNotasMaestroModo: "none" | "anterior" | "siguiente"`
- `usarContextoOtrosModulosNotasMaestro: boolean`

Estos campos deben:

- cargarse al abrir el modal
- reflejarse en la UI
- guardarse al cambiar los switches
- afectar regeneraciones futuras

## Cambios en el prompt de Gemini

El prompt de Notas del Maestro deberá recibir:

- fuente principal activa: `actividad_original` o `propuesta`
- modo de relación: `none`, `anterior`, `siguiente`
- estado de contexto libre: `true/false`
- contenido del módulo actual
- contenido del módulo relacionado, si aplica
- metadatos del tipo de relación

### Reglas nuevas del prompt

1. Cuando `relacionNotasMaestroModo !== "none"`:
   - analizar exclusivamente los dos módulos definidos
   - no tomar contexto de ningún otro módulo

2. Cuando `relacionNotasMaestroModo === "none"` y `usarContextoOtrosModulosNotasMaestro === false`:
   - analizar exclusivamente el módulo actual

3. Cuando `relacionNotasMaestroModo === "none"` y `usarContextoOtrosModulosNotasMaestro === true`:
   - seguir con el comportamiento actual de contexto general

4. Si hay relación entre módulos:
   - la nota debe explicar la secuencia pedagógica entre ambos
   - no describirlos como piezas aisladas

Ejemplo esperado:

- una lectura relacionada con el módulo siguiente de actividades de comprensión
- debe producir notas donde el docente entiende:
  - cómo conducir la lectura
  - qué anticipar antes de pasar a las preguntas
  - qué comprensión se espera en las actividades posteriores

## Cambios de UI en los cards de módulo

Los toggles de:

- Notas del Maestro
- Actividad original
- Propuesta de actividad

saldrán de la fila horizontal:

- `flex justify-between items-start`

y pasarán a una columna vertical externa en la esquina superior derecha del card.

### Objetivos del cambio

- liberar espacio horizontal en el header
- separar acciones estructurales del resto de acciones del módulo
- hacer más visible el estado de cada bloque derivado

### Comportamiento visual esperado

- se verán como etiquetas o chips verticales por fuera del card
- cada toggle seguirá controlando el mismo estado que hoy
- no deben romper el layout en desktop ni mobile

## Alcance técnico

### HTML / CSS

- extender `modalNotasMaestro` con los nuevos switches inferiores
- añadir estilos para:
  - selector de relación de módulo
  - switch de contexto libre
  - columna vertical externa de toggles en los cards

### JS del modal

- cargar y persistir los nuevos campos
- resolver módulo anterior/siguiente
- construir contexto compuesto según reglas de prioridad
- reflejar selección en la UI al abrir el modal

### Generación

- ampliar `construirContextoGeneracionNotasMaestro(...)`
- incorporar extracción de HTML fuente del módulo relacionado
- pasar a Gemini el contenido estructurado del contexto combinado

## Riesgos

1. Duplicar accidentalmente el contexto
   - mitigación: una sola función central debe decidir qué módulos entran

2. Tomar vecinos equivocados
   - mitigación: resolver siempre desde `subtema.modulosIds`

3. Mezclar fuente activa del módulo actual con fuente distinta del relacionado
   - mitigación: usar una sola fuente efectiva por ejecución

4. Romper el layout del header del módulo
   - mitigación: mover toggles derivados a columna externa con pruebas en desktop y mobile

## Verificación esperada

1. Abrir `modalNotasMaestro` en un módulo intermedio.
2. Seleccionar fuente `Original` o `Propuesta`.
3. Activar `Relacionar módulo = Siguiente`.
4. Regenerar notas.
5. Confirmar que el resultado refleje la relación entre ambos módulos.
6. Cambiar `Relacionar módulo = Apagado` y `Tomar contexto de otros módulos = Off`.
7. Regenerar y confirmar que solo use el módulo actual.
8. Verificar que el switch superior sigue controlando:
   - la pestaña visible
   - la fuente inyectada
9. Verificar que los tres toggles externos del card siguen funcionando.

## Decisiones cerradas

- La relación de módulo será persistente por módulo.
- El switch superior `Original / Propuesta` seguirá siendo la fuente única por ejecución.
- La relación `Anterior/Siguiente` tiene prioridad sobre el contexto libre.
- Los toggles de notas/original/propuesta se moverán a una columna vertical externa.
