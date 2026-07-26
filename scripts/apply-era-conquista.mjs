import { readFile, writeFile } from 'node:fs/promises';

function replaceOnce(source, search, replacement, label) {
  const next = source.replace(search, replacement);
  if (next === source) throw new Error(`No se encontró el punto de inserción: ${label}`);
  return next;
}

async function patch(path, transform) {
  const source = await readFile(path, 'utf8');
  const next = transform(source);
  if (next === source) throw new Error(`${path} no recibió cambios`);
  await writeFile(path, next);
}

await patch('rey/game.js', (initial) => {
  if (initial.includes('const AGE_DEFS =')) throw new Error('Era de Conquista ya fue aplicada');
  let source = initial;

  const conquestConfig = `const AGE_DEFS = {
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

`;
  source = replaceOnce(source, 'const COLOR = {', `${conquestConfig}const COLOR = {`, 'configuración de conquista');
  source = replaceOnce(source, "let running = false;", "let running = false;\nlet aiDifficulty = 'warrior';", 'dificultad global');
  source = replaceOnce(
    source,
    "      red:  {g:200, w:200, pop:0, cap:10},\n      blue: {g:200, w:200, pop:0, cap:10},",
    "      red:  {g:200, w:200, pop:0, cap:10, age:1, techs:{}, research:null},\n      blue: {g:200, w:200, pop:0, cap:10, age:1, techs:{}, research:null},",
    'estado de edades',
  );

  const conquestFunctions = `function sideState(side){ return G && G.res ? G.res[side] : null; }
function aiProfile(){ return AI_PROFILES[aiDifficulty] || AI_PROFILES.warrior; }
function isAiSide(side){ return mode==='sp' && side===enemySide; }
function hasTech(side,id){ const r=sideState(side); return !!(r && r.techs && r.techs[id]); }
function ageOf(side){ const r=sideState(side); return r && r.age ? r.age : 1; }
function canTrainUnit(side,unit){ return ageOf(side) >= (UNIT_AGE[unit] || 1); }
function canBuildKind(side,kind){ return ageOf(side) >= (BUILDING_AGE[kind] || 1); }

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
  if(isAiSide(e.side)) value*=aiProfile().combat;
  return value;
}
function rangeFor(e){
  let value=DEFS[e.kind].range || 0;
  if(hasTech(e.side,'fletching') && ['archer','tower'].includes(e.kind)) value+=20;
  return value;
}
function speedFor(e){
  let value=DEFS[e.kind].speed || 0;
  if(e.kind==='knight' && hasTech(e.side,'cavalry')) value*=1.18;
  return value;
}
function gatherRateFor(e){
  let value=DEFS[e.kind].gather || 0;
  if(hasTech(e.side,'wheelbarrow')) value*=1.25;
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
  if(side===mySide || mode==='sp') toast(`⚙ ${COLOR[side].name}: ${message}`);
}
function stepResearch(dt){
  for(const side of ['red','blue']){
    const r=sideState(side);
    if(!r || !r.research) continue;
    r.research.t-=dt;
    if(r.research.t<=0) completeResearch(side,r.research.id);
  }
}

`;
  source = replaceOnce(source, 'function nid() { return G.nextId++; }\n\n', `function nid() { return G.nextId++; }\n\n${conquestFunctions}`, 'funciones de conquista');

  source = replaceOnce(
    source,
    "  const d = DEFS[kind];\n  const e = {\n    id: nid(), side, kind, x, y,\n    hp: constructed ? d.hp : Math.max(1, Math.round(d.hp*0.08)),\n    maxHp: d.hp,",
    "  const d = DEFS[kind];\n  const maxHp=maxHpFor(side,kind);\n  const e = {\n    id: nid(), side, kind, x, y,\n    hp: constructed ? maxHp : Math.max(1, Math.round(maxHp*0.08)),\n    maxHp,",
    'vida mejorada al crear',
  );

  source = replaceOnce(
    source,
    "  G = freshState();\n  TERRAIN.init();",
    "  G = freshState();\n  AI.t=0; AI.lastBuild=0;\n  if(mode==='sp'){\n    const profile=aiProfile();\n    G.res[enemySide].g+=profile.startBonus;\n    G.res[enemySide].w+=profile.startBonus;\n  }\n  TERRAIN.init();",
    'bonificación inicial de IA',
  );

  source = replaceOnce(
    source,
    "    G.res[side].cap = Math.min(60, cap);",
    "    G.res[side].cap = Math.min(ageOf(side)>=3?80:60, cap);",
    'tope poblacional por edad',
  );

  source = replaceOnce(
    source,
    "      if(!COST[key]||!COST[key].build) break;\n      if(!canAfford(side,key)) break;",
    "      if(!COST[key]||!COST[key].build) break;\n      if(!canBuildKind(side,key)) break;\n      if(!canAfford(side,key)) break;",
    'bloqueo de edificios por edad',
  );
  source = replaceOnce(
    source,
    "      const c=COST[cmd.unit];\n      if(!c||c.from!==b.kind) break;",
    "      const c=COST[cmd.unit];\n      if(!c||c.from!==b.kind||!canTrainUnit(side,cmd.unit)) break;",
    'bloqueo de unidades por edad',
  );
  source = replaceOnce(
    source,
    "    case 'rally': {",
    "    case 'research': {\n      const b=entById(cmd.buildingId);\n      startResearch(side,cmd.researchId,b);\n      break; }\n    case 'rally': {",
    'comando de investigación',
  );

  source = replaceOnce(
    source,
    "        if(r<0.12) this.set(cx,cy,1,2.5);       // barro\n        else if(r<0.04) this.set(cx,cy,2,255);   // agua (menor probabilidad)",
    "        if(r<0.04) this.set(cx,cy,2,255);       // agua\n        else if(r<0.16) this.set(cx,cy,1,2.5);  // barro",
    'probabilidad de agua',
  );

  source = replaceOnce(source, "  G.time += dt; G.tick++;", "  G.time += dt; G.tick++;\n  stepResearch(dt);", 'progreso de investigación');

  source = replaceOnce(
    source,
    "      const d=DEFS[e.kind];\n      if(d.range){\n        e.cd-=dt;\n        let tgt=entById(e.targetId);\n        if(!tgt||tgt.hp<=0||dist(e.x,e.y,tgt.x,tgt.y)>d.range){ tgt=nearestEnemy(e.side,e.x,e.y,d.range); e.targetId=tgt?tgt.id:0; }\n        if(tgt&&e.cd<=0){ shoot(e,tgt,d.atk,true); e.cd=d.cd; }\n      }",
    "      const d=DEFS[e.kind], range=rangeFor(e);\n      if(range){\n        e.cd-=dt;\n        let tgt=entById(e.targetId);\n        if(!tgt||tgt.hp<=0||dist(e.x,e.y,tgt.x,tgt.y)>range){ tgt=nearestEnemy(e.side,e.x,e.y,range); e.targetId=tgt?tgt.id:0; }\n        if(tgt&&e.cd<=0){ shoot(e,tgt,attackFor(e),true); e.cd=d.cd; }\n      }",
    'mejoras defensivas',
  );

  source = replaceOnce(
    source,
    "    const reach=d.range+DEFS[tgt.kind].r;",
    "    const reach=rangeFor(e)+DEFS[tgt.kind].r;",
    'alcance dinámico',
  );
  source = replaceOnce(
    source,
    "        const atk=d.atk*(e.atkMul||1);",
    "        const atk=attackFor(e)*(e.atkMul||1);",
    'ataque dinámico',
  );
  source = replaceOnce(
    source,
    "    if(e.carry>=d.carry){",
    "    const carryLimit=carryFor(e);\n    if(e.carry>=carryLimit){",
    'capacidad dinámica',
  );
  source = replaceOnce(
    source,
    "      const amt=Math.min(d.gather*dt, n.amount, d.carry-e.carry);",
    "      const amt=Math.min(gatherRateFor(e)*dt, n.amount, carryLimit-e.carry);",
    'recolección dinámica',
  );
  source = replaceOnce(
    source,
    "  const sp = d.speed * (e.spdMul || 1) * dt;",
    "  const sp = speedFor(e) * (e.spdMul || 1) * dt;",
    'velocidad dinámica',
  );

  const aiSection = `// ---------- IA (enemigo en single player) ----------
const AI = { t:0, lastBuild:0 };
function aiTryResearch(side,castle,barracks,profile){
  const r=sideState(side); if(!r || r.research) return;
  if(r.age===1 && G.time>=profile.age2At){ startResearch(side,'age2',castle); return; }
  if(r.age===2 && G.time>=profile.age3At){ startResearch(side,'age3',castle); return; }
  const priorities=r.age>=3
    ? ['cavalry','forgedBlades','fletching','masonry','wheelbarrow']
    : r.age>=2 ? ['forgedBlades','fletching','masonry','wheelbarrow'] : ['wheelbarrow'];
  for(const id of priorities){
    const def=RESEARCH[id];
    const building=def.from==='castle'?castle:barracks[0];
    if(building && startResearch(side,id,building)) return;
  }
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

  if(vills.length<profile.villagers && castle.queue.length<profile.queueDepth && canAfford(side,'villager',1)){
    applyCommand({type:'train', buildingId:castle.id, unit:'villager'}, side);
  }
  if(r.pop >= r.cap-2 && r.cap<(r.age>=3?80:60) && canAfford(side,'house') && AI.t-AI.lastBuild>2.5){
    aiBuild(side, castle, 'house'); AI.lastBuild=AI.t;
  }
  if(barracks.length===0 && r.w>=150 && vills.length>=5 && AI.t-AI.lastBuild>3){
    aiBuild(side, castle, 'barracks'); AI.lastBuild=AI.t;
  }
  if(r.age>=2 && towers.length<profile.towers && barracks.length>0 && canAfford(side,'tower') && AI.t-AI.lastBuild>5){
    aiBuild(side, castle, 'tower'); AI.lastBuild=AI.t;
  }

  aiTryResearch(side,castle,barracks,profile);

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

  const threshold = profile.attackBase + Math.floor(G.time/profile.attackGrowth);
  const enemyCastle = G.ents.find(e=>e.side===mySide && e.kind==='castle');
  if(enemyCastle && army.length>=threshold){
    const free = army.filter(u=>!u.order || u.order.type==='move' || (u.order.type==='attackmove'&&!entById(u.targetId)));
    for(const u of free){ u.order={type:'attackmove', x:enemyCastle.x, y:enemyCastle.y}; u.tx=enemyCastle.x; u.ty=enemyCastle.y; u.moving=true; }
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
//  RENDER + INPUT`;
  source = replaceOnce(
    source,
    /\/\/ ---------- IA \(enemigo en single player\) ----------[\s\S]*?\/\/ ============================================================\n\/\/  RENDER \+ INPUT/,
    aiSection,
    'IA por dificultad',
  );

  source = replaceOnce(
    source,
    "  setText('pop', r.pop+'/'+r.cap);\n  const er=S.res[enemySide];",
    "  setText('pop', r.pop+'/'+r.cap);\n  const ageName=AGE_DEFS[r.age||1].name;\n  const researchText=r.research?` · ⚙ ${RESEARCH[r.research.id].name} ${Math.max(0,Math.ceil(r.research.t))}s`:'';\n  setText('ageInfo', ageName+researchText);\n  const er=S.res[enemySide];",
    'HUD de edades',
  );
  source = replaceOnce(
    source,
    "  setText('enemyInfo', `${COLOR[enemySide].name}  🪙${Math.floor(er.g)} 🪵${Math.floor(er.w)} 👥${er.pop}`);",
    "  setText('enemyInfo', `${COLOR[enemySide].name} · ${AGE_DEFS[er.age||1].name}  🪙${Math.floor(er.g)} 🪵${Math.floor(er.w)} 👥${er.pop}`);",
    'edad enemiga',
  );

  source = replaceOnce(
    source,
    "      if(e.kind==='castle') addTrainBtn(panel,e,'villager','Aldeano','H');\n      if(e.kind==='barracks'){ addTrainBtn(panel,e,'swordsman','Espadachín','A'); addTrainBtn(panel,e,'archer','Arquero','S'); addTrainBtn(panel,e,'knight','Caballero','D'); }",
    "      if(e.kind==='castle'){\n        addTrainBtn(panel,e,'villager','Aldeano','H');\n        addResearchBtn(panel,e,'wheelbarrow');\n        addResearchBtn(panel,e,'masonry');\n        addResearchBtn(panel,e,'age2');\n        addResearchBtn(panel,e,'age3');\n      }\n      if(e.kind==='barracks'){\n        addTrainBtn(panel,e,'swordsman','Espadachín','A');\n        addTrainBtn(panel,e,'archer','Arquero','S');\n        addTrainBtn(panel,e,'knight','Caballero','D');\n        addResearchBtn(panel,e,'forgedBlades');\n        addResearchBtn(panel,e,'fletching');\n        addResearchBtn(panel,e,'cavalry');\n      }",
    'botones de investigación',
  );

  source = replaceOnce(
    source,
    "function addTrainBtn(panel,e,unit,label,hk){\n  const c=COST[unit];\n  const b=btn(label, `🪙${c.g} ${c.w?'🪵'+c.w:''}`);\n  b.onclick=()=>issue({type:'train', buildingId:e.id, unit});\n  panel.appendChild(b);\n}",
    "function addTrainBtn(panel,e,unit,label,hk){\n  const c=COST[unit], S=renderState(), r=S.res[mySide], required=UNIT_AGE[unit]||1;\n  const locked=(r.age||1)<required;\n  const b=btn(locked?`🔒 ${label}`:label, locked?`requiere ${AGE_DEFS[required].name}`:`🪙${c.g} ${c.w?'🪵'+c.w:''}`);\n  b.disabled=locked;\n  b.onclick=()=>issue({type:'train', buildingId:e.id, unit});\n  panel.appendChild(b);\n}\nfunction addResearchBtn(panel,e,id){\n  const def=RESEARCH[id], S=renderState(), r=S.res[mySide];\n  if(!def || def.from!==e.kind) return;\n  if(def.toAge && r.age!==def.age) return;\n  if(!def.toAge && (r.age<def.age || r.techs?.[id])) return;\n  const active=r.research;\n  const researching=active && active.id===id;\n  const busy=!!active;\n  const affordable=r.g>=def.g && r.w>=def.w;\n  const label=researching?`⚙ ${def.name}`:def.name;\n  const sub=researching?`${Math.max(0,Math.ceil(active.t))}s`:`🪙${def.g} 🪵${def.w} · ${def.t}s${def.note?' · '+def.note:''}`;\n  const b=btn(label,sub);\n  b.classList.add('research');\n  b.disabled=busy||!affordable;\n  b.onclick=()=>issue({type:'research', buildingId:e.id, researchId:id});\n  panel.appendChild(b);\n}",
    'controles de tecnologías',
  );

  source = replaceOnce(
    source,
    "function startGame(opts){\n  mode=opts.mode; mySide=opts.side; enemySide = mySide==='red'?'blue':'red';",
    "function startGame(opts){\n  mode=opts.mode; mySide=opts.side; enemySide = mySide==='red'?'blue':'red';\n  aiDifficulty=AI_PROFILES[opts.difficulty]?opts.difficulty:'warrior';",
    'inicio con dificultad',
  );
  source = replaceOnce(
    source,
    "  startSolo(side){ startGame({mode:'sp', side}); },",
    "  startSolo(side,difficulty='warrior'){ startGame({mode:'sp', side, difficulty}); },\n\n  getMatchMeta(){\n    const S=renderState();\n    return {mode, side:mySide, difficulty:mode==='sp'?aiDifficulty:'human', age:S?.res?.[mySide]?.age||1};\n  },",
    'API pública de partida',
  );

  source = replaceOnce(
    source,
    "  if(mySide!=='red' || !G || !running || G.winner) return;",
    "  if(mode!=='sp' || mySide!=='red' || !G || !running || G.winner) return;",
    'secreto solo un jugador',
  );

  return source;
});

