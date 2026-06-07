/* ============================================================
   REINOS — Nelson vs León
   Motor RTS original (inspirado en el género, sin assets de terceros).
   Un solo archivo: simulación + IA + render + input.
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

function freshState() {
  return {
    tick: 0, time: 0, nextId: 1, winner: null,
    res: {
      red:  {g:200, w:200, pop:0, cap:10},
      blue: {g:200, w:200, pop:0, cap:10},
    },
    ents: [], nodes: [], projectiles: [],
  };
}

function nid() { return G.nextId++; }

function spawn(side, kind, x, y, constructed=true) {
  const d = DEFS[kind];
  const e = {
    id: nid(), side, kind, x, y,
    hp: constructed ? d.hp : Math.max(1, Math.round(d.hp*0.08)),
    maxHp: d.hp,
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
    G.res[side].cap = Math.min(60, cap);
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
  const r=G.res[side], c=COST[key];
  if(!c) return false;
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
      if(!c||c.from!==b.kind) break;
      if(b.queue.length>=8) break;
      if(!canAfford(side,cmd.unit,1)) break;
      pay(side,cmd.unit);
      b.queue.push({unit:cmd.unit, t:c.t});
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
  if(x<r||y<r||x>MAP_W-r||y>MAP_H-r) return false;
  for(const e of G.ents){ if(e.building && dist(x,y,e.x,e.y) < r+DEFS[e.kind].r+6) return false; }
  for(const n of G.nodes){ if(dist(x,y,n.x,n.y) < r+n.r+6) return false; }
  return true;
}

// issue desde input local: en cliente se envía por red, si no se aplica directo
function issue(cmd){
  if(mode==='client'){ Net.sendCmd(cmd); }
  else { applyCommand(cmd, mySide); }
}

// ---------- Simulación ----------
function step(dt){
  if(G.winner) return;
  G.time += dt; G.tick++;

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
        }
      }
      // torres y castillo disparan
      const d=DEFS[e.kind];
      if(d.range){
        e.cd-=dt;
        let tgt=entById(e.targetId);
        if(!tgt||tgt.hp<=0||dist(e.x,e.y,tgt.x,tgt.y)>d.range){ tgt=nearestEnemy(e.side,e.x,e.y,d.range); e.targetId=tgt?tgt.id:0; }
        if(tgt&&e.cd<=0){ shoot(e,tgt,d.atk,true); e.cd=d.cd; }
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

  if(castleDead){ G.winner = (castleDead==='red')?'blue':'red'; }

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
      const enemy=nearestEnemy(e.side,e.x,e.y, o&&o.type==='attackmove'?d.sight:d.sight*0.7);
      if(enemy) e.targetId=enemy.id;
    }
  }

  // ---- Ataque (objetivo explícito o adquirido) ----
  let tgt=entById(e.targetId);
  if(tgt && tgt.hp>0 && (o&&(o.type==='attack'||o.type==='attackmove') || e.kind!=='villager')){
    const dd=dist(e.x,e.y,tgt.x,tgt.y);
    const reach=d.range+DEFS[tgt.kind].r;
    if(dd<=reach){
      e.moving=false;
      if(e.cd<=0){
        const atk=d.atk*(e.atkMul||1);
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
    if(e.carry>=d.carry){
      // volver a dejar
      const drop=nearestDrop(e.side,e.x,e.y);
      if(!drop){ e.moving=false; return; }
      if(dist(e.x,e.y,drop.x,drop.y) <= DEFS.castle.r+14){
        G.res[e.side][e.carryType==='gold'?'g':'w'] += e.carry;
        e.carry=0; e.carryType=null;
      } else moveToward(e, drop.x, drop.y, dt);
      return;
    }
    let n=nodeById(e.nodeId);
    if(!n||n.amount<=0){ n=nearestNode(e.carryType||'gold', e.x,e.y); if(n) e.nodeId=n.id; }
    if(!n){ e.moving=false; e.order=null; return; }
    if(dist(e.x,e.y,n.x,n.y) <= n.r+14){
      e.moving=false;
      const amt=Math.min(d.gather*dt, n.amount, d.carry-e.carry);
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
      if(f.bp>=1){ f.bp=1; f.constructed=true; f.hp=f.maxHp; e.order=null; recalcPop(); }
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
  const d=DEFS[e.kind];
  const dx=tx-e.x, dy=ty-e.y, dd=Math.hypot(dx,dy);
  if(dd<1){ e.moving=false; return; }
  const sp=d.speed*(e.spdMul||1)*dt;
  e.x += dx/dd*Math.min(sp,dd);
  e.y += dy/dd*Math.min(sp,dd);
  e.x=clamp(e.x,8,MAP_W-8); e.y=clamp(e.y,8,MAP_H-8);
  e.moving=true;
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
  // contraataque: villager o militar reacciona
  if(t.hp>0 && !t.building && !entById(t.targetId)){
    const a=nearestEnemy(t.side,t.x,t.y, DEFS[t.kind].sight);
    if(a && t.kind!=='villager') t.targetId=a.id;
  }
}

function separate(){
  const arr=G.ents;
  for(let i=0;i<arr.length;i++){
    const a=arr[i]; if(a.building) continue;
    for(let j=i+1;j<arr.length;j++){
      const b=arr[j]; if(b.building) continue;
      const dx=b.x-a.x, dy=b.y-a.y; let dd=Math.hypot(dx,dy);
      const min=DEFS[a.kind].r+DEFS[b.kind].r;
      if(dd>0.001 && dd<min){
        const push=(min-dd)/2;
        const ux=dx/dd, uy=dy/dd;
        a.x-=ux*push; a.y-=uy*push;
        b.x+=ux*push; b.y+=uy*push;
      }
    }
    // empuje fuera de edificios
    for(const e of arr){
      if(!e.building||!e.constructed) continue;
      const dx=a.x-e.x, dy=a.y-e.y; let dd=Math.hypot(dx,dy);
      const min=DEFS[a.kind].r+DEFS[e.kind].r;
      if(dd>0.001 && dd<min){ const p=(min-dd); a.x+=dx/dd*p; a.y+=dy/dd*p; }
    }
    a.x=clamp(a.x,8,MAP_W-8); a.y=clamp(a.y,8,MAP_H-8);
  }
}

// ---------- IA (enemigo en single player) ----------
const AI = { t:0, attackAt:60, lastBuild:0 };
function aiStep(dt){
  AI.t += dt;
  const side=enemySide, r=G.res[side];
  // cada ~1s toma decisiones
  if(G.tick % 20 !== 0) return;

  const mine = G.ents.filter(e=>e.side===side);
  const castle = mine.find(e=>e.kind==='castle'&&e.constructed);
  if(!castle) return;
  const vills = mine.filter(e=>e.kind==='villager');
  const army  = mine.filter(e=>!e.building && e.kind!=='villager');
  const barracks = mine.filter(e=>e.kind==='barracks'&&e.constructed);
  const houses = mine.filter(e=>e.kind==='house');
  const towers = mine.filter(e=>e.kind==='tower');

  // 1) aldeanos ociosos -> recolectar (balance oro/madera)
  const idleV = vills.filter(v=>!v.order || (v.order.type==='move'&&!v.moving));
  for(const v of idleV){
    const wantWood = r.w < r.g*0.7;
    const n=nearestNode(wantWood?'wood':'gold', v.x, v.y) || nearestNode(wantWood?'gold':'wood', v.x,v.y);
    if(n){ v.order={type:'gather'}; v.nodeId=n.id; v.carryType=n.type; v.moving=true; }
  }

  // 2) entrenar aldeanos hasta 10
  if(vills.length<10 && castle.queue.length===0 && canAfford(side,'villager',1)){
    applyCommand({type:'train', buildingId:castle.id, unit:'villager'}, side);
  }

  // 3) casa si pop cerca del tope
  if(r.pop >= r.cap-2 && r.cap<60 && canAfford(side,'house') && AI.t-AI.lastBuild>3){
    aiBuild(side, castle, 'house'); AI.lastBuild=AI.t;
  }
  // 4) cuartel
  if(barracks.length===0 && r.w>=150 && vills.length>=5 && AI.t-AI.lastBuild>3){
    aiBuild(side, castle, 'barracks'); AI.lastBuild=AI.t;
  }
  // 5) torres defensivas (hasta 2)
  if(towers.length<2 && barracks.length>0 && canAfford(side,'tower') && AI.t-AI.lastBuild>6){
    aiBuild(side, castle, 'tower'); AI.lastBuild=AI.t;
  }
  // 6) entrenar ejército
  for(const b of barracks){
    if(b.queue.length<2){
      const roll=Math.random();
      const unit = roll<0.45?'swordsman' : roll<0.8?'archer' : 'knight';
      if(canAfford(side,unit,1)) applyCommand({type:'train', buildingId:b.id, unit}, side);
    }
  }
  // 7) atacar cuando hay ejército suficiente (umbral crece con el tiempo)
  const threshold = 4 + Math.floor(G.time/90);
  const enemyCastle = G.ents.find(e=>e.side===mySide && e.kind==='castle');
  if(enemyCastle && army.length>=threshold){
    const free = army.filter(u=>!u.order || u.order.type==='move' || (u.order.type==='attackmove'&&!entById(u.targetId)));
    for(const u of free){ u.order={type:'attackmove', x:enemyCastle.x, y:enemyCastle.y}; u.tx=enemyCastle.x; u.ty=enemyCastle.y; u.moving=true; }
  }
}
function aiBuild(side, castle, kind){
  if(!canAfford(side,kind)) return;
  for(let i=0;i<30;i++){
    const a=Math.random()*Math.PI*2, rd=90+Math.random()*160;
    const x=castle.x+Math.cos(a)*rd, y=castle.y+Math.sin(a)*rd;
    if(validPlacement(x,y,DEFS[kind].r)){
      // toma un aldeano libre
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
  const sp=620*dt, m=24, a=mouse.active;
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

  // fondo (tierra) + grilla
  ctx.fillStyle='#0c1410';
  ctx.fillRect(0,0,view.w,view.h);
  drawGrid();

  ctx.save();
  ctx.translate(-cam.x,-cam.y);

  // nodos
  for(const n of S.nodes){
    if(n.x<cam.x-40||n.x>cam.x+view.w+40||n.y<cam.y-40||n.y>cam.y+view.h+40) continue;
    if(n.type==='gold'){
      ctx.fillStyle='#caa12e'; circle(n.x,n.y,n.r);
      ctx.fillStyle='#fff2b0'; circle(n.x-4,n.y-4,4);
    } else {
      ctx.fillStyle='#2f6b32'; circle(n.x,n.y,n.r+3);
      ctx.fillStyle='#3f8a43'; circle(n.x,n.y,n.r);
      ctx.fillStyle='#6b4427'; ctx.fillRect(n.x-2,n.y,4,8);
    }
  }

  // edificios y unidades
  const ents=S.ents.slice().sort((a,b)=>a.y-b.y);
  for(const e of ents){
    if(e.x<cam.x-60||e.x>cam.x+view.w+60||e.y<cam.y-60||e.y>cam.y+view.h+60) continue;
    drawEntity(e);
  }

  // proyectiles
  ctx.fillStyle='#ffe27a';
  for(const p of (S.projectiles||[])){ circle(p.x,p.y,3); }

  // fantasma de construcción
  if(buildKind && mouse.wx!=null){
    const ok=validPlacement(mouse.wx,mouse.wy,DEFS[buildKind].r) && canAfford(mySide,buildKind);
    ctx.globalAlpha=0.5;
    ctx.fillStyle= ok?COLOR[mySide].main:'#888';
    circle(mouse.wx,mouse.wy,DEFS[buildKind].r);
    ctx.globalAlpha=1;
    ctx.strokeStyle= ok?'#7CFC00':'#ff5555'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(mouse.wx,mouse.wy,DEFS[buildKind].r,0,Math.PI*2); ctx.stroke();
  }

  ctx.restore();

  // caja de selección
  if(drag){
    const x=Math.min(drag.x0,mouse.x), y=Math.min(drag.y0,mouse.y);
    const w=Math.abs(mouse.x-drag.x0), h=Math.abs(mouse.y-drag.y0);
    ctx.strokeStyle='#7CFC00'; ctx.lineWidth=1.5;
    ctx.strokeRect(x,y,w,h);
    ctx.fillStyle='rgba(124,252,0,0.08)'; ctx.fillRect(x,y,w,h);
  }

  drawMinimap(S);
}

function drawGrid(){
  ctx.strokeStyle='rgba(40,70,55,0.35)'; ctx.lineWidth=1;
  const step=80;
  const ox=-(cam.x%step), oy=-(cam.y%step);
  ctx.beginPath();
  for(let x=ox;x<view.w;x+=step){ ctx.moveTo(x,0); ctx.lineTo(x,view.h); }
  for(let y=oy;y<view.h;y+=step){ ctx.moveTo(0,y); ctx.lineTo(view.w,y); }
  ctx.stroke();
}

function circle(x,y,r){ ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); }

function drawEntity(e){
  const c=COLOR[e.side], d=DEFS[e.kind];
  const selected = (e.side===mySide && sel.has(e.id));

  if(selected){
    ctx.strokeStyle='#7CFC00'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(e.x,e.y, d.r+5, 0, Math.PI*2); ctx.stroke();
  }

  if(e.building){
    const built=e.constructed;
    ctx.globalAlpha = built?1:0.55;
    // base
    ctx.fillStyle=c.dark; ctx.fillRect(e.x-d.r, e.y-d.r, d.r*2, d.r*2);
    ctx.fillStyle=c.main; ctx.fillRect(e.x-d.r+3, e.y-d.r+3, d.r*2-6, d.r*2-6);
    // icono
    ctx.fillStyle=c.light; ctx.font=`${Math.round(d.r)}px monospace`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    const ic = e.kind==='castle'?'♜':e.kind==='barracks'?'⚔':e.kind==='tower'?'♟':'⌂';
    ctx.fillText(ic, e.x, e.y+1);
    ctx.globalAlpha=1;
    if(!built){
      // barra de construcción
      ctx.fillStyle='#000'; ctx.fillRect(e.x-d.r, e.y+d.r+4, d.r*2, 4);
      ctx.fillStyle='#7CFC00'; ctx.fillRect(e.x-d.r, e.y+d.r+4, d.r*2*e.bp, 4);
    }
  } else {
    const hero=!!DEFS[e.kind].hero;
    // sombra
    ctx.fillStyle='rgba(0,0,0,0.25)'; ctx.beginPath();
    ctx.ellipse(e.x,e.y+d.r*0.7,d.r*0.9,d.r*0.4,0,0,Math.PI*2); ctx.fill();
    // aura del héroe (dorada; parpadea si tiene buff de la trampita)
    if(hero){
      const glow = e.buffT>0 ? 0.85 : 0.45;
      ctx.strokeStyle=`rgba(255,209,74,${glow})`; ctx.lineWidth= e.buffT>0?4:3;
      ctx.beginPath(); ctx.arc(e.x,e.y,d.r+4,0,Math.PI*2); ctx.stroke();
    }
    // cuerpo
    ctx.fillStyle=c.main; circle(e.x,e.y,d.r);
    ctx.strokeStyle=hero?'#ffd14a':c.dark; ctx.lineWidth=hero?3:2;
    ctx.beginPath(); ctx.arc(e.x,e.y,d.r,0,Math.PI*2); ctx.stroke();
    // marca por tipo
    ctx.fillStyle=hero?'#ffd14a':c.light; ctx.font=`bold ${d.r}px monospace`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    const mk = hero?'♔':e.kind==='villager'?'v':e.kind==='swordsman'?'S':e.kind==='archer'?'A':'K';
    ctx.fillText(mk, e.x, e.y+0.5);
    if(e.carry>0){ ctx.fillStyle=e.carryType==='gold'?'#ffd84a':'#5fd06a'; circle(e.x+d.r*0.7, e.y-d.r*0.7, 3); }
  }

  // barra de vida
  const hpw=d.r*2;
  if(e.hp < e.maxHp){
    ctx.fillStyle='#000'; ctx.fillRect(e.x-d.r, e.y-d.r-8, hpw, 4);
    const f=clamp(e.hp/e.maxHp,0,1);
    ctx.fillStyle = f>0.5?'#4ade80':f>0.25?'#facc15':'#ef4444';
    ctx.fillRect(e.x-d.r, e.y-d.r-8, hpw*f, 4);
  }
}

function drawMinimap(S){
  const mw=190, mh=mw*MAP_H/MAP_W, pad=14;
  const x0=pad, y0=view.h-mh-pad;
  ctx.fillStyle='rgba(5,12,9,0.85)'; ctx.fillRect(x0-4,y0-4,mw+8,mh+8);
  ctx.strokeStyle='#264'; ctx.strokeRect(x0-4,y0-4,mw+8,mh+8);
  const sx=mw/MAP_W, sy=mh/MAP_H;
  ctx.fillStyle='#0d1c14'; ctx.fillRect(x0,y0,mw,mh);
  for(const n of S.nodes){ ctx.fillStyle=n.type==='gold'?'#caa12e':'#3f8a43'; ctx.fillRect(x0+n.x*sx-1,y0+n.y*sy-1,2,2); }
  for(const e of S.ents){ ctx.fillStyle=COLOR[e.side].main; const s=e.building?3:2; ctx.fillRect(x0+e.x*sx-s/2,y0+e.y*sy-s/2,s,s); }
  // viewport
  ctx.strokeStyle='#fff'; ctx.lineWidth=1;
  ctx.strokeRect(x0+cam.x*sx, y0+cam.y*sy, view.w*sx, view.h*sy);
  mini.box={x0,y0,mw,mh,sx,sy};
}
const mini={box:null};

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
  if(mySide!=='red' || !G || !running || G.winner) return;
  const now=performance.now();
  if(now<cheatReadyAt){ toast(`⏳ Trampita en enfriamiento — ${Math.ceil((cheatReadyAt-now)/1000)}s`); return; }
  const king=G.ents.find(x=>x.side==='red'&&x.kind==='king'&&x.hp>0);
  if(!king){ toast('☠️ El Rey León cayó… nadie a quién envalentonar'); return; }
  king.hp=king.maxHp;
  king.atkMul=1.6; king.spdMul=1.35; king.buffT=8;
  G.res.red.g+=150; G.res.red.w+=150;
  cheatReadyAt=now+45000;
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
  // hotkeys de construcción con aldeano seleccionado
  if(selHasVillager()){
    if(e.key.toLowerCase()==='q') setBuild('house');
    if(e.key.toLowerCase()==='e') setBuild('barracks');
    if(e.key.toLowerCase()==='r') setBuild('tower');
  }
});
window.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()]=false; });

if(canvas){
  canvas.addEventListener('mousemove', e=>{
    const r=canvas.getBoundingClientRect();
    mouse.active=true;
    mouse.x=e.clientX-r.left; mouse.y=e.clientY-r.top;
    const w=worldFromScreen(mouse.x,mouse.y); mouse.wx=w.x; mouse.wy=w.y;
    if(drag){ /* actualiza al render */ }
  });

  canvas.addEventListener('mousedown', e=>{
    const r=canvas.getBoundingClientRect();
    mouse.x=e.clientX-r.left; mouse.y=e.clientY-r.top;
    // ¿clic en minimapa?
    if(mini.box && inMini(mouse.x,mouse.y)){ moveCamMini(mouse.x,mouse.y); return; }

    if(e.button===0){ // izquierdo
      if(buildKind){ placeBuilding(); return; }
      drag={x0:mouse.x, y0:mouse.y};
    } else if(e.button===2){ // derecho
      rightClick();
    }
  });

  canvas.addEventListener('mouseup', e=>{
    if(e.button===0 && drag){
      const moved = Math.abs(mouse.x-drag.x0)+Math.abs(mouse.y-drag.y0);
      if(moved<6) clickSelect();
      else boxSelect();
      drag=null;
    }
  });
  canvas.addEventListener('contextmenu', e=>e.preventDefault());
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
  else { issue({type:'move', ids:unitIds, x:mouse.wx, y:mouse.wy}); }
}
function entById2(S,id){ for(const e of S.ents) if(e.id===id) return e; return null; }

