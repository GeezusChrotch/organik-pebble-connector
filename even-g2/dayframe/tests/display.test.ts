import test from 'node:test';import assert from 'node:assert/strict';
import {Display,screenGeometry} from '../src/display';import {validateEvenHubPageContainer} from '@evenrealities/even_hub_sdk';
test('fixed full-canvas input, SDK-valid menu, changed-only writes and system-confirmed exit',async()=>{
 const old=globalThis.document;globalThis.document={createElement:()=>({textContent:'',append:()=>{}})} as unknown as Document;
 try{
  const d=new Display({replaceChildren:()=>{},append:()=>{}} as unknown as HTMLElement,false);const pages:any[]=[],writes:any[]=[],exits:number[]=[];
  d.bridge={createStartUpPageContainer:async(p:any)=>{pages.push(p);return 0;},rebuildPageContainer:async(p:any)=>{pages.push(p);return true;},textContainerUpgrade:async(p:any)=>{writes.push(p);return true;},shutDownPageContainer:async(n:number)=>{exits.push(n);return true;}} as any;
  const screen={title:'DayFrame',lines:['One','Two'],footer:'Today'};d.show(screen);await d.idle();assert.equal(pages.length,1);assert.equal(pages[0].textObject.length,8,'G2 firmware permits at most eight text containers');assert.equal(pages[0].containerTotalNum,8);assert.deepEqual(validateEvenHubPageContainer(pages[0]),{valid:true});
  const capture=pages[0].textObject.filter((t:any)=>t.isEventCapture===1);assert.equal(capture.length,1);assert.equal(capture[0].width,576);assert.equal(capture[0].height,288);assert.equal(capture[0].zOrderIndex,0);
  d.show(screen);await d.idle();assert.equal(writes.length,0);d.show({...screen,lines:['One','Changed']});await d.idle();assert.equal(pages.length,2,'recenter when the column width changes');await d.exit();assert.deepEqual(exits,[1]);
 }finally{globalThis.document=old;}
});
test('bridge connection creates an eight-container loading page before settings can be read',async()=>{
 const old=globalThis.document;globalThis.document={createElement:()=>({textContent:'',append:()=>{}})} as unknown as Document;
 try{
  const pages:any[]=[];const d=new Display({replaceChildren:()=>{},append:()=>{}} as unknown as HTMLElement,false);
  await d.connect(async()=>({onEvenHubEvent:()=>{},createStartUpPageContainer:async(p:any)=>{assert(p.textObject.length<=8);pages.push(p);return 0;}} as any));
  assert.equal(pages.length,1);assert(pages[0].textObject.some((t:any)=>t.content==='Reading saved settings…'));
 }finally{globalThis.document=old;}
});

test('calendar icon and full-width separators obey SDK limits and repaint after text changes',async()=>{
 const old=globalThis.document;globalThis.document={createElement:()=>({textContent:'',append:()=>{},prepend:()=>{}})} as unknown as Document;
 try{
  const pages:any[]=[],images:any[]=[],writes:any[]=[];const d=new Display({replaceChildren:()=>{},append:()=>{}} as unknown as HTMLElement,false);
  let failure='';d.onError=e=>{failure=e;};
  d.bridge={createStartUpPageContainer:async(p:any)=>{pages.push(p);return 0;},rebuildPageContainer:async(p:any)=>{pages.push(p);return true;},textContainerUpgrade:async(p:any)=>{writes.push(p);return true;},updateImageRawData:async(p:any)=>{images.push(p);return 'success';}} as any;
  d.show({title:'DayFrame',lines:['All calendars'],footer:'',calendarIcon:true});await d.idle();assert.equal(images.length,1);assert.equal(pages[0].textObject[1].xPosition,pages[0].imageObject[0].xPosition+30);
  const screen={title:'Today',lines:['› All Day · One','Work','  2:30pm · Two','Work','  3:30pm · Three','Personal'],footer:'',dayBreaks:[2,4]};
  d.show(screen);await d.idle();assert.equal(failure,'');const page=pages.at(-1);assert.equal(page.textObject.length,8);assert.equal(page.imageObject.length,4);assert.equal(page.containerTotalNum,12);assert.deepEqual(validateEvenHubPageContainer(page),{valid:true});
  for(let i=0;i<4;i+=2){const left=page.imageObject[i],right=page.imageObject[i+1];assert.equal(left.xPosition,4);assert.equal(left.width,284);assert.equal(right.xPosition,288);assert.equal(right.width,284);assert.equal(left.yPosition,right.yPosition);}
  const count=images.length;d.show({...screen,lines:screen.lines.map(l=>l.replace('› ','  '))});await d.idle();assert.equal(pages.length,2,'cursor changes reuse layout');assert.equal(images.length,count+4,'repaint lines after text writes');
  d.show({...screen,dayBreaks:[],lines:['Only event','']});await d.idle();assert.equal(pages.at(-1).imageObject.length,0,'remove separators when no day boundary is visible');
 }finally{globalThis.document=old;}
});

test('outline and centered column preserve one left edge and a stable cursor gutter',async()=>{
 const screen={title:'DayFrame',lines:['› Short','  A considerably longer menu item','  Tiny'],footer:'',calendarIcon:true};
 const g=screenGeometry(screen);assert(g.left>24);assert(Math.abs(g.left+g.width/2-288)<=.5);
 const moved=screenGeometry({...screen,lines:['  Short','› A considerably longer menu item','  Tiny']});assert.equal(moved.left,g.left);assert.equal(moved.width,g.width);
 const old=globalThis.document;globalThis.document={createElement:()=>({textContent:'',append:()=>{},prepend:()=>{}})} as unknown as Document;
 try{let page:any;const d=new Display({replaceChildren:()=>{},append:()=>{}} as unknown as HTMLElement,false);d.bridge={createStartUpPageContainer:async(p:any)=>{page=p;return 0;},updateImageRawData:async()=> 'success'} as any;d.show(screen);await d.idle();
 assert.equal(page.textObject[0].borderWidth,1);assert.equal(page.textObject[0].borderRadius,0);assert(page.textObject.slice(2).every((t:any)=>t.xPosition===g.left&&t.width===g.width));assert.deepEqual(validateEvenHubPageContainer(page),{valid:true});
 }finally{globalThis.document=old;}
 const long=screenGeometry({...screen,lines:['An exceptionally long line '.repeat(50)]});assert.equal(long.left>=24,true);assert(long.width<=528);
});

test('every inline date centers independently of the event column',()=>{
 const screen={title:'Saturday, September 12',lines:['  2:30pm · A much longer event title','Sunday, September 13','  All Day · Short'],footer:'',dayBreaks:[1]};
 const g=screenGeometry(screen);assert(Math.abs(g.rowLefts[1]+g.rowWidths[1]/2-288)<=.5);assert.equal(g.rowLefts[0],g.rowLefts[2]);assert(g.rowWidths[1]<g.rowWidths[0]);
});
