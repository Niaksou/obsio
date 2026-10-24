import { PLAN_IMAGE_MAX_BYTES, type PresignedPost } from '@obsio/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, clientHelpers, resetDatabase, TestClient } from './helpers.js';

const ctx = await buildTestApp();
const { openClient, invite, join } = clientHelpers(ctx);

afterAll(() => ctx.close());

let admin: TestClient;
let membre: TestClient;

beforeEach(async () => {
  await resetDatabase();
  ctx.emailSender.sent.length = 0;
  ({ admin } = await openClient('Usine Dupont', 'Alice', 'alice@dupont.fr'));
  const invitationId = await invite(admin, 'bob@dupont.fr', 'membre');
  membre = new TestClient(ctx);
  await membre.signUpAndVerify('Bob', 'bob@dupont.fr');
  await join(membre, invitationId);
});

/** Crée site, bâtiment et étage en tant qu'admin et renvoie leurs identifiants. */
async function createFloor(client = admin) {
  const site = (
    await client.post('/api/sites', { name: 'Usine de Lyon', address: '1 rue X' })
  ).json();
  const building = (
    await client.post(`/api/sites/${site.id}/buildings`, { name: 'Atelier' })
  ).json();
  const floor = (
    await client.post(`/api/buildings/${building.id}/floors`, { name: 'Rez-de-chaussée' })
  ).json();
  return {
    siteId: site.id as string,
    buildingId: building.id as string,
    floorId: floor.id as string,
  };
}

/** Envoie un fichier au stockage avec le formulaire signé, comme le fera le navigateur. */
async function upload(post: PresignedPost, body: Uint8Array, contentType: string) {
  const form = new FormData();
  for (const [name, value] of Object.entries(post.fields)) form.append(name, value);
  form.append('file', new Blob([body], { type: contentType }));
  return fetch(post.url, { method: 'POST', body: form });
}

describe('Sites, bâtiments, étages et équipements', () => {
  it("l'admin crée la hiérarchie et un membre la consulte", async () => {
    const { siteId, buildingId, floorId } = await createFloor();
    const created = await admin.post(`/api/floors/${floorId}/equipment`, {
      type: 'machine',
      name: 'Presse 3',
      aliases: ['presse hydraulique'],
      position: { x: 0.25, y: 0.75 },
    });
    expect(created.statusCode).toBe(201);

    expect((await membre.get('/api/sites')).json()).toEqual([
      { id: siteId, name: 'Usine de Lyon', address: '1 rue X' },
    ]);
    expect((await membre.get(`/api/sites/${siteId}/buildings`)).json()).toEqual([
      { id: buildingId, siteId, name: 'Atelier' },
    ]);
    expect((await membre.get(`/api/buildings/${buildingId}/floors`)).json()).toEqual([
      { id: floorId, buildingId, name: 'Rez-de-chaussée', level: 0, plan: null },
    ]);
    expect((await membre.get(`/api/floors/${floorId}/equipment`)).json()).toEqual([
      {
        id: created.json().id,
        floorId,
        type: 'machine',
        name: 'Presse 3',
        aliases: ['presse hydraulique'],
        position: { x: 0.25, y: 0.75 },
      },
    ]);
  });

  it('un membre ne peut rien créer ni modifier', async () => {
    const { siteId, floorId } = await createFloor();
    expect((await membre.post('/api/sites', { name: 'Intrus' })).statusCode).toBe(403);
    expect((await membre.patch(`/api/sites/${siteId}`, { name: 'Renommé' })).statusCode).toBe(403);
    expect(
      (await membre.post(`/api/floors/${floorId}/equipment`, { type: 'td', name: 'TD9' }))
        .statusCode,
    ).toBe(403);
    expect((await membre.post(`/api/sites/${siteId}/archive`)).statusCode).toBe(403);
  });

  it("une autre organisation ne voit ni ne modifie rien de l'organisation", async () => {
    const { siteId, floorId } = await createFloor();
    const { admin: other } = await openClient('Usine Martin', 'Carol', 'carol@martin.fr');

    expect((await other.get('/api/sites')).json()).toEqual([]);
    expect((await other.get(`/api/sites/${siteId}`)).statusCode).toBe(404);
    expect((await other.get(`/api/floors/${floorId}`)).statusCode).toBe(404);
    expect((await other.patch(`/api/sites/${siteId}`, { name: 'Piraté' })).statusCode).toBe(404);
    expect(
      (await other.post(`/api/floors/${floorId}/equipment`, { type: 'td', name: 'TD9' }))
        .statusCode,
    ).toBe(404);
    expect((await admin.get(`/api/sites/${siteId}`)).json().name).toBe('Usine de Lyon');
  });

  it('modifie un équipement : position, retrait du plan, valeurs refusées', async () => {
    const { floorId } = await createFloor();
    const { id } = (
      await admin.post(`/api/floors/${floorId}/equipment`, { type: 'td', name: 'TD2' })
    ).json();
    expect((await admin.get(`/api/floors/${floorId}/equipment`)).json()[0].position).toBeNull();

    const moved = await admin.patch(`/api/equipment/${id}`, { position: { x: 0.1, y: 0.2 } });
    expect(moved.json()).toMatchObject({ name: 'TD2', position: { x: 0.1, y: 0.2 } });
    const removed = await admin.patch(`/api/equipment/${id}`, { position: null });
    expect(removed.json().position).toBeNull();

    expect(
      (await admin.patch(`/api/equipment/${id}`, { position: { x: 1.5, y: 0 } })).statusCode,
    ).toBe(400);
    expect((await admin.patch(`/api/equipment/${id}`, { type: 'inconnu' })).statusCode).toBe(400);
    expect((await admin.patch(`/api/equipment/${id}`, { name: '  ' })).statusCode).toBe(400);
  });

  it("l'archivage masque la ligne et interdit d'y rattacher quoi que ce soit", async () => {
    const { siteId, buildingId } = await createFloor();
    expect((await admin.post(`/api/buildings/${buildingId}/archive`)).statusCode).toBe(204);
    expect((await admin.get(`/api/sites/${siteId}/buildings`)).json()).toEqual([]);
    expect(
      (await admin.post(`/api/buildings/${buildingId}/floors`, { name: 'R+1' })).statusCode,
    ).toBe(404);
    expect((await admin.post(`/api/buildings/${buildingId}/archive`)).statusCode).toBe(404);
  });
});

