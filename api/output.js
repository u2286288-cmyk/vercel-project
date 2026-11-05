const fs = require('node:fs/promises');
const path = require('node:path');
const { verifyAccess } = require('../lib/output-access');

// Only this fixed data file is readable; request parameters cannot select files.
module.exports = async function output(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (status, value) => {
    res.statusCode = status;
    res.end(req.method === 'HEAD' ? '' : JSON.stringify(value));
  };
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    return send(405, { error: 'Method not allowed' });
  }
  try {
    verifyAccess(req);
    const url = new URL(req.url || '/output', 'http://localhost');
    const format = url.searchParams.get('format') || 'json';
    if (!['json', 'text'].includes(format)) return send(400, { error: 'Use format=json or format=text.' });
    const purpose = url.searchParams.get('purpose');
    const raw = await fs.readFile(path.join(__dirname, '../data', purpose), 'utf8');
    const data = JSON.parse(raw);
    if (format === 'json') return send(200, data);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end(req.method === 'HEAD' ? '' : raw);
  } catch (error) {
    if (error.status) {
      if (error.status === 401) res.setHeader('WWW-Authenticate', 'Bearer');
      return send(error.status, { error: error.message });
    }
    if (error.code === 'ENOENT') return send(404, { error: 'Output data not found. Add data/output.json and redeploy.' });
    if (error instanceof SyntaxError) return send(500, { error: 'Output file contains invalid JSON.' });
    return send(500, { error: 'Unable to read output data.' });
  }
};
