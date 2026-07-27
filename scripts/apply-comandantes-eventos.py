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
if 'const COMMANDER_ABILITIES =' in game:
    print('Comandantes y Eventos ya fue aplicado')
    sys.exit(0)

# ---------- Configuración y estado ----------
game = replace_once(
    game,
    "const KINDS = ['castle','house','barracks','tower','villager','swordsman','archer','knight','king'];",
    "const KINDS = ['castle','house','barracks','tower','villager','swordsman','archer','knight','mercenary','king'];",
    'unidad mercenaria en KINDS',
)
game = replace_once(
    game,
    "  knight:   {hp:190, r:14, speed:94, atk:19, cd:1.15,range:20, sight:170, name:'Caballero'},",
    "  knight:   {hp:190, r:14, speed:94, atk:19, cd:1.15,range:20, sight:170, name:'Caballero'},\n  mercenary:{hp:155, r:12, speed:66, atk:17, cd:1.05,range:19, sight:175, name:'Guardia Mercenaria'},",
    'definición mercenaria',
)

systems_config = """
const COMMANDER_ABILITIES = {
  red: {
    id:'warCry', name:'RUGIDO DE GUERRA', age:2, cooldown:70, duration:12, radius:220,
    attack:1.25, speed:1.20,
    note:'+25% daño y +20% velocidad cerca del Rey León',
  },
  blue: {
    id:'horizonEye', name:'OJO DEL HORIZONTE', age:2, cooldown:65, duration:14, radius:340,
    note:'revela una gran zona al centro de la cámara',
  },
};

const MERCENARY_CAMP_DEFS = [
  {id:'northGuild', name:'HERMANDAD DEL NORTE', x:MAP_W/2-300, y:MAP_H/2-190},
  {id:'southGuild', name:'COMPAÑÍA DEL SUR', x:MAP_W/2+300, y:MAP_H/2+190},
];
const MERCENARY_CAMP_RADIUS = 150;
const MERCENARY_CONTRACT = {g:180, w:90, units:2, cooldown:85, age:2};

const WORLD_EVENT_DEFS = {
  abundance: {name:'TIEMPO DE ABUNDANCIA', duration:38, note:'+25% velocidad de recolección'},
  warMarket: {name:'MERCADO DE GUERRA', duration:34, note:'contratos mercenarios -35% y campamentos acelerados'},
  blackFog: {name:'NIEBLA NEGRA', duration:30, note:'visión global reducida; Ojo del Horizonte atraviesa la oscuridad'},
};
const WORLD_EVENT_IDS = Object.keys(WORLD_EVENT_DEFS);
const WORLD_EVENT_WARNING = 12;

"""
game = replace_once(game, 'const COLOR = {', systems_config + 'const COLOR = {', 'configuración de comandantes y eventos')

game = replace_once(
    game,
    "    objectives: OBJECTIVE_DEFS.map((objective)=>({...objective, owner:null, control:0})),\n    dominance: {red:0, blue:0}, victoryReason:null,\n    particles: [],   // sistema de partículas",
    "    objectives: OBJECTIVE_DEFS.map((objective)=>({...objective, owner:null, control:0})),\n    dominance: {red:0, blue:0}, victoryReason:null,\n    commanders: {\n      red:{cooldown:0, active:0, reveal:null},\n      blue:{cooldown:0, active:0, reveal:null},\n    },\n    mercenaryCamps: MERCENARY_CAMP_DEFS.map((camp)=>({...camp,cooldown:0,lastSide:null})),\n    worldEvent:{id:null,t:0,nextAt:65,warning:null,warningT:0,serial:0,announcement:'',seen:0,lastId:null},\n    stats:{\n      red:{commanderUses:0,mercenariesHired:0},\n      blue:{commanderUses:0,mercenariesHired:0},\n    },\n    particles: [],   // sistema de partículas",
    'estado vivo de comandantes y eventos',
)

game = replace_once(
    game,
    "  AI.t=0; AI.lastBuild=0;",
    "  AI.t=0; AI.lastBuild=0; AI.lastMercenary=-120; AI.mercenaryCampId=null;",
    'reinicio de IA mercenaria',
)

helpers = """function worldEventActive(id,state=activeState()){ return !!(state?.worldEvent?.id===id && state.worldEvent.t>0); }
function commanderOf(side,state=activeState()){ return state?.commanders?.[side] || null; }
function commanderAbilityActive(e){
  if(e.side!=='red' || e.building || e.kind==='villager' || e.kind==='king') return false;
  const state=activeState(), commander=commanderOf(e.side,state), def=COMMANDER_ABILITIES.red;
  if(!state || !commander || commander.active<=0) return false;
  const king=state.ents.find((unit)=>unit.side===e.side && unit.kind==='king' && unit.hp>0);
  return !!king && dist(e.x,e.y,king.x,king.y)<=def.radius;
}
function campById(id,state=activeState()){ return (state?.mercenaryCamps||[]).find((camp)=>camp.id===id) || null; }
function nearestCampForKing(state,king){
  let best=null, bestDistance=Infinity;
  for(const camp of (state?.mercenaryCamps||[])){
    const distance=dist(king.x,king.y,camp.x,camp.y);
    if(distance<bestDistance){ bestDistance=distance; best=camp; }
  }
  return best?{camp:best,distance:bestDistance}:null;
}
function mercenaryPrice(state=activeState()){
  const multiplier=worldEventActive('warMarket',state)?0.65:1;
  return {g:Math.round(MERCENARY_CONTRACT.g*multiplier),w:Math.round(MERCENARY_CONTRACT.w*multiplier)};
}
"""
game = replace_once(
    game,
    "function factionOf(side){ return FACTIONS[side] || FACTIONS.red; }\n",
    "function factionOf(side){ return FACTIONS[side] || FACTIONS.red; }\n" + helpers,
    'helpers de comandantes y mercenarios',
)

