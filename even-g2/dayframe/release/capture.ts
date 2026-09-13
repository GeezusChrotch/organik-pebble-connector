// Screenshot-only fixtures. Never included in the shipping build.
import {DayFrame} from '../src/controller';
import {Display} from '../src/display';
import {API} from '../src/api';
import {loadSettings,parseDay,shiftDay} from '../src/model';
const settings=loadSettings('{}');
const api=new API(settings,true);
api.calendars=async()=>[{id:'schedule',title:'My schedule',source:'Sample calendar'}];
api.events=async(day)=>[
 {id:'planning',title:'Team planning',hour:10,offset:0,location:'Conference room'},
 {id:'lunch',title:'Lunch with Alex',hour:13,offset:0,location:'Garden Cafe'},
 {id:'walk',title:'Walk outside',hour:16,offset:0,location:'Riverside Park'},
 {id:'coffee',title:'Coffee with Sam',hour:10,offset:1,location:'Corner Coffee'},
 {id:'review',title:'Project review',hour:14,offset:1,location:'Studio'}
].map(e=>{const date=shiftDay(day,'day',e.offset),start=new Date(parseDay(date).setHours(e.hour,0,0,0)).getTime()/1000;return {id:e.id,title:e.title,location:e.location,start,end:start+3600,allDay:false,dateStart:date,dateLast:date,calendarID:'schedule',calendar:'My schedule'};});
const display=new Display(document.querySelector<HTMLElement>('#preview')!,false);
const app=new DayFrame(api,display,settings,async()=>{});
await display.connect();await app.start();console.log('[release capture] ready');
