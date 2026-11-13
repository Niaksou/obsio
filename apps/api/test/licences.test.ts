import { defaultLicence, parisDate, type Licence } from '@obsio/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { withOrganisation } from '../src/db/client.js';
import { licence } from '../src/db/schema/index.js';
import { saveLicence } from '../src/licences/licence.js';
import { buildTestApp, clientHelpers, resetDatabase, seedReserves, TestClient } from './helpers.js';

const ctx = await buildTestApp();
const { openClient, invite } = clientHelpers(ctx);
afterAll(() => ctx.close());

let admin: TestClient;
let organisationId: string;

beforeEach(async () => {
  await resetDatabase();
  ctx.emailSender.sent.length = 0;
  ({ admin, organisationId } = await openClient('Usine Dupont', 'Alice', 'alice@dupont.fr'));
});

function setLicence(changes: Partial<Licence>, orgId = organisationId) {
  return withOrganisation(ctx.db, orgId, (tx) =>
    saveLicence(tx, orgId, { ...defaultLicence('2026-01-01'), ...changes }),
  );
}

describe('licence d’un client', () => {
  it('ouvre chaque client avec une licence standard sans échéance', async () => {
    const me = (await admin.get('/api/me')).json();
    expect(me.organisation.licence).toEqual({
      plan: 'standard',
      access: 'complet',
      reason: null,
      endsOn: null,
      daysLeft: null,
    });
    const rows = await withOrganisation(ctx.db, organisationId, (tx) => tx.select().from(licence));
    expect(rows).toMatchObject([{ plan: 'standard', status: 'active', startsOn: parisDate() }]);
  });

  it('laisse consulter et exporter un client révoqué, sans rien ajouter', async () => {
    const siteId = (await admin.post('/api/sites', { name: 'Lyon' })).json().id;
    const [reserveId] = await seedReserves(ctx, organisationId, siteId, 'alice@dupont.fr', 1);
    const contractor = (
      await admin.post('/api/contractors', { name: 'Marc', company: 'Volta', email: 'm@volta.fr' })
    ).json();
    const assignment = (
      await admin.post('/api/assignments', {
        contractorId: contractor.id,
        reserveIds: [reserveId],
        dueDate: '2099-06-30',
      })
    ).json();
    const token = new URL(assignment.link).pathname.split('/').at(-1)!;

    await setLicence({ status: 'revoquee' });

    expect((await admin.get('/api/me')).json().organisation.licence).toMatchObject({
      access: 'lecture',
      reason: 'revoquee',
    });
    expect((await admin.get(`/api/sites/${siteId}/reserves`)).statusCode).toBe(200);
    expect((await admin.get(`/api/sites/${siteId}/proof-dossier`)).statusCode).not.toBe(403);

    const refused = await admin.post('/api/sites', { name: 'Grenoble' });
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toMatchObject({ code: 'LICENCE_READ_ONLY' });
    expect(
      (await admin.post(`/api/reserves/${reserveId}/comments`, { text: 'Vu' })).statusCode,
    ).toBe(403);
    expect(
      (
        await admin.post('/api/auth/organization/invite-member', {
          email: 'bob@dupont.fr',
          role: 'membre',
        })
      ).statusCode,
    ).toBe(403);

    // L'électricien garde la vue de son lien, mais ne dépose plus de preuve.
    const anonymous = new TestClient(ctx);
    expect((await anonymous.get(`/api/intervention/${token}`)).statusCode).toBe(200);
    const photo = await anonymous.post(`/api/intervention/${token}/photos`, {
      reserveId,
      contentType: 'image/jpeg',
      size: 4,
    });
    expect(photo.statusCode).toBe(403);
  });

  it('passe en lecture seule le lendemain de l’échéance', async () => {
    await setLicence({ endsOn: '2026-01-31' });
    expect((await admin.get('/api/me')).json().organisation.licence).toMatchObject({
      access: 'lecture',
      reason: 'expiree',
    });
    expect((await admin.post('/api/sites', { name: 'Lyon' })).statusCode).toBe(403);
  });

  it('borne les sites, les utilisateurs et les analyses du mois', async () => {
    await setLicence({ maxSites: 1, maxMembers: 2, maxAnalysesPerMonth: 1 });

    const siteId = (await admin.post('/api/sites', { name: 'Lyon' })).json().id;
    const second = await admin.post('/api/sites', { name: 'Grenoble' });
    expect(second.statusCode).toBe(403);
    expect(second.json().message).toContain('1 site');

    // Alice et une invitation en attente : la licence est pleine.
    await invite(admin, 'bob@dupont.fr', 'membre');
    const third = await admin.post('/api/auth/organization/invite-member', {
      email: 'carol@dupont.fr',
      role: 'membre',
    });
    expect(third.statusCode).toBe(403);
    expect(third.json().message).toContain('2 utilisateurs');
    // Relancer la même personne remplace son invitation : permis.
    await invite(admin, 'bob@dupont.fr', 'membre');

    await seedReserves(ctx, organisationId, siteId, 'alice@dupont.fr', 1);
    const upload = await admin.post(`/api/sites/${siteId}/imports/upload`, {
      fileName: 'rapport.pdf',
      size: 20,
    });
    expect(upload.statusCode).toBe(403);
    expect(upload.json().message).toContain('1 analyses de rapport par mois');
  });

  it('reste invisible des autres organisations', async () => {
    const other = await openClient('Autre', 'Carol', 'carol@autre.fr');
    await setLicence({ plan: 'sur_mesure', note: 'Remise négociée' });
    const seen = await withOrganisation(ctx.db, other.organisationId, (tx) =>
      tx.select().from(licence),
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ organisationId: other.organisationId, plan: 'standard' });
    // Écrire la licence d'un autre client depuis son contexte est refusé par la RLS.
    await expect(
      withOrganisation(ctx.db, other.organisationId, (tx) =>
        saveLicence(tx, organisationId, defaultLicence('2026-01-01')),
      ),
    ).rejects.toThrow();
  });
});