game = replace_once(
    game,
    "function sightFor(e){\n  let value=DEFS[e.kind].sight || 80;\n  if(e.side==='blue') value*=factionOf(e.side).sight;\n  return value;\n}",
    "function sightFor(e){\n  let value=DEFS[e.kind].sight || 80;\n  if(e.side==='blue') value*=factionOf(e.side).sight;\n  if(worldEventActive('blackFog')) value*=0.68;\n  return value;\n}",
    'niebla negra en visión',
)
game = replace_once(
    game,
    "  if(kingAuraActive(e)) value*=factionOf(e.side).kingAuraAttack;\n  if(isAiSide(e.side)) value*=aiProfile().combat;",
    "  if(kingAuraActive(e)) value*=factionOf(e.side).kingAuraAttack;\n  if(commanderAbilityActive(e)) value*=COMMANDER_ABILITIES.red.attack;\n  if(isAiSide(e.side)) value*=aiProfile().combat;",
    'daño del Rugido oficial',
)
game = replace_once(
    game,
    "  if(kingAuraActive(e)) value*=factionOf(e.side).kingAuraSpeed;\n  return value;",
    "  if(kingAuraActive(e)) value*=factionOf(e.side).kingAuraSpeed;\n  if(commanderAbilityActive(e)) value*=COMMANDER_ABILITIES.red.speed;\n  return value;",
    'velocidad del Rugido oficial',
)
game = replace_once(
    game,
    "  if(e.side==='blue' && e.kind==='villager') value*=factionOf(e.side).villagerGather;\n  if(isAiSide(e.side)) value*=aiProfile().gather;",
    "  if(e.side==='blue' && e.kind==='villager') value*=factionOf(e.side).villagerGather;\n  if(worldEventActive('abundance')) value*=1.25;\n  if(isAiSide(e.side)) value*=aiProfile().gather;",
    'abundancia en recolección',
)

# ---------- Autoridad de habilidades y contratos ----------
command_system = """function spawnNearPoint(side,kind,x,y,count){
  const spawned=[];
  for(let i=0;i<count;i++){
    const angle=(Math.PI*2*i/Math.max(1,count))+Math.random()*.35;
    const radius=28+Math.random()*20;
    spawned.push(spawn(side,kind,clamp(x+Math.cos(angle)*radius,14,MAP_W-14),clamp(y+Math.sin(angle)*radius,14,MAP_H-14)));
  }
  return spawned;
}
function useCommanderAbility(side,abilityId,kingId,x,y){
  const def=COMMANDER_ABILITIES[side], commander=commanderOf(side), king=entById(kingId), r=G.res[side];
  if(!def || def.id!==abilityId || !commander || !king || king.side!==side || king.kind!=='king' || king.hp<=0) return false;
  if(r.age<def.age || commander.cooldown>0) return false;
  commander.cooldown=def.cooldown; commander.active=def.duration;
  if(side==='blue'){
    if(!Number.isFinite(x)||!Number.isFinite(y)) return false;
    commander.reveal={x:clamp(x,0,MAP_W),y:clamp(y,0,MAP_H),r:def.radius,t:def.duration};
  }
  G.stats[side].commanderUses++;
  toast(side==='red'?'🦁 ¡RUGIDO DE GUERRA! Las tropas cercanas avanzan enfurecidas.':'🧭 OJO DEL HORIZONTE: la niebla se abre sobre el campo elegido.');
  return true;
}
function hireMercenaries(side,campId,kingId){
  const camp=campById(campId), king=entById(kingId), r=G.res[side], price=mercenaryPrice(G);
  if(!camp || !king || king.side!==side || king.kind!=='king' || king.hp<=0) return false;
  if(r.age<MERCENARY_CONTRACT.age || camp.cooldown>0 || dist(king.x,king.y,camp.x,camp.y)>MERCENARY_CAMP_RADIUS) return false;
  if(r.g<price.g || r.w<price.w || r.pop+MERCENARY_CONTRACT.units>r.cap) return false;
  r.g-=price.g; r.w-=price.w;
  const troops=spawnNearPoint(side,'mercenary',camp.x,camp.y,MERCENARY_CONTRACT.units);
  for(const troop of troops){ troop.order={type:'move'}; troop.tx=king.x; troop.ty=king.y; troop.moving=true; }
  camp.cooldown=MERCENARY_CONTRACT.cooldown; camp.lastSide=side;
  G.stats[side].mercenariesHired+=MERCENARY_CONTRACT.units;
  recalcPop();
  toast('⚔ '+COLOR[side].name+' firmó con '+camp.name+' · '+MERCENARY_CONTRACT.units+' guardias se unen');
  return true;
}

"""
game = replace_once(game, 'function applyCommand(cmd, side){', command_system + 'function applyCommand(cmd, side){', 'autoridad de comandantes')
game = replace_once(
    game,
    "    case 'research': {\n      const b=entById(cmd.buildingId);\n      startResearch(side,cmd.researchId,b);\n      break; }\n    case 'rally': {",
    "    case 'research': {\n      const b=entById(cmd.buildingId);\n      startResearch(side,cmd.researchId,b);\n      break; }\n    case 'ability': {\n      useCommanderAbility(side,cmd.abilityId,cmd.kingId,cmd.x,cmd.y);\n      break; }\n    case 'hireMercenaries': {\n      hireMercenaries(side,cmd.campId,cmd.kingId);\n      break; }\n    case 'rally': {",
    'comandos de comandante',
)
game = replace_once(
    game,
    "  for(const objective of (state.objectives||[])){ if(dist(x,y,objective.x,objective.y) < r+OBJECTIVE_RADIUS+8) return false; }\n  return true;",
    "  for(const objective of (state.objectives||[])){ if(dist(x,y,objective.x,objective.y) < r+OBJECTIVE_RADIUS+8) return false; }\n  for(const camp of (state.mercenaryCamps||[])){ if(dist(x,y,camp.x,camp.y) < r+58) return false; }\n  return true;",
    'protección de campamentos',
)

