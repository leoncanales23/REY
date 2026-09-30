/* Reusable deterministic formation RTS profile. All history and force data lives in the active Era Pack. */
(() => {
  'use strict';
  const runtimes = new Map();
  function register(id, factory) {
    if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{1,31}$/.test(id) || typeof factory !== 'function' || runtimes.has(id)) throw new TypeError('Runtime RTS inválido o duplicado');
    runtimes.set(id, factory);
  }
  function get(id) { const factory=runtimes.get(id); return factory ? factory() : null; }
  globalThis.FRONTERAS_RUNTIMES = Object.freeze({register,get});

  register('formations-v1', () => ({
    attach({ERA,ERA_CORE,Net,window,document}) {
      const canvas=document.getElementById('game'), ctx=canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const map=ERA.world.maps.find(item=>item.id===ERA.world.defaultMap), cfg=ERA.runtime, defs=ERA.entities.units;
      const theme=ERA.theme.palette, W=map.width, H=map.height, STEP=1/20, HOLD=cfg.victory.holdSeconds;
      let state=null, active=false, last=0, accumulator=0, camera={x:0,y:0}, view={w:0,h:0}, selection=[], mode='historical', replay=null, replayVerify=null, orders=[], aiClock=0, resultShown=false;
      let perfFrames=[], simCosts=[], lastPerf=performance.now(), frameCounter=0, pointer={x:0,y:0,down:false}, audio=null;
      const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
      const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
      const mix=(a,b,t)=>a+(b-a)*t;
      const sampleRng=seed=>{let x=seed>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)||0x9e3779b9;};
      const sideName=side=>ERA.factions.definitions[side].name;
      const unitDef=e=>defs[e.kind];
      const enemies=side=>state.units.filter(e=>e.side!==side&&e.hp>0&&!e.routed);
      const spatialHash=()=>{
        const bins=new Map();
        for(const e of state.units){const k=`${Math.floor(e.x/180)}:${Math.floor(e.y/180)}`;if(!bins.has(k))bins.set(k,[]);bins.get(k).push(e);}
        return bins;
      };
      function checksum(s=state){return globalThis.REINOS_DETERMINISM?.checksum(s)||null;}
      function spawn(spec){
        const d=defs[spec.kind];
        const e={id:state.nextId++,side:spec.side,kind:spec.kind,x:spec.x,y:spec.y,hp:d.hp,maxHp:d.hp,ammo:d.ammo||0,maxAmmo:d.ammo||0,reload:0,morale:d.morale||100,formation:spec.formation||d.formation||'line',facing:spec.side==='red'?1:-1,order:null,targetId:0,routed:false,spawnX:spec.x,spawnY:spec.y,commander:spec.commander||null,label:spec.label||d.name};
        state.units.push(e);return e;
      }
      function fresh(seed,gameMode='historical'){
        const weather=['calm','crosswind','dust'][seed%3];
        state={eraId:ERA.id,eraVersion:ERA.version,rulesVersion:ERA.rulesVersion,mapId:map.id,mode:gameMode,seed:seed>>>0,tick:0,time:0,nextId:1,winner:null,victoryReason:null,objective:{...map.objectives[0],owner:null,hold:{red:0,blue:0}},res:{red:{ledger:{supplies:ERA.resources.initial.supplies,ammunition:ERA.resources.initial.ammunition}},blue:{ledger:{supplies:ERA.resources.initial.supplies,ammunition:ERA.resources.initial.ammunition}}},units:[],projectiles:[],weather,weatherFactor:weather==='crosswind'?0.93:weather==='dust'?0.88:1,smoke:[],stats:{shots:{red:0,blue:0},routed:{red:0,blue:0}},rallyCooldown:{red:0,blue:0}};
        for(const spec of map.deployment)spawn(spec);
        orders=[];aiClock=0;resultShown=false;selection=[];replayVerify=null;
      }
      function polygon(ctx,pts,fill,stroke){ctx.beginPath();ctx.moveTo(...pts[0]);for(let i=1;i<pts.length;i++)ctx.lineTo(...pts[i]);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=3;ctx.stroke();}}
      function resize(){canvas.width=innerWidth*devicePixelRatio;canvas.height=innerHeight*devicePixelRatio;ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);view={w:innerWidth,h:innerHeight};}
      function createShell(){
        const menu=document.getElementById('menu'), oldCard=menu?.querySelector('.card');
        if(ERA.id==='rey'){
          const button=document.createElement('button');button.id='frontiersEntry';button.className='frontiers-entry';button.type='button';button.innerHTML='<span>FRONTERAS</span><small>Elige un mundo</small>';menu?.insertBefore(button,oldCard);
          button.onclick=()=>document.getElementById('frontiersDialog').showModal();
        }else if(oldCard){document.body.classList.remove('crt');oldCard.hidden=true;const controls=document.querySelector('.controls');if(controls){controls.innerHTML='WASD / flechas: desplazar cámara<br>Seleccionar una formación · arrastrar: mover grupo<br>Clic derecho: avanzar / atacar<br>Línea: frente y fuego · Columna: velocidad<br>Artillería: desplegar / limberar · recarga lenta<br>Oficial: REORGANIZAR · carro: munición y suministros';if(innerWidth<=700)controls.classList.add('hidden');}const pane=document.createElement('section');pane.id='chileLaunch';pane.className='chile-launch';pane.innerHTML=`<div class="chile-kicker">FRONTERAS // CHILE 1817</div><h2>CHACABUCO</h2><p>12 FEBRERO 1817 · BATALLA TÁCTICA DE FORMACIONES</p><p class="chile-source">Dos aproximaciones, terreno quebrado y una línea que puede ceder.</p><button class="btn" id="chacabucoBrief">PREPARAR EL EJÉRCITO <small>Ver contexto y elegir modo</small></button><button class="mini-btn" id="backToRey">VOLVER A REY</button>`;menu?.append(pane);
          pane.querySelector('#chacabucoBrief').onclick=showBriefing;
          pane.querySelector('#backToRey').onclick=()=>switchEra('rey');
          document.querySelector('#menu .logo h1').textContent='FRONTERAS';
          document.querySelector('#menu .logo .sub').textContent='CHILE 1817 · CHACABUCO';
        }
        const dialog=document.createElement('dialog');dialog.id='frontiersDialog';dialog.className='frontiers-dialog';dialog.innerHTML=`<div class="frontiers-shell"><header><span>UN MOTOR · MUCHOS MUNDOS</span><button type="button" class="mini-btn" id="frontiersClose">CERRAR</button></header><h2>FRONTERAS</h2><div class="frontiers-cards"><article><b>FRONTERAS // REY</b><p>Fantasía medieval · reinos, economía y Bastiones.</p><button id="selectRey" class="mini-btn">JUGABLE</button></article><article class="${ERA.status==='playable'?'ready':''}"><b>FRONTERAS // CHILE 1817</b><p>Chacabuco · pólvora, moral y terreno de montaña.</p><button id="selectChile" class="mini-btn">JUGABLE · EXPERIMENTAL</button></article><article class="locked"><b>FRONTERAS // MARTE 2135</b><p>Un mundo ficticio de energía, oxígeno y hábitats.</p><button id="selectMars" disabled class="mini-btn">PRÓXIMAMENTE</button></article></div></div>`;document.body.append(dialog);
        dialog.querySelector('#frontiersClose').onclick=()=>dialog.close();
        dialog.querySelector('#selectRey').onclick=()=>ERA.id==='rey'?dialog.close():switchEra('rey');
        dialog.querySelector('#selectChile').onclick=()=>ERA.status==='playable'&&switchEra('chile1810');
      }
      function switchEra(id){const url=new URL(location.href);url.searchParams.set('era',id);url.searchParams.delete('mode');url.searchParams.delete('seed');location.assign(url.toString());}
      function showBriefing(){
        const dialog=document.createElement('dialog');dialog.id='chacabucoBriefing';dialog.className='chile-briefing';dialog.innerHTML=`<div class="briefing-paper"><div class="chile-kicker">FRONTERAS // CHILE 1817</div><h2>CHACABUCO</h2><strong>12 FEB 1817</strong><p>El Ejército de los Andes avanza hacia el valle de Santiago. Dos divisiones se aproximan por rutas distintas mientras las fuerzas realistas ocupan el paso.</p><p><b>Mando independentista:</b> José de San Martín · Bernardo O’Higgins · Miguel Estanislao Soler<br><b>Mando realista:</b> Rafael Maroto</p><p class="brief-objective">OBJETIVO · Desorganiza la línea y controla el paso. La batalla no te fuerza a repetir el desenlace histórico.</p><div class="brief-modes"><button id="historicalMode" class="mini-btn selected">RECONSTRUCCIÓN HISTÓRICA</button><button id="alternateMode" class="mini-btn">HISTORIA ALTERNATIVA</button></div><p class="brief-note">Fuentes consultadas: Biblioteca Nacional de Chile, Museo Histórico Nacional y Academia de Historia Militar. Orden de batalla y topografía traducidos a una reconstrucción RTS.</p><button id="enterBattle" class="btn">ENTRAR EN LA BATALLA</button><button id="briefClose" class="mini-btn">VOLVER</button></div>`;document.body.append(dialog);dialog.showModal();
        dialog.querySelector('#historicalMode').onclick=()=>{mode='historical';dialog.querySelector('#historicalMode').classList.add('selected');dialog.querySelector('#alternateMode').classList.remove('selected');};
        dialog.querySelector('#alternateMode').onclick=()=>{mode='alternate';dialog.querySelector('#alternateMode').classList.add('selected');dialog.querySelector('#historicalMode').classList.remove('selected');};
        dialog.querySelector('#briefClose').onclick=()=>dialog.close();
        dialog.querySelector('#enterBattle').onclick=()=>{dialog.close();dialog.remove();start(mode,undefined);};
      }
      function makeOverlay(id,cls,html){let el=document.getElementById(id);if(el)el.remove();el=document.createElement('dialog');el.id=id;el.className=cls;el.innerHTML=html;document.body.append(el);return el;}
      function start(gameMode='historical',seed){
        const actualSeed=(Number(seed)>>>0)||((Date.now()^((performance.now()*1000)|0))>>>0)||1;
        fresh(actualSeed,gameMode==='replay'?(replay?.record?.mode||'historical'):gameMode);active=true;document.getElementById('menu').style.display='none';document.getElementById('hud').style.display='none';document.getElementById('panel').style.display='none';document.querySelector('.controls')?.classList.add('chile-controls');
        canvas.classList.add('chile-canvas');canvas.setAttribute('aria-label','Campo de batalla de Chacabuco');camera.x=0;camera.y=0;resize();camera.x=clamp(360-view.w/2,0,W-view.w);camera.y=clamp(850-view.h/2,0,H-view.h);last=0;accumulator=0;orders=[];selection=[];
        if(gameMode!=='replay') replay={version:1,engine:'fronteras-formations-v1',eraId:ERA.id,eraVersion:ERA.version,rulesVersion:ERA.rulesVersion,mapId:map.id,mode:gameMode,seed:actualSeed,kind:'campaign',title:'Chacabuco · 12 febrero 1817',side:'red',commands:[]};
        else if(replay?.record)orders=replay.record.commands.slice();
        showBattleHud();requestAnimationFrame(loop);
      }
      function showBattleHud(){
        const hud=document.getElementById('chileHud')||document.createElement('div');hud.id='chileHud';hud.className='chile-hud';hud.innerHTML=`<div class="ch-hud-top"><div><b>CHACABUCO</b><span>12 FEB 1817 · ${state.mode==='alternate'?'HISTORIA ALTERNATIVA':'RECONSTRUCCIÓN HISTÓRICA'}</span></div><div class="ch-res"><span>▰ <i id="chSupplies"></i> SUMINISTROS</span><span>◈ <i id="chAmmo"></i> MUNICIÓN</span></div><span class="ch-weather" id="chWeather"></span></div><div class="ch-hud-bottom"><div class="ch-command"><b id="chSelection">SIN FORMACIÓN SELECCIONADA</b><span id="chUnitStatus">Selecciona una formación · clic derecho ordena movimiento/ataque</span><div class="ch-actions"><button id="formationLine">LÍNEA · FUEGO</button><button id="formationColumn">COLUMNA · AVANCE</button><button id="formationRally">REORGANIZAR</button><button id="resupplyBtn">ABASTECER</button></div></div><div class="ch-objective"><b id="chObjective"></b><span id="chObjectiveProgress"></span></div></div>`;if(!hud.isConnected)document.body.append(hud);
        document.getElementById('formationLine').onclick=()=>command({type:'formation',formation:'line'});
        document.getElementById('formationColumn').onclick=()=>command({type:'formation',formation:'column'});
        document.getElementById('formationRally').onclick=()=>command({type:'rally'});
        document.getElementById('resupplyBtn').onclick=()=>command({type:'resupply'});
        document.getElementById('chWeather').textContent=`CLIMA · ${{calm:'CALMA',crosswind:'VIENTO CRUZADO',dust:'POLVO'}[state.weather]}`;
        document.getElementById('chObjective').textContent=`OBJETIVO · ${state.objective.name}`;
      }
      function moveEntity(e,x,y){const route=unitDef(e).capabilities.includes('artillery')&&e.formation==='deployed';if(route){e.formation='limbered';e.reload=Math.max(e.reload,2.5);}e.order={type:'move',x,y};e.targetId=0;}
      function command(cmd,record=true){if(!state||!active)return;
        const ids=selection.filter(id=>state.units.some(e=>e.id===id&&e.side==='red'));
        if(cmd.type==='formation'){for(const e of state.units)if(ids.includes(e.id)&&['line','column'].includes(cmd.formation)&&!unitDef(e).capabilities.includes('artillery'))e.formation=cmd.formation;}
        if(cmd.type==='move'||cmd.type==='attack')for(const e of state.units)if(ids.includes(e.id)){if(cmd.type==='move')moveEntity(e,cmd.x,cmd.y);else{e.order={type:'attack',targetId:cmd.targetId};e.targetId=cmd.targetId;}}
        if(cmd.type==='rally'){const officer=state.units.find(e=>ids.includes(e.id)&&unitDef(e).capabilities.includes('command'));if(officer&&state.rallyCooldown.red<=0){for(const e of state.units)if(e.side==='red'&&unitDef(e).capabilities.includes('infantry')&&distance(e,officer)<unitDef(officer).commandAura)e.morale=Math.min(100,e.morale+unitDef(officer).rally);state.rallyCooldown.red=cfg.commanders.abilities.rally.cooldown;}}
        if(cmd.type==='resupply'){for(const e of state.units)if(ids.includes(e.id)&&e.maxAmmo>0){const wagon=state.units.find(w=>w.side===e.side&&unitDef(w).capabilities.includes('logistics')&&distance(w,e)<155);const stock=state.res[e.side].ledger;if(wagon&&stock.supplies>=8&&stock.ammunition>0){const amount=Math.min(e.maxAmmo-e.ammo,12,stock.ammunition);e.ammo+=amount;stock.ammunition-=amount;stock.supplies-=8;}}}
        if(record&&replay?.commands)replay.commands.push({tick:state.tick,side:'red',cmd:{...cmd,ids}});
        syncHud();
      }
      function nearestEnemy(e,range){let found=null,best=range;for(const t of enemies(e.side)){const d=distance(e,t);if(d<best){found=t;best=d;}}return found;}
      function formationFactor(e,key){return cfg.formations[e.formation]?.[key]??1;}
      function setTarget(e,t){e.targetId=t?.id||0;if(t)e.order={type:'attack',targetId:t.id};}
      function route(e){if(!e.routed&&e.morale<=0){e.routed=true;e.targetId=0;e.order={type:'move',x:e.side==='red'?40:W-40,y:e.spawnY};state.stats.routed[e.side]++;for(const ally of state.units)if(ally.side===e.side&&ally.id!==e.id&&unitDef(ally).capabilities.includes('infantry')&&distance(ally,e)<240)ally.morale=Math.max(0,ally.morale-4);}}
      function hit(target,damage,attacker,artillery=false){if(target.hp<=0)return;const d=unitDef(target),behind=attacker&&((attacker.x-target.x)*target.facing<0),reduced=damage*formationFactor(target,'incoming')*(behind?1.12:1);target.hp=Math.max(0,target.hp-reduced);target.morale=Math.max(0,target.morale-reduced*(artillery?0.19:0.075)+(behind?-5:0));if(attacker&&attacker.side!==target.side&&unitDef(attacker).capabilities.includes('mounted'))target.morale=Math.max(0,target.morale-4);if(target.hp<=0&&d.capabilities.includes('command'))for(const e of state.units)if(e.side===target.side)e.morale=Math.max(0,e.morale-12);route(target);state.smoke.push({x:target.x,y:target.y,t:2.5,size:artillery?36:15});}
      function fire(e,target){const d=unitDef(e);if(d.capabilities.includes('firearm')){if(e.ammo<=0)return;e.ammo--;state.stats.shots[e.side]++;}
        const splash=d.splash||0;state.projectiles.push({id:state.nextId++,x:e.x,y:e.y,targetId:target.id,side:e.side,kind:e.kind,damage:d.attack*formationFactor(e,'front'),speed:d.projectileSpeed||390,splash,radius:splash,life:8});e.reload=d.reload/Math.max(0.45,state.weatherFactor*formationFactor(e,'range'));if(e.formation==='limbered')e.reload=Math.max(e.reload,3);}
      function canCross(x,y){const pts=map.terrain.ridge;let nearest=Infinity;for(const p of pts)nearest=Math.min(nearest,Math.hypot(x-p[0],y-p[1]));return nearest>34;}
      function advance(e,tx,ty,dt){const d=unitDef(e),dx=tx-e.x,dy=ty-e.y,len=Math.hypot(dx,dy);if(len<2)return;if(d.capabilities.includes('artillery')&&e.formation==='deployed'){e.formation='limbered';e.reload=Math.max(e.reload,2.5);}let speed=d.speed*(e.formation==='limbered'?1:formationFactor(e,'speed'))*(e.routed?1.25:1);let nx=e.x+dx/len*speed*dt,ny=e.y+dy/len*speed*dt;
        // Both historical roads are walkable; the central ridge is a meaningful obstacle. Deterministic detour follows the configured pass.
        if(!canCross(nx,ny)){const flank=ny<850?690:1050;if(Math.abs(nx-e.x)>=Math.abs(ny-e.y))ny+=Math.sign(flank-e.y)*speed*dt;else nx+=Math.sign((e.side==='red'?1110:1100)-e.x)*speed*dt;}
        e.x=clamp(nx,25,W-25);e.y=clamp(ny,25,H-25);}
      function tick(dt){if(state.winner)return;const started=performance.now();state.tick++;state.time+=dt;state.rallyCooldown.red=Math.max(0,state.rallyCooldown.red-dt);state.rallyCooldown.blue=Math.max(0,state.rallyCooldown.blue-dt);aiClock+=dt;
        if(aiClock>=1){aiClock=0;for(const e of state.units.filter(u=>u.side==='blue'&&u.hp>0&&!u.routed)){const t=nearestEnemy(e,unitDef(e).sight);if(t){setTarget(e,t);}else if(distance(e,state.objective)>150)e.order={type:'move',x:state.objective.x+((e.id%3)-1)*32,y:state.objective.y+((e.id%2)?45:-45)};}}
        const bins=spatialHash();
        for(const e of state.units){if(e.hp<=0)continue;const d=unitDef(e);e.reload=Math.max(0,e.reload-dt);if(e.routed){const o=e.order;if(o)advance(e,o.x,o.y,dt);continue;}
          if(d.capabilities.includes('infantry')&&state.units.some(c=>c.side===e.side&&unitDef(c).capabilities.includes('command')&&distance(c,e)<unitDef(c).commandAura))e.morale=Math.min(100,e.morale+0.12*dt);
          let target=state.units.find(t=>t.id===e.targetId&&t.hp>0&&t.side!==e.side);if(!target){target=nearestEnemy(e,d.sight);if(target)setTarget(e,target);}
          if(target){const reach=d.range+unitDef(target).r;if(distance(e,target)<=reach){if(e.reload<=0&&d.attack>0&&e.morale>18){if(d.capabilities.includes('artillery')&&e.formation==='limbered'){e.formation='deployed';e.reload=3;}else fire(e,target);}}else advance(e,target.x,target.y,dt);continue;}
          if(e.order?.type==='move')advance(e,e.order.x,e.order.y,dt);
        }
        // Predictable, capped artillery impacts with modest area damage.
        for(const p of state.projectiles){const t=state.units.find(e=>e.id===p.targetId&&e.hp>0);if(!t){p.life=0;continue;}const dx=t.x-p.x,dy=t.y-p.y,dd=Math.hypot(dx,dy),step=p.speed*dt;if(dd<=step+3){p.x=t.x;p.y=t.y;p.life=0;const victims=state.units.filter(e=>e.side!==p.side&&e.hp>0&&distance(e,p)<=Math.max(4,p.splash));for(const v of victims)hit(v,p.damage*(p.splash?Math.max(.25,1-distance(v,p)/p.splash):1),state.units.find(u=>u.side===p.side&&u.kind===p.kind),!!p.splash);}else{p.x+=dx/dd*step;p.y+=dy/dd*step;p.life-=dt;}}
        state.projectiles=state.projectiles.filter(p=>p.life>0);
        state.smoke=state.smoke.map(p=>({...p,t:p.t-dt})).filter(p=>p.t>0).slice(-24);
        const red=state.units.filter(e=>e.side==='red'&&e.hp>0&&!e.routed&&distance(e,state.objective)<=state.objective.radius),blue=state.units.filter(e=>e.side==='blue'&&e.hp>0&&!e.routed&&distance(e,state.objective)<=state.objective.radius);
        if(red.length>blue.length)state.objective.hold.red+=dt;else if(blue.length>red.length)state.objective.hold.blue+=dt;else{state.objective.hold.red=Math.max(0,state.objective.hold.red-dt*.5);state.objective.hold.blue=Math.max(0,state.objective.hold.blue-dt*.5);}
        if(state.objective.hold.red>=HOLD){state.winner='red';state.victoryReason='pass-held';}else if(state.objective.hold.blue>=HOLD){state.winner='blue';state.victoryReason='pass-held';}
        for(const side of ['red','blue']){const living=state.units.filter(e=>e.side===side&&e.hp>0&&!unitDef(e).capabilities.includes('command')&&!unitDef(e).capabilities.includes('logistics'));const total=state.units.filter(e=>e.side===side&&!unitDef(e).capabilities.includes('command')&&!unitDef(e).capabilities.includes('logistics')).length;if(!total||living.length/total<cfg.victory.routeMoraleThreshold){state.winner=side==='red'?'blue':'red';state.victoryReason='line-routed';}}
        simCosts.push(performance.now()-started);if(simCosts.length>300)simCosts.shift();
        if(state.winner&&!resultShown)finish();
      }
      function draw(){ctx.clearRect(0,0,view.w,view.h);ctx.save();ctx.translate(-camera.x,-camera.y);
        ctx.fillStyle='#b89a6d';ctx.fillRect(0,0,W,H);
        // Dry basin / foothills, shaded contours, and the ridge from a historic campaign sketch interpreted as RTS space.
        for(let i=0;i<12;i++){ctx.beginPath();ctx.ellipse(1100+(i%3)*25,850,210+i*24,420+i*18,-.15,0,Math.PI*2);ctx.fillStyle=`rgba(77,62,48,${.018+i*.002})`;ctx.fill();ctx.strokeStyle='rgba(70,55,43,.19)';ctx.lineWidth=3;ctx.stroke();}
        polygon(ctx,map.terrain.ridge,theme.sand,'#806c53');
        ctx.strokeStyle='#dfc79e';ctx.lineWidth=15;ctx.lineCap='round';ctx.setLineDash([2,0]);ctx.beginPath();map.terrain.oldRoad.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();ctx.setLineDash([10,9]);ctx.lineWidth=2;ctx.strokeStyle='#705d47';ctx.stroke();
        ctx.strokeStyle='#d3b88a';ctx.lineWidth=11;ctx.setLineDash([]);ctx.beginPath();map.terrain.newRoad.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();
        ctx.strokeStyle='#64808a';ctx.lineWidth=12;ctx.beginPath();map.terrain.watercourse.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();
        ctx.fillStyle='#574b3d';ctx.font='bold 24px Georgia';ctx.fillText('CUESTA VIEJA',690,1350);ctx.fillText('CUESTA NUEVA',430,780);ctx.fillText('ALTOS DE CHACABUCO',1000,325);ctx.fillText('ESTERO',1150,1140);
        for(const [x,y,n] of [[420,950,34],[710,1180,22],[830,540,25],[1300,1190,32],[1830,640,29],[2000,1100,36]]){ctx.fillStyle='#73624c';ctx.beginPath();ctx.ellipse(x,y,n,n*.54,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#927757';ctx.beginPath();ctx.ellipse(x-5,y-5,n*.55,n*.23,0,0,Math.PI*2);ctx.fill();}
        for(const p of state.smoke){ctx.fillStyle=`rgba(54,48,43,${Math.min(.35,p.t/7)})`;ctx.beginPath();ctx.arc(p.x,p.y,p.size*(1.4-p.t/4),0,Math.PI*2);ctx.fill();}
        for(const p of state.projectiles){ctx.strokeStyle=p.splash?'#d07a3d':'#e9c789';ctx.lineWidth=p.splash?4:2;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-9,p.y+5);ctx.stroke();ctx.fillStyle=p.splash?'#a35f3c':'#f6d49a';ctx.beginPath();ctx.arc(p.x,p.y,p.splash?5:2.5,0,Math.PI*2);ctx.fill();}
        for(const e of [...state.units].sort((a,b)=>a.y-b.y))drawFormation(e);
        const obj=state.objective;ctx.strokeStyle='#efe0b7';ctx.setLineDash([8,8]);ctx.lineWidth=3;ctx.beginPath();ctx.arc(obj.x,obj.y,obj.radius,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='rgba(24,22,19,.78)';ctx.fillRect(obj.x-105,obj.y+obj.radius+8,210,25);ctx.fillStyle='#f4ead4';ctx.font='bold 14px system-ui';ctx.textAlign='center';ctx.fillText(obj.name,obj.x,obj.y+obj.radius+25);ctx.restore();
        drawMiniMap();
      }
      function drawFormation(e){const d=unitDef(e),color=ERA.factions.definitions[e.side].color;ctx.save();const line=e.formation==='line',count=d.capabilities.includes('infantry')?12:d.capabilities.includes('artillery')?4:d.capabilities.includes('mounted')?7:d.capabilities.includes('command')?1:d.capabilities.includes('logistics')?1:0;
        ctx.fillStyle='rgba(32,27,22,.27)';ctx.beginPath();ctx.ellipse(e.x,e.y+17,d.r*1.5,9,0,0,Math.PI*2);ctx.fill();
        for(let i=0;i<count;i++){const cols=line?6:3,xx=e.x+(i%cols-(cols-1)/2)*8,yy=e.y+(Math.floor(i/cols)-(Math.ceil(count/cols)-1)/2)*8;ctx.fillStyle=d.capabilities.includes('artillery')?'#493a30':d.capabilities.includes('mounted')?'#6b4e3c':'#4c4840';ctx.beginPath();ctx.arc(xx,yy,3.5,0,Math.PI*2);ctx.fill();ctx.fillStyle=color.main;ctx.fillRect(xx-3,yy-1,6,4);}
        ctx.strokeStyle=color.main;ctx.lineWidth=2;ctx.beginPath();ctx.arc(e.x,e.y,Math.max(d.r,e.formation==='line'?32:24),0,Math.PI*2);ctx.stroke();if(selection.includes(e.id)){ctx.strokeStyle='#f3dfad';ctx.lineWidth=3;ctx.setLineDash([5,4]);ctx.beginPath();ctx.arc(e.x,e.y,42,0,Math.PI*2);ctx.stroke();}
        if(d.capabilities.includes('command')){ctx.strokeStyle=color.light;ctx.lineWidth=1;ctx.setLineDash([4,7]);ctx.beginPath();ctx.arc(e.x,e.y,d.commandAura,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
        ctx.fillStyle='#261e18';ctx.fillRect(e.x-31,e.y-d.r-16,62,5);ctx.fillStyle=e.morale<30?'#d47854':'#ced0a1';ctx.fillRect(e.x-31,e.y-d.r-16,62*e.morale/100,3);ctx.fillStyle='#281f18';ctx.fillRect(e.x-31,e.y-d.r-9,62,4);ctx.fillStyle='#d09d63';ctx.fillRect(e.x-31,e.y-d.r-9,62*(e.hp/e.maxHp),3);
        ctx.fillStyle='#f1e7d5';ctx.font='11px system-ui';ctx.textAlign='center';ctx.fillText(e.label,e.x,e.y+d.r+20);
        if(d.capabilities.includes('firearm')){ctx.fillStyle='#251d17';ctx.fillRect(e.x-18,e.y+d.r+24,36,4);ctx.fillStyle='#d7bd89';ctx.fillRect(e.x-18,e.y+d.r+24,36*e.ammo/Math.max(1,e.maxAmmo),3);}
        if(e.routed){ctx.fillStyle='#f2b18b';ctx.fillText('SE RETIRA',e.x,e.y-d.r-21);}ctx.restore();}
      function drawMiniMap(){const w=150,h=95,x=view.w-w-18,y=82;ctx.save();ctx.fillStyle='rgba(23,21,19,.8)';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#d9c5a1';ctx.strokeRect(x,y,w,h);for(const e of state.units){ctx.fillStyle=ERA.factions.definitions[e.side].color.main;ctx.fillRect(x+e.x/W*w-2,y+e.y/H*h-2,4,4);}ctx.strokeStyle='#f2e7ce';ctx.strokeRect(x+camera.x/W*w,y+camera.y/H*h,view.w/W*w,view.h/H*h);ctx.restore();}
      function syncHud(){if(!state||!active)return;const r=state.res.red.ledger;document.getElementById('chSupplies').textContent=Math.floor(r.supplies);document.getElementById('chAmmo').textContent=Math.floor(r.ammunition);document.getElementById('chSelection').textContent=selection.length?state.units.filter(e=>selection.includes(e.id)).map(e=>e.label).join(' · '):'SIN FORMACIÓN SELECCIONADA';const selected=state.units.filter(e=>selection.includes(e.id));const e=selected[0];document.getElementById('chUnitStatus').textContent=e?`${e.formation.toUpperCase()} · moral ${Math.round(e.morale)} · munición ${e.ammo}/${e.maxAmmo} · recarga ${e.reload.toFixed(1)}s`:'Selecciona una formación · clic derecho ordena movimiento/ataque';document.getElementById('chObjectiveProgress').textContent=`${sideName('red')} ${Math.floor(state.objective.hold.red)}/${HOLD}s · ${sideName('blue')} ${Math.floor(state.objective.hold.blue)}/${HOLD}s`;document.getElementById('formationRally').disabled=!selected.some(v=>unitDef(v).capabilities.includes('command'))||state.rallyCooldown.red>0;document.getElementById('resupplyBtn').disabled=!selected.some(v=>v.maxAmmo>v.ammo);}
      function worldPoint(event){const r=canvas.getBoundingClientRect();return{x:clamp(event.clientX-r.left+camera.x,0,W),y:clamp(event.clientY-r.top+camera.y,0,H)};}
      function handleClick(event){const p=worldPoint(event);if(event.button===2){const target=state.units.filter(e=>e.side==='blue'&&e.hp>0).sort((a,b)=>distance(p,a)-distance(p,b))[0];if(target&&distance(p,target)<65)command({type:'attack',targetId:target.id});else command({type:'move',x:p.x,y:p.y});return;}
        const nearest=state.units.filter(e=>e.side==='red'&&e.hp>0).sort((a,b)=>distance(p,a)-distance(p,b))[0];selection=nearest&&distance(p,nearest)<58?[nearest.id]:[];syncHud();}
      function loop(ts){if(!active)return;const now=ts/1000,raw=last?now-last:0,dt=Math.min(.25,raw);last=now;if(raw>0){perfFrames.push(raw*1000);if(perfFrames.length>600)perfFrames.shift();}accumulator+=dt;while(accumulator>=STEP){if(replay?.playback){while(replay.index<replay.record.commands.length&&replay.record.commands[replay.index].tick<=state.tick){const item=replay.record.commands[replay.index++];if(item.side==='red'){selection=item.cmd.ids||[];command({...item.cmd},false);}}}tick(STEP);accumulator-=STEP;}draw();syncHud();requestAnimationFrame(loop);}
      function finish(){
        if(!state?.winner||resultShown)return;active=false;resultShown=true;const finalChecksum=checksum();
        if(replay?.record){replayVerify={expected:replay.record.finalChecksum,actual:finalChecksum,matched:replay.record.finalChecksum===finalChecksum};window.dispatchEvent(new CustomEvent('reinos:replay-verified',{detail:replayVerify}));}
        if(replay&&!replay.playback){const record={...replay,finalTick:state.tick,finalChecksum,winner:state.winner,victoryReason:state.victoryReason,durationSeconds:state.time,finishedAt:Date.now(),result:state.winner==='red'?'victory':'defeat',commands:replay.commands};window.dispatchEvent(new CustomEvent('reinos:replay-complete',{detail:record}));}
        const won=state.winner==='red',frameMedian=median(perfFrames),frameP95=percentile(perfFrames,.95),tickMedian=median(simCosts),perfText=perfFrames.length?`Frame ${frameMedian.toFixed(2)} ms mediana · ${frameP95.toFixed(2)} ms p95 · tick sim ${tickMedian.toFixed(3)} ms mediano (${perfFrames.length} frames activos)`:'Rendimiento activo insuficiente para una medición',resultTag=state.victoryReason==='evidence-fixture'?' · VISTA DE PRUEBA DE INTERFAZ':'';
        const el=makeOverlay('chileArchive','chile-archive',`<div><div class="chile-kicker">FRONTERAS // CHILE 1817 · ARCHIVO HISTÓRICO</div><h2>${won?'EL PASO ESTÁ EN TUS MANOS':'LA LÍNEA SE RETIRA'}</h2><div class="archive-grid"><section><h3>HISTORIA DOCUMENTADA</h3><p>El 12 de febrero de 1817, las fuerzas del Ejército de los Andes y patriotas chilenos enfrentaron a fuerzas realistas en Chacabuco. La operación incluyó divisiones que avanzaron por rutas separadas. El resultado histórico favoreció al bando independentista.</p><a href="${ERA.campaign.sources.find(s=>s.id==='memoriaChilenaMap').url}" target="_blank" rel="noopener">Plano de Chacabuco · Memoria Chilena</a><p>Posiciones, ritmo, cifras y desenlace de esta simulación no se presentan como crónica exacta.</p></section><section><h3>RESULTADO DE TU CAMPAÑA</h3><p>${won?'Victoria':'Derrota'} · ${state.mode==='alternate'?'SIMULACIÓN CONTRAFÁCTICA':'RECONSTRUCCIÓN HISTÓRICA'}${resultTag}</p><p>Semilla ${state.seed} · ${state.tick} ticks · checksum ${finalChecksum}</p><p>Volleys de pólvora: ${state.stats.shots.red} · fuerzas en retirada: ${state.stats.routed.blue}</p><p>${perfText}</p></section></div><button id="chileArchiveClose" class="btn">VOLVER AL MENÚ</button></div>`);
        el.showModal();el.querySelector('#chileArchiveClose').onclick=()=>{el.close();el.remove();document.getElementById('chileHud')?.remove();document.querySelector('.controls')?.classList.remove('chile-controls');document.getElementById('menu').style.display='flex';};
      }
      function median(values){if(!values.length)return 0;const a=[...values].sort((x,y)=>x-y);return a[Math.floor(a.length/2)];}function percentile(values,p){if(!values.length)return 0;const a=[...values].sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.ceil(a.length*p)-1)];}
      function normalizeReplay(record){
        if(!record||record.version!==1||record.engine!=='fronteras-formations-v1'||record.eraId!==ERA.id||record.eraVersion!==ERA.version||record.rulesVersion!==ERA.rulesVersion||record.mapId!==map.id||!['historical','alternate'].includes(record.mode)||!Number.isInteger(record.seed)||record.seed<=0||!Number.isInteger(record.finalTick)||record.finalTick<1||record.finalTick>1000000||typeof record.finalChecksum!=='string'||!/^[0-9a-f]{8}$/.test(record.finalChecksum)||!Array.isArray(record.commands)||record.commands.length>12000)return null;
        const commands=[];for(const item of record.commands){if(!item||!Number.isInteger(item.tick)||item.tick<0||item.tick>record.finalTick||!['red','blue'].includes(item.side)||!item.cmd||!['move','attack','formation','rally','resupply'].includes(item.cmd.type)||!Array.isArray(item.cmd.ids)||!item.cmd.ids.length||item.cmd.ids.length>120)return null;const cmd={type:item.cmd.type,ids:item.cmd.ids.filter(id=>Number.isInteger(id)&&id>0)};if(cmd.ids.length!==item.cmd.ids.length)return null;if(cmd.type==='move'){if(!Number.isFinite(item.cmd.x)||!Number.isFinite(item.cmd.y)||item.cmd.x<0||item.cmd.x>W||item.cmd.y<0||item.cmd.y>H)return null;cmd.x=item.cmd.x;cmd.y=item.cmd.y;}if(cmd.type==='attack'){if(!Number.isInteger(item.cmd.targetId)||item.cmd.targetId<=0)return null;cmd.targetId=item.cmd.targetId;}if(cmd.type==='formation'){if(!['line','column'].includes(item.cmd.formation))return null;cmd.formation=item.cmd.formation;}commands.push({tick:item.tick,side:item.side,cmd});}
        return {...record,commands};
      }
      function runtimeChecksumProbe(seed){const old=state;const trial=value=>{fresh(value);const lead=state.units.find(e=>e.side==='red'&&unitDef(e).capabilities.includes('infantry'));lead.order={type:'move',x:map.objectives[0].x,y:map.objectives[0].y};for(let i=0;i<180;i++)tick(STEP);return checksum();};const one=trial(seed),two=trial(seed),different=trial(seed+1);state=old;return{ok:one===two&&one!==different,one,two,different,orders:[{type:'move',x:map.objectives[0].x,y:map.objectives[0].y}]};}
      function runtimeReplayProbe(seed){const saved={state,replay,active,aiClock,resultShown,selection};const run=(recording,record)=>{fresh(seed,record.mode);active=true;if(recording){replay={version:1,engine:'fronteras-formations-v1',eraId:ERA.id,eraVersion:ERA.version,rulesVersion:ERA.rulesVersion,mapId:map.id,mode:record.mode,seed,kind:'campaign',title:'Chacabuco · 12 febrero 1817',side:'red',commands:[]};selection=[state.units.find(e=>e.side==='red'&&unitDef(e).capabilities.includes('infantry')).id];command({type:'move',x:map.objectives[0].x,y:map.objectives[0].y});}else replay={record,playback:true,index:0};for(let i=0;i<180;i++){if(!recording)while(replay.index<record.commands.length&&record.commands[replay.index].tick<=state.tick){const entry=record.commands[replay.index++];selection=entry.cmd.ids.slice();command({...entry.cmd},false);}tick(STEP);}return checksum();};const mode='historical',expected=run(true,{mode}),record={...replay,finalTick:180,finalChecksum:expected};const checked=normalizeReplay(record),actual=checked?run(false,checked):null,mismatch=normalizeReplay({...record,eraId:'rey'})===null&&normalizeReplay({...record,mapId:'reinos-standard'})===null;state=saved.state;replay=saved.replay;active=saved.active;aiClock=saved.aiClock;resultShown=saved.resultShown;selection=saved.selection;return{matched:!!checked&&expected===actual,mismatchRejected:mismatch,expected,actual,record};}
      function bootApi(){
        window.REINOS={startSolo(side='red',difficulty){start('historical');},startCampaign(id){if(id!=='chacabuco1817')return false;showBriefing();return true;},startReplay(input){const record=normalizeReplay(input);if(!record)return false;replay={record,playback:true,index:0};start('replay',record.seed);return true;},normalizeReplay,getStateChecksum(){return checksum();},getRuntimeSnapshot(){return state?JSON.parse(JSON.stringify(state)):null;},getPerformanceReport(){return{frameMedianMs:median(perfFrames),frameP95Ms:percentile(perfFrames,.95),frameSamples:perfFrames.length,tickMedianMs:median(simCosts),tickSamples:simCosts.length,method:'intervalo RAF durante simulación activa; coste medido alrededor de cada tick'};},runDeterminismProbe(){return runtimeChecksumProbe(18170212);},runReplayChecksumProbe(seed=18170212){return runtimeReplayProbe(seed);},getMatchMeta(){return{eraId:ERA.id,eraVersion:ERA.version,rulesVersion:ERA.rulesVersion,mapId:map.id,mode:state?.mode||'historical',seed:state?.seed||0,checksum:checksum()};},restart(){active=false;document.getElementById('chileHud')?.remove();document.getElementById('menu').style.display='flex';},hostGame(){showBriefing();},joinGame(){showBriefing();},copyLink(){},shareLink(){},closeInvite(){},toggleReplayPause(){return null;},cycleReplaySpeed(){return null;}};
        if(window.__FRONTERAS_TEST__){window.REINOS.stepForTest=count=>{active=false;for(let i=0;i<count&&!state.winner;i++)tick(STEP);draw();syncHud();return JSON.parse(JSON.stringify(state));};window.REINOS.prepareArtilleryTest=()=>{active=false;const gun=state.units.find(e=>e.side==='red'&&unitDef(e).capabilities.includes('artillery')),target=state.units.find(e=>e.side==='blue'&&unitDef(e).capabilities.includes('infantry'));target.x=gun.x+310;target.y=gun.y;gun.formation='deployed';gun.reload=0;gun.targetId=target.id;selection=[gun.id];draw();syncHud();return{gunId:gun.id,targetId:target.id};};window.REINOS.finishForEvidence=()=>{active=false;state.winner='red';state.victoryReason='evidence-fixture';finish();};}
        Net.eraPackProvider=()=>ERA;Net.matchContractProvider=()=>ERA_CORE.contract(ERA,{mapId:map.id,seed:state?.seed||1,mode:state?.mode||'historical',scenarioId:'chacabuco1817'});
      }
      function bind(){
        createShell();bootApi();window.addEventListener('resize',resize);canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('pointerdown',e=>{if(active)handleClick(e);});window.addEventListener('keydown',e=>{if(!active)return;const key=e.key.toLowerCase();const d=key==='a'?[-1,0]:key==='d'?[1,0]:key==='w'?[0,-1]:key==='s'?[0,1]:null;if(d){camera.x=clamp(camera.x+d[0]*70,0,W-view.w);camera.y=clamp(camera.y+d[1]*70,0,H-view.h);}if(key==='escape'){active=false;document.getElementById('menu').style.display='flex';document.getElementById('chileHud')?.remove();}});
        if(ERA.id!=='rey'){document.getElementById('menu').style.display='flex';document.getElementById('hud').style.display='none';document.getElementById('panel').style.display='none';}
      }
      function commandApi(input){if(!input||typeof input!=='object')return false;if(input.type==='move')command({...input});else if(input.type==='attack')command({...input});else if(['formation','rally','resupply'].includes(input.type))command({...input});else return false;return true;}
      bind();
      return {command:commandApi};
    }
  }));
})();
