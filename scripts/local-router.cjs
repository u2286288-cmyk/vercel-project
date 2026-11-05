// Development only. Vercel serves public/ and discovers api/*.js itself.
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const markets = require('../api/markets');
const token = require('../api/token');
const output = require('../api/output');
const config = require('../vercel.json');
const files = {
  '/': ['index.html', 'text/html'],
  '/index.html': ['index.html', 'text/html'],
  '/app.js': ['app.js', 'text/javascript'],
  '/chart-hints.js': ['chart-hints.js', 'text/javascript'],
  '/styles.css': ['styles.css', 'text/css'],
  '/brand.svg': ['brand.svg', 'image/svg+xml'],
  '/logo-unavailable.svg': ['logo-unavailable.svg', 'image/svg+xml']
};
module.exports = async function localRouter(req, res) {
  for (const { key, value } of config.headers[0].headers) res.setHeader(key, value);
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/api/markets') return markets(req, res);
  if (pathname === '/api/token' || pathname === '/token') return token(req, res);
  if (['/api/output', '/output'].includes(pathname)) return output(req, res);
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    return res.end('Method not allowed');
  }
  const file = files[pathname];
  if (!file) { res.statusCode = 404; return res.end(req.method === 'HEAD' ? '' : 'Not found'); }
  try {
    const body = await readFile(path.join(__dirname, '../public', file[0]));
    res.statusCode = 200;
    res.setHeader('Content-Type', `${file[1]}; charset=utf-8`);
    res.end(req.method === 'HEAD' ? '' : body);
  } catch {
    res.statusCode = 500;
    res.end(req.method === 'HEAD' ? '' : 'Unable to serve asset');
  }
};
