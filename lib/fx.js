const { get, cached } = require('./util');
// USD-based rates. Primary: open.er-api.com (ExchangeRate-API, free/keyless). Fallback: frankfurter.app (ECB).
async function rates() {
  return cached('fx', 6 * 3600e3, async () => {
    try {
      const { body } = await get('https://open.er-api.com/v6/latest/USD', { json: true });
      if (body.result === 'success') return { base: 'USD', rates: body.rates, updated: body.time_last_update_utc, source: 'open.er-api.com (ExchangeRate-API)' };
    } catch { }
    const { body } = await get('https://api.frankfurter.app/latest?from=USD', { json: true });
    return { base: 'USD', rates: { USD: 1, ...body.rates }, updated: body.date, source: 'frankfurter.app (ECB)' };
  });
}
module.exports = { rates };
