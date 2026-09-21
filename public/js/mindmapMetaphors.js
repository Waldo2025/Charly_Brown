/**
 * mindmapMetaphors.js
 * Catálogo de metáforas visuales mnemotécnicas infantiles e iconográficas
 * para generar prompts únicos y representativos por palabra en Gemini.
 */

export const METAFORAS_VISUALES = {
  // Preposiciones y ubicaciones espaciales
  "inside": "una caja abierta, dentro un objeto y una flecha señalando el objeto dentro de la caja",
  "in": "un frasco o taza abierta con una canica brillante adentro y una flecha señalándola",
  "outside": "una caja abierta y una pelota afuera en el suelo con una flecha señalando afuera de la caja",
  "out": "un conejito saliendo alegremente de un sombrero de copa con flecha hacia afuera",
  "on": "una manzana o taza apoyada firmemente sobre una mesa de madera con una flecha señalando arriba de la mesa",
  "under": "un gatito o un par de zapatos debajo de una pequeña mesa con una flecha apuntando hacia abajo",
  "over": "un pajarito volando por encima de un puente con una flecha curva sobrevolando",
  "behind": "un osito asomándose curioso por detrás del tronco de un árbol",
  "front": "un perrito sentado sonriente justo al frente de su casita",
  "between": "un objeto brillante ubicado justo en el medio de dos cajas",
  "into": "una moneda cayendo dentro de una alcancía con una flecha hacia adentro",
  "up": "un globo rojo elevándose hacia arriba con una flecha vertical apuntando hacia arriba",
  "down": "una hoja de árbol cayendo al suelo con una flecha vertical apuntando hacia abajo",
  "through": "un trenecito saliendo por el túnel de una montaña con flechas de paso",
  "across": "un puente simple cruzando de una orilla a otra de un río azul",
  "near": "dos amigos parados muy cerca uno del otro saludándose con una mano",
  "far": "un muñequito diminuto en el horizonte saludando a lo lejos",

  // Pronombres y personas
  "my": "un niño con las manos en el pecho y un objeto entre las manos y el pecho como diciendo mío",
  "mine": "un niño abrazando fuertemente un osito de peluche contra su pecho diciendo 'mío'",
  "your": "una mano infantil con el dedo índice señalando amigablemente hacia adelante",
  "you": "una mano infantil señalando hacia adelante al espectador con simpatía",
  "he": "un niño pequeño sonriente con gorrita de béisbol saludando con la mano",
  "him": "un niño pequeño sonriendo de pie saludando alegre",
  "his": "un niño pequeño sosteniendo su mochila favorita con orgullo",
  "she": "una niña pequeña con dos colitas en el pelo sonriendo alegre",
  "her": "una niña pequeña sonriendo con un vestidito y saludando con una mano",
  "hers": "una niña pequeña abrazando su libro favorito",
  "we": "dos niños tomados de la mano sonriendo juntos con alegría",
  "us": "dos niños abrazados como mejores amigos sonriendo juntos",
  "our": "dos niños mostrando juntos una banderita que comparten",
  "they": "tres niños juntos de espaldas caminando hacia una aventura",
  "them": "un grupo de tres niños sonrientes juntos",
  "it": "una cajita misteriosa con un lazo y un signo de interrogación suave",
  "i": "un niño señalándose a sí mismo con el pulgar hacia su pecho con una sonrisa",
  "me": "un niño pequeño tocando su propio pecho sonriendo",

  // Familia y roles
  "father": "un papá sonriente y cariñoso saludando con la mano con un reloj en la muñeca",
  "dad": "un papá cariñoso y sonriente saludando amigablemente",
  "mother": "una mamá tierna sonriendo con los brazos abiertos para un abrazo",
  "mom": "una mamá cariñosa sonriendo y saludando tiernamente",
  "brother": "un hermanito con gorra y una pelota de fútbol bajo el brazo",
  "sister": "una hermanita con moño en el cabello saludando alegremente",
  "family": "una casita sencilla con un corazón en el tejado y figuras tomadas de la mano",
  "baby": "un biberón infantil con leche tibia y un chupete colorido al lado",
  "friend": "dos muñequitos de palito sonrientes abrazándose con afecto",
  "friends": "tres muñequitos sonrientes con los brazos en los hombros en equipo",

  // Sensaciones, emociones y estados
  "worried": "una carita infantil con cejas fruncidas de preocupación y una gotita de sudor",
  "happy": "una carita redonda con una gran sonrisa radiante y mejillas sonrosadas",
  "sad": "una carita con la boca hacia abajo y una lágrima azul resbalando por la mejilla",
  "sleepy": "un osito bostezando con párpados pesados y tres letras 'Zzz' flotando",
  "asleep": "una almohadita mullida durmiendo en paz con gorro de dormir",
  "quiet": "un dedito índice sobre los labios cerrados haciendo el gesto de 'shhh'",
  "peace": "una palomita blanca con una ramita verde en su pico",
  "gentle": "una pluma suave y ligera flotando delicadamente en el aire",
  "afraid": "un niño con los ojos muy abiertos y las manos en las mejillas sorprendido",
  "scared": "un niño con los ojos abiertos de sorpresa viendo una pequeña sombra",
  "angry": "una carita enfadada con el ceño fruncido y vapor suave saliendo de las orejas",
  "love": "un corazón rojo cálido dibujado a mano con trazos de crayón",

  // Luz, día, noche y clima
  "light": "un foco o bombilla de cristal encendida con rayitos amarillos resplandecientes",
  "flash": "un destello repentino de luz en forma de estrella brillante con chispitas",
  "glowing": "un frasco de vidrio transparente con luciérnagas doradas brillando adentro",
  "glow": "una esfera dorada irradiando pequeños rayos de luz cálida",
  "dark": "una luna menguante dormilona con un gorrito y una pequeña estrellita",
  "night": "un cielo oscuro con luna creciente y estrellitas sobre el tejado de una casa",
  "day": "un sol redondo y radiante saliendo sobre una pequeña colina verde",
  "sun": "un sol sonriente y amarillo con rayos rectos alegres",
  "moon": "una luna creciente plateada y suave con una sonrisa tranquila",
  "star": "una estrella amarilla brillante de cinco puntas con destellos",
  "sky": "dos nubes esponjosas flotando en un cielo azul pacífico",
  "wind": "tres líneas en espiral de viento ondeando y una hoja verde volando",
  "breeze": "una suave brisa ondulada que mece una pequeña margarita",

  // Verbos de acción
  "woke": "un gallo cantando al amanecer con notas musicales y sol naciente",
  "wake": "un despertador retro clásico sonando con dos campanillas vibrando",
  "sleep": "una almohada suave y cómoda con tres letras 'Zzz' subiendo",
  "walk": "un par de zapatillas dando un paso sobre un caminito con huellitas",
  "walked": "dos huellas de zapatos sobre un sendero marcando el camino recorrido",
  "looked": "dos ojos grandes y atentos mirando hacia una dirección con pestañas",
  "look": "un par de ojos curiosos y abiertos mirando atentamente al frente",
  "see": "un ojo grande y expresivo con una pequeña estrella en la pupila",
  "saw": "unos anteojos o una lupa enfocando un objeto brillante",
  "opened": "un cofre o libro abriéndose dejando escapar destellos de luz",
  "open": "una puerta entreabierta mostrando un interior iluminado y acogedor",
  "close": "una puerta de madera cerrada con su pomo redondo y cerrojo",
  "closed": "un candado cerrado con su llave al lado",
  "sudden": "un rayo relámpago zigzagueante amarillo que sorprende",
  "run": "un niño corriendo a toda velocidad con zapatillas y nubes de polvo",
  "running": "piernitas infantiles corriendo rápido con líneas de velocidad",
  "jump": "un niño dando un salto alto en el aire con rayitas de rebote debajo",
  "fly": "un avioncito de papel blanco volando en curva con estela punteada",
  "swim": "un pececito feliz nadando entre ondas de agua y burbujas",
  "eat": "una manzana roja brillante con un mordisco en el costado",
  "drink": "un vaso con jugo y una pajita o popote con gotitas",
  "go": "un semáforo con luz verde encendida invitando a avanzar",
  "went": "un cochecito avanzando en un camino dejando huella",
  "stop": "una señal roja octogonal de alto con una mano blanca dibujada",
  "come": "una manito infantil haciendo un gesto amigable de invitación a acercarse",
  "help": "un aro salvavidas rojo y blanco o dos manos sosteniéndose",
  "together": "dos manos infantiles entrelazadas fuertemente en equipo",

  // Naturaleza, lugares y cosas
  "hill": "una colina verde suave y redondeada con un caminito zigzagueante",
  "town": "tres casitas pequeñas con techos rojos, ventanas y una farola",
  "house": "una casita clásica con tejado triangular, chimenea con humo y puerta",
  "home": "una casita acogedora con un corazón en la ventana y humo en la chimenea",
  "tree": "un árbol frondoso verde con tronco marrón y dos frutos rojos",
  "water": "un vaso de agua azul clara y dos gotitas de agua saltando",
  "fire": "tres lenguas de fuego vivas en colores amarillo y naranja",
  "book": "un libro de cuentos abierto con una cinta marcapáginas colorida",
  "car": "un autito de juguete rojo con dos ruedas negras",
  "eyes": "dos ojos infantiles bonitos y expresivos bien abiertos",
  "eye": "un ojo bien abierto con pestañas y pupila brillante",
  "whole": "un pastel completo redondo con una velita sin cortar",
  "one": "el número 1 dibujado con estilo infantil y una estrellita",
  "two": "dos cerezas rojas unidas por un tallo verde",
  "three": "tres globos de colores flotando juntos"
};

