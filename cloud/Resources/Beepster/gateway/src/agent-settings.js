import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { beepsterStateDir } from './agent-distribution.js';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isSupportedAgentLink } from './agent-approvals.js';

export const agentSettingsPath = path.join(beepsterStateDir(), 'agent-links.json');
export async function readAgentLinks(file = agentSettingsPath) {
  try { const data = JSON.parse(await readFile(file, 'utf8')); return Array.isArray(data.links) ? data.links : []; }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
export async function saveAgentLink(link, file = agentSettingsPath) {
  if (!['hermes', 'openclaw'].includes(link.provider) || !isSupportedAgentLink(link) ||
      typeof link.chatID !== 'string' || !link.chatID || link.chatID.length > 500) throw new Error('Invalid agent conversation link');
  const links = await readAgentLinks(file);
  // One source session can never silently appear in two Beeper conversations.
  const next = links.filter(row => !(row.provider === link.provider && row.sessionKey === link.sessionKey));
  next.push({provider:link.provider, sessionKey:link.sessionKey, chatID:link.chatID, enabled:link.enabled === true,
    ...(link.requiresTelegramRoute ? {requiresTelegramRoute:true} : {})});
  await mkdir(path.dirname(file), {recursive:true, mode:0o700});
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify({version:1, links:next}, null, 2), {mode:0o600, flag:'wx'});
  await rename(temporary, file);
}
