const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');

test('Vercel uses separate functions, static output and only the token alias', () => {
  const config = require('../vercel.json');
  assert.equal(config.outputDirectory, 'public');
  assert.equal(config.framework, null);
  assert.equal(config.buildCommand, '');
  assert.equal(config.builds, undefined);
  assert.equal(config.routes, undefined);
  assert.deepEqual(config.rewrites, [{ source: '/token', destination: '/api/token' }, { source: '/output', destination: '/api/output' }]);
  assert.deepEqual(fs.readdirSync(require('node:path').join(__dirname, '../api')).sort(), ['markets.js', 'output.js', 'token.js']);
  for (const endpoint of ['markets', 'token']) {
    assert.equal(typeof require('../api/' + endpoint), 'function');
    assert.equal(config.functions['api/' + endpoint + '.js'].maxDuration, 30);
  }
});

test('each deployed function handles methods without a central router', async () => {
  for (const endpoint of ['markets', 'token']) {
    let body;
    const headers = {};
    const res = { setHeader(k,v) { headers[k] = v; }, end(value) { body = value; } };
    await require('../api/' + endpoint)({method:'POST'}, res);
    assert.equal(res.statusCode, 405);
    assert.equal(headers.Allow, 'GET, HEAD');
    assert.ok(JSON.parse(body).error);
  }
});

test('local HTTP serves static dashboard, aliases token, and rejects private paths', async t => {
  const original = global.fetch;
  global.fetch = async () => ({ok:true,json:async()=>({bitcoin:{usd:100},ethereum:{usd:20}})});
  const server = http.createServer(require('../scripts/local-router.cjs'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { global.fetch = original; await new Promise(resolve => server.close(resolve)); });
  const address = 'http://127.0.0.1:' + server.address().port;
  assert.equal((await original(address)).status, 200);
  assert.match(await (await original(address + '/app.js')).text(), /timeout\(25000\)/);
  assert.equal((await original(address + '/lib/token.js')).status, 404);
  for (const route of ['/token', '/api/token']) {
    const response = await original(address + route);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ethereum.price, 20);
  }
});
