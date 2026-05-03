(function () {
  const VERSION_URL = 'version.json';
  const STORAGE_KEY = 'app_version';
  const FORCE_ACK_KEY_PREFIX = 'force_update_ack_';
  const BANNER_ID = 'updateBanner';
  const LAUNCHER_ID = 'updateBannerLauncher';
  const DEFAULT_TITLE = 'Actualización disponible de Charly Brown';
  const DEFAULT_MESSAGE = 'Hay cambios nuevos en la aplicación. Revisa el resumen y recarga cuando estés listo.';
  const POST_CLEAR_REDIRECT_PATH = '/';
  const WINDOW_NAME_PREFIX = '__cbAppliedVersion__:';
  const HARD_RESET_PARAM = 'cbHardReset';
  const HARD_RESET_DONE_PARAM = 'cbHardResetDone';

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeUpdates(items) {
    if (!Array.isArray(items)) return [];
    return items
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .slice(0, 8);
  }

  function ensureStyles() {
    if (document.getElementById('updateBannerStyles')) return;
    const style = document.createElement('style');
    style.id = 'updateBannerStyles';
    style.textContent = `
      .update-banner {
        display: none;
        position: fixed;
        right: 20px;
        top: 68px;
        bottom: auto;
        z-index: 10000;
        margin: 0;
        padding: 12px 14px 10px;
        border-radius: 14px;
        background: rgba(7, 10, 20, 0.96);
        color: #f8fafc;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.01em;
        border: 1px solid rgba(250, 204, 21, 0.45);
        box-shadow: 0 18px 34px rgba(0, 0, 0, 0.34);
        flex-direction: column;
        gap: 8px;
        max-width: 420px;
        pointer-events: none;
      }
      .update-banner-title {
        font-size: 12px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #facc15;
      }
      .update-banner-list {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 6px;
        max-height: 220px;
        overflow-y: auto;
      }
      .update-banner-item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        font-size: 12px;
        line-height: 1.4;
        color: #f8fafc;
      }
      .update-banner-item-index {
        min-width: 16px;
        color: #facc15;
        font-weight: 800;
      }
      .update-banner.is-visible {
        display: flex;
      }
      #${LAUNCHER_ID}.update-banner-launcher {
        display: none;
        position: relative;
        align-items: center;
        justify-content: center;
        gap: 8px;
        height: 30px;
        padding: 0 0.75rem;
        border: 1px solid rgba(255, 255, 255, 0.4);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.18);
        color: #fff !important;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.01em;
        text-transform: none;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
        margin-left: auto;
        white-space: nowrap;
        transition: all 0.2s ease;
      }
      #${LAUNCHER_ID}.update-banner-launcher,
      #${LAUNCHER_ID}.update-banner-launcher:visited,
      #${LAUNCHER_ID}.update-banner-launcher:active {
        color: #fff !important;
        border-color: rgba(255, 255, 255, 0.4);
        text-decoration: none !important;
        opacity: 1 !important;
      }
      #${LAUNCHER_ID}.update-banner-launcher:hover {
        background: rgba(255, 255, 255, 0.28);
        border-color: rgba(255, 255, 255, 0.6);
        transform: translateY(-1px);
        box-shadow: 0 6px 15px rgba(0, 0, 0, 0.18);
      }
      #${LAUNCHER_ID}.update-banner-launcher:hover,
      #${LAUNCHER_ID}.update-banner-launcher:hover span,
      #${LAUNCHER_ID}.update-banner-launcher:hover i {
        color: #ffffff !important;
      }
      #${LAUNCHER_ID}.update-banner-launcher:focus-visible {
        outline: 2px solid rgba(255, 255, 255, 0.5);
        outline-offset: 2px;
      }
      #${LAUNCHER_ID}.update-banner-launcher span,
      #${LAUNCHER_ID}.update-banner-launcher i {
        position: relative;
        z-index: 1;
        color: inherit !important;
        opacity: 1 !important;
      }
      #${LAUNCHER_ID}.update-banner-launcher.is-visible {
        display: inline-flex;
      }
      #${LAUNCHER_ID}.update-banner-launcher.is-floating {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10001;
        margin-left: 0;
      }
      #${LAUNCHER_ID} .update-banner-launcher-icon {
        color: #facc15;
        font-size: 11px;
        line-height: 1;
      }
      #${LAUNCHER_ID}.update-banner-launcher:hover .update-banner-launcher-icon {
        color: #facc15;
      }

      @media (prefers-reduced-motion: reduce) {
        #${LAUNCHER_ID}.update-banner-launcher,
        #${LAUNCHER_ID}.update-banner-launcher::before {
          animation: none;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function renderBannerContent(banner, info) {
    const updates = normalizeUpdates(info && info.updates);
    banner.innerHTML = updates.length
      ? `
      <div class="update-banner-title">Cambios incluidos</div>
      <ul class="update-banner-list" aria-label="Lista de actualizaciones recientes">
        ${updates.map((item, idx) => `
          <li class="update-banner-item">
            <span class="update-banner-item-index">${idx + 1}.</span>
            <span>${escapeHtml(item)}</span>
          </li>
        `).join('')}
      </ul>
    `
      : `
      <div class="update-banner-title">Cambios incluidos</div>
      <ul class="update-banner-list" aria-label="Lista de actualizaciones recientes">
        <li class="update-banner-item">
          <span class="update-banner-item-index">1.</span>
          <span>Hay una actualización lista para aplicar.</span>
        </li>
      </ul>
    `;
  }

  function ensureBanner() {
    let banner = document.getElementById(BANNER_ID);
    if (!banner) {
      banner = document.createElement('div');
      banner.id = BANNER_ID;
      banner.className = 'update-banner';
      banner.setAttribute('role', 'button');
      banner.setAttribute('tabindex', '0');
      banner.setAttribute('aria-live', 'polite');
      document.body.appendChild(banner);
    }
    renderBannerContent(banner, null);
    return banner;
  }

  function getHeaderContent() {
    return document.querySelector('.main-header .header-content');
  }

  function ensureLauncher() {
    let btn = document.getElementById(LAUNCHER_ID);
    const headerContent = getHeaderContent();

    if (!btn) {
      btn = document.createElement('button');
      btn.id = LAUNCHER_ID;
      btn.type = 'button';
      btn.className = 'update-banner-launcher';
      btn.innerHTML = '<span class="update-banner-launcher-icon" aria-hidden="true">⚠</span><span>Actualizar ahora</span>';
      btn.setAttribute('aria-label', 'Actualizar ahora');
    }

    if (!headerContent) {
      if (btn.parentElement !== document.body && document.body) {
        document.body.appendChild(btn);
      }
      btn.classList.add('is-floating');
      return btn;
    }

    btn.classList.remove('is-floating');
    if (btn.parentElement !== headerContent) {
      headerContent.appendChild(btn);
    }

    return btn;
  }

  function hideBanner() {
    banner.classList.remove('is-visible');
  }

  function showBanner(info) {
    renderBannerContent(banner, info || latestInfoCache || null);
    banner.classList.add('is-visible');
  }

  function hideLauncher() {
    pendingLauncherInfo = null;
    const btn = document.getElementById(LAUNCHER_ID);
    if (btn) {
      btn.classList.remove('is-visible');
      btn.removeAttribute('data-version');
      btn.removeAttribute('title');
    }
  }

  function showLauncher(info) {
    pendingLauncherInfo = info || latestInfoCache || null;
    const btn = ensureLauncher();
    if (!btn) return; // header-content todavía no existe o fue rerenderizado; el observer lo reinsertará
    if (typeof ensureLauncherBinding === 'function') ensureLauncherBinding();
    const version = String(info?.version || '');
    btn.classList.add('is-visible');
    if (version) btn.setAttribute('data-version', version);
    const updatesCount = normalizeUpdates(info && info.updates).length;
    btn.title = updatesCount
      ? `Actualizar ahora (${updatesCount} cambios)`
      : 'Actualizar ahora';
  }

  function persistAppliedVersionFromWindowName() {
    try {
      const rawWindowName = String(window.name || '');
      if (!rawWindowName.startsWith(WINDOW_NAME_PREFIX)) return;
      const appliedVersion = rawWindowName.slice(WINDOW_NAME_PREFIX.length).trim();
      if (!appliedVersion) return;
      localStorage.setItem(STORAGE_KEY, appliedVersion);
      localStorage.setItem(`${FORCE_ACK_KEY_PREFIX}${appliedVersion}`, '1');
      window.name = '';
    } catch (_) {
      // ignore
    }
  }

  async function clearIndexedDbStorage() {
    if (!('indexedDB' in window)) return;
    if (typeof indexedDB.databases === 'function') {
      try {
        const databases = await indexedDB.databases();
        await Promise.all((databases || []).map((entry) => {
          const name = String(entry?.name || '').trim();
          if (!name) return Promise.resolve();
          return new Promise((resolve) => {
            const request = indexedDB.deleteDatabase(name);
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
            request.onblocked = () => resolve();
          });
        }));
        return;
      } catch (_) {
        // ignore and continue
      }
    }
  }

  function clearCookieStorage() {
    try {
      const cookies = String(document.cookie || '').split(';');
      cookies.forEach((cookie) => {
        const eqIndex = cookie.indexOf('=');
        const rawName = eqIndex >= 0 ? cookie.slice(0, eqIndex) : cookie;
        const name = rawName.trim();
        if (!name) return;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
      });
    } catch (_) {
      // ignore
    }
  }

  async function clearOriginBrowsingData() {
    try {
      if ('serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all((registrations || []).map((registration) => registration.unregister().catch(() => false)));
        } catch (_) {
          // ignore service worker cleanup errors
        }
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      await clearIndexedDbStorage();
      try { localStorage.clear(); } catch (_) {}
      try { sessionStorage.clear(); } catch (_) {}
      clearCookieStorage();
    } catch (_) {
      // ignore storage cleanup errors
    }
  }

  async function hardRefresh(version) {
    const url = new URL(POST_CLEAR_REDIRECT_PATH, window.location.origin);
    url.searchParams.set(HARD_RESET_PARAM, '1');
    try {
      window.name = version ? `${WINDOW_NAME_PREFIX}${version}` : '';
    } catch (_) {
      // ignore
    }
    await clearOriginBrowsingData();
    window.location.replace(url.toString());
  }

  async function runIndexHardResetIfRequested() {
    let url;
    try {
      url = new URL(window.location.href);
    } catch (_) {
      return false;
    }
    const path = String(url.pathname || '').toLowerCase();
    const isIndex = path === '/' || path.endsWith('/index.html');
    if (!isIndex || url.searchParams.get(HARD_RESET_PARAM) !== '1') return false;

    const version = String(url.searchParams.get('v') || '').trim();
    if (url.searchParams.get(HARD_RESET_DONE_PARAM) === '1') {
      try {
        if (version) window.name = `${WINDOW_NAME_PREFIX}${version}`;
      } catch (_) {}
      return false;
    }

    try {
      if (version) window.name = `${WINDOW_NAME_PREFIX}${version}`;
    } catch (_) {}
    await clearOriginBrowsingData();
    const nextUrl = new URL(POST_CLEAR_REDIRECT_PATH, window.location.origin);
    window.location.replace(nextUrl.toString());
    return true;
  }

  async function fetchVersionInfo() {
    const bust = Date.now().toString();
    const res = await fetch(`${VERSION_URL}?t=${bust}`, { cache: 'no-store' });
    if (!res.ok) {
      return { version: '', title: DEFAULT_TITLE, message: DEFAULT_MESSAGE, updates: [] };
    }
    const data = await res.json();
    return {
      version: data && data.version ? String(data.version) : '',
      title: data && typeof data.title === 'string' ? data.title : DEFAULT_TITLE,
      message: data && typeof data.message === 'string' ? data.message : DEFAULT_MESSAGE,
      updates: normalizeUpdates(data && data.updates),
      forceClearCache: !!(data && data.forceClearCache),
      forceClearCacheReason: data && typeof data.forceClearCacheReason === 'string' ? data.forceClearCacheReason : ''
    };
  }

  let latestInfoCache = null;
  let pendingLauncherInfo = null;
  let banner = null;
  window.__cbUpdateDiagnostics = function getCbUpdateDiagnostics() {
    const url = new URL(window.location.href);
    return {
      version: latestInfoCache?.version || '',
      forceClearCache: latestInfoCache?.forceClearCache === true,
      urlVersion: url.searchParams.get('v') || '',
      launcherVisible: !!document.getElementById(LAUNCHER_ID)?.classList.contains('is-visible')
    };
  };

  async function checkVersion() {
    try {
      const latestInfo = await fetchVersionInfo();
      latestInfoCache = latestInfo;
      const latest = latestInfo.version;
      if (!latest) return;
      const current = localStorage.getItem(STORAGE_KEY);
      const forceAckKey = `${FORCE_ACK_KEY_PREFIX}${latest}`;
      const forceAck = localStorage.getItem(forceAckKey) === '1';

      const hasPendingUpdate = (latestInfo.forceClearCache && !forceAck) || (!current || current !== latest);

      // Si hay fuerza de actualización, SOLO ofrecer launcher (sin refresco automático).
      if (latestInfo.forceClearCache && !forceAck) {
        hideBanner();
        showLauncher(latestInfo);
        return;
      }

      if (hasPendingUpdate) {
        hideBanner();
        showLauncher(latestInfo);
      } else {
        hideBanner();
        hideLauncher();
      }
    } catch (_) {
      // ignore
    }
  }

  function startUpdateBanner() {
  persistAppliedVersionFromWindowName();
  ensureStyles();
  banner = ensureBanner();
  const ensureLauncherBinding = () => {
    const btn = ensureLauncher();
    if (!btn || btn.dataset.boundUpdateBanner === '1') return;
    btn.dataset.boundUpdateBanner = '1';
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const latestInfo = latestInfoCache || await fetchVersionInfo().catch(() => null);
      if (!latestInfo?.version) return;
      localStorage.setItem(STORAGE_KEY, latestInfo.version);
      localStorage.setItem(`${FORCE_ACK_KEY_PREFIX}${latestInfo.version}`, '1');
      hardRefresh(latestInfo.version);
    });
    btn.addEventListener('mouseenter', async () => {
      const latestInfo = latestInfoCache || await fetchVersionInfo().catch(() => null);
      if (!latestInfo?.version) return;
      showBanner(latestInfo);
    });
    btn.addEventListener('mouseleave', () => {
      hideBanner();
    });
    btn.addEventListener('focus', async () => {
      const latestInfo = latestInfoCache || await fetchVersionInfo().catch(() => null);
      if (!latestInfo?.version) return;
      showBanner(latestInfo);
    });
    btn.addEventListener('blur', () => {
      hideBanner();
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        hideBanner();
      }
    });
  };
  ensureLauncherBinding();

  // Si otro script (p. ej. chromeLayout.js) vuelve a renderizar el header y borra el botón,
  // lo reinstalamos automáticamente cuando haya una actualización pendiente.
  const headerObserver = new MutationObserver(() => {
    if (pendingLauncherInfo) showLauncher(pendingLauncherInfo);
    else ensureLauncherBinding();
  });
  headerObserver.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true
  });

  let lastCheck = 0;
  const MIN_INTERVAL_MS = 60 * 1000;

  function scheduleCheck() {
    const now = Date.now();
    if (now - lastCheck < MIN_INTERVAL_MS) return;
    lastCheck = now;
    ensureLauncherBinding();
    checkVersion();
  }

  checkVersion();
  // Segundo intento al terminar de cargar layout/scripts del header.
  window.addEventListener('load', () => {
    ensureLauncherBinding();
    scheduleCheck();
  }, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleCheck();
  });

  // Polling periódico para detectar versiones nuevas sin recargar ni interacción.
  setInterval(() => {
    if (document.hidden) return;
    scheduleCheck();
  }, MIN_INTERVAL_MS);

  const activityEvents = ['click', 'keydown', 'touchstart', 'mousemove'];
  let activityTimer = null;
  activityEvents.forEach(evt => {
    document.addEventListener(evt, () => {
      if (document.hidden) return;
      if (activityTimer) return;
      activityTimer = setTimeout(() => {
        activityTimer = null;
        scheduleCheck();
      }, 1500);
    }, { passive: true });
  });
  }

  runIndexHardResetIfRequested().then((redirecting) => {
    if (!redirecting) startUpdateBanner();
  }).catch(() => {
    startUpdateBanner();
  });
})();
