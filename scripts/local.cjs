const http = require('node:http');
const handler = require('./local-router.cjs');

const configured = process.env.LOCAL_PORT;
const port = configured === undefined ? 0 : Number(configured);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('LOCAL_PORT must be an integer from 0 to 65535.');
}

const server = http.createServer(handler);
server.listen(port, '127.0.0.1', () => {
  const { port: selectedPort } = server.address();
  console.log(`Market Atlas is running at http://127.0.0.1:${selectedPort}`);
  console.log('Press Ctrl+C to stop the local server.');
});
