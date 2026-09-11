import type {Settings,Snapshot,Device} from './model';
import type {CameraFrame} from './images';
export const demoSnapshot:Snapshot={rooms:[{id:'living',name:'Living Room'},{id:'studio',name:'Studio'}],scenes:[{id:'movie',name:'Movie Time'},{id:'evening',name:'Evening'}],devices:[{serviceId:'lamp',name:'Floor Lamp',room:'Living Room',type:'light',reachable:true,state:{on:true,brightness:65,hue:35,saturation:100}},{serviceId:'blind',name:'Window Blind',room:'Living Room',type:'blinds',reachable:true,state:{position:40}},{serviceId:'temp',name:'Temperature',room:'Living Room',type:'temperature-sensor',reachable:true,state:{temperature:22.4}},{serviceId:'desk',name:'Desk Lamp',room:'Studio',type:'light',reachable:true,state:{on:false,brightness:30,hue:200,saturation:100}}],cameras:[{id:'sample',name:'Room Camera',room:'Living Room',roomId:'living',age:12,ready:true}]};
export class API {
 constructor(public settings:Settings,public demo=false){}
 async request<T>(path:string,method='GET',body?:Uint8Array):Promise<T>{
  if(this.demo)return this.fixture(path,method) as T;
  if(!this.settings.url||!this.settings.token)throw new Error('Pair Pome in the Even phone app settings.');
  try {const r=await fetch(this.settings.url+path,{method,headers:{Authorization:'Bearer '+this.settings.token,...(body?{'Content-Type':'audio/wav'}:{})},body:body?new Blob([body as Uint8Array<ArrayBuffer>]):undefined,signal:AbortSignal.timeout(body?65000:15000)});const data=await r.json();if(!r.ok)throw new Error(data.error||'Connector request failed');return data;}catch(e){if(e instanceof TypeError)throw new Error('Cannot reach Connector. Check Tailscale on Mac and phone.');throw e;}
 }
 async snapshot():Promise<Snapshot>{const [rooms,scenes,devices,cameras]=await Promise.all([this.request<Snapshot['rooms']>('/home/list/rooms'),this.request<Snapshot['scenes']>('/home/list/scenes'),this.request<Snapshot['devices']>('/home/list/devices'),this.request<{cameras:Snapshot['cameras']}>('/cameras').catch(()=>({cameras:[]}))]);if(!Array.isArray(rooms)||!Array.isArray(devices)||!Array.isArray(scenes)||!Array.isArray(cameras.cameras))throw new Error('Invalid home response');return {rooms,scenes,devices,cameras:cameras.cameras};}
 private fixture(path:string,method:string):unknown {
  if(path==='/health')return {home:true,dictation:true};
  if(path==='/home/list/rooms')return structuredClone([...demoSnapshot.rooms,...Array.from({length:12},(_,i)=>({id:'test-room-'+i,name:'Test Room '+String(i+1).padStart(2,'0')}))]);
  if(path==='/home/list/scenes')return structuredClone(demoSnapshot.scenes);
  if(path==='/home/list/devices')return structuredClone(demoSnapshot.devices);
  if(path==='/cameras')return {cameras:structuredClone(demoSnapshot.cameras)};
  if(path.startsWith('/home/info/')){const id=decodeURIComponent(path.slice(11));return structuredClone(demoSnapshot.devices.find(d=>d.serviceId===id)||demoSnapshot.devices.filter(d=>d.room===id));}
  if(path.startsWith('/frame/'))return sampleFrame();
  if(path.startsWith('/refresh/'))return {requestID:'demo'};
  if(path.startsWith('/capture/'))return {state:'ready'};
  if(path.startsWith('/speech'))return {text:'Turn desk lamp on'};
  if(method==='POST') {const p=path.split('/');const d=demoSnapshot.devices.find(d=>d.serviceId===p.at(-1));if(d){if(p[2]==='toggle')d.state.on=!d.state.on;if(p[2]==='on'||p[2]==='off')d.state.on=p[2]==='on';if(['brightness','position','speed'].includes(p[2]))d.state[p[2]]=Number(p[3]);}return {status:'success'};}
  throw new Error('Demo route unavailable');
 }
}
function sampleFrame():CameraFrame {
 const w=192,h=108,bytes=new Uint8Array(Math.ceil(w*h*6/8));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++) {let c=y>77?21:42;if(x>20&&x<65&&y>16&&y<67)c=(x%12<2||y%18<2)?21:63;if(x>94&&x<170&&y>54&&y<84)c=21;if(x>85&&x<181&&y>47&&y<65)c=0;if(x>144&&x<148&&y>20&&y<48)c=0;if(x>133&&x<159&&y>17&&y<28)c=63;const bit=(y*w+x)*6,b=bit>>3,shift=bit%8,word=c<<(10-shift);bytes[b]|=word>>8;if(b+1<bytes.length)bytes[b+1]|=word&255;}
 return {encoding:'gcolor6',width:w,height:h,pixels:btoa(String.fromCharCode(...bytes)),age:12};
}
