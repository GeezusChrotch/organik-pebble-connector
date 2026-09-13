import {chatContent} from './chat-content';
import {attachmentLabel,messageAttachments,wrap,type Chat,type Message,type Settings} from './model';
import {serviceIcon,type Icon} from './icons';
export const messageKey=(m:Message)=>(m.sourceChatID||'')+'\0'+m.id;
export function threadContent(chat:Chat,messages:Message[],settings:Settings,older=false){
 const lineDividers:boolean[]=[];const lines:string[]=[],lineIcons:(Icon|undefined)[]=[],lineKeys:string[]=[],lineMessages:(Message|undefined)[]=[];
 const add=(text:string,key:string,icon?:Icon,message?:Message)=>{lineDividers.push(false);lines.push(text);lineKeys.push(key);lineIcons.push(icon);lineMessages.push(message);};
 if(older)add('↑ Scroll up for older messages','older');
 for(const [messageIndex,m] of messages.entries()){const firstLine=lines.length;const key=messageKey(m),network=chat.merge?.members.find(member=>member.id===(m.sourceChatID||chat.merge?.defaultChatID))?.network||chat.network;
  const content=chatContent(m,{...settings,lineWidth:Math.min(440,settings.lineWidth)});
  // Normal text shares its first line with sender/time and the service icon.
  // Keep a separate service marker only when a bitmap emoji already owns that slot.
  if(content.lineIcons?.[0])add(' ',key+':service',serviceIcon(network),m);
  content.lines.forEach((line,i)=>add(line,key+':body:'+i,content.lineIcons?.[i]||(i===0?serviceIcon(network):undefined),m));
  if(settings.images)messageAttachments(m).forEach((a,i)=>add('Tap: '+attachmentLabel(a)+(messageAttachments(m).length>1?' '+(i+1):''),key+':media:'+i,undefined,m));
  if(messageIndex>0)lineDividers[firstLine]=true;
 }
 if(!lines.length)add('No messages in this conversation','empty');
 return {lines,lineIcons,lineKeys,lineMessages,lineDividers};
}
export function bottomOffset(lines:string[]){return Math.max(0,lines.length-6);}

interface ThreadLayout {lines?:string[];lineMessages?:(Message|undefined)[]}
function spans(thread:ThreadLayout){const result:{start:number;end:number;key:string}[]=[];for(let i=0;i<(thread.lines?.length||0);i++){const m=thread.lineMessages?.[i],key=m?messageKey(m):'line:'+i,last=result.at(-1);if(last?.key===key)last.end=i+1;else result.push({start:i,end:i+1,key});}return result;}
export function threadAnchor(thread:ThreadLayout,offset:number){const groups=spans(thread),group=groups.find(g=>offset>=g.start&&offset<g.end)||groups.at(-1);return group?Math.max(group.start,Math.min(offset,group.end-6)):0;}
// Fill the remaining room only with whole messages. A long message uses its
// own viewport until its final lines, with following messages admitted whole.
export function threadWindow(thread:ThreadLayout,offset:number){const groups=spans(thread),start=threadAnchor(thread,offset),at=groups.findIndex(g=>start>=g.start&&start<g.end);if(at<0)return {start:0,end:0};let end=Math.min(groups[at].end,start+6);if(end===groups[at].end)for(let i=at+1;i<groups.length&&groups[i].end-start<=6;i++)end=groups[i].end;return {start,end};}
export function threadBottom(thread:ThreadLayout){const groups=spans(thread),last=groups.at(-1);if(!last)return 0;if(last.end-last.start>6)return last.end-6;let start=last.start;for(let i=groups.length-2;i>=0&&last.end-groups[i].start<=6;i--)start=groups[i].start;return start;}
export function threadStep(thread:ThreadLayout,offset:number,direction:number){const groups=spans(thread),start=threadAnchor(thread,offset),at=groups.findIndex(g=>start>=g.start&&start<g.end);if(at<0)return 0;const group=groups[at];if(direction<0){if(start>group.start)return start-1;const previous=groups[at-1];return previous?Math.max(previous.start,previous.end-6):start;}if(start<group.end-6)return start+1;return groups[at+1]?.start??start;}
