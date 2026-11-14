const { get, cached, pool, COUNTRIES, parsePrice } = require('./util');

const PATH = { US: ['us'], GB: ['uk'], JP: ['jp'], KR: ['kr-en', 'kr'], HU: ['hu'], PE: ['pe'], CH: ['ch-de', 'ch-fr'] };
function planKey(header) {
  const h = header.toLowerCase();
  if (/student|estudiant|étudiant|studenten|studente/.test(h)) return 'student';
  if (/duo/.test(h)) return 'duo';
  if (/family|famil/.test(h)) return 'family';
  if (/individual|individuel|personnel|standard|einzel/.test(h)) return 'individual';
  if (/lite/.test(h)) return 'lite';
  if (/platinum/.test(h)) return 'platinum';
  if (/basic/.test(h)) return 'basic';
  return h.replace(/^premium\s*/, '').trim() || 'premium';
}
const NAMES = { individual: 'Premium Individual', duo: 'Premium Duo', family: 'Premium Family', student: 'Premium Student', lite: 'Premium Lite', platinum: 'Premium Platinum', basic: 'Basic' };

async function country(c) {
  const tries = PATH[c.code] || [c.code.toLowerCase() + '-en', c.code.toLowerCase()];
  for (const p of tries) {
    let res; try { res = await get(`https://www.spotify.com/${p}/premium/`); } catch { continue; }
    if (!new RegExp(`spotify\\.com/${p}/premium`).test(res.url)) continue;
    const m = res.body.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) continue;
    const d = JSON.parse(m[1]);
    const plans = [];
    for (const comp of d.props?.pageProps?.components || []) for (const pl of (comp && typeof comp === 'object' && Array.isArray(comp.attributes?.plans)) ? comp.attributes.plans : []) {
      if (!pl || typeof pl !== 'object' || !pl.header) continue;
      const priceText = [pl.secondaryPriceDescription, pl.primaryPriceDescription, pl.subheaderPrice].find(t => t && /\d/.test(t) && !/^free/i.test(t));
      const pp = parsePrice(priceText && priceText.split('/')[0], c.currency);
      if (!pp) continue;
      const key = planKey(pl.header);
      if (!plans.find(x => x.key === key)) plans.push({ key, header: pl.header, ...pp, text: priceText });
    }
    if (plans.length) return { cc: c.code, url: res.url, plans };
  }
  return { cc: c.code, unavailable: true };
}

async function prices() {
  return cached('spotify', 12 * 3600e3, async () => {
    const per = await pool(COUNTRIES.filter(c => c.code !== 'CN'), 6, country);
    const rows = [];
    for (const p of per) if (p && p.plans) for (const pl of p.plans) rows.push({ cc: p.cc, plan: pl.key, amount: pl.amount, currency: pl.currency, text: pl.text + (NAMES[pl.key] !== pl.header ? ` (${pl.header})` : ''), url: p.url, method: 'regional-page' });
    if (!rows.length) throw new Error('Spotify pages could not be read right now');
    const order = ['individual', 'family', 'duo', 'student', 'lite', 'platinum', 'basic'];
    const keys = [...new Set(rows.map(r => r.plan))].sort((a, b) => (order.indexOf(a) + 99) % 99 - (order.indexOf(b) + 99) % 99);
    return {
      item: { store: 'spotify', id: 'premium', title: 'Spotify Premium', image: 'https://storage.googleapis.com/pr-newsroom-wp/1/2023/05/Spotify_Primary_Logo_RGB_Green.png', kind: 'Subscription' },
      plans: keys.map(k => ({ id: k, name: NAMES[k] || k })), rows,
      source: "Spotify's official Premium pages (spotify.com/<country>/premium)", sourceUrl: 'https://www.spotify.com/us/premium/', checkedAt: new Date().toISOString()
    };
  });
}
module.exports = { prices };
