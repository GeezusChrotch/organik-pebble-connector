import { normalizeEmojiForPebble } from './emoji.js';
import { tokenizeEmojiForWatch } from './emoji-assets.js';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWatchPreview } from './image-preview.js';
import { htmlToText } from './html-to-text.js';
import { MacContactsResolver, normalizeContactIdentifier } from './contact-resolver.js';

const MAX_MESSAGE_PAGE = 60;
const MAX_PREVIEW_CACHE = 8;
const LOCAL_API_PORTS = Array.from({length: 11}, (_, index) => 23373 + index);

function ensureOK(response, operation) {
  if (!response.ok) {
    throw new Error(`${operation} failed with HTTP ${response.status}`);
  }
  return response;
}

function participantIdentifiers(chat) {
  return [...(chat?.participants?.items || []).filter((item) => !item.isSelf).flatMap(personIdentifiers), chat?.title]
    .map(normalizeContactIdentifier).filter((value, index, values) => value && values.indexOf(value) === index);
}

function personIdentifiers(person) {
  return [person?.email, person?.phoneNumber, person?.id]
    .map(normalizeContactIdentifier).filter(Boolean);
}

function allParticipantIdentifiers(chat) {
  return (chat?.participants?.items || [])
    .filter((item) => !item.isSelf)
    .flatMap(personIdentifiers);
}

function contactSearchQueries(chat) {
  return [...(chat?.participants?.items || []).filter((item) => !item.isSelf)
    .flatMap((participant) => [participant.id, participant.email, participant.phoneNumber, participant.username]), chat?.title]
    .map((value) => String(value || '').trim())
    .filter((value, index, values) => value && values.indexOf(value) === index);
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next++;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({length: Math.min(concurrency, values.length)}, worker));
  return results;
}

function readableDisplayName(value) {
  const name = String(value || '').trim();
  return name && !/^unknown(?: contact)?$/i.test(name) && !normalizeContactIdentifier(name) ? name : '';
}

function needsContactEnrichment(chat, contacts = []) {
  if (chat?.type === 'group') return !readableDisplayName(chat?.title) &&
    !readableDisplayName(resolveChatName(chat, contacts));
  if (chat?.type !== 'single') return false;
  const participant = chat?.participants?.items?.find((item) => !item.isSelf);
  if (participant?.fullName?.trim()) return false;
  const current = resolveChatName(chat, contacts);
  return current === 'Unknown contact' || current === chat?.title || !readableDisplayName(current);
}

function appleIdentifierKind(chat) {
  if (!/imessage|apple messages/i.test(String(chat?.network || chat?.accountID || ''))) return '';
  const participant = chat?.participants?.items?.find((item) => !item.isSelf);
  const candidate = String(participant?.email || participant?.phoneNumber || chat?.title || '').trim();
  if (candidate.includes('@')) return 'email';
  return normalizeContactIdentifier(candidate) ? 'phone' : '';
}

function appleContactGroup(chat, localContactKeys) {
  if (chat?.type !== 'single' || !appleIdentifierKind(chat)) return '';
  for (const identifier of participantIdentifiers(chat)) {
    const contactKey = localContactKeys.get(identifier);
    if (contactKey) return contactKey;
  }
  return '';
}

function contactMatchesParticipant(contact, participant) {
  if (contact.id && contact.id === participant?.id) return true;
  const participantKeys = [participant?.email, participant?.phoneNumber]
    .map(normalizeContactIdentifier).filter(Boolean);
  const contactKeys = [contact.email, contact.phoneNumber]
    .map(normalizeContactIdentifier).filter(Boolean);
  return participantKeys.some((key) => contactKeys.includes(key));
}

function resolveParticipantName(participant, contacts, localNames) {
  const contact = contacts.find((item) => contactMatchesParticipant(item, participant));
  for (const candidate of [participant?.fullName, contact?.fullName]) {
    const name = readableDisplayName(candidate);
    if (name) return name;
  }
  for (const identifier of personIdentifiers(participant)) {
    const name = readableDisplayName(localNames.get(identifier));
    if (name) return name;
  }
  for (const candidate of [participant?.username, contact?.username]) {
    const name = readableDisplayName(candidate);
    if (name) return name;
  }
  return '';
}

