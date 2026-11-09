import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { provisionOrganisation } from '../src/organisations/provision.js';
import { buildTestApp, resetDatabase, TEST_PASSWORD, TestClient } from './helpers.js';

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
    // Expiration calculée par Node, comparée à l'horloge de PostgreSQL : quelques secondes d'écart.
    expect(rows[0]!.hours).toBeLessThanOrEqual(2.01);
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

describe('Mon compte', () => {
  it('liste ses sessions et ferme celle de son choix', async () => {
    const poste = await connected();
    const telephone = new TestClient(ctx);
    telephone.twoFactorSecret = poste.twoFactorSecret;
    expect((await telephone.signIn('alice@exemple.fr')).statusCode).toBe(200);

    const sessions = (await poste.get('/api/auth/list-sessions')).json() as { token: string }[];
    expect(sessions).toHaveLength(2);
    const current = (await session(poste)).session.token;
    const other = sessions.find((s) => s.token !== current)!;
    expect((await poste.post('/api/auth/revoke-session', { token: other.token })).statusCode).toBe(
      200,
    );
    expect(await session(telephone)).toBeNull();
    expect(await session(poste)).not.toBeNull();
  });

  it("change son mot de passe avec l'ancien, et ferme ses autres sessions", async () => {
    const poste = await connected();
    const telephone = new TestClient(ctx);
    telephone.twoFactorSecret = poste.twoFactorSecret;
    await telephone.signIn('alice@exemple.fr');

    const wrong = await poste.post('/api/auth/change-password', {
      currentPassword: 'pas-le-bon-mot-de-passe',
      newPassword: 'agrafe-cheval-lanterne-77',
      revokeOtherSessions: true,
    });
    expect(wrong.statusCode).toBe(400);
    const changed = await poste.post('/api/auth/change-password', {
      currentPassword: TEST_PASSWORD,
      newPassword: 'agrafe-cheval-lanterne-77',
      revokeOtherSessions: true,
    });
    expect(changed.statusCode).toBe(200);
    expect(await session(telephone)).toBeNull();
    expect(await session(poste)).not.toBeNull();
  });
});
