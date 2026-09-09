import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../../src/c/main.c', import.meta.url), 'utf8');
test('chat taps only focus messages and cannot dictate or decide approvals', () => {
  const start = source.indexOf('static void message_touch_tap(');
  const body = source.slice(start, source.indexOf('static void message_touch_back(', start));
  assert.match(body, /message_focus_row\(data->index.row\)/);
  assert.match(body, /if \(s_messages\[data->index.row\].is_approval\) return;/);
  assert.doesNotMatch(body, /thread_dictate|perform_button_action|send_quick_reply|request_command/);
  assert.doesNotMatch(source, /message_touch_selected/);
});
test('main-top action leaves the chat and reloads the actual newest conversation page', () => {
  const start = source.indexOf('if (action == BUTTON_ACTION_MAIN_TOP)');
  const body = source.slice(start, source.indexOf('if (message_view)', start));
  assert.match(body, /window_stack_remove\(s_message_window, false\)/);
  assert.match(body, /request_chats\(\)/);
  const handler = source.slice(source.indexOf('static void configured_button_click('), source.indexOf('static void configured_main_click(ClickRecognizerRef recognizer, void *context) {'));
  assert.ok(handler.indexOf('s_button_actions[slot] == BUTTON_ACTION_MAIN_TOP') < handler.indexOf('message_view && selected_message_is_approval()'));
});
