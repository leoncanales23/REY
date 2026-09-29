/* Resolve edition before game.js captures the active content pack. */
(() => {
  'use strict';
  const params=new URLSearchParams(location.search), requested=params.get('era');
  if(requested&&globalThis.FRONTERAS_ERA_CORE?.get(requested)?.status==='playable') globalThis.FRONTERAS_ERA_CORE.activate(requested);
  if(globalThis.FRONTERAS_ERA_CORE?.active()?.id==='rey'){
    const menu=document.getElementById('menu'),card=menu?.querySelector('.card');
    if(menu&&card){
      const button=document.createElement('button');button.id='frontiersEntry';button.className='frontiers-entry';button.type='button';button.innerHTML='<span>FRONTERAS</span><small>Elige un mundo</small>';menu.insertBefore(button,card);
      const dialog=document.createElement('dialog');dialog.id='frontiersDialog';dialog.className='frontiers-dialog';dialog.innerHTML='<div class="frontiers-shell"><header><span>UN MOTOR · MUCHOS MUNDOS</span><button type="button" class="mini-btn" id="frontiersClose">CERRAR</button></header><h2>FRONTERAS</h2><div class="frontiers-cards"><article><b>FRONTERAS // REY</b><p>Fantasía medieval · reinos, economía y Bastiones.</p><button id="selectRey" class="mini-btn">JUGABLE</button></article><article class="ready"><b>FRONTERAS // CHILE 1817</b><p>Chacabuco · pólvora, moral y terreno de montaña.</p><button id="selectChile" class="mini-btn">JUGABLE · EXPERIMENTAL</button></article><article class="locked"><b>FRONTERAS // MARTE 2135</b><p>Un mundo ficticio de energía, oxígeno y hábitats.</p><button id="selectMars" disabled class="mini-btn">PRÓXIMAMENTE</button></article></div></div>';document.body.append(dialog);
      button.onclick=()=>dialog.showModal();dialog.querySelector('#frontiersClose').onclick=()=>dialog.close();dialog.querySelector('#selectRey').onclick=()=>dialog.close();
      dialog.querySelector('#selectChile').onclick=()=>{const url=new URL(location.href);url.searchParams.set('era','chile1810');url.searchParams.delete('room');url.searchParams.delete('sala');location.assign(url.toString());};
    }
  }
})();
