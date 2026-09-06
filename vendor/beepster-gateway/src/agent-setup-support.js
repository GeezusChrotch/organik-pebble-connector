import { readdir, readFile, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { isTelegramSession } from './agent-approvals.js';
const exec = promisify(execFile);

export async function openClawExecutable() {
  for (const candidate of [path.join(os.homedir(),'.local','bin','openclaw'),'/opt/homebrew/bin/openclaw','/usr/local/bin/openclaw']) {
    try { await access(candidate); return candidate; } catch { }
  }
  throw new Error('OPENCLAW_NOT_FOUND');
}

// Local index metadata only: no transcript reads and no broader Gateway scopes.
export async function discoverOpenClawSessions(root = path.join(os.homedir(), '.openclaw', 'agents')) {
  const result = [];
  for (const agent of await readdir(root, {withFileTypes:true}).catch(() => [])) {
    if (!agent.isDirectory()) continue;
    const folder = path.join(root, agent.name);
    let entries = [];
    try {
      const old = JSON.parse(await readFile(path.join(folder, 'sessions', 'sessions.json'), 'utf8'));
      entries = Object.entries(old).map(([sessionKey, item]) => ({sessionKey, label:item.label || item.displayName || item.title || ''}));
    } catch { /* Recent OpenClaw uses the agent SQLite index instead. */ }
    const db = path.join(folder, 'agent', 'openclaw-agent.sqlite');
    try {
      await access(db);
      const {stdout} = await exec('/usr/bin/sqlite3', ['-readonly', '-json', db,
        "SELECT session_key AS sessionKey, COALESCE(NULLIF(label,''),NULLIF(display_name,''),'') AS label FROM session_nodes WHERE session_key LIKE '%:telegram:%' AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 200"], {timeout:3000,maxBuffer:256000});
      entries.unshift(...JSON.parse(stdout || '[]'));
      // Newer OpenClaw may share agent:main:main across messaging channels.
      const shared = await exec('/usr/bin/sqlite3', ['-readonly','-json',db,
        "SELECT DISTINCT n.session_key AS sessionKey, COALESCE(NULLIF(n.label,''),NULLIF(n.display_name,''),'') AS label FROM session_nodes n JOIN session_conversations sc ON sc.session_id=n.current_session_id JOIN conversations c USING(conversation_id) WHERE c.channel='telegram' AND n.archived_at IS NULL ORDER BY n.updated_at DESC LIMIT 200"], {timeout:3000,maxBuffer:256000}).catch(() => ({stdout:'[]'}));
      entries.push(...JSON.parse(shared.stdout || '[]').map(item => ({...item,telegramMetadata:true})));
    } catch { /* Missing/unsupported index remains discoverable from pending requests. */ }
    for (const item of entries) if ((isTelegramSession(item.sessionKey) || (item.telegramMetadata && /^agent:[^:]+:[^:]+$/.test(item.sessionKey))) && !result.some(r => r.sessionKey === item.sessionKey)) {
      result.push({provider:'openclaw', sessionKey:item.sessionKey, requiresTelegramRoute:!isTelegramSession(item.sessionKey), label:`${agent.name}${item.label ? ' — '+item.label : ''}${!isTelegramSession(item.sessionKey) ? ' — shared session (Telegram)' : ''}`});
    }
  }
  // Ask the local runtime for the same title projection used by its sidebar.
  // Only enrich sessions already known to have a Telegram route.
  if (root === path.join(os.homedir(), '.openclaw', 'agents')) {
    try {
      const {stdout} = await exec(await openClawExecutable(), ['gateway','call','sessions.list','--params',JSON.stringify({includeDerivedTitles:true,limit:200}),'--json'], {timeout:12000,maxBuffer:2000000});
      for(const row of JSON.parse(stdout).sessions || []) {
        if(typeof row.key!=='string' || row.archivedAt) continue;
        const title=row.label || row.displayName || row.derivedTitle || row.key;
        const existing=result.find(r=>r.sessionKey===row.key);
        if(existing) existing.label=title;
      }
    } catch { /* Offline local index remains useful; no transcript file scanning. */ }
  }
  return result;
}

export function validSetupPost(originHeader, origin, submittedToken, token) {
  // Referrer-Policy:no-referrer can make a legitimate browser POST Origin:null.
  // A separate unpredictable form token is mandatory, including for same-origin.
  return submittedToken === token && (originHeader === origin || originHeader === 'null');
}

export async function discoverHermesSessions(home = path.join(os.homedir(), '.hermes')) {
  let entries = [];
  try {
    const db = path.join(home,'state.db'); await access(db);
    const {stdout} = await exec('/usr/bin/sqlite3',['-readonly','-json',db,
      "SELECT session_key AS sessionKey, json_extract(entry_json,'$.display_name') AS label FROM gateway_routing WHERE json_extract(entry_json,'$.platform')='telegram' AND COALESCE(json_extract(entry_json,'$.expiry_finalized'),0)=0 ORDER BY updated_at DESC LIMIT 200"],{timeout:3000,maxBuffer:256000});
    entries = JSON.parse(stdout || '[]');
  } catch {
    try {
      const data = JSON.parse(await readFile(path.join(home,'sessions','sessions.json'),'utf8'));
      entries = Object.entries(data).filter(([,item]) => item?.platform === 'telegram' && !item.expiry_finalized)
        .map(([sessionKey,item]) => ({sessionKey,label:item.display_name}));
    } catch { /* Missing index means no discoverable sessions, not a fake session. */ }
  }
  return entries.filter(item => isTelegramSession(item.sessionKey)).map(item => ({provider:'hermes',sessionKey:item.sessionKey,label:item.label || 'Hermes Telegram session'}));
}

export function setupForms(html, key, token) {
  return html.replaceAll('<form method="post">', `<form method="post" action="/${key}"><input type="hidden" name="csrf" value="${token}">`);
}
