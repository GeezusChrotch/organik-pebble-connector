import {threadContent,bottomOffset,messageKey,threadWindow,threadBottom,threadStep,threadAnchor} from './thread-content';
import {chatContent} from './chat-content';
import {emojiReply,replyDisplayText} from './emoji';
import {serviceID} from './services';
import {serviceIcon,type Icon} from './icons';
import {API,mergeMessages,chatNetworks} from './api';
import {Display,type Screen,type MenuAction,type FavoriteTarget} from './display';
import {messageAttachments,attachmentLabel,messageLabel,type Attachment,messageLines,wrap,type Chat,type Message,type Settings,type Shortcut} from './model';
import {mediaFrames,type Preview} from './media';
import {pcmToWav} from './audio';
type Row={key?:string;icon?:Icon;label:string;run:()=>void|Promise<void>};
type Page={title:string;rows:Row[];index:number;kind:string;chat?:Chat;message?:Message;messages?:Message[];chats?:Chat[];lines?:string[];lineIcons?:(Icon|undefined)[];lineDividers?:boolean[];lineKeys?:string[];lineMessages?:(Message|undefined)[];offset?:number;frames?:Uint8Array[];frame?:number;cursor?:string|null;stale?:boolean;paged?:boolean};
export class Beepster {
 pages:Page[]=[];busy=false;recording=false;notice='';services=new Set<string>();
 private chunks:Uint8Array[]=[];private audioBytes=0;private recordingTimer?:ReturnType<typeof setTimeout>;private returnPages?:Page[];private epoch=0;private active=true;private refreshTimer?:ReturnType<typeof setTimeout>;private inbox='primary';private draft?:{chat:Chat;text:string;requestID:string;attempted:boolean};
 saveSettings:(s:Settings)=>Promise<void>=async()=>{throw Error('Settings are still loading');};
 onChange:()=>void=()=>{};
 constructor(public api:API,public display:Display){
  display.onInput=t=>void this.input(t);display.onMenuAction=(action,target)=>void this.systemAction(action,target??null);display.onError=m=>{this.notice=m;this.onChange();};
  display.onAudio=pcm=>{if(this.recording){this.audioBytes+=pcm.length;if(this.audioBytes<=32000*120)this.chunks.push(pcm);else void this.finishRecording();}};
 }
 get page(){return this.pages.at(-1);}
 get chat(){return [...this.pages].reverse().find(p=>p.chat)?.chat;}
 render(){const p=this.page;if(!p)return;const target=this.selectedChat();let s:Screen={favorite:target?{key:target.id,pinned:this.api.settings.pinnedChats.some(c=>c.id===target.id)}:undefined,title:p.title,titleIcon:p.chat?serviceIcon(this.messageNetwork(p.chat,p.message)):'message',lines:[],footer:this.notice};
  if(p.frames)s.image=p.frames[p.frame||0];
  else if(p.lines){const {start:offset,end}=p.kind==='chat'?threadWindow(p,p.offset||0):{start:p.offset||0,end:(p.offset||0)+6};s.lines=p.lines.slice(offset,end);s.icons=p.lineIcons?.slice(offset,end);s.dividers=p.lineDividers?.slice(offset,end);}
  else {const start=Math.floor(p.index/6)*6;s.lines=p.rows.slice(start,start+6).map((r,i)=>(p.index===start+i?'> ':'  ')+wrap(r.label,440)[0]);s.icons=p.rows.slice(start,start+6).map(r=>r.icon||'message');}
  s.footer='';this.display.show(s);this.onChange();
 }
 private push(p:Omit<Page,'index'>){this.pages.push({...p,index:0});this.notice='';this.render();}
 private async work(fn:()=>Promise<void>,label='Loading…'){if(this.busy)return;this.busy=true;const epoch=this.epoch;this.notice=label;this.render();try{await fn();if(epoch===this.epoch&&this.notice===label)this.notice='';}catch(e){if(epoch===this.epoch)this.notice=e instanceof Error?e.message:'Request failed';}finally{this.busy=false;this.render();}}
 async start(){await this.home();this.scheduleRefresh();}
 async home(){this.epoch++;this.pages=[];this.push({title:'Beepster',kind:'inbox',rows:[]});if(!this.api.demo&&!this.api.settings.url){this.notice='Connect on the phone to load conversations';this.render();return;}await this.openInbox('primary');}
 private orderedChats(chats:Chat[]){const pins=this.api.settings.pinnedChats.map(p=>p.id);return chats.slice().sort((a,b)=>{const ai=pins.indexOf(a.id),bi=pins.indexOf(b.id);return (ai<0?Infinity:ai)-(bi<0?Infinity:bi)||0;});}
 private inboxRows(chats:Chat[],cursor?:string|null):Row[]{const chosen=this.api.settings.services,pinned=new Set(this.api.settings.pinnedChats.map(p=>p.id));return [...this.orderedChats(chats).filter(c=>!chosen.length||chatNetworks(c).some(n=>chosen.includes(serviceID(n)))).map(chat=>({key:chat.id,icon:serviceIcon(this.messageNetwork(chat)),label:(pinned.has(chat.id)?'* ':'')+(chat.unreadCount?'● ':'')+chat.name,run:()=>this.openChat(chat)})),...(cursor?[{key:'more',label:'More conversations…',run:()=>this.openInbox('primary',true)}]:[]),...(!chats.length?[{key:'empty',label:'No conversations',run:()=>{}}]:[])];}

