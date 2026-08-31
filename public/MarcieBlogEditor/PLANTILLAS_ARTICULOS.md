# Plantillas de artículos de Marcie Blog Editor

## Implementado

- Selector de plantillas en el encabezado de `Contenido generado`.
- Diez estilos: Default Editorial, Nordic Journal, Signal Brutalist, Coral Magazine, Academic Ledger, Botanical Essay, Neo Newspaper, Midnight Ink, Playful Learning y Tech Blueprint.
- Selección y persistencia independiente mediante `article.templateId`.
- Overrides de Apariencia de texto guardados en `article.appearance`.
- Una sola fuente de CSS estructural para preview y exportación ZIP.
- Google Fonts específica para cada plantilla.
- Citas con la misma estructura, tamaño, padding, icono y atribución en preview y export.
- Galería responsive, navegable con teclado y compatible con reducción de movimiento.

## Prioridad de estilos

1. La plantilla seleccionada define el diseño base del artículo.
2. Los controles manuales de Apariencia de texto sobrescriben los tokens correspondientes.
3. El exportador resuelve la plantilla y los overrides propios de cada artículo.

## Persistencia

- Los artículos sin `templateId` usan `default`.
- La selección se guarda en el artículo actual y en su entrada de `articlesByAudience`.
- Las preferencias antiguas de `localStorage` se conservan como compatibilidad para artículos sin overrides propios.

## Pendiente de validación visual

- Comparación por captura entre preview y HTML exportado a la misma anchura.
- Revisión responsive de las diez plantillas en tablet y móvil.
- Confirmación de carga de Google Fonts al abrir el HTML desde `file:` con conexión disponible.
