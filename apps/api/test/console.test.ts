import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { audit, setStaff } from '../src/console/staff.js';
import { createDatabase } from '../src/db/client.js';
import { buildTestApp, clientHelpers, resetDatabase, TestClient } from './helpers.js';
import { SoftAuthenticator } from './webauthn.js';

const ctx = await buildTestApp();
const { openClient } = clientHelpers(ctx);
// La commande staff:grant passe par le rôle propriétaire, comme ici.
const owner = createDatabase(process.env.TEST_DATABASE_OWNER_URL!);
afterAll(async () => {
  await owner.pool.end();
  await ctx.close();
});

beforeEach(async () => {
  await resetDatabase();
  ctx.emailSender.sent.length = 0;
});

const web = new URL(ctx.config.WEB_URL);

/** Ajoute une clé d'accès au compte connecté, puis ouvre une session avec elle. */
export async function passkeySession(client: TestClient) {
  const authenticator = new SoftAuthenticator(web.hostname, web.origin, true);
  const options = await client.get('/api/auth/passkey/generate-register-options');
  await client.post('/api/auth/passkey/verify-registration', {
    response: authenticator.register(options.json()),
    name: 'Portable',
  });
  const device = new TestClient(ctx);
  const login = await device.get('/api/auth/passkey/generate-authenticate-options');
  const verified = await device.post('/api/auth/passkey/verify-authentication', {
    response: authenticator.authenticate(login.json()),
  });
  expect(verified.statusCode).toBe(200);
  return device;
}

describe('Accès à la console Obsio', () => {
  it('reste invisible pour un compte client', async () => {
    const { admin } = await openClient('Usine', 'Alice', 'alice@example.org');
    expect((await admin.get('/api/console/session')).json()).toEqual({
      staff: false,
      unlockedUntil: null,
    });
    expect((await admin.get('/api/console/audit')).statusCode).toBe(404);
    const phone = await passkeySession(admin);
    expect((await phone.get('/api/console/audit')).statusCode).toBe(404);
  });

  it("demande une connexion par clé d'accès, même à l'équipe", async () => {
    const { admin: staff } = await openClient('Obsio', 'Camille', 'camille@obsio.fr');
    await setStaff(owner.db, 'camille@obsio.fr', true);

    // Mot de passe et code : compte reconnu, console verrouillée.
    expect((await staff.get('/api/console/session')).json()).toMatchObject({
      staff: true,
      unlockedUntil: null,
    });
    const locked = await staff.get('/api/console/audit');
    expect(locked.statusCode).toBe(403);
    expect(locked.json().code).toBe('CONSOLE_LOCKED');

    const unlocked = await passkeySession(staff);
    const state = (await unlocked.get('/api/console/session')).json();
    expect(state.staff).toBe(true);
    expect(new Date(state.unlockedUntil).getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    expect((await unlocked.get('/api/console/audit')).statusCode).toBe(200);

    // Retiré de l'équipe : plus rien, même avec une session déverrouillée.
    await setStaff(owner.db, 'camille@obsio.fr', false);
    expect((await unlocked.get('/api/console/audit')).statusCode).toBe(404);
  });

  it('se reverrouille après 15 minutes sans activité', async () => {
    const { admin: staff } = await openClient('Obsio', 'Camille', 'camille@obsio.fr');
    await setStaff(owner.db, 'camille@obsio.fr', true);
    const unlocked = await passkeySession(staff);
    await ctx.db.execute(
      sql`update session set console_until = now() - interval '1 second' where console_until is not null`,
    );
    expect((await unlocked.get('/api/console/audit')).statusCode).toBe(403);
  });

  it("l'application ne peut ni nommer l'équipe ni réécrire le journal", async () => {
    const { admin: staff } = await openClient('Obsio', 'Camille', 'camille@obsio.fr');
    const me = (await staff.get('/api/me')).json().user.id as string;
    await expect(
      ctx.db.execute(sql`insert into staff_member (user_id) values (${me})`),
    ).rejects.toThrow();

    await audit(ctx.db, { actorId: me, action: 'test', details: { note: 'premier' } });
    await expect(
      ctx.db.execute(sql`update console_audit set action = 'réécrit'`),
    ).rejects.toThrow();
    await expect(ctx.db.execute(sql`delete from console_audit`)).rejects.toThrow();
  });
});

describe('Clients dans la console', () => {
  async function unlockedStaff() {
    const { admin } = await openClient('Obsio', 'Camille', 'camille@obsio.fr');
    await setStaff(owner.db, 'camille@obsio.fr', true);
    return passkeySession(admin);
  }

  const essai = {
    plan: 'essai',
    status: 'active',
    startsOn: '2026-11-01',
    endsOn: '2026-12-31',
    maxSites: 1,
    maxMembers: 3,
    maxAnalysesPerMonth: 5,
    note: null,
  };

  it('ouvre un client avec sa licence et invite son admin', async () => {
    const staff = await unlockedStaff();
    const created = await staff.post('/api/console/clients', {
      name: 'Usine Martin',
      adminEmail: 'Paul@Martin.fr',
      licence: essai,
    });
    expect(created.statusCode).toBe(201);
    expect(ctx.emailSender.sent.some((mail) => mail.to === 'paul@martin.fr')).toBe(true);

    const clients = (await staff.get('/api/console/clients')).json();
    const martin = clients.find((c: { name: string }) => c.name === 'Usine Martin');
    expect(martin).toMatchObject({
      id: created.json().id,
      licence: essai,
      access: { access: 'complet', plan: 'essai' },
      members: 0,
      pendingInvitations: 1,
      sites: 0,
      analysesThisMonth: 0,
      lastLoginAt: null,
    });
    // Que des chiffres : aucun nom de site, de réserve ni d'adresse de membre.
    expect(Object.keys(martin).sort()).toEqual(
      [
        'id',
        'name',
        'slug',
        'createdAt',
        'licence',
        'access',
        'members',
        'pendingInvitations',
        'sites',
        'analysesThisMonth',
        'ocrPagesThisMonth',
        'lastLoginAt',
      ].sort(),
    );
    const [entry] = (await staff.get('/api/console/audit')).json();
    expect(entry).toMatchObject({ action: 'client.cree', organisationName: 'Usine Martin' });
  });

  it('révoque une licence, journalise le changement, et seule l’équipe le peut', async () => {
    const staff = await unlockedStaff();
    const { admin, organisationId } = await openClient('Usine Dupont', 'Alice', 'alice@dupont.fr');
    const revoked = { ...essai, status: 'revoquee', note: 'Impayé' };

    expect(
      (await admin.put(`/api/console/clients/${organisationId}/licence`, revoked)).statusCode,
    ).toBe(404);
    const response = await staff.put(`/api/console/clients/${organisationId}/licence`, revoked);
    expect(response.statusCode).toBe(204);

    expect((await admin.get('/api/me')).json().organisation.licence.access).toBe('lecture');
    const [entry] = (await staff.get('/api/console/audit')).json();
    expect(entry).toMatchObject({
      action: 'licence.revoquee',
      organisationId,
      details: {
        status: { avant: 'active', apres: 'revoquee' },
        plan: { avant: 'standard', apres: 'essai' },
      },
    });

    expect(
      (await staff.put(`/api/console/clients/${crypto.randomUUID()}/licence`, revoked)).statusCode,
    ).toBe(404);
    expect(
      (
        await staff.put(`/api/console/clients/${organisationId}/licence`, {
          ...revoked,
          endsOn: '2026-10-01',
        })
      ).statusCode,
    ).toBe(400);
  });
});
