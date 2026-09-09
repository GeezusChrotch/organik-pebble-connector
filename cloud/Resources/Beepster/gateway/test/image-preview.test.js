import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeBMP, pebbleColor } from '../src/image-preview.js';

test('native sips RGBA bitmaps composite transparency and validate masks',()=>{
  const bmp=Buffer.alloc(146);bmp.write('BM');bmp.writeUInt32LE(138,10);
  bmp.writeUInt32LE(124,14);bmp.writeInt32LE(2,18);bmp.writeInt32LE(-1,22);
  bmp.writeUInt16LE(32,28);bmp.writeUInt32LE(3,30);
  [0xff0000,0xff00,0xff,0xff000000].forEach((mask,i)=>bmp.writeUInt32LE(mask,54+i*4));
  bmp.set([0,0,0,0,0,0,255,255],138);
  assert.deepEqual([...decodeBMP(bmp).pixels],[255,240]);
  bmp.writeUInt32LE(0,54);assert.throws(()=>decodeBMP(bmp),/unsupported/);
  bmp.writeUInt32LE(0,30); // BI_RGB's fourth byte is unused, including zero.
  assert.deepEqual([...decodeBMP(bmp).pixels],[192,240]);
});

function bmp24(width, signedHeight, rows) {
  const height = Math.abs(signedHeight);
  const stride = Math.ceil((width * 3) / 4) * 4;
  const buffer = Buffer.alloc(54 + stride * height);
  buffer.write('BM');
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(signedHeight, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  rows.forEach((row, y) => row.forEach(([red, green, blue], x) => {
    const offset = 54 + y * stride + x * 3;
    buffer[offset] = blue;
    buffer[offset + 1] = green;
    buffer[offset + 2] = red;
  }));
  return buffer;
}

test('Pebble colors are quantized into the Time 2 color format', () => {
  assert.equal(pebbleColor(255, 0, 0), 0xf0);
  assert.equal(pebbleColor(0, 255, 0), 0xcc);
  assert.equal(pebbleColor(0, 0, 255), 0xc3);
});

test('BMP previews are converted to top-down watch-native pixels', () => {
  const bottomUp = bmp24(2, 2, [
    [[0, 0, 255], [255, 255, 255]],
    [[255, 0, 0], [0, 255, 0]]
  ]);
  const preview = decodeBMP(bottomUp);
  assert.deepEqual({width:preview.width,height:preview.height}, {width:2,height:2});
  assert.deepEqual([...preview.pixels], [0xf0, 0xcc, 0xc3, 0xff]);
});
