export function pcmToWav(chunks:Uint8Array[]):Uint8Array {
 const size=chunks.reduce((n,c)=>n+c.byteLength,0);if(size%2)throw new Error('Incomplete audio frame');
 const wav=new Uint8Array(44+size),v=new DataView(wav.buffer);const str=(p:number,s:string)=>[...s].forEach((c,i)=>wav[p+i]=c.charCodeAt(0));
 str(0,'RIFF');v.setUint32(4,36+size,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,size,true);let pos=44;for(const c of chunks){wav.set(c,pos);pos+=c.length;}return wav;
}
