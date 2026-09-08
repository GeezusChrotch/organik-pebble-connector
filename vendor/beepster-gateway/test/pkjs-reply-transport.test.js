import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../../src/pkjs/index.js', import.meta.url), 'utf8');

test('media-only messages keep a blank caption instead of a no-text error',()=>{
  const {context,appMessages}=replyRuntime();
  context.queueMessage({id:'gif',text:'',attachment:{id:'asset',kind:'gif'}},0,1);
  context.sendMessageDetail('gif');
  assert.equal(appMessages.find(m=>m[0]==='message')[11],' ');
  assert.equal(appMessages.find(m=>m[0]==='message_detail_chunk')[31],' ');
  assert.ok(!appMessages.some(m=>String(m[31]||'').includes('contains no text')));
});

test('animated previews opt in, carry frame count, reject bad lengths and discard superseded transfers',()=>{
  const {context,requests,appMessages}=replyRuntime();
  context.loadAttachment('gif');const xhr=requests.at(-1);
  assert.match(xhr.url,/animate=1/);
  xhr.status=200;xhr.responseText=JSON.stringify({width:2,height:1,kind:'gif',frames:3,pixels:Buffer.from([192,255,240,192,192,240]).toString('base64')});xhr.onload();
  assert.equal(appMessages.find(m=>m[0]==='media_start')[39],3);
  assert.equal(appMessages.find(m=>m[0]==='media_start')[29],6);
  context.loadAttachment('bad');const bad=requests.at(-1);bad.status=200;bad.responseText=JSON.stringify({width:2,height:1,kind:'gif',frames:7,pixels:'wP8='});bad.onload();
  assert.ok(appMessages.some(m=>m[0]==='media_failed'&&m[23]==='bad'));
  context.loadAttachment('old');const old=requests.at(-1);context.loadAttachment('new');
  const count=appMessages.length;old.status=200;old.responseText=xhr.responseText;old.onload();assert.equal(appMessages.length,count);
});

test('reaction-only changes refresh, use bitmap slots, and stay on the parent message',()=>{
 const {context,appMessages}=replyRuntime();
 const item={id:'parent',sender:'Me',text:'Hello',reactions:[{sender:'Avery',isSelf:false,text:'👍',watchText:'\x1e1f44d\x1f',emojiKeys:['1f44d']}]};
 const before=context.messageSignature([{...item,reactions:[]}]);
 assert.notEqual(context.messageSignature([item]),before);
 context.addChatEmojiKeys([item],true);context.queueMessage(item,0,1);
 const packet=appMessages.find(m=>m[0]==='message');
 assert.equal(packet[30],'parent');assert.equal(packet[38],'Avery\t0\t\x1dA\x1d\n');
 assert.equal(context.watchReactions([]),'');
 const large=context.watchReactions(Array(30).fill(item.reactions[0]));
 assert.ok(context.utf8ByteLength(large)<192);assert.match(large,/more reactions/);
});

test('image preference persists and reaches attachment conversion',()=>{
  const {context,eventListeners,storage,requests}=replyRuntime();
  eventListeners.webviewclosed({response:encodeURIComponent(JSON.stringify({imageMode:'high-contrast'}))});
  assert.equal(storage.get('beepster_image_mode'),'high-contrast');
  context.loadAttachment('photo-id');
  assert.match(requests.at(-1).url,/imageMode=high-contrast$/);
  eventListeners.webviewclosed({response:encodeURIComponent(JSON.stringify({imageMode:'bad'}))});
  assert.equal(storage.get('beepster_image_mode'),'high-contrast');
});

function replyRuntime({ autoAck = true, pageSize = 30 } = {}) {
  const requests = [];
  const timers = [];
  const appMessages = [];
  const eventListeners = {};
  const openedURLs = [];
  const storage = new Map([
    ['beepster_gateway_url', 'https://gateway.example'],
    ['beepster_gateway_token', 'gateway-secret']
  ]);

  class FakeXHR {
    constructor() {
      this.headers = {};
      requests.push(this);
    }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(name, value) { this.headers[name] = value; }
    send(body) { this.body = body; }
  }

  const context = {
    XMLHttpRequest: FakeXHR,
    Pebble: {
      addEventListener(name, callback) { eventListeners[name] = callback; },
      sendAppMessage(message, success) { appMessages.push(message); if (autoAck && success) success(); },
      openURL(url) { openedURLs.push(url); }
    },
    localStorage: {
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, String(value)); }
    },
    console: { log() {} },
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    clearTimeout() {},
    Uint8Array
  };
  vm.runInNewContext(source, context);
  context.CHAT_PAGE_SIZE = pageSize;
  return { context, requests, timers, appMessages, storage, eventListeners, openedURLs };
}

test('paired users open settings directly on their saved private gateway', () => {
  const { eventListeners, openedURLs } = replyRuntime();
  eventListeners.showConfiguration();
  assert.equal(openedURLs.length, 1);
  assert.match(openedURLs[0], /^https:\/\/gateway\.example\/configure#/);
  assert.doesNotMatch(openedURLs[0], /github\.io/);
});

test('hide links persists through settings and applies to history and live-message reads only', () => {
  const {context,eventListeners,storage,requests,openedURLs}=replyRuntime();
  eventListeners.webviewclosed({response:encodeURIComponent(JSON.stringify({hideLinks:true}))});
  assert.equal(storage.get('beepster_hide_links'),'1');
  eventListeners.showConfiguration();
  assert.equal(JSON.parse(decodeURIComponent(openedURLs[0].split('#')[1])).hideLinks,true);
  context.request('/v1/chats/test/messages?limit=12',()=>{});
  assert.match(requests.at(-1).url,/&hideLinks=1$/);
  context.request('/v1/chats/test/messages?limit=12&cursor=older',()=>{});
  assert.match(requests.at(-1).url,/&hideLinks=1$/);
  context.request('/v1/agents/approvals?chatID=test',()=>{});
  assert.doesNotMatch(requests.at(-1).url,/hideLinks/);
  eventListeners.webviewclosed({response:encodeURIComponent(JSON.stringify({hideLinks:false}))});
  context.request('/v1/chats/test/messages?limit=12',()=>{});
  assert.doesNotMatch(requests.at(-1).url,/hideLinks/);
});

test('a personal build migrates a stale saved gateway without losing its credential', () => {
  const { context, eventListeners, storage, requests } = replyRuntime();
  context.DEFAULT_SETTINGS_URL = 'https://gateway.example:8794/configure';
  eventListeners.ready();
  assert.equal(storage.get('beepster_gateway_url'), 'https://gateway.example:8794');
  assert.equal(storage.get('beepster_gateway_token'), 'gateway-secret');
  assert.equal(requests[0].url, 'https://gateway.example:8794/v1/chats?limit=50&inbox=primary');
});

test('watch replies use canonical authenticated JSON POST first', () => {
  const { context, requests } = replyRuntime();
  let response;
  context.sendRequest('/v1/chats/chat-1/messages', {text:'Yes',requestID:'watch-1'}, (value) => { response = value; });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].url, 'https://gateway.example/v1/chats/chat-1/messages');
  assert.equal(requests[0].headers.Authorization, 'Bearer gateway-secret');
  assert.equal(requests[0].headers['Content-Type'], 'application/json');
  assert.equal(requests[0].body, JSON.stringify({text:'Yes',requestID:'watch-1'}));
  requests[0].status = 202;
  requests[0].responseText = JSON.stringify({pendingMessageID:'pending-1'});
  requests[0].onload();
  assert.equal(response.pendingMessageID, 'pending-1');
});

