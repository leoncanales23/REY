from pathlib import Path


def replace_once(source, old, new, label):
    if new in source:
        return source
    if old not in source:
        raise RuntimeError(f'No se encontró el anclaje: {label}')
    return source.replace(old, new, 1)


def replace_section(source, start, end, replacement, label):
    if replacement.strip() in source:
        return source
    start_index = source.find(start)
    end_index = source.find(end, start_index + len(start))
    if start_index < 0 or end_index < 0:
        raise RuntimeError(f'No se encontró la sección: {label}')
    return source[:start_index] + replacement + source[end_index:]


# index.html
path = Path('rey/index.html')
source = path.read_text()
visual_section = '''        <section class="scenario-map-editor" aria-labelledby="scenarioMapTitle">
          <div class="scenario-map-heading">
            <h3 id="scenarioMapTitle">MAPA VISUAL</h3>
            <span id="scenarioPlacementCount">0/48 PIEZAS</span>
          </div>
          <div id="scenarioPalette" class="scenario-palette" aria-label="Paleta de piezas"></div>
          <div class="scenario-map-stage">
            <canvas id="scenarioMapCanvas" width="780" height="510" aria-label="Mapa editable de 2600 por 1700 unidades"></canvas>
            <div class="scenario-map-legend"><span class="red">LEÓN</span><span class="blue">NELSON</span><span class="neutral">RECURSOS</span></div>
          </div>
          <div class="scenario-map-actions">
            <button id="scenarioMapFromUnitsBtn" class="mini-btn" type="button">GENERAR FORMACIÓN</button>
            <button id="scenarioMapMirrorBtn" class="mini-btn" type="button">REFLEJAR RIVAL</button>
            <button id="scenarioMapClearBtn" class="mini-btn danger" type="button">LIMPIAR MAPA</button>
          </div>
          <p id="scenarioMapStatus" aria-live="polite"></p>
        </section>
'''
source = replace_once(
    source,
    '        </form>\n        <section class="scenario-library">',
    '        </form>\n' + visual_section + '        <section class="scenario-library">',
    'sección de mapa visual',
)
source = replace_once(
    source,
    '  <script src="net.js"></script>\n  <script src="game.js"></script>',
    '  <script src="net.js"></script>\n  <script src="determinism.js"></script>\n  <script src="game.js"></script>',
    'script de determinismo',
)
path.write_text(source)


# game.js
path = Path('rey/game.js')
source = path.read_text()
old_constants = '''const REPLAY_VERSION = 1;
const REPLAY_COMMAND_LIMIT = 6000;
const SCENARIO_DEFAULTS = Object.freeze({
  title:'Frontera sin Nombre', side:'red', difficulty:'warrior', age:2,
  gold:600, wood:500, victoryMode:'standard', holdSeconds:45, worldEvents:true,
  units:{swordsman:3,archer:2,knight:0}, seed:0,
});'''
new_constants = '''const REPLAY_VERSION = 2;
const REPLAY_ENGINE = 'reinos-cartografo-v8';
const REPLAY_COMMAND_LIMIT = 6000;
const SCENARIO_PLACEMENT_LIMIT = 48;
const SCENARIO_PLACEMENT_KINDS = new Set(['swordsman','archer','knight','tower','barracks','gold','wood']);
const SCENARIO_NEUTRAL_KINDS = new Set(['gold','wood']);
const SCENARIO_DEFAULTS = Object.freeze({
  title:'Frontera sin Nombre', side:'red', difficulty:'warrior', age:2,
  gold:600, wood:500, victoryMode:'standard', holdSeconds:45, worldEvents:true,
  units:{swordsman:3,archer:2,knight:0}, placements:[], seed:0,
});'''
source = replace_once(source, old_constants, new_constants, 'constantes del cartógrafo')
source = replace_once(source, 'let replaySpeed = 1;', 'let replaySpeed = 1;\nlet replayVerification = null;', 'estado de verificación')

