const { get, cached, pool, COUNTRIES, parsePrice } = require('./util');
const H12 = 12 * 3600e3;

async function search(q) {
  return cached('apple:s:' + q.toLowerCase(), H12, async () => {
    const { body } = await get(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=software&country=us&limit=5`, { json: true });
    return (body.results || []).map(r => ({ store: 'apple', id: String(r.trackId), title: r.trackName, image: r.artworkUrl100, sub: `App Store · ${r.formattedPrice || 'Free'}${r.sellerName ? ' · ' + r.sellerName : ''}` }));
  });
}

// "Top In-App Purchases" from the public App Store web page for one storefront.
function parseIAP(html) {
  const m = html.match(/"In-App Purchases","summary":"Yes","items":(\[.*?\])\s*[,}]/);
  if (!m) return [];
  return [...m[1].matchAll(/"leadingText":"((?:[^"\\]|\\.)*)","trailingText":"((?:[^"\\]|\\.)*)"/g)].map(x => ({ name: JSON.parse('"' + x[1] + '"'), price: JSON.parse('"' + x[2] + '"') }));
}

const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function prices(id) {
  id = String(id).replace(/\D/g, '');
  return cached('apple:p:' + id, 6 * 3600e3, async () => {
    const per = await pool(COUNTRIES, 6, async c => {
      const { body } = await get(`https://itunes.apple.com/lookup?id=${id}&country=${c.code.toLowerCase()}`, { json: true });
      const r = body.results?.[0];
      if (!r) return { cc: c.code, unavailable: true };
      let iap = [];
      try { const { body: html } = await get(`https://apps.apple.com/${c.code.toLowerCase()}/app/id${id}?l=en`, { timeout: 20000 }); iap = parseIAP(html); } catch { }
      return { cc: c.code, r, iap };
    });
    const ok = per.filter(p => p && p.r);
    if (!ok.length) throw new Error('App not found on the App Store');
    const ref = ok.find(p => p.cc === 'US') || ok[0];
    const item = { store: 'apple', id, title: ref.r.trackName, image: ref.r.artworkUrl512 || ref.r.artworkUrl100, kind: ref.r.price > 0 ? 'Paid app' : 'App' };
    const rows = [], plans = [];
    if (ref.r.price > 0) plans.push({ id: 'app', name: 'App purchase' });
    // Canonical IAP names = the ones seen in the most storefronts.
    const counts = new Map();
    for (const p of ok) for (const n of new Set(p.iap.map(i => norm(i.name)))) counts.set(n, (counts.get(n) || 0) + 1);
    const label = new Map();
    for (const p of ok) for (const i of p.iap) if (!label.has(norm(i.name))) label.set(norm(i.name), i.name);
    const top = [...counts].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n]) => n);
    for (const n of top) plans.push({ id: 'iap:' + n, name: label.get(n), note: 'In-app purchase (Apple lists the top IAPs; if a name appears twice, e.g. monthly + yearly, the lowest price is used)' });
    for (const p of ok) {
      const url = `https://apps.apple.com/${p.cc.toLowerCase()}/app/id${id}`;
      if (ref.r.price > 0 && p.r.price > 0) rows.push({ cc: p.cc, plan: 'app', amount: p.r.price, currency: p.r.currency, text: p.r.formattedPrice, url, method: 'store-param' });
      for (const n of top) {
        const hits = p.iap.filter(i => norm(i.name) === n).map(i => ({ i, pp: parsePrice(i.price, p.r.currency) })).filter(h => h.pp);
        if (!hits.length) continue;
        hits.sort((a, b) => a.pp.amount - b.pp.amount);
        // App Store lists IAPs in the storefront currency.
        rows.push({ cc: p.cc, plan: 'iap:' + n, amount: hits[0].pp.amount, currency: p.r.currency, text: hits[0].i.price, url, method: 'store-param' });
      }
    }
    if (!plans.length) plans.push({ id: 'app', name: 'Free app (no paid tiers found)' });
    return { item, plans, rows, source: 'Apple iTunes Lookup API + App Store web pages (per storefront)', sourceUrl: `https://apps.apple.com/us/app/id${id}`, checkedAt: new Date().toISOString() };
  });
}
module.exports = { search, prices, parseIAP };
