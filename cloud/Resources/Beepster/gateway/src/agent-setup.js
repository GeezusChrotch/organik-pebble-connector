// Connector-launched, short-lived, loopback-only administration UI. The phone's
// gateway credential cannot edit these links or install Hermes plugins.
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { cp, access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { readSecret } from './secret-store.js';
import { BeeperClient } from './beeper-client.js';
import { createOpenClawApprovalClient } from './openclaw-client.js';
import { createHermesApprovalClient } from './hermes-client.js';
import { promptViews, saveThreadPrompt, syncStorePrompts } from './thread-prompts.js';
import { isStoreDistribution, requireLocalAgentInstall } from './agent-distribution.js';
import { telegramCompatibility } from './openclaw-telegram-compat.js';
import { readAgentLinks, saveAgentLink } from './agent-settings.js';
import { isTelegramSession } from './agent-approvals.js';
import { discoverOpenClawSessions, discoverHermesSessions, openClawExecutable, validSetupPost, setupForms } from './agent-setup-support.js';

const exec = promisify(execFile);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const source = fileURLToPath(import.meta.url);

if (process.argv.includes('--launch')) {
  const child = spawn(process.execPath, [source], {detached:true, stdio:['ignore','ignore','ignore','ipc']});
  const timer = setTimeout(() => { child.kill(); process.exit(1); }, 10000);
  child.once('message', message => {
    clearTimeout(timer);
    if (message.url) process.stdout.write(message.url + '\n');
    child.disconnect(); child.unref();
  });
} else {
  const key = randomBytes(32).toString('hex');
  const csrf = randomBytes(32).toString('hex');
  let openclaw;
  const hermes = createHermesApprovalClient();
  const clients = {};
  let origin = '';
  let choices = [], chats = [], cursor = '', loadedChats = false;
  let hermesEnabled = false;
  let bridgeHealth = [];
  async function load(healthOnly = false) {
    bridgeHealth = [];
    hermesEnabled = false;
    try {
      requireLocalAgentInstall();
      const home = path.join(os.homedir(), '.hermes');
      const {stdout} = await exec(path.join(home, 'hermes-agent', 'venv', 'bin', 'hermes'),
        ['plugins','list','--plain','--no-bundled'], {timeout:5000,maxBuffer:128000,env:{...process.env,HERMES_HOME:home}});
      hermesEnabled = stdout.split('\n').some(line => /^enabled\s+user\s+\S+\s+beepster\s*$/.test(line.trim()));
    } catch { /* Leave installation state unknown; never infer success from files alone. */ }
    clients.hermes = hermes;
    if (!openclaw && /^(enabled|true|1)$/i.test(await readSecret('openclaw-enabled'))) {
      openclaw = createOpenClawApprovalClient();
    }
    clients.openclaw = openclaw;
    const states = [];
    if (isStoreDistribution()) {
      hermesEnabled = Boolean(process.env.BEEPSTER_HERMES_BRIDGE_URL);
      if (!process.env.BEEPSTER_OPENCLAW_HOME) states.push('OpenClaw: choose its data folder to discover sessions and sync prompts. Existing authenticated approvals are independent.');
    }
    const links = await readAgentLinks();
    if (!healthOnly) choices = [...await discoverOpenClawSessions(),
      ...(isStoreDistribution() ? await hermes.listSessions().catch(()=>[]) : await discoverHermesSessions())];
    // Saved links stay manageable separately; they are not evidence of a current route.
    for (const provider of ['hermes','openclaw']) {
      const enabled = (provider === 'hermes' ? hermesEnabled : !!openclaw) || links.some(l => l.provider === provider && l.enabled);
      const health = {provider, enabled, ready:false, detail:'Bridge unavailable. Open Agent Links to check setup.'};
      bridgeHealth.push(health);
      if (healthOnly && !enabled) continue;
      if (!clients[provider]) { states.push(`${provider}: enable OpenClaw Approvals in Connector first`); continue; }
      try {
        const pending = await clients[provider].listApprovals();
        health.ready = true;
        health.detail = 'Mac bridge connected. Watch approval delivery is not verified by this check.';
        const sessions = [...new Set(pending.map(item => item.sessionKey).filter(isTelegramSession))];
        for (const sessionKey of sessions) if (!choices.some(c => c.provider === provider && c.sessionKey === sessionKey)) choices.push({provider,sessionKey});
        states.push(`${provider}: connected; ${sessions.length} Telegram session(s) with pending requests`);
        if (pending.length && !sessions.length) states.push(`${provider}: requests have no Telegram session identity. This agent version cannot be linked safely.`);
      } catch { states.push(provider === 'hermes' ? (isStoreDistribution() ? 'Hermes: authenticated HTTP bridge unavailable. Check its URL/token and install or update the plugin from Hermes itself; Connector cannot install agent code.' : hermesEnabled ? 'Hermes: bridge installed and enabled. Waiting for activation: restart Hermes when idle, then trigger a Telegram approval request.' : 'Hermes: bridge not connected. Install the bridge, then restart Hermes when no work is running. Its connection appears after the first Telegram approval request.') : 'OpenClaw: connection or pairing needs attention. In Organik Apps Pebble Connector, select Beepster → Pair OpenClaw access, then review the device request in OpenClaw.'); }
    }
    if (!healthOnly && !loadedChats) try { await moreChats(); } catch { states.push('Beeper chats unavailable. Check the Beeper connection in Connector, then refresh. Agent installation and saved links are independent of this check.'); }
    return states;
  }
  async function moreChats() {
    const token = await readSecret('beeper-access-token');
    if (!token) throw new Error('Set your Beeper token in Connector first');
    const client = new BeeperClient({baseURL:'http://127.0.0.1:23373',accessToken:token});
    const page = await client.listChats(50, cursor);
    for (const chat of page.items || page) if (/telegram/i.test(chat.network || '') && !chats.some(c => c.id === chat.id)) chats.push(chat);
    cursor = page.nextCursor || ''; loadedChats = true;
  }
  async function installHermes() {
    requireLocalAgentInstall();
    const home = path.join(os.homedir(), '.hermes');
    const executable = path.join(home, 'hermes-agent', 'venv', 'bin', 'hermes');
    try { await access(executable); } catch { throw new Error('HERMES_NOT_FOUND'); }
    const destination = path.join(home, 'plugins', 'beepster');
    await mkdir(path.dirname(destination), {recursive:true, mode:0o700});
    // Preserve any previous local plugin before replacing it.
    try { await access(destination); const backup = path.join(home,'beepster','plugin-backups',String(Date.now()));
      await mkdir(path.dirname(backup),{recursive:true,mode:0o700});
      await cp(destination, backup, {recursive:true, errorOnExist:true, force:false}); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await cp(fileURLToPath(new URL('../integrations/hermes/beepster', import.meta.url)), destination,
      {recursive:true,filter:src=>!src.includes(path.sep+'__pycache__') && !src.endsWith('.pyc')});
    try { await exec(executable, ['plugins','enable','beepster'], {timeout:30000, maxBuffer:128000, env:{...process.env,HERMES_HOME:home}}); }
    catch { throw new Error('HERMES_ENABLE_FAILED'); }
  }
  async function installOpenClawPrompts() {
    requireLocalAgentInstall();
    const executable = await openClawExecutable();
    const bundle = fileURLToPath(new URL('../integrations/openclaw/organik-thread-prompts',import.meta.url));
    const destination = path.join(os.homedir(),'.openclaw','extensions','organik-thread-prompts');
    try { await access(destination); await cp(destination,destination+'.backup-'+Date.now(),{recursive:true}); }
    catch(e) { if(e.code!=='ENOENT') throw e; }
    await exec(executable,['plugins','install',bundle,'--force','--accept-capabilities'],{timeout:60000,maxBuffer:128000});
    for(const key of ['allowConversationAccess','allowPromptInjection']) {
      await exec(executable,['config','set','plugins.entries.organik-thread-prompts.hooks.'+key,'true','--strict-json'],{timeout:15000,maxBuffer:128000});
    }
  }
  function page(states, links, note = '') {
    return setupForms(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Beepster Agent Links</title><style>body{font:17px system-ui;max-width:760px;margin:40px auto;padding:0 20px;color:#eee;background:#18212a}select,button{font:inherit;padding:10px;max-width:100%;margin:8px 0}select{width:100%}label{display:block;margin-top:16px}p{line-height:1.5}li{margin:10px 0}section{padding:18px;border:1px solid #536879;border-radius:12px;margin:20px 0}a{color:#9edcff}</style>
<h1>Agent approvals</h1><p>Optional, Mac-only setup for Hermes and OpenClaw. Beepster grants only <b>Approve once</b> or <b>Deny</b>, never standing permission.</p>
<p>${escape(note)}</p><ul>${states.map(s => `<li>${escape(s)}</li>`).join('')}</ul>
<section><h2>OpenClaw setup</h2><ol><li>In <b>Organik Apps Pebble Connector → Beepster</b>, click <b>Pair OpenClaw access</b>. If it is already enabled, keep it enabled.</li><li>If pairing is requested, open OpenClaw and review the pending <b>Beepster Connector</b> device request with <b>operator.approvals</b> scope. No standing approval permission is requested.</li><li>Return here and <a href="/${key}">refresh the connection check</a>. Choose an existing OpenClaw Telegram session and its matching Beeper chat below.</li></ol><p>Existing local Telegram sessions are discovered without reading message transcripts. You do not need a pending approval to link OpenClaw. If a session is missing, message that agent in Telegram and refresh. Remote or non-default installations are not automatically discovered.</p></section>
<section><h2>Hermes setup</h2><p>Install the bridge for the default local Hermes installation. Then restart Hermes yourself when no work is running; Beepster will not restart it. The bridge requires exact-request approval support.</p>
${hermesEnabled ? '<p role="status"><b>✓ Bridge installed and enabled</b></p><p>You do not need to install it again. If you have not restarted Hermes since installation, restart it when its current work is finished. Then trigger an approval request from Telegram and refresh this page to select the session.</p>' : '<form method="post"><input type="hidden" name="action" value="install"><button>Install / enable Hermes bridge</button></form>'}
<p>For the first Hermes link, an approval must be pending in Telegram so the bridge can identify its exact session. Request a task that genuinely requires approval, then refresh here. Saved Hermes sessions remain selectable afterward.</p></section>
<h2>Link an agent to a Telegram chat</h2><p>Select the agent session and the <b>same Telegram conversation</b> from Beeper. Session IDs distinguish agents, groups, and topics; Beepster never guesses a link from a bot name.</p>
<form method="post"><input type="hidden" name="action" value="link"><label>Agent session<select required name="source"><option value="">Choose an agent session…</option>${choices.map(c => `<option value="${escape(JSON.stringify(c))}">${escape(c.provider + ' — ' + (c.label ? c.label + ' — ' : '') + c.sessionKey)}</option>`).join('')}</select></label>
<label>Beeper Telegram conversation<select required name="chatID"><option value="">Choose its Telegram conversation…</option>${chats.map(c => `<option value="${escape(c.id)}">${escape(c.name || c.title || c.id)}</option>`).join('')}</select></label><button ${choices.length && chats.length ? '' : 'disabled'}>Confirm this link</button></form>
${cursor ? '<form method="post"><input type="hidden" name="action" value="more"><button>Load more Beeper conversations</button></form>' : ''}
<h2>3. Check the watch</h2><p>Enable <b>Show pending agent approvals</b> in Beepster phone settings. Open the linked chat: a separate approval card appears <em>inside that conversation</em> with the action description. Confirm the description before approving. Saving a link and refreshing this page never approves anything.</p>
<h2>Saved links</h2><ul>${links.map(l => `<li>${escape(l.provider + ' — ' + l.sessionKey)}<br>Conversation: ${escape(chats.find(c => c.id === l.chatID)?.name || l.chatID)} — ${l.enabled ? 'enabled' : 'disabled'}<form method="post"><input type="hidden" name="action" value="disable"><input type="hidden" name="source" value="${escape(JSON.stringify(l))}"><button>Disable link</button></form></li>`).join('')}</ul>
<p><a style="color:#9edcff" href="/${key}">Refresh connection check</a></p><p>This private setup page expires after 10 minutes. Reopen Agent Links in Connector to continue. Agent credentials never go to the watch.</p>`, key, csrf);
  }
  if (process.argv.includes('--native')) {
    let note = '';
    try {
      let raw = ''; for await (const chunk of process.stdin) { raw += chunk; if (raw.length > 16384) throw new Error('Request too large'); }
      const input = JSON.parse(raw || '{}');
      const states = await load(input.action === 'health');
      if (isStoreDistribution() && ['install','install-openclaw-prompts','install-openclaw-fallback'].includes(input.action)) requireLocalAgentInstall();
      const telegramCompatibilityState = input.action === 'health' ? undefined : await telegramCompatibility({install:input.action === 'install-openclaw-fallback'});
      if (input.action === 'install-openclaw-fallback') note = telegramCompatibilityState.detail;
      // Pagination is bounded and requested explicitly by the native picker.
      for (let i = 1; i < Math.min(20, Number(input.pages) || 1) && cursor; i++) await moreChats();
      if (input.action === 'save-prompt') { await saveThreadPrompt(input); note = 'Thread prompt saved. It applies only to this enabled link after prompt support is installed and the agent restarted. Later edits apply on the next message.'; }
      else if (input.action === 'install-openclaw-prompts') { await installOpenClawPrompts(); note = 'OpenClaw prompt support installed. Restart OpenClaw when idle to activate it.'; }
      else if (input.action === 'install') { await installHermes(); hermesEnabled = true; note = 'Hermes bridge installed and enabled. Restart Hermes when idle, then request an approval in Telegram.'; }
      else if (input.action === 'link') {
        const choice = choices.find(c => c.provider === input.provider && c.sessionKey === input.sessionKey);
        if (!choice || choice.linkable === false || !chats.some(c => c.id === input.chatID)) throw new Error('Unavailable session or conversation');
        await saveAgentLink({...choice,chatID:input.chatID,enabled:true}); note = 'Link saved. No approval was sent.';
      } else if (input.action === 'disable') {
        const link = (await readAgentLinks()).find(l => l.provider === input.provider && l.sessionKey === input.sessionKey && l.chatID === input.chatID);
        if (!link) throw new Error('Link no longer exists');
        await saveAgentLink({...link,enabled:false}); note = 'Link disabled.';
      } else if (input.action && !['status','health','install-openclaw-fallback'].includes(input.action)) throw new Error('Unsupported action');
      const links = await readAgentLinks();
      const threadPrompts = await promptViews(links);
      if (input.action !== 'health') {
        try { await syncStorePrompts(threadPrompts, hermes); }
        catch { throw new Error('PROMPT_SYNC_FAILED'); }
      }
      process.stdout.write(JSON.stringify({ok:true,note,states,hermesEnabled,bridgeHealth,telegramCompatibility:telegramCompatibilityState,choices,
        chats:chats.map(c => ({id:c.id,name:c.name || c.title || c.id})),hasMore:!!cursor,links,threadPrompts}));
    } catch (error) {
      const note = error.message === 'PROMPT_BUSY' ? 'Another prompt save is in progress. Retry after it finishes.' : error.message === 'PROMPT_CHANGED' ? 'This prompt changed elsewhere. Reload it before saving again.' : error.message === 'PROMPT_LINK_CHANGED' ? 'The link changed or is disabled. Reload connections before editing its prompt.' : error.message === 'PROMPT_INVALID' ? 'Use a prompt of at most 12,000 characters.' : error.message === 'HERMES_NOT_FOUND' ? 'Default Hermes installation not found. No plugin was installed.' : error.message === 'HERMES_ENABLE_FAILED' ? 'Bridge files were copied, but Hermes could not enable the plugin. Check Hermes plugin support and retry.' : 'Setup could not complete. Refresh connections and reselect the session and chat. No approval was sent.';
      process.stdout.write(JSON.stringify({ok:false,note:error.message === 'PROMPT_SYNC_FAILED' ?
        'Settings are saved locally, but agent prompt sync failed. Reconnect the bridge or grant the selected folder, then refresh. The agent may still have its previous prompt.' : note}));
    } finally { openclaw?.stop(); }
    process.exit(0);
  }
  const server = http.createServer(async (req,res) => {
    res.setHeader('Cache-Control','no-store'); res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    res.setHeader('Content-Type','text/html; charset=utf-8');
    if (req.url !== `/${key}` || req.headers.host !== origin.replace('http://','')) { res.writeHead(404); res.end('<h1>Setup link unavailable</h1><p>Reopen Agent Links from Organik Apps Pebble Connector.</p>'); return; }
    let note = '';
    try {
      if (req.method === 'POST') {
        let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 16384) throw new Error('Request too large'); }
        const body = new URLSearchParams(raw);
        if (!validSetupPost(req.headers.origin, origin, body.get('csrf'), csrf)) { res.writeHead(403); res.end(page([], [], 'This form could not be verified. Refresh this page and try again. Nothing was changed.')); return; }
        if (body.get('action') === 'install') { await installHermes(); note = 'Plugin installed and enabled. Restart Hermes when convenient, then request an approval in Telegram.'; }
        else if (body.get('action') === 'more') await moreChats();
        else if (body.get('action') === 'link') {
          const choice = JSON.parse(body.get('source'));
          if (!choices.some(c => c.provider === choice.provider && c.sessionKey === choice.sessionKey) || !chats.some(c => c.id === body.get('chatID'))) throw new Error('Refresh and select an available session and conversation');
          await saveAgentLink({...choice, chatID:body.get('chatID'), enabled:true}); note = 'Link saved. Check the pending action in that watch conversation; no decision has been sent.';
        } else if (body.get('action') === 'disable') {
          const selected = JSON.parse(body.get('source'));
          const existing = (await readAgentLinks()).find(l => l.provider === selected.provider && l.sessionKey === selected.sessionKey && l.chatID === selected.chatID);
          if (!existing) throw new Error('Link no longer exists');
          await saveAgentLink({...existing, enabled:false}); note = 'Link disabled.';
        }
      } else if (req.method !== 'GET') { res.writeHead(405); res.end('<h1>Unsupported request</h1><p>Reopen Agent Links from Connector.</p>'); return; }
      const states = await load();
      res.setHeader('Content-Type','text/html; charset=utf-8'); res.end(page(states, await readAgentLinks(), note));
    } catch (error) {
      const message = error.message === 'HERMES_NOT_FOUND' ? 'Hermes was not found at ~/.hermes/hermes-agent/venv/bin/hermes. This installer currently supports the default local installation only. Nothing was installed.' :
        error.message === 'HERMES_ENABLE_FAILED' ? 'The bridge files were copied, but Hermes could not enable the plugin. No agent was restarted. Check that your Hermes version supports plugins, then retry.' :
        'Setup could not complete. Check Beeper access and the agent connection above, then refresh and retry. No approval was sent.';
      res.statusCode = 500;
      res.end(page([], await readAgentLinks().catch(()=>[]), message));
    }
  });
  server.listen(0, '127.0.0.1', () => {
    origin = `http://127.0.0.1:${server.address().port}`;
    process.send?.({url:`${origin}/${key}`});
  });
  setTimeout(() => { openclaw?.stop(); server.close(); server.closeAllConnections(); }, 600000);
}
