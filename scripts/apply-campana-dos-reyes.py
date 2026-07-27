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
if 'const CAMPAIGN_MISSIONS =' in game:
    print('Campaña de los Dos Reyes ya fue aplicada')
    sys.exit(0)

campaign_config = """const CAMPAIGN_MISSIONS = [
  {
    id:'crownVacant', act:'I', title:'LA CORONA VACÍA', side:'red', commander:'LEÓN',
    difficulty:'explorer', difficultyLabel:'EXPLORADOR', kingMustLive:true, holdSeconds:35,
    briefing:'La frontera quedó sin dueño. León debe ocupar el corazón del mapa antes de que Nelson convierta la Corona en una fortaleza.',
    objective:'captura el Bastión de la Corona y sostenlo durante 35 segundos',
  },
  {
    id:'steelPact', act:'II', title:'EL PACTO DE ACERO', side:'blue', commander:'NELSON',
    difficulty:'warrior', difficultyLabel:'GUERRERO', kingMustLive:true,
    briefing:'Nelson necesita ojos, oro y aliados. Los gremios neutrales aceptarán su bandera, pero solo si el Rey firma el contrato en persona.',
    objective:'vence al reino rival y domina inteligencia y contratos mercenarios',
  },
  {
    id:'lastCrown', act:'III', title:'LA ÚLTIMA CORONA', side:'red', commander:'LEÓN',
    difficulty:'conqueror', difficultyLabel:'CONQUISTADOR', kingMustLive:true,
    briefing:'Los dos reinos llegan armados a la tormenta final. La niebla caerá primero; después solo quedarán mando, territorio y acero.',
    objective:'vence en la batalla final utilizando todas las capas estratégicas del reino',
  },
];
function campaignMissionById(id){ return CAMPAIGN_MISSIONS.find((mission)=>mission.id===id) || null; }

"""
game = replace_once(game, 'const COLOR = {', campaign_config + 'const COLOR = {', 'definiciones de campaña')
game = replace_once(
    game,
    "let running = false;\nlet aiDifficulty = 'warrior';",
    "let running = false;\nlet aiDifficulty = 'warrior';\nlet campaignMissionId = null;\nlet campaignOutcomeSent = false;",
    'estado global de campaña',
)
game = replace_once(
    game,
    "    stats:{\n      red:{commanderUses:0,mercenariesHired:0},\n      blue:{commanderUses:0,mercenariesHired:0},\n    },\n    particles: [],",
    "    stats:{\n      red:{commanderUses:0,mercenariesHired:0},\n      blue:{commanderUses:0,mercenariesHired:0},\n    },\n    campaign:null,\n    particles: [],",
    'estado persistente de misión',
)