describe("Plan d'un étage", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

  it('envoi direct au stockage, confirmation, puis lecture par lien signé', async () => {
    const { floorId } = await createFloor();
    const uploads = await admin.post(`/api/floors/${floorId}/plan/uploads`, {
      source: { contentType: 'application/pdf', size: 5 },
      image: { contentType: 'image/png', size: png.length },
    });
    expect(uploads.statusCode).toBe(200);
    const { source, image } = uploads.json();
    expect((await upload(source, new TextEncoder().encode('%PDF-'), 'application/pdf')).ok).toBe(
      true,
    );
    expect((await upload(image, png, 'image/png')).ok).toBe(true);

    const confirmed = await admin.put(`/api/floors/${floorId}/plan`, {
      imageKey: image.key,
      sourceKey: source.key,
      width: 2000,
      height: 1400,
    });
    expect(confirmed.json().plan).toEqual({ width: 2000, height: 1400 });

    const detail = (await membre.get(`/api/floors/${floorId}`)).json();
    const fetched = await fetch(detail.plan.imageUrl);
    expect(new Uint8Array(await fetched.arrayBuffer())).toEqual(png);
    expect(detail.plan.sourceUrl).toEqual(expect.any(String));
  });

  it('refuse un fichier trop gros ou un type modifié dans le formulaire signé', async () => {
    const { floorId } = await createFloor();
    const { image } = (
      await admin.post(`/api/floors/${floorId}/plan/uploads`, {
        source: null,
        image: { contentType: 'image/png', size: png.length },
      })
    ).json();
    // Le stockage vérifie la signature : type de contenu et taille maximale.
    const tampered = { ...image, fields: { ...image.fields, 'Content-Type': 'image/svg+xml' } };
    expect((await upload(tampered, png, 'image/svg+xml')).ok).toBe(false);
    const tooBig = new Uint8Array(PLAN_IMAGE_MAX_BYTES + 1);
    expect((await upload(image, tooBig, 'image/png')).ok).toBe(false);
    // L'API refuse aussi une taille annoncée au-delà de la limite.
    expect(
      (
        await admin.post(`/api/floors/${floorId}/plan/uploads`, {
          source: null,
          image: { contentType: 'image/png', size: 31 * 1024 * 1024 },
        })
      ).statusCode,
    ).toBe(400);
  });

  it('refuse de confirmer un fichier absent ou rangé sous un autre étage', async () => {
    const { floorId } = await createFloor();
    const other = await createFloor();
    const { image } = (
      await admin.post(`/api/floors/${other.floorId}/plan/uploads`, {
        source: null,
        image: { contentType: 'image/png', size: png.length },
      })
    ).json();
    await upload(image, png, 'image/png');

    const foreign = { imageKey: image.key, sourceKey: null, width: 10, height: 10 };
    expect((await admin.put(`/api/floors/${floorId}/plan`, foreign)).statusCode).toBe(400);

    const { image: notSent } = (
      await admin.post(`/api/floors/${floorId}/plan/uploads`, {
        source: null,
        image: { contentType: 'image/png', size: png.length },
      })
    ).json();
    const absent = { imageKey: notSent.key, sourceKey: null, width: 10, height: 10 };
    expect((await admin.put(`/api/floors/${floorId}/plan`, absent)).statusCode).toBe(400);
  });
});
