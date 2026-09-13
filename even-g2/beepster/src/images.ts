import {iconBMP,type Icon} from './icons';
export interface CameraFrame {encoding:string;width:number;height:number;pixels:string;age:number;snapshotAt?:number;refreshError?:string}
// Existing HomeKit frame transport is packed RGB222. Convert it once into a
// grayscale BMP accepted by the Even SDK; never interpret stale pixels as fresh.
export function frameBMP(frame:CameraFrame,contrast=false):Uint8Array {
 const {width,height}=frame;if(!['gcolor6','gray8'].includes(frame.encoding)||!Number.isInteger(width)||!Number.isInteger(height)||width<1||width>2048||height<1||height>228)throw new Error('Unsupported camera frame');
 const data=Uint8Array.from(atob(frame.pixels),c=>c.charCodeAt(0));if(data.length!==(frame.encoding==='gray8'?width*height:Math.ceil(width*height*6/8)))throw new Error('Incomplete camera frame');
 const gray=new Float64Array(width*height);
 for(let i=0;i<gray.length;i++){
  if(frame.encoding==='gray8')gray[i]=data[i];
  else {const bit=i*6,b=bit>>3,word=(data[b]<<8)|(data[b+1]||0),c=(word>>(10-bit%8))&63;gray[i]=(((c>>4)&3)*.2126+((c>>2)&3)*.7152+(c&3)*.0722)*85;}
 }
 const w=432,h=216,stride=w*3,offset=54,result=new Uint8Array(offset+stride*h),view=new DataView(result.buffer);
 result[0]=66;result[1]=77;view.setUint32(2,result.length,true);view.setUint32(10,offset,true);view.setUint32(14,40,true);view.setInt32(18,w,true);view.setInt32(22,h,true);view.setUint16(26,1,true);view.setUint16(28,24,true);view.setUint32(34,stride*h,true);
 const scale=Math.min(w/width,h/height),dw=width*scale,dh=height*scale,dx=(w-dw)/2,dy=(h-dh)/2;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  if(x<dx||y<dy||x>=dx+dw||y>=dy+dh)continue;
  const sx=Math.max(0,Math.min(width-1,(x-dx+.5)/scale-.5)),sy=Math.max(0,Math.min(height-1,(y-dy+.5)/scale-.5));
  const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1),fx=sx-x0,fy=sy-y0;
  let lum=(gray[y0*width+x0]*(1-fx)+gray[y0*width+x1]*fx)*(1-fy)+(gray[y1*width+x0]*(1-fx)+gray[y1*width+x1]*fx)*fy;
  // Preserve smooth shades for the display; do not quantize through Pebble's
  // palette or amplify noise with aggressive automatic contrast.
  if(contrast)lum=(lum-128)*1.5+128;
  const g=Math.round(Math.max(0,Math.min(255,lum))),dest=offset+(h-1-y)*stride+x*3;result[dest]=result[dest+1]=result[dest+2]=g;
 }return result;
}

// Four SDK-sized tiles preserve a seamless, larger camera canvas.
export function cameraTiles(bmp:Uint8Array):Uint8Array[]{
 const source=new DataView(bmp.buffer,bmp.byteOffset,bmp.byteLength);
 if(bmp.length!==54+432*216*3||source.getInt32(18,true)!==432||source.getInt32(22,true)!==216)throw new Error('Invalid camera bitmap');
 return [0,1,2,3].map(i=>{const w=216,h=108,stride=w*3,out=new Uint8Array(54+stride*h),v=new DataView(out.buffer);out.set(bmp.slice(0,54));v.setUint32(2,out.length,true);v.setInt32(18,w,true);v.setInt32(22,h,true);v.setUint32(34,stride*h,true);
  for(let y=0;y<h;y++){const from=54+((1-Math.floor(i/2))*h+y)*432*3+(i%2)*stride;out.set(bmp.subarray(from,from+stride),54+y*stride);}return out;});
}
// Compatibility path for hosts that reject the larger tiled page.
export function compactCameraBMP(bmp:Uint8Array):Uint8Array {
 cameraTiles(bmp); // Validate the source before reading pixels.
 const w=288,h=144,stride=w*3,out=new Uint8Array(54+stride*h),v=new DataView(out.buffer);out.set(bmp.slice(0,54));v.setUint32(2,out.length,true);v.setInt32(18,w,true);v.setInt32(22,h,true);v.setUint32(34,stride*h,true);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const from=54+(Math.floor(y*216/h)*432+Math.floor(x*432/w))*3;out.set(bmp.subarray(from,from+3),54+y*stride+x*3);}return out;
}

