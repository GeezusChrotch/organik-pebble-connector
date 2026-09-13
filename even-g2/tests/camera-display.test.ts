import {frameBMP} from '../pome/src/images';
const frame=()=>frameBMP({encoding:'gcolor6',width:1,height:1,pixels:btoa(String.fromCharCode(252)),age:3});
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
 display.show({title:'Camera',lines:['Refresh'],footer:'Captured 3s ago',image:frame()});
 await (display as any).chain;
 const p=calls[0],image=p.imageObject[0];
 for(const t of p.textObject.filter((t:any)=>!t.isEventCapture))assert.ok(t.xPosition+t.width<=image.xPosition||t.yPosition+t.height<=image.yPosition||t.yPosition>=image.yPosition+image.height);
 assert.equal(p.textObject[2].content.trim(),'Sending camera image…');assert.equal(calls[1],'image');assert.deepEqual(calls.slice(1,5),['image','image','image','image']);assert.equal(calls[5].content.trim(),'Captured 3s ago');assert.equal(p.textObject[1].content.trim(),'');assert.equal(p.imageObject.length,4);assert.equal(p.imageObject[3].xPosition+p.imageObject[3].width,504);
});
test('failed image transfer replaces misleading capture age with an error',async()=>{
 const display=new Display(node() as any,false);const captions:string[]=[];let status='';(display as any).started=true;
 display.onDisplayStatus=s=>status=s;
 display.bridge={rebuildPageContainer:async()=>true,updateImageRawData:async()=> 'sendFailed',textContainerUpgrade:async(p:any)=>{captions.push(p.content);return true;}} as any;
 display.show({title:'Camera',lines:[],footer:'Captured 3s ago',image:frame()});await (display as any).chain;await (display as any).chain;
 assert.match(status,/sendFailed/);assert.deepEqual(captions.map(s=>s.trim()),['Image failed · retry on phone']);
});
test('camera tiles reassemble without seams, flipping, or pixel loss',async()=>{
 const {cameraTiles}=await import('../pome/src/images');const bmp=frame();for(let i=54;i<bmp.length;i++)bmp[i]=(i*31)%251;
 const tiles=cameraTiles(bmp);assert.equal(tiles.length,4);
 for(let i=0;i<4;i++){const tile=tiles[i],v=new DataView(tile.buffer);assert.equal(v.getInt32(18,true),216);assert.equal(v.getInt32(22,true),108);
  for(let y=0;y<108;y++){const start=54+((1-Math.floor(i/2))*108+y)*432*3+(i%2)*216*3;assert.deepEqual(tile.subarray(54+y*648,54+(y+1)*648),bmp.subarray(start,start+648));}}
});
test('rejected large camera automatically retries once at compatible size and retains it',async()=>{
 const d=new Display(node() as any,false);const pages:any[]=[],captions:string[]=[];let status='';(d as any).started=true;d.onDisplayStatus=s=>status=s;
 d.bridge={rebuildPageContainer:async(p:any)=>{pages.push(p);return true;},updateImageRawData:async()=>pages.at(-1).imageObject.length===4?'sendFailed':'success',textContainerUpgrade:async(p:any)=>{captions.push(p.content.trim());return true;}} as any;
 const s={title:'Camera',lines:[],footer:'Captured 3s ago',image:frame()};d.show(s);await (d as any).chain;await (d as any).chain;
 assert.equal(pages.length,2);assert.equal(pages[1].imageObject.length,1);const image=pages[1].imageObject[0];assert.equal(image.width,288);assert.equal(image.height,144);assert.equal(image.xPosition+image.width/2,288);assert.equal(image.yPosition+image.height/2,144);assert.deepEqual(captions,['Captured 3s ago']);assert.match(status,/compatibility/);
 d.retry();await (d as any).chain;assert.equal(pages.at(-1).imageObject.length,1);
});
test('decorated camera obeys four-image firmware limit without shrinking the snapshot',async()=>{
 const d=new Display(node() as any,false),pages:any[]=[],uploads:any[]=[],captions:string[]=[];(d as any).started=true;
 d.bridge={rebuildPageContainer:async(p:any)=>{pages.push(p);return p.imageObject.length<=4;},updateImageRawData:async(p:any)=>{uploads.push(p);return 'success';},textContainerUpgrade:async(p:any)=>{captions.push(p.content.trim());return true;}} as any;
 d.show({title:'Driveway',titleIcon:'camera',lines:[],footer:'Captured 3s ago',image:frame()});await(d as any).chain;await(d as any).chain;
 assert.equal(pages.length,1);assert.equal(pages[0].imageObject.length,4);assert.equal(uploads.length,4);assert.deepEqual(captions,['Captured 3s ago']);
 const p=pages[0];assert.equal(new Set([...p.imageObject,...p.textObject].map(t=>t.zOrderIndex)).size,7);
 for(const i of p.imageObject){assert.equal(i.width,216);assert.equal(i.height,126);assert.ok(i.zOrderIndex<p.textObject[0].zOrderIndex);}
 assert.equal(p.imageObject[3].yPosition+p.imageObject[3].height,253);
 const canvas=new Uint8Array(432*252*3);
 uploads.forEach((u,i)=>{for(let y=0;y<126;y++)canvas.set(u.imageData.subarray(54+y*648,54+(y+1)*648),((1-Math.floor(i/2))*126+y)*1296+(i%2)*648);});
 assert.deepEqual(canvas.subarray(0,432*216*3),frame().subarray(54));
 const header=p.textObject[0],xs=[header.xPosition-36,header.xPosition+header.width+16];
 const {iconBMP}=await import('../pome/src/icons');const glyph=iconBMP(['camera']);
 for(const x of xs)for(let y=0;y<32;y++)assert.deepEqual(canvas.subarray((220+y)*1296+Math.round(x-72)*3,(220+y)*1296+Math.round(x-72)*3+60),glyph.subarray(54+y*60,54+(y+1)*60));
});
test('G2 grayscale keeps fine shades and correct orientation without palette banding',()=>{
 const pixels=Uint8Array.from({length:432*216},(_,i)=>i%256);
 const bmp=frameBMP({encoding:'gray8',width:432,height:216,pixels:Buffer.from(pixels).toString('base64'),age:3});
 for(let y=0;y<216;y++)for(let x=0;x<432;x++){const at=54+((215-y)*432+x)*3;assert.equal(bmp[at],pixels[y*432+x]);assert.equal(bmp[at+1],bmp[at]);assert.equal(bmp[at+2],bmp[at]);}
 assert.throws(()=>frameBMP({encoding:'gray8',width:2,height:2,pixels:'AA==',age:0}),/Incomplete/);
});
test('resizing blends edges while preserving image aspect and black margins',()=>{
 const bmp=frameBMP({encoding:'gray8',width:2,height:1,pixels:Buffer.from([0,255]).toString('base64'),age:0});
 const row=Array.from({length:432},(_,x)=>bmp[54+x*3]);assert.equal(row[0],0);assert.equal(row[431],255);assert.ok(new Set(row).size>100);for(let i=1;i<row.length;i++)assert.ok(row[i]>=row[i-1]);
 const portrait=frameBMP({encoding:'gray8',width:1,height:2,pixels:Buffer.from([255,255]).toString('base64'),age:0});assert.equal(portrait[54],0);assert.equal(portrait[54+216*3],255);
});
test('camera dithering preserves average brightness with only adjacent display shades',async()=>{
 const {ditherCameraBMP}=await import('../pome/src/images');
 const source=frameBMP({encoding:'gray8',width:432,height:216,pixels:Buffer.alloc(432*216,120).toString('base64'),age:0});const before=source.slice();const out=ditherCameraBMP(source);
 assert.deepEqual(source,before);assert.deepEqual(out,ditherCameraBMP(source));
 const shades=new Set<number>();let total=0;for(let i=54;i<out.length;i+=3){shades.add(out[i]);total+=out[i];assert.equal(out[i],out[i+1]);assert.equal(out[i],out[i+2]);}
 assert.deepEqual([...shades].sort((a,b)=>a-b),[119,136]);assert.ok(Math.abs(total/(432*216)-120)<.1);
});
test('dithering keeps black margins and white highlights exact',async()=>{
 const {ditherCameraBMP}=await import('../pome/src/images');const pixels=Buffer.alloc(432*216);for(let i=0;i<pixels.length;i++)pixels[i]=i%432<100?0:i%432>330?255:128;
 const source=frameBMP({encoding:'gray8',width:432,height:216,pixels:pixels.toString('base64'),age:0}),out=ditherCameraBMP(source);
 for(let i=54;i<out.length;i+=3){assert.equal(out[i]%17,0);if(source[i]===0||source[i]===255)assert.equal(out[i],source[i]);}
});
test('detail enhancement strengthens a fine line with bounded correction and no flat-field noise',async()=>{
 const {sharpenCameraBMP}=await import('../pome/src/images');const pixels=Buffer.alloc(432*216,120);for(let y=0;y<216;y++)pixels[y*432+216]=140;
 const source=frameBMP({encoding:'gray8',width:432,height:216,pixels:pixels.toString('base64'),age:0}),out=sharpenCameraBMP(source);
 assert.ok(out[54+216*3]-out[54+215*3]>50);assert.equal(out[54+100*3],120);
 for(let i=54;i<out.length;i+=3){assert.ok(Math.abs(out[i]-source[i])<=34);assert.equal(out[i],out[i+1]);assert.equal(out[i],out[i+2]);}
 const flat=frameBMP({encoding:'gray8',width:1,height:1,pixels:'eA==',age:0});const enhanced=sharpenCameraBMP(flat);assert.equal(enhanced[54+216*3],120);assert.equal(enhanced[54],0);
});