# ---------- Visión especial de Nelson ----------
game = replace_once(
    game,
    "    }\n  },\n\n  // Retorna 0/1/2 para una posición mundo",
    "    }\n    const reveal=state.commanders?.[side]?.reveal;\n    if(reveal && reveal.t>0){\n      const cx=Math.floor(reveal.x/this.CELL), cy=Math.floor(reveal.y/this.CELL);\n      const cr=Math.ceil(reveal.r/this.CELL), r2=(reveal.r/this.CELL)**2;\n      for(let dy=-cr;dy<=cr;dy++) for(let dx=-cr;dx<=cr;dx++){\n        if(dx*dx+dy*dy>r2) continue;\n        const nx=cx+dx, ny=cy+dy;\n        if(nx<0||nx>=this.COLS||ny<0||ny>=this.ROWS) continue;\n        const i=ny*this.COLS+nx; this.vis[i]=2; this.exp[i]=1;\n      }\n    }\n  },\n\n  // Retorna 0/1/2 para una posición mundo",
    'revelación Ojo del Horizonte',
)

# ---------- Eventos, enfriamientos y campamentos ----------
world_system = """function setWorldAnnouncement(text){
  G.worldEvent.announcement=text; G.worldEvent.serial++;
  toast(text);
}
function chooseWorldEvent(){
  const choices=WORLD_EVENT_IDS.filter((id)=>id!==G.worldEvent.lastId);
  return choices[Math.floor(Math.random()*choices.length)] || WORLD_EVENT_IDS[0];
}
function stepWorldEvents(dt){
  const world=G.worldEvent;
  if(world.id){
    world.t-=dt;
    if(world.t<=0){
      const ended=WORLD_EVENT_DEFS[world.id];
      world.lastId=world.id; world.id=null; world.t=0; world.nextAt=G.time+75+Math.random()*45;
      setWorldAnnouncement('☀ '+ended.name+' terminó. El mundo recupera el equilibrio.');
    }
    return;
  }
  if(world.warning){
    world.warningT-=dt;
    if(world.warningT<=0){
      world.id=world.warning; world.warning=null; world.t=WORLD_EVENT_DEFS[world.id].duration; world.seen++;
      if(world.id==='warMarket') for(const camp of G.mercenaryCamps) camp.cooldown=Math.min(camp.cooldown,18);
      setWorldAnnouncement('🌍 '+WORLD_EVENT_DEFS[world.id].name+' ACTIVO · '+WORLD_EVENT_DEFS[world.id].note);
    }
    return;
  }
  if(G.time>=world.nextAt){
    world.warning=chooseWorldEvent(); world.warningT=WORLD_EVENT_WARNING;
    setWorldAnnouncement('⚠ '+WORLD_EVENT_DEFS[world.warning].name+' llegará en '+WORLD_EVENT_WARNING+'s');
  }
}
function stepCommanderStates(dt){
  for(const side of ['red','blue']){
    const commander=G.commanders[side];
    commander.cooldown=Math.max(0,commander.cooldown-dt);
    commander.active=Math.max(0,commander.active-dt);
    if(commander.reveal){ commander.reveal.t-=dt; if(commander.reveal.t<=0) commander.reveal=null; }
  }
}
function stepMercenaryCamps(dt){
  const speed=worldEventActive('warMarket',G)?2.5:1;
  for(const camp of G.mercenaryCamps) camp.cooldown=Math.max(0,camp.cooldown-dt*speed);
}

"""
game = replace_once(game, '// ---------- Simulación ----------', world_system + '// ---------- Simulación ----------', 'motor de eventos mundiales')
game = replace_once(
    game,
    "  stepResearch(dt);\n  stepObjectives(dt);",
    "  stepResearch(dt);\n  stepWorldEvents(dt);\n  stepCommanderStates(dt);\n  stepMercenaryCamps(dt);\n  stepObjectives(dt);",
    'paso global de eventos y comandantes',
)

