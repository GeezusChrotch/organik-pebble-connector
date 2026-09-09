import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
test('Notesy-style chat swipes move centered selection, page at edges and preserve focus-first taps',()=>{
 const source=readFileSync(new URL('../../src/c/main.c',import.meta.url),'utf8');
 const start=source.indexOf('static void chat_touch_swipe(');
 const code=source.slice(start,source.indexOf('#endif',start));
 const dir=mkdtempSync(join(tmpdir(),'beepster-chat-edges-'));
 try {
 writeFileSync(join(dir,'test.c'),`
#include <stdbool.h>
#include <stddef.h>
#include <assert.h>
typedef int Recognizer;typedef int ScrollLayer;typedef int MenuLayer;
typedef enum {RecognizerEvent_Started,RecognizerEvent_Updated,RecognizerEvent_Completed,RecognizerEvent_Cancelled} RecognizerEvent;
typedef struct {int x,y;} Point;
#define GPoint(x,y) ((Point){x,y})
typedef struct {int section,row;} MenuIndex;
typedef struct {struct {int w,h;} size;} Bounds;
enum {VIEW_READY,VIEW_LOADING,MenuRowAlignCenter,SwipeDirection_Up,SwipeDirection_Down};
static MenuLayer menu;static MenuLayer*s_chat_menu=&menu;
static int s_chat_state,s_chat_count=30,delta,offset,selected,opened,older,newer,tap_y;
static bool enabled=true,s_chat_page_loading=false;
static bool touch_service_is_enabled(void){return enabled;}
static ScrollLayer*menu_layer_get_scroll_layer(MenuLayer*m){return m;}
static int swipe_recognizer_get_direction(const Recognizer*r){return delta;}
static int chat_row_height(MenuLayer*m,MenuIndex*i,void*c){return 50;}
static MenuLayer*menu_layer_get_layer(MenuLayer*m){return m;}
static Bounds layer_get_bounds(MenuLayer*m){return (Bounds){{200,200}};}
static Point scroll_layer_get_content_offset(ScrollLayer*s){return GPoint(0,offset);}
static void scroll_layer_set_content_offset(ScrollLayer*s,Point p,bool a){offset=p.y;}
static void request_chat_page(bool o){if(o)older++;else newer++;s_chat_state=VIEW_LOADING;}
static Point tap_recognizer_get_tap_point(const Recognizer*r){return GPoint(0,tap_y);}
static MenuIndex menu_layer_get_selected_index(MenuLayer*m){return (MenuIndex){0,selected};}
static void menu_layer_set_selected_index(MenuLayer*m,MenuIndex i,int a,bool anim){assert(a==MenuRowAlignCenter);selected=i.row;}
static void open_chat_at_index(MenuIndex*i){opened++;}
${code}
static void swipe(int direction){delta=direction;chat_touch_swipe(0,RecognizerEvent_Started);chat_touch_swipe(0,RecognizerEvent_Updated);chat_touch_swipe(0,RecognizerEvent_Completed);}
int main(void){
 swipe(SwipeDirection_Up);assert(selected==1&&older==0&&newer==0);
 swipe(SwipeDirection_Down);assert(selected==0&&opened==0);
 selected=29;swipe(SwipeDirection_Up);assert(older==1);
 swipe(SwipeDirection_Up);assert(older==1); // loading blocks duplicate gestures
 s_chat_state=VIEW_READY;selected=0;swipe(SwipeDirection_Down);assert(newer==1);
 s_chat_state=VIEW_READY;chat_touch_swipe(0,RecognizerEvent_Cancelled);assert(newer==1);
 selected=0;tap_y=60;chat_touch_tap(0,RecognizerEvent_Completed);assert(selected==1&&opened==0);
 chat_touch_tap(0,RecognizerEvent_Completed);assert(opened==1);
 s_chat_state=VIEW_LOADING;chat_touch_tap(0,RecognizerEvent_Completed);assert(opened==1);
}
`);
 execFileSync('cc',[join(dir,'test.c'),'-o',join(dir,'test')]);execFileSync(join(dir,'test'));
 } finally {rmSync(dir,{recursive:true,force:true});}
 assert.match(source,/swipe_recognizer_create\(chat_touch_swipe, NULL, SwipeDirection_Up \| SwipeDirection_Down\)/);
 assert.doesNotMatch(source,/menu_layer_set_center_focused\(s_chat_menu, false\)/);
 assert.match(source,/selected.row == 0 && s_has_newer_chats/);
 assert.match(source,/selected.row \+ 1 >= s_chat_count && s_has_older_chats/);
});
