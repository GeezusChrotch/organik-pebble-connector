import test from 'node:test';import assert from 'node:assert/strict';
import {voiceCommand,pcmToWav,validateConnection} from '../pome/src/model.ts';import {frameBMP} from '../pome/src/images.ts';import {demoSnapshot} from '../pome/src/api.ts';
test('voice targets stable IDs and refuses ambiguous or unsafe controls',()=>{
 assert.deepEqual(voiceCommand('turn desk lamp on',demoSnapshot).paths,['/home/on/desk']);
 assert.deepEqual(voiceCommand('turn living room lights green',demoSnapshot).paths,['/home/color/120/100/lamp']);
 assert.deepEqual(voiceCommand('run movie time',demoSnapshot).paths,['/home/scene/movie']);
 assert.throws(()=>voiceCommand('set desk lamp to 150 percent',demoSnapshot));
 const duplicate=structuredClone(demoSnapshot);duplicate.devices.push({...duplicate.devices[3],serviceId:'other',room:'Elsewhere'});
 assert.throws(()=>voiceCommand('turn desk lamp on',duplicate),/More than one/);
 assert.deepEqual(voiceCommand('turn studio desk lamp on',duplicate).paths,['/home/on/desk']);
 duplicate.devices[3].type='lock';assert.throws(()=>voiceCommand('turn studio desk lamp on',duplicate),/read only/);
});
test('pairing rejects public cleartext and embedded credentials',()=>{
 assert.equal(validateConnection('https://example.ts.net:10558'),'https://example.ts.net:10558');
 for(const url of ['http://example.com','https://user:secret@example.com','https://example.com/home','https://example.com/?token=secret'])assert.throws(()=>validateConnection(url));
});
test('WAV preserves multiple PCM chunks and correct headers',()=>{
 const wav=pcmToWav([new Uint8Array([1,2]),new Uint8Array([3,4])]);const v=new DataView(wav.buffer);
 assert.equal(v.getUint32(24,true),16000);assert.equal(v.getUint32(40,true),4);assert.deepEqual([...wav.slice(44)],[1,2,3,4]);assert.throws(()=>pcmToWav([new Uint8Array(1)]));
});
test('packed RGB222 camera frame becomes bounded 16-level grayscale BMP',()=>{
 const bmp=frameBMP({encoding:'gcolor6',width:1,height:1,pixels:btoa(String.fromCharCode(252)),age:12});const v=new DataView(bmp.buffer);assert.equal(v.getInt32(18,true),288);assert.equal(v.getInt32(22,true),144);assert.equal(bmp.length,54+288*144*3);
 for(let i=54;i<bmp.length;i+=3){assert.equal(bmp[i],bmp[i+1]);assert.equal(bmp[i+1],bmp[i+2]);assert.equal(bmp[i]%17,0);}
 assert.throws(()=>frameBMP({encoding:'gcolor6',width:192,height:108,pixels:'',age:0}),/Incomplete/);
});
