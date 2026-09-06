import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const assetDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'emoji');
const catalogBuffer = readFileSync(join(assetDirectory, 'emoji-catalog.json'));
const catalog = JSON.parse(catalogBuffer.toString('utf8'));
const atlasPNG = readFileSync(join(assetDirectory, 'emoji-atlas-24.png'));
const atlasPixels = readFileSync(join(assetDirectory, 'emoji-atlas-24.raw'));
const entriesByKey = new Map(catalog.entries.map(entry => [entry.key, entry]));
const expectedPixelCount = catalog.columns * catalog.cellSize * catalog.rows * catalog.cellSize;
if (!Array.isArray(catalog.entries) || catalog.entries.length < 1 || atlasPixels.length !== expectedPixelCount) {
  throw new Error('Bundled emoji assets are incomplete');
}
const trie = new Map();

function addSequence(value, entry) {
  let node = trie;
  for (const character of [...value]) {
    if (!node.has(character)) node.set(character, new Map());
    node = node.get(character);
  }
  node.entry = entry;
}

for (const entry of catalog.entries) {
  addSequence(entry.emoji, entry);
  const compact = entry.emoji.replaceAll('\ufe0f', '');
  if (compact !== entry.emoji) addSequence(compact, entry);
}

export function publicEmojiCatalog() {
  return catalogBuffer;
}

export function publicEmojiAtlas() {
  return atlasPNG;
}

export function emojiEntry(key) {
  return entriesByKey.get(String(key || '')) || null;
}

export function tokenizeEmojiForWatch(value) {
  const characters = [...String(value || '')];
  const keys = [];
  let output = '';
  for (let index = 0; index < characters.length;) {
    let node = trie;
    let cursor = index;
    let match = null;
    let matchEnd = index;
    while (cursor < characters.length && node.has(characters[cursor])) {
      node = node.get(characters[cursor]);
      cursor++;
      if (node.entry) {
        match = node.entry;
        matchEnd = cursor;
      }
    }
    if (!match) {
      output += characters[index++];
      continue;
    }
    output += `\u001e${match.key}\u001f`;
    if (!keys.includes(match.key)) keys.push(match.key);
    index = matchEnd;
  }
  return { text: output, keys };
}

export function renderEmojiAtlas(requestedKeys, requestedSize = 20, requestedColumns = 5) {
  const size = Math.max(12, Math.min(24, Number.parseInt(requestedSize, 10) || 20));
  const columns = Math.max(1, Math.min(8, Number.parseInt(requestedColumns, 10) || 5));
  const keys = [];
  for (const value of Array.isArray(requestedKeys) ? requestedKeys : []) {
    const key = String(value || '').toLowerCase();
    if (!/^[0-9a-f-]{1,100}$/.test(key) || !entriesByKey.has(key)) continue;
    keys.push(key);
    if (keys.length >= 24) break;
  }
  const rows = Math.max(1, Math.ceil(keys.length / columns));
  const width = columns * size;
  const height = rows * size;
  const pixels = Buffer.alloc(width * height);
  const sourceWidth = catalog.columns * catalog.cellSize;
  for (let slot = 0; slot < keys.length; slot++) {
    const entry = entriesByKey.get(keys[slot]);
    const sourceCellX = (entry.id % catalog.columns) * catalog.cellSize;
    const sourceCellY = Math.floor(entry.id / catalog.columns) * catalog.cellSize;
    const targetCellX = (slot % columns) * size;
    const targetCellY = Math.floor(slot / columns) * size;
    for (let y = 0; y < size; y++) {
      const sourceY = sourceCellY + Math.floor(y * catalog.cellSize / size);
      for (let x = 0; x < size; x++) {
        const sourceX = sourceCellX + Math.floor(x * catalog.cellSize / size);
        pixels[(targetCellY + y) * width + targetCellX + x] = atlasPixels[sourceY * sourceWidth + sourceX];
      }
    }
  }
  return {
    width,
    height,
    pixels,
    entries: keys.map(key => {
      const { id, emoji, label, group, subgroup } = entriesByKey.get(key);
      return { id, key, emoji, label, group, subgroup };
    })
  };
}
