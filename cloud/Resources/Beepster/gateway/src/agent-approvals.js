import { randomUUID, createHash } from 'node:crypto';

export const isTelegramSession = value => typeof value === 'string' && /(^|:)telegram:/.test(value);
export const isSupportedAgentLink = row => isTelegramSession(row.sessionKey) ||
  (row.provider === 'openclaw' && row.requiresTelegramRoute === true && /^agent:[^:]+:[^:]+$/.test(row.sessionKey));
const matchesRoute = (link,item) => !link.requiresTelegramRoute || item.sourceChannel === 'telegram';
const fingerprint = item => createHash('sha256').update(JSON.stringify([
  item.id, item.kind, item.sessionKey, item.summary, item.expiresAt, item.sourceChannel, item.alwaysScope
])).digest('hex');

// The phone gets a short-lived opaque ticket, never an agent credential or a
// caller-selected agent request ID. Settings remain Mac-owned.
export function createAgentApprovals({clients, readLinks, now = Date.now}) {
  const tickets = new Map();
  function prune() {
    for (const [id, ticket] of tickets) if (ticket.until <= now()) tickets.delete(id);
  }
  async function links() {
    const rows = await readLinks();
    return rows.filter(row => row.enabled && clients[row.provider] && row.chatID && isSupportedAgentLink(row));
  }
  return {
    async list(chatID) {
      prune();
      const result = [];
      for (const link of (await links()).filter(row => row.chatID === chatID)) {
        const items = await clients[link.provider].listApprovals(chatID);
        for (const item of items) {
          // An unspecified session or clipped description cannot safely be approved.
          if (item.sessionKey !== link.sessionKey || !matchesRoute(link,item) || !item.id || !item.summary || item.summary.length > 4000 || item.truncated ||
              (item.expiresAt && item.expiresAt <= now())) continue;
          const digest = fingerprint(item);
          if ([...tickets.values()].some(t => t.used && t.provider === link.provider && t.sessionKey === link.sessionKey && t.digest === digest)) continue;
          let entry = [...tickets].find(([, t]) => !t.used && t.chatID === chatID && t.provider === link.provider &&
            t.sessionKey === link.sessionKey && t.digest === digest);
          if (!entry) {
            if (tickets.size >= 200) continue;
            const id = randomUUID();
            const ticket = {chatID, provider:link.provider, sessionKey:link.sessionKey,
              requestID:item.id, digest, until:Math.min(now() + 60000, item.expiresAt || Infinity), used:false};
            tickets.set(id, ticket); entry = [id, ticket];
          }
          result.push({id:entry[0], provider:link.provider, summary:item.summary,
            alwaysScope:typeof item.alwaysScope === 'string' ? item.alwaysScope : undefined,
            createdAt:item.createdAt || 0, expiresAt:entry[1].until});
        }
      }
      return result;
    },
    async resolve(ticketID, chatID, decision) {
      if (!['allow-once', 'deny', 'allow-always'].includes(decision)) throw new Error('Unsupported approval decision');
      prune();
      const ticket = tickets.get(ticketID);
      if (!ticket || ticket.used || ticket.chatID !== chatID) throw new Error('Approval expired or does not belong to this chat');
      // Consume before any await: double clicks/concurrent calls cannot race.
      ticket.used = true;
      const enabled = (await links()).some(row => row.chatID === chatID && row.provider === ticket.provider && row.sessionKey === ticket.sessionKey);
      if (!enabled) throw new Error('Agent link is disabled or changed');
      const client = clients[ticket.provider];
      const pending = (await client.listApprovals(chatID)).find(item => item.id === ticket.requestID && item.sessionKey === ticket.sessionKey);
      if (!pending || fingerprint(pending) !== ticket.digest || (pending.expiresAt && pending.expiresAt <= now())) {
        throw new Error('The exact action changed or is no longer pending');
      }
      if (decision === 'allow-always' && !pending.alwaysScope) throw new Error('Always approval is not supported for this action');
      const result = pending.kind === 'telegram' ? await client.resolveApproval(ticket.requestID, decision, ticket.sessionKey, chatID) :
        await client.resolveApproval(ticket.requestID, decision, ticket.sessionKey);
      return {ok:true, decision, ...(result?.transport === 'telegram' ? result : {})};
    }
  };
}
