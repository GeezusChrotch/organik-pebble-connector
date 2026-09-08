import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

test('approval controls have distinct focus and bypass message expansion and scrolling', () => {
  const source = readFileSync(new URL('../../src/c/main.c', import.meta.url), 'utf8');
  const draw = source.slice(source.indexOf('static void draw_message('), source.indexOf('static void retry_messages('));
  assert.match(draw, /selected \? GColorBlack : GColorWhite/);
  assert.match(draw, /selected \? GColorWhite : GColorBlack/);
  assert.match(draw, /if \(selected\) graphics_draw_text\(ctx, "> Hold center to choose"/);
  assert.match(source, /if \(message->is_approval > 1\) return 58;/);
  const selection = source.slice(source.indexOf('static void message_selection_changed('), source.indexOf('static int32_t message_content_height('));
  assert.ok(selection.indexOf('message->is_approval > 1') < selection.indexOf('request_selected_content'));
  const navStart = source.indexOf('static void message_move_selection(int delta) {');
  const navigation = source.slice(navStart, source.indexOf('static void install_message_clicks(', navStart));
  const branch = navigation.slice(navigation.indexOf('  if (message->is_approval > 1) {'), navigation.indexOf('  message_scroll_pixels('));
  const directory = mkdtempSync(join(tmpdir(), 'beepster-choice-nav-'));
  try {
    writeFileSync(join(directory, 'test.c'), `
#include <assert.h>
#include <stddef.h>
#include <stdint.h>
typedef struct { int section, row; } MenuIndex;
typedef struct { int is_approval; } Message;
static int s_message_count = 4, selected, dirty;
static int s_message_anchor, s_message_offset;
static int s_message_follow_newest;
static void message_view_refresh(void) { dirty++; }
static void *s_message_menu;
#define MenuRowAlignTop 0
#define false 0
static void menu_layer_set_selected_index(void *m, MenuIndex i, int a, int b) { selected = i.row; }
static void *menu_layer_get_layer(void *m) { return m; }
static void layer_mark_dirty(void *m) { dirty++; }
static void move(int row, int delta) { Message choice = {2}; Message *message = &choice;
${branch}
}
int main(void) {
selected = 1; move(selected, 1); assert(selected == 2); // Approve -> Deny
move(selected, 1); assert(selected == 3); // Deny -> Always
move(selected, -1); assert(selected == 2);
move(selected, -1); move(selected, -1); assert(selected == 0); // Back to description
move(3, 1); assert(selected == 0 && dirty == 5); // no wraparound
}
`);
    execFileSync('cc', [join(directory, 'test.c'), '-o', join(directory, 'test')]);
    execFileSync(join(directory, 'test'));
  } finally { rmSync(directory, {recursive:true, force:true}); }
});

test('approval status window does not occupy the outbox with emoji loading', () => {
  const source = readFileSync(new URL('../../src/c/main.c', import.meta.url), 'utf8');
  const start = source.indexOf('static void reply_load(Window *window) {');
  const body = source.slice(start, source.indexOf('static void reply_unload', start));
  assert.match(body, /if \(!s_reply_approval_id\[0\]\) \(void\)request_command\("load_emoji_replies", NULL\);/);
  assert.equal((body.match(/request_command\(/g) || []).length, 1);
});

test('actual watch button dispatcher opens approvals before custom bindings', () => {
  const source = readFileSync(new URL('../../src/c/main.c', import.meta.url), 'utf8');
  const start = source.indexOf('static void configured_button_click(ClickRecognizerRef recognizer, bool long_press, bool message_view) {');
  assert.ok(start >= 0);
  const end = source.indexOf('\n}\n', start) + 3;
  const directory = mkdtempSync(join(tmpdir(), 'beepster-buttons-'));
  try {
    writeFileSync(join(directory, 'test.c'), `
#include <stdbool.h>
#include <stddef.h>
#include <assert.h>
#include <stdint.h>
typedef int ClickRecognizerRef;
typedef int ButtonId;
typedef int ButtonAction;
#define BUTTON_ID_SELECT 1
#define BUTTON_ID_UP 0
#define BUTTON_ID_DOWN 2
#define BUTTON_ID_BACK 3
#define BUTTON_BINDING_COUNT 14
#define BUTTON_ACTION_MAIN_TOP 9
static int s_button_actions[14];
static int last_action;
static bool approval;
static int menus, actions;
static int scrolls;
static void message_move_selection(int delta) { scrolls += delta; }
typedef struct { int row; } MenuIndex;
static void *s_message_menu;
static struct { uint8_t is_approval; } s_messages[1];
static int decisions, last_decision;
static MenuIndex menu_layer_get_selected_index(void *m) { return (MenuIndex){0}; }
static void send_quick_reply_to_phone(int i, bool create) { decisions++; last_decision = i; }
static ButtonId click_recognizer_get_button_id(int button) { return button; }
static bool selected_message_is_approval(void) { return approval; }
static void thread_quick_replies(void *a, void *b) { menus++; }
${source.slice(source.indexOf("static int binding_slot("),source.indexOf("static MenuIndex selected_chat_row("))}
static void perform_button_action(int a, bool m) { actions++; last_action=a; }
${source.slice(start, end)}
int main(void) {
  approval = true;
  configured_button_click(1, false, true);
  configured_button_click(1, true, true);
  assert(menus == 0 && actions == 0 && decisions == 0);
  configured_button_click(0, false, true);
  configured_button_click(2, true, true);
  configured_button_click(1, false, false);
  approval = false;
  configured_button_click(1, false, true);
  assert(menus == 0 && actions == 2 && scrolls == 0);
  approval = true;
  s_messages[0].is_approval = 2;
  configured_button_click(1, false, true);
  assert(decisions == 0);
  configured_button_click(0, false, true);
  assert(scrolls == -1 && decisions == 0);
  configured_button_click(1, true, true);
  assert(decisions == 1 && last_decision == 0);
  s_messages[0].is_approval = 3;
  configured_button_click(1, true, true);
  assert(decisions == 2 && last_decision == 1);
  s_messages[0].is_approval = 4;
  configured_button_click(1, true, true);
  assert(decisions == 2); // Always opens confirmation, never sends on first click.
  int previous=actions;s_button_actions[12]=42;s_button_actions[13]=43;
  configured_button_click(BUTTON_ID_BACK,false,true);assert(actions==previous&&decisions==2);
  approval=false;configured_button_click(BUTTON_ID_BACK,false,true);assert(last_action==43&&actions==previous+1);
  configured_button_click(BUTTON_ID_BACK,false,false);assert(last_action==42&&actions==previous+2);
}
`);
    execFileSync('cc', [join(directory, 'test.c'), '-o', join(directory, 'test')]);
    execFileSync(join(directory, 'test'));
  } finally {
    rmSync(directory, {recursive:true, force:true});
  }
});
