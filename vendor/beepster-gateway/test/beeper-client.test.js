import test from 'node:test';
import assert from 'node:assert/strict';
import { BeeperClient, resolveChatName } from '../src/beeper-client.js';
import { normalizeEmojiForPebble } from '../src/emoji.js';

test('direct chats prefer a non-self participant full name', () => {
  const chat = {
    type: 'single',
    title: '+15550101002',
    participants: {
      items: [
        { isSelf: true, fullName: 'Me' },
        { isSelf: false, fullName: 'Readable Name', phoneNumber: '+15550101002' }
      ]
    }
  };
  assert.equal(resolveChatName(chat), 'Readable Name');
});

test('contact resolution falls back honestly', () => {
  assert.equal(resolveChatName({ type: 'single', title: 'raw-handle' }), 'raw-handle');
  assert.equal(resolveChatName({ type: 'single' }), 'Unknown contact');
});

test('group thread titles keep real titles and synthesize raw identifier titles from contacts', () => {
  const participants = {total:4,items:[
    {id:'self',isSelf:true},
    {id:'one',phoneNumber:'+15550101001',isSelf:false},
    {id:'two',email:'two@example.com',isSelf:false},
    {id:'three',phoneNumber:'+15550101003',isSelf:false}
  ]};
  assert.equal(resolveChatName({type:'group',title:'Family',participants}), 'Family');
  const localNames = new Map([['5550101001','Alice'],['two@example.com','Bob']]);
  assert.equal(resolveChatName({type:'group',title:'+15550101001, +15550101002',participants}, [], localNames), 'Alice, Bob +1');
});

test('supported emoji survive while unsupported emoji get meaningful fallbacks', () => {
  assert.equal(normalizeEmojiForPebble('Yes 👍❤️😂'), 'Yes 👍❤😂');
  assert.equal(normalizeEmojiForPebble('Thinking 🤔 then launch 🚀'), 'Thinking [thinking] then launch [rocket]');
  assert.equal(normalizeEmojiForPebble('Thanks 👍🏽'), 'Thanks 👍');
  assert.equal(normalizeEmojiForPebble('Family 👨‍👩‍👧 and flag 🇺🇸'), 'Family [emoji] and flag [flag]');
});

test('smart punctuation stays in the selected theme font', () => {
  assert.equal(normalizeEmojiForPebble('“Hello”—it’s fine… • yes'), '"Hello"-it\'s fine... * yes');
});

test('chat and message requests are bounded and normalized', async () => {
  const paths = [];
  const fetchImpl = async (url) => {
    paths.push(new URL(url).pathname + new URL(url).search);
    if (url.includes('/messages')) {
      return new Response(JSON.stringify({ items: [
        { id: 'm2', isSender: true, text: 'Later', timestamp: '2026-09-02T12:02:00Z' },
        { id: 'm1', senderName: 'Readable Name', text: 'Earlier', timestamp: '2026-09-02T12:01:00Z' }
      ] }), { status: 200 });
    }
    return new Response(JSON.stringify({ items: [{
      id: 'chat-1', type: 'single', title: 'raw', network: 'iMessage', unreadCount: 2,
      participants: { items: [{ isSelf: false, fullName: 'Readable Name' }] },
      preview: { text: 'Hello' }
    }] }), { status: 200 });
  };
  const client = new BeeperClient({ baseURL: 'http://127.0.0.1:23373', accessToken: 'secret', fetchImpl });
  const page = await client.listChats(12);
  const chats = page.items;
  const messages = await client.listMessages('chat-1', 12);
  assert.equal(chats[0].name, 'Readable Name');
  assert.equal(messages.items[0].text, 'Earlier');
  assert.equal(messages.items[0].isSelf, false);
  assert.equal(messages.items[1].isSelf, true);
  assert.deepEqual(paths, ['/v1/chats/search?limit=12&type=any&inbox=primary', '/v1/chats/chat-1/messages?limit=12']);
});

