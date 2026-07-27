(() => {
  'use strict';

  const STORAGE_KEY = 'reinos.scenarios.v1';
  const MAX_SCENARIOS = 12;
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
    return Array.isArray(raw) ? raw.slice(0, MAX_SCENARIOS) : [];
  }

  function saveLibrary(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_SCENARIOS)));
  }

  function newId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    return `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function defaults() {
    if (window.REINOS && typeof REINOS.getScenarioDefaults === 'function') {
      return REINOS.getScenarioDefaults();
    }
    return {
      title: 'Frontera sin Nombre',
      side: 'red',
      difficulty: 'warrior',
      age: 2,
      gold: 600,
      wood: 500,
      victoryMode: 'standard',
      holdSeconds: 45,
      worldEvents: true,
      units: { swordsman: 3, archer: 2, knight: 0 },
      seed: 0,
    };
  }

  function normalize(config) {
    if (!window.REINOS || typeof REINOS.normalizeScenario !== 'function') return null;
    return REINOS.normalizeScenario(config);
  }

  function readForm() {
    return normalize({
      title: byId('scenarioTitle')?.value,
      side: byId('scenarioSide')?.value,
      difficulty: byId('scenarioDifficulty')?.value,
      age: Number(byId('scenarioAge')?.value),
      gold: Number(byId('scenarioGold')?.value),
      wood: Number(byId('scenarioWood')?.value),
      victoryMode: byId('scenarioVictoryMode')?.value,
      holdSeconds: Number(byId('scenarioHoldSeconds')?.value),
      worldEvents: !!byId('scenarioWorldEvents')?.checked,
      units: {
        swordsman: Number(byId('scenarioSwordsmen')?.value),
        archer: Number(byId('scenarioArchers')?.value),
        knight: Number(byId('scenarioKnights')?.value),
      },
      seed: Number(byId('scenarioSeed')?.value) || 0,
    });
  }

  function writeForm(config) {
    const value = normalize(config) || normalize(defaults());
    if (!value) return;
    byId('scenarioTitle').value = value.title;
    byId('scenarioSide').value = value.side;
    byId('scenarioDifficulty').value = value.difficulty;
    byId('scenarioAge').value = String(value.age);
    byId('scenarioGold').value = String(value.gold);
    byId('scenarioWood').value = String(value.wood);
    byId('scenarioVictoryMode').value = value.victoryMode;
    byId('scenarioHoldSeconds').value = String(value.holdSeconds);
    byId('scenarioWorldEvents').checked = value.worldEvents;
    byId('scenarioSwordsmen').value = String(value.units.swordsman);
    byId('scenarioArchers').value = String(value.units.archer);
    byId('scenarioKnights').value = String(value.units.knight);
    byId('scenarioSeed').value = value.seed ? String(value.seed) : '';
    syncHoldVisibility();
  }

  function syncHoldVisibility() {
    const row = byId('scenarioHoldRow');
    if (row) row.hidden = byId('scenarioVictoryMode')?.value !== 'crownHold';
  }

  function createScenarioCard(entry) {
    const article = document.createElement('article');
    article.className = 'scenario-card';

    const heading = document.createElement('div');
    heading.className = 'scenario-card-heading';
    const title = document.createElement('strong');
    title.textContent = entry.config.title;
    const faction = document.createElement('span');
    faction.className = entry.config.side;
    faction.textContent = entry.config.side === 'blue' ? 'NELSON' : 'LEÓN';
    heading.append(title, faction);

    const meta = document.createElement('p');
    const victory = {
      standard: 'Castillo o supremacía',
      castleOnly: 'Solo castillo',
      crownHold: `Corona ${entry.config.holdSeconds}s`,
    }[entry.config.victoryMode] || 'Reglas estándar';
    meta.textContent = `Edad ${entry.config.age} · ${entry.config.difficulty.toUpperCase()} · ${victory}`;

    const units = document.createElement('p');
    units.textContent = `⚔ ${entry.config.units.swordsman} · 🏹 ${entry.config.units.archer} · 🐎 ${entry.config.units.knight} · semilla ${entry.config.seed || 'automática'}`;

    const actions = document.createElement('div');
    actions.className = 'scenario-card-actions';

    const play = document.createElement('button');
    play.className = 'mini-btn';
    play.type = 'button';
    play.textContent = 'JUGAR';
    play.addEventListener('click', () => {
      closeDialog();
      REINOS.startScenario(entry.config);
    });

    const edit = document.createElement('button');
    edit.className = 'mini-btn';
    edit.type = 'button';
    edit.textContent = 'EDITAR';
    edit.addEventListener('click', () => writeForm(entry.config));

    const remove = document.createElement('button');
    remove.className = 'mini-btn danger';
    remove.type = 'button';
    remove.textContent = 'BORRAR';
    remove.addEventListener('click', () => {
      saveLibrary(loadLibrary().filter((item) => item.id !== entry.id));
      renderLibrary();
    });

    actions.append(play, edit, remove);
    article.append(heading, meta, units, actions);
    return article;
  }

  function renderLibrary() {
    const list = byId('scenarioList');
    if (!list) return;
    const library = loadLibrary();
    list.replaceChildren();
    if (!library.length) {
      const empty = document.createElement('p');
      empty.className = 'scenario-empty';
      empty.textContent = 'Aún no hay escenarios guardados. El primer mapa está esperando su cartógrafo.';
      list.appendChild(empty);
      return;
    }
    for (const entry of library) {
      const config = normalize(entry.config);
      if (!entry.id || !config) continue;
      list.appendChild(createScenarioCard({ id: entry.id, config }));
    }
  }

  function openDialog() {
    writeForm(defaults());
    renderLibrary();
    const dialog = byId('scenarioDialog');
    if (!dialog) return;
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeDialog() {
    const dialog = byId('scenarioDialog');
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }

  function startCurrent() {
    const config = readForm();
    if (!config) return;
    closeDialog();
    REINOS.startScenario(config);
  }

  function saveCurrent() {
    const config = readForm();
    if (!config) return;
    const library = loadLibrary();
    library.unshift({ id: newId(), savedAt: Date.now(), config });
    saveLibrary(library);
    renderLibrary();
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

  function exportLibrary() {
    downloadJson('reinos-escenarios.json', {
      schema: 'reinos-scenarios-v1',
      exportedAt: new Date().toISOString(),
      scenarios: loadLibrary(),
    });
  }

  async function importLibrary(file) {
    if (!file || file.size > 512000) return;
    const payload = safeJson(await file.text(), null);
    const incoming = Array.isArray(payload) ? payload : payload?.scenarios;
    if (!Array.isArray(incoming)) return;

    const accepted = [];
    for (const item of incoming.slice(0, MAX_SCENARIOS)) {
      const config = normalize(item?.config || item);
      if (!config) continue;
      accepted.push({ id: item?.id || newId(), savedAt: Date.now(), config });
    }
    if (!accepted.length) return;
    saveLibrary([...accepted, ...loadLibrary()].slice(0, MAX_SCENARIOS));
    renderLibrary();
  }

  function clearLibrary() {
    if (!window.confirm('¿Borrar todos los escenarios guardados?')) return;
    localStorage.removeItem(STORAGE_KEY);
    renderLibrary();
  }

  byId('openScenarioBtn')?.addEventListener('click', openDialog);
  byId('closeScenarioBtn')?.addEventListener('click', closeDialog);
  byId('scenarioDialog')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeDialog();
  });
  byId('scenarioVictoryMode')?.addEventListener('change', syncHoldVisibility);
  byId('scenarioStartBtn')?.addEventListener('click', startCurrent);
  byId('scenarioSaveBtn')?.addEventListener('click', saveCurrent);
  byId('scenarioExportBtn')?.addEventListener('click', exportLibrary);
  byId('scenarioClearBtn')?.addEventListener('click', clearLibrary);
  byId('scenarioImportInput')?.addEventListener('change', async (event) => {
    await importLibrary(event.target.files?.[0]);
    event.target.value = '';
  });

  renderLibrary();
})();
