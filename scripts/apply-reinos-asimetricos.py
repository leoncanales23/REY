from pathlib import Path
import sys


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        raise RuntimeError(f'No se encontró el anclaje: {label}')
    return source.replace(old, new, 1)


def patch(path: str, transform) -> None:
    file = Path(path)
    source = file.read_text(encoding='utf-8')
    updated = transform(source)
    if updated == source:
        raise RuntimeError(f'{path} no recibió cambios')
    file.write_text(updated, encoding='utf-8')


game_path = Path('rey/game.js')
game = game_path.read_text(encoding='utf-8')
if 'const FACTIONS =' in game:
    print('Reinos Asimétricos ya fue aplicado')
    sys.exit(0)

faction_config = """const FACTIONS = {
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

"""
game = replace_once(game, 'const COLOR = {', faction_config + 'const COLOR = {', 'configuración de facciones')

game = replace_once(
    game,
    "    ents: [], nodes: [], projectiles: [],\n    particles: [],   // sistema de partículas",
    "    ents: [], nodes: [], projectiles: [],\n    objectives: OBJECTIVE_DEFS.map((objective)=>({...objective, owner:null, control:0})),\n    dominance: {red:0, blue:0}, victoryReason:null,\n    particles: [],   // sistema de partículas",
    'estado de objetivos',
)

faction_helpers = """function factionOf(side){ return FACTIONS[side] || FACTIONS.red; }
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
"""
game = replace_once(
    game,
    "function canBuildKind(side,kind){ return ageOf(side) >= (BUILDING_AGE[kind] || 1); }\n",
    "function canBuildKind(side,kind){ return ageOf(side) >= (BUILDING_AGE[kind] || 1); }\n" + faction_helpers,
    'helpers de facción',
)

game = replace_once(
    game,
    "function attackFor(e){\n  let value=DEFS[e.kind].atk || 0;\n  if(hasTech(e.side,'forgedBlades') && ['swordsman','knight','king'].includes(e.kind)) value*=1.15;\n  if(hasTech(e.side,'fletching') && ['archer','tower'].includes(e.kind)) value*=1.12;\n  if(isAiSide(e.side)) value*=aiProfile().combat;\n  return value;\n}",
    "function attackFor(e){\n  let value=DEFS[e.kind].atk || 0;\n  if(hasTech(e.side,'forgedBlades') && ['swordsman','knight','king'].includes(e.kind)) value*=1.15;\n  if(hasTech(e.side,'fletching') && ['archer','tower'].includes(e.kind)) value*=1.12;\n  if(e.side==='red' && ['swordsman','knight','king'].includes(e.kind)) value*=factionOf(e.side).meleeAttack;\n  if(kingAuraActive(e)) value*=factionOf(e.side).kingAuraAttack;\n  if(isAiSide(e.side)) value*=aiProfile().combat;\n  return value;\n}",
    'daño asimétrico',
)
game = replace_once(
    game,
    "function rangeFor(e){\n  let value=DEFS[e.kind].range || 0;\n  if(hasTech(e.side,'fletching') && ['archer','tower'].includes(e.kind)) value+=20;\n  return value;\n}",
    "function rangeFor(e){\n  let value=DEFS[e.kind].range || 0;\n  if(hasTech(e.side,'fletching') && ['archer','tower'].includes(e.kind)) value+=20;\n  if(e.side==='blue' && ['archer','tower'].includes(e.kind)) value+=factionOf(e.side).rangedRange;\n  return value;\n}",
    'alcance de Nelson',
)
game = replace_once(
    game,
    "function speedFor(e){\n  let value=DEFS[e.kind].speed || 0;\n  if(e.kind==='knight' && hasTech(e.side,'cavalry')) value*=1.18;\n  return value;\n}",
    "function speedFor(e){\n  let value=DEFS[e.kind].speed || 0;\n  if(e.kind==='knight' && hasTech(e.side,'cavalry')) value*=1.18;\n  if(kingAuraActive(e)) value*=factionOf(e.side).kingAuraSpeed;\n  return value;\n}",
    'velocidad por aura',
)
game = replace_once(
    game,
    "function gatherRateFor(e){\n  let value=DEFS[e.kind].gather || 0;\n  if(hasTech(e.side,'wheelbarrow')) value*=1.25;\n  if(isAiSide(e.side)) value*=aiProfile().gather;\n  return value;\n}",
    "function gatherRateFor(e){\n  let value=DEFS[e.kind].gather || 0;\n  if(hasTech(e.side,'wheelbarrow')) value*=1.25;\n  if(e.side==='blue' && e.kind==='villager') value*=factionOf(e.side).villagerGather;\n  if(isAiSide(e.side)) value*=aiProfile().gather;\n  return value;\n}",
    'economía de Nelson',
)

