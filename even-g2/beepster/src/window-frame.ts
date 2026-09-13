// Our generated BMPs are uncompressed, bottom-up, 24-bit grayscale images.
// Remove the top scanline so image writes cannot erase the outside frame.
export function cropTopRow(bmp:Uint8Array):Uint8Array{
 const source=new DataView(bmp.buffer,bmp.byteOffset,bmp.byteLength),width=source.getInt32(18,true),height=source.getInt32(22,true),stride=Math.ceil(width*3/4)*4;
 const cropped=bmp.slice(0,bmp.length-stride),view=new DataView(cropped.buffer);
 view.setUint32(2,cropped.length,true);view.setInt32(22,height-1,true);view.setUint32(34,stride*(height-1),true);return cropped;
}