normalize_scenario = '''function normalizeScenario(input){
  const source=input && typeof input==='object' ? input : {};
  const units=source.units && typeof source.units==='object' ? source.units : {};
  const victoryModes=new Set(['standard','castleOnly','crownHold']);
  const difficulties=new Set(Object.keys(AI_PROFILES));
  const placements=[];
  for(const item of (Array.isArray(source.placements)?source.placements:[]).slice(0,SCENARIO_PLACEMENT_LIMIT)){
    if(!item || typeof item!=='object' || !SCENARIO_PLACEMENT_KINDS.has(item.kind)) continue;
    const neutral=SCENARIO_NEUTRAL_KINDS.has(item.kind);
    const side=neutral?null:(item.side==='blue'?'blue':item.side==='red'?'red':null);
    if(!neutral && !side) continue;
    const x=boundedInt(item.x,80,MAP_W-80,0), y=boundedInt(item.y,80,MAP_H-80,0);
    if(!x || !y) continue;
    placements.push({kind:item.kind,side,x,y});
  }
  return {
    title:safeTitle(source.title,SCENARIO_DEFAULTS.title),
    side:source.side==='blue'?'blue':'red',
    difficulty:difficulties.has(source.difficulty)?source.difficulty:SCENARIO_DEFAULTS.difficulty,
    age:boundedInt(source.age,1,3,SCENARIO_DEFAULTS.age),
    gold:boundedInt(source.gold,0,3000,SCENARIO_DEFAULTS.gold),
    wood:boundedInt(source.wood,0,3000,SCENARIO_DEFAULTS.wood),
    victoryMode:victoryModes.has(source.victoryMode)?source.victoryMode:SCENARIO_DEFAULTS.victoryMode,
    holdSeconds:boundedInt(source.holdSeconds,20,120,SCENARIO_DEFAULTS.holdSeconds),
    worldEvents:source.worldEvents!==false,
    units:{
      swordsman:boundedInt(units.swordsman,0,12,SCENARIO_DEFAULTS.units.swordsman),
      archer:boundedInt(units.archer,0,12,SCENARIO_DEFAULTS.units.archer),
      knight:boundedInt(units.knight,0,6,SCENARIO_DEFAULTS.units.knight),
    },
    placements,
    seed:source.seed?normalizeSeed(source.seed):0,
  };
}
function stateChecksum(state=G){
  return globalThis.REINOS_DETERMINISM?.checksum?.(state)||null;
}
function verifyReplayChecksum(state){
  if(mode!=='replay' || !replayPlayback?.record) return null;
  const expected=replayPlayback.record.finalChecksum;
  const actual=stateChecksum(state);
  replayVerification={expected,actual,matched:!!expected&&!!actual&&expected===actual};
  // REPLAY_FINAL_CHECKSUM: la reproducción demuestra igualdad del estado canónico final.
  window.dispatchEvent(new CustomEvent('reinos:replay-verified',{detail:replayVerification}));
  return replayVerification;
}
'''
source = replace_section(source, 'function normalizeScenario(input){', 'function normalizeReplay(input){', normalize_scenario, 'normalización de escenario')
source = replace_once(source, "input.engine!=='reinos-lab-v7'", 'input.engine!==REPLAY_ENGINE', 'bloqueo de motor')
source = replace_once(source, "const finalTick=boundedInt(input.finalTick,1,1000000,0);\n  if(!finalTick) return null;", "const finalTick=boundedInt(input.finalTick,1,1000000,0);\n  const finalChecksum=typeof input.finalChecksum==='string'&&/^[0-9a-f]{8}$/.test(input.finalChecksum)?input.finalChecksum:null;\n  if(!finalTick || !finalChecksum) return null;", 'checksum importado')
source = source.replace("engine:'reinos-lab-v7'", 'engine:REPLAY_ENGINE')
source = replace_once(source, '    finalTick,\n    durationSeconds:', '    finalTick, finalChecksum,\n    durationSeconds:', 'checksum normalizado')
source = replace_once(source, "    scenario:currentScenario?{...currentScenario,units:{...currentScenario.units}}:null,", "    scenario:currentScenario?{...currentScenario,units:{...currentScenario.units},placements:(currentScenario.placements||[]).map((item)=>({...item}))}:null,", 'layout en captura')
source = replace_once(source, "  return {active,paused:replayPaused,speed:replaySpeed,title:replayPlayback?.record?.title||''};", "  return {active,paused:replayPaused,speed:replaySpeed,title:replayPlayback?.record?.title||'',verification:replayVerification};", 'estado de replay')
source = replace_once(source, "    finalTick:state.tick||0,\n    durationSeconds:", "    finalTick:state.tick||0,\n    finalChecksum:stateChecksum(state),\n    durationSeconds:", 'checksum al finalizar')
source = replace_once(source, '  G = freshState();\n  AI.t=0;', '  G = freshState();\n  ffRebuildT=0;\n  AI.t=0;', 'reinicio flow field')

