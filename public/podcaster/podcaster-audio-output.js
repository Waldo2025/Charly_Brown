// Device choice is local to this browser, never part of a shared montage.
(() => {
  const key = 'snoopy.audioOutput';
  let preference = { id: '', label: '' };
  try { preference = JSON.parse(localStorage.getItem(key)) || preference; } catch (_) {}
  if (typeof preference.id !== 'string') preference = { id: '', label: '' };
  const records = new WeakMap();
  const references = new Set();
  const select = document.getElementById('snoopyAudioOutput');
  const button = document.getElementById('snoopyChooseAudioOutput');
  const status = document.getElementById('snoopyAudioOutputStatus');
  const supported = typeof HTMLMediaElement.prototype.setSinkId === 'function';
  const report = message => { if (status) status.textContent = message; };
  const errorText = () => 'No se pudo usar esa salida. Conecta el dispositivo o vuelve a seleccionarlo. No se cambiará automáticamente a Bluetooth.';

  function route(target) {
    const record = records.get(target);
    const id = preference.id;
    if (record.id === id) return record.pending;
    record.id = id;
    record.pending = record.pending.catch(() => {}).then(async () => {
      if (typeof target.setSinkId !== 'function') {
        if (id) throw new Error('Este navegador no permite elegir la salida para este reproductor.');
        return;
      }
      await target.setSinkId(id);
    }).catch(error => {
      record.id = null;
      // If the saved device no longer exists (unplugged/disconnected), clear the
      // preference and fall back to the system default so playback is not blocked.
      if (error.name === 'NotFoundError' && id) {
        preference = { id: '', label: '' };
        try { localStorage.removeItem(key); } catch (_) {}
        report('El dispositivo de audio guardado ya no está disponible. Se usará la salida del sistema.');
        target.setSinkId('').catch(() => {});
        refresh();
        return; // Allow playback to continue with system default
      }
      // Never let a failed explicit selection play through the system default.
      if (id) { target.pause?.(); target.suspend?.().catch(() => {}); }
      report(errorText());
      throw error;
    });
    return record.pending;
  }

  function register(target) {
    if (!target || records.has(target)) return target;
    records.set(target, { id: null, pending: Promise.resolve() });
    references.add(new WeakRef(target));
    if (typeof target.play === 'function') {
      const play = target.play.bind(target);
      const pause = target.pause.bind(target);
      let playRevision = 0;
      target.pause = (...args) => { playRevision += 1; return pause(...args); };
      target.play = async (...args) => {
        const revision = playRevision;
        await route(target);
        if (revision !== playRevision) throw new DOMException('Reproducción cancelada', 'AbortError');
        return play(...args);
      };
    } else if (typeof target.resume === 'function') {
      const resume = target.resume.bind(target);
      target.resume = async (...args) => { await route(target); return resume(...args); };
      if (preference.id && target.state === 'running') {
        target.suspend().then(() => route(target)).then(() => resume()).catch(() => {});
      }
    }
    route(target).catch(() => {});
    return target;
  }

  async function apply(device) {
    preference = { id: device.deviceId || '', label: device.label || '' };
    // Retain the requested output on failure: do not silently resume on Bluetooth.
    try { localStorage.setItem(key, JSON.stringify(preference)); } catch (_) {}
    const pending = [];
    for (const ref of references) {
      const target = ref.deref();
      if (!target) { references.delete(ref); continue; }
      pending.push(route(target));
    }
    const results = await Promise.allSettled(pending);
    if (results.some(result => result.status === 'rejected')) report(errorText());
    else report(preference.id ? `Salida del editor: ${preference.label || 'dispositivo seleccionado'}.` : 'El editor utiliza la salida del sistema, que puede ser Bluetooth.');
    await refresh();
  }

  async function refresh() {
    if (!select) return;
    let devices = [];
    try { devices = await navigator.mediaDevices?.enumerateDevices() || []; } catch (_) {}
    select.replaceChildren(new Option('Salida del sistema (puede ser Bluetooth)', ''));
    const outputs = devices.filter(device => device.kind === 'audiooutput' && device.deviceId && device.deviceId !== 'default');
    for (const device of outputs) select.add(new Option(device.label || 'Salida de audio', device.deviceId));
    if (preference.id && !outputs.some(device => device.deviceId === preference.id)) {
      select.add(new Option(`${preference.label || 'Salida guardada'} — volver a autorizar o conectar`, preference.id));
    }
    select.value = preference.id;
  }

  window.SnoopyAudioOutput = { register, apply, refresh };
  const scan = root => {
    if (root.matches?.('audio,video')) register(root);
    root.querySelectorAll?.('audio,video').forEach(register);
  };
  scan(document);
  new MutationObserver(mutations => {
    for (const mutation of mutations) mutation.addedNodes.forEach(scan);
  }).observe(document.documentElement, { childList: true, subtree: true });
  navigator.mediaDevices?.addEventListener?.('devicechange', () => {
    refresh();
    if (preference.id) report('Comprueba que la salida seleccionada siga conectada.');
  });
  if (select) {
    select.disabled = !supported;
    select.addEventListener('change', () => {
      apply({ deviceId: select.value, label: select.selectedOptions[0]?.textContent }).catch(() => report(errorText()));
    });
  }
  if (button) {
    button.disabled = !supported;
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        if (navigator.mediaDevices?.selectAudioOutput) {
          const device = await navigator.mediaDevices.selectAudioOutput({ deviceId: preference.id });
          await apply(device);
        } else {
          // Chromium exposes output labels/devices after microphone permission.
          // Stop the stream immediately: no recording or transmission takes place.
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(track => track.stop());
          await refresh();
          report('Selecciona los altavoces integrados en la lista de salida de audio.');
          select?.focus();
        }
      } catch (_) { report('No se cambió la salida. Autoriza el acceso a los dispositivos para seleccionarla.'); }
      finally { button.disabled = false; }
    });
  }
  report(!supported ? 'Este navegador no permite elegir la salida de audio. Abre el editor en un navegador compatible.' : preference.id ? `Salida guardada: ${preference.label || 'dispositivo seleccionado'}.` : 'Elige los altavoces integrados para escuchar el editor fuera de tus audífonos Bluetooth.');
  refresh();
})();
