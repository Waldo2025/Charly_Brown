function primerTexto(...valores) {
  const encontrado = valores.find((valor) => typeof valor === "string" && valor.trim());
  return encontrado?.trim() || "";
}

function dividirTextoCompleto(texto) {
  const limpio = String(texto || "").trim();
  if (!limpio) return { textoParte1: "", textoParte2: "" };

  const frases = limpio.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((frase) => frase.trim()).filter(Boolean) || [];
  if (frases.length < 2) {
    const palabras = limpio.split(/\s+/);
    const mitad = Math.ceil(palabras.length / 2);
    return {
      textoParte1: palabras.slice(0, mitad).join(" "),
      textoParte2: palabras.slice(mitad).join(" ")
    };
  }

  const totalPalabras = frases.reduce((total, frase) => total + frase.split(/\s+/).length, 0);
  let acumuladas = 0;
  let corte = 1;
  for (let idx = 0; idx < frases.length - 1; idx++) {
    acumuladas += frases[idx].split(/\s+/).length;
    corte = idx + 1;
    if (acumuladas >= totalPalabras / 2) break;
  }

  return {
    textoParte1: frases.slice(0, corte).join(" "),
    textoParte2: frases.slice(corte).join(" ")
  };
}

function reconstruirDesdeContenido(contenido) {
  if (!Array.isArray(contenido)) return { textoParte1: "", textoParte2: "" };

  const paginas = [[], []];
  contenido.forEach((item, indice) => {
    if (!item || item.freeSticker === true || item.freeSticker === "true") return;
    const palabra = primerTexto(item.palabra, item.text);
    if (!palabra || palabra.toLowerCase() === "imagen") return;

    const pageIndexGuardado = Number.parseInt(item.pageIndex, 10);
    const left = Number(item.left ?? item.x ?? 0);
    const pageIndex = pageIndexGuardado === 0 || pageIndexGuardado === 1
      ? pageIndexGuardado
      : (left < 683 ? 0 : 1);

    paginas[pageIndex].push({
      palabra,
      indice,
      blockIndex: Number.parseInt(item.blockIndex, 10),
      wordIndex: Number.parseInt(item.wordIndex, 10),
      top: Number(item.top ?? item.y ?? 0),
      left
    });
  });

  const ordenar = (a, b) => {
    if (Number.isFinite(a.blockIndex) && Number.isFinite(b.blockIndex) && a.blockIndex !== b.blockIndex) {
      return a.blockIndex - b.blockIndex;
    }
    if (Number.isFinite(a.wordIndex) && Number.isFinite(b.wordIndex) && a.wordIndex !== b.wordIndex) {
      return a.wordIndex - b.wordIndex;
    }
    if (Math.abs(a.top - b.top) > 24) return a.top - b.top;
    if (a.left !== b.left) return a.left - b.left;
    return a.indice - b.indice;
  };

  return {
    textoParte1: paginas[0].sort(ordenar).map((item) => item.palabra).join(" "),
    textoParte2: paginas[1].sort(ordenar).map((item) => item.palabra).join(" ")
  };
}

export function resolverLecturaMindmap(data = {}) {
  const lectura = data.lectura && typeof data.lectura === "object" ? data.lectura : {};
  const config = data.config && typeof data.config === "object" ? data.config : {};
  let textoParte1 = primerTexto(data.textoParte1, data.parte1, lectura.textoParte1, lectura.parte1, config.textoParte1);
  let textoParte2 = primerTexto(data.textoParte2, data.parte2, lectura.textoParte2, lectura.parte2, config.textoParte2);

  if (!textoParte1 && !textoParte2) {
    const textoCompleto = primerTexto(data.textoCompleto, data.texto, data.lectura, lectura.textoCompleto, lectura.contenidoCompleto);
    if (textoCompleto) {
      return dividirTextoCompleto(textoCompleto);
    }
  }

  if (!textoParte1 || !textoParte2) {
    const reconstruido = reconstruirDesdeContenido(data.contenido);
    textoParte1 ||= reconstruido.textoParte1;
    textoParte2 ||= reconstruido.textoParte2;
  }

  return { textoParte1, textoParte2 };
}

export function limpiarDatosFirestore(valor) {
  if (Array.isArray(valor)) {
    return valor
      .filter((item) => item !== undefined)
      .map((item) => limpiarDatosFirestore(item));
  }

  if (valor && typeof valor === "object" && Object.getPrototypeOf(valor) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(valor)
        .filter(([, item]) => item !== undefined)
        .map(([clave, item]) => [clave, limpiarDatosFirestore(item)])
    );
  }

  return valor;
}

export function normalizarFuenteImagenPersistente(src) {
  const value = typeof src === "string" ? src.trim() : "";
  if (!value || /^(data:|blob:)/i.test(value)) return null;
  return value;
}