await patch('rey/net.js', (source) => {
  source = replaceOnce(
    source,
    "    const allowedBuildings = new Set(['house', 'barracks', 'tower']);",
    "    const allowedBuildings = new Set(['house', 'barracks', 'tower']);\n    const allowedResearch = new Set(['age2', 'age3', 'wheelbarrow', 'masonry', 'forgedBlades', 'fletching', 'cavalry']);",
    'investigaciones permitidas',
  );
  source = replaceOnce(
    source,
    "      case 'rally':",
    "      case 'research':\n        if (!entityId(input.buildingId) || !allowedResearch.has(input.researchId)) return null;\n        return { type: 'research', buildingId: input.buildingId, researchId: input.researchId };\n      case 'rally':",
    'validación de investigación',
  );
  return source;
});

await patch('rey/index.html', (source) => {
  source = replaceOnce(
    source,
    '      <h2>UN JUGADOR</h2>\n      <div class="row">',
    `      <h2>UN JUGADOR</h2>
      <div class="difficulty-picker">
        <label for="difficultySelect">DIFICULTAD DE LA IA</label>
        <select id="difficultySelect">
          <option value="explorer">Explorador · aprende y respira</option>
          <option value="warrior" selected>Guerrero · batalla equilibrada</option>
          <option value="conqueror">Conquistador · economía y ataques feroces</option>
        </select>
      </div>
      <div class="row">`,
    'selector de dificultad',
  );
  source = replaceOnce(source, "REINOS.startSolo('red')", "REINOS.startSolo('red', document.getElementById('difficultySelect').value)", 'botón León');
  source = replaceOnce(source, "REINOS.startSolo('blue')", "REINOS.startSolo('blue', document.getElementById('difficultySelect').value)", 'botón Nelson');
  source = replaceOnce(
    source,
    '    <div class="stat" id="p1name">LEÓN</div>',
    '    <div class="stat" id="p1name">LEÓN</div>\n    <div class="stat age" id="ageInfo">EDAD DE ALDEA</div>',
    'edad en HUD',
  );
  source = replaceOnce(
    source,
    'Aldeano → Q casa · E cuartel · R torre<br>F flow field · G niebla de guerra',
    'Aldeano → Q casa · E cuartel · R torre<br>Castillo y cuartel → edades y tecnologías<br>F flow field · G niebla de guerra',
    'ayuda de tecnologías',
  );
  return source;
});