export function resolveChatName(chat, contacts = [], localNames = new Map()) {
  if (chat?.type === 'single') {
    const participant = chat?.participants?.items?.find((item) => !item.isSelf);
    const participantName = resolveParticipantName(participant, contacts, localNames);
    if (participantName) return participantName;
    for (const identifier of participantIdentifiers(chat)) {
      const localName = localNames.get(identifier);
      if (localName?.trim()) return localName.trim();
    }
    if (chat?.title?.trim()) return chat.title.trim();
    if (participant?.username?.trim()) return participant.username.trim();
    if (participant?.phoneNumber?.trim()) return participant.phoneNumber.trim();
    if (participant?.email?.trim()) return participant.email.trim();
  }
  if (chat?.type === 'group') {
    const title = readableDisplayName(chat?.title);
    if (title) return title;
    const participants = (chat?.participants?.items || []).filter((item) => !item.isSelf);
    const names = participants.map((participant) => resolveParticipantName(participant, contacts, localNames))
      .filter((name, index, values) => name && values.indexOf(name) === index);
    if (names.length) {
      const total = Math.max(participants.length,
        Number(chat?.participants?.total || 0) - ((chat?.participants?.items || []).some((item) => item.isSelf) ? 1 : 0));
      const visible = names.slice(0, 3);
      const remaining = Math.max(0, total - visible.length);
      return `${visible.join(', ')}${remaining ? ` +${remaining}` : ''}`;
    }
  }
  if (chat?.title?.trim()) return chat.title.trim();
  return 'Unknown contact';
}

function normalizePreview(preview) {
  if (!preview) return '';
  if (typeof preview === 'string') return htmlToText(preview);
  return htmlToText(preview.text || '');
}

function normalizeTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

export class BeeperClient {
  constructor({ baseURL, accessToken, fetchImpl = globalThis.fetch, previewCreator = createWatchPreview,
    contactResolver = new MacContactsResolver() }) {
    this.baseURL = baseURL.replace(/\/$/, '');
    this.accessToken = accessToken;
    this.fetch = fetchImpl;
    this.previewCreator = previewCreator;
    this.contactResolver = contactResolver;
    this.attachments = new Map();
    this.previewCache = new Map();
    this.previewPromises = new Map();
    this.chatContexts = new Map();
    this.accountContacts = new Map();
    this.loadedAccountContacts = new Set();
    this.accountContactQueries = new Map();
    this.localContactNames = new Map();
    this.autoDiscoverLocalAPI = /^http:\/\/(127\.0\.0\.1|localhost):23373$/.test(this.baseURL);
  }

  async discoverLocalAPI() {
    const candidates = await Promise.all(LOCAL_API_PORTS.map(async (port) => {
      const baseURL = `http://127.0.0.1:${port}`;
      try {
        const response = await this.fetch(`${baseURL}/v1/info`, {
          signal: AbortSignal.timeout(750)
        });
        if (!response.ok) return null;
        const info = await response.json();
        return info?.app?.name === 'Beeper' && info?.server?.status === 'running' ? baseURL : null;
      } catch {
        return null;
      }
    }));
    const discovered = candidates.find(Boolean);
    if (!discovered) throw new Error('Beeper Desktop API is not running');
    this.baseURL = discovered;
    return discovered;
  }

  async response(path, options = {}) {
    const requestOptions = {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };
    let response;
    try {
      response = await this.fetch(`${this.baseURL}${path}`, requestOptions);
    } catch (error) {
      if (!this.autoDiscoverLocalAPI) throw error;
      const previousBaseURL = this.baseURL;
      const discoveredBaseURL = await this.discoverLocalAPI();
      if (discoveredBaseURL === previousBaseURL) throw error;
      response = await this.fetch(`${this.baseURL}${path}`, requestOptions);
    }
    ensureOK(response, options.method || 'GET');
    return response;
  }

