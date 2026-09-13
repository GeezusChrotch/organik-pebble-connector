import {pxTruncate} from '@evenrealities/pretext';
import {API} from './api';
import {type Display,type MenuAction} from './display';
import {dateKey,shiftDay,parseDay,orderedCalendars,agendaEvents,countdown,eventTime,eventKey,type Settings,type CalendarInfo,type CalendarEvent,type Jump} from './model';
export class DayFrame {
 calendars:CalendarInfo[]=[];events:CalendarEvent[]=[];day=dateKey(new Date());view='all';page:'events'|'event'|'calendars'|'settings'='calendars';selected=0;detailPage=0;busy=false;error='';private generation=0;private selectedEvent?:CalendarEvent;private settingsReturn:'events'|'calendars'='calendars';private alive=true;private timer?:ReturnType<typeof setInterval>;
 onChange:()=>void=()=>{};
 constructor(public api:API,public display:Display,public settings:Settings,private save:(s:Settings)=>Promise<void>){
  display.onInput=t=>{void this.input(t).catch(e=>this.fail(e));};display.onMenu=a=>{void this.menu(a).catch(e=>this.fail(e));};
 }
 private fail(e:unknown){this.error=e instanceof Error?e.message:String(e);this.busy=false;this.render();}
 async start(){await this.refresh();this.timer=setInterval(()=>{if(this.alive&&!this.busy&&(this.page==='events'||this.page==='event'))this.render();},15000);}
 stop(){this.alive=false;this.generation++;if(this.timer)clearInterval(this.timer);}
 async refresh(){
  const generation=++this.generation;this.busy=true;this.error='';this.render();
  try{const [calendars,events]=await Promise.all([this.api.calendars(),this.page==='calendars'?Promise.resolve([]):this.api.events(this.day)]);if(generation!==this.generation||!this.alive)return;this.calendars=calendars;this.events=events;if(this.view!=='all'&&this.view!=='custom'&&!orderedCalendars(calendars,this.settings).some(c=>c.id===this.view))this.view='all';if(this.selectedEvent){this.selectedEvent=events.find(e=>eventKey(e)===eventKey(this.selectedEvent!));if(!this.selectedEvent)this.page='events';}}
  catch(e){if(generation===this.generation){this.events=[];this.selectedEvent=undefined;if(this.page==='event')this.page='events';this.error=e instanceof Error?e.message:String(e);}}
  finally{if(generation===this.generation&&this.alive){this.busy=false;this.render();this.onChange();}}
 }
 get items(){return agendaEvents(this.events,this.day,this.view,this.calendars,this.settings);}
 async update(settings:Settings){await this.save(settings);this.settings=settings;this.api.settings=settings;this.selected=0;if(this.page==='event')this.page='events';await this.refresh();}

