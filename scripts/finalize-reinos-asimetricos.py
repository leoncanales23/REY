from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        if new in source:
            return source
        raise RuntimeError(f'No se encontró el anclaje: {label}')
    return source.replace(old, new, 1)


game_path = Path('rey/game.js')
game = game_path.read_text(encoding='utf-8')

game = replace_once(
    game,
    "  // Bastiones neutrales: siempre conocidos por ambos reinos\n  for(const objective of (S.objectives||[])) drawObjective(objective);\n\n",
    "",
    'retirar Bastiones bajo niebla',
)

game = replace_once(
    game,
    "  // Niebla de guerra encima del mapa\n  if(fogEnabled) FOG.draw();\n\n  drawFlowFieldDebug();",
    "  // Niebla de guerra encima del mapa\n  if(fogEnabled) FOG.draw();\n\n  // OBJECTIVES_AFTER_FOG: los Bastiones son conocimiento estratégico público.\n  ctx.save(); ctx.translate(-cam.x,-cam.y);\n  for(const objective of (S.objectives||[])) drawObjective(objective);\n  ctx.restore();\n\n  drawFlowFieldDebug();",
    'Bastiones visibles sobre niebla',
)

game = replace_once(
    game,
    "  const threshold = profile.attackBase + Math.floor(G.time/profile.attackGrowth);\n  const enemyCastle = G.ents.find(e=>e.side===mySide && e.kind==='castle');\n  const objectiveTarget=objectiveCount(G,side)<2?aiObjectiveTarget(side):null;\n  const attackTarget=objectiveTarget || enemyCastle;\n  const requiredArmy=objectiveTarget?Math.max(3,threshold-1):threshold;",
    "  const threshold = profile.attackBase + Math.floor(G.time/profile.attackGrowth);\n  const enemyCastle = G.ents.find(e=>e.side===mySide && e.kind==='castle');\n  const ownedObjectives=objectiveCount(G,side);\n  // AI_HOLD_SUPREMACY: no abandona los Bastiones mientras corre el contador.\n  const holdingSupremacy=ownedObjectives>=2 && G.dominance[side]>0;\n  const objectiveTarget=ownedObjectives<2?aiObjectiveTarget(side):null;\n  const attackTarget=holdingSupremacy?null:(objectiveTarget || enemyCastle);\n  const requiredArmy=objectiveTarget?Math.max(3,threshold-1):threshold;",
    'defensa de supremacía IA',
)

game_path.write_text(game, encoding='utf-8')

validator_path = Path('scripts/validate.mjs')
validator = validator_path.read_text(encoding='utf-8')
validator = replace_once(
    validator,
    "for (const marker of ['const FACTIONS =', 'OBJECTIVE_DEFS', 'stepObjectives(dt)', \"victoryReason='supremacy'\", 'objectives: G.objectives', 'aiObjectiveTarget', 'FOG.update(mySide,S)']) {",
    "for (const marker of ['const FACTIONS =', 'OBJECTIVE_DEFS', 'stepObjectives(dt)', \"victoryReason='supremacy'\", 'objectives: G.objectives', 'aiObjectiveTarget', 'FOG.update(mySide,S)', 'AI_HOLD_SUPREMACY', 'OBJECTIVES_AFTER_FOG']) {",
    'candados de hardening',
)
validator_path.write_text(validator, encoding='utf-8')

print('Hardening de Reinos Asimétricos aplicado')
