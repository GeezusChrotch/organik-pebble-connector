// @ts-nocheck
// Generated from shared/pome-speech.js; see scripts/sync-pome-speech.py.
// Shared, dependency-free ES5 speech helpers. Synced into both Pome clients.
function speechNormalize(value) {
 return String(value || '').toLowerCase().replace(/[\u2018\u2019']/g,'').replace(/[^a-z0-9%]+/g,' ').replace(/\s+/g,' ').trim();
}
function speechClean(value) {
 return speechNormalize(value).replace(/^(?:(?:hey )?pome |please |(?:can|could|would|will) you (?:please )?|id like (?:you )?to |i want (?:you )?to )+/,'').replace(/(?: please| thank you| thanks)+$/,'')
  .replace(/\b(?:switch|power) (on|off)\b/g,'turn $1').replace(/\bshut (?:off|down)\b/g,'turn off')
  .replace(/\b(?:halfway|half way|half brightness|half speed|half power)\b/g,'50 percent')
  .replace(/\b(?:full brightness|full speed|maximum brightness|maximum speed)\b/g,'100 percent')
  .replace(/\bper cent\b/g,'percent');
}
function speechWithoutNames(text,names) {
 var result=' '+text+' ';
 names.map(speechNormalize).sort(function(a,b){return b.length-a.length;}).forEach(function(name){if(name)result=result.split(' '+name+' ').join(' ');});
 return result.trim();
}
function speechNumber(text) {
 var units=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
 var tens=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
 var names=[['three quarters',75],['a quarter',25],['quarter',25],['half',50],['full',100],['maximum',100],['one hundred',100],['a hundred',100],['hundred',100]];
 for(var n=0;n<100;n++)names.push([n<20?units[n]:tens[Math.floor(n/10)]+(n%10?' '+units[n%10]:''),n]);
 var t=' '+text+' ';names.sort(function(a,b){return b[0].length-a[0].length;}).forEach(function(pair){t=t.split(' '+pair[0]+' ').join(' '+pair[1]+' ');});
 var matches=t.match(/\b\d+\b/g)||[];
 if(!matches.length)return null;
 if(matches.length!==1)return NaN;
 var value=Number(matches[0]);return value<=100?value:NaN;
}
function speechGuard(text,raw) {
 if(/\b(dont|do not|never|not|except|excluding|unless|without|but|instead|cancel)\b/.test(text))return 'Please say just the action you want, without exclusions or corrections.';
 if(/\b(tomorrow|tonight|later|after|before|until|minutes?|seconds?|hours?|when|if)\b/.test(text)||/\b(?:am|pm)\b/.test(text))return 'Timed or conditional commands are not supported yet. Say an action for now.';
 if(/\b(and|then|also|or)\b/.test(text))return 'Please give one action at a time.';
 if(/\b(brighter|dimmer|increase|decrease|more|less)\b/.test(text))return 'Please give an absolute level, such as 40 percent.';
 if(/\b(minus|negative|point)\b/.test(text)||/(?:^|\s)-\d|\d\.\d/.test(raw))return 'Use a whole percentage from 0 to 100.';
 return '';
}
function speechSceneNames(text) {
 var base=text.replace(/^(?:set|run|activate|start|enable)(?: the)? /,'');
 return [base,base.replace(/^scene /,'').replace(/ scene$/,''),base.replace(/ on$/,'')];
}

export {speechNormalize,speechClean,speechWithoutNames,speechNumber,speechGuard,speechSceneNames};