# ---------- IA ----------
game = replace_once(
    game,
    "const AI = { t:0, lastBuild:0 };",
    "const AI = { t:0, lastBuild:0, lastMercenary:-120, mercenaryCampId:null };",
    'estado IA extendido',
)
ai_helpers = """function aiTryCommanderAbility(side,king,army,target){
  const def=COMMANDER_ABILITIES[side], commander=commanderOf(side,G);
  if(!def || !king || G.res[side].age<def.age || !commander || commander.cooldown>0) return false;
  if(side==='red'){
    const nearby=army.filter((unit)=>dist(unit.x,unit.y,king.x,king.y)<=def.radius).length;
    const danger=nearestEnemy(side,king.x,king.y,270);
    if(nearby>=3 && danger) return useCommanderAbility(side,def.id,king.id,king.x,king.y);
    return false;
  }
  if(target) return useCommanderAbility(side,def.id,king.id,target.x,target.y);
  return false;
}
function aiMercenaryMission(side,king,army){
  if(!king || G.res[side].age<MERCENARY_CONTRACT.age) return false;
  const price=mercenaryPrice(G), r=G.res[side];
  if(AI.mercenaryCampId){
    const camp=campById(AI.mercenaryCampId,G);
    if(!camp || camp.cooldown>0){ AI.mercenaryCampId=null; return false; }
    if(dist(king.x,king.y,camp.x,camp.y)<=MERCENARY_CAMP_RADIUS){
      if(hireMercenaries(side,camp.id,king.id)){ AI.lastMercenary=AI.t; AI.mercenaryCampId=null; }
      return true;
    }
    king.order={type:'move'}; king.tx=camp.x; king.ty=camp.y; king.moving=true;
    for(const escort of army.slice(0,2)){ escort.order={type:'move'}; escort.tx=camp.x; escort.ty=camp.y; escort.moving=true; }
    return true;
  }
  if(AI.t-AI.lastMercenary<105 || r.g<price.g || r.w<price.w || r.pop+MERCENARY_CONTRACT.units>r.cap) return false;
  const ready=G.mercenaryCamps.filter((camp)=>camp.cooldown<=0).sort((a,b)=>dist2(king.x,king.y,a.x,a.y)-dist2(king.x,king.y,b.x,b.y));
  if(!ready.length) return false;
  AI.mercenaryCampId=ready[0].id;
  return true;
}

"""
game = replace_once(game, 'function aiStep(dt){', ai_helpers + 'function aiStep(dt){', 'IA de comandantes y mercenarios')
game = replace_once(
    game,
    "  const vills = mine.filter(e=>e.kind==='villager');\n  const army  = mine.filter(e=>!e.building && e.kind!=='villager' && e.kind!=='king');",
    "  const vills = mine.filter(e=>e.kind==='villager');\n  const king = mine.find(e=>e.kind==='king'&&e.hp>0);\n  const army  = mine.filter(e=>!e.building && e.kind!=='villager' && e.kind!=='king');",
    'Rey IA',
)
game = replace_once(
    game,
    "  const researchPlan=aiTryResearch(side,castle,barracks,profile);\n  const savingForAge=researchPlan==='save-age';",
    "  const researchPlan=aiTryResearch(side,castle,barracks,profile);\n  const savingForAge=researchPlan==='save-age';\n  const mercenaryMission=!savingForAge && aiMercenaryMission(side,king,army);",
    'misión mercenaria IA',
)
game = replace_once(
    game,
    "  const attackTarget=holdingSupremacy?null:(objectiveTarget || enemyCastle);\n  const requiredArmy=objectiveTarget?Math.max(3,threshold-1):threshold;\n  if(attackTarget && army.length>=requiredArmy){",
    "  const attackTarget=(holdingSupremacy||mercenaryMission)?null:(objectiveTarget || enemyCastle);\n  const requiredArmy=objectiveTarget?Math.max(3,threshold-1):threshold;\n  // AI_COMMANDER_USAGE: la CPU usa la misma autoridad y enfriamientos que el jugador.\n  aiTryCommanderAbility(side,king,army,attackTarget || objectiveTarget || enemyCastle);\n  if(attackTarget && army.length>=requiredArmy){",
    'uso de comandante IA',
)

