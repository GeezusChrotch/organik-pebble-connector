import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeBMP, pebbleColor } from '../src/image-preview.js';

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
