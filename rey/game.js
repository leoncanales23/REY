/* ============================================================
   REINOS — Nelson vs León
   Motor RTS original (inspirado en el género, sin assets de terceros).
   Un solo archivo: simulación + IA + render + input.

   Pathfinding: Flow Field inspirado en openage / Elijah Emerson
   "Crowd Pathfinding and Steering Using Flow Field Tiles"
   ============================================================ */
(() => {
'use strict';

// ---------- Config ----------
const MAP_W = 2600, MAP_H = 1700;
const SIM_DT = 1 / 20;          // paso de simulación (20 Hz)
const SNAP_INT = 0.1;           // cada cuánto el host manda snapshot (10 Hz)

const KINDS = ['castle','house','barracks','tower','villager','swordsman','archer','knight','king'];

const DEFS = {
  castle:   {building:true, hp:2200, r:36, range:185, atk:20, cd:1.1, sight:260, name:'Castillo'},
  house:    {building:true, hp:520,  r:24, name:'Casa', pop:5},
  barracks: {building:true, hp:950,  r:30, name:'Cuartel'},
  tower:    {building:true, hp:760,  r:20, range:160, atk:15, cd:0.9, sight:200, name:'Torre'},
  villager: {hp:42,  r:9,  speed:64, atk:3,  cd:1.0, range:16, sight:130, name:'Aldeano', gather:9, carry:12},
  swordsman:{hp:130, r:12, speed:56, atk:14, cd:1.1, range:18, sight:160, name:'Espadachín'},
  archer:   {hp:58,  r:10, speed:60, atk:12, cd:1.3, range:128,sight:185, name:'Arquero', ranged:true},
  knight:   {hp:190, r:14, speed:94, atk:19, cd:1.15,range:20, sight:170, name:'Caballero'},
  // Héroe: fuerte pero mortal. Un ejército enfocado igual lo derriba (sin masacres).
  king:     {hp:460, r:17, speed:80, atk:28, cd:1.0, range:22, sight:210, name:'Rey', hero:true, regen:5},
};

const COST = {
  villager: {g:50, w:0,   pop:1, t:6,  from:'castle'},
  swordsman:{g:60, w:20,  pop:1, t:9,  from:'barracks'},
  archer:   {g:40, w:40,  pop:1, t:9,  from:'barracks'},
  knight:   {g:80, w:40,  pop:2, t:14, from:'barracks'},
  house:    {g:0,  w:30,  build:true},
  barracks: {g:0,  w:150, build:true},
  tower:    {g:50, w:50,  build:true},
};

const AGE_DEFS = {
  1: { name:'EDAD DE ALDEA' },
  2: { name:'EDAD DE FORTALEZA' },
  3: { name:'EDAD IMPERIAL' },
};

const UNIT_AGE = { villager:1, swordsman:1, archer:2, knight:3 };
const BUILDING_AGE = { house:1, barracks:1, tower:2 };

const RESEARCH = {
  age2: { name:'Avanzar a Fortaleza', age:1, toAge:2, g:350, w:250, t:35, from:'castle' },
  age3: { name:'Avanzar a Imperial', age:2, toAge:3, g:650, w:450, t:50, from:'castle' },
  wheelbarrow: { name:'Carretilla', age:1, g:180, w:120, t:25, from:'castle', note:'+25% recolección y carga' },
  masonry: { name:'Mampostería', age:2, g:260, w:260, t:35, from:'castle', note:'+22% vida de edificios' },
  forgedBlades: { name:'Filos Forjados', age:2, g:240, w:160, t:30, from:'barracks', note:'+15% daño cuerpo a cuerpo' },
  fletching: { name:'Emplumado', age:2, g:220, w:220, t:30, from:'barracks', note:'+12% daño y +20 alcance' },
  cavalry: { name:'Cría de Guerra', age:3, g:360, w:260, t:40, from:'barracks', note:'+18% velocidad y +15% vida de caballeros' },
};

const AI_PROFILES = {
  explorer: {
    label:'EXPLORADOR', decisionTicks:36, villagers:8, towers:1, queueDepth:1,
    attackBase:7, attackGrowth:120, gather:0.9, combat:0.9, startBonus:0,
    age2At:125, age3At:310,
  },
  warrior: {
    label:'GUERRERO', decisionTicks:20, villagers:10, towers:2, queueDepth:2,
    attackBase:5, attackGrowth:90, gather:1, combat:1, startBonus:80,
    age2At:85, age3At:235,
  },
  conqueror: {
    label:'CONQUISTADOR', decisionTicks:12, villagers:13, towers:3, queueDepth:3,
    attackBase:4, attackGrowth:70, gather:1.22, combat:1.12, startBonus:220,
    age2At:55, age3At:165,
  },
};

const FACTIONS = {
  red: {
    name:'LEGIÓN DEL RUGIDO', short:'RUGIDO',
    description:'Presión cuerpo a cuerpo y aura del Rey León',
    meleeAttack:1.10, kingAuraAttack:1.12, kingAuraSpeed:1.12, kingAuraRange:170,
    capturePower:1.12,
  },
  blue: {
    name:'ORDEN DEL HORIZONTE', short:'HORIZONTE',
    description:'Alcance, visión y economía técnica de Nelson',
    rangedRange:18, villagerGather:1.10, sight:1.15,
    capturePower:1,
  },
};

const OBJECTIVE_RADIUS = 92;
const DOMINANCE_SECONDS = 75;
const OBJECTIVE_DEFS = [
  {id:'north', name:'BASTIÓN NORTE', x:MAP_W/2, y:400},
  {id:'crown', name:'BASTIÓN DE LA CORONA', x:MAP_W/2, y:MAP_H/2},
  {id:'south', name:'BASTIÓN SUR', x:MAP_W/2, y:MAP_H-400},
];

const COLOR = {
  red:  {main:'#ff3b3b', dark:'#7a1414', light:'#ff8a8a', name:'LEÓN'},
  blue: {main:'#3b8bff', dark:'#143a7a', light:'#8ac0ff', name:'NELSON'},
};

// ---------- Estado ----------
let G = null;          // estado vivo (host / sp)
let mySide = 'red';
let enemySide = 'blue';
let mode = 'sp';       // 'sp' | 'host' | 'client'
let running = false;
let aiDifficulty = 'warrior';

function freshState() {
  return {
    tick: 0, time: 0, nextId: 1, winner: null,
    res: {
      red:  {g:200, w:200, pop:0, cap:10, age:1, techs:{}, research:null},
      blue: {g:200, w:200, pop:0, cap:10, age:1, techs:{}, research:null},
    },
    ents: [], nodes: [], projectiles: [],
    objectives: OBJECTIVE_DEFS.map((objective)=>({...objective, owner:null, control:0})),
    dominance: {red:0, blue:0}, victoryReason:null,
    particles: [],   // sistema de partículas
  };
}

function nid() { return G.nextId++; }

function activeState(){
  if(G) return G;
  if(typeof renderState==='function') return renderState();
  return null;
}
function sideState(side){ const state=activeState(); return state && state.res ? state.res[side] : null; }
function aiProfile(){ return AI_PROFILES[aiDifficulty] || AI_PROFILES.warrior; }
function isAiSide(side){ return mode==='sp' && side===enemySide; }
function hasTech(side,id){ const r=sideState(side); return !!(r && r.techs && r.techs[id]); }
function ageOf(side){ const r=sideState(side); return r && r.age ? r.age : 1; }
function canTrainUnit(side,unit){ return ageOf(side) >= (UNIT_AGE[unit] || 1); }
function canBuildKind(side,kind){ return ageOf(side) >= (BUILDING_AGE[kind] || 1); }
function factionOf(side){ return FACTIONS[side] || FACTIONS.red; }
function objectiveCount(state,side){ return (state?.objectives||[]).filter((objective)=>objective.owner===side).length; }
function kingAuraActive(e){
  if(e.side!=='red' || e.building || e.kind==='villager' || e.kind==='king') return false;
  const state=activeState(); if(!state) return false;
  const king=state.ents.find((unit)=>unit.side===e.side && unit.kind==='king' && unit.hp>0);
  return !!king && dist(e.x,e.y,king.x,king.y)<=factionOf(e.side).kingAuraRange;
}
function sightFor(e){
  let value=DEFS[e.kind].sight || 80;
  if(e.side==='blue') value*=factionOf(e.side).sight;
  return value;
}

function maxHpFor(side,kind){
  let value=DEFS[kind].hp;
  if(DEFS[kind].building && hasTech(side,'masonry')) value*=1.22;
  if(kind==='knight' && hasTech(side,'cavalry')) value*=1.15;
  return Math.round(value);
}
function attackFor(e){
  let value=DEFS[e.kind].atk || 0;
  if(hasTech(e.side,'forgedBlades') && ['swordsman','knight','king'].includes(e.kind)) value*=1.15;
  if(hasTech(e.side,'fletching') && ['archer','tower'].includes(e.kind)) value*=1.12;
  if(e.side==='red' && ['swordsman','knight','king'].includes(e.kind)) value*=factionOf(e.side).meleeAttack;
  if(kingAuraActive(e)) value*=factionOf(e.side).kingAuraAttack;
  if(isAiSide(e.side)) value*=aiProfile().combat;
  return value;
}
function rangeFor(e){
  let value=DEFS[e.kind].range || 0;
  if(hasTech(e.side,'fletching') && ['archer','tower'].includes(e.kind)) value+=20;
  if(e.side==='blue' && ['archer','tower'].includes(e.kind)) value+=factionOf(e.side).rangedRange;
  return value;
}
function speedFor(e){
  let value=DEFS[e.kind].speed || 0;
  if(e.kind==='knight' && hasTech(e.side,'cavalry')) value*=1.18;
  if(kingAuraActive(e)) value*=factionOf(e.side).kingAuraSpeed;
  return value;
}
function gatherRateFor(e){
  let value=DEFS[e.kind].gather || 0;
  if(hasTech(e.side,'wheelbarrow')) value*=1.25;
  if(e.side==='blue' && e.kind==='villager') value*=factionOf(e.side).villagerGather;
  if(isAiSide(e.side)) value*=aiProfile().gather;
  return value;
}
function carryFor(e){
  let value=DEFS[e.kind].carry || 0;
  if(hasTech(e.side,'wheelbarrow')) value*=1.25;
  return value;
}

function canStartResearch(side,id,building){
  const r=sideState(side), def=RESEARCH[id];
  if(!r || !def || r.research) return false;
  if(!building || building.side!==side || !building.constructed || building.kind!==def.from) return false;
  if(def.toAge){ if(r.age!==def.age) return false; }
  else { if(r.age<def.age || r.techs[id]) return false; }
  return r.g>=def.g && r.w>=def.w;
}
function startResearch(side,id,building){
  if(!canStartResearch(side,id,building)) return false;
  const r=sideState(side), def=RESEARCH[id];
  r.g-=def.g; r.w-=def.w;
  r.research={id,t:def.t,total:def.t};
  return true;
}
function completeResearch(side,id){
  const r=sideState(side), def=RESEARCH[id];
  if(!r || !def) return;
  if(def.toAge) r.age=def.toAge;
  else r.techs[id]=true;
  r.research=null;
  for(const e of G.ents){
    if(e.side!==side) continue;
    const upgraded=maxHpFor(side,e.kind);
    if(upgraded>e.maxHp){ e.hp+=upgraded-e.maxHp; e.maxHp=upgraded; }
  }
  const message=def.toAge ? AGE_DEFS[def.toAge].name : def.name;
  if(side===mySide || mode==='sp') toast('⚙ '+COLOR[side].name+': '+message);
}
function stepResearch(dt){
  for(const side of ['red','blue']){
    const r=sideState(side);
    if(!r || !r.research) continue;
    r.research.t-=dt;
    if(r.research.t<=0) completeResearch(side,r.research.id);
  }
}

function spawn(side, kind, x, y, constructed=true) {
  const d = DEFS[kind];
  const maxHp=maxHpFor(side,kind);
  const e = {
    id: nid(), side, kind, x, y,
    hp: constructed ? maxHp : Math.max(1, Math.round(maxHp*0.08)),
    maxHp,
    building: !!d.building,
    constructed,
    bp: constructed ? 1 : 0,           // build progress 0..1
    tx: x, ty: y, moving:false,
    order: null,                        // {type, ...}
    targetId: 0,
    carry: 0, carryType: null,
    nodeId: 0,                          // nodo asignado para recolectar
    cd: 0,                              // cooldown ataque
    queue: [],                          // cola de entrenamiento [{unit, t}]
    qt: 0,                              // tiempo restante del item actual
    rallyX: x, rallyY: y + 70,
    stance: d.building ? 'guard' : 'aggro',
  };
  G.ents.push(e);
  return e;
}

function addNode(type, x, y, amount) {
  G.nodes.push({ id: nid(), type, x, y, amount, max: amount,
                 r: type==='gold'?22:14 });
}

// ---------- Inicialización de partida ----------
function initMap() {
  G = freshState();
  AI.t=0; AI.lastBuild=0;
  if(mode==='sp'){
    const profile=aiProfile();
    G.res[enemySide].g+=profile.startBonus;
    G.res[enemySide].w+=profile.startBonus;
  }
  TERRAIN.init();
  FF.init();
  FOG.init();

  // Castillos
  const RX = 320, RY = MAP_H/2;
  const BX = MAP_W-320, BY = MAP_H/2;
  spawn('red','castle', RX, RY);
  spawn('blue','castle', BX, BY);

  // Héroes: Rey LEÓN (rojo) y Rey NELSON (azul), al lado del castillo
  spawn('red','king', RX+70, RY+60);
  spawn('blue','king', BX-70, BY+60);

  // Aldeanos iniciales
  for (let i=0;i<4;i++){
    spawn('red','villager', RX+90+ (i%2)*26, RY-40+i*28);
    spawn('blue','villager', BX-90-(i%2)*26, BY-40+i*28);
  }

  // Minas de oro cerca de cada base + centro
  addNode('gold', RX+150, RY-150, 1600);
  addNode('gold', RX+170, RY+170, 1600);
  addNode('gold', BX-150, BY-150, 1600);
  addNode('gold', BX-170, BY+170, 1600);
  addNode('gold', MAP_W/2, MAP_H/2-260, 2200);
  addNode('gold', MAP_W/2, MAP_H/2+260, 2200);

  // Bosques (clusters de árboles) cerca de cada base + dispersos
  const clusters = [
    [RX+220, RY+10], [RX+60, RY-260], [RX+60, RY+260],
    [BX-220, BY+10], [BX-60, BY-260], [BX-60, BY+260],
    [MAP_W/2-260, MAP_H/2], [MAP_W/2+260, MAP_H/2],
    [MAP_W/2, 240], [MAP_W/2, MAP_H-240],
  ];
  for (const [cx,cy] of clusters) {
    for (let i=0;i<8;i++){
      const a = Math.random()*Math.PI*2, rd = 18+Math.random()*70;
      addNode('wood', cx+Math.cos(a)*rd, cy+Math.sin(a)*rd, 320);
    }
  }
  recalcPop();
}

function recalcPop() {
  for (const side of ['red','blue']) {
    let pop=0, cap=10;
    for (const e of G.ents) {
      if (e.side!==side || !e.constructed) continue;
      if (!e.building && !DEFS[e.kind].hero) pop += (e.kind==='knight'?2:1);
      if (e.kind==='house') cap += DEFS.house.pop;
    }
    G.res[side].pop = pop;
    G.res[side].cap = Math.min(ageOf(side)>=3?80:60, cap);
  }
}

// ---------- Utilidades ----------
const dist2 = (ax,ay,bx,by)=>{const dx=ax-bx,dy=ay-by;return dx*dx+dy*dy;};
const dist  = (ax,ay,bx,by)=>Math.hypot(ax-bx,ay-by);
function entById(id){ for(const e of G.ents) if(e.id===id) return e; return null; }
function nodeById(id){ for(const n of G.nodes) if(n.id===id) return n; return null; }
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }

function nearestDrop(side, x, y){
  let best=null, bd=Infinity;
  for(const e of G.ents){
    if(e.side!==side||!e.constructed) continue;
    if(e.kind!=='castle') continue;
    const d=dist2(x,y,e.x,e.y);
    if(d<bd){bd=d;best=e;}
  }
  return best;
}
function nearestNode(type, x, y){
  let best=null, bd=Infinity;
  for(const n of G.nodes){
    if(n.type!==type||n.amount<=0) continue;
    const d=dist2(x,y,n.x,n.y);
    if(d<bd){bd=d;best=n;}
  }
  return best;
}
function nearestEnemy(side, x, y, maxR){
  let best=null, bd=maxR*maxR;
  for(const e of G.ents){
    if(e.side===side||e.hp<=0) continue;
    const d=dist2(x,y,e.x,e.y);
    if(d<bd){bd=d;best=e;}
  }
  return best;
}

// ---------- Comandos (autoridad: host/sp) ----------
function canAfford(side, key, pop=0){
  const r=sideState(side), c=COST[key];
  if(!r||!c) return false;
  if(r.g < (c.g||0)) return false;
  if(r.w < (c.w||0)) return false;
  if(pop && r.pop + (c.pop||0) > r.cap) return false;
  return true;
}
function pay(side, key){
  const r=G.res[side], c=COST[key];
  r.g -= (c.g||0); r.w -= (c.w||0);
}

function ownsAll(side, ids){
  for(const id of ids){ const e=entById(id); if(!e||e.side!==side) return false; }
  return true;
}

function applyCommand(cmd, side){
  if(G.winner) return;
  switch(cmd.type){
    case 'move': {
      for(const id of cmd.ids){ const e=entById(id);
        if(e&&e.side===side&&!e.building){ e.order={type:'move'}; e.tx=cmd.x; e.ty=cmd.y; e.targetId=0; e.moving=true; e.nodeId=0; } }
      break; }
    case 'attackmove': {
      for(const id of cmd.ids){ const e=entById(id);
        if(e&&e.side===side&&!e.building){ e.order={type:'attackmove',x:cmd.x,y:cmd.y}; e.tx=cmd.x; e.ty=cmd.y; e.targetId=0; e.moving=true; e.nodeId=0; } }
      break; }
    case 'attack': {
      const tgt=entById(cmd.targetId);
      if(!tgt) break;
      for(const id of cmd.ids){ const e=entById(id);
        if(e&&e.side===side&&!e.building){ e.order={type:'attack'}; e.targetId=cmd.targetId; e.moving=true; e.nodeId=0; } }
      break; }
    case 'gather': {
      const n=nodeById(cmd.nodeId); if(!n) break;
      for(const id of cmd.ids){ const e=entById(id);
        if(e&&e.side===side&&e.kind==='villager'){ e.order={type:'gather'}; e.nodeId=cmd.nodeId; e.targetId=0; e.moving=true; } }
      break; }
    case 'build': {
      const key=cmd.kind;
      if(!COST[key]||!COST[key].build) break;
      if(!canBuildKind(side,key)) break;
      if(!canAfford(side,key)) break;
      // valida posición (no encima de otro edificio/nodo)
      if(!validPlacement(cmd.x,cmd.y, DEFS[key].r)) break;
      pay(side,key);
      const f=spawn(side,key,cmd.x,cmd.y,false);
      for(const id of cmd.villagerIds){ const e=entById(id);
        if(e&&e.side===side&&e.kind==='villager'){ e.order={type:'build', targetId:f.id}; e.targetId=f.id; e.moving=true; e.nodeId=0; } }
      recalcPop();
      break; }
    case 'train': {
      const b=entById(cmd.buildingId);
      if(!b||b.side!==side||!b.constructed||!b.building) break;
      const c=COST[cmd.unit];
      if(!c||c.from!==b.kind||!canTrainUnit(side,cmd.unit)) break;
      if(b.queue.length>=8) break;
      if(!canAfford(side,cmd.unit,1)) break;
      pay(side,cmd.unit);
      b.queue.push({unit:cmd.unit, t:c.t});
      break; }
    case 'research': {
      const b=entById(cmd.buildingId);
      startResearch(side,cmd.researchId,b);
      break; }
    case 'rally': {
      const b=entById(cmd.buildingId);
      if(b&&b.side===side&&b.building){ b.rallyX=cmd.x; b.rallyY=cmd.y; }
      break; }
    case 'cancelTrain': {
      const b=entById(cmd.buildingId);
      if(b&&b.side===side&&b.queue.length){
        const it=b.queue.pop(); const c=COST[it.unit];
        G.res[side].g+=(c.g||0); G.res[side].w+=(c.w||0);
      }
      break; }
  }
}

function validPlacement(x,y,r){
  const state=activeState();
  if(!state||x<r||y<r||x>MAP_W-r||y>MAP_H-r) return false;
  for(const e of state.ents){ if(e.building && dist(x,y,e.x,e.y) < r+DEFS[e.kind].r+6) return false; }
  for(const n of state.nodes){ if(dist(x,y,n.x,n.y) < r+n.r+6) return false; }
  for(const objective of (state.objectives||[])){ if(dist(x,y,objective.x,objective.y) < r+OBJECTIVE_RADIUS+8) return false; }
  return true;
}

// issue desde input local: en cliente se envía por red, si no se aplica directo
function issue(cmd){
  if(mode==='client'){ Net.sendCmd(cmd); }
  else { applyCommand(cmd, mySide); }
}

// ============================================================
//  TERRAIN — openage terrain_tile / terrain_chunk
//  Tiles con costos de movimiento variables: pasto(1), barro(3), agua(255), camino(0.5)
// ============================================================
const TERRAIN = {
  TILE: 80,           // tamaño de tile en px
  tiles: null,        // Float32Array de costos por tile (para FF)
  biomes: null,       // Uint8Array tipo visual: 0=pasto 1=barro 2=agua 3=camino
  COLS: 0, ROWS: 0,

  init() {
    this.COLS = Math.ceil(MAP_W / this.TILE);
    this.ROWS = Math.ceil(MAP_H / this.TILE);
    const N = this.COLS * this.ROWS;
    this.tiles  = new Float32Array(N).fill(1);
    this.biomes = new Uint8Array(N);   // 0=pasto por defecto

    // Genera parches de barro y agua usando noise simple
    const rng = (x,y,s) => {
      let n=(x*374761393+y*668265263+s*1234567)|0;
      n=(n^(n>>13))*1274126177; return ((n^(n>>16))>>>0)/4294967296;
    };
    // Caminos horizontales y verticales centrales
    const midY = Math.floor(this.ROWS/2);
    const midX = Math.floor(this.COLS/2);
    for(let cx=0; cx<this.COLS; cx++){
      if(Math.abs(Math.floor(MAP_H/2/this.TILE)-midY)<=0){
        this.set(cx,midY,3,0.6); // camino horizontal central
      }
    }
    for(let cy=0; cy<this.ROWS; cy++){
      this.set(midX,cy,3,0.6); // camino vertical central
    }

    // Parches de barro (cost 2.5)
    for(let cy=0; cy<this.ROWS; cy++){
      for(let cx=0; cx<this.COLS; cx++){
        if(this.biomes[cy*this.COLS+cx]!==0) continue;
        const r=rng(cx,cy,7);
        if(r<0.04) this.set(cx,cy,2,255);       // agua
        else if(r<0.16) this.set(cx,cy,1,2.5);  // barro
      }
    }

    // Limpia tiles cerca de castillos para no bloquear spawn
    const clearAround=(wx,wy,rad)=>{
      const cx0=Math.floor((wx-rad)/this.TILE), cy0=Math.floor((wy-rad)/this.TILE);
      const cx1=Math.ceil((wx+rad)/this.TILE),  cy1=Math.ceil((wy+rad)/this.TILE);
      for(let cy=cy0;cy<=cy1;cy++) for(let cx=cx0;cx<=cx1;cx++) this.set(cx,cy,0,1);
    };
    clearAround(320, MAP_H/2, 180);
    clearAround(MAP_W-320, MAP_H/2, 180);
  },

  set(cx,cy,biome,cost){
    if(cx<0||cx>=this.COLS||cy<0||cy>=this.ROWS) return;
    const i=cy*this.COLS+cx;
    this.biomes[i]=biome; this.tiles[i]=cost;
  },

  // Aplica costos de terreno al FF.cost (se llama en rebuildCost)
  applyToFF() {
    const ffCell=FF.CELL, tileSize=this.TILE;
    const ratio=tileSize/ffCell;
    for(let tcy=0;tcy<this.ROWS;tcy++){
      for(let tcx=0;tcx<this.COLS;tcx++){
        const cost=this.tiles[tcy*this.COLS+tcx];
        if(cost===1) continue;
        // Marca todas las celdas FF dentro de este tile
        const fx0=Math.floor(tcx*ratio), fy0=Math.floor(tcy*ratio);
        const fx1=Math.ceil((tcx+1)*ratio), fy1=Math.ceil((tcy+1)*ratio);
        for(let fy=fy0;fy<fy1;fy++) for(let fx=fx0;fx<fx1;fx++){
          if(fx<0||fx>=FF.COLS||fy<0||fy>=FF.ROWS) continue;
          const fi=fy*FF.COLS+fx;
          if(FF.cost[fi]!==255) FF.cost[fi]=Math.max(FF.cost[fi], cost===255?255:Math.round(cost));
        }
      }
    }
  },

  // Devuelve factor de velocidad en posición mundo (1=normal, <1=más rápido, >1=más lento)
  speedFactor(wx,wy){
    const cx=clamp(Math.floor(wx/this.TILE),0,this.COLS-1);
    const cy=clamp(Math.floor(wy/this.TILE),0,this.ROWS-1);
    const c=this.tiles[cy*this.COLS+cx];
    if(c>=255) return 0.1;
    if(c<=0.6) return 1.35;  // camino: más rápido
    if(c>=2)   return 0.55;  // barro: más lento
    return 1;
  },
};

// ============================================================
//  SPATIAL HASH GRID — O(1) lookup de vecinos (openage architecture)
//  Reemplaza O(n²) en separate() y nearestEnemy()
// ============================================================
const SH = {
  CELL: 80,
  map: new Map(),

  clear(){ this.map.clear(); },
  key(wx,wy){ return `${(wx/this.CELL)|0},${(wy/this.CELL)|0}`; },

  insert(e){
    const k=this.key(e.x,e.y);
    if(!this.map.has(k)) this.map.set(k,[]);
    this.map.get(k).push(e);
  },

  // Devuelve entidades en radio
  query(wx,wy,r){
    const cr=Math.ceil(r/this.CELL);
    const cx=(wx/this.CELL)|0, cy=(wy/this.CELL)|0;
    const res=[];
    for(let dy=-cr;dy<=cr;dy++) for(let dx=-cr;dx<=cr;dx++){
      const k=`${cx+dx},${cy+dy}`;
      const bucket=this.map.get(k);
      if(bucket) for(const e of bucket) res.push(e);
    }
    return res;
  },

  rebuild(ents){ this.clear(); for(const e of ents) this.insert(e); },
};

// ============================================================
//  PARTÍCULAS — renderer de efectos visuales
// ============================================================
function spawnParticles(x, y, type){
  if(!G || !G.particles) return;
  const now = performance.now()/1000;
  if(type==='hit'){
    for(let i=0;i<6;i++){
      const a=Math.random()*Math.PI*2, sp=30+Math.random()*60;
      G.particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,
        life:0.35, maxLife:0.35, color:'#ff6b3b', r:2.5, type:'spark'});
    }
  } else if(type==='death'){
    for(let i=0;i<14;i++){
      const a=Math.random()*Math.PI*2, sp=20+Math.random()*90;
      G.particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,
        life:0.6, maxLife:0.6, color:i%2?'#c0392b':'#e74c3c', r:3+Math.random()*3, type:'spark'});
    }
  } else if(type==='gold'){
    for(let i=0;i<5;i++){
      const a=-Math.PI/2 + (Math.random()-0.5)*1.2, sp=40+Math.random()*40;
      G.particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,
        life:0.5, maxLife:0.5, color:'#ffd84a', r:3, type:'float'});
    }
  } else if(type==='build'){
    for(let i=0;i<10;i++){
      const a=Math.random()*Math.PI*2, sp=15+Math.random()*40;
      G.particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-30,
        life:0.7, maxLife:0.7, color:'#c8b99a', r:2+Math.random()*2, type:'dust'});
    }
  }
}