# ---------- Render ----------
game = replace_once(
    game,
    "  for(const objective of (S.objectives||[])) drawObjective(objective);\n  ctx.restore();",
    "  for(const objective of (S.objectives||[])) drawObjective(objective);\n  for(const camp of (S.mercenaryCamps||[])) drawMercenaryCamp(camp);\n  ctx.restore();",
    'campamentos sobre la niebla',
)
mercenary_draw = """function drawMercenaryCamp(camp){
  ctx.save();
  const ready=camp.cooldown<=0;
  ctx.fillStyle='rgba(20,13,8,.9)'; ctx.fillRect(camp.x-42,camp.y-28,84,56);
  ctx.strokeStyle=ready?'#f0c46a':'#6f5b3f'; ctx.lineWidth=3; ctx.strokeRect(camp.x-42,camp.y-28,84,56);
  ctx.fillStyle='#8b2f2f';
  ctx.beginPath(); ctx.moveTo(camp.x-48,camp.y-28); ctx.lineTo(camp.x,camp.y-68); ctx.lineTo(camp.x+48,camp.y-28); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#f4e4bd'; ctx.font='bold 18px VT323, monospace'; ctx.textAlign='center';
  ctx.fillText('⚔',camp.x,camp.y+7);
  ctx.font='15px VT323, monospace'; ctx.fillStyle=ready?'#ffe9a8':'#9d8c70';
  ctx.fillText(ready?camp.name:`${camp.name} · ${Math.ceil(camp.cooldown)}s`,camp.x,camp.y+47);
  ctx.restore();
}

"""
game = replace_once(game, 'const GRASS =', mercenary_draw + 'const GRASS =', 'dibujo de campamentos')
game = replace_once(
    game,
    "  } else if(e.kind==='swordsman' || (hero)){",
    "  } else if(e.kind==='swordsman' || e.kind==='mercenary' || (hero)){",
    'arma de Guardia Mercenaria',
)
game = replace_once(
    game,
    "  for(const objective of (S.objectives||[])){ ctx.fillStyle=objective.owner?COLOR[objective.owner].main:'#ffe9a8'; ctx.fillRect(x0+objective.x*sx-2,y0+objective.y*sy-2,4,4); }\n  for(const e of S.ents){",
    "  for(const objective of (S.objectives||[])){ ctx.fillStyle=objective.owner?COLOR[objective.owner].main:'#ffe9a8'; ctx.fillRect(x0+objective.x*sx-2,y0+objective.y*sy-2,4,4); }\n  for(const camp of (S.mercenaryCamps||[])){ ctx.fillStyle=camp.cooldown<=0?'#f0c46a':'#6f5b3f'; ctx.fillRect(x0+camp.x*sx-2,y0+camp.y*sy-2,4,4); }\n  for(const e of S.ents){",
    'campamentos en minimapa',
)

# ---------- Retirar cheat y oficializar poderes ----------
cheat_start = game.index('// ---------- Trampita del Rey León ----------')
keydown_start = game.index("window.addEventListener('keydown'", cheat_start)
toast_start = game.index('function toast(msg){', cheat_start)
try_cheat_start = game.index('function tryCheat(){', toast_start)
toast_block = game[toast_start:try_cheat_start].rstrip()
game = game[:cheat_start] + '// ---------- Poderes oficiales de los comandantes ----------\n' + toast_block + '\n\n' + game[keydown_start:]
game = replace_once(
    game,
    "  // registrar código secreto (no en cajas de texto)\n  const inField = e.target && (e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA');\n  if(!inField && e.key && e.key.length===1){\n    cheatBuf=(cheatBuf + e.key.toLowerCase()).slice(-12);\n    if(cheatBuf.endsWith(CHEAT_CODE)) tryCheat();\n  }",
    "  const inField = e.target && (e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA');",
    'retiro del código secreto',
)

