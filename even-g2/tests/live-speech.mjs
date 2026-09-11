// Uses only the synthetic test recording. Never controls a home accessory.
import {readFile} from 'node:fs/promises';
import {createBridge} from '../server.mjs';
const [binary,models,wav]=process.argv.slice(2);
if(!binary||!models||!wav)throw new Error('Pass helper, model directory and synthetic WAV');
const server=createBridge({clientToken:'speech-test',homeToken:'unused',localSpeechBinary:binary,localSpeechModels:models});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try {
  const start=performance.now();
  const r=await fetch('http://127.0.0.1:'+server.address().port+'/speech',{method:'POST',headers:{Authorization:'Bearer speech-test','Content-Type':'audio/wav'},body:await readFile(wav)});
  const j=await r.json();
  if(!r.ok)throw new Error(JSON.stringify(j));
  if(!/turn.*desk lamp.*on/i.test(j.text))throw new Error('Synthetic home command was not recognized');
  console.log(JSON.stringify({passed:true,text:j.text,elapsedSeconds:Number(((performance.now()-start)/1000).toFixed(2))}));
} finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