test('bitmap picker emoji remain Unicode through the reply transport', () => {
  const { context, requests } = replyRuntime();
  context.sendReply('chat-1', '😂', 'emoji-1');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].body, JSON.stringify({text:'😂',requestID:'emoji-1'}));
});

test('fifteen configurable emoji replies are sent to the watch and settings', () => {
  const { eventListeners, appMessages, openedURLs, storage } = replyRuntime();
  const chosen = Array.from({length:15}, (_, index) => ({
    key:index === 0 ? '1f680' : '1f602',
    emoji:index === 0 ? '🚀' : '😂',
    label:index === 0 ? 'rocket' : 'face with tears of joy',
    id:index
  }));
  storage.set('beepster_emoji_replies', JSON.stringify(chosen));
  eventListeners.ready();
  const replies = appMessages.filter(message => message[0] === 'emoji_reply');
  assert.equal(replies.length, 15);
  assert.equal(replies[0][32], '🚀');
  assert.equal(replies[0][6], 'rocket');
  assert.equal(appMessages.find(message => message[0] === 'emoji_replies_ready')[4], 15);

  eventListeners.showConfiguration();
  const settings = JSON.parse(decodeURIComponent(openedURLs[0].split('#')[1]));
  assert.deepEqual(settings.emojiReplies.map(entry => entry.emoji), chosen.map(entry => entry.emoji));
});

test('opening emoji replies downloads and transfers only the configured bitmap atlas', () => {
  const { eventListeners, requests, appMessages } = replyRuntime();
  eventListeners.appmessage({payload:{0:'load_emoji_replies'}});
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].url, 'https://gateway.example/v1/emoji/atlas');
  const requested = JSON.parse(requests[0].body);
  assert.equal(requested.keys.length, 15);
  assert.deepEqual({size:requested.size,columns:requested.columns}, {size:26,columns:5});
  requests[0].status = 200;
  requests[0].responseText = JSON.stringify({
    width:100,height:60,pixels:Buffer.alloc(6000, 0xc0).toString('base64'),
    entries:requested.keys.map(key => ({key}))
  });
  requests[0].onload();
  assert.equal(appMessages[0][0], 'emoji_replies_start');
  assert.equal(appMessages[0][25], 100);
  assert.equal(appMessages[0][26], 60);
  assert.equal(appMessages.filter(message => message[0] === 'emoji_replies_chunk').length, 12);
  assert.equal(appMessages.at(-1)[0], 'emoji_replies_end');
});

test('message emoji tokens become compact inline bitmap slots', () => {
  const { context, requests, appMessages } = replyRuntime();
  context.loadMessages('chat-emoji');
  requests[0].status = 200;
  requests[0].responseText = JSON.stringify({items:[{
    id:'emoji-1',sender:'Avery',isSelf:false,text:'Nice 😂 ❤️',
    watchText:'Nice \u001e1f602\u001f \u001e2764\u001f',emojiKeys:['1f602','2764']
  }]});
  requests[0].onload();
  const atlasRequest = requests.find(request => request.url.endsWith('/v1/emoji/atlas'));
  assert.deepEqual(JSON.parse(atlasRequest.body), {keys:['1f602','2764'],size:24,columns:4});
  const message = appMessages.find(packet => packet[0] === 'message');
  assert.equal(message[11], 'Nice \x1dA\x1d \x1dB\x1d');
  assert.equal(message[36], 0);
});

test('message ownership reaches the watch for stable sender colors', () => {
  const { context, requests, appMessages } = replyRuntime();
  context.loadMessages('chat-self-color');
  requests[0].status = 200;
  requests[0].responseText = JSON.stringify({items:[{
    id:'mine-1',sender:'Me',isSelf:true,text:'On my way',watchText:'On my way',emojiKeys:[]
  }]});
  requests[0].onload();
  const message = appMessages.find(packet => packet[0] === 'message');
  assert.equal(message[36], 1);
});

test('older gateways still identify the local sender by the Me label', () => {
  const { context, requests, appMessages } = replyRuntime();
  context.loadMessages('chat-legacy-self-color');
  requests[0].status = 200;
  requests[0].responseText = JSON.stringify({items:[{
    id:'mine-legacy',sender:'Me',text:'Legacy gateway',watchText:'Legacy gateway',emojiKeys:[]
  }]});
  requests[0].onload();
  const message = appMessages.find(packet => packet[0] === 'message');
  assert.equal(message[36], 1);
});

test('configured delete actions archive merged conversations together', () => {
  const { context, eventListeners, requests, appMessages } = replyRuntime();
  context.mergedChats['merged-one'] = {members:['chat-phone','chat-email'],primary:'chat-phone'};
  eventListeners.appmessage({payload:{0:'delete_chat',5:'merged-one'}});
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].url, 'https://gateway.example/v1/chats/archive');
  assert.deepEqual(JSON.parse(requests[0].body), {chatIDs:['chat-phone','chat-email']});
  requests[0].status = 200;
  requests[0].responseText = JSON.stringify({archived:true,count:2});
  requests[0].onload();
  assert.equal(appMessages.find(packet => packet[0] === 'delete_result')[1], 'success');
});

for (const [count, pageStart, archived, expectedStart, expectedIndex] of [
  [70,30,42,30,12], [70,60,69,60,8], [31,30,30,0,29], [1,0,0,0,0]
]) {
  test(`archive keeps position for ${count} chats at page ${pageStart}, row ${archived}`, () => {
    const {context,requests,appMessages}=replyRuntime();
    const chats=Array.from({length:count},(_,i)=>({id:'chat-'+i,name:'Chat '+i,network:'Signal'}));
    context.inboxRawChats=chats.slice();
    context.currentInboxChats=chats.slice();
    context.inboxPageStart=pageStart;
    context.inboxNextCursor='opaque-cursor';
    context.deleteConversation('chat-'+archived);
    requests[0].status=200;
    requests[0].responseText='{"archived":true}';
    requests[0].onload();
    assert.equal(requests.length,1,'must not reload newest conversations');
    assert.equal(context.inboxPageStart,expectedStart);
    assert.equal(context.inboxNextCursor,'opaque-cursor');
    assert.equal(context.currentInboxChats.length,count-1);
    const ready=appMessages.find(p=>p[0]==='chats_ready');
    assert.equal(ready[1],'archive');
    assert.equal(ready[3] || 0,expectedIndex);
  });
}

