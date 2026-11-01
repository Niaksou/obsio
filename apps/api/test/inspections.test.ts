import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { withOrganisation } from '../src/db/client.js';
import { reportDocument, reportImport, reserveSource } from '../src/db/schema/index.js';
import { sendInspectionReminders } from '../src/inspections/reminders.js';
import { buildTestApp, clientHelpers, resetDatabase, seedReserves, TestClient } from './helpers.js';

const ctx = await buildTestApp();
const { openClient, invite, join } = clientHelpers(ctx);
afterAll(() => ctx.close());

let admin: TestClient;
let organisationId: string;
let siteId: string;

beforeEach(async () => {
  await resetDatabase();
  ctx.emailSender.sent.length = 0;
  ({ admin, organisationId } = await openClient('Usine Dupont', 'Alice', 'alice@dupont.fr'));
  siteId = (await admin.post('/api/sites', { name: 'Usine de Lyon' })).json().id;
  const reserveIds = await seedReserves(ctx, organisationId, siteId, 'alice@dupont.fr', 3);
  // Le dernier import validé contient une vérification initiale et un Q18, qui signale deux
  // des trois réserves.
  await withOrganisation(ctx.db, organisationId, async (tx) => {
    const [found] = await tx.select().from(reportImport);
    const [, q18] = await tx
      .insert(reportDocument)
      .values([
        {
          organisationId,
          importId: found!.id,
          siteId,
          position: 0,
          type: 'initiale' as const,
          organisme: 'Bureau Alpha',
          dateVisite: '2026-01-31',
        },
        {
          organisationId,
          importId: found!.id,
          siteId,
          position: 1,
          type: 'q18' as const,
          organisme: 'Organisme Q18',
          dateVisite: '2026-03-12',
        },
      ])
      .returning();
    await tx.insert(reserveSource).values(
      reserveIds.slice(0, 2).map((reserveId, i) => ({
        organisationId,
        reserveId,
        documentId: q18!.id,
        reference: `${i + 1}`,
        description: `Point ${i + 1}`,
        pageSource: 1,
      })),
    );
  });
});

describe('échéancier des vérifications', () => {
  it('calcule les échéances depuis les rapports validés', async () => {
    const response = await admin.get(`/api/sites/${siteId}/inspections`);
    expect(response.statusCode).toBe(200);
    const [periodique, q18, q19] = response.json();
    expect(periodique).toMatchObject({
      kind: 'periodique',
      lastVisit: { date: '2026-01-31', organisme: 'Bureau Alpha' },
      dueDate: '2027-01-31',
      periodicityMonths: 12,
    });
    expect(q18).toMatchObject({ kind: 'q18', dueDate: '2027-03-12' });
    expect(q19).toMatchObject({ kind: 'q19', dueDate: null, status: 'inconnue' });

    const all = (await admin.get('/api/inspections')).json();
    expect(all).toHaveLength(3);
  });

  it('l’admin règle la périodicité, la visite programmée et le contact ; un membre consulte', async () => {
    const update = await admin.put(`/api/sites/${siteId}/inspections/q18`, {
      enabled: true,
      periodicityMonths: 24,
      plannedDate: '2028-02-15',
      contact: '  ',
    });
    expect(update.statusCode).toBe(200);
    expect(update.json()).toMatchObject({
      dueDate: '2028-03-12',
      plannedDate: '2028-02-15',
      status: 'programmee',
      contact: null,
    });
    const disable = await admin.put(`/api/sites/${siteId}/inspections/q19`, {
      enabled: false,
      periodicityMonths: 12,
      plannedDate: null,
      contact: 'Thermo Services, 04 00 00 00 00',
    });
    expect(disable.json()).toMatchObject({
      status: 'desactivee',
      contact: 'Thermo Services, 04 00 00 00 00',
    });

    const invitationId = await invite(admin, 'bob@dupont.fr', 'membre');
    const bob = new TestClient(ctx);
    await bob.signUpAndVerify('Bob', 'bob@dupont.fr');
    await join(bob, invitationId);
    expect((await bob.get(`/api/sites/${siteId}/inspections`)).statusCode).toBe(200);
    const refused = await bob.put(`/api/sites/${siteId}/inspections/q18`, {
      enabled: true,
      periodicityMonths: 12,
      plannedDate: null,
      contact: null,
    });
    expect(refused.statusCode).toBe(403);
  });

  it('une autre organisation ne voit ni ne règle l’échéancier', async () => {
    await admin.put(`/api/sites/${siteId}/inspections/q18`, {
      enabled: true,
      periodicityMonths: 12,
      plannedDate: '2027-02-01',
      contact: 'Interlocuteur confidentiel',
    });
    const other = await openClient('Usine Martin', 'Chloé', 'chloe@martin.fr');
    expect((await other.admin.get(`/api/sites/${siteId}/inspections`)).statusCode).toBe(404);
    expect((await other.admin.get('/api/inspections')).json()).toEqual([]);
    const write = await other.admin.put(`/api/sites/${siteId}/inspections/q18`, {
      enabled: false,
      periodicityMonths: 12,
      plannedDate: null,
      contact: null,
    });
    expect(write.statusCode).toBe(404);
    const mine = (await admin.get(`/api/sites/${siteId}/inspections`)).json();
    expect(mine[1]).toMatchObject({ enabled: true, contact: 'Interlocuteur confidentiel' });
  });

  it('relance 60 et 30 jours avant l’échéance, puis le lendemain ; rappelle la visite programmée', async () => {
    const mails = () => ctx.emailSender.sent.map((m) => m.subject);
    const start = ctx.emailSender.sent.length;

    // Échéance de la périodique : 31 janvier 2027.
    expect(await sendInspectionReminders(ctx, '2026-12-02')).toBe(1);
    expect(mails().at(-1)).toBe(
      'Usine de Lyon : vérification à programmer avant le 31 janvier 2027',
    );
    expect(await sendInspectionReminders(ctx, '2026-12-03')).toBe(0);
    expect(await sendInspectionReminders(ctx, '2027-01-01')).toBe(1);
    expect(await sendInspectionReminders(ctx, '2027-02-01')).toBe(1);
    expect(mails().at(-1)).toBe('Usine de Lyon : vérification en retard');

    // Visite Q18 programmée le 1er mars : rappel 7 jours avant, avec les réserves du Q18.
    await admin.put(`/api/sites/${siteId}/inspections/q18`, {
      enabled: true,
      periodicityMonths: 12,
      plannedDate: '2027-03-01',
      contact: null,
    });
    expect(await sendInspectionReminders(ctx, '2027-02-22')).toBe(1);
    const visit = ctx.emailSender.sent.at(-1)!;
    expect(visit.subject).toBe("Usine de Lyon : visite de l'organisme le 1 mars 2027");
    expect(visit.text).toContain(
      '2 réserves relevées lors de la visite précédente sont encore en cours',
    );
    expect(await sendInspectionReminders(ctx, '2027-03-08')).toBe(1);
    expect(mails().at(-1)).toBe('Usine de Lyon : rapport de vérification à importer');
    expect(ctx.emailSender.sent.slice(start).every((m) => m.to === 'alice@dupont.fr')).toBe(true);
  });
});
