// Original 9×9 monochrome glyphs, doubled to 18×18 for the glasses.
const glyphs = {
 light:['...###...','..#...#..','.#.....#.','.#.....#.','..#...#..','...#.#...','...###...','...#.#...','....#....'],
 outlet:['..#...#..','..#...#..','.#######.','.#.....#.','.#.....#.','..#...#..','...###...','....#....','....#....'],
 switch:['..#####..','.#.....#.','.#.###.#.','.#.###.#.','.#.....#.','.#.....#.','.#.....#.','.#.....#.','..#####..'],
 fan:['...###...','...#.#...','....#....','##..#..##','#.#####.#','##..#..##','....#....','...#.#...','...###...'],
 scene:['....#....','....#....','...###...','..#.#.#..','#########','..#.#.#..','...###...','....#....','....#....'],
 camera:['..###....','.#######.','##.....##','#..###..#','#.#...#.#','#.#...#.#','#..###..#','##.....##','.#######.'],
 room:['....#....','...#.#...','..#...#..','.#.....#.','#########','.#.....#.','.#.###.#.','.#.#.#.#.','.###.###.'],
 device:['.#######.','.#.....#.','.#..#..#.','.#.....#.','.#######.','....#....','....#....','..#####..','.........'],
 sensor:['...###...','..#...#..','.#..#..#.','.#.###.#.','.#..#..#.','..#...#..','...###...','....#....','...###...'],
 temperature:['...##....','...##....','...##.#..','...##....','...##.#..','..####...','..####...','..####...','...##....'],
 blinds:['#########','#.......#','#########','#.......#','#########','#.......#','#########','.......#.','.......#.'],
 voice:['...###...','...#.#...','...#.#...','.#.#.#.#.','.#.###.#.','.#.....#.','..#####..','....#....','..#####..'],
 refresh:['..#####..','.#.....#.','#......##','#.....###','#........','###.....#','##......#','.#.....#.','..#####..'],
 air:['......##.','.....#..#','########.','.........','######...','......#..','########.','.....#..#','......##.'],
 water:['....#....','...#.#...','...#.#...','..#...#..','..#...#..','.#.....#.','.#.....#.','..#...#..','...###...'],
 lock:['..#####..','..#...#..','..#...#..','.#######.','.#.....#.','.#..#..#.','.#..#..#.','.#.....#.','.#######.'],
} as const;
export type Icon = keyof typeof glyphs;
export function deviceIcon(type:string):Icon {
 if(type in glyphs)return type as Icon;
 if(type==='plug')return 'outlet';
 if(type==='air-purifier')return 'air';
 if(type==='humidifier'||type==='humidity-sensor'||type==='leak-sensor')return 'water';
 if(type==='temperature-sensor'||type==='thermostat')return 'temperature';
 if(type.endsWith('sensor'))return 'sensor';
 return 'device';
}
export function iconPixels(icon?:Icon):number[][] {return (icon?glyphs[icon]:Array(9).fill('.........')).map(row=>[...row].map(p=>p==='#'?255:0));}
// Three 32px rows per strip, within even older 100px image-height limits.
export function iconBMP(icons:(Icon|undefined)[]):Uint8Array {
 const w=20,h=Math.max(1,icons.length)*32,stride=w*3,result=new Uint8Array(54+stride*h),v=new DataView(result.buffer);
 result.set([66,77]);v.setUint32(2,result.length,true);v.setUint32(10,54,true);v.setUint32(14,40,true);v.setInt32(18,w,true);v.setInt32(22,h,true);v.setUint16(26,1,true);v.setUint16(28,24,true);v.setUint32(34,stride*h,true);
 icons.forEach((icon,row)=>iconPixels(icon).forEach((pixels,y)=>pixels.forEach((p,x)=>{for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const at=54+(h-1-(row*32+7+y*2+dy))*stride+(1+x*2+dx)*3;result.fill(p,at,at+3);}})));
 return result;
}
export function iconSVG(icon?:Icon):string {return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9">'+iconPixels(icon).flatMap((row,y)=>row.map((p,x)=>p?`<rect x="${x}" y="${y}" width="1" height="1" fill="#81f795"/>`:'')).join('')+'</svg>';}
