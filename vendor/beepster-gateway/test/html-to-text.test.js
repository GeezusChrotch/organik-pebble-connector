import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlToText, messageDisplayText } from '../src/html-to-text.js';

test('watch links retain names without URL paths or tracking parameters', () => {
  assert.equal(messageDisplayText('See <a href="https://example.com/tracker"><b>Our guide</b></a> and [News](https://news.example/story).'), 'See Our guide and News.');
  assert.equal(messageDisplayText('Visit https://www.example.com/long/path?token=private, then www.other.example/page!'), 'Visit example.com, then other.example!');
  assert.equal(messageDisplayText('See <a href="https://example.com"><span>https://example.com/long</span></a>.'), 'See example.com.');
});

test('hide links removes labels and URLs but preserves surrounding text and emoji', () => {
  assert.equal(messageDisplayText('Hello 😂 <a href="https://example.com">Our guide</a>\n[News](https://news.example/story)\nGoodbye', true), 'Hello 😂\n\nGoodbye');
  assert.equal(messageDisplayText('Look https://example.com/a and continue', true), 'Look and continue');
  assert.equal(messageDisplayText('A normal message without links', true), 'A normal message without links');
  assert.equal(messageDisplayText('<a href="https://example.com">View post</a>', true), '');
  assert.equal(htmlToText('https://example.com/a'), 'https://example.com/a');
});

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
