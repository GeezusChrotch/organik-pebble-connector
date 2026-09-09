import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHermesApprovalClient} from '../src/hermes-client.js';

test('Hermes HTTP transport authenticates and retains exact session/decision and prompt contract', async () => {
  const bodies = [];
  const server = http.createServer(async (req,res) => {
    assert.equal(req.headers.authorization, 'Bearer '+'a'.repeat(64));
    assert.equal(req.url,'/v1/beepster');
    let raw='';for await (const chunk of req) raw+=chunk;
    bodies.push(JSON.parse(raw));
    res.end(JSON.stringify({protocol:1,ok:true,items:[]}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const client = createHermesApprovalClient({bridgeURL:`http://127.0.0.1:${server.address().port}/v1/beepster`,bridgeToken:'a'.repeat(64)});
    await client.listSessions();await client.listApprovals();
    await client.resolveApproval('exact','deny','agent:telegram:123');
    await client.syncPrompts([]);
    assert.deepEqual(bodies,[{method:'sessions'},{method:'list'},{method:'resolve',id:'exact',decision:'deny',sessionKey:'agent:telegram:123'},{method:'prompts.sync',prompts:[]}]);
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('Hermes HTTP rejects unsafe endpoints, missing token and invalid responses without socket fallback', async () => {
  for (const url of ['http://evil.test/v1/beepster','https://127.0.0.1/v1/beepster','http://user@127.0.0.1/v1/beepster','http://127.0.0.1/wrong']) {
    await assert.rejects(createHermesApprovalClient({bridgeURL:url,bridgeToken:'a'.repeat(64),fetchImpl:()=>{throw new Error('must not fetch');}}).listApprovals(),/Configure/);
  }
  const options = {bridgeURL:'http://127.0.0.1:12345/v1/beepster',bridgeToken:'a'.repeat(64)};
  for(const response of [new Response('no',{status:401}),new Response('invalid'),new Response('x'.repeat(128001)),new Response('{"protocol":1,"ok":false}')]) {
    await assert.rejects(createHermesApprovalClient({...options,fetchImpl:async (_url, init)=>{
      assert.equal(init.redirect,'error');assert.ok(init.signal);return response;
    }}).listApprovals());
  }
  await assert.rejects(createHermesApprovalClient({...options,bridgeToken:''}).listApprovals(),/Configure/);
});
