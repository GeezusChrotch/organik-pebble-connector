import test from 'node:test';import assert from 'node:assert/strict';
import {shiftDay,loadSettings,orderedCalendars,dayEvents,countdown,validateConnection,type CalendarEvent} from '../src/model';
const calendars=[{id:'a',title:'Work',source:'Cloud'},{id:'b',title:'Personal',source:'Cloud'},{id:'c',title:'Hidden',source:'Local'}];
const event=(patch:Partial<CalendarEvent>={}):CalendarEvent=>({id:'e',calendarID:'a',calendar:'Work',title:'Meeting',start:new Date(2026,8,12,10).getTime()/1000,end:new Date(2026,8,12,11).getTime()/1000,allDay:false,dateStart:'2026-09-12',dateLast:'2026-09-12',location:'',...patch});
test('calendar date arithmetic clamps leap days and month ends without UTC drift',()=>{
 assert.equal(shiftDay('2024-02-29','year',1),'2025-02-28');assert.equal(shiftDay('2026-01-31','month',1),'2026-02-28');assert.equal(shiftDay('2026-03-31','month',-1),'2026-02-28');assert.equal(shiftDay('2026-12-28','week',1),'2027-01-04');assert.equal(shiftDay('2026-03-08','day',1),'2026-03-09');
});
test('visibility and custom membership intersect; empty selection remains empty',()=>{
 const s=loadSettings(JSON.stringify({visible:['a','b'],custom:['b','c'],order:['b','a']}));
 assert.deepEqual(orderedCalendars(calendars,s).map(c=>c.id),['b','a']);
 const events=[event(),event({calendarID:'b'}),event({calendarID:'c'})];
 assert.deepEqual(dayEvents(events,'2026-09-12','custom',calendars,s).map(e=>e.calendarID),['b']);
 assert.equal(dayEvents(events,'2026-09-12','all',calendars,{...s,visible:[]}).length,0);
 assert.equal(dayEvents(events,'2026-09-12','custom',calendars,{...s,custom:[]}).length,0);
});
test('all-day date spans retain local dates and ended midnight events do not leak into next day',()=>{
 const all=event({allDay:true,dateStart:'2026-09-11',dateLast:'2026-09-13'});const overnight=event({start:new Date(2026,8,11,23).getTime()/1000,end:new Date(2026,8,12,0).getTime()/1000});
 assert.deepEqual(dayEvents([all,overnight],'2026-09-12','all',calendars,loadSettings('{}')),[all]);
 assert.equal(dayEvents([all],'2026-09-14','all',calendars,loadSettings('{}')).length,0);
});
test('countdown always measures time from the start including past and all-day events',()=>{
 const e=event();assert.equal(countdown(e,(e.start-3600)*1000),'In 1h 0m');assert.equal(countdown(e,e.start*1000),'Starting now');assert.equal(countdown(e,e.end*1000),'Started 1h 0m ago');assert.equal(countdown({...e,allDay:true},(e.start-3600)*1000),'In 1h 0m');
});
test('pairing permits only private HTTPS origins and requires a token',()=>{
 assert.equal(validateConnection('{"url":"https://mac.example.ts.net:10558","token":"abc"}').url,'https://mac.example.ts.net:10558');
 for(const url of ['http://mac.example.ts.net','https://example.com','https://mac.example.ts.net/path','https://user@mac.example.ts.net'])assert.throws(()=>validateConnection(JSON.stringify({url,token:'abc'})));
});

test('legacy countdown settings preserve the list preference',()=>{for(const [old,expected] of [['off','off'],['event','off'],['list','list'],['both','list']])assert.equal(loadSettings(JSON.stringify({countdown:old})).countdown,expected);});