/**
 * Normaliza una palabra para buscar en el diccionario de metáforas
 */
export function limpiarPalabraClave(palabra) {
  return String(palabra || "")
    .trim()
    .toLowerCase()
    .replace(/[.,;:!?()¿¡"'`´]/g, "")
    .trim();
}

/**
 * Obtiene o sintetiza una metáfora visual iconográfica única para cualquier palabra
 */
export function obtenerMetaforaVisual(palabra) {
  const clean = limpiarPalabraClave(palabra);
  if (!clean) return "un objeto icónico minimalista";

  // 1. Coincidencia directa en diccionario
  if (METAFORAS_VISUALES[clean]) {
    return METAFORAS_VISUALES[clean];
  }

  // 2. Normalización de formas verbales y plurales comunes
  if (clean.endsWith("ing") && METAFORAS_VISUALES[clean.slice(0, -3)]) {
    return METAFORAS_VISUALES[clean.slice(0, -3)];
  }
  if (clean.endsWith("ed") && METAFORAS_VISUALES[clean.slice(0, -2)]) {
    return METAFORAS_VISUALES[clean.slice(0, -2)];
  }
  if (clean.endsWith("s") && METAFORAS_VISUALES[clean.slice(0, -1)]) {
    return METAFORAS_VISUALES[clean.slice(0, -1)];
  }

  // 3. Fallback descriptivo
  return `un elemento o conjunto icónico que representa la palabra "${clean}"`;
}

export function construirPromptStickerSimple(palabra) {
  const metafora = obtenerMetaforaVisual(palabra);
  let estilo = "dibujo minimalista hecho por un niño en blanco y negro con algunos elementos a color, fondo blanco puro sin fondo de sticker ni marco, sin texto";
  try {
    const custom = typeof localStorage !== "undefined" ? localStorage.getItem("mc_sticker_prompt_suffix") : null;
    if (custom && custom.trim()) estilo = custom.trim();
  } catch (_) {}
  return `${metafora}, ${estilo}`;
}
