import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { discoverOpenClawSessions, discoverHermesSessions, validSetupPost, setupForms } from '../src/agent-setup-support.js';

test('Hermes sessions are discovered without a pending approval or running bridge', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(),'beepster-hermes-discovery-'));
  try {
    await mkdir(path.join(root,'sessions'));
    await writeFile(path.join(root,'sessions','sessions.json'),JSON.stringify({
      'agent:telegram:123':{platform:'telegram',display_name:'Test bot'},
      'agent:telegram:456':{platform:'telegram',expiry_finalized:true},
      'agent:discord:789':{platform:'discord'}
    }));
    const rows = await discoverHermesSessions(root);
    assert.equal(rows.length,1); assert.equal(rows[0].provider,'hermes');
    assert.equal(rows[0].sessionKey,'agent:telegram:123');
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('browser no-referrer form POST requires a matching CSRF token', () => {
  const origin = 'http://127.0.0.1:1234';
  assert.equal(validSetupPost('null', origin, 'secret', 'secret'), true);
  assert.equal(validSetupPost(origin, origin, 'secret', 'secret'), true);
  for (const header of [undefined, 'https://attacker.example']) assert.equal(validSetupPost(header, origin, 'secret', 'secret'), false);
  for (const token of [null, '', 'wrong']) assert.equal(validSetupPost('null', origin, token, 'secret'), false);
  const html = setupForms('<form method="post"></form><form method="post"></form>', 'key', 'secret');
  assert.equal(html.match(/name="csrf"/g).length, 2);
  assert.equal(html.match(/action="\/key"/g).length, 2);
});

test('OpenClaw session discovery supports legacy and SQLite indexes without pending approvals', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'beepster-session-test-'));
  try {
    await mkdir(path.join(root, 'one', 'sessions'), {recursive:true});
    await writeFile(path.join(root, 'one', 'sessions', 'sessions.json'), JSON.stringify({
      'agent:one:telegram:direct:123': {displayName:'Telegram agent'},
      'agent:one:main': {label:'Not Telegram'}
    }));
    await mkdir(path.join(root, 'two', 'agent'), {recursive:true});
    execFileSync('/usr/bin/sqlite3', [path.join(root, 'two', 'agent', 'openclaw-agent.sqlite'),
      "CREATE TABLE session_nodes(session_key TEXT,display_name TEXT,label TEXT,archived_at INTEGER,updated_at INTEGER); INSERT INTO session_nodes VALUES ('agent:two:telegram:group:456',NULL,'Group',NULL,1),('agent:two:telegram:direct:789',NULL,'Archived',1,1);"]);
    const rows = await discoverOpenClawSessions(root);
    assert.equal(rows.length, 2);
    assert.ok(rows.some(r => r.sessionKey === 'agent:one:telegram:direct:123'));
    assert.ok(rows.some(r => r.sessionKey === 'agent:two:telegram:group:456'));
    assert.ok(rows.every(r => r.provider === 'openclaw'));
  } finally { await rm(root, {recursive:true,force:true}); }
});

test('renamed SQLite labels override old display names and legacy snapshots', async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'organik-rename-'));
 try {
 await mkdir(path.join(root,'one','sessions'),{recursive:true});
 await mkdir(path.join(root,'one','agent'),{recursive:true});
 await writeFile(path.join(root,'one','sessions','sessions.json'),JSON.stringify({'agent:one:telegram:direct:123':{displayName:'Old'}}));
 execFileSync('/usr/bin/sqlite3',[path.join(root,'one','agent','openclaw-agent.sqlite'),"CREATE TABLE session_nodes(session_key TEXT,display_name TEXT,label TEXT,archived_at INTEGER,updated_at INTEGER); INSERT INTO session_nodes VALUES ('agent:one:telegram:direct:123','Old','Pebble!',NULL,1);"]);
 const rows=await discoverOpenClawSessions(root);assert.equal(rows.length,1);assert.match(rows[0].label,/Pebble!/);
 } finally {await rm(root,{recursive:true,force:true});}
});
