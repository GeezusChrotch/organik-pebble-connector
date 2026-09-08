import test from 'node:test';
import assert from 'node:assert/strict';
import {BeeperClient} from '../src/beeper-client.js';
test('reaction names resolve without a preceding conversation-list request',async()=>{
 const client=new BeeperClient({baseURL:'http://localhost:23373',accessToken:'test'});
 client.loadAccountContactPage=async()=>[];client.searchAccountContacts=async()=>[];
 client.request=async path=>path.includes('/messages?')?{items:[{id:'parent',text:'Hello',isSender:true,senderID:'self',reactions:[
   {participantID:'a',reactionKey:'like'},{participantID:'self',reactionKey:'heart'}
 ]}]}:{type:'single',title:'Avery',accountID:'account',participants:{items:[{id:'a',fullName:'Avery'}]}};
 const result=await client.listMessages('chat',60);
 assert.deepEqual(result.items[0].reactions.map(x=>[x.sender,x.isSelf]),[['Avery',false],['Me',true]]);
});
test('hidden linked tapback notices are replaced by parent reactions, not guessed from visible text',async()=>{
 const client=new BeeperClient({baseURL:'http://localhost:23373',accessToken:'test'});
 client.hydrateChatContext=async()=>{};
 client.chatContexts.set('chat',{type:'single',name:'Avery',participants:[{id:'self',isSelf:true},{id:'a',fullName:'Avery'}]});
 client.request=async()=>({items:[
  {id:'ordinary',text:'I liked this!',senderID:'a'},
  {id:'notice',text:'{{sender}} liked &quot;Hello&quot;',isHidden:true,linkedMessageID:'parent',senderID:'a'},
  {id:'parent',text:'Hello',isSender:true,reactions:[{id:'r',participantID:'a',reactionKey:'like'},{id:'r2',participantID:'self',reactionKey:'heart'}]}
 ],hasMore:false});
 const result=await client.listMessages('chat',60);
 assert.deepEqual(result.items.map(x=>x.id),['parent','ordinary']);
 assert.equal(result.items[0].reactions[0].sender,'Avery');
 assert.equal(result.items[0].reactions[0].text,'👍');
 assert.equal(result.items[0].reactions[1].sender,'Me');
 assert.equal(result.items[1].text,'I liked this!');
});
