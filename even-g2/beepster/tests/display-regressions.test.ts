import {decodeImage} from './png-helper';
import test from 'node:test';import assert from 'node:assert/strict';
import {Display,type Screen} from '../src/display';import {ImageRawDataUpdateResult} from '@evenrealities/even_hub_sdk';
class Element {children:unknown[]=[];style={};append(...items:unknown[]){this.children.push(...items);}replaceChildren(...items:unknown[]){this.children=items;}}
(globalThis as any).document={createElement:()=>new Element()};
function fixture(){const display=new Display(new Element() as unknown as HTMLElement,false);let creates=0,rebuilds=0;const images=new Map<number,unknown>(),text=new Map<number,string>(),pages:any[]=[];
 display.bridge={createStartUpPageContainer:async(p:any)=>{creates++;pages.push(p);images.clear();return 0;},rebuildPageContainer:async(p:any)=>{rebuilds++;pages.push(p);images.clear();return true;},textContainerUpgrade:async(t:any)=>{text.set(t.containerID,t.content);images.clear();return true;},updateImageRawData:async(i:any)=>{images.set(i.containerID,decodeImage(i.imageData));return ImageRawDataUpdateResult.success;}} as any;
 return {display,images,text,pages,counts:()=>({creates,rebuilds}),flush:()=>((display as any).chain as Promise<void>)};
}
function screen(lines:string[],index=0):Screen{return {title:'Beepster',titleIcon:'message',lines:lines.map((s,i)=>(i===index?'> ':'  ')+s),icons:lines.map(()=> 'apple_messages'),footer:String(index)};}
test('up/down paging retains geometry and repaints icons even if text updates clear bitmap RAM',async()=>{
 const f=fixture();for(const lines of [['A','B','C','D','E'],['A much longer chat name','B','C','D','E'],['Last','Refresh inbox'],['A much longer chat name','B','C','D','E'],['A','B','C','D','E']]){f.display.show(screen(lines));await f.flush();assert.deepEqual([...f.images.keys()],[20,23,30,31]);}
 f.display.show(screen(['A','B','C','D','E'],3));await f.flush();assert.deepEqual([...f.images.keys()],[20,23,30,31]);assert.deepEqual(f.counts(),{creates:1,rebuilds:0});
 assert.equal(f.pages[0].textObject.length,8);assert.equal(f.pages[0].imageObject.length,4);
});
test('a burst of scroll inputs finishes current transfers and draws every icon for the newest page',async()=>{
 const f=fixture();let release!:()=>void;let entered!:()=>void;const started=new Promise<void>(r=>entered=r),blocked=new Promise<void>(r=>release=r);const send=f.display.bridge!.updateImageRawData;let first=true,sends=0;
 f.display.bridge!.updateImageRawData=async data=>{sends++;if(first){first=false;entered();await blocked;}return send(data);};
 f.display.show(screen(['Old','B','C','D','E']));await started;f.display.show(screen(['Skipped','B','C','D','E']));f.display.show(screen(['Newest','B','C','D','E']));release();await f.flush();assert.equal(sends,5);assert.equal(f.text.get(10),'> Newest');assert.deepEqual([...f.images.keys()],[20,23,30,31]);assert.deepEqual(f.counts(),{creates:1,rebuilds:0});
});
test('returning from the system overlay restores every icon',async()=>{
 const f=fixture();f.display.show(screen(['A','B','C','D','E']));await f.flush();(f.display as any).event({sysEvent:{eventType:4}});f.images.clear();(f.display as any).event({sysEvent:{eventType:5}});await f.flush();assert.deepEqual([...f.images.keys()],[20,23,30,31]);
});

test('the listening status update never rebuilds the page after the microphone opens',async()=>{
 const {API}=await import('../src/api');const {Beepster}=await import('../src/controller');const {loadSettings}=await import('../src/model');const {MicrophoneSession}=await import('../src/microphone');
 const f=fixture();let atStart=-1;
 (f.display as any).microphone=new MicrophoneSession(async open=>{if(open){atStart=f.counts().rebuilds;(f.display as any).event({audioEvent:{audioPcm:new Uint8Array(3200)}});}return true;},()=>{},async()=>{});
 const app=new Beepster(new API({...loadSettings('{}'),refresh:0},true),f.display);await app.start();await app.openChat({id:'demo',name:'Alex',network:'iMessage',timestamp:'',preview:'',unreadCount:0});await app.beginRecording();await f.flush();
 assert.equal(app.recording,true);assert.match(app.page?.lines?.[0]||'',/Listening/);assert.ok(atStart>=0);assert.equal(f.counts().rebuilds,atStart);app.dispose();
});

