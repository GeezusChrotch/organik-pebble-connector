import test from 'node:test';import assert from 'node:assert/strict';import {createBridge} from '../server.mjs';
test('DayFrame-only bridge authenticates and exposes bounded calendar reads, never writes or pairing',async t=>{
 const calls=[];const s=createBridge({clientToken:'client',eventzToken:'calendar-secret'},{fetcher:async(url,options)=>{calls.push({url,options});return Response.json({events:[]});}});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>{s.closeAllConnections();s.close();});const base='http://127.0.0.1:'+s.address().port,headers={Authorization:'Bearer client'};
 assert.equal((await fetch(base+'/dayframe/v1/calendars')).status,401);assert.equal(calls.length,0);
 for(const path of ['/dayframe/pair','/dayframe/v1/shutdown'])assert.equal((await fetch(base+path,{headers})).status,404);
 assert.equal((await fetch(base+'/dayframe/v1/events',{method:'POST',headers})).status,404);
 for(const q of ['','?start=1&end=99999999','?start=NaN&end=3','?start=3&end=1'])assert.equal((await fetch(base+'/dayframe/v1/events'+q,{headers})).status,400);
 assert.equal(calls.length,0);
 const r=await fetch(base+'/dayframe/v1/events?start=1&end=86401&token=untrusted',{headers});assert.equal(r.status,200);
 assert.equal(calls[0].url,'http://127.0.0.1:7848/v1/events?start=1&end=86401');assert.equal(calls[0].options.headers.Authorization,'Bearer calendar-secret');assert.equal(calls[0].options.redirect,'error');assert.deepEqual(await r.json(),{events:[]});
});
test('missing calendar setup and revoked permissions give actionable errors',async t=>{
 for(const enabled of [false,true]){
  const s=createBridge({clientToken:'client',homeToken:'home',...(enabled?{eventzToken:'calendar-secret'}:{})},{fetcher:async()=>Response.json({error:'internal details'},{status:503})});
  await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>{s.closeAllConnections();s.close();});
  const r=await fetch('http://127.0.0.1:'+s.address().port+'/dayframe/v1/calendars',{headers:{Authorization:'Bearer client'}});assert.equal(r.status,503);assert(!(await r.text()).includes('internal details'));
 }
});
