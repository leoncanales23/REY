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
assert.equal(api.get('chile1810').campaign.missions.length,0,'el manifest no presenta campañas ni datos históricos sin fuentes');
assert.equal(api.get('chile1810').commanders.roster.length,13);
assert.equal(api.get('chile1810').commanders.roster.every(commander=>commander.status==='planned'&&commander.sources.length===0),true,'los personajes quedan como referencias de roster, sin poderes o biografía inventados');
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
const contract=api.contract(api.active(),{mapId:'orbital',seed:123});
assert.equal(api.matchesContract(contract,contract),true);
assert.equal(api.matchesContract({...contract,rulesVersion:'3.0.0'},contract),false);
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
