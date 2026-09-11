import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {voiceCommand,type Snapshot} from '../pome/src/model';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const corpus=JSON.parse(fs.readFileSync(path.join(root,'shared/pome-speech-corpus.json'),'utf8'));
const snapshot:Snapshot={rooms:[{id:'lounge',name:'Lounge'}],scenes:[{id:'movie',name:'Movie Time'}],cameras:[],devices:[
 {name:'Desk Lamp 2',room:'Lounge',type:'light',serviceId:'lamp2',state:{on:true,brightness:70,hue:0,saturation:100}},
 {name:'Lounge Arch',room:'Lounge',type:'light',serviceId:'arch',state:{on:true,brightness:70,hue:0,saturation:100}},
 {name:'Lounge Lights',room:'Lounge',type:'switch',serviceId:'switch',state:{on:true}},
 {name:'Lounge Fan',room:'Lounge',type:'fan',serviceId:'fan',state:{on:true,speed:60}},
 {name:'Lounge Blinds',room:'Lounge',type:'blinds',serviceId:'blinds',state:{position:20}},
 {name:'Lounge Temperature',room:'Lounge',type:'temperature-sensor',serviceId:'temp',state:{temperature:22}}
]};
const pebble:any={localStorage:{getItem:()=>null,setItem:()=>{}},Pebble:{addEventListener:()=>{},sendAppMessage:()=>{},openURL:()=>{}},XMLHttpRequest:function(){},setTimeout,clearTimeout,console};
vm.createContext(pebble);vm.runInContext(fs.readFileSync(path.join(root,'../itsyhome-pebble/src/pkjs/index.js'),'utf8'),pebble);
const catalog=pebble.buildVoiceCatalog(snapshot.devices,snapshot.scenes,snapshot.rooms);
for(const [phrase,action,value] of corpus.commands)test('both clients: '+phrase,()=>{
 const g2=voiceCommand(phrase,snapshot),watch=pebble.parseVoiceCommand(phrase,catalog);assert.ok(!watch.error,'Pebble: '+watch.error);
 const p=watch.intent;let pa=p.action,pv=p.value;if(pa==='blind'){pa='position';pv=p.value===0?100:0;}if(pa==='color')pv=p.hue;
 assert.equal(pa,action);if(value!==undefined)assert.equal(pv,value);
 const parts=g2.paths[0]?.split('/')||[];let ga=g2.queryIds?'query':parts[2],gv:any=Number(parts[3]);if(ga==='on'||ga==='off'){gv=ga==='on';ga='power';}
 assert.equal(ga,action);if(value!==undefined)assert.equal(gv,value);
 if(action==='query')assert.equal(g2.paths.length,0);
 if(phrase.includes('desk lamp 2')&&g2.paths.length)assert.ok(g2.paths.every(p=>p.endsWith('/lamp2')));
});
for(const phrase of corpus.reject)test('both clients reject: '+phrase,()=>{
 assert.throws(()=>voiceCommand(phrase,snapshot),'G2 must not partially execute');assert.ok(pebble.parseVoiceCommand(phrase,catalog).error,'Pebble must not partially execute');
});