await patch('rey/style.css', (source) => `${source.trimEnd()}\n
.difficulty-picker{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:10px;margin:0 0 14px;padding:10px 12px;background:rgba(10,28,19,.72);border:1px solid var(--line);border-radius:5px}
.difficulty-picker label{color:var(--amber);font-family:'Press Start 2P',monospace;font-size:9px;line-height:1.5}
.difficulty-picker select{min-width:0;padding:9px 10px;color:var(--ink);background:#08140e;border:1px solid #33513f;border-radius:4px;font:18px 'VT323',monospace}
#hud .age{max-width:min(42vw,520px);overflow:hidden;color:#d9b65d;font-size:18px;text-overflow:ellipsis;white-space:nowrap}
button.cmd.research{border-color:#6b5a2f;background:linear-gradient(135deg,#15190e,#0c1a13)}
button.cmd:disabled{cursor:not-allowed;opacity:.48;filter:saturate(.45);transform:none!important;box-shadow:none!important}
@media(max-width:760px){.difficulty-picker{grid-template-columns:1fr}.difficulty-picker select{width:100%}#hud .age{order:5;width:100%;max-width:none;font-size:15px}}
`);

await patch('rey/app.js', (source) => replaceOnce(
  source,
  "    REINOS.startSolo = (side) => {\n      originalSolo(side);",
  "    REINOS.startSolo = (side, difficulty) => {\n      originalSolo(side, difficulty);",
  'propagación de dificultad en app',
));

