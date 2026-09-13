// SDK-compatible grayscale BMPs: image slots require at least 20 x 20 pixels.
export function decorationBMP(kind:'calendar'|'rule'|'blank'):Uint8Array {
 const w=kind==='calendar'?20:284,h=kind==='calendar'?32:20,stride=w*3,out=new Uint8Array(54+stride*h),v=new DataView(out.buffer);
 out.set([66,77]);v.setUint32(2,out.length,true);v.setUint32(10,54,true);v.setUint32(14,40,true);v.setInt32(18,w,true);v.setInt32(22,h,true);v.setUint16(26,1,true);v.setUint16(28,24,true);v.setUint32(34,stride*h,true);
 const dot=(x:number,y:number,value=255)=>{const offset=54+(h-1-y)*stride+x*3;out.fill(value,offset,offset+3);};
 if(kind==='rule')for(let x=0;x<w;x++)dot(x,10,128);
 if(kind==='calendar')for(let y=0;y<20;y++)for(let x=0;x<20;x++)if(calendarPixel(x,y))dot(x,y+5);
 return out;
}
function calendarPixel(x:number,y:number){return ((x===1||x===18)&&y>=4&&y<=18)||((y===4||y===18||y===8)&&x>=1&&x<=18)||((x===5||x===14)&&y>=1&&y<=6)||([5,9,13].includes(x)&&[11,14].includes(y));}
export function calendarSVG(){return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">'+Array.from({length:400},(_,i)=>calendarPixel(i%20,Math.floor(i/20))?`<rect x="${i%20}" y="${Math.floor(i/20)}" width="1" height="1" fill="#afe69b"/>`:'').join('')+'</svg>';}
