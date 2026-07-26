from pathlib import Path

GAME = Path('rey/game.js')
VALIDATOR = Path('scripts/validate.mjs')


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        raise RuntimeError(f'No se encontró el anclaje: {label}')
    return source.replace(old, new, 1)


source = GAME.read_text()
if 'AI_AGE_RESERVE' in source:
    print('Cierre de Era de Conquista ya aplicado')
    raise SystemExit(0)

source = replace_once(
    source,
    "function sideState(side){ return G && G.res ? G.res[side] : null; }",
    """function activeState(){
  if(G) return G;
  if(typeof renderState==='function') return renderState();
  return null;
}
function sideState(side){ const state=activeState(); return state && state.res ? state.res[side] : null; }""",
    'estado activo host/cliente',
)

source = replace_once(
    source,
    """function canAfford(side, key, pop=0){
  const r=G.res[side], c=COST[key];
  if(!c) return false;""",
    """function canAfford(side, key, pop=0){
  const r=sideState(side), c=COST[key];
  if(!r||!c) return false;""",
    'economía sobre snapshot',
)

source = replace_once(
    source,
    """function validPlacement(x,y,r){
  if(x<r||y<r||x>MAP_W-r||y>MAP_H-r) return false;
  for(const e of G.ents){ if(e.building && dist(x,y,e.x,e.y) < r+DEFS[e.kind].r+6) return false; }
  for(const n of G.nodes){ if(dist(x,y,n.x,n.y) < r+n.r+6) return false; }
  return true;
}""",
    """function validPlacement(x,y,r){
  const state=activeState();
  if(!state||x<r||y<r||x>MAP_W-r||y>MAP_H-r) return false;
  for(const e of state.ents){ if(e.building && dist(x,y,e.x,e.y) < r+DEFS[e.kind].r+6) return false; }
  for(const n of state.nodes){ if(dist(x,y,n.x,n.y) < r+n.r+6) return false; }
  return true;
}""",
    'colocación sobre snapshot',
)

old_ai = """function aiTryResearch(side,castle,barracks,profile){
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
}"""
new_ai = """function aiTryResearch(side,castle,barracks,profile){
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
}"""
source = replace_once(source, old_ai, new_ai, 'reserva de edad de la IA')

source = replace_once(
    source,
    """  const idleV = vills.filter(v=>!v.order || (v.order.type==='move'&&!v.moving));
  for(const v of idleV){
    const wantWood = r.w < r.g*0.72;
    const n=nearestNode(wantWood?'wood':'gold', v.x, v.y) || nearestNode(wantWood?'gold':'wood', v.x,v.y);
    if(n){ v.order={type:'gather'}; v.nodeId=n.id; v.carryType=n.type; v.moving=true; }
  }

  if(vills.length<profile.villagers""",
    """  const idleV = vills.filter(v=>!v.order || (v.order.type==='move'&&!v.moving));
  for(const v of idleV){
    const wantWood = r.w < r.g*0.72;
    const n=nearestNode(wantWood?'wood':'gold', v.x, v.y) || nearestNode(wantWood?'gold':'wood', v.x,v.y);
    if(n){ v.order={type:'gather'}; v.nodeId=n.id; v.carryType=n.type; v.moving=true; }
  }

  const researchPlan=aiTryResearch(side,castle,barracks,profile);
  const savingForAge=researchPlan==='save-age';

  if(!savingForAge && vills.length<profile.villagers""",
    'plan de investigación antes del gasto',
)

source = source.replace("  if(r.pop >= r.cap-2 &&", "  if(!savingForAge && r.pop >= r.cap-2 &&", 1)
source = source.replace("  if(barracks.length===0 &&", "  if(!savingForAge && barracks.length===0 &&", 1)
source = source.replace("  if(r.age>=2 && towers.length", "  if(!savingForAge && r.age>=2 && towers.length", 1)
source = replace_once(source, "\n  aiTryResearch(side,castle,barracks,profile);\n", "\n", 'llamada duplicada de investigación')

source = replace_once(
    source,
    """  const available=['swordsman'];
  if(r.age>=2) available.push('archer');
  if(r.age>=3) available.push('knight');
  for(const b of barracks){
    while(b.queue.length<profile.queueDepth){
      const unit=available[Math.floor(Math.random()*available.length)];
      if(!canAfford(side,unit,1)) break;
      applyCommand({type:'train', buildingId:b.id, unit}, side);
    }
  }""",
    """  if(!savingForAge){
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
  }""",
    'ahorro militar de la IA',
)

source = replace_once(
    source,
    "const ok=validPlacement(mouse.wx,mouse.wy,DEFS[buildKind].r) && canAfford(mySide,buildKind);",
    "const ok=canBuildKind(mySide,buildKind) && validPlacement(mouse.wx,mouse.wy,DEFS[buildKind].r) && canAfford(mySide,buildKind);",
    'fantasma de construcción por edad',
)

source = replace_once(
    source,
    "function setBuild(kind){ buildKind=kind; }",
    """function setBuild(kind){
  const required=BUILDING_AGE[kind]||1;
  if(!canBuildKind(mySide,kind)){
    toast('🔒 Requiere '+AGE_DEFS[required].name);
    return;
  }
  buildKind=kind;
}""",
    'bloqueo de construcción visible',
)

source = replace_once(
    source,
    """function addBuildBtn(panel,kind,label,sub){
  const b=btn(label,sub);
  b.onclick=()=>setBuild(kind);
  panel.appendChild(b);
}""",
    """function addBuildBtn(panel,kind,label,sub){
  const required=BUILDING_AGE[kind]||1;
  const locked=!canBuildKind(mySide,kind);
  const b=btn(locked?'🔒 '+label:label,locked?'requiere '+AGE_DEFS[required].name:sub);
  b.disabled=locked;
  b.onclick=()=>setBuild(kind);
  panel.appendChild(b);
}""",
    'botón de construcción por edad',
)

GAME.write_text(source)

validator = VALIDATOR.read_text()
validator = replace_once(
    validator,
    """for (const marker of ['const AGE_DEFS =', 'const RESEARCH =', "case 'research'", 'stepResearch(dt)', 'getMatchMeta()']) {""",
    """for (const marker of ['const AGE_DEFS =', 'const RESEARCH =', "case 'research'", 'stepResearch(dt)', 'getMatchMeta()', 'AI_AGE_RESERVE', 'activeState()', 'savingForAge']) {""",
    'marcadores de cierre',
)
VALIDATOR.write_text(validator)
print('Cierre de Era de Conquista aplicado')
