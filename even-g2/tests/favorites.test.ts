import test from 'node:test';import assert from 'node:assert/strict';
import {Pome} from '../pome/src/controller';import {loadSettings} from '../pome/src/model';import {SettingsStore} from '../pome/src/storage';
function setup(){const screens:any[]=[];const api={settings:loadSettings('{}'),demo:true};const display={show:(s:any)=>screens.push(s)};const p=new Pome(api as any,display as any);p.snapshot={rooms:[{id:'room:1',name:'Lounge'}],devices:[{serviceId:'lamp',name:'Lamp',type:'light',room:'Lounge',state:{on:true}}],scenes:[{id:'scene',name:'Movie'}],cameras:[{id:'cam',name:'Door',room:'Lounge',age:0,ready:true}]};p.home();return {p,api,screens};}
test('all entity types are pinnable; category and control actions are not',()=>{
 const {p,screens}=setup();assert.equal(screens.at(-1).favorite,undefined);
 for(const key of ['room:room:1','device:lamp','scene:scene','camera:cam'])assert.equal((p as any).entityRow(key).key,key);
 (p as any).rooms();assert.deepEqual(screens.at(-1).favorite,{key:'room:room:1',pinned:false});
});
test('pin persists through native storage and unpin removes the home row without losing other preferences',async()=>{
 const {p,api,screens}=setup();let raw='';const store=new SettingsStore({getLocalStorage:async()=>raw,setLocalStorage:async(_k,v)=>{raw=v;return true;}},{getItem:()=>null,setItem(){}});await store.load();
 api.settings.token='test-token';api.settings.hiddenSections=['sensors'];p.saveSettings=s=>store.save(s);
 await p.setFavorite('device:lamp',true);assert.deepEqual(api.settings.pins,['device:lamp']);assert.equal(screens.at(-1).favorite.pinned,true);
 const reopened=await store.load();assert.deepEqual(reopened.pins,['device:lamp']);assert.equal(reopened.token,'test-token');assert.deepEqual(reopened.hiddenSections,['sensors']);
 await p.setFavorite('device:lamp',true);assert.equal(api.settings.pins.length,1);
 await p.setFavorite('device:lamp',false);assert.deepEqual(api.settings.pins,[]);assert.ok(!screens.at(-1).lines.some((s:string)=>s.includes('* Lamp')));
});
test('save failure leaves favorites unchanged and nested navigation stays in place after success',async()=>{
 const {p,api,screens}=setup();(p as any).rooms();p.saveSettings=async()=>{throw new Error('Save failed');};await p.setFavorite('room:room:1',true);assert.deepEqual(api.settings.pins,[]);assert.equal(screens.at(-1).footer,'Save failed');
 p.saveSettings=async()=>{};await p.setFavorite('room:room:1',true);assert.equal(screens.at(-1).title,'DEMO · Rooms');assert.equal(screens.at(-1).favorite.pinned,true);
});
test('nested menus inherit the selected entity icon instead of their first child icon',()=>{
 const {p,screens}=setup();(p as any).pages=[{title:'Devices',titleIcon:'device',index:0,rows:[{label:'Fan',icon:'fan',run(){}}]}];
 (p as any).push('Bedroom fan',[{label:'Turn on',run(){}}]);assert.equal(screens.at(-1).titleIcon,'fan');
 (p as any).push('Speed',[{label:'25%',run(){}}]);assert.equal(screens.at(-1).titleIcon,'fan');
 (p as any).push('Listening',[],undefined,undefined,'voice');assert.equal(screens.at(-1).titleIcon,'voice');
});
