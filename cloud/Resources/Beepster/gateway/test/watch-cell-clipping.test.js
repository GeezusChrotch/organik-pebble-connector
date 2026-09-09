import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

test('recycled cells reset local bounds and clipping down to a one-pixel edge',()=>{
 const source=readFileSync(new URL('../../src/c/main.c',import.meta.url),'utf8');
 const start=source.indexOf('        layer_set_frame(cell, GRect(0, top, viewport.size.w, bottom - top));');
 const code=source.slice(start,source.indexOf('        layer_mark_dirty(cell);',start));
 assert.ok(start>0);
 assert.match(source,/GRect\(0, 0, 6, bounds.size.h\)/);
 assert.doesNotMatch(source,/bounds.size.h - 4/);
 const dir=mkdtempSync(join(tmpdir(),'beepster-cell-clip-'));
 try{
  writeFileSync(join(dir,'test.c'),`
#include <stdbool.h>
#include <assert.h>
typedef struct {int x,y;} Point;
typedef struct {int w,h;} Size;
typedef struct {Point origin;Size size;} Rect;
typedef struct {Rect frame,bounds;bool clips;} Layer;
#define GRect(x,y,w,h) ((Rect){{x,y},{w,h}})
/* SDK frame changes may extend bounds; shrinking must be explicit. */
static void layer_set_frame(Layer*l,Rect r){l->frame=r;if(r.size.h>l->bounds.size.h)l->bounds.size.h=r.size.h;}
static void layer_set_bounds(Layer*l,Rect r){l->bounds=r;}
static void layer_set_clips(Layer*l,bool v){l->clips=v;}
static void layer_set_hidden(Layer*l,bool v){}
static void place(Layer *cell,int top,int bottom){Rect viewport=GRect(0,0,200,228);${code}}
int main(void){
 Layer cell={.bounds=GRect(0,0,200,228)};
 for(int round=0;round<4;round++)for(int h=228;h>0;h--){
  place(&cell,228-h,228);
  assert(cell.bounds.origin.x==0&&cell.bounds.origin.y==0);
  assert(cell.bounds.size.h==h&&cell.bounds.size.w==200&&cell.clips);
  assert(cell.frame.origin.y+cell.bounds.size.h==228);
 }
}
`);
  execFileSync('cc',[join(dir,'test.c'),'-o',join(dir,'test')]);execFileSync(join(dir,'test'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
