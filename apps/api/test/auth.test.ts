import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { invitation } from '../src/db/schema/index.js';
import { provisionOrganisation } from '../src/organisations/provision.js';
import { buildTestApp, lastLinkSentTo, resetDatabase, TestClient } from './helpers.js';

const ctx = await buildTestApp();

// Route de test protégée par requireOrganisation.
ctx.app.get(
  '/test/organisation',
  { preHandler: ctx.app.guards.requireOrganisation },
  (request) => ({
    organisationId: request.organisation!.id,
  }),
);

afterAll(() => ctx.close());

beforeEach(async () => {
  await resetDatabase();
  ctx.emailSender.sent.length = 0;
});

/** Ouvre un client comme le fait « pnpm org:create », puis son admin s'inscrit et accepte. */
async function openClient(name: string, adminName: string, adminEmail: string) {
  const { organisation, invitation } = await provisionOrganisation(ctx, { name, adminEmail });
  const admin = new TestClient(ctx);
  await admin.signUpAndVerify(adminName, adminEmail);
  const accept = await admin.post('/api/auth/organization/accept-invitation', {
    invitationId: invitation.id,
  });
  expect(accept.statusCode).toBe(200);
  return { admin, organisationId: organisation.id };
}

async function invite(admin: TestClient, email: string, role: 'admin' | 'membre') {
  const response = await admin.post('/api/auth/organization/invite-member', { email, role });
  expect(response.statusCode).toBe(200);
  return lastLinkSentTo(ctx, email).pathname.split('/').at(-1)!;
}

async function join(client: TestClient, invitationId: string) {
  const response = await client.post('/api/auth/organization/accept-invitation', { invitationId });
  expect(response.statusCode).toBe(200);
}

describe('Inscription sur invitation uniquement', () => {
  it("refuse l'inscription d'une adresse sans invitation", async () => {
    const response = await new TestClient(ctx).post('/api/auth/sign-up/email', {
      name: 'Eve',
      email: 'eve@example.org',
      password: 'mot-de-passe-solide',
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'SIGNUP_REQUIRES_INVITATION' });
    expect(ctx.emailSender.sent).toEqual([]);
  });

  it('refuse une inscription si la seule invitation a expiré', async () => {
    const { invitation: sent } = await provisionOrganisation(ctx, {
      name: 'Usine',
      adminEmail: 'alice@example.org',
    });
    await ctx.db
      .update(invitation)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invitation.id, sent.id));

    const response = await new TestClient(ctx).post('/api/auth/sign-up/email', {
      name: 'Alice',
      email: 'alice@example.org',
      password: 'mot-de-passe-solide',
    });
    expect(response.statusCode).toBe(403);
  });

  it("un utilisateur ne peut pas créer d'organisation lui-même", async () => {
    const { admin } = await openClient('Usine', 'Alice', 'alice@example.org');
    const response = await admin.post('/api/auth/organization/create', {
      name: 'Pirate',
      slug: 'pirate',
    });
    expect(response.statusCode).toBe(403);
  });
});

