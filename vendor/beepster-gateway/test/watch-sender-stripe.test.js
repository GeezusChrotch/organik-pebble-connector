import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('sender stripe is six pixels wide without reducing text or icon space',()=>{
  const source=readFileSync(new URL('../../src/c/main.c',import.meta.url),'utf8');
  assert.match(source,/graphics_fill_rect\(ctx, GRect\(0, 0, 6, bounds.size.h\), 0, GCornerNone\)/);
  assert.match(source,/GRect\(8, text_y, bounds.size.w - 16, text_height\)/);
  assert.match(source,/GRect\(7, 1 - content_scroll \+ \(sender_height - 18\) \/ 2, 18, 18\)/);
  assert.match(source,/graphics_context_set_fill_color\(ctx, participant_color\);\s*\/\/[^\n]*\n\s*graphics_fill_rect\(ctx, GRect\(0, 0, 6,/);
});
