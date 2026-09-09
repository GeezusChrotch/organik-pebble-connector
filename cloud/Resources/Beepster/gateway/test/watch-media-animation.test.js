import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('neighbor-body prefetch cannot deselect a loading or displayed photo/GIF',()=>{
  const source=readFileSync(new URL('../../src/c/main.c',import.meta.url),'utf8');
  const start=source.indexOf('static void message_prefetch(void *context) {');
  const code=source.slice(start,source.indexOf('static void message_focus_row(',start));
  const dir=mkdtempSync(join(tmpdir(),'beepster-media-focus-'));
  try {
    writeFileSync(join(dir,'test.c'),`
#include <stdbool.h>
#include <stddef.h>
#include <assert.h>
#define MESSAGE_VISIBLE_CELLS 1
#define VIEW_READY 1
typedef struct {int row;} MenuIndex;
typedef struct {MenuIndex index;} MessageCell;
typedef struct {bool is_approval;char *full_text;} Message;
typedef int Layer;
static Layer cell;
static Layer *s_message_cells[]={&cell};
static MessageCell data={.index={.row=1}};
static Message s_messages[2];
static void *s_message_prefetch_timer,*s_message_view=(void*)1,*s_message_menu;
static int s_message_state=VIEW_READY,s_expanded_message_index=0,changes;
static bool s_message_dragging,s_expanded_message_loaded=true;
static char s_inline_attachment_id[2]="x";
static bool layer_get_hidden(Layer*l){return false;}
static void *layer_get_data(Layer*l){return &data;}
static void message_selection_changed(void*m,MenuIndex a,MenuIndex b,void*c){changes++;s_inline_attachment_id[0]=0;}
${code}
int main(void){
 message_prefetch(NULL);assert(changes==0&&s_inline_attachment_id[0]=='x');
 s_expanded_message_loaded=false;message_prefetch(NULL);assert(changes==0);
 s_expanded_message_loaded=true;s_inline_attachment_id[0]=0;message_prefetch(NULL);assert(changes==1);
 return 0;
}
`);
    execFileSync('cc',['-fsanitize=address,undefined',join(dir,'test.c'),'-o',join(dir,'test')]);
    execFileSync(join(dir,'test'));
    const tap=source.slice(source.indexOf('static void message_touch_tap('),source.indexOf('static void message_touch_back('));
    assert.match(tap,/INLINE_MEDIA_FAILED/);assert.match(tap,/app_timer_register\(1, request_selected_content/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('production watch animation handles padded rows, bounded packets, memory fallback and pause/cleanup', () => {
  const source = readFileSync(new URL('../../src/c/main.c',import.meta.url),'utf8');
  const helpers = source.slice(source.indexOf('static void paint_media_pixels('),source.indexOf('static void clear_reply_emoji_atlas('));
  const receive = source.slice(source.indexOf('  if (strcmp(command->value->cstring, "media_start")'),source.indexOf('  if (strcmp(command->value->cstring, "media_failed")'));
  const keys = JSON.parse(readFileSync(new URL('../../package.json',import.meta.url))).pebble.messageKeys;
  const dir = mkdtempSync(join(tmpdir(),'beepster-animation-'));
  try {
    writeFileSync(join(dir,'test.c'), `
#include <assert.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
${Object.entries(keys).map(([key,value])=>`#define MESSAGE_KEY_${key} ${value}`).join('\n')}
#define MESSAGE_VISIBLE_CELLS 2
#define GBitmapFormat8Bit 0
#define INLINE_MEDIA_READY 2
#define INLINE_MEDIA_LOADING 1
#define INLINE_MEDIA_FAILED 3
#define APP_LOG_LEVEL_INFO 1
#define APP_LOG(...) ((void)0)
#define GCornerNone 0
typedef int Window; typedef int AppTimer; typedef int Layer;
typedef struct {int w,h;} GSize;
#define GSize(w,h) ((GSize){w,h})
typedef struct {int x,y;} GPoint;
typedef struct {GPoint origin;GSize size;} GRect;
#define GRect(x,y,w,h) ((GRect){{x,y},{w,h}})
typedef struct {uint8_t argb;} GColor;
typedef int GContext;
static int draw_count;
static void graphics_context_set_fill_color(GContext*c,GColor color){}
static void graphics_fill_rect(GContext*c,GRect rect,int radius,int corners){assert(rect.origin.y>=0&&rect.origin.y<10);draw_count+=rect.size.w;}
typedef struct {int width,height,stride; uint8_t *data;} GBitmap;
typedef struct {int32_t int32; uint32_t uint32; uint8_t uint8; char *cstring; uint8_t *data;} Value;
typedef struct {Value *value; size_t length;} Tuple;
static Tuple *dict_find(Tuple **iterator,int key) {return iterator[key];}
static bool fail_alloc, s_message_dragging, s_media_visible;
static size_t alloc_limit=100000;
static size_t bitmap_limit=100000;
static int refreshes, dirties, timers, timer_dummy, s_inline_media_state;
static Window window, other; static Window *s_message_window=&window,*top=&window;
static void *s_message_menu=(void*)1, *s_media_layer;
static Layer layer; static Layer *s_message_cells[MESSAGE_VISIBLE_CELLS]={&layer,&layer};
static GBitmap *s_media_bitmap;
static uint8_t *s_media_frames, s_media_frame_count=1, s_media_frame_index,s_media_kind;
static AppTimer *s_media_timer;
static size_t s_media_total,s_media_received;
static int16_t s_media_width,s_media_height,s_media_bitmap_width,s_media_bitmap_height;
static char s_inline_attachment_id[40]="attachment",s_inline_media_error[48];
static GBitmap *gbitmap_create_blank(GSize size,int format) {
  if(size.w*size.h>bitmap_limit)return NULL;
  GBitmap *b=calloc(1,sizeof(*b)); b->width=size.w;b->height=size.h;b->stride=size.w+4;
  b->data=malloc(b->height*b->stride);memset(b->data,0xee,b->height*b->stride);return b;
}
static void gbitmap_destroy(GBitmap *b) {
  for(int y=0;y<b->height;y++)for(int x=b->width;x<b->stride;x++)assert(b->data[y*b->stride+x]==0xee);
  free(b->data);free(b);
}
static void bitmap_layer_set_bitmap(void *layer,void *bitmap){}
static uint8_t *gbitmap_get_data(GBitmap *b){return b->data;}
static uint16_t gbitmap_get_bytes_per_row(GBitmap *b){return b->stride;}
static Window *window_stack_get_top_window(void){return top;}
static AppTimer *app_timer_register(int ms,void (*fn)(void *),void *ctx){assert(ms==250);timers++;return &timer_dummy;}
static void app_timer_cancel(AppTimer *timer){timers--;}
static void layer_mark_dirty(Layer *layer){dirties++;}
static void message_view_refresh(void){refreshes++;}
static void install_message_clicks(void){}
static void copy_text(char *dest,size_t size,const char *src){strncpy(dest,src,size-1);dest[size-1]=0;}
static void *task_malloc(size_t size){return fail_alloc||size>alloc_limit?NULL:malloc(size);}
#define malloc task_malloc
${helpers}
static void handle(Tuple **iterator,Tuple *command) {${receive}}
static void send(const char *cmd,int width,int height,int frames,int total,int offset,uint8_t *data,int len) {
  Value v[40]={0},cv={.cstring=(char*)cmd};Tuple tuples[40]={0},ct={.value=&cv};Tuple *iterator[40]={0};
  for(int i=0;i<40;i++){tuples[i].value=&v[i];iterator[i]=&tuples[i];}
  v[MESSAGE_KEY_ATTACHMENT_ID].cstring="attachment";
  v[MESSAGE_KEY_MEDIA_WIDTH].int32=width;v[MESSAGE_KEY_MEDIA_HEIGHT].int32=height;
  v[MESSAGE_KEY_MEDIA_FRAMES].int32=frames;v[MESSAGE_KEY_MEDIA_TOTAL].uint32=total;
  v[MESSAGE_KEY_MEDIA_OFFSET].uint32=offset;v[MESSAGE_KEY_ATTACHMENT_KIND].uint8=2;
  v[MESSAGE_KEY_MEDIA_BYTES].data=data;tuples[MESSAGE_KEY_MEDIA_BYTES].length=len;
  handle(iterator,&ct);
}
static void expect_frame(int start) {
  for(int y=0;y<2;y++)for(int x=0;x<3;x++)assert(s_media_bitmap->data[y*s_media_bitmap->stride+x]==start+y*3+x);
}
int main(void) {
  uint8_t bytes[18];for(int i=0;i<18;i++)bytes[i]=i;
  send("media_start",3,2,3,18,0,NULL,0);assert(s_media_frames);
  send("media_chunk",0,0,0,0,0,bytes,5);assert(s_media_received==5);
  send("media_chunk",0,0,0,0,0,bytes,5);assert(s_media_received==5);
  send("media_chunk",0,0,0,0,5,bytes+5,13);assert(s_media_received==18);
  send("media_end",0,0,0,0,0,NULL,0);assert(s_inline_media_state==INLINE_MEDIA_READY);expect_frame(0);assert(timers==1);
  send("media_end",0,0,0,0,0,NULL,0);assert(timers==1);
  int previous_refreshes=refreshes;s_media_visible=true;timers--;media_animation_tick(NULL);expect_frame(6);assert(refreshes==previous_refreshes);
  s_media_visible=false;timers--;media_animation_tick(NULL);expect_frame(12);
  s_media_visible=true;s_message_dragging=true;timers--;media_animation_tick(NULL);expect_frame(12);
  s_message_dragging=false;top=&other;timers--;media_animation_tick(NULL);expect_frame(12);top=&window;
  assert(inline_media_size(100).w==100&&inline_media_size(100).h==67);
  assert(inline_media_size(4).w==4&&inline_media_size(4).h==3);
  draw_inline_media(NULL,GRect(0,-2,6,4),10);assert(draw_count==12);
  clear_media();assert(!s_media_frames&&!s_media_bitmap&&!s_media_timer&&timers==0);
  alloc_limit=12;send("media_start",3,2,3,18,0,NULL,0);assert(s_media_frames&&s_media_frame_count==2);
  send("media_chunk",0,0,0,0,0,bytes,9);send("media_chunk",0,0,0,0,9,bytes+9,9);
  send("media_end",0,0,0,0,0,NULL,0);expect_frame(0);
  timers--;media_animation_tick(NULL);expect_frame(12);clear_media();alloc_limit=100000;
  fail_alloc=true;send("media_start",3,2,3,18,0,NULL,0);assert(!s_media_frames&&s_media_bitmap);
  send("media_chunk",0,0,0,0,0,bytes,18);send("media_end",0,0,0,0,0,NULL,0);expect_frame(0);assert(s_inline_media_state==INLINE_MEDIA_READY&&!s_media_timer);
  clear_media();fail_alloc=false;
  bitmap_limit=4;send("media_start",3,2,1,6,0,NULL,0);
  assert(s_media_bitmap&&s_media_bitmap_width==2&&s_media_bitmap_height==1);
  send("media_chunk",0,0,0,0,0,bytes,1);send("media_chunk",0,0,0,0,1,bytes+1,5);
  send("media_end",0,0,0,0,0,NULL,0);assert(s_inline_media_state==INLINE_MEDIA_READY);
  assert(s_media_bitmap->data[0]==0&&s_media_bitmap->data[1]==1);
  assert(inline_media_size(100).h==67);clear_media();bitmap_limit=100000;
  bitmap_limit=0;send("media_start",3,2,1,6,0,NULL,0);
  assert(s_inline_media_state==INLINE_MEDIA_FAILED&&!s_media_bitmap);
  send("media_end",0,0,0,0,0,NULL,0);assert(strcmp(s_inline_media_error,"Not enough memory")==0);
  clear_media();bitmap_limit=100000;
  send("media_start",181,1,1,181,0,NULL,0);assert(!s_media_bitmap);
  send("media_start",3,2,7,42,0,NULL,0);assert(!s_media_bitmap);
  send("media_start",3,2,3,17,0,NULL,0);assert(!s_media_bitmap);
  send("media_start",3,2,3,18,0,NULL,0);
  send("media_chunk",0,0,0,0,1,bytes,5);assert(s_media_received==0);
  send("media_end",0,0,0,0,0,NULL,0);assert(s_inline_media_state==INLINE_MEDIA_FAILED);
  clear_media();return 0;
}
`);
    execFileSync('cc',['-std=c11','-fsanitize=address,undefined','-g',join(dir,'test.c'),'-o',join(dir,'test')]);
    execFileSync(join(dir,'test'));
    assert.match(source,/s_media_visible = false;\n  GRect viewport/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
