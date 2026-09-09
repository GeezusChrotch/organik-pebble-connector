import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
export function promptForSession(sessionKey,directory) {
  if(typeof sessionKey!=='string' || !sessionKey) return '';
  if (!directory && process.env.BEEPSTER_OPENCLAW_PROMPT_TRANSPORT === 'store-file') {
    const home = process.env.BEEPSTER_OPENCLAW_HOME || path.join(os.homedir(),'.openclaw');
    const mirror = path.join(home,'beepster','store-thread-prompts.json');
    try {
      const data = JSON.parse(fs.readFileSync(mirror,'utf8'));
      const row = data.version === 1 && data.prompts?.find(r=>r.sessionKey===sessionKey);
      return typeof row?.text==='string' && row.text.length<=12000 ? row.text : '';
    } catch { return ''; }
  }
  directory ||= path.join(os.homedir(),'Library','Application Support','Beepster');
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
