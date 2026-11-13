import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { withOrganisation } from '../src/db/client.js';
import { reserveMember, user } from '../src/db/schema/index.js';
import { buildTestApp, clientHelpers, resetDatabase, seedReserves, TestClient } from './helpers.js';

const ctx = await buildTestApp();
const { openClient, invite, join } = clientHelpers(ctx);
afterAll(() => ctx.close());

let admin: TestClient;
let bob: TestClient;
let carol: TestClient;
let organisationId: string;
let siteId: string;
let reserveIds: string[];
let bobId: string;
let carolId: string;

async function newMember(name: string, email: string) {
  const invitationId = await invite(admin, email, 'collaborateur');
  const client = new TestClient(ctx);
  await client.signUpAndVerify(name, email);
  await join(client, invitationId);
  const [row] = await ctx.db.select({ id: user.id }).from(user).where(eq(user.email, email));
  return { client, id: row!.id };
}

beforeEach(async () => {
  await resetDatabase();
  ctx.emailSender.sent.length = 0;
  ({ admin, organisationId } = await openClient('Usine Dupont', 'Alice', 'alice@dupont.fr'));
  ({ client: bob, id: bobId } = await newMember('Bob', 'bob@dupont.fr'));
  ({ client: carol, id: carolId } = await newMember('Carol', 'carol@dupont.fr'));
  siteId = (await admin.post('/api/sites', { name: 'Usine de Lyon' })).json().id;
  reserveIds = await seedReserves(ctx, organisationId, siteId, 'alice@dupont.fr', 3);
  ctx.emailSender.sent.length = 0;
});

const assign = (client: TestClient, body: object) =>
  client.post('/api/collaborator-assignments', body);

