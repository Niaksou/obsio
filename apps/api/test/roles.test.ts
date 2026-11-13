import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { member, user } from '../src/db/schema/index.js';
import { buildTestApp, clientHelpers, resetDatabase, seedReserves, TestClient } from './helpers.js';

const ctx = await buildTestApp();
const { openClient, invite, join } = clientHelpers(ctx);
afterAll(() => ctx.close());

let alice: TestClient;
let organisationId: string;

beforeEach(async () => {
  await resetDatabase();
  ctx.emailSender.sent.length = 0;
  ({ admin: alice, organisationId } = await openClient('Usine Dupont', 'Alice', 'alice@dupont.fr'));
});

async function newMember(
  by: TestClient,
  name: string,
  email: string,
  role: 'admin' | 'responsable' | 'collaborateur',
) {
  const invitationId = await invite(by, email, role);
  const client = new TestClient(ctx);
  await client.signUpAndVerify(name, email);
  await join(client, invitationId);
  const [row] = await ctx.db
    .select({ memberId: member.id, userId: user.id })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(user.email, email), eq(member.organisationId, organisationId)));
  return { client, ...row! };
}

const updateRole = (client: TestClient, memberId: string, role: string) =>
  client.post('/api/auth/organization/update-member-role', { memberId, role });
const remove = (client: TestClient, memberIdOrEmail: string) =>
  client.post('/api/auth/organization/remove-member', { memberIdOrEmail });

describe('Rôles : qui agit sur qui', () => {
  it('le premier admin est fondateur : personne ne le modifie ni ne le retire', async () => {
    const founders = await ctx.db
      .select({ email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.organisationId, organisationId), eq(member.founder, true)));
    expect(founders).toEqual([{ email: 'alice@dupont.fr' }]);

    const dan = await newMember(alice, 'Dan', 'dan@dupont.fr', 'admin');
    const [aliceMember] = await ctx.db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organisationId, organisationId), eq(member.founder, true)));
    expect((await updateRole(dan.client, aliceMember!.id, 'collaborateur')).statusCode).toBe(403);
    expect((await remove(dan.client, 'alice@dupont.fr')).statusCode).toBe(403);
    expect((await updateRole(alice, aliceMember!.id, 'responsable')).statusCode).toBe(403);
    expect(
      (await alice.post('/api/auth/organization/leave', { organizationId: organisationId }))
        .statusCode,
    ).toBe(403);

    // Le second admin n'est pas fondateur : le fondateur le gère.
    expect((await updateRole(alice, dan.memberId, 'responsable')).statusCode).toBe(200);
    expect((await alice.get('/api/me')).json().organisation.role).toBe('admin');
  });

  it('l’admin gère tout le monde ; le responsable seulement les collaborateurs', async () => {
    const bob = await newMember(alice, 'Bob', 'bob@dupont.fr', 'responsable');
    const dan = await newMember(alice, 'Dan', 'dan@dupont.fr', 'admin');
    const carole = await newMember(bob.client, 'Carole', 'carole@dupont.fr', 'collaborateur');

    // Le responsable n'invite que des collaborateurs.
    for (const role of ['admin', 'responsable']) {
      const refused = await bob.client.post('/api/auth/organization/invite-member', {
        email: `x-${role}@dupont.fr`,
        role,
      });
      expect(refused.statusCode).toBe(403);
    }
    // Ni promotion, ni action sur un admin ou un autre responsable.
    expect((await updateRole(bob.client, carole.memberId, 'responsable')).statusCode).toBe(403);
    expect((await updateRole(bob.client, dan.memberId, 'collaborateur')).statusCode).toBe(403);
    expect((await remove(bob.client, 'dan@dupont.fr')).statusCode).toBe(403);

    // Le collaborateur n'agit sur personne.
    const invited = await carole.client.post('/api/auth/organization/invite-member', {
      email: 'y@dupont.fr',
      role: 'collaborateur',
    });
    expect(invited.statusCode).toBe(403);
    expect((await remove(carole.client, 'bob@dupont.fr')).statusCode).toBe(403);

    // Le responsable retire un collaborateur ; l'admin rétrograde un autre admin.
    expect((await remove(bob.client, 'carole@dupont.fr')).statusCode).toBe(200);
    expect((await updateRole(alice, dan.memberId, 'collaborateur')).statusCode).toBe(200);
    expect((await remove(alice, 'bob@dupont.fr')).statusCode).toBe(200);
  });
});

