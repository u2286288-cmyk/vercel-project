const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { issueAccess, verifyAccess, clientIp } = require('../lib/output-access');
const output = require('../api/output');
const token = require('../api/token');
const secret = 'test-only-' + 'x'.repeat(40);
let oldSecret, oldVercel;
beforeEach(() => {
  oldSecret = process.env.OUTPUT_ACCESS_PASSWORD;
  oldVercel = process.env.VERCEL;
  process.env.OUTPUT_ACCESS_PASSWORD = secret;
  delete process.env.VERCEL;
});
afterEach(() => {
  if (oldSecret === undefined) delete process.env.OUTPUT_ACCESS_PASSWORD;
  else process.env.OUTPUT_ACCESS_PASSWORD = oldSecret;
  if (oldVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = oldVercel;
});
function req(val, ip = '192.0.2.1', url = '/output', method = 'GET') {
  return {method,url,headers:{authorization:'Bearer ' + val},socket:{remoteAddress:ip}};
}
function grant(ip = '192.0.2.1', time = Date.now()) {
  return issueAccess(req(secret,ip),time).val;
}
async function call(handler, request) {
  const headers = {};
  const res = {setHeader(k,v){headers[k]=v;},end(body){this.body=body;}};
  await handler(request,res);
  return {...res,headers};
}

test('expiry boundary: 0 and 1000 ms accepted; 1001 ms and future timestamps rejected', () => {
  const val = grant('192.0.2.1',10000);
  assert.doesNotThrow(()=>verifyAccess(req(val),10000));
  assert.doesNotThrow(()=>verifyAccess(req(val),11000));
  assert.throws(()=>verifyAccess(req(val),11001),/expired/);
  assert.throws(()=>verifyAccess(req(val),9999),/expired/);
});

test('independent grants bind to their IP, survive another instance, and reject tampering', () => {
  const a = grant('192.0.2.1'), b = grant('192.0.2.2');
  assert.doesNotThrow(()=>verifyAccess(req(a)));
  assert.doesNotThrow(()=>verifyAccess(req(b,'192.0.2.2')));
  assert.throws(()=>verifyAccess(req(a,'192.0.2.2')),/different client IP/);
  const bytes = Buffer.from(a,'base64url'); bytes[30] ^= 1;
  assert.throws(()=>verifyAccess(req(bytes.toString('base64url'))),/invalid/);
  delete require.cache[require.resolve('../lib/output-access')];
  assert.doesNotThrow(()=>require('../lib/output-access').verifyAccess(req(a)));
});

test('IP comes from socket locally and trusted Vercel header only on Vercel', () => {
  const request = req('');
  request.headers['x-vercel-forwarded-for'] = '192.0.2.2';
  request.headers['x-forwarded-for'] = '192.0.2.3';
  assert.equal(clientIp(request),'192.0.2.1');
  process.env.VERCEL = '1';
  assert.equal(clientIp(request),'192.0.2.2');
  delete request.headers['x-vercel-forwarded-for'];
  assert.throws(()=>clientIp(request),/unavailable/);
});

test('issuance includes prices, needs no credential and ignores user agent', async t => {
  t.mock.method(global, 'fetch', async () => ({ok:true,json:async()=>({bitcoin:{usd:100},ethereum:{usd:20}})}));
  for (const agent of ['Mozilla/5.0 Chrome/130.0', 'curl/8.0']) {
    // No Authorization header at all — purpose=output alone is enough to get a grant now.
    const request = {method:'GET',url:'/token?purpose=output',headers:{'user-agent':agent},socket:{remoteAddress:'192.0.2.1'}};
    const response = await call(token,request);
    assert.equal(response.statusCode,200);
    const data = JSON.parse(response.body);
    assert.equal(data.bitcoin.price,100);
    assert.equal(data.ethereum.price,20);
    assert.doesNotThrow(()=>verifyAccess(req(data.val)));
  }
  // A bogus Authorization header no longer matters; a grant is still issued.
  assert.equal((await call(token,req('wrong','192.0.2.1','/token?purpose=output'))).statusCode,200);
  assert.equal((await call(token,req(secret,'192.0.2.1','/token?purpose=output','POST'))).statusCode,405);
});

function freshToken() {
  delete require.cache[require.resolve('../lib/token')];
  delete require.cache[require.resolve('../api/token')];
  return require('../api/token');
}

test('slow price lookup does not expire grant; cached prices receive fresh grants', async t => {
  let now = 10000, calls = 0;
  t.mock.method(Date,'now',()=>now);
  t.mock.method(global,'fetch',async()=>{
    calls++;
    now += 5000;
    return {ok:true,json:async()=>({bitcoin:{usd:100},ethereum:{usd:20}})};
  });
  const handler = freshToken();
  const first = JSON.parse((await call(handler,req(secret,'192.0.2.1','/token'))).body);
  assert.equal(first.issuedAt,15000);
  assert.equal(first.expiresAt,16000);
  assert.doesNotThrow(()=>verifyAccess(req(first.val)));
  now += 500;
  const second = JSON.parse((await call(handler,req(secret,'192.0.2.1','/token?purpose=output'))).body);
  assert.equal(calls,1);
  assert.equal(second.issuedAt,15500);
  assert.notEqual(second.val,first.val);
  t.mock.method(fs,'readFile',async()=>'{ "publicData": true }');
  const result = await call(output,req(second.val));
  assert.equal(result.statusCode,200);
  assert.deepEqual(JSON.parse(result.body),{publicData:true});
});

test('missing server secret blocks issuance before any price fetch; unavailable prices never issue a grant', async t => {
  let calls = 0;
  t.mock.method(global,'fetch',async()=>{calls++;return {ok:false,status:429};});
  const handler = freshToken();
  const oldSecretEnv = process.env.OUTPUT_ACCESS_PASSWORD;
  delete process.env.OUTPUT_ACCESS_PASSWORD;
  assert.equal((await call(handler,req('anything','192.0.2.1','/token?purpose=output'))).statusCode,503);
  assert.equal(calls,0);
  process.env.OUTPUT_ACCESS_PASSWORD = oldSecretEnv;
  const result = await call(handler,req(secret,'192.0.2.1','/token'));
  assert.equal(result.statusCode,503);
  assert.equal(JSON.parse(result.body).val,undefined);
});

test('JSON and text formats return identical data for browsers and non-browsers', async t => {
  const raw = '{ "publicData": ["fixture"], "count": 1 }\n';
  t.mock.method(fs,'readFile',async file=>{
    assert.ok(file.endsWith('/data/output.json'));
    return raw;
  });
  for (const agent of ['Mozilla/5.0 Chrome/130.0','curl/8.0']) {
    for (const format of ['json','text']) {
      const request = req(grant(),'192.0.2.1','/output?format=' + format);
      request.headers['user-agent'] = agent;
      const response = await call(output,request);
      assert.equal(response.statusCode,200);
      assert.deepEqual(JSON.parse(response.body),JSON.parse(raw));
      assert.equal(response.headers['Content-Type'],format === 'text' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8');
      if (format === 'text') assert.equal(response.body,raw);
    }
  }
  assert.equal((await call(output,req(grant(),'192.0.2.1','/output','HEAD'))).body,'');
});

test('fail closed before reading files; report missing, malformed and unsupported requests', async t => {
  let reads = 0;
  const mock = t.mock.method(fs,'readFile',async()=>{reads++;throw Object.assign(new Error(),{code:'ENOENT'});});
  assert.equal((await call(output,req(''))).statusCode,401);
  assert.equal(reads,0);
  assert.equal((await call(output,req(grant()))).statusCode,404);
  mock.mock.mockImplementation(async()=>'{bad');
  assert.equal((await call(output,req(grant()))).statusCode,500);
  assert.equal((await call(output,req(grant(),'192.0.2.1','/output?format=html'))).statusCode,400);
  assert.equal((await call(output,req('','192.0.2.1','/output','POST'))).statusCode,405);
  delete process.env.OUTPUT_ACCESS_PASSWORD;
  assert.equal((await call(output,req(''))).statusCode,503);
});

test('local aliases require access and public/private direct file paths stay inaccessible', async () => {
  const router = require('../scripts/local-router.cjs');
  for (const url of ['/output','/api/output']) {
    assert.equal((await call(router,req('','192.0.2.1',url))).statusCode,401);
  }
  for (const url of ['/output.json','/data/output.json']) {
    assert.equal((await call(router,req('','192.0.2.1',url))).statusCode,404);
  }
});
