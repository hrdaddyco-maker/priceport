// VPN Gate (University of Tsukuba academic project): free volunteer VPN servers, public keyless API.
// We list them by country and hand out their OpenVPN configs so users can tunnel for real, free.
const { get, cached } = require('./util');
async function servers() {
  return cached('vpngate', 30 * 60e3, async () => {
    const { body } = await get('https://www.vpngate.net/api/iphone/', { timeout: 20000 });
    const lines = body.split('\n').filter(l => l && !l.startsWith('*') && !l.startsWith('#'));
    const list = [];
    for (const l of lines) {
      const f = l.split(','); if (f.length < 15 || !f[14]) continue;
      list.push({ host: f[0], ip: f[1], score: +f[2], ping: +f[3], speedMbps: Math.round(+f[4] / 1e6), country: f[6], countryName: f[5], sessions: +f[7], uptimeDays: Math.round(+f[8] / 864e5), ovpn: f[14].trim() });
    }
    return { at: new Date().toISOString(), list };
  });
}
async function summary() {
  const { at, list } = await servers();
  const by = {};
  for (const s of list) (by[s.country] ||= { country: s.country, name: s.countryName, servers: [] }).servers.push(s);
  const countries = Object.values(by).map(c => { c.servers.sort((a, b) => b.score - a.score); return { country: c.country, name: c.name, count: c.servers.length, best: c.servers.slice(0, 3).map(({ ovpn, ...s }) => s) }; }).sort((a, b) => b.count - a.count);
  return { at, total: list.length, countries };
}
async function config(ip) {
  const { list } = await servers();
  const s = list.find(x => x.ip === ip); if (!s) throw new Error('Server no longer listed');
  return { name: `vpngate_${s.country}_${s.ip}.ovpn`, text: Buffer.from(s.ovpn, 'base64').toString('utf8') };
}
module.exports = { summary, config };
