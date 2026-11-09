import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createQuotas, QuotaExceeded, type Quota } from '../src/quotas.js';
import { createRedis } from '../src/redis.js';
import { testConfig } from './helpers.js';

const redis = createRedis(testConfig().REDIS_URL);
afterAll(() => redis.quit());
const quotas = createQuotas(redis);
const quota: Quota = { name: 'essai', max: 2, windowSeconds: 3600, label: '2 essais par heure' };

describe('quotas par organisation', () => {
  it('refuse au-delà du maximum, organisation par organisation', async () => {
    const [a, b] = [randomUUID(), randomUUID()];
    await quotas.consume(quota, a);
    await quotas.check(quota, a);
    await quotas.consume(quota, a);
    await expect(quotas.check(quota, a)).rejects.toThrow(QuotaExceeded);
    await expect(quotas.consume(quota, a)).rejects.toThrow(
      'Limite atteinte : 2 essais par heure pour votre organisation. Réessayez dans 1 h.',
    );
    // Le refus ne consomme rien, et l'autre organisation garde son quota.
    expect(await redis.get(`obsio-quota:essai:${a}`)).toBe('2');
    await quotas.consume(quota, b);
  });

  it("la fenêtre s'ouvre à la première opération et n'est pas prolongée", async () => {
    const id = randomUUID();
    await quotas.consume(quota, id);
    await redis.expire(`obsio-quota:essai:${id}`, 90);
    await quotas.consume(quota, id);
    expect(await redis.ttl(`obsio-quota:essai:${id}`)).toBeLessThanOrEqual(90);
    await expect(quotas.consume(quota, id)).rejects.toThrow('Réessayez dans 2 min.');
  });
});
