import {iconPixels,type Icon} from './icons';
// Four SDK-sized tiles cover the title decoration and the whole message area.
// Native text stays above these bitmaps, so dividers never consume a text row.
export const threadTiles=[{x:50,y:0,width:288,height:144},{x:338,y:0,width:182,height:144},{x:50,y:144,width:288,height:112},{x:338,y:144,width:182,height:112}];
export function threadBitmaps(icons:(Icon|undefined)[],dividers:boolean[],heading:Icon|undefined,headingXs:number[]){
 const width=470,height=256,pixels=new Uint8Array(width*height);
 const glyph=(icon:Icon|undefined,x:number,y:number)=>{const rows=iconPixels(icon),scale=rows.length===9?2:1;rows.forEach((row,iy)=>row.forEach((value,ix)=>{for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){const px=x+ix*scale+dx,py=y+iy*scale+dy;if(px>=0&&px<width&&py>=0&&py<height)pixels[py*width+px]=value;}}));};
 for(let row=0;row<6;row++){glyph(icons[row],1,64+row*32+7);if(dividers[row])pixels.fill(119,(64+row*32)*width,(64+row*32+1)*width);}
 for(const x of headingXs)glyph(heading,x-50+1,7);
 return threadTiles.map(tile=>{const stride=Math.ceil(tile.width*3/4)*4,result=new Uint8Array(54+stride*tile.height),view=new DataView(result.buffer);result.set([66,77]);view.setUint32(2,result.length,true);view.setUint32(10,54,true);view.setUint32(14,40,true);view.setInt32(18,tile.width,true);view.setInt32(22,tile.height,true);view.setUint16(26,1,true);view.setUint16(28,24,true);view.setUint32(34,stride*tile.height,true);for(let y=0;y<tile.height;y++)for(let x=0;x<tile.width;x++){const at=54+(tile.height-1-y)*stride+x*3;result.fill(pixels[(tile.y+y)*width+(tile.x-50+x)],at,at+3);}return result;});
}
