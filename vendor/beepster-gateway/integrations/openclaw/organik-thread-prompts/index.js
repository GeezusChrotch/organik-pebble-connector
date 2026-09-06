import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
export function promptForSession(sessionKey,directory=path.join(os.homedir(),'Library','Application Support','Beepster')) {
  if(typeof sessionKey!=='string' || !sessionKey) return '';
  try {
    const links=JSON.parse(fs.readFileSync(path.join(directory,'agent-links.json'),'utf8')).links;
    const rows=JSON.parse(fs.readFileSync(path.join(directory,'thread-prompts.json'),'utf8')).prompts;
    const link=links.find(l=>l.enabled && l.provider==='openclaw' && l.sessionKey===sessionKey);
    const row=link && rows.find(r=>r.provider==='openclaw' && r.sessionKey===sessionKey && r.chatID===link.chatID);
    return typeof row?.text==='string' && row.text.length<=12000 ? row.text : '';
  } catch { return ''; }
}
export default {id:'organik-thread-prompts',name:'Organik thread prompts',register(api) {
  api.on('before_prompt_build',(_event,ctx)=> {
    const text=promptForSession(ctx.sessionKey);
    return text.trim() ? {appendSystemContext:'User instructions for this connected thread:\n'+text} : undefined;
  });
}};
