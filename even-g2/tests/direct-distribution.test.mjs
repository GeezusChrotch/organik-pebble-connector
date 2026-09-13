import test from 'node:test';
import assert from 'node:assert/strict';
import {createBridge} from '../server.mjs';
test('direct build ignores saved HomeKit credentials and never forwards home requests', async () => {
 const requested=[];
 const server=createBridge({clientToken:'test-client',homeToken:'old-home-token',beepsterToken:'test-beeper'}, {fetcher:async url=>{requested.push(url);return {ok:true,json:async()=>({})};}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try {
  const base=`http://127.0.0.1:${server.address().port}`;
  const headers={Authorization:'Bearer test-client'};
  assert.equal((await fetch(base+'/home/status')).status,401);
  for (const route of ['/home/status','/cameras','/home/accessories']) assert.equal((await fetch(base+route,{headers})).status,503);
  const health=await (await fetch(base+'/health',{headers})).json();
  assert.equal(health.home,false);assert.equal(health.beeper,undefined);
  assert.equal(health.beepster,true);
  assert.ok(requested.every(url=>!url.includes(':7855')));
 } finally {await new Promise(r=>server.close(r));}
});
