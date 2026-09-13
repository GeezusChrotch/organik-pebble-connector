import {type Settings,type CalendarInfo,type CalendarEvent,parseDay,shiftDay,dateKey} from './model';
export class API {
 constructor(public settings:Settings,public demo=false){}
 async request<T>(path:string):Promise<T>{
  if(!this.settings.url||!this.settings.token)throw Error('Pair DayFrame in the Even phone settings.');
  const r=await fetch(this.settings.url+'/dayframe/v1/'+path,{headers:{Authorization:'Bearer '+this.settings.token},signal:AbortSignal.timeout(20000),redirect:'error'});
  const data=await r.json();if(!r.ok)throw Error(data.error||'Calendar connection failed.');return data;
 }
 async calendars():Promise<CalendarInfo[]>{return this.demo?[{id:'work',title:'Work',source:'Sample calendars'},{id:'personal',title:'Personal',source:'Sample calendars'},{id:'family',title:'Family',source:'Sample calendars'}]:(await this.request<{calendars:CalendarInfo[]}>('calendars')).calendars;}
 async previewEvents():Promise<CalendarEvent[]>{
  const today=new Date();
  if(this.demo)return [...await this.events(shiftDay(dateKey(today),'day',1))];
  const start=new Date(today.getFullYear(),today.getMonth(),today.getDate()).getTime()/1000;
  // One bounded query for every calendar, including ones currently hidden on glasses.
  const end=start+30*86400;
  return (await this.request<{events:CalendarEvent[]}>('events?'+new URLSearchParams({start:String(start),end:String(end)}))).events;
 }
 async events(day:string):Promise<CalendarEvent[]>{
  if(this.demo){return Array.from({length:36},(_,i)=>{const eventDay=shiftDay(day,'day',Math.floor(i/12));const start=new Date(parseDay(eventDay).setHours(8+i%12,0,0,0)).getTime()/1000;return {id:String(i),calendarID:['work','personal','family'][i%3],calendar:['Work','Personal','Family'][i%3],title:['Production meeting','Coffee with Alex','Family dinner','Review next month’s schedule','Design review with the production team','A walk outside'][i%6],start,end:start+3600,allDay:i%12===0,dateStart:eventDay,dateLast:eventDay,location:i%2?'Studio':'Conference room'};});}
  // Query a bounded agenda with overlap for ongoing events.
  const start=new Date(parseDay(shiftDay(day,'day',-1)).setHours(0,0,0,0)).getTime()/1000;
  const end=new Date(parseDay(shiftDay(day,'day',30)).setHours(0,0,0,0)).getTime()/1000;
  return (await this.request<{events:CalendarEvent[]}>('events?'+new URLSearchParams({start:String(start),end:String(end)}))).events;
 }
}
