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
    const allowedUnits = new Set(['villager', 'swordsman', 'archer', 'knight']);
    const allowedBuildings = new Set(['house', 'barracks', 'tower']);

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
        if (!villagerIds || !allowedBuildings.has(input.kind) || !worldX(input.x) || !worldY(input.y)) return null;
        return { type: 'build', kind: input.kind, x: Number(input.x), y: Number(input.y), villagerIds };
      }
      case 'train':
        if (!entityId(input.buildingId) || !allowedUnits.has(input.unit)) return null;
        return { type: 'train', buildingId: input.buildingId, unit: input.unit };
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

    conn.on('open', () => {
      this.connected = true;
      this.status(role === 'host' ? 'Rival conectado ⚔' : 'Conectado al reino anfitrión ⚔');
      if (role === 'client') conn.send({ t: 'hello', v: 2 });
      if (this.onPeer) this.onPeer();
    });

    conn.on('data', (data) => {
      if (!this._plainObject(data)) return;
      if (role === 'host' && data.t === 'cmd') {
        if (this._messageBytes(data) > this.MAX_COMMAND_BYTES || !this._allowIncomingCommand()) return;
        const command = this.validateCommand(data.cmd);
        if (command && this.onCmd) this.onCmd(command);
        return;
      }
      if (role === 'client' && data.t === 'snap') {
        if (this._messageBytes(data) > this.MAX_SNAPSHOT_BYTES) return;
        if (this._plainObject(data.state) && this.onSnap) this.onSnap(data.state);
      }
    });

    conn.on('close', () => {
      this.connected = false;
      this.status(role === 'host' ? 'El rival se desconectó' : 'Se perdió la conexión con el anfitrión');
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
    if (!this.conn || !this.connected) return;
    const packet = { t: 'snap', state };
    if (this._messageBytes(packet) > this.MAX_SNAPSHOT_BYTES) return;
    try { this.conn.send(packet); } catch {}
  },

  sendCmd(command) {
    if (!this.conn || !this.connected) return;
    const safeCommand = this.validateCommand(command);
    if (!safeCommand) return;
    const packet = { t: 'cmd', cmd: safeCommand };
    if (this._messageBytes(packet) > this.MAX_COMMAND_BYTES) return;
    try { this.conn.send(packet); } catch {}
  },

  close() {
    try { if (this.conn) this.conn.close(); } catch {}
    try { if (this.peer) this.peer.destroy(); } catch {}
    this.conn = null;
    this.peer = null;
    this.connected = false;
  },
};
