function ordenarBloquesEnLectura(bloques) {
  const dir = bloques[0]?.dir || "ltr";
  return bloques.slice().sort((a, b) => dir === "rtl" ? b.x - a.x : a.x - b.x);
}

export function bloquesCompartenFrase(bloqueActual, bloqueSiguiente) {
  return bloqueActual?.sentenceId != null
    && bloqueActual.sentenceId === bloqueSiguiente?.sentenceId;
}

function obtenerTransicionesDeFila(bloquesPagina) {
  const filas = new Map();
  bloquesPagina.forEach((bloque) => {
    if (!filas.has(bloque.row)) filas.set(bloque.row, []);
    filas.get(bloque.row).push(bloque);
  });

  const rows = [...filas.keys()].sort((a, b) => a - b);
  return rows.slice(0, -1).map((row, idx) => ({
    arriba: ordenarBloquesEnLectura(filas.get(row)).at(-1),
    abajo: ordenarBloquesEnLectura(filas.get(rows[idx + 1]))[0]
  }));
}

export function calcularEsquinasFusion(bloquesPagina) {
  const esquinas = new Map();

  obtenerTransicionesDeFila(bloquesPagina || []).forEach(({ arriba, abajo }) => {
    if (!bloquesCompartenFrase(arriba, abajo)) return;

    esquinas.set(arriba.blockIndex, {
      ...(esquinas.get(arriba.blockIndex) || {}),
      bottom: "both"
    });
    esquinas.set(abajo.blockIndex, {
      ...(esquinas.get(abajo.blockIndex) || {}),
      top: "both"
    });
  });

  return esquinas;
}

export function generarConectoresSerpenteantes(bloquesPagina, pageIndex) {
  if (!bloquesPagina?.length) return "";

  let svgOut = "";
  obtenerTransicionesDeFila(bloquesPagina).forEach(({ arriba, abajo }, idx) => {
    if (!bloquesCompartenFrase(arriba, abajo)) return;

    const anchoBajada = Math.max(32, Math.min(180, arriba.width, abajo.width));
    let xConector;

    if (arriba.dir === "ltr") {
      const bordeDerechoComun = Math.min(
        arriba.x + arriba.width,
        abajo.x + abajo.width
      );
      xConector = bordeDerechoComun - anchoBajada;
    } else {
      xConector = Math.max(arriba.x, abajo.x);
    }

    const yTop = arriba.y + arriba.height;
    const yBottom = abajo.y;
    if (yBottom <= yTop) return;

    const x0 = xConector;
    const x1 = xConector + anchoBajada;
    const y0 = yTop - 2;
    const y1 = yBottom + 2;
    const gradId = `mcConnGrad_${pageIndex}_${idx}`;
    let fillStyle = arriba.palette.fill;

    if (arriba.palette.fill !== abajo.palette.fill) {
      svgOut += `
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${arriba.palette.fill}" />
            <stop offset="100%" stop-color="${abajo.palette.fill}" />
          </linearGradient>
        </defs>
      `;
      fillStyle = `url(#${gradId})`;
    }

    const mergePath = `M ${x0} ${y0} L ${x1} ${y0} L ${x1} ${y1} L ${x0} ${y1} Z`;
    svgOut += `
      <path
        d="${mergePath}"
        fill="${fillStyle}"
        stroke="none"
        opacity="1"
      />
      <line
        x1="${x0}" y1="${y0}" x2="${x0}" y2="${y1}"
        stroke="${arriba.palette.stroke}"
        stroke-width="2.5"
      />
      <line
        x1="${x1}" y1="${y0}" x2="${x1}" y2="${y1}"
        stroke="${arriba.palette.stroke}"
        stroke-width="2.5"
      />
    `;
  });

  return svgOut;
}
