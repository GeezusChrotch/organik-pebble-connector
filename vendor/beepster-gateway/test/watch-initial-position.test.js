import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

test('loaded inbox removes positive centering offset without resetting scrolled history',()=>{
  const source=readFileSync(new URL('../../src/c/main.c',import.meta.url),'utf8');
  const start=source.indexOf('if (strcmp(command->value->cstring, "chats_ready") == 0)');
  const block=source.slice(start,source.indexOf('\n    return;',start));
  const clamp=block.slice(block.indexOf('      ScrollLayer *list_scroll'),block.lastIndexOf('\n    }'));
  assert.ok(clamp.includes('scroll_layer_set_content_offset'));
  assert.ok(block.indexOf('ScrollLayer *list_scroll')>block.lastIndexOf('menu_layer_set_selected_index'));
  const header=readFileSync(new URL('../../src/c/touch_menu.h',import.meta.url),'utf8');
  assert.match(header,/menu_layer_set_center_focused\(menu, true\)/);
  const dir=mkdtempSync(join(tmpdir(),'beepster-inbox-position-'));
  try{
    writeFileSync(join(dir,'test.c'),`
#include <assert.h>
#include <stdbool.h>
typedef struct {int x,y;} GPoint;
typedef int ScrollLayer;
#define GPointZero ((GPoint){0,0})
static void *s_chat_menu;
static GPoint offset;static int writes;
static ScrollLayer *menu_layer_get_scroll_layer(void *m){return (ScrollLayer*)m;}
static GPoint scroll_layer_get_content_offset(ScrollLayer*m){return offset;}
static void scroll_layer_set_content_offset(ScrollLayer*m,GPoint p,bool animated){assert(!animated);offset=p;writes++;}
static void loaded(void){${clamp}}
int main(void){
 for(int y=1;y<240;y++){offset=(GPoint){0,y};loaded();assert(offset.y==0);}
 int previous=writes;
 offset=(GPoint){0,-180};loaded();assert(offset.y==-180&&writes==previous);
 offset=GPointZero;loaded();assert(offset.y==0&&writes==previous);
}
`);
    execFileSync('cc',[join(dir,'test.c'),'-o',join(dir,'test')]);
    execFileSync(join(dir,'test'));
  }finally{rmSync(dir,{recursive:true,force:true});}
});
