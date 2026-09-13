import test from 'node:test';import assert from 'node:assert/strict';
import {transferImage} from '../src/image-transfer';import {threadBitmaps} from '../src/thread-bitmaps';import {decodeImage} from './png-helper';
test('compressed thread tiles preserve every grayscale pixel, including padded rows',async()=>{
 const tiles=threadBitmaps(['apple_messages','message',undefined,'apple_messages'],[false,true,false,true,false,true],'message',[80,450]);let original=0,compressed=0;
 for(const bmp of tiles){const png=await transferImage(bmp);assert.equal(png[0],137);assert.deepEqual(Array.from(decodeImage(png).subarray(54)),Array.from(bmp.subarray(54)));original+=bmp.length;compressed+=png.length;}
 assert.ok(compressed<original/10);console.log(`Thread image payload: ${original} -> ${compressed} bytes`);
});

test('frame inset removes only the top scanline and preserves every remaining pixel',async()=>{
 const {cropTopRow}=await import('../src/window-frame');
 for(const bmp of threadBitmaps(['apple_messages'],[false,true],'message',[80,450])){const source=new DataView(bmp.buffer),height=source.getInt32(22,true),width=source.getInt32(18,true),stride=Math.ceil(width*3/4)*4,cropped=cropTopRow(bmp);assert.equal(new DataView(cropped.buffer).getInt32(22,true),height-1);assert.deepEqual(cropped.subarray(54),bmp.subarray(54,bmp.length-stride));}
});
