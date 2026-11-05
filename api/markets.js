const { marketData } = require('../lib/markets');
const { jsonEndpoint } = require('../lib/http');
module.exports = jsonEndpoint(marketData);
