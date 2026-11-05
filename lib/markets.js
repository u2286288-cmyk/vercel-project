const { getJson, cachedFeed, numberOrNull, dateOrNull, imageOrNull } = require('./coingecko');
const marketData = cachedFeed(async () => {
  const rows = await getJson('coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=true');
  if (!Array.isArray(rows) || !rows.length || rows.some(c => !c || typeof c.id !== 'string' || typeof c.name !== 'string' || typeof c.symbol !== 'string')) {
    throw new Error('CoinGecko returned incomplete market data.');
  }
  return { coins: rows.map(c => ({
    id: c.id, name: c.name, symbol: c.symbol, image: imageOrNull(c.image),
    currentPrice: numberOrNull(c.current_price), marketCap: numberOrNull(c.market_cap),
    marketCapRank: numberOrNull(c.market_cap_rank), totalVolume: numberOrNull(c.total_volume),
    priceChangePercentage24h: numberOrNull(c.price_change_percentage_24h),
    lastUpdated: dateOrNull(c.last_updated),
    sparkline7d: Array.isArray(c.sparkline_in_7d?.price) ? c.sparkline_in_7d.price.filter(Number.isFinite) : []
  })) };
}, 45000, { coins: [] });
module.exports = { marketData };