scenario_block = '''function spawnScenarioForce(side,units){
  const list=[];
  for(let i=0;i<units.swordsman;i++) list.push('swordsman');
  for(let i=0;i<units.archer;i++) list.push('archer');
  for(let i=0;i<units.knight;i++) list.push('knight');
  spawnCampaignForce(side,list);
  ensureScenarioHousing(side);
}
function scenarioPointAllowed(item){
  const radius=['tower','barracks'].includes(item.kind)?DEFS[item.kind].r:SCENARIO_NEUTRAL_KINDS.has(item.kind)?(item.kind==='gold'?22:14):14;
  const castles=G.ents.filter((entity)=>entity.kind==='castle');
  if(castles.some((castle)=>dist(item.x,item.y,castle.x,castle.y)<radius+90)) return false;
  if(G.objectives.some((objective)=>dist(item.x,item.y,objective.x,objective.y)<radius+OBJECTIVE_RADIUS+8)) return false;
  if(G.mercenaryCamps.some((camp)=>dist(item.x,item.y,camp.x,camp.y)<radius+58)) return false;
  if(['tower','barracks','gold','wood'].includes(item.kind)) return validPlacement(item.x,item.y,radius);
  return !G.ents.some((entity)=>!entity.building&&dist(item.x,item.y,entity.x,entity.y)<DEFS[entity.kind].r+radius+2);
}
function ensureScenarioHousing(side){
  const population=G.ents.reduce((total,entity)=>total+(entity.side===side&&!entity.building&&!DEFS[entity.kind].hero?(entity.kind==='knight'?2:1):0),0);
  const existing=G.ents.filter((entity)=>entity.side===side&&entity.kind==='house').length;
  const needed=Math.max(0,Math.ceil((population-(10+existing*DEFS.house.pop))/DEFS.house.pop));
  const castle=G.ents.find((entity)=>entity.side===side&&entity.kind==='castle');
  if(!castle) return;
  const direction=side==='red'?1:-1;
  for(let index=0;index<needed;index++){
    const x=castle.x+direction*(110+(existing+index)*48), y=castle.y+170;
    if(validPlacement(x,y,DEFS.house.r)) spawn(side,'house',x,y,true);
  }
}
function applyScenarioPlacements(scenario){
  const layout=scenario.placements||[];
  if(!layout.length) return false;
  // VISUAL_SCENARIO_EDITOR_V2: cada pieza importada se valida otra vez dentro del motor.
  for(const item of layout){
    if(!scenarioPointAllowed(item)) continue;
    if(item.kind==='gold' || item.kind==='wood') addNode(item.kind,item.x,item.y,item.kind==='gold'?1200:320);
    else spawn(item.side,item.kind,item.x,item.y,true);
  }
  ensureScenarioHousing('red');
  ensureScenarioHousing('blue');
  return true;
}
function applyScenarioSetup(config){
  const scenario=normalizeScenario(config);
  currentScenario=scenario;
  G.scenario={...scenario,units:{...scenario.units},placements:(scenario.placements||[]).map((item)=>({...item})),hold:0,holdBySide:{red:0,blue:0},completed:false};
  const own=G.res[mySide];
  own.age=scenario.age; own.g=scenario.gold; own.w=scenario.wood;
  if(!applyScenarioPlacements(scenario)) spawnScenarioForce(mySide,scenario.units);
  if(!scenario.worldEvents){
    G.worldEvent.id=null; G.worldEvent.warning=null; G.worldEvent.t=0; G.worldEvent.warningT=0; G.worldEvent.nextAt=1000000000;
  }
  recalcPop();
  toast(`🗺 CARTÓGRAFO · ${scenario.title} · ${(scenario.placements||[]).length} piezas`);
}
'''
source = replace_section(source, 'function spawnScenarioForce(side,units){', 'function scenarioObjectiveText(state=activeState()){', scenario_block, 'aplicación del mapa visual')
source = replace_once(source, '    scenario:G.scenario?{...G.scenario,units:{...G.scenario.units}}:null, seed:G.seed,', '    scenario:G.scenario?{...G.scenario,units:{...G.scenario.units},placements:(G.scenario.placements||[]).map((item)=>({...item}))}:null, seed:G.seed,', 'layout serializado')
source = replace_once(source, '  replayPaused=false; replaySpeed=1;', '  replayPaused=false; replaySpeed=1; replayVerification=null;', 'reinicio de checksum')
source = replace_once(source, '  const campaignResult=finalizeCampaignOutcome(winner,state);', '''  const replayCheck=mode==='replay'?verifyReplayChecksum(state):null;
  if(replayCheck && !replayCheck.matched){
    document.getElementById('endTitle').textContent='REPETICIÓN INCOMPATIBLE';
    document.getElementById('endTitle').style.color='#ff6f6f';
    document.getElementById('endSub').textContent=`Checksum esperado ${replayCheck.expected} · reconstruido ${replayCheck.actual||'sin estado'}.`;
    document.getElementById('endScreen').style.display='flex'; emitReplayState(false); return;
  }
  const campaignResult=finalizeCampaignOutcome(winner,state);''', 'verificación al terminar')
