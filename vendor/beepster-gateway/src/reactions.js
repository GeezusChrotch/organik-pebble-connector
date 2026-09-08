import {tokenizeEmojiForWatch} from './emoji-assets.js';

const aliases = {like:'👍',liked:'👍',thumbsup:'👍','+1':'👍',love:'❤️',loved:'❤️',heart:'❤️',
  dislike:'👎',disliked:'👎',thumbsdown:'👎','-1':'👎',laugh:'😂',laughed:'😂',haha:'😂',
  emphasize:'‼️',emphasized:'‼️',question:'❓',questioned:'❓'};
export function messageReactions(message, resolveParticipant) {
  const groups = new Map();
  for (const reaction of Array.isArray(message.reactions) ? message.reactions : []) {
    if (!reaction?.participantID || !reaction.reactionKey) continue;
    const key=String(reaction.reactionKey), normalized=key.toLowerCase().replace(/^:|:$/g,'');
    const text=aliases[normalized] || key;
    const watch=tokenizeEmojiForWatch(text);
    const participantID=String(reaction.participantID);
    if (!groups.has(participantID)) groups.set(participantID,{...resolveParticipant(participantID),emojis:[],seen:new Set()});
    const group=groups.get(participantID);
    if(group.seen.has(key))continue;
    group.seen.add(key);
    group.emojis.push({text,watchText:watch.text,emojiKeys:watch.keys});
  }
  return [...groups.values()].map(({seen,emojis,...person})=>({
    ...person,text:emojis.map(x=>x.text).join(' '),watchText:emojis.map(x=>x.watchText).join(' '),
    emojiKeys:[...new Set(emojis.flatMap(x=>x.emojiKeys))]
  }));
}
