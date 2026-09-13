import './style.css';
import {calendarSamples,sampleDate} from './calendar-previews';
import {installPhoneViewport} from './phone-viewport';
import {API} from './api';import {Display,menuActions} from './display';import {DayFrame} from './controller';import {SettingsStore} from './storage';
import {loadSettings,validateConnection,orderedCalendars,type Settings,type CalendarInfo,type CalendarEvent} from './model';
const demo=new URLSearchParams(location.search).get('demo')==='1';
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const root=document.querySelector<HTMLElement>('#app')!;
installPhoneViewport(root);
const header=el('header'),brand=el('h1','DayFrame');header.append(brand,el('p','Your calendars. In sight.'));if(demo)header.append(el('strong','Sample calendars · Preview mode'));root.append(header);
const status=el('p','Loading saved settings…');status.role='status';root.append(status);
const preview=el('section');preview.className='preview';preview.setAttribute('aria-label','Glasses preview');
const controls=el('div');controls.className='controls';
const nav=el('nav');nav.setAttribute('aria-label','DayFrame settings');root.append(nav);const panel=el('section');panel.className='panel';root.append(panel);
const previewPanel=el('details');previewPanel.className='preview-panel';previewPanel.open=demo;previewPanel.append(el('summary','Glasses preview'),preview,controls);root.append(previewPanel);
let app:DayFrame;let store:SettingsStore;let tab='Connection';let working=false;
const display=new Display(preview,demo);display.show({title:'DayFrame',lines:['Open DayFrame settings on your phone','to pair your Organik Connector.'],footer:'Your calendars. In sight.'});
display.onError=m=>{status.textContent=m;};
async function action(fn:()=>Promise<void>){if(working)return;working=true;panel.inert=true;try{await fn();status.textContent=demo?'Sample calendars · Changes saved for this preview':'Saved on this device';}catch(e){status.textContent=e instanceof Error?e.message:String(e);renderSettings();}finally{working=false;panel.inert=false;}}
function button(text:string,fn:()=>void){const b=el('button',text);b.type='button';b.onclick=fn;return b;}
function change(patch:Partial<Settings>){void action(async()=>{await app.update({...app.settings,...patch});renderSettings();});}
function checkbox(text:string,checked:boolean,fn:(checked:boolean)=>void){const label=el('label'),input=el('input');input.type='checkbox';input.checked=checked;input.onchange=()=>fn(input.checked);label.className='check';label.append(input,el('span',text));return label;}
function pick<K extends keyof Settings>(key:K,label:string,options:[string,string][]){const wrap=el('label',label),select=el('select');for(const [value,text]of options){const o=el('option',text);o.value=value;select.append(o);}select.value=String(app.settings[key]);select.onchange=()=>change({[key]:select.value});wrap.append(select);return wrap;}
function calendarText(c:CalendarInfo){return `${c.title} · ${c.source}`;}
let previewEvents:CalendarEvent[]|null=null,previewError='',previewLoading=false,previewConnection='',previewRequest=0;
function updateCalendarSamples(){
 for(const node of panel.querySelectorAll<HTMLElement>('.calendar-samples')){
  node.replaceChildren();
  if(previewLoading){node.append(el('small','Loading event previews…'));continue;}
  if(previewError){node.append(el('small',previewError));continue;}
  if(previewEvents===null)continue;
  const events=calendarSamples(previewEvents,node.dataset.calendarId!);
  if(!events.length)node.append(el('small','No upcoming events in the next 30 days.'));
  for(const event of events){const row=el('p');row.append(el('span',event.title),el('small',sampleDate(event,app.settings)));node.append(row);}
 }
}
async function loadCalendarSamples(force=false){
 if(previewLoading||(!force&&previewEvents!==null))return;
 const request=++previewRequest;previewLoading=true;previewError='';updateCalendarSamples();
 try{const events=await app.api.previewEvents();if(request===previewRequest)previewEvents=events;}
 catch{if(request===previewRequest){previewEvents=null;previewError='Event previews unavailable. Check your connection and retry.';}}
 finally{if(request===previewRequest){previewLoading=false;updateCalendarSamples();}}
}
function calendarChoice(c:CalendarInfo,checked:boolean,onChange:(on:boolean)=>void){
 const card=el('div');card.className='calendar-choice';const samples=el('div');samples.className='calendar-samples';samples.dataset.calendarId=c.id;
 card.append(checkbox(calendarText(c),checked,onChange),samples);return card;
}
function renderSettings(){
 if(!app)return;const connection=app.settings.url+'\0'+app.settings.token;if(connection!==previewConnection){previewConnection=connection;previewRequest++;previewEvents=null;previewLoading=false;previewError='';}nav.replaceChildren();for(const name of ['Connection','Calendars','Custom','Order','Display']){const b=button(name,()=>{tab=name;renderSettings();});b.setAttribute('aria-current',String(tab===name));nav.append(b);}
 panel.replaceChildren(el('h2',tab==='Order'?'Calendar order':tab));
 if(tab==='Connection'){
  panel.append(el('p','On your Mac, open Organik Connector → Even G2 → DayFrame. Enable Calendars, start the G2 connection, then copy pairing. Keep Tailscale connected on your Mac and phone.'));
  const label=el('label','Pairing details'),input=el('textarea');input.placeholder='Paste pairing from your Connector';input.autocomplete='off';input.spellcheck=false;input.rows=3;label.append(input);panel.append(label);
  const connectButton=button(app.settings.token?'Update connection':'Connect',()=>{void action(async()=>{const connection=validateConnection(input.value);await app.update({...app.settings,...connection});input.value='';renderSettings();});});connectButton.className='connect-button';panel.append(connectButton);
  if(app.settings.token){panel.append(el('p','Paired to '+app.settings.url));panel.append(button('Disconnect DayFrame',()=>{void action(async()=>{await app.update({...app.settings,url:'',token:''});renderSettings();});}));}
  panel.append(button('Refresh calendars',()=>{void action(async()=>{await app.refresh();if(app.error)throw Error(app.error);renderSettings();});}));
  panel.append(el('p','DayFrame reads calendar names, event titles, times and locations. Calendar content stays in memory while the app is open. Pairing and preferences are saved on this device. Disconnect removes DayFrame’s saved pairing. Events are never changed.'));
 }else if(tab==='Calendars'){
  panel.append(el('p','Choose which calendars appear in All calendars and as individual lists on your glasses. New calendars are included only while “Show all calendars” is on.'));
  panel.append(checkbox('Show all calendars',app.settings.visible===null,on=>change({visible:on?null:app.calendars.map(c=>c.id)})));
  for(const c of app.calendars)panel.append(calendarChoice(c,app.settings.visible===null||app.settings.visible.includes(c.id),on=>{const ids=new Set(app.settings.visible??app.calendars.map(c=>c.id));on?ids.add(c.id):ids.delete(c.id);change({visible:[...ids]});}));
 }else if(tab==='Custom'){
  panel.append(el('p','Combine selected visible calendars into one chronological list. Open Calendars → Custom combined list on your glasses.'));
  for(const c of orderedCalendars(app.calendars,app.settings))panel.append(calendarChoice(c,app.settings.custom.includes(c.id),on=>{const ids=new Set(app.settings.custom);on?ids.add(c.id):ids.delete(c.id);change({custom:[...ids]});}));
 }else if(tab==='Order'){
  panel.append(el('p','Drag the handles to order visible calendars. This also breaks ties between events that start together. With a keyboard, focus a handle and use the arrow keys.'));
  const list=el('div');list.className='order-list';const calendars=orderedCalendars(app.calendars,app.settings);
  const reorder=(from:number,to:number)=>{if(from===to)return;const ids=calendars.map(c=>c.id);ids.splice(to,0,ids.splice(from,1)[0]);change({order:[...ids,...app.settings.order.filter(id=>!ids.includes(id))]});};
  for(const [i,c]of calendars.entries()){
   const row=el('div');row.className='order-row';const handle=button('☰',()=>{});handle.className='handle';handle.setAttribute('aria-label','Move '+c.title);row.append(handle,el('span',calendarText(c)));list.append(row);
   handle.onkeydown=e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();reorder(i,Math.max(0,Math.min(calendars.length-1,i+(e.key==='ArrowUp'?-1:1))));}};
   let target=i,dragging=false;
   handle.onpointerdown=e=>{if(working)return;dragging=true;target=i;handle.setPointerCapture(e.pointerId);row.classList.add('dragging');};
   handle.onpointermove=e=>{if(!dragging)return;const rows=[...list.children]as HTMLElement[];target=rows.reduce((best,r,j)=>Math.abs(e.clientY-(r.getBoundingClientRect().top+r.offsetHeight/2))<Math.abs(e.clientY-(rows[best].getBoundingClientRect().top+rows[best].offsetHeight/2))?j:best,0);rows.forEach((r,j)=>r.classList.toggle('drop-target',j===target));if(e.clientY<80)root.scrollBy(0,-14);if(e.clientY>root.getBoundingClientRect().bottom-80)root.scrollBy(0,14);};
   const cancel=()=>{dragging=false;row.classList.remove('dragging');[...list.children].forEach(r=>r.classList.remove('drop-target'));};
   handle.onpointerup=()=>{if(!dragging)return;cancel();reorder(i,target);};handle.onpointercancel=cancel;
  }panel.append(list);
 }else {
  panel.append(checkbox('Show countdown in event lists',app.settings.countdown==='list',on=>change({countdown:on?'list':'off'})),pick('jump','Default date jump',[['week','Week'],['month','Month'],['year','Year']]));
  panel.append(checkbox('Use 24-hour time',app.settings.clock24,on=>change({clock24:on})),checkbox('Show calendar names in event lists',app.settings.showCalendar,on=>change({showCalendar:on})));
  panel.append(el('p','The glasses use a fixed native font size. Event text, titles and menus use that size.'));
  panel.append(el('p','The glasses system menu has direct week, month and year jumps in both directions, Today, Calendars and Settings. Event details always show the countdown to the start. Enable the checkbox to also show it in lists. Past events show how long ago they started; all-day events also count from their start. Timed events use your phone’s time zone. All-day events retain their calendar date.'));
 }
 if(['Calendars','Custom'].includes(tab)&&app.calendars.length){panel.append(el('p','Next two events per calendar · Looking ahead 30 days'),button('Refresh event previews',()=>{void loadCalendarSamples(true);}));updateCalendarSamples();void loadCalendarSamples();}
 if(['Calendars','Custom','Order'].includes(tab)&&!app.calendars.length)panel.append(el('p','Connect and refresh to load your calendars.'));
}
async function start(){
 try{
  await display.connect();let settings:Settings;
  if(demo){settings=loadSettings(localStorage.getItem('dayframe.demo.settings')||'{}');}
  else{store=new SettingsStore(display.bridge!,localStorage);settings=await store.load();}
  const save=async(s:Settings)=>{if(demo)localStorage.setItem('dayframe.demo.settings',JSON.stringify(s));else await store.save(s);};
  app=new DayFrame(new API(settings,demo),display,settings,save);
  for(const [text,type]of [['↑',1],['Tap',0],['↓',2],['Back',3]]as const)controls.append(button(text,()=>{void action(()=>app.input(type));}));
  const menu=el('select');menu.setAttribute('aria-label','Glasses system menu');menu.append(el('option','Glasses menu…'));for(const name of menuActions)menu.append(el('option',name));menu.onchange=()=>{const selected=menuActions.find(a=>a===menu.value);menu.selectedIndex=0;if(selected)void action(()=>app.menu(selected));};controls.append(menu);
  app.onChange=()=>{status.textContent=app.error||'Calendars up to date';};
  renderSettings();await app.start();renderSettings();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void app.refresh();});
  window.addEventListener('pagehide',()=>app.stop());
 }catch(e){status.textContent=(e instanceof Error?e.message:String(e))+' Reopen DayFrame to retry. Saved settings were not replaced.';display.show({title:'DayFrame',lines:['Could not load saved settings.','Close and reopen DayFrame.','Your saved settings are unchanged.'],footer:''});}
}
void start();
