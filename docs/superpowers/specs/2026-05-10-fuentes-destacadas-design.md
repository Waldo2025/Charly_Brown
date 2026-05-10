# Diseño: módulo "Fuentes destacadas"

Fecha: 2026-05-10
Estado: propuesto

## Objetivo

Agregar un nuevo tipo de módulo llamado `Fuentes destacadas` dentro de `moodleCourse` para que el autor pueda registrar una fuente web y su referencia bibliográfica, y luego usar Gemini para generar una ficha completa basada en el contenido real del sitio.

## Decisiones ya confirmadas

- Tipo nuevo: `Fuentes destacadas`
- Salida por defecto de IA: `ficha completa`
- Política de extracción web: `estricto`
- Captura de campos: dentro de `Instrucciones IA`

## Alcance funcional

El nuevo módulo debe:

1. aparecer en el selector de tipos de módulo;
2. tener icono, nombre y metadatos coherentes con los demás módulos;
3. almacenar dos campos estructurados:
   - `fuenteDestacadaUrl`
   - `fuenteDestacadaReferencia`
4. mostrar esos campos en el panel de `Instrucciones IA`;
5. bloquear `Generar con IA` si falta alguno de los dos campos;
6. intentar leer el contenido del sitio antes de generar;
7. abortar la generación si el sitio no puede leerse;
8. producir una ficha completa en el contenido del módulo.

## Comportamiento esperado

### Creación del módulo

Al crear un módulo de tipo `Fuentes destacadas`, el sistema lo guarda como un tipo más del catálogo actual, igual que `Temario`, `Lectura`, `Página` o `Quizz`.

Su contenido inicial debe orientar al autor, pero no depender de texto libre para funcionar. La lógica real debe tomar los datos estructurados del módulo.

### Edición en Instrucciones IA

Cuando el módulo activo sea `Fuentes destacadas`, el panel de `Instrucciones IA` debe mostrar una sección específica con:

- campo `Enlace web`
- campo `Fuente bibliográfica`

Ambos valores deben persistirse directamente en el objeto del módulo, no incrustarse solo como texto dentro de las instrucciones.

### Generación con IA

Al pulsar `Generar con IA`:

1. se valida que existan URL y referencia bibliográfica;
2. se intenta extraer el contenido del enlace;
3. si la extracción falla, el flujo termina con error visible;
4. si la extracción funciona, se construye el prompt para Gemini;
5. Gemini devuelve una ficha completa estructurada;
6. el resultado se guarda como contenido del módulo.

## Política estricta de extracción

La política `estricto` significa:

- no se debe generar la ficha solo con la referencia bibliográfica;
- no se debe generar la ficha solo con texto manual de instrucciones;
- no se debe caer automáticamente a un modo degradado;
- si el enlace no es legible por el sistema, se informa el error y se cancela la operación.

Esto busca que la salida esté realmente anclada al contenido de la fuente.

## Estructura de salida de la ficha completa

La generación debe producir una estructura fija y consistente. Encabezados propuestos:

- `## Resumen ejecutivo`
- `## Ideas clave`
- `## Análisis crítico`
- `## Confiabilidad y sesgos`
- `## Citas o fragmentos relevantes`
- `## Aplicación pedagógica`
- `## Referencia bibliográfica`

Reglas:

- el contenido debe estar basado en la fuente real extraída;
- no debe inventar datos no presentes en la fuente;
- la referencia bibliográfica final debe respetar lo capturado por el autor;
- si se incluyen citas textuales, deben ser cortas y claramente atribuibles;
- el tono debe ser útil para trabajo académico y pedagógico, no promocional.

## Cambios de frontend

### Catálogo de tipos

Actualizar el catálogo donde hoy se listan tipos como `Quizz`, `Página`, `Temario` y `Lectura` para incluir `Fuentes destacadas`.

Puntos afectados:

- selector de creación de módulo;
- iconografía del módulo;
- etiquetas visuales del tipo;
- ayudas cortas o descripciones del selector.

### Metadatos del módulo

Extender el modelo de módulo con:

