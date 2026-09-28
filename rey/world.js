/* Regional content and local campaign progression; no network or rendering state. */
(() => {
  'use strict';
  const REGIONS = [
    { id:'capital', name:'Capital Real', mission:'crownVacant', requires:[], biome:'valley',
      x:29, y:67, crest:'♜', difficulty:'Explorador', chapter:'I · El corazón del reino',
      description:'Las campanas callaron cuando cayó la vieja corona. Recupera los caminos del valle y devuelve un estandarte a sus murallas.',
      objective:'Sostén el Bastión de la Corona 35 s o vence por conquista. Mantén vivo a León.',
      reward:'Abre la ruta al Bosque Negro · sello de la Corona',
      rules:'Valle abierto · reservas de oro +15% para ambos reinos',
      palette:['#586b3b','#506437','#657747','#52683a','#607344'], sight:1, gold:1.15, wood:1,
      water:0.02, mud:0.10, ridge:false,
      territory:'130,390 185,300 300,265 435,325 455,440 370,540 235,560 145,495' },
    { id:'forest', name:'Bosque Negro', mission:'steelPact', requires:['capital'], biome:'forest',
      x:53, y:42, crest:'♣', difficulty:'Guerrero', chapter:'II · Juramentos entre sombras',
      description:'Bajo las copas antiguas, los gremios guardan las rutas del norte. Nelson deberá ver donde otros marchan a ciegas y convertir oro en lealtad.',
      objective:'Vence por castillo o supremacía. Mantén vivo a Nelson; contrata guardias y usa Ojo del Horizonte para ganar estrellas.',
      reward:'Abre el Paso de la Montaña · sello del Bosque',
      rules:'Visión −15% · madera por árbol +50% · más suelo lento; afecta a ambos reinos',
      palette:['#233e35','#2c4b3c','#304c3e','#254237','#355342'], sight:0.85, gold:1, wood:1.5,
      water:0.03, mud:0.28, ridge:false,
      territory:'300,265 335,170 460,115 610,150 665,245 605,350 455,440 435,325' },
    { id:'pass', name:'Paso de la Montaña', mission:'lastCrown', requires:['forest'], biome:'mountain',
      x:77, y:24, crest:'▲', difficulty:'Conquistador', chapter:'III · La última frontera',
      description:'Más allá de los pinares, la cordillera corta el cielo. La niebla anuncia la última batalla: quien controle los caminos controlará el reino.',
      objective:'Vence por castillo o supremacía y conserva a León. Combina poderes, contratos y Bastiones.',
      reward:'Sello de las Cumbres · las tres regiones bajo tu estandarte',
      rules:'Laderas lentas y rutas rápidas · oro +30% · madera −20% para ambos reinos',
      palette:['#606c70','#6b7779','#7c8784','#566569','#778580'], sight:1, gold:1.3, wood:0.8,
      water:0.01, mud:0.17, ridge:true,
      territory:'610,150 655,70 790,40 920,90 945,200 840,285 665,245' },
  ];
  function freeze(value) {
    Object.values(value).forEach(item => { if(item && typeof item==='object') freeze(item); });
    return Object.freeze(value);
  }
  freeze(REGIONS);
  const get = id => REGIONS.find(region => region.id===id) || null;
  function normalizeProgress(input) {
    const completed = {};
    for(const region of REGIONS) {
      const stars=input?.version===1 ? input.completed?.[region.id] : null;
      if(Number.isInteger(stars) && stars>=1 && stars<=3 && region.requires.every(id=>completed[id])) completed[region.id]=stars;
    }
    return {version:1,completed};
  }
  function unlocked(id, input) {
    const region=get(id), progress=normalizeProgress(input);
    return !!region && region.requires.every(key=>progress.completed[key]);
  }
  function complete(input,id,stars) {
    const progress=normalizeProgress(input);
    if(!unlocked(id,progress) || !Number.isInteger(stars) || stars<1 || stars>3) return progress;
    progress.completed[id]=Math.max(progress.completed[id]||0,stars);
    return progress;
  }
  // Pure terrain mapping. Central travel routes and starting areas remain clear in the engine.
  function tile(region,cx,cy,noise) {
    if(region.ridge && Math.abs(cx-16)>2 && cy%7<2) return {biome:1,cost:2.5};
    if(noise<region.water) return {biome:2,cost:255};
    if(noise<region.mud) return {biome:1,cost:2.5};
    return {biome:0,cost:1};
  }
  globalThis.REINOS_WORLD=Object.freeze({REGIONS,get,normalizeProgress,unlocked,complete,tile});
})();
