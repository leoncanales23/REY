/* Architecture-only speculative manifest. This is not selectable or playable. */
(() => {
  'use strict';
  FRONTERAS_ERA_CORE.register({schemaVersion:1,id:'mars2135',name:'FRONTERAS // MARTE 2135',version:'0.1.0',rulesVersion:'0.1.0',status:'manifest-only',setting:'fictional-science-fiction',
    entities:{units:{rovers:{name:'Rovers',capabilities:['vehicle']},drones:{name:'Drones',capabilities:['vehicle','uncrewed']}},buildings:{habitats:{name:'Hábitats',capabilities:['infrastructure']},orbital_comms:{name:'Comunicaciones orbitales',capabilities:['communications']}},special:{}},
    resources:{definitions:{energy:{name:'Energía'},oxygen:{name:'Oxígeno'},materials:{name:'Materiales'},communications:{name:'Comunicaciones'}},initial:{},costs:{}},
    ages:{definitions:{}},technologies:{definitions:{}},factions:{definitions:{}},commanders:{abilities:{}},
    world:{defaultMap:null,maps:[],objectives:[],events:[],mercenaryCamps:{}},
    campaign:{missions:[],sources:[],modes:['fictional'],supportedContexts:['habitat-survival','orbital-infrastructure','communications']},
    scenario:{defaults:null},
  });
})();
