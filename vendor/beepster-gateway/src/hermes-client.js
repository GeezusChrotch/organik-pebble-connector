import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export function createHermesApprovalClient({socketPath = path.join(os.homedir(), '.hermes', 'beepster', 'approvals.sock')} = {}) {
  function request(body) {
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
    async listApprovals() { return (await request({method:'list'})).items; },
    async resolveApproval(id, decision, sessionKey) {
      if (!sessionKey || !['allow-once','deny','allow-always'].includes(decision)) throw new Error('Exact session and supported decision required');
      return request({method:'resolve', id, sessionKey, decision});
    }
  };
}