source = replace_once(source, "  document.getElementById('endScreen').style.display='flex';\n  if(mode==='replay') emitReplayState(false);", "  if(replayCheck?.matched) document.getElementById('endSub').textContent+=` · ✓ CHECKSUM ${replayCheck.actual}`;\n  document.getElementById('endScreen').style.display='flex';\n  if(mode==='replay') emitReplayState(false);", 'mensaje de checksum')

probe = '''function runDeterminismTrial(seed){
  mode='sp'; mySide='red'; enemySide='blue'; aiDifficulty='warrior';
  campaignMissionId=null; campaignOutcomeSent=false; currentScenario=null;
  replayCapture=null; replayPlayback=null; replaySourceMode=null; replayVerification=null;
  resetSimulationRng(seed); initMap();
  applyScenarioSetup(normalizeScenario({
    title:'Sonda determinista',side:'red',difficulty:'warrior',age:2,gold:700,wood:600,
    victoryMode:'standard',worldEvents:true,units:{swordsman:0,archer:0,knight:0},seed,
    placements:[
      {kind:'swordsman',side:'red',x:620,y:760},
      {kind:'archer',side:'red',x:660,y:810},
      {kind:'swordsman',side:'blue',x:1980,y:760},
      {kind:'archer',side:'blue',x:1940,y:810},
      {kind:'gold',x:1050,y:620},{kind:'wood',x:1050,y:1080},
    ],
  }));
  const redArmy=G.ents.filter((entity)=>entity.side==='red'&&!entity.building&&entity.kind!=='villager'&&entity.kind!=='king');
  for(const entity of redArmy) applyCommand({type:'attackmove',ids:[entity.id],x:MAP_W/2,y:MAP_H/2},'red');
  for(let index=0;index<360 && !G.winner;index++){
    if(index===80){
      const king=G.ents.find((entity)=>entity.side==='red'&&entity.kind==='king');
      if(king) useCommanderAbility('red','warCry',king.id,king.x,king.y);
    }
    step(SIM_DT);
  }
  return {checksum:stateChecksum(G),tick:G.tick,winner:G.winner};
}
function runDeterminismProbe(){
  const originalPlay=SFX.play; SFX.play=()=>{};
  try{
    const first=runDeterminismTrial(0x51a7c0de);
    const second=runDeterminismTrial(0x51a7c0de);
    const different=runDeterminismTrial(0x51a7c0df);
    const ok=!!first.checksum&&first.checksum===second.checksum&&first.checksum!==different.checksum;
    return {ok,first,second,different,engine:REPLAY_ENGINE};
  } finally {
    SFX.play=originalPlay; running=false;
  }
}

'''
source = replace_once(source, '// Exponer a la UI (index.html)', probe + '// Exponer a la UI (index.html)', 'sonda determinista')
source = replace_once(source, "  getScenarioDefaults(){ return normalizeScenario(SCENARIO_DEFAULTS); },", "  getScenarioDefaults(){ return normalizeScenario(SCENARIO_DEFAULTS); },\n  getStateChecksum(){ return stateChecksum(renderState()); },\n  runDeterminismProbe(){ return runDeterminismProbe(); },", 'API de checksum')
self_test = '''
if(new URLSearchParams(location.search).get('determinism-test')==='1'){
  setTimeout(()=>{
    const output=document.createElement('pre'); output.id='determinismProbe';
    try{
      const result=window.REINOS.runDeterminismProbe();
      document.documentElement.dataset.determinism=result.ok?'pass':'fail';
      output.textContent=JSON.stringify(result);
    } catch(error){
      document.documentElement.dataset.determinism='fail';
      output.textContent=JSON.stringify({ok:false,error:String(error?.stack||error)});
    }
    document.body.appendChild(output);
  },0);
}

'''
source = replace_once(source, '// init\nresize();', self_test + '// init\nresize();', 'arranque de prueba E2E')
path.write_text(source)


