import {execFile} from 'node:child_process';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const active = new Map();
export async function stopLocalSpeech() {
  for (const child of active.values()) child.kill();
  await Promise.allSettled([...active.keys()].map(directory => rm(directory,{recursive:true,force:true})));
}
export async function transcribeLocal(audio, config) {
  const directory = await mkdtemp(path.join(tmpdir(),'organik-speech-'));
  try {
    const file = path.join(directory,'recording.wav');
    await writeFile(file,audio,{mode:0o600});
    const stdout = await new Promise((resolve,reject) => {
      const child = execFile(config.localSpeechBinary,['transcribe',config.localSpeechModels,file],{
        timeout:55000,maxBuffer:256*1024,env:{...process.env,OS_ACTIVITY_MODE:'disable'}
      },(error,stdout) => error ? reject(error) : resolve(stdout));
      active.set(directory,child);
    });
    return JSON.parse(stdout);
  } finally {active.delete(directory);await rm(directory,{recursive:true,force:true});}
}
