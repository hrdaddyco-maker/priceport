const { get, cached, pool, COUNTRIES } = require('./util');
const H12 = 12 * 3600e3;

async function search(q) {
  return cached('ms:s:' + q.toLowerCase(), H12, async () => {
    const out = [];
    for (const fam of ['Passes', 'Games']) {
      const { body } = await get(`https://displaycatalog.mp.microsoft.com/v7.0/productFamilies/autosuggest?market=US&languages=en-us&query=${encodeURIComponent(q)}&productFamilyNames=${fam}`, { json: true }).catch(() => ({ body: {} }));
      for (const r of body.Results || []) for (const p of r.Products || []) {
        if (out.find(o => o.id === p.ProductId)) continue;
        out.push({ store: 'msstore', id: p.ProductId, title: p.Title, image: p.Icon ? 'https:' + p.Icon : '', sub: p.Type === 'PASS' ? 'Microsoft / Xbox subscription' : 'Xbox / PC game' });
      }
    }
    return out.slice(0, 6);
  });
}

function extract(prod) {
  const skus = [];
  for (const dsa of prod.DisplaySkuAvailabilities || []) {
    const lp = dsa.Sku?.LocalizedProperties?.[0] || {}; const title = (lp.SkuButtonTitle && lp.SkuButtonTitle !== lp.SkuTitle && !/^none$/i.test(lp.SkuButtonTitle)) ? lp.SkuTitle + ' – ' + lp.SkuButtonTitle : (lp.SkuTitle || 'Standard');
    if (/trial/i.test(title)) continue;
    for (const a of dsa.Availabilities || []) {
      const pr = a.OrderManagementData?.Price;
      if (!pr || !(a.Actions || []).includes('Purchase') || !(pr.ListPrice > 0)) continue;
      if (/trial/i.test(JSON.stringify(a.Properties || {})) && pr.ListPrice < 2) continue;
      if (!skus.find(s => s.id === dsa.Sku.SkuId)) skus.push({ id: dsa.Sku.SkuId, name: title, amount: pr.ListPrice, msrp: pr.MSRP, currency: pr.CurrencyCode });
    }
  }
  return skus;
}

async function prices(id) {
  id = String(id).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return cached('ms:p:' + id, 6 * 3600e3, async () => {
    let item = null; const plans = new Map();
    const rows = [];
    await pool(COUNTRIES, 6, async c => {
      const { body } = await get(`https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${id}&market=${c.code}&languages=en-us`, { json: true });
      const p = body.Products?.[0]; if (!p) return { cc: c.code, unavailable: true };
      if (!item) { const lp = p.LocalizedProperties?.[0] || {}; const img = (lp.Images || []).find(i => /BoxArt|Poster|Logo|Tile/i.test(i.ImagePurpose)); item = { store: 'msstore', id, title: lp.ProductTitle, image: img ? 'https:' + img.Uri.replace(/^https?:/, '') : '', kind: /pass/i.test(p.ProductType) ? 'Subscription' : 'Game' }; }
      for (const s of extract(p)) {
        if (!plans.has(s.id)) plans.set(s.id, s.name);
        rows.push({ cc: c.code, plan: s.id, amount: s.amount, currency: s.currency, text: `${s.amount} ${s.currency}`, url: `https://www.microsoft.com/${'en-' + c.code.toLowerCase()}/store/p/${id}` });
      }
    });
    if (!item) throw new Error('Microsoft Store product not found');
    // Prefer plans present in most countries first.
    const count = id => rows.filter(r => r.plan === id).length;
    const planList = [...plans].map(([pid, name]) => ({ id: pid, name })).sort((a, b) => count(b.id) - count(a.id));
    return { item, plans: planList, rows, source: 'Microsoft Store catalog (displaycatalog, per-market)', sourceUrl: `https://www.xbox.com/en-US/xbox-game-pass`, checkedAt: new Date().toISOString() };
  });
}
module.exports = { search, prices };
