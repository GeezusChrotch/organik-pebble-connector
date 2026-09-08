import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

test('completed right swipe navigates back only from the chat, without dispatching actions',()=>{
 const source=readFileSync(new URL('../../src/c/main.c',import.meta.url),'utf8');
 const start=source.indexOf('static void message_touch_back(');
 const body=source.slice(start,source.indexOf('#endif',start));
 assert.match(source,/swipe_recognizer_create\(message_touch_back, NULL, SwipeDirection_Right\)/);
 assert.match(source,/pan_recognizer_create\(message_touch_pan, NULL, PanAxis_Vertical\)/);
 assert.doesNotMatch(body,/perform_button_action|send_quick_reply|request_command|thread_dictate/);
 const dir=mkdtempSync(join(tmpdir(),'beepster-swipe-back-'));
 try{
  writeFileSync(join(dir,'test.c'),`
#include <stdbool.h>
#include <assert.h>
typedef int Recognizer;
typedef enum {RecognizerEvent_Started,RecognizerEvent_Updated,RecognizerEvent_Completed,RecognizerEvent_Cancelled} RecognizerEvent;
enum {SwipeDirection_Right,SwipeDirection_Left,SwipeDirection_Up,SwipeDirection_Down};
static void *s_message_window=(void*)1,*top=(void*)1;
static bool enabled=true;static int direction=SwipeDirection_Right,pops;
static bool touch_service_is_enabled(void){return enabled;}
static void *window_stack_get_top_window(void){return top;}
static int swipe_recognizer_get_direction(const Recognizer*r){return direction;}
static void window_stack_pop(bool animated){assert(animated);pops++;}
${body}
int main(void){
 message_touch_back(0,RecognizerEvent_Started);message_touch_back(0,RecognizerEvent_Updated);message_touch_back(0,RecognizerEvent_Cancelled);assert(pops==0);
 for(direction=SwipeDirection_Left;direction<=SwipeDirection_Down;direction++)message_touch_back(0,RecognizerEvent_Completed);
 assert(pops==0);direction=SwipeDirection_Right;
 enabled=false;message_touch_back(0,RecognizerEvent_Completed);enabled=true;
 top=(void*)2;message_touch_back(0,RecognizerEvent_Completed);assert(pops==0);
 top=s_message_window;message_touch_back(0,RecognizerEvent_Completed);assert(pops==1);
}
`);
  execFileSync('cc',[join(dir,'test.c'),'-o',join(dir,'test')]);execFileSync(join(dir,'test'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