await patch('rey/chronicle.js', (initial) => {
  let source=initial;
  source = replaceOnce(
    source,
    "  function modeName(mode) {\n    if (mode === 'host') return 'Duelo online · anfitrión';\n    if (mode === 'client') return 'Duelo online · invitado';\n    return 'Un jugador';\n  }",
    "  function modeName(mode) {\n    if (mode === 'host') return 'Duelo online · anfitrión';\n    if (mode === 'client') return 'Duelo online · invitado';\n    return 'Un jugador';\n  }\n\n  function difficultyName(value) {\n    if (value === 'explorer') return 'Explorador';\n    if (value === 'conqueror') return 'Conquistador';\n    if (value === 'human') return 'Rival humano';\n    return 'Guerrero';\n  }",
    'nombre de dificultad',
  );
  source = replaceOnce(
    source,
    "  function beginBattle(mode, side, room = null) {",
    "  function beginBattle(mode, side, room = null, difficulty = 'warrior') {",
    'firma de crónica',
  );
  source = replaceOnce(
    source,
    "      room: room || null,",
    "      room: room || null,\n      difficulty: mode === 'sp' ? difficulty : 'human',",
    'dificultad guardada',
  );
  source = replaceOnce(
    source,
    "      details.textContent = `${sideName(entry.side)} · ${modeName(entry.mode)} · ${formatDuration(entry.durationMs)}`;",
    "      details.textContent = `${sideName(entry.side)} · ${modeName(entry.mode)} · ${difficultyName(entry.difficulty)} · Edad ${entry.finalAge||1} · ${formatDuration(entry.durationMs)}`;",
    'detalle histórico',
  );
  source = replaceOnce(
    source,
    "    appendStat(grid, 'reino', sideName(entry.side));\n    appendStat(grid, 'racha', entry.result === 'victory' ? streak : 0);",
    "    appendStat(grid, 'reino', sideName(entry.side));\n    appendStat(grid, 'dificultad', difficultyName(entry.difficulty));\n    appendStat(grid, 'edad final', entry.finalAge||1);\n    appendStat(grid, 'racha', entry.result === 'victory' ? streak : 0);",
    'resumen de conquista',
  );
  source = replaceOnce(
    source,
    "    const entry = {\n      ...activeBattle,",
    "    const meta = typeof REINOS.getMatchMeta === 'function' ? REINOS.getMatchMeta() : {};\n    const entry = {\n      ...activeBattle,\n      difficulty: meta.difficulty || activeBattle.difficulty || 'warrior',\n      finalAge: meta.age || 1,",
    'metadatos finales',
  );
  source = replaceOnce(
    source,
    "    REINOS.startSolo = (side) => {\n      originalSolo(side);\n      beginBattle('sp', side);",
    "    REINOS.startSolo = (side, difficulty) => {\n      originalSolo(side, difficulty);\n      beginBattle('sp', side, null, difficulty);",
    'crónica con dificultad',
  );
  return source;
});

