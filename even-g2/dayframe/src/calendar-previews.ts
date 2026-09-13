import {dateKey,eventTime,parseDay,type CalendarEvent,type Settings} from './model';
export function calendarSamples(events:CalendarEvent[],calendarID:string,now=Date.now()):CalendarEvent[]{
 const today=dateKey(new Date(now));
 const unique=[...new Map(events.map(e=>[JSON.stringify([e.calendarID,e.id,e.start,e.end]),e])).values()];
 return unique.filter(e=>e.calendarID===calendarID&&(e.allDay?e.dateLast>=today:e.end>now/1000)).sort((a,b)=>a.start-b.start||a.title.localeCompare(b.title)).slice(0,2);
}
export function sampleDate(e:CalendarEvent,settings:Settings):string {
 const day=e.allDay?parseDay(e.dateStart):new Date(e.start*1000);
 return day.toLocaleDateString([],{month:'short',day:'numeric'})+' · '+eventTime(e,settings);
}
