// Integration tests for the REST API. Requires a Postgres instance reachable
// via KB_DATABASE_URL — see docker-compose.yml. Skipped if the env var is unset.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type express from 'express';

const HAS_DB = !!process.env.KB_DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

let app: express.Application;
let pool: { end: () => Promise<void> };

d('REST API', () => {
  beforeAll(async () => {
    const { buildApp } = await import('../api/server.js');
    const { migrate } = await import('../db/migrate.js');
    const dbClient = await import('../db/client.js');
    pool = dbClient.pool;
    await migrate();
    app = await buildApp();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('creates, reads, updates and deletes a node', async () => {
    const create = await request(app)
      .post('/api/v1/nodes')
      .send({ id: 'test-node-x', title: 'Test', domain: 'concepts', body: 'hello' });
    expect(create.status).toBe(201);

    const read = await request(app).get('/api/v1/nodes/test-node-x');
    expect(read.body.data.title).toBe('Test');

    const update = await request(app)
      .put('/api/v1/nodes/test-node-x')
      .send({ title: 'Updated', changed_by: 'test', change_summary: 'rename' });
    expect(update.body.data.title).toBe('Updated');

    const versions = await request(app).get('/api/v1/nodes/test-node-x/versions');
    expect(versions.body.data.length).toBeGreaterThanOrEqual(2);

    const del = await request(app).delete('/api/v1/nodes/test-node-x');
    expect(del.status).toBe(200);
  });

  it('runs a JS agent script', async () => {
    const res = await request(app)
      .post('/api/v1/run')
      .send({
        lang: 'js',
        code: 'kb.log("ok"); result = 42;',
      });
    expect(res.body.data.result).toBe(42);
    expect(res.body.data.logs).toContain('ok');
    expect(res.body.data.widgets).toEqual([]);
  });
});