test('message deletion preserves the selected scope and underlying merged route', () => {
  const { context, eventListeners, requests, appMessages } = replyRuntime();
  context.messageRouteByID['m1-visible'] = {chatID:'chat-email',messageID:'real-message'};
  context.activeMessageChatID = 'merged-one';
  context.messageHistory = [{id:'m1-visible',sender:'Me',text:'remove me'}];
  eventListeners.appmessage({payload:{0:'delete_message',1:'everyone',5:'merged-one',30:'m1-visible'}});
  assert.equal(requests[0].url, 'https://gateway.example/v1/chats/chat-email/delete-message');
  assert.deepEqual(JSON.parse(requests[0].body), {messageID:'real-message',forEveryone:true});
  requests[0].status = 200;
  requests[0].responseText = JSON.stringify({deleted:true});
  requests[0].onload();
  assert.equal(context.messageHistory.length, 0);
  assert.equal(appMessages.find(packet => packet[0] === 'delete_result')[1], 'success');
});

test('delete acknowledgements bypass queued content transfers', () => {
  const {context, appMessages} = replyRuntime({autoAck:false});
  context.enqueue({0:'media_chunk'});
  context.enqueue({0:'message_detail_chunk'});
  context.sendDeleteResult(true);
  assert.equal(appMessages.length, 1);
  assert.equal(context.queue[1].message[0], 'delete_result');
  assert.equal(context.queue[2].message[0], 'message_detail_chunk');
});

test('phone blocks iMessage message deletion without blocking conversation archiving', () => {
  const {context,requests,appMessages}=replyRuntime();
  context.deleteMessage('imsg##synthetic','message',false);
  assert.equal(requests.length,0);
  assert.match(appMessages[0][2],/temporarily disabled/);
  context.deleteConversation('imsg##synthetic');
  assert.equal(requests[0].url,'https://gateway.example/v1/chats/archive');
});

test('delete and media errors display the gateway explanation instead of just HTTP status', () => {
  const {context, requests, appMessages}=replyRuntime();
  context.deleteMessage('chat','message',false);
  requests[0].status=502;
  requests[0].responseText=JSON.stringify({error:'Beeper could not confirm deletion. Check Beeper before retrying.'});
  requests[0].onload();
  assert.match(appMessages.find(p=>p[0]==='delete_result')[2],/Check Beeper/);
  context.loadAttachment('a'.repeat(24));
  requests[1].status=404;
  requests[1].responseText=JSON.stringify({error:'Photo unavailable in Beeper.'});
  requests[1].onload();
  assert.equal(appMessages.find(p=>p[0]==='media_failed')[2],'Photo unavailable in Beeper.');
});

test('deleting a message cancels stale refreshes and preserves remaining history', () => {
  const {context, requests, appMessages} = replyRuntime();
  context.activeMessageChatID = 'chat-one';
  context.messageHistory = [{id:'one',text:'keep'}, {id:'two',text:'remove'}];
  const oldGeneration = context.messageLoadGeneration;
  context.deleteMessage('chat-one', 'two', false);
  context.applyActiveMessageRefresh('chat-one', oldGeneration, [{id:'stale',text:'stale'}], {});
  assert.equal(context.messageHistory.length, 2);
  requests[0].status = 200;
  requests[0].responseText = '{"deleted":true}';
  requests[0].onload();
  assert.deepEqual(Array.from(context.messageHistory, item => item.id), ['one']);
  assert.equal(appMessages.find(packet => packet[0] === 'messages_ready')[4], 1);
});

test('delete completion cannot replace a different open conversation', () => {
  const {context, requests, appMessages} = replyRuntime();
  context.activeMessageChatID = 'old';
  context.deleteMessage('old', 'message', false);
  context.activeMessageChatID = 'new';
  context.messageHistory = [{id:'other',text:'keep'}];
  requests[0].status = 200;
  requests[0].responseText = '{"deleted":true}';
  requests[0].onload();
  assert.equal(context.messageHistory[0].id, 'other');
  assert.equal(appMessages.filter(packet => packet[0] === 'messages_start').length, 0);
});

test('saved emoji order persists and is applied immediately', () => {
  const { eventListeners, appMessages, storage } = replyRuntime();
  const chosen = Array.from({length:15}, (_, index) => ({
    key:index === 0 ? '1f525' : '1f602',emoji:index === 0 ? '🔥' : '😂',label:'choice ' + index,id:index
  }));
  eventListeners.webviewclosed({response:encodeURIComponent(JSON.stringify({emojiReplies:chosen}))});
  assert.deepEqual(JSON.parse(storage.get('beepster_emoji_replies')), chosen);
  assert.equal(appMessages.find(message => message[0] === 'emoji_reply')[32], '🔥');
});

test('full message detail packets stay tagged to their originating message', () => {
  const { context, appMessages } = replyRuntime();
  context.messageTextByID['message-1'] = 'A'.repeat(900) + ' 👍';
  context.sendMessageDetail('message-1');
  assert.equal(appMessages[0][0], 'message_detail_start');
  assert.equal(appMessages[0][30], 'message-1');
  assert.ok(appMessages[0][4] > 900);
  assert.ok(appMessages.slice(1, -1).every((message) =>
    message[0] === 'message_detail_chunk' && message[30] === 'message-1'));
  assert.equal(appMessages.at(-1)[0], 'message_detail_end');
  assert.equal(appMessages.at(-1)[30], 'message-1');
});

test('reply progress bypasses bulk content without losing status order', () => {
  const {context,appMessages}=replyRuntime({autoAck:false});
  context.enqueue({0:'media_chunk'});
  for(let i=0;i<20;i++)context.enqueue({0:'message_detail_chunk'});
  context.sendState('reply_sending');
  context.sendState('reply_pending');
  context.sendState('reply_sent');
  assert.equal(appMessages.length,1);
  assert.equal(context.queue[0].message[0],'media_chunk');
  assert.deepEqual(Array.from(context.queue.slice(1,4),entry=>entry.message[1]),
    ['reply_sending','reply_pending','reply_sent']);
  assert.equal(context.queue[4].message[0],'message_detail_chunk');
});

test('large text uses fewer packets without exceeding the watch inbox', () => {
  const {context,appMessages}=replyRuntime();
  const body='é🚀'.repeat(1000);
  context.messageTextByID['m'.repeat(120)]=body;
  context.sendMessageDetail('m'.repeat(120));
  const chunks=appMessages.filter(packet=>packet[0]==='message_detail_chunk');
  assert.equal(chunks.map(packet=>packet[31]).join(''),body);
  assert.equal(chunks.length,5); // Previously 13 packets at 500 bytes per chunk.
  for(const packet of chunks){
    const bytes=1+Object.entries(packet).reduce((total,[key,value])=>total+7+Buffer.byteLength(String(value),'utf8')+1,0);
    assert.ok(bytes<2048);
    assert.ok(Buffer.byteLength(packet[31],'utf8')<=1400);
  }
});

test('inline photo packets stay tagged to their originating attachment', () => {
  const { context, requests, appMessages } = replyRuntime();
  context.loadAttachment('attachment-1');
  const xhr = requests[0];
  xhr.status = 200;
  xhr.responseText = JSON.stringify({width:2,height:1,kind:'image',pixels:'wP8='});
  xhr.onload();
  assert.deepEqual(appMessages.map((message) => message[0]), ['media_start','media_chunk','media_end']);
  assert.ok(appMessages.every((message) => message[23] === 'attachment-1'));
  assert.deepEqual(Array.from(appMessages[1][28]), [0xc0,0xff]);
});

