import {htmlToText} from './html-to-text.js';

// This is a Telegram transport, not proof the underlying action completed.
export function parseTelegramApproval(message, now = Date.now()) {
  if (message.isSelf || message.isSender || message.isForwarded || message.forwardedFrom) return null;
  const text = htmlToText(message.text || '');
  if (!/^(?:(?:ℹ️?\s*)?(?:Plugin|Exec|Command) approval required|🔒\s*OpenClaw change requires approval)\s*\n/i.test(text)) return null;
  const id = text.match(/^ID:\s*((?:plugin:|exec:|system-agent:)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*$/im)?.[1];
  const reply = text.match(/^Reply with:\s*\/approve\s+(\S+)\s+(allow-once(?:\|(?:allow-always|deny)){1,2})\s*$/im);
  const duration = text.match(/^Expires in:\s*(\d+)(s|m)\s*$/im);
  const seconds = duration ? Number(duration[1]) * (duration[2].toLowerCase()==='m' ? 60 : 1) : 0;
  const created = Date.parse(message.timestamp);
  if (!id || !reply || reply[1] !== id || !Number.isFinite(created) || !seconds || seconds > 3600 || created > now + 30000) return null;
  const choices = reply[2].split('|');
  if (!choices.includes('deny') || new Set(choices).size !== choices.length) return null;
  const expiresAt = created + seconds * 1000;
  if (expiresAt <= now || text.length > 4000) return null;
  return {id, kind:'telegram', sourceChannel:'telegram', summary:text, createdAt:created, expiresAt,
    choices, alwaysScope:choices.includes('allow-always') ? 'Send allow-always to OpenClaw for this exact request. This may grant persistent permission for future matching actions.' : undefined};
}

export function createOpenClawTelegramClient({beeper, readLinks, now = Date.now}) {
  return {
    async listApprovals(chatID) {
      const link = (await readLinks()).find(l=>l.provider==='openclaw' && l.enabled && l.chatID===chatID);
      if (!link) return [];
      const chat = await beeper.request('/v1/chats/' + encodeURIComponent(chatID));
      // Group participants must not be able to spoof an agent approval card.
      if (chat.type !== 'single') return [];
      const page = await beeper.listMessages(chatID, 50);
      const answered = new Set((page.items || []).filter(m=>m.isSelf).map(m=>String(m.text).match(/^\/approve\s+(\S+)\s+(?:allow-once|deny|allow-always)\s*$/)?.[1]).filter(Boolean));
      return (page.items || []).flatMap(m=>{
        const parsed = parseTelegramApproval(m, now());
        return parsed && !answered.has(parsed.id) ? [{...parsed, sessionKey:link.sessionKey}] : [];
      });
    },
    async resolveApproval(id, decision, sessionKey, chatID) {
      const item = (await this.listApprovals(chatID)).find(i=>i.id===id && i.sessionKey===sessionKey);
      if (!item || !item.choices.includes(decision)) throw new Error('Telegram approval expired, changed or unavailable');
      const text = '/approve ' + id + ' ' + decision;
      const sentAfter = now();
      const result = await beeper.sendReply(chatID, text);
      if (!result.pendingMessageID) throw new Error('No Telegram delivery ID; check chat before retrying');
      return {transport:'telegram',pendingMessageID:result.pendingMessageID,chatID,text,sentAfter};
    }
  };
}