game = replace_once(
    game,
    "  for(const n of state.nodes){ if(dist(x,y,n.x,n.y) < r+n.r+6) return false; }\n  return true;",
    "  for(const n of state.nodes){ if(dist(x,y,n.x,n.y) < r+n.r+6) return false; }\n  for(const objective of (state.objectives||[])){ if(dist(x,y,objective.x,objective.y) < r+OBJECTIVE_RADIUS+8) return false; }\n  return true;",
    'protección de bastiones',
)

objective_system = """function objectivePower(e){
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

"""
game = replace_once(game, '// ---------- Simulación ----------', objective_system + '// ---------- Simulación ----------', 'sistema de Bastiones')
game = replace_once(game, '  stepResearch(dt);', "  stepResearch(dt);\n  stepObjectives(dt);\n  if(G.winner) return;", 'paso de objetivos')
game = replace_once(
    game,
    "  if(castleDead){ G.winner = (castleDead==='red')?'blue':'red'; }",
    "  if(castleDead){ G.winner = (castleDead==='red')?'blue':'red'; G.victoryReason='castle'; }",
    'motivo de victoria por castillo',
)

game = replace_once(game, '  update(side) {\n    if (!G) return;\n    this.vis.fill(0);\n    for (const e of G.ents) {', '  update(side, state=activeState()) {\n    if (!state || !this.vis) return;\n    this.vis.fill(0);\n    for (const e of state.ents) {', 'fog por snapshot')
game = replace_once(game, "      const sight = DEFS[e.kind].sight || 80;", '      const sight = sightFor(e);', 'visión por facción')
game = replace_once(game, '  if(fogEnabled) FOG.update(mySide);', '  if(fogEnabled) FOG.update(mySide,S);', 'fog del cliente')
game = game.replace("o&&o.type==='attackmove'?d.sight:d.sight*0.7", "o&&o.type==='attackmove'?sightFor(e):sightFor(e)*0.7")
game = replace_once(game, "    const a=nearestEnemy(t.side,t.x,t.y, DEFS[t.kind].sight);", "    const a=nearestEnemy(t.side,t.x,t.y, sightFor(t));", 'contraataque con visión')

game = replace_once(
    game,
    "  const threshold = profile.attackBase + Math.floor(G.time/profile.attackGrowth);\n  const enemyCastle = G.ents.find(e=>e.side===mySide && e.kind==='castle');\n  if(enemyCastle && army.length>=threshold){\n    const free = army.filter(u=>!u.order || u.order.type==='move' || (u.order.type==='attackmove'&&!entById(u.targetId)));\n    for(const u of free){ u.order={type:'attackmove', x:enemyCastle.x, y:enemyCastle.y}; u.tx=enemyCastle.x; u.ty=enemyCastle.y; u.moving=true; }\n  }",
    "  const threshold = profile.attackBase + Math.floor(G.time/profile.attackGrowth);\n  const enemyCastle = G.ents.find(e=>e.side===mySide && e.kind==='castle');\n  const objectiveTarget=objectiveCount(G,side)<2?aiObjectiveTarget(side):null;\n  const attackTarget=objectiveTarget || enemyCastle;\n  const requiredArmy=objectiveTarget?Math.max(3,threshold-1):threshold;\n  if(attackTarget && army.length>=requiredArmy){\n    const free = army.filter(u=>!u.order || u.order.type==='move' || (u.order.type==='attackmove'&&!entById(u.targetId)));\n    for(const u of free){ u.order={type:'attackmove', x:attackTarget.x, y:attackTarget.y}; u.tx=attackTarget.x; u.ty=attackTarget.y; u.moving=true; }\n  }",
    'prioridad de Bastiones para IA',
)

game = replace_once(game, '  // nodos (árboles / oro) — solo si visibles o explorados', "  // Bastiones neutrales: siempre conocidos por ambos reinos\n  for(const objective of (S.objectives||[])) drawObjective(objective);\n\n  // nodos (árboles / oro) — solo si visibles o explorados", 'render de Bastiones')

objective_draw = """function drawObjective(objective){
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

"""
game = replace_once(game, "const GRASS = ['#3f5d2a','#446328','#3a5526','#4a6b2e','#41602b'];", objective_draw + "const GRASS = ['#3f5d2a','#446328','#3a5526','#4a6b2e','#41602b'];", 'dibujo de Bastión')

