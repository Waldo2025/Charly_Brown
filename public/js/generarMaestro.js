function generarProgramaSintetico(secuenciaActual) {
  // Columnas para cada campo formativo (Set evita duplicados)
  const columnas = {
    "Lenguajes": { contenido: new Set(), proceso: new Set(), ambiente: "Áulico" },
    "Saberes y Pensamiento Científico": { contenido: new Set(), proceso: new Set(), ambiente: "Comunitario" },
    "Ética, Naturaleza y Sociedades": { contenido: new Set(), proceso: new Set(), ambiente: "Áulico" },
    "De lo Humano y lo Comunitario": { contenido: new Set(), proceso: new Set(), ambiente: "Comunitario" }
  };

  // ✅ Mapeo EXACTO categoría → columna del campo formativo
  const mapeoCampoFormativo = {
    "Lenguaje y comunicación": "Lenguajes",
    "Ciencias experimentales": "Saberes y Pensamiento Científico",
    "Ciencias sociales": "Ética, Naturaleza y Sociedades",
    "Formación socioemocional": "De lo Humano y lo Comunitario"
  };

  // ✅ Recorrer la secuencia filtrada por unidad/trim/nivel
  for (const key in secuenciaActual) {
    // solo procesamos Contenido (_C)
    if (key.endsWith("_C")) {
      const subtema = key.replace("_C", "");
      const categoria = categoriaPorSubtema[subtema]; // ej: Lenguaje y comunicación
      const campoFormativo = mapeoCampoFormativo[categoria];

      // solo si el subtema tiene categoría reconocida
      if (campoFormativo && columnas[campoFormativo]) {
        const contenido = secuenciaActual[`${subtema}_C`] || "";
        const proceso = secuenciaActual[`${subtema}_P`] || "";

        if (contenido.trim()) columnas[campoFormativo].contenido.add(contenido.trim());
        if (proceso.trim()) columnas[campoFormativo].proceso.add(proceso.trim());
      }
    }
  }

  // ✅ Convertimos Sets → texto limpio
  const columnasFinales = {};
  for (const campo in columnas) {
    columnasFinales[campo] = {
      contenido: Array.from(columnas[campo].contenido).join("<br>") || "-",
      proceso: Array.from(columnas[campo].proceso).join("<br>") || "-",
      ambiente: columnas[campo].ambiente
    };
  }

  // ✅ Tabla con formato Fase 5
  return `
    <div id="programa-sintetico" style="margin-bottom:20px;">
     <p>Puede realizar el codiseño curricular a partir de la siguiente contextualización pedagógica vinculada a los contenidos relevantes de los cuatro Campos Formativos:</p>
      <h3 style="text-align:center; background:#AEEEEE; margin-bottom:10px;">Fase 5</h3>
      <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%; text-align:center; font-size:14px;">
        <thead>
          <tr style="background:#f2f2f2; font-weight:bold;">
            <th style="background:#ddebf7;"></th>
            <th style="background:#ddebf7;">Campos Formativos</th>
            <th style="background:#fff2cc;">Lenguajes</th>
            <th style="background:#CFEDEA;">Saberes y Pensamiento Científico</th>
            <th style="background:#e2efda;">Ética, Naturaleza y Sociedades</th>
            <th style="background:#f4cccc;">De lo Humano y lo Comunitario</th>
          </tr>
        </thead>
        <tbody>
          <!-- Contenidos -->
          <tr>
            <td rowspan="3" style="background:#CFEDEA; font-weight:bold; writing-mode: vertical-rl; transform: rotate(180deg);">
              Programa<br>Sintético
            </td>
            <td style="background:#ebf1de; font-weight:bold;">Contenidos</td>
            <td>${columnasFinales["Lenguajes"].contenido}</td>
            <td>${columnasFinales["Saberes y Pensamiento Científico"].contenido}</td>
            <td>${columnasFinales["Ética, Naturaleza y Sociedades"].contenido}</td>
            <td>${columnasFinales["De lo Humano y lo Comunitario"].contenido}</td>
          </tr>
          <!-- Procesos -->
          <tr>
            <td style="background:#ebf1de; font-weight:bold;">Procesos</td>
            <td>${columnasFinales["Lenguajes"].proceso}</td>
            <td>${columnasFinales["Saberes y Pensamiento Científico"].proceso}</td>
            <td>${columnasFinales["Ética, Naturaleza y Sociedades"].proceso}</td>
            <td>${columnasFinales["De lo Humano y lo Comunitario"].proceso}</td>
          </tr>
          <!-- Ambientes -->
          <tr>
            <td style="background:#CFEDEA; font-weight:bold;">Ambientes</td>
            <td>${columnasFinales["Lenguajes"].ambiente}</td>
            <td>${columnasFinales["Saberes y Pensamiento Científico"].ambiente}</td>
            <td>${columnasFinales["Ética, Naturaleza y Sociedades"].ambiente}</td>
            <td>${columnasFinales["De lo Humano y lo Comunitario"].ambiente}</td>
          </tr>
        </tbody>
      </table>
      <p><strong>Contextualización pedagógica de Lenguaje y comunicación</strong></p>
      <p>En la presente Unidad los alumnos lograrán un nivel taxonómico de Comprensión, Análisis y Aplicación en el Campo Formativo de
        Lenguajes. Los aprendizajes esperados se encuentran señalados en el Temario del Libro del Alumno.</p>
    </div>
  `;
}


function generarRutaSugerida(subtemasOrdenados) {
  // 🎨 Paleta de colores por categoría (puedes ajustarlos)
  const coloresPorCategoria = {
    "Ortografía": "#a3d3f5",          // azul claro
    "Gramatica": "#d0e6ff",           // celeste
    "ExpresionEscrita": "#c7e8b4",    // verde claro
    "ExpresionOral": "#f9d5a7",       // naranja claro
    "Socioemocional": "#f7b7c3",      // rosa
    "CivicaEtica": "#f7b7c3",         // rosa
    "Habilidades": "#d9c2f0",         // morado claro
    "Naturales": "#ffe4a1",           // amarillo
    "Historia": "#ffd7a1",            // naranja
    "Geografia": "#c3f2e4",           // verde agua
    "Conocimiento_del_medio": "#c3f2e4", 
    "Matematicas": "#b4d7ff"          // azul más intenso
  };

  const items = subtemasOrdenados.map((subtema, index) => {
    const colorFondo = coloresPorCategoria[subtema] || (index % 2 ? '#a3d3f5' : '#d0e6ff');

    return `
      <div style="display:flex;align-items:center;margin-bottom:8px;">
        <div style="
          width:28px;height:28px;
          background:${colorFondo};
          color:#333;font-weight:bold;
          border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          margin-right:10px;">
          ${index + 1}
        </div>
        <span>${formatearSubtema(subtema)}</span>
      </div>
    `;
  }).join("");

  return `
    <div style="border-left:4px solid #4aa3df;padding-left:10px;margin:20px 0;">
      <h3 style="color:#9caa0f;margin-bottom:5px;">Ruta sugerida</h3>
      <p style="font-size:14px;line-height:1.4;">
        Esta herramienta le proporciona orientaciones para la organización de sus actividades durante la semana.
        Se propone un orden para realizar las diferentes secciones de la Unidad didáctica que puede modificar o seguir:
      </p>
      ${items}
    </div>
  `;
}