describe('Réserves confiées à des collaborateurs', () => {
  it('confie plusieurs réserves à plusieurs collaborateurs, prévenus par e-mail', async () => {
    const [first, second] = reserveIds as [string, string];
    const response = await assign(admin, {
      userIds: [bobId, carolId],
      reserveIds: [first, second],
      dueDate: '2099-06-30',
      message: 'Avant l’arrêt technique.',
    });
    expect(response.statusCode).toBe(204);

    const mails = ctx.emailSender.sent.filter((m) => m.subject.includes('2 réserves'));
    expect(mails.map((m) => m.to).sort()).toEqual(['bob@dupont.fr', 'carol@dupont.fr']);
    expect(mails[0]!.text).toContain('Alice vous confie 2 réserves');
    expect(mails[0]!.text).toContain('/mes-reserves');

    const list = (await bob.get(`/api/sites/${siteId}/reserves`)).json();
    const item = list.find((r: { id: string }) => r.id === first);
    expect(item).toMatchObject({ status: 'assignee', dueDate: '2099-06-30' });
    expect(item.collaborators.map((c: { name: string }) => c.name)).toEqual(['Bob', 'Carol']);

    const mine = (await bob.get(`/api/sites/${siteId}/reserves?mine=true`)).json();
    expect(mine.map((r: { id: string }) => r.id).sort()).toEqual([first, second].sort());
    const myReserves = (await bob.get('/api/me/reserves')).json();
    expect(myReserves).toHaveLength(2);
    expect(myReserves[0].siteName).toBe('Usine de Lyon');
    expect((await admin.get('/api/me/reserves')).json()).toEqual([]);

    const detail = (await bob.get(`/api/reserves/${first}`)).json();
    expect(detail.events.map((e: { type: string }) => e.type)).toEqual([
      'collaborateur_assigne',
      'collaborateur_assigne',
    ]);
    expect(
      detail.events.map((e: { data: { collaborator: string } }) => e.data.collaborator).sort(),
    ).toEqual(['Bob', 'Carol']);

    // Réassigner les mêmes ne crée pas de doublon ni de nouvel e-mail.
    ctx.emailSender.sent.length = 0;
    expect((await assign(admin, { userIds: [bobId], reserveIds: [first] })).statusCode).toBe(204);
    expect(ctx.emailSender.sent).toEqual([]);
    expect((await bob.get(`/api/reserves/${first}`)).json().collaborators).toHaveLength(2);
  });

  it('la preuve « corrigée » d’un collaborateur fait passer la réserve à corrigée', async () => {
    const [first] = reserveIds as [string];
    await assign(admin, { userIds: [bobId, carolId], reserveIds: [first] });
    const proof = await bob.post(`/api/reserves/${first}/proofs`, {
      clientId: crypto.randomUUID(),
      comment: 'Disjoncteur remplacé.',
      markCorrected: true,
    });
    expect(proof.statusCode).toBe(204);
    expect((await carol.get(`/api/reserves/${first}`)).json().status).toBe('corrigee');
    expect((await bob.get('/api/me/reserves')).json()[0].status).toBe('corrigee');

    // Correction refusée : elle reste confiée aux collaborateurs.
    await admin.post(`/api/reserves/${first}/review`, { decision: 'refuser' });
    expect((await bob.get(`/api/reserves/${first}`)).json().status).toBe('assignee');
    const again = await assign(admin, { userIds: [bobId], reserveIds: [first] });
    expect(again.statusCode).toBe(204);
  });

  it('retire un collaborateur ; sans personne d’autre, la réserve redevient ouverte', async () => {
    const [first] = reserveIds as [string];
    await assign(admin, { userIds: [bobId, carolId], reserveIds: [first] });
    const remove = (userId: string) =>
      admin.post(`/api/reserves/${first}/collaborators/${userId}/remove`);
    expect((await remove(bobId)).statusCode).toBe(204);
    expect((await remove(bobId)).statusCode).toBe(404);
    expect((await admin.get(`/api/reserves/${first}`)).json().status).toBe('assignee');
    expect((await remove(carolId)).statusCode).toBe(204);
    const detail = (await admin.get(`/api/reserves/${first}`)).json();
    expect(detail).toMatchObject({ status: 'ouverte', collaborators: [] });
    expect(detail.events.at(-1)).toMatchObject({
      type: 'collaborateur_retire',
      data: { collaborator: 'Carol' },
    });
    // L'historique reste en base.
    const rows = await withOrganisation(ctx.db, organisationId, (tx) =>
      tx.select().from(reserveMember),
    );
    expect(rows).toHaveLength(2);
  });

  it('réservé à l’admin, aux membres de l’organisation et aux réserves en cours', async () => {
    const [first] = reserveIds as [string];
    expect((await assign(bob, { userIds: [carolId], reserveIds: [first] })).statusCode).toBe(403);
    expect(
      (await bob.post(`/api/reserves/${first}/collaborators/${carolId}/remove`)).statusCode,
    ).toBe(403);

    const stranger = await openClient('Usine Martin', 'Chloé', 'chloe@martin.fr');
    const [chloe] = await ctx.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, 'chloe@martin.fr'));
    const outsider = await assign(admin, { userIds: [chloe!.id], reserveIds: [first] });
    expect(outsider.statusCode).toBe(400);

    // Cloisonnement : l'autre organisation ne voit ni ne confie les réserves d'ici.
    const otherSite = (await stranger.admin.post('/api/sites', { name: 'Site Martin' })).json().id;
    const [otherReserve] = await seedReserves(
      ctx,
      stranger.organisationId,
      otherSite,
      'chloe@martin.fr',
      1,
    );
    expect((await assign(admin, { userIds: [bobId], reserveIds: [otherReserve] })).statusCode).toBe(
      400,
    );
    await assign(admin, { userIds: [bobId], reserveIds: [first] });
    expect(
      (await stranger.admin.post(`/api/reserves/${first}/collaborators/${bobId}/remove`))
        .statusCode,
    ).toBe(404);
    const seen = await withOrganisation(ctx.db, stranger.organisationId, (tx) =>
      tx.select().from(reserveMember),
    );
    expect(seen).toEqual([]);
  });

  it('un membre retiré de l’organisation n’a plus de réserve confiée', async () => {
    const [first] = reserveIds as [string];
    await assign(admin, { userIds: [bobId], reserveIds: [first] });
    const removal = await admin.post('/api/auth/organization/remove-member', {
      memberIdOrEmail: 'bob@dupont.fr',
    });
    expect(removal.statusCode).toBe(200);
    const detail = (await admin.get(`/api/reserves/${first}`)).json();
    expect(detail).toMatchObject({ status: 'ouverte', collaborators: [] });
  });
});
