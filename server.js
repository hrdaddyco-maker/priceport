const http = require('http');
const { handle, warm } = require('./lib/app');
const PORT = process.env.PORT || 3000;
http.createServer(async (req, res) => {
  const readBody = async () => { let b = ''; for await (const ch of req) { b += ch; if (b.length > 20000) break; } return b; };
  const out = await handle(req.method, req.url, readBody);
  res.writeHead(out.status, out.headers); res.end(out.body);
}).listen(PORT, () => console.log('Priceport on ' + PORT));
setTimeout(warm, 2000);