game = replace_once(
    game,
    "  if(hero){\n    const glow=e.buffT>0?0.9:0.45;",
    "  if(hero){\n    if(e.side==='red'){\n      ctx.strokeStyle='rgba(255,80,60,0.18)'; ctx.lineWidth=3;\n      ctx.beginPath(); ctx.arc(x,y,FACTIONS.red.kingAuraRange,0,Math.PI*2); ctx.stroke();\n    }\n    const glow=e.buffT>0?0.9:0.45;",
    'aura visual del Rey León',
)

game = replace_once(
    game,
    "  for(const n of S.nodes){ ctx.fillStyle=n.type==='gold'?'#caa12e':'#3f8a43'; ctx.fillRect(x0+n.x*sx-1,y0+n.y*sy-1,2,2); }\n  for(const e of S.ents){",
    "  for(const n of S.nodes){ ctx.fillStyle=n.type==='gold'?'#caa12e':'#3f8a43'; ctx.fillRect(x0+n.x*sx-1,y0+n.y*sy-1,2,2); }\n  for(const objective of (S.objectives||[])){ ctx.fillStyle=objective.owner?COLOR[objective.owner].main:'#ffe9a8'; ctx.fillRect(x0+objective.x*sx-2,y0+objective.y*sy-2,4,4); }\n  for(const e of S.ents){",
    'Bastiones en minimapa',
)

game = replace_once(
    game,
    "  setText('pop', r.pop+'/'+r.cap);\n  const ageName=AGE_DEFS[r.age||1].name;",
    "  setText('pop', r.pop+'/'+r.cap);\n  setText('factionInfo', FACTIONS[mySide].name);\n  const owned=objectiveCount(S,mySide), enemyOwned=objectiveCount(S,enemySide);\n  const dominance=Math.floor(S.dominance?.[mySide]||0);\n  const remaining=Math.max(0,Math.ceil(DOMINANCE_SECONDS-dominance));\n  setText('objectiveInfo', `BASTIONES ${owned}/3 · RIVAL ${enemyOwned}/3 · ${owned>=2?'SUPREMACÍA '+remaining+'s':'SUPREMACÍA INACTIVA'}`);\n  const ageName=AGE_DEFS[r.age||1].name;",
    'HUD de facción y Bastiones',
)
game = replace_once(
    game,
    "    Object.entries(counts).map(([k,v])=> k==='king' ? `👑 Rey ${COLOR[mySide].name}` : `${v}× ${DEFS[k].name}`).join('  ·  ');",
    "    Object.entries(counts).map(([k,v])=> k==='king' ? `👑 Rey ${COLOR[mySide].name} · ${FACTIONS[mySide].name}` : `${v}× ${DEFS[k].name}`).join('  ·  ');",
    'identidad de selección',
)

game = replace_once(
    game,
    "    nodes: G.nodes.map(n=>({id:n.id,type:n.type,x:Math.round(n.x),y:Math.round(n.y),amount:Math.round(n.amount),r:n.r})),",
    "    nodes: G.nodes.map(n=>({id:n.id,type:n.type,x:Math.round(n.x),y:Math.round(n.y),amount:Math.round(n.amount),r:n.r})),\n    objectives: G.objectives.map((objective)=>({...objective, control:Math.round(objective.control)})),\n    dominance:{...G.dominance}, victoryReason:G.victoryReason,",
    'snapshot de Bastiones',
)

game = replace_once(
    game,
    "    // el cliente no simula; espera snapshots\n    G=null;\n    Net.onSnap=onSnapshot;",
    "    // el cliente no simula; espera snapshots\n    G=null;\n    TERRAIN.init(); FOG.init();\n    Net.onSnap=onSnapshot;",
    'inicialización visual del cliente',
)

game = replace_once(
    game,
    "  document.getElementById('endSub').textContent = won\n    ? `El reino de ${COLOR[mySide].name} domina el mapa.`\n    : `El reino de ${COLOR[winner].name} arrasó tu castillo.`;",
    "  const state=renderState();\n  const reason=state?.victoryReason || 'castle';\n  document.getElementById('endSub').textContent = reason==='supremacy'\n    ? (won?`La ${FACTIONS[mySide].name} sostuvo dos Bastiones y proclamó supremacía.`:`${COLOR[winner].name} dominó los Bastiones antes de que pudieras recuperarlos.`)\n    : (won?`El reino de ${COLOR[mySide].name} derribó el castillo enemigo.`:`El reino de ${COLOR[winner].name} arrasó tu castillo.`);",
    'final alternativo',
)

