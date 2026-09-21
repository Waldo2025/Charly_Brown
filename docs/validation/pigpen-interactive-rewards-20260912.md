# PigPen v356: estados, interacción y premio visual

## Entrega

- Estado único en el área del objetivo, sin alterar su valor; detalles técnicos expandibles y copiables.
- Justificación en dos columnas con colores distintos para las selecciones; secuencias en cuadrícula. Una columna por debajo de 640 px.
- Coordenadas con filas, columnas, ejes, selección visible y start_option opcional. La plantilla nueva fija el inicio en cell4; se conserva la compatibilidad con contratos sin inicio.
- Diagramas con etiquetas en nodos, selección/deselección, estado restaurable y conexiones visibles.
- Comodines en dialog compartido, sin mensajes inline. Cerrar no consume; ejecutar consume una vez.
- Imagen de recompensa generada con el flujo de imágenes del editor, guardada con sus dimensiones y reutilizada. Reintento sólo de imagen y bloqueo del ZIP si falta. Recortes por sala, premio visual y comprobación final del código separados.
- El SVG genérico deja de ser el sustituto de una ilustración faltante.

## Pruebas

93 pruebas aprobadas en las suites pigpen-bonus-visibility, pigpen-image-reuse, pigpen-interactive-rewards, pigpen-experience, pigpen-fixed-content, pigpen-spatial-riddles y pigpen-single-room-request. Comprobación sintáctica de los módulos modificados.

Prueba real aislada: Gemini generó los textos de una sala con justificación, secuencia, coordenadas y diagrama, y una ilustración con gemini-3.1-flash-image. Se probaron dos modelos de texto. El banco de pruebas materializó los mismos documentos locales y usó el constructor real de la vista previa y el exportador. No reemplazó el tema abierto del usuario ni ejecutó el flujo de Sheets de extremo a extremo.

Playwright comprobó:
- Dos columnas de 516 px en escritorio; una de 292 px en móvil de 390 px.
- Nodos completados tras selección y conservados después de recargar.
- Sala completada, recompensa y acceso siguiente.
- Modal: cierre con Escape conserva 1 comodín, comprobación consume exactamente 1 y muestra el resultado.
- Exportado servido localmente con solicitudes externas bloqueadas: imagen completa cargada y mensaje de código correcto al terminar. Sin errores JavaScript en esos recorridos.
- ZIP generado: integridad comprobada e imagen con firma PNG real.

Artefactos de ejecución: /tmp/pigpen-real-qa/pigpen-qa.zip, /tmp/pigpen-real-qa/project.json y capturas /tmp/pigpen-*.png.

## Limitación pedagógica observada

La prueba real no valida la calidad pedagógica del texto generado. El modelo produjo una indicación espacial inconsistente (desde E, bajar una fila y llamarla G, cuando el mapa corresponde a H). También aparecieron etiquetas de justificación que no representaban claramente conclusión y motivo. Los controles funcionan, pero la coherencia semántica de esos textos requiere revisión; las validaciones actuales de estructura y coordenadas explícitas no la garantizan. No se considera resuelto ese problema de generación por los cambios visuales.

## Despliegue

Cambios locales con versión de entrada 20260912-interactive-rewards-v356 e imports actualizados. No se desplegó el backend ni se publicaron temas.