test('messages keep their original emoji while exposing bitmap tokens for the watch', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({items:[{
    id:'emoji-message',senderName:'Avery',text:'Nice 😂 👨‍👩‍👧 👍🏽',timestamp:'2026-09-03T18:00:00Z'
  }]}), {status:200});
  const client = new BeeperClient({baseURL:'http://127.0.0.1:23373',accessToken:'secret',fetchImpl});
  const message = (await client.listMessages('emoji-chat', 12)).items[0];
  assert.equal(message.text, 'Nice 😂 👨‍👩‍👧 👍🏽');
  assert.equal(message.watchText,
    'Nice \u001e1f602\u001f \u001e1f468-200d-1f469-200d-1f467\u001f \u001e1f44d-1f3fd\u001f');
  assert.deepEqual(message.emojiKeys,
    ['1f602','1f468-200d-1f469-200d-1f467','1f44d-1f3fd']);
});

test('missing participant names can be filled from the account contact list', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('/contacts/list')) return new Response(JSON.stringify({items:[{id:'person-1',fullName:'Contact Book Name'}]}), {status:200});
    return new Response(JSON.stringify({items:[{id:'chat-1',accountID:'signal',type:'single',title:'raw-handle',participants:{items:[{id:'person-1',isSelf:false}]}}]}), {status:200});
  };
  const client = new BeeperClient({baseURL:'http://127.0.0.1:23373',accessToken:'secret',fetchImpl});
  assert.equal((await client.listChats(12)).items[0].name, 'Contact Book Name');
});

test('older direct chats use exact account contact search beyond the first contact page', async () => {
  const paths = [];
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname + new URL(url).search;
    paths.push(path);
    if (path.includes('/contacts/list')) return new Response(JSON.stringify({items:[{id:'recent-person',fullName:'Recent Person'}],hasMore:true,oldestCursor:'older'}), {status:200});
    if (path.includes('/contacts?query=')) return new Response(JSON.stringify({items:[{id:'older-person',email:'older@example.com',fullName:'Older Contact Name'}]}), {status:200});
    return new Response(JSON.stringify({items:[{
      id:'older-chat',accountID:'signal',type:'single',title:'older@example.com',
      participants:{items:[{id:'older-person',email:'older@example.com',isSelf:false}]}
    }]}), {status:200});
  };
  const contactResolver = {lookupDetails: async () => ({names:new Map(),contactKeys:new Map()})};
  const client = new BeeperClient({baseURL:'http://127.0.0.1:23373',accessToken:'secret',fetchImpl,contactResolver});
  assert.equal((await client.listChats(12)).items[0].name, 'Older Contact Name');
  assert.ok(paths.includes('/v1/accounts/signal/contacts?query=older%40example.com'));
});

test('group threads with raw titles are named from account contacts before reaching the watch', async () => {
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname + new URL(url).search;
    if (path.includes('/contacts/list')) return new Response(JSON.stringify({items:[
      {id:'one',phoneNumber:'+15550101001',fullName:'Alice'},
      {id:'two',phoneNumber:'+15550101002',fullName:'Bob'}
    ]}), {status:200});
    return new Response(JSON.stringify({items:[{
      id:'group-1',accountID:'imessage',network:'iMessage',type:'group',title:'+15550101001, +15550101002',
      participants:{total:3,items:[{id:'self',isSelf:true},{id:'one',phoneNumber:'+15550101001',isSelf:false},{id:'two',phoneNumber:'+15550101002',isSelf:false}]}
    }]}), {status:200});
  };
  const contactResolver = {lookupDetails: async () => ({names:new Map(),contactKeys:new Map()})};
  const client = new BeeperClient({baseURL:'http://127.0.0.1:23373',accessToken:'secret',fetchImpl,contactResolver});
  assert.equal((await client.listChats(12)).items[0].name, 'Alice, Bob');
});

test('direct message sender falls back to the resolved chat contact name', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('/messages')) return new Response(JSON.stringify({items:[{
      id:'message-1',senderID:'person-1',senderName:'+15550101000',text:'Hello'
    }]}), {status:200});
    return new Response(JSON.stringify({items:[{
      id:'chat-1',accountID:'imessage',network:'iMessage',type:'single',title:'+15550101000',
      participants:{items:[{id:'person-1',fullName:'Resolved Person',phoneNumber:'+15550101000',isSelf:false}]}
    }]}), {status:200});
  };
  const contactResolver = {lookupDetails: async () => ({names:new Map(),contactKeys:new Map()})};
  const client = new BeeperClient({baseURL:'http://127.0.0.1:23373',accessToken:'secret',fetchImpl,contactResolver});
  await client.listChats(12);
  assert.equal((await client.listMessages('chat-1', 12)).items[0].sender, 'Resolved Person');
});