campaign_setup = """function spawnCampaignForce(side,units){
  const castle=G.ents.find((entity)=>entity.side===side && entity.kind==='castle');
  if(!castle) return;
  units.forEach((kind,index)=>{
    const row=Math.floor(index/3), col=index%3;
    const direction=side==='red'?1:-1;
    spawn(side,kind,castle.x+direction*(100+col*24),castle.y-70+row*28);
  });
}
function applyCampaignSetup(id){
  const mission=campaignMissionById(id);
  if(!mission) return;
  G.campaign={id,hold:0,completed:false,stars:0,failure:null,objective:mission.objective};
  const own=G.res[mySide], enemy=G.res[enemySide];
  if(id==='crownVacant'){
    own.age=2; own.g+=350; own.w+=300;
    spawnCampaignForce(mySide,['swordsman','swordsman','swordsman','archer']);
    G.worldEvent.nextAt=135;
  } else if(id==='steelPact'){
    own.age=2; own.g+=650; own.w+=500;
    spawnCampaignForce(mySide,['archer','archer','swordsman']);
    G.worldEvent.nextAt=82;
  } else if(id==='lastCrown'){
    own.age=2; own.g+=520; own.w+=430;
    enemy.age=2; enemy.g+=280; enemy.w+=240;
    spawnCampaignForce(mySide,['swordsman','swordsman','archer','archer']);
    spawnCampaignForce(enemySide,['swordsman','swordsman','archer']);
    G.worldEvent.warning='blackFog'; G.worldEvent.warningT=8; G.worldEvent.nextAt=9999;
    setWorldAnnouncement('⚠ NIEBLA NEGRA llegará en 8s · comienza la batalla final');
  }
  recalcPop();
  toast(`📜 ACTO ${mission.act} · ${mission.title}`);
}
function campaignObjectiveText(state=activeState()){
  const mission=campaignMissionById(state?.campaign?.id);
  if(!mission || !state?.campaign) return '';
  const stats=state.stats?.[mySide]||{};
  if(mission.id==='crownVacant') return `ACTO I · CORONA ${Math.floor(state.campaign.hold||0)}/${mission.holdSeconds}s · REY CON VIDA`;
  if(mission.id==='steelPact') return `ACTO II · OJO ${stats.commanderUses||0} · MERCENARIOS ${stats.mercenariesHired||0} · VENCE`;
  return `ACTO III · PODERES ${stats.commanderUses||0} · MERC ${stats.mercenariesHired||0} · EVENTOS ${state.worldEvent?.seen||0}`;
}
function stepCampaign(dt){
  if(!G.campaign || G.winner) return;
  const mission=campaignMissionById(G.campaign.id);
  if(!mission) return;
  const king=G.ents.find((entity)=>entity.side===mySide && entity.kind==='king' && entity.hp>0);
  if(mission.kingMustLive && !king){
    G.campaign.failure='king'; G.winner=enemySide; G.victoryReason='campaignFailure';
    return;
  }
  if(mission.id==='crownVacant'){
    const crown=G.objectives.find((objective)=>objective.id==='crown');
    if(crown?.owner===mySide) G.campaign.hold+=dt;
    else G.campaign.hold=Math.max(0,G.campaign.hold-dt*.65);
    if(G.campaign.hold>=mission.holdSeconds){
      G.campaign.completed=true; G.winner=mySide; G.victoryReason='campaign';
    }
  }
}
function scoreCampaign(state,winner){
  const mission=campaignMissionById(state?.campaign?.id);
  if(!mission) return 0;
  const won=winner===mySide;
  if(!won) return 0;
  const stats=state.stats?.[mySide]||{};
  const kingAlive=state.ents.some((entity)=>entity.side===mySide && entity.kind==='king' && entity.hp>0);
  let stars=1;
  if(mission.id==='crownVacant'){
    if((state.campaign?.hold||0)>=mission.holdSeconds || state.victoryReason==='campaign') stars++;
    if(kingAlive && state.time<=300) stars++;
  } else if(mission.id==='steelPact'){
    if((stats.mercenariesHired||0)>=4) stars++;
    if((stats.commanderUses||0)>=1 && state.time<=480) stars++;
  } else if(mission.id==='lastCrown'){
    if((stats.commanderUses||0)>=2 && (stats.mercenariesHired||0)>=2) stars++;
    if(state.victoryReason==='supremacy' || (state.worldEvent?.seen||0)>=2) stars++;
  }
  return Math.min(3,stars);
}
function finalizeCampaignOutcome(winner,state){
  if(!campaignMissionId || campaignOutcomeSent || !state) return null;
  const mission=campaignMissionById(campaignMissionId);
  if(!mission) return null;
  const won=winner===mySide;
  const stars=scoreCampaign(state,winner);
  if(state.campaign) state.campaign.stars=stars;
  const detail={
    id:mission.id, act:mission.act, title:mission.title, won, stars,
    time:Math.round(state.time||0), victoryReason:state.victoryReason||'castle',
    commanderUses:state.stats?.[mySide]?.commanderUses||0,
    mercenariesHired:state.stats?.[mySide]?.mercenariesHired||0,
    worldEvents:state.worldEvent?.seen||0,
  };
  campaignOutcomeSent=true;
  window.dispatchEvent(new CustomEvent('reinos:campaign-complete',{detail}));
  return detail;
}

"""
game = replace_once(game, '// ---------- Simulación ----------', campaign_setup + '// ---------- Simulación ----------', 'motor de campaña')
game = replace_once(
    game,
    "  if(castleDead){ G.winner = (castleDead==='red')?'blue':'red'; G.victoryReason='castle'; }\n\n  // IA (solo single player, controla al enemigo)",
    "  if(castleDead){ G.winner = (castleDead==='red')?'blue':'red'; G.victoryReason='castle'; }\n  stepCampaign(dt);\n  if(G.winner) return;\n\n  // IA (solo single player, controla al enemigo)",
    'evaluación de misión',
)
game = replace_once(
    game,
    "  setText('eventInfo',worldText);\n  const ageName=AGE_DEFS[r.age||1].name;",
    "  setText('eventInfo',worldText);\n  const campaignInfo=document.getElementById('campaignInfo');\n  if(campaignInfo){\n    campaignInfo.style.display=S.campaign?'block':'none';\n    if(S.campaign) campaignInfo.textContent=campaignObjectiveText(S);\n  }\n  const ageName=AGE_DEFS[r.age||1].name;",
    'HUD de campaña',
)
game = replace_once(
    game,
    "function startGame(opts){\n  mode=opts.mode; mySide=opts.side; enemySide = mySide==='red'?'blue':'red';\n  lastWorldAnnouncementSerial=0;",
    "function startGame(opts){\n  mode=opts.mode; mySide=opts.side; enemySide = mySide==='red'?'blue':'red';\n  campaignMissionId=opts.campaignId||null; campaignOutcomeSent=false;\n  lastWorldAnnouncementSerial=0;",
    'inicio de campaña',
)
game = replace_once(
    game,
    "    initMap();\n    if(mode==='host'){ Net.onCmd=(cmd)=>applyCommand(cmd,enemySide); }",
    "    initMap();\n    if(campaignMissionId) applyCampaignSetup(campaignMissionId);\n    if(mode==='host'){ Net.onCmd=(cmd)=>applyCommand(cmd,enemySide); }",
    'setup tras mapa',
)
game = replace_once(
    game,
    "  const state=renderState();\n  const reason=state?.victoryReason || 'castle';\n  document.getElementById('endSub').textContent = reason==='supremacy'\n    ? (won?`La ${FACTIONS[mySide].name} sostuvo dos Bastiones y proclamó supremacía.`:`${COLOR[winner].name} dominó los Bastiones antes de que pudieras recuperarlos.`)\n    : (won?`El reino de ${COLOR[mySide].name} derribó el castillo enemigo.`:`El reino de ${COLOR[winner].name} arrasó tu castillo.`);",
    "  const state=renderState();\n  const reason=state?.victoryReason || 'castle';\n  const campaignResult=finalizeCampaignOutcome(winner,state);\n  if(campaignResult){\n    const starLine=`${'★'.repeat(campaignResult.stars)}${'☆'.repeat(3-campaignResult.stars)}`;\n    document.getElementById('endSub').textContent=campaignResult.won\n      ? `ACTO ${campaignResult.act} COMPLETADO · ${campaignResult.title} · ${starLine}`\n      : `ACTO ${campaignResult.act} FALLIDO · ${campaignResult.title} · el Rey debe sobrevivir.`;\n  } else {\n    document.getElementById('endSub').textContent = reason==='supremacy'\n      ? (won?`La ${FACTIONS[mySide].name} sostuvo dos Bastiones y proclamó supremacía.`:`${COLOR[winner].name} dominó los Bastiones antes de que pudieras recuperarlos.`)\n      : (won?`El reino de ${COLOR[mySide].name} derribó el castillo enemigo.`:`El reino de ${COLOR[winner].name} arrasó tu castillo.`);\n  }",
    'final de campaña',
)
game = replace_once(
    game,
    "window.REINOS = {\n  startSolo(side,difficulty='warrior'){ startGame({mode:'sp', side, difficulty}); },",
    "window.REINOS = {\n  startSolo(side,difficulty='warrior'){ startGame({mode:'sp', side, difficulty}); },\n\n  startCampaign(id){\n    const mission=campaignMissionById(id);\n    if(!mission) return false;\n    startGame({mode:'sp',side:mission.side,difficulty:mission.difficulty,campaignId:mission.id});\n    return true;\n  },\n\n  getCampaignDefinitions(){\n    return CAMPAIGN_MISSIONS.map(({id,act,title,side,commander,difficulty,difficultyLabel,briefing,objective})=>({id,act,title,side,commander,difficulty,difficultyLabel,briefing,objective}));\n  },",
    'API pública de campaña',
)
game = replace_once(
    game,
    "      mode, side:mySide, difficulty:mode==='sp'?aiDifficulty:'human', age:S?.res?.[mySide]?.age||1,\n      faction:FACTIONS[mySide].name, victoryReason:S?.victoryReason||'castle',",
    "      mode:campaignMissionId?'campaign':mode, side:mySide, difficulty:mode==='sp'?aiDifficulty:'human', age:S?.res?.[mySide]?.age||1,\n      faction:FACTIONS[mySide].name, victoryReason:S?.victoryReason||'castle',\n      campaignId:campaignMissionId, campaignTitle:campaignMissionById(campaignMissionId)?.title||null, campaignStars:S?.campaign?.stars||0,",
    'metadatos de campaña',
)
game_path.write_text(game, encoding='utf-8')