game = replace_once(
    game,
    "    return {mode, side:mySide, difficulty:mode==='sp'?aiDifficulty:'human', age:S?.res?.[mySide]?.age||1};",
    "    return {\n      mode, side:mySide, difficulty:mode==='sp'?aiDifficulty:'human', age:S?.res?.[mySide]?.age||1,\n      faction:FACTIONS[mySide].name, victoryReason:S?.victoryReason||'castle',\n      objectives:objectiveCount(S,mySide), dominance:Math.floor(S?.dominance?.[mySide]||0),\n    };",
    'metadatos asimétricos',
)

game_path.write_text(game, encoding='utf-8')


def patch_index(source: str) -> str:
    source = replace_once(source, "JUGAR COMO LEÓN<small>vs CPU azul</small>", "JUGAR COMO LEÓN<small>Legión del Rugido · melee + aura real</small>", 'botón León')
    source = replace_once(source, "JUGAR COMO NELSON<small>vs CPU roja</small>", "JUGAR COMO NELSON<small>Orden del Horizonte · alcance + economía</small>", 'botón Nelson')
    source = replace_once(source, "CREAR SALA<small>tú eres LEÓN</small>", "CREAR SALA<small>LEÓN · Legión del Rugido</small>", 'host León')
    source = replace_once(source, "UNIRME<small>serás NELSON</small>", "UNIRME<small>NELSON · Orden del Horizonte</small>", 'join Nelson')
    source = replace_once(source, "Junta 🪙 oro y 🪵 madera, construye tu base, forma un ejército y derriba el castillo enemigo.", "Derriba el castillo enemigo o controla dos de los tres Bastiones durante 75 segundos para proclamar supremacía.", 'hint de victoria')
    source = replace_once(source, '    <div class="stat" id="p1name">LEÓN</div>\n    <div class="stat age" id="ageInfo">EDAD DE ALDEA</div>', '    <div class="stat" id="p1name">LEÓN</div>\n    <div class="stat faction" id="factionInfo">LEGIÓN DEL RUGIDO</div>\n    <div class="stat age" id="ageInfo">EDAD DE ALDEA</div>', 'HUD facción')
    source = replace_once(source, '    <div class="stat pop">👥 <span id="pop">0/10</span></div>\n    <div class="stat" id="enemyInfo"></div>', '    <div class="stat pop">👥 <span id="pop">0/10</span></div>\n    <div class="stat objectives" id="objectiveInfo">BASTIONES 0/3</div>\n    <div class="stat" id="enemyInfo"></div>', 'HUD objetivos')
    source = replace_once(source, 'Castillo y cuartel → edades y tecnologías<br>F flow field · G niebla de guerra', 'Castillo y cuartel → edades y tecnologías<br>Bastiones → controla 2 durante 75s<br>F flow field · G niebla de guerra', 'controles Bastiones')
    return source

patch('rey/index.html', patch_index)


def patch_style(source: str) -> str:
    return source + """

/* Reinos Asimétricos */
#hud .faction{color:#ffd8a6;font-size:16px;letter-spacing:.8px}
#hud .objectives{color:#ffe27a;font-size:17px;border-left:1px solid rgba(255,226,122,.35);padding-left:12px}
.btn.red small{color:#d98f82}.btn.blue small{color:#8dbaf6}
@media(max-width:980px){#hud .faction{display:none}#hud .objectives{order:6;width:100%;border-left:0;padding-left:0;font-size:15px}}
"""

patch('rey/style.css', patch_style)