test('group message sender resolves through the matching participant', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('/contacts/list')) return new Response(JSON.stringify({items:[]}), {status:200});
    if (url.includes('/messages')) return new Response(JSON.stringify({items:[{
      id:'message-1',senderID:'group-person',senderName:'@raw:example',text:'Hello group'
    }]}), {status:200});
    return new Response(JSON.stringify({items:[{
      id:'group-1',accountID:'matrix',network:'Beeper (Matrix)',type:'group',title:'Family',
      participants:{items:[{id:'group-person',fullName:'Group Person',isSelf:false}]}
    }]}), {status:200});
  };
  const client = new BeeperClient({baseURL:'http://127.0.0.1:23373',accessToken:'secret',fetchImpl});
  await client.listChats(12);
  assert.equal((await client.listMessages('group-1', 12)).items[0].sender, 'Group Person');
});

test('group message senders hydrate full membership and exact contact names when search results are partial', async () => {
  const paths = [];
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname + new URL(url).search;
    paths.push(path);
    if (path === '/v1/chats/group-older/messages?limit=12') return new Response(JSON.stringify({items:[{
      id:'message-1',senderID:'older-person',senderName:'older@example.com',text:'Hello group'
    }]}), {status:200});
    if (path === '/v1/chats/group-older?maxParticipantCount=500') return new Response(JSON.stringify({
      id:'group-older',accountID:'matrix',network:'Beeper (Matrix)',type:'group',title:'Old Group',
      participants:{hasMore:false,items:[{id:'older-person',email:'older@example.com',isSelf:false}]}
    }), {status:200});
    if (path.includes('/contacts/list')) return new Response(JSON.stringify({items:[]}), {status:200});
    if (path.includes('/contacts?query=')) return new Response(JSON.stringify({items:[{
      id:'older-person',email:'older@example.com',fullName:'Hydrated Group Person'
    }]}), {status:200});
    return new Response(JSON.stringify({items:[{
      id:'group-older',accountID:'matrix',network:'Beeper (Matrix)',type:'group',title:'Old Group',
      participants:{hasMore:true,items:[]}
    }]}), {status:200});
  };
  const contactResolver = {lookupDetails: async () => ({names:new Map(),contactKeys:new Map()})};
  const client = new BeeperClient({baseURL:'http://127.0.0.1:23373',accessToken:'secret',fetchImpl,contactResolver});
  await client.listChats(12);
  assert.equal((await client.listMessages('group-older', 12)).items[0].sender, 'Hydrated Group Person');
  assert.ok(paths.includes('/v1/chats/group-older?maxParticipantCount=500'));
  assert.ok(paths.includes('/v1/accounts/matrix/contacts?query=older%40example.com'));
});

test('Apple group message sender can fall back to read-only macOS Contacts', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('/contacts/list')) return new Response(JSON.stringify({items:[]}), {status:200});
    if (url.includes('/messages')) return new Response(JSON.stringify({items:[{
      id:'message-1',senderID:'apple-person',senderName:'person@example.com',text:'Hello group'
    }]}), {status:200});
    return new Response(JSON.stringify({items:[{
      id:'group-1',accountID:'imessage',network:'iMessage',type:'group',title:'Family',
      participants:{items:[{id:'apple-person',email:'person@example.com',isSelf:false}]}
    }]}), {status:200});
  };
  const contactResolver = {lookupDetails: async (identifiers) => {
    assert.deepEqual(identifiers, ['person@example.com']);
    return {names:new Map([['person@example.com','Local Group Person']]),contactKeys:new Map()};
  }};
  const client = new BeeperClient({baseURL:'http://127.0.0.1:23373',accessToken:'secret',fetchImpl,contactResolver});
  await client.listChats(12);
  assert.equal((await client.listMessages('group-1', 12)).items[0].sender, 'Local Group Person');
});

test('a readable message sender supplied by Beeper remains authoritative', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('/messages')) return new Response(JSON.stringify({items:[{
      id:'message-1',senderID:'person-1',senderName:'Beeper Display Name',text:'Hello'
    }]}), {status:200});
    return new Response(JSON.stringify({items:[{
      id:'chat-1',accountID:'signal',network:'Signal',type:'single',title:'Conversation Name',
      participants:{items:[{id:'person-1',fullName:'Participant Name',isSelf:false}]}
    }]}), {status:200});
  };
  const client = new BeeperClient({baseURL:'http://127.0.0.1:23373',accessToken:'secret',fetchImpl});
  await client.listChats(12);
  assert.equal((await client.listMessages('chat-1', 12)).items[0].sender, 'Beeper Display Name');
});

