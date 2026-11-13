import type { ExtractedReserve } from '@obsio/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { setStaff } from '../src/console/staff.js';
import { createDatabase, withOrganisation } from '../src/db/client.js';
import {
  draftReserve,
  pageView,
  reportDocument,
  reportImport,
  user,
} from '../src/db/schema/index.js';
import { saveLicence } from '../src/licences/licence.js';
import { defaultLicence } from '@obsio/shared';
import { passkeySession } from './passkey-session.js';
import type { TestClient } from './helpers.js';
import { buildTestApp, clientHelpers, resetDatabase } from './helpers.js';

const ctx = await buildTestApp();
const { openClient } = clientHelpers(ctx);
const owner = createDatabase(process.env.TEST_DATABASE_OWNER_URL!);
afterAll(async () => {
  await owner.pool.end();
  await ctx.close();
});

let admin: TestClient;
let organisationId: string;

beforeEach(async () => {
  await resetDatabase();
  ctx.emailSender.sent.length = 0;
  ({ admin, organisationId } = await openClient('Usine Dupont', 'Alice', 'alice@dupont.fr'));
});

async function staffConsole() {
  const { admin: staff } = await openClient('Obsio', 'Camille', 'camille@obsio.fr');
  await setStaff(owner.db, 'camille@obsio.fr', true);
  return passkeySession(ctx, staff);
}

/** Analyse terminée avec sa trace, et trois brouillons tranchés : gardé, corrigé, écarté. */
async function seedAnalysis() {
  const siteId = (await admin.post('/api/sites', { name: 'Lyon' })).json().id;
  const [author] = await ctx.db.select().from(user).where(eq(user.email, 'alice@dupont.fr'));
  await withOrganisation(ctx.db, organisationId, async (tx) => {
    const [created] = await tx
      .insert(reportImport)
      .values({
        organisationId,
        siteId,
        fileName: 'rapport.pdf',
        pdfKey: 'cle',
        status: 'valide',
        createdBy: author!.id,
        trace: {
          provider: 'mistral',
          ocrModel: 'mistral-ocr',
          extractionModel: 'mistral-medium',
          promptVersion: 'v3',
          attempts: 1,
          rawOutput: '{}',
          usage: { ocrPages: 40, promptTokens: 500_000, completionTokens: 100_000 },
        },
      })
      .returning();
    await tx.insert(reportImport).values({
      organisationId,
      siteId,
      fileName: 'illisible.pdf',
      pdfKey: 'cle2',
      status: 'erreur',
      createdBy: author!.id,
    });
    const [document] = await tx
      .insert(reportDocument)
      .values({
        organisationId,
        importId: created!.id,
        siteId,
        position: 0,
        type: 'periodique',
        organisme: 'Bureau',
      })
      .returning();
    const extracted = (description: string) =>
      ({ reference: '1', description }) as unknown as ExtractedReserve;
    const draft = (
      position: number,
      text: string,
      edited: string,
      decision: 'retenue' | 'ecartee',
    ) => ({
      organisationId,
      importId: created!.id,
      documentId: document!.id,
      position,
      extracted: extracted(text),
      description: edited,
      decision,
    });
    await tx
      .insert(draftReserve)
      .values([
        draft(0, 'Absence de capot', 'Absence de capot', 'retenue'),
        draft(1, 'Prise cassee', 'Prise cassée au poste 3', 'retenue'),
        draft(2, 'Doublon', 'Doublon', 'ecartee'),
      ]);
  });
}

describe('usage dans la console', () => {
  it('compte les pages vues par modèle de page, sans utilisateur', async () => {
    expect((await admin.post('/api/usage/page', { path: '/etages/:id' })).statusCode).toBe(204);
    await admin.post('/api/usage/page', { path: '/etages/:id' });
    await admin.post('/api/usage/page', { path: '/' });
    expect((await admin.post('/api/usage/page', { path: '/console' })).statusCode).toBe(400);
    expect(
      (
        await admin.post('/api/usage/page', {
          path: '/etages/3f1c0f5e-0000-4000-8000-000000000000',
        })
      ).statusCode,
    ).toBe(400);

    // En lecture seule, le client consulte toujours : ses pages comptent.
    await withOrganisation(ctx.db, organisationId, (tx) =>
      saveLicence(tx, organisationId, { ...defaultLicence('2026-01-01'), status: 'suspendue' }),
    );
    expect((await admin.post('/api/usage/page', { path: '/' })).statusCode).toBe(204);

    const rows = await withOrganisation(ctx.db, organisationId, (tx) => tx.select().from(pageView));
    expect(rows.map((r) => [r.path, r.views]).sort()).toEqual([
      ['/', 2],
      ['/etages/:id', 2],
    ]);
    expect(Object.keys(rows[0]!).sort()).toEqual(['day', 'id', 'organisationId', 'path', 'views']);

    const staff = await staffConsole();
    const usage = (await staff.get('/api/console/usage')).json();
    expect(usage.pages).toEqual([
      { path: '/', views: 2 },
      { path: '/etages/:id', views: 2 },
    ]);
    expect(usage.days).toHaveLength(30);
    expect(usage.days.at(-1)).toMatchObject({ day: usage.to, pageViews: 4 });
    expect(usage.clients.find((c: { name: string }) => c.name === 'Usine Dupont').pageViews).toBe(
      4,
    );
  });

  it('chiffre la consommation de l’extraction et la qualité des brouillons', async () => {
    await seedAnalysis();
    const staff = await staffConsole();
    const usage = (await staff.get('/api/console/usage?days=7')).json();
    expect(usage.days).toHaveLength(7);
    // 40 pages à 2 €/1000, 0,5 M jetons à 0,4 €/M, 0,1 M à 2 €/M : 0,08 + 0,2 + 0,2.
    expect(usage.clients[0]).toMatchObject({
      name: 'Usine Dupont',
      analyses: 2,
      failures: 1,
      ocrPages: 40,
      promptTokens: 500_000,
      completionTokens: 100_000,
      cost: 0.48,
    });
    expect(usage.days.at(-1)).toMatchObject({ analyses: 2, failures: 1, cost: 0.48 });
    expect(usage.quality).toEqual([
      { model: 'mistral-medium', promptVersion: 'v3', kept: 1, edited: 1, rejected: 1 },
    ]);
  });

  it('reste réservé à l’équipe', async () => {
    expect((await admin.get('/api/console/usage')).statusCode).toBe(404);
  });
});
