import test from 'node:test';import assert from 'node:assert/strict';
import {loadSettings,pairing,wrap,defaults,messageLabel,messageLines} from '../src/model';import {SettingsStore,settingsKey} from '../src/storage';import {mediaFrames} from '../src/media';import {pcmToWav} from '../src/audio';import {Beepster} from '../src/controller';import {API} from '../src/api';import type {Display,Screen} from '../src/display';
const chat={id:'chat',name:'Alex',network:'test',unreadCount:1,preview:'',timestamp:''};
function fixture(){const screens:Screen[]=[],records:boolean[]=[],writes:unknown[]=[];const display={show:(s:Screen)=>screens.push(s),record:async(v:boolean)=>{records.push(v);},exit:async()=>{}} as unknown as Display;const api=new API(loadSettings('{"refresh":0}'),true);const original=api.request.bind(api);api.request=async(path,method='GET',body?)=>{if(method==='POST')writes.push({path,body});return original(path,method,body);};const app=new Beepster(api,display);app.saveSettings=async()=>{};return {app,api,display,screens,records,writes};}
test('settings reject malformed content, normalize bounds and preserve empty reply lists',()=>{assert.throws(()=>loadSettings('null'));const s=loadSettings('{"refresh":999,"quickReplies":[],"markRead":true}');assert.equal(s.refresh,15);assert.deepEqual(s.quickReplies,[]);assert.equal(s.markRead,true);});
test('pairing requires HTTPS origin without credentials or query',()=>{assert.equal(pairing('{"url":"https://example.test","token":"secret"}').url,'https://example.test');for(const url of ['http://example.test','https://user:pass@example.test','https://example.test/path','https://example.test?token=x'])assert.throws(()=>pairing(JSON.stringify({url,token:'s'})));});
test('native storage persists across fresh WebViews and does not write after failed read',async()=>{let value='';let writes=0;const native={getLocalStorage:async()=>value,setLocalStorage:async(k:string,v:string)=>{assert.equal(k,settingsKey);value=v;writes++;return true;}};const browser={getItem:()=>null,setItem:()=>{}};const store=new SettingsStore(native,browser);await store.load();await store.save({...defaults,token:'preserved',quickReplies:['custom']});const fresh=new SettingsStore(native,browser);assert.equal((await fresh.load()).token,'preserved');const broken=new SettingsStore({...native,getLocalStorage:async()=>{throw Error('unavailable');}},browser);await assert.rejects(broken.load());await assert.rejects(broken.save(defaults));assert.equal(writes,1);});
test('unbroken message text wraps without losing characters',()=>{const text='abcdefghij'.repeat(60);const lines=wrap(text,420);assert.ok(lines.length>5);assert.equal(lines.join(''),text);});
test('GIF frame decoding is bounded and malformed payload rejected',()=>{const pixels=Buffer.from([0xc0,0xff,0xff,0xc0]).toString('base64');const frames=mediaFrames({width:2,height:1,frames:2,pixels,kind:'gif'});assert.equal(frames.length,2);assert.notDeepEqual(frames[0],frames[1]);assert.throws(()=>mediaFrames({width:2,height:1,frames:3,pixels,kind:'gif'}));assert.throws(()=>mediaFrames({width:2000,height:1,frames:1,pixels,kind:'image'}));});
test('PCM produces a valid 16k mono WAV and rejects odd bytes',()=>{const wav=pcmToWav([new Uint8Array(32000)]),v=new DataView(wav.buffer);assert.equal(v.getUint32(24,true),16000);assert.equal(v.getUint32(40,true),32000);assert.throws(()=>pcmToWav([new Uint8Array(1)]));});
test('opening a chat and quick reply cannot send; explicit confirmation sends once',async()=>{const f=fixture();await f.app.start();await f.app.openChat(chat);f.app.replies();await f.app.input(0);assert.equal(f.app.page?.kind,'draft');assert.equal(f.writes.length,0);await f.app.input(0);assert.equal(f.app.page?.kind,'send');assert.equal(f.writes.length,0);await f.app.input(0);await f.app.send();assert.equal(f.writes.length,1);assert.equal(f.app.notice,'Sent');f.app.dispose();});
test('discarding a reply does not send',async()=>{const f=fixture();await f.app.start();await f.app.openChat(chat);f.app.review(chat,'hello');await f.app.input(0);await f.app.input(2);await f.app.input(2);await f.app.input(0);assert.equal(f.writes.length,0);assert.equal(f.app.page?.kind,'chat');f.app.dispose();});
test('failed send is not automatically retried and reports uncertainty',async()=>{const f=fixture();await f.app.start();await f.app.openChat(chat);f.app.review(chat,'hello');f.api.request=async()=>{f.writes.push(1);throw Error('Network timeout');};await f.app.send();await f.app.send();assert.equal(f.writes.length,1);assert.match(f.app.notice,/uncertain/);f.app.dispose();});
test('dictation transcript opens review, never sends text automatically',async()=>{const f=fixture();await f.app.start();await f.app.openChat(chat);await f.app.beginRecording();assert.equal(f.app.recording,true);await f.app.finishRecording();assert.equal(f.app.page?.kind,'draft');assert.equal(f.writes.length,1);assert.match((f.writes[0] as {path:string}).path,/speech/);assert.deepEqual(f.records,[true,false]);f.app.dispose();});
test('lifecycle exit stops and discards recording',async()=>{const f=fixture();await f.app.start();await f.app.openChat(chat);await f.app.beginRecording();await f.app.input(6);assert.equal(f.app.recording,false);assert.equal(f.app.page?.kind,'chat');assert.equal(f.writes.length,0);assert.deepEqual(f.records,[true,false]);f.app.dispose();});
test('back ignores a late conversation response',async()=>{const f=fixture();await f.app.start();let resolve!:(v:any)=>void;f.api.messages=()=>new Promise(r=>{resolve=r;});const pending=f.app.openChat(chat);await f.app.input(3);resolve({items:[]});await pending;assert.equal(f.app.page?.kind,'inbox');f.app.dispose();});
test('phone settings save before applying and return directly to inbox',async()=>{const f=fixture();await f.app.start();let saved:unknown;f.app.saveSettings=async s=>{saved=s;};await f.app.applySettings({...f.api.settings,showSender:false});assert.equal(f.api.settings.showSender,false);assert.equal((saved as typeof defaults).showSender,false);assert.equal(f.app.page?.kind,'inbox');assert.equal(f.app.pages.length,1);assert.ok(!f.app.page?.rows.some(r=>/Settings|Archive|Low priority/.test(r.label)));f.app.dispose();});

