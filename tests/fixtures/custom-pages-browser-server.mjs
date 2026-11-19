// Local-only integration fixture: real custom-page handlers and SQLite; other routes
// proxy the existing synthetic browser fixture. Never connects to production.
import http from 'node:http';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleCustomPageRequest, isCustomPagePath } from '../../functions/lib/custom-pages.mjs';
const db = new DatabaseSync(':memory:');
db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,role TEXT); INSERT INTO users VALUES(1,'Local Admin','admin'),(2,'Local Reader','user');");
db.exec(fs.readFileSync(new URL('../../migrations/0014_add_custom_pages.sql', import.meta.url), 'utf8'));
class Statement {
  constructor(sql, values = []) { this.sql = sql; this.values = values; }
  bind(...values) { return new Statement(this.sql, values); }
  first() { return db.prepare(this.sql).get(...this.values) || null; }
  all() { return { results: db.prepare(this.sql).all(...this.values) }; }
  run() { const result = db.prepare(this.sql).run(...this.values); return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; }
}
const env = { DB: { prepare: sql => new Statement(sql), batch: async statements => {
  db.exec('BEGIN'); try { const results = statements.map(s => s.run()); db.exec('COMMIT'); return results; } catch (e) { db.exec('ROLLBACK'); throw e; }
} } };
http.createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, 'http://127.0.0.1:8767');
    const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    let response;
    if (url.pathname === '/api/knowledge/admin/images' && incoming.method === 'POST') {
      response = incoming.headers.authorization === 'Bearer fixture-admin-token'
        ? Response.json({ success: true, data: { image: { url: '/assets/brand/zhen-96.png' } } })
        : Response.json({ success: false }, { status: 401 });
    } else if (isCustomPagePath(url.pathname)) {
      const request = new Request(url, { method: incoming.method, headers: incoming.headers, body });
      response = await handleCustomPageRequest({ env, request, url, jsonResponse: (data, status = 200) => Response.json(data, { status }) }, async () => {
        const user = incoming.headers.authorization === 'Bearer fixture-admin-token' ? { id: 1, role: 'admin' } : incoming.headers.authorization === 'Bearer fixture-user-token' ? { id: 2, role: 'user' } : null;
        return user ? { user } : { response: Response.json({ success: false, error: { message: '请先登录' } }, { status: 401 }) };
      });
    } else response = await fetch('http://127.0.0.1:8766' + incoming.url, { method: incoming.method, headers: incoming.headers, body });
    outgoing.writeHead(response.status, Object.fromEntries([...response.headers].filter(([key]) => !['content-encoding', 'content-length', 'transfer-encoding'].includes(key))));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { outgoing.writeHead(500); outgoing.end(error.message); }
}).listen(8767, '127.0.0.1', () => console.log('Custom-page integration fixture: http://127.0.0.1:8767'));