test('a stalled POST falls back to the same idempotent request over GET', () => {
  const { context, requests, timers } = replyRuntime();
  const responses = [];
  context.sendRequest('/v1/chats/chat-1/messages', {text:'Yes 👍',requestID:'watch-2'}, (value) => responses.push(value));
  timers.find((timer) => timer.delay === 5000).callback();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].method, 'GET');
  assert.equal(requests[1].url, 'https://gateway.example/v1/chats/chat-1/reply');
  assert.equal(requests[1].headers['X-Beepster-Reply-Text'], encodeURIComponent('Yes 👍'));
  assert.equal(requests[1].headers['X-Beepster-Request-ID'], 'watch-2');
  requests[1].status = 202;
  requests[1].responseText = JSON.stringify({pendingMessageID:'pending-2'});
  requests[1].onload();
  requests[0].status = 202;
  requests[0].responseText = JSON.stringify({pendingMessageID:'pending-2'});
  requests[0].onload();
  assert.equal(responses.length, 1);
  assert.equal(responses[0].pendingMessageID, 'pending-2');
});

test('theme data is sent once instead of reloading fonts for every state', () => {
  const { context, appMessages } = replyRuntime();
  context.sendState('loading');
  context.sendState('ready');
  assert.equal(appMessages[0][13], 'classic');
  assert.equal(appMessages[0][22], 5);
  assert.equal(appMessages[0][34], 22);
  assert.equal(appMessages[1][13], undefined);
  assert.equal(appMessages[1][22], undefined);
  assert.equal(appMessages[1][34], undefined);
});

test('button defaults are sent to the watch and included in settings', () => {
  const { eventListeners, appMessages, openedURLs } = replyRuntime();
  eventListeners.ready();
  const bindings = appMessages.filter((message) => message[0] === 'button_binding');
  assert.equal(bindings.length, 14);
  assert.deepEqual(bindings.map((message) => message[1]), [
    'scroll_up','quick_reply','open_chat','dictate','scroll_down','delete',
    'scroll_up','quick_reply','none','dictate','scroll_down','delete','main_top','main_top'
  ]);
  const ready = appMessages.find((message) => message[0] === 'button_bindings_ready');
  assert.equal(ready[3], 1);
  eventListeners.showConfiguration();
  const state = JSON.parse(decodeURIComponent(openedURLs[0].split('#')[1]));
  assert.equal(state.buttonBindings.length, 14);
  assert.equal(state.scrollLines, undefined);
});

test('legacy saved scroll distance is ignored', () => {
  const {eventListeners,appMessages,storage}=replyRuntime();
  storage.set('beepster_scroll_lines','8');
  eventListeners.ready();
  assert.equal(appMessages.find(message=>message[0]==='button_bindings_ready')[3],1);
});

test('unchanged old defaults migrate but custom mappings are preserved', () => {
  const {context, storage} = replyRuntime();
  const old = ['scroll_up','scroll_up','open_chat','pin_toggle','scroll_down','scroll_down',
    'scroll_up','quick_reply','dictate','dictate','scroll_down','jump_newest','none','none'];
  for (const count of [12,14]) {
    storage.set('beepster_button_bindings', JSON.stringify(old.slice(0,count)));
    assert.deepEqual(Array.from(context.configuredButtonBindings()), Array.from(context.DEFAULT_BUTTON_BINDINGS));
  }
  old[1] = 'pin_toggle';
  storage.set('beepster_button_bindings', JSON.stringify(old));
  assert.deepEqual(Array.from(context.configuredButtonBindings()), old);
  old[13] = 'main_top';
  storage.set('beepster_button_bindings', JSON.stringify(old));
  assert.equal(context.configuredButtonBindings()[13], 'main_top');
});

test('custom button mappings persist and are applied immediately', () => {
  const { eventListeners, appMessages, storage } = replyRuntime();
  const custom = Array(12).fill('delete');
  eventListeners.webviewclosed({response:encodeURIComponent(JSON.stringify({buttonBindings:custom,scrollLines:7}))});
  assert.deepEqual(JSON.parse(storage.get('beepster_button_bindings')), custom);
  assert.equal(storage.get('beepster_scroll_lines'), undefined);
  const bindings = appMessages.filter((message) => message[0] === 'button_binding');
  assert.equal(bindings.length, 14);
  assert.ok(bindings.slice(0,12).every((message) => message[1] === 'delete'));
  assert.deepEqual(bindings.slice(12).map(message=>message[1]),['main_top','main_top']);
  assert.equal(appMessages.find((message) => message[0] === 'button_bindings_ready')[3], 1);
});

test('pending OpenClaw approvals load as exact synthetic watch messages', () => {
  const { context, requests, appMessages, storage } = replyRuntime();
  storage.set('beepster_openclaw_approvals', '1');
  context.loadMessages('beepster-openclaw-approvals');
  assert.equal(requests[0].url, 'https://gateway.example/v1/openclaw/approvals');
  requests[0].status = 200;
  requests[0].responseText = JSON.stringify({items:[{id:'approval-exact-1',summary:'exec\n\nUpdate package'}]});
  requests[0].onload();
  const message = appMessages.find(packet => packet[0] === 'message');
  assert.equal(message[30], 'approval-exact-1');
  assert.equal(message[10], 'OpenClaw');
  assert.equal(message[11], 'exec\n\nUpdate package');
  assert.equal(appMessages.filter(packet => packet[0] === 'quick_reply').length, 0);
});

test('pending approvals add scoped cards without guessing from Telegram message text', () => {
  const { context, requests, storage } = replyRuntime();
  storage.set('beepster_openclaw_approvals', '1');
  context.currentInboxChats = [{id:'telegram-agent',network:'Telegram'}];
  const messages = [{id:'telegram-message',sender:'Agent',isSelf:false,
    text:'This action requires approval. Approve or deny?',timestamp:'2026-09-04T19:16:10.000Z'}];
  let result;
  context.decorateOpenClawMessages('telegram-agent', messages, (items) => { result = items; });
  assert.equal(requests[0].url, 'https://gateway.example/v1/agents/approvals?chatID=telegram-agent');
  requests[0].status = 200;
  requests[0].responseText = JSON.stringify({items:[{id:'approval-exact-1',
    summary:'OpenClaw approval\n\nSet config plugins.example.enabled to true',createdAt:Date.parse('2026-09-04T19:16:05.000Z')} ]});
  requests[0].onload();
  assert.equal(result[0].approvalID, undefined);
  assert.equal(result[1].approvalID, 'approval-exact-1');
  assert.equal(result[1].sender, 'OpenClaw approval');
  assert.match(result[1].text, /plugins\.example\.enabled/);
  assert.equal(result[2].text, 'Approve once');
  assert.equal(result[2].approvalAction, 2);
  assert.equal(result[3].text, 'Deny');
  assert.equal(result[3].approvalAction, 3);
  assert.equal(result.length, 4); // No advertised standing permission.
});