test('merged history reads member threads, paginates each and keeps equal IDs from different services',async()=>{
 const api=new API({...defaults});const merged={...chat,merge:{chatIDs:['apple','social'],defaultChatID:'apple',members:[{id:'apple',network:'iMessage'},{id:'social',network:'Instagram'}]}};const calls:string[]=[];
 api.messages=async(id,cursor='')=>{calls.push(id+':'+cursor);return {items:[{id:'same',sender:'Alex',text:id,time:'',timestamp:id==='apple'?'2026-09-11T12:00:00Z':'2026-09-10T12:00:00Z'}],hasMore:id==='apple'&&!cursor,nextCursor:id==='apple'&&!cursor?'older':null};};
 const first=await api.conversation(merged);assert.deepEqual(first.items.map(m=>m.sourceChatID),['social','apple']);assert.equal(first.hasMore,true);
 await api.conversation(merged,first.nextCursor!);assert.deepEqual(calls,['apple:','social:','apple:older']);assert.equal(api.replyChatID(merged),'apple');
 assert.throws(()=>api.replyChatID({...merged,merge:{...merged.merge,defaultChatID:null}}),/default reply/);
});
test('merged chat sends only after confirmation to Beeper default member and reads receipt on source',async()=>{
 const f=fixture();const merged={...chat,merge:{chatIDs:['apple','social'],defaultChatID:'apple',members:[{id:'apple',network:'iMessage'},{id:'social',network:'Instagram'}]}};
 f.api.messages=async(id)=>({items:[{id:'msg',sender:'Alex',text:'hello',time:'',timestamp:'2026-09-11T12:00:00Z'}],hasMore:false});
 f.api.settings.markRead=true;await f.app.start();await f.app.openChat(merged);assert.equal(f.writes.filter((w:any)=>w.path.endsWith('/messages')).length,0);assert.equal(f.writes.length,2);
 await f.app.input(2);await f.app.input(2);await f.app.input(2);await f.app.input(0);
 assert.match((f.writes[0] as {path:string}).path,/\/(apple|social)\/read$/);
 f.app.review(merged,'test');await f.app.send();assert.match((f.writes.find((w:any)=>w.path.endsWith('/messages')) as {path:string}).path,/\/apple\/messages$/);f.app.dispose();
});

