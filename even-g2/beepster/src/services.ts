// Service identifiers and choices shared with the Pebble app.
export const serviceOptions:[string,string][]=[['apple_messages','Apple Messages'],['beeper','Beeper / Matrix'],['discord','Discord'],['google_chat','Google Chat'],['google_messages','Google Messages'],['google_voice','Google Voice'],['instagram','Instagram'],['line','LINE'],['linkedin','LinkedIn'],['messenger','Messenger'],['signal','Signal'],['slack','Slack'],['telegram','Telegram'],['x','X / Twitter'],['whatsapp','WhatsApp'],['other','Other services']];
export function serviceID(network:string):string {
  var value = String(network || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (/imessage|apple messages/.test(value)) return 'apple_messages';
  if (/beeper|matrix/.test(value)) return 'beeper';
  if (/discord/.test(value)) return 'discord';
  if (/google chat|hangouts/.test(value)) return 'google_chat';
  if (/google messages|android messages|\brcs\b/.test(value)) return 'google_messages';
  if (/google voice/.test(value)) return 'google_voice';
  if (/instagram/.test(value)) return 'instagram';
  if (/linkedin/.test(value)) return 'linkedin';
  if (/facebook|messenger/.test(value)) return 'messenger';
  if (/signal/.test(value)) return 'signal';
  if (/slack/.test(value)) return 'slack';
  if (/telegram/.test(value)) return 'telegram';
  if (/twitter|^x$|x twitter/.test(value)) return 'x';
  if (/whatsapp/.test(value)) return 'whatsapp';
  if (/^line$|line messenger/.test(value)) return 'line';
  return 'other';
}