test('raw Apple identifiers can be enriched from read-only macOS Contacts', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('/contacts/list')) return new Response(JSON.stringify({items:[]}), {status:200});
    return new Response(JSON.stringify({items:[{
      id:'chat-apple',accountID:'imessage',network:'iMessage',type:'single',title:'person@example.com',
      participants:{items:[{id:'person-apple',email:'person@example.com',isSelf:false}]}
    }]}), {status:200});
  };
  const contactResolver = {lookup: async (identifiers) => {
    assert.deepEqual(identifiers, ['person@example.com']);
    return new Map([['person@example.com', 'Local Contact Name']]);
  }};
  const client = new BeeperClient({baseURL:'http://127.0.0.1:23373',accessToken:'secret',fetchImpl,contactResolver});
  assert.equal((await client.listChats(12)).items[0].name, 'Local Contact Name');
});

test('separate Apple email and phone threads expose an opaque shared contact group', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('/contacts/list')) return new Response(JSON.stringify({items:[]}), {status:200});
    return new Response(JSON.stringify({items:[
      {id:'chat-email',accountID:'imessage',network:'iMessage',type:'single',title:'person@example.com',participants:{items:[{email:'person@example.com',isSelf:false}]}},
      {id:'chat-phone',accountID:'imessage',network:'iMessage',type:'single',title:'+15550101000',participants:{items:[{phoneNumber:'+15550101000',isSelf:false}]}}
    ]}), {status:200});
  };
  const contactResolver = {lookupDetails: async () => ({
    names:new Map([['person@example.com','Readable Name'],['5550101000','Readable Name']]),
    contactKeys:new Map([['person@example.com','opaque-contact'],['5550101000','opaque-contact']])
  })};
  const client = new BeeperClient({baseURL:'http://127.0.0.1:23373',accessToken:'secret',fetchImpl,contactResolver});
  const chats = (await client.listChats(12)).items;
  assert.deepEqual(chats.map((chat) => [chat.id,chat.name,chat.contactGroup]), [
    ['chat-email','Readable Name (email)','opaque-contact'],['chat-phone','Readable Name (phone)','opaque-contact']
  ]);
});

test('Apple contact identity is resolved even when Beeper already supplies a display name', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('/contacts/list')) return new Response(JSON.stringify({items:[]}), {status:200});
    return new Response(JSON.stringify({items:[{
      id:'chat-apple',accountID:'imessage',network:'iMessage',type:'single',title:'Beeper Name',
      participants:{items:[{email:'person@example.com',fullName:'Beeper Name',isSelf:false}]}
    }]}), {status:200});
  };
  const contactResolver = {lookupDetails: async (identifiers) => {
    assert.deepEqual(identifiers, ['person@example.com']);
    return {names:new Map([['person@example.com','Mac Name']]),
      contactKeys:new Map([['person@example.com','opaque-contact']])};
  }};
  const client = new BeeperClient({baseURL:'http://127.0.0.1:23373',accessToken:'secret',fetchImpl,contactResolver});
  assert.equal((await client.listChats(12)).items[0].contactGroup, 'opaque-contact');
});

test('chat pagination forwards opaque cursors and returns the oldest cursor', async () => {
  const paths = [];
  const fetchImpl = async (url) => {
    paths.push(new URL(url).pathname + new URL(url).search);
    return new Response(JSON.stringify({items:[],hasMore:true,oldestCursor:'opaque next'}), {status:200});
  };
  const client = new BeeperClient({baseURL:'http://127.0.0.1:23373',accessToken:'secret',fetchImpl});
  const page = await client.listChats(12, 'opaque current');
  assert.equal(page.hasMore, true);
  assert.equal(page.nextCursor, 'opaque next');
  assert.equal(paths[0], '/v1/chats/search?limit=12&type=any&inbox=primary&cursor=opaque%20current&direction=before');
});

