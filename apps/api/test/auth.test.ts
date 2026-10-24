import { afterAll, beforeEach, describe, expect, it } from 'vitest';
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

async function createOrganisation(client: TestClient, name: string): Promise<string> {
  const response = await client.post('/api/auth/organization/create', {
    name,
    slug: `${name.toLowerCase()}-${crypto.randomUUID()}`,
  });
  expect(response.statusCode).toBe(200);
  return response.json<{ id: string }>().id;
}

async function invite(admin: TestClient, email: string, role: 'admin' | 'membre') {
  const response = await admin.post('/api/auth/organization/invite-member', { email, role });
  expect(response.statusCode).toBe(200);
  return lastLinkSentTo(ctx, email).pathname.split('/').at(-1)!;
}

describe('Inscription et connexion', () => {
  it("refuse la connexion tant que l'adresse n'est pas vérifiée", async () => {
    const client = new TestClient(ctx);
    await client.post('/api/auth/sign-up/email', {
      name: 'Alice',
      email: 'alice@example.org',
      password: 'mot-de-passe-solide',
    });
    expect(ctx.emailSender.sent.at(-1)?.subject).toBe('Confirmez votre adresse e-mail');

    const signIn = await client.post('/api/auth/sign-in/email', {
      email: 'alice@example.org',
      password: 'mot-de-passe-solide',
    });
    expect(signIn.statusCode).toBe(403);
    expect((await client.get('/api/me')).statusCode).toBe(401);
  });

  it('connecte après vérification, sans organisation au départ', async () => {
    const client = new TestClient(ctx);
    await client.signUpAndVerify('Alice', 'alice@example.org');

    const me = await client.get('/api/me');
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      user: { name: 'Alice', email: 'alice@example.org' },
      organisation: null,
    });
  });

  it('refuse un mot de passe trop court', async () => {
    const response = await new TestClient(ctx).post('/api/auth/sign-up/email', {
      name: 'Alice',
      email: 'alice@example.org',
      password: 'court',
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('Organisations et invitations', () => {
  it("le créateur d'une organisation en est admin", async () => {
    const alice = new TestClient(ctx);
    await alice.signUpAndVerify('Alice', 'alice@example.org');
    const organisationId = await createOrganisation(alice, 'Usine');

    expect((await alice.get('/api/me')).json()).toMatchObject({
      organisation: { id: organisationId, name: 'Usine', role: 'admin' },
    });
  });

  it("un invité rejoint l'organisation avec le rôle choisi", async () => {
    const alice = new TestClient(ctx);
    await alice.signUpAndVerify('Alice', 'alice@example.org');
    const organisationId = await createOrganisation(alice, 'Usine');
    const invitationId = await invite(alice, 'bob@example.org', 'membre');
    expect(ctx.emailSender.sent.at(-1)?.subject).toBe('Invitation à rejoindre Usine');

    const bob = new TestClient(ctx);
    await bob.signUpAndVerify('Bob', 'bob@example.org');
    const accept = await bob.post('/api/auth/organization/accept-invitation', { invitationId });
    expect(accept.statusCode).toBe(200);

    expect((await bob.get('/api/me')).json()).toMatchObject({
      organisation: { id: organisationId, role: 'membre' },
    });
  });

  it("une invitation ne peut pas être acceptée par quelqu'un d'autre", async () => {
    const alice = new TestClient(ctx);
    await alice.signUpAndVerify('Alice', 'alice@example.org');
    await createOrganisation(alice, 'Usine');
    const invitationId = await invite(alice, 'bob@example.org', 'membre');

    const eve = new TestClient(ctx);
    await eve.signUpAndVerify('Eve', 'eve@example.org');
    const accept = await eve.post('/api/auth/organization/accept-invitation', { invitationId });
    expect(accept.statusCode).toBeGreaterThanOrEqual(400);
    expect((await eve.get('/api/me')).json()).toMatchObject({ organisation: null });
  });

  it('un membre ne peut pas inviter', async () => {
    const alice = new TestClient(ctx);
    await alice.signUpAndVerify('Alice', 'alice@example.org');
    await createOrganisation(alice, 'Usine');
    const invitationId = await invite(alice, 'bob@example.org', 'membre');
    const bob = new TestClient(ctx);
    await bob.signUpAndVerify('Bob', 'bob@example.org');
    await bob.post('/api/auth/organization/accept-invitation', { invitationId });

    const response = await bob.post('/api/auth/organization/invite-member', {
      email: 'carol@example.org',
      role: 'membre',
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('Cloisonnement entre organisations', () => {
  it("un utilisateur ne peut pas activer l'organisation d'un autre", async () => {
    const alice = new TestClient(ctx);
    await alice.signUpAndVerify('Alice', 'alice@example.org');
    const usineA = await createOrganisation(alice, 'UsineA');
    const bob = new TestClient(ctx);
    await bob.signUpAndVerify('Bob', 'bob@example.org');
    const usineB = await createOrganisation(bob, 'UsineB');

    const response = await alice.post('/api/auth/organization/set-active', {
      organizationId: usineB,
    });
    expect(response.statusCode).toBe(403);
    // Better Auth vide alors l'organisation active, par précaution.
    expect((await alice.get('/test/organisation')).statusCode).toBe(403);

    await alice.post('/api/auth/organization/set-active', { organizationId: usineA });
    expect((await alice.get('/test/organisation')).json()).toEqual({ organisationId: usineA });
  });

  it("un membre retiré perd l'accès même si sa session est encore ouverte", async () => {
    const alice = new TestClient(ctx);
    await alice.signUpAndVerify('Alice', 'alice@example.org');
    const organisationId = await createOrganisation(alice, 'Usine');
    const invitationId = await invite(alice, 'bob@example.org', 'membre');
    const bob = new TestClient(ctx);
    await bob.signUpAndVerify('Bob', 'bob@example.org');
    await bob.post('/api/auth/organization/accept-invitation', { invitationId });
    expect((await bob.get('/test/organisation')).json()).toEqual({ organisationId });

    const removal = await alice.post('/api/auth/organization/remove-member', {
      memberIdOrEmail: 'bob@example.org',
    });
    expect(removal.statusCode).toBe(200);
    expect((await bob.get('/test/organisation')).statusCode).toBe(403);
  });

  it('une route protégée exige une session', async () => {
    expect((await new TestClient(ctx).get('/test/organisation')).statusCode).toBe(401);
  });
});
