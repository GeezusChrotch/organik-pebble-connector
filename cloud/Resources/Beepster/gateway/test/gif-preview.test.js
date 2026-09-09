import test from 'node:test';
import assert from 'node:assert/strict';
import omggif from 'omggif';
import {decodeGIF, createGIFPreview} from '../src/gif-preview.js';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

function fixture({disposal = 1, width = 4, height = 2, frames = 3} = {}) {
  const buffer = Buffer.alloc(20000);
  const writer = new omggif.GifWriter(buffer,width,height,{palette:[0xff0000,0x0000ff],loop:0});
  writer.addFrame(0,0,width,height,new Uint8Array(width*height),{delay:25});
  if (frames > 1) writer.addFrame(0,0,1,1,new Uint8Array([1]),{delay:25,disposal});
  if (frames > 2) writer.addFrame(width-1,0,1,1,new Uint8Array([1]),{delay:25});
  return buffer.subarray(0,writer.end());
}

test('GIF frames preserve timing, partial-frame composition and disposal', () => {
  const keep = decodeGIF(fixture(),'original');
  assert.equal(keep.frames,3);assert.equal(keep.framePixels.length,24);
  assert.equal(keep.framePixels[0],0xf0);assert.equal(keep.framePixels[8],0xc3);assert.equal(keep.framePixels[16],0xc3);
  const restore = decodeGIF(fixture({disposal:3}),'original');
  assert.equal(restore.framePixels[16],0xf0);
  const clear = decodeGIF(fixture({disposal:2}),'original');
  assert.equal(clear.framePixels[16],0xff);
});

test('GIF conversion is bounded, rejects static/malformed input and runs off the server event loop', async () => {
  const preview = decodeGIF(fixture({width:144,height:144}),'original');
  assert.equal(preview.width,72);assert.equal(preview.height,72);assert.ok(preview.framePixels.length<=32400);
  assert.throws(()=>decodeGIF(Buffer.alloc(9*1024*1024)),/too large/);
  assert.throws(()=>decodeGIF(fixture({frames:1})),/Static/);
  assert.throws(()=>decodeGIF(Buffer.from('bad')));
  const dir=await mkdtemp(join(tmpdir(),'beepster-gif-test-'));
  try {
    const path=join(dir,'sample.gif');await writeFile(path,fixture());
    const result=await createGIFPreview(path,'original');
    assert.equal(result.frames,3);assert.ok(Buffer.isBuffer(result.framePixels));
    const moduleURL=new URL('../src/gif-preview.js',import.meta.url).href;
    assert.equal(execFileSync(process.execPath,['--input-type=module','-e',
      `import {createGIFPreview} from ${JSON.stringify(moduleURL)}; const p=await createGIFPreview(${JSON.stringify(path)},'original'); console.log(p.frames);`],{encoding:'utf8'}).trim(),'3');
    await assert.rejects(createGIFPreview(join(dir,'missing.gif'),'original'),error=>error.code==='ENOENT');
  } finally {await rm(dir,{recursive:true,force:true});}
});
