import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {createBridge} = await import(pathToFileURL(process.env.CONNECTOR_G2_SERVER).href);
test('GitHub edition serves messaging and calendars while rejecting saved HomeKit routes', async t => {
 const calls=[];
 const server=createBridge({clientToken:'client',beepsterToken:'messages',eventzToken:'calendar',homeToken:'old-home'}, {fetcher:async(url,options)=>{
  calls.push({url:String(url),authorization:options.headers.Authorization});
  return Response.json(String(url).includes('calendars')?{calendars:[]}:{items:[]});
 }});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>{server.closeAllConnections();server.close();});
 const base='http://127.0.0.1:'+server.address().port;
 const headers={Authorization:'Bearer client'};
 assert.equal((await fetch(base+'/dayframe/v1/calendars')).status,401);
 assert.equal((await fetch(base+'/dayframe/v1/calendars',{headers})).status,200);
 assert.equal((await fetch(base+'/beepster/v1/chats?limit=1',{headers})).status,200);
 const before=calls.length;
 for(const route of ['/home/status','/camera-settings','/home/input/example']) {
  const result=await fetch(base+route,{headers});assert.equal(result.status,503);
 }
 assert.equal(calls.length,before);
 assert(calls.some(c=>c.authorization==='Bearer calendar'));
 assert(calls.some(c=>c.authorization==='Bearer messages'));
 assert(!calls.some(c=>c.authorization.includes('old-home')));
});
