(function () {
  const page = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const THEME_STORAGE_KEY = 'cb_theme_settings_v1';

  const pageConfig = {
    'home.html': { title: 'Home', header: 'filters' },
    'unidadhome.html': { title: 'Mis Unidades', header: 'filters' },
    'crearunidades.html': { title: 'Crear Unidades', header: 'filters' },
    'contenidounidad.html': { title: 'Contenido', header: 'filters' },
    'contenidounidad-.html': { title: 'Contenido', header: 'filters' },
    'generarlectura.html': { title: 'Charly Studio', header: 'simple' },
    'moodlecourse.html': { title: 'Charly Brown Gestion de cursos Aprende', header: 'simple' },
    'voicetranscribe.html': { title: 'Charly Brown Session Recorder', header: 'simple' },
    'gestionusuarios.html': { title: 'Gestion de usuarios', header: 'simple' },
    'perfil.html': { title: 'Mi perfil', header: 'simple' },
    'chat.html': { title: 'Chat', header: 'simple', showFavoritesToggle: true }
  };

  const cfg = pageConfig[page] || { title: 'Charly Brown', header: 'simple' };

  function applyStoredThemeSnapshot() {
    const classicLight = {
      mode: 'light',
      headerColor: '#3f4d98',
      headerTextColor: '#ffffff',
      bodyColor: '#f8fafc',
      textColor: '#111827',
      fontSize: 14,
      preset: 'classic_light'
    };

    let settings = null;
    try {
      settings = JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) || '{}');
    } catch (_) {
      settings = null;
    }
    if (!settings || typeof settings !== 'object' || Object.keys(settings).length === 0) {
      settings = classicLight;
      try { localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(settings)); } catch (_) {}
    }

    const root = document.documentElement;
    const body = document.body || document.documentElement;
    if (settings.headerColor) root.style.setProperty('--cb-chrome-bg', settings.headerColor);
    if (settings.headerTextColor) root.style.setProperty('--cb-header-text-color', settings.headerTextColor);
    if (settings.bodyColor) root.style.setProperty('--app-bg-color', settings.bodyColor);
    if (settings.textColor) root.style.setProperty('--app-text-color', settings.textColor);
    if (settings.fontSize) root.style.setProperty('--app-font-size', `${Number(settings.fontSize)}px`);
    body.classList.toggle('theme-dark', settings.mode === 'dark');
    body.classList.toggle('theme-light', settings.mode !== 'dark');
  }

  function ensureThemeManagerScript() {
    if (document.querySelector('script[data-theme-manager="1"]')) return;
    const script = document.createElement('script');
    script.src = 'themeManager.js';
    script.setAttribute('data-theme-manager', '1');
    document.body.appendChild(script);
  }

  applyStoredThemeSnapshot();

  const escapeHtml = (text) => String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');

  function renderHeader(title, variant) {
    const safeTitle = escapeHtml(title);
    if (variant !== 'filters') {
      return `
        <div class="logo-area">
          <h4>${safeTitle}</h4>
        </div>
        <div class="header-user-area">
          <span id="headerUserEmail" class="header-user-email" title="Usuario autenticado"></span>
        </div>
      `;
    }

    return `
      <div class="logo-area">
        <h4>${safeTitle}</h4>
      </div>

      <div class="search-group position-relative">
        <i class="fas fa-search"></i>
        <input type="text" id="searchInput" class="form-control bg-transparent text-white" placeholder="Buscar...">
      </div>

      <div class="filters-container">
        <i id="btnReiniciarFiltros" class="fas fa-sync-alt" title="Reiniciar filtros"></i>

        <select class="selectpicker" data-style="btn-light" id="filtroNivel">
          <option value="">Nivel</option>
          <option value="preescolar">Preescolar</option>
          <option value="primaria">Primaria</option>
          <option value="secundaria">Secundaria</option>
        </select>

        <select class="selectpicker" data-style="btn-light" id="filtroGrado">
          <option value="">Grado</option>
          <option value="primero">Primero</option>
          <option value="segundo">Segundo</option>
          <option value="tercero">Tercero</option>
          <option value="cuarto">Cuarto</option>
          <option value="quinto">Quinto</option>
          <option value="sexto">Sexto</option>
        </select>

        <select class="selectpicker" data-style="btn-light" id="filtroTrimestre">
          <option value="">Trim</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
        </select>

        <select class="selectpicker" data-style="btn-light" id="filtroUnidad">
          <option value="">Unidad</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
        </select>
      </div>

      <div class="header-user-area">
        <span id="headerUserEmail" class="header-user-email" title="Usuario autenticado"></span>
      </div>
    `;
  }

  function renderSidebar(currentPage, showFavoritesToggle) {
    const links = [
      { href: 'generarLectura.html', icon: 'fas fa-chart-line', label: 'Analisis Editorial', id: 'analisisEditorialLink' },
      { href: 'moodleCourse.html', icon: 'fas fa-book', label: 'Crear Cursos de Moodle' },
      { href: 'voiceTranscribe.html', icon: 'fas fa-microphone-lines', label: 'Voice Transcribe' },
      { href: 'perfil.html', icon: 'fas fa-user', label: 'Perfil' },
      { href: 'gestionUsuarios.html', icon: 'fas fa-users-cog', label: 'Usuarios', id: 'gestionUsuariosLink' },
      { href: 'chat.html', icon: 'fas fa-comment', label: 'Chat', id: 'chatLink' },
      { href: '#', icon: 'fas fa-sliders-h', label: 'Tema del sistema', id: 'themeSettingsLink' },
      { href: '#', icon: 'fas fa-head-side-cough', label: 'Comandos de voz', id: 'themeCommandSettingsBtn' }
    ];

    const sidebarLinks = links.map((link) => {
      const isAction = link.href === '#';
      const isActive = !isAction && link.href.toLowerCase() === currentPage;
      const attrs = [
        `href="${link.href}"`,
        'class="sidebar-link"',
        isActive ? 'aria-current="page"' : ''
      ];
      if (link.id) attrs.push(`id="${link.id}"`);
      const badgeHtml = link.id === 'chatLink'
        ? '<em id="chat-notification-badge" class="sidebar-badge" hidden aria-live="polite">0</em>'
        : '';

      return `
        <a ${attrs.filter(Boolean).join(' ')}>
          <i class="${link.icon}"></i>
          <span>${link.label}</span>
          ${badgeHtml}
        </a>
      `;
    }).join('');

    const favoritesToggle = showFavoritesToggle
      ? `
        <button id="toggleFavorites" class="btn btn-sm btn-light ms-auto" title="Favoritos">
          <i class="fas fa-star"></i>
        </button>
      `
      : '';

    return `${sidebarLinks}
      ${favoritesToggle}
      <a href="#" class="sidebar-link" id="logoutLink">
        <i class="fas fa-sign-out-alt"></i>
        <span>Cerrar sesion</span>
      </a>
    `;
  }

  const headerContent = document.querySelector('.main-header .header-content');
  if (headerContent) {
    headerContent.innerHTML = renderHeader(cfg.title, cfg.header);
  }

  const sidebarMenu = document.querySelector('#sidebar .sidebar-menu');
  if (sidebarMenu) {
    sidebarMenu.innerHTML = renderSidebar(page, !!cfg.showFavoritesToggle);
  }

  ensureThemeManagerScript();
})();