test('chat pagination can select another Beeper inbox', async () => {
  const paths = [];
  const fetchImpl = async (url) => {
    paths.push(new URL(url).pathname + new URL(url).search);
    return new Response(JSON.stringify({items:[]}), {status:200});
  };
  const client = new BeeperClient({baseURL:'http://127.0.0.1:23373',accessToken:'secret',fetchImpl});
  await client.listChats(12, '', 'low-priority');
  assert.equal(paths[0], '/v1/chats/search?limit=12&type=any&inbox=low-priority');
});

test('message pages retain the full API page while enforcing a watch-safe ceiling', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({items:Array.from({length:80}, (_, index) => ({id:`m${index}`,text:`message ${index}`}))}), {status:200});
  const client = new BeeperClient({baseURL:'http://127.0.0.1:23373',accessToken:'secret',fetchImpl});
  const messages = await client.listMessages('chat-1', 12);
  assert.equal(messages.items.length, 60);
});

test('message pagination advances through older pages with the opaque cursor', async () => {
  const paths = [];
  const fetchImpl = async (url) => {
    paths.push(new URL(url).pathname + new URL(url).search);
    return new Response(JSON.stringify({items:[],hasMore:true,oldestCursor:'older opaque'}), {status:200});
  };
  const client = new BeeperClient({baseURL:'http://127.0.0.1:23373',accessToken:'secret',fetchImpl});
  const page = await client.listMessages('chat-1', 12, 'current opaque');
  assert.equal(page.hasMore, true);
  assert.equal(page.nextCursor, 'older opaque');
  assert.equal(paths[0], '/v1/chats/chat-1/messages?limit=12&cursor=current%20opaque&direction=after');
});

test('a resolved sent message without optional sendStatus is successful', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    id: 'message-final',
    isSender: true,
    text: 'Sent from the watch'
  }), {status:200});
  const client = new BeeperClient({baseURL:'http://127.0.0.1:23373',accessToken:'secret',fetchImpl});
  assert.deepEqual(await client.getMessageStatus('chat-1', 'pending-1'), {
    id:'message-final', status:'SUCCESS', reason:''
  });
});

test('an outgoing message can confirm a send when an iMessage pending ID never resolves', async () => {
  const sentAfter = Date.parse('2026-09-03T03:00:00Z');
  const fetchImpl = async () => new Response(JSON.stringify({items:[
    {id:'incoming-copy',isSender:false,text:'Yes',timestamp:'2026-09-03T03:00:02Z'},
    {id:'outgoing-new',isSender:true,text:'Yes',timestamp:'2026-09-03T03:00:01Z'},
    {id:'outgoing-old',isSender:true,text:'Yes',timestamp:'2026-09-03T02:59:59Z'}
  ]}), {status:200});
  const client = new BeeperClient({baseURL:'http://127.0.0.1:23373',accessToken:'secret',fetchImpl});
  assert.deepEqual(await client.findSentReply('chat-1', 'Yes', sentAfter), {
    id:'outgoing-new',status:'SUCCESS',reason:''
  });
});

test('the default local API address recovers when Beeper selects its next port', async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    requests.push({port:parsed.port,path:parsed.pathname,authorization:options.headers?.Authorization || ''});
    if (parsed.pathname === '/v1/info') {
      if (parsed.port === '23374') {
        return new Response(JSON.stringify({app:{name:'Beeper'},server:{status:'running'}}), {status:200});
      }
      return new Response('', {status:404});
    }
    if (parsed.port === '23373') throw new TypeError('connection refused');
    return new Response(JSON.stringify({items:[]}), {status:200});
  };
  const client = new BeeperClient({baseURL:'http://127.0.0.1:23373',accessToken:'secret',fetchImpl});
  assert.deepEqual((await client.listChats(12)).items, []);
  assert.equal(client.baseURL, 'http://127.0.0.1:23374');
  assert.ok(requests.some((request) => request.port === '23374' && request.path === '/v1/info'));
  assert.ok(requests.some((request) => request.port === '23374' &&
    request.path === '/v1/chats/search' && request.authorization === 'Bearer secret'));
});

test('an explicit custom API address is never silently replaced', async () => {
  const fetchImpl = async () => { throw new TypeError('connection refused'); };
  const client = new BeeperClient({baseURL:'http://127.0.0.1:24444',accessToken:'secret',fetchImpl});
  await assert.rejects(() => client.listChats(12), /connection refused/);
  assert.equal(client.baseURL, 'http://127.0.0.1:24444');
});

