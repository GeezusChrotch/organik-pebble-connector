import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTelegramApproval,createOpenClawTelegramClient} from '../src/openclaw-telegram.js';
const id='plugin:12345678-1234-1234-1234-123456789abc';
const now=Date.parse('2026-09-05T21:00:00Z');
const card=()=>({id:'message',isSelf:false,timestamp:new Date(now).toISOString(),text:`ℹ️ Plugin approval required\nTitle: Safe test\nDescription: Do nothing\nID: ${id}\nExpires in: 600s\nReply with: /approve ${id} allow-once|deny`});
test('parses exact scoped Telegram command and advertised choices',()=>{
  const item=parseTelegramApproval(card(),now);
  assert.equal(item.id,id);assert.equal(item.expiresAt,now+600000);
  assert.deepEqual(item.choices,['allow-once','deny']);assert.equal(item.alwaysScope,undefined);
});
for(const [name,change] of Object.entries({self:m=>m.isSelf=true,forwarded:m=>m.isForwarded=true,expired:m=>m.timestamp='2020-01-01',mismatched:m=>m.text=m.text.replace('ID: '+id,'ID: '+id.replace('12345678','87654321')),unscoped:m=>m.text=m.text.replace('/approve '+id,'/approve'),prose:m=>m.text='Please approve this action'}))test('rejects '+name,()=>{const m=card();change(m);assert.equal(parseTelegramApproval(m,now),null);});
test('linked direct chat revalidation sends once to exact chat, not admin API',async()=>{
  let group=false,enabled=true;const sends=[];let items=[card()];
  const client=createOpenClawTelegramClient({now:()=>now,readLinks:async()=>[{provider:'openclaw',enabled,chatID:'chat',sessionKey:'agent:main:main'}],beeper:{request:async()=>({type:group?'group':'single'}),listMessages:async()=>({items}),sendReply:async(...args)=>{sends.push(args);return {pendingMessageID:'pending'};}}});
  assert.equal((await client.listApprovals('other')).length,0);
  group=true;assert.equal((await client.listApprovals('chat')).length,0);group=false;
  await assert.rejects(client.resolveApproval(id,'allow-always','agent:main:main','chat'));
  const sent=await client.resolveApproval(id,'deny','agent:main:main','chat');
  assert.equal(sent.transport,'telegram');assert.deepEqual(sends,[['chat','/approve '+id+' deny']]);
  items.push({isSelf:true,text:'/approve '+id+' deny'});
  assert.equal((await client.listApprovals('chat')).length,0);
  items=[card()];enabled=false;
  await assert.rejects(client.resolveApproval(id,'deny','agent:main:main','chat'));
  assert.equal(sends.length,1);
});
