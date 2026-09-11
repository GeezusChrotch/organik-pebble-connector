import test from 'node:test';
import assert from 'node:assert/strict';
import {iconBMP,deviceIcon} from '../pome/src/icons';
import {Display} from '../pome/src/display';
const node=()=>({append(){},replaceChildren(){},textContent:'',src:'',alt:'',className:''});
(globalThis as any).document={createElement:node};
test('device kinds stay distinct and BMP strips fit image limits',()=>{
 assert.equal(new Set(['light','outlet','switch','fan','blinds','temperature-sensor'].map(deviceIcon)).size,6);
 assert.equal(deviceIcon('new-unknown'),'device');
 const bmp=iconBMP(['light','scene','camera']),v=new DataView(bmp.buffer);
 assert.equal(v.getInt32(18,true),20);assert.equal(v.getInt32(22,true),96);assert.equal(v.getUint32(2,true),bmp.length);
 for(let row=0;row<3;row++)assert.ok(bmp.slice(54+row*32*60,54+(row+1)*32*60).some(p=>p===255));
});
test('menu icons use separate non-overlapping strips and sequential transfers',async()=>{
 const d=new Display(node() as any,false),calls:any[]=[];let sending=false;(d as any).started=true;
 d.bridge={rebuildPageContainer:async(p:any)=>{calls.push(p);return true;},updateImageRawData:async(p:any)=>{assert.equal(sending,false);sending=true;await Promise.resolve();sending=false;calls.push(p);return 'success';}} as any;
 d.show({title:'Devices',lines:['Lamp','Plug','Switch','Fan','Camera'],icons:['light','outlet','switch','fan','camera'],footer:'Select'});await (d as any).chain;
 const page=calls[0];assert.equal(page.textObject.length,8);assert.equal(page.containerTotalNum,10);assert.equal(page.textObject.filter((t:any)=>t.isEventCapture===1).length,1);assert.equal(page.textObject.find((t:any)=>t.isEventCapture===1).content.trim(),'');assert.equal(page.imageObject[0].xPosition,96);assert.equal(page.textObject.find((t:any)=>t.containerID===10).xPosition+page.textObject.find((t:any)=>t.containerID===10).width,480);
 for(const img of page.imageObject){assert.ok(img.height<=100);for(const t of page.textObject)assert.ok(t.xPosition>=img.xPosition+img.width||t.yPosition+t.height<=img.yPosition||t.yPosition>=img.yPosition+img.height);}
 assert.deepEqual(calls.slice(1).map(p=>p.containerID),[20,23]);
});
test('scrolling updates selection without rebuilding the page or retransmitting icons',async()=>{
 const d=new Display(node() as any,false);let rebuilds=0,images=0;const updates:any[]=[];(d as any).started=true;
 d.bridge={rebuildPageContainer:async()=>{rebuilds++;return true;},updateImageRawData:async()=>{images++;return 'success';},textContainerUpgrade:async(p:any)=>{updates.push(p);return true;}} as any;
 const screen={title:'Room',lines:['> Lamp','  Fan'],icons:['light','fan'] as any,footer:'1/2'};
 d.show(screen);await (d as any).chain;
 d.show({...screen,lines:['  Lamp','> Fan'],footer:'2/2'});await (d as any).chain;
 assert.equal(rebuilds,1);assert.equal(images,1);assert.deepEqual(updates.map(p=>p.containerID),[10,11,3]);
});
test('failed incremental updates force a complete retry',async()=>{
 const d=new Display(node() as any,false);let rebuilds=0;(d as any).started=true;
 d.bridge={rebuildPageContainer:async()=>{rebuilds++;return true;},updateImageRawData:async()=> 'success',textContainerUpgrade:async()=>false} as any;
 const screen={title:'Room',lines:['> Lamp'],icons:['light'] as any,footer:'Select'};
 d.show(screen);await (d as any).chain;d.show({...screen,footer:'Updated'});await (d as any).chain;d.retry();await (d as any).chain;assert.equal(rebuilds,2);
});
test('context Dictate waits for overlay dismissal and does not forward that exit',()=>{
 const d=new Display(node() as any,false),events:any[]=[];d.onInput=t=>events.push(t);d.onDictate=()=>events.push('dictate');
 (d as any).event({sysEvent:{eventType:4}});(d as any).event({menuItemClickEvent:{itemID:1}});assert.deepEqual(events,[]);
 (d as any).event({sysEvent:{eventType:5}});assert.deepEqual(events,['dictate']);
 (d as any).event({sysEvent:{eventType:7}});assert.deepEqual(events,['dictate',7]);
});
