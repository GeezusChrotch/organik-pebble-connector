// Lossless grayscale PNG keeps the same pixels while avoiding huge BMP byte arrays
// across the phone bridge. The host converts common image formats to G2 gray4.
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function chunk(name:string,data:Uint8Array){const out=new Uint8Array(data.length+12),view=new DataView(out.buffer);view.setUint32(0,data.length);out.set([...name].map(c=>c.charCodeAt(0)),4);out.set(data,8);let crc=0xffffffff;for(const b of out.subarray(4,8+data.length))crc=crcTable[(crc^b)&255]^(crc>>>8);view.setUint32(out.length-4,(crc^0xffffffff)>>>0);return out;}
export async function transferImage(bmp:Uint8Array):Promise<Uint8Array>{
 if(typeof CompressionStream==='undefined')return bmp;
 const view=new DataView(bmp.buffer,bmp.byteOffset,bmp.byteLength);if(bmp.length<54||view.getUint16(28,true)!==24)return bmp;
 const width=view.getInt32(18,true),height=view.getInt32(22,true),offset=view.getUint32(10,true),stride=Math.ceil(width*3/4)*4;if(width<1||height<1||offset+height*stride>bmp.length)return bmp;
 const raw=new Uint8Array((width+1)*height);for(let y=0;y<height;y++)for(let x=0;x<width;x++)raw[y*(width+1)+1+x]=bmp[offset+(height-1-y)*stride+x*3];
 try{const compressed=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()),header=new Uint8Array(13),h=new DataView(header.buffer);h.setUint32(0,width);h.setUint32(4,height);header[8]=8;const parts=[new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',compressed),chunk('IEND',new Uint8Array())],png=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){png.set(p,at);at+=p.length;}return png.length<bmp.length?png:bmp;}catch{return bmp;}
}
