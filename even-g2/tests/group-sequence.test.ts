import test from 'node:test';import assert from 'node:assert/strict';
import {runCommands,ROOM_LIGHT_COMMAND_DELAY_MS} from '../pome/src/commands';
import {colorCommand} from '../pome/src/model';
test('room writes await acknowledgement, pause like Pebble, and continue after failures without retries',async()=>{
 const events:string[]=[];let active=0;
 const result=await runCommands(['one','two','bad','four','five'],async p=>{assert.equal(active++,0);events.push(p);await Promise.resolve();active--;if(p==='bad')throw new Error('unsupported');},async ms=>{assert.equal(active,0);assert.equal(ms,75);events.push('wait');});
 assert.equal(ROOM_LIGHT_COMMAND_DELAY_MS,75);assert.deepEqual(events,['one','wait','two','wait','bad','wait','four','wait','five']);assert.deepEqual(result,{completed:4,total:5,failed:['bad']});
});
test('room color skips non-color lights before writing',()=>{
 const d=(id:string,state:any)=>({name:id,serviceId:id,type:'light',room:'Room',state});
 const c=colorCommand('Green',[d('one',{hue:0,saturation:100}),d('keypad',{brightness:100}),d('two',{hue:0,saturation:50})],120,100);
 assert.deepEqual(c.paths,['/home/color/120/100/one','/home/color/120/100/two']);assert.equal(c.skipped,1);
});
