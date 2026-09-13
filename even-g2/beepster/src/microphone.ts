// Serialize audio control so a late stop cannot close the next recording.
// The SDK boolean reports operation success, not the user's permission state.
export class MicrophoneSession {
 private queue:Promise<unknown>=Promise.resolve();private generation=0;private wanted=false;private frames=0;
 constructor(private control:(open:boolean)=>Promise<boolean>,private status:(text:string)=>void,private wait:(ms:number)=>Promise<void>=ms=>new Promise(r=>setTimeout(r,ms))){}
 receive():boolean {if(!this.wanted)return false;if(++this.frames===1)this.status('Receiving glasses microphone audio');return true;}
 start(ready:()=>Promise<void>):Promise<void>{
  if(this.wanted)return this.queue.then(()=>{});
  this.wanted=true;this.frames=0;const generation=++this.generation;let touched=false;
  const current=()=>this.wanted&&generation===this.generation;
  const check=()=>{if(!current())throw Error('Microphone start cancelled');};
  const operation=this.queue.catch(()=>{}).then(async()=>{
   await ready();check();touched=true;
   for(let attempt=0;attempt<2;attempt++){
    this.status(attempt?'Reconnecting glasses microphone…':'Opening glasses microphone…');
    // Release a prior session even if its stop acknowledgement was lost.
    await this.control(false).catch(()=>false);check();await this.wait(250);check();
    this.frames=0;const accepted=await this.control(true).catch(()=>false);check();
    // Actual audio also wins over a negative/late acknowledgement.
    for(let i=0;i<20&&!this.frames;i++){await this.wait(100);check();}
    if(this.frames){this.status('Receiving glasses microphone audio');return;}
    this.status(accepted?'Mic acknowledged, but no audio arrived':'Mic start was not acknowledged');
   }
   throw Error('Glasses microphone did not provide audio. Close the G2 menu and try Dictate again.');
  }).catch(async error=>{if(current()){this.wanted=false;if(touched)await this.control(false).catch(()=>false);this.status('No microphone audio received · try Dictate again');}throw error;});
  this.queue=operation;return operation;
 }
 stop():Promise<void>{
  this.wanted=false;this.generation++;
  const operation=this.queue.catch(()=>{}).then(async()=>{const accepted=await this.control(false);this.status(accepted?'Microphone stopped':'Microphone stop not acknowledged; keeping captured audio');});
  this.queue=operation;return operation;
 }
}