# ---------- HUD, panel y snapshots ----------
game = replace_once(
    game,
    "  const ageName=AGE_DEFS[r.age||1].name;",
    "  const world=S.worldEvent||{};\n  let worldText='MUNDO ESTABLE';\n  if(world.warning) worldText=`⚠ ${WORLD_EVENT_DEFS[world.warning].name} EN ${Math.max(0,Math.ceil(world.warningT))}s`;\n  else if(world.id) worldText=`🌍 ${WORLD_EVENT_DEFS[world.id].name} ${Math.max(0,Math.ceil(world.t))}s · ${WORLD_EVENT_DEFS[world.id].note}`;\n  else worldText=`MUNDO ESTABLE · próximo evento ${Math.max(0,Math.ceil((world.nextAt||0)-(S.time||0)))}s`;\n  setText('eventInfo',worldText);\n  const ageName=AGE_DEFS[r.age||1].name;",
    'HUD de eventos mundiales',
)
game = replace_once(
    game,
    "  // un solo edificio de producción\n  if(ids.length===1){\n    const e=entById2(S,ids[0]);\n    if(e && e.building && e.constructed){",
    "  // un solo comandante o edificio de producción\n  if(ids.length===1){\n    const e=entById2(S,ids[0]);\n    if(e && e.kind==='king'){ addCommanderButtons(panel,e); return; }\n    if(e && e.building && e.constructed){",
    'panel de comandante',
)
commander_ui = """function addCommanderButtons(panel,king){
  const S=renderState(), r=S.res[mySide], def=COMMANDER_ABILITIES[mySide], commander=S.commanders?.[mySide]||{};
  const ageLocked=(r.age||1)<def.age, cooldown=Math.ceil(commander.cooldown||0), active=Math.ceil(commander.active||0);
  const abilityLabel=active>0?`⚡ ${def.name} ACTIVO`:def.name;
  const abilitySub=ageLocked?'requiere EDAD DE FORTALEZA':cooldown>0?`enfriamiento ${cooldown}s`:def.note;
  const abilityBtn=btn(ageLocked?'🔒 '+def.name:abilityLabel,abilitySub);
  abilityBtn.classList.add('commander'); abilityBtn.disabled=ageLocked||cooldown>0;
  abilityBtn.onclick=()=>issue({type:'ability',abilityId:def.id,kingId:king.id,x:cam.x+view.w/2,y:cam.y+view.h/2});
  panel.appendChild(abilityBtn);

  const nearest=nearestCampForKing(S,king), camp=nearest?.camp, price=mercenaryPrice(S);
  const near=!!camp && nearest.distance<=MERCENARY_CAMP_RADIUS;
  const campCooldown=Math.ceil(camp?.cooldown||0);
  const popBlocked=r.pop+MERCENARY_CONTRACT.units>r.cap;
  let contractSub=`acerca al Rey a un campamento · 🪙${price.g} 🪵${price.w}`;
  if(ageLocked) contractSub='requiere EDAD DE FORTALEZA';
  else if(near && campCooldown>0) contractSub=`${camp.name} disponible en ${campCooldown}s`;
  else if(near) contractSub=`${camp.name} · +${MERCENARY_CONTRACT.units} guardias · 🪙${price.g} 🪵${price.w}`;
  else if(popBlocked) contractSub='población insuficiente';
  const contractBtn=btn(ageLocked?'🔒 CONTRATO MERCENARIO':'CONTRATO MERCENARIO',contractSub);
  contractBtn.classList.add('mercenary');
  contractBtn.disabled=ageLocked||!near||campCooldown>0||popBlocked||r.g<price.g||r.w<price.w;
  contractBtn.onclick=()=>issue({type:'hireMercenaries',campId:camp.id,kingId:king.id});
  panel.appendChild(contractBtn);
}

"""
game = replace_once(game, 'function addTrainBtn(panel,e,unit,label,hk){', commander_ui + 'function addTrainBtn(panel,e,unit,label,hk){', 'botones de comandante')

game = replace_once(
    game,
    "    dominance:{...G.dominance}, victoryReason:G.victoryReason,\n    ents: G.ents.map(e=>({",
    "    dominance:{...G.dominance}, victoryReason:G.victoryReason,\n    commanders:{red:{...G.commanders.red,reveal:G.commanders.red.reveal?{...G.commanders.red.reveal}:null},blue:{...G.commanders.blue,reveal:G.commanders.blue.reveal?{...G.commanders.blue.reveal}:null}},\n    mercenaryCamps:G.mercenaryCamps.map((camp)=>({...camp,cooldown:Math.round(camp.cooldown)})),\n    worldEvent:{...G.worldEvent,t:Math.round(G.worldEvent.t),warningT:Math.round(G.worldEvent.warningT)},\n    stats:{red:{...G.stats.red},blue:{...G.stats.blue}},\n    ents: G.ents.map(e=>({",
    'snapshot de sistemas dinámicos',
)
game = replace_once(
    game,
    "// snapshot de cliente (interpolación)\nlet snapPrev=null, snapCur=null, snapPrevT=0, snapCurT=0;",
    "// snapshot de cliente (interpolación)\nlet snapPrev=null, snapCur=null, snapPrevT=0, snapCurT=0;\nlet lastWorldAnnouncementSerial=0;",
    'serial de anuncios cliente',
)
game = replace_once(
    game,
    "function onSnapshot(s){\n  snapPrev=snapCur; snapPrevT=snapCurT;\n  snapCur=s; snapCurT=performance.now()/1000;\n  if(s.winner) showEnd(s.winner);\n}",
    "function onSnapshot(s){\n  snapPrev=snapCur; snapPrevT=snapCurT;\n  snapCur=s; snapCurT=performance.now()/1000;\n  // CLIENT_WORLD_ANNOUNCEMENT: el invitado recibe los avisos creados por el host.\n  if((s.worldEvent?.serial||0)>lastWorldAnnouncementSerial && s.worldEvent?.announcement){\n    lastWorldAnnouncementSerial=s.worldEvent.serial; toast(s.worldEvent.announcement);\n  }\n  if(s.winner) showEnd(s.winner);\n}",
    'anuncios P2P de eventos',
)
game = replace_once(
    game,
    "  mode=opts.mode; mySide=opts.side; enemySide = mySide==='red'?'blue':'red';",
    "  mode=opts.mode; mySide=opts.side; enemySide = mySide==='red'?'blue':'red';\n  lastWorldAnnouncementSerial=0;",
    'reinicio de serial local',
)
game = replace_once(
    game,
    "      objectives:objectiveCount(S,mySide), dominance:Math.floor(S?.dominance?.[mySide]||0),",
    "      objectives:objectiveCount(S,mySide), dominance:Math.floor(S?.dominance?.[mySide]||0),\n      commanderUses:S?.stats?.[mySide]?.commanderUses||0, mercenariesHired:S?.stats?.[mySide]?.mercenariesHired||0,\n      worldEvents:S?.worldEvent?.seen||0, lastWorldEvent:S?.worldEvent?.lastId||S?.worldEvent?.id||null,",
    'metadatos de comandantes y eventos',
)

