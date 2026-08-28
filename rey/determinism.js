(() => {
  'use strict';

  const VERSION = 'reinos-state-v1';
  const encoder = typeof TextEncoder === 'function' ? new TextEncoder() : null;
  const number = (value, scale = 1000) => Math.round((Number(value) || 0) * scale) / scale;

  function techList(value) {
    return Object.keys(value || {}).filter((key) => value[key]).sort();
  }

  function canonicalResearch(value) {
    if (!value) return null;
    return { id: String(value.id || ''), t: number(value.t) };
  }

  function canonicalResources(value) {
    return {
      g: number(value?.g),
      w: number(value?.w),
      pop: number(value?.pop),
      cap: number(value?.cap),
      age: Number(value?.age) || 1,
      techs: techList(value?.techs),
      research: canonicalResearch(value?.research),
    };
  }

  function canonicalEntity(entity) {
    return {
      id: Number(entity?.id) || 0,
      side: String(entity?.side || ''),
      kind: String(entity?.kind || ''),
      x: number(entity?.x),
      y: number(entity?.y),
      hp: number(entity?.hp),
      maxHp: number(entity?.maxHp),
      constructed: entity?.constructed !== false,
      bp: number(entity?.bp),
      moving: !!entity?.moving,
      tx: number(entity?.tx),
      ty: number(entity?.ty),
      targetId: Number(entity?.targetId) || 0,
      nodeId: Number(entity?.nodeId) || 0,
      carry: number(entity?.carry),
      carryType: entity?.carryType || null,
      cooldown: number(entity?.cd),
      queue: (entity?.queue || []).map((item) => ({ unit: String(item?.unit || ''), t: number(item?.t) })),
      order: entity?.order ? {
        type: String(entity.order.type || ''),
        x: number(entity.order.x),
        y: number(entity.order.y),
        targetId: Number(entity.order.targetId) || 0,
      } : null,
    };
  }

  function canonicalNode(node) {
    return {
      id: Number(node?.id) || 0,
      type: String(node?.type || ''),
      x: number(node?.x),
      y: number(node?.y),
      amount: number(node?.amount),
    };
  }

  function canonicalObjective(objective) {
    return {
      id: String(objective?.id || ''),
      owner: objective?.owner || null,
      control: number(objective?.control),
    };
  }

  function canonicalCommander(value) {
    return {
      cooldown: number(value?.cooldown),
      active: number(value?.active),
      reveal: value?.reveal ? {
        x: number(value.reveal.x),
        y: number(value.reveal.y),
        r: number(value.reveal.r),
        t: number(value.reveal.t),
      } : null,
    };
  }

  function canonicalScenario(value) {
    if (!value) return null;
    return {
      title: String(value.title || ''),
      victoryMode: String(value.victoryMode || ''),
      holdSeconds: number(value.holdSeconds),
      hold: number(value.hold),
      holdBySide: {
        red: number(value.holdBySide?.red),
        blue: number(value.holdBySide?.blue),
      },
      completed: !!value.completed,
    };
  }

  function canonicalCampaign(value) {
    if (!value) return null;
    return {
      id: String(value.id || ''),
      hold: number(value.hold),
      completed: !!value.completed,
      stars: Number(value.stars) || 0,
      failure: value.failure || null,
    };
  }

  function canonicalState(state) {
    if (!state || typeof state !== 'object') return null;
    return {
      version: VERSION,
      tick: Number(state.tick) || 0,
      time: number(state.time),
      seed: Number(state.seed) >>> 0,
      nextId: Number(state.nextId) || 0,
      winner: state.winner || null,
      victoryReason: state.victoryReason || null,
      res: {
        red: canonicalResources(state.res?.red),
        blue: canonicalResources(state.res?.blue),
      },
      ents: (state.ents || []).map(canonicalEntity).sort((a, b) => a.id - b.id),
      nodes: (state.nodes || []).map(canonicalNode).sort((a, b) => a.id - b.id),
      projectiles: (state.projectiles || []).map((item) => ({
        side: String(item?.side || ''),
        kind: String(item?.kind || ''),
        targetId: Number(item?.targetId) || 0,
        x: number(item?.x),
        y: number(item?.y),
        dmg: number(item?.dmg),
      })).sort((a, b) => `${a.side}:${a.targetId}:${a.x}:${a.y}`.localeCompare(`${b.side}:${b.targetId}:${b.x}:${b.y}`)),
      objectives: (state.objectives || []).map(canonicalObjective).sort((a, b) => a.id.localeCompare(b.id)),
      dominance: { red: number(state.dominance?.red), blue: number(state.dominance?.blue) },
      commanders: {
        red: canonicalCommander(state.commanders?.red),
        blue: canonicalCommander(state.commanders?.blue),
      },
      mercenaryCamps: (state.mercenaryCamps || []).map((camp) => ({
        id: String(camp?.id || ''),
        cooldown: number(camp?.cooldown),
        lastSide: camp?.lastSide || null,
      })).sort((a, b) => a.id.localeCompare(b.id)),
      worldEvent: {
        id: state.worldEvent?.id || null,
        t: number(state.worldEvent?.t),
        nextAt: number(state.worldEvent?.nextAt),
        warning: state.worldEvent?.warning || null,
        warningT: number(state.worldEvent?.warningT),
        serial: Number(state.worldEvent?.serial) || 0,
        seen: Number(state.worldEvent?.seen) || 0,
        lastId: state.worldEvent?.lastId || null,
      },
      stats: {
        red: {
          commanderUses: Number(state.stats?.red?.commanderUses) || 0,
          mercenariesHired: Number(state.stats?.red?.mercenariesHired) || 0,
        },
        blue: {
          commanderUses: Number(state.stats?.blue?.commanderUses) || 0,
          mercenariesHired: Number(state.stats?.blue?.mercenariesHired) || 0,
        },
      },
      scenario: canonicalScenario(state.scenario),
      campaign: canonicalCampaign(state.campaign),
    };
  }

  function bytesOf(value) {
    if (encoder) return encoder.encode(value);
    const bytes = [];
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      bytes.push(code & 255, code >>> 8);
    }
    return bytes;
  }

  function fnv1a(value) {
    let hash = 0x811c9dc5;
    for (const byte of bytesOf(value)) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  function checksum(state) {
    const canonical = canonicalState(state);
    return canonical ? fnv1a(JSON.stringify(canonical)) : null;
  }

  globalThis.REINOS_DETERMINISM = Object.freeze({ VERSION, canonicalState, checksum, fnv1a });
})();
