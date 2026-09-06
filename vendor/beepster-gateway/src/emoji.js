const SUPPORTED = new Set([
  0x231A, 0x263A, 0x2620, 0x26A7, 0x2705, 0x270B, 0x270C, 0x2728, 0x274E,
  0x2757, 0x2763, 0x2764, 0x2B50, 0x1F319, 0x1F31F, 0x1F337, 0x1F338,
  0x1F33A, 0x1F340, 0x1F37A, 0x1F37B, 0x1F389, 0x1F3B6, 0x1F3F3, 0x1F425,
  0x1F440, 0x1F44D, 0x1F44E, 0x1F480, 0x1F493, 0x1F494, 0x1F495, 0x1F496,
  0x1F497, 0x1F498, 0x1F499, 0x1F49A, 0x1F49B, 0x1F49C, 0x1F49D, 0x1F49E,
  0x1F49F, 0x1F4A1, 0x1F4A3, 0x1F4A5, 0x1F4A9, 0x1F4AF, 0x1F5A4,
  0x1F643, 0x1F644, 0x1F64F, 0x1F917, 0x1F918, 0x1F91D, 0x1F923, 0x1F924,
  0x1F929, 0x1F92A, 0x1F92C, 0x1F92E, 0x1F970, 0x1F97A
]);

for (let codePoint = 0x1F600; codePoint <= 0x1F637; codePoint++) {
  SUPPORTED.add(codePoint);
}

const FALLBACKS = new Map([
  [0x1F914, '[thinking]'],
  [0x1F525, '[fire]'],
  [0x1F382, '[cake]'],
  [0x1F388, '[balloon]'],
  [0x1F680, '[rocket]'],
  [0x1F697, '[car]'],
  [0x1F436, '[dog]'],
  [0x1F431, '[cat]'],
  [0x1F44F, '[applause]'],
  [0x1F64C, '[celebration]'],
  [0x1F926, '[facepalm]'],
  [0x1FAF6, '[heart hands]']
]);

function isEmoji(codePoint, character) {
  if (codePoint >= 0x1F000 && codePoint <= 0x1FAFF) return true;
  if (codePoint >= 0x2600 && codePoint <= 0x27BF) {
    return /\p{Extended_Pictographic}/u.test(character);
  }
  return false;
}

export function normalizeEmojiForPebble(value) {
  const text = String(value || '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u2022\u00B7]/g, '*')
    .replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, '[flag]')
    .replace(/\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)+/gu, '[emoji]')
    .replace(/\uFE0F/g, '')
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '')
    .replace(/\u200D/g, '');

  let output = '';
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    if (!isEmoji(codePoint, character) || SUPPORTED.has(codePoint)) {
      output += character;
      continue;
    }
    output += FALLBACKS.get(codePoint) || '[emoji]';
  }
  return output;
}
