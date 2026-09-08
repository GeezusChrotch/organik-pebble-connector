import {createServer} from './gateway/src/server.js';
import {once} from 'node:events';
// Construct with synthetic credentials, no Beeper/agent clients and no Keychain.
const server = createServer({gatewayToken:'sandbox-test-only',pairingCode:'000000'});
server.listen(0, '127.0.0.1');
await once(server,'listening');
try {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);
  const health = await response.json();
  console.log(JSON.stringify({probe:{gatewayImport:true,ephemeralLoopback:response.ok,service:health.service}}));
} finally { await new Promise(resolve=>server.close(resolve)); }
