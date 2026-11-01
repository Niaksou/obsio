import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { withOrganisation } from '../src/db/client.js';
import { reportDocument, reportImport, reserve } from '../src/db/schema/index.js';
import { sendOverdueNotices } from '../src/reserves/overdue.js';
import type { TestClient } from './helpers.js';
import { buildTestApp, clientHelpers, resetDatabase, seedReserves } from './helpers.js';

const ctx = await buildTestApp();
const { openClient } = clientHelpers(ctx);
afterAll(() => ctx.close());

let admin: TestClient;
let organisationId: string;
let siteId: string;
let reserveIds: string[];

beforeEach(async () => {
  await resetDatabase();
  ctx.emailSender.sent.length = 0;
  ({ admin, organisationId } = await openClient('Usine Dupont', 'Alice', 'alice@dupont.fr'));
  siteId = (await admin.post('/api/sites', { name: 'Usine de Lyon' })).json().id;
  // La première réserve est en retard (échéance en 2020), les autres sans échéance.
  reserveIds = await seedReserves(ctx, organisationId, siteId, 'alice@dupont.fr', 3);
});

/** Ajoute au dernier import un compte rendu Q18 avec une constatation en danger et une non vérifiée. */
async function addQ18() {
  await withOrganisation(ctx.db, organisationId, async (tx) => {
    const [found] = await tx.select().from(reportImport);
    await tx.insert(reportDocument).values({
      organisationId,
      importId: found!.id,
      siteId,
      position: 1,
      type: 'q18',
      organisme: 'Organisme Q18',
      dateVisite: '2026-03-12',
      q18: {
        conclusion: 'risque',
        constatations: Array.from({ length: 8 }, (_, i) => ({
          numero: i + 1,
          etat: i === 4 ? 'danger_nouveau' : i === 6 ? 'non_verifie' : 'absence_danger',
        })),
      },
    });
  });
}

describe('pilotage', () => {
  it('tableau de bord : compteurs et alertes du dernier Q18', async () => {
    await addQ18();
    await withOrganisation(ctx.db, organisationId, (tx) =>
      tx.update(reserve).set({ status: 'levee' }).where(eq(reserve.id, reserveIds[2]!)),
    );
    const response = await admin.get(`/api/sites/${siteId}/dashboard`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      counts: { open: 2, overdue: 1, toVerify: 0, reconduites: 0, levees: 1 },
      unattached: 2,
      q18: { organisme: 'Organisme Q18', conclusion: 'risque', dangers: [5], nonVerifiees: [7] },
    });

    const other = await openClient('Usine Martin', 'Chloé', 'chloe@martin.fr');
    expect((await other.admin.get(`/api/sites/${siteId}/dashboard`)).statusCode).toBe(404);
  });

  it('dossier de preuves en PDF, filtrable par origine', async () => {
    // Une preuve avec photo (PNG de 1 pixel) pour vérifier son intégration au PDF.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    const post = (
      await admin.post(`/api/reserves/${reserveIds[0]}/photos`, {
        contentType: 'image/png',
        size: png.length,
      })
    ).json();
    const form = new FormData();
    for (const [name, value] of Object.entries(post.fields as Record<string, string>)) {
      form.append(name, value);
    }
    form.append('file', new Blob([png], { type: 'image/png' }));
    expect((await fetch(post.url, { method: 'POST', body: form })).ok).toBe(true);
    const proof = await admin.post(`/api/reserves/${reserveIds[0]}/proofs`, {
      clientId: crypto.randomUUID(),
      comment: 'DDR posé',
      photoKeys: [post.key],
    });
    expect(proof.statusCode).toBe(204);

    const response = await admin.get(`/api/sites/${siteId}/proof-dossier`);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');

    const levees = await admin.get(
      `/api/sites/${siteId}/proof-dossier?scope=levees&documentType=q18`,
    );
    expect(levees.statusCode).toBe(200);

    const other = await openClient('Usine Martin', 'Chloé', 'chloe@martin.fr');
    expect((await other.admin.get(`/api/sites/${siteId}/proof-dossier`)).statusCode).toBe(404);
  });

  it('relance le jour où une réserve passe en retard, puis chaque lundi', async () => {
    await withOrganisation(ctx.db, organisationId, (tx) =>
      tx.update(reserve).set({ dueDate: '2026-11-02' }).where(eq(reserve.id, reserveIds[1]!)),
    );
    // Mardi 3 novembre : la réserve dont l'échéance était lundi vient de passer en retard.
    expect(await sendOverdueNotices(ctx, '2026-11-03')).toBe(1);
    const mail = ctx.emailSender.sent.at(-1)!;
    expect(mail.to).toBe('alice@dupont.fr');
    expect(mail.subject).toBe('Usine de Lyon : 2 réserves en retard');
    expect(mail.text).toContain(`/sites/${siteId}/reserves?vue=en_retard`);

    // Mercredi : rien de nouveau, pas de relance ; lundi suivant : récapitulatif.
    expect(await sendOverdueNotices(ctx, '2026-11-04')).toBe(0);
    expect(await sendOverdueNotices(ctx, '2026-11-09')).toBe(1);
  });
});