test('approval chat opens on the description, not the last action', () => {
  const {context, appMessages} = replyRuntime();
  context.messageHistory = [{id:'normal'}, {id:'request',approvalID:'ticket'},
    {id:'approve',approvalAction:2}, {id:'deny',approvalAction:3}, {id:'always',approvalAction:4}];
  context.finishMessageBatch('initial',4);
  const ready = appMessages.find(item => item[0] === 'messages_ready');
  assert.equal(ready[context.KEY_INDEX],1);
});

test('Hermes slash confirmation reaches the watch with its action flag and scoped route', () => {
  const { context, requests, storage, appMessages } = replyRuntime();
  storage.set('beepster_openclaw_approvals', '1');
  context.currentInboxChats = [{id:'telegram-hermes',network:'Telegram'}];
  context.decorateOpenClawMessages('telegram-hermes', [], (items) => {
    context.queueMessage(items[0], 0, 1);
  });
  requests[0].status = 200;
  requests[0].responseText = JSON.stringify({items:[{
    id:'ticket-reset',provider:'hermes',summary:'Reset conversation. Approve once or Deny.'
  }]});
  requests[0].onload();
  const message = appMessages.find(item => item[0] === 'message');
  assert.ok(message);
  assert.equal(message[37], 1);
  assert.equal(message[30], 'agent-ticket-reset');
  assert.equal(context.messageRouteByID['agent-ticket-reset'].chatID, 'telegram-hermes');
  assert.equal(context.messageRouteByID['agent-ticket-reset'].approvalID, 'ticket-reset');
});

test('watch approval actions resolve only the selected opaque approval id', () => {
  const { context, requests } = replyRuntime();
  context.sendQuickReply('beepster-openclaw-approvals', 0, 'ignored', 'Allow once', 'approval-exact-1');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].url, 'https://gateway.example/v1/agents/approvals/approval-exact-1/decision');
  assert.equal(requests[0].body, JSON.stringify({decision:'allow-once',chatID:'beepster-openclaw-approvals'}));
});

test('expired agent cards never fall back to sending canned chat text', () => {
  const {context, requests} = replyRuntime();
  context.sendQuickReply('telegram-agent',0,'request','Approve','agent-missing');
  assert.equal(requests.length,0);
});

test('approval actions in a Telegram thread resolve the correlated approval instead of sending chat text', () => {
  const { context, requests } = replyRuntime();
  context.messageRouteByID = {'telegram-message':{chatID:'telegram-agent',messageID:'telegram-message',approvalID:'approval-exact-2'}};
  context.sendQuickReply('telegram-agent', 1, 'ignored', 'Deny', 'telegram-message');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://gateway.example/v1/agents/approvals/approval-exact-2/decision');
  assert.equal(requests[0].body, JSON.stringify({decision:'deny',chatID:'telegram-agent'}));
});

test('service aliases normalize to stable filter IDs', () => {
  const { context } = replyRuntime();
  assert.equal(context.serviceID('iMessage'), 'apple_messages');
  assert.equal(context.serviceID('Beeper (Matrix)'), 'beeper');
  assert.equal(context.serviceID('X (Twitter)'), 'x');
  assert.equal(context.serviceID('A future network'), 'other');
});

test('a saved service filter requests a wider page and sends only included chats', () => {
  const { context, requests, appMessages, storage } = replyRuntime();
  storage.set('beepster_services', JSON.stringify(['apple_messages']));
  context.loadChats();
  assert.equal(requests[0].url, 'https://gateway.example/v1/chats?limit=50&inbox=primary');
  requests[0].status = 200;
  requests[0].responseText = JSON.stringify({items:[
    {id:'apple-1',name:'Apple person',preview:'Hello',network:'iMessage'},
    {id:'discord-1',name:'Discord person',preview:'Hi',network:'Discord'}
  ]});
  requests[0].onload();
  const chats = appMessages.filter((message) => message[0] === 'chat');
  assert.equal(chats.length, 1);
  assert.equal(chats[0][5], 'apple-1');
  assert.equal(appMessages.at(-1)[0], 'chats_ready');
  assert.equal(appMessages.at(-1)[4], 1);
});

test('the watch inbox is bounded at thirty conversations', () => {
  const { context, requests, appMessages } = replyRuntime();
  context.loadChats();
  const items = Array.from({length:35}, (_, index) => ({
    id:'chat-' + index,
    name:'Person ' + index,
    preview:'Preview ' + index,
    network:'Signal'
  }));
  requests[0].status = 200;
  requests[0].responseText = JSON.stringify({items});
  requests[0].onload();
  const chats = appMessages.filter((message) => message[0] === 'chat');
  assert.equal(chats.length, 30);
  assert.equal(appMessages.at(-1)[0], 'chats_ready');
  assert.equal(appMessages.at(-1)[4], 30);
});

test('overlapping pages preserve the boundary conversation in both directions',()=>{
  const {context,requests,appMessages}=replyRuntime();
  context.loadChats();requests[0].status=200;
  requests[0].responseText=JSON.stringify({items:Array.from({length:75},(_,i)=>({id:'c'+i,name:'C'+i,network:'Signal'})),hasMore:false});requests[0].onload();
  context.loadOlderChats();assert.equal(context.inboxPageStart,29);
  assert.equal(appMessages.filter(m=>m[0]==='chat').at(-30)[5],'c29');
  assert.equal(appMessages.at(-1)[3],0);
  context.loadOlderChats();assert.equal(context.inboxPageStart,58);
  context.loadNewerChats();assert.equal(context.inboxPageStart,29);
  assert.equal(appMessages.at(-1)[3],29);
  assert.equal(appMessages.filter(m=>m[0]==='chat').at(-1)[5],'c58');
  context.loadNewerChats();assert.equal(context.inboxPageStart,0);
  assert.equal(appMessages.filter(m=>m[0]==='chat').at(-1)[5],'c29');
});

test('production twelve-chat batches reduce packets and retain the shared boundary',()=>{
  assert.match(source,/var CHAT_PAGE_SIZE = 12;/);
  const {context,requests,appMessages}=replyRuntime({pageSize:12});
  context.loadChats();requests[0].status=200;
  requests[0].responseText=JSON.stringify({items:Array.from({length:40},(_,i)=>({id:'c'+i,name:'C'+i,network:'Signal'})),hasMore:false});requests[0].onload();
  assert.equal(appMessages.filter(m=>m[0]==='chat').length,12);
  appMessages.length=0;context.loadOlderChats();
  assert.equal(context.inboxPageStart,11);
  assert.equal(appMessages.filter(m=>m[0]==='chat').length,12);
  assert.equal(appMessages.filter(m=>m[0]==='chat')[0][5],'c11');
  assert.equal(appMessages.filter(m=>['chats_start','chat','chats_ready'].includes(m[0])).length,14);
  context.loadNewerChats();assert.equal(context.inboxPageStart,0);
  assert.equal(appMessages.at(-1)[3],11);
});

