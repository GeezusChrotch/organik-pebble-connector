export interface CameraFrame {encoding:string;width:number;height:number;pixels:string;age:number;snapshotAt?:number;refreshError?:string}
// Existing HomeKit frame transport is packed RGB222. Convert it once into a
// grayscale BMP accepted by the Even SDK; never interpret stale pixels as fresh.
export function frameBMP(frame:CameraFrame,contrast=false):Uint8Array {
 const {width,height}=frame;if(frame.encoding!=='gcolor6'||!Number.isInteger(width)||!Number.isInteger(height)||width<1||width>2048||height<1||height>228)throw new Error('Unsupported camera frame');
 const data=Uint8Array.from(atob(frame.pixels),c=>c.charCodeAt(0));if(data.length!==Math.ceil(width*height*6/8))throw new Error('Incomplete camera frame');
 const w=288,h=144,stride=w*3,offset=54,result=new Uint8Array(offset+stride*h),view=new DataView(result.buffer);
 result[0]=66;result[1]=77;view.setUint32(2,result.length,true);view.setUint32(10,offset,true);view.setUint32(14,40,true);view.setInt32(18,w,true);view.setInt32(22,h,true);view.setUint16(26,1,true);view.setUint16(28,24,true);view.setUint32(34,stride*h,true);
 const scale=Math.min(w/width,h/height),dw=width*scale,dh=height*scale,dx=(w-dw)/2,dy=(h-dh)/2;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  if(x<dx||y<dy||x>=dx+dw||y>=dy+dh)continue;
  const sx=Math.min(width-1,Math.floor((x-dx)/scale)),sy=Math.min(height-1,Math.floor((y-dy)/scale));const bit=(sy*width+sx)*6,b=bit>>3,shift=bit%8,word=(data[b]<<8)|(data[b+1]||0),c=(word>>(10-shift))&63;
  let lum=(((c>>4)&3)*.2126+((c>>2)&3)*.7152+(c&3)*.0722)*85;if(contrast)lum=(lum-128)*1.5+128;const g=Math.round(Math.max(0,Math.min(255,lum))/17)*17;
  const dest=offset+(h-1-y)*stride+x*3;result[dest]=result[dest+1]=result[dest+2]=g;
 }return result;
}
