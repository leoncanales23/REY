(() => {
  'use strict';

  const STORAGE_KEY = 'reinos.replays.v1';
  const MAX_REPLAYS = 12;
  const byId = (id) => document.getElementById(id);

  function safeJson(value, fallback) {
    try {
      return JSON.parse(value) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function loadLibrary() {
    const raw = safeJson(localStorage.getItem(STORAGE_KEY), []);
    return Array.isArray(raw) ? raw.slice(0, MAX_REPLAYS) : [];
  }

  function saveLibrary(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_REPLAYS)));
    } catch {
      const reduced = items.slice(0, Math.max(1, Math.floor(MAX_REPLAYS / 2)));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reduced));
    }
  }

  function replayId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    return `replay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalize(record) {
    if (!window.REINOS || typeof REINOS.normalizeReplay !== 'function') return null;
    return REINOS.normalizeReplay(record);
  }

  function formatDuration(seconds) {
    const value = Math.max(0, Math.round(Number(seconds) || 0));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  }

  function formatDate(timestamp) {
    try {
      return new Intl.DateTimeFormat('es-CL', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(timestamp));
    } catch {
      return new Date(timestamp).toLocaleString();
    }
  }

  function sideName(side) {
    return side === 'blue' ? 'NELSON' : 'LEÓN';
  }

  function kindName(kind) {
    if (kind === 'campaign') return 'CAMPAÑA';
    if (kind === 'scenario') return 'ESCENARIO';
    if (kind === 'online') return 'DUELO ONLINE';
    return 'UN JUGADOR';
  }

  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function createReplayCard(entry) {
    const record = normalize(entry.record || entry);
    if (!record) return null;

    const article = document.createElement('article');
    article.className = 'replay-card';

    const heading = document.createElement('div');
    heading.className = 'replay-card-heading';
    const title = document.createElement('strong');
    title.textContent = record.title;
    const result = document.createElement('span');
    result.className = record.result === 'victory' ? 'victory' : 'defeat';
    result.textContent = record.result === 'victory' ? 'VICTORIA' : 'DERROTA';
    heading.append(title, result);

    const meta = document.createElement('p');
    meta.textContent = `${kindName(record.kind)} · ${sideName(record.side)} · ${formatDuration(record.durationSeconds)} · ${record.commands.length} órdenes`;

    const detail = document.createElement('p');
    detail.textContent = `Semilla ${record.seed} · checksum ${record.finalChecksum} · ${formatDate(entry.savedAt || record.finishedAt || Date.now())}`;

    const actions = document.createElement('div');
    actions.className = 'replay-card-actions';

    const play = document.createElement('button');
    play.className = 'mini-btn';
    play.type = 'button';
    play.textContent = 'REPRODUCIR';
    play.addEventListener('click', () => {
      closeDialog();
      REINOS.startReplay(record);
    });

    const exportButton = document.createElement('button');
    exportButton.className = 'mini-btn';
    exportButton.type = 'button';
    exportButton.textContent = 'EXPORTAR';
    exportButton.addEventListener('click', () => {
      downloadJson(`reinos-replay-${record.finishedAt || Date.now()}.json`, {
        schema: 'reinos-replay-v2',
        replay: record,
      });
    });

    const remove = document.createElement('button');
    remove.className = 'mini-btn danger';
    remove.type = 'button';
    remove.textContent = 'BORRAR';
    remove.addEventListener('click', () => {
      saveLibrary(loadLibrary().filter((item) => item.id !== entry.id));
      renderLibrary();
    });

    actions.append(play, exportButton, remove);
    article.append(heading, meta, detail, actions);
    return article;
  }

  function renderLibrary() {
    const list = byId('replayList');
    const summary = byId('replaySummary');
    if (!list) return;
    const library = loadLibrary();
    const compatible = [];
    let incompatible = 0;
    for (const entry of library) {
      const record = normalize(entry.record || entry);
      if (record) compatible.push({ entry, record });
      else incompatible++;
    }
    list.replaceChildren();
    if (summary) summary.textContent = `${compatible.length}/${MAX_REPLAYS} COMPATIBLES${incompatible ? ` · ${incompatible} ANTIGUAS O INCOMPATIBLES` : ''}`;
    if (!compatible.length) {
      const empty = document.createElement('p');
      empty.className = 'replay-empty';
      empty.textContent = incompatible
        ? 'Las grabaciones v1 no contienen checksum final y no pueden verificarse. Puedes exportarlas antes de limpiar la biblioteca.'
        : 'Las batallas terminadas en este dispositivo aparecerán aquí.';
      list.appendChild(empty);
      return;
    }
    for (const { entry } of compatible) {
      const card = createReplayCard(entry);
      if (card) list.appendChild(card);
    }
  }

  function openDialog() {
    renderLibrary();
    const dialog = byId('replayDialog');
    if (!dialog) return;
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeDialog() {
    const dialog = byId('replayDialog');
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }

  function storeReplay(input) {
    const record = normalize(input);
    if (!record || record.durationSeconds < 5 || !record.commands.length) return;
    const library = loadLibrary();
    library.unshift({ id: replayId(), savedAt: Date.now(), record });
    saveLibrary(library);
    renderLibrary();
  }

  function exportLibrary() {
    downloadJson('reinos-repeticiones.json', {
      schema: 'reinos-replays-v2',
      exportedAt: new Date().toISOString(),
      replays: loadLibrary(),
    });
  }

  async function importLibrary(file) {
    if (!file || file.size > 2000000) return;
    const payload = safeJson(await file.text(), null);
    const incoming = payload?.replay
      ? [payload.replay]
      : Array.isArray(payload) ? payload : payload?.replays;
    if (!Array.isArray(incoming)) return;

    const accepted = [];
    for (const item of incoming.slice(0, MAX_REPLAYS)) {
      const record = normalize(item?.record || item);
      if (!record) continue;
      accepted.push({ id: item?.id || replayId(), savedAt: Date.now(), record });
    }
    if (!accepted.length) return;
    saveLibrary([...accepted, ...loadLibrary()].slice(0, MAX_REPLAYS));
    renderLibrary();
  }

  function clearLibrary() {
    if (!window.confirm('¿Borrar todas las repeticiones guardadas?')) return;
    localStorage.removeItem(STORAGE_KEY);
    renderLibrary();
  }

  function updateReplayControls(state = {}) {
    const pause = byId('replayPauseBtn');
    const speed = byId('replaySpeedBtn');
    const info = byId('replayInfo');
    const active = !!state.active;
    if (pause) {
      pause.hidden = !active;
      pause.textContent = state.paused ? '▶' : 'Ⅱ';
      pause.title = state.paused ? 'Continuar repetición' : 'Pausar repetición';
    }
    if (speed) {
      speed.hidden = !active;
      speed.textContent = `${state.speed || 1}×`;
    }
    if (info) {
      info.style.display = active ? 'block' : 'none';
      if (active) {
        const verified=state.verification?.matched?` · ✓ ${state.verification.actual}`:'';
        info.textContent = `REPETICIÓN · ${state.title || 'BATALLA'} · ${state.paused ? 'PAUSA' : `${state.speed || 1}×`}${verified}`;
      }
    }
  }

  window.addEventListener('reinos:replay-complete', (event) => storeReplay(event.detail));
  window.addEventListener('reinos:replay-state', (event) => updateReplayControls(event.detail || {}));
  window.addEventListener('reinos:replay-verified', (event) => updateReplayControls({active:true,speed:1,title:'VERIFICADA',verification:event.detail}));

  byId('openReplayBtn')?.addEventListener('click', openDialog);
  byId('closeReplayBtn')?.addEventListener('click', closeDialog);
  byId('replayDialog')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeDialog();
  });
  byId('replayExportBtn')?.addEventListener('click', exportLibrary);
  byId('replayClearBtn')?.addEventListener('click', clearLibrary);
  byId('replayImportInput')?.addEventListener('change', async (event) => {
    await importLibrary(event.target.files?.[0]);
    event.target.value = '';
  });
  byId('replayPauseBtn')?.addEventListener('click', () => {
    const state = REINOS.toggleReplayPause?.();
    if (state) updateReplayControls(state);
  });
  byId('replaySpeedBtn')?.addEventListener('click', () => {
    const state = REINOS.cycleReplaySpeed?.();
    if (state) updateReplayControls(state);
  });

  renderLibrary();
})();
