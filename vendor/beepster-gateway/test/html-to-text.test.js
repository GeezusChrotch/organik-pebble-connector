import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlToText } from '../src/html-to-text.js';

test('Instagram-style markup becomes readable paragraphs without raw tags or tracking URLs', () => {
  const html = '<p><strong>Alex</strong> sent a post &amp; a note.</p><p><a href="https://tracker.invalid/private">View post</a></p><blockquote>Quoted reply</blockquote>';
  assert.equal(htmlToText(html), 'Alex sent a post & a note.\n\nView post\n\n> Quoted reply');
});

test('line breaks, image alternatives, and numeric entities are preserved as text', () => {
  assert.equal(htmlToText('<p>Hello<br>world <img src="private" alt="[photo]"> &#128640;</p>'), 'Hello\nworld [photo] 🚀');
});

test('plain comparisons and ordinary text are left unchanged', () => {
  assert.equal(htmlToText('I <3 this & that'), 'I <3 this & that');
});

test('script and style contents are discarded', () => {
  assert.equal(htmlToText('<p>Visible</p><script>private()</script><style>bad{}</style>'), 'Visible');
});