def patch_index(source: str) -> str:
    source = replace_once(source, '<link rel="stylesheet" href="chronicle.css">', '<link rel="stylesheet" href="chronicle.css">\n<link rel="stylesheet" href="campaign.css">', 'CSS de campaña')
    source = replace_once(source, '      </div>\n      <div class="divider">— · · · —</div>\n      <h2>DUELO ONLINE</h2>', '      </div>\n      <div class="divider">— · · · —</div>\n      <h2>CAMPAÑA DE LOS DOS REYES</h2>\n      <div class="row">\n        <button id="openCampaignBtn" class="btn campaign" type="button">ABRIR CAMPAÑA<small>3 actos · progreso persistente · 9 estrellas</small></button>\n      </div>\n      <div class="divider">— · · · —</div>\n      <h2>DUELO ONLINE</h2>', 'entrada de campaña')
    source = replace_once(source, '    <div class="stat event" id="eventInfo">MUNDO ESTABLE</div>\n    <div class="stat" id="enemyInfo"></div>', '    <div class="stat event" id="eventInfo">MUNDO ESTABLE</div>\n    <div class="stat" id="campaignInfo">ACTO I</div>\n    <div class="stat" id="enemyInfo"></div>', 'HUD de campaña')
    source = replace_once(source, '    <div id="battleSummary" aria-live="polite"></div>\n    <button class="btn" style="max-width:240px;" onclick="REINOS.restart()">VOLVER AL MENÚ</button>', '    <div id="battleSummary" aria-live="polite"></div>\n    <div class="end-campaign-actions">\n      <button id="campaignRetryBtn" class="mini-btn" type="button" hidden>REINTENTAR MISIÓN</button>\n      <button id="campaignNextBtn" class="mini-btn" type="button" hidden>SIGUIENTE MISIÓN</button>\n    </div>\n    <button class="btn" style="max-width:240px;" onclick="REINOS.restart()">VOLVER AL MENÚ</button>', 'acciones de final')
    dialog = '''\n  <dialog id="campaignDialog" class="campaign-dialog" aria-labelledby="campaignTitle">\n    <div class="campaign-shell">\n      <div class="campaign-header">\n        <div>\n          <span class="campaign-kicker">CRÓNICA JUGABLE</span>\n          <h2 id="campaignTitle">CAMPAÑA DE LOS DOS REYES</h2>\n        </div>\n        <button id="closeCampaignBtn" class="hud-btn" type="button" aria-label="Cerrar campaña">✕</button>\n      </div>\n      <div id="campaignProgress" class="campaign-progress"></div>\n      <div id="campaignMissions" class="campaign-missions"></div>\n      <div class="campaign-actions">\n        <button id="clearCampaignBtn" class="mini-btn danger" type="button">REINICIAR CAMPAÑA</button>\n        <button class="mini-btn" type="button" onclick="document.getElementById('campaignDialog').close()">CERRAR</button>\n      </div>\n    </div>\n  </dialog>\n'''
    source = replace_once(source, '\n  <noscript>REINOS necesita JavaScript para ejecutar la simulación.</noscript>', dialog + '\n  <noscript>REINOS necesita JavaScript para ejecutar la simulación.</noscript>', 'diálogo de campaña')
    source = replace_once(source, '  <script src="chronicle.js"></script>', '  <script src="chronicle.js"></script>\n  <script src="campaign.js"></script>', 'JS de campaña')
    return source

