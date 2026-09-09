import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm, readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {agentHome, requireLocalAgentInstall, beepsterStateDir} from '../src/agent-distribution.js';
import {discoverOpenClawSessions, discoverHermesSessions, openClawExecutable} from '../src/agent-setup-support.js';
import {createHermesApprovalClient} from '../src/hermes-client.js';
import {syncStorePrompts} from '../src/thread-prompts.js';
import {telegramCompatibility} from '../src/openclaw-telegram-compat.js';
import {promptForSession} from '../integrations/openclaw/organik-thread-prompts/index.js';

test('Store mode requires explicit roots/network and never falls back to host CLI/socket', async () => {
  const prior = {...process.env};
  try {
    process.env.BEEPSTER_DISTRIBUTION='app-store';
    delete process.env.BEEPSTER_STATE_DIR;
    assert.throws(()=>beepsterStateDir(),/must supply/);
    process.env.BEEPSTER_STATE_DIR='relative';
    assert.throws(()=>beepsterStateDir(),/absolute/);
    delete process.env.BEEPSTER_OPENCLAW_HOME;
    assert.throws(()=>agentHome('openclaw'),/Choose/);
    assert.throws(()=>requireLocalAgentInstall(),/cannot install/);
    assert.deepEqual(await discoverOpenClawSessions(),[]);
    await assert.rejects(discoverHermesSessions(),/authenticated bridge/);
    await assert.rejects(openClawExecutable(),/cannot install/);
    await assert.rejects(telegramCompatibility({install:true}),/cannot install/);
    assert.equal((await telegramCompatibility()).supported,false);
    await assert.rejects(createHermesApprovalClient({bridgeURL:''}).listApprovals(),/do not use Unix sockets/);
  } finally { for(const key of Object.keys(process.env)) if(!(key in prior))delete process.env[key];Object.assign(process.env,prior); }
});

test('Store imports place saved links and prompt editor state in the explicit container directory', () => {
  const root=path.join(os.tmpdir(),'synthetic-beepster-container');
  const script=`import {agentSettingsPath} from ${JSON.stringify(new URL('../src/agent-settings.js',import.meta.url).href)};
    import {promptFile} from ${JSON.stringify(new URL('../src/thread-prompts.js',import.meta.url).href)};
    console.log(JSON.stringify([agentSettingsPath,promptFile]));`;
  const result=execFileSync(process.execPath,['--input-type=module','-e',script],
    {env:{...process.env,BEEPSTER_DISTRIBUTION:'app-store',BEEPSTER_STATE_DIR:root},encoding:'utf8'});
  assert.deepEqual(JSON.parse(result),[path.join(root,'agent-links.json'),path.join(root,'thread-prompts.json')]);
});

test('Store session index and scoped prompt mirror use only the selected OpenClaw root', async () => {
  const prior = {...process.env};
  const root = await mkdtemp(path.join(os.tmpdir(),'beepster-store-agents-'));
  try {
    process.env.BEEPSTER_DISTRIBUTION='app-store';
    process.env.BEEPSTER_OPENCLAW_HOME=root;
    process.env.BEEPSTER_OPENCLAW_PROMPT_TRANSPORT='store-file';
    process.env.BEEPSTER_HERMES_BRIDGE_URL='http://127.0.0.1:1/v1/beepster';
    const directory=path.join(root,'agents','main','agent');await mkdir(directory,{recursive:true});
    const {DatabaseSync}=await import('node:sqlite');
    const db=new DatabaseSync(path.join(directory,'openclaw-agent.sqlite'));
    db.exec("CREATE TABLE session_nodes(session_key TEXT,label TEXT,display_name TEXT,archived_at TEXT,updated_at INT); INSERT INTO session_nodes VALUES('agent:main:telegram:dm:123','Example',NULL,NULL,1)");db.close();
    const sessions=await discoverOpenClawSessions();
    assert.equal(sessions.length,1);assert.equal(sessions[0].sessionKey,'agent:main:telegram:dm:123');
    const rows=[{provider:'openclaw',sessionKey:sessions[0].sessionKey,chatID:'a',text:'Brief'},
      {provider:'hermes',sessionKey:'agent:telegram:dm:456',chatID:'b',text:'Hermes only'}];
    let synced;
    const hermes={syncPrompts:async rows=>{synced=rows;}};
    await syncStorePrompts(rows,hermes);
    assert.equal(promptForSession(rows[0].sessionKey),'Brief');
    assert.equal(promptForSession(rows[1].sessionKey),'');
    assert.equal(synced.length,1);assert.equal(synced[0].text,'Hermes only');
    const file=JSON.parse(await readFile(path.join(root,'beepster','store-thread-prompts.json'),'utf8'));
    assert.deepEqual(Object.keys(file),['version','prompts']);
    await syncStorePrompts([],hermes);
    assert.equal(promptForSession(rows[0].sessionKey),'');assert.deepEqual(synced,[]);
    await assert.rejects(syncStorePrompts(rows,{syncPrompts:async()=>{throw new Error('offline');}}),/offline/);
  } finally { await rm(root,{recursive:true,force:true});for(const key of Object.keys(process.env))if(!(key in prior))delete process.env[key];Object.assign(process.env,prior); }
});
