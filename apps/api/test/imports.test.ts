import {
  reportImportKeys,
  type ExtractionOutcome,
  type PresignedPost,
  type ProviderReport,
} from '@obsio/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { withOrganisation } from '../src/db/client.js';
import { reserve, reserveEvent, reserveSource } from '../src/db/schema/index.js';
import { buildTestApp, clientHelpers, resetDatabase, TestClient } from './helpers.js';

const ctx = await buildTestApp();
const { openClient, invite, join } = clientHelpers(ctx);
afterAll(() => ctx.close());

let admin: TestClient;
let membre: TestClient;
let organisationId: string;
let siteId: string;
let td2: string;

beforeEach(async () => {
  await resetDatabase();
  ctx.queue.jobs.length = 0;
  ctx.queue.failures.clear();
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
  td2 = (
    await admin.post(`/api/floors/${floorId}/equipment`, {
      type: 'td',
      name: 'TD2',
      aliases: ['tableau atelier'],
    })
  ).json().id;
});

const reserveFields = {
  codeObservation: null,
  preconisation: 'A réaliser.',
  articleReglementaire: 'R.4215-3',
  gravite: null,
  nouvelleOuReconduite: null,
  constatationQ18: null,
  thermique: null,
  confiance: 0.9,
};

const document = (
  type: 'periodique' | 'q18',
  reserves: ProviderReport['documents'][0]['reserves'],
) => ({
  type,
  organisme: 'Organisme de test',
  numeroRapport: null,
  dateVisite: '2026-03-12',
  site: { nom: 'Usine de Lyon', adresse: null },
  q18:
    type === 'q18'
      ? {
          constatations: Array.from({ length: 8 }, (_, i) => ({
            numero: i + 1,
            etat: i + 1 === 5 ? ('danger_nouveau' as const) : ('absence_danger' as const),
          })),
          conclusion: 'risque' as const,
        }
      : null,
  q19: null,
  reserves,
});

/** Rapport annuel : une observation sur le TD2, reprise dans le Q18 (même code d'observation). */
const report: ProviderReport = {
  documents: [
    document('periodique', [
      {
        ...reserveFields,
        reference: '1',
        codeObservation: 'OBS/1',
        description: 'Absence de dispositif différentiel 30 mA sur le circuit prises',
        localisationTexte: 'ATELIER / TD 2 / Départ 4',
        pageSource: 3,
      },
    ]),
    document('q18', [
      {
        ...reserveFields,
        reference: '1',
        codeObservation: 'OBS/1',
        description: 'Absence de DDR 30 mA',
        localisationTexte: 'ATELIER',
        pageSource: 9,
        constatationQ18: 4,
      },
    ]),
  ],
};

async function upload(post: PresignedPost, body: string) {
  const form = new FormData();
  for (const [name, value] of Object.entries(post.fields)) form.append(name, value);
  form.append('file', new Blob([body], { type: 'application/pdf' }));
  return fetch(post.url, { method: 'POST', body: form });
}

/** Dépose un PDF et crée l'import, comme le front. */
async function startImport(client = admin) {
  const post = (
    await client.post(`/api/sites/${siteId}/imports/upload`, { fileName: 'rapport.pdf', size: 20 })
  ).json() as PresignedPost;
  expect((await upload(post, '%PDF-1.7 rapport')).ok).toBe(true);
  const created = await client.post(`/api/sites/${siteId}/imports`, {
    key: post.key,
    fileName: 'rapport 2026.pdf',
  });
  expect(created.statusCode).toBe(201);
  return created.json().id as string;
}

/** Joue le rôle du worker : range le résultat de l'extraction à côté du PDF. */
async function finishExtraction(importId: string, outcome: ProviderReport | string) {
  const trace = {
    provider: 'test',
    ocrModel: 'ocr',
    extractionModel: 'llm',
    promptVersion: 'v',
    attempts: 1,
    rawOutput: '{}',
    usage: { ocrPages: 1, promptTokens: 1, completionTokens: 1 },
  };
  const result: ExtractionOutcome =
    typeof outcome === 'string'
      ? { status: 'error', finishedAt: new Date().toISOString(), error: outcome, trace }
      : { status: 'success', finishedAt: new Date().toISOString(), report: outcome, trace };
  await ctx.storage.put(
    reportImportKeys(organisationId, importId).extraction,
    JSON.stringify(result),
    'application/json',
  );
}

async function decideAll(importId: string, decision: 'retenue' | 'ecartee' = 'retenue') {
  const detail = (await admin.get(`/api/imports/${importId}`)).json();
  for (const draft of detail.drafts) {
    expect((await admin.patch(`/api/drafts/${draft.id}`, { decision })).statusCode).toBe(204);
  }
}

