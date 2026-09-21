# Design QA · Estado de generación y fuentes APA de Marcie

**Source visual truth**

- Captura reportada por el usuario: `/var/folders/0_/76qxtcb13lg_dcrp5c9y1lnr0000gn/T/TemporaryItems/NSIRD_screencaptureui_TJcw7R/Captura de pantalla 2026-08-31 a la(s) 11.09.15 p.m..png`.
- Source pixels: `1230 × 978`.
- Estado: artículo visible, modo APA activo y dos tarjetas de fuentes distribuidas en columnas.
- Objetivo explícito: mostrar un indicador dentro de `#article-view` durante la generación y apilar las referencias APA en una sola columna.

**Rendered implementation**

- Aplicación: `http://127.0.0.1:5010/MarcieBlogEditor.html`.
- Captura APA: `/Users/waldolopez/Documents/CharlyBrown/artifacts/marcie-apa-sources-after.png`.
- Estado de generación: `http://127.0.0.1:5010/MarcieBlogEditor-article-generation-qa.html`.
- Captura del estado de generación: `/Users/waldolopez/Documents/CharlyBrown/artifacts/marcie-article-generation-after.png`.
- Implementation pixels y CSS viewport: `1707 × 960`; device density: `1x`.
- Normalización: las capturas se compararon en una misma entrada visual conservando sus dimensiones originales; la diferencia de encuadre se trató como contexto y la evaluación se concentró en `#article-view` y `#article-sources-list`.

## Full-view comparison evidence

La referencia y la implementación se abrieron juntas. La aplicación conserva su estructura, tipografía, paleta y componentes. El cambio visible está acotado: en modo APA cada fuente ocupa ahora una fila completa, y el estado de generación utiliza el mismo lienzo blanco y los acentos teal/violeta de Marcie.

## Focused-region comparison evidence

La región de “Fuentes consultadas” se verificó en la aplicación autenticada. Las referencias APA 7 · 1 y APA 7 · 2 aparecen una debajo de la otra, a todo el ancho disponible, sin la división responsive previa. El estado de generación se verificó en una vista QA aislada con el mismo markup y hoja de estilos: spinner orbital, contador “Artículo 2 de 4”, mensaje del público actual y puntos animados.

## Required fidelity surfaces

- Fonts and typography: conserva Inter, jerarquía del artículo y tamaños del sistema; el texto de estado es breve, legible y no compite con el contenido.
- Spacing and layout rhythm: las fuentes tienen un único track, separación vertical uniforme y ancho completo; el spinner queda centrado con suficiente aire.
- Colors and visual tokens: mantiene superficies blancas, texto slate y acentos teal/violeta de Marcie.
- Image quality and asset fidelity: reutiliza `/MarcieBlogEditorLogo2.png` en el spinner, sin recreaciones ni placeholders.
- Copy and content: el estado informa qué artículo se genera, el total, el público y que se están organizando las fuentes.

## Interaction and runtime verification

- El flujo automático activa el estado antes de cada redacción y actualiza `current`, `total` y `audienceLabel`.
- Un bloque `finally` garantiza que el spinner se retire tanto al completar como al fallar.
- El contenedor usa `role="status"` y `aria-live="polite"`.
- Al activar APA, la clase `sm:grid-cols-2` se retira; al volver al formato normal se restaura.
- `prefers-reduced-motion` desactiva la animación de puntos.
- Tests: `node --test functions/test/marcie-*.test.js` — `71/71 passed`.

## Findings and comparison history

### Iteration 1

- [P1] El flujo automático no activaba el spinner ya existente dentro de `#article-view`.
- Fix: el ciclo de redacción ahora muestra y actualiza el estado por audiencia, con limpieza garantizada al salir.

- [P1] El modo APA heredaba `sm:grid-cols-2`, por lo que seguía mostrando dos columnas.
- Fix: se añadió la clase semántica `article-sources-list`, se elimina dinámicamente la clase responsive en APA y existe una regla CSS de respaldo de un solo track.

### Iteration 2

- Evidencia posterior: el navegador mostró ambas referencias en filas independientes y el estado de generación centrado, legible y coherente con Marcie.
- No quedan diferencias P0, P1 o P2 accionables.

final result: passed
