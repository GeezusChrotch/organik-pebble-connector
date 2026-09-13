export interface CalendarInfo {id:string;title:string;source:string}
export interface CalendarEvent {id:string;calendarID:string;calendar:string;title:string;start:number;end:number;allDay:boolean;dateStart:string;dateLast:string;location:string}
export type Jump='week'|'month'|'year';
export type Countdown='off'|'list';
export interface Settings {url:string;token:string;visible:string[]|null;custom:string[];order:string[];countdown:Countdown;jump:Jump;clock24:boolean;showCalendar:boolean}
export function loadSettings(raw:string):Settings {
 const v=JSON.parse(raw);if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Saved settings could not be read. No settings were replaced.');
 const ids=(x:unknown)=>Array.isArray(x)?[...new Set(x.filter((s):s is string=>typeof s==='string'))]:[];
 return {url:typeof v.url==='string'?v.url:'',token:typeof v.token==='string'?v.token:'',visible:Array.isArray(v.visible)?ids(v.visible):null,custom:ids(v.custom),order:ids(v.order),countdown:['list','both'].includes(v.countdown)?'list':'off',jump:['week','month','year'].includes(v.jump)?v.jump:'week',clock24:v.clock24===true,showCalendar:v.showCalendar!==false};
}
export function validateConnection(raw:string):{url:string;token:string} {
 let v;try{v=JSON.parse(raw);}catch{throw Error('Paste the pairing details copied from Connector → Even G2.');}
 const u=new URL(v.url);if(u.protocol!=='https:'||!u.hostname.endsWith('.ts.net')||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname)||typeof v.token!=='string'||!v.token.trim())throw Error('Use the private Tailscale pairing copied from your Connector.');
 return {url:u.origin,token:v.token};
}
export function dateKey(d:Date):string{return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function parseDay(s:string):Date {const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12);}
export function shiftDay(date:string,unit:Jump|'day',amount:number):string {
 const d=parseDay(date),day=d.getDate();
 if(unit==='day'||unit==='week')d.setDate(day+amount*(unit==='week'?7:1));
 else {d.setDate(1);if(unit==='month')d.setMonth(d.getMonth()+amount);else d.setFullYear(d.getFullYear()+amount);d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));}
 return dateKey(d);
}
export function orderedCalendars(calendars:CalendarInfo[],s:Settings):CalendarInfo[]{
 return calendars.filter(c=>s.visible===null||s.visible.includes(c.id)).sort((a,b)=>{const rank=(id:string)=>{const n=s.order.indexOf(id);return n<0?1e9:n;};return rank(a.id)-rank(b.id)||a.title.localeCompare(b.title)||a.source.localeCompare(b.source);});
}
export function dayEvents(events:CalendarEvent[],day:string,view:string,calendars:CalendarInfo[],s:Settings):CalendarEvent[]{
 const visible=orderedCalendars(calendars,s).map(c=>c.id);
 const allowed=new Set(visible.filter(id=>view==='all'||(view==='custom'?s.custom.includes(id):id===view)));
 return events.filter(e=>allowed.has(e.calendarID)&&(e.allDay?e.dateStart<=day&&e.dateLast>=day:e.start<new Date(parseDay(day).setHours(24,0,0,0)).getTime()/1000&&e.end>new Date(parseDay(day).setHours(0,0,0,0)).getTime()/1000))
 .sort((a,b)=>Number(b.allDay)-Number(a.allDay)||a.start-b.start||visible.indexOf(a.calendarID)-visible.indexOf(b.calendarID)||a.title.localeCompare(b.title));
}
export function countdown(e:CalendarEvent,now=Date.now()):string {
 const seconds=Math.floor(now/1000),delta=Math.floor(e.start)-seconds;
 if(delta===0)return 'Starting now';
 const minutes=Math.floor(Math.abs(delta)/60);
 const duration=minutes>=1440?`${Math.floor(minutes/1440)}d ${Math.floor(minutes%1440/60)}h`:minutes>=60?`${Math.floor(minutes/60)}h ${minutes%60}m`:minutes?`${minutes}m`:'less than 1 min';
 return delta<0?`Started ${duration} ago`:`In ${duration}`;
}
export function eventTime(e:CalendarEvent,s:Settings):string {return e.allDay?'All day':new Date(e.start*1000).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',hour12:!s.clock24});}
export function eventKey(e:CalendarEvent):string{return `${e.calendarID}\0${e.id}\0${e.start}`;}

// A continuous agenda: calendar filtering is independent of the selected date.
export function agendaEvents(events:CalendarEvent[],from:string,view:string,calendars:CalendarInfo[],s:Settings):CalendarEvent[]{
 const ids=orderedCalendars(calendars,s).map(c=>c.id);
 const allowed=new Set(ids.filter(id=>view==='all'||(view==='custom'?s.custom.includes(id):id===view)));
 const until=shiftDay(from,'day',30),lower=new Date(parseDay(from).setHours(0,0,0,0)).getTime()/1000,upper=new Date(parseDay(until).setHours(0,0,0,0)).getTime()/1000;
 return [...new Map(events.map(e=>[eventKey(e),e])).values()].filter(e=>allowed.has(e.calendarID)&&(e.allDay?e.dateLast>=from&&e.dateStart<until:e.end>lower&&e.start<upper)).sort((a,b)=>(a.dateStart<from?from:a.dateStart).localeCompare(b.dateStart<from?from:b.dateStart)||Number(b.allDay)-Number(a.allDay)||a.start-b.start||ids.indexOf(a.calendarID)-ids.indexOf(b.calendarID)||a.title.localeCompare(b.title));
}
