import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentApprovals } from '../src/agent-approvals.js';

test('shared main session requires explicit Telegram origin on each request', async () => {
  const broker = createAgentApprovals({
    clients:{openclaw:{listApprovals:async () => ['telegram','whatsapp',''].map((sourceChannel,i) => ({id:String(i),sessionKey:'agent:main:main',summary:'Test approval',sourceChannel}))}},
    readLinks:async () => [{provider:'openclaw',sessionKey:'agent:main:main',requiresTelegramRoute:true,chatID:'test-chat',enabled:true}]
  });
  assert.equal((await broker.list('test-chat')).length,1);
});

function fixture() {
  let time = 1000;
  const decisions = [];
  const state = {items:[{id:'request',sessionKey:'agent:main:telegram:dm:1',summary:'Run this exact action',kind:'exec',expiresAt:100000}],
    links:[{enabled:true,provider:'hermes',chatID:'chat',sessionKey:'agent:main:telegram:dm:1'}]};
  const client = {listApprovals:async()=>state.items,
    resolveApproval:async (...args)=> { decisions.push(args); state.items = []; }};
  const broker = createAgentApprovals({clients:{hermes:client,openclaw:client},readLinks:async()=>state.links,now:()=>time});
  return {state,broker,decisions,advance:()=>{time += 61000;}};
}
test('only explicit chat and source session receive an opaque approval ticket', async () => {
  const {broker,state} = fixture();
  assert.deepEqual(await broker.list('other'), []);
  const [card] = await broker.list('chat');
  assert.notEqual(card.id, 'request');
  assert.equal(card.sessionKey, undefined);
  assert.equal((await broker.list('chat'))[0].id, card.id);
  state.items[0].sessionKey = 'agent:main:telegram:dm:2';
  assert.deepEqual(await broker.list('chat'), []);
});
test('wrong-chat and unknown decisions never reach an agent', async () => {
  const {broker,decisions} = fixture(); const [card] = await broker.list('chat');
  await assert.rejects(broker.resolve(card.id,'wrong','allow-once'));
  await assert.rejects(broker.resolve(card.id,'chat','always'));
  assert.equal(decisions.length,0);
});
test('Always requires an advertised scope and binds it to the exact ticket', async () => {
  const denied = fixture();
  const [unsupported] = await denied.broker.list('chat');
  await assert.rejects(denied.broker.resolve(unsupported.id, 'chat', 'allow-always'));
  assert.equal(denied.decisions.length, 0);
  const allowed = fixture();
  allowed.state.items[0].alwaysScope = 'Future matching requests';
  const [card] = await allowed.broker.list('chat');
  assert.equal(card.alwaysScope, 'Future matching requests');
  await allowed.broker.resolve(card.id, 'chat', 'allow-always');
  assert.equal(allowed.decisions[0][1], 'allow-always');
  const changed = fixture();
  changed.state.items[0].alwaysScope = 'Narrow scope';
  const [old] = await changed.broker.list('chat');
  changed.state.items[0].alwaysScope = 'Broader scope';
  await assert.rejects(changed.broker.resolve(old.id, 'chat', 'allow-always'));
  assert.equal(changed.decisions.length, 0);
});
test('double clicks resolve at most once with exact source identity', async () => {
  const {broker,decisions} = fixture(); const [card] = await broker.list('chat');
  const responses = await Promise.allSettled([broker.resolve(card.id,'chat','allow-once'),broker.resolve(card.id,'chat','allow-once')]);
  assert.equal(responses.filter(r=>r.status==='fulfilled').length,1);
  assert.deepEqual(decisions,[['request','allow-once','agent:main:telegram:dm:1']]);
});
for (const change of ['expired','changed','gone','disabled','relinked']) test(`${change} approval fails closed`, async () => {
  const {broker,state,advance,decisions} = fixture(); const [card] = await broker.list('chat');
  if(change==='expired') advance();
  if(change==='changed') state.items[0].summary='Different command';
  if(change==='gone') state.items=[];
  if(change==='disabled') state.links[0].enabled=false;
  if(change==='relinked') state.links[0].sessionKey='agent:main:telegram:dm:2';
  await assert.rejects(broker.resolve(card.id,'chat','deny'));
  assert.equal(decisions.length,0);
});
test('requests without source metadata and clipped descriptions are not actionable', async () => {
  const {broker,state} = fixture(); state.items[0].truncated=true;
  assert.deepEqual(await broker.list('chat'),[]);
  state.items[0].truncated=false; delete state.items[0].sessionKey;
  assert.deepEqual(await broker.list('chat'),[]);
});
