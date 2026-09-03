(function () { // IIFE starts here
  const CHROME_LAYOUT_ASSET_VERSION = '2026-1.0.10.858';

  function normalizePageId(pageId, fallback = 'index.html') {
    const normalized = String(pageId || '').trim().toLowerCase();
    const candidate = normalized || fallback;
    if (!candidate) return '';
    if (candidate.includes('.')) return candidate;
    return `${candidate}.html`;
  }

  const page = normalizePageId(window.location.pathname.split('/').pop());
  const THEME_STORAGE_KEY = 'cb_theme_settings_v1';

  const pageConfig = {
    'home.html': { title: 'Home', header: 'simple' },
    'unidadhome.html': { title: 'Mis Unidades', header: 'filters' },
    'crearunidades.html': { title: 'Crear Unidades', header: 'filters' },
    'contenidounidad.html': { title: 'Contenido', header: 'filters' },
    'contenidounidad-.html': { title: 'Contenido', header: 'filters' },
    'generarlectura.html': { title: 'Charly Studio', header: 'simple' },
    'charly-brown.html': { title: 'Charly Brown', header: 'simple' },
    'peppermintpattyanalizer.html': { title: 'Peppermint Patty Analizer', header: 'simple' },
    'pigpencreator.html': { title: 'PigPen Escape Room Creator', header: 'simple' },
    'podcaster.html': { title: 'Podcaster Studio', header: 'simple' },
    'imagecreator.html': { title: 'Image Creator', header: 'simple' },
    'lecturasgame.html': { title: 'Lecturas Game', header: 'simple' },
    'moodlecourse.html': { title: 'Charly Brown Gestion de cursos Aprende', header: 'simple' },
    'voicetranscribe.html': { title: 'Charly Brown Session Recorder', header: 'simple' },
    'gestionusuarios.html': { title: 'Gestion de usuarios', header: 'simple' },
    'perfil.html': { title: 'Mi perfil', header: 'simple' },
    'chat.html': { title: 'Chat', header: 'simple', showFavoritesToggle: true }
    , 'marcieblogeditor.html': { title: 'Marcie Blog Editor', header: 'simple' }
    , 'scienceactivities.html': { title: 'Actividades de Ciencias', header: 'simple' }
    , 'experienciamenu.html': { title: 'Menu de experiencias', header: 'simple' }
  };

  const cfg = pageConfig[page] || { title: 'Charly Brown', header: 'simple' };

  function setHeaderUserEmail(email = '') {
    const el = document.getElementById('headerUserEmail');
    if (!el) return;
    const safeEmail = String(email || '').trim();
    el.textContent = safeEmail || 'Sin sesión';
    el.setAttribute('title', safeEmail || 'Usuario autenticado');
  }

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
    script.src = `js/themeManager.js?v=${encodeURIComponent(CHROME_LAYOUT_ASSET_VERSION)}`;
    script.setAttribute('data-theme-manager', '1');
    document.body.appendChild(script);
  }

  function isStyleDebugEnabled() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const fromQuery = String(params.get('debugStyles') || '').trim();
      if (fromQuery === '1' || fromQuery.toLowerCase() === 'true') return true;
      return localStorage.getItem('cb_debug_styles') === '1';
    } catch (_) {
      return false;
    }
  }

  function getStyleDiagnosticSelectors() {
    const bodyPage = String(document.body?.dataset?.page || '').toLowerCase();
    const normalizedBodyPage = bodyPage.endsWith('.html') ? bodyPage : (bodyPage ? `${bodyPage}.html` : '');
    const selectors = [
      '#sidebar',
      '.main-header',
      '.icon-btn'
    ];
    if (normalizedBodyPage === 'moodlecourse.html') {
      selectors.push(
        '#btnToggleArchivados',
        '.modulo-archive-switch__track',
        '.modulo-archive-switch__label',
        '.cb-module-feedback-line',
        '.cb-module-question-block',
        '.cb-module-block-title.is-original',
        '.cb-module-block-title.is-proposal'
      );
    }
    return selectors;
  }

  function collectStyleDiagnostics() {
    const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map((node, index) => ({
      index,
      tag: node.tagName.toLowerCase(),
      href: node.getAttribute('href') || '',
      media: node.getAttribute('media') || '',
      disabled: node.disabled === true
    }));

    const selectorChecks = getStyleDiagnosticSelectors().map((selector) => {
      const element = document.querySelector(selector);
      const matches = !!element;
      const computed = matches ? window.getComputedStyle(element) : null;
      return {
        selector,
        matches,
        className: matches ? String(element.className || '') : '',
        display: computed ? computed.display : '',
        visibility: computed ? computed.visibility : '',
        color: computed ? computed.color : '',
        backgroundColor: computed ? computed.backgroundColor : '',
        borderLeftColor: computed ? computed.borderLeftColor : '',
        borderColor: computed ? computed.borderColor : ''
      };
    });

    return {
      page,
      path: window.location.pathname,
      bodyDataPage: String(document.body?.dataset?.page || ''),
      stylesheets,
      selectorChecks
    };
  }

  function logStyleDiagnostics(reason = 'manual') {
    const report = collectStyleDiagnostics();
    try {
      console.groupCollapsed(`[cb-style-debug] ${reason} :: ${report.path}`);
      console.table(report.stylesheets);
      console.table(report.selectorChecks);
      console.groupEnd();
    } catch (_) {
      // no-op
    }
    return report;
  }

  function setupStyleDiagnostics() {
    window.__cbStyleDiagnostics = () => logStyleDiagnostics('manual');
    window.__cbEnableStyleDiagnostics = () => {
      try { localStorage.setItem('cb_debug_styles', '1'); } catch (_) {}
      return logStyleDiagnostics('enabled');
    };
    window.__cbDisableStyleDiagnostics = () => {
      try { localStorage.removeItem('cb_debug_styles'); } catch (_) {}
      return true;
    };

    if (!isStyleDebugEnabled()) return;

    const run = (reason) => {
      window.requestAnimationFrame(() => {
        window.setTimeout(() => {
          logStyleDiagnostics(reason);
        }, 150);
      });
    };

    if (document.readyState === 'complete') {
      run('ready');
    } else {
      window.addEventListener('load', () => run('load'), { once: true });
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) run('visible');
    });
  }

  applyStoredThemeSnapshot();
  setupStyleDiagnostics();

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
    const groups = [
      {
        id: 'editorial',
        label: 'Editorial',
        icon: 'fas fa-pen-nib',
        links: [
          { href: 'generarLectura.html', icon: 'fas fa-chart-line', label: 'Análisis editorial', id: 'analisisEditorialLink', roleVisibility: 'admin,author,editor,developer' },
          { href: '/MarcieBlogEditor.html', icon: 'fas fa-pen', label: 'Marcie Blog Editor', id: 'marcieBlogEditorLink', requiresAuth: true },
          { href: 'charly-brown.html', icon: 'fas fa-wand-magic-sparkles', label: 'Charly Brown', id: 'charlyBrownLink', roleVisibility: 'admin,author,editor,developer' },
          { href: 'moodleCourse.html', icon: 'fas fa-book', label: 'Crear cursos de Moodle' },
          { href: 'PeppermintPattyAnalizer.html', icon: 'fas fa-file-pdf', label: 'Peppermint Patty Analizer' },
          { href: 'voiceTranscribe.html', icon: 'fas fa-microphone-lines', label: 'Voice Transcribe' },
        ]
      },
      {
        id: 'multimedia',
        label: 'Multimedia',
        icon: 'fas fa-photo-film',
        links: [
          { href: 'podcaster.html', icon: 'fas fa-podcast', label: 'Podcaster Studio' },
          { href: 'scienceActivities.html', icon: 'fas fa-flask', label: 'Actividades de ciencias' },
          { href: 'PigPenCreator.html', icon: 'fas fa-door-closed', label: 'PigPen Escape Rooms' },
          { href: 'experienciaMenu.html', icon: 'fas fa-layer-group', label: 'Experiencias' },
          { href: 'imageCreator.html', icon: 'fas fa-images', label: 'Image Creator' }
        ]
      },
      {
        id: 'config',
        label: 'Config',
        icon: 'fas fa-gear',
        links: [
          { href: 'perfil.html', icon: 'fas fa-user', label: 'Perfil' },
          { href: 'gestionUsuarios.html', icon: 'fas fa-users-cog', label: 'Usuarios', id: 'gestionUsuariosLink', roleVisibility: 'admin' }
        ]
      },
      {
        id: 'otros',
        label: 'Otros',
        icon: 'fas fa-ellipsis',
        links: [
          { href: 'chat.html', icon: 'fas fa-comment', label: 'Chat', id: 'chatLink' },
          { href: '#', icon: 'fas fa-sliders-h', label: 'Tema del sistema', id: 'themeSettingsLink' }
        ]
      }
    ];

    const toRootSidebarHref = (href = '') => {
      const value = String(href || '').trim();
      if (!value || value === '#' || value.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(value)) return value;
      return `/${value.replace(/^\.\//, '')}`;
    };

    const sidebarActiveTones = [
      'teal', 'blue', 'violet', 'amber', 'rose', 'cyan', 'lime',
      'orange', 'fuchsia', 'sky', 'emerald', 'indigo', 'pink', 'yellow'
    ];
    let sidebarToneIndex = 0;

    const isLinkActive = (link) => {
      if (!link?.href || link.href === '#') return false;
      try {
        const pathname = new URL(link.href, window.location.href).pathname;
        return normalizePageId(pathname.split('/').pop()) === currentPage;
      } catch (_) {
        return String(link.href || '').toLowerCase() === currentPage;
      }
    };

    const renderLink = (link, extraClasses = []) => {
      const isAction = link.href === '#';
      const isActive = !isAction && isLinkActive(link);
      const resolvedHref = toRootSidebarHref(link.href);
      const classes = ['sidebar-link', ...extraClasses];
      if (extraClasses.includes('sidebar-group-link')) {
        classes.push(`sidebar-tone-${sidebarActiveTones[sidebarToneIndex % sidebarActiveTones.length]}`);
        sidebarToneIndex += 1;
      }
      if (link.roleVisibility) classes.push('d-none');
      if (link.requiresAuth) classes.push('d-none');
      const attrs = [
        `href="${resolvedHref}"`,
        `class="${classes.join(' ')}"`,
        `title="${link.label}"`,
        isActive ? 'aria-current="page"' : ''
      ];
      if (link.id) attrs.push(`id="${link.id}"`);
      if (link.roleVisibility) attrs.push(`data-role-visibility="${link.roleVisibility}"`, 'hidden', 'aria-hidden="true"', 'tabindex="-1"');
      if (link.requiresAuth) attrs.push('data-auth-required="true"', 'hidden', 'aria-hidden="true"', 'tabindex="-1"');
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
    };

    const groupedLinks = groups.map((group) => {
      const containsActivePage = group.links.some((link) => isLinkActive(link));
      const panelId = `sidebarGroupPanel-${group.id}`;
      return `
        <section class="sidebar-group${containsActivePage ? ' is-expanded' : ''}" data-sidebar-group="${group.id}">
          <button class="sidebar-group-toggle" type="button" aria-expanded="${containsActivePage ? 'true' : 'false'}"
            aria-controls="${panelId}" title="${group.label}">
            <i class="${group.icon} sidebar-group-icon" aria-hidden="true"></i>
            <span>${group.label}</span>
            <i class="fas fa-chevron-down sidebar-group-chevron" aria-hidden="true"></i>
          </button>
          <div id="${panelId}" class="sidebar-group-items" role="group" aria-label="${group.label}"${containsActivePage ? '' : ' hidden'}>
            ${group.links.map((link) => renderLink(link, ['sidebar-group-link'])).join('')}
          </div>
        </section>
      `;
    }).join('');

    const favoritesToggle = showFavoritesToggle
      ? `
        <button id="toggleFavorites" class="btn btn-sm btn-light ms-auto" title="Favoritos">
          <i class="fas fa-star"></i>
        </button>
      `
      : '';

    return `
      <div class="sidebar-primary-action">
        ${renderLink({ href: 'home.html', icon: 'fas fa-house', label: 'Inicio' }, ['sidebar-home-link'])}
      </div>
      <div class="sidebar-groups" aria-label="Accesos agrupados">
        ${groupedLinks}
      </div>
      <div class="sidebar-footer-actions">
        ${favoritesToggle}
        <a href="#" class="sidebar-link" id="logoutLink">
          <i class="fas fa-arrow-right-from-bracket"></i>
          <span>Cerrar sesión</span>
        </a>
      </div>
    `;
  }

  const headerContent = document.querySelector('.main-header .header-content');
  if (headerContent) {
    headerContent.innerHTML = renderHeader(cfg.title, cfg.header);
  }

  setHeaderUserEmail('');

  const sidebarMenu = document.querySelector('#sidebar .sidebar-menu');
  if (sidebarMenu) {
    sidebarMenu.innerHTML = renderSidebar(page, !!cfg.showFavoritesToggle);
  }

  ensureThemeManagerScript();
  document.dispatchEvent(new CustomEvent('charlylayout:ready'));
})();
