(function () {
  const VERSION_URL = 'version.json';
  const STORAGE_KEY = 'app_version';
  const FORCE_ACK_KEY_PREFIX = 'force_update_ack_';
  const BANNER_ID = 'updateBanner';
  const LAUNCHER_ID = 'updateBannerLauncher';
  const DEFAULT_TITLE = 'Nuevas actualizaciones';
  const DEFAULT_MESSAGE = 'Hay nuevas actualizaciones en el sistema, por favor da click aqui para actualizar';

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
        top: 20px;
        bottom: auto;
        z-index: 10000;
        margin: 0;
        padding: 12px 14px;
        border-radius: 10px;
        background: var(--app-alert-bg, #facc15);
        color: var(--app-alert-text, #111111);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.01em;
        cursor: pointer;
        border: 2px solid var(--app-alert-border, #111111);
        box-shadow: 0 12px 26px rgba(0, 0, 0, 0.28);
        flex-direction: column;
        gap: 6px;
        max-width: 380px;
      }
      .update-banner-head {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 2px;
      }
      .update-banner-icon {
        width: 18px;
        height: 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--app-alert-text, #111111);
        font-size: 15px;
        line-height: 1;
      }
      .update-banner-title {
        font-size: 12px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .update-banner-msg {
        font-size: 12px;
        font-weight: 600;
        text-transform: none;
        letter-spacing: 0;
        color: var(--app-alert-text, #111111);
      }
      .update-banner-cta {
        font-size: 11px;
        font-weight: 700;
        color: var(--app-alert-text, #1f2937);
      }
      .update-banner-summary {
        margin-top: 4px;
        border-top: 1px dashed var(--app-alert-border, #111111);
        padding-top: 6px;
      }
      .update-banner-summary > summary {
        cursor: pointer;
        list-style: none;
        font-size: 11px;
        font-weight: 800;
        color: var(--app-alert-text, #111111);
      }
      .update-banner-summary > summary::-webkit-details-marker {
        display: none;
      }
      .update-banner-summary > summary::before {
        content: "▸";
        margin-right: 6px;
      }
      .update-banner-summary[open] > summary::before {
        content: "▾";
      }
      .update-banner-list {
        margin: 6px 0 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 4px;
        max-height: 160px;
        overflow-y: auto;
      }
      .update-banner-item {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        font-size: 11px;
        line-height: 1.35;
        color: var(--app-alert-text, #111111);
      }
      .update-banner-item-index {
        min-width: 14px;
        color: var(--app-alert-text, #111111);
        font-weight: 800;
      }
      .update-banner:hover {
        background: color-mix(in srgb, var(--app-alert-bg, #facc15) 86%, #ffffff 14%);
        border-color: var(--app-alert-border, #111111);
        transform: translateY(-1px);
      }
      .update-banner:focus {
        outline: 2px solid color-mix(in srgb, var(--app-alert-border, #111111) 55%, transparent);
        outline-offset: 2px;
      }
      .update-banner.is-visible {
        display: flex;
      }
      .update-banner-launcher {
        display: none;
        align-items: center;
        justify-content: center;
        min-height: 38px;
        padding: 0 18px;
        border: 0;
        border-radius: 999px;
        background: linear-gradient(
          180deg,
          color-mix(in srgb, var(--cb-chrome-bg, #1677f2) 82%, #ffffff 18%) 0%,
          var(--cb-chrome-bg, #1677f2) 100%
        );
        color: var(--cb-header-text-color, #ffffff);
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.01em;
        cursor: pointer;
        box-shadow: 0 8px 18px color-mix(in srgb, var(--cb-chrome-bg, #1677f2) 28%, transparent);
        margin-left: auto;
        white-space: nowrap;
      }
      .update-banner-launcher:hover {
        background: linear-gradient(
          180deg,
          color-mix(in srgb, var(--cb-chrome-bg, #1677f2) 74%, #ffffff 26%) 0%,
          color-mix(in srgb, var(--cb-chrome-bg, #1677f2) 92%, #000000 8%) 100%
        );
        transform: translateY(-1px);
      }
      .update-banner-launcher:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--cb-chrome-bg, #1677f2) 40%, transparent);
        outline-offset: 2px;
      }
      .update-banner-launcher.is-visible {
        display: inline-flex;
      }
    `;
    document.head.appendChild(style);
  }

  function renderBannerContent(banner, info) {
    const title = (info && typeof info.title === 'string' && info.title.trim()) || DEFAULT_TITLE;
    const message = (info && typeof info.message === 'string' && info.message.trim()) || DEFAULT_MESSAGE;
    const updates = normalizeUpdates(info && info.updates);

    const listHtml = updates.length
      ? `
      <details class="update-banner-summary">
        <summary>Últimas actualizaciones (${updates.length})</summary>
        <ul class="update-banner-list" aria-label="Lista de actualizaciones recientes">
          ${updates.map((item, idx) => `
            <li class="update-banner-item">
              <span class="update-banner-item-index">${idx + 1}.</span>
              <span>${escapeHtml(item)}</span>
            </li>
          `).join('')}
        </ul>
      </details>
      `
      : '';

    banner.innerHTML = `
      <div class="update-banner-head">
        <span class="update-banner-icon" aria-hidden="true">⚠</span>
        <div class="update-banner-title">${escapeHtml(title)}</div>
      </div>
      <div class="update-banner-msg">${escapeHtml(message)}</div>
      <div class="update-banner-cta">Acción: haz clic para actualizar ahora.</div>
      ${listHtml}
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
    if (!headerContent) return btn || null;

    if (!btn) {
      btn = document.createElement('button');
      btn.id = LAUNCHER_ID;
      btn.type = 'button';
      btn.className = 'update-banner-launcher';
      btn.textContent = 'Update';
      btn.setAttribute('aria-label', 'Ver actualización disponible');
    }

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
    const title = (info && typeof info.title === 'string' && info.title.trim()) || DEFAULT_TITLE;
    const updatesCount = normalizeUpdates(info && info.updates).length;
    btn.title = updatesCount
      ? `${title} (${updatesCount} cambios)`
      : title;
  }

  async function hardRefresh(version) {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
    } catch (_) {
      // ignore cache delete errors
    }
    const url = new URL(window.location.href);
    url.searchParams.set('v', version || Date.now().toString());
    window.location.replace(url.toString());
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

  ensureStyles();
  const banner = ensureBanner();
  const ensureLauncherBinding = () => {
    const btn = ensureLauncher();
    if (!btn || btn.dataset.boundUpdateBanner === '1') return;
    btn.dataset.boundUpdateBanner = '1';
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const latestInfo = latestInfoCache || await fetchVersionInfo().catch(() => null);
      if (!latestInfo?.version) return;
      if (banner.classList.contains('is-visible')) {
        hideBanner();
        return;
      }
      showBanner(latestInfo);
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

  banner.addEventListener('click', async () => {
    const latestInfo = latestInfoCache || await fetchVersionInfo().catch(() => null);
    const latest = latestInfo && latestInfo.version ? latestInfo.version : '';
    if (latest) {
      localStorage.setItem(STORAGE_KEY, latest);
      localStorage.setItem(`${FORCE_ACK_KEY_PREFIX}${latest}`, '1');
    }
    hardRefresh(latest);
  });

  banner.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      banner.click();
    }
  });

  // Permite abrir/cerrar el summary sin disparar actualización.
  banner.addEventListener('click', (e) => {
    if (e.target && e.target.closest('.update-banner-summary')) {
      e.stopPropagation();
    }
  }, true);

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
})();
