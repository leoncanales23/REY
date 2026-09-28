(() => {
  'use strict';
  const world=REINOS_WORLD, key='reinos.world.v1';
  const byId=id=>document.getElementById(id);
  let memory=world.normalizeProgress(null), storageFailed=false, selected='capital';
  function read() {
    try {
      const raw=localStorage.getItem(key);
      memory=world.normalizeProgress(raw && raw.length<16384 ? JSON.parse(raw) : null);
    } catch { storageFailed=true; }
    return memory;
  }
  function save(progress) {
    memory=progress;
    try { localStorage.setItem(key,JSON.stringify(progress)); storageFailed=false; }
    catch { storageFailed=true; }
  }
  function progress() { return storageFailed?memory:read(); }
  const svgNS='http://www.w3.org/2000/svg';
  function svgNode(tag,attrs) {
    const node=document.createElementNS(svgNS,tag);
    for(const [name,value] of Object.entries(attrs)) node.setAttribute(name,value);
    return node;
  }
  function render() {
    const saved=progress(), region=world.get(selected)||world.REGIONS[0];
    const count=Object.keys(saved.completed).length;
    byId('worldProgress').textContent=`${count} / ${world.REGIONS.length} TERRITORIOS CONQUISTADOS`;
    byId('worldStorage').textContent=storageFailed?'No se pudo guardar en este navegador. El progreso se conserva solo durante esta sesión.':'Progreso guardado en este navegador · sin ventajas de combate permanentes';
    for(const item of world.REGIONS) {
      const available=world.unlocked(item.id,saved), won=!!saved.completed[item.id];
      const state=won?'conquered':available?'available':'locked';
      const node=byId(`region-${item.id}`), land=byId(`land-${item.id}`);
      node.dataset.state=land.dataset.state=state;
      node.setAttribute('aria-pressed',String(item.id===selected));
      node.setAttribute('aria-label',`${item.name}: ${won?'conquistada':available?'disponible':'bloqueada'}`);
      node.querySelector('small').textContent=won?'★'.repeat(saved.completed[item.id]):available?'EXPEDICIÓN DISPONIBLE':'BLOQUEADA';
      land.classList.toggle('selected',item.id===selected);
    }
    const unlocked=world.unlocked(region.id,saved);
    byId('worldChapter').textContent=region.chapter;
    byId('worldName').textContent=region.name;
    byId('worldDescription').textContent=region.description;
    byId('worldDifficulty').textContent=`${region.difficulty} · ${saved.completed[region.id]?'★'.repeat(saved.completed[region.id]):'Sin conquistar'}`;
    byId('worldObjective').textContent=region.objective;
    byId('worldRules').textContent=region.rules;
    byId('worldReward').textContent=region.reward;
    byId('worldDetails').dataset.biome=region.biome;
    byId('worldStart').disabled=!unlocked;
    byId('worldStart').textContent=unlocked?(saved.completed[region.id]?'VOLVER A LA BATALLA':'MARCHAR A LA BATALLA'):`CONQUISTA ${world.get(region.requires[0])?.name.toUpperCase()}`;
  }
  function open() { render(); if(!byId('worldDialog').open) byId('worldDialog').showModal(); }
  function start(id) {
    const region=world.get(id);
    if(!region || !world.unlocked(id,progress())) return false;
    byId('worldDialog').close();
    return REINOS.startCampaign(region.mission,{regionId:id});
  }
  function createMap() {
    const lands=byId('worldLands'), markers=byId('worldMarkers'), routes=byId('worldRoutes');
    for(const region of world.REGIONS) {
      const polygon=svgNode('polygon',{id:`land-${region.id}`,points:region.territory,class:`world-land ${region.biome}`});
      lands.append(polygon);
      for(const previous of region.requires) {
        const parent=world.get(previous);
        routes.append(svgNode('path',{d:`M ${parent.x*10} ${parent.y*6} Q ${parent.x*10} ${region.y*6} ${region.x*10} ${region.y*6}`}));
      }
      const button=document.createElement('button');
      button.id=`region-${region.id}`; button.className='world-region'; button.type='button';
      button.style.left=`${region.x}%`; button.style.top=`${region.y}%`;
      const crest=document.createElement('span'); crest.className='world-crest'; crest.textContent=region.crest;
      const title=document.createElement('strong'); title.textContent=region.name;
      button.append(crest,title,document.createElement('small'));
      button.addEventListener('click',()=>{selected=region.id;render();});
      markers.append(button);
    }
  }
  window.addEventListener('reinos:campaign-complete',event=>{
    const detail=event.detail||{}, meta=REINOS.getMatchMeta(), region=world.get(detail.regionId);
    if(!region || meta.replay || meta.regionId!==region.id || detail.id!==region.mission || !world.unlocked(region.id,progress())) return;
    if(detail.won) save(world.complete(progress(),region.id,detail.stars));
    selected=region.id;
    byId('campaignRetryBtn').onclick=()=>start(region.id);
    const next=world.REGIONS.find(item=>item.requires.includes(region.id)&&!progress().completed[item.id]);
    const button=byId('campaignNextBtn');
    button.hidden=!(detail.won&&next);
    button.textContent=next?`EXPLORAR ${next.name.toUpperCase()}`:'';
    button.onclick=next?()=>{selected=next.id;open();}:null;
    byId('worldReturn').hidden=false;
    byId('worldOutcome').hidden=false;
    byId('worldOutcome').textContent=detail.won?`CONQUISTADA · ${region.name} — ${region.reward}`:`${region.name} resiste. Reagrupa tus tropas y vuelve a intentarlo.`;
    render();
  });
  window.addEventListener('reinos:match-start',()=>{
    byId('worldReturn').hidden=true; byId('worldOutcome').hidden=true;
  });
  window.addEventListener('storage',event=>{if(event.key===key){storageFailed=false;render();}});
  byId('openWorldBtn').addEventListener('click',open);
  byId('closeWorldBtn').addEventListener('click',()=>byId('worldDialog').close());
  byId('worldStart').addEventListener('click',()=>start(selected));
  byId('worldReturn').addEventListener('click',open);
  createMap(); render();
})();
