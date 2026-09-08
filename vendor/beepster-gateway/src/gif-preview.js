import omggif from 'omggif';
import imageProcessing from './pebble-image.cjs';
import {Worker, parentPort, workerData} from 'node:worker_threads';
import {readFile, stat} from 'node:fs/promises';

// Small bounded loops: <=31,104 packed bytes, no full-size frames on the watch.
export function decodeGIF(input, mode = 'natural') {
  if (input.length > 8 * 1024 * 1024) throw new Error('GIF too large');
  const reader = new omggif.GifReader(input);
  const area = reader.width * reader.height;
  if (!area || area > 1024 * 1024 || reader.numFrames() > 300) throw new Error('GIF exceeds decode budget');
  const scale = Math.min(1, 72 / Math.max(reader.width, reader.height));
  const width = Math.max(1, Math.round(reader.width * scale)), height = Math.max(1, Math.round(reader.height * scale));
  let canvas = new Uint8Array(area * 4), time = 0, work = 0;
  const frames = [];
  for (let i = 0; i < reader.numFrames() && frames.length < 6; i++) {
    if ((work += area) > 20 * 1024 * 1024) throw new Error('GIF exceeds decode budget');
    const info = reader.frameInfo(i);
    if (info.x + info.width > reader.width || info.y + info.height > reader.height) throw new Error('Invalid GIF frame');
    const restore = info.disposal === 3 ? canvas.slice() : null;
    reader.decodeAndBlitFrameRGBA(i, canvas);
    const end = time + Math.max(20, (info.delay || 10) * 10);
    while (frames.length < 6 && frames.length * 250 < end) {
      const rgba = new Uint8Array(width * height * 4);
      // Box averaging retains contrast/detail better than nearest-neighbor sampling.
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const x0 = Math.floor(x * reader.width / width), x1 = Math.ceil((x + 1) * reader.width / width);
        const y0 = Math.floor(y * reader.height / height), y1 = Math.ceil((y + 1) * reader.height / height);
        const sum = [0,0,0]; let count = 0;
        for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) {
          const offset = (sy * reader.width + sx) * 4, a = canvas[offset + 3] / 255;
          for (let c = 0; c < 3; c++) sum[c] += canvas[offset + c] * a + 255 * (1 - a);
          count++;
        }
        rgba.set([...sum.map(v => Math.round(v / count)), 255], (y * width + x) * 4);
      }
      frames.push(Buffer.from(imageProcessing.quantizeImage({width, height, rgba, mode, kind: 'photo'})));
    }
    if (info.disposal === 2) {
      for (let y = info.y; y < info.y + info.height; y++) canvas.fill(0, (y * reader.width + info.x) * 4, (y * reader.width + info.x + info.width) * 4);
    } else if (restore) canvas = restore;
    time = end;
  }
  if (frames.length < 2 || frames.every(frame => frame.equals(frames[0]))) throw new Error('Static GIF');
  return {width, height, pixels: frames[0], frames: frames.length, framePixels: Buffer.concat(frames)};
}

export function createGIFPreview(inputPath, mode) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), {
      workerData: {inputPath, mode},
      // Decoder files need no host flags. Eval-only and expanded test-runner
      // flags can be invalid when explicitly passed to a file worker.
      execArgv: []
    });
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('GIF conversion timed out')); }, 5000);
    worker.once('message', result => {
      clearTimeout(timer);
      if (result.error) reject(Object.assign(new Error(result.error), {code: result.code}));
      else resolve({...result, pixels: Buffer.from(result.pixels), framePixels: Buffer.from(result.framePixels)});
    });
    worker.once('error', error => { clearTimeout(timer); reject(error); });
    worker.once('exit', code => { clearTimeout(timer); if (code) reject(new Error('GIF conversion failed')); });
  });
}

if (parentPort && workerData?.inputPath) {
  try {
    if ((await stat(workerData.inputPath)).size > 8 * 1024 * 1024) throw new Error('GIF too large');
    parentPort.postMessage(decodeGIF(await readFile(workerData.inputPath), workerData.mode));
  } catch (error) { parentPort.postMessage({error: error.message, code: error.code}); }
}