game_path.write_text(game, encoding='utf-8')

# ---------- net.js ----------
def patch_net(source: str) -> str:
    source = replace_once(
        source,
        "    const allowedResearch = new Set(['age2', 'age3', 'wheelbarrow', 'masonry', 'forgedBlades', 'fletching', 'cavalry']);",
        "    const allowedResearch = new Set(['age2', 'age3', 'wheelbarrow', 'masonry', 'forgedBlades', 'fletching', 'cavalry']);\n    const allowedAbilities = new Set(['warCry', 'horizonEye']);\n    const allowedCamps = new Set(['northGuild', 'southGuild']);",
        'listas blancas nuevas',
    )
    source = replace_once(
        source,
        "      case 'research':\n        if (!entityId(input.buildingId) || !allowedResearch.has(input.researchId)) return null;\n        return { type: 'research', buildingId: input.buildingId, researchId: input.researchId };\n      case 'rally':",
        "      case 'research':\n        if (!entityId(input.buildingId) || !allowedResearch.has(input.researchId)) return null;\n        return { type: 'research', buildingId: input.buildingId, researchId: input.researchId };\n      case 'ability':\n        if (!entityId(input.kingId) || !allowedAbilities.has(input.abilityId) || !worldX(input.x) || !worldY(input.y)) return null;\n        return { type: 'ability', abilityId: input.abilityId, kingId: input.kingId, x: Number(input.x), y: Number(input.y) };\n      case 'hireMercenaries':\n        if (!entityId(input.kingId) || !allowedCamps.has(input.campId)) return null;\n        return { type: 'hireMercenaries', campId: input.campId, kingId: input.kingId };\n      case 'rally':",
        'contrato P2P de comandantes',
    )
    return source

patch('rey/net.js', patch_net)

# ---------- index/style ----------
def patch_index(source: str) -> str:
    source = replace_once(source, "      <div class=\"hint\">Derriba el castillo enemigo o controla dos de los tres Bastiones durante 75 segundos para proclamar supremacía.</div>", "      <div class=\"hint\">Derriba el castillo, proclama supremacía o gira la batalla con habilidades de comandante, contratos mercenarios y eventos mundiales.</div>", 'hint de campaña')
    source = replace_once(source, "    <div class=\"stat objectives\" id=\"objectiveInfo\">BASTIONES 0/3</div>\n    <div class=\"stat\" id=\"enemyInfo\"></div>", "    <div class=\"stat objectives\" id=\"objectiveInfo\">BASTIONES 0/3</div>\n    <div class=\"stat event\" id=\"eventInfo\">MUNDO ESTABLE</div>\n    <div class=\"stat\" id=\"enemyInfo\"></div>", 'HUD de evento')
    source = replace_once(source, "Bastiones → controla 2 durante 75s<br>F flow field · G niebla de guerra", "Bastiones → controla 2 durante 75s<br>Rey → habilidad y contratos mercenarios<br>Eventos → aviso global antes de activarse<br>F flow field · G niebla de guerra", 'controles de comandantes')
    return source

patch('rey/index.html', patch_index)


def patch_style(source: str) -> str:
    return source + """

/* Comandantes, mercenarios y eventos */
#hud .event{color:#f4c8ff;font-size:16px;max-width:min(42vw,560px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
button.cmd.commander{border-color:#a469d4;background:linear-gradient(135deg,#251331,#0c1a13)}
button.cmd.mercenary{border-color:#8b6a3b;background:linear-gradient(135deg,#261b0d,#0c1a13)}
@media(max-width:980px){#hud .event{order:7;width:100%;max-width:none;font-size:14px}}
"""

patch('rey/style.css', patch_style)

