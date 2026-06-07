/* ============================================================
   net.js — Capa de transporte multijugador (PeerJS, P2P)
   Modelo: host-autoritativo.
     - El HOST corre la simulación y manda "snapshots".
     - El CLIENTE solo dibuja snapshots y manda "comandos".
   No requiere servidor propio: usa el broker público de PeerJS.
   ============================================================ */
const Net = {
  role: 'sp',          // 'sp' | 'host' | 'client'
  peer: null,
  conn: null,
  code: null,
  connected: false,
  onCmd: null,         // host: (cmd) => void
  onSnap: null,        // client: (state) => void
  onPeer: null,        // () => void   (se conectó el otro jugador)
  onLeave: null,       // () => void
  onStatus: null,      // (texto) => void

  status(t) { if (this.onStatus) this.onStatus(t); },

  // Genera un código corto y legible tipo "REINO-4821"
  makeCode() {
    return 'REINO-' + Math.floor(1000 + Math.random() * 9000);
  },

  host(code) {
    this.role = 'host';
    this.code = code;
    this.status('Abriendo sala...');
    this.peer = new Peer(code, { debug: 1 });
    this.peer.on('open', () => this.status('Sala lista — esperando al primo'));
    this.peer.on('error', (e) => this.status('Error: ' + (e.type || e)));
    this.peer.on('connection', (conn) => {
      this.conn = conn;
      conn.on('open', () => {
        this.connected = true;
        this.status('Primo conectado ⚔');
        if (this.onPeer) this.onPeer();
      });
      conn.on('data', (d) => {
        if (d && d.t === 'cmd' && this.onCmd) this.onCmd(d.cmd);
      });
      conn.on('close', () => {
        this.connected = false;
        this.status('El primo se desconectó');
        if (this.onLeave) this.onLeave();
      });
    });
  },

  join(code) {
    this.role = 'client';
    this.code = code;
    this.status('Conectando a ' + code + '...');
    this.peer = new Peer({ debug: 1 });
    this.peer.on('error', (e) => this.status('Error: ' + (e.type || e)));
    this.peer.on('open', () => {
      const conn = this.peer.connect(code, { reliable: true });
      this.conn = conn;
      conn.on('open', () => {
        this.connected = true;
        this.status('Conectado al reino anfitrión ⚔');
        conn.send({ t: 'hello' });
        if (this.onPeer) this.onPeer();
      });
      conn.on('data', (d) => {
        if (d && d.t === 'snap' && this.onSnap) this.onSnap(d.state);
      });
      conn.on('close', () => {
        this.connected = false;
        this.status('Se perdió la conexión con el anfitrión');
        if (this.onLeave) this.onLeave();
      });
    });
  },

  sendSnap(state) {
    if (this.conn && this.connected) {
      try { this.conn.send({ t: 'snap', state }); } catch (e) {}
    }
  },
  sendCmd(cmd) {
    if (this.conn && this.connected) {
      try { this.conn.send({ t: 'cmd', cmd }); } catch (e) {}
    }
  },
  close() {
    try { if (this.conn) this.conn.close(); } catch (e) {}
    try { if (this.peer) this.peer.destroy(); } catch (e) {}
    this.connected = false;
  }
};
