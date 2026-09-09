import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {patchedRenderer,telegramCompatibility} from '../src/openclaw-telegram-compat.js';
import {parseTelegramApproval} from '../src/openclaw-telegram.js';
const fixture='// "🔒 OpenClaw change requires approval"\n\t\tconst decisionButtons = view.actions.flatMap((action) => {return [];});\n';
test('renderer fallback round-trips exact system approval and choices',()=>{
  const id='system-agent:12345678-1234-1234-1234-123456789abc';
  const patched=patchedRenderer(fixture);
  assert.equal(patchedRenderer(patched),patched);
  assert.throws(()=>patchedRenderer('unrecognized'),/Unsupported/);
  const lines=['🔒 OpenClaw change requires approval','Change: Test','Agent: main','Expires in: 10m'];
  new Function('view','params','lines',patched)({actions:['allow-once','deny'].map(decision=>({action:{type:'approval',approvalId:id,decision}}))},{request:{id}},lines);
  const now=Date.now();
  const parsed=parseTelegramApproval({text:lines.join('\n'),timestamp:new Date(now).toISOString()},now);
  assert.equal(parsed.id,id);assert.deepEqual(parsed.choices,['allow-once','deny']);assert.equal(parsed.expiresAt,now+600000);
});
test('installer checks version, backs up and is idempotent',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'beepster-compat-'));
  try {
    await mkdir(path.join(root,'dist'));
    await writeFile(path.join(root,'package.json'),JSON.stringify({name:'openclaw',version:'2026.9.1'}));
    const file=path.join(root,'dist','approval-handler.runtime-fixture.js');await writeFile(file,fixture);
    const options={root,backupDir:path.join(root,'backups')};
    assert.equal((await telegramCompatibility(options)).installed,false);
    const installed=await telegramCompatibility({...options,install:true});
    assert.equal(await readFile(installed.backup,'utf8'),fixture);
    assert.equal((await telegramCompatibility({...options,install:true})).installed,true);
    await writeFile(path.join(root,'package.json'),JSON.stringify({name:'openclaw',version:'future'}));
    assert.equal((await telegramCompatibility({...options,install:true})).supported,false);
  }finally{await rm(root,{recursive:true,force:true});}
});
