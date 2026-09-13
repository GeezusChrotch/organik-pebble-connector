// A narrow G2 adapter to the existing authenticated Beepster gateway.
export function beepsterRoute(method,pathname){
 if(method==='GET')return /^\/beepster\/v1\/chats$/.test(pathname)||/^\/beepster\/v1\/chats\/[^/]+\/messages(?:\/[^/]+)?$/.test(pathname)||/^\/beepster\/v1\/attachments\/[a-f0-9]{24}\/preview$/.test(pathname);
 return method==='POST'&&(pathname==='/beepster/v1/chats/archive'||/^\/beepster\/v1\/chats\/[^/]+\/(messages|read)$/.test(pathname));
}
export async function proxyBeepster(req,url,config,fetcher=fetch,upstream='http://127.0.0.1:8794'){
 if(!config.beepsterToken)return {status:503,data:{error:'Enable Beepster in Connector, then restart the G2 connection.'}};
 let body;if(req.method==='POST'){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16384)return {status:413,data:{error:'Reply is too large'}};chunks.push(chunk);}body=Buffer.concat(chunks);try{JSON.parse(body.toString());}catch{return {status:400,data:{error:'Invalid reply'}};}}
 const response=await fetcher(upstream+url.pathname.slice('/beepster'.length)+url.search,{method:req.method,headers:{Authorization:'Bearer '+config.beepsterToken,...(body?{'Content-Type':'application/json'}:{})},body,signal:AbortSignal.timeout(18000),redirect:'error'});
 return {status:response.status,data:await response.json()};
}