function stepParticles(dt){
  if(!G.particles) return;
  for(const p of G.particles){
    p.x += p.vx*dt; p.y += p.vy*dt;
    if(p.type==='spark'){ p.vy += 120*dt; }   // gravedad
    if(p.type==='float'){ p.vy -= 20*dt; }     // flota
    if(p.type==='dust') { p.vx*=0.92; p.vy*=0.92; }
    p.life -= dt;
  }
  G.particles = G.particles.filter(p=>p.life>0);
}

function drawParticles(S){
  if(!S.particles) return;
  for(const p of S.particles){
    if(p.x<cam.x-10||p.x>cam.x+view.w+10||p.y<cam.y-10||p.y>cam.y+view.h+10) continue;
    ctx.globalAlpha = clamp(p.life/p.maxLife, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x-cam.x, p.y-cam.y, p.r, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ============================================================
//  AUDIO PROCEDURAL — Web Audio API (sin archivos, puro código)
//  Inspirado en el event system de openage para audio triggers
// ============================================================
const SFX = {
  ctx: null,
  init(){ try{ this.ctx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} },
  resume(){ if(this.ctx && this.ctx.state==='suspended') this.ctx.resume(); },

  play(type){
    if(!this.ctx) return;
    const ac=this.ctx, now=ac.currentTime;
    const osc=ac.createOscillator(), gain=ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);

    if(type==='hit'){
      osc.type='sawtooth'; osc.frequency.setValueAtTime(220,now);
      osc.frequency.exponentialRampToValueAtTime(80,now+0.08);
      gain.gain.setValueAtTime(0.18,now); gain.gain.exponentialRampToValueAtTime(0.001,now+0.12);
      osc.start(now); osc.stop(now+0.12);
    } else if(type==='death'){
      osc.type='sawtooth'; osc.frequency.setValueAtTime(300,now);
      osc.frequency.exponentialRampToValueAtTime(40,now+0.35);
      gain.gain.setValueAtTime(0.22,now); gain.gain.exponentialRampToValueAtTime(0.001,now+0.35);
      osc.start(now); osc.stop(now+0.35);
    } else if(type==='gold'){
      osc.type='sine'; osc.frequency.setValueAtTime(880,now);
      osc.frequency.setValueAtTime(1100,now+0.05);
      gain.gain.setValueAtTime(0.12,now); gain.gain.exponentialRampToValueAtTime(0.001,now+0.18);
      osc.start(now); osc.stop(now+0.18);
    } else if(type==='build'){
      osc.type='square'; osc.frequency.setValueAtTime(160,now);
      osc.frequency.exponentialRampToValueAtTime(260,now+0.12);
      gain.gain.setValueAtTime(0.14,now); gain.gain.exponentialRampToValueAtTime(0.001,now+0.2);
      osc.start(now); osc.stop(now+0.2);
    } else if(type==='train'){
      ['sine','sine'].forEach((t,i)=>{
        const o=ac.createOscillator(), g=ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.type=t; o.frequency.setValueAtTime(520+i*130,now+i*0.08);
        g.gain.setValueAtTime(0.1,now+i*0.08); g.gain.exponentialRampToValueAtTime(0.001,now+i*0.08+0.15);
        o.start(now+i*0.08); o.stop(now+i*0.08+0.15);
      });
      return;
    } else if(type==='victory'){
      [523,659,784,1047].forEach((f,i)=>{
        const o=ac.createOscillator(), g=ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.type='sine'; o.frequency.setValueAtTime(f,now+i*0.12);
        g.gain.setValueAtTime(0.15,now+i*0.12); g.gain.exponentialRampToValueAtTime(0.001,now+i*0.12+0.22);
        o.start(now+i*0.12); o.stop(now+i*0.12+0.25);
      });
      return;
    } else if(type==='defeat'){
      [784,659,523,392].forEach((f,i)=>{
        const o=ac.createOscillator(), g=ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.type='sine'; o.frequency.setValueAtTime(f,now+i*0.15);
        g.gain.setValueAtTime(0.14,now+i*0.15); g.gain.exponentialRampToValueAtTime(0.001,now+i*0.15+0.25);
        o.start(now+i*0.15); o.stop(now+i*0.15+0.28);
      });
      return;
    } else if(type==='cheat'){
      [440,554,659,880,1108].forEach((f,i)=>{
        const o=ac.createOscillator(), g=ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.type='triangle'; o.frequency.setValueAtTime(f,now+i*0.07);
        g.gain.setValueAtTime(0.13,now+i*0.07); g.gain.exponentialRampToValueAtTime(0.001,now+i*0.07+0.12);
        o.start(now+i*0.07); o.stop(now+i*0.07+0.15);
      });
      return;
    }
  },
};

// ============================================================
//  FLOW FIELD PATHFINDING — inspirado en openage / Emerson
//  Grid → Sectores → CostField → IntegrationField → FlowField
// ============================================================
const FF = {
  CELL: 40,          // tamaño de celda en px
  COLS: 0, ROWS: 0,  // inicializado en initFF()
  cost: null,        // Uint8Array: coste por celda (1-254, 255=bloqueado)
  cache: new Map(),  // caché de FlowFields por destino "cx,cy"
  CACHE_MAX: 24,

  init() {
    this.COLS = Math.ceil(MAP_W / this.CELL);
    this.ROWS = Math.ceil(MAP_H / this.CELL);
    this.cost = new Uint8Array(this.COLS * this.ROWS).fill(1);
    this.cache.clear();
  },

  idx(cx, cy) { return cy * this.COLS + cx; },
  worldToCell(wx, wy) {
    return {
      cx: clamp(Math.floor(wx / this.CELL), 0, this.COLS - 1),
      cy: clamp(Math.floor(wy / this.CELL), 0, this.ROWS - 1),
    };
  },
  cellCenter(cx, cy) {
    return { x: (cx + 0.5) * this.CELL, y: (cy + 0.5) * this.CELL };
  },

  // Marca celdas bloqueadas según edificios + terreno
  rebuildCost() {
    this.cost.fill(1);
    if (!G) return;
    TERRAIN.applyToFF();  // terreno primero
    for (const e of G.ents) {
      if (!e.building || !e.constructed) continue;
      const r = DEFS[e.kind].r + 4;
      const x0 = Math.floor((e.x - r) / this.CELL);
      const y0 = Math.floor((e.y - r) / this.CELL);
      const x1 = Math.ceil((e.x + r) / this.CELL);
      const y1 = Math.ceil((e.y + r) / this.CELL);
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          if (cx >= 0 && cx < this.COLS && cy >= 0 && cy < this.ROWS)
            this.cost[this.idx(cx, cy)] = 255;
        }
      }
    }
    this.cache.clear();
  },

  // Integration Field: BFS desde destino acumulando costos
  buildIntegration(dcx, dcy) {
    const N = this.COLS * this.ROWS;
    const inte = new Float32Array(N).fill(Infinity);
    const di = this.idx(dcx, dcy);
    inte[di] = 0;
    const queue = [di];
    const C = this.COLS, R = this.ROWS;
    let head = 0;
    while (head < queue.length) {
      const i = queue[head++];
      const cy = (i / C) | 0, cx = i % C;
      const cur = inte[i];
      const neighbors = [
        cx>0   ? i-1   : -1,
        cx<C-1 ? i+1   : -1,
        cy>0   ? i-C   : -1,
        cy<R-1 ? i+C   : -1,
        (cx>0 && cy>0)   ? i-C-1 : -1,
        (cx<C-1 && cy>0) ? i-C+1 : -1,
        (cx>0 && cy<R-1) ? i+C-1 : -1,
        (cx<C-1 && cy<R-1) ? i+C+1 : -1,
      ];
      const costs = [1,1,1,1,1.41,1.41,1.41,1.41];
      for (let n = 0; n < 8; n++) {
        const ni = neighbors[n];
        if (ni < 0) continue;
        if (this.cost[ni] === 255) continue;
        const nc = cur + this.cost[ni] * costs[n];
        if (nc < inte[ni]) { inte[ni] = nc; queue.push(ni); }
      }
    }
    return inte;
  },

  // Flow Field: vector por celda apuntando al vecino más barato
  buildFlow(inte) {
    const N = this.COLS * this.ROWS;
    const flow = new Int8Array(N * 2); // [dx, dy] por celda, -1/0/1
    const C = this.COLS, R = this.ROWS;
    const DX = [-1,1,0,0,-1,1,-1,1];
    const DY = [0,0,-1,1,-1,-1,1,1];
    for (let i = 0; i < N; i++) {
      if (this.cost[i] === 255) continue;
      let best = Infinity, bdx = 0, bdy = 0;
      const cy = (i / C) | 0, cx = i % C;
      for (let d = 0; d < 8; d++) {
        const nx = cx + DX[d], ny = cy + DY[d];
        if (nx < 0 || nx >= C || ny < 0 || ny >= R) continue;
        const ni = ny * C + nx;
        if (inte[ni] < best) { best = inte[ni]; bdx = DX[d]; bdy = DY[d]; }
      }
      flow[i * 2]     = bdx;
      flow[i * 2 + 1] = bdy;
    }
    return flow;
  },

  // Obtiene o genera FlowField cacheado para un destino
  getFlow(wx, wy) {
    const { cx, cy } = this.worldToCell(wx, wy);
    const key = `${cx},${cy}`;
    if (this.cache.has(key)) return { flow: this.cache.get(key), cx, cy };
    const inte = this.buildIntegration(cx, cy);
    const flow = this.buildFlow(inte);
    if (this.cache.size >= this.CACHE_MAX) {
      this.cache.delete(this.cache.keys().next().value);
    }
    this.cache.set(key, flow);
    return { flow, cx, cy };
  },

  // Dirección de movimiento para una entidad en posición (wx,wy) hacia destino
  direction(wx, wy, destWx, destWy) {
    const { flow } = this.getFlow(destWx, destWy);
    const { cx, cy } = this.worldToCell(wx, wy);
    const i = this.idx(cx, cy);
    return { dx: flow[i * 2], dy: flow[i * 2 + 1] };
  },
};

