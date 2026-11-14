// Netflix shows plan prices only to visitors inside each country (by IP), with no public feed.
// We read its official help page "Plans and Pricing" (help.netflix.com/node/24926) through a free
// proxy in each country (lib/geofetch.js), verify the exit country, and parse the plan lines.
const { cached, byCode, parsePrice, get } = require('./util');
const { geoGet } = require('./geofetch');
const URL_ = 'https://help.netflix.com/en/node/24926';
const COUNTRIES = ['US', 'CA', 'GB', 'DE', 'FR', 'ES', 'IT', 'PL', 'TR', 'IN', 'PK', 'BR', 'MX', 'AR', 'CO', 'EG', 'NG', 'ZA', 'PH', 'ID', 'JP', 'KR', 'AU'];
const results = new Map(); // cc -> { at, plans|error, method }
let running = false, selfCC = null;

function parse(html, cc) {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'");
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const plans = [];
  for (let i = 1; i < lines.length; i++) {
    const name = lines[i - 1].replace(/:$/, ''), l = lines[i];
    if (!/^(Standard with ads|Basic with ads|Basic|Standard|Premium|Mobile)$/i.test(name)) continue;
    if (!/^:/.test(l) && !/^\S*\d/.test(l)) continue;
    const pp = parsePrice(l.replace(/^:\s*/, '').split('/')[0], byCode[cc]?.currency);
    if (pp && !plans.find(p => p.name === name)) plans.push({ name, ...pp, text: l.replace(/^:\s*/, '') });
  }
  return plans;
}

async function one(cc) {
  if (!selfCC) { try { const { body } = await get('https://www.cloudflare.com/cdn-cgi/trace'); selfCC = (body.match(/loc=([A-Z]{2})/) || [])[1]; } catch { } }
  let html, method;
  if (cc === selfCC) { html = (await get(URL_)).body; method = 'direct'; }
  else { const r = await geoGet(cc, URL_); html = r.body; method = 'free-proxy (' + r.via + ')'; }
  const plans = parse(html, cc);
  if (!plans.length) throw new Error('page loaded but no plan prices listed');
  return { plans, method };
}

function refresh() {
  if (running) return; running = true;
  const todo = COUNTRIES.filter(cc => { const r = results.get(cc); return !r || Date.now() - r.at > (r.plans ? 24 : 1) * 3600e3; });
  let i = 0;
  Promise.all(Array.from({ length: 4 }, async () => {
    while (i < todo.length) { const cc = todo[i++]; try { results.set(cc, { at: Date.now(), ...(await one(cc)) }); } catch (e) { results.set(cc, { at: Date.now(), error: e.message }); } }
  })).finally(() => { running = false; });
}

async function prices() {
  refresh();
  const rows = [], names = new Set(), status = {};
  for (const cc of COUNTRIES) {
    const r = results.get(cc);
    status[cc] = !r ? 'pending' : r.plans ? 'ok' : 'failed: ' + r.error;
    for (const p of (r && r.plans) || []) { names.add(p.name); rows.push({ cc, plan: p.name.toLowerCase(), amount: p.amount, currency: p.currency, text: p.text, url: URL_, method: r.method, at: r.at }); }
  }
  const order = ['standard with ads', 'standard', 'premium', 'basic', 'basic with ads', 'mobile'];
  const plans = [...names].map(n => ({ id: n.toLowerCase(), name: n })).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return {
    item: { store: 'netflix', id: 'plans', title: 'Netflix', image: 'https://assets.nflxext.com/us/ffe/siteui/common/icons/nficon2016.png', kind: 'Subscription' },
    plans: plans.length ? plans : [{ id: 'standard', name: 'Standard' }], rows, pending: running || Object.values(status).includes('pending'), status,
    source: "Netflix Help Center 'Plans and Pricing', loaded from inside each country via free proxies", sourceUrl: URL_, checkedAt: new Date().toISOString()
  };
}
module.exports = { prices, parse, one };
