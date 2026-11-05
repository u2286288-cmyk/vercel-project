function jsonEndpoint(load, onGet) {
  return async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD');
      res.statusCode = 405;
      return res.end(JSON.stringify({ error: 'Method not allowed' }));
    }
    try {
      const data = await load();
      res.statusCode = data.mode === 'unavailable' ? 503 : 200;
      if (data.retryAfterSeconds) res.setHeader('Retry-After', String(data.retryAfterSeconds));
      if (req.method === 'GET' && onGet) onGet(data);
      return res.end(req.method === 'HEAD' ? '' : JSON.stringify(data));
    } catch {
      res.statusCode = 500;
      return res.end(req.method === 'HEAD' ? '' : JSON.stringify({ error: 'Unable to prepare the response.', source: 'CoinGecko' }));
    }
  };
}
module.exports = { jsonEndpoint };
