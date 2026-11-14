// Fetch a public page "as" another country with zero servers of our own.
// Method: free public proxies in that country (free GitHub lists + proxyscrape), used ONLY as raw TCP tunnels
// so the TLS session is end-to-end with the real site: the proxy can't read or alter the page.
// No cookies or credentials are ever sent. Every result is verified: we check the exit country via
// Cloudflare's /cdn-cgi/trace through the same tunnel before trusting the page.
const net = require('net'), tls = require('tls');
const { cached, UA } = require('./util');
const ENABLED = process.env.GEO_PROXIES !== '0';

// Open a raw TCP tunnel to host:443 through an http (CONNECT), socks5 or socks4 proxy.
function openTunnel(proxy, host, timeout) {
  return new Promise((resolve, reject) => {
    const m = proxy.match(/^(?:(https?|socks[45]):\/\/)?([^:]+):(\d+)$/); if (!m) return reject(new Error('bad proxy'));
    const kind = (m[1] || 'http').replace('https', 'http'), ph = m[2], pp = +m[3];
    const sock = net.connect({ host: ph, port: pp });
    const timer = setTimeout(() => { sock.destroy(); reject(new Error('timeout')); }, timeout);
    const fail = e => { clearTimeout(timer); sock.destroy(); reject(e); };
    sock.on('error', fail);
    let buf = Buffer.alloc(0), stage = 0;
    const done = () => { clearTimeout(timer); sock.removeAllListeners('data'); sock.removeListener('error', fail); resolve(sock); };
    sock.on('connect', () => {
      if (kind === 'http') sock.write(`CONNECT ${host}:443 HTTP/1.1\r\nHost: ${host}:443\r\n\r\n`);
      else if (kind === 'socks5') sock.write(Buffer.from([5, 1, 0]));
      else sock.write(Buffer.concat([Buffer.from([4, 1, 1, 187, 0, 0, 0, 1, 0]), Buffer.from(host), Buffer.from([0])]));
    });
    sock.on('data', d => {
      buf = Buffer.concat([buf, d]);
      if (kind === 'http') { const i = buf.indexOf('\r\n\r\n'); if (i < 0) return; return / 200 /.test(buf.slice(0, i).toString()) ? done() : fail(new Error('CONNECT refused')); }
      if (kind === 'socks4') { if (buf.length < 8) return; return buf[1] === 0x5a ? done() : fail(new Error('socks4 refused')); }
      if (stage === 0) { if (buf.length < 2) return; if (buf[0] !== 5 || buf[1] !== 0) return fail(new Error('socks5 auth')); buf = buf.slice(2); stage = 1; sock.write(Buffer.concat([Buffer.from([5, 1, 0, 3, host.length]), Buffer.from(host), Buffer.from([1, 187])])); return; }
      if (buf.length < 10) return; return buf[1] === 0 ? done() : fail(new Error('socks5 refused'));
    });
  });
}

async function tunnelGet(proxy, url, timeout = 9000) {
  const u = new URL(url), t0 = Date.now();
  const raw = await openTunnel(proxy, u.hostname, timeout);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { s.destroy(); reject(new Error('timeout')); }, Math.max(2000, timeout - (Date.now() - t0)) + 4000);
    const s = tls.connect({ socket: raw, servername: u.hostname }, () => {
      s.write(`GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.hostname}\r\nUser-Agent: ${UA}\r\nAccept: text/html,*/*\r\nAccept-Language: en\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n`);
    });
    const chunks = []; let size = 0;
    s.on('data', d => { chunks.push(d); size += d.length; if (size > 3e6) s.destroy(); });
    s.on('error', e => { clearTimeout(timer); reject(e); });
    s.on('close', () => {
      clearTimeout(timer);
      const rawS = Buffer.concat(chunks).toString('utf8'); const i = rawS.indexOf('\r\n\r\n');
      if (i < 0) return reject(new Error('empty response'));
      const head = rawS.slice(0, i), status = +(head.match(/^HTTP\/1\.[01] (\d+)/) || [])[1];
      let body = rawS.slice(i + 4);
      if (/transfer-encoding:\s*chunked/i.test(head)) { let out = '', rest = body; while (rest.length) { const j = rest.indexOf('\r\n'); const n = parseInt(rest.slice(0, j), 16); if (!n) break; out += rest.substr(j + 2, n); rest = rest.slice(j + 2 + n + 2); } body = out; }
      resolve({ status, head, body });
    });
  });
}

