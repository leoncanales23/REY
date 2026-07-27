from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        if new in source:
            return source
        raise RuntimeError(f'No se encontró el anclaje: {label}')
    return source.replace(old, new, 1)


game_path = Path('rey/game.js')
game = game_path.read_text(encoding='utf-8')

# Validate Nelson target before mutating cooldown/active state.
game = replace_once(
    game,
    "  if(r.age<def.age || commander.cooldown>0) return false;\n  commander.cooldown=def.cooldown; commander.active=def.duration;\n  if(side==='blue'){\n    if(!Number.isFinite(x)||!Number.isFinite(y)) return false;\n    commander.reveal={x:clamp(x,0,MAP_W),y:clamp(y,0,MAP_H),r:def.radius,t:def.duration};\n  }",
    "  if(r.age<def.age || commander.cooldown>0) return false;\n  // ABILITY_TARGET_VALIDATED_FIRST: nunca consume enfriamiento con un objetivo inválido.\n  if(side==='blue' && (!Number.isFinite(x)||!Number.isFinite(y))) return false;\n  commander.cooldown=def.cooldown; commander.active=def.duration;\n  if(side==='blue'){\n    commander.reveal={x:clamp(x,0,MAP_W),y:clamp(y,0,MAP_H),r:def.radius,t:def.duration};\n  }",
    'validación previa de habilidad',
)

# Ojo del Horizonte must have simulation value for humans and AI, not only reveal fog.
game = replace_once(
    game,
    "    note:'revela una gran zona al centro de la cámara',",
    "    note:'revela una zona y da +18% daño de proyectiles contra objetivos dentro',",
    'descripción Ojo del Horizonte',
)

projectile_bonus = """function horizonProjectileDamage(from,tgt,dmg){
  const reveal=G.commanders?.blue?.reveal;
  if(from.side==='blue' && reveal && reveal.t>0 && dist(tgt.x,tgt.y,reveal.x,reveal.y)<=reveal.r){
    // HORIZON_PROJECTILE_BONUS: convierte inteligencia en ventaja táctica real.
    return dmg*1.18;
  }
  return dmg;
}
"""
game = replace_once(
    game,
    "function shoot(from, tgt, dmg, fromBuilding){\n  G.projectiles.push({\n    x:from.x, y:from.y, targetId:tgt.id, dmg, side:from.side,",
    projectile_bonus + "function shoot(from, tgt, dmg, fromBuilding){\n  G.projectiles.push({\n    x:from.x, y:from.y, targetId:tgt.id, dmg:horizonProjectileDamage(from,tgt,dmg), side:from.side,",
    'bonificación de proyectiles',
)

# Blue AI only spends the power when it has ranged forces that can exploit it.
game = replace_once(
    game,
    "  if(target) return useCommanderAbility(side,def.id,king.id,target.x,target.y);\n  return false;",
    "  const ranged=army.filter((unit)=>unit.kind==='archer').length;\n  if(target && ranged>=2) return useCommanderAbility(side,def.id,king.id,target.x,target.y);\n  return false;",
    'uso táctico de Nelson IA',
)

# Draw Nelson's reveal zone after fog and before public map objectives.
game = replace_once(
    game,
    "  // OBJECTIVES_AFTER_FOG: los Bastiones son conocimiento estratégico público.\n  ctx.save(); ctx.translate(-cam.x,-cam.y);\n  for(const objective of (S.objectives||[])) drawObjective(objective);",
    "  // OBJECTIVES_AFTER_FOG: los Bastiones son conocimiento estratégico público.\n  ctx.save(); ctx.translate(-cam.x,-cam.y);\n  const ownReveal=S.commanders?.[mySide]?.reveal;\n  if(ownReveal && ownReveal.t>0) drawHorizonReveal(ownReveal);\n  for(const objective of (S.objectives||[])) drawObjective(objective);",
    'zona revelada visible',
)