function selHasVillager(){
  const S=renderState();
  for(const id of sel){ const e=entById2(S,id); if(e&&e.kind==='villager') return true; }
  return false;
}

function setBuild(kind){ buildKind=kind; }
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
  const er=S.res[enemySide];
  setText('enemyInfo', `${COLOR[enemySide].name}  🪙${Math.floor(er.g)} 🪵${Math.floor(er.w)} 👥${er.pop}`);

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
    Object.entries(counts).map(([k,v])=> k==='king' ? `👑 Rey ${COLOR[mySide].name}` : `${v}× ${DEFS[k].name}`).join('  ·  ');

  // un solo edificio de producción
  if(ids.length===1){
    const e=entById2(S,ids[0]);
    if(e && e.building && e.constructed){
      if(e.kind==='castle') addTrainBtn(panel,e,'villager','Aldeano','H');
      if(e.kind==='barracks'){ addTrainBtn(panel,e,'swordsman','Espadachín','A'); addTrainBtn(panel,e,'archer','Arquero','S'); addTrainBtn(panel,e,'knight','Caballero','D'); }
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
  const c=COST[unit];
  const b=btn(label, `🪙${c.g} ${c.w?'🪵'+c.w:''}`);
  b.onclick=()=>issue({type:'train', buildingId:e.id, unit});
  panel.appendChild(b);
}
function addCancelBtn(panel,e){
  const b=btn('Cancelar','cola '+e.queue.length);
  b.classList.add('danger');
  b.onclick=()=>issue({type:'cancelTrain', buildingId:e.id});
  panel.appendChild(b);
}
function addBuildBtn(panel,kind,label,sub){
  const b=btn(label,sub);
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
  resize();
  if(mode==='client'){
    // el cliente no simula; espera snapshots
    G=null;
    Net.onSnap=onSnapshot;
  } else {
    initMap();
    if(mode==='host'){ Net.onCmd=(cmd)=>applyCommand(cmd,enemySide); }
  }
  document.getElementById('menu').style.display='none';
  document.getElementById('hud').style.display='block';
  document.getElementById('panel').style.display='flex';
  setText('p1name', COLOR[mySide].name);
  // espera a tener algo que centrar
  const c=setInterval(()=>{ if(renderState()&&renderState().ents&&renderState().ents.length){ centerCamOnBase(); clearInterval(c);} },100);
  running=true; lastT=0; simAcc=0; snapAcc=0;
  requestAnimationFrame(loop);
}

function showEnd(winner){
  if(document.getElementById('endScreen').style.display==='flex') return;
  running=false;
  const won = winner===mySide;
  document.getElementById('endTitle').textContent = won?'¡VICTORIA!':'DERROTA';
  document.getElementById('endTitle').style.color = won?'#7CFC00':'#ff5555';
  document.getElementById('endSub').textContent = won
    ? `El reino de ${COLOR[mySide].name} domina el mapa.`
    : `El reino de ${COLOR[winner].name} arrasó tu castillo.`;
  document.getElementById('endScreen').style.display='flex';
}

// Exponer a la UI (index.html)
window.REINOS = {
  startSolo(side){ startGame({mode:'sp', side}); },
  hostGame(){
    const code = Net.makeCode();
    document.getElementById('roomCode').textContent = code;
    Net.onPeer = ()=>{ /* listo */ };
    Net.host(code);
    Net.onStatus = (t)=>setText('netStatus', t);
    document.getElementById('hostWait').style.display='block';
    // el host es LEÓN (rojo). arranca de inmediato; el cliente se une cuando quiera.
    startGame({mode:'host', side:'red'});
  },
  joinGame(code){
    if(!code) return;
    code=code.trim().toUpperCase();
    Net.onStatus=(t)=>setText('netStatus2', t);
    Net.join(code);
    Net.onPeer=()=>{ /* conectado */ };
    // el que se une es NELSON (azul)
    startGame({mode:'client', side:'blue'});
  },
  restart(){ location.reload(); },
};

// init
resize();
})();