describe("Import d'un rapport", () => {
  it('dépôt, analyse, propositions de rapprochement, relecture puis validation', async () => {
    const importId = await startImport();
    expect(ctx.queue.jobs).toEqual([{ organisationId, importId }]);
    expect((await admin.get(`/api/imports/${importId}`)).json()).toMatchObject({
      status: 'en_analyse',
      drafts: [],
    });

    await finishExtraction(importId, report);
    const detail = (await membre.get(`/api/imports/${importId}`)).json();
    expect(detail.status).toBe('a_valider');
    expect(detail.documents.map((d: { type: string }) => d.type)).toEqual(['periodique', 'q18']);
    const [first, second, third] = detail.drafts;
    // Équipement reconnu dans la localisation, même anomalie dans le Q18, constatation 5 proposée.
    expect(first).toMatchObject({
      proposedEquipmentId: td2,
      equipmentId: td2,
      decision: 'a_valider',
    });
    expect(second).toMatchObject({ proposedMergeIntoId: first.id, mergeIntoId: first.id });
    expect(third).toMatchObject({
      origin: 'constatation_q18',
      extracted: { reference: 'Constatation 5', constatationQ18: 5 },
    });

    // Rien n'est activé sans relecture de chaque réserve.
    expect((await admin.post(`/api/imports/${importId}/validate`)).statusCode).toBe(409);
    await admin.patch(`/api/drafts/${first.id}`, { description: 'Absence de différentiel 30 mA' });
    await decideAll(importId);
    const validated = await admin.post(`/api/imports/${importId}/validate`);
    expect(validated.json()).toMatchObject({ status: 'valide', reserveCount: 2 });

    const rows = await withOrganisation(ctx.db, organisationId, async (tx) => ({
      reserves: await tx.select().from(reserve),
      sources: await tx.select().from(reserveSource),
      events: await tx.select().from(reserveEvent),
    }));
    const main = rows.reserves.find((r) => r.equipmentId === td2)!;
    expect(main).toMatchObject({ description: 'Absence de différentiel 30 mA', status: 'ouverte' });
    expect(rows.sources.filter((s) => s.reserveId === main.id)).toHaveLength(2);
    expect(rows.events.map((e) => e.type)).toEqual(['creee', 'creee']);
    // Une fois validé, l'import n'est plus modifiable.
    expect((await admin.patch(`/api/drafts/${first.id}`, { decision: 'ecartee' })).statusCode).toBe(
      400,
    );
  });

  it("propose la reconduite d'une réserve encore ouverte l'année suivante", async () => {
    const first = await startImport();
    await finishExtraction(first, { documents: [report.documents[0]!] });
    await decideAll(first);
    await admin.post(`/api/imports/${first}/validate`);
    const [previous] = await withOrganisation(ctx.db, organisationId, (tx) =>
      tx.select().from(reserve),
    );

    const next = await startImport();
    await finishExtraction(next, { documents: [report.documents[0]!] });
    const [draft] = (await admin.get(`/api/imports/${next}`)).json().drafts;
    expect(draft.proposedReconduiteDeId).toBe(previous!.id);
    await decideAll(next);
    await admin.post(`/api/imports/${next}/validate`);
    const created = await withOrganisation(ctx.db, organisationId, (tx) =>
      tx.select().from(reserve).where(eq(reserve.importId, next)),
    );
    expect(created[0]!.reconduiteDeId).toBe(previous!.id);
  });

  it('signale une extraction en erreur et permet de la relancer', async () => {
    const importId = await startImport();
    await finishExtraction(importId, 'Extraction invalide après 2 essais.');
    expect((await admin.get(`/api/imports/${importId}`)).json()).toMatchObject({
      status: 'erreur',
      error: 'Extraction invalide après 2 essais.',
    });
    const retried = await admin.post(`/api/imports/${importId}/retry`);
    expect(retried.json().status).toBe('en_analyse');
    expect(ctx.queue.jobs).toHaveLength(2);
    // Le résultat en erreur a été retiré : l'import reste en analyse jusqu'au nouveau résultat.
    expect((await admin.get(`/api/imports/${importId}`)).json().status).toBe('en_analyse');

    ctx.queue.failures.set(importId, 'PDF introuvable');
    expect((await admin.get(`/api/imports/${importId}`)).json()).toMatchObject({
      status: 'erreur',
      error: 'PDF introuvable',
    });
  });

  it("limite le nombre d'analyses par jour et par organisation", async () => {
    await startImport();
    const key = `obsio-quota:analyses:${organisationId}`;
    expect(await ctx.redis.get(key)).toBe('1');
    await ctx.redis.set(key, '20', 'EX', 3600);
    const refused = await admin.post(`/api/sites/${siteId}/imports/upload`, {
      fileName: 'rapport.pdf',
      size: 20,
    });
    expect(refused.statusCode).toBe(429);
    expect(refused.json().message).toBe(
      'Limite atteinte : 20 analyses de rapport par jour pour votre organisation. Réessayez dans 1 h.',
    );
  });

  it('réserve le dépôt et la relecture aux admins et cloisonne les organisations', async () => {
    expect(
      (await membre.post(`/api/sites/${siteId}/imports/upload`, { fileName: 'r.pdf', size: 5 }))
        .statusCode,
    ).toBe(403);
    const importId = await startImport();
    await finishExtraction(importId, report);
    const [draft] = (await membre.get(`/api/imports/${importId}`)).json().drafts;
    expect(
      (await membre.patch(`/api/drafts/${draft.id}`, { decision: 'retenue' })).statusCode,
    ).toBe(403);

    const { admin: other } = await openClient('Usine Martin', 'Carol', 'carol@martin.fr');
    expect((await other.get(`/api/imports/${importId}`)).statusCode).toBe(404);
    expect((await other.patch(`/api/drafts/${draft.id}`, { decision: 'retenue' })).statusCode).toBe(
      404,
    );
    // Clé d'un PDF d'une autre organisation : refusée.
    const otherSite = (await other.post('/api/sites', { name: 'Martin' })).json().id;
    const stolen = await other.post(`/api/sites/${otherSite}/imports`, {
      key: reportImportKeys(organisationId, importId).pdf,
      fileName: 'x.pdf',
    });
    expect(stolen.statusCode).toBe(400);
  });
});