  async request(path, options = {}) {
    const response = await this.response(path, options);
    if (response.status === 204) return null;
    return response.json();
  }

  rememberAttachment(messageID, attachment, index) {
    const sourceURL = attachment.type === 'video' ? (attachment.posterImg || attachment.srcURL) : (attachment.srcURL || attachment.posterImg);
    if (!sourceURL || !/^(file|mxc|localmxc):\/\//.test(sourceURL)) return null;
    const kind = attachment.isGif || attachment.mimeType === 'image/gif' ? 'gif' :
      (attachment.type === 'video' ? 'video' : 'image');
    const id = createHash('sha256').update(`${messageID}:${attachment.id || index}:${sourceURL}`).digest('hex').slice(0, 24);
    this.attachments.set(id, { sourceURL, kind });
    if (this.attachments.size > 300) this.attachments.delete(this.attachments.keys().next().value);
    return { id, kind };
  }

  mergeAccountContacts(accountID, additions) {
    const contacts = this.accountContacts.get(accountID) || [];
    const keys = new Map();
    contacts.forEach((contact, index) => {
      const key = contact.id || personIdentifiers(contact)[0] || String(contact.username || '').toLocaleLowerCase();
      if (key) keys.set(key, index);
    });
    for (const contact of additions || []) {
      const key = contact.id || personIdentifiers(contact)[0] || String(contact.username || '').toLocaleLowerCase();
      if (key && keys.has(key)) Object.assign(contacts[keys.get(key)], contact);
      else {
        if (key) keys.set(key, contacts.length);
        contacts.push(contact);
      }
    }
    this.accountContacts.set(accountID, contacts);
    return contacts;
  }

  async loadAccountContactPage(accountID) {
    if (!accountID || this.loadedAccountContacts.has(accountID)) return this.accountContacts.get(accountID) || [];
    try {
      const result = await this.request(`/v1/accounts/${encodeURIComponent(accountID)}/contacts/list?limit=200`);
      this.loadedAccountContacts.add(accountID);
      return this.mergeAccountContacts(accountID, result.items || []);
    } catch {
      return this.accountContacts.get(accountID) || [];
    }
  }

  async searchAccountContacts(accountID, values) {
    if (!accountID) return [];
    const searched = this.accountContactQueries.get(accountID) || new Set();
    this.accountContactQueries.set(accountID, searched);
    const queries = [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
      .filter((value) => !searched.has(value.toLocaleLowerCase()));
    await mapWithConcurrency(queries, 4, async (query) => {
      try {
        const result = await this.request(`/v1/accounts/${encodeURIComponent(accountID)}/contacts?query=${encodeURIComponent(query)}`);
        searched.add(query.toLocaleLowerCase());
        this.mergeAccountContacts(accountID, result.items || []);
      } catch {
        // Network-specific contact search is optional; retain other honest fallbacks.
      }
    });
    return this.accountContacts.get(accountID) || [];
  }

  async listChats(limit, cursor = '', inbox = 'primary') {
    const cursorQuery = cursor ? `&cursor=${encodeURIComponent(cursor)}&direction=before` : '';
    const result = await this.request(`/v1/chats/search?limit=${limit}&type=any&inbox=${encodeURIComponent(inbox)}${cursorQuery}`);
    const contactsByAccount = new Map();
    const unresolvedChats = (result.items || []).filter((chat) => needsContactEnrichment(chat));
    const unresolvedAccounts = [...new Set(unresolvedChats.map((chat) => chat.accountID).filter(Boolean))];
    await Promise.all(unresolvedAccounts.map(async (accountID) => {
      contactsByAccount.set(accountID, await this.loadAccountContactPage(accountID));
    }));
    await Promise.all(unresolvedAccounts.map(async (accountID) => {
      const accountChats = unresolvedChats.filter((chat) => chat.accountID === accountID);
      const contacts = contactsByAccount.get(accountID) || [];
      const queries = accountChats.filter((chat) => needsContactEnrichment(chat, contacts))
        .flatMap(contactSearchQueries);
      contactsByAccount.set(accountID, await this.searchAccountContacts(accountID, queries));
    }));
    const localIdentifiers = (result.items || []).flatMap((chat) => {
      const contacts = contactsByAccount.get(chat.accountID) || [];
      const current = resolveChatName(chat, contacts);
      const appleChat = /imessage|apple messages/i.test(String(chat?.network || chat?.accountID || ''));
      const appleDirect = chat?.type === 'single' && Boolean(appleIdentifierKind(chat));
      if (appleDirect || normalizeContactIdentifier(current)) return participantIdentifiers(chat);
      if (appleChat || (chat?.type === 'group' && !readableDisplayName(chat?.title))) {
        return allParticipantIdentifiers(chat);
      }
      return [];
    });
    let localNames;
    let localContactKeys;
    if (typeof this.contactResolver.lookupDetails === 'function') {
      const details = await this.contactResolver.lookupDetails(localIdentifiers);
      localNames = details.names;
      localContactKeys = details.contactKeys;
    } else {
      localNames = await this.contactResolver.lookup(localIdentifiers);
      localContactKeys = new Map();
    }
    for (const [identifier, name] of localNames) this.localContactNames.set(identifier, name);
    const items = (result.items || []).map((chat) => {
      const contacts = contactsByAccount.get(chat.accountID) || this.accountContacts.get(chat.accountID) || [];
      const name = normalizeEmojiForPebble(resolveChatName(chat, contacts, localNames));
      this.chatContexts.delete(chat.id);
      this.chatContexts.set(chat.id, {
        accountID: chat.accountID || '',
        network: chat.network || '',
        type: chat.type || '',
        name,
        participants: chat?.participants?.items || [],
        participantsHasMore: Boolean(chat?.participants?.hasMore),
        hydrated: false
      });
      while (this.chatContexts.size > 100) this.chatContexts.delete(this.chatContexts.keys().next().value);
      return {
        id: chat.id,
        name,
        network: chat.network || '',
        unreadCount: chat.unreadCount || 0,
        preview: normalizeEmojiForPebble(normalizePreview(chat.preview)),
        timestamp: normalizeTime(chat.lastActivity || chat.lastActivityAt || chat.preview?.timestamp),
        identifierKind: appleIdentifierKind(chat),
        contactGroup: appleContactGroup(chat, localContactKeys)
      };
    });
    const appleNameCounts = new Map();
    for (const item of items) {
      if (!item.identifierKind) continue;
      const key = item.name.toLocaleLowerCase();
      appleNameCounts.set(key, (appleNameCounts.get(key) || 0) + 1);
    }
    return {
      items: items.map((item) => {
        const { identifierKind, ...watchItem } = item;
        if (identifierKind && appleNameCounts.get(item.name.toLocaleLowerCase()) > 1) {
          watchItem.name = `${item.name} (${identifierKind})`;
        }
        return watchItem;
      }),
      hasMore: Boolean(result.hasMore),
      nextCursor: result.oldestCursor || null
    };
  }

  resolveMessageSender(chatID, message) {
    if (message.isSender) return 'Me';
    const supplied = readableDisplayName(message.senderName);
    if (supplied) return supplied;
    const context = this.chatContexts.get(chatID);
    if (!context) return String(message.senderName || 'Unknown').trim() || 'Unknown';
    if (context.type === 'single') {
      const directName = readableDisplayName(context.name);
      if (directName) return directName;
    }
    const participant = context.participants.find((item) =>
      !item.isSelf && message.senderID && item.id === message.senderID);
    const contacts = this.accountContacts.get(context.accountID) || [];
    const contact = contacts.find((item) => item.id && item.id === message.senderID) ||
      (participant ? contacts.find((item) => contactMatchesParticipant(item, participant)) : null);
    for (const candidate of [participant?.fullName, contact?.fullName]) {
      const name = readableDisplayName(candidate);
      if (name) return name;
    }
    for (const identifier of personIdentifiers(participant)) {
      const name = readableDisplayName(this.localContactNames.get(identifier));
      if (name) return name;
    }
    for (const candidate of [participant?.username, contact?.username]) {
      const name = readableDisplayName(candidate);
      if (name) return name;
    }
    return String(message.senderName || 'Unknown').trim() || 'Unknown';
  }

  async hydrateChatContext(chatID, messages) {
    let context = this.chatContexts.get(chatID);
    if (!context || context.type !== 'group') return;
    if (!context.hydrated || context.participantsHasMore) {
      try {
        const detail = await this.request(`/v1/chats/${encodeURIComponent(chatID)}?maxParticipantCount=500`);
        context = {
          ...context,
          accountID: detail.accountID || context.accountID,
          name: normalizeEmojiForPebble(resolveChatName(detail) || context.name),
          participants: detail?.participants?.items || context.participants,
          participantsHasMore: Boolean(detail?.participants?.hasMore),
          hydrated: true
        };
        this.chatContexts.set(chatID, context);
      } catch {
        context.hydrated = true;
      }
    }

    const relevantParticipants = [];
    const queries = [];
    for (const message of messages || []) {
      if (message.isSender || readableDisplayName(message.senderName)) continue;
      const participant = context.participants.find((item) =>
        !item.isSelf && message.senderID && item.id === message.senderID);
      if (participant) {
        relevantParticipants.push(participant);
        queries.push(...[participant.id, participant.email, participant.phoneNumber, participant.username].filter(Boolean));
      }
      queries.push(...[message.senderID, message.senderName].filter(Boolean));
    }
    await this.loadAccountContactPage(context.accountID);
    await this.searchAccountContacts(context.accountID, queries);

    const identifiers = relevantParticipants.flatMap(personIdentifiers);
    if (identifiers.length) {
      try {
        const details = typeof this.contactResolver.lookupDetails === 'function' ?
          await this.contactResolver.lookupDetails(identifiers) :
          {names: await this.contactResolver.lookup(identifiers)};
        for (const [identifier, name] of details.names || []) this.localContactNames.set(identifier, name);
      } catch {
        // macOS Contacts enrichment remains optional.
      }
    }
  }

  async listMessages(chatID, limit, cursor = '') {
    // The current Desktop API returns newest-first pages and advances toward older history with
    // `after`; cursors remain opaque and are never inspected here.
    const cursorQuery = cursor ? `&cursor=${encodeURIComponent(cursor)}&direction=after` : '';
    const result = await this.request(`/v1/chats/${encodeURIComponent(chatID)}/messages?limit=${limit}${cursorQuery}`);
    await this.hydrateChatContext(chatID, result.items || []);
    const items = (result.items || []).slice(0, MAX_MESSAGE_PAGE).reverse().map((message) => {
      const attachment = (message.attachments || []).map((item, index) =>
        this.rememberAttachment(message.id, item, index)).find(Boolean) || null;
      const text = htmlToText(message.text || '');
      const watch = tokenizeEmojiForWatch(text);
      return {
        id: message.id,
        sender: normalizeEmojiForPebble(this.resolveMessageSender(chatID, message)),
        isSelf: message.isSender === true,
        text,
        watchText: watch.text,
        emojiKeys: watch.keys,
        time: normalizeTime(message.timestamp),
        timestamp: message.timestamp || '',
        attachment
      };
    });
    return { items, hasMore: Boolean(result.hasMore), nextCursor: result.oldestCursor || null };
  }

  async getAttachmentPreview(attachmentID) {
    const attachment = this.attachments.get(attachmentID);
    if (!attachment) return null;
    const cached = this.previewCache.get(attachmentID);
    if (cached) {
      this.previewCache.delete(attachmentID);
      this.previewCache.set(attachmentID, cached);
      return cached;
    }
    if (this.previewPromises.has(attachmentID)) return this.previewPromises.get(attachmentID);
    const promise = this.createAttachmentPreview(attachment);
    this.previewPromises.set(attachmentID, promise);
    try {
      const preview = await promise;
      this.previewCache.set(attachmentID, preview);
      if (this.previewCache.size > MAX_PREVIEW_CACHE) this.previewCache.delete(this.previewCache.keys().next().value);
      return preview;
    } finally {
      this.previewPromises.delete(attachmentID);
    }
  }

  async createAttachmentPreview(attachment) {
    const directory = await mkdtemp(join(tmpdir(), 'beepster-preview-'));
    const inputPath = join(directory, 'source');
    const outputPath = join(directory, 'preview.bmp');
    try {
      if (attachment.sourceURL.startsWith('file://')) {
        try {
          await access(fileURLToPath(attachment.sourceURL));
        } catch (error) {
          if (error.code === 'ENOENT') {
            const missing = new Error('Photo unavailable in Beeper. Open it in Beeper or the original app.');
            missing.code = 'BEEPSTER_MEDIA_MISSING';
            throw missing;
          }
          throw error;
        }
        const preview = await this.previewCreator(fileURLToPath(attachment.sourceURL), outputPath);
        return { ...preview, kind: attachment.kind };
      }
      const response = await this.response(`/v1/assets/serve?url=${encodeURIComponent(attachment.sourceURL)}`, {
        headers: { Accept: '*/*' }
      });
      await writeFile(inputPath, Buffer.from(await response.arrayBuffer()));
      const preview = await this.previewCreator(inputPath, outputPath);
      return { ...preview, kind: attachment.kind };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  async sendReply(chatID, text) {
    const result = await this.request(`/v1/chats/${encodeURIComponent(chatID)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text })
    });
    return {
      state: 'accepted',
      pendingMessageID: result.pendingMessageID || null
    };
  }

  async archiveChat(chatID) {
    // These void endpoints may return HTTP 200 with no JSON, not only 204.
    await this.response(`/v1/chats/${encodeURIComponent(chatID)}/archive`, {
      method: 'POST',
      body: JSON.stringify({ archived: true })
    });
    return { archived: true };
  }

  async deleteMessage(chatID, messageID, forEveryone = false) {
    let context = this.chatContexts.get(chatID);
    const appleID = /^(imsg##|imessage)/i.test(chatID);
    if (!appleID && !context?.network && !context?.accountID) {
      context = await this.request(`/v1/chats/${encodeURIComponent(chatID)}`);
      if (!context?.network && !context?.accountID) {
        throw new Error('Cannot verify the messaging service for deletion');
      }
    }
    if (appleID || /imessage|apple messages/i.test(`${context?.network || ''} ${context?.accountID || ''}`)) {
      throw Object.assign(new Error('iMessage deletion is temporarily disabled. Thread archiving still works.'),
        {code:'IMESSAGE_DELETE_DISABLED'});
    }
    // Beeper's installed REST schema uses Boolean(value): the string "false"
    // becomes true (unsend). An explicitly empty value coerces to false. Never
    // omit it: the upstream default is true. A stricter future API can reject
    // this encoding safely; do not retry with a broader deletion scope.
    await this.response(`/v1/chats/${encodeURIComponent(chatID)}/messages/${encodeURIComponent(messageID)}?forEveryone=${forEveryone ? 'true' : ''}`, {
      method: 'DELETE'
    });
    return { deleted: true, forEveryone: Boolean(forEveryone) };
  }

  async getMessageStatus(chatID, messageID) {
    const message = await this.request(`/v1/chats/${encodeURIComponent(chatID)}/messages/${encodeURIComponent(messageID)}`);
    return {
      id: message.id || messageID,
      // sendStatus is optional. A successful lookup by pending ID means that
      // Beeper resolved it to a real message even when the bridge omits status.
      status: message.sendStatus?.status || 'SUCCESS',
      reason: message.sendStatus?.message || message.sendStatus?.reason || ''
    };
  }

  async findSentReply(chatID, text, sentAfter) {
    const result = await this.request(`/v1/chats/${encodeURIComponent(chatID)}/messages?limit=20`);
    const normalizedText = htmlToText(text).trim();
    const match = (result.items || []).find((message) => {
      const timestamp = new Date(message.timestamp || 0).getTime();
      return message.isSender === true && timestamp >= sentAfter &&
        htmlToText(message.text || '').trim() === normalizedText;
    });
    return match ? {id:match.id || '',status:'SUCCESS',reason:''} : null;
  }
}
