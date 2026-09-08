import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

test('view sync retries busy and failed sends, always using the current window', () => {
  const source = readFileSync(new URL('../../src/c/main.c', import.meta.url), 'utf8');
  const start = source.indexOf('static void sync_visible_view(');
  const functions = source.slice(start, source.indexOf('static void main_unload(', start));
  assert.match(source, /app_message_register_outbox_failed\(view_outbox_failed\)/);
  for (const name of ['message_appear', 'message_disappear']) {
    assert.match(source, new RegExp('static void ' + name + '\\(Window \\*window\\) \\{\\s+schedule_view_sync\\(\\);'));
  }
  const dir = mkdtempSync(join(tmpdir(), 'beepster-view-sync-'));
  try {
    writeFileSync(join(dir, 'test.c'), `
#include <stdbool.h>
#include <assert.h>
#include <string.h>
#include <stddef.h>
typedef int Window; typedef int AppTimer; typedef int AppMessageResult;
typedef union {char *cstring;} Value;
typedef struct {int type; Value *value;} Tuple;
typedef Tuple DictionaryIterator;
enum {MESSAGE_KEY_COMMAND, TUPLE_CSTRING};
static Window main_window, message_window, reply_window;
static Window *s_main_window=&main_window, *s_message_window=&message_window, *top;
static AppTimer *s_view_sync_timer;
static char s_active_chat_id[]="agent-chat";
static bool busy; static char sent[40]; static int delay;
static void (*pending)(void *);
static Window *window_stack_get_top_window(void){return top;}
static bool request_command(const char *command,const char *chat){
 if(busy)return false;strcpy(sent,command);
 if(strcmp(command,"chat_view_open")==0)assert(strcmp(chat,"agent-chat")==0);
 return true;
}
static AppTimer *app_timer_register(int ms,void (*callback)(void*),void *ctx){delay=ms;pending=callback;return (AppTimer*)1;}
static void app_timer_cancel(AppTimer *timer){pending=NULL;}
static Tuple *dict_find(DictionaryIterator *it,int key){return it;}
${functions}
static void fire(void){void (*fn)(void*)=pending;pending=NULL;assert(fn);fn(NULL);}
int main(void){
 top=s_message_window;busy=true;main_disappear(s_main_window);schedule_view_sync();
 fire();assert(delay==500&&pending);busy=false;fire();assert(strcmp(sent,"chat_view_open")==0);
 top=&reply_window;schedule_view_sync();fire();assert(strcmp(sent,"views_closed")==0);
 top=s_message_window;schedule_view_sync();fire();assert(strcmp(sent,"chat_view_open")==0);
 Value value={.cstring="chat_view_open"};Tuple tuple={TUPLE_CSTRING,&value};
 view_outbox_failed(&tuple,1,NULL);assert(pending);
 top=s_main_window;fire();assert(strcmp(sent,"thread_view_open")==0);
 value.cstring="send_reply";view_outbox_failed(&tuple,1,NULL);assert(!pending);
 top=s_message_window;busy=true;schedule_view_sync();fire();
 top=s_main_window;busy=false;fire();assert(strcmp(sent,"thread_view_open")==0);
 return 0;
}
`);
    execFileSync('cc', [join(dir, 'test.c'), '-o', join(dir, 'test')]);
    execFileSync(join(dir, 'test'));
  } finally {
    rmSync(dir, {recursive:true, force:true});
  }
});
