import test from 'node:test';
import assert from 'node:assert/strict';
import {createBridge, allowedRoute} from '../server.mjs';
test('only home controls and camera reads/capture are exposed',()=>{
 assert(allowedRoute('GET','/home/list/rooms'));assert(allowedRoute('POST','/home/brightness/25/id'));
 for(const path of ['/service/quit','/schedule/id','/home/debug/id','/pair','/home/../service/quit'])assert.equal(allowedRoute('POST',path),false);
 assert.equal(allowedRoute('GET','/home/toggle/id'),false);
});
test('credentials isolated; auth, upstream failure and speech readiness are explicit',async(t)=>{
 const calls=[];const s=createBridge({clientToken:'client',homeToken:'upstream'},{fetcher:async(url,options)=>{calls.push({url,options});return Response.json({backend:'homekit'});}});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>{s.closeAllConnections();s.close();});const root='http://127.0.0.1:'+s.address().port;
 assert.equal((await fetch(root+'/home/list/rooms')).status,401);
 const headers={Authorization:'Bearer client'};
 assert.equal((await fetch(root+'/service/quit',{method:'POST',headers})).status,404);
 const health=await (await fetch(root+'/health',{headers})).json();assert(health.home);assert.equal(health.dictation,false);
 assert.equal(calls[0].options.headers.Authorization,'Bearer upstream');
 assert.equal((await fetch(root+'/speech',{method:'POST',headers})).status,503);
});
test('speech uses Mac provider, never returns its credential',async(t)=>{
 const s=createBridge({clientToken:'client',homeToken:'upstream',speechBaseURL:'https://speech.example/v1',speechToken:'provider-secret',speechModel:'test'},{fetcher:async(url,options)=>{assert.equal(String(url),'https://speech.example/v1/audio/transcriptions');assert.equal(options.headers.Authorization,'Bearer provider-secret');return Response.json({text:'Turn desk on'});}});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>{s.closeAllConnections();s.close();});const audio=Buffer.alloc(48);audio.write('RIFF');audio.write('WAVE',8);
 const r=await fetch('http://127.0.0.1:'+s.address().port+'/speech',{method:'POST',headers:{Authorization:'Bearer client'},body:audio});assert.deepEqual(await r.json(),{text:'Turn desk on'});
});

test('G2 selector POST reaches HomeKit with its input ID and upstream credentials',async(t)=>{
 const calls=[];const s=createBridge({clientToken:'client',homeToken:'home-secret'},{fetcher:async(url,options)=>{calls.push({url,options});return Response.json({status:'success'});}});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>{s.closeAllConnections();s.close();});
 const url='http://127.0.0.1:'+s.address().port+'/home/input/7/selector-id';
 assert.equal((await fetch(url,{method:'POST'})).status,401);assert.equal(calls.length,0);
 assert.equal((await fetch(url,{headers:{Authorization:'Bearer client'}})).status,404);assert.equal(calls.length,0);
 const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer client'}});assert.equal(r.status,200);assert.deepEqual(await r.json(),{status:'success'});
 assert.equal(calls.length,1);assert.equal(calls[0].url,'http://127.0.0.1:7855/home/input/7/selector-id');assert.equal(calls[0].options.method,'POST');assert.equal(calls[0].options.headers.Authorization,'Bearer home-secret');
});
