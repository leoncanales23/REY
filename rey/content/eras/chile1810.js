/* Architecture-only manifest. No unit stats, force sizes, uniforms, or scenarios are asserted. */
(() => {
  'use strict';
  FRONTERAS_ERA_CORE.register({schemaVersion:1,id:'chile1810',name:'FRONTERAS // CHILE 1810–1826',version:'0.1.0',rulesVersion:'0.1.0',status:'manifest-only',setting:'historical',
    entities:{units:{line_infantry:{name:'Infantería de línea',capabilities:['infantry','formation']},cazadores:{name:'Cazadores',capabilities:['infantry','scouting']},grenadiers:{name:'Granaderos',capabilities:['infantry']},militia:{name:'Milicias',capabilities:['infantry','local-defense']},cavalry:{name:'Caballería',capabilities:['mounted']},artillery:{name:'Artillería',capabilities:['crew-served']},officers:{name:'Oficiales y comandantes',capabilities:['command']}},buildings:{},special:{}},
    resources:{definitions:{supplies:{name:'Suministros'},ammunition:{name:'Munición'},morale:{name:'Moral'}},initial:{},costs:{}},
    ages:{definitions:{}},technologies:{definitions:{}},factions:{definitions:{}},commanders:{abilities:{},roster:[
      {id:'bernardo_ohiggins',name:"Bernardo O'Higgins",status:'planned',sources:[]},
      {id:'jose_de_san_martin',name:'José de San Martín',status:'planned',sources:[]},
      {id:'jose_miguel_carrera',name:'José Miguel Carrera',status:'planned',sources:[]},
      {id:'manuel_rodriguez',name:'Manuel Rodríguez',status:'planned',sources:[]},
      {id:'estanislao_soler',name:'Estanislao Soler',status:'planned',sources:[]},
      {id:'juan_gregorio_de_las_heras',name:'Juan Gregorio de Las Heras',status:'planned',sources:[]},
      {id:'manuel_blanco_encalada',name:'Manuel Blanco Encalada',status:'planned',sources:[]},
      {id:'jose_manuel_borgono',name:'José Manuel Borgoño',status:'planned',sources:[]},
      {id:'santiago_bueras',name:'Santiago Bueras',status:'planned',sources:[]},
      {id:'mariano_osorio',name:'Mariano Osorio',status:'planned',sources:[]},
      {id:'gabino_gainza',name:'Gabino Gaínza',status:'planned',sources:[]},
      {id:'casimiro_marco_del_pont',name:'Casimiro Marcó del Pont',status:'planned',sources:[]},
      {id:'rafael_maroto',name:'Rafael Maroto',status:'planned',sources:[]},
    ]},
    world:{defaultMap:null,maps:[],objectives:[],events:[],mercenaryCamps:{}},
    campaign:{missions:[],sources:[],modes:['historical','alternate'],supportedContexts:['logistics-routes','defensive-positions','intelligence','guerrilla','campaign'],sourcePolicy:'historical missions require cited sources'},
    scenario:{defaults:null},
  });
})();
