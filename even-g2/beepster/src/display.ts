import {cropTopRow} from './window-frame';
import {transferImage} from './image-transfer';
import {threadBitmaps,threadTiles} from './thread-bitmaps';
import {MicrophoneSession} from './microphone';
import {getTextWidth,pxTruncate} from '@evenrealities/pretext';
export function centeredFooter(text:string):string {const label=pxTruncate(text,552);return ' '.repeat(Math.max(0,Math.floor((576-getTextWidth(label))/2/getTextWidth(' '))))+label;}
import {cameraTiles,cameraPageTiles,compactCameraBMP} from './images';
import {iconBMP,iconSVG,type Icon} from './icons';
import {waitForEvenAppBridge,CreateStartUpPageContainer,RebuildPageContainer,TextContainerProperty,TextContainerUpgrade,ImageContainerProperty,ImageRawDataUpdate,MenuContainerProperty,MenuItemProperty,StartUpPageCreateResult,ImageRawDataUpdateResult,AudioInputSource,type EvenAppBridge,type EvenHubEvent} from '@evenrealities/even_hub_sdk';
export type MenuAction='replies'|'dictate'|'pin'|'archive'|'refresh';
export const menuActions: {id:number;label:string;action:MenuAction}[]=[{id:2,label:'Quick reply',action:'replies'},{id:1,label:'Dictate',action:'dictate'},{id:3,label:'Pin / unpin',action:'pin'},{id:4,label:'Archive',action:'archive'},{id:5,label:'Refresh',action:'refresh'}];
export interface FavoriteTarget {key:string;pinned:boolean}
export interface Screen {dividers?:boolean[];titleIcon?:Icon;favorite?:FavoriteTarget;title:string;lines:string[];icons?:(Icon|undefined)[];footer:string;image?:Uint8Array}
export class Display {
 bridge?:EvenAppBridge;private started=false;private chain=Promise.resolve();private revision=0;private lastURL='';private audioFrames=0;private lastScreenKey='';private lastImage?:Uint8Array;private lastScreen?:Screen;
 private useBMP=false;private topInsetImages=new Set<number>();
 private async sendImage(containerID:number,containerName:string,bmp:Uint8Array){
  if(this.topInsetImages.has(containerID))bmp=cropTopRow(bmp);
  const data=this.useBMP?bmp:await transferImage(bmp);
  let result=await this.bridge!.updateImageRawData(new ImageRawDataUpdate({containerID,containerName,imageData:data}));
  if(data!==bmp&&[ImageRawDataUpdateResult.imageException,ImageRawDataUpdateResult.imageSizeInvalid,ImageRawDataUpdateResult.imageToGray4Failed].includes(ImageRawDataUpdateResult.normalize(result))){this.useBMP=true;result=await this.bridge!.updateImageRawData(new ImageRawDataUpdate({containerID,containerName,imageData:bmp}));}
  return result;
 }
 private compactCamera=false;private rebuildAfterOverlay=false;private resumeAt=0;private overlayRetry=false;private quitting=false;private exited=false;
 private imageEpoch=0;private sentLayout='';private sentText=new Map<number,string>();private sentIcons='';private sentStrips=new Map<number,string>();private sentHeading='';private overlay=false;
 private pendingAction?:{action:MenuAction;target?:FavoriteTarget};
 onMenuAction:(action:MenuAction,target?:FavoriteTarget)=>void=()=>{};
 get menuOpen(){return this.overlay;}
 async idle(){let pending;do{pending=this.chain;await pending;}while(pending!==this.chain);}
 private sentFavorite?:FavoriteTarget;private overlayFavorite?:FavoriteTarget;
 onDisplayStatus:(status:string)=>void=()=>{};
 retry(){this.sentLayout='';this.sentIcons='';this.restoreImages();}
 private restoreImages(retry=true,rebuild=true){this.rebuildAfterOverlay ||= rebuild;this.resumeAt=Date.now()+250;this.overlayRetry=retry;this.imageEpoch++;this.sentIcons='';this.sentStrips.clear();this.sentHeading='';if(this.lastScreen){this.lastScreenKey='';this.show(this.lastScreen);}}
 microphoneStatus='Not started';
 onMicrophoneStatus:(status:string)=>void=()=>{};
 private micStatus(status:string){this.microphoneStatus=status;this.onMicrophoneStatus(status);}
 onInput:(type:number)=>void=()=>{};onAudio:(pcm:Uint8Array)=>void=()=>{};onError:(message:string)=>void=()=>{};
 private microphone=new MicrophoneSession(open=>this.bridge!.audioControl(open,open?AudioInputSource.Glasses:undefined),status=>this.micStatus(status));
 constructor(private preview:HTMLElement,private demo:boolean){}
 async connect(){if(this.demo)return;this.bridge=await waitForEvenAppBridge();this.lastScreenKey='';this.sentLayout='';this.bridge.onEvenHubEvent(e=>this.event(e));}
 private event(e:EvenHubEvent){
  if(this.exited)return;
  if(e.audioEvent){if(this.microphone.receive()){this.audioFrames++;this.onAudio(new Uint8Array(e.audioEvent.audioPcm));}return;}
  if(e.menuItemClickEvent){const action=menuActions.find(a=>a.id===e.menuItemClickEvent!.itemID)?.action;if(action){const target=this.overlay?this.overlayFavorite:this.sentFavorite;if(this.overlay)this.pendingAction={action,target};else this.dispatchMenu(action,target);}return;}
  const envelope=e.sysEvent||e.textEvent||e.listEvent;if(!envelope)return;
  // Zero is omitted by protobuf only within a real input envelope.
  const type=envelope.eventType??0;
  if(type===4){this.overlay=true;this.imageEpoch++;this.overlayFavorite=this.sentFavorite;return;}
  if(type===5&&this.overlay){this.overlay=false;const pending=this.pendingAction;this.pendingAction=undefined;this.overlayFavorite=undefined;this.restoreImages();if(pending)this.dispatchMenu(pending.action,pending.target);return;}
  if(type===6||type===7){this.exited=true;this.quitting=false;void this.record(false).catch(()=>{});this.overlay=false;this.pendingAction=undefined;this.overlayFavorite=undefined;}
  if(type===5)this.restoreImages();
  // A delivered app-container gesture proves the native overlay has gone away,
  // even if firmware omitted its foreground-exit event.
  if(this.overlay&&(e.textEvent||e.listEvent)&&type>=0&&type<=3){this.overlay=false;const pending=this.pendingAction;this.pendingAction=undefined;this.overlayFavorite=undefined;this.restoreImages();if(pending)this.dispatchMenu(pending.action,pending.target);}
  this.onInput(type);
 }
 private dispatchMenu(action:MenuAction,target?:FavoriteTarget){this.onMenuAction(action,target);}
 show(screen:Screen){
  this.lastScreen=screen;
  const key=JSON.stringify([screen.title,screen.lines,screen.icons,screen.dividers,screen.footer,screen.favorite,screen.titleIcon]);if(key===this.lastScreenKey&&screen.image===this.lastImage)return;this.lastScreenKey=key;this.lastImage=screen.image;
  this.preview.replaceChildren();const title=document.createElement('h2');title.textContent=screen.title;title.className='glasses-title';const headingIcon=screen.titleIcon||((screen.title==='Beepster'||screen.title==='DEMO · Beepster')?'message':undefined);const headingText=screen.title.replace(/^DEMO · /,'');if(headingIcon){title.textContent='';for(let i=0;i<3;i++){const child=document.createElement(i===1?'span':'img');if(i!==1){(child as HTMLImageElement).src='data:image/svg+xml,'+encodeURIComponent(iconSVG(headingIcon));}else child.textContent=headingText;title.append(child);}}this.preview.append(title);
  if(this.lastURL){URL.revokeObjectURL(this.lastURL);this.lastURL='';}
  if(screen.image){const img=document.createElement('img');this.lastURL=URL.createObjectURL(new Blob([screen.image as Uint8Array<ArrayBuffer>],{type:'image/bmp'}));img.src=this.lastURL;img.alt='Green attachment preview';this.preview.append(img);}
  else if(screen.icons){const menu=document.createElement('div');menu.className='glasses-menu';screen.lines.forEach((line,i)=>{const row=document.createElement('div');row.className='glasses-menu-row'+(screen.dividers?.[i]?' message-divider':'');const icon=document.createElement('img');icon.src='data:image/svg+xml,'+encodeURIComponent(iconSVG(screen.icons?.[i]));icon.alt=screen.icons?.[i]||'';const label=document.createElement('span');label.textContent=line;row.append(icon,label);menu.append(row);});this.preview.append(menu);}
  else {const lines=document.createElement('pre');lines.textContent=screen.lines.join('\n');this.preview.append(lines);}

  const rev=++this.revision;
  this.chain=this.chain.then(async()=>{
   if(!this.bridge||this.exited||this.overlay||rev!==this.revision)return;
   const delay=this.resumeAt-Date.now();if(delay>0)await new Promise(r=>setTimeout(r,delay));
   if(this.exited||this.overlay||rev!==this.revision)return;
   const imageEpoch=this.imageEpoch;
   if(this.rebuildAfterOverlay){this.sentLayout='';this.sentText.clear();this.rebuildAfterOverlay=false;}
   let textObject=[new TextContainerProperty({containerID:1,containerName:'header',xPosition:0,yPosition:0,width:576,height:36,content:screen.title.slice(0,46),isEventCapture:0}),new TextContainerProperty({containerID:2,containerName:'body',xPosition:0,yPosition:40,width:screen.image?20:576,height:screen.image?32:204,content:screen.image?' ':screen.lines.join('\n').slice(0,900),isEventCapture:1})];
   const imageObject=screen.image?(this.compactCamera?[new ImageContainerProperty({containerID:4,containerName:'camera-0',xPosition:144,yPosition:72,width:288,height:144})]:[0,1,2,3].map(i=>new ImageContainerProperty({containerID:4+i,containerName:'camera-'+i,xPosition:72+(i%2)*216,yPosition:36+Math.floor(i/2)*108,width:216,height:108}))):[];
   if(!screen.image&&screen.icons){
    // Fixed geometry prevents page rebuilds from erasing bitmap RAM on scroll.
    const menuWidth=440,menuLeft=50;
    textObject[0].xPosition=96;textObject[0].width=384;textObject[0].content=screen.title.slice(0,32);
    // A blank capture region prevents native scrolling from moving a visible row.
    textObject=[textObject[0],new TextContainerProperty({containerID:2,containerName:'input',xPosition:96,yPosition:264,width:384,height:20,paddingLength:0,content:' ',isEventCapture:1}),...Array.from({length:6},(_,i)=>screen.lines[i]||' ').map((line,i)=>new TextContainerProperty({containerID:10+i,containerName:'row-'+i,xPosition:menuLeft+28,yPosition:64+i*32,width:menuWidth+2,height:32,paddingLength:0,content:line,isEventCapture:0}))];
    for(let i=0;i<6;i+=3)imageObject.push(new ImageContainerProperty({containerID:20+i,containerName:'icons-'+i,xPosition:menuLeft,yPosition:64+i*32,width:screen.dividers?288:20,height:Math.min(3,6-i)*32}));
   }
   if(!screen.image&&!screen.icons){
    // Keep reading rows out of the native scrolling capture container too.
    textObject=[textObject[0],new TextContainerProperty({containerID:2,containerName:'input',xPosition:0,yPosition:264,width:576,height:20,paddingLength:0,content:' ',isEventCapture:1}),...Array.from({length:6},(_,i)=>screen.lines[i]||' ').map((line,i)=>new TextContainerProperty({containerID:10+i,containerName:'line-'+i,xPosition:12,yPosition:52+i*34,width:552,height:34,paddingLength:0,content:line||' ',isEventCapture:0}))];
   }
   const compositeThread=!!screen.dividers;
   if(compositeThread){imageObject.splice(0,imageObject.length,...threadTiles.map((t,i)=>new ImageContainerProperty({containerID:20+i,containerName:'thread-'+i,xPosition:t.x,yPosition:t.y,width:t.width,height:t.height})));}
   // Blank gestures use a full-canvas background layer, not a small native
   // scrollable widget at the top left. Keep visible content above this layer.
   for(const text of textObject)if(text.isEventCapture===1&&!text.content?.trim())Object.assign(text,{xPosition:0,yPosition:0,width:576,height:288,paddingLength:0,borderWidth:1,borderColor:8,borderRadius:0});
   const decoratedTitle=!!headingIcon;
   const compositeCamera=!!screen.image&&!this.compactCamera&&decoratedTitle;
   let headingXs:number[]=[];
   if(decoratedTitle){const label=pxTruncate(headingText,360);const width=getTextWidth(label),left=Math.floor(288-width/2);Object.assign(textObject[0],{xPosition:left,width,paddingLength:0,content:label});headingXs=[left-36,left+width+16];if(!compositeCamera&&!compositeThread)for(const [i,x] of headingXs.entries())imageObject.push(new ImageContainerProperty({containerID:30+i,containerName:'title-icon-'+i,xPosition:x,yPosition:0,width:20,height:32}));}
   if(compositeCamera){imageObject.forEach((image,i)=>Object.assign(image,{yPosition:Math.floor(i/2)*126,height:126,zOrderIndex:i}));textObject.forEach((text,i)=>text.zOrderIndex=4+i);}
   // Wide icon strips carry thin dividers behind native text; geometry stays fixed while scrolling.
   if(screen.dividers){imageObject.forEach((image,i)=>image.zOrderIndex=i);textObject.forEach((text,i)=>text.zOrderIndex=imageObject.length+i);}
   // The OS only replaces menu labels through a page rebuild. A stable toggle
   // avoids clearing every bitmap as selection moves between pin states.
   const menuItems=menuActions.map(a=>new MenuItemProperty({itemName:a.label,itemID:a.id}));
   const backgroundCapture=textObject.find(t=>t.isEventCapture===1&&!t.content?.trim());
   if(backgroundCapture){backgroundCapture.zOrderIndex=0;imageObject.forEach((image,i)=>image.zOrderIndex=i+1);textObject.filter(t=>t!==backgroundCapture).forEach((text,i)=>text.zOrderIndex=imageObject.length+i+1);}
   // Keep the outside pixel row clear for the background frame. Cropping the
   // corresponding BMP row preserves all remaining icon/divider positions.
   this.topInsetImages.clear();
   for(const image of imageObject)if(image.yPosition===0){this.topInsetImages.add(image.containerID!);image.yPosition=1;image.height=image.height!-1;}
   for(const text of textObject)if(text!==backgroundCapture){
    if(text.xPosition===0){text.xPosition=1;text.width=text.width!-1;}
    if((text.xPosition!+text.width!)===576)text.width=text.width!-1;
    if(text.yPosition===0){text.yPosition=1;text.height=text.height!-1;}
   }
   const layout=screen.image?'':JSON.stringify([textObject.map(t=>({...t,content:undefined})),imageObject,menuItems]);
   const reuse=!!layout&&layout===this.sentLayout;
   const icons=JSON.stringify([screen.icons,headingIcon]);
   const data={containerTotalNum:textObject.length+imageObject.length,textObject,imageObject,menuObject:new MenuContainerProperty({menuItems})};
   if(!this.started){const r=await this.bridge.createStartUpPageContainer(new CreateStartUpPageContainer(data));if(r!==StartUpPageCreateResult.success)throw new Error('Glasses rejected the page. Reopen Beepster.');this.started=true;}
   else if(!reuse&&!await this.bridge.rebuildPageContainer(new RebuildPageContainer(data)))throw new Error('Glasses display update failed.');
   if(reuse){for(const t of textObject){if(this.sentText.get(t.containerID!)!==t.content){const content=t.content||'';if(!await this.bridge.textContainerUpgrade(new TextContainerUpgrade({containerID:t.containerID,containerName:t.containerName,contentOffset:0,contentLength:content.length,content})))throw new Error('Glasses text update failed.');}}}
   let imagesComplete=true;
   if(!screen.image&&screen.icons&&!compositeThread){for(let i=0;i<6;i+=3){const rowIcons=Array.from({length:Math.min(3,6-i)},(_,j)=>screen.icons?.[i+j]);const strip=JSON.stringify(rowIcons);if(this.exited||this.overlay||rev!==this.revision){imagesComplete=false;break;}const r=await this.sendImage(20+i,'icons-'+i,iconBMP(rowIcons,screen.dividers?.slice(i,i+3)));if(!ImageRawDataUpdateResult.isSuccess(r))throw new Error('Menu icon transfer failed: '+r);if(imageEpoch===this.imageEpoch)this.sentStrips.set(i,strip);}}
   if(compositeThread){const tiles=threadBitmaps(screen.icons||[],screen.dividers||[],headingIcon,headingXs);for(let i=0;i<tiles.length;i++){if(this.exited||this.overlay||rev!==this.revision){imagesComplete=false;break;}const result=await this.sendImage(20+i,'thread-'+i,tiles[i]);if(!ImageRawDataUpdateResult.isSuccess(result))throw new Error('Thread image transfer failed: '+result);}}
   if(decoratedTitle&&!compositeCamera&&!compositeThread){for(let i=0;i<2;i++){if(this.exited||this.overlay||rev!==this.revision){imagesComplete=false;break;}const result=await this.sendImage(30+i,'title-icon-'+i,iconBMP([headingIcon]));if(!ImageRawDataUpdateResult.isSuccess(result))throw new Error('Title icon '+(i+1)+' transfer failed: '+result);}}
   // Finish icon strips even when a newer cursor update is queued. Rebuilding on
   // every interrupted scroll can repeatedly erase icons before both strips arrive.
   this.sentLayout=!this.overlay&&imageEpoch===this.imageEpoch?layout:'';this.sentText=new Map(textObject.map(t=>[t.containerID!,t.content||'']));this.sentIcons=imageEpoch===this.imageEpoch?icons:'';this.sentHeading=imagesComplete&&imageEpoch===this.imageEpoch?(headingIcon||''):'';this.sentFavorite=screen.favorite?{...screen.favorite}:undefined;
   if(imagesComplete&&!this.overlay&&imageEpoch===this.imageEpoch)this.overlayRetry=false;
   if(screen.image && rev===this.revision){this.onDisplayStatus('Sending attachment image…');const tiles=this.compactCamera?[compactCameraBMP(screen.image)]:compositeCamera?cameraPageTiles(screen.image,headingIcon!,headingXs):cameraTiles(screen.image);for(let i=0;i<tiles.length;i++){if(this.exited||this.overlay||rev!==this.revision)return;const r=await this.sendImage(4+i,'camera-'+i,tiles[i]);if(!ImageRawDataUpdateResult.isSuccess(r))throw new Error('Camera '+(this.compactCamera?'image':'tile '+(i+1))+' transfer failed: '+r);}this.onDisplayStatus(this.compactCamera?'Camera accepted in compatibility size':'Attachment image accepted by glasses');}
  }).catch(async e=>{if(rev!==this.revision||this.overlay)return;this.sentLayout='';this.lastScreenKey='';if(this.overlayRetry){this.overlayRetry=false;this.restoreImages(false);return;}if(screen.image&&rev===this.revision&&!this.compactCamera){this.compactCamera=true;this.onDisplayStatus(e.message+' · retrying at compatibility size');this.show(screen);return;}this.onDisplayStatus(e.message);this.onError(e.message);});
 }
 async record(start:boolean){
  if(this.demo)return;
  if(!this.bridge)throw new Error('Open Beepster in the Even phone app.');
  if(!start)return this.microphone.stop();
  this.audioFrames=0;
  return this.microphone.start(async()=>{
   // Drain all queued rebuilds, including an overlay restoration queued while waiting.
   let pending;do {pending=this.chain;await pending;}while(pending!==this.chain);
   for(let i=0;i<40&&this.overlay;i++)await new Promise(r=>setTimeout(r,50));
   if(this.overlay)throw Error('Close the G2 menu before dictating.');
   do {pending=this.chain;await pending;}while(pending!==this.chain);
   if(!this.started)throw Error('Glasses page not ready. Reopen Beepster before dictating.');
  });
 }
 // The controller owns confirmation. Avoid the native quit overlay, which
 // clears bitmap containers even when the user chooses to stay.
 async exit(){
  if(!this.bridge||this.quitting||this.exited)return;
  this.quitting=true;
  try{const accepted=await this.bridge.shutDownPageContainer(0);if(!accepted&&!this.exited)throw Error('Could not close Beepster. Try again.');if(!this.exited){this.exited=true;await this.record(false).catch(()=>{});this.onInput(7);}}
  finally{this.quitting=false;}
 }
}
