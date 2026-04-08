# ASCraft Hero Visual Guide (`hero_classroom_planet_v1`)

## Objetivo
Replicar el look de referencia: salon abierto centrado, jardines simetricos, cerezos grandes, postes de luz, cohete con torre y luna hero.

## Moodboard 1: Japanese Kawaii Campus
- Direccion: colores calidos, vegetacion rosa suave, composicion amigable para ninos.
- Paleta:
  - Cesped: `#79bf4a`
  - Sakura: `#ffc0de`
  - Madera: `#9b6e45`
  - Cielo: `#77bcff`
- Riesgo accesibilidad: exceso de rosa en elementos interactivos.
- Mitigacion: contraste alto en props funcionales (cohete, caminos, puertas).

## Moodboard 2: Japanese Tech-Minimal Space Academy
- Direccion: fondo limpio, lineas estructurales claras, torre/cohete como foco.
- Paleta:
  - Acero: `#334155`
  - Concreto: `#6b7280`
  - Luz calida: `#ffe7bf`
  - Sombra fria: `#1f2937`
- Riesgo rendimiento: demasiados props metalicos con sombras.
- Mitigacion: instancing para props repetidos y LOD por tier.

## Moodboard 3: Hero Shot Match
- Direccion: encuadre frontal simetrico del salon, sendero central y luna grande en fondo.
- Parametros visuales congelados:
  - Exposicion ACES: `1.03`
  - Escala luna hero: `1.32` (con multiplicador por tier)
  - Distancia luna: `0.88` del baseline
  - Ancla cohete hero: `(54, -30)`

## Decision Final
Se implementa `hero_classroom_planet_v1` como preset activo por defecto, manteniendo compatibilidad con `default_classroom_planet_v1`.
