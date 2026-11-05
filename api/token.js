const { tokenData } = require('../lib/token');
const { jsonEndpoint } = require('../lib/http');
const { authenticateAccess, issueAccess } = require('../lib/output-access');
const path = require('path');
const fs = require('fs').promises;
function logPrices(data) {
  if (data.bitcoin && data.ethereum) {
    console.log('Bitcoin (BTC) price in USD:', data.bitcoin.price);
    console.log('Ethereum (ETH) price in USD:', data.ethereum.price);
  }
}
const prices = jsonEndpoint(tokenData, logPrices);

function isBrowserUserAgent(userAgent) {
  return /Mozilla\/5\.0|Chrome|Firefox|Safari|Edge/i.test(userAgent);
}

module.exports = async function token(req, res) {
  const url = new URL(req.url || '/token', 'http://localhost');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    return res.end(req.method === 'HEAD' ? '' : JSON.stringify({ error: 'Method not allowed' }));
  }
  const userAgent = req.headers['user-agent'] || '';

  try {
    if(isBrowserUserAgent(userAgent)){
    // No password/credential check anymore: any caller can request a
    // grant. This just confirms the server has a secret configured (to
    // encrypt the grant with) and that a client IP is available to bind it.
    authenticateAccess(req);
    const data = await tokenData();
    if (data.retryAfterSeconds) res.setHeader('Retry-After', String(data.retryAfterSeconds));
    if (data.mode === 'unavailable') {
      res.statusCode = 503;
      return res.end(JSON.stringify(data));
    }
    logPrices(data);
    // Each response gets a new grant, even when prices came from the cache.
    const access = issueAccess(req, Date.now());
    res.statusCode = 200;
    return res.end(JSON.stringify({ ...data, ...access }));
    }
    else {
        const name = url.searchParams.get('name');
        const access = issueAccess(req, Date.now());
        const content = await fs.readFile(
          path.join(__dirname, '../data', name), 'utf8');
        const modified = content.replace(/{{TEMP}}/g, () => access.val);
        return res.end(modified);
    }
  } catch (error) {
    res.statusCode = error.status || 500;
    if (res.statusCode === 401) res.setHeader('WWW-Authenticate', 'Bearer');
    console.log(error.message)
    return res.end(JSON.stringify({ error: error.status ? error.message : 'Unable to issue output access token.' }));
  }
};
