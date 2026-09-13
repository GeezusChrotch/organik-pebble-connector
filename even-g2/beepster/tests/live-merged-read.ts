// Explicit, read-only local diagnostic. Never sends messages or marks them read.
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {API,chatNetworks,mergeMessages} from '../src/api';
import {defaults} from '../src/model';
const name=process.argv[2];if(!name)throw Error('Provide an exact conversation name');
const token=execFileSync('/usr/bin/security',['find-generic-password','-s','org.organikapps.even','-a','client','-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const api=new API({...defaults,url:'http://127.0.0.1:7858',token});
const page=await api.chats('primary');const chat=page.items.find(c=>c.name===name);assert.ok(chat?.merge,'Merged conversation must be present in first inbox page');
const first=await api.conversation(chat);assert.ok(first.items.length);const second=first.nextCursor?await api.conversation(chat,first.nextCursor):{items:[]};
const apple=new Set(chat.merge.members.filter(m=>/imessage/i.test(m.network)).map(m=>m.id));
assert.ok(first.items.some(m=>apple.has(m.sourceChatID!)));assert.ok(apple.has(api.replyChatID(chat)));
const history=mergeMessages([...first.items,...second.items]);
const evidence={installedBuild:'62',g2Version:'0.1.1',networks:chatNetworks(chat),members:chat.merge.chatIDs.length,firstPageMessages:first.items.length,firstPageIMessageCount:first.items.filter(m=>apple.has(m.sourceChatID!)).length,olderPageMessages:second.items.length,combinedMessages:history.length,replyDefault:'iMessage',writes:0};
console.log(JSON.stringify(evidence,null,2));writeFileSync('build/beepster-g2-62/merged-validation.json',JSON.stringify(evidence,null,2)+'\n');
