import test from 'node:test';
import assert from 'node:assert/strict';
import {messageReactions} from '../src/reactions.js';
test('reactions group by participant and preserve distinct bitmap emojis',()=>{
 const result=messageReactions({reactions:[
  {participantID:'a',reactionKey:'👍'}, {participantID:'a',reactionKey:'❤️'},
  {participantID:'a',reactionKey:'👍'}, {participantID:'b',reactionKey:'liked'}
 ]},id=>({sender:id==='a'?'Avery':'Me',isSelf:id==='b'}));
 assert.equal(result.length,2);assert.equal(result[0].text,'👍 ❤️');
 assert.equal(result[0].emojiKeys.length,2);assert.equal(result[1].text,'👍');
 assert.equal(result[1].isSelf,true);
});
test('removed reactions disappear and custom reaction labels are not guessed',()=>{
 assert.deepEqual(messageReactions({},()=>({})),[]);
 const result=messageReactions({reactions:[{participantID:'a',reactionKey:'custom-sticker'}]},()=>({sender:'Avery'}));
 assert.equal(result[0].text,'custom-sticker');assert.deepEqual(result[0].emojiKeys,[]);
});
