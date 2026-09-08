import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

test('message batches hydrate unchanged selections and do not duplicate changed-selection requests', () => {
  const source = readFileSync(new URL('../../src/c/main.c', import.meta.url), 'utf8');
  const start = source.indexOf('if (strcmp(command->value->cstring, "messages_ready") == 0)');
  const end = source.indexOf('    cancel_load_watchdog();', start);
  const block = source.slice(source.indexOf('    if (s_message_menu)', start), end);
  assert.ok(block.includes('message_selection_changed(s_message_menu, target, target, NULL)'));
  const dir = mkdtempSync(join(tmpdir(), 'beepster-hydration-'));
  try {
    writeFileSync(join(dir, 'test.c'), `
#include <assert.h>
#include <stdbool.h>
#include <stddef.h>
#include <string.h>
typedef struct { int section, row; } MenuIndex;
typedef int MenuRowAlign;
enum { MenuRowAlignTop, MenuRowAlignBottom };
typedef struct { int int32; char *cstring; } Value;
typedef struct { Value *value; } Tuple;
static void *s_message_menu = (void*)1;
static struct { int is_approval; } s_messages[8];
static int current_row, expanded_row = -1, requests, clicks;
static void menu_layer_reload_data(void *m) {}
static void message_view_refresh(void) {}
static int s_message_anchor, s_message_offset;
static bool s_message_follow_newest;
static void message_selection_changed(void *m, MenuIndex next, MenuIndex old, void *ctx) {
  if (expanded_row != next.row) { expanded_row = next.row; requests++; }
}
static void menu_layer_set_selected_index(void *m, MenuIndex target, int align, bool animated) {
  if (current_row != target.row) {
    MenuIndex old = {0, current_row}; current_row = target.row;
    message_selection_changed(m, target, old, NULL);
  }
}
static void install_message_clicks(void) { clicks++; }
static void ready(int count, Tuple *selected, Tuple *mode) { ${block} }
int main(void) {
  current_row = 0;
  ready(1, NULL, NULL); assert(expanded_row == 0 && requests == 1);
  expanded_row = -1; /* messages_start resets full text but not SDK selection */
  ready(1, NULL, NULL); assert(expanded_row == 0 && requests == 2);
  expanded_row = -1;
  ready(3, NULL, NULL); assert(expanded_row == 2 && requests == 3);
  ready(3, NULL, NULL); assert(requests == 3); /* no duplicate full-text request */
  expanded_row = -1;
  ready(3, NULL, NULL); assert(expanded_row == 2 && requests == 4);
  ready(0, NULL, NULL); assert(requests == 4 && clicks == 5);
}
`);
    execFileSync('cc', [join(dir, 'test.c'), '-o', join(dir, 'test')]);
    execFileSync(join(dir, 'test'));
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
