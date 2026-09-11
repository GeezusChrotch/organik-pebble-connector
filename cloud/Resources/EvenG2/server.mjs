import http from 'node:http';
import {transcribeLocal, stopLocalSpeech} from './local-speech.mjs';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const MAX_AUDIO = 4 * 1024 * 1024;
const homeReads = /^\/home\/(status|list\/(rooms|devices|scenes)|info\/[^?]+)$/;
const homeWrites = /^\/home\/(scene|toggle|on|off|brightness|color|speed|position)\/[^?]+$/;
const cameraReads = /^\/(cameras|frame\/[^/?]+|capture\/[^/?]+|history\/[^/?]+)$/;
const cameraWrites = /^\/refresh\/[^/?]+$/;
export function allowedRoute(method, pathname) {
  return method === 'GET' ? homeReads.test(pathname) || cameraReads.test(pathname)
    : method === 'POST' && (homeWrites.test(pathname) || cameraWrites.test(pathname));
}
function authenticated(value, token) {
  const actual = Buffer.from(value || ''), expected = Buffer.from('Bearer ' + token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
async function body(req, limit) {
  const chunks = []; let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > limit) throw Object.assign(new Error('Recording is too long. Limit: two minutes.'), {status:413});
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export function createBridge(config, { upstream = 'http://127.0.0.1:7855', fetcher = fetch, assets = path.join(path.dirname(fileURLToPath(import.meta.url)), 'pome/dist') } = {}) {
  if (!config.clientToken || !config.homeToken) throw new Error('Missing connection credentials');
  let transcribing = false;
  let speechURL;
  if (config.speechBaseURL) {
    speechURL = new URL(config.speechBaseURL.replace(/\/$/, '') + '/audio/transcriptions');
    if (speechURL.protocol !== 'https:' && !(speechURL.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(speechURL.hostname))) throw new Error('Speech provider must use HTTPS or localhost');
    if (speechURL.username || speechURL.password || speechURL.search || speechURL.hash) throw new Error('Invalid speech provider URL');
  }
  return http.createServer({maxHeaderSize:8192, requestTimeout:70000, headersTimeout:10000}, async (req, res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    res.setHeader('X-Content-Type-Options','nosniff');
    const json = (status, value) => {res.writeHead(status, {'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'OPTIONS') {res.writeHead(204);res.end();return;}
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/assets/'))) {
        const file = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1);
        const resolved = path.resolve(assets, file);
        if (!resolved.startsWith(path.resolve(assets) + path.sep)) return json(404,{error:'Not found'});
        try {const data = await readFile(resolved);res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});res.end(data);} catch {json(404,{error:'Not found'});}return;
      }
      if (!authenticated(req.headers.authorization, config.clientToken)) return json(401,{error:'Pair Pome in the Even phone app settings.'});
      if (req.method === 'GET' && url.pathname === '/health') {
        let home = false;
        try {const r = await fetcher(upstream + '/home/status',{headers:{Authorization:'Bearer '+config.homeToken},signal:AbortSignal.timeout(10000)});const j = await r.json();home = r.ok && j.backend === 'homekit';}catch{}
        return json(200,{service:'org.organikapps.even',protocol:1,home,dictation:!!speechURL || !!config.localSpeechBinary,speechModel:config.speechModel || ''});
      }
      if (req.method === 'POST' && url.pathname === '/speech') {
        if (!speechURL && !config.localSpeechBinary) return json(503,{error:'Set up Dictation in Connector → Even G2 on your Mac.'});
        if (transcribing) return json(409,{error:'Another recording is being transcribed. Try again shortly.'});
        transcribing = true;
        try {
          const audio = await body(req,MAX_AUDIO);
          if (audio.length < 44 || audio.toString('ascii',0,4) !== 'RIFF' || audio.toString('ascii',8,12) !== 'WAVE') return json(400,{error:'Invalid recording'});
          if (config.localSpeechBinary) {
            let result;
            try {result = await transcribeLocal(audio,config);} catch {return json(502,{error:'Local dictation failed. Retry setup in Connector → Even G2.'});}
            if (typeof result.text !== 'string' || !result.text.trim()) return json(422,{error:'No speech recognized. Please try again.'});
            return json(200,{text:result.text.trim().slice(0,12000)});
          }
          const form = new FormData();form.set('file',new Blob([audio],{type:'audio/wav'}),'command.wav');form.set('model',config.speechModel || 'whisper-1');
          const language = url.searchParams.get('language');if (language && /^[a-z]{2}$/.test(language)) form.set('language',language);
          const response = await fetcher(speechURL,{method:'POST',headers:config.speechToken?{Authorization:'Bearer '+config.speechToken}:{},body:form,signal:AbortSignal.timeout(60000),redirect:'error'});
          if (!response.ok) return json(502,{error:'Transcription provider failed. Check Dictation on your Mac.'});
          const result = await response.json();
          if (typeof result.text !== 'string' || !result.text.trim()) return json(422,{error:'No speech recognized. Please try again.'});
          return json(200,{text:result.text.trim().slice(0,12000)});
        }finally{transcribing = false;}
      }
      if (!allowedRoute(req.method,url.pathname)) return json(404,{error:'Not found'});
      const response = await fetcher(upstream + url.pathname + url.search,{method:req.method,headers:{Authorization:'Bearer '+config.homeToken},signal:AbortSignal.timeout(14000),redirect:'error'});
      // Only the HomeKit API is exposed. No service shutdown, tokens or scheduling endpoints.
      const data = await response.arrayBuffer();res.writeHead(response.status,{'Content-Type':'application/json'});res.end(Buffer.from(data));
    } catch (error) {if(!res.headersSent)json(error.status || 502,{error:error.status?error.message:'Connector request failed. Refresh before retrying a control.'});else res.end();}
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let input = '';for await (const chunk of process.stdin) {input += chunk;if(input.length>16384)process.exit(1);}
  const config = JSON.parse(input);input = '';
  const server = createBridge(config);
  server.on('error',()=>{process.stderr.write('Even G2 service could not start. Check the port and configuration.\n');process.exit(1);});
  server.listen(7858,'127.0.0.1',()=>process.stdout.write('READY\n'));
  for (const sig of ['SIGTERM','SIGINT']) process.on(sig,async()=>{await stopLocalSpeech();server.closeAllConnections();server.close(()=>process.exit(0));});
}
