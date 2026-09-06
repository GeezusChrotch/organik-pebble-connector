import http from 'node:http';
import { createHash, randomInt } from 'node:crypto';
import { BeeperClient } from './beeper-client.js';
import { configurationPage } from './configuration-page.js';
import { publicEmojiAtlas, publicEmojiCatalog, renderEmojiAtlas } from './emoji-assets.js';
import { createOpenClawApprovalClient } from './openclaw-client.js';
import { readSecret, writeSecret } from './secret-store.js';
import { createAgentApprovals } from './agent-approvals.js';
import { readAgentLinks } from './agent-settings.js';
import { createHermesApprovalClient } from './hermes-client.js';
import { createOpenClawTelegramClient } from './openclaw-telegram.js';

const MAX_BODY_BYTES = 16 * 1024;

function sendJSON(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store'
  });
  response.end(payload);
}

function sendHTML(response, status, body) {
  response.writeHead(status, {'Content-Type':'text/html; charset=utf-8','Content-Length':Buffer.byteLength(body),'Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"});
  response.end(body);
}

function sendStatic(response, contentType, body) {
  response.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': body.length,
    'Cache-Control': 'public, max-age=86400'
  });
  response.end(body);
}

function sendPreview(response, preview) {
  const kind = preview.kind === 'gif' ? 2 : (preview.kind === 'video' ? 3 : 1);
  const envelope = Buffer.from([0x42, 0x50, 1, preview.width, preview.height, kind]);
  const payload = Buffer.concat([envelope, preview.pixels]);
  response.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': payload.length,
    'Cache-Control': 'private, max-age=300',
    'X-Beepster-Width': String(preview.width),
    'X-Beepster-Height': String(preview.height),
    'X-Beepster-Kind': preview.kind
  });
  response.end(payload);
}

function sendPreviewJSON(response, preview) {
  sendJSON(response, 200, {
    width: preview.width,
    height: preview.height,
    kind: preview.kind,
    pixels: preview.pixels.toString('base64')
  });
}

async function readJSON(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function boundedLimit(value, fallback = 12) {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(parsed, 50));
}

function requestTag(requestID) {
  return createHash('sha256').update(requestID).digest('hex').slice(0, 12);
}

function replyChatIDs(primaryChatID, fallbackChatIDs) {
  const values = [primaryChatID].concat(Array.isArray(fallbackChatIDs) ? fallbackChatIDs : []);
  return values.map((value) => String(value || '').trim()).filter((value, index, items) =>
    value && value.length <= 500 && items.indexOf(value) === index).slice(0, 10);
}

