import test from 'node:test';
import assert from 'node:assert/strict';
import processing from '../src/pebble-image.cjs';
const {quantizeImage, normalizeImageMode}=processing;
test('image modes validate dimensions, remain opaque and deterministic',()=>{
  assert.equal(normalizeImageMode('unknown'),'natural');
  assert.throws(()=>quantizeImage({width:201,height:1,rgba:[]}));
  const rgba=Uint8Array.from({length:32*32*4},(_,i)=>i%4===3?255:(i*17)%256);
  for(const mode of ['natural','high-contrast','original']) {
    const input={width:32,height:32,rgba,mode};
    const output=quantizeImage(input);
    assert.equal(output.length,1024);
    assert.ok(output.every(v=>v>=192));
    assert.deepEqual(output,quantizeImage(input));
  }
});
test('Original exactly preserves prior opaque rounding and alpha composites white',()=>{
  const rgba=Uint8Array.from({length:256*4},(_,i)=>i%4===3?255:Math.floor(i/4));
  const output=quantizeImage({width:128,height:2,rgba,mode:'original'});
  for(let i=0;i<256;i++){const c=Math.round(i/85);assert.equal(output[i],192|(c<<4)|(c<<2)|c);}
  assert.equal(quantizeImage({width:1,height:1,rgba:[0,0,0,0]})[0],255);
});
test('drawings have no diffusion noise while photos use dithering',()=>{
  const rgba=Uint8Array.from({length:32*32*4},(_,i)=>i%4===3?255:120);
  const drawing=quantizeImage({width:32,height:32,rgba,kind:'drawing'});
  assert.equal(new Set(drawing).size,1);
  const photo=quantizeImage({width:32,height:32,rgba,kind:'photo'});
  assert.ok(new Set(photo).size>1);
});