// ============================================================
//  LOS — Line of Sight en el Integration Field
//  Celdas con visión directa al destino reciben coste 0 (van directo)
// ============================================================
FF.buildIntegrationWithLOS = function(dcx, dcy) {
  const N = this.COLS * this.ROWS;
  const inte = new Float32Array(N).fill(Infinity);
  const los  = new Uint8Array(N);       // 1 = tiene LOS al destino
  const C = this.COLS, R = this.ROWS;
  const di = this.idx(dcx, dcy);
  inte[di] = 0; los[di] = 1;

  // Rasteriza línea de Bresenham entre celda y destino para marcar LOS
  const markLOS = (cx, cy) => {
    let x0=cx, y0=cy, x1=dcx, y1=dcy;
    const dx=Math.abs(x1-x0), dy=Math.abs(y1-y0);
    const sx=x0<x1?1:-1, sy=y0<y1?1:-1;
    let err=dx-dy;
    while(!(x0===x1&&y0===y1)){
      const ii=y0*C+x0;
      if(this.cost[ii]===255) return false;
      const e2=2*err;
      if(e2>-dy){err-=dy;x0+=sx;}
      if(e2< dx){err+=dx;y0+=sy;}
    }
    return true;
  };

  const queue = [di];
  let head = 0;
  while (head < queue.length) {
    const i = queue[head++];
    const cy = (i/C)|0, cx = i%C;
    const cur = inte[i];
    const neighbors = [
      cx>0?i-1:-1, cx<C-1?i+1:-1, cy>0?i-C:-1, cy<R-1?i+C:-1,
      (cx>0&&cy>0)?i-C-1:-1, (cx<C-1&&cy>0)?i-C+1:-1,
      (cx>0&&cy<R-1)?i+C-1:-1, (cx<C-1&&cy<R-1)?i+C+1:-1,
    ];
    const costs=[1,1,1,1,1.41,1.41,1.41,1.41];
    for(let n=0;n<8;n++){
      const ni=neighbors[n]; if(ni<0) continue;
      if(this.cost[ni]===255) continue;
      const ncy=(ni/C)|0, ncx=ni%C;
      let nc;
      if(markLOS(ncx,ncy)){ nc=0; los[ni]=1; }
      else { nc=cur+this.cost[ni]*costs[n]; }
      if(nc<inte[ni]){ inte[ni]=nc; queue.push(ni); }
    }
  }
  return {inte, los};
};

// Sobreescribe getFlow para usar LOS
FF.getFlow = function(wx, wy) {
  const {cx,cy} = this.worldToCell(wx,wy);
  const key = `${cx},${cy}`;
  if(this.cache.has(key)) return {flow:this.cache.get(key),cx,cy};
  const {inte} = this.buildIntegrationWithLOS(cx,cy);
  const flow = this.buildFlow(inte);
  if(this.cache.size>=this.CACHE_MAX) this.cache.delete(this.cache.keys().next().value);
  this.cache.set(key,flow);
  return {flow,cx,cy};
};

// ============================================================
//  FORMACIONES — openage-style: distribuye unidades en rejilla
//  cuando se ordenan mover en grupo
// ============================================================
function computeFormationPositions(units, tx, ty) {
  const n = units.length;
  if (n === 1) return [{x:tx, y:ty}];
  const cols  = Math.ceil(Math.sqrt(n));
  const rows  = Math.ceil(n / cols);
  const gap   = 28;  // separación entre slots
  const W     = (cols - 1) * gap;
  const H     = (rows - 1) * gap;
  const positions = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (positions.length >= n) break;
      positions.push({
        x: clamp(tx - W/2 + c*gap, 20, MAP_W-20),
        y: clamp(ty - H/2 + r*gap, 20, MAP_H-20),
      });
    }
  }
  // Asigna el slot más cercano a cada unidad (greedy)
  const assigned = [];
  const usedSlots = new Set();
  for (const u of units) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < positions.length; i++) {
      if (usedSlots.has(i)) continue;
      const d = dist2(u.x, u.y, positions[i].x, positions[i].y);
      if (d < bd) { bd = d; best = i; }
    }
    usedSlots.add(best);
    assigned.push({unit:u, pos:positions[best]});
  }
  return assigned;
}

// ============================================================
//  NIEBLA DE GUERRA — Fog of War
//  0=oculto  1=explorado(gris)  2=visible
// ============================================================
const FOG = {
  CELL: 48,
  COLS: 0, ROWS: 0,
  vis: null,   // Uint8Array actual
  exp: null,   // Uint8Array explorado (persiste)

  init() {
    this.COLS = Math.ceil(MAP_W / this.CELL);
    this.ROWS = Math.ceil(MAP_H / this.CELL);
    const N = this.COLS * this.ROWS;
    this.vis = new Uint8Array(N);
    this.exp = new Uint8Array(N);
  },

  update(side, state=activeState()) {
    if (!state || !this.vis) return;
    this.vis.fill(0);
    for (const e of state.ents) {
      if (e.side !== side) continue;
      const sight = sightFor(e);
      const cx = Math.floor(e.x / this.CELL);
      const cy = Math.floor(e.y / this.CELL);
      const cr = Math.ceil(sight / this.CELL);
      const r2 = (sight / this.CELL) ** 2;
      for (let dy = -cr; dy <= cr; dy++) {
        for (let dx = -cr; dx <= cr; dx++) {
          if (dx*dx + dy*dy > r2) continue;
          const nx = cx+dx, ny = cy+dy;
          if (nx<0||nx>=this.COLS||ny<0||ny>=this.ROWS) continue;
          const i = ny*this.COLS+nx;
          this.vis[i] = 2;
          this.exp[i] = 1;
        }
      }
    }
  },

  // Retorna 0/1/2 para una posición mundo
  at(wx, wy) {
    const cx = clamp(Math.floor(wx/this.CELL),0,this.COLS-1);
    const cy = clamp(Math.floor(wy/this.CELL),0,this.ROWS-1);
    const i  = cy*this.COLS+cx;
    return this.vis[i] || this.exp[i];
  },

  // Dibuja overlay de niebla sobre el mapa (después de restaurar ctx)
  draw() {
    const C=this.COLS, CELL=this.CELL;
    for (let cy=0; cy<this.ROWS; cy++) {
      for (let cx=0; cx<C; cx++) {
        const wx=cx*CELL-cam.x, wy=cy*CELL-cam.y;
        if(wx>view.w||wy>view.h||wx+CELL<0||wy+CELL<0) continue;
        const v = this.vis[cy*C+cx];
        const e = this.exp[cy*C+cx];
        if (v===2) continue;
        ctx.fillStyle = e ? 'rgba(0,0,0,0.48)' : 'rgba(0,0,0,0.82)';
        ctx.fillRect(wx, wy, CELL+1, CELL+1);
      }
    }
  },
};

let fogEnabled = true; // toggle con tecla G

// Rebuildea cost field cada 3s (edificios cambian poco)
let ffRebuildT = 0;

function objectivePower(e){
  if(e.building || e.kind==='villager' || e.hp<=0) return 0;
  let power=e.kind==='king'?2:e.kind==='knight'?1.3:1;
  power*=factionOf(e.side).capturePower || 1;
  return power;
}
function stepObjectives(dt){
  for(const objective of G.objectives){
    let red=0, blue=0;
    for(const e of G.ents){
      if(dist(e.x,e.y,objective.x,objective.y)>OBJECTIVE_RADIUS) continue;
      const power=objectivePower(e);
      if(e.side==='red') red+=power;
      else if(e.side==='blue') blue+=power;
    }
    const pressure=red-blue;
    const previous=objective.owner;
    if(Math.abs(pressure)>0.05){
      objective.control=clamp(objective.control+pressure*13*dt,-100,100);
    } else if(!objective.owner){
      objective.control*=Math.max(0,1-dt*0.18);
    }
    if(objective.control>=100) objective.owner='red';
    else if(objective.control<=-100) objective.owner='blue';
    else if(previous==='red' && objective.control<25) objective.owner=null;
    else if(previous==='blue' && objective.control>-25) objective.owner=null;
    if(previous!==objective.owner){
      if(objective.owner) toast('⚑ '+COLOR[objective.owner].name+' capturó '+objective.name);
      else if(previous) toast('⚔ '+objective.name+' fue neutralizado');
    }
  }

  const redOwned=objectiveCount(G,'red'), blueOwned=objectiveCount(G,'blue');
  G.res.red.g+=redOwned*1.2*dt; G.res.red.w+=redOwned*0.8*dt;
  G.res.blue.g+=blueOwned*1.2*dt; G.res.blue.w+=blueOwned*0.8*dt;

  for(const side of ['red','blue']){
    const owned=side==='red'?redOwned:blueOwned;
    if(owned>=2) G.dominance[side]+=dt;
    else G.dominance[side]=Math.max(0,G.dominance[side]-dt*1.5);
    if(G.dominance[side]>=DOMINANCE_SECONDS){
      G.winner=side; G.victoryReason='supremacy';
      return;
    }
  }
}
function aiObjectiveTarget(side){
  const castle=G.ents.find((e)=>e.side===side && e.kind==='castle');
  const candidates=G.objectives.filter((objective)=>objective.owner!==side);
  candidates.sort((a,b)=>{
    const enemyA=a.owner && a.owner!==side ? 0 : 1;
    const enemyB=b.owner && b.owner!==side ? 0 : 1;
    if(enemyA!==enemyB) return enemyA-enemyB;
    if(!castle) return Math.abs(a.control)-Math.abs(b.control);
    return dist2(castle.x,castle.y,a.x,a.y)-dist2(castle.x,castle.y,b.x,b.y);
  });
  return candidates[0] || null;
}

