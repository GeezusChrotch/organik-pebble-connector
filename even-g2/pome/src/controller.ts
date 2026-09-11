import {runCommands} from './commands';
import {deviceIcon,type Icon} from './icons';
import {API} from './api';
import {Display} from './display';
import {stateText,toggleTypes,colors,colorCommand,voiceCommand,pcmToWav,type Device,type Scene,type Room,type Camera,type Snapshot,type Settings,type Command} from './model';
import {frameBMP,type CameraFrame} from './images';
interface Row {label:string;icon?:Icon;key?:string;run:()=>Promise<void>|void}
interface Page {title:string;rows:Row[];index:number;image?:Uint8Array;caption?:string}
export class Pome {
 snapshot:Snapshot={rooms:[],devices:[],scenes:[],cameras:[]};private pages:Page[]=[];private busy=false;private recording=false;private chunks:Uint8Array[]=[];private recordingBytes=0;private timer?:ReturnType<typeof setTimeout>;private operation=0;private notice='';private returnAfterVoice?:Page[];
 onSnapshot:()=>void=()=>{};
 constructor(public api:API,private display:Display){display.onDictate=()=>void this.beginRecording();display.onInput=t=>void this.input(t);display.onAudio=pcm=>{if(this.recording){this.recordingBytes+=pcm.length;if(this.recordingBytes<=32000*120)this.chunks.push(pcm);else void this.finishRecording();}};display.onError=m=>{this.notice=m;};}
 private get page(){return this.pages.at(-1)!;}
 private render(){const p=this.page;if(!p)return;const start=Math.floor(p.index/5)*5;this.display.show({title:(this.api.demo?'DEMO · ':'')+p.title,lines:p.rows.slice(start,start+5).map((r,i)=>(p.index===start+i?'> ':'  ')+(r.label.length>29?r.label.slice(0,28)+'…':r.label)),icons:p.rows.slice(start,start+5).map(r=>r.icon),footer:this.notice||p.caption||`${p.index+1}/${p.rows.length} · Tap select · Double tap back`,image:p.image});}
 private push(title:string,rows:Row[],image?:Uint8Array,caption?:string){this.pages.push({title,rows:rows.length?rows:[{label:'Nothing here yet',run:()=>this.back()}],index:0,image,caption});this.notice='';this.render();}
 private async perform(work:()=>Promise<void>,label='Loading…'){
  if(this.busy)return;this.busy=true;const operation=++this.operation;this.notice=label;if(label!=='Transcribing…')this.render();
  try{await work();if(operation===this.operation){if(this.notice===label)this.notice='';this.render();}}catch(e){this.notice=e instanceof Error?e.message:'Request failed';this.render();}finally{this.busy=false;}
 }
 async start(){this.pages=[{title:'Pome',rows:[{label:'Open home',run:()=>this.reload()}],index:0}];this.render();if(this.api.demo||this.api.settings.url)await this.reload();else {this.notice='Pair in the Even phone app settings';this.render();}}
 async reload(){await this.perform(async()=>{this.snapshot=await this.api.snapshot();this.home();this.onSnapshot();});}
 home(){const rows:Row[]=[];const visible=(name:Settings['hiddenSections'][number])=>!this.api.settings.hiddenSections.includes(name);
  for(const section of this.api.settings.sectionOrder){
  if(section==='favorites'&&visible(section))for(const key of this.api.settings.pins){const row=this.entityRow(key);if(row)rows.push({...row,label:'* '+row.label});}
  if(section==='rooms'&&visible(section))rows.push({icon:'room',label:'Rooms',run:()=>this.rooms()});
  if(section==='scenes'&&visible(section))rows.push({icon:'scene',label:'Scenes',run:()=>this.scenes()});
  if(section==='devices'&&visible(section))rows.push({icon:'device',label:'Devices',run:()=>this.devices(this.snapshot.devices,'Devices')});
  if(section==='sensors'&&visible(section))rows.push({icon:'sensor',label:'Sensors',run:()=>this.devices(this.snapshot.devices.filter(d=>d.type.endsWith('sensor')),'Sensors')});
  if(section==='cameras'&&visible(section)&&this.api.settings.showCameras)rows.push({icon:'camera',label:'Cameras',run:()=>this.cameras(this.snapshot.cameras)});
  if(section==='dictation'&&visible(section))rows.push({icon:'voice',label:'Dictate a command',run:()=>this.beginRecording()});
  }
  rows.push({icon:'refresh',label:'Refresh home',run:()=>this.reload()});this.pages=[{title:'Pome',rows,index:0}];this.notice='';this.render();}
 private entityRow(key:string):Row|undefined {const [kind,id]=key.split(':');if(kind==='device'){const d=this.snapshot.devices.find(d=>d.serviceId===id);if(d)return this.deviceRow(d);}if(kind==='scene'){const s=this.snapshot.scenes.find(s=>s.id===id);if(s)return this.sceneRow(s);}if(kind==='room'){const r=this.snapshot.rooms.find(r=>r.id===id);if(r)return {icon:'room',label:r.name,run:()=>this.room(r)};}if(kind==='camera'){const c=this.snapshot.cameras.find(c=>c.id===id);if(c)return {icon:'camera',label:c.name,run:()=>this.camera(c)};}}
 private rooms(){const order=this.api.settings.roomOrder;const rooms=[...this.snapshot.rooms].sort((a,b)=>{const ai=order.indexOf(a.id),bi=order.indexOf(b.id);return (ai<0?999:ai)-(bi<0?999:bi)||a.name.localeCompare(b.name);});this.push('Rooms',rooms.map(r=>({icon:'room',label:r.name,run:()=>this.room(r)})));}
 private async room(room:Room){await this.perform(async()=>{const devices=await this.api.request<Device[]>('/home/info/'+encodeURIComponent(room.name));if(!Array.isArray(devices))throw new Error('Invalid room response');const rows=devices.map(d=>this.deviceRow(d));const lights=devices.filter(d=>d.type==='light');if(lights.length)rows.unshift({icon:'light',label:'All lights',run:()=>this.groupLights(room,lights)});const cameras=this.snapshot.cameras.filter(c=>c.roomId?c.roomId===room.id:c.room===room.name);if(cameras.length&&this.api.settings.showCameras)rows.unshift({icon:'camera',label:`Cameras (${cameras.length})`,run:()=>cameras.length===1?this.camera(cameras[0]):this.cameras(cameras)});this.push(room.name,rows);});}
 private groupLights(room:Room,lights:Device[]){this.push(room.name+' · lights',[{label:'Color',run:()=>this.colorPicker(room.name+' · lights',lights)},{label:'Turn on',run:()=>this.command({label:'Turn room lights on',paths:lights.map(d=>'/home/on/'+encodeURIComponent(d.serviceId))})},{label:'Turn off',run:()=>this.command({label:'Turn room lights off',paths:lights.map(d=>'/home/off/'+encodeURIComponent(d.serviceId))})},...[25,50,75,100].map(n=>({label:`Brightness ${n}%`,run:()=>this.command({label:`Set lights to ${n}%`,skipped:lights.filter(d=>typeof d.state.brightness!=='number').length,paths:lights.filter(d=>typeof d.state.brightness==='number').map(d=>`/home/brightness/${n}/`+encodeURIComponent(d.serviceId))})}))]);}
 private scenes(){this.push('Scenes',this.snapshot.scenes.map(s=>this.sceneRow(s)));}
 private sceneRow(s:Scene):Row{return {icon:'scene',label:s.name,run:()=>this.confirm({label:'Run '+s.name,paths:['/home/scene/'+encodeURIComponent(s.id)]})};}
 private devices(items:Device[],title:string){this.push(title,items.map(d=>this.deviceRow(d)));}
 private deviceRow(d:Device):Row{return {icon:deviceIcon(d.type),label:d.name+' · '+stateText(d),run:()=>this.device(d)};}
 private async device(d:Device){await this.perform(async()=>{const fresh=await this.api.request<Device>('/home/info/'+encodeURIComponent(d.serviceId));this.showDevice(fresh,false);});}
 private showDevice(d:Device,replace:boolean){
  const id=encodeURIComponent(d.serviceId),rows:Row[]=[];
  const adjust=(action:string,value='')=>this.perform(async()=>{await this.api.request('/home/'+action+'/'+value+id,'POST');const fresh=await this.api.request<Device>('/home/info/'+id);this.showDevice(fresh,true);},'Applying…');
  if(d.reachable!==false){
   if(toggleTypes.has(d.type))rows.push({label:d.state.on?'Turn off':'Turn on',run:()=>adjust(d.state.on?'off':'on')});
   if(d.type==='light'){rows.push(...[25,50,75,100].map(n=>({label:`Brightness ${n}%`,run:()=>adjust('brightness',n+'/')})));rows.push({label:'Color',run:()=>this.colorPicker(d.name,[d])});}
   if(d.type==='fan')rows.push(...[25,50,75,100].map(n=>({label:`Speed ${n}%`,run:()=>adjust('speed',n+'/')})));
   if(d.type==='blinds')rows.push(...[0,25,50,75,100].map(n=>({label:n===0?'Close':n===100?'Open':`Position ${n}%`,run:()=>adjust('position',n+'/')})));
  }
  rows.push({label:'Refresh state',run:()=>this.perform(async()=>this.showDevice(await this.api.request<Device>('/home/info/'+id),true))});
  if(replace)this.pages.pop();this.push(d.name,rows,undefined,stateText(d));
 }
 private colorPicker(name:string,lights:Device[]){this.push(name+' · color',[...colors.map(c=>({label:c.name,run:()=>this.command(colorCommand(c.name,lights,c.h,c.s))})),...this.api.settings.customColors.map((color,index)=>({label:`Custom color ${index+1}`,run:()=>this.customColor(name,lights,index)}))]);}
 private customColor(name:string,lights:Device[],index:number){
  let {h,s}=this.api.settings.customColors[index];
  const render=(replace:boolean)=>{const rowIndex=replace?this.page.index:0;if(replace)this.pages.pop();this.push(name+' · custom '+(index+1),[
   {label:'Apply color',run:()=>this.command(colorCommand('Custom color',lights,h,s))},
   ...[1,-1,15,-15].map(step=>({label:`Hue ${step>0?'+':''}${step}`,run:()=>{h=(h+step+360)%360;render(true);}})),
   ...[1,-1,10,-10].map(step=>({label:`Saturation ${step>0?'+':''}${step}%`,run:()=>{s=Math.max(0,Math.min(100,s+step));render(true);}}))
  ],undefined,`Hue ${h}° · Saturation ${s}%`);this.page.index=rowIndex;this.render();};render(false);
 }
 private cameras(items:Camera[]){this.push('Cameras',items.map(c=>({icon:'camera',label:c.name+(c.ready?'':' · no image yet'),run:()=>this.camera(c)})));}
 private async camera(c:Camera){await this.perform(async()=>{let frame:CameraFrame;try{frame=await this.api.request<CameraFrame>(`/frame/${encodeURIComponent(c.id)}?platform=emery&mode=${this.api.settings.contrast}`);}catch{this.push(c.name,[{label:'Capture first image',run:()=>this.refreshCamera(c)}]);return;}this.showCamera(c,frame);});}
 private showCamera(c:Camera,frame:CameraFrame){const age=Math.max(0,Math.round(frame.age));this.push(c.name,[{label:'Refresh snapshot',run:()=>this.refreshCamera(c)}],frameBMP(frame,this.api.settings.contrast==='high-contrast'),`Captured ${age}s ago · Tap refresh`);}
 private async refreshCamera(c:Camera){await this.perform(async()=>{const id=encodeURIComponent(c.id),request=await this.api.request<{requestID:string}>('/refresh/'+id,'POST');if(!request.requestID)throw new Error('Capture request failed');for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,this.api.demo?10:1000));const result=await this.api.request<{state:string;error?:string}>(`/capture/${id}?request=${encodeURIComponent(request.requestID)}`);if(result.state==='failed')throw new Error(result.error||'Camera capture failed');if(result.state==='ready'){const frame=await this.api.request<CameraFrame>(`/frame/${id}?platform=emery&mode=${this.api.settings.contrast}`);this.pages.pop();this.showCamera(c,frame);return;}}throw new Error('Capture timed out; the previous image is unchanged.');},'Capturing fresh image…');}
 private confirm(command:Command){if(command.queryIds){void this.showVoiceStatus(command);return;}this.push(command.label,[{label:'Confirm',run:()=>this.command(command,true)},{label:'Cancel',run:()=>this.back()}]);}
 private async showVoiceStatus(command:Command){try{const devices=await Promise.all(command.queryIds!.map(id=>this.api.request<Device>('/home/info/'+encodeURIComponent(id))));this.push(command.label,devices.map(d=>({icon:deviceIcon(d.type),label:d.name+' · '+stateText(d),run:()=>this.back()})),undefined,'Live status · Double tap back');}catch(e){this.notice=e instanceof Error?e.message:'Status unavailable';this.render();}}
 private async command(command:Command,dismiss=false){await this.perform(async()=>{if(!command.paths.length)throw new Error('No lights support this adjustment.');const result=await runCommands(command.paths,path=>this.api.request(path,'POST'));if(dismiss)this.pages.pop();const skipped=command.skipped?` · ${command.skipped} unsupported skipped`:'';this.notice=result.failed.length?`${result.completed}/${result.total} updated · ${result.failed.length} failed${skipped}. Refresh before retrying.`:result.total>1||command.skipped?`${result.completed}/${result.total} lights updated${skipped}`:'Command completed';},'Applying…');}
 async beginRecording(){if(this.busy||this.recording)return;await this.perform(async()=>{
  const health=await this.api.request<{dictation:boolean}>('/health');if(!health.dictation)throw new Error('Set up Dictation in Connector → Even G2.');
  this.returnAfterVoice=[...this.pages];this.chunks=[];this.recordingBytes=0;this.recording=true;
  this.push('Listening…',[{label:'Tap to finish recording',run:()=>this.finishRecording()}],undefined,'Double tap cancels · Up to 2 minutes');
  try {await this.display.record(true);this.timer=setTimeout(()=>void this.finishRecording(),120000);}
  catch(e){this.recording=false;this.chunks=[];await this.display.record(false).catch(()=>{});this.pages=this.returnAfterVoice||this.pages.slice(0,-1);this.returnAfterVoice=undefined;throw e;}
 });}
 private async finishRecording(){if(!this.recording||this.busy)return;this.recording=false;clearTimeout(this.timer);await this.perform(async()=>{try {await this.display.record(false);this.render();if(this.api.demo&&!this.chunks.length)this.chunks=[new Uint8Array(32000)];if(this.recordingBytes<3200&&!this.api.demo)throw new Error('Recording was too short. Try again.');const audio=pcmToWav(this.chunks);this.chunks=[];const response=await this.api.request<{text:string}>('/speech?language='+encodeURIComponent(this.api.settings.language),'POST',audio);this.pages=this.returnAfterVoice||this.pages.slice(0,-1);this.returnAfterVoice=undefined;this.confirm(voiceCommand(response.text,this.snapshot));} finally {this.chunks=[];if(this.returnAfterVoice){this.pages=this.returnAfterVoice;this.returnAfterVoice=undefined;}}},'Transcribing…');}
 private back(){if(this.pages.length>1){this.pages.pop();this.notice='';this.render();}else void this.display.exit();}
 async input(type:number){
  if(type===7||type===6||type===5){if(this.recording){this.recording=false;clearTimeout(this.timer);this.chunks=[];await this.display.record(false).catch(()=>{});this.pages=this.returnAfterVoice||this.pages;this.returnAfterVoice=undefined;this.notice='Recording stopped; reopen Dictate to retry';this.render();}return;}
  if(type===4){this.render();return;}
  if(this.busy)return;
  if(this.recording){if(type===0)await this.finishRecording();else if(type===3){this.recording=false;clearTimeout(this.timer);this.chunks=[];await this.display.record(false).catch(()=>{});this.pages=this.returnAfterVoice||this.pages.slice(0,-1);this.returnAfterVoice=undefined;this.render();}return;}
  if(type===9||type===10)return;
  if(type===3){this.back();return;}if(type===1||type===2){if(!this.page.image)this.page.index=Math.max(0,Math.min(this.page.rows.length-1,this.page.index+(type===1?-1:1)));this.notice='';this.render();return;}
  if(type===0)await this.page?.rows[this.page.index]?.run();
 }
}
