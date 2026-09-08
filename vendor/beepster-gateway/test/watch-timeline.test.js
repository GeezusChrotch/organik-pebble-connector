import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

test('timeline crosses message boundaries by pixels and follows finger movement before release',()=>{
 const source=readFileSync(new URL('../../src/c/main.c',import.meta.url),'utf8');
 const move=source.slice(source.indexOf('static void timeline_move('),source.indexOf('static void message_cell_draw('));
 const pan=source.slice(source.indexOf('static void message_touch_pan('),source.indexOf('static void message_touch_tap('));
 const row=source.slice(source.indexOf('static int16_t message_row_height('),source.indexOf('static void draw_message('));
 assert.doesNotMatch(row,/viewport_height/);
 assert.match(source,/int32_t content_scroll = s_message_cell_scroll;/);
 assert.doesNotMatch(source,/swipe_recognizer_create\(message_touch_swipe/);
 assert.doesNotMatch(source,/s_scroll_lines|PERSIST_SCROLL_LINES/);
 assert.match(source,/message_scroll_pixels\(delta \* inline_line_height\(theme_font\(\)\)\)/);
 const dir=mkdtempSync(join(tmpdir(),'beepster-timeline-'));
 try {
  writeFileSync(join(dir,'test.c'),`
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include <assert.h>
typedef int Recognizer;
typedef enum {RecognizerEvent_Started,RecognizerEvent_Updated,RecognizerEvent_Completed,RecognizerEvent_Cancelled} RecognizerEvent;
typedef struct {int x,y;} GPoint;
static int s_message_count=4,s_message_anchor;
static int32_t s_message_offset;
static bool s_message_dragging,s_message_detail_deferred,s_expanded_message_loaded;
static char *s_detail_text;
static int s_expanded_text_height;
static void message_view_refresh(void){}
static int heights[]={2100,120,58,800};
static int32_t timeline_height(int row){return heights[row];}
${move}
static bool enabled=true;
static bool touch_service_is_enabled(void){return enabled;}
static int finger_y,calls;
static GPoint pan_recognizer_get_delta_since_start(const Recognizer*r){return (GPoint){0,finger_y};}
static void message_scroll_pixels(int32_t delta){calls++;timeline_move(delta);}
${pan}
int main(void){
 timeline_move(2090);assert(s_message_anchor==0&&s_message_offset==2090);
 timeline_move(37);assert(s_message_anchor==1&&s_message_offset==27);
 timeline_move(-37);assert(s_message_anchor==0&&s_message_offset==2090);
 timeline_move(-9000);assert(s_message_anchor==0&&s_message_offset==0);
 /* Height growth does not shift an anchor inside the message. */
 timeline_move(100);heights[0]=5000;timeline_move(0);assert(s_message_offset==100);
 finger_y=0;message_touch_pan(0,RecognizerEvent_Started);
 finger_y=-17;message_touch_pan(0,RecognizerEvent_Updated);assert(s_message_offset==117);
 finger_y=-63;message_touch_pan(0,RecognizerEvent_Updated);assert(s_message_offset==163);
 finger_y=-40;message_touch_pan(0,RecognizerEvent_Updated);assert(s_message_offset==140);
 message_touch_pan(0,RecognizerEvent_Completed);assert(s_message_offset==140);
 int before=calls;message_touch_pan(0,RecognizerEvent_Cancelled);assert(calls==before);
 enabled=false;finger_y=-100;message_touch_pan(0,RecognizerEvent_Updated);assert(calls==before);
 s_message_count=0;timeline_move(100);assert(s_message_anchor==0&&s_message_offset==0);
}
`);
  execFileSync('cc',['-fsanitize=address',join(dir,'test.c'),'-o',join(dir,'test')]);execFileSync(join(dir,'test'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('physical Down can focus approval choices when the viewport is already at its bottom',()=>{
 const source=readFileSync(new URL('../../src/c/main.c',import.meta.url),'utf8');
 const start=source.indexOf('static void message_move_selection(int delta) {');
 const body=source.slice(start,source.indexOf('static void install_message_clicks(',start));
 const dir=mkdtempSync(join(tmpdir(),'beepster-bottom-focus-'));
 try{
  writeFileSync(join(dir,'test.c'),`
#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include <assert.h>
typedef struct {int section,row;} MenuIndex;
typedef struct {int is_approval;} Message;
static Message s_messages[]={{1},{2},{3},{4}};
static int s_message_count=4,s_message_anchor,s_message_offset,selected;
static bool s_message_follow_newest;
static void *s_message_menu=(void*)1;
#define MenuRowAlignTop 0
static MenuIndex menu_layer_get_selected_index(void*m){return (MenuIndex){0,selected};}
static void menu_layer_set_selected_index(void*m,MenuIndex i,int a,bool b){selected=i.row;}
static void message_view_refresh(void){}
static int theme_font(void){return 0;}
static int inline_line_height(int font){return 24;}
static void message_scroll_pixels(int32_t delta){} /* viewport at its limit */
static void message_focus_row(int row){if(row>=0&&row<s_message_count)selected=row;}
${body}
int main(void){
 message_move_selection(1);assert(selected==1);
 message_move_selection(1);assert(selected==2);
 message_move_selection(1);assert(selected==3);
 message_move_selection(1);assert(selected==3);
 message_move_selection(-1);assert(selected==2);
 message_move_selection(-1);message_move_selection(-1);assert(selected==0);
}
`);
  execFileSync('cc',[join(dir,'test.c'),'-o',join(dir,'test')]);execFileSync(join(dir,'test'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