// ---------- Simulación ----------
function step(dt){
  if(G.winner) return;
  G.time += dt; G.tick++;
  stepResearch(dt);
  stepObjectives(dt);
  if(G.winner) return;

  // Reconstruye cost field cada 3s
  ffRebuildT -= dt;
  if (ffRebuildT <= 0) { FF.rebuildCost(); ffRebuildT = 3; }

  // Spatial hash cada tick (barato, O(n))
  SH.rebuild(G.ents);

  // Partículas
  stepParticles(dt);

  // Edificios: producción y defensa
  for(const e of G.ents){
    if(e.hp<=0) continue;
    if(e.building && e.constructed){
      // entrenamiento
      if(e.queue.length){
        e.queue[0].t -= dt;
        if(e.queue[0].t<=0){
          const it=e.queue.shift();
          const sp=spawnNear(e, it.unit);
          if(sp){ sp.order={type:'move'}; sp.tx=e.rallyX; sp.ty=e.rallyY; sp.moving=true; }
          SFX.play('train'); spawnParticles(e.x, e.y+DEFS[e.kind].r, 'build');
        }
      }
      // torres y castillo disparan
      const d=DEFS[e.kind], range=rangeFor(e);
      if(range){
        e.cd-=dt;
        let tgt=entById(e.targetId);
        if(!tgt||tgt.hp<=0||dist(e.x,e.y,tgt.x,tgt.y)>range){ tgt=nearestEnemy(e.side,e.x,e.y,range); e.targetId=tgt?tgt.id:0; }
        if(tgt&&e.cd<=0){ shoot(e,tgt,attackFor(e),true); e.cd=d.cd; }
      }
      continue;
    }
    if(e.building && !e.constructed){
      // se construye por aldeanos (abajo). si nadie la construye, queda igual.
      continue;
    }
    // Unidades
    // Héroes: regeneración lenta y expiración de buff temporal (trampita)
    if(DEFS[e.kind].hero){
      if(e.hp<e.maxHp) e.hp=Math.min(e.maxHp, e.hp + DEFS[e.kind].regen*dt);
      if(e.buffT>0){ e.buffT-=dt; if(e.buffT<=0){ e.buffT=0; e.atkMul=1; e.spdMul=1; } }
    }
    stepUnit(e, dt);
  }

  // Proyectiles
  for(const p of G.projectiles){
    const t=entById(p.targetId);
    if(!t||t.hp<=0){ p.dead=true; continue; }
    const dx=t.x-p.x, dy=t.y-p.y, dd=Math.hypot(dx,dy);
    const sp=p.speed*dt;
    if(dd<=sp+2){ p.x=t.x; p.y=t.y; damage(t,p.dmg,p.side); p.dead=true; }
    else { p.x+=dx/dd*sp; p.y+=dy/dd*sp; }
  }
  G.projectiles = G.projectiles.filter(p=>!p.dead);

  // Limpieza de muertos
  let castleDead=null;
  G.ents = G.ents.filter(e=>{
    if(e.hp>0) return true;
    if(e.kind==='castle') castleDead=e.side;
    return false;
  });
  G.nodes = G.nodes.filter(n=>n.amount>0);

  // Separación suave entre unidades
  separate();

  recalcPop();

  if(castleDead){ G.winner = (castleDead==='red')?'blue':'red'; G.victoryReason='castle'; }

  // IA (solo single player, controla al enemigo)
  if(mode==='sp'){ aiStep(dt); }
}

function spawnNear(b, unit){
  for(let i=0;i<24;i++){
    const a=Math.random()*Math.PI*2, rd=DEFS[b.kind].r+18+Math.random()*30;
    const x=clamp(b.x+Math.cos(a)*rd, 12, MAP_W-12);
    const y=clamp(b.y+Math.sin(a)*rd, 12, MAP_H-12);
    return spawn(b.side, unit, x, y);
  }
  return spawn(b.side, unit, b.x, b.y);
}

function stepUnit(e, dt){
  const d=DEFS[e.kind];
  e.cd-=dt;
  const o=e.order;

  // Aggro automático para militares ociosos
  if(e.kind!=='villager' && (!o || o.type==='move'||o.type==='attackmove')){
    if(!entById(e.targetId)){
      const enemy=nearestEnemy(e.side,e.x,e.y, o&&o.type==='attackmove'?sightFor(e):sightFor(e)*0.7);
      if(enemy) e.targetId=enemy.id;
    }
  }

  // ---- Ataque (objetivo explícito o adquirido) ----
  let tgt=entById(e.targetId);
  if(tgt && tgt.hp>0 && (o&&(o.type==='attack'||o.type==='attackmove') || e.kind!=='villager')){
    const dd=dist(e.x,e.y,tgt.x,tgt.y);
    const reach=rangeFor(e)+DEFS[tgt.kind].r;
    if(dd<=reach){
      e.moving=false;
      if(e.cd<=0){
        const atk=attackFor(e)*(e.atkMul||1);
        if(d.ranged) shoot(e,tgt,atk,false);
        else damage(tgt, atk, e.side);
        e.cd=d.cd;
      }
    } else {
      moveToward(e, tgt.x, tgt.y, dt);
    }
    return;
  } else {
    e.targetId=0;
    if(o&&o.type==='attack'){ e.order={type:'move'}; }
  }

  if(!o){ e.moving=false; return; }

  // ---- Recolección ----
  if(o.type==='gather' && e.kind==='villager'){
    const carryLimit=carryFor(e);
    if(e.carry>=carryLimit){
      // volver a dejar
      const drop=nearestDrop(e.side,e.x,e.y);
      if(!drop){ e.moving=false; return; }
      if(dist(e.x,e.y,drop.x,drop.y) <= DEFS.castle.r+14){
        G.res[e.side][e.carryType==='gold'?'g':'w'] += e.carry;
        spawnParticles(e.x,e.y,'gold'); SFX.play('gold');
        e.carry=0; e.carryType=null;
      } else moveToward(e, drop.x, drop.y, dt);
      return;
    }
    let n=nodeById(e.nodeId);
    if(!n||n.amount<=0){ n=nearestNode(e.carryType||'gold', e.x,e.y); if(n) e.nodeId=n.id; }
    if(!n){ e.moving=false; e.order=null; return; }
    if(dist(e.x,e.y,n.x,n.y) <= n.r+14){
      e.moving=false;
      const amt=Math.min(gatherRateFor(e)*dt, n.amount, carryLimit-e.carry);
      e.carry+=amt; n.amount-=amt; e.carryType=n.type;
    } else moveToward(e, n.x, n.y, dt);
    return;
  }

  // ---- Construcción ----
  if(o.type==='build' && e.kind==='villager'){
    const f=entById(o.targetId);
    if(!f||f.constructed){ e.order=null; e.moving=false; return; }
    if(dist(e.x,e.y,f.x,f.y) <= DEFS[f.kind].r+16){
      e.moving=false;
      f.bp += dt*0.16;                  // ~6s con 1 aldeano
      f.hp = Math.max(f.hp, Math.round(f.maxHp*Math.min(1,f.bp)));
      if(f.bp>=1){ f.bp=1; f.constructed=true; f.hp=f.maxHp; e.order=null; recalcPop();
        spawnParticles(f.x, f.y, 'build'); SFX.play('build'); FF.cache.clear(); }
    } else moveToward(e, f.x, f.y, dt);
    return;
  }

  // ---- Movimiento simple ----
  if(o.type==='move'||o.type==='attackmove'){
    if(dist(e.x,e.y,e.tx,e.ty) <= 6){ e.moving=false; if(o.type==='move') e.order=null; }
    else moveToward(e, e.tx, e.ty, dt);
  }
}

function moveToward(e, tx, ty, dt){
  const d = DEFS[e.kind];
  const dx = tx - e.x, dy = ty - e.y, dd = Math.hypot(dx, dy);
  if (dd < 1) { e.moving = false; return; }
  const sp = speedFor(e) * (e.spdMul || 1) * dt;

  let vx, vy;
  if (dd > FF.CELL * 1.5) {
    // Flow Field para navegación a media/larga distancia
    const dir = FF.direction(e.x, e.y, tx, ty);
    if (dir.dx === 0 && dir.dy === 0) {
      // celda bloqueada o destino inalcanzable: fallback directo
      vx = dx / dd; vy = dy / dd;
    } else {
      const dm = Math.hypot(dir.dx, dir.dy);
      vx = dir.dx / dm; vy = dir.dy / dm;
      // Blending: mezcla flow field con dirección directa cerca del destino
      const blend = clamp((dd - FF.CELL) / (FF.CELL * 4), 0, 1);
      vx = vx * blend + (dx / dd) * (1 - blend);
      vy = vy * blend + (dy / dd) * (1 - blend);
      const vm = Math.hypot(vx, vy);
      if (vm > 0) { vx /= vm; vy /= vm; }
    }
  } else {
    // Directo cuando ya está cerca
    vx = dx / dd; vy = dy / dd;
  }

  // Steering: separación suave de otras unidades (evitar amontonamiento)
  let sx = 0, sy = 0;
  for (const o of G.ents) {
    if (o === e || o.building) continue;
    const ox = e.x - o.x, oy = e.y - o.y;
    const od = Math.hypot(ox, oy);
    const minD = DEFS[e.kind].r + DEFS[o.kind].r + 2;
    if (od > 0 && od < minD * 1.8) {
      const push = (minD * 1.8 - od) / (minD * 1.8);
      sx += (ox / od) * push;
      sy += (oy / od) * push;
    }
  }
  const steerStr = 0.35;
  vx += sx * steerStr; vy += sy * steerStr;
  const vm = Math.hypot(vx, vy);
  if (vm > 0) { vx /= vm; vy /= vm; }

  // Factor de velocidad según terreno
  const tf = TERRAIN.speedFactor(e.x, e.y);
  e.x += vx * Math.min(sp * tf, dd);
  e.y += vy * Math.min(sp * tf, dd);
  e.x = clamp(e.x, 8, MAP_W - 8);
  e.y = clamp(e.y, 8, MAP_H - 8);
  e.moving = true;
}

function shoot(from, tgt, dmg, fromBuilding){
  G.projectiles.push({
    x:from.x, y:from.y, targetId:tgt.id, dmg, side:from.side,
    speed: fromBuilding?260:300, kind:from.kind, dead:false
  });
}
function damage(t, amount, fromSide){
  if(t.hp<=0) return;
  t.hp -= amount;
  spawnParticles(t.x, t.y, 'hit');
  if(mode!=='client') SFX.play('hit');
  if(t.hp<=0){
    spawnParticles(t.x, t.y, 'death');
    if(mode!=='client') SFX.play('death');
  }
  // contraataque
  if(t.hp>0 && !t.building && !entById(t.targetId)){
    const a=nearestEnemy(t.side,t.x,t.y, sightFor(t));
    if(a && t.kind!=='villager') t.targetId=a.id;
  }
}

function separate(){
  // Usa Spatial Hash para O(n) en vez de O(n²)
  for(const a of G.ents){
    if(a.building) continue;
    const neighbors = SH.query(a.x, a.y, 50);
    for(const b of neighbors){
      if(b===a || b.building) continue;
      const dx=b.x-a.x, dy=b.y-a.y; const dd=Math.hypot(dx,dy);
      const min=DEFS[a.kind].r+DEFS[b.kind].r;
      if(dd>0.001 && dd<min){
        const push=(min-dd)/2, ux=dx/dd, uy=dy/dd;
        a.x-=ux*push; a.y-=uy*push;
        b.x+=ux*push; b.y+=uy*push;
      }
    }
    // empuje fuera de edificios cercanos (spatial hash también)
    const nearBuildings = SH.query(a.x, a.y, 60);
    for(const e of nearBuildings){
      if(!e.building||!e.constructed) continue;
      const dx=a.x-e.x, dy=a.y-e.y; const dd=Math.hypot(dx,dy);
      const min=DEFS[a.kind].r+DEFS[e.kind].r;
      if(dd>0.001 && dd<min){ const p=(min-dd); a.x+=dx/dd*p; a.y+=dy/dd*p; }
    }
    a.x=clamp(a.x,8,MAP_W-8); a.y=clamp(a.y,8,MAP_H-8);
  }
}

// ---------- IA (enemigo en single player) ----------
const AI = { t:0, lastBuild:0 };
function aiTryResearch(side,castle,barracks,profile){
  const r=sideState(side); if(!r) return null;
  if(r.research) return 'active';
  // AI_AGE_RESERVE: al llegar el momento de avanzar, conserva recursos hasta pagarlo.
  if(r.age===1 && G.time>=profile.age2At){
    return startResearch(side,'age2',castle)?'active':'save-age';
  }
  if(r.age===2 && G.time>=profile.age3At){
    return startResearch(side,'age3',castle)?'active':'save-age';
  }
  if(r.age===1 && barracks.length===0) return null;
  const priorities=r.age>=3
    ? ['cavalry','forgedBlades','fletching','masonry','wheelbarrow']
    : r.age>=2 ? ['forgedBlades','fletching','masonry','wheelbarrow'] : ['wheelbarrow'];
  for(const id of priorities){
    const def=RESEARCH[id];
    const building=def.from==='castle'?castle:barracks[0];
    if(building && startResearch(side,id,building)) return 'active';
  }
  return null;
}
function aiStep(dt){
  AI.t += dt;
  const side=enemySide, r=G.res[side], profile=aiProfile();
  if(G.tick % profile.decisionTicks !== 0) return;

  const mine = G.ents.filter(e=>e.side===side);
  const castle = mine.find(e=>e.kind==='castle'&&e.constructed);
  if(!castle) return;
  const vills = mine.filter(e=>e.kind==='villager');
  const army  = mine.filter(e=>!e.building && e.kind!=='villager' && e.kind!=='king');
  const barracks = mine.filter(e=>e.kind==='barracks'&&e.constructed);
  const towers = mine.filter(e=>e.kind==='tower');

  const idleV = vills.filter(v=>!v.order || (v.order.type==='move'&&!v.moving));
  for(const v of idleV){
    const wantWood = r.w < r.g*0.72;
    const n=nearestNode(wantWood?'wood':'gold', v.x, v.y) || nearestNode(wantWood?'gold':'wood', v.x,v.y);
    if(n){ v.order={type:'gather'}; v.nodeId=n.id; v.carryType=n.type; v.moving=true; }
  }

  const researchPlan=aiTryResearch(side,castle,barracks,profile);
  const savingForAge=researchPlan==='save-age';

  if(!savingForAge && vills.length<profile.villagers && castle.queue.length<profile.queueDepth && canAfford(side,'villager',1)){
    applyCommand({type:'train', buildingId:castle.id, unit:'villager'}, side);
  }
  if(!savingForAge && r.pop >= r.cap-2 && r.cap<(r.age>=3?80:60) && canAfford(side,'house') && AI.t-AI.lastBuild>2.5){
    aiBuild(side, castle, 'house'); AI.lastBuild=AI.t;
  }
  if(!savingForAge && barracks.length===0 && r.w>=150 && vills.length>=5 && AI.t-AI.lastBuild>3){
    aiBuild(side, castle, 'barracks'); AI.lastBuild=AI.t;
  }
  if(!savingForAge && r.age>=2 && towers.length<profile.towers && barracks.length>0 && canAfford(side,'tower') && AI.t-AI.lastBuild>5){
    aiBuild(side, castle, 'tower'); AI.lastBuild=AI.t;
  }


  if(!savingForAge){
    const available=['swordsman'];
    if(r.age>=2) available.push('archer');
    if(r.age>=3) available.push('knight');
    for(const b of barracks){
      while(b.queue.length<profile.queueDepth){
        const unit=available[Math.floor(Math.random()*available.length)];
        if(!canAfford(side,unit,1)) break;
        applyCommand({type:'train', buildingId:b.id, unit}, side);
      }
    }
  }

  const threshold = profile.attackBase + Math.floor(G.time/profile.attackGrowth);
  const enemyCastle = G.ents.find(e=>e.side===mySide && e.kind==='castle');
  const ownedObjectives=objectiveCount(G,side);
  // AI_HOLD_SUPREMACY: no abandona los Bastiones mientras corre el contador.
  const holdingSupremacy=ownedObjectives>=2 && G.dominance[side]>0;
  const objectiveTarget=ownedObjectives<2?aiObjectiveTarget(side):null;
  const attackTarget=holdingSupremacy?null:(objectiveTarget || enemyCastle);
  const requiredArmy=objectiveTarget?Math.max(3,threshold-1):threshold;
  if(attackTarget && army.length>=requiredArmy){
    const free = army.filter(u=>!u.order || u.order.type==='move' || (u.order.type==='attackmove'&&!entById(u.targetId)));
    for(const u of free){ u.order={type:'attackmove', x:attackTarget.x, y:attackTarget.y}; u.tx=attackTarget.x; u.ty=attackTarget.y; u.moving=true; }
  }
}
function aiBuild(side, castle, kind){
  if(!canAfford(side,kind) || !canBuildKind(side,kind)) return;
  for(let i=0;i<30;i++){
    const a=Math.random()*Math.PI*2, rd=90+Math.random()*160;
    const x=castle.x+Math.cos(a)*rd, y=castle.y+Math.sin(a)*rd;
    if(validPlacement(x,y,DEFS[kind].r)){
      const v=G.ents.find(e=>e.side===side&&e.kind==='villager');
      if(!v) return;
      applyCommand({type:'build', kind, x, y, villagerIds:[v.id]}, side);
      return;
    }
  }
}