 private messageNetwork(chat:Chat,m?:Message){return chat.merge?.members.find(member=>member.id===(m?.sourceChatID||chat.merge?.defaultChatID))?.network||chat.network;}
 private conversationRows(chat:Chat,messages:Message[],cursor?:string|null):Row[]{return [...messages.map(m=>({key:(m.sourceChatID||'')+'\0'+m.id,icon:serviceIcon(this.messageNetwork(chat,m)),label:replyDisplayText(messageLabel(m)),run:()=>this.openMessage(chat,m)})),...(!messages.length?[{key:'empty',label:'No messages in this conversation',run:()=>{}}]:[]),...(cursor?[{key:'older',label:'Older messages…',run:()=>this.openChat(chat,true)}]:[])];}
 async openInbox(inbox='primary',more=false){await this.work(async()=>{
  const old=this.page,epoch=this.epoch;const result=await this.api.inbox(more?old?.cursor||'':'');if(epoch!==this.epoch||this.page!==old)return;
  this.inbox='primary';for(const c of result.items)for(const n of chatNetworks(c))this.services.add(n);
  const chats=more?[...new Map([...(old?.chats||[]),...result.items].map(c=>[c.id,c])).values()]:result.items;
  const cursor=result.hasMore?result.nextCursor:null,rows=this.inboxRows(chats,cursor);
  if(more&&old?.kind==='inbox'){
   const previousKeys=new Set(old.rows.map(r=>r.key));
   const firstNew=rows.findIndex(r=>r.key!=='more'&&r.key!=='empty'&&!previousKeys.has(r.key));
   // Keep the same inbox and land at the newly loaded conversations, not row zero.
   Object.assign(old,{rows,chats,cursor,stale:result.stale,paged:true,index:firstNew>=0?firstNew:Math.min(old.index,Math.max(0,rows.length-1))});
   this.render();
  }else{if(old?.kind==='inbox')this.pages.pop();this.push({title:'Beepster',kind:'inbox',rows,chats,cursor,stale:result.stale,paged:more});}
 });}

