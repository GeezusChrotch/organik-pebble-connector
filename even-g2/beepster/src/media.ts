import {frameBMP,ditherCameraBMP} from './images';
export interface Preview {width:number;height:number;pixels:string;frames?:number;kind:string}
export function mediaFrames(p:Preview,contrast=false):Uint8Array[]{
 const {width:w,height:h}=p,n=p.frames||1;if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>180||h>180||!Number.isInteger(n)||n<1||n>12)throw Error('Unsupported attachment preview');
 const pixels=Uint8Array.from(atob(p.pixels),c=>c.charCodeAt(0));if(pixels.length!==w*h*n)throw Error('Incomplete attachment preview');
 return Array.from({length:n},(_,f)=>{const gray=new Uint8Array(w*h);for(let i=0;i<gray.length;i++){const c=pixels[f*w*h+i];gray[i]=Math.round(((c>>4)&3)*85*.2126+((c>>2)&3)*85*.7152+(c&3)*85*.0722);}return ditherCameraBMP(frameBMP({encoding:'gray8',width:w,height:h,pixels:btoa(String.fromCharCode(...gray)),age:0},contrast));});
}