patch('rey/index.html', patch_index)


def patch_app(source: str) -> str:
    anchor = """    REINOS.startSolo = (side, difficulty) => {
      originalSolo(side, difficulty);
      showMatchShell();
      setConnectionState('SOLO', true);
    };

"""
    addition = anchor + """    if (typeof REINOS.startCampaign === 'function') {
      const originalCampaign = REINOS.startCampaign.bind(REINOS);
      REINOS.startCampaign = (id) => {
        const started = originalCampaign(id);
        if (started !== false) {
          showMatchShell();
          setConnectionState('CAMPAÑA', true);
        }
        return started;
      };
    }

"""
    return replace_once(source, anchor, addition, 'wrapper de campaña')

patch('rey/app.js', patch_app)


def patch_chronicle(source: str) -> str:
    source = replace_once(source, "    if (mode === 'client') return 'Duelo online · invitado';\n    return 'Un jugador';", "    if (mode === 'client') return 'Duelo online · invitado';\n    if (mode === 'campaign') return 'Campaña';\n    return 'Un jugador';", 'modo campaña')
    source = replace_once(source, "  function victoryReasonName(value) {\n    return value === 'supremacy' ? 'Supremacía de Bastiones' : 'Castillo destruido';\n  }", "  function victoryReasonName(value) {\n    if (value === 'supremacy') return 'Supremacía de Bastiones';\n    if (value === 'campaign') return 'Objetivo de campaña';\n    if (value === 'campaignFailure') return 'Rey caído';\n    return 'Castillo destruido';\n  }", 'motivos de campaña')
    source = replace_once(source, "  function beginBattle(mode, side, room = null, difficulty = 'warrior') {", "  function beginBattle(mode, side, room = null, difficulty = 'warrior', extras = {}) {", 'extras de batalla')
    source = replace_once(source, "      difficulty: mode === 'sp' ? difficulty : 'human',\n    };", "      difficulty: mode === 'sp' || mode === 'campaign' ? difficulty : 'human',\n      ...extras,\n    };", 'extras persistidos')
    source = replace_once(source, "      mercenaries: history.reduce((sum, entry) => sum + (entry.mercenariesHired || 0), 0),", "      mercenaries: history.reduce((sum, entry) => sum + (entry.mercenariesHired || 0), 0),\n      campaignStars: history.reduce((sum, entry) => sum + (entry.campaignStars || 0), 0),", 'estadística estrellas')
    source = replace_once(source, "    appendStat(statsContainer, 'mercenarios', stats.mercenaries);\n    appendStat(statsContainer, 'duración media', formatDuration(stats.averageMs));", "    appendStat(statsContainer, 'mercenarios', stats.mercenaries);\n    appendStat(statsContainer, 'estrellas', stats.campaignStars);\n    appendStat(statsContainer, 'duración media', formatDuration(stats.averageMs));", 'panel estrellas')
    source = replace_once(source, "      details.textContent = `${sideName(entry.side)} · ${factionName(entry.side)} · ${modeName(entry.mode)} · ${difficultyName(entry.difficulty)} · ${victoryReasonName(entry.victoryReason)} · 👑${entry.commanderUses||0} · ⚔${entry.mercenariesHired||0} · Edad ${entry.finalAge||1} · ${formatDuration(entry.durationMs)}`;", "      const campaignLabel=entry.campaignTitle?` · ${entry.campaignTitle} · ${'★'.repeat(entry.campaignStars||0)}${'☆'.repeat(3-(entry.campaignStars||0))}`:'';\n      details.textContent = `${sideName(entry.side)} · ${factionName(entry.side)} · ${modeName(entry.mode)}${campaignLabel} · ${difficultyName(entry.difficulty)} · ${victoryReasonName(entry.victoryReason)} · 👑${entry.commanderUses||0} · ⚔${entry.mercenariesHired||0} · Edad ${entry.finalAge||1} · ${formatDuration(entry.durationMs)}`;", 'detalle de campaña')
    source = replace_once(source, "    appendStat(grid, 'eventos', entry.worldEvents||0);\n    appendStat(grid, 'racha', entry.result === 'victory' ? streak : 0);", "    appendStat(grid, 'eventos', entry.worldEvents||0);\n    if(entry.campaignTitle){ appendStat(grid, 'misión', entry.campaignTitle); appendStat(grid, 'estrellas', `${entry.campaignStars||0}/3`); }\n    appendStat(grid, 'racha', entry.result === 'victory' ? streak : 0);", 'resumen de campaña')
    source = replace_once(source, "      lastWorldEvent: meta.lastWorldEvent || null,\n      finishedAt: Date.now(),", "      lastWorldEvent: meta.lastWorldEvent || null,\n      campaignId: meta.campaignId || activeBattle.campaignId || null,\n      campaignTitle: meta.campaignTitle || activeBattle.campaignTitle || null,\n      campaignStars: meta.campaignStars || 0,\n      finishedAt: Date.now(),", 'metadatos de campaña')
    anchor = """    const originalHost = REINOS.hostGame.bind(REINOS);
"""
    campaign_wrapper = """    if (typeof REINOS.startCampaign === 'function') {
      const originalCampaign = REINOS.startCampaign.bind(REINOS);
      REINOS.startCampaign = (id) => {
        const mission = typeof REINOS.getCampaignDefinitions === 'function'
          ? REINOS.getCampaignDefinitions().find((item) => item.id === id)
          : null;
        const started = originalCampaign(id);
        if (started !== false && mission) beginBattle('campaign', mission.side, null, mission.difficulty, { campaignId:id, campaignTitle:mission.title });
        return started;
      };
    }

""" + anchor
    source = replace_once(source, anchor, campaign_wrapper, 'wrapper Crónica campaña')
    return source

