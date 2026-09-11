import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {transcribeLocal} from '../local-speech.mjs';
test('local helper receives private audio and temporary file is removed',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'organik-test-'));
  try {
    const binary=path.join(dir,'helper');
    await writeFile(binary,'#!/usr/bin/env node\nconsole.log(JSON.stringify({text:"Turn desk lamp on",file:process.argv[4]}));\n',{mode:0o700});
    const result=await transcribeLocal(Buffer.from('test audio'),{localSpeechBinary:binary,localSpeechModels:dir});
    assert.equal(result.text,'Turn desk lamp on');
    await assert.rejects(access(result.file));
    await writeFile(binary,'#!/usr/bin/env node\nprocess.exit(1);\n',{mode:0o700});
    await assert.rejects(transcribeLocal(Buffer.from('test'),{localSpeechBinary:binary,localSpeechModels:dir}));
  } finally {await rm(dir,{recursive:true,force:true});}
});
