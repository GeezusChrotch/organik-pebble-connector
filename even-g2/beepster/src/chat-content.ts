import {emojiSegments} from './emoji';
import {messageAttachments,reactionText,wrap,type Message,type Settings} from './model';
import type {Icon} from './icons';
// Emoji occupy their own readable rows, retaining message order and actual sprites.
// The same fixed two image strips used by menus keep us inside G2's four-image limit.
export function chatContent(m:Message,s:Settings):{lines:string[];lineIcons:(Icon|undefined)[]|undefined}{
 const header=[s.showSender?(m.isSelf?'Me':m.sender):'',s.showTime?m.time:''].filter(Boolean).join(' · ');
 const body=emojiSegments((header?header+' · ':'')+(m.text||(messageAttachments(m).length?'Attachment':'(No text)')));
 const reactions=(m.reactions||[]).map(r=>{const emoji=r.text||r.emoji||'Reaction',parts=emojiSegments(emoji),icon=parts.find(p=>p.icon)?.icon,label=icon?parts.map(p=>p.text).join(''):reactionText(emoji);return [{text:(r.sender?r.sender+': ':'')+label+(r.count&&r.count>1?' ×'+r.count:''),icon}];});
 const segments=[body,...reactions],rich=segments.some(p=>p.some(s=>s.icon)),width=Math.min(s.lineWidth,rich?440:520),lines:string[]=[],icons:(Icon|undefined)[]=[];
 for(const paragraph of segments){for(const segment of paragraph){if(!segment.text.trim())continue;const rows=wrap(segment.text.trim(),width);for(const [i,text] of rows.entries()){lines.push(text);icons.push(i===0?segment.icon:undefined);}}}
 return {lines:lines.length?lines:['(No text)'],lineIcons:rich?icons:undefined};
}