test('returning from a message keeps an older inbox page without redrawing its selection',()=>{
  const {context,requests,appMessages,eventListeners,timers}=replyRuntime();
  context.loadChats();requests[0].status=200;
  requests[0].responseText=JSON.stringify({items:Array.from({length:90},(_,i)=>({id:'c'+i,name:'C'+i,network:'Signal'})),hasMore:false});requests[0].onload();
  context.loadOlderChats();context.loadOlderChats();
  assert.equal(context.inboxPageStart,58);
  eventListeners.appmessage({payload:{0:'chat_view_open',5:'c65'}});
  const requestCount=requests.length;
  appMessages.length=0;
  eventListeners.appmessage({payload:{0:'thread_view_open'}});
  assert.equal(context.inboxPageStart,58);
  assert.equal(context.activeMessageChatID,'');
  assert.equal(requests.length,requestCount);
  assert.equal(appMessages.length,0); // No chats_start/reload can move the watch highlight.
  context.loadChats('refresh');
  assert.equal(context.inboxPageStart,58);
  assert.equal(requests.length,requestCount);
  assert.ok(timers.some(timer=>timer.delay===15000));
  eventListeners.appmessage({payload:{0:'load_chats'}});
  assert.equal(context.inboxPageStart,0); // Explicit jump-to-newest still works.
  assert.equal(requests.length,requestCount+1);
});

test('older and newer chat pages keep only a thirty-chat watch window', () => {
  const { context, requests, appMessages } = replyRuntime();
  context.loadChats();
  const items = Array.from({length:35}, (_, index) => ({
    id:'chat-' + index,name:'Person ' + index,preview:'Preview ' + index,network:'Signal'
  }));
  requests[0].status = 200;
  requests[0].responseText = JSON.stringify({items,hasMore:false});
  requests[0].onload();
  assert.equal(appMessages.at(-1)[33], 1);

  appMessages.length = 0;
  context.loadOlderChats();
  let chats = appMessages.filter((message) => message[0] === 'chat');
  assert.deepEqual(chats.map((message) => message[5]), ['chat-29','chat-30','chat-31','chat-32','chat-33','chat-34']);
  assert.equal(appMessages.at(-1)[33], 2);

  appMessages.length = 0;
  context.loadNewerChats();
  chats = appMessages.filter((message) => message[0] === 'chat');
  assert.equal(chats.length, 30);
  assert.equal(chats[0][5], 'chat-0');
  assert.equal(appMessages.at(-1)[33], 1);
});

test('jumping from an older watch page reloads the actual newest Beeper page', () => {
  const { context, requests, appMessages, eventListeners } = replyRuntime();
  context.loadChats();
  const original = Array.from({length:35}, (_, index) => ({
    id:'old-' + index,name:'Old ' + index,preview:'Preview',network:'Signal'
  }));
  requests[0].status = 200;
  requests[0].responseText = JSON.stringify({items:original,hasMore:false});
  requests[0].onload();
  context.loadOlderChats();
  assert.equal(appMessages.filter((message) => message[0] === 'chat')[30][5], 'old-29');

  appMessages.length = 0;
  eventListeners.appmessage({payload:{0:'load_chats'}});
  assert.equal(requests[1].url, 'https://gateway.example/v1/chats?limit=50&inbox=primary');
  requests[1].status = 200;
  requests[1].responseText = JSON.stringify({items:[
    {id:'actual-newest',name:'Newest',preview:'Just now',network:'Signal'},
    ...original.slice(0, 29)
  ],hasMore:true,nextCursor:'older-now'});
  requests[1].onload();

  const reloaded = appMessages.filter((message) => message[0] === 'chat');
  assert.equal(reloaded.length, 30);
  assert.equal(reloaded[0][5], 'actual-newest');
  assert.equal(appMessages.at(-1)[33], 1);
});

test('service filtering fetches additional pages until the watch page is populated', () => {
  const { context, requests, appMessages, storage } = replyRuntime();
  storage.set('beepster_services', JSON.stringify(['instagram']));
  context.loadChats();
  requests[0].status = 200;
  requests[0].responseText = JSON.stringify({
    items:Array.from({length:50}, (_, index) => ({id:'signal-' + index,name:'Signal',network:'Signal'})),
    hasMore:true,nextCursor:'older-page'
  });
  requests[0].onload();
  assert.equal(requests[1].url, 'https://gateway.example/v1/chats?limit=50&inbox=primary&cursor=older-page');
  requests[1].status = 200;
  requests[1].responseText = JSON.stringify({items:[
    {id:'instagram-1',name:'Instagram One',network:'Instagram'},
    {id:'instagram-2',name:'Instagram Two',network:'Instagram'}
  ],hasMore:false});
  requests[1].onload();
  assert.deepEqual(appMessages.filter((message) => message[0] === 'chat').map((message) => message[5]),
    ['instagram-1','instagram-2']);
});

test('paging waits for an in-flight refresh instead of silently dropping the request', () => {
  const {context,requests,appMessages,timers}=replyRuntime();
  context.loadChats();
  context.loadOlderChats();
  const retry=timers.find(timer=>timer.delay===500);
  assert.ok(retry);
  requests[0].status=200;
  requests[0].responseText=JSON.stringify({items:Array.from({length:60},(_,i)=>({id:'chat-'+i,name:'Chat '+i,network:'Signal'})),hasMore:false});
  requests[0].onload();
  retry.callback();
  assert.equal(context.inboxPageStart,29);
  assert.equal(appMessages.at(-1)[0],'chats_ready');
  assert.equal(appMessages.at(-1)[1],'older');
});

test('background refresh does not cancel an in-flight conversation page', () => {
  const {context,requests}=replyRuntime();
  context.inboxPageLoading=true;
  const generation=context.chatLoadGeneration;
  context.loadChats('refresh');
  assert.equal(context.chatLoadGeneration,generation);
  assert.equal(requests.length,0);
});

test('selected inbox sections are appended in configured order', () => {
  const { context, requests, appMessages, storage } = replyRuntime();
  storage.set('beepster_inboxes', JSON.stringify(['primary','archive']));
  context.loadChats();
  assert.equal(requests[0].url, 'https://gateway.example/v1/chats?limit=50&inbox=primary');
  requests[0].status = 200;
  requests[0].responseText = JSON.stringify({items:[{id:'primary-1',name:'Primary',network:'Signal'}],hasMore:false});
  requests[0].onload();
  assert.equal(requests[1].url, 'https://gateway.example/v1/chats?limit=50&inbox=archive');
  requests[1].status = 200;
  requests[1].responseText = JSON.stringify({items:[{id:'archive-1',name:'Archived',network:'Signal'}],hasMore:false});
  requests[1].onload();
  assert.deepEqual(appMessages.filter((message) => message[0] === 'chat').map((message) => message[5]),
    ['primary-1','archive-1']);
});

