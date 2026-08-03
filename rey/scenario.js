(() => {
  'use strict';

  const STORAGE_KEY = 'reinos.scenarios.v1';
  const MAX_SCENARIOS = 12;
  const MAX_PLACEMENTS = 48;
  const MAP_W = 2600;
  const MAP_H = 1700;
  const byId = (id) => document.getElementById(id);

  const TOOLS = [
    { id: 'own-swordsman', label: '⚔ PROPIO', kind: 'swordsman', allegiance: 'own' },
    { id: 'own-archer', label: '🏹 PROPIO', kind: 'archer', allegiance: 'own' },
    { id: 'own-knight', label: '🐎 PROPIO', kind: 'knight', allegiance: 'own' },
    { id: 'own-tower', label: '🗼 TORRE', kind: 'tower', allegiance: 'own' },
    { id: 'own-barracks', label: '🏰 CUARTEL', kind: 'barracks', allegiance: 'own' },
    { id: 'enemy-swordsman', label: '⚔ RIVAL', kind: 'swordsman', allegiance: 'enemy' },
    { id: 'enemy-archer', label: '🏹 RIVAL', kind: 'archer', allegiance: 'enemy' },
    { id: 'enemy-knight', label: '🐎 RIVAL', kind: 'knight', allegiance: 'enemy' },
    { id: 'enemy-tower', label: '🗼 RIVAL', kind: 'tower', allegiance: 'enemy' },
    { id: 'gold', label: '🪙 ORO', kind: 'gold', allegiance: 'neutral' },
    { id: 'wood', label: '🌲 ÁRBOL', kind: 'wood', allegiance: 'neutral' },
    { id: 'erase', label: '⌫ BORRAR', kind: 'erase', allegiance: 'neutral' },
  ];

  const FIXED_POINTS = [
    { kind: 'castle', side: 'red', x: 320, y: MAP_H / 2 },
    { kind: 'castle', side: 'blue', x: MAP_W - 320, y: MAP_H / 2 },
    { kind: 'objective', x: MAP_W / 2, y: 400 },
    { kind: 'objective', x: MAP_W / 2, y: MAP_H / 2 },
    { kind: 'objective', x: MAP_W / 2, y: MAP_H - 400 },
    { kind: 'camp', x: MAP_W / 2 - 300, y: MAP_H / 2 - 190 },
    { kind: 'camp', x: MAP_W / 2 + 300, y: MAP_H / 2 + 190 },
  ];

  let placements = [];
  let activeTool = TOOLS[0];

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
      placements: [],
      seed: 0,
    };
  }

  function normalize(config) {
    if (!window.REINOS || typeof REINOS.normalizeScenario !== 'function') return null;
    return REINOS.normalizeScenario(config);
  }

  function clonePlacements(value) {
    return Array.isArray(value) ? value.map((item) => ({ ...item })).slice(0, MAX_PLACEMENTS) : [];
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
      placements: clonePlacements(placements),
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
    placements = clonePlacements(value.placements);
    syncHoldVisibility();
    updateMapStatus();
    drawMap();
  }

  function syncHoldVisibility() {
    const row = byId('scenarioHoldRow');
    if (row) row.hidden = byId('scenarioVictoryMode')?.value !== 'crownHold';
  }

  function playerSide() {
    return byId('scenarioSide')?.value === 'blue' ? 'blue' : 'red';
  }

  function toolSide(tool = activeTool) {
    if (tool.allegiance === 'neutral') return null;
    const own = playerSide();
    if (tool.allegiance === 'own') return own;
    return own === 'red' ? 'blue' : 'red';
  }

  function updateMapStatus(message = '') {
    const count = byId('scenarioPlacementCount');
    const status = byId('scenarioMapStatus');
    if (count) count.textContent = `${placements.length}/${MAX_PLACEMENTS} PIEZAS`;
    if (status) status.textContent = message || (placements.length
      ? 'El diseño visual reemplaza las tropas numéricas y añade sus recursos y edificios.'
      : 'Sin piezas visuales: se usarán las tropas numéricas del formulario.');
  }

  function createPalette() {
    const palette = byId('scenarioPalette');
    if (!palette) return;
    palette.replaceChildren();
    for (const tool of TOOLS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'scenario-tool mini-btn';
      button.dataset.tool = tool.id;
      button.textContent = tool.label;
      button.classList.toggle('active', tool.id === activeTool.id);
      button.addEventListener('click', () => {
        activeTool = tool;
        for (const item of palette.querySelectorAll('.scenario-tool')) item.classList.toggle('active', item === button);
        updateMapStatus(tool.kind === 'erase' ? 'Modo borrador: toca una pieza para retirarla.' : `Colocando ${tool.label.toLowerCase()}.`);
      });
      palette.appendChild(button);
    }
  }

  function mapPoint(event) {
    const canvas = byId('scenarioMapCanvas');
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.round(((event.clientX - rect.left) / rect.width) * MAP_W),
      y: Math.round(((event.clientY - rect.top) / rect.height) * MAP_H),
    };
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function canPlace(point, kind) {
    if (point.x < 80 || point.y < 80 || point.x > MAP_W - 80 || point.y > MAP_H - 80) return false;
    const clearance = ['tower', 'barracks', 'gold', 'wood'].includes(kind) ? 115 : 65;
    if (FIXED_POINTS.some((fixed) => distance(point, fixed) < (fixed.kind === 'castle' ? 155 : clearance))) return false;
    if (placements.some((item) => distance(point, item) < (['tower', 'barracks', 'gold', 'wood'].includes(kind) ? 55 : 24))) return false;
    return true;
  }

  function eraseNearest(point) {
    let bestIndex = -1;
    let bestDistance = 110;
    placements.forEach((item, index) => {
      const candidate = distance(point, item);
      if (candidate < bestDistance) {
        bestDistance = candidate;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0) {
      placements.splice(bestIndex, 1);
      updateMapStatus('Pieza retirada del mapa.');
      drawMap();
    }
  }

  function placeAt(point) {
    if (activeTool.kind === 'erase') {
      eraseNearest(point);
      return;
    }
    if (placements.length >= MAX_PLACEMENTS) {
      updateMapStatus('Límite visual alcanzado. Borra una pieza para continuar.');
      return;
    }
    if (!canPlace(point, activeTool.kind)) {
      updateMapStatus('Ese punto está reservado, demasiado cerca de otra pieza o fuera del campo seguro.');
      return;
    }
    placements.push({ kind: activeTool.kind, side: toolSide(), x: point.x, y: point.y });
    updateMapStatus();
    drawMap();
  }

  function drawFixed(ctx, sx, sy) {
    for (const fixed of FIXED_POINTS) {
      const x = fixed.x * sx;
      const y = fixed.y * sy;
      if (fixed.kind === 'castle') {
        ctx.fillStyle = fixed.side === 'red' ? '#ba3d35' : '#3c78bd';
        ctx.fillRect(x - 12, y - 10, 24, 20);
        ctx.strokeStyle = '#f3dd9b';
        ctx.strokeRect(x - 12, y - 10, 24, 20);
      } else if (fixed.kind === 'objective') {
        ctx.fillStyle = '#d6c66d';
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = '#b7a278';
        ctx.strokeRect(x - 7, y - 7, 14, 14);
      }
    }
  }

  function pieceGlyph(item) {
    return {
      swordsman: '⚔',
      archer: '➶',
      knight: '♞',
      tower: '♜',
      barracks: '▣',
      gold: '●',
      wood: '♣',
    }[item.kind] || '•';
  }

  function drawMap() {
    const canvas = byId('scenarioMapCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const sx = canvas.width / MAP_W;
    const sy = canvas.height / MAP_H;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0b1b13';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(170,220,160,.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= MAP_W; x += 260) {
      ctx.beginPath(); ctx.moveTo(x * sx, 0); ctx.lineTo(x * sx, canvas.height); ctx.stroke();
    }
    for (let y = 0; y <= MAP_H; y += 170) {
      ctx.beginPath(); ctx.moveTo(0, y * sy); ctx.lineTo(canvas.width, y * sy); ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(214,198,109,.35)';
    ctx.beginPath(); ctx.moveTo(MAP_W / 2 * sx, 0); ctx.lineTo(MAP_W / 2 * sx, canvas.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, MAP_H / 2 * sy); ctx.lineTo(canvas.width, MAP_H / 2 * sy); ctx.stroke();
    drawFixed(ctx, sx, sy);

    ctx.font = 'bold 16px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const item of placements) {
      const x = item.x * sx;
      const y = item.y * sy;
      ctx.fillStyle = item.side === 'red' ? '#ff756b' : item.side === 'blue' ? '#72aaff' : item.kind === 'gold' ? '#ffd95d' : '#8ed17e';
      ctx.beginPath();
      ctx.arc(x, y, ['tower', 'barracks'].includes(item.kind) ? 10 : 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#09100c';
      ctx.fillText(pieceGlyph(item), x, y + .5);
    }

    ctx.fillStyle = 'rgba(240,255,232,.72)';
    ctx.font = '12px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('LEÓN', 14, canvas.height - 14);
    ctx.textAlign = 'right';
    ctx.fillText('NELSON', canvas.width - 14, canvas.height - 14);
  }

  function generateFormation() {
    const config = readForm();
    if (!config) return;
    const own = config.side;
    const baseX = own === 'red' ? 520 : MAP_W - 520;
    const direction = own === 'red' ? 1 : -1;
    const kinds = [];
    for (let index = 0; index < config.units.swordsman; index += 1) kinds.push('swordsman');
    for (let index = 0; index < config.units.archer; index += 1) kinds.push('archer');
    for (let index = 0; index < config.units.knight; index += 1) kinds.push('knight');
    placements = placements.filter((item) => item.side !== own || !['swordsman', 'archer', 'knight'].includes(item.kind));
    for (const [index, kind] of kinds.entries()) {
      if (placements.length >= MAX_PLACEMENTS) break;
      const row = Math.floor(index / 6);
      const col = index % 6;
      placements.push({ kind, side: own, x: Math.round(baseX + direction * col * 48), y: Math.round(MAP_H / 2 - 130 + row * 58) });
    }
    updateMapStatus('Formación propia generada desde los contadores del formulario.');
    drawMap();
  }

  function mirrorArmy() {
    const own = playerSide();
    const enemy = own === 'red' ? 'blue' : 'red';
    const source = placements.filter((item) => item.side === own && ['swordsman', 'archer', 'knight', 'tower', 'barracks'].includes(item.kind));
    placements = placements.filter((item) => item.side !== enemy);
    for (const item of source) {
      if (placements.length >= MAX_PLACEMENTS) break;
      placements.push({ ...item, side: enemy, x: MAP_W - item.x });
    }
    updateMapStatus('Ejército propio reflejado para crear el bando rival.');
    drawMap();
  }

  function clearMap() {
    placements = [];
    updateMapStatus('Mapa visual limpio. Se usarán las tropas numéricas mientras no agregues piezas.');
    drawMap();
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
    const visual = entry.config.placements?.length ? ` · 🗺 ${entry.config.placements.length} piezas` : '';
    units.textContent = `⚔ ${entry.config.units.swordsman} · 🏹 ${entry.config.units.archer} · 🐎 ${entry.config.units.knight}${visual} · semilla ${entry.config.seed || 'automática'}`;

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
    createPalette();
    const dialog = byId('scenarioDialog');
    if (!dialog) return;
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog.setAttribute('open', '');
    requestAnimationFrame(drawMap);
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
      schema: 'reinos-scenarios-v2',
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
  byId('scenarioSide')?.addEventListener('change', () => { createPalette(); drawMap(); });
  byId('scenarioStartBtn')?.addEventListener('click', startCurrent);
  byId('scenarioSaveBtn')?.addEventListener('click', saveCurrent);
  byId('scenarioExportBtn')?.addEventListener('click', exportLibrary);
  byId('scenarioClearBtn')?.addEventListener('click', clearLibrary);
  byId('scenarioMapClearBtn')?.addEventListener('click', clearMap);
  byId('scenarioMapFromUnitsBtn')?.addEventListener('click', generateFormation);
  byId('scenarioMapMirrorBtn')?.addEventListener('click', mirrorArmy);
  byId('scenarioMapCanvas')?.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    placeAt(mapPoint(event));
  });
  byId('scenarioMapCanvas')?.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    eraseNearest(mapPoint(event));
  });
  byId('scenarioImportInput')?.addEventListener('change', async (event) => {
    await importLibrary(event.target.files?.[0]);
    event.target.value = '';
  });

  createPalette();
  updateMapStatus();
  drawMap();
  renderLibrary();
})();
