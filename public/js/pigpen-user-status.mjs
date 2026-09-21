export function userStatus(message,type='info') {
 const detail=String(message||'');
 if(!['error','danger','bad','warning'].includes(type))return {message:detail,detail:''};
 const rules=[
  [/429|quota|cuota|RESOURCE_EXHAUSTED/i,'El servicio de IA está ocupado. Los avances guardados se conservan. Intenta continuar más tarde.'],
  [/timeout|tiempo de espera|tardó|no terminó dentro/i,'La IA no terminó a tiempo. Los avances guardados se conservan. Puedes continuar desde el último paso guardado.'],
  [/fetch|network|conexión|connection/i,'Se interrumpió la conexión. No pudimos confirmar el resultado de la solicitud. Comprueba tu conexión antes de continuar.'],
  [/imagen|image/i,'No se completó una imagen. El contenido guardado se conserva. Reintenta la imagen pendiente.'],
  [/guardar|guardado|firestore|setDoc/i,'No se pudo guardar el último cambio. Conserva esta pantalla abierta y vuelve a intentar el guardado.'],
  [/campos|incompleto|JSON|bloques|textos.*inválidos/i,'La IA no completó todos los textos necesarios. Las salas guardadas se conservan. Puedes continuar para volver a generar la sala pendiente.'],
  [/pedagóg|pregunta|Coordenadas|solución|distractor/i,'Una pregunta no superó la revisión. Las salas guardadas se conservan. Revisa los detalles antes de volver a generar la sala pendiente.']
 ];
 const found=rules.find(([pattern])=>pattern.test(detail));
 return {message:found?found[1]:type==='warning'?detail:'No se pudo completar esta operación. Revisa los detalles para identificar el siguiente paso.',detail:found||type!=='warning'?detail:''};
}
