import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {installEmoji,emojiReply,replyDisplayText} from '../src/emoji';import {iconBMP,iconSVG,iconPixels} from '../src/icons';import {loadSettings} from '../src/model';
const catalog=JSON.parse(readFileSync(new URL('../public/emoji/catalog.json',import.meta.url),'utf8')).entries;const data=readFileSync(new URL('../public/emoji/g2-pixels.bin',import.meta.url));installEmoji(catalog,data);
test('every catalog emoji has an identifiable nonblank bitmap, including flags and joined emoji',()=>{for(const entry of catalog){const row=emojiReply(entry.emoji);assert.equal(row.label,entry.label);assert.match(row.icon,/^emoji:/);assert.ok(iconPixels(row.icon).flat().some(p=>p>0));assert.ok(iconBMP([row.icon]).subarray(54).some(p=>p>0));assert.match(iconSVG(row.icon),/viewBox="0 0 18 18"/);}});
test('legacy short emoji lists expand to the fifteen slots shown in phone settings',()=>{const settings=loadSettings('{"emojiReplies":["👍","❤️"]}');assert.equal(settings.emojiReplies.length,15);assert.deepEqual(settings.emojiReplies.slice(0,2),['👍','❤️']);});
test('emoji review is readable without relying on G2 Unicode glyph support',()=>{assert.equal(replyDisplayText('👍'),'thumbs up');assert.equal(replyDisplayText('❤️'),'red heart');assert.match(replyDisplayText('Thanks! 👍'),/Thanks! \[thumbs up\]/);});

test('all fifteen configured emoji remain visible across reply pages and send the selected original',async()=>{
 const {Beepster}=await import('../src/controller');const {API}=await import('../src/api');
 const chosen=catalog.filter((e:any)=>['thumbs up','red heart','cat face','flag: Japan','woman technologist'].includes(e.label)).concat(catalog.slice(0,15)).slice(0,15);
 const api=new API({...loadSettings('{}'),quickReplies:[],emojiReplies:chosen.map((e:any)=>e.emoji),refresh:0},true),screens:any[]=[];const display={show:(s:any)=>screens.push(s),exit:async()=>{},record:async()=>{}} as any;const app=new Beepster(api,display);await app.start();await app.openChat({id:'demo',name:'Alex',network:'iMessage',timestamp:'',preview:'',unreadCount:0});app.replies();
 assert.equal(app.page?.rows.length,15);for(let i=0;i<15;i++){const s=screens.at(-1),offset=i%6;assert.equal(s.icons[offset],`emoji:${chosen[i].id}`);assert.match(s.lines[offset],new RegExp(chosen[i].label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));if(i<14)await app.input(2);}
 let payload='';const original=api.request.bind(api);api.request=async(path,method='GET',body?:any)=>{if(method==='POST')payload=body.text;return original(path,method,body);};await app.input(0);assert.equal(payload,'');await app.input(0);assert.equal(payload,'');await app.input(0);assert.equal(payload,chosen[14].emoji);app.dispose();
});

test('chat bodies and reactions show bitmap emoji without splitting joined characters',async()=>{
 const {chatContent}=await import('../src/chat-content');const {emojiSegments}=await import('../src/emoji');
 const chosen=['👍🏽','👩‍💻','🇯🇵','❤️'];for(const value of chosen){const parts=emojiSegments('Before '+value+' after');assert.equal(parts.filter(p=>p.icon).length,1);assert.equal(parts[0].text,'Before ');assert.equal(parts.at(-1)?.text,' after');}
 const result=chatContent({id:'emoji',sender:'Alex',time:'Now',text:'Hello 👩‍💻 🇯🇵 ❤️',reactions:[{sender:'Sam',text:'👍🏽'}]},loadSettings('{}'));
 assert.equal(result.lineIcons?.filter(Boolean).length,4);assert.ok(result.lines.some((l:string)=>l.endsWith('Hello')));assert.ok(result.lines.some(s=>s.includes('woman technologist')));assert.ok(result.lines.some(s=>s.includes('flag: Japan')));
});
