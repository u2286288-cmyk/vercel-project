const REQUEST_TIMEOUT_MS = 8000;

function errorFor(status, retryAfterSeconds) {
  const message = status === 429 ? 'CoinGecko rate limit reached. Please retry later.'
    : [401, 403].includes(status) ? 'CoinGecko rejected access. Check COINGECKO_DEMO_API_KEY.'
    : 'CoinGecko is temporarily unavailable.';
  return Object.assign(new Error(message), { status, retryAfterSeconds });
}

async function getJson(endpoint) {
  const key = process.env.COINGECKO_DEMO_API_KEY?.trim();
  const headers = { accept: 'application/json' };
  if (key) headers['x-cg-demo-api-key'] = key;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(`https://api.coingecko.com/api/v3/${endpoint}`, {
        headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      if (!response.ok) {
        const retry = response.headers?.get('retry-after');
        const seconds = retry && /^\d+$/.test(retry) ? Number(retry)
          : retry ? Math.ceil((Date.parse(retry) - Date.now()) / 1000) : 60;
        throw errorFor(response.status, Number.isFinite(seconds) ? Math.max(1, seconds) : 60);
      }
      return await response.json();
    } catch (error) {
      const transient = !error.status || error.status >= 500;
      if (attempt === 0 && transient) {
        await new Promise(resolve => setTimeout(resolve, 250));
        continue;
      }
      if (error.status) throw error;
      throw new Error(error.name === 'TimeoutError' || error.name === 'AbortError'
        ? 'CoinGecko timed out. Please retry.'
        : 'Cannot load CoinGecko data. Check the server connection and retry.');
    }
  }
}

// Each service owns its cache; the endpoints never call one another.
function cachedFeed(load, ttl, empty) {
  let cached, pending, retryAt = 0, lastError;
  const fallback = () => {
    const retryAfterSeconds = Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
    if (cached && Date.now() - cached.time < 15 * 60 * 1000) {
      return { ...cached.data, mode: 'stale', notice: lastError, retryAfterSeconds };
    }
    return { ...empty, source: 'CoinGecko', mode: 'unavailable', error: lastError, retryAfterSeconds };
  };
  return async () => {
    if (cached && Date.now() - cached.time < ttl) return cached.data;
    if (pending) return pending;
    if (Date.now() < retryAt) return fallback();
    pending = (async () => {
      try {
        const payload = await load();
        const data = { ...payload, source: 'CoinGecko', mode: 'live', retrievedAt: new Date().toISOString() };
        cached = { time: Date.now(), data };
        retryAt = 0;
        return data;
      } catch (error) {
        lastError = error.message;
        retryAt = Date.now() + (error.status === 429 ? error.retryAfterSeconds * 1000 : 20000);
        return fallback();
      }
    })();
    try { return await pending; } finally { pending = undefined; }
  };
}

const numberOrNull = value => Number.isFinite(value) ? value : null;
function dateOrNull(value) {
  const date = new Date(value);
  return value != null && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function imageOrNull(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['coin-images.coingecko.com', 'assets.coingecko.com'].includes(url.hostname) ? url.href : null;
  } catch { return null; }
}
module.exports = { getJson, cachedFeed, numberOrNull, dateOrNull, imageOrNull };