- `fuenteDestacadaUrl: string`
- `fuenteDestacadaReferencia: string`

Opcionales si hacen falta después:

- `fuenteDestacadaEstadoExtraccion`
- `fuenteDestacadaUltimaRevision`

### Panel de Instrucciones IA

Agregar una vista condicional para `Fuentes destacadas` dentro del modal o panel ya existente de instrucciones.

La UI debe:

- precargar valores guardados;
- permitir edición;
- validar que la URL no quede vacía;
- guardar sin depender de parseo de texto libre;
- dejar claro que la generación requiere acceso real al sitio.

### Contenido inicial y render

El contenido inicial del módulo debe servir como placeholder editorial, por ejemplo indicando que ahí aparecerá la ficha generada.

No se necesita un render especializado complejo; el contenido final puede seguir el pipeline actual de HTML/markdown saneado, siempre que soporte la estructura de secciones.

## Cambios de integración con IA

### Prompt nuevo

Agregar un prompt especializado para `Fuentes destacadas` en `moodlecourse-geminiOperations.js`.

Ese prompt debe:

- indicar que se trabaja sobre una fuente externa ya extraída;
- pedir una ficha completa;
- prohibir invención de datos;
- exigir análisis de confiabilidad y sesgos;
- incluir la referencia bibliográfica del autor en la salida final.

### Contexto para Gemini

El payload para Gemini debe incluir:

- URL original;
- referencia bibliográfica;
- texto extraído y saneado del sitio;
- nombre del módulo;
- tipo del módulo.

No debe depender de imágenes ni del flujo de notas del maestro.

## Cambios de backend o acceso remoto

Se necesita un mecanismo para leer el contenido del sitio de forma controlada. La implementación puede reutilizar infraestructura existente de proxy si es adecuada, o crear una ruta específica para extracción de texto.

Requisitos del backend:

- recibir una URL;
- intentar descargar el contenido remoto;
- sanear HTML;
- extraer texto útil;
- devolver error claro si el sitio no puede leerse;
- no responder éxito con contenido vacío.

En modo estricto, una respuesta vacía o ilegible equivale a fallo.

## Manejo de errores

Errores esperados:

- falta URL;
- falta referencia bibliográfica;
- URL inválida;
- sitio inaccesible;
- sitio bloqueado por política remota;
- extracción vacía;
- error de backend;
- error de Gemini.

Comportamiento:

- mostrar mensaje claro al usuario;
- no sobrescribir el contenido actual del módulo si la generación falla;
- no dejar estados ambiguos de “éxito parcial”.

## Pruebas requeridas

### Frontend

- crear módulo `Fuentes destacadas`;
- guardar y recargar el módulo con sus dos metadatos;
- abrir `Instrucciones IA` y confirmar persistencia;
- bloquear generación cuando falte URL;
- bloquear generación cuando falte referencia;

### Integración

- generación exitosa con sitio accesible;
- generación fallida con sitio inaccesible;
- validación de que el contenido previo no se pierde si falla la extracción;
- validación de que el prompt armado corresponde al tipo `Fuentes destacadas`.

### Regresión

- el alta de otros tipos de módulo no cambia;
- `Generar con IA` sigue funcionando para tipos existentes;
- el render general del editor no se rompe.

## Riesgos

- algunos sitios pueden bloquear scraping o devolver HTML poco útil;
- si la extracción remota no está bien delimitada, puede producir contenido ruidoso;
- si se guarda esta información dentro de `instrucciones` en vez de metadatos estructurados, el mantenimiento se vuelve frágil.

## Recomendación de implementación

Implementar esto como un tipo especializado, no como una variante textual de `Página`.

Orden recomendado:

1. catálogo y persistencia del tipo;
2. UI del panel `Instrucciones IA`;
3. validaciones previas a generación;
4. extracción estricta del sitio;
5. prompt y generación de ficha completa;
6. pruebas de regresión.

## Fuera de alcance por ahora

- múltiples enlaces por módulo;
- normalización automática de referencia bibliográfica;
- modo degradado sin acceso al sitio;
- importación masiva de fuentes;
- historial de versiones de la ficha generada.
