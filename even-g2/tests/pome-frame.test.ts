import test from 'node:test';import assert from 'node:assert/strict';import {Display} from '../pome/src/display';import {frameBMP} from '../pome/src/images';
const node=()=>({append(){},replaceChildren(){},textContent:'',src:'',alt:''});(globalThis as any).document={createElement:node};
test('Pome frame surrounds every screen, stays below inset content and restores after system overlay',async()=>{
 for(const mode of ['menu','text','camera','compact']){
  const pages:any[]=[];const d=new Display(node() as any,false);(d as any).compactCamera=mode==='compact';
  d.bridge={createStartUpPageContainer:async(p:any)=>{pages.push(p);return 0;},rebuildPageContainer:async(p:any)=>{pages.push(p);return true;},textContainerUpgrade:async()=>true,updateImageRawData:async()=> 'success'} as any;
  d.show({title:'Pome',lines:['One','Two'],footer:'Select',...(mode==='menu'?{icons:['room','scene'] as any}:{}),...(['camera','compact'].includes(mode)?{image:frameBMP({encoding:'gcolor6',width:1,height:1,pixels:btoa(String.fromCharCode(252)),age:0})}:{})});await(d as any).chain;
  function verify(p:any){const c=p.textObject.filter((t:any)=>t.isEventCapture);assert.equal(c.length,1);assert.equal(c[0].content.trim(),'');assert.deepEqual([c[0].width,c[0].height,c[0].borderWidth,c[0].borderColor,c[0].borderRadius,c[0].zOrderIndex],[576,288,1,8,0,0]);const visible=[...p.textObject.filter((t:any)=>t!==c[0]),...p.imageObject];for(const t of visible){assert.ok(t.xPosition>=1&&t.yPosition>=1);assert.ok(t.xPosition+t.width<=575&&t.yPosition+t.height<=287);assert.ok(t.zOrderIndex>0);}assert.ok(p.textObject.length<=8&&p.imageObject.length<=4&&p.containerTotalNum<=12);assert.equal(new Set([c[0],...visible].map(t=>t.zOrderIndex)).size,p.containerTotalNum);}
  verify(pages[0]);(d as any).event({sysEvent:{eventType:4}});(d as any).event({sysEvent:{eventType:5}});await(d as any).chain;assert.equal(pages.length,2);verify(pages[1]);
 }
});
