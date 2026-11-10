import type { PresignedPost } from '@obsio/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { withOrganisation } from '../src/db/client.js';
import { reserveSource } from '../src/db/schema/index.js';
import { buildTestApp, clientHelpers, resetDatabase, seedReserves, TestClient } from './helpers.js';

const ctx = await buildTestApp();
const { openClient, invite, join } = clientHelpers(ctx);
afterAll(() => ctx.close());

let admin: TestClient;
let membre: TestClient;
let organisationId: string;
let siteId: string;
let td2: string;
let reserveIds: string[];

beforeEach(async () => {
  await resetDatabase();
  ctx.emailSender.sent.length = 0;
  ({ admin, organisationId } = await openClient('Usine Dupont', 'Alice', 'alice@dupont.fr'));
  const invitationId = await invite(admin, 'bob@dupont.fr', 'membre');
  membre = new TestClient(ctx);
  await membre.signUpAndVerify('Bob', 'bob@dupont.fr');
  await join(membre, invitationId);

  siteId = (await admin.post('/api/sites', { name: 'Usine de Lyon' })).json().id;
  const buildingId = (
    await admin.post(`/api/sites/${siteId}/buildings`, { name: 'Atelier' })
  ).json().id;
  const floorId = (await admin.post(`/api/buildings/${buildingId}/floors`, { name: 'RDC' })).json()
    .id;
  td2 = (await admin.post(`/api/floors/${floorId}/equipment`, { type: 'td', name: 'TD2' })).json()
    .id;
  reserveIds = await seedReserves(ctx, organisationId, siteId, 'alice@dupont.fr', 3);
});

async function uploadPhoto(post: PresignedPost) {
  const form = new FormData();
  for (const [name, value] of Object.entries(post.fields)) form.append(name, value);
  // Signature JPEG : l'API vérifie le contenu, pas seulement le type déclaré.
  form.append(
    'file',
    new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], { type: 'image/jpeg' }),
  );
  const response = await fetch(post.url, { method: 'POST', body: form });
  expect(response.ok).toBe(true);
  return post.key;
}

async function createAssignment(ids: string[]) {
  const contractor = (
    await admin.post('/api/contractors', {
      name: 'Marc Volta',
      company: 'Volta Élec',
      email: 'marc@volta.fr',
    })
  ).json();
  const response = await admin.post('/api/assignments', {
    contractorId: contractor.id,
    reserveIds: ids,
    dueDate: '2099-06-30',
    message: 'Merci de passer avant l’été.',
  });
  expect(response.statusCode).toBe(201);
  const created = response.json();
  return { ...created, token: new URL(created.link).pathname.split('/').at(-1)! };
}

