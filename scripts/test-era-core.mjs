import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const context=vm.createContext({console,TextEncoder,Uint8Array,Set,Map,Object,Array,Number,String,Math,Date,JSON,TypeError,RegExp,globalThis:null,setTimeout,clearTimeout});
context.globalThis=context;
for(const file of ['rey/era-core.js','rey/content/eras/rey.js','rey/content/eras/chile1810.js','rey/content/eras/mars2135.js','rey/net.js']) {
  vm.runInContext(await readFile(file,'utf8'),context,{filename:file});
}
const api=vm.runInContext('FRONTERAS_ERA_CORE',context);
const net=vm.runInContext('Net',context);
assert.deepEqual(Array.from(api.list(),pack=>pack.id),['rey','chile1810','mars2135']);
assert.equal(api.active().id,'rey');
assert.equal(Object.isFrozen(api.get('rey').entities.units.swordsman),true);
assert.deepEqual(Object.keys(api.get('chile1810').resources.definitions),['supplies','ammunition','morale']);
assert.deepEqual(Object.keys(api.get('mars2135').resources.definitions),['energy','oxygen','materials','communications']);
assert.deepEqual(Array.from(api.get('chile1810').campaign.modes),['historical','alternate']);
assert.equal(api.get('chile1810').status,'playable');
assert.equal(api.activate('mars2135'),false,'un pack no jugable no puede inicializar una simulación');
assert.equal(api.active().id,'rey');
assert.equal(api.get('chile1810').runtimeId,'formations-v1');
assert.equal(api.get('chile1810').world.defaultMap,'chacabuco1817');
assert.equal(api.get('chile1810').campaign.missions.length,1,'Chacabuco requiere manifiesto de misión y fuentes');
assert.deepEqual(api.get('chile1810').campaign.missions[0].sources,['memoriaChilenaMap','memoriaChilenaCartography','memoriaChilenaBattle','museoHistoria','academiaBattle','academiaIndependencia','historiaEjercito']);
assert.deepEqual(Object.keys(api.get('chile1810').entities.units),['line_infantry','cazadores','grenadiers','cavalry','artillery','officer','supply_train']);
assert.equal(api.get('chile1810').entities.units.artillery.capabilities.includes('artillery'),true);
assert.equal(api.get('chile1810').commanders.roster.filter(commander=>commander.status==='scenario').length,4);
assert.equal(api.get('chile1810').resources.definitions.gold,undefined);
assert.equal(api.get('chile1810').resources.definitions.wood,undefined);
assert.equal(api.get('chile1810').world.maps[0].historicalGeometry.basis.includes('MC0000070'),true);
assert.equal(api.get('chile1810').campaign.missions[0].mode,'historical');
assert.throws(()=>api.register({...api.get('chile1810'),id:'unsourced-era',campaign:{...api.get('chile1810').campaign,missions:[{id:'unsupportedBattle',mode:'historical',sources:[]}]}}),/fuentes verificables/);
assert.throws(()=>api.register({...api.get('chile1810'),id:'unsourced-era',campaign:{...api.get('chile1810').campaign,missions:[{id:'unsupportedBattle',mode:'historical',sources:[]}]}}),/fuentes verificables/);
assert.equal(net.validateCommand({type:'train',buildingId:1,unit:'swordsman'}).unit,'swordsman');
assert.equal(net.validateCommand({type:'train',buildingId:1,unit:'rovers'}),null);

