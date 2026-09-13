import {serviceID,serviceOptions} from './services';
import {getTextWidth} from '@evenrealities/pretext';
export type Shortcut='dictate'|'replies'|'refresh'|'open_chat'|'jump_newest'|'main_top'|'none';
export const shortcutOptions:[Shortcut,string][]=[['dictate','Dictate reply'],['replies','Quick reply'],['refresh','Refresh'],['open_chat','Open selected chat'],['jump_newest','Jump to newest'],['main_top','Top of conversation list'],['none','No action']];
export const emojiDefaults=['😂','❤️','😍','🤣','😊','🙏','💕','😭','😘','👍','😅','👏','😁','🔥','💔'];
export interface PinnedChat {id:string;name:string}
export interface Settings {pinnedChats:PinnedChat[];url:string;token:string;quickReplies:string[];emojiReplies:string[];inboxes:string[];services:string[];refresh:number;hideLinks:boolean;showSender:boolean;showTime:boolean;markRead:boolean;images:boolean;gifFrames:boolean;contrast:'natural'|'high-contrast'|'original';longPress:Shortcut;threadShortcut:Shortcut;chatFavorite:Shortcut;threadFavorite:Shortcut;language:string;lineWidth:number}
export const defaults:Settings={pinnedChats:[],url:'',token:'',quickReplies:['Yes','No','On my way','Thanks! 👍'],emojiReplies:emojiDefaults,inboxes:['primary'],services:[],refresh:15,hideLinks:false,showSender:true,showTime:true,markRead:false,images:true,gifFrames:true,contrast:'natural',longPress:'dictate',threadShortcut:'dictate',chatFavorite:'replies',threadFavorite:'replies',language:'en',lineWidth:520};
export function loadSettings(raw:string):Settings {
 const d=JSON.parse(raw);if(!d||typeof d!=='object'||Array.isArray(d))throw Error('Invalid saved settings');
 const s={...defaults,pinnedChats:[] as PinnedChat[],emojiReplies:[...defaults.emojiReplies],quickReplies:[...defaults.quickReplies],services:[...defaults.services]};for(const key of ['url','token'] as const)if(typeof d[key]==='string')s[key]=d[key];
 for(const key of ['hideLinks','showSender','showTime','markRead','images','gifFrames'] as const)if(typeof d[key]==='boolean')s[key]=d[key];
 for(const key of ['quickReplies','emojiReplies','services'] as const)if(Array.isArray(d[key]))s[key]=d[key].filter((x:unknown)=>typeof x==='string'&&x.trim()).slice(0,key==='services'?50:key==='emojiReplies'?15:8).map((x:string)=>x.slice(0,key==='services'?100:1000));
 s.services=s.services.length?[...new Set(s.services.map(value=>serviceOptions.some(([id])=>id===value)?value:serviceID(value)))]:[];
 while(s.emojiReplies.length<15)s.emojiReplies.push(emojiDefaults[s.emojiReplies.length]);
 if(Array.isArray(d.pinnedChats))s.pinnedChats=[...new Map<string,PinnedChat>(d.pinnedChats.filter((p:unknown):p is PinnedChat=>!!p&&typeof p==='object'&&typeof (p as PinnedChat).id==='string'&&!!(p as PinnedChat).id&&(p as PinnedChat).id.length<=512&&typeof (p as PinnedChat).name==='string').slice(0,50).map((p:PinnedChat)=>[p.id,{id:p.id,name:p.name.slice(0,200)}])).values()];
 s.inboxes=['primary'];
 if([0,5,15,30,60].includes(d.refresh))s.refresh=d.refresh;
 if(['natural','high-contrast','original'].includes(d.contrast))s.contrast=d.contrast;
 for(const key of ['longPress','threadShortcut','chatFavorite','threadFavorite'] as const)if(shortcutOptions.some(([value])=>value===d[key]))s[key]=d[key];
 if(typeof d.language==='string'&&/^[a-z]{2}$/.test(d.language))s.language=d.language;
 if([420,520].includes(d.lineWidth))s.lineWidth=d.lineWidth;
 return s;
}
export function pairing(raw:string):{url:string;token:string}{const d=JSON.parse(raw),u=new URL(d.url);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||typeof d.token!=='string'||!d.token.trim())throw Error('Paste the G2 pairing from Connector. A private HTTPS address and token are required.');return {url:u.origin,token:d.token.trim()};}
export interface Chat {lastActivity?:number;merge?:{chatIDs:string[];defaultChatID:string|null;members:{id:string;network:string}[]};id:string;name:string;network:string;unreadCount:number;preview:string;timestamp:string}
export interface Attachment {id:string;kind:string;title?:string}
export interface Message {attachments?:Attachment[];sourceChatID?:string;timestamp?:string;id:string;sender:string;isSelf?:boolean;text:string;time:string;attachment?:Attachment|null;reactions?:{text?:string;sender?:string;isSelf?:boolean;emoji?:string;count?:number}[]}
export interface PageResult<T>{items:T[];hasMore?:boolean;nextCursor?:string|null;stale?:boolean}
// Pixel-aware wrapping prevents long URLs, Unicode and unbroken words overflowing G2.
export function wrap(text:string,width=520):string[]{const lines:string[]=[];for(const paragraph of text.replace(/\r/g,'').split('\n')){let line='';for(const word of paragraph.split(/\s+/)){const candidate=line?line+' '+word:word;if(getTextWidth(candidate)<=width){line=candidate;continue;}if(line){lines.push(line);line='';}for(const char of word){if(line&&getTextWidth(line+char)>width){lines.push(line);line='';}line+=char;}}lines.push(line);}return lines.length?lines:[''];}
const reactionNames:Record<string,string>={'👍':'Thumbs up','👎':'Thumbs down','❤':'Love','❤️':'Love','😂':'Laugh','🤣':'Laugh','‼':'Emphasis','‼️':'Emphasis','❓':'Question','🎉':'Celebrate'};
export function reactionText(text:string):string{return reactionNames[text]||text;}
export function reactionSummary(m:Message,senders=false):string {return (m.reactions||[]).map(r=>(senders&&r.sender?r.sender+': ':'')+reactionText(r.text||r.emoji||'Reaction')+(r.count&&r.count>1?' ×'+r.count:'')).join(' · ');}
export function messageLines(m:Message,s:Settings):string[]{const reactions=reactionSummary(m,true);return [...(s.showSender||s.showTime?[[s.showSender?m.sender:'',s.showTime?m.time:''].filter(Boolean).join(' · ')]:[]),...(reactions?wrap(reactions,s.lineWidth):[]),...wrap(reactionText(m.text)|| (messageAttachments(m).length?'Attachment':'(No text)'),s.lineWidth)];}

export function messageAttachments(m:Message):Attachment[]{return m.attachments?.length?m.attachments:m.attachment?[m.attachment]:[];}
export function attachmentLabel(a:Attachment):string{return a.kind==='gif'?'GIF':a.kind==='video'?'Video thumbnail':'Photo';}
export function messageLabel(m:Message):string {const media=messageAttachments(m);return (reactionSummary(m)?'['+reactionSummary(m)+'] ':'')+(media.length?'['+(media.length>1?media.length+' attachments':attachmentLabel(media[0]))+'] ':'')+(m.isSelf?'Me':m.sender)+': '+(reactionText(m.text)|| (media.length?'Tap to view':'(No text)'));}
