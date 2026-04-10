(function () {
  const STORAGE_KEY = 'cb_theme_settings_v1';
  const VOICE_COMMANDS_STORAGE_KEY = 'cb_voice_command_settings_v1';
  const VOICE_COMMANDS_DEFAULTS_STORAGE_KEY = 'cb_voice_command_defaults_v1';
  const VOICE_COMMANDS_FACTORY_RESET_ONCE_KEY = 'cb_voice_commands_factory_reset_once_v1';
  const VOICE_COMMANDS_RESOURCE_REGEX_SYNC_KEY = 'cb_voice_commands_resource_regex_sync_v1';
  const VOICE_COMMANDS_LECTURA_ACTIONS_SYNC_KEY = 'cb_voice_commands_lectura_actions_sync_v1';
  const buildLecturaWorkflowGraph = (commandKey = 'buscar_lecturas_asc_charly') => {
    const key = String(commandKey || '').trim() || 'buscar_lecturas_asc_charly';
    const rootId = `wf_root_${key}`;
    return {
      version: 1,
      rootId,
      nodes: [
        { data: { id: rootId, label: key, spec: `cmd:${key}`, nodeType: 'root' }, position: { x: 360, y: 80 } },
        { data: { id: 'wf_step_1', label: 'cmd:WF Buscar lectura - Paso 1 (Iniciar búsqueda)', spec: 'cmd:wf_buscar_lectura_paso_1', nodeType: 'step' }, position: { x: 360, y: 220 } },
        { data: { id: 'wf_step_3', label: 'cmd:WF Buscar lectura - Paso 3 (Confirmar lectura)', spec: 'cmd:wf_buscar_lectura_paso_3', nodeType: 'decision' }, position: { x: 360, y: 360 } },
        { data: { id: 'wf_step_4', label: 'cmd:WF Buscar lectura - Paso 4 (Decidir acción)', spec: 'cmd:wf_buscar_lectura_paso_4', nodeType: 'decision' }, position: { x: 360, y: 520 } },
        { data: { id: 'wf_read', label: 'cmd:Leer lectura', spec: 'cmd:leer_lectura_charly', nodeType: 'step' }, position: { x: 220, y: 680 } },
        { data: { id: 'wf_close', label: 'cmd:WF Buscar lectura - Paso 5 (Cerrar flujo)', spec: 'cmd:wf_buscar_lectura_paso_5', nodeType: 'terminal' }, position: { x: 500, y: 680 } }
      ],
      edges: [
        { data: { id: 'wf_e_1', source: rootId, target: 'wf_step_1', label: 'siguiente' } },
        { data: { id: 'wf_e_2', source: 'wf_step_1', target: 'wf_step_3', label: 'siguiente' } },
        { data: { id: 'wf_e_3', source: 'wf_step_3', target: 'wf_step_4', label: 'si' } },
        { data: { id: 'wf_e_4', source: 'wf_step_3', target: 'wf_step_1', label: 'no' } },
        { data: { id: 'wf_e_5', source: 'wf_step_3', target: 'wf_close', label: 'cancelar' } },
        { data: { id: 'wf_e_6', source: 'wf_step_4', target: 'wf_read', label: 'leer completa' } },
        { data: { id: 'wf_e_7', source: 'wf_step_4', target: 'wf_close', label: 'resumen' } },
        { data: { id: 'wf_e_8', source: 'wf_step_4', target: 'wf_close', label: 'profundizar' } },
        { data: { id: 'wf_e_9', source: 'wf_step_4', target: 'wf_close', label: 'analiza lectura' } },
        { data: { id: 'wf_e_10', source: 'wf_read', target: 'wf_close', label: 'siguiente' } }
      ]
    };
  };
  const COMMAND_SETTINGS_ENABLED = true;
  const STYLE_ID = 'themeManagerStyles';
  const MODAL_ID = 'themeSettingsModal';
  const COMMAND_MODAL_ID = 'commandSettingsModal';
  const WORKFLOW_MODAL_ID = 'workflowMapModal';
  const OPEN_LINK_ID = 'themeSettingsLink';
  const COMMAND_OPEN_LINK_ID = 'themeCommandSettingsBtn';
  const CYTOSCAPE_CDN_URLS = [
    'vendor/cytoscape/cytoscape.min.js',
    'vendor/cytoscape/cytoscape.min.js'
  ];
  const CYTOSCAPE_EDGEHANDLES_CDN_URLS = [
    'vendor/cytoscape/cytoscape-edgehandles.js',
    'vendor/cytoscape/cytoscape-edgehandles.js'
  ];
  const LODASH_CDN_URLS = [
    'vendor/lodash/lodash.min.js',
    'vendor/lodash/lodash.min.js'
  ];
  const DAGRE_CDN_URLS = [
    'vendor/cytoscape/dagre.min.js',
    'vendor/cytoscape/dagre.min.js'
  ];
  const CYTOSCAPE_DAGRE_CDN_URLS = [
    'vendor/cytoscape/cytoscape-dagre.js',
    'vendor/cytoscape/cytoscape-dagre.js'
  ];
  const DEFAULT_PRESET_ID = 'classic_light';
  const DEFAULT_ALERT_PRESET_ID = 'warning_yellow';
  const DEFAULT_CHARLY_VOICE_NAME = 'Charon';
  const DEFAULT_CHARLY_VOICE_SPEED = 1.0;
  const DEFAULT_CHARLY_VOICE_PITCH = 0.95;
  const DEFAULT_CHARLY_VOICE_MOOD = 'profesional';
  const DEFAULT_CHARLY_VOICE_LOCALE = 'es-MX';
  const DEFAULT_CHARLY_VOICE_PRESET = 'joven_profesional';
  const DEFAULT_LECTURA_USE_CHARLY_VOICE = true;
  const DEFAULT_LECTURA_VOICE_NAME = DEFAULT_CHARLY_VOICE_NAME;
  const DEFAULT_LECTURA_VOICE_SPEED = 0.94;
  const DEFAULT_LECTURA_VOICE_PITCH = 0.92;
  const DEFAULT_LECTURA_VOICE_MOOD = 'narrativo';
  const DEFAULT_LECTURA_VOICE_LOCALE = 'es-MX';
  const CHARLY_LOCALE_OPTIONS = [
    { value: 'es-MX', label: 'Español (México)' },
    { value: 'es-419', label: 'Español (Latinoamérica)' },
    { value: 'es-ES', label: 'Español (España)' },
    { value: 'en-US', label: 'English (US)' }
  ];
  const GEMINI_TTS_VOICE_OPTIONS_MALE = [
    'Achird', 'Algenib', 'Algieba', 'Alnilam', 'Charon', 'Enceladus', 'Fenrir',
    'Iapetus', 'Orus', 'Puck', 'Rasalgethi', 'Sadachbia', 'Sadaltager',
    'Schedar', 'Umbriel', 'Zubenelgenubi'
  ];
  const GEMINI_TTS_VOICE_OPTIONS_FEMALE = [
    'Achernar', 'Aoede', 'Autonoe', 'Callirrhoe', 'Despina', 'Erinome',
    'Gacrux', 'Kore', 'Laomedeia', 'Leda', 'Pulcherrima', 'Sulafat',
    'Vindemiatrix', 'Zephyr'
  ];
  const CHARLY_MOOD_OPTIONS = [
    { value: 'profesional', label: 'Profesional' },
    { value: 'amigable', label: 'Amigable' },
    { value: 'sereno', label: 'Sereno' },
    { value: 'entusiasta', label: 'Entusiasta' },
    { value: 'formal', label: 'Formal' },
    { value: 'narrativo', label: 'Narrativo' },
    { value: 'calido', label: 'Cálido' },
    { value: 'empatico', label: 'Empático' },
    { value: 'alegre', label: 'Alegre' },
    { value: 'curioso', label: 'Curioso' },
    { value: 'misterioso', label: 'Misterioso' },
    { value: 'suspenso', label: 'Suspenso' },
    { value: 'epico', label: 'Épico' },
    { value: 'dramatico', label: 'Dramático' },
    { value: 'tierno', label: 'Tierno' },
    { value: 'rebelde', label: 'Rebelde Joven' },
    { value: 'payaso', label: 'Payaso Carismático' },
    { value: 'chilango', label: 'Chilango (CDMX)' }
  ];
  const CHARLY_VOICE_PRESETS = {
    joven_profesional: {
      label: 'Joven profesional',
      voiceName: 'Charon',
      mood: 'profesional',
      locale: 'es-MX',
      speed: 1.0,
      pitch: 0.95
    },
    docente_calido: {
      label: 'Docente calido',
      voiceName: 'Iapetus',
      mood: 'amigable',
      locale: 'es-419',
      speed: 0.95,
      pitch: 0.9
    },
    serio_ejecutivo: {
      label: 'Serio ejecutivo',
      voiceName: 'Orus',
      mood: 'formal',
      locale: 'es-MX',
      speed: 0.9,
      pitch: 0.85
    },
    dinamico_mentor: {
      label: 'Dinamico mentor',
      voiceName: 'Puck',
      mood: 'entusiasta',
      locale: 'es-419',
      speed: 1.12,
      pitch: 1.0
    },
    sereno_paciente: {
      label: 'Sereno paciente',
      voiceName: 'Umbriel',
      mood: 'sereno',
      locale: 'es-MX',
      speed: 0.88,
      pitch: 0.86
    },
    chilango_directo: {
      label: 'Chilango directo',
      voiceName: 'Charon',
      mood: 'chilango',
      locale: 'es-MX',
      speed: 1.04,
      pitch: 0.98
    },
    rebelde_urbano: {
      label: 'Rebelde urbano',
      voiceName: 'Puck',
      mood: 'rebelde',
      locale: 'es-419',
      speed: 1.1,
      pitch: 1.03
    },
    payaso_showman: {
      label: 'Payaso showman',
      voiceName: 'Umbriel',
      mood: 'payaso',
      locale: 'es-419',
      speed: 1.18,
      pitch: 1.08
    }
  };
  function normalizePageId(pageId) {
    const normalized = String(pageId || '').trim().toLowerCase();
    if (!normalized) return '';
    if (normalized.includes('.')) return normalized;
    return `${normalized}.html`;
  }

  const CURRENT_PAGE = (() => {
    const bodyPage = normalizePageId(document.body?.dataset?.page || '');
    if (bodyPage) return bodyPage;
    const pathPage = window.location.pathname.split('/').pop() || '';
    return normalizePageId(pathPage);
  })();
  const VOICE_COMMAND_CATALOG = [
    { key: 'open_generar_unidad', section: 'Boton', fn: '_clickButtonById', target: 'btnAbrirModalUnidad', name: 'Abrir Generar Unidad Nueva', defaultRegex: 'generar unidad nueva, generar una unidad nueva, genera unidad nueva, genera una unidad nueva, crear unidad nueva, crear una unidad nueva, crea unidad nueva, crea una unidad nueva, abre unidad nueva, abre una unidad nueva, abrir unidad nueva, abrir una unidad nueva, abrir modal unidad, abre generar unidad nueva, vamos a crear una unidad nueva, vamos a crear unidad nueva, hagamos una unidad', speak: false },
    { key: 'open_lecturas_nuevas', section: 'Boton', fn: '_clickButtonById', target: 'btnSugerenciasLectura', name: 'Abrir Generar Lecturas Nuevas', defaultRegex: 'generar lectura nueva, lecturas nuevas, sugerencias de lectura, abrir lecturas nuevas', speak: false },
    { key: 'open_secuencia', section: 'Boton', fn: '_clickButtonById', target: 'btnSecuenciaAlcance', name: 'Abrir Secuencia y Alcance', defaultRegex: 'abrir secuencia, secuencia y alcance, mostrar secuencia', speak: false },
    { key: 'open_campos_formativos', section: 'Boton', fn: '_clickButtonById', target: 'btnCamposFormativos', name: 'Abrir Campos Formativos', defaultRegex: 'abrir campos formativos, mostrar campos formativos, campos formativos', speak: false },
    { key: 'open_estilos', section: 'Boton', fn: '_clickButtonById', target: 'btnAgregarEstilo', name: 'Abrir Estilos Literarios', defaultRegex: 'abrir estilos, estilos literarios, agregar estilo', speak: false },
    { key: 'open_lecturas_asc', section: 'Boton', fn: '_clickButtonById', target: 'btnLecturasAsc', name: 'Abrir Lecturas ASC', defaultRegex: 'abrir lecturas asc, lecturas asc, asc', speak: false },
    { key: 'open_metodologia', section: 'Boton', fn: '_clickButtonById', target: 'btnAbrirModalMetodologia', name: 'Abrir Metodologia ASC', defaultRegex: 'abrir metodologia, abrir metodología, metodologia asc, metodología asc', speak: false },
    { key: 'open_unidades_guardadas', section: 'Boton', fn: '_clickButtonById', target: 'btnListaUnidadesGuardadas', name: 'Abrir Unidades Guardadas', defaultRegex: 'abrir unidades guardadas, unidades guardadas, lista de unidades', speak: false },
    { key: 'set_nivel', section: 'Campo', fn: '_manejarParametrosUnidadPorVoz', target: 'unidadNivel', name: 'Cambiar Nivel', defaultRegex: 'nivel, cambiar nivel, poner nivel', speak: false },
    { key: 'set_grado', section: 'Campo', fn: '_manejarParametrosUnidadPorVoz', target: 'unidadGrado', name: 'Cambiar Grado', defaultRegex: 'grado, cambiar grado, poner grado', speak: false },
    { key: 'set_trimestre', section: 'Campo', fn: '_manejarParametrosUnidadPorVoz', target: 'unidadTrimestre', name: 'Cambiar Trimestre', defaultRegex: 'trimestre, cambiar trimestre, poner trimestre', speak: false },
    { key: 'set_unidad_numero', section: 'Campo', fn: '_manejarParametrosUnidadPorVoz', target: 'unidadNumero', name: 'Cambiar Unidad Numero', defaultRegex: 'unidad, unidad numero, número de unidad, cambiar unidad', speak: false },
    { key: 'set_lectura_principal', section: 'Campo', fn: '_manejarParametrosUnidadPorVoz', target: 'unidadTema', name: 'Cambiar Lectura Principal', defaultRegex: 'lectura principal, cambiar lectura, seleccionar lectura principal, tema principal', speak: false },
    { key: 'seq_relacion_lectura', section: 'Tabla Secuencia', fn: '_setTablaSecuenciaCheckboxByVoice', target: 'relacion', name: 'Relacionar con Lectura (Tabla Secuencia)', defaultRegex: 'relacionar con lectura, agregar relacion lectura, quitar relacion lectura, relacion lectura en subtema, relacion lectura en categoria', speak: false },
    { key: 'seq_recortables', section: 'Tabla Secuencia', fn: '_setTablaSecuenciaCheckboxByVoice', target: 'recortable', name: 'Recortables (Tabla Secuencia)', defaultRegex: 'agregar recortables, agrega recortables, agregar recortable, agrega recortable, agregar un recortable, agrega un recortable, agregar el recortable, agrega el recortable, añadir recortables, añade recortables, añadir recortable, añade recortable, añadir un recortable, añade un recortable, añadir el recortable, añade el recortable, poner recortables, pon recortables, poner un recortable, pon un recortable, insertar recortables, inserta recortables, insertar un recortable, inserta un recortable, sumar recortables, agrega recortables en, agregar recortables en, agrega recortables al, agregar recortables al, agrega recortables a, agregar recortables a, agrega recortables dentro de, agregar recortables dentro de, agrega recortables en subtema, agregar recortables en subtema, agrega recortables en el subtema, agregar recortables en el subtema, agrega recortables en categoría, agregar recortables en categoría, agrega recortables en la categoría, agregar recortables en la categoría, agrega un recortable en, agregar un recortable en, agrega un recortable al, agregar un recortable al, agrega un recortable a, agregar un recortable a, añade un recortable en, añadir un recortable en, añade un recortable al, añadir un recortable al, añade un recortable a, añadir un recortable a, quitar recortables, quita recortables, quitar recortable, quita recortable, quitar el recortable, quita el recortable, quitar un recortable, quita un recortable, remover recortables, remueve recortables, remover recortable, remueve recortable, eliminar recortables, elimina recortables, eliminar recortable, elimina recortable, borrar recortables, borra recortables, borrar recortable, borra recortable, quitar recortables en, quita recortables en, quitar recortables de, quita recortables de, quitar recortable en, quita recortable en, quitar recortable de, quita recortable de, remover recortables en, remueve recortables en, remover recortables de, remueve recortables de, remover recortable en, remueve recortable en, remover recortable de, remueve recortable de, elimina recortables en, elimina recortables de, elimina recortable en, elimina recortable de, borra recortables en, borra recortables de, borra recortable en, borra recortable de, quita el recortable de, remueve el recortable de, elimina el recortable de', speak: false },
    { key: 'seq_fichas', section: 'Tabla Secuencia', fn: '_setTablaSecuenciaCheckboxByVoice', target: 'ficha', name: 'Fichas (Tabla Secuencia)', defaultRegex: 'agregar fichas, agrega fichas, agregar ficha, agrega ficha, agregar una ficha, agrega una ficha, agregar la ficha, agrega la ficha, añadir fichas, añade fichas, añadir ficha, añade ficha, añadir una ficha, añade una ficha, añadir la ficha, añade la ficha, poner fichas, pon fichas, poner una ficha, pon una ficha, insertar fichas, inserta fichas, insertar una ficha, inserta una ficha, sumar fichas, agrega fichas en, agregar fichas en, agrega fichas al, agregar fichas al, agrega fichas a, agregar fichas a, agrega fichas dentro de, agregar fichas dentro de, agrega fichas en subtema, agregar fichas en subtema, agrega fichas en el subtema, agregar fichas en el subtema, agrega fichas en categoría, agregar fichas en categoría, agrega fichas en la categoría, agregar fichas en la categoría, agrega una ficha en, agregar una ficha en, agrega una ficha al, agregar una ficha al, agrega una ficha a, agregar una ficha a, añade una ficha en, añadir una ficha en, añade una ficha al, añadir una ficha al, añade una ficha a, añadir una ficha a, añade una ficha en subtema, añadir una ficha en subtema, agrega una ficha en categoría, agregar una ficha en categoría, quitar fichas, quita fichas, quitar ficha, quita ficha, quitar una ficha, quita una ficha, quitar la ficha, quita la ficha, remover fichas, remueve fichas, remover ficha, remueve ficha, eliminar fichas, elimina fichas, eliminar ficha, elimina ficha, borrar fichas, borra fichas, borrar ficha, borra ficha, quitar fichas en, quita fichas en, quitar fichas de, quita fichas de, quitar ficha en, quita ficha en, quitar ficha de, quita ficha de, remover fichas en, remueve fichas en, remover fichas de, remueve fichas de, remover ficha en, remueve ficha en, remover ficha de, remueve ficha de, elimina fichas en, elimina fichas de, elimina ficha en, elimina ficha de, borra fichas en, borra fichas de, borra ficha en, borra ficha de, quitar la ficha de, remueve la ficha de, elimina la ficha de', speak: false },
    { key: 'seq_anexos', section: 'Tabla Secuencia', fn: '_setTablaSecuenciaCheckboxByVoice', target: 'anexo', name: 'Anexos (Tabla Secuencia)', defaultRegex: 'agregar anexos, agrega anexos, agregar anexo, agrega anexo, agregar un anexo, agrega un anexo, agregar el anexo, agrega el anexo, añadir anexos, añade anexos, añadir anexo, añade anexo, añadir un anexo, añade un anexo, añadir el anexo, añade el anexo, poner anexos, pon anexos, poner un anexo, pon un anexo, insertar anexos, inserta anexos, insertar un anexo, inserta un anexo, sumar anexos, agrega anexos en, agregar anexos en, agrega anexos al, agregar anexos al, agrega anexos a, agregar anexos a, agrega anexos dentro de, agregar anexos dentro de, agrega anexos en subtema, agregar anexos en subtema, agrega anexos en el subtema, agregar anexos en el subtema, agrega anexos en categoría, agregar anexos en categoría, agrega anexos en la categoría, agregar anexos en la categoría, agrega un anexo en, agregar un anexo en, agrega un anexo al, agregar un anexo al, agrega un anexo a, agregar un anexo a, añade un anexo en, añadir un anexo en, añade un anexo al, añadir un anexo al, añade un anexo a, añadir un anexo a, quitar anexos, quita anexos, quitar anexo, quita anexo, quitar un anexo, quita un anexo, quitar el anexo, quita el anexo, remover anexos, remueve anexos, remover anexo, remueve anexo, eliminar anexos, elimina anexos, eliminar anexo, elimina anexo, borrar anexos, borra anexos, borrar anexo, borra anexo, quitar anexos en, quita anexos en, quitar anexos de, quita anexos de, quitar anexo en, quita anexo en, quitar anexo de, quita anexo de, remover anexos en, remueve anexos en, remover anexos de, remueve anexos de, remover anexo en, remueve anexo en, remover anexo de, remueve anexo de, elimina anexos en, elimina anexos de, elimina anexo en, elimina anexo de, borra anexos en, borra anexos de, borra anexo en, borra anexo de, quita el anexo de, remueve el anexo de, elimina el anexo de, añade un anexo, añade anexos, agrega anexos en categoría, agregar anexos en categoría', speak: false },
    { key: 'seq_videos', section: 'Tabla Secuencia', fn: '_setTablaSecuenciaCheckboxByVoice', target: 'video', name: 'Videos (Tabla Secuencia)', defaultRegex: 'agregar videos, agrega videos, agregar video, agrega video, agregar un video, agrega un video, agregar el video, agrega el video, añadir videos, añade videos, añadir video, añade video, añadir un video, añade un video, añadir el video, añade el video, poner videos, pon videos, poner un video, pon un video, insertar videos, inserta videos, insertar un video, inserta un video, sumar videos, agrega videos en, agregar videos en, agrega videos al, agregar videos al, agrega videos a, agregar videos a, agrega videos dentro de, agregar videos dentro de, agrega videos en subtema, agregar videos en subtema, agrega videos en el subtema, agregar videos en el subtema, agrega videos en categoría, agregar videos en categoría, agrega videos en la categoría, agregar videos en la categoría, agrega un video en, agregar un video en, agrega un video al, agregar un video al, agrega un video a, agregar un video a, añade un video en, añadir un video en, añade un video al, añadir un video al, añade un video a, añadir un video a, quitar videos, quita videos, quitar video, quita video, quitar un video, quita un video, quitar el video, quita el video, remover videos, remueve videos, remover video, remueve video, eliminar videos, elimina videos, eliminar video, elimina video, borrar videos, borra videos, borrar video, borra video, quitar videos en, quita videos en, quitar videos de, quita videos de, quitar video en, quita video en, quitar video de, quita video de, remover videos en, remueve videos en, remover videos de, remueve videos de, remover video en, remueve video en, remover video de, remueve video de, elimina videos en, elimina videos de, elimina video en, elimina video de, borra videos en, borra videos de, borra video en, borra video de, quita el video de, remueve el video de, elimina el video de', speak: false },
    { key: 'seq_num_actividades', section: 'Tabla Secuencia', fn: '_setTablaSecuenciaNumeroActividadesByVoice', target: 'num_actividades', name: 'Numero de Actividades (Tabla Secuencia)', defaultRegex: 'poner actividades en subtema, cambiar actividades en subtema, actividades en categoria, numero de actividades', speak: false },
    { key: 'seq_instrucciones_categoria', section: 'Tabla Secuencia', fn: '_openGeminiInstruccionesByCategoria', target: 'categoria', name: 'Abrir Instrucciones Gemini Categoria', defaultRegex: 'abrir instrucciones gemini, abrir instrucciones de categoria, configurar instrucciones categoria, instrucciones gemini de subtema', next: 'dictar instrucciones gemini', speak: false },
    { key: 'seq_generar_categoria', section: 'Tabla Secuencia', fn: '_generarCategoriaByVoice', target: 'categoria', name: 'Generar Seccion/Categoria', defaultRegex: 'generar categoria, generar seccion, generar categoria de subtema, generar seccion de categoria', speak: false },
    { key: 'open_selector_lectura_modal', section: 'Lecturas Modal', fn: '_clickButtonById', target: 'btnAbrirModalLectura', name: 'Abrir Selector de Lectura', defaultRegex: 'abrir selector lectura, abrir lecturas, abre las lecturas, abrir modal lectura', speak: false },
    { key: 'modal_lecturas_buscar_texto', section: 'Lecturas Modal', fn: '_setInputByVoice', target: 'filtroBusquedaLectura', name: 'Buscar Lectura por Titulo/Autor', defaultRegex: 'buscar lectura, buscar titulo, filtrar lectura, buscar por autor', speak: false },
    { key: 'modal_lecturas_filtrar_nivel', section: 'Lecturas Modal', fn: '_setSelectByVoice', target: 'filtroNivelLectura', name: 'Filtrar Lecturas por Nivel', defaultRegex: 'filtrar nivel primaria, filtrar nivel secundaria, filtrar nivel preescolar, todos los niveles', speak: false },
    { key: 'modal_lecturas_filtrar_tipo', section: 'Lecturas Modal', fn: '_setSelectByVoice', target: 'tipoLecturaFiltro', name: 'Filtrar Tipo de Lectura', defaultRegex: 'tipo principales, tipo asc, mostrar principales, mostrar asc, mostrar todas', speak: false },
    { key: 'modal_lecturas_ordenar', section: 'Lecturas Modal', fn: '_setSelectByVoice', target: 'ordenarLecturas', name: 'Ordenar Lecturas', defaultRegex: 'ordenar por titulo, ordenar por autor, ordenar por grado, ordenar por unidad', speak: false },
    { key: 'modal_lecturas_confirmar', section: 'Lecturas Modal', fn: '_clickButtonById', target: 'btnConfirmarSeleccion', name: 'Confirmar Seleccion de Lectura', defaultRegex: 'confirmar lectura, confirmar seleccion, aceptar lectura', speak: false },
    { key: 'modal_lecturas_cancelar', section: 'Lecturas Modal', fn: '_clickButtonById', target: 'btnCancelarSeleccion', name: 'Cancelar Selector de Lectura', defaultRegex: 'cancelar lectura, cerrar selector lectura, cancelar seleccion', speak: false },
    { key: 'modal_lecturas_pagina_anterior', section: 'Lecturas Modal', fn: '_clickButtonById', target: 'btnAnteriorPagina', name: 'Pagina Anterior de Lecturas', defaultRegex: 'pagina anterior lecturas, anterior lecturas, retroceder lecturas', speak: false },
    { key: 'modal_lecturas_pagina_siguiente', section: 'Lecturas Modal', fn: '_clickButtonById', target: 'btnSiguientePagina', name: 'Pagina Siguiente de Lecturas', defaultRegex: 'pagina siguiente lecturas, siguiente lecturas, avanzar lecturas', speak: false },
    {
      key: 'buscar_lecturas_charly',
      section: 'Lecturas',
      fn: '_buscarLecturaPorVoz',
      target: 'lecturas',
      name: 'Buscar lecturas',
      defaultRegex: 'buscar lecturas, busca lecturas, buscar lectura, busca una lectura, encontrar lectura, localiza lectura',
      speak: true
    },
    { key: 'leer_lectura_charly', section: 'Lecturas', fn: '_leerLecturaPorVoz', target: 'lecturas', name: 'Leer lectura', defaultRegex: 'lee la lectura, leer lectura, leeme la lectura, léeme la lectura, continuar lectura', speak: true },
    { key: 'ver_lectura_charly', section: 'Lecturas', fn: '_verLecturaPorVoz', target: 'lecturas', name: 'Ver lectura', defaultRegex: 'ver lectura, abre la lectura, abrir lectura, mostrar lectura, muéstrame la lectura, muestrame la lectura', speak: true },
    { key: 'editar_lectura_charly', section: 'Lecturas', fn: '_editarLecturaPorVoz', target: 'lecturas', name: 'Editar lectura', defaultRegex: 'editar lectura, edita la lectura, modificar lectura, modifica la lectura', speak: true },
    { key: 'exportar_word_lectura_charly', section: 'Lecturas', fn: '_exportarLecturaWordPorVoz', target: 'lecturas', name: 'Exportar lectura Word', defaultRegex: 'exportar lectura word, exportar word de la lectura, descargar lectura word, descargar word de la lectura, exportar lectura docx, descargar lectura docx', speak: true },
    { key: 'wake_charly', section: 'Sistema', fn: '_esComandoDespertar', target: 'charly', name: 'Despertar a Charly', defaultRegex: 'charly, despierta charly, charly despierta, hey charly, responde charly', speak: true },
    { key: 'sleep_charly', section: 'Sistema', fn: '_esComandoDescanso', target: 'charly', name: 'Dormir a Charly', defaultRegex: 'duerme charly, charly descansa, silencio charly, callate charly', speak: true },
    { key: 'greet_charly', section: 'Sistema', fn: '_esComandoSaludo', target: 'charly', name: 'Saludo a Charly', defaultRegex: 'hola charly, buenos dias charly, buenas tardes charly, como estas charly', speak: true }
  ];
  const VOICE_COMMAND_FN_GROUPS = [
    {
      label: 'Navegacion UI',
      options: [
        { value: '_clickButtonById', label: 'Click Boton' },
        { value: '_openModalById', label: 'Abrir Modal' },
        { value: '_closeModalById', label: 'Cerrar Modal' }
      ]
    },
    {
      label: 'Campos y Selecciones',
      options: [
        { value: '_manejarParametrosUnidadPorVoz', label: 'Cambiar Campo' },
        { value: '_setInputByVoice', label: 'Escribir/Dictar Campo' },
        { value: '_setSelectByVoice', label: 'Seleccionar Opcion' },
        { value: '_toggleCheckboxByVoice', label: 'Marcar/Desmarcar Checkbox' }
      ]
    },
    {
      label: 'Tabla Secuencia',
      options: [
        { value: '_setTablaSecuenciaCheckboxByVoice', label: 'Seleccionar Checkbox Tabla Secuencia' },
        { value: '_setTablaSecuenciaNumeroActividadesByVoice', label: 'Cambiar # Actividades Tabla Secuencia' },
        { value: '_openGeminiInstruccionesByCategoria', label: 'Abrir Instrucciones Gemini (Categoria)' },
        { value: '_generarCategoriaByVoice', label: 'Generar Seccion/Categoria' }
      ]
    },
    {
      label: 'Lecturas',
      options: [
        { value: '_selectLecturaTablaByText', label: 'Seleccionar Lectura en Tabla' },
        { value: '_buscarLecturaPorVoz', label: 'Buscar lectura' },
        { value: '_leerLecturaPorVoz', label: 'Leer lectura' },
        { value: '_verLecturaPorVoz', label: 'Ver lectura' },
        { value: '_editarLecturaPorVoz', label: 'Editar lectura' },
        { value: '_exportarLecturaWordPorVoz', label: 'Exportar lectura Word' }
      ]
    },
    {
      label: 'Sistema',
      options: [
        { value: '_esComandoDespertar', label: 'Despertar Charly' },
        { value: '_esComandoDescanso', label: 'Dormir Charly' },
        { value: '_esComandoSaludo', label: 'Saludo Charly' },
        { value: '_continuarRespondiendo', label: 'Continuar respondiendo' }
      ]
    }
  ];
  const VOICE_COMMAND_FN_OPTIONS = VOICE_COMMAND_FN_GROUPS.flatMap((group) => group.options);
  const DEFAULT_NEXT_ACTION_PRESETS = [
    { group: 'Dictado', label: 'Dictar instrucciones Gemini', value: 'dictar instrucciones gemini' },
    { group: 'Dictado', label: 'Escribir en filtro de lecturas', value: '_setInputByVoice|filtroBusquedaLectura|' },
    { group: 'Dictado', label: 'Escribir en lectura principal', value: '_setInputByVoice|unidadTemaTexto|' },

    { group: 'Navegacion', label: 'Abrir Unidad Nueva', value: 'cmd:open_generar_unidad' },
    { group: 'Navegacion', label: 'Abrir Lecturas Nuevas', value: 'cmd:open_lecturas_nuevas' },
    { group: 'Navegacion', label: 'Abrir Secuencia', value: 'cmd:open_secuencia' },
    { group: 'Navegacion', label: 'Abrir Campos Formativos', value: 'cmd:open_campos_formativos' },
    { group: 'Navegacion', label: 'Abrir Estilos', value: 'cmd:open_estilos' },
    { group: 'Navegacion', label: 'Abrir Lecturas ASC', value: 'cmd:open_lecturas_asc' },
    { group: 'Navegacion', label: 'Abrir Metodologia', value: 'cmd:open_metodologia' },
    { group: 'Navegacion', label: 'Abrir Unidades Guardadas', value: 'cmd:open_unidades_guardadas' },
    { group: 'Navegacion', label: 'Abrir Selector Lectura', value: 'cmd:open_selector_lectura_modal' },

    { group: 'Lecturas Modal', label: 'Buscar lectura en modal', value: 'cmd:modal_lecturas_buscar_texto' },
    { group: 'Lecturas Modal', label: 'Confirmar lectura', value: 'cmd:modal_lecturas_confirmar' },
    { group: 'Lecturas Modal', label: 'Cancelar lectura', value: 'cmd:modal_lecturas_cancelar' },
    { group: 'Lecturas Modal', label: 'Pagina anterior lecturas', value: 'cmd:modal_lecturas_pagina_anterior' },
    { group: 'Lecturas Modal', label: 'Pagina siguiente lecturas', value: 'cmd:modal_lecturas_pagina_siguiente' },
    { group: 'Lecturas', label: 'Buscar lecturas (Charly)', value: 'cmd:buscar_lecturas_charly' },
    { group: 'Lecturas', label: 'Leer lectura (Charly)', value: 'cmd:leer_lectura_charly' },
    { group: 'Lecturas', label: 'Ver lectura (Charly)', value: 'cmd:ver_lectura_charly' },
    { group: 'Lecturas', label: 'Editar lectura (Charly)', value: 'cmd:editar_lectura_charly' },
    { group: 'Lecturas', label: 'Exportar lectura Word (Charly)', value: 'cmd:exportar_word_lectura_charly' },

    { group: 'Secuencia', label: 'Relacionar con lectura', value: 'cmd:seq_relacion_lectura' },
    { group: 'Secuencia', label: 'Agregar recortables', value: 'cmd:seq_recortables' },
    { group: 'Secuencia', label: 'Agregar fichas', value: 'cmd:seq_fichas' },
    { group: 'Secuencia', label: 'Agregar anexos', value: 'cmd:seq_anexos' },
    { group: 'Secuencia', label: 'Agregar videos', value: 'cmd:seq_videos' },
    { group: 'Secuencia', label: 'Abrir instrucciones Gemini categoria', value: 'cmd:seq_instrucciones_categoria' },
    { group: 'Secuencia', label: 'Generar categoria', value: 'cmd:seq_generar_categoria' },

    { group: 'Sistema', label: 'Despertar Charly', value: 'cmd:wake_charly' },
    { group: 'Sistema', label: 'Dormir Charly', value: 'cmd:sleep_charly' },
    { group: 'Sistema', label: 'Saludar Charly', value: 'cmd:greet_charly' },
    { group: 'Sistema', label: 'Cualquiera (esperar instrucción)', value: 'cualquiera' },

    { group: 'Control', label: 'Limpiar', value: '' }
  ];
  const NEXT_STEP_COLUMNS_MIN = 1;
  const NEXT_STEP_COLUMNS_MAX = 40;
  const NEXT_STEP_COLUMNS_DEFAULT = 5;
  const WORKFLOW_PLAY_STEP_DELAY_MS = 1400;
  const WORKFLOW_PLAY_DELAY_MIN_MS = 400;
  const WORKFLOW_PLAY_DELAY_MAX_MS = 7000;
  const VOICE_FN_BASE_VALUES = new Set(VOICE_COMMAND_FN_OPTIONS.map((opt) => opt.value));

  const BASE_PRESET_THEMES = {
    classic_light: {
      label: 'Clasico Claro',
      category: 'esenciales',
      mode: 'light',
      headerColor: '#3f4d98',
      headerTextColor: '#ffffff',
      bodyColor: '#f8fafc',
      textColor: '#111827'
    },
    graphite_dark: {
      label: 'Grafito Oscuro',
      category: 'esenciales',
      mode: 'dark',
      headerColor: '#111827',
      headerTextColor: '#f8fafc',
      bodyColor: '#0b1220',
      textColor: '#e5e7eb'
    },
    ocean_blue: {
      label: 'Oceano Azul',
      category: 'esenciales',
      mode: 'light',
      headerColor: '#0f4c81',
      headerTextColor: '#f8fafc',
      bodyColor: '#eef6ff',
      textColor: '#0f172a'
    },
    emerald_fresh: {
      label: 'Esmeralda',
      category: 'esenciales',
      mode: 'light',
      headerColor: '#146c43',
      headerTextColor: '#f8fafc',
      bodyColor: '#f2fbf7',
      textColor: '#0f172a'
    },
    amber_paper: {
      label: 'Papel Calido',
      category: 'esenciales',
      mode: 'light',
      headerColor: '#7c4a03',
      headerTextColor: '#fff7ed',
      bodyColor: '#fffaf0',
      textColor: '#3f2a12'
    },
    violet_focus: {
      label: 'Violeta',
      category: 'esenciales',
      mode: 'dark',
      headerColor: '#312e81',
      headerTextColor: '#eef2ff',
      bodyColor: '#15162c',
      textColor: '#e2e8f0'
    },
    cobalt_tangerine: {
      label: 'Cobalto + Tangerina',
      category: 'esenciales',
      mode: 'light',
      headerColor: '#1e40af',
      headerTextColor: '#eff6ff',
      bodyColor: '#fff7ed',
      textColor: '#1f2937'
    },
    teal_rose: {
      label: 'Teal + Rosa',
      category: 'esenciales',
      mode: 'light',
      headerColor: '#0f766e',
      headerTextColor: '#f0fdfa',
      bodyColor: '#fff1f2',
      textColor: '#1f2937'
    },
    crimson_mint: {
      label: 'Carmesi + Menta',
      category: 'esenciales',
      mode: 'light',
      headerColor: '#b91c1c',
      headerTextColor: '#fef2f2',
      bodyColor: '#ecfdf5',
      textColor: '#1f2937'
    },
    indigo_lime: {
      label: 'Indigo + Lima',
      category: 'esenciales',
      mode: 'light',
      headerColor: '#3730a3',
      headerTextColor: '#eef2ff',
      bodyColor: '#f7fee7',
      textColor: '#1f2937'
    },
    coral_cyan: {
      label: 'Coral + Cian',
      category: 'esenciales',
      mode: 'light',
      headerColor: '#ea580c',
      headerTextColor: '#fff7ed',
      bodyColor: '#ecfeff',
      textColor: '#1f2937'
    },
    plum_lime_dark: {
      label: 'Ciruela + Lima (Dark)',
      category: 'esenciales',
      mode: 'dark',
      headerColor: '#4c1d95',
      headerTextColor: '#f5f3ff',
      bodyColor: '#1a1f12',
      textColor: '#ecfccb'
    },
    navy_gold_dark: {
      label: 'Marino + Oro (Dark)',
      category: 'esenciales',
      mode: 'dark',
      headerColor: '#0f172a',
      headerTextColor: '#f8fafc',
      bodyColor: '#2a1f06',
      textColor: '#fef3c7'
    },
    graphite_citrus_dark: {
      label: 'Grafito + Citrico (Dark)',
      category: 'esenciales',
      mode: 'dark',
      headerColor: '#111827',
      headerTextColor: '#f9fafb',
      bodyColor: '#1b1f10',
      textColor: '#ecfccb'
    }
  };

  const THEME_PRESET_CATEGORIES = [
    { id: 'esenciales', label: 'Esenciales', baseHue: 222, harmony: 'curated', mode: 'mixed' },
    { id: 'complementarios_azules', label: 'Complementarios Azules', baseHue: 214, harmony: 'complementary', mode: 'mixed' },
    { id: 'complementarios_verdes', label: 'Complementarios Verdes', baseHue: 148, harmony: 'complementary', mode: 'mixed' },
    { id: 'complementarios_rojos', label: 'Complementarios Rojos', baseHue: 4, harmony: 'complementary', mode: 'mixed' },
    { id: 'complementarios_violetas', label: 'Complementarios Violetas', baseHue: 274, harmony: 'complementary', mode: 'mixed' },
    { id: 'analogos_marinos', label: 'Análogos Marinos', baseHue: 208, harmony: 'analogous', mode: 'light' },
    { id: 'analogos_bosque', label: 'Análogos Bosque', baseHue: 132, harmony: 'analogous', mode: 'mixed' },
    { id: 'analogos_ocre', label: 'Análogos Ocre', baseHue: 34, harmony: 'analogous', mode: 'light' },
    { id: 'analogos_berry', label: 'Análogos Berry', baseHue: 324, harmony: 'analogous', mode: 'mixed' },
    { id: 'triadas_modernas', label: 'Triadas Modernas', baseHue: 198, harmony: 'triadic', mode: 'mixed' },
    { id: 'triadas_editoriales', label: 'Triadas Editoriales', baseHue: 18, harmony: 'triadic', mode: 'light' },
    { id: 'triadas_premium', label: 'Triadas Premium', baseHue: 284, harmony: 'triadic', mode: 'dark' },
    { id: 'split_sunset', label: 'Split Sunset', baseHue: 16, harmony: 'splitComplementary', mode: 'mixed' },
    { id: 'split_laguna', label: 'Split Laguna', baseHue: 184, harmony: 'splitComplementary', mode: 'light' },
    { id: 'split_orquidea', label: 'Split Orquídea', baseHue: 302, harmony: 'splitComplementary', mode: 'mixed' },
    { id: 'tetra_estudio', label: 'Tétradas Estudio', baseHue: 222, harmony: 'tetradic', mode: 'mixed' },
    { id: 'tetra_citrica', label: 'Tétradas Cítricas', baseHue: 72, harmony: 'tetradic', mode: 'light' },
    { id: 'duotonos_soft', label: 'Duotonos Soft', baseHue: 202, harmony: 'duotone', mode: 'light' },
    { id: 'duotonos_dark', label: 'Duotonos Dark', baseHue: 248, harmony: 'duotone', mode: 'dark' },
    { id: 'monocromos_piedra', label: 'Monocromos Piedra', baseHue: 216, harmony: 'monochrome', mode: 'mixed' },
    { id: 'monocromos_color', label: 'Monocromos Color', baseHue: 338, harmony: 'monochrome', mode: 'mixed' }
  ];

  const MODE_DEFAULTS = {
    light: {
      mode: 'light',
      headerColor: '#3f4d98',
      headerTextColor: '#ffffff',
      bodyColor: '#f8fafc',
      textColor: '#111827',
      fontSize: 14,
      surfaceRadius: 12,
      tableLineWidth: 1
    },
    dark: {
      mode: 'dark',
      headerColor: '#1f2937',
      headerTextColor: '#f8fafc',
      bodyColor: '#0b1220',
      textColor: '#e5e7eb',
      fontSize: 14,
      surfaceRadius: 12,
      tableLineWidth: 1
    }
  };

  const ALERT_PRESETS = {
    warning_yellow: {
      label: 'Alerta Amarilla',
      bg: '#facc15',
      text: '#111111',
      border: '#111111',
      accent: '#92400e'
    },
    info_blue: {
      label: 'Informativa Azul',
      bg: '#dbeafe',
      text: '#1e3a8a',
      border: '#3b82f6',
      accent: '#1d4ed8'
    },
    success_green: {
      label: 'Exito Verde',
      bg: '#dcfce7',
      text: '#14532d',
      border: '#22c55e',
      accent: '#15803d'
    },
    danger_red: {
      label: 'Peligro Rojo',
      bg: '#fee2e2',
      text: '#7f1d1d',
      border: '#ef4444',
      accent: '#b91c1c'
    },
    neutral_slate: {
      label: 'Neutro Gris',
      bg: '#e2e8f0',
      text: '#0f172a',
      border: '#64748b',
      accent: '#334155'
    },
    dark_contrast: {
      label: 'Contraste Oscuro',
      bg: '#111827',
      text: '#f9fafb',
      border: '#e5e7eb',
      accent: '#93c5fd'
    }
  };

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function isValidHexColor(value) {
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(value || '').trim());
  }

  function normalizeHexColor(value) {
    const v = String(value || '').trim();
    if (!isValidHexColor(v)) return '';
    if (v.length === 4) {
      return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toLowerCase();
    }
    return v.toLowerCase();
  }

  function isDarkColor(value) {
    const hex = normalizeHexColor(value);
    if (!hex) return false;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    // Luminancia aproximada (0..255): menor => mas oscuro
    const luma = (0.299 * r) + (0.587 * g) + (0.114 * b);
    return luma < 170;
  }

  function toLinearLuminance(value) {
    const hex = normalizeHexColor(value);
    if (!hex) return null;
    const chan = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? (s / 12.92) : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (0.2126 * chan(r)) + (0.7152 * chan(g)) + (0.0722 * chan(b));
  }

  function contrastRatio(a, b) {
    const la = toLinearLuminance(a);
    const lb = toLinearLuminance(b);
    if (la == null || lb == null) return 1;
    const light = Math.max(la, lb);
    const dark = Math.min(la, lb);
    return (light + 0.05) / (dark + 0.05);
  }

  function pickReadableColor(background, preferred) {
    const bg = normalizeHexColor(background);
    const pref = normalizeHexColor(preferred);
    const candidates = [pref, '#111827', '#0f172a', '#f8fafc', '#ffffff'].filter(Boolean);
    let best = candidates[0] || '#111827';
    let bestScore = contrastRatio(best, bg);
    candidates.forEach((c) => {
      const score = contrastRatio(c, bg);
      if (score > bestScore) {
        best = c;
        bestScore = score;
      }
    });
    return best;
  }

  function wrapHue(value) {
    const hue = Number(value) || 0;
    return ((hue % 360) + 360) % 360;
  }

  function hslToHex(h, s, l) {
    const hue = wrapHue(h) / 360;
    const sat = clamp(Number(s) || 0, 0, 100) / 100;
    const lig = clamp(Number(l) || 0, 0, 100) / 100;
    if (sat === 0) {
      const v = Math.round(lig * 255).toString(16).padStart(2, '0');
      return `#${v}${v}${v}`;
    }
    const hueToRgb = (p, q, t) => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    const q = lig < 0.5 ? lig * (1 + sat) : lig + sat - (lig * sat);
    const p = (2 * lig) - q;
    const r = Math.round(hueToRgb(p, q, hue + (1 / 3)) * 255).toString(16).padStart(2, '0');
    const g = Math.round(hueToRgb(p, q, hue) * 255).toString(16).padStart(2, '0');
    const b = Math.round(hueToRgb(p, q, hue - (1 / 3)) * 255).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  function mixHexColors(a, b, weight = 0.5) {
    const colorA = normalizeHexColor(a) || '#000000';
    const colorB = normalizeHexColor(b) || '#ffffff';
    const w = clamp(Number(weight) || 0, 0, 1);
    const read = (hex, start) => parseInt(hex.slice(start, start + 2), 16);
    const mixChannel = (start) => {
      const value = Math.round((read(colorA, start) * (1 - w)) + (read(colorB, start) * w));
      return value.toString(16).padStart(2, '0');
    };
    return `#${mixChannel(1)}${mixChannel(3)}${mixChannel(5)}`;
  }

  function getHarmonyHueSet(baseHue, harmony, index = 0) {
    const base = wrapHue(baseHue + (index * 9));
    switch (harmony) {
      case 'complementary':
        return [base, wrapHue(base + 180), wrapHue(base + 22)];
      case 'analogous':
        return [base, wrapHue(base + 28), wrapHue(base - 24)];
      case 'triadic':
        return [base, wrapHue(base + 120), wrapHue(base + 240)];
      case 'splitComplementary':
        return [base, wrapHue(base + 150), wrapHue(base + 210)];
      case 'tetradic':
        return [base, wrapHue(base + 90), wrapHue(base + 180)];
      case 'duotone':
        return [base, wrapHue(base + 36), wrapHue(base + 190)];
      case 'monochrome':
        return [base, base, base];
      default:
        return [base, wrapHue(base + 35), wrapHue(base + 210)];
    }
  }

  function buildGeneratedPreset(definition, index = 0) {
    const [primaryHue, secondaryHue, accentHue] = getHarmonyHueSet(definition.baseHue, definition.harmony, index);
    const mode = definition.mode === 'mixed'
      ? (index % 5 === 0 || index % 5 === 4 ? 'dark' : 'light')
      : definition.mode;
    const isDark = mode === 'dark';
    const headerColor = isDark
      ? hslToHex(primaryHue, 52 + (index % 3) * 7, 18 + (index % 4) * 3)
      : hslToHex(primaryHue, 64 + (index % 4) * 5, 34 + (index % 5) * 3);
    const bodyColor = isDark
      ? hslToHex(secondaryHue, 28 + (index % 4) * 4, 8 + (index % 4) * 2)
      : hslToHex(secondaryHue, 38 + (index % 4) * 4, 95 - (index % 4) * 2);
    const textPreferred = isDark
      ? hslToHex(accentHue, 40, 94)
      : hslToHex(primaryHue, 28 + (index % 3) * 2, 12 + (index % 3) * 2);
    const headerTextColor = pickReadableColor(headerColor, isDark ? '#f8fafc' : '#ffffff');
    const textColor = pickReadableColor(bodyColor, textPreferred);
    return {
      label: `${definition.label} ${String(index + 1).padStart(2, '0')}`,
      category: definition.id,
      mode,
      headerColor,
      headerTextColor,
      bodyColor,
      textColor
    };
  }

  function buildThemePresetCatalog() {
    const dedupe = new Set();
    const presets = {};
    Object.entries(BASE_PRESET_THEMES).forEach(([id, preset]) => {
      presets[id] = { ...preset };
      dedupe.add([
        normalizeHexColor(preset.headerColor),
        normalizeHexColor(preset.bodyColor),
        normalizeHexColor(preset.textColor),
        String(preset.mode || '')
      ].join('|'));
    });

    THEME_PRESET_CATEGORIES.forEach((category, categoryIndex) => {
      const existingInCategory = Object.keys(presets).filter((id) => presets[id]?.category === category.id).length;
      const startIndex = existingInCategory;
      const needed = Math.max(0, 20 - existingInCategory);
      for (let i = 0; i < needed; i += 1) {
          let guard = 0;
          let candidate = null;
          do {
            candidate = buildGeneratedPreset({
              ...category,
              baseHue: wrapHue(category.baseHue + (guard * 7) + categoryIndex)
            }, startIndex + i + (guard * 2));
            guard += 1;
          } while (
            dedupe.has([
              normalizeHexColor(candidate.headerColor),
              normalizeHexColor(candidate.bodyColor),
              normalizeHexColor(candidate.textColor),
              String(candidate.mode || '')
            ].join('|'))
            && guard < 24
          );

          const id = `${category.id}_${String(startIndex + i + 1).padStart(2, '0')}`;
          presets[id] = candidate;
          dedupe.add([
            normalizeHexColor(candidate.headerColor),
            normalizeHexColor(candidate.bodyColor),
            normalizeHexColor(candidate.textColor),
            String(candidate.mode || '')
          ].join('|'));
        }
    });

    const categories = THEME_PRESET_CATEGORIES.map((category) => {
      const count = Object.values(presets).filter((preset) => preset.category === category.id).length;
      return { ...category, count };
    });

    return { presets, categories };
  }

  const THEME_PRESET_CATALOG = buildThemePresetCatalog();
  const PRESET_THEMES = THEME_PRESET_CATALOG.presets;
  const THEME_PRESET_CATEGORY_OPTIONS = THEME_PRESET_CATALOG.categories;

  function getThemePresetEntries(categoryId = 'all') {
    const activeCategory = String(categoryId || 'all').trim() || 'all';
    const categoryIndex = new Map(THEME_PRESET_CATEGORY_OPTIONS.map((category, index) => [category.id, index]));
    return Object.entries(PRESET_THEMES)
      .filter(([, preset]) => activeCategory === 'all' || String(preset?.category || 'esenciales') === activeCategory)
      .sort((a, b) => {
        const categoryA = categoryIndex.get(String(a[1]?.category || 'esenciales')) ?? 999;
        const categoryB = categoryIndex.get(String(b[1]?.category || 'esenciales')) ?? 999;
        if (categoryA !== categoryB) return categoryA - categoryB;
        return String(a[1]?.label || '').localeCompare(String(b[1]?.label || ''), 'es');
      });
  }

  function getThemePresetCategoryMeta(categoryId = '') {
    const id = String(categoryId || '').trim();
    return THEME_PRESET_CATEGORY_OPTIONS.find((category) => category.id === id) || null;
  }

  function deriveFormTheme(settings = {}) {
    const background = normalizeHexColor(settings.bodyColor) || '#f8fafc';
    const text = normalizeHexColor(settings.textColor) || '#111827';
    const header = normalizeHexColor(settings.headerColor) || '#3f4d98';
    const dark = settings.mode === 'dark' || isDarkColor(background);
    const surface = dark
      ? mixHexColors(background, '#ffffff', 0.08)
      : mixHexColors(background, '#ffffff', 0.34);
    const border = dark
      ? mixHexColors(header, '#cbd5e1', 0.42)
      : mixHexColors(header, '#94a3b8', 0.54);
    const focus = mixHexColors(header, dark ? '#93c5fd' : '#1d4ed8', dark ? 0.38 : 0.28);
    const placeholder = dark
      ? mixHexColors(text, '#cbd5e1', 0.42)
      : mixHexColors(text, '#94a3b8', 0.48);
    return {
      bg: surface,
      text: pickReadableColor(surface, text),
      border,
      focus,
      placeholder
    };
  }

  function deriveTableTheme(settings = {}) {
    const background = normalizeHexColor(settings.bodyColor) || '#f8fafc';
    const text = normalizeHexColor(settings.textColor) || '#111827';
    const header = normalizeHexColor(settings.headerColor) || '#3f4d98';
    return {
      surface: mixHexColors(background, '#ffffff', 0.04),
      head: mixHexColors(background, header, 0.18),
      border: mixHexColors(header, '#cbd5e1', 0.72),
      stripe: mixHexColors(background, header, 0.08),
      hover: mixHexColors(background, header, 0.14),
      text: pickReadableColor(background, text)
    };
  }

  function getPresetTheme(presetId) {
    return PRESET_THEMES[presetId] || null;
  }

  function getAlertPreset(alertPresetId) {
    return ALERT_PRESETS[alertPresetId] || ALERT_PRESETS[DEFAULT_ALERT_PRESET_ID];
  }

  function normalizeSettings(partial) {
    const raw = partial && typeof partial === 'object' ? partial : {};
    const preset = getPresetTheme(raw.preset) ? raw.preset : '';
    const presetTheme = preset ? getPresetTheme(preset) : null;
    const mode = raw.mode === 'dark' || raw.mode === 'light'
      ? raw.mode
      : (presetTheme ? presetTheme.mode : 'light');
    const defaults = presetTheme || MODE_DEFAULTS[mode];

    const fontSizeValue = Number(raw.fontSize);
    const surfaceRadiusValue = Number(raw.surfaceRadius);
    const tableLineWidthValue = Number(raw.tableLineWidth);
    let textColor = isValidHexColor(raw.textColor) ? raw.textColor : defaults.textColor;
    if (mode === 'dark' && isDarkColor(textColor)) {
      // En modo oscuro, evitar textos oscuros para mantener contraste.
      textColor = MODE_DEFAULTS.dark.textColor;
    }
    const alertPreset = ALERT_PRESETS[raw.alertPreset] ? raw.alertPreset : DEFAULT_ALERT_PRESET_ID;
    const alertPresetTheme = getAlertPreset(alertPreset);

    return {
      preset,
      mode,
      headerColor: isValidHexColor(raw.headerColor) ? raw.headerColor : defaults.headerColor,
      headerTextColor: isValidHexColor(raw.headerTextColor) ? raw.headerTextColor : defaults.headerTextColor,
      bodyColor: isValidHexColor(raw.bodyColor) ? raw.bodyColor : defaults.bodyColor,
      textColor,
      fontSize: Number.isFinite(fontSizeValue) ? clamp(Math.round(fontSizeValue), 12, 22) : defaults.fontSize,
      surfaceRadius: Number.isFinite(surfaceRadiusValue) ? clamp(Math.round(surfaceRadiusValue), 0, 28) : (defaults.surfaceRadius ?? 12),
      tableLineWidth: Number.isFinite(tableLineWidthValue) ? clamp(Math.round(tableLineWidthValue), 0, 5) : (defaults.tableLineWidth ?? 1),
      alertPreset,
      alertBg: isValidHexColor(raw.alertBg) ? raw.alertBg : alertPresetTheme.bg,
      alertText: isValidHexColor(raw.alertText) ? raw.alertText : alertPresetTheme.text,
      alertBorder: isValidHexColor(raw.alertBorder) ? raw.alertBorder : alertPresetTheme.border,
      alertAccent: isValidHexColor(raw.alertAccent) ? raw.alertAccent : alertPresetTheme.accent,
      charlyVoiceName: String(raw.charlyVoiceName || DEFAULT_CHARLY_VOICE_NAME).trim() || DEFAULT_CHARLY_VOICE_NAME,
      charlyVoicePreset: CHARLY_VOICE_PRESETS[raw.charlyVoicePreset] ? raw.charlyVoicePreset : DEFAULT_CHARLY_VOICE_PRESET,
      charlyVoiceSpeed: Number.isFinite(Number(raw.charlyVoiceSpeed))
        ? clamp(Number(raw.charlyVoiceSpeed), 0.75, 1.35)
        : DEFAULT_CHARLY_VOICE_SPEED,
      charlyVoicePitch: Number.isFinite(Number(raw.charlyVoicePitch))
        ? clamp(Number(raw.charlyVoicePitch), 0.75, 1.2)
        : DEFAULT_CHARLY_VOICE_PITCH,
      charlyVoiceMood: String(raw.charlyVoiceMood || DEFAULT_CHARLY_VOICE_MOOD).trim() || DEFAULT_CHARLY_VOICE_MOOD,
      charlyVoiceLocale: CHARLY_LOCALE_OPTIONS.some((it) => it.value === raw.charlyVoiceLocale)
        ? raw.charlyVoiceLocale
        : DEFAULT_CHARLY_VOICE_LOCALE,
      lecturaUseCharlyVoice: raw.lecturaUseCharlyVoice === true,
      lecturaVoiceName: String(raw.lecturaVoiceName || DEFAULT_LECTURA_VOICE_NAME).trim() || DEFAULT_LECTURA_VOICE_NAME,
      lecturaVoiceSpeed: Number.isFinite(Number(raw.lecturaVoiceSpeed))
        ? clamp(Number(raw.lecturaVoiceSpeed), 0.75, 1.35)
        : DEFAULT_LECTURA_VOICE_SPEED,
      lecturaVoicePitch: Number.isFinite(Number(raw.lecturaVoicePitch))
        ? clamp(Number(raw.lecturaVoicePitch), 0.75, 1.2)
        : DEFAULT_LECTURA_VOICE_PITCH,
      lecturaVoiceMood: String(raw.lecturaVoiceMood || DEFAULT_LECTURA_VOICE_MOOD).trim() || DEFAULT_LECTURA_VOICE_MOOD,
      lecturaVoiceLocale: CHARLY_LOCALE_OPTIONS.some((it) => it.value === raw.lecturaVoiceLocale)
        ? raw.lecturaVoiceLocale
        : DEFAULT_LECTURA_VOICE_LOCALE
    };
  }

  function applyPresetToSettings(currentSettings, presetId) {
    const preset = getPresetTheme(presetId);
    if (!preset) return { ...currentSettings, preset: '' };
    return {
      ...currentSettings,
      preset: presetId,
      mode: preset.mode,
      headerColor: preset.headerColor,
      headerTextColor: preset.headerTextColor,
      bodyColor: preset.bodyColor,
      textColor: preset.textColor
    };
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return normalizeSettings(MODE_DEFAULTS.light);
      return normalizeSettings(JSON.parse(raw));
    } catch (_) {
      return normalizeSettings(MODE_DEFAULTS.light);
    }
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      window.dispatchEvent(new CustomEvent('cb-theme-settings-updated', { detail: settings }));
    } catch (_) {
      // Ignore storage errors.
    }
  }

  function normalizeVoiceCommandMeta(meta) {
    const raw = meta && typeof meta === 'object' ? meta : {};
    const customFunctions = Array.isArray(raw.customFunctions)
      ? raw.customFunctions
        .map((fn) => ({
          id: String(fn?.id || '').trim(),
          label: String(fn?.label || '').trim(),
          baseFn: String(fn?.baseFn || '').trim()
        }))
        .filter((fn) => fn.id && fn.label && VOICE_FN_BASE_VALUES.has(fn.baseFn))
      : [];
    const nextActionPresets = Array.isArray(raw.nextActionPresets)
      ? raw.nextActionPresets
        .map((item) => ({
          group: String(item?.group || '').trim() || 'General',
          label: String(item?.label || '').trim(),
          value: String(item?.value || '').trim()
        }))
        .filter((item) => item.label)
      : DEFAULT_NEXT_ACTION_PRESETS.map((item) => ({ ...item }));
    const nextStepColumns = clamp(
      Number(raw.nextStepColumns || NEXT_STEP_COLUMNS_DEFAULT),
      NEXT_STEP_COLUMNS_MIN,
      NEXT_STEP_COLUMNS_MAX
    );
    return {
      agentEnabled: raw.agentEnabled === true,
      customFunctions,
      nextActionPresets,
      nextStepColumns
    };
  }

  function normalizeVoiceCommandPayload(payload) {
    const raw = payload && typeof payload === 'object' ? payload : {};
    const sanitizeCommands = (commands) => {
      const source = { ...(commands && typeof commands === 'object' ? commands : {}) };
      const out = {};
      Object.entries(source).forEach(([key, row]) => {
        if (String(key || '').trim().toLowerCase().startsWith('wf_')) return;
        if (!row || typeof row !== 'object') {
          out[key] = row;
          return;
        }
        const fn = String(row.fn || '').trim();
        if (
          fn === '_wfBuscarLecturaIniciar'
          || fn === '_wfBuscarLecturaIdentificarColeccion'
          || fn === '_wfBuscarLecturaConfirmarLectura'
          || fn === '_wfBuscarLecturaDecidirAccion'
          || fn === '_wfBuscarLecturaCerrarFlujo'
        ) return;
        const cleanRow = { ...row };
        delete cleanRow.next_step_1;
        delete cleanRow.next_step_2;
        delete cleanRow.next_step_3;
        delete cleanRow.next_step_4;
        delete cleanRow.next_step_5;
        delete cleanRow.workflow_graph;
        if (typeof cleanRow.next === 'string' && /cmd:wf_/i.test(cleanRow.next)) {
          cleanRow.next = '';
        }
        out[key] = cleanRow;
      });
      return out;
    };
    const hasMeta = Object.prototype.hasOwnProperty.call(raw, 'meta');
    const hasCommands = Object.prototype.hasOwnProperty.call(raw, 'commands');
    if (hasMeta || hasCommands) {
      return {
        meta: normalizeVoiceCommandMeta(raw.meta),
        commands: sanitizeCommands(raw.commands)
      };
    }
    return {
      meta: normalizeVoiceCommandMeta({}),
      commands: sanitizeCommands(raw)
    };
  }

  function loadVoiceCommandSettings() {
    if (!COMMAND_SETTINGS_ENABLED) return normalizeVoiceCommandPayload({});
    try {
      const raw = localStorage.getItem(VOICE_COMMANDS_STORAGE_KEY);
      if (!raw) return normalizeVoiceCommandPayload({});
      return normalizeVoiceCommandPayload(JSON.parse(raw));
    } catch (_) {
      return normalizeVoiceCommandPayload({});
    }
  }

  function saveVoiceCommandSettings(payload) {
    if (!COMMAND_SETTINGS_ENABLED) {
      try { localStorage.removeItem(VOICE_COMMANDS_STORAGE_KEY); } catch (_) {}
      return;
    }
    try {
      const normalized = normalizeVoiceCommandPayload(payload);
      localStorage.setItem(VOICE_COMMANDS_STORAGE_KEY, JSON.stringify(normalized));
      window.dispatchEvent(new CustomEvent('cb-voice-commands-updated', { detail: normalized }));
    } catch (_) {
      // noop
    }
  }

  function loadVoiceCommandDefaultSettings() {
    try {
      const raw = localStorage.getItem(VOICE_COMMANDS_DEFAULTS_STORAGE_KEY);
      if (!raw) return null;
      return normalizeVoiceCommandPayload(JSON.parse(raw));
    } catch (_) {
      return null;
    }
  }

  function saveVoiceCommandDefaultSettings(payload) {
    try {
      const normalized = normalizeVoiceCommandPayload(payload);
      const cleanCommands = Object.fromEntries(
        Object.entries(normalized?.commands || {})
          .filter(([, row]) => !(row && typeof row === 'object' && row.deleted === true))
      );
      localStorage.setItem(VOICE_COMMANDS_DEFAULTS_STORAGE_KEY, JSON.stringify({
        ...normalized,
        commands: cleanCommands
      }));
    } catch (_) {
      // noop
    }
  }

  function ensureVoiceCommandDefaultsSeeded() {
    if (!COMMAND_SETTINGS_ENABLED) return;
    const defaults = loadVoiceCommandDefaultSettings();
    if (defaults && Object.keys(defaults.commands || {}).length > 0) return;
    saveVoiceCommandDefaultSettings(buildFactoryVoiceCommandPayload());
  }

  function buildFactoryVoiceCommandPayload() {
    const commands = {};
    VOICE_COMMAND_CATALOG.forEach((cmd) => {
      const key = String(cmd?.key || '').trim();
      if (!key) return;
      commands[key] = {
        section: String(cmd?.section || '').trim() || 'General',
        fn: String(cmd?.fn || '').trim() || '_clickButtonById',
        target: String(cmd?.target || '').trim(),
        name: String(cmd?.name || key).trim() || key,
        regex: String(cmd?.defaultRegex || '').trim(),
        speak: cmd?.speak === true,
        next: String(cmd?.next || '').trim(),
        enabled: true,
        deleted: false
      };
    });
    return normalizeVoiceCommandPayload({ meta: normalizeVoiceCommandMeta({}), commands });
  }

  function forceVoiceCommandsFactoryResetOnce() {
    if (!COMMAND_SETTINGS_ENABLED) return;
    try {
      if (localStorage.getItem(VOICE_COMMANDS_FACTORY_RESET_ONCE_KEY) === '1') return;
      const factory = buildFactoryVoiceCommandPayload();
      saveVoiceCommandDefaultSettings(factory);
      saveVoiceCommandSettings(factory);
      localStorage.setItem(VOICE_COMMANDS_FACTORY_RESET_ONCE_KEY, '1');
    } catch (_) {
      // noop
    }
  }

  function forceSyncResourceRegexFromSystemOnce() {
    if (!COMMAND_SETTINGS_ENABLED) return;
    try {
      if (localStorage.getItem(VOICE_COMMANDS_RESOURCE_REGEX_SYNC_KEY) === '1') return;
      const keys = ['seq_recortables', 'seq_fichas', 'seq_anexos', 'seq_videos'];
      const catalogMap = getVoiceCommandCatalogMap();
      const syncPayload = (payloadRaw) => {
        const payload = normalizeVoiceCommandPayload(payloadRaw || {});
        const commands = { ...(payload.commands || {}) };
        keys.forEach((key) => {
          const base = catalogMap?.[key];
          if (!base) return;
          const prev = (commands[key] && typeof commands[key] === 'object') ? commands[key] : {};
          commands[key] = {
            ...prev,
            section: String(base.section || prev.section || 'Tabla Secuencia'),
            fn: String(base.fn || prev.fn || '_setTablaSecuenciaCheckboxByVoice'),
            target: String(base.target || prev.target || ''),
            name: String(base.name || prev.name || key),
            regex: String(base.defaultRegex || ''),
            enabled: true,
            deleted: false
          };
        });
        return normalizeVoiceCommandPayload({ ...payload, commands });
      };

      const current = loadVoiceCommandSettings();
      const currentSynced = syncPayload(current);
      saveVoiceCommandSettings(currentSynced);

      const defaults = loadVoiceCommandDefaultSettings() || buildFactoryVoiceCommandPayload();
      const defaultsSynced = syncPayload(defaults);
      saveVoiceCommandDefaultSettings(defaultsSynced);

      localStorage.setItem(VOICE_COMMANDS_RESOURCE_REGEX_SYNC_KEY, '1');
    } catch (_) {
      // noop
    }
  }

  function forceSyncLecturaActionRegexFromSystemOnce() {
    if (!COMMAND_SETTINGS_ENABLED) return;
    try {
      if (localStorage.getItem(VOICE_COMMANDS_LECTURA_ACTIONS_SYNC_KEY) === '1') return;
      const keys = [
        'buscar_lecturas_charly',
        'leer_lectura_charly',
        'ver_lectura_charly',
        'editar_lectura_charly',
        'exportar_word_lectura_charly'
      ];
      const catalogMap = getVoiceCommandCatalogMap();
      const syncPayload = (payloadRaw) => {
        const payload = normalizeVoiceCommandPayload(payloadRaw || {});
        const commands = { ...(payload.commands || {}) };
        keys.forEach((key) => {
          const base = catalogMap?.[key];
          if (!base) return;
          const prev = (commands[key] && typeof commands[key] === 'object') ? commands[key] : {};
          commands[key] = {
            ...prev,
            section: String(base.section || prev.section || 'Lecturas'),
            fn: String(base.fn || prev.fn || '_buscarLecturaPorVoz'),
            target: String(base.target || prev.target || 'lecturas'),
            name: String(base.name || prev.name || key),
            regex: String(base.defaultRegex || ''),
            speak: base.speak === true ? true : !!prev.speak,
            enabled: true,
            deleted: false
          };
        });
        return normalizeVoiceCommandPayload({ ...payload, commands });
      };

      const current = loadVoiceCommandSettings();
      saveVoiceCommandSettings(syncPayload(current));

      const defaults = loadVoiceCommandDefaultSettings() || buildFactoryVoiceCommandPayload();
      saveVoiceCommandDefaultSettings(syncPayload(defaults));

      localStorage.setItem(VOICE_COMMANDS_LECTURA_ACTIONS_SYNC_KEY, '1');
    } catch (_) {
      // noop
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttrValue(value = '') {
    return String(value == null ? '' : value).replace(/"/g, '&quot;');
  }

  let cytoscapeLoadPromise = null;
  let cytoscapeWorkflowExtensionsPromise = null;
  function loadExternalScript(url = '') {
    return new Promise((resolve, reject) => {
      const src = String(url || '').trim();
      if (!src) {
        reject(new Error('URL vacía para script externo'));
        return;
      }
      const existing = document.querySelector(`script[src="${escapeAttrValue(src)}"]`);
      if (existing && existing.dataset.loaded === '1') {
        resolve();
        return;
      }
      if (existing) {
        existing.addEventListener('load', () => {
          existing.dataset.loaded = '1';
          resolve();
        }, { once: true });
        existing.addEventListener('error', () => reject(new Error(`Error cargando script: ${src}`)), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.addEventListener('load', () => {
        script.dataset.loaded = '1';
        resolve();
      }, { once: true });
      script.addEventListener('error', () => reject(new Error(`Error cargando script: ${src}`)), { once: true });
      document.head.appendChild(script);
    });
  }

  async function ensureCytoscapeLoaded() {
    if (window.cytoscape) return window.cytoscape;
    if (!cytoscapeLoadPromise) {
      cytoscapeLoadPromise = (async () => {
        let lastErr = null;
        for (const url of CYTOSCAPE_CDN_URLS) {
          try {
            await loadExternalScript(url);
            if (window.cytoscape) return window.cytoscape;
          } catch (err) {
            lastErr = err;
          }
        }
        throw lastErr || new Error('No se pudo cargar Cytoscape.');
      })();
    }
    return cytoscapeLoadPromise;
  }

  function isCytoscapeExtensionRegistered(type = '', name = '') {
    try {
      if (!window.cytoscape || !type || !name) return false;
      return typeof window.cytoscape(type, name) === 'function';
    } catch (_) {
      return false;
    }
  }

  async function loadOneFromList(urls = []) {
    let lastErr = null;
    for (const url of urls) {
      try {
        await loadExternalScript(url);
        return true;
      } catch (err) {
        lastErr = err;
      }
    }
    if (lastErr) throw lastErr;
    return false;
  }

  function removeExternalScriptBySrc(url = '') {
    const src = String(url || '').trim();
    if (!src) return;
    const selector = `script[src="${escapeAttrValue(src)}"]`;
    const scripts = Array.from(document.querySelectorAll(selector));
    scripts.forEach((script) => script.remove());
  }

  async function reloadOneFromList(urls = []) {
    let lastErr = null;
    for (const url of urls) {
      try {
        removeExternalScriptBySrc(url);
        await loadExternalScript(url);
        return true;
      } catch (err) {
        lastErr = err;
      }
    }
    if (lastErr) throw lastErr;
    return false;
  }

  async function ensureCytoscapeWorkflowExtensionsLoaded() {
    await ensureCytoscapeLoaded();
    if (!cytoscapeWorkflowExtensionsPromise) {
      cytoscapeWorkflowExtensionsPromise = (async () => {
        const result = {
          edgehandles: isCytoscapeExtensionRegistered('core', 'edgehandles'),
          dagre: isCytoscapeExtensionRegistered('layout', 'dagre'),
          warnings: []
        };
        if (!result.edgehandles) {
          try {
            const hasLodashMemoize = typeof window._?.memoize === 'function';
            const hasLodashThrottle = typeof window._?.throttle === 'function';
            if (!hasLodashMemoize || !hasLodashThrottle) {
              await loadOneFromList(LODASH_CDN_URLS);
            }
            await loadOneFromList(CYTOSCAPE_EDGEHANDLES_CDN_URLS);
            // Si hubo un intento previo fallido (p.ej. sin lodash), forzar recarga del plugin.
            if (!isCytoscapeExtensionRegistered('core', 'edgehandles')) {
              await reloadOneFromList(CYTOSCAPE_EDGEHANDLES_CDN_URLS);
            }
          } catch (err) {
            result.warnings.push(`edgehandles: ${err?.message || 'sin detalle'}`);
          }
          result.edgehandles = isCytoscapeExtensionRegistered('core', 'edgehandles');
        }
        if (!result.dagre) {
          try {
            if (typeof window.dagre !== 'object' && typeof window.dagre !== 'function') {
              await loadOneFromList(DAGRE_CDN_URLS);
            }
            await loadOneFromList(CYTOSCAPE_DAGRE_CDN_URLS);
          } catch (err) {
            result.warnings.push(`dagre: ${err?.message || 'sin detalle'}`);
          }
          result.dagre = isCytoscapeExtensionRegistered('layout', 'dagre');
        }
        return result;
      })();
    }
    return cytoscapeWorkflowExtensionsPromise;
  }

  function getVoiceCommandCatalogMap() {
    const out = {};
    VOICE_COMMAND_CATALOG.forEach((cmd) => {
      out[cmd.key] = cmd;
    });
    return out;
  }

  function renderVoiceFunctionOptionsHtml(meta = {}, selectedValue = '', includeCustom = true) {
    const selected = String(selectedValue || '').trim();
    const baseGroups = VOICE_COMMAND_FN_GROUPS.map((group) => {
      const options = (Array.isArray(group.options) ? group.options : [])
        .map((opt) => `<option value="${escapeHtml(opt.value)}" ${opt.value === selected ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`)
        .join('');
      if (!options) return '';
      return `<optgroup label="${escapeHtml(group.label)}">${options}</optgroup>`;
    }).join('');

    if (!includeCustom) return baseGroups;
    const custom = Array.isArray(meta?.customFunctions) ? meta.customFunctions : [];
    const customOptions = custom
      .filter((fn) => fn?.id && fn?.label && VOICE_FN_BASE_VALUES.has(fn.baseFn))
      .map((fn) => {
        const value = `custom:${fn.id}`;
        return `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(fn.label)} (Personalizada)</option>`;
      })
      .join('');
    if (!customOptions) return baseGroups;
    return `${baseGroups}<optgroup label="Personalizadas">${customOptions}</optgroup>`;
  }

  function getNextActionPresets(meta = {}, commandMap = {}) {
    const dynamic = [];
    const seenDynamic = new Set();
    const pushDynamic = (group, label, value) => {
      const v = String(value || '').trim();
      const l = String(label || '').trim();
      if (!v || !l || seenDynamic.has(v)) return;
      seenDynamic.add(v);
      dynamic.push({ group: String(group || 'Comandos').trim() || 'Comandos', label: l, value: v });
    };

    const current = commandMap && typeof commandMap === 'object' ? commandMap : {};
    Object.entries(current).forEach(([key, row]) => {
      if (!key || !row || typeof row !== 'object' || row.deleted === true) return;
      const label = String(row?.name || key).trim();
      const group = String(row?.section || 'Comandos').trim() || 'Comandos';
      pushDynamic(group, label, `cmd:${key}`);
    });
    VOICE_COMMAND_CATALOG.forEach((cmd) => {
      const key = String(cmd?.key || '').trim();
      if (!key) return;
      const row = current[key];
      if (row && row.deleted === true) return;
      pushDynamic(String(cmd?.section || 'Comandos').trim() || 'Comandos', String(cmd?.name || key).trim() || key, `cmd:${key}`);
    });

    const items = Array.isArray(meta?.nextActionPresets) ? meta.nextActionPresets : [];
    const base = (items.length ? items : DEFAULT_NEXT_ACTION_PRESETS)
      .map((item) => ({
        group: String(item?.group || '').trim() || 'General',
        label: String(item?.label || '').trim(),
        value: String(item?.value || '').trim()
      }))
      .filter((item) => item.label);
    const merged = [...base];
    const seen = new Set(merged.map((it) => String(it?.value || '').trim()).filter(Boolean));
    dynamic.forEach((it) => {
      const v = String(it?.value || '').trim();
      if (!v || seen.has(v)) return;
      seen.add(v);
      merged.push(it);
    });
    return merged;
  }

  function renderNextPresetOptionsHtml(meta = {}, selectedValue = '', commandMap = {}) {
    const selected = String(selectedValue || '').trim();
    const presets = getNextActionPresets(meta, commandMap);
    const hasSelected = presets.some((item) => String(item?.value || '').trim() === selected);
    const byGroup = new Map();
    presets.forEach((item) => {
      const group = item.group || 'General';
      if (!byGroup.has(group)) byGroup.set(group, []);
      byGroup.get(group).push(item);
    });
    let html = '<option value="">Acciones rapidas...</option>';
    if (selected && !hasSelected) {
      html += `<option value="${escapeHtml(selected)}" selected>Actual: ${escapeHtml(selected)}</option>`;
    }
    byGroup.forEach((items, group) => {
      const opts = items
        .map((item) => `<option value="${escapeHtml(item.value)}" ${item.value === selected ? 'selected' : ''}>${escapeHtml(item.label)}</option>`)
        .join('');
      if (opts) html += `<optgroup label="${escapeHtml(group)}">${opts}</optgroup>`;
    });
    return html;
  }

  function formatNextActionPresetsText(meta = {}) {
    return getNextActionPresets(meta, {})
      .map((item) => `${item.group}|${item.label}|${item.value}`)
      .join('\n');
  }

  function parseNextActionPresetsText(text = '') {
    const lines = String(text || '').split('\n');
    const out = [];
    lines.forEach((line) => {
      const raw = String(line || '').trim();
      if (!raw || raw.startsWith('#')) return;
      const [groupPart, labelPart, ...valueRest] = raw.split('|');
      if (valueRest.length) {
        const group = String(groupPart || '').trim() || 'General';
        const label = String(labelPart || '').trim();
        const value = valueRest.join('|').trim();
        if (label) out.push({ group, label, value });
        return;
      }
      const label = String(groupPart || '').trim();
      if (label) out.push({ group: 'General', label, value: String(labelPart || '').trim() });
    });
    return out.length ? out : DEFAULT_NEXT_ACTION_PRESETS.map((item) => ({ ...item }));
  }

  function getNextStepColumns(meta = {}) {
    return clamp(
      Number(meta?.nextStepColumns || NEXT_STEP_COLUMNS_DEFAULT),
      NEXT_STEP_COLUMNS_MIN,
      NEXT_STEP_COLUMNS_MAX
    );
  }

  function parseNextChainSteps(value = '') {
    return String(value || '')
      .split('>>')
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  function resolveNextStepValues(saved = {}, cmd = {}, stepColumns = NEXT_STEP_COLUMNS_DEFAULT) {
    const total = clamp(Number(stepColumns || NEXT_STEP_COLUMNS_DEFAULT), NEXT_STEP_COLUMNS_MIN, NEXT_STEP_COLUMNS_MAX);
    const savedSteps = Array.isArray(saved?.next_steps)
      ? saved.next_steps.map((item) => String(item || '').trim())
      : [];
    const cmdSteps = Array.isArray(cmd?.next_steps)
      ? cmd.next_steps.map((item) => String(item || '').trim())
      : [];
    const savedChain = parseNextChainSteps(saved?.next);
    const cmdChain = parseNextChainSteps(cmd?.next);
    const out = [];
    const hasOwn = (obj, key) => !!(obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key));
    for (let i = 1; i <= total; i += 1) {
      const key = `next_step_${i}`;
      let value = '';
      if (hasOwn(saved, key)) {
        value = String(saved?.[key] || '').trim();
      } else if (typeof savedSteps[i - 1] !== 'undefined') {
        value = String(savedSteps[i - 1] || '').trim();
      } else if (hasOwn(cmd, key)) {
        value = String(cmd?.[key] || '').trim();
      } else if (typeof cmdSteps[i - 1] !== 'undefined') {
        value = String(cmdSteps[i - 1] || '').trim();
      } else if (typeof savedChain[i - 1] !== 'undefined') {
        value = String(savedChain[i - 1] || '').trim();
      } else if (typeof cmdChain[i - 1] !== 'undefined') {
        value = String(cmdChain[i - 1] || '').trim();
      }
      out.push(value);
    }
    return out;
  }

  function renderNextSelectCell(meta = {}, commandMap = {}, stepIndex = 1, selected = '') {
    return `
      <select class="command-next-select" data-cmd-next-step="${Number(stepIndex)}">
        ${renderNextPresetOptionsHtml(meta, selected, commandMap)}
      </select>
    `;
  }

  function renderVoiceCommandTableHeader(meta = {}) {
    const headerRow = document.getElementById('voiceCommandHeaderRow');
    if (!headerRow) return;
    headerRow.innerHTML = `
      <th>Activo</th>
      <th>Función</th>
      <th>Respuesta por voz</th>
      <th>Elemento</th>
      <th>Comando</th>
      <th>Regex</th>
      <th>Acción</th>
    `;
    const table = document.querySelector('#commandSettingsModal .command-settings-table');
    if (table) table.dataset.nextStepColumns = '0';
  }

  function buildVoiceCommandRow(cmd, saved = {}, allowDelete = false, isCustom = false, meta = {}, commandMap = {}) {
    const key = String(cmd?.key || '').trim();
    const enabled = saved.enabled !== false;
    const regex = typeof saved.regex === 'string' ? saved.regex : (cmd.defaultRegex || '');
    const fn = String(saved.fn || cmd.fn || '_clickButtonById');
    const target = String(saved.target || cmd.target || '').trim();
    const name = String(saved.name || cmd.name || '').trim();
    const fnOptions = renderVoiceFunctionOptionsHtml(meta, fn, true);
    const speak = (typeof saved.speak === 'boolean') ? saved.speak : !!cmd.speak;
    const actions = [
      '<button type="button" class="theme-btn" data-cmd-duplicate>Duplicar</button>'
    ];
    if (allowDelete) {
      actions.push('<button type="button" class="theme-btn" data-cmd-delete>Eliminar</button>');
    }
    return `
        <tr data-cmd-key="${escapeHtml(key)}" data-cmd-custom="${isCustom ? '1' : '0'}">
          <td>
            <label class="cmd-switch" title="Activo">
              <input type="checkbox" data-cmd-enabled ${enabled ? 'checked' : ''}>
              <span class="cmd-switch-track"><span class="cmd-switch-thumb"></span></span>
            </label>
          </td>
          <td><select data-cmd-fn>${fnOptions}</select></td>
          <td>
            <label class="cmd-switch" title="Respuesta por voz">
              <input type="checkbox" data-cmd-speak ${speak ? 'checked' : ''}>
              <span class="cmd-switch-track"><span class="cmd-switch-thumb"></span></span>
            </label>
          </td>
          <td>
            <input class="command-regex-input command-input-sm" type="text" data-cmd-target value="${escapeHtml(target)}" placeholder="id del botón/campo">
        </td>
        <td><input class="command-regex-input command-input-sm" type="text" data-cmd-name value="${escapeHtml(name)}" placeholder="Nombre del comando"></td>
          <td>
            <input class="command-regex-input" type="text" data-cmd-regex value="${escapeHtml(regex)}">
            <small class="command-conflict-note" data-cmd-conflict-note></small>
          </td>
          <td>
            <div class="command-row-actions">
              ${actions.join('')}
            </div>
          </td>
        </tr>
    `;
  }

  function applySettings(settings) {
    const root = document.documentElement;
    const body = document.body || document.documentElement;
    const formTheme = deriveFormTheme(settings);
    const tableTheme = deriveTableTheme(settings);
    const isVoiceMobile =
      CURRENT_PAGE === 'voicetranscribe.html' &&
      window.matchMedia('(max-width: 768px)').matches;

    root.style.setProperty('--cb-chrome-bg', settings.headerColor);
    root.style.setProperty('--cb-header-text-color', settings.headerTextColor);
    root.style.setProperty('--app-bg-color', settings.bodyColor);
    root.style.setProperty('--app-text-color', settings.textColor);
    root.style.setProperty('--cb-control-fg', pickReadableColor(settings.bodyColor, settings.textColor));
    root.style.setProperty('--app-form-bg', formTheme.bg);
    root.style.setProperty('--app-form-text', formTheme.text);
    root.style.setProperty('--app-form-border', formTheme.border);
    root.style.setProperty('--app-form-focus', formTheme.focus);
    root.style.setProperty('--app-form-placeholder', formTheme.placeholder);
    root.style.setProperty('--app-surface-radius', `${settings.surfaceRadius}px`);
    root.style.setProperty('--app-table-line-width', `${settings.tableLineWidth}px`);
    root.style.setProperty('--app-table-surface', tableTheme.surface);
    root.style.setProperty('--app-table-head-bg', tableTheme.head);
    root.style.setProperty('--app-table-border', tableTheme.border);
    root.style.setProperty('--app-table-row-alt', tableTheme.stripe);
    root.style.setProperty('--app-table-row-hover', tableTheme.hover);
    root.style.setProperty('--app-table-text', tableTheme.text);
    root.style.setProperty('--app-font-size', `${settings.fontSize}px`);
    root.style.setProperty('--app-alert-bg', settings.alertBg);
    root.style.setProperty('--app-alert-text', settings.alertText);
    root.style.setProperty('--app-alert-border', settings.alertBorder);
    root.style.setProperty('--app-alert-accent', settings.alertAccent);

    body.classList.toggle('theme-dark', settings.mode === 'dark');
    body.classList.toggle('theme-light', settings.mode !== 'dark');
    body.classList.toggle('dark', settings.mode === 'dark');
    document.documentElement.classList.toggle('dark', settings.mode === 'dark');

    // Fallback directo para paneles con estilos utilitarios muy agresivos.
    [
      'sessionFeed',
      'sessionSidebar',
      'mainToolbar',
      'sidebar2',
      'sidebarTemas',
      'panel-texto-formatos',
      'panel-chat'
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (isVoiceMobile && (id === 'sessionFeed' || id === 'sessionSidebar' || id === 'mainToolbar')) {
        el.style.backgroundColor = '';
        el.style.color = '';
        return;
      }
      el.style.backgroundColor = settings.bodyColor;
      el.style.color = settings.textColor;
    });

    const mainLayout = document.querySelector('.flex.h-screen.overflow-hidden');
    if (mainLayout) {
      if (isVoiceMobile) {
        mainLayout.style.backgroundColor = '';
        mainLayout.style.color = '';
      } else {
      mainLayout.style.backgroundColor = settings.bodyColor;
      mainLayout.style.color = settings.textColor;
      }
    }

    const voiceMain = document.querySelector('main.flex-1.flex.flex-col.h-full.relative');
    if (voiceMain) {
      if (isVoiceMobile) {
        voiceMain.style.backgroundColor = '';
        voiceMain.style.color = '';
      } else {
      voiceMain.style.backgroundColor = settings.bodyColor;
      voiceMain.style.color = settings.textColor;
      }
    }
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      :root {
        --cb-header-text-color: #ffffff;
        --app-bg-color: #f8fafc;
        --app-text-color: #111827;
        --app-form-bg: #ffffff;
        --app-form-text: #111827;
        --app-form-border: #cbd5e1;
        --app-form-focus: #3f4d98;
        --app-form-placeholder: #64748b;
        --app-surface-radius: 12px;
        --app-table-line-width: 1px;
        --app-table-surface: #fcfdff;
        --app-table-head-bg: #e8eefc;
        --app-table-border: #cbd5e1;
        --app-table-row-alt: #f5f8fd;
        --app-table-row-hover: #eaf1ff;
        --app-table-text: #111827;
        --app-font-size: 14px;
        --app-alert-bg: #facc15;
        --app-alert-text: #111111;
        --app-alert-border: #111111;
        --app-alert-accent: #92400e;
      }

      body {
        background-color: var(--app-bg-color) !important;
        color: var(--app-text-color) !important;
        font-size: var(--app-font-size) !important;
        transition: background-color 0.18s ease, color 0.18s ease;
      }

      .main-header,
      #sidebar {
        background: var(--cb-chrome-bg) !important;
        color: var(--cb-header-text-color) !important;
      }

      .main-header *,
      #menuToggle,
      #sidebar .sidebar-link,
      #sidebar .sidebar-link i,
      #sidebar .sidebar-link span {
        color: var(--cb-header-text-color) !important;
      }

      /* Superficies globales configurables */
      #panel-texto-formatos,
      #panel-chat,
      #contenidoTextoFormateado,
      #chatMensajes,
      #panel-chat .chat-header,
      #panel-chat .chat-input,
      #panel-chat .chat-mensajes,
      #sessionSidebar,
      #sessionSidebar > .p-4,
      #sessionSidebar .session-sidebar-header,
      .flex.h-screen.overflow-hidden,
      main.flex-1.flex.flex-col.h-full.relative,
      #mainToolbar,
      #mainToolbar::before,
      #mainToolbar::after,
      #mainToolbar #mainToolbarMenu,
      #sessionFeed,
      #sidebar2,
      #sidebarTemas,
      #sidebarTemas #cursoSeleccionadoNombre,
      main.bg-background,
      main.flex-1.bg-background,
      #contenidoEditor,
      .content-card {
        background-color: var(--app-bg-color) !important;
        color: var(--app-text-color) !important;
      }

      #sessionFeed [class*="bg-slate-"],
      #sessionSidebar [class*="bg-slate-"],
      #mainToolbar [class*="bg-slate-"],
      #mainToolbar [class~="bg-white"],
      #mainToolbar [class*="text-slate-"],
      #sidebarTemas [class*="bg-card"],
      #sidebarTemas [class*="bg-accent"],
      #sidebarTemas [class*="text-foreground"],
      #sidebarTemas [class*="text-muted-foreground"],
      main.bg-background [class*="bg-card"],
      main.bg-background [class*="bg-background"],
      main.bg-background [class*="text-foreground"],
      main.bg-background [class*="text-muted-foreground"],
      #panel-chat [class*="text-"],
      #panel-texto-formatos [class*="text-"] {
        color: var(--app-text-color) !important;
      }

      :where(
        main,
        #sessionSidebar,
        #sessionFeed,
        #sidebar2,
        #sidebarTemas,
        #panel-chat,
        #panel-texto-formatos,
        #panel-izquierdo,
        .panel-analisis,
        .panel-medio,
        .panel-derecho,
        #contenidoEditor,
        .main-content,
        .container,
        .container-fluid
      ) :where(h1, h2, h3, h4, h5, h6, span, p, label, li, td, th) {
        color: var(--app-text-color) !important;
      }

      /* Uniformidad de iconos en paginas con tema dinamico */
      :where(
        main,
        #sessionSidebar,
        #sessionFeed,
        #sidebar2,
        #sidebarTemas,
        #panel-chat,
        #panel-texto-formatos,
        #panel-izquierdo,
        .panel-analisis,
        .panel-medio,
        .panel-derecho,
        #contenidoEditor,
        .main-content,
        .container,
        .container-fluid
      ) :where(i, [class^="fa-"], [class*=" fa-"]) {
        color: var(--app-text-color) !important;
      }

      body[data-page="generarlectura.html"] :where(.btn-label, .unidad-btn-text) {
        color: var(--app-text-color) !important;
      }

      /* Refuerzo por pagina para mantener iconos uniformes con el tema */
      body[data-page="voicetranscribe.html"] #mainToolbar i,
      body[data-page="voicetranscribe.html"] #sessionSidebar i,
      body[data-page="voicetranscribe.html"] #sessionFeed i {
        color: var(--app-text-color) !important;
      }

      body[data-page="generarlectura.html"] #panel-izquierdo:not(.studio-rail) i {
        color: var(--cb-chrome-bg, #3f4d98) !important;
      }

      body[data-page="generarlectura.html"] #panel-izquierdo.studio-rail i {
        color: inherit !important;
      }

      body[data-page="generarlectura.html"] .panel-analisis i,
      body[data-page="generarlectura.html"] .panel-medio i,
      body[data-page="generarlectura.html"] .panel-derecho i,
      body[data-page="generarlectura.html"] .modal i {
        color: var(--app-text-color) !important;
      }

      /* Excepcion de contraste: icono del boton enviar mensaje */
      body[data-page="generarlectura.html"] #enviarMensaje,
      body[data-page="generarlectura.html"] #enviarMensaje i {
        color: #f8fafc !important;
      }

      body[data-page="moodlecourse.html"] #sidebar2 i,
      body[data-page="moodlecourse.html"] #sidebarTemas i,
      body[data-page="moodlecourse.html"] #contenidoEditor i,
      body[data-page="moodlecourse.html"] main i {
        color: var(--app-text-color) !important;
      }

      body[data-page="moodlecourse.html"] :is(#btnNuevoCurso, #btnAddTema, #btnDescargarWord, .icon-btn),
      body[data-page="moodlecourse.html"] :is(#btnNuevoCurso, #btnAddTema, #btnDescargarWord, .icon-btn) :where(i, [class^="fa-"], [class*=" fa-"]),
      body[data-page="moodlecourse.html"] #selectGeminiEndpoint {
        color: var(--cb-control-fg, var(--app-text-color)) !important;
      }

      /* MoodleCourse: iconos con paleta unificada */
      body[data-page="moodlecourse.html"] :where(i, [class^="fa-"], [class*=" fa-"]) {
        color: hsl(var(--muted-foreground)) !important;
      }

      body[data-page="moodlecourse.html"] :where(i.cursor-pointer, .cursor-pointer i, .cursor-pointer [class^="fa-"], .cursor-pointer [class*=" fa-"]) {
        color: hsl(var(--foreground)) !important;
      }

      body[data-page="moodlecourse.html"] :where(.fa-trash, .btn-delete-modulo, .btn-delete-curso) {
        color: hsl(var(--destructive)) !important;
      }

      /* Duplicar modulo: color segun tema */
      body[data-page="moodlecourse.html"] .btn-duplicate-modulo,
      body[data-page="moodlecourse.html"] .btn-duplicate-modulo .fa-copy {
        color: hsl(var(--primary)) !important;
      }

      body.theme-dark[data-page="moodlecourse.html"] .btn-duplicate-modulo,
      body.theme-dark[data-page="moodlecourse.html"] .btn-duplicate-modulo .fa-copy {
        color: hsl(var(--accent)) !important;
      }

      /* Duplicar subtema: mismo esquema */
      body[data-page="moodlecourse.html"] .btn-duplicate-subtema,
      body[data-page="moodlecourse.html"] .btn-duplicate-subtema .fa-copy {
        color: hsl(var(--primary)) !important;
      }

      body.theme-dark[data-page="moodlecourse.html"] .btn-duplicate-subtema,
      body.theme-dark[data-page="moodlecourse.html"] .btn-duplicate-subtema .fa-copy {
        color: hsl(var(--accent)) !important;
      }

      /* Editar subtema: color segun tema */
      body[data-page="moodlecourse.html"] .btn-edit-subtema,
      body[data-page="moodlecourse.html"] .btn-edit-subtema .fa-pen {
        color: hsl(var(--primary)) !important;
      }

      body.theme-dark[data-page="moodlecourse.html"] .btn-edit-subtema,
      body.theme-dark[data-page="moodlecourse.html"] .btn-edit-subtema .fa-pen {
        color: hsl(var(--accent)) !important;
      }

      /* Eliminar subtema: siempre rojo */
      body[data-page="moodlecourse.html"] .btn-delete-subtema,
      body[data-page="moodlecourse.html"] .btn-delete-subtema .fa-trash {
        color: hsl(var(--destructive)) !important;
      }

      body[data-page="moodlecourse.html"] .accordion-trigger :where(i, [class^="fa-"], [class*=" fa-"]) {
        color: hsl(var(--foreground)) !important;
      }

      /* MoodleCourse: iconos dentro de items-center con color complementario */
      body[data-page="moodlecourse.html"] .items-center :where(i, [class^="fa-"], [class*=" fa-"]) {
        color: color-mix(in srgb, hsl(var(--primary)) 65%, hsl(var(--accent)) 35%) !important;
      }

      body.theme-dark[data-page="moodlecourse.html"] .items-center :where(i, [class^="fa-"], [class*=" fa-"]),
      body.dark[data-page="moodlecourse.html"] .items-center :where(i, [class^="fa-"], [class*=" fa-"]) {
        color: color-mix(in srgb, hsl(var(--accent)) 65%, hsl(var(--primary)) 35%) !important;
      }

      /* MoodleCourse: iconos dentro de flex items-center gap-2 */
      body[data-page="moodlecourse.html"] .flex.items-center.gap-2 :where(i, [class^="fa-"], [class*=" fa-"]) {
        color: color-mix(in srgb, hsl(var(--primary)) 65%, hsl(var(--accent)) 35%) !important;
      }

      body.theme-dark[data-page="moodlecourse.html"] .flex.items-center.gap-2 :where(i, [class^="fa-"], [class*=" fa-"]),
      body.dark[data-page="moodlecourse.html"] .flex.items-center.gap-2 :where(i, [class^="fa-"], [class*=" fa-"]) {
        color: color-mix(in srgb, hsl(var(--accent)) 65%, hsl(var(--primary)) 35%) !important;
      }

      /* Forzar que gap-2 siga el color del tema si hay text-* */
      body[data-page="moodlecourse.html"] .flex.items-center.gap-2 :where(i, [class^="fa-"], [class*=" fa-"]) {
        color: color-mix(in srgb, hsl(var(--primary)) 65%, hsl(var(--accent)) 35%) !important;
      }

      /* MoodleCourse: iconos dentro de modulo-actions */
      body[data-page="moodlecourse.html"] .modulo-actions :where(i, [class^="fa-"], [class*=" fa-"]) {
        color: color-mix(in srgb, hsl(var(--primary)) 65%, hsl(var(--accent)) 35%) !important;
      }

      body.theme-dark[data-page="moodlecourse.html"] .modulo-actions :where(i, [class^="fa-"], [class*=" fa-"]) {
        color: color-mix(in srgb, hsl(var(--accent)) 65%, hsl(var(--primary)) 35%) !important;
      }

      /* MoodleCourse: iconos de acciones con colores complementarios */
      body[data-page="moodlecourse.html"] :where(
        .fa-search,
        .fa-chalkboard-teacher,
        .fa-language,
        .fa-table,
        .fa-adjust,
        .fa-magic,
        .fa-comment-dots,
        .fa-pen,
        .fa-copy,
        .fa-clone
      ) {
        color: color-mix(in srgb, hsl(var(--primary)) 65%, hsl(var(--accent)) 35%) !important;
      }

      body.theme-dark[data-page="moodlecourse.html"] :where(
        .fa-search,
        .fa-chalkboard-teacher,
        .fa-language,
        .fa-table,
        .fa-adjust,
        .fa-magic,
        .fa-comment-dots,
        .fa-pen,
        .fa-copy,
        .fa-clone
      ) {
        color: color-mix(in srgb, hsl(var(--accent)) 65%, hsl(var(--primary)) 35%) !important;
      }

      /* Eliminar: siempre rojo */
      body[data-page="moodlecourse.html"] :where(
        .fa-trash,
        .btn-delete-modulo,
        .btn-delete-curso
      ) {
        color: hsl(var(--destructive)) !important;
      }

      /* Curso-item: preservar colores de iconos de acciones */
      body[data-page="moodlecourse.html"] #listaCursos .curso-item :where(
        .fa-pen,
        .fa-copy,
        .fa-clone,
        .fa-search,
        .fa-chalkboard-teacher,
        .fa-language,
        .fa-table,
        .fa-adjust,
        .fa-magic,
        .fa-comment-dots
      ) {
        color: color-mix(in srgb, hsl(var(--primary)) 65%, hsl(var(--accent)) 35%) !important;
      }

      body.theme-dark[data-page="moodlecourse.html"] #listaCursos .curso-item :where(
        .fa-pen,
        .fa-copy,
        .fa-clone,
        .fa-search,
        .fa-chalkboard-teacher,
        .fa-language,
        .fa-table,
        .fa-adjust,
        .fa-magic,
        .fa-comment-dots
      ) {
        color: color-mix(in srgb, hsl(var(--accent)) 65%, hsl(var(--primary)) 35%) !important;
      }

      body[data-page="moodlecourse.html"] #listaCursos .curso-item :where(
        .fa-trash,
        .btn-delete-curso
      ) {
        color: hsl(var(--destructive)) !important;
      }

      /* Accordion trigger icons: asegurar contraste visible */
      body[data-page="moodlecourse.html"] :where(#sidebarTemas, #contenidoEditor, main) .accordion-trigger :where(i, [class^="fa-"], [class*=" fa-"]) {
        color: hsl(var(--foreground)) !important;
      }

      #sessionFeed [class*="bg-slate-"],
      #sessionFeed [class~="bg-white"],
      #sessionSidebar [class*="bg-slate-"],
      #sessionSidebar [class~="bg-white"],
      #mainToolbar [class*="bg-slate-"],
      #mainToolbar [class~="bg-white"],
      #sidebarTemas [class*="bg-card"],
      #sidebarTemas [class*="bg-accent"],
      #sidebarTemas [class~="bg-white"],
      main.bg-background [class*="bg-card"],
      main.bg-background [class*="bg-background"],
      main.bg-background [class~="bg-white"] {
        background-color: var(--app-bg-color) !important;
      }

      #sessionSidebar [class*="border-slate-"],
      #mainToolbar [class*="border-slate-"],
      #sessionFeed [class*="border-slate-"],
      #sidebarTemas [class*="border-border"],
      main.bg-background [class*="border-border"],
      #panel-chat,
      #panel-texto-formatos {
        border-color: rgba(148, 163, 184, 0.35) !important;
      }

      /* Modales globales (todas las paginas) */
      :where(
        .modal,
        .modal-normal,
        .modal-imagen,
        .modal-galeria,
        .modal-generador,
        .modal-compartir-firebase,
        .modal-lecturas,
        .modal-overlay,
        .unidad-modal,
        #modalUpdates
      ) {
        background-color: rgba(15, 23, 42, 0.55) !important;
      }

      :where(
        .modal-content,
        .modal-contenido,
        .modal-contenidoHome,
        .modal-normal-content,
        .modal-galeria-contenido,
        .modal-lecturas-contenido,
        .panelLecturasGuardadas,
        .theme-settings-card
      ) {
        background-color: var(--app-bg-color) !important;
        color: var(--app-text-color) !important;
        border-color: rgba(148, 163, 184, 0.35) !important;
      }

      :where(
        .modal-header,
        .modal-body,
        .modal-footer,
        .modal-title,
        .modal-actions,
        .modal-buttons
      ) {
        color: var(--app-text-color) !important;
        border-color: rgba(148, 163, 184, 0.35) !important;
      }

      :where(
        .modal-content,
        .modal-contenido,
        .modal-contenidoHome,
        .modal-normal-content,
        .modal-galeria-contenido,
        .modal-lecturas-contenido,
        .panelLecturasGuardadas
      ) :where(input, textarea, select, [contenteditable="true"], .form-control, .form-select) {
        background-color: var(--app-form-bg) !important;
        color: var(--app-form-text) !important;
        border-color: var(--app-form-border) !important;
      }

      :where(input, textarea, select, .form-control, .form-select) {
        background-color: var(--app-form-bg) !important;
        color: var(--app-form-text) !important;
        border-color: var(--app-form-border) !important;
        caret-color: var(--app-form-text) !important;
      }

      :where(input, textarea, select, .form-control, .form-select)::placeholder {
        color: var(--app-form-placeholder) !important;
      }

      :where(input, textarea, select, .form-control, .form-select):focus {
        border-color: var(--app-form-focus) !important;
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-form-focus) 24%, transparent) !important;
        outline: none !important;
      }

      :where(
        button,
        .btn,
        .theme-btn,
        .theme-icon-btn,
        .theme-settings-card,
        .theme-settings-section,
        .content-card,
        .card,
        .modal-content,
        .modal-contenido,
        .modal-normal-content,
        .panelLecturasGuardadas,
        .lecturas-table-wrap,
        .asc-table-wrap,
        .tabla-lecturas-contenedor,
        .unidad-card,
        .unidad-panel,
        .unidad-editor-table-wrap,
        .tabla-secuencia-wrap,
        input,
        select,
        textarea
      ) {
        border-radius: var(--app-surface-radius) !important;
      }

      :where(table) {
        width: 100%;
        border-collapse: collapse;
        background: var(--app-table-surface);
        color: var(--app-table-text);
      }

      :where(table thead, table thead tr, table thead th) {
        background: var(--app-table-head-bg);
        color: var(--app-table-text);
      }

      :where(table th, table td) {
        border: var(--app-table-line-width) solid var(--app-table-border);
        color: var(--app-table-text);
      }

      :where(table tbody tr:nth-child(even) td) {
        background: var(--app-table-row-alt);
      }

      :where(table tbody tr:hover td) {
        background: var(--app-table-row-hover);
      }

      :where(
        .modal-content,
        .modal-contenido,
        .modal-contenidoHome,
        .modal-normal-content,
        .modal-galeria-contenido,
        .modal-lecturas-contenido,
        .panelLecturasGuardadas
      ) :where(button, .btn, .btn-secondary, .btn-primary, .btn-analisis) {
        border-color: rgba(148, 163, 184, 0.35) !important;
      }

      /* Modales Tailwind/custom (aplica en otras paginas tambien) */
      :where([id^="modal"], [id$="Modal"], #ascModal) > :where(div, section)[class*="absolute"][class*="inset-0"] {
        background-color: rgba(15, 23, 42, 0.55) !important;
      }

      :where([id^="modal"], [id$="Modal"], #ascModal) :where(.bg-white, [class*=" bg-white"], [class^="bg-white"]) {
        background-color: var(--app-bg-color) !important;
        color: var(--app-text-color) !important;
      }

      :where([id^="modal"], [id$="Modal"], #ascModal) :where([class*="text-gray-"], [class*=" text-gray-"]) {
        color: var(--app-text-color) !important;
      }

      :where([id^="modal"], [id$="Modal"], #ascModal) :where([class*="border-gray-"], [class*=" border-gray-"]) {
        border-color: rgba(148, 163, 184, 0.35) !important;
      }

      :where([id^="modal"], [id$="Modal"], #ascModal) :where(.bg-gray-50, [class*=" bg-gray-50"], [class^="bg-gray-50"]) {
        background-color: color-mix(in srgb, var(--app-bg-color) 92%, #e2e8f0 8%) !important;
      }

      :where([id^="modal"], [id$="Modal"], #ascModal) :where(.bg-gray-900, [class*=" bg-gray-900"], [class^="bg-gray-900"]) {
        background-color: var(--cb-chrome-bg) !important;
        color: var(--cb-header-text-color) !important;
        border-color: var(--cb-chrome-bg) !important;
      }

      .app-alert,
      .alert-themed,
      .update-banner {
        background: var(--app-alert-bg) !important;
        color: var(--app-alert-text) !important;
        border-color: var(--app-alert-border) !important;
      }

      .update-banner:hover {
        background: color-mix(in srgb, var(--app-alert-bg) 86%, #ffffff 14%) !important;
      }

      .update-banner .update-banner-icon,
      .update-banner .update-banner-title,
      .update-banner .update-banner-msg,
      .update-banner .update-banner-cta,
      .update-banner .update-banner-item,
      .update-banner .update-banner-item-index,
      .update-banner .update-banner-summary > summary {
        color: var(--app-alert-text) !important;
      }

      .update-banner .update-banner-summary {
        border-top-color: var(--app-alert-border) !important;
      }

      .app-alert a,
      .alert-themed a,
      .update-banner a {
        color: var(--app-alert-accent) !important;
      }

      #mainToolbar > *,
      #mainToolbar .toolbar-title,
      #mainToolbar .toolbar-actions,
      #mainToolbar .toolbar-menu-wrapper {
        background: transparent !important;
      }

      #mainToolbar #mainToolbarMenu {
        background-color: var(--app-bg-color) !important;
        color: var(--app-text-color) !important;
        border-color: rgba(148, 163, 184, 0.35) !important;
        opacity: 1 !important;
        backdrop-filter: none !important;
      }

      body.theme-dark .card,
      body.theme-dark .modal-content,
      body.theme-dark .modal-contenido,
      body.theme-dark .modal-contenidoHome,
      body.theme-dark .modal-normal-content,
      body.theme-dark .modal-galeria-contenido,
      body.theme-dark .modal-lecturas-contenido,
      body.theme-dark .panelLecturasGuardadas,
      body.theme-dark .chatbot-container,
      body.theme-dark .panel-izquierdo,
      body.theme-dark .panel-central,
      body.theme-dark .panel-derecho,
      body.theme-dark .contacts-list,
      body.theme-dark #chat-panel,
      body.theme-dark #sidebar2,
      body.theme-dark #sessionSidebar,
      body.theme-dark .main-content,
      body.theme-dark .container,
      body.theme-dark .container-fluid {
        background-color: rgba(15, 23, 42, 0.92) !important;
        color: var(--app-text-color) !important;
        border-color: rgba(148, 163, 184, 0.35) !important;
      }

      /* En tema oscuro, asegurar texto claro en spans de contenido/modales */
      body.theme-dark :where(
        main,
        #mainToolbar,
        #sessionSidebar,
        #sessionFeed,
        #sidebar2,
        #sidebarTemas,
        #panel-izquierdo,
        .panel-analisis,
        .panel-medio,
        .panel-derecho,
        .modal-content,
        .modal-contenido,
        .modal-contenidoHome,
        .modal-normal-content,
        .modal-galeria-contenido,
        .modal-lecturas-contenido,
        .panelLecturasGuardadas
      ) span {
        color: var(--app-text-color) !important;
      }

      body.theme-dark input,
      body.theme-dark textarea,
      body.theme-dark select,
      body.theme-dark button,
      body.theme-dark .form-control,
      body.theme-dark .form-select {
        border-color: rgba(148, 163, 184, 0.4);
      }

      body.theme-dark input,
      body.theme-dark textarea,
      body.theme-dark select,
      body.theme-dark .form-control,
      body.theme-dark .form-select {
        background-color: rgba(15, 23, 42, 0.82) !important;
        color: var(--app-text-color) !important;
      }

      .theme-settings-modal {
        position: fixed;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(15, 23, 42, 0.5);
        z-index: 25000;
        padding: 16px;
      }

      .theme-settings-modal.is-open {
        display: flex;
      }

      .theme-settings-card {
        width: min(1240px, 98vw);
        max-height: 92vh;
        display: flex;
        flex-direction: column;
        background: #ffffff;
        border-radius: 14px;
        box-shadow: 0 20px 48px rgba(15, 23, 42, 0.28);
        border: 1px solid #e2e8f0;
        overflow: hidden;
      }

      body.theme-dark .theme-settings-card {
        background: #0f172a;
        border-color: #334155;
        color: #e2e8f0;
      }

      .theme-settings-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        border-bottom: 1px solid #e2e8f0;
      }

      body.theme-dark .theme-settings-head {
        border-bottom-color: #334155;
      }

      .theme-settings-head h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
      }

      .theme-settings-close {
        border: none;
        background: transparent;
        font-size: 18px;
        cursor: pointer;
        color: inherit;
      }

      .theme-settings-tools {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .theme-icon-btn {
        border: 1px solid #cbd5e1;
        border-radius: 7px;
        background: #f8fafc;
        color: #0f172a;
        width: 28px;
        height: 28px;
        cursor: pointer;
      }

      body.theme-dark .theme-icon-btn {
        border-color: #475569;
        background: #1e293b;
        color: #e2e8f0;
      }

      .theme-settings-body {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 10px 12px;
        overflow-y: auto;
        overscroll-behavior: contain;
      }

      .theme-settings-layout {
        display: grid;
        gap: 12px;
      }

      .theme-settings-quickrow {
        display: grid;
        grid-template-columns: minmax(140px, 170px) minmax(190px, 240px) minmax(0, 1fr) minmax(170px, 220px);
        gap: 10px;
        align-items: start;
      }

      .theme-settings-section {
        display: grid;
        gap: 10px;
        padding: 10px;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        background: #f8fafc;
      }

      body.theme-dark .theme-settings-section {
        border-color: #334155;
        background: #111827;
      }

      .theme-settings-section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .theme-settings-section-title {
        margin: 0;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .04em;
        text-transform: uppercase;
        color: #475569;
      }

      body.theme-dark .theme-settings-section-title {
        color: #94a3b8;
      }

      .theme-settings-inline-note {
        font-size: 10px;
        color: #64748b;
      }

      body.theme-dark .theme-settings-inline-note {
        color: #94a3b8;
      }

      .theme-settings-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px 10px;
      }

      .theme-field {
        display: grid;
        gap: 4px;
        min-width: 0;
      }

      .theme-field.theme-field-span-2 {
        grid-column: 1 / -1;
      }

      .theme-field.theme-field-span-3 {
        grid-column: span 3;
      }

      .theme-field.theme-field-span-2cols {
        grid-column: span 2;
      }

      .theme-field.theme-field-span-full {
        grid-column: 1 / -1;
      }

      .theme-field label {
        font-size: 10px;
        font-weight: 600;
        color: #334155;
        line-height: 1.2;
      }

      body.theme-dark .theme-field label {
        color: #cbd5e1;
      }

      .theme-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 6px;
        align-items: center;
      }

      .theme-presets-grid {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 5px;
        margin-top: 4px;
        max-height: 280px;
        overflow-y: auto;
        padding-right: 2px;
      }

      .theme-preset-btn {
        display: grid;
        gap: 5px;
        border: 1px solid #cbd5e1;
        border-radius: 9px;
        background: #f8fafc;
        color: #0f172a;
        text-align: left;
        padding: 6px;
        cursor: pointer;
        font-size: 10px;
        font-weight: 600;
      }

      .theme-preset-label {
        display: block;
        line-height: 1.2;
      }

      .theme-preset-category {
        display: block;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #64748b;
      }

      .theme-preset-btn.is-active {
        border-color: #3f4d98;
        box-shadow: 0 0 0 2px rgba(63, 77, 152, 0.15);
      }

      .theme-preset-colors {
        display: flex;
        gap: 4px;
      }

      .theme-preset-color {
        width: 14px;
        height: 14px;
        border-radius: 999px;
        border: 1px solid rgba(15, 23, 42, 0.2);
      }

      .theme-field input[type="color"] {
        width: 32px;
        height: 28px;
        border: 1px solid var(--app-form-border);
        border-radius: 6px;
        padding: 2px;
        background: var(--app-form-bg);
        cursor: pointer;
      }

      body.theme-dark .theme-field input[type="color"] {
        border-color: var(--app-form-border);
        background: var(--app-form-bg);
      }

      .theme-field input[type="range"] {
        width: 100%;
      }

      .theme-field input[type="text"],
      .theme-field select {
        width: 100%;
        border: 1px solid var(--app-form-border);
        border-radius: 7px;
        padding: 5px 7px;
        font-size: 11px;
        min-height: 28px;
        background: var(--app-form-bg);
        color: var(--app-form-text);
      }

      .theme-field input[type="range"] {
        min-height: 24px;
      }

      body.theme-dark .theme-field input[type="text"],
      body.theme-dark .theme-field select {
        border-color: var(--app-form-border);
        background: var(--app-form-bg);
        color: var(--app-form-text);
      }

      body.theme-dark .theme-preset-btn {
        border-color: #475569;
        background: #1e293b;
        color: #e2e8f0;
      }

      body.theme-dark .theme-preset-category {
        color: #94a3b8;
      }

      body.theme-dark .theme-preset-btn.is-active {
        border-color: #818cf8;
        box-shadow: 0 0 0 2px rgba(129, 140, 248, 0.2);
      }

      .theme-settings-footer {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 12px;
        border-top: 1px solid #e2e8f0;
        position: sticky;
        bottom: 0;
        background: inherit;
      }

      body.theme-dark .theme-settings-footer {
        border-top-color: #334155;
      }

      .theme-btn {
        border: 1px solid #cbd5e1;
        border-radius: 7px;
        background: #f8fafc;
        color: #0f172a;
        padding: 6px 9px;
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
      }

      .theme-btn-primary {
        border-color: #3f4d98;
        background: #3f4d98;
        color: #ffffff;
      }

      body.theme-dark .theme-btn {
        border-color: #475569;
        background: #1e293b;
        color: #e2e8f0;
      }

      body.theme-dark .theme-btn-primary {
        border-color: #4c5db8;
        background: #4c5db8;
        color: #ffffff;
      }

      @media (max-width: 1120px) {
        .theme-settings-quickrow {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .theme-settings-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .theme-presets-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }

      @media (max-width: 920px) {
        .theme-settings-card {
          width: min(96vw, 820px);
        }
        .theme-settings-quickrow {
          grid-template-columns: 1fr;
        }
        .theme-settings-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .theme-presets-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          max-height: 200px;
        }
      }

      @media (max-width: 640px) {
        .theme-settings-modal {
          padding: 10px;
        }
        .theme-settings-card {
          width: min(100vw, 100%);
          max-height: 94vh;
        }
        .theme-settings-body {
          gap: 8px;
          padding: 10px;
        }
        .theme-settings-grid {
          grid-template-columns: 1fr;
        }
        .theme-field.theme-field-span-3 {
          grid-column: 1 / -1;
        }
        .theme-field.theme-field-span-2cols {
          grid-column: 1 / -1;
        }
        .theme-field.theme-field-span-full {
          grid-column: 1 / -1;
        }
        .theme-presets-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 768px) {
        body[data-page="voicetranscribe.html"] #sessionSidebar,
        body[data-page="voicetranscribe.html"] #mainToolbar,
        body[data-page="voicetranscribe.html"] #sessionFeed,
        body[data-page="voicetranscribe.html"] .flex.h-screen.overflow-hidden,
        body[data-page="voicetranscribe.html"] main.flex-1.flex.flex-col.h-full.relative {
          background-color: revert !important;
          color: revert !important;
          border-color: revert !important;
        }

        body[data-page="voicetranscribe.html"] #mainToolbar > *,
        body[data-page="voicetranscribe.html"] #mainToolbar .toolbar-title,
        body[data-page="voicetranscribe.html"] #mainToolbar .toolbar-actions,
        body[data-page="voicetranscribe.html"] #mainToolbar .toolbar-menu-wrapper {
          background: revert !important;
        }

        body[data-page="voicetranscribe.html"] #sessionFeed :where(h1, h2, h3, h4, h5, h6, span, p, label, li, td, th) {
          color: revert !important;
        }
      }

      #commandSettingsModal .theme-settings-card {
        width: min(96vw, 1320px);
        height: 92vh;
        max-height: 92vh;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        box-shadow: 0 18px 46px rgba(15, 23, 42, 0.18);
        background:
          radial-gradient(circle at 100% 0%, rgba(148, 163, 184, 0.08), transparent 34%),
          linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
      }
      body.theme-dark #commandSettingsModal .theme-settings-card {
        border-color: #334155;
        box-shadow: 0 22px 56px rgba(2, 6, 23, 0.55);
        background:
          radial-gradient(circle at 100% 0%, rgba(71, 85, 105, 0.26), transparent 34%),
          linear-gradient(180deg, #0f172a 0%, #111827 100%);
      }
      #commandSettingsModal .theme-settings-head {
        border-bottom: 1px solid #e2e8f0;
        background: rgba(248, 250, 252, 0.92);
        backdrop-filter: blur(6px);
      }
      body.theme-dark #commandSettingsModal .theme-settings-head {
        border-bottom-color: #334155;
        background: rgba(15, 23, 42, 0.9);
      }
      #commandSettingsModal .theme-settings-body {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 0;
        padding: 14px;
        /* Altura fija visible del bloque; el contenido interno se desplaza */
        height: calc(92vh - 128px);
        max-height: calc(92vh - 128px);
        overflow-y: auto;
        overflow-x: hidden;
      }
      #commandSettingsModal .command-settings-sections {
        display: block;
        gap: 10px;
        min-height: 0;
        overflow-y: visible;
        overflow-x: hidden;
      }
      #commandSettingsModal .command-settings-sections > * + * {
        margin-top: 10px;
      }
      #commandSettingsModal .command-accordion {
        display: block;
        height: auto;
        min-height: 0;
        max-height: none;
        border: 1px solid #dbe3ef;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.78);
        overflow: hidden;
      }
      body.theme-dark #commandSettingsModal .command-accordion {
        border-color: #334155;
        background: rgba(15, 23, 42, 0.62);
      }
      #commandSettingsModal .command-accordion > summary {
        list-style: none;
        cursor: pointer;
        user-select: none;
        padding: 11px 12px;
        font-size: 12px;
        font-weight: 700;
        color: #1e293b;
        background: #f8fafc;
        border-bottom: 1px solid transparent;
      }
      #commandSettingsModal .command-accordion > summary::-webkit-details-marker {
        display: none;
      }
      #commandSettingsModal .command-accordion[open] > summary {
        border-bottom-color: #dbe3ef;
      }
      body.theme-dark #commandSettingsModal .command-accordion > summary {
        color: #e2e8f0;
        background: #111827;
      }
      body.theme-dark #commandSettingsModal .command-accordion[open] > summary {
        border-bottom-color: #334155;
      }
      #commandSettingsModal .command-accordion-body {
        display: block;
        height: auto;
        min-height: 0;
        max-height: none;
        overflow: hidden;
        gap: 10px;
        padding: 10px 12px 12px;
      }
      #commandSettingsModal .command-accordion-body > * + * {
        margin-top: 10px;
      }
      #commandSettingsModal .command-voice-grid {
        display: flex;
        flex-wrap: wrap;
        align-items: end;
        gap: 10px 12px;
      }
      #commandSettingsModal .command-voice-grid .command-compact-field {
        flex: 0 1 190px;
        min-width: 165px;
      }
      #commandSettingsModal .command-voice-grid .command-range-field {
        flex: 1 1 230px;
        min-width: 210px;
      }
      #commandSettingsModal .command-voice-grid .theme-field label {
        font-size: 10px;
      }
      #commandSettingsModal .command-voice-grid .theme-field select {
        min-height: 30px;
        padding: 5px 8px;
        font-size: 11px;
      }
      #commandSettingsModal .command-voice-grid .command-toggle-field {
        align-self: center;
      }
      #commandSettingsModal .command-voice-grid .command-toggle-field small {
        font-size: 10px;
        color: #64748b;
      }
      body.theme-dark #commandSettingsModal .command-voice-grid .command-toggle-field small {
        color: #94a3b8;
      }
      #commandSettingsModal .command-accordion-body .theme-field.theme-field-span-2,
      #commandSettingsModal .command-accordion-body .command-settings-table-wrap,
      #commandSettingsModal .command-accordion-body .command-conflict-alert {
        width: 100%;
      }
      #commandSettingsModal .command-function-row {
        display: grid;
        grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr) auto;
        gap: 10px;
        align-items: end;
      }
      #commandSettingsModal .command-function-row .theme-field {
        min-width: 0;
      }
      #commandSettingsModal .command-function-row .theme-btn {
        min-width: 96px;
      }
      #commandSettingsModal .theme-settings-footer {
        border-top: 1px solid #e2e8f0;
        background: rgba(248, 250, 252, 0.92);
        backdrop-filter: blur(6px);
      }
      body.theme-dark #commandSettingsModal .theme-settings-footer {
        border-top-color: #334155;
        background: rgba(15, 23, 42, 0.9);
      }
      #commandSettingsModal .theme-btn {
        border-color: #cbd5e1;
        border-radius: 10px;
        background: #ffffff;
        min-height: 34px;
        transition: border-color .2s ease, box-shadow .2s ease, background-color .2s ease, transform .15s ease;
      }
      #commandSettingsModal .theme-btn:hover {
        border-color: #94a3b8;
        box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.2);
      }
      #commandSettingsModal .theme-btn:active {
        transform: translateY(1px);
      }
      #commandSettingsModal .theme-btn-primary {
        border-color: #334155;
        background: linear-gradient(180deg, #334155 0%, #1e293b 100%);
        color: #f8fafc;
      }
      #commandSettingsModal .theme-btn-primary:hover {
        border-color: #1e293b;
        box-shadow: 0 0 0 3px rgba(51, 65, 85, 0.25);
      }
      body.theme-dark #commandSettingsModal .theme-btn {
        border-color: #475569;
        background: #111827;
      }
      body.theme-dark #commandSettingsModal .theme-btn:hover {
        border-color: #64748b;
        box-shadow: 0 0 0 3px rgba(71, 85, 105, 0.32);
      }
      body.theme-dark #commandSettingsModal .theme-btn-primary {
        border-color: #64748b;
        background: linear-gradient(180deg, #475569 0%, #334155 100%);
      }
      #${WORKFLOW_MODAL_ID} .theme-settings-card {
        width: min(1220px, 96vw);
        max-height: min(920px, 94vh);
      }
      #${WORKFLOW_MODAL_ID} .workflow-map-layout {
        display: grid;
        grid-template-columns: minmax(320px, 390px) minmax(0, 1fr);
        gap: 12px;
        height: 100%;
      }
      #${WORKFLOW_MODAL_ID} .workflow-map-controls {
        border: 1px solid #cbd5e1;
        border-radius: 12px;
        padding: 12px;
        background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
        display: grid;
        gap: 10px;
        align-content: start;
      }
      #${WORKFLOW_MODAL_ID} .workflow-map-controls .theme-field {
        margin: 0;
      }
      #${WORKFLOW_MODAL_ID} .workflow-map-controls-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      #${WORKFLOW_MODAL_ID} .workflow-map-help {
        margin: 0;
        padding: 8px 9px;
        border-radius: 10px;
        border: 1px dashed #94a3b8;
        background: rgba(255, 255, 255, 0.76);
        font-size: 11px;
        color: #334155;
        line-height: 1.35;
      }
      #${WORKFLOW_MODAL_ID} .workflow-play-delay {
        display: grid;
        gap: 6px;
      }
      #${WORKFLOW_MODAL_ID} .workflow-play-delay-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-size: 12px;
        color: #334155;
      }
      #${WORKFLOW_MODAL_ID} .workflow-play-delay input[type="range"] {
        width: 100%;
      }
      #${WORKFLOW_MODAL_ID} .workflow-response-panel {
        display: none;
        gap: 8px;
        border: 1px solid #f59e0b;
        border-radius: 10px;
        padding: 9px;
        background: #fff7ed;
      }
      #${WORKFLOW_MODAL_ID} .workflow-response-panel.is-open {
        display: grid;
      }
      #${WORKFLOW_MODAL_ID} .workflow-response-panel small {
        color: #7c2d12;
        line-height: 1.35;
      }
      #${WORKFLOW_MODAL_ID} .workflow-response-options {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      #${WORKFLOW_MODAL_ID} .workflow-response-options .theme-btn {
        width: 100%;
      }
      #${WORKFLOW_MODAL_ID} .workflow-run-log {
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.9);
        min-height: 120px;
        max-height: 170px;
        overflow: auto;
        padding: 8px;
        font-size: 11px;
        line-height: 1.35;
        color: #0f172a;
        white-space: pre-wrap;
      }
      #${WORKFLOW_MODAL_ID} .workflow-run-log-line {
        margin: 0 0 5px 0;
      }
      #${WORKFLOW_MODAL_ID} .workflow-run-log-line.is-error {
        color: #b91c1c;
      }
      #${WORKFLOW_MODAL_ID} .workflow-run-log-line.is-ok {
        color: #065f46;
      }
      #${WORKFLOW_MODAL_ID} .workflow-map-controls .theme-btn {
        width: 100%;
      }
      #${WORKFLOW_MODAL_ID} .workflow-map-controls .theme-btn.workflow-btn-active {
        border-color: #0ea5e9;
        box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.24);
        background: linear-gradient(180deg, #e0f2fe 0%, #bae6fd 100%);
      }
      #${WORKFLOW_MODAL_ID} .workflow-status {
        font-size: 12px;
        color: #334155;
        min-height: 18px;
      }
      #${WORKFLOW_MODAL_ID} .workflow-status.is-error {
        color: #b91c1c;
      }
      #${WORKFLOW_MODAL_ID} .workflow-map-canvas-wrap {
        border: 1px solid #cbd5e1;
        border-radius: 12px;
        background:
          radial-gradient(circle at 1px 1px, rgba(148, 163, 184, 0.44) 1px, transparent 1px) 0 0 / 22px 22px,
          linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        min-height: 500px;
        height: 100%;
        overflow: hidden;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
        position: relative;
      }
      #${WORKFLOW_MODAL_ID} .workflow-map-canvas {
        width: 100%;
        height: 100%;
        min-height: 500px;
      }
      #${WORKFLOW_MODAL_ID} .workflow-node-menus-layer {
        position: absolute;
        inset: 0;
        z-index: 4;
        pointer-events: none;
      }
      #${WORKFLOW_MODAL_ID} .workflow-node-menu-btn {
        position: absolute;
        width: 22px;
        height: 22px;
        border-radius: 11px;
        border: 1px solid #94a3b8;
        background: rgba(255, 255, 255, 0.96);
        color: #0f172a;
        font-size: 15px;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 1px 6px rgba(15, 23, 42, 0.16);
        pointer-events: auto;
      }
      #${WORKFLOW_MODAL_ID} .workflow-node-menu-btn:hover {
        border-color: #0ea5e9;
        box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.2);
      }
      #${WORKFLOW_MODAL_ID} .workflow-node-menu-btn.is-selected {
        border-color: #f59e0b;
        box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.24);
      }
      #${WORKFLOW_MODAL_ID} .workflow-node-menu-panel {
        position: absolute;
        z-index: 5;
        min-width: 260px;
        max-width: 320px;
        border: 1px solid #cbd5e1;
        border-radius: 12px;
        background: #ffffff;
        padding: 10px;
        display: none;
        gap: 8px;
        box-shadow: 0 18px 36px rgba(15, 23, 42, 0.2);
      }
      #${WORKFLOW_MODAL_ID} .workflow-node-menu-panel.is-open {
        display: grid;
      }
      #${WORKFLOW_MODAL_ID} .workflow-node-menu-panel label {
        font-size: 12px;
        color: #334155;
      }
      #${WORKFLOW_MODAL_ID} .workflow-node-menu-panel select {
        width: 100%;
      }
      #${WORKFLOW_MODAL_ID} .workflow-node-menu-actions {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }
      body.theme-dark #${WORKFLOW_MODAL_ID} .workflow-map-controls {
        border-color: #334155;
        background: linear-gradient(180deg, #111827 0%, #0f172a 100%);
      }
      body.theme-dark #${WORKFLOW_MODAL_ID} .workflow-map-help {
        border-color: #475569;
        background: rgba(15, 23, 42, 0.72);
        color: #cbd5e1;
      }
      body.theme-dark #${WORKFLOW_MODAL_ID} .workflow-play-delay-head {
        color: #cbd5e1;
      }
      body.theme-dark #${WORKFLOW_MODAL_ID} .workflow-response-panel {
        border-color: #f59e0b;
        background: rgba(120, 53, 15, 0.28);
      }
      body.theme-dark #${WORKFLOW_MODAL_ID} .workflow-response-panel small {
        color: #fed7aa;
      }
      body.theme-dark #${WORKFLOW_MODAL_ID} .workflow-run-log {
        border-color: #334155;
        background: rgba(15, 23, 42, 0.72);
        color: #dbeafe;
      }
      body.theme-dark #${WORKFLOW_MODAL_ID} .workflow-run-log-line.is-error {
        color: #fca5a5;
      }
      body.theme-dark #${WORKFLOW_MODAL_ID} .workflow-run-log-line.is-ok {
        color: #86efac;
      }
      body.theme-dark #${WORKFLOW_MODAL_ID} .workflow-map-controls .theme-btn.workflow-btn-active {
        border-color: #38bdf8;
        box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.28);
        background: linear-gradient(180deg, #10253a 0%, #0b2433 100%);
      }
      body.theme-dark #${WORKFLOW_MODAL_ID} .workflow-map-canvas-wrap {
        border-color: #334155;
        background:
          radial-gradient(circle at 1px 1px, rgba(71, 85, 105, 0.52) 1px, transparent 1px) 0 0 / 22px 22px,
          linear-gradient(180deg, #0f172a 0%, #0b1220 100%);
      }
      body.theme-dark #${WORKFLOW_MODAL_ID} .workflow-node-menu-btn {
        border-color: #475569;
        background: rgba(15, 23, 42, 0.95);
        color: #e2e8f0;
        box-shadow: 0 1px 6px rgba(2, 6, 23, 0.36);
      }
      body.theme-dark #${WORKFLOW_MODAL_ID} .workflow-node-menu-btn:hover {
        border-color: #38bdf8;
        box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.24);
      }
      body.theme-dark #${WORKFLOW_MODAL_ID} .workflow-node-menu-panel {
        border-color: #334155;
        background: #0f172a;
        box-shadow: 0 18px 36px rgba(2, 6, 23, 0.42);
      }
      body.theme-dark #${WORKFLOW_MODAL_ID} .workflow-node-menu-panel label {
        color: #cbd5e1;
      }
      body.theme-dark #${WORKFLOW_MODAL_ID} .workflow-status {
        color: #94a3b8;
      }
      body.theme-dark #${WORKFLOW_MODAL_ID} .workflow-status.is-error {
        color: #fca5a5;
      }
      .command-settings-table-wrap {
        grid-column: 1 / -1;
        border: 1px solid transparent;
        border-radius: 12px;
        overflow: auto;
        height: auto;
        min-height: 0;
        max-height: none;
        background: #ffffff;
      }
      body.theme-dark .command-settings-table-wrap {
        border-color: transparent;
        background: #0f172a;
      }

      @media (max-width: 920px) {
        .command-settings-table-wrap {
          height: auto;
          min-height: 0;
        }
      }
      .command-conflict-alert {
        grid-column: 1 / -1;
        display: none;
        margin-top: 6px;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid #f59e0b;
        background: #fffbeb;
        color: #92400e;
        font-size: 12px;
      }
      .command-conflict-alert.is-visible {
        display: block;
      }
      body.theme-dark .command-conflict-alert {
        border-color: #d97706;
        background: #3b2f12;
        color: #fbbf24;
      }

      .command-settings-table {
        width: 100%;
        min-width: 1480px;
        border-collapse: separate;
        border-spacing: 0;
        font-size: 12px;
      }

      .command-settings-table th {
        position: sticky;
        top: 0;
        z-index: 3;
        border: 0;
        padding: 10px 8px;
        text-align: left;
        vertical-align: middle;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        color: #475569;
        background: #f8fafc;
      }
      .command-settings-table td {
        border: 0;
        padding: 8px;
        text-align: left;
        vertical-align: middle;
        background: #ffffff;
      }
      .command-settings-table th:nth-child(2),
      .command-settings-table td:nth-child(2) {
        width: 170px;
        min-width: 170px;
        max-width: 170px;
      }
      .command-settings-table th:nth-child(3),
      .command-settings-table td:nth-child(3) {
        width: 90px;
        min-width: 90px;
        max-width: 90px;
        text-align: center;
      }
      .command-settings-table td:nth-child(2) select[data-cmd-fn] {
        width: 100%;
        min-width: 0;
        font-size: 11px;
        padding: 6px 8px;
      }
      .command-settings-table td:nth-child(3) .cmd-switch {
        justify-content: center;
        display: inline-flex;
        width: 100%;
      }
      .command-settings-table tbody tr:nth-child(even) td {
        background: #f8fafc;
      }
      .command-settings-table tbody tr:hover td {
        background: #eef2ff;
      }
      .command-settings-table tr.command-conflict-row {
        background: #fff7ed;
      }
      body.theme-dark .command-settings-table tr.command-conflict-row {
        background: rgba(217, 119, 6, 0.12);
      }
      .command-conflict-note {
        display: none;
        margin-top: 4px;
        font-size: 11px;
        color: #b45309;
      }
      .command-conflict-note.is-visible {
        display: block;
      }
      body.theme-dark .command-conflict-note {
        color: #f59e0b;
      }

      body.theme-dark .command-settings-table th {
        color: #94a3b8;
        background: #111827;
      }
      body.theme-dark .command-settings-table td {
        background: #0f172a;
      }
      body.theme-dark .command-settings-table tbody tr:nth-child(even) td {
        background: #111827;
      }
      body.theme-dark .command-settings-table tbody tr:hover td {
        background: #1e293b;
      }

      .command-regex-input {
        width: 100%;
        min-width: 240px;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        padding: 7px 9px;
        font-size: 12px;
        background: #ffffff;
        color: #0f172a;
        transition: border-color .2s ease, box-shadow .2s ease, background-color .2s ease;
      }
      .command-input-sm {
        min-width: 160px;
        max-width: 280px;
      }
      .command-regex-input:focus {
        outline: none;
        border-color: #64748b;
        box-shadow: 0 0 0 3px rgba(100, 116, 139, 0.2);
      }
      .command-next-select {
        width: 100%;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        padding: 7px 9px;
        font-size: 12px;
        min-height: 34px;
        background: #ffffff;
        color: #0f172a;
      }
      .command-next-select:focus {
        outline: none;
        border-color: #64748b;
        box-shadow: 0 0 0 3px rgba(100, 116, 139, 0.2);
      }
      .command-row-actions {
        display: flex;
        gap: 6px;
        align-items: center;
        flex-wrap: wrap;
      }
      .command-row-actions .theme-btn {
        min-width: 62px;
      }
      .cmd-switch {
        position: relative;
        display: inline-flex;
        width: 44px;
        height: 24px;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      .cmd-switch input {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
      }
      .cmd-switch-track {
        position: relative;
        width: 44px;
        height: 24px;
        border-radius: 999px;
        background: #cbd5e1;
        transition: background-color .18s ease, box-shadow .18s ease;
        box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.14);
      }
      .cmd-switch-thumb {
        position: absolute;
        top: 3px;
        left: 3px;
        width: 18px;
        height: 18px;
        border-radius: 999px;
        background: #ffffff;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.28);
        transition: transform .18s ease;
      }
      .cmd-switch input:checked + .cmd-switch-track {
        background: #22c55e;
        box-shadow: inset 0 0 0 1px rgba(22, 101, 52, 0.28);
      }
      .cmd-switch input:checked + .cmd-switch-track .cmd-switch-thumb {
        transform: translateX(20px);
      }
      .cmd-switch input:focus-visible + .cmd-switch-track {
        box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.22);
      }

      body.theme-dark .command-regex-input {
        border-color: #475569;
        background: #0f172a;
        color: #e2e8f0;
      }
      body.theme-dark .command-regex-input:focus {
        border-color: #64748b;
        box-shadow: 0 0 0 3px rgba(100, 116, 139, 0.28);
      }
      body.theme-dark .command-next-select {
        border-color: #475569;
        background: #0f172a;
        color: #e2e8f0;
      }
      body.theme-dark .command-next-select:focus {
        border-color: #64748b;
        box-shadow: 0 0 0 3px rgba(100, 116, 139, 0.28);
      }
      body.theme-dark .cmd-switch-track {
        background: #475569;
        box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.24);
      }
      body.theme-dark .cmd-switch input:checked + .cmd-switch-track {
        background: #16a34a;
      }
      body.theme-dark .cmd-switch-thumb {
        background: #f8fafc;
      }
      @media (max-width: 980px) {
        #commandSettingsModal .command-function-row {
          grid-template-columns: 1fr;
          align-items: stretch;
        }
        #commandSettingsModal .command-function-row .theme-btn {
          width: 100%;
        }
        .command-input-sm {
          min-width: 130px;
          max-width: none;
        }
        #${WORKFLOW_MODAL_ID} .workflow-map-layout {
          grid-template-columns: 1fr;
          grid-auto-rows: auto 1fr;
        }
        #${WORKFLOW_MODAL_ID} .workflow-map-canvas,
        #${WORKFLOW_MODAL_ID} .workflow-map-canvas-wrap {
          min-height: 420px;
        }
        #${WORKFLOW_MODAL_ID} .workflow-node-menu-panel {
          min-width: 230px;
          max-width: calc(100% - 16px);
        }
      }
    `;

    document.head.appendChild(style);
  }

  function ensureModal() {
    let modal = document.getElementById(MODAL_ID);
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'theme-settings-modal';
    modal.innerHTML = `
      <div class="theme-settings-card" role="dialog" aria-modal="true" aria-labelledby="themeSettingsTitle">
        <div class="theme-settings-head">
          <h3 id="themeSettingsTitle">Tema del sistema</h3>
          <div class="theme-settings-tools">
            <button type="button" class="theme-settings-close" id="themeSettingsClose" aria-label="Cerrar">x</button>
          </div>
        </div>
        <div class="theme-settings-body">
          <div class="theme-settings-layout">
            <div class="theme-settings-quickrow">
              <div class="theme-field">
                <label for="themeMode">Modo</label>
                <select id="themeMode">
                  <option value="light">Claro</option>
                  <option value="dark">Oscuro</option>
                </select>
              </div>

              <div class="theme-field">
                <label for="themePresetCategory">Categoría de temas</label>
                <select id="themePresetCategory">
                  <option value="all">Todas</option>
                </select>
              </div>

              <div class="theme-field">
                <label for="themePreset">Tema de color</label>
                <select id="themePreset">
                  <option value="">Personalizado</option>
                </select>
              </div>

              <div class="theme-field">
                <label for="themeAlertPreset">Tema de alertas</label>
                <select id="themeAlertPreset"></select>
              </div>
            </div>

            <section class="theme-settings-section">
              <div class="theme-settings-section-head">
                <h4 class="theme-settings-section-title">Colores Base</h4>
                <span class="theme-settings-inline-note">Cabecera y fondo general</span>
              </div>
              <div class="theme-settings-grid">
                <div class="theme-field">
                  <label for="themeHeaderColor">Header y sidebar</label>
                  <div class="theme-row">
                    <input type="text" id="themeHeaderColorText" maxlength="7" placeholder="#3f4d98">
                    <input type="color" id="themeHeaderColor" value="#3f4d98">
                  </div>
                </div>

                <div class="theme-field">
                  <label for="themeHeaderTextColor">Texto en header/sidebar</label>
                  <div class="theme-row">
                    <input type="text" id="themeHeaderTextColorText" maxlength="7" placeholder="#ffffff">
                    <input type="color" id="themeHeaderTextColor" value="#ffffff">
                  </div>
                </div>

                <div class="theme-field">
                  <label for="themeBodyColor">Body</label>
                  <div class="theme-row">
                    <input type="text" id="themeBodyColorText" maxlength="7" placeholder="#f8fafc">
                    <input type="color" id="themeBodyColor" value="#f8fafc">
                  </div>
                </div>

                <div class="theme-field">
                  <label for="themeTextColor">Texto global</label>
                  <div class="theme-row">
                    <input type="text" id="themeTextColorText" maxlength="7" placeholder="#111827">
                    <input type="color" id="themeTextColor" value="#111827">
                  </div>
                </div>
              </div>
            </section>

            <section class="theme-settings-section">
              <div class="theme-settings-section-head">
                <h4 class="theme-settings-section-title">Presets y Escala</h4>
                <span class="theme-settings-inline-note">Categorías, presets y tamaño base</span>
              </div>
              <div class="theme-settings-grid">
                <div class="theme-field theme-field-span-full">
                  <label for="themeFontSize">Tamaño base: <span id="themeFontSizeValue">14px</span></label>
                  <input type="range" id="themeFontSize" min="12" max="22" step="1" value="14">
                </div>

                <div class="theme-field theme-field-span-2cols">
                  <label for="themeSurfaceRadius">Radio global: <span id="themeSurfaceRadiusValue">12px</span></label>
                  <input type="range" id="themeSurfaceRadius" min="0" max="28" step="1" value="12">
                </div>

                <div class="theme-field theme-field-span-2cols">
                  <label for="themeTableLineWidth">Línea de tablas: <span id="themeTableLineWidthValue">1px</span></label>
                  <input type="range" id="themeTableLineWidth" min="0" max="5" step="1" value="1">
                </div>

                <div class="theme-field theme-field-span-full">
                  <label>Galería de presets</label>
                  <div id="themePresetGrid" class="theme-presets-grid"></div>
                </div>
              </div>
            </section>
          </div>
        </div>
        <div class="theme-settings-footer">
          <button type="button" class="theme-btn" id="themeResetBtn">Restablecer</button>
          <button type="button" class="theme-btn theme-btn-primary" id="themeCloseBtn">Cerrar</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    return modal;
  }

  function ensureCommandModal() {
    let modal = document.getElementById(COMMAND_MODAL_ID);
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = COMMAND_MODAL_ID;
    modal.className = 'theme-settings-modal';
    modal.innerHTML = `
      <div class="theme-settings-card" role="dialog" aria-modal="true" aria-labelledby="commandSettingsTitle">
        <div class="theme-settings-head">
          <h3 id="commandSettingsTitle">Comandos de voz</h3>
          <button type="button" class="theme-settings-close" id="commandSettingsCloseTop" aria-label="Cerrar">x</button>
        </div>
        <div class="theme-settings-body command-settings-sections">
          <details class="command-accordion" open>
            <summary>Agente y Voz de Charly</summary>
            <div class="command-accordion-body">
              <div class="command-voice-grid">
                <div class="theme-field command-compact-field command-toggle-field">
                  <label for="voiceAgentEnabledToggle">Agente de voz</label>
                  <label class="cmd-switch" title="Activar o desactivar agente de voz">
                    <input type="checkbox" id="voiceAgentEnabledToggle">
                    <span class="cmd-switch-track"><span class="cmd-switch-thumb"></span></span>
                  </label>
                  <small>Activo: procesa comandos</small>
                </div>
                <div class="theme-field command-compact-field">
                  <label for="commandCharlyVoiceName">Voz de Charly (Gemini TTS)</label>
                  <select id="commandCharlyVoiceName"></select>
                </div>
                <div class="theme-field command-compact-field">
                  <label for="commandCharlyVoicePreset">Preset de voz</label>
                  <select id="commandCharlyVoicePreset"></select>
                </div>
                <div class="theme-field command-compact-field">
                  <label for="commandCharlyVoiceMood">Mood de voz</label>
                  <select id="commandCharlyVoiceMood"></select>
                </div>
                <div class="theme-field command-compact-field">
                  <label for="commandCharlyVoiceLocale">Idioma/Pais del agente</label>
                  <select id="commandCharlyVoiceLocale"></select>
                </div>
                <div class="theme-field command-range-field">
                  <label for="commandCharlyVoiceSpeed">Velocidad: <span id="commandCharlyVoiceSpeedValue">1.00x</span></label>
                  <input type="range" id="commandCharlyVoiceSpeed" min="0.75" max="1.35" step="0.05" value="1.00">
                </div>
                <div class="theme-field command-range-field">
                  <label for="commandCharlyVoicePitch">Tono: <span id="commandCharlyVoicePitchValue">0.95</span></label>
                  <input type="range" id="commandCharlyVoicePitch" min="0.75" max="1.20" step="0.05" value="0.95">
                </div>
              </div>
              <div class="command-voice-grid" style="margin-top:14px; padding-top:14px; border-top:1px solid rgba(148,163,184,.25);">
                <div class="theme-field command-compact-field command-toggle-field">
                  <label for="commandLecturaUseCharlyVoice">Lecturas con voz del agente</label>
                  <label class="cmd-switch" title="Usar la misma voz configurada para Charly al leer lecturas">
                    <input type="checkbox" id="commandLecturaUseCharlyVoice">
                    <span class="cmd-switch-track"><span class="cmd-switch-thumb"></span></span>
                  </label>
                  <small>Si se desactiva, puedes configurar una voz especial para lecturas.</small>
                </div>
                <div class="theme-field command-compact-field">
                  <label for="commandLecturaVoiceName">Voz de lectura (Gemini TTS)</label>
                  <select id="commandLecturaVoiceName"></select>
                </div>
                <div class="theme-field command-compact-field">
                  <label for="commandLecturaVoiceMood">Tono/Sentimiento de lectura</label>
                  <select id="commandLecturaVoiceMood"></select>
                </div>
                <div class="theme-field command-compact-field">
                  <label for="commandLecturaVoiceLocale">Idioma/Pais de lectura</label>
                  <select id="commandLecturaVoiceLocale"></select>
                </div>
                <div class="theme-field command-range-field">
                  <label for="commandLecturaVoiceSpeed">Velocidad lectura: <span id="commandLecturaVoiceSpeedValue">0.94x</span></label>
                  <input type="range" id="commandLecturaVoiceSpeed" min="0.75" max="1.35" step="0.05" value="0.94">
                </div>
                <div class="theme-field command-range-field">
                  <label for="commandLecturaVoicePitch">Tono lectura: <span id="commandLecturaVoicePitchValue">0.92</span></label>
                  <input type="range" id="commandLecturaVoicePitch" min="0.75" max="1.20" step="0.05" value="0.92">
                </div>
              </div>
            </div>
          </details>

          <details class="command-accordion">
            <summary>Funciones Personalizadas</summary>
            <div class="command-accordion-body">
              <div class="command-function-row">
                <div class="theme-field">
                  <label for="customFunctionName">Nueva función</label>
                  <input type="text" id="customFunctionName" placeholder="Nombre de función personalizada">
                </div>
                <div class="theme-field">
                  <label for="customFunctionBase">Acción base de la función</label>
                  <select id="customFunctionBase"></select>
                </div>
                <button type="button" class="theme-btn" id="commandAddFunctionBtn">Agregar</button>
              </div>
              <div class="theme-field theme-field-span-2">
                <div id="customFunctionList" style="display:grid; gap:6px; margin-top:8px;"></div>
              </div>
            </div>
          </details>

          <details class="command-accordion">
            <summary>Acciones Rápidas</summary>
            <div class="command-accordion-body">
              <div class="theme-field theme-field-span-2">
                <label for="nextActionPresetsInput">Acciones rápidas globales de "Luego"</label>
                <textarea id="nextActionPresetsInput" class="command-regex-input" rows="4" placeholder="Grupo|Etiqueta|Accion&#10;Dictado|Dictar instrucciones Gemini|dictar instrucciones gemini"></textarea>
                <small>Formato por línea: Grupo|Etiqueta|Acción. Se guarda en configuración y aplica a todas las filas.</small>
              </div>
            </div>
          </details>

          <details class="command-accordion" open>
            <summary>Tabla de Comandos</summary>
            <div class="command-accordion-body">
              <div class="theme-field theme-field-span-2">
                <label>Configura regex por comando (deja vacío para usar regex por defecto). En cada columna "Luego N": usa "cmd:clave", "fn|target|valor", "ask:pregunta" o "cualquiera".</label>
              </div>
              <div class="command-function-row">
                <div class="theme-field">
                  <label>Columnas "Luego" para workflow</label>
                  <small id="nextStepColumnsCount">0 columnas</small>
                </div>
                <button type="button" class="theme-btn" id="nextStepColumnAddBtn">Agregar columna Luego</button>
                <button type="button" class="theme-btn" id="nextStepColumnRemoveBtn">Quitar última columna</button>
              </div>
              <div id="commandRegexConflictAlert" class="command-conflict-alert" role="status" aria-live="polite"></div>
              <div class="command-settings-table-wrap">
                <table class="command-settings-table">
                  <thead>
                    <tr id="voiceCommandHeaderRow"></tr>
                  </thead>
                  <tbody id="voiceCommandRows"></tbody>
                </table>
              </div>
            </div>
          </details>

          <details class="command-accordion">
            <summary>Debug JSON</summary>
            <div class="command-accordion-body">
              <div class="theme-field theme-field-span-2">
                <label for="voiceCommandJsonPreview">Vista JSON guardada (debug)</label>
                <textarea id="voiceCommandJsonPreview" class="command-regex-input" rows="8" readonly style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;"></textarea>
              </div>
            </div>
          </details>
        </div>
        <div class="theme-settings-footer">
          <button type="button" class="theme-btn" id="commandSettingsAddBtn">Nuevo comando</button>
          <button type="button" class="theme-btn" id="commandSettingsResetBtn">Restablecer</button>
          <button type="button" class="theme-btn theme-btn-primary" id="commandSettingsSaveBtn">Guardar</button>
          <button type="button" class="theme-btn" id="commandSettingsCloseBtn">Cerrar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function ensureWorkflowMapModal() {
    let modal = document.getElementById(WORKFLOW_MODAL_ID);
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = WORKFLOW_MODAL_ID;
    modal.className = 'theme-settings-modal';
    modal.innerHTML = `
      <div class="theme-settings-card" role="dialog" aria-modal="true" aria-labelledby="workflowMapTitle">
        <div class="theme-settings-head">
          <h3 id="workflowMapTitle">Workflow visual</h3>
          <button type="button" class="theme-settings-close" id="workflowMapCloseTop" aria-label="Cerrar">x</button>
        </div>
        <div class="theme-settings-body">
          <div class="workflow-map-layout">
            <aside class="workflow-map-controls">
              <div class="theme-field">
                <label for="workflowMapNodeSelect">Añadir función al mapa</label>
                <select id="workflowMapNodeSelect"></select>
              </div>
              <div class="theme-field">
                <label for="workflowMapCustomSpec">o acción personalizada</label>
                <input type="text" id="workflowMapCustomSpec" class="command-regex-input" placeholder="cmd:clave | ask:... | fn|target|valor">
              </div>
              <button type="button" class="theme-btn" id="workflowMapAddNodeBtn">Añadir nodo</button>
              <button type="button" class="theme-btn" id="workflowMapConnectModeBtn">Modo conectar (drag)</button>
              <div class="workflow-map-controls-row">
                <button type="button" class="theme-btn" id="workflowMapConnectBtn">Conectar seleccionados</button>
                <button type="button" class="theme-btn" id="workflowMapDisconnectBtn">Desconectar</button>
              </div>
              <div class="workflow-map-controls-row">
                <button type="button" class="theme-btn" id="workflowMapDeleteNodeBtn">Eliminar nodo</button>
                <button type="button" class="theme-btn" id="workflowMapAutoLayoutBtn">Auto layout</button>
              </div>
              <button type="button" class="theme-btn" id="workflowMapPlayBtn">Play workflow</button>
              <div class="workflow-play-delay">
                <div class="workflow-play-delay-head">
                  <span>Velocidad de prueba</span>
                  <strong id="workflowMapPlayDelayValue">${WORKFLOW_PLAY_STEP_DELAY_MS} ms</strong>
                </div>
                <input
                  type="range"
                  id="workflowMapPlayDelay"
                  min="${WORKFLOW_PLAY_DELAY_MIN_MS}"
                  max="${WORKFLOW_PLAY_DELAY_MAX_MS}"
                  step="80"
                  value="${WORKFLOW_PLAY_STEP_DELAY_MS}">
              </div>
              <div class="theme-field">
                <label for="workflowMapEdgeLabelInput">Etiqueta del conector</label>
                <input type="text" id="workflowMapEdgeLabelInput" class="command-regex-input" placeholder="Sí, No, Cancelar, Error, Luego 1, esperar respuesta">
              </div>
              <button type="button" class="theme-btn" id="workflowMapApplyEdgeLabelBtn">Aplicar etiqueta a conector</button>
              <p class="workflow-map-help">Tip: activa "Modo conectar (drag)" y arrastra desde un nodo a otro para crear el flujo. Etiqueta conectores con la respuesta esperada (ej. "asc", "nuevas con charly", "sí", "no") y agrega "esperar respuesta" para pausar hasta que el usuario responda.</p>
              <div class="workflow-response-panel" id="workflowMapResponsePanel" aria-live="assertive">
                <small id="workflowMapResponsePrompt">Esperando respuesta del usuario...</small>
                <div class="workflow-response-options" id="workflowMapResponseOptions"></div>
              </div>
              <small class="workflow-status" id="workflowMapStatus">Selecciona 2 nodos para conectar o un conector para editar etiqueta/desconectar.</small>
              <div class="workflow-run-log" id="workflowMapRunLog" aria-live="polite"></div>
            </aside>
            <section class="workflow-map-canvas-wrap">
              <div id="workflowMapCanvas" class="workflow-map-canvas"></div>
              <div id="workflowNodeMenusLayer" class="workflow-node-menus-layer" aria-hidden="true"></div>
              <div id="workflowNodeMenuPanel" class="workflow-node-menu-panel" role="dialog" aria-label="Cambiar función del nodo">
                <label for="workflowNodeFunctionSelect">Función del nodo</label>
                <select id="workflowNodeFunctionSelect"></select>
                <div class="workflow-node-menu-actions">
                  <button type="button" class="theme-btn theme-btn-primary" id="workflowNodeMenuApplyBtn">Aplicar</button>
                  <button type="button" class="theme-btn" id="workflowNodeMenuReverseEdgeBtn">Girar flecha</button>
                  <button type="button" class="theme-btn" id="workflowNodeMenuCloseBtn">Cerrar</button>
                </div>
              </div>
            </section>
          </div>
        </div>
        <div class="theme-settings-footer">
          <button type="button" class="theme-btn theme-btn-primary" id="workflowMapSaveBtn">Guardar workflow</button>
          <button type="button" class="theme-btn" id="workflowMapCloseBtn">Cerrar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function renderVoiceCommandRows(payload = {}) {
    const tbody = document.getElementById('voiceCommandRows');
    if (!tbody) return;
    const normalized = normalizeVoiceCommandPayload(payload);
    const meta = normalized.meta || normalizeVoiceCommandMeta({});
    renderVoiceCommandTableHeader(meta);
    const settings = normalized.commands || {};
    const catalogMap = getVoiceCommandCatalogMap();
    const baseRows = VOICE_COMMAND_CATALOG
      .filter((cmd) => !(settings?.[cmd.key]?.deleted === true))
      .map((cmd) => buildVoiceCommandRow(cmd, settings?.[cmd.key] || {}, true, false, meta, settings));
    const customRows = Object.entries(settings || {})
      .filter(([key, val]) => !catalogMap[key] && val && typeof val === 'object' && val.deleted !== true)
      .map(([key, val]) => buildVoiceCommandRow({
        key,
        section: val.section || 'Personalizado',
        fn: val.fn || '_clickButtonById',
        target: val.target || '',
        name: val.name || key,
        defaultRegex: val.regex || ''
      }, val, true, true, meta, settings));
    tbody.innerHTML = `${baseRows.join('')}${customRows.join('')}`;
    renderRegexConflictWarnings();
  }

  function renderCustomFunctionList(meta = {}) {
    const list = document.getElementById('customFunctionList');
    if (!list) return;
    const custom = Array.isArray(meta?.customFunctions) ? meta.customFunctions : [];
    if (!custom.length) {
      list.innerHTML = '<small>Sin funciones personalizadas.</small>';
      return;
    }
    list.innerHTML = custom.map((fn) => `
      <div data-fn-id="${escapeHtml(fn.id)}" style="display:flex; align-items:center; justify-content:space-between; gap:8px; border:1px solid #cbd5e1; border-radius:8px; padding:6px 8px;">
        <span><strong>${escapeHtml(fn.label)}</strong> -> ${escapeHtml(fn.baseFn)}</span>
        <button type="button" class="theme-btn" data-fn-delete="${escapeHtml(fn.id)}">Eliminar</button>
      </div>
    `).join('');
  }

  function normText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function parseRegexPhrases(regexText = '') {
    const raw = String(regexText || '').trim();
    if (!raw) return [];
    const hasSeparators = /[,;\n]/.test(raw);
    const hasMeta = /[()[\]{}+*^$|\\]/.test(raw);
    if (hasSeparators && !hasMeta) {
      return raw.split(/[\n,;]+/g).map((s) => normText(s)).filter(Boolean);
    }
    return [normText(raw)];
  }

  function renderRegexConflictWarnings() {
    const rows = Array.from(document.querySelectorAll('#voiceCommandRows tr[data-cmd-key]'));
    const alertEl = document.getElementById('commandRegexConflictAlert');
    rows.forEach((r) => {
      r.classList.remove('command-conflict-row');
      r.removeAttribute('data-conflict-msg');
      r.removeAttribute('title');
      const note = r.querySelector('[data-cmd-conflict-note]');
      if (note) {
        note.textContent = '';
        note.classList.remove('is-visible');
      }
    });
    if (!rows.length) {
      if (alertEl) {
        alertEl.classList.remove('is-visible');
        alertEl.textContent = '';
      }
      return;
    }

    const entries = rows.map((row) => {
      const key = row.getAttribute('data-cmd-key') || '';
      const enabled = !!row.querySelector('[data-cmd-enabled]')?.checked;
      const fn = normText(row.querySelector('[data-cmd-fn]')?.value || '');
      const target = normText(row.querySelector('[data-cmd-target]')?.value || '');
      const regex = String(row.querySelector('[data-cmd-regex]')?.value || '').trim();
      const phrases = parseRegexPhrases(regex);
      return { key, row, enabled, fn, target, regex, phrases };
    });

    const conflicts = [];
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const a = entries[i];
        const b = entries[j];
        if (!a.enabled || !b.enabled) continue;
        if (!a.regex || !b.regex) continue;
        const sameFn = a.fn && b.fn && a.fn === b.fn;
        if (!sameFn) continue;
        const sameRegex = normText(a.regex) === normText(b.regex);
        const phraseOverlap = a.phrases.some((p) => b.phrases.includes(p));
        const includesOverlap =
          normText(a.regex).length > 8 &&
          normText(b.regex).length > 8 &&
          (normText(a.regex).includes(normText(b.regex)) || normText(b.regex).includes(normText(a.regex)));
        if (sameRegex || phraseOverlap || includesOverlap) {
          const sameTarget = a.target && b.target && a.target === b.target;
          const reasonCore = sameRegex
            ? 'regex idéntico'
            : (phraseOverlap ? 'frases solapadas' : 'patrones muy similares');
          const reason = sameTarget
            ? `${reasonCore} (mismo elemento)`
            : `${reasonCore} (podría disparar otro comando)`;
          conflicts.push({ a, b, reason });
        }
      }
    }

    if (!conflicts.length) {
      if (alertEl) {
        alertEl.classList.remove('is-visible');
        alertEl.textContent = '';
      }
      return;
    }

    const keysWarn = new Set();
    conflicts.forEach(({ a, b, reason }) => {
      [a, b].forEach((it) => {
        it.row.classList.add('command-conflict-row');
        it.row.setAttribute('data-conflict-msg', reason);
        it.row.title = `Posible conflicto: ${reason}`;
        const note = it.row.querySelector('[data-cmd-conflict-note]');
        if (note) {
          note.textContent = `⚠ Posible conflicto: ${reason}`;
          note.classList.add('is-visible');
        }
        keysWarn.add(it.key);
      });
    });

    if (alertEl) {
      alertEl.textContent = `Alerta: hay ${keysWarn.size} comando(s) con regex potencialmente conflictivo. Revisa filas marcadas en naranja.`;
      alertEl.classList.add('is-visible');
    }
  }

  function readColorFromPair(textInput, colorInput, fallback) {
    const textValue = String(textInput.value || '').trim();
    if (isValidHexColor(textValue)) return textValue;

    const colorValue = String(colorInput.value || '').trim();
    if (isValidHexColor(colorValue)) return colorValue;

    return fallback;
  }

  function syncColorPair(value, textInput, colorInput) {
    textInput.value = value;
    colorInput.value = value;
  }

  function populatePresetCategorySelect(selectEl) {
    if (!selectEl) return;
    const options = THEME_PRESET_CATEGORY_OPTIONS.map((category) =>
      `<option value="${category.id}">${category.label} (${category.count})</option>`
    ).join('');
    selectEl.innerHTML = `<option value="all">Todas las categorías (${Object.keys(PRESET_THEMES).length})</option>${options}`;
  }

  function populatePresetSelect(selectEl, categoryId = 'all') {
    if (!selectEl) return;
    const options = getThemePresetEntries(categoryId).map(([id, preset]) => {
      const category = getThemePresetCategoryMeta(preset.category);
      const suffix = category ? ` · ${category.label}` : '';
      return `<option value="${id}">${preset.label}${suffix}</option>`;
    }).join('');
    selectEl.innerHTML = `<option value="">Personalizado</option>${options}`;
  }

  function getPresetCategoryFromPresetId(presetId = '') {
    const preset = getPresetTheme(presetId);
    return String(preset?.category || 'all');
  }

  function renderPresetGrid(gridEl, categoryId = 'all') {
    if (!gridEl) return;
    gridEl.innerHTML = getThemePresetEntries(categoryId).map(([id, preset]) => {
      const category = getThemePresetCategoryMeta(preset.category);
      return `
      <button type="button" class="theme-preset-btn" data-theme-preset="${id}">
        <span class="theme-preset-category">${escapeHtml(category?.label || 'Tema')}</span>
        <span class="theme-preset-label">${escapeHtml(preset.label)}</span>
        <span class="theme-preset-colors" aria-hidden="true">
          <span class="theme-preset-color" style="background:${preset.headerColor};"></span>
          <span class="theme-preset-color" style="background:${preset.bodyColor};"></span>
          <span class="theme-preset-color" style="background:${preset.textColor};"></span>
        </span>
      </button>
    `;
    }).join('');
  }

  function populateAlertPresetSelect(selectEl) {
    if (!selectEl) return;
    const options = Object.entries(ALERT_PRESETS).map(([id, preset]) =>
      `<option value="${id}">${preset.label}</option>`
    ).join('');
    selectEl.innerHTML = options;
  }

  function populateCharlyVoiceSelect(selectEl) {
    if (!selectEl) return;
    const maleOptions = GEMINI_TTS_VOICE_OPTIONS_MALE.map((voice) =>
      `<option value="${voice}">${voice}</option>`
    ).join('');
    const femaleOptions = GEMINI_TTS_VOICE_OPTIONS_FEMALE.map((voice) =>
      `<option value="${voice}">${voice}</option>`
    ).join('');
    selectEl.innerHTML = `
      <optgroup label="Masculinas">${maleOptions}</optgroup>
      <optgroup label="Femeninas">${femaleOptions}</optgroup>
    `;
  }

  function populateCharlyMoodSelect(selectEl) {
    if (!selectEl) return;
    selectEl.innerHTML = CHARLY_MOOD_OPTIONS.map((m) =>
      `<option value="${m.value}">${m.label}</option>`
    ).join('');
  }

  function populateCharlyLocaleSelect(selectEl) {
    if (!selectEl) return;
    selectEl.innerHTML = CHARLY_LOCALE_OPTIONS.map((it) =>
      `<option value="${it.value}">${it.label}</option>`
    ).join('');
  }

  function populateCharlyVoicePresetSelect(selectEl) {
    if (!selectEl) return;
    const options = Object.entries(CHARLY_VOICE_PRESETS).map(([id, p]) =>
      `<option value="${id}">${p.label}</option>`
    ).join('');
    selectEl.innerHTML = `<option value="custom">Personalizado</option>${options}`;
  }

  function applyCharlyVoicePreset(currentSettings, presetId) {
    const preset = CHARLY_VOICE_PRESETS[presetId];
    if (!preset) return { ...currentSettings, charlyVoicePreset: 'custom' };
    return {
      ...currentSettings,
      charlyVoicePreset: presetId,
      charlyVoiceName: preset.voiceName,
      charlyVoiceMood: preset.mood,
      charlyVoiceLocale: preset.locale || DEFAULT_CHARLY_VOICE_LOCALE,
      charlyVoiceSpeed: preset.speed,
      charlyVoicePitch: preset.pitch
    };
  }

  function refreshPresetCatalogUI(controls, categoryId = 'all', selectedPresetId = '') {
    const activeCategory = String(categoryId || 'all').trim() || 'all';
    if (controls.presetCategorySelect) controls.presetCategorySelect.value = activeCategory;
    populatePresetSelect(controls.presetSelect, activeCategory);
    renderPresetGrid(controls.presetGrid, activeCategory);
    syncPresetUI(controls, selectedPresetId);
  }

  function syncPresetUI(controls, presetId) {
    const categoryId = controls.presetCategorySelect?.dataset.activeCategory
      || (presetId ? getPresetCategoryFromPresetId(presetId) : (controls.presetCategorySelect?.value || 'all'));
    if (controls.presetCategorySelect && categoryId) {
      controls.presetCategorySelect.value = categoryId;
    }
    if (controls.presetSelect) {
      const optionExists = Array.from(controls.presetSelect.options).some((opt) => opt.value === (presetId || ''));
      controls.presetSelect.value = optionExists ? (presetId || '') : '';
    }
    if (!controls.presetGrid) return;
    controls.presetGrid.querySelectorAll('[data-theme-preset]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.themePreset === (presetId || ''));
    });
  }

  function syncInputs(settings, controls) {
    const preferredCategory = controls.presetCategorySelect?.dataset.activeCategory
      || (settings.preset ? getPresetCategoryFromPresetId(settings.preset) : 'all');
    refreshPresetCatalogUI(controls, preferredCategory, settings.preset || '');
    controls.mode.value = settings.mode;
    syncColorPair(settings.headerColor, controls.headerColorText, controls.headerColor);
    syncColorPair(settings.headerTextColor, controls.headerTextColorText, controls.headerTextColor);
    syncColorPair(settings.bodyColor, controls.bodyColorText, controls.bodyColor);
    syncColorPair(settings.textColor, controls.textColorText, controls.textColor);
    controls.alertPreset.value = settings.alertPreset || DEFAULT_ALERT_PRESET_ID;
    if (controls.charlyVoiceName) {
      controls.charlyVoiceName.value = settings.charlyVoiceName || DEFAULT_CHARLY_VOICE_NAME;
    }
    if (controls.charlyVoicePreset) {
      controls.charlyVoicePreset.value = settings.charlyVoicePreset || DEFAULT_CHARLY_VOICE_PRESET;
    }
    if (controls.charlyVoiceMood) {
      controls.charlyVoiceMood.value = settings.charlyVoiceMood || DEFAULT_CHARLY_VOICE_MOOD;
    }
    if (controls.charlyVoiceLocale) {
      controls.charlyVoiceLocale.value = settings.charlyVoiceLocale || DEFAULT_CHARLY_VOICE_LOCALE;
    }
    if (controls.charlyVoiceSpeed) {
      controls.charlyVoiceSpeed.value = String(settings.charlyVoiceSpeed ?? DEFAULT_CHARLY_VOICE_SPEED);
      controls.charlyVoiceSpeedValue.textContent = `${Number(settings.charlyVoiceSpeed ?? DEFAULT_CHARLY_VOICE_SPEED).toFixed(2)}x`;
    }
    if (controls.charlyVoicePitch) {
      controls.charlyVoicePitch.value = String(settings.charlyVoicePitch ?? DEFAULT_CHARLY_VOICE_PITCH);
      controls.charlyVoicePitchValue.textContent = Number(settings.charlyVoicePitch ?? DEFAULT_CHARLY_VOICE_PITCH).toFixed(2);
    }
    controls.fontSize.value = String(settings.fontSize);
    controls.fontSizeValue.textContent = `${settings.fontSize}px`;
    controls.surfaceRadius.value = String(settings.surfaceRadius ?? 12);
    controls.surfaceRadiusValue.textContent = `${settings.surfaceRadius ?? 12}px`;
    controls.tableLineWidth.value = String(settings.tableLineWidth ?? 1);
    controls.tableLineWidthValue.textContent = `${settings.tableLineWidth ?? 1}px`;
  }

  function closeModal(modal) {
    modal.classList.remove('is-open');
    try {
      window.dispatchEvent(new CustomEvent('cb-ui-modal-closed', {
        detail: { id: modal?.id || '' }
      }));
    } catch (_) {
      // noop
    }
  }

  function openModal(modal) {
    modal.classList.add('is-open');
  }

  function initThemeManager() {
    ensureStyles();
    forceVoiceCommandsFactoryResetOnce();
    forceSyncResourceRegexFromSystemOnce();
    forceSyncLecturaActionRegexFromSystemOnce();
    ensureVoiceCommandDefaultsSeeded();
    if (document.body) {
      const currentBodyPage = normalizePageId(document.body.dataset.page || '');
      document.body.dataset.page = currentBodyPage || CURRENT_PAGE;
    }

    let settings = loadSettings();
    applySettings(settings);

    const trigger = document.getElementById(OPEN_LINK_ID);
    const modal = ensureModal();
    const commandModal = COMMAND_SETTINGS_ENABLED ? ensureCommandModal() : null;
    const workflowModal = COMMAND_SETTINGS_ENABLED ? ensureWorkflowMapModal() : null;

    const controls = {
      mode: document.getElementById('themeMode'),
      presetCategorySelect: document.getElementById('themePresetCategory'),
      presetSelect: document.getElementById('themePreset'),
      presetGrid: document.getElementById('themePresetGrid'),
      headerColor: document.getElementById('themeHeaderColor'),
      headerColorText: document.getElementById('themeHeaderColorText'),
      headerTextColor: document.getElementById('themeHeaderTextColor'),
      headerTextColorText: document.getElementById('themeHeaderTextColorText'),
      bodyColor: document.getElementById('themeBodyColor'),
      bodyColorText: document.getElementById('themeBodyColorText'),
      textColor: document.getElementById('themeTextColor'),
      textColorText: document.getElementById('themeTextColorText'),
      alertPreset: document.getElementById('themeAlertPreset'),
      fontSize: document.getElementById('themeFontSize'),
      fontSizeValue: document.getElementById('themeFontSizeValue'),
      surfaceRadius: document.getElementById('themeSurfaceRadius'),
      surfaceRadiusValue: document.getElementById('themeSurfaceRadiusValue'),
      tableLineWidth: document.getElementById('themeTableLineWidth'),
      tableLineWidthValue: document.getElementById('themeTableLineWidthValue'),
      resetBtn: document.getElementById('themeResetBtn'),
      closeBtn: document.getElementById('themeCloseBtn'),
      topCloseBtn: document.getElementById('themeSettingsClose')
    };

    const commandControls = {
      openBtn: document.getElementById('themeCommandSettingsModalBtn'),
      directOpenBtn: document.getElementById(COMMAND_OPEN_LINK_ID),
      closeTopBtn: document.getElementById('commandSettingsCloseTop'),
      closeBtn: document.getElementById('commandSettingsCloseBtn'),
      saveBtn: document.getElementById('commandSettingsSaveBtn'),
      resetBtn: document.getElementById('commandSettingsResetBtn'),
      addBtn: document.getElementById('commandSettingsAddBtn'),
      agentEnabled: document.getElementById('voiceAgentEnabledToggle'),
      customFunctionName: document.getElementById('customFunctionName'),
      customFunctionBase: document.getElementById('customFunctionBase'),
      customFunctionAddBtn: document.getElementById('commandAddFunctionBtn'),
      customFunctionList: document.getElementById('customFunctionList'),
      nextActionPresetsInput: document.getElementById('nextActionPresetsInput'),
      nextStepColumnsCount: document.getElementById('nextStepColumnsCount'),
      nextStepColumnAddBtn: document.getElementById('nextStepColumnAddBtn'),
      nextStepColumnRemoveBtn: document.getElementById('nextStepColumnRemoveBtn'),
      jsonPreview: document.getElementById('voiceCommandJsonPreview'),
      charlyVoiceName: document.getElementById('commandCharlyVoiceName'),
      charlyVoicePreset: document.getElementById('commandCharlyVoicePreset'),
      charlyVoiceMood: document.getElementById('commandCharlyVoiceMood'),
      charlyVoiceLocale: document.getElementById('commandCharlyVoiceLocale'),
      charlyVoiceSpeed: document.getElementById('commandCharlyVoiceSpeed'),
      charlyVoiceSpeedValue: document.getElementById('commandCharlyVoiceSpeedValue'),
      charlyVoicePitch: document.getElementById('commandCharlyVoicePitch'),
      charlyVoicePitchValue: document.getElementById('commandCharlyVoicePitchValue'),
      lecturaUseCharlyVoice: document.getElementById('commandLecturaUseCharlyVoice'),
      lecturaVoiceName: document.getElementById('commandLecturaVoiceName'),
      lecturaVoiceMood: document.getElementById('commandLecturaVoiceMood'),
      lecturaVoiceLocale: document.getElementById('commandLecturaVoiceLocale'),
      lecturaVoiceSpeed: document.getElementById('commandLecturaVoiceSpeed'),
      lecturaVoiceSpeedValue: document.getElementById('commandLecturaVoiceSpeedValue'),
      lecturaVoicePitch: document.getElementById('commandLecturaVoicePitch'),
      lecturaVoicePitchValue: document.getElementById('commandLecturaVoicePitchValue')
    };
    const workflowControls = {
      closeTopBtn: document.getElementById('workflowMapCloseTop'),
      closeBtn: document.getElementById('workflowMapCloseBtn'),
      saveBtn: document.getElementById('workflowMapSaveBtn'),
      addNodeSelect: document.getElementById('workflowMapNodeSelect'),
      customSpecInput: document.getElementById('workflowMapCustomSpec'),
      addNodeBtn: document.getElementById('workflowMapAddNodeBtn'),
      connectModeBtn: document.getElementById('workflowMapConnectModeBtn'),
      connectBtn: document.getElementById('workflowMapConnectBtn'),
      disconnectBtn: document.getElementById('workflowMapDisconnectBtn'),
      deleteNodeBtn: document.getElementById('workflowMapDeleteNodeBtn'),
      autoLayoutBtn: document.getElementById('workflowMapAutoLayoutBtn'),
      playBtn: document.getElementById('workflowMapPlayBtn'),
      playDelayInput: document.getElementById('workflowMapPlayDelay'),
      playDelayValue: document.getElementById('workflowMapPlayDelayValue'),
      edgeLabelInput: document.getElementById('workflowMapEdgeLabelInput'),
      applyEdgeLabelBtn: document.getElementById('workflowMapApplyEdgeLabelBtn'),
      responsePanel: document.getElementById('workflowMapResponsePanel'),
      responsePrompt: document.getElementById('workflowMapResponsePrompt'),
      responseOptions: document.getElementById('workflowMapResponseOptions'),
      runLog: document.getElementById('workflowMapRunLog'),
      nodeMenusLayer: document.getElementById('workflowNodeMenusLayer'),
      nodeMenuPanel: document.getElementById('workflowNodeMenuPanel'),
      nodeMenuSelect: document.getElementById('workflowNodeFunctionSelect'),
      nodeMenuApplyBtn: document.getElementById('workflowNodeMenuApplyBtn'),
      nodeMenuReverseEdgeBtn: document.getElementById('workflowNodeMenuReverseEdgeBtn'),
      nodeMenuCloseBtn: document.getElementById('workflowNodeMenuCloseBtn'),
      status: document.getElementById('workflowMapStatus'),
      canvas: document.getElementById('workflowMapCanvas'),
      title: document.getElementById('workflowMapTitle')
    };
    let deletedSystemCommandKeys = new Set();

    populatePresetCategorySelect(controls.presetCategorySelect);
    controls.presetCategorySelect.dataset.activeCategory = settings.preset
      ? getPresetCategoryFromPresetId(settings.preset)
      : 'all';
    populatePresetSelect(controls.presetSelect, controls.presetCategorySelect.dataset.activeCategory);
    populateAlertPresetSelect(controls.alertPreset);
    renderPresetGrid(controls.presetGrid, controls.presetCategorySelect.dataset.activeCategory);
    syncInputs(settings, controls);
    populateCharlyVoiceSelect(commandControls.charlyVoiceName);
    populateCharlyVoiceSelect(commandControls.lecturaVoiceName);
    populateCharlyVoicePresetSelect(commandControls.charlyVoicePreset);
    populateCharlyMoodSelect(commandControls.charlyVoiceMood);
    populateCharlyMoodSelect(commandControls.lecturaVoiceMood);
    populateCharlyLocaleSelect(commandControls.charlyVoiceLocale);
    populateCharlyLocaleSelect(commandControls.lecturaVoiceLocale);
    if (commandControls.customFunctionBase) {
      commandControls.customFunctionBase.innerHTML = renderVoiceFunctionOptionsHtml({}, '', false);
    }

    function syncCommandVoiceInputs(currentSettings) {
      if (!commandControls) return;
      if (commandControls.charlyVoiceName) {
        commandControls.charlyVoiceName.value = currentSettings.charlyVoiceName || DEFAULT_CHARLY_VOICE_NAME;
      }
      if (commandControls.charlyVoicePreset) {
        commandControls.charlyVoicePreset.value = currentSettings.charlyVoicePreset || DEFAULT_CHARLY_VOICE_PRESET;
      }
      if (commandControls.charlyVoiceMood) {
        commandControls.charlyVoiceMood.value = currentSettings.charlyVoiceMood || DEFAULT_CHARLY_VOICE_MOOD;
      }
      if (commandControls.charlyVoiceLocale) {
        commandControls.charlyVoiceLocale.value = currentSettings.charlyVoiceLocale || DEFAULT_CHARLY_VOICE_LOCALE;
      }
      if (commandControls.charlyVoiceSpeed) {
        const spd = Number(currentSettings.charlyVoiceSpeed ?? DEFAULT_CHARLY_VOICE_SPEED);
        commandControls.charlyVoiceSpeed.value = String(spd);
        if (commandControls.charlyVoiceSpeedValue) {
          commandControls.charlyVoiceSpeedValue.textContent = `${spd.toFixed(2)}x`;
        }
      }
      if (commandControls.charlyVoicePitch) {
        const p = Number(currentSettings.charlyVoicePitch ?? DEFAULT_CHARLY_VOICE_PITCH);
        commandControls.charlyVoicePitch.value = String(p);
        if (commandControls.charlyVoicePitchValue) {
          commandControls.charlyVoicePitchValue.textContent = p.toFixed(2);
        }
      }
      if (commandControls.lecturaUseCharlyVoice) {
        commandControls.lecturaUseCharlyVoice.checked = currentSettings.lecturaUseCharlyVoice === true;
      }
      if (commandControls.lecturaVoiceName) {
        commandControls.lecturaVoiceName.value = currentSettings.lecturaVoiceName || DEFAULT_LECTURA_VOICE_NAME;
      }
      if (commandControls.lecturaVoiceMood) {
        commandControls.lecturaVoiceMood.value = currentSettings.lecturaVoiceMood || DEFAULT_LECTURA_VOICE_MOOD;
      }
      if (commandControls.lecturaVoiceLocale) {
        commandControls.lecturaVoiceLocale.value = currentSettings.lecturaVoiceLocale || DEFAULT_LECTURA_VOICE_LOCALE;
      }
      if (commandControls.lecturaVoiceSpeed) {
        const spdLect = Number(currentSettings.lecturaVoiceSpeed ?? DEFAULT_LECTURA_VOICE_SPEED);
        commandControls.lecturaVoiceSpeed.value = String(spdLect);
        if (commandControls.lecturaVoiceSpeedValue) {
          commandControls.lecturaVoiceSpeedValue.textContent = `${spdLect.toFixed(2)}x`;
        }
      }
      if (commandControls.lecturaVoicePitch) {
        const pLect = Number(currentSettings.lecturaVoicePitch ?? DEFAULT_LECTURA_VOICE_PITCH);
        commandControls.lecturaVoicePitch.value = String(pLect);
        if (commandControls.lecturaVoicePitchValue) {
          commandControls.lecturaVoicePitchValue.textContent = pLect.toFixed(2);
        }
      }
      const lecturaDisabled = currentSettings.lecturaUseCharlyVoice === true;
      [
        commandControls.lecturaVoiceName,
        commandControls.lecturaVoiceMood,
        commandControls.lecturaVoiceLocale,
        commandControls.lecturaVoiceSpeed,
        commandControls.lecturaVoicePitch
      ].forEach((el) => {
        if (el) el.disabled = lecturaDisabled;
      });
    }
    syncCommandVoiceInputs(settings);

    function persistAndApply(nextSettings) {
      settings = normalizeSettings(nextSettings);
      applySettings(settings);
      saveSettings(settings);
      syncInputs(settings, controls);
      syncCommandVoiceInputs(settings);
    }

    function collectVoiceCommandSettings() {
      const currentPayload = loadVoiceCommandSettings();
      const currentMeta = normalizeVoiceCommandMeta(currentPayload.meta);
      const catalogMap = getVoiceCommandCatalogMap();
      const table = document.querySelector('#commandSettingsModal .command-settings-table');
      const nextStepColumns = clamp(
        Number(table?.dataset?.nextStepColumns || currentMeta.nextStepColumns || NEXT_STEP_COLUMNS_DEFAULT),
        NEXT_STEP_COLUMNS_MIN,
        NEXT_STEP_COLUMNS_MAX
      );
      const out = {};
      deletedSystemCommandKeys.forEach((key) => {
        if (!catalogMap[key]) return;
        out[key] = { deleted: true };
      });
      const rows = Array.from(document.querySelectorAll('#voiceCommandRows tr[data-cmd-key]'));
      rows.forEach((row) => {
        const key = row.getAttribute('data-cmd-key') || '';
        if (!key) return;
        const enabled = !!row.querySelector('[data-cmd-enabled]')?.checked;
        const fn = String(row.querySelector('[data-cmd-fn]')?.value || '').trim();
        const speak = !!row.querySelector('[data-cmd-speak]')?.checked;
        const target = String(row.querySelector('[data-cmd-target]')?.value || '').trim();
        const name = String(row.querySelector('[data-cmd-name]')?.value || '').trim();
        const regex = String(row.querySelector('[data-cmd-regex]')?.value || '').trim();
        const currentSaved = currentPayload?.commands?.[key] && typeof currentPayload.commands[key] === 'object'
          ? currentPayload.commands[key]
          : {};
        const stepSelects = Array.from(row.querySelectorAll('[data-cmd-next-step]'))
          .sort((a, b) => Number(a.getAttribute('data-cmd-next-step') || '0') - Number(b.getAttribute('data-cmd-next-step') || '0'));
        const nextStepsRaw = stepSelects.map((select) => String(select?.value || '').trim());
        const nextSteps = nextStepsRaw.filter(Boolean);
        const next = nextSteps.join(' >> ');
        const base = catalogMap[key] || null;
        const savedComparableSteps = resolveNextStepValues(
          currentSaved,
          currentSaved,
          Math.max(nextStepsRaw.length, 1)
        )
          .slice(0, nextStepsRaw.length)
          .map((item) => String(item || '').trim());
        const tableComparableSteps = nextStepsRaw.map((item) => String(item || '').trim());
        const chainComparableSaved = parseNextChainSteps(currentSaved?.next || '').join(' >> ');
        const chainComparableNext = nextSteps.join(' >> ');
        const hasTableStepChanges = (
          savedComparableSteps.length !== tableComparableSteps.length
          || savedComparableSteps.some((value, index) => value !== tableComparableSteps[index])
          || chainComparableSaved !== chainComparableNext
        );
        const rowOut = {
          ...currentSaved,
          enabled,
          speak,
          regex,
          next,
          next_steps: nextSteps,
          next_yes: String(currentSaved?.next_yes || '').trim(),
          next_no: String(currentSaved?.next_no || '').trim(),
          next_cancel: String(currentSaved?.next_cancel || '').trim(),
          next_error: String(currentSaved?.next_error || '').trim(),
          fn: fn || base?.fn || '',
          target: target || base?.target || '',
          name: name || base?.name || key,
          section: base?.section || String(currentSaved?.section || 'Personalizado').trim() || 'Personalizado',
          custom: base ? false : currentSaved?.custom !== false,
          deleted: false
        };
        Object.keys(rowOut).forEach((field) => {
          if (/^next_step_\d+$/.test(field)) delete rowOut[field];
        });
        nextStepsRaw.forEach((stepValue, index) => {
          rowOut[`next_step_${index + 1}`] = stepValue;
        });
        if (hasTableStepChanges && Object.prototype.hasOwnProperty.call(rowOut, 'workflow_graph')) {
          delete rowOut.workflow_graph;
        }
        out[key] = rowOut;
      });
      const isAgentEnabled = (() => {
        const control = commandControls.agentEnabled;
        if (!control) return true;
        if (control instanceof HTMLInputElement && control.type === 'checkbox') return !!control.checked;
        return (control.value || 'on') === 'on';
      })();
      return {
        meta: {
          ...currentMeta,
          agentEnabled: isAgentEnabled,
          nextActionPresets: parseNextActionPresetsText(commandControls.nextActionPresetsInput?.value || ''),
          nextStepColumns
        },
        commands: out
      };
    }

    function updateFromInputs() {
      persistAndApply({
        preset: '',
        mode: controls.mode.value === 'dark' ? 'dark' : 'light',
        headerColor: readColorFromPair(controls.headerColorText, controls.headerColor, settings.headerColor),
        headerTextColor: readColorFromPair(controls.headerTextColorText, controls.headerTextColor, settings.headerTextColor),
        bodyColor: readColorFromPair(controls.bodyColorText, controls.bodyColor, settings.bodyColor),
        textColor: readColorFromPair(controls.textColorText, controls.textColor, settings.textColor),
        alertPreset: controls.alertPreset.value || settings.alertPreset || DEFAULT_ALERT_PRESET_ID,
        charlyVoiceName: (controls.charlyVoiceName?.value || settings.charlyVoiceName || DEFAULT_CHARLY_VOICE_NAME),
        charlyVoicePreset: 'custom',
        charlyVoiceMood: (controls.charlyVoiceMood?.value || settings.charlyVoiceMood || DEFAULT_CHARLY_VOICE_MOOD),
        charlyVoiceLocale: (controls.charlyVoiceLocale?.value || settings.charlyVoiceLocale || DEFAULT_CHARLY_VOICE_LOCALE),
        charlyVoiceSpeed: Number(controls.charlyVoiceSpeed?.value || settings.charlyVoiceSpeed || DEFAULT_CHARLY_VOICE_SPEED),
        charlyVoicePitch: Number(controls.charlyVoicePitch?.value || settings.charlyVoicePitch || DEFAULT_CHARLY_VOICE_PITCH),
        fontSize: Number(controls.fontSize.value || settings.fontSize),
        surfaceRadius: Number(controls.surfaceRadius?.value || settings.surfaceRadius || 12),
        tableLineWidth: Number(controls.tableLineWidth?.value || settings.tableLineWidth || 1)
      });
    }

    if (trigger) {
      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        openModal(modal);
      });
    }

    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal(modal);
    });

    controls.topCloseBtn.addEventListener('click', () => closeModal(modal));
    controls.closeBtn.addEventListener('click', () => closeModal(modal));

    if (COMMAND_SETTINGS_ENABLED && commandModal) {
      const updateVoiceJsonPreview = (payload = null) => {
        if (!commandControls.jsonPreview) return;
        const data = normalizeVoiceCommandPayload(payload || collectVoiceCommandSettings());
        commandControls.jsonPreview.value = JSON.stringify(data, null, 2);
      };
      const persistVoiceEditorDraft = () => {
        const payload = collectVoiceCommandSettings();
        saveVoiceCommandSettings(payload);
        updateVoiceJsonPreview(payload);
      };
      const _deepCloneVoiceCommandRow = (row = null) => {
        if (!row || typeof row !== 'object') return null;
        try {
          return JSON.parse(JSON.stringify(row));
        } catch (_) {
          return { ...row };
        }
      };
      const _buildDuplicatedCommandKey = (sourceKey = '', commands = {}, catalogMap = {}) => {
        const rawBase = String(sourceKey || 'comando').trim().toLowerCase();
        const base = rawBase
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          || 'comando';
        let candidate = `${base}_copia`;
        let idx = 2;
        while (
          (commands && Object.prototype.hasOwnProperty.call(commands, candidate))
          || (catalogMap && Object.prototype.hasOwnProperty.call(catalogMap, candidate))
        ) {
          candidate = `${base}_copia_${idx}`;
          idx += 1;
        }
        return candidate;
      };
      const duplicateVoiceCommandByKey = (sourceKey = '') => {
        const key = String(sourceKey || '').trim();
        if (!key) return;
        const draftPayload = collectVoiceCommandSettings();
        const savedPayload = normalizeVoiceCommandPayload(loadVoiceCommandSettings());
        const catalogMap = getVoiceCommandCatalogMap();
        const commands = (draftPayload?.commands && typeof draftPayload.commands === 'object')
          ? { ...draftPayload.commands }
          : {};
        const sourceDraft = commands?.[key] && typeof commands[key] === 'object'
          ? commands[key]
          : null;
        const sourceSaved = savedPayload?.commands?.[key] && typeof savedPayload.commands[key] === 'object'
          ? savedPayload.commands[key]
          : null;
        const source = sourceDraft || sourceSaved;
        if (!source) return;

        const newKey = _buildDuplicatedCommandKey(key, commands, catalogMap);
        const duplicate = _deepCloneVoiceCommandRow(source) || {};
        const sourceName = String(source?.name || key).trim() || key;
        duplicate.name = `${sourceName} (copia)`;
        duplicate.custom = true;
        duplicate.deleted = false;
        duplicate.section = String(duplicate.section || source?.section || 'Personalizado').trim() || 'Personalizado';
        if (!duplicate.workflow_graph && sourceSaved?.workflow_graph && typeof sourceSaved.workflow_graph === 'object') {
          duplicate.workflow_graph = _deepCloneVoiceCommandRow(sourceSaved.workflow_graph) || sourceSaved.workflow_graph;
        }
        commands[newKey] = duplicate;
        draftPayload.commands = commands;
        saveVoiceCommandSettings(draftPayload);
        renderVoiceCommandRows(draftPayload);
        const meta = normalizeVoiceCommandMeta(draftPayload.meta);
        refreshCommandFunctionSelectors(meta);
        refreshNextPresetSelectsFromCurrent();
        renderRegexConflictWarnings();
        updateVoiceJsonPreview(draftPayload);
        updateNextStepColumnsBadge(meta.nextStepColumns);
      };
      const refreshNextPresetSelectsFromCurrent = () => {
        const payload = collectVoiceCommandSettings();
        const meta = normalizeVoiceCommandMeta(payload.meta);
        const commands = payload.commands || {};
        const rows = Array.from(document.querySelectorAll('#voiceCommandRows tr[data-cmd-key]'));
        rows.forEach((row) => {
          const selects = Array.from(row.querySelectorAll('[data-cmd-next-step]'));
          selects.forEach((select) => {
            const prev = String(select.value || '').trim();
            select.innerHTML = renderNextPresetOptionsHtml(meta, prev, commands);
            if (prev && Array.from(select.options).some((opt) => opt.value === prev)) {
              select.value = prev;
            }
          });
        });
      };

      const refreshCommandFunctionSelectors = (meta) => {
        const rows = Array.from(document.querySelectorAll('#voiceCommandRows tr[data-cmd-key]'));
        rows.forEach((row) => {
          const select = row.querySelector('[data-cmd-fn]');
          if (!select) return;
          const prev = String(select.value || '').trim();
          select.innerHTML = renderVoiceFunctionOptionsHtml(meta, prev, true);
          if (prev && Array.from(select.options).some((opt) => opt.value === prev)) {
            select.value = prev;
          }
        });
        if (commandControls.customFunctionBase) {
          const prevBase = String(commandControls.customFunctionBase.value || '').trim();
          commandControls.customFunctionBase.innerHTML = renderVoiceFunctionOptionsHtml(meta, prevBase, false);
          if (prevBase && Array.from(commandControls.customFunctionBase.options).some((opt) => opt.value === prevBase)) {
            commandControls.customFunctionBase.value = prevBase;
          }
        }
      };
      const getCurrentNextStepColumns = () => {
        const table = document.querySelector('#commandSettingsModal .command-settings-table');
        return clamp(
          Number(table?.dataset?.nextStepColumns || NEXT_STEP_COLUMNS_DEFAULT),
          NEXT_STEP_COLUMNS_MIN,
          NEXT_STEP_COLUMNS_MAX
        );
      };
      const updateNextStepColumnsBadge = (columns = null) => {
        const safeColumns = clamp(
          Number(columns || getCurrentNextStepColumns()),
          NEXT_STEP_COLUMNS_MIN,
          NEXT_STEP_COLUMNS_MAX
        );
        if (commandControls.nextStepColumnsCount) {
          commandControls.nextStepColumnsCount.textContent = `${safeColumns} columnas`;
        }
        if (commandControls.nextStepColumnRemoveBtn) {
          commandControls.nextStepColumnRemoveBtn.disabled = safeColumns <= NEXT_STEP_COLUMNS_MIN;
        }
        if (commandControls.nextStepColumnAddBtn) {
          commandControls.nextStepColumnAddBtn.disabled = safeColumns >= NEXT_STEP_COLUMNS_MAX;
        }
      };
      const setNextStepColumns = (nextCount) => {
        const wanted = clamp(Number(nextCount || NEXT_STEP_COLUMNS_DEFAULT), NEXT_STEP_COLUMNS_MIN, NEXT_STEP_COLUMNS_MAX);
        const payload = collectVoiceCommandSettings();
        const meta = normalizeVoiceCommandMeta(payload.meta);
        meta.nextStepColumns = wanted;
        payload.meta = meta;
        renderVoiceCommandRows(payload);
        refreshCommandFunctionSelectors(meta);
        refreshNextPresetSelectsFromCurrent();
        renderRegexConflictWarnings();
        persistVoiceEditorDraft();
        updateNextStepColumnsBadge(wanted);
      };
      const workflowState = {
        commandKey: '',
        rootNodeId: '',
        cy: null,
        nodeCounter: 0,
        edgehandles: null,
        connectModeEnabled: false,
        payloadSnapshot: null,
        metaSnapshot: null,
        activeMenuNodeId: '',
        playbackToken: 0,
        playbackRunning: false,
        playbackLog: [],
        pendingResponseRequest: null
      };
      const waitForMs = (ms = 0) => new Promise((resolve) => {
        window.setTimeout(resolve, Math.max(0, Number(ms) || 0));
      });
      const setWorkflowStatus = (message = '', isError = false) => {
        if (!workflowControls.status) return;
        workflowControls.status.textContent = String(message || '').trim();
        workflowControls.status.classList.toggle('is-error', !!isError);
      };
      const getWorkflowPlaybackDelayMs = () => {
        return clamp(
          Number(workflowControls.playDelayInput?.value || WORKFLOW_PLAY_STEP_DELAY_MS),
          WORKFLOW_PLAY_DELAY_MIN_MS,
          WORKFLOW_PLAY_DELAY_MAX_MS
        );
      };
      const updateWorkflowPlayDelayBadge = () => {
        if (!workflowControls.playDelayValue) return;
        workflowControls.playDelayValue.textContent = `${getWorkflowPlaybackDelayMs()} ms`;
      };
      const clearWorkflowRunLog = () => {
        workflowState.playbackLog = [];
        if (workflowControls.runLog) workflowControls.runLog.innerHTML = '';
      };
      const appendWorkflowRunLog = (message = '', kind = 'info') => {
        const lineText = String(message || '').trim();
        if (!lineText) return;
        workflowState.playbackLog.push({ at: Date.now(), kind, message: lineText });
        if (!workflowControls.runLog) return;
        const line = document.createElement('div');
        line.className = `workflow-run-log-line${kind === 'error' ? ' is-error' : (kind === 'ok' ? ' is-ok' : '')}`;
        line.textContent = lineText;
        workflowControls.runLog.appendChild(line);
        workflowControls.runLog.scrollTop = workflowControls.runLog.scrollHeight;
      };
      const normalizeWorkflowBranchToken = (value = '') => {
        return String(value || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim();
      };
      const stripWorkflowResponseHintFromLabel = (label = '') => {
        return String(label || '')
          .replace(/\b(?:esperar\s*(?:respuesta|si\/?no|sí\/?no|confirmaci[oó]n)|wait\s*response)\b/ig, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      };
      const workflowOutcomeLabel = (outcome = 'ok') => {
        const raw = String(outcome || '').trim().toLowerCase();
        if (raw === 'si') return 'Sí';
        if (raw === 'no') return 'No';
        if (raw === 'cancelar') return 'Cancelar';
        if (raw === 'error') return 'Error';
        return 'OK';
      };
      const normalizeWorkflowResponseChoice = (value = '', options = {}) => {
        const allowCustom = options?.allowCustom !== false;
        const raw = normalizeWorkflowBranchToken(value);
        if (!raw) return '';
        if (/(^|\b)(si|yes|afirm)(\b|$)/i.test(raw)) return 'si';
        if (/(^|\b)(no|neg)(\b|$)/i.test(raw)) return 'no';
        if (/(^|\b)(cancel|abort|stop)(\b|$)/i.test(raw)) return 'cancelar';
        if (/(^|\b)(error|fail|falla|fallo)(\b|$)/i.test(raw)) return 'error';
        if (/(^|\b)(ok|exito)(\b|$)/i.test(raw)) return 'ok';
        if (!allowCustom) return '';
        return raw;
      };
      const renderWorkflowResponseOptions = (choices = []) => {
        if (!workflowControls.responseOptions) return;
        const normalizedChoices = Array.isArray(choices)
          ? choices
            .map((choice) => ({
              value: String(choice?.value || '').trim(),
              label: String(choice?.label || '').trim()
            }))
            .filter((choice) => !!choice.value)
          : [];
        const fallbackChoices = [
          { value: 'si', label: 'Sí' },
          { value: 'no', label: 'No' },
          { value: 'cancelar', label: 'Cancelar' },
          { value: 'error', label: 'Error' }
        ];
        const safeChoices = normalizedChoices.length ? normalizedChoices : fallbackChoices;
        workflowControls.responseOptions.innerHTML = '';
        safeChoices.forEach((choice, index) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `theme-btn${index === 0 ? ' theme-btn-primary' : ''}`;
          btn.setAttribute('data-workflow-response', choice.value);
          btn.textContent = choice.label || choice.value;
          workflowControls.responseOptions.appendChild(btn);
        });
      };
      const resolveWorkflowResponseRequest = (value = '') => {
        const request = workflowState.pendingResponseRequest;
        if (!request) return;
        workflowState.pendingResponseRequest = null;
        if (workflowControls.responsePanel) {
          workflowControls.responsePanel.classList.remove('is-open');
        }
        request.resolve(normalizeWorkflowResponseChoice(value, { allowCustom: true }));
      };
      const requestWorkflowResponseChoice = async (promptText = '', runToken = 0, choices = [], options = {}) => {
        const speakPrompt = options?.speakPrompt === true;
        const nodeLabel = String(options?.nodeLabel || '').trim();
        const safeChoices = Array.isArray(choices)
          ? choices
            .map((choice) => ({
              value: normalizeWorkflowResponseChoice(choice?.value || choice?.label || '', { allowCustom: true }),
              label: String(choice?.label || choice?.value || '').trim()
            }))
            .filter((choice) => !!choice.value)
          : [];
        const optionsHint = safeChoices.map((choice) => choice.label || choice.value).join(' / ');
        const prompt = String(promptText || '').trim() || `Esperando respuesta del usuario (${optionsHint || 'continuar'}).`;
        if (!workflowControls.responsePanel || !workflowControls.responsePrompt) {
          const defaultValue = safeChoices[0]?.value || 'si';
          const entered = window.prompt(
            `${prompt}\nOpciones: ${optionsHint || 'si, no, cancelar, error'}`,
            defaultValue
          );
          return normalizeWorkflowResponseChoice(entered, { allowCustom: true });
        }
        renderWorkflowResponseOptions(safeChoices);
        return new Promise((resolve) => {
          if (runToken !== workflowState.playbackToken || !workflowState.playbackRunning) {
            resolve('');
            return;
          }
          workflowState.pendingResponseRequest = { runToken, resolve, choices: safeChoices };
          workflowControls.responsePrompt.textContent = prompt;
          workflowControls.responsePanel.classList.add('is-open');
          try {
            const bridge = window.cbVoiceWorkflowBridge;
            if (speakPrompt && bridge && typeof bridge.speakPlaybackPrompt === 'function') {
              bridge.speakPlaybackPrompt({
                nodeLabel: nodeLabel || promptText,
                fallbackPrompt: prompt,
                choices: safeChoices
              }).catch(() => {});
            }
            if (bridge && typeof bridge.waitForPlaybackResponse === 'function') {
              bridge.waitForPlaybackResponse({
                timeoutMs: 26000,
                choices: safeChoices
              }).then((payload) => {
                if (runToken !== workflowState.playbackToken || !workflowState.playbackRunning) return;
                const rawValue = String(payload?.value || '').trim();
                const normalizedVoice = normalizeWorkflowResponseChoice(rawValue, { allowCustom: true });
                if (!normalizedVoice) return;
                resolveWorkflowResponseRequest(normalizedVoice);
              }).catch(() => {});
            }
          } catch (_) {}
        });
      };
      const setWorkflowPlayButtonState = () => {
        if (!workflowControls.playBtn) return;
        workflowControls.playBtn.classList.toggle('workflow-btn-active', !!workflowState.playbackRunning);
        workflowControls.playBtn.textContent = workflowState.playbackRunning
          ? 'Detener prueba'
          : 'Play workflow';
      };
      const clearWorkflowPlaybackHighlights = () => {
        if (!workflowState.cy) return;
        workflowState.cy.nodes().removeClass('wf-play-current wf-play-done wf-play-error');
        workflowState.cy.edges().removeClass('wf-play-current wf-play-done wf-play-error');
      };
      const stopWorkflowPlayback = (announce = false) => {
        const wasRunning = !!workflowState.playbackRunning;
        workflowState.playbackToken += 1;
        workflowState.playbackRunning = false;
        try {
          const bridge = window.cbVoiceWorkflowBridge;
          if (bridge && typeof bridge.stopPlaybackAudio === 'function') bridge.stopPlaybackAudio();
          if (bridge && typeof bridge.setPlaybackMode === 'function') bridge.setPlaybackMode(false);
        } catch (_) {}
        resolveWorkflowResponseRequest('');
        clearWorkflowPlaybackHighlights();
        setWorkflowPlayButtonState();
        if (announce && wasRunning) {
          setWorkflowStatus('Prueba de workflow detenida.', false);
          appendWorkflowRunLog('Prueba detenida por el usuario.', 'error');
        }
      };
      const closeWorkflowNodeMenuPanel = () => {
        workflowState.activeMenuNodeId = '';
        if (workflowControls.nodeMenuPanel) {
          workflowControls.nodeMenuPanel.classList.remove('is-open');
          workflowControls.nodeMenuPanel.style.left = '';
          workflowControls.nodeMenuPanel.style.top = '';
        }
      };
      const destroyWorkflowGraph = () => {
        stopWorkflowPlayback(false);
        if (workflowState.edgehandles && typeof workflowState.edgehandles.destroy === 'function') {
          workflowState.edgehandles.destroy();
        }
        workflowState.edgehandles = null;
        workflowState.connectModeEnabled = false;
        workflowState.payloadSnapshot = null;
        workflowState.metaSnapshot = null;
        closeWorkflowNodeMenuPanel();
        if (workflowControls.nodeMenusLayer) workflowControls.nodeMenusLayer.innerHTML = '';
        if (workflowState.cy && typeof workflowState.cy.destroy === 'function') {
          workflowState.cy.destroy();
        }
        workflowState.cy = null;
        if (workflowControls.connectModeBtn) {
          workflowControls.connectModeBtn.classList.remove('workflow-btn-active');
          workflowControls.connectModeBtn.textContent = 'Modo conectar (drag)';
        }
        if (workflowControls.edgeLabelInput) {
          workflowControls.edgeLabelInput.value = '';
        }
        if (workflowControls.responsePanel) {
          workflowControls.responsePanel.classList.remove('is-open');
        }
        workflowState.pendingResponseRequest = null;
        setWorkflowPlayButtonState();
      };
      const commandNameByKey = (payload = {}, key = '') => {
        const k = String(key || '').trim();
        if (!k) return '';
        const row = payload?.commands?.[k];
        if (row && typeof row === 'object') {
          return String(row.name || '').trim() || k;
        }
        const base = getVoiceCommandCatalogMap()[k];
        return String(base?.name || '').trim() || k;
      };
      const labelForWorkflowSpec = (spec = '', payload = {}) => {
        const raw = String(spec || '').trim();
        if (!raw) return '(vacío)';
        if (/^cmd:/i.test(raw)) {
          const key = raw.replace(/^cmd:/i, '').trim();
          return `cmd:${commandNameByKey(payload, key)}`;
        }
        if (/^ask:/i.test(raw)) {
          const question = raw.replace(/^ask:/i, '').trim();
          return `ask: ${question || 'pregunta'}`;
        }
        if (/^workflow:/i.test(raw)) return raw;
        if (/^cualquiera$/i.test(raw)) return 'cualquiera';
        if (raw.includes('|')) {
          const [fnPart, targetPart] = raw.split('|');
          return `${String(fnPart || '').trim()} -> ${String(targetPart || '').trim() || '(target)'}`;
        }
        return raw;
      };
      const inferWorkflowNodeType = (spec = '', isRoot = false) => {
        if (isRoot) return 'root';
        const raw = String(spec || '').trim().toLowerCase();
        if (!raw) return 'step';
        if (raw === 'cualquiera' || raw.startsWith('ask:')) return 'decision';
        if (/wf_resultado_(ok|si|no|cancelar|error)\b/.test(raw)) return 'terminal';
        if (raw.startsWith('workflow:')) return 'subflow';
        return 'step';
      };
      const parseEdgeOrderFromLabel = (label = '') => {
        const m = String(label || '').match(/(?:luego|paso)\s*(\d+)/i);
        return m ? Number(m[1]) : Number.NaN;
      };
      const migrateWorkflowSpec = (spec = '', commandKey = '') => {
        const raw = String(spec || '').trim();
        if (!/^cmd:/i.test(raw)) return raw;
        const key = raw.replace(/^cmd:/i, '').trim();
        const owner = String(commandKey || '').trim();
        if (
          key === 'modal_lecturas_confirmar'
          && /^buscar_lecturas_(asc|nuevas)_charly$/i.test(owner)
        ) {
          return 'cmd:wf_buscar_lectura_paso_3';
        }
        return raw;
      };
      const sortWorkflowEdges = (edges = []) => {
        return [...edges].sort((a, b) => {
          const aOrder = parseEdgeOrderFromLabel(a?.data?.('label') || '');
          const bOrder = parseEdgeOrderFromLabel(b?.data?.('label') || '');
          const aHasOrder = Number.isFinite(aOrder);
          const bHasOrder = Number.isFinite(bOrder);
          if (aHasOrder && bHasOrder && aOrder !== bOrder) return aOrder - bOrder;
          if (aHasOrder && !bHasOrder) return -1;
          if (!aHasOrder && bHasOrder) return 1;
          const ay = Number(a?.target?.().position?.('y') || 0);
          const by = Number(b?.target?.().position?.('y') || 0);
          if (ay !== by) return ay - by;
          const ax = Number(a?.target?.().position?.('x') || 0);
          const bx = Number(b?.target?.().position?.('x') || 0);
          return ax - bx;
        });
      };
      const parseWorkflowOutcomeFromEdgeLabel = (label = '') => {
        const raw = normalizeWorkflowResponseChoice(stripWorkflowResponseHintFromLabel(label), { allowCustom: true });
        if (!raw) return { outcome: 'ok', explicit: false };
        if (raw === 'si') return { outcome: 'si', explicit: true };
        if (raw === 'no') return { outcome: 'no', explicit: true };
        if (raw === 'cancelar') return { outcome: 'cancelar', explicit: true };
        if (raw === 'error') return { outcome: 'error', explicit: true };
        if (raw === 'ok') return { outcome: 'ok', explicit: true };
        return { outcome: 'ok', explicit: false };
      };
      const edgeLabelRequiresUserResponse = (label = '') => {
        const raw = String(label || '').trim().toLowerCase();
        if (!raw) return false;
        return /(esperar\s*(respuesta|si\/?no|sí\/?no|confirmaci[oó]n)|wait\s*response)/i.test(raw);
      };
      const edgeLabelWorkflowDirectives = (label = '') => {
        const raw = String(label || '').trim().toLowerCase();
        if (!raw) return { speakPrompt: false, askOptions: false };
        const askOptions = /(solicitar\s+opciones|pedir\s+opciones|mostrar\s+opciones)/i.test(raw);
        const speakPrompt = askOptions || /(responder|live\s+de\s+responder|responder\s+live)/i.test(raw);
        return { speakPrompt, askOptions };
      };
      const executeWorkflowSpecForPlayback = async (spec = '', options = {}) => {
        const rawSpec = String(spec || '').trim();
        if (!rawSpec) {
          return { ok: false, code: 'empty_spec', message: 'Especificación vacía.' };
        }
        if (/^workflow:/i.test(rawSpec)) {
          return { ok: true, code: 'noop_workflow', message: 'Subflujo marcado como referencia.' };
        }
        if (/^(any|cualquiera|esperar(?:\s+instruccion|\s+instrucción)?)$/i.test(rawSpec)) {
          return { ok: true, code: 'noop_wait', message: 'Paso de espera.' };
        }
        const bridge = window.cbVoiceWorkflowBridge;
        if (!bridge || typeof bridge.executeSpec !== 'function') {
          return {
            ok: false,
            code: 'bridge_unavailable',
            message: 'No hay motor de ejecución real disponible en esta página.'
          };
        }
        try {
          const execution = await bridge.executeSpec(rawSpec, {
            resultado: String(options?.outcome || 'ok').trim() || 'ok',
            source: 'workflow-play',
            followNext: false,
            edgeLabel: String(options?.edgeLabel || '').trim(),
            workflowCommandKey: String(options?.workflowCommandKey || '').trim()
          });
          if (execution && typeof execution === 'object') {
            return {
              ok: execution.ok !== false,
              code: String(execution.code || '').trim() || 'bridge_result',
              message: String(execution.message || '').trim()
            };
          }
          return { ok: !!execution, code: 'bridge_bool', message: '' };
        } catch (err) {
          return {
            ok: false,
            code: 'bridge_error',
            message: String(err?.message || 'Error ejecutando acción real.')
          };
        }
      };
      const collectWorkflowOutgoingTransitions = (nodeId = '') => {
        if (!workflowState.cy || !nodeId) return [];
        const node = workflowState.cy.getElementById(nodeId);
        if (!node || node.empty()) return [];
        return sortWorkflowEdges(node.outgoers('edge').toArray())
          .map((edge) => {
            const sourceId = String(edge?.source?.().id?.() || '').trim();
            const targetId = String(edge?.target?.().id?.() || '').trim();
            if (!sourceId || !targetId || targetId === workflowState.rootNodeId) return null;
            const label = String(edge?.data?.('label') || '').trim();
            const parsed = parseWorkflowOutcomeFromEdgeLabel(label);
            const cleanLabel = stripWorkflowResponseHintFromLabel(label);
            const defaultLabel = cleanLabel || label;
            const directives = edgeLabelWorkflowDirectives(label);
            return {
              edgeId: String(edge?.id?.() || '').trim(),
              sourceId,
              targetId,
              label,
              choiceLabel: defaultLabel,
              choiceToken: normalizeWorkflowResponseChoice(defaultLabel, { allowCustom: true }),
              outcome: parsed.outcome,
              explicitOutcome: parsed.explicit,
              requiresResponse: edgeLabelRequiresUserResponse(label),
              speakPrompt: directives.speakPrompt === true,
              askOptions: directives.askOptions === true
            };
          })
          .filter(Boolean);
      };
      const buildWorkflowResponseChoices = (outgoing = []) => {
        if (!Array.isArray(outgoing) || !outgoing.length) return [];
        if (outgoing.length === 1 && outgoing[0]?.askOptions) {
          const labelRaw = String(outgoing[0]?.label || '').trim();
          const candidateText = labelRaw.includes(':')
            ? labelRaw.split(':').slice(1).join(':')
            : labelRaw;
          const tokens = candidateText
            .split(/[,/|]|(?:\bo\b)|(?:\by\b)/i)
            .map((part) => normalizeWorkflowResponseChoice(part, { allowCustom: true }))
            .filter(Boolean);
          const unique = Array.from(new Set(tokens));
          if (unique.length >= 2) {
            return unique.map((value) => ({ value, label: value, edgeId: String(outgoing[0]?.edgeId || '').trim(), outcome: 'ok' }));
          }
        }
        const out = [];
        const usedValues = new Set();
        outgoing.forEach((step, index) => {
          let value = '';
          let label = '';
          if (step?.explicitOutcome) {
            value = String(step.outcome || '').trim().toLowerCase();
            label = workflowOutcomeLabel(value);
          } else {
            value = normalizeWorkflowResponseChoice(step?.choiceToken || step?.choiceLabel || step?.label || '', { allowCustom: true });
            label = String(step?.choiceLabel || step?.label || '').trim();
          }
          if (!value) value = `opcion_${index + 1}`;
          if (!label) label = `Opción ${index + 1}`;
          if (usedValues.has(value)) {
            value = `${value}_${index + 1}`;
          }
          usedValues.add(value);
          out.push({
            value,
            label,
            edgeId: String(step?.edgeId || '').trim(),
            outcome: String(step?.outcome || '').trim().toLowerCase() || 'ok'
          });
        });
        return out;
      };
      const pickWorkflowTransitionByOutcome = (outgoing = [], outcome = 'ok', choices = []) => {
        if (!Array.isArray(outgoing) || !outgoing.length) return null;
        const wanted = normalizeWorkflowResponseChoice(outcome, { allowCustom: true }) || 'ok';
        if (Array.isArray(choices) && choices.length) {
          const choice = choices.find((item) => String(item?.value || '').trim() === wanted);
          if (choice?.edgeId) {
            const exactEdge = outgoing.find((step) => step.edgeId === choice.edgeId);
            if (exactEdge) return exactEdge;
          }
        }
        const byChoiceToken = outgoing.find((step) => normalizeWorkflowResponseChoice(step?.choiceToken || '', { allowCustom: true }) === wanted);
        if (byChoiceToken) return byChoiceToken;
        const exact = outgoing.find((step) => step.explicitOutcome && step.outcome === wanted);
        if (exact) return exact;
        const compatible = outgoing.find((step) => step.outcome === wanted);
        if (compatible) return compatible;
        const responseTagged = outgoing.find((step) => step.requiresResponse);
        if (responseTagged) return responseTagged;
        return outgoing[0];
      };
      const runWorkflowPlayback = async () => {
        if (!workflowState.cy || !workflowState.rootNodeId) {
          setWorkflowStatus('Abre un workflow para ejecutar la prueba.', true);
          return;
        }
        const cy = workflowState.cy;
        const root = cy.getElementById(workflowState.rootNodeId);
        if (!root || root.empty()) {
          setWorkflowStatus('No se encontró nodo raíz para la prueba.', true);
          return;
        }
        const runToken = workflowState.playbackToken + 1;
        workflowState.playbackToken = runToken;
        workflowState.playbackRunning = true;
        const rootSpec = String(root.data('spec') || '').trim();
        const playbackCommandKey = /^cmd:/i.test(rootSpec)
          ? rootSpec.replace(/^cmd:/i, '').trim()
          : String(workflowState.commandKey || '').trim();
        try {
          const bridge = window.cbVoiceWorkflowBridge;
          if (bridge && typeof bridge.setPlaybackMode === 'function') bridge.setPlaybackMode(true);
        } catch (_) {}
        clearWorkflowRunLog();
        clearWorkflowPlaybackHighlights();
        if (workflowControls.responsePanel) workflowControls.responsePanel.classList.remove('is-open');
        setWorkflowPlayButtonState();
        root.addClass('wf-play-current');
        try {
          const rootLabel = String(root.data('label') || workflowState.rootNodeId).trim();
          setWorkflowStatus(`Play: iniciando en "${rootLabel}".`, false);
          appendWorkflowRunLog(`Inicio de prueba en "${rootLabel}".`, 'info');
          try {
            cy.animate({ center: { eles: root }, duration: 220 });
          } catch (_) {}
          await waitForMs(getWorkflowPlaybackDelayMs());
          if (runToken !== workflowState.playbackToken || !workflowState.playbackRunning) return;
          root.removeClass('wf-play-current').addClass('wf-play-done');
          let currentNodeId = workflowState.rootNodeId;
          let stepCounter = 0;
          let okCount = 0;
          let failCount = 0;
          const visitedEdges = new Set();
          const nodeVisits = new Map([[workflowState.rootNodeId, 1]]);
          const maxSteps = Math.max(12, cy.edges().length * 2);

          while (stepCounter < maxSteps) {
            if (runToken !== workflowState.playbackToken || !workflowState.playbackRunning) return;
            const outgoingRaw = collectWorkflowOutgoingTransitions(currentNodeId);
            const outgoing = outgoingRaw.filter((step) => !visitedEdges.has(step.edgeId));
            if (!outgoing.length) break;

            const source = cy.getElementById(currentNodeId);
            const sourceLabel = String(source?.data?.('label') || currentNodeId).trim();
            const requiresResponse = outgoing.length > 1 || outgoing.some((step) => step.requiresResponse || step.askOptions || step.speakPrompt);
            const speakPromptByLabel = outgoing.some((step) => step.speakPrompt === true);
            const responseChoices = buildWorkflowResponseChoices(outgoing);
            let chosenResponse = outgoing[0].outcome;
            if (requiresResponse) {
              const optionsHint = responseChoices.map((choice) => choice.label || choice.value).join(' / ');
              const prompt = `Nodo "${sourceLabel}": elige ${optionsHint || 'una opción'} para continuar.`;
              setWorkflowStatus(prompt, false);
              appendWorkflowRunLog(`⏸ Esperando respuesta en "${sourceLabel}" (${optionsHint || 'sin opciones'}).`, 'info');
              const answer = await requestWorkflowResponseChoice(prompt, runToken, responseChoices, {
                speakPrompt: speakPromptByLabel,
                nodeLabel: sourceLabel
              });
              if (runToken !== workflowState.playbackToken || !workflowState.playbackRunning) return;
              const normalized = normalizeWorkflowResponseChoice(answer, { allowCustom: true });
              if (!normalized) {
                setWorkflowStatus('Play detenido: no se recibió respuesta válida.', true);
                appendWorkflowRunLog('Detenido: respuesta inválida o vacía.', 'error');
                return;
              }
              chosenResponse = normalized;
              appendWorkflowRunLog(`Respuesta capturada: ${chosenResponse}.`, 'info');
            }

            const step = pickWorkflowTransitionByOutcome(outgoing, chosenResponse, responseChoices);
            if (!step) break;
            const chosenOutcome = String(step.outcome || 'ok').trim().toLowerCase() || 'ok';
            stepCounter += 1;
            visitedEdges.add(step.edgeId);
            const edge = cy.getElementById(step.edgeId);
            const target = cy.getElementById(step.targetId);
            const sourceNode = cy.getElementById(step.sourceId);
            if (!edge || edge.empty() || !target || target.empty()) continue;
            cy.elements('.wf-play-current').removeClass('wf-play-current');
            if (sourceNode && !sourceNode.empty()) sourceNode.addClass('wf-play-done');
            edge.addClass('wf-play-current');
            target.addClass('wf-play-current');
            const targetLabel = String(target.data('label') || target.id()).trim();
            const stepHint = step.label ? ` [${step.label}]` : '';
            const spec = String(target.data('spec') || '').trim();
            setWorkflowStatus(`Play ${stepCounter}${stepHint}: ejecutando ${targetLabel}...`, false);
            appendWorkflowRunLog(`▶ Paso ${stepCounter}: ${sourceLabel} -> ${targetLabel}${stepHint}`, 'info');
            try {
              const focus = cy.collection().merge(edge).merge(target);
              if (sourceNode && !sourceNode.empty()) focus.merge(sourceNode);
              cy.animate({ fit: { eles: focus, padding: 120 }, duration: 240 });
            } catch (_) {}

            const executionResult = await executeWorkflowSpecForPlayback(spec, {
              outcome: chosenOutcome,
              edgeLabel: step.label,
              workflowCommandKey: playbackCommandKey
            });
            if (runToken !== workflowState.playbackToken || !workflowState.playbackRunning) return;
            if (!executionResult.ok) {
              failCount += 1;
              edge.removeClass('wf-play-current').addClass('wf-play-error');
              target.removeClass('wf-play-current').addClass('wf-play-error');
              const errorMsg = executionResult.message || 'la acción devolvió error.';
              setWorkflowStatus(`Play ${stepCounter}${stepHint}: fallo en ${targetLabel} (${errorMsg})`, true);
              appendWorkflowRunLog(`✖ Paso ${stepCounter}: ${targetLabel} -> ${errorMsg}`, 'error');
              if (executionResult.code === 'bridge_unavailable') {
                setWorkflowStatus(`Play detenido: ${errorMsg}`, true);
                appendWorkflowRunLog('Detenido: motor real no disponible.', 'error');
                return;
              }
              await waitForMs(Math.max(300, Math.round(getWorkflowPlaybackDelayMs() * 0.55)));
            } else {
              okCount += 1;
              edge.removeClass('wf-play-current').addClass('wf-play-done');
              target.removeClass('wf-play-current').addClass('wf-play-done');
              const successHint = executionResult.message ? ` (${executionResult.message})` : '';
              setWorkflowStatus(`Play ${stepCounter}${stepHint}: ${targetLabel} OK${successHint}`, false);
              appendWorkflowRunLog(`✔ Paso ${stepCounter}: ${targetLabel} OK${successHint}`, 'ok');
              await waitForMs(getWorkflowPlaybackDelayMs());
            }
            currentNodeId = step.targetId;
            const visits = Number(nodeVisits.get(currentNodeId) || 0) + 1;
            nodeVisits.set(currentNodeId, visits);
            if (visits > 3) {
              appendWorkflowRunLog(`⚠ Bucle detectado en "${targetLabel}". Se corta la prueba.`, 'error');
              break;
            }
          }

          if (stepCounter === 0) {
            setWorkflowStatus('Play completado: el flujo no tiene conectores desde la raíz.', false);
            appendWorkflowRunLog('No hay conectores salientes desde la raíz.', 'info');
            return;
          }
          if (runToken !== workflowState.playbackToken || !workflowState.playbackRunning) return;
          if (failCount > 0) {
            setWorkflowStatus(`Play completado con errores: ${okCount} OK, ${failCount} fallo(s). Revisa el log.`, true);
            appendWorkflowRunLog(`Resumen: ${okCount} OK, ${failCount} fallo(s).`, 'error');
          } else {
            setWorkflowStatus(`Play completado: ${okCount} acción(es) ejecutadas correctamente.`, false);
            appendWorkflowRunLog(`Resumen: ${okCount} acción(es) ejecutadas correctamente.`, 'ok');
          }
        } finally {
          try {
            const bridge = window.cbVoiceWorkflowBridge;
            if (bridge && typeof bridge.setPlaybackMode === 'function') bridge.setPlaybackMode(false);
          } catch (_) {}
          if (runToken === workflowState.playbackToken) {
            workflowState.playbackRunning = false;
            if (workflowControls.responsePanel) workflowControls.responsePanel.classList.remove('is-open');
            setWorkflowPlayButtonState();
          }
        }
      };
      const syncWorkflowConnectModeUi = () => {
        if (!workflowControls.connectModeBtn) return;
        workflowControls.connectModeBtn.classList.toggle('workflow-btn-active', !!workflowState.connectModeEnabled);
        workflowControls.connectModeBtn.textContent = workflowState.connectModeEnabled
          ? 'Modo conectar activo'
          : 'Modo conectar (drag)';
      };
      const syncWorkflowEdgeLabelInput = () => {
        if (!workflowControls.edgeLabelInput || !workflowState.cy) return;
        const selectedEdge = workflowState.cy.edges(':selected')[0];
        if (!selectedEdge) {
          workflowControls.edgeLabelInput.value = '';
          return;
        }
        workflowControls.edgeLabelInput.value = String(selectedEdge.data('label') || '').trim();
      };
      const _escapeOptionHtml = (value = '') => escapeHtml(String(value == null ? '' : value));
      const buildWorkflowFunctionOptions = () => {
        const payload = workflowState.payloadSnapshot || collectVoiceCommandSettings();
        const meta = normalizeVoiceCommandMeta(workflowState.metaSnapshot || payload?.meta || {});
        const commands = payload?.commands && typeof payload.commands === 'object'
          ? payload.commands
          : {};
        const presets = getNextActionPresets(meta, commands);
        const out = [];
        const seen = new Set();
        presets.forEach((item) => {
          const value = String(item?.value || '').trim();
          const label = String(item?.label || '').trim();
          const group = String(item?.group || 'General').trim() || 'General';
          if (!value || seen.has(value)) return;
          seen.add(value);
          out.push({ value, label: label || value, group });
        });
        return out;
      };
      const renderWorkflowFunctionSelectHtml = (selectedValue = '') => {
        const selected = String(selectedValue || '').trim();
        const options = buildWorkflowFunctionOptions();
        const byGroup = new Map();
        options.forEach((opt) => {
          if (!byGroup.has(opt.group)) byGroup.set(opt.group, []);
          byGroup.get(opt.group).push(opt);
        });
        const hasSelected = options.some((opt) => opt.value === selected);
        let html = '<option value="">Selecciona función...</option>';
        if (selected && !hasSelected) {
          html += `<option value="${_escapeOptionHtml(selected)}" selected>Actual: ${_escapeOptionHtml(selected)}</option>`;
        }
        byGroup.forEach((items, group) => {
          const inner = items
            .map((opt) => `<option value="${_escapeOptionHtml(opt.value)}" ${opt.value === selected ? 'selected' : ''}>${_escapeOptionHtml(opt.label)}</option>`)
            .join('');
          if (inner) html += `<optgroup label="${_escapeOptionHtml(group)}">${inner}</optgroup>`;
        });
        return html;
      };
      const _clampNodeMenuPosition = (x = 0, y = 0) => {
        const wrap = workflowControls.canvas?.parentElement;
        if (!wrap) return { left: x, top: y };
        const panelEl = workflowControls.nodeMenuPanel;
        const panelW = Number(panelEl?.offsetWidth || 280);
        const panelH = Number(panelEl?.offsetHeight || 170);
        const maxLeft = Math.max(8, wrap.clientWidth - panelW - 8);
        const maxTop = Math.max(8, wrap.clientHeight - panelH - 8);
        return {
          left: Math.max(8, Math.min(maxLeft, x)),
          top: Math.max(8, Math.min(maxTop, y))
        };
      };
      const openWorkflowNodeMenuPanel = (nodeId = '', anchor = null) => {
        const cy = workflowState.cy;
        const panel = workflowControls.nodeMenuPanel;
        const select = workflowControls.nodeMenuSelect;
        if (!cy || !panel || !select) return;
        const node = cy.getElementById(String(nodeId || '').trim());
        if (!node || node.empty() || node.data('nodeType') === 'root') return;
        workflowState.activeMenuNodeId = node.id();
        const spec = String(node.data('spec') || '').trim();
        select.innerHTML = renderWorkflowFunctionSelectHtml(spec);
        if (spec && Array.from(select.options).some((opt) => opt.value === spec)) select.value = spec;
        panel.classList.add('is-open');
        const rp = node.renderedPosition();
        const rw = Number(node.renderedWidth?.() || 0);
        const rh = Number(node.renderedHeight?.() || 0);
        const baseX = anchor?.x ?? (rp.x + (rw * 0.5) + 12);
        const baseY = anchor?.y ?? (rp.y - (rh * 0.5));
        const pos = _clampNodeMenuPosition(baseX, baseY);
        panel.style.left = `${Math.round(pos.left)}px`;
        panel.style.top = `${Math.round(pos.top)}px`;
      };
      const repositionWorkflowNodeMenuPanel = () => {
        const cy = workflowState.cy;
        const panel = workflowControls.nodeMenuPanel;
        const nodeId = String(workflowState.activeMenuNodeId || '').trim();
        if (!cy || !panel || !nodeId || !panel.classList.contains('is-open')) return;
        const node = cy.getElementById(nodeId);
        if (!node || node.empty()) {
          closeWorkflowNodeMenuPanel();
          return;
        }
        const rp = node.renderedPosition();
        const rw = Number(node.renderedWidth?.() || 0);
        const rh = Number(node.renderedHeight?.() || 0);
        const pos = _clampNodeMenuPosition(rp.x + (rw * 0.5) + 12, rp.y - (rh * 0.5));
        panel.style.left = `${Math.round(pos.left)}px`;
        panel.style.top = `${Math.round(pos.top)}px`;
      };
      const refreshWorkflowNodeMenuButtons = () => {
        const cy = workflowState.cy;
        const layer = workflowControls.nodeMenusLayer;
        if (!cy || !layer) return;
        const nodes = cy.nodes().filter((node) => node.data('nodeType') !== 'root');
        const activeIds = new Set(nodes.map((node) => node.id()));
        const existingButtons = Array.from(layer.querySelectorAll('.workflow-node-menu-btn'));
        existingButtons.forEach((btn) => {
          const id = String(btn.getAttribute('data-node-id') || '').trim();
          if (!activeIds.has(id)) btn.remove();
        });
        nodes.forEach((node) => {
          const id = node.id();
          let btn = layer.querySelector(`.workflow-node-menu-btn[data-node-id="${_escapeOptionHtml(id)}"]`);
          if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'workflow-node-menu-btn';
            btn.setAttribute('data-node-id', id);
            btn.setAttribute('title', 'Cambiar función');
            btn.textContent = '⋮';
            layer.appendChild(btn);
          }
          const rp = node.renderedPosition();
          const rw = Number(node.renderedWidth?.() || 0);
          const rh = Number(node.renderedHeight?.() || 0);
          const x = rp.x + (rw * 0.5) - 9;
          const y = rp.y - (rh * 0.5) - 11;
          btn.style.left = `${Math.round(x)}px`;
          btn.style.top = `${Math.round(y)}px`;
          btn.classList.toggle('is-selected', node.selected() || workflowState.activeMenuNodeId === id);
        });
        repositionWorkflowNodeMenuPanel();
      };
      const applyWorkflowNodeFunctionByMenu = () => {
        const cy = workflowState.cy;
        const nodeId = String(workflowState.activeMenuNodeId || '').trim();
        const selectedSpec = String(workflowControls.nodeMenuSelect?.value || '').trim();
        const payload = workflowState.payloadSnapshot || collectVoiceCommandSettings();
        if (!cy || !nodeId) {
          setWorkflowStatus('No hay nodo seleccionado para cambiar función.', true);
          return;
        }
        if (!selectedSpec) {
          setWorkflowStatus('Selecciona una función para este nodo.', true);
          return;
        }
        const node = cy.getElementById(nodeId);
        if (!node || node.empty() || node.data('nodeType') === 'root') {
          setWorkflowStatus('No se puede editar ese nodo.', true);
          return;
        }
        node.data('spec', selectedSpec);
        node.data('label', labelForWorkflowSpec(selectedSpec, payload));
        node.data('nodeType', inferWorkflowNodeType(selectedSpec, false));
        refreshWorkflowNodeMenuButtons();
        setWorkflowStatus(`Nodo actualizado: ${labelForWorkflowSpec(selectedSpec, payload)}.`, false);
      };
      const reverseWorkflowEdgeFromNodeMenu = () => {
        const cy = workflowState.cy;
        const nodeId = String(workflowState.activeMenuNodeId || '').trim();
        if (!cy || !nodeId) {
          setWorkflowStatus('No hay nodo activo para girar flecha.', true);
          return;
        }
        const node = cy.getElementById(nodeId);
        if (!node || node.empty() || node.data('nodeType') === 'root') {
          setWorkflowStatus('Selecciona un nodo válido para invertir conector.', true);
          return;
        }
        const selectedEdge = cy.edges(':selected').filter((edge) =>
          edge.source().id() === nodeId || edge.target().id() === nodeId
        )[0];
        let edge = selectedEdge || null;
        if (!edge) {
          const connected = node.connectedEdges().toArray();
          if (connected.length === 1) {
            edge = connected[0];
          } else if (!connected.length) {
            setWorkflowStatus('Este nodo no tiene conectores para invertir.', true);
            return;
          } else {
            setWorkflowStatus('Selecciona un conector del nodo para invertirlo.', true);
            return;
          }
        }
        const sourceId = String(edge.source().id() || '').trim();
        const targetId = String(edge.target().id() || '').trim();
        if (!sourceId || !targetId || sourceId === targetId) {
          setWorkflowStatus('No se pudo invertir ese conector.', true);
          return;
        }
        if (sourceId === workflowState.rootNodeId) {
          setWorkflowStatus('No se puede invertir hacia el nodo raíz.', true);
          return;
        }
        if (targetId === workflowState.rootNodeId) {
          setWorkflowStatus('No se puede invertir hacia el nodo raíz.', true);
          return;
        }
        const duplicate = cy.edges().toArray().some((candidate) =>
          candidate.id() !== edge.id()
          && candidate.source().id() === targetId
          && candidate.target().id() === sourceId
        );
        if (duplicate) {
          setWorkflowStatus('Ya existe un conector en esa dirección.', true);
          return;
        }
        edge.move({ source: targetId, target: sourceId });
        edge.select();
        refreshWorkflowNodeMenuButtons();
        setWorkflowStatus('Flecha del conector invertida.', false);
      };
      const buildWorkflowNodeSelectOptions = (payload = {}, activeKey = '') => {
        const rows = payload?.commands && typeof payload.commands === 'object'
          ? payload.commands
          : {};
        const options = ['<option value="">Selecciona una función...</option>'];
        Object.entries(rows).forEach(([key, row]) => {
          if (!key || key === activeKey) return;
          if (!row || typeof row !== 'object' || row.deleted === true) return;
          const label = String(row.name || key).trim() || key;
          options.push(`<option value="cmd:${escapeHtml(key)}">${escapeHtml(label)}</option>`);
        });
        return options.join('');
      };
      const readWorkflowSteps = (row = {}, meta = {}) => {
        const chain = parseNextChainSteps(row?.next || '');
        const rowSteps = Array.isArray(row?.next_steps)
          ? row.next_steps.map((item) => String(item || '').trim()).filter(Boolean)
          : [];
        const stepColumns = Math.max(
          getNextStepColumns(meta),
          rowSteps.length,
          chain.length
        );
        return resolveNextStepValues(row, row, stepColumns).filter(Boolean);
      };
      const parseWorkflowGraphPayload = (value = null) => {
        if (!value) return null;
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' ? parsed : null;
          } catch (_) {
            return null;
          }
        }
        return value && typeof value === 'object' ? value : null;
      };
      const normalizeWorkflowElementsFromGraph = (graphValue = null, commandKey = '', payload = {}) => {
        const key = String(commandKey || '').trim();
        if (!key) return null;
        const graph = parseWorkflowGraphPayload(graphValue);
        if (!graph) return null;
        const rawNodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
        const rawEdges = Array.isArray(graph?.edges) ? graph.edges : [];
        const rootId = `wf_root_${key}`;
        const cmdSpec = `cmd:${key}`;
        const findNodePosition = (node = null, fallbackX = 360, fallbackY = 80) => {
          const x = Number(node?.position?.x);
          const y = Number(node?.position?.y);
          return {
            x: Number.isFinite(x) ? x : fallbackX,
            y: Number.isFinite(y) ? y : fallbackY
          };
        };
        const detectedRootNode = rawNodes.find((node) => {
          const nodeId = String(node?.data?.id || '').trim();
          const nodeType = String(node?.data?.nodeType || '').trim().toLowerCase();
          const spec = String(node?.data?.spec || '').trim().toLowerCase();
          return (
            nodeId === rootId
            || nodeType === 'root'
            || spec === cmdSpec.toLowerCase()
          );
        }) || null;
        const sourceRootId = String(detectedRootNode?.data?.id || graph?.rootId || rootId).trim() || rootId;
        const rootPosition = findNodePosition(detectedRootNode, 360, 80);
        const nodes = [{
          data: {
            id: rootId,
            label: commandNameByKey(payload, key) || key,
            spec: cmdSpec,
            nodeType: 'root'
          },
          position: rootPosition
        }];
        const nodeIds = new Set([rootId]);
        const nodeIdMap = new Map([
          [sourceRootId, rootId],
          [rootId, rootId]
        ]);
        rawNodes.forEach((node) => {
          const originalId = String(node?.data?.id || '').trim();
          if (!originalId || nodeIds.has(originalId)) return;
          if (originalId === sourceRootId || originalId === rootId) return;
          const spec = migrateWorkflowSpec(String(node?.data?.spec || '').trim(), key);
          if (!spec) return;
          const normalizedId = originalId;
          const position = findNodePosition(node, 360, 220);
          nodes.push({
            data: {
              id: normalizedId,
              label: String(node?.data?.label || '').trim() || labelForWorkflowSpec(spec, payload),
              spec,
              nodeType: inferWorkflowNodeType(spec, false)
            },
            position
          });
          nodeIds.add(normalizedId);
          nodeIdMap.set(originalId, normalizedId);
        });
        const edges = [];
        const edgeIds = new Set();
        rawEdges.forEach((edge, index) => {
          const rawSource = String(edge?.data?.source || '').trim();
          const rawTarget = String(edge?.data?.target || '').trim();
          if (!rawSource || !rawTarget) return;
          const source = nodeIdMap.get(rawSource) || (rawSource === sourceRootId ? rootId : rawSource);
          const target = nodeIdMap.get(rawTarget) || (rawTarget === sourceRootId ? rootId : rawTarget);
          if (!source || !target || source === target) return;
          if (target === rootId) return;
          if (!nodeIds.has(source) || !nodeIds.has(target)) return;
          let edgeId = String(edge?.data?.id || '').trim() || `wf_edge_graph_${index + 1}`;
          while (edgeIds.has(edgeId)) {
            edgeId = `${edgeId}_${index + 1}`;
          }
          edgeIds.add(edgeId);
          edges.push({
            data: {
              id: edgeId,
              source,
              target,
              label: String(edge?.data?.label || '').trim() || 'siguiente'
            }
          });
        });
        return { rootId, nodes, edges };
      };
      const deriveWorkflowCounterSeed = (elements = null) => {
        const nodes = Array.isArray(elements?.nodes) ? elements.nodes : [];
        const edges = Array.isArray(elements?.edges) ? elements.edges : [];
        let maxIdNumber = 0;
        const readLastNumber = (value = '') => {
          const match = String(value || '').match(/(\d+)(?!.*\d)/);
          if (!match) return 0;
          const parsed = Number(match[1]);
          return Number.isFinite(parsed) ? parsed : 0;
        };
        [...nodes, ...edges].forEach((item) => {
          const id = String(item?.data?.id || '').trim();
          if (!id) return;
          maxIdNumber = Math.max(maxIdNumber, readLastNumber(id));
        });
        return Math.max(maxIdNumber, nodes.length + edges.length, 1);
      };
      const serializeWorkflowElementsFromCy = (commandKey = '', payload = {}) => {
        const key = String(commandKey || '').trim();
        if (!key || !workflowState.cy) return null;
        const cy = workflowState.cy;
        const rootId = `wf_root_${key}`;
        const currentRootId = String(workflowState.rootNodeId || rootId).trim() || rootId;
        const getSafeNumber = (value, fallback = 0) => {
          const parsed = Number(value);
          if (!Number.isFinite(parsed)) return fallback;
          return Number(parsed.toFixed(2));
        };
        const rootNode = cy.getElementById(currentRootId);
        const rootPosition = (!rootNode || rootNode.empty())
          ? { x: 360, y: 80 }
          : {
            x: getSafeNumber(rootNode.position('x'), 360),
            y: getSafeNumber(rootNode.position('y'), 80)
          };
        const nodes = [{
          data: {
            id: rootId,
            label: commandNameByKey(payload, key) || key,
            spec: `cmd:${key}`,
            nodeType: 'root'
          },
          position: rootPosition
        }];
        const nodeIds = new Set([rootId]);
        cy.nodes().forEach((node) => {
          const originalId = String(node.id() || '').trim();
          if (!originalId) return;
          const isRoot = originalId === currentRootId || node.data('nodeType') === 'root';
          if (isRoot) return;
          const spec = String(node.data('spec') || '').trim();
          if (!spec || nodeIds.has(originalId)) return;
          const position = node.position();
          nodes.push({
            data: {
              id: originalId,
              label: String(node.data('label') || '').trim() || labelForWorkflowSpec(spec, payload),
              spec,
              nodeType: inferWorkflowNodeType(spec, false)
            },
            position: {
              x: getSafeNumber(position.x, 360),
              y: getSafeNumber(position.y, 220)
            }
          });
          nodeIds.add(originalId);
        });
        const edges = [];
        const edgeIds = new Set();
        cy.edges().forEach((edge, index) => {
          const sourceRaw = String(edge.source().id() || '').trim();
          const targetRaw = String(edge.target().id() || '').trim();
          if (!sourceRaw || !targetRaw) return;
          const source = sourceRaw === currentRootId ? rootId : sourceRaw;
          const target = targetRaw === currentRootId ? rootId : targetRaw;
          if (!nodeIds.has(source) || !nodeIds.has(target)) return;
          if (source === target || target === rootId) return;
          let edgeId = String(edge.id() || '').trim() || `wf_edge_save_${index + 1}`;
          while (edgeIds.has(edgeId)) {
            edgeId = `${edgeId}_${index + 1}`;
          }
          edgeIds.add(edgeId);
          edges.push({
            data: {
              id: edgeId,
              source,
              target,
              label: String(edge.data('label') || '').trim() || 'siguiente'
            }
          });
        });
        return {
          version: 1,
          rootId,
          nodes,
          edges
        };
      };
      const collectWorkflowConnectedElements = () => {
        if (!workflowState.cy || !workflowState.rootNodeId) return null;
        const cy = workflowState.cy;
        const root = cy.getElementById(workflowState.rootNodeId);
        if (!root || root.empty()) return null;
        const queue = [root.id()];
        const visitedNodeIds = new Set([root.id()]);
        const collection = cy.collection();
        collection.merge(root);
        while (queue.length) {
          const nodeId = queue.shift();
          const node = cy.getElementById(nodeId);
          if (!node || node.empty()) continue;
          node.connectedEdges().forEach((edge) => {
            collection.merge(edge);
            const sourceId = String(edge.source().id() || '').trim();
            const targetId = String(edge.target().id() || '').trim();
            [sourceId, targetId].forEach((nextId) => {
              if (!nextId) return;
              const nextNode = cy.getElementById(nextId);
              if (!nextNode || nextNode.empty()) return;
              collection.merge(nextNode);
              if (!visitedNodeIds.has(nextId)) {
                visitedNodeIds.add(nextId);
                queue.push(nextId);
              }
            });
          });
        }
        return {
          elements: collection,
          nodeCount: collection.nodes().length,
          edgeCount: collection.edges().length
        };
      };
      const buildWorkflowElements = (commandKey = '', steps = [], payload = {}) => {
        const rootId = `wf_root_${String(commandKey || '').trim()}`;
        const nodes = [{
          data: {
            id: rootId,
            label: commandNameByKey(payload, commandKey) || commandKey,
            spec: `cmd:${commandKey}`,
            nodeType: 'root'
          },
          position: { x: 360, y: 80 }
        }];
        const edges = [];
        let prevId = rootId;
        steps.forEach((spec, idx) => {
          const cleanSpec = String(spec || '').trim();
          const nodeId = `wf_step_${idx + 1}`;
          nodes.push({
            data: {
              id: nodeId,
              label: labelForWorkflowSpec(cleanSpec, payload),
              spec: cleanSpec,
              nodeType: inferWorkflowNodeType(cleanSpec, false)
            },
            position: {
              x: 360 + (((idx % 3) - 1) * 220),
              y: 220 + (idx * 150)
            }
          });
          edges.push({
            data: {
              id: `wf_edge_${idx + 1}`,
              source: prevId,
              target: nodeId,
              label: `Luego ${idx + 1}`
            }
          });
          prevId = nodeId;
        });
        return { rootId, nodes, edges };
      };
      const collectWorkflowStepsFromGraph = () => {
        if (!workflowState.cy || !workflowState.rootNodeId) return [];
        const cy = workflowState.cy;
        const root = cy.getElementById(workflowState.rootNodeId);
        if (!root || root.empty()) return [];
        const visited = new Set([workflowState.rootNodeId]);
        const queue = [workflowState.rootNodeId];
        const orderedSteps = [];
        while (queue.length) {
          const id = queue.shift();
          const node = cy.getElementById(id);
          const outgoing = sortWorkflowEdges(node.outgoers('edge').toArray());
          outgoing.forEach((edge) => {
            const target = edge.target();
            const targetId = target?.id?.() || '';
            if (!targetId || visited.has(targetId)) return;
            visited.add(targetId);
            queue.push(targetId);
            if (target?.data?.('nodeType') === 'root') return;
            const spec = String(target?.data?.('spec') || '').trim();
            if (spec) orderedSteps.push(spec);
          });
        }
        return orderedSteps.filter(Boolean);
      };
      const createWorkflowNode = (spec = '', payload = {}) => {
        if (!workflowState.cy) return null;
        const cleanSpec = String(spec || '').trim();
        if (!cleanSpec) return null;
        workflowState.nodeCounter += 1;
        const nodeId = `wf_step_custom_${workflowState.nodeCounter}`;
        const extent = workflowState.cy.extent();
        const x = (extent.x1 + extent.x2) / 2 + ((workflowState.nodeCounter % 5) * 18);
        const y = (extent.y1 + extent.y2) / 2 + ((workflowState.nodeCounter % 3) * 22);
        workflowState.cy.add({
          group: 'nodes',
          data: {
            id: nodeId,
            label: labelForWorkflowSpec(cleanSpec, payload),
            spec: cleanSpec,
            nodeType: inferWorkflowNodeType(cleanSpec, false)
          },
          position: { x, y }
        });
        return workflowState.cy.getElementById(nodeId);
      };
      const saveWorkflowToCommand = () => {
        const commandKey = String(workflowState.commandKey || '').trim();
        if (!commandKey) {
          setWorkflowStatus('No hay comando seleccionado para guardar.', true);
          return;
        }
        const specsRaw = collectWorkflowStepsFromGraph();
        const specs = specsRaw.slice(0, NEXT_STEP_COLUMNS_MAX);
        const payload = collectVoiceCommandSettings();
        const graph = serializeWorkflowElementsFromCy(commandKey, payload);
        const meta = normalizeVoiceCommandMeta(payload.meta);
        meta.nextStepColumns = clamp(
          Math.max(getNextStepColumns(meta), specs.length || 1),
          NEXT_STEP_COLUMNS_MIN,
          NEXT_STEP_COLUMNS_MAX
        );
        payload.meta = meta;
        const row = (payload.commands?.[commandKey] && typeof payload.commands[commandKey] === 'object')
          ? { ...payload.commands[commandKey] }
          : {};
        row.next_steps = specs;
        row.next = specs.join(' >> ');
        if (graph && typeof graph === 'object') {
          row.workflow_graph = graph;
        }
        for (let i = 1; i <= meta.nextStepColumns; i += 1) {
          row[`next_step_${i}`] = specs[i - 1] || '';
        }
        payload.commands = payload.commands || {};
        payload.commands[commandKey] = row;
        saveVoiceCommandSettings(payload);
        renderVoiceCommandRows(payload);
        refreshCommandFunctionSelectors(meta);
        refreshNextPresetSelectsFromCurrent();
        renderRegexConflictWarnings();
        updateVoiceJsonPreview(payload);
        updateNextStepColumnsBadge(meta.nextStepColumns);
        if (workflowControls.addNodeSelect) {
          workflowControls.addNodeSelect.innerHTML = buildWorkflowNodeSelectOptions(payload, commandKey);
        }
        const graphNodeCount = Math.max(Number(graph?.nodes?.length || 0) - 1, 0);
        const graphEdgeCount = Number(graph?.edges?.length || 0);
        if (specsRaw.length > specs.length) {
          setWorkflowStatus(`Workflow guardado (${graphNodeCount} nodos, ${graphEdgeCount} conectores). Se omitieron pasos extra por límite de columnas.`, true);
        } else {
          setWorkflowStatus(`Workflow guardado (${graphNodeCount} nodos, ${graphEdgeCount} conectores).`, false);
        }
      };
      const openWorkflowEditorForCommand = async (commandKey = '') => {
        const key = String(commandKey || '').trim();
        if (!key || !workflowModal) return;
        const payload = collectVoiceCommandSettings();
        const meta = normalizeVoiceCommandMeta(payload.meta);
        const row = payload?.commands?.[key];
        if (!row || typeof row !== 'object') {
          setWorkflowStatus('No se encontró configuración del comando seleccionado.', true);
          return;
        }
        const steps = readWorkflowSteps(row, meta);
        const graphElements = normalizeWorkflowElementsFromGraph(row?.workflow_graph, key, payload);
        const canUseGraph = !!graphElements && (
          graphElements.nodes.length > 1
          || graphElements.edges.length > 0
        );
        const elements = canUseGraph ? graphElements : buildWorkflowElements(key, steps, payload);
        const commandLabel = commandNameByKey(payload, key) || key;
        workflowState.commandKey = key;
        workflowState.nodeCounter = deriveWorkflowCounterSeed(elements);
        workflowState.payloadSnapshot = payload;
        workflowState.metaSnapshot = meta;
        workflowState.activeMenuNodeId = '';
        if (workflowControls.title) {
          workflowControls.title.textContent = `Workflow visual · ${commandLabel}`;
        }
        if (workflowControls.customSpecInput) {
          workflowControls.customSpecInput.value = '';
        }
        if (workflowControls.addNodeSelect) {
          workflowControls.addNodeSelect.innerHTML = buildWorkflowNodeSelectOptions(payload, key);
        }
        openModal(workflowModal);
        setWorkflowStatus('Cargando editor de flujo...', false);
        clearWorkflowRunLog();
        updateWorkflowPlayDelayBadge();
        if (workflowControls.responsePanel) workflowControls.responsePanel.classList.remove('is-open');
        if (workflowControls.edgeLabelInput) workflowControls.edgeLabelInput.value = '';
        closeWorkflowNodeMenuPanel();
        if (workflowControls.nodeMenusLayer) workflowControls.nodeMenusLayer.innerHTML = '';
        let workflowExtensions = { edgehandles: false, dagre: false, warnings: [] };
        try {
          workflowExtensions = await ensureCytoscapeWorkflowExtensionsLoaded();
        } catch (err) {
          setWorkflowStatus('No se pudo cargar el editor visual. Revisa conexión o bloqueos de red.', true);
          return;
        }
        destroyWorkflowGraph();
        workflowState.rootNodeId = elements.rootId;
        const hasDagreLayout = !!workflowExtensions?.dagre || isCytoscapeExtensionRegistered('layout', 'dagre');
        const flowLayout = hasDagreLayout
          ? {
            name: 'dagre',
            rankDir: 'TB',
            nodeSep: 48,
            rankSep: 90,
            edgeSep: 24,
            fit: true,
            padding: 32,
            animate: true
          }
          : {
            name: 'breadthfirst',
            directed: true,
            roots: `#${elements.rootId}`,
            spacingFactor: 1.35,
            fit: true,
            padding: 32,
            animate: true
          };
        const cy = window.cytoscape({
          container: workflowControls.canvas,
          elements: [
            ...elements.nodes.map((node) => ({ group: 'nodes', ...node })),
            ...elements.edges.map((edge) => ({ group: 'edges', ...edge }))
          ],
          boxSelectionEnabled: true,
          autounselectify: false,
          style: [
            {
              selector: 'node',
              style: {
                'background-color': '#0f766e',
                'label': 'data(label)',
                'color': '#f8fafc',
                'font-size': 11,
                'text-wrap': 'wrap',
                'text-max-width': 170,
                'text-valign': 'center',
                'text-halign': 'center',
                'shape': 'round-rectangle',
                'padding': 12,
                'width': 'label',
                'height': 'label',
                'border-width': 2,
                'border-color': '#0b4f4b'
              }
            },
            {
              selector: 'node[nodeType = "root"]',
              style: {
                'background-color': '#1d4ed8',
                'border-color': '#1e3a8a',
                'shape': 'round-rectangle',
                'text-max-width': 190
              }
            },
            {
              selector: 'node[nodeType = "decision"]',
              style: {
                'shape': 'diamond',
                'width': 170,
                'height': 126,
                'background-color': '#b45309',
                'border-color': '#7c2d12',
                'text-max-width': 130
              }
            },
            {
              selector: 'node[nodeType = "terminal"]',
              style: {
                'shape': 'round-rectangle',
                'background-color': '#a21caf',
                'border-color': '#701a75',
                'border-style': 'double',
                'padding': 14
              }
            },
            {
              selector: 'node[nodeType = "subflow"]',
              style: {
                'shape': 'round-rectangle',
                'background-color': '#0369a1',
                'border-color': '#082f49',
                'border-style': 'dashed'
              }
            },
            {
              selector: 'node:selected',
              style: {
                'overlay-color': '#f59e0b',
                'overlay-opacity': 0.18,
                'border-width': 2,
                'border-color': '#f59e0b'
              }
            },
            {
              selector: 'node.wf-play-current',
              style: {
                'overlay-color': '#22d3ee',
                'overlay-opacity': 0.26,
                'border-color': '#0284c7',
                'border-width': 4
              }
            },
            {
              selector: 'node.wf-play-done',
              style: {
                'border-color': '#10b981',
                'border-width': 3
              }
            },
            {
              selector: 'node.wf-play-error',
              style: {
                'border-color': '#dc2626',
                'border-width': 4
              }
            },
            {
              selector: 'edge',
              style: {
                'curve-style': 'taxi',
                'taxi-direction': 'downward',
                'taxi-turn': 34,
                'target-arrow-shape': 'triangle',
                'line-color': '#64748b',
                'target-arrow-color': '#64748b',
                'width': 2.2,
                'label': 'data(label)',
                'font-size': 10,
                'text-rotation': 'autorotate',
                'text-background-color': '#ffffff',
                'text-background-opacity': 0.92,
                'text-background-padding': 2,
                'text-margin-y': -8,
                'color': '#0f172a'
              }
            },
            {
              selector: 'edge.wf-play-current',
              style: {
                'line-color': '#22c55e',
                'target-arrow-color': '#22c55e',
                'width': 3.4
              }
            },
            {
              selector: 'edge.wf-play-done',
              style: {
                'line-color': '#0ea5e9',
                'target-arrow-color': '#0ea5e9',
                'width': 2.8
              }
            },
            {
              selector: 'edge.wf-play-error',
              style: {
                'line-color': '#dc2626',
                'target-arrow-color': '#dc2626',
                'width': 3.4
              }
            },
            {
              selector: 'edge:selected',
              style: {
                'line-color': '#f59e0b',
                'target-arrow-color': '#f59e0b',
                'width': 3
              }
            }
          ],
          layout: flowLayout
        });
        workflowState.cy = cy;
        workflowState.connectModeEnabled = false;
        workflowState.playbackRunning = false;
        syncWorkflowConnectModeUi();
        setWorkflowPlayButtonState();

        if (typeof cy.edgehandles === 'function') {
          workflowState.edgehandles = cy.edgehandles({
            snap: true,
            hoverDelay: 60,
            noEdgeEventsInDraw: true,
            handleSize: 11,
            handleColor: '#0ea5e9',
            edgeType: () => 'flat',
            canConnect: (sourceNode, targetNode) => {
              if (!sourceNode || !targetNode) return false;
              if (sourceNode.id() === targetNode.id()) return false;
              if (targetNode.data('nodeType') === 'root') return false;
              return true;
            },
            edgeParams: (sourceNode, targetNode) => {
              workflowState.nodeCounter += 1;
              return {
                data: {
                  id: `wf_edge_custom_${workflowState.nodeCounter}`,
                  source: sourceNode.id(),
                  target: targetNode.id(),
                  label: 'siguiente'
                }
              };
            },
            complete: (sourceNode, targetNode, addedEles) => {
              const edge = addedEles?.edges?.()[0] || null;
              const from = String(sourceNode?.data?.('label') || sourceNode?.id() || '').trim();
              const to = String(targetNode?.data?.('label') || targetNode?.id() || '').trim();
              if (edge && workflowControls.edgeLabelInput) {
                workflowControls.edgeLabelInput.value = String(edge.data('label') || '').trim();
              }
              setWorkflowStatus(`Conexión creada: ${from} -> ${to}.`, false);
            }
          });
        }

        const updateWorkflowSelectionStatus = () => {
          syncWorkflowEdgeLabelInput();
          const nodes = cy.nodes(':selected').length;
          const edges = cy.edges(':selected').length;
          if (nodes !== 1) {
            workflowState.activeMenuNodeId = '';
            closeWorkflowNodeMenuPanel();
          } else {
            const selectedNode = cy.nodes(':selected')[0];
            workflowState.activeMenuNodeId = String(selectedNode?.id?.() || '').trim();
          }
          refreshWorkflowNodeMenuButtons();
          if (edges > 0) {
            setWorkflowStatus(`${edges} conector(es) seleccionado(s). Puedes etiquetar o desconectar.`, false);
            return;
          }
          if (nodes === 2) {
            setWorkflowStatus('2 nodos seleccionados. Pulsa "Conectar seleccionados".', false);
            return;
          }
          if (nodes > 2) {
            setWorkflowStatus('Selecciona máximo 2 nodos para conectar.', true);
            return;
          }
          if (workflowState.connectModeEnabled) {
            setWorkflowStatus('Modo conectar activo: arrastra del nodo origen al destino.', false);
            return;
          }
          setWorkflowStatus('Selecciona 2 nodos para conectar o un conector para editar etiqueta/desconectar.', false);
        };
        cy.on('select unselect', updateWorkflowSelectionStatus);
        cy.on('add remove', () => {
          if (workflowState.playbackRunning) {
            stopWorkflowPlayback(true);
          }
          refreshWorkflowNodeMenuButtons();
          if (workflowState.activeMenuNodeId) {
            const node = cy.getElementById(workflowState.activeMenuNodeId);
            if (!node || node.empty()) closeWorkflowNodeMenuPanel();
          }
        });
        cy.on('zoom pan resize', refreshWorkflowNodeMenuButtons);
        cy.on('position', 'node', () => {
          refreshWorkflowNodeMenuButtons();
          if (workflowState.connectModeEnabled) {
            setWorkflowStatus('Nodo movido. Puedes seguir conectando por arrastre.', false);
          }
        });
        cy.on('layoutstop', refreshWorkflowNodeMenuButtons);
        refreshWorkflowNodeMenuButtons();
        updateWorkflowSelectionStatus();
        const visualNodes = Math.max(elements.nodes.length - 1, 0);
        const sourceLabel = canUseGraph ? 'mapa guardado' : 'cadena "Luego"';
        if (workflowState.edgehandles) {
          setWorkflowStatus(`Workflow listo desde ${sourceLabel}: ${visualNodes} nodo(s), ${elements.edges.length} conector(es). Usa "Modo conectar (drag)".`, false);
        } else {
          setWorkflowStatus(`Workflow listo desde ${sourceLabel}: ${visualNodes} nodo(s), ${elements.edges.length} conector(es). Conecta nodos con selección manual.`, false);
        }
        if (Array.isArray(workflowExtensions?.warnings) && workflowExtensions.warnings.length) {
          console.warn('Workflow visual: extensiones no cargadas completamente:', workflowExtensions.warnings.join(' | '));
        }
      };

      const openCommandConfigModal = () => {
        const currentPayload = loadVoiceCommandSettings();
        const normalized = normalizeVoiceCommandPayload(currentPayload);
        const current = normalized.commands || {};
        const meta = normalizeVoiceCommandMeta(normalized.meta);
        syncCommandVoiceInputs(settings);
        deletedSystemCommandKeys = new Set(
          Object.entries(current || {})
            .filter(([key, val]) => !!(val && typeof val === 'object' && val.deleted === true && getVoiceCommandCatalogMap()[key]))
            .map(([key]) => key)
        );
        if (commandControls.agentEnabled) {
          if (commandControls.agentEnabled instanceof HTMLInputElement && commandControls.agentEnabled.type === 'checkbox') {
            commandControls.agentEnabled.checked = meta.agentEnabled === true;
          } else {
            commandControls.agentEnabled.value = meta.agentEnabled ? 'on' : 'off';
          }
        }
        if (commandControls.nextActionPresetsInput) {
          commandControls.nextActionPresetsInput.value = formatNextActionPresetsText(meta);
        }
        renderCustomFunctionList(meta);
        renderVoiceCommandRows({ meta, commands: current });
        refreshCommandFunctionSelectors(meta);
        updateVoiceJsonPreview({ meta, commands: current });
        updateNextStepColumnsBadge(meta.nextStepColumns);
        openModal(commandModal);
      };

      updateWorkflowPlayDelayBadge();
      workflowModal?.addEventListener('click', (event) => {
        if (event.target === workflowModal) {
          destroyWorkflowGraph();
          closeModal(workflowModal);
        }
      });
      workflowControls.playDelayInput?.addEventListener('input', () => {
        updateWorkflowPlayDelayBadge();
      });
      workflowControls.responsePanel?.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-workflow-response]');
        if (!btn) return;
        const value = String(btn.getAttribute('data-workflow-response') || '').trim();
        const normalized = normalizeWorkflowResponseChoice(value, { allowCustom: true });
        resolveWorkflowResponseRequest(normalized);
      });
      workflowControls.nodeMenusLayer?.addEventListener('click', (event) => {
        const btn = event.target.closest('.workflow-node-menu-btn');
        if (!btn || !workflowState.cy) return;
        const nodeId = String(btn.getAttribute('data-node-id') || '').trim();
        if (!nodeId) return;
        const node = workflowState.cy.getElementById(nodeId);
        if (!node || node.empty()) return;
        workflowState.cy.nodes().unselect();
        node.select();
        const left = Number(btn.style.left.replace('px', '') || 0) + 22;
        const top = Number(btn.style.top.replace('px', '') || 0);
        openWorkflowNodeMenuPanel(nodeId, { x: left, y: top });
        refreshWorkflowNodeMenuButtons();
      });
      workflowControls.nodeMenuApplyBtn?.addEventListener('click', () => {
        applyWorkflowNodeFunctionByMenu();
      });
      workflowControls.nodeMenuReverseEdgeBtn?.addEventListener('click', () => {
        reverseWorkflowEdgeFromNodeMenu();
      });
      workflowControls.nodeMenuCloseBtn?.addEventListener('click', () => {
        closeWorkflowNodeMenuPanel();
        refreshWorkflowNodeMenuButtons();
      });
      workflowControls.canvas?.addEventListener('click', () => {
        closeWorkflowNodeMenuPanel();
        refreshWorkflowNodeMenuButtons();
      });
      workflowControls.closeTopBtn?.addEventListener('click', () => {
        destroyWorkflowGraph();
        closeModal(workflowModal);
      });
      workflowControls.closeBtn?.addEventListener('click', () => {
        destroyWorkflowGraph();
        closeModal(workflowModal);
      });
      workflowControls.addNodeBtn?.addEventListener('click', () => {
        if (!workflowState.cy || !workflowState.commandKey) return;
        const customSpec = String(workflowControls.customSpecInput?.value || '').trim();
        const selectedSpec = String(workflowControls.addNodeSelect?.value || '').trim();
        const spec = customSpec || selectedSpec;
        if (!spec) {
          setWorkflowStatus('Selecciona una función o escribe una acción personalizada.', true);
          return;
        }
        const payload = collectVoiceCommandSettings();
        const node = createWorkflowNode(spec, payload);
        if (!node || node.empty()) {
          setWorkflowStatus('No se pudo crear el nodo.', true);
          return;
        }
        workflowState.cy.nodes().unselect();
        node.select();
        setWorkflowStatus(`Nodo añadido: ${labelForWorkflowSpec(spec, payload)}.`, false);
        if (workflowControls.customSpecInput) workflowControls.customSpecInput.value = '';
        refreshWorkflowNodeMenuButtons();
      });
      workflowControls.connectModeBtn?.addEventListener('click', () => {
        if (!workflowState.cy) return;
        if (!workflowState.edgehandles) {
          setWorkflowStatus('Modo conectar por arrastre no disponible. Usa "Conectar seleccionados".', true);
          return;
        }
        workflowState.connectModeEnabled = !workflowState.connectModeEnabled;
        if (workflowState.connectModeEnabled) {
          workflowState.edgehandles.enableDrawMode();
          setWorkflowStatus('Modo conectar activo: arrastra del nodo origen al destino.', false);
        } else {
          workflowState.edgehandles.disableDrawMode();
          if (typeof workflowState.edgehandles.stop === 'function') workflowState.edgehandles.stop();
          setWorkflowStatus('Modo conectar desactivado.', false);
        }
        syncWorkflowConnectModeUi();
      });
      workflowControls.connectBtn?.addEventListener('click', () => {
        if (!workflowState.cy) return;
        const selectedNodes = workflowState.cy.nodes(':selected');
        if (selectedNodes.length !== 2) {
          setWorkflowStatus('Selecciona exactamente 2 nodos para conectar.', true);
          return;
        }
        const source = selectedNodes[0];
        const target = selectedNodes[1];
        if (!source || !target || source.id() === target.id()) {
          setWorkflowStatus('No se puede conectar un nodo consigo mismo.', true);
          return;
        }
        if (target.data('nodeType') === 'root') {
          setWorkflowStatus('El nodo raíz no puede ser destino.', true);
          return;
        }
        const existing = workflowState.cy.edges().filter((edge) => edge.source().id() === source.id() && edge.target().id() === target.id());
        if (existing.length) {
          setWorkflowStatus('Esa conexión ya existe.', true);
          return;
        }
        workflowState.nodeCounter += 1;
        const edgeLabel = String(workflowControls.edgeLabelInput?.value || '').trim() || 'siguiente';
        workflowState.cy.add({
          group: 'edges',
          data: {
            id: `wf_edge_custom_${workflowState.nodeCounter}`,
            source: source.id(),
            target: target.id(),
            label: edgeLabel
          }
        });
        refreshWorkflowNodeMenuButtons();
        setWorkflowStatus(`Conectado: ${source.data('label')} -> ${target.data('label')}.`, false);
      });
      workflowControls.disconnectBtn?.addEventListener('click', () => {
        if (!workflowState.cy) return;
        const selectedEdges = workflowState.cy.edges(':selected');
        if (selectedEdges.length) {
          selectedEdges.remove();
          if (workflowControls.edgeLabelInput) workflowControls.edgeLabelInput.value = '';
          refreshWorkflowNodeMenuButtons();
          setWorkflowStatus(`${selectedEdges.length} conexión(es) eliminada(s).`, false);
          return;
        }
        const selectedNodes = workflowState.cy.nodes(':selected');
        if (selectedNodes.length === 2) {
          const [a, b] = selectedNodes;
          const edges = workflowState.cy.edges().filter((edge) => {
            const s = edge.source().id();
            const t = edge.target().id();
            return (s === a.id() && t === b.id()) || (s === b.id() && t === a.id());
          });
          if (edges.length) {
            edges.remove();
            if (workflowControls.edgeLabelInput) workflowControls.edgeLabelInput.value = '';
            refreshWorkflowNodeMenuButtons();
            setWorkflowStatus(`${edges.length} conexión(es) eliminada(s).`, false);
            return;
          }
        }
        setWorkflowStatus('Selecciona un conector, o 2 nodos que ya estén conectados.', true);
      });
      workflowControls.deleteNodeBtn?.addEventListener('click', () => {
        if (!workflowState.cy) return;
        const selectedNodes = workflowState.cy.nodes(':selected').filter((node) => node.data('nodeType') !== 'root');
        if (!selectedNodes.length) {
          setWorkflowStatus('Selecciona uno o más nodos (no raíz) para eliminarlos.', true);
          return;
        }
        const total = selectedNodes.length;
        selectedNodes.remove();
        refreshWorkflowNodeMenuButtons();
        setWorkflowStatus(`${total} nodo(s) eliminado(s).`, false);
      });
      workflowControls.applyEdgeLabelBtn?.addEventListener('click', () => {
        if (!workflowState.cy) return;
        const selectedEdge = workflowState.cy.edges(':selected')[0];
        if (!selectedEdge) {
          setWorkflowStatus('Selecciona un conector para aplicar la etiqueta.', true);
          return;
        }
        const label = String(workflowControls.edgeLabelInput?.value || '').trim();
        selectedEdge.data('label', label || 'siguiente');
        refreshWorkflowNodeMenuButtons();
        setWorkflowStatus(`Etiqueta aplicada: ${selectedEdge.data('label')}.`, false);
      });
      workflowControls.autoLayoutBtn?.addEventListener('click', () => {
        if (!workflowState.cy || !workflowState.rootNodeId) return;
        const connected = collectWorkflowConnectedElements();
        const layoutElements = connected?.elements && connected.elements.length
          ? connected.elements
          : workflowState.cy.elements();
        const hasDagreLayout = isCytoscapeExtensionRegistered('layout', 'dagre');
        const layout = hasDagreLayout
          ? {
            name: 'dagre',
            rankDir: 'TB',
            nodeSep: 48,
            rankSep: 90,
            edgeSep: 24,
            fit: false,
            padding: 32,
            animate: true,
            animationDuration: 220
          }
          : {
            name: 'breadthfirst',
            directed: true,
            roots: `#${workflowState.rootNodeId}`,
            spacingFactor: 1.35,
            fit: false,
            padding: 32,
            animate: true,
            animationDuration: 220
          };
        layoutElements.layout(layout).run();
        refreshWorkflowNodeMenuButtons();
        const totalNodes = workflowState.cy.nodes().length;
        const arrangedNodes = layoutElements.nodes().length;
        const untouchedNodes = Math.max(0, totalNodes - arrangedNodes);
        if (untouchedNodes > 0) {
          setWorkflowStatus(`Layout aplicado a ${arrangedNodes} nodo(s). ${untouchedNodes} desconectado(s) conservaron su posición.`, false);
        } else {
          setWorkflowStatus(`Layout aplicado a ${arrangedNodes} nodo(s).`, false);
        }
      });
      workflowControls.playBtn?.addEventListener('click', async () => {
        if (!workflowState.cy || !workflowState.rootNodeId) {
          setWorkflowStatus('Abre un workflow para ejecutar la prueba.', true);
          return;
        }
        if (workflowState.playbackRunning) {
          stopWorkflowPlayback(true);
          return;
        }
        try {
          await runWorkflowPlayback();
        } catch (err) {
          workflowState.playbackRunning = false;
          setWorkflowPlayButtonState();
          setWorkflowStatus(`Error al ejecutar Play: ${err?.message || 'sin detalle'}`, true);
        }
      });
      workflowControls.saveBtn?.addEventListener('click', saveWorkflowToCommand);

      commandModal.addEventListener('click', (event) => {
        if (event.target === commandModal) closeModal(commandModal);
      });
      commandControls.closeTopBtn?.addEventListener('click', () => closeModal(commandModal));
      commandControls.closeBtn?.addEventListener('click', () => closeModal(commandModal));
      commandControls.openBtn?.addEventListener('click', openCommandConfigModal);
      commandControls.directOpenBtn?.addEventListener('click', (event) => {
        event.preventDefault();
        openCommandConfigModal();
      });
      commandControls.resetBtn?.addEventListener('click', () => {
        const defaults = loadVoiceCommandDefaultSettings() || normalizeVoiceCommandPayload({});
        const defaultsCommands = defaults.commands || {};
        deletedSystemCommandKeys = new Set(
          Object.entries(defaultsCommands)
            .filter(([key, val]) => !!(val && typeof val === 'object' && val.deleted === true && getVoiceCommandCatalogMap()[key]))
            .map(([key]) => key)
        );
        saveVoiceCommandSettings(defaults);
        renderVoiceCommandRows(defaults);
        if (commandControls.agentEnabled) {
          if (commandControls.agentEnabled instanceof HTMLInputElement && commandControls.agentEnabled.type === 'checkbox') {
            commandControls.agentEnabled.checked = defaults?.meta?.agentEnabled === true;
          } else {
            commandControls.agentEnabled.value = defaults?.meta?.agentEnabled === false ? 'off' : 'on';
          }
        }
        if (commandControls.nextActionPresetsInput) {
          commandControls.nextActionPresetsInput.value = formatNextActionPresetsText(defaults?.meta || {});
        }
        renderCustomFunctionList(defaults.meta);
        refreshCommandFunctionSelectors(defaults.meta || {});
        updateVoiceJsonPreview(defaults);
        updateNextStepColumnsBadge(defaults?.meta?.nextStepColumns);
      });
      commandControls.nextStepColumnAddBtn?.addEventListener('click', () => {
        setNextStepColumns(getCurrentNextStepColumns() + 1);
      });
      commandControls.nextStepColumnRemoveBtn?.addEventListener('click', () => {
        setNextStepColumns(getCurrentNextStepColumns() - 1);
      });
      commandControls.addBtn?.addEventListener('click', () => {
        const tbody = document.getElementById('voiceCommandRows');
        if (!tbody) return;
        const meta = normalizeVoiceCommandMeta(loadVoiceCommandSettings().meta);
        const key = `custom_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const row = buildVoiceCommandRow({
          key,
          section: 'Personalizado',
          fn: '_clickButtonById',
          target: '',
          name: 'Comando personalizado',
          defaultRegex: ''
        }, {}, true, true, meta);
        tbody.insertAdjacentHTML('beforeend', row);
        refreshNextPresetSelectsFromCurrent();
        renderRegexConflictWarnings();
        persistVoiceEditorDraft();
        updateNextStepColumnsBadge(meta.nextStepColumns);
      });
      commandControls.agentEnabled?.addEventListener('change', () => {
        persistVoiceEditorDraft();
      });
      commandControls.charlyVoiceName?.addEventListener('change', () => {
        persistAndApply({
          ...settings,
          charlyVoicePreset: 'custom',
          charlyVoiceName: commandControls.charlyVoiceName.value || DEFAULT_CHARLY_VOICE_NAME
        });
      });
      commandControls.charlyVoicePreset?.addEventListener('change', () => {
        const presetId = commandControls.charlyVoicePreset.value || 'custom';
        if (presetId === 'custom') {
          persistAndApply({ ...settings, charlyVoicePreset: 'custom' });
          return;
        }
        persistAndApply(applyCharlyVoicePreset(settings, presetId));
      });
      commandControls.charlyVoiceMood?.addEventListener('change', () => {
        persistAndApply({
          ...settings,
          charlyVoicePreset: 'custom',
          charlyVoiceMood: commandControls.charlyVoiceMood.value || DEFAULT_CHARLY_VOICE_MOOD
        });
      });
      commandControls.charlyVoiceLocale?.addEventListener('change', () => {
        persistAndApply({
          ...settings,
          charlyVoicePreset: 'custom',
          charlyVoiceLocale: commandControls.charlyVoiceLocale.value || DEFAULT_CHARLY_VOICE_LOCALE
        });
      });
      commandControls.charlyVoiceSpeed?.addEventListener('input', () => {
        if (commandControls.charlyVoiceSpeedValue) {
          commandControls.charlyVoiceSpeedValue.textContent = `${Number(commandControls.charlyVoiceSpeed.value || DEFAULT_CHARLY_VOICE_SPEED).toFixed(2)}x`;
        }
        persistAndApply({
          ...settings,
          charlyVoicePreset: 'custom',
          charlyVoiceSpeed: Number(commandControls.charlyVoiceSpeed.value || DEFAULT_CHARLY_VOICE_SPEED)
        });
      });
      commandControls.charlyVoicePitch?.addEventListener('input', () => {
        if (commandControls.charlyVoicePitchValue) {
          commandControls.charlyVoicePitchValue.textContent = Number(commandControls.charlyVoicePitch.value || DEFAULT_CHARLY_VOICE_PITCH).toFixed(2);
        }
        persistAndApply({
          ...settings,
          charlyVoicePreset: 'custom',
          charlyVoicePitch: Number(commandControls.charlyVoicePitch.value || DEFAULT_CHARLY_VOICE_PITCH)
        });
      });
      commandControls.lecturaUseCharlyVoice?.addEventListener('change', () => {
        persistAndApply({
          ...settings,
          lecturaUseCharlyVoice: !!commandControls.lecturaUseCharlyVoice.checked
        });
      });
      commandControls.lecturaVoiceName?.addEventListener('change', () => {
        persistAndApply({
          ...settings,
          lecturaVoiceName: commandControls.lecturaVoiceName.value || DEFAULT_LECTURA_VOICE_NAME
        });
      });
      commandControls.lecturaVoiceMood?.addEventListener('change', () => {
        persistAndApply({
          ...settings,
          lecturaVoiceMood: commandControls.lecturaVoiceMood.value || DEFAULT_LECTURA_VOICE_MOOD
        });
      });
      commandControls.lecturaVoiceLocale?.addEventListener('change', () => {
        persistAndApply({
          ...settings,
          lecturaVoiceLocale: commandControls.lecturaVoiceLocale.value || DEFAULT_LECTURA_VOICE_LOCALE
        });
      });
      commandControls.lecturaVoiceSpeed?.addEventListener('input', () => {
        if (commandControls.lecturaVoiceSpeedValue) {
          commandControls.lecturaVoiceSpeedValue.textContent = `${Number(commandControls.lecturaVoiceSpeed.value || DEFAULT_LECTURA_VOICE_SPEED).toFixed(2)}x`;
        }
        persistAndApply({
          ...settings,
          lecturaVoiceSpeed: Number(commandControls.lecturaVoiceSpeed.value || DEFAULT_LECTURA_VOICE_SPEED)
        });
      });
      commandControls.lecturaVoicePitch?.addEventListener('input', () => {
        if (commandControls.lecturaVoicePitchValue) {
          commandControls.lecturaVoicePitchValue.textContent = Number(commandControls.lecturaVoicePitch.value || DEFAULT_LECTURA_VOICE_PITCH).toFixed(2);
        }
        persistAndApply({
          ...settings,
          lecturaVoicePitch: Number(commandControls.lecturaVoicePitch.value || DEFAULT_LECTURA_VOICE_PITCH)
        });
      });
      commandControls.customFunctionAddBtn?.addEventListener('click', () => {
        const name = String(commandControls.customFunctionName?.value || '').trim();
        const baseFn = String(commandControls.customFunctionBase?.value || '').trim();
        if (!name || !VOICE_FN_BASE_VALUES.has(baseFn)) return;
        const payload = normalizeVoiceCommandPayload(loadVoiceCommandSettings());
        const meta = normalizeVoiceCommandMeta(payload.meta);
        const id = `fn_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        meta.customFunctions.push({ id, label: name, baseFn });
        payload.meta = meta;
        saveVoiceCommandSettings(payload);
        renderCustomFunctionList(meta);
        refreshCommandFunctionSelectors(meta);
        if (commandControls.customFunctionName) commandControls.customFunctionName.value = '';
        persistVoiceEditorDraft();
      });
      commandModal.addEventListener('click', async (event) => {
        const btn = event.target.closest('[data-cmd-view-workflow]');
        if (!btn) return;
        const row = btn.closest('tr[data-cmd-key]');
        const key = String(row?.getAttribute('data-cmd-key') || '').trim();
        if (!key) return;
        await openWorkflowEditorForCommand(key);
      });
      commandModal.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-cmd-duplicate]');
        if (!btn) return;
        const row = btn.closest('tr[data-cmd-key]');
        const key = String(row?.getAttribute('data-cmd-key') || '').trim();
        if (!key) return;
        duplicateVoiceCommandByKey(key);
      });
      commandModal.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-cmd-delete]');
        if (!btn) return;
        const row = btn.closest('tr[data-cmd-key]');
        if (row) {
          const key = row.getAttribute('data-cmd-key') || '';
          const isCustom = row.getAttribute('data-cmd-custom') === '1';
          if (key && !isCustom && getVoiceCommandCatalogMap()[key]) {
            deletedSystemCommandKeys.add(key);
          }
          row.remove();
        }
        refreshNextPresetSelectsFromCurrent();
        persistVoiceEditorDraft();
        renderRegexConflictWarnings();
      });
      commandModal.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-fn-delete]');
        if (!btn) return;
        const id = String(btn.getAttribute('data-fn-delete') || '').trim();
        if (!id) return;
        const payload = normalizeVoiceCommandPayload(loadVoiceCommandSettings());
        const meta = normalizeVoiceCommandMeta(payload.meta);
        meta.customFunctions = (meta.customFunctions || []).filter((fn) => fn.id !== id);
        payload.meta = meta;
        saveVoiceCommandSettings(payload);
        renderCustomFunctionList(meta);
        refreshCommandFunctionSelectors(meta);
        persistVoiceEditorDraft();
      });
      commandModal.addEventListener('input', (event) => {
        const el = event.target;
        if (!(el instanceof HTMLElement)) return;
        if (el.matches('#nextActionPresetsInput')) {
          persistVoiceEditorDraft();
        }
      });
      commandModal.addEventListener('change', (event) => {
        const el = event.target;
        if (!(el instanceof HTMLElement)) return;
        if (el.matches('[data-cmd-regex], [data-cmd-target], [data-cmd-name]')) {
          refreshNextPresetSelectsFromCurrent();
          renderRegexConflictWarnings();
          persistVoiceEditorDraft();
        }
        if (el.matches('[data-cmd-fn], [data-cmd-enabled], [data-cmd-speak]')) {
          renderRegexConflictWarnings();
          persistVoiceEditorDraft();
        }
        if (el.matches('[data-cmd-next-step]')) {
          renderRegexConflictWarnings();
          persistVoiceEditorDraft();
        }
        if (el.matches('#nextActionPresetsInput')) {
          const payload = collectVoiceCommandSettings();
          renderVoiceCommandRows(payload);
          updateNextStepColumnsBadge(payload?.meta?.nextStepColumns);
          renderRegexConflictWarnings();
          persistVoiceEditorDraft();
        }
      });
      commandControls.saveBtn?.addEventListener('click', () => {
        const payload = collectVoiceCommandSettings();
        saveVoiceCommandSettings(payload);
        updateVoiceJsonPreview(payload);
        closeModal(commandModal);
      });
    }

    controls.mode.addEventListener('change', () => {
      const mode = controls.mode.value === 'dark' ? 'dark' : 'light';
      const base = MODE_DEFAULTS[mode];
      persistAndApply({ ...settings, ...base, mode, preset: '' });
    });

    controls.presetCategorySelect?.addEventListener('change', () => {
      const categoryId = controls.presetCategorySelect.value || 'all';
      controls.presetCategorySelect.dataset.activeCategory = categoryId;
      refreshPresetCatalogUI(controls, categoryId, settings.preset || '');
    });

    controls.presetSelect.addEventListener('change', () => {
      const presetId = controls.presetSelect.value;
      if (!presetId) {
        persistAndApply({ ...settings, preset: '' });
        return;
      }
      controls.presetCategorySelect.dataset.activeCategory = getPresetCategoryFromPresetId(presetId);
      persistAndApply(applyPresetToSettings(settings, presetId));
    });

    controls.presetGrid.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-theme-preset]');
      if (!btn) return;
      controls.presetCategorySelect.dataset.activeCategory = getPresetCategoryFromPresetId(btn.dataset.themePreset);
      persistAndApply(applyPresetToSettings(settings, btn.dataset.themePreset));
    });

    controls.alertPreset.addEventListener('change', () => {
      const nextAlertPreset = controls.alertPreset.value || DEFAULT_ALERT_PRESET_ID;
      persistAndApply({
        ...settings,
        alertPreset: nextAlertPreset,
        alertBg: getAlertPreset(nextAlertPreset).bg,
        alertText: getAlertPreset(nextAlertPreset).text,
        alertBorder: getAlertPreset(nextAlertPreset).border,
        alertAccent: getAlertPreset(nextAlertPreset).accent
      });
    });

    if (controls.charlyVoiceName) {
      controls.charlyVoiceName.addEventListener('change', () => {
        persistAndApply({
          ...settings,
          charlyVoicePreset: 'custom',
          charlyVoiceName: controls.charlyVoiceName.value || DEFAULT_CHARLY_VOICE_NAME
        });
      });
    }

    if (controls.charlyVoicePreset) {
      controls.charlyVoicePreset.addEventListener('change', () => {
        const presetId = controls.charlyVoicePreset.value || 'custom';
        if (presetId === 'custom') {
          persistAndApply({ ...settings, charlyVoicePreset: 'custom' });
          return;
        }
        persistAndApply(applyCharlyVoicePreset(settings, presetId));
      });
    }

    if (controls.charlyVoiceMood) {
      controls.charlyVoiceMood.addEventListener('change', () => {
        persistAndApply({
          ...settings,
          charlyVoicePreset: 'custom',
          charlyVoiceMood: controls.charlyVoiceMood.value || DEFAULT_CHARLY_VOICE_MOOD
        });
      });
    }
    if (controls.charlyVoiceLocale) {
      controls.charlyVoiceLocale.addEventListener('change', () => {
        persistAndApply({
          ...settings,
          charlyVoicePreset: 'custom',
          charlyVoiceLocale: controls.charlyVoiceLocale.value || DEFAULT_CHARLY_VOICE_LOCALE
        });
      });
    }

    if (controls.charlyVoiceSpeed) {
      controls.charlyVoiceSpeed.addEventListener('input', () => {
        controls.charlyVoiceSpeedValue.textContent = `${Number(controls.charlyVoiceSpeed.value).toFixed(2)}x`;
        persistAndApply({
          ...settings,
          charlyVoicePreset: 'custom',
          charlyVoiceSpeed: Number(controls.charlyVoiceSpeed.value || DEFAULT_CHARLY_VOICE_SPEED)
        });
      });
    }

    if (controls.charlyVoicePitch) {
      controls.charlyVoicePitch.addEventListener('input', () => {
        controls.charlyVoicePitchValue.textContent = Number(controls.charlyVoicePitch.value).toFixed(2);
        persistAndApply({
          ...settings,
          charlyVoicePreset: 'custom',
          charlyVoicePitch: Number(controls.charlyVoicePitch.value || DEFAULT_CHARLY_VOICE_PITCH)
        });
      });
    }

    [
      [controls.headerColor, controls.headerColorText],
      [controls.headerTextColor, controls.headerTextColorText],
      [controls.bodyColor, controls.bodyColorText],
      [controls.textColor, controls.textColorText]
    ].forEach(([colorInput, textInput]) => {
      colorInput.addEventListener('input', () => {
        textInput.value = colorInput.value;
        updateFromInputs();
      });
      textInput.addEventListener('change', () => {
        if (isValidHexColor(textInput.value)) {
          colorInput.value = textInput.value;
        }
        updateFromInputs();
      });
    });

    controls.fontSize.addEventListener('input', () => {
      controls.fontSizeValue.textContent = `${controls.fontSize.value}px`;
      updateFromInputs();
    });

    controls.surfaceRadius?.addEventListener('input', () => {
      controls.surfaceRadiusValue.textContent = `${controls.surfaceRadius.value}px`;
      updateFromInputs();
    });

    controls.tableLineWidth?.addEventListener('input', () => {
      controls.tableLineWidthValue.textContent = `${controls.tableLineWidth.value}px`;
      updateFromInputs();
    });

    controls.resetBtn.addEventListener('click', () => {
      persistAndApply({
        ...settings,
        ...applyPresetToSettings(MODE_DEFAULTS.light, DEFAULT_PRESET_ID),
        alertPreset: DEFAULT_ALERT_PRESET_ID,
        surfaceRadius: MODE_DEFAULTS.light.surfaceRadius,
        tableLineWidth: MODE_DEFAULTS.light.tableLineWidth
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal.classList.contains('is-open')) {
        closeModal(modal);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeManager);
  } else {
    initThemeManager();
  }
})();