def patch_chronicle(source: str) -> str:
    source = replace_once(source, "  function difficultyName(value) {", "  function factionName(side) {\n    return side === 'blue' ? 'Orden del Horizonte' : 'Legión del Rugido';\n  }\n\n  function victoryReasonName(value) {\n    return value === 'supremacy' ? 'Supremacía de Bastiones' : 'Castillo destruido';\n  }\n\n  function difficultyName(value) {", 'nombres de facción y victoria')
    source = replace_once(source, "      bestStreak: calculateBestStreak(history),", "      bestStreak: calculateBestStreak(history),\n      supremacyWins: history.filter((entry) => entry.result === 'victory' && entry.victoryReason === 'supremacy').length,", 'estadística de supremacía')
    source = replace_once(source, "    appendStat(statsContainer, 'mejor racha', stats.bestStreak);\n    appendStat(statsContainer, 'duración media', formatDuration(stats.averageMs));", "    appendStat(statsContainer, 'mejor racha', stats.bestStreak);\n    appendStat(statsContainer, 'supremacías', stats.supremacyWins);\n    appendStat(statsContainer, 'duración media', formatDuration(stats.averageMs));", 'panel de supremacías')
    source = replace_once(source, "      details.textContent = `${sideName(entry.side)} · ${modeName(entry.mode)} · ${difficultyName(entry.difficulty)} · Edad ${entry.finalAge||1} · ${formatDuration(entry.durationMs)}`;", "      details.textContent = `${sideName(entry.side)} · ${factionName(entry.side)} · ${modeName(entry.mode)} · ${difficultyName(entry.difficulty)} · ${victoryReasonName(entry.victoryReason)} · Edad ${entry.finalAge||1} · ${formatDuration(entry.durationMs)}`;", 'detalle asimétrico')
    source = replace_once(source, "    appendStat(grid, 'edad final', entry.finalAge||1);\n    appendStat(grid, 'racha', entry.result === 'victory' ? streak : 0);", "    appendStat(grid, 'edad final', entry.finalAge||1);\n    appendStat(grid, 'victoria por', victoryReasonName(entry.victoryReason));\n    appendStat(grid, 'bastiones', entry.finalObjectives||0);\n    appendStat(grid, 'racha', entry.result === 'victory' ? streak : 0);", 'resumen de Bastiones')
    source = replace_once(source, "      finalAge: meta.age || 1,\n      finishedAt: Date.now(),", "      finalAge: meta.age || 1,\n      faction: meta.faction || factionName(activeBattle.side),\n      victoryReason: meta.victoryReason || 'castle',\n      finalObjectives: meta.objectives || 0,\n      finalDominance: meta.dominance || 0,\n      finishedAt: Date.now(),", 'metadatos de Crónica')
    return source

patch('rey/chronicle.js', patch_chronicle)

patch('rey/sw.js', lambda source: replace_once(source, "const CACHE_NAME = 'reinos-conquista-v3';", "const CACHE_NAME = 'reinos-asimetricos-v4';", 'versión PWA'))


def patch_readme(source: str) -> str:
    return source + """

## Reinos Asimétricos

León y Nelson ya no son variaciones cosméticas. La **Legión del Rugido** obtiene presión cuerpo a cuerpo, mayor poder de captura y un aura ofensiva alrededor del Rey León. La **Orden del Horizonte** obtiene más alcance para arqueros y torres, visión ampliada y aldeanos más eficientes.

El mapa incorpora tres Bastiones neutrales. Las unidades militares capturan presencia dentro de su radio; cada Bastión controlado entrega un ingreso moderado y dominar dos activa una cuenta regresiva de 75 segundos. La partida termina por destrucción del castillo o por supremacía territorial. La IA reconoce los objetivos y los prioriza antes del asalto final.
"""

patch('README.md', patch_readme)


def patch_validator(source: str) -> str:
    source = replace_once(source, "for (const id of ['difficultySelect', 'ageInfo']) {", "for (const id of ['difficultySelect', 'ageInfo', 'factionInfo', 'objectiveInfo']) {", 'IDs asimétricos')
    source = replace_once(source, "if (!sw.includes('reinos-conquista-v3')) throw new Error('La PWA no renovó su caché para Era de Conquista');", "if (!sw.includes('reinos-asimetricos-v4')) throw new Error('La PWA no renovó su caché para Reinos Asimétricos');", 'caché v4')
    source = replace_once(source, "console.log('Validación estática, salas, crónica y Era de Conquista completadas.');", "for (const marker of ['const FACTIONS =', 'OBJECTIVE_DEFS', 'stepObjectives(dt)', \"victoryReason='supremacy'\", 'objectives: G.objectives', 'aiObjectiveTarget', 'FOG.update(mySide,S)']) {\n  if (!game.includes(marker)) throw new Error(`Reinos Asimétricos incompleto: falta ${marker}`);\n}\nfor (const marker of ['victoryReasonName', 'finalObjectives', 'supremacyWins']) {\n  if (!chronicle.includes(marker)) throw new Error(`Crónica asimétrica incompleta: falta ${marker}`);\n}\n\nconsole.log('Validación estática, salas, crónica, Era de Conquista y Reinos Asimétricos completadas.');", 'validación asimétrica')
    return source

patch('scripts/validate.mjs', patch_validator)

print('Transformación Reinos Asimétricos aplicada')
