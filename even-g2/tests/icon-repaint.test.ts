import test from 'node:test';import assert from 'node:assert/strict';
import {Display,type Screen} from '../pome/src/display';
class Element {children:unknown[]=[];style={};append(...items:unknown[]){this.children.push(...items);}replaceChildren(...items:unknown[]){this.children=items;}}
(globalThis as any).document={createElement:()=>new Element()};
function fixture(){const display=new Display(new Element() as unknown as HTMLElement,false);let creates=0,rebuilds=0;const images=new Map<number,unknown>(),text=new Map<number,string>(),pages:any[]=[];
 display.bridge={createStartUpPageContainer:async(p:any)=>{creates++;pages.push(p);images.clear();return 0;},rebuildPageContainer:async(p:any)=>{rebuilds++;pages.push(p);images.clear();return true;},textContainerUpgrade:async(t:any)=>{text.set(t.containerID,t.content);images.clear();return true;},updateImageRawData:async(i:any)=>{images.set(i.containerID,i.imageData);return 'success';}} as any;
 return {display,images,text,pages,counts:()=>({creates,rebuilds}),flush:()=>((display as any).chain as Promise<void>)};
}
function screen(lines:string[],index=0):Screen{return {title:'Pome',titleIcon:'scene',lines:lines.map((s,i)=>(i===index?'> ':'  ')+s),icons:lines.map(()=> 'room'),footer:String(index)};}
test('up/down paging retains geometry and repaints icons even if text updates clear bitmap RAM',async()=>{
 const f=fixture();for(const lines of [['A','B','C','D','E'],['A much longer chat name','B','C','D','E'],['Last','Refresh inbox'],['A much longer chat name','B','C','D','E'],['A','B','C','D','E']]){f.display.show(screen(lines));await f.flush();assert.deepEqual([...f.images.keys()],[20,23,30,31]);}
 f.display.show(screen(['A','B','C','D','E'],3));await f.flush();assert.deepEqual([...f.images.keys()],[20,23,30,31]);assert.deepEqual(f.counts(),{creates:1,rebuilds:0});
 assert.equal(f.pages[0].textObject.length,8);assert.equal(f.pages[0].imageObject.length,4);
});
test('a burst of scroll inputs finishes current transfers and draws every icon for the newest page',async()=>{
 const f=fixture();let release!:()=>void;let entered!:()=>void;const started=new Promise<void>(r=>entered=r),blocked=new Promise<void>(r=>release=r);const send=f.display.bridge!.updateImageRawData;let first=true;
 f.display.bridge!.updateImageRawData=async data=>{if(first){first=false;entered();await blocked;}return send(data);};
 f.display.show(screen(['Old','B','C','D','E']));await started;f.display.show(screen(['Skipped','B','C','D','E']));f.display.show(screen(['Newest','B','C','D','E']));release();await f.flush();assert.equal(f.text.get(10),'> Newest');assert.deepEqual([...f.images.keys()],[20,23,30,31]);assert.deepEqual(f.counts(),{creates:1,rebuilds:0});
});
test('returning from the system overlay restores every icon',async()=>{
 const f=fixture();f.display.show(screen(['A','B','C','D','E']));await f.flush();(f.display as any).event({sysEvent:{eventType:4}});f.images.clear();(f.display as any).event({sysEvent:{eventType:5}});await f.flush();assert.deepEqual([...f.images.keys()],[20,23,30,31]);
});
