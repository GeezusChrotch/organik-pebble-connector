import {speechClean,speechWithoutNames,speechNumber,speechGuard,speechSceneNames} from './speech-language';
export interface Device {name:string;serviceId:string;type:string;room:string;reachable?:boolean;state:Record<string,unknown>}
export interface Room {id:string;name:string}
export interface Scene {id:string;name:string}
export interface Camera {id:string;name:string;room:string;roomId?:string;age:number;ready:boolean}
export interface Snapshot {devices:Device[];rooms:Room[];scenes:Scene[];cameras:Camera[]}
export const sections = ["favorites","rooms","scenes","devices","sensors","cameras","dictation"] as const;
export type Section = typeof sections[number];
export interface Settings {hiddenSections:Section[];sectionOrder:Section[];customColor:{h:number;s:number};customColors:{h:number;s:number}[];url:string;token:string;pins:string[];roomOrder:string[];contrast:'natural'|'high-contrast'|'original';language:string;longPress:'voice'|'refresh';showCameras:boolean}
export const defaults:Settings = {hiddenSections:[],sectionOrder:[...sections],customColor:{h:35,s:100},customColors:[{h:35,s:100},{h:200,s:100},{h:280,s:100}],url:'',token:'',pins:[],roomOrder:[],contrast:'natural',language:'en',longPress:'voice',showCameras:true};
export function normalizeSectionOrder(value:unknown):Section[] {return [...new Set([...(Array.isArray(value)?value.filter((s:Section)=>sections.includes(s)):[]),...sections])];}
export function normalizeCustomColors(saved:{customColors?:unknown;customColor?:unknown}):{h:number;s:number}[] {
 const items=Array.isArray(saved.customColors)?saved.customColors:[saved.customColor];
 return defaults.customColors.map((fallback,i)=>{const c=items[i];return c&&Number.isInteger(c.h)&&c.h>=0&&c.h<=359&&Number.isInteger(c.s)&&c.s>=0&&c.s<=100?{h:c.h,s:c.s}:{...fallback};});
}
export function loadSettings(raw?:string):Settings {try{const saved=JSON.parse(raw??localStorage.getItem('pome.settings')??'{}');return {...defaults,...saved,customColors:normalizeCustomColors(saved),sectionOrder:normalizeSectionOrder(saved.sectionOrder),hiddenSections:Array.isArray(saved.hiddenSections)?saved.hiddenSections.filter((s:Section)=>sections.includes(s)):[],customColor:{...defaults.customColor,...saved.customColor}};}catch{return {...defaults};}}
export function validateConnection(raw:string):string {const u=new URL(raw);if(u.username||u.password||u.search||u.hash||u.pathname!=='/')throw new Error('Enter the Connector address without a path.');if(u.protocol!=='https:' && !(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw new Error('Use your private HTTPS Connector address.');return u.origin;}
export function stateText(d:Device):string {
 if(d.reachable===false)return 'Unavailable';if(d.type==='garage-door'||d.type==='lock')return 'Control through Scenes';const s=d.state||{};
 if(typeof s.temperature==='number')return s.temperature.toFixed(1)+' C';
 if(typeof s.humidity==='number')return s.humidity+'% humidity';
 if(typeof s.lightLevel==='number')return s.lightLevel+' lux';
 if(typeof s.detected==='boolean')return s.detected?'Detected':'Clear';
 if(s.value!==undefined)return String(s.value);
 if(typeof s.position==='number')return s.position+'% open';
 if(typeof s.speed==='number')return (s.on===false?'Off · ':'')+s.speed+'% speed';
 if(s.on!==undefined)return s.on?'On'+(typeof s.brightness==='number'?' · '+s.brightness+'%':''):'Off';
 return 'Read only';
}
export const colors = [{name:'Warm white',h:35,s:20},{name:'Cool white',h:210,s:10},{name:'White',h:0,s:0},{name:'Amber',h:35,s:100},{name:'Orange',h:20,s:100},{name:'Yellow',h:60,s:100},{name:'Lime',h:90,s:100},{name:'Green',h:120,s:100},{name:'Teal',h:165,s:100},{name:'Cyan',h:180,s:100},{name:'Sky blue',h:200,s:100},{name:'Blue',h:240,s:100},{name:'Purple',h:280,s:100},{name:'Magenta',h:300,s:100},{name:'Pink',h:330,s:100},{name:'Red',h:0,s:100}];
export function colorCommand(label:string,devices:Device[],h:number,s:number):Command {
 if(!Number.isInteger(h)||h<0||h>359||!Number.isInteger(s)||s<0||s>100)throw new Error('Invalid color');
 const lights=devices.filter(d=>d.type==='light'),supported=lights.length>1?lights.filter(d=>typeof d.state.hue==='number'&&typeof d.state.saturation==='number'):lights;
 if(!supported.length)throw new Error('No lights support color.');
 return {label,skipped:lights.length-supported.length,paths:supported.map(d=>`/home/color/${h}/${s}/${encodeURIComponent(d.serviceId)}`)};
}
export const toggleTypes = new Set(['light','fan','switch','outlet','air-purifier','humidifier']);
export type Command = {label:string;paths:string[];skipped?:number;queryIds?:string[]};
const norm=(s:string)=>s.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const has=(s:string,t:string)=>(' '+s+' ').includes(' '+norm(t)+' ');
export function voiceCommand(text:string,snapshot:Snapshot):Command {
 const n=speechClean(text);if(!n)throw new Error('No speech recognized.');
 const scenes=snapshot.scenes.filter(s=>speechSceneNames(n).includes(norm(s.name)));
 if(scenes.length===1)return {label:'Run '+scenes[0].name,paths:['/home/scene/'+encodeURIComponent(scenes[0].id)]};
 if(scenes.length>1)throw new Error('That scene name is ambiguous. Choose it from Scenes.');
 const error=speechGuard(n,text);if(error)throw new Error(error);
 const rooms=snapshot.rooms.filter(r=>has(n,r.name));
 const query=/^(what is|whats|show|check|read|is|are|how bright|how fast)\b/.test(n);
 const parameters=speechWithoutNames(n,[...snapshot.devices.map(d=>d.name),...snapshot.rooms.map(r=>r.name)]);
 const matchedColors=colors.filter(c=>has(parameters,c.name)).filter(c=>!colors.some(other=>other.name!==c.name&&norm(other.name).includes(norm(c.name))&&has(parameters,other.name)));
 if(!query&&matchedColors.length>1)throw new Error('Please choose one color.');
 const color=matchedColors[0];
 let level=speechNumber(parameters);if(Number.isNaN(level))throw new Error('Use one whole percentage from 0 to 100.');
 if(level===null){if(has(parameters,'low'))level=25;else if(has(parameters,'medium'))level=50;else if(has(parameters,'high'))level=100;}
 const on=has(parameters,'on'),off=has(parameters,'off');
 if(on&&off)throw new Error('Say either on or off.');
 if(!query&&((color&&level!==null)||((color||level!==null)&&(on||off))))throw new Error('Please give one adjustment at a time.');
 const aliases:Record<string,string[]>={light:['light','lamp'],fan:['fan'],outlet:['plug','outlet'],switch:['switch'],blinds:['blind','blinds','shade','shades'],'temperature-sensor':['temperature'],'humidity-sensor':['humidity']};
 const groupRooms=rooms.filter(r=>has(n,r.name+' lights')||has(n,'lights in '+r.name)||has(n,'lights in the '+r.name)||has(n,r.name+' lamps')||has(n,'lamps in '+r.name)||has(n,'lamps in the '+r.name));
 let group=false,targets:Device[]=[];
 if(groupRooms.length&&!/\b(switch|outlet|plug)\b/.test(parameters)){if(groupRooms.length!==1)throw new Error('More than one room matches. Choose the room from Rooms.');group=true;targets=snapshot.devices.filter(d=>d.room===groupRooms[0].name&&d.type==='light');}
 else {
  const candidates=snapshot.devices.map(d=>{const short=norm(d.name).replace(new RegExp('^'+norm(d.room).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+' '),'');return {d,score:Math.max(...[norm(d.name),...(rooms.length===1&&rooms[0].name===d.room?[short]:[])].map(alias=>has(n,alias)?alias.length:0))};}).filter(c=>c.score>0&&(rooms.length!==1||c.d.room===rooms[0].name));
  const best=Math.max(0,...candidates.map(c=>c.score));targets=candidates.filter(c=>c.score===best).map(c=>c.d);
  const typed=(d:Device)=>(aliases[d.type]||[]).some(alias=>has(parameters,alias)||has(n,alias));
  if(targets.length!==1){const typedTargets=targets.filter(typed);if(typedTargets.length===1)targets=typedTargets;else if(rooms.length===1){const devices=snapshot.devices.filter(d=>d.room===rooms[0].name&&typed(d));if(devices.length===1)targets=devices;}}
  if(targets.length!==1)throw new Error(targets.length?'More than one device matches. Include the room and device type.':'No unique device matched. Say its room and name.');
 }
 if(!targets.length)throw new Error('No matching lights.');
 if(query)return {label:targets.length===1?targets[0].name:targets[0].room+' lights',paths:[],queryIds:targets.map(d=>d.serviceId)};
 let action='',value='';
 if(color){action='color';value=`${color.h}/${color.s}/`;}
 else if(targets.every(d=>d.type==='blinds')){action='position';if(level!==null)value=level+'/';else if(/\b(open)\b/.test(parameters))value='100/';else if(/\b(close|shut)\b/.test(parameters))value='0/';else throw new Error('Say open, close, or a position percentage.');}
 else if(level!==null){action=targets.every(d=>d.type==='fan')?'speed':'brightness';value=level+'/';}
 else if(off)action='off';else if(on)action='on';else if(has(parameters,'toggle'))action='toggle';
 if(!action)throw new Error('Try on, off, a color, a percentage, open, close, or a scene.');
 const supported=(d:Device)=>action==='color'?typeof d.state.hue==='number'&&typeof d.state.saturation==='number':action==='brightness'?typeof d.state.brightness==='number':true;
 const omitted=group?targets.filter(d=>!supported(d)).length:0;if(group)targets=targets.filter(supported);
 if(!targets.length)throw new Error('No lights in that room support '+action+'.');
 if(targets.some(d=>d.reachable===false))throw new Error('A matching device is unavailable.');
 if(action==='position'){if(targets.some(d=>d.type!=='blinds'))throw new Error('Position is only available for blinds.');}
 else if(targets.some(d=>!toggleTypes.has(d.type)))throw new Error('This device is read only in Pome.');
 if((action==='brightness'||action==='color')&&targets.some(d=>d.type!=='light'))throw new Error('That adjustment is only available for lights.');
 const detail=color?color.name:level!==null?`${action} ${level}%`:action==='position'?`Position ${value.slice(0,-1)}%`:action;
 return {label:group?`${targets[0].room}: ${detail} · ${targets.length} lights${omitted?' · '+omitted+' unsupported skipped':''}`:`${targets[0].name}: ${detail}`,paths:targets.map(d=>`/home/${action}/${value}${encodeURIComponent(d.serviceId)}`)};
}

export function pcmToWav(chunks:Uint8Array[]):Uint8Array {
 const size=chunks.reduce((n,c)=>n+c.byteLength,0);if(size%2)throw new Error('Incomplete audio frame');
 const wav=new Uint8Array(44+size),v=new DataView(wav.buffer);const str=(p:number,s:string)=>[...s].forEach((c,i)=>wav[p+i]=c.charCodeAt(0));
 str(0,'RIFF');v.setUint32(4,36+size,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,size,true);let pos=44;for(const c of chunks){wav.set(c,pos);pos+=c.length;}return wav;
}
