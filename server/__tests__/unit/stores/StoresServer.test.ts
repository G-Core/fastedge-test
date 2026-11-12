import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import http from 'node:http';
import { StoresCore } from '../../../stores/StoresCore';
import { startStoresServer, type StoresServer } from '../../../stores/StoresServer';

let server: StoresServer;

/** Raw request, so the Host header can be set (fetch does not allow it). */
function post(path: string, body: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: server.port,
        method: 'POST',
        path,
        headers: { authorization: 'Bearer secret', host: `127.0.0.1:${server.port}`, ...headers },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode!, body: data }));
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

beforeAll(async () => {
  server = await startStoresServer(new StoresCore(new DatabaseSync(':memory:')), 'secret');
});
afterAll(() => server.close());

describe('StoresServer', () => {
  it('serves cache and kv ops', async () => {
    const set = await post('/v1/cache', JSON.stringify({ op: 'incr', dc: 'local', key: 'n', delta: '2' }));
    expect(set).toEqual({ status: 200, body: '{"ok":true,"value":"2"}' });
    const kv = await post('/v1/kv', JSON.stringify({ op: 'get', store: 's', key: 'k' }));
    expect(JSON.parse(kv.body)).toEqual({ ok: true, value: null });
  });

  it('reports the protocol and moves the clock', async () => {
    expect(JSON.parse((await post('/v1/admin', '{"op":"info"}')).body).value).toEqual({ protocol: 1 });
    expect(JSON.parse((await post('/v1/admin', '{"op":"advance-clock","ms":5}')).body).value).toBe(5);
  });

  it('rejects a wrong token, a foreign Host, unknown paths and bad bodies', async () => {
    expect((await post('/v1/cache', '{}', { authorization: 'Bearer nope' })).status).toBe(401);
    expect((await post('/v1/cache', '{}', { host: 'evil.example:80' })).status).toBe(403);
    expect((await post('/v1/other', '{}')).status).toBe(404);
    expect(await post('/v1/cache', 'not json')).toEqual({ status: 400, body: '{"ok":false,"error":"bad-request"}' });
    expect((await post('/v1/cache', '{"op":"get","dc":"local"}')).status).toBe(400);
  });

  it('accepts localhost as Host', async () => {
    expect((await post('/v1/admin', '{"op":"info"}', { host: `localhost:${server.port}` })).status).toBe(200);
  });
});
