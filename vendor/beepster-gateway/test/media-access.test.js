import test from 'node:test';
import assert from 'node:assert/strict';
import {probeMediaAccess} from '../src/media-access.js';

test('media access probe opens and closes directory without reading names or contents',async()=>{
  let opened=0,closed=0;
  const result=await probeMediaAccess({platform:'darwin',directory:'/test/attachments',openDirectory:async path=>{
    assert.equal(path,'/test/attachments');opened++;return{close:async()=>{closed++;},read:()=>{throw Error('must not enumerate');}};
  }});
  assert.deepEqual(result,{supported:true,allowed:true,code:'READY'});assert.equal(opened,1);assert.equal(closed,1);
});

test('denied, absent, unknown and unsupported media access are never false-green',async()=>{
  for(const code of ['EPERM','EACCES','ENOENT','EIO']){
    const result=await probeMediaAccess({platform:'darwin',openDirectory:async()=>{throw Object.assign(Error('private path'),{code});}});
    assert.notEqual(result.allowed,true);assert.doesNotMatch(JSON.stringify(result),/private/);
    if(code==='EPERM'||code==='EACCES')assert.equal(result.code,'MEDIA_PERMISSION');
  }
  const result=await probeMediaAccess({platform:'linux',openDirectory:async()=>{throw Error('must not probe');}});
  assert.equal(result.supported,false);assert.equal(result.allowed,null);
});
