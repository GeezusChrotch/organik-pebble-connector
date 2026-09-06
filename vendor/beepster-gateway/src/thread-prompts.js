import { readFile, mkdir, writeFile, rename, copyFile, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { readAgentLinks } from './agent-settings.js';
export const promptFile = path.join(os.homedir(),'Library','Application Support','Beepster','thread-prompts.json');
export function defaultThreadPrompt(provider) {
  const agent = provider === 'hermes' ? 'Hermes' : 'OpenClaw';
  return `You are ${agent}, helping through Beepster on a Pebble watch. This connected thread may also be opened in Telegram or on a desktop.
Keep replies easy to read on a small watch screen: lead with the answer or result, use short sentences and brief paragraphs, and avoid tables, elaborate Markdown, and long code blocks. Give enough detail to be useful; offer more detail when needed rather than omitting essential information.
For a simple request, aim for a few concise sentences. For a complex task, give a short progress update and a compact result. Ask one clear question at a time when clarification is necessary.
Treat watch messages as potentially typed or dictated; resolve obvious typos from context without changing the user's intent. Prefer descriptive names over raw IDs and long URLs.
Use your normal tools and approval workflow. Never treat these instructions as authorization, bypass approval, or claim an action succeeded without evidence. Keep approval descriptions brief and concrete, and confirm the outcome after an action completes.
When the user explicitly requests a longer answer, code, or another format, follow that request.`;
}
export const revision = text => createHash('sha256').update(text).digest('hex');
export async function readThreadPrompts(file=promptFile) {
  try { const d=JSON.parse(await readFile(file,'utf8')); if (!Array.isArray(d.prompts)) throw new Error('Invalid prompt store'); return d.prompts; }
  catch(e) { if(e.code==='ENOENT') return []; throw e; }
}
export async function promptViews(links,file=promptFile,linksFile) {
  let rows=await readThreadPrompts(file);
  for (const link of links.filter(l=>l.enabled)) {
    if (!rows.some(r=>r.provider===link.provider && r.sessionKey===link.sessionKey && r.chatID===link.chatID)) {
      try {
        await saveThreadPrompt({...link,text:defaultThreadPrompt(link.provider),revision:revision('')},{file,linksFile});
      } catch(e) {
        if(e.message!=='PROMPT_CHANGED') throw e;
      }
      rows=await readThreadPrompts(file);
    }
  }
  return links.filter(l=>l.enabled).map(l=>{
    const text=rows.find(r=>r.provider===l.provider && r.sessionKey===l.sessionKey && r.chatID===l.chatID)?.text || '';
    return {provider:l.provider,sessionKey:l.sessionKey,chatID:l.chatID,text,defaultText:defaultThreadPrompt(l.provider),revision:revision(text)};
  });
}
export async function saveThreadPrompt(input,{file=promptFile,linksFile}={}) {
  await mkdir(path.dirname(file),{recursive:true,mode:0o700});
  const lock=await open(file+'.lock','wx',0o600).catch(()=>{throw new Error('PROMPT_BUSY');});
  try {
  const links=await readAgentLinks(linksFile);
  if (!links.some(l=>l.enabled && l.provider===input.provider && l.sessionKey===input.sessionKey && l.chatID===input.chatID)) throw new Error('PROMPT_LINK_CHANGED');
  if(typeof input.text!=='string' || input.text.length>12000 || input.text.includes('\0')) throw new Error('PROMPT_INVALID');
  const rows=await readThreadPrompts(file);
  const matches=r=>r.provider===input.provider && r.sessionKey===input.sessionKey;
  const old=rows.find(r=>matches(r)&&r.chatID===input.chatID)?.text || '';
  if(input.revision!==revision(old)) throw new Error('PROMPT_CHANGED');
  const next=rows.filter(r=>!matches(r));
  next.push({provider:input.provider,sessionKey:input.sessionKey,chatID:input.chatID,text:input.text});
  await mkdir(path.dirname(file),{recursive:true,mode:0o700});
  try { await copyFile(file,file+'.backup-'+randomUUID()); } catch(e) { if(e.code!=='ENOENT') throw e; }
  const temp=file+'.'+randomUUID()+'.tmp';
  await writeFile(temp,JSON.stringify({version:1,prompts:next},null,2),{mode:0o600,flag:'wx'}); await rename(temp,file);
  } finally { await lock.close(); await unlink(file+'.lock'); }
}