// Una era de prueba con IDs y recursos no medievales cambia el catálogo usado por Net sin tocar game.js.
api.register({schemaVersion:1,id:'probe-era',name:'Era de contrato',version:'1.0.0',rulesVersion:'2.0.0',status:'playable',
  entities:{units:{rover:{trainable:true}},buildings:{habitat:{buildable:true}},special:{}},
  resources:{definitions:{oxygen:{name:'Oxígeno'}},initial:{},costs:{}},ages:{definitions:{}},technologies:{definitions:{recycle:{}}},
  factions:{definitions:{}},commanders:{abilities:{rallySignal:{}}},world:{defaultMap:'orbital',maps:[{id:'orbital'}],objectives:[],events:[],mercenaryCamps:{dock:{}}},
  campaign:{missions:[],sources:[]},scenario:{defaults:null},
});
assert.equal(api.activate('probe-era'),true);
assert.deepEqual([...api.commandCatalog().units],['rover']);
assert.equal(net.validateCommand({type:'train',buildingId:1,unit:'rover'}).unit,'rover');
assert.equal(net.validateCommand({type:'train',buildingId:1,unit:'swordsman'}),null);
assert.equal(net.validateCommand({type:'build',kind:'habitat',x:100,y:100,villagerIds:[1]}).kind,'habitat');
assert.equal(net.validateCommand({type:'research',buildingId:1,researchId:'recycle'}).researchId,'recycle');
const contract=api.contract(api.active(),{mapId:'orbital',seed:123,mode:'alternate',scenarioId:'test-scenario'});
assert.equal(api.matchesContract(contract,contract),true);
assert.equal(api.matchesContract({...contract,seed:124},contract),false,'dos contratos con distinta semilla no son compatibles');
assert.equal(api.matchesContract({...contract,rulesVersion:'3.0.0'},contract),false);
assert.equal(api.matchesContract({...contract,mode:'historical'},contract),false,'dos reglas de resultado distintas son incompatibles');
assert.equal(api.matchesContract({...contract,scenarioId:'other-scenario'},contract),false,'dos escenarios distintos son incompatibles');
assert.equal(api.matchesContract({...contract,mapId:'another-map'},contract),false);
assert.equal(api.matchesContract({...contract,eraId:'chile1810'},contract),false);
assert.equal(api.activate('rey'),true);
assert.equal(net.validateCommand({type:'train',buildingId:1,unit:'swordsman'}).unit,'swordsman');

// Client/host contract negotiation must gate gameplay packets until an exact match.
const sent=[],events={};
const connection={on:(name,fn)=>{events[name]=fn;},send:packet=>sent.push(packet),close:()=>{events.close?.();}};
const hostContract=api.contract(api.get('rey'),{mapId:'reinos-standard',seed:918273});
net.matchContractProvider=()=>hostContract;
let receivedCommand=null;
net.onCmd=command=>{receivedCommand=command;};
net.onPeer=()=>{};
net._bindConnection(connection,'host');
events.open();
assert.equal(sent.at(-1).t,'hello');
events.data({t:'hello',v:3,contract:{...hostContract,seed:345}});
assert.equal(net.matchReady,false);
events.data({t:'ready',contract:hostContract});
assert.equal(net.matchReady,true);
events.data({t:'cmd',contract:hostContract,cmd:{type:'train',buildingId:1,unit:'swordsman'}});
assert.equal(receivedCommand.unit,'swordsman');
events.data({t:'cmd',contract:{...hostContract,rulesVersion:'4.0.0'},cmd:{type:'train',buildingId:1,unit:'swordsman'}});
assert.equal(receivedCommand.unit,'swordsman','el host ignora órdenes de otra versión de reglas');
events.data({t:'hello',v:3,contract:hostContract});
assert.equal(net.matchReady,false,'una renegociación tardía cierra el contrato en vez de alterar la sesión');
net.close();

const clientEvents={},clientSent=[];
const clientConnection={on:(name,fn)=>{clientEvents[name]=fn;},send:packet=>clientSent.push(packet),close:()=>{clientEvents.close?.();}};
net.matchContractProvider=()=>api.contract(api.get('rey'),{mapId:'reinos-standard',seed:345});
let adoptedContract=null;
net.onMatchContract=match=>{adoptedContract=match;};
net._bindConnection(clientConnection,'client');
clientEvents.open();
assert.equal(clientSent.at(-1).t,'hello');
clientEvents.data({t:'hello',v:3,contract:hostContract});
assert.equal(clientSent.at(-1).t,'ready');
assert.equal(net.matchReady,false,'el cliente espera el ACK final antes de aceptar snapshots');
clientEvents.data({t:'accepted',contract:hostContract});
assert.equal(net.matchReady,true);
assert.equal(adoptedContract.seed,918273,'el cliente adopta la semilla autoritativa del host');
net.close();

console.log('Era Core: packs medieval, histórico y sci-fi; catálogos, reglas, contratos P2P y extensibilidad verificados.');