# replay.js
path = Path('rey/replay.js')
source = path.read_text()
source = replace_once(source, "      if (active) info.textContent = `REPETICIÓN · ${state.title || 'BATALLA'} · ${state.paused ? 'PAUSA' : `${state.speed || 1}×`}`;", "      if (active) {\n        const verified=state.verification?.matched?` · ✓ ${state.verification.actual}`:'';\n        info.textContent = `REPETICIÓN · ${state.title || 'BATALLA'} · ${state.paused ? 'PAUSA' : `${state.speed || 1}×`}${verified}`;\n      }", 'HUD de checksum')
source = replace_once(source, "  window.addEventListener('reinos:replay-state', (event) => updateReplayControls(event.detail || {}));", "  window.addEventListener('reinos:replay-state', (event) => updateReplayControls(event.detail || {}));\n  window.addEventListener('reinos:replay-verified', (event) => updateReplayControls({active:true,speed:1,title:'VERIFICADA',verification:event.detail}));", 'evento de checksum')
path.write_text(source)


# service worker
path = Path('rey/sw.js')
source = path.read_text()
source = replace_once(source, "const CACHE_NAME = 'reinos-laboratorio-v7';", "const CACHE_NAME = 'reinos-cartografo-v8';", 'caché v8')
source = replace_once(source, "'./scenario.css', './replay.css', './net.js', './game.js'", "'./scenario.css', './replay.css', './net.js', './determinism.js', './game.js'", 'determinism en app shell')
path.write_text(source)


