import {decorationBMP,calendarSVG} from './decorations';
import {getTextWidth,pxTruncate} from '@evenrealities/pretext';
import {waitForEvenAppBridge,CreateStartUpPageContainer,RebuildPageContainer,TextContainerProperty,TextContainerUpgrade,ImageContainerProperty,ImageRawDataUpdate,ImageRawDataUpdateResult,MenuContainerProperty,MenuItemProperty,StartUpPageCreateResult,type EvenAppBridge,type EvenHubEvent} from '@evenrealities/even_hub_sdk';
export interface Screen {title:string;lines:string[];footer:string;calendarIcon?:boolean;dayBreaks?:number[]}
export const menuActions=['Today','Previous week','Next week','Previous month','Next month','Previous year','Next year','Calendars','Settings','Refresh'] as const;
export type MenuAction=typeof menuActions[number];
// Center the complete column, using a stable cursor gutter rather than centering rows.
export function screenGeometry(screen:Screen){
 const lines=Array.from({length:6},(_,i)=>pxTruncate(screen.lines[i]||' ',528));
 const width=Math.min(528,Math.max(1,...lines.map(line=>Math.ceil(getTextWidth(line.replace(/^[› ] /,'› '))))));
 const title=pxTruncate(screen.title,screen.calendarIcon?498:528),titleWidth=Math.ceil(getTextWidth(title));
 const titleLeft=Math.floor((576-titleWidth-(screen.calendarIcon?30:0))/2);
 const rowWidths=lines.map((line,i)=>screen.dayBreaks?.includes(i)?Math.max(1,Math.ceil(getTextWidth(line))):width);
 const rowLefts=rowWidths.map(w=>Math.floor((576-w)/2));
 return {lines,width,left:Math.floor((576-width)/2),rowWidths,rowLefts,title,titleWidth,titleLeft};
}
export class Display {
 bridge?:EvenAppBridge;private started=false;private chain=Promise.resolve();private revision=0;private last?:Screen;private sent:string[]=[];private sentLayout='';private sentDecorations='';private rebuild=false;private overlay=false;private ended=false;private pending?:MenuAction;
 onInput:(type:number)=>void=()=>{};onMenu:(action:MenuAction)=>void=()=>{};onError:(message:string)=>void=()=>{};
 constructor(private preview:HTMLElement,private demo:boolean){}
 async connect(getBridge=waitForEvenAppBridge){if(this.demo)return;this.bridge=await getBridge();this.bridge.onEvenHubEvent(e=>this.event(e));this.show({title:'DayFrame',lines:['Reading saved settings…'],footer:''});await this.idle();}
 private restore(){this.rebuild=true;this.sent=[];if(this.last)this.show(this.last);}
 private event(e:EvenHubEvent){
  if(this.ended)return;
  if(e.menuItemClickEvent){const a=menuActions[e.menuItemClickEvent.itemID!-1];if(a){if(this.overlay)this.pending=a;else this.onMenu(a);}return;}
  const input=e.sysEvent||e.textEvent||e.listEvent;if(!input)return;const type=input.eventType??0;
  if(type===4){this.overlay=true;return;}
  if(type===6||type===7){this.ended=true;this.onInput(type);return;}
  if(type===5||(this.overlay&&(e.textEvent||e.listEvent)&&type>=0&&type<=3)){this.overlay=false;this.restore();const a=this.pending;this.pending=undefined;if(a)this.onMenu(a);}
  this.onInput(type);
 }
 show(screen:Screen){
  this.last=screen;
  this.preview.replaceChildren();const heading=document.createElement('h2');heading.textContent=screen.title;if(screen.calendarIcon){const icon=document.createElement('img');icon.className='calendar-icon';icon.src='data:image/svg+xml,'+encodeURIComponent(calendarSVG());icon.alt='';heading.prepend(icon);}this.preview.append(heading);
  const list=document.createElement('div');list.className='preview-list';this.preview.append(list);
  for(let i=0;i<6;i++){const line=document.createElement('div');line.className='preview-row'+((screen.dayBreaks||[]).includes(i)?' event-divider':'');line.textContent=screen.lines[i]||' ';list.append(line);}
  const footer=document.createElement('small');footer.textContent=screen.footer;this.preview.append(footer);
  const rev=++this.revision;
  this.chain=this.chain.then(async()=>{
   if(!this.bridge||this.ended||this.overlay||rev!==this.revision)return;
   const geometry=screenGeometry(screen);
   const values=[geometry.title,...geometry.lines];
   const layout=JSON.stringify([screen.calendarIcon?'calendar':'text',geometry.left,geometry.width,geometry.titleLeft,geometry.titleWidth,geometry.rowWidths,screen.dayBreaks]);const decorations=JSON.stringify([screen.calendarIcon,screen.dayBreaks]);
   if(values.every((s,i)=>s===this.sent[i])&&!this.rebuild&&layout===this.sentLayout&&decorations===this.sentDecorations)return;
   const rebuild=this.rebuild||layout!==this.sentLayout;
   // Firmware allows eight text containers: one capture, one heading, six rows.
   // The phone preview footer does not consume a ninth glasses container.
   const textObject=[new TextContainerProperty({containerID:1,containerName:'input',xPosition:0,yPosition:0,width:576,height:288,paddingLength:0,borderWidth:1,borderColor:8,borderRadius:0,content:' ',isEventCapture:1,zOrderIndex:0}),...values.map((content,i)=>new TextContainerProperty({containerID:i+2,containerName:'text-'+i,xPosition:i===0?geometry.titleLeft+(screen.calendarIcon?30:0):geometry.rowLefts[i-1],yPosition:i===0?6:40+(i-1)*36,width:i===0?geometry.titleWidth:geometry.rowWidths[i-1],height:36,paddingLength:0,content,isEventCapture:0,zOrderIndex:i+5}))];
   const imageObject=screen.calendarIcon?[new ImageContainerProperty({containerID:20,containerName:'calendar',xPosition:geometry.titleLeft,yPosition:6,width:20,height:32,zOrderIndex:1})]:screen.dayBreaks?.length?Array.from({length:screen.dayBreaks.length*2},(_,i)=>new ImageContainerProperty({containerID:20+i,containerName:'rule-'+i,xPosition:4+(i%2)*284,yPosition:28+screen.dayBreaks![Math.floor(i/2)]*36,width:284,height:20,zOrderIndex:i+1})):[];
   const data={containerTotalNum:textObject.length+imageObject.length,textObject,imageObject,menuObject:new MenuContainerProperty({menuItems:menuActions.map((itemName,i)=>new MenuItemProperty({itemName,itemID:i+1}))})};
   if(!this.started){const r=await this.bridge.createStartUpPageContainer(new CreateStartUpPageContainer(data));if(r!==StartUpPageCreateResult.success)throw Error('Glasses rejected the page. Reopen DayFrame.');this.started=true;}
   else if(rebuild){if(!await this.bridge.rebuildPageContainer(new RebuildPageContainer(data)))throw Error('Glasses could not restore DayFrame.');}
   else for(const [i,content] of values.entries()){if(this.sent[i]===content)continue;if(!await this.bridge.textContainerUpgrade(new TextContainerUpgrade({containerID:i+2,containerName:'text-'+i,contentOffset:0,contentLength:content.length,content})))throw Error('Glasses text update failed.');}
   // Text updates and overlays can erase image RAM. Repaint after text, as in Pome.
   for(const [i,tile] of imageObject.entries()){
    if(this.overlay){this.rebuild=true;return;}
    const kind=screen.calendarIcon?'calendar':'rule';
    const result=await this.bridge.updateImageRawData(new ImageRawDataUpdate({containerID:tile.containerID,containerName:tile.containerName,imageData:decorationBMP(kind)}));
    if(!ImageRawDataUpdateResult.isSuccess(result))throw Error('Glasses decoration transfer failed.');
   }
   this.sent=values;this.sentLayout=layout;this.sentDecorations=decorations;this.rebuild=false;
  }).catch(e=>{this.sent=[];this.rebuild=true;this.onError(e.message);});
 }
 async idle(){let p;do{p=this.chain;await p;}while(p!==this.chain);}
 async exit(){if(this.bridge&&!this.ended)await this.bridge.shutDownPageContainer(1);}
}
