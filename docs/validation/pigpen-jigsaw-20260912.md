# Recompensa de imagen como rompecabezas — v359

La recompensa de imagen utiliza una pieza por sala. Las curvas de los encajes se calculan localmente y se conservan en reward_plan (`puzzle_version`, `piece_id`, `puzzle_path`, recortes normalizados). La partida usa `placements` y una selección transitoria; las posiciones correctas se comprueban al final sin pedir código. La imagen completa permanece en la pantalla de victoria.

Los proyectos anteriores se normalizan a este formato sin regenerar su ilustración. El progreso anterior de imagen se conserva cuando coinciden la imagen y las salas; para recuperar claves antiguas del paquete se exige además coincidencia de las firmas de las preguntas y un único guardado compatible. Las partidas nuevas no interpretan los antiguos caracteres del código como piezas colocadas.

## Verificación

- 107 pruebas automatizadas del motor, plantillas, imágenes, recompensas, configuración, editor y exportación: todas correctas.
- Recortes para 1–8 salas: evaluación de los trazados mediante Path2D en Chromium, muestreando la cobertura del lienzo y comprobando que cada punto pertenece a una sola pieza.
- Partida exportada de dos salas con ilustración real existente: retroalimentación antes de recompensa, entrega por sala, migración sin perder la primera sala ni su recompensa, arrastre, teclado, error, recuperación, devolución a bandeja y finalización sin código.
- Vista móvil de 390 px sin desbordamiento. Gesto táctil mediante eventos de entrada de Chromium y autofill del editor: colocar piezas, comprobar y mostrar victoria con la ilustración.
- ZIP con imagen rasterizada y geometría incluidas, comprobación de integridad y sin botón autofill. La partida se comprueba bloqueando solicitudes ajenas al servidor local de los archivos extraídos.

Se reutilizó la ilustración de la prueba anterior para verificar el juego; no se solicitó otra imagen a Gemini. No se modificó el tema activo del usuario ni se desplegó el backend.