patch('rey/chronicle.js', patch_chronicle)


def patch_sw(source: str) -> str:
    source = replace_once(source, "const CACHE_NAME = 'reinos-comandantes-v5';", "const CACHE_NAME = 'reinos-campana-v6';", 'caché de campaña')
    source = replace_once(source, "'./', './index.html', './style.css', './chronicle.css', './net.js', './game.js', './app.js', './chronicle.js',", "'./', './index.html', './style.css', './chronicle.css', './campaign.css', './net.js', './game.js', './app.js', './chronicle.js', './campaign.js',", 'assets de campaña')
    return source

patch('rey/sw.js', patch_sw)


def patch_readme(source: str) -> str:
    return source + """

## Campaña de los Dos Reyes

La campaña añade tres actos desbloqueables sin alterar el duelo libre. **La Corona Vacía** enseña control territorial mediante una victoria especial por sostener el Bastión central. **El Pacto de Acero** coloca a Nelson frente a contratos mercenarios e inteligencia táctica. **La Última Corona** combina dificultad Conquistador, Niebla Negra inicial, comandantes, eventos, mercenarios y las dos condiciones clásicas de victoria.

Cada misión entrega hasta tres estrellas según objetivos secundarios, tiempo y uso de sistemas. El progreso y la mejor puntuación se guardan localmente en el navegador mediante `reinos.campaign.v1`; la Crónica de Guerra conserva además el acto, la misión y las estrellas de cada intento terminado.
"""

