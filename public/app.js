const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let META = null, HOME = localStorage.getItem('pp_home') || 'CA', CUR = null, ACTIVE = null;
const EX = ['Cheapest Spotify Family', 'Is Elden Ring cheaper somewhere?', 'Xbox Game Pass Ultimate', 'ChatGPT Plus', 'Cyberpunk 2077', 'Procreate Dreams', 'Duolingo Super'];
const flag = cc => `<img class="flag" src="https://flagcdn.com/w40/${cc.toLowerCase()}.png" alt="" loading="lazy">`;
const cname = cc => META?.countries.find(c => c.code === cc)?.name || cc;
const homeCur = () => META?.countries.find(c => c.code === HOME)?.currency || 'CAD';
function money(v, cur, digits) { try { return new Intl.NumberFormat('en', { style: 'currency', currency: cur, maximumFractionDigits: digits ?? (v >= 1000 ? 0 : 2) }).format(v); } catch { return v.toFixed(2) + ' ' + cur; } }
function conv(amount, from, fx) { const r = fx.rates, to = homeCur(); if (!r[from] || !r[to]) return null; return amount / r[from] * r[to]; }
async function api(url, opts) { const r = await fetch(url, opts); const j = await r.json().catch(() => ({ error: 'Bad response' })); if (!r.ok || j.error) throw new Error(j.error || 'Request failed'); return j; }
function status(html, err) { const el = $('#status'); if (!html) { el.hidden = true; return; } el.hidden = false; el.className = 'status' + (err ? ' err' : ''); el.innerHTML = (err ? '' : '<span class="spin"></span>') + `<span>${html}</span>`; }

async function init() {
  $('#chips').innerHTML = EX.map(e => `<button class="chip" type="button">${esc(e)}</button>`).join('');
  $('#chips').onclick = e => { if (e.target.classList.contains('chip')) { $('#q').value = e.target.textContent; search(e.target.textContent); } };
  $('#form').onsubmit = e => { e.preventDefault(); const q = $('#q').value.trim(); if (q) search(q); };
  document.querySelectorAll('.honestT,#honest2').forEach(el => el.innerHTML = $('#honestT').innerHTML);
  addEventListener('hashchange', route); route();
  META = await api('/api/meta');
  $('#home').innerHTML = META.countries.slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => `<option value="${c.code}" ${c.code === HOME ? 'selected' : ''}>${esc(c.name)} · ${c.currency}</option>`).join('');
  $('#home').onchange = () => { HOME = $('#home').value; localStorage.setItem('pp_home', HOME); if (ACTIVE) render(); renderWatch(); };
  $('#vpnList').innerHTML = META.vpns.map(v => `<li><div><b>${esc(v.name)}</b><p>${esc(v.why)}</p></div><a class="btn" href="${v.url}" target="_blank" rel="noopener">Visit site</a></li>`).join('');
  if (META.fx) $('#fxNote').textContent = `Exchange rates: ${META.fx.source}, updated ${META.fx.updated}.`;
  const q = new URLSearchParams(location.search).get('q'); if (q) { $('#q').value = q; search(q); }
  checkWatches();
}
function route() {
  const t = (location.hash.slice(1) || 'search').split('?')[0];
  const tab = ['search', 'watch', 'vpns', 'how'].includes(t) ? t : 'search';
  document.querySelectorAll('.tab').forEach(s => s.hidden = s.id !== 'tab-' + tab);
  document.querySelectorAll('[data-tab]').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  if (tab === 'watch') renderWatch();
}

