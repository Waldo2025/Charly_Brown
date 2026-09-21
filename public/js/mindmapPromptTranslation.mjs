const REEMPLAZOS_PROMPT_INGLES = [
  [
    /un elemento,?\s*o conjunto de elementos,?\s*persona o acci[oó]n que represente el significado de la palabra/gi,
    "an element, group of elements, person, or action that represents the meaning of the word"
  ],
  [
    /un dibujo simple,?\s*casi infantil casi sticker pero sin l[ií]nea blanca,?\s*ba[nc]co y negro,?\s*sin tantos elementos,?\s*alg[uú]n elemento a color solo si lo amerita/gi,
    "a simple, childlike, sticker-style drawing without a white outline, mostly black and white, with few elements and a touch of color only when appropriate"
  ],
  [
    /dibujo minimalista hecho por un ni[nñ]o en blanco y negro con algunos elementos a color,?\s*fondo blanco puro sin fondo de sticker ni marco,?\s*sin texto/gi,
    "a minimalist child-drawn illustration in black and white with a few colored elements, on a pure white background, with no sticker backing, no frame, and no text"
  ],
  [
    /un sticker tipogr[aá]fico que muestre [uú]nicamente la palabra exacta/gi,
    "a typographic sticker showing only the exact word"
  ],
  [
    /dibujada con letras grandes,?\s*claras,?\s*infantiles y muy legibles/gi,
    "drawn using large, clear, childlike, highly legible letters"
  ],
  [/TEXTO OBLIGATORIO:\s*escribir exactamente/gi, "REQUIRED TEXT: write exactly"],
  [/sin traducir,?\s*sin cambiar letras y sin agregar objetos ni personajes/gi, "do not translate it, change any letters, or add objects or characters"]
];

export function traducirPromptConfiguradoLocal(prompt) {
  return REEMPLAZOS_PROMPT_INGLES.reduce(
    (traducido, [patron, reemplazo]) => traducido.replace(patron, reemplazo),
    String(prompt || "").trim()
  );
}
