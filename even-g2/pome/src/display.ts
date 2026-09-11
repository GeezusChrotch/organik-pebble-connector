import {iconBMP,iconSVG,type Icon} from './icons';
import {waitForEvenAppBridge,CreateStartUpPageContainer,RebuildPageContainer,TextContainerProperty,TextContainerUpgrade,ImageContainerProperty,ImageRawDataUpdate,MenuContainerProperty,MenuItemProperty,StartUpPageCreateResult,ImageRawDataUpdateResult,AudioInputSource,type EvenAppBridge,type EvenHubEvent} from '@evenrealities/even_hub_sdk';
export interface Screen {title:string;lines:string[];icons?:(Icon|undefined)[];footer:string;image?:Uint8Array}
export class Display {
 bridge?:EvenAppBridge;private started=false;private chain=Promise.resolve();private revision=0;private lastURL='';private audioFrames=0;private lastScreenKey='';private lastImage?:Uint8Array;private lastScreen?:Screen;
 private sentLayout='';private sentText=new Map<number,string>();private sentIcons='';private overlay=false;private pendingDictation=false;
 onDictate:()=>void=()=>{};
 onDisplayStatus:(status:string)=>void=()=>{};
 retry(){if(this.lastScreen){this.lastScreenKey='';this.show(this.lastScreen);}}
 microphoneStatus='Not started';
 onMicrophoneStatus:(status:string)=>void=()=>{};
 private micStatus(status:string){this.microphoneStatus=status;this.onMicrophoneStatus(status);}
 onInput:(type:number)=>void=()=>{};onAudio:(pcm:Uint8Array)=>void=()=>{};onError:(message:string)=>void=()=>{};
 constructor(private preview:HTMLElement,private demo:boolean){}
 async connect(){if(this.demo)return;this.bridge=await waitForEvenAppBridge();this.lastScreenKey='';this.sentLayout='';this.bridge.onEvenHubEvent(e=>this.event(e));}
 private event(e:EvenHubEvent){
  if(e.audioEvent){this.audioFrames++;if(this.audioFrames===1)this.micStatus('Receiving glasses microphone audio');this.onAudio(new Uint8Array(e.audioEvent.audioPcm));return;}
  if(e.menuItemClickEvent){if(e.menuItemClickEvent.itemID===1){if(this.overlay)this.pendingDictation=true;else this.onDictate();}return;}
  const envelope=e.sysEvent||e.textEvent||e.listEvent;if(!envelope)return;
  // Zero is omitted by protobuf only within a real input envelope.
  const type=envelope.eventType??0;
  if(type===4){this.overlay=true;return;}
  if(type===5&&this.overlay){this.overlay=false;if(this.pendingDictation){this.pendingDictation=false;this.onDictate();}return;}
  if(type===6||type===7){this.overlay=false;this.pendingDictation=false;}
  this.onInput(type);
 }
 show(screen:Screen){
  this.lastScreen=screen;
  const key=JSON.stringify([screen.title,screen.lines,screen.icons,screen.footer]);if(key===this.lastScreenKey&&screen.image===this.lastImage)return;this.lastScreenKey=key;this.lastImage=screen.image;
  this.preview.replaceChildren();const title=document.createElement('h2');title.textContent=screen.title;this.preview.append(title);
  if(this.lastURL){URL.revokeObjectURL(this.lastURL);this.lastURL='';}
  if(screen.image){const img=document.createElement('img');this.lastURL=URL.createObjectURL(new Blob([screen.image as Uint8Array<ArrayBuffer>],{type:'image/bmp'}));img.src=this.lastURL;img.alt='Green camera snapshot';this.preview.append(img);}
  else if(screen.icons){const menu=document.createElement('div');menu.className='glasses-menu';screen.lines.forEach((line,i)=>{const row=document.createElement('div');row.className='glasses-menu-row';const icon=document.createElement('img');icon.src='data:image/svg+xml,'+encodeURIComponent(iconSVG(screen.icons?.[i]));icon.alt=screen.icons?.[i]||'';const label=document.createElement('span');label.textContent=line;row.append(icon,label);menu.append(row);});this.preview.append(menu);}
  else {const lines=document.createElement('pre');lines.textContent=screen.lines.join('\n');this.preview.append(lines);}
  const footer=document.createElement('small');footer.textContent=screen.footer;this.preview.append(footer);
  const rev=++this.revision;
  this.chain=this.chain.then(async()=>{
   if(!this.bridge||rev!==this.revision)return;
   let textObject=[new TextContainerProperty({containerID:1,containerName:'header',xPosition:0,yPosition:0,width:576,height:36,content:screen.title.slice(0,46),isEventCapture:0}),new TextContainerProperty({containerID:2,containerName:'body',xPosition:0,yPosition:screen.image?212:40,width:576,height:screen.image?32:204,content:screen.image?'Tap to refresh snapshot':screen.lines.join('\n').slice(0,900),isEventCapture:1}),new TextContainerProperty({containerID:3,containerName:'footer',xPosition:0,yPosition:252,width:576,height:36,content:screen.image?'Sending camera image…':screen.footer.slice(0,46),isEventCapture:0})];
   const imageObject=screen.image?[new ImageContainerProperty({containerID:4,containerName:'camera',xPosition:144,yPosition:60,width:288,height:144})]:[];
   if(!screen.image&&screen.icons){
    textObject[0].xPosition=96;textObject[0].width=384;textObject[0].content=screen.title.slice(0,32);
    // A blank capture region prevents native scrolling from moving a visible row.
    textObject=[textObject[0],new TextContainerProperty({containerID:2,containerName:'input',xPosition:96,yPosition:212,width:384,height:32,paddingLength:0,content:' ',isEventCapture:1}),...screen.lines.map((line,i)=>new TextContainerProperty({containerID:10+i,containerName:'row-'+i,xPosition:124,yPosition:40+i*32,width:356,height:32,paddingLength:0,content:line,isEventCapture:0})),textObject[2]];
    for(let i=0;i<screen.lines.length;i+=3)imageObject.push(new ImageContainerProperty({containerID:20+i,containerName:'icons-'+i,xPosition:96,yPosition:40+i*32,width:20,height:Math.min(3,screen.lines.length-i)*32}));
   }
   const layout=screen.image?'':JSON.stringify([textObject.map(t=>({...t,content:undefined})),imageObject]);
   const reuse=!!layout&&layout===this.sentLayout;
   const icons=JSON.stringify(screen.icons);
   const data={containerTotalNum:textObject.length+imageObject.length,textObject,imageObject,menuObject:new MenuContainerProperty({menuItems:[new MenuItemProperty({itemName:'Dictate',itemID:1})]})};
   if(!this.started){const r=await this.bridge.createStartUpPageContainer(new CreateStartUpPageContainer(data));if(r!==StartUpPageCreateResult.success)throw new Error('Glasses rejected the page. Reopen Pome.');this.started=true;}
   else if(!reuse&&!await this.bridge.rebuildPageContainer(new RebuildPageContainer(data)))throw new Error('Glasses display update failed.');
   if(reuse){for(const t of textObject){if(this.sentText.get(t.containerID!)!==t.content){const content=t.content||'';if(!await this.bridge.textContainerUpgrade(new TextContainerUpgrade({containerID:t.containerID,containerName:t.containerName,contentOffset:0,contentLength:content.length,content})))throw new Error('Glasses text update failed.');}}}
   if(!screen.image&&screen.icons&&(!reuse||icons!==this.sentIcons)){for(let i=0;i<screen.lines.length&&rev===this.revision;i+=3){const r=await this.bridge.updateImageRawData(new ImageRawDataUpdate({containerID:20+i,containerName:'icons-'+i,imageData:iconBMP(screen.icons.slice(i,i+3))}));if(!ImageRawDataUpdateResult.isSuccess(r))throw new Error('Menu icon transfer failed: '+r);}}
   // Only remember fully completed transfers; superseded work must be rebuilt.
   this.sentLayout=rev===this.revision?layout:'';this.sentText=new Map(textObject.map(t=>[t.containerID!,t.content||'']));this.sentIcons=icons;
   if(screen.image && rev===this.revision){this.onDisplayStatus('Sending camera image…');const r=await this.bridge.updateImageRawData(new ImageRawDataUpdate({containerID:4,containerName:'camera',imageData:screen.image}));if(!ImageRawDataUpdateResult.isSuccess(r))throw new Error('Camera transfer failed: '+r);this.onDisplayStatus('Camera image accepted by glasses');if(rev===this.revision)await this.bridge.textContainerUpgrade(new TextContainerUpgrade({containerID:3,containerName:'footer',contentOffset:0,contentLength:screen.footer.slice(0,46).length,content:screen.footer.slice(0,46)}));}
  }).catch(async e=>{this.sentLayout='';this.lastScreenKey='';this.onDisplayStatus(e.message);this.onError(e.message);if(screen.image&&rev===this.revision&&this.bridge)await this.bridge.textContainerUpgrade(new TextContainerUpgrade({containerID:3,containerName:'footer',contentOffset:0,contentLength:29,content:'Image failed · retry on phone'})).catch(()=>{});});
 }
 async record(start:boolean){
  if(this.demo)return;
  if(!this.bridge)throw new Error('Open Pome in the Even phone app.');
  // Complete startup/rebuild work before requesting the glasses microphone.
  await this.chain;
  if(start&&!this.started)throw new Error('Glasses page not ready. Reopen Pome before dictating.');
  if(start){
   this.audioFrames=0;this.micStatus('Opening glasses microphone…');
   const accepted=await this.bridge.audioControl(true,AudioInputSource.Glasses);
   if(!accepted){
    // Some hosts can deliver audio before their acknowledgement. Actual PCM is decisive.
    for(let i=0;i<10&&!this.audioFrames;i++)await new Promise(r=>setTimeout(r,100));
    if(!this.audioFrames){this.micStatus('Glasses microphone start declined; no audio received');throw new Error('Glasses mic did not start. Check Pome’s microphone permission in Even.');}
   }
   if(!this.audioFrames)this.micStatus('Microphone opened; waiting for audio');
  }else{
   const accepted=await this.bridge.audioControl(false);
   if(!this.microphoneStatus.startsWith('Glasses microphone start declined'))this.micStatus(accepted?'Microphone stopped': 'Microphone stop not acknowledged; keeping captured audio');
  }
 }
 async exit(){await this.record(false).catch(()=>{});if(this.bridge)await this.bridge.shutDownPageContainer(1);}
}
