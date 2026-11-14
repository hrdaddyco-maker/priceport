const { get, cached, pool, COUNTRIES } = require('./util');
const H12 = 12 * 3600e3;

async function search(q) {
  return cached('steam:s:' + q.toLowerCase(), H12, async () => {
    const { body } = await get(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&cc=us&l=en`, { json: true });
    return (body.items || []).filter(i => i.type === 'app').slice(0, 5).map(i => ({ store: 'steam', id: String(i.id), title: i.name, image: i.tiny_image, sub: 'Steam game' }));
  });
}

async function prices(id) {
  id = String(id).replace(/\D/g, '');
  return cached('steam:p:' + id, 6 * 3600e3, async () => {
    const { body: info } = await get(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=us&l=en&filters=basic`, { json: true });
    const d = info[id]?.data; if (!d) throw new Error('Steam app not found');
    const rows = (await pool(COUNTRIES, 4, async c => {
      const { body } = await get(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=${c.code}&filters=price_overview`, { json: true });
      const r = body[id]; if (!r?.success) return { cc: c.code, unavailable: true };
      const p = r.data?.price_overview; if (!p) return { cc: c.code, unavailable: true, free: Array.isArray(r.data) };
      return { cc: c.code, plan: 'game', amount: p.final / 100, currency: p.currency, text: p.final_formatted, discount: p.discount_percent || 0, url: `https://store.steampowered.com/app/${id}/?cc=${c.code}`, method: 'store-param' };
    })).filter(Boolean);
    return {
      item: { store: 'steam', id, title: d.name, image: d.header_image, kind: d.is_free ? 'Free to play' : 'Game' },
      plans: [{ id: 'game', name: 'Base game' }], rows, source: 'Steam store API (appdetails, per-country cc)', sourceUrl: `https://store.steampowered.com/app/${id}/`, checkedAt: new Date().toISOString()
    };
  });
}
module.exports = { search, prices };
