// Swappable LLM: defaults to Pollinations' keyless OpenAI-compatible endpoint (same pattern as Moat).
const LLM_URL = process.env.LLM_URL || 'https://text.pollinations.ai/openai';
const LLM_KEY = process.env.LLM_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || 'openai';
const GAP = +(process.env.LLM_GAP_MS || (LLM_KEY ? 0 : 3000));

let chain = Promise.resolve(), last = 0;
function queued(fn) { const p = chain.then(async () => { const w = last + GAP - Date.now(); if (w > 0) await new Promise(r => setTimeout(r, w)); try { return await fn(); } finally { last = Date.now(); } }); chain = p.catch(() => { }); return p; }

async function llm(messages, { json = false, timeout = 45000, tries = 2 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const j = await queued(async () => {
        const r = await fetch(LLM_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(LLM_KEY ? { Authorization: 'Bearer ' + LLM_KEY } : {}) }, body: JSON.stringify({ model: LLM_MODEL, messages, reasoning_effort: 'low', seed: Math.floor(Math.random() * 1e9), max_tokens: 1500, ...(json ? { response_format: { type: 'json_object' } } : {}) }), signal: AbortSignal.timeout(timeout) });
        return r.json().catch(() => ({}));
      });
      const c = j.choices?.[0]?.message?.content; if (c) return c;
      console.log('llm fail', JSON.stringify(j).slice(0, 200));
    } catch (e) { console.log('llm error', e.message); }
    await new Promise(r => setTimeout(r, 4000));
  }
  throw new Error('AI unavailable');
}
function extract(t) { t = String(t).replace(/```json|```/g, ''); return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); }

// Turn a plain request into a lookup.
async function parse(q) {
  const sys = `You turn shopping requests into store lookups for a regional-price comparison tool. Stores: "steam" (PC games), "msstore" (Xbox games, Game Pass, Microsoft subscriptions), "apple" (iPhone/iPad/Mac apps and their in-app subscriptions, e.g. ChatGPT Plus, Duolingo, Tinder), "spotify" (Spotify Premium plans). Reply ONLY JSON: {"term": short product name to search, no filler words, "store": one of steam|msstore|apple|spotify|any, "plan": plan/tier words or "", "home": ISO 2-letter country if the user says where they live else ""}.`;
  const out = extract(await llm([{ role: 'system', content: sys }, { role: 'user', content: q }], { json: true, timeout: 25000, tries: 1 }));
  return { term: String(out.term || '').slice(0, 80), store: ['steam', 'msstore', 'apple', 'spotify'].includes(out.store) ? out.store : 'any', plan: String(out.plan || '').slice(0, 40), home: /^[A-Z]{2}$/i.test(out.home || '') ? out.home.toUpperCase() : '' };
}

async function explain(ctx) {
  const sys = `You are Priceport, an assistant that explains regional price comparisons (the "VPN shopping" trick) honestly and briefly. Use ONLY the numbers given; never invent prices. In 5-7 short sentences of plain English: say where it's cheapest and the saving vs the user's home country, whether that regional price is realistically usable from abroad (payment card / gift card / account region rules provided), the main risk (terms of service, account flags, lost purchases), then suggest which country to tunnel through to view that price: the cheapest one listed in freeTunnelCountriesAmongCheapest, or the cheapest country overall with a regular VPN. Finish with the best practical option (e.g. a cheaper legit plan, family plan, waiting for a sale, gift cards). No markdown headings, no lists.`;
  return (await llm([{ role: 'system', content: sys }, { role: 'user', content: JSON.stringify(ctx) }], { timeout: 45000, tries: 2 })).trim();
}
module.exports = { parse, explain, llmInfo: { url: LLM_URL, model: LLM_MODEL, keyless: !LLM_KEY } };
