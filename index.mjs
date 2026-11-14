// Neon Functions entry (web-standard fetch handler). Same app as server.js.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { handle, warm } = require('./lib/app.js');
warm();
export default {
  async fetch(request) {
    const out = await handle(request.method, request.url, () => request.text());
    return new Response(out.body, { status: out.status, headers: out.headers });
  }
};
