const fs = require('fs'), path = require('path');
const { COUNTRIES, byCode } = require('./util');
const netflix = require('./netflix'), gplay = require('./gplay'), vpngate = require('./vpngate');
const steam = require('./steam'), apple = require('./apple'), msstore = require('./msstore'), spotify = require('./spotify');
const fx = require('./fx'), ai = require('./ai');
const { SHORTCUTS, NOT_LIVE, RULES, VPNS, METHODS } = require('./catalog');
const SOURCES = { steam, apple, msstore, spotify, netflix, gplay };

const FILLER = /\b(what'?s|whats|is|are|the|a|an|cheapest|cheaper|cheap|lowest|best|price|prices|pricing|cost|costs|of|for|somewhere|anywhere|country|countries|region|regional|in|where|can|i|get|buy|find|me|deal|deals|vpn|with|plan|subscription|sub|monthly|please|how|much|does|do|it|to|from|which|on|via|using|game|app)\b/gi;

function rules(q) {
  for (const s of SHORTCUTS) if (s.re.test(q)) {
    let plan = '';
    for (const [w, p] of Object.entries(s.planHints || {})) if (new RegExp('\\b' + w + '\\b', 'i').test(q)) { plan = p; break; }
    return { shortcut: s, plan };
  }
  return null;
}
const clean = q => q.replace(/[?!.,]/g, ' ').replace(FILLER, ' ').replace(/\s+/g, ' ').trim();

async function ask(q) {
  q = String(q || '').slice(0, 200).trim();
  if (!q) throw new Error('Type what you want to buy.');
  const low = q.toLowerCase();
  const notLive = Object.entries(NOT_LIVE).find(([k]) => low.includes(k));
  const r = rules(q);
  let intent;
  if (r) intent = { term: r.shortcut.title, store: r.shortcut.store, plan: r.plan, via: 'rules' };
  else {
    const c = clean(q);
    const wordy = q.split(/\s+/).length > 3;
    if (wordy) { try { intent = { ...(await ai.parse(q)), via: 'ai' }; } catch { } }
    if (!intent || !intent.term) intent = { term: c || q, store: 'any', plan: '', via: 'rules' };
    const hints = [[/\b(android|google play|play store)\b/i, 'gplay'], [/\b(iphone|ipad|ios|app store|mac)\b/i, 'apple'], [/\b(xbox|microsoft store)\b/i, 'msstore'], [/\b(steam|pc)\b/i, 'steam']];
    for (const [re, st] of hints) if (re.test(q)) { intent.store = st; intent.term = intent.term.replace(new RegExp(re.source, 'gi'), ' ').replace(/\s+/g, ' ').trim() || intent.term; break; }
    const r2 = rules(intent.term); // AI may normalise to a known subscription
    if (r2) intent = { ...intent, term: r2.shortcut.title, store: r2.shortcut.store, plan: intent.plan || r2.plan, shortcut: r2.shortcut };
  }
  const sc = r ? r.shortcut : intent.shortcut;
  const candidates = [];
  if (sc) candidates.push({ store: sc.store, id: sc.id, title: sc.title, image: sc.image, sub: { netflix: 'Netflix plans (loaded from inside each country)', spotify: 'Spotify plans', msstore: 'Microsoft / Xbox subscription', apple: 'App Store in-app subscriptions' }[sc.store], plan: intent.plan, pinned: true });
  if (!sc || sc.store === 'apple') {
    const all = ['steam', 'apple', 'msstore', 'gplay'];
    const order = all.includes(intent.store) ? [intent.store, ...all.filter(s => s !== intent.store)] : all;
    const results = await Promise.all(order.filter(s => SOURCES[s].search).map(s => SOURCES[s].search(intent.term).catch(() => [])));
    for (const list of results) for (const c of list.slice(0, 4)) if (!candidates.find(x => x.store === c.store && x.id === c.id)) candidates.push(c);
  }
  delete intent.shortcut;
  return { q, intent, candidates: candidates.slice(0, 12), notLive: notLive ? notLive[1] : null };
}

async function prices(store, id) {
  const src = SOURCES[store]; if (!src) throw new Error('Unknown store');
  const [data, rates] = await Promise.all([src.prices(id), fx.rates()]);
  return { ...data, fx: rates, rule: RULES[store], countries: byCode };
}

function fallbackExplain(c) {
  const b = c.cheapest, h = c.home;
  let t = `Cheapest listed price for ${c.title}${c.plan ? ' (' + c.plan + ')' : ''} is in ${b.country}: ${b.local} (about ${b.converted}).`;
  if (h) t += c.saving > 0 ? ` That's about ${c.savingText} (${c.savingPct}%) less than ${h.country} at ${h.local}.` : ` Your home price in ${h.country} (${h.local}) is already about as low as it gets.`;
  else t += ` It isn't sold in your home country's store, so compare against the next cheapest region.`;
  t += ' ' + (c.rule?.text || '') + ' To actually pay: ' + (c.rule?.pay || 'a payment method from that country') + '.';
  t += ' Buying from another region with a VPN can break the store\'s terms and get the account flagged or the purchase revoked.';
  return t;
}


const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const PUB = path.join(__dirname, '..', 'public');
const J = (status, obj) => ({ status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });

// Platform-neutral request handler: used by server.js (Node http, Render) and index.mjs (fetch handler, Neon Functions).
async function handle(method, url, readBody) {
  const u = new URL(url, 'http://x');
  try {
    if (u.pathname === '/health') return J(200, { ok: true });
    if (u.pathname === '/api/meta') return J(200, { countries: COUNTRIES, vpns: VPNS, methods: METHODS, ai: ai.llmInfo, fx: await fx.rates().catch(() => null) });
    if (u.pathname === '/api/ask') return J(200, await ask(u.searchParams.get('q')));
    if (u.pathname === '/api/prices') return J(200, await prices(u.searchParams.get('store'), u.searchParams.get('id')));
    if (u.pathname === '/api/explain' && method === 'POST') {
      const c = JSON.parse((await readBody()).slice(0, 20000) || '{}');
      try { return J(200, { text: await ai.explain(c), via: 'ai' }); }
      catch { return J(200, { text: fallbackExplain(c), via: 'rules' }); }
    }
    if (u.pathname === '/api/tunnels') return J(200, await vpngate.summary());
    if (u.pathname === '/api/tunnels/config') { const c = await vpngate.config(u.searchParams.get('ip')); return { status: 200, headers: { 'Content-Type': 'application/x-openvpn-profile', 'Content-Disposition': `attachment; filename="${c.name}"` }, body: c.text }; }
    if (u.pathname.startsWith('/api/')) return J(404, { error: 'Not found' });
    let f = path.join(PUB, path.normalize(u.pathname === '/' ? '/index.html' : u.pathname));
    if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUB, 'index.html');
    return { status: 200, headers: { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=300' }, body: fs.readFileSync(f) };
  } catch (e) { console.log('err', u.pathname, e.message); return J(500, { error: e.message || 'Something went wrong' }); }
}
function warm() { netflix.prices().catch(() => { }); vpngate.summary().catch(() => { }); spotify.prices().catch(() => { }); msstore.prices('CFQ7TTC0KHS0').catch(() => { }); fx.rates().catch(() => { }); }
module.exports = { handle, warm };
