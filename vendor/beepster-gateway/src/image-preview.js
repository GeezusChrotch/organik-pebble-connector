import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';

const execFile = promisify(execFileCallback);

export function pebbleColor(red, green, blue) {
  return 0xc0 |
    (Math.round(red / 85) << 4) |
    (Math.round(green / 85) << 2) |
    Math.round(blue / 85);
}

export function decodeBMP(buffer) {
  if (buffer.length < 54 || buffer.toString('ascii', 0, 2) !== 'BM') {
    throw new Error('Image converter returned an invalid bitmap');
  }
  const offset = buffer.readUInt32LE(10);
  const width = buffer.readInt32LE(18);
  const signedHeight = buffer.readInt32LE(22);
  const bitsPerPixel = buffer.readUInt16LE(28);
  const compression = buffer.readUInt32LE(30);
  const height = Math.abs(signedHeight);
  if (width < 1 || height < 1 || width > 180 || height > 180 || bitsPerPixel !== 24 || compression !== 0) {
    throw new Error('Image converter returned an unsupported bitmap');
  }
  const stride = Math.ceil((width * 3) / 4) * 4;
  if (offset + stride * height > buffer.length) throw new Error('Image bitmap is truncated');
  const pixels = Buffer.alloc(width * height);
  const topDown = signedHeight < 0;
  for (let y = 0; y < height; y++) {
    const sourceY = topDown ? y : height - y - 1;
    const row = offset + sourceY * stride;
    for (let x = 0; x < width; x++) {
      const pixel = row + x * 3;
      pixels[y * width + x] = pebbleColor(buffer[pixel + 2], buffer[pixel + 1], buffer[pixel]);
    }
  }
  return { width, height, pixels };
}

export async function createWatchPreview(inputPath, outputPath, run = execFile) {
  await run('/usr/bin/sips', [
    '-s', 'format', 'bmp',
    '--resampleHeightWidthMax', '180',
    inputPath,
    '--out', outputPath
  ]);
  return decodeBMP(await readFile(outputPath));
}