export function createServer({ beeperClient, openClawClient = null, hermesClient = null, telegramApprovals = false, readLinks = async () => [], gatewayToken, pairingCode = '', rotatePairingCode = async () => '', logger = console }) {
  if (!gatewayToken) throw new Error('gatewayToken is required');
  const cache = new Map();
  const replyRequests = new Map();
  const pendingReplies = new Map();
  let activePairingCode = pairingCode;
  let pairingAvailable = Boolean(pairingCode);
  const agents = createAgentApprovals({clients:{openclaw:telegramApprovals && openClawClient && beeperClient ? createOpenClawTelegramClient({beeper:beeperClient,readLinks}) : openClawClient, hermes:hermesClient}, readLinks});

  async function withCache(key, loader) {
    try {
      const value = await loader();
      cache.set(key, { value, savedAt: Date.now() });
      return { value, stale: false };
    } catch (error) {
      const saved = cache.get(key);
      if (saved && Date.now() - saved.savedAt < 15 * 60 * 1000) return { value: saved.value, stale: true };
      throw error;
    }
  }

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname === '/health' && request.method === 'GET') {
        sendJSON(response, 200, { ok: true, service: 'beepster-gateway', agentProtocol: 1, capabilities: ['agent-approval-tickets', 'explicit-agent-links'], beeperConfigured: Boolean(beeperClient),
          openClawEnabled: Boolean(openClawClient), openClawState: openClawClient?.status?.().state || 'disabled' });
        return;
      }
      if (url.pathname === '/configure' && request.method === 'GET') {
        sendHTML(response, 200, configurationPage());
        return;
      }
      if (url.pathname === '/emoji/catalog.json' && request.method === 'GET') {
        sendStatic(response, 'application/json; charset=utf-8', publicEmojiCatalog());
        return;
      }
      if (url.pathname === '/emoji/atlas.png' && request.method === 'GET') {
        sendStatic(response, 'image/png', publicEmojiAtlas());
        return;
      }
      if (url.pathname === '/pair' && request.method === 'POST') {
        const body = await readJSON(request);
        if (!pairingAvailable || body.code !== activePairingCode) {
          sendJSON(response, 403, { error: 'Pairing code is invalid' });
          return;
        }
        pairingAvailable = false;
        const nextPairingCode = await rotatePairingCode();
        if (!nextPairingCode) {
          sendJSON(response, 503, { error: 'Could not rotate the pairing code; try again after checking the Mac Connector' });
          return;
        }
        activePairingCode = nextPairingCode;
        pairingAvailable = true;
        sendJSON(response, 200, { gatewayToken });
        return;
      }

      if (request.headers.authorization !== `Bearer ${gatewayToken}`) {
        sendJSON(response, 401, { error: 'Unauthorized' });
        return;
      }

      if (url.pathname === '/v1/agents/approvals' && request.method === 'GET') {
        try {
          sendJSON(response, 200, {items:await agents.list(url.searchParams.get('chatID') || '')});
        } catch {
          sendJSON(response, 503, {error:'Agent approvals unavailable. Check the agent link in Beepster Connector.'});
        }
        return;
      }
      const agentDecision = url.pathname.match(/^\/v1\/agents\/approvals\/([^/]+)\/decision$/);
      if (agentDecision && request.method === 'POST') {
        const body = await readJSON(request);
        try {
          const result = await agents.resolve(decodeURIComponent(agentDecision[1]), body.chatID, body.decision);
          if (result.transport === 'telegram') pendingReplies.set(`${result.chatID}:${result.pendingMessageID}`, {chatID:result.chatID,text:result.text,sentAfter:result.sentAfter});
          const {text, sentAfter, ...publicResult} = result;
          sendJSON(response, 200, publicResult);
        } catch {
          sendJSON(response, 409, {error:'Approval not confirmed. It may have expired, changed, or already been answered. Check the agent before retrying.'});
        }
        return;
      }
      // Retire the unscoped endpoint: old phone builds must not guess which
      // Telegram conversation owns an approval from its timestamp or words.
      if (url.pathname.startsWith('/v1/openclaw/approvals')) {
        sendJSON(response, 410, {error:'Update the watch app and link your agent conversation in Beepster Connector.'});
        return;
      }
      if (url.pathname === '/v1/openclaw/status' && request.method === 'GET') {
        sendJSON(response, 200, {enabled:Boolean(openClawClient), state:openClawClient?.status?.().state || 'disabled'});
        return;
      }

      if (!beeperClient) {
        sendJSON(response, 503, { error: 'Beeper Desktop access is not configured on the Mac' });
        return;
      }

      if (url.pathname === '/v1/emoji/atlas' && request.method === 'POST') {
        const body = await readJSON(request);
        const atlas = renderEmojiAtlas(body.keys, body.size, body.columns);
        sendJSON(response, 200, {
          width: atlas.width,
          height: atlas.height,
          pixels: atlas.pixels.toString('base64'),
          entries: atlas.entries
        });
        return;
      }

      if (url.pathname === '/v1/chats' && request.method === 'GET') {
        const cursor = url.searchParams.get('cursor') || '';
        const requestedInbox = url.searchParams.get('inbox') || 'primary';
        const inbox = ['primary', 'low-priority', 'archive'].includes(requestedInbox) ? requestedInbox : 'primary';
        const result = await withCache(`chats:${inbox}:${cursor}`, () =>
          beeperClient.listChats(boundedLimit(url.searchParams.get('limit')), cursor, inbox));
        const page = Array.isArray(result.value) ? { items: result.value } : result.value;
        sendJSON(response, 200, { ...page, ...(result.stale ? { stale: true } : {}) });
        return;
      }

      if (url.pathname === '/v1/chats/archive' && request.method === 'POST') {
        const body = await readJSON(request);
        const chatIDs = replyChatIDs('', body.chatIDs);
        if (!chatIDs.length) {
          sendJSON(response, 400, { error: 'At least one conversation is required' });
          return;
        }
        await Promise.all(chatIDs.map((chatID) => beeperClient.archiveChat(chatID)));
        cache.clear();
        sendJSON(response, 200, { archived: true, count: chatIDs.length });
        return;
      }

      const deleteMessageMatch = url.pathname.match(/^\/v1\/chats\/([^/]+)\/delete-message$/);
      if (deleteMessageMatch && request.method === 'POST') {
        const chatID = decodeURIComponent(deleteMessageMatch[1]);
        const body = await readJSON(request);
        const messageID = String(body.messageID || '').trim();
        if (!chatID || chatID.length > 500 || !messageID || messageID.length > 500 ||
            typeof body.forEveryone !== 'boolean') {
          sendJSON(response, 400, { error: 'Message deletion requires a message ID and deletion scope' });
          return;
        }
        let result;
        try {
          result = await beeperClient.deleteMessage(chatID, messageID, body.forEveryone);
        } catch (error) {
          if (error.code === 'IMESSAGE_DELETE_DISABLED') {
            sendJSON(response, 409, {error:'iMessage deletion is temporarily disabled. Thread archiving still works.',code:'IMESSAGE_DELETE_DISABLED'});
            return;
          }
          sendJSON(response, 502, {
            error: 'Beeper could not confirm deletion. Check Beeper before retrying.',
            code: 'BEEPER_DELETE_FAILED'
          });
          return;
        }
        cache.clear();
        sendJSON(response, 200, result);
        return;
      }

      const messagesMatch = url.pathname.match(/^\/v1\/chats\/([^/]+)\/messages$/);
      const watchReplyMatch = url.pathname.match(/^\/v1\/chats\/([^/]+)\/reply$/);
      if (messagesMatch && request.method === 'GET') {
        const chatID = decodeURIComponent(messagesMatch[1]);
        const cursor = url.searchParams.get('cursor') || '';
        const result = await withCache(`messages:${chatID}:${cursor}`, () => beeperClient.listMessages(chatID, boundedLimit(url.searchParams.get('limit')), cursor));
        const page = Array.isArray(result.value) ? { items: result.value } : result.value;
        sendJSON(response, 200, { ...page, ...(result.stale ? { stale: true } : {}) });
        return;
      }

      if ((messagesMatch && request.method === 'POST') || (watchReplyMatch && request.method === 'GET')) {
        const chatID = decodeURIComponent((messagesMatch || watchReplyMatch)[1]);
        const body = await readJSON(request);
        const encodedHeaderText = typeof request.headers['x-beepster-reply-text'] === 'string' ?
          request.headers['x-beepster-reply-text'] : '';
        let headerText = '';
        try { headerText = decodeURIComponent(encodedHeaderText); } catch {}
        const text = (typeof body.text === 'string' ? body.text : headerText).trim();
        const headerRequestID = typeof request.headers['x-beepster-request-id'] === 'string' ?
          request.headers['x-beepster-request-id'] : '';
        const requestID = (typeof body.requestID === 'string' ? body.requestID : headerRequestID).trim();
        const encodedFallbackHeader = typeof request.headers['x-beepster-fallback-chat-ids'] === 'string' ?
          request.headers['x-beepster-fallback-chat-ids'] : '';
        let headerFallbackChatIDs = [];
        try {
          const decoded = JSON.parse(decodeURIComponent(encodedFallbackHeader));
          if (Array.isArray(decoded)) headerFallbackChatIDs = decoded;
        } catch {}
        const chatIDs = replyChatIDs(chatID,
          Array.isArray(body.fallbackChatIDs) ? body.fallbackChatIDs : headerFallbackChatIDs);
        if (!text || text.length > 1000 || !requestID || requestID.length > 80) {
          sendJSON(response, 400, { error: 'Reply requires text and a request ID' });
          return;
        }
        const duplicate = replyRequests.get(requestID);
        const replyTag = requestTag(requestID);
        if (duplicate) {
          if (duplicate.text !== text || duplicate.chatIDs.join('\n') !== chatIDs.join('\n')) {
            sendJSON(response, 409, { error: 'Reply request ID was already used for different content' });
            return;
          }
          const accepted = await duplicate.promise;
          logger.info(`reply duplicate transport=${request.method} request=${replyTag} pending=${Boolean(accepted.pendingMessageID)}`);
          sendJSON(response, 202, { ...accepted, duplicate: true });
          return;
        }
        logger.info(`reply received transport=${request.method} request=${replyTag} characters=${[...text].length}`);
        const sentAfter = Date.now();
        const promise = (async () => {
          let lastError;
          for (let index = 0; index < chatIDs.length; index++) {
            try {
              const result = await beeperClient.sendReply(chatIDs[index], text);
              return {state:'pending',pendingMessageID:result.pendingMessageID,chatID:chatIDs[index]};
            } catch (error) {
              lastError = error;
              if (index + 1 < chatIDs.length) {
                logger.warn(`reply route unavailable request=${replyTag} trying=${index + 2}/${chatIDs.length}`);
              }
            }
          }
          throw lastError || new Error('No reply destination is available');
        })();
        replyRequests.set(requestID, { chatIDs, text, promise });
        if (replyRequests.size > 100) replyRequests.delete(replyRequests.keys().next().value);
        try {
          const accepted = await promise;
          if (accepted.pendingMessageID) {
            pendingReplies.set(`${accepted.chatID}:${accepted.pendingMessageID}`, {chatID:accepted.chatID,text,sentAfter});
            if (pendingReplies.size > 100) pendingReplies.delete(pendingReplies.keys().next().value);
          }
          logger.info(`reply accepted request=${replyTag} pending=${Boolean(accepted.pendingMessageID)}`);
          sendJSON(response, 202, accepted);
        } catch (error) {
          replyRequests.delete(requestID);
          logger.error(`reply failed request=${replyTag} error=${error?.message || 'unknown'}`);
          throw error;
        }
        return;
      }

      const messageStatusMatch = url.pathname.match(/^\/v1\/chats\/([^/]+)\/messages\/([^/]+)$/);
      if (messageStatusMatch && request.method === 'GET') {
        const chatID = decodeURIComponent(messageStatusMatch[1]);
        const messageID = decodeURIComponent(messageStatusMatch[2]);
        const pending = pendingReplies.get(`${chatID}:${messageID}`);
        let status;
        try {
          status = await beeperClient.getMessageStatus(chatID, messageID);
        } catch (error) {
          if (!pending) throw error;
          status = await beeperClient.findSentReply(chatID, pending.text, pending.sentAfter);
          if (!status) throw error;
        }
        if (status.status === 'PENDING' && pending) {
          status = await beeperClient.findSentReply(chatID, pending.text, pending.sentAfter) || status;
        }
        sendJSON(response, 200, status);
        return;
      }

      const attachmentMatch = url.pathname.match(/^\/v1\/attachments\/([a-f0-9]{24})\/preview$/);
      if (attachmentMatch && request.method === 'GET') {
        const preview = await beeperClient.getAttachmentPreview(attachmentMatch[1]);
        if (!preview) {
          sendJSON(response, 404, { error: 'Attachment is no longer available; reload the chat' });
          return;
        }
        if (url.searchParams.get('format') === 'json') sendPreviewJSON(response, preview);
        else sendPreview(response, preview);
        return;
      }

      sendJSON(response, 404, { error: 'Not found' });
    } catch (error) {
      if (error.code === 'BEEPSTER_MEDIA_MISSING') {
        sendJSON(response, 404, { error: 'Photo unavailable in Beeper. Open it in Beeper or the original app.', code: 'MEDIA_MISSING' });
        return;
      }
      sendJSON(response, 502, { error: 'Upstream request failed' });
    }
  }).on('close', () => openClawClient?.stop?.());
}

