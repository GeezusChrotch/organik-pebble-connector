import {randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline';
import imageProcessing from './pebble-image.cjs';
let reader;
const pending=new Map();
export function decodeNativePreview(result,mode='natural') {
 if(result.error)throw Object.assign(Error(result.error),{code:result.code==='MEDIA_PERMISSION'?'EPERM':result.code,mediaStage:'native-read'});
 if(!Array.isArray(result.frames)||!result.frames.length||result.frames.length>6)throw Error('Invalid native preview');
 const first=result.frames[0];const pixels=[];
 for(const f of result.frames){if(!Number.isInteger(f.width)||!Number.isInteger(f.height)||f.width<1||f.height<1||f.width>180||f.height>180||f.width!==first.width||f.height!==first.height)throw Error('Invalid native preview dimensions');const rgba=Buffer.from(f.rgba||'','base64');if(rgba.length!==f.width*f.height*4)throw Error('Invalid native preview pixels');pixels.push(Buffer.from(imageProcessing.quantizeImage({width:f.width,height:f.height,rgba,mode,kind:'photo'})));}
 return {width:first.width,height:first.height,frames:pixels.length,pixels:Buffer.concat(pixels)};
}
export async function nativePreview(path,kind,mode) {
 if(!reader){reader=createInterface({input:process.stdin});reader.on('line',line=>{if(line.length>2*1024*1024)return;try{const data=JSON.parse(line);const item=pending.get(data.id);if(item){pending.delete(data.id);clearTimeout(item.timer);item.resolve(data);}}catch{}});}
 const id=randomUUID();const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Native attachment preview timed out'));},15000);pending.set(id,{resolve,timer});process.stdout.write('BEEPSTER_MEDIA '+JSON.stringify({id,path,kind})+'\n');});
 return decodeNativePreview(result,mode);
}
