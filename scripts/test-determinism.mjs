import assert from 'node:assert/strict';

await import('../rey/determinism.js');

const { checksum, canonicalState, VERSION } = globalThis.REINOS_DETERMINISM;
assert.equal(VERSION, 'reinos-state-v1');

const base = {
  tick: 40,
  time: 2,
  seed: 77,
  nextId: 8,
  winner: null,
  victoryReason: null,
  res: {
    red: { g: 200, w: 150, pop: 2, cap: 10, age: 2, techs: { masonry: true, wheelbarrow: true } },
    blue: { g: 190, w: 140, pop: 2, cap: 10, age: 2, techs: { fletching: true } },
  },
  ents: [
    { id: 2, side: 'blue', kind: 'archer', x: 800, y: 500, hp: 58, maxHp: 58, constructed: true, queue: [] },
    { id: 1, side: 'red', kind: 'king', x: 300, y: 500, hp: 460, maxHp: 460, constructed: true, queue: [] },
  ],
  nodes: [
    { id: 7, type: 'wood', x: 600, y: 400, amount: 320 },
    { id: 6, type: 'gold', x: 500, y: 400, amount: 1200 },
  ],
  projectiles: [],
  objectives: [
    { id: 'south', owner: null, control: 0 },
    { id: 'crown', owner: 'red', control: 20 },
  ],
  dominance: { red: 5, blue: 0 },
  commanders: { red: { cooldown: 0, active: 0 }, blue: { cooldown: 0, active: 0 } },
  mercenaryCamps: [],
  worldEvent: { id: null, t: 0, nextAt: 65, serial: 0, seen: 0 },
  stats: { red: { commanderUses: 0, mercenariesHired: 0 }, blue: { commanderUses: 0, mercenariesHired: 0 } },
};

const reordered = structuredClone(base);
reordered.ents.reverse();
reordered.nodes.reverse();
reordered.objectives.reverse();
reordered.res.red.techs = { wheelbarrow: true, masonry: true };

assert.equal(checksum(base), checksum(reordered), 'el orden incidental no debe alterar el checksum');
assert.deepEqual(canonicalState(base), canonicalState(reordered));

const mutated = structuredClone(base);
mutated.ents[0].hp -= 1;
assert.notEqual(checksum(base), checksum(mutated), 'una mutación de simulación debe cambiar el checksum');

const moved = structuredClone(base);
moved.ents[1].x += 0.01;
assert.notEqual(checksum(base), checksum(moved), 'el checksum debe detectar movimiento real');

console.log(`Checksum canónico ${checksum(base)} · contrato determinista verificado.`);
