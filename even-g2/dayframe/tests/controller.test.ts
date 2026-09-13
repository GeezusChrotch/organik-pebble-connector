import test from 'node:test';import assert from 'node:assert/strict';import {DayFrame} from '../src/controller';import {API} from '../src/api';import {loadSettings,shiftDay,parseDay} from '../src/model';import {type Display,type Screen} from '../src/display';
function setup(){let screen:Screen|undefined;const display={onInput:()=>{},onMenu:()=>{},show:(s:Screen)=>{screen=s;},exit:async()=>{}} as unknown as Display;const app=new DayFrame(new API(loadSettings('{}'),true),display,loadSettings('{}'),async()=>{});return {app,screen:()=>screen!};}
test('event selection, detail pagination, date jumps and calendar views work through glasses input',async()=>{
 const {app,screen}=setup();await app.refresh();assert.equal(app.page,'calendars');await app.input(0);assert.equal(app.page,'events');await app.input(0);assert.equal(app.page,'event');assert(screen().lines.some(l=>l.includes('Production meeting')));
 await app.input(3);assert.equal(app.page,'events');app.events=[];app.day='2024-02-29';await app.menu('Next year');assert.equal(app.day,'2025-02-28');
 await app.menu('Calendars');await app.input(2);await app.input(0);assert.equal(app.view,'custom');assert.equal(app.items.length,0);
});
test('a late old query cannot overwrite the selected day and failed loads clear stale content',async()=>{
 const {app}=setup();app.page='events';let finish:(v:any)=>void=()=>{};app.api.events=()=>new Promise(r=>{finish=r;});const first=app.refresh();
 app.api.events=async()=>[];await app.jump('week',1);finish([{id:'stale'}]);await first;assert.deepEqual(app.events,[]);
 app.api.events=async()=>{throw Error('Offline');};await app.refresh();assert.equal(app.error,'Offline');assert.deepEqual(app.events,[]);
});

test('calendar-first navigation uses every event row, scrolls between dates, and goes back through the hierarchy',async()=>{
 const {app,screen}=setup();let exited=false;app.display.exit=async()=>{exited=true;};
 await app.refresh();assert.equal(screen().title,'DayFrame');assert.equal(app.events.length,0);
 await app.input(0);assert.equal(app.page,'events');assert(screen().lines[0].includes('Production meeting'));assert(!screen().lines.some(l=>/Previous day|Next day/.test(l)));
 const first=app.events[1];const events=[first,{...first,id:'tomorrow',title:'Tomorrow meeting',start:first.start+86400,end:first.end+86400}];app.events=events;app.api.events=async()=>events;app.selected=0;
 await app.input(2);assert.equal(app.selected,1);assert(screen().lines.some(l=>l.includes('Tomorrow meeting')));
 await app.input(0);assert.equal(app.page,'event');await app.input(3);assert.equal(app.page,'events');assert.equal(app.selected,1);await app.input(3);assert.equal(app.page,'calendars');assert(!exited);await app.input(3);assert(exited);
});
test('scrolling at agenda boundaries loads the adjacent range and selects the correct edge',async()=>{
 const {app}=setup();await app.refresh();await app.input(0);const before=app.day;app.selected=app.items.length-1;await app.input(2);assert.equal(app.day,shiftDay(before,'day',30));assert.equal(app.selected,0);await app.input(1);assert.equal(app.day,before);assert.equal(app.selected,app.items.length-1);
});

test('details always show countdown while settings only toggle list countdown',async()=>{
 const {app,screen}=setup();await app.refresh();await app.input(0);
 const e=app.items[0];e.start=Date.now()/1000+3600;e.end=e.start+3600;app.events=[e];app.render();
 assert(!screen().lines.some(l=>l.includes(' · In ')));
 await app.input(0);assert(screen().lines.some(l=>l.startsWith('In ')));
 await app.input(3);await app.menu('Settings');assert(screen().lines[0].includes('List countdown: Off'));
 await app.input(0);assert.equal(app.settings.countdown,'list');await app.input(3);assert(screen().lines.some(l=>l.includes(' · In ')));
 await app.menu('Settings');await app.input(0);assert.equal(app.settings.countdown,'off');await app.input(3);await app.input(0);assert(screen().lines.some(l=>l.startsWith('In ')));
});

test('multiple days share pages with separators only before date headings and stable selection',async()=>{
 const {app,screen}=setup();await app.refresh();await app.input(0);app.settings.showCalendar=false;
 const sample=app.events[1],day=app.day,start=new Date(parseDay(day).setHours(9,0,0,0)).getTime()/1000;
 app.events=Array.from({length:5},(_,i)=>({...sample,id:String(i),title:'Event '+i,dateStart:shiftDay(day,'day',Math.floor(i/2)),dateLast:shiftDay(day,'day',Math.floor(i/2)),start:start+Math.floor(i/2)*86400+i*3600,end:start+Math.floor(i/2)*86400+(i+1)*3600}));app.render();
 const title=screen().title;assert(screen().lines.some(l=>l.includes('Event 2')));assert.deepEqual(screen().dayBreaks,[2]);assert.equal(screen().lines.length,5);
 await app.input(2);await app.input(2);assert.equal(screen().title,title);assert(screen().lines.some(l=>l.startsWith('› ')&&l.includes('Event 2')));
 await app.input(0);assert(screen().lines.some(l=>l.includes('Event 2')));await app.input(3);
 await app.input(2);await app.input(2);assert.notEqual(screen().title,title);assert(screen().lines[0].includes('Event 4'));assert.deepEqual(screen().dayBreaks,[]);
 await app.input(1);assert.equal(screen().title,title);
});
test('calendar labels appear in combined views only and countdown remains optional in lists',async()=>{
 const {app,screen}=setup();await app.refresh();await app.input(0);app.settings.countdown='off';app.render();
 assert(screen().lines.some(l=>l.trim()==='Work'));
 app.view='work';app.render();assert(!screen().lines.some(l=>l.trim()==='Work'));
 app.view='custom';app.settings.custom=['work','personal'];app.render();assert(screen().lines.some(l=>l.trim()==='Work'));
 app.settings.showCalendar=false;app.render();assert(!screen().lines.some(l=>l.trim()==='Work'));
});

test('time leads the event title on one line with a middle dot and compact am/pm',async()=>{
 const {app,screen}=setup();await app.refresh();assert.equal(screen().title,'DayFrame');assert.equal(screen().calendarIcon,true);await app.input(0);
 assert(screen().lines[0].startsWith('› All Day · '));assert.deepEqual(screen().dayBreaks,[]);
 assert(screen().lines.some(l=>/^  9:00am · Coffee/.test(l)));
 app.settings.clock24=true;app.render();assert(screen().lines.some(l=>/^  09:00 · Coffee/.test(l)));
});
