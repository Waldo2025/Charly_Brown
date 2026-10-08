# Design QA · Schroeder Sound Lab

**Source visual truth**

- Referencia de biblioteca/reproductor: `/var/folders/0_/76qxtcb13lg_dcrp5c9y1lnr0000gn/T/TemporaryItems/NSIRD_screencaptureui_IWtvc4/Captura de pantalla 2026-09-27 a la(s) 4.37.41 p.m..png` (`820 × 470`).
- Referencia de dirección visual: `/var/folders/0_/76qxtcb13lg_dcrp5c9y1lnr0000gn/T/TemporaryItems/NSIRD_screencaptureui_4QDDL2/Captura de pantalla 2026-09-27 a la(s) 4.16.31 p.m..png`.
- La referencia se usó como jerarquía de producto, no como solicitud de clonación: biblioteca oscura, filas musicales, reproducción y acciones agrupadas.

**Rendered implementation**

- URL local: `http://127.0.0.1:8765/schroederSoundLab.html`.
- Vista principal: `/private/tmp/schroeder-desktop.png`.
- Modal de creación: `/private/tmp/schroeder-modal.png`.
- Biblioteca y reproductor activos: `/private/tmp/schroeder-library-player.png`.
- Comparación conjunta: `/private/tmp/schroeder-design-comparison.png`.
- Viewport y captura: `1440 × 1000` CSS px, device scale factor `1`, capturas `1440 × 1000`; comparación `1600 × 1200`.
- Estado: tema oscuro, escritorio, tres columnas; modal de canción; biblioteca con tres canciones simuladas y footer reproductor activo.

## Full-view comparison evidence

La comparación conjunta confirmó que la implementación reemplaza la tarjeta pesada y sus acciones visibles por filas compactas de miniatura, título y menú; el reproductor se separa en un footer persistente. La composición conserva el centro como superficie dominante para el chat y mantiene desplazamiento independiente en las tres columnas.

## Focused-region comparison evidence

- Biblioteca: miniatura real a la izquierda, título truncable, subtítulo mínimo y menú vertical a la derecha.
- Reproductor: miniatura, play/pausa, nombre, tiempos, progreso y menú; se adapta a los tokens de los tres temas.
- Modal: jerarquía clara, propuestas de géneros en chips, campos alineados y sin interferencia con el chat.
- Logo: PNG transparente generado para el estudio, renderizado nítido en header y miniaturas.

## Required fidelity surfaces

- Fonts and typography: Inter local, pesos 600–700, jerarquía compacta y truncamiento en filas; no se observó desbordamiento.
- Spacing and layout rhythm: grid `248 / flexible / 410`, separadores de 1 px, filas de 60 px y footer de 70 px; el chat conserva la mayor superficie.
- Colors and visual tokens: superficies neutras, bordes discretos y acento verde consistente en iconos, foco, progreso y estados; sin gradientes decorativos.
- Image quality and asset fidelity: logo PNG `768 × 512` con alfa, sin SVG improvisado, emoji ni placeholder; recorte y escala se verificaron en header y miniaturas.
- Copy and content: títulos y subtítulos mínimos; las acciones permanecen en tooltips y menús en lugar de sumar texto visible.

## Primary interactions and runtime verification

- Abrir modal de creación y verificar su layout.
- Cambiar tema desde icono y conservar preferencia.
- Mostrar biblioteca compacta, hover de reproducción y footer activo.
- Menús contextuales, edición, descarga, eliminación confirmada y alta en Podcaster.
- Grabación vocal con permiso explícito, límite de 60 segundos, formatos permitidos y limpieza de pistas.
- Consola del navegador revisada en la captura activa: `0` errores.
- Pruebas específicas: `9/9 passed`.

## Findings and comparison history

### Iteration 1

- [P1] La biblioteca original mostraba un reproductor nativo grande y botones de acción siempre visibles.
  - Fix: filas compactas con acciones en menú y reproductor propio en footer.
- [P2] El chat perdía espacio por controles expuestos.
  - Fix: configuración trasladada a modal e iconos compactos en header/toolbar.
- [P2] Las acciones creativas no tenían señalización ni tooltips consistentes.
  - Fix: tooltips accesibles, spotlights periódicos y recorrido animado en el borde del compositor.

### Iteration 2

- Evidencia posterior: `/private/tmp/schroeder-library-player.png` y `/private/tmp/schroeder-modal.png`.
- No quedan diferencias P0, P1 o P2 accionables. La menor densidad de la lista frente a la captura es intencional y responde a la solicitud explícita de simplificarla.

final result: passed

---

# Reporte histórico · Estado de generación y fuentes APA de Marcie

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

historic result: passed
