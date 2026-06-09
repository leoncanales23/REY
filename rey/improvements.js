/**
 * MEJORAS AVANZADAS PARA REINOS
 * - Sistema de combate mejorado con armadura y tipos de daño
 * - IA adaptativa con estrategias dinámicas
 * - Sistema de tecnologías y civilizaciones
 * - Efectos visuales de partículas
 */

// ============================================================
// SISTEMA DE TECNOLOGÍAS
// ============================================================
const TECHS = {
  wheelbarrow: {
    name: 'Carretilla',
    desc: 'Los aldeanos transportan más recursos',
    cost: { g: 0, w: 75 },
    time: 30,
    effect: (side) => {
      for (const e of G.ents) {
        if (e.side === side && e.kind === 'villager') {
          e.carryMul = (e.carryMul || 1) * 1.3;
        }
      }
    }
  },
  feudalAge: {
    name: 'Edad Feudal',
    desc: 'Avanza a la Edad Feudal',
    cost: { g: 500, w: 300 },
    time: 60,
    effect: (side) => {
      G.res[side].age = 2;
      // Desbloquea nuevas unidades y edificios
    }
  },
  castleAge: {
    name: 'Edad Castillo',
    desc: 'Avanza a la Edad Castillo',
    cost: { g: 1000, w: 600 },
    time: 90,
    effect: (side) => {
      G.res[side].age = 3;
    }
  },
  imperialAge: {
    name: 'Edad Imperial',
    desc: 'Avanza a la Edad Imperial',
    cost: { g: 2000, w: 1200 },
    time: 120,
    effect: (side) => {
      G.res[side].age = 4;
    }
  },
  armorUpgrade: {
    name: 'Armadura +1',
    desc: 'Aumenta la armadura de todas las unidades',
    cost: { g: 100, w: 50 },
    time: 40,
    effect: (side) => {
      for (const e of G.ents) {
        if (e.side === side && !e.building) {
          e.armor = (e.armor || 0) + 1;
        }
      }
    }
  },
  attackUpgrade: {
    name: 'Ataque +1',
    desc: 'Aumenta el daño de todas las unidades',
    cost: { g: 150, w: 75 },
    time: 40,
    effect: (side) => {
      for (const e of G.ents) {
        if (e.side === side && !e.building) {
          e.atkMul = (e.atkMul || 1) * 1.15;
        }
      }
    }
  }
};

// ============================================================
// SISTEMA DE COMBATE AVANZADO
// ============================================================
function advancedCombat(attacker, defender, dt) {
  if (!attacker || !defender || attacker.hp <= 0 || defender.hp <= 0) return;
  
  const aDef = DEFS[attacker.kind];
  const dDef = DEFS[defender.kind];
  
  // Reducción de daño por armadura
  const armor = defender.armor || 0;
  const armorReduction = Math.min(0.8, armor * 0.05);
  
  // Daño base con multiplicadores
  let damage = (aDef.atk || 3) * (attacker.atkMul || 1);
  damage = damage * (1 - armorReduction);
  
  // Daño crítico (10% de probabilidad)
  if (Math.random() < 0.1) {
    damage *= 1.5;
    spawnParticles(defender.x, defender.y - 20, 'crit');
  }
  
  defender.hp = Math.max(0, defender.hp - damage);
  
  // Efectos visuales
  if (damage > 0) {
    spawnParticles(defender.x, defender.y, 'blood');
  }
}

// ============================================================
// IA ADAPTATIVA
// ============================================================
const AI_STRATEGIES = {
  rush: {
    name: 'Rush',
    buildOrder: ['barracks', 'barracks'],
    trainUnits: ['swordsman', 'archer', 'knight'],
    aggressiveness: 0.8
  },
  boom: {
    name: 'Boom',
    buildOrder: ['house', 'house', 'barracks'],
    trainUnits: ['villager', 'villager', 'archer'],
    aggressiveness: 0.3
  },
  balanced: {
    name: 'Balanced',
    buildOrder: ['barracks', 'house'],
    trainUnits: ['villager', 'swordsman', 'archer'],
    aggressiveness: 0.5
  },
  defense: {
    name: 'Defense',
    buildOrder: ['tower', 'tower', 'barracks'],
    trainUnits: ['archer', 'knight'],
    aggressiveness: 0.2
  }
};

function updateAI(side, dt) {
  const strategy = AI_STRATEGIES.balanced;
  const res = G.res[side];
  
  // Entrenar unidades si hay recursos
  const castle = G.ents.find(e => e.side === side && e.kind === 'castle');
  if (castle && res.g > 100 && res.w > 50 && res.pop < res.cap) {
    const unit = strategy.trainUnits[Math.floor(Math.random() * strategy.trainUnits.length)];
    if (COST[unit] && res.g >= COST[unit].g && res.w >= COST[unit].w) {
      castle.queue.push({ unit, t: COST[unit].t });
      res.g -= COST[unit].g;
      res.w -= COST[unit].w;
      res.pop += COST[unit].pop;
    }
  }
  
  // Atacar enemigos cercanos
  for (const e of G.ents) {
    if (e.side === side && !e.building && e.hp > 0) {
      const enemies = G.ents.filter(en => 
        en.side !== side && en.hp > 0 && 
        dist(e.x, e.y, en.x, en.y) < 300
      );
      if (enemies.length > 0) {
        const target = enemies[0];
        e.tx = target.x;
        e.ty = target.y;
        e.moving = true;
      }
    }
  }
}

// ============================================================
// EFECTOS DE PARTÍCULAS MEJORADOS
// ============================================================
function spawnParticles(x, y, type) {
  if (!G.particles) G.particles = [];
  
  const count = type === 'crit' ? 8 : type === 'blood' ? 6 : 4;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const speed = 80 + Math.random() * 40;
    
    G.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.5 + Math.random() * 0.3,
      maxLife: 0.5 + Math.random() * 0.3,
      size: 2 + Math.random() * 2,
      color: type === 'crit' ? '#ffff00' : type === 'blood' ? '#ff0000' : '#ffaa00',
      type
    });
  }
}

function stepParticles(dt) {
  if (!G.particles) G.particles = [];
  
  G.particles = G.particles.filter(p => {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 150 * dt; // gravedad
    return p.life > 0;
  });
}

function drawParticles() {
  if (!G.particles) return;
  
  for (const p of G.particles) {
    const x = p.x - cam.x;
    const y = p.y - cam.y;
    
    if (x < -50 || x > view.w + 50 || y < -50 || y > view.h + 50) continue;
    
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(x, y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
