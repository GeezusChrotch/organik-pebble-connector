import {registerEmojiPixels,type Icon} from './icons';
export interface EmojiEntry {id:number;emoji:string;key:string;label:string}
const entries=new Map<string,EmojiEntry>();
let loading:Promise<void>|undefined;
const canonical=(text:string)=>text.replace(/\ufe0f/g,'');
export function installEmoji(catalog:EmojiEntry[],pixels:Uint8Array){
 if(!catalog.length||catalog.some(e=>!Number.isInteger(e.id)||e.id<0||(e.id+1)*162>pixels.length))throw Error('Incomplete emoji assets');
 for(const e of catalog){const data=pixels.subarray(e.id*162,(e.id+1)*162);registerEmojiPixels(e.id,Array.from({length:18},(_,y)=>Array.from({length:18},(_,x)=>{const p=y*18+x;return ((data[p>>1]>>(p%2?0:4))&15)*17;})));entries.set(canonical(e.emoji),e);}
}
export async function prepareEmoji():Promise<void>{
 loading ||= Promise.all([fetch('./emoji/catalog.json').then(r=>{if(!r.ok)throw Error();return r.json();}),fetch('./emoji/g2-pixels.bin').then(r=>{if(!r.ok)throw Error();return r.arrayBuffer();})]).then(([catalog,pixels])=>installEmoji(catalog.entries,new Uint8Array(pixels))).catch(()=>{loading=undefined;throw Error('Emoji images could not load. Reopen Beepster.');});return loading;
}
export function emojiReply(text:string):{label:string;icon:Icon}{const e=entries.get(canonical(text));return e?{label:e.label,icon:`emoji:${e.id}`}:{label:'Emoji reply',icon:'message'};}
// Review retains a readable label while the actual payload remains the original Unicode.
export function replyDisplayText(text:string):string {const e=entries.get(canonical(text));if(e)return e.label;let result=canonical(text);for(const [value,e] of [...entries].sort(([a],[b])=>b.length-a.length))if(value&&result.includes(value))result=result.split(value).join('['+e.label+']');return result.replace(/\ufe0f/g,'');}

// Longest matches preserve flags, skin tones and joined emoji as one sprite.
export function emojiSegments(text:string):{text:string;icon?:Icon}[]{
 const input=canonical(text),values=[...entries.keys()].sort((a,b)=>b.length-a.length),segments:{text:string;icon?:Icon}[]=[];let plain='';
 for(let i=0;i<input.length;){const value=values.find(v=>input.startsWith(v,i));if(value){if(plain){segments.push({text:plain});plain='';}const e=entries.get(value)!;segments.push({text:e.label,icon:`emoji:${e.id}`});i+=value.length;}else{const char=String.fromCodePoint(input.codePointAt(i)!);plain+=char;i+=char.length;}}
 if(plain)segments.push({text:plain});return segments;
}