// ============================================================
//  RENDER + INPUT (solo navegador)
// ============================================================
const canvas = document.getElementById('game');
const ctx = canvas ? canvas.getContext('2d') : null;
let cam = {x:0, y:0};
let view = {w:0, h:0};
const sel = new Set();          // ids seleccionados (lado propio)
let buildKind = null;           // modo construcción
let drag = null;                // caja de selección
let mouse = {x:-1, y:-1, wx:0, wy:0, down:false, active:false};

// snapshot de cliente (interpolación)
let snapPrev=null, snapCur=null, snapPrevT=0, snapCurT=0;

function resize(){
  if(!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  view.w=canvas.width; view.h=canvas.height;
}
window.addEventListener('resize', resize);

function worldFromScreen(sx, sy){ return {x:sx+cam.x, y:sy+cam.y}; }

function centerCamOnBase(){
  const c = renderState().ents.find(e=>e.side===mySide && e.kind==='castle');
  if(c){ cam.x=clamp(c.x-view.w/2,0,MAP_W-view.w); cam.y=clamp(c.y-view.h/2,0,MAP_H-view.h); }
}

// estado a dibujar: en cliente, snapshot interpolado; si no, estado vivo
function renderState(){
  if(mode==='client' && snapCur) return interpSnap();
  return G;
}
function interpSnap(){
  if(!snapPrev) return snapCur;
  const span = Math.max(0.0001, snapCurT-snapPrevT);
  const a = clamp((performance.now()/1000 - snapCurT)/span, 0, 1);
  const map = new Map(snapPrev.ents.map(e=>[e.id,e]));
  const ents = snapCur.ents.map(e=>{
    const p=map.get(e.id);
    if(p && !e.building) return {...e, x:p.x+(e.x-p.x)*a, y:p.y+(e.y-p.y)*a};
    return e;
  });
  return {...snapCur, ents};
}

// ---------- Loop ----------
let lastT=0, simAcc=0, snapAcc=0;
function loop(ts){
  if(!running){ return; }
  const now=ts/1000;
  let dt = lastT? now-lastT : 0; lastT=now;
  if(dt>0.25) dt=0.25;

  if(mode!=='client'){
    simAcc+=dt;
    while(simAcc>=SIM_DT){ step(SIM_DT); simAcc-=SIM_DT; }
    if(mode==='host'){
      snapAcc+=dt;
      if(snapAcc>=SNAP_INT){ Net.sendSnap(serialize()); snapAcc=0; }
    }
  }

  edgeScroll(dt);
  render();
  updateHUD();
  requestAnimationFrame(loop);
}

function edgeScroll(dt){
  const sp=620*dt, m=24, a=mouse.active && !isMobile;
  if(keys['arrowleft']||keys['a']||(a&&mouse.x>=0&&mouse.x<m)) cam.x-=sp;
  if(keys['arrowright']||keys['d']||(a&&mouse.x>view.w-m)) cam.x+=sp;
  if(keys['arrowup']||keys['w']||(a&&mouse.y>=0&&mouse.y<m)) cam.y-=sp;
  if(keys['arrowdown']||keys['s']||(a&&mouse.y>view.h-m)) cam.y+=sp;
  cam.x=clamp(cam.x,0,Math.max(0,MAP_W-view.w));
  cam.y=clamp(cam.y,0,Math.max(0,MAP_H-view.h));
}

// ---------- Dibujo ----------
function render(){
  if(!ctx) return;
  const S=renderState(); if(!S) return;
  ctx.clearRect(0,0,view.w,view.h);

  // Actualiza fog de guerra
  if(fogEnabled) FOG.update(mySide,S);

  ctx.save();
  ctx.translate(-cam.x,-cam.y);

  // terreno (pasto + tierra)
  drawGround();

  // nodos (árboles / oro) — solo si visibles o explorados
  for(const n of S.nodes){
    if(n.x<cam.x-50||n.x>cam.x+view.w+50||n.y<cam.y-50||n.y>cam.y+view.h+50) continue;
    if(fogEnabled && FOG.at(n.x,n.y)===0) continue;
    if(n.type==='gold') drawGold(n); else drawTree(n);
  }

  // edificios y unidades — enemigos ocultos en fog no se ven
  const ents=S.ents.slice().sort((a,b)=>a.y-b.y);
  for(const e of ents){
    if(e.x<cam.x-60||e.x>cam.x+view.w+60||e.y<cam.y-60||e.y>cam.y+view.h+60) continue;
    if(fogEnabled && e.side!==mySide && FOG.at(e.x,e.y)<2) continue;
    drawEntity(e);
  }

  // proyectiles
  for(const p of (S.projectiles||[])){
    if(fogEnabled && FOG.at(p.x,p.y)<2) continue;
    ctx.fillStyle='rgba(0,0,0,0.35)'; circle(p.x+1,p.y+2,2.6);
    ctx.fillStyle='#ffe27a'; circle(p.x,p.y,2.6);
    ctx.fillStyle='#fff7d6'; circle(p.x-0.6,p.y-0.6,1.1);
  }

  // fantasma de construcción
  if(buildKind && mouse.wx!=null){
    const ok=canBuildKind(mySide,buildKind) && validPlacement(mouse.wx,mouse.wy,DEFS[buildKind].r) && canAfford(mySide,buildKind);
    ctx.globalAlpha=0.5;
    ctx.fillStyle= ok?COLOR[mySide].main:'#888';
    circle(mouse.wx,mouse.wy,DEFS[buildKind].r);
    ctx.globalAlpha=1;
    ctx.strokeStyle= ok?'#7CFC00':'#ff5555'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(mouse.wx,mouse.wy,DEFS[buildKind].r,0,Math.PI*2); ctx.stroke();
  }

  ctx.restore();

  // Partículas (en coordenadas pantalla)
  drawParticles(S);

  // Niebla de guerra encima del mapa
  if(fogEnabled) FOG.draw();

  // OBJECTIVES_AFTER_FOG: los Bastiones son conocimiento estratégico público.
  ctx.save(); ctx.translate(-cam.x,-cam.y);
  for(const objective of (S.objectives||[])) drawObjective(objective);
  ctx.restore();

  drawFlowFieldDebug();

  // caja de selección
  if(drag){
    const x=Math.min(drag.x0,mouse.x), y=Math.min(drag.y0,mouse.y);
    const w=Math.abs(mouse.x-drag.x0), h=Math.abs(mouse.y-drag.y0);
    ctx.strokeStyle='#7CFC00'; ctx.lineWidth=1.5;
    ctx.strokeRect(x,y,w,h);
    ctx.fillStyle='rgba(124,252,0,0.08)'; ctx.fillRect(x,y,w,h);
  }

  drawMinimap(S);

  // Ripples de long-press (móvil)
  if(isMobile) drawRipples();
}

// hash determinista 0..1 (estable al hacer scroll)
function h2(x,y){
  let n = (x|0)*374761393 + (y|0)*668265263;
  n = (n ^ (n>>13)) * 1274126177;
  return ((n ^ (n>>16)) >>> 0) / 4294967296;
}

function drawObjective(objective){
  const ownerColor=objective.owner?COLOR[objective.owner].main:'#d8c98d';
  const controlColor=objective.control>=0?COLOR.red.main:COLOR.blue.main;
  const capture=Math.abs(objective.control)/100;
  ctx.save();
  ctx.globalAlpha=.92;
  ctx.fillStyle='rgba(8,12,10,.72)'; circle(objective.x,objective.y,OBJECTIVE_RADIUS*.68);
  ctx.strokeStyle=ownerColor; ctx.lineWidth=4;
  ctx.beginPath(); ctx.arc(objective.x,objective.y,OBJECTIVE_RADIUS*.72,0,Math.PI*2); ctx.stroke();
  if(capture>0.01){
    ctx.strokeStyle=controlColor; ctx.lineWidth=7;
    ctx.beginPath(); ctx.arc(objective.x,objective.y,OBJECTIVE_RADIUS*.84,-Math.PI/2,-Math.PI/2+Math.PI*2*capture); ctx.stroke();
  }
  ctx.fillStyle=ownerColor;
  ctx.beginPath();
  ctx.moveTo(objective.x,objective.y-24); ctx.lineTo(objective.x+22,objective.y);
  ctx.lineTo(objective.x,objective.y+24); ctx.lineTo(objective.x-22,objective.y); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#07100b'; ctx.font='bold 18px VT323, monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(objective.owner?FACTIONS[objective.owner].short:'⚑',objective.x,objective.y+1);
  ctx.fillStyle='#ffe9a8'; ctx.font='15px VT323, monospace';
  ctx.fillText(objective.name,objective.x,objective.y+OBJECTIVE_RADIUS*.98);
  ctx.restore();
}

const GRASS = ['#3f5d2a','#446328','#3a5526','#4a6b2e','#41602b'];
function drawGround(){
  const T=64;
  const x0=Math.floor(cam.x/T)*T, y0=Math.floor(cam.y/T)*T;
  const x1=cam.x+view.w, y1=cam.y+view.h;
  for(let gx=x0; gx<x1; gx+=T){
    for(let gy=y0; gy<y1; gy+=T){
      const tx=gx/T, ty=gy/T;
      const r=h2(tx,ty);
      ctx.fillStyle=GRASS[(r*GRASS.length)|0];
      ctx.fillRect(gx,gy,T+1,T+1);
      // matas de pasto / piedritas deterministas
      const r2=h2(tx+99,ty-31);
      if(r2>0.62){
        const px=gx+ (h2(tx,ty+7)*T), py=gy+ (h2(tx+5,ty)*T);
        ctx.fillStyle = r2>0.9 ? 'rgba(120,120,110,0.45)' : 'rgba(30,52,20,0.55)';
        const s = r2>0.9 ? 2 : 3;
        ctx.fillRect(px, py, s, s);
        if(r2<0.9){ ctx.fillRect(px-2, py+1, s, s-1); ctx.fillRect(px+2, py+1, s, s-1); }
      }
    }
  }
  // Terreno especial (barro, agua, caminos) encima del pasto
  if(TERRAIN.tiles){
    const T=TERRAIN.TILE;
    const tx0=Math.floor(cam.x/T), ty0=Math.floor(cam.y/T);
    const tx1=Math.ceil((cam.x+view.w)/T), ty1=Math.ceil((cam.y+view.h)/T);
    for(let ty=ty0;ty<=ty1;ty++) for(let tx=tx0;tx<=tx1;tx++){
      if(tx<0||tx>=TERRAIN.COLS||ty<0||ty>=TERRAIN.ROWS) continue;
      const biome=TERRAIN.biomes[ty*TERRAIN.COLS+tx];
      if(biome===0) continue;
      const wx=tx*T, wy=ty*T;
      if(biome===1){ ctx.fillStyle='rgba(80,55,30,0.48)'; } // barro
      else if(biome===2){ ctx.fillStyle='rgba(30,80,140,0.55)'; } // agua
      else if(biome===3){ ctx.fillStyle='rgba(160,140,90,0.38)'; } // camino
      ctx.fillRect(wx,wy,T,T);
      // borde sutil
      ctx.strokeStyle='rgba(0,0,0,0.12)'; ctx.lineWidth=1;
      ctx.strokeRect(wx,wy,T,T);
    }
  }

  // viñeta de borde del mapa
  ctx.strokeStyle='rgba(0,0,0,0.5)'; ctx.lineWidth=10;
  ctx.strokeRect(0,0,MAP_W,MAP_H);
}

function drawTree(n){
  const seed=h2(n.id*1.7, n.id*0.3);
  const fr=n.r+7 + seed*3;                 // radio del follaje
  const depleted = n.amount < n.max*0.35;  // árbol talado a medias
  // sombra
  ctx.fillStyle='rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(n.x+3, n.y+fr*0.5, fr*0.8, fr*0.32, 0, 0, Math.PI*2); ctx.fill();
  // tronco
  ctx.fillStyle='#5a3b21'; ctx.fillRect(n.x-2, n.y-2, 4, fr*0.7);
  if(depleted){
    // tocón
    ctx.fillStyle='#6b4a2b'; circle(n.x, n.y+fr*0.5, 5);
    ctx.fillStyle='#8a6238'; circle(n.x, n.y+fr*0.5, 3);
    return;
  }
  // follaje (3 bolas superpuestas, verde oscuro + luz)
  ctx.fillStyle='#1f3d1a';
  circle(n.x-fr*0.4, n.y-fr*0.1, fr*0.62);
  circle(n.x+fr*0.4, n.y-fr*0.1, fr*0.62);
  circle(n.x, n.y-fr*0.55, fr*0.7);
  ctx.fillStyle='#2f5a26';
  circle(n.x, n.y-fr*0.4, fr*0.62);
  ctx.fillStyle='rgba(120,180,90,0.55)';
  circle(n.x-fr*0.25, n.y-fr*0.6, fr*0.28);
}

function drawGold(n){
  const t=n.amount/n.max;
  // sombra
  ctx.fillStyle='rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(n.x+2, n.y+n.r*0.6, n.r*1.0, n.r*0.4, 0, 0, Math.PI*2); ctx.fill();
  // roca (varias piedras gris)
  ctx.fillStyle='#6c6f74'; circle(n.x, n.y, n.r);
  ctx.fillStyle='#565a5f'; circle(n.x-n.r*0.5, n.y+n.r*0.2, n.r*0.55);
  ctx.fillStyle='#7c8086'; circle(n.x+n.r*0.4, n.y-n.r*0.3, n.r*0.5);
  // vetas de oro (más visibles si queda mucho)
  const nug = Math.max(2, Math.round(t*6));
  for(let i=0;i<nug;i++){
    const a=h2(n.id+i, n.id-i)*Math.PI*2, rd=h2(i, n.id)*n.r*0.7;
    ctx.fillStyle = i%2 ? '#ffd84a' : '#e8b62f';
    circle(n.x+Math.cos(a)*rd, n.y+Math.sin(a)*rd, 2.4);
  }
  ctx.fillStyle='rgba(255,247,200,0.8)'; circle(n.x-n.r*0.3, n.y-n.r*0.35, 1.6);
}

function circle(x,y,r){ ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); }

