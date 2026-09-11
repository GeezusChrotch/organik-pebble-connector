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
