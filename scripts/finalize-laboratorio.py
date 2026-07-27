from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if new in source:
        return source
    if old not in source:
        raise RuntimeError(f'No se encontró el anclaje: {label}')
    return source.replace(old, new, 1)


game_path = Path('rey/game.js')
game = game_path.read_text()

game = replace_once(
    game,
    "function normalizeReplay(input){\n  if(!input || typeof input!=='object' || input.version!==REPLAY_VERSION) return null;\n  let encoded='';",
    "function normalizeReplay(input){\n  // REPLAY_ENGINE_LOCK: una repetición solo se ejecuta con el motor que la produjo.\n  if(!input || typeof input!=='object' || input.version!==REPLAY_VERSION || input.engine!=='reinos-lab-v7') return null;\n  const finalTick=boundedInt(input.finalTick,1,1000000,0);\n  if(!finalTick) return null;\n  let encoded='';",
    'bloqueo de versión',
)
game = replace_once(
    game,
    "    if(!entry || !Number.isInteger(entry.tick) || entry.tick<0 || entry.tick>1000000) return null;",
    "    if(!entry || !Number.isInteger(entry.tick) || entry.tick<0 || entry.tick>finalTick) return null;",
    'tick de comandos',
)
game = replace_once(
    game,
    "    finalTick:boundedInt(input.finalTick,0,1000000,0),",
    "    finalTick,",
    'tick final',
)
game = replace_once(
    game,
    "function recordReplayCommand(side,cmd){\n  if(!replayCapture || mode==='replay' || replayCapture.commands.length>=REPLAY_COMMAND_LIMIT) return;",
    "function recordReplayCommand(side,cmd){\n  if(!replayCapture || mode==='replay') return;\n  if(replayCapture.commands.length>=REPLAY_COMMAND_LIMIT){\n    // REPLAY_OVERFLOW_GUARD: nunca publica una repetición truncada.\n    replayCapture.overflow=true; return;\n  }",
    'desborde de órdenes',
)
game = replace_once(
    game,
    "function finalizeReplayCapture(winner,state){\n  if(!replayCapture || !state) return;\n  const record={",
    "function finalizeReplayCapture(winner,state){\n  if(!replayCapture || !state) return;\n  if(replayCapture.overflow){\n    replayCapture=null;\n    toast('🎞 Repetición omitida: la batalla superó el límite de órdenes.');\n    return;\n  }\n  const record={",
    'finalización segura',
)
game = replace_once(
    game,
    "  G.scenario={...scenario,units:{...scenario.units},hold:0,completed:false};",
    "  G.scenario={...scenario,units:{...scenario.units},hold:0,holdBySide:{red:0,blue:0},completed:false};",
    'estado de Corona',
)
game = replace_once(
    game,
    "  if(scenario.victoryMode==='crownHold') return `ESCENARIO · CORONA ${Math.floor(scenario.hold||0)}/${scenario.holdSeconds}s`;",
    "  if(scenario.victoryMode==='crownHold'){\n    const own=Math.floor(scenario.holdBySide?.[mySide]||0), rival=Math.floor(scenario.holdBySide?.[enemySide]||0);\n    return `ESCENARIO · CORONA ${own}/${scenario.holdSeconds}s · RIVAL ${rival}s · CASTILLOS INMORTALES`;\n  }",
    'HUD de Corona',
)
game = replace_once(
    game,
    "function stepScenario(dt){\n  const scenario=G.scenario;\n  if(!scenario || G.winner || scenario.victoryMode!=='crownHold') return;\n  const crown=G.objectives.find((objective)=>objective.id==='crown');\n  if(crown?.owner===mySide) scenario.hold+=dt;\n  else scenario.hold=Math.max(0,scenario.hold-dt*.65);\n  if(scenario.hold>=scenario.holdSeconds){\n    scenario.completed=true; G.winner=mySide; G.victoryReason='scenario';\n  }\n}",
    "function stepScenario(dt){\n  const scenario=G.scenario;\n  if(!scenario || G.winner || scenario.victoryMode!=='crownHold') return;\n  // CROWN_HOLD_EXCLUSIVE: ambos reinos compiten por una victoria territorial única.\n  const crown=G.objectives.find((objective)=>objective.id==='crown');\n  const holds=scenario.holdBySide||(scenario.holdBySide={red:0,blue:0});\n  for(const side of ['red','blue']){\n    if(crown?.owner===side) holds[side]+=dt;\n    else holds[side]=Math.max(0,holds[side]-dt*.65);\n    if(holds[side]>=scenario.holdSeconds){\n      scenario.hold=holds[mySide]; scenario.completed=true; G.winner=side; G.victoryReason='scenario'; return;\n    }\n  }\n  scenario.hold=holds[mySide];\n}",
    'competencia de Corona',
)
game = replace_once(
    game,
    "function damage(t, amount, fromSide){\n  if(t.hp<=0) return;",
    "function damage(t, amount, fromSide){\n  if(G.scenario?.victoryMode==='crownHold' && t.kind==='castle') return;\n  if(t.hp<=0) return;",
    'castillos inmortales',
)
game = replace_once(
    game,
    "function step(dt){\n  if(G.winner) return;\n  applyReplayCommands();",
    "function step(dt){\n  if(G.winner) return;\n  if(mode==='replay' && replayPlayback && G.tick>replayPlayback.record.finalTick+20){\n    // REPLAY_FINAL_TICK_BOUNDARY: una importación manipulada no puede simular para siempre.\n    G.winner=replayPlayback.record.winner; G.victoryReason='replayBoundary'; return;\n  }\n  applyReplayCommands();",
    'límite de reproducción',
)
game = replace_once(
    game,
    "  const reason=state?.victoryReason || 'castle';\n  const campaignResult=finalizeCampaignOutcome(winner,state);",
    "  const reason=state?.victoryReason || 'castle';\n  if(mode==='replay' && reason==='replayBoundary'){\n    document.getElementById('endTitle').textContent='REPETICIÓN INCOMPATIBLE';\n    document.getElementById('endTitle').style.color='#ffb35c';\n    document.getElementById('endSub').textContent='El estado no alcanzó el desenlace registrado dentro del tick final permitido.';\n    document.getElementById('endScreen').style.display='flex'; emitReplayState(false); return;\n  }\n  const campaignResult=finalizeCampaignOutcome(winner,state);",
    'final divergente',
)
game = replace_once(
    game,
    "    document.getElementById('endSub').textContent=reason==='scenario'\n      ? `${state.scenario.title} · la Corona quedó bajo control.`",
    "    document.getElementById('endSub').textContent=reason==='scenario'\n      ? (won?`${state.scenario.title} · la Corona quedó bajo tu control.`:`${state.scenario.title} · el rival sostuvo la Corona primero.`)",
    'mensaje de Corona',
)
game_path.write_text(game)

