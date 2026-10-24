import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db/client.js';
import { createRedis } from '../src/redis.js';
import { testConfig } from './helpers.js';

const config = testConfig();
const { pool } = createDatabase(config.DATABASE_URL);
const redis = createRedis(config.REDIS_URL);

afterAll(async () => {
  await Promise.all([pool.end(), redis.quit()]);
});

describe('GET /health', () => {
  it('répond ok quand la base et Redis sont joignables', async () => {
    const app = await buildApp({ config, pool, redis });
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ database: 'ok', redis: 'ok' });
  });

  it('répond 503 quand la base est injoignable', async () => {
    const broken = createDatabase('postgres://nobody:nothing@localhost:1/none');
    const app = await buildApp({ config, pool: broken.pool, redis });
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ database: 'erreur', redis: 'ok' });
    await broken.pool.end();
  });
});