export async function createConfiguredServer(environment = process.env) {
  const beeperToken = environment.BEEPER_ACCESS_TOKEN || await readSecret('beeper-access-token');
  const gatewayToken = environment.BEEPSTER_GATEWAY_TOKEN || await readSecret('gateway-token');
  const pairingCode = environment.BEEPSTER_PAIRING_CODE || await readSecret('pairing-code');
  const openClawSetting = environment.BEEPSTER_OPENCLAW_ENABLED || await readSecret('openclaw-enabled');
  if (!gatewayToken) throw new Error('BEEPSTER_GATEWAY_TOKEN is required');
  const client = beeperToken ? new BeeperClient({
    baseURL: environment.BEEPER_BASE_URL || 'http://127.0.0.1:23373',
    accessToken: beeperToken
  }) : null;
  const rotatePairingCode = environment.BEEPSTER_PAIRING_CODE ?
    async () => String(randomInt(100000, 1000000)) : async () => {
    const nextCode = String(randomInt(100000, 1000000));
    return await writeSecret('pairing-code', nextCode) ? nextCode : '';
  };
  const openClawClient = /^(1|true|yes|enabled)$/i.test(String(openClawSetting || '')) ?
    createOpenClawApprovalClient() : null;
  return createServer({ beeperClient: client, openClawClient, hermesClient:createHermesApprovalClient(), readLinks:readAgentLinks,
    gatewayToken, pairingCode, rotatePairingCode, telegramApprovals:true });
}