patch('README.md', patch_readme)


def patch_validator(source: str) -> str:
    source = replace_once(source, "  'rey/chronicle.css',", "  'rey/chronicle.css',\n  'rey/campaign.css',", 'archivo campaign.css')
    source = replace_once(source, "  'rey/chronicle.js',", "  'rey/chronicle.js',\n  'rey/campaign.js',", 'archivo campaign.js')
    source = replace_once(source, "const chronicle = await readFile('rey/chronicle.js', 'utf8');", "const chronicle = await readFile('rey/chronicle.js', 'utf8');\nconst campaign = await readFile('rey/campaign.js', 'utf8');", 'lectura campaign.js')
    source = replace_once(source, "for (const ref of ['style.css', 'chronicle.css', 'net.js', 'game.js', 'app.js', 'chronicle.js', 'manifest.webmanifest']) {", "for (const ref of ['style.css', 'chronicle.css', 'campaign.css', 'net.js', 'game.js', 'app.js', 'chronicle.js', 'campaign.js', 'manifest.webmanifest']) {", 'referencias HTML campaña')
    source = replace_once(source, "for (const asset of ['./chronicle.css', './chronicle.js']) {", "for (const asset of ['./chronicle.css', './chronicle.js', './campaign.css', './campaign.js']) {", 'caché campaña')
    source = replace_once(source, "for (const id of ['difficultySelect', 'ageInfo', 'factionInfo', 'objectiveInfo', 'eventInfo']) {", "for (const id of ['difficultySelect', 'ageInfo', 'factionInfo', 'objectiveInfo', 'eventInfo', 'campaignInfo', 'openCampaignBtn', 'campaignDialog', 'campaignMissions', 'campaignProgress', 'campaignRetryBtn', 'campaignNextBtn']) {", 'DOM campaña')
    source = replace_once(source, "if (!sw.includes('reinos-comandantes-v5')) throw new Error('La PWA no renovó su caché para Comandantes y Eventos');", "if (!sw.includes('reinos-campana-v6')) throw new Error('La PWA no renovó su caché para Campaña de los Dos Reyes');", 'PWA v6')
    source = replace_once(source, "if (game.includes('CHEAT_CODE') || game.includes('tryCheat')) throw new Error('El código secreto antiguo sigue activo después de oficializar habilidades');\n\nconsole.log('Validación estática, salas, crónica, conquista, asimetría, comandantes y eventos completadas.');", "if (game.includes('CHEAT_CODE') || game.includes('tryCheat')) throw new Error('El código secreto antiguo sigue activo después de oficializar habilidades');\n\nfor (const marker of ['const CAMPAIGN_MISSIONS =', 'applyCampaignSetup', 'stepCampaign(dt)', 'scoreCampaign', \"CustomEvent('reinos:campaign-complete'\", 'startCampaign(id)', 'getCampaignDefinitions']) {\n  if (!game.includes(marker)) throw new Error(`Campaña incompleta en game.js: falta ${marker}`);\n}\nfor (const marker of ['reinos.campaign.v1', 'bestStars', 'reinos:campaign-complete', 'campaignNextBtn', 'campaignRetryBtn']) {\n  if (!campaign.includes(marker)) throw new Error(`Mapa de campaña incompleto: falta ${marker}`);\n}\nfor (const marker of ['campaignId', 'campaignTitle', 'campaignStars', \"beginBattle('campaign'\"]) {\n  if (!chronicle.includes(marker)) throw new Error(`Crónica de campaña incompleta: falta ${marker}`);\n}\n\nconsole.log('Validación estática, salas, crónica, conquista, asimetría, comandantes, eventos y campaña completadas.');", 'validación campaña')
    return source

patch('scripts/validate.mjs', patch_validator)

print('Transformación Campaña de los Dos Reyes aplicada')
