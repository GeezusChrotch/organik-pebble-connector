import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { isStoreDistribution } from './agent-distribution.js';

export function createHermesApprovalClient({socketPath = path.join(os.homedir(), '.hermes', 'beepster', 'approvals.sock'),
  bridgeURL = process.env.BEEPSTER_HERMES_BRIDGE_URL,
  bridgeToken = process.env.BEEPSTER_HERMES_BRIDGE_TOKEN,
  fetchImpl = fetch} = {}) {
  async function httpRequest(body) {
    const url = new URL(bridgeURL);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/v1/beepster' ||
        url.username || url.password || url.search || url.hash || !/^[a-f0-9]{32,}$/i.test(bridgeToken || ''))
      throw new Error('Configure the authenticated Hermes loopback bridge in Connector');
    const response = await fetchImpl(url, {method:'POST', redirect:'error', signal:AbortSignal.timeout(4000),
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${bridgeToken}`}, body:JSON.stringify(body)});
    if (!response.ok) throw new Error('Hermes bridge rejected the request; check its connection settings');
    const chunks = []; let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > 128000) throw new Error('Hermes response too large');
      chunks.push(chunk);
    }
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (result.protocol !== 1 || result.ok !== true) throw new Error('Hermes did not confirm the request');
    return result;
  }
  function request(body) {
    if (bridgeURL) return httpRequest(body);
    if (isStoreDistribution()) return Promise.reject(new Error('Configure the Hermes HTTP bridge in Connector; Store builds do not use Unix sockets'));
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(socketPath);
      let data = '', done = false;
      const finish = (error, value) => { if (done) return; done = true; socket.destroy(); error ? reject(error) : resolve(value); };
      socket.setTimeout(4000, () => finish(new Error('Hermes approval bridge timed out')));
      socket.on('error', () => finish(new Error('Hermes bridge unavailable: enable its Beepster plugin and request an approval in Telegram')));
      socket.on('connect', () => socket.write(JSON.stringify(body) + '\n'));
      socket.on('end', () => { if (!done) finish(new Error('Hermes bridge closed without confirmation')); });
      socket.on('data', chunk => {
        data += chunk.toString();
        if (data.length > 128000) return finish(new Error('Hermes response too large'));
        if (!data.includes('\n')) return;
        try {
          const result = JSON.parse(data.split('\n')[0]);
          if (result.protocol !== 1 || !result.ok) throw new Error(result.error || 'Unsupported Hermes bridge');
          finish(null, result);
        } catch (error) { finish(error); }
      });
    });
  }
  return {
    async listSessions() { return (await request({method:'sessions'})).items; },
    async syncPrompts(prompts) { return request({method:'prompts.sync',prompts}); },
    async listApprovals() { return (await request({method:'list'})).items; },
    async resolveApproval(id, decision, sessionKey) {
      if (!sessionKey || !['allow-once','deny','allow-always'].includes(decision)) throw new Error('Exact session and supported decision required');
      return request({method:'resolve', id, sessionKey, decision});
    }
  };
}
