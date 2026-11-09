import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { provisionOrganisation } from '../src/organisations/provision.js';
import { buildTestApp, resetDatabase, TestClient } from './helpers.js';

const ctx = await buildTestApp();
const owner = new pg.Pool({ connectionString: process.env.TEST_DATABASE_OWNER_URL });
afterAll(async () => {
  await owner.end();
  await ctx.close();
});
beforeEach(() => resetDatabase());

async function connected() {
  await provisionOrganisation(ctx, { name: 'Usine', adminEmail: 'alice@exemple.fr' });
  const client = new TestClient(ctx);
  await client.signUpAndVerify('Alice', 'alice@exemple.fr');
  return client;
}

const session = async (client: TestClient) => (await client.get('/api/auth/get-session')).json();

describe('durée des sessions', () => {
  it('expire après 2 heures sans activité', async () => {
    await connected();
    const { rows } = await owner.query<{ hours: number }>(
      `select (extract(epoch from expires_at - now()) / 3600)::float8 as hours from session`,
    );
    expect(rows[0]!.hours).toBeGreaterThan(1.9);
    expect(rows[0]!.hours).toBeLessThanOrEqual(2);
  });

  it('ne dépasse jamais 12 heures, même prolongée', async () => {
    const client = await connected();
    expect((await session(client))?.user.email).toBe('alice@exemple.fr');
    // Connexion il y a 13 heures : le plafond la fait expirer, une prolongation n'y change rien.
    await owner.query(`update session set created_at = now() - interval '13 hours'`);
    await owner.query(`update session set expires_at = now() + interval '2 hours'`);
    expect(await session(client)).toBeNull();
  });
});
