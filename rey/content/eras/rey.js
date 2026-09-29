/* Existing REY balance and match content, moved intact out of the simulation module. */
(() => {
  'use strict';
  const MAP_W = 2600, MAP_H = 1700;
  const units = {
    villager:{hp:42,r:9,speed:64,atk:3,cd:1,range:16,sight:130,name:'Aldeano',gather:9,carry:12,worker:true,trainable:true},
    swordsman:{hp:130,r:12,speed:56,atk:14,cd:1.1,range:18,sight:160,name:'Espadachín',trainable:true,combat:true},
    archer:{hp:58,r:10,speed:60,atk:12,cd:1.3,range:128,sight:185,name:'Arquero',ranged:true,trainable:true,combat:true},
    knight:{hp:190,r:14,speed:94,atk:19,cd:1.15,range:20,sight:170,name:'Caballero',trainable:true,combat:true,population:2},
    mercenary:{hp:155,r:12,speed:66,atk:17,cd:1.05,range:19,sight:175,name:'Guardia Mercenaria',combat:true},
    king:{hp:460,r:17,speed:80,atk:28,cd:1,range:22,sight:210,name:'Rey',hero:true,commander:true,regen:5},
  };
  const buildings = {
    castle:{hp:2200,r:36,range:185,atk:20,cd:1.1,sight:260,name:'Castillo',building:true,objectiveAnchor:true},
    house:{hp:520,r:24,name:'Casa',building:true,pop:5,buildable:true},
    barracks:{hp:950,r:30,name:'Cuartel',building:true,buildable:true},
    tower:{hp:760,r:20,range:160,atk:15,cd:.9,sight:200,name:'Torre',building:true,buildable:true,defense:true},
  };
  FRONTERAS_ERA_CORE.register({
    schemaVersion:1,id:'rey',name:'FRONTERAS // REY',version:'1.0.0',rulesVersion:'1.0.0',status:'playable',setting:'medieval-fantasy',
    entities:{units,buildings,special:{}},
    resources:{definitions:{gold:{name:'Oro',icon:'🪙',slot:'g',radius:22},wood:{name:'Madera',icon:'🪵',slot:'w',radius:14}},initial:{gold:200,wood:200},costs:{
      villager:{g:50,w:0,pop:1,t:6,from:'castle'},swordsman:{g:60,w:20,pop:1,t:9,from:'barracks'},
      archer:{g:40,w:40,pop:1,t:9,from:'barracks'},knight:{g:80,w:40,pop:2,t:14,from:'barracks'},
      house:{g:0,w:30,build:true},barracks:{g:0,w:150,build:true},tower:{g:50,w:50,build:true},
    }},
    ages:{definitions:{1:{name:'EDAD DE ALDEA'},2:{name:'EDAD DE FORTALEZA'},3:{name:'EDAD IMPERIAL'}},unit:{villager:1,swordsman:1,archer:2,knight:3},building:{house:1,barracks:1,tower:2}},
    technologies:{definitions:{
      age2:{name:'Avanzar a Fortaleza',age:1,toAge:2,g:350,w:250,t:35,from:'castle'},
      age3:{name:'Avanzar a Imperial',age:2,toAge:3,g:650,w:450,t:50,from:'castle'},
      wheelbarrow:{name:'Carretilla',age:1,g:180,w:120,t:25,from:'castle',note:'+25% recolección y carga'},
      masonry:{name:'Mampostería',age:2,g:260,w:260,t:35,from:'castle',note:'+22% vida de edificios'},
      forgedBlades:{name:'Filos Forjados',age:2,g:240,w:160,t:30,from:'barracks',note:'+15% daño cuerpo a cuerpo'},
      fletching:{name:'Emplumado',age:2,g:220,w:220,t:30,from:'barracks',note:'+12% daño y +20 alcance'},
      cavalry:{name:'Cría de Guerra',age:3,g:360,w:260,t:40,from:'barracks',note:'+18% velocidad y +15% vida de caballeros'},
    }},
    factions:{definitions:{
      red:{name:'LEGIÓN DEL RUGIDO',displayName:'LEÓN',short:'RUGIDO',description:'Presión cuerpo a cuerpo y aura del Rey León',meleeAttack:1.1,kingAuraAttack:1.12,kingAuraSpeed:1.12,kingAuraRange:170,capturePower:1.12,color:{main:'#ff3b3b',dark:'#7a1414',light:'#ff8a8a'}},
      blue:{name:'ORDEN DEL HORIZONTE',displayName:'NELSON',short:'HORIZONTE',description:'Alcance, visión y economía técnica de Nelson',rangedRange:18,villagerGather:1.1,sight:1.15,capturePower:1,color:{main:'#3b8bff',dark:'#143a7a',light:'#8ac0ff'}},
    }},
    commanders:{abilities:{warCry:{id:'warCry',side:'red',name:'RUGIDO DE GUERRA',age:2,cooldown:70,duration:12,radius:220,attack:1.25,speed:1.2,note:'+25% daño y +20% velocidad cerca del Rey León'},horizonEye:{id:'horizonEye',side:'blue',name:'OJO DEL HORIZONTE',age:2,cooldown:65,duration:14,radius:340,note:'revela una zona y da +18% daño de proyectiles contra objetivos dentro'}}},
    world:{defaultMap:'reinos-standard',objectiveRadius:92,dominanceSeconds:75,mercenaryRadius:150,worldEventWarning:12,maps:[{id:'reinos-standard',name:'Campos de los Dos Reinos',width:MAP_W,height:MAP_H}],
      objectives:[{id:'north',name:'BASTIÓN NORTE',x:MAP_W/2,y:400},{id:'crown',name:'BASTIÓN DE LA CORONA',x:MAP_W/2,y:MAP_H/2},{id:'south',name:'BASTIÓN SUR',x:MAP_W/2,y:MAP_H-400}],
      mercenaryCamps:{northGuild:{id:'northGuild',name:'HERMANDAD DEL NORTE',x:MAP_W/2-300,y:MAP_H/2-190},southGuild:{id:'southGuild',name:'COMPAÑÍA DEL SUR',x:MAP_W/2+300,y:MAP_H/2+190}},
      mercenaryContract:{g:180,w:90,units:2,cooldown:85,age:2},events:{
        abundance:{name:'TIEMPO DE ABUNDANCIA',duration:38,note:'+25% velocidad de recolección'},warMarket:{name:'MERCADO DE GUERRA',duration:34,note:'contratos mercenarios -35% y campamentos acelerados'},
        blackFog:{name:'NIEBLA NEGRA',duration:30,note:'visión global reducida; Ojo del Horizonte atraviesa la oscuridad'},plague:{name:'LA GRAN PLAGA',duration:28,note:'aldeas sin murallas: villagers reciben 15% más daño'},
        tradeTruce:{name:'TREGUA COMERCIAL',duration:32,note:'ambos bandos generan +40% de oro pasivo mientras dura'},arrowStorm:{name:'TORMENTA DE FLECHAS',duration:25,note:'arqueros y torres disparan 30% más rápido'}},
      scenario:{placementLimit:48,placementKinds:['swordsman','archer','knight','tower','barracks','gold','wood'],neutralKinds:['gold','wood']},
      startingSetup:{base:[{side:'red',kind:'castle',x:320,y:MAP_H/2},{side:'blue',kind:'castle',x:MAP_W-320,y:MAP_H/2},{side:'red',kind:'king',x:390,y:MAP_H/2+60},{side:'blue',kind:'king',x:MAP_W-390,y:MAP_H/2+60}],villagers:{red:{count:4,x:410,alternateX:26,y:MAP_H/2-40,stepY:28},blue:{count:4,x:MAP_W-410,alternateX:-26,y:MAP_H/2-40,stepY:28}},resources:[
        {type:'gold',x:470,y:MAP_H/2-150,amount:1600},{type:'gold',x:490,y:MAP_H/2+170,amount:1600},{type:'gold',x:MAP_W-470,y:MAP_H/2-150,amount:1600},{type:'gold',x:MAP_W-490,y:MAP_H/2+170,amount:1600},{type:'gold',x:MAP_W/2,y:MAP_H/2-260,amount:2200},{type:'gold',x:MAP_W/2,y:MAP_H/2+260,amount:2200}],
        forestCenters:[[540,MAP_H/2+10],[380,MAP_H/2-260],[380,MAP_H/2+260],[MAP_W-540,MAP_H/2+10],[MAP_W-380,MAP_H/2-260],[MAP_W-380,MAP_H/2+260],[MAP_W/2-260,MAP_H/2],[MAP_W/2+260,MAP_H/2],[MAP_W/2,240],[MAP_W/2,MAP_H-240]],treesPerCenter:8,treeResource:'wood',treeRadius:{min:18,spread:70},treeAmount:320},
    },
    campaign:{missions:[
      {id:'crownVacant',act:'I',title:'LA CORONA VACÍA',side:'red',commander:'LEÓN',difficulty:'explorer',difficultyLabel:'EXPLORADOR',kingMustLive:true,holdSeconds:35,briefing:'La frontera quedó sin dueño. León debe ocupar el corazón del mapa antes de que Nelson convierta la Corona en una fortaleza.',objective:'captura el Bastión de la Corona y sostenlo durante 35 segundos'},
      {id:'steelPact',act:'II',title:'EL PACTO DE ACERO',side:'blue',commander:'NELSON',difficulty:'warrior',difficultyLabel:'GUERRERO',kingMustLive:true,briefing:'Nelson necesita ojos, oro y aliados. Los gremios neutrales aceptarán su bandera, pero solo si el Rey firma el contrato en persona.',objective:'vence al reino rival y domina inteligencia y contratos mercenarios'},
      {id:'lastCrown',act:'III',title:'LA ÚLTIMA CORONA',side:'red',commander:'LEÓN',difficulty:'conqueror',difficultyLabel:'CONQUISTADOR',kingMustLive:true,briefing:'Los dos reinos llegan armados a la tormenta final. La niebla caerá primero; después solo quedarán mando, territorio y acero.',objective:'vence en la batalla final utilizando todas las capas estratégicas del reino'},
    ],sources:[],modes:['standard']},
    scenario:{defaults:{title:'Frontera sin Nombre',side:'red',difficulty:'warrior',age:2,gold:600,wood:500,victoryMode:'standard',holdSeconds:45,worldEvents:true,units:{swordsman:3,archer:2,knight:0},placements:[],seed:0}},
    ai:{profiles:{explorer:{label:'EXPLORADOR',decisionTicks:36,villagers:8,towers:1,queueDepth:1,attackBase:7,attackGrowth:120,gather:.9,combat:.9,startBonus:0,age2At:125,age3At:310},warrior:{label:'GUERRERO',decisionTicks:20,villagers:10,towers:2,queueDepth:2,attackBase:5,attackGrowth:90,gather:1,combat:1,startBonus:80,age2At:85,age3At:235},conqueror:{label:'CONQUISTADOR',decisionTicks:12,villagers:13,towers:3,queueDepth:3,attackBase:4,attackGrowth:70,gather:1.22,combat:1.12,startBonus:220,age2At:55,age3At:165}}},
  });
})();
