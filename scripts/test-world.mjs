import assert from 'node:assert/strict';
await import('../rey/world.js');
await import('../rey/determinism.js');
const W=globalThis.REINOS_WORLD;
const empty=W.normalizeProgress(null);
assert(W.unlocked('capital',empty));
assert(!W.unlocked('forest',empty));
assert(!W.unlocked('pass',empty));
assert.deepEqual(W.complete(empty,'pass',3),empty);
assert.deepEqual(W.complete(empty,'capital',0),empty);
for(const raw of [null,[],{version:2,completed:{capital:3}}, {version:1,completed:{pass:3,capital:99,forest:'3'}}]) {
  assert.deepEqual(W.normalizeProgress(raw),empty);
}
let progress=empty;
for(const region of W.REGIONS){
  assert(W.unlocked(region.id,progress));
  progress=W.complete(progress,region.id,3);
  assert.equal(W.complete(progress,region.id,1).completed[region.id],3);
}
assert.equal(Object.keys(progress.completed).length,3);
assert.deepEqual(W.normalizeProgress(JSON.parse(JSON.stringify(progress))),progress);
assert(Object.isFrozen(W.REGIONS[0].palette));
assert.notEqual(REINOS_DETERMINISM.checksum({regionId:'capital'}),REINOS_DETERMINISM.checksum({regionId:'forest'}));
console.log('Regiones: bloqueo secuencial, persistencia saneada, estrellas idempotentes y checksum verificados.');