function drawEntity(e){
  const d=DEFS[e.kind];
  const selected = (e.side===mySide && sel.has(e.id));
  if(e.building) drawBuilding(e,d,selected);
  else drawUnit(e,d,selected);

  // barra de vida
  if(e.hp < e.maxHp){
    const hpw=d.r*2, top = e.y - (e.building? d.r*1.5 : d.r+16);
    ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(e.x-d.r-1, top-1, hpw+2, 5);
    const f=clamp(e.hp/e.maxHp,0,1);
    ctx.fillStyle = f>0.5?'#4ade80':f>0.25?'#facc15':'#ef4444';
    ctx.fillRect(e.x-d.r, top, hpw*f, 3);
  }
}

function drawBuilding(e,d,selected){
  const c=COLOR[e.side], x=e.x, y=e.y, r=d.r, built=e.constructed;
  // selección (huella)
  if(selected){
    ctx.strokeStyle='#7CFC00'; ctx.lineWidth=2;
    ctx.strokeRect(x-r-3, y-r-3, r*2+6, r*2+6);
  }
  // sombra
  ctx.fillStyle='rgba(0,0,0,0.32)';
  ctx.beginPath(); ctx.ellipse(x+r*0.25, y+r*0.7, r*1.05, r*0.5, 0,0,Math.PI*2); ctx.fill();

  ctx.globalAlpha = built?1:0.45;

  if(e.kind==='castle'){
    // muralla de piedra
    const w=r*1.9, h=r*1.7;
    rect(x-w/2, y-h*0.5, w, h, '#8c8e86', '#5c5e58');
    // almenas
    crenel(x-w/2, y-h*0.5, w, 8, '#8c8e86', '#5c5e58');
    // torres laterales
    for(const sx of [-1,1]){
      const tx=x+sx*w*0.5, tw=r*0.55;
      rect(tx-tw/2, y-h*0.62, tw, h*0.95, '#7e807a', '#56584f');
      crenel(tx-tw/2, y-h*0.62, tw, 6, '#7e807a', '#56584f');
      // techo cónico color de equipo
      tri(tx, y-h*0.62-12, tw*0.95, 14, c.main, c.dark);
    }
    // puerta
    ctx.fillStyle='#3a2a18'; ctx.fillRect(x-r*0.22, y+h*0.12, r*0.44, h*0.36);
    ctx.fillStyle='#241a0f'; ctx.fillRect(x-r*0.14, y+h*0.18, r*0.28, h*0.3);
    // bandera de equipo
    flag(x, y-h*0.55, c);
  } else if(e.kind==='barracks'){
    const w=r*1.8, h=r*1.3;
    rect(x-w/2, y-h*0.35, w, h, '#7a5733', '#4d3620');     // muros de madera
    // vigas
    ctx.strokeStyle='#5c3f24'; ctx.lineWidth=2;
    for(let i=1;i<3;i++){ ctx.beginPath(); ctx.moveTo(x-w/2, y-h*0.35+h*i/3); ctx.lineTo(x+w/2, y-h*0.35+h*i/3); ctx.stroke(); }
    // techo de equipo
    trap(x, y-h*0.35, w*1.12, h*0.55, c.main, c.dark);
    // emblema espadas cruzadas
    ctx.strokeStyle='#d8dde2'; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.moveTo(x-7,y+h*0.1); ctx.lineTo(x+7,y+h*0.3); ctx.moveTo(x+7,y+h*0.1); ctx.lineTo(x-7,y+h*0.3); ctx.stroke();
    // puerta
    ctx.fillStyle='#2e2010'; ctx.fillRect(x-r*0.18, y+h*0.18, r*0.36, h*0.28);
  } else if(e.kind==='house'){
    const w=r*1.6, h=r*1.25;
    rect(x-w/2, y-h*0.2, w, h, '#d7c19a', '#9c855f');      // muros claros
    trap(x, y-h*0.2, w*1.16, h*0.6, c.main, c.dark);        // techo equipo
    ctx.fillStyle='#3a2a18'; ctx.fillRect(x-r*0.16, y+h*0.3, r*0.32, h*0.5);  // puerta
    ctx.fillStyle='#a9c7d6'; ctx.fillRect(x+w*0.18, y+h*0.05, r*0.3, r*0.3);  // ventana
    ctx.strokeStyle='#6b5436'; ctx.lineWidth=1.5; ctx.strokeRect(x+w*0.18, y+h*0.05, r*0.3, r*0.3);
  } else if(e.kind==='tower'){
    const w=r*1.05, h=r*2.2;
    rect(x-w/2, y-h*0.55, w, h, '#86887f', '#56584f');
    crenel(x-w/2, y-h*0.55, w, 7, '#86887f', '#56584f');
    // ranura de tiro
    ctx.fillStyle='#23241f'; ctx.fillRect(x-2, y-h*0.1, 4, h*0.35);
    // banderín equipo
    flag(x, y-h*0.55, c, 0.8);
  }

  ctx.globalAlpha=1;

  if(!built){
    // andamio + barra de construcción
    ctx.strokeStyle='rgba(120,90,50,0.9)'; ctx.lineWidth=2;
    ctx.strokeRect(x-r, y-r, r*2, r*2);
    ctx.beginPath(); ctx.moveTo(x-r,y-r); ctx.lineTo(x+r,y+r); ctx.moveTo(x+r,y-r); ctx.lineTo(x-r,y+r); ctx.stroke();
    ctx.fillStyle='#000'; ctx.fillRect(x-r, y+r+4, r*2, 5);
    ctx.fillStyle='#7CFC00'; ctx.fillRect(x-r, y+r+4, r*2*e.bp, 5);
  }
}

function drawUnit(e,d,selected){
  const c=COLOR[e.side], x=e.x, y=e.y, r=d.r;
  const hero=!!d.hero;
  const dir = e.side==='red' ? 1 : -1;   // miran hacia el enemigo
  // sombra
  ctx.fillStyle='rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(x, y+r*0.85, r*0.85, r*0.38, 0,0,Math.PI*2); ctx.fill();
  // selección (anillo en el suelo)
  if(selected){
    ctx.strokeStyle='#7CFC00'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.ellipse(x, y+r*0.85, r+3, r*0.5, 0,0,Math.PI*2); ctx.stroke();
  }
  // aura de héroe
  if(hero){
    if(e.side==='red'){
      ctx.strokeStyle='rgba(255,80,60,0.18)'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(x,y,FACTIONS.red.kingAuraRange,0,Math.PI*2); ctx.stroke();
    }
    const glow=e.buffT>0?0.9:0.45;
    ctx.strokeStyle=`rgba(255,209,74,${glow})`; ctx.lineWidth=e.buffT>0?4:2.5;
    ctx.beginPath(); ctx.ellipse(x, y+r*0.85, r+5, r*0.6, 0,0,Math.PI*2); ctx.stroke();
    // capa dorada
    ctx.fillStyle='rgba(255,200,60,0.9)';
    ctx.beginPath(); ctx.moveTo(x-r*0.5,y-r*0.2); ctx.lineTo(x+r*0.5,y-r*0.2); ctx.lineTo(x+r*0.2,y+r*0.9); ctx.lineTo(x-r*0.2,y+r*0.9); ctx.closePath(); ctx.fill();
  }

  const isVill=e.kind==='villager';
  const bodyR = r*0.62;
  // arma / herramienta detrás del cuerpo según tipo
  if(e.kind==='archer'){
    ctx.strokeStyle='#caa15a'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(x+dir*r*0.7, y, r*0.7, -1.1, 1.1); ctx.stroke();
    ctx.strokeStyle='#eee'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(x+dir*r*0.7, y-r*0.6); ctx.lineTo(x+dir*r*0.7, y+r*0.6); ctx.stroke();
  } else if(e.kind==='swordsman' || (hero)){
    // espada
    ctx.strokeStyle='#dfe4ea'; ctx.lineWidth=hero?3:2;
    ctx.beginPath(); ctx.moveTo(x+dir*r*0.55, y+r*0.3); ctx.lineTo(x+dir*r*0.9, y-r*0.9); ctx.stroke();
    ctx.strokeStyle='#b9bec4'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(x+dir*r*0.4, y+r*0.05); ctx.lineTo(x+dir*r*0.75, y+r*0.05); ctx.stroke();
  } else if(e.kind==='knight'){
    // lanza
    ctx.strokeStyle='#8a6b3a'; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.moveTo(x+dir*r*0.6, y+r*0.7); ctx.lineTo(x+dir*r*0.6, y-r*1.1); ctx.stroke();
    ctx.fillStyle='#dfe4ea'; tri(x+dir*r*0.6, y-r*1.1, 5, 8, '#dfe4ea', '#aeb3b8');
  } else if(isVill){
    // herramienta (hacha/pico) — golpe animado al talar/minar
    const isChopping = e.order && e.order.type==='gather' && !e.moving;
    const chopAngle = isChopping ? Math.sin(performance.now()/90)*0.65 : 0;
    const tx=x+dir*r*0.5, ty=y-r*0.05;
    ctx.save(); ctx.translate(tx,ty); ctx.rotate(chopAngle);
    ctx.strokeStyle='#6b4a2b'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(0, r*0.55); ctx.lineTo(0, -r*0.65); ctx.stroke();
    ctx.fillStyle='#9aa0a6'; ctx.fillRect(-3, -r*0.75, 6, 4);
    ctx.restore();
  }

  // cuerpo (torso color de equipo)
  ctx.fillStyle = isVill ? mix(c.main,'#caa15a',0.45) : c.main;
  ctx.beginPath(); ctx.ellipse(x, y+r*0.15, bodyR*0.8, bodyR, 0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=hero?'#ffd14a':c.dark; ctx.lineWidth=hero?2.5:1.5; ctx.stroke();

  // escudo para espadachín
  if(e.kind==='swordsman'){
    ctx.fillStyle=c.light; ctx.beginPath(); ctx.ellipse(x-dir*r*0.55, y+r*0.2, r*0.28, r*0.4, 0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle=c.dark; ctx.lineWidth=1.2; ctx.stroke();
  }

  // cabeza
  ctx.fillStyle='#e8b98a';
  circle(x, y-r*0.55, r*0.42);
  // casco / gorro
  if(e.kind==='villager'){
    ctx.fillStyle='#7a5733'; ctx.beginPath(); ctx.arc(x, y-r*0.6, r*0.42, Math.PI, 0); ctx.fill();
  } else if(!hero){
    ctx.fillStyle='#b9bec4'; ctx.beginPath(); ctx.arc(x, y-r*0.62, r*0.42, Math.PI, 0); ctx.fill();
    if(e.kind==='knight'){ ctx.fillStyle=c.main; ctx.fillRect(x-2, y-r*1.15, 4, r*0.5); } // penacho
  }
  // corona del rey
  if(hero){
    ctx.fillStyle='#ffd14a'; ctx.font=`bold ${Math.round(r*0.9)}px monospace`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('♔', x, y-r*1.05);
  }

  // carga del aldeano (saco a la espalda)
  if(e.carry>0){
    ctx.fillStyle = e.carryType==='gold' ? '#ffd84a' : '#6aa84f';
    circle(x-dir*r*0.55, y-r*0.1, 4);
    ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.lineWidth=1; ctx.stroke();
  }
}

// ---- helpers de dibujo ----
function rect(x,y,w,h,fill,stroke){
  ctx.fillStyle=fill; ctx.fillRect(x,y,w,h);
  if(stroke){ ctx.strokeStyle=stroke; ctx.lineWidth=2; ctx.strokeRect(x,y,w,h); }
}
function crenel(x,y,w,ch,fill,stroke){ // almenas en el borde superior
  const n=Math.max(3, Math.floor(w/8)); const cw=w/(n*2-1);
  ctx.fillStyle=fill;
  for(let i=0;i<n;i++){ ctx.fillRect(x+i*2*cw, y-ch, cw, ch); }
  if(stroke){ ctx.strokeStyle=stroke; ctx.lineWidth=1; for(let i=0;i<n;i++){ ctx.strokeRect(x+i*2*cw, y-ch, cw, ch); } }
}
function tri(cx,topY,halfW,h,fill,stroke){
  ctx.fillStyle=fill; ctx.beginPath();
  ctx.moveTo(cx,topY); ctx.lineTo(cx-halfW,topY+h); ctx.lineTo(cx+halfW,topY+h); ctx.closePath(); ctx.fill();
  if(stroke){ ctx.strokeStyle=stroke; ctx.lineWidth=1.5; ctx.stroke(); }
}
function trap(cx,baseY,baseW,h,fill,stroke){ // techo trapezoidal
  ctx.fillStyle=fill; ctx.beginPath();
  ctx.moveTo(cx-baseW/2, baseY); ctx.lineTo(cx+baseW/2, baseY);
  ctx.lineTo(cx+baseW*0.28, baseY-h); ctx.lineTo(cx-baseW*0.28, baseY-h); ctx.closePath(); ctx.fill();
  if(stroke){ ctx.strokeStyle=stroke; ctx.lineWidth=1.5; ctx.stroke(); }
}
function flag(x,topY,c,scale=1){
  const wave=Math.sin(performance.now()/320)*4*scale;
  ctx.strokeStyle='#caa15a'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(x, topY); ctx.lineTo(x, topY-22*scale); ctx.stroke();
  ctx.fillStyle=c.main; ctx.beginPath();
  ctx.moveTo(x, topY-22*scale);
  ctx.quadraticCurveTo(x+10*scale+wave, topY-19*scale, x+16*scale+wave, topY-17*scale);
  ctx.quadraticCurveTo(x+10*scale+wave*0.5, topY-14*scale, x, topY-12*scale);
  ctx.closePath(); ctx.fill();
}
function mix(a,b,t){
  const pa=parseInt(a.slice(1),16), pb=parseInt(b.slice(1),16);
  const ar=(pa>>16)&255, ag=(pa>>8)&255, ab=pa&255;
  const br=(pb>>16)&255, bg=(pb>>8)&255, bb=pb&255;
  const r=Math.round(ar+(br-ar)*t), g=Math.round(ag+(bg-ag)*t), bl=Math.round(ab+(bb-ab)*t);
  return `rgb(${r},${g},${bl})`;
}

function drawMinimap(S){
  const mw=190, mh=mw*MAP_H/MAP_W, pad=14;
  const x0=pad, y0=view.h-mh-pad;
  ctx.fillStyle='rgba(5,12,9,0.85)'; ctx.fillRect(x0-4,y0-4,mw+8,mh+8);
  ctx.strokeStyle='#264'; ctx.strokeRect(x0-4,y0-4,mw+8,mh+8);
  const sx=mw/MAP_W, sy=mh/MAP_H;
  ctx.fillStyle='#3a5526'; ctx.fillRect(x0,y0,mw,mh);
  for(const n of S.nodes){ ctx.fillStyle=n.type==='gold'?'#caa12e':'#3f8a43'; ctx.fillRect(x0+n.x*sx-1,y0+n.y*sy-1,2,2); }
  for(const objective of (S.objectives||[])){ ctx.fillStyle=objective.owner?COLOR[objective.owner].main:'#ffe9a8'; ctx.fillRect(x0+objective.x*sx-2,y0+objective.y*sy-2,4,4); }
  for(const e of S.ents){ ctx.fillStyle=COLOR[e.side].main; const s=e.building?3:2; ctx.fillRect(x0+e.x*sx-s/2,y0+e.y*sy-s/2,s,s); }
  // viewport
  ctx.strokeStyle='#fff'; ctx.lineWidth=1;
  ctx.strokeRect(x0+cam.x*sx, y0+cam.y*sy, view.w*sx, view.h*sy);
  mini.box={x0,y0,mw,mh,sx,sy};
}
const mini={box:null};

// ---------- Debug Flow Field (tecla F) ----------
let showFlowField = false;
function drawFlowFieldDebug() {
  if (!showFlowField || !FF.cost || sel.size === 0) return;
  // Muestra el flow field del primer seleccionado con destino visible
  const S = renderState();
  const firstId = [...sel][0];
  const ent = entById2(S, firstId);
  if (!ent || ent.building || !ent.tx) return;
  const { flow } = FF.getFlow(ent.tx, ent.ty);
  const C = FF.COLS, CELL = FF.CELL;
  const DX = [-1,1,0,0,-1,1,-1,1];
  const DY = [0,0,-1,1,-1,-1,1,1];
  ctx.save(); ctx.translate(-cam.x, -cam.y);
  for (let cy = 0; cy < FF.ROWS; cy++) {
    for (let cx = 0; cx < C; cx++) {
      const wx = (cx + 0.5) * CELL, wy = (cy + 0.5) * CELL;
      if (wx < cam.x - CELL || wx > cam.x + view.w + CELL) continue;
      if (wy < cam.y - CELL || wy > cam.y + view.h + CELL) continue;
      const i = cy * C + cx;
      if (FF.cost[i] === 255) {
        ctx.fillStyle = 'rgba(255,50,50,0.18)';
        ctx.fillRect(cx * CELL, cy * CELL, CELL, CELL);
        continue;
      }
      const fdx = flow[i*2], fdy = flow[i*2+1];
      if (fdx === 0 && fdy === 0) continue;
      ctx.strokeStyle = 'rgba(120,255,180,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + fdx * CELL * 0.38, wy + fdy * CELL * 0.38);
      ctx.stroke();
      ctx.fillStyle = 'rgba(120,255,180,0.5)';
      ctx.beginPath(); ctx.arc(wx + fdx*CELL*0.38, wy + fdy*CELL*0.38, 2, 0, Math.PI*2); ctx.fill();
    }
  }
  ctx.restore();
}

// ---------- Input ----------
const keys={};

// ---------- Trampita del Rey León ----------
// Código secreto que SOLO ayuda a León. Modesto y con enfriamiento: mantiene el juego.
const CHEAT_CODE='vibra';
let cheatBuf='';
let cheatReadyAt=0;
function toast(msg){
  const t=document.createElement('div');
  t.textContent=msg;
  t.style.cssText='position:fixed;left:50%;top:15%;transform:translateX(-50%);z-index:9999;'
    +'background:rgba(8,16,12,0.92);border:2px solid #ffd14a;color:#ffe9a8;'
    +"font-family:'VT323',monospace;font-size:20px;padding:10px 16px;border-radius:6px;"
    +'box-shadow:0 0 18px rgba(255,209,74,0.45);pointer-events:none;transition:opacity .5s;letter-spacing:.5px;text-align:center;max-width:90vw;';
  document.body.appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; }, 2300);
  setTimeout(()=>{ t.remove(); }, 2900);
}
function tryCheat(){
  cheatBuf='';
  if(mode!=='sp' || mySide!=='red' || !G || !running || G.winner) return;
  const now=performance.now();
  if(now<cheatReadyAt){ toast(`⏳ Trampita en enfriamiento — ${Math.ceil((cheatReadyAt-now)/1000)}s`); return; }
  const king=G.ents.find(x=>x.side==='red'&&x.kind==='king'&&x.hp>0);
  if(!king){ toast('☠️ El Rey León cayó… nadie a quién envalentonar'); return; }
  king.hp=king.maxHp;
  king.atkMul=1.6; king.spdMul=1.35; king.buffT=8;
  G.res.red.g+=150; G.res.red.w+=150;
  cheatReadyAt=now+45000;
  SFX.play('cheat');
  toast('⚡ ¡RUGIDO DEL REY LEÓN!  +150🪙 +150🪵 · Rey curado y enfurecido (8s)');
}

