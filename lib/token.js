const { getJson, cachedFeed, dateOrNull } = require('./coingecko');
const tokenData = cachedFeed(async () => {
  const payload = await getJson('simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_last_updated_at=true');
  if (!Number.isFinite(payload?.bitcoin?.usd) || !Number.isFinite(payload?.ethereum?.usd)) {
    throw new Error('CoinGecko returned incomplete Bitcoin or Ethereum prices.');
  }
  const coin = (value, symbol) => ({
    symbol, price: value.usd,
    lastUpdated: Number.isFinite(value.last_updated_at) ? dateOrNull(value.last_updated_at * 1000) : null
  });
  return { currency: 'USD', bitcoin: coin(payload.bitcoin, 'BTC'), ethereum: coin(payload.ethereum, 'ETH') };
}, 15000, {});
module.exports = { tokenData };
