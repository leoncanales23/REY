/* ============================================================
   net.js — Transporte P2P endurecido para REINOS
   Modelo host-autoritativo:
     - El HOST simula y publica snapshots.
     - El CLIENTE envía comandos validados.
   ============================================================ */
const Net = {
  role: 'sp',
  peer: null,
  conn: null,
  code: null,
  connected: false,
  onCmd: null,
  onSnap: null,
  onPeer: null,
  onLeave: null,
  onStatus: null,
  onMatchContract: null,
  matchContractProvider: null,
  eraPackProvider: null,
  matchReady: false,
  remoteMatchContract: null,
  matchFailure: null,

  MAX_COMMAND_BYTES: 16 * 1024,
  MAX_SNAPSHOT_BYTES: 512 * 1024,
  MAX_IDS: 120,
  RATE_PER_SECOND: 45,
  RATE_BURST: 80,
  _rateTokens: 80,
  _rateUpdatedAt: Date.now(),

  status(text) {
    if (this.onStatus) this.onStatus(String(text));
  },

  normalizeCode(value) {
    const raw = String(value || '').trim().toUpperCase();
    const compact = raw.replace(/[^A-Z0-9]/g, '');
    if (compact.startsWith('REINO') && compact.length >= 9) {
      return `REINO-${compact.slice(5, 11)}`;
    }
    return raw;
  },

  isValidCode(value) {
    return /^REINO-[A-HJ-NP-Z2-9]{4,6}$/.test(this.normalizeCode(value));
  },

  makeCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(6);
    if (globalThis.crypto && globalThis.crypto.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    let suffix = '';
    for (const byte of bytes) suffix += alphabet[byte % alphabet.length];
    return `REINO-${suffix}`;
  },

  _plainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  },

  _finiteNumber(value, min, max) {
    return Number.isFinite(value) && value >= min && value <= max;
  },

  _ids(value) {
    if (!Array.isArray(value) || value.length === 0 || value.length > this.MAX_IDS) return null;
    const ids = value.filter((id) => Number.isInteger(id) && id > 0).slice(0, this.MAX_IDS);
    return ids.length ? [...new Set(ids)] : null;
  },

  validateCommand(input) {
    if (!this._plainObject(input) || typeof input.type !== 'string') return null;

    const worldX = (value) => this._finiteNumber(value, -100, 10000);
    const worldY = (value) => this._finiteNumber(value, -100, 10000);
    const entityId = (value) => Number.isInteger(value) && value > 0;
    const catalog = globalThis.FRONTERAS_ERA_CORE?.commandCatalog?.(this.eraPackProvider?.());
    if (!catalog) return null;

    switch (input.type) {
      case 'move':
      case 'attackmove': {
        const ids = this._ids(input.ids);
        if (!ids || !worldX(input.x) || !worldY(input.y)) return null;
        return { type: input.type, ids, x: Number(input.x), y: Number(input.y) };
      }
      case 'attack': {
        const ids = this._ids(input.ids);
        if (!ids || !entityId(input.targetId)) return null;
        return { type: 'attack', ids, targetId: input.targetId };
      }
      case 'gather': {
        const ids = this._ids(input.ids);
        if (!ids || !entityId(input.nodeId)) return null;
        return { type: 'gather', ids, nodeId: input.nodeId };
      }
      case 'build': {
        const villagerIds = this._ids(input.villagerIds);
        if (!villagerIds || !catalog.buildings.has(input.kind) || !worldX(input.x) || !worldY(input.y)) return null;
        return { type: 'build', kind: input.kind, x: Number(input.x), y: Number(input.y), villagerIds };
      }
      case 'train':
        if (!entityId(input.buildingId) || !catalog.units.has(input.unit)) return null;
        return { type: 'train', buildingId: input.buildingId, unit: input.unit };
      case 'research':
        if (!entityId(input.buildingId) || !catalog.research.has(input.researchId)) return null;
        return { type: 'research', buildingId: input.buildingId, researchId: input.researchId };
      case 'ability':
        if (!entityId(input.kingId) || !catalog.abilities.has(input.abilityId) || !worldX(input.x) || !worldY(input.y)) return null;
        return { type: 'ability', abilityId: input.abilityId, kingId: input.kingId, x: Number(input.x), y: Number(input.y) };
      case 'hireMercenaries':
        if (!entityId(input.kingId) || !catalog.camps.has(input.campId)) return null;
        return { type: 'hireMercenaries', campId: input.campId, kingId: input.kingId };
      case 'rally':
        if (!entityId(input.buildingId) || !worldX(input.x) || !worldY(input.y)) return null;
        return { type: 'rally', buildingId: input.buildingId, x: Number(input.x), y: Number(input.y) };
      case 'cancelTrain':
        if (!entityId(input.buildingId)) return null;
        return { type: 'cancelTrain', buildingId: input.buildingId };
      default:
        return null;
    }
  },

  _messageBytes(value) {
    try {
      return new TextEncoder().encode(JSON.stringify(value)).length;
    } catch {
      return Infinity;
    }
  },

  _allowIncomingCommand() {
    const now = Date.now();
    const elapsed = Math.max(0, (now - this._rateUpdatedAt) / 1000);
    this._rateUpdatedAt = now;
    this._rateTokens = Math.min(this.RATE_BURST, this._rateTokens + elapsed * this.RATE_PER_SECOND);
    if (this._rateTokens < 1) return false;
    this._rateTokens -= 1;
    return true;
  },

  _bindConnection(conn, role) {
    this.conn = conn;
    this.matchReady = false;
    this.remoteMatchContract = null;
    const contract = () => this.matchContractProvider?.() || globalThis.FRONTERAS_ERA_CORE?.contract?.();
    const sameEditionAndMap = (candidate, local) => candidate && local &&
      candidate.eraId === local.eraId && candidate.eraVersion === local.eraVersion &&
      candidate.rulesVersion === local.rulesVersion && candidate.mapId === local.mapId;
    const sameFullContract = (candidate, expected) => sameEditionAndMap(candidate, expected) &&
      Number.isInteger(candidate.seed) && candidate.seed > 0 && candidate.seed === expected.seed;
    let handshakeTimer = null;
    const reject = (reason) => {
      this.matchReady = false;
      this.matchFailure = reason;
      try { conn.close(); } catch {}
      this.status(reason);
    };
    const markReady = () => {
      this.matchReady = true;
      if (this.onMatchContract) this.onMatchContract(this.remoteMatchContract,role);
      this.status('Era, reglas, mapa y semilla sincronizados');
      if (this.onPeer) this.onPeer();
    };

    conn.on('open', () => {
      this.connected = true;
      this.status(role === 'host' ? 'Verificando la era del rival…' : 'Verificando era y reglas…');
      handshakeTimer = setTimeout(() => { if (!this.matchReady) reject('Contrato de partida no confirmado; conexión cerrada'); }, 12000);
      try { conn.send({ t:'hello', v:3, contract:contract() }); } catch { reject('No se pudo iniciar la verificación de partida'); }
    });

    conn.on('data', (data) => {
      if (!this._plainObject(data)) return;
      if (data.t === 'hello') {
        if(this.matchReady) { reject('Renegociación del contrato rechazada; conexión cerrada'); return; }
        const local=contract(), candidate=data.contract;
        if(data.v!==3 || !sameEditionAndMap(candidate,local)) {
          reject('Era, versión, reglas o mapa incompatibles');
          return;
        }
        if(role==='host') {
          this.remoteMatchContract=candidate;
        } else {
          const pack=globalThis.FRONTERAS_ERA_CORE?.get?.(candidate.eraId);
          const knownMap=pack?.world?.maps?.some(map=>map.id===candidate.mapId);
          if(!knownMap || !Number.isInteger(candidate.seed) || candidate.seed<=0) {
            reject('El anfitrión propuso un mapa o semilla inválidos');
            return;
          }
          this.remoteMatchContract=candidate;
          try { conn.send({t:'ready',contract:candidate}); } catch { reject('No se pudo confirmar el contrato de partida'); }
        }
        return;
      }
      if (data.t === 'ready' && role === 'host') {
        const local=contract();
        if(!this.remoteMatchContract || !sameFullContract(data.contract,local)) {
          reject('El rival no aceptó el contrato exacto de partida');
          return;
        }
        try { conn.send({t:'accepted',contract:local}); } catch { reject('No se pudo cerrar la negociación de partida'); return; }
        clearTimeout(handshakeTimer);
        this.remoteMatchContract=local;
        markReady();
        return;
      }
      if (data.t === 'accepted' && role === 'client') {
        if(!sameFullContract(data.contract,this.remoteMatchContract)) {
          reject('El anfitrión confirmó un contrato distinto');
          return;
        }
        clearTimeout(handshakeTimer);
        markReady();
        return;
      }
      if (role === 'host' && data.t === 'cmd') {
        if (!this.matchReady || !sameFullContract(data.contract,contract()) || this._messageBytes(data) > this.MAX_COMMAND_BYTES || !this._allowIncomingCommand()) return;
        const command = this.validateCommand(data.cmd);
        if (command && this.onCmd) this.onCmd(command);
        return;
      }
      if (role === 'client' && data.t === 'snap') {
        if (!this.matchReady || !sameFullContract(data.contract,this.remoteMatchContract) || this._messageBytes(data) > this.MAX_SNAPSHOT_BYTES) return;
        if (this._plainObject(data.state) && this.onSnap) this.onSnap(data.state);
      }
    });

    conn.on('close', () => {
      clearTimeout(handshakeTimer);
      this.connected = false;
      this.status(this.matchFailure || (role === 'host' ? 'El rival se desconectó' : 'Se perdió la conexión con el anfitrión'));
      this.matchFailure = null;
      if (this.onLeave) this.onLeave();
    });

    conn.on('error', () => this.status('La conexión tuvo un problema'));
  },

  host(code) {
    this.close();
    this.role = 'host';
    this.code = this.isValidCode(code) ? this.normalizeCode(code) : this.makeCode();
    this.status('Abriendo sala...');
    this.peer = new Peer(this.code, { debug: 1 });

    this.peer.on('open', () => this.status('Sala lista, esperando rival'));
    this.peer.on('error', (error) => this.status(`Error de sala: ${error && error.type ? error.type : 'desconocido'}`));
    this.peer.on('connection', (conn) => {
      if (this.conn && this.connected) {
        conn.on('open', () => {
          try { conn.send({ t: 'busy' }); } catch {}
          conn.close();
        });
        return;
      }
      this._bindConnection(conn, 'host');
    });
    return this.code;
  },

  join(code) {
    this.close();
    const normalized = this.normalizeCode(code);
    if (!this.isValidCode(normalized)) {
      this.status('Código de sala inválido');
      return false;
    }

    this.role = 'client';
    this.code = normalized;
    this.status(`Conectando a ${normalized}...`);
    this.peer = new Peer({ debug: 1 });
    this.peer.on('error', (error) => this.status(`Error de conexión: ${error && error.type ? error.type : 'desconocido'}`));
    this.peer.on('open', () => {
      const conn = this.peer.connect(normalized, { reliable: true, serialization: 'json' });
      this._bindConnection(conn, 'client');
    });
    return true;
  },

  sendSnap(state) {
    if (!this.conn || !this.connected || !this.matchReady) return;
    const packet = { t: 'snap', contract:this.remoteMatchContract, state };
    if (this._messageBytes(packet) > this.MAX_SNAPSHOT_BYTES) return;
    try { this.conn.send(packet); } catch {}
  },

  sendCmd(command) {
    if (!this.conn || !this.connected || !this.matchReady) return;
    const safeCommand = this.validateCommand(command);
    if (!safeCommand) return;
    const packet = { t: 'cmd', contract:this.remoteMatchContract, cmd: safeCommand };
    if (this._messageBytes(packet) > this.MAX_COMMAND_BYTES) return;
    try { this.conn.send(packet); } catch {}
  },

  close() {
    try { if (this.conn) this.conn.close(); } catch {}
    try { if (this.peer) this.peer.destroy(); } catch {}
    this.conn = null;
    this.peer = null;
    this.connected = false;
    this.matchReady = false;
    this.remoteMatchContract = null;
    this.matchFailure = null;
  },
};
