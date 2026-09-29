/* FRONTERAS Era Core: validates and indexes content packs before simulation boot. */
(() => {
  'use strict';

  const packs = new Map();
  let activeId = null;
  const ID = /^[a-z][a-z0-9-]{1,31}$/;
  const KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/;
  const VERSION = /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i;

  function plain(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function freeze(value) {
    if (plain(value) || Array.isArray(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function requiredMap(value, path) {
    if (!plain(value)) throw new TypeError(`Era Pack inválido: ${path} debe ser un objeto`);
    for (const [key, item] of Object.entries(value)) {
      if (!KEY.test(key) || !plain(item)) throw new TypeError(`Era Pack inválido: ${path}.${key}`);
    }
    return value;
  }

  function register(input) {
    if (!plain(input) || !ID.test(input.id) || !VERSION.test(input.version) || !VERSION.test(input.rulesVersion)) {
      throw new TypeError('Era Pack inválido: id, version y rulesVersion son obligatorios');
    }
    for (const group of ['entities', 'resources', 'ages', 'technologies', 'factions', 'commanders', 'world', 'campaign', 'scenario']) {
      if (!plain(input[group])) throw new TypeError(`Era Pack inválido: falta ${group}`);
    }
    requiredMap(input.entities.units, 'entities.units');
    requiredMap(input.entities.buildings, 'entities.buildings');
    requiredMap(input.entities.special, 'entities.special');
    requiredMap(input.resources.definitions, 'resources.definitions');
    requiredMap(input.ages.definitions, 'ages.definitions');
    requiredMap(input.technologies.definitions, 'technologies.definitions');
    requiredMap(input.factions.definitions, 'factions.definitions');
    requiredMap(input.commanders.abilities, 'commanders.abilities');
    if (input.commanders.roster != null && !Array.isArray(input.commanders.roster)) throw new TypeError('Era Pack inválido: commanders.roster debe ser una lista');
    const commanderIds = new Set();
    for (const commander of input.commanders.roster || []) {
      if (!plain(commander) || !KEY.test(commander.id) || commanderIds.has(commander.id) || typeof commander.name !== 'string') throw new TypeError('Registro de comandante inválido');
      commanderIds.add(commander.id);
    }
    if (!Array.isArray(input.campaign.missions) || !Array.isArray(input.campaign.sources)) {
      throw new TypeError('Era Pack inválido: campaign.missions y campaign.sources deben ser listas');
    }
    if (!Array.isArray(input.world.maps) || !Array.isArray(input.world.objectives) || !(Array.isArray(input.world.events) || plain(input.world.events))) {
      throw new TypeError('Era Pack inválido: world requiere maps, objectives y events');
    }
    const sourceIds = new Set();
    for (const source of input.campaign.sources) {
      if (!plain(source) || !KEY.test(source.id) || sourceIds.has(source.id) || typeof source.title !== 'string' || typeof source.url !== 'string') throw new TypeError('Referencia bibliográfica inválida');
      if (!/^https:\/\//i.test(source.url)) throw new TypeError('Las fuentes externas deben usar HTTPS');
      sourceIds.add(source.id);
    }
    const seen = new Set();
    for (const mission of input.campaign.missions) {
      if (!plain(mission) || !KEY.test(mission.id) || seen.has(mission.id)) throw new TypeError('Era Pack inválido: id de misión duplicado o incorrecto');
      seen.add(mission.id);
      if (mission.mode === 'historical' && (!Array.isArray(mission.sources) || mission.sources.length === 0 || mission.sources.some(id => !sourceIds.has(id)))) {
        throw new TypeError(`Misión histórica ${mission.id} requiere fuentes verificables en campaign.sources`);
      }
    }
    const pack = freeze(clone(input));
    packs.set(pack.id, pack);
    if (!activeId && pack.status === 'playable') activeId = pack.id;
    return pack;
  }

  function get(id) { return packs.get(id) || null; }
  function active() { return get(activeId); }
  function activate(id) {
    const pack = get(id);
    if (!pack) return false;
    activeId = id;
    return true;
  }
  function list() { return [...packs.values()]; }

  function commandCatalog(pack = active()) {
    if (!pack) return null;
    const trainable = Object.keys(pack.entities.units).filter(id => pack.entities.units[id].trainable === true);
    const buildable = Object.keys(pack.entities.buildings).filter(id => pack.entities.buildings[id].buildable === true);
    return Object.freeze({
      units: new Set(trainable), buildings: new Set(buildable),
      research: new Set(Object.keys(pack.technologies.definitions)),
      abilities: new Set(Object.keys(pack.commanders.abilities)),
      camps: new Set(Object.keys(pack.world.mercenaryCamps || {})),
      resources: new Set(Object.keys(pack.resources.definitions)),
    });
  }

  function contract(pack = active(), match = {}) {
    if (!pack) return null;
    return Object.freeze({
      eraId: pack.id, eraVersion: pack.version, rulesVersion: pack.rulesVersion,
      mapId: String(match.mapId || pack.world.defaultMap || ''), seed: Number(match.seed) >>> 0,
    });
  }

  function matchesContract(remote, local = contract()) {
    if (!plain(remote) || !local) return false;
    return remote.eraId === local.eraId && remote.eraVersion === local.eraVersion &&
      remote.rulesVersion === local.rulesVersion && remote.mapId === local.mapId &&
      Number.isInteger(remote.seed) && remote.seed > 0 &&
      Number.isInteger(local.seed) && local.seed > 0 && remote.seed === local.seed;
  }

  globalThis.FRONTERAS_ERA_CORE = Object.freeze({
    schemaVersion: 1, register, get, active, activate, list, commandCatalog, contract, matchesContract,
  });
})();