test('photo messages are labeled and open directly; back retains caption and conversation',async()=>{
 const f=fixture();await f.app.start();await f.app.openChat(chat);const photo={id:'photo',sender:'Alex',text:'A caption',time:'',attachment:{id:'a'.repeat(24),kind:'image'}};
 await f.app.openMessage(chat,photo);assert.equal(f.app.page?.kind,'media');assert.ok(f.app.page?.frames?.[0].length);f.app.back();assert.equal(f.app.page?.kind,'message');assert.ok(f.app.page?.lines?.some(l=>l.endsWith('A caption')));f.app.back();assert.equal(f.app.page?.kind,'chat');assert.equal(f.writes.length,0);f.app.dispose();
});
test('multiple attachments each have a selectable preview and images-off retains text',async()=>{
 const f=fixture();await f.app.start();const m={id:'album',sender:'Alex',text:'Two photos',time:'',attachments:[{id:'a'.repeat(24),kind:'image'},{id:'b'.repeat(24),kind:'gif'}]};
 await f.app.openMessage(chat,m);assert.equal(f.app.page?.kind,'options');assert.deepEqual(f.app.page?.rows.slice(0,2).map(r=>r.label),['View Photo 1','View GIF 2']);await f.app.input(2);await f.app.input(0);assert.equal(f.app.page?.kind,'media');assert.equal(f.app.page?.frames?.length,4);f.app.back();f.app.back();f.api.settings.images=false;await f.app.openMessage(chat,m);assert.equal(f.app.page?.kind,'message');f.app.dispose();
});

test('gateway reaction text and standalone thumbs-up are visible on G2',()=>{
 const m={id:'reaction',sender:'Me',text:'See you soon',time:'',reactions:[{sender:'Alex',text:'👍'}]};assert.match(messageLabel(m),/^\[Thumbs up\]/);assert.ok(messageLines(m,defaults).includes('Alex: Thumbs up'));assert.match(messageLabel({...m,text:'👍',reactions:[]}),/Thumbs up/);
});
test('startup is the inbox even when older settings contain extra inboxes',async()=>{const f=fixture();f.api.settings=loadSettings('{"inboxes":["archive","low-priority"],"refresh":0}');await f.app.start();assert.equal(f.app.page?.kind,'inbox');assert.equal(f.app.pages.length,1);assert.deepEqual(f.api.settings.inboxes,['primary']);f.app.dispose();});
test('poll updates reactions while reading, preserves reading position and never sends',async()=>{
 const f=fixture();await f.app.start();const m={id:'live',sender:'Alex',text:'A long message. '.repeat(50),time:'',timestamp:'2026-09-11T12:00:00Z'};
 f.api.messages=async()=>({items:[m]});await f.app.openChat(chat);await f.app.openMessage(chat,m);f.app.page!.offset=5;
 f.api.messages=async()=>({items:[{...m,reactions:[{sender:'Alex',text:'👍'}]},{...m,id:'new',timestamp:'2026-09-11T12:01:00Z',text:'new'}]});
 await f.app.poll();assert.equal(f.app.page?.kind,'message');assert.equal(f.app.page?.offset,5);assert.ok(f.app.page?.lines?.includes('Alex: Thumbs up'));assert.equal(f.app.pages.find(p=>p.kind==='chat')?.messages?.length,2);assert.equal(f.writes.length,0);f.app.dispose();
});
test('poll keeps older history, paging cursor, and selected message while adding new items',async()=>{
 const f=fixture();await f.app.start();const m={id:'old',sender:'Alex',text:'old',time:'',timestamp:'2026-09-10T12:00:00Z'};f.api.messages=async()=>({items:[m],hasMore:true,nextCursor:'old-cursor'});await f.app.openChat(chat);f.app.page!.paged=true;f.app.page!.index=0;
 f.api.messages=async()=>({items:[{...m,id:'new',text:'new',timestamp:'2026-09-11T12:00:00Z'}],hasMore:true,nextCursor:'new-cursor'});await f.app.poll();assert.equal(f.app.page?.cursor,'old-cursor');assert.equal(f.app.page?.messages?.length,2);assert.equal(f.app.page?.rows[f.app.page.index].label,'Alex: old');f.app.dispose();
});
test('poll stays read-only and pauses during reply review and app exit',async()=>{
 const f=fixture();await f.app.start();await f.app.openChat(chat);let requests=0;f.api.conversation=async()=>{requests++;return {items:[]};};f.app.review(chat,'👍');await f.app.poll();assert.equal(requests,0);f.app.back();await f.app.input(6);await f.app.poll();assert.equal(requests,0);await f.app.input(5);assert.equal(requests,1);assert.equal(f.writes.length,0);f.app.dispose();
});
test('outgoing thumbs-up quick reply routes the exact emoji after explicit confirmation',async()=>{
 const f=fixture();await f.app.start();await f.app.openChat(chat);f.api.settings.quickReplies=[];f.api.settings.emojiReplies=['👍'];f.app.replies();await f.app.input(0);assert.equal(f.writes.length,0);await f.app.input(0);assert.equal(f.writes.length,0);await f.app.input(0);assert.equal((f.writes[0] as any).body.text,'👍');assert.equal(f.app.notice,'Sent');f.app.dispose();
});

