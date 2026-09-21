# Snoopy Editor: voz estable al regenerar

## Causa reproducida

La regeneración individual y masiva comparten `generateDialogueAudioForRow`. El cambio de personaje ocurría antes de la petición: `resolveConfiguredSpeakerVoiceForGeneration` consultaba controles globales antiguos antes de la configuración guardada. Una sesión con Narrador Kore y un selector antiguo Algenib enviaba Algenib. Además, normalizar un valor vacío con fallback vacío devolvía la voz predeterminada en vez de conservar la ausencia de selección.

## Corrección local (snoopy-voice-24)

- Resolver la voz desde la fila y la sesión: override explícito válido de escena, seguido de voz del locutor.
- Recalcular las voces heredadas desde la configuración actual del locutor.
- Recuperar la voz creativa del narrador cuando no existe una entrada explícita en su mapa.
- Ignorar controles vacíos o inválidos al guardar borradores de voz.
- Los manejadores existentes de selección siguen guardando inmediatamente los cambios de voz.

## Validación

- Cinco reproducciones fallaban antes de la corrección y pasan después.
- 57 pruebas aprobadas: selección de voz, tiempos independientes, arranque de audio y persistencia de sesión, modo y música.
- Tres scripts aprobados: dialogue-audio-payload, creative-narrator-voice-persistence y row-voice-source-of-truth.
- La comprobación antigua que exigía leer controles del DOM fue sustituida por ejecución del resolver. Otra expresión regular ya desactualizada se ajustó al nombre existente `rowWithPreservedInspectorText`; el generador de guion no cambió.
- Sintaxis y diff de los archivos afectados verificados. El servidor local entrega la revisión 24 y el resolver actualizado.

La prueba de paridad ejecuta las funciones reales de generación masiva e individual con API simulada y comprueba `voiceName` en cada petición. No se generaron audios de pago, no se validó el timbre de una nueva respuesta de Gemini y no se publicó el cambio. Los archivos de audio existentes no se modificaron.