// Free proxy lists, all keyless: proxifly/free-proxy-list (GitHub, per-country, refreshed every few minutes),
// clarketm/proxy-list (GitHub, SSL-capable ones only) and proxyscrape's free list API.
async function proxyList(cc) {
  return cached('px:' + cc, 15 * 60e3, async () => {
    const out = new Set();
    const get = (u, ms = 10000) => fetch(u, { signal: AbortSignal.timeout(ms) }).then(r => r.ok ? r.text() : '').catch(() => '');
    const [a, b, c] = await Promise.all([
      get(`https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/countries/${cc}/data.txt`),
      get('https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list.txt'),
      get(`https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&country=${cc.toLowerCase()}&protocol=http&proxy_format=ipport&format=text&timeout=6000`)]);
    for (const l of a.split('\n')) if (/^(https?|socks[45]):\/\/[\d.]+:\d+$/.test(l.trim())) out.add(l.trim().replace(/^https:/, 'http:'));
    for (const l of b.split('\n')) { const m = l.match(/^([\d.]+:\d+) ([A-Z]{2})-\w+(?:-S)/); if (m && m[2] === cc) out.add('http://' + m[1]); }
    for (const l of c.split('\n')) if (/^[\d.]+:\d+$/.test(l.trim())) out.add('http://' + l.trim());
    const list = [...out];
    // Prefer socks5/http over socks4, then shuffle a bit so one dead proxy doesn't block everyone.
    return list.sort((x, y) => (x.startsWith('socks4') - y.startsWith('socks4')) || (Math.random() - 0.5));
  });
}

const good = new Map(); // cc -> proxy that last worked
const bad = new Set();
async function verifiedProxy(cc) {
  const tryOne = async p => { const t = await tunnelGet(p, 'https://www.cloudflare.com/cdn-cgi/trace', 7000); if (t.status !== 200) throw new Error('trace ' + t.status); const loc = (t.body.match(/loc=([A-Z]{2})/) || [])[1]; if (loc !== cc) throw new Error('exit is ' + loc); return p; };
  if (good.has(cc)) { try { return await tryOne(good.get(cc)); } catch { good.delete(cc); } }
  const list = (await proxyList(cc)).filter(p => !bad.has(p));
  if (!list.length) throw new Error('no free proxies listed for ' + cc);
  // Health check: race batches of 12 candidates; the first whose exit really is in cc wins.
  for (let i = 0; i < Math.min(list.length, 48); i += 12) {
    const batch = list.slice(i, i + 12);
    try { const p = await Promise.any(batch.map(p => tryOne(p).catch(e => { bad.add(p); throw e; }))); good.set(cc, p); return p; } catch { }
  }
  throw new Error('no healthy proxy in ' + cc + ' right now');
}

// Returns { body, method, exit } or throws. Two attempts with different proxies.
async function geoGet(cc, url) {
  if (!ENABLED) throw new Error('geo proxies disabled');
  let last;
  for (let i = 0; i < 2; i++) {
    try {
      const p = await verifiedProxy(cc);
      const r = await tunnelGet(p, url, 12000);
      if (r.status >= 200 && r.status < 300 && r.body.length > 500) return { body: r.body, method: 'free-proxy', exit: cc, via: p.split('://')[0] };
      if (r.status >= 300 && r.status < 400) { const loc = (r.head.match(/\nlocation:\s*(\S+)/i) || [])[1]; if (loc) { const r2 = await tunnelGet(p, new URL(loc, url).href, 12000); if (r2.status === 200) return { body: r2.body, method: 'free-proxy', exit: cc, via: p.split('://')[0] }; } }
      throw new Error('HTTP ' + r.status);
    } catch (e) { last = e; good.delete(cc); }
  }
  throw last || new Error('geo fetch failed');
}
module.exports = { geoGet, verifiedProxy, proxyList, tunnelGet, ENABLED };
