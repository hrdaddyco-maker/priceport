// Google Play: the public app page honours ?gl=<country>, and embeds [micros,"CUR","formatted"] for the price.
const { get, cached, pool, COUNTRIES } = require('./util');
async function search(q) {
  return cached('gp:s:' + q.toLowerCase(), 12 * 3600e3, async () => {
    const { body } = await get(`https://play.google.com/store/search?q=${encodeURIComponent(q)}&c=apps&gl=us&hl=en`);
    const ids = [...new Set([...body.matchAll(/\/store\/apps\/details\?id=([\w.]+)/g)].map(m => m[1]))].slice(0, 4);
    return ids.map(id => {
      const i = body.indexOf('details?id=' + id); const seg = body.slice(i, i + 3000);
      const title = ([...seg.matchAll(/<span class="[^"]*">([^<]{2,80})<\/span>/g)].map(m => m[1]).find(t => !/^(In-app purchases|Contains ads|Editors' Choice|\d|Install)/i.test(t))) || id;
      const nice = title === id ? id.split('.').pop().replace(/^./, c => c.toUpperCase()) : title.replace(/&amp;/g, '&');
      return { store: 'gplay', id, title: nice, sub: 'Google Play · ' + id };
    });
  });
}
function parse(html) {
  const m = html.match(/\[(\d{4,}),"([A-Z]{3})","([^"]{1,30})"\]/);
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/) || [])[1] || '';
  const img = (html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1] || '';
  return { price: m ? { amount: +m[1] / 1e6, currency: m[2], text: m[3] } : null, title: title.replace(/ - Apps on Google Play$/, '').replace(/&amp;/g, '&'), img };
}
async function prices(id) {
  id = String(id).replace(/[^\w.]/g, '');
  return cached('gp:p:' + id, 6 * 3600e3, async () => {
    let item = null;
    const rows = (await pool(COUNTRIES, 6, async c => {
      const url = `https://play.google.com/store/apps/details?id=${id}&gl=${c.code.toLowerCase()}&hl=en`;
      const { body } = await get(url); const p = parse(body);
      if (!item && p.title) item = { store: 'gplay', id, title: p.title, image: p.img, kind: 'Android app' };
      return p.price ? { cc: c.code, plan: 'app', ...p.price, url, method: 'store-param (gl)' } : null;
    })).filter(r => r && r.amount);
    if (!item) throw new Error('Google Play app not found');
    return { item, plans: [{ id: 'app', name: rows.length ? 'App purchase' : 'Free app (no price)' }], rows, source: 'Google Play app pages (?gl=<country>)', sourceUrl: `https://play.google.com/store/apps/details?id=${id}`, checkedAt: new Date().toISOString() };
  });
}
module.exports = { search, prices };