 async jump(unit:Jump|'day',n:number){this.day=shiftDay(this.day,unit,n);this.page='events';this.selected=0;this.selectedEvent=undefined;await this.refresh();}
 async menu(action:MenuAction){
  if(action==='Today'){this.day=dateKey(new Date());this.page='events';this.selected=0;this.selectedEvent=undefined;await this.refresh();}
  else if(action.startsWith('Previous ')||action.startsWith('Next '))await this.jump(action.split(' ')[1] as Jump,action.startsWith('Previous')?-1:1);
  else if(action==='Refresh')await this.refresh();
  else {if(action==='Settings')this.settingsReturn=this.page==='calendars'?'calendars':'events';this.page=action==='Calendars'?'calendars':'settings';this.selected=0;this.render();}
 }
 private calendarRows(){return [{id:'all',title:'All visible calendars'},{id:'custom',title:'Custom combined list'},...orderedCalendars(this.calendars,this.settings)];}
 private settingRows(){return [`List countdown: ${this.settings.countdown==='list'?'On':'Off'}`,`Jump by: ${this.settings.jump}`,`Clock: ${this.settings.clock24?'24-hour':'12-hour'}`,`Calendar labels: ${this.settings.showCalendar?'On':'Off'}`,'Previous '+this.settings.jump,'Next '+this.settings.jump,'Today','Calendars','Back'];}
 async input(type:number){
  if(!this.alive)return;if(type===6||type===7){this.stop();return;}if(type===5){await this.refresh();return;}
  if(type===3){if(this.page==='calendars')await this.display.exit();else if(this.page==='event'){this.page='events';this.render();}else{this.page=this.page==='settings'?this.settingsReturn:'calendars';this.selected=0;this.render();}return;}
  if(this.busy)return;
  if(type===1||type===2){const delta=type===1?-1:1;
   if(this.page==='event'){this.detailPage=Math.max(0,Math.min(Math.ceil(this.details().length/6)-1,this.detailPage+delta));}
   else if(this.page==='events'){const next=this.selected+delta;if(!this.items.length||next<0||next>=this.items.length){this.day=shiftDay(this.day,'day',delta*30);this.selectedEvent=undefined;await this.refresh();this.selected=delta<0?Math.max(0,this.items.length-1):0;}else this.selected=next;}
   else {const length=this.page==='calendars'?this.calendarRows().length:this.settingRows().length;this.selected=Math.max(0,Math.min(length-1,this.selected+delta));}
   this.render();return;
  }
  if(type!==0)return;
  if(this.error){await this.refresh();return;}
  if(this.page==='events'){
   this.selectedEvent=this.items[this.selected];if(this.selectedEvent){this.page='event';this.detailPage=0;}
  }else if(this.page==='calendars'){this.view=this.calendarRows()[this.selected].id;this.day=dateKey(new Date());this.page='events';this.selected=0;await this.refresh();}
  else if(this.page==='settings'){
   const s={...this.settings};if(this.selected===0){s.countdown=s.countdown==='list'?'off':'list';}
   else if(this.selected===1){const options:Jump[]=['week','month','year'];s.jump=options[(options.indexOf(s.jump)+1)%3];}
   else if(this.selected===2)s.clock24=!s.clock24;else if(this.selected===3)s.showCalendar=!s.showCalendar;
   else if(this.selected===4||this.selected===5){await this.jump(s.jump,this.selected===4?-1:1);return;}
   else if(this.selected===6){await this.menu('Today');return;}
   else if(this.selected===7){await this.menu('Calendars');return;}else {this.page=this.settingsReturn;this.selected=0;this.render();return;}
   await this.save(s);this.settings=s;this.api.settings=s;this.onChange();
  }
  this.render();
 }
 private wrap(s:string):string[]{const lines:string[]=[];for(const para of s.split(/\n/)){let rest=para;while(rest){let line=pxTruncate(rest,540);if(line!==rest){line=line.replace(/…$|\.\.\.$/,'');const space=line.lastIndexOf(' ');if(space>line.length/2)line=line.slice(0,space);}if(!line)line=rest[0];lines.push(line);rest=rest.slice(line.length).trimStart();}}return lines;}
 private details():string[]{const e=this.selectedEvent;if(!e)return ['Event no longer available'];return [...this.wrap(e.title),countdown(e),...this.wrap(e.calendar),e.allDay?`All day · ${e.dateStart}`:new Date(e.start*1000).toLocaleString([],{hour12:!this.settings.clock24}),e.allDay?(e.dateLast!==e.dateStart?`Through ${e.dateLast}`:''):('Ends '+new Date(e.end*1000).toLocaleString([],{hour12:!this.settings.clock24})),...this.wrap(e.location||'No location')].filter(Boolean);}
 private eventPage(){
  const items=this.items;this.selected=Math.max(0,Math.min(items.length-1,this.selected));
  const dayOf=(e:CalendarEvent)=>e.dateStart<this.day?this.day:e.dateStart;
  const label=(day:string)=>parseDay(day).toLocaleDateString([],{weekday:'short',month:'short',day:'numeric',year:'numeric'});
  let first=0;
  while(first<items.length){
   const lines:string[]=[],dayBreaks:number[]=[];const title=label(dayOf(items[first]));let day=dayOf(items[first]),i=first;
   for(;i<items.length;i++){
    const e=items[i],nextDay=dayOf(e);
    const metadata=[this.settings.showCalendar&&['all','custom'].includes(this.view)?e.calendar:'',this.settings.countdown==='list'?countdown(e):''].filter(Boolean);
    if(lines.length+1+(metadata.length?1:0)+(nextDay!==day?1:0)>6)break;
    if(nextDay!==day){dayBreaks.push(lines.length);lines.push(label(nextDay));day=nextDay;}
    const time=e.allDay?'All Day':e.dateStart<day?'Continues':eventTime(e,this.settings).replace(/\s/g,'').toLowerCase();
    lines.push((i===this.selected?'› ':'  ')+time+' · '+e.title);
    if(metadata.length)lines.push('  '+metadata.join(' · '));
   }
   if(this.selected<i)return {title,lines,dayBreaks};first=i;
  }
  return {title:label(this.day),lines:[this.view==='custom'&&!this.settings.custom.length?'Choose calendars in Custom settings.':'No upcoming events.','Scroll to browse another 30 days.'],dayBreaks:[]};
 }
 render(){
  let title='DayFrame',lines:string[]=[],footer='Scroll · Tap · Double tap back',dayBreaks:number[]=[];
  if(this.busy){lines=['Loading calendars…'];}
  else if(this.error){lines=['Calendar connection unavailable',...this.wrap(this.error).slice(0,4),'Tap to retry'];}
  else if(this.page==='event'){const all=this.details();lines=all.slice(this.detailPage*6,this.detailPage*6+6);title=`Event · ${this.detailPage+1}/${Math.max(1,Math.ceil(all.length/6))}`;footer=`${this.detailPage+1}/${Math.max(1,Math.ceil(all.length/6))} · Scroll to read · Double tap back`;}
  else if(this.page==='events'){({title,lines,dayBreaks}=this.eventPage());footer=(this.calendarRows().find(c=>c.id===this.view)?.title||'All visible calendars')+' · Menu for date jumps';}
  else {const rows=this.page==='calendars'?this.calendarRows().map(c=>(c.id===this.view?'✓ ':'')+c.title):this.settingRows();title=this.page==='calendars'?'DayFrame':'Settings';this.selected=Math.max(0,Math.min(rows.length-1,this.selected));const first=Math.floor(this.selected/6)*6;lines=rows.slice(first,first+6).map((row,j)=>(first+j===this.selected?'› ':'  ')+row);}
  this.display.show({title,lines,footer,dayBreaks,calendarIcon:!this.busy&&!this.error&&this.page==='calendars'});
 }
}
