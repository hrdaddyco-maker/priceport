// Shared helpers: fetch with timeout, TTL cache, concurrency pool, price parsing, countries.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

async function get(url, opts = {}) {
  for (let i = 0; ; i++) {
    try { return await get1(url, opts); }
    catch (e) { if (i >= 1 || (e.status && e.status < 429 && e.status !== 408)) throw e; await new Promise(r => setTimeout(r, 1200)); }
  }
}
async function get1(url, { json = false, timeout = 15000, headers = {} } = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en', ...headers }, signal: AbortSignal.timeout(timeout), redirect: 'follow' });
  if (!r.ok) { const e = new Error('HTTP ' + r.status + ' ' + url); e.status = r.status; throw e; }
  return { body: json ? await r.json() : await r.text(), url: r.url };
}

const store = new Map();
async function cached(key, ttlMs, fn) {
  const hit = store.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  if (hit && hit.pending) return hit.pending;
  const pending = fn().then(val => { store.set(key, { val, exp: Date.now() + ttlMs }); return val; })
    .catch(e => { store.delete(key); throw e; });
  store.set(key, { pending, exp: 0 });
  return pending;
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = { error: String(e.message || e) }; } }
  }));
  return out;
}

// Countries we check. Currency = the local currency (stores may still bill in USD; we use what the store reports).
const COUNTRIES = [
  ['US','United States','USD'],['CA','Canada','CAD'],['MX','Mexico','MXN'],['BR','Brazil','BRL'],['AR','Argentina','ARS'],
  ['CL','Chile','CLP'],['CO','Colombia','COP'],['PE','Peru','PEN'],['GB','United Kingdom','GBP'],['IE','Ireland','EUR'],
  ['DE','Germany','EUR'],['FR','France','EUR'],['ES','Spain','EUR'],['IT','Italy','EUR'],['NL','Netherlands','EUR'],
  ['PL','Poland','PLN'],['SE','Sweden','SEK'],['NO','Norway','NOK'],['DK','Denmark','DKK'],['CH','Switzerland','CHF'],
  ['CZ','Czechia','CZK'],['HU','Hungary','HUF'],['RO','Romania','RON'],['TR','Türkiye','TRY'],['UA','Ukraine','UAH'],
  ['KZ','Kazakhstan','KZT'],['IL','Israel','ILS'],['AE','UAE','AED'],['SA','Saudi Arabia','SAR'],['EG','Egypt','EGP'],
  ['NG','Nigeria','NGN'],['KE','Kenya','KES'],['ZA','South Africa','ZAR'],['IN','India','INR'],['PK','Pakistan','PKR'],
  ['BD','Bangladesh','BDT'],['ID','Indonesia','IDR'],['MY','Malaysia','MYR'],['PH','Philippines','PHP'],['TH','Thailand','THB'],
  ['VN','Vietnam','VND'],['SG','Singapore','SGD'],['HK','Hong Kong','HKD'],['TW','Taiwan','TWD'],['JP','Japan','JPY'],
  ['KR','South Korea','KRW'],['CN','China','CNY'],['AU','Australia','AUD'],['NZ','New Zealand','NZD']
].map(([code, name, currency]) => ({ code, name, currency }));
const byCode = Object.fromEntries(COUNTRIES.map(c => [c.code, c]));

const SYMBOLS = [['US$','USD'],['CA$','CAD'],['C$','CAD'],['A$','AUD'],['NZ$','NZD'],['HK$','HKD'],['NT$','TWD'],['S$','SGD'],['R$','BRL'],['MX$','MXN'],
  ['€','EUR'],['£','GBP'],['₺','TRY'],['₹','INR'],['₦','NGN'],['₩','KRW'],['₫','VND'],['₱','PHP'],['฿','THB'],['₪','ILS'],['₴','UAH'],['₸','KZT'],['zł','PLN'],['Rp','IDR'],['RM','MYR'],['Kč','CZK'],['Ft','HUF'],['৳','BDT']];
const ISO = new Set(['USD','CAD','MXN','BRL','ARS','CLP','COP','PEN','GBP','EUR','PLN','SEK','NOK','DKK','CHF','CZK','HUF','RON','TRY','UAH','KZT','ILS','AED','SAR','EGP','NGN','KES','ZAR','INR','PKR','BDT','IDR','MYR','PHP','THB','VND','SGD','HKD','TWD','JPY','KRW','CNY','AUD','NZD','LKR','QAR','KWD']);

// Parse a store-formatted price like "₺5.299,99", "R$23.90", "EGP 79", "$12.99". fallbackCur = the store's currency for that country.
function parsePrice(text, fallbackCur) {
  if (!text) return null;
  const t = String(text).replace(/\u00a0|\u202f/g, ' ');
  let cur = null;
  const iso = t.match(/\b([A-Z]{3})\b/);
  if (iso && ISO.has(iso[1])) cur = iso[1];
  if (!cur) for (const [s, c] of SYMBOLS) if (t.includes(s)) { cur = c; break; }
  if (!cur) cur = fallbackCur || null;
  const m = t.match(/\d[\d.,' ]*\d|\d/);
  if (!m) return null;
  let n = m[0].replace(/[' ]/g, '');
  const lastSep = Math.max(n.lastIndexOf('.'), n.lastIndexOf(','));
  if (lastSep >= 0) {
    const dec = n.length - lastSep - 1;
    const intPart = n.slice(0, lastSep).replace(/[.,]/g, '');
    n = (dec === 1 || dec === 2) ? intPart + '.' + n.slice(lastSep + 1) : intPart + n.slice(lastSep + 1);
  }
  let amount = parseFloat(n);
  const after = t.slice(t.indexOf(m[0]) + m[0].length).toLowerCase();
  if (/^\s*(ribu|rb\b|k\b|mil\b|nghìn|ngàn)/.test(after)) amount *= 1e3;
  else if (/^\s*(juta|jt\b|m\b|tr\b|triệu)/.test(after)) amount *= 1e6;
  else if (/^\s*万/.test(after)) amount *= 1e4;
  return isFinite(amount) ? { amount, currency: cur } : null;
}

module.exports = { get, cached, pool, COUNTRIES, byCode, parsePrice, UA };
