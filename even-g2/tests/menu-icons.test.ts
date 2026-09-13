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
 const page=calls[0];assert.equal(page.textObject.length,8);assert.equal(page.containerTotalNum,10);assert.equal(page.textObject.filter((t:any)=>t.isEventCapture===1).length,1);assert.equal(page.textObject.find((t:any)=>t.isEventCapture===1).content.trim(),'');assert.ok(page.imageObject[0].xPosition===54);
 for(const img of page.imageObject){assert.ok(img.height<=100);for(const t of page.textObject.filter((t:any)=>!t.isEventCapture))assert.ok(t.xPosition>=img.xPosition+img.width||t.yPosition+t.height<=img.yPosition||t.yPosition>=img.yPosition+img.height);}
 assert.deepEqual(calls.slice(1).map(p=>p.containerID),[20,23]);
});
test('scrolling updates selection without rebuilding and restores icon strips',async()=>{
 const d=new Display(node() as any,false);let rebuilds=0,images=0;const updates:any[]=[];(d as any).started=true;
 d.bridge={rebuildPageContainer:async()=>{rebuilds++;return true;},updateImageRawData:async()=>{images++;return 'success';},textContainerUpgrade:async(p:any)=>{updates.push(p);return true;}} as any;
 const screen={title:'Room',lines:['> Lamp','  Fan'],icons:['light','fan'] as any,footer:'1/2'};
 d.show(screen);await (d as any).chain;
 d.show({...screen,lines:['  Lamp','> Fan'],footer:'2/2'});await (d as any).chain;
 assert.equal(rebuilds,1);assert.equal(images,4);assert.deepEqual(updates.map(p=>p.containerID),[10,11,3]);
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
test('favorite menu follows selected entity and freezes its target while the overlay is open',async()=>{
 const d=new Display(node() as any,false),pages:any[]=[],selected:any[]=[];(d as any).started=true;
 d.bridge={rebuildPageContainer:async(p:any)=>{pages.push(p);return true;},updateImageRawData:async()=> 'success',textContainerUpgrade:async()=>true} as any;d.onFavorite=f=>selected.push(f);
 const screen={title:'Devices',lines:['Lamp'],icons:['light'] as any,footer:'Select',favorite:{key:'device:lamp',pinned:false}};
 d.show(screen);await (d as any).chain;assert.equal(pages.at(-1).menuObject.menuItems[1].itemName,'Pin / unpin');
 (d as any).event({sysEvent:{eventType:4}});d.show({...screen,favorite:{key:'device:fan',pinned:false}});await (d as any).chain;assert.equal(pages.length,1);
 (d as any).event({menuItemClickEvent:{itemID:2}});assert.deepEqual(selected,[]);(d as any).event({sysEvent:{eventType:5}});assert.deepEqual(selected,[screen.favorite]);
 d.show({...screen,favorite:{key:'device:lamp',pinned:true}});await (d as any).chain;assert.equal(pages.at(-1).menuObject.menuItems[1].itemName,'Pin / unpin');
 d.show({...screen,favorite:undefined});await (d as any).chain;assert.equal(pages.at(-1).menuObject.menuItems.length,2);
});
test('closing the system overlay resends icons even when the screen did not change',async()=>{
 const d=new Display(node() as any,false);let builds=0;const icons:number[]=[];(d as any).started=true;
 d.bridge={rebuildPageContainer:async()=>{builds++;return true;},updateImageRawData:async(p:any)=>{icons.push(p.containerID);return 'success';},textContainerUpgrade:async()=>true} as any;
 d.show({title:'Menu',lines:['One','Two','Three','Four','Five'],icons:['room','scene','light','camera','voice'],footer:'Select'});await (d as any).chain;
 (d as any).event({sysEvent:{eventType:4}});(d as any).event({sysEvent:{eventType:5}});await (d as any).chain;
 assert.equal(builds,2);assert.deepEqual(icons,[20,23,20,23]);
 d.retry();await (d as any).chain;assert.equal(builds,3);assert.deepEqual(icons,[20,23,20,23,20,23]);
});
test('scroll during a slow icon transfer finishes both strips before updating selection',async()=>{
 const d=new Display(node() as any,false);let builds=0;const icons:number[]=[];let release!:()=>void,started!:()=>void;const entered=new Promise<void>(r=>started=r);(d as any).started=true;
 d.bridge={rebuildPageContainer:async()=>{builds++;return true;},updateImageRawData:async(p:any)=>{icons.push(p.containerID);if(icons.length===1){started();await new Promise<void>(r=>release=r);}return 'success';},textContainerUpgrade:async()=>true} as any;
 const screen={title:'Menu',lines:['> One','  Two','Three','Four','Five'],icons:['room','scene','light','camera','voice'] as any,footer:'1/5'};
 d.show(screen);await entered;d.show({...screen,lines:['  One','> Two','Three','Four','Five'],footer:'2/5'});release();await (d as any).chain;
 assert.equal(builds,1);assert.deepEqual(icons,[20,23,20,23]);
});
test('page updates wait while overlay is open and dismissal restores the latest page',async()=>{
 const d=new Display(node() as any,false);const builds:any[]=[],text:any[]=[];(d as any).started=true;
 d.bridge={rebuildPageContainer:async(p:any)=>{builds.push(p);return true;},updateImageRawData:async()=> 'success',textContainerUpgrade:async(p:any)=>{text.push(p);return true;}} as any;
 d.show({title:'Menu',lines:['Room'],icons:['room'],footer:'Select'});await (d as any).chain;
 (d as any).event({sysEvent:{eventType:4}});d.show({title:'Changed',lines:['Lamp','Fan'],icons:['light','fan'],footer:'Select'});await (d as any).chain;assert.equal(builds.length,1);
 (d as any).event({sysEvent:{eventType:5}});await (d as any).chain;assert.equal(builds.length,2);assert.equal(builds.at(-1).textObject[0].content,'Changed');
});
test('Pome title has symmetric scene icons within the twelve-container budget',async()=>{
 const d=new Display(node() as any,false),pages:any[]=[],updates:any[]=[];(d as any).started=true;
 d.bridge={rebuildPageContainer:async(p:any)=>{pages.push(p);return true;},updateImageRawData:async(p:any)=>{updates.push(p);return 'success';}} as any;
 d.show({title:'Pome',lines:['1','2','3','4','5'],icons:['room','scene','light','camera','voice'],footer:'Select'});await (d as any).chain;
 const p=pages[0],title=p.textObject[0],icons=p.imageObject.filter((i:any)=>i.containerID>=30);assert.equal(p.containerTotalNum,12);assert.ok(Math.abs(title.xPosition+title.width/2-288)<=0.5);assert.ok(Math.abs((icons[0].xPosition+icons[1].xPosition+icons[1].width)/2-288)<=0.5);assert.deepEqual(updates.map(i=>i.containerID),[20,23,30,31]);
});
test('nested headings center text and matching icons, truncate long names, and refresh changed glyphs',async()=>{
 const d=new Display(node() as any,false),pages:any[]=[],updates:any[]=[];(d as any).started=true;
 d.bridge={rebuildPageContainer:async(p:any)=>{pages.push(p);return true;},updateImageRawData:async(p:any)=>{updates.push(p);return 'success';},textContainerUpgrade:async()=>true} as any;
 const screen={title:'Workshop',titleIcon:'room' as const,lines:['Lamp'],icons:['light'] as any,footer:'Select'};
 d.show(screen);await (d as any).chain;
 const page=pages[0],t=page.textObject[0],sides=page.imageObject.filter((i:any)=>i.containerID>=30);assert.ok(Math.abs(t.xPosition+t.width/2-288)<=0.5);assert.ok(Math.abs((sides[0].xPosition+sides[1].xPosition+20)/2-288)<=0.5);assert.deepEqual(updates.at(-1).imageData,iconBMP(['room']));
 d.show({...screen,titleIcon:'camera'});await (d as any).chain;assert.deepEqual(updates.at(-1).imageData,iconBMP(['camera']));
 d.show({...screen,title:'A very long room title that cannot fit on one line'});await (d as any).chain;const long=pages.at(-1);assert.ok(long.textObject[0].width<=360);assert.ok(long.textObject[0].content.endsWith('...'));for(const img of long.imageObject)assert.ok(img.xPosition>=0&&img.xPosition+img.width<=576);
});
test('rendered heading, menu content and footer share the firmware pixel center',async()=>{
 const {getTextWidth}=await import('../pome/node_modules/@evenrealities/pretext/dist/font_measure.js');const d=new Display(node() as any,false);let page:any;(d as any).started=true;
 d.bridge={rebuildPageContainer:async(p:any)=>{page=p;return true;},updateImageRawData:async()=> 'success'} as any;
 d.show({title:'Pome',lines:['> Dictate a command','  * Lounge'],icons:['voice','room'],footer:'1/9 · Tap select · Double tap back'});await (d as any).chain;
 const title=page.textObject[0],row=page.textObject.find((t:any)=>t.containerID===10),icon=page.imageObject[0],footer=page.textObject.find((t:any)=>t.containerID===3);
 assert.ok(Math.abs(title.xPosition+getTextWidth(title.content)/2-288)<=.5);
 assert.ok(Math.abs((icon.xPosition+row.xPosition+row.width-2)/2-288)<=1);
 const spaces=footer.content.length-footer.content.trimStart().length,start=getTextWidth(' '.repeat(spaces));assert.ok(Math.abs(start+getTextWidth(footer.content.trimStart())/2-288)<=getTextWidth(' '));assert.equal(footer.paddingLength,0);
});
test('moving between pinned, unpinned and non-pinnable rows restores icons without rebuilding',async()=>{
 const d=new Display(node() as any,false);let builds=0,images=0;(d as any).started=true;
 d.bridge={rebuildPageContainer:async()=>{builds++;return true;},updateImageRawData:async()=>{images++;return 'success';},textContainerUpgrade:async()=>true} as any;
 const s={title:'Pome',titleIcon:'scene' as const,lines:['> Lounge','  Rooms'],icons:['room','room'] as any,footer:'1/2',favorite:{key:'room:lounge',pinned:true}};
 d.show(s);await (d as any).chain;const initial=images;
 d.show({...s,favorite:{...s.favorite,pinned:false}});await (d as any).chain;
 d.show({...s,lines:['  Lounge','> Rooms'],footer:'2/2',favorite:undefined});await (d as any).chain;
 assert.equal(builds,1);assert.equal(images,initial*3);
});
test('changing one icon strip does not resend other strips or title icons',async()=>{
 const d=new Display(node() as any,false),updates:number[]=[];let builds=0;(d as any).started=true;
 d.bridge={rebuildPageContainer:async()=>{builds++;return true;},updateImageRawData:async(p:any)=>{updates.push(p.containerID);return 'success';},textContainerUpgrade:async()=>true} as any;
 const s={title:'Pome',lines:['One','Two','Three','Four','Five'],icons:['room','scene','light','camera','voice'] as any,footer:'Select'};
 d.show(s);await (d as any).chain;updates.length=0;
 d.show({...s,icons:['fan','scene','light','camera','voice']});await (d as any).chain;
 assert.equal(builds,1);assert.deepEqual(updates,[20,23,30,31]);
});
