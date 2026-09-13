import {inflateSync} from 'node:zlib';
import assert from 'node:assert/strict';
export function decodeImage(bytes:Uint8Array):Uint8Array {
 if(bytes[0]!==137)return bytes;
 const data=Buffer.from(bytes),width=data.readUInt32BE(16),height=data.readUInt32BE(20),parts:Buffer[]=[];
 assert.equal(data[24],8);assert.equal(data[25],0);
 for(let at=8;at<data.length;){const length=data.readUInt32BE(at),name=data.toString('ascii',at+4,at+8);let crc=0xffffffff;for(const b of data.subarray(at+4,at+8+length)){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}assert.equal((crc^0xffffffff)>>>0,data.readUInt32BE(at+8+length));if(name==='IDAT')parts.push(data.subarray(at+8,at+8+length));at+=12+length;}
 const raw=inflateSync(Buffer.concat(parts)),stride=Math.ceil(width*3/4)*4,bmp=Buffer.alloc(54+height*stride);bmp.write('BM');bmp.writeUInt32LE(bmp.length,2);bmp.writeUInt32LE(54,10);bmp.writeUInt32LE(40,14);bmp.writeInt32LE(width,18);bmp.writeInt32LE(height,22);bmp.writeUInt16LE(1,26);bmp.writeUInt16LE(24,28);
 for(let y=0;y<height;y++){assert.equal(raw[y*(width+1)],0);for(let x=0;x<width;x++)bmp.fill(raw[y*(width+1)+1+x],54+(height-1-y)*stride+x*3,54+(height-1-y)*stride+x*3+3);}
 return bmp;
}
