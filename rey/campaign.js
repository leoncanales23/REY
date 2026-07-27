(() => {
  'use strict';

  const STORAGE_KEY = 'reinos.campaign.v1';
  const byId = (id) => document.getElementById(id);
  let lastMissionId = null;

  function safeJson(value, fallback) {
    try {
      return JSON.parse(value) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function definitions() {
    if (!window.REINOS || typeof REINOS.getCampaignDefinitions !== 'function') return [];
    const missions = REINOS.getCampaignDefinitions();
    return Array.isArray(missions) ? missions : [];
  }

  function loadProgress() {
    const raw = safeJson(localStorage.getItem(STORAGE_KEY), {});
    return {
      unlocked: Math.max(1, Number(raw.unlocked) || 1),
      bestStars: raw.bestStars && typeof raw.bestStars === 'object' ? raw.bestStars : {},
    };
  }

  function saveProgress(progress) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }

  function stars(value) {
    const count = Math.max(0, Math.min(3, Number(value) || 0));
    return `${'★'.repeat(count)}${'☆'.repeat(3 - count)}`;
  }

  function totalStars(progress, missions) {
    return missions.reduce((sum, mission) => sum + (Number(progress.bestStars[mission.id]) || 0), 0);
  }

  function createMissionCard(mission, index, progress) {
    const unlocked = index < progress.unlocked;
    const best = Number(progress.bestStars[mission.id]) || 0;
    const article = document.createElement('article');
    article.className = `campaign-mission${unlocked ? '' : ' locked'}`;

    const act = document.createElement('span');
    act.className = 'campaign-act';
    act.textContent = `ACTO ${mission.act}`;

    const title = document.createElement('h3');
    title.textContent = mission.title;

    const faction = document.createElement('div');
    faction.className = `campaign-faction ${mission.side}`;
    faction.textContent = `${mission.commander} · ${mission.difficultyLabel}`;

    const briefing = document.createElement('p');
    briefing.textContent = mission.briefing;

    const objective = document.createElement('p');
    objective.className = 'campaign-objective';
    objective.textContent = `OBJETIVO: ${mission.objective}`;

    const footer = document.createElement('div');
    footer.className = 'campaign-mission-footer';
    const rating = document.createElement('strong');
    rating.className = 'campaign-stars';
    rating.textContent = unlocked ? stars(best) : '🔒 BLOQUEADO';

    const button = document.createElement('button');
    button.className = 'mini-btn campaign-start';
    button.type = 'button';
    button.disabled = !unlocked;
    button.textContent = best > 0 ? 'REJUGAR MISIÓN' : 'INICIAR MISIÓN';
    button.addEventListener('click', () => {
      lastMissionId = mission.id;
      closeCampaign();
      REINOS.startCampaign(mission.id);
    });

    footer.append(rating, button);
    article.append(act, title, faction, briefing, objective, footer);
    return article;
  }

  function renderCampaign() {
    const missions = definitions();
    const progress = loadProgress();
    const list = byId('campaignMissions');
    const summary = byId('campaignProgress');
    if (!list || !summary) return;

    summary.textContent = `${totalStars(progress, missions)}/${missions.length * 3} ESTRELLAS · ${Math.min(progress.unlocked, missions.length)}/${missions.length} ACTOS DESBLOQUEADOS`;
    list.replaceChildren();
    missions.forEach((mission, index) => list.appendChild(createMissionCard(mission, index, progress)));
  }

  function openCampaign() {
    renderCampaign();
    const dialog = byId('campaignDialog');
    if (!dialog) return;
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeCampaign() {
    const dialog = byId('campaignDialog');
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }

  function clearCampaign() {
    if (!window.confirm('¿Reiniciar toda la Campaña de los Dos Reyes?')) return;
    localStorage.removeItem(STORAGE_KEY);
    renderCampaign();
  }

  function missionAfter(id) {
    const missions = definitions();
    const index = missions.findIndex((mission) => mission.id === id);
    return index >= 0 ? missions[index + 1] || null : null;
  }

  function prepareEndActions(detail) {
    const retry = byId('campaignRetryBtn');
    const next = byId('campaignNextBtn');
    if (retry) {
      retry.hidden = false;
      retry.onclick = () => REINOS.startCampaign(detail.id);
    }
    const nextMission = detail.won ? missionAfter(detail.id) : null;
    if (next) {
      next.hidden = !nextMission;
      next.onclick = nextMission ? () => REINOS.startCampaign(nextMission.id) : null;
      if (nextMission) next.textContent = `SIGUIENTE: ACTO ${nextMission.act}`;
    }
  }

  window.addEventListener('reinos:campaign-complete', (event) => {
    const detail = event.detail || {};
    if (!detail.id) return;
    lastMissionId = detail.id;
    const missions = definitions();
    const index = missions.findIndex((mission) => mission.id === detail.id);
    const progress = loadProgress();
    const previous = Number(progress.bestStars[detail.id]) || 0;
    progress.bestStars[detail.id] = Math.max(previous, Number(detail.stars) || 0);
    if (detail.won && index >= 0) progress.unlocked = Math.max(progress.unlocked, Math.min(missions.length, index + 2));
    saveProgress(progress);
    prepareEndActions(detail);
    renderCampaign();
  });

  byId('openCampaignBtn')?.addEventListener('click', openCampaign);
  byId('closeCampaignBtn')?.addEventListener('click', closeCampaign);
  byId('clearCampaignBtn')?.addEventListener('click', clearCampaign);
  byId('campaignDialog')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeCampaign();
  });
  byId('campaignRetryBtn')?.addEventListener('click', () => {
    if (lastMissionId) REINOS.startCampaign(lastMissionId);
  });

  renderCampaign();
})();