reveal_draw = """function drawHorizonReveal(reveal){
  // COMMANDER_VISUAL_SIGNAL: la zona activa debe leerse sin abrir el HUD.
  const pulse=0.65+Math.sin(performance.now()/180)*0.12;
  ctx.save();
  ctx.fillStyle='rgba(70,150,255,0.08)'; circle(reveal.x,reveal.y,reveal.r);
  ctx.strokeStyle=`rgba(100,190,255,${pulse})`; ctx.lineWidth=4;
  ctx.setLineDash([12,8]);
  ctx.beginPath(); ctx.arc(reveal.x,reveal.y,reveal.r,0,Math.PI*2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle='#bfe4ff'; ctx.font='bold 18px VT323, monospace'; ctx.textAlign='center';
  ctx.fillText('OJO DEL HORIZONTE',reveal.x,reveal.y-reveal.r-12);
  ctx.restore();
}

"""
game = replace_once(game, 'function drawObjective(objective){', reveal_draw + 'function drawObjective(objective){', 'dibujo de Ojo del Horizonte')

# Make León's official active radius unmistakable while preserving the passive aura.
game = replace_once(
    game,
    "    if(e.side==='red'){\n      ctx.strokeStyle='rgba(255,80,60,0.18)'; ctx.lineWidth=3;\n      ctx.beginPath(); ctx.arc(x,y,FACTIONS.red.kingAuraRange,0,Math.PI*2); ctx.stroke();\n    }",
    "    if(e.side==='red'){\n      const commander=commanderOf('red',renderState());\n      const active=!!commander && commander.active>0;\n      const auraRadius=active?COMMANDER_ABILITIES.red.radius:FACTIONS.red.kingAuraRange;\n      ctx.strokeStyle=active?'rgba(255,80,50,0.82)':'rgba(255,80,60,0.18)'; ctx.lineWidth=active?5:3;\n      if(active) ctx.setLineDash([10,7]);\n      ctx.beginPath(); ctx.arc(x,y,auraRadius,0,Math.PI*2); ctx.stroke();\n      ctx.setLineDash([]);\n    }",
    'señal visual Rugido',
)

game = replace_once(
    game,
    "    // Héroes: regeneración lenta y expiración de buff temporal (trampita)",
    "    // Héroes: regeneración lenta y compatibilidad con efectos temporales",
    'comentario obsoleto',
)

game_path.write_text(game, encoding='utf-8')

readme_path = Path('README.md')
readme = readme_path.read_text(encoding='utf-8')
readme = replace_once(
    readme,
    "Nelson utiliza **Ojo del Horizonte** para revelar una región amplia incluso durante Niebla Negra.",
    "Nelson utiliza **Ojo del Horizonte** para revelar una región amplia incluso durante Niebla Negra y aumentar 18% el daño de proyectiles contra objetivos dentro de esa zona.",
    'README poder de Nelson',
)
readme_path.write_text(readme, encoding='utf-8')

validator_path = Path('scripts/validate.mjs')
validator = validator_path.read_text(encoding='utf-8')
validator = replace_once(
    validator,
    "for (const marker of ['const COMMANDER_ABILITIES =', 'MERCENARY_CAMP_DEFS', 'useCommanderAbility', 'hireMercenaries', 'stepWorldEvents(dt)', 'WORLD_EVENT_WARNING', 'AI_COMMANDER_USAGE', 'CLIENT_WORLD_ANNOUNCEMENT', 'mercenaryCamps:G.mercenaryCamps']) {",
    "for (const marker of ['const COMMANDER_ABILITIES =', 'MERCENARY_CAMP_DEFS', 'useCommanderAbility', 'hireMercenaries', 'stepWorldEvents(dt)', 'WORLD_EVENT_WARNING', 'AI_COMMANDER_USAGE', 'CLIENT_WORLD_ANNOUNCEMENT', 'mercenaryCamps:G.mercenaryCamps', 'ABILITY_TARGET_VALIDATED_FIRST', 'HORIZON_PROJECTILE_BONUS', 'COMMANDER_VISUAL_SIGNAL']) {",
    'candados de hardening comandante',
)
validator_path.write_text(validator, encoding='utf-8')

print('Hardening de Comandantes y Eventos aplicado')
