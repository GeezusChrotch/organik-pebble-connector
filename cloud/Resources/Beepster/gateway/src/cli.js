import { createConfiguredServer } from './server.js';

const host = process.env.BEEPSTER_HOST || '127.0.0.1';
const port = Number.parseInt(process.env.BEEPSTER_PORT || '8794', 10);
const server = await createConfiguredServer();

server.listen(port, host, () => {
  console.log(`Beepster gateway listening on http://${host}:${port}`);
});
