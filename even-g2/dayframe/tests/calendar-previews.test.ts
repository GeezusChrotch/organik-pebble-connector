import test from 'node:test';import assert from 'node:assert/strict';import {calendarSamples,sampleDate} from '../src/calendar-previews';import {loadSettings,type CalendarEvent} from '../src/model';import {API} from '../src/api';
const now=new Date(2026,8,12,12).getTime();
const event=(patch:Partial<CalendarEvent>={}):CalendarEvent=>({id:'1',calendarID:'a',calendar:'Calendar',title:'Upcoming',start:now/1000+60,end:now/1000+3600,allDay:false,dateStart:'2026-09-12',dateLast:'2026-09-12',location:'',...patch});
test('previews choose two distinct upcoming events from the requested calendar, including ongoing events',()=>{
 const first=event({id:'ongoing',start:now/1000-60});const next=event();
 const events=[event({calendarID:'b'}),event({id:'ended',start:0,end:1}),next,next,event({id:'later',start:now/1000+7200}),first];
 assert.deepEqual(calendarSamples(events,'a',now),[first,next]);assert.deepEqual(calendarSamples(events,'empty',now),[]);
});
test('all-day previews retain the calendar date and exclude completed all-day spans',()=>{
 const today=event({allDay:true,start:0,end:1});assert.deepEqual(calendarSamples([today,event({allDay:true,id:'past',dateLast:'2026-09-11'})],'a',now),[today]);assert.match(sampleDate(today,loadSettings('{}')),/Sep 12.*All day/);
});
test('preview loading makes one bounded request independent of visible calendar selection',async()=>{
 const api=new API({...loadSettings('{}'),visible:[]});const paths:string[]=[];
 api.request=async<T>(path:string)=>{paths.push(path);return {events:[]} as T;};await api.previewEvents();assert.equal(paths.length,1);
 const query=new URLSearchParams(paths[0].split('?')[1]);assert.equal(Number(query.get('end'))-Number(query.get('start')),30*86400);assert(!query.has('calendarID'));
});
