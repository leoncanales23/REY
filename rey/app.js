(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const roomInput = byId('joinInput');
  const roomCode = byId('roomCode');
  const connectionBadge = byId('connectionBadge');
  const networkBadge = byId('networkBadge');
  let deferredInstallPrompt = null;

  function toast(message) {
    const el = document.createElement('div');
    el.className = 'app-toast';
    el.textContent = message;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => el.classList.remove('show'), 1800);
    setTimeout(() => el.remove(), 2300);
  }

  function normalizeRoomCode(value) {
    const code = Net.normalizeCode(value);
    return Net.isValidCode(code) ? code : null;
  }

  function roomCodeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return normalizeRoomCode(params.get('room') || params.get('sala'));
  }

  function currentRoomCode() {
    const candidates = [
      Net.code,
      roomCode ? roomCode.textContent : '',
      roomCodeFromUrl(),
      roomInput ? roomInput.value : '',
    ];
    for (const candidate of candidates) {
      const code = normalizeRoomCode(candidate);
      if (code) return code;
    }
    return null;
  }

  function syncRoomUi(code) {
    if (!code) return;
    if (roomCode) roomCode.textContent = code;
    if (roomInput && !roomInput.value) roomInput.value = code;
  }

  function roomUrl(code) {
    const url = new URL(window.location.href);
    url.searchParams.set('room', code);
    url.searchParams.delete('sala');
    url.hash = '';
    return url.toString();
  }

  function rememberRoom(code) {
    if (!code) return;
    syncRoomUi(code);
    const url = new URL(window.location.href);
    url.searchParams.set('room', code);
    url.searchParams.delete('sala');
    window.history.replaceState({}, '', url);
  }

  async function shareRoom() {
    const code = currentRoomCode();
    if (!code) {
      toast('Crea una sala primero');
      return;
    }
    const url = roomUrl(code);
    const shareData = { title: 'REINOS', text: `Únete a mi reino: ${code}`, url };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Invitación copiada ⚔');
    } catch {
      window.prompt('Copia esta invitación:', url);
    }
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      toast('Pantalla completa no disponible');
    }
  }

  function setOnlineState() {
    const online = navigator.onLine;
    if (networkBadge) {
      networkBadge.textContent = online ? 'RED DISPONIBLE' : 'SIN RED';
      networkBadge.dataset.state = online ? 'online' : 'offline';
    }
  }

  function setConnectionState(text, connected) {
    if (!connectionBadge) return;
    connectionBadge.textContent = text;
    connectionBadge.dataset.state = connected ? 'connected' : 'waiting';
  }

  function showMatchShell() {
    const hud = byId('hud');
    const matchTools = byId('matchTools');
    if (hud) hud.style.display = 'flex';
    if (matchTools) matchTools.hidden = false;
  }

  function enhanceGameApi() {
    if (!window.REINOS) return;

    const originalSolo = REINOS.startSolo.bind(REINOS);
    REINOS.startSolo = (side, difficulty) => {
      originalSolo(side, difficulty);
      showMatchShell();
      setConnectionState('SOLO', true);
    };

    const originalHost = REINOS.hostGame.bind(REINOS);
    REINOS.hostGame = () => {
      originalHost();
      showMatchShell();
      const code = currentRoomCode();
      rememberRoom(code);
      setConnectionState('ESPERANDO RIVAL', false);
      if (code) toast(`${code} listo para compartir`);
    };

    const originalJoin = REINOS.joinGame.bind(REINOS);
    REINOS.joinGame = (value) => {
      const code = normalizeRoomCode(value);
      if (!code) {
        const status = byId('netStatus2');
        if (status) status.textContent = 'Código inválido. Usa REINO-XXXXXX.';
        return;
      }
      rememberRoom(code);
      originalJoin(code);
      showMatchShell();
      setConnectionState('CONECTANDO', false);
    };
  }

  function enhanceNetworkCallbacks() {
    const originalStatus = Net.status.bind(Net);
    Net.status = (text) => {
      originalStatus(text);
      const normalized = String(text).toLowerCase();
      const connected = normalized.includes('conectado') && !normalized.includes('desconectó');
      setConnectionState(connected ? 'CONECTADO' : String(text).toUpperCase(), connected);
    };
  }

  function hydrateRoomFromUrl() {
    const code = roomCodeFromUrl();
    if (!code) return;
    syncRoomUi(code);
    rememberRoom(code);
    const status = byId('netStatus2');
    if (status) status.textContent = `Invitación detectada: ${code}`;
  }

  function setupInstall() {
    const installButton = byId('installBtn');
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      if (installButton) installButton.hidden = false;
    });
    if (installButton) {
      installButton.addEventListener('click', async () => {
        if (!deferredInstallPrompt) {
          toast('Usa “Instalar aplicación” en el menú del navegador');
          return;
        }
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        installButton.hidden = true;
      });
    }
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
    }
  }

  byId('copyInviteMenu')?.addEventListener('click', shareRoom);
  byId('copyInviteHud')?.addEventListener('click', shareRoom);
  byId('fullscreenBtn')?.addEventListener('click', toggleFullscreen);
  byId('fullscreenHud')?.addEventListener('click', toggleFullscreen);
  roomInput?.addEventListener('input', () => {
    roomInput.value = roomInput.value.toUpperCase().replace(/\s+/g, '');
  });
  window.addEventListener('online', setOnlineState);
  window.addEventListener('offline', setOnlineState);

  enhanceNetworkCallbacks();
  enhanceGameApi();
  hydrateRoomFromUrl();
  setupInstall();
  registerServiceWorker();
  setOnlineState();
})();
