import test from 'node:test';
import assert from 'node:assert/strict';
import {Display} from '../pome/src/display';
// Minimal preview DOM; bridge calls below are the subject of this regression test.
const node=()=>({append(){},replaceChildren(){},textContent:'',src:'',alt:''});
(globalThis as any).document={createElement:node};
test('camera layout has no overlapping text and capture age follows image acceptance',async()=>{
 const display=new Display(node() as any,false);const calls:any[]=[];
 (display as any).started=true;
 display.bridge={rebuildPageContainer:async(p:any)=>{calls.push(p);return true;},updateImageRawData:async()=>{calls.push('image');return 'success';},textContainerUpgrade:async(p:any)=>{calls.push(p);return true;}} as any;
 display.show({title:'Camera',lines:['Refresh'],footer:'Captured 3s ago',image:new Uint8Array([1,2])});
 await (display as any).chain;
 const p=calls[0],image=p.imageObject[0];
 for(const t of p.textObject)assert.ok(t.yPosition+t.height<=image.yPosition||t.yPosition>=image.yPosition+image.height);
 assert.equal(p.textObject[2].content,'Sending camera image…');assert.equal(calls[1],'image');assert.equal(calls[2].content,'Captured 3s ago');
});
test('failed image transfer replaces misleading capture age with an error',async()=>{
 const display=new Display(node() as any,false);const captions:string[]=[];let status='';(display as any).started=true;
 display.onDisplayStatus=s=>status=s;
 display.bridge={rebuildPageContainer:async()=>true,updateImageRawData:async()=> 'sendFailed',textContainerUpgrade:async(p:any)=>{captions.push(p.content);return true;}} as any;
 display.show({title:'Camera',lines:[],footer:'Captured 3s ago',image:new Uint8Array([1])});await (display as any).chain;
 assert.match(status,/sendFailed/);assert.deepEqual(captions,['Image failed · retry on phone']);
});