test('six rows have no footer and full-width dividers clear without rebuilding or losing title icons',async()=>{
 const f=fixture(),base=screen(['Alex','First message','Sam','Second message','Third line','Sixth line']);
 f.display.show({...base,dividers:[false,true,true,true,true,true]});await f.flush();const page=f.pages[0];assert.equal(page.containerTotalNum,12);assert.equal(page.imageObject.length,4);assert.equal(page.textObject.filter((t:any)=>t.containerName.startsWith('row-')).length,6);assert.ok(!page.textObject.some((t:any)=>t.containerName==='footer'));assert.ok(page.textObject.filter((t:any)=>!t.isEventCapture).every((t:any)=>t.zOrderIndex>Math.max(...page.imageObject.map((i:any)=>i.zOrderIndex))));
 const pixel=(x:number,y:number)=>{const tile=page.imageObject.find((t:any)=>x>=t.xPosition&&x<t.xPosition+t.width&&y>=t.yPosition&&y<t.yPosition+t.height),bytes=f.images.get(tile.containerID) as Uint8Array,stride=Math.ceil(tile.width*3/4)*4;return bytes[54+(tile.height-1-(y-tile.yPosition))*stride+(x-tile.xPosition)*3];};
 for(const row of [1,2,3,4,5])for(const x of [50,337,338,519])assert.equal(pixel(x,64+32*row),119);const titlePixels=[...f.images.values()].map(v=>Array.from((v as Uint8Array).subarray(54))).flat();assert.ok(titlePixels.some(v=>v===255));
 f.display.show({...base,dividers:[false,false,false,false,false,false]});await f.flush();for(const row of [1,2,3,4,5])for(const x of [50,337,338,519])assert.equal(pixel(x,64+32*row),0);assert.deepEqual(f.counts(),{creates:1,rebuilds:0});assert.deepEqual([...f.images.keys()],[20,21,22,23]);
});

test('menu close waits for native teardown and recreates lost thread containers, even without an open event',async()=>{
 for(const enter of [true,false]){const f=fixture();f.display.show({...screen(['A','B','C','D','E','F']),dividers:[false,true,false,true,false,true]});await f.flush();const original=f.display.bridge!.updateImageRawData;let containersLost=true;f.display.bridge!.updateImageRawData=async data=>{assert.equal(containersLost,false);return original(data);};const rebuild=f.display.bridge!.rebuildPageContainer;f.display.bridge!.rebuildPageContainer=async page=>{containersLost=false;return rebuild(page);};if(enter)(f.display as any).event({sysEvent:{eventType:4}});f.images.clear();(f.display as any).event({sysEvent:{eventType:5}});assert.equal(f.images.size,0);await f.display.idle();assert.deepEqual([...f.images.keys()],[20,21,22,23]);assert.equal(f.counts().rebuilds,1);}
});
test('menu opening during an image transfer cannot mark the interrupted page reusable',async()=>{
 const f=fixture();f.display.show(screen(['First']));await f.flush();let entered!:()=>void,release!:()=>void;const started=new Promise<void>(r=>entered=r),blocked=new Promise<void>(r=>release=r),send=f.display.bridge!.updateImageRawData;let once=true;f.display.bridge!.updateImageRawData=async data=>{if(once){once=false;entered();await blocked;}return send(data);};f.display.show(screen(['Next']));await started;(f.display as any).event({sysEvent:{eventType:4}});(f.display as any).event({sysEvent:{eventType:5}});release();await f.display.idle();assert.equal(f.counts().rebuilds,1);assert.deepEqual([...f.images.keys()],[20,23,30,31]);
});
test('app gesture recovers after a missed menu-close event',async()=>{const f=fixture();f.display.show(screen(['A']));await f.flush();(f.display as any).event({sysEvent:{eventType:4}});f.images.clear();(f.display as any).event({textEvent:{eventType:2}});await f.display.idle();assert.equal(f.display.menuOpen,false);assert.deepEqual([...f.images.keys()],[20,23,30,31]);});
test('a transient image rejection after menu close gets one bounded automatic retry',async()=>{const f=fixture();f.display.show(screen(['A']));await f.flush();const send=f.display.bridge!.updateImageRawData;let failures=0;f.display.bridge!.updateImageRawData=async data=>{if(failures++===0)throw Error('Native surface settling');return send(data);};(f.display as any).event({sysEvent:{eventType:5}});await f.display.idle();assert.equal(f.counts().rebuilds,2);assert.deepEqual([...f.images.keys()],[20,23,30,31]);});