# ---------- Crónica ----------
def patch_chronicle(source: str) -> str:
    source = replace_once(source, "      supremacyWins: history.filter((entry) => entry.result === 'victory' && entry.victoryReason === 'supremacy').length,", "      supremacyWins: history.filter((entry) => entry.result === 'victory' && entry.victoryReason === 'supremacy').length,\n      commanderUses: history.reduce((sum, entry) => sum + (entry.commanderUses || 0), 0),\n      mercenaries: history.reduce((sum, entry) => sum + (entry.mercenariesHired || 0), 0),", 'estadísticas dinámicas')
    source = replace_once(source, "    appendStat(statsContainer, 'supremacías', stats.supremacyWins);\n    appendStat(statsContainer, 'duración media', formatDuration(stats.averageMs));", "    appendStat(statsContainer, 'supremacías', stats.supremacyWins);\n    appendStat(statsContainer, 'poderes usados', stats.commanderUses);\n    appendStat(statsContainer, 'mercenarios', stats.mercenaries);\n    appendStat(statsContainer, 'duración media', formatDuration(stats.averageMs));", 'panel dinámico')
    source = replace_once(source, "      details.textContent = `${sideName(entry.side)} · ${factionName(entry.side)} · ${modeName(entry.mode)} · ${difficultyName(entry.difficulty)} · ${victoryReasonName(entry.victoryReason)} · Edad ${entry.finalAge||1} · ${formatDuration(entry.durationMs)}`;", "      details.textContent = `${sideName(entry.side)} · ${factionName(entry.side)} · ${modeName(entry.mode)} · ${difficultyName(entry.difficulty)} · ${victoryReasonName(entry.victoryReason)} · 👑${entry.commanderUses||0} · ⚔${entry.mercenariesHired||0} · Edad ${entry.finalAge||1} · ${formatDuration(entry.durationMs)}`;", 'detalle de comandante')
    source = replace_once(source, "    appendStat(grid, 'bastiones', entry.finalObjectives||0);\n    appendStat(grid, 'racha', entry.result === 'victory' ? streak : 0);", "    appendStat(grid, 'bastiones', entry.finalObjectives||0);\n    appendStat(grid, 'poderes', entry.commanderUses||0);\n    appendStat(grid, 'mercenarios', entry.mercenariesHired||0);\n    appendStat(grid, 'eventos', entry.worldEvents||0);\n    appendStat(grid, 'racha', entry.result === 'victory' ? streak : 0);", 'resumen dinámico')
    source = replace_once(source, "      finalDominance: meta.dominance || 0,\n      finishedAt: Date.now(),", "      finalDominance: meta.dominance || 0,\n      commanderUses: meta.commanderUses || 0,\n      mercenariesHired: meta.mercenariesHired || 0,\n      worldEvents: meta.worldEvents || 0,\n      lastWorldEvent: meta.lastWorldEvent || null,\n      finishedAt: Date.now(),", 'metadatos finales dinámicos')
    return source

patch('rey/chronicle.js', patch_chronicle)

patch('rey/sw.js', lambda source: replace_once(source, "const CACHE_NAME = 'reinos-asimetricos-v4';", "const CACHE_NAME = 'reinos-comandantes-v5';", 'caché v5'))

# ---------- README y validación ----------
def patch_readme(source: str) -> str:
    return source + """

## Comandantes y Eventos del Mapa

Los Reyes disponen de habilidades activas desde la Edad de Fortaleza. León activa **Rugido de Guerra** para potenciar temporalmente a las tropas cercanas; Nelson utiliza **Ojo del Horizonte** para revelar una región amplia incluso durante Niebla Negra. Ambas habilidades tienen enfriamiento, se validan en el host y la IA usa las mismas reglas.

Dos campamentos neutrales permiten contratar Guardias Mercenarias. El Rey debe acercarse físicamente, pagar el contrato y disponer de población. Los campamentos tienen su propio enfriamiento y el Mercado de Guerra modifica temporalmente precio y disponibilidad.

El mundo alterna entre Tiempo de Abundancia, Mercado de Guerra y Niebla Negra. Cada evento se anuncia 12 segundos antes, se sincroniza por snapshot y altera reglas concretas sin entregar victoria automática.
"""

patch('README.md', patch_readme)


def patch_validator(source: str) -> str:
    source = replace_once(source, "for (const marker of ['allowedResearch', \"case 'research'\"]) {", "for (const marker of ['allowedResearch', \"case 'research'\", 'allowedAbilities', 'allowedCamps', \"case 'ability'\", \"case 'hireMercenaries'\"]) {", 'validación P2P extendida')
    source = replace_once(source, "for (const id of ['difficultySelect', 'ageInfo', 'factionInfo', 'objectiveInfo']) {", "for (const id of ['difficultySelect', 'ageInfo', 'factionInfo', 'objectiveInfo', 'eventInfo']) {", 'ID de evento')
    source = replace_once(source, "if (!sw.includes('reinos-asimetricos-v4')) throw new Error('La PWA no renovó su caché para Reinos Asimétricos');", "if (!sw.includes('reinos-comandantes-v5')) throw new Error('La PWA no renovó su caché para Comandantes y Eventos');", 'caché v5 validada')
    source = replace_once(source, "console.log('Validación estática, salas, crónica, Era de Conquista y Reinos Asimétricos completadas.');", "for (const marker of ['const COMMANDER_ABILITIES =', 'MERCENARY_CAMP_DEFS', 'useCommanderAbility', 'hireMercenaries', 'stepWorldEvents(dt)', 'WORLD_EVENT_WARNING', 'AI_COMMANDER_USAGE', 'CLIENT_WORLD_ANNOUNCEMENT', 'mercenaryCamps:G.mercenaryCamps']) {\n  if (!game.includes(marker)) throw new Error(`Comandantes y Eventos incompleto: falta ${marker}`);\n}\nfor (const marker of ['commanderUses', 'mercenariesHired', 'worldEvents']) {\n  if (!chronicle.includes(marker)) throw new Error(`Crónica de comandantes incompleta: falta ${marker}`);\n}\nif (game.includes('CHEAT_CODE') || game.includes('tryCheat')) throw new Error('El código secreto antiguo sigue activo después de oficializar habilidades');\n\nconsole.log('Validación estática, salas, crónica, conquista, asimetría, comandantes y eventos completadas.');", 'validación de fase dinámica')
    return source

patch('scripts/validate.mjs', patch_validator)

print('Transformación Comandantes y Eventos aplicada')
