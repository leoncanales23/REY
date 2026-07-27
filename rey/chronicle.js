(() => {
  'use strict';

  const STORAGE_KEY = 'reinos.warChronicle.v1';
  const ACTIVE_KEY = 'reinos.activeBattle.v1';
  const MAX_ENTRIES = 30;
  const byId = (id) => document.getElementById(id);
  let activeBattle = null;
  let finalizedBattleId = null;

  function safeJson(value, fallback) {
    try {
      return JSON.parse(value) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function loadHistory() {
    const history = safeJson(localStorage.getItem(STORAGE_KEY), []);
    return Array.isArray(history) ? history : [];
  }

  function saveHistory(history) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_ENTRIES)));
  }

  function battleId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    return `battle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeSide(side) {
    return side === 'blue' ? 'blue' : 'red';
  }

  function sideName(side) {
    return side === 'blue' ? 'NELSON' : 'LEÓN';
  }

  function modeName(mode) {
    if (mode === 'host') return 'Duelo online · anfitrión';
    if (mode === 'client') return 'Duelo online · invitado';
    return 'Un jugador';
  }

  function factionName(side) {
    return side === 'blue' ? 'Orden del Horizonte' : 'Legión del Rugido';
  }

  function victoryReasonName(value) {
    return value === 'supremacy' ? 'Supremacía de Bastiones' : 'Castillo destruido';
  }

  function difficultyName(value) {
    if (value === 'explorer') return 'Explorador';
    if (value === 'conqueror') return 'Conquistador';
    if (value === 'human') return 'Rival humano';
    return 'Guerrero';
  }

  function formatDuration(durationMs) {
    const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
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

  function beginBattle(mode, side, room = null, difficulty = 'warrior') {
    activeBattle = {
      id: battleId(),
      startedAt: Date.now(),
      mode,
      side: normalizeSide(side),
      room: room || null,
      difficulty: mode === 'sp' ? difficulty : 'human',
    };
    finalizedBattleId = null;
    sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(activeBattle));
  }

  function clearActiveBattle() {
    activeBattle = null;
    finalizedBattleId = null;
    sessionStorage.removeItem(ACTIVE_KEY);
  }

  function restoreActiveBattle() {
    const stored = safeJson(sessionStorage.getItem(ACTIVE_KEY), null);
    if (!stored || !stored.id || !stored.startedAt) return;
    if (Date.now() - stored.startedAt > 6 * 60 * 60 * 1000) {
      sessionStorage.removeItem(ACTIVE_KEY);
      return;
    }
    activeBattle = stored;
  }

  function calculateBestStreak(history) {
    let best = 0;
    let current = 0;
    for (const entry of [...history].reverse()) {
      if (entry.result === 'victory') {
        current += 1;
        best = Math.max(best, current);
      } else {
        current = 0;
      }
    }
    return best;
  }

  function currentStreak(history) {
    let streak = 0;
    for (const entry of history) {
      if (entry.result !== 'victory') break;
      streak += 1;
    }
    return streak;
  }

  function buildStats(history) {
    const wins = history.filter((entry) => entry.result === 'victory').length;
    const losses = history.filter((entry) => entry.result === 'defeat').length;
    const completed = wins + losses;
    const averageMs = completed
      ? history.reduce((sum, entry) => sum + (entry.durationMs || 0), 0) / completed
      : 0;
    return {
      battles: completed,
      wins,
      losses,
      winRate: completed ? Math.round((wins / completed) * 100) : 0,
      averageMs,
      currentStreak: currentStreak(history),
      bestStreak: calculateBestStreak(history),
      supremacyWins: history.filter((entry) => entry.result === 'victory' && entry.victoryReason === 'supremacy').length,
      commanderUses: history.reduce((sum, entry) => sum + (entry.commanderUses || 0), 0),
      mercenaries: history.reduce((sum, entry) => sum + (entry.mercenariesHired || 0), 0),
    };
  }

  function appendStat(container, label, value) {
    const item = document.createElement('div');
    item.className = 'chronicle-stat';
    const strong = document.createElement('strong');
    strong.textContent = String(value);
    const span = document.createElement('span');
    span.textContent = label;
    item.append(strong, span);
    container.appendChild(item);
  }

  function renderChronicle() {
    const list = byId('chronicleList');
    const statsContainer = byId('chronicleStats');
    if (!list || !statsContainer) return;

    const history = loadHistory();
    const stats = buildStats(history);
    statsContainer.replaceChildren();
    appendStat(statsContainer, 'batallas', stats.battles);
    appendStat(statsContainer, 'victorias', stats.wins);
    appendStat(statsContainer, 'efectividad', `${stats.winRate}%`);
    appendStat(statsContainer, 'racha actual', stats.currentStreak);
    appendStat(statsContainer, 'mejor racha', stats.bestStreak);
    appendStat(statsContainer, 'supremacías', stats.supremacyWins);
    appendStat(statsContainer, 'poderes usados', stats.commanderUses);
    appendStat(statsContainer, 'mercenarios', stats.mercenaries);
    appendStat(statsContainer, 'duración media', formatDuration(stats.averageMs));

    list.replaceChildren();
    if (!history.length) {
      const empty = document.createElement('p');
      empty.className = 'chronicle-empty';
      empty.textContent = 'Todavía no hay batallas registradas. El pergamino espera tinta y acero.';
      list.appendChild(empty);
      return;
    }

    for (const entry of history) {
      const article = document.createElement('article');
      article.className = `chronicle-entry ${entry.result}`;

      const header = document.createElement('div');
      header.className = 'chronicle-entry-head';
      const result = document.createElement('strong');
      result.textContent = entry.result === 'victory' ? 'VICTORIA' : 'DERROTA';
      const date = document.createElement('time');
      date.dateTime = new Date(entry.finishedAt).toISOString();
      date.textContent = formatDate(entry.finishedAt);
      header.append(result, date);

      const details = document.createElement('div');
      details.className = 'chronicle-entry-details';
      details.textContent = `${sideName(entry.side)} · ${factionName(entry.side)} · ${modeName(entry.mode)} · ${difficultyName(entry.difficulty)} · ${victoryReasonName(entry.victoryReason)} · 👑${entry.commanderUses||0} · ⚔${entry.mercenariesHired||0} · Edad ${entry.finalAge||1} · ${formatDuration(entry.durationMs)}`;

      article.append(header, details);
      list.appendChild(article);
    }
  }

  function renderBattleSummary(entry, history) {
    const summary = byId('battleSummary');
    if (!summary) return;
    const streak = currentStreak(history);
    summary.replaceChildren();

    const grid = document.createElement('div');
    grid.className = 'battle-summary-grid';
    appendStat(grid, 'duración', formatDuration(entry.durationMs));
    appendStat(grid, 'modo', modeName(entry.mode));
    appendStat(grid, 'reino', sideName(entry.side));
    appendStat(grid, 'dificultad', difficultyName(entry.difficulty));
    appendStat(grid, 'edad final', entry.finalAge||1);
    appendStat(grid, 'victoria por', victoryReasonName(entry.victoryReason));
    appendStat(grid, 'bastiones', entry.finalObjectives||0);
    appendStat(grid, 'poderes', entry.commanderUses||0);
    appendStat(grid, 'mercenarios', entry.mercenariesHired||0);
    appendStat(grid, 'eventos', entry.worldEvents||0);
    appendStat(grid, 'racha', entry.result === 'victory' ? streak : 0);
    summary.appendChild(grid);
  }

  function finishBattle() {
    if (!activeBattle || finalizedBattleId === activeBattle.id) return;
    const title = byId('endTitle');
    if (!title) return;
    const titleText = title.textContent.trim().toUpperCase();
    if (!titleText.includes('VICTORIA') && !titleText.includes('DERROTA')) return;

    finalizedBattleId = activeBattle.id;
    const meta = typeof REINOS.getMatchMeta === 'function' ? REINOS.getMatchMeta() : {};
    const entry = {
      ...activeBattle,
      difficulty: meta.difficulty || activeBattle.difficulty || 'warrior',
      finalAge: meta.age || 1,
      faction: meta.faction || factionName(activeBattle.side),
      victoryReason: meta.victoryReason || 'castle',
      finalObjectives: meta.objectives || 0,
      finalDominance: meta.dominance || 0,
      commanderUses: meta.commanderUses || 0,
      mercenariesHired: meta.mercenariesHired || 0,
      worldEvents: meta.worldEvents || 0,
      lastWorldEvent: meta.lastWorldEvent || null,
      finishedAt: Date.now(),
      durationMs: Math.max(1000, Date.now() - activeBattle.startedAt),
      result: titleText.includes('VICTORIA') ? 'victory' : 'defeat',
    };

    const history = [entry, ...loadHistory()].slice(0, MAX_ENTRIES);
    saveHistory(history);
    sessionStorage.removeItem(ACTIVE_KEY);
    renderBattleSummary(entry, history);
    renderChronicle();
  }

  function observeEndScreen() {
    const endScreen = byId('endScreen');
    if (!endScreen) return;
    const observer = new MutationObserver(() => {
      const visible = endScreen.style.display === 'flex' || getComputedStyle(endScreen).display === 'flex';
      if (visible) requestAnimationFrame(finishBattle);
    });
    observer.observe(endScreen, { attributes: true, attributeFilter: ['style', 'class'] });
  }

  function openChronicle() {
    renderChronicle();
    const dialog = byId('chronicleDialog');
    if (!dialog) return;
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeChronicle() {
    const dialog = byId('chronicleDialog');
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }

  function clearChronicle() {
    if (!window.confirm('¿Borrar toda la Crónica de Guerra?')) return;
    localStorage.removeItem(STORAGE_KEY);
    renderChronicle();
  }

  function wrapGameApi() {
    if (!window.REINOS) return;

    const originalSolo = REINOS.startSolo.bind(REINOS);
    REINOS.startSolo = (side, difficulty) => {
      originalSolo(side, difficulty);
      beginBattle('sp', side, null, difficulty);
    };

    const originalHost = REINOS.hostGame.bind(REINOS);
    REINOS.hostGame = () => {
      originalHost();
      beginBattle('host', 'red', Net.code || null);
    };

    const originalJoin = REINOS.joinGame.bind(REINOS);
    REINOS.joinGame = (code) => {
      const normalized = Net.normalizeCode(code);
      if (!Net.isValidCode(normalized)) return originalJoin(code);
      originalJoin(normalized);
      beginBattle('client', 'blue', normalized);
    };

    for (const method of ['restart', 'goHome']) {
      if (typeof REINOS[method] !== 'function') continue;
      const original = REINOS[method].bind(REINOS);
      REINOS[method] = (...args) => {
        clearActiveBattle();
        return original(...args);
      };
    }
  }

  byId('openChronicleBtn')?.addEventListener('click', openChronicle);
  byId('closeChronicleBtn')?.addEventListener('click', closeChronicle);
  byId('clearChronicleBtn')?.addEventListener('click', clearChronicle);
  byId('chronicleDialog')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeChronicle();
  });

  restoreActiveBattle();
  wrapGameApi();
  observeEndScreen();
  renderChronicle();
})();
