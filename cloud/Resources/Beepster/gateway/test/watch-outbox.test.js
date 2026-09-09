import test from 'node:test';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

test('actual quick reply sender waits before submission, never retries a submitted packet', () => {
  const source=readFileSync(new URL('../../src/c/main.c',import.meta.url),'utf8');
  const start=source.indexOf('static void send_quick_reply_to_phone(int index, bool create_request_id);');
  const end=source.indexOf('static void dictation_callback',start);
  const dir=mkdtempSync(join(tmpdir(),'beepster-outbox-'));
  try {
    writeFileSync(join(dir,'test.c'), `
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
#include <assert.h>
typedef int AppTimer;
typedef int DictionaryIterator;
typedef int AppMessageResult;
#define APP_MSG_OK 0
#define APP_MSG_BUSY 64
#define APP_LOG(...) ((void)0)
#define VIEW_REPLY_RETRYABLE 1
#define VIEW_REPLY_SENDING 2
#define MESSAGE_KEY_COMMAND 0
#define MESSAGE_KEY_CHAT_ID 1
#define MESSAGE_KEY_INDEX 2
#define MESSAGE_KEY_QUICK_REPLY_TEXT 3
#define MESSAGE_KEY_REPLY_REQUEST_ID 4
#define MESSAGE_KEY_MSG_ID 5
static AppTimer *s_quick_wait_timer;
static uint8_t s_quick_wait_attempts;
static int s_pending_quick_reply_index, s_quick_reply_count=8, s_reply_state;
static char s_active_chat_id[]="chat",s_reply_approval_chat[]="chat",s_reply_approval_id[]="ticket";
static char s_reply_request_id[4];
static char *s_quick_replies[8];
static int busy=2,submitted, scheduled,send_result;
static bool selected_message_is_approval(void){return true;}
static void cancel_reply_ack_timer(void){}
static void cancel_reply_return_timer(void){}
static void start_reply_ack_timer(void){}
static void new_reply_request_id(void){s_reply_request_id[0]='x';}
static void reply_show_status(const char *s){}
static const char *state_text(int s,bool b){return "status";}
static AppTimer *app_timer_register(int ms,void(*cb)(void*),void *p){scheduled++;return (AppTimer*)1;}
static int app_message_outbox_begin(DictionaryIterator **it){if(busy-->0)return APP_MSG_BUSY;*it=(DictionaryIterator*)1;return 0;}
static int app_message_outbox_send(void){submitted++;return send_result;}
static void dict_write_cstring(DictionaryIterator*i,int k,const char*v){}
static void dict_write_int32(DictionaryIterator*i,int k,int v){}
${source.slice(start,end)}
int main(void){
  send_quick_reply_to_phone(1,true);
  assert(submitted==0 && scheduled==1);
  quick_outbox_ready(NULL);
  assert(submitted==0 && scheduled==2);
  quick_outbox_ready(NULL);
  assert(submitted==1 && s_quick_wait_timer==NULL);
  busy=50; submitted=0; scheduled=0;
  send_quick_reply_to_phone(1,true);
  while(s_quick_wait_timer)quick_outbox_ready(NULL);
  assert(submitted==0 && scheduled==10 && s_reply_state==VIEW_REPLY_RETRYABLE);
  busy=0; scheduled=0;send_result=8;
  send_quick_reply_to_phone(1,true);
  assert(submitted==1 && scheduled==0 && s_quick_wait_timer==NULL);
}
`);
    execFileSync('cc',[join(dir,'test.c'),'-o',join(dir,'test')]);
    execFileSync(join(dir,'test'));
  } finally {rmSync(dir,{recursive:true,force:true});}
});