 async openChat(chat:Chat,more=false,quiet=false){await this.work(async()=>{const old=this.page,epoch=this.epoch,anchor=old?.lineKeys?.[(old.offset||0)+(more&&old.lineKeys?.[old.offset||0]==='older'?1:0)];const result=await this.api.conversation(chat,more?old?.cursor||'':'');if(epoch!==this.epoch)return;
   const messages=mergeMessages(more?[...(old?.messages||[]),...result.items]:result.items),cursor=result.hasMore?result.nextCursor:null,content=threadContent(chat,messages,this.api.settings,!!cursor);
   let offset=threadBottom(content);if((more||quiet)&&anchor){const at=content.lineKeys.indexOf(anchor);offset=threadAnchor(content,at<0?old?.offset||0:at);if(more)offset=threadStep(content,offset,-1);}
   if(old?.kind==='chat')this.pages.pop();this.push({title:chat.name,kind:'chat',chat,rows:this.conversationRows(chat,messages,cursor),messages,cursor,stale:result.stale,paged:more,...content,offset});this.readVisible();
  },quiet?'Refreshing…':'Loading conversation…');}
 private visibleMedia(p:Page){return [...new Map((p.lineMessages?.slice(threadWindow(p,p.offset||0).start,threadWindow(p,p.offset||0).end)||[]).filter((m):m is Message=>!!m&&messageAttachments(m).length>0).map(m=>[messageKey(m),m])).values()];}
 private async threadMedia(p:Page){const media=this.visibleMedia(p).flatMap(m=>messageAttachments(m).map(a=>({m,a})));if(!this.api.settings.images||!media.length)return;if(media.length===1){await this.attachment(media[0].m,media[0].a);return;}this.push({title:'Visible attachments',kind:'options',chat:p.chat,rows:media.map(({m,a},i)=>({label:(i+1)+'. '+attachmentLabel(a)+' · '+m.sender,run:()=>this.attachment(m,a)}))});}
 private readReceipts=new Set<string>();
 private readVisible(){const p=this.page;if(p?.kind!=='chat'||!p.chat||!this.api.settings.markRead)return;for(const m of p.lineMessages?.slice(threadWindow(p,p.offset||0).start,threadWindow(p,p.offset||0).end)||[]){if(!m||m.isSelf)continue;const source=m.sourceChatID||p.chat.id,key=source+'\0'+m.id;if(this.readReceipts.has(key))continue;this.readReceipts.add(key);void this.api.request('/beepster/v1/chats/'+encodeURIComponent(source)+'/read','POST',{messageID:m.id}).catch(()=>{this.readReceipts.delete(key);});}}
 async openMessage(chat:Chat,m:Message){this.readMessage(chat,m);if(!this.api.settings.images)return;const media=messageAttachments(m);if(media.length===1)await this.attachment(m,media[0]);else if(media.length>1)this.messageOptions();}
 private readMessage(chat:Chat,m:Message){this.push({title:chat.name,kind:'message',chat,message:m,rows:[],...chatContent(m,this.api.settings),offset:0});if(this.api.settings.markRead)void this.api.request('/beepster/v1/chats/'+encodeURIComponent(m.sourceChatID||chat.id)+'/read','POST',{messageID:m.id}).catch(()=>{this.notice='Read receipt not confirmed';this.render();});}
 private messageOptions(){const p=this.page;if(!p?.message||!p.chat)return;const m=p.message,chat=p.chat;this.push({title:'Message options',kind:'options',chat,rows:[...(this.api.settings.images?messageAttachments(m).map((a,i)=>({label:'View '+attachmentLabel(a)+(messageAttachments(m).length>1?' '+(i+1):''),run:()=>this.attachment(m,a)})):[]),{label:'Back to message',run:()=>this.back()}]});}
 async attachment(m:Message,a:Attachment|undefined=messageAttachments(m)[0]){if(!a)return;await this.work(async()=>{const epoch=this.epoch,p=await this.api.request<Preview>('/beepster/v1/attachments/'+encodeURIComponent(a.id)+'/preview?format=json&animate='+(this.api.settings.gifFrames?'1':'0')+'&imageMode='+this.api.settings.contrast);if(epoch!==this.epoch)return;const frames=mediaFrames(p,this.api.settings.contrast==='high-contrast');this.push({title:a.title|| (p.kind==='gif'?'GIF flipbook':p.kind==='video'?'Video thumbnail':'Image'),kind:'media',rows:[],frames,frame:0});});}
 replies(){const chat=this.chat;if(!chat||this.busy||this.recording){this.notice='Open a conversation first';this.render();return;}this.push({title:'Quick replies',kind:'replies',chat,rows:[...this.api.settings.quickReplies.map(text=>({label:replyDisplayText(text),run:()=>this.review(chat,text)})),...this.api.settings.emojiReplies.map(text=>({...emojiReply(text),run:()=>this.review(chat,text)}))]});}
 review(chat:Chat,text:string,fromTranscription=false){if((this.busy&&!fromTranscription)||this.recording)return;text=text.trim();if(!text||text.length>1000){this.notice='Reply must be 1–1000 characters. Edit it on the phone.';this.render();return;}this.draft={chat,text,requestID:crypto.randomUUID(),attempted:false};this.push({title:'Reply to '+chat.name,kind:'draft',chat,rows:[],lines:wrap(replyDisplayText(text),this.api.settings.lineWidth),offset:0});}
 private draftActions(){const d=this.draft;if(!d)return;const network=d.chat.merge?.members.find(m=>m.id===d.chat.merge?.defaultChatID)?.network;this.push({title:'Send to '+d.chat.name+(network?' via '+network:'')+'?',kind:'send',chat:d.chat,rows:[{label:d.attempted?'Check Beeper before retrying':'Send reply',run:()=>d.attempted?undefined:this.send()},{label:'Review text',run:()=>this.back()},{label:'Discard reply',run:()=>{this.draft=undefined;this.back();this.back();}}]});}
 async send(){const d=this.draft;if(!d||d.attempted)return;await this.work(async()=>{const target=this.api.replyChatID(d.chat);d.attempted=true;const r=await this.api.request<{pendingMessageID?:string;chatID?:string}>('/beepster/v1/chats/'+encodeURIComponent(target)+'/messages','POST',{text:d.text,requestID:d.requestID});this.notice='Accepted by Beeper; delivery pending';if(r.pendingMessageID){try{const status=await this.api.request<{status:string}>('/beepster/v1/chats/'+encodeURIComponent(r.chatID||target)+'/messages/'+encodeURIComponent(r.pendingMessageID));this.notice=status.status==='SENT'?'Sent':status.status==='FAILED'?'Delivery failed · check Beeper':'Accepted · check delivery in Beeper';}catch{this.notice='Accepted · delivery not yet confirmed';}}this.draft=undefined;while(this.page&&['draft','send','replies'].includes(this.page.kind))this.pages.pop();},'Sending…');if(d.attempted&&this.draft)this.notice='Send outcome uncertain. Check Beeper before composing again.';this.render();}
 async beginRecording(){const chat=this.chat;if(!chat){this.notice='Open a conversation before dictating';this.render();return;}if(this.busy||this.recording)return;await this.work(async()=>{const epoch=this.epoch;const h=await this.api.request<{dictation:boolean}>('/health');if(epoch!==this.epoch)return;if(!h.dictation)throw Error('Set up Dictation in Connector → Even G2');this.returnPages=[...this.pages];this.chunks=[];this.audioBytes=0;this.recording=true;this.push({title:'Dictation',kind:'recording',chat,rows:[],lines:['Starting microphone…','Wait for Listening before speaking.','Double tap to cancel.']});try{await this.display.record(true);if(!this.recording){await this.display.record(false).catch(()=>{});return;}if(this.page?.kind==='recording'){this.page.lines=['Listening. Speak your reply.','Tap to finish.','Double tap to cancel.'];this.notice='';this.render();}this.recordingTimer=setTimeout(()=>void this.finishRecording(),120000);}catch(e){await this.cancelRecording();throw e;}},'Opening microphone…');}
 async finishRecording(){if(!this.recording||this.busy)return;this.recording=false;clearTimeout(this.recordingTimer);const chat=this.chat!;await this.work(async()=>{try{await this.display.record(false);if(this.api.demo&&!this.chunks.length)this.chunks=[new Uint8Array(32000)];if(this.audioBytes<3200&&!this.api.demo)throw Error('Recording too short. Try again.');const wav=pcmToWav(this.chunks);this.chunks=[];const epoch=this.epoch;const result=await this.api.request<{text:string}>('/speech?language='+this.api.settings.language,'POST',wav);if(epoch!==this.epoch)return;this.restoreRecording();this.review(chat,result.text,true);}finally{this.chunks=[];this.restoreRecording();}},'Transcribing…');}
 private restoreRecording(){if(this.returnPages){this.pages=this.returnPages;this.returnPages=undefined;}}
 private async cancelRecording(){this.recording=false;clearTimeout(this.recordingTimer);this.chunks=[];this.audioBytes=0;await this.display.record(false).catch(()=>{});this.restoreRecording();this.render();}
 private selectedChat():Chat|undefined {const p=this.page;return p?.kind==='inbox'?p.chats?.find(c=>c.id===p.rows[p.index]?.key):this.chat;}
 async shortcut(favorite=false){await this.systemAction(favorite?'replies':'dictate');}
 async systemAction(action:MenuAction,target?:FavoriteTarget|null){
  if(this.busy||this.recording||this.pages.some(p=>['draft','send'].includes(p.kind)))return;
  if(action==='refresh'){await this.refresh();return;}
  const chat=target===null?undefined:target?this.pages.flatMap(p=>[...(p.chats||[]),...(p.chat?[p.chat]:[])]).find(c=>c.id===target.key):this.selectedChat();
  if(!chat){this.notice='Select a conversation first';this.render();return;}
  if(action==='pin'){
   await this.work(async()=>{const pinned=this.api.settings.pinnedChats.some(p=>p.id===chat.id);if(!pinned&&this.api.settings.pinnedChats.length>=50)throw Error('Unpin a chat before adding another.');const settings={...this.api.settings,pinnedChats:pinned?this.api.settings.pinnedChats.filter(p=>p.id!==chat.id):[...this.api.settings.pinnedChats,{id:chat.id,name:chat.name}]};await this.display.idle?.();await this.saveSettings(settings);Object.assign(this.api.settings,settings);this.reorderInbox(chat.id);this.notice=pinned?'Chat unpinned':'Chat pinned';},'Saving pin…');return;
  }
  if(action==='archive'){
   await this.work(async()=>{await this.api.archive(chat);const pins=this.api.settings.pinnedChats.filter(p=>p.id!==chat.id),inbox=this.pages.find(p=>p.kind==='inbox');if(inbox){inbox.chats=inbox.chats?.filter(c=>c.id!==chat.id);inbox.rows=this.inboxRows(inbox.chats||[],inbox.cursor);inbox.index=Math.max(0,Math.min(inbox.index,inbox.rows.length-1));this.pages=[inbox];}this.epoch++;this.notice='Chat archived';if(pins.length!==this.api.settings.pinnedChats.length){const settings={...this.api.settings,pinnedChats:pins};try{await this.display.idle?.();await this.saveSettings(settings);Object.assign(this.api.settings,settings);}catch{this.notice='Archived · could not save pin removal';}}},'Archiving…');return;
  }
  const inInbox=this.page?.kind==='inbox';if(inInbox){await this.openChat(chat);if(this.page?.kind!=='chat')return;}
  if(action==='replies')this.replies();else await this.beginRecording();
 }
 private reorderInbox(selected?:string){const p=this.pages.find(p=>p.kind==='inbox');if(!p)return;const key=selected||p.rows[p.index]?.key;p.rows=this.inboxRows(p.chats||[],p.cursor);p.index=Math.max(0,p.rows.findIndex(r=>r.key===key));}
 async refresh(){if(this.page?.kind==='inbox')await this.openInbox(this.inbox);else await this.poll();}
 private polling=false;
 async poll(){
  if(this.display.menuOpen||this.polling||this.busy||this.recording||!this.active||this.pages.some(p=>['draft','send','recording','quit'].includes(p.kind)))return;
  this.polling=true;const epoch=this.epoch,chatPage=this.pages.find(p=>p.kind==='chat'&&p.chat),inboxPage=this.pages.find(p=>p.kind==='inbox');
  try {
   if(chatPage?.chat){const result=await this.api.conversation(chatPage.chat);if(epoch!==this.epoch||!this.pages.includes(chatPage)||this.display.menuOpen||this.busy||this.recording)return;
    const anchor=chatPage.lineKeys?.[chatPage.offset||0],atBottom=threadWindow(chatPage,chatPage.offset||0).end===(chatPage.lines?.length||0),previous=chatPage.messages||[],messages=mergeMessages([...previous,...result.items]);const changed=JSON.stringify(messages)!==JSON.stringify(previous);
    chatPage.messages=messages;if(!chatPage.paged)chatPage.cursor=result.hasMore?result.nextCursor:null;chatPage.stale=result.stale;chatPage.rows=this.conversationRows(chatPage.chat,messages,chatPage.cursor);Object.assign(chatPage,threadContent(chatPage.chat,messages,this.api.settings,!!chatPage.cursor));const at=anchor?chatPage.lineKeys!.indexOf(anchor):-1;chatPage.offset=atBottom&&this.page===chatPage?threadBottom(chatPage):threadAnchor(chatPage,at<0?(chatPage.offset||0):at);
    for(const p of this.pages){if(p.kind==='message'&&p.message){const updated=messages.find(m=>m.id===p.message!.id&&m.sourceChatID===p.message!.sourceChatID);if(updated){p.message=updated;Object.assign(p,chatContent(updated,this.api.settings));p.offset=Math.min(p.offset||0,bottomOffset(p.lines!));}}}
    if(changed&&this.page!==chatPage)this.notice='Conversation updated · Back for messages';
   }else if(inboxPage){const result=await this.api.inbox();if(epoch!==this.epoch||this.page!==inboxPage||this.display.menuOpen||this.busy)return;const atTop=inboxPage.index===0,key=inboxPage.rows[inboxPage.index]?.key;for(const c of result.items)for(const n of chatNetworks(c))this.services.add(n);inboxPage.chats=inboxPage.paged?[...new Map([...result.items,...(inboxPage.chats||[]).filter(c=>!result.items.some(n=>n.id===c.id))].map(c=>[c.id,c])).values()]:result.items;if(!inboxPage.paged)inboxPage.cursor=result.hasMore?result.nextCursor:null;inboxPage.rows=this.inboxRows(inboxPage.chats,inboxPage.cursor);const index=inboxPage.rows.findIndex(r=>r.key===key);inboxPage.index=atTop||index<0?0:index;inboxPage.stale=result.stale;}
   this.render();this.readVisible();
  }catch{if(epoch===this.epoch){this.notice='Refresh unavailable · try Refresh';this.render();}}finally{this.polling=false;}
 }
 private scheduleRefresh(){clearTimeout(this.refreshTimer);const seconds=this.api.settings.refresh;if(seconds&&this.active)this.refreshTimer=setTimeout(async()=>{await this.poll();this.scheduleRefresh();},seconds*1000);}
 async applySettings(s:Settings){await this.saveSettings(s);Object.assign(this.api.settings,s);await this.home();this.scheduleRefresh();}
 back(){this.epoch++;this.returnPages=undefined;if(this.page?.kind==='draft')this.draft=undefined;if(this.pages.length>1){this.pages.pop();this.notice='';this.render();if(this.page?.kind==='inbox')void this.poll();}else if(!this.busy)this.push({title:'Quit Beepster?',kind:'quit',rows:[{label:'No, stay',run:()=>this.back()},{label:'Yes, quit',run:()=>this.work(()=>this.display.exit(),'Closing Beepster…')}]});}
 async input(type:number){
  if(type===6||type===7){this.active=false;this.epoch++;clearTimeout(this.refreshTimer);if(this.recording)await this.cancelRecording();else this.restoreRecording();return;}
  if(type===5){this.active=true;await this.poll();this.scheduleRefresh();return;}
  if(type===4||type===9||type===10)return;
  if(this.recording){if(type===3)await this.cancelRecording();else if(type===0)await this.finishRecording();return;}
  if(this.busy){if(type===3)this.back();return;}
  if(type===3){this.back();return;}const p=this.page;if(!p)return;
  if(type===1||type===2){const delta=type===1?-1:1;if(p.kind==='chat'&&delta<0&&(p.offset||0)===0&&p.cursor&&p.chat){await this.openChat(p.chat,true);return;}if(p.frames)p.frame=Math.max(0,Math.min(p.frames.length-1,(p.frame||0)+delta));else if(p.kind==='chat')p.offset=threadStep(p,p.offset||0,delta);else if(p.lines)p.offset=Math.max(0,Math.min(bottomOffset(p.lines),(p.offset||0)+delta));else p.index=Math.max(0,Math.min(p.rows.length-1,p.index+delta));this.notice='';this.render();this.readVisible();return;}
  if(type===0){if(p.kind==='chat')await this.threadMedia(p);else if(p.kind==='message')this.messageOptions();else if(p.kind==='draft')this.draftActions();else if(p.frames){p.frame=((p.frame||0)+1)%p.frames.length;this.render();}else await p.rows[p.index]?.run();}
 }
 dispose(){clearTimeout(this.refreshTimer);clearTimeout(this.recordingTimer);this.active=false;this.epoch++;if(this.recording)void this.cancelRecording();}
}