window.addEventListener('keydown', e=>{
  // registrar código secreto (no en cajas de texto)
  const inField = e.target && (e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA');
  if(!inField && e.key && e.key.length===1){
    cheatBuf=(cheatBuf + e.key.toLowerCase()).slice(-12);
    if(cheatBuf.endsWith(CHEAT_CODE)) tryCheat();
  }
  keys[e.key.toLowerCase()]=true;
  if(e.key==='Escape'){ buildKind=null; }
  if(e.key.toLowerCase()==='f' && !inField){ showFlowField=!showFlowField; }
  if(e.key.toLowerCase()==='g' && !inField){ fogEnabled=!fogEnabled; toast(fogEnabled?'🌫️ Niebla de guerra ON':'☀️ Niebla de guerra OFF'); }
  // hotkeys de construcción con aldeano seleccionado
  if(selHasVillager()){
    if(e.key.toLowerCase()==='q') setBuild('house');
    if(e.key.toLowerCase()==='e') setBuild('barracks');
    if(e.key.toLowerCase()==='r') setBuild('tower');
  }
});
window.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()]=false; });
window.addEventListener('pointerdown', ()=>SFX.resume(), {once:false});

// ── Detecta móvil ────────────────────────────────────────────
const isMobile = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// ── Ripple visual para long-press ────────────────────────────
const ripples = [];
function showRipple(x, y){
  ripples.push({x, y, r:0, maxR:36, life:1});
}
function drawRipples(){
  for(const rp of ripples){
    rp.r += 2.2; rp.life -= 0.06;
    ctx.strokeStyle=`rgba(255,220,80,${rp.life.toFixed(2)})`;
    ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI*2); ctx.stroke();
  }
  ripples.splice(0, ripples.length, ...ripples.filter(r=>r.life>0));
}

// ── MOUSE (desktop) ──────────────────────────────────────────
if(canvas && !isMobile){
  canvas.addEventListener('mousemove', e=>{
    const r=canvas.getBoundingClientRect();
    mouse.active=true;
    mouse.x=e.clientX-r.left; mouse.y=e.clientY-r.top;
    const w=worldFromScreen(mouse.x,mouse.y); mouse.wx=w.x; mouse.wy=w.y;
  });
  canvas.addEventListener('mousedown', e=>{
    const r=canvas.getBoundingClientRect();
    mouse.x=e.clientX-r.left; mouse.y=e.clientY-r.top;
    if(mini.box && inMini(mouse.x,mouse.y)){ moveCamMini(mouse.x,mouse.y); return; }
    if(e.button===0){
      if(buildKind){ placeBuilding(); return; }
      drag={x0:mouse.x, y0:mouse.y};
    } else if(e.button===2){ rightClick(); }
  });
  canvas.addEventListener('mouseup', e=>{
    if(e.button===0 && drag){
      const moved=Math.abs(mouse.x-drag.x0)+Math.abs(mouse.y-drag.y0);
      if(moved<6) clickSelect(); else boxSelect();
      drag=null;
    }
  });
  canvas.addEventListener('contextmenu', e=>e.preventDefault());
}

// ── TOUCH (móvil) ────────────────────────────────────────────
// Esquema:
//   Tap rápido (<320ms, sin mover) →
//     · con unidades seleccionadas y tap en suelo/enemigo → rightClick (mover/atacar)
//     · en unidad propia → clickSelect
//     · en vacío sin selección → clickSelect (deseleccionar)
//   Long-press (≥380ms, sin mover) → rightClick siempre (mover/atacar/recolectar)
//   Arrastrar 1 dedo → pan de cámara
//   2 dedos → pan de cámara con ambos
if(canvas && isMobile){
  const LONG_MS  = 380;   // ms para long-press
  const MOVE_THR = 12;    // px de movimiento que cancela tap/long-press
  const TAP_R    = 22;    // radio de selección táctil (más grande que mouse)

  let T = {               // estado de toque principal
    active:false, id:-1,
    sx:0, sy:0,           // posición inicio
    lx:0, ly:0,           // posición actual
    t0:0,                 // timestamp inicio
    panning:false,
    timer:null,
  };
  let T2 = {active:false, id:-1, lx:0, ly:0}; // segundo dedo

  function setMouse(sx, sy){
    mouse.x=sx; mouse.y=sy; mouse.active=true;
    const w=worldFromScreen(sx,sy); mouse.wx=w.x; mouse.wy=w.y;
  }
  function cancelLong(){ clearTimeout(T.timer); T.timer=null; }

  canvas.addEventListener('touchstart', e=>{
    e.preventDefault(); SFX.resume();

    // Segundo dedo → pan 2 dedos
    if(e.touches.length===2){
      cancelLong();
      T.panning=true;
      const t2=e.touches[1];
      const r=canvas.getBoundingClientRect();
      T2.active=true; T2.id=t2.identifier;
      T2.lx=t2.clientX-r.left; T2.ly=t2.clientY-r.top;
      return;
    }

    const t=e.touches[0];
    const r=canvas.getBoundingClientRect();
    const sx=t.clientX-r.left, sy=t.clientY-r.top;

    T.active=true; T.id=t.identifier; T.panning=false;
    T.sx=T.lx=sx; T.sy=T.ly=sy; T.t0=Date.now();
    setMouse(sx,sy);

    // ¿minimapa?
    if(mini.box && inMini(sx,sy)){ moveCamMini(sx,sy); T.active=false; return; }

    // Long-press: dispara rightClick con ripple visual
    T.timer=setTimeout(()=>{
      if(!T.active||T.panning) return;
      showRipple(T.lx, T.ly);
      setMouse(T.lx, T.ly);
      rightClick();
      T.active=false;
    }, LONG_MS);

  },{passive:false});

  canvas.addEventListener('touchmove', e=>{
    e.preventDefault();

    // Pan con 2 dedos
    if(e.touches.length===2 && T2.active){
      const r=canvas.getBoundingClientRect();
      const t2=[...e.touches].find(t=>t.identifier===T2.id);
      if(t2){
        const nx=t2.clientX-r.left, ny=t2.clientY-r.top;
        // usa la media de los dos dedos para pan más suave
        const t1=[...e.touches].find(t=>t.identifier===T.id);
        if(t1){
          const nx1=t1.clientX-r.left, ny1=t1.clientY-r.top;
          const cx=(nx+nx1)/2, cy=(ny+ny1)/2;
          const px=(T2.lx+T.lx)/2, py=(T2.ly+T.ly)/2;
          cam.x=clamp(cam.x-(cx-px),0,Math.max(0,MAP_W-view.w));
          cam.y=clamp(cam.y-(cy-py),0,Math.max(0,MAP_H-view.h));
        }
        T2.lx=nx; T2.ly=ny;
      }
      return;
    }

    const t=[...e.touches].find(t=>t.identifier===T.id);
    if(!t||!T.active) return;
    const r=canvas.getBoundingClientRect();
    const nx=t.clientX-r.left, ny=t.clientY-r.top;
    const dx=nx-T.lx, dy=ny-T.ly;
    const moved=Math.abs(nx-T.sx)+Math.abs(ny-T.sy);

    if(moved>MOVE_THR){
      cancelLong();
      T.panning=true;
      cam.x=clamp(cam.x-dx,0,Math.max(0,MAP_W-view.w));
      cam.y=clamp(cam.y-dy,0,Math.max(0,MAP_H-view.h));
    }
    T.lx=nx; T.ly=ny;
    setMouse(nx,ny);
  },{passive:false});

  canvas.addEventListener('touchend', e=>{
    e.preventDefault(); cancelLong();
    T2.active=false;

    const elapsed=Date.now()-T.t0;
    const moved=Math.abs(T.lx-T.sx)+Math.abs(T.ly-T.sy);
    const wasTap=!T.panning && moved<MOVE_THR && elapsed<LONG_MS;
    T.active=false; T.panning=false;

    if(!wasTap) return;

    setMouse(T.lx, T.ly);

    // Modo construcción: tap = colocar edificio
    if(buildKind){ placeBuilding(); return; }

    // ¿Toca unidad propia?
    const S=renderState();
    let tappedOwn=false;
    for(const ent of S.ents){
      if(ent.side!==mySide) continue;
      if(dist2(mouse.wx,mouse.wy,ent.x,ent.y)<(DEFS[ent.kind].r+TAP_R)**2){ tappedOwn=true; break; }
    }

    if(tappedOwn){
      // Tap en unidad propia → seleccionar
      clickSelectTouch(TAP_R);
    } else if(sel.size>0){
      // Tap en suelo/enemigo con selección → mover/atacar
      rightClick();
    } else {
      // Tap en vacío sin selección → deseleccionar
      sel.clear(); refreshPanel();
    }
  },{passive:false});

  canvas.addEventListener('touchcancel', e=>{ cancelLong(); T.active=false; T2.active=false; },{passive:false});
}

// Versión táctil de clickSelect con radio más grande
function clickSelectTouch(extraR=16){
  const S=renderState(); sel.clear();
  let pick=null, bd=Infinity;
  for(const e of S.ents){
    if(e.side!==mySide) continue;
    const dd=dist2(mouse.wx,mouse.wy,e.x,e.y);
    if(dd<(DEFS[e.kind].r+extraR)**2 && dd<bd){ bd=dd; pick=e; }
  }
  if(pick) sel.add(pick.id);
  refreshPanel();
}

function inMini(x,y){ const b=mini.box; return b && x>=b.x0&&x<=b.x0+b.mw&&y>=b.y0&&y<=b.y0+b.mh; }
function moveCamMini(x,y){ const b=mini.box; cam.x=clamp((x-b.x0)/b.sx-view.w/2,0,Math.max(0,MAP_W-view.w)); cam.y=clamp((y-b.y0)/b.sy-view.h/2,0,Math.max(0,MAP_H-view.h)); }