await patch('rey/sw.js', (source) => replaceOnce(source, "const CACHE_NAME = 'reinos-next-v2';", "const CACHE_NAME = 'reinos-conquista-v3';", 'versión PWA'));

await patch('README.md', (source) => `${source.trimEnd()}\n
## Era de Conquista

La progresión estratégica incluye tres edades, desbloqueos por época y tecnologías investigables desde castillo o cuartel. La IA ofrece perfiles Explorador, Guerrero y Conquistador que modifican economía, velocidad de decisión, composición, investigación y presión ofensiva. El multijugador mantiene al host como autoridad y valida también los comandos de investigación.

Desbloqueos principales:

- Edad de Aldea: aldeanos y espadachines.
- Edad de Fortaleza: arqueros, torres, mampostería, filos forjados y emplumado.
- Edad Imperial: caballeros, cría de guerra y población máxima ampliada.
`);

await patch('scripts/validate.mjs', (source) => replaceOnce(
  source,
  "console.log('Validación estática y contrato de salas de REINOS completados.');",
  `for (const marker of ['const AGE_DEFS =', 'const RESEARCH =', "case 'research'", 'stepResearch(dt)', 'getMatchMeta()']) {
  if (!game.includes(marker)) throw new Error(\`Era de Conquista incompleta en game.js: falta \${marker}\`);
}
for (const marker of ['allowedResearch', "case 'research'"]) {
  if (!net.includes(marker)) throw new Error(\`Contrato P2P de tecnologías incompleto: falta \${marker}\`);
}
for (const id of ['difficultySelect', 'ageInfo']) {
  if (!html.includes(\`id="\${id}"\`)) throw new Error(\`Falta la interfaz de conquista #\${id}\`);
}
const sw = await readFile('rey/sw.js', 'utf8');
if (!sw.includes('reinos-conquista-v3')) throw new Error('La PWA no renovó su caché para Era de Conquista');

console.log('Validación estática, salas, crónica y Era de Conquista completadas.');`,
  'validación de conquista',
));

console.log('Transformación Era de Conquista aplicada.');
