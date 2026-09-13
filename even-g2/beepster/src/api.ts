import type {Settings,Chat,Message,PageResult} from './model';
export class API {
 constructor(public settings:Settings,public demo=false){}
 async request<T>(path:string,method='GET',body?:unknown):Promise<T>{
  if(this.demo)return this.fixture(path,method,body) as T;
  if(!this.settings.url||!this.settings.token)throw Error('Pair Beepster in the Even phone settings.');
  const audio=body instanceof Uint8Array;
  const r=await fetch(this.settings.url+path,{method,headers:{Authorization:'Bearer '+this.settings.token,...(body?{'Content-Type':audio?'audio/wav':'application/json'}:{})},body:body?(audio?new Blob([body as Uint8Array<ArrayBuffer>]):JSON.stringify(body)):undefined,signal:AbortSignal.timeout(audio?65000:20000),redirect:'error'});
  const data=await r.json();if(!r.ok)throw Error(data.error||'Connector request failed');return data;
 }
 chats(inbox:string,cursor=''){return this.request<PageResult<Chat>>('/beepster/v1/chats?includeMerged=1&limit=50&inbox='+encodeURIComponent(inbox)+'&cursor='+encodeURIComponent(cursor));}
 // Resolve off-page pins against the current primary snapshot; never display stale saved chats.
 async inbox(cursor=''):Promise<PageResult<Chat>> {
  const first=await this.chats('primary',cursor);if(cursor||!this.settings.pinnedChats.length)return first;
  const wanted=new Set(this.settings.pinnedChats.map(p=>p.id)),found=new Map(first.items.map(c=>[c.id,c]));let page=first;const seen=new Set<string>();
  while([...wanted].some(id=>!found.has(id))&&page.hasMore&&page.nextCursor&&!seen.has(page.nextCursor)&&seen.size<100){seen.add(page.nextCursor);page=await this.chats('primary',page.nextCursor);for(const c of page.items)if(wanted.has(c.id))found.set(c.id,c);}
  return {...first,items:[...found.values()],stale:first.stale||page.stale};
 }
 archive(chat:Chat){return this.request('/beepster/v1/chats/archive','POST',{chatIDs:[chat.id]});}
 messages(chat:string,cursor=''){return this.request<PageResult<Message>>('/beepster/v1/chats/'+encodeURIComponent(chat)+'/messages?limit=50&hideLinks='+(this.settings.hideLinks?'1':'0')+'&cursor='+encodeURIComponent(cursor));}
 async conversation(chat:Chat,cursor=''):Promise<PageResult<Message>> {
  if(!chat.merge)return this.messages(chat.id,cursor);
  const state:Record<string,string|null>=cursor?JSON.parse(cursor):Object.fromEntries(chat.merge.chatIDs.map(id=>[id,'']));
  const pages=await Promise.all(chat.merge.chatIDs.filter(id=>state[id]!==null).map(async id=>({id,page:await this.messages(id,state[id]||'')})));
  const items:Message[]=[];let stale=false;
  for(const {id,page} of pages){items.push(...page.items.map(m=>({...m,sourceChatID:id})));state[id]=page.hasMore&&page.nextCursor?page.nextCursor:null;stale ||= !!page.stale;}
  const hasMore=Object.values(state).some(c=>c!==null);
  return {items:mergeMessages(items),hasMore,nextCursor:hasMore?JSON.stringify(state):null,stale};
 }
 replyChatID(chat:Chat):string {
  if(!chat.merge)return chat.id;
  if(!chat.merge.defaultChatID||!chat.merge.chatIDs.includes(chat.merge.defaultChatID))throw Error('Choose a default reply service for this merged conversation in Beeper first.');
  return chat.merge.defaultChatID;
 }
 private archived=new Set<string>();
 private fixture(path:string,method:string,body:unknown):unknown {
  if(path==='/beepster/v1/chats/archive'&&method==='POST'){for(const id of (body as {chatIDs:string[]}).chatIDs)this.archived.add(id);return {archived:true};}
  if(path==='/health')return {beepster:true,dictation:true};
  if(path.startsWith('/speech'))return {text:'Thanks! I will be there in ten minutes.'};
  if(path.includes('/attachments/')){const w=120,h=80,frames=path.includes('animate=1')?4:1,data=new Uint8Array(w*h*frames);for(let f=0;f<frames;f++)for(let y=0;y<h;y++)for(let x=0;x<w;x++)data[(f*h+y)*w+x]=0xc0|((x+f*20)%120>40&&x<90&&y>20&&y<60?63:((Math.floor(x/30)<<4)|Math.floor(y/20)));return {width:w,height:h,frames,kind:'gif',pixels:btoa(String.fromCharCode(...data))};}
  if(path.includes('/messages')&&method==='POST'){const b=body as {text:string};demoMessages.push({id:'demo-'+Date.now(),sender:'Me',text:b.text,time:'Now',isSelf:true});return {state:'pending',pendingMessageID:'demo-sent',chatID:'demo'};}
  if(path.includes('/messages/'))return {status:'SENT'};
  if(path.includes('/messages?'))return {items:structuredClone(demoMessages),hasMore:false};
  if(path.includes('/chats?'))return {items:[{id:'demo',name:'Alex',network:'iMessage',unreadCount:2,preview:'See you soon!',timestamp:'10:42'},{id:'team',name:'Production team',network:'WhatsApp',unreadCount:0,preview:'A new GIF and a video',timestamp:'Yesterday'}].filter(c=>!this.archived.has(c.id)),hasMore:false};
  if(method==='POST')return {ok:true};
  throw Error('Demo route unavailable');
 }
}
const demoMessages:Message[]=[{id:'1',sender:'Alex',text:'Here is a long message to test reading on the glasses. Swipe through each page and double tap to return to the conversation. Sender names and timestamps help keep group chats readable.',time:'10:40'},{id:'2',sender:'Alex',text:'A little celebration',time:'10:41',attachment:{id:'a'.repeat(24),kind:'gif'}},{id:'3',sender:'Alex',text:'YouTube · Behind the scenes',time:'10:42',attachment:{id:'b'.repeat(24),kind:'video',title:'Behind the scenes'}},{id:'4',sender:'Alex',text:'See you soon!',time:'10:43',reactions:[{text:'👍',sender:'Alex',isSelf:false}]}];

export function mergeMessages(items:Message[]):Message[]{
 const unique=new Map(items.map(m=>[(m.sourceChatID||'')+'\0'+m.id,m]));
 return [...unique.values()].sort((a,b)=>(Date.parse(a.timestamp||'')||0)-(Date.parse(b.timestamp||'')||0));
}
export function chatNetworks(chat:Chat):string[]{return chat.merge?[...new Set(chat.merge.members.map(m=>m.network).filter(Boolean))]:[chat.network];}