test('new activity follows the top of Beepster while a scrolled selection stays put',async()=>{
 const f=fixture(),older={...chat,id:'older',network:'iMessage'},newer={...chat,id:'newer',network:'Instagram'};
 f.api.chats=async()=>({items:[older,newer]});await f.app.start();assert.equal(f.app.page?.title,'Beepster');
 f.api.chats=async()=>({items:[newer,older]});await f.app.poll();assert.equal(f.app.page?.index,0);assert.equal(f.app.page?.rows[0].key,'newer');
 assert.equal(f.screens.at(-1)?.icons?.[0],'instagram');assert.ok(!f.app.page?.rows[0].label.includes('Instagram'));
 await f.app.input(2);f.api.chats=async()=>({items:[older,newer]});await f.app.poll();assert.equal(f.app.page?.rows[f.app.page.index].key,'older');f.app.dispose();
});
test('merged messages use source service icons rather than the container service',async()=>{
 const f=fixture(),merged={...chat,merge:{chatIDs:['apple','social'],defaultChatID:'apple',members:[{id:'apple',network:'iMessage'},{id:'social',network:'Instagram'}]}};
 f.api.messages=async(id)=>({items:[{id,sender:'Alex',text:'hello',time:'',timestamp:id==='apple'?'2026-09-11':'2026-09-10'}]});
 await f.app.start();await f.app.openChat(merged);assert.deepEqual(f.screens.at(-1)?.icons?.filter(Boolean),['instagram','apple_messages']);f.app.dispose();
});
test('shared settings migrate services and retain fifteen emoji and original image mode',()=>{
 const s=loadSettings(JSON.stringify({services:['iMessage','Beeper (Matrix)','Instagram'],emojiReplies:Array(15).fill('👍'),contrast:'original',quickReplies:['custom reply']}));
 assert.deepEqual(s.services,['apple_messages','beeper','instagram']);assert.equal(s.emojiReplies.length,15);assert.equal(s.contrast,'original');assert.deepEqual(s.quickReplies,['custom reply']);
});
test('thread shortcuts open selected conversation and review a quick reply without sending',async()=>{
 const f=fixture();f.api.settings.threadShortcut='replies';await f.app.start();await f.app.systemAction('replies');assert.equal(f.app.page?.kind,'replies');await f.app.input(0);assert.equal(f.app.page?.kind,'draft');assert.equal(f.writes.length,0);f.app.dispose();
});

test('More conversations appends at the cursor and selects the first new visible chat across pages',async()=>{
 const f=fixture(),c=(id:string)=>({...chat,id,name:id,network:'iMessage'}),calls:string[]=[];
 f.api.inbox=async(cursor='')=>{calls.push(cursor);return cursor==='page2'?{items:[c('b'),c('c'),c('d')],hasMore:true,nextCursor:'page3'}:cursor==='page3'?{items:[c('d'),c('e')],hasMore:false}:{items:[c('a'),c('b')],hasMore:true,nextCursor:'page2'};};
 await f.app.start();const inbox=f.app.page;await f.app.input(2);await f.app.input(2);await f.app.input(0);
 assert.equal(f.app.page,inbox);assert.equal(inbox?.rows[inbox.index].key,'c');assert.deepEqual(inbox?.rows.map(r=>r.key),['a','b','c','d','more']);
 await f.app.input(2);await f.app.input(2);await f.app.input(0);assert.equal(inbox?.rows[inbox.index].key,'e');assert.deepEqual(inbox?.rows.map(r=>r.key),['a','b','c','d','e']);assert.deepEqual(calls,['','page2','page3']);
 await f.app.poll();assert.equal(inbox?.rows[inbox.index].key,'e');assert.equal(inbox?.rows.length,5);f.app.dispose();
});
test('duplicate-only pagination stays at the tail, and a rejected page leaves selection retryable',async()=>{
 const f=fixture();f.api.inbox=async()=>({items:[chat],hasMore:true,nextCursor:'next'});await f.app.start();await f.app.input(2);await f.app.input(0);assert.equal(f.app.page?.rows[f.app.page.index].key,'more');
 f.api.inbox=async()=>{throw Error('offline');};await f.app.input(0);assert.equal(f.app.page?.rows[f.app.page.index].key,'more');assert.equal(f.app.page?.cursor,'next');
 f.api.inbox=async()=>({items:[],hasMore:false});await f.app.input(0);assert.equal(f.app.page?.rows[f.app.page.index].key,'chat');assert.equal(f.app.page?.rows.length,1);f.app.dispose();
});
