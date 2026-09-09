import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from '../src/server.js';
import { BeeperClient } from '../src/beeper-client.js';

for (const status of [200, 204]) {
  test(`archive and delete accept empty upstream HTTP ${status} responses`, async () => {
    const client = new BeeperClient({baseURL:'http://beeper.invalid',accessToken:'test',
      fetchImpl:async () => new Response(null, {status})});
    client.chatContexts.set('synthetic-chat',{network:'Signal'});
    await withServer(client, async (baseURL) => {
      const headers = {Authorization:'Bearer gateway-secret','Content-Type':'application/json'};
      const archived = await fetch(`${baseURL}/v1/chats/archive`, {
        method:'POST',headers,body:JSON.stringify({chatIDs:['synthetic-chat']})});
      assert.equal(archived.status, 200);
      assert.deepEqual(await archived.json(), {archived:true,count:1});
      const deleted = await fetch(`${baseURL}/v1/chats/synthetic-chat/delete-message`, {
        method:'POST',headers,body:JSON.stringify({messageID:'synthetic-message',forEveryone:false})});
      assert.equal(deleted.status, 200);
      assert.deepEqual(await deleted.json(), {deleted:true,forEveryone:false});
    });
  });
}

async function withServer(client, callback, options = {}) {
  const server = createServer({ beeperClient: client, gatewayToken: 'gateway-secret', ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('read receipts require authentication and an explicit message boundary', async()=>{
  const calls=[];
  const client=new BeeperClient({baseURL:'http://beeper.invalid',accessToken:'test'});
  client.request=async(path,options)=>{calls.push([path,JSON.parse(options.body)]);return {unreadCount:1};};
  await withServer(client,async base=>{
    const path=base+'/v1/chats/chat%2Fone/read';
    assert.equal((await fetch(path,{method:'POST',body:'{}'})).status,401);
    const headers={Authorization:'Bearer gateway-secret','Content-Type':'application/json'};
    assert.equal((await fetch(path,{method:'POST',headers,body:'{}'})).status,400);
    const r=await fetch(path,{method:'POST',headers,body:JSON.stringify({messageID:'seen-message'})});
    assert.equal(r.status,200);assert.deepEqual(await r.json(),{unreadCount:1});
    assert.deepEqual(calls,[['/v1/chats/chat%2Fone/read',{messageID:'seen-message'}]]);
  });
  await assert.rejects(client.markRead('chat',''),/required/);
});

test('message cache separates each phone link-display preference', async () => {
  const modes=[];
  await withServer({listMessages:async (id,limit,cursor,hideLinks) => {
    modes.push(hideLinks);
    if (modes.length > 2) throw new Error('Synthetic upstream offline');
    return {items:[{id:'m',text:hideLinks?'Hello':'Hello Link'}]};
  }}, async baseURL => {
    const headers={Authorization:'Bearer gateway-secret'};
    for (const [query,expected] of [['','Hello Link'],['&hideLinks=1','Hello'],['','Hello Link'],['&hideLinks=1','Hello']]) {
      const response=await fetch(baseURL+'/v1/chats/test/messages?limit=12'+query,{headers});
      assert.equal((await response.json()).items[0].text,expected);
    }
  });
  // Offline fallback must not return a cached result from another preference.
  assert.deepEqual(modes,[false,true,false,true]);
});

test('health is public but chat data requires gateway authentication', async () => {
  await withServer({ listChats: async () => [] }, async (baseURL) => {
    assert.equal((await fetch(`${baseURL}/health`)).status, 200);
    assert.equal((await fetch(`${baseURL}/v1/chats`)).status, 401);
    const authorized = await fetch(`${baseURL}/v1/chats`, {
      headers: { Authorization: 'Bearer gateway-secret' }
    });
    assert.equal(authorized.status, 200);
    assert.deepEqual(await authorized.json(), { items: [] });
  });
});

test('emoji catalog is public while compact watch atlases require authentication', async () => {
  await withServer({ listChats: async () => [] }, async (baseURL) => {
    const catalogResponse = await fetch(`${baseURL}/emoji/catalog.json`);
    assert.equal(catalogResponse.status, 200);
    const catalog = await catalogResponse.json();
    assert.ok(catalog.entries.length >= 3900);

    const imageResponse = await fetch(`${baseURL}/emoji/atlas.png`);
    assert.equal(imageResponse.status, 200);
    assert.equal(imageResponse.headers.get('content-type'), 'image/png');
    assert.ok((await imageResponse.arrayBuffer()).byteLength > 100000);

    const path = `${baseURL}/v1/emoji/atlas`;
    assert.equal((await fetch(path, {method:'POST'})).status, 401);
    const response = await fetch(path, {
      method:'POST',
      headers:{Authorization:'Bearer gateway-secret','Content-Type':'application/json'},
      body:JSON.stringify({keys:['1f602','2764'],size:18,columns:4})
    });
    assert.equal(response.status, 200);
    const atlas = await response.json();
    assert.equal(atlas.width, 72);
    assert.equal(atlas.height, 18);
    assert.deepEqual(atlas.entries.map(entry => entry.key), ['1f602','2764']);
    assert.equal(Buffer.from(atlas.pixels, 'base64').length, 72 * 18);
  });
});

test('configuration page supports editing an existing paired connection', async () => {
  await withServer({ listChats: async () => [] }, async (baseURL) => {
    const html = await (await fetch(`${baseURL}/configure`)).text();
    assert.match(html, /Adjust Beepster without pairing again/);
    assert.match(html, /location\.hash/);
    assert.match(html, /The saved pairing expired/);
    assert.match(html, /requirePairing/);
    assert.match(html, /New custom theme/);
    assert.match(html, /Built-in themes cannot be deleted/);
    assert.match(html, /type="color"/);
    assert.match(html, /Inter/);
    assert.match(html, /Open Sans/);
    assert.match(html, /Montserrat/);
    assert.match(html, /Poppins/);
    assert.match(html, /Font size/);
    for (const size of [14, 18, 22, 26, 30]) {
      assert.match(html, new RegExp(`value="${size}"`));
    }
    assert.match(html, /Add up to eight replies/);
    assert.match(html, /quickReply.*maxLength=240/);
    assert.match(html, /Choose and order 15 bitmap emoji/);
    assert.match(html, /emojiSlots/);
    assert.match(html, /emojiSearch/);
    assert.match(html, /emoji\/catalog\.json/);
    assert.match(html, /emojiReplies:emojiReplies/);
    assert.match(html, /Included services/);
    assert.match(html, /Apple Messages/);
    assert.match(html, /Beeper \/ Matrix/);
    assert.match(html, /Other services/);
    assert.match(html, /services:services/);
    assert.match(html, /Inbox sections/);
    assert.match(html, /Low Priority/);
    assert.match(html, /Archived/);
    assert.match(html, /inboxes:inboxes/);
    assert.match(html, /Show pending agent approvals/);
    assert.match(html, /Approve once and Deny/);
    assert.match(html, /openClawApprovals/);
    assert.match(html, /Link Apple conversations/);
    assert.match(html, /appleCandidates/);
    assert.match(html, /appleAliases:savedAppleAliases/);
    assert.match(html, />Buttons</);
    assert.match(html, /Button controls/);
    assert.match(html, /Top press/);
    assert.match(html, /Middle hold/);
    assert.match(html, /Open selected chat/);
    assert.match(html, /Dictate reply/);
    assert.match(html, /Pin \/ unpin/);
    assert.match(html, /Jump to newest/);
    assert.match(html, /Archive conversation/);
    assert.match(html, /Delete message/);
    assert.match(html, /one text line per button press/);
    assert.match(html, /buttonBindings:buttonBindings/);
    assert.doesNotMatch(html, /scrollLines/);
  });
});

test('authenticated watch deletion routes archive conversations and delete messages with explicit scope', async () => {
  const archived = [];
  const deleted = [];
  const client = {
    archiveChat: async (chatID) => { archived.push(chatID); return {archived:true}; },
    deleteMessage: async (chatID, messageID, forEveryone) => {
      deleted.push({chatID,messageID,forEveryone});
      return {deleted:true,forEveryone};
    }
  };
  await withServer(client, async (baseURL) => {
    const headers = {Authorization:'Bearer gateway-secret','Content-Type':'application/json'};
    const archive = await fetch(`${baseURL}/v1/chats/archive`, {
      method:'POST',headers,body:JSON.stringify({chatIDs:['chat-one','chat-two']})
    });
    assert.equal(archive.status, 200);
    assert.deepEqual(await archive.json(), {archived:true,count:2});
    const deletion = await fetch(`${baseURL}/v1/chats/chat-one/delete-message`, {
      method:'POST',headers,body:JSON.stringify({messageID:'message-one',forEveryone:true})
    });
    assert.equal(deletion.status, 200);
    assert.deepEqual(archived, ['chat-one','chat-two']);
    assert.deepEqual(deleted, [{chatID:'chat-one',messageID:'message-one',forEveryone:true}]);
  });
});

test('watch deletion routes reject missing targets and implicit message scope', async () => {
  await withServer({archiveChat:async () => {},deleteMessage:async () => {}}, async (baseURL) => {
    const headers = {Authorization:'Bearer gateway-secret','Content-Type':'application/json'};
    assert.equal((await fetch(`${baseURL}/v1/chats/archive`, {
      method:'POST',headers,body:'{}'
    })).status, 400);
    assert.equal((await fetch(`${baseURL}/v1/chats/chat-one/delete-message`, {
      method:'POST',headers,body:JSON.stringify({messageID:'message-one'})
    })).status, 400);
  });
});

test('Beeper deletion failures report uncertainty without leaking upstream details', async () => {
  await withServer({deleteMessage:async () => {throw new Error('private chat data');}}, async (baseURL) => {
    const response = await fetch(`${baseURL}/v1/chats/synthetic/delete-message`, {
      method:'POST',headers:{Authorization:'Bearer gateway-secret','Content-Type':'application/json'},
      body:JSON.stringify({messageID:'synthetic',forEveryone:false})});
    assert.equal(response.status,502);
    const body=await response.json();
    assert.equal(body.code,'BEEPER_DELETE_FAILED');
    assert.match(body.error,/Check Beeper before retrying/);
    assert.doesNotMatch(body.error,/private chat/);
  });
});

test('missing cached photos are a clear 404 rather than an upstream 502', async () => {
  await withServer({getAttachmentPreview:async () => {throw Object.assign(new Error('private file path'),{code:'BEEPSTER_MEDIA_MISSING'});}}, async (baseURL) => {
    const response=await fetch(`${baseURL}/v1/attachments/${'a'.repeat(24)}/preview`,{headers:{Authorization:'Bearer gateway-secret'}});
    assert.equal(response.status,404);
    assert.equal((await response.json()).code,'MEDIA_MISSING');
  });
});

test('legacy unscoped approval routes require an update and cannot resolve requests', async () => {
  const decisions = [];
  const openClawClient = {
    status: () => ({state:'paired'}),
    listApprovals: async () => [{id:'approval-1',summary:'exec\n\nUpdate a package',createdAt:123,expiresAt:456}],
    resolveApproval: async (id, decision) => { decisions.push({id,decision}); return {ok:true,decision}; },
    stop: () => {}
  };
  await withServer({listChats:async () => []}, async (baseURL) => {
    const headers = {Authorization:'Bearer gateway-secret'};
    const listed = await fetch(`${baseURL}/v1/openclaw/approvals`, {headers});
    assert.equal(listed.status, 410);
    const rejected = await fetch(`${baseURL}/v1/openclaw/approvals/approval-1/decision`, {
      method:'POST', headers:{...headers,'Content-Type':'application/json'}, body:JSON.stringify({decision:'allow-always'})
    });
    assert.equal(rejected.status, 410);
    const allowed = await fetch(`${baseURL}/v1/openclaw/approvals/approval-1/decision`, {
      method:'POST', headers:{...headers,'Content-Type':'application/json'}, body:JSON.stringify({decision:'allow-once'})
    });
    assert.equal(allowed.status, 410);
    assert.deepEqual(decisions, []);
  }, {openClawClient});
});

test('agent route requires authentication, chat binding and a one-use ticket', async () => {
  const calls = [];
  const hermesClient = {listApprovals:async()=>[{id:'pending',sessionKey:'agent:main:telegram:dm:1',summary:'Test action',expiresAt:0}],
    resolveApproval:async(...args)=>{calls.push(args);return {ok:true};}};
  await withServer({}, async base => {
    const headers={Authorization:'Bearer gateway-secret','Content-Type':'application/json'};
    assert.equal((await fetch(base+'/v1/agents/approvals?chatID=chat')).status,401);
    assert.deepEqual(await (await fetch(base+'/v1/agents/approvals?chatID=other',{headers})).json(),{items:[]});
    const listed=await (await fetch(base+'/v1/agents/approvals?chatID=chat',{headers})).json();
    const route=base+'/v1/agents/approvals/'+listed.items[0].id+'/decision';
    assert.equal((await fetch(route,{method:'POST',headers,body:JSON.stringify({decision:'deny',chatID:'other'})})).status,409);
    assert.equal((await fetch(route,{method:'POST',headers,body:JSON.stringify({decision:'deny',chatID:'chat'})})).status,200);
    assert.equal((await fetch(route,{method:'POST',headers,body:JSON.stringify({decision:'deny',chatID:'chat'})})).status,409);
    assert.deepEqual(calls,[['pending','deny','agent:main:telegram:dm:1']]);
  },{hermesClient,readLinks:async()=>[{provider:'hermes',sessionKey:'agent:main:telegram:dm:1',chatID:'chat',enabled:true}]});
});

test('message history pagination forwards the opaque cursor', async () => {
  let receivedCursor = null;
  const client = {
    listMessages: async (chatID, limit, cursor) => {
      receivedCursor = cursor;
      return {items:[{id:'older-1'}],hasMore:true,nextCursor:'next opaque'};
    }
  };
  await withServer(client, async (baseURL) => {
    const response = await fetch(`${baseURL}/v1/chats/chat-1/messages?limit=12&cursor=current%20opaque`, {
      headers:{Authorization:'Bearer gateway-secret'}
    });
    assert.equal(receivedCursor, 'current opaque');
    assert.deepEqual(await response.json(), {items:[{id:'older-1'}],hasMore:true,nextCursor:'next opaque'});
  });
});

test('chat pagination forwards the selected inbox and opaque cursor', async () => {
  let received = null;
  const client = {
    listChats: async (limit, cursor, inbox) => {
      received = {limit,cursor,inbox};
      return {items:[{id:'older-chat'}],hasMore:true,nextCursor:'next opaque'};
    }
  };
  await withServer(client, async (baseURL) => {
    const response = await fetch(`${baseURL}/v1/chats?limit=30&inbox=archive&cursor=current%20opaque`, {
      headers:{Authorization:'Bearer gateway-secret'}
    });
    assert.deepEqual(received, {limit:30,cursor:'current opaque',inbox:'archive'});
    assert.deepEqual(await response.json(), {items:[{id:'older-chat'}],hasMore:true,nextCursor:'next opaque'});
  });
});

test('pairing requires the exact code and returns only the gateway credential', async () => {
  let rotations = 0;
  const server = createServer({
    beeperClient: {},
    gatewayToken: 'gateway-secret',
    pairingCode: '246810',
    rotatePairingCode: async () => {
      rotations++;
      return '135790';
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const baseURL = `http://127.0.0.1:${server.address().port}`;
    const denied = await fetch(`${baseURL}/pair`, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({code:'bad'})});
    assert.equal(denied.status, 403);
    const paired = await fetch(`${baseURL}/pair`, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({code:'246810'})});
    assert.deepEqual(await paired.json(), { gatewayToken: 'gateway-secret' });
    const reused = await fetch(`${baseURL}/pair`, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({code:'246810'})});
    assert.equal(reused.status, 403);
    const next = await fetch(`${baseURL}/pair`, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({code:'135790'})});
    assert.equal(next.status, 200);
    assert.equal(rotations, 2);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('pairing never releases the gateway credential unless the consumed code is rotated', async () => {
  const server = createServer({
    beeperClient: {},
    gatewayToken: 'gateway-secret',
    pairingCode: '246810',
    rotatePairingCode: async () => ''
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const baseURL = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseURL}/pair`, {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({code:'246810'})
    });
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /gateway-secret/);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('reply requests are idempotent and expose delivery status', async () => {
  let sends = 0;
  let finishSend;
  const client = {
    sendReply: async () => {
      sends++;
      await new Promise((resolve) => { finishSend = resolve; });
      return {pendingMessageID:'pending-1'};
    },
    getMessageStatus: async () => ({id:'message-1',status:'SUCCESS',reason:''})
  };
  await withServer(client, async (baseURL) => {
    const options = {method:'POST',headers:{Authorization:'Bearer gateway-secret','Content-Type':'application/json'},body:JSON.stringify({text:'Yes',requestID:'watch-1'})};
    const firstRequest = fetch(`${baseURL}/v1/chats/chat-1/messages`, options);
    const duplicateRequest = fetch(`${baseURL}/v1/chats/chat-1/messages`, options);
    while (sends === 0) await new Promise((resolve) => setImmediate(resolve));
    finishSend();
    const replies = await Promise.all([firstRequest, duplicateRequest]);
    const bodies = await Promise.all(replies.map((reply) => reply.json()));
    assert.equal(bodies.filter((body) => body.duplicate).length, 1);
    assert.ok(bodies.every((body) => body.state === 'pending' && body.pendingMessageID === 'pending-1'));
    assert.equal(sends, 1);
    const status = await fetch(`${baseURL}/v1/chats/chat-1/messages/pending-1`, {headers:{Authorization:'Bearer gateway-secret'}});
    assert.equal((await status.json()).status, 'SUCCESS');
  });
});

test('reply status reconciles against outgoing history when Beeper loses its pending ID', async () => {
  let reconciled = null;
  const client = {
    sendReply: async () => ({pendingMessageID:'missing-pending-id'}),
    getMessageStatus: async () => { throw new Error('GET failed with HTTP 404'); },
    findSentReply: async (chatID, text, sentAfter) => {
      reconciled = {chatID,text,sentAfter};
      return {id:'outgoing-message',status:'SUCCESS',reason:''};
    }
  };
  await withServer(client, async (baseURL) => {
    const sent = await fetch(`${baseURL}/v1/chats/chat-1/messages`, {
      method:'POST',
      headers:{Authorization:'Bearer gateway-secret','Content-Type':'application/json'},
      body:JSON.stringify({text:'On my way',requestID:'watch-reconcile-1'})
    });
    assert.equal(sent.status, 202);
    const status = await fetch(`${baseURL}/v1/chats/chat-1/messages/missing-pending-id`, {
      headers:{Authorization:'Bearer gateway-secret'}
    });
    assert.deepEqual(await status.json(), {id:'outgoing-message',status:'SUCCESS',reason:''});
    assert.equal(reconciled.chatID, 'chat-1');
    assert.equal(reconciled.text, 'On my way');
    assert.ok(Number.isFinite(reconciled.sentAfter));
  });
});

test('watch replies support an authenticated no-store GET compatibility fallback', async () => {
  const client = {
    sendReply: async (chatID, text) => ({pendingMessageID:`pending-${chatID}-${text.length}`})
  };
  await withServer(client, async (baseURL) => {
    const response = await fetch(`${baseURL}/v1/chats/chat-1/reply`, {
      headers:{
        Authorization:'Bearer gateway-secret',
        'X-Beepster-Reply-Text':encodeURIComponent('Yes 👍'),
        'X-Beepster-Request-ID':'watch-header-1'
      }
    });
    assert.equal(response.status, 202);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), {state:'pending',pendingMessageID:'pending-chat-1-6',chatID:'chat-1'});
  });
});

test('reply requests retry another member of a merged chat when its newest route is stale', async () => {
  const attempts = [];
  const client = {
    sendReply: async (chatID) => {
      attempts.push(chatID);
      if (chatID === 'apple-phone') throw new Error('POST failed with HTTP 500');
      return {pendingMessageID:'pending-email'};
    },
    getMessageStatus: async () => ({id:'sent-email',status:'SUCCESS',reason:''})
  };
  await withServer(client, async (baseURL) => {
    const response = await fetch(`${baseURL}/v1/chats/apple-phone/messages`, {
      method:'POST',
      headers:{Authorization:'Bearer gateway-secret','Content-Type':'application/json'},
      body:JSON.stringify({
        text:'Sounds good!',requestID:'merged-reply-1',fallbackChatIDs:['apple-email']
      })
    });
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), {
      state:'pending',pendingMessageID:'pending-email',chatID:'apple-email'
    });
    assert.deepEqual(attempts, ['apple-phone','apple-email']);
    const status = await fetch(`${baseURL}/v1/chats/apple-email/messages/pending-email`, {
      headers:{Authorization:'Bearer gateway-secret'}
    });
    assert.equal((await status.json()).status, 'SUCCESS');
  });
});

test('attachment previews require authentication and return dimensions without source paths', async () => {
  const client = {
    getAttachmentPreview: async (id) => id === 'aaaaaaaaaaaaaaaaaaaaaaaa' ?
      {width:2,height:1,kind:'image',pixels:Buffer.from([0xc0,0xff])} : null
  };
  await withServer(client, async (baseURL) => {
    const path = `${baseURL}/v1/attachments/aaaaaaaaaaaaaaaaaaaaaaaa/preview`;
    assert.equal((await fetch(path)).status, 401);
    const response = await fetch(path, {headers:{Authorization:'Bearer gateway-secret'}});
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-beepster-width'), '2');
    assert.equal(response.headers.get('x-beepster-kind'), 'image');
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],
      [0x42,0x50,1,2,1,1,0xc0,0xff]);

    const jsonResponse = await fetch(`${path}?format=json`,
      {headers:{Authorization:'Bearer gateway-secret'}});
    assert.deepEqual(await jsonResponse.json(),
      {width:2,height:1,kind:'image',pixels:'wP8='});
  });
});

test('animation frames are opt-in and legacy clients retain the first still frame', async () => {
  const client={getAttachmentPreview:async()=>({width:2,height:1,kind:'gif',frames:2,pixels:Buffer.from([192,255]),framePixels:Buffer.from([192,255,240,192])})};
  await withServer(client,async baseURL=>{
    const path=baseURL+'/v1/attachments/aaaaaaaaaaaaaaaaaaaaaaaa/preview?format=json';
    const options={headers:{Authorization:'Bearer gateway-secret'}};
    const still=await (await fetch(path,options)).json();assert.equal(still.pixels,'wP8=');assert.equal(still.frames,undefined);
    const animated=await (await fetch(path+'&animate=1',options)).json();assert.equal(animated.frames,2);assert.equal(Buffer.from(animated.pixels,'base64').length,4);
  });
});

test('media access denial is actionable and diagnostics never disclose private paths', async()=>{
  const logs=[];
  const client={getAttachmentPreview:async()=>{throw Object.assign(new Error('denied /private/attachment-secret.gif'),{code:'EPERM'});}};
  await withServer(client,async baseURL=>{
    const response=await fetch(baseURL+'/v1/attachments/aaaaaaaaaaaaaaaaaaaaaaaa/preview?format=json', {headers:{Authorization:'Bearer gateway-secret'}});
    assert.equal(response.status,403);const body=await response.json();assert.equal(body.code,'MEDIA_PERMISSION');
    assert.match(body.error,/Connector/);assert.doesNotMatch(JSON.stringify(body),/attachment-secret/);
  },{logger:{error:line=>logs.push(line)}});
  assert.match(logs[0],/code=EPERM denied=true/);assert.doesNotMatch(logs[0],/private|attachment-secret/);
});

test('media access status requires gateway authentication and returns no filesystem data', async()=>{
  let probes=0;
  await withServer({},async baseURL=>{
    assert.equal((await fetch(baseURL+'/v1/media/access')).status,401);assert.equal(probes,0);
    const result=await (await fetch(baseURL+'/v1/media/access',{headers:{Authorization:'Bearer gateway-secret'}})).json();
    assert.deepEqual(result,{supported:true,allowed:false,code:'MEDIA_PERMISSION'});assert.equal(probes,1);
  },{mediaAccessProbe:async()=>{probes++;return {supported:true,allowed:false,code:'MEDIA_PERMISSION'};}});
});
