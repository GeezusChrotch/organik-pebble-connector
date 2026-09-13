// Read-only check: private identifiers/content are never written to evidence.
import {execFileSync} from 'node:child_process';import {writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
import {API} from '../src/api';import {defaults,messageAttachments} from '../src/model';import {mediaFrames} from '../src/media';
const token=execFileSync('/usr/bin/security',['find-generic-password','-s','org.organikapps.even','-a','client','-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();const api=new API({...defaults,url:'http://127.0.0.1:7858',token});
const chat=(await api.chats('primary')).items.find(c=>c.name===process.argv[2]);assert.ok(chat?.merge);
const messages=await api.conversation(chat);const apple=new Set(chat.merge.members.filter(m=>m.network==='iMessage').map(m=>m.id));const results=[];
for(const m of messages.items.filter(m=>apple.has(m.sourceChatID!))){for(const a of messageAttachments(m)){const r=await fetch(api.settings.url+'/beepster/v1/attachments/'+a.id+'/preview?format=json&animate=1',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(25000)});const p=await r.json();if(r.ok){const frames=mediaFrames(p);assert.ok(frames[0].length);results.push({kind:a.kind,status:r.status,width:p.width,height:p.height,frames:frames.length,g2BMP:true});}else results.push({kind:a.kind,status:r.status,code:p.code});}}
assert.ok(results.some(r=>r.kind==='image'&&r.status===200));assert.ok(results.every(r=>r.status===200||r.code==='MEDIA_MISSING'));
const evidence={connectorBuild:'66',beepsterG2Version:'0.1.2',results,sends:0,hardwareTested:false};console.log(JSON.stringify(evidence,null,2));if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(evidence,null,2)+'\n');