describe('Rôles : le collaborateur ne voit que ses réserves', () => {
  it('refuse le reste de l’organisation et filtre ce qu’il peut ouvrir', async () => {
    const carole = await newMember(alice, 'Carole', 'carole@dupont.fr', 'collaborateur');
    const siteId = (await alice.post('/api/sites', { name: 'Usine de Lyon' })).json().id;
    const buildingId = (
      await alice.post(`/api/sites/${siteId}/buildings`, { name: 'Atelier' })
    ).json().id;
    const floorId = (
      await alice.post(`/api/buildings/${buildingId}/floors`, { name: 'RDC' })
    ).json().id;
    const otherFloorId = (
      await alice.post(`/api/buildings/${buildingId}/floors`, { name: 'R+1' })
    ).json().id;
    const td1 = (
      await alice.post(`/api/floors/${floorId}/equipment`, { type: 'td', name: 'TD1' })
    ).json().id;
    await alice.post(`/api/floors/${floorId}/equipment`, { type: 'td', name: 'TD2' });
    const [mine, other] = (await seedReserves(
      ctx,
      organisationId,
      siteId,
      'alice@dupont.fr',
      2,
    )) as [string, string];
    expect((await alice.patch(`/api/reserves/${mine}`, { equipmentId: td1 })).statusCode).toBe(204);
    const assigned = await alice.post('/api/collaborator-assignments', {
      userIds: [carole.userId],
      reserveIds: [mine],
    });
    expect(assigned.statusCode).toBe(204);
    const c = carole.client;

    // Rien de l'organisation en dehors de ses réserves.
    for (const path of [
      '/api/sites',
      `/api/sites/${siteId}`,
      `/api/sites/${siteId}/buildings`,
      `/api/sites/${siteId}/dashboard`,
      `/api/sites/${siteId}/imports`,
      `/api/sites/${siteId}/inspections`,
      `/api/sites/${siteId}/equipment`,
      '/api/inspections',
      '/api/contractors',
      '/api/contractors/reserves',
    ]) {
      expect((await c.get(path)).statusCode, path).toBe(403);
    }
    expect((await c.post('/api/sites', { name: 'Intrus' })).statusCode).toBe(403);
    expect((await c.patch(`/api/reserves/${mine}`, { dueDate: '2099-01-01' })).statusCode).toBe(
      403,
    );

    // Ses réserves : liste, détail, commentaire et plan de l'étage, rien d'autre.
    expect((await c.get('/api/me/reserves')).json().map((r: { id: string }) => r.id)).toEqual([
      mine,
    ]);
    const list = (await c.get(`/api/sites/${siteId}/reserves`)).json();
    expect(list.map((r: { id: string }) => r.id)).toEqual([mine]);
    expect((await c.get(`/api/reserves/${mine}`)).statusCode).toBe(200);
    expect((await c.get(`/api/reserves/${other}`)).statusCode).toBe(404);
    expect(
      (await c.post(`/api/reserves/${mine}/comments`, { text: 'Je passe demain' })).statusCode,
    ).toBe(204);
    expect((await c.post(`/api/reserves/${other}/comments`, { text: 'Intrus' })).statusCode).toBe(
      404,
    );
    expect(
      (
        await c.post(`/api/reserves/${other}/proofs`, {
          clientId: crypto.randomUUID(),
          comment: 'Fait',
          markCorrected: true,
        })
      ).statusCode,
    ).toBe(404);
    expect((await c.get(`/api/floors/${floorId}`)).statusCode).toBe(200);
    expect(
      (await c.get(`/api/floors/${floorId}/equipment`)).json().map((e: { id: string }) => e.id),
    ).toEqual([td1]);
    expect((await c.get(`/api/floors/${floorId}/zones`)).json()).toEqual([]);
    expect((await c.get(`/api/floors/${otherFloorId}`)).statusCode).toBe(404);

    // Une fois la réserve retirée, elle reste lisible mais il n'y agit plus.
    await alice.post(`/api/reserves/${mine}/collaborators/${carole.userId}/remove`);
    expect((await c.get(`/api/reserves/${mine}`)).statusCode).toBe(200);
    expect((await c.post(`/api/reserves/${mine}/comments`, { text: 'Encore' })).statusCode).toBe(
      404,
    );
  });
});
