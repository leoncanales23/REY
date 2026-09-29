import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';

// Instrumentation exists only in this test server's response, never in shipped game.js.
const hooks=`
let testFixture=null;
const originalTestStep=step;
step=function(dt){
  if(G.tick===0 && testFixture==='victory'){
    for(const objective of G.objectives.slice(0,2)){objective.owner=mySide;objective.control=mySide==='red'?100:-100;}
  }
  originalTestStep(dt);
};
window.__worldTest={
  fixture(value){testFixture=value;},
  stop(){running=false;},
  advance(ticks){running=false;for(let i=0;i<ticks&&!G.winner;i++)step(SIM_DT);render();updateHUD();return {tick:G.tick,checksum:stateChecksum(),winner:G.winner};},
  state(){return JSON.parse(JSON.stringify(G));},
  terrain(){return Array.from(TERRAIN.tiles);},
  recordOrder(){const castle=G.ents.find(e=>e.side===mySide&&e.kind==='castle');issue({type:'rally',buildingId:castle.id,x:castle.x+100,y:castle.y});},
  defeat(){G.ents.find(e=>e.side===mySide&&e.kind==='king').hp=0;this.advance(1);},
  commanderAbility(side){const commander=G.ents.find(e=>e.side===side&&e.kind==='king');G.res[side].age=2;return useCommanderAbility(side,COMMANDER_ABILITIES[side].id,commander.id,320,320);},
  trial(id,seed){testFixture=null;const region=REINOS_WORLD.get(id);startGame({mode:'sp',side:campaignMissionById(region.mission).side,difficulty:campaignMissionById(region.mission).difficulty,campaignId:region.mission,regionId:id,seed});return this.advance(360);}
};
`;
const root=resolve('.');
const server=createServer(async(req,res)=>{
  try {
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
    if(!file.startsWith(root+sep)) throw Error('path');
    let data=await readFile(file);
    if(file.endsWith('/game.js')) data=Buffer.from(data.toString().replace('// init\nresize();',hooks+'\n// init\nresize();'));
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]||'application/octet-stream');
    res.end(data);
  } catch {res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/rey/`;
let browser;
const errors=[];
try {
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  await context.route('https://**/*',route=>route.abort());
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(url);
  await page.click('#openWorldBtn');
  assert.equal(await page.getAttribute('#region-capital','data-state'),'available');
  assert.equal(await page.getAttribute('#region-forest','data-state'),'locked');
  await page.click('#region-pass');
  assert(await page.isDisabled('#worldStart'));
  await page.click('#region-capital');
  await mkdir('artifacts',{recursive:true});
  await page.screenshot({path:'artifacts/world-desktop.png'});
  await page.click('#worldStart');
  await page.evaluate(()=>__worldTest.stop());
  assert.equal((await page.evaluate(()=>REINOS.getMatchMeta())).regionId,'capital');
  await page.evaluate(()=>__worldTest.defeat());
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('reinos.world.v1')||'{"completed":{}}').completed.capital),undefined);
  await page.click('#campaignRetryBtn');
  await page.evaluate(()=>__worldTest.stop());
  assert.equal((await page.evaluate(()=>REINOS.getMatchMeta())).regionId,'capital');
  await page.reload();

  // Real simulation ticks and outcome handlers, with controlled objective ownership.
  // The fixture is applied identically on live capture and replay, not by forged outcome events.
  for(const id of ['capital','forest','pass']) {
    await page.click('#openWorldBtn');
    await page.click(`#region-${id}`);
    assert(!(await page.isDisabled('#worldStart')));
    await page.evaluate(()=>__worldTest.fixture('victory'));
    await page.click('#worldStart');
    const snapshot=await page.evaluate(()=>{__worldTest.stop();__worldTest.recordOrder();return __worldTest.advance(1700);});
    assert(snapshot.winner,`${id}: simulation must reach a victory`);
    assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('reinos.world.v1')))).completed[id]>0,true);
    const saved=await page.evaluate(()=>localStorage.getItem('reinos.world.v1'));
    const campaign=await page.evaluate(()=>localStorage.getItem('reinos.campaign.v1'));
    await page.waitForTimeout(50);
    const chronicle=await page.evaluate(()=>localStorage.getItem('reinos.warChronicle.v1'));
    const record=await page.evaluate(()=>JSON.parse(localStorage.getItem('reinos.replays.v1'))[0].record);
    assert.equal(record.eraId,'rey');
    assert.equal(record.eraVersion,'1.0.0');
    assert.equal(record.rulesVersion,'1.0.0');
    assert.equal(record.mapId,id);
    assert.equal(await page.evaluate(()=>REINOS.getMatchMeta().eraId),'rey');
    assert.equal(record.regionId,id);
    assert.equal(await page.evaluate(record=>REINOS.normalizeReplay({...record,regionId:'untrusted-region'}),record),null);
    assert.equal(await page.evaluate(record=>REINOS.normalizeReplay({...record,eraId:'mars2135'}),record),null);
    assert(record.commands.length>0,'commands must actually be captured');
    await page.evaluate(record=>{REINOS.startReplay(record);__worldTest.stop();__worldTest.advance(record.finalTick+1);},record);
    assert.match(await page.textContent('#endSub'),/✓ CHECKSUM/);
    assert.equal(await page.evaluate(()=>localStorage.getItem('reinos.world.v1')),saved);
    assert.equal(await page.evaluate(()=>localStorage.getItem('reinos.campaign.v1')),campaign);
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate(()=>localStorage.getItem('reinos.warChronicle.v1')),chronicle);
    assert(await page.isHidden('#worldReturn'));
    await page.reload();
  }
  const checks=[];
  for(const id of ['capital','forest','pass']) {
    const trial=await page.evaluate(id=>[__worldTest.trial(id,1234),__worldTest.trial(id,1234),__worldTest.trial(id,1235)],id);
    assert.equal(trial[0].checksum,trial[1].checksum);
    assert.notEqual(trial[0].checksum,trial[2].checksum);
    checks.push({id,...trial[0],different:trial[2].checksum});
  }
  await page.reload();
  await page.click('#openWorldBtn');
  assert.equal(await page.getAttribute('#region-pass','data-state'),'conquered');
  await page.screenshot({path:'artifacts/world-conquered.png'});
  await page.click('#closeWorldBtn');
  const scenario=await page.evaluate(()=>{const config=REINOS.getScenarioDefaults();config.seed=991;return REINOS.normalizeScenario(config);});
  assert.equal(scenario.seed,991);
  await page.evaluate(config=>{REINOS.startScenario(config);__worldTest.stop();},scenario);
  const scenarioMeta=await page.evaluate(()=>REINOS.getMatchMeta());
  assert.equal(scenarioMeta.mode,'scenario');
  assert.equal(scenarioMeta.eraId,'rey');
  assert.equal(scenarioMeta.scenarioTitle,scenario.title);
  assert.equal((await page.evaluate(()=>__worldTest.state())).seed,991);
  assert.equal(await page.evaluate(()=>__worldTest.commanderAbility('red')),true,'el poder del comandante sigue resolviendo desde el pack REY');
  await page.reload();
  await page.evaluate(()=>{REINOS.startCampaign('crownVacant');__worldTest.stop();});
  assert.equal((await page.evaluate(()=>REINOS.getMatchMeta())).regionId,null);
  await page.reload();
  await page.evaluate(()=>localStorage.setItem('reinos.world.v1','{broken'));
  await page.reload();
  await page.click('#openWorldBtn');
  assert.equal(await page.getAttribute('#region-forest','data-state'),'locked');
  await page.keyboard.press('Escape');
  assert(!(await page.locator('#worldDialog').evaluate(e=>e.open)));
  // An ordinary campaign victory must not unlock the separate world.
  await page.evaluate(()=>{__worldTest.fixture('victory');REINOS.startCampaign('crownVacant');__worldTest.advance(1700);});
  assert.equal(await page.evaluate(()=>localStorage.getItem('reinos.world.v1')),'{broken');
  await page.reload();
  // Real storage exceptions: new progress layer remains usable and warns honestly.
  await page.addInitScript(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='reinos.world.v1')throw new DOMException('quota','QuotaExceededError');return original.call(this,key,value);};});
  await page.reload();
  await page.click('#openWorldBtn');
  await page.evaluate(()=>__worldTest.fixture('victory'));
  await page.click('#worldStart');
  await page.evaluate(()=>__worldTest.advance(1700));
  await page.click('#worldReturn');
  assert.equal(await page.getAttribute('#region-forest','data-state'),'available');
  assert.match(await page.textContent('#worldStorage'),/solo durante esta sesión/);
  // Other legacy persistence modules are not part of this storage-failure assertion.
  await page.evaluate(()=>{Storage.prototype.getItem=function(){throw new DOMException('denied','SecurityError');};});
  await page.click('#region-capital');
  assert.match(await page.textContent('#worldStorage'),/solo durante esta sesión/);
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  await mobile.route('https://**/*',route=>route.abort());
  const phone=await mobile.newPage();
  phone.on('pageerror',e=>errors.push(String(e)));
  await phone.goto(url);await phone.tap('#openWorldBtn');await phone.tap('#region-forest');
  assert(await phone.isDisabled('#worldStart'));
  await phone.screenshot({path:'artifacts/world-mobile.png'});
  const overflow=await phone.locator('#worldDialog').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth,wide:[...e.querySelectorAll('*')].filter(n=>n.getBoundingClientRect().right>innerWidth).map(n=>[n.tagName,n.className,n.getBoundingClientRect().width])}));
  assert(overflow.scroll<=overflow.client+1,JSON.stringify(overflow));
  await phone.screenshot({path:'artifacts/world-mobile.png'});
  await phone.tap('#region-capital');
  await phone.locator('#worldStart').scrollIntoViewIfNeeded();
  await phone.tap('#worldStart');
  assert.equal((await phone.evaluate(()=>REINOS.getMatchMeta())).regionId,'capital');
  await mobile.close();
  await context.close();
  const clean=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'allow'});
  await clean.route('https://**/*',route=>route.abort());
  const live=await clean.newPage();
  live.on('pageerror',e=>errors.push(String(e)));
  await live.goto(url);
  await live.evaluate(()=>navigator.serviceWorker.ready);
  await live.reload();
  await clean.setOffline(true);
  await live.reload();
  await live.click('#openWorldBtn');
  assert.equal(await live.getAttribute('#region-capital','data-state'),'available');
  await live.click('#worldStart');
  const frameTiming=await live.evaluate(()=>new Promise(resolve=>{
    const times=[];let previous=performance.now();
    function sample(now){times.push(now-previous);previous=now;if(times.length<120)requestAnimationFrame(sample);else{times.shift();times.sort((a,b)=>a-b);resolve({medianMs:times[Math.floor(times.length/2)],p95Ms:times[Math.floor(times.length*.95)],units:'initial campaign army; headless desktop only'});}}
    requestAnimationFrame(sample);
  }));
  await live.screenshot({path:'artifacts/world-battle.png'});
  const evidenceDir=resolve(root,'docs/evidence/chacabuco');
  await mkdir(evidenceDir,{recursive:true});
  const chileContext=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  await chileContext.addInitScript(()=>{window.__FRONTERAS_TEST__=true;});
  await chileContext.route('https://**/*',route=>route.abort());
  const chile=await chileContext.newPage();
  chile.on('pageerror',e=>errors.push(String(e)));
  await chile.goto(url);
  await chile.click('#frontiersEntry');
  await chile.screenshot({path:resolve(evidenceDir,'selector.png')});
  await Promise.all([chile.waitForURL(value=>value.searchParams.get('era')==='chile1810'),chile.click('#selectChile')]);
  assert.equal(await chile.locator('#selectMars').isDisabled(),true,'Marte no debe poder iniciar una partida');
  assert.equal(await chile.evaluate(()=>FRONTERAS_ERA_CORE.active().id),'chile1810','la era se activa antes de cargar game.js');
  assert.equal(await chile.isVisible('#chileLaunch'),true);
  assert.equal(await chile.isHidden('#hud'),true);
  await chile.click('#chacabucoBrief');
  await chile.screenshot({path:resolve(evidenceDir,'briefing.png')});
  assert.match(await chile.locator('#chacabucoBriefing').textContent(),/12 FEB 1817/);
  await chile.click('#alternateMode');
  await chile.click('#enterBattle');
  const chileMeta=await chile.evaluate(()=>REINOS.getMatchMeta());
  assert.equal(chileMeta.eraId,'chile1810');assert.equal(chileMeta.eraVersion,'0.2.0');assert.equal(chileMeta.rulesVersion,'0.2.0');assert.equal(chileMeta.mapId,'chacabuco1817');assert.equal(chileMeta.mode,'alternate');assert(chileMeta.seed>0);assert.match(chileMeta.checksum,/^[0-9a-f]{8}$/);
  await chile.waitForTimeout(1300);
  const chilePerformance=await chile.evaluate(()=>REINOS.getPerformanceReport());
  assert(chilePerformance.frameSamples>1,JSON.stringify(chilePerformance));
  let battle=await chile.evaluate(()=>REINOS.getRuntimeSnapshot());
  assert.equal(battle.res.red.ledger.supplies,180);
  assert.equal(battle.res.red.ledger.ammunition,210);
  assert.equal(battle.res.red.g,undefined,'Chile no utiliza oro como recurso de dominio');
  assert.equal(battle.res.red.w,undefined,'Chile no utiliza madera como recurso de dominio');
  assert(battle.units.some(e=>e.kind==='artillery'));
  assert(battle.units.some(e=>e.kind==='officer'&&e.commander==='jose_de_san_martin'));
  assert.equal(battle.mapId,'chacabuco1817');
  const determinism=await chile.evaluate(()=>REINOS.runDeterminismProbe());
  assert.equal(determinism.ok,true,JSON.stringify(determinism));
  const replayProbe=await chile.evaluate(()=>REINOS.runReplayChecksumProbe(18170212));
  assert.equal(replayProbe.matched,true,JSON.stringify(replayProbe));
  assert.equal(replayProbe.mismatchRejected,true);
  const contract=await chile.evaluate(()=>FRONTERAS_ERA_CORE.contract(FRONTERAS_ERA_CORE.active(),{mapId:'chacabuco1817',seed:18170212,mode:'alternate',scenarioId:'chacabuco1817'}));
  assert.equal(await chile.evaluate(contract=>FRONTERAS_ERA_CORE.matchesContract(contract,contract),contract),true);
  assert.equal(await chile.evaluate(contract=>FRONTERAS_ERA_CORE.matchesContract({...contract,mode:'historical'},contract),contract),false);
  assert.equal(await chile.evaluate(contract=>FRONTERAS_ERA_CORE.matchesContract({...contract,eraId:'rey'},contract),contract),false);
  // Real formation command on the selected player unit; commands are included in the replay ledger.
  await chile.mouse.click(670,670);
  await chile.click('#formationColumn');
  battle=await chile.evaluate(()=>REINOS.getRuntimeSnapshot());
  const line=battle.units.find(e=>e.side==='red'&&e.kind==='line_infantry');
  assert.equal(line.formation,'column');
  await chile.mouse.click(1060,570,{button:'right'});
  battle=await chile.evaluate(()=>REINOS.getRuntimeSnapshot());
  assert(battle.units.find(e=>e.id===line.id).order,'move/attack order should affect the deterministic state');
  await chile.screenshot({path:resolve(evidenceDir,'battle-desktop.png')});
  const artillery=await chile.evaluate(()=>REINOS.prepareArtilleryTest());
  battle=await chile.evaluate(()=>REINOS.stepForTest(1));
  assert(battle.stats.shots.red>0,'la batería debe disparar bajo la simulación, no ser una torre');
  assert(battle.units.find(e=>e.id===artillery.gunId).ammo<8,'el disparo consume munición de la formación');
  assert(battle.projectiles.length>0,'el proyectil de artillería debe estar en vuelo');
  await chile.screenshot({path:resolve(evidenceDir,'artillery.png')});
  battle=await chile.evaluate(()=>REINOS.stepForTest(140));
  assert(battle.units.some(e=>e.morale<100),'el combate debe afectar moral');
  const mobileChileContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  await mobileChileContext.addInitScript(()=>{window.__FRONTERAS_TEST__=true;});
  await mobileChileContext.route('https://**/*',route=>route.abort());
  const phoneChile=await mobileChileContext.newPage();phoneChile.on('pageerror',e=>errors.push(String(e)));
  await phoneChile.goto(`${url}?era=chile1810`);await phoneChile.click('#chacabucoBrief');await phoneChile.click('#enterBattle');
  await phoneChile.screenshot({path:resolve(evidenceDir,'battle-mobile.png')});
  const mobileLayout=await phoneChile.locator('#chileHud').evaluate(e=>({scroll:e.scrollWidth,client:e.clientWidth}));
  assert(mobileLayout.scroll<=mobileLayout.client+1,`HUD móvil desborda: ${JSON.stringify(mobileLayout)}`);
  await mobileChileContext.close();
  await chile.evaluate(()=>REINOS.finishForEvidence());
  await chile.screenshot({path:resolve(evidenceDir,'archive.png')});
  const storedChileReplay=await chile.evaluate(()=>JSON.parse(localStorage.getItem('reinos.replays.v1')||'[]')[0]?.record||null);
  if(storedChileReplay){
    assert.equal(storedChileReplay.eraId,'chile1810');
    assert.equal(await chile.evaluate(record=>REINOS.normalizeReplay({...record,eraId:'rey'}),storedChileReplay),null);
    assert.equal(await chile.evaluate(record=>REINOS.normalizeReplay({...record,mapId:'reinos-standard'}),storedChileReplay),null);
  }
  await chileContext.close();
  const chileOfflineContext=await browser.newContext({viewport:{width:1000,height:800},serviceWorkers:'allow'});
  await chileOfflineContext.route('https://**/*',route=>route.abort());
  const chileOffline=await chileOfflineContext.newPage();
  await chileOffline.goto(`${url}?era=chile1810`);
  await chileOffline.evaluate(()=>navigator.serviceWorker.ready);
  await chileOffline.reload();
  await chileOfflineContext.setOffline(true);
  await chileOffline.reload();
  assert.equal(await chileOffline.evaluate(()=>FRONTERAS_ERA_CORE.active().id),'chile1810');
  assert.equal(await chileOffline.isVisible('#chileLaunch'),true,'Chacabuco debe abrir desde el shell PWA offline');
  await chileOfflineContext.close();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,checks,frameTiming,chile:{era:'chile1810',map:'chacabuco1817',determinism,replayProbe,performance:chilePerformance,evidence:'docs/evidence/chacabuco/'},coverage:['locks','defeat','retry','victory','reload','replay-no-rewards','legacy-campaign','scenario','era-locked-replay','corrupt-storage','denied-storage','quota-memory-fallback','offline-PWA','mobile-touch','chile-era-select','chile-briefing','formations','ammunition','morale','artillery','replay-checksum','P2P-contract','chile-PWA-offline','screenshots']},null,2));
} finally {
  if(browser) await browser.close();
  await new Promise(r=>server.close(r));
}