test('host PNG rejection falls back to original bitmap for the session',async()=>{
 const f=fixture(),send=f.display.bridge!.updateImageRawData;let pngs=0,bmps=0;f.display.bridge!.updateImageRawData=async data=>{if((data.imageData as Uint8Array)[0]===137){pngs++;return ImageRawDataUpdateResult.imageToGray4Failed;}bmps++;return send(data);};
 f.display.show(screen(['A']));await f.display.idle();assert.equal(pngs,1);assert.equal(bmps,4);assert.equal(f.images.size,4);
});


test('app-owned quit confirmation preserves icons and inbox position on No and double tap',async()=>{
 const {API}=await import('../src/api');const {Beepster}=await import('../src/controller');const {loadSettings}=await import('../src/model');
 const f=fixture(),app=new Beepster(new API({...loadSettings('{}'),refresh:0},true),f.display);let exits=0;
 f.display.bridge!.shutDownPageContainer=async()=>{exits++;return true;};await app.start();await app.input(2);const inbox=app.page,index=inbox!.index;
 for(const cancel of [0,3]){await app.input(3);await f.display.idle();assert.equal(app.page?.kind,'quit');assert.equal(app.page?.index,0);assert.deepEqual([...f.images.keys()],[20,23,30,31]);assert.equal(exits,0);await app.input(cancel);await f.display.idle();assert.equal(app.page,inbox);assert.equal(app.page?.index,index);assert.deepEqual([...f.images.keys()],[20,23,30,31]);}
 app.dispose();
});
test('Yes alone exits immediately without invoking the native confirmation overlay',async()=>{
 const {API}=await import('../src/api');const {Beepster}=await import('../src/controller');const {loadSettings}=await import('../src/model');
 const f=fixture(),app=new Beepster(new API({...loadSettings('{}'),refresh:0},true),f.display),modes:unknown[]=[];let stops=0;
 f.display.record=async()=>{stops++;};f.display.bridge!.shutDownPageContainer=async mode=>{modes.push(mode);return true;};await app.start();await app.input(3);assert.equal(stops,0);await app.input(2);assert.equal(stops,0);await app.input(0);await f.display.idle();assert.deepEqual(modes,[0]);assert.equal(stops,1);assert.equal((app as any).active,false);app.dispose();
});
test('failed immediate close keeps confirmation usable for cancel or retry',async()=>{
 const f=fixture();f.display.show(screen(['No, stay','Yes, quit']));await f.display.idle();let stops=0;f.display.record=async()=>{stops++;};f.display.bridge!.shutDownPageContainer=async()=>false;
 await assert.rejects(f.display.exit(),/Could not close/);assert.equal(stops,0);assert.equal((f.display as any).exited,false);f.display.bridge!.shutDownPageContainer=async()=>true;await f.display.exit();assert.equal(stops,1);
});

test('window frame spans all app-owned screen types and survives overlay rebuilds within SDK limits',async()=>{
 const {validateEvenHubPageContainer}=await import('@evenrealities/even_hub_sdk');const {frameBMP}=await import('../src/images');
 const photo=frameBMP({encoding:'gcolor6',width:1,height:1,pixels:btoa(String.fromCharCode(252)),age:0});
 const screens:Screen[]=[screen(['Inbox']),{...screen(['Conversation','Body']),dividers:[false,true]}, {title:'Dictation',lines:['Listening…'],footer:''},{...screen(['No, stay','Yes, quit']),title:'Quit Beepster?'},{title:'Photo',titleIcon:'message',lines:[],footer:'',image:photo}];
 for(const compact of [false,true])for(const s of screens){const f=fixture();(f.display as any).compactCamera=compact;f.display.show(s);await f.display.idle();(f.display as any).event({sysEvent:{eventType:4}});(f.display as any).event({sysEvent:{eventType:5}});await f.display.idle();assert.equal(f.pages.length,2);
  for(const page of f.pages){assert.equal(validateEvenHubPageContainer(page).valid,true);const capture=page.textObject.find((t:any)=>t.isEventCapture===1);assert.deepEqual([capture.xPosition,capture.yPosition,capture.width,capture.height,capture.borderWidth,capture.borderColor,capture.borderRadius,capture.zOrderIndex],[0,0,576,288,1,8,0,0]);assert.ok(page.containerTotalNum<=12);assert.ok(page.textObject.length<=8);assert.ok(page.imageObject.length<=4);for(const image of page.imageObject){assert.ok(image.xPosition>=1&&image.yPosition>=1);assert.ok(image.xPosition+image.width<=575&&image.yPosition+image.height<=287);const bytes=f.images.get(image.containerID) as Uint8Array;const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);assert.equal(view.getInt32(18,true),image.width);assert.equal(view.getInt32(22,true),image.height);}}
 }
});
