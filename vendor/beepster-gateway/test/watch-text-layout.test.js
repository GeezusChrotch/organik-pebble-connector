import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('watch message previews measure whole lines and never draw wrapped emoji/text below the body', () => {
  const source = readFileSync(new URL('../../src/c/main.c', import.meta.url), 'utf8');
  // Execute the production C layout code with deterministic font metrics and a
  // recording graphics backend. A wrap on the last visible line used to paint
  // into the timestamp/next-row area before the next loop checked the height.
  const layout = source.slice(source.indexOf('static int inline_text_width('),
    source.indexOf('static void persist_current_theme('));
  const dir = mkdtempSync(join(tmpdir(), 'beepster-layout-'));
  try {
    writeFileSync(join(dir, 'test.c'), `
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <string.h>
typedef int GFont;
typedef int GContext;
typedef struct { int16_t w, h; } GSize;
typedef struct { int16_t x, y; } GPoint;
typedef struct { GPoint origin; GSize size; } GRect;
#define GRect(x,y,w,h) ((GRect){{x,y},{w,h}})
#define GTextOverflowModeFill 0
#define GTextOverflowModeWordWrap 1
#define GTextAlignmentLeft 0
#define GCompOpSet 0
#define CHAT_EMOJI_SIZE 18
#define CHAT_EMOJI_COUNT 15
#define EMOJI_MARKER 0x1d
static struct { int muted; } s_theme;
static int s_chat_emoji_count = 1;
static void *s_chat_emoji_icons[15] = {(void *)1};
static int font_height = 23, draws, bottom_limit;
static GFont font_for_text(const char *text) { return font_height; }
static GFont theme_font(void) { return font_height; }
static GFont gothic_font(bool bold) { return font_height + 1; }
static bool has_non_ascii(const char *text) {
  for (; *text; text++) if ((unsigned char)*text >= 128) return true;
  return false;
}
static bool has_inline_emoji(const char *text) { return strchr(text, 0x1d) != 0; }
static GSize graphics_text_layout_get_content_size(const char *text, GFont font,
    GRect rect, int mode, int align) {
  int lines = 1, width = 0, max_width = 0;
  for (; *text; text++) {
    if (*text == '\\n') { lines++; width = 0; }
    else { width += 5; if (width > max_width) max_width = width; }
  }
  return (GSize){max_width, lines * font};
}
static void record(GRect rect) {
  assert(rect.origin.y + rect.size.h <= bottom_limit);
  draws++;
}
static void graphics_draw_text(GContext *ctx, const char *text, GFont font,
    GRect rect, int mode, int align, void *attrs) {
  assert(font == (has_non_ascii(text) ? gothic_font(false) : theme_font()));
  record(rect);
}
static void graphics_draw_bitmap_in_rect(GContext *ctx, void *bitmap, GRect rect) { record(rect); }
static void graphics_draw_round_rect(GContext *ctx, GRect rect, int radius) { record(rect); }
static void graphics_context_set_compositing_mode(GContext *ctx, int mode) {}
static void graphics_context_set_stroke_color(GContext *ctx, int color) {}
${layout}
static void check(const char *text, int width, int height, int origin, int expected) {
  GContext ctx = 0;
  draws = 0;
  bottom_limit = origin + height;
  layout_inline_emoji_text(&ctx, text, font_height, GRect(8, origin, width, height), true);
  assert(draws == expected);
  assert(layout_inline_emoji_text(0, text, font_height, GRect(0,0,width,30000), false) > height);
}
int main(void) {
  GContext ctx = 0;
  for (font_height = 14; font_height <= 38; font_height += 4) {
    assert(message_preview_height("body") == 3 * inline_line_height(font_height));
    assert(message_preview_height("\\035A\\035") == 3 * inline_line_height(font_height));
    int h = inline_line_height(font_height);
    // Word, emoji, and overlong-word wraps all cross the last visible line.
    check("aaaa bbbb", 25, h, 0, 1);
    check("aaaa\\035A\\035", 25, h, 0, 1);
    check("abcdefgh", 15, h, 0, 3);
    // Three-line preview and negative origin used when scrolling a long body.
    check("aaaa\\ncccc\\neeee ffff", 25, 3*h, 0, 3);
    check("aaaa bbbb", 25, h, -h/2, 1);
    bottom_limit = h;
    draws = 0;
    draw_inline_token(&ctx, "don’t", theme_font(), GRect(0, 0, 100, h));
    assert(draws == 5);
  }
  return 0;
}
`);
    execFileSync('cc', ['-std=c99', join(dir, 'test.c'), '-o', join(dir, 'test')]);
    assert.doesNotThrow(() => execFileSync(join(dir, 'test')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
