const NAMED_ENTITIES = {
  amp: '&',
  apos: "'",
  gt: '>',
  hellip: '…',
  lt: '<',
  mdash: '—',
  nbsp: ' ',
  ndash: '–',
  quot: '"'
};

function decodeEntity(match, entity) {
  if (entity[0] !== '#') return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  const hexadecimal = entity[1]?.toLowerCase() === 'x';
  const value = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
  if (!Number.isInteger(value) || value < 1 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) return '�';
  return String.fromCodePoint(value);
}

function imageAlt(tag) {
  const match = tag.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  return match ? (match[1] ?? match[2] ?? '') : '';
}

// Display-only formatting: never use this to modify outgoing messages or match
// delivery confirmations. Do not fetch URLs to guess titles (privacy/SSRF).
export function messageDisplayText(value, hideLinks = false) {
  let text = String(value || '').replace(/<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi,
    (_, label) => hideLinks ? '' : label);
  text = htmlToText(text);
  text = text.replace(/\[([^\]\n]*)\]\((?:https?:\/\/|www\.)[^\s)]*(?:\s+"[^"]*")?\)/gi,
    (_, label) => hideLinks ? '' : label);
  text = text.replace(/\b(?:https?:\/\/|www\.)[^\s<>]+/gi, raw => {
    const trailing = raw.match(/[.,!?;:)\]}]+$/)?.[0] || '';
    const url = trailing ? raw.slice(0, -trailing.length) : raw;
    if (hideLinks) return trailing;
    try { return new URL(/^www\./i.test(url) ? `https://${url}` : url).hostname.replace(/^www\./i, '') + trailing; }
    catch { return '[link]' + trailing; }
  });
  return text.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function htmlToText(value) {
  let text = String(value || '').replace(/\r\n?/g, '\n');
  if (!/<\/?[a-z][^>]*>|&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]+);/i.test(text)) return text;
  text = text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<img\b[^>]*>/gi, imageAlt)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<blockquote\b[^>]*>/gi, '\n> ')
    .replace(/<\/blockquote\s*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/(?:p|div|li|ul|ol|h[1-6])\s*>/gi, '\n')
    .replace(/<(?:p|div|ul|ol|h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]+);/gi, decodeEntity)
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text;
}
