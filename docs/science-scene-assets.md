# Recursos visuales de simuladores v2

La colección usa el contrato `illustrated-realism` v2. Cada escena tiene un fondo horizontal independiente y, cuando el fenómeno lo permite, un protagonista transparente con la misma cámara, luz y perspectiva. Las ecuaciones, escalas, rayos, circuitos y estructuras exactas se dibujan mediante código encima del entorno.

## Estado local

Los fondos listos están en `public/assets/science-scenes/v2/`:

- `rail-background.webp`: vías para movimiento y MRU/MRUA.
- `harbor-background.webp`: agua y puerto para flotación y Arquímedes.
- `living-background.webp`: hábitat para ecología y procesos de plantas.
- `math-background.webp`: mesa de materiales matemáticos.
- `optics-background.webp`: mesa óptica para reflexión y refracción.
- `workbench-background.svg`, `micro-background.svg` y `thermal-background.svg`: fondos vectoriales locales para circuitos, estructuras microscópicas y transferencia térmica.
- `rail-primary.svg`, `harbor-primary.svg` y `living-primary.svg`: protagonistas vectoriales transparentes para tren, barco y planta.

El generador de imágenes alcanzó el límite de uso de la cuenta durante esta sesión. Los tres fondos y protagonistas faltantes se resolvieron con SVG vectorial local, sin bloquear la galería ni el funcionamiento offline. Las ejecuciones MCP pueden regenerarlos con raster de mayor detalle; la sustitución queda sujeta al mismo QA de composición, transparencia, luz y escala.

## Regla comercial

Una escena sólo puede pasar a `completed` si el fondo requerido existe, el protagonista requerido tiene transparencia válida, la dirección artística coincide con el catálogo y la composición funciona en escritorio y móvil. Las actividades v1 guardadas conservan su escena original; v2 se aplica a actividades nuevas y a las que se regeneren explícitamente.

La galería local [scienceSimulatorCollection.html](/Users/waldolopez/Documents/CharlyBrown/public/scienceSimulatorCollection.html) permite recorrer los 180 temas y mostrar qué escenas ya tienen recursos disponibles.
