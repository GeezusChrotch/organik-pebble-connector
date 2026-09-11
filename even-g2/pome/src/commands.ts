// Match Pebble's native HomeKit group runner: await each acknowledgement,
// pause 75 ms, then continue. Never replay an uncertain write automatically.
export const ROOM_LIGHT_COMMAND_DELAY_MS=75;
export async function runCommands(paths:string[],send:(path:string)=>Promise<unknown>,wait:(ms:number)=>Promise<void>=ms=>new Promise(r=>setTimeout(r,ms))){
 let completed=0;const failed:string[]=[];
 for(let i=0;i<paths.length;i++){
  try{await send(paths[i]);completed++;}catch{failed.push(paths[i]);}
  if(i+1<paths.length)await wait(ROOM_LIGHT_COMMAND_DELAY_MS);
 }
 return {completed,total:paths.length,failed};
}