// A camera page has only four image slots. Include its title decorations in
// those same tiles, reserving the central header area for foreground text.
export function cameraPageTiles(bmp:Uint8Array,icon:Icon,iconXs:number[]):Uint8Array[]{
 cameraTiles(bmp);
 const width=432,height=252,stride=width*3,canvas=new Uint8Array(stride*height);
 // Both BMPs are bottom-up; the extra 36 rows sit above the camera.
 canvas.set(bmp.subarray(54));
 const glyph=iconBMP([icon]);
 for(const screenX of iconXs){const x=Math.round(screenX-72);if(x<0||x+20>width)throw new Error('Camera title icon out of bounds');
  for(let y=0;y<32;y++)canvas.set(glyph.subarray(54+y*60,54+(y+1)*60),(height-32+y)*stride+x*3);
 }
 return [0,1,2,3].map(i=>{const w=216,h=126,row=w*3,out=new Uint8Array(54+row*h),v=new DataView(out.buffer);out.set(bmp.subarray(0,54));v.setUint32(2,out.length,true);v.setInt32(18,w,true);v.setInt32(22,h,true);v.setUint32(34,row*h,true);
  for(let y=0;y<h;y++){const start=((1-Math.floor(i/2))*h+y)*stride+(i%2)*row;out.set(canvas.subarray(start,start+row),54+y*row);}return out;
 });
}

// Restore stronger local contrast lost during resizing. A small Gaussian blur
// supplies the baseline; cap the correction to avoid bright outlines and keep
// tiny fluctuations from being amplified. Work before tiling and dithering.
export function sharpenCameraBMP(bmp:Uint8Array):Uint8Array {
 cameraTiles(bmp);
 const out=bmp.slice(),w=432,h=216,weights=[1,2,1];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const index=54+(y*w+x)*3,original=bmp[index];if(original===0||original===255)continue;
  let blur=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)blur+=bmp[54+(Math.max(0,Math.min(h-1,y+dy))*w+Math.max(0,Math.min(w-1,x+dx)))*3]*weights[dy+1]*weights[dx+1];
  const detail=original-blur/16;
  const correction=Math.abs(detail)<=1?0:Math.sign(detail)*Math.min(34,(Math.abs(detail)-1)*2.5);
  const value=Math.round(Math.max(0,Math.min(255,original+correction)));
  out[index]=out[index+1]=out[index+2]=value;
 }
 return out;
}

// Distribute rounding error across neighboring pixels before the host reduces
// the image to 16 levels. Serpentine scanning avoids directional streaks;
// processing the complete canvas before tiling prevents visible tile seams.
export function ditherCameraBMP(bmp:Uint8Array):Uint8Array {
 bmp=sharpenCameraBMP(bmp);
 const out=bmp.slice(),w=432,h=216;let errors=new Float64Array(w+2),next=new Float64Array(w+2);
 for(let y=0;y<h;y++){
  const direction=y%2?-1:1;
  for(let step=0;step<w;step++){
   const x=direction===1?step:w-1-step,index=54+((h-1-y)*w+x)*3,original=bmp[index];
   const value=Math.max(0,Math.min(255,original+errors[x+1]));
   const level=original===0||original===255?original:Math.round(value/17)*17;
   out[index]=out[index+1]=out[index+2]=level;
   const error=original===0||original===255?0:value-level;
   errors[x+1+direction]+=error*7/16;next[x+1-direction]+=error*3/16;next[x+1]+=error*5/16;next[x+1+direction]+=error/16;
  }
  [errors,next]=[next,errors];next.fill(0);
 }
 return out;
}
