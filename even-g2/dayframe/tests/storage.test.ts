import test from 'node:test';import assert from 'node:assert/strict';import {SettingsStore} from '../src/storage';import {loadSettings} from '../src/model';
test('native settings survive an empty browser; failed reads cannot overwrite saved selection',async()=>{
 let raw=JSON.stringify({...loadSettings('{}'),visible:[],custom:['a'],order:['b','a'],countdown:'both'});let writes=0;
 const native={getLocalStorage:async()=>raw,setLocalStorage:async(_key:string,value:string)=>{writes++;raw=value;return true;}};
 const browser={getItem:()=>null,setItem:()=>{}};
 assert.deepEqual((await new SettingsStore(native,browser).load()).visible,[]);
 const failed=new SettingsStore({...native,getLocalStorage:async()=>{throw Error('Unavailable');}},browser);
 await assert.rejects(failed.load());await assert.rejects(failed.save(loadSettings('{}')));assert.equal(writes,0);
});
