import type {Pome} from './controller';
import {validateConnection,sections as homeSections,type Section,type Settings} from './model';
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
export function settingsUI(root:HTMLElement,pome:Pome,save:()=>Promise<void>){
 const activeTab=root.querySelector('nav button.active')?.textContent;
 root.replaceChildren();const settings=pome.api.settings;
 const header=el('header');header.append(el('h1','Pome'),el('p','Apple Home on your Even G2'));root.append(header);
 const status=el('p');status.className='status';status.setAttribute('role','status');
 const tabs=el('nav'),sections=el('div');root.append(tabs,sections,status);
 function section(name:string){const panel=el('section');panel.hidden=activeTab?name!==activeTab:sections.children.length>0;const b=el('button',name);b.type='button';b.className=panel.hidden?'':'active';b.onclick=()=>{for(const p of sections.children)(p as HTMLElement).hidden=p!==panel;for(const button of tabs.children)button.classList.toggle('active',button===b);};tabs.append(b);sections.append(panel);return panel;}
 const connection=section('Connection'),home=section('Home'),voice=section('Voice'),images=section('Images'),lightSettings=section('Colors');
 function field(parent:HTMLElement,label:string,value:string,type='text'){const wrap=el('label',label),input=el('input');input.type=type;input.value=value;input.autocomplete='off';wrap.append(input);parent.append(wrap);return input;}
 function select(parent:HTMLElement,label:string,value:string,choices:[string,string][]){const wrap=el('label',label),input=el('select');for(const [v,n] of choices){const o=el('option',n);o.value=v;input.append(o);}input.value=value;wrap.append(input);parent.append(wrap);return input;}
 connection.append(el('h2','Pair your Connector'),el('p','On your Mac: Organik Apps Connector → Even G2 → Start G2 connection → Copy pairing. Paste the details here. Keep Tailscale connected on both devices.'));
 const pairing=el('textarea');pairing.placeholder='Paste pairing details';pairing.setAttribute('aria-label','Pairing details');pairing.autocomplete='off';connection.append(pairing);
 const importButton=el('button','Use pairing details');connection.append(importButton);
 const url=field(connection,'Private Connector address',settings.url,'url'),token=field(connection,'Connection token',settings.token,'password');
 importButton.onclick=()=>{try{const data=JSON.parse(pairing.value);url.value=validateConnection(data.url);if(typeof data.token!=='string'||!data.token.trim())throw new Error('Pairing token missing');token.value=data.token;pairing.value='';status.textContent='Pairing entered. Save and connect below.';}catch(e){status.textContent=e instanceof Error?e.message:'Invalid pairing details';}};
 home.append(el('h2','Your home screen'),el('p','Drag sections into the order you want on your glasses. Uncheck a section to hide it; its position, favorites and settings are kept.'));
 const hiddenSections=[...settings.hiddenSections];
 const sectionOrder=[...settings.sectionOrder];

 const pins=[...settings.pins],roomOrder=[...settings.roomOrder];
 function orderedList(parent:HTMLElement,label:string,items:{key:string;name:string}[],order:string[],choose:boolean,hidden?:Section[]){
  if(label)parent.append(el('h3',label));const list=el('div');list.className='order';parent.append(list);
  const render=()=>{list.replaceChildren();const sorted=[...items].sort((a,b)=>{const ai=order.indexOf(a.key),bi=order.indexOf(b.key);return (ai<0?99999:ai)-(bi<0?99999:bi);});for(const item of sorted){const row=el('div');row.className='order-row';row.draggable=false;row.dataset.key=item.key;
   const handle=el('button','≡');handle.type='button';handle.className='drag';handle.setAttribute('aria-label','Reorder '+item.name);handle.onkeydown=e=>{if(e.key!=='ArrowUp'&&e.key!=='ArrowDown')return;e.preventDefault();const from=order.indexOf(item.key),to=from+(e.key==='ArrowUp'?-1:1);if(from>=0&&to>=0&&to<order.length){order.splice(from,1);order.splice(to,0,item.key);render();}};row.append(handle);
   if(hidden){const label=el('label',item.name),check=el('input');check.type='checkbox';check.checked=!hidden.includes(item.key as Section);check.onchange=()=>{const i=hidden.indexOf(item.key as Section);if(check.checked&&i>=0)hidden.splice(i,1);else if(!check.checked&&i<0)hidden.push(item.key as Section);};label.prepend(check);row.append(label);}
   else if(choose){const label=el('label',item.name);const check=el('input');check.type='checkbox';check.checked=order.includes(item.key);check.onchange=()=>{const index=order.indexOf(item.key);if(check.checked&&index<0)order.push(item.key);else if(index>=0)order.splice(index,1);render();};label.prepend(check);row.append(label);}else row.append(el('span',item.name));
   let pointer:number|undefined,from=0,to=0,startY=0,lastY=0,frame=0,initialScroll=0;
   let rows:HTMLElement[]=[],centers:number[]=[],step=0;
   const paint=()=>{const delta=lastY-startY+window.scrollY-initialScroll;const center=centers[from]+delta;to=from;for(let i=0;i<centers.length;i++){if(i<from&&center<centers[i]){to=i;break;}if(i>from&&center>centers[i])to=i;}
    rows.forEach((r,i)=>{r.style.transform=`translateY(${i===from?delta:i>from&&i<=to?-step:i<from&&i>=to?step:0}px)`;});};
   const scroll=()=>{if(pointer===undefined)return;const bounds=list.getBoundingClientRect();const speed=lastY<70&&bounds.top<70?-8:lastY>window.innerHeight-70&&bounds.bottom>window.innerHeight-70?8:0;if(speed){window.scrollBy(0,speed);paint();}frame=requestAnimationFrame(scroll);};
   handle.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();pointer=e.pointerId;rows=Array.from(list.children) as HTMLElement[];from=rows.indexOf(row);to=from;startY=lastY=e.clientY;initialScroll=window.scrollY;centers=rows.map(r=>{const b=r.getBoundingClientRect();return b.top+b.height/2;});step=rows.length>1?centers[1]-centers[0]:row.getBoundingClientRect().height;handle.setPointerCapture(pointer);row.classList.add('dragging');frame=requestAnimationFrame(scroll);};
   handle.onpointermove=e=>{if(pointer!==e.pointerId)return;e.preventDefault();lastY=e.clientY;paint();};
   const finish=(e:PointerEvent)=>{if(pointer!==e.pointerId)return;pointer=undefined;cancelAnimationFrame(frame);if(e.type!=='pointercancel'){const key=order.indexOf(item.key);if(key>=0){if(from!==to){const target=rows[to].dataset.key!;order.splice(key,1);const anchor=order.indexOf(target);order.splice(anchor+(from<to?1:0),0,item.key);}}}rows.forEach(r=>{r.style.transform='';r.classList.remove('dragging');});if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);render();};
   handle.onpointerup=finish;handle.onpointercancel=finish;
   list.append(row);
  }};render();
 }
 orderedList(home,'',homeSections.map(key=>({key,name:key[0].toUpperCase()+key.slice(1)})),sectionOrder,false,hiddenSections);
 const snap=pome.snapshot;
 const catalog=[...snap.rooms.map(r=>({key:'room:'+r.id,name:r.name,type:'Rooms'})),...snap.scenes.map(s=>({key:'scene:'+s.id,name:s.name,type:'Scenes'})),...snap.devices.map(d=>({key:'device:'+d.serviceId,name:d.room+' · '+d.name,type:d.type.replace(/-/g,' ').replace(/^./,c=>c.toUpperCase())})),...snap.cameras.map(c=>({key:'camera:'+c.id,name:c.name,type:'Cameras'}))];
 home.append(el('h3','Add favorites'),el('p','Choose a type, then an item to pin. Only your selected favorites appear below.'));
 const categories=[...new Set(catalog.map(i=>i.type))].sort();
 const type=select(home,'Favorite type',root.dataset.favoriteType||categories[0]||'',[...categories.map(n=>[n,n] as [string,string])]);
 const item=select(home,'Item to favorite','',[]),add=el('button','Add favorite');home.append(add);
 const chosen=el('div');home.append(chosen);
 const renderFavorites=()=>{item.replaceChildren();for(const entry of catalog.filter(i=>i.type===type.value&&!pins.includes(i.key)).sort((a,b)=>a.name.localeCompare(b.name))){const option=el('option',entry.name);option.value=entry.key;item.append(option);}add.disabled=!item.options.length;chosen.replaceChildren();orderedList(chosen,'Favorites',pins.map(key=>catalog.find(i=>i.key===key)||{key,name:'Unavailable favorite'}),pins,true);};
 type.onchange=()=>{root.dataset.favoriteType=type.value;renderFavorites();};add.onclick=()=>{if(item.value&&!pins.includes(item.value))pins.push(item.value);renderFavorites();};
 chosen.addEventListener('change',()=>renderFavorites());renderFavorites();
 for(const r of snap.rooms)if(!roomOrder.includes(r.id))roomOrder.push(r.id);
 orderedList(home,'Room order',snap.rooms.map(r=>({key:r.id,name:r.name})),roomOrder,false);
 if(!snap.rooms.length)home.append(el('p','Save and connect to load rooms and favorites.'));
 voice.append(el('h2','Dictation'),el('p','Choose Dictate on the glasses, speak, then tap to finish. Review the recognized action before confirming. Double tap cancels recording. Local dictation is prepared automatically by your Mac Connector. An optional custom provider can be configured there.'));
 const language=select(voice,'Spoken language',settings.language,[['en','English']]);
 voice.append(el('p','Shortcut: tap then hold to open the glasses system menu, then select Dictate. Holding alone does nothing.'));
 images.append(el('h2','Green camera snapshots'),el('p','Images are converted to 16 shades for the G2 display. Pome shows when the snapshot was captured; tap the image to request a new capture. Camera capture availability is shared with Pebble.'));
 const contrast=select(images,'Image treatment',settings.contrast,[['natural','Natural'],['high-contrast','High contrast'],['original','Original']]);
 const show=select(images,'Camera menus',String(settings.showCameras),[['true','Show'],['false','Hide']]);
 lightSettings.append(el('h2','Custom light colors'),el('p','Save three colors for any light or all lights in a room. Slide along the rainbow to choose a color, then adjust how vivid or white it is. Brightness stays separate.'));
 const customColors=settings.customColors.map(c=>({...c}));
 customColors.forEach((color,index)=>{
  const card=el('div');card.className='custom-color-card';card.append(el('h3',`Custom color ${index+1}`));lightSettings.append(card);
  const swatch=el('div');swatch.className='color-swatch';swatch.setAttribute('aria-label',`Custom color ${index+1} preview`);card.append(swatch);
  const hue=field(card,`Color ${index+1} · Hue`,String(color.h),'range');hue.min='0';hue.max='359';hue.step='1';hue.value=String(color.h);hue.className='hue-slider';
  const saturation=field(card,`Color ${index+1} · White to vivid`,String(color.s),'range');saturation.min='0';saturation.max='100';saturation.step='1';saturation.className='saturation-slider';
  const ends=el('div');ends.className='slider-ends';ends.append(el('span','White'),el('span','Vivid'));card.append(ends);
  const paint=()=>{color.h=Number(hue.value);color.s=Number(saturation.value);swatch.style.background=`hsl(${color.h} 100% ${50+(100-color.s)/2}%)`;saturation.style.background=`linear-gradient(to right,white,hsl(${color.h} 100% 50%))`;};
  hue.oninput=paint;saturation.oninput=paint;paint();
 });
 const button=el('button','Save and connect');button.className='primary';root.append(button);
 button.onclick=async()=>{button.disabled=true;try{Object.assign(settings,{hiddenSections,sectionOrder,customColors,customColor:{...customColors[0]},url:pome.api.demo?url.value:validateConnection(url.value.trim()),token:token.value.trim(),pins,roomOrder,language:language.value,contrast:contrast.value,showCameras:show.value==='true'});if(!pome.api.demo&&!settings.token)throw new Error('Paste your connection token.');await save();status.textContent='Saved. Connecting…';await pome.reload();const currentStatus=root.querySelector('[role=status]');if(currentStatus)currentStatus.textContent='Settings saved. See the glasses preview for connection status.';}catch(e){status.textContent=e instanceof Error?e.message:'Could not save';}finally{button.disabled=false;}};
 const footer=el('p','Your settings stay in this app. Pairing credentials are never included in shared builds.');footer.className='muted';root.append(footer);
}