test('pinned chats are persisted, marked, and ordered before recent chats', () => {
  const { context, requests, appMessages, storage } = replyRuntime();
  storage.set('beepster_pinned_chats', JSON.stringify(['chat-2']));
  context.loadChats();
  requests[0].status = 200;
  requests[0].responseText = JSON.stringify({items:[
    {id:'chat-1',name:'Newest',preview:'One',network:'Signal'},
    {id:'chat-2',name:'Pinned',preview:'Two',network:'Signal'},
    {id:'chat-3',name:'Older',preview:'Three',network:'Signal'}
  ]});
  requests[0].onload();
  const chats = appMessages.filter((message) => message[0] === 'chat');
  assert.deepEqual(chats.map((message) => message[5]), ['chat-2','chat-1','chat-3']);
  assert.deepEqual(chats.map((message) => message[35]), [1,0,0]);

  appMessages.length = 0;
  context.setChatPinned('chat-3', true);
  assert.deepEqual(JSON.parse(storage.get('beepster_pinned_chats')), ['chat-3','chat-2']);
  const reordered = appMessages.filter((message) => message[0] === 'chat');
  assert.deepEqual(reordered.map((message) => message[5]), ['chat-3','chat-2','chat-1']);
  assert.deepEqual(reordered.map((message) => message[35]), [1,1,0]);

  appMessages.length = 0;
  context.setChatPinned('chat-2', false);
  assert.deepEqual(JSON.parse(storage.get('beepster_pinned_chats')), ['chat-3']);
  const unpinned = appMessages.filter((message) => message[0] === 'chat');
  assert.deepEqual(unpinned.map((message) => message[5]), ['chat-3','chat-1','chat-2']);
  assert.deepEqual(unpinned.map((message) => message[35]), [1,0,0]);
});

test('an older pinned chat remains available after the newest page reloads', () => {
  const { context, requests, appMessages, storage } = replyRuntime();
  context.loadChats();
  const items = Array.from({length:35}, (_, index) => ({
    id:'chat-' + index,name:'Person ' + index,preview:'Preview ' + index,network:'Signal'
  }));
  requests[0].status = 200;
  requests[0].responseText = JSON.stringify({items,hasMore:false});
  requests[0].onload();
  context.loadOlderChats();
  context.setChatPinned('chat-34', true);
  assert.equal(JSON.parse(storage.get('beepster_pinned_chat_snapshots'))['chat-34'].name, 'Person 34');

  appMessages.length = 0;
  context.loadChats();
  requests[1].status = 200;
  requests[1].responseText = JSON.stringify({items:items.slice(0,30),hasMore:false});
  requests[1].onload();
  const chats = appMessages.filter((message) => message[0] === 'chat');
  assert.equal(chats[0][5], 'chat-34');
  assert.equal(chats[0][35], 1);
});

test('Apple email and phone destinations with the same alias become one watch thread', () => {
  const { context, requests, appMessages, storage } = replyRuntime();
  storage.set('beepster_apple_aliases', JSON.stringify({
    'apple-email':'Jane',
    'apple-phone':'Jane'
  }));
  context.loadChats('refresh');
  assert.equal(requests[0].url, 'https://gateway.example/v1/chats?limit=50&inbox=primary');
  requests[0].status = 200;
  requests[0].responseText = JSON.stringify({items:[
    {id:'apple-phone',name:'Jane (phone)',preview:'Newest',network:'iMessage',unreadCount:1},
    {id:'apple-email',name:'Jane (email)',preview:'Earlier',network:'iMessage',unreadCount:2},
    {id:'signal-1',name:'Someone else',preview:'Hello',network:'Signal'}
  ]});
  requests[0].onload();

  const chats = appMessages.filter((message) => message[0] === 'chat');
  assert.equal(chats.length, 2);
  assert.match(chats[0][5], /^beepster-merged-/);
  assert.equal(chats[0][6], 'Jane');
  assert.equal(chats[0][7], 'Newest');
  assert.equal(chats[0][8], 3);
  assert.deepEqual(Array.from(context.mergedChats[chats[0][5]].members), ['apple-phone','apple-email']);
  assert.equal(context.mergedChats[chats[0][5]].primary, 'apple-phone');
});

test('Apple destinations matched to the same Mac contact merge automatically', () => {
  const { context, requests, appMessages } = replyRuntime();
  context.loadChats();
  requests[0].status = 200;
  requests[0].responseText = JSON.stringify({items:[
    {id:'apple-phone',name:'Jane (phone)',preview:'Newest',network:'iMessage',unreadCount:1,contactGroup:'opaque-contact'},
    {id:'apple-email',name:'Jane (email)',preview:'Earlier',network:'iMessage',unreadCount:2,contactGroup:'opaque-contact'}
  ]});
  requests[0].onload();

  const chats = appMessages.filter((message) => message[0] === 'chat');
  assert.equal(chats.length, 1);
  assert.match(chats[0][5], /^beepster-merged-/);
  assert.equal(chats[0][6], 'Jane');
  assert.deepEqual(Array.from(context.mergedChats[chats[0][5]].members), ['apple-phone','apple-email']);
  assert.equal(context.mergedChats[chats[0][5]].primary, 'apple-phone');
});

test('same-named Apple contacts with different contact groups stay separate', () => {
  const { context, requests, appMessages } = replyRuntime();
  context.loadChats();
  requests[0].status = 200;
  requests[0].responseText = JSON.stringify({items:[
    {id:'apple-one',name:'Alex',network:'iMessage',contactGroup:'contact-one'},
    {id:'apple-two',name:'Alex',network:'iMessage',contactGroup:'contact-two'}
  ]});
  requests[0].onload();
  assert.equal(appMessages.filter((message) => message[0] === 'chat').length, 2);
});

test('a linked Apple thread combines history and routes replies to its newest destination', () => {
  const { context, requests, appMessages, storage } = replyRuntime();
  storage.set('beepster_apple_aliases', JSON.stringify({'apple-email':'Jane','apple-phone':'Jane'}));
  context.loadChats();
  requests[0].status = 200;
  requests[0].responseText = JSON.stringify({items:[
    {id:'apple-phone',name:'Jane (phone)',network:'iMessage'},
    {id:'apple-email',name:'Jane (email)',network:'iMessage'}
  ]});
  requests[0].onload();
  const virtualID = appMessages.find((message) => message[0] === 'chat')[5];

  context.loadMessages(virtualID);
  assert.match(requests[1].url, /\/v1\/chats\/apple-phone\/messages\?limit=60$/);
  assert.match(requests[2].url, /\/v1\/chats\/apple-email\/messages\?limit=60$/);
  requests[1].status = 200;
  requests[1].responseText = JSON.stringify({items:[{id:'phone-new',text:'new',timestamp:'2026-09-03T17:00:00Z'}]});
  requests[1].onload();
  requests[2].status = 200;
  requests[2].responseText = JSON.stringify({items:[{id:'email-old',text:'old',timestamp:'2026-09-03T16:00:00Z'}]});
  requests[2].onload();
  const messages = appMessages.filter((message) => message[0] === 'message');
  assert.deepEqual(messages.map((message) => message[11]), ['old','new']);

  context.sendReply(virtualID, 'On my way', 'linked-reply');
  assert.equal(requests[3].url, 'https://gateway.example/v1/chats/apple-phone/messages');
  assert.deepEqual(JSON.parse(requests[3].body), {
    text:'On my way',requestID:'linked-reply',fallbackChatIDs:['apple-email']
  });
  requests[3].status = 202;
  requests[3].responseText = JSON.stringify({pendingMessageID:'pending-email',chatID:'apple-email'});
  requests[3].onload();
  assert.equal(context.mergedChats[virtualID].primary, 'apple-email');
  assert.equal(requests[4].url, 'https://gateway.example/v1/chats/apple-email/messages/pending-email');
});

