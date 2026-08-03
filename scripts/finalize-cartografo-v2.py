from pathlib import Path


def once(source, old, new, label):
    if new in source:
        return source
    if old not in source:
        raise RuntimeError(f'No se encontró el anclaje: {label}')
    return source.replace(old, new, 1)


# Motor: colisiones completas y fallback cuando todo el layout fue rechazado.
path = Path('rey/game.js')
source = path.read_text()
old = '''  if(['tower','barracks','gold','wood'].includes(item.kind)) return validPlacement(item.x,item.y,radius);
  return !G.ents.some((entity)=>!entity.building&&dist(item.x,item.y,entity.x,entity.y)<DEFS[entity.kind].r+radius+2);
}'''
new = '''  if(['tower','barracks','gold','wood'].includes(item.kind)) return validPlacement(item.x,item.y,radius);
  if(G.nodes.some((node)=>dist(item.x,item.y,node.x,node.y)<radius+node.r+6)) return false;
  if(G.ents.some((entity)=>entity.building&&dist(item.x,item.y,entity.x,entity.y)<radius+DEFS[entity.kind].r+6)) return false;
  return !G.ents.some((entity)=>!entity.building&&dist(item.x,item.y,entity.x,entity.y)<DEFS[entity.kind].r+radius+2);
}'''
source = once(source, old, new, 'colisión de unidades visuales')
old = '''function applyScenarioPlacements(scenario){
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
}'''
new = '''function applyScenarioPlacements(scenario){
  const layout=scenario.placements||[];
  if(!layout.length) return 0;
  let accepted=0;
  // VISUAL_SCENARIO_EDITOR_V2: cada pieza importada se valida otra vez dentro del motor.
  for(const item of layout){
    if(!scenarioPointAllowed(item)) continue;
    if(item.kind==='gold' || item.kind==='wood') addNode(item.kind,item.x,item.y,item.kind==='gold'?1200:320);
    else spawn(item.side,item.kind,item.x,item.y,true);
    accepted++;
  }
  if(accepted){ ensureScenarioHousing('red'); ensureScenarioHousing('blue'); }
  return accepted;
}'''
source = once(source, old, new, 'conteo de placements aceptados')
old = '''  own.age=scenario.age; own.g=scenario.gold; own.w=scenario.wood;
  if(!applyScenarioPlacements(scenario)) spawnScenarioForce(mySide,scenario.units);
  if(!scenario.worldEvents){'''
new = '''  own.age=scenario.age; own.g=scenario.gold; own.w=scenario.wood;
  const appliedPlacements=applyScenarioPlacements(scenario);
  G.scenario.appliedPlacements=appliedPlacements;
  // SCENARIO_REJECTED_LAYOUT_FALLBACK: un JSON totalmente rechazado conserva un ejército jugable.
  if(!appliedPlacements) spawnScenarioForce(mySide,scenario.units);
  if(!scenario.worldEvents){'''
source = once(source, old, new, 'fallback de layout rechazado')
old = "  toast(`🗺 CARTÓGRAFO · ${scenario.title} · ${(scenario.placements||[]).length} piezas`);"
new = "  toast(`🗺 CARTÓGRAFO · ${scenario.title} · ${appliedPlacements}/${(scenario.placements||[]).length} piezas aceptadas`);"
source = once(source, old, new, 'mensaje de placements aceptados')
path.write_text(source)


# Biblioteca: mostrar de forma honesta los replays antiguos o incompatibles.
path = Path('rey/replay.js')
source = path.read_text()
source = once(source, "      downloadJson(`reinos-replay-${record.finishedAt || Date.now()}.json`, {\n        schema: 'reinos-replay-v1',", "      downloadJson(`reinos-replay-${record.finishedAt || Date.now()}.json`, {\n        schema: 'reinos-replay-v2',", 'schema individual v2')
source = once(source, "    detail.textContent = `Semilla ${record.seed} · ${formatDate(entry.savedAt || record.finishedAt || Date.now())}`;", "    detail.textContent = `Semilla ${record.seed} · checksum ${record.finalChecksum} · ${formatDate(entry.savedAt || record.finishedAt || Date.now())}`;", 'checksum en tarjeta')
old = '''    const library = loadLibrary();
    list.replaceChildren();
    if (summary) summary.textContent = `${library.length}/${MAX_REPLAYS} REPETICIONES GUARDADAS`;
    if (!library.length) {
      const empty = document.createElement('p');
      empty.className = 'replay-empty';
      empty.textContent = 'Las batallas terminadas en este dispositivo aparecerán aquí.';
      list.appendChild(empty);
      return;
    }
    for (const entry of library) {
      const card = createReplayCard(entry);
      if (card) list.appendChild(card);
    }'''
new = '''    const library = loadLibrary();
    const compatible = [];
    let incompatible = 0;
    for (const entry of library) {
      const record = normalize(entry.record || entry);
      if (record) compatible.push({ entry, record });
      else incompatible++;
    }
    list.replaceChildren();
    if (summary) summary.textContent = `${compatible.length}/${MAX_REPLAYS} COMPATIBLES${incompatible ? ` · ${incompatible} ANTIGUAS O INCOMPATIBLES` : ''}`;
    if (!compatible.length) {
      const empty = document.createElement('p');
      empty.className = 'replay-empty';
      empty.textContent = incompatible
        ? 'Las grabaciones v1 no contienen checksum final y no pueden verificarse. Puedes exportarlas antes de limpiar la biblioteca.'
        : 'Las batallas terminadas en este dispositivo aparecerán aquí.';
      list.appendChild(empty);
      return;
    }
    for (const { entry } of compatible) {
      const card = createReplayCard(entry);
      if (card) list.appendChild(card);
    }'''
source = once(source, old, new, 'render honesto de biblioteca')
source = once(source, "      schema: 'reinos-replays-v1',", "      schema: 'reinos-replays-v2',", 'schema de biblioteca v2')
old = "    const incoming = payload?.schema === 'reinos-replay-v1'\n      ? [payload.replay]\n      : Array.isArray(payload) ? payload : payload?.replays;"
new = "    const incoming = payload?.replay\n      ? [payload.replay]\n      : Array.isArray(payload) ? payload : payload?.replays;"
source = once(source, old, new, 'importación de cualquier envoltorio')
path.write_text(source)


# Contrato estático permanente.
path = Path('scripts/validate.mjs')
source = path.read_text()
source = once(source, "'VISUAL_SCENARIO_EDITOR_V2','SCENARIO_PLACEMENT_LIMIT','applyScenarioPlacements'", "'VISUAL_SCENARIO_EDITOR_V2','SCENARIO_PLACEMENT_LIMIT','SCENARIO_REJECTED_LAYOUT_FALLBACK','applyScenarioPlacements'", 'marcador fallback')
source = once(source, "'reinos.replays.v1','MAX_REPLAYS','reinos:replay-complete'", "'reinos.replays.v1','reinos-replays-v2','reinos-replay-v2','ANTIGUAS O INCOMPATIBLES','MAX_REPLAYS','reinos:replay-complete'", 'marcadores biblioteca v2')
path.write_text(source)

print('Hardening final de Cartógrafo v2 aplicado.')
