import test from 'node:test';
import assert from 'node:assert/strict';
import {SettingsStore,settingsKey} from '../pome/src/storage';
import {loadSettings} from '../pome/src/model';
const browser=(initial?:string)=>({getItem:()=>initial??null,setItem:(_k:string,v:string)=>{initial=v;}});
test('pairing and preferences survive a new WebView with empty browser storage',async()=>{
 const data=new Map<string,string>();const native={getLocalStorage:async(k:string)=>data.get(k)||'',setLocalStorage:async(k:string,v:string)=>{data.set(k,v);return true;}};
 const first=new SettingsStore(native,browser());const settings=await first.load();Object.assign(settings,{url:'https://example.test',token:'test-token',pins:['room:one'],roomOrder:['two','one'],sectionOrder:['cameras','favorites','rooms','scenes','devices','sensors','dictation'],hiddenSections:['sensors'],customColor:{h:30,s:80}});await first.save(settings);
 const next=await new SettingsStore(native,browser()).load();assert.deepEqual(next,settings);
});
test('legacy settings migrate, while existing native settings take precedence',async()=>{
 let saved='';const native={getLocalStorage:async()=>saved,setLocalStorage:async(k:string,v:string)=>{assert.equal(k,settingsKey);saved=v;return true;}};
 const original={...loadSettings('{}'),url:'https://example.test',token:'legacy-token'};
 assert.equal((await new SettingsStore(native,browser(JSON.stringify(original))).load()).token,'legacy-token');
 assert.equal((await new SettingsStore(native,browser(JSON.stringify({...original,token:'stale'}))).load()).token,'legacy-token');
});
test('native read/write failures never silently report saved or overwrite unread data',async()=>{
 let writes=0;const store=new SettingsStore({getLocalStorage:async()=>{throw new Error('read failed');},setLocalStorage:async()=>{writes++;return true;}},browser());
 await assert.rejects(store.load());await assert.rejects(store.save(loadSettings('{}')));assert.equal(writes,0);
 const failed=new SettingsStore({getLocalStorage:async()=>'',setLocalStorage:async()=>false},browser());await failed.load();await assert.rejects(failed.save(loadSettings('{}')),/could not save/);
});