describe("Ouverture d'un client (org:create)", () => {
  it("crée l'organisation et invite son premier admin par e-mail", async () => {
    await provisionOrganisation(ctx, { name: 'Usine Dupont', adminEmail: 'Alice@Example.org' });
    const mail = ctx.emailSender.sent.at(-1);
    expect(mail?.to).toBe('alice@example.org');
    expect(mail?.subject).toBe('Invitation à rejoindre Usine Dupont');
    expect(mail?.text).toContain(ctx.config.OPERATOR_NAME);
  });

  it("l'admin invité s'inscrit, vérifie son adresse et rejoint l'organisation en admin", async () => {
    const { admin, organisationId } = await openClient('Usine', 'Alice', 'alice@example.org');
    expect((await admin.get('/api/me')).json()).toMatchObject({
      user: { name: 'Alice', email: 'alice@example.org' },
      organisation: { id: organisationId, name: 'Usine', role: 'admin' },
    });
  });

  it("l'opérateur qui envoie les invitations ne peut pas se connecter", async () => {
    await provisionOrganisation(ctx, { name: 'Usine', adminEmail: 'alice@example.org' });
    const response = await new TestClient(ctx).post('/api/auth/sign-in/email', {
      email: ctx.config.OPERATOR_EMAIL,
      password: 'mot-de-passe-solide',
    });
    expect(response.statusCode).toBe(401);
  });

  it("refuse la connexion tant que l'adresse n'est pas vérifiée", async () => {
    await provisionOrganisation(ctx, { name: 'Usine', adminEmail: 'alice@example.org' });
    const client = new TestClient(ctx);
    await client.post('/api/auth/sign-up/email', {
      name: 'Alice',
      email: 'alice@example.org',
      password: 'mot-de-passe-solide',
    });
    const signIn = await client.post('/api/auth/sign-in/email', {
      email: 'alice@example.org',
      password: 'mot-de-passe-solide',
    });
    expect(signIn.statusCode).toBe(403);
  });

  it('refuse un mot de passe trop court', async () => {
    await provisionOrganisation(ctx, { name: 'Usine', adminEmail: 'alice@example.org' });
    const response = await new TestClient(ctx).post('/api/auth/sign-up/email', {
      name: 'Alice',
      email: 'alice@example.org',
      password: 'court',
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('Invitations par un admin', () => {
  it("un invité rejoint l'organisation avec le rôle choisi", async () => {
    const { admin, organisationId } = await openClient('Usine', 'Alice', 'alice@example.org');
    const invitationId = await invite(admin, 'bob@example.org', 'membre');

    const bob = new TestClient(ctx);
    await bob.signUpAndVerify('Bob', 'bob@example.org');
    await join(bob, invitationId);
    expect((await bob.get('/api/me')).json()).toMatchObject({
      organisation: { id: organisationId, role: 'membre' },
    });
  });

  it("une invitation ne peut pas être acceptée par quelqu'un d'autre", async () => {
    const { admin } = await openClient('Usine', 'Alice', 'alice@example.org');
    const forBob = await invite(admin, 'bob@example.org', 'membre');
    await invite(admin, 'eve@example.org', 'membre');

    const eve = new TestClient(ctx);
    await eve.signUpAndVerify('Eve', 'eve@example.org');
    const accept = await eve.post('/api/auth/organization/accept-invitation', {
      invitationId: forBob,
    });
    expect(accept.statusCode).toBeGreaterThanOrEqual(400);
    expect((await eve.get('/api/me')).json()).toMatchObject({ organisation: null });
  });

  it('un membre ne peut pas inviter', async () => {
    const { admin } = await openClient('Usine', 'Alice', 'alice@example.org');
    const bob = new TestClient(ctx);
    const invitationId = await invite(admin, 'bob@example.org', 'membre');
    await bob.signUpAndVerify('Bob', 'bob@example.org');
    await join(bob, invitationId);

    const response = await bob.post('/api/auth/organization/invite-member', {
      email: 'carol@example.org',
      role: 'membre',
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('Utilisateur membre de plusieurs organisations', () => {
  it("rejoint une seconde organisation avec son compte existant et passe de l'une à l'autre", async () => {
    const usineA = await openClient('UsineA', 'Alice', 'alice@example.org');
    const usineB = await openClient('UsineB', 'Bruno', 'bruno@example.org');
    const bob = new TestClient(ctx);
    const fromA = await invite(usineA.admin, 'bob@example.org', 'membre');
    await bob.signUpAndVerify('Bob', 'bob@example.org');
    await join(bob, fromA);
    // Déjà inscrit : il accepte la seconde invitation avec le même compte.
    await join(bob, await invite(usineB.admin, 'bob@example.org', 'admin'));

    const list = await bob.get('/api/auth/organization/list');
    expect(
      list
        .json<{ id: string }[]>()
        .map((o) => o.id)
        .sort(),
    ).toEqual([usineA.organisationId, usineB.organisationId].sort());

    await bob.post('/api/auth/organization/set-active', { organizationId: usineA.organisationId });
    expect((await bob.get('/api/me')).json()).toMatchObject({
      organisation: { id: usineA.organisationId, role: 'membre' },
    });
    await bob.post('/api/auth/organization/set-active', { organizationId: usineB.organisationId });
    expect((await bob.get('/api/me')).json()).toMatchObject({
      organisation: { id: usineB.organisationId, role: 'admin' },
    });
  });
});

describe('Cloisonnement entre organisations', () => {
  it("un utilisateur ne peut pas activer l'organisation d'un autre", async () => {
    const usineA = await openClient('UsineA', 'Alice', 'alice@example.org');
    const usineB = await openClient('UsineB', 'Bruno', 'bruno@example.org');
    const alice = usineA.admin;

    const response = await alice.post('/api/auth/organization/set-active', {
      organizationId: usineB.organisationId,
    });
    expect(response.statusCode).toBe(403);
    // Better Auth vide alors l'organisation active, par précaution.
    expect((await alice.get('/test/organisation')).statusCode).toBe(403);

    await alice.post('/api/auth/organization/set-active', {
      organizationId: usineA.organisationId,
    });
    expect((await alice.get('/test/organisation')).json()).toEqual({
      organisationId: usineA.organisationId,
    });
  });

  it("un membre retiré perd l'accès même si sa session est encore ouverte", async () => {
    const { admin, organisationId } = await openClient('Usine', 'Alice', 'alice@example.org');
    const bob = new TestClient(ctx);
    const invitationId = await invite(admin, 'bob@example.org', 'membre');
    await bob.signUpAndVerify('Bob', 'bob@example.org');
    await join(bob, invitationId);
    expect((await bob.get('/test/organisation')).json()).toEqual({ organisationId });

    const removal = await admin.post('/api/auth/organization/remove-member', {
      memberIdOrEmail: 'bob@example.org',
    });
    expect(removal.statusCode).toBe(200);
    expect((await bob.get('/test/organisation')).statusCode).toBe(403);
  });

  it('une route protégée exige une session', async () => {
    expect((await new TestClient(ctx).get('/test/organisation')).statusCode).toBe(401);
  });
});
