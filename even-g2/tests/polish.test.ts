import test from 'node:test';
import assert from 'node:assert/strict';
import {Pome} from '../pome/src/controller';
import {API} from '../pome/src/api';
import {defaults,colorCommand,voiceCommand,type Snapshot} from '../pome/src/model';
import type {Display} from '../pome/src/display';
const light=(id:string)=>({name:id,serviceId:id,type:'light',room:'Studio',state:{on:true,hue:0,saturation:100,brightness:100}});
const snapshot:Snapshot={rooms:[{id:'studio',name:'Studio'}],devices:[light('one'),light('two')],scenes:[],cameras:[]};
test('preset and custom room colors target each light by ID',()=>{
 const command=colorCommand('Custom',snapshot.devices,359,27);
 assert.deepEqual(command.paths,['/home/color/359/27/one','/home/color/359/27/two']);
 assert.throws(()=>colorCommand('Bad',snapshot.devices,360,50));
 assert.match(voiceCommand('Set Studio lights sky blue',snapshot).paths[0],/\/200\/100\//);
});
test('hidden sections retain pins and room custom color can be applied through navigation',async()=>{
 let view:any;const writes:string[]=[];
 const api=new API({...defaults,pins:['room:studio'],hiddenSections:['favorites','scenes','devices','sensors','cameras','dictation'],customColor:{h:42,s:67},customColors:[{h:42,s:67},{h:200,s:100},{h:280,s:100}]},true);
 api.snapshot=async()=>snapshot;
 api.request=async(path:string,method?:string)=>{if(method==='POST'){writes.push(path);return {} as any;}return snapshot.devices as any;};
 const pome=new Pome(api,{show:(v:any)=>{view=v;},exit:async()=>{}} as unknown as Display);
 await pome.start();assert.deepEqual(view.lines,['> Rooms','  Refresh home']);assert.deepEqual(api.settings.pins,['room:studio']);
 await pome.input(0);await pome.input(0);await pome.input(0);await pome.input(0);
 assert.match(view.title,/color/);
 for(let i=0;i<16;i++)await pome.input(2);
 await pome.input(0);assert.match(view.footer,/Hue 42/);
 await pome.input(2);await pome.input(0);assert.match(view.footer,/Hue 43/);
 await pome.input(1);await pome.input(0);
 assert.deepEqual(writes,['/home/color/43/67/one','/home/color/43/67/two']);
});
test('home sections follow saved order while hidden sections retain position',async()=>{
 const {loadSettings,sections}=await import('../pome/src/model');
 const settings=loadSettings(JSON.stringify({sectionOrder:['cameras','scenes','cameras','invalid'],hiddenSections:['scenes'],pins:['room:studio']}));
 assert.deepEqual(settings.sectionOrder,['cameras','scenes',...sections.filter(s=>s!=='cameras'&&s!=='scenes')]);
 let view:any;const api=new API(settings,true);api.snapshot=async()=>snapshot;
 const pome=new Pome(api,{show:(v:any)=>view=v} as unknown as Display);await pome.start();
 assert.match(view.lines[0],/Cameras/);assert.match(view.lines[1],/Studio/);assert.ok(!view.lines.some((s:string)=>s.includes('Scenes')));
 settings.hiddenSections=[];pome.home();assert.match(view.lines[1],/Scenes/);assert.match(view.lines[2],/Studio/);
 assert.deepEqual(loadSettings('{}').sectionOrder,[...sections]);
});
test('three custom colors migrate safely and each applies to all room lights',async()=>{
 const {loadSettings}=await import('../pome/src/model');
 const settings=loadSettings(JSON.stringify({customColor:{h:42,s:67},sectionOrder:['rooms'],hiddenSections:['favorites','scenes','devices','sensors','cameras','dictation']}));
 assert.deepEqual(settings.customColors,[{h:42,s:67},{h:200,s:100},{h:280,s:100}]);
 assert.equal(loadSettings(JSON.stringify({customColors:[{h:999,s:1}]})).customColors[0].h,35);
 for(let slot=0;slot<3;slot++){
  const writes:string[]=[];const api=new API(settings,true);api.snapshot=async()=>snapshot;
  api.request=async(path:string,method?:string)=>{if(method==='POST'){writes.push(path);return {} as any;}return snapshot.devices as any;};
  let screen:any;const pome=new Pome(api,{show:(s:any)=>screen=s} as unknown as Display);await pome.start();
  await pome.input(0);await pome.input(0);await pome.input(0);await pome.input(0);
  for(let i=0;i<16+slot;i++)await pome.input(2);
  assert.ok(screen.lines.some((s:string)=>s===`> Custom color ${slot+1}`));
  await pome.input(0);await pome.input(0);
  const c=settings.customColors[slot];assert.deepEqual(writes,[`/home/color/${c.h}/${c.s}/one`,`/home/color/${c.h}/${c.s}/two`]);
 }
});
test('room light adjustments do not select a similarly named switch or sensor',()=>{
 const home:Snapshot={rooms:[{id:'lounge',name:'Lounge'}],scenes:[],cameras:[],devices:[
  {...light('Arch'),room:'Lounge'}, {...light('Bias'),room:'Lounge'},
  {name:'Lounge Lights',serviceId:'switch',type:'switch',room:'Lounge',state:{on:true}},
  {name:'Lounge',serviceId:'sensor',type:'motion-sensor',room:'Lounge',state:{detected:false}},
  {name:'Lounge Keypad',serviceId:'keypad',type:'light',room:'Lounge',state:{brightness:100}}
 ]};
 for(const phrase of ['turn lounge lights green','set lights in the lounge green']){
  const c=voiceCommand(phrase,home);assert.deepEqual(c.paths,['/home/color/120/100/Arch','/home/color/120/100/Bias']);assert.match(c.label,/Green.*2 lights.*1 unsupported skipped/);
 }
 assert.deepEqual(voiceCommand('turn lounge lights off',home).paths,['/home/off/Arch','/home/off/Bias','/home/off/keypad']);
 assert.deepEqual(voiceCommand('turn off the switch lounge lights',home).paths,['/home/off/switch']);
 assert.throws(()=>voiceCommand('set Lounge Lights green',{...home,rooms:[]}),/only available for lights/);
});