# validator
path = Path('scripts/validate.mjs')
source = path.read_text()
source = replace_once(source, "  'rey/net.js',\n  'rey/game.js',", "  'rey/net.js',\n  'rey/determinism.js',\n  'rey/game.js',", 'archivo determinism requerido')
source = replace_once(source, "  'rey/icons/reinos-512.png',\n];", "  'rey/icons/reinos-512.png',\n  'scripts/test-determinism.mjs',\n  'scripts/browser-determinism.mjs',\n];", 'scripts de prueba requeridos')
source = replace_once(source, "const net = await readFile('rey/net.js', 'utf8');\nconst chronicle", "const net = await readFile('rey/net.js', 'utf8');\nconst determinism = await readFile('rey/determinism.js', 'utf8');\nconst workflow = await readFile('.github/workflows/validate.yml', 'utf8');\nconst chronicle", 'lecturas de determinismo')
source = replace_once(source, "['style.css', 'chronicle.css', 'campaign.css', 'scenario.css', 'replay.css', 'net.js', 'game.js'", "['style.css', 'chronicle.css', 'campaign.css', 'scenario.css', 'replay.css', 'net.js', 'determinism.js', 'game.js'", 'referencia HTML determinism')
source = replace_once(source, "if (!sw.includes('reinos-laboratorio-v7')) throw new Error('La PWA no renovó su caché para el Laboratorio');", "if (!sw.includes('reinos-cartografo-v8')) throw new Error('La PWA no renovó su caché para Cartógrafo v2');", 'validador caché v8')
source = replace_once(source, "for (const id of ['openScenarioBtn','scenarioDialog','scenarioInfo','openReplayBtn'", "for (const id of ['openScenarioBtn','scenarioDialog','scenarioInfo','scenarioMapCanvas','scenarioPalette','scenarioPlacementCount','scenarioMapFromUnitsBtn','scenarioMapMirrorBtn','scenarioMapClearBtn','openReplayBtn'", 'IDs visuales')
source = replace_once(source, "for (const marker of ['SCENARIO_RULES_LAB','CROWN_HOLD_EXCLUSIVE','CASTILLOS INMORTALES','normalizeScenario'", "for (const marker of ['SCENARIO_RULES_LAB','VISUAL_SCENARIO_EDITOR_V2','SCENARIO_PLACEMENT_LIMIT','applyScenarioPlacements','CROWN_HOLD_EXCLUSIVE','CASTILLOS INMORTALES','normalizeScenario'", 'marcadores de cartógrafo')
source = replace_once(source, "for (const marker of ['reinos.scenarios.v1','MAX_SCENARIOS','scenarioImportInput'", "for (const marker of ['reinos.scenarios.v1','MAX_SCENARIOS','MAX_PLACEMENTS','scenarioMapCanvas','mirrorArmy','scenarioImportInput'", 'marcadores UI visual')
source = replace_once(source, "for (const marker of ['REPLAY_SEEDED_RNG','REPLAY_DETERMINISTIC_COMMAND_LOG'", "for (const marker of ['REPLAY_SEEDED_RNG','REPLAY_DETERMINISTIC_COMMAND_LOG','REPLAY_FINAL_CHECKSUM','runDeterminismProbe','finalChecksum'", 'marcadores checksum replay')
source = replace_once(source, "for (const asset of ['./scenario.css','./replay.css','./scenario.js','./replay.js'])", "for (const asset of ['./scenario.css','./replay.css','./scenario.js','./replay.js','./determinism.js'])", 'asset determinism')
extra = '''
for (const marker of ['reinos-state-v1','canonicalState','checksum','fnv1a']) {
  if (!determinism.includes(marker)) throw new Error(`Motor de checksum incompleto: falta ${marker}`);
}
for (const marker of ['scripts/test-determinism.mjs','scripts/browser-determinism.mjs','Check browser determinism']) {
  if (!workflow.includes(marker)) throw new Error(`CI determinista incompleta: falta ${marker}`);
}
if (html.indexOf('determinism.js') > html.indexOf('game.js')) throw new Error('determinism.js debe cargarse antes de game.js');
'''
source = replace_once(source, "if (game.includes('Math.random()')) throw new Error('game.js conserva azar no sembrado y rompería la reproducción determinista');", "if (game.includes('Math.random()')) throw new Error('game.js conserva azar no sembrado y rompería la reproducción determinista');\n" + extra.strip(), 'contrato determinista final')
source = replace_once(source, "console.log('Validación estática, campaña, laboratorio de escenarios y repeticiones deterministas completadas.');", "console.log('Validación estática, Cartógrafo v2, checksum y prueba E2E declarados correctamente.');", 'mensaje final')
path.write_text(source)


# workflow
path = Path('.github/workflows/validate.yml')
source = path.read_text()
source = replace_once(source, "          node --check rey/chronicle.js\n          node --check rey/sw.js", "          node --check rey/chronicle.js\n          node --check rey/campaign.js\n          node --check rey/scenario.js\n          node --check rey/replay.js\n          node --check rey/determinism.js\n          node --check rey/sw.js", 'sintaxis de módulos')
source = replace_once(source, "      - name: Validate app shell and config\n        run: node scripts/validate.mjs", "      - name: Validate app shell and config\n        run: node scripts/validate.mjs\n      - name: Check canonical checksum contract\n        run: node scripts/test-determinism.mjs\n      - name: Check browser determinism\n        run: node scripts/browser-determinism.mjs", 'pruebas deterministas')
path.write_text(source)


# README
path = Path('README.md')
source = path.read_text()
addition = '''

## Cartógrafo v2 y verificación determinista

El editor visual permite colocar hasta 48 tropas, torres, cuarteles y nodos de recursos sobre una vista completa del campo. Las piezas se sanitizan en la interfaz y nuevamente dentro del motor; cuando el mapa visual está vacío, los escenarios v1 continúan usando sus contadores numéricos originales.

Cada replay v2 guarda un checksum canónico del estado final bajo el motor `reinos-cartografo-v8`. Al terminar una reproducción, REINOS compara el estado reconstruido con el registrado y muestra una verificación explícita. La CI ejecuta además dos simulaciones completas con la misma semilla y exige el mismo checksum, junto con una tercera semilla que debe producir un estado diferente.
'''
if '## Cartógrafo v2 y verificación determinista' not in source:
    source += addition
path.write_text(source)

print('Cartógrafo v2 aplicado correctamente.')
