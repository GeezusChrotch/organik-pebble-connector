import {getTextWidth,pxTruncate} from '@evenrealities/pretext';
export function centeredFooter(text:string):string {const label=pxTruncate(text,552);return ' '.repeat(Math.max(0,Math.floor((576-getTextWidth(label))/2/getTextWidth(' '))))+label;}
import {cameraTiles,cameraPageTiles,compactCameraBMP} from './images';
import {iconBMP,iconSVG,type Icon} from './icons';
import {waitForEvenAppBridge,CreateStartUpPageContainer,RebuildPageContainer,TextContainerProperty,TextContainerUpgrade,ImageContainerProperty,ImageRawDataUpdate,MenuContainerProperty,MenuItemProperty,StartUpPageCreateResult,ImageRawDataUpdateResult,AudioInputSource,type EvenAppBridge,type EvenHubEvent} from '@evenrealities/even_hub_sdk';
export interface FavoriteTarget {key:string;pinned:boolean}
export interface Screen {titleIcon?:Icon;favorite?:FavoriteTarget;title:string;lines:string[];icons?:(Icon|undefined)[];footer:string;image?:Uint8Array}
export class Display {
 bridge?:EvenAppBridge;private started=false;private chain=Promise.resolve();private revision=0;private lastURL='';private audioFrames=0;private lastScreenKey='';private lastImage?:Uint8Array;private lastScreen?:Screen;
 private compactCamera=false;
 private imageEpoch=0;private sentLayout='';private sentText=new Map<number,string>();private sentIcons='';private sentStrips=new Map<number,string>();private sentHeading='';private overlay=false;private pendingDictation=false;
 private sentFavorite?:FavoriteTarget;private overlayFavorite?:FavoriteTarget;private pendingFavorite?:FavoriteTarget;
 onFavoriteUnavailable:()=>void=()=>{};
 onFavorite:(favorite:FavoriteTarget)=>void=()=>{};
 onDictate:()=>void=()=>{};
 onDisplayStatus:(status:string)=>void=()=>{};
 retry(){this.sentLayout='';this.sentIcons='';this.restoreImages();}
 private restoreImages(){this.sentLayout='';this.imageEpoch++;this.sentIcons='';this.sentStrips.clear();this.sentHeading='';if(this.lastScreen){this.lastScreenKey='';this.show(this.lastScreen);}}
 microphoneStatus='Not started';
 onMicrophoneStatus:(status:string)=>void=()=>{};
 private micStatus(status:string){this.microphoneStatus=status;this.onMicrophoneStatus(status);}
 onInput:(type:number)=>void=()=>{};onAudio:(pcm:Uint8Array)=>void=()=>{};onError:(message:string)=>void=()=>{};
 constructor(private preview:HTMLElement,private demo:boolean){}
 async connect(){if(this.demo)return;this.bridge=await waitForEvenAppBridge();this.lastScreenKey='';this.sentLayout='';this.bridge.onEvenHubEvent(e=>this.event(e));}
 private event(e:EvenHubEvent){
  if(e.audioEvent){this.audioFrames++;if(this.audioFrames===1)this.micStatus('Receiving glasses microphone audio');this.onAudio(new Uint8Array(e.audioEvent.audioPcm));return;}
  if(e.menuItemClickEvent){if(e.menuItemClickEvent.itemID===2){const f=this.overlay?this.overlayFavorite:this.sentFavorite;if(f){if(this.overlay)this.pendingFavorite=f;else this.onFavorite(f);}else this.onFavoriteUnavailable();return;}if(e.menuItemClickEvent.itemID===1){if(this.overlay)this.pendingDictation=true;else this.onDictate();}return;}
  const envelope=e.sysEvent||e.textEvent||e.listEvent;if(!envelope)return;
  // Zero is omitted by protobuf only within a real input envelope.
  const type=envelope.eventType??0;
  if(type===4){this.overlay=true;this.imageEpoch++;this.overlayFavorite=this.sentFavorite;return;}
  if(type===5&&this.overlay){this.overlay=false;const favorite=this.pendingFavorite;this.pendingFavorite=undefined;this.overlayFavorite=undefined;this.restoreImages();if(favorite)this.onFavorite(favorite);if(this.pendingDictation){this.pendingDictation=false;this.onDictate();}return;}
  if(type===6||type===7){this.overlay=false;this.pendingDictation=false;this.pendingFavorite=undefined;this.overlayFavorite=undefined;}
  if(type===5)this.restoreImages();
  this.onInput(type);
 }
 show(screen:Screen){
  this.lastScreen=screen;
  const key=JSON.stringify([screen.title,screen.lines,screen.icons,screen.footer,screen.favorite,screen.titleIcon]);if(key===this.lastScreenKey&&screen.image===this.lastImage)return;this.lastScreenKey=key;this.lastImage=screen.image;
  this.preview.replaceChildren();const title=document.createElement('h2');title.textContent=screen.title;title.className='glasses-title';const headingIcon=screen.titleIcon||((screen.title==='Pome'||screen.title==='DEMO · Pome')?'scene':undefined);const headingText=screen.title.replace(/^DEMO · /,'');if(headingIcon){title.textContent='';for(let i=0;i<3;i++){const child=document.createElement(i===1?'span':'img');if(i!==1){(child as HTMLImageElement).src='data:image/svg+xml,'+encodeURIComponent(iconSVG(headingIcon));}else child.textContent=headingText;title.append(child);}}this.preview.append(title);
  if(this.lastURL){URL.revokeObjectURL(this.lastURL);this.lastURL='';}
  if(screen.image){const img=document.createElement('img');this.lastURL=URL.createObjectURL(new Blob([screen.image as Uint8Array<ArrayBuffer>],{type:'image/bmp'}));img.src=this.lastURL;img.alt='Green camera snapshot';this.preview.append(img);}
  else if(screen.icons){const menu=document.createElement('div');menu.className='glasses-menu';screen.lines.forEach((line,i)=>{const row=document.createElement('div');row.className='glasses-menu-row';const icon=document.createElement('img');icon.src='data:image/svg+xml,'+encodeURIComponent(iconSVG(screen.icons?.[i]));icon.alt=screen.icons?.[i]||'';const label=document.createElement('span');label.textContent=line;row.append(icon,label);menu.append(row);});this.preview.append(menu);}
  else {const lines=document.createElement('pre');lines.textContent=screen.lines.join('\n');this.preview.append(lines);}
  const footer=document.createElement('small');footer.textContent=screen.footer;this.preview.append(footer);
  const rev=++this.revision;
  this.chain=this.chain.then(async()=>{
   if(!this.bridge||this.overlay||rev!==this.revision)return;
   const imageEpoch=this.imageEpoch;
   let textObject=[new TextContainerProperty({containerID:1,containerName:'header',xPosition:0,yPosition:0,width:576,height:36,content:screen.title.slice(0,46),isEventCapture:0}),new TextContainerProperty({containerID:2,containerName:'body',xPosition:0,yPosition:40,width:screen.image?20:576,height:screen.image?32:204,content:screen.image?' ':screen.lines.join('\n').slice(0,900),isEventCapture:1}),new TextContainerProperty({containerID:3,containerName:'footer',xPosition:0,yPosition:252,width:576,height:36,paddingLength:0,content:centeredFooter(screen.image?'Sending camera image…':screen.footer),isEventCapture:0})];
   const imageObject=screen.image?(this.compactCamera?[new ImageContainerProperty({containerID:4,containerName:'camera-0',xPosition:144,yPosition:72,width:288,height:144})]:[0,1,2,3].map(i=>new ImageContainerProperty({containerID:4+i,containerName:'camera-'+i,xPosition:72+(i%2)*216,yPosition:36+Math.floor(i/2)*108,width:216,height:108}))):[];
   if(!screen.image&&screen.icons){
    // Fixed geometry prevents page rebuilds from erasing bitmap RAM on scroll.
    const menuWidth=440,menuLeft=54;
    textObject[0].xPosition=96;textObject[0].width=384;textObject[0].content=screen.title.slice(0,32);
    // A blank capture region prevents native scrolling from moving a visible row.
    textObject=[textObject[0],new TextContainerProperty({containerID:2,containerName:'input',xPosition:96,yPosition:228,width:384,height:20,paddingLength:0,content:' ',isEventCapture:1}),...Array.from({length:5},(_,i)=>screen.lines[i]||' ').map((line,i)=>new TextContainerProperty({containerID:10+i,containerName:'row-'+i,xPosition:menuLeft+28,yPosition:64+i*32,width:menuWidth+2,height:32,paddingLength:0,content:line,isEventCapture:0})),textObject[2]];
    for(let i=0;i<5;i+=3)imageObject.push(new ImageContainerProperty({containerID:20+i,containerName:'icons-'+i,xPosition:menuLeft,yPosition:64+i*32,width:20,height:Math.min(3,5-i)*32}));
   }
   if(!textObject.some(t=>t.isEventCapture===1&&!t.content?.trim())){textObject.forEach(t=>t.isEventCapture=0);textObject.push(new TextContainerProperty({containerID:9,containerName:'frame',content:' ',isEventCapture:1}));}
   // Blank gestures use a full-canvas background layer, not a small native
   // scrollable widget at the top left. Keep visible content above this layer.
   for(const text of textObject)if(text.isEventCapture===1&&!text.content?.trim())Object.assign(text,{xPosition:0,yPosition:0,width:576,height:288,paddingLength:0,borderWidth:1,borderColor:8,borderRadius:0});
   const decoratedTitle=!!headingIcon;
   const compositeCamera=!!screen.image&&!this.compactCamera&&decoratedTitle;
   let headingXs:number[]=[];
   if(decoratedTitle){const label=pxTruncate(headingText,360);const width=getTextWidth(label),left=Math.floor(288-width/2);Object.assign(textObject[0],{xPosition:left,width,paddingLength:0,content:label});headingXs=[left-36,left+width+16];if(!compositeCamera)for(const [i,x] of headingXs.entries())imageObject.push(new ImageContainerProperty({containerID:30+i,containerName:'title-icon-'+i,xPosition:x,yPosition:0,width:20,height:32}));}
   if(compositeCamera){imageObject.forEach((image,i)=>Object.assign(image,{yPosition:Math.floor(i/2)*126,height:126,zOrderIndex:i}));textObject.forEach((text,i)=>text.zOrderIndex=4+i);}
   // The OS only replaces menu labels through a page rebuild. A stable toggle
   // avoids clearing every bitmap as selection moves between pin states.
   const menuItems=[new MenuItemProperty({itemName:'Dictate',itemID:1}),new MenuItemProperty({itemName:'Pin / unpin',itemID:2})];
   if(compositeCamera)imageObject.forEach(image=>image.yPosition=(image.yPosition||0)+1);
   for(const image of imageObject)if(image.yPosition===0)image.yPosition=1;
   for(const text of textObject)if(!text.isEventCapture){const right=Math.min(575,(text.xPosition||0)+(text.width||0)),bottom=Math.min(287,(text.yPosition||0)+(text.height||0));text.xPosition=Math.max(1,text.xPosition||0);text.yPosition=Math.max(1,text.yPosition||0);text.width=right-text.xPosition;text.height=bottom-text.yPosition;}
   const backgroundCapture=textObject.find(t=>t.isEventCapture===1&&!t.content?.trim());
   if(backgroundCapture){backgroundCapture.zOrderIndex=0;imageObject.forEach((image,i)=>image.zOrderIndex=i+1);textObject.filter(t=>t!==backgroundCapture).forEach((text,i)=>text.zOrderIndex=imageObject.length+i+1);}
   const layout=screen.image?'':JSON.stringify([textObject.map(t=>({...t,content:undefined})),imageObject,menuItems]);
   const reuse=!!layout&&layout===this.sentLayout;
   const icons=JSON.stringify([screen.icons,headingIcon]);
   const data={containerTotalNum:textObject.length+imageObject.length,textObject,imageObject,menuObject:new MenuContainerProperty({menuItems})};
   if(!this.started){const r=await this.bridge.createStartUpPageContainer(new CreateStartUpPageContainer(data));if(r!==StartUpPageCreateResult.success)throw new Error('Glasses rejected the page. Reopen Pome.');this.started=true;}
   else if(!reuse&&!await this.bridge.rebuildPageContainer(new RebuildPageContainer(data)))throw new Error('Glasses display update failed.');
   if(reuse){for(const t of textObject){if(this.sentText.get(t.containerID!)!==t.content){const content=t.content||'';if(!await this.bridge.textContainerUpgrade(new TextContainerUpgrade({containerID:t.containerID,containerName:t.containerName,contentOffset:0,contentLength:content.length,content})))throw new Error('Glasses text update failed.');}}}
   let imagesComplete=true;
   if(!screen.image&&screen.icons){for(let i=0;i<5;i+=3){const rowIcons=Array.from({length:Math.min(3,5-i)},(_,j)=>screen.icons?.[i+j]);const strip=JSON.stringify(rowIcons);if(this.overlay){imagesComplete=false;break;}const r=await this.bridge.updateImageRawData(new ImageRawDataUpdate({containerID:20+i,containerName:'icons-'+i,imageData:iconBMP(rowIcons)}));if(!ImageRawDataUpdateResult.isSuccess(r))throw new Error('Menu icon transfer failed: '+r);if(imageEpoch===this.imageEpoch)this.sentStrips.set(i,strip);}}
   if(decoratedTitle&&!compositeCamera){for(let i=0;i<2;i++){if(this.overlay){imagesComplete=false;break;}const result=await this.bridge.updateImageRawData(new ImageRawDataUpdate({containerID:30+i,containerName:'title-icon-'+i,imageData:iconBMP([headingIcon])}));if(!ImageRawDataUpdateResult.isSuccess(result))throw new Error('Title icon '+(i+1)+' transfer failed: '+result);}}
   // Finish icon strips even when a newer cursor update is queued. Rebuilding on
   // every interrupted scroll can repeatedly erase icons before both strips arrive.
   this.sentLayout=imagesComplete&&!this.overlay?layout:'';this.sentText=new Map(textObject.map(t=>[t.containerID!,t.content||'']));this.sentIcons=imageEpoch===this.imageEpoch?icons:'';this.sentHeading=imagesComplete&&imageEpoch===this.imageEpoch?(headingIcon||''):'';this.sentFavorite=screen.favorite?{...screen.favorite}:undefined;
   if(screen.image && rev===this.revision){this.onDisplayStatus('Sending camera image…');const tiles=this.compactCamera?[compactCameraBMP(screen.image)]:compositeCamera?cameraPageTiles(screen.image,headingIcon!,headingXs):cameraTiles(screen.image);for(let i=0;i<tiles.length;i++){if(this.overlay||rev!==this.revision)return;const r=await this.bridge.updateImageRawData(new ImageRawDataUpdate({containerID:4+i,containerName:'camera-'+i,imageData:tiles[i]}));if(!ImageRawDataUpdateResult.isSuccess(r))throw new Error('Camera '+(this.compactCamera?'image':'tile '+(i+1))+' transfer failed: '+r);}this.onDisplayStatus(this.compactCamera?'Camera accepted in compatibility size':'Camera image accepted by glasses');if(rev===this.revision)await this.bridge.textContainerUpgrade(new TextContainerUpgrade({containerID:3,containerName:'footer',contentOffset:0,contentLength:centeredFooter(screen.footer).length,content:centeredFooter(screen.footer)}));}
  }).catch(async e=>{this.sentLayout='';this.lastScreenKey='';if(screen.image&&rev===this.revision&&!this.compactCamera){this.compactCamera=true;this.onDisplayStatus(e.message+' · retrying at compatibility size');this.show(screen);return;}this.onDisplayStatus(e.message);this.onError(e.message);if(screen.image&&rev===this.revision&&this.bridge)await this.bridge.textContainerUpgrade(new TextContainerUpgrade({containerID:3,containerName:'footer',contentOffset:0,contentLength:centeredFooter('Image failed · retry on phone').length,content:centeredFooter('Image failed · retry on phone')})).catch(()=>{});});
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
