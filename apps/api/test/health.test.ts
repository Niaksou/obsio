import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db/client.js';
import { createFailFastRedis } from '../src/redis.js';
import { buildTestApp } from './helpers.js';

const ctx = await buildTestApp();

afterAll(() => ctx.close());

describe('GET /health', () => {
  it('répond ok quand la base et Redis sont joignables', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ database: 'ok', redis: 'ok' });
  });

  it('répond 503 quand la base est injoignable', async () => {
    const broken = createDatabase('postgres://nobody:nothing@localhost:1/none');
    const app = await buildApp({ ...ctx, pool: broken.pool, db: broken.db });
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ database: 'erreur', redis: 'ok' });
    await Promise.all([app.close(), broken.pool.end()]);
  });

  it('Redis injoignable : santé en erreur, requêtes refusées plutôt que sans limite', async () => {
    const redis = await createFailFastRedis('redis://localhost:1');
    const app = await buildApp({ ...ctx, redis });
    const started = Date.now();
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(503);
    expect(health.json()).toEqual({ database: 'ok', redis: 'erreur' });
    const refused = await app.inject({ method: 'GET', url: '/api/me' });
    expect(refused.statusCode).toBe(500);
    expect(Date.now() - started).toBeLessThan(5000);
    await app.close();
    redis.disconnect();
  });
});