describe('suivi des réserves', () => {
  it('liste, filtre, modifie et journalise', async () => {
    const list = await membre.get(`/api/sites/${siteId}/reserves`);
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(3);
    expect(list.json()[0]).toMatchObject({ description: 'Réserve 1', overdue: true });

    const overdue = await membre.get(`/api/sites/${siteId}/reserves?overdue=true`);
    expect(overdue.json()).toHaveLength(1);

    // Seul l'admin modifie ; le journal garde l'avant et l'après.
    const [first] = reserveIds;
    expect((await membre.patch(`/api/reserves/${first}`, { equipmentId: td2 })).statusCode).toBe(
      403,
    );
    expect((await admin.patch(`/api/reserves/${first}`, { equipmentId: td2 })).statusCode).toBe(
      204,
    );
    expect((await membre.post(`/api/reserves/${first}/comments`, { text: 'Vu' })).statusCode).toBe(
      204,
    );
    const byEquipment = await membre.get(`/api/sites/${siteId}/reserves?equipmentId=${td2}`);
    expect(byEquipment.json()).toHaveLength(1);

    const detail = (await membre.get(`/api/reserves/${first}`)).json();
    expect(detail.equipment.name).toBe('TD2');
    expect(detail.events.map((e: { type: string }) => e.type)).toEqual(['modifiee', 'commentaire']);
    expect(detail.events[0].data.equipmentId).toEqual({ before: null, after: td2 });
    expect(detail.events[0].actor).toBe('Alice');
  });

  it('assigne par lien signé, reçoit la preuve de l’intervenant et lève la réserve', async () => {
    const [first, second] = reserveIds as [string, string];
    const created = await createAssignment([first, second]);
    const mail = ctx.emailSender.sent.find((m) => m.to === 'marc@volta.fr');
    expect(mail?.text).toContain(created.link);

    const list = (await admin.get(`/api/sites/${siteId}/reserves`)).json();
    const assigned = list.find((r: { id: string }) => r.id === first);
    expect(assigned).toMatchObject({
      status: 'assignee',
      dueDate: '2099-06-30',
      overdue: false,
      assignedTo: { name: 'Marc Volta' },
    });

    // Vue de l'intervenant, sans session.
    const anonymous = new TestClient(ctx);
    const view = await anonymous.get(`/api/intervention/${created.token}`);
    expect(view.statusCode).toBe(200);
    expect(view.json()).toMatchObject({
      organisationName: 'Usine Dupont',
      contractorName: 'Marc Volta',
      siteNames: ['Usine de Lyon'],
    });
    expect(view.json().reserves).toHaveLength(2);

    // Photo puis preuve « corrigée » ; rejouer le même envoi ne double rien.
    const post = await anonymous.post(`/api/intervention/${created.token}/photos`, {
      reserveId: first,
      contentType: 'image/jpeg',
      size: 4,
    });
    expect(post.statusCode).toBe(200);
    const key = await uploadPhoto(post.json());
    const proof = {
      clientId: crypto.randomUUID(),
      comment: 'DDR 30 mA posé',
      photoKeys: [key],
      markCorrected: true,
    };
    const url = `/api/intervention/${created.token}/reserves/${first}/proofs`;
    expect((await anonymous.post(url, proof)).statusCode).toBe(204);
    expect((await anonymous.post(url, proof)).statusCode).toBe(204);

    const detail = (await admin.get(`/api/reserves/${first}`)).json();
    expect(detail.status).toBe('corrigee');
    expect(detail.proofs).toHaveLength(1);
    expect(detail.proofs[0]).toMatchObject({ author: 'Marc Volta', comment: 'DDR 30 mA posé' });
    expect(detail.proofs[0].photos).toHaveLength(1);
    expect(
      ctx.emailSender.sent.some((m) => m.to === 'alice@dupont.fr' && /corrig/i.test(m.subject)),
    ).toBe(true);

    // Une réserve hors assignation est refusée, comme une photo d'une autre réserve.
    const outside = `/api/intervention/${created.token}/reserves/${reserveIds[2]}/proofs`;
    expect(
      (await anonymous.post(outside, { ...proof, clientId: crypto.randomUUID() })).statusCode,
    ).toBe(404);
    const foreign = await anonymous.post(
      `/api/intervention/${created.token}/reserves/${second}/proofs`,
      { ...proof, clientId: crypto.randomUUID() },
    );
    expect(foreign.statusCode).toBe(400);

    // Refus de la correction, puis levée.
    expect(
      (await membre.post(`/api/reserves/${first}/review`, { decision: 'lever' })).statusCode,
    ).toBe(403);
    await admin.post(`/api/reserves/${first}/review`, {
      decision: 'refuser',
      comment: 'Photo floue',
    });
    expect((await admin.get(`/api/reserves/${first}`)).json().status).toBe('assignee');
    await anonymous.post(url, { ...proof, clientId: crypto.randomUUID() });
    expect(
      (await admin.post(`/api/reserves/${first}/review`, { decision: 'lever' })).statusCode,
    ).toBe(204);
    const closed = (await admin.get(`/api/reserves/${first}`)).json();
    expect(closed.status).toBe('levee');
    expect(closed.events.map((e: { type: string }) => e.type)).toEqual([
      'assignee',
      'preuve',
      'corrigee',
      'correction_refusee',
      'preuve',
      'corrigee',
      'levee',
    ]);

    // La réserve levée sort de la vue de l'intervenant.
    expect(
      (await anonymous.get(`/api/intervention/${created.token}`)).json().reserves,
    ).toHaveLength(1);
  });

  it('suit les réserves en cours de chaque électricien externe', async () => {
    const [first, second] = reserveIds as [string, string];
    const created = await createAssignment([first, second]);
    const follow = await membre.get('/api/contractors/reserves');
    expect(follow.statusCode).toBe(200);
    expect(follow.json()).toHaveLength(2);
    expect(follow.json()[0]).toMatchObject({
      contractorId: created.contractor.id,
      siteName: 'Usine de Lyon',
      status: 'assignee',
      dueDate: '2099-06-30',
      overdue: false,
      linkExpired: false,
    });

    // Lien révoqué : les réserves ne sont plus à sa charge.
    expect((await admin.post(`/api/assignments/${created.id}/revoke`)).statusCode).toBe(204);
    expect((await admin.get('/api/contractors/reserves')).json()).toEqual([]);

    // Une autre organisation ne voit rien.
    await createAssignment([first]);
    const other = await openClient('Usine Martin', 'Chloé', 'chloe@martin.fr');
    expect((await other.admin.get('/api/contractors/reserves')).json()).toEqual([]);
  });

  it('refuse un lien révoqué, inconnu ou expiré', async () => {
    const created = await createAssignment([reserveIds[0]!]);
    const anonymous = new TestClient(ctx);
    expect((await anonymous.get(`/api/intervention/${'x'.repeat(43)}`)).statusCode).toBe(404);

    expect((await admin.post(`/api/assignments/${created.id}/revoke`)).statusCode).toBe(204);
    expect((await anonymous.get(`/api/intervention/${created.token}`)).statusCode).toBe(410);
    const detail = (await admin.get(`/api/reserves/${reserveIds[0]}`)).json();
    expect(detail.status).toBe('ouverte');
    expect(detail.assignedTo).toBeNull();
  });

  it('preuve d’un membre, sans photo étrangère', async () => {
    const [first] = reserveIds as [string];
    const post = (
      await membre.post(`/api/reserves/${first}/photos`, { contentType: 'image/jpeg', size: 4 })
    ).json();
    const key = await uploadPhoto(post);
    const response = await membre.post(`/api/reserves/${first}/proofs`, {
      clientId: crypto.randomUUID(),
      photoKeys: [key],
      markCorrected: true,
    });
    expect(response.statusCode).toBe(204);
    expect((await membre.get(`/api/reserves/${first}`)).json().status).toBe('corrigee');

    const empty = await membre.post(`/api/reserves/${first}/proofs`, {
      clientId: crypto.randomUUID(),
    });
    expect(empty.statusCode).toBe(400);
    const stolen = await membre.post(`/api/reserves/${reserveIds[1]}/proofs`, {
      clientId: crypto.randomUUID(),
      photoKeys: [key],
    });
    expect(stolen.statusCode).toBe(400);
  });

  it('cloisonne les réserves, intervenants et assignations entre organisations', async () => {
    const other = await openClient('Usine Martin', 'Chloé', 'chloe@martin.fr');
    const otherSite = (await other.admin.post('/api/sites', { name: 'Site Martin' })).json().id;
    const [otherReserve] = await seedReserves(
      ctx,
      other.organisationId,
      otherSite,
      'chloe@martin.fr',
      1,
    );

    expect((await admin.get(`/api/sites/${otherSite}/reserves`)).statusCode).toBe(404);
    expect((await admin.get(`/api/reserves/${otherReserve}`)).statusCode).toBe(404);
    expect(
      (await admin.post(`/api/reserves/${otherReserve}/comments`, { text: 'x' })).statusCode,
    ).toBe(404);

    const created = await createAssignment([reserveIds[0]!]);
    expect((await other.admin.get('/api/contractors')).json()).toEqual([]);
    expect((await other.admin.post(`/api/assignments/${created.id}/revoke`)).statusCode).toBe(404);
    const steal = await other.admin.post('/api/assignments', {
      contractorId: created.contractor.id,
      reserveIds: [otherReserve],
      dueDate: null,
    });
    expect(steal.statusCode).toBe(400);

    // Le lien de l'une ne donne pas accès aux réserves de l'autre.
    const anonymous = new TestClient(ctx);
    const cross = await anonymous.post(
      `/api/intervention/${created.token}/reserves/${otherReserve}/proofs`,
      { clientId: crypto.randomUUID(), comment: 'x' },
    );
    expect(cross.statusCode).toBe(404);
    const sources = await withOrganisation(ctx.db, other.organisationId, (tx) =>
      tx.select().from(reserveSource),
    );
    expect(sources).toEqual([]);
  });
});
