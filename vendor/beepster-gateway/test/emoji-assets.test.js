import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emojiEntry,
  publicEmojiCatalog,
  renderEmojiAtlas,
  tokenizeEmojiForWatch
} from '../src/emoji-assets.js';

test('the bundled catalog covers the complete current Unicode emoji set', () => {
  const catalog = JSON.parse(publicEmojiCatalog().toString('utf8'));
  assert.equal(catalog.source, 'Twemoji and Unicode Emoji 17.0');
  assert.equal(catalog.cellSize, 24);
  assert.ok(catalog.entries.length >= 3900);
  assert.equal(emojiEntry('1f602').emoji, '😂');
  assert.equal(emojiEntry('1f468-200d-1f469-200d-1f467').emoji, '👨‍👩‍👧');
});

test('watch tokenization preserves text and recognizes sequences, variants, and skin tones', () => {
  const result = tokenizeEmojiForWatch('Hi 😂 👨‍👩‍👧 👍🏽!');
  assert.equal(result.text,
    'Hi \u001e1f602\u001f \u001e1f468-200d-1f469-200d-1f467\u001f \u001e1f44d-1f3fd\u001f!');
  assert.deepEqual(result.keys,
    ['1f602', '1f468-200d-1f469-200d-1f467', '1f44d-1f3fd']);
});

test('a requested watch atlas preserves chosen order and intentional duplicate slots', () => {
  const atlas = renderEmojiAtlas(['1f602', '2764', 'unknown', '1f602'], 18, 4);
  assert.equal(atlas.width, 72);
  assert.equal(atlas.height, 18);
  assert.equal(atlas.pixels.length, atlas.width * atlas.height);
  assert.deepEqual(atlas.entries.map(entry => entry.key), ['1f602', '2764', '1f602']);
  assert.ok(atlas.pixels.some(pixel => pixel !== 0));
});
