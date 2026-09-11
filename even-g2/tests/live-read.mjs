// Read-only local verification. No HomeKit writes or camera capture requests.
import {readFile} from 'node:fs/promises';import {homedir} from 'node:os';import {randomBytes} from 'node:crypto';import {createBridge} from '../server.mjs';
const candidates=[homedir()+'/Library/Group Containers/group.org.organikapps.pebbleconnector/cache-connection.json',homedir()+'/Library/Containers/com.organikapps.pome.camera-probe/Data/Documents/cache-connection.json'];let config;
for(const path of candidates){try{config=JSON.parse(await readFile(path,'utf8'));if(config.token)break;}catch{}}
if(!config?.token)throw new Error('No local HomeKit connection found');
const token=randomBytes(32).toString('hex');const server=createBridge({clientToken:token,homeToken:config.token});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{const root='http://127.0.0.1:'+server.address().port;const headers={Authorization:'Bearer '+token};const result={};
 for(const route of ['/health','/home/list/rooms','/home/list/devices','/home/list/scenes','/cameras']){const r=await fetch(root+route,{headers});const data=await r.json();if(!r.ok)throw new Error('Read verification failed: '+r.status);result[route]=Array.isArray(data)?{count:data.length}:route==='/health'?{home:data.home,dictation:data.dictation}:{count:data.cameras?.length};}
 console.log(JSON.stringify(result));
}finally{server.closeAllConnections();server.close();}
