import test from 'node:test';import assert from 'node:assert/strict';
import {Display as Pome} from '../pome/src/display';
import {Display as Beepster} from '../beepster/src/display';
import {frameBMP} from '../pome/src/images';
const node=()=>({append(){},replaceChildren(){},textContent:'',src:'',alt:''});
(globalThis as any).document={createElement:node};
for(const [name,Display] of [['Pome',Pome],['Beepster',Beepster]] as const)test(`${name} blank gestures use full-screen background without changing rows or input routing`,async()=>{
 for(const mode of ['menu','text','image']){
  const d=new Display(node() as any,false),pages:any[]=[];
  d.bridge={createStartUpPageContainer:async(p:any)=>{pages.push(p);return 0;},updateImageRawData:async()=> 'success',textContainerUpgrade:async()=>true} as any;
  d.show({title:name,lines:['First','Second'],footer:'',...(mode==='menu'?{icons:(name==='Pome'?['light','light']:['message','message']) as any}:{}),...(mode==='image'?{image:frameBMP({encoding:'gcolor6',width:1,height:1,pixels:btoa(String.fromCharCode(252)),age:0})}:{})});await (d as any).chain;
  const p=pages[0],capture=p.textObject.filter((t:any)=>t.isEventCapture===1);assert.equal(capture.length,1);
  const c=capture[0];if(!c.content.trim()){assert.ok(c.height>=40);assert.equal(c.paddingLength,0);assert.equal(c.borderWidth,1);assert.equal(c.yPosition,0);assert.equal(c.xPosition,0);assert.equal(c.width,576);assert.equal(c.height,288);assert.equal(c.zOrderIndex,0);const visible=[...p.textObject.filter((t:any)=>t!==c),...p.imageObject];assert.ok(visible.every((t:any)=>t.zOrderIndex>c.zOrderIndex));assert.equal(new Set([c,...visible].map((t:any)=>t.zOrderIndex)).size,visible.length+1);}else{assert.equal(name,'Pome');assert.equal(mode,'text');assert.equal(c.content,'First\nSecond');}
  if(mode==='menu'){const rows=p.textObject.filter((t:any)=>t.containerName.startsWith('row-'));assert.equal(rows[0].content,'First');assert.equal(rows[0].yPosition,64);assert.equal(rows[1].yPosition,96);}
  const events:number[]=[];d.onInput=t=>events.push(t);for(const eventType of [0,1,2,3])(d as any).event({textEvent:{eventType}});assert.deepEqual(events,[0,1,2,3]);
 }
});
