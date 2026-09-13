// Read-only acceptance against the installed G2 service. No sends/read receipts.
import {execFileSync} from 'node:child_process';import {writeFile} from 'node:fs/promises';
const token=execFileSync('/usr/bin/security',['find-generic-password','-s','org.organikapps.even','-a','client','-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const headers={Authorization:'Bearer '+token},root='http://127.0.0.1:7858';
async function get(path){const r=await fetch(root+path,{headers,signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('Live route HTTP '+r.status);return r.json();}
const h=await get('/health');if(!h.beepster)throw Error('Installed G2 Beepster unavailable');
const chats=await get('/beepster/v1/chats?limit=50');let messages=0,attachments=0,preview;
for(const chat of chats.items.slice(0,8)){const page=await get('/beepster/v1/chats/'+encodeURIComponent(chat.id)+'/messages?limit=20');messages+=page.items.length;for(const m of page.items){if(!m.attachment)continue;attachments++;if(!preview){try{const p=await get('/beepster/v1/attachments/'+m.attachment.id+'/preview?format=json&animate=1');const bytes=Buffer.from(p.pixels,'base64');if(bytes.length!==p.width*p.height*(p.frames||1))throw Error('Invalid preview');preview={kind:p.kind,width:p.width,height:p.height,frames:p.frames||1,bytes:bytes.length};}catch{}}}}
const evidence={service:h.service,home:h.home,beepster:h.beepster,dictation:h.dictation,speechModel:h.speechModel,chats:chats.items.length,messages,attachments,preview:preview||null,sends:0};
console.log(JSON.stringify(evidence));if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(evidence,null,2)+'\n');