function clickSelect(){
  const S=renderState(); sel.clear();
  let pick=null,bd=Infinity;
  for(const e of S.ents){
    if(e.side!==mySide) continue;
    const dd=dist2(mouse.wx,mouse.wy,e.x,e.y);
    if(dd< (DEFS[e.kind].r+6)**2 && dd<bd){ bd=dd; pick=e; }
  }
  if(pick) sel.add(pick.id);
  refreshPanel();
}
function boxSelect(){
  const S=renderState(); sel.clear();
  const x0=Math.min(drag.x0,mouse.x)+cam.x, y0=Math.min(drag.y0,mouse.y)+cam.y;
  const x1=Math.max(drag.x0,mouse.x)+cam.x, y1=Math.max(drag.y0,mouse.y)+cam.y;
  let any=false;
  for(const e of S.ents){
    if(e.side!==mySide||e.building) continue;
    if(e.x>=x0&&e.x<=x1&&e.y>=y0&&e.y<=y1){ sel.add(e.id); any=true; }
  }
  if(!any){ // si no agarró unidades, intenta un edificio
    for(const e of S.ents){ if(e.side!==mySide||!e.building) continue;
      if(e.x>=x0&&e.x<=x1&&e.y>=y0&&e.y<=y1){ sel.add(e.id); break; } }
  }
  refreshPanel();
}
function rightClick(){
  if(sel.size===0) return;
  const S=renderState();
  // objetivo enemigo?
  let tgt=null,bd=Infinity;
  for(const e of S.ents){
    if(e.side===mySide) continue;
    const dd=dist2(mouse.wx,mouse.wy,e.x,e.y);
    if(dd<(DEFS[e.kind].r+8)**2 && dd<bd){ bd=dd; tgt=e; }
  }
  // nodo de recurso?
  let node=null; bd=Infinity;
  for(const n of S.nodes){ const dd=dist2(mouse.wx,mouse.wy,n.x,n.y); if(dd<(n.r+8)**2&&dd<bd){bd=dd;node=n;} }

  const ids=[...sel];
  // si hay edificio de producción seleccionado y clic en mapa -> rally
  const onlyBuild = ids.length===1 && (()=>{const e=entById2(S,ids[0]); return e&&e.building;})();
  if(onlyBuild){ issue({type:'rally', buildingId:ids[0], x:mouse.wx, y:mouse.wy}); return; }

  const unitIds=ids.filter(id=>{const e=entById2(S,id); return e&&!e.building;});
  if(unitIds.length===0) return;

  if(tgt){ issue({type:'attack', ids:unitIds, targetId:tgt.id}); }
  else if(node && selHasVillager()){ const vIds=unitIds.filter(id=>{const e=entById2(S,id);return e&&e.kind==='villager';}); issue({type:'gather', ids:vIds, nodeId:node.id}); }
  else {
    // Formación: distribuye unidades en rejilla alrededor del destino
    if(unitIds.length > 1){
      const units = unitIds.map(id=>entById2(S,id)).filter(Boolean);
      const assigned = computeFormationPositions(units, mouse.wx, mouse.wy);
      for(const {unit, pos} of assigned){
        issue({type:'move', ids:[unit.id], x:pos.x, y:pos.y});
      }
    } else {
      issue({type:'move', ids:unitIds, x:mouse.wx, y:mouse.wy});
    }
  }
}
function entById2(S,id){ for(const e of S.ents) if(e.id===id) return e; return null; }

function selHasVillager(){
  const S=renderState();
  for(const id of sel){ const e=entById2(S,id); if(e&&e.kind==='villager') return true; }
  return false;
}

function setBuild(kind){
  const required=BUILDING_AGE[kind]||1;
  if(!canBuildKind(mySide,kind)){
    toast('🔒 Requiere '+AGE_DEFS[required].name);
    return;
  }
  buildKind=kind;
}
function placeBuilding(){
  if(!buildKind) return;
  const vIds=[...sel].filter(id=>{const e=entById2(renderState(),id); return e&&e.kind==='villager';});
  if(vIds.length===0){ buildKind=null; return; }
  issue({type:'build', kind:buildKind, x:mouse.wx, y:mouse.wy, villagerIds:vIds});
  if(!keys['shift']) buildKind=null;
}

// ---------- HUD / panel ----------
function updateHUD(){
  const S=renderState(); if(!S) return;
  const r=S.res[mySide];
  setText('gold', Math.floor(r.g));
  setText('wood', Math.floor(r.w));
  setText('pop', r.pop+'/'+r.cap);
  setText('factionInfo', FACTIONS[mySide].name);
  const owned=objectiveCount(S,mySide), enemyOwned=objectiveCount(S,enemySide);
  const dominance=Math.floor(S.dominance?.[mySide]||0);
  const remaining=Math.max(0,Math.ceil(DOMINANCE_SECONDS-dominance));
  setText('objectiveInfo', `BASTIONES ${owned}/3 · RIVAL ${enemyOwned}/3 · ${owned>=2?'SUPREMACÍA '+remaining+'s':'SUPREMACÍA INACTIVA'}`);
  const ageName=AGE_DEFS[r.age||1].name;
  const researchText=r.research?` · ⚙ ${RESEARCH[r.research.id].name} ${Math.max(0,Math.ceil(r.research.t))}s`:'';
  setText('ageInfo', ageName+researchText);
  const er=S.res[enemySide];
  setText('enemyInfo', `${COLOR[enemySide].name} · ${AGE_DEFS[er.age||1].name}  🪙${Math.floor(er.g)} 🪵${Math.floor(er.w)} 👥${er.pop}`);

  if(S.winner){ showEnd(S.winner); }
}
function setText(id,t){ const el=document.getElementById(id); if(el) el.textContent=t; }

function refreshPanel(){
  const panel=document.getElementById('cmds'); if(!panel) return;
  panel.innerHTML='';
  const S=renderState();
  const ids=[...sel];
  if(ids.length===0){ document.getElementById('selInfo').textContent='— sin selección —'; return; }

  // resumen
  const counts={};
  for(const id of ids){ const e=entById2(S,id); if(!e) continue; counts[e.kind]=(counts[e.kind]||0)+1; }
  document.getElementById('selInfo').textContent =
    Object.entries(counts).map(([k,v])=> k==='king' ? `👑 Rey ${COLOR[mySide].name} · ${FACTIONS[mySide].name}` : `${v}× ${DEFS[k].name}`).join('  ·  ');

  // un solo edificio de producción
  if(ids.length===1){
    const e=entById2(S,ids[0]);
    if(e && e.building && e.constructed){
      if(e.kind==='castle'){
        addTrainBtn(panel,e,'villager','Aldeano','H');
        addResearchBtn(panel,e,'wheelbarrow');
        addResearchBtn(panel,e,'masonry');
        addResearchBtn(panel,e,'age2');
        addResearchBtn(panel,e,'age3');
      }
      if(e.kind==='barracks'){
        addTrainBtn(panel,e,'swordsman','Espadachín','A');
        addTrainBtn(panel,e,'archer','Arquero','S');
        addTrainBtn(panel,e,'knight','Caballero','D');
        addResearchBtn(panel,e,'forgedBlades');
        addResearchBtn(panel,e,'fletching');
        addResearchBtn(panel,e,'cavalry');
      }
      if(e.queue && e.queue.length) addCancelBtn(panel,e);
      return;
    }
  }
  // aldeanos -> construir
  if(selHasVillager()){
    addBuildBtn(panel,'house','Casa (Q)','+5 pop · 🪵30');
    addBuildBtn(panel,'barracks','Cuartel (E)','militares · 🪵150');
    addBuildBtn(panel,'tower','Torre (R)','defensa · 🪙50 🪵50');
  }
}
function btn(label, sub){
  const b=document.createElement('button'); b.className='cmd';
  b.innerHTML=`<span>${label}</span>${sub?`<small>${sub}</small>`:''}`;
  return b;
}
function addTrainBtn(panel,e,unit,label,hk){
  const c=COST[unit], S=renderState(), r=S.res[mySide], required=UNIT_AGE[unit]||1;
  const locked=(r.age||1)<required;
  const b=btn(locked?`🔒 ${label}`:label, locked?`requiere ${AGE_DEFS[required].name}`:`🪙${c.g} ${c.w?'🪵'+c.w:''}`);
  b.disabled=locked;
  b.onclick=()=>issue({type:'train', buildingId:e.id, unit});
  panel.appendChild(b);
}
function addResearchBtn(panel,e,id){
  const def=RESEARCH[id], S=renderState(), r=S.res[mySide];
  if(!def || def.from!==e.kind) return;
  if(def.toAge && r.age!==def.age) return;
  if(!def.toAge && (r.age<def.age || r.techs?.[id])) return;
  const active=r.research;
  const researching=active && active.id===id;
  const busy=!!active;
  const affordable=r.g>=def.g && r.w>=def.w;
  const label=researching?`⚙ ${def.name}`:def.name;
  const sub=researching?`${Math.max(0,Math.ceil(active.t))}s`:`🪙${def.g} 🪵${def.w} · ${def.t}s${def.note?' · '+def.note:''}`;
  const b=btn(label,sub);
  b.classList.add('research');
  b.disabled=busy||!affordable;
  b.onclick=()=>issue({type:'research', buildingId:e.id, researchId:id});
  panel.appendChild(b);
}
function addCancelBtn(panel,e){
  const b=btn('Cancelar','cola '+e.queue.length);
  b.classList.add('danger');
  b.onclick=()=>issue({type:'cancelTrain', buildingId:e.id});
  panel.appendChild(b);
}
function addBuildBtn(panel,kind,label,sub){
  const required=BUILDING_AGE[kind]||1;
  const locked=!canBuildKind(mySide,kind);
  const b=btn(locked?'🔒 '+label:label,locked?'requiere '+AGE_DEFS[required].name:sub);
  b.disabled=locked;
  b.onclick=()=>setBuild(kind);
  panel.appendChild(b);
}

// panel se refresca seguido para reflejar colas
setInterval(()=>{ if(running) refreshPanel(); }, 500);

// ---------- Serialización (host -> cliente) ----------
function serialize(){
  return {
    tick:G.tick, time:Math.round(G.time), winner:G.winner,
    res:{ red:{...G.res.red}, blue:{...G.res.blue} },
    nodes: G.nodes.map(n=>({id:n.id,type:n.type,x:Math.round(n.x),y:Math.round(n.y),amount:Math.round(n.amount),r:n.r})),
    objectives: G.objectives.map((objective)=>({...objective, control:Math.round(objective.control)})),
    dominance:{...G.dominance}, victoryReason:G.victoryReason,
    ents: G.ents.map(e=>({
      id:e.id, side:e.side, kind:e.kind,
      x:Math.round(e.x), y:Math.round(e.y),
      hp:Math.round(e.hp), maxHp:e.maxHp,
      building:e.building, constructed:e.constructed, bp:e.bp,
      carry:e.carry>0?1:0, carryType:e.carryType,
      queue:e.building?e.queue.map(q=>({unit:q.unit,t:Math.round(q.t)})):undefined,
      rallyX:e.rallyX, rallyY:e.rallyY,
    })),
    projectiles: G.projectiles.map(p=>({x:Math.round(p.x),y:Math.round(p.y)})),
  };
}
function onSnapshot(s){
  snapPrev=snapCur; snapPrevT=snapCurT;
  snapCur=s; snapCurT=performance.now()/1000;
  if(s.winner) showEnd(s.winner);
}

// ---------- Arranque / menús ----------
function startGame(opts){
  mode=opts.mode; mySide=opts.side; enemySide = mySide==='red'?'blue':'red';
  aiDifficulty=AI_PROFILES[opts.difficulty]?opts.difficulty:'warrior';
  SFX.init(); SFX.resume();
  resize();
  if(mode==='client'){
    // el cliente no simula; espera snapshots
    G=null;
    TERRAIN.init(); FOG.init();
    Net.onSnap=onSnapshot;
  } else {
    initMap();
    if(mode==='host'){ Net.onCmd=(cmd)=>applyCommand(cmd,enemySide); }
  }
  document.getElementById('menu').style.display='none';
  document.getElementById('hud').style.display='block';
  document.getElementById('panel').style.display='flex';
  setText('p1name', COLOR[mySide].name);
  // Badge de sala solo en multijugador
  if(mode!=='sp' && _currentRoomCode){
    updateRoomBadge(_currentRoomCode, mode==='host'?'⏳ esperando…':'⏳ conectando…');
  }
  // espera a tener algo que centrar
  const c=setInterval(()=>{ if(renderState()&&renderState().ents&&renderState().ents.length){ centerCamOnBase(); clearInterval(c);} },100);
  running=true; lastT=0; simAcc=0; snapAcc=0;
  requestAnimationFrame(loop);
}

function updateRoomBadge(code, status){
  const badge = document.getElementById('roomBadge');
  if(!badge) return;
  badge.style.display = 'flex';
  setText('roomBadgeCode', code);
  setText('roomBadgeStatus', status);
}

function showEnd(winner){
  if(document.getElementById('endScreen').style.display==='flex') return;
  running=false;
  const won = winner===mySide;
  SFX.play(won?'victory':'defeat');
  document.getElementById('endTitle').textContent = won?'¡VICTORIA!':'DERROTA';
  document.getElementById('endTitle').style.color = won?'#7CFC00':'#ff5555';
  const state=renderState();
  const reason=state?.victoryReason || 'castle';
  document.getElementById('endSub').textContent = reason==='supremacy'
    ? (won?`La ${FACTIONS[mySide].name} sostuvo dos Bastiones y proclamó supremacía.`:`${COLOR[winner].name} dominó los Bastiones antes de que pudieras recuperarlos.`)
    : (won?`El reino de ${COLOR[mySide].name} derribó el castillo enemigo.`:`El reino de ${COLOR[winner].name} arrasó tu castillo.`);
  document.getElementById('endScreen').style.display='flex';
}

// Exponer a la UI (index.html)
let _currentRoomCode = '';
let _inviteUrl = '';

window.REINOS = {
  startSolo(side,difficulty='warrior'){ startGame({mode:'sp', side, difficulty}); },

  getMatchMeta(){
    const S=renderState();
    return {
      mode, side:mySide, difficulty:mode==='sp'?aiDifficulty:'human', age:S?.res?.[mySide]?.age||1,
      faction:FACTIONS[mySide].name, victoryReason:S?.victoryReason||'castle',
      objectives:objectiveCount(S,mySide), dominance:Math.floor(S?.dominance?.[mySide]||0),
    };
  },

  hostGame(){
    const code = Net.makeCode();
    _currentRoomCode = code;
    _inviteUrl = location.origin + location.pathname + '?sala=' + code;
    history.replaceState(null, '', '?sala=' + code);

    Net.onStatus = (t) => {
      setText('overlayStatus', t);
      updateRoomBadge(code, t);
    };
    Net.onPeer = () => {
      setText('overlayStatus', '✅ ¡Nelson conectado!');
      updateRoomBadge(code, '✅ Nelson online');
      SFX.play('train');
    };
    Net.host(code);
    startGame({mode:'host', side:'red'});

    // Populate and show overlay (outside menu, on top of canvas)
    setText('overlayCode', code);
    setText('overlayLink', _inviteUrl);
    const ov = document.getElementById('inviteOverlay');
    const shareBtn = document.getElementById('overlayShareBtn');
    const copyBtn  = document.getElementById('overlayCopyBtn');
    if(shareBtn) shareBtn.style.display = navigator.share ? 'flex' : 'none';
    if(copyBtn)  copyBtn.style.display  = navigator.share ? 'none' : 'flex';
    if(ov) ov.style.display = 'flex';
  },

  joinGame(code){
    if(!code) return;
    code = code.trim().toUpperCase();
    _currentRoomCode = code;
    Net.onStatus = (t) => {
      setText('netStatus2', t);
      updateRoomBadge(code, t);
    };
    Net.onPeer = () => {
      setText('netStatus2', '✅ ¡Conectado con León!');
      updateRoomBadge(code, '✅ León online');
    };
    Net.join(code);
    startGame({mode:'client', side:'blue'});
  },

  copyLink(){
    navigator.clipboard.writeText(_inviteUrl).then(()=>{
      const btn = document.getElementById('btnCopy');
      btn.innerHTML = '✅ COPIADO<small>pégalo en WhatsApp</small>';
      setTimeout(()=>{ btn.innerHTML='📋 COPIAR LINK<small>envíaselo al primo</small>'; }, 2500);
    }).catch(()=>{
      // fallback
      prompt('Copia este link:', _inviteUrl);
    });
  },

  shareLink(){
    if(navigator.share){
      navigator.share({ title:'REINOS — te invito a jugar', url: _inviteUrl });
    }
  },

  closeInvite(){
    const ov = document.getElementById('inviteOverlay');
    if(ov) ov.style.display = 'none';
  },

  goHome(){
    history.replaceState(null, '', location.pathname);
    location.reload();
  },

  restart(){
    history.replaceState(null, '', location.pathname);
    location.reload();
  },
};

// init
resize();
})();
