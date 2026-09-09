import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import { isStoreDistribution, requireLocalAgentInstall } from './agent-distribution.js';

const marker = '// Beepster exact-ID Telegram fallback v1';
const anchor = '\t\tconst decisionButtons = view.actions.flatMap((action) => {';
const addition = `\t\t${marker}
\t\tconst beepsterChoices = [...new Set(view.actions.flatMap(({action}) =>
\t\t\taction?.type === "approval" && action.approvalId === params.request.id &&
\t\t\t["allow-once", "deny", "allow-always"].includes(action.decision) ? [action.decision] : []))];
\t\tif (beepsterChoices.includes("allow-once") && beepsterChoices.includes("deny")) {
\t\t\tlines.push(\x60ID: \x24{params.request.id}\x60);
\t\t\tlines.push(\x60Reply with: /approve \x24{params.request.id} \x24{beepsterChoices.join("|")}\x60);
\t\t}
`;
export function patchedRenderer(source) {
  if (source.includes(marker)) return source;
  if (!source.includes('"🔒 OpenClaw change requires approval"') || source.split(anchor).length !== 2) throw new Error('Unsupported OpenClaw renderer; nothing changed');
  return source.replace(anchor, addition + anchor);
}
export async function telegramCompatibility({root, install = false, backupDir = path.join(os.homedir(),'Library/Application Support/Beepster/openclaw-renderer-backups')} = {}) {
  if (isStoreDistribution()) {
    if (install) requireLocalAgentInstall();
    return {supported:false,installed:false,detail:'Store builds never patch agent code. Configure approvals in OpenClaw itself.'};
  }
  const candidates = root ? [root] : ['/usr/local/lib/node_modules/openclaw','/opt/homebrew/lib/node_modules/openclaw',path.join(os.homedir(),'.npm-global/lib/node_modules/openclaw')];
  let pkg;
  for (const candidate of candidates) {
    try {const p=JSON.parse(await fs.readFile(path.join(candidate,'package.json'),'utf8'));if(p.name==='openclaw'){root=candidate;pkg=p;break;}} catch {}
  }
  if (!pkg) return {supported:false,installed:false,detail:'OpenClaw installation not found. Default npm/Homebrew locations are supported.'};
  if (pkg.version !== '2026.9.1') return {supported:false,installed:false,detail:'Compatibility installer supports OpenClaw 2026.9.1 only. This version needs review; nothing changed.'};
  const files = (await fs.readdir(path.join(root,'dist'))).filter(n=>/^approval-handler\.runtime-.*\.js$/.test(n));
  if(files.length!==1) return {supported:false,installed:false,detail:'Unrecognized renderer layout; nothing changed.'};
  const target=path.join(root,'dist',files[0]);
  const source=await fs.readFile(target,'utf8');
  let next;try{next=patchedRenderer(source);}catch{return {supported:false,installed:false,detail:'Unrecognized renderer contents; nothing changed.'};}
  if(next===source)return {supported:true,installed:true,detail:'Exact-ID Telegram text fallback installed. Restart OpenClaw after installation; new requests only.'};
  if(!install)return {supported:true,installed:false,detail:'Telegram change approvals need the text fallback. Install below, then restart OpenClaw when idle.'};
  await fs.mkdir(backupDir,{recursive:true,mode:0o700});
  const hash=createHash('sha256').update(source).digest('hex');
  const backup=path.join(backupDir,files[0]+'.'+hash+'.bak');
  try{await fs.writeFile(backup,source,{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
  if(await fs.readFile(target,'utf8')!==source)throw new Error('Renderer changed during installation; retry after OpenClaw update finishes');
  const temp=target+'.beepster-'+process.pid;
  try{await fs.writeFile(temp,next,{flag:'wx',mode:(await fs.stat(target)).mode & 0o777});await fs.rename(temp,target);}finally{await fs.unlink(temp).catch(()=>{});}
  return {supported:true,installed:true,detail:'Installed with backup. Restart OpenClaw when idle, then generate a fresh approval.',backup};
}
