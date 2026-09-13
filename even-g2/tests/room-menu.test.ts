import test from 'node:test';import assert from 'node:assert/strict';
import {Pome} from '../pome/src/controller';import {loadSettings} from '../pome/src/model';
test('room scenes precede typed device groups; Lights contains All lights and Sensors stays separate',async()=>{
 const devices=['light','light','outlet','fan','motion-sensor','temperature-sensor'].map((type,i)=>({type,serviceId:String(i),name:'Item '+i,room:'Control Room',state:{on:true}}));
 const api={settings:loadSettings('{}'),request:async()=>devices};const p=new Pome(api as any,{show(){}} as any);
 p.snapshot={rooms:[{id:'cr',name:'Control Room'}],devices,scenes:[{id:'one',name:'CR Movie'},{id:'two',name:'Control Work'},{id:'three',name:'Control Room Off'},{id:'wrong',name:'Controlroom Wrong'},{id:'other',name:'Lounge'}],cameras:[]};p.home();await(p as any).room(p.snapshot.rooms[0]);
 const room=(p as any).page;assert.deepEqual(room.rows.map((r:any)=>r.label),['Control Room Off','Control Work','CR Movie','Lights','Fans','Plugs','Sensors']);
 assert.equal(room.rows[0].key,'scene:three');await room.rows[3].run();assert.deepEqual((p as any).page.rows.map((r:any)=>r.label.split(' · ')[0]),['All lights','Item 0','Item 1']);
 await p.input(3);assert.equal((p as any).page,room);await room.rows.at(-1).run();assert.equal((p as any).page.rows.length,2);assert.ok((p as any).page.rows.every((r:any)=>['device:4','device:5'].includes(r.key)));
});
test('empty room has no empty device submenus and preserves room cameras',async()=>{
 const api={settings:loadSettings('{}'),request:async()=>[]};const p=new Pome(api as any,{show(){}} as any);p.home();p.snapshot.cameras=[{id:'cam',name:'Door',room:'Other',roomId:'room',age:0,ready:true}];await(p as any).room({id:'room',name:'Studio'});assert.deepEqual((p as any).page.rows.map((r:any)=>r.label),['Cameras (1)']);
 api.settings.showCameras=false;await(p as any).room({id:'room',name:'Studio'});assert.equal((p as any).page.rows[0].label,'Nothing here yet');
});
test('a failed state read keeps reachable light controls available without guessing power state',async()=>{
 const {stateText}=await import('../pome/src/model');const device={serviceId:'light',name:'Lamp',room:'Studio',type:'light',reachable:true,stateIncomplete:true,state:{}};
 assert.equal(stateText(device),'State not refreshed');assert.equal(stateText({...device,reachable:false}),'Unavailable');assert.equal(stateText({...device,state:{on:true}}),'On');
 const p=new Pome({settings:loadSettings('{}')} as any,{show(){}} as any);p.home();(p as any).showDevice(device,false);assert.deepEqual((p as any).page.rows.slice(0,2).map((r:any)=>r.label),['Turn on','Turn off']);
 (p as any).showDevice({...device,reachable:false},true);assert.deepEqual((p as any).page.rows.map((r:any)=>r.label),['Refresh state']);
});
test('TV choices stay in one device menu and use the selected HomeKit identifier',async()=>{
 const device={serviceId:'tv',name:'Lounge Apple TV',type:'television',room:'Lounge',state:{on:true,inputId:7},inputs:[{id:7,name:'YouTube'},{id:22,name:'Netflix'}]};const writes:string[]=[];
 const api={settings:loadSettings('{}'),request:async(path:string,method:string)=>{if(method==='POST')writes.push(path);return device;}};const p=new Pome(api as any,{show(){}} as any);p.home();await(p as any).device(device);
 assert.deepEqual((p as any).page.rows.map((r:any)=>r.label),['Turn off','✓ YouTube','Netflix','Refresh state']);await(p as any).page.rows[2].run();assert.deepEqual(writes,['/home/input/22/tv']);
 (p as any).showDevice({...device,reachable:false},true);assert.deepEqual((p as any).page.rows.map((r:any)=>r.label),['Refresh state']);
});