async function search(q) {
  $('#go').disabled = true; $('#picker').hidden = true; $('#result').hidden = true;
  history.replaceState(null, '', '?q=' + encodeURIComponent(q) + location.hash);
  status('Reading your request…');
  try {
    const r = await api('/api/ask?q=' + encodeURIComponent(q));
    if (r.intent.home && r.intent.home !== HOME && META?.countries.some(c => c.code === r.intent.home)) { HOME = r.intent.home; localStorage.setItem('pp_home', HOME); $('#home').value = HOME; }
    let html = r.notLive ? `<div class="notlive"><b>Heads-up:</b> ${esc(r.notLive)}</div>` : '';
    if (!r.candidates.length) { status(''); $('#picker').hidden = false; $('#picker').innerHTML = html + `<div class="empty">No matches on Steam, the Microsoft Store, the App Store or Spotify for “${esc(r.intent.term)}”. Try the product's exact name.</div>`; return; }
    html += `<h3>${r.intent.via === 'ai' ? 'AI read this as' : 'Searching for'} “${esc(r.intent.term)}”${r.intent.plan ? ' · ' + esc(r.intent.plan) : ''}. Pick the exact product</h3><div class="cands">` +
      r.candidates.map((c, i) => `<button class="cand" data-i="${i}">${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy">` : '<span class="ph"></span>'}<div><b>${esc(c.title)}</b><small>${esc(c.sub || c.store)}</small></div></button>`).join('') + '</div>';
    $('#picker').innerHTML = html; $('#picker').hidden = false;
    $('#picker').querySelectorAll('.cand').forEach(b => b.onclick = () => { $('#picker').querySelectorAll('.cand').forEach(x => x.classList.remove('on')); b.classList.add('on'); load(r.candidates[+b.dataset.i]); });
    $('#picker').querySelector('.cand').click();
  } catch (e) { status(esc(e.message), true); }
  finally { $('#go').disabled = false; }
}

async function load(c) {
  $('#result').hidden = true;
  status(`Checking ${esc(c.title)} in 49 countries… ${c.store === 'apple' ? '(the App Store takes ~15–30 s the first time)' : ''}`);
  try {
    const d = await api(`/api/prices?store=${c.store}&id=${encodeURIComponent(c.id)}`);
    let plan = d.plans[0]?.id;
    if (c.plan) { const h = c.plan.toLowerCase(); const m = d.plans.find(p => p.id.toLowerCase() === h || p.id.toLowerCase().includes(h) || p.name.toLowerCase().includes(h)); if (m) plan = m.id; }
    ACTIVE = { c, d, plan, showAll: false };
    status(''); render();
    $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { status('Could not load prices: ' + esc(e.message), true); }
}

function computeRows(d, plan) {
  const rows = d.rows.filter(r => r.plan === plan).map(r => ({ ...r, home: conv(r.amount, r.currency, d.fx) })).filter(r => r.home != null && r.home > 0).sort((a, b) => a.home - b.home);
  // Guard against a store label we misread (e.g. abbreviated "349rb"): drop anything below 8% of the median.
  const med = rows.length ? rows[Math.floor(rows.length / 2)].home : 0;
  return rows.filter(r => rows.length < 5 || r.home >= med * 0.08);
}

function render() {
  const { d, plan } = ACTIVE, cur = homeCur();
  const rows = computeRows(d, plan), planObj = d.plans.find(p => p.id === plan) || {};
  const best = rows[0], homeRow = rows.find(r => r.cc === HOME), max = rows[rows.length - 1]?.home || 1;
  const saving = best && homeRow ? homeRow.home - best.home : 0, pct = homeRow && saving > 0 ? Math.round(saving / homeRow.home * 100) : 0;
  const wkey = `${d.item.store}:${d.item.id}:${plan}`, watched = getWatch().some(w => w.key === wkey);
  const shown = ACTIVE.showAll ? rows : rows.filter((r, i) => i < 12 || r.cc === HOME);
  const el = $('#result'); el.hidden = false;
  el.innerHTML = `<div class="panel">
    <div class="p-head">${d.item.image ? `<img src="${esc(d.item.image)}" alt="">` : ''}<div><h2>${esc(d.item.title)}</h2><div class="meta">${esc(d.item.kind || '')} · ${rows.length} countries priced · prices in ${cur}</div></div>
      <div class="actions"><button class="ghost ${watched ? 'on' : ''}" id="watchBtn">${watched ? '★ Watching' : '☆ Watch price'}</button><button class="ghost" id="shareBtn">Copy link</button></div></div>
    ${d.plans.length > 1 ? `<div class="plans">${d.plans.map(p => `<button class="plan ${p.id === plan ? 'on' : ''}" data-p="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</div>` : ''}
    ${!best ? `<div class="empty" style="margin:18px 22px">No prices found for this ${d.plans.length > 1 ? 'plan' : 'item'} in the countries we check.${d.item.kind === 'App' ? ' It may be a free app with no listed in-app prices.' : ''}</div>` : `
    <div class="summary">
      <div class="stat best"><div class="k">Cheapest</div><div class="v ctry">${flag(best.cc)} ${esc(cname(best.cc))}</div><div class="s">${esc(best.text)} ≈ <b>${money(best.home, cur)}</b></div></div>
      <div class="stat"><div class="k">Your price (${esc(cname(HOME))})</div><div class="v">${homeRow ? money(homeRow.home, cur) : '—'}</div><div class="s">${homeRow ? esc(homeRow.text) + ' · rank ' + (rows.indexOf(homeRow) + 1) + ' of ' + rows.length : 'Not sold in your country store'}</div></div>
      <div class="stat save"><div class="k">You could save</div><div class="v">${saving > 0 ? money(saving, cur) : '—'}</div><div class="s">${saving > 0 ? pct + '% less than at home' : homeRow ? 'Home is already cheapest' : 'Compare against cheapest region'}</div></div>
    </div>
    <div class="grid2">
      <div class="box"><h4>Verdict <span class="ai-tag" id="aiTag">AI</span></h4><div id="ai"><div class="skel" style="width:95%"></div><div class="skel" style="width:88%"></div><div class="skel" style="width:70%"></div></div></div>
      <div class="box"><h4>Does it work from abroad? <span class="pill ${esc(d.rule?.works)}">${esc(d.rule?.works || '')}</span></h4><p>${esc(d.rule?.text || '')}</p><p style="margin-top:8px"><b>To pay:</b> ${esc(d.rule?.pay || '')}</p></div>
    </div>
    <div class="honest">${$('#honestT').innerHTML}</div>
    <table class="tbl"><thead><tr><th>#</th><th>Country</th><th class="num hide-s">Local price</th><th class="num">In ${cur}</th><th class="num">vs home</th><th class="num hide-s">Store</th></tr></thead><tbody>
    ${shown.map(r => { const i = rows.indexOf(r) + 1, dlt = homeRow ? (r.home - homeRow.home) / homeRow.home * 100 : null; return `<tr class="${r.cc === HOME ? 'home' : ''}"><td class="rank">${i}</td><td><span class="ctry">${flag(r.cc)}<b>${esc(cname(r.cc))}</b></span><div class="bar"><i style="width:${Math.max(4, r.home / max * 100).toFixed(1)}%"></i></div></td><td class="num hide-s">${esc(r.text)}${r.discount ? ` <small class="delta neg">-${r.discount}%</small>` : ''}</td><td class="num"><b>${money(r.home, cur)}</b></td><td class="num delta ${dlt < -0.5 ? 'neg' : 'pos'}">${dlt == null ? '—' : r.cc === HOME ? 'home' : (dlt > 0 ? '+' : '') + Math.round(dlt) + '%'}</td><td class="num hide-s"><a class="open" href="${esc(r.url)}" target="_blank" rel="noopener">Open ↗</a></td></tr>`; }).join('')}
    </tbody></table>
    ${rows.length > shown.length ? `<button class="more" id="moreBtn">Show all ${rows.length} countries</button>` : ''}`}
    <div class="src">Source: <a href="${esc(d.sourceUrl)}" target="_blank" rel="noopener">${esc(d.source)}</a> · last checked ${new Date(d.checkedAt).toLocaleString()} · FX: ${esc(d.fx.source)} (${esc(d.fx.updated)})${planObj.note ? ' · ' + esc(planObj.note) : ''}</div>
  </div>`;
  el.querySelectorAll('.plan').forEach(b => b.onclick = () => { ACTIVE.plan = b.dataset.p; ACTIVE.showAll = false; render(); });
  $('#moreBtn') && ($('#moreBtn').onclick = () => { ACTIVE.showAll = true; render(); });
  $('#watchBtn').onclick = () => toggleWatch(best, planObj);
  $('#shareBtn').onclick = () => { navigator.clipboard?.writeText(location.href); $('#shareBtn').textContent = 'Copied'; };
  if (best) explain(d, planObj, rows, best, homeRow, saving, pct);
}

const explained = new Map();
async function explain(d, planObj, rows, best, homeRow, saving, pct) {
  const cur = homeCur(), key = [d.item.store, d.item.id, planObj.id, HOME].join('|');
  const ctx = { title: d.item.title, store: d.item.store, plan: planObj.name, homeCountry: cname(HOME), homeCurrency: cur,
    cheapest: { country: cname(best.cc), local: best.text, converted: money(best.home, cur) },
    home: homeRow ? { country: cname(HOME), local: homeRow.text, converted: money(homeRow.home, cur) } : null,
    saving: Math.round(saving * 100) / 100, savingText: money(saving, cur), savingPct: pct,
    nextCheapest: rows.slice(1, 5).map(r => ({ country: cname(r.cc), converted: money(r.home, cur) })), rule: d.rule };
  let out = explained.get(key);
  if (!out) { try { out = await api('/api/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ctx) }); explained.set(key, out); } catch { out = { text: 'AI verdict unavailable right now. The ranking and rules here still apply.', via: 'rules' }; } }
  if (!ACTIVE || ACTIVE.d !== d || ACTIVE.plan !== planObj.id) return;
  $('#ai').innerHTML = `<p>${esc(out.text)}</p>`;
  $('#aiTag').textContent = out.via === 'ai' ? 'AI' : 'Auto';
}

// ---- Watch (in-app price-drop flags, saved on this device) ----
const getWatch = () => { try { return JSON.parse(localStorage.getItem('pp_watch') || '[]'); } catch { return []; } };
const setWatch = w => { localStorage.setItem('pp_watch', JSON.stringify(w)); badge(); };
function toggleWatch(best, planObj) {
  const { d, plan, c } = ACTIVE, key = `${d.item.store}:${d.item.id}:${plan}`; let w = getWatch();
  if (w.some(x => x.key === key)) w = w.filter(x => x.key !== key);
  else if (best) w.unshift({ key, store: d.item.store, id: d.item.id, plan, planName: planObj.name || '', title: d.item.title, image: d.item.image, base: { amount: best.amount, currency: best.currency, cc: best.cc }, last: { amount: best.amount, currency: best.currency, cc: best.cc }, added: Date.now(), checked: Date.now(), drop: false });
  setWatch(w); render();
}
function badge() { const n = getWatch().filter(w => w.drop).length; for (const b of [$('#watchBadge'), $('.mbadge')]) { b.hidden = !n; b.textContent = n; } }
async function checkWatches() {
  badge(); const w = getWatch(); if (!w.length) return;
  for (const x of w) {
    if (Date.now() - (x.checked || 0) < 30 * 60e3 && x.lastHome) continue;
    try {
      const d = await api(`/api/prices?store=${x.store}&id=${encodeURIComponent(x.id)}`);
      const rows = d.rows.filter(r => r.plan === x.plan).map(r => ({ ...r, usd: r.amount / d.fx.rates[r.currency] })).filter(r => isFinite(r.usd)).sort((a, b) => a.usd - b.usd);
      if (!rows.length) continue;
      const b = rows[0], baseUsd = x.base.amount / d.fx.rates[x.base.currency];
      // A drop = the cheapest local price fell (same store currency), not just currency noise.
      const sameCountry = rows.find(r => r.cc === x.base.cc);
      x.drop = (sameCountry && sameCountry.currency === x.base.currency && sameCountry.amount < x.base.amount * 0.98) || b.usd < baseUsd * 0.9;
      x.last = { amount: b.amount, currency: b.currency, cc: b.cc }; x.checked = Date.now(); x.lastHome = true;
    } catch { }
  }
  setWatch(w); if (!$('#tab-watch').hidden) renderWatch();
}
function renderWatch() {
  const w = getWatch(), el = $('#watchList'); if (!el) return;
  if (!w.length) { el.innerHTML = '<div class="empty">Nothing watched yet. Search for something and tap <b>☆ Watch price</b>.</div>'; return; }
  el.innerHTML = w.map(x => `<div class="watch">${x.image ? `<img src="${esc(x.image)}" alt="">` : ''}<div class="w-main"><b>${esc(x.title)}${x.planName && x.planName !== 'Base game' ? ' · ' + esc(x.planName) : ''}</b><small>Cheapest now: ${flag(x.last.cc)} ${esc(cname(x.last.cc))} ${money(x.last.amount, x.last.currency)} · when added: ${esc(cname(x.base.cc))} ${money(x.base.amount, x.base.currency)} · checked ${new Date(x.checked).toLocaleString()}</small></div>${x.drop ? '<span class="drop">Price drop</span>' : ''}<button class="ghost" data-open="${esc(x.key)}">Open</button><button class="ghost" data-del="${esc(x.key)}" aria-label="Remove">✕</button></div>`).join('');
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { setWatch(getWatch().filter(x => x.key !== b.dataset.del)); renderWatch(); });
  el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { const x = getWatch().find(y => y.key === b.dataset.open); x.drop = false; setWatch(getWatch().map(y => y.key === x.key ? x : y)); location.hash = 'search'; $('#picker').hidden = true; load({ store: x.store, id: x.id, title: x.title, plan: x.plan }); });
}
init();