index_path = Path('rey/index.html')
index = index_path.read_text()
index = replace_once(
    index,
    '<option value="crownHold">Sostener la Corona</option>',
    '<option value="crownHold">Sostener la Corona · castillos inmortales</option>',
    'opción de Corona',
)
index_path.write_text(index)

readme_path = Path('README.md')
readme = readme_path.read_text()
readme = replace_once(
    readme,
    'El Editor de Escenarios v1 permite definir comandante, dificultad, edad, recursos, ejército inicial, eventos, semilla y condición de victoria.',
    'El Editor de Escenarios v1 permite definir comandante, dificultad, edad, recursos, ejército inicial, eventos, semilla y condición de victoria. En Control de la Corona ambos castillos son inmortales y cualquiera de los dos reinos puede ganar sosteniendo el Bastión central.',
    'documentación de Corona',
)
readme_path.write_text(readme)

validate_path = Path('scripts/validate.mjs')
validate = validate_path.read_text()
validate = replace_once(
    validate,
    "for (const marker of ['REPLAY_SEEDED_RNG','REPLAY_DETERMINISTIC_COMMAND_LOG','recordReplayCommand','applyReplayCommands','normalizeReplay','startReplay(record)','cycleReplaySpeed']) {",
    "for (const marker of ['REPLAY_SEEDED_RNG','REPLAY_DETERMINISTIC_COMMAND_LOG','REPLAY_ENGINE_LOCK','REPLAY_OVERFLOW_GUARD','REPLAY_FINAL_TICK_BOUNDARY','recordReplayCommand','applyReplayCommands','normalizeReplay','startReplay(record)','cycleReplaySpeed']) {",
    'validación replay',
)
validate = replace_once(
    validate,
    "for (const marker of ['SCENARIO_RULES_LAB','normalizeScenario','applyScenarioSetup','stepScenario(dt)','startScenario(config)','scenarioTitle']) {",
    "for (const marker of ['SCENARIO_RULES_LAB','CROWN_HOLD_EXCLUSIVE','CASTILLOS INMORTALES','normalizeScenario','applyScenarioSetup','stepScenario(dt)','startScenario(config)','scenarioTitle']) {",
    'validación escenario',
)
validate_path.write_text(validate)
