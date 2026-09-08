const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {once}=require('node:events');
const {NoteStore,makeServer}=require('./Notesy/server.js');
(async()=>{
 const vault=process.argv[2];
 if(fs.readFileSync(path.join(vault,'fixture.md'),'utf8')!=='Organik sandbox fixture\n')throw Error('Not the synthetic test vault');
 const folder='ProbeNotes-'+crypto.randomUUID(),target=path.join(vault,folder);
 if(fs.existsSync(target))throw Error('Test folder already exists');
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'organik-notesy-probe-'));
 let server;
 try {
  const store=new NoteStore(vault,state,folder),vaultId=store.vaultId;
  const created=store.create({requestId:crypto.randomUUID(),text:'Sandbox note',vaultId});
  store.append(created.id,{requestId:crypto.randomUUID(),text:'Appended fixture',vaultId});
  const readable=store.read(created.id).text.includes('Appended fixture');
  const deleted=store.remove(created.id,{requestId:crypto.randomUUID(),vaultId}).deleted;
  server=makeServer({vault,state,token:'synthetic-token-'.repeat(3),folder}).server;
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const r=await fetch(`http://127.0.0.1:${server.address().port}/v1/health`,{headers:{Authorization:'Bearer '+'synthetic-token-'.repeat(3)}});
  const h=await r.json();
  console.log(JSON.stringify({probe:{notesyCreateAppendRead:readable,notesyDelete:deleted,notesyHealth:r.ok&&h.service==='StoneNotes'}}));
 } finally {
  if(server)await new Promise(resolve=>server.close(resolve));
  fs.rmSync(target,{recursive:true,force:true});fs.rmSync(state,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