test('attachments use opaque IDs and can produce watch-native previews', async () => {
  const paths = [];
  const fetchImpl = async (url) => {
    paths.push(new URL(url).pathname + new URL(url).search);
    if (url.includes('/assets/serve')) return new Response(Buffer.from([1, 2, 3]), {status:200});
    return new Response(JSON.stringify({items:[{
      id:'message-private',text:'A photo',attachments:[{
        id:'attachment-private',type:'img',mimeType:'image/gif',isGif:true,srcURL:'mxc://private/media'
      }]
    }]}), {status:200});
  };
  let convertedInput = null;
  const previewCreator = async (inputPath) => {
    convertedInput = inputPath;
    return {width:2,height:1,pixels:Buffer.from([0xc0,0xff])};
  };
  const client = new BeeperClient({baseURL:'http://127.0.0.1:23373',accessToken:'secret',fetchImpl,previewCreator});
  const messages = await client.listMessages('chat-1', 12);
  assert.equal(messages.items[0].attachment.kind, 'gif');
  assert.doesNotMatch(messages.items[0].attachment.id, /private/);
  const preview = await client.getAttachmentPreview(messages.items[0].attachment.id);
  const cachedPreview = await client.getAttachmentPreview(messages.items[0].attachment.id);
  assert.equal(preview.kind, 'gif');
  assert.deepEqual([...preview.pixels], [0xc0,0xff]);
  assert.equal(cachedPreview, preview);
  assert.equal(paths.filter((path) => path.startsWith('/v1/assets/serve')).length, 1);
  assert.ok(convertedInput);
  assert.match(paths[1], /^\/v1\/assets\/serve\?url=mxc%3A%2F%2Fprivate%2Fmedia$/);
});
test('conversation archiving and message deletion use the documented Desktop API routes', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({url:String(url),method:options.method,body:options.body});
    return new Response(null, {status:204});
  };
  const client = new BeeperClient({baseURL:'http://127.0.0.1:23373',accessToken:'secret',fetchImpl});
  await client.archiveChat('chat/one');
  client.chatContexts.set('chat/one', {network:'Signal'});
  await client.deleteMessage('chat/one', 'message/two', true);
  assert.deepEqual(calls, [
    {url:'http://127.0.0.1:23373/v1/chats/chat%2Fone/archive',method:'POST',body:JSON.stringify({archived:true})},
    {url:'http://127.0.0.1:23373/v1/chats/chat%2Fone/messages/message%2Ftwo?forEveryone=true',method:'DELETE',body:undefined}
  ]);
});

test('delete-for-me stays false under Beeper REST boolean coercion', async () => {
  const scopes = [];
  const client = new BeeperClient({baseURL:'http://127.0.0.1:23373',accessToken:'test',
    fetchImpl:async (url) => {
      const query = new URL(url).searchParams;
      assert.equal(query.has('forEveryone'), true);
      // Mirrors the installed n.coerce.boolean().optional().default(true).
      scopes.push(Boolean(query.get('forEveryone')));
      return new Response(null,{status:204});
    }});
  client.chatContexts.set('synthetic-chat', {network:'Signal'});
  await client.deleteMessage('synthetic-chat','synthetic-message');
  await client.deleteMessage('synthetic-chat','synthetic-message',false);
  await client.deleteMessage('synthetic-chat','synthetic-message',true);
  assert.deepEqual(scopes,[false,false,true]);
});

test('iMessage deletion is blocked for native, cached and freshly resolved IDs without a DELETE', async () => {
  const methods=[];
  const client=new BeeperClient({baseURL:'http://beeper.invalid',accessToken:'test',fetchImpl:async (url,options={})=>{
    methods.push(options.method || 'GET');
    return Response.json({network:'iMessage',accountID:'imessage_synthetic'});
  }});
  client.chatContexts.set('cached',{accountID:'imessage_synthetic'});
  for(const id of ['imsg##synthetic','cached','opaque']) {
    await assert.rejects(client.deleteMessage(id,'synthetic',false),{code:'IMESSAGE_DELETE_DISABLED'});
    await assert.rejects(client.deleteMessage(id,'synthetic',true),{code:'IMESSAGE_DELETE_DISABLED'});
  }
  assert.ok(methods.every(method=>method==='GET'));
});