test('a late response from an abandoned chat cannot replace the active thread', () => {
  const { context, requests, appMessages } = replyRuntime();
  context.loadMessages('chat-old');
  context.loadMessages('chat-current');
  requests[0].status = 200;
  requests[0].responseText = JSON.stringify({items:[{id:'old-message',text:'stale'}]});
  requests[0].onload();
  requests[1].status = 200;
  requests[1].responseText = JSON.stringify({items:[{id:'current-message',text:'current'}]});
  requests[1].onload();
  const messagePackets = appMessages.filter((message) => message[0] === 'message');
  assert.deepEqual(messagePackets.map((message) => message[30]), ['current-message']);
});

test('an open chat polls every fifteen seconds and only redraws for changed messages', () => {
  const { context, requests, appMessages, timers } = replyRuntime();
  context.loadMessages('chat-live');
  requests[0].status = 200;
  requests[0].responseText = JSON.stringify({items:[{id:'message-1',text:'First',timestamp:'2026-09-03T20:00:00Z'}]});
  requests[0].onload();
  assert.ok(timers.some(timer => timer.delay === 15000));

  const initialPacketCount = appMessages.length;
  context.refreshActiveMessages();
  requests[1].status = 200;
  requests[1].responseText = requests[0].responseText;
  requests[1].onload();
  assert.equal(appMessages.length, initialPacketCount);

  context.refreshActiveMessages();
  requests[2].status = 200;
  requests[2].responseText = JSON.stringify({items:[
    {id:'message-1',text:'First',timestamp:'2026-09-03T20:00:00Z'},
    {id:'message-2',text:'New reply',timestamp:'2026-09-03T20:00:15Z'}
  ]});
  requests[2].onload();
  assert.equal(appMessages.filter(packet => packet[0] === 'message').at(-1)[30], 'message-2');
  assert.equal(appMessages.at(-1)[0], 'messages_ready');
});

test('active chat polling stops when the watch leaves the chat', () => {
  const { context, eventListeners, requests } = replyRuntime();
  context.loadMessages('chat-live');
  requests[0].status = 200;
  requests[0].responseText = JSON.stringify({items:[{id:'message-1',text:'First'}]});
  requests[0].onload();
  eventListeners.appmessage({payload:{0:'chat_view_closed',5:'chat-live'}});
  context.refreshActiveMessages();
  assert.equal(context.activeMessageChatID, '');
  assert.equal(requests.length, 1);
});

test('a new agent reply is detected even behind twelve unchanged approval rows', () => {
  const {context, requests, appMessages} = replyRuntime();
  const actions = Array.from({length:12}, (_, i) => ({id:'act-' + i, text:'Approval choice'}));
  context.loadMessages('agent-chat');
  requests[0].status = 200;
  requests[0].responseText = JSON.stringify({items:[{id:'first',text:'First reply'}, ...actions]});
  requests[0].onload();
  const before = appMessages.length;
  context.refreshActiveMessages();
  requests[1].status = 200;
  requests[1].responseText = JSON.stringify({items:[{id:'new',text:'New reply'}, ...actions]});
  requests[1].onload();
  assert.ok(appMessages.slice(before).some(packet => packet[0] === 'message' && packet[30] === 'new'));
});

test('returning from replies resumes polling and delivers the next incoming reply', () => {
  const {context, eventListeners, requests, timers, appMessages} = replyRuntime();
  context.loadMessages('hermes-chat');
  requests[0].status = 200;
  requests[0].responseText = JSON.stringify({items:[{id:'initial',text:'Hello'}]});
  requests[0].onload();
  eventListeners.appmessage({payload:{0:'views_closed'}});
  assert.equal(context.messageRefreshTimer, null);
  assert.equal(context.activeMessageChatID, '');
  eventListeners.appmessage({payload:{0:'chat_view_open',5:'hermes-chat'}});
  timers[context.messageRefreshTimer - 1].callback();
  assert.match(requests[1].url, /hermes-chat\/messages/);
  requests[1].status = 200;
  requests[1].responseText = JSON.stringify({items:[{id:'response',text:'Here is my response'}]});
  requests[1].onload();
  assert.ok(appMessages.some(packet => packet[0] === 'message' && packet[30] === 'response'));
  assert.equal(timers[context.messageRefreshTimer - 1].delay, 15000);
});

test('the visible conversation list refreshes every fifteen seconds and pauses when hidden', () => {
  const { context, eventListeners, requests, timers } = replyRuntime();
  context.scheduleRefresh();
  const refresh = timers.find(timer => timer.delay === 15000);
  assert.ok(refresh);
  refresh.callback();
  assert.equal(requests.length, 1);

  eventListeners.appmessage({payload:{0:'thread_view_closed'}});
  const requestCount = requests.length;
  context.scheduleRefresh();
  assert.equal(requests.length, requestCount);
  assert.equal(context.threadViewVisible, false);
  assert.equal(context.refreshTimer, null);
});

test('the former three-minute default migrates to fifteen-second live refresh', () => {
  const { context, storage } = replyRuntime();
  storage.set('beepster_refresh', '180');
  assert.equal(context.liveRefreshSeconds(), 15);
  assert.equal(storage.get('beepster_refresh'), '15');
});

test('an unchanged live conversation refresh sends no watch packets', () => {
  const { context, requests, appMessages } = replyRuntime();
  const response = JSON.stringify({items:[{id:'chat-1',name:'Avery',preview:'Hello',network:'Signal'}]});
  context.loadChats();
  requests[0].status = 200;
  requests[0].responseText = response;
  requests[0].onload();
  const initialPacketCount = appMessages.length;

  context.loadChats('refresh');
  requests[1].status = 200;
  requests[1].responseText = response;
  requests[1].onload();
  assert.equal(appMessages.length, initialPacketCount);

  context.loadChats('refresh');
  requests[2].status = 200;
  requests[2].responseText = JSON.stringify({items:[{id:'chat-1',name:'Avery',preview:'New reply',network:'Signal'}]});
  requests[2].onload();
  assert.equal(appMessages.filter(packet => packet[0] === 'chat').at(-1)[7], 'New reply');
});

test('new message detail discards unsent chunks for the previous selection', () => {
  const { context } = replyRuntime({autoAck:false});
  context.messageTextByID.old = 'A'.repeat(1600);
  context.messageTextByID.current = 'Newest selection';
  context.sendMessageDetail('old');
  context.sendMessageDetail('current');
  assert.equal(context.queue[0].message[30], 'old');
  assert.ok(context.queue.slice(1).every((item) => item.message[30] === 'current'));
  assert.equal(context.queue.at(-1).message[0], 'message_detail_end');
});

test('Double Back custom bindings persist separately for list and chat',()=>{
 const {eventListeners,appMessages,storage}=replyRuntime();const custom=Array(12).fill('scroll_up').concat(['pin_toggle','quick_reply']);
 eventListeners.webviewclosed({response:encodeURIComponent(JSON.stringify({buttonBindings:custom}))});
 assert.deepEqual(JSON.parse(storage.get('beepster_button_bindings')),custom);
 assert.deepEqual(appMessages.filter(m=>m[0]==='button_binding').slice(-2).map(m=>m[1]),['pin_toggle','quick_reply']);
});
