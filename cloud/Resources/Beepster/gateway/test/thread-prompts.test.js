import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,stat,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {saveThreadPrompt,promptViews,revision} from '../src/thread-prompts.js';
import {promptForSession} from '../integrations/openclaw/organik-thread-prompts/index.js';

test('thread prompts preserve other links, reject stale writes, disable/relink safely and remove overrides',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'organik-prompts-'));
 try {
 const file=path.join(dir,'thread-prompts.json'),linksFile=path.join(dir,'agent-links.json');
 const a={provider:'openclaw',sessionKey:'agent:main:telegram:direct:123',chatID:'chat-a',enabled:true};
 const b={provider:'hermes',sessionKey:'agent:telegram:dm:456',chatID:'chat-b',enabled:true};
 await writeFile(linksFile,JSON.stringify({links:[a,b]}));
 await saveThreadPrompt({...a,text:'Concise please',revision:revision('')},{file,linksFile});
 await saveThreadPrompt({...b,text:'Hermes only',revision:revision('')},{file,linksFile});
 assert.equal(promptForSession(a.sessionKey,dir),'Concise please');
 assert.equal(promptForSession(b.sessionKey,dir),'');
 assert.equal(promptForSession('agent:other:telegram:direct:123',dir),'');
 await assert.rejects(saveThreadPrompt({...a,text:'stale',revision:revision('')},{file,linksFile}),/PROMPT_CHANGED/);
 await writeFile(linksFile,JSON.stringify({links:[{...a,enabled:false},b]}));
 assert.equal(promptForSession(a.sessionKey,dir),'');
 await assert.rejects(saveThreadPrompt({...a,text:'disabled',revision:revision('Concise please')},{file,linksFile}),/PROMPT_LINK_CHANGED/);
 await writeFile(linksFile,JSON.stringify({links:[{...a,chatID:'new-chat'},b]}));
 assert.equal(promptForSession(a.sessionKey,dir),'');
 await writeFile(linksFile,JSON.stringify({links:[a,b]}));
 await saveThreadPrompt({...a,text:'',revision:revision('Concise please')},{file,linksFile});
 assert.equal(promptForSession(a.sessionKey,dir),'');
 assert.equal((await promptViews([b],file))[0].text,'Hermes only');
 assert.equal((await stat(file)).mode&0o777,0o600);
 await assert.rejects(saveThreadPrompt({...a,text:'x'.repeat(12001),revision:revision('')},{file,linksFile}),/PROMPT_INVALID/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('Pebble defaults are persisted for each agent without overwriting edits or an intentionally empty prompt',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'organik-default-prompts-'));
 try {
 const file=path.join(dir,'thread-prompts.json'),linksFile=path.join(dir,'agent-links.json');
 const links=['openclaw','hermes'].map(provider=>({provider,sessionKey:`${provider}:telegram:123`,chatID:provider,enabled:true}));
 await writeFile(linksFile,JSON.stringify({links}));
 let views=await promptViews(links,file,linksFile);
 assert.equal(views.length,2);
 for(const view of views) {assert.match(view.text,/Pebble watch/);assert.equal(view.text,view.defaultText);}
 assert.match(views[0].text,/OpenClaw/);assert.match(views[1].text,/Hermes/);
 assert.equal(promptForSession(links[0].sessionKey,dir),views[0].text);
 await saveThreadPrompt({...links[0],text:'My custom instructions',revision:views[0].revision},{file,linksFile});
 await saveThreadPrompt({...links[1],text:'',revision:views[1].revision},{file,linksFile});
 views=await promptViews(links,file,linksFile);
 assert.equal(views[0].text,'My custom instructions');assert.equal(views[1].text,'');
 assert.equal((await readFile(file,'utf8')).includes('My custom instructions'),true);
 } finally {await rm(dir,{recursive:true,force:true});}
});
