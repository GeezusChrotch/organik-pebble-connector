import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, open } from 'node:fs/promises';
import imageProcessing from './pebble-image.cjs';
import { createGIFPreview } from './gif-preview.js';

const execFile = promisify(execFileCallback);

export function pebbleColor(red, green, blue) {
  return 0xc0 |
    (Math.round(red / 85) << 4) |
    (Math.round(green / 85) << 2) |
    Math.round(blue / 85);
}

export function decodeBMP(buffer, { mode = 'original' } = {}) {
  if (buffer.length < 54 || buffer.toString('ascii', 0, 2) !== 'BM') {
    throw new Error('Image converter returned an invalid bitmap');
  }
  const offset = buffer.readUInt32LE(10);
  const width = buffer.readInt32LE(18);
  const signedHeight = buffer.readInt32LE(22);
  const bitsPerPixel = buffer.readUInt16LE(28);
  const compression = buffer.readUInt32LE(30);
  const height = Math.abs(signedHeight);
  const rgba32 = bitsPerPixel === 32 && compression === 3 && buffer.length >= 70 &&
    buffer.readUInt32LE(54) === 0x00ff0000 && buffer.readUInt32LE(58) === 0x0000ff00 &&
    buffer.readUInt32LE(62) === 0x000000ff && buffer.readUInt32LE(66) === 0xff000000;
  // BI_RGB 32-bit reserves its fourth byte; it is not an alpha channel.
  const rgb32 = bitsPerPixel === 32 && compression === 0;
  if (width < 1 || height < 1 || width > 180 || height > 180 ||
      (!(bitsPerPixel === 24 && compression === 0) && !rgba32 && !rgb32)) {
    throw new Error('Image converter returned an unsupported bitmap');
  }
  const bytesPerPixel = bitsPerPixel / 8;
  const stride = Math.ceil((width * bytesPerPixel) / 4) * 4;
  if (offset + stride * height > buffer.length) throw new Error('Image bitmap is truncated');
  const rgba = new Uint8Array(width * height * 4);
  const topDown = signedHeight < 0;
  for (let y = 0; y < height; y++) {
    const sourceY = topDown ? y : height - y - 1;
    const row = offset + sourceY * stride;
    for (let x = 0; x < width; x++) {
      const pixel = row + x * bytesPerPixel;
      rgba.set([buffer[pixel + 2], buffer[pixel + 1], buffer[pixel], rgba32 ? buffer[pixel + 3] : 255], (y * width + x) * 4);
    }
  }
  return { width, height, pixels: Buffer.from(imageProcessing.quantizeImage({ width, height, rgba, mode, kind: 'photo' })) };
}

export async function createWatchPreview(inputPath, outputPath, run = execFile, { mode = 'natural', kind = 'image' } = {}) {
  // stat/access may succeed on protected Apple Messages files even when reads
  // are denied by macOS. Preserve the actual access error before sips masks it.
  const input = await open(inputPath, 'r');
  try { await input.read(Buffer.alloc(1), 0, 1, 0); } finally { await input.close(); }
  if (kind === 'gif') {
    try { return await createGIFPreview(inputPath, mode); }
    catch (error) {
      if (['EPERM','EACCES'].includes(error.code)) throw error;
      // Unsupported/oversized animations retain the existing still preview.
    }
  }
  await run('/usr/bin/sips', [
    '-s', 'format', 'bmp',
    '--resampleHeightWidthMax', '180',
    inputPath,
    '--out', outputPath
  ], {timeout: 10000, maxBuffer: 256 * 1024});
  return decodeBMP(await readFile(outputPath), { mode });
}
